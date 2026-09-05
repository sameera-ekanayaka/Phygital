"""Transaction routes — CRUD, summary, code generation, and session clearing.

All endpoints require borrower authentication via ``get_current_borrower``.
Rate limits follow the same slowapi pattern used across the application.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.api.v1.transactions.schemas import (
    GenerateCodeResponse,
    MonthlySummaryResponse,
    TransactionCreateRequest,
    TransactionListResponse,
    TransactionRecord,
    TransactionSummaryResponse,
    TransactionUpdateRequest,
)
from app.api.v1.transactions.service import (
    add_transaction,
    clear_session,
    delete_transaction,
    generate_session_code,
    get_monthly_summary,
    get_session_summary,
    get_transaction,
    get_transactions,
    update_transaction,
)
from app.core.auth import get_current_borrower
from app.core.limiter import limiter
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["transactions"])


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post(
    "/",
    response_model=TransactionRecord,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def create_transaction(
    request: Request,
    data: TransactionCreateRequest,
    current_user: dict = Depends(get_current_borrower),
) -> TransactionRecord:
    """Create a new manual transaction for the authenticated borrower.

    Raises:
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]
    logger.info("Creating manual transaction for borrower=%s…", borrower_id[:12])
    return add_transaction(borrower_id, data)


@router.get("/", response_model=TransactionListResponse)
async def list_transactions(
    type: Optional[str] = Query(default=None, description="Filter by transaction_type"),
    month: Optional[str] = Query(default=None, description="Filter by YYYY-MM"),
    current_user: dict = Depends(get_current_borrower),
) -> TransactionListResponse:
    """List all transactions for the authenticated borrower with optional filters.

    Query params:
        type: Filter by transaction_type (business_revenue, business_expense, personal_expense).
        month: Filter by month in YYYY-MM format.

    Raises:
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]
    return get_transactions(borrower_id, txn_type=type, month=month)


@router.get("/monthly-summary", response_model=MonthlySummaryResponse)
async def monthly_summary(
    current_user: dict = Depends(get_current_borrower),
) -> MonthlySummaryResponse:
    """Return a monthly breakdown of the borrower's transactions.

    Raises:
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]
    return get_monthly_summary(borrower_id)


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


@router.post("/generate-report", response_model=GenerateCodeResponse)
@limiter.limit("5/minute")
async def generate_report(
    request: Request,
    current_user: dict = Depends(get_current_borrower),
) -> GenerateCodeResponse:
    """Alias for ``POST /generate-code`` — generates a verification report.

    Raises:
        HTTPException: 400 if no transactions exist in the session.
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]

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


# ── Parameterized routes (must come AFTER fixed-path endpoints) ──────────────


@router.get("/{txn_id}", response_model=TransactionRecord)
async def get_single_transaction(
    txn_id: str,
    current_user: dict = Depends(get_current_borrower),
) -> TransactionRecord:
    """Retrieve a single transaction by its ID.

    Raises:
        HTTPException: 404 if the transaction does not exist.
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]
    record = get_transaction(borrower_id, txn_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )
    return record


@router.put("/{txn_id}", response_model=TransactionRecord)
async def update_single_transaction(
    txn_id: str,
    data: TransactionUpdateRequest,
    current_user: dict = Depends(get_current_borrower),
) -> TransactionRecord:
    """Update an existing transaction with partial data.

    Raises:
        HTTPException: 404 if the transaction does not exist.
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]
    record = update_transaction(borrower_id, txn_id, data)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )
    return record


@router.delete("/{txn_id}")
async def delete_single_transaction(
    txn_id: str,
    current_user: dict = Depends(get_current_borrower),
) -> dict:
    """Delete a single transaction by its ID.

    Raises:
        HTTPException: 404 if the transaction does not exist.
        HTTPException: 403 if the token role is not 'borrower'.
    """
    borrower_id = current_user["sub"]
    deleted = delete_transaction(borrower_id, txn_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )
    return {"message": "Transaction deleted"}
