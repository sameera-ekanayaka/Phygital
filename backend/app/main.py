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
from app.core.auth import auth_router
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
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
    )

    # ── CORS ────────────────────────────────────────────────────────────────
    origins = ["*"] if settings.debug else settings.allowed_origins
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=not settings.debug,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Security Headers ─────────────────────────────────────────────────────
    @application.middleware("http")
    async def add_security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not settings.debug:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    # ── Rate limiting ───────────────────────────────────────────────────────
    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Routes ──────────────────────────────────────────────────────────────
    application.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
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

    @application.on_event("startup")
    async def _seed_test_data():
        """Seed pre-registered test users for development."""
        try:
            from app.api.v1.borrower_auth.service import seed_test_borrower
            seed_test_borrower()
            logger.info(
                "Test borrower seeded: NIC=896543456V, password=test1234"
            )
        except Exception as exc:
            logger.warning("Failed to seed test data: %s", exc)

    return application


app = create_app()
