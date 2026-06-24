import os
import json
import uuid
import tempfile
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool
import httpx

from app.main import app
from app.database import get_session
from app.models import Interview, InterviewStatus
from app.scoring import ContextAggregator, EvidenceValidator, ScoringEngine, ScorecardOutput
from app.notifications import SlackNotification, WebhookNotification, NotificationDispatcher

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
    
    with patch("app.database.engine", engine):
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


# ==========================================
# 1. ContextAggregator Tests
# ==========================================
def test_context_aggregator_success():
    with tempfile.TemporaryDirectory() as tmpdir:
        job_data = {"title": "Test Title", "description": "Test Desc", "requirements": ["Req 1"]}
        comp_data = {"competencies": [{"name": "Test Comp", "description": "...", "bars_levels": {"1": "Level 1"}}]}
        checklist_data = {"items": ["Item 1"]}

        with open(os.path.join(tmpdir, "job_test_job.json"), "w", encoding="utf-8") as f:
            json.dump(job_data, f)
        with open(os.path.join(tmpdir, "competency_test_job.json"), "w", encoding="utf-8") as f:
            json.dump(comp_data, f)
        with open(os.path.join(tmpdir, "checklist_test_job.json"), "w", encoding="utf-8") as f:
            json.dump(checklist_data, f)

        agg = ContextAggregator(jobs_dir=tmpdir)
        context = agg.load_context("test_job")
        
        assert context["job"]["title"] == "Test Title"
        assert len(context["competencies"]) == 1
        assert context["competencies"][0]["name"] == "Test Comp"
        assert context["checklist"] == ["Item 1"]


def test_context_aggregator_missing_files():
    with tempfile.TemporaryDirectory() as tmpdir:
        agg = ContextAggregator(jobs_dir=tmpdir)
        with pytest.raises(FileNotFoundError):
            agg.load_context("missing_job")


# ==========================================
# 2. EvidenceValidator Tests
# ==========================================
def test_evidence_validator():
    # Transcript string
    transcript_str = "Olá, bem-vindo. Eu uso o PostgreSQL e o Redis no backend."
    
    # Exact match
    assert EvidenceValidator.validate_evidence("PostgreSQL e o Redis", transcript_str) is True
    
    # Case and accents normalizations
    assert EvidenceValidator.validate_evidence("postgresql e o redis", transcript_str) is True
    assert EvidenceValidator.validate_evidence("ola bem vindo", transcript_str) is True
    
    # Punctuation normalization
    assert EvidenceValidator.validate_evidence("ola, bem-vindo.", transcript_str) is True
    
    # Spacing normalization
    assert EvidenceValidator.validate_evidence("postgresql     e   o   redis", transcript_str) is True
    
    # Not found / Invented
    assert EvidenceValidator.validate_evidence("usei docker compose", transcript_str) is False
    
    # Empty quote
    assert EvidenceValidator.validate_evidence("", transcript_str) is False


def test_evidence_validator_list_segments():
    # Transcript as a list of segments
    transcript_list = [
        {"text": "Olá, bem-vindo.", "start": 0.0, "end": 2.0},
        {"text": "Eu uso o PostgreSQL e o Redis no backend.", "start": 2.0, "end": 5.0}
    ]
    
    assert EvidenceValidator.validate_evidence("PostgreSQL e o Redis", transcript_list) is True
    assert EvidenceValidator.validate_evidence("ola bem vindo", transcript_list) is True
    assert EvidenceValidator.validate_evidence("usei docker compose", transcript_list) is False


# ==========================================
# 3. ScoringEngine Tests
# ==========================================
@patch.dict(os.environ, {"TEST_MODE": "true"})
def test_scoring_engine_fallback():
    # Tests that when API key is missing and TEST_MODE="true", it returns the fallback scorecard
    engine = ScoringEngine(api_key="")
    context = {
        "job": {"title": "Python Pleno"},
        "competencies": [{"name": "Comunicação e Code-switching"}, {"name": "Conhecimento de Infraestrutura"}],
        "checklist": []
    }
    
    scorecard = engine.evaluate(
        transcription_raw="Mock transcription text",
        context=context,
        candidate_name="Lucca"
    )
    
    assert isinstance(scorecard, ScorecardOutput)
    assert scorecard.candidate_name == "Lucca"
    assert scorecard.overall_recommendation == "Aprovado"
    assert len(scorecard.evaluations) == 2
    assert scorecard.evaluations[0].score == 4


@patch("app.scoring.OpenAI")
def test_scoring_engine_openrouter_api(mock_openai_class):
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    
    # Structured output from OpenRouter API
    mock_json_content = json.dumps({
        "candidate_name": "Lucca Pinto",
        "overall_recommendation": "Aprovado",
        "evaluations": [
            {
                "competency_name": "Comunicação",
                "score": 5,
                "justification": "Comunicação muito clara.",
                "evidence_quote": "Tudo ótimo, obrigado!"
            }
        ]
    })
    
    mock_message.content = mock_json_content
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    mock_client.chat.completions.create.return_value = mock_response
    mock_openai_class.return_value = mock_client
    
    engine = ScoringEngine(api_key="fake-openrouter-key")
    context = {
        "job": {"title": "Python Developer"},
        "competencies": [],
        "checklist": []
    }
    
    scorecard = engine.evaluate(
        transcription_raw="Tudo ótimo, obrigado!",
        context=context,
        candidate_name="Lucca"
    )
    
    assert scorecard.candidate_name == "Lucca Pinto"
    assert scorecard.overall_recommendation == "Aprovado"
    assert len(scorecard.evaluations) == 1
    assert scorecard.evaluations[0].score == 5
    assert scorecard.evaluations[0].evidence_quote == "Tudo ótimo, obrigado!"


# ==========================================
# 4. Notification System Tests
# ==========================================
@patch("httpx.post")
def test_slack_notification(mock_post):
    mock_post.return_value = MagicMock(status_code=200)
    
    slack = SlackNotification(webhook_url="https://mock-slack.com/webhook")
    scorecard = {
        "candidate_name": "Lucca Pinto",
        "overall_recommendation": "Aprovado",
        "evaluations": [
            {
                "competency_name": "Comunicação",
                "score": 4,
                "justification": "Excelente fala.",
                "evidence_quote": "Olá, tudo bem?",
                "evidence_verified": True
            },
            {
                "competency_name": "Infraestrutura",
                "score": 2,
                "justification": "Não citou postgres.",
                "evidence_quote": "eu usei docker",
                "evidence_verified": False
            }
        ]
    }
    
    slack.notify_scorecard(uuid.uuid4(), scorecard)
    
    mock_post.assert_called_once()
    called_args, called_kwargs = mock_post.call_args
    assert called_args[0] == "https://mock-slack.com/webhook"
    
    payload = called_kwargs["json"]
    assert "blocks" in payload
    # Check that candidate name and verified statuses are part of the payload
    payload_str = json.dumps(payload, ensure_ascii=False)
    assert "Lucca Pinto" in payload_str
    assert "🟢 [OK]" in payload_str
    assert "🔴 [ALERTA: Alucinação detectada]" in payload_str
    assert "approve" in payload_str
    assert "reject" in payload_str


@patch("httpx.post")
def test_webhook_notification(mock_post):
    mock_post.return_value = MagicMock(status_code=200)
    
    webhook = WebhookNotification(webhook_url="https://mock-webhook.com/api")
    scorecard = {"candidate_name": "Lucca"}
    interview_id = uuid.uuid4()
    
    webhook.notify_scorecard(interview_id, scorecard)
    
    mock_post.assert_called_once_with(
        "https://mock-webhook.com/api",
        json={"interview_id": str(interview_id), "scorecard": scorecard}
    )


# ==========================================
# 5. Callback Endpoint Tests
# ==========================================
def test_callback_endpoint_success_approve(client, db_session):
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test",
        status=InterviewStatus.AGUARDANDO_APROVACAO
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)
    
    response = client.post(f"/interviews/{interview.id}/action", json={"action": "approve"})
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "aprovada"
    assert data["interview_id"] == str(interview.id)
    
    # Assert database updated
    db_session.refresh(interview)
    assert interview.status == InterviewStatus.APROVADA


def test_callback_endpoint_success_reject(client, db_session):
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test",
        status=InterviewStatus.AGUARDANDO_APROVACAO
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)
    
    response = client.post(f"/interviews/{interview.id}/action", json={"action": "reject"})
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "rejeitada"
    
    db_session.refresh(interview)
    assert interview.status == InterviewStatus.REJEITADA


def test_callback_endpoint_invalid_status(client, db_session):
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test",
        status=InterviewStatus.RECEBIDA # Non-waiting status
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)
    
    response = client.post(f"/interviews/{interview.id}/action", json={"action": "approve"})
    assert response.status_code == 400
    assert "is not in 'aguardando_aprovacao'" in response.json()["detail"]


def test_callback_endpoint_invalid_action(client, db_session):
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test",
        status=InterviewStatus.AGUARDANDO_APROVACAO
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)
    
    response = client.post(f"/interviews/{interview.id}/action", json={"action": "invalid_action"})
    assert response.status_code == 400
    assert "Invalid action" in response.json()["detail"]


def test_callback_endpoint_not_found(client):
    random_uuid = uuid.uuid4()
    response = client.post(f"/interviews/{random_uuid}/action", json={"action": "approve"})
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]
