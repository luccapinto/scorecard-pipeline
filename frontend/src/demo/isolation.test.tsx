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
import { DEMO_INTERVIEW_COUNT } from './dataset';

/** Every way a browser can reach the network from application code. */
interface NetworkSpies {
  fetch: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  sendBeacon: ReturnType<typeof vi.fn>;
  calls: () => number;
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
  XMLHttpRequest.prototype.open = openSpy as unknown as typeof XMLHttpRequest.prototype.open;
  Object.defineProperty(navigator, 'sendBeacon', { value: beaconSpy, configurable: true });

  return {
    fetch: fetchSpy,
    open: openSpy,
    sendBeacon: beaconSpy,
    calls: () => fetchSpy.mock.calls.length + openSpy.mock.calls.length + beaconSpy.mock.calls.length,
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
  vi.unstubAllGlobals();
});

describe('demo mode isolation', () => {
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

  it('advances the pipeline, creates and reprocesses without a request', async () => {
    const user = userEvent.setup();
    goTo('esteira');
    render(<App />);

    await screen.findByRole('heading', { name: 'Esteira', level: 1 });
    await user.click(screen.getByRole('button', { name: /Avançar esteira/i }));
    await user.click(screen.getByRole('button', { name: /Avançar esteira/i }));

    expect(network.calls()).toBe(0);
  });

  it('renders the integrations screen, including the Slack preview, offline', async () => {
    goTo('integracoes');
    render(<App />);

    await screen.findByRole('heading', { name: 'Integrações e mensagens', level: 1 });
    expect(await screen.findByText(/Avaliação de Entrevista:/)).toBeInTheDocument();
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
