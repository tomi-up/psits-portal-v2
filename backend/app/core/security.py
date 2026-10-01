"""Auth helpers: password hashing and JWT helpers for admin login, plus the
JWT helpers student_auth.py's Google Sign-In flow also uses."""

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 720


def hash_password(password: str) -> str:
    if len(password.encode('utf-8')) > 72:
        raise ValueError("Password cannot exceed 72 bytes (bcrypt limitation)")
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if len(password.encode('utf-8')) > 72:
        return False
    try:
        return pwd_context.verify(password, password_hash)
    except ValueError:
        # Bcrypt backend initialization error; treat as invalid password
        return False


def create_access_token(
    subject: str,
    extra_claims: dict[str, Any] | None = None,
    token_type: str = "admin",
    expires_minutes: int | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes if expires_minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES
    )
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
