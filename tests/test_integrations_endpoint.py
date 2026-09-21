import json

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

API_KEY = "SENTINEL-APIKEY"


@pytest.fixture(name="client")
def client_fixture():
    # /integrations reads only app.config.settings, so no DB session override
    # is needed here.
    with TestClient(app) as c:
        yield c


@pytest.fixture(name="populated_settings")
def populated_settings_fixture(monkeypatch):
    monkeypatch.setattr(settings, "slack_webhook_url", "https://hooks.slack.com/SENTINEL-SLACK-URL")
    monkeypatch.setattr(
        settings, "notification_webhook_url", "https://example.test/SENTINEL-WEBHOOK-URL"
    )
    monkeypatch.setattr(settings, "transcription_provider", "deepgram")
    monkeypatch.setattr(settings, "deepgram_api_key", "SENTINEL-DEEPGRAM-KEY")
    monkeypatch.setattr(settings, "deepgram_model", "nova-3")
    monkeypatch.setattr(settings, "openai_api_key", "SENTINEL-OPENAI-KEY")
    monkeypatch.setattr(settings, "hf_token", "SENTINEL-HF-TOKEN")
    monkeypatch.setattr(settings, "whisper_model", "base")
    monkeypatch.setattr(settings, "openrouter_api_key", "SENTINEL-OPENROUTER")
    monkeypatch.setattr(settings, "openrouter_model", "google/gemini-2.5-flash")
    monkeypatch.setattr(settings, "webhook_hmac_secret", "SENTINEL-HMAC")
    monkeypatch.setattr(settings, "api_key", API_KEY)


def get_integrations(client, key=API_KEY):
    return client.get("/integrations", headers={"X-API-Key": key})


def test_returns_full_shape_when_configured(client, populated_settings):
    response = get_integrations(client)

    assert response.status_code == 200
    assert response.json() == {
        "slack": {"configured": True},
        "webhook": {"configured": True},
        "transcription": {"provider": "deepgram", "model": "nova-3", "configured": True},
        "scoring": {
            "provider": "openrouter",
            "model": "google/gemini-2.5-flash",
            "configured": True,
        },
        "webhook_hmac": {"enabled": True},
        "api_key": {"enabled": True},
    }


def test_deepgram_provider(client, populated_settings, monkeypatch):
    monkeypatch.setattr(settings, "deepgram_model", "nova-2")

    assert get_integrations(client).json()["transcription"] == {
        "provider": "deepgram",
        "model": "nova-2",
        "configured": True,
    }


def test_openai_provider_reports_whisper_1(client, populated_settings, monkeypatch):
    monkeypatch.setattr(settings, "transcription_provider", "openai")

    assert get_integrations(client).json()["transcription"] == {
        "provider": "openai",
        "model": "whisper-1",
        "configured": True,
    }


def test_local_provider_is_gated_on_hf_token(client, populated_settings, monkeypatch):
    monkeypatch.setattr(settings, "transcription_provider", "local")
    monkeypatch.setattr(settings, "whisper_model", "large-v3")

    assert get_integrations(client).json()["transcription"] == {
        "provider": "local",
        "model": "large-v3",
        "configured": True,
    }

    # The local path needs pyannote diarization, which hard-fails without HF_TOKEN.
    monkeypatch.setattr(settings, "hf_token", "")
    assert get_integrations(client).json()["transcription"] == {
        "provider": "local",
        "model": "large-v3",
        "configured": False,
    }


def test_unknown_provider_has_no_model(client, populated_settings, monkeypatch):
    monkeypatch.setattr(settings, "transcription_provider", "assemblyai")

    assert get_integrations(client).json()["transcription"] == {
        "provider": "assemblyai",
        "model": None,
        "configured": False,
    }


@pytest.mark.parametrize(
    ("field", "path"),
    [
        ("slack_webhook_url", ("slack", "configured")),
        ("notification_webhook_url", ("webhook", "configured")),
        ("deepgram_api_key", ("transcription", "configured")),
        ("openrouter_api_key", ("scoring", "configured")),
        ("webhook_hmac_secret", ("webhook_hmac", "enabled")),
    ],
)
def test_flag_flips_to_false_when_secret_is_empty(
    client, populated_settings, monkeypatch, field, path
):
    section, key = path
    assert get_integrations(client).json()[section][key] is True

    monkeypatch.setattr(settings, field, "")
    assert get_integrations(client).json()[section][key] is False


def test_requires_api_key_when_configured(client, populated_settings):
    assert client.get("/integrations").status_code == 401
    assert get_integrations(client, key="wrong-key").status_code == 401
    assert get_integrations(client).status_code == 200


def test_allows_access_without_key_in_dev_mode(client, populated_settings, monkeypatch):
    monkeypatch.setattr(settings, "api_key", "")

    response = client.get("/integrations")

    assert response.status_code == 200
    assert response.json()["api_key"] == {"enabled": False}


def test_never_leaks_secret_values(client, populated_settings):
    body = json.dumps(get_integrations(client).json())

    for secret in (
        settings.slack_webhook_url,
        settings.notification_webhook_url,
        settings.deepgram_api_key,
        settings.openai_api_key,
        settings.hf_token,
        settings.openrouter_api_key,
        settings.webhook_hmac_secret,
        settings.api_key,
    ):
        assert secret not in body

    # Guards against masked/partial echoes of the same values.
    for fragment in (
        "SENTINEL",
        "hooks.slack.com",
        "example.test",
        "https://",
        "***",
    ):
        assert fragment not in body
