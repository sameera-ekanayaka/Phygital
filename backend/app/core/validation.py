"""Standard validation utilities for the Phygital backend.

Enforces Sri Lanka National Identity Card (NIC) formats, mobile phone conventions,
transaction financial limits, and secure file upload MIME validation.
"""

from __future__ import annotations

import re
from typing import Literal

# ── Sri Lankan Phone ─────────────────────────────────────────────────────────

_PHONE_RE = re.compile(r"^(?:\+?94|0)?(7\d{8})$")


def validate_sri_lankan_phone(raw: str) -> str:
    """Validate and normalize a Sri Lankan mobile number.

    Accepts formats:
        - 07XXXXXXXX (10 digits)
        - +947XXXXXXXX / 947XXXXXXXX (international)

    Returns:
        Canonical 10-digit format: ``07XXXXXXXX``.

    Raises:
        ValueError: If the number is not a valid Sri Lankan mobile number.
    """
    cleaned = raw.strip().replace(" ", "").replace("-", "")
    match = _PHONE_RE.match(cleaned)
    if not match:
        raise ValueError(
            "Phone number must be a 10-digit Sri Lankan mobile number starting with 07 (e.g. 0771234567)."
        )
    return f"0{match.group(1)}"


# ── Sri Lankan NIC ───────────────────────────────────────────────────────────

_OLD_NIC_RE = re.compile(r"^\d{9}[VX]$")
_NEW_NIC_RE = re.compile(r"^\d{12}$")


def validate_sri_lankan_nic(raw: str) -> tuple[str, Literal["male", "female"]]:
    """Validate Sri Lankan National Identity Card (NIC) and detect gender.

    Old format: 9 digits followed by 'V' or 'X' (e.g. ``896543456V``).
    New format: 12 digits (e.g. ``198965434567``).

    Returns:
        A tuple of ``(canonical_nic, gender)`` where gender is 'male' or 'female'.

    Raises:
        ValueError: If format is invalid or birth day-of-year code is out of range.
    """
    nic = raw.strip().upper()

    if len(nic) == 10 and _OLD_NIC_RE.match(nic):
        day_code = int(nic[2:5])
    elif len(nic) == 12 and _NEW_NIC_RE.match(nic):
        day_code = int(nic[4:7])
    else:
        raise ValueError(
            "NIC must be either 9 digits followed by V/X (old format) or 12 digits (new format)."
        )

    if 501 <= day_code <= 866:
        gender: Literal["male", "female"] = "female"
    elif 1 <= day_code <= 366:
        gender = "male"
    else:
        raise ValueError(f"NIC contains an invalid day-of-year code: {day_code}.")

    return nic, gender


# ── Financial Amounts ────────────────────────────────────────────────────────

MAX_TRANSACTION_AMOUNT_LKR = 100_000_000.0  # 100 Million LKR


def validate_transaction_amount(amount: float) -> float:
    """Validate that a transaction amount is positive and within acceptable bounds.

    Returns:
        Amount rounded to 2 decimal places.

    Raises:
        ValueError: If amount <= 0 or exceeds maximum limit.
    """
    if amount <= 0:
        raise ValueError("Transaction amount must be strictly greater than zero.")
    if amount > MAX_TRANSACTION_AMOUNT_LKR:
        raise ValueError(
            f"Transaction amount cannot exceed LKR {MAX_TRANSACTION_AMOUNT_LKR:,.0f}."
        )
    return round(amount, 2)


# ── File Uploads ─────────────────────────────────────────────────────────────

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_AUDIO_EXTENSIONS = {".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mp4"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_AUDIO_EXTENSIONS

ALLOWED_MIME_TYPES = {
    # Images
    "image/jpeg",
    "image/png",
    "image/webp",
    # Audio & video containers
    "audio/webm",
    "video/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/m4a",
    "audio/x-m4a",
    "audio/ogg",
    "audio/mp4",
    "video/mp4",
    "application/octet-stream",  # mobile browsers sometimes set generic mime
}


def validate_uploaded_file(filename: str, content_type: str | None = None) -> None:
    """Ensure an uploaded file matches allowed image or audio formats.

    Raises:
        ValueError: If file extension or MIME type is rejected.
    """
    if not filename:
        raise ValueError("Uploaded file must have a valid filename.")

    dot_index = filename.rfind(".")
    if dot_index == -1:
        raise ValueError(f"File '{filename}' lacks a file extension.")

    ext = filename[dot_index:].lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed_list = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ValueError(
            f"Unsupported file format '{ext}' for file '{filename}'. Allowed formats: {allowed_list}."
        )

    if content_type and content_type.lower() not in ALLOWED_MIME_TYPES:
        raise ValueError(
            f"File '{filename}' has an unsupported content type: '{content_type}'."
        )
