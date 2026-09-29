import { SHOWCASE } from '../app/edition';
import type { Route } from '../app/routes';
import { errorMessage } from '../api/errors';
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
  /** Current route, so the actions keep the mode and the clock. */
  route?: Route;
}

// Never a blank screen. The classification lives in `errorTaxonomy` (pure and
// unit-tested); this component only renders it, plus the one action worth
// offering for that class of failure.
//
// In the showcase there is no network to fail: the only error the demo
// source can raise is "that id is not in this dataset" (a stale or hand-typed
// link). The API taxonomy — CORS, keys, offline hosts — would describe a
// product the visitor is not using, so that branch is compiled out entirely.
export function ErrorState({ error, onRetry, baseUrl, route }: Props) {
  if (SHOWCASE) {
    return (
      <div className="error-state" role="alert">
        <Icon name="question" size="1.5rem" className="error-state__icon" />
        <div className="error-state__body">
          <h2 className="error-state__title">Isto não existe nesta demonstração</h2>
          <p className="error-state__message">{errorMessage(error)}</p>
          <p className="error-state__next">
            Links de demonstração apontam para um cenário fictício que recomeça a cada visita; uma
            entrevista criada numa sessão anterior não existe mais.
          </p>
          <div className="error-state__actions">
            <a
              className="btn btn--primary"
              href={hrefFor({ mode: 'demo', name: 'dashboard', clockAnchor: route?.clockAnchor })}
            >
              Voltar para a esteira
            </a>
          </div>
        </div>
      </div>
    );
  }

  const diagnosis = diagnose(error, { baseUrl: baseUrl ?? loadConfig().baseUrl });
  const settingsHref =
    route === undefined
      ? null
      : hrefFor({ mode: route.mode, name: 'settings', clockAnchor: route.clockAnchor });

  return (
    <div className={`error-state error-state--${diagnosis.kind}`} role="alert">
      <Icon name="alert" size="1.5rem" className="error-state__icon" />
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
