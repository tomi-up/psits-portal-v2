"""Profile, Role, and Permission models.

Note: There is no `User` model here - Supabase Auth's `auth.users` table
(managed entirely by Supabase) is the source of truth for accounts and
credentials. `Profile.auth_user_id` links our application data back to it.
"""

from sqlalchemy import Column, String, DateTime, ForeignKey, Table, Enum as SQLEnum, TEXT, Index, Integer, Boolean, func
import enum

from app.models.base import BaseModel, Base


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
    totp_secret = Column(TEXT, nullable=True)  # Fernet-encrypted TOTP secret
    # Google's stable per-account subject id ("sub" claim), bound to this
    # student's Profile the first time they sign in with Google - replaces
    # totp_secret as the auth factor when set.
    google_sub = Column(String(255), unique=True, nullable=True)

    __table_args__ = (
        Index('ix_profiles_auth_user_id', 'auth_user_id'),
        Index('ix_profiles_student_id', 'student_id'),
        Index('ix_profiles_google_sub', 'google_sub'),
    )

    def __repr__(self):
        return f"<Profile(auth_user_id={self.auth_user_id}, display_name={self.display_name})>"


class Role(BaseModel):
    """Role definition (e.g. TREASURER, STUDENT)."""

    __tablename__ = "roles"

    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(TEXT, nullable=True)
    is_active = Column(Boolean, default=True)
    order = Column(Integer, default=0)

    __table_args__ = (
        Index('ix_roles_code', 'code'),
        Index('ix_roles_is_active', 'is_active'),
    )

    def __repr__(self):
        return f"<Role(code={self.code}, name={self.name})>"


class Permission(BaseModel):
    """Permission definition (e.g. payments.void)."""

    __tablename__ = "permissions"

    code = Column(String(100), unique=True, nullable=False)
    description = Column(TEXT, nullable=True)
    category = Column(String(50))

    __table_args__ = (
        Index('ix_permissions_code', 'code'),
        Index('ix_permissions_category', 'category'),
    )

    def __repr__(self):
        return f"<Permission(code={self.code})>"


# Join tables are plain SQLAlchemy Core Tables (not mapped ORM relationships).
# A prior attempt at ORM many-to-many relationships here caused ambiguous
# foreign-key errors; the service layer queries these directly instead.

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", String(36), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", String(36), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("assigned_at", DateTime, server_default=func.now()),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", String(36), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", String(36), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    Column("granted_at", DateTime, server_default=func.now()),
)
