"""Officer-facing scanner API for the 3-checkpoint attendance workflow.

The contract is deliberately narrow:

    POST /scanner/session   event code + PIN  -> session token
    GET  /scanner/session   what am I scanning, and which checkpoint is open?
    POST /scanner/scan      a student's QR    -> recorded at the OPEN checkpoint
    POST /scanner/logout    end the session

The scanner never says which checkpoint it is recording. The event's
attendance_phase decides, the admin controls the phase, and a client that
sends a checkpoint anyway is checked against the server's answer and rejected
if it disagrees. That is the whole anti-fraud premise: an officer's device
cannot decide it is time for OUT.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.attendance import as_utc
from app.core.checkpoints import active_checkpoint, is_valid_phase
from app.core.database import get_db
from app.core.deps import get_current_scanner_session
from app.core.rate_limit import limiter
from app.core.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, verify_password
from app.models.event import Event, EventRegistration
from app.models.officer import EventOfficerAssignment, Officer, ScannerSession
from app.models.student import Student
from app.services.checkpoint_attendance import (
    existing_scan,
    is_cross_section,
    record_checkpoint_scan,
    student_course_year_section,
)

router = APIRouter(prefix="/scanner", tags=["scanner"])


# ============================================================================
# SCHEMAS
# ============================================================================

class ScannerLoginRequest(BaseModel):
    event_code: str = Field(min_length=1, max_length=64)
    pin: str = Field(min_length=1, max_length=64)


class ScannerAssignmentInfo(BaseModel):
    id: str
    course: str
    year_level: int
    section: str


class ScannerContext(BaseModel):
    """Everything the scanner UI header needs, refreshed on every poll."""
    event_id: str
    event_name: str
    event_code: str | None
    officer_id: str
    officer_name: str
    assignment: ScannerAssignmentInfo
    attendance_phase: str
    current_checkpoint: str | None  # None when no checkpoint is open right now
    scan_count: int  # scans this session's officer has taken at this checkpoint


class ScannerLoginResponse(BaseModel):
    token: str
    session_id: str
    expires_at: datetime
    context: ScannerContext


class ScanRequest(BaseModel):
    student_id: str
    # Optional and only ever used to REJECT a mismatch. The server derives the
    # real checkpoint from the event phase; this exists so a client that has
    # drifted out of sync (admin advanced the phase mid-queue) is told so
    # loudly instead of silently recording the wrong checkpoint.
    checkpoint: str | None = None
    # Set true only after the officer confirmed the "not your section" prompt.
    allow_cross_section: bool = False


class ScanResponse(BaseModel):
    status: str  # SCANNED, ALREADY_SCANNED, CROSS_SECTION_CONFIRM
    checkpoint: str
    student_id: str
    student_name: str
    student_course: str | None
    student_year_level: int | None
    student_section: str | None
    cross_section: bool
    scanned_at: datetime | None
    message: str | None = None


# ============================================================================
# LOGIN
# ============================================================================

def _resolve_event(db: Session, event_code: str) -> Event | None:
    """Accept the short event code, or the raw event id for links/QRs."""
    code = event_code.strip()
    event = db.query(Event).filter(Event.event_code == code.upper()).first()
    if event:
        return event
    return db.query(Event).filter(Event.id == code).first()


@router.post("/session", response_model=ScannerLoginResponse)
@limiter.limit("10/minute")
def create_scanner_session(
    request: Request,
    body: ScannerLoginRequest,
    db: Session = Depends(get_db),
):
    """Authenticate an officer for one event and open a scanner session.

    A PIN is short and low-entropy by design (it gets typed on a phone in a
    noisy gym), so two things carry the security here: the candidate set is
    only officers already assigned to THIS event - never every officer in the
    system - and the endpoint is rate limited. Getting in still requires
    knowing which event you are attacking and being on its roster.

    Every failure returns the same generic message. Telling an attacker
    "correct PIN, wrong event" or "that officer is deactivated" hands them a
    free oracle.
    """
    generic = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid event code or PIN",
    )

    event = _resolve_event(db, body.event_code)
    if not event:
        raise generic

    if event.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event is not open for attendance scanning",
        )

    # Only officers actually assigned to this event are candidates, so the
    # bcrypt verifications below stay bounded by the event's roster.
    assignments = (
        db.query(EventOfficerAssignment)
        .options(joinedload(EventOfficerAssignment.officer))
        .filter(EventOfficerAssignment.event_id == event.id)
        .all()
    )

    matched: tuple[Officer, EventOfficerAssignment] | None = None
    for assignment in assignments:
        officer = assignment.officer
        if not officer or not officer.is_active:
            continue
        if verify_password(body.pin, officer.pin_hash):
            matched = (officer, assignment)
            break

    if not matched:
        raise generic

    officer, assignment = matched

    expires_at = (
        datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    ).replace(tzinfo=None)

    session = ScannerSession(
        event_id=event.id,
        officer_id=officer.id,
        assignment_id=assignment.id,
        expires_at=expires_at,
        last_seen_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    token = create_access_token(subject=session.id, token_type="scanner")

    return ScannerLoginResponse(
        token=token,
        session_id=session.id,
        expires_at=as_utc(expires_at),
        context=_build_context(db, session),
    )


def _build_context(db: Session, session: ScannerSession) -> ScannerContext:
    from app.models.officer import AttendanceCheckpointScan

    event = session.event
    checkpoint = active_checkpoint(event.attendance_phase)

    scan_count = 0
    if checkpoint:
        scan_count = (
            db.query(AttendanceCheckpointScan)
            .filter(
                AttendanceCheckpointScan.event_id == event.id,
                AttendanceCheckpointScan.checkpoint == checkpoint,
                AttendanceCheckpointScan.officer_id == session.officer_id,
            )
            .count()
        )

    return ScannerContext(
        event_id=event.id,
        event_name=event.name,
        event_code=event.event_code,
        officer_id=session.officer_id,
        officer_name=session.officer.name,
        assignment=ScannerAssignmentInfo(
            id=session.assignment.id,
            course=session.assignment.course,
            year_level=session.assignment.year_level,
            section=session.assignment.section,
        ),
        attendance_phase=event.attendance_phase,
        current_checkpoint=checkpoint,
        scan_count=scan_count,
    )


@router.get("/session", response_model=ScannerContext)
def get_scanner_context(
    session: ScannerSession = Depends(get_current_scanner_session),
    db: Session = Depends(get_db),
):
    """Current session state, including which checkpoint is open right now.

    The scanner polls this so an admin opening MIDDLE propagates without the
    officer logging in again. (Admins watching the event also get a WebSocket
    push - see events_mvp.attendance_ws_manager - but a scanner on flaky venue
    wifi needs a mechanism that survives a dropped socket.)
    """
    return _build_context(db, session)


@router.post("/logout")
def end_scanner_session(
    session: ScannerSession = Depends(get_current_scanner_session),
    db: Session = Depends(get_db),
):
    session.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return {"status": "ENDED"}


# ============================================================================
# SCANNING
# ============================================================================

@router.post("/scan", response_model=ScanResponse)
async def scan_student(
    body: ScanRequest,
    session: ScannerSession = Depends(get_current_scanner_session),
    db: Session = Depends(get_db),
):
    """Record the scanned student at whichever checkpoint the event has open."""
    event = session.event

    if not is_valid_phase(event.attendance_phase):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This event's attendance phase is in an unknown state",
        )

    checkpoint = active_checkpoint(event.attendance_phase)
    if not checkpoint:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No attendance checkpoint is open right now. "
                "Wait for an admin to open the next one."
            ),
        )

    # The client is allowed to state which checkpoint it thinks it's on, but
    # only so a disagreement can be caught. The server's answer always wins.
    if body.checkpoint and body.checkpoint.upper() != checkpoint:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This event is on the {checkpoint} checkpoint, not {body.checkpoint.upper()}",
        )

    student = db.query(Student).filter(Student.student_id == body.student_id.strip()).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid QR code")

    student_name = f"{student.first_name} {student.last_name}"

    # Registration is still required, exactly as it is for the legacy
    # scan-in/scan-out endpoints. This is a preserved existing rule, not a new
    # one - and it's a different thing from the cross-section check below,
    # which deliberately does NOT reject.
    registered = (
        db.query(EventRegistration)
        .filter(
            EventRegistration.event_id == event.id,
            EventRegistration.student_id == student.id,
        )
        .first()
    )
    if not registered:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{student_name} is not registered for this event",
        )
    student_course, student_year_level, student_section = student_course_year_section(db, student.id)

    already = existing_scan(db, event.id, student.id, checkpoint)
    if already:
        return ScanResponse(
            status="ALREADY_SCANNED",
            checkpoint=checkpoint,
            student_id=student.student_id,
            student_name=student_name,
            student_course=student_course,
            student_year_level=student_year_level,
            student_section=student_section,
            cross_section=already.cross_section,
            scanned_at=as_utc(already.scanned_at),
            message=f"{student_name} is already scanned for {checkpoint}.",
        )

    assignment = session.assignment
    cross = is_cross_section(
        assignment.course, assignment.year_level, assignment.section,
        student_course, student_year_level, student_section,
    )

    # Cross-section is ALLOWED - it is flagged, never rejected. A student
    # genuinely in the wrong queue still attended, and an officer turning them
    # away because of a roster mismatch is the failure mode to avoid. The
    # two-step confirm exists so the officer notices, not so they're blocked.
    if cross and not body.allow_cross_section:
        return ScanResponse(
            status="CROSS_SECTION_CONFIRM",
            checkpoint=checkpoint,
            student_id=student.student_id,
            student_name=student_name,
            student_course=student_course,
            student_year_level=student_year_level,
            student_section=student_section,
            cross_section=True,
            scanned_at=None,
            message=(
                f"{student_name} is {student_course or '?'} Year {student_year_level or '?'} "
                f"{student_section or '?'}, not your assigned {assignment.course} "
                f"Year {assignment.year_level} {assignment.section}."
            ),
        )

    try:
        scan = record_checkpoint_scan(
            db,
            event_id=event.id,
            student_id=student.id,
            checkpoint=checkpoint,
            officer_id=session.officer_id,
            assignment_id=assignment.id,
            scanner_session_id=session.id,
            officer_course=assignment.course,
            officer_year_level=assignment.year_level,
            officer_section=assignment.section,
            student_course=student_course,
            student_year_level=student_year_level,
            student_section=student_section,
            cross_section=cross,
        )
        db.commit()
    except IntegrityError:
        # Two officers scanned the same student at the same checkpoint at the
        # same instant, or one officer double-tapped through a retry. The
        # unique (event, student, checkpoint) constraint caught it. The state
        # either request wanted is already true, so report the duplicate
        # rather than a 500.
        db.rollback()
        already = existing_scan(db, event.id, student.id, checkpoint)
        return ScanResponse(
            status="ALREADY_SCANNED",
            checkpoint=checkpoint,
            student_id=student.student_id,
            student_name=student_name,
            student_course=student_course,
            student_year_level=student_year_level,
            student_section=student_section,
            cross_section=bool(already and already.cross_section),
            scanned_at=as_utc(already.scanned_at) if already else None,
            message=f"{student_name} is already scanned for {checkpoint}.",
        )

    from app.api.v1.endpoints.events_mvp import attendance_ws_manager

    await attendance_ws_manager.broadcast(event.id, {"type": "attendance_updated"})

    return ScanResponse(
        status="SCANNED",
        checkpoint=checkpoint,
        student_id=student.student_id,
        student_name=student_name,
        student_course=student_course,
        student_year_level=student_year_level,
        student_section=student_section,
        cross_section=cross,
        scanned_at=as_utc(scan.scanned_at),
    )
