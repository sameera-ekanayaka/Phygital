"""Transaction session accumulation service.

Maintains a per-borrower Redis list of ingested transactions with a 72-hour
TTL (PDPA No. 9 of 2022 Section 12 — Data Minimization).  Provides helpers
to append items, compute aggregated summaries, clear sessions, and generate
verification codes for the accumulated cash-flow data.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from app.api.v1.qrcode.service import generate_verification
from app.api.v1.transactions.schemas import (
    GenerateCodeResponse,
    TransactionSessionItem,
    TransactionSummaryResponse,
)
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# ── Redis key pattern ────────────────────────────────────────────────────────
_SESSION_PREFIX = "phygital:txn_session:"  # → Redis list keyed by borrower_id
_SESSION_TTL = 259_200  # 72 hours in seconds (PDPA retention window)

# Verification token expiry — matches the QR-code domain default (72 hours).
_CODE_EXPIRY_MINUTES = 4_320


# ── Helpers ──────────────────────────────────────────────────────────────────


def _session_key(borrower_id: str) -> str:
    """Return the Redis key for the borrower's transaction session."""
    return f"{_SESSION_PREFIX}{borrower_id}"


# ── Public API ───────────────────────────────────────────────────────────────


def append_transaction(borrower_id: str, ingest_response) -> None:
    """Serialize key fields from *ingest_response* and RPUSH to the session list.

    The ``structured_data`` field is a Pydantic model on the response — it is
    converted via ``model_dump()`` (or ``None`` when absent) before
    serialization.

    Args:
        borrower_id: The borrower whose session list to append to.
        ingest_response: An ``IngestResponse`` (or compatible) object
            returned by the ingest upload pipeline.
    """
    client = get_redis()
    key = _session_key(borrower_id)

    # Convert structured_data Pydantic model → dict (or None)
    structured: dict | None = None
    if getattr(ingest_response, "structured_data", None) is not None:
        structured = ingest_response.structured_data.model_dump()

    item = json.dumps({
        "request_id": str(ingest_response.request_id),
        "raw_text": ingest_response.raw_text,
        "structured_data": structured,
        "processed_at": ingest_response.processed_at.isoformat(),
    })

    client.rpush(key, item)
    client.expire(key, _SESSION_TTL)

    logger.info(
        "Appended transaction to session: borrower=%s…, request_id=%s",
        borrower_id[:12],
        ingest_response.request_id,
    )


def get_session_summary(borrower_id: str) -> TransactionSummaryResponse:
    """Retrieve and aggregate all transactions in the borrower's session.

    Sums ``business_revenue``, ``business_expense``, and ``personal_expense``
    amounts across all items that carry structured data.  The
    ``business_name`` is extracted from the first item whose structured
    data includes one.

    Args:
        borrower_id: The borrower whose session to summarise.

    Returns:
        A ``TransactionSummaryResponse`` with computed aggregates.
    """
    client = get_redis()
    key = _session_key(borrower_id)

    raw_items: list[str] = client.lrange(key, 0, -1)

    items: list[TransactionSessionItem] = []
    total_revenue = 0.0
    total_expenses = 0.0
    total_personal = 0.0
    business_name = ""

    for raw in raw_items:
        data = json.loads(raw)
        items.append(TransactionSessionItem(**data))

        sd = data.get("structured_data")
        if sd is None:
            continue

        # Accumulate amounts from each category
        for txn in sd.get("business_revenue", []):
            total_revenue += txn.get("amount", 0.0)
        for txn in sd.get("business_expense", []):
            total_expenses += txn.get("amount", 0.0)
        for txn in sd.get("personal_expense", []):
            total_personal += txn.get("amount", 0.0)

        # Capture business_name from the first item that has one
        if not business_name:
            business_name = sd.get("business_name", "")

    return TransactionSummaryResponse(
        session_id=borrower_id,
        transaction_count=len(items),
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        total_personal=total_personal,
        business_name=business_name,
        items=items,
    )


def clear_session(borrower_id: str) -> None:
    """Delete the borrower's transaction session from Redis.

    Args:
        borrower_id: The borrower whose session to clear.
    """
    client = get_redis()
    key = _session_key(borrower_id)
    client.delete(key)
    logger.info("Cleared transaction session: borrower=%s…", borrower_id[:12])


def generate_session_code(
    borrower_id: str,
    owner_demographics: dict | None = None,
) -> GenerateCodeResponse:
    """Generate a verification code for the borrower's accumulated session.

    Builds an aggregated ``cash_flow_data`` dict from all session items,
    generates a UUID as ``cash_flow_id``, then delegates to
    ``generate_verification()`` in the QR-code domain which stores the
    mapping in Redis and returns the code, token, and expiry.

    Args:
        borrower_id: The borrower whose session to encode.

    Returns:
        A ``GenerateCodeResponse`` with the verification code, token,
        and ISO 8601 expiry timestamp.
    """
    client = get_redis()
    key = _session_key(borrower_id)

    raw_items: list[str] = client.lrange(key, 0, -1)
    if not raw_items:
        raise ValueError("No transactions to generate code for.")

    # Build aggregated cash_flow_data from all session items
    all_transactions: list[dict] = []
    business_name = ""

    for raw in raw_items:
        data = json.loads(raw)
        sd = data.get("structured_data")
        if sd is None:
            continue

        if not business_name:
            business_name = sd.get("business_name", "")

        for txn in sd.get("business_revenue", []):
            txn_copy = dict(txn)
            txn_copy["type"] = "business_revenue"
            all_transactions.append(txn_copy)
        for txn in sd.get("business_expense", []):
            txn_copy = dict(txn)
            txn_copy["type"] = "business_expense"
            all_transactions.append(txn_copy)
        for txn in sd.get("personal_expense", []):
            txn_copy = dict(txn)
            txn_copy["type"] = "personal_expense"
            all_transactions.append(txn_copy)

    cash_flow_id = str(uuid.uuid4())
    cash_flow_data = {
        "borrower_id": borrower_id,
        "business_name": business_name,
        "transactions": all_transactions,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "owner_demographics": owner_demographics,
    }

    result = generate_verification(
        cash_flow_id=cash_flow_id,
        expiry_minutes=_CODE_EXPIRY_MINUTES,
        cash_flow_data=cash_flow_data,
    )

    logger.info(
        "Generated session code: borrower=%s…, code=%s",
        borrower_id[:12],
        result["verification_code"],
    )

    # generate_verification returns expires_at as a datetime — serialise to ISO string
    expires_at = result["expires_at"]
    if isinstance(expires_at, datetime):
        expires_at = expires_at.isoformat()

    return GenerateCodeResponse(
        verification_code=result["verification_code"],
        token=result["token"],
        expires_at=expires_at,
    )
