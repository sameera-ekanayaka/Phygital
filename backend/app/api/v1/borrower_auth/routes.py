"""Borrower authentication routes — registration, OTP, login, and profile.

All endpoints are public except ``GET /me`` which requires a valid
borrower JWT.  Rate limits follow the same slowapi pattern used across
the application.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.v1.borrower_auth.schemas import (
    BorrowerLoginRequest,
    BorrowerLoginResponse,
    BorrowerProfileResponse,
    BorrowerRegisterRequest,
    BorrowerRegisterResponse,
    OtpVerifyRequest,
    OtpVerifyResponse,
)
from app.api.v1.borrower_auth.service import (
    get_borrower_profile,
    login_borrower,
    register_borrower,
    verify_otp,
)
from app.core.auth import get_current_user
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/borrower-auth", tags=["borrower-auth"])


# ── Public Endpoints ─────────────────────────────────────────────────────────


@router.post("/register", response_model=BorrowerRegisterResponse)
@limiter.limit("5/minute")
async def register(
    request: Request,
    data: BorrowerRegisterRequest,
) -> BorrowerRegisterResponse:
    """Register a new borrower with NIC, phone, and password.

    A mock OTP is generated and stored in Redis.  In debug mode the OTP
    is returned in the response body for local development convenience.

    Raises:
        HTTPException: 409 if the NIC is already registered.
    """
    try:
        return register_borrower(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@router.post("/verify-otp", response_model=OtpVerifyResponse)
@limiter.limit("10/minute")
async def verify_otp_endpoint(
    request: Request,
    data: OtpVerifyRequest,
) -> OtpVerifyResponse:
    """Verify the 6-digit OTP sent to the borrower's phone.

    On success the borrower account is marked as verified and eligible
    for login.

    Raises:
        HTTPException: 400 if verification fails unexpectedly.
    """
    return verify_otp(data.phone, data.otp_code)


@router.post("/login", response_model=BorrowerLoginResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    data: BorrowerLoginRequest,
) -> BorrowerLoginResponse:
    """Authenticate a borrower by NIC or phone and return a JWT.

    The borrower must have completed OTP verification before logging in.

    Raises:
        HTTPException: 401 on invalid credentials or unverified account.
    """
    try:
        return login_borrower(data.identifier, data.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )


# ── Authenticated Endpoint ───────────────────────────────────────────────────


@router.get("/me", response_model=BorrowerProfileResponse)
async def get_profile(
    current_user: dict = Depends(get_current_user),
) -> BorrowerProfileResponse:
    """Return the authenticated borrower's profile.

    Requires a valid JWT with ``role=borrower``.  Officer tokens are
    rejected with a 403 Forbidden response.

    Raises:
        HTTPException: 403 if the token role is not 'borrower'.
        HTTPException: 404 if the borrower profile does not exist.
    """
    if current_user.get("role") != "borrower":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to borrowers only.",
        )

    nic_hash = current_user["sub"]
    try:
        return get_borrower_profile(nic_hash)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
