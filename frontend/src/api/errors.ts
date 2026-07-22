// Typed error hierarchy so the UI can tell apart "API down", "bad key" and
// "not found" instead of showing a blank screen. Every network/HTTP failure
// from the client layer is one of these.

export class ApiError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// fetch() itself rejected: DNS/connection refused/CORS/offline. The API host
// is unreachable or the URL is wrong.
export class ApiUnavailableError extends ApiError {
  constructor(message = 'Não foi possível conectar à API. Verifique se ela está no ar e se a URL está correta.') {
    super(message, null);
    this.name = 'ApiUnavailableError';
  }
}

// 401/403: missing or invalid X-API-Key.
export class AuthError extends ApiError {
  constructor(message = 'Chave de API inválida ou ausente. Ajuste a X-API-Key na configuração.', status = 401) {
    super(message, status);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Recurso não encontrado (404).') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

// 400 and other 4xx that carry an actionable `detail` from the backend
// (e.g. the invalid-status message when deciding an interview).
export class BadRequestError extends ApiError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = 'BadRequestError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// Human-readable message for any thrown value, so the UI never renders
// "[object Object]" or a blank error area.
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado.';
}
