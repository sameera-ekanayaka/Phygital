"""Pydantic schemas for borrower authentication and registration.

Defines request/response models for borrower onboarding, OTP verification,
login, and profile retrieval.
"""

from pydantic import BaseModel


# ── Registration ─────────────────────────────────────────────────────────────


class BorrowerRegisterRequest(BaseModel):
    """Request body for borrower self-registration."""

    name: str
    """Full name of the borrower."""

    phone: str
    """Sri Lankan mobile number (e.g., '0771234567')."""

    nic: str
    """National Identity Card number (e.g., '896543456V')."""

    password: str
    """Chosen password for the borrower account."""

    liya_shakthi_member: bool = False
    """Self-declared NCGI Liya Shakthi membership (women-owned micro-enterprises)."""


class BorrowerRegisterResponse(BaseModel):
    """Response returned after successful borrower registration."""

    borrower_id: str
    """Unique identifier derived from the hashed NIC."""

    message: str
    """Human-readable confirmation message."""

    otp_hint: str | None = None
    """OTP code included only when debug mode is active."""


# ── Login ────────────────────────────────────────────────────────────────────


class BorrowerLoginRequest(BaseModel):
    """Request body for borrower login via NIC or phone."""

    identifier: str
    """NIC or phone number used to identify the borrower."""

    password: str
    """Account password."""


class BorrowerLoginResponse(BaseModel):
    """Response returned after successful borrower login."""

    access_token: str
    """Signed JWT access token."""

    token_type: str = "bearer"
    """Token type — always 'bearer'."""

    borrower_name: str
    """Full name of the authenticated borrower."""


# ── OTP Verification ─────────────────────────────────────────────────────────


class OtpVerifyRequest(BaseModel):
    """Request body for OTP verification."""

    phone: str
    """Phone number the OTP was sent to."""

    otp_code: str
    """Six-digit OTP code entered by the borrower."""


class OtpVerifyResponse(BaseModel):
    """Response returned after OTP verification attempt."""

    verified: bool
    """Whether the OTP matched successfully."""

    message: str
    """Human-readable verification result."""


# ── Profile ──────────────────────────────────────────────────────────────────


class BorrowerProfileResponse(BaseModel):
    """Borrower profile summary returned by the /me endpoint."""

    name: str
    """Full name of the borrower."""

    phone: str
    """Registered mobile number."""

    nic_masked: str
    """Masked NIC showing first 3 characters and last character only."""

    gender: str
    """Gender detected from NIC ('male', 'female', or 'unknown')."""

    liya_shakthi_member: bool
    """Whether the borrower self-declared NCGI Liya Shakthi membership."""

    verified: bool
    """Whether the borrower has completed OTP verification."""
