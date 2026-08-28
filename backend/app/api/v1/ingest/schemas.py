"""Pydantic schemas for the ingest upload endpoint.

Defines the structured extraction output models and the API response envelope.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TransactionItem(BaseModel):
    """A single extracted financial transaction with confidence score."""

    amount: float
    """Transaction amount in the specified currency."""

    category: str
    """Classification category (e.g., retail_sales, inventory, household)."""

    description: str
    """Human-readable description of the transaction."""

    source_confidence: float = Field(ge=0.0, le=1.0)
    """Confidence that this transaction was correctly extracted (0.0–1.0)."""


class StructuredExtraction(BaseModel):
    """Categorized financial transactions extracted by the AI engine."""

    business_revenue: list[TransactionItem] = []
    """Income items attributed to the business."""

    business_expense: list[TransactionItem] = []
    """Costs attributed to business operations."""

    personal_expense: list[TransactionItem] = []
    """Costs attributed to personal/household spending."""

    currency: str = "LKR"
    """ISO currency code for all amounts."""

    period: str = ""
    """Detected accounting period (e.g., '2026-08-01 to 2026-08-28')."""

    business_name: str = ""
    """Detected business name, if any."""

    overall_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    """Overall confidence in the extraction quality (0.0–1.0)."""


class IngestResponse(BaseModel):
    """Response envelope for the ingest upload endpoint."""

    request_id: UUID
    """Unique identifier for this processing request."""

    status: str
    """Processing status: 'completed' or 'failed'."""

    raw_text: str
    """Concatenated raw text from all OCR/transcription outputs."""

    structured_data: StructuredExtraction | None = None
    """Structured financial data, or None if extraction failed."""

    processed_at: datetime
    """UTC timestamp when processing completed."""
