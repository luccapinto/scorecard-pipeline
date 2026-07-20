import gc
import secrets
import time
import traceback
import uuid
import logging

from sqlmodel import Session, select

from app.audio_processor import clear_model_caches
from app.database import engine
from app.logging_config import interview_id_var
from app.models import (
    Interview,
    InterviewStatus,
    InvalidStateTransitionError,
    TERMINAL_STATUSES,
    VALID_TRANSITIONS,
)
from app.services import AudioSource, transcribe_audio, diarize_audio, score_interview, notify_approval

logger = logging.getLogger(__name__)


def _resume_status_for(interview: Interview) -> InterviewStatus:
    """Determines where a FALHOU interview should resume, based on saved checkpoints."""
    if not interview.transcription_raw:
        return InterviewStatus.TRANSCREVENDO
    if not interview.diarization_raw:
        return InterviewStatus.DIARIZANDO
    return InterviewStatus.PONTUANDO


def _commit(session: Session, interview: Interview) -> None:
    session.add(interview)
    session.commit()
    session.refresh(interview)


def process_interview(interview_id: str) -> None:
    """
    Orchestration task for processing interviews. It transitions state step-by-step
    and supports starting from any saved intermediate state in case of previous failure.
    """
    if isinstance(interview_id, str):
        interview_id_uuid = uuid.UUID(interview_id)
    else:
        interview_id_uuid = interview_id

    correlation = interview_id_var.set(str(interview_id_uuid))
    try:
        with Session(engine) as session:
            # Row lock prevents two workers from processing the same interview
            # concurrently (duplicate enqueue, webhook retry, manual requeue).
            # skip_locked makes a duplicate job exit immediately instead of
            # blocking behind the worker that holds the lock.
            statement = (
                select(Interview)
                .where(Interview.id == interview_id_uuid)
                .with_for_update(skip_locked=True)
            )
            interview = session.exec(statement).one_or_none()
            if not interview:
                if session.get(Interview, interview_id_uuid) is not None:
                    logger.info(
                        "Interview is locked by another worker; skipping duplicate job."
                    )
                    return
                err_msg = f"Interview {interview_id_uuid} not found in database"
                logger.error(err_msg)
                raise ValueError(err_msg)

            if interview.status in TERMINAL_STATUSES or (
                interview.status == InterviewStatus.AGUARDANDO_APROVACAO
            ):
                logger.info(
                    f"Interview already in status '{interview.status.value}'; nothing to process."
                )
                return

            logger.info(f"Starting orchestration process (status={interview.status.value})")

            with AudioSource(interview.recording_url) as audio:
                try:
                    _run_pipeline(session, interview, audio)
                except Exception as e:
                    _record_failure(session, interview_id_uuid, e)
                    raise

            logger.info("Process completed successfully")
    finally:
        interview_id_var.reset(correlation)


def _run_pipeline(session: Session, interview: Interview, audio: AudioSource) -> None:
    # Resume: a previously failed interview re-enters the pipeline at the first
    # step whose checkpoint is missing.
    if interview.status == InterviewStatus.FALHOU:
        resume_to = _resume_status_for(interview)
        logger.info(f"Resuming failed interview at '{resume_to.value}' "
                    f"(retry #{interview.retry_count + 1})")
        interview.retry_count += 1
        interview.transition_to(resume_to)
        _commit(session, interview)

    # Step 1: RECEBIDA -> TRANSCREVENDO
    if interview.status == InterviewStatus.RECEBIDA:
        interview.transition_to(InterviewStatus.TRANSCREVENDO)
        _commit(session, interview)

    # Step 2: transcription, then TRANSCREVENDO -> DIARIZANDO
    if interview.status == InterviewStatus.TRANSCREVENDO:
        if not interview.transcription_raw:
            started = time.monotonic()
            interview.transcription_raw = transcribe_audio(audio.path())
            logger.info(f"Transcription finished in {time.monotonic() - started:.1f}s")
            _commit(session, interview)
        else:
            logger.info("Skipping transcription: transcription_raw already exists")

        interview.transition_to(InterviewStatus.DIARIZANDO)
        _commit(session, interview)

    # Step 3: diarization, then DIARIZANDO -> PONTUANDO
    if interview.status == InterviewStatus.DIARIZANDO:
        if not interview.diarization_raw:
            # Transcription (WhisperX) and diarization (pyannote) models cannot
            # coexist in the worker's memory budget. Evict the transcription
            # models before loading the diarizer to avoid an OOM kill.
            clear_model_caches()
            gc.collect()
            started = time.monotonic()
            interview.diarization_raw = diarize_audio(
                audio.path(), transcription_raw=interview.transcription_raw
            )
            logger.info(f"Diarization finished in {time.monotonic() - started:.1f}s")
            _commit(session, interview)
        else:
            logger.info("Skipping diarization: diarization_raw already exists")

        interview.transition_to(InterviewStatus.PONTUANDO)
        _commit(session, interview)

    # Step 4: scoring, then PONTUANDO -> AGUARDANDO_APROVACAO
    if interview.status == InterviewStatus.PONTUANDO:
        if not interview.scorecard:
            started = time.monotonic()
            interview.scorecard = score_interview(
                interview.transcription_raw,
                interview.diarization_raw,
                interview.job_id
            )
            logger.info(f"Scoring finished in {time.monotonic() - started:.1f}s")
            _commit(session, interview)
        else:
            logger.info("Skipping scoring: scorecard already exists")

        # One-time token used by the notification approve/reject links.
        interview.approval_token = secrets.token_urlsafe(32)
        interview.transition_to(InterviewStatus.AGUARDANDO_APROVACAO)
        interview.error_log = None  # Clear previous errors if successful
        _commit(session, interview)

        logger.info("Sending notifications...")
        notify_approval(interview.id)


def _record_failure(session: Session, interview_id_uuid: uuid.UUID, error: Exception) -> None:
    tb = traceback.format_exc()
    logger.error(f"Error during process_interview: {str(error)}\n{tb}")
    # Roll back any partial transaction, then persist the failure on a fresh row.
    session.rollback()
    interview = session.get(Interview, interview_id_uuid)
    if not interview:
        return
    interview.error_log = tb
    if InterviewStatus.FALHOU in VALID_TRANSITIONS.get(interview.status, set()):
        try:
            interview.transition_to(InterviewStatus.FALHOU)
        except InvalidStateTransitionError:
            pass
    session.add(interview)
    session.commit()
