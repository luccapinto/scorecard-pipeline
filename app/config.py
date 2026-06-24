from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres_secure_pass@localhost:5432/scorecard_db"
    redis_url: str = "redis://localhost:6379/0"
    transcription_provider: str = "local"
    openai_api_key: str = ""
    hf_token: str = ""
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"


    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
