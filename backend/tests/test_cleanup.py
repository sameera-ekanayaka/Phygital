"""PDPA consent revoke and ephemeral data cleanup tests.

Verifies the end-to-end PDPA No. 9 of 2022 Section 14 right-to-erasure flow:
consent recording → ephemeral data seeding → consent revocation → data purge.
"""

from __future__ import annotations

import pytest


CONSENT_RECORD_URL = "/api/v1/consent/record"
CONSENT_REVOKE_URL = "/api/v1/consent/revoke"
AUDIT_LOG_URL = "/api/v1/consent/audit-log"


def test_pdpa_consent_revoke_and_cleanup(client) -> None:
    """Record consent, seed ephemeral data, revoke consent, verify purge."""
    # ── Step 1: Record consent ─────────────────────────────────────────────
    record_resp = client.post(
        CONSENT_RECORD_URL,
        json={
            "nic_number": "200012345678",
            "scope": "MSME Cash Flow Appraisal",
            "purpose_limitation": ["credit_assessment", "cash_flow_analysis"],
            "data_categories": ["voice_recordings", "ledger_images", "chat_transcripts"],
            "session_id": "binithi-session-001",
        },
    )
    assert record_resp.status_code == 200, record_resp.text
    record_data = record_resp.json()
    consent_id = record_data["consent_id"]
    assert consent_id  # non-empty

    # ── Step 2: Seed mock ephemeral data in Redis ─────────────────────────
    from app.core.redis_client import get_redis

    r = get_redis()
    r.set("session:binithi-session-001:audio:recording1", "mock_audio_data")
    r.set("session:binithi-session-001:ocr:image1", "mock_ocr_data")
    r.set("session:binithi-session-001:raw_text:chat1", "mock_chat_data")

    # Sanity: confirm keys exist before revocation
    assert r.get("session:binithi-session-001:audio:recording1") is not None
    assert r.get("session:binithi-session-001:ocr:image1") is not None
    assert r.get("session:binithi-session-001:raw_text:chat1") is not None

    # ── Step 3: Revoke consent (triggers right-to-erasure) ────────────────
    revoke_resp = client.post(
        CONSENT_REVOKE_URL,
        json={
            "consent_id": consent_id,
            "nic_number": "200012345678",
            "reason": "Data subject exercising PDPA Section 14 right-to-erasure",
            "session_id": "binithi-session-001",
        },
    )
    assert revoke_resp.status_code == 200, revoke_resp.text
    revoke_data = revoke_resp.json()
    assert revoke_data["data_purged"] is True

    # ── Step 4: Verify Redis keys are purged ──────────────────────────────
    assert r.get("session:binithi-session-001:audio:recording1") is None
    assert r.get("session:binithi-session-001:ocr:image1") is None
    assert r.get("session:binithi-session-001:raw_text:chat1") is None

    # ── Step 5: Verify audit log exists and has entries ───────────────────
    audit_resp = client.get(f"{AUDIT_LOG_URL}/{consent_id}")
    assert audit_resp.status_code == 200, audit_resp.text
    audit_data = audit_resp.json()
    assert audit_data["total_entries"] >= 1, (
        "Expected at least one audit log entry (consent_recorded or consent_revoked)"
    )
