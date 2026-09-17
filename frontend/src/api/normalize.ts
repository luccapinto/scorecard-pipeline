// The backend stores scorecard / transcription_raw / diarization_raw in
// JSON/JSONB columns and normally returns them already parsed. But data
// written through other paths (manual inserts, older dumps, a client that
// stringifies before saving) can arrive double-encoded as JSON *strings* —
// observed against a live backend seeded that way. We normalize here, at the
// API boundary, so components always receive the shapes their types promise,
// whichever form the payload takes. A decision screen must not crash over a
// serialization quirk.

import type { Interview, RawTranscription, Scorecard, TranscriptSegment } from './types';

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isScorecardShape(value: unknown): value is Scorecard {
  // Minimal structural check: a real scorecard is an object with a
  // candidate_name. The Scorecard component defends against a malformed
  // `evaluations` on its own, so we don't over-validate here.
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { candidate_name?: unknown }).candidate_name === 'string'
  );
}

// Accepts a JSON string, an already-parsed object, or null. Anything that
// doesn't look like a scorecard (invalid JSON, wrong shape) becomes null so
// the screen shows an empty/pending state instead of crashing.
export function normalizeScorecard(value: unknown): Scorecard | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? tryParseJson(value) : value;
  return isScorecardShape(parsed) ? parsed : null;
}

// transcription_raw can be: a JSON string of segments, an already-parsed
// segment list, or plain text (local mode). A string that is NOT a JSON array
// is legitimate plain text and is preserved as-is.
export function normalizeTranscription(value: unknown): RawTranscription {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value as TranscriptSegment[];
  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    if (Array.isArray(parsed)) return parsed as TranscriptSegment[];
    // Not a JSON array -> genuine plain-text transcript (or garbage we still
    // render as text rather than dropping it).
    return value;
  }
  return null;
}

// diarization_raw is always a segment list when present. A JSON string is
// parsed; anything that isn't an array becomes null.
export function normalizeSegments(value: unknown): TranscriptSegment[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value as TranscriptSegment[];
  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    if (Array.isArray(parsed)) return parsed as TranscriptSegment[];
  }
  return null;
}

export function normalizeInterview(raw: Interview): Interview {
  return {
    ...raw,
    scorecard: normalizeScorecard(raw.scorecard),
    transcription_raw: normalizeTranscription(raw.transcription_raw),
    diarization_raw: normalizeSegments(raw.diarization_raw),
  };
}
