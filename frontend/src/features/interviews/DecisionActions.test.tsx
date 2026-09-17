import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BadRequestError } from '../../api/errors';
import { DecisionActions } from './DecisionActions';

describe('DecisionActions', () => {
  it('disables the decision outside aguardando_aprovacao', () => {
    const onDecide = vi.fn();
    render(<DecisionActions status="pontuando" onDecide={onDecide} />);
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.getByText(/só fica disponível/i)).toBeInTheDocument();
  });

  it('requires confirmation before deciding', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<DecisionActions status="aguardando_aprovacao" onDecide={onDecide} />);

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    // Not called yet — a confirmation step stands in the way.
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: /Confirmar decisão/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Confirmar aprovar/i }));
    expect(onDecide).toHaveBeenCalledWith('approve');
  });

  it('can be cancelled without deciding', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<DecisionActions status="aguardando_aprovacao" onDecide={onDecide} />);
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
    render(<DecisionActions status="aguardando_aprovacao" onDecide={onDecide} />);

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(screen.getByRole('button', { name: /Confirmar aprovar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Current status: 'aprovada'/);
  });
});
