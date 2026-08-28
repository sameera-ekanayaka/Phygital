"""Dossier API routes — credit scoring and QR-token generation endpoints.

Provides two POST endpoints consumed by the bank-officer dashboard:
- ``/calculate`` — run the scoring engine and return a full credit dossier.
- ``/generate`` — same as /calculate **plus** a 72-hour HMAC-signed QR token.
"""

import logging

from fastapi import APIRouter, Request

from app.api.v1.dossier.schemas import (
    CreditDossierResponse,
    DossierCalculateRequest,
    DossierGenerateRequest,
    DossierGenerateResponse,
)
from app.api.v1.dossier.service import calculate_dossier, generate_dossier_with_qr
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dossier", tags=["dossier"])


@router.post("/calculate", response_model=CreditDossierResponse)
@limiter.limit("30/minute")
async def post_calculate(
    request: Request,
    body: DossierCalculateRequest,
) -> CreditDossierResponse:
    """Compute a full credit dossier from extracted transactions.

    Runs the scoring engine to produce financial metrics, explainability
    notes, anomaly flags, and trilingual field-interview prompts.

    Args:
        request: FastAPI request object (required for rate limiter).
        body: Transaction set and loan parameters.

    Returns:
        A complete :class:`CreditDossierResponse`.
    """
    logger.info(
        "Dossier /calculate: %d transactions, loan=%.0f, tenor=%d mo",
        len(body.transactions),
        body.requested_loan_amount,
        body.loan_tenor_months,
    )
    return calculate_dossier(body)


@router.post("/generate", response_model=DossierGenerateResponse)
@limiter.limit("20/minute")
async def post_generate(
    request: Request,
    body: DossierGenerateRequest,
) -> DossierGenerateResponse:
    """Compute a credit dossier **and** mint a 72-hour signed QR token.

    The returned ``qr_payload`` is an opaque HMAC-signed string that a bank
    officer can scan to verify dossier provenance; ``qr_expires_at`` is the
    ISO-8601 UTC timestamp after which the token is no longer valid.

    Args:
        request: FastAPI request object (required for rate limiter).
        body: Transaction set and loan parameters.

    Returns:
        A :class:`DossierGenerateResponse` wrapping the dossier and QR metadata.
    """
    logger.info(
        "Dossier /generate: %d transactions, loan=%.0f, tenor=%d mo",
        len(body.transactions),
        body.requested_loan_amount,
        body.loan_tenor_months,
    )
    return generate_dossier_with_qr(body)
