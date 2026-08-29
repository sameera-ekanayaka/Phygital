"""Cryptographic helpers — HMAC-SHA256 token signing and verification.

Tokens produced here are URL-safe base64 strings that embed a cash-flow
identifier and an expiry timestamp.  They are intentionally *not* JWTs;
the payload is opaque to the client and only meaningful when looked up
against the Redis data store.

PDPA compliance helpers reference Sri Lanka Personal Data Protection Act
No. 9 of 2022 — Sections 12 (Data Minimization) and 14 (Right of Access
and Erasure).
"""

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any

from app.config import get_settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Redis key prefix and TTL for blacklisted (revoked) tokens.
_BLACKLIST_PREFIX = "blacklist:token:"
_BLACKLIST_TTL_SECONDS = 72 * 3600  # match the maximum QR token lifetime


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
    nic_hash: str | None = None,
) -> tuple[str, float]:
    """Create an HMAC-signed token that binds *cash_flow_id* to an expiry.

    When *nic_hash* is provided the token is registered in the NIC→token
    index (``nic_index:{nic_hash}:tokens``) so that consent revocation can
    locate and invalidate every active token for that data subject.

    Args:
        cash_flow_id: UUID of the stored cash-flow statement.
        expiry_minutes: How many minutes from now until the token expires.
        secret: Override the application SECRET_KEY (useful in tests).
        nic_hash: Optional NIC hash for NIC→token index registration.

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

    # Register token in NIC→token index for consent revocation lookups.
    if nic_hash is not None:
        try:
            client = get_redis()
            index_key = f"nic_index:{nic_hash}:tokens"
            client.sadd(index_key, token)
            client.expire(index_key, expiry_minutes * 60)
            logger.debug("Token registered in NIC index for nic_hash=%s", nic_hash[:12])
        except Exception:
            logger.exception("Failed to register token in NIC index for nic_hash=%s", nic_hash[:12])

    return token, expires_at


def verify_token(token: str, *, secret: str | None = None) -> dict[str, Any] | None:
    """Verify *token* and return the decoded payload if valid.

    Returns ``None`` when the signature is invalid, the token has expired,
    **or** the token has been blacklisted via consent revocation (PDPA
    No. 9 of 2022 Section 14 — Right of Erasure).
    """
    secret = secret or get_settings().secret_key

    # Check blacklist before any other work — revoked tokens must be
    # treated as though they never existed (PDPA §14).
    if is_token_blacklisted(token):
        logger.warning("Rejected blacklisted token: %s…", token[:16])
        return None

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


# ── PDPA Compliance Helpers ─────────────────────────────────────────────────


def hash_nic(nic: str) -> str:
    """Return an HMAC-SHA256 hex digest of a National Identity Card number.

    Pseudonymisation per PDPA No. 9 of 2022 Section 12 (Data Minimization):
    the raw NIC is never persisted — only its irreversible, keyed hash is
    stored, ensuring the data subject cannot be re-identified from the
    stored value alone.

    Uses HMAC-SHA256 with the application ``secret_key`` as the key so the
    hash is not vulnerable to offline brute-force without the key material.

    Args:
        nic: The subject's NIC string (e.g. ``199012345678``).

    Returns:
        A 64-character lowercase hex digest.
    """
    secret = get_settings().secret_key
    return hmac.new(
        key=secret.encode("utf-8"),
        msg=nic.strip().encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()


def invalidate_token(token: str) -> bool:
    """Add *token* to the Redis blacklist for consent revocation.

    Implements PDPA No. 9 of 2022 Section 14 (Right of Erasure): when a
    data subject revokes consent, all active QR JWTs linked to their NIC
    are blacklisted so that subsequent verification attempts are rejected.

    The blacklist entry is stored with a TTL matching the maximum token
    lifetime (72 h) so entries are garbage-collected automatically.

    Args:
        token: The opaque token string to revoke.

    Returns:
        ``True`` if the token was successfully blacklisted.
    """
    try:
        client = get_redis()
        key = f"{_BLACKLIST_PREFIX}{token}"
        client.setex(key, _BLACKLIST_TTL_SECONDS, "revoked")
        logger.info("Token blacklisted: %s…", token[:16])
        return True
    except Exception:
        logger.exception("Failed to blacklist token")
        return False


def is_token_blacklisted(token: str) -> bool:
    """Return ``True`` if *token* has been revoked via consent withdrawal.

    Checked during QR verification to enforce PDPA No. 9 of 2022
    Section 14 erasure requests: a blacklisted token must be treated as
    though it never existed.

    Args:
        token: The opaque token string to check.

    Returns:
        ``True`` when the token appears in the blacklist.
    """
    try:
        client = get_redis()
        return client.exists(f"{_BLACKLIST_PREFIX}{token}") > 0
    except Exception:
        logger.exception("Failed to check blacklist for token, treating as blacklisted for safety")
        return True
