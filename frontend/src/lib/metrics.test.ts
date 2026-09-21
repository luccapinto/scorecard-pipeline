import { describe, expect, it } from 'vitest';

import type { CompetencyEvaluation, Interview, InterviewStatus, Scorecard } from '../api/types';
import { makeInterview, syntheticScorecard } from '../test/fixtures';
import { computeMetrics, msSinceUpdate, withinPeriod } from './metrics';
import { createProjector, type InterviewSummary } from './projection';

const NOW = Date.parse('2026-07-21T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

/** Runs the real projection so metrics see exactly what the app feeds them. */
function project(interviews: Interview[]): InterviewSummary[] {
  return createProjector()(interviews);
}

function evaluation(
  score: number,
  verified: boolean | null,
  name = `Competência ${score}`,
): CompetencyEvaluation {
  return {
    competency_name: name,
    score,
    justification: 'Justificativa sintética.',
    evidence_quote: 'trecho sintético',
    evidence_verified: verified,
  };
}

function scorecard(evaluations: CompetencyEvaluation[]): Scorecard {
  return {
    candidate_name: 'Candidata Exemplo',
    overall_recommendation: 'Próxima Etapa',
    evaluations,
  };
}

function at(id: string, status: InterviewStatus, overrides: Partial<Interview> = {}): Interview {
  return makeInterview(status, { id, ...overrides });
}

describe('computeMetrics', () => {
  it('counts every status and the derived groupings', () => {
    const summaries = project([
      at('a', 'recebida'),
      at('b', 'transcrevendo'),
      at('c', 'diarizando'),
      at('d', 'pontuando'),
      at('e', 'aguardando_aprovacao'),
      at('f', 'aguardando_aprovacao'),
      at('g', 'aprovada'),
      at('h', 'rejeitada'),
      at('i', 'falhou'),
    ]);

    const metrics = computeMetrics(summaries, NOW);

    expect(metrics.total).toBe(9);
    expect(metrics.byStatus).toEqual({
      recebida: 1,
      transcrevendo: 1,
      diarizando: 1,
      pontuando: 1,
      aguardando_aprovacao: 2,
      aprovada: 1,
      rejeitada: 1,
      falhou: 1,
    });
    expect(metrics.processing).toBe(4);
    expect(metrics.awaitingApproval).toBe(2);
    expect(metrics.failed).toBe(1);
    expect(metrics.decided).toBe(2);
    // Needs a human: the two awaiting approval plus the failure.
    expect(metrics.needsAction).toBe(3);
  });

  it('returns zeroed aggregates for an empty list', () => {
    const metrics = computeMetrics([], NOW);
    expect(metrics.total).toBe(0);
    expect(metrics.needsAction).toBe(0);
    expect(metrics.evidence).toEqual({ verified: 0, unverified: 0, unchecked: 0 });
    expect(metrics.evidenceRate).toBeNull();
    expect(metrics.scoreDistribution).toEqual([0, 0, 0, 0, 0]);
    expect(metrics.averageScore).toBeNull();
  });

  it('excludes unchecked quotes from the evidence rate denominator', () => {
    // Deliberate product decision: `unchecked` is an absence of a check, not a
    // failure. Folding it in would understate the detection rate.
    const evaluations = [
      evaluation(4, true),
      evaluation(3, false),
      ...Array.from({ length: 8 }, (_, index) => evaluation(3, null, `Sem checagem ${index}`)),
    ];
    const summaries = project([
      at('a', 'aguardando_aprovacao', { scorecard: scorecard(evaluations) }),
    ]);

    const metrics = computeMetrics(summaries, NOW);

    expect(metrics.evidence).toEqual({ verified: 1, unverified: 1, unchecked: 8 });
    expect(metrics.evidenceRate).toBe(0.5);
    expect(metrics.interviewsWithAlert).toBe(1);
  });

  it('is null for evidenceRate when nothing was checked at all', () => {
    const summaries = project([
      at('a', 'aguardando_aprovacao', {
        scorecard: scorecard([evaluation(3, null), evaluation(4, null)]),
      }),
      at('b', 'recebida'),
    ]);

    const metrics = computeMetrics(summaries, NOW);

    expect(metrics.evidence.unchecked).toBe(2);
    expect(metrics.evidenceRate).toBeNull();
    expect(metrics.interviewsWithAlert).toBe(0);
  });

  it('aggregates evidence across interviews', () => {
    const summaries = project([
      at('a', 'aguardando_aprovacao', { scorecard: syntheticScorecard }),
      at('b', 'aprovada', { scorecard: syntheticScorecard }),
    ]);

    const metrics = computeMetrics(summaries, NOW);

    expect(metrics.evidence).toEqual({ verified: 2, unverified: 2, unchecked: 2 });
    expect(metrics.evidenceRate).toBe(0.5);
    expect(metrics.interviewsWithAlert).toBe(2);
  });

  it('buckets scores 1..5 by index, rounding and dropping out-of-range values', () => {
    const summaries = project([
      at('a', 'aguardando_aprovacao', {
        scorecard: scorecard([
          evaluation(1, true),
          evaluation(3.4, true),
          evaluation(3.5, true),
          evaluation(5, true),
        ]),
      }),
      at('b', 'aprovada', {
        // 0 and 6 are outside the BARS scale and must not land in a bucket.
        scorecard: scorecard([evaluation(0, true), evaluation(6, true), evaluation(5, true)]),
      }),
      at('c', 'recebida'),
    ]);

    const metrics = computeMetrics(summaries, NOW);

    // 1 -> [0]; 3.4 rounds to 3 -> [2]; 3.5 rounds to 4 -> [3]; two 5s -> [4].
    expect(metrics.scoreDistribution).toEqual([1, 0, 1, 1, 2]);
    // Only the two interviews that carry scores at all.
    expect(metrics.scoredCount).toBe(2);
  });

  it('averages every score, including the ones outside the bucket range', () => {
    const summaries = project([
      at('a', 'aguardando_aprovacao', {
        scorecard: scorecard([evaluation(2, true), evaluation(4, true)]),
      }),
    ]);
    expect(computeMetrics(summaries, NOW).averageScore).toBe(3);
  });

  it('measures waits only for interviews awaiting approval', () => {
    const summaries = project([
      at('a', 'aguardando_aprovacao', { updated_at: iso(1 * HOUR) }),
      at('b', 'aguardando_aprovacao', { updated_at: iso(5 * HOUR) }),
      at('c', 'aguardando_aprovacao', { updated_at: iso(3 * HOUR) }),
      // A much older row in another status must not leak into the queue stats.
      at('d', 'falhou', { updated_at: iso(40 * HOUR) }),
      at('e', 'aprovada', { updated_at: iso(80 * HOUR) }),
    ]);

    const metrics = computeMetrics(summaries, NOW);

    expect(metrics.longestWaitMs).toBe(5 * HOUR);
    expect(metrics.medianWaitMs).toBe(3 * HOUR);
  });

  it('takes the lower middle as the median for an even queue', () => {
    const summaries = project([
      at('a', 'aguardando_aprovacao', { updated_at: iso(1 * HOUR) }),
      at('b', 'aguardando_aprovacao', { updated_at: iso(2 * HOUR) }),
      at('c', 'aguardando_aprovacao', { updated_at: iso(3 * HOUR) }),
      at('d', 'aguardando_aprovacao', { updated_at: iso(4 * HOUR) }),
    ]);

    const metrics = computeMetrics(summaries, NOW);

    expect(metrics.longestWaitMs).toBe(4 * HOUR);
    expect(metrics.medianWaitMs).toBe(2 * HOUR);
  });

  it('reports null waits when the approval queue is empty', () => {
    const summaries = project([at('a', 'aprovada'), at('b', 'falhou')]);
    const metrics = computeMetrics(summaries, NOW);
    expect(metrics.longestWaitMs).toBeNull();
    expect(metrics.medianWaitMs).toBeNull();
  });
});

describe('withinPeriod', () => {
  const summaries = project([
    at('recente', 'recebida', { created_at: iso(2 * HOUR) }),
    at('ontem', 'recebida', { created_at: iso(3 * DAY) }),
    at('semana', 'recebida', { created_at: iso(10 * DAY) }),
    at('antigo', 'recebida', { created_at: iso(90 * DAY) }),
  ]);

  it('filters on createdAt for each bounded period', () => {
    expect(withinPeriod(summaries, '24h', NOW).map((s) => s.id)).toEqual(['recente']);
    expect(withinPeriod(summaries, '7d', NOW).map((s) => s.id)).toEqual(['recente', 'ontem']);
    expect(withinPeriod(summaries, '30d', NOW).map((s) => s.id)).toEqual([
      'recente',
      'ontem',
      'semana',
    ]);
  });

  it('returns the input untouched for "all"', () => {
    expect(withinPeriod(summaries, 'all', NOW)).toBe(summaries);
  });

  it('filters on creation, not on the last update', () => {
    const stale = project([
      at('a', 'aprovada', { created_at: iso(90 * DAY), updated_at: iso(1 * HOUR) }),
    ]);
    expect(withinPeriod(stale, '24h', NOW)).toEqual([]);
  });
});

describe('msSinceUpdate', () => {
  it('reports the elapsed time since the last write', () => {
    const [summary] = project([at('a', 'aprovada', { updated_at: iso(3 * HOUR) })]);
    expect(msSinceUpdate(summary, NOW)).toBe(3 * HOUR);
  });

  it('clamps a future timestamp to zero instead of going negative', () => {
    // Clock skew between the API host and the browser is real; a negative age
    // would render as "daqui a 2 horas" on a row that just arrived.
    const [summary] = project([at('a', 'aprovada', { updated_at: iso(-2 * HOUR) })]);
    expect(msSinceUpdate(summary, NOW)).toBe(0);
  });
});
