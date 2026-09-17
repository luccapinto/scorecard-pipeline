import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '../../api/errors';
import { NewInterviewView } from './NewInterviewView';

// Mock only the network layer; the AuthError class comes from the real module.
const listJobs = vi.fn();
const listRecordings = vi.fn();
const createInterview = vi.fn();

vi.mock('../../api/client', () => ({
  listJobs: (...args: unknown[]) => listJobs(...args),
  listRecordings: (...args: unknown[]) => listRecordings(...args),
  createInterview: (...args: unknown[]) => createInterview(...args),
}));

const config = { baseUrl: 'http://localhost:8000', apiKey: '' };

function noop() {}

afterEach(() => {
  vi.clearAllMocks();
});

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText('Vaga'), 'python_pleno');
  await user.selectOptions(screen.getByLabelText('Gravação'), '/srv/exemplo.wav');
}

describe('NewInterviewView', () => {
  it('populates dropdowns and submits the webhook payload', async () => {
    const user = userEvent.setup();
    listJobs.mockResolvedValue([{ job_id: 'python_pleno', title: 'Dev Python Pleno' }]);
    listRecordings.mockResolvedValue([{ path: '/srv/exemplo.wav', filename: 'exemplo.wav' }]);
    createInterview.mockResolvedValue({
      interview_id: 'new-id',
      status: 'recebida',
      deduplicated: false,
    });

    render(
      <NewInterviewView config={config} onCreated={noop} onCancel={noop} onOpenConfig={noop} />,
    );

    await fillForm(user);
    await user.type(screen.getByLabelText(/ID externo/i), 'req-42');
    await user.click(screen.getByRole('button', { name: 'Criar entrevista' }));

    expect(createInterview).toHaveBeenCalledWith(config, {
      recording_url: '/srv/exemplo.wav',
      job_id: 'python_pleno',
      external_id: 'req-42',
    });
    expect(await screen.findByText(/Entrevista criada/i)).toBeInTheDocument();
    expect(screen.getByText('new-id')).toBeInTheDocument();
  });

  it('explains the HMAC protection when the webhook returns 401/403', async () => {
    const user = userEvent.setup();
    listJobs.mockResolvedValue([{ job_id: 'python_pleno', title: 'Dev Python Pleno' }]);
    listRecordings.mockResolvedValue([{ path: '/srv/exemplo.wav', filename: 'exemplo.wav' }]);
    createInterview.mockRejectedValue(new AuthError());

    render(
      <NewInterviewView config={config} onCreated={noop} onCancel={noop} onOpenConfig={noop} />,
    );

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar entrevista' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/HMAC/i);
    expect(alert).toHaveTextContent(/sistema de gravação/i);
  });

  it('sends external_id as null when left blank', async () => {
    const user = userEvent.setup();
    listJobs.mockResolvedValue([{ job_id: 'python_pleno', title: 'Dev Python Pleno' }]);
    listRecordings.mockResolvedValue([{ path: '/srv/exemplo.wav', filename: 'exemplo.wav' }]);
    createInterview.mockResolvedValue({ interview_id: 'x', status: 'recebida' });

    render(
      <NewInterviewView config={config} onCreated={noop} onCancel={noop} onOpenConfig={noop} />,
    );
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar entrevista' }));

    expect(createInterview).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ external_id: null }),
    );
  });
});
