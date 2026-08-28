"""OCR processing service — mock implementation simulating Google Cloud Vision.

In production this module would call the Google Cloud Vision API (or AWS
Textract) to extract text from uploaded ledger images, then pass the raw
text through the trilingual NLP engine.  For the initial scaffold we return
a realistic, deterministic mock response so the full pipeline can be tested.
"""

import asyncio
import logging
import random
import uuid
from datetime import datetime, timezone

from app.api.v1.ocr.schemas import (
    CashFlowLineItem,
    CashFlowStatement,
    OcrProcessResponse,
)

logger = logging.getLogger(__name__)


def _build_mock_cash_flow() -> CashFlowStatement:
    """Generate a realistic mock cash-flow statement for a Sri Lankan SME."""
    revenue = [
        CashFlowLineItem(description="Daily retail sales", amount=185_000.00),
        CashFlowLineItem(description="Wholesale orders", amount=72_000.00),
    ]
    expenses = [
        CashFlowLineItem(description="Supplier payments", amount=95_000.00),
        CashFlowLineItem(description="Rent & utilities", amount=28_000.00),
        CashFlowLineItem(description="Transport/logistics", amount=12_000.00),
    ]
    total_revenue = sum(item.amount for item in revenue)
    total_expenses = sum(item.amount for item in expenses)

    return CashFlowStatement(
        period="2026-08-01 to 2026-08-28",
        currency="LKR",
        business_name="Sample Grocery - Kandy",
        revenue=revenue,
        expenses=expenses,
        net_cash_flow=total_revenue - total_expenses,
        confidence_score=0.87,
    )


async def process_image(image_url: str) -> OcrProcessResponse:
    """Simulate OCR extraction on *image_url* and return a cash-flow statement.

    A random delay of 0.5–1.5 seconds is injected to approximate real
    Google Cloud Vision latency.

    Args:
        image_url: Public URL of the image to process.

    Returns:
        A fully populated ``OcrProcessResponse`` with mock data.
    """
    delay = random.uniform(0.5, 1.5)
    logger.info("Mock OCR processing image (delay=%.2fs): %s", delay, image_url)
    await asyncio.sleep(delay)

    return OcrProcessResponse(
        request_id=uuid.uuid4(),
        status="completed",
        cash_flow_statement=_build_mock_cash_flow(),
        processed_at=datetime.now(tz=timezone.utc),
    )
