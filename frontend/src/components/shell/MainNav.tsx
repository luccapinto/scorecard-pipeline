import type { Route, RouteName } from '../../app/routes';
import { INSIDE_ROUTES } from '../../app/routes';
import { hrefFor } from '../../hooks/useHashRoute';

interface Item {
  name: RouteName;
  label: string;
  /** Routes that light this item up as the current section. */
  section: RouteName[];
}

// Four destinations, named for what a person does there rather than for the
// subsystem behind them. The engineering screens are one door ("Por dentro"),
// not four items competing with the product for attention.
const ITEMS: Item[] = [
  { name: 'dashboard', label: 'Esteira', section: ['dashboard'] },
  { name: 'interviews', label: 'Entrevistas', section: ['interviews', 'interview'] },
  { name: 'approvals', label: 'Decisões', section: ['approvals'] },
  { name: 'inside', label: 'Por dentro', section: INSIDE_ROUTES },
];

interface Props {
  route: Route;
  /** Items awaiting a human decision, for the badge. `null` while unknown. */
  pendingCount: number | null;
}

export function MainNav({ route, pendingCount }: Props) {
  return (
    <nav className="main-nav" aria-label="Navegação principal">
      <ul className="main-nav__list">
        {ITEMS.map((item) => {
          const current = item.section.includes(route.name);
          const badge = item.name === 'approvals' && pendingCount !== null && pendingCount > 0;
          return (
            <li key={item.name}>
              <a
                className="main-nav__link"
                href={hrefFor({ mode: route.mode, name: item.name, clockAnchor: route.clockAnchor })}
                aria-current={current ? 'page' : undefined}
              >
                {item.label}
                {badge && (
                  <span className="main-nav__badge">
                    {pendingCount}
                    <span className="sr-only"> aguardando decisão</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
