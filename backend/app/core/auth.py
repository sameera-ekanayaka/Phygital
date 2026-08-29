"""JWT authentication module for officer login and token-based session management.

Provides OAuth2-compatible token issuance and validation, with a debug-mode
bypass that allows unauthenticated access during local development.
"""

import json
import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from app.config import get_settings

logger = logging.getLogger(__name__)

auth_router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/token",
    auto_error=False,
)


def create_access_token(subject: str, role: str = "officer") -> str:
    """Create a signed JWT access token.

    Args:
        subject: The user identifier (typically the officer username).
        role: The user's role embedded in the token payload.

    Returns:
        A URL-safe, signed JWT string.
    """
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": subject,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
) -> dict:
    """Resolve the current authenticated user from a JWT bearer token.

    In **debug mode**, missing or invalid tokens are silently accepted and a
    synthetic dev officer identity is returned — this allows frictionless
    local development without a real auth flow.

    In production, an invalid or missing token always raises ``HTTP 401``.

    Raises:
        HTTPException: 401 if the token is missing/invalid/expired in production.
    """
    settings = get_settings()

    if token is None:
        if settings.debug:
            logger.debug("No token provided — dev bypass active.")
            return {"sub": "dev_officer", "role": "officer"}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return {"sub": payload.get("sub"), "role": payload.get("role")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        if settings.debug:
            logger.debug("Invalid token — dev bypass active.")
            return {"sub": "dev_officer", "role": "officer"}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


@auth_router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> dict:
    """Issue a JWT access token in exchange for officer credentials.

    In **debug mode** any username/password combination is accepted so that
    frontend development and integration testing can proceed without a real
    credential store.

    In production the submitted credentials are validated against the
    ``OFFICER_CREDENTIALS`` setting (a JSON object mapping usernames to
    passwords). If no credentials are configured the endpoint returns 501.

    Raises:
        HTTPException: 401 on invalid credentials; 501 if no credentials are
        configured in production.
    """
    settings = get_settings()

    if settings.debug:
        logger.info("Debug mode — accepting any credentials for user=%s", form_data.username)
        token = create_access_token(subject=form_data.username, role="officer")
        return {"access_token": token, "token_type": "bearer"}

    # Production: validate against configured officer credentials
    try:
        credentials: dict[str, str] = json.loads(settings.officer_credentials)
    except (json.JSONDecodeError, TypeError):
        logger.error("OFFICER_CREDENTIALS is not valid JSON.")
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Officer authentication is not configured",
        )

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Officer authentication is not configured",
        )

    expected_password = credentials.get(form_data.username)
    if expected_password is None or expected_password != form_data.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(subject=form_data.username, role="officer")
    logger.info("Officer '%s' authenticated successfully.", form_data.username)
    return {"access_token": token, "token_type": "bearer"}
