"""Profile model.

Note: There is no `User` model here. `Profile.auth_user_id` is a vestige of
an earlier Supabase-Auth-based design (removed) that's no longer written
with a real external id - student_auth.py's Google Sign-In flow is the only
thing creating profiles now, and sets it to a random UUID since nothing
reads it as a real identity reference anymore.
"""

from sqlalchemy import Column, String, Enum as SQLEnum, Index
import enum

from app.models.base import BaseModel


class AccountStatus(str, enum.Enum):
    """Profile account status."""
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"


class Profile(BaseModel):
    """Application-side profile linked to a Supabase auth.users record."""

    __tablename__ = "profiles"

    auth_user_id = Column(String(36), unique=True, nullable=False)
    student_id = Column(String(20), unique=True, nullable=True)
    display_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    profile_image_url = Column(String(512), nullable=True)
    status = Column(SQLEnum(AccountStatus), default=AccountStatus.ACTIVE, index=True)
    # Google's stable per-account subject id ("sub" claim), bound to this
    # student's Profile the first time they sign in with Google - the only
    # student auth factor now; the TOTP app this used to say instead is gone.
    # The profiles.totp_secret DB column is left in place (unused, always
    # NULL) rather than migrated away, since nothing here reads or writes it.
    google_sub = Column(String(255), unique=True, nullable=True)

    __table_args__ = (
        Index('ix_profiles_auth_user_id', 'auth_user_id'),
        Index('ix_profiles_student_id', 'student_id'),
        Index('ix_profiles_google_sub', 'google_sub'),
    )

    def __repr__(self):
        return f"<Profile(auth_user_id={self.auth_user_id}, display_name={self.display_name})>"
