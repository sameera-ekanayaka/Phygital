"""Multimodal AI processing engine for the Phygital Cash-Flow Engine.

Provides three core capabilities:
- Audio transcription via Groq Whisper (OpenAI-compatible API)
- Image text extraction via Google Gemini 2.0 Flash
- Structured data extraction via Groq Llama 3.3 70B

Day-2 AI Translation Pipeline (AIEngineService):
- Audio transcription via OpenAI Whisper with Sri Lankan dialect tuning
- Ledger OCR via GPT-4o Vision (base64-encoded images)
- Trilingual financial parsing via GPT-4o Structured Outputs with mock fallback

All functions are async-safe and use per-module logging.
"""

import asyncio
import base64
import io
import json
import logging
import time

from google import genai
from google.genai import types
from openai import AsyncOpenAI

from app.api.v1.ingest.schemas import ExtractedTransaction, IngestExtractionResponse
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


# ── Day-2 AI Translation Pipeline ────────────────────────────────────────────


class AIEngineService:
    """Day-2 translation pipeline: OpenAI Whisper, GPT-4o Vision, structured outputs.

    Provides Sri Lankan trilingual (Sinhala, Tamil, Singlish) financial data
    extraction with a robust mock fallback when no OpenAI API key is configured.
    """

    _WHISPER_PROMPT = (
        "This audio may contain Sinhala, Tamil, or English (Singlish) speech "
        "about Sri Lankan business transactions, finances, and household expenses. "
        "Transcribe faithfully, preserving numbers, currency amounts (Rupees/LKR), "
        "and proper nouns."
    )

    _VISION_PROMPT = (
        "Extract all text from this handwritten or printed ledger page, receipt, "
        "or cash-book. The text may be in Sinhala, Tamil, or English. Preserve all "
        "numbers, amounts (in LKR/Rupees), dates, and column structure exactly as written."
    )

    _EXTRACTION_SYSTEM_PROMPT = (
        "You are an expert Sri Lankan microfinance auditor. Parse messy trilingual "
        "text (Sinhala, Tamil, English/Singlish) from rural merchant ledgers and "
        "voice transcripts.\n\n"
        "Rules:\n"
        "- Separate personal household expenses from business cash flows.\n"
        "- All amounts are in LKR (Sri Lankan Rupees).\n"
        "- Assign a confidence_score (0.0–1.0) to each transaction based on how "
        "clearly the amount and category can be determined.\n"
        "- detected_language must be one of: 'si' (Sinhala), 'ta' (Tamil), "
        "'en' (English), 'singlish' (code-mixed Sinhala/English or Tamil/English).\n"
        "- transaction_type must be: 'business_revenue', 'business_expense', "
        "or 'personal_expense'.\n"
        "- category examples: inventory, sales, transport, utility, household, "
        "wages, rent, agricultural_sale.\n"
        "- Include triangulation_hints: metadata clues (timestamps, phone numbers, "
        "locations, merchant names) that could be cross-referenced against telco "
        "or utility records for fraud detection."
    )

    def __init__(self) -> None:
        """Initialise the OpenAI async client from application settings."""
        self._settings = get_settings()
        api_key = self._settings.openai_api_key
        if api_key:
            self._client: AsyncOpenAI | None = AsyncOpenAI(api_key=api_key)
        else:
            logger.warning(
                "OPENAI_API_KEY is empty — AIEngineService will use mock fallback."
            )
            self._client = None

    # ── Voice transcription ────────────────────────────────────────────────

    async def transcribe_voice(self, audio_bytes: bytes, filename: str) -> str:
        """Transcribe audio using OpenAI Whisper with Sri Lankan dialect tuning.

        Args:
            audio_bytes: Raw audio file content.
            filename: Original filename (used for MIME detection).

        Returns:
            Transcribed text string.
        """
        if self._client is None:
            logger.info("Mock transcribe_voice for %s (%d bytes)", filename, len(audio_bytes))
            return "Pol thel sales Rs. 18,500. Lorry hire Rs. 3,200. Samurdhi deposit Rs. 1,000."

        logger.info("Transcribing voice via OpenAI Whisper: %s (%d bytes)", filename, len(audio_bytes))
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename

        response = await self._client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            prompt=self._WHISPER_PROMPT,
        )

        transcript = response.text
        logger.info("Whisper transcription complete: %d characters", len(transcript))
        return transcript

    # ── Ledger OCR ─────────────────────────────────────────────────────────

    async def extract_ledger_ocr(self, image_bytes: bytes) -> str:
        """Extract text from ledger images using GPT-4o Vision.

        Encodes the image as base64 and sends it to GPT-4o as a vision request.

        Args:
            image_bytes: Raw image content (JPEG, PNG, or WebP).

        Returns:
            Extracted text preserving numbers, amounts, and structure.
        """
        if self._client is None:
            logger.info("Mock extract_ledger_ocr (%d bytes)", len(image_bytes))
            return (
                "2026-08-15  Rice 50kg   Rs. 12,500\n"
                "2026-08-16  Sugar 10kg  Rs.  3,800\n"
                "2026-08-17  Tea leaves  Rs.  2,100\n"
                "Total sales this week: Rs. 18,400"
            )

        logger.info("Extracting ledger OCR via GPT-4o Vision (%d bytes)", len(image_bytes))
        encoded = base64.b64encode(image_bytes).decode("utf-8")

        response = await self._client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": self._VISION_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract all text from this image."},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
                        },
                    ],
                },
            ],
            max_tokens=2048,
        )

        text = response.choices[0].message.content or ""
        logger.info("GPT-4o Vision extraction complete: %d characters", len(text))
        return text

    # ── Structured financial parsing ────────────────────────────────────────

    async def parse_unstructured_financials(
        self, raw_text: str
    ) -> IngestExtractionResponse:
        """Parse raw trilingual text into structured financial transactions.

        Uses OpenAI Structured Outputs (gpt-4o) with
        ``response_format=IngestExtractionResponse``.

        Falls back to a realistic mock when no API key is configured, simulating
        rural Sri Lankan retail merchant entries.

        Args:
            raw_text: Combined raw text from OCR / transcription / user notes.

        Returns:
            IngestExtractionResponse with parsed transactions and metadata.
        """
        start = time.perf_counter()

        if self._client is None:
            logger.info("Mock parse_unstructured_financials (%d chars)", len(raw_text))
            return self._mock_extraction(raw_text, start)

        logger.info(
            "Parsing unstructured financials via GPT-4o structured outputs (%d chars)",
            len(raw_text),
        )

        try:
            response = await self._client.beta.chat.completions.parse(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self._EXTRACTION_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Parse the following raw text into structured financial "
                            f"transactions:\n\n{raw_text}"
                        ),
                    },
                ],
                response_format=IngestExtractionResponse,
                temperature=0.1,
            )

            result: IngestExtractionResponse = response.choices[0].message.parsed
            # Patch processing time since the model cannot know it
            elapsed_ms = (time.perf_counter() - start) * 1000
            result.processing_time_ms = round(elapsed_ms, 2)
            result.raw_transcript = raw_text
            logger.info(
                "Structured parse complete: %d transactions in %.0f ms",
                len(result.transactions),
                elapsed_ms,
            )
            return result

        except Exception as exc:
            logger.error(
                "GPT-4o structured parse failed, falling back to mock: %s", exc
            )
            return self._mock_extraction(raw_text, start)

    # ── Mock fallback ──────────────────────────────────────────────────────

    @staticmethod
    def _mock_extraction(
        raw_text: str, start: float
    ) -> IngestExtractionResponse:
        """Generate a realistic mock extraction for rural Sri Lankan retail.

        Used when OPENAI_API_KEY is absent or the API call fails.
        """
        mock_transactions: list[ExtractedTransaction] = [
            ExtractedTransaction(
                transaction_type="business_revenue",
                amount=18500.0,
                category="sales",
                description="Pol thel sales Rs. 18,500",
                confidence_score=0.92,
                detected_language="singlish",
            ),
            ExtractedTransaction(
                transaction_type="business_expense",
                amount=3200.0,
                category="transport",
                description="Lorry hire Rs. 3,200",
                confidence_score=0.88,
                detected_language="singlish",
            ),
            ExtractedTransaction(
                transaction_type="personal_expense",
                amount=1000.0,
                category="household",
                description="Samurdhi deposit Rs. 1,000",
                confidence_score=0.85,
                detected_language="singlish",
            ),
            ExtractedTransaction(
                transaction_type="business_revenue",
                amount=7500.0,
                category="agricultural_sale",
                description="Paddy harvest sale Rs. 7,500",
                confidence_score=0.80,
                detected_language="si",
            ),
            ExtractedTransaction(
                transaction_type="business_expense",
                amount=2400.0,
                category="utility",
                description="Electricity bill Rs. 2,400",
                confidence_score=0.95,
                detected_language="en",
            ),
        ]

        elapsed_ms = (time.perf_counter() - start) * 1000

        return IngestExtractionResponse(
            transactions=mock_transactions,
            raw_transcript=raw_text,
            processing_time_ms=round(elapsed_ms, 2),
            triangulation_hints=[
                "Mock mode: no live API call performed",
                "Cross-reference Samurdhi deposit with government welfare records",
                "Verify lorry hire against typical transport rates in the region",
            ],
        )

