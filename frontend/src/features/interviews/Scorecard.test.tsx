import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Scorecard as ScorecardData } from '../../api/types';
import type { CompetencyReference } from '../../data/source';
import { syntheticScorecard } from '../../test/fixtures';
import { makeStubSource, renderWithSource } from '../../test/renderWithSource';
import { Scorecard } from './Scorecard';

// Contains the verified quote verbatim and nothing resembling the fabricated
// one, so verification is exercised for real rather than mocked.
const TRANSCRIPT =
  'Entrevistadora: como você começa? Candidata: eu costumo desenhar o fluxo antes de ' +
  'escrever qualquer código, e gosto de revisar PRs dos colegas antes do merge.';

function renderScorecard(
  scorecard: ScorecardData = syntheticScorecard,
  options: { transcript?: string | null; onLocate?: () => void } = {},
) {
  const onLocate = options.onLocate ?? vi.fn();
  const view = renderWithSource(
    <Scorecard
      scorecard={scorecard}
      jobId="python_pleno"
      transcript={options.transcript === undefined ? TRANSCRIPT : options.transcript}
      onLocateQuote={onLocate}
    />,
  );
  return { ...view, onLocate };
}

describe('Scorecard', () => {
  it('renders candidate, recommendation and every competency', () => {
    renderScorecard();
    expect(screen.getByText('Candidata Exemplo')).toBeInTheDocument();
    expect(screen.getByText(/Próxima Etapa/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comunicação' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Design de Sistemas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trabalho em Equipe' })).toBeInTheDocument();
  });

  it('renders a LOUD alert for evidence_verified === false', () => {
    renderScorecard();
    const alerts = screen.getAllByRole('alert');
    const unverified = alerts.find((el) => /possível alucinação/i.test(el.textContent ?? ''));
    expect(unverified).toBeDefined();
    expect(unverified).toHaveTextContent(/NÃO verificada/i);

    const flaggedHeading = screen.getByRole('heading', { name: 'Design de Sistemas' });
    expect(flaggedHeading.closest('.competency')).toHaveClass('competency--flagged');
  });

  it('surfaces a top-level warning counting the unverified competencies', () => {
    renderScorecard();
    const banner = screen
      .getAllByRole('alert')
      .find((el) => /competência tem evidência não verificada/i.test(el.textContent ?? ''));
    expect(banner).toBeDefined();
  });

  it('treats null (unchecked) differently from false', () => {
    renderScorecard();
    const card = screen
      .getByRole('heading', { name: 'Trabalho em Equipe' })
      .closest('.competency') as HTMLElement;
    expect(card).not.toHaveClass('competency--flagged');
    expect(card.querySelector('.evidence--unchecked')).not.toBeNull();
    expect(card.querySelector('.evidence--alert')).toBeNull();
    // The neutral state must not be worded as a failure.
    expect(within(card).getByText(/ausência de uma checagem/i)).toBeInTheDocument();
  });

  it('renders verified evidence without an alert', () => {
    renderScorecard();
    const card = screen
      .getByRole('heading', { name: 'Comunicação' })
      .closest('.competency') as HTMLElement;
    expect(within(card).getByText(/Evidência verificada/i)).toBeInTheDocument();
    expect(card.querySelector('.evidence--alert')).toBeNull();
  });

  it('links a verified quote to its position in the transcript', async () => {
    const user = userEvent.setup();
    const { onLocate } = renderScorecard();
    const card = screen
      .getByRole('heading', { name: 'Comunicação' })
      .closest('.competency') as HTMLElement;

    await user.click(within(card).getByRole('button', { name: /Ver na transcrição/i }));
    expect(onLocate).toHaveBeenCalledWith(
      'eu costumo desenhar o fluxo antes de escrever qualquer código',
    );
  });

  it('shows the nearest passage behind a flagged quote, as the substance of the alarm', () => {
    renderScorecard();
    const card = screen
      .getByRole('heading', { name: 'Design de Sistemas' })
      .closest('.competency') as HTMLElement;
    expect(within(card).getByText(/Trecho mais parecido encontrado/i)).toBeInTheDocument();
  });

  it('does not offer to locate a quote when there is no transcript', () => {
    renderScorecard(syntheticScorecard, { transcript: null });
    expect(screen.queryByRole('button', { name: /Ver na transcrição/i })).not.toBeInTheDocument();
  });

  it('declares the BARS gap when the source cannot resolve anchors', () => {
    renderScorecard();
    // API mode: no endpoint serves competency_*.json, so the anchor text is
    // absent and the UI says why instead of inventing it.
    expect(screen.getAllByText(/não expõe o arquivo de competências/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Ver escala completa/i })).not.toBeInTheDocument();
  });

  it('shows the BARS anchor and full scale when the source provides them', async () => {
    const user = userEvent.setup();
    const reference: CompetencyReference = {
      name: 'Comunicação',
      description: 'Clareza ao explicar decisões técnicas.',
      levels: [
        { score: 1, text: 'Comunicação confusa.' },
        { score: 2, text: 'Comete erros constantes.' },
        { score: 3, text: 'Comunicação clara e fluida.' },
        { score: 4, text: 'Excelente habilidade de comunicação.' },
        { score: 5, text: 'Excepcional clareza.' },
      ],
    };
    const source = makeStubSource({
      capabilities: {
        barsLevels: true,
        deliveryHistory: false,
        auditTrail: false,
        funnelStages: false,
        simulateIngestion: true,
        steppableClock: false,
      },
      barsFor: (_jobId, name) => (name === 'Comunicação' ? reference : null),
    });

    renderWithSource(
      <Scorecard
        scorecard={syntheticScorecard}
        jobId="python_pleno"
        transcript={TRANSCRIPT}
        onLocateQuote={vi.fn()}
      />,
      source,
    );

    // Score 4 must show the level-4 anchor, not level 1 and not a number alone.
    expect(screen.getByText(/Excelente habilidade de comunicação/)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Ver escala completa/i })[0]);
    expect(screen.getByText('Comunicação confusa.')).toBeInTheDocument();
    expect(screen.getByText('Excepcional clareza.')).toBeInTheDocument();
  });

  it('does not crash on a malformed evaluations payload', () => {
    const broken = {
      candidate_name: 'Candidata Exemplo',
      overall_recommendation: 'Aprovado',
      evaluations: null,
    } as unknown as ScorecardData;
    renderScorecard(broken);
    expect(screen.getByText(/Nenhuma competência avaliada/i)).toBeInTheDocument();
  });
});
