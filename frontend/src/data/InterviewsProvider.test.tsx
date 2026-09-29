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

/** Interviews in one column of the pipeline board, as the board prints it. */
function stageCount(stage: string): number {
  const text = document.querySelector(`.stage--${stage} .stage__count`)?.textContent ?? '';
  return Number.parseInt(text, 10);
}

async function openPipeline() {
  goTo('esteira');
  render(<App />);
  await screen.findByRole('heading', { name: 'Da gravação à decisão', level: 1 });
  await waitFor(() => expect(document.querySelectorAll('.bcard').length).toBeGreaterThan(0));
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
  it('does not flash the board back to a skeleton on a demo action', async () => {
    const user = userEvent.setup();
    await openPipeline();

    const skeleton = watchFor(/Carregando a esteira/);
    await user.click(screen.getByRole('button', { name: /Simular nova entrevista/i }));
    await waitFor(() => expect(document.querySelector('.bcard--fresh')).not.toBeNull());
    skeleton.stop();

    expect(skeleton.seen()).toBe(false);
  });

  it('refetches the shared list on a demo action instead of freezing', async () => {
    const user = userEvent.setup();
    await openPipeline();
    expect(stageCount('recebida')).toBe(1);

    // A new recording arrives: the first column must grow at once, which only
    // happens if the provider re-read the dataset after the local mutation.
    await user.click(screen.getByRole('button', { name: /Simular nova entrevista/i }));
    await waitFor(() => expect(stageCount('recebida')).toBe(2));
    expect(document.querySelector('.stage--recebida .bcard--fresh')).not.toBeNull();
  });

  it('announces a status change produced by the simulation', async () => {
    const user = userEvent.setup();
    await openPipeline();

    await user.click(screen.getByRole('button', { name: /Simular nova entrevista/i }));

    // The polite live region must carry the transition when the simulated
    // interview leaves `recebida`. Clearing the status history on every
    // action silently disabled this.
    await waitFor(
      () => {
        const live = document.querySelector('[role="status"][aria-live="polite"]');
        expect(live?.textContent ?? '').toMatch(/Status atualizado|mudaram de status/);
      },
      { timeout: 5000 },
    );
  });

  it('reloads and restores the seeded scenario when the demo is reset', async () => {
    const user = userEvent.setup();
    await openPipeline();

    await user.click(screen.getByRole('button', { name: /Simular nova entrevista/i }));
    await waitFor(() => expect(stageCount('recebida')).toBe(2));

    // Reset replaces the scenario, so the board must actually go back — this
    // is the path that silently did nothing when reset reused the same
    // dataset identity and a revision watermark of zero.
    await user.click(screen.getByRole('button', { name: /Opções de exibição/i }));
    await user.click(screen.getByRole('button', { name: /Reiniciar demonstração/i }));

    await waitFor(() => expect(stageCount('recebida')).toBe(1));
    expect(document.querySelector('.bcard--fresh')).toBeNull();
    expect(screen.getByRole('button', { name: /Simular nova entrevista/i })).toBeEnabled();
  });
});
