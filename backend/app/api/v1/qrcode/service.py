"""QR code generation and verification service.

Generates HMAC-signed tokens that map to cash-flow JSON in Redis, and
renders them as QR code PNG images encoded in base64 for easy embedding
in dossiers or WhatsApp messages.
"""

import base64
import io
import json
import logging
from datetime import datetime, timezone

import qrcode

from app.config import get_settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Redis key prefix for QR token → cash-flow data mapping.
_REDIS_PREFIX = "phygital:qr:"


def _store_cash_flow_in_redis(
    token: str,
    cash_flow_id: str,
    cash_flow_data: dict | None,
    ttl_seconds: int,
) -> None:
    """Persist the token → cash-flow mapping in Redis with a TTL.

    Args:
        token: The HMAC-signed verification token.
        cash_flow_id: UUID of the cash-flow record.
        cash_flow_data: Optional JSON payload to store alongside the token.
        ttl_seconds: Time-to-live in seconds; Redis auto-expires the key.
    """
    store_payload: dict = {"cash_flow_id": cash_flow_id}
    if cash_flow_data:
        store_payload["cash_flow_data"] = cash_flow_data

    r = get_redis()
    r.setex(
        name=f"{_REDIS_PREFIX}{token}",
        time=ttl_seconds,
        value=json.dumps(store_payload),
    )
    logger.info("Stored QR token in Redis (ttl=%ds): %s…", ttl_seconds, token[:16])


def generate_qr_code_png(verify_url: str) -> str:
    """Render *verify_url* as a QR code and return a base64-encoded PNG string.

    Args:
        verify_url: The URL to encode inside the QR code.

    Returns:
        Base64-encoded PNG image data (no ``data:`` prefix).
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def generate_qr(
    cash_flow_id: str,
    expiry_minutes: int,
    cash_flow_data: dict | None = None,
) -> dict:
    """Create a signed QR token, store it in Redis, and render the QR image.

    Args:
        cash_flow_id: UUID identifying the cash-flow record.
        expiry_minutes: How long the token / QR code remains valid.
        cash_flow_data: Optional JSON to store alongside the token in Redis.

    Returns:
        A dict matching ``QrGenerateResponse`` fields.
    """
    from app.core.security import create_signed_token

    settings = get_settings()

    token, expires_at_unix = create_signed_token(cash_flow_id, expiry_minutes)
    verify_url = f"{settings.base_url}/verify/{token}"
    qr_base64 = generate_qr_code_png(verify_url)
    ttl_seconds = expiry_minutes * 60

    _store_cash_flow_in_redis(token, cash_flow_id, cash_flow_data, ttl_seconds)

    expires_at = datetime.fromtimestamp(expires_at_unix, tz=timezone.utc)

    return {
        "qr_code_base64": qr_base64,
        "token": token,
        "expires_at": expires_at,
        "verify_url": verify_url,
    }


def verify_token(token: str) -> dict | None:
    """Look up *token* in Redis and return the stored cash-flow data.

    Args:
        token: The HMAC-signed token from the QR verification URL.

    Returns:
        The stored dict if the token exists and has not expired, otherwise ``None``.
    """
    from app.core.security import verify_token as security_verify

    # First check the cryptographic signature and expiry.
    payload = security_verify(token)
    if payload is None:
        logger.warning("Token signature invalid or expired: %s…", token[:16])
        return None

    # Then look up in Redis (key may have been evicted early by TTL).
    r = get_redis()
    raw: str | None = r.get(f"{_REDIS_PREFIX}{token}")
    if raw is None:
        logger.warning("Token not found in Redis (already evicted): %s…", token[:16])
        return None

    data: dict = json.loads(raw)
    return data
