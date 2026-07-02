import hashlib
import hmac
import logging

from fastapi import Header, HTTPException, Request

from app.config import settings

logger = logging.getLogger(__name__)


async def require_api_key(x_api_key: str = Header(default="")) -> None:
    """
    Dependency enforcing the API key on read/action endpoints. When no key is
    configured the check is skipped (dev mode only — always set API_KEY in
    production).
    """
    if not settings.api_key:
        logger.warning("API_KEY is not configured; endpoint auth is disabled (dev mode only).")
        return
    if not hmac.compare_digest(x_api_key, settings.api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


async def verify_webhook_signature(request: Request) -> None:
    """
    Verifies the HMAC-SHA256 signature of the webhook body against the
    X-Webhook-Signature header. Skipped when no secret is configured
    (dev mode only — always set WEBHOOK_HMAC_SECRET in production).
    """
    if not settings.webhook_hmac_secret:
        logger.warning(
            "WEBHOOK_HMAC_SECRET is not configured; webhook signature "
            "verification is disabled (dev mode only)."
        )
        return
    signature = request.headers.get("X-Webhook-Signature", "")
    body = await request.body()
    expected = hmac.new(
        settings.webhook_hmac_secret.encode("utf-8"),
        body,
        hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
