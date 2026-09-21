// Faithful reconstruction of the Slack payload the backend actually sends.
//
// Source of truth: `app/notifications.py::SlackNotification.notify_scorecard`.
// Every structural detail below is copied from it, including the ones that are
// easy to miss and would make the preview a lie:
//
//  * a `divider` after the ID/recommendation fields block, AND another after
//    EVERY competency section;
//  * the exact status markers "🟢 [OK]" / "🔴 [ALERTA: Alucinação detectada]" /
//    "⚪ [Não verificado]", chosen by `is True` / `is False` / else — so `null`
//    lands on "não verificado", not on the alert;
//  * the `actions` block being OMITTED ENTIRELY when there is no approval
//    token (the backend logs a warning and sends the message without buttons).
//
// If this file and app/notifications.py ever disagree, the Python wins and
// this is the bug.

import type { Scorecard } from '../../api/types';

export interface TextObject {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

export interface ButtonElement {
  type: 'button';
  text: TextObject;
  style?: 'primary' | 'danger';
  value: string;
  url: string;
  action_id: string;
}

export type Block =
  | { type: 'header'; text: TextObject }
  | { type: 'section'; fields: TextObject[] }
  | { type: 'section'; text: TextObject }
  | { type: 'divider' }
  | { type: 'actions'; elements: ButtonElement[] };

export interface SlackPayload {
  blocks: Block[];
}

/** The three markers, and the exact predicate order the backend uses. */
export function statusMarker(verified: boolean | null): string {
  if (verified === true) return '🟢 [OK]';
  if (verified === false) return '🔴 [ALERTA: Alucinação detectada]';
  return '⚪ [Não verificado]';
}

/**
 * The decision URL shape. The token is a placeholder and always will be:
 * `serialize_interview` in app/main.py excludes `approval_token` from every
 * response, so a browser physically cannot obtain one. That is a property of
 * the API, not a redaction we apply.
 */
export const TOKEN_PLACEHOLDER = '«token-de-uso-único-nunca-exposto-pela-api»';

export function decisionUrl(
  apiBaseUrl: string,
  interviewId: string,
  action: 'approve' | 'reject',
): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  return `${base}/interviews/${interviewId}/decision?action=${action}&token=${TOKEN_PLACEHOLDER}`;
}

interface Options {
  interviewId: string;
  scorecard: Scorecard;
  apiBaseUrl: string;
  /**
   * Whether the interview has a live approval token. Drives the presence of
   * the actions block, exactly as the backend does.
   */
  hasApprovalToken: boolean;
}

export function buildSlackPayload({
  interviewId,
  scorecard,
  apiBaseUrl,
  hasApprovalToken,
}: Options): SlackPayload {
  const blocks: Block[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Avaliação de Entrevista: ${scorecard.candidate_name}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*ID da Entrevista:*\n${interviewId}` },
        { type: 'mrkdwn', text: `*Recomendação Geral:*\n${scorecard.overall_recommendation}` },
      ],
    },
    { type: 'divider' },
  ];

  for (const evaluation of scorecard.evaluations ?? []) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Competência:* ${evaluation.competency_name}\n` +
          `*Nota:* ${evaluation.score}/5\n` +
          `*Justificativa:* ${evaluation.justification}\n` +
          `*Evidência:* "${evaluation.evidence_quote}"\n` +
          `*Status:* ${statusMarker(evaluation.evidence_verified)}`,
      },
    });
    blocks.push({ type: 'divider' });
  }

  if (hasApprovalToken) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Aprovar ✔️', emoji: true },
          style: 'primary',
          value: 'approve',
          url: decisionUrl(apiBaseUrl, interviewId, 'approve'),
          action_id: 'approve_interview',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Rejeitar ❌', emoji: true },
          style: 'danger',
          value: 'reject',
          url: decisionUrl(apiBaseUrl, interviewId, 'reject'),
          action_id: 'reject_interview',
        },
      ],
    });
  }

  return { blocks };
}

/** The generic webhook body, from `WebhookNotification.notify_scorecard`. */
export function buildWebhookPayload({
  interviewId,
  scorecard,
  apiBaseUrl,
  hasApprovalToken,
}: Options): Record<string, unknown> {
  return {
    interview_id: interviewId,
    scorecard,
    ...(hasApprovalToken
      ? {
          approve_url: decisionUrl(apiBaseUrl, interviewId, 'approve'),
          reject_url: decisionUrl(apiBaseUrl, interviewId, 'reject'),
        }
      : {}),
  };
}
