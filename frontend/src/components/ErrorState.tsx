import { AuthError, isApiError, NotFoundError, ApiUnavailableError, errorMessage } from '../api/errors';

interface Props {
  error: unknown;
  onRetry?: () => void;
  onOpenConfig?: () => void;
}

// Never a blank screen: renders a clear, differentiated message for the three
// failure classes the spec calls out (API down / 401-403 / 404) plus a
// generic fallback, with a contextual recovery action.
export function ErrorState({ error, onRetry, onOpenConfig }: Props) {
  const isAuth = error instanceof AuthError;
  const isDown = error instanceof ApiUnavailableError;
  const isNotFound = error instanceof NotFoundError;

  let title = 'Erro';
  if (isDown) title = 'API fora do ar';
  else if (isAuth) title = 'Chave de API inválida';
  else if (isNotFound) title = 'Não encontrado';
  else if (isApiError(error) && error.status) title = `Erro ${error.status}`;

  return (
    <div className="error-state" role="alert">
      <h2 className="error-state__title">{title}</h2>
      <p className="error-state__message">{errorMessage(error)}</p>
      <div className="error-state__actions">
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry}>
            Tentar novamente
          </button>
        )}
        {isAuth && onOpenConfig && (
          <button type="button" className="btn btn--primary" onClick={onOpenConfig}>
            Abrir configuração
          </button>
        )}
      </div>
    </div>
  );
}
