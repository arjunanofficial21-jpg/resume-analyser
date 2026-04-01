from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "PDF RAG App"
    DATABASE_URL: str
    OPENROUTER_API_KEY: str

    class Config:
        env_file = ".env"

settings = Settings()
