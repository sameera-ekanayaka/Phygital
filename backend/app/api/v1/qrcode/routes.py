"""QR code generation and verification routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from starlette.requests import Request

from app.api.v1.qrcode.schemas import (
    QrGenerateRequest,
    QrGenerateResponse,
    QrVerifyResponse,
)
from app.api.v1.qrcode.service import generate_qr, verify_token
from app.core.auth import get_current_user
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/qrcode", tags=["qrcode"])


@router.post(
    "/generate",
    response_model=QrGenerateResponse,
    summary="Generate a secure, expiring QR code for a cash-flow record",
)
@limiter.limit("20/minute")
async def qr_generate(
    request: Request,
    payload: QrGenerateRequest,
    current_user: dict = Depends(get_current_user),
) -> QrGenerateResponse:
    """Generate an HMAC-signed QR code linked to a cash-flow statement.

    The QR code encodes a verification URL that, when scanned, retrieves the
    associated cash-flow data from Redis (if the token has not expired).

    Args:
        payload: JSON body with ``cash_flow_id`` and optional ``expiry_minutes``.

    Returns:
        Base64-encoded QR PNG, the token string, expiry timestamp, and verify URL.
    """
    logger.info("QR generate requested — cash_flow_id=%s", payload.cash_flow_id)
    result = generate_qr(
        cash_flow_id=str(payload.cash_flow_id),
        expiry_minutes=payload.expiry_minutes,
    )
    return QrGenerateResponse(**result)


@router.get(
    "/verify/{token}",
    response_model=QrVerifyResponse,
    summary="Verify a QR token and return the linked cash-flow data",
    responses={410: {"description": "Token expired or not found."}},
)
@limiter.limit("60/minute")
async def qr_verify(
    request: Request,
    token: str,
    current_user: dict = Depends(get_current_user),
) -> QrVerifyResponse:
    """Look up a QR verification token and return the stored cash-flow JSON.

    Args:
        token: The HMAC-signed token extracted from the verification URL.

    Returns:
        The cash-flow record ID and full JSON payload.

    Raises:
        HTTPException: 410 Gone if the token is expired or not found.
    """
    logger.info("QR verify requested — token=%s…", token[:16])
    data = verify_token(token)

    if data is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This QR code has expired or was never valid. Please request a new one.",
        )

    return QrVerifyResponse(
        cash_flow_id=data.get("cash_flow_id", ""),
        cash_flow_data=data.get("cash_flow_data", {}),
    )
