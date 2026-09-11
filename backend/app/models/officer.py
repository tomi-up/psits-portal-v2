"""Officer identity, per-event assignments, scanner sessions, and the
checkpoint scan audit trail for the 3-checkpoint attendance workflow.

An Officer is a persistent person who operates the QR scanner. They are
deliberately NOT the same thing as an AdminAccount (app/models/admin.py):
admins log into the web panel with email + password, officers log into the
scanner with an event code + PIN, and a chapter has far more officers on the
floor during an event than it has portal admins.

Nothing here is assigned to a checkpoint. An officer is assigned to a
course/section FOR A SPECIFIC EVENT, and scans whichever checkpoint the event
itself is currently on - see Event.attendance_phase.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    INTEGER,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import BaseModel

# The three checkpoints a student is scanned at, in order.
CHECKPOINTS = ("IN", "MIDDLE", "OUT")


class Officer(BaseModel):
    """A person authorised to operate the scanner, identified by a PIN.

    The PIN is stored ONLY as a bcrypt hash (same passlib context the admin
    password flow uses, see app/core/security.py) and is never returned by any
    endpoint, logged, or held in frontend state past the login request.
    """

    __tablename__ = "officers"

    name = Column(String(255), nullable=False)
    pin_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    assignments = relationship(
        "EventOfficerAssignment", back_populates="officer", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_officers_is_active", "is_active"),)

    def __repr__(self):
        return f"<Officer(name={self.name}, is_active={self.is_active})>"


class EventOfficerAssignment(BaseModel):
    """Which course, year level, and section an officer is responsible for AT
    ONE EVENT - e.g. "1st Year BSCS A".

    Deliberately a separate table rather than officers.course/year/section:
    the same officer is routinely assigned 1st Year BSCS A for the General
    Assembly and 2nd Year BSIT B for the next event, so the assignment belongs
    to the (officer, event) pair and not to the officer.

    course, year_level, and section are three independent fields rather than
    course + a combined "1A" string - year_level in particular needs to be a
    real integer so it can be compared against Student.year_level directly
    instead of parsed back out of text.

    Several officers may share the same event+course+year+section - a large
    section needs more than one scanner - so the uniqueness constraint covers
    the whole tuple, not (event_id, course, year_level, section).
    """

    __tablename__ = "event_officer_assignments"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    officer_id = Column(String(36), ForeignKey("officers.id", ondelete="CASCADE"), nullable=False)
    course = Column(String(20), nullable=False)      # program code, e.g. "BSCS"
    year_level = Column(INTEGER, nullable=False)     # 1-4
    section = Column(String(10), nullable=False)     # just the letter, e.g. "A"

    event = relationship("Event")
    officer = relationship("Officer", back_populates="assignments")

    __table_args__ = (
        UniqueConstraint(
            "event_id", "officer_id", "course", "year_level", "section",
            name="uq_event_officer_assignment",
        ),
        Index("ix_event_officer_assignments_event", "event_id"),
    )

    def __repr__(self):
        return (
            f"<EventOfficerAssignment(event={self.event_id}, officer={self.officer_id}, "
            f"{self.course} Year {self.year_level} {self.section})>"
        )


class ScannerSession(BaseModel):
    """One scanner login: this officer, on this event, under this assignment.

    Created by POST /scanner/session after the event code + PIN check. The
    session row exists so every scan can be traced back to a specific login
    (and so a session can be revoked); the bearer token handed to the scanner
    is a normal JWT whose subject is this row's id. The PIN is never stored
    here in any form.
    """

    __tablename__ = "scanner_sessions"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    officer_id = Column(String(36), ForeignKey("officers.id", ondelete="CASCADE"), nullable=False)
    assignment_id = Column(
        String(36), ForeignKey("event_officer_assignments.id", ondelete="CASCADE"), nullable=False
    )
    expires_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    event = relationship("Event")
    officer = relationship("Officer")
    assignment = relationship("EventOfficerAssignment")

    __table_args__ = (Index("ix_scanner_sessions_event_officer", "event_id", "officer_id"),)

    def __repr__(self):
        return f"<ScannerSession(event={self.event_id}, officer={self.officer_id})>"


class AttendanceCheckpointScan(BaseModel):
    """One student, scanned once at one checkpoint of one event.

    The unique (event_id, student_id, checkpoint) constraint is what makes
    duplicate scans impossible server-side - the scanner UI's own dedup is a
    convenience, not the guarantee.

    The officer's and student's course/section are copied in as plain columns
    rather than resolved through joins at read time: an audit trail has to
    record what was true at the moment of the scan, and a student who
    transfers sections next semester must not retroactively rewrite whether a
    past scan was cross-section.
    """

    __tablename__ = "attendance_checkpoint_scans"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    checkpoint = Column(String(10), nullable=False)  # IN, MIDDLE, OUT

    officer_id = Column(String(36), ForeignKey("officers.id", ondelete="SET NULL"), nullable=True)
    assignment_id = Column(
        String(36), ForeignKey("event_officer_assignments.id", ondelete="SET NULL"), nullable=True
    )
    scanner_session_id = Column(
        String(36), ForeignKey("scanner_sessions.id", ondelete="SET NULL"), nullable=True
    )

    officer_course = Column(String(20), nullable=True)
    officer_year_level = Column(INTEGER, nullable=True)
    officer_section = Column(String(10), nullable=True)
    student_course = Column(String(20), nullable=True)
    student_year_level = Column(INTEGER, nullable=True)
    student_section = Column(String(10), nullable=True)
    # True when the student's course/section didn't match the scanning
    # officer's assignment. The scan is still recorded (this is deliberately
    # not a rejection) - the flag is what admins filter the audit view on.
    cross_section = Column(Boolean, nullable=False, default=False)

    scanned_at = Column(DateTime, nullable=False, default=func.now())

    event = relationship("Event")
    student = relationship("Student")
    officer = relationship("Officer")
    assignment = relationship("EventOfficerAssignment")

    __table_args__ = (
        UniqueConstraint(
            "event_id", "student_id", "checkpoint", name="uq_checkpoint_scan_event_student_checkpoint"
        ),
        Index("ix_checkpoint_scans_event", "event_id"),
        Index("ix_checkpoint_scans_event_student", "event_id", "student_id"),
    )

    def __repr__(self):
        return f"<AttendanceCheckpointScan(event={self.event_id}, student={self.student_id}, checkpoint={self.checkpoint})>"


class EventAttendancePhaseLog(BaseModel):
    """Audit trail for the attendance phase itself - who opened MIDDLE, and when.

    Separate from AuditLog because that table's user_id points at profiles.id
    (the Supabase-backed identity) while attendance phases are changed by an
    AdminAccount, and because "the attendance process" is exactly the thing an
    organiser gets asked to account for after a contested event.
    """

    __tablename__ = "event_attendance_phase_logs"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    previous_phase = Column(String(20), nullable=False)
    new_phase = Column(String(20), nullable=False)
    changed_by = Column(String(36), nullable=True)      # admin_accounts.id
    changed_by_name = Column(String(255), nullable=True)  # denormalised for the audit view
    changed_at = Column(DateTime, nullable=False, default=func.now())

    event = relationship("Event")

    __table_args__ = (Index("ix_phase_logs_event", "event_id"),)

    def __repr__(self):
        return f"<EventAttendancePhaseLog({self.previous_phase} -> {self.new_phase})>"
