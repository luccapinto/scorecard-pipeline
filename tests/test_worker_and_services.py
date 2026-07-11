import sys
import importlib
from pathlib import Path

import pytest
from unittest.mock import patch

import run_worker
from app.config import settings
from app.services import assert_public_http_url, assert_allowed_local_path, AudioSource


def test_run_worker_module_imports():
    """
    Smoke test: the worker module must import against the pinned RQ version.
    (Guards against removed/renamed RQ APIs breaking worker startup, which
    unit tests that mock the queue would never catch.)
    """
    importlib.reload(run_worker)
    assert callable(run_worker.start_worker)


def test_validate_runtime_dependencies_fails_without_ml_backend(monkeypatch):
    # With provider=local and whisperx absent, the worker must refuse to start
    # instead of silently processing interviews with fabricated data.
    monkeypatch.delitem(sys.modules, "whisperx", raising=False)
    monkeypatch.setattr(settings, "transcription_provider", "local")
    with pytest.raises(RuntimeError, match="whisperx"):
        run_worker.validate_runtime_dependencies()


def test_validate_runtime_dependencies_openai_requires_key(monkeypatch):
    monkeypatch.setattr(settings, "transcription_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        run_worker.validate_runtime_dependencies()


# ==========================================
# SSRF guard
# ==========================================
def test_ssrf_guard_blocks_private_hosts():
    for url in (
        "http://127.0.0.1/audio.wav",
        "http://localhost/audio.wav",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.5/audio.wav",
        "http://192.168.1.1/audio.wav",
    ):
        with pytest.raises(ValueError):
            assert_public_http_url(url)


def test_ssrf_guard_blocks_non_http_schemes():
    with pytest.raises(ValueError):
        assert_public_http_url("ftp://example.com/audio.wav")
    with pytest.raises(ValueError):
        assert_public_http_url("file:///etc/passwd")


def test_local_path_guard(tmp_path, monkeypatch):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    inside = allowed / "audio.wav"
    inside.write_bytes(b"x")
    outside = tmp_path / "outside.wav"
    outside.write_bytes(b"x")

    monkeypatch.setattr(settings, "audio_allowed_dir", str(allowed))

    assert assert_allowed_local_path(str(inside)) == inside.resolve()

    with pytest.raises(ValueError):
        assert_allowed_local_path(str(outside))

    # Path traversal out of the allowed dir is rejected
    with pytest.raises(ValueError):
        assert_allowed_local_path(str(allowed / ".." / "outside.wav"))

    with pytest.raises(FileNotFoundError):
        assert_allowed_local_path(str(allowed / "missing.wav"))


# ==========================================
# AudioSource: single download per job
# ==========================================
def test_audio_source_downloads_remote_audio_once():
    fake_path = Path("/tmp/downloaded.wav")
    with patch("app.services.download_audio", return_value=fake_path) as mock_download:
        source = AudioSource("https://cdn.example.com/audio.wav")
        assert source.path() == fake_path
        assert source.path() == fake_path  # second access reuses the download
        mock_download.assert_called_once()


def test_audio_source_local_path(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "audio_allowed_dir", "")
    local = tmp_path / "audio.wav"
    local.write_bytes(b"x")
    with AudioSource(str(local)) as source:
        assert source.path() == local.resolve()
    # Local files are never deleted by cleanup
    assert local.exists()


def test_download_audio_enforces_size_limit(monkeypatch):
    import app.services as services

    monkeypatch.setattr(settings, "max_audio_bytes", 10)

    class FakeResponse:
        def raise_for_status(self):
            return None

        def iter_bytes(self):
            yield b"x" * 100

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

    monkeypatch.setattr(services, "assert_public_http_url", lambda url: None)
    with patch("httpx.stream", return_value=FakeResponse()):
        with pytest.raises(ValueError, match="maximum size"):
            services.download_audio("https://cdn.example.com/big.wav")
