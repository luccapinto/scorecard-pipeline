// The decision flow's failure path, which had no test.
//
// `InterviewDetailView` updates the status optimistically and rolls back when
// the API refuses. The rollback is the part that matters: the user has already
// seen the badge flip to "Aprovada". If the write did not land and we silently
// restore the old value, someone walks away believing a decision was recorded
// when it was not — on a screen whose entire purpose is deciding about a
// person. So the rollback must be visible, and it is asserted here.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BadRequestError } from '../../api/errors';
import type { Interview } from '../../api/types';
import { AnnouncerProvider } from '../../components/ui/Announcer';
import { InterviewsProvider } from '../../data/InterviewsProvider';
import type { DataSource } from '../../data/source';
import { DataSourceProvider } from '../../data/source';
import { makeStubSource } from '../../test/renderWithSource';
import { syntheticScorecard } from '../../test/fixtures';
import { InterviewDetailView } from './InterviewDetailView';

const AWAITING: Interview = {
  id: 'int-1',
  recording_url: '/srv/app/data/synthetic/interview_exemplo.wav',
  status: 'aguardando_aprovacao',
  job_id: 'python_pleno',
  external_id: null,
  transcription_raw: 'eu costumo desenhar o fluxo antes de escrever qualquer código',
  diarization_raw: null,
  scorecard: syntheticScorecard,
  error_log: null,
  retry_count: 0,
  created_at: '2026-07-21T12:00:00',
  updated_at: '2026-07-21T12:05:00',
};

function renderDetail(source: DataSource) {
  return render(
    <AnnouncerProvider>
      <DataSourceProvider value={source}>
        <InterviewsProvider activeIntervalMs={5000}>
          <InterviewDetailView id="int-1" />
        </InterviewsProvider>
      </DataSourceProvider>
    </AnnouncerProvider>,
  );
}

async function openConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Aprovar' }));
  return screen.getByRole('group', { name: /Confirmar decisão/i });
}

describe('decision flow', () => {
  it('reverts the optimistic status and says so when the API refuses', async () => {
    const user = userEvent.setup();
    // The real concurrency case: another reviewer decided it first.
    const detail = "Interview is not in 'aguardando_aprovacao' status. Current status: 'aprovada'";
    const source = makeStubSource({
      getInterview: vi.fn().mockResolvedValue(AWAITING),
      decide: vi.fn().mockRejectedValue(new BadRequestError(detail)),
    });

    renderDetail(source);
    const confirmation = await openConfirmation(user);
    await user.click(within(confirmation).getByRole('button', { name: /Confirmar aprovar/i }));

    // The rollback is announced, not silent.
    const notice = await screen.findByText(/status foi revertido/i);
    expect(notice).toHaveTextContent(detail);

    // The status is back to awaiting a decision — the optimistic flip is gone.
    await waitFor(() => {
      expect(screen.getByText('Aguardando aprovação')).toBeInTheDocument();
    });
    expect(screen.queryByText('Aprovada')).not.toBeInTheDocument();

    // The confirmation stays open on purpose, carrying the API's own reason,
    // so the reviewer can read why and back out deliberately instead of the
    // dialog vanishing under them. The alert sits just above the group.
    const confirmationAfter = screen.getByRole('group', { name: /Confirmar decisão/i });
    expect(within(confirmationAfter).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent ?? '');
    expect(alerts.some((text) => text.includes(detail))).toBe(true);
  });

  it('keeps the optimistic status when the API accepts', async () => {
    const user = userEvent.setup();
    const decided: Interview = { ...AWAITING, status: 'aprovada' };
    const getInterview = vi
      .fn()
      .mockResolvedValueOnce(AWAITING)
      .mockResolvedValue(decided);

    const source = makeStubSource({
      getInterview,
      decide: vi.fn().mockResolvedValue({
        interview_id: 'int-1',
        status: 'aprovada',
        updated_at: '2026-07-21T12:10:00',
      }),
    });

    renderDetail(source);
    const confirmation = await openConfirmation(user);
    await user.click(within(confirmation).getByRole('button', { name: /Confirmar aprovar/i }));

    await waitFor(() => {
      expect(screen.getByText('Aprovada')).toBeInTheDocument();
    });
    expect(screen.queryByText(/status foi revertido/i)).not.toBeInTheDocument();
    expect(source.decide).toHaveBeenCalledWith('int-1', 'approve');
  });

  it('warns about unverified evidence at the moment of confirming', async () => {
    const user = userEvent.setup();
    const source = makeStubSource({ getInterview: vi.fn().mockResolvedValue(AWAITING) });

    renderDetail(source);
    const confirmation = await openConfirmation(user);

    // The fixture has exactly one hallucinated citation; the confirmation must
    // repeat it rather than relying on the reviewer having scrolled.
    expect(confirmation).toHaveTextContent(/uma competência tem evidência não verificada/i);
    expect(confirmation).toHaveTextContent('Candidata Exemplo');
  });
});
