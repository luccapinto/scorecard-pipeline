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
import { TOUR_STEPS } from '../features/tour/steps';
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
    expect(EVERY_ROUTE.map((route) => route.name)).toEqual(
      expect.arrayContaining(['approvals', 'home', 'inside']),
    );
  });

  it('renders the whole pipeline without touching the network', async () => {
    goTo('esteira');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Da gravação à decisão', level: 1 }),
    ).toBeInTheDocument();
    // The synthetic dataset is actually present, so this is not passing by
    // virtue of rendering nothing — and it is labelled as fictitious.
    expect((await screen.findAllByText('Bruno Exemplo')).length).toBeGreaterThan(0);
    expect(screen.getByText('Dados fictícios')).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('lists every seeded interview without a request', async () => {
    goTo('entrevistas');
    render(<App />);

    await screen.findByRole('heading', { name: 'Todas as entrevistas', level: 1 });
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

  it('simulates a new interview offline and walks it to a human decision', async () => {
    const user = userEvent.setup();
    // Reduced motion shortens the walk between stages; the path is the same.
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...matchMedia(query),
      matches: query.includes('prefers-reduced-motion'),
    })) as typeof window.matchMedia;

    try {
      goTo('esteira');
      render(<App />);
      await screen.findAllByText('Bruno Exemplo');
      await user.click(screen.getByRole('button', { name: /Simular nova entrevista/i }));

      // It arrives in the first column, then stops in front of a person —
      // never past it: decisions are not something the pipeline takes.
      await waitFor(() =>
        expect(document.querySelector('.stage--recebida .bcard--fresh')).not.toBeNull(),
      );
      await waitFor(
        () =>
          expect(
            document.querySelector('.stage--aguardando_aprovacao .bcard--fresh'),
          ).not.toBeNull(),
        { timeout: 5000 },
      );
      // Its scorecard carries the citation the search does not find.
      expect(screen.getByText(/pronta para revisão/i)).toHaveTextContent(
        /citação que não está na transcrição/,
      );
      expect(network.calls()).toBe(0);
    } finally {
      window.matchMedia = matchMedia;
    }
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

    await screen.findByRole('heading', { name: 'Como uma gravação entra na esteira', level: 1 });
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

    await screen.findByRole('heading', { name: 'Como o time fica sabendo', level: 1 });
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

  it('shows a real flagged citation on the landing page, offline', async () => {
    window.location.hash = `#/demo?t=${ANCHOR}`;
    render(<App />);

    await screen.findByRole('heading', { level: 1, name: /O sistema confere cada citação/ });
    // Read from the dataset and searched for real, not a hardcoded mock-up.
    expect(await screen.findByText('eu fui o arquiteto do data mesh global da companhia')).toBeInTheDocument();
    expect(screen.getByText(/Não está na transcrição/i)).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('runs the whole guided tour offline, from the landing page to the last step', async () => {
    const user = userEvent.setup();
    window.location.hash = `#/demo?t=${ANCHOR}`;
    render(<App />);

    await user.click((await screen.findAllByRole('button', { name: /Fazer o tour guiado/i }))[0]);

    for (const [index, step] of TOUR_STEPS.entries()) {
      const dialog = await screen.findByRole('dialog', { name: step.title });
      expect(dialog).toHaveTextContent(`${index + 1} de ${TOUR_STEPS.length}`);
      // The step points at something that is really on the screen.
      await waitFor(() => expect(document.querySelector(step.target)).not.toBeNull());
      const last = index === TOUR_STEPS.length - 1;
      await user.click(
        within(dialog).getByRole('button', { name: last ? 'Concluir tour' : 'Próximo' }),
      );
    }

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(network.calls()).toBe(0);
  });

  it.each(TOUR_STEPS.map((step, index) => ({ step, number: index + 1 })))(
    'opens tour step $number directly by URL, with what it talks about already on screen',
    async ({ step, number }) => {
      // What screenshots, the accessibility audit and a shared link do: land
      // on a step cold. The simulated interview must already exist.
      window.location.hash = routeToHash({
        ...step.route('demo-runtime-1'),
        clockAnchor: ANCHOR,
        tour: number,
      });
      render(<App />);

      await screen.findByRole('dialog', { name: step.title });
      await waitFor(() => expect(document.querySelector(step.target)).not.toBeNull());
      expect(screen.queryByText(/não existe nesta demonstração/i)).not.toBeInTheDocument();
      expect(network.calls()).toBe(0);
    },
  );

  it('leaves the tour with Esc and offers to resume it where it stopped', async () => {
    const user = userEvent.setup();
    window.location.hash = routeToHash({ mode: 'demo', name: 'dashboard', clockAnchor: ANCHOR, tour: 3 });
    render(<App />);

    await screen.findByRole('dialog', { name: TOUR_STEPS[2].title });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Retomar/i }));
    expect(await screen.findByRole('dialog', { name: TOUR_STEPS[2].title })).toBeInTheDocument();
    expect(network.calls()).toBe(0);
  });

  it('moves through the tour with the arrow keys', async () => {
    const user = userEvent.setup();
    window.location.hash = routeToHash({ mode: 'demo', name: 'dashboard', clockAnchor: ANCHOR, tour: 1 });
    render(<App />);

    await screen.findByRole('dialog', { name: TOUR_STEPS[0].title });
    await user.keyboard('{ArrowRight}');
    await screen.findByRole('dialog', { name: TOUR_STEPS[1].title });
    await user.keyboard('{ArrowLeft}');
    expect(await screen.findByRole('dialog', { name: TOUR_STEPS[0].title })).toBeInTheDocument();
  });
});
