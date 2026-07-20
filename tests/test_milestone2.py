import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import app
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
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture(name="mock_enqueue")
def mock_enqueue_fixture():
    with patch("app.main.enqueue_processing") as mock_enqueue:
        yield mock_enqueue

@pytest.fixture(name="mock_audio_source")
def mock_audio_source_fixture():
    """Prevents process_interview from actually resolving/downloading audio."""
    mock_audio = MagicMock()
    mock_audio.__enter__ = MagicMock(return_value=mock_audio)
    mock_audio.__exit__ = MagicMock(return_value=None)
    mock_audio.path.return_value = Path("/tmp/fake_audio.wav")
    with patch("app.tasks.AudioSource", return_value=mock_audio):
        yield mock_audio

def test_webhook_recording_valid_url(client, db_session, mock_enqueue):
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

    # Verify that the RQ job was enqueued with timeout/retry policy
    mock_enqueue.assert_called_once_with(str(interview_id))

def test_webhook_recording_valid_local_file(client, db_session, mock_enqueue, tmp_path):
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
    # The one-time approval token must never leak through the API
    assert "approval_token" not in get_response.json()

def test_webhook_recording_local_file_outside_allowed_dir(client, mock_enqueue, tmp_path, monkeypatch):
    from app.config import settings

    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside.wav"
    outside.write_bytes(b"dummy")
    monkeypatch.setattr(settings, "audio_allowed_dir", str(allowed))

    response = client.post("/webhooks/recording", json={
        "recording_url": str(outside),
        "job_id": "python_developer"
    })
    assert response.status_code == 400
    assert "not allowed" in response.json()["detail"]

def test_webhook_recording_invalid_payload(client, mock_enqueue):
    # 1. Missing job_id
    payload = {
        "recording_url": "http://example.com/audio.mp3"
    }
    response = client.post("/webhooks/recording", json=payload)
    assert response.status_code == 422  # Pydantic validation error

    # 2. Non-existent local file
    payload = {
        "recording_url": "/non_existent_directory_xyz/audio.mp3",
        "job_id": "python_developer"
    }
    response = client.post("/webhooks/recording", json=payload)
    assert response.status_code == 400
    assert "not allowed or does not exist" in response.json()["detail"]

def test_webhook_recording_deduplicates_by_external_id(client, db_session, mock_enqueue):
    payload = {
        "recording_url": "http://example.com/audio.mp3",
        "job_id": "python_developer",
        "external_id": "provider-evt-123"
    }

    first = client.post("/webhooks/recording", json=payload)
    assert first.status_code == 202
    first_id = first.json()["interview_id"]

    # A retried webhook with the same external_id must not create a duplicate
    second = client.post("/webhooks/recording", json=payload)
    assert second.status_code == 202
    assert second.json()["interview_id"] == first_id
    assert second.json().get("deduplicated") is True
    mock_enqueue.assert_called_once()

def test_webhook_hmac_signature(client, db_session, mock_enqueue, monkeypatch):
    import hashlib
    import hmac as hmac_mod
    import json as json_mod

    from app.config import settings

    monkeypatch.setattr(settings, "webhook_hmac_secret", "super-secret")
    payload = {"recording_url": "http://example.com/audio.mp3", "job_id": "j1"}
    body = json_mod.dumps(payload).encode()

    # Missing/invalid signature is rejected
    response = client.post(
        "/webhooks/recording", content=body,
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 401

    # Valid signature is accepted
    signature = hmac_mod.new(b"super-secret", body, hashlib.sha256).hexdigest()
    response = client.post(
        "/webhooks/recording", content=body,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": signature}
    )
    assert response.status_code == 202

def test_api_key_required_when_configured(client, db_session, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "api_key", "topsecret")
    random_uuid = uuid.uuid4()

    response = client.get(f"/interviews/{random_uuid}")
    assert response.status_code == 401

    response = client.get(f"/interviews/{random_uuid}", headers={"X-API-Key": "topsecret"})
    assert response.status_code == 404  # authenticated, interview simply absent

def test_get_interview_not_found(client):
    random_uuid = uuid.uuid4()
    response = client.get(f"/interviews/{random_uuid}")
    assert response.status_code == 404

@patch("app.tasks.transcribe_audio")
@patch("app.tasks.diarize_audio")
@patch("app.tasks.score_interview")
@patch("app.tasks.notify_approval")
def test_process_interview_end_to_end(
    mock_notify, mock_score, mock_diarize, mock_transcribe, db_session, mock_audio_source
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
    # Approval token is generated for the notification decision links
    assert interview.approval_token

    audio_path = mock_audio_source.path.return_value
    mock_transcribe.assert_called_once_with(audio_path)
    mock_diarize.assert_called_once_with(audio_path, transcription_raw={"text": "Hello world"})
    mock_score.assert_called_once_with({"text": "Hello world"}, {"speakers": []}, "test_job")
    mock_notify.assert_called_once_with(interview.id)

@patch("app.tasks.transcribe_audio")
@patch("app.tasks.diarize_audio")
@patch("app.tasks.score_interview")
@patch("app.tasks.notify_approval")
def test_process_interview_resilience_flow(
    mock_notify, mock_score, mock_diarize, mock_transcribe, db_session, mock_audio_source
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

    # Refresh and check state. Status is FALHOU (explicit failure state), and
    # we should have saved transcription & diarization checkpoints.
    db_session.refresh(interview)
    assert interview.status == InterviewStatus.FALHOU
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

    # Re-run process_interview. It should resume from where it failed (scoring)
    process_interview(interview.id)

    # Refresh and check state
    db_session.refresh(interview)
    assert interview.status == InterviewStatus.AGUARDANDO_APROVACAO
    assert interview.scorecard == {"score": 4}
    assert interview.error_log is None  # Cleared on success
    assert interview.retry_count == 1

    # Verify that transcribe_audio and diarize_audio were NOT called again during resumption!
    mock_transcribe.assert_not_called()
    mock_diarize.assert_not_called()
    mock_score.assert_called_once_with({"text": "Transcription text"}, {"segments": []}, "resilient_job")
    mock_notify.assert_called_once_with(interview.id)

@patch("app.tasks.transcribe_audio")
@patch("app.tasks.notify_approval")
def test_process_interview_is_noop_after_completion(
    mock_notify, mock_transcribe, db_session, mock_audio_source
):
    # A duplicate job for an already-delivered interview must do nothing.
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="done_job",
        status=InterviewStatus.AGUARDANDO_APROVACAO
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)

    process_interview(interview.id)

    db_session.refresh(interview)
    assert interview.status == InterviewStatus.AGUARDANDO_APROVACAO
    mock_transcribe.assert_not_called()
    mock_notify.assert_not_called()
