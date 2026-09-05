"""Pydantic schemas for borrower authentication and registration.

Defines request/response models for borrower onboarding, OTP verification,
login, and profile retrieval.
"""

import re
from pydantic import BaseModel, Field, field_validator
from app.core.validation import validate_sri_lankan_nic, validate_sri_lankan_phone


# ── Registration ─────────────────────────────────────────────────────────────


class BorrowerRegisterRequest(BaseModel):
    """Request body for borrower self-registration."""

    name: str = Field(..., min_length=2, max_length=100, description="Full name of the borrower.")
    phone: str = Field(..., description="Sri Lankan mobile number (e.g., '0771234567').")
    nic: str = Field(..., description="National Identity Card number (e.g., '896543456V').")
    password: str = Field(..., min_length=6, max_length=128, description="Chosen password for the borrower account.")
    liya_shakthi_member: bool = False
    """Self-declared NCGI Liya Shakthi membership (women-owned micro-enterprises)."""

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        if not re.match(r"^[\w\s\.\'-]+$", v, re.UNICODE):
            raise ValueError("Full name contains invalid characters.")
        return v

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return validate_sri_lankan_phone(v)

    @field_validator("nic")
    @classmethod
    def check_nic(cls, v: str) -> str:
        canonical_nic, _ = validate_sri_lankan_nic(v)
        return canonical_nic


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

    identifier: str = Field(..., min_length=3, max_length=50, description="NIC or phone number used to identify the borrower.")
    password: str = Field(..., min_length=1, max_length=128, description="Account password.")

    @field_validator("identifier")
    @classmethod
    def check_identifier(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Identifier cannot be empty.")
        return v


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

    phone: str = Field(..., description="Phone number the OTP was sent to.")
    otp_code: str = Field(..., min_length=6, max_length=6, description="Six-digit OTP code entered by the borrower.")

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return validate_sri_lankan_phone(v)

    @field_validator("otp_code")
    @classmethod
    def check_otp(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP code must be exactly 6 numeric digits.")
        return v


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
