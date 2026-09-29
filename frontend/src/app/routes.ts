// Hash-based routing, mode-aware.
//
// Things encoded in the URL on purpose:
//
//  1. The MODE (`api` | `demo`). A persisted localStorage flag cannot satisfy
//     "a shared link opens in the same mode" — the recipient has their own
//     localStorage. So the mode lives in the path: `#/demo/...` is the
//     demonstration dataset, everything else is the real API.
//  2. The demo CLOCK anchor (`?t=<epoch-ms>`). Demo timestamps are offsets
//     from an anchor; without `t` the anchor is "page load", so dates read as
//     genuinely relative to now. With `t`, every render is byte-identical —
//     which is what makes the screenshot script and the tests reproducible.
//  3. The guided-tour entry step (`?tour=<n>`) and the highlighted citation
//     (`?citacao=<n>`), so a tour step or a "this quote, in the transcript"
//     view is a link like any other: shareable, screenshot-able, testable.
//
// In the SHOWCASE build (app/edition.ts) there is no API mode at all: every
// path parses as demonstration, a bare `#/` is the landing page, and API-only
// destinations (settings) fall back to it. Old API-mode links therefore land
// on their demonstration equivalent instead of on a CORS error.
//
// Hash routing (not the History API) is deliberate and inherited: it needs no
// `try_files` rewrite in nginx and survives being served from any base path.

import { SHOWCASE } from './edition';

export type AppMode = 'api' | 'demo';

export type RouteName =
  | 'home'
  | 'dashboard'
  | 'interviews'
  | 'interview'
  | 'approvals'
  | 'inside'
  | 'new'
  | 'integrations'
  | 'health'
  | 'funnel'
  | 'settings';

export interface Route {
  mode: AppMode;
  name: RouteName;
  /** Present only for `interview`. */
  id?: string;
  /** Demo clock anchor in epoch ms, from `?t=`. */
  clockAnchor?: number;
  /** 1-based guided-tour step to open at, from `?tour=`. Demo only. */
  tour?: number;
  /** Competency index whose citation is highlighted, from `?citacao=`. Interview only. */
  quote?: number;
}

/** URL segment for each route, excluding the mode prefix. */
const PATHS: Record<Exclude<RouteName, 'interview'>, string> = {
  home: '',
  dashboard: 'esteira',
  interviews: 'entrevistas',
  approvals: 'aprovacoes',
  inside: 'por-dentro',
  new: 'nova',
  integrations: 'integracoes',
  health: 'saude',
  funnel: 'funil',
  settings: 'configuracao',
};

const BY_PATH: Record<string, RouteName> = Object.fromEntries(
  Object.entries(PATHS)
    .filter(([, path]) => path !== '')
    .map(([name, path]) => [path, name as RouteName]),
);

/** Routes that only exist in demo mode, because the API has no such concept. */
export const DEMO_ONLY: Partial<Record<RouteName, true>> = { home: true, funnel: true };

/** Routes that only exist where there is a real API to configure. */
export const API_ONLY_IN_SHOWCASE: Partial<Record<RouteName, true>> = { settings: true };

function parsePositive(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const value = Number(raw);
  // A non-finite or negative anchor would produce nonsense dates; ignore it
  // rather than rendering "Invalid Date" across every screen.
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseHash(hash: string, showcase: boolean = SHOWCASE): Route {
  const withoutHash = hash.replace(/^#/, '');
  const queryAt = withoutHash.indexOf('?');
  const path = (queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt))
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const params = new URLSearchParams(queryAt === -1 ? '' : withoutHash.slice(queryAt + 1));
  const clockAnchor = parsePositive(params, 't');
  const tour = parsePositive(params, 'tour');

  const segments = path ? path.split('/') : [];
  const prefixed = segments[0] === 'demo';
  const mode: AppMode = showcase || prefixed ? 'demo' : 'api';
  const rest = prefixed ? segments.slice(1) : segments;

  const base: Route = {
    mode,
    // With no path the demo opens on its landing page, the API on the pipeline.
    name: mode === 'demo' ? 'home' : 'dashboard',
    ...(clockAnchor === undefined ? {} : { clockAnchor }),
    ...(tour === undefined || mode !== 'demo' ? {} : { tour: Math.floor(tour) }),
  };

  if (rest.length === 0 || rest[0] === '') {
    return base;
  }

  if (rest[0] === PATHS.interviews && rest.length === 2 && rest[1]) {
    const rawQuote = params.get('citacao');
    const quote = rawQuote !== null && /^\d+$/.test(rawQuote) ? Number(rawQuote) : undefined;
    return {
      ...base,
      name: 'interview',
      id: decodeURIComponent(rest[1]),
      ...(quote === undefined ? {} : { quote }),
    };
  }

  const name = rest.length === 1 ? BY_PATH[rest[0]] : undefined;
  if (name !== undefined) {
    // The showcase has nothing to configure: the settings screen belongs to
    // someone running the backend, so its old links open the landing page.
    if (showcase && API_ONLY_IN_SHOWCASE[name]) return { ...base, name: 'home' };
    if (!(mode === 'api' && DEMO_ONLY[name])) return { ...base, name };
  }

  // Unknown path, or a demo-only route requested in API mode: fall back to the
  // pipeline of the requested mode rather than rendering a dead screen.
  return { ...base, name: 'dashboard' };
}

export function routeToHash(route: Route): string {
  const prefix = route.mode === 'demo' ? '/demo' : '';
  const tail =
    route.name === 'interview'
      ? `/${PATHS.interviews}/${encodeURIComponent(route.id ?? '')}`
      : PATHS[route.name] === ''
        ? ''
        : `/${PATHS[route.name]}`;

  const query: string[] = [];
  if (route.clockAnchor !== undefined) query.push(`t=${route.clockAnchor}`);
  if (route.name === 'interview' && route.quote !== undefined) query.push(`citacao=${route.quote}`);
  if (route.mode === 'demo' && route.tour !== undefined) query.push(`tour=${route.tour}`);

  const hashPath = `${prefix}${tail}` || '/';
  return `#${hashPath}${query.length > 0 ? `?${query.join('&')}` : ''}`;
}

/** Same route in the other mode, used by the mode switch. */
export function withMode(route: Route, mode: AppMode): Route {
  const kept: Route = {
    mode,
    name: route.name,
    ...(route.clockAnchor === undefined ? {} : { clockAnchor: route.clockAnchor }),
  };
  if (mode === 'api' && DEMO_ONLY[route.name]) {
    return { ...kept, name: 'dashboard' };
  }
  // Interview ids are per-dataset: a `demo-` id means nothing to the API and a
  // real UUID means nothing to the demo. Switching mode lands on the list.
  if (route.name === 'interview') {
    return { ...kept, name: 'interviews' };
  }
  return kept;
}

export const ROUTE_TITLES: Record<RouteName, string> = {
  home: 'Início',
  dashboard: 'Esteira',
  interviews: 'Entrevistas',
  interview: 'Entrevista',
  approvals: 'Decisões',
  inside: 'Como funciona',
  new: 'Ingestão',
  integrations: 'Slack e integrações',
  health: 'Saúde',
  funnel: 'Funil de candidatos',
  settings: 'Configuração',
};

/** The technical screens, grouped under "Por dentro" instead of the main nav. */
export const INSIDE_ROUTES: RouteName[] = [
  'inside',
  'new',
  'integrations',
  'health',
  'funnel',
  'settings',
];

const APP_NAME = 'Scorecard Pipeline';

export function documentTitle(route: Route): string {
  if (route.name === 'home') {
    return `${APP_NAME} — scorecards de entrevista com evidência conferida`;
  }
  const suffix = route.mode === 'demo' ? ' · Demonstração' : '';
  return `${ROUTE_TITLES[route.name]}${suffix} · ${APP_NAME}`;
}
