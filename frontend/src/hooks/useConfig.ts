import { useCallback, useState } from 'react';

import type { ApiConfig } from '../api/client';
import { loadConfig, saveConfig } from '../config/settings';

export interface UseConfig {
  config: ApiConfig;
  updateConfig: (next: ApiConfig) => void;
}

// Holds the runtime API config and mirrors every change to localStorage.
export function useConfig(): UseConfig {
  const [config, setConfig] = useState<ApiConfig>(() => loadConfig());

  const updateConfig = useCallback((next: ApiConfig) => {
    const normalized: ApiConfig = {
      baseUrl: next.baseUrl.trim() || 'http://localhost:8000',
      apiKey: next.apiKey.trim(),
    };
    saveConfig(normalized);
    setConfig(normalized);
  }, []);

  return { config, updateConfig };
}
