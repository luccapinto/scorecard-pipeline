import os
import json
import uuid
import tempfile
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_session
from app.models import Interview, InterviewStatus
from app.scoring import ContextAggregator, EvidenceValidator, ScoringEngine, ScorecardOutput
from app.notifications import SlackNotification, WebhookNotification

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


def test_evidence_validator_fuzzy_tolerates_small_wer():
    # Real transcripts have WER > 0: a legitimate quote with a small
    # transcription artifact must still validate (fuzzy match), while an
    # invented quote must not.
    transcript_str = "Eu otimizei as queries pesadas no postgre sql e configurei o redis"

    # Legit quote with 1-word transcription artifact ("postgresql" vs "postgre sql")
    assert EvidenceValidator.validate_evidence(
        "otimizei as queries pesadas no postgresql", transcript_str
    ) is True

    # Fully invented quote is still rejected
    assert EvidenceValidator.validate_evidence(
        "implementei kubernetes com service mesh istio", transcript_str
    ) is False


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
def test_scoring_engine_requires_api_key():
    # Production code must fail fast without a key — no silent mock fallback.
    engine = ScoringEngine(api_key="")
    with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
        engine.evaluate(transcription_raw="text", context={})


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

    # Determinism and structured output are part of the contract
    call_kwargs = mock_client.chat.completions.create.call_args.kwargs
    assert call_kwargs["temperature"] == 0
    assert call_kwargs["response_format"]["type"] == "json_schema"


@patch("app.scoring.OpenAI")
def test_scoring_engine_retries_invalid_json(mock_openai_class):
    mock_client = MagicMock()

    def make_response(content):
        response = MagicMock()
        message = MagicMock()
        message.content = content
        choice = MagicMock()
        choice.message = message
        response.choices = [choice]
        return response

    valid_content = json.dumps({
        "candidate_name": "X",
        "overall_recommendation": "Próxima Etapa",
        "evaluations": []
    })
    # First response violates the schema (score out of 1-5 range), second is valid
    invalid_content = json.dumps({
        "candidate_name": "X",
        "overall_recommendation": "Aprovado",
        "evaluations": [{
            "competency_name": "C", "score": 9,
            "justification": "j", "evidence_quote": "q"
        }]
    })
    mock_client.chat.completions.create.side_effect = [
        make_response(invalid_content),
        make_response(valid_content),
    ]
    mock_openai_class.return_value = mock_client

    engine = ScoringEngine(api_key="fake-key")
    scorecard = engine.evaluate(transcription_raw="t", context={})

    assert isinstance(scorecard, ScorecardOutput)
    assert scorecard.overall_recommendation == "Próxima Etapa"
    assert mock_client.chat.completions.create.call_count == 2


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

    interview_id = uuid.uuid4()
    slack.notify_scorecard(interview_id, scorecard, approval_token="tok-123")

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
    # Buttons must target the GET decision endpoint with the one-time token
    # (Slack `url` buttons open in a browser, i.e. issue a GET).
    assert f"/interviews/{interview_id}/decision?action=approve&token=tok-123" in payload_str
    assert f"/interviews/{interview_id}/decision?action=reject&token=tok-123" in payload_str


@patch("httpx.post")
def test_slack_notification_without_token_omits_buttons(mock_post):
    mock_post.return_value = MagicMock(status_code=200)

    slack = SlackNotification(webhook_url="https://mock-slack.com/webhook")
    slack.notify_scorecard(uuid.uuid4(), {"candidate_name": "X", "evaluations": []})

    payload_str = json.dumps(mock_post.call_args.kwargs["json"], ensure_ascii=False)
    assert "decision" not in payload_str


@patch("httpx.post")
def test_webhook_notification(mock_post):
    mock_post.return_value = MagicMock(status_code=200)

    webhook = WebhookNotification(webhook_url="https://mock-webhook.com/api")
    scorecard = {"candidate_name": "Lucca"}
    interview_id = uuid.uuid4()

    webhook.notify_scorecard(interview_id, scorecard, approval_token="tok-9")

    mock_post.assert_called_once()
    called_args, called_kwargs = mock_post.call_args
    assert called_args[0] == "https://mock-webhook.com/api"
    payload = called_kwargs["json"]
    assert payload["interview_id"] == str(interview_id)
    assert payload["scorecard"] == scorecard
    assert "action=approve&token=tok-9" in payload["approve_url"]
    assert "action=reject&token=tok-9" in payload["reject_url"]


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


# ==========================================
# 6. One-time-token Decision Endpoint (notification buttons)
# ==========================================
def test_decision_endpoint_with_valid_token(client, db_session):
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test",
        status=InterviewStatus.AGUARDANDO_APROVACAO,
        approval_token="one-time-tok"
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)

    response = client.get(
        f"/interviews/{interview.id}/decision?action=approve&token=one-time-tok"
    )
    assert response.status_code == 200
    assert "aprovada" in response.text

    db_session.refresh(interview)
    assert interview.status == InterviewStatus.APROVADA
    # Token is single-use
    assert interview.approval_token is None

    # Replaying the link must fail
    response = client.get(
        f"/interviews/{interview.id}/decision?action=reject&token=one-time-tok"
    )
    assert response.status_code == 401


def test_decision_endpoint_with_invalid_token(client, db_session):
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test",
        status=InterviewStatus.AGUARDANDO_APROVACAO,
        approval_token="right-token"
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)

    response = client.get(
        f"/interviews/{interview.id}/decision?action=approve&token=wrong-token"
    )
    assert response.status_code == 401

    db_session.refresh(interview)
    assert interview.status == InterviewStatus.AGUARDANDO_APROVACAO


# ==========================================
# 7. Reprocess & Maintenance
# ==========================================
def test_reprocess_endpoint_requeues_failed_interview(client, db_session):
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test",
        status=InterviewStatus.FALHOU,
        error_log="boom"
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)

    with patch("app.main.enqueue_processing") as mock_enqueue:
        response = client.post(f"/interviews/{interview.id}/reprocess")
        assert response.status_code == 200
        assert response.json()["requeued"] is True
        mock_enqueue.assert_called_once_with(str(interview.id))


def test_reprocess_endpoint_rejects_non_failed(client, db_session):
    interview = Interview(
        recording_url="http://example.com/audio.mp3",
        job_id="test",
        status=InterviewStatus.RECEBIDA
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)

    response = client.post(f"/interviews/{interview.id}/reprocess")
    assert response.status_code == 400


def test_requeue_stale_interviews(db_session):
    from datetime import timedelta
    from app.maintenance import requeue_stale_interviews
    from app.models import utcnow

    stale = Interview(
        recording_url="http://example.com/a.mp3",
        job_id="j",
        status=InterviewStatus.RECEBIDA,
    )
    fresh = Interview(
        recording_url="http://example.com/b.mp3",
        job_id="j",
        status=InterviewStatus.RECEBIDA,
    )
    db_session.add(stale)
    db_session.add(fresh)
    db_session.commit()
    # Age the stale row past the threshold
    stale.updated_at = utcnow() - timedelta(hours=2)
    db_session.add(stale)
    db_session.commit()

    with patch("app.maintenance.engine", db_session.get_bind()), \
         patch("app.queue.enqueue_processing") as mock_enqueue:
        requeued = requeue_stale_interviews(max_age_minutes=15)

    assert requeued == [str(stale.id)]
    mock_enqueue.assert_called_once_with(str(stale.id))


def test_purge_old_interviews(db_session):
    from datetime import timedelta
    from app.maintenance import purge_old_interviews
    from app.models import utcnow

    old_done = Interview(
        recording_url="http://example.com/a.mp3",
        status=InterviewStatus.APROVADA,
    )
    old_pending = Interview(
        recording_url="http://example.com/b.mp3",
        status=InterviewStatus.AGUARDANDO_APROVACAO,
    )
    db_session.add(old_done)
    db_session.add(old_pending)
    db_session.commit()
    for iv in (old_done, old_pending):
        iv.updated_at = utcnow() - timedelta(days=90)
        db_session.add(iv)
    db_session.commit()
    done_id, pending_id = old_done.id, old_pending.id

    with patch("app.maintenance.engine", db_session.get_bind()):
        purged = purge_old_interviews(retention_days=30)

    assert purged == 1
    # Only terminal-state interviews are purged; pending ones are kept
    db_session.expunge_all()
    assert db_session.get(Interview, done_id) is None
    assert db_session.get(Interview, pending_id) is not None


def test_health_endpoint(client, db_session):
    with patch("app.main.redis_conn") as mock_redis, \
         patch("app.main.engine", db_session.get_bind()):
        mock_redis.ping.return_value = True
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_health_endpoint_unhealthy_redis(client, db_session):
    with patch("app.main.redis_conn") as mock_redis, \
         patch("app.main.engine", db_session.get_bind()):
        mock_redis.ping.side_effect = ConnectionError("redis down")
        response = client.get("/health")
    assert response.status_code == 503
    assert "redis" in response.json()["problems"]
