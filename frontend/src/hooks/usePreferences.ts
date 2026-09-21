import { useCallback, useEffect, useState } from 'react';

import type { Preferences, ThemePreference } from '../config/preferences';
import { loadPreferences, resolveTheme, savePreferences } from '../config/preferences';

export interface UsePreferences {
  preferences: Preferences;
  setPreferences: (patch: Partial<Preferences>) => void;
  /** The concrete theme in effect, after resolving `system`. */
  activeTheme: 'light' | 'dark';
}

export function usePreferences(): UsePreferences {
  const [preferences, setState] = useState<Preferences>(() => loadPreferences());
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => resolveTheme('system'));

  // Follow the OS while the preference is `system`. Without this listener the
  // theme would only track the OS on a full reload.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setPreferences = useCallback((patch: Partial<Preferences>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const activeTheme: 'light' | 'dark' =
    preferences.theme === 'system' ? systemTheme : preferences.theme;

  // The attribute drives every token in tokens.css, so it belongs on <html>
  // rather than a React root: it must apply to portals and the scrollbar too.
  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme;
  }, [activeTheme]);

  return { preferences, setPreferences, activeTheme };
}

export type { ThemePreference };
