"""Verification code generation and token verification routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from starlette.requests import Request

from app.api.v1.qrcode.schemas import (
    QrGenerateRequest,
    QrVerifyResponse,
    VerificationGenerateResponse,
    VerificationResolveResponse,
)
from app.api.v1.qrcode.service import generate_verification, resolve_code, verify_token
from app.core.auth import get_current_officer
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/verification", tags=["verification"])


@router.post(
    "/generate",
    response_model=VerificationGenerateResponse,
    summary="Generate a verification code and HMAC token for a cash-flow record",
)
@limiter.limit("20/minute")
async def verification_generate(
    request: Request,
    payload: QrGenerateRequest,
    current_user: dict = Depends(get_current_officer),
) -> VerificationGenerateResponse:
    """Generate an HMAC-signed token and human-readable verification code linked to a cash-flow statement.

    The verification code can be typed in by a bank officer to retrieve the
    associated cash-flow data from Redis (if the token has not expired).

    Args:
        payload: JSON body with ``cash_flow_id`` and optional ``expiry_minutes``.

    Returns:
        The verification code, HMAC token string, and expiry timestamp.
    """
    logger.info("Verification generate requested — cash_flow_id=%s", payload.cash_flow_id)
    result = generate_verification(
        cash_flow_id=str(payload.cash_flow_id),
        expiry_minutes=payload.expiry_minutes,
    )
    return VerificationGenerateResponse(**result)


@router.get(
    "/resolve/{code}",
    response_model=VerificationResolveResponse,
    summary="Resolve a verification code to its cash-flow data and HMAC token",
    responses={410: {"description": "Verification code expired or invalid."}},
)
@limiter.limit("60/minute")
async def verification_resolve(
    request: Request,
    code: str,
    current_user: dict = Depends(get_current_officer),
) -> VerificationResolveResponse:
    """Look up a human-readable verification code and return the stored cash-flow JSON plus HMAC token.

    Args:
        code: The verification code (e.g. PHYG-A3F8-K9M2).

    Returns:
        The cash-flow record ID, full JSON payload, and HMAC token.

    Raises:
        HTTPException: 410 Gone if the code is expired or not found.
    """
    logger.info("Verification resolve requested — code=%s", code)
    token = resolve_code(code)

    if token is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Verification code expired or invalid. Please request a new one.",
        )

    data = verify_token(token)
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Underlying token expired or not found. Please request a new verification code.",
        )

    return VerificationResolveResponse(
        cash_flow_id=data.get("cash_flow_id", ""),
        cash_flow_data=data.get("cash_flow_data", {}),
        token=token,
    )


@router.get(
    "/verify/{token}",
    response_model=QrVerifyResponse,
    summary="Verify a token and return the linked cash-flow data",
    responses={410: {"description": "Token expired or not found."}},
)
@limiter.limit("60/minute")
async def qr_verify(
    request: Request,
    token: str,
    current_user: dict = Depends(get_current_officer),
) -> QrVerifyResponse:
    """Look up a verification token and return the stored cash-flow JSON.

    Args:
        token: The HMAC-signed token extracted from the verification URL.

    Returns:
        The cash-flow record ID and full JSON payload.

    Raises:
        HTTPException: 410 Gone if the token is expired or not found.
    """
    logger.info("Token verify requested — token=%s…", token[:16])
    data = verify_token(token)

    if data is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This token has expired or was never valid. Please request a new one.",
        )

    return QrVerifyResponse(
        cash_flow_id=data.get("cash_flow_id", ""),
        cash_flow_data=data.get("cash_flow_data", {}),
    )
