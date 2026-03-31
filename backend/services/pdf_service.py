import os
import asyncio
import json
from typing import Optional
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain.callbacks.base import AsyncCallbackHandler
from langchain_core.messages import HumanMessage
from core.config import settings

FAISS_BASE = "faiss_index"
CANDIDATES_FILE = "candidates.json"

# ── In-memory caches ────────────────────────────────────────────────────────────
# _chunks_cache   : session_id → FAISS store of all resume chunks (detailed info)
# _profiles_cache : session_id → FAISS store of one-doc-per-candidate summaries
# _candidate_cache: session_id → list of {name, filename} dicts
_chunks_cache: dict = {}
_profiles_cache: dict = {}
_candidate_cache: dict = {}

embedding = OpenAIEmbeddings(
    openai_api_key=settings.OPENROUTER_API_KEY,
    openai_api_base="https://openrouter.ai/api/v1",
    model="text-embedding-3-small"
)


def get_session_path(session_id: str) -> str:
    path = os.path.join(FAISS_BASE, session_id)
    os.makedirs(path, exist_ok=True)
    return path


def _chunks_index_path(session_id: str) -> str:
    return os.path.join(get_session_path(session_id), "chunks_index")


def _profiles_index_path(session_id: str) -> str:
    return os.path.join(get_session_path(session_id), "profiles_index")


# ── Candidate registry ──────────────────────────────────────────────────────────

def _load_candidates_from_disk(session_id: str) -> list:
    path = os.path.join(get_session_path(session_id), CANDIDATES_FILE)
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return []


def _save_candidates_to_disk(session_id: str, candidates: list) -> None:
    path = os.path.join(get_session_path(session_id), CANDIDATES_FILE)
    with open(path, "w") as f:
        json.dump(candidates, f)


def _get_candidates(session_id: str) -> list:
    if session_id not in _candidate_cache:
        _candidate_cache[session_id] = _load_candidates_from_disk(session_id)
    return _candidate_cache[session_id]


def _add_candidate(session_id: str, candidate_name: str, filename: str) -> None:
    candidates = _get_candidates(session_id)
    entry = {"name": candidate_name, "filename": filename}
    if entry not in candidates:
        candidates.append(entry)
    _candidate_cache[session_id] = candidates
    _save_candidates_to_disk(session_id, candidates)


# ── FAISS load helpers ──────────────────────────────────────────────────────────

def _load_chunks_index(session_id: str) -> Optional[object]:
    path = _chunks_index_path(session_id)
    if os.path.exists(os.path.join(path, "index.faiss")):
        return FAISS.load_local(path, embedding, allow_dangerous_deserialization=True)
    return None


def _load_profiles_index(session_id: str) -> Optional[object]:
    path = _profiles_index_path(session_id)
    if os.path.exists(os.path.join(path, "index.faiss")):
        return FAISS.load_local(path, embedding, allow_dangerous_deserialization=True)
    return None


def _get_chunks_db(session_id: str) -> Optional[object]:
    if session_id not in _chunks_cache:
        db = _load_chunks_index(session_id)
        if db:
            _chunks_cache[session_id] = db
    return _chunks_cache.get(session_id)


def _get_profiles_db(session_id: str) -> Optional[object]:
    if session_id not in _profiles_cache:
        db = _load_profiles_index(session_id)
        if db:
            _profiles_cache[session_id] = db
    return _profiles_cache.get(session_id)


# ── PDF processing ──────────────────────────────────────────────────────────────

def process_pdf(file_path: str, session_id: str, original_filename: str) -> Optional[str]:
    """
    Index a resume PDF using a two-index strategy:
      1. Chunks index  — fine-grained chunks for detailed Q&A
      2. Profiles index — one document per candidate for broad coverage queries
    """
    loader = PyPDFLoader(file_path)
    docs = loader.load()

    candidate_name = os.path.splitext(original_filename)[0].replace("_", " ").replace("-", " ")
    for doc in docs:
        doc.metadata["candidate"] = candidate_name
        doc.metadata["filename"] = original_filename

    # ── 1. Chunks index ──────────────────────────────────────────────────────
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    chunks = splitter.split_documents(docs)
    for chunk in chunks:
        chunk.metadata["candidate"] = candidate_name
        chunk.metadata["filename"] = original_filename

    chunks_path = _chunks_index_path(session_id)
    os.makedirs(chunks_path, exist_ok=True)
    if session_id in _chunks_cache:
        db = _chunks_cache[session_id]
        db.add_documents(chunks)
    elif os.path.exists(os.path.join(chunks_path, "index.faiss")):
        db = FAISS.load_local(chunks_path, embedding, allow_dangerous_deserialization=True)
        db.add_documents(chunks)
    else:
        db = FAISS.from_documents(chunks, embedding)
    db.save_local(chunks_path)
    _chunks_cache[session_id] = db

    # ── 2. Profiles index ────────────────────────────────────────────────────
    # Summarise the whole resume into ONE document (first 3000 chars of full text)
    full_text = "\n".join(d.page_content for d in docs)
    profile_text = full_text[:3000]   # ~600-700 tokens — enough for skills/exp/edu
    profile_doc = Document(
        page_content=f"Candidate: {candidate_name}\n\n{profile_text}",
        metadata={"candidate": candidate_name, "filename": original_filename}
    )

    profiles_path = _profiles_index_path(session_id)
    os.makedirs(profiles_path, exist_ok=True)
    if session_id in _profiles_cache:
        pdb = _profiles_cache[session_id]
        pdb.add_documents([profile_doc])
    elif os.path.exists(os.path.join(profiles_path, "index.faiss")):
        pdb = FAISS.load_local(profiles_path, embedding, allow_dangerous_deserialization=True)
        pdb.add_documents([profile_doc])
    else:
        pdb = FAISS.from_documents([profile_doc], embedding)
    pdb.save_local(profiles_path)
    _profiles_cache[session_id] = pdb

    # ── Candidate registry ────────────────────────────────────────────────────
    _add_candidate(session_id, candidate_name, original_filename)

    suggested_title = None
    if docs:
        lines = [l.strip() for l in docs[0].page_content.split("\n") if l.strip()]
        if lines:
            suggested_title = lines[0][:40]
    return suggested_title


# ── Streaming callback ──────────────────────────────────────────────────────────

class AsyncIteratorCallbackHandler(AsyncCallbackHandler):
    def __init__(self):
        super().__init__()
        self.queue = asyncio.Queue()
        self.done = asyncio.Event()

    async def on_llm_new_token(self, token: str, **kwargs) -> None:
        await self.queue.put(token)

    async def on_llm_end(self, response, **kwargs) -> None:
        self.done.set()

    async def wait_for_data(self):
        data_task = asyncio.create_task(self.queue.get())
        done_task = asyncio.create_task(self.done.wait())
        done, _ = await asyncio.wait([data_task, done_task], return_when=asyncio.FIRST_COMPLETED)
        if data_task in done:
            done_task.cancel()
            return data_task.result()
        if done_task in done and self.queue.empty():
            data_task.cancel()
            return None


# ── Q&A streaming ───────────────────────────────────────────────────────────────

async def ask_question_stream(question: str, model_name: str, session_id: str, chat_history: list = []):
    """
    Two-stage retrieval strategy:
      Stage 1 – Profiles index: retrieve up to 50 candidate profiles (one doc per candidate).
                This gives broad coverage across all 500 resumes.
      Stage 2 – Chunks index:  retrieve up to 60 detailed chunks for deep-dive answers.
      Combined context is deduplicated by candidate and passed to the LLM.
    """
    # Ensure at least one index exists
    profiles_db = _get_profiles_db(session_id)
    chunks_db = _get_chunks_db(session_id)

    if not profiles_db and not chunks_db:
        yield 'data: {"content": "No resumes uploaded yet. Please upload a PDF resume first."}\n\n'
        return

    # ── Stage 1: Profiles retrieval ──────────────────────────────────────────
    profile_docs = []
    if profiles_db:
        # k up to total candidates, capped at 50 to stay within context limits
        candidates = _get_candidates(session_id)
        profile_k = min(len(candidates), 50)
        profile_docs = profiles_db.similarity_search(question, k=profile_k)

    # ── Stage 2: Chunks retrieval ────────────────────────────────────────────
    chunk_docs = []
    if chunks_db:
        chunk_docs = chunks_db.similarity_search(question, k=60)

    # ── Merge: profile docs first (broad), then chunk docs (detail) ──────────
    seen_candidates = set()
    merged_docs = []
    for doc in profile_docs:
        cname = doc.metadata.get("candidate", "")
        if cname not in seen_candidates:
            seen_candidates.add(cname)
            merged_docs.append(doc)
    for doc in chunk_docs:
        merged_docs.append(doc)  # Include all chunks for additional detail

    context = "\n\n---\n\n".join(d.page_content for d in merged_docs)

    # ── Full roster block ─────────────────────────────────────────────────────
    candidates = _get_candidates(session_id)
    roster_block = ""
    if candidates:
        roster_lines = [f"{i+1}. {c['name']}" for i, c in enumerate(candidates)]
        roster_block = (
            "\n\nFULL CANDIDATE ROSTER (every uploaded resume — use this for listing/counting):\n"
            + "\n".join(roster_lines)
        )

    # ── Conversation history ──────────────────────────────────────────────────
    history_block = ""
    if chat_history:
        lines = []
        for msg in chat_history:
            role_label = "Recruiter" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role_label}: {msg['content']}")
        history_block = "\n\nPrevious Conversation:\n" + "\n".join(lines)

    # ── Build prompt and call LLM ─────────────────────────────────────────────
    system_prompt = f"""You are an expert Hiring Assistant and Resume Analyst helping recruiters make data-driven hiring decisions.

INSTRUCTIONS:
- Use the Resume Context below to answer all questions.
- The FULL CANDIDATE ROSTER lists every uploaded candidate. Use it for listing names or counting.
- For "best candidate" or "top candidates for X" questions: rank and compare based on the profiles provided in context.
- When asked for tables (skills, experience, education), format as a markdown table.
- Be specific — mention candidate names, their skills, years of experience, and key achievements.
- Use bullet points or tables for structured answers.
- Use the Previous Conversation for follow-up question context.{roster_block}{history_block}

Resume Context (profiles + detailed chunks):
{context}

Recruiter Question: {question}

Hiring Assistant Answer:"""

    callback = AsyncIteratorCallbackHandler()
    llm = ChatOpenAI(
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base="https://openrouter.ai/api/v1",
        model_name=model_name,
        streaming=True,
        callbacks=[callback]
    )

    task = asyncio.create_task(llm.agenerate([[HumanMessage(content=system_prompt)]]))

    try:
        while True:
            token = await callback.wait_for_data()
            if token is None:
                break
            safe_token = json.dumps({"content": token})
            yield f"data: {safe_token}\n\n"
    finally:
        await task
