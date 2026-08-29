"""Ephemeral vault cleanup service — PDPA No. 9 of 2022 Section 12.

Implements the data-minimization principle by purging raw, personally
identifiable media (voice recordings, OCR images, unparsed chat text)
from Redis and temporary disk storage once the credit dossier has been
generated.  Only anonymised / hashed aggregate metrics (monthly_revenue,
DSCR, risk_score) are retained beyond the processing cycle.
"""

import glob
import json
import logging
import os
from datetime import datetime, timezone
from functools import partial
from typing import Callable

from app.config import get_settings
from app.core.redis_client import delete_keys_by_pattern, get_redis, get_ttl

logger = logging.getLogger(__name__)

# Redis key that records the scheduled / completed purge for a session.
_PURGE_MARKER_PREFIX = "purge:marker:"

# Redis key patterns holding raw ephemeral data that must be destroyed.
_EPHEMERAL_PATTERNS = (
    "session:{session_id}:audio:*",    # voice recordings
    "session:{session_id}:ocr:*",      # temporary OCR ledger images
    "session:{session_id}:raw_text:*", # unparsed chat / SMS text
    "session:{session_id}:temp:*",     # miscellaneous temp blobs
)


def _temp_dir() -> str:
    """Return the configured temporary upload directory (absolute or relative)."""
    return get_settings().temp_upload_dir


# ── Public API ───────────────────────────────────────────────────────────────


def purge_raw_ephemeral_data(session_id: str) -> dict:
    """Purge all raw, personally identifiable data for *session_id*.

    Per PDPA No. 9 of 2022 Section 12 (Data Minimization), once the
    structured dossier has been generated the raw voice audio blobs,
    temporary ledger OCR images, and unparsed chat text must be destroyed.
    Only the anonymised / hashed aggregate financial metrics are retained.

    This function:
    1. Deletes all Redis keys matching the ephemeral patterns for the session.
    2. Removes any files under ``<temp_upload_dir>/<session_id>/`` on disk.
    3. Records a purge-completion marker in Redis for audit purposes.

    Args:
        session_id: Unique identifier of the ingestion session to purge.

    Returns:
        A dict with ``session_id``, ``keys_deleted``, ``files_deleted``,
        ``purged_at`` (ISO-8601), and ``status`` (``"purged"``).
    """
    # ── Redis cleanup ──────────────────────────────────────────────────────
    keys_deleted = 0
    for pattern_template in _EPHEMERAL_PATTERNS:
        pattern = pattern_template.format(session_id=session_id)
        keys_deleted += delete_keys_by_pattern(pattern)

    # ── Disk cleanup ───────────────────────────────────────────────────────
    files_deleted = 0
    session_tmp_dir = os.path.join(_temp_dir(), session_id)
    if os.path.isdir(session_tmp_dir):
        for file_path in glob.glob(os.path.join(session_tmp_dir, "**"), recursive=True):
            if os.path.isfile(file_path):
                try:
                    os.remove(file_path)
                    files_deleted += 1
                except OSError:
                    logger.warning("Failed to remove temp file: %s", file_path)
        # Remove the directory tree itself (bottom-up).
        try:
            os.removedirs(session_tmp_dir)
        except OSError:
            logger.debug("Temp directory not empty or already removed: %s", session_tmp_dir)

    # ── Record purge marker ────────────────────────────────────────────────
    purged_at = datetime.now(timezone.utc).isoformat()
    try:
        client = get_redis()
        marker_key = f"{_PURGE_MARKER_PREFIX}{session_id}"
        marker_payload = json.dumps({
            "session_id": session_id,
            "keys_deleted": keys_deleted,
            "files_deleted": files_deleted,
            "purged_at": purged_at,
            "status": "purged",
        })
        # Retain the purge marker for 30 days for compliance auditing.
        client.setex(marker_key, 30 * 24 * 3600, marker_payload)
    except Exception:
        logger.exception("Failed to write purge marker for session=%s", session_id)

    logger.info(
        "PDPA purge complete — session=%s keys_deleted=%d files_deleted=%d",
        session_id, keys_deleted, files_deleted,
    )

    return {
        "session_id": session_id,
        "keys_deleted": keys_deleted,
        "files_deleted": files_deleted,
        "purged_at": purged_at,
        "status": "purged",
    }


def schedule_ephemeral_purge(session_id: str, delay_seconds: int = 0) -> Callable[[], dict]:
    """Schedule an ephemeral-data purge for *session_id*.

    Returns a callable suitable for FastAPI ``BackgroundTasks.add_task()``.

    When *delay_seconds* is ``0`` the callable will invoke
    :func:`purge_raw_ephemeral_data` immediately when executed by the
    background worker.  For deferred purges a Redis TTL marker is set and
    the callable still invokes the purge (a downstream background worker or
    cron job is expected to poll for expired markers).

    Per PDPA No. 9 of 2022 Section 12, the default behaviour is to purge
    immediately after dossier generation (``delay_seconds=0``).

    Args:
        session_id: Unique ingestion-session identifier.
        delay_seconds: Seconds to defer the purge.  ``0`` means purge now.

    Returns:
        A zero-argument callable that performs the purge when invoked.
    """
    now = datetime.now(timezone.utc)

    if delay_seconds <= 0:
        logger.info(
            "PDPA purge scheduled immediately — session=%s", session_id,
        )
        return partial(purge_raw_ephemeral_data, session_id)

    # Set a scheduling marker with TTL; a background worker can poll this.
    scheduled_for_ts = now.timestamp() + delay_seconds
    scheduled_for = datetime.fromtimestamp(scheduled_for_ts, tz=timezone.utc).isoformat()
    try:
        client = get_redis()
        marker_key = f"{_PURGE_MARKER_PREFIX}{session_id}"
        marker_payload = json.dumps({
            "session_id": session_id,
            "scheduled_at": now.isoformat(),
            "scheduled_for": scheduled_for,
            "status": "scheduled",
        })
        client.setex(marker_key, delay_seconds, marker_payload)
    except Exception:
        logger.exception("Failed to schedule purge marker for session=%s", session_id)

    logger.info(
        "PDPA purge scheduled — session=%s for=%s (delay=%ds)",
        session_id, scheduled_for, delay_seconds,
    )

    # Return a callable that performs the purge (when called by BackgroundTasks
    # it will execute immediately, but the marker is also set for cron fallback).
    return partial(purge_raw_ephemeral_data, session_id)


def get_purge_status(session_id: str) -> dict:
    """Return the current purge status for *session_id*.

    Checks the Redis purge-marker key.  If no marker exists the session's
    ephemeral data is assumed to still be present (``status: "pending"``).

    Per PDPA No. 9 of 2022 Sections 12 and 14, this function supports
    audit-trail verification of data-minimization compliance by exposing
    whether raw ephemeral data has been purged for a given session.

    Args:
        session_id: Unique ingestion-session identifier.

    Returns:
        A dict with ``session_id``, ``status`` (``"pending"`` | ``"scheduled"``
        | ``"purged"``), and any recorded metadata.
    """
    try:
        client = get_redis()
        marker_key = f"{_PURGE_MARKER_PREFIX}{session_id}"
        raw = client.get(marker_key)
        if raw is None:
            # No marker exists — ephemeral data has not yet been purged.
            return {
                "session_id": session_id,
                "status": "pending",
            }
        return json.loads(raw)
    except Exception:
        logger.exception("Failed to retrieve purge status for session=%s", session_id)
        return {
            "session_id": session_id,
            "status": "unknown",
        }
