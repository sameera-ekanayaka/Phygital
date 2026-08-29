"""Consent management business logic — PDPA No. 9 of 2022 compliance.

Implements explicit consent recording, consent revocation (right-to-erasure),
and immutable audit-log maintenance — all backed by Redis.

PDPA No. 9 of 2022 Section 12 — Data Minimization:
    Only the SHA-256 NIC hash is stored; the raw NIC is never persisted.

PDPA No. 9 of 2022 Section 14 — Right of Access and Erasure:
    Data subjects may revoke consent at any time, triggering immediate
    invalidation of all active QR tokens and purging of linked data.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.consent.schemas import (
    AuditLogEntry,
    AuditLogResponse,
    ConsentRecordRequest,
    ConsentRecordResponse,
    ConsentRevokeRequest,
    ConsentRevokeResponse,
)
from app.config import get_settings
from app.core.redis_client import delete_keys_by_pattern, get_redis, store_with_ttl
from app.core.security import hash_nic, invalidate_token
from app.services.cleanup_service import purge_raw_ephemeral_data

logger = logging.getLogger(__name__)

# Redis key prefixes.
_CONSENT_PREFIX = "consent:"              # consent:{consent_id}
_NIC_CONSENT_INDEX = "nic_index:"        # nic_index:{nic_hash}:consents → SET
_NIC_TOKEN_INDEX = "nic_index:"          # nic_index:{nic_hash}:tokens → SET
_AUDIT_PREFIX = "audit:"                 # audit:{dossier_id} → LIST


def _redis_json(obj: dict) -> str:
    """Serialise *obj* with datetime-aware JSON encoding."""

    def _default(o):
        if isinstance(o, datetime):
            return o.isoformat()
        return str(o)

    return json.dumps(obj, default=_default)


# ── Internal audit helper ───────────────────────────────────────────────────
# TODO(infra): Audit logs are stored in volatile Redis. For production
# PDPA compliance, migrate to PostgreSQL with append-only semantics.


def _log_audit_event(
    dossier_id: str,
    action: str,
    actor_hash: str,
    details: dict,
) -> None:
    """Append an immutable audit-log entry for *dossier_id*.

    Per PDPA No. 9 of 2022 Sections 12 and 14, every data-processing action
    must be logged with a UTC timestamp, the action type, and the (hashed)
    identity of the actor.  Entries are appended to a Redis list and retained
    for the configured data-retention window.

    Args:
        dossier_id: The dossier or session identifier.
        action: Machine-readable action label (e.g. ``consent_recorded``).
        actor_hash: HMAC-SHA256 NIC hash of the acting data subject or officer.
        details: Arbitrary key/value metadata for the event.
    """
    try:
        client = get_redis()
        entry = AuditLogEntry(
            timestamp=datetime.now(timezone.utc),
            action=action,
            actor_hash=actor_hash,
            details=details,
        )
        client.rpush(f"{_AUDIT_PREFIX}{dossier_id}", entry.model_dump_json())
        logger.debug(
            "Audit event appended — dossier=%s action=%s", dossier_id, action
        )
    except Exception:
        logger.exception(
            "Failed to append audit event — dossier=%s action=%s",
            dossier_id, action,
        )


# ── Consent Recording ───────────────────────────────────────────────────────


def record_consent(request: ConsentRecordRequest) -> ConsentRecordResponse:
    """Record explicit data-processing consent for a NIC holder.

    Per PDPA No. 9 of 2022 Section 12 (Data Minimization), the raw NIC is
    hashed before storage.  The consent record includes a scope, purpose
    limitation flags, and the data categories covered.

    The record is stored in Redis under ``consent:{consent_id}`` with a TTL
    equal to ``consent_expiry_days`` from configuration.  An audit-log
    entry is appended under the consent ID.

    Args:
        request: Validated :class:`ConsentRecordRequest` from the API layer.

    Returns:
        A :class:`ConsentRecordResponse` confirming the stored consent.
    """
    consent_id = uuid.uuid4().hex
    nic_hash = hash_nic(request.nic_number)
    now = datetime.now(timezone.utc)
    settings = get_settings()
    ttl_seconds = settings.consent_expiry_days * 24 * 3600
    expires_at_ts = now.timestamp() + ttl_seconds
    expires_at = datetime.fromtimestamp(expires_at_ts, tz=timezone.utc)

    # Build the consent record payload.
    record: dict = {
        "consent_id": consent_id,
        "nic_hash": nic_hash,
        "recorded_at": now.isoformat(),
        "scope": request.scope,
        "purpose_limitation": request.purpose_limitation,
        "data_categories": request.data_categories,
        "expires_at": expires_at.isoformat(),
        "revoked": False,
    }

    # Link the consent record to an ingestion session if provided.
    if request.session_id:
        record["session_id"] = request.session_id

    # Persist the consent record with TTL.
    if not store_with_ttl(
        key=f"{_CONSENT_PREFIX}{consent_id}",
        value=_redis_json(record),
        ttl_seconds=ttl_seconds,
    ):
        raise HTTPException(status_code=503, detail="Service temporarily unavailable. Please retry.")

    # Maintain a NIC → consent reverse index for efficient revocation lookups.
    try:
        client = get_redis()
        client.sadd(f"{_NIC_CONSENT_INDEX}{nic_hash}:consents", consent_id)
        client.expire(f"{_NIC_CONSENT_INDEX}{nic_hash}:consents", ttl_seconds)
    except Exception:
        logger.exception("Failed to update NIC consent index for hash=%s", nic_hash[:12])

    # Audit log entry.
    _log_audit_event(
        dossier_id=consent_id,
        action="consent_recorded",
        actor_hash=nic_hash,
        details={
            "scope": request.scope,
            "purpose_limitation": request.purpose_limitation,
            "data_categories": request.data_categories,
        },
    )

    logger.info("Consent recorded — consent_id=%s nic_hash=%s…", consent_id, nic_hash[:12])

    return ConsentRecordResponse(
        consent_id=consent_id,
        nic_hash=nic_hash,
        recorded_at=now,
        scope=request.scope,
        purpose_limitation=request.purpose_limitation,
        expires_at=expires_at,
    )


# ── Consent Revocation (Right-to-Erasure) ────────────────────────────────────


def revoke_consent(request: ConsentRevokeRequest) -> ConsentRevokeResponse:
    """Revoke consent and exercise the PDPA Section 14 right-to-erasure.

    Performs the following in sequence:
    1. Locate the consent record and verify it has not already been revoked.
    2. Retrieve all active QR tokens indexed to the NIC hash and blacklist each.
    3. Purge all session data keyed by the consent ID.
    4. Mark the consent record as revoked and append an audit-log entry.

    Args:
        request: Validated :class:`ConsentRevokeRequest` from the API layer.

    Returns:
        A :class:`ConsentRevokeResponse` summarising what was purged.

    Raises:
        ValueError: If the consent record is not found or already revoked.
    """
    nic_hash = hash_nic(request.nic_number)
    revoked_at = datetime.now(timezone.utc)

    # ── Locate the consent record ──────────────────────────────────────────
    try:
        client = get_redis()
        raw = client.get(f"{_CONSENT_PREFIX}{request.consent_id}")
    except Exception:
        logger.exception("Redis error while fetching consent record")
        raw = None

    if raw is None:
        raise ValueError(f"Consent record not found: {request.consent_id}")

    record = json.loads(raw)
    if record.get("revoked"):
        raise ValueError(f"Consent record already revoked: {request.consent_id}")

    # Verify NIC matches the consent record.
    if record.get("nic_hash") != nic_hash:
        raise ValueError("NIC does not match the consent record")

    # ── Invalidate active QR tokens ────────────────────────────────────────
    tokens_invalidated = 0
    failed_tokens: list[str] = []
    try:
        token_set_key = f"{_NIC_TOKEN_INDEX}{nic_hash}:tokens"
        active_tokens = client.smembers(token_set_key)
        for token in active_tokens:
            if invalidate_token(token):
                # Also purge dossier/QR data keyed by this token.
                client.delete(f"phygital:qr:{token}")
                tokens_invalidated += 1
            else:
                failed_tokens.append(token)

        # Only clear the token index if ALL tokens were successfully blacklisted.
        # If any failed, keep the index intact so the revocation can be retried.
        if failed_tokens:
            logger.error(
                "Partial token blacklist failure — %d/%d tokens failed for nic_hash=%s. "
                "Token index preserved for retry.",
                len(failed_tokens), len(active_tokens), nic_hash[:12],
            )
        else:
            client.delete(token_set_key)
    except Exception:
        logger.exception("Error while invalidating tokens for nic_hash=%s", nic_hash[:12])

    # ── Purge associated session data ──────────────────────────────────────
    # Remove any data keyed by the consent_id as a session identifier.
    purge_patterns = [
        f"session:{request.consent_id}:*",
        f"{_CONSENT_PREFIX}{request.consent_id}:*",
    ]
    data_purged = False
    for pattern in purge_patterns:
        deleted = delete_keys_by_pattern(pattern)
        if deleted > 0:
            data_purged = True

    # Purge raw ephemeral data for the linked session (from consent record or
    # revocation request) per PDPA No. 9 of 2022 Section 14 right-to-erasure.
    session_id = (
        request.session_id
        or record.get("session_id")
    )
    if session_id:
        try:
            purge_raw_ephemeral_data(session_id)
            data_purged = True
            logger.info("Ephemeral data purged for session=%s via consent revocation", session_id)
        except Exception:
            logger.exception("Failed to purge ephemeral data for session=%s", session_id)

    # ── Mark consent as revoked ────────────────────────────────────────────
    record["revoked"] = True
    record["revoked_at"] = revoked_at.isoformat()
    record["revocation_reason"] = request.reason
    try:
        # Overwrite the consent record (retain for audit, but mark as revoked).
        client.set(
            f"{_CONSENT_PREFIX}{request.consent_id}",
            _redis_json(record),
        )
    except Exception:
        logger.exception("Failed to update consent record as revoked")

    # Remove the consent_id from the NIC reverse index.
    try:
        client.srem(f"{_NIC_CONSENT_INDEX}{nic_hash}:consents", request.consent_id)
    except Exception:
        logger.exception("Failed to remove consent from NIC index")

    # ── Audit log ──────────────────────────────────────────────────────────
    _log_audit_event(
        dossier_id=request.consent_id,
        action="consent_revoked",
        actor_hash=nic_hash,
        details={
            "reason": request.reason,
            "tokens_invalidated": tokens_invalidated,
            "data_purged": data_purged,
        },
    )

    logger.info(
        "Consent revoked — consent_id=%s tokens_invalidated=%d data_purged=%s",
        request.consent_id, tokens_invalidated, data_purged,
    )

    return ConsentRevokeResponse(
        consent_id=request.consent_id,
        revoked_at=revoked_at,
        data_purged=data_purged,
        tokens_invalidated=tokens_invalidated,
    )


# ── Audit Log Retrieval ──────────────────────────────────────────────────────


def get_audit_log(dossier_id: str, offset: int = 0, limit: int = 50) -> AuditLogResponse:
    """Return the immutable audit log for *dossier_id*.

    Per PDPA No. 9 of 2022 Sections 12 and 14, data subjects and auditors
    have the right to inspect a chronological record of all data-processing
    actions taken against a dossier or consent record.

    Args:
        dossier_id: The dossier ID or consent ID to retrieve the log for.
        offset: Pagination offset (number of entries to skip).
        limit: Maximum number of entries to return.

    Returns:
        An :class:`AuditLogResponse` with paginated entries.
    """
    entries: list[AuditLogEntry] = []
    total: int = 0
    try:
        client = get_redis()
        key = f"{_AUDIT_PREFIX}{dossier_id}"
        total = client.llen(key)
        raw_entries = client.lrange(key, offset, offset + limit - 1)
        for raw in raw_entries:
            try:
                entries.append(AuditLogEntry.model_validate_json(raw))
            except ValidationError:
                logger.warning("Skipping malformed audit entry: %s", raw[:80])
    except Exception:
        logger.exception("Failed to retrieve audit log for dossier=%s", dossier_id)

    logger.info("Audit log retrieved — dossier=%s entries=%d", dossier_id, len(entries))

    return AuditLogResponse(
        dossier_id=dossier_id,
        entries=entries,
        total_entries=total,
    )
