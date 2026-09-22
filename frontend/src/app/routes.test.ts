import { describe, expect, it } from 'vitest';

import type { Route, RouteName } from './routes';
import { documentTitle, parseHash, routeToHash, withMode } from './routes';

const PATH_BY_ROUTE: Record<Exclude<RouteName, 'interview'>, string> = {
  dashboard: 'esteira',
  interviews: 'entrevistas',
  new: 'nova',
  approvals: 'aprovacoes',
  integrations: 'integracoes',
  health: 'saude',
  settings: 'configuracao',
  funnel: 'funil',
};

describe('parseHash', () => {
  it('treats an empty hash and a bare slash as the API dashboard', () => {
    expect(parseHash('')).toEqual({ mode: 'api', name: 'dashboard' });
    expect(parseHash('#/')).toEqual({ mode: 'api', name: 'dashboard' });
    expect(parseHash('#')).toEqual({ mode: 'api', name: 'dashboard' });
  });

  it('treats the bare demo prefix as the demo dashboard', () => {
    expect(parseHash('#/demo')).toEqual({ mode: 'demo', name: 'dashboard' });
    expect(parseHash('#/demo/')).toEqual({ mode: 'demo', name: 'dashboard' });
  });

  it.each([
    ['#/esteira', 'dashboard'],
    ['#/entrevistas', 'interviews'],
    ['#/nova', 'new'],
    ['#/aprovacoes', 'approvals'],
    ['#/integracoes', 'integrations'],
    ['#/saude', 'health'],
    ['#/configuracao', 'settings'],
  ] as [string, RouteName][])('parses %s in API mode', (hash, name) => {
    expect(parseHash(hash)).toEqual({ mode: 'api', name });
  });

  it.each([
    ['#/demo/esteira', 'dashboard'],
    ['#/demo/entrevistas', 'interviews'],
    ['#/demo/nova', 'new'],
    ['#/demo/aprovacoes', 'approvals'],
    ['#/demo/integracoes', 'integrations'],
    ['#/demo/saude', 'health'],
    ['#/demo/configuracao', 'settings'],
    ['#/demo/funil', 'funnel'],
  ] as [string, RouteName][])('parses %s in demo mode', (hash, name) => {
    expect(parseHash(hash)).toEqual({ mode: 'demo', name });
  });

  it('parses an interview detail route in both modes', () => {
    expect(parseHash('#/entrevistas/abc-123')).toEqual({
      mode: 'api',
      name: 'interview',
      id: 'abc-123',
    });
    expect(parseHash('#/demo/entrevistas/demo-ana-sintetica')).toEqual({
      mode: 'demo',
      name: 'interview',
      id: 'demo-ana-sintetica',
    });
  });

  it('falls back to the API dashboard for the demo-only funnel route', () => {
    // The real API has no funnel concept; rendering it would be a dead screen.
    expect(parseHash('#/funil')).toEqual({ mode: 'api', name: 'dashboard' });
  });

  it('falls back to the dashboard of the REQUESTED mode for an unknown path', () => {
    expect(parseHash('#/demo/inexistente')).toEqual({ mode: 'demo', name: 'dashboard' });
    expect(parseHash('#/inexistente')).toEqual({ mode: 'api', name: 'dashboard' });
    expect(parseHash('#/demo/entrevistas/a/b/c')).toEqual({ mode: 'demo', name: 'dashboard' });
  });

  it('URL-decodes the interview id', () => {
    expect(parseHash('#/entrevistas/com%20espa%C3%A7o').id).toBe('com espaço');
    expect(parseHash('#/entrevistas/a%2Fb').id).toBe('a/b');
  });

  it('reads a positive finite clock anchor from ?t=', () => {
    expect(parseHash('#/demo/esteira?t=1750000000000')).toEqual({
      mode: 'demo',
      name: 'dashboard',
      clockAnchor: 1750000000000,
    });
    expect(parseHash('#/demo/entrevistas/demo-x?t=42')).toEqual({
      mode: 'demo',
      name: 'interview',
      id: 'demo-x',
      clockAnchor: 42,
    });
  });

  it.each(['', '?', '?t=', '?t=ontem', '?t=0', '?t=-5', '?t=NaN', '?outro=1'])(
    'ignores a missing or nonsensical anchor in %j',
    (query) => {
      // A non-finite or non-positive anchor would render "Invalid Date" across
      // every screen; dropping it keeps the page on the live clock instead.
      expect(parseHash(`#/demo/esteira${query}`).clockAnchor).toBeUndefined();
    },
  );
});

describe('routeToHash', () => {
  it.each(Object.entries(PATH_BY_ROUTE) as [Exclude<RouteName, 'interview'>, string][])(
    'builds and round-trips the %s route',
    (name, path) => {
      const demo: Route = { mode: 'demo', name };
      expect(routeToHash(demo)).toBe(`#/demo/${path}`);
      expect(parseHash(routeToHash(demo))).toEqual(demo);

      // `funnel` is demo-only, so only its demo hash round-trips.
      if (name !== 'funnel') {
        const api: Route = { mode: 'api', name };
        expect(routeToHash(api)).toBe(`#/${path}`);
        expect(parseHash(routeToHash(api))).toEqual(api);
      }
    },
  );

  it('round-trips an interview route with the anchor attached', () => {
    const route: Route = {
      mode: 'demo',
      name: 'interview',
      id: 'demo-ana-sintetica',
      clockAnchor: 1750000000000,
    };
    expect(routeToHash(route)).toBe('#/demo/entrevistas/demo-ana-sintetica?t=1750000000000');
    expect(parseHash(routeToHash(route))).toEqual(route);
  });

  it.each(['com espaço', 'a/b', 'id#estranho?x=1'])('re-encodes the id %j', (id) => {
    const route: Route = { mode: 'api', name: 'interview', id };
    const hash = routeToHash(route);
    // The raw character never survives into the hash: it would be parsed as a
    // path separator or a query start.
    expect(hash).not.toContain(' ');
    expect(hash.slice('#/entrevistas/'.length)).not.toContain('/');
    expect(parseHash(hash)).toEqual(route);
  });
});

describe('withMode', () => {
  it('lands on the dashboard when a demo-only route switches to the API', () => {
    expect(withMode({ mode: 'demo', name: 'funnel' }, 'api')).toEqual({
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
      withMode({ mode: 'demo', name: 'interview', id: 'demo-ana-sintetica' }, 'api'),
    ).toEqual({ mode: 'api', name: 'interviews' });
    expect(withMode({ mode: 'api', name: 'interview', id: 'abc-123' }, 'demo')).toEqual({
      mode: 'demo',
      name: 'interviews',
    });
  });

  it('keeps an ordinary route and its clock anchor', () => {
    expect(withMode({ mode: 'api', name: 'approvals', clockAnchor: 42 }, 'demo')).toEqual({
      mode: 'demo',
      name: 'approvals',
      clockAnchor: 42,
    });
    expect(
      withMode({ mode: 'demo', name: 'interview', id: 'demo-x', clockAnchor: 42 }, 'api')
        .clockAnchor,
    ).toBe(42);
  });
});

describe('documentTitle', () => {
  it('names the route and the app', () => {
    expect(documentTitle({ mode: 'api', name: 'approvals' })).toBe(
      'Aprovações · Scorecard Pipeline',
    );
  });

  it('marks demo mode so a screenshot cannot be mistaken for production', () => {
    expect(documentTitle({ mode: 'demo', name: 'funnel' })).toBe(
      'Funil de candidatos · Demonstração · Scorecard Pipeline',
    );
  });

  it('titles every route without leaking undefined', () => {
    const names: RouteName[] = [...(Object.keys(PATH_BY_ROUTE) as RouteName[]), 'interview'];
    for (const name of names) {
      const title = documentTitle({ mode: 'api', name });
      expect(title).not.toContain('undefined');
      expect(title.endsWith('· Scorecard Pipeline')).toBe(true);
    }
  });
});
