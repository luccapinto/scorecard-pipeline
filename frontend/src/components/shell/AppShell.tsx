import type { Route } from '../../app/routes';
import { AUTHOR_NAME, AUTHOR_URL, REPO_URL } from '../../app/links';
import { hrefFor } from '../../hooks/useHashRoute';
import { Icon } from '../ui/Icon';
import { BrandMark, BrandWordmark } from './Brand';
import { MainNav } from './MainNav';

interface Props {
  route: Route;
  /** Items awaiting a human decision, for the nav badge. `null` while unknown. */
  pendingCount: number | null;
  /** Right-hand controls: tour, synthetic marker, mode switch, options. */
  actions: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A masthead, not a sidebar: four destinations fit in one line, and a left
 * rail of eight grouped items is what made the old interface read as an admin
 * console. On a phone the same four become a scrollable strip under the
 * brand, so nothing hides behind a hamburger.
 */
export function AppShell({ route, pendingCount, actions, children }: Props) {
  const home: Route =
    route.mode === 'demo'
      ? { mode: 'demo', name: 'home', clockAnchor: route.clockAnchor }
      : { mode: 'api', name: 'dashboard' };

  return (
    <div className="shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="masthead">
        <div className="masthead__inner">
          <a className="brand" href={hrefFor(home)}>
            <BrandMark />
            <BrandWordmark />
            <span className="sr-only">
              {route.mode === 'demo' ? ', página inicial' : ', esteira'}
            </span>
          </a>
          <MainNav route={route} pendingCount={pendingCount} />
          <div className="masthead__actions">{actions}</div>
        </div>
      </header>

      <main className="content" id="conteudo" tabIndex={-1}>
        {children}
      </main>

      <footer className="app-footer">
        <p>
          Scorecard Pipeline — projeto de{' '}
          <a href={AUTHOR_URL} target="_blank" rel="noreferrer noopener">
            {AUTHOR_NAME}
          </a>
          . Nenhuma decisão sobre uma pessoa é tomada por máquina.
        </p>
        <a className="app-footer__code" href={REPO_URL} target="_blank" rel="noreferrer noopener">
          <Icon name="github" />
          Código no GitHub
          <span className="sr-only"> (abre em nova aba)</span>
        </a>
      </footer>
    </div>
  );
}
