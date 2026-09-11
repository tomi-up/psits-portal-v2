"""Officer/admin event management - MVP for creating and editing events.

Gated behind admin login (see app/core/deps.py::get_current_admin) - every
route on this router requires a valid `Authorization: Bearer <token>` from
POST /api/v1/admin/auth/login.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timezone
import uuid
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.attendance import as_utc, is_late as _is_late, finalize_status
from app.core.checkpoints import (
    PHASE_ACTION_LABELS,
    PHASE_LABELS,
    next_phase as _next_phase,
    uses_checkpoints,
)
from app.core.deps import get_current_admin
from app.models.admin import AdminAccount
from app.models.event import Event, EventRegistration, Attendance
from app.models.officer import EventAttendancePhaseLog
from app.models.student import Student, StudentSchoolYear
from app.models.survey import SurveyResponse
from app.services.attendance_export import build_attendance_workbook, safe_filename
from app.services.checkpoint_attendance import checkpoints_by_student
from app.services.survey_export import build_survey_results_workbook

router = APIRouter(prefix="/officer/events", tags=["admin-events"], dependencies=[Depends(get_current_admin)])


VALID_STATUSES = {"DRAFT", "ACTIVE", "ARCHIVED"}
VALID_YEAR_LEVELS = {1, 2, 3, 4}

# Ambiguous glyphs left out - this gets read off a screen and typed into a
# phone in a crowded venue, so 0/O and 1/I/L are more trouble than the extra
# entropy is worth.
_EVENT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
EVENT_CODE_LENGTH = 6

MIN_LATE_THRESHOLD_MINUTES = 0
MAX_LATE_THRESHOLD_MINUTES = 12 * 60


def _generate_event_code(db: Session) -> str:
    """A short unique code officers type on the scanner login screen."""
    for _ in range(20):
        code = "".join(secrets.choice(_EVENT_CODE_ALPHABET) for _ in range(EVENT_CODE_LENGTH))
        if not db.query(Event).filter(Event.event_code == code).first():
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a unique event code, please try again",
    )


def _validate_late_threshold(value: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Late threshold must be a whole number of minutes",
        )
    if not (MIN_LATE_THRESHOLD_MINUTES <= value <= MAX_LATE_THRESHOLD_MINUTES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Late threshold must be between {MIN_LATE_THRESHOLD_MINUTES} and "
                f"{MAX_LATE_THRESHOLD_MINUTES} minutes"
            ),
        )
    return value


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
    survey_required: bool = False
    late_threshold_minutes: int = 20


class EventUpdateRequest(BaseModel):
    name: str
    venue: str = Field(min_length=1)
    description: str
    event_date: datetime
    status: str
    cover_image_url: str | None = None
    attendance_required: bool = False
    excused_year_levels: list[int] | None = None
    survey_required: bool = False
    late_threshold_minutes: int = 20


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
    survey_required: bool
    late_threshold_minutes: int
    event_code: str | None
    attendance_phase: str
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
        survey_required=request.survey_required,
        late_threshold_minutes=_validate_late_threshold(request.late_threshold_minutes),
        event_code=_generate_event_code(db),
        attendance_phase="NOT_STARTED",
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
    event.survey_required = request.survey_required
    event.late_threshold_minutes = _validate_late_threshold(request.late_threshold_minutes)
    event.is_active = request.status == "ACTIVE"

    # Backfill for events created before event codes existed, so an organiser
    # can turn on checkpoint scanning for an old event without a migration.
    if not event.event_code:
        event.event_code = _generate_event_code(db)

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
    # NO_SHOW, INCOMPLETE, PRESENT, ABSENT, NOT_REGISTERED, EXCUSED, and -
    # on 3-checkpoint events only - LATE and FOR_REVIEW.
    status: str
    is_late: bool
    survey_status: str | None  # PENDING, SUBMITTED, or None if no survey applies
    # Which checkpoints this student was actually scanned at. Empty on a
    # legacy two-scan event, which is exactly how the UI knows not to show
    # the checkpoint columns at all.
    checkpoints: list[str]


class PhaseLogEntry(BaseModel):
    previous_phase: str
    new_phase: str
    changed_by_name: str | None
    changed_at: datetime


class EventRegistrationsResponse(BaseModel):
    event_id: str
    event_name: str
    event_date: datetime | None
    event_status: str  # DRAFT, ACTIVE, or ARCHIVED - ARCHIVED means attendance is finalized
    survey_required: bool
    event_code: str | None
    attendance_phase: str
    attendance_phase_label: str
    next_phase: str | None
    next_phase_label: str | None
    uses_checkpoints: bool
    late_threshold_minutes: int
    total_registered: int
    total_present: int
    total_incomplete: int
    total_no_show: int
    total_absent: int
    total_not_registered: int
    total_excused: int
    total_late: int
    total_late_status: int   # status == LATE (missed the IN checkpoint)
    total_for_review: int    # status == FOR_REVIEW (ambiguous scan pattern)
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


def _ordered_checkpoints(scanned: set[str] | None) -> list[str]:
    """Always IN, MIDDLE, OUT order - a set's iteration order is not a thing
    the UI or the Excel export should be at the mercy of."""
    if not scanned:
        return []
    return [c for c in ("IN", "MIDDLE", "OUT") if c in scanned]


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
    checkpoints = checkpoints_by_student(db, event.id)

    survey_submitted_ids = set()
    if event.survey_required:
        survey_submitted_ids = {
            r.student_id for r in db.query(SurveyResponse).filter(SurveyResponse.event_id == event.id).all()
        }

    def _survey_status(student_id: str, checked_out: bool) -> str | None:
        if not event.survey_required:
            return None
        if student_id in survey_submitted_ids:
            return "SUBMITTED"
        return "PENDING" if checked_out else None

    rows = []
    for reg in registrations:
        student = reg.student
        school_year = school_years_by_student.get(student.id)
        attendance = attendance_by_student.get(student.id)

        if attendance and attendance.status in ("EXCUSED", "ABSENT"):
            # Explicitly set by an admin, regardless of scan history - distinct
            # from the NO_SHOW/ABSENT default below (never scanned in) and from
            # the year-level blanket excuse further down (never registered at all).
            row_status = attendance.status
        elif not attendance or not attendance.time_in:
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
                is_late=_is_late(
                    attendance.time_in if attendance else None,
                    event.event_date,
                    event.late_threshold_minutes,
                ),
                survey_status=_survey_status(student.id, bool(attendance and attendance.time_out)),
                checkpoints=_ordered_checkpoints(checkpoints.get(student.id)),
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
                    survey_status=None,
                    checkpoints=[],
                )
            )

    upcoming = _next_phase(event.attendance_phase)

    return EventRegistrationsResponse(
        event_id=event.id,
        event_name=event.name,
        # event_date is naive PH-local wall-clock time (see app/core/attendance.py),
        # unlike time_in/time_out which are naive-but-UTC - do not run it through
        # as_utc() or it gets mislabeled and shifts by 8 hours downstream.
        event_date=event.event_date,
        event_status=event.status,
        survey_required=event.survey_required,
        event_code=event.event_code,
        attendance_phase=event.attendance_phase,
        attendance_phase_label=PHASE_LABELS.get(event.attendance_phase, event.attendance_phase),
        next_phase=upcoming,
        next_phase_label=PHASE_ACTION_LABELS.get(event.attendance_phase),
        uses_checkpoints=uses_checkpoints(event.attendance_phase),
        late_threshold_minutes=event.late_threshold_minutes,
        total_registered=total_registered,
        total_present=sum(1 for r in rows if r.status == "PRESENT"),
        total_incomplete=sum(1 for r in rows if r.status == "INCOMPLETE"),
        total_no_show=sum(1 for r in rows if r.status == "NO_SHOW"),
        total_absent=sum(1 for r in rows if r.status == "ABSENT"),
        total_not_registered=sum(1 for r in rows if r.status == "NOT_REGISTERED"),
        total_excused=sum(1 for r in rows if r.status == "EXCUSED"),
        total_late=sum(1 for r in rows if r.is_late),
        total_late_status=sum(1 for r in rows if r.status == "LATE"),
        total_for_review=sum(1 for r in rows if r.status == "FOR_REVIEW"),
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


# ============================================================================
# ATTENDANCE PHASE CONTROL
# ============================================================================

class AttendancePhaseResponse(BaseModel):
    event_id: str
    attendance_phase: str
    attendance_phase_label: str
    current_checkpoint: str | None
    next_phase: str | None
    next_phase_label: str | None
    history: list[PhaseLogEntry]


class AttendancePhaseAdvanceRequest(BaseModel):
    """The phase being moved to, echoed back by the client.

    Required rather than a bare "advance" so that two admins hammering the
    button at the same moment can't double-advance the event past a checkpoint
    nobody actually ran - the second request names a phase that is no longer
    next, and is refused.
    """
    next_phase: str


def _phase_response(db: Session, event: Event) -> AttendancePhaseResponse:
    from app.core.checkpoints import active_checkpoint

    history = (
        db.query(EventAttendancePhaseLog)
        .filter(EventAttendancePhaseLog.event_id == event.id)
        .order_by(EventAttendancePhaseLog.changed_at.desc())
        .all()
    )

    return AttendancePhaseResponse(
        event_id=event.id,
        attendance_phase=event.attendance_phase,
        attendance_phase_label=PHASE_LABELS.get(event.attendance_phase, event.attendance_phase),
        current_checkpoint=active_checkpoint(event.attendance_phase),
        next_phase=_next_phase(event.attendance_phase),
        next_phase_label=PHASE_ACTION_LABELS.get(event.attendance_phase),
        history=[
            PhaseLogEntry(
                previous_phase=h.previous_phase,
                new_phase=h.new_phase,
                changed_by_name=h.changed_by_name,
                changed_at=as_utc(h.changed_at),
            )
            for h in history
        ],
    )


@router.get("/{event_id}/attendance-phase", response_model=AttendancePhaseResponse)
def get_attendance_phase(event_id: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, event_id)
    return _phase_response(db, event)


@router.post("/{event_id}/attendance-phase", response_model=AttendancePhaseResponse)
async def advance_attendance_phase(
    event_id: str,
    body: AttendancePhaseAdvanceRequest,
    db: Session = Depends(get_db),
    admin: AdminAccount = Depends(get_current_admin),
):
    """Move the event one step along IN -> MIDDLE -> OUT -> CLOSED.

    Manual on purpose, and manual at every step. The organiser opens MIDDLE
    when the programme actually reaches a point where sweeping the room makes
    sense - which is not a time anybody can put in a form three weeks earlier,
    because the guest speaker will still be talking.

    Forward-only: there is no way through this endpoint to reopen a closed
    checkpoint. Reopening IN after seeing who missed it is precisely the fraud
    the three-checkpoint design exists to prevent.
    """
    event = _get_event_or_404(db, event_id)

    allowed = _next_phase(event.attendance_phase)
    if allowed is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance is already {PHASE_LABELS.get(event.attendance_phase, event.attendance_phase)} and cannot be advanced further",
        )

    requested = body.next_phase.strip().upper()
    if requested != allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot move from {event.attendance_phase} to {requested}. "
                f"The only allowed next phase is {allowed}."
            ),
        )

    previous = event.attendance_phase
    event.attendance_phase = allowed

    db.add(
        EventAttendancePhaseLog(
            event_id=event.id,
            previous_phase=previous,
            new_phase=allowed,
            changed_by=admin.id,
            changed_by_name=admin.display_name,
        )
    )
    db.commit()
    db.refresh(event)

    # Push to anyone watching this event - the admin registrations table, and
    # any scanner holding an open socket. Scanners also poll GET
    # /scanner/session, so a dropped socket degrades to a short delay rather
    # than an officer scanning into a closed checkpoint.
    from app.api.v1.endpoints.events_mvp import attendance_ws_manager

    await attendance_ws_manager.broadcast(
        event.id, {"type": "phase_changed", "attendance_phase": allowed}
    )

    return _phase_response(db, event)


class SurveyQuestionResult(BaseModel):
    id: str
    text: str
    average: float | None
    responses: int


class SurveySectionResult(BaseModel):
    title: str
    questions: list[SurveyQuestionResult]


class SurveyCommentEntry(BaseModel):
    student_id: str
    student_name: str
    comment: str
    submitted_at: datetime


class SurveyResultsResponse(BaseModel):
    event_id: str
    event_name: str
    survey_required: bool
    total_responses: int
    total_eligible: int  # checked-out attendees who could be asked to respond
    sections: list[SurveySectionResult]
    comments: list[SurveyCommentEntry]


def build_survey_results(db: Session, event: Event) -> SurveyResultsResponse:
    """Shared by the results endpoint and its Excel export, so the two can
    never drift apart - same pattern as build_event_registrations above."""
    from app.core.survey_questions import SURVEY_SECTIONS

    responses = (
        db.query(SurveyResponse)
        .options(joinedload(SurveyResponse.student))
        .filter(SurveyResponse.event_id == event.id)
        .order_by(SurveyResponse.submitted_at.desc())
        .all()
    )

    total_eligible = db.query(Attendance).filter(
        Attendance.event_id == event.id, Attendance.time_out.isnot(None)
    ).count()

    sections = []
    for section in SURVEY_SECTIONS:
        questions = []
        for q in section["questions"]:
            values = [r.answers.get(q["id"]) for r in responses if isinstance(r.answers.get(q["id"]), (int, float))]
            questions.append(SurveyQuestionResult(
                id=q["id"], text=q["text"],
                average=round(sum(values) / len(values), 2) if values else None,
                responses=len(values),
            ))
        sections.append(SurveySectionResult(title=section["title"], questions=questions))

    comments = [
        SurveyCommentEntry(
            student_id=r.student.student_id if r.student else "(deleted student)",
            student_name=f"{r.student.first_name} {r.student.last_name}" if r.student else "(deleted student)",
            comment=r.answers["comments"].strip(),
            submitted_at=r.submitted_at,
        )
        for r in responses
        if isinstance(r.answers.get("comments"), str) and r.answers["comments"].strip()
    ]

    return SurveyResultsResponse(
        event_id=event.id,
        event_name=event.name,
        survey_required=event.survey_required,
        total_responses=len(responses),
        total_eligible=total_eligible,
        sections=sections,
        comments=comments,
    )


@router.get("/{event_id}/survey-results")
def get_survey_results(event_id: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, event_id)
    return build_survey_results(db, event)


@router.get("/{event_id}/survey-results/export")
def export_survey_results(event_id: str, db: Session = Depends(get_db)):
    event = _get_event_or_404(db, event_id)
    results = build_survey_results(db, event)

    workbook_bytes = build_survey_results_workbook(results)
    filename = safe_filename(f"PSITS_Survey_{event.name}.xlsx")

    return StreamingResponse(
        workbook_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
