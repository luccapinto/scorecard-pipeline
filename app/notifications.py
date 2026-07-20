import abc
import logging
import uuid
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class BaseNotification(abc.ABC):
    @abc.abstractmethod
    def notify_scorecard(
        self,
        interview_id: uuid.UUID,
        scorecard: dict,
        approval_token: str | None = None,
    ) -> None:
        """
        Sends the scorecard notification.
        """
        pass


def build_decision_url(interview_id: uuid.UUID, action: str, approval_token: str) -> str:
    """
    Builds the one-time-token GET link used by notification buttons. The token
    is single-use and validated server-side, so the link cannot be forged or
    replayed.
    """
    return (
        f"{settings.api_base_url}/interviews/{interview_id}/decision"
        f"?action={action}&token={approval_token}"
    )


class SlackNotification(BaseNotification):
    def __init__(self, webhook_url: str | None = None):
        self.webhook_url = webhook_url or settings.slack_webhook_url

    def notify_scorecard(
        self,
        interview_id: uuid.UUID,
        scorecard: dict,
        approval_token: str | None = None,
    ) -> None:
        if not self.webhook_url:
            logger.info("Slack webhook URL not configured, skipping notification.")
            return

        candidate_name = scorecard.get("candidate_name", "Candidato")
        overall = scorecard.get("overall_recommendation", "N/A")
        evaluations = scorecard.get("evaluations", [])

        # Build interactive Slack Block Kit payload
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"Avaliação de Entrevista: {candidate_name}",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*ID da Entrevista:*\n{str(interview_id)}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Recomendação Geral:*\n{overall}"
                    }
                ]
            },
            {
                "type": "divider"
            }
        ]

        # Add evaluations
        for ev in evaluations:
            comp_name = ev.get("competency_name", "")
            score = ev.get("score", 0)
            justification = ev.get("justification", "")
            quote = ev.get("evidence_quote", "")
            verified = ev.get("evidence_verified", None)

            if verified is True:
                status_str = "🟢 [OK]"
            elif verified is False:
                status_str = "🔴 [ALERTA: Alucinação detectada]"
            else:
                status_str = "⚪ [Não verificado]"

            comp_text = (
                f"*Competência:* {comp_name}\n"
                f"*Nota:* {score}/5\n"
                f"*Justificativa:* {justification}\n"
                f"*Evidência:* \"{quote}\"\n"
                f"*Status:* {status_str}"
            )
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": comp_text
                }
            })
            blocks.append({"type": "divider"})

        # Action buttons. Slack `url` buttons open the link in a browser (GET),
        # so they must target the token-protected GET decision endpoint.
        if approval_token:
            blocks.append({
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Aprovar ✔️",
                            "emoji": True
                        },
                        "style": "primary",
                        "value": "approve",
                        "url": build_decision_url(interview_id, "approve", approval_token),
                        "action_id": "approve_interview"
                    },
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Rejeitar ❌",
                            "emoji": True
                        },
                        "style": "danger",
                        "value": "reject",
                        "url": build_decision_url(interview_id, "reject", approval_token),
                        "action_id": "reject_interview"
                    }
                ]
            })
        else:
            logger.warning(
                "No approval token available; sending Slack notification without action buttons."
            )

        payload = {"blocks": blocks}
        logger.info(f"Sending Slack notification for interview {interview_id}")
        response = httpx.post(self.webhook_url, json=payload, timeout=10)
        response.raise_for_status()


class WebhookNotification(BaseNotification):
    def __init__(self, webhook_url: str | None = None):
        self.webhook_url = webhook_url or settings.notification_webhook_url

    def notify_scorecard(
        self,
        interview_id: uuid.UUID,
        scorecard: dict,
        approval_token: str | None = None,
    ) -> None:
        if not self.webhook_url:
            logger.info("Webhook URL not configured, skipping notification.")
            return

        payload: dict[str, Any] = {
            "interview_id": str(interview_id),
            "scorecard": scorecard
        }
        if approval_token:
            payload["approve_url"] = build_decision_url(interview_id, "approve", approval_token)
            payload["reject_url"] = build_decision_url(interview_id, "reject", approval_token)
        logger.info(f"Sending generic webhook notification for interview {interview_id}")
        response = httpx.post(self.webhook_url, json=payload, timeout=10)
        response.raise_for_status()


class NotificationDispatcher:
    def __init__(self, channels: list[BaseNotification] | None = None):
        if channels is None:
            self.channels = []
            if settings.slack_webhook_url:
                self.channels.append(SlackNotification())
            if settings.notification_webhook_url:
                self.channels.append(WebhookNotification())
        else:
            self.channels = channels

    def dispatch(
        self,
        interview_id: uuid.UUID,
        scorecard: dict,
        approval_token: str | None = None,
    ) -> None:
        for channel in self.channels:
            try:
                channel.notify_scorecard(interview_id, scorecard, approval_token=approval_token)
            except Exception as e:
                logger.error(f"Failed to send notification via {channel.__class__.__name__}: {e}")
