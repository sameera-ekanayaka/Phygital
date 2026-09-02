"""Borrower authentication service — registration, OTP, login, and profile.

All borrower records are stored in Redis with HMAC-SHA256 hashed NICs
(PDPA No. 9 of 2022 Section 12 — Data Minimization).  Passwords are
similarly hashed using an HMAC keyed with the application secret so that
offline brute-force is infeasible without the key material.
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

from app.api.v1.borrower_auth.schemas import (
    BorrowerLoginResponse,
    BorrowerProfileResponse,
    BorrowerRegisterRequest,
    BorrowerRegisterResponse,
    OtpVerifyResponse,
)
from app.config import get_settings
from app.core.auth import create_access_token
from app.core.redis_client import get_redis
from app.core.security import detect_gender_from_nic, hash_nic

logger = logging.getLogger(__name__)

# ── Redis key patterns ───────────────────────────────────────────────────────
_BORROWER_PREFIX = "phygital:borrower:"        # → JSON blob keyed by nic_hash
_PHONE_INDEX_PREFIX = "phygital:borrower_phone:"  # → nic_hash keyed by phone
_OTP_PREFIX = "phygital:otp:"                  # → 6-digit code keyed by phone

# TTLs
_BORROWER_TTL_SECONDS = 90 * 24 * 3600  # 90 days
_OTP_TTL_SECONDS = 5 * 60              # 5 minutes


# ── Password hashing ────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    """Return an HMAC-SHA256 hex digest of *password* using the app secret.

    Mirrors the ``hash_nic`` pattern from ``app.core.security`` so that
    password storage is resistant to offline attacks without the key.

    Args:
        password: The plaintext password to hash.

    Returns:
        A 64-character lowercase hex digest.
    """
    settings = get_settings()
    return hmac.new(
        key=settings.secret_key.encode("utf-8"),
        msg=password.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()


# ── Registration ─────────────────────────────────────────────────────────────


def register_borrower(
    data: BorrowerRegisterRequest,
) -> BorrowerRegisterResponse:
    """Register a new borrower in Redis with hashed NIC and password.

    Generates a mock OTP code (``123456``) and stores it with a 5-minute
    TTL.  In debug mode the OTP is echoed back in the response for
    frictionless local development.

    Args:
        data: Registration request containing name, phone, NIC, and password.

    Returns:
        BorrowerRegisterResponse with the derived borrower_id.

    Raises:
        ValueError: If a borrower with the same NIC hash already exists.
    """
    settings = get_settings()
    client = get_redis()

    nic_hash = hash_nic(data.nic)
    borrower_key = f"{_BORROWER_PREFIX}{nic_hash}"

    # Duplicate check
    if client.exists(borrower_key):
        raise ValueError("A borrower with this NIC is already registered.")

    password_hash = hash_password(data.password)

    # Detect gender from NIC; fall back to "unknown" on bad format so
    # registration is never blocked by a NIC parsing error.
    try:
        gender = detect_gender_from_nic(data.nic)
    except ValueError as exc:
        logger.warning("Gender detection failed for NIC: %s", exc)
        gender = "unknown"

    borrower_record = json.dumps({
        "name": data.name,
        "phone": data.phone,
        "nic_hash": nic_hash,
        "password_hash": password_hash,
        "gender": gender,
        "liya_shakthi_member": data.liya_shakthi_member,
        "verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Store borrower record and phone index with 90-day TTL
    client.setex(borrower_key, _BORROWER_TTL_SECONDS, borrower_record)
    client.setex(
        f"{_PHONE_INDEX_PREFIX}{data.phone}",
        _BORROWER_TTL_SECONDS,
        nic_hash,
    )

    # Generate mock OTP and store with 5-min TTL
    otp_code = "123456"
    client.setex(f"{_OTP_PREFIX}{data.phone}", _OTP_TTL_SECONDS, otp_code)

    logger.info(
        "Borrower registered: name=%s, phone=%s, nic_hash=%s…",
        data.name,
        data.phone,
        nic_hash[:12],
    )

    response = BorrowerRegisterResponse(
        borrower_id=nic_hash,
        message="Registration successful. Please verify your phone with the OTP sent.",
    )

    if settings.debug:
        response.otp_hint = otp_code

    return response


# ── OTP Verification ─────────────────────────────────────────────────────────


def verify_otp(phone: str, code: str) -> OtpVerifyResponse:
    """Verify a 6-digit OTP code for the given phone number.

    On success the OTP key is deleted and the linked borrower record is
    updated to ``verified=True``.

    Args:
        phone: The phone number the OTP was issued to.
        code: The 6-digit code entered by the borrower.

    Returns:
        OtpVerifyResponse indicating success or failure.
    """
    client = get_redis()
    otp_key = f"{_OTP_PREFIX}{phone}"

    stored_code = client.get(otp_key)
    if stored_code is None:
        return OtpVerifyResponse(
            verified=False,
            message="OTP has expired or was not found. Please request a new one.",
        )

    if stored_code != code:
        return OtpVerifyResponse(verified=False, message="Invalid OTP code.")

    # Delete used OTP
    client.delete(otp_key)

    # Mark borrower as verified via phone index
    nic_hash = client.get(f"{_PHONE_INDEX_PREFIX}{phone}")
    if nic_hash:
        borrower_key = f"{_BORROWER_PREFIX}{nic_hash}"
        raw = client.get(borrower_key)
        if raw:
            record = json.loads(raw)
            record["verified"] = True
            ttl = client.ttl(borrower_key)
            if ttl > 0:
                client.setex(borrower_key, ttl, json.dumps(record))
            else:
                client.setex(borrower_key, _BORROWER_TTL_SECONDS, json.dumps(record))
            logger.info("Borrower verified: phone=%s, nic_hash=%s…", phone, nic_hash[:12])

    return OtpVerifyResponse(verified=True, message="Phone verified successfully.")


# ── Login ────────────────────────────────────────────────────────────────────


def login_borrower(identifier: str, password: str) -> BorrowerLoginResponse:
    """Authenticate a borrower by NIC or phone and issue a JWT.

    Determines whether *identifier* is a phone number (all digits, starts
    with ``0``) or a NIC, resolves to the borrower record, verifies the
    password hash, checks that the account is verified, and issues a
    signed JWT via ``create_access_token``.

    Args:
        identifier: NIC string or phone number.
        password: Plaintext password to verify.

    Returns:
        BorrowerLoginResponse containing the JWT and borrower name.

    Raises:
        ValueError: On invalid credentials or unverified account.
    """
    client = get_redis()

    # Determine lookup strategy
    if identifier.isdigit() and identifier.startswith("0"):
        # Phone-based lookup: phone index → nic_hash
        nic_hash = client.get(f"{_PHONE_INDEX_PREFIX}{identifier}")
        if nic_hash is None:
            raise ValueError("No borrower found with this phone number.")
    else:
        # NIC-based lookup
        nic_hash = hash_nic(identifier)

    borrower_key = f"{_BORROWER_PREFIX}{nic_hash}"
    raw = client.get(borrower_key)
    if raw is None:
        raise ValueError("No borrower found with these credentials.")

    record = json.loads(raw)

    # Password verification
    expected_hash = hash_password(password)
    if record.get("password_hash") != expected_hash:
        raise ValueError("Incorrect password.")

    # Verification gate
    if not record.get("verified", False):
        raise ValueError(
            "Account not yet verified. Please complete OTP verification first."
        )

    token = create_access_token(subject=nic_hash, role="borrower")
    logger.info("Borrower logged in: nic_hash=%s…", nic_hash[:12])

    return BorrowerLoginResponse(
        access_token=token,
        borrower_name=record["name"],
    )


# ── Profile ──────────────────────────────────────────────────────────────────


def get_borrower_profile(nic_hash: str) -> BorrowerProfileResponse:
    """Retrieve the borrower profile for the given NIC hash.

    The NIC is masked in the response: only the first 3 characters and
    the last character are shown, with asterisks in between.

    Args:
        nic_hash: The HMAC-SHA256 hash of the borrower's NIC.

    Returns:
        BorrowerProfileResponse with masked NIC and profile details.

    Raises:
        ValueError: If no borrower record exists for *nic_hash*.
    """
    client = get_redis()
    raw = client.get(f"{_BORROWER_PREFIX}{nic_hash}")
    if raw is None:
        raise ValueError("Borrower profile not found.")

    record = json.loads(raw)

    # Mask NIC hash: show first 3 + last char
    masked = nic_hash[:3] + "*" * (len(nic_hash) - 4) + nic_hash[-1]

    return BorrowerProfileResponse(
        name=record["name"],
        phone=record["phone"],
        nic_masked=masked,
        gender=record.get("gender", "unknown"),
        liya_shakthi_member=record.get("liya_shakthi_member", False),
        verified=record.get("verified", False),
    )


# ── Test Seed ────────────────────────────────────────────────────────────────


def seed_test_borrower() -> None:
    """Create a pre-verified test borrower if one does not already exist.

    Uses the same hashing functions as the live registration flow so that
    the test record is indistinguishable from a real one.  Intended for
    local development and integration testing.

    Seed data:
        - name: ``Binithi Perera``
        - phone: ``0771234567``
        - nic: ``896543456V``
        - password: ``test1234``
        - verified: ``True``
    """
    client = get_redis()

    nic = "896543456V"
    phone = "0771234567"
    nic_hash = hash_nic(nic)
    borrower_key = f"{_BORROWER_PREFIX}{nic_hash}"

    if client.exists(borrower_key):
        logger.debug("Test borrower already exists: nic_hash=%s…", nic_hash[:12])
        return

    password_hash = hash_password("test1234")

    # 896543456V → digits 3-5 = "543" → 501-866 range → female
    try:
        gender = detect_gender_from_nic(nic)
    except ValueError:
        gender = "unknown"

    borrower_record = json.dumps({
        "name": "Binithi Perera",
        "phone": phone,
        "nic_hash": nic_hash,
        "password_hash": password_hash,
        "gender": gender,
        "liya_shakthi_member": True,
        "verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    client.setex(borrower_key, _BORROWER_TTL_SECONDS, borrower_record)
    client.setex(f"{_PHONE_INDEX_PREFIX}{phone}", _BORROWER_TTL_SECONDS, nic_hash)

    logger.info(
        "Seed test borrower created: name=Binithi Perera, phone=%s, nic_hash=%s…",
        phone,
        nic_hash[:12],
    )
