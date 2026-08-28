"""Cryptographic helpers — HMAC-SHA256 token signing and verification.

Tokens produced here are URL-safe base64 strings that embed a cash-flow
identifier and an expiry timestamp.  They are intentionally *not* JWTs;
the payload is opaque to the client and only meaningful when looked up
against the Redis data store.
"""

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from app.config import get_settings


def _sign(payload_bytes: bytes, secret: str) -> str:
    """Return a URL-safe base64 HMAC-SHA256 signature for *payload_bytes*."""
    digest = hmac.new(
        key=secret.encode("utf-8"),
        msg=payload_bytes,
        digestmod=hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def create_signed_token(
    cash_flow_id: str,
    expiry_minutes: int,
    *,
    secret: str | None = None,
) -> tuple[str, float]:
    """Create an HMAC-signed token that binds *cash_flow_id* to an expiry.

    Args:
        cash_flow_id: UUID of the stored cash-flow statement.
        expiry_minutes: How many minutes from now until the token expires.
        secret: Override the application SECRET_KEY (useful in tests).

    Returns:
        A two-tuple of ``(token_string, expires_at_unix_timestamp)``.
    """
    secret = secret or get_settings().secret_key
    expires_at = time.time() + expiry_minutes * 60
    payload: dict[str, Any] = {
        "cfid": cash_flow_id,
        "exp": expires_at,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("ascii").rstrip("=")
    signature = _sign(payload_b64.encode("ascii"), secret)
    token = f"{payload_b64}.{signature}"
    return token, expires_at


def verify_token(token: str, *, secret: str | None = None) -> dict[str, Any] | None:
    """Verify *token* and return the decoded payload if valid.

    Returns ``None`` when the signature is invalid **or** the token has expired.
    """
    secret = secret or get_settings().secret_key
    try:
        payload_b64, signature = token.rsplit(".", maxsplit=1)
    except ValueError:
        return None

    expected_sig = _sign(payload_b64.encode("ascii"), secret)
    if not hmac.compare_digest(signature, expected_sig):
        return None

    # Pad base64 back to a multiple of 4 before decoding.
    padded = payload_b64 + "=" * (-len(payload_b64) % 4)
    payload_bytes = base64.urlsafe_b64decode(padded)
    payload: dict[str, Any] = json.loads(payload_bytes)

    if payload.get("exp", 0) < time.time():
        return None  # expired

    return payload
