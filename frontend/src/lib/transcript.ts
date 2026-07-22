// Normalizes the two raw formats (transcription_raw as string OR segment list,
// diarization_raw as segment list) into speaker-labeled turns for rendering.
// Pure functions so the branching is unit-testable.

import type { RawTranscription, TranscriptSegment } from '../api/types';

export interface SpeakerTurn {
  speaker: string | null; // null => unknown/unlabeled speaker
  text: string;
  start: number | null;
}

function toTurn(segment: TranscriptSegment): SpeakerTurn {
  const speaker =
    typeof segment.speaker === 'string' && segment.speaker.trim()
      ? segment.speaker
      : null;
  return {
    speaker,
    text: segment.text ?? '',
    start: typeof segment.start === 'number' ? segment.start : null,
  };
}

// Prefer diarization (always speaker-labeled when present); fall back to the
// raw transcription, which in local mode may be a plain string or speaker-less
// segments.
export function buildTurns(
  transcription: RawTranscription,
  diarization: TranscriptSegment[] | null,
): SpeakerTurn[] {
  if (Array.isArray(diarization) && diarization.length > 0) {
    return diarization
      .filter((seg) => seg && typeof seg.text === 'string' && seg.text.trim())
      .map(toTurn);
  }

  if (typeof transcription === 'string') {
    const text = transcription.trim();
    return text ? [{ speaker: null, text, start: null }] : [];
  }

  if (Array.isArray(transcription)) {
    return transcription
      .filter((seg) => seg && typeof seg.text === 'string' && seg.text.trim())
      .map(toTurn);
  }

  return [];
}

export function hasTranscript(
  transcription: RawTranscription,
  diarization: TranscriptSegment[] | null,
): boolean {
  return buildTurns(transcription, diarization).length > 0;
}

// Stable colour bucket per speaker label, so SPEAKER_00 / SPEAKER_01 read
// consistently. Returns an index 0..(n-1) suitable for a CSS class suffix.
export function speakerColorIndex(speaker: string | null, palette = 6): number {
  if (!speaker) return 0;
  let hash = 0;
  for (let i = 0; i < speaker.length; i += 1) {
    hash = (hash * 31 + speaker.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % palette;
}
