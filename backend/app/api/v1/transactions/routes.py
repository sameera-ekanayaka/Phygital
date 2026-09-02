"""Transaction session routes — summary, code generation, and session clearing.

All endpoints require borrower authentication via ``get_current_borrower``.
Rate limits follow the same slowapi pattern used across the application.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.v1.transactions.schemas import (
    GenerateCodeResponse,
    TransactionSummaryResponse,
)
from app.api.v1.transactions.service import (
    clear_session,
    generate_session_code,
    get_session_summary,
)
from app.core.auth import get_current_borrower
from app.core.limiter import limiter
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["transactions"])


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/summary", response_model=TransactionSummaryResponse)
async def summary(
    current_user: dict = Depends(get_current_borrower),
) -> TransactionSummaryResponse:
    """Return an aggregated summary of the borrower's transaction session.

    If no transactions exist yet the response contains ``transaction_count=0``
    with zeroed totals.

    Raises:
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]
    return get_session_summary(borrower_id)


@router.post("/generate-code", response_model=GenerateCodeResponse)
@limiter.limit("5/minute")
async def generate_code(
    request: Request,
    current_user: dict = Depends(get_current_borrower),
) -> GenerateCodeResponse:
    """Generate a verification code for the borrower's accumulated session.

    The code encodes all transactions collected so far and can be shared
    with a bank officer for credit assessment.

    Raises:
        HTTPException: 400 if no transactions exist in the session.
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]

    # Look up the borrower's gender to build owner_demographics
    owner_demographics: dict | None = None
    try:
        client = get_redis()
        raw = client.get(f"phygital:borrower:{borrower_id}")
        if raw:
            record = json.loads(raw)
            gender = record.get("gender", "unknown")
            demographics: dict = {}
            if gender == "female":
                demographics["female_owned"] = True
            if record.get("liya_shakthi_member", False):
                demographics["liya_shakthi_claimed"] = True
            if demographics:
                owner_demographics = demographics
    except Exception:
        logger.exception("Failed to fetch borrower profile for gender detection")

    try:
        return generate_session_code(borrower_id, owner_demographics=owner_demographics)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.delete("/session")
async def clear(
    current_user: dict = Depends(get_current_borrower),
) -> dict:
    """Clear all transactions from the borrower's session.

    Returns:
        A confirmation message.

    Raises:
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]
    clear_session(borrower_id)
    return {"message": "Session cleared"}
