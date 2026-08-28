"""Shared pytest fixtures for the Phygital Cash-Flow Engine test suite."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from twilio.request_validator import RequestValidator

from app.config import get_settings
from app.main import app


@pytest.fixture()
def client():
    """Yield a FastAPI ``TestClient`` bound to the application."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_singletons():
    """Reset the Redis client and settings singletons around every test.

    This guarantees that each test starts with a clean in-memory fakeredis
    instance and a fresh ``Settings`` object.
    """
    from app.core import redis_client as _rc

    _rc.reset_redis()
    get_settings.cache_clear()
    yield
    _rc.reset_redis()
    get_settings.cache_clear()


@pytest.fixture()
def twilio_sign():
    """Return a factory that computes a valid Twilio webhook signature.

    The returned callable accepts ``(url, params)`` and produces the same
    HMAC-SHA1 base64 signature that Twilio sends in the
    ``X-Twilio-Signature`` header.
    """
    settings = get_settings()
    validator = RequestValidator(settings.twilio_auth_token)

    def _sign(url: str, params: dict[str, str]) -> str:
        return validator.compute_signature(url, params)

    return _sign
