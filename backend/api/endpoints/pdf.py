import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from core.database import get_db
from models.chat import Session as DBSession, Message, UploadedFile
from schemas.chat import ChatRequest
from services.pdf_service import process_pdf, ask_question_stream

router = APIRouter()


@router.post("/upload/")
async def upload_pdfs(
    session_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """Upload one or more PDFs into a session's vector store.
    Files are processed sequentially to avoid FAISS race conditions.
    """
    # Verify session exists
    db_session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    results = []
    first_suggested_title = None

    for file in files:
        # Use a unique temp filename to avoid collisions
        temp_name = f"temp_{uuid.uuid4().hex}_{file.filename}"
        file_path = temp_name

        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            suggested_title = process_pdf(file_path, session_id, file.filename)
            if suggested_title and first_suggested_title is None:
                first_suggested_title = suggested_title

            # Save file record to DB
            file_record = UploadedFile(
                session_id=session_id,
                filename=file.filename
            )
            db.add(file_record)

            # Save a "files" message entry
            msg = Message(
                session_id=session_id,
                role="files",
                content=file.filename
            )
            db.add(msg)
            db.commit()

            results.append({"filename": file.filename, "success": True})

        except Exception as e:
            results.append({"filename": file.filename, "success": False, "error": str(e)})
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)

    success_count = sum(1 for r in results if r["success"])
    return {
        "message": f"{success_count}/{len(files)} PDF(s) processed successfully",
        "suggested_title": first_suggested_title,
        "results": results
    }


@router.post("/chat/")
async def chat_with_document(
    request: ChatRequest,
    db: Session = Depends(get_db)
):
    # Verify session exists
    db_session = db.query(DBSession).filter(DBSession.id == request.session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Fetch the last 6 user/ai messages for conversation memory (exclude 'files' role)
    recent_messages = (
        db.query(Message)
        .filter(Message.session_id == request.session_id, Message.role.in_(["user", "ai"]))
        .order_by(Message.created_at.desc())
        .limit(6)
        .all()
    )
    # Reverse so oldest-first for the prompt
    chat_history = [{"role": m.role, "content": m.content} for m in reversed(recent_messages)]

    # Save the user query
    user_msg = Message(
        session_id=request.session_id,
        role="user",
        content=request.question
    )
    db.add(user_msg)
    db.commit()

    model_name = request.preferred_model or "stepfun/step-3.5-flash:free"

    async def sse_generator():
        full_response = ""
        try:
            async for chunk in ask_question_stream(
                request.question, model_name, request.session_id, chat_history
            ):
                import json
                try:
                    data = json.loads(chunk[6:-2])
                    if "content" in data:
                        full_response += data["content"]
                except Exception:
                    pass
                yield chunk

            # Save AI response to DB
            from core.database import SessionLocal
            with SessionLocal() as local_db:
                local_db.add(Message(
                    session_id=request.session_id,
                    role="ai",
                    content=full_response
                ))
                local_db.commit()

        except Exception as e:
            yield f'data: {{"error": "{str(e)}"}}\n\n'

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
