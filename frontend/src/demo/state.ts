// Demo state as a pure reducer.
//
// No timers, no Date.now(), no randomness. The visible state is a function of
// (anchor, ordered list of actions), so the same URL plus the same clicks is
// always the same screen — which is what the screenshot script and the demo
// tests rely on. The animated "Simular nova entrevista" is a sequence of
// ordinary `step` actions dispatched by DemoProvider after a person clicks;
// the reducer never knows about the clock that spaced them out.
//
// The reducer also reproduces the backend's REFUSALS, not just its successes:
// deciding an interview that is not awaiting approval fails with the exact
// message app/main.py produces, and reprocessing a non-failed interview does
// too. A demo that only shows the happy path teaches the wrong thing about a
// system whose interesting behaviour is at the edges.

import { BadRequestError, NotFoundError } from '../api/errors';
import type {
  CreateInterviewPayload,
  DecisionAction,
  Interview,
  InterviewStatus,
} from '../api/types';
import type { IngestionRecord, SimulationLevel } from '../data/demoControls';
import type { AuditEntry, DeliveryAttempt } from '../data/source';
import {
  artifactsFor,
  buildDeliveryLog,
  buildDemoInterviews,
  initialFunnelStages,
  isoFromEpoch,
  makeRuntimeSpec,
  makeSimulationSpec,
  runtimeInterviewId,
  SPEC_BY_ID,
  type InterviewSpec,
} from './dataset';

/** Mirrors app/models.py VALID_TRANSITIONS for the forward path only. */
const NEXT_STATUS: Partial<Record<InterviewStatus, InterviewStatus>> = {
  recebida: 'transcrevendo',
  transcrevendo: 'diarizando',
  diarizando: 'pontuando',
  pontuando: 'aguardando_aprovacao',
};

/** Synthetic reviewers. The real API has no concept of decision authorship. */
const DEMO_ACTORS = ['Rita Avaliadora (fictícia)', 'Téo Revisor (fictício)'];

export interface DemoState {
  /** Epoch ms the dataset is anchored to. */
  anchor: number;
  /** Virtual time accumulated by steps and by writes to existing rows. */
  elapsedMs: number;
  interviews: Interview[];
  runtimeSpecs: Record<string, InterviewSpec>;
  funnelStageById: Record<string, string>;
  audit: Record<string, AuditEntry[]>;
  delivery: Record<string, DeliveryAttempt[]>;
  runtimeSequence: number;
  lastIngestion: IngestionRecord | null;
  /** Latest interview created by `simulate`; the guided tour follows it. */
  simulatedId: string | null;
  /** How many simulations ran, which picks the next script. */
  simulations: number;
  /**
   * Incremented on EVERY action. Consumers use it to re-read after a local
   * mutation without discarding what they already show — unlike the dataset
   * identity, which only changes when the scenario itself is replaced.
   */
  revision: number;
  /**
   * Incremented only by `reset`. Reset does not mutate the scenario, it
   * REPLACES it, so consumers must treat the result as a different dataset —
   * clearing what they show and their change-announcement history — rather
   * than as one more local edit.
   */
  generation: number;
}

export type DemoAction =
  | { type: 'simulate' }
  | { type: 'step'; id: string }
  | { type: 'prepareSimulation'; level: SimulationLevel }
  | { type: 'decide'; id: string; action: DecisionAction }
  | { type: 'reprocess'; id: string }
  | { type: 'create'; payload: CreateInterviewPayload }
  | { type: 'moveFunnel'; id: string; stageId: string }
  | { type: 'reset' };

/** One step moves the interview a stage and the virtual clock this much. */
const STEP_MS = 45_000;
/**
 * A decision or a reprocess moves the virtual clock this much. The backend's
 * `updated_at` moves on every write (SQLModel `onupdate`), and the list
 * projection relies on exactly that to notice a row changed; a write stamped
 * with the instant of the previous one would stay invisible outside its own
 * screen.
 */
const WRITE_MS = 1_000;

/** Status each preparation level guarantees, in pipeline order. */
const LEVEL_TARGET: Record<SimulationLevel, InterviewStatus> = {
  created: 'recebida',
  midway: 'diarizando',
  processed: 'aguardando_aprovacao',
};
const FORWARD_ORDER: InterviewStatus[] = [
  'recebida',
  'transcrevendo',
  'diarizando',
  'pontuando',
  'aguardando_aprovacao',
];

export function initialDemoState(anchor: number): DemoState {
  const interviews = buildDemoInterviews(anchor);
  return {
    anchor,
    elapsedMs: 0,
    interviews,
    runtimeSpecs: {},
    funnelStageById: initialFunnelStages(),
    audit: {},
    delivery: buildDeliveryLog(interviews),
    runtimeSequence: 0,
    lastIngestion: null,
    simulatedId: null,
    simulations: 0,
    revision: 0,
    generation: 0,
  };
}

export function demoNow(state: DemoState): number {
  return state.anchor + state.elapsedMs;
}

/** The instant the next write to an existing row lands on the virtual clock. */
export function nextWriteAt(state: DemoState): number {
  return demoNow(state) + WRITE_MS;
}

/**
 * Moves ONE interview a stage forward, as the worker would, and fills in the
 * artefact that stage produces. Refuses silently (returns the same state) for
 * anything that is not mid-pipeline: stepping is a demo control, not an API
 * endpoint, so there is no backend refusal to reproduce.
 */
function step(state: DemoState, id: string): DemoState {
  const interview = state.interviews.find((item) => item.id === id);
  const next = interview === undefined ? undefined : NEXT_STATUS[interview.status];
  const spec = SPEC_BY_ID[id] ?? state.runtimeSpecs[id];
  if (interview === undefined || next === undefined || spec === undefined) return state;

  const elapsedMs = state.elapsedMs + STEP_MS;
  const moved: Interview = {
    ...interview,
    status: next,
    ...artifactsFor(spec, next),
    updated_at: isoFromEpoch(state.anchor + elapsedMs),
  };
  const ready = next === 'aguardando_aprovacao';

  return {
    ...state,
    elapsedMs,
    interviews: state.interviews.map((item) => (item.id === id ? moved : item)),
    // A scorecard becoming ready is what triggers notification dispatch in
    // app/tasks.py, and what moves the candidate into review.
    delivery: ready ? { ...state.delivery, ...buildDeliveryLog([moved]) } : state.delivery,
    funnelStageById: ready
      ? { ...state.funnelStageById, [id]: 'revisao' }
      : state.funnelStageById,
  };
}

/** A scripted recording arrives through the webhook, exactly like `create`. */
function simulate(state: DemoState): DemoState {
  const sequence = state.runtimeSequence + 1;
  const spec = makeSimulationSpec(state.simulations, sequence);
  const created = insertRuntime(
    state,
    {
      recording_url: `/srv/app/data/synthetic/interview_${spec.jobId}.wav`,
      job_id: spec.jobId,
      external_id: `simulacao-${state.simulations + 1}`,
    },
    spec,
  );
  return {
    ...created,
    simulatedId: runtimeInterviewId(sequence),
    simulations: state.simulations + 1,
  };
}

/** Ensures a simulated interview exists and has reached at least `level`. */
function prepareSimulation(state: DemoState, level: SimulationLevel): DemoState {
  let next = state.simulatedId === null ? simulate(state) : state;
  const id = next.simulatedId!;
  const target = FORWARD_ORDER.indexOf(LEVEL_TARGET[level]);
  for (;;) {
    const status = next.interviews.find((item) => item.id === id)?.status;
    const rank = status === undefined ? -1 : FORWARD_ORDER.indexOf(status);
    // Decided or failed interviews are off the forward path: nothing to do.
    if (rank === -1 || rank >= target) return next;
    next = step(next, id);
  }
}

function decide(state: DemoState, id: string, action: DecisionAction): DemoState {
  const interview = state.interviews.find((item) => item.id === id);
  if (interview === undefined) {
    throw new NotFoundError(`Interview ${id} not found`);
  }
  if (interview.status !== 'aguardando_aprovacao') {
    // Verbatim from app/main.py::_apply_decision, so the UI's handling of the
    // real 400 is exercised by the demo too.
    throw new BadRequestError(
      `Interview is not in 'aguardando_aprovacao' status. Current status: '${interview.status}'`,
    );
  }

  const now = nextWriteAt(state);
  const status: InterviewStatus = action === 'approve' ? 'aprovada' : 'rejeitada';
  const actor = DEMO_ACTORS[Object.keys(state.audit).length % DEMO_ACTORS.length];

  const entry: AuditEntry = {
    id: `${id}-decision-${now}`,
    at: now,
    actor,
    action: action === 'approve' ? 'Aprovou a candidatura' : 'Rejeitou a candidatura',
    detail: 'Decisão registrada após revisão do scorecard e das evidências.',
  };

  return {
    ...state,
    elapsedMs: now - state.anchor,
    interviews: state.interviews.map((item) =>
      item.id === id ? { ...item, status, updated_at: isoFromEpoch(now) } : item,
    ),
    audit: { ...state.audit, [id]: [...(state.audit[id] ?? []), entry] },
    funnelStageById: {
      ...state.funnelStageById,
      [id]: action === 'approve' ? 'proposta' : 'encerrado',
    },
  };
}

function reprocess(state: DemoState, id: string): DemoState {
  const interview = state.interviews.find((item) => item.id === id);
  if (interview === undefined) {
    throw new NotFoundError(`Interview ${id} not found`);
  }
  if (interview.status !== 'falhou') {
    throw new BadRequestError(
      `Only interviews in 'falhou' can be reprocessed. Current status: '${interview.status}'`,
    );
  }

  const now = nextWriteAt(state);
  return {
    ...state,
    elapsedMs: now - state.anchor,
    interviews: state.interviews.map((item) =>
      item.id === id
        ? {
            ...item,
            // app/tasks.py resumes from the saved checkpoint and bumps the
            // retry counter; with no transcription saved that is TRANSCREVENDO.
            status: 'transcrevendo',
            retry_count: item.retry_count + 1,
            error_log: null,
            updated_at: isoFromEpoch(now),
          }
        : item,
    ),
  };
}

function create(state: DemoState, payload: CreateInterviewPayload): DemoState {
  const now = demoNow(state);
  const externalId = payload.external_id?.trim() ? payload.external_id.trim() : null;

  const existing =
    externalId === null
      ? undefined
      : state.interviews.find((item) => item.external_id === externalId);

  if (existing !== undefined) {
    // Idempotency, exactly as app/main.py does it: the existing interview is
    // returned and nothing new is created.
    return {
      ...state,
      lastIngestion: {
        at: now,
        payload,
        signatureHeader: REDACTED_SIGNATURE,
        httpStatus: 202,
        response: {
          interview_id: existing.id,
          status: existing.status,
          deduplicated: true,
        },
      },
    };
  }

  const sequence = state.runtimeSequence + 1;
  return insertRuntime(state, payload, makeRuntimeSpec(sequence, payload.job_id, externalId));
}

/** Registers a new `recebida` interview under the next runtime sequence. */
function insertRuntime(
  state: DemoState,
  payload: CreateInterviewPayload,
  spec: InterviewSpec,
): DemoState {
  const now = demoNow(state);
  const externalId = payload.external_id?.trim() ? payload.external_id.trim() : null;
  const sequence = state.runtimeSequence + 1;
  // Shared with demoSource via the same helper, so the reported id and the
  // created id can never disagree.
  const id = runtimeInterviewId(sequence);
  const stamp = isoFromEpoch(now);

  const interview: Interview = {
    id,
    recording_url: payload.recording_url,
    status: 'recebida',
    job_id: payload.job_id,
    external_id: externalId,
    transcription_raw: null,
    diarization_raw: null,
    scorecard: null,
    error_log: null,
    retry_count: 0,
    created_at: stamp,
    updated_at: stamp,
  };

  return {
    ...state,
    runtimeSequence: sequence,
    runtimeSpecs: { ...state.runtimeSpecs, [id]: spec },
    interviews: [interview, ...state.interviews],
    funnelStageById: { ...state.funnelStageById, [id]: 'entrevista' },
    lastIngestion: {
      at: now,
      payload,
      signatureHeader: REDACTED_SIGNATURE,
      httpStatus: 202,
      response: { interview_id: id, status: 'recebida' },
    },
  };
}

/**
 * What the recording provider would send. The value is redacted because the
 * browser genuinely cannot compute it: signing needs WEBHOOK_HMAC_SECRET, and
 * shipping that to the client would publish it in the bundle.
 */
export const REDACTED_SIGNATURE = 'sha256=«assinatura calculada pelo servidor de gravação»';

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  // Reset rebuilds from scratch, so it restarts the revision too; every other
  // action bumps it here rather than in each handler, which is the only way
  // to be sure a new case cannot forget to.
  if (action.type === 'reset') {
    return { ...initialDemoState(state.anchor), generation: state.generation + 1 };
  }

  const next = applyDemoAction(state, action);
  return next === state ? state : { ...next, revision: state.revision + 1 };
}

function applyDemoAction(state: DemoState, action: Exclude<DemoAction, { type: 'reset' }>) {
  switch (action.type) {
    case 'simulate':
      return simulate(state);
    case 'step':
      return step(state, action.id);
    case 'prepareSimulation':
      return prepareSimulation(state, action.level);
    case 'decide':
      return decide(state, action.id, action.action);
    case 'reprocess':
      return reprocess(state, action.id);
    case 'create':
      return create(state, action.payload);
    case 'moveFunnel':
      return {
        ...state,
        funnelStageById: { ...state.funnelStageById, [action.id]: action.stageId },
      };
  }
}
