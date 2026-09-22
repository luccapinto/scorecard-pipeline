// DataSource implementation backed entirely by in-memory state.
//
// The zero-network guarantee is not a policy here, it is the absence of code:
// this module imports no HTTP client and calls no `fetch`. `data/isolation`
// asserts that no component bypasses the abstraction, and
// `demo/isolation.test.tsx` drives the real UI through its real flows with
// every network primitive replaced by a throwing spy.

import { BadRequestError, NotFoundError } from '../api/errors';
import type {
  ActionResponse,
  CreateInterviewPayload,
  CreateInterviewResponse,
  DecisionAction,
  Health,
  IntegrationsStatus,
  Interview,
  Job,
  Recording,
} from '../api/types';
import type {
  AuditEntry,
  Capabilities,
  CompetencyReference,
  DataSource,
  DeliveryAttempt,
  FunnelBoard,
} from '../data/source';
import { buildFunnelCards, DEMO_FUNNEL_STAGES, runtimeInterviewId } from './dataset';
import { DEMO_JOB_PROFILES } from './reference.generated';
import type { DemoAction, DemoState } from './state';
import { demoNow } from './state';

// Everything the real API cannot answer, the demo can — which is precisely
// why it must be unmistakably labelled as synthetic on every screen.
const DEMO_CAPABILITIES: Capabilities = {
  barsLevels: true,
  deliveryHistory: true,
  auditTrail: true,
  funnelStages: true,
  simulateIngestion: true,
  steppableClock: true,
};

// Plausible server configuration for the integrations screen. Booleans and
// provider names only, mirroring the real GET /integrations contract — there
// is no secret to show even in a fabricated payload.
const DEMO_INTEGRATIONS: IntegrationsStatus = {
  slack: { configured: true },
  webhook: { configured: true },
  transcription: { provider: 'deepgram', model: 'nova-3', configured: true },
  scoring: { provider: 'openrouter', model: 'google/gemini-2.5-flash', configured: true },
  webhook_hmac: { enabled: true },
  api_key: { enabled: true },
};

/**
 * Takes `getState` rather than a state snapshot, deliberately.
 *
 * A source built over a captured state goes stale the moment an action
 * dispatches: a caller that awaits `decide()` and then re-reads through the
 * same object would get pre-decision data back and silently revert its own
 * optimistic update. Reading through a getter means even a stale source object
 * answers with current state, while the provider still hands out a new object
 * per state so effects keyed on the source keep firing.
 */
export function createDemoSource(
  getState: () => DemoState,
  dispatch: (action: DemoAction) => void,
): DataSource {
  const find = (id: string): Interview => {
    const interview = getState().interviews.find((item) => item.id === id);
    if (interview === undefined) {
      throw new NotFoundError(`Entrevista ${id} não existe no dataset de demonstração.`);
    }
    return interview;
  };

  return {
    mode: 'demo',
    capabilities: DEMO_CAPABILITIES,
    // Anchor + generation identifies the scenario instance. It survives every
    // demo mutation — so advancing or deciding never looks like "a different
    // dataset" and the shared list does not flash back to a skeleton — but it
    // DOES change on reset, which replaces the scenario and must clear both
    // the rows on screen and the status-change history.
    datasetKey: `demo:${getState().anchor}:${getState().generation}`,
    revision: getState().revision,

    now(): number {
      return demoNow(getState());
    },

    listInterviews(): Promise<Interview[]> {
      return Promise.resolve(getState().interviews);
    },

    getInterview(id: string): Promise<Interview> {
      try {
        return Promise.resolve(find(id));
      } catch (error) {
        return Promise.reject(error);
      }
    },

    listJobs(): Promise<Job[]> {
      return Promise.resolve(
        DEMO_JOB_PROFILES.map((profile) => ({ job_id: profile.jobId, title: profile.title })),
      );
    },

    listRecordings(): Promise<Recording[]> {
      return Promise.resolve(
        DEMO_JOB_PROFILES.map((profile) => ({
          path: `/srv/app/data/synthetic/interview_${profile.jobId}.wav`,
          filename: `interview_${profile.jobId}.wav`,
        })),
      );
    },

    createInterview(payload: CreateInterviewPayload): Promise<CreateInterviewResponse> {
      const before = getState();
      const externalId = payload.external_id?.trim() ? payload.external_id.trim() : null;
      const existing =
        externalId === null
          ? undefined
          : before.interviews.find((item) => item.external_id === externalId);

      dispatch({ type: 'create', payload });

      // Idempotency, exactly as app/main.py reports it.
      if (existing !== undefined) {
        return Promise.resolve({
          interview_id: existing.id,
          status: existing.status,
          deduplicated: true,
        });
      }
      // Same helper the reducer uses, so the two cannot drift into reporting
      // an id that was never created.
      return Promise.resolve({
        interview_id: runtimeInterviewId(before.runtimeSequence + 1),
        status: 'recebida',
      });
    },

    decide(id: string, action: DecisionAction): Promise<ActionResponse> {
      let interview: Interview;
      try {
        interview = find(id);
      } catch (error) {
        return Promise.reject(error);
      }

      if (interview.status !== 'aguardando_aprovacao') {
        // Same message and same status code as app/main.py::_apply_decision.
        return Promise.reject(
          new BadRequestError(
            `Interview is not in 'aguardando_aprovacao' status. Current status: '${interview.status}'`,
          ),
        );
      }

      dispatch({ type: 'decide', id, action });
      return Promise.resolve({
        interview_id: id,
        status: action === 'approve' ? 'aprovada' : 'rejeitada',
        updated_at: new Date(demoNow(getState())).toISOString(),
      });
    },

    reprocess(id: string): Promise<void> {
      try {
        const interview = find(id);
        if (interview.status !== 'falhou') {
          return Promise.reject(
            new BadRequestError(
              `Only interviews in 'falhou' can be reprocessed. Current status: '${interview.status}'`,
            ),
          );
        }
        dispatch({ type: 'reprocess', id });
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },

    getHealth(): Promise<Health> {
      return Promise.resolve({ status: 'ok' });
    },

    getIntegrations(): Promise<IntegrationsStatus | null> {
      return Promise.resolve(DEMO_INTEGRATIONS);
    },

    barsFor(jobId: string | null, competencyName: string): CompetencyReference | null {
      const profile = DEMO_JOB_PROFILES.find((job) => job.jobId === jobId);
      return profile?.competencies.find((item) => item.name === competencyName) ?? null;
    },

    deliveryHistory(interviewId: string): DeliveryAttempt[] {
      return getState().delivery[interviewId] ?? [];
    },

    auditTrail(interviewId: string): AuditEntry[] {
      return getState().audit[interviewId] ?? [];
    },

    funnel(): FunnelBoard {
      const state = getState();
      return {
        stages: DEMO_FUNNEL_STAGES,
        cards: buildFunnelCards(state.interviews, state.funnelStageById),
      };
    },

    moveFunnelCard(interviewId: string, stageId: string): void {
      dispatch({ type: 'moveFunnel', id: interviewId, stageId });
    },
  };
}
