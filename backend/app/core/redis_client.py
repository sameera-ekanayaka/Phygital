"""Redis connection helper with automatic fakeredis fallback.

During local development or CI, a live Redis server may not be available.
This module transparently falls back to ``fakeredis`` so the application
remains fully functional for manual testing and automated test suites.
"""

import logging
from typing import TYPE_CHECKING

import redis

from app.config import get_settings

if TYPE_CHECKING:
    from redis import Redis

logger = logging.getLogger(__name__)

_client: "Redis | None" = None


def get_redis() -> "Redis":
    """Return a module-level Redis client singleton.

    On first call the function attempts to connect to the configured
    ``REDIS_URL``.  If the connection fails (e.g. Redis is not running)
    it transparently falls back to a ``fakeredis`` in-memory instance so
    that local development and tests continue to work.
    """
    global _client

    if _client is not None:
        return _client

    settings = get_settings()

    try:
        client = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        client.ping()  # verify connectivity
        logger.info("Connected to Redis at %s", settings.redis_url)
        _client = client
    except (redis.ConnectionError, redis.TimeoutError, OSError):
        logger.warning(
            "Redis unavailable at %s — falling back to fakeredis.",
            settings.redis_url,
        )
        import fakeredis

        _client = fakeredis.FakeRedis(decode_responses=True)

    return _client


def reset_redis() -> None:
    """Reset the cached client (useful between test runs)."""
    global _client
    _client = None
