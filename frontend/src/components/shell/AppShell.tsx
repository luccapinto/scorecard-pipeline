import type { Route } from '../../app/routes';
import type { ThemePreference } from '../../config/preferences';
import { Breadcrumbs } from './Breadcrumbs';
import { DemoBanner } from './DemoBanner';
import { ModeSwitch } from './ModeSwitch';
import { SideNav } from './SideNav';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  route: Route;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onResetDemo: () => void;
  /** Items awaiting a human decision, for the nav badge. `null` while unknown. */
  pendingCount: number | null;
  /** Compact health/polling readout rendered in the top bar. */
  statusSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  route,
  theme,
  onThemeChange,
  onResetDemo,
  pendingCount,
  statusSlot,
  children,
}: Props) {
  return (
    <div className="shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <SideNav route={route} mode={route.mode} pendingCount={pendingCount} />

      <div className="shell__main">
        <header className="topbar">
          <div className="topbar__crumbs">
            <Breadcrumbs route={route} />
          </div>
          <div className="topbar__actions">
            {statusSlot}
            <ModeSwitch route={route} />
            <ThemeToggle value={theme} onChange={onThemeChange} />
          </div>
        </header>

        {route.mode === 'demo' && <DemoBanner route={route} onReset={onResetDemo} />}

        <main className="content" id="conteudo" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
