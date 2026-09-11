"""Student-submitted explanations for an ambiguous (FOR_REVIEW) checkpoint
attendance record, reviewed by an admin."""

from sqlalchemy import Column, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class AttendanceReviewRequest(BaseModel):
    """A student's explanation for why their checkpoint scans came out
    FOR_REVIEW (e.g. missed the MIDDLE sweep), pending admin review. Approving
    one marks the student's attendance PRESENT for that event - the same
    override path an admin would use manually, just triggered by the
    student's own explanation instead.

    No unique constraint on (event_id, student_id): a REJECTED request can be
    followed by a new one with a better explanation, same as ExcuseRequest.
    """

    __tablename__ = "attendance_review_requests"

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
        return f"<AttendanceReviewRequest(event_id={self.event_id}, student_id={self.student_id}, status={self.status})>"
