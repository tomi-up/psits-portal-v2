"""Officer/admin event management - MVP for creating and editing events.

Gated behind admin login (see app/core/deps.py::get_current_admin) - every
route on this router requires a valid `Authorization: Bearer <token>` from
POST /api/v1/admin/auth/login.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
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
    event_status: str  # DRAFT, ACTIVE, or ARCHIVED - ARCHIVED means attendance is finalized
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
    status, plus - for an attendance-required event - every eligible student
    who never registered at all. Shared by the DataTable endpoint and the
    Excel export so both always show identical rows and totals.

    Once the event is ARCHIVED, attendance is considered finalized: a
    registered student with no time_in ("NO_SHOW" while still active) and a
    never-registered, non-excused student ("NOT_REGISTERED" while active)
    both collapse into "ABSENT" - there's no more opportunity for either to
    still show up. registration_status is untouched by this - a student who
    never registered stays registration_status="NOT_REGISTERED" even once
    their attendance status reads "ABSENT". Excused students (registration_
    status="NOT_REQUIRED") are never counted as absent, active or archived.

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

        if not attendance or not attendance.time_in:
            row_status = "ABSENT" if event.status == "ARCHIVED" else "NO_SHOW"
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

    if event.attendance_required:
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
            if is_excused:
                not_registered_status = "EXCUSED"
            elif event.status == "ARCHIVED":
                not_registered_status = "ABSENT"
            else:
                not_registered_status = "NOT_REGISTERED"
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
                    status=not_registered_status,
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
        event_status=event.status,
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
