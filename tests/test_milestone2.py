import os
import uuid
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_session
from app.models import Interview, InterviewStatus
from app.tasks import process_interview

# SQLite in-memory URL for tests
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(name="db_session")
def db_session_fixture():
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    
    # Overwrite the global engine in app.tasks and app.database to use this test engine
    with patch("app.tasks.engine", engine), patch("app.database.engine", engine):
        with Session(engine) as session:
            yield session
            
    SQLModel.metadata.drop_all(engine)

@pytest.fixture(name="client")
def client_fixture(db_session):
    def override_get_session():
        yield db_session
    
    app.dependency_overrides[get_session] = override_get_session
    with patch("app.main.create_db_and_tables") as mock_create:
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()

@pytest.fixture(name="mock_queue")
def mock_queue_fixture():
    with patch("app.queue.get_queue") as mock_get:
        mock_q = MagicMock()
        mock_get.return_value = mock_q
        yield mock_q

def test_webhook_recording_valid_url(client, db_session, mock_queue):
    payload = {
        "recording_url": "http://example.com/audio.mp3",
        "job_id": "python_developer"
    }
    
    response = client.post("/webhooks/recording", json=payload)
    assert response.status_code == 202
    
    data = response.json()
    assert "interview_id" in data
    assert data["status"] == "recebida"
    
    # Verify it was saved in the database
    interview_id = uuid.UUID(data["interview_id"])
    db_interview = db_session.get(Interview, interview_id)
    assert db_interview is not None
    assert db_interview.recording_url == "http://example.com/audio.mp3"
    assert db_interview.job_id == "python_developer"
    assert db_interview.status == InterviewStatus.RECEBIDA
    
    # Verify that the RQ job was enqueued
    mock_queue.enqueue.assert_called_once_with(process_interview, str(interview_id))

def test_webhook_recording_valid_local_file(client, db_session, mock_queue, tmp_path):
    # Create a temporary audio file on disk
    temp_audio = tmp_path / "interview.wav"
    temp_audio.write_bytes(b"dummy wav data")
    
    payload = {
        "recording_url": str(temp_audio),
        "job_id": "python_developer"
    }
    
    response = client.post("/webhooks/recording", json=payload)
    assert response.status_code == 202
    
    # Verify it exists in GET
    interview_id = response.json()["interview_id"]
    get_response = client.get(f"/interviews/{interview_id}")
    assert get_response.status_code == 200
    assert get_response.json()["recording_url"] == str(temp_audio)

def test_webhook_recording_invalid_payload(client, mock_queue):
    # 1. Missing job_id
    payload = {
        "recording_url": "http://example.com/audio.mp3"
    }
    response = client.post("/webhooks/recording", json=payload)
    assert response.status_code == 422  # Pydantic validation error
    
    # 2. Non-existent local file
    payload = {
        "recording_url": "C:\\non_existent_directory_xyz\\audio.mp3",
        "job_id": "python_developer"
    }
    response = client.post("/webhooks/recording", json=payload)
    assert response.status_code == 400
    assert "does not exist or is invalid" in response.json()["detail"]

def test_get_interview_not_found(client):
    random_uuid = uuid.uuid4()
    response = client.get(f"/interviews/{random_uuid}")
    assert response.status_code == 404

@patch("app.tasks.transcribe_audio")
@patch("app.tasks.diarize_audio")
@patch("app.tasks.score_interview")
@patch("app.tasks.notify_approval")
def test_process_interview_end_to_end(
    mock_notify, mock_score, mock_diarize, mock_transcribe, db_session
):
    # Set up mocks
    mock_transcribe.return_value = {"text": "Hello world"}
    mock_diarize.return_value = {"speakers": []}
    mock_score.return_value = {"score": 5}
    
    # Create interview in database
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test_job",
        status=InterviewStatus.RECEBIDA
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)
    
    # Run the worker process task
    process_interview(interview.id)
    
    # Refresh to see updated state in DB
    db_session.refresh(interview)
    
    assert interview.status == InterviewStatus.AGUARDANDO_APROVACAO
    assert interview.transcription_raw == {"text": "Hello world"}
    assert interview.diarization_raw == {"speakers": []}
    assert interview.scorecard == {"score": 5}
    assert interview.error_log is None
    
    mock_transcribe.assert_called_once_with("http://example.com/audio.mp3")
    mock_diarize.assert_called_once_with("http://example.com/audio.mp3", transcription_raw={"text": "Hello world"})
    mock_score.assert_called_once_with({"text": "Hello world"}, {"speakers": []}, "test_job")
    mock_notify.assert_called_once_with(interview.id)

@patch("app.tasks.transcribe_audio")
@patch("app.tasks.diarize_audio")
@patch("app.tasks.score_interview")
@patch("app.tasks.notify_approval")
def test_process_interview_resilience_flow(
    mock_notify, mock_score, mock_diarize, mock_transcribe, db_session
):
    # Set up mock returns
    mock_transcribe.return_value = {"text": "Transcription text"}
    mock_diarize.return_value = {"segments": []}
    
    # Make score_interview raise an exception on first run to simulate a crash
    mock_score.side_effect = Exception("Scoring service unavailable")
    
    # Create interview
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="resilient_job",
        status=InterviewStatus.RECEBIDA
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)
    
    # Run the process. It should raise the exception.
    with pytest.raises(Exception) as exc_info:
        process_interview(interview.id)
    
    assert "Scoring service unavailable" in str(exc_info.value)
    
    # Refresh and check state. Status should be PONTUANDO, and we should have saved transcription & diarization.
    db_session.refresh(interview)
    assert interview.status == InterviewStatus.PONTUANDO
    assert interview.transcription_raw == {"text": "Transcription text"}
    assert interview.diarization_raw == {"segments": []}
    assert interview.scorecard is None
    assert interview.error_log is not None
    assert "Scoring service unavailable" in interview.error_log
    
    # Reset mocks to verify they are NOT called again
    mock_transcribe.reset_mock()
    mock_diarize.reset_mock()
    mock_score.reset_mock()
    
    # Change mock_score to succeed now
    mock_score.side_effect = None
    mock_score.return_value = {"score": 4}
    
    # Re-run process_interview. It should resume from where it failed (PONTUANDO)
    process_interview(interview.id)
    
    # Refresh and check state
    db_session.refresh(interview)
    assert interview.status == InterviewStatus.AGUARDANDO_APROVACAO
    assert interview.scorecard == {"score": 4}
    assert interview.error_log is None  # Cleared on success
    
    # Verify that transcribe_audio and diarize_audio were NOT called again during resumption!
    mock_transcribe.assert_not_called()
    mock_diarize.assert_not_called()
    mock_score.assert_called_once_with({"text": "Transcription text"}, {"segments": []}, "resilient_job")
    mock_notify.assert_called_once_with(interview.id)
