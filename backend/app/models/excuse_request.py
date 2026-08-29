"""Student-submitted excuse requests for required events, reviewed by an admin."""

from sqlalchemy import Column, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class ExcuseRequest(BaseModel):
    """A student's request to be excused from a required event, pending
    admin review. Approving one marks the student's attendance EXCUSED for
    that event (via the same override path an admin would use manually)."""

    __tablename__ = "excuse_requests"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, APPROVED, REJECTED
    reviewed_by = Column(String(36), nullable=True)  # admin_accounts.id, no FK - kept even if admin is later removed
    reviewed_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    event = relationship("Event")
    student = relationship("Student")

    def __repr__(self):
        return f"<ExcuseRequest(event_id={self.event_id}, student_id={self.student_id}, status={self.status})>"
