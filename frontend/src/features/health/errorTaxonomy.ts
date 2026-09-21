// Error classification, as a pure function.
//
// Every failure the user can see passes through here, so the quality of the
// app's worst moments is decided in this file rather than scattered across
// catch blocks. It is pure and unit-tested for that reason: a wrong diagnosis
// sends someone to restart a healthy backend.
//
// Nothing here ever receives or emits the API key. The auth branch names the
// header and points at a screen; it never echoes the error's own text, which
// could carry a pasted credential.

import {
  ApiUnavailableError,
  AuthError,
  BadRequestError,
  NotFoundError,
  errorMessage,
} from '../../api/errors';

export type ErrorKind =
  | 'offline'
  | 'cors'
  | 'auth'
  | 'not_found'
  | 'invalid_state'
  | 'unhealthy'
  | 'unknown';

export interface Diagnosis {
  kind: ErrorKind;
  title: string;
  /** What actually happened, in plain language. */
  explanation: string;
  /** The single next action worth taking. */
  nextStep: string;
}

export interface DiagnoseContext {
  baseUrl?: string;
}

// The backend's CORS allowlist (app/main.py) names exactly these two origins.
// Anything else is rejected at the preflight and never reaches a handler.
export const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const;

function currentOrigin(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return window.location.origin;
}

export function diagnose(error: unknown, context: DiagnoseContext = {}): Diagnosis {
  if (error instanceof ApiUnavailableError) {
    // A browser cannot tell a CORS rejection from a dead host: fetch rejects
    // with the same opaque TypeError in both cases. The page origin is the
    // only evidence available, so it decides which of the two we claim.
    const origin = currentOrigin();
    const blockedByOrigin =
      Boolean(context.baseUrl) &&
      origin !== null &&
      !(ALLOWED_ORIGINS as readonly string[]).includes(origin);

    if (blockedByOrigin) {
      return {
        kind: 'cors',
        title: 'Bloqueado por CORS',
        explanation:
          `A página está servida em ${origin}, mas a lista de origens permitidas do backend ` +
          '(em app/main.py) aceita apenas http://localhost:5173 e http://127.0.0.1:5173. ' +
          'O navegador rejeita a resposta antes de ela chegar à aplicação.',
        nextStep:
          'Rode o servidor de desenvolvimento na porta 5173 (localhost ou 127.0.0.1) ou inclua esta origem na allowlist do backend.',
      };
    }

    return {
      kind: 'offline',
      title: 'API inacessível',
      explanation:
        `Não houve resposta de ${context.baseUrl ?? 'API'}. A API pode simplesmente não estar no ar, ` +
        'ou a URL configurada pode apontar para outro host ou porta.',
      nextStep: 'Verifique se a API está rodando e confira a URL base em Configuração.',
    };
  }

  if (error instanceof AuthError) {
    return {
      kind: 'auth',
      title: 'Chave de API recusada',
      explanation:
        'A API respondeu 401/403: o cabeçalho X-API-Key está ausente ou não corresponde ao valor esperado pelo servidor.',
      nextStep: 'Abra Configuração e informe novamente a chave de API.',
    };
  }

  if (error instanceof NotFoundError) {
    return {
      kind: 'not_found',
      title: 'Recurso não encontrado',
      explanation:
        'A API respondeu 404. O registro pode ter sido removido, ou o identificador usado não existe nesta base.',
      nextStep: 'Volte à lista e abra o item a partir dela para garantir um identificador válido.',
    };
  }

  if (error instanceof BadRequestError && error.status === 400) {
    return {
      kind: 'invalid_state',
      title: 'Operação inválida no estado atual',
      // The backend's `detail` is the only place the real reason exists (e.g.
      // deciding an interview that is no longer awaiting approval), so it is
      // shown verbatim instead of being replaced by a generic sentence.
      explanation: `A API recusou a operação com a mensagem: "${error.message}"`,
      nextStep: 'Atualize a tela para ver o estado atual do registro antes de repetir a ação.',
    };
  }

  return {
    kind: 'unknown',
    title: 'Erro inesperado',
    explanation: errorMessage(error),
    nextStep: 'Tente novamente; se persistir, verifique os logs da API.',
  };
}

/**
 * The 503 case, which is not a thrown error at all: `GET /health` answers with
 * a valid body describing what is broken.
 *
 * The backend sends exception CLASS NAMES as the values of `problems` (e.g.
 * "OperationalError"), not human messages — see app/main.py. They are useful
 * diagnostic codes and useless prose, so the UI must present them as codes and
 * supply the human sentence itself.
 */
export function diagnoseUnhealthy(problems: Record<string, string>): Diagnosis {
  const keys = Object.keys(problems);
  return {
    kind: 'unhealthy',
    title: 'API no ar, mas com dependências degradadas',
    explanation:
      keys.length === 0
        ? 'A API respondeu 503 sem detalhar qual dependência falhou.'
        : `A API respondeu 503. Dependências com falha: ${keys.join(', ')}. ` +
          'Os valores são nomes de exceção do servidor, e não mensagens para leitura.',
    nextStep:
      'Consulte os logs da API pelo nome da exceção indicado em cada dependência para achar a causa.',
  };
}

/** Reference table rendered on the observability screen. */
export const ERROR_KIND_REFERENCE: { kind: ErrorKind; title: string; action: string }[] = [
  {
    kind: 'offline',
    title: 'API inacessível',
    action: 'Suba a API e confira a URL base em Configuração.',
  },
  {
    kind: 'cors',
    title: 'Bloqueado por CORS',
    action: 'Sirva a interface em http://localhost:5173 ou http://127.0.0.1:5173.',
  },
  {
    kind: 'auth',
    title: 'Chave de API recusada',
    action: 'Informe novamente a chave de API em Configuração.',
  },
  {
    kind: 'not_found',
    title: 'Recurso não encontrado',
    action: 'Reabra o item a partir da lista.',
  },
  {
    kind: 'invalid_state',
    title: 'Operação inválida no estado atual',
    action: 'Atualize a tela e releia a mensagem da API antes de repetir a ação.',
  },
  {
    kind: 'unhealthy',
    title: 'Dependências degradadas',
    action: 'Investigue os logs da API pelo nome da exceção reportada.',
  },
  {
    kind: 'unknown',
    title: 'Erro inesperado',
    action: 'Tente novamente e, se persistir, verifique os logs da API.',
  },
];
