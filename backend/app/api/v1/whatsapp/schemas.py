"""Pydantic v2 schemas for the WhatsApp webhook integration."""

from pydantic import BaseModel, Field


class TwilioWebhookPayload(BaseModel):
    """Inbound WhatsApp message payload as sent by Twilio.

    Twilio sends these as ``application/x-www-form-urlencoded`` form fields.
    FastAPI's ``Form(...)`` parameters handle the extraction; this model is
    used internally for validation after parsing.
    """

    from_number: str = Field(..., alias="From", description="Sender's WhatsApp number (E.164).")
    to_number: str = Field("", alias="To", description="Recipient number (our Twilio number).")
    body: str = Field("", alias="Body", description="Text body of the message.")
    num_media: int = Field(0, alias="NumMedia", description="Number of media attachments.")
    media_url_0: str = Field("", alias="MediaUrl0", description="URL of the first media attachment.")

    model_config = {"populate_by_name": True}


class WebhookResponse(BaseModel):
    """Internal representation of the TwiML response returned to Twilio."""

    twiml: str = Field(..., description="Raw TwiML XML string.")
