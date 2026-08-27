"""Event, registration, and attendance models."""

from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, Index, TEXT, JSON, func
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


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

    status is PRESENT once both time_in and time_out are set, otherwise
    INCOMPLETE (scanned in but never scanned out). "Late" is not stored here -
    it's derived by comparing time_in to the event's start time plus a grace
    period, since lateness and completeness are independent facts.
    """

    __tablename__ = "attendance"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    time_in = Column(DateTime, nullable=True)
    time_out = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="INCOMPLETE")  # INCOMPLETE, PRESENT
    recorded_in_by = Column(String(36), nullable=True)  # officer's profile id, if known
    recorded_out_by = Column(String(36), nullable=True)

    event = relationship("Event")
    student = relationship("Student")

    __table_args__ = (
        Index('ix_attendance_event_student', 'event_id', 'student_id', unique=True),
    )

    def __repr__(self):
        return f"<Attendance(event_id={self.event_id}, student_id={self.student_id}, status={self.status})>"
