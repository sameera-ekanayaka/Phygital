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


def store_with_ttl(key: str, value: str, ttl_seconds: int) -> bool:
    """Store *value* under *key* with an automatic expiry of *ttl_seconds*.

    Supports PDPA No. 9 of 2022 Section 12 (Data Minimization) by ensuring
    ephemeral data is automatically purged after its retention window.

    Args:
        key: Redis key to store.
        value: String value to associate with the key.
        ttl_seconds: Time-to-live in seconds; Redis auto-deletes after expiry.

    Returns:
        ``True`` if the key was set successfully, ``False`` otherwise.
    """
    try:
        client = get_redis()
        client.setex(key, ttl_seconds, value)
        logger.debug("Stored key=%s with TTL=%ds", key, ttl_seconds)
        return True
    except Exception:
        logger.exception("Failed to store key=%s with TTL", key)
        return False


def delete_keys_by_pattern(pattern: str) -> int:
    """Delete all Redis keys matching *pattern* (supports glob wildcards).

    Implements the PDPA No. 9 of 2022 Section 14 right-to-erasure by
    allowing bulk removal of all data associated with a session or subject.

    Args:
        pattern: Glob-style pattern, e.g. ``session:abc123:*``.

    Returns:
        The number of keys deleted.
    """
    try:
        client = get_redis()
        cursor: int | str = 0
        deleted = 0
        while True:
            cursor, keys = client.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                deleted += client.delete(*keys)
            if cursor == 0:
                break
        logger.info("Deleted %d keys matching pattern=%s", deleted, pattern)
        return deleted
    except Exception:
        logger.exception("Failed to delete keys matching pattern=%s", pattern)
        return 0


def get_ttl(key: str) -> int:
    """Return the remaining TTL (in seconds) for *key*.

    Supports PDPA No. 9 of 2022 Sections 12 and 14 by enabling
    verification that ephemeral data has a finite retention window
    (Section 12 — Data Minimization) and assisting right-to-erasure
    audits (Section 14).

    Returns:
        Remaining seconds, ``-1`` if the key exists but has no expiry,
        or ``-2`` if the key does not exist.
    """
    try:
        client = get_redis()
        return client.ttl(key)
    except Exception:
        logger.exception("Failed to get TTL for key=%s", key)
        return -2


def reset_redis() -> None:
    """Reset the cached client (useful between test runs)."""
    global _client
    _client = None
