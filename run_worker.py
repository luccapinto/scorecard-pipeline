import logging

import redis
from rq import Worker, Queue

from app.config import settings
from app.logging_config import setup_logging

logger = logging.getLogger("rq.worker")


def validate_runtime_dependencies() -> None:
    """
    Fail fast at worker startup when the configured providers cannot actually
    run, instead of silently degrading (or failing mid-job hours later).
    """
    provider = settings.transcription_provider.lower()
    if provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError(
                "TRANSCRIPTION_PROVIDER=openai requires OPENAI_API_KEY to be set."
            )
    elif provider == "deepgram":
        if not settings.deepgram_api_key:
            raise RuntimeError(
                "TRANSCRIPTION_PROVIDER=deepgram requires DEEPGRAM_API_KEY to be set."
            )
    else:
        try:
            import whisperx  # noqa: F401
        except ImportError as e:
            raise RuntimeError(
                "TRANSCRIPTION_PROVIDER=local requires whisperx "
                "(pip install -r requirements-ml.txt)."
            ) from e

    # Deepgram bundles speaker diarization with transcription, so pyannote is
    # only required for the providers that return plain segments. (Interviews
    # resumed after a provider switch may still lack speakers and fail at the
    # diarization stage — an accepted edge case.)
    if provider != "deepgram":
        try:
            import pyannote.audio  # noqa: F401
        except ImportError as e:
            raise RuntimeError(
                "Diarization requires pyannote.audio (pip install -r requirements-ml.txt)."
            ) from e
        if not settings.hf_token:
            raise RuntimeError("Diarization requires HF_TOKEN to be set.")

    if not settings.openrouter_api_key:
        raise RuntimeError("Scoring requires OPENROUTER_API_KEY to be set.")


def start_worker():
    setup_logging()
    validate_runtime_dependencies()

    logger.info(f"Connecting to Redis at: {settings.redis_url}")
    redis_conn = redis.from_url(settings.redis_url)
    redis_conn.ping()
    logger.info("Connected to Redis successfully.")

    queue = Queue("default", connection=redis_conn)
    worker = Worker([queue], connection=redis_conn)
    logger.info("Starting RQ worker listening on queue: 'default'")
    worker.work()


if __name__ == "__main__":
    start_worker()
