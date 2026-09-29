import { describe, expect, it } from 'vitest';

import type { Route, RouteName } from './routes';
import { documentTitle, parseHash, routeToHash, withMode } from './routes';

const PATH_BY_ROUTE: Record<Exclude<RouteName, 'interview' | 'home'>, string> = {
  dashboard: 'esteira',
  interviews: 'entrevistas',
  new: 'nova',
  approvals: 'aprovacoes',
  inside: 'por-dentro',
  integrations: 'integracoes',
  health: 'saude',
  settings: 'configuracao',
  funnel: 'funil',
};

describe('parseHash (full build)', () => {
  it('treats an empty hash and a bare slash as the API pipeline', () => {
    expect(parseHash('', false)).toEqual({ mode: 'api', name: 'dashboard' });
    expect(parseHash('#/', false)).toEqual({ mode: 'api', name: 'dashboard' });
    expect(parseHash('#', false)).toEqual({ mode: 'api', name: 'dashboard' });
  });

  it('opens the bare demo prefix on the landing page', () => {
    expect(parseHash('#/demo', false)).toEqual({ mode: 'demo', name: 'home' });
    expect(parseHash('#/demo/', false)).toEqual({ mode: 'demo', name: 'home' });
  });

  it.each(Object.entries(PATH_BY_ROUTE).filter(([name]) => name !== 'funnel'))(
    'parses %s in API mode',
    (name, path) => {
      expect(parseHash(`#/${path}`, false)).toEqual({ mode: 'api', name });
    },
  );

  it.each(Object.entries(PATH_BY_ROUTE))('parses %s in demo mode', (name, path) => {
    expect(parseHash(`#/demo/${path}`, false)).toEqual({ mode: 'demo', name });
  });

  it('parses an interview detail route in both modes', () => {
    expect(parseHash('#/entrevistas/abc-123', false)).toEqual({
      mode: 'api',
      name: 'interview',
      id: 'abc-123',
    });
    expect(parseHash('#/demo/entrevistas/demo-ana-sintetica', false)).toEqual({
      mode: 'demo',
      name: 'interview',
      id: 'demo-ana-sintetica',
    });
  });

  it('falls back to the API pipeline for demo-only routes', () => {
    // The real API has no funnel concept and no landing page; rendering
    // either would be a dead screen.
    expect(parseHash('#/funil', false)).toEqual({ mode: 'api', name: 'dashboard' });
  });

  it('falls back to the pipeline of the REQUESTED mode for an unknown path', () => {
    expect(parseHash('#/demo/inexistente', false)).toEqual({ mode: 'demo', name: 'dashboard' });
    expect(parseHash('#/inexistente', false)).toEqual({ mode: 'api', name: 'dashboard' });
    expect(parseHash('#/demo/entrevistas/a/b/c', false)).toEqual({
      mode: 'demo',
      name: 'dashboard',
    });
  });

  it('URL-decodes the interview id', () => {
    expect(parseHash('#/entrevistas/com%20espa%C3%A7o', false).id).toBe('com espaço');
    expect(parseHash('#/entrevistas/a%2Fb', false).id).toBe('a/b');
  });

  it('reads a positive finite clock anchor from ?t=', () => {
    expect(parseHash('#/demo/esteira?t=1750000000000', false)).toEqual({
      mode: 'demo',
      name: 'dashboard',
      clockAnchor: 1750000000000,
    });
  });

  it.each(['', '?', '?t=', '?t=ontem', '?t=0', '?t=-5', '?t=NaN', '?outro=1'])(
    'ignores a missing or nonsensical anchor in %j',
    (query) => {
      // A non-finite or non-positive anchor would render "Invalid Date" across
      // every screen; dropping it keeps the page on the live clock instead.
      expect(parseHash(`#/demo/esteira${query}`, false).clockAnchor).toBeUndefined();
    },
  );

  it('reads the tour step in demo mode only', () => {
    expect(parseHash('#/demo/esteira?t=42&tour=3', false)).toEqual({
      mode: 'demo',
      name: 'dashboard',
      clockAnchor: 42,
      tour: 3,
    });
    // There is nothing to tour without the demonstration dataset.
    expect(parseHash('#/esteira?tour=3', false).tour).toBeUndefined();
    expect(parseHash('#/demo/esteira?tour=zero', false).tour).toBeUndefined();
  });

  it('reads the highlighted citation on interview routes only', () => {
    expect(parseHash('#/demo/entrevistas/demo-x?citacao=2', false)).toEqual({
      mode: 'demo',
      name: 'interview',
      id: 'demo-x',
      quote: 2,
    });
    expect(parseHash('#/demo/entrevistas/demo-x?citacao=-1', false).quote).toBeUndefined();
    expect(parseHash('#/demo/esteira?citacao=2', false)).not.toHaveProperty('quote');
  });
});

describe('parseHash (showcase build)', () => {
  it('opens the landing page on a bare hash', () => {
    expect(parseHash('', true)).toEqual({ mode: 'demo', name: 'home' });
    expect(parseHash('#/', true)).toEqual({ mode: 'demo', name: 'home' });
    expect(parseHash('#/demo', true)).toEqual({ mode: 'demo', name: 'home' });
  });

  it('keeps the published demo links working', () => {
    expect(parseHash('#/demo/esteira', true)).toEqual({ mode: 'demo', name: 'dashboard' });
    expect(parseHash('#/demo/entrevistas/demo-bruno-exemplo?t=42', true)).toEqual({
      mode: 'demo',
      name: 'interview',
      id: 'demo-bruno-exemplo',
      clockAnchor: 42,
    });
  });

  it.each(Object.entries(PATH_BY_ROUTE).filter(([name]) => name !== 'settings'))(
    'maps the API-mode path of %s to its demonstration equivalent',
    (name, path) => {
      // An old API link must never reach a CORS error: there is no API here.
      expect(parseHash(`#/${path}`, true)).toEqual({ mode: 'demo', name });
    },
  );

  it('maps an API-mode interview link into the demo', () => {
    expect(parseHash('#/entrevistas/abc-123', true)).toEqual({
      mode: 'demo',
      name: 'interview',
      id: 'abc-123',
    });
  });

  it('sends the settings screen, in either spelling, to the landing page', () => {
    expect(parseHash('#/configuracao', true)).toEqual({ mode: 'demo', name: 'home' });
    expect(parseHash('#/demo/configuracao?t=42', true)).toEqual({
      mode: 'demo',
      name: 'home',
      clockAnchor: 42,
    });
  });
});

describe('routeToHash', () => {
  it.each(Object.entries(PATH_BY_ROUTE) as [Exclude<RouteName, 'interview' | 'home'>, string][])(
    'builds and round-trips the %s route',
    (name, path) => {
      const demo: Route = { mode: 'demo', name };
      expect(routeToHash(demo)).toBe(`#/demo/${path}`);
      expect(parseHash(routeToHash(demo), false)).toEqual(demo);

      // `funnel` is demo-only, so only its demo hash round-trips.
      if (name !== 'funnel') {
        const api: Route = { mode: 'api', name };
        expect(routeToHash(api)).toBe(`#/${path}`);
        expect(parseHash(routeToHash(api), false)).toEqual(api);
      }
    },
  );

  it('builds the landing page as the bare demo prefix', () => {
    expect(routeToHash({ mode: 'demo', name: 'home', clockAnchor: 42 })).toBe('#/demo?t=42');
    expect(parseHash('#/demo?t=42', false)).toEqual({ mode: 'demo', name: 'home', clockAnchor: 42 });
  });

  it('round-trips an interview route with anchor, citation and tour step', () => {
    const route: Route = {
      mode: 'demo',
      name: 'interview',
      id: 'demo-ana-sintetica',
      clockAnchor: 1750000000000,
      quote: 0,
      tour: 6,
    };
    expect(routeToHash(route)).toBe(
      '#/demo/entrevistas/demo-ana-sintetica?t=1750000000000&citacao=0&tour=6',
    );
    expect(parseHash(routeToHash(route), false)).toEqual(route);
  });

  it.each(['com espaço', 'a/b', 'id#estranho?x=1'])('re-encodes the id %j', (id) => {
    const route: Route = { mode: 'api', name: 'interview', id };
    const hash = routeToHash(route);
    // The raw character never survives into the hash: it would be parsed as a
    // path separator or a query start.
    expect(hash).not.toContain(' ');
    expect(hash.slice('#/entrevistas/'.length)).not.toContain('/');
    expect(parseHash(hash, false)).toEqual(route);
  });
});

describe('withMode', () => {
  it('lands on the pipeline when a demo-only route switches to the API', () => {
    expect(withMode({ mode: 'demo', name: 'funnel' }, 'api')).toEqual({
      mode: 'api',
      name: 'dashboard',
    });
    expect(withMode({ mode: 'demo', name: 'home' }, 'api')).toEqual({
      mode: 'api',
      name: 'dashboard',
    });
  });

  it('keeps the funnel when staying in demo mode', () => {
    expect(withMode({ mode: 'demo', name: 'funnel' }, 'demo')).toEqual({
      mode: 'demo',
      name: 'funnel',
    });
  });

  it('drops the id and lands on the list when an interview route switches mode', () => {
    // Ids are per-dataset: a `demo-` id means nothing to the API.
    expect(
      withMode({ mode: 'demo', name: 'interview', id: 'demo-ana-sintetica', quote: 1 }, 'api'),
    ).toEqual({ mode: 'api', name: 'interviews' });
    expect(withMode({ mode: 'api', name: 'interview', id: 'abc-123' }, 'demo')).toEqual({
      mode: 'demo',
      name: 'interviews',
    });
  });

  it('keeps an ordinary route and its clock anchor, and leaves the tour behind', () => {
    expect(withMode({ mode: 'demo', name: 'approvals', clockAnchor: 42, tour: 2 }, 'api')).toEqual(
      { mode: 'api', name: 'approvals', clockAnchor: 42 },
    );
  });
});

describe('documentTitle', () => {
  it('names the route and the app', () => {
    expect(documentTitle({ mode: 'api', name: 'approvals' })).toBe('Decisões · Scorecard Pipeline');
  });

  it('marks demo mode so a screenshot cannot be mistaken for production', () => {
    expect(documentTitle({ mode: 'demo', name: 'funnel' })).toBe(
      'Funil de candidatos · Demonstração · Scorecard Pipeline',
    );
  });

  it('titles every route without leaking undefined', () => {
    const names: RouteName[] = [...(Object.keys(PATH_BY_ROUTE) as RouteName[]), 'interview', 'home'];
    for (const name of names) {
      const title = documentTitle({ mode: 'demo', name });
      expect(title).not.toContain('undefined');
      expect(title).toContain('Scorecard Pipeline');
    }
  });
});
