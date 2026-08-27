"""Authentication request/response schemas.

Login and signup are handled entirely by Supabase Auth on the frontend -
there is no login/password schema here. These schemas cover the pieces our
backend is responsible for: linking a Supabase account to a student roster
record, and describing the resulting profile.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Any


class StudentActivationRequest(BaseModel):
    """
    Link the caller's Supabase account to a student roster record.

    The caller must already hold a valid Supabase access token (sent via the
    Authorization header) from a completed Supabase Auth signup - this
    endpoint only creates the corresponding `profiles` row and grants the
    STUDENT role.
    """

    student_id: str = Field(..., pattern=r"^\d{2}-\d{5}$", description="Student ID (e.g., 22-12345)")
    last_name: str = Field(..., description="Student last name, must match roster record")


class RoleSummary(BaseModel):
    """Minimal role info attached to a profile."""

    id: str
    code: str
    name: str

    class Config:
        from_attributes = True


class ProfileResponse(BaseModel):
    """Profile response including resolved roles and permissions."""

    id: str
    auth_user_id: str
    student_id: Optional[str] = None
    display_name: str
    email: str
    profile_image_url: Optional[str] = None
    status: str
    roles: List[RoleSummary] = []
    permissions: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ApiResponse(BaseModel):
    """Standard API response wrapper."""

    success: bool
    data: Optional[Any] = None
    message: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
