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
    whisper_language: str = "pt"
    whisper_batch_size: int = 8

    # OpenRouter, Jobs Context and Notifications
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.5-flash"
    jobs_dir: str = "data/synthetic"
    slack_webhook_url: str = ""
    notification_webhook_url: str = ""
    api_base_url: str = "http://localhost:8000"

    # Security
    # HMAC secret for webhook signature verification. When empty, verification
    # is skipped (dev mode only — always set in production).
    webhook_hmac_secret: str = ""
    # API key required on read/action endpoints. When empty, auth is skipped
    # (dev mode only — always set in production).
    api_key: str = ""
    # When set, local recording paths are only accepted inside this directory.
    # When empty, any existing local path is accepted (dev mode only).
    audio_allowed_dir: str = ""

    # Job processing
    job_timeout_seconds: int = 7200
    job_max_retries: int = 3
    download_timeout_seconds: int = 60
    max_audio_bytes: int = 500 * 1024 * 1024  # 500 MB

    # Evidence validation (fuzzy match threshold, 0-100)
    evidence_match_threshold: int = 90

    # Maintenance
    stale_recebida_max_age_minutes: int = 15
    # Interviews in a terminal state older than this many days are purged.
    # 0 disables retention purging.
    retention_days: int = 0

    # Logging
    log_json: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
