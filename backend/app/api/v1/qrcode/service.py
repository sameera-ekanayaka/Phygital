"""Verification code generation and token verification service.

Generates HMAC-signed tokens that map to cash-flow JSON in Redis, and
human-readable verification codes (e.g. PHYG-A3F8-K9M2) that bank officers
can type in instead of scanning a QR code.
"""

import json
import logging
import secrets
from datetime import datetime, timezone

from app.config import get_settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Redis key prefix for token → cash-flow data mapping.
_REDIS_PREFIX = "phygital:qr:"

# Verification-code alphabet (ambiguous characters removed: 0/O, I/1/L).
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_PREFIX = "PHYG"
_VCODE_PREFIX = "phygital:vcode:"


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
    logger.info("Stored token in Redis (ttl=%ds): %s…", ttl_seconds, token[:16])


def generate_verification_code() -> str:
    """Generate a human-readable verification code like PHYG-A3F8-K9M2."""
    part1 = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    part2 = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))
    return f"{_CODE_PREFIX}-{part1}-{part2}"


def store_code_mapping(code: str, token: str, ttl_seconds: int) -> None:
    """Store a verification-code → HMAC-token mapping in Redis."""
    r = get_redis()
    r.setex(f"{_VCODE_PREFIX}{code}", ttl_seconds, token)


def resolve_code(code: str) -> str | None:
    """Resolve a verification code to its HMAC token (or None if expired)."""
    r = get_redis()
    return r.get(f"{_VCODE_PREFIX}{code}")


def generate_verification(
    cash_flow_id: str,
    expiry_minutes: int,
    cash_flow_data: dict | None = None,
) -> dict:
    """Create a signed token, a verification code, and store both in Redis.

    Args:
        cash_flow_id: UUID identifying the cash-flow record.
        expiry_minutes: How long the token / code remains valid.
        cash_flow_data: Optional JSON to store alongside the token in Redis.

    Returns:
        A dict matching ``VerificationGenerateResponse`` fields.
    """
    from app.core.security import create_signed_token

    token, expires_at_unix = create_signed_token(cash_flow_id, expiry_minutes)
    ttl_seconds = expiry_minutes * 60

    _store_cash_flow_in_redis(token, cash_flow_id, cash_flow_data, ttl_seconds)

    # Generate a verification code with SETNX-style collision retry (max 3).
    r = get_redis()
    code: str | None = None
    for attempt in range(3):
        candidate = generate_verification_code()
        vcode_key = f"{_VCODE_PREFIX}{candidate}"
        # set(nx=True) returns True only if the key did not already exist.
        if r.set(vcode_key, token, ex=ttl_seconds, nx=True):
            code = candidate
            break
        logger.warning(
            "Verification code collision (attempt %d/3): %s", attempt + 1, candidate
        )

    if code is None:
        # Extremely unlikely — fall back to a guaranteed-unique code.
        code = generate_verification_code()
        store_code_mapping(code, token, ttl_seconds)

    expires_at = datetime.fromtimestamp(expires_at_unix, tz=timezone.utc)

    return {
        "verification_code": code,
        "token": token,
        "expires_at": expires_at,
    }


def verify_token(token: str) -> dict | None:
    """Look up *token* in Redis and return the stored cash-flow data.

    Args:
        token: The HMAC-signed token from the verification URL.

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
