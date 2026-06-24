import os
import logging
import tempfile
from pathlib import Path
import httpx
from typing import Any, List, Dict

from app.config import settings
from app.audio_processor import (
    LocalTranscription,
    OpenAITranscription,
    Diarizer,
    merge_transcription_and_diarization
)

logger = logging.getLogger(__name__)

def resolve_audio_path(recording_url: str) -> Path:
    """
    If recording_url is a web URL, downloads it to a temporary file.
    Otherwise, returns the path directly.
    """
    if recording_url.startswith("http://") or recording_url.startswith("https://"):
        logger.info(f"Downloading audio from URL: {recording_url}")
        response = httpx.get(recording_url)
        response.raise_for_status()
        
        # Write to temporary file
        suffix = Path(recording_url).suffix or ".wav"
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        temp_file.write(response.content)
        temp_file.close()
        return Path(temp_file.name)
    else:
        # Local path
        return Path(recording_url)

def transcribe_audio(recording_url: str) -> List[Dict[str, Any]]:
    """
    Transcribes the audio using the configured provider.
    Returns a list of dicts: [{"text": str, "start": float, "end": float}]
    """
    logger.info(f"Transcribing audio from {recording_url}")
    local_path = resolve_audio_path(recording_url)
    
    try:
        provider = settings.transcription_provider.lower()
        if provider == "openai":
            transcriber = OpenAITranscription(api_key=settings.openai_api_key)
        else:
            # local
            transcriber = LocalTranscription(
                model_name=settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type
            )
            
        return transcriber.transcribe(local_path)
    finally:
        # Clean up temp file if one was downloaded
        if local_path != Path(recording_url) and local_path.exists():
            try:
                os.remove(local_path)
                logger.info(f"Deleted temp audio file: {local_path}")
            except Exception as e:
                logger.warning(f"Failed to delete temp file {local_path}: {e}")

def diarize_audio(recording_url: str, transcription_raw: Any = None) -> List[Dict[str, Any]]:
    """
    Runs diarization on the audio. If transcription_raw is provided,
    merges speaker labels with transcribed segments.
    """
    logger.info(f"Diarizing audio from {recording_url}")
    local_path = resolve_audio_path(recording_url)
    
    try:
        diarizer = Diarizer(hf_token=settings.hf_token)
        diarization_result = diarizer.diarize(local_path)
        
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
            
            merged_result = merge_transcription_and_diarization(tx_segments, diarization_result)
            return merged_result
        else:
            return diarization_result
    finally:
        # Clean up temp file if one was downloaded
        if local_path != Path(recording_url) and local_path.exists():
            try:
                os.remove(local_path)
                logger.info(f"Deleted temp audio file: {local_path}")
            except Exception as e:
                logger.warning(f"Failed to delete temp file {local_path}: {e}")

def score_interview(transcription: Any, diarization: Any, job_id: str) -> dict:
    """Stub for scoring service (Milestone 4)."""
    logger.info(f"Scoring interview for job_id {job_id}")
    return {
        "competencies": [
            {"name": "Comunicação e Code-switching", "score": 4, "evidence": "Candidato usou termos em ingles com propriedade."},
            {"name": "Conhecimento de Infraestrutura e Banco de Dados", "score": 3, "evidence": "Demonstrou conhecimento basico de Postgres e Redis."}
        ]
    }

def notify_approval(interview_id: str) -> None:
    """Stub for notification service (Milestone 4)."""
    logger.info(f"Notifying approval for interview {interview_id}")
