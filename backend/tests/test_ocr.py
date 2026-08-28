"""Tests for the OCR processing endpoint."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1.ocr.schemas import (
    CashFlowLineItem,
    CashFlowStatement,
    OcrProcessResponse,
)

OCR_URL = "/api/v1/ocr/process"


def _mock_cash_flow_response() -> OcrProcessResponse:
    """Build a realistic mock cash-flow response for testing."""
    revenue = [
        CashFlowLineItem(description="Daily retail sales", amount=185_000.00),
        CashFlowLineItem(description="Wholesale orders", amount=72_000.00),
    ]
    expenses = [
        CashFlowLineItem(description="Supplier payments", amount=95_000.00),
        CashFlowLineItem(description="Rent & utilities", amount=28_000.00),
    ]
    total_revenue = sum(item.amount for item in revenue)
    total_expenses = sum(item.amount for item in expenses)

    return OcrProcessResponse(
        request_id=uuid.uuid4(),
        status="completed",
        cash_flow_statement=CashFlowStatement(
            period="2026-08-01 to 2026-08-28",
            currency="LKR",
            business_name="Sample Grocery - Kandy",
            revenue=revenue,
            expenses=expenses,
            net_cash_flow=total_revenue - total_expenses,
            confidence_score=0.87,
        ),
        processed_at=datetime.now(tz=timezone.utc),
    )


@pytest.fixture()
def mock_process_image():
    """Mock the OCR process_image service function."""
    with patch("app.api.v1.ocr.routes.process_image", new_callable=AsyncMock) as mock:
        mock.return_value = _mock_cash_flow_response()
        yield mock


def test_ocr_process_success(client, mock_process_image) -> None:
    """Valid image_url must return 200 with a complete cash-flow statement."""
    resp = client.post(OCR_URL, json={"image_url": "https://example.com/ledger.jpg"})

    assert resp.status_code == 200
    data = resp.json()

    # Top-level fields
    assert "request_id" in data
    assert data["status"] == "completed"
    assert "cash_flow_statement" in data
    assert "processed_at" in data

    # Cash-flow statement structure
    cfs = data["cash_flow_statement"]
    assert "revenue" in cfs
    assert "expenses" in cfs
    assert "net_cash_flow" in cfs
    assert "confidence_score" in cfs
    assert isinstance(cfs["revenue"], list)
    assert isinstance(cfs["expenses"], list)
    assert len(cfs["revenue"]) > 0
    assert len(cfs["expenses"]) > 0


def test_ocr_response_matches_schema(client, mock_process_image) -> None:
    """Response must contain all fields declared in OcrProcessResponse."""
    resp = client.post(OCR_URL, json={"image_url": "https://example.com/receipt.png"})
    data = resp.json()

    # request_id is a valid UUID string
    assert len(data["request_id"]) == 36  # 8-4-4-4-12

    # status is a non-empty string
    assert isinstance(data["status"], str) and data["status"]

    # cash_flow_statement has the required nested structure
    cfs = data["cash_flow_statement"]
    assert "period" in cfs
    assert "currency" in cfs
    assert "business_name" in cfs
    assert isinstance(cfs["net_cash_flow"], (int, float))
    assert 0.0 <= cfs["confidence_score"] <= 1.0

    # revenue / expenses line items each have description + amount
    for item in cfs["revenue"] + cfs["expenses"]:
        assert "description" in item
        assert "amount" in item
        assert item["amount"] >= 0

    # processed_at is an ISO-8601 datetime string
    assert "T" in data["processed_at"]


def test_ocr_missing_image_url_returns_422(client) -> None:
    """Omitting the required image_url field must yield 422."""
    resp = client.post(OCR_URL, json={})
    assert resp.status_code == 422
