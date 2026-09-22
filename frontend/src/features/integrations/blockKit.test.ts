import { describe, expect, it } from 'vitest';

import type { Scorecard } from '../../api/types';
import { syntheticScorecard } from '../../test/fixtures';
import {
  TOKEN_PLACEHOLDER,
  buildSlackPayload,
  buildWebhookPayload,
  decisionUrl,
  statusMarker,
} from './blockKit';

// These tests pin the correspondence with app/notifications.py::SlackNotification.
// If the Python changes, this file must fail — a preview that silently drifts
// from the message actually sent is worse than no preview.

const API_BASE = 'https://api.exemplo.test';
const INTERVIEW_ID = '00000000-0000-0000-0000-00000000000a';

/** Two competencies: one verified, one flagged as hallucinated. */
const twoCompetencies: Scorecard = {
  ...syntheticScorecard,
  evaluations: syntheticScorecard.evaluations.slice(0, 2),
};

function build(overrides: { scorecard?: Scorecard; hasApprovalToken?: boolean } = {}) {
  return buildSlackPayload({
    interviewId: INTERVIEW_ID,
    scorecard: overrides.scorecard ?? twoCompetencies,
    apiBaseUrl: API_BASE,
    hasApprovalToken: overrides.hasApprovalToken ?? true,
  });
}

describe('statusMarker', () => {
  it('uses the exact marker the backend emits for each verification state', () => {
    expect(statusMarker(true)).toBe('🟢 [OK]');
    expect(statusMarker(false)).toBe('🔴 [ALERTA: Alucinação detectada]');
    // `null` is an absence of a check, never the alert.
    expect(statusMarker(null)).toBe('⚪ [Não verificado]');
  });
});

describe('buildSlackPayload', () => {
  it('emits the block sequence in the order the backend builds it', () => {
    const { blocks } = build();
    expect(blocks.map((block) => block.type)).toEqual([
      'header',
      'section',
      'divider',
      'section',
      'divider',
      'section',
      'divider',
      'actions',
    ]);
  });

  it('uses a plain_text header naming the candidate', () => {
    const [header] = build().blocks;
    expect(header).toEqual({
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Avaliação de Entrevista: Candidata Exemplo',
        emoji: true,
      },
    });
  });

  it('puts exactly the id and the recommendation in the fields block', () => {
    const fieldsBlock = build().blocks[1];
    expect(fieldsBlock).toEqual({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*ID da Entrevista:*\n${INTERVIEW_ID}` },
        { type: 'mrkdwn', text: '*Recomendação Geral:*\nPróxima Etapa' },
      ],
    });
  });

  it('writes each competency section with its five labelled lines, in order', () => {
    const section = build().blocks[3];
    const text = 'text' in section ? section.text.text : '';

    expect(text.split('\n')).toEqual([
      '*Competência:* Comunicação',
      '*Nota:* 4/5',
      '*Justificativa:* Explicou o raciocínio de forma clara (dado sintético).',
      '*Evidência:* "eu costumo desenhar o fluxo antes de escrever qualquer código"',
      '*Status:* 🟢 [OK]',
    ]);
  });

  it('carries the hallucination marker on the flagged competency', () => {
    const section = build().blocks[5];
    const text = 'text' in section ? section.text.text : '';
    expect(text).toContain('*Competência:* Design de Sistemas');
    expect(text).toContain('*Nota:* 2/5');
    expect(text).toContain('*Status:* 🔴 [ALERTA: Alucinação detectada]');
  });

  it('uses the unchecked marker for a null verification', () => {
    const { blocks } = build({ scorecard: syntheticScorecard });
    const section = blocks[7];
    const text = 'text' in section ? section.text.text : '';
    expect(text).toContain('*Competência:* Trabalho em Equipe');
    expect(text).toContain('*Status:* ⚪ [Não verificado]');
  });

  it('omits the actions block entirely when there is no approval token', () => {
    // The backend logs a warning and sends the message without buttons; a
    // preview showing dead buttons would misrepresent what Slack receives.
    const { blocks } = build({ hasApprovalToken: false });

    expect(blocks.some((block) => block.type === 'actions')).toBe(false);
    expect(blocks[blocks.length - 1]).toEqual({ type: 'divider' });
    expect(blocks.map((block) => block.type)).toEqual([
      'header',
      'section',
      'divider',
      'section',
      'divider',
      'section',
      'divider',
    ]);
  });

  it('builds approve and reject buttons pointing at the decision endpoint', () => {
    const actions = build().blocks[7];
    expect(actions.type).toBe('actions');
    const elements = 'elements' in actions ? actions.elements : [];

    expect(elements.map((element) => element.action_id)).toEqual([
      'approve_interview',
      'reject_interview',
    ]);
    expect(elements.map((element) => element.style)).toEqual(['primary', 'danger']);
    expect(elements.map((element) => element.value)).toEqual(['approve', 'reject']);
    expect(elements[0].url).toBe(decisionUrl(API_BASE, INTERVIEW_ID, 'approve'));
    expect(elements[1].url).toContain('action=reject');
  });

  it('produces header, fields and divider even for a scorecard with no competencies', () => {
    const { blocks } = build({
      scorecard: { ...syntheticScorecard, evaluations: [] },
      hasApprovalToken: false,
    });
    expect(blocks.map((block) => block.type)).toEqual(['header', 'section', 'divider']);
  });
});

describe('decisionUrl', () => {
  it('always carries the placeholder and never anything resembling a real token', () => {
    // `serialize_interview` excludes `approval_token` from every response, so a
    // browser physically cannot obtain one. This asserts the preview cannot
    // start leaking one by accident.
    for (const action of ['approve', 'reject'] as const) {
      const url = decisionUrl(API_BASE, INTERVIEW_ID, action);
      expect(url).toContain(TOKEN_PLACEHOLDER);
      expect(url).not.toMatch(/token=[A-Za-z0-9_-]{20,}/);
    }
  });

  it('builds the endpoint path with the action query parameter', () => {
    expect(decisionUrl(API_BASE, INTERVIEW_ID, 'approve')).toBe(
      `${API_BASE}/interviews/${INTERVIEW_ID}/decision?action=approve&token=${TOKEN_PLACEHOLDER}`,
    );
  });

  it('strips trailing slashes from the base URL', () => {
    expect(decisionUrl('https://api.exemplo.test/', INTERVIEW_ID, 'reject')).toBe(
      decisionUrl('https://api.exemplo.test', INTERVIEW_ID, 'reject'),
    );
    expect(decisionUrl('https://api.exemplo.test///', INTERVIEW_ID, 'reject')).not.toContain(
      '//interviews',
    );
  });
});

describe('buildWebhookPayload', () => {
  it('includes the decision URLs only when there is an approval token', () => {
    const withToken = buildWebhookPayload({
      interviewId: INTERVIEW_ID,
      scorecard: twoCompetencies,
      apiBaseUrl: API_BASE,
      hasApprovalToken: true,
    });
    expect(withToken).toMatchObject({
      interview_id: INTERVIEW_ID,
      scorecard: twoCompetencies,
      approve_url: decisionUrl(API_BASE, INTERVIEW_ID, 'approve'),
      reject_url: decisionUrl(API_BASE, INTERVIEW_ID, 'reject'),
    });

    const withoutToken = buildWebhookPayload({
      interviewId: INTERVIEW_ID,
      scorecard: twoCompetencies,
      apiBaseUrl: API_BASE,
      hasApprovalToken: false,
    });
    expect(Object.keys(withoutToken)).toEqual(['interview_id', 'scorecard']);
  });
});
