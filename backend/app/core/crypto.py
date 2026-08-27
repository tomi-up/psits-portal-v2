"""Encryption helpers for sensitive data at rest (student TOTP secrets)."""

import json

from cryptography.fernet import Fernet

from app.core.config import settings

_fernet = Fernet(settings.mfa_encryption_key.encode())


def encrypt_activation_token(student_id: str, last_name: str) -> str:
    """Package the identity check from step 1 (student_id + last name matched
    the roster) into a self-verifying, time-limited token, so step 2 doesn't
    have to blindly trust a bare client-supplied student_id - closing the gap
    where anyone could mint their own MFA enrollment for any student without
    ever passing the last-name check."""
    payload = json.dumps({"student_id": student_id, "last_name": last_name}).encode()
    return _fernet.encrypt(payload).decode()


def decrypt_activation_token(token: str, max_age_seconds: int = 900) -> dict:
    """Raises cryptography.fernet.InvalidToken if the token is malformed, tampered
    with, or older than max_age_seconds."""
    payload = _fernet.decrypt(token.encode(), ttl=max_age_seconds)
    return json.loads(payload)


def encrypt_totp_setup(student_id: str, secret: str) -> str:
    """Package a freshly-generated TOTP secret into a self-verifying, time-limited
    setup token so the server doesn't need to hold enrollment state between the
    enroll-mfa and confirm-mfa requests."""
    payload = json.dumps({"student_id": student_id, "secret": secret}).encode()
    return _fernet.encrypt(payload).decode()


def decrypt_totp_setup(token: str, max_age_seconds: int = 900) -> dict:
    """Raises cryptography.fernet.InvalidToken if the token is malformed, tampered
    with, or older than max_age_seconds."""
    payload = _fernet.decrypt(token.encode(), ttl=max_age_seconds)
    return json.loads(payload)


def encrypt_secret(secret: str) -> str:
    return _fernet.encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()
