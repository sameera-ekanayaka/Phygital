"""Pydantic schemas for the ingest upload endpoint.

Defines the structured extraction output models and the API response envelope.
"""

from datetime import datetime
from typing import List, Literal
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

    ai_extraction: "IngestExtractionResponse | None" = None
    """Day-2 AI translation pipeline extraction results, if available."""

    processed_at: datetime
    """UTC timestamp when processing completed."""


# ── Day-2 AI Translation Pipeline Schemas ────────────────────────────────────


class ExtractedTransaction(BaseModel):
    """A single financial transaction parsed from trilingual raw text."""

    transaction_type: Literal["business_revenue", "business_expense", "personal_expense"]
    """High-level classification of the transaction."""

    amount: float
    """Transaction amount in LKR."""

    category: str
    """Fine-grained category (e.g., inventory, sales, transport, utility, household)."""

    description: str
    """Human-readable description of the transaction."""

    confidence_score: float = Field(ge=0.0, le=1.0)
    """Model confidence that this transaction was correctly extracted (0.0–1.0)."""

    detected_language: Literal["si", "ta", "en", "singlish"]
    """Language detected for the source text that produced this transaction."""


class IngestExtractionResponse(BaseModel):
    """Structured extraction result from the Day-2 AI translation pipeline."""

    transactions: List[ExtractedTransaction] = []
    """All financial transactions parsed from the input."""

    raw_transcript: str = ""
    """The original raw transcript / OCR text that was parsed."""

    processing_time_ms: float = 0.0
    """Wall-clock time in milliseconds for the extraction call."""

    triangulation_hints: List[str] = []
    """Contextual hints for downstream fraud-detection / cross-referencing."""
