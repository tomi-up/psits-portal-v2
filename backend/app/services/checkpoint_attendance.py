"""Recording a checkpoint scan, and keeping the Attendance row derived from it.

The AttendanceCheckpointScan rows are the source of truth for a checkpoint
event. The Attendance row is a projection of them, rebuilt after every scan so
that everything already reading Attendance - the registrations table, the
Excel export, the student dashboard, survey eligibility, the scanner's live
counters - keeps working without learning about checkpoints at all.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.checkpoints import checkpoint_times, evaluate_checkpoint_attendance
from app.models.event import Attendance
from app.models.officer import AttendanceCheckpointScan
from app.models.student import StudentSchoolYear


def student_course_year_section(
    db: Session, student_id: str
) -> tuple[str | None, int | None, str | None]:
    """The student's current (course code, year level, section), as three
    independent values - matching how EventOfficerAssignment stores an
    officer's coverage, so the comparison in is_cross_section is apples-to-
    apples without parsing anything back out of a combined string.
    """
    school_year = (
        db.query(StudentSchoolYear)
        .options(joinedload(StudentSchoolYear.program))
        .filter(StudentSchoolYear.student_id == student_id)
        .order_by(StudentSchoolYear.enrolled_at.desc())
        .first()
    )
    if not school_year:
        return None, None, None

    course = school_year.program.code if school_year.program else None
    return course, school_year.year_level, school_year.section


def normalize_section(value: str | None) -> str:
    """Sections get typed in as "A", "a", " A " - compare them the same."""
    if not value:
        return ""
    return value.replace("-", "").replace(" ", "").upper()


def is_cross_section(
    officer_course: str | None,
    officer_year_level: int | None,
    officer_section: str | None,
    student_course: str | None,
    student_year_level: int | None,
    student_section: str | None,
) -> bool:
    """Whether this student falls outside the officer's assignment.

    A student with no enrollment record on file is NOT treated as
    cross-section: we don't know that they mismatch, and warning an officer
    about a data gap they can't fix just trains them to dismiss the warning.
    """
    if not student_course or student_year_level is None or not student_section:
        return False
    return (
        (student_course or "").upper() != (officer_course or "").upper()
        or student_year_level != officer_year_level
        or normalize_section(student_section) != normalize_section(officer_section)
    )


def recompute_attendance_from_checkpoints(db: Session, event_id: str, student_id: str) -> Attendance:
    """Rebuild the Attendance row for one student from their checkpoint scans.

    Idempotent - safe to call after every scan, and safe to call twice. Does
    not commit; the caller owns the transaction.
    """
    scans = (
        db.query(AttendanceCheckpointScan)
        .filter(
            AttendanceCheckpointScan.event_id == event_id,
            AttendanceCheckpointScan.student_id == student_id,
        )
        .all()
    )

    record = (
        db.query(Attendance)
        .filter(Attendance.event_id == event_id, Attendance.student_id == student_id)
        .first()
    )
    if not record:
        record = Attendance(event_id=event_id, student_id=student_id)
        db.add(record)

    status = evaluate_checkpoint_attendance({s.checkpoint for s in scans})
    time_in, time_out = checkpoint_times(scans)

    record.time_in = time_in
    record.time_out = time_out
    # None only happens with zero scans, which can't be reached from the scan
    # path - but a defensive fallback beats writing NULL into a NOT NULL column.
    record.status = status or "INCOMPLETE"

    # recorded_in_by / recorded_out_by predate checkpoints and hold whoever
    # performed each half. Keep them meaningful by pointing them at the
    # officer who did the corresponding checkpoint scan.
    by_checkpoint = {s.checkpoint: s for s in scans}
    if "IN" in by_checkpoint:
        record.recorded_in_by = by_checkpoint["IN"].officer_id
    if "OUT" in by_checkpoint:
        record.recorded_out_by = by_checkpoint["OUT"].officer_id

    return record


def existing_scan(
    db: Session, event_id: str, student_id: str, checkpoint: str
) -> AttendanceCheckpointScan | None:
    return (
        db.query(AttendanceCheckpointScan)
        .filter(
            AttendanceCheckpointScan.event_id == event_id,
            AttendanceCheckpointScan.student_id == student_id,
            AttendanceCheckpointScan.checkpoint == checkpoint,
        )
        .first()
    )


def record_checkpoint_scan(
    db: Session,
    *,
    event_id: str,
    student_id: str,
    checkpoint: str,
    officer_id: str | None,
    assignment_id: str | None,
    scanner_session_id: str | None,
    officer_course: str | None,
    officer_year_level: int | None,
    officer_section: str | None,
    student_course: str | None,
    student_year_level: int | None,
    student_section: str | None,
    cross_section: bool,
) -> AttendanceCheckpointScan:
    """Write the scan and refresh the derived Attendance row. Does not commit."""
    scan = AttendanceCheckpointScan(
        event_id=event_id,
        student_id=student_id,
        checkpoint=checkpoint,
        officer_id=officer_id,
        assignment_id=assignment_id,
        scanner_session_id=scanner_session_id,
        officer_course=officer_course,
        officer_year_level=officer_year_level,
        officer_section=officer_section,
        student_course=student_course,
        student_year_level=student_year_level,
        student_section=student_section,
        cross_section=cross_section,
        scanned_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(scan)
    db.flush()  # so recompute below sees this scan

    recompute_attendance_from_checkpoints(db, event_id, student_id)
    return scan


def checkpoints_by_student(db: Session, event_id: str) -> dict[str, set[str]]:
    """{student_id: {"IN", "MIDDLE", ...}} for a whole event, in one query.

    Used by the registrations table and the export so they can show per-student
    checkpoint columns without a query per row.
    """
    result: dict[str, set[str]] = {}
    for scan in (
        db.query(AttendanceCheckpointScan)
        .filter(AttendanceCheckpointScan.event_id == event_id)
        .all()
    ):
        result.setdefault(scan.student_id, set()).add(scan.checkpoint)
    return result
