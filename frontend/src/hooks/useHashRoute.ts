import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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

  // A different page opens at its top, as a page load would. Hash navigation
  // keeps the document's scroll offset, so without this a page inherited the
  // previous one's: "Por dentro" clicked from the bottom of a scorecard opened
  // with its heading far above the viewport. Only the page counts — a
  // highlighted citation or a tour step within it keeps the reader in place.
  // A layout effect, so the new page never paints at the old offset; and an
  // instant jump, since `html { scroll-behavior: smooth }` would otherwise
  // glide the new page up from where the old one was.
  const page = route.id === undefined ? route.name : `${route.name}/${route.id}`;
  const shownPage = useRef(page);
  useLayoutEffect(() => {
    if (shownPage.current === page) return;
    shownPage.current = page;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [page]);

  return route;
}
