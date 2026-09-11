"""Post-event survey responses - entirely separate from Attendance. Submitting
one never changes Attendance.status; it's tracked here so "did this student
complete the required survey" stays independent of "were they present"."""

from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class SurveyResponse(BaseModel):
    __tablename__ = "survey_responses"

    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    # {"1.1": 4, "1.2": 3, ..., "comments": "..."} - keyed by the fixed
    # question ids in app/core/survey_questions.py.
    answers = Column(JSON, nullable=False)
    submitted_at = Column(DateTime, nullable=False, default=func.now())

    event = relationship("Event")
    student = relationship("Student")

    __table_args__ = (
        UniqueConstraint("event_id", "student_id", name="uq_survey_response_event_student"),
    )

    def __repr__(self):
        return f"<SurveyResponse(event_id={self.event_id}, student_id={self.student_id})>"
