import { useEffect, useState } from 'react';

import type { Route } from '../app/routes';
import { documentTitle, parseHash, routeToHash } from '../app/routes';

function currentHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

export function navigate(route: Route): void {
  window.location.hash = routeToHash(route);
}

/**
 * `href` for a route, so navigation uses real anchors. Buttons that change
 * location are invisible to "open in new tab", copy-link and middle-click —
 * on a dashboard people share links from, that matters.
 */
export function hrefFor(route: Route): string {
  return routeToHash(route);
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(currentHash()));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    // The hash may have changed between the initial render and this effect
    // (e.g. a redirect fired during mount); resync rather than trust state.
    onChange();
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // A dashboard people keep in a background tab should say what it is in the
  // tab strip, and screen readers announce the title on navigation.
  useEffect(() => {
    document.title = documentTitle(route);
  }, [route]);

  return route;
}
