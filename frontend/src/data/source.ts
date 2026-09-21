// The single boundary every screen reads and writes through.
//
// Why this exists, rather than components calling `api/client` directly:
//
//  1. It is what makes "demo mode performs zero network I/O" a property that
//     can be PROVEN instead of promised. Exactly one implementation
//     (`apiSource`) is allowed to import `api/client`; an automated test
//     (`data/isolation.test.ts`) fails the build if any component imports it.
//  2. It forces the honest-gap discipline to be structural. A source declares
//     what it can truthfully answer via `capabilities`; screens branch on the
//     capability and render `<Gap>` otherwise. A missing capability cannot be
//     silently filled with invented data, because the data has nowhere to come
//     from — the method simply is not there.
//
// Dependency direction is one-way: `data/source.ts` knows nothing about the
// demo. Only `App.tsx` reaches for the demo module, lazily.

import { createContext, useContext } from 'react';

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
import type { AppMode } from '../app/routes';

/** One BARS anchor: what a given score means for a given competency. */
export interface BarsLevel {
  score: number;
  text: string;
}

export interface CompetencyReference {
  name: string;
  description: string;
  levels: BarsLevel[];
}

export type DeliveryChannel = 'slack' | 'webhook';

export interface DeliveryAttempt {
  id: string;
  channel: DeliveryChannel;
  /** Epoch ms on the source's clock. */
  at: number;
  ok: boolean;
  /** 1 for the first send, 2+ for retries. */
  attempt: number;
  /** Short human-readable outcome, e.g. "HTTP 200" or "timeout after 10s". */
  detail: string;
}

export interface AuditEntry {
  id: string;
  at: number;
  /** Display name of whoever acted. Synthetic by definition — see capabilities. */
  actor: string;
  action: string;
  detail?: string;
}

export interface FunnelStage {
  id: string;
  label: string;
  description: string;
}

export interface FunnelCard {
  interviewId: string;
  candidateName: string;
  jobId: string | null;
  jobTitle: string;
  stageId: string;
  averageScore: number | null;
  /** True when at least one competency has evidence_verified === false. */
  evidenceAlert: boolean;
  enteredStageAt: number;
}

export interface FunnelBoard {
  stages: FunnelStage[];
  cards: FunnelCard[];
}

/** What a source can truthfully answer. Never optimistic. */
export interface Capabilities {
  /** Resolve the BARS anchor text behind a 1-5 score. */
  barsLevels: boolean;
  /** Per-interview notification delivery log. */
  deliveryHistory: boolean;
  /** Who decided, and when. */
  auditTrail: boolean;
  /** Candidate pipeline phases (distinct from processing status). */
  funnelStages: boolean;
  /** Ingestion can be driven from the browser at all. */
  simulateIngestion: boolean;
  /** The demo clock can be stepped forward. */
  steppableClock: boolean;
}

export interface DataSource {
  readonly mode: AppMode;
  readonly capabilities: Capabilities;

  /** Epoch ms. The demo source returns its anchored clock, not wall time. */
  now(): number;

  listInterviews(): Promise<Interview[]>;
  getInterview(id: string): Promise<Interview>;
  listJobs(): Promise<Job[]>;
  listRecordings(): Promise<Recording[]>;
  createInterview(payload: CreateInterviewPayload): Promise<CreateInterviewResponse>;
  decide(id: string, action: DecisionAction): Promise<ActionResponse>;
  reprocess(id: string): Promise<void>;
  getHealth(): Promise<Health>;
  /** `null` means this deployment does not expose GET /integrations. */
  getIntegrations(): Promise<IntegrationsStatus | null>;

  // --- Capability-gated. Present iff the matching capability is true. ------

  barsFor?(jobId: string | null, competencyName: string): CompetencyReference | null;
  deliveryHistory?(interviewId: string): DeliveryAttempt[];
  auditTrail?(interviewId: string): AuditEntry[];
  funnel?(): FunnelBoard;
  moveFunnelCard?(interviewId: string, stageId: string): void;
}

/** Keys for the things the real API genuinely does not model. */
export type GapKey =
  | 'barsLevels'
  | 'deliveryHistory'
  | 'auditTrail'
  | 'funnelStages'
  | 'integrations'
  | 'decisionAuthor'
  | 'candidateEntity'
  | 'stageTimestamps';

// One line each, written for a reader who has never seen the backend. These
// are the sentences that replace fabricated data — they carry the whole
// honesty argument of the product, so they live in one place and are reused
// verbatim wherever the gap surfaces.
export const API_GAPS: Record<GapKey, string> = {
  barsLevels:
    'A API não expõe o arquivo de competências da vaga, então o texto da âncora BARS por trás da nota não pode ser carregado aqui.',
  deliveryHistory:
    'A API dispara notificações, mas não as armazena: não há histórico de entrega para ler.',
  auditTrail:
    'A autenticação é uma chave compartilhada; a API não registra quem tomou a decisão.',
  funnelStages:
    'As fases de contratação não existem no backend — o status é o estado de processamento de uma entrevista, não a fase do candidato.',
  integrations:
    'Esta API não expõe GET /integrations. O estado das integrações é definido por variáveis de ambiente no servidor.',
  decisionAuthor: 'A API não guarda a autoria da decisão, apenas o status resultante.',
  candidateEntity:
    'Candidato não é uma entidade no backend: o nome vem de dentro do scorecard gerado pelo modelo.',
  stageTimestamps:
    'A API guarda apenas created_at e updated_at; não há carimbo de tempo por etapa da esteira.',
};

const DataSourceContext = createContext<DataSource | null>(null);

export const DataSourceProvider = DataSourceContext.Provider;

export function useDataSource(): DataSource {
  const source = useContext(DataSourceContext);
  if (source === null) {
    throw new Error('useDataSource must be used inside a DataSourceProvider.');
  }
  return source;
}
