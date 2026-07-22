import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Scorecard as ScorecardData } from '../../api/types';
import { syntheticScorecard } from '../../test/fixtures';
import { Scorecard } from './Scorecard';

describe('Scorecard', () => {
  it('renders candidate, recommendation and every competency', () => {
    render(<Scorecard scorecard={syntheticScorecard} />);
    expect(screen.getByText('Candidata Exemplo')).toBeInTheDocument();
    expect(screen.getByText('Próxima Etapa')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comunicação' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Design de Sistemas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trabalho em Equipe' })).toBeInTheDocument();
  });

  it('renders a LOUD alert for evidence_verified === false', () => {
    render(<Scorecard scorecard={syntheticScorecard} />);
    // The unverified competency raises an alert naming the hallucination risk.
    // Match on the risk phrasing so it can't collide with the summary banner.
    const alerts = screen.getAllByRole('alert');
    const unverified = alerts.find((el) => /possível alucinação/i.test(el.textContent ?? ''));
    expect(unverified).toBeDefined();
    expect(unverified).toHaveTextContent(/NÃO verificada/i);

    // And the flagged competency card is marked as such.
    const flaggedHeading = screen.getByRole('heading', { name: 'Design de Sistemas' });
    const card = flaggedHeading.closest('.competency');
    expect(card).toHaveClass('competency--flagged');
  });

  it('surfaces a top-level warning counting the unverified competencies', () => {
    render(<Scorecard scorecard={syntheticScorecard} />);
    const banner = screen
      .getAllByRole('alert')
      .find((el) => /evidência.*não verificada/i.test(el.textContent ?? ''));
    expect(banner).toBeDefined();
  });

  it('treats null (unchecked) differently from false', () => {
    render(<Scorecard scorecard={syntheticScorecard} />);
    const teamwork = screen.getByRole('heading', { name: 'Trabalho em Equipe' });
    const card = teamwork.closest('.competency') as HTMLElement;
    expect(card).not.toHaveClass('competency--flagged');
    // The neutral "unchecked" flag is present (distinct from the loud false one).
    expect(card.querySelector('.evidence-flag--unchecked')).not.toBeNull();
    expect(card.querySelector('.evidence-flag--unverified')).toBeNull();
  });

  it('renders verified evidence without an alert', () => {
    render(<Scorecard scorecard={syntheticScorecard} />);
    const comm = screen.getByRole('heading', { name: 'Comunicação' });
    const card = comm.closest('.competency') as HTMLElement;
    expect(within(card).getByText(/Evidência verificada/i)).toBeInTheDocument();
  });

  it('does not crash on a malformed evaluations payload', () => {
    const broken = {
      candidate_name: 'Candidata Exemplo',
      overall_recommendation: 'Aprovado',
      evaluations: null,
    } as unknown as ScorecardData;
    render(<Scorecard scorecard={broken} />);
    expect(screen.getByText(/Nenhuma competência avaliada/i)).toBeInTheDocument();
  });
});
