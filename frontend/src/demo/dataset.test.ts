import { describe, expect, it } from 'vitest';

import type { Interview } from '../api/types';
import { INTERVIEW_STATUSES } from '../api/types';
import { quoteIsInTranscript } from '../lib/evidence';
import { buildDemoInterviews } from './dataset';
import { DEMO_DIALOGUES, consolidate } from './transcripts';

// These pin the coverage the demo dataset promises: every pipeline state is
// represented, and nothing about it is faked.

const ANCHOR = Date.parse('2026-07-21T12:00:00Z');
const interviews = buildDemoInterviews(ANCHOR);

function evaluationsOf(interview: Interview) {
  return interview.scorecard?.evaluations ?? [];
}

describe('buildDemoInterviews', () => {
  it('produces a dataset small enough to read and large enough to be a demo', () => {
    expect(interviews.length).toBeGreaterThanOrEqual(15);
    expect(interviews.length).toBeLessThanOrEqual(25);
  });

  it('marks every id as demo data', () => {
    for (const interview of interviews) {
      expect(interview.id.startsWith('demo-')).toBe(true);
    }
  });

  it('covers all eight pipeline statuses', () => {
    const present = new Set(interviews.map((interview) => interview.status));
    for (const status of INTERVIEW_STATUSES) {
      expect(present).toContain(status);
    }
  });

  it('is sorted newest first, as GET /interviews returns', () => {
    const created = interviews.map((interview) => Date.parse(`${interview.created_at}Z`));
    expect(created).toEqual([...created].sort((a, b) => b - a));
  });

  it('emits naive UTC timestamps, exactly like the backend', () => {
    for (const interview of interviews) {
      expect(interview.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(interview.created_at.endsWith('Z')).toBe(false);
      expect(interview.updated_at.endsWith('Z')).toBe(false);
    }
  });

  it('covers every evidence verification state', () => {
    const states = interviews.map((interview) => ({
      id: interview.id,
      values: evaluationsOf(interview).map((evaluation) => evaluation.evidence_verified),
    }));

    const withAlert = states.filter((row) => row.values.includes(false));
    const withUnchecked = states.filter((row) => row.values.includes(null));
    const withVerified = states.filter((row) => row.values.includes(true));

    expect(withAlert.length).toBeGreaterThanOrEqual(2);
    expect(withUnchecked.length).toBeGreaterThanOrEqual(1);
    expect(withVerified.length).toBeGreaterThanOrEqual(1);
  });

  it('has exactly two failures, each with a real Python traceback', () => {
    const failed = interviews.filter((interview) => interview.status === 'falhou');
    expect(failed).toHaveLength(2);

    for (const interview of failed) {
      expect(interview.error_log).not.toBeNull();
      expect(interview.error_log!.startsWith('Traceback (most recent call last):')).toBe(true);
      expect(interview.error_log).toContain('File "');
    }
  });

  it('records an error log only for failures', () => {
    for (const interview of interviews) {
      if (interview.status !== 'falhou') expect(interview.error_log).toBeNull();
    }
  });

  it('includes a deduplication fixture carrying an external_id', () => {
    const deduped = interviews.filter((interview) => interview.external_id !== null);
    expect(deduped.length).toBeGreaterThanOrEqual(1);
    expect(deduped[0].external_id).toBeTruthy();
  });

  it('includes a local-provider interview whose transcription is a plain string', () => {
    const local = interviews.filter((interview) => typeof interview.transcription_raw === 'string');
    expect(local.length).toBeGreaterThanOrEqual(1);
    for (const interview of local) {
      // The local provider returns one speaker-less block and no diarization,
      // which exercises the no-speaker render path.
      expect(interview.diarization_raw).toBeNull();
      expect((interview.transcription_raw as string).length).toBeGreaterThan(0);
    }
  });

  it('matches artefact presence to the pipeline stage', () => {
    for (const interview of interviews) {
      const { status, transcription_raw: transcription, scorecard } = interview;

      if (status === 'recebida' || status === 'transcrevendo') {
        expect(transcription).toBeNull();
        expect(scorecard).toBeNull();
      }
      if (status === 'diarizando') {
        expect(transcription).not.toBeNull();
        expect(scorecard).toBeNull();
      }
      if (status === 'aguardando_aprovacao' || status === 'aprovada' || status === 'rejeitada') {
        expect(transcription).not.toBeNull();
        expect(scorecard).not.toBeNull();
        expect(evaluationsOf(interview).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('determinism', () => {
  it('returns byte-identical data for the same anchor', () => {
    expect(buildDemoInterviews(ANCHOR)).toEqual(buildDemoInterviews(ANCHOR));
  });

  it('shifts only the timestamps when the anchor moves', () => {
    const shifted = buildDemoInterviews(ANCHOR + 90 * 60_000);

    expect(shifted.map((interview) => interview.id)).toEqual(
      interviews.map((interview) => interview.id),
    );

    const strip = (list: Interview[]) =>
      list.map(({ created_at: _created, updated_at: _updated, ...rest }) => rest);
    expect(strip(shifted)).toEqual(strip(interviews));

    for (let index = 0; index < shifted.length; index += 1) {
      const before = Date.parse(`${interviews[index].created_at}Z`);
      const after = Date.parse(`${shifted[index].created_at}Z`);
      expect(after - before).toBe(90 * 60_000);
    }
  });
});

describe('evidence flags are derived, not declared', () => {
  it('agrees with an actual transcript search for every evaluated quote', () => {
    // This is the point of the whole dataset: a flagged quote is flagged
    // because it genuinely is not in the transcript, using the same
    // normalisation rule the backend applies.
    let verifiedSeen = 0;
    let unverifiedSeen = 0;

    for (const interview of interviews) {
      const evaluations = evaluationsOf(interview);
      if (evaluations.length === 0) continue;

      const dialogue = DEMO_DIALOGUES[interview.job_id!];
      expect(dialogue).toBeDefined();
      const transcript = consolidate(dialogue.turns);

      for (const evaluation of evaluations) {
        const found = quoteIsInTranscript(evaluation.evidence_quote, transcript);
        if (evaluation.evidence_verified === true) {
          expect(found).toBe(true);
          verifiedSeen += 1;
        } else if (evaluation.evidence_verified === false) {
          expect(found).toBe(false);
          unverifiedSeen += 1;
        }
      }
    }

    expect(verifiedSeen).toBeGreaterThan(0);
    expect(unverifiedSeen).toBeGreaterThan(0);
  });

  it('keeps every score inside the BARS range with a non-empty quote and justification', () => {
    for (const interview of interviews) {
      for (const evaluation of evaluationsOf(interview)) {
        expect(evaluation.score).toBeGreaterThanOrEqual(1);
        expect(evaluation.score).toBeLessThanOrEqual(5);
        expect(evaluation.evidence_quote.length).toBeGreaterThan(0);
        expect(evaluation.justification.length).toBeGreaterThan(0);
      }
    }
  });
});
