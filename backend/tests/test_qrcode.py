"""Tests for verification code generation and token verification endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

GENERATE_URL = "/api/v1/verification/generate"
RESOLVE_URL = "/api/v1/verification/resolve"
VERIFY_URL = "/api/v1/verification/verify"


def _generate(client, cash_flow_id: str, expiry_minutes: int = 4320) -> dict:
    """Helper: call /verification/generate and return the parsed JSON response."""
    resp = client.post(
        GENERATE_URL,
        json={"cash_flow_id": cash_flow_id, "expiry_minutes": expiry_minutes},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── Generation tests ────────────────────────────────────────────────────────


def test_generate_returns_expected_fields(client) -> None:
    """A valid request must return verification_code, token, expires_at."""
    data = _generate(client, "550e8400-e29b-41d4-a716-446655440000")

    assert "verification_code" in data
    assert "token" in data
    assert "expires_at" in data
    assert data["token"]
    assert data["verification_code"].startswith("PHYG-")


def test_generate_verification_code_format(client) -> None:
    """Verification code must match pattern PHYG-XXXX-XXXX with valid alphabet."""
    data = _generate(client, "550e8400-e29b-41d4-a716-446655440001")
    code = data["verification_code"]

    # Format: PHYG-XXXX-XXXX
    parts = code.split("-")
    assert len(parts) == 3
    assert parts[0] == "PHYG"
    assert len(parts[1]) == 4
    assert len(parts[2]) == 4

    # No ambiguous characters (0, O, I, 1, L)
    valid_chars = set("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    assert all(c in valid_chars for c in parts[1])
    assert all(c in valid_chars for c in parts[2])


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


# ── Resolve (code round-trip) tests ────────────────────────────────────────


def test_resolve_valid_code_returns_cash_flow_and_token(client) -> None:
    """A freshly generated verification code must resolve with cash-flow data and HMAC token."""
    gen_data = _generate(client, "550e8400-e29b-41d4-a716-446655440003")
    code = gen_data["verification_code"]

    resp = client.get(f"{RESOLVE_URL}/{code}")
    assert resp.status_code == 200

    resolve_data = resp.json()
    assert resolve_data["cash_flow_id"] == "550e8400-e29b-41d4-a716-446655440003"
    assert isinstance(resolve_data["cash_flow_data"], dict)
    assert isinstance(resolve_data["token"], str) and len(resolve_data["token"]) > 0


def test_resolve_invalid_code_returns_410(client) -> None:
    """A bogus verification code must return 410 Gone."""
    resp = client.get(f"{RESOLVE_URL}/PHYG-ZZZZ-ZZZZ")
    assert resp.status_code == 410


# ── Verification tests (backward compat) ────────────────────────────────────


def test_verify_valid_token_returns_cash_flow(client) -> None:
    """A freshly generated token must verify successfully."""
    gen_data = _generate(client, "550e8400-e29b-41d4-a716-446655440004")
    token = gen_data["token"]

    resp = client.get(f"{VERIFY_URL}/{token}")
    assert resp.status_code == 200

    verify_data = resp.json()
    assert verify_data["cash_flow_id"] == "550e8400-e29b-41d4-a716-446655440004"
    assert isinstance(verify_data["cash_flow_data"], dict)


def test_verify_invalid_token_returns_410(client) -> None:
    """A completely bogus token must return 410 Gone."""
    resp = client.get(f"{VERIFY_URL}/not-a-real-token-at-all")
    assert resp.status_code == 410


def test_verify_tampered_token_returns_410(client) -> None:
    """Altering any character in a valid token must invalidate it → 410."""
    gen_data = _generate(client, "550e8400-e29b-41d4-a716-446655440005")
    token = gen_data["token"]

    # Flip the last character
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

    resp = client.get(f"{VERIFY_URL}/{tampered}")
    assert resp.status_code == 410


def test_verify_token_not_in_redis_returns_410(client) -> None:
    """A cryptographically valid token evicted from Redis must return 410."""
    from app.core.redis_client import get_redis

    gen_data = _generate(client, "550e8400-e29b-41d4-a716-446655440006")
    token = gen_data["token"]

    # Manually evict the key from Redis to simulate TTL expiry
    r = get_redis()
    r.delete(f"phygital:qr:{token}")

    resp = client.get(f"{VERIFY_URL}/{token}")
    assert resp.status_code == 410


def test_binithi_verification_code_72_hour_jwt(client) -> None:
    """Binithi persona: generate a 72-hour HMAC-signed JWT and verify it end-to-end."""
    from datetime import timedelta

    cash_flow_id = "550e8400-e29b-41d4-a716-446655440099"

    # Generate the verification code
    before = datetime.now(timezone.utc)
    resp = client.post(GENERATE_URL, json={"cash_flow_id": cash_flow_id})
    after = datetime.now(timezone.utc)

    assert resp.status_code == 200
    data = resp.json()

    token = data["token"]
    assert isinstance(token, str) and len(token) > 0

    code = data["verification_code"]
    assert code.startswith("PHYG-")

    # Verify expires_at is approximately 72 hours (4320 minutes) in the future
    expires_at = datetime.fromisoformat(data["expires_at"])
    assert expires_at.tzinfo is not None
    expected_low = before + timedelta(hours=71, minutes=58)
    expected_high = after + timedelta(hours=72, minutes=2)
    assert expected_low <= expires_at <= expected_high, (
        f"expires_at {expires_at} not within 72h ±2min window"
    )

    # Verify the token via the verify endpoint
    verify_resp = client.get(f"{VERIFY_URL}/{token}")
    assert verify_resp.status_code == 200
    verify_data = verify_resp.json()
    assert verify_data["cash_flow_id"] == cash_flow_id

    # Also resolve via the verification code
    resolve_resp = client.get(f"{RESOLVE_URL}/{code}")
    assert resolve_resp.status_code == 200
    resolve_data = resolve_resp.json()
    assert resolve_data["cash_flow_id"] == cash_flow_id
    assert resolve_data["token"] == token
