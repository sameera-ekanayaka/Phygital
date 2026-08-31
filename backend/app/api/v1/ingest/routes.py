"""Ingest API routes — multipart upload endpoint for merchant data capture.

Accepts images, audio files, and text notes for AI processing.
"""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.v1.ingest.schemas import IngestResponse
from app.api.v1.ingest.service import process_upload
from app.api.v1.transactions.service import append_transaction
from app.core.auth import get_current_user
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/upload", response_model=IngestResponse)
@limiter.limit("10/minute")
async def upload(
    request: Request,
    files: list[UploadFile] = File(default=[]),
    notes: str = Form(default=""),
    current_user: dict = Depends(get_current_user),
) -> IngestResponse:
    """Upload merchant financial data for AI processing.

    Accepts a mix of images (ledger photos, receipts) and audio files
    (voice notes) along with optional typed text notes.  All inputs are
    processed through the AI pipeline to produce structured cash-flow data.

    Args:
        request: FastAPI request (required for rate limiter).
        files: Uploaded image and/or audio files.
        notes: Optional text notes in Sinhala, Tamil, or English.
        current_user: Authenticated user from JWT token.

    Returns:
        IngestResponse with extracted raw text and structured financial data.
    """
    # ── File count and size validation ─────────────────────────────────────
    MAX_FILES = 10
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} files allowed per request.")

    for f in files:
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File '{f.filename}' exceeds the 10 MB size limit.",
            )
        await f.seek(0)  # Reset file pointer for downstream processing

    logger.info("Ingest upload: %d files, notes_length=%d", len(files), len(notes))
    response = await process_upload(files, notes)

    # ── Session accumulation hook (borrower role only) ────────────────────────
    try:
        if current_user.get("role") == "borrower":
            append_transaction(current_user["sub"], response)
    except Exception as exc:
        logger.warning("Failed to append transaction to session: %s", exc)

    return response
