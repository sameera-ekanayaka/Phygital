"""Pydantic v2 schemas for the OCR processing endpoint."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OcrProcessRequest(BaseModel):
    """Request body for the mock OCR processing endpoint."""

    image_url: str = Field(..., description="Public URL of the ledger image to process.")


class CashFlowLineItem(BaseModel):
    """A single revenue or expense line in the cash-flow statement."""

    description: str = Field(..., description="Human-readable label for this line item.")
    amount: float = Field(..., ge=0, description="Amount in local currency (LKR).")


class CashFlowStatement(BaseModel):
    """Structured cash-flow statement extracted from the ledger image."""

    period: str = Field(..., description="Date range covered by the statement.")
    currency: str = Field("LKR", description="ISO 4217 currency code.")
    business_name: str = Field(..., description="Name of the business identified from the ledger.")
    revenue: list[CashFlowLineItem] = Field(default_factory=list)
    expenses: list[CashFlowLineItem] = Field(default_factory=list)
    net_cash_flow: float = Field(..., description="Revenue minus expenses.")
    confidence_score: float = Field(..., ge=0, le=1, description="Model confidence in extraction accuracy.")


class OcrProcessResponse(BaseModel):
    """Response returned after OCR processing completes."""

    request_id: UUID = Field(..., description="Unique identifier for this OCR request.")
    status: str = Field("completed", description="Processing status.")
    cash_flow_statement: CashFlowStatement
    processed_at: datetime = Field(..., description="ISO 8601 timestamp of completion.")
