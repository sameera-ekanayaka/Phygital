"""Pydantic schemas for transaction session accumulation.

Defines the per-item record, the aggregated session summary, and the
verification-code generation response returned to the borrower app.
"""

from pydantic import BaseModel, Field


class TransactionSessionItem(BaseModel):
    """A single transaction record stored in the borrower's session list."""

    request_id: str = Field(..., description="UUID of the original ingest request.")
    raw_text: str = Field(..., description="Raw OCR / transcription text for this transaction.")
    structured_data: dict | None = Field(
        default=None,
        description="Structured extraction payload (may be None if extraction failed).",
    )
    processed_at: str = Field(..., description="ISO 8601 timestamp when this item was processed.")


class TransactionSummaryResponse(BaseModel):
    """Aggregated summary of all transactions in the borrower's session."""

    session_id: str = Field(..., description="Borrower identifier for this session.")
    transaction_count: int = Field(..., description="Total number of items in the session.")
    total_revenue: float = Field(default=0.0, description="Sum of all business_revenue amounts.")
    total_expenses: float = Field(default=0.0, description="Sum of all business_expense amounts.")
    total_personal: float = Field(default=0.0, description="Sum of all personal_expense amounts.")
    business_name: str = Field(default="", description="Detected business name from the first item that has one.")
    items: list[TransactionSessionItem] = Field(default_factory=list, description="Individual session items.")


class GenerateCodeResponse(BaseModel):
    """Response returned when a verification code is generated for the session."""

    verification_code: str = Field(..., description="Human-readable verification code (e.g. PHYG-A3F8-K9M2).")
    token: str = Field(..., description="HMAC-signed verification token.")
    expires_at: str = Field(..., description="ISO 8601 timestamp when the token expires.")
