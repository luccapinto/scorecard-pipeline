// Pipeline-status derivation: pure functions and metadata, deliberately kept
// out of the components so the dashboard logic (counts, filters, "needs a
// human") is unit-testable in isolation.

import type { Interview, InterviewStatus } from '../api/types';
import { INTERVIEW_STATUSES } from '../api/types';

// Broad category driving colour and grouping in the UI.
export type StatusCategory = 'processing' | 'action_required' | 'done';

export interface StatusMeta {
  status: InterviewStatus;
  label: string; // pt-BR label shown to the user
  category: StatusCategory;
  // Short description of what this stage means, for tooltips/aria.
  description: string;
}

const META: Record<InterviewStatus, StatusMeta> = {
  recebida: {
    status: 'recebida',
    label: 'Recebida',
    category: 'processing',
    description: 'Entrevista registrada, aguardando início do processamento.',
  },
  transcrevendo: {
    status: 'transcrevendo',
    label: 'Transcrevendo',
    category: 'processing',
    description: 'Gerando a transcrição do áudio.',
  },
  diarizando: {
    status: 'diarizando',
    label: 'Diarizando',
    category: 'processing',
    description: 'Separando as falas por interlocutor.',
  },
  pontuando: {
    status: 'pontuando',
    label: 'Pontuando',
    category: 'processing',
    description: 'Gerando o scorecard com o modelo de linguagem.',
  },
  aguardando_aprovacao: {
    status: 'aguardando_aprovacao',
    label: 'Aguardando aprovação',
    category: 'action_required',
    description: 'Scorecard pronto: precisa de decisão humana (aprovar ou rejeitar).',
  },
  aprovada: {
    status: 'aprovada',
    label: 'Aprovada',
    category: 'done',
    description: 'Candidatura aprovada por um avaliador.',
  },
  rejeitada: {
    status: 'rejeitada',
    label: 'Rejeitada',
    category: 'done',
    description: 'Candidatura rejeitada por um avaliador.',
  },
  falhou: {
    status: 'falhou',
    label: 'Falhou',
    category: 'action_required',
    description: 'O processamento falhou: precisa de reprocessamento.',
  },
};

export function statusMeta(status: InterviewStatus): StatusMeta {
  // Fall back gracefully if the backend ever adds a status we don't know yet.
  return (
    META[status] ?? {
      status,
      label: status,
      category: 'processing',
      description: 'Estado desconhecido.',
    }
  );
}

// Statuses that require a human to act. These must stand out in the list.
export function needsAction(status: InterviewStatus): boolean {
  return statusMeta(status).category === 'action_required';
}

export function isTerminal(status: InterviewStatus): boolean {
  return status === 'aprovada' || status === 'rejeitada';
}

// A live pipeline is one still moving on its own; used to decide whether
// polling is worthwhile.
export function hasLiveWork(interviews: Interview[]): boolean {
  return interviews.some((i) => statusMeta(i.status).category === 'processing');
}

export type StatusCounts = Record<InterviewStatus, number>;

export function countByStatus(interviews: Interview[]): StatusCounts {
  const counts = Object.fromEntries(
    INTERVIEW_STATUSES.map((s) => [s, 0]),
  ) as StatusCounts;
  for (const interview of interviews) {
    if (interview.status in counts) {
      counts[interview.status] += 1;
    }
  }
  return counts;
}

// The list filter can be a concrete status, "all", or the "needs action"
// meta-filter that groups aguardando_aprovacao + falhou.
export type StatusFilter = InterviewStatus | 'all' | 'action_required';

export function filterInterviews(
  interviews: Interview[],
  filter: StatusFilter,
): Interview[] {
  if (filter === 'all') return interviews;
  if (filter === 'action_required') {
    return interviews.filter((i) => needsAction(i.status));
  }
  return interviews.filter((i) => i.status === filter);
}

export function countNeedsAction(interviews: Interview[]): number {
  return interviews.filter((i) => needsAction(i.status)).length;
}

// Sort so the items a human must act on float to the top, then processing,
// then done — each group kept in the incoming (newest-first) order.
const CATEGORY_ORDER: Record<StatusCategory, number> = {
  action_required: 0,
  processing: 1,
  done: 2,
};

export function sortByActionPriority(interviews: Interview[]): Interview[] {
  return interviews
    .map((interview, index) => ({ interview, index }))
    .sort((a, b) => {
      const ca = CATEGORY_ORDER[statusMeta(a.interview.status).category];
      const cb = CATEGORY_ORDER[statusMeta(b.interview.status).category];
      if (ca !== cb) return ca - cb;
      return a.index - b.index; // stable: preserve original order within group
    })
    .map((entry) => entry.interview);
}
