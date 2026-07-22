import { describe, expect, it } from 'vitest';

import type { TranscriptSegment } from '../api/types';
import { buildTurns, hasTranscript, speakerColorIndex } from './transcript';

describe('buildTurns', () => {
  it('prefers diarization (speaker-labeled) when present', () => {
    const diarization: TranscriptSegment[] = [
      { speaker: 'SPEAKER_00', text: 'Olá, tudo bem?', start: 0, end: 2 },
      { speaker: 'SPEAKER_01', text: 'Tudo, obrigada.', start: 2, end: 4 },
    ];
    const turns = buildTurns('texto corrido ignorado', diarization);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ speaker: 'SPEAKER_00', text: 'Olá, tudo bem?', start: 0 });
    expect(turns[1].speaker).toBe('SPEAKER_01');
  });

  it('falls back to a plain-string transcription with a null speaker', () => {
    const turns = buildTurns('Uma transcrição sem falantes.', null);
    expect(turns).toEqual([{ speaker: null, text: 'Uma transcrição sem falantes.', start: null }]);
  });

  it('handles speaker-less transcription segments (local mode)', () => {
    const transcription: TranscriptSegment[] = [
      { text: 'Primeiro trecho.', start: 0 },
      { text: 'Segundo trecho.', start: 5 },
    ];
    const turns = buildTurns(transcription, null);
    expect(turns).toHaveLength(2);
    expect(turns[0].speaker).toBeNull();
    expect(turns[0].text).toBe('Primeiro trecho.');
  });

  it('drops empty/whitespace segments', () => {
    const diarization: TranscriptSegment[] = [
      { speaker: 'SPEAKER_00', text: '   ' },
      { speaker: 'SPEAKER_00', text: 'conteúdo' },
    ];
    expect(buildTurns(null, diarization)).toHaveLength(1);
  });

  it('returns [] for null/empty input', () => {
    expect(buildTurns(null, null)).toEqual([]);
    expect(buildTurns('', [])).toEqual([]);
  });
});

describe('hasTranscript', () => {
  it('reflects whether any turn exists', () => {
    expect(hasTranscript(null, null)).toBe(false);
    expect(hasTranscript('algo', null)).toBe(true);
  });
});

describe('speakerColorIndex', () => {
  it('is stable per speaker and within palette bounds', () => {
    const a = speakerColorIndex('SPEAKER_00');
    const b = speakerColorIndex('SPEAKER_00');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(6);
  });
  it('maps null to bucket 0', () => {
    expect(speakerColorIndex(null)).toBe(0);
  });
});
