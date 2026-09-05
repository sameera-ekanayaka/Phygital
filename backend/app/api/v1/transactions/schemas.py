"""Pydantic schemas for transaction logging and session accumulation.

Defines the per-item record, the aggregated session summary, and the
verification-code generation response returned to the borrower app, plus
request/response models for the daily manual transaction log.
"""

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator
from app.core.validation import validate_transaction_amount


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


class TransactionCreateRequest(BaseModel):
    """Request body for creating a manual transaction."""

    amount: float = Field(..., gt=0, le=100_000_000, description="Transaction amount in LKR.")
    transaction_type: Literal["business_revenue", "business_expense", "personal_expense"] = Field(
        ..., description="High-level classification."
    )
    category: str = Field(..., min_length=1, max_length=50, description="Fine-grained category (e.g., sales, inventory, food).")
    description: str = Field(..., min_length=1, max_length=500, description="Brief note about the transaction.")
    notes: str | None = Field(default=None, max_length=1000, description="Optional additional notes.")

    @field_validator("amount")
    @classmethod
    def check_amount(cls, v: float) -> float:
        return validate_transaction_amount(v)

    @field_validator("category", "description")
    @classmethod
    def strip_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field cannot be empty.")
        return v


class TransactionUpdateRequest(BaseModel):
    """Partial update for an existing transaction."""

    amount: float | None = Field(default=None, gt=0, le=100_000_000, description="Transaction amount in LKR.")
    transaction_type: Literal["business_revenue", "business_expense", "personal_expense"] | None = Field(
        default=None
    )
    category: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("amount")
    @classmethod
    def check_amount(cls, v: float | None) -> float | None:
        if v is None:
            return None
        return validate_transaction_amount(v)

    @field_validator("category", "description")
    @classmethod
    def strip_text(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Field cannot be empty if provided.")
        return v


class TransactionRecord(BaseModel):
    """A single transaction stored in the borrower's hash."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="UUID of this transaction.")
    amount: float = Field(..., description="Transaction amount in LKR.")
    transaction_type: Literal["business_revenue", "business_expense", "personal_expense"] = Field(...)
    category: str = Field(...)
    description: str = Field(...)
    notes: str | None = Field(default=None)
    source: Literal["manual", "ai_upload"] = Field(...)
    confidence_score: float = Field(
        default=0.85,
        ge=0.0,
        le=1.0,
        validation_alias=AliasChoices("confidence_score", "source_confidence"),
    )
    created_at: str = Field(..., description="ISO 8601 timestamp when this transaction was created.")


class TransactionListResponse(BaseModel):
    """Response for listing transactions with aggregated totals."""

    items: list[TransactionRecord] = Field(default_factory=list)
    total_count: int = Field(default=0)
    total_revenue: float = Field(default=0.0)
    total_expenses: float = Field(default=0.0)
    total_personal: float = Field(default=0.0)
    net_income: float = Field(default=0.0)


class MonthlySummaryItem(BaseModel):
    """Aggregated totals for a single month."""

    month: str = Field(..., description="Month in YYYY-MM format.")
    revenue: float = Field(default=0.0)
    expenses: float = Field(default=0.0)
    personal: float = Field(default=0.0)
    net_income: float = Field(default=0.0)
    count: int = Field(default=0)


class MonthlySummaryResponse(BaseModel):
    """Monthly breakdown of transaction totals."""

    months: list[MonthlySummaryItem] = Field(default_factory=list)
