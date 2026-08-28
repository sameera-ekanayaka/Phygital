"""Multimodal AI processing engine for the Phygital Cash-Flow Engine.

Provides three core capabilities:
- Audio transcription via Groq Whisper (OpenAI-compatible API)
- Image text extraction via Google Gemini 2.0 Flash
- Structured data extraction via Groq Llama 3.3 70B

All functions are async-safe and use per-module logging.
"""

import asyncio
import io
import json
import logging

from google import genai
from google.genai import types
from openai import AsyncOpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Groq client (OpenAI-compatible) ─────────────────────────────────────────

def _get_groq_client() -> AsyncOpenAI:
    """Create a Groq-compatible AsyncOpenAI client."""
    settings = get_settings()
    return AsyncOpenAI(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1",
    )


async def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """Transcribe audio using Groq's Whisper large-v3 model.

    Supports M4A, WAV, MP3, OGG, and WebM audio formats.  The API
    auto-detects language among Sinhala, Tamil, and English.

    Args:
        audio_bytes: Raw audio file content.
        filename: Original filename (used for MIME type detection).

    Returns:
        Transcribed text string.

    Raises:
        openai.APIError: If the Groq API returns an error.
    """
    client = _get_groq_client()
    logger.info("Transcribing audio file: %s (%d bytes)", filename, len(audio_bytes))

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    response = await client.audio.transcriptions.create(
        model="whisper-large-v3",
        file=audio_file,
        prompt="Transcribe this audio which may contain Sinhala, Tamil, or English speech about business transactions and finances.",
    )

    transcript = response.text
    logger.info("Transcription complete: %d characters", len(transcript))
    return transcript


async def extract_text_from_image(image_bytes: bytes) -> str:
    """Extract text from an image using Google Gemini 2.0 Flash.

    Designed for handwritten ledger pages ("Potha"), receipts, and printed
    financial documents in Sinhala, Tamil, and English.

    Args:
        image_bytes: Raw image file content (JPEG, PNG, or WebP).

    Returns:
        Extracted text string preserving numbers, amounts, and dates.

    Raises:
        google.genai.errors.APIError: If the Gemini API fails.
    """
    settings = get_settings()
    logger.info("Extracting text from image (%d bytes)", len(image_bytes))

    def _call_gemini() -> str:
        """Synchronous Gemini call to be run in a thread."""
        client = genai.Client(api_key=settings.google_api_key)

        image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                "Extract all text from this handwritten/printed ledger page. "
                "The text may be in Sinhala, Tamil, or English. "
                "Preserve all numbers, amounts, and dates exactly as written. "
                "If there are tables or columns, maintain their structure.",
                image_part,
            ],
        )
        return response.text

    # google-generativeai is synchronous; run in thread to avoid blocking
    extracted_text = await asyncio.to_thread(_call_gemini)
    logger.info("Image text extraction complete: %d characters", len(extracted_text))
    return extracted_text


async def extract_structured_data(raw_text: str) -> dict:
    """Extract structured financial data from raw text using Groq Llama 3.3 70B.

    Categorizes transactions into business revenue, business expenses, and
    personal expenses with confidence scores.

    Args:
        raw_text: Combined raw text from OCR and/or transcription.

    Returns:
        Dictionary matching the StructuredExtraction schema with keys:
        business_revenue, business_expense, personal_expense, currency,
        period, business_name, overall_confidence.

    Raises:
        openai.APIError: If the Groq API returns an error.
        json.JSONDecodeError: If the response is not valid JSON.
    """
    client = _get_groq_client()
    logger.info("Extracting structured data from %d characters of text", len(raw_text))

    system_prompt = (
        "You are a financial data extraction expert specializing in Sri Lankan "
        "micro-SME accounting. Given raw text extracted from handwritten ledgers, "
        "receipts, or voice transcriptions, extract and categorize all financial "
        "transactions.\n\n"
        "Return a JSON object with this exact structure:\n"
        "{\n"
        '  "business_revenue": [{"amount": float, "category": str, "description": str, "source_confidence": float}],\n'
        '  "business_expense": [{"amount": float, "category": str, "description": str, "source_confidence": float}],\n'
        '  "personal_expense": [{"amount": float, "category": str, "description": str, "source_confidence": float}],\n'
        '  "currency": "LKR",\n'
        '  "period": "detected period or empty string",\n'
        '  "business_name": "detected business name or empty string",\n'
        '  "overall_confidence": float between 0.0 and 1.0\n'
        "}\n\n"
        "Categories for business_revenue: retail_sales, wholesale, services, other_income\n"
        "Categories for business_expense: inventory, transport, utilities, rent, wages, other_expense\n"
        "Categories for personal_expense: household, education, healthcare, other_personal\n\n"
        "source_confidence: 0.0 (guessed) to 1.0 (clearly stated amount)\n"
        "overall_confidence: your confidence in the overall extraction quality\n"
        "Amounts should be in LKR. Convert if another currency is mentioned."
    )

    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Extract financial transactions from this text:\n\n{raw_text}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    result_text = response.choices[0].message.content
    structured = json.loads(result_text)
    logger.info(
        "Structured extraction complete: %d revenue, %d expense, %d personal items",
        len(structured.get("business_revenue", [])),
        len(structured.get("business_expense", [])),
        len(structured.get("personal_expense", [])),
    )
    return structured
