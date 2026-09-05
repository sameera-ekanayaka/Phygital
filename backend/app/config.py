"""Application configuration loaded from environment variables and .env files.

Uses pydantic-settings v2 to validate and coerce every value at startup so that
misconfiguration fails fast rather than at request time.
"""

import logging
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the Phygital Cash-Flow Engine.

    All fields are sourced from environment variables or a local `.env` file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Cryptography ────────────────────────────────────────────────────────
    secret_key: str
    """Symmetric key used for HMAC-SHA256 token signing."""

    # ── Redis ───────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    """Connection URL for the Redis instance used as ephemeral data store."""

    # ── CORS & JWT ────────────────────────────────────────────────────────────
    allowed_origins: list[str] = []
    """List of allowed CORS origins for production deployments."""

    jwt_algorithm: str = "HS256"
    """Algorithm used for JWT token signing and verification."""

    access_token_expire_minutes: int = 480
    """Time-to-live for JWT access tokens in minutes (default 8 hours)."""

    # ── Officer Auth ─────────────────────────────────────────────────────────
    officer_credentials: str = "{}"
    """JSON string mapping officer usernames to passwords for production auth."""

    # ── Application ─────────────────────────────────────────────────────────
    base_url: str = "https://phygital.lk"
    """Public base URL used when generating QR verification links."""

    debug: bool = False
    """Enables verbose logging and permissive CORS when True."""

    # ── AI Services ────────────────────────────────────────────────────────
    groq_api_key: str = ""
    """API key for Groq Cloud (Whisper transcription and Llama extraction)."""

    google_api_key: str = ""
    """API key for Google Gemini (multimodal OCR and text extraction)."""

    openai_api_key: str = ""
    """API key for OpenAI (Whisper transcription, GPT-4o Vision, structured outputs)."""

    # ── PDPA Compliance ─────────────────────────────────────────────────
    data_retention_hours: int = 72
    """Maximum retention window (in hours) for raw ephemeral data before
    mandatory purge, per PDPA No. 9 of 2022 Section 12 (Data Minimization)."""

    transaction_retention_days: int = 30
    """Maximum retention window (in days) for structured transaction data.
    Supports monthly accounting cycles while raw media/PII retains the
    shorter ``data_retention_hours`` window per PDPA Section 12."""

    consent_expiry_days: int = 365
    """TTL (in days) for a recorded consent record before it expires
    and must be re-authorised by the data subject."""

    temp_upload_dir: str = "temp_uploads"
    """Local directory for transient file uploads (voice, images) that are
    purged after the processing cycle completes."""

    @model_validator(mode="after")
    def _validate_security_settings(self) -> "Settings":
        """Enforce minimum security standards at startup."""
        _logger = logging.getLogger(__name__)

        weak_keys = ("your_secret_key_here", "dev_secret_key_for_testing", "")
        if self.secret_key in weak_keys or len(self.secret_key) < 16:
            raise ValueError(
                "SECRET_KEY is too weak or unset. "
                "Provide a strong key (≥16 characters) via .env or environment variable."
            )

        if not self.debug:
            if self.groq_api_key.startswith("your_"):
                _logger.warning("GROQ_API_KEY appears to be a placeholder — set a real key in production.")
            if self.google_api_key.startswith("your_"):
                _logger.warning("GOOGLE_API_KEY appears to be a placeholder — set a real key in production.")

        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached, validated Settings singleton.

    The `lru_cache` decorator ensures the (relatively expensive) env-file
    parsing only happens once per process lifetime.
    """
    return Settings()
