import logging

logger = logging.getLogger(__name__)

def transcribe_audio(recording_url: str) -> dict:
    """Stub for transcription service (Milestone 3)."""
    logger.info(f"Transcribing audio from {recording_url}")
    return {"text": "Texto transcrito da entrevista sintetica."}

def diarize_audio(recording_url: str) -> dict:
    """Stub for diarization service (Milestone 3)."""
    logger.info(f"Diarizing audio from {recording_url}")
    return {
        "segments": [
            {"speaker": "Entrevistador", "start": 0.0, "end": 2.0, "text": "Olá"},
            {"speaker": "Candidato", "start": 2.0, "end": 5.0, "text": "Olá, tudo bem"}
        ]
    }

def score_interview(transcription: any, diarization: any, job_id: str) -> dict:
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
