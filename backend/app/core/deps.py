"""Shared FastAPI dependencies."""

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.exceptions import UnauthorizedException
from app.models.admin import AdminAccount
from app.models.student import Student


def get_current_admin(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AdminAccount:
    """Resolve the AdminAccount from a `Authorization: Bearer <token>` header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedException("Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_access_token(token)
    if not payload:
        raise UnauthorizedException("Invalid or expired session")

    admin = db.query(AdminAccount).filter(AdminAccount.id == payload["sub"]).first()
    if not admin or not admin.is_active:
        raise UnauthorizedException("Account not found or disabled")

    return admin


def _resolve_student(authorization: str | None, db: Session) -> Student | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_access_token(token, expected_type="student")
    if not payload:
        return None

    student = db.query(Student).filter(Student.id == payload["sub"]).first()
    # is_active means "has completed MFA activation" (see student_auth.py) -
    # re-checking it here means an admin's reset-authenticator action
    # immediately revokes any outstanding session for that student, not just
    # future logins.
    if not student or not student.is_active:
        return None

    return student


def get_current_student(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Student:
    """Resolve the Student from a `Authorization: Bearer <token>` header.

    Required - raises 401 if missing/invalid. Use this for any endpoint that
    represents "my own" data (dashboard, registering myself for an event)."""
    student = _resolve_student(authorization, db)
    if not student:
        raise UnauthorizedException("Missing or invalid session")
    return student


def get_optional_current_student(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Student | None:
    """Same as get_current_student but returns None instead of raising -
    for endpoints that serve both a logged-in student (personalized) and an
    anonymous caller (e.g. the QR scanner's event picker, which lists
    events with no student context at all)."""
    return _resolve_student(authorization, db)
