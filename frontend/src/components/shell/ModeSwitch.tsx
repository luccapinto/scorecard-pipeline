import type { AppMode, Route } from '../../app/routes';
import { withMode } from '../../app/routes';
import { hrefFor } from '../../hooks/useHashRoute';
import { Icon } from '../ui/Icon';

interface Props {
  route: Route;
}

const OPTIONS: { mode: AppMode; label: string; hint: string }[] = [
  { mode: 'api', label: 'API', hint: 'Dados reais da API. Nada é fabricado.' },
  {
    mode: 'demo',
    label: 'Demonstração',
    hint: 'Dataset sintético, 100% no navegador. Nenhuma requisição sai.',
  },
];

/**
 * The mode lives in the URL, so each option is a real link: copying it carries
 * the mode with it, which a localStorage flag could never do — the recipient
 * has their own localStorage.
 */
export function ModeSwitch({ route }: Props) {
  return (
    <div className="mode-switch" role="group" aria-label="Fonte de dados">
      {OPTIONS.map((option) => {
        const active = route.mode === option.mode;
        return (
          <a
            key={option.mode}
            className={`mode-switch__option ${active ? 'is-active' : ''}`}
            href={hrefFor(withMode(route, option.mode))}
            aria-current={active ? 'true' : undefined}
            title={option.hint}
          >
            {option.mode === 'demo' && <Icon name="flask" />}
            <span>{option.label}</span>
            <span className="sr-only">. {option.hint}</span>
          </a>
        );
      })}
    </div>
  );
}
