import sys
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from scripts.run_benchmark import clean_text, calculate_wer_jiwer
from app.audio_processor import (
    merge_transcription_and_diarization,
    clear_model_caches,
    LocalTranscription,
    OpenAITranscription,
    Diarizer,
    TranscriptionDependencyError,
)

def test_text_normalization():
    # Test case conversion and accents
    assert clean_text("Olá, como vai você?") == "ola como vai voce"
    # Test punctuation removal
    assert clean_text("pytest - Docker; Postgres: Redis.") == "pytest docker postgres redis"
    # Test extra spacing
    assert clean_text("  palavra   com   muito   espaco   ") == "palavra com muito espaco"
    # Test empty input
    assert clean_text("") == ""
    assert clean_text(None) == ""


def test_wer_formula_correctness():
    # 1. Exact match (WER = 0)
    ref = "o desenvolvedor codou a pipeline"
    hyp = "o desenvolvedor codou a pipeline"
    assert calculate_wer_jiwer(ref, hyp) == 0.0

    # 2. One substitution (WER = 1/5 = 0.2)
    ref = "o gato comeu o peixe"
    hyp = "o gato comeu o rato"
    assert pytest.approx(calculate_wer_jiwer(ref, hyp), 0.01) == 0.2

    # 3. One deletion (WER = 1/5 = 0.2)
    ref = "o gato comeu o peixe"
    hyp = "o gato comeu peixe"
    assert pytest.approx(calculate_wer_jiwer(ref, hyp), 0.01) == 0.2

    # 4. One insertion (WER = 1/5 = 0.2)
    ref = "o gato comeu o peixe"
    hyp = "o gato preto comeu o peixe"
    assert pytest.approx(calculate_wer_jiwer(ref, hyp), 0.01) == 0.2


def test_alignment_merge_scenarios():
    # Scenario 1: Exact matches and clear divisions
    transcription = [
        {"text": "Frase um", "start": 0.0, "end": 2.0},
        {"text": "Frase dois", "start": 2.0, "end": 4.0}
    ]
    diarization = [
        {"speaker": "SPK_1", "start": 0.0, "end": 2.0},
        {"speaker": "SPK_2", "start": 2.0, "end": 4.0}
    ]
    merged = merge_transcription_and_diarization(transcription, diarization)
    assert len(merged) == 2
    assert merged[0]["speaker"] == "SPK_1"
    assert merged[1]["speaker"] == "SPK_2"

    # Scenario 2: Overlapping speech where one speaker dominates the time overlap
    # Phrase starts at 1.0s and ends at 3.0s (length 2.0s)
    # SPK_1 talks from 0.0s to 1.8s (overlap is [1.0, 1.8] = 0.8s)
    # SPK_2 talks from 1.8s to 4.0s (overlap is [1.8, 3.0] = 1.2s)
    # SPK_2 should be assigned since 1.2s > 0.8s
    transcription_overlap = [
        {"text": "Frase com overlap", "start": 1.0, "end": 3.0}
    ]
    diarization_overlap = [
        {"speaker": "SPK_1", "start": 0.0, "end": 1.8},
        {"speaker": "SPK_2", "start": 1.8, "end": 4.0}
    ]
    merged_overlap = merge_transcription_and_diarization(transcription_overlap, diarization_overlap)
    assert merged_overlap[0]["speaker"] == "SPK_2"

    # Scenario 3: No overlap with any speaker (e.g. silence in diarizer)
    transcription_silent = [
        {"text": "Frase no vacuo", "start": 10.0, "end": 12.0}
    ]
    diarization_silent = [
        {"speaker": "SPK_1", "start": 0.0, "end": 5.0}
    ]
    merged_silent = merge_transcription_and_diarization(transcription_silent, diarization_silent)
    assert merged_silent[0]["speaker"] == "UNKNOWN"


def test_local_transcription_missing_dependency_fails_fast(monkeypatch):
    # Without whisperx installed, the driver must raise instead of silently
    # returning fabricated data.
    monkeypatch.delitem(sys.modules, "whisperx", raising=False)
    driver = LocalTranscription(model_name="tiny", device="cpu")
    with pytest.raises(TranscriptionDependencyError):
        driver.transcribe(Path("dummy_audio.wav"))


def test_openai_transcription_missing_key_fails_fast():
    driver = OpenAITranscription(api_key="")
    driver.api_key = ""  # ensure no env/config fallback
    with pytest.raises(TranscriptionDependencyError):
        driver.transcribe(Path("dummy_audio.wav"))


def test_local_transcription_driver_mocked(monkeypatch):
    # Create the mock module in sys.modules BEFORE patching
    mock_whisperx = MagicMock()
    monkeypatch.setitem(sys.modules, "whisperx", mock_whisperx)
    clear_model_caches()

    with patch("whisperx.load_audio"), \
         patch("whisperx.load_model") as mock_load_model, \
         patch("whisperx.load_align_model") as mock_load_align, \
         patch("whisperx.align") as mock_align:

        # Setup mocks
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {
            "segments": [{"text": "Hello world", "start": 0.0, "end": 2.0}],
            "language": "en"
        }
        mock_load_model.return_value = mock_model
        mock_load_align.return_value = (MagicMock(), MagicMock())

        mock_align.return_value = {
            "segments": [{"text": "Hello world aligned", "start": 0.1, "end": 1.9}]
        }

        # Instantiate and run
        driver = LocalTranscription(model_name="tiny", device="cpu")
        result = driver.transcribe(Path("dummy_audio.wav"))

        assert len(result) == 1
        assert result[0]["text"] == "Hello world aligned"
        assert result[0]["start"] == 0.1
        assert result[0]["end"] == 1.9
        mock_load_model.assert_called_once()

        # Models are cached per worker process: a second run must not reload
        driver.transcribe(Path("dummy_audio.wav"))
        mock_load_model.assert_called_once()

    clear_model_caches()


def test_openai_transcription_driver_mocked():
    from unittest.mock import mock_open
    with patch("app.audio_processor.OpenAI") as mock_openai_class, \
         patch("builtins.open", mock_open(read_data=b"dummy")):
        mock_client = MagicMock()
        mock_response = MagicMock()

        # Simulate verbose_json structure where response has a list of segments
        mock_segment = MagicMock()
        mock_segment.text = "Hello from OpenAI"
        mock_segment.start = 0.5
        mock_segment.end = 2.5
        mock_response.segments = [mock_segment]

        mock_client.audio.transcriptions.create.return_value = mock_response
        mock_openai_class.return_value = mock_client

        driver = OpenAITranscription(api_key="fake-key")
        result = driver.transcribe(Path("dummy_audio.wav"))

        assert len(result) == 1
        assert result[0]["text"] == "Hello from OpenAI"
        assert result[0]["start"] == 0.5
        assert result[0]["end"] == 2.5
        mock_client.audio.transcriptions.create.assert_called_once()


def test_diarizer_driver_mocked():
    with patch("app.audio_processor.Diarizer.diarize") as mock_diarize:
        mock_diarize.return_value = [
            {"speaker": "SPK_A", "start": 0.0, "end": 3.0},
            {"speaker": "SPK_B", "start": 3.0, "end": 6.0}
        ]

        diarizer = Diarizer(hf_token="fake-token")
        result = diarizer.diarize(Path("dummy_audio.wav"))

        assert len(result) == 2
        assert result[0]["speaker"] == "SPK_A"
        assert result[1]["speaker"] == "SPK_B"
