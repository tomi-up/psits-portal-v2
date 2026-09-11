"""Event, registration, and attendance models."""

from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, Index, INTEGER, TEXT, JSON, func
from sqlalchemy.orm import relationship

from app.models.base import BaseModel

# Ordered attendance phases. Progression is strictly forward along this list -
# one step at a time, no skipping and no going back (see
# app.core.checkpoints.next_phase). Scanning is only possible during the three
# open phases; the *_CLOSED phases are the deliberate pause between them while
# the programme runs and the organiser decides when the next one starts.
ATTENDANCE_PHASES = (
    "NOT_STARTED",
    "IN",
    "IN_CLOSED",
    "MIDDLE",
    "MIDDLE_CLOSED",
    "OUT",
    "CLOSED",
)


class Event(BaseModel):
    """An organization event (e.g. General Assembly) students can register and check in for."""

    __tablename__ = "events"

    name = Column(String(255), nullable=False)
    venue = Column(String(255), nullable=True)
    description = Column(TEXT, nullable=True)
    event_date = Column(DateTime, nullable=True)
    cover_image_url = Column(String(512), nullable=True)
    # DRAFT (hidden from students), ACTIVE (open for registration/check-in), ARCHIVED (ended)
    status = Column(String(20), nullable=False, default="ACTIVE")
    is_active = Column(Boolean, default=True)  # legacy, superseded by status
    attendance_required = Column(Boolean, nullable=False, default=False)
    # Year levels (e.g. [1]) excused from attendance for this event - excused
    # students are neither required to register nor counted ABSENT. Empty/null
    # means no exemptions.
    excused_year_levels = Column(JSON, nullable=True)
    # Whether attending students must submit a post-event survey. This is
    # entirely independent of Attendance.status - a student stays PRESENT
    # once scanned out regardless of survey completion (see SurveyResponse);
    # this only gates whether the "Attendance Pending" survey prompt applies.
    survey_required = Column(Boolean, nullable=False, default=False)

    # Short human-typeable code officers enter on the scanner login screen
    # instead of the 36-char UUID. Nullable so events created before this
    # column existed stay valid; scanner login also accepts the event id.
    event_code = Column(String(12), nullable=True, unique=True)

    # Which of the three attendance checkpoints is currently open, if any.
    # Advanced manually by an admin - never on a timer, because the organiser
    # decides when the MIDDLE sweep happens based on how the actual programme
    # is running. See ATTENDANCE_PHASES above.
    attendance_phase = Column(String(20), nullable=False, default="NOT_STARTED")

    # Minutes after event_date before a check-in counts as late. Per-event
    # because a general assembly and a small seminar don't deserve the same
    # grace. See app.core.attendance.is_late for the exact boundary rule.
    late_threshold_minutes = Column(INTEGER, nullable=False, default=20)

    __table_args__ = (
        Index('ix_events_event_date', 'event_date'),
        Index('ix_events_is_active', 'is_active'),
        Index('ix_events_status', 'status'),
    )

    def __repr__(self):
        return f"<Event(name={self.name}, event_date={self.event_date})>"


class EventRegistration(BaseModel):
    """A student's intent to attend an event. Unlocks their check-in QR code."""

    __tablename__ = "event_registrations"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    registered_at = Column(DateTime, default=func.now())

    event = relationship("Event")
    student = relationship("Student")

    __table_args__ = (
        Index('ix_event_registrations_event_student', 'event_id', 'student_id', unique=True),
    )

    def __repr__(self):
        return f"<EventRegistration(event_id={self.event_id}, student_id={self.student_id})>"


class Attendance(BaseModel):
    """One record per student per event, tracking scan-in and scan-out.

    Two flows write this row, and they agree on the columns:

    - Legacy two-scan events (scan-in / scan-out): status is PRESENT once both
      time_in and time_out are set, otherwise INCOMPLETE.
    - Three-checkpoint events: the authoritative record is the set of
      AttendanceCheckpointScan rows, and status is recomputed from them by
      app.core.checkpoints.evaluate_checkpoint_attendance - which can also
      yield LATE (missed the IN sweep) or FOR_REVIEW (an ambiguous
      combination that must not be auto-penalised). time_in/time_out are
      still maintained from the IN and OUT scans so every existing consumer
      (exports, dashboards, survey eligibility) keeps working unchanged.

    "Late" as a boolean is separate from the LATE status and is not stored
    here at all - it's derived by comparing time_in to the event's start plus
    its late_threshold_minutes, since lateness and completeness are
    independent facts (a student can be late AND present).
    """

    __tablename__ = "attendance"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    time_in = Column(DateTime, nullable=True)
    time_out = Column(DateTime, nullable=True)
    # INCOMPLETE, PRESENT, and - checkpoint events only - LATE, FOR_REVIEW
    status = Column(String(20), nullable=False, default="INCOMPLETE")
    recorded_in_by = Column(String(36), nullable=True)  # officer's profile id, if known
    recorded_out_by = Column(String(36), nullable=True)

    event = relationship("Event")
    student = relationship("Student")

    __table_args__ = (
        Index('ix_attendance_event_student', 'event_id', 'student_id', unique=True),
    )

    def __repr__(self):
        return f"<Attendance(event_id={self.event_id}, student_id={self.student_id}, status={self.status})>"
