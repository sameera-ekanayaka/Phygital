"""WhatsApp webhook routes — receives Twilio inbound messages."""

import logging

from fastapi import APIRouter, Form, Header, HTTPException, Request, status
from twilio.request_validator import RequestValidator

from app.api.v1.whatsapp.service import (
    build_acknowledgement_reply,
    build_ask_for_image_reply,
    process_image_via_ocr,
)
from app.config import get_settings
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


def _validate_twilio_signature(
    request_url: str,
    params: dict[str, str],
    signature: str,
) -> None:
    """Raise ``401`` if the Twilio request signature is invalid.

    Args:
        request_url: The full URL Twilio used to reach this endpoint.
        params: All form fields sent by Twilio.
        signature: Value of the ``X-Twilio-Signature`` header.
    """
    settings = get_settings()
    validator = RequestValidator(settings.twilio_auth_token)

    if not validator.validate(request_url, params, signature):
        logger.warning("Invalid Twilio signature for %s", request_url)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Twilio signature.",
        )


@router.post("/webhook", summary="Twilio WhatsApp inbound webhook")
@limiter.limit("30/minute")
async def whatsapp_webhook(
    request: Request,
    x_twilio_signature: str = Header(..., alias="X-Twilio-Signature"),
    from_number: str = Form("", alias="From"),
    to_number: str = Form("", alias="To"),
    body: str = Form("", alias="Body"),
    num_media: int = Form(0, alias="NumMedia"),
    media_url_0: str = Form("", alias="MediaUrl0"),
) -> str:
    """Receive and process an inbound WhatsApp message from Twilio.

    If the message includes an image attachment it is forwarded to the OCR
    pipeline.  Otherwise the user is asked to send a photo of their ledger.

    Args:
        request: The raw FastAPI ``Request`` (required by slowapi).
        x_twilio_signature: Twilio HMAC signature header.
        from_number: Sender's phone number in E.164 format.
        to_number: Our Twilio phone number.
        body: Text content of the message.
        num_media: Count of media attachments.
        media_url_0: URL of the first media attachment.

    Returns:
        Raw TwiML XML string for Twilio to interpret.
    """
    # Reconstruct the form params dict for signature validation.
    form_params: dict[str, str] = {
        "From": from_number,
        "To": to_number,
        "Body": body,
        "NumMedia": str(num_media),
    }
    if media_url_0:
        form_params["MediaUrl0"] = media_url_0

    # Build the absolute request URL for Twilio signature validation.
    request_url = str(request.url)

    _validate_twilio_signature(request_url, form_params, x_twilio_signature)

    logger.info(
        "Webhook received — from=%s, body_length=%d, num_media=%d",
        from_number,
        len(body),
        num_media,
    )

    # ── Image attached → forward to OCR ──────────────────────────────────
    if num_media >= 1 and media_url_0:
        try:
            await process_image_via_ocr(media_url_0)
        except Exception:
            logger.exception("OCR processing failed for image from %s", from_number)
        return build_acknowledgement_reply()

    # ── No image → ask the user to send one ─────────────────────────────
    return build_ask_for_image_reply()
