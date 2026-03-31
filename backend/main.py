from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.database import engine, Base
from api.endpoints import pdf, sessions
import uvicorn
import os

# Create all tables in the database
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PDF RAG App")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Replace old app endpoints with Routers
app.include_router(pdf.router, prefix="/pdf", tags=["pdf"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
