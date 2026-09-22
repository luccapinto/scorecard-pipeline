import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BadRequestError } from '../../api/errors';
import { renderWithSource } from '../../test/renderWithSource';
import { FailurePanel, summarizeTraceback } from './FailurePanel';

// Shape of `traceback.format_exc()` as app/tasks.py::_record_failure stores it.
const TRACEBACK = `Traceback (most recent call last):
  File "/srv/app/app/tasks.py", line 138, in process_interview
    transcription = transcribe_audio(str(local_path))
  File "/srv/app/app/audio_processor.py", line 241, in transcribe
    response.raise_for_status()
httpx.HTTPStatusError: Server error '503 Service Unavailable' for url 'https://api.deepgram.com/v1/listen'`;

const MULTILINE = `Traceback (most recent call last):
  File "/srv/app/app/scoring.py", line 268, in evaluate
    raise ValueError(
ValueError: ScoringEngine failed to produce a valid scorecard after 3 attempts:
  evaluations.1.score
  Input should be less than or equal to 5`;

function renderPanel(
  options: { errorLog?: string | null; retryCount?: number; onReprocess?: () => Promise<void> } = {},
) {
  const onReprocess = options.onReprocess ?? vi.fn().mockResolvedValue(undefined);
  const view = renderWithSource(
    <FailurePanel
      errorLog={options.errorLog === undefined ? TRACEBACK : options.errorLog}
      retryCount={options.retryCount ?? 0}
      onReprocess={onReprocess}
    />,
  );
  return { ...view, onReprocess };
}

/**
 * The panel itself. The app shell mounts sr-only live regions that also carry
 * role="alert", so alert assertions have to be scoped to this section.
 */
function panel(): HTMLElement {
  return screen.getByRole('region', { name: /processamento falhou/i });
}

describe('summarizeTraceback', () => {
  it('leads with the exception line and keeps the frames separate', () => {
    const { headline, frames } = summarizeTraceback(TRACEBACK);

    expect(headline.startsWith('httpx.HTTPStatusError:')).toBe(true);
    expect(headline).toContain('503 Service Unavailable');

    expect(frames).toContain('File "/srv/app/app/tasks.py", line 138, in process_interview');
    expect(frames).toContain('File "/srv/app/app/audio_processor.py", line 241, in transcribe');
    // The headline must not be repeated inside the folded-away block.
    expect(frames).not.toContain('httpx.HTTPStatusError');
  });

  it('keeps every indented continuation line of a multi-line exception message', () => {
    const { headline, frames } = summarizeTraceback(MULTILINE);

    expect(headline.startsWith('ValueError: ScoringEngine failed')).toBe(true);
    expect(headline).toContain('evaluations.1.score');
    expect(headline).toContain('Input should be less than or equal to 5');
    // The `raise ValueError(` source line is a frame; the message is not.
    expect(frames).not.toContain('ValueError: ScoringEngine');
    expect(frames).not.toContain('evaluations.1.score');
    expect(frames).toContain('File "/srv/app/app/scoring.py"');
  });

  it('falls back to the whole log when there is nothing to split', () => {
    const { headline, frames } = summarizeTraceback('RuntimeError: sem stack');
    expect(headline).toBe('RuntimeError: sem stack');
    expect(frames).toBe('');
  });

  it('ignores trailing blank lines when finding the exception', () => {
    expect(summarizeTraceback(`${TRACEBACK}\n\n`).headline.startsWith('httpx.')).toBe(true);
  });

  it('keeps a Pydantic ValidationError whole, despite unindented continuations', () => {
    // Regression: a bad scoring response raises ValidationError, whose field
    // errors sit at column zero. Splitting on "last unindented line" used to
    // cut the message in half and show `evaluations.3.evidence_quote` as the
    // exception — burying the actual cause. This is the real shape produced
    // by app/scoring.py's retry exhaustion.
    const log = [
      'Traceback (most recent call last):',
      '  File "/srv/app/app/tasks.py", line 161, in process_interview',
      '    scorecard = score_interview(transcription, diarization, interview.job_id)',
      '  File "/srv/app/app/scoring.py", line 268, in evaluate',
      '    raise ValueError(',
      'ValueError: ScoringEngine failed to produce a valid scorecard after 3 attempts: '
        + '2 validation errors for ScorecardOutput',
      'evaluations.1.score',
      '  Input should be less than or equal to 5 [type=less_than_equal, input_value=7]',
      'evaluations.3.evidence_quote',
      '  Field required [type=missing, input_type=dict]',
    ].join('\n');

    const { headline, frames } = summarizeTraceback(log);

    expect(headline.startsWith('ValueError: ScoringEngine failed')).toBe(true);
    expect(headline).toContain('evaluations.1.score');
    expect(headline).toContain('evaluations.3.evidence_quote');
    expect(frames).toContain('File "/srv/app/app/scoring.py"');
    // `raise ValueError(` is the last frame's source echo and belongs to the
    // frames; what must not leak there is the exception MESSAGE.
    expect(frames).not.toContain('ScoringEngine failed');
  });
});

describe('FailurePanel', () => {
  it('shows the exception up front and folds the frames away until asked', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByText(/httpx\.HTTPStatusError/)).toBeInTheDocument();
    expect(screen.queryByText(/audio_processor\.py/)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Ver traceback completo/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(screen.getByText(/audio_processor\.py/)).toBeInTheDocument();
    const collapse = screen.getByRole('button', { name: /Ocultar traceback completo/i });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');

    await user.click(collapse);
    expect(screen.queryByText(/audio_processor\.py/)).not.toBeInTheDocument();
  });

  it('says there is nothing recorded when the error log is absent', () => {
    renderPanel({ errorLog: null });
    expect(screen.getByText('Sem detalhes de erro registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /traceback/i })).not.toBeInTheDocument();
  });

  it.each([
    [0, /Ainda não houve tentativa de reprocessamento\./],
    [1, /Já houve 1 tentativa de reprocessamento\./],
    [2, /Já houve 2 tentativas de reprocessamento\./],
    [5, /Já houve 5 tentativas de reprocessamento\./],
  ])('states the retry history for %i retries', (retryCount, expected) => {
    renderPanel({ retryCount });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('reprocesses on demand', async () => {
    const user = userEvent.setup();
    const { onReprocess } = renderPanel();

    await user.click(screen.getByRole('button', { name: /Reprocessar/i }));

    expect(onReprocess).toHaveBeenCalledTimes(1);
    expect(within(panel()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces a rejected reprocess as an alert and re-enables the button', async () => {
    const user = userEvent.setup();
    const onReprocess = vi
      .fn()
      .mockRejectedValue(new BadRequestError('Só é possível reprocessar entrevistas com falha.'));
    renderPanel({ onReprocess });

    await user.click(screen.getByRole('button', { name: /Reprocessar/i }));

    expect(await within(panel()).findByRole('alert')).toHaveTextContent(
      'Só é possível reprocessar entrevistas com falha.',
    );

    const button = screen.getByRole('button', { name: /Reprocessar/i });
    expect(button).toBeEnabled();

    // A retry after the failure must actually reach the handler again.
    await user.click(button);
    expect(onReprocess).toHaveBeenCalledTimes(2);
  });

  it('renders the traceback as text, never as markup', async () => {
    // `error_log` is built from provider responses and audio paths — untrusted
    // input that must never reach the DOM as HTML.
    const user = userEvent.setup();
    const hostile = `Traceback (most recent call last):
  File "<img src=x onerror="alert(1)">", line 1, in <module>
RuntimeError: <img src=x onerror="alert(1)">`;
    const { container } = renderPanel({ errorLog: hostile });

    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByText(/RuntimeError: <img src=x onerror="alert\(1\)">/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ver traceback completo/i }));

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/File "<img src=x onerror="alert\(1\)">"/)).toBeInTheDocument();
  });
});
