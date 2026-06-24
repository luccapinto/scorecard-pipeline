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
    
    # OpenRouter, Jobs Context and Notifications
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.5-flash"
    jobs_dir: str = "data/synthetic"
    slack_webhook_url: str = ""
    notification_webhook_url: str = ""


    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
