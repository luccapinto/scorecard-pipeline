// The demonstration dataset.
//
// Deterministic by construction: no PRNG, no wall clock. Every interview is an
// explicit entry in SPECS, and every timestamp is an offset from an anchor the
// caller supplies. Same anchor in, byte-identical dataset out — which is what
// makes the screenshot script and the demo tests reproducible.
//
// Two properties are DERIVED rather than declared, on purpose:
//
//  * `evidence_verified` comes from actually searching the transcript with the
//    same normalisation rule the backend uses (`lib/evidence`). A flagged
//    quote in this demo is flagged because it really is not in the text.
//  * The consolidated transcript is built from the dialogue, so the quote the
//    scorecard cites is the quote the transcript contains.
//
// Everything is unmistakably synthetic: ids are `demo-` prefixed and people
// have names no real candidate would carry.

import type {
  Interview,
  InterviewStatus,
  OverallRecommendation,
  Scorecard,
  TranscriptSegment,
} from '../api/types';
import { quoteIsInTranscript } from '../lib/evidence';
import { parseTimestamp } from '../lib/format';
import type { DeliveryAttempt, FunnelCard, FunnelStage } from '../data/source';
import { DEMO_JOB_PROFILES } from './reference.generated';
import { DEMO_DIALOGUES, consolidate } from './transcripts';

const MINUTE = 60_000;

/** Competency indices are into the job's competency list, in order. */
export interface InterviewSpec {
  slug: string;
  candidate: string;
  jobId: string;
  status: InterviewStatus;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
  /** One score per competency of the job. */
  scores: number[];
  /** Competency indices whose quote is fabricated (not in the transcript). */
  hallucinated?: number[];
  /** Competency indices left unchecked (`evidence_verified: null`). */
  unchecked?: number[];
  recommendation?: OverallRecommendation;
  externalId?: string;
  /** Transcript without speaker labels, as TRANSCRIPTION_PROVIDER=local emits. */
  localMode?: boolean;
  failure?: 'deepgram' | 'openrouter';
  retryCount?: number;
  funnelStage?: string;
}

// Names are deliberately impossible to mistake for a real person's, so that
// even a cropped screenshot cannot be read as candidate data.
const SPECS: InterviewSpec[] = [
  // --- Awaiting a human decision: the heart of the product ----------------
  {
    slug: 'ana-sintetica',
    candidate: 'Ana Sintética',
    jobId: 'python_pleno',
    status: 'aguardando_aprovacao',
    createdMinutesAgo: 96,
    updatedMinutesAgo: 71,
    scores: [4, 4, 5, 4],
    recommendation: 'Aprovado',
    funnelStage: 'revisao',
  },
  {
    slug: 'bruno-exemplo',
    candidate: 'Bruno Exemplo',
    jobId: 'dados_senior',
    status: 'aguardando_aprovacao',
    createdMinutesAgo: 184,
    updatedMinutesAgo: 152,
    scores: [5, 4, 5, 4, 4],
    // Two fabricated citations: this is the case the whole product exists for.
    hallucinated: [0, 3],
    recommendation: 'Aprovado',
    funnelStage: 'revisao',
  },
  {
    slug: 'carla-ficticia',
    candidate: 'Carla Fictícia',
    jobId: 'frontend_junior',
    status: 'aguardando_aprovacao',
    createdMinutesAgo: 41,
    updatedMinutesAgo: 27,
    scores: [3, 3, 2, 4],
    recommendation: 'Próxima Etapa',
    funnelStage: 'revisao',
  },
  {
    slug: 'daniel-amostra',
    candidate: 'Daniel Amostra',
    jobId: 'python_pleno',
    status: 'aguardando_aprovacao',
    createdMinutesAgo: 1_490,
    updatedMinutesAgo: 1_402,
    scores: [3, 2, 3, 3],
    hallucinated: [1],
    recommendation: 'Próxima Etapa',
    funnelStage: 'revisao',
  },
  {
    slug: 'elisa-prototipo',
    candidate: 'Elisa Protótipo',
    jobId: 'dados_senior',
    status: 'aguardando_aprovacao',
    createdMinutesAgo: 22,
    updatedMinutesAgo: 9,
    scores: [4, 5, 4, 5, 5],
    recommendation: 'Aprovado',
    funnelStage: 'revisao',
  },

  // --- Still moving through the pipeline ----------------------------------
  {
    slug: 'fabio-simulado',
    candidate: 'Fábio Simulado',
    jobId: 'frontend_junior',
    status: 'recebida',
    createdMinutesAgo: 2,
    updatedMinutesAgo: 2,
    scores: [],
    funnelStage: 'entrevista',
  },
  {
    slug: 'gabriela-modelo',
    candidate: 'Gabriela Modelo',
    jobId: 'python_pleno',
    status: 'transcrevendo',
    createdMinutesAgo: 6,
    updatedMinutesAgo: 4,
    scores: [],
    funnelStage: 'entrevista',
  },
  {
    slug: 'heitor-teste',
    candidate: 'Heitor Teste',
    jobId: 'dados_senior',
    status: 'transcrevendo',
    createdMinutesAgo: 11,
    updatedMinutesAgo: 7,
    scores: [],
    funnelStage: 'entrevista',
  },
  {
    slug: 'iris-demonstracao',
    candidate: 'Íris Demonstração',
    jobId: 'frontend_junior',
    status: 'diarizando',
    createdMinutesAgo: 18,
    updatedMinutesAgo: 13,
    scores: [],
    funnelStage: 'entrevista',
  },
  {
    slug: 'joao-placeholder',
    candidate: 'João Placeholder',
    jobId: 'python_pleno',
    status: 'pontuando',
    createdMinutesAgo: 31,
    updatedMinutesAgo: 16,
    scores: [],
    funnelStage: 'entrevista',
  },
  {
    slug: 'karina-rascunho',
    candidate: 'Karina Rascunho',
    jobId: 'dados_senior',
    status: 'pontuando',
    createdMinutesAgo: 37,
    updatedMinutesAgo: 21,
    scores: [],
    // Ingested by the recording provider with an idempotency key; re-sending
    // this external_id in the ingestion screen demonstrates deduplication.
    externalId: 'zoom-rec-8841-b',
    funnelStage: 'entrevista',
  },

  // --- Failures ------------------------------------------------------------
  {
    slug: 'lucas-maquete',
    candidate: 'Lucas Maquete',
    jobId: 'python_pleno',
    status: 'falhou',
    createdMinutesAgo: 268,
    updatedMinutesAgo: 249,
    scores: [],
    failure: 'deepgram',
    retryCount: 1,
    funnelStage: 'entrevista',
  },
  {
    slug: 'marina-esboco',
    candidate: 'Marina Esboço',
    jobId: 'frontend_junior',
    status: 'falhou',
    createdMinutesAgo: 615,
    updatedMinutesAgo: 588,
    scores: [],
    failure: 'openrouter',
    retryCount: 2,
    funnelStage: 'entrevista',
  },

  // --- Decided -------------------------------------------------------------
  {
    slug: 'nuno-ensaio',
    candidate: 'Nuno Ensaio',
    jobId: 'dados_senior',
    status: 'aprovada',
    createdMinutesAgo: 2_930,
    updatedMinutesAgo: 2_780,
    scores: [5, 5, 4, 5, 4],
    recommendation: 'Aprovado',
    funnelStage: 'proposta',
  },
  {
    slug: 'olivia-fixture',
    candidate: 'Olívia Fixture',
    jobId: 'python_pleno',
    status: 'aprovada',
    createdMinutesAgo: 4_310,
    updatedMinutesAgo: 4_150,
    scores: [4, 4, 4, 5],
    // Written through a path that never ran the validator, so the flag is
    // absent rather than true/false. See the note in demo/dataset notes.
    unchecked: [0, 1, 2, 3],
    recommendation: 'Aprovado',
    funnelStage: 'proposta',
  },
  {
    slug: 'paulo-estudo',
    candidate: 'Paulo Estudo',
    jobId: 'frontend_junior',
    status: 'aprovada',
    createdMinutesAgo: 5_760,
    updatedMinutesAgo: 5_600,
    scores: [4, 4, 3, 5],
    recommendation: 'Aprovado',
    // Local provider: a single speaker-less transcript, no diarization.
    localMode: true,
    funnelStage: 'proposta',
  },
  {
    slug: 'quesia-amostragem',
    candidate: 'Quésia Amostragem',
    jobId: 'python_pleno',
    status: 'rejeitada',
    createdMinutesAgo: 7_240,
    updatedMinutesAgo: 7_090,
    scores: [2, 2, 1, 2],
    hallucinated: [2],
    recommendation: 'Rejeitado',
    funnelStage: 'encerrado',
  },
  {
    slug: 'rafael-simulacro',
    candidate: 'Rafael Simulacro',
    jobId: 'dados_senior',
    status: 'rejeitada',
    createdMinutesAgo: 8_800,
    updatedMinutesAgo: 8_650,
    scores: [2, 3, 2, 2, 3],
    recommendation: 'Rejeitado',
    funnelStage: 'encerrado',
  },
];

// Real shape of app/tasks.py::_record_failure output: a full traceback string.
const FAILURE_LOGS: Record<'deepgram' | 'openrouter', string> = {
  deepgram: `Traceback (most recent call last):
  File "/srv/app/app/tasks.py", line 138, in process_interview
    transcription = transcribe_audio(str(local_path))
  File "/srv/app/app/services.py", line 168, in transcribe_audio
    return driver.transcribe(Path(audio_path))
  File "/srv/app/app/audio_processor.py", line 241, in transcribe
    response.raise_for_status()
  File "/usr/local/lib/python3.11/site-packages/httpx/_models.py", line 829, in raise_for_status
    raise HTTPStatusError(message, request=request, response=response)
httpx.HTTPStatusError: Server error '503 Service Unavailable' for url 'https://api.deepgram.com/v1/listen?model=nova-3&language=multi&diarize=true'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/503`,
  openrouter: `Traceback (most recent call last):
  File "/srv/app/app/tasks.py", line 161, in process_interview
    scorecard = score_interview(transcription, diarization, interview.job_id)
  File "/srv/app/app/services.py", line 229, in score_interview
    scorecard = engine.evaluate(
                ^^^^^^^^^^^^^^^^
  File "/srv/app/app/scoring.py", line 268, in evaluate
    raise ValueError(
ValueError: ScoringEngine failed to produce a valid scorecard after 3 attempts: 2 validation errors for ScorecardOutput
evaluations.1.score
  Input should be less than or equal to 5 [type=less_than_equal, input_value=7, input_type=int]
evaluations.3.evidence_quote
  Field required [type=missing, input_type=dict]`,
};

/** Backend timestamps are naive UTC ISO strings (`utcnow().isoformat()`). */
function isoAt(anchor: number, minutesAgo: number): string {
  return new Date(anchor - minutesAgo * MINUTE).toISOString().replace('Z', '');
}

function justificationFor(competency: string, score: number, candidate: string): string {
  const firstName = candidate.split(' ')[0];
  if (score >= 5) {
    return `${firstName} demonstrou domínio consistente em ${competency.toLowerCase()}, com exemplos concretos e decisões justificadas pelo trade-off envolvido.`;
  }
  if (score === 4) {
    return `${firstName} respondeu com segurança sobre ${competency.toLowerCase()}, trazendo um caso real e explicando o resultado obtido.`;
  }
  if (score === 3) {
    return `${firstName} cobriu o esperado em ${competency.toLowerCase()}, sem aprofundar nos casos de borda.`;
  }
  if (score === 2) {
    return `${firstName} demonstrou conhecimento superficial em ${competency.toLowerCase()}; as respostas ficaram no nível conceitual.`;
  }
  return `${firstName} não conseguiu descrever prática alguma relacionada a ${competency.toLowerCase()}.`;
}

function buildScorecard(spec: InterviewSpec, transcript: string): Scorecard {
  const profile = DEMO_JOB_PROFILES.find((job) => job.jobId === spec.jobId);
  const dialogue = DEMO_DIALOGUES[spec.jobId];
  const competencies = profile?.competencies ?? [];

  const evaluations = competencies.map((competency, index) => {
    const isHallucinated = spec.hallucinated?.includes(index) ?? false;
    const isUnchecked = spec.unchecked?.includes(index) ?? false;
    const quote = isHallucinated ? dialogue.hallucinated[index] : dialogue.quotes[index];
    const score = spec.scores[index] ?? 3;

    return {
      competency_name: competency.name,
      score,
      justification: justificationFor(competency.name, score, spec.candidate),
      evidence_quote: quote,
      // Derived, never declared: the same substring rule the backend applies.
      evidence_verified: isUnchecked ? null : quoteIsInTranscript(quote, transcript),
    };
  });

  return {
    candidate_name: spec.candidate,
    overall_recommendation: spec.recommendation ?? 'Próxima Etapa',
    evaluations,
  };
}

/** Statuses at which each artefact already exists, mirroring app/tasks.py. */
const HAS_TRANSCRIPTION: Partial<Record<InterviewStatus, true>> = {
  diarizando: true,
  pontuando: true,
  aguardando_aprovacao: true,
  aprovada: true,
  rejeitada: true,
};
const HAS_DIARIZATION: Partial<Record<InterviewStatus, true>> = {
  pontuando: true,
  aguardando_aprovacao: true,
  aprovada: true,
  rejeitada: true,
};
const HAS_SCORECARD: Partial<Record<InterviewStatus, true>> = {
  aguardando_aprovacao: true,
  aprovada: true,
  rejeitada: true,
};

export interface DemoArtifacts {
  transcription_raw: Interview['transcription_raw'];
  diarization_raw: Interview['diarization_raw'];
  scorecard: Interview['scorecard'];
}

/**
 * Which artefacts exist at a given status, mirroring the order in which
 * app/tasks.py writes them. Used both to build the initial dataset and to
 * fill in artefacts when the demo clock advances an interview a stage.
 */
export function artifactsFor(spec: InterviewSpec, status: InterviewStatus): DemoArtifacts {
  const dialogue = DEMO_DIALOGUES[spec.jobId];
  const transcript = consolidate(dialogue.turns);

  const segments: TranscriptSegment[] = dialogue.turns.map((turn) => ({
    speaker: turn.speaker,
    text: turn.text,
    start: turn.start,
    end: turn.end,
  }));

  // The local provider returns one speaker-less block; diarization then runs
  // separately (and is absent here, exercising the no-speaker render path).
  const transcriptionRaw = spec.localMode
    ? transcript
    : segments.map((segment) => ({ ...segment, speaker: null }));

  return {
    transcription_raw: HAS_TRANSCRIPTION[status] === true ? transcriptionRaw : null,
    diarization_raw:
      HAS_DIARIZATION[status] === true && !spec.localMode ? segments : null,
    scorecard: HAS_SCORECARD[status] === true ? buildScorecard(spec, transcript) : null,
  };
}

function buildInterview(spec: InterviewSpec, anchor: number): Interview {
  return {
    id: `demo-${spec.slug}`,
    recording_url: `/srv/app/data/synthetic/interview_${spec.jobId}.wav`,
    status: spec.status,
    job_id: spec.jobId,
    external_id: spec.externalId ?? null,
    ...artifactsFor(spec, spec.status),
    error_log: spec.failure ? FAILURE_LOGS[spec.failure] : null,
    retry_count: spec.retryCount ?? 0,
    created_at: isoAt(anchor, spec.createdMinutesAgo),
    updated_at: isoAt(anchor, spec.updatedMinutesAgo),
  };
}

/** Newest first, matching `GET /interviews`. */
export function buildDemoInterviews(anchor: number): Interview[] {
  return SPECS.map((spec) => buildInterview(spec, anchor)).sort(
    (a, b) => parseTimestamp(b.created_at).getTime() - parseTimestamp(a.created_at).getTime(),
  );
}

export const SPEC_BY_ID: Record<string, InterviewSpec> = Object.fromEntries(
  SPECS.map((spec) => [`demo-${spec.slug}`, spec]),
);

// Names for interviews created through the ingestion screen during a session.
// Same rule as the seeded ones: unmistakably not a real person.
const RUNTIME_NAMES = [
  'Sofia Amostra Nova',
  'Tiago Ensaio Novo',
  'Ursula Exemplo Recente',
  'Vitor Modelo Recente',
];

export function makeRuntimeSpec(
  sequence: number,
  jobId: string,
  externalId: string | null,
): InterviewSpec {
  const profile = DEMO_JOB_PROFILES.find((job) => job.jobId === jobId);
  const competencyCount = profile?.competencies.length ?? 4;
  return {
    slug: `runtime-${sequence}`,
    candidate: RUNTIME_NAMES[sequence % RUNTIME_NAMES.length],
    jobId,
    status: 'recebida',
    createdMinutesAgo: 0,
    updatedMinutesAgo: 0,
    scores: Array.from({ length: competencyCount }, (_, index) => 3 + (index % 2)),
    recommendation: 'Próxima Etapa',
    ...(externalId === null ? {} : { externalId }),
  };
}


/**
 * The id the reducer will assign to the next runtime-created interview.
 * Exported so the reducer and the data source cannot drift: both derive the
 * id from this one function instead of rebuilding the same string twice.
 */
export function runtimeInterviewId(sequence: number): string {
  return `demo-${makeRuntimeSpec(sequence, 'python_pleno', null).slug}`;
}

export function isoFromEpoch(epochMs: number): string {
  return new Date(epochMs).toISOString().replace('Z', '');
}

export const DEMO_FUNNEL_STAGES: FunnelStage[] = [
  {
    id: 'triagem',
    label: 'Triagem',
    description: 'Candidatura recebida, ainda sem entrevista gravada.',
  },
  {
    id: 'entrevista',
    label: 'Entrevista técnica',
    description: 'Gravação em processamento na esteira.',
  },
  {
    id: 'revisao',
    label: 'Revisão do scorecard',
    description: 'Scorecard pronto, aguardando decisão humana.',
  },
  { id: 'proposta', label: 'Proposta', description: 'Aprovado, em negociação.' },
  { id: 'encerrado', label: 'Encerrado', description: 'Processo finalizado.' },
];

export function initialFunnelStages(): Record<string, string> {
  return Object.fromEntries(
    SPECS.map((spec) => [`demo-${spec.slug}`, spec.funnelStage ?? 'triagem']),
  );
}

export function buildFunnelCards(
  interviews: Interview[],
  stageById: Record<string, string>,
): FunnelCard[] {
  return interviews.map((interview) => {
    const evaluations = interview.scorecard?.evaluations ?? [];
    const scores = evaluations.map((evaluation) => evaluation.score);
    const profile = DEMO_JOB_PROFILES.find((job) => job.jobId === interview.job_id);

    return {
      interviewId: interview.id,
      candidateName: interview.scorecard?.candidate_name ?? null,
      jobId: interview.job_id,
      jobTitle: profile?.title ?? interview.job_id ?? '—',
      stageId: stageById[interview.id] ?? 'triagem',
      averageScore:
        scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
      evidenceAlert: evaluations.some((evaluation) => evaluation.evidence_verified === false),
      // parseTimestamp, not a hand-rolled `+ 'Z'`: that trick breaks the day
      // a payload already carries a designator, and this rule has one home.
      enteredStageAt: parseTimestamp(interview.updated_at).getTime(),
    };
  });
}

/**
 * Notification delivery log. The real API dispatches Slack/webhook calls and
 * keeps nothing, so this exists only in the demo — the API-mode screen says so
 * instead of showing an empty table.
 */
export function buildDeliveryLog(
  interviews: Interview[],
): Record<string, DeliveryAttempt[]> {
  const log: Record<string, DeliveryAttempt[]> = {};

  for (const interview of interviews) {
    if (interview.scorecard === null) continue;
    const settledAt = parseTimestamp(interview.updated_at).getTime();
    const attempts: DeliveryAttempt[] = [
      {
        id: `${interview.id}-slack-1`,
        channel: 'slack',
        at: settledAt + 1_200,
        ok: true,
        attempt: 1,
        detail: 'HTTP 200 — Block Kit entregue com botões de decisão.',
      },
    ];

    // One interview shows the retry path, because "it always works" is not a
    // useful demonstration of a delivery log.
    if (interview.id === 'demo-bruno-exemplo') {
      attempts.push(
        {
          id: `${interview.id}-webhook-1`,
          channel: 'webhook',
          at: settledAt + 2_400,
          ok: false,
          attempt: 1,
          detail: 'timeout após 10 s — endpoint do ATS não respondeu.',
        },
        {
          id: `${interview.id}-webhook-2`,
          channel: 'webhook',
          at: settledAt + 62_400,
          ok: true,
          attempt: 2,
          detail: 'HTTP 202 — aceito na segunda tentativa.',
        },
      );
    } else {
      attempts.push({
        id: `${interview.id}-webhook-1`,
        channel: 'webhook',
        at: settledAt + 2_400,
        ok: true,
        attempt: 1,
        detail: 'HTTP 202 — payload genérico entregue.',
      });
    }

    log[interview.id] = attempts;
  }

  return log;
}

export const DEMO_INTERVIEW_COUNT = SPECS.length;
