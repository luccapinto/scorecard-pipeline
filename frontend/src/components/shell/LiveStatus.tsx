import { useCallback, useEffect, useState } from 'react';

import type { Health } from '../../api/types';
import type { Route } from '../../app/routes';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { Icon } from '../ui/Icon';

interface Props {
  route: Route;
}

type State = { kind: 'loading' } | { kind: 'health'; health: Health } | { kind: 'down' };

/**
 * Compact health + polling readout for the top bar.
 *
 * It links to the full observability screen rather than trying to explain a
 * failure in 30 characters: the job here is to be noticed, not to diagnose.
 */
export function LiveStatus({ route }: Props) {
  const source = useDataSource();
  const { polling, refreshing } = useInterviews();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const check = useCallback(() => {
    source
      .getHealth()
      .then((health) => setState({ kind: 'health', health }))
      .catch(() => setState({ kind: 'down' }));
  }, [source]);

  useEffect(() => {
    check();
    // A slow beat: this is a liveness hint, not a monitor. The observability
    // screen is where someone goes to actually investigate.
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [check]);

  const tone =
    state.kind === 'down'
      ? 'down'
      : state.kind === 'health' && state.health.status === 'ok'
        ? 'ok'
        : state.kind === 'health'
          ? 'degraded'
          : 'loading';

  const label =
    tone === 'ok'
      ? 'API no ar'
      : tone === 'degraded'
        ? 'API degradada'
        : tone === 'down'
          ? 'API inacessível'
          : 'verificando…';

  const pollingLabel = !polling.enabled
    ? 'sem polling'
    : polling.pausedByVisibility
      ? 'polling pausado (aba oculta)'
      : `polling ${Math.round(polling.intervalMs / 1000)}s`;

  return (
    <a
      className={`live live--${tone}`}
      href={hrefFor({ mode: route.mode, name: 'health', clockAnchor: route.clockAnchor })}
      aria-label={`${label}, ${pollingLabel}. Abrir saúde e observabilidade.`}
    >
      <span className={`live__dot live__dot--${tone}`} aria-hidden="true" />
      <span className="live__text">
        <span className="live__label">{label}</span>
        <span className="live__meta">
          {pollingLabel}
          {refreshing && ' · atualizando'}
        </span>
      </span>
      <Icon name="chevronRight" />
    </a>
  );
}
