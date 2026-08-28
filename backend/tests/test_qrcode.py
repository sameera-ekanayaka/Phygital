"""Tests for QR code generation and verification endpoints."""

from __future__ import annotations

import base64
from datetime import datetime, timezone

GENERATE_URL = "/api/v1/qrcode/generate"
VERIFY_URL = "/api/v1/qrcode/verify"


def _generate(client, cash_flow_id: str, expiry_minutes: int = 4320) -> dict:
    """Helper: call /qrcode/generate and return the parsed JSON response."""
    resp = client.post(
        GENERATE_URL,
        json={"cash_flow_id": cash_flow_id, "expiry_minutes": expiry_minutes},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── Generation tests ────────────────────────────────────────────────────────


def test_generate_returns_expected_fields(client) -> None:
    """A valid request must return qr_code_base64, token, expires_at, verify_url."""
    data = _generate(client, "550e8400-e29b-41d4-a716-446655440000")

    assert "qr_code_base64" in data
    assert "token" in data
    assert "expires_at" in data
    assert "verify_url" in data
    assert data["token"]
    assert data["verify_url"].startswith("https://")


def test_generate_base64_is_valid_png(client) -> None:
    """The returned base64 string must decode to a valid PNG file."""
    data = _generate(client, "550e8400-e29b-41d4-a716-446655440001")

    raw = base64.b64decode(data["qr_code_base64"])
    # PNG magic bytes (‰PNG\r\n\x1a\n)
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"


def test_generate_default_expiry_is_4320_minutes(client) -> None:
    """Omitting expiry_minutes must default to 4320 (72 hours)."""
    resp = client.post(
        GENERATE_URL,
        json={"cash_flow_id": "550e8400-e29b-41d4-a716-446655440002"},
    )
    assert resp.status_code == 200
    data = resp.json()

    expires_at = datetime.fromisoformat(data["expires_at"])
    now = datetime.now(timezone.utc)
    delta_minutes = (expires_at - now).total_seconds() / 60

    # Allow 2-minute tolerance for execution time
    assert abs(delta_minutes - 4320) < 2, (
        f"Expected ~4320 min expiry, got {delta_minutes:.1f}"
    )


# ── Verification tests ──────────────────────────────────────────────────────


def test_verify_valid_token_returns_cash_flow(client) -> None:
    """A freshly generated token must verify successfully."""
    gen_data = _generate(client, "550e8400-e29b-41d4-a716-446655440003")
    token = gen_data["token"]

    resp = client.get(f"{VERIFY_URL}/{token}")
    assert resp.status_code == 200

    verify_data = resp.json()
    assert verify_data["cash_flow_id"] == "550e8400-e29b-41d4-a716-446655440003"
    assert isinstance(verify_data["cash_flow_data"], dict)


def test_verify_invalid_token_returns_410(client) -> None:
    """A completely bogus token must return 410 Gone."""
    resp = client.get(f"{VERIFY_URL}/not-a-real-token-at-all")
    assert resp.status_code == 410


def test_verify_tampered_token_returns_410(client) -> None:
    """Altering any character in a valid token must invalidate it → 410."""
    gen_data = _generate(client, "550e8400-e29b-41d4-a716-446655440004")
    token = gen_data["token"]

    # Flip the last character
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

    resp = client.get(f"{VERIFY_URL}/{tampered}")
    assert resp.status_code == 410


def test_verify_token_not_in_redis_returns_410(client) -> None:
    """A cryptographically valid token evicted from Redis must return 410."""
    from app.core.redis_client import get_redis

    gen_data = _generate(client, "550e8400-e29b-41d4-a716-446655440005")
    token = gen_data["token"]

    # Manually evict the key from Redis to simulate TTL expiry
    r = get_redis()
    r.delete(f"phygital:qr:{token}")

    resp = client.get(f"{VERIFY_URL}/{token}")
    assert resp.status_code == 410
