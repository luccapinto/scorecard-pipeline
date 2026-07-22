// Runtime configuration (API base URL + X-API-Key), persisted in localStorage.
// Nothing here is baked into the build: the defaults are a local dev host and
// an empty key. Pure functions so they can be unit-tested without a DOM.

import type { ApiConfig } from '../api/client';

const STORAGE_KEY = 'scorecard-pipeline.config';

// Default matches the backend dev default (uvicorn on :8000). No production
// host or key ships in the bundle.
export const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'http://localhost:8000',
  apiKey: '',
};

export function parseConfig(raw: string | null): ApiConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<ApiConfig>;
    return {
      baseUrl:
        typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
          ? parsed.baseUrl.trim()
          : DEFAULT_CONFIG.baseUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : DEFAULT_CONFIG.apiKey,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function loadConfig(): ApiConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_CONFIG };
  return parseConfig(localStorage.getItem(STORAGE_KEY));
}

export function saveConfig(config: ApiConfig): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export { STORAGE_KEY };
