"""Unit tests for the HMAC-SHA256 security module."""

import time

from app.core.security import (
    create_signed_token,
    hash_nic,
    invalidate_token,
    is_token_blacklisted,
    verify_token,
)

_TEST_SECRET = "test_secret_key_for_unit_tests_minimum_16"


class TestCreateSignedToken:
    def test_returns_token_and_expiry(self):
        token, expires_at = create_signed_token(
            cash_flow_id="cf-123", expiry_minutes=60, secret=_TEST_SECRET
        )
        assert isinstance(token, str)
        assert "." in token
        assert isinstance(expires_at, float)
        assert expires_at > time.time()

    def test_token_contains_payload_and_signature(self):
        token, _ = create_signed_token(
            cash_flow_id="cf-456", expiry_minutes=30, secret=_TEST_SECRET
        )
        parts = token.split(".")
        assert len(parts) == 2


class TestVerifyToken:
    def test_valid_token(self):
        token, _ = create_signed_token(
            cash_flow_id="cf-valid", expiry_minutes=60, secret=_TEST_SECRET
        )
        payload = verify_token(token, secret=_TEST_SECRET)
        assert payload is not None
        assert payload["cfid"] == "cf-valid"

    def test_expired_token(self):
        token, _ = create_signed_token(
            cash_flow_id="cf-expired", expiry_minutes=-1, secret=_TEST_SECRET
        )
        payload = verify_token(token, secret=_TEST_SECRET)
        assert payload is None

    def test_tampered_signature(self):
        token, _ = create_signed_token(
            cash_flow_id="cf-tampered", expiry_minutes=60, secret=_TEST_SECRET
        )
        tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
        payload = verify_token(tampered, secret=_TEST_SECRET)
        assert payload is None

    def test_wrong_secret(self):
        token, _ = create_signed_token(
            cash_flow_id="cf-wrong", expiry_minutes=60, secret=_TEST_SECRET
        )
        payload = verify_token(token, secret="completely_different_secret_key")
        assert payload is None

    def test_blacklisted_token(self):
        token, _ = create_signed_token(
            cash_flow_id="cf-blacklist", expiry_minutes=60, secret=_TEST_SECRET
        )
        invalidate_token(token)
        payload = verify_token(token, secret=_TEST_SECRET)
        assert payload is None


class TestHashNic:
    def test_deterministic(self):
        h1 = hash_nic("199012345678")
        h2 = hash_nic("199012345678")
        assert h1 == h2

    def test_different_inputs_differ(self):
        h1 = hash_nic("199012345678")
        h2 = hash_nic("200098765432")
        assert h1 != h2

    def test_returns_hex_string(self):
        h = hash_nic("199012345678")
        assert isinstance(h, str)
        assert len(h) == 64


class TestInvalidateToken:
    def test_invalidate_adds_to_blacklist(self):
        token, _ = create_signed_token(
            cash_flow_id="cf-inv", expiry_minutes=60, secret=_TEST_SECRET
        )
        assert not is_token_blacklisted(token)
        result = invalidate_token(token)
        assert result is True
        assert is_token_blacklisted(token)
