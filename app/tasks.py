import uuid
import traceback
import logging
from sqlmodel import Session
from app.database import engine
from app.models import Interview, InterviewStatus
from app.services import transcribe_audio, diarize_audio, score_interview, notify_approval

logger = logging.getLogger(__name__)

def process_interview(interview_id: str) -> None:
    """
    Orchestration task for processing interviews. It transitions state step-by-step
    and supports starting from any saved intermediate state in case of previous failure.
    """
    logger.info(f"Starting orchestration process for interview_id: {interview_id}")
    
    if isinstance(interview_id, str):
        interview_id_uuid = uuid.UUID(interview_id)
    else:
        interview_id_uuid = interview_id

    with Session(engine) as session:
        interview = session.get(Interview, interview_id_uuid)
        if not interview:
            err_msg = f"Interview {interview_id_uuid} not found in database"
            logger.error(err_msg)
            raise ValueError(err_msg)

        try:
            # Step 1: RECEBIDA -> TRANSCREVENDO
            if interview.status == InterviewStatus.RECEBIDA:
                logger.info("Transitioning from RECEBIDA to TRANSCREVENDO")
                interview.transition_to(InterviewStatus.TRANSCREVENDO)
                session.add(interview)
                session.commit()
                session.refresh(interview)

            # Step 2: TRANSCREVENDO -> DIARIZADA
            if interview.status == InterviewStatus.TRANSCREVENDO:
                if not interview.transcription_raw:
                    logger.info("Running audio transcription...")
                    transcription = transcribe_audio(interview.recording_url)
                    interview.transcription_raw = transcription
                    session.add(interview)
                    session.commit()
                    session.refresh(interview)
                else:
                    logger.info("Skipping transcription: transcription_raw already exists")
                
                logger.info("Transitioning from TRANSCREVENDO to DIARIZADA")
                interview.transition_to(InterviewStatus.DIARIZADA)
                session.add(interview)
                session.commit()
                session.refresh(interview)

            # Step 3: DIARIZADA -> PONTUANDO
            if interview.status == InterviewStatus.DIARIZADA:
                if not interview.diarization_raw:
                    logger.info("Running audio diarization...")
                    diarization = diarize_audio(interview.recording_url, transcription_raw=interview.transcription_raw)
                    interview.diarization_raw = diarization
                    session.add(interview)
                    session.commit()
                    session.refresh(interview)
                else:
                    logger.info("Skipping diarization: diarization_raw already exists")

                logger.info("Transitioning from DIARIZADA to PONTUANDO")
                interview.transition_to(InterviewStatus.PONTUANDO)
                session.add(interview)
                session.commit()
                session.refresh(interview)

            # Step 4: PONTUANDO -> AGUARDANDO_APROVACAO
            if interview.status == InterviewStatus.PONTUANDO:
                if not interview.scorecard:
                    logger.info("Running scoring evaluation...")
                    scorecard = score_interview(
                        interview.transcription_raw,
                        interview.diarization_raw,
                        interview.job_id
                    )
                    interview.scorecard = scorecard
                    session.add(interview)
                    session.commit()
                    session.refresh(interview)
                else:
                    logger.info("Skipping scoring: scorecard already exists")

                logger.info("Transitioning from PONTUANDO to AGUARDANDO_APROVACAO")
                interview.transition_to(InterviewStatus.AGUARDANDO_APROVACAO)
                interview.error_log = None  # Clear previous errors if successful
                session.add(interview)
                session.commit()
                session.refresh(interview)
                
                logger.info("Sending notifications...")
                notify_approval(interview.id)
                
            logger.info(f"Process completed successfully for interview_id: {interview_id_uuid}")

        except Exception as e:
            tb = traceback.format_exc()
            logger.error(f"Error during process_interview: {str(e)}\n{tb}")
            # Refresh to avoid committing invalid states, then save the error log
            session.rollback()
            # Fetch fresh state
            interview = session.get(Interview, interview_id_uuid)
            if interview:
                interview.error_log = tb
                session.add(interview)
                session.commit()
            raise e
