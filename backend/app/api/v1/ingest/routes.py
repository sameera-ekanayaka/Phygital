"""Ingest API routes — multipart upload endpoint for merchant data capture.

Accepts images, audio files, and text notes for AI processing.
"""

import logging

from fastapi import APIRouter, File, Form, Request, UploadFile

from app.api.v1.ingest.schemas import IngestResponse
from app.api.v1.ingest.service import process_upload
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/upload", response_model=IngestResponse)
@limiter.limit("10/minute")
async def upload(
    request: Request,
    files: list[UploadFile] = File(default=[]),
    notes: str = Form(default=""),
) -> IngestResponse:
    """Upload merchant financial data for AI processing.

    Accepts a mix of images (ledger photos, receipts) and audio files
    (voice notes) along with optional typed text notes.  All inputs are
    processed through the AI pipeline to produce structured cash-flow data.

    Args:
        request: FastAPI request (required for rate limiter).
        files: Uploaded image and/or audio files.
        notes: Optional text notes in Sinhala, Tamil, or English.

    Returns:
        IngestResponse with extracted raw text and structured financial data.
    """
    logger.info("Ingest upload: %d files, notes_length=%d", len(files), len(notes))
    return await process_upload(files, notes)
