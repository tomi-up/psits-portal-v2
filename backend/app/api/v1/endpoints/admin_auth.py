"""Admin/officer login - email + password against the admin_accounts table,
plus optional TOTP 2FA layered on top of it."""

import base64
import io
import re
import uuid

import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.security import verify_password, hash_password, create_access_token, decode_access_token
from app.core.exceptions import UnauthorizedException
from app.core.rate_limit import limiter
from app.core.deps import get_current_admin
from app.core.crypto import encrypt_mfa_setup, decrypt_mfa_setup, encrypt_secret, decrypt_secret
from app.models.admin import AdminAccount

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])

MFA_PENDING_TOKEN_MINUTES = 10

# At least one lowercase, one uppercase, one digit, and one symbol -
# mirrors the live checklist shown on the Settings page's password form.
PASSWORD_STRENGTH_RE = re.compile(r"(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])")


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminSummary(BaseModel):
    id: str
    email: str
    display_name: str
    mfa_enabled: bool

    class Config:
        from_attributes = True


class AdminLoginResponse(BaseModel):
    access_token: str
    expires_in: int
    admin: AdminSummary


class AdminMFARequiredResponse(BaseModel):
    status: str = "MFA_REQUIRED"
    pending_token: str
    expires_in_seconds: int


class AdminMFAVerifyRequest(BaseModel):
    pending_token: str
    totp_code: str


class AdminMFAEnrollResponse(BaseModel):
    qr_code_image: str
    manual_entry_key: str
    setup_token: str


class AdminMFAConfirmRequest(BaseModel):
    setup_token: str
    totp_code: str
    password: str


class AdminMFAStatusResponse(BaseModel):
    status: str
    message: str


class AdminChangePasswordResponse(BaseModel):
    status: str
    message: str
    access_token: str


class AdminMFAResetRequest(BaseModel):
    password: str


class AdminChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
@limiter.limit("5/minute")
def admin_login(request: Request, body: AdminLoginRequest, db: Session = Depends(get_db)):
    # Bcrypt has a hard 72-byte limit; reject oversized passwords upfront
    if len(body.password.encode('utf-8')) > 72:
        raise UnauthorizedException("Invalid email or password")

    admin = db.query(AdminAccount).filter(AdminAccount.email == body.email.lower()).first()

    if not admin or not admin.is_active or not verify_password(body.password, admin.password_hash):
        raise UnauthorizedException("Invalid email or password")

    if admin.mfa_enabled:
        # A deliberately low-privilege token: its distinct token_type means
        # get_current_admin (which only accepts type="admin") rejects it
        # outright, so it's useless for anything except /login/verify-mfa.
        pending_token = create_access_token(
            subject=admin.id, token_type="admin_mfa_pending", expires_minutes=MFA_PENDING_TOKEN_MINUTES,
            extra_claims={"sec": admin.security_stamp},
        )
        return AdminMFARequiredResponse(
            pending_token=pending_token, expires_in_seconds=MFA_PENDING_TOKEN_MINUTES * 60,
        )

    token = create_access_token(subject=admin.id, extra_claims={"sec": admin.security_stamp})
    return AdminLoginResponse(
        access_token=token,
        expires_in=60 * 60 * 12,
        admin=AdminSummary.model_validate(admin),
    )


@router.post("/login/verify-mfa", response_model=AdminLoginResponse)
@limiter.limit("5/minute")
def admin_login_verify_mfa(request: Request, body: AdminMFAVerifyRequest, db: Session = Depends(get_db)):
    payload = decode_access_token(body.pending_token, expected_type="admin_mfa_pending")
    if not payload:
        raise UnauthorizedException("Login session expired. Please sign in again.")

    admin = db.query(AdminAccount).filter(AdminAccount.id == payload["sub"]).first()
    if not admin or not admin.is_active or not admin.mfa_enabled or not admin.totp_secret:
        raise UnauthorizedException("Invalid login session")

    # The pending token was minted with the security stamp that was current
    # at the time /login succeeded. If the password (or an MFA reset) has
    # since rotated the stamp, this pending token is for a login attempt
    # that's no longer valid - without this check, a pending token captured
    # before a password change would still complete login afterward, up to
    # its own 10-minute expiry.
    if payload.get("sec") != admin.security_stamp:
        raise UnauthorizedException("Login session expired. Please sign in again.")

    secret = decrypt_secret(admin.totp_secret)
    if not pyotp.TOTP(secret).verify(body.totp_code, valid_window=1):
        raise UnauthorizedException("Invalid authentication code")

    token = create_access_token(subject=admin.id, extra_claims={"sec": admin.security_stamp})
    return AdminLoginResponse(
        access_token=token,
        expires_in=60 * 60 * 12,
        admin=AdminSummary.model_validate(admin),
    )


@router.get("/me", response_model=AdminSummary)
def get_me(admin: AdminAccount = Depends(get_current_admin)):
    return AdminSummary.model_validate(admin)


@router.post("/mfa/enroll", response_model=AdminMFAEnrollResponse)
@limiter.limit("10/minute")
def admin_mfa_enroll(request: Request, admin: AdminAccount = Depends(get_current_admin)):
    """Start (or restart) 2FA enrollment for the signed-in admin. Generating
    a new secret here doesn't change anything until /mfa/confirm is called
    with a valid code for it - the old secret (if any) still gates login
    until then."""

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=admin.email, issuer_name="PSITS Admin")

    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_code_image = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"

    setup_token = encrypt_mfa_setup(admin.id, secret)

    return AdminMFAEnrollResponse(
        qr_code_image=qr_code_image, manual_entry_key=secret, setup_token=setup_token,
    )


@router.post("/mfa/confirm", response_model=AdminMFAStatusResponse)
@limiter.limit("10/minute")
def admin_mfa_confirm(
    request: Request, body: AdminMFAConfirmRequest, admin: AdminAccount = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    # Require the current password here too, not just a valid session -
    # enroll+confirm together can otherwise replace an already-enabled
    # account's second factor using nothing but a bearer token, which is
    # worse than merely bypassing 2FA: a stolen session would let an
    # attacker lock the real owner out of their own authenticator. This
    # mirrors mfa_reset, which already requires the password for the same
    # reason.
    if not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")

    try:
        setup_data = decrypt_mfa_setup(body.setup_token, max_age_seconds=900)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup session expired or invalid. Please restart enrollment.",
        )

    if setup_data["subject_id"] != admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Setup session does not match this account")

    secret = setup_data["secret"]
    if not pyotp.TOTP(secret).verify(body.totp_code, valid_window=1):
        # 400, not 401: the admin's own session/token is perfectly valid here -
        # only the TOTP code they typed was wrong. adminFetch() on the
        # frontend force-logs-out on any 401 (correct for an actually-expired
        # session), so a 401 here would silently end a valid session over a
        # mistyped 6-digit code.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect code. Check your authenticator app and try again.",
        )

    admin.totp_secret = encrypt_secret(secret)
    admin.mfa_enabled = True
    db.commit()

    return AdminMFAStatusResponse(status="ENABLED", message="Two-factor authentication is now required for this account.")


@router.post("/mfa/reset", response_model=AdminMFAStatusResponse)
@limiter.limit("5/minute")
def admin_mfa_reset(
    request: Request, body: AdminMFAResetRequest, admin: AdminAccount = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Turn 2FA off for the signed-in admin - e.g. before handing the
    account to whoever actually owns it, so they enroll their own device
    instead of sharing yours. Requires the current password again since this
    is a security-lowering action, not just a settings tweak."""

    if not verify_password(body.password, admin.password_hash):
        # 400, not 401 - see the matching note in admin_mfa_confirm: the
        # admin's session is valid, only the password they typed was wrong,
        # and adminFetch() force-logs-out on any 401 it sees. Raised as a
        # plain HTTPException (not the AppException-style UnauthorizedException
        # that used to live here) so its `detail` key matches what the
        # Settings page's error handling reads.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")

    admin.totp_secret = None
    admin.mfa_enabled = False
    db.commit()

    return AdminMFAStatusResponse(status="DISABLED", message="Two-factor authentication has been turned off.")


@router.post("/change-password", response_model=AdminChangePasswordResponse)
@limiter.limit("5/minute")
def admin_change_password(
    request: Request, body: AdminChangePasswordRequest, admin: AdminAccount = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, admin.password_hash):
        # 400, not 401 - see the matching note in admin_mfa_confirm: the
        # admin's session is valid, only the password they typed was wrong,
        # and adminFetch() force-logs-out on any 401 it sees. Raised as a
        # plain HTTPException (not the AppException-style UnauthorizedException
        # that used to live here) so its `detail` key matches what the
        # Settings page's error handling reads.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    if len(body.new_password.encode('utf-8')) > 72:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password cannot exceed 72 characters",
        )
    # Mirrors the strength checklist shown on the Settings page - enforced
    # here too since client-side validation alone can always be bypassed.
    if len(body.new_password) < 8 or not PASSWORD_STRENGTH_RE.search(body.new_password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be at least 8 characters and include an uppercase letter, "
                   "a lowercase letter, a number, and a symbol.",
        )

    admin.password_hash = hash_password(body.new_password)
    # Invalidates every token issued before this moment - including the one
    # used to make this very request - since a 12-hour admin JWT otherwise
    # has no other way to be revoked early. A fresh token is issued below so
    # this session keeps working; every other session (e.g. a leaked token,
    # or another device) stops working the instant this commits.
    admin.security_stamp = str(uuid.uuid4())
    db.commit()

    new_token = create_access_token(subject=admin.id, extra_claims={"sec": admin.security_stamp})
    return AdminChangePasswordResponse(
        status="CHANGED", message="Your password has been changed.", access_token=new_token,
    )
