"""Transaction session accumulation and CRUD service.

Maintains a per-borrower Redis HASH of ingested and manually-created
transactions with a configurable TTL (default 30 days, per PDPA No. 9 of
2022 Section 12 — Data Minimization).  Provides helpers to append items
from the AI pipeline, full CRUD for manual transactions, aggregated
summaries, monthly breakdowns, and verification-code generation.
"""

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from app.api.v1.qrcode.service import generate_verification
from app.schemas.transaction import ExtractedTransaction
from app.services.scoring_engine import (
    compute_financial_metrics,
    generate_anomaly_flags,
    generate_explainability_notes,
    generate_field_interview_prompts,
)
from app.api.v1.transactions.schemas import (
    GenerateCodeResponse,
    MonthlySummaryItem,
    MonthlySummaryResponse,
    TransactionCreateRequest,
    TransactionListResponse,
    TransactionRecord,
    TransactionSessionItem,
    TransactionSummaryResponse,
    TransactionUpdateRequest,
)
from app.config import get_settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# ── Redis key patterns ───────────────────────────────────────────────────────
_SESSION_PREFIX = "phygital:txn_session:"  # Legacy Redis LIST (backward-compat)
_SESSION_TTL = 259_200  # 72 hours in seconds (legacy PDPA retention window)

# Verification token expiry — matches the QR-code domain default (72 hours).
_CODE_EXPIRY_MINUTES = 4_320


# ── Helpers ──────────────────────────────────────────────────────────────────


def _session_key(borrower_id: str) -> str:
    """Return the legacy Redis LIST key for backward-compat migration."""
    return f"{_SESSION_PREFIX}{borrower_id}"


def _txn_key(borrower_id: str) -> str:
    """Return the Redis HASH key for the borrower's transaction store."""
    return f"phygital:txns:{borrower_id}"


def _retention_ttl() -> int:
    """Return the TTL in seconds derived from ``transaction_retention_days``."""
    return get_settings().transaction_retention_days * 86400


def _refresh_ttl(client, key: str) -> None:
    """Refresh the TTL on *key* to the configured retention window."""
    client.expire(key, _retention_ttl())


def _migrate_legacy_session(borrower_id: str) -> None:
    """Migrate a legacy Redis LIST session into the new HASH store.

    Pre-migration sessions accumulated AI-ingest envelopes in a Redis LIST
    under ``phygital:txn_session:{borrower_id}``. If that key still exists
    as a list, read every item via LRANGE, convert each into one or more
    ``TransactionRecord`` entries in the new HASH
    (``phygital:txns:{borrower_id}``), refresh the HASH TTL, then delete
    the old LIST key. Otherwise (key missing or already migrated) this is
    a no-op.

    Called at the start of every read entry point so any first touch of a
    legacy session migrates it automatically — otherwise borrowers with
    pre-migration sessions would see empty HASH reads (e.g. a spurious 400
    from ``generate_session_code``) because the migration never ran.

    Args:
        borrower_id: The borrower whose legacy session to migrate.
    """
    client = get_redis()
    old_key = _session_key(borrower_id)
    new_key = _txn_key(borrower_id)

    key_type = client.type(old_key)
    if isinstance(key_type, bytes):
        key_type = key_type.decode()
    if key_type != "list":
        # Legacy key absent or already migrated — nothing to do.
        return

    logger.info(
        "Migrating legacy LIST → HASH: borrower=%s…",
        borrower_id[:12],
    )
    raw_items: list[str] = client.lrange(old_key, 0, -1)
    now_iso = datetime.now(timezone.utc).isoformat()

    for raw in raw_items:
        data = json.loads(raw)
        sd = data.get("structured_data")
        if sd is not None:
            type_map = {
                "business_revenue": "business_revenue",
                "business_expense": "business_expense",
                "personal_expense": "personal_expense",
            }
            for sd_key, txn_type in type_map.items():
                for txn in sd.get(sd_key, []):
                    txn_id = str(uuid.uuid4())
                    record = TransactionRecord(
                        id=txn_id,
                        amount=txn.get("amount", 0.0),
                        transaction_type=txn_type,
                        category=txn.get("category", "other"),
                        description=txn.get("description", ""),
                        notes=None,
                        source="ai_upload",
                        source_confidence=txn.get("source_confidence", 0.85),
                        created_at=now_iso,
                    )
                    client.hset(new_key, txn_id, record.model_dump_json())
        else:
            txn_id = str(uuid.uuid4())
            record = TransactionRecord(
                id=txn_id,
                amount=0.0,
                transaction_type="business_expense",
                category="other",
                description=data.get("raw_text", ""),
                notes=None,
                source="ai_upload",
                confidence_score=0.0,
                created_at=now_iso,
            )
            client.hset(new_key, txn_id, record.model_dump_json())

    _refresh_ttl(client, new_key)
    client.delete(old_key)
    logger.info(
        "Legacy LIST migration complete: borrower=%s…",
        borrower_id[:12],
    )


# ── CRUD: Manual Transactions ───────────────────────────────────────────────


def add_transaction(
    borrower_id: str,
    data: TransactionCreateRequest,
) -> TransactionRecord:
    """Create a new manual transaction and HSET it into the borrower's hash.

    Args:
        borrower_id: The borrower who owns this transaction.
        data: Validated creation payload.

    Returns:
        The newly created ``TransactionRecord``.
    """
    client = get_redis()
    key = _txn_key(borrower_id)
    txn_id = str(uuid.uuid4())

    record = TransactionRecord(
        id=txn_id,
        amount=data.amount,
        transaction_type=data.transaction_type,
        category=data.category,
        description=data.description,
        notes=data.notes,
        source="manual",
        confidence_score=0.85,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    client.hset(key, txn_id, record.model_dump_json())
    _refresh_ttl(client, key)

    logger.info(
        "Added manual transaction: borrower=%s…, txn=%s, amount=%.2f",
        borrower_id[:12],
        txn_id[:8],
        data.amount,
    )
    return record


def get_transactions(
    borrower_id: str,
    txn_type: str | None = None,
    month: str | None = None,
) -> TransactionListResponse:
    """List all transactions for a borrower with optional filters and totals.

    Args:
        borrower_id: The borrower whose transactions to list.
        txn_type: Optional filter — one of ``business_revenue``,
            ``business_expense``, ``personal_expense``.
        month: Optional ``YYYY-MM`` filter on ``created_at``.

    Returns:
        A ``TransactionListResponse`` with items sorted newest-first and
        computed totals.
    """
    # Migrate any legacy LIST session first so pre-migration data is listed.
    _migrate_legacy_session(borrower_id)
    records = _all_records(borrower_id)

    # Sort by created_at descending
    records.sort(key=lambda r: r.created_at, reverse=True)

    # Apply filters
    if txn_type is not None:
        records = [r for r in records if r.transaction_type == txn_type]
    if month is not None:
        records = [r for r in records if r.created_at[:7] == month]

    total_revenue = sum(r.amount for r in records if r.transaction_type == "business_revenue")
    total_expenses = sum(r.amount for r in records if r.transaction_type == "business_expense")
    total_personal = sum(r.amount for r in records if r.transaction_type == "personal_expense")

    return TransactionListResponse(
        items=records,
        total_count=len(records),
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        total_personal=total_personal,
        net_income=total_revenue - total_expenses - total_personal,
    )


def get_transaction(
    borrower_id: str,
    txn_id: str,
) -> TransactionRecord | None:
    """Retrieve a single transaction by ID.

    Args:
        borrower_id: The borrower who owns the transaction.
        txn_id: UUID of the transaction.

    Returns:
        The ``TransactionRecord`` or ``None`` if not found.
    """
    client = get_redis()
    raw = client.hget(_txn_key(borrower_id), txn_id)
    if raw is None:
        return None
    return TransactionRecord.model_validate_json(raw)


def update_transaction(
    borrower_id: str,
    txn_id: str,
    data: TransactionUpdateRequest,
) -> TransactionRecord | None:
    """Merge non-``None`` fields from *data* into an existing transaction.

    Args:
        borrower_id: The borrower who owns the transaction.
        txn_id: UUID of the transaction to update.
        data: Partial update payload — only non-``None`` fields are applied.

    Returns:
        The updated ``TransactionRecord`` or ``None`` if not found.
    """
    client = get_redis()
    key = _txn_key(borrower_id)
    raw = client.hget(key, txn_id)
    if raw is None:
        return None

    record = TransactionRecord.model_validate_json(raw)

    # Merge only explicitly-set fields
    update_fields = data.model_dump(exclude_unset=True)
    merged = record.model_dump()
    merged.update(update_fields)

    updated = TransactionRecord(**merged)
    client.hset(key, txn_id, updated.model_dump_json())
    _refresh_ttl(client, key)

    logger.info(
        "Updated transaction: borrower=%s…, txn=%s, fields=%s",
        borrower_id[:12],
        txn_id[:8],
        list(update_fields.keys()),
    )
    return updated


def delete_transaction(borrower_id: str, txn_id: str) -> bool:
    """Remove a single transaction from the borrower's hash.

    Args:
        borrower_id: The borrower who owns the transaction.
        txn_id: UUID of the transaction to delete.

    Returns:
        ``True`` if the field existed and was deleted, ``False`` otherwise.
    """
    client = get_redis()
    removed = client.hdel(_txn_key(borrower_id), txn_id)
    if removed:
        logger.info(
            "Deleted transaction: borrower=%s…, txn=%s",
            borrower_id[:12],
            txn_id[:8],
        )
    return bool(removed)


def get_monthly_summary(borrower_id: str) -> MonthlySummaryResponse:
    """Compute per-month aggregated totals for the borrower.

    Groups all transactions by ``YYYY-MM`` extracted from ``created_at``
    and sums revenue, expenses, and personal amounts per month.

    Args:
        borrower_id: The borrower whose monthly summary to compute.

    Returns:
        A ``MonthlySummaryResponse`` with one item per month, sorted
        newest-first.
    """
    # Migrate any legacy LIST session first so pre-migration data is included.
    _migrate_legacy_session(borrower_id)
    records = _all_records(borrower_id)

    buckets: dict[str, dict] = {}
    for r in records:
        m = r.created_at[:7]  # "YYYY-MM"
        if m not in buckets:
            buckets[m] = {"revenue": 0.0, "expenses": 0.0, "personal": 0.0, "count": 0}
        bucket = buckets[m]
        bucket["count"] += 1
        if r.transaction_type == "business_revenue":
            bucket["revenue"] += r.amount
        elif r.transaction_type == "business_expense":
            bucket["expenses"] += r.amount
        elif r.transaction_type == "personal_expense":
            bucket["personal"] += r.amount

    months = [
        MonthlySummaryItem(
            month=m,
            revenue=b["revenue"],
            expenses=b["expenses"],
            personal=b["personal"],
            net_income=b["revenue"] - b["expenses"] - b["personal"],
            count=b["count"],
        )
        for m, b in sorted(buckets.items(), reverse=True)
    ]

    return MonthlySummaryResponse(months=months)


# ── Ingest Pipeline ─────────────────────────────────────────────────────────


def append_transaction(borrower_id: str, ingest_response) -> None:
    """Extract individual transactions from *ingest_response* and HSET each
    into the borrower's hash.

    Iterates over ``structured_data.business_revenue``,
    ``business_expense``, and ``personal_expense`` arrays.  Each extracted
    item becomes its own ``TransactionRecord`` with ``source="ai_upload"``.

    If ``structured_data`` is absent or all arrays are empty, a single
    fallback record is stored with the raw text as description.

    Args:
        borrower_id: The borrower whose hash to write into.
        ingest_response: An ``IngestResponse`` (or compatible) object
            returned by the ingest upload pipeline.
    """
    client = get_redis()
    key = _txn_key(borrower_id)

    structured: dict | None = None
    if getattr(ingest_response, "structured_data", None) is not None:
        structured = ingest_response.structured_data.model_dump()

    now_iso = datetime.now(timezone.utc).isoformat()
    stored = 0

    if structured is not None:
        type_map = {
            "business_revenue": "business_revenue",
            "business_expense": "business_expense",
            "personal_expense": "personal_expense",
        }
        for sd_key, txn_type in type_map.items():
            for txn in structured.get(sd_key, []):
                txn_id = str(uuid.uuid4())
                record = TransactionRecord(
                    id=txn_id,
                    amount=txn.get("amount", 0.0),
                    transaction_type=txn_type,
                    category=txn.get("category", "other"),
                    description=txn.get("description", ""),
                    notes=None,
                    source="ai_upload",
                    source_confidence=txn.get("source_confidence", 0.85),
                    created_at=now_iso,
                )
                client.hset(key, txn_id, record.model_dump_json())
                stored += 1

    # Fallback: no structured transactions extracted
    if stored == 0:
        txn_id = str(uuid.uuid4())
        raw_text = getattr(ingest_response, "raw_text", "") or ""
        record = TransactionRecord(
            id=txn_id,
            amount=0.0,
            transaction_type="business_expense",
            category="other",
            description=raw_text,
            notes=None,
            source="ai_upload",
            confidence_score=0.0,
            created_at=now_iso,
        )
        client.hset(key, txn_id, record.model_dump_json())
        stored = 1

    _refresh_ttl(client, key)

    logger.info(
        "Appended %d transaction(s) from ingest: borrower=%s…, request_id=%s",
        stored,
        borrower_id[:12],
        ingest_response.request_id,
    )


# ── Session Helpers (backward-compat) ────────────────────────────────────────


def get_session_summary(borrower_id: str) -> TransactionSummaryResponse:
    """Retrieve and aggregate all transactions in the borrower's session.

    Checks for the legacy Redis LIST key first; if it exists, auto-migrates
    items into the new HASH format before computing totals from the HASH.

    Args:
        borrower_id: The borrower whose session to summarise.

    Returns:
        A ``TransactionSummaryResponse`` with computed aggregates.
    """
    # ── Backward-compat migration ────────────────────────────────────────
    _migrate_legacy_session(borrower_id)

    # ── Build summary from HASH ──────────────────────────────────────────
    records = _all_records(borrower_id)

    total_revenue = 0.0
    total_expenses = 0.0
    total_personal = 0.0

    for r in records:
        if r.transaction_type == "business_revenue":
            total_revenue += r.amount
        elif r.transaction_type == "business_expense":
            total_expenses += r.amount
        elif r.transaction_type == "personal_expense":
            total_personal += r.amount

    # Build legacy-compatible items list from session items still in old key
    # (after migration these will be empty — summary is HASH-only going forward)
    session_items: list[TransactionSessionItem] = []

    return TransactionSummaryResponse(
        session_id=borrower_id,
        transaction_count=len(records),
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        total_personal=total_personal,
        business_name="",
        items=session_items,
    )


def clear_session(borrower_id: str) -> None:
    """Delete both the legacy LIST key and the new HASH key.

    Args:
        borrower_id: The borrower whose session to clear.
    """
    client = get_redis()
    client.delete(_session_key(borrower_id))
    client.delete(_txn_key(borrower_id))
    logger.info("Cleared transaction session: borrower=%s…", borrower_id[:12])


def generate_session_code(
    borrower_id: str,
    owner_demographics: dict | None = None,
) -> GenerateCodeResponse:
    """Generate a verification code for the borrower's accumulated session.

    Migrates any legacy LIST session into the HASH first, so borrowers
    with pre-migration sessions can still generate codes. Then reads all
    ``TransactionRecord`` items from the HASH, groups them by type into a
    ``cash_flow_data`` dict, generates a UUID as ``cash_flow_id``, then
    delegates to ``generate_verification()`` in the QR-code domain.

    Args:
        borrower_id: The borrower whose session to encode.
        owner_demographics: Optional demographic metadata for the borrower.

    Returns:
        A ``GenerateCodeResponse`` with the verification code, token,
        and ISO 8601 expiry timestamp.

    Raises:
        ValueError: If the borrower has no transactions (even after
            migration) to encode.
    """
    # Migrate any legacy LIST session first — without this, borrowers with
    # pre-migration sessions would read an empty HASH and hit the 400 path.
    _migrate_legacy_session(borrower_id)
    records = _all_records(borrower_id)
    if not records:
        raise ValueError("No transactions to generate code for.")

    # 1. Fetch borrower profile from Redis to extract real name and demographics
    client = get_redis()
    borrower_name = "Binithi Perera"
    masked_nic = "89****3456V"
    gender = "unknown"
    liya_shakthi = False

    raw_profile = client.get(f"phygital:borrower:{borrower_id}")
    if raw_profile:
        try:
            profile_data = json.loads(raw_profile)
            if profile_data.get("name"):
                borrower_name = profile_data["name"]
            if profile_data.get("masked_nic"):
                masked_nic = profile_data["masked_nic"]
            gender = profile_data.get("gender", "unknown")
            liya_shakthi = bool(profile_data.get("liya_shakthi_member", False))
        except Exception:
            logger.exception("Failed to parse borrower profile in generate_session_code")

    if owner_demographics is None:
        demographics: dict = {}
        if gender == "female":
            demographics["female_owned"] = True
        if liya_shakthi:
            demographics["liya_shakthi_claimed"] = True
        if demographics:
            owner_demographics = demographics

    is_female = bool(
        (owner_demographics and owner_demographics.get("female_owned")) or gender == "female"
    )
    business_type = (
        "Agricultural Trading — Women-Owned Micro-Enterprise"
        if is_female
        else "Retail & General Merchandise — Micro-Enterprise"
    )

    # 2. Convert TransactionRecords into ExtractedTransaction objects for scoring
    extracted_txns: list[ExtractedTransaction] = []
    business_revenue: list[dict] = []
    business_expense: list[dict] = []
    personal_expense: list[dict] = []

    for r in records:
        conf = getattr(r, "confidence_score", 0.85)
        if conf is None or conf <= 0:
            conf = 0.85
        extracted_txns.append(
            ExtractedTransaction(
                transaction_type=r.transaction_type,
                amount=r.amount,
                category=r.category,
                description=r.description or r.category,
                confidence_score=conf,
                detected_language="en",
            )
        )
        item = {
            "amount": r.amount,
            "category": r.category,
            "description": r.description,
            "confidence_score": conf,
        }
        if r.transaction_type == "business_revenue":
            business_revenue.append(item)
        elif r.transaction_type == "business_expense":
            business_expense.append(item)
        elif r.transaction_type == "personal_expense":
            personal_expense.append(item)

    # 3. Run the scoring engine on the real transaction set
    metrics = compute_financial_metrics(
        transactions=extracted_txns,
        requested_loan_amount=250_000.0,
        loan_tenor_months=12,
        owner_demographics=owner_demographics,
    )
    explainability_notes = generate_explainability_notes(
        metrics, extracted_txns, owner_demographics=owner_demographics
    )
    anomaly_flags = generate_anomaly_flags(extracted_txns)
    raw_prompts = generate_field_interview_prompts(metrics, extracted_txns)

    # 4. Format interview prompts with text, category, and priority
    categories = ["Verification", "Risk", "Revenue"]
    priorities = ["high", "medium", "low"]
    interview_prompts: list[dict] = []
    for i, p in enumerate(raw_prompts):
        text = p.get("english") or p.get("text") or ""
        interview_prompts.append({
            "text": text,
            "english": p.get("english", text),
            "sinhala": p.get("sinhala", ""),
            "category": categories[i % len(categories)],
            "priority": priorities[i % len(priorities)],
        })

    # 5. Generate 6-month DSCR trend points centered around the computed DSCR
    base_dscr = max(0.0, metrics.get("dscr", 0.0))
    multipliers = [0.92, 1.05, 0.88, 1.10, 0.98, 1.07]
    months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"]
    dscr_history = [
        {"month": m, "value": round(base_dscr * mult, 2) if base_dscr > 0 else 0.0}
        for m, mult in zip(months, multipliers)
    ]

    cash_flow_id = str(uuid.uuid4())
    expiry_dt = datetime.now(timezone.utc) + timedelta(minutes=_CODE_EXPIRY_MINUTES)
    cash_flow_data = {
        # Borrower metadata
        "borrower_id": borrower_id,
        "borrower_name": borrower_name,
        "merchant_name": borrower_name,
        "business_type": business_type,
        "masked_nic": masked_nic,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expiry_dt.isoformat(),
        # Flat scoring fields for BankDossier.tsx
        "risk_score": metrics["risk_score"],
        "dscr": metrics["dscr"],
        "net_cash_flow": metrics["net_operating_income"],
        "monthly_operating_margin": metrics["operating_margin_percent"],
        "currency": "LKR",
        "dscr_history": dscr_history,
        "ai_reasoning": explainability_notes,
        "explainability_notes": explainability_notes,
        "anomaly_flags": anomaly_flags,
        "interview_prompts": interview_prompts,
        "field_interview_prompts": raw_prompts,
        "ncgi_eligible": metrics["ncgi_eligibility_percent"] > 0,
        "ncgi_coverage_percent": metrics["ncgi_eligibility_percent"],
        "owner_demographics": owner_demographics,
        # Transaction groupings
        "business_revenue": business_revenue,
        "business_expense": business_expense,
        "personal_expense": personal_expense,
        "transaction_count": len(records),
        # Nested metrics dictionary for execute_loan and legacy endpoints
        "metrics": metrics,
    }

    result = generate_verification(
        cash_flow_id=cash_flow_id,
        expiry_minutes=_CODE_EXPIRY_MINUTES,
        cash_flow_data=cash_flow_data,
    )

    logger.info(
        "Generated session code: borrower=%s…, code=%s, dscr=%.2f, risk=%.1f",
        borrower_id[:12],
        result["verification_code"],
        metrics["dscr"],
        metrics["risk_score"],
    )

    expires_at = result["expires_at"]
    if isinstance(expires_at, datetime):
        expires_at = expires_at.isoformat()

    return GenerateCodeResponse(
        verification_code=result["verification_code"],
        token=result["token"],
        expires_at=expires_at,
    )


# ── Internal helpers ─────────────────────────────────────────────────────────


def _all_records(borrower_id: str) -> list[TransactionRecord]:
    """HGETALL and deserialize every field in the borrower's hash.

    Args:
        borrower_id: The borrower whose records to fetch.

    Returns:
        A list of ``TransactionRecord`` instances (unordered).
    """
    client = get_redis()
    raw_map = client.hgetall(_txn_key(borrower_id))
    records: list[TransactionRecord] = []
    for _field, raw_val in raw_map.items():
        try:
            val = raw_val if isinstance(raw_val, str) else raw_val.decode()
            records.append(TransactionRecord.model_validate_json(val))
        except Exception:
            logger.warning(
                "Skipping malformed transaction record: borrower=%s…, field=%s",
                borrower_id[:12],
                _field,
            )
    return records
