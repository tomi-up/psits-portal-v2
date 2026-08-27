"""Admin account model - separate from Profile/Supabase auth.

Officers/admins authenticate with email + password against this table
directly (no Supabase involved), since the admin panel needs to be usable
before Supabase Auth is wired up.
"""

from sqlalchemy import Column, String, Boolean

from app.models.base import BaseModel


class AdminAccount(BaseModel):
    """An admin/officer login (email + bcrypt password hash)."""

    __tablename__ = "admin_accounts"

    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    def __repr__(self):
        return f"<AdminAccount(email={self.email})>"
