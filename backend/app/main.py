"""FastAPI application factory — middleware, CORS, rate-limiting, and routing.

Run locally with:
    uvicorn app.main:app --reload
from the ``backend/`` directory.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_v1_router
from app.config import get_settings
from app.core.limiter import limiter

logger = logging.getLogger("phygital")


def _configure_logging(debug: bool) -> None:
    """Set up structured, human-readable logging for the application."""
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )


def create_app() -> FastAPI:
    """Build and return a fully configured FastAPI application instance."""
    settings = get_settings()
    _configure_logging(settings.debug)

    application = FastAPI(
        title="Phygital Cash-Flow Engine",
        description=(
            "Backend API that converts informal financial records "
            "(handwritten ledgers, SMS receipts, voice notes) into "
            "bank-grade cash-flow dossiers for micro-SME credit assessment."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ────────────────────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.debug else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Rate limiting ───────────────────────────────────────────────────────
    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Routes ──────────────────────────────────────────────────────────────
    application.include_router(api_v1_router, prefix="/api/v1")

    @application.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        """Lightweight liveness probe for container orchestrators."""
        return {"status": "healthy"}

    logger.info(
        "Phygital Cash-Flow Engine started (debug=%s, base_url=%s)",
        settings.debug,
        settings.base_url,
    )

    return application


app = create_app()
