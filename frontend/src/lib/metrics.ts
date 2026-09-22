// Dashboard aggregates, computed from the light projection.
//
// One honesty constraint shapes this whole module: the backend stores only
// `created_at` and `updated_at` per interview, and `updated_at` moves on ANY
// write to the row (SQLModel `onupdate`), not only on a stage transition. So
// there is no such thing as "time in stage" here. What we can state truthfully
// is "time since the last update", and that is what the labels say.

import type { InterviewStatus } from '../api/types';
import { INTERVIEW_STATUSES } from '../api/types';
import type { EvidenceTally, InterviewSummary } from './projection';

export type PeriodKey = '24h' | '7d' | '30d' | 'all';

export const PERIODS: Record<PeriodKey, { label: string; ms: number | null }> = {
  '24h': { label: 'Últimas 24 h', ms: 24 * 60 * 60 * 1000 },
  '7d': { label: 'Últimos 7 dias', ms: 7 * 24 * 60 * 60 * 1000 },
  '30d': { label: 'Últimos 30 dias', ms: 30 * 24 * 60 * 60 * 1000 },
  all: { label: 'Todo o período', ms: null },
};

export function withinPeriod(
  summaries: InterviewSummary[],
  period: PeriodKey,
  now: number,
): InterviewSummary[] {
  const span = PERIODS[period].ms;
  if (span === null) return summaries;
  const floor = now - span;
  return summaries.filter((summary) => summary.createdAt >= floor);
}

export interface DashboardMetrics {
  total: number;
  byStatus: Record<InterviewStatus, number>;
  needsAction: number;
  awaitingApproval: number;
  failed: number;
  processing: number;
  decided: number;

  evidence: EvidenceTally;
  /**
   * Share of automatically-checked quotes that were found in the transcript:
   * verified / (verified + unverified). `unchecked` is excluded on purpose —
   * it is not a failure, it is an absence of a check, and folding it in would
   * understate the real hallucination-detection rate.
   * `null` when nothing was checked at all.
   */
  evidenceRate: number | null;
  /** Interviews with at least one unverified quote. */
  interviewsWithAlert: number;

  /** Counts for scores 1..5, index 0 = score 1. */
  scoreDistribution: [number, number, number, number, number];
  scoredCount: number;
  averageScore: number | null;

  /** Longest and median wait among items sitting in aguardando_aprovacao. */
  longestWaitMs: number | null;
  medianWaitMs: number | null;
}

const EMPTY_DISTRIBUTION = (): [number, number, number, number, number] => [0, 0, 0, 0, 0];

export function computeMetrics(
  summaries: InterviewSummary[],
  now: number,
): DashboardMetrics {
  const byStatus = Object.fromEntries(
    INTERVIEW_STATUSES.map((status) => [status, 0]),
  ) as Record<InterviewStatus, number>;

  const evidence: EvidenceTally = { verified: 0, unverified: 0, unchecked: 0 };
  const scoreDistribution = EMPTY_DISTRIBUTION();
  const waits: number[] = [];

  let needsActionCount = 0;
  let interviewsWithAlert = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let scoredCount = 0;

  for (const summary of summaries) {
    if (summary.status in byStatus) byStatus[summary.status] += 1;
    if (summary.needsAction) needsActionCount += 1;
    if (summary.hasEvidenceAlert) interviewsWithAlert += 1;

    evidence.verified += summary.evidence.verified;
    evidence.unverified += summary.evidence.unverified;
    evidence.unchecked += summary.evidence.unchecked;

    if (summary.scores.length > 0) scoredCount += 1;
    for (const score of summary.scores) {
      const bucket = Math.round(score);
      if (bucket >= 1 && bucket <= 5) scoreDistribution[bucket - 1] += 1;
      scoreSum += score;
      scoreCount += 1;
    }

    if (summary.status === 'aguardando_aprovacao') {
      waits.push(Math.max(0, now - summary.updatedAt));
    }
  }

  const checked = evidence.verified + evidence.unverified;
  waits.sort((a, b) => a - b);

  return {
    total: summaries.length,
    byStatus,
    needsAction: needsActionCount,
    awaitingApproval: byStatus.aguardando_aprovacao,
    failed: byStatus.falhou,
    processing:
      byStatus.recebida + byStatus.transcrevendo + byStatus.diarizando + byStatus.pontuando,
    decided: byStatus.aprovada + byStatus.rejeitada,

    evidence,
    evidenceRate: checked > 0 ? evidence.verified / checked : null,
    interviewsWithAlert,

    scoreDistribution,
    scoredCount,
    averageScore: scoreCount > 0 ? scoreSum / scoreCount : null,

    longestWaitMs: waits.length > 0 ? waits[waits.length - 1] : null,
    medianWaitMs: waits.length > 0 ? waits[Math.floor((waits.length - 1) / 2)] : null,
  };
}

/**
 * Time since the row was last written. NOT time in stage — see the module
 * comment. Callers must label it accordingly.
 */
export function msSinceUpdate(summary: InterviewSummary, now: number): number {
  return Math.max(0, now - summary.updatedAt);
}
