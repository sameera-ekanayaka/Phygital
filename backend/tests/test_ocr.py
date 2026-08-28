"""Tests for the OCR processing endpoint."""

from __future__ import annotations

import time

OCR_URL = "/api/v1/ocr/process"


def test_ocr_process_success(client) -> None:
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


def test_ocr_response_matches_schema(client) -> None:
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


def test_ocr_processing_takes_at_least_half_second(client) -> None:
    """The mock service injects a 0.5–1.5 s delay; verify the lower bound."""
    start = time.monotonic()
    resp = client.post(OCR_URL, json={"image_url": "https://example.com/slow.jpg"})
    elapsed = time.monotonic() - start

    assert resp.status_code == 200
    assert elapsed >= 0.5, f"Expected ≥ 0.5 s delay, got {elapsed:.3f} s"
