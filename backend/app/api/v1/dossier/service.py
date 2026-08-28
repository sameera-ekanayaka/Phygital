"""Dossier business logic — scoring, explainability, and QR token generation.

Orchestrates the :mod:`scoring_engine` to build a full :class:`CreditDossierResponse`,
and optionally mints a 72-hour HMAC-signed QR payload via :mod:`core.security`.
"""

import logging
import statistics
import uuid
from datetime import datetime, timezone

from app.api.v1.dossier.schemas import (
    CreditDossierResponse,
    DossierCalculateRequest,
    DossierGenerateRequest,
    DossierGenerateResponse,
    FieldInterviewPrompt,
    FinancialMetrics,
)
from app.core.security import create_signed_token
from app.services.scoring_engine import (
    compute_financial_metrics,
    derive_recommendation,
    generate_anomaly_flags,
    generate_explainability_notes,
    generate_field_interview_prompts,
)

logger = logging.getLogger(__name__)

# 72 hours expressed in minutes (used by the security token helper).
_QR_TTL_MINUTES = 72 * 60


def _build_dossier(
    transactions,
    requested_loan_amount: float,
    loan_tenor_months: int,
    merchant_name: str | None,
    merchant_id: str | None,
) -> CreditDossierResponse:
    """Internal helper that runs the full scoring pipeline and assembles the dossier."""
    metrics_dict = compute_financial_metrics(
        transactions=transactions,
        requested_loan_amount=requested_loan_amount,
        loan_tenor_months=loan_tenor_months,
    )

    notes = generate_explainability_notes(metrics_dict, transactions)
    anomaly_flags = generate_anomaly_flags(transactions)
    raw_prompts = generate_field_interview_prompts(metrics_dict, transactions)
    prompts = [FieldInterviewPrompt(**p) for p in raw_prompts]

    confidence_scores = [t.confidence_score for t in transactions]
    avg_confidence = (
        round(statistics.mean(confidence_scores), 4) if confidence_scores else 0.0
    )

    recommendation = derive_recommendation(metrics_dict)

    dossier = CreditDossierResponse(
        merchant_name=merchant_name,
        merchant_id=merchant_id,
        metrics=FinancialMetrics(**metrics_dict),
        explainability_notes=notes,
        anomaly_flags=anomaly_flags,
        field_interview_prompts=prompts,
        transaction_count=len(transactions),
        avg_confidence=avg_confidence,
        recommendation=recommendation,
    )

    logger.info(
        "Dossier built: %d txns, recommendation=%s, risk=%.2f",
        len(transactions),
        recommendation,
        metrics_dict["risk_score"],
    )
    return dossier


# ── Public API ───────────────────────────────────────────────────────────────


def calculate_dossier(request: DossierCalculateRequest) -> CreditDossierResponse:
    """Compute a credit dossier without generating a QR token.

    Args:
        request: Validated request body from the /calculate endpoint.

    Returns:
        A fully populated :class:`CreditDossierResponse`.
    """
    return _build_dossier(
        transactions=request.transactions,
        requested_loan_amount=request.requested_loan_amount,
        loan_tenor_months=request.loan_tenor_months,
        merchant_name=request.merchant_name,
        merchant_id=request.merchant_id,
    )


def generate_dossier_with_qr(
    request: DossierGenerateRequest,
) -> DossierGenerateResponse:
    """Compute a credit dossier **and** mint a 72-hour signed QR payload.

    The QR payload embeds the merchant ID (or a generated UUID), the risk
    score, and the recommendation — enough for a bank officer to verify the
    dossier provenance without exposing raw transaction data.

    Args:
        request: Validated request body from the /generate endpoint.

    Returns:
        A :class:`DossierGenerateResponse` containing the dossier and QR metadata.
    """
    dossier = _build_dossier(
        transactions=request.transactions,
        requested_loan_amount=request.requested_loan_amount,
        loan_tenor_months=request.loan_tenor_months,
        merchant_name=request.merchant_name,
        merchant_id=request.merchant_id,
    )

    # create_signed_token binds a cash_flow_id (here the merchant/dossier ID)
    # to an expiry; the full dossier summary is reconstructable from the DB.
    dossier_id = request.merchant_id or str(uuid.uuid4())

    token, expires_at_unix = create_signed_token(
        cash_flow_id=dossier_id,
        expiry_minutes=_QR_TTL_MINUTES,
    )

    qr_expires_at = datetime.fromtimestamp(expires_at_unix, tz=timezone.utc).isoformat()

    logger.info(
        "QR token generated for dossier %s — expires %s",
        dossier_id,
        qr_expires_at,
    )

    return DossierGenerateResponse(
        dossier=dossier,
        qr_payload=token,
        qr_expires_at=qr_expires_at,
    )
