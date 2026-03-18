from fastapi import FastAPI, UploadFile, File
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import OpenAIEmbeddings
from langchain.chains import RetrievalQA
from langchain_community.chat_models import ChatOpenAI
from langchain.prompts import PromptTemplate
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil

app = FastAPI()

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

FAISS_PATH = "faiss_index"

# LLM (OpenRouter)
llm = ChatOpenAI(
    openai_api_key=os.getenv("OPENROUTER_API_KEY", "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"),
    openai_api_base="https://openrouter.ai/api/v1",
    model_name="stepfun/step-3.5-flash:free"
)

# Embeddings
embedding = OpenAIEmbeddings(
    openai_api_key=os.getenv("OPENROUTER_API_KEY", "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"),
    openai_api_base="https://openrouter.ai/api/v1",
    model="text-embedding-3-small"
)

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    file_path = f"temp_{file.filename}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    loader = PyPDFLoader(file_path)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150
    )
    chunks = splitter.split_documents(docs)

    if os.path.exists(FAISS_PATH):
        vectordb = FAISS.load_local(FAISS_PATH, embedding, allow_dangerous_deserialization=True)
        vectordb.add_documents(chunks)
    else:
        vectordb = FAISS.from_documents(chunks, embedding)
        
    vectordb.save_local(FAISS_PATH)

    # Clean up temp file
    if os.path.exists(file_path):
        os.remove(file_path)

    return {"message": "PDF processed successfully"}

class Query(BaseModel):
    question: str

prompt_template = """
You are a PDF assistant.

Use ONLY the context below.

If not found, say "Not in document".

Context:
{context}

Question:
{question}

Answer:
"""

PROMPT = PromptTemplate(
    template=prompt_template,
    input_variables=["context", "question"]
)

@app.post("/ask")
def ask_question(query: Query):
    if not os.path.exists(FAISS_PATH):
        return {"answer": "No documents have been uploaded yet. Please upload a PDF first."}

    vectordb = FAISS.load_local(
        FAISS_PATH,
        embedding,
        allow_dangerous_deserialization=True
    )

    retriever = vectordb.as_retriever(search_kwargs={"k": 3})

    qa = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        chain_type_kwargs={"prompt": PROMPT}
    )

    result = qa.run(query.question)

    return {"answer": result}
