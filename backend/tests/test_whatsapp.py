"""Tests for the WhatsApp webhook endpoint (Twilio inbound messages)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

WEBHOOK_URL = "/api/v1/whatsapp/webhook"


def _base_form_params(
    *,
    from_number: str = "whatsapp:+94771234567",
    to_number: str = "whatsapp:+14155238886",
    body: str = "hello",
    num_media: int = 0,
    media_url: str = "",
) -> dict[str, str]:
    """Build the form-params dict that Twilio (and our signature helper) use."""
    params: dict[str, str] = {
        "From": from_number,
        "To": to_number,
        "Body": body,
        "NumMedia": str(num_media),
    }
    if media_url:
        params["MediaUrl0"] = media_url
    return params


# ── Happy-path tests ────────────────────────────────────────────────────────


def test_webhook_with_image_returns_twiml(client, twilio_sign) -> None:
    """NumMedia=1 with a valid image URL must return 200 + TwiML acknowledgement."""
    media_url = "https://api.twilio.com/2010-04-01/Accounts/AC123/Media/ME123"
    params = _base_form_params(num_media=1, media_url=media_url)
    signature = twilio_sign(f"http://testserver{WEBHOOK_URL}", params)

    with patch(
        "app.api.v1.whatsapp.routes.process_image_via_ocr",
        new_callable=AsyncMock,
        return_value={"status": "completed"},
    ):
        resp = client.post(
            WEBHOOK_URL,
            data=params,
            headers={"X-Twilio-Signature": signature},
        )

    assert resp.status_code == 200
    assert "<?xml" in resp.text
    assert "processing" in resp.text.lower() or "got it" in resp.text.lower()


def test_webhook_without_image_asks_for_photo(client, twilio_sign) -> None:
    """NumMedia=0 must return TwiML asking the user to send a ledger photo."""
    params = _base_form_params()
    signature = twilio_sign(f"http://testserver{WEBHOOK_URL}", params)

    resp = client.post(
        WEBHOOK_URL,
        data=params,
        headers={"X-Twilio-Signature": signature},
    )

    assert resp.status_code == 200
    assert "<?xml" in resp.text
    assert "photo" in resp.text.lower() or "ledger" in resp.text.lower()


# ── Twilio signature validation ─────────────────────────────────────────────


def test_webhook_invalid_signature_returns_401(client, twilio_sign) -> None:
    """An incorrect HMAC signature must be rejected with 401."""
    params = _base_form_params()
    # Compute a valid signature for DIFFERENT params → won't match.
    wrong_params = _base_form_params(from_number="whatsapp:+94770000000")
    bad_signature = twilio_sign(f"http://testserver{WEBHOOK_URL}", wrong_params)

    resp = client.post(
        WEBHOOK_URL,
        data=params,
        headers={"X-Twilio-Signature": bad_signature},
    )

    assert resp.status_code == 401


def test_webhook_missing_signature_header_returns_422(client) -> None:
    """Omitting the required X-Twilio-Signature header must yield 422."""
    params = _base_form_params()

    resp = client.post(WEBHOOK_URL, data=params)

    assert resp.status_code == 422


# ── Malformed payloads ──────────────────────────────────────────────────────


def test_webhook_json_body_triggers_signature_mismatch(client, twilio_sign) -> None:
    """Sending JSON instead of form data causes all Form fields to fall back to
    defaults, so the reconstructed params no longer match the Twilio signature.
    The security-first design rejects this with 401 (not 422).
    """
    params = _base_form_params()
    signature = twilio_sign(f"http://testserver{WEBHOOK_URL}", params)

    resp = client.post(
        WEBHOOK_URL,
        json={"From": "whatsapp:+94771234567"},
        headers={"X-Twilio-Signature": signature},
    )

    # Signature is validated before payload shape — mismatch → 401
    assert resp.status_code == 401


def test_webhook_non_integer_num_media_returns_422(client, twilio_sign) -> None:
    """A non-numeric NumMedia value cannot be coerced to int → 422."""
    params = _base_form_params()
    params["NumMedia"] = "not_a_number"
    signature = twilio_sign(f"http://testserver{WEBHOOK_URL}", params)

    resp = client.post(
        WEBHOOK_URL,
        data=params,
        headers={"X-Twilio-Signature": signature},
    )

    assert resp.status_code == 422
