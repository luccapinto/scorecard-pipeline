import logging
import threading
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Dict, Any, Optional

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)


class TranscriptionDependencyError(RuntimeError):
    """Raised when the configured transcription/diarization backend is unavailable."""
    pass


# Process-wide model caches: loading Whisper/pyannote models takes tens of
# seconds to minutes, so they must be loaded once per worker process and
# reused across jobs, never per call.
_MODEL_CACHE: Dict[Any, Any] = {}
_MODEL_CACHE_LOCK = threading.Lock()


def clear_model_caches() -> None:
    """Clears cached ML models (used by tests)."""
    with _MODEL_CACHE_LOCK:
        _MODEL_CACHE.clear()


def _cached(key, loader):
    with _MODEL_CACHE_LOCK:
        if key not in _MODEL_CACHE:
            _MODEL_CACHE[key] = loader()
        return _MODEL_CACHE[key]


class BaseTranscription(ABC):
    """Base interface for all transcription providers."""
    @abstractmethod
    def transcribe(self, audio_path: Path) -> List[Dict[str, Any]]:
        """
        Transcribes the audio file.
        Returns a list of dicts: [{"text": str, "start": float, "end": float}]
        """
        pass


class LocalTranscription(BaseTranscription):
    """Local Whisper transcription driver using WhisperX."""
    def __init__(
        self,
        model_name: str = "base",
        device: str = "cpu",
        compute_type: str = "int8",
        language: Optional[str] = None,
        batch_size: Optional[int] = None,
    ):
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self.language = language or settings.whisper_language
        self.batch_size = batch_size or settings.whisper_batch_size

    def transcribe(self, audio_path: Path) -> List[Dict[str, Any]]:
        logger.info(
            f"Starting local transcription with WhisperX ({self.model_name}) "
            f"on {self.device}, language={self.language}"
        )
        try:
            import whisperx
        except ImportError as e:
            raise TranscriptionDependencyError(
                "TRANSCRIPTION_PROVIDER=local requires whisperx to be installed "
                "(pip install -r requirements-ml.txt)."
            ) from e

        audio = whisperx.load_audio(str(audio_path))
        model = _cached(
            ("whisperx", self.model_name, self.device, self.compute_type, self.language),
            lambda: whisperx.load_model(
                self.model_name,
                self.device,
                compute_type=self.compute_type,
                language=self.language,
            ),
        )
        result = model.transcribe(audio, batch_size=self.batch_size)

        # Align whisper output for accurate word/segment timestamps.
        # Timestamps feed the diarization merge, so degradation is logged loudly.
        try:
            language_code = result.get("language", self.language)
            model_a, metadata = _cached(
                ("whisperx-align", language_code, self.device),
                lambda: whisperx.load_align_model(
                    language_code=language_code,
                    device=self.device
                ),
            )
            aligned_result = whisperx.align(
                result["segments"],
                model_a,
                metadata,
                audio,
                self.device,
                return_char_alignments=False
            )
            segments = aligned_result["segments"]
        except Exception as e:
            logger.error(
                f"WhisperX alignment failed, using unaligned segments; "
                f"speaker attribution accuracy will degrade. Error: {str(e)}"
            )
            segments = result["segments"]

        formatted = []
        for seg in segments:
            formatted.append({
                "text": seg["text"].strip(),
                "start": float(seg["start"]),
                "end": float(seg["end"])
            })
        return formatted


class OpenAITranscription(BaseTranscription):
    """Cloud transcription driver using OpenAI's Audio API (whisper-1)."""
    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.openai_api_key

    def transcribe(self, audio_path: Path) -> List[Dict[str, Any]]:
        logger.info("Starting OpenAI transcription via API")
        if not self.api_key:
            raise TranscriptionDependencyError(
                "OPENAI_API_KEY is required for TRANSCRIPTION_PROVIDER=openai."
            )

        client = OpenAI(api_key=self.api_key)
        with open(audio_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json"
            )

        segments = []
        if hasattr(response, "segments"):
            segments = response.segments
        elif isinstance(response, dict) and "segments" in response:
            segments = response["segments"]

        formatted = []
        for seg in segments:
            if isinstance(seg, dict):
                text = seg.get("text", "")
                start = seg.get("start", 0.0)
                end = seg.get("end", 0.0)
            else:
                text = getattr(seg, "text", "")
                start = getattr(seg, "start", 0.0)
                end = getattr(seg, "end", 0.0)
            formatted.append({
                "text": text.strip(),
                "start": float(start),
                "end": float(end)
            })
        return formatted


class Diarizer:
    """Speaker Diarization driver using pyannote.audio."""
    def __init__(self, hf_token: str = None):
        self.hf_token = hf_token or settings.hf_token

    def diarize(self, audio_path: Path) -> List[Dict[str, Any]]:
        logger.info("Starting speaker diarization with pyannote.audio")
        try:
            from pyannote.audio import Pipeline
        except ImportError as e:
            raise TranscriptionDependencyError(
                "Diarization requires pyannote.audio to be installed "
                "(pip install -r requirements-ml.txt)."
            ) from e

        if not self.hf_token:
            raise TranscriptionDependencyError(
                "HF_TOKEN environment variable or parameter is required for Pyannote diarization."
            )

        pipeline = _cached(
            ("pyannote", "pyannote/speaker-diarization-3.1", self.hf_token),
            lambda: Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=self.hf_token
            ),
        )
        if pipeline is None:
            raise ValueError(
                "Failed to load pyannote/speaker-diarization-3.1 pipeline. "
                "Check token and network connection."
            )

        diarization = pipeline(str(audio_path))

        segments = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "speaker": speaker,
                "start": float(turn.start),
                "end": float(turn.end)
            })
        return segments


def merge_transcription_and_diarization(
    transcription: List[Dict[str, Any]],
    diarization: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Aligns and merges transcription segments with speaker diarization segments.
    For each transcription segment, calculates the overlap with each diarization segment
    and assigns the speaker with the maximum total overlap.
    """
    merged = []

    for tx_seg in transcription:
        tx_start = tx_seg["start"]
        tx_end = tx_seg["end"]
        tx_text = tx_seg["text"]

        # Calculate overlaps with all speaker segments
        speaker_overlaps = {}
        for d_seg in diarization:
            d_start = d_seg["start"]
            d_end = d_seg["end"]
            speaker = d_seg["speaker"]

            # Intersection of [tx_start, tx_end] and [d_start, d_end]
            overlap = max(0.0, min(tx_end, d_end) - max(tx_start, d_start))
            if overlap > 0:
                speaker_overlaps[speaker] = speaker_overlaps.get(speaker, 0.0) + overlap

        # Find the speaker with the maximum overlap
        if speaker_overlaps:
            best_speaker = max(speaker_overlaps, key=speaker_overlaps.get)
        else:
            # Fallback speaker if no overlap exists (e.g. silence or mismatch)
            best_speaker = "UNKNOWN"

        merged.append({
            "speaker": best_speaker,
            "text": tx_text,
            "start": tx_start,
            "end": tx_end
        })

    # Sort merged result by start time to maintain timeline integrity
    merged.sort(key=lambda x: x["start"])
    return merged
