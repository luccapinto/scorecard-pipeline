import { useCallback, useState } from 'react';

import type { ApiConfig } from '../config/settings';
import { loadConfig, saveConfig } from '../config/settings';

export interface UseConfig {
  config: ApiConfig;
  updateConfig: (next: ApiConfig) => void;
  /**
   * Increments on every save. Consumers that need to know "this is a
   * different backend now" key off this instead of the config itself, so the
   * base URL and — crucially — the API key never have to be embedded in a
   * cache key, a React dependency string, or anything else that travels
   * around the app and could end up rendered.
   */
  epoch: number;
}

// Holds the runtime API config and mirrors every change to localStorage.
export function useConfig(): UseConfig {
  const [config, setConfig] = useState<ApiConfig>(() => loadConfig());
  const [epoch, setEpoch] = useState(0);

  const updateConfig = useCallback((next: ApiConfig) => {
    const normalized: ApiConfig = {
      baseUrl: next.baseUrl.trim() || 'http://localhost:8000',
      apiKey: next.apiKey.trim(),
    };
    saveConfig(normalized);
    setConfig(normalized);
    setEpoch((current) => current + 1);
  }, []);

  return { config, updateConfig, epoch };
}
