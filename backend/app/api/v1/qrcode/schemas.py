"""Pydantic v2 schemas for QR code generation and verification."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class QrGenerateRequest(BaseModel):
    """Request body for QR code generation."""

    cash_flow_id: UUID = Field(..., description="UUID of the cash-flow record to encode.")
    expiry_minutes: int = Field(
        default=4320,
        ge=1,
        description="Minutes until the QR code / token expires (default 72 hours).",
    )


class QrGenerateResponse(BaseModel):
    """Response returned after successful QR code generation."""

    qr_code_base64: str = Field(..., description="Base64-encoded PNG image of the QR code.")
    token: str = Field(..., description="HMAC-signed verification token.")
    expires_at: datetime = Field(..., description="ISO 8601 timestamp when the token expires.")
    verify_url: str = Field(..., description="Public URL that the QR code encodes.")


class QrVerifyResponse(BaseModel):
    """Response returned when a token is successfully verified."""

    cash_flow_id: str = Field(..., description="UUID of the linked cash-flow record.")
    cash_flow_data: dict = Field(..., description="The full cash-flow JSON stored in Redis.")


class QrVerifyErrorResponse(BaseModel):
    """Response body when a token is expired or not found."""

    detail: str = Field(..., description="Human-readable error message.")
