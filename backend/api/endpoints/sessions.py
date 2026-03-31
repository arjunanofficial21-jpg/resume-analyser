from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from core.database import get_db
from models.chat import Session as DBSession, Message, UploadedFile
from schemas.chat import SessionCreate, SessionResponse, SessionUpdate, MessageResponse, UploadedFileResponse
import uuid
from datetime import datetime

router = APIRouter()


# ── Auth helper ──────────────────────────────────────────────────────────────

def _decode_jwt_payload(token: str) -> dict:
    """Decode a JWT without signature verification (get payload only)."""
    import base64
    import json
    try:
        # JWT structure: header.payload.signature
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Invalid JWT")
        # Add padding if needed
        payload_b64 = parts[1] + '=' * (4 - len(parts[1]) % 4)
        payload_json = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_json)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """
    Extract user_id (Google 'sub') from Bearer token.
    Returns None if no auth header is present (anonymous).
    """
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        return None
    token = authorization[len("Bearer "):]
    payload = _decode_jwt_payload(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing 'sub' claim")
    return user_id


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[SessionResponse])
def get_sessions(db: Session = Depends(get_db), user_id: Optional[str] = Depends(get_current_user)):
    query = db.query(DBSession)
    if user_id:
        query = query.filter(DBSession.user_id == user_id)
    else:
        # Anonymous: return nothing (no sign-in, no history)
        return []
    sessions = query.order_by(DBSession.created_at.desc()).all()
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
def create_session(
    session: SessionCreate,
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user),
):
    db_session = DBSession(title=session.title, user_id=user_id)
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
def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user),
):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Ownership check: only the owning user can read messages
    if session.user_id and session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    messages = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at.asc()).all()
    return messages


@router.get("/{session_id}/files/", response_model=List[UploadedFileResponse])
def get_session_files(
    session_id: str,
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user),
):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id and session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    files = db.query(UploadedFile).filter(UploadedFile.session_id == session_id).order_by(UploadedFile.created_at.asc()).all()
    return files


@router.delete("/{session_id}/")
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user),
):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id and session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(session)
    db.commit()
    # Clean up the session FAISS index folder
    import shutil, os
    faiss_path = os.path.join("faiss_index", session_id)
    if os.path.exists(faiss_path):
        shutil.rmtree(faiss_path)
    return {"message": "Session deleted"}


@router.patch("/{session_id}/", response_model=SessionResponse)
def rename_session(
    session_id: str,
    session_update: SessionUpdate,
    db: Session = Depends(get_db),
    user_id: Optional[str] = Depends(get_current_user),
):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id and session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
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
