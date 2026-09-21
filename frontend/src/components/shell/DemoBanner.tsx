import type { Route } from '../../app/routes';
import { withMode } from '../../app/routes';
import { hrefFor } from '../../hooks/useHashRoute';
import { Icon } from '../ui/Icon';

interface Props {
  route: Route;
  onReset: () => void;
}

/**
 * Persistent and deliberately not dismissible.
 *
 * In a project whose subject is detecting fabricated evidence, a synthetic
 * dataset that can be mistaken for real data — in a screenshot, in a shared
 * link, in a recording — would undo the argument. The banner is the guarantee
 * that no frame of this interface is ambiguous about what it is showing.
 */
export function DemoBanner({ route, onReset }: Props) {
  return (
    <div className="demo-banner" role="note" aria-label="Aviso de dados sintéticos">
      <Icon name="flask" className="demo-banner__icon" />
      <p className="demo-banner__text">
        <strong>Modo demonstração.</strong> Todos os dados desta tela são sintéticos e ficam
        inteiramente no seu navegador — nenhuma requisição sai e nenhuma escrita toca a API.
        Pessoas, vagas e decisões aqui são fictícias.
      </p>
      <div className="demo-banner__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
          <Icon name="rotate" />
          Reiniciar demonstração
        </button>
        <a className="btn btn--ghost btn--sm" href={hrefFor(withMode(route, 'api'))}>
          Ir para a API real
        </a>
      </div>
    </div>
  );
}
