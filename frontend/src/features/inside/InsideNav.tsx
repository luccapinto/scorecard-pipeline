import { SHOWCASE } from '../../app/edition';
import type { Route, RouteName } from '../../app/routes';
import { DEMO_ONLY, ROUTE_TITLES } from '../../app/routes';
import { hrefFor } from '../../hooks/useHashRoute';

const PAGES: RouteName[] = ['inside', 'new', 'integrations', 'health', 'funnel', 'settings'];

/**
 * The technical screens, one tab strip. Each exists to show HOW a part of the
 * system works; none competes with the product flow in the main navigation.
 */
export function InsideNav({ route }: { route: Route }) {
  const pages = PAGES.filter(
    (name) =>
      !(route.mode === 'api' && DEMO_ONLY[name]) && !(SHOWCASE && name === 'settings'),
  );

  return (
    <nav className="inside-nav" aria-label="Por dentro">
      <p className="inside-nav__label" aria-hidden="true">
        Por dentro
      </p>
      <ul className="inside-nav__list">
        {pages.map((name) => (
          <li key={name}>
            <a
              className="inside-nav__link"
              href={hrefFor({ mode: route.mode, name, clockAnchor: route.clockAnchor })}
              aria-current={route.name === name ? 'page' : undefined}
            >
              {ROUTE_TITLES[name]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
