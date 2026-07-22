import { describe, expect, it } from 'vitest';

import { makeInterview, syntheticScorecard } from '../test/fixtures';
import {
  normalizeInterview,
  normalizeScorecard,
  normalizeSegments,
  normalizeTranscription,
} from './normalize';

const segments = [
  { speaker: 'SPEAKER_00', text: 'Olá.', start: 0, end: 1 },
  { speaker: 'SPEAKER_01', text: 'Oi.', start: 1, end: 2 },
];

describe('normalizeInterview — double-encoded payload (real backend shape)', () => {
  it('parses scorecard / transcription_raw / diarization_raw delivered as JSON strings', () => {
    // The live backend returns these three fields as JSON strings, not objects.
    const raw = makeInterview('aguardando_aprovacao', {
      scorecard: JSON.stringify(syntheticScorecard) as unknown as typeof syntheticScorecard,
      transcription_raw: JSON.stringify(segments) as unknown as typeof segments,
      diarization_raw: JSON.stringify(segments) as unknown as typeof segments,
    });

    const normalized = normalizeInterview(raw);

    expect(typeof normalized.scorecard).toBe('object');
    expect(normalized.scorecard?.candidate_name).toBe('Candidata Exemplo');
    expect(normalized.scorecard?.evaluations).toHaveLength(3);

    expect(Array.isArray(normalized.transcription_raw)).toBe(true);
    expect(Array.isArray(normalized.diarization_raw)).toBe(true);
    expect(normalized.diarization_raw?.[0].speaker).toBe('SPEAKER_00');
  });

  it('passes through already-parsed objects/lists unchanged (future-proof)', () => {
    const raw = makeInterview('aguardando_aprovacao', {
      scorecard: syntheticScorecard,
      transcription_raw: segments,
      diarization_raw: segments,
    });
    const normalized = normalizeInterview(raw);
    expect(normalized.scorecard).toEqual(syntheticScorecard);
    expect(normalized.transcription_raw).toEqual(segments);
    expect(normalized.diarization_raw).toEqual(segments);
  });

  it('keeps null fields as null', () => {
    const normalized = normalizeInterview(makeInterview('recebida'));
    expect(normalized.scorecard).toBeNull();
    expect(normalized.transcription_raw).toBeNull();
    expect(normalized.diarization_raw).toBeNull();
  });
});

describe('normalizeScorecard', () => {
  it('returns null for a malformed JSON string (does not throw)', () => {
    expect(normalizeScorecard('{"candidate_name": "x", oops not json')).toBeNull();
  });
  it('returns null for valid JSON that is not a scorecard', () => {
    expect(normalizeScorecard('[1,2,3]')).toBeNull();
    expect(normalizeScorecard('42')).toBeNull();
    expect(normalizeScorecard('{}')).toBeNull(); // no candidate_name
  });
  it('accepts a valid scorecard string', () => {
    const result = normalizeScorecard(JSON.stringify(syntheticScorecard));
    expect(result?.overall_recommendation).toBe('Próxima Etapa');
  });
});

describe('normalizeTranscription', () => {
  it('keeps genuine plain text (local mode) as a string', () => {
    const text = 'Transcrição corrida sem estrutura JSON.';
    expect(normalizeTranscription(text)).toBe(text);
  });
  it('parses a JSON-string segment list', () => {
    expect(normalizeTranscription(JSON.stringify(segments))).toEqual(segments);
  });
  it('preserves an already-parsed list and maps null', () => {
    expect(normalizeTranscription(segments)).toEqual(segments);
    expect(normalizeTranscription(null)).toBeNull();
  });
});

describe('normalizeSegments (diarization)', () => {
  it('parses a JSON-string list, passes through arrays, and nulls the rest', () => {
    expect(normalizeSegments(JSON.stringify(segments))).toEqual(segments);
    expect(normalizeSegments(segments)).toEqual(segments);
    expect(normalizeSegments('not json')).toBeNull();
    expect(normalizeSegments('"a string"')).toBeNull();
    expect(normalizeSegments(null)).toBeNull();
  });
});
