import { useEffect, useState } from 'react';

// Minimal hash-based router. Chosen over react-router to avoid a dependency:
// the app has three views and hash routing needs no server config (works under
// nginx at any base path, and deep links survive refresh without try_files
// rewrites). See frontend/README.md for the rationale.

export type Route =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'detail'; id: string };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#/, '').replace(/^\/+/, '');
  if (clean === '' || clean === 'entrevistas') return { name: 'list' };
  if (clean === 'nova') return { name: 'new' };
  const match = clean.match(/^entrevistas\/([^/]+)$/);
  if (match) return { name: 'detail', id: decodeURIComponent(match[1]) };
  return { name: 'list' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'list':
      return '#/entrevistas';
    case 'new':
      return '#/nova';
    case 'detail':
      return `#/entrevistas/${encodeURIComponent(route.id)}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeToHash(route);
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof window !== 'undefined' ? window.location.hash : ''),
  );

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
