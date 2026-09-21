// Golden test: the client's Block Kit payload must match the one the BACKEND
// actually sends, byte for byte.
//
// The rest of the Block Kit tests pin this module against a careful *reading*
// of `app/notifications.py`. A reading can be wrong, and it silently rots the
// moment someone edits the Python. So the fixture next to this file is not
// hand-written: it is the real output of
// `SlackNotification.notify_scorecard`, captured by running it with httpx
// patched out:
//
//   .venv/bin/python -c '
//     from unittest.mock import patch
//     from app.notifications import SlackNotification
//     ... patch app.notifications.httpx.post, capture the json= argument ...'
//
// Regenerate it the same way if the payload legitimately changes. If this test
// fails, the preview screen is lying about what the backend sends, and the
// Python is right.

import { describe, expect, it } from 'vitest';

import type { Scorecard } from '../../api/types';
import { buildSlackPayload, TOKEN_PLACEHOLDER } from './blockKit';
import pythonPayload from './__fixtures__/slack-payload.python.json';

/** Exactly the scorecard that produced the fixture. */
const SCORECARD: Scorecard = {
  candidate_name: 'Ana Sintetica',
  overall_recommendation: 'Aprovado',
  evaluations: [
    {
      competency_name: 'Comunicacao',
      score: 4,
      justification: 'Explicou com clareza.',
      evidence_quote: 'eu desenho o fluxo antes',
      evidence_verified: true,
    },
    {
      competency_name: 'Infra',
      score: 2,
      justification: 'Sem lastro.',
      evidence_quote: 'reescrevi o kernel',
      evidence_verified: false,
    },
    {
      competency_name: 'APIs',
      score: 3,
      justification: 'Nao conferida.',
      evidence_quote: 'reviso PRs',
      evidence_verified: null,
    },
  ],
};

const INTERVIEW_ID = '00000000-0000-0000-0000-00000000000a';
const API_BASE = 'https://api.exemplo.test';
/** The token the Python run was given. The client can never hold one. */
const PYTHON_TOKEN = 'TOKENREAL';

/**
 * Normalises away the ONE difference that is correct by design: the backend
 * interpolates a real single-use token, the client interpolates a placeholder
 * because `serialize_interview` never returns the token to any client.
 */
function withoutToken(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value)
      .replaceAll(PYTHON_TOKEN, '<TOKEN>')
      .replaceAll(encodeURIComponent(TOKEN_PLACEHOLDER), '<TOKEN>')
      .replaceAll(TOKEN_PLACEHOLDER, '<TOKEN>'),
  );
}

describe('Slack payload parity with app/notifications.py', () => {
  it('matches the real backend output exactly, apart from the token', () => {
    const client = buildSlackPayload({
      interviewId: INTERVIEW_ID,
      scorecard: SCORECARD,
      apiBaseUrl: API_BASE,
      hasApprovalToken: true,
    });

    expect(withoutToken(client)).toEqual(withoutToken(pythonPayload));
  });

  it('guards the fixture itself against becoming trivial', () => {
    // If the fixture were ever emptied or truncated, the parity assertion
    // above could pass vacuously. The JSON import is typed by
    // resolveJsonModule, so this reads the real inferred shape.
    const blocks = pythonPayload.blocks;
    expect(blocks.map((block) => block.type)).toEqual([
      'header',
      'section',
      'divider',
      'section',
      'divider',
      'section',
      'divider',
      'section',
      'divider',
      'actions',
    ]);
    expect(JSON.stringify(pythonPayload)).toContain('🔴 [ALERTA: Alucinação detectada]');
    expect(JSON.stringify(pythonPayload)).toContain('⚪ [Não verificado]');
  });

  it('never carries a real token out of the client builder', () => {
    const client = JSON.stringify(
      buildSlackPayload({
        interviewId: INTERVIEW_ID,
        scorecard: SCORECARD,
        apiBaseUrl: API_BASE,
        hasApprovalToken: true,
      }),
    );
    expect(client).not.toContain(PYTHON_TOKEN);
    expect(client).not.toMatch(/token=[A-Za-z0-9_-]{20,}/);
  });
});
