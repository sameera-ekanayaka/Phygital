"""OCR processing routes — accepts an image URL and returns extracted cash-flow data."""

import logging

from fastapi import APIRouter

from app.api.v1.ocr.schemas import OcrProcessRequest, OcrProcessResponse
from app.api.v1.ocr.service import process_image

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ocr", tags=["ocr"])


@router.post(
    "/process",
    response_model=OcrProcessResponse,
    summary="Process a ledger image and extract cash-flow data",
)
async def ocr_process(payload: OcrProcessRequest) -> OcrProcessResponse:
    """Accept a ledger image URL, run (mock) OCR, and return a cash-flow statement.

    In production this would invoke Google Cloud Vision + the trilingual NLP
    engine.  The current implementation returns a realistic mock response with
    a small simulated delay.

    Args:
        payload: JSON body containing the ``image_url`` to process.

    Returns:
        A structured cash-flow statement with confidence score.
    """
    logger.info("OCR endpoint hit — image_url=%s", payload.image_url)
    return await process_image(payload.image_url)
