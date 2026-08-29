"""Pydantic v2 schemas for verification code generation and token verification."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class QrGenerateRequest(BaseModel):
    """Request body for verification code generation."""

    cash_flow_id: UUID = Field(..., description="UUID of the cash-flow record to encode.")
    expiry_minutes: int = Field(
        default=4320,
        ge=1,
        description="Minutes until the verification code / token expires (default 72 hours).",
    )


class VerificationGenerateResponse(BaseModel):
    """Response returned after successful verification code generation."""

    verification_code: str = Field(..., description="Human-readable verification code (e.g. PHYG-A3F8-K9M2).")
    token: str = Field(..., description="HMAC-signed verification token.")
    expires_at: datetime = Field(..., description="ISO 8601 timestamp when the token expires.")


# Backward-compatible alias
QrGenerateResponse = VerificationGenerateResponse


class QrVerifyResponse(BaseModel):
    """Response returned when a token is successfully verified."""

    cash_flow_id: str = Field(..., description="UUID of the linked cash-flow record.")
    cash_flow_data: dict = Field(..., description="The full cash-flow JSON stored in Redis.")


class VerificationResolveResponse(BaseModel):
    """Response returned when a verification code is resolved — includes the HMAC token."""

    cash_flow_id: str = Field(..., description="UUID of the linked cash-flow record.")
    cash_flow_data: dict = Field(..., description="The full cash-flow JSON stored in Redis.")
    token: str = Field(..., description="HMAC-signed token for downstream dossier navigation.")


class QrVerifyErrorResponse(BaseModel):
    """Response body when a token is expired or not found."""

    detail: str = Field(..., description="Human-readable error message.")
