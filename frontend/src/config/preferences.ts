// User preferences, kept in a separate localStorage key from the API config.
//
// Splitting them is deliberate: `scorecard-pipeline.config` holds credentials
// (the API key) and is the thing a user may need to clear; preferences are
// harmless and should survive that. Nothing here is baked into the bundle.

import type { AppMode } from '../app/routes';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Preferences {
  theme: ThemePreference;
  /** Poll interval used while a pipeline is actively moving, in ms. */
  pollIntervalMs: number;
  /** Mode used when the URL carries no mode prefix (a bare `#/`). */
  lastMode: AppMode;
}

export const PREFERENCES_KEY = 'scorecard-pipeline.prefs';

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  pollIntervalMs: 5000,
  lastMode: 'api',
};

/** Poll intervals offered in the UI. Below 2s the API would be hammered. */
export const POLL_CHOICES: { value: number; label: string }[] = [
  { value: 2000, label: '2 segundos' },
  { value: 5000, label: '5 segundos (padrão)' },
  { value: 15000, label: '15 segundos' },
  { value: 30000, label: '30 segundos' },
];

const MIN_POLL_MS = 2000;
const MAX_POLL_MS = 300000;

export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    const theme =
      parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
        ? parsed.theme
        : DEFAULT_PREFERENCES.theme;
    const interval =
      typeof parsed.pollIntervalMs === 'number' && Number.isFinite(parsed.pollIntervalMs)
        ? Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, parsed.pollIntervalMs))
        : DEFAULT_PREFERENCES.pollIntervalMs;
    const lastMode: AppMode = parsed.lastMode === 'demo' ? 'demo' : 'api';
    return { theme, pollIntervalMs: interval, lastMode };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function loadPreferences(): Preferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFERENCES };
  return parsePreferences(localStorage.getItem(PREFERENCES_KEY));
}

export function savePreferences(preferences: Preferences): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

/**
 * Resolves `system` against the OS setting. Returns the concrete theme that
 * should land on `data-theme`.
 */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
