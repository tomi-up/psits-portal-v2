"""Student authentication endpoints - MVP for activation & login."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
import uuid
import pyotp
from pydantic import BaseModel
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.student import Student, StudentSchoolYear
from app.models.user import Profile, AccountStatus
from app.models.audit_log import AuditLog
from app.models.balance import MembershipFee
from app.core.config import settings
from app.core.crypto import (
    encrypt_activation_token,
    decrypt_activation_token,
    encrypt_totp_setup,
    decrypt_totp_setup,
    encrypt_secret,
    decrypt_secret,
)
from app.core.security import create_access_token
from app.core.turnstile import verify_turnstile
from app.core.attendance import as_utc, is_late, finalize_status
from app.core.rate_limit import limiter

router = APIRouter(prefix="/student-auth", tags=["student-auth"])


# ============================================================================
# SCHEMAS
# ============================================================================

class ActivationVerifyRequest(BaseModel):
    student_id: str
    last_name: str


class ActivationVerifyResponse(BaseModel):
    activation_token: str
    expires_in_seconds: int
    student_name: str


class MFAEnrollRequest(BaseModel):
    activation_token: str
    student_id: str


class MFAEnrollResponse(BaseModel):
    qr_code_url: str
    qr_code_image: str
    manual_entry_key: str
    setup_token: str


class MFAConfirmRequest(BaseModel):
    setup_token: str
    totp_code: str
    student_id: str
    last_name: str


class MFAConfirmResponse(BaseModel):
    status: str
    message: str


class StudentLoginRequest(BaseModel):
    student_id: str
    authenticator_code: str


class StudentLoginResponse(BaseModel):
    access_token: str
    expires_in: int
    user: dict


class GoogleLoginRequest(BaseModel):
    id_token: str
    student_id: str | None = None  # only required the first time this Google account signs in
    turnstile_token: str


class GoogleLoginNeedsBindingResponse(BaseModel):
    status: str = "NEEDS_STUDENT_ID"
    email: str
    message: str = "First-time sign-in - enter your Student ID to link this Google account."


# ============================================================================
# ACTIVATION ENDPOINTS
# ============================================================================

@router.post("/student-activate/verify", response_model=ActivationVerifyResponse)
@limiter.limit("10/minute")
def student_activate_verify(
    request: Request,
    body: ActivationVerifyRequest,
    db: Session = Depends(get_db)
):
    """
    Step 1: Identity verification
    Student provides Student ID + Last Name to verify against roster.
    Returns activation_token for next steps.
    """

    # Normalize inputs
    student_id = body.student_id.strip()
    last_name = body.last_name.strip().upper()

    # Look up student
    student = db.query(Student).filter(
        Student.student_id == student_id
    ).first()

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student record not found"
        )

    # Verify last name (case-insensitive)
    if student.last_name.upper() != last_name.upper():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Student information does not match"
        )

    # Check if already activated
    existing_profile = db.query(Profile).filter(
        Profile.student_id == student.student_id
    ).first()

    if existing_profile and existing_profile.status == AccountStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account already activated. Use /login to sign in."
        )

    # Self-verifying, time-limited token (15 minutes) binding this student_id
    # to a last name that's already been checked against the roster above -
    # enroll-mfa decrypts and re-checks it, instead of trusting a bare
    # client-supplied student_id with no proof step 1 ever happened.
    activation_token = encrypt_activation_token(student.student_id, student.last_name)

    return ActivationVerifyResponse(
        activation_token=activation_token,
        expires_in_seconds=15 * 60,
        student_name=f"{student.first_name} {student.last_name}"
    )


@router.post("/student-activate/enroll-mfa", response_model=MFAEnrollResponse)
@limiter.limit("10/minute")
def student_activate_enroll_mfa(
    request: Request,
    body: MFAEnrollRequest,
    db: Session = Depends(get_db)
):
    """
    Step 2: Generate TOTP secret and QR code for authenticator setup.
    Returns a scannable QR code image and setup token for verification.
    """

    # Recover the identity check from step 1 and confirm it was actually
    # issued for this student_id - without this, any caller could skip step 1
    # entirely and mint an authenticator for any student by student_id alone.
    try:
        activation_data = decrypt_activation_token(body.activation_token, max_age_seconds=900)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Activation session expired or invalid. Please restart activation.",
        )

    if activation_data["student_id"] != body.student_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Activation session does not match this student",
        )

    # Generate TOTP secret
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)

    # Create provisioning URL for QR code
    provisioning_uri = totp.provisioning_uri(
        name=body.student_id,
        issuer_name="PSITS"
    )

    # Render an actual scannable QR code image
    import io, base64
    import qrcode

    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_code_image = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"

    # Setup token binds the secret to this student for the confirm-mfa step,
    # so the server doesn't need to hold enrollment state in between requests.
    setup_token = encrypt_totp_setup(body.student_id, secret)

    return MFAEnrollResponse(
        qr_code_url=provisioning_uri,
        qr_code_image=qr_code_image,
        manual_entry_key=secret,  # For manual entry fallback
        setup_token=setup_token
    )


@router.post("/student-activate/confirm-mfa", response_model=MFAConfirmResponse)
@limiter.limit("10/minute")
def student_activate_confirm_mfa(
    request: Request,
    body: MFAConfirmRequest,
    db: Session = Depends(get_db)
):
    """
    Step 3: Verify TOTP code and complete enrollment.
    Student enters 6-digit code from authenticator.
    """

    # Verify student identity
    student = db.query(Student).filter(
        Student.student_id == body.student_id
    ).first()

    if not student or student.last_name.upper() != body.last_name.upper():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identity verification failed"
        )

    if not body.totp_code or len(body.totp_code) != 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid code format"
        )

    # Recover the secret generated during enroll-mfa and validate the submitted
    # code against it (setup tokens expire after 15 minutes)
    try:
        setup_data = decrypt_totp_setup(body.setup_token, max_age_seconds=900)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup session expired or invalid. Please restart activation."
        )

    if setup_data["student_id"] != body.student_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Setup session does not match this student"
        )

    secret = setup_data["secret"]
    if not pyotp.TOTP(secret).verify(body.totp_code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect code. Check your authenticator app and try again."
        )

    # Create profile (link Supabase user later)
    profile = db.query(Profile).filter(Profile.student_id == student.student_id).first()
    if not profile:
        profile = Profile(
            auth_user_id=str(uuid.uuid4()),  # TODO: Replace with real Supabase auth user id
            student_id=student.student_id,
            display_name=f"{student.first_name} {student.last_name}",
            email=f"student-{student.student_id}@psits.local",  # TODO: Real email
            status=AccountStatus.ACTIVE
        )
        db.add(profile)

    profile.totp_secret = encrypt_secret(secret)
    # Always set this explicitly, even when `profile` already existed (e.g.
    # re-activating after an admin reset) - it used to only get set inside
    # the `if not profile:` branch above, which silently assumed an
    # existing profile's status was already ACTIVE. That assumption broke
    # the moment something else (the admin reset-authenticator endpoint)
    # could legitimately set it to INACTIVE: confirm-mfa would report
    # "success" without ever flipping it back, so login kept failing with
    # "Account not active" and re-activation kept re-issuing a new QR
    # instead of recognizing the account as activated.
    profile.status = AccountStatus.ACTIVE

    # Mark student as activated
    student.is_active = True
    # TODO: identify who activated this account. AuditLog already has
    # ip_address/user_agent columns but nothing populates them - none of
    # these endpoints accept FastAPI's Request object yet. Add `request:
    # Request` here, log an AuditLog row with request.client.host + the
    # User-Agent header on activation. Note IP alone is a weak signal
    # (shared campus WiFi/NAT), useful as a forensic breadcrumb, not a
    # reliable identifier by itself.
    db.commit()

    return MFAConfirmResponse(
        status="ACTIVATED",
        message="Account activated successfully."
    )


# ============================================================================
# LOGIN ENDPOINTS
# ============================================================================

@router.post("/student-login", response_model=StudentLoginResponse)
@limiter.limit("10/minute")
def student_login(
    request: Request,
    body: StudentLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Student login with Student ID + authenticator code (passwordless).
    """

    # Look up student
    student = db.query(Student).filter(
        Student.student_id == body.student_id
    ).first()

    if not student or not student.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials or account not activated"
        )

    # Get profile
    profile = db.query(Profile).filter(
        Profile.student_id == student.student_id
    ).first()

    if not profile or profile.status != AccountStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not active"
        )

    # Verify authenticator code
    if not profile.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authenticator enrolled for this account"
        )

    secret = decrypt_secret(profile.totp_secret)
    if not pyotp.TOTP(secret).verify(body.authenticator_code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticator code"
        )

    # Signed JWT, verified by get_current_student on every subsequent
    # request - this used to be an opaque random string that no endpoint
    # ever checked, so "logging in" provided no actual access control.
    access_token = create_access_token(subject=student.id, token_type="student")

    # Log login
    audit = AuditLog(
        user_id=profile.id,
        action="student_login_success",
        entity_type="student",
        entity_id=student.id
    )
    db.add(audit)
    db.commit()

    return StudentLoginResponse(
        access_token=access_token,
        expires_in=60 * 60 * 12,
        user={
            "id": profile.id,
            "student_id": student.student_id,
            "name": f"{student.first_name} {student.last_name}",
            "email": profile.email
        }
    )


@router.post("/google-login")
@limiter.limit("10/minute")
def google_login(
    request: Request,
    body: GoogleLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Student login via Google Sign-In. Google's ID token proves who owns the
    email; the FIRST time a given Google account signs in, the caller must
    also supply their Student ID once, binding this Google account to that
    student's Profile (Profile.google_sub). Every sign-in after that just
    needs the ID token.
    """

    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server",
        )

    if not verify_turnstile(body.turnstile_token, remote_ip=request.client.host if request.client else None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification check failed. Please try again.",
        )

    try:
        claims = google_id_token.verify_oauth2_token(
            body.id_token, google_requests.Request(), settings.google_client_id
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google sign-in",
        )

    if not claims.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google email is not verified",
        )

    email = claims["email"].lower()
    google_sub = claims["sub"]
    picture = claims.get("picture")

    # Staging only: skip the school-domain requirement so testing isn't
    # blocked on having a real school-issued Google account.
    if settings.environment != "staging":
        if not email.endswith(f"@{settings.google_workspace_domain}"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sign in with your @{settings.google_workspace_domain} account",
            )

    # Already bound - this is a returning sign-in, no student_id needed.
    profile = db.query(Profile).filter(Profile.google_sub == google_sub).first()
    if profile:
        student = db.query(Student).filter(Student.student_id == profile.student_id).first()
        if not student or not student.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not active")

        # Keep the avatar in sync in case they've changed their Google photo.
        if picture and profile.profile_image_url != picture:
            profile.profile_image_url = picture

        access_token = create_access_token(subject=student.id, token_type="student")
        db.add(AuditLog(
            user_id=profile.id, action="student_login_success_google",
            entity_type="student", entity_id=student.id,
        ))
        db.commit()

        return StudentLoginResponse(
            access_token=access_token,
            expires_in=60 * 60 * 12,
            user={
                "id": profile.id,
                "student_id": student.student_id,
                "name": f"{student.first_name} {student.last_name}",
                "email": profile.email,
                "avatar_url": profile.profile_image_url,
            },
        )

    # First time this Google account has signed in - need the Student ID to
    # know which student record to bind it to.
    if not body.student_id:
        return GoogleLoginNeedsBindingResponse(email=email)

    student = db.query(Student).filter(Student.student_id == body.student_id.strip()).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student record not found")

    # Cross-match: the Google account signing in must be the specific email
    # already on file for this student - knowing a Student ID alone (visible
    # on IDs, class lists, etc.) is not enough to claim it.
    if not student.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No email on file for this student. Contact an admin to set it up before linking.",
        )
    if student.email.strip().lower() != email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This Google account does not match the email on file for this Student ID.",
        )

    existing_profile = db.query(Profile).filter(Profile.student_id == student.student_id).first()
    if existing_profile and existing_profile.google_sub:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This student is already linked to a different Google account",
        )

    if existing_profile:
        existing_profile.google_sub = google_sub
        existing_profile.email = email
        existing_profile.status = AccountStatus.ACTIVE
        existing_profile.profile_image_url = picture
        profile = existing_profile
    else:
        profile = Profile(
            auth_user_id=str(uuid.uuid4()),
            student_id=student.student_id,
            display_name=f"{student.first_name} {student.last_name}",
            email=email,
            status=AccountStatus.ACTIVE,
            google_sub=google_sub,
            profile_image_url=picture,
        )
        db.add(profile)

    student.is_active = True
    db.flush()

    access_token = create_access_token(subject=student.id, token_type="student")
    db.add(AuditLog(
        user_id=profile.id, action="student_google_account_bound",
        entity_type="student", entity_id=student.id,
    ))
    db.commit()

    return StudentLoginResponse(
        access_token=access_token,
        expires_in=60 * 60 * 12,
        user={
            "id": profile.id,
            "student_id": student.student_id,
            "name": f"{student.first_name} {student.last_name}",
            "email": profile.email,
            "avatar_url": profile.profile_image_url,
        },
    )


# ============================================================================
# DASHBOARD
# ============================================================================

def _balance_summary(student: Student, db: Session) -> dict:
    fees = db.query(MembershipFee).filter(MembershipFee.student_id == student.id).all()
    total_due = sum(float(f.amount_due) for f in fees)
    total_paid = sum(float(f.amount_paid) for f in fees)
    outstanding = total_due - total_paid

    if not fees:
        status_label = "NO_DATA"
    elif outstanding <= 0:
        status_label = "PAID"
    elif total_paid > 0:
        status_label = "PARTIAL"
    else:
        status_label = "UNPAID"

    return {"amount_due": outstanding, "status": status_label}


@router.get("/me/dashboard")
def get_student_dashboard(
    student: Student = Depends(get_current_student), db: Session = Depends(get_db)
):
    """Everything the student dashboard needs in one call: profile, program/year,
    attendance history, and event registration status.

    Always the CALLER's own data - student identity comes from the verified
    Bearer token, not a client-supplied id, so one student can't pull
    another's attendance history by guessing/enumerating student IDs."""
    from app.models.event import Event, EventRegistration, Attendance

    student_id = student.student_id
    profile = db.query(Profile).filter(Profile.student_id == student_id).first()

    school_year = db.query(StudentSchoolYear).filter(
        StudentSchoolYear.student_id == student.id
    ).order_by(StudentSchoolYear.enrolled_at.desc()).first()

    program_name = school_year.program.code if school_year and school_year.program else None
    year_level = school_year.year_level if school_year else None
    academic_standing = school_year.academic_standing if school_year else None

    attendance_rows = (
        db.query(Attendance, Event)
        .join(Event, Attendance.event_id == Event.id)
        .filter(Attendance.student_id == student.id, Attendance.time_in.isnot(None))
        .order_by(Attendance.time_in.desc())
        .all()
    )

    registered_event_ids = {
        r.event_id for r in db.query(EventRegistration).filter(
            EventRegistration.student_id == student.id
        ).all()
    }

    # Archived, mandatory events this student never even registered for - surfaced
    # so skipping registration entirely isn't invisible on their own history too.
    missed_required_events = (
        db.query(Event)
        .filter(
            Event.status == "ARCHIVED",
            Event.attendance_required.is_(True),
            ~Event.id.in_(registered_event_ids) if registered_event_ids else True,
        )
        .all()
    )

    return {
        "student": {
            "student_id": student.student_id,
            "name": f"{student.first_name} {student.last_name}",
            "email": profile.email if profile else None,
            "program": program_name,
            "year_level": year_level,
            "academic_standing": academic_standing,
            "avatar_url": profile.profile_image_url if profile else None,
        },
        "balance": _balance_summary(student, db),
        "sanctions": [],
        "attendance": [
            {
                "event_id": event.id,
                "event_name": event.name,
                "time_in": as_utc(record.time_in).isoformat() if record.time_in else None,
                "time_out": as_utc(record.time_out).isoformat() if record.time_out else None,
                "status": finalize_status(record.status, event.status),
                "is_late": is_late(record.time_in, event.event_date),
            }
            for record, event in attendance_rows
        ] + [
            {
                "event_id": event.id,
                "event_name": event.name,
                "time_in": None,
                "time_out": None,
                "status": "EXCUSED" if year_level in (event.excused_year_levels or []) else "NOT_REGISTERED",
                "is_late": False,
            }
            for event in missed_required_events
        ],
        "registered_event_ids": list(registered_event_ids),
    }
