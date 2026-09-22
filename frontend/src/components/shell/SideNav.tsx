import type { AppMode, Route, RouteName } from '../../app/routes';
import { DEMO_ONLY, ROUTE_TITLES } from '../../app/routes';
import { hrefFor } from '../../hooks/useHashRoute';
import type { IconName } from '../ui/Icon';
import { Icon } from '../ui/Icon';

interface NavItem {
  name: RouteName;
  icon: IconName;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { name: 'dashboard', icon: 'dashboard' },
      { name: 'interviews', icon: 'list' },
      { name: 'approvals', icon: 'gavel' },
      { name: 'funnel', icon: 'funnel' },
    ],
  },
  {
    label: 'Entrada',
    items: [{ name: 'new', icon: 'plus' }],
  },
  {
    label: 'Sistema',
    items: [
      { name: 'integrations', icon: 'plug' },
      { name: 'health', icon: 'pulse' },
      { name: 'settings', icon: 'settings' },
    ],
  },
];

interface Props {
  route: Route;
  mode: AppMode;
  /** Count of items needing a human, shown on the approvals entry. */
  pendingCount: number | null;
}

export function SideNav({ route, mode, pendingCount }: Props) {
  return (
    <nav className="nav" aria-label="Navegação principal">
      <div className="nav__brand">
        <span className="nav__mark" aria-hidden="true">
          SP
        </span>
        <span className="nav__brand-text">
          <span className="nav__title">Scorecard Pipeline</span>
          <span className="nav__subtitle">
            {mode === 'demo' ? 'Dados sintéticos' : 'API ao vivo'}
          </span>
        </span>
      </div>

      {GROUPS.map((group) => (
        <div key={group.label} className="nav__group">
          <h2 className="nav__group-label">{group.label}</h2>
          {group.items.map((item) => (
            <NavLink
              key={item.name}
              item={item}
              route={route}
              mode={mode}
              badge={item.name === 'approvals' ? pendingCount : null}
            />
          ))}
        </div>
      ))}

      <div className="nav__spacer" />

      <div className="nav__foot">
        <a
          className="nav__foot-link"
          href="https://github.com/luccapinto/scorecard-pipeline"
          target="_blank"
          rel="noreferrer noopener"
        >
          Código no GitHub <Icon name="external" />
        </a>
        <span>Nenhuma decisão é tomada por máquina.</span>
      </div>
    </nav>
  );
}

interface LinkProps {
  item: NavItem;
  route: Route;
  mode: AppMode;
  badge: number | null;
}

function NavLink({ item, route, mode, badge }: LinkProps) {
  const label = ROUTE_TITLES[item.name];
  const demoOnly = DEMO_ONLY[item.name] === true;
  // A demo-only destination stays reachable from API mode, but navigating to
  // it switches mode explicitly rather than pretending the API has the data.
  const target: Route = { ...route, mode: demoOnly ? 'demo' : mode, name: item.name, id: undefined };
  const isCurrent = route.name === item.name;

  const showsBadge = badge !== null && badge > 0;
  const description = [
    label,
    demoOnly && mode !== 'demo' ? '(só no modo demonstração)' : '',
    showsBadge ? `${badge} aguardando decisão` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <a
      className="nav__link"
      href={hrefFor(target)}
      aria-current={isCurrent ? 'page' : undefined}
      // The label collapses to an icon below 560px, so the accessible name
      // can never depend on the visible text alone.
      aria-label={description}
    >
      <span className="nav__icon">
        <Icon name={item.icon} />
      </span>
      <span className="nav__label">{label}</span>
      {demoOnly && mode !== 'demo' && (
        <span className="nav__pill" aria-hidden="true">
          demo
        </span>
      )}
      {showsBadge && (
        <span className="nav__badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </a>
  );
}
