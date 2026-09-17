// Typed API layer, kept separate from components. Every function takes an
// ApiConfig (base URL + key) so nothing about the host/key is baked into the
// build — the values come from localStorage at call time (see config/settings).

import {
  ApiUnavailableError,
  AuthError,
  BadRequestError,
  NotFoundError,
} from './errors';
import { normalizeInterview } from './normalize';
import type {
  ActionResponse,
  CreateInterviewPayload,
  CreateInterviewResponse,
  DecisionAction,
  Health,
  Interview,
  Job,
  Recording,
} from './types';

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

// Best-effort extraction of the backend's `detail` field for error messages.
async function readDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as unknown;
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }
  } catch {
    // Non-JSON or empty body — fall through to null.
  }
  return null;
}

async function throwForStatus(res: Response): Promise<never> {
  const detail = await readDetail(res);
  if (res.status === 401 || res.status === 403) {
    throw new AuthError(detail ?? undefined, res.status);
  }
  if (res.status === 404) {
    throw new NotFoundError(detail ?? undefined);
  }
  throw new BadRequestError(detail ?? `A API respondeu com erro ${res.status}.`, res.status);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // When true, a non-2xx response is returned to the caller instead of thrown
  // (used by /health, whose 503 is a valid, meaningful payload).
  allowNonOk?: boolean;
}

async function request<T>(
  config: ApiConfig,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (config.apiKey) headers['X-API-Key'] = config.apiKey;

  let res: Response;
  try {
    res = await fetch(joinUrl(config.baseUrl, path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Rejected fetch = transport failure (offline, refused, CORS, bad host).
    throw new ApiUnavailableError();
  }

  if (!res.ok && !options.allowNonOk) {
    await throwForStatus(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

// --- Endpoint functions ---------------------------------------------------

export function getHealth(config: ApiConfig): Promise<Health> {
  // 503 carries a valid { status: 'unhealthy', problems } body.
  return request<Health>(config, '/health', { allowNonOk: true });
}

export function listJobs(config: ApiConfig): Promise<Job[]> {
  return request<Job[]>(config, '/jobs');
}

export function listRecordings(config: ApiConfig): Promise<Recording[]> {
  return request<Recording[]>(config, '/recordings');
}

export async function listInterviews(config: ApiConfig): Promise<Interview[]> {
  const data = await request<Interview[]>(config, '/interviews');
  // The backend returns JSON-in-TEXT fields as strings; normalize at the boundary.
  return data.map(normalizeInterview);
}

export async function getInterview(config: ApiConfig, id: string): Promise<Interview> {
  const data = await request<Interview>(config, `/interviews/${encodeURIComponent(id)}`);
  return normalizeInterview(data);
}

export function createInterview(
  config: ApiConfig,
  payload: CreateInterviewPayload,
): Promise<CreateInterviewResponse> {
  return request<CreateInterviewResponse>(config, '/webhooks/recording', {
    method: 'POST',
    body: payload,
  });
}

export function decideInterview(
  config: ApiConfig,
  id: string,
  action: DecisionAction,
): Promise<ActionResponse> {
  return request<ActionResponse>(config, `/interviews/${encodeURIComponent(id)}/action`, {
    method: 'POST',
    body: { action },
  });
}

export function reprocessInterview(config: ApiConfig, id: string): Promise<unknown> {
  return request<unknown>(config, `/interviews/${encodeURIComponent(id)}/reprocess`, {
    method: 'POST',
  });
}
