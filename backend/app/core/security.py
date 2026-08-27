"""Auth helpers: Supabase token validation (for the original student/profile
flow in auth.py) plus password hashing and JWT helpers for admin login.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import httpx
from fastapi import Depends, Header
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import UnauthorizedException

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 720


# ---------------------------------------------------------------------------
# Supabase-backed auth (used by app/api/v1/endpoints/auth.py)
# ---------------------------------------------------------------------------

async def validate_supabase_token(token: str) -> dict:
    """Verify a Supabase access token and return the auth.users record."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_key,
            },
        )

    if response.status_code != 200:
        raise UnauthorizedException("Invalid or expired token")

    return response.json()


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Resolve the current Supabase-authenticated user's profile, roles, and permissions."""
    if not authorization:
        raise UnauthorizedException("Missing authorization header")

    token = authorization.replace("Bearer ", "")
    auth_user = await validate_supabase_token(token)

    from app.services.auth_service import AuthService

    data = AuthService(db).get_profile_with_permissions(auth_user["id"])
    return SimpleNamespace(**data)


# ---------------------------------------------------------------------------
# Admin login (email + password, no Supabase involved)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    if len(password.encode('utf-8')) > 72:
        raise ValueError("Password cannot exceed 72 bytes (bcrypt limitation)")
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if len(password.encode('utf-8')) > 72:
        return False
    return pwd_context.verify(password, password_hash)


def create_access_token(
    subject: str, extra_claims: dict[str, Any] | None = None, token_type: str = "admin"
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {"sub": subject, "exp": expire, "type": token_type}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str, expected_type: str = "admin") -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload
