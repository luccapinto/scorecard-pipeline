import ipaddress
import logging
import os
import socket
import tempfile
import urllib.parse
from pathlib import Path
from typing import Any, List, Dict, Optional

import httpx

from app.config import settings
from app.audio_processor import (
    LocalTranscription,
    OpenAITranscription,
    Diarizer,
    merge_transcription_and_diarization
)

logger = logging.getLogger(__name__)


def assert_public_http_url(url: str) -> None:
    """
    SSRF guard: only http(s) URLs whose host resolves exclusively to public
    addresses are allowed for download.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme for audio download: {parsed.scheme}")
    host = parsed.hostname
    if not host:
        raise ValueError("Audio URL has no hostname")
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as e:
        raise ValueError(f"Cannot resolve audio host '{host}': {e}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified):
            raise ValueError(
                f"Audio host '{host}' resolves to a non-public address ({ip}); refusing to download"
            )


def assert_allowed_local_path(path_str: str) -> Path:
    """
    Local recording paths are only accepted inside AUDIO_ALLOWED_DIR when it is
    configured. An empty setting allows any existing path (dev mode only).
    """
    path = Path(path_str).resolve()
    if settings.audio_allowed_dir:
        allowed = Path(settings.audio_allowed_dir).resolve()
        if not path.is_relative_to(allowed):
            raise ValueError(
                f"Local recording path is outside the allowed directory '{allowed}'"
            )
    else:
        logger.warning(
            "AUDIO_ALLOWED_DIR is not set; accepting arbitrary local path (dev mode only)."
        )
    if not path.exists():
        raise FileNotFoundError(f"Local recording path does not exist: {path}")
    return path


def download_audio(url: str) -> Path:
    """
    Streams a remote audio file to a temporary local file, enforcing the SSRF
    guard, a download timeout and a maximum size limit.
    """
    assert_public_http_url(url)
    logger.info(f"Downloading audio from URL: {url}")
    suffix = Path(urllib.parse.urlparse(url).path).suffix or ".wav"
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    written = 0
    try:
        with httpx.stream(
            "GET", url,
            timeout=settings.download_timeout_seconds,
            follow_redirects=False,
        ) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes():
                written += len(chunk)
                if written > settings.max_audio_bytes:
                    raise ValueError(
                        f"Audio download exceeded the maximum size of "
                        f"{settings.max_audio_bytes} bytes"
                    )
                temp_file.write(chunk)
        temp_file.close()
        return Path(temp_file.name)
    except Exception:
        temp_file.close()
        os.unlink(temp_file.name)
        raise


class AudioSource:
    """
    Lazily resolves a recording_url to a local file path, downloading remote
    audio at most once per job. Call cleanup() when done.
    """
    def __init__(self, recording_url: str):
        self.recording_url = recording_url
        self._path: Optional[Path] = None
        self._is_temp = False

    def path(self) -> Path:
        if self._path is None:
            if self.recording_url.startswith(("http://", "https://")):
                self._path = download_audio(self.recording_url)
                self._is_temp = True
            else:
                self._path = assert_allowed_local_path(self.recording_url)
        return self._path

    def cleanup(self) -> None:
        if self._is_temp and self._path and self._path.exists():
            try:
                os.remove(self._path)
                logger.info(f"Deleted temp audio file: {self._path}")
            except OSError as e:
                logger.warning(f"Failed to delete temp file {self._path}: {e}")
        self._path = None
        self._is_temp = False

    def __enter__(self) -> "AudioSource":
        return self

    def __exit__(self, *exc_info) -> None:
        self.cleanup()


def get_transcriber() -> Any:
    provider = settings.transcription_provider.lower()
    if provider == "openai":
        return OpenAITranscription(api_key=settings.openai_api_key)
    return LocalTranscription(
        model_name=settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type
    )


def transcribe_audio(audio_path: Path) -> List[Dict[str, Any]]:
    """
    Transcribes a local audio file using the configured provider.
    Returns a list of dicts: [{"text": str, "start": float, "end": float}]
    """
    logger.info(f"Transcribing audio file {audio_path}")
    return get_transcriber().transcribe(audio_path)


def diarize_audio(audio_path: Path, transcription_raw: Any = None) -> List[Dict[str, Any]]:
    """
    Runs diarization on a local audio file. If transcription_raw is provided,
    merges speaker labels with transcribed segments.
    """
    logger.info(f"Diarizing audio file {audio_path}")
    diarizer = Diarizer(hf_token=settings.hf_token)
    diarization_result = diarizer.diarize(audio_path)

    if transcription_raw:
        # Normalize transcription_raw to List[Dict]
        tx_segments = []
        if isinstance(transcription_raw, list):
            tx_segments = transcription_raw
        elif isinstance(transcription_raw, dict):
            if "segments" in transcription_raw:
                tx_segments = transcription_raw["segments"]
            elif "text" in transcription_raw:
                # Dummy segment
                tx_segments = [{"text": transcription_raw["text"], "start": 0.0, "end": 600.0}]

        return merge_transcription_and_diarization(tx_segments, diarization_result)
    return diarization_result


def score_interview(transcription: Any, diarization: Any, job_id: str) -> dict:
    """
    Evaluates candidate performance on competencies based on job context files,
    using OpenRouter and running evidence verification.
    """
    from app.scoring import ContextAggregator, ScoringEngine, EvidenceValidator

    logger.info(f"Loading context files for job_id: {job_id}")
    aggregator = ContextAggregator()
    context = aggregator.load_context(job_id)

    logger.info("Evaluating interview scoring...")
    engine = ScoringEngine()
    scorecard = engine.evaluate(
        transcription_raw=transcription,
        context=context,
        diarization_raw=diarization,
    )

    # Post-process and validate evidence quotes against transcript
    for eval_item in scorecard.evaluations:
        is_verified = EvidenceValidator.validate_evidence(
            evidence_quote=eval_item.evidence_quote,
            transcription_raw=transcription
        )
        eval_item.evidence_verified = is_verified

    return scorecard.model_dump()


def notify_approval(interview_id: Any) -> None:
    """
    Dispatches notifications containing the evaluation scorecard.
    """
    import uuid
    from sqlmodel import Session
    from app.database import engine
    from app.models import Interview
    from app.notifications import NotificationDispatcher

    if isinstance(interview_id, str):
        interview_id_uuid = uuid.UUID(interview_id)
    else:
        interview_id_uuid = interview_id

    with Session(engine) as session:
        interview = session.get(Interview, interview_id_uuid)
        if not interview:
            logger.error(f"Interview {interview_id_uuid} not found for notification.")
            return
        if not interview.scorecard:
            logger.warning(f"Interview {interview_id_uuid} has no scorecard, cannot notify.")
            return

        logger.info(f"Dispatching notifications for interview {interview_id_uuid}")
        dispatcher = NotificationDispatcher()
        dispatcher.dispatch(
            interview_id_uuid,
            interview.scorecard,
            approval_token=interview.approval_token,
        )
