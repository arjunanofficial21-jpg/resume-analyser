from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "PDF RAG App"
    DATABASE_URL: str = "postgresql://sketchbrahma@localhost/pdf_analysis"
    OPENROUTER_API_KEY: str = "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"

    class Config:
        env_file = ".env"

settings = Settings()
