"""Authentication endpoints.

Signup, login, password reset, and sessions are handled by Supabase Auth on
the frontend - there is no /login endpoint here. This router only covers
what our backend owns: verifying a Supabase token, linking a Supabase
account to a student roster record, and returning the resulting profile.
"""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, validate_supabase_token
from app.schemas.auth import StudentActivationRequest, ApiResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/verify", response_model=ApiResponse)
async def verify_token(authorization: Optional[str] = Header(None)):
    """
    Verify a Supabase access token is valid.

    Does not require a linked profile - useful right after signup, before
    activation has happened.
    """
    if not authorization:
        from app.core.exceptions import UnauthorizedException
        raise UnauthorizedException("Missing authorization header")

    token = authorization.replace("Bearer ", "")
    auth_user = await validate_supabase_token(token)

    return ApiResponse(
        success=True,
        data={
            "user_id": auth_user.get("id"),
            "email": auth_user.get("email"),
        },
        message="Token is valid",
    )


@router.post("/activate", response_model=ApiResponse, status_code=201)
async def activate_student(
    request: StudentActivationRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Link the caller's Supabase account to a student roster record.

    The caller must have already signed up with Supabase Auth and pass the
    resulting access token; this endpoint creates the `profiles` row and
    grants the STUDENT role.
    """
    if not authorization:
        from app.core.exceptions import UnauthorizedException
        raise UnauthorizedException("Missing authorization header")

    token = authorization.replace("Bearer ", "")
    auth_user = await validate_supabase_token(token)

    service = AuthService(db)
    profile = service.activate_student_account(
        auth_user_id=auth_user["id"],
        email=auth_user.get("email", ""),
        student_id=request.student_id,
        last_name=request.last_name,
    )

    return ApiResponse(
        success=True,
        data={
            "id": profile.id,
            "student_id": profile.student_id,
            "display_name": profile.display_name,
            "status": profile.status,
        },
        message="Account activated successfully",
    )


@router.get("/me", response_model=ApiResponse)
async def get_me(current_user=Depends(get_current_user)):
    """Get the current authenticated user's profile, roles, and permissions."""
    return ApiResponse(
        success=True,
        data={
            "id": current_user.id,
            "auth_user_id": current_user.auth_user_id,
            "student_id": current_user.student_id,
            "display_name": current_user.display_name,
            "email": current_user.email,
            "profile_image_url": current_user.profile_image_url,
            "status": current_user.status,
            "roles": current_user.roles,
            "permissions": sorted(current_user.permissions),
            "created_at": current_user.created_at.isoformat(),
        },
    )


@router.post("/logout", response_model=ApiResponse)
async def logout(current_user=Depends(get_current_user)):
    """
    Logout endpoint.

    Supabase manages sessions; the actual sign-out happens client-side via
    the Supabase SDK. This endpoint exists for symmetry / future audit
    logging of logout events.
    """
    return ApiResponse(success=True, message="Logged out successfully")
