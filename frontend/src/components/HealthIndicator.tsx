import { useCallback, useEffect, useState } from 'react';

import type { ApiConfig } from '../api/client';
import { getHealth } from '../api/client';
import type { Health } from '../api/types';
import { usePolling } from '../hooks/usePolling';

interface Props {
  config: ApiConfig;
}

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'unhealthy'; problems: Record<string, string> }
  | { kind: 'unreachable' };

// Live /health badge in the header. Polls slowly and pauses when hidden.
export function HealthIndicator({ config }: Props) {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  const check = useCallback(() => {
    getHealth(config)
      .then((health: Health) => {
        if (health.status === 'ok') {
          setState({ kind: 'ok' });
        } else {
          setState({ kind: 'unhealthy', problems: health.problems });
        }
      })
      .catch(() => setState({ kind: 'unreachable' }));
  }, [config]);

  useEffect(() => {
    check();
  }, [check]);

  usePolling(check, { intervalMs: 15000 });

  const { className, label, detail } = describe(state);

  return (
    <span className={`health health--${className}`} title={detail} aria-label={`Saúde da API: ${label}`}>
      <span className="health__dot" aria-hidden="true" />
      <span className="health__label">{label}</span>
    </span>
  );
}

function describe(state: HealthState): { className: string; label: string; detail: string } {
  switch (state.kind) {
    case 'loading':
      return { className: 'loading', label: 'Verificando…', detail: 'Consultando /health' };
    case 'ok':
      return { className: 'ok', label: 'API ok', detail: 'A API respondeu com status ok.' };
    case 'unhealthy':
      return {
        className: 'bad',
        label: 'API degradada',
        detail: `Problemas: ${Object.entries(state.problems)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}`,
      };
    case 'unreachable':
      return {
        className: 'bad',
        label: 'API inacessível',
        detail: 'Não foi possível contatar /health. Verifique a URL da API.',
      };
  }
}
