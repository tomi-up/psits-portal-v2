"""Admin management of scanner officers and their per-event assignments.

Two routers here:

    /officer/officers            the persistent roster of people who may scan
    /officer/events/{id}/officers  who is covering which section at one event

Both are behind admin login. No endpoint on either ever returns pin_hash or
anything derived from it - the only way a PIN leaves this system is that
somebody typed it in on the scanner.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.security import hash_password
from app.models.event import Event
from app.models.officer import (
    AttendanceCheckpointScan,
    EventOfficerAssignment,
    Officer,
    ScannerSession,
)

router = APIRouter(
    prefix="/officer/officers", tags=["admin-officers"], dependencies=[Depends(get_current_admin)]
)
event_officers_router = APIRouter(
    prefix="/officer/events", tags=["admin-officers"], dependencies=[Depends(get_current_admin)]
)

MIN_PIN_LENGTH = 4
MAX_PIN_LENGTH = 12


def _validate_pin(pin: str) -> str:
    pin = pin.strip()
    if not pin.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="PIN must contain digits only"
        )
    if not (MIN_PIN_LENGTH <= len(pin) <= MAX_PIN_LENGTH):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"PIN must be between {MIN_PIN_LENGTH} and {MAX_PIN_LENGTH} digits",
        )
    return pin


# ============================================================================
# OFFICER ROSTER
# ============================================================================

class OfficerResponse(BaseModel):
    """Note the absence of any PIN field. That is deliberate and load-bearing."""
    id: str
    name: str
    is_active: bool
    created_at: datetime
    assignment_count: int = 0

    class Config:
        from_attributes = True


class OfficerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    pin: str
    confirm_pin: str
    is_active: bool = True

    @field_validator("confirm_pin")
    @classmethod
    def pins_match(cls, v, info):
        if info.data.get("pin") is not None and v != info.data["pin"]:
            raise ValueError("PINs do not match")
        return v


class OfficerUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    is_active: bool


class OfficerPinResetRequest(BaseModel):
    pin: str
    confirm_pin: str

    @field_validator("confirm_pin")
    @classmethod
    def pins_match(cls, v, info):
        if info.data.get("pin") is not None and v != info.data["pin"]:
            raise ValueError("PINs do not match")
        return v


def _get_officer_or_404(db: Session, officer_id: str) -> Officer:
    officer = db.query(Officer).filter(Officer.id == officer_id).first()
    if not officer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Officer not found")
    return officer


@router.get("/")
def list_officers(db: Session = Depends(get_db)):
    officers = db.query(Officer).order_by(Officer.name).all()

    counts: dict[str, int] = {}
    for assignment in db.query(EventOfficerAssignment).all():
        counts[assignment.officer_id] = counts.get(assignment.officer_id, 0) + 1

    return {
        "officers": [
            OfficerResponse(
                id=o.id,
                name=o.name,
                is_active=o.is_active,
                created_at=o.created_at,
                assignment_count=counts.get(o.id, 0),
            )
            for o in officers
        ]
    }


@router.post("/")
def create_officer(body: OfficerCreateRequest, db: Session = Depends(get_db)):
    pin = _validate_pin(body.pin)

    officer = Officer(
        name=body.name.strip(),
        pin_hash=hash_password(pin),
        is_active=body.is_active,
    )
    db.add(officer)
    db.commit()
    db.refresh(officer)

    return OfficerResponse.model_validate(officer)


@router.put("/{officer_id}")
def update_officer(officer_id: str, body: OfficerUpdateRequest, db: Session = Depends(get_db)):
    """Rename or activate/deactivate. The PIN is untouched here - resetting it
    is a separate, deliberate action (see below)."""
    officer = _get_officer_or_404(db, officer_id)

    was_active = officer.is_active
    officer.name = body.name.strip()
    officer.is_active = body.is_active

    if was_active and not body.is_active:
        # Deactivating has to take effect now, not at token expiry - the point
        # of switching an officer off mid-event is that they stop scanning
        # immediately. get_current_scanner_session re-checks is_active too;
        # revoking here also cleans up the session rows.
        _revoke_sessions(db, officer_id=officer.id)

    db.commit()
    db.refresh(officer)
    return OfficerResponse.model_validate(officer)


@router.post("/{officer_id}/pin")
def reset_officer_pin(officer_id: str, body: OfficerPinResetRequest, db: Session = Depends(get_db)):
    """Set a new PIN. The old one is never read, shown, or compared - there is
    no endpoint anywhere that can reveal it, only overwrite it."""
    officer = _get_officer_or_404(db, officer_id)
    pin = _validate_pin(body.pin)

    officer.pin_hash = hash_password(pin)
    # A PIN change invalidates sessions opened with the old one, for the same
    # reason a password change signs you out everywhere.
    _revoke_sessions(db, officer_id=officer.id)
    db.commit()

    return {"status": "PIN_UPDATED", "officer_id": officer.id}


def _revoke_sessions(db: Session, *, officer_id: str, event_id: str | None = None) -> None:
    query = db.query(ScannerSession).filter(
        ScannerSession.officer_id == officer_id, ScannerSession.revoked_at.is_(None)
    )
    if event_id:
        query = query.filter(ScannerSession.event_id == event_id)
    for session in query.all():
        session.revoked_at = datetime.utcnow()


# ============================================================================
# PER-EVENT ASSIGNMENTS
# ============================================================================

VALID_ASSIGNMENT_YEAR_LEVELS = {1, 2, 3, 4}


class AssignmentResponse(BaseModel):
    id: str
    officer_id: str
    officer_name: str
    officer_active: bool
    course: str
    year_level: int
    section: str
    scan_count: int


class AssignmentCreateRequest(BaseModel):
    officer_id: str
    course: str = Field(min_length=1, max_length=20)
    year_level: int
    section: str = Field(min_length=1, max_length=10)

    @field_validator("year_level")
    @classmethod
    def valid_year_level(cls, v):
        if v not in VALID_ASSIGNMENT_YEAR_LEVELS:
            raise ValueError(f"year_level must be one of {sorted(VALID_ASSIGNMENT_YEAR_LEVELS)}")
        return v


def _get_event_or_404(db: Session, event_id: str) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@event_officers_router.get("/{event_id}/officers")
def list_event_officers(event_id: str, db: Session = Depends(get_db)):
    """Who is assigned to this event, grouped by the section they cover.

    Several officers sharing one course+section is normal and supported - a
    200-student section needs more than one scanner - so this is a flat list
    the UI groups, not a section->officer map.
    """
    _get_event_or_404(db, event_id)

    assignments = (
        db.query(EventOfficerAssignment)
        .options(joinedload(EventOfficerAssignment.officer))
        .filter(EventOfficerAssignment.event_id == event_id)
        .all()
    )

    scan_counts: dict[str, int] = {}
    for scan in (
        db.query(AttendanceCheckpointScan)
        .filter(AttendanceCheckpointScan.event_id == event_id)
        .all()
    ):
        if scan.assignment_id:
            scan_counts[scan.assignment_id] = scan_counts.get(scan.assignment_id, 0) + 1

    rows = [
        AssignmentResponse(
            id=a.id,
            officer_id=a.officer_id,
            officer_name=a.officer.name if a.officer else "(deleted officer)",
            officer_active=bool(a.officer and a.officer.is_active),
            course=a.course,
            year_level=a.year_level,
            section=a.section,
            scan_count=scan_counts.get(a.id, 0),
        )
        for a in assignments
    ]
    rows.sort(key=lambda r: (r.course, r.year_level, r.section, r.officer_name))

    return {"event_id": event_id, "assignments": rows}


@event_officers_router.post("/{event_id}/officers")
def assign_officer_to_event(
    event_id: str, body: AssignmentCreateRequest, db: Session = Depends(get_db)
):
    """Assign an officer to a course/section FOR THIS EVENT ONLY.

    The same officer can hold a different assignment at the next event; that's
    why this lives here rather than on the officer record.
    """
    _get_event_or_404(db, event_id)
    _get_officer_or_404(db, body.officer_id)

    assignment = EventOfficerAssignment(
        event_id=event_id,
        officer_id=body.officer_id,
        course=body.course.strip().upper(),
        year_level=body.year_level,
        section=body.section.strip().upper(),
    )
    db.add(assignment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This officer already covers that course, year, and section for this event",
        )
    db.refresh(assignment)

    return AssignmentResponse(
        id=assignment.id,
        officer_id=assignment.officer_id,
        officer_name=assignment.officer.name,
        officer_active=assignment.officer.is_active,
        course=assignment.course,
        year_level=assignment.year_level,
        section=assignment.section,
        scan_count=0,
    )


@event_officers_router.delete("/{event_id}/officers/{assignment_id}")
def unassign_officer(event_id: str, assignment_id: str, db: Session = Depends(get_db)):
    assignment = (
        db.query(EventOfficerAssignment)
        .filter(
            EventOfficerAssignment.id == assignment_id,
            EventOfficerAssignment.event_id == event_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    # Scans already taken under this assignment keep pointing at it by design
    # (the FK is ON DELETE SET NULL and the scan row carries its own copy of
    # the course/section), so removing an assignment never rewrites history.
    _revoke_sessions(db, officer_id=assignment.officer_id, event_id=event_id)
    db.delete(assignment)
    db.commit()

    return {"status": "UNASSIGNED", "assignment_id": assignment_id}


# ============================================================================
# SCAN AUDIT
# ============================================================================

class ScanAuditRow(BaseModel):
    id: str
    checkpoint: str
    student_id: str
    student_name: str
    student_course: str | None
    student_year_level: int | None
    student_section: str | None
    officer_id: str | None
    officer_name: str | None
    officer_course: str | None
    officer_year_level: int | None
    officer_section: str | None
    cross_section: bool
    scanned_at: datetime


@event_officers_router.get("/{event_id}/checkpoint-scans")
def list_checkpoint_scans(
    event_id: str, cross_section_only: bool = False, db: Session = Depends(get_db)
):
    """The audit trail: who scanned this student, at which checkpoint, when.

    This is the endpoint that answers the two questions the whole officer
    model exists for - "who scanned this student?" and "which section was that
    officer responsible for?"
    """
    from app.core.attendance import as_utc

    _get_event_or_404(db, event_id)

    query = (
        db.query(AttendanceCheckpointScan)
        .options(
            joinedload(AttendanceCheckpointScan.student),
            joinedload(AttendanceCheckpointScan.officer),
        )
        .filter(AttendanceCheckpointScan.event_id == event_id)
    )
    if cross_section_only:
        query = query.filter(AttendanceCheckpointScan.cross_section.is_(True))

    scans = query.order_by(AttendanceCheckpointScan.scanned_at.desc()).all()

    return {
        "event_id": event_id,
        "total": len(scans),
        "scans": [
            ScanAuditRow(
                id=s.id,
                checkpoint=s.checkpoint,
                student_id=s.student.student_id if s.student else "(deleted)",
                student_name=(
                    f"{s.student.first_name} {s.student.last_name}" if s.student else "(deleted)"
                ),
                student_course=s.student_course,
                student_year_level=s.student_year_level,
                student_section=s.student_section,
                officer_id=s.officer_id,
                officer_name=s.officer.name if s.officer else None,
                officer_course=s.officer_course,
                officer_year_level=s.officer_year_level,
                officer_section=s.officer_section,
                cross_section=s.cross_section,
                scanned_at=as_utc(s.scanned_at),
            )
            for s in scans
        ],
    }
