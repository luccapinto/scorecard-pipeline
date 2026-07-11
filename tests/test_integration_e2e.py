"""
End-to-end integration test exercising the real wiring:

HTTP webhook (HMAC) -> PostgreSQL/SQLite -> real Redis enqueue -> real RQ
worker executing process_interview -> real ContextAggregator reading the
committed dataset -> real EvidenceValidator -> real HTTP notification to a
local server -> one-time-token decision link -> final state.

Only the two external calls (ML transcription/diarization and the OpenRouter
LLM) are stubbed — at the test boundary, never in production code.

Requires a reachable Redis (skipped otherwise). Runs in CI against the
Redis/Postgres services; DATABASE_URL pointing at PostgreSQL is used when
reachable, with a SQLite file as fallback.
"""
import hashlib
import hmac
import json
import os
import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

import pytest
import redis
from fastapi.testclient import TestClient
from rq import Queue, SimpleWorker
from rq.registry import FailedJobRegistry
from sqlmodel import SQLModel, Session, create_engine

from app.config import settings
from app.main import app
from app.models import Interview, InterviewStatus
from app.scoring import ScorecardOutput, CompetencyEvaluation

WEBHOOK_SECRET = "e2e-webhook-secret"
API_KEY = "e2e-api-key"


def _redis_available() -> bool:
    try:
        redis.from_url(settings.redis_url).ping()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _redis_available(), reason="Redis is not reachable; skipping E2E integration test"
)


@pytest.fixture(name="e2e_engine")
def e2e_engine_fixture(tmp_path):
    url = os.environ.get("DATABASE_URL", "")
    engine = None
    if url.startswith("postgresql"):
        try:
            candidate = create_engine(url)
            with candidate.connect():
                pass
            engine = candidate
        except Exception:
            engine = None
    if engine is None:
        engine = create_engine(
            f"sqlite:///{tmp_path}/e2e.db",
            connect_args={"check_same_thread": False},
        )

    SQLModel.metadata.create_all(engine)
    with patch("app.database.engine", engine), \
         patch("app.tasks.engine", engine), \
         patch("app.main.engine", engine):
        yield engine
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(name="notification_server")
def notification_server_fixture():
    """Real local HTTP server capturing the generic webhook notification."""
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            received.append(json.loads(self.rfile.read(length)))
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/hook", received
    server.shutdown()


def _signed_post(client: TestClient, path: str, payload: dict):
    body = json.dumps(payload).encode()
    signature = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return client.post(
        path,
        content=body,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": signature},
    )


def test_full_pipeline_end_to_end(e2e_engine, notification_server, tmp_path, monkeypatch):
    notification_url, received_notifications = notification_server

    # --- Environment hardening: everything the docs tell production to set ---
    monkeypatch.setattr(settings, "webhook_hmac_secret", WEBHOOK_SECRET)
    monkeypatch.setattr(settings, "api_key", API_KEY)
    monkeypatch.setattr(settings, "notification_webhook_url", notification_url)
    monkeypatch.setattr(settings, "slack_webhook_url", "")
    monkeypatch.setattr(settings, "jobs_dir", "data/synthetic")

    audio_dir = tmp_path / "recordings"
    audio_dir.mkdir()
    monkeypatch.setattr(settings, "audio_allowed_dir", str(audio_dir))
    recording = audio_dir / "interview_python_pleno.wav"
    recording.write_bytes(b"RIFF....WAVEfmt ")  # content irrelevant: ML step is stubbed

    # Stub transcription with the real dialogue of the committed dataset so the
    # (real) EvidenceValidator has realistic text to verify quotes against.
    with open("data/synthetic/interview_python_pleno.json", encoding="utf-8") as f:
        turns = json.load(f)["turns"]
    transcription_stub = [
        {"text": t["text"], "start": float(i * 10), "end": float(i * 10 + 9)}
        for i, t in enumerate(turns)
    ]
    diarization_stub = [
        {"speaker": "SPEAKER_00" if t["speaker"] == "Entrevistador" else "SPEAKER_01",
         "start": float(i * 10), "end": float(i * 10 + 9), "text": t["text"]}
        for i, t in enumerate(turns)
    ]

    # Stub only the LLM call; ContextAggregator + EvidenceValidator run for real.
    def fake_evaluate(self, transcription_raw, context, candidate_name="Candidato", diarization_raw=None):
        assert context["job"]["title"] == "Desenvolvedor Python Pleno"
        assert len(context["competencies"]) == 4
        return ScorecardOutput(
            candidate_name="Candidato E2E",
            overall_recommendation="Aprovado",
            evaluations=[
                CompetencyEvaluation(
                    competency_name=context["competencies"][0]["name"],
                    score=4,
                    justification="Comunicação clara com code-switching adequado.",
                    # Real quote from the dialogue -> validator must confirm it
                    evidence_quote="Fico feliz pela oportunidade de conversar com vocês sobre o time e o projeto.",
                ),
                CompetencyEvaluation(
                    competency_name=context["competencies"][1]["name"],
                    score=5,
                    justification="Otimização de queries com métricas concretas.",
                    # Hallucinated quote -> validator must flag it
                    evidence_quote="Eu reescrevi o kernel do banco de dados em assembly.",
                ),
            ],
        )

    client = TestClient(app)
    q = Queue("default", connection=redis.from_url(settings.redis_url))
    q.empty()

    external_id = f"e2e-{uuid.uuid4()}"
    payload = {
        "recording_url": str(recording),
        "job_id": "python_pleno",
        "external_id": external_id,
    }

    # --- 1. Unsigned webhook is rejected; signed one is accepted (202) ---
    unsigned = client.post("/webhooks/recording", json=payload)
    assert unsigned.status_code == 401

    response = _signed_post(client, "/webhooks/recording", payload)
    assert response.status_code == 202, response.text
    interview_id = response.json()["interview_id"]

    # Duplicate delivery is deduplicated
    duplicate = _signed_post(client, "/webhooks/recording", payload)
    assert duplicate.status_code == 202
    assert duplicate.json()["interview_id"] == interview_id
    assert duplicate.json()["deduplicated"] is True

    # --- 2. A real RQ worker consumes the job from real Redis ---
    with patch("app.tasks.transcribe_audio", return_value=transcription_stub), \
         patch("app.tasks.diarize_audio", return_value=diarization_stub), \
         patch("app.scoring.ScoringEngine.evaluate", fake_evaluate):
        worker = SimpleWorker([q], connection=q.connection)
        worker.work(burst=True)

    failed = FailedJobRegistry(queue=q)
    assert failed.count == 0, [
        q.fetch_job(jid).exc_info for jid in failed.get_job_ids()
    ]

    # --- 3. Pipeline state persisted correctly ---
    with Session(e2e_engine) as session:
        interview = session.get(Interview, uuid.UUID(interview_id))
        assert interview.status == InterviewStatus.AGUARDANDO_APROVACAO
        assert interview.transcription_raw == transcription_stub
        assert interview.diarization_raw == diarization_stub
        assert interview.error_log is None
        assert interview.approval_token
        evaluations = interview.scorecard["evaluations"]
        # Real EvidenceValidator: genuine quote verified, invented quote flagged
        assert evaluations[0]["evidence_verified"] is True
        assert evaluations[1]["evidence_verified"] is False
        approval_token = interview.approval_token

    # --- 4. Real HTTP notification delivered with decision links ---
    assert len(received_notifications) == 1
    notification = received_notifications[0]
    assert notification["interview_id"] == interview_id
    assert approval_token in notification["approve_url"]

    # --- 5. API key required on read endpoint; token decision link works ---
    assert client.get(f"/interviews/{interview_id}").status_code == 401
    read = client.get(f"/interviews/{interview_id}", headers={"X-API-Key": API_KEY})
    assert read.status_code == 200
    assert "approval_token" not in read.json()

    decision = client.get(
        f"/interviews/{interview_id}/decision",
        params={"action": "approve", "token": approval_token},
    )
    assert decision.status_code == 200

    with Session(e2e_engine) as session:
        interview = session.get(Interview, uuid.UUID(interview_id))
        assert interview.status == InterviewStatus.APROVADA
        assert interview.approval_token is None

    # Replaying the one-time link must fail
    replay = client.get(
        f"/interviews/{interview_id}/decision",
        params={"action": "reject", "token": approval_token},
    )
    assert replay.status_code == 401
