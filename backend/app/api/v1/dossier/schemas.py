"""Pydantic request and response schemas for the dossier generation endpoint.

Defines the credit-dossier payload structure including financial metrics,
explainability notes, anomaly flags, and the signed QR verification token.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.api.v1.ingest.schemas import ExtractedTransaction


# ── Requests ─────────────────────────────────────────────────────────────────


class DossierCalculateRequest(BaseModel):
    """Input payload for the /calculate endpoint (no QR generation)."""

    transactions: List[ExtractedTransaction]
    requested_loan_amount: float = 250_000.0
    loan_tenor_months: int = 12
    merchant_name: Optional[str] = None
    merchant_id: Optional[str] = None


class DossierGenerateRequest(BaseModel):
    """Input payload for the /generate endpoint (includes QR token)."""

    transactions: List[ExtractedTransaction]
    requested_loan_amount: float = 250_000.0
    loan_tenor_months: int = 12
    merchant_name: Optional[str] = None
    merchant_id: Optional[str] = None


# ── Shared value objects ─────────────────────────────────────────────────────


class FinancialMetrics(BaseModel):
    """Key financial ratios derived from the transaction set."""

    monthly_revenue: float
    monthly_operating_expense: float
    monthly_personal_drawings: float
    net_operating_income: float
    monthly_debt_service: float
    dscr: float = Field(description="Debt Service Coverage Ratio (NOI / EMI)")
    recommended_loan_ceiling: float = Field(description="Maximum advisable loan in LKR")
    ncgi_eligibility_percent: float = Field(
        description="NCGI guarantee coverage: 0, 75, or 80 percent"
    )
    risk_score: float = Field(ge=0, le=100, description="Composite risk score 0-100 (higher = better)")
    operating_margin_percent: float


class FieldInterviewPrompt(BaseModel):
    """A bilingual verification question for the field officer."""

    english: str
    sinhala: str


# ── Responses ────────────────────────────────────────────────────────────────


class CreditDossierResponse(BaseModel):
    """Complete credit dossier returned by the /calculate endpoint."""

    merchant_name: Optional[str] = None
    merchant_id: Optional[str] = None
    metrics: FinancialMetrics
    explainability_notes: List[str]
    anomaly_flags: List[str]
    field_interview_prompts: List[FieldInterviewPrompt]
    transaction_count: int
    avg_confidence: float = Field(ge=0.0, le=1.0)
    recommendation: Literal["APPROVE", "REVIEW", "DECLINE"]


class DossierGenerateResponse(BaseModel):
    """Dossier plus a 72-hour HMAC-signed QR payload for audit-trail linking."""

    dossier: CreditDossierResponse
    qr_payload: str = Field(description="Signed token (opaque to client) for the QR code")
    qr_expires_at: str = Field(description="ISO-8601 UTC expiry timestamp (72 hours)")
