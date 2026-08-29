"""Consent management API routes — PDPA No. 9 of 2022 compliance endpoints.

Provides three endpoints for Sri Lanka's Personal Data Protection Act
obligations:
- ``POST /consent/record``  — Record explicit data-processing consent.
- ``POST /consent/revoke``  — Exercise the right-to-erasure.
- ``GET  /consent/audit-log/{dossier_id}`` — Retrieve immutable audit log.

All route docstrings reference PDPA No. 9 of 2022 Sections 12 & 14.
"""

import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.api.v1.consent.schemas import (
    AuditLogResponse,
    ConsentRecordRequest,
    ConsentRecordResponse,
    ConsentRevokeRequest,
    ConsentRevokeResponse,
)
from app.api.v1.consent.service import get_audit_log, record_consent, revoke_consent
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/consent", tags=["consent"])


@router.post(
    "/record",
    response_model=ConsentRecordResponse,
    summary="Record explicit data-processing consent (PDPA §12)",
)
@limiter.limit("20/minute")
async def post_consent_record(
    request: Request,
    body: ConsentRecordRequest,
) -> ConsentRecordResponse:
    """Record explicit, purpose-limited consent from a data subject.

    Per **PDPA No. 9 of 2022 Section 12** (Data Minimization), the submitted
    NIC number is immediately hashed (SHA-256) before storage — the raw NIC
    is never persisted.  The consent record specifies the processing scope,
    purpose-limitation flags, and the data categories covered.

    Args:
        request: FastAPI request object (required for rate limiter).
        body: Consent payload with NIC, scope, purpose limitation, and data categories.

    Returns:
        A :class:`ConsentRecordResponse` confirming the stored consent
        with its unique ``consent_id`` and expiry timestamp.
    """
    logger.info(
        "Consent /record — scope=%s categories=%s",
        body.scope, body.data_categories,
    )
    return record_consent(body)


@router.post(
    "/revoke",
    response_model=ConsentRevokeResponse,
    summary="Revoke consent and exercise right-to-erasure (PDPA §14)",
)
@limiter.limit("10/minute")
async def post_consent_revoke(
    request: Request,
    body: ConsentRevokeRequest,
) -> ConsentRevokeResponse:
    """Revoke previously granted consent and exercise the right-to-erasure.

    Per **PDPA No. 9 of 2022 Section 14** (Right of Access and Erasure),
    the data subject may withdraw consent at any time.  Revocation triggers:
    1. Immediate blacklisting of all active QR JWT tokens linked to the NIC.
    2. Purging of all session data associated with the consent record.
    3. An immutable audit-log entry recording the revocation.

    Args:
        request: FastAPI request object (required for rate limiter).
        body: Revocation payload with ``consent_id``, NIC, and optional reason.

    Returns:
        A :class:`ConsentRevokeResponse` confirming how many tokens were
        invalidated and whether data was purged.

    Raises:
        HTTPException: 404 if the consent record is not found.
        HTTPException: 409 if the consent has already been revoked.
    """
    logger.info("Consent /revoke — consent_id=%s", body.consent_id)
    try:
        return revoke_consent(body)
    except ValueError as exc:
        error_msg = str(exc)
        if "not found" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg,
            ) from exc
        if "already revoked" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=error_msg,
            ) from exc
        if "does not match" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=error_msg,
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        ) from exc


@router.get(
    "/audit-log/{dossier_id}",
    response_model=AuditLogResponse,
    summary="Retrieve immutable data-processing audit log (PDPA §12 & §14)",
)
async def get_consent_audit_log(dossier_id: str) -> AuditLogResponse:
    """Return the chronological audit log for a dossier or consent record.

    Per **PDPA No. 9 of 2022 Sections 12 and 14**, every data-processing
    action — consent recording, consent revocation, data purging — must be
    recorded in an append-only, tamper-evident log that data subjects and
    regulatory auditors can inspect.

    Args:
        dossier_id: The dossier ID or consent ID to retrieve the log for.

    Returns:
        An :class:`AuditLogResponse` with all recorded events in
        chronological order.
    """
    logger.info("Consent /audit-log — dossier_id=%s", dossier_id)
    return get_audit_log(dossier_id)
