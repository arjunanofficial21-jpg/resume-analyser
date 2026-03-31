# Backend Architecture & Execution Guide

This document provides a concise, technical overview of the backend for AI agents or developers.

## Tech Stack
- **Framework**: FastAPI (Python 3)
- **Database / Vector DB**: PostgreSQL with pgvector (Supabase connection expected via `DATABASE_URL`)
- **ORM**: SQLAlchemy (`models/chat.py`, `schemas/chat.py`)
- **LLM/Embeddings**: OpenAI format via OpenRouter (`ChatOpenAI`, `OpenAIEmbeddings`)
- **Document Parsing**: `PyPDFLoader` (Langchain)

## Core Mechanisms

### 1. Authentication (Google OAuth)
- The frontend handles Google OAuth and receives a JWT (`credential`).
- The frontend sends this JWT in the `Authorization: Bearer <token>` header on every request.
- The backend `get_current_user` dependency (in `api/endpoints/sessions.py`) decodes the JWT payload to extract the `sub` (Google User ID) without making a network call.
- All database queries for `Session`, `Message`, and `UploadedFile` are filtered by `user_id == sub` to ensure strict multi-tenant isolation. 

### 2. PDF Processing & Vector Indexing (`services/pdf_service.py`)
When a PDF resume is uploaded (`POST /pdf/upload/`), the backend creates two vector collections per session in pgvector to optimize RAG:
1. **document_chunks**: Deep-dive granular chunks (800 chars, 150 overlap) for specific Q&A.
2. **profile_summaries**: A single summary document per candidate (first 3000 chars of the resume) for broad queries (e.g., "Compare all candidates").
- The vectors are automatically associated with the `session_id` using metadata filtering.

### 3. Streaming Chat (`POST /pdf/chat/`)
- Uses Server-Sent Events (SSE) to stream tokens back to the client.
- **Two-stage retrieval**: 
  - Retrieves up to 50 general profiles (Stage 1).
  - Retrieves up to 60 specific chunks (Stage 2).
  - Deduplicates and injects a "Full Candidate Roster" and "Previous Conversation" into the prompt.
- Handled by `AsyncIteratorCallbackHandler` for real-time text yielding.

## Execution

1. **Environment Setup**: 
   Ensure `backend/.env` contains your Supabase `DATABASE_URL` (starting with `postgresql://`) and `OPENROUTER_API_KEY`.

2. **Run Everything**:
   From the project root (one level up from this folder):
   ```bash
   ./run.sh
   # This script activates the venv, exports PYTHONPATH=., runs uvicorn on port 8000, and starts the Vite frontend.
   ```

3. **Run Backend Only**:
   ```bash
   cd backend
   source venv/bin/activate
   export PYTHONPATH=.
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

## Directory Structure
- `api/endpoints/`: FastAPI routers (`pdf.py`, `sessions.py`).
- `core/`: Config (`settings`) and DB connection (`get_db`).
- `models/`: SQLAlchemy tables (`chat.py`).
- `schemas/`: Pydantic validation models.
- `services/`: Business logic (`pdf_service.py`).
