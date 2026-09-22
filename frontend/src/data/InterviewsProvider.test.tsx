// Regression tests for the difference between "the dataset changed" and
// "the dataset mutated".
//
// Getting this wrong is invisible in a screenshot and obvious in use: keying
// the reset on the source object meant every demo click tore the shared list
// down to a skeleton and wiped the status-change history that drives the
// aria-live announcements. These tests watch the real DOM through a real
// interaction, because that is the only way the flash is observable.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';

const ANCHOR = Date.parse('2026-09-21T14:00:00Z');

function goTo(path: string): void {
  window.location.hash = `#/demo/${path}?t=${ANCHOR}`;
}

/** Records whether a node whose text matches ever enters the document. */
function watchFor(pattern: RegExp): { seen: () => boolean; stop: () => void } {
  let seen = false;
  const check = (node: Node) => {
    if (node.textContent && pattern.test(node.textContent)) seen = true;
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(check);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { seen: () => seen, stop: () => observer.disconnect() };
}

beforeEach(() => {
  // Demo mode makes no requests; a spy here keeps an accidental one loud.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('unexpected network call');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InterviewsProvider dataset identity', () => {
  it('does not flash the list back to a skeleton on a demo action', async () => {
    const user = userEvent.setup();
    goTo('entrevistas');
    render(<App />);

    await screen.findByRole('heading', { name: 'Entrevistas', level: 1 });
    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0));

    const skeleton = watchFor(/Carregando entrevistas/);
    await user.click(screen.getByRole('button', { name: /Avançar esteira/i }));
    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    });
    skeleton.stop();

    expect(skeleton.seen()).toBe(false);
  });

  it('refetches the shared list on a demo action instead of freezing', async () => {
    const user = userEvent.setup();
    goTo('entrevistas');
    render(<App />);

    // Anchored on the row's href, not on a candidate name: the only rows that
    // can advance are the ones still in a processing stage, and those have no
    // scorecard yet — so they have no name to match on (the name is produced
    // by the scoring step). Picking a named row instead would silently stop
    // exercising the revision signal, because named rows cannot advance.
    const row = () =>
      document.querySelector('a[href*="demo-fabio-simulado"]')?.closest('.row') ?? null;

    // The stage tiles read the same projection, so they prove the provider
    // refetched; the row proves the memoised list item actually re-rendered
    // with it. Both matter: a broken memo would freeze the row alone.
    const tileCount = (label: string) =>
      screen
        .getByText(label, { selector: '.tile__label' })
        .closest('.tile')
        ?.querySelector('.tile__count')?.textContent;

    await waitFor(() => {
      expect(row()).toHaveTextContent('Recebida');
      expect(tileCount('Recebida')).toBe('1');
    });

    // One step carries the single `recebida` interview into `transcrevendo`.
    await user.click(screen.getByRole('button', { name: /Avançar esteira/i }));

    await waitFor(() => {
      expect(row()).toHaveTextContent('Transcrevendo');
      expect(tileCount('Recebida')).toBe('0');
    });
  });

  it('announces a status change produced by advancing the pipeline', async () => {
    const user = userEvent.setup();
    goTo('entrevistas');
    render(<App />);

    await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: /Avançar esteira/i }));

    // The polite live region must carry the transition. Clearing the status
    // history on every action silently disabled this.
    await waitFor(() => {
      const live = document.querySelector('[role="status"][aria-live="polite"]');
      expect(live?.textContent ?? '').toMatch(/Status atualizado|mudaram de status/);
    });
  });

  it('reloads and restores the seeded scenario when the demo is reset', async () => {
    const user = userEvent.setup();
    goTo('entrevistas/demo-fabio-simulado');
    render(<App />);

    // Seeded at `recebida`.
    await screen.findByText('Recebida');
    await user.click(screen.getByRole('button', { name: /Avançar esteira/i }));
    await waitFor(() => expect(screen.getByText('Transcrevendo')).toBeInTheDocument());

    // Reset replaces the scenario, so the list must actually go back — this
    // is the path that silently did nothing when reset reused the same
    // dataset identity and a revision watermark of zero.
    await user.click(screen.getByRole('button', { name: /Reiniciar demonstração/i }));

    await waitFor(() => {
      expect(screen.getByText('Recebida')).toBeInTheDocument();
    });
    expect(screen.queryByText('Transcrevendo')).not.toBeInTheDocument();
  });

  it('resets the step counter along with the scenario', async () => {
    const user = userEvent.setup();
    goTo('esteira');
    render(<App />);

    await screen.findByRole('heading', { name: 'Esteira', level: 1 });
    await user.click(screen.getByRole('button', { name: /Avançar esteira/i }));
    // Scoped to the toolbar: the dashboard is full of standalone counters.
    await waitFor(() => {
      expect(document.querySelector('.demo-toolbar__step')?.textContent).toContain('1');
    });

    await user.click(screen.getByRole('button', { name: /Reiniciar demonstração/i }));
    await waitFor(() => {
      const step = document.querySelector('.demo-toolbar__step');
      expect(step?.textContent).toContain('0');
    });
  });
});
