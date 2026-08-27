"""Admin/officer login - email + password against the admin_accounts table."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.exceptions import UnauthorizedException
from app.core.rate_limit import limiter
from app.core.deps import get_current_admin
from app.models.admin import AdminAccount

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminSummary(BaseModel):
    id: str
    email: str
    display_name: str

    class Config:
        from_attributes = True


class AdminLoginResponse(BaseModel):
    access_token: str
    expires_in: int
    admin: AdminSummary


@router.post("/login", response_model=AdminLoginResponse)
@limiter.limit("5/minute")
def admin_login(request: Request, body: AdminLoginRequest, db: Session = Depends(get_db)):
    admin = db.query(AdminAccount).filter(AdminAccount.email == body.email.lower()).first()

    if not admin or not admin.is_active or not verify_password(body.password, admin.password_hash):
        raise UnauthorizedException("Invalid email or password")

    token = create_access_token(subject=admin.id)
    return AdminLoginResponse(
        access_token=token,
        expires_in=60 * 60 * 12,
        admin=AdminSummary.model_validate(admin),
    )


@router.get("/me", response_model=AdminSummary)
def get_me(admin: AdminAccount = Depends(get_current_admin)):
    return AdminSummary.model_validate(admin)
