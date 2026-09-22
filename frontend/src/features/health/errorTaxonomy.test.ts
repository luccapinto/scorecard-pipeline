import { afterEach, describe, expect, it } from 'vitest';

import {
  ApiError,
  ApiUnavailableError,
  AuthError,
  BadRequestError,
  NotFoundError,
} from '../../api/errors';
import { ERROR_KIND_REFERENCE, diagnose, diagnoseUnhealthy } from './errorTaxonomy';
import type { ErrorKind } from './errorTaxonomy';

const realLocation = window.location;

/** jsdom serves the suite from :3000, so the origin must be forced per case. */
function setOrigin(origin: string): void {
  Object.defineProperty(window, 'location', {
    value: { ...realLocation, origin },
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: realLocation,
    writable: true,
    configurable: true,
  });
});

describe('diagnose', () => {
  it('reports an unreachable API as offline when served from an allowed origin', () => {
    setOrigin('http://localhost:5173');
    const diagnosis = diagnose(new ApiUnavailableError(), { baseUrl: 'http://localhost:8000' });

    expect(diagnosis.kind).toBe('offline');
    expect(diagnosis.explanation).toContain('http://localhost:8000');
    expect(diagnosis.explanation).toContain('não estar no ar');
  });

  it('treats 127.0.0.1:5173 as an allowed origin too', () => {
    setOrigin('http://127.0.0.1:5173');
    expect(diagnose(new ApiUnavailableError(), { baseUrl: 'http://localhost:8000' }).kind).toBe(
      'offline',
    );
  });

  it('blames CORS when the page origin is outside the backend allowlist', () => {
    setOrigin('http://localhost:4173');
    const diagnosis = diagnose(new ApiUnavailableError(), { baseUrl: 'http://localhost:8000' });

    expect(diagnosis.kind).toBe('cors');
    expect(diagnosis.explanation).toContain('app/main.py');
    expect(diagnosis.explanation).toContain('http://localhost:4173');
    expect(diagnosis.nextStep).toContain('5173');
  });

  it('falls back to offline without a baseUrl, since there is nothing to blame', () => {
    setOrigin('https://example.com');
    expect(diagnose(new ApiUnavailableError()).kind).toBe('offline');
  });

  it('classifies an auth failure without echoing the key', () => {
    setOrigin('http://localhost:5173');
    // Deliberately low-entropy and obviously not a credential: a fixture that
    // *looks* like a live key trips secret scanners and sets a bad example in
    // a repository whose CONTRIBUTING forbids pasting keys. What the test
    // needs is a distinctive string, not a realistic one.
    const fakeKey = 'CHAVE-FALSA-DE-TESTE-NAO-E-UM-SEGREDO';
    const diagnosis = diagnose(new AuthError(`chave ${fakeKey} recusada`, 403));

    expect(diagnosis.kind).toBe('auth');
    expect(diagnosis.explanation).toContain('X-API-Key');
    expect(diagnosis.nextStep).toContain('Configuração');
    for (const text of [diagnosis.title, diagnosis.explanation, diagnosis.nextStep]) {
      expect(text).not.toContain(fakeKey);
      expect(text).not.toContain('CHAVE-FALSA');
    }
  });

  it('classifies a 404', () => {
    const diagnosis = diagnose(new NotFoundError());
    expect(diagnosis.kind).toBe('not_found');
    expect(diagnosis.nextStep.length).toBeGreaterThan(0);
  });

  it('surfaces the API detail verbatim on a 400', () => {
    const detail = 'Entrevista não está aguardando aprovação (status: aprovada)';
    const diagnosis = diagnose(new BadRequestError(detail));

    expect(diagnosis.kind).toBe('invalid_state');
    expect(diagnosis.explanation).toContain(detail);
  });

  it('does not claim invalid_state for a non-400 BadRequestError', () => {
    expect(diagnose(new BadRequestError('conflito', 409)).kind).toBe('unknown');
  });

  it('falls back to unknown for a plain ApiError and for a non-error value', () => {
    expect(diagnose(new ApiError('quebrou', 500))).toMatchObject({
      kind: 'unknown',
      explanation: 'quebrou',
    });
    expect(diagnose('oops').kind).toBe('unknown');
    expect(diagnose('oops').explanation).toBe('Ocorreu um erro inesperado.');
  });
});

describe('diagnoseUnhealthy', () => {
  it('presents dependency names and marks the values as exception codes', () => {
    const diagnosis = diagnoseUnhealthy({ database: 'OperationalError' });

    expect(diagnosis.kind).toBe('unhealthy');
    expect(diagnosis.explanation).toContain('database');
    expect(diagnosis.explanation).toContain('nomes de exceção');
  });

  it('stays honest when the 503 body lists nothing', () => {
    expect(diagnoseUnhealthy({}).explanation).toContain('sem detalhar');
  });
});

describe('ERROR_KIND_REFERENCE', () => {
  it('documents every kind exactly once', () => {
    const kinds: ErrorKind[] = [
      'offline',
      'cors',
      'auth',
      'not_found',
      'invalid_state',
      'unhealthy',
      'unknown',
    ];
    expect(ERROR_KIND_REFERENCE.map((entry) => entry.kind).sort()).toEqual([...kinds].sort());
    expect(ERROR_KIND_REFERENCE.every((entry) => entry.title && entry.action)).toBe(true);
  });
});
