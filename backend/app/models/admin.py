"""Admin account model - separate from Profile/Supabase auth.

Officers/admins authenticate with email + password against this table
directly (no Supabase involved), since the admin panel needs to be usable
before Supabase Auth is wired up.
"""

import uuid

from sqlalchemy import Column, String, Boolean, TEXT

from app.models.base import BaseModel


class AdminAccount(BaseModel):
    """An admin/officer login (email + bcrypt password hash)."""

    __tablename__ = "admin_accounts"

    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    # Fernet-encrypted TOTP secret (app.core.crypto.encrypt_secret) - NULL
    # until this admin finishes 2FA enrollment. mfa_enabled is the actual
    # on/off switch login checks, kept separate from totp_secret so a
    # confirmed-but-not-yet-enabled secret (mid-enrollment) can never be
    # accidentally treated as "2FA is required."
    totp_secret = Column(TEXT, nullable=True)
    mfa_enabled = Column(Boolean, default=False, nullable=False)
    # Embedded in every admin JWT as the "sec" claim and re-checked on every
    # request (app.core.deps.get_current_admin). Regenerated on password
    # change so every previously-issued token - a 12-hour admin JWT has no
    # other revocation mechanism - stops working immediately instead of
    # staying valid until it naturally expires.
    security_stamp = Column(String(36), nullable=False, default=lambda: str(uuid.uuid4()))

    def __repr__(self):
        return f"<AdminAccount(email={self.email})>"
