// The demo's central promise, tested end to end: in demonstration mode the
// browser performs NO network I/O of any kind.
//
// This is not a style assertion. The project's subject is a system that can
// fabricate a citation and get caught; a demonstration of it that quietly
// wrote to a real backend — or leaked a request to one — would be the same
// class of failure it exists to expose. So the guarantee is enforced by
// driving the real application through its real flows with every network
// primitive replaced by a throwing spy.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { RouteName } from '../app/routes';
import { ROUTE_TITLES, routeToHash } from '../app/routes';
import { DEMO_INTERVIEW_COUNT } from './dataset';

/** Every way a browser can reach the network from application code. */
interface NetworkSpies {
  fetch: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  sendBeacon: ReturnType<typeof vi.fn>;
  calls: () => number;
  restore: () => void;
}

function installNetworkSpies(): NetworkSpies {
  const fetchSpy = vi.fn(() => {
    throw new Error('Demo mode attempted a fetch() call.');
  });
  const openSpy = vi.fn(() => {
    throw new Error('Demo mode attempted an XMLHttpRequest.');
  });
  const beaconSpy = vi.fn(() => {
    throw new Error('Demo mode attempted a sendBeacon call.');
  });

  vi.stubGlobal('fetch', fetchSpy);
  // `vi.unstubAllGlobals` only reverses `stubGlobal`. These two are patched
  // directly, so they must be restored by hand — otherwise a throwing
  // XMLHttpRequest.open leaks into every later test file whenever the suite
  // runs without per-file isolation.
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon');
  XMLHttpRequest.prototype.open = openSpy as unknown as typeof XMLHttpRequest.prototype.open;
  Object.defineProperty(navigator, 'sendBeacon', { value: beaconSpy, configurable: true });

  return {
    fetch: fetchSpy,
    open: openSpy,
    sendBeacon: beaconSpy,
    calls: () =>
      fetchSpy.mock.calls.length + openSpy.mock.calls.length + beaconSpy.mock.calls.length,
    restore: () => {
      XMLHttpRequest.prototype.open = originalOpen;
      if (originalBeacon === undefined) {
        Reflect.deleteProperty(navigator, 'sendBeacon');
      } else {
        Object.defineProperty(navigator, 'sendBeacon', originalBeacon);
      }
    },
  };
}

/** Fixed anchor: the demo clock is pinned so every assertion is stable. */
const ANCHOR = Date.parse('2026-09-21T14:00:00Z');

function goTo(path: string): void {
  window.location.hash = `#/demo/${path}?t=${ANCHOR}`;
}

let network: NetworkSpies;

beforeEach(() => {
  network = installNetworkSpies();
});

afterEach(() => {
  network.restore();
  vi.unstubAllGlobals();
});

// Derived from the router, not hand-listed: a new route joins this test
// automatically instead of quietly escaping the guarantee.
const EVERY_ROUTE = (Object.keys(ROUTE_TITLES) as RouteName[]).map((name) => ({
  name,
  hash: routeToHash(
    name === 'interview'
      ? { mode: 'demo', name, id: 'demo-ana-sintetica', clockAnchor: ANCHOR }
      : { mode: 'demo', name, clockAnchor: ANCHOR },
  ),
}));

describe('demo mode isolation', () => {
  it.each(EVERY_ROUTE)('renders $name with zero network calls', async ({ hash }) => {
    window.location.hash = hash;
    render(<App />);

    // Every screen has an <h1>; waiting for it proves the route actually
    // rendered rather than erroring into an empty shell.
    await screen.findByRole('heading', { level: 1 });
    expect(network.calls()).toBe(0);
  });

  it('covers every route the router knows about', () => {
    // Guards the guard: if someone adds a RouteName and this list is derived
    // correctly, the count moves with it.
    expect(EVERY_ROUTE.length).toBe(Object.keys(ROUTE_TITLES).length);
    expect(EVERY_ROUTE.map((route) => route.name)).toContain('approvals');
  });

  it('renders the whole dashboard without touching the network', async () => {
    goTo('esteira');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Esteira', level: 1 })).toBeInTheDocument();
    // The synthetic dataset is actually present, so this is not passing by
    // virtue of rendering nothing.
    expect(await screen.findByText(/Modo demonstração/i)).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('lists every seeded interview without a request', async () => {
    goTo('entrevistas');
    render(<App />);

    await screen.findByRole('heading', { name: 'Entrevistas', level: 1 });
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`de ${DEMO_INTERVIEW_COUNT}`))).toBeInTheDocument();
    });
    expect(network.calls()).toBe(0);
  });

  it('completes a decision — the only write in the product — offline', async () => {
    const user = userEvent.setup();
    goTo('entrevistas/demo-ana-sintetica');
    render(<App />);

    await screen.findByRole('heading', { name: /Ana Sintética/, level: 1 });

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    const confirmation = screen.getByRole('group', { name: /Confirmar decisão/i });
    expect(confirmation).toHaveTextContent('Ana Sintética');
    await user.click(within(confirmation).getByRole('button', { name: /Confirmar aprovar/i }));

    await waitFor(() => {
      expect(screen.getByText('Aprovada')).toBeInTheDocument();
    });
    expect(network.calls()).toBe(0);
  });

  it('advances the pipeline offline, and actually moves an interview a stage', async () => {
    const user = userEvent.setup();
    goTo('entrevistas/demo-fabio-simulado');
    render(<App />);

    // Seeded at `recebida`; one clock step must carry it to `transcrevendo`.
    await screen.findByText('Recebida');
    await user.click(screen.getByRole('button', { name: /Avançar esteira/i }));

    await waitFor(() => {
      expect(screen.getByText('Transcrevendo')).toBeInTheDocument();
    });
    expect(network.calls()).toBe(0);
  });

  it('reprocesses a failed interview offline, bumping the retry count', async () => {
    const user = userEvent.setup();
    goTo('entrevistas/demo-lucas-maquete');
    render(<App />);

    // Seeded as `falhou` with retry_count 1.
    await screen.findByRole('heading', { name: /O processamento falhou/i });
    await user.click(screen.getByRole('button', { name: /Reprocessar/i }));

    // app/tasks.py resumes from the last checkpoint and increments the
    // counter; with no transcription saved that means TRANSCREVENDO.
    await waitFor(() => {
      expect(screen.getByText('Transcrevendo')).toBeInTheDocument();
    });
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('creates an interview offline and deduplicates a repeated external_id', async () => {
    const user = userEvent.setup();
    goTo('nova');
    render(<App />);

    await screen.findByRole('heading', { name: 'Nova entrevista', level: 1 });
    await user.selectOptions(screen.getByLabelText('Vaga'), 'python_pleno');
    await user.selectOptions(
      screen.getByLabelText('Gravação'),
      '/srv/app/data/synthetic/interview_python_pleno.wav',
    );
    // This external_id is already on a seeded interview, so the webhook must
    // return the existing one instead of creating a duplicate.
    await user.type(screen.getByLabelText(/ID externo/), 'zoom-rec-8841-b');
    await user.click(screen.getByRole('button', { name: /Disparar webhook/i }));

    expect(await screen.findByText(/Requisição deduplicada/i)).toBeInTheDocument();
    expect(screen.getByText(/nada novo foi criado/i)).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('renders the integrations screen, including the Slack preview, offline', async () => {
    goTo('integracoes');
    render(<App />);

    await screen.findByRole('heading', { name: 'Integrações e mensagens', level: 1 });
    expect(await screen.findByText(/Avaliação de Entrevista:/)).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('renders the observability screen offline', async () => {
    // The screen most likely to grow a network call: it already reads the
    // request telemetry module.
    goTo('saude');
    render(<App />);

    await screen.findByRole('heading', { name: 'Saúde e observabilidade', level: 1 });
    // And it must not display a request captured earlier in API mode.
    expect(screen.getByText(/Nenhuma requisição existe para mostrar/i)).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('renders the settings screen offline', async () => {
    // It edits the API config, so it is the other screen where a stray call
    // would be easy to introduce.
    goTo('configuracao');
    render(<App />);

    await screen.findByRole('heading', { name: 'Configuração', level: 1 });
    expect(network.calls()).toBe(0);
  });

  it('renders the funnel board offline', async () => {
    goTo('funil');
    render(<App />);

    await screen.findByRole('heading', { name: 'Funil de candidatos', level: 1 });
    expect(screen.getByText(/Estas fases não existem no backend/i)).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('never exposes a decision token, even in synthetic data', async () => {
    goTo('integracoes');
    render(<App />);

    await screen.findByRole('heading', { name: 'Links de decisão', level: 2 });
    const body = document.body.textContent ?? '';
    expect(body).toContain('token=«token-de-uso-único-nunca-exposto-pela-api»');
    // A real token is 43 url-safe chars from secrets.token_urlsafe(32).
    expect(body).not.toMatch(/token=[A-Za-z0-9_-]{20,}/);
  });
});
