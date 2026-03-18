from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Dict

class SessionCreate(BaseModel):
    title: str

class SessionResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    file_count: Optional[int] = 0

    class Config:
        from_attributes = True

class SessionUpdate(BaseModel):
    title: str

class MessageBase(BaseModel):
    role: str
    content: str
    session_id: str

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    question: str
    session_id: str
    preferred_model: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = []  # [{"role": "user"|"ai", "content": "..."}]

class UploadedFileResponse(BaseModel):
    id: str
    session_id: str
    filename: str
    created_at: datetime

    class Config:
        from_attributes = True
