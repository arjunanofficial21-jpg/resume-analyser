import os
import asyncio
import json
from typing import Optional
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA
from langchain.callbacks.base import AsyncCallbackHandler
from core.config import settings

FAISS_BASE = "faiss_index"

embedding = OpenAIEmbeddings(
    openai_api_key=settings.OPENROUTER_API_KEY,
    openai_api_base="https://openrouter.ai/api/v1",
    model="text-embedding-3-small"
)


def get_faiss_path(session_id: str) -> str:
    path = os.path.join(FAISS_BASE, session_id)
    os.makedirs(path, exist_ok=True)
    return path


def process_pdf(file_path: str, session_id: str, original_filename: str) -> Optional[str]:
    """Load, chunk and index a resume PDF into the session-scoped FAISS index."""
    loader = PyPDFLoader(file_path)
    docs = loader.load()

    # Tag each chunk with the candidate name (from filename) so AI can reference it
    candidate_name = os.path.splitext(original_filename)[0].replace("_", " ").replace("-", " ")
    for doc in docs:
        doc.metadata["candidate"] = candidate_name
        doc.metadata["filename"] = original_filename

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
    chunks = splitter.split_documents(docs)
    for chunk in chunks:
        chunk.metadata["candidate"] = candidate_name
        chunk.metadata["filename"] = original_filename

    faiss_path = get_faiss_path(session_id)
    if os.path.exists(os.path.join(faiss_path, "index.faiss")):
        vectordb = FAISS.load_local(faiss_path, embedding, allow_dangerous_deserialization=True)
        vectordb.add_documents(chunks)
    else:
        vectordb = FAISS.from_documents(chunks, embedding)
    vectordb.save_local(faiss_path)

    # Suggest a title from the first non-empty line of the first page
    suggested_title = None
    if docs:
        lines = [l.strip() for l in docs[0].page_content.split("\n") if l.strip()]
        if lines:
            suggested_title = lines[0][:40]
    return suggested_title


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


async def ask_question_stream(question: str, model_name: str, session_id: str, chat_history: list = []):
    """Stream an answer grounded in the session's uploaded resumes, with conversation memory."""
    faiss_path = get_faiss_path(session_id)

    if not os.path.exists(os.path.join(faiss_path, "index.faiss")):
        yield 'data: {"content": "No resumes uploaded yet. Please upload a PDF resume first."}\n\n'
        return

    vectordb = FAISS.load_local(faiss_path, embedding, allow_dangerous_deserialization=True)

    # k=20 ensures coverage across many uploaded resumes.
    # With k=6 and 12 resumes, only 1-2 candidates were visible to the AI.
    retriever = vectordb.as_retriever(search_kwargs={"k": 20})

    callback = AsyncIteratorCallbackHandler()

    llm = ChatOpenAI(
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base="https://openrouter.ai/api/v1",
        model_name=model_name,
        streaming=True,
        callbacks=[callback]
    )

    # Build conversation history block (if any)
    history_block = ""
    if chat_history:
        lines = []
        for msg in chat_history:
            role_label = "Recruiter" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role_label}: {msg['content']}")
        history_block = "\n\nPrevious Conversation:\n" + "\n".join(lines)

    prompt_template = f"""You are an expert Hiring Assistant and Resume Analyst helping recruiters make data-driven hiring decisions.

INSTRUCTIONS:
- Answer ONLY using information from the provided resume context below.
- If information is not in the context, say: "This information is not available in the uploaded resume(s)."
- For candidate comparison questions, compare all candidates visible in the context.
- When asked for tables (years of experience, skills, education), format as a markdown table.
- When asked "who is best for <role>", rank candidates by relevance and explain why.
- Focus on: skills, work experience, education, certifications, projects, achievements.
- Be concise and structured — use bullet points or tables where appropriate.
- Use the Previous Conversation below to answer follow-up questions correctly.{history_block}

Resume Context:
{{context}}

Recruiter Question: {{question}}

Hiring Assistant Answer:"""

    PROMPT = PromptTemplate(template=prompt_template, input_variables=["context", "question"])

    qa = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        chain_type_kwargs={"prompt": PROMPT}
    )

    task = asyncio.create_task(qa.arun(question))


    try:
        while True:
            token = await callback.wait_for_data()
            if token is None:
                break
            safe_token = json.dumps({"content": token})
            yield f"data: {safe_token}\n\n"
    finally:
        await task
