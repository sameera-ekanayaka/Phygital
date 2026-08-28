"""Tests for the ingest upload endpoint.

Mocks AI engine functions to verify endpoint behavior without
making real API calls to Groq or Google Gemini.
"""

from unittest.mock import AsyncMock, patch
import io

import pytest


# Mock structured extraction response
MOCK_EXTRACTION = {
    "business_revenue": [
        {"amount": 50000.0, "category": "retail_sales", "description": "Daily shop sales", "source_confidence": 0.9}
    ],
    "business_expense": [
        {"amount": 20000.0, "category": "inventory", "description": "Stock purchase", "source_confidence": 0.85}
    ],
    "personal_expense": [
        {"amount": 5000.0, "category": "household", "description": "Groceries", "source_confidence": 0.7}
    ],
    "currency": "LKR",
    "period": "2026-08-01 to 2026-08-28",
    "business_name": "Test Shop",
    "overall_confidence": 0.82,
}


@patch("app.api.v1.ingest.service.extract_structured_data", new_callable=AsyncMock)
@patch("app.api.v1.ingest.service.extract_text_from_image", new_callable=AsyncMock)
def test_upload_with_image(mock_ocr, mock_extract, client):
    """Upload a single image file and verify structured extraction response."""
    mock_ocr.return_value = "Daily sales: 50000 LKR\nStock purchase: 20000 LKR"
    mock_extract.return_value = MOCK_EXTRACTION

    # Create a small fake PNG file (1x1 pixel)
    fake_image = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
    fake_image.name = "ledger.png"

    response = client.post(
        "/api/v1/ingest/upload",
        files=[("files", ("ledger.png", fake_image, "image/png"))],
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["request_id"]  # UUID present
    assert data["raw_text"]  # Non-empty
    assert data["structured_data"] is not None
    assert data["structured_data"]["business_revenue"][0]["amount"] == 50000.0
    assert data["structured_data"]["currency"] == "LKR"
    assert data["processed_at"]

    mock_ocr.assert_called_once()
    mock_extract.assert_called_once()


@patch("app.api.v1.ingest.service.extract_structured_data", new_callable=AsyncMock)
def test_upload_with_text_only(mock_extract, client):
    """Submit only text notes without any files."""
    mock_extract.return_value = MOCK_EXTRACTION

    response = client.post(
        "/api/v1/ingest/upload",
        data={"notes": "Today sold goods worth 50000 rupees, bought stock for 20000"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert "50000" in data["raw_text"]
    assert data["structured_data"] is not None

    mock_extract.assert_called_once()


@patch("app.api.v1.ingest.service.extract_structured_data", new_callable=AsyncMock)
@patch("app.api.v1.ingest.service.transcribe_audio", new_callable=AsyncMock)
def test_upload_with_audio(mock_transcribe, mock_extract, client):
    """Upload an audio file and verify transcription is triggered."""
    mock_transcribe.return_value = "I sold items worth fifty thousand rupees today"
    mock_extract.return_value = MOCK_EXTRACTION

    fake_audio = io.BytesIO(b"\x00" * 200)
    fake_audio.name = "voice.webm"

    response = client.post(
        "/api/v1/ingest/upload",
        files=[("files", ("voice.webm", fake_audio, "audio/webm"))],
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert "fifty thousand" in data["raw_text"]

    mock_transcribe.assert_called_once()
    mock_extract.assert_called_once()


def test_upload_no_files_no_notes(client):
    """Submit with no files and no notes — should return empty result."""
    response = client.post(
        "/api/v1/ingest/upload",
        data={"notes": ""},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["raw_text"] == ""
    assert data["structured_data"] is None
