import os
import uuid
import urllib.parse
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.database import create_db_and_tables, get_session
from app.models import Interview, InterviewStatus

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB and tables on startup
    create_db_and_tables()
    yield

app = FastAPI(
    title="Interview Scorecard Pipeline API",
    description="FastAPI ingestion API for interview recordings",
    version="1.0.0",
    lifespan=lifespan
)

# Global Exception Middleware/Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception caught: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"An unexpected error occurred: {str(exc)}"}
    )

# Pydantic input schema
class RecordingWebhookPayload(BaseModel):
    recording_url: str = Field(..., description="Local path or remote URL to the audio recording")
    job_id: str = Field(..., description="Job identifier matching configuration data")

def validate_recording_url(url: str) -> bool:
    """
    Validates if the recording URL exists. Remote HTTP/HTTPS links are considered valid.
    Local paths (including file:// URIs) are validated to exist on disk.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme in ("http", "https"):
        return True
    elif parsed.scheme == "file":
        path = urllib.parse.unquote(parsed.path)
        if os.name == 'nt' and path.startswith('/') and len(path) > 2 and path[2] == ':':
            path = path[1:]
        return os.path.exists(path)
    else:
        # If no scheme, treat as a direct filesystem path
        return os.path.exists(url)

@app.post("/webhooks/recording", status_code=202)
async def recording_webhook(
    payload: RecordingWebhookPayload,
    session: Session = Depends(get_session)
):
    # 1. Validate resource existence
    if not validate_recording_url(payload.recording_url):
        raise HTTPException(
            status_code=400,
            detail=f"Recording URL/path '{payload.recording_url}' does not exist or is invalid"
        )
    
    # 2. Persist initial Interview in PostgreSQL
    interview = Interview(
        recording_url=payload.recording_url,
        job_id=payload.job_id,
        status=InterviewStatus.RECEBIDA
    )
    
    try:
        session.add(interview)
        session.commit()
        session.refresh(interview)
    except Exception as e:
        logger.error(f"Failed to persist interview in DB: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to save interview metadata"
        )

    # 3. Dispatch job to Redis Queue (RQ)
    try:
        from app.queue import get_queue
        from app.tasks import process_interview
        
        q = get_queue()
        q.enqueue(process_interview, str(interview.id))
    except Exception as e:
        logger.error(f"Failed to enqueue job to Redis: {e}")
        # Note: We still have the metadata in DB, but the job failed to enqueue.
        # But per specs, we should fail or return successfully since we persisted it?
        # Typically if queue fails, we want to report an error or handle it.
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enqueue processing job: {str(e)}"
        )

    # 4. Return HTTP 202
    return {
        "interview_id": str(interview.id),
        "status": interview.status.value
    }

@app.get("/interviews/{interview_id}")
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
    return interview
