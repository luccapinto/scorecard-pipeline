import { describe, expect, it } from 'vitest';

import type { Interview } from '../api/types';
import { makeInterview, syntheticScorecard } from '../test/fixtures';
import { createProjector } from './projection';

function row(id: string, overrides: Partial<Interview> = {}): Interview {
  return makeInterview('aguardando_aprovacao', { id, ...overrides });
}

describe('createProjector', () => {
  it('summarizes a scorecard into name, recommendation, scores and evidence tally', () => {
    const project = createProjector();
    const [summary] = project([row('a', { scorecard: syntheticScorecard })]);

    expect(summary.candidateName).toBe('Candidata Exemplo');
    expect(summary.recommendation).toBe('Próxima Etapa');
    expect(summary.competencyCount).toBe(3);
    expect(summary.scores).toEqual([4, 2, 3]);
    expect(summary.averageScore).toBeCloseTo(3, 10);
    // One verified, one hallucinated, one never checked.
    expect(summary.evidence).toEqual({ verified: 1, unverified: 1, unchecked: 1 });
    expect(summary.hasScorecard).toBe(true);
    expect(summary.needsAction).toBe(true);
  });

  it('raises hasEvidenceAlert only when a competency is explicitly unverified', () => {
    const project = createProjector();
    const evaluations = syntheticScorecard.evaluations;

    const [flagged] = project([row('a', { scorecard: syntheticScorecard })]);
    expect(flagged.hasEvidenceAlert).toBe(true);

    // Same scorecard minus the `false` competency: verified + unchecked only.
    const clean = {
      ...syntheticScorecard,
      evaluations: evaluations.filter((e) => e.evidence_verified !== false),
    };
    const [ok] = createProjector()([row('a', { scorecard: clean })]);
    expect(ok.evidence).toEqual({ verified: 1, unverified: 0, unchecked: 1 });
    expect(ok.hasEvidenceAlert).toBe(false);
  });

  it('parses naive backend timestamps as UTC, not as local time', () => {
    // app/main.py emits `utcnow().isoformat()` — no `Z`, no offset. Reading
    // those with `new Date(...)` would shift every age by the viewer's offset.
    const project = createProjector();
    const [summary] = project([
      row('a', { created_at: '2026-07-21T12:00:00', updated_at: '2026-07-21T12:30:00' }),
    ]);

    expect(summary.createdAt).toBe(Date.parse('2026-07-21T12:00:00Z'));
    expect(summary.updatedAt).toBe(Date.parse('2026-07-21T12:30:00Z'));
    // The raw strings are kept verbatim for display.
    expect(summary.createdAtIso).toBe('2026-07-21T12:00:00');
  });

  it('agrees with itself for an explicit-offset timestamp', () => {
    const project = createProjector();
    const [summary] = project([
      row('a', { created_at: '2026-07-21T09:00:00-03:00', updated_at: '2026-07-21T12:00:00Z' }),
    ]);
    expect(summary.createdAt).toBe(Date.parse('2026-07-21T12:00:00Z'));
    expect(summary.updatedAt).toBe(Date.parse('2026-07-21T12:00:00Z'));
  });

  it('returns the identical array instance when nothing moved', () => {
    const project = createProjector();
    const input = [row('a'), row('b')];

    const first = project(input);
    const second = project([...input]);

    expect(second).toBe(first);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  it('rebuilds only the row whose updated_at moved', () => {
    const project = createProjector();
    const first = project([row('a'), row('b')]);

    const second = project([
      row('a', { updated_at: '2026-07-21T13:00:00Z', status: 'aprovada' }),
      row('b'),
    ]);

    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0].status).toBe('aprovada');
    expect(second[1]).toBe(first[1]);
  });

  it('evicts a removed interview instead of caching it forever', () => {
    const project = createProjector();
    const both = project([row('a'), row('b')]);
    const originalA = both[0];

    project([row('b')]);
    const readded = project([row('a'), row('b')]);

    // A fresh object proves the entry was pruned rather than retained.
    expect(readded[0]).not.toBe(originalA);
    expect(readded[0]).toEqual(originalA);
  });

  it('tolerates a null scorecard and null evaluations without throwing', () => {
    const project = createProjector();
    const malformed = { evaluations: null } as unknown as Interview['scorecard'];

    const [none, broken] = project([row('a', { scorecard: null }), row('b', { scorecard: malformed })]);

    for (const summary of [none, broken]) {
      expect(summary.evidence).toEqual({ verified: 0, unverified: 0, unchecked: 0 });
      expect(summary.competencyCount).toBe(0);
      expect(summary.scores).toEqual([]);
      expect(summary.averageScore).toBeNull();
      expect(summary.hasEvidenceAlert).toBe(false);
    }
    expect(none.hasScorecard).toBe(false);
    expect(none.candidateName).toBeNull();
    expect(none.recommendation).toBeNull();
  });

  it('gives each projector its own cache', () => {
    const a = createProjector();
    const b = createProjector();
    const input = [row('a')];

    expect(b(input)[0]).not.toBe(a(input)[0]);
  });

  it('flags a row that carries an error log', () => {
    const project = createProjector();
    const [empty, failed] = project([
      row('a', { error_log: '' }),
      row('b', { error_log: 'Traceback (most recent call last):\nValueError: x' }),
    ]);
    expect(empty.hasError).toBe(false);
    expect(failed.hasError).toBe(true);
  });
});
