"""Encryption helpers for sensitive data at rest (admin TOTP secrets)."""

import json

from cryptography.fernet import Fernet

from app.core.config import settings

_fernet = Fernet(settings.mfa_encryption_key.encode())


def encrypt_mfa_setup(subject_id: str, secret: str, stamp: str) -> str:
    """Package a freshly-generated TOTP secret into a self-verifying, time-limited
    setup token so the server doesn't need to hold enrollment state between the
    enroll and confirm requests of a two-step TOTP enrollment. `stamp` binds it
    to the account's security stamp at enroll time, so it stops working as soon
    as any MFA or password change rotates that stamp."""
    payload = json.dumps({"subject_id": subject_id, "secret": secret, "stamp": stamp}).encode()
    return _fernet.encrypt(payload).decode()


def decrypt_mfa_setup(token: str, max_age_seconds: int = 900) -> dict:
    """Raises cryptography.fernet.InvalidToken if the token is malformed, tampered
    with, or older than max_age_seconds."""
    payload = _fernet.decrypt(token.encode(), ttl=max_age_seconds)
    return json.loads(payload)


def encrypt_secret(secret: str) -> str:
    return _fernet.encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()
