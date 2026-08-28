"""OCR processing service — Google Gemini-powered text extraction.

Uses the Gemini 2.0 Flash multimodal model to extract text from uploaded
ledger images, then passes the raw text through structured extraction to
produce a cash-flow statement.
"""

import logging
import uuid
from datetime import datetime, timezone

import httpx

from app.api.v1.ocr.schemas import (
    CashFlowLineItem,
    CashFlowStatement,
    OcrProcessResponse,
)
from app.services.ai_engine import extract_structured_data, extract_text_from_image

logger = logging.getLogger(__name__)


async def process_image(image_url: str) -> OcrProcessResponse:
    """Extract text from an image URL and produce a cash-flow statement.

    Downloads the image from the given URL, runs OCR via Google Gemini,
    then extracts structured financial data via Groq Llama.

    Args:
        image_url: Public URL of the image to process.

    Returns:
        OcrProcessResponse with the extracted cash-flow statement.

    Raises:
        httpx.HTTPStatusError: If the image URL returns a non-2xx status.
        fastapi.HTTPException: If AI processing fails.
    """
    logger.info("Processing OCR for image: %s", image_url)

    # Fetch the image from the provided URL
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(image_url)
        response.raise_for_status()
        image_bytes = response.content

    # Extract text using Gemini OCR
    raw_text = await extract_text_from_image(image_bytes)
    logger.info("OCR extracted %d characters from image", len(raw_text))

    # Extract structured financial data
    structured = await extract_structured_data(raw_text)

    # Map to existing CashFlowStatement schema
    revenue = [
        CashFlowLineItem(description=item["description"], amount=item["amount"])
        for item in structured.get("business_revenue", [])
    ]
    expenses = [
        CashFlowLineItem(description=item["description"], amount=item["amount"])
        for item in structured.get("business_expense", [])
    ] + [
        CashFlowLineItem(description=item["description"], amount=item["amount"])
        for item in structured.get("personal_expense", [])
    ]

    total_revenue = sum(item.amount for item in revenue)
    total_expenses = sum(item.amount for item in expenses)

    cash_flow = CashFlowStatement(
        period=structured.get("period", "Unknown period"),
        currency=structured.get("currency", "LKR"),
        business_name=structured.get("business_name", "Unknown"),
        revenue=revenue,
        expenses=expenses,
        net_cash_flow=total_revenue - total_expenses,
        confidence_score=structured.get("overall_confidence", 0.0),
    )

    return OcrProcessResponse(
        request_id=uuid.uuid4(),
        status="completed",
        cash_flow_statement=cash_flow,
        processed_at=datetime.now(tz=timezone.utc),
    )
