"""Shared transaction schema used by ingest, dossier, and scoring modules."""

from typing import Literal

from pydantic import BaseModel, Field


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
