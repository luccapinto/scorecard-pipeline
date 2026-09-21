// Hash-based routing, mode-aware.
//
// Two things are encoded in the URL on purpose:
//
//  1. The MODE (`api` | `demo`). A persisted localStorage flag cannot satisfy
//     "a shared link opens in the same mode" — the recipient has their own
//     localStorage. So the mode lives in the path: `#/demo/...` is the
//     demonstration dataset, everything else is the real API.
//  2. The demo CLOCK anchor (`?t=<epoch-ms>`). Demo timestamps are offsets
//     from an anchor; without `t` the anchor is "page load", so dates read as
//     genuinely relative to now. With `t`, every render is byte-identical —
//     which is what makes the screenshot script and the tests reproducible.
//
// Hash routing (not the History API) is deliberate and inherited: it needs no
// `try_files` rewrite in nginx and survives being served from any base path.

export type AppMode = 'api' | 'demo';

export type RouteName =
  | 'dashboard'
  | 'interviews'
  | 'interview'
  | 'new'
  | 'approvals'
  | 'integrations'
  | 'health'
  | 'settings'
  | 'funnel';

export interface Route {
  mode: AppMode;
  name: RouteName;
  /** Present only for `interview`. */
  id?: string;
  /** Demo clock anchor in epoch ms, from `?t=`. */
  clockAnchor?: number;
}

/** URL segment for each route, excluding the mode prefix. */
const PATHS: Record<Exclude<RouteName, 'interview'>, string> = {
  dashboard: 'esteira',
  interviews: 'entrevistas',
  new: 'nova',
  approvals: 'aprovacoes',
  integrations: 'integracoes',
  health: 'saude',
  settings: 'configuracao',
  funnel: 'funil',
};

const BY_PATH: Record<string, RouteName> = Object.fromEntries(
  Object.entries(PATHS).map(([name, path]) => [path, name as RouteName]),
);

export const DEFAULT_ROUTE: RouteName = 'dashboard';

/** Routes that only exist in demo mode, because the API has no such concept. */
export const DEMO_ONLY: Partial<Record<RouteName, true>> = { funnel: true };

function parseAnchor(query: string): number | undefined {
  if (!query) return undefined;
  const raw = new URLSearchParams(query).get('t');
  if (raw === null) return undefined;
  const value = Number(raw);
  // A non-finite or negative anchor would produce nonsense dates; ignore it
  // rather than rendering "Invalid Date" across every screen.
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseHash(hash: string): Route {
  const withoutHash = hash.replace(/^#/, '');
  const queryAt = withoutHash.indexOf('?');
  const path = (queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt))
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const clockAnchor = parseAnchor(queryAt === -1 ? '' : withoutHash.slice(queryAt + 1));

  const segments = path ? path.split('/') : [];
  const mode: AppMode = segments[0] === 'demo' ? 'demo' : 'api';
  const rest = mode === 'demo' ? segments.slice(1) : segments;

  const base = { mode, ...(clockAnchor === undefined ? {} : { clockAnchor }) };

  if (rest.length === 0 || rest[0] === '') {
    return { ...base, name: DEFAULT_ROUTE };
  }

  if (rest[0] === PATHS.interviews && rest.length === 2 && rest[1]) {
    return { ...base, name: 'interview', id: decodeURIComponent(rest[1]) };
  }

  const name = rest.length === 1 ? BY_PATH[rest[0]] : undefined;
  if (name && !(mode === 'api' && DEMO_ONLY[name])) {
    return { ...base, name };
  }

  // Unknown path, or a demo-only route requested in API mode: fall back to the
  // dashboard of the requested mode rather than rendering a dead screen.
  return { ...base, name: DEFAULT_ROUTE };
}

export function routeToHash(route: Route): string {
  const prefix = route.mode === 'demo' ? '/demo' : '';
  const tail =
    route.name === 'interview'
      ? `/${PATHS.interviews}/${encodeURIComponent(route.id ?? '')}`
      : `/${PATHS[route.name]}`;
  const query = route.clockAnchor === undefined ? '' : `?t=${route.clockAnchor}`;
  return `#${prefix}${tail}${query}`;
}

/** Same route in the other mode, used by the mode switch. */
export function withMode(route: Route, mode: AppMode): Route {
  if (mode === 'api' && DEMO_ONLY[route.name]) {
    return { ...route, mode, name: DEFAULT_ROUTE, id: undefined };
  }
  // Interview ids are per-dataset: a `demo-` id means nothing to the API and a
  // real UUID means nothing to the demo. Switching mode lands on the list.
  if (route.name === 'interview') {
    return { mode, name: 'interviews', clockAnchor: route.clockAnchor };
  }
  return { ...route, mode };
}

export const ROUTE_TITLES: Record<RouteName, string> = {
  dashboard: 'Esteira',
  interviews: 'Entrevistas',
  interview: 'Entrevista',
  new: 'Nova entrevista',
  approvals: 'Aprovações',
  integrations: 'Integrações',
  health: 'Saúde',
  settings: 'Configuração',
  funnel: 'Funil de candidatos',
};

const APP_NAME = 'Scorecard Pipeline';

export function documentTitle(route: Route): string {
  const suffix = route.mode === 'demo' ? ' · Demonstração' : '';
  return `${ROUTE_TITLES[route.name]}${suffix} · ${APP_NAME}`;
}
