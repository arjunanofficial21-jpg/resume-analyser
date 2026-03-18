from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from core.database import get_db
from models.chat import Session as DBSession, Message, UploadedFile
from schemas.chat import SessionCreate, SessionResponse, SessionUpdate, MessageResponse, UploadedFileResponse
import uuid
from datetime import datetime

router = APIRouter()


@router.get("/", response_model=List[SessionResponse])
def get_sessions(db: Session = Depends(get_db)):
    sessions = db.query(DBSession).order_by(DBSession.created_at.desc()).all()
    result = []
    for s in sessions:
        file_count = db.query(func.count(UploadedFile.id)).filter(UploadedFile.session_id == s.id).scalar()
        result.append(SessionResponse(
            id=s.id,
            title=s.title,
            created_at=s.created_at,
            file_count=file_count or 0,
        ))
    return result


@router.post("/", response_model=SessionResponse)
def create_session(session: SessionCreate, db: Session = Depends(get_db)):
    db_session = DBSession(title=session.title)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return SessionResponse(
        id=db_session.id,
        title=db_session.title,
        created_at=db_session.created_at,
        file_count=0,
    )


@router.get("/{session_id}/messages/", response_model=List[MessageResponse])
def get_session_messages(session_id: str, db: Session = Depends(get_db)):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at.asc()).all()
    return messages


@router.get("/{session_id}/files/", response_model=List[UploadedFileResponse])
def get_session_files(session_id: str, db: Session = Depends(get_db)):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    files = db.query(UploadedFile).filter(UploadedFile.session_id == session_id).order_by(UploadedFile.created_at.asc()).all()
    return files


@router.delete("/{session_id}/")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    # Clean up the session FAISS index folder
    import shutil, os
    faiss_path = os.path.join("faiss_index", session_id)
    if os.path.exists(faiss_path):
        shutil.rmtree(faiss_path)
    return {"message": "Session deleted"}


@router.patch("/{session_id}/", response_model=SessionResponse)
def rename_session(session_id: str, session_update: SessionUpdate, db: Session = Depends(get_db)):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = session_update.title
    db.commit()
    db.refresh(session)
    file_count = db.query(func.count(UploadedFile.id)).filter(UploadedFile.session_id == session_id).scalar()
    return SessionResponse(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        file_count=file_count or 0,
    )
