// Light projection over the heavy `GET /interviews` payload.
//
// The endpoint returns EVERY interview with its full transcript, diarization
// and scorecard inline — there is no pagination, filter or projection server
// side. Rendering a dashboard straight off that means re-walking megabytes of
// transcript on every 5s poll, and handing React a brand-new object for every
// row so the whole list re-renders even when nothing changed.
//
// So we project once, at the boundary, into a flat summary, and we keep the
// object identity of rows whose `updated_at` has not moved. Downstream that
// makes `React.memo` on a row actually work, and lets `useMemo` over the list
// skip recomputation entirely on a no-op poll.

import type { Interview, InterviewStatus, OverallRecommendation } from '../api/types';
import { parseTimestamp } from './format';
import { needsAction } from './status';

export interface EvidenceTally {
  verified: number;
  unverified: number;
  unchecked: number;
}

export interface InterviewSummary {
  id: string;
  status: InterviewStatus;
  jobId: string | null;
  externalId: string | null;
  recordingUrl: string;
  /** Epoch ms, parsed once. */
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  needsAction: boolean;

  candidateName: string | null;
  recommendation: OverallRecommendation | null;
  competencyCount: number;
  /** Individual 1-5 scores, for the distribution chart. */
  scores: number[];
  averageScore: number | null;
  evidence: EvidenceTally;
  /** At least one competency with evidence_verified === false. */
  hasEvidenceAlert: boolean;
  hasScorecard: boolean;
  hasError: boolean;
  /** Raw ISO strings, kept for display without re-deriving from epoch. */
  createdAtIso: string;
  updatedAtIso: string;
}

function summarize(interview: Interview): InterviewSummary {
  const scorecard = interview.scorecard;
  const evaluations = Array.isArray(scorecard?.evaluations) ? scorecard.evaluations : [];

  const evidence: EvidenceTally = { verified: 0, unverified: 0, unchecked: 0 };
  const scores: number[] = [];
  for (const evaluation of evaluations) {
    if (typeof evaluation.score === 'number' && Number.isFinite(evaluation.score)) {
      scores.push(evaluation.score);
    }
    if (evaluation.evidence_verified === true) evidence.verified += 1;
    else if (evaluation.evidence_verified === false) evidence.unverified += 1;
    else evidence.unchecked += 1;
  }

  const averageScore =
    scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;

  return {
    id: interview.id,
    status: interview.status,
    jobId: interview.job_id,
    externalId: interview.external_id,
    recordingUrl: interview.recording_url,
    // parseTimestamp, never Date.parse: the backend emits naive UTC ISO
    // strings (utcnow().isoformat(), no designator) and Date reads those as
    // LOCAL time, which skews every age by the viewer's offset — far enough
    // to make a fresh row look like it is from the future.
    createdAt: parseTimestamp(interview.created_at).getTime(),
    updatedAt: parseTimestamp(interview.updated_at).getTime(),
    retryCount: interview.retry_count,
    needsAction: needsAction(interview.status),

    candidateName: scorecard?.candidate_name ?? null,
    recommendation: scorecard?.overall_recommendation ?? null,
    competencyCount: evaluations.length,
    scores,
    averageScore,
    evidence,
    hasEvidenceAlert: evidence.unverified > 0,
    hasScorecard: scorecard !== null,
    hasError: interview.error_log !== null && interview.error_log !== '',
    createdAtIso: interview.created_at,
    updatedAtIso: interview.updated_at,
  };
}

export interface Projector {
  (interviews: Interview[]): InterviewSummary[];
}

/**
 * Builds a projector with its own cache. One per data source: demo and API
 * ids never share an instance, so a cache entry can never cross modes.
 */
export function createProjector(): Projector {
  // Dynamic keys with runtime insertion and eviction — a Map is the right
  // structure here, unlike the static lookup tables elsewhere in the app.
  const cache = new Map<string, { updatedAt: string; summary: InterviewSummary }>();
  let previous: InterviewSummary[] = [];

  return (interviews: Interview[]): InterviewSummary[] => {
    const next: InterviewSummary[] = new Array(interviews.length);
    const live = new Set<string>();
    let identical = interviews.length === previous.length;

    for (let index = 0; index < interviews.length; index += 1) {
      const interview = interviews[index];
      live.add(interview.id);

      const hit = cache.get(interview.id);
      // `updated_at` moves on every write the backend makes to the row, so it
      // is a sound cache key: if it has not changed, nothing we project from
      // this row has changed either.
      const summary =
        hit !== undefined && hit.updatedAt === interview.updated_at
          ? hit.summary
          : summarize(interview);

      if (summary !== hit?.summary) {
        cache.set(interview.id, { updatedAt: interview.updated_at, summary });
      }
      if (identical && previous[index] !== summary) identical = false;
      next[index] = summary;
    }

    for (const id of cache.keys()) {
      if (!live.has(id)) cache.delete(id);
    }

    // Returning the previous array instance when nothing moved lets every
    // downstream useMemo/memo bail out on a no-op poll.
    if (identical) return previous;
    previous = next;
    return next;
  };
}
