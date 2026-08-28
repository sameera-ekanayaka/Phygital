"""WhatsApp webhook service — orchestrates OCR calls and builds TwiML replies."""

import logging
from typing import Any

import httpx
from twilio.twiml.messaging_response import MessagingResponse

logger = logging.getLogger(__name__)


def build_ask_for_image_reply() -> str:
    """Return TwiML XML asking the user to send a ledger photo.

    Used when the inbound message has no image attachment.
    """
    resp = MessagingResponse()
    resp.message(
        "Welcome to Phygital 📒\n\n"
        "Please send a clear photo of your cash book / ledger page "
        "and I will extract your cash-flow statement automatically."
    )
    return str(resp)


def build_acknowledgement_reply() -> str:
    """Return TwiML XML acknowledging receipt of an image.

    Used after the OCR service has been called (fire-and-forget style).
    """
    resp = MessagingResponse()
    resp.message(
        "Got it! 📸 I'm processing your ledger page now.\n\n"
        "You will receive a summary shortly. This usually takes under a minute."
    )
    return str(resp)


async def process_image_via_ocr(image_url: str) -> dict[str, Any]:
    """Forward *image_url* to the internal OCR endpoint and return the result.

    In production this would call Google Cloud Vision directly.  For now we
    POST to our own mock OCR endpoint so the full pipeline can be exercised
    end-to-end.

    Args:
        image_url: Public URL of the image uploaded by the user.

    Returns:
        The JSON response body from the OCR service.
    """
    logger.info("Forwarding image to OCR service: %s", image_url)

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "http://127.0.0.1:8000/api/v1/ocr/process",
            json={"image_url": image_url},
        )
        response.raise_for_status()
        result: dict[str, Any] = response.json()

    logger.info(
        "OCR completed — request_id=%s, confidence=%.2f",
        result.get("request_id"),
        result.get("cash_flow_statement", {}).get("confidence_score", 0),
    )
    return result
