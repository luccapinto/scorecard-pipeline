import type { Route } from '../app/routes';
import { loadConfig } from '../config/settings';
import { diagnose } from '../features/health/errorTaxonomy';
import { hrefFor } from '../hooks/useHashRoute';
import { Icon } from './ui/Icon';

interface Props {
  error: unknown;
  onRetry?: () => void;
  /**
   * Base URL, used only to tell a CORS rejection from a dead host. Defaults
   * to the configured one: every caller needs the distinction, and threading
   * it through each view is exactly the kind of prop that gets forgotten —
   * which silently degrades every CORS failure into a wrong "API is down".
   */
  baseUrl?: string;
  /** Current route, so the "open settings" action keeps the mode. */
  route?: Route;
}

// Never a blank screen. The classification lives in `errorTaxonomy` (pure and
// unit-tested); this component only renders it, plus the one action worth
// offering for that class of failure.
export function ErrorState({ error, onRetry, baseUrl, route }: Props) {
  const diagnosis = diagnose(error, { baseUrl: baseUrl ?? loadConfig().baseUrl });
  const settingsHref =
    route === undefined
      ? null
      : hrefFor({ mode: route.mode, name: 'settings', clockAnchor: route.clockAnchor });

  return (
    <div className={`error-state error-state--${diagnosis.kind}`} role="alert">
      <span className="error-state__icon" aria-hidden="true">
        <Icon name="alert" size="1.5rem" />
      </span>
      <div className="error-state__body">
        <h2 className="error-state__title">{diagnosis.title}</h2>
        <p className="error-state__message">{diagnosis.explanation}</p>
        <p className="error-state__next">
          <strong>O que fazer:</strong> {diagnosis.nextStep}
        </p>
        <div className="error-state__actions">
          {onRetry && (
            <button type="button" className="btn" onClick={onRetry}>
              <Icon name="rotate" />
              Tentar novamente
            </button>
          )}
          {diagnosis.kind === 'auth' && settingsHref !== null && (
            <a className="btn btn--primary" href={settingsHref}>
              Abrir configuração
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
