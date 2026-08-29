"""Pydantic schemas for PDPA consent management endpoints.

Defines request/response models for consent recording, revocation
(right-to-erasure), and immutable audit-log retrieval — compliant with
Sri Lanka PDPA No. 9 of 2022 Sections 12 and 14.
"""

from datetime import datetime

from typing import Literal

from pydantic import BaseModel, Field

# ── Consent Recording ────────────────────────────────────────────────────────


class ConsentRecordRequest(BaseModel):
    """Payload submitted when a data subject grants explicit consent.

    Per PDPA No. 9 of 2022 Section 12, consent must specify a clear purpose
    limitation and enumerate the data categories being processed.
    """

    nic_number: str = Field(
        ...,
        min_length=5,
        description="National Identity Card number — hashed before storage (never persisted raw).",
    )
    scope: Literal["MSME Cash Flow Appraisal"] = Field(
        default="MSME Cash Flow Appraisal",
        description="Purpose-limited scope per PDPA No. 9 of 2022 §12 — only MSME cash-flow appraisal is authorised.",
    )
    purpose_limitation: list[str] = Field(
        ...,
        description="Explicit purposes for which the data may be processed.",
    )
    data_categories: list[str] = Field(
        ...,
        description="Categories of personal data covered (e.g. voice, images, chat).",
    )
    session_id: str | None = Field(
        default=None,
        description="Optional ingestion-session ID linking this consent to a specific data-processing session.",
    )


class ConsentRecordResponse(BaseModel):
    """Confirmation returned after consent is successfully recorded."""

    consent_id: str = Field(description="Unique identifier for this consent record.")
    nic_hash: str = Field(description="SHA-256 hash of the NIC (raw NIC never stored).")
    recorded_at: datetime = Field(description="UTC timestamp when consent was recorded.")
    scope: str = Field(description="Processing scope as submitted by the data subject.")
    purpose_limitation: list[str] = Field(description="Purposes authorised by the data subject.")
    expires_at: datetime = Field(description="UTC timestamp when the consent record expires.")


# ── Consent Revocation (Right-to-Erasure) ────────────────────────────────────


class ConsentRevokeRequest(BaseModel):
    """Payload for invoking the PDPA Section 14 right-to-erasure.

    Revoking consent triggers immediate invalidation of all active QR tokens
    linked to the NIC and purges all associated personal data from Redis.
    """

    consent_id: str = Field(..., description="The consent record to revoke.")
    nic_number: str = Field(
        ...,
        min_length=5,
        description="NIC of the data subject — used to locate and invalidate linked tokens.",
    )
    reason: str | None = Field(
        default=None,
        description="Optional free-text reason for revocation (for audit purposes).",
    )
    session_id: str | None = Field(
        default=None,
        description="Optional ingestion-session ID to purge alongside consent revocation.",
    )


class ConsentRevokeResponse(BaseModel):
    """Confirmation returned after consent has been revoked and data purged."""

    consent_id: str = Field(description="The consent record that was revoked.")
    revoked_at: datetime = Field(description="UTC timestamp of the revocation.")
    data_purged: bool = Field(description="Whether associated personal data was purged.")
    tokens_invalidated: int = Field(description="Number of active QR tokens that were blacklisted.")


# ── Immutable Audit Log ──────────────────────────────────────────────────────


class AuditLogEntry(BaseModel):
    """A single immutable entry in the data-processing audit trail."""

    timestamp: datetime = Field(description="UTC timestamp of the recorded action.")
    action: str = Field(description="Action type (e.g. consent_recorded, consent_revoked, data_purged).")
    actor_hash: str = Field(description="SHA-256 NIC hash of the data subject or officer who initiated the action.")
    details: dict = Field(description="Free-form metadata about the action.")


class AuditLogResponse(BaseModel):
    """Complete audit log for a given dossier / processing session."""

    dossier_id: str = Field(description="The dossier or session ID the log belongs to.")
    entries: list[AuditLogEntry] = Field(description="Chronological list of audit events.")
    total_entries: int = Field(description="Total number of entries returned.")
