"""Officer/admin event management - MVP for creating and editing events.

Gated behind admin login (see app/core/deps.py::get_current_admin) - every
route on this router requires a valid `Authorization: Bearer <token>` from
POST /api/v1/admin/auth/login.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
import uuid
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.attendance import as_utc, is_late as _is_late, finalize_status
from app.core.deps import get_current_admin
from app.models.event import Event, EventRegistration, Attendance
from app.models.student import Student, StudentSchoolYear
from app.services.attendance_export import build_attendance_workbook, safe_filename

router = APIRouter(prefix="/officer/events", tags=["admin-events"], dependencies=[Depends(get_current_admin)])


VALID_STATUSES = {"DRAFT", "ACTIVE", "ARCHIVED"}
VALID_YEAR_LEVELS = {1, 2, 3, 4}


def _normalize_excused_year_levels(value: list[int] | None) -> list[int] | None:
    if not value:
        return None
    invalid = sorted(set(value) - VALID_YEAR_LEVELS)
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid year level(s) in excused_year_levels: {invalid}. Must be within {sorted(VALID_YEAR_LEVELS)}",
        )
    return sorted(set(value))


class EventCreateRequest(BaseModel):
    name: str
    venue: str = Field(min_length=1)
    description: str
    event_date: datetime
    status: str = "DRAFT"
    cover_image_url: str | None = None
    attendance_required: bool = False
    excused_year_levels: list[int] | None = None


class EventUpdateRequest(BaseModel):
    name: str
    venue: str = Field(min_length=1)
    description: str
    event_date: datetime
    status: str
    cover_image_url: str | None = None
    attendance_required: bool = False
    excused_year_levels: list[int] | None = None


class EventAdminResponse(BaseModel):
    id: str
    name: str
    venue: str | None
    description: str | None
    event_date: datetime | None
    cover_image_url: str | None
    status: str
    attendance_required: bool
    excused_year_levels: list[int] | None
    created_at: datetime

    class Config:
        from_attributes = True


def _validate_status(value: str):
    if value not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Status must be one of {sorted(VALID_STATUSES)}",
        )


@router.get("/")
def list_all_events(db: Session = Depends(get_db)):
    """List every event regardless of status, for the admin table."""
    events = db.query(Event).order_by(Event.event_date.desc()).all()
    return {"events": [EventAdminResponse.model_validate(e) for e in events]}


@router.post("/")
def create_event(request: EventCreateRequest, db: Session = Depends(get_db)):
    _validate_status(request.status)

    event = Event(
        name=request.name,
        venue=request.venue,
        description=request.description,
        event_date=request.event_date,
        status=request.status,
        cover_image_url=request.cover_image_url,
        attendance_required=request.attendance_required,
        excused_year_levels=_normalize_excused_year_levels(request.excused_year_levels),
        is_active=request.status == "ACTIVE",
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return EventAdminResponse.model_validate(event)


@router.put("/{event_id}")
def update_event(event_id: str, request: EventUpdateRequest, db: Session = Depends(get_db)):
    _validate_status(request.status)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    event.name = request.name
    event.venue = request.venue
    event.description = request.description
    event.event_date = request.event_date
    event.status = request.status
    event.cover_image_url = request.cover_image_url
    event.attendance_required = request.attendance_required
    event.excused_year_levels = _normalize_excused_year_levels(request.excused_year_levels)
    event.is_active = request.status == "ACTIVE"

    db.commit()
    db.refresh(event)

    return EventAdminResponse.model_validate(event)


@router.delete("/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    """Delete an event, but only if it has zero attendance records. Once
    students have actually been scanned in/out - or an admin has set an
    attendance override - the event represents real historical data and
    must be archived instead of deleted."""

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    has_attendance = db.query(Attendance).filter(Attendance.event_id == event_id).first() is not None
    if has_attendance:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This event already has attendance records and can't be deleted. Archive it instead.",
        )

    db.query(EventRegistration).filter(EventRegistration.event_id == event_id).delete()
    db.delete(event)
    db.commit()

    return {"deleted": True}


class RegistrationRow(BaseModel):
    student_id: str
    student_name: str
    first_name: str
    middle_name: str | None
    last_name: str
    program: str | None
    year_level: int | None
    section: str | None
    registration_status: str  # REGISTERED, NOT_REGISTERED, or NOT_REQUIRED (excused)
    registered_at: datetime | None  # None for a NOT_REGISTERED/NOT_REQUIRED row - they never registered
    time_in: datetime | None
    time_out: datetime | None
    status: str  # NO_SHOW, INCOMPLETE, PRESENT, ABSENT, NOT_REGISTERED, or EXCUSED
    is_late: bool


class EventRegistrationsResponse(BaseModel):
    event_id: str
    event_name: str
    event_date: datetime | None
    total_registered: int
    total_present: int
    total_incomplete: int
    total_no_show: int
    total_absent: int
    total_not_registered: int
    total_excused: int
    total_late: int
    registrations: list[RegistrationRow]


def _latest_school_years(db: Session) -> dict[str, StudentSchoolYear]:
    """One query for every student's most recent enrollment record, instead of
    a separate round-trip per student - the per-student version made the
    ARCHIVED+attendance_required roster expansion below take 80+ seconds
    against the remote DB once a school has a few hundred students."""
    rows = (
        db.query(StudentSchoolYear)
        .options(joinedload(StudentSchoolYear.program))
        .order_by(StudentSchoolYear.student_id, StudentSchoolYear.enrolled_at.desc())
        .all()
    )
    latest: dict[str, StudentSchoolYear] = {}
    for row in rows:
        latest.setdefault(row.student_id, row)
    return latest


def build_event_registrations(db: Session, event: Event) -> EventRegistrationsResponse:
    """Every student who registered for this event, with their scan-in/scan-out
    status, plus - for an ARCHIVED, attendance-required event - every eligible
    student who never registered at all. Shared by the DataTable endpoint and
    the Excel export so both always show identical rows and totals.

    "Late" is independent of status - a student can be late AND present
    (checked in late, checked out normally) or late AND incomplete.
    """

    registrations = (
        db.query(EventRegistration)
        .options(joinedload(EventRegistration.student))
        .filter(EventRegistration.event_id == event.id)
        .order_by(EventRegistration.registered_at)
        .all()
    )

    attendance_by_student = {
        a.student_id: a
        for a in db.query(Attendance).filter(Attendance.event_id == event.id).all()
    }

    school_years_by_student = _latest_school_years(db)
    excused_year_levels = set(event.excused_year_levels or [])

    rows = []
    for reg in registrations:
        student = reg.student
        school_year = school_years_by_student.get(student.id)
        attendance = attendance_by_student.get(student.id)

        if attendance and attendance.status in ("EXCUSED", "ABSENT"):
            # Explicitly set by an admin, regardless of scan history - distinct
            # from the NO_SHOW default below (never scanned in) and from the
            # year-level blanket excuse further down (never registered at all).
            row_status = attendance.status
        elif not attendance or not attendance.time_in:
            row_status = "NO_SHOW"
        else:
            row_status = finalize_status(attendance.status, event.status)

        rows.append(
            RegistrationRow(
                student_id=student.student_id,
                student_name=f"{student.first_name} {student.last_name}",
                first_name=student.first_name,
                middle_name=student.middle_name,
                last_name=student.last_name,
                program=school_year.program.code if school_year and school_year.program else None,
                year_level=school_year.year_level if school_year else None,
                section=school_year.section if school_year else None,
                registration_status="REGISTERED",
                registered_at=reg.registered_at,
                time_in=as_utc(attendance.time_in) if attendance else None,
                time_out=as_utc(attendance.time_out) if attendance else None,
                status=row_status,
                is_late=_is_late(attendance.time_in if attendance else None, event.event_date),
            )
        )

    total_registered = len(rows)

    if event.status == "ARCHIVED" and event.attendance_required:
        # Note: intentionally not filtering by Student.is_active - that field
        # means "has completed MFA activation" (see student_auth.py), not
        # "currently enrolled". A student who hasn't even activated their
        # portal account is if anything more deserving of a NOT_REGISTERED
        # flag, not less.
        registered_student_ids = {reg.student_id for reg in registrations}
        not_registered_students = (
            db.query(Student)
            .filter(~Student.id.in_(registered_student_ids) if registered_student_ids else True)
            .all()
        )
        for student in not_registered_students:
            school_year = school_years_by_student.get(student.id)
            is_excused = bool(school_year and school_year.year_level in excused_year_levels)
            rows.append(
                RegistrationRow(
                    student_id=student.student_id,
                    student_name=f"{student.first_name} {student.last_name}",
                    first_name=student.first_name,
                    middle_name=student.middle_name,
                    last_name=student.last_name,
                    program=school_year.program.code if school_year and school_year.program else None,
                    year_level=school_year.year_level if school_year else None,
                    section=school_year.section if school_year else None,
                    registration_status="NOT_REQUIRED" if is_excused else "NOT_REGISTERED",
                    registered_at=None,
                    time_in=None,
                    time_out=None,
                    status="EXCUSED" if is_excused else "NOT_REGISTERED",
                    is_late=False,
                )
            )

    return EventRegistrationsResponse(
        event_id=event.id,
        event_name=event.name,
        # event_date is naive PH-local wall-clock time (see app/core/attendance.py),
        # unlike time_in/time_out which are naive-but-UTC - do not run it through
        # as_utc() or it gets mislabeled and shifts by 8 hours downstream.
        event_date=event.event_date,
        total_registered=total_registered,
        total_present=sum(1 for r in rows if r.status == "PRESENT"),
        total_incomplete=sum(1 for r in rows if r.status == "INCOMPLETE"),
        total_no_show=sum(1 for r in rows if r.status == "NO_SHOW"),
        total_absent=sum(1 for r in rows if r.status == "ABSENT"),
        total_not_registered=sum(1 for r in rows if r.status == "NOT_REGISTERED"),
        total_excused=sum(1 for r in rows if r.status == "EXCUSED"),
        total_late=sum(1 for r in rows if r.is_late),
        registrations=rows,
    )


def _get_event_or_404(db: Session, event_id: str) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.get("/{event_id}/registrations")
def get_event_registrations(event_id: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, event_id)
    return build_event_registrations(db, event)


VALID_OVERRIDE_STATUSES = {"PRESENT", "EXCUSED", "ABSENT"}


class AttendanceOverrideRequest(BaseModel):
    status: str  # PRESENT, EXCUSED, or ABSENT


@router.put("/{event_id}/registrations/{student_id}/override")
def override_attendance(
    event_id: str,
    student_id: str,
    request: AttendanceOverrideRequest,
    db: Session = Depends(get_db),
):
    """Admin manually sets a student's attendance for this event, regardless
    of scan history. Auto-registers the student first if they weren't
    already, since setting an attendance outcome implies they're accounted
    for at this event either way."""

    if request.status not in VALID_OVERRIDE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Status must be one of {sorted(VALID_OVERRIDE_STATUSES)}",
        )

    event = _get_event_or_404(db, event_id)

    student = db.query(Student).filter(Student.student_id == student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    registration = db.query(EventRegistration).filter(
        EventRegistration.event_id == event_id, EventRegistration.student_id == student.id
    ).first()
    if not registration:
        db.add(EventRegistration(event_id=event_id, student_id=student.id))

    attendance = db.query(Attendance).filter(
        Attendance.event_id == event_id, Attendance.student_id == student.id
    ).first()
    if not attendance:
        attendance = Attendance(id=str(uuid.uuid4()), event_id=event_id, student_id=student.id)
        db.add(attendance)

    if request.status == "PRESENT":
        now = datetime.now(timezone.utc)
        attendance.time_in = attendance.time_in or now
        attendance.time_out = now
        attendance.status = "PRESENT"
    else:
        attendance.time_in = None
        attendance.time_out = None
        attendance.status = request.status

    db.commit()
    return build_event_registrations(db, event)


@router.get("/{event_id}/registrations/export")
def export_event_registrations(event_id: str, db: Session = Depends(get_db)):
    """Excel (.xlsx) download of the exact same roster and statuses shown in
    the attendance DataTable - built from the same shared function above so
    the two can never drift apart."""

    event = _get_event_or_404(db, event_id)
    data = build_event_registrations(db, event)

    workbook_bytes = build_attendance_workbook(data)
    filename = safe_filename(f"PSITS_Attendance_{event.name}.xlsx")

    return StreamingResponse(
        workbook_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
