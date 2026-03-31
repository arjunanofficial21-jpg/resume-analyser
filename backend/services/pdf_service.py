import os
import asyncio
import json
from typing import Optional
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain_community.embeddings.fastembed import FastEmbedEmbeddings
from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.messages import HumanMessage
from core.config import settings

# NEW IMPORTS FOR PGVECTOR
from langchain_community.vectorstores.pgvector import PGVector

# WE NOW USE LOCAL FASTEMBED INSTEAD OF OPENROUTER
embedding = FastEmbedEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

def _get_vector_store(collection_name: str) -> PGVector:
    """Helper to get a PGVector store connection."""
    # Ensure the connection string uses postgresql:// which SQLAlchemy requires
    connection_string = settings.DATABASE_URL.replace("postgres://", "postgresql://")
    return PGVector(
        embedding_function=embedding,
        collection_name=collection_name,
        connection_string=connection_string,
        use_jsonb=True,
    )

def _get_candidates(session_id: str) -> list:
    """Dynamically pull the candidate list from the relational database session files."""
    from core.database import SessionLocal
    from models.chat import UploadedFile
    db = SessionLocal()
    try:
        files = db.query(UploadedFile).filter(UploadedFile.session_id == session_id).all()
        candidates = []
        for f in files:
            cname = os.path.splitext(f.filename)[0].replace("_", " ").replace("-", " ")
            candidates.append({"name": cname, "filename": f.filename})
        return candidates
    finally:
        db.close()


# ── PDF processing ──────────────────────────────────────────────────────────────

def process_pdf(file_path: str, session_id: str, original_filename: str) -> Optional[str]:
    """
    Index a resume PDF using a two-index strategy natively in Postgres vector store:
      1. document_chunks  — fine-grained chunks for detailed Q&A
      2. profile_summaries — one document per candidate for broad coverage queries
    """
    loader = PyPDFLoader(file_path)
    docs = loader.load()

    candidate_name = os.path.splitext(original_filename)[0].replace("_", " ").replace("-", " ")
    for doc in docs:
        doc.metadata["candidate"] = candidate_name
        doc.metadata["filename"] = original_filename
        doc.metadata["session_id"] = session_id

    # ── 1. Chunks index ──────────────────────────────────────────────────────
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    chunks = splitter.split_documents(docs)
    for chunk in chunks:
        chunk.metadata["candidate"] = candidate_name
        chunk.metadata["filename"] = original_filename
        chunk.metadata["session_id"] = session_id

    chunks_store = _get_vector_store("document_chunks")
    chunks_store.add_documents(chunks)

    # ── 2. Profiles index ────────────────────────────────────────────────────
    full_text = "\n".join(d.page_content for d in docs)
    profile_text = full_text[:3000]
    profile_doc = Document(
        page_content=f"Candidate: {candidate_name}\n\n{profile_text}",
        metadata={"candidate": candidate_name, "filename": original_filename, "session_id": session_id}
    )

    profiles_store = _get_vector_store("profile_summaries")
    profiles_store.add_documents([profile_doc])

    suggested_title = f"{candidate_name}" if candidate_name else original_filename
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
    profiles_store = _get_vector_store("profile_summaries")
    chunks_store = _get_vector_store("document_chunks")

    candidates = _get_candidates(session_id)
    if not candidates:
        yield 'data: {"content": "No resumes uploaded yet. Please upload a PDF resume first."}\n\n'
        return

    # ── Stage 1: Profiles retrieval ──────────────────────────────────────────
    profile_k = min(len(candidates), 50)
    # The filter uses metadata dictionary match natively supported by Langchain PGVector
    profile_docs = profiles_store.similarity_search(
        question, 
        k=profile_k, 
        filter={"session_id": session_id}
    )

    # ── Stage 2: Chunks retrieval ────────────────────────────────────────────
    chunk_docs = chunks_store.similarity_search(
        question, 
        k=60, 
        filter={"session_id": session_id}
    )

    # ── Merge: profile docs first (broad), then chunk docs (detail) ──────────
    seen_candidates = set()
    merged_docs = []
    for doc in profile_docs:
        cname = doc.metadata.get("candidate", "")
        if cname not in seen_candidates:
            seen_candidates.add(cname)
            merged_docs.append(doc)
    for doc in chunk_docs:
        merged_docs.append(doc)

    context = "\n\n---\n\n".join(d.page_content for d in merged_docs)

    # ── Full roster block ─────────────────────────────────────────────────────
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
