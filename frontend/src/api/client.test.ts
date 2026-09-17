import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from './client';
import {
  createInterview,
  decideInterview,
  getHealth,
  listInterviews,
} from './client';
import { ApiUnavailableError, AuthError, BadRequestError, NotFoundError } from './errors';

const config: ApiConfig = { baseUrl: 'http://localhost:8000', apiKey: 'k' };

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }) {
  const { jsonBody, ...rest } = response;
  const res = {
    ok: rest.status ? rest.status >= 200 && rest.status < 300 : true,
    status: 200,
    ...rest,
    clone() {
      return this as unknown as Response;
    },
    json: async () => jsonBody,
  } as unknown as Response;
  return vi.fn().mockResolvedValue(res);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client error mapping', () => {
  it('maps 401 to AuthError with the backend detail', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ status: 401, jsonBody: { detail: 'API Key inválida' } }),
    );
    await expect(listInterviews(config)).rejects.toBeInstanceOf(AuthError);
    await expect(listInterviews(config)).rejects.toThrow('API Key inválida');
  });

  it('maps 403 to AuthError', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 403, jsonBody: { detail: 'proibido' } }));
    await expect(listInterviews(config)).rejects.toBeInstanceOf(AuthError);
  });

  it('maps 404 to NotFoundError', async () => {
    vi.stubGlobal('fetch', mockFetch({ status: 404, jsonBody: { detail: 'não encontrada' } }));
    await expect(listInterviews(config)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps 400 to BadRequestError carrying the detail (invalid decision status)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        status: 400,
        jsonBody: {
          detail:
            "Interview is not in 'aguardando_aprovacao' status. Current status: 'aprovada'",
        },
      }),
    );
    await expect(decideInterview(config, 'id', 'approve')).rejects.toBeInstanceOf(
      BadRequestError,
    );
    await expect(decideInterview(config, 'id', 'approve')).rejects.toThrow(
      /Current status: 'aprovada'/,
    );
  });

  it('maps a rejected fetch (transport failure) to ApiUnavailableError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(listInterviews(config)).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('sends the X-API-Key header when a key is set', async () => {
    const fetchMock = mockFetch({ status: 200, jsonBody: [] });
    vi.stubGlobal('fetch', fetchMock);
    await listInterviews(config);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('k');
  });

  it('POSTs the webhook payload for createInterview', async () => {
    const fetchMock = mockFetch({
      status: 202,
      jsonBody: { interview_id: 'abc', status: 'recebida', deduplicated: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await createInterview(config, { recording_url: '/x.wav', job_id: 'j' });
    expect(result.interview_id).toBe('abc');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/webhooks/recording');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ recording_url: '/x.wav', job_id: 'j' });
  });
});

describe('getHealth', () => {
  it('returns the 503 unhealthy body instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ status: 503, jsonBody: { status: 'unhealthy', problems: { redis: 'X' } } }),
    );
    const health = await getHealth(config);
    expect(health.status).toBe('unhealthy');
  });
});
