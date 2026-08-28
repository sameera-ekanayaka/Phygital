"""Ingest service — orchestrates multimodal AI processing pipeline.

Routes uploaded files to the appropriate AI engine function, collects
results in parallel, then passes combined text through structured extraction.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import UploadFile

from app.api.v1.ingest.schemas import IngestResponse, StructuredExtraction, TransactionItem
from app.services.ai_engine import (
    extract_structured_data,
    extract_text_from_image,
    transcribe_audio,
)

logger = logging.getLogger(__name__)

# MIME type prefixes for routing
_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "image/jpg")
_AUDIO_TYPES = ("audio/webm", "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4", "audio/m4a")


async def process_upload(files: list[UploadFile], notes: str | None) -> IngestResponse:
    """Process uploaded files and notes through the AI pipeline.

    Orchestration logic:
    1. Classify each file by MIME type (image → OCR, audio → transcription).
    2. Fan out all AI calls in parallel via asyncio.gather.
    3. Concatenate extracted text with user-provided notes.
    4. Pass combined text to structured data extraction.
    5. Return IngestResponse with results.

    Args:
        files: Uploaded images and/or audio files.
        notes: Optional text notes provided by the merchant.

    Returns:
        IngestResponse with raw text and structured extraction results.
    """
    request_id = uuid.uuid4()
    logger.info("Processing ingest request %s: %d files, notes=%s", request_id, len(files), bool(notes))

    # Build parallel tasks based on file types
    tasks: list[asyncio.Task] = []
    task_labels: list[str] = []

    for file in files:
        content_type = file.content_type or ""
        file_bytes = await file.read()

        if content_type.startswith("image/") or content_type in _IMAGE_TYPES:
            tasks.append(asyncio.create_task(extract_text_from_image(file_bytes)))
            task_labels.append(f"ocr:{file.filename}")
        elif content_type.startswith("audio/") or content_type in _AUDIO_TYPES:
            tasks.append(asyncio.create_task(transcribe_audio(file_bytes, file.filename or "audio.webm")))
            task_labels.append(f"transcribe:{file.filename}")
        else:
            logger.warning("Skipping unsupported file type: %s (%s)", file.filename, content_type)

    # Execute all AI calls in parallel
    text_parts: list[str] = []

    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for label, result in zip(task_labels, results):
            if isinstance(result, Exception):
                logger.error("AI task failed [%s]: %s", label, str(result))
            elif result:
                text_parts.append(result)

    # Append user notes
    if notes and notes.strip():
        text_parts.append(notes.strip())

    # Combine all text
    raw_text = "\n\n".join(text_parts)

    # Extract structured data if we have any text
    structured_data = None
    if raw_text.strip():
        try:
            extracted = await extract_structured_data(raw_text)
            structured_data = StructuredExtraction(
                business_revenue=[TransactionItem(**item) for item in extracted.get("business_revenue", [])],
                business_expense=[TransactionItem(**item) for item in extracted.get("business_expense", [])],
                personal_expense=[TransactionItem(**item) for item in extracted.get("personal_expense", [])],
                currency=extracted.get("currency", "LKR"),
                period=extracted.get("period", ""),
                business_name=extracted.get("business_name", ""),
                overall_confidence=extracted.get("overall_confidence", 0.0),
            )
        except Exception as exc:
            logger.error("Structured extraction failed for request %s: %s", request_id, str(exc))

    status = "completed" if structured_data else ("completed" if not raw_text.strip() else "partial")

    return IngestResponse(
        request_id=request_id,
        status=status,
        raw_text=raw_text,
        structured_data=structured_data,
        processed_at=datetime.now(tz=timezone.utc),
    )
