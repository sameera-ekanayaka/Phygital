"""Tests for core validation utilities and schema validations."""

import pytest
from pydantic import ValidationError

from app.core.validation import (
    validate_sri_lankan_nic,
    validate_sri_lankan_phone,
    validate_transaction_amount,
    validate_uploaded_file,
)
from app.api.v1.borrower_auth.schemas import (
    BorrowerRegisterRequest,
    BorrowerLoginRequest,
    OtpVerifyRequest,
)
from app.api.v1.transactions.schemas import (
    TransactionCreateRequest,
    TransactionUpdateRequest,
)


# ---------------------------------------------------------------------------
# Sri Lankan NIC Validation
# ---------------------------------------------------------------------------

class TestNicValidation:
    def test_valid_old_format_male(self):
        nic, gender = validate_sri_lankan_nic("891234567V")
        assert nic == "891234567V"
        assert gender == "male"

    def test_valid_old_format_female(self):
        nic, gender = validate_sri_lankan_nic("896543456v")
        assert nic == "896543456V"
        assert gender == "female"

    def test_valid_old_format_x_suffix(self):
        nic, gender = validate_sri_lankan_nic("925123456x")
        assert nic == "925123456X"
        assert gender == "female"

    def test_valid_new_format_male(self):
        nic, gender = validate_sri_lankan_nic("198912345678")
        assert nic == "198912345678"
        assert gender == "male"

    def test_valid_new_format_female(self):
        nic, gender = validate_sri_lankan_nic("200065434567")
        assert nic == "200065434567"
        assert gender == "female"

    def test_invalid_length_and_characters(self):
        with pytest.raises(ValueError):
            validate_sri_lankan_nic("")
        with pytest.raises(ValueError):
            validate_sri_lankan_nic("123")
        with pytest.raises(ValueError):
            validate_sri_lankan_nic("891234567A")
        with pytest.raises(ValueError):
            validate_sri_lankan_nic("19891234567")
        with pytest.raises(ValueError):
            validate_sri_lankan_nic("1989123456789")

    def test_invalid_day_codes(self):
        # Day code 000 is invalid
        with pytest.raises(ValueError, match="invalid day-of-year"):
            validate_sri_lankan_nic("890004567V")
        # Day code 367 is invalid (male is 1..366, female is 501..866)
        with pytest.raises(ValueError, match="invalid day-of-year"):
            validate_sri_lankan_nic("893674567V")
        # Day code 450 is invalid
        with pytest.raises(ValueError, match="invalid day-of-year"):
            validate_sri_lankan_nic("894504567V")
        # Day code 867 is invalid
        with pytest.raises(ValueError, match="invalid day-of-year"):
            validate_sri_lankan_nic("898674567V")


# ---------------------------------------------------------------------------
# Sri Lankan Phone Validation
# ---------------------------------------------------------------------------

class TestPhoneValidation:
    def test_valid_standard_mobile(self):
        normalized = validate_sri_lankan_phone("0771234567")
        assert normalized == "0771234567"

    def test_valid_international_with_plus(self):
        normalized = validate_sri_lankan_phone("+94712345678")
        assert normalized == "0712345678"

    def test_valid_international_without_plus(self):
        normalized = validate_sri_lankan_phone("94721234567")
        assert normalized == "0721234567"

    def test_valid_with_spaces_and_hyphens(self):
        normalized = validate_sri_lankan_phone(" 077-123 4567 ")
        assert normalized == "0771234567"

    def test_invalid_mobile_prefixes(self):
        # 011 is Colombo landline, not mobile
        with pytest.raises(ValueError, match="10-digit Sri Lankan mobile"):
            validate_sri_lankan_phone("0112345678")
        # 081 is Kandy landline
        with pytest.raises(ValueError, match="10-digit Sri Lankan mobile"):
            validate_sri_lankan_phone("0812345678")

    def test_invalid_lengths(self):
        with pytest.raises(ValueError):
            validate_sri_lankan_phone("")
        with pytest.raises(ValueError):
            validate_sri_lankan_phone("077123456")
        with pytest.raises(ValueError):
            validate_sri_lankan_phone("07712345678")


# ---------------------------------------------------------------------------
# Transaction Amount Validation
# ---------------------------------------------------------------------------

class TestAmountValidation:
    def test_valid_amounts(self):
        assert validate_transaction_amount(100) == 100.0
        assert validate_transaction_amount(2500.50) == 2500.50
        assert validate_transaction_amount(100_000_000) == 100_000_000.0

    def test_zero_and_negative(self):
        with pytest.raises(ValueError, match="strictly greater than zero"):
            validate_transaction_amount(0)
        with pytest.raises(ValueError, match="strictly greater than zero"):
            validate_transaction_amount(-15.5)

    def test_exceeding_maximum(self):
        with pytest.raises(ValueError, match="cannot exceed"):
            validate_transaction_amount(100_000_001)


# ---------------------------------------------------------------------------
# Uploaded File Validation
# ---------------------------------------------------------------------------

class TestFileUploadValidation:
    def test_valid_image(self):
        # Should not raise
        validate_uploaded_file("receipt.jpg", "image/jpeg")

    def test_valid_audio(self):
        # Should not raise
        validate_uploaded_file("voice.webm", "audio/webm")

    def test_disallowed_extension(self):
        with pytest.raises(ValueError, match="Unsupported file format"):
            validate_uploaded_file("malicious.exe", "application/octet-stream")

    def test_unsupported_mime(self):
        with pytest.raises(ValueError, match="unsupported content type"):
            validate_uploaded_file("test.jpg", "application/pdf")


# ---------------------------------------------------------------------------
# Pydantic Schema Validations
# ---------------------------------------------------------------------------

class TestSchemaValidations:
    def test_borrower_register_valid(self):
        req = BorrowerRegisterRequest(
            name="Kasun Silva",
            phone="0771234567",
            nic="896543456V",
            password="securepassword",
        )
        assert req.phone == "0771234567"
        assert req.nic == "896543456V"

    def test_borrower_register_invalid_phone(self):
        with pytest.raises(ValidationError) as exc_info:
            BorrowerRegisterRequest(
                name="Kasun Silva",
                phone="0112345678",
                nic="896543456V",
                password="securepassword",
            )
        assert "10-digit Sri Lankan mobile" in str(exc_info.value)

    def test_borrower_register_invalid_nic(self):
        with pytest.raises(ValidationError) as exc_info:
            BorrowerRegisterRequest(
                name="Kasun Silva",
                phone="0771234567",
                nic="INVALID_NIC",
                password="securepassword",
            )
        assert "NIC must be either 9 digits" in str(exc_info.value)

    def test_transaction_create_validation(self):
        # Valid
        req = TransactionCreateRequest(
            amount=500.50,
            transaction_type="business_revenue",
            category="sales",
            description="Good sale",
        )
        assert req.amount == 500.50

        # Invalid: 0 amount
        with pytest.raises(ValidationError):
            TransactionCreateRequest(
                amount=0,
                transaction_type="business_revenue",
                category="sales",
            )

        # Invalid: negative amount
        with pytest.raises(ValidationError):
            TransactionCreateRequest(
                amount=-100,
                transaction_type="business_revenue",
                category="sales",
            )

        # Invalid: empty category
        with pytest.raises(ValidationError):
            TransactionCreateRequest(
                amount=100,
                transaction_type="business_revenue",
                category="",
            )
