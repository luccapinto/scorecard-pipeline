import type { Route } from '../../app/routes';
import { ROUTE_TITLES } from '../../app/routes';
import { hrefFor } from '../../hooks/useHashRoute';
import { shortId } from '../../lib/format';

interface Props {
  route: Route;
}

/**
 * Trail for deep screens. Only the interview detail is genuinely nested; the
 * rest are top level and render a single current item rather than a fake
 * hierarchy.
 */
export function Breadcrumbs({ route }: Props) {
  const home: Route = { mode: route.mode, name: 'dashboard', clockAnchor: route.clockAnchor };
  const trail: { label: string; href?: string }[] = [
    { label: route.mode === 'demo' ? 'Demonstração' : 'Esteira', href: hrefFor(home) },
  ];

  if (route.name === 'interview') {
    trail.push({
      label: ROUTE_TITLES.interviews,
      href: hrefFor({ mode: route.mode, name: 'interviews', clockAnchor: route.clockAnchor }),
    });
    trail.push({ label: route.id ? shortId(route.id) : ROUTE_TITLES.interview });
  } else if (route.name !== 'dashboard') {
    trail.push({ label: ROUTE_TITLES[route.name] });
  }

  return (
    <nav className="crumbs" aria-label="Trilha de navegação">
      <ol className="crumbs__list">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="crumbs__item">
              {index > 0 && (
                <span className="crumbs__sep" aria-hidden="true">
                  /
                </span>
              )}
              {isLast || !crumb.href ? (
                <span className="crumbs__current" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <a className="crumbs__link" href={crumb.href}>
                  {crumb.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
