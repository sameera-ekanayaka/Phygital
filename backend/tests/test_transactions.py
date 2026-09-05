"""Tests for the transaction CRUD service and /api/v1/transactions routes.

Covers manual transaction CRUD (add / get / update / delete), filtered
listing with aggregated totals, monthly summaries, AI-ingest append
behavior, and the authenticated route layer (FastAPI TestClient with a
borrower-role JWT).

Service tests use unique per-test borrower IDs so state never leaks
between tests, regardless of whether Redis resolves to a live server or
the fakeredis fallback.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import pytest

from app.api.v1.ingest.schemas import (
    IngestResponse,
    StructuredExtraction,
    TransactionItem,
)
from app.api.v1.transactions.schemas import (
    TransactionCreateRequest,
    TransactionRecord,
    TransactionUpdateRequest,
)
from app.api.v1.transactions.service import (
    add_transaction,
    append_transaction,
    delete_transaction,
    generate_session_code,
    get_monthly_summary,
    get_session_summary,
    get_transaction,
    get_transactions,
    update_transaction,
)
from app.core.auth import create_access_token
from app.core.redis_client import get_redis

BASE_URL = "/api/v1/transactions"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _borrower_id() -> str:
    """Return a unique borrower ID so each test owns an isolated hash."""
    return f"borrower-{uuid.uuid4()}"


def _create_request(**overrides: Any) -> TransactionCreateRequest:
    """Build a valid manual creation payload with optional overrides."""
    payload: dict[str, Any] = {
        "amount": 12_500.0,
        "transaction_type": "business_revenue",
        "category": "retail_sales",
        "description": "Daily shop sales",
        "notes": None,
    }
    payload.update(overrides)
    return TransactionCreateRequest(**payload)


def _seed_record(borrower_id: str, created_at: str, **overrides: Any) -> TransactionRecord:
    """Write a TransactionRecord directly into the borrower's Redis hash.

    Seeding bypasses the service layer so tests can pin deterministic
    ``created_at`` values (e.g. for month grouping) without depending on
    the wall clock.
    """
    fields: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "amount": 10_000.0,
        "transaction_type": "business_revenue",
        "category": "retail_sales",
        "description": "Seeded transaction",
        "notes": None,
        "source": "manual",
        "confidence_score": 0.85,
        "created_at": created_at,
    }
    fields.update(overrides)
    record = TransactionRecord(**fields)
    get_redis().hset(
        f"phygital:txns:{borrower_id}", record.id, record.model_dump_json()
    )
    return record


def _auth_headers(borrower_id: str) -> dict[str, str]:
    """Return Bearer headers for a borrower-role JWT owned by *borrower_id*."""
    token = create_access_token(subject=borrower_id, role="borrower")
    return {"Authorization": f"Bearer {token}"}


def _ingest_response(
    structured: StructuredExtraction | None,
    raw_text: str = "Ada sales eken Rs 15000. Transport ekata Rs 2000.",
) -> IngestResponse:
    """Build an IngestResponse envelope for append_transaction tests."""
    return IngestResponse(
        request_id=uuid.uuid4(),
        status="completed",
        raw_text=raw_text,
        structured_data=structured,
        processed_at=datetime.now(timezone.utc),
    )


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Clear shared slowapi counters so per-minute limits never trip in tests.

    POST /transactions/ is limited to 30/minute and generate-code/report to
    5/minute; the limiter storage is a process-wide singleton shared across
    the whole pytest run, so it must be reset between tests.
    """
    from app.core.limiter import limiter

    limiter.reset()
    yield
    limiter.reset()


# ── Service: add_transaction ─────────────────────────────────────────────────


class TestAddTransaction:
    """Tests for add_transaction (manual creation)."""

    def test_add_creates_record_with_defaults(self) -> None:
        """New manual records get a UUID id, source='manual', confidence 0.85,
        and an auto-generated UTC timestamp."""
        borrower = _borrower_id()
        record = add_transaction(borrower, _create_request())

        # UUID identifier
        uuid.UUID(record.id)  # raises ValueError if malformed

        assert record.source == "manual"
        assert record.confidence_score == 0.85
        assert record.amount == 12_500.0
        assert record.category == "retail_sales"
        assert record.transaction_type == "business_revenue"

        # Auto-timestamped in UTC, close to now
        assert record.created_at.endswith("+00:00")
        created = datetime.fromisoformat(record.created_at)
        elapsed = abs((datetime.now(timezone.utc) - created).total_seconds())
        assert elapsed < 5, f"created_at is {elapsed:.1f}s away from now"

        # Persisted under the borrower's hash and retrievable
        assert get_transaction(borrower, record.id) == record

    def test_add_isolates_records_per_borrower(self) -> None:
        """Records are scoped per borrower — no cross-borrower leakage."""
        borrower_a = _borrower_id()
        borrower_b = _borrower_id()

        rec_a = add_transaction(borrower_a, _create_request(amount=100.0))
        rec_b = add_transaction(borrower_b, _create_request(amount=200.0))

        assert get_transaction(borrower_a, rec_b.id) is None
        assert get_transaction(borrower_b, rec_a.id) is None
        assert get_transactions(borrower_a).total_count == 1
        assert get_transactions(borrower_b).total_count == 1


# ── Service: get_transactions ────────────────────────────────────────────────


class TestGetTransactions:
    """Tests for get_transactions (listing, sorting, filters, totals)."""

    def test_sorted_newest_first_with_totals(self) -> None:
        """Items come back newest-first with correct per-type totals."""
        borrower = _borrower_id()
        _seed_record(
            borrower, "2026-07-15T10:00:00+00:00",
            amount=85_000.0, transaction_type="business_revenue",
            description="July sales",
        )
        _seed_record(
            borrower, "2026-08-15T10:00:00+00:00",
            amount=65_000.0, transaction_type="business_revenue",
            description="August sales",
        )
        _seed_record(
            borrower, "2026-09-15T10:00:00+00:00",
            amount=50_000.0, transaction_type="business_expense",
            description="September stock",
        )
        _seed_record(
            borrower, "2026-09-16T10:00:00+00:00",
            amount=12_000.0, transaction_type="personal_expense",
            description="September household",
        )

        result = get_transactions(borrower)

        assert result.total_count == 4
        assert [r.description for r in result.items] == [
            "September household",
            "September stock",
            "August sales",
            "July sales",
        ]
        assert result.total_revenue == 150_000.0  # 85k + 65k
        assert result.total_expenses == 50_000.0
        assert result.total_personal == 12_000.0
        assert result.net_income == 88_000.0  # 150k - 50k - 12k

    def test_filter_by_txn_type(self) -> None:
        """txn_type filter returns only matching items, with filtered totals."""
        borrower = _borrower_id()
        _seed_record(
            borrower, "2026-07-01T10:00:00+00:00",
            amount=85_000.0, transaction_type="business_revenue",
            description="Sale A",
        )
        _seed_record(
            borrower, "2026-07-02T10:00:00+00:00",
            amount=50_000.0, transaction_type="business_expense",
            description="Expense B",
        )
        _seed_record(
            borrower, "2026-07-03T10:00:00+00:00",
            amount=12_000.0, transaction_type="personal_expense",
            description="Personal C",
        )

        result = get_transactions(borrower, txn_type="business_revenue")

        assert result.total_count == 1
        assert result.items[0].description == "Sale A"
        # Totals are computed over the filtered set only
        assert result.total_revenue == 85_000.0
        assert result.total_expenses == 0.0
        assert result.total_personal == 0.0
        assert result.net_income == 85_000.0

    def test_filter_by_month(self) -> None:
        """month filter (YYYY-MM) matches only records created in that month."""
        borrower = _borrower_id()
        _seed_record(
            borrower, "2026-07-15T10:00:00+00:00",
            amount=85_000.0, transaction_type="business_revenue",
            description="July sale",
        )
        _seed_record(
            borrower, "2026-08-15T10:00:00+00:00",
            amount=50_000.0, transaction_type="business_expense",
            description="August expense",
        )
        _seed_record(
            borrower, "2026-08-16T10:00:00+00:00",
            amount=5_000.0, transaction_type="personal_expense",
            description="August personal",
        )

        result = get_transactions(borrower, month="2026-08")

        assert result.total_count == 2
        assert {r.description for r in result.items} == {
            "August expense", "August personal",
        }
        assert result.total_revenue == 0.0
        assert result.total_expenses == 50_000.0
        assert result.total_personal == 5_000.0

    def test_combined_type_and_month_filters(self) -> None:
        """Both filters applied together narrow the result set."""
        borrower = _borrower_id()
        _seed_record(
            borrower, "2026-07-15T10:00:00+00:00",
            amount=85_000.0, transaction_type="business_revenue",
            description="July revenue",
        )
        _seed_record(
            borrower, "2026-08-15T10:00:00+00:00",
            amount=50_000.0, transaction_type="business_expense",
            description="August expense",
        )
        _seed_record(
            borrower, "2026-08-16T10:00:00+00:00",
            amount=5_000.0, transaction_type="business_expense",
            description="August transport",
        )

        # Expenses in August only
        result = get_transactions(borrower, txn_type="business_expense", month="2026-08")
        assert result.total_count == 2
        assert result.total_expenses == 55_000.0

        # Expenses in July: none exist
        result = get_transactions(borrower, txn_type="business_expense", month="2026-07")
        assert result.total_count == 0
        assert result.total_expenses == 0.0


# ── Service: get_transaction ─────────────────────────────────────────────────


class TestGetTransaction:
    """Tests for get_transaction (single-record fetch)."""

    def test_returns_record_by_id(self) -> None:
        """A stored record round-trips identically through get_transaction."""
        borrower = _borrower_id()
        created = add_transaction(
            borrower, _create_request(notes="paid in cash")
        )

        fetched = get_transaction(borrower, created.id)

        assert fetched == created
        assert fetched is not None
        assert fetched.notes == "paid in cash"

    def test_returns_none_for_nonexistent_id(self) -> None:
        """A random UUID that was never stored returns None."""
        assert get_transaction(_borrower_id(), str(uuid.uuid4())) is None

    def test_returns_none_for_other_borrowers_record(self) -> None:
        """One borrower must not fetch another borrower's transaction."""
        owner = _borrower_id()
        created = add_transaction(owner, _create_request())

        assert get_transaction(_borrower_id(), created.id) is None


# ── Service: update_transaction ──────────────────────────────────────────────


class TestUpdateTransaction:
    """Tests for update_transaction (partial merge)."""

    def test_partial_update_merges_correctly(self) -> None:
        """Only the supplied fields change; the rest keep their values."""
        borrower = _borrower_id()
        created = add_transaction(
            borrower,
            _create_request(
                amount=10_000.0,
                category="retail_sales",
                description="Original description",
                notes="keep me",
            ),
        )

        updated = update_transaction(
            borrower,
            created.id,
            TransactionUpdateRequest(amount=15_000.0, description="Corrected"),
        )

        assert updated is not None
        # Changed fields
        assert updated.amount == 15_000.0
        assert updated.description == "Corrected"
        # Untouched fields
        assert updated.category == "retail_sales"
        assert updated.notes == "keep me"
        assert updated.transaction_type == "business_revenue"
        assert updated.source == "manual"
        assert updated.id == created.id

        # The merge is persisted in Redis
        persisted = get_transaction(borrower, created.id)
        assert persisted is not None
        assert persisted.amount == 15_000.0
        assert persisted.description == "Corrected"

    def test_empty_update_is_a_noop(self) -> None:
        """An update payload with no fields set leaves the record unchanged."""
        borrower = _borrower_id()
        created = add_transaction(borrower, _create_request())

        updated = update_transaction(borrower, created.id, TransactionUpdateRequest())

        assert updated == created

    def test_update_nonexistent_returns_none(self) -> None:
        """Updating a missing transaction returns None (no exception)."""
        result = update_transaction(
            _borrower_id(),
            str(uuid.uuid4()),
            TransactionUpdateRequest(amount=1.0),
        )
        assert result is None


# ── Service: delete_transaction ──────────────────────────────────────────────


class TestDeleteTransaction:
    """Tests for delete_transaction."""

    def test_delete_existing_record(self) -> None:
        """Deleting a stored record returns True and removes it."""
        borrower = _borrower_id()
        created = add_transaction(borrower, _create_request())

        assert delete_transaction(borrower, created.id) is True
        assert get_transaction(borrower, created.id) is None
        assert get_transactions(borrower).total_count == 0

    def test_delete_nonexistent_returns_false(self) -> None:
        """Deleting a missing transaction returns False (no exception)."""
        assert delete_transaction(_borrower_id(), str(uuid.uuid4())) is False

    def test_delete_twice_returns_false_second_time(self) -> None:
        """A second delete of the same ID returns False."""
        borrower = _borrower_id()
        created = add_transaction(borrower, _create_request())

        assert delete_transaction(borrower, created.id) is True
        assert delete_transaction(borrower, created.id) is False

    def test_delete_targets_own_borrower_only(self) -> None:
        """One borrower cannot delete another borrower's transaction."""
        owner = _borrower_id()
        created = add_transaction(owner, _create_request())

        assert delete_transaction(_borrower_id(), created.id) is False
        assert get_transaction(owner, created.id) is not None


# ── Service: get_monthly_summary ─────────────────────────────────────────────


class TestMonthlySummary:
    """Tests for get_monthly_summary (per-month aggregation)."""

    def test_groups_transactions_by_month(self) -> None:
        """Totals are bucketed per YYYY-MM, newest month first."""
        borrower = _borrower_id()
        # July: a single revenue entry
        _seed_record(
            borrower, "2026-07-10T09:00:00+00:00",
            amount=85_000.0, transaction_type="business_revenue",
            description="July sale",
        )
        # August: 2 revenue + 1 expense + 1 personal
        _seed_record(
            borrower, "2026-08-10T09:00:00+00:00",
            amount=65_000.0, transaction_type="business_revenue",
            description="August sale 1",
        )
        _seed_record(
            borrower, "2026-08-11T09:00:00+00:00",
            amount=15_000.0, transaction_type="business_revenue",
            description="August sale 2",
        )
        _seed_record(
            borrower, "2026-08-12T09:00:00+00:00",
            amount=50_000.0, transaction_type="business_expense",
            description="August stock",
        )
        _seed_record(
            borrower, "2026-08-13T09:00:00+00:00",
            amount=12_000.0, transaction_type="personal_expense",
            description="August household",
        )

        summary = get_monthly_summary(borrower)

        # Newest month first
        assert [m.month for m in summary.months] == ["2026-08", "2026-07"]

        august = summary.months[0]
        assert august.revenue == 80_000.0  # 65k + 15k
        assert august.expenses == 50_000.0
        assert august.personal == 12_000.0
        assert august.net_income == 18_000.0  # 80k - 50k - 12k
        assert august.count == 4

        july = summary.months[1]
        assert july.revenue == 85_000.0
        assert july.expenses == 0.0
        assert july.personal == 0.0
        assert july.net_income == 85_000.0
        assert july.count == 1

    def test_empty_summary_has_no_months(self) -> None:
        """A borrower with no transactions gets an empty months list."""
        summary = get_monthly_summary(_borrower_id())

        assert summary.months == []


# ── Service: append_transaction ──────────────────────────────────────────────


class TestAppendTransaction:
    """Tests for append_transaction (AI-ingest pipeline)."""

    def test_structured_items_become_individual_records(self) -> None:
        """Each extracted item is stored as its own record with source='ai_upload'."""
        borrower = _borrower_id()
        structured = StructuredExtraction(
            business_revenue=[
                TransactionItem(
                    amount=15_000.0, category="agricultural_sale",
                    description="Harvest sales — 50 kilos", source_confidence=0.88,
                ),
            ],
            business_expense=[
                TransactionItem(
                    amount=2_000.0, category="transport",
                    description="Lorry transport", source_confidence=0.85,
                ),
            ],
            personal_expense=[
                TransactionItem(
                    amount=3_500.0, category="household",
                    description="Household groceries", source_confidence=0.75,
                ),
            ],
        )

        append_transaction(borrower, _ingest_response(structured))

        result = get_transactions(borrower)

        assert result.total_count == 3
        assert all(r.source == "ai_upload" for r in result.items)
        assert all(r.notes is None for r in result.items)

        by_type = {r.transaction_type: r for r in result.items}
        assert by_type["business_revenue"].amount == 15_000.0
        assert by_type["business_revenue"].category == "agricultural_sale"
        assert by_type["business_revenue"].description == "Harvest sales — 50 kilos"
        assert by_type["business_expense"].amount == 2_000.0
        assert by_type["business_expense"].category == "transport"
        assert by_type["personal_expense"].amount == 3_500.0
        assert by_type["personal_expense"].description == "Household groceries"
        # source_confidence from the AI pipeline is now correctly propagated
        # into each stored record's confidence_score field.
        assert by_type["business_revenue"].confidence_score == 0.88
        assert by_type["business_expense"].confidence_score == 0.85
        assert by_type["personal_expense"].confidence_score == 0.75

        # Totals include the AI-uploaded amounts
        assert result.total_revenue == 15_000.0
        assert result.total_expenses == 2_000.0
        assert result.total_personal == 3_500.0

    def test_fallback_record_when_structured_data_is_none(self) -> None:
        """No structured_data → a single zero-amount record with the raw text."""
        borrower = _borrower_id()

        append_transaction(
            borrower,
            _ingest_response(None, raw_text="raw ledger text, unreadable"),
        )

        result = get_transactions(borrower)

        assert result.total_count == 1
        record = result.items[0]
        assert record.source == "ai_upload"
        assert record.amount == 0.0
        assert record.confidence_score == 0.0
        assert record.description == "raw ledger text, unreadable"
        assert record.transaction_type == "business_expense"
        assert record.category == "other"

    def test_fallback_record_when_all_arrays_empty(self) -> None:
        """Structured data present but with empty arrays → fallback record."""
        borrower = _borrower_id()

        append_transaction(
            borrower,
            _ingest_response(StructuredExtraction(), raw_text="no txns"),
        )

        result = get_transactions(borrower)
        assert result.total_count == 1
        assert result.items[0].source == "ai_upload"
        assert result.items[0].amount == 0.0
        assert result.items[0].description == "no txns"


# ── Edge cases ───────────────────────────────────────────────────────────────


class TestEdgeCases:
    """Cross-cutting edge cases for the transaction store."""

    def test_empty_list_returns_zeroed_totals(self) -> None:
        """A borrower with no transactions gets zeroed aggregates."""
        result = get_transactions(_borrower_id())

        assert result.items == []
        assert result.total_count == 0
        assert result.total_revenue == 0.0
        assert result.total_expenses == 0.0
        assert result.total_personal == 0.0
        assert result.net_income == 0.0

    def test_mixed_manual_and_ai_totals(self) -> None:
        """Manual + AI-uploaded records are combined in the totals."""
        borrower = _borrower_id()

        # Manual: 10k revenue
        add_transaction(
            borrower,
            _create_request(amount=10_000.0, description="Manual sale"),
        )

        # AI upload: 5k revenue + 3k expense
        structured = StructuredExtraction(
            business_revenue=[
                TransactionItem(
                    amount=5_000.0, category="retail_sales",
                    description="AI-extracted sale", source_confidence=0.9,
                ),
            ],
            business_expense=[
                TransactionItem(
                    amount=3_000.0, category="inventory",
                    description="AI-extracted stock", source_confidence=0.8,
                ),
            ],
        )
        append_transaction(borrower, _ingest_response(structured))

        result = get_transactions(borrower)

        assert result.total_count == 3
        assert result.total_revenue == 15_000.0  # 10k manual + 5k AI
        assert result.total_expenses == 3_000.0
        assert result.total_personal == 0.0
        assert result.net_income == 12_000.0

        sources = sorted(r.source for r in result.items)
        assert sources == ["ai_upload", "ai_upload", "manual"]


# ── Legacy LIST → HASH migration ─────────────────────────────────────────


def _legacy_envelope(
    revenue: list[dict] | None = None,
    expenses: list[dict] | None = None,
    personal: list[dict] | None = None,
) -> dict:
    """Build a pre-migration ingest envelope in the legacy LIST format."""
    return {
        "structured_data": {
            "business_revenue": revenue or [],
            "business_expense": expenses or [],
            "personal_expense": personal or [],
        }
    }


def _seed_legacy_list(borrower_id: str, *envelopes: dict) -> None:
    """RPUSH pre-migration ingest envelopes into the legacy Redis LIST key.

    Mimics the pre-migration storage format: one JSON blob per AI-ingest
    upload under ``phygital:txn_session:{borrower_id}``, holding either a
    ``structured_data`` dict or bare ``raw_text``.
    """
    r = get_redis()
    for envelope in envelopes:
        r.rpush(f"phygital:txn_session:{borrower_id}", json.dumps(envelope))


class TestLegacyListMigration:
    """Regression tests: every read entry point must migrate a legacy LIST
    session into the HASH before reading.

    Before the fix, only ``get_session_summary`` ran the migration, so a
    borrower with a pre-migration session got a spurious 400 from
    ``POST /generate-code`` / ``POST /generate-report`` because
    ``generate_session_code`` read an empty HASH.
    """

    def test_generate_session_code_migrates_legacy_list(self) -> None:
        """The critical regression: code generation on a legacy-only session
        succeeds instead of raising ValueError (→ HTTP 400)."""
        borrower = _borrower_id()
        _seed_legacy_list(
            borrower,
            _legacy_envelope(
                revenue=[
                    {
                        "amount": 15_000.0,
                        "category": "agricultural_sale",
                        "description": "Harvest sales",
                        "source_confidence": 0.88,
                    }
                ],
                expenses=[
                    {
                        "amount": 2_000.0,
                        "category": "transport",
                        "description": "Lorry transport",
                        "source_confidence": 0.85,
                    }
                ],
            ),
        )

        result = generate_session_code(borrower)

        assert result.verification_code.startswith("PHYG-")
        assert result.token
        assert result.expires_at

        # Migration side effects: legacy LIST deleted, HASH populated
        r = get_redis()
        assert not r.exists(f"phygital:txn_session:{borrower}")
        listing = get_transactions(borrower)
        assert listing.total_count == 2
        assert listing.total_revenue == 15_000.0
        assert listing.total_expenses == 2_000.0

    def test_generate_session_code_migrates_fallback_envelope(self) -> None:
        """Legacy envelopes without structured_data become fallback records."""
        borrower = _borrower_id()
        _seed_legacy_list(borrower, {"raw_text": "old unreadable ledger note"})

        result = generate_session_code(borrower)

        assert result.verification_code.startswith("PHYG-")
        record = get_transactions(borrower).items[0]
        assert record.description == "old unreadable ledger note"
        assert record.amount == 0.0
        assert record.source == "ai_upload"

    def test_get_transactions_migrates_legacy_list(self) -> None:
        """Listing migrates: legacy LIST deleted, items visible with totals."""
        borrower = _borrower_id()
        _seed_legacy_list(
            borrower,
            _legacy_envelope(
                revenue=[
                    {
                        "amount": 100.0,
                        "category": "retail_sales",
                        "description": "Sale",
                    }
                ],
            ),
        )

        result = get_transactions(borrower)

        assert result.total_count == 1
        assert result.total_revenue == 100.0
        assert not get_redis().exists(f"phygital:txn_session:{borrower}")

    def test_get_monthly_summary_migrates_legacy_list(self) -> None:
        """Monthly summary includes migrated pre-migration records."""
        borrower = _borrower_id()
        _seed_legacy_list(
            borrower,
            _legacy_envelope(
                revenue=[
                    {
                        "amount": 120_000.0,
                        "category": "retail_sales",
                        "description": "Sale",
                    }
                ],
            ),
        )

        summary = get_monthly_summary(borrower)

        assert len(summary.months) == 1
        assert summary.months[0].revenue == 120_000.0
        assert summary.months[0].count == 1
        assert not get_redis().exists(f"phygital:txn_session:{borrower}")

    def test_get_session_summary_migrates_legacy_list(self) -> None:
        """Session summary keeps its pre-existing migration behavior."""
        borrower = _borrower_id()
        _seed_legacy_list(
            borrower,
            _legacy_envelope(
                revenue=[
                    {
                        "amount": 500.0,
                        "category": "retail_sales",
                        "description": "Sale",
                    }
                ],
                expenses=[
                    {
                        "amount": 200.0,
                        "category": "transport",
                        "description": "Bus fare",
                    }
                ],
            ),
        )

        summary = get_session_summary(borrower)

        assert summary.transaction_count == 2
        assert summary.total_revenue == 500.0
        assert summary.total_expenses == 200.0
        assert not get_redis().exists(f"phygital:txn_session:{borrower}")

    def test_migration_is_idempotent(self) -> None:
        """Re-reading after migration does not duplicate records."""
        borrower = _borrower_id()
        _seed_legacy_list(
            borrower,
            _legacy_envelope(
                revenue=[
                    {
                        "amount": 75.0,
                        "category": "retail_sales",
                        "description": "Sale",
                    }
                ],
            ),
        )

        first = get_transactions(borrower)
        second = get_transactions(borrower)

        assert first.total_count == 1
        assert second.total_count == 1

    def test_no_legacy_key_is_a_noop(self) -> None:
        """Borrowers without a legacy key read normally (no key created)."""
        borrower = _borrower_id()

        assert get_transactions(borrower).total_count == 0
        # A genuinely empty session still raises for code generation
        with pytest.raises(ValueError):
            generate_session_code(borrower)
        assert not get_redis().exists(f"phygital:txn_session:{borrower}")

    def test_generate_code_route_with_legacy_session(self, client) -> None:
        """POST /generate-code returns 200 (not 400) for a legacy-only session."""
        borrower = _borrower_id()
        _seed_legacy_list(
            borrower,
            _legacy_envelope(
                revenue=[
                    {
                        "amount": 10_000.0,
                        "category": "retail_sales",
                        "description": "Sale",
                    }
                ],
            ),
        )

        resp = client.post(f"{BASE_URL}/generate-code", headers=_auth_headers(borrower))

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["verification_code"].startswith("PHYG-")
        assert data["token"]
        assert data["expires_at"]


# ── Route-level tests ────────────────────────────────────────────────────────


class TestTransactionRoutes:
    """Tests for the /api/v1/transactions endpoints via TestClient.

    All endpoints require a borrower-role JWT, so every request carries an
    Authorization header minted for a synthetic borrower.
    """

    def test_create_transaction_returns_201(self, client) -> None:
        """POST / creates a manual transaction and echoes the full record."""
        borrower = _borrower_id()
        resp = client.post(
            f"{BASE_URL}/",
            json={
                "amount": 12_500.0,
                "transaction_type": "business_revenue",
                "category": "retail_sales",
                "description": "Morning sales",
                "notes": "cash sale",
            },
            headers=_auth_headers(borrower),
        )

        assert resp.status_code == 201, resp.text
        data = resp.json()
        uuid.UUID(data["id"])  # id is a valid UUID
        assert data["source"] == "manual"
        assert data["confidence_score"] == 0.85
        assert data["amount"] == 12_500.0
        assert data["category"] == "retail_sales"
        assert data["description"] == "Morning sales"
        assert data["notes"] == "cash sale"
        assert data["created_at"]

        # The record is persisted under the authenticated borrower
        assert get_transaction(borrower, data["id"]) is not None

    def test_create_rejects_non_positive_amount(self, client) -> None:
        """Amount must be > 0 — anything else is a 422 validation error."""
        resp = client.post(
            f"{BASE_URL}/",
            json={
                "amount": -50.0,
                "transaction_type": "business_revenue",
                "category": "retail_sales",
                "description": "Invalid amount",
            },
            headers=_auth_headers(_borrower_id()),
        )
        assert resp.status_code == 422

    def test_list_transactions_with_totals(self, client) -> None:
        """GET / lists the borrower's transactions with computed totals."""
        borrower = _borrower_id()
        # Seed via the service to keep the route's 30/min budget untouched
        add_transaction(
            borrower,
            _create_request(amount=85_000.0, description="Sale", notes=None),
        )
        add_transaction(
            borrower,
            _create_request(
                amount=50_000.0, transaction_type="business_expense",
                category="inventory", description="Stock purchase",
            ),
        )
        add_transaction(
            borrower,
            _create_request(
                amount=12_000.0, transaction_type="personal_expense",
                category="household", description="Groceries",
            ),
        )

        resp = client.get(f"{BASE_URL}/", headers=_auth_headers(borrower))

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total_count"] == 3
        assert data["total_revenue"] == 85_000.0
        assert data["total_expenses"] == 50_000.0
        assert data["total_personal"] == 12_000.0
        assert data["net_income"] == 23_000.0
        assert len(data["items"]) == 3

    def test_list_empty_session_returns_zeroed_totals(self, client) -> None:
        """GET / for a fresh borrower returns an empty list and zero totals."""
        resp = client.get(f"{BASE_URL}/", headers=_auth_headers(_borrower_id()))

        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total_count"] == 0
        assert data["total_revenue"] == 0.0
        assert data["total_expenses"] == 0.0
        assert data["total_personal"] == 0.0
        assert data["net_income"] == 0.0

    def test_list_with_query_filters(self, client) -> None:
        """GET / supports ?type= and ?month= query filters."""
        borrower = _borrower_id()
        _seed_record(
            borrower, "2026-07-15T10:00:00+00:00",
            amount=85_000.0, transaction_type="business_revenue",
            description="July sale",
        )
        _seed_record(
            borrower, "2026-08-15T10:00:00+00:00",
            amount=50_000.0, transaction_type="business_expense",
            description="August expense",
        )
        _seed_record(
            borrower, "2026-08-16T10:00:00+00:00",
            amount=5_000.0, transaction_type="business_expense",
            description="August transport",
        )
        headers = _auth_headers(borrower)

        # Filter by type
        resp = client.get(
            f"{BASE_URL}/", params={"type": "business_expense"}, headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_count"] == 2
        assert data["total_expenses"] == 55_000.0

        # Filter by month
        resp = client.get(
            f"{BASE_URL}/", params={"month": "2026-08"}, headers=headers
        )
        assert resp.status_code == 200
        assert resp.json()["total_count"] == 2

        # Combined filters: August revenue only → none
        resp = client.get(
            f"{BASE_URL}/",
            params={"type": "business_revenue", "month": "2026-08"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total_count"] == 0

    def test_get_single_transaction(self, client) -> None:
        """GET /{txn_id} returns the full record."""
        borrower = _borrower_id()
        created = add_transaction(borrower, _create_request())

        resp = client.get(
            f"{BASE_URL}/{created.id}", headers=_auth_headers(borrower)
        )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["id"] == created.id
        assert data["amount"] == 12_500.0
        assert data["source"] == "manual"

    def test_get_missing_transaction_returns_404(self, client) -> None:
        """GET /{txn_id} for an unknown ID returns 404 with a detail message."""
        resp = client.get(
            f"{BASE_URL}/{uuid.uuid4()}",
            headers=_auth_headers(_borrower_id()),
        )

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Transaction not found"

    def test_update_transaction(self, client) -> None:
        """PUT /{txn_id} applies a partial update and returns the record."""
        borrower = _borrower_id()
        created = add_transaction(
            borrower, _create_request(amount=10_000.0, description="Original")
        )

        resp = client.put(
            f"{BASE_URL}/{created.id}",
            json={"amount": 15_000.0, "description": "Corrected"},
            headers=_auth_headers(borrower),
        )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["amount"] == 15_000.0
        assert data["description"] == "Corrected"
        assert data["category"] == "retail_sales"  # untouched field

    def test_update_missing_transaction_returns_404(self, client) -> None:
        """PUT /{txn_id} for an unknown ID returns 404."""
        resp = client.put(
            f"{BASE_URL}/{uuid.uuid4()}",
            json={"amount": 15_000.0},
            headers=_auth_headers(_borrower_id()),
        )

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Transaction not found"

    def test_delete_transaction(self, client) -> None:
        """DELETE /{txn_id} removes the record and confirms with a message."""
        borrower = _borrower_id()
        created = add_transaction(borrower, _create_request())

        resp = client.delete(
            f"{BASE_URL}/{created.id}", headers=_auth_headers(borrower)
        )

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"message": "Transaction deleted"}

        # The transaction is really gone
        follow_up = client.get(
            f"{BASE_URL}/{created.id}", headers=_auth_headers(borrower)
        )
        assert follow_up.status_code == 404

    def test_delete_missing_transaction_returns_404(self, client) -> None:
        """DELETE /{txn_id} for an unknown ID returns 404."""
        resp = client.delete(
            f"{BASE_URL}/{uuid.uuid4()}",
            headers=_auth_headers(_borrower_id()),
        )

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Transaction not found"

    def test_monthly_summary_endpoint(self, client) -> None:
        """GET /monthly-summary returns per-month buckets, newest first."""
        borrower = _borrower_id()
        _seed_record(
            borrower, "2026-07-10T09:00:00+00:00",
            amount=85_000.0, transaction_type="business_revenue",
            description="July sale",
        )
        _seed_record(
            borrower, "2026-08-10T09:00:00+00:00",
            amount=50_000.0, transaction_type="business_expense",
            description="August expense",
        )

        resp = client.get(
            f"{BASE_URL}/monthly-summary", headers=_auth_headers(borrower)
        )

        assert resp.status_code == 200, resp.text
        months = resp.json()["months"]
        assert [m["month"] for m in months] == ["2026-08", "2026-07"]
        assert months[0]["expenses"] == 50_000.0
        assert months[0]["net_income"] == -50_000.0
        assert months[1]["revenue"] == 85_000.0
        assert months[1]["count"] == 1

    def test_generate_report_returns_verification_code(self, client) -> None:
        """POST /generate-report behaves like /generate-code for a non-empty session."""
        borrower = _borrower_id()
        add_transaction(borrower, _create_request())

        resp = client.post(
            f"{BASE_URL}/generate-report", headers=_auth_headers(borrower)
        )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["verification_code"].startswith("PHYG-")
        assert data["token"]
        assert data["expires_at"]

    def test_generate_report_empty_session_returns_400(self, client) -> None:
        """POST /generate-report without any transactions returns 400."""
        resp = client.post(
            f"{BASE_URL}/generate-report",
            headers=_auth_headers(_borrower_id()),
        )

        assert resp.status_code == 400

    def test_generate_code_and_generate_report_parity(self, client) -> None:
        """Both code-generation endpoints succeed on the same session."""
        borrower = _borrower_id()
        add_transaction(borrower, _create_request())
        headers = _auth_headers(borrower)

        code_resp = client.post(f"{BASE_URL}/generate-code", headers=headers)
        report_resp = client.post(f"{BASE_URL}/generate-report", headers=headers)

        assert code_resp.status_code == 200, code_resp.text
        assert report_resp.status_code == 200, report_resp.text
        for payload in (code_resp.json(), report_resp.json()):
            assert payload["verification_code"].startswith("PHYG-")
            assert payload["token"]
            assert payload["expires_at"]

    def test_borrower_isolation_via_routes(self, client) -> None:
        """A borrower only sees their own transactions through the routes."""
        borrower_a = _borrower_id()
        borrower_b = _borrower_id()
        add_transaction(
            borrower_a,
            _create_request(amount=999.0, description="A's transaction"),
        )

        resp_b = client.get(f"{BASE_URL}/", headers=_auth_headers(borrower_b))
        assert resp_b.status_code == 200
        assert resp_b.json()["total_count"] == 0

        resp_a = client.get(f"{BASE_URL}/", headers=_auth_headers(borrower_a))
        assert resp_a.json()["total_count"] == 1
        assert resp_a.json()["items"][0]["description"] == "A's transaction"

    def test_officer_token_rejected_with_403(self, client) -> None:
        """Officer-role tokens must not access borrower transaction routes."""
        officer_token = create_access_token(
            subject="officer.perera", role="officer"
        )
        resp = client.get(
            f"{BASE_URL}/",
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Borrower access required"

    def test_no_token_dev_bypass_is_officer_role_403(self, client) -> None:
        """With DEBUG=true the unauthenticated dev fallback is an officer,
        which the borrower-guarded routes reject with 403."""
        resp = client.get(f"{BASE_URL}/")

        assert resp.status_code == 403
        assert resp.json()["detail"] == "Borrower access required"
