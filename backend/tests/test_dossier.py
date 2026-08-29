"""Tests for the dossier credit-scoring endpoints and scoring engine.

Covers POST /api/v1/dossier/calculate, POST /api/v1/dossier/generate,
and direct unit tests for the scoring_engine module (DSCR, EMI, NCGI).
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from app.services.scoring_engine import (
    compute_financial_metrics,
    derive_recommendation,
    generate_explainability_notes,
    _emi,
    _MONTHLY_RATE,
)

# ── Shared fixtures ──────────────────────────────────────────────────────────

CALCULATE_URL = "/api/v1/dossier/calculate"
GENERATE_URL = "/api/v1/dossier/generate"


def _txn(tx_type: str, amount: float, category: str, description: str,
         confidence: float = 0.85, lang: str = "si") -> dict:
    """Build a single ExtractedTransaction dict for request payloads."""
    return {
        "transaction_type": tx_type,
        "amount": amount,
        "category": category,
        "description": description,
        "confidence_score": confidence,
        "detected_language": lang,
    }


# Realistic Sri Lankan merchant transaction set (petty-shop in Kandy)
SAMPLE_TRANSACTIONS = [
    _txn("business_revenue", 85_000.0, "retail_sales",
         "Daily shop sales — rice, dhal, sugar", 0.92, "si"),
    _txn("business_revenue", 65_000.0, "retail_sales",
         "Weekly wholesale orders to local hotels", 0.88, "si"),
    _txn("business_expense", 50_000.0, "inventory",
         "Stock replenishment from Colombo distributor", 0.90, "si"),
    _txn("business_expense", 15_000.0, "transport",
         "Lorry hire for weekly goods delivery", 0.80, "si"),
    _txn("business_expense", 8_000.0, "utility",
         "Electricity and water bill", 0.85, "en"),
    _txn("personal_expense", 12_000.0, "household",
         "Monthly groceries and household items", 0.75, "si"),
]

# Defaults matching the schema defaults
LOAN_AMOUNT = 250_000.0
TENOR_MONTHS = 12


def _calculate_payload(transactions=None, loan_amount=LOAN_AMOUNT,
                       tenor=TENOR_MONTHS, merchant_name="Kandy Petty Shop",
                       merchant_id="MERCH-001"):
    return {
        "transactions": transactions if transactions is not None else SAMPLE_TRANSACTIONS,
        "requested_loan_amount": loan_amount,
        "loan_tenor_months": tenor,
        "merchant_name": merchant_name,
        "merchant_id": merchant_id,
    }


# ── POST /api/v1/dossier/calculate ───────────────────────────────────────────


class TestCalculateEndpoint:
    """Tests for the /calculate endpoint."""

    def test_calculate_happy_path(self, client) -> None:
        """Valid transaction list returns a complete credit dossier."""
        resp = client.post(CALCULATE_URL, json=_calculate_payload())

        assert resp.status_code == 200
        data = resp.json()

        # Top-level structure
        assert data["merchant_name"] == "Kandy Petty Shop"
        assert data["merchant_id"] == "MERCH-001"
        assert data["transaction_count"] == len(SAMPLE_TRANSACTIONS)
        assert 0.0 <= data["avg_confidence"] <= 1.0
        assert data["recommendation"] in ("APPROVE", "REVIEW", "DECLINE")

        # Metrics block
        m = data["metrics"]
        for key in ("monthly_revenue", "monthly_operating_expense",
                     "monthly_personal_drawings", "net_operating_income",
                     "monthly_debt_service", "dscr", "recommended_loan_ceiling",
                     "ncgi_eligibility_percent", "risk_score",
                     "operating_margin_percent"):
            assert key in m, f"Missing metric: {key}"

        # Lists
        assert isinstance(data["explainability_notes"], list)
        assert len(data["explainability_notes"]) > 0
        assert isinstance(data["anomaly_flags"], list)
        assert isinstance(data["field_interview_prompts"], list)
        assert len(data["field_interview_prompts"]) > 0

        # Each prompt is bilingual
        for prompt in data["field_interview_prompts"]:
            assert "english" in prompt
            assert "sinhala" in prompt

    def test_calculate_dscr_math(self, client) -> None:
        """DSCR must equal NOI / EMI for known inputs."""
        resp = client.post(CALCULATE_URL, json=_calculate_payload())
        assert resp.status_code == 200
        m = resp.json()["metrics"]

        # Revenue: 85k + 65k = 150k, Expense: 50k + 15k + 8k = 73k
        assert m["monthly_revenue"] == 150_000.0
        assert m["monthly_operating_expense"] == 73_000.0
        assert m["monthly_personal_drawings"] == 12_000.0
        assert m["net_operating_income"] == 77_000.0  # 150k - 73k

        # EMI at 14% p.a. on 250k over 12 months
        expected_emi = _emi(250_000.0, _MONTHLY_RATE, 12)
        assert abs(m["monthly_debt_service"] - round(expected_emi, 2)) < 0.01

        # DSCR = NOI / EMI
        expected_dscr = 77_000.0 / expected_emi
        assert abs(m["dscr"] - round(expected_dscr, 4)) < 0.001

    def test_calculate_recommendation_approve(self, client) -> None:
        """High DSCR (>=1.5) and risk >=60 → APPROVE."""
        resp = client.post(CALCULATE_URL, json=_calculate_payload())
        assert resp.status_code == 200
        data = resp.json()
        # With 150k revenue vs 73k expense on 250k loan, DSCR ≈ 3.48
        assert data["metrics"]["dscr"] >= 1.5
        assert data["metrics"]["risk_score"] >= 60
        assert data["recommendation"] == "APPROVE"

    def test_calculate_recommendation_review(self, client) -> None:
        """Moderate DSCR (1.0–1.5) with adequate risk → REVIEW."""
        # Lower revenue to push DSCR into the REVIEW band
        txns = [
            _txn("business_revenue", 25_000.0, "retail_sales",
                 "Modest daily sales", 0.85, "si"),
            _txn("business_revenue", 15_000.0, "retail_sales",
                 "Small wholesale income", 0.80, "si"),
            _txn("business_expense", 12_000.0, "inventory",
                 "Stock purchase", 0.85, "si"),
            _txn("personal_expense", 5_000.0, "household",
                 "Household expenses", 0.75, "si"),
        ]
        resp = client.post(CALCULATE_URL, json=_calculate_payload(
            transactions=txns, loan_amount=LOAN_AMOUNT))
        assert resp.status_code == 200
        data = resp.json()
        # NOI = 40k - 12k = 28k; DSCR ≈ 28k / 22.5k ≈ 1.24
        assert data["recommendation"] == "REVIEW"

    def test_calculate_recommendation_decline(self, client) -> None:
        """Low DSCR (<1.0) with poor risk score → DECLINE."""
        txns = [
            _txn("business_revenue", 5_000.0, "retail_sales",
                 "Very low daily sales", 0.60, "si"),
            _txn("business_revenue", 3_000.0, "retail_sales",
                 "Occasional income", 0.55, "si"),
            _txn("business_expense", 4_000.0, "inventory",
                 "Stock purchase", 0.70, "si"),
            _txn("personal_expense", 2_000.0, "household",
                 "Basic household", 0.50, "si"),
        ]
        resp = client.post(CALCULATE_URL, json=_calculate_payload(
            transactions=txns, loan_amount=LOAN_AMOUNT))
        assert resp.status_code == 200
        data = resp.json()
        # NOI = 8k - 4k = 4k; DSCR ≈ 4k / 22.5k ≈ 0.18
        assert data["metrics"]["dscr"] < 1.0
        assert data["recommendation"] == "DECLINE"

    def test_calculate_empty_transactions(self, client) -> None:
        """Empty transaction list must still return a valid (zeroed) response."""
        resp = client.post(CALCULATE_URL, json=_calculate_payload(
            transactions=[], merchant_name=None, merchant_id=None))
        assert resp.status_code == 200
        data = resp.json()

        m = data["metrics"]
        assert m["monthly_revenue"] == 0.0
        assert m["monthly_operating_expense"] == 0.0
        assert m["net_operating_income"] == 0.0
        assert m["dscr"] == 0.0
        assert m["risk_score"] == 0.0
        assert data["transaction_count"] == 0
        assert data["avg_confidence"] == 0.0
        assert data["recommendation"] == "DECLINE"
        assert isinstance(data["explainability_notes"], list)
        assert isinstance(data["field_interview_prompts"], list)


# ── POST /api/v1/dossier/generate ────────────────────────────────────────────


class TestGenerateEndpoint:
    """Tests for the /generate endpoint (dossier + QR token)."""

    def test_generate_happy_path(self, client) -> None:
        """Generate returns a full dossier plus qr_payload and qr_expires_at."""
        resp = client.post(GENERATE_URL, json=_calculate_payload())

        assert resp.status_code == 200
        data = resp.json()

        # Nested dossier
        assert "dossier" in data
        dossier = data["dossier"]
        assert dossier["merchant_name"] == "Kandy Petty Shop"
        assert "metrics" in dossier
        assert "recommendation" in dossier

        # QR metadata
        assert isinstance(data["qr_payload"], str)
        assert len(data["qr_payload"]) > 0
        assert isinstance(data["qr_expires_at"], str)

    def test_generate_qr_expires_in_72_hours(self, client) -> None:
        """qr_expires_at must be roughly 72 hours in the future."""
        before = datetime.now(tz=timezone.utc)
        resp = client.post(GENERATE_URL, json=_calculate_payload())
        after = datetime.now(tz=timezone.utc)

        assert resp.status_code == 200
        expires_at = datetime.fromisoformat(resp.json()["qr_expires_at"])

        # Must be timezone-aware and in the future
        assert expires_at.tzinfo is not None
        assert expires_at > before

        # Should be ~72 hours from now (allow ±5 minute tolerance)
        expected_low = before + timedelta(hours=71, minutes=55)
        expected_high = after + timedelta(hours=72, minutes=5)
        assert expected_low <= expires_at <= expected_high

    def test_generate_empty_transactions(self, client) -> None:
        """Empty transaction list must still produce a valid generate response."""
        resp = client.post(GENERATE_URL, json=_calculate_payload(
            transactions=[], merchant_name=None, merchant_id=None))
        assert resp.status_code == 200
        data = resp.json()

        assert data["dossier"]["recommendation"] == "DECLINE"
        assert isinstance(data["qr_payload"], str) and len(data["qr_payload"]) > 0
        assert isinstance(data["qr_expires_at"], str)


# ── Scoring engine unit tests ────────────────────────────────────────────────


class TestScoringEngine:
    """Direct tests for compute_financial_metrics and helpers."""

    @staticmethod
    def _make_transactions(revenue: float, expense: float,
                           personal: float = 0.0) -> list:
        """Build a minimal ExtractedTransaction list with known totals."""
        from app.api.v1.ingest.schemas import ExtractedTransaction

        txns = []
        if revenue > 0:
            txns.append(ExtractedTransaction(
                transaction_type="business_revenue", amount=revenue,
                category="retail_sales", description="Sales",
                confidence_score=0.9, detected_language="si",
            ))
        if expense > 0:
            txns.append(ExtractedTransaction(
                transaction_type="business_expense", amount=expense,
                category="inventory", description="Stock",
                confidence_score=0.85, detected_language="si",
            ))
        if personal > 0:
            txns.append(ExtractedTransaction(
                transaction_type="personal_expense", amount=personal,
                category="household", description="Household",
                confidence_score=0.8, detected_language="si",
            ))
        return txns

    def test_noi_calculation(self) -> None:
        """NOI = revenue − operating expense (personal drawings excluded)."""
        txns = self._make_transactions(revenue=150_000, expense=73_000, personal=12_000)
        metrics = compute_financial_metrics(txns, LOAN_AMOUNT, TENOR_MONTHS)

        assert metrics["monthly_revenue"] == 150_000.0
        assert metrics["monthly_operating_expense"] == 73_000.0
        assert metrics["monthly_personal_drawings"] == 12_000.0
        assert metrics["net_operating_income"] == 77_000.0

    def test_emi_calculation_14_percent_250k_12_months(self) -> None:
        """EMI at 14% p.a. for 250k over 12 months must be correct."""
        emi = _emi(250_000.0, _MONTHLY_RATE, 12)

        # Manual calculation: P=250k, r=0.14/12, n=12
        r = 0.14 / 12
        factor = (1 + r) ** 12
        expected = 250_000 * r * factor / (factor - 1)

        assert abs(emi - expected) < 0.01
        # Roughly 22,500 per month
        assert 22_000 < emi < 23_000

    def test_emi_zero_principal(self) -> None:
        """Zero principal must yield zero EMI."""
        assert _emi(0.0, _MONTHLY_RATE, 12) == 0.0

    def test_emi_zero_tenor(self) -> None:
        """Zero tenor must yield zero EMI."""
        assert _emi(250_000.0, _MONTHLY_RATE, 0) == 0.0

    def test_ncgi_eligibility_high_dscr(self) -> None:
        """DSCR >= 1.5 → NCGI eligibility = 80%."""
        # NOI = 100k, loan EMI ≈ 22.5k → DSCR ≈ 4.44
        txns = self._make_transactions(revenue=150_000, expense=50_000)
        metrics = compute_financial_metrics(txns, LOAN_AMOUNT, TENOR_MONTHS)
        assert metrics["dscr"] >= 1.5
        assert metrics["ncgi_eligibility_percent"] == 80.0

    def test_ncgi_eligibility_mid_dscr(self) -> None:
        """1.25 <= DSCR < 1.5 → NCGI eligibility = 75%."""
        # Need DSCR in [1.25, 1.5)
        # EMI ≈ 22,503.74 → need NOI in [28129.68, 33755.61)
        # revenue - expense → try 36k rev, 6k exp → NOI = 30k, DSCR ≈ 1.33
        txns = self._make_transactions(revenue=36_000, expense=6_000)
        metrics = compute_financial_metrics(txns, LOAN_AMOUNT, TENOR_MONTHS)
        assert 1.25 <= metrics["dscr"] < 1.5, f"DSCR was {metrics['dscr']}"
        assert metrics["ncgi_eligibility_percent"] == 75.0

    def test_ncgi_eligibility_low_dscr(self) -> None:
        """DSCR < 1.25 → NCGI eligibility = 0%."""
        # NOI = 10k, DSCR ≈ 0.44
        txns = self._make_transactions(revenue=20_000, expense=10_000)
        metrics = compute_financial_metrics(txns, LOAN_AMOUNT, TENOR_MONTHS)
        assert metrics["dscr"] < 1.25
        assert metrics["ncgi_eligibility_percent"] == 0.0

    def test_derive_recommendation_approve(self) -> None:
        """DSCR >= 1.5 and risk >= 60 → APPROVE."""
        metrics = {"dscr": 2.0, "risk_score": 70}
        assert derive_recommendation(metrics) == "APPROVE"

    def test_derive_recommendation_review(self) -> None:
        """DSCR >= 1.0 and risk >= 40 → REVIEW."""
        metrics = {"dscr": 1.2, "risk_score": 50}
        assert derive_recommendation(metrics) == "REVIEW"

    def test_derive_recommendation_decline(self) -> None:
        """DSCR < 1.0 or risk < 40 → DECLINE."""
        metrics = {"dscr": 0.5, "risk_score": 20}
        assert derive_recommendation(metrics) == "DECLINE"

    def test_compute_metrics_empty_transactions(self) -> None:
        """Empty list must produce zero-valued revenue/NOI metrics without error."""
        metrics = compute_financial_metrics([], LOAN_AMOUNT, TENOR_MONTHS)
        assert metrics["monthly_revenue"] == 0.0
        assert metrics["monthly_operating_expense"] == 0.0
        assert metrics["net_operating_income"] == 0.0
        # EMI is derived from the requested loan, not transactions
        expected_emi = _emi(LOAN_AMOUNT, _MONTHLY_RATE, TENOR_MONTHS)
        assert abs(metrics["monthly_debt_service"] - round(expected_emi, 2)) < 0.01
        assert metrics["dscr"] == 0.0  # NOI=0 → DSCR=0
        assert metrics["risk_score"] == 0.0
        assert metrics["ncgi_eligibility_percent"] == 0.0


# ── Binithi's Harvest Traders — NCGI Liya Shakthi E2E ───────────────────────


class TestBinithiHarvestTraders:
    """End-to-end scoring tests for the Binithi's Harvest Traders demo persona.

    Verifies NCGI Liya Shakthi 80% guarantee for women-owned agri-SMEs and
    the agricultural triangulation hints produced by the explainability engine.
    """

    @staticmethod
    def _binithi_transactions():
        """Build ExtractedTransaction objects for Binithi's Harvest Traders."""
        from app.api.v1.ingest.schemas import ExtractedTransaction
        return [
            ExtractedTransaction(
                transaction_type="business_revenue", amount=15000.0,
                category="agricultural_sale",
                description="Harvest sales - 50 kilos paddy",
                confidence_score=0.88, detected_language="singlish",
            ),
            ExtractedTransaction(
                transaction_type="business_expense", amount=2000.0,
                category="transport",
                description="Lorry transport for harvest delivery",
                confidence_score=0.85, detected_language="singlish",
            ),
            ExtractedTransaction(
                transaction_type="personal_expense", amount=3500.0,
                category="household",
                description="Household groceries - gedara kema",
                confidence_score=0.75, detected_language="singlish",
            ),
        ]

    def test_binithi_ncgi_liya_shakthi_80_percent(self) -> None:
        """Female-owned agri-SME must qualify for NCGI Liya Shakthi 80% guarantee."""
        txns = self._binithi_transactions()
        metrics = compute_financial_metrics(
            txns, 100_000, 12, owner_demographics={"female_owned": True}
        )

        assert metrics["monthly_revenue"] == 15000.0
        assert metrics["monthly_operating_expense"] == 2000.0
        assert metrics["monthly_personal_drawings"] == 3500.0
        assert metrics["net_operating_income"] == 13000.0
        assert metrics["ncgi_eligibility_percent"] == 80.0  # Liya Shakthi

    def test_binithi_explainability_triangulation_hints(self) -> None:
        """Agricultural + Liya Shakthi notes must appear as first triangulation hints."""
        txns = self._binithi_transactions()
        metrics = compute_financial_metrics(
            txns, 100_000, 12, owner_demographics={"female_owned": True}
        )
        notes = generate_explainability_notes(
            metrics, txns, owner_demographics={"female_owned": True}
        )

        assert len(notes) >= 2
        notes_lower = [n.lower() for n in notes]
        assert any("agricultural" in n for n in notes_lower), (
            "Expected an agricultural supply-cycle note"
        )
        assert any("liya shakthi" in n or "women-owned" in n for n in notes_lower), (
            "Expected an NCGI Liya Shakthi / women-owned note"
        )
