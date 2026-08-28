"""Application configuration loaded from environment variables and .env files.

Uses pydantic-settings v2 to validate and coerce every value at startup so that
misconfiguration fails fast rather than at request time.
"""

from functools import lru_cache

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
    secret_key: str = "your_secret_key_here"
    """Symmetric key used for HMAC-SHA256 token signing."""

    # ── Redis ───────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    """Connection URL for the Redis instance used as ephemeral data store."""

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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached, validated Settings singleton.

    The `lru_cache` decorator ensures the (relatively expensive) env-file
    parsing only happens once per process lifetime.
    """
    return Settings()
