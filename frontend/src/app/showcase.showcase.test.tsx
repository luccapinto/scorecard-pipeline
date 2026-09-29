// The public showcase, tested as it is BUILT: this file runs only in the
// `showcase` Vitest project, which compiles the app with `__SHOWCASE__`
// replaced by `true` — the same constant `vite build --mode showcase` bakes in.
// So these assertions are about the code that ships to GitHub Pages, not
// about a runtime flag that imitates it.

import { render, screen, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import { SHOWCASE } from './edition';

const ANCHOR = Date.parse('2026-09-21T14:00:00Z');

let fetchSpy: Mock;

beforeEach(() => {
  fetchSpy = vi.fn(() => {
    throw new Error('The showcase attempted a fetch() call.');
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('showcase build', () => {
  it('is compiled with the showcase constant on', () => {
    // Guards the guard: without this, every test below could pass against
    // the full build by accident.
    expect(SHOWCASE).toBe(true);
  });

  it('opens the landing page at the bare URL', async () => {
    window.location.hash = '';
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: /O sistema confere cada citação/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Fazer o tour guiado/i }).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('turns an old API-mode link into its demonstration equivalent, not a CORS error', async () => {
    window.location.hash = `#/esteira?t=${ANCHOR}`;
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Da gravação à decisão', level: 1 }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('Bruno Exemplo')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/CORS/)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('has no mode switch, no API status and no settings anywhere in the chrome', async () => {
    window.location.hash = `#/demo/esteira?t=${ANCHOR}`;
    render(<App />);
    await screen.findAllByText('Bruno Exemplo');

    expect(screen.queryByRole('group', { name: /Fonte de dados/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/API no ar|API inacessível/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Configura/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^API$/ })).not.toBeInTheDocument();
    // What stays: the persistent synthetic-data mark and the tour.
    expect(screen.getByText('Dados fictícios')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tour/ })).toBeInTheDocument();
  });

  it('sends the settings screen to the landing page', async () => {
    window.location.hash = '#/configuracao';
    render(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: /O sistema confere cada citação/ }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/URL base/i)).not.toBeInTheDocument();
  });

  it('shows the observability screen without the API error taxonomy', async () => {
    window.location.hash = `#/saude?t=${ANCHOR}`;
    render(<App />);

    await screen.findByRole('heading', { name: 'Saúde e observabilidade', level: 1 });
    expect(screen.getByText(/Nenhuma requisição existe para mostrar/i)).toBeInTheDocument();
    expect(screen.queryByText(/Taxonomia de erros/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/modo API/i)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('explains a stale demo link instead of diagnosing a network failure', async () => {
    window.location.hash = `#/entrevistas/nao-existe?t=${ANCHOR}`;
    render(<App />);

    expect(await screen.findByRole('heading', { name: /não existe nesta demonstração/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: /Voltar para a esteira/i })).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
