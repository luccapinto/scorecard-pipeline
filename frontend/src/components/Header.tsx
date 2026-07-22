import type { ApiConfig } from '../api/client';
import { HealthIndicator } from './HealthIndicator';

interface Props {
  config: ApiConfig;
  onOpenList: () => void;
  onOpenNew: () => void;
  onToggleConfig: () => void;
  configOpen: boolean;
}

export function Header({ config, onOpenList, onOpenNew, onToggleConfig, configOpen }: Props) {
  return (
    <header className="app-header">
      <button type="button" className="app-header__brand" onClick={onOpenList}>
        <span className="app-header__logo" aria-hidden="true">
          ◆
        </span>
        Scorecard Pipeline
      </button>

      <nav className="app-header__nav" aria-label="Navegação principal">
        <button type="button" className="btn btn--ghost" onClick={onOpenList}>
          Esteira
        </button>
        <button type="button" className="btn btn--ghost" onClick={onOpenNew}>
          Nova entrevista
        </button>
      </nav>

      <div className="app-header__right">
        <HealthIndicator config={config} />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onToggleConfig}
          aria-expanded={configOpen}
          aria-label="Configuração da API"
        >
          Configuração
        </button>
      </div>
    </header>
  );
}
