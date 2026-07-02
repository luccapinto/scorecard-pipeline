import hmac
import logging
import urllib.parse
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select, text

from app.database import get_session, engine
from app.logging_config import setup_logging
from app.models import Interview, InterviewStatus, InvalidStateTransitionError
from app.queue import enqueue_processing, redis_conn
from app.security import require_api_key, verify_webhook_signature
from app.services import assert_allowed_local_path

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    # Schema is managed by Alembic migrations (`alembic upgrade head`),
    # never created implicitly at startup.
    yield

app = FastAPI(
    title="Interview Scorecard Pipeline API",
    description="FastAPI ingestion API for interview recordings",
    version="2.0.0",
    lifespan=lifespan
)


# Global Exception Middleware/Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception caught: {str(exc)}", exc_info=True)
    # Never echo internal error details to clients.
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal error occurred."}
    )


# Pydantic input schema
class RecordingWebhookPayload(BaseModel):
    recording_url: str = Field(..., description="Local path or remote URL to the audio recording")
    job_id: str = Field(..., description="Job identifier matching configuration data")
    external_id: Optional[str] = Field(
        default=None,
        description="Idempotency key from the recording provider; retried webhooks "
                    "with the same external_id return the existing interview"
    )


def validate_recording_url(url: str) -> None:
    """
    Validates the recording URL. Remote HTTP/HTTPS links are accepted here and
    fully vetted (SSRF guard, size limit) at download time in the worker.
    Local paths are only accepted inside AUDIO_ALLOWED_DIR when configured.
    Raises HTTPException(400) when invalid.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme in ("http", "https"):
        return
    if parsed.scheme and parsed.scheme != "file":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported recording URL scheme: '{parsed.scheme}'"
        )
    path = urllib.parse.unquote(parsed.path) if parsed.scheme == "file" else url
    try:
        assert_allowed_local_path(path)
    except (ValueError, FileNotFoundError):
        raise HTTPException(
            status_code=400,
            detail="Recording path is not allowed or does not exist"
        )


def serialize_interview(interview: Interview) -> dict:
    # approval_token is a credential; it must never appear in API responses.
    return interview.model_dump(exclude={"approval_token"})


@app.get("/health")
async def health():
    problems = {}
    try:
        with Session(engine) as session:
            session.execute(text("SELECT 1"))
    except Exception as e:
        problems["database"] = str(e.__class__.__name__)
    try:
        redis_conn.ping()
    except Exception as e:
        problems["redis"] = str(e.__class__.__name__)
    if problems:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "problems": problems})
    return {"status": "ok"}


@app.post("/webhooks/recording", status_code=202, dependencies=[Depends(verify_webhook_signature)])
async def recording_webhook(
    payload: RecordingWebhookPayload,
    session: Session = Depends(get_session)
):
    # 1. Validate the recording reference
    validate_recording_url(payload.recording_url)

    # 2. Idempotency: a retried webhook with a known external_id returns the
    #    existing interview instead of creating a duplicate.
    if payload.external_id:
        existing = session.exec(
            select(Interview).where(Interview.external_id == payload.external_id)
        ).first()
        if existing:
            return {
                "interview_id": str(existing.id),
                "status": existing.status.value,
                "deduplicated": True,
            }

    # 3. Persist initial Interview in PostgreSQL
    interview = Interview(
        recording_url=payload.recording_url,
        job_id=payload.job_id,
        external_id=payload.external_id,
        status=InterviewStatus.RECEBIDA
    )

    try:
        session.add(interview)
        session.commit()
        session.refresh(interview)
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to persist interview in DB: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save interview metadata"
        )

    # 4. Dispatch job to Redis Queue (RQ). If this fails the interview stays in
    #    RECEBIDA and is picked up by the reconciliation routine
    #    (app.maintenance.requeue_stale_interviews).
    try:
        enqueue_processing(str(interview.id))
    except Exception as e:
        logger.error(
            f"Failed to enqueue job for interview {interview.id}; it will be "
            f"re-enqueued by reconciliation: {e}"
        )
        raise HTTPException(
            status_code=500,
            detail="Interview stored but processing could not be enqueued; "
                   "it will be retried automatically"
        )

    # 5. Return HTTP 202
    return {
        "interview_id": str(interview.id),
        "status": interview.status.value
    }


@app.get("/interviews/{interview_id}", dependencies=[Depends(require_api_key)])
async def get_interview(
    interview_id: uuid.UUID,
    session: Session = Depends(get_session)
):
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(
            status_code=404,
            detail=f"Interview {interview_id} not found"
        )
    return serialize_interview(interview)


class ActionPayload(BaseModel):
    action: str = Field(..., description="Action to perform: 'approve' or 'reject'")


def _apply_decision(session: Session, interview: Interview, action: str) -> Interview:
    if interview.status != InterviewStatus.AGUARDANDO_APROVACAO:
        raise HTTPException(
            status_code=400,
            detail=f"Interview is not in '{InterviewStatus.AGUARDANDO_APROVACAO.value}' status. "
                   f"Current status: '{interview.status.value}'"
        )

    if action == "approve":
        target_status = InterviewStatus.APROVADA
    elif action == "reject":
        target_status = InterviewStatus.REJEITADA
    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid action. Allowed values are 'approve' or 'reject'"
        )

    try:
        interview.transition_to(target_status)
        interview.approval_token = None  # One-time links stop working after a decision
        session.add(interview)
        session.commit()
        session.refresh(interview)
    except InvalidStateTransitionError as e:
        session.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Failed to transition interview status: {str(e)}"
        )
    return interview


@app.post("/interviews/{interview_id}/action", dependencies=[Depends(require_api_key)])
async def interview_action(
    interview_id: uuid.UUID,
    payload: ActionPayload,
    session: Session = Depends(get_session)
):
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(
            status_code=404,
            detail=f"Interview {interview_id} not found"
        )

    interview = _apply_decision(session, interview, payload.action)

    return {
        "interview_id": str(interview.id),
        "status": interview.status.value,
        "updated_at": interview.updated_at.isoformat()
    }


@app.get("/interviews/{interview_id}/decision", response_class=HTMLResponse)
async def interview_decision(
    interview_id: uuid.UUID,
    action: str,
    token: str,
    session: Session = Depends(get_session)
):
    """
    One-time-token decision link used by notification buttons (Slack `url`
    buttons open in a browser as GET). The token is generated when the
    scorecard is ready and invalidated after the first decision.
    """
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if not interview.approval_token or not hmac.compare_digest(token, interview.approval_token):
        raise HTTPException(status_code=401, detail="Invalid or expired decision token")

    interview = _apply_decision(session, interview, action)

    label = "aprovada ✔️" if interview.status == InterviewStatus.APROVADA else "rejeitada ❌"
    return HTMLResponse(
        f"<html><body><h2>Entrevista {label}</h2>"
        f"<p>ID: {interview.id}</p>"
        f"<p>Status atual: <strong>{interview.status.value}</strong></p>"
        f"</body></html>"
    )


@app.post("/interviews/{interview_id}/reprocess", dependencies=[Depends(require_api_key)])
async def reprocess_interview(
    interview_id: uuid.UUID,
    session: Session = Depends(get_session)
):
    """Re-enqueues a failed interview; processing resumes from saved checkpoints."""
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail=f"Interview {interview_id} not found")
    if interview.status != InterviewStatus.FALHOU:
        raise HTTPException(
            status_code=400,
            detail=f"Only interviews in '{InterviewStatus.FALHOU.value}' can be reprocessed. "
                   f"Current status: '{interview.status.value}'"
        )
    enqueue_processing(str(interview.id))
    return {"interview_id": str(interview.id), "status": interview.status.value, "requeued": True}


@app.post("/admin/reconcile", dependencies=[Depends(require_api_key)])
async def reconcile():
    """Re-enqueues stale RECEBIDA interviews (dual-write reconciliation)."""
    from app.maintenance import requeue_stale_interviews

    requeued = requeue_stale_interviews()
    return {"requeued": requeued}
