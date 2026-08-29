"""Dossier business logic — scoring, explainability, and verification code generation.

Orchestrates the :mod:`scoring_engine` to build a full :class:`CreditDossierResponse`,
and optionally mints a 72-hour HMAC-signed token plus verification code via :mod:`core.security`.
"""

import hashlib
import json
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
    LoanExecutionResponse,
)
from app.api.v1.qrcode.service import generate_verification_code, store_code_mapping
from app.core.redis_client import get_redis, store_with_ttl
from app.core.security import create_signed_token, invalidate_token, verify_token
from app.services.scoring_engine import (
    compute_financial_metrics,
    derive_recommendation,
    generate_anomaly_flags,
    generate_explainability_notes,
    generate_field_interview_prompts,
)
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# 72 hours expressed in minutes (used by the security token helper).
_TTL_MINUTES = 72 * 60


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
    """Compute a credit dossier **and** mint a 72-hour signed verification code.

    The verification code and HMAC token embed the merchant ID (or a generated
    UUID), the risk score, and the recommendation — enough for a bank officer
    to verify the dossier provenance without exposing raw transaction data.

    Args:
        request: Validated request body from the /generate endpoint.

    Returns:
        A :class:`DossierGenerateResponse` containing the dossier and verification metadata.
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
        expiry_minutes=_TTL_MINUTES,
    )

    # Store dossier data in Redis so execute_loan can retrieve it
    r = get_redis()
    store_payload = {
        "cash_flow_id": dossier_id,
        "cash_flow_data": {
            "merchant_name": request.merchant_name or "Unknown",
            "merchant_id": request.merchant_id,
            "metrics": dossier.metrics.model_dump(),
            "recommendation": dossier.recommendation,
            "explainability_notes": dossier.explainability_notes,
            "anomaly_flags": dossier.anomaly_flags,
            "transaction_count": dossier.transaction_count,
            "avg_confidence": dossier.avg_confidence,
        },
    }
    ttl_seconds = _TTL_MINUTES * 60
    r.setex(f"phygital:qr:{token}", ttl_seconds, json.dumps(store_payload))

    # Generate a verification code with SETNX-style collision retry (max 3).
    vcode: str | None = None
    for attempt in range(3):
        candidate = generate_verification_code()
        vcode_key = f"phygital:vcode:{candidate}"
        if r.set(vcode_key, token, ex=ttl_seconds, nx=True):
            vcode = candidate
            break
        logger.warning(
            "Dossier verification code collision (attempt %d/3): %s", attempt + 1, candidate
        )
    if vcode is None:
        vcode = generate_verification_code()
        store_code_mapping(vcode, token, ttl_seconds)

    code_expires_at = datetime.fromtimestamp(expires_at_unix, tz=timezone.utc).isoformat()

    logger.info(
        "Verification code generated for dossier %s — code=%s, expires %s",
        dossier_id,
        vcode,
        code_expires_at,
    )

    return DossierGenerateResponse(
        dossier=dossier,
        verification_code=vcode,
        code_expires_at=code_expires_at,
    )


def execute_loan(
    token: str,
    officer_id: str,
    approved_amount: float,
    interest_rate: float,
    interview_notes: list[str],
) -> LoanExecutionResponse:
    """Execute an approved loan with LankaSign digital signature and NCGI guarantee.

    Verifies the QR token, retrieves the stored dossier data from Redis,
    computes the NCGI coverage, generates a contract ID and NCGI reference,
    simulates a LankaSign CA digital signature (SHA-256), and persists the
    executed loan record in Redis with a 30-day TTL.

    Args:
        token: The HMAC-signed QR verification token.
        officer_id: Bank officer identifier.
        approved_amount: Approved loan amount in LKR.
        interest_rate: Annual interest rate percentage.
        interview_notes: Officer's field interview notes.

    Returns:
        A :class:`LoanExecutionResponse` with contract and guarantee details.

    Raises:
        HTTPException(400): If the token is invalid/expired or the loan is
            not eligible for NCGI guarantee.
    """
    # a. Verify the QR token via the security module.
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=400, detail="Invalid or expired QR token.")

    # b. Retrieve stored dossier data from Redis (key pattern used by the QR flow).
    r = get_redis()
    raw: str | None = r.get(f"phygital:qr:{token}")
    if raw is None:
        raise HTTPException(status_code=400, detail="Token data not found in Redis (evicted or expired).")
    stored_data: dict = json.loads(raw)

    # c. Extract NCGI eligibility from stored dossier metrics.
    cash_flow_data = stored_data.get("cash_flow_data") or {}
    metrics = cash_flow_data.get("metrics") or {}
    ncgi_eligibility_percent: float = metrics.get("ncgi_eligibility_percent", 0)
    if ncgi_eligibility_percent == 0:
        raise HTTPException(status_code=400, detail="Loan not eligible for NCGI guarantee.")

    # Extract merchant name from stored data.
    merchant_name: str = cash_flow_data.get("merchant_name") or stored_data.get("merchant_name") or "Unknown Merchant"

    # d. Generate contract ID.
    contract_id = f"CTR-{uuid.uuid4().hex[:12].upper()}"

    # e. Generate NCGI guarantee reference.
    ncgi_guarantee_ref = f"NCGI-{datetime.now().year}-{uuid.uuid4().hex[:8].upper()}"

    # f. Simulate LankaSign CA digital signature.
    # WARNING: This is a SIMULATED LankaSign digital signature (SHA-256 hash).
    # Production MUST integrate with the real LankaSign CA API for legally
    # binding signatures per Electronic Transactions Act No. 19 of 2006.
    # TODO(security): Replace with actual CA-issued digital certificate.
    #    Simulates LankaSign CA digital signature per Sri Lanka Electronic Transactions Act No. 19 of 2006.
    timestamp = datetime.now(timezone.utc).isoformat()
    signing_payload = f"{contract_id}|{officer_id}|{approved_amount}|{timestamp}"
    lankasign_cert_hash = hashlib.sha256(signing_payload.encode("utf-8")).hexdigest()

    # g. Store the executed loan record in Redis with a 30-day TTL.
    loan_record = {
        "contract_id": contract_id,
        "lankasign_cert_hash": lankasign_cert_hash,
        "timestamp": timestamp,
        "ncgi_guarantee_ref": ncgi_guarantee_ref,
        "ncgi_coverage_percent": ncgi_eligibility_percent,
        "approved_amount": approved_amount,
        "interest_rate": interest_rate,
        "officer_id": officer_id,
        "merchant_name": merchant_name,
        "status": "APPROVED_AND_EXECUTED",
        "interview_notes": interview_notes,
    }
    if not store_with_ttl(
        key=f"loan_contract:{contract_id}",
        value=json.dumps(loan_record),
        ttl_seconds=30 * 24 * 3600,  # 30 days
    ):
        raise HTTPException(status_code=503, detail="Failed to persist loan contract. Please retry.")

    # Invalidate the QR token to prevent reuse (single-use token).
    invalidate_token(token)
    r.delete(f"phygital:qr:{token}")

    logger.info(
        "Loan executed: contract=%s, officer=%s, amount=%.2f, ncgi=%.0f%%",
        contract_id,
        officer_id,
        approved_amount,
        ncgi_eligibility_percent,
    )

    # h. Return the response.
    return LoanExecutionResponse(
        contract_id=contract_id,
        lankasign_cert_hash=lankasign_cert_hash,
        timestamp=timestamp,
        ncgi_guarantee_ref=ncgi_guarantee_ref,
        ncgi_coverage_percent=ncgi_eligibility_percent,
        approved_amount=approved_amount,
        interest_rate=interest_rate,
        officer_id=officer_id,
        merchant_name=merchant_name,
        status="APPROVED_AND_EXECUTED",
    )
