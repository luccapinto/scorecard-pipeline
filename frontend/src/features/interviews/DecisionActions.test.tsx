import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { BadRequestError } from '../../api/errors';
import type { DecisionActionsProps } from './DecisionActions';
import { DecisionActions } from './DecisionActions';

function setup(props: Partial<DecisionActionsProps> = {}): { onDecide: Mock } {
  const onDecide = (props.onDecide ?? vi.fn().mockResolvedValue(undefined)) as Mock;
  render(
    <DecisionActions
      status={props.status ?? 'aguardando_aprovacao'}
      candidateName={props.candidateName ?? 'Candidata Exemplo'}
      flaggedCount={props.flaggedCount ?? 0}
      onDecide={onDecide}
    />,
  );
  return { onDecide };
}

describe('DecisionActions', () => {
  it('disables the decision outside aguardando_aprovacao', () => {
    setup({ status: 'pontuando' });
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.getByText(/só fica disponível/i)).toBeInTheDocument();
  });

  it('requires confirmation before deciding', async () => {
    const user = userEvent.setup();
    const { onDecide } = setup();

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: /Confirmar decisão/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Confirmar aprovar/i }));
    expect(onDecide).toHaveBeenCalledWith('approve');
  });

  it('names the candidate and the action in the confirmation', async () => {
    const user = userEvent.setup();
    setup({ candidateName: 'Bruno Exemplo' });
    await user.click(screen.getByRole('button', { name: 'Rejeitar' }));

    const confirmation = screen.getByRole('group', { name: /Confirmar decisão/i });
    expect(confirmation).toHaveTextContent('Bruno Exemplo');
    expect(confirmation).toHaveTextContent(/rejeitar/i);
  });

  it('repeats the evidence warning at the moment of deciding', async () => {
    const user = userEvent.setup();
    setup({ flaggedCount: 2 });
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(
      screen.getByText(/2 competências têm evidência não verificada/i),
    ).toBeInTheDocument();
  });

  it('can be cancelled without deciding', async () => {
    const user = userEvent.setup();
    const { onDecide } = setup();
    await user.click(screen.getByRole('button', { name: 'Rejeitar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
  });

  it('shows the API 400 detail when the decision is rejected by the backend', async () => {
    const user = userEvent.setup();
    const onDecide = vi
      .fn()
      .mockRejectedValue(
        new BadRequestError(
          "Interview is not in 'aguardando_aprovacao' status. Current status: 'aprovada'",
        ),
      );
    setup({ onDecide });

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(screen.getByRole('button', { name: /Confirmar aprovar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Current status: 'aprovada'/);
  });

  it('offers no bulk decision affordance', () => {
    setup();
    // The absence of a select-all / batch control is a product decision, not
    // an oversight: pin it so nobody "improves" the queue later.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /selecionad/i })).not.toBeInTheDocument();
  });
});
