"""Sanctions for unexcused absences at required events. A Sanction is one
unit of "missed a required event with no approved excuse" - created lazily
the first time anyone looks (see app/core/sanctions.py), one per (student,
event). A SanctionSettlement is the student's chosen way to clear some
number of currently-unclaimed sanctions at once: either logged community
service hours (2 hrs/absence, admin logs progress) or a donation-in-kind
(admin confirms receipt)."""

from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Integer, Float, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Sanction(BaseModel):
    __tablename__ = "sanctions"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(String(36), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, SETTLED
    settlement_id = Column(String(36), ForeignKey("sanction_settlements.id", ondelete="SET NULL"), nullable=True)

    student = relationship("Student")
    event = relationship("Event")
    settlement = relationship("SanctionSettlement", back_populates="sanctions")

    __table_args__ = (
        UniqueConstraint("student_id", "event_id", name="uq_sanction_student_event"),
    )

    def __repr__(self):
        return f"<Sanction(student_id={self.student_id}, event_id={self.event_id}, status={self.status})>"


class SanctionSettlement(BaseModel):
    __tablename__ = "sanction_settlements"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    resolution_type = Column(String(20), nullable=False)  # COMMUNITY_SERVICE, DONATION
    sanctions_count = Column(Integer, nullable=False)  # how many absences this settlement covers

    donation_item = Column(String(50), nullable=True)  # key into DONATION_OPTIONS, DONATION type only
    donation_quantity = Column(Integer, nullable=True)

    community_service_hours_required = Column(Float, nullable=True)
    community_service_hours_logged = Column(Float, nullable=False, default=0)

    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, APPROVED, REJECTED, COMPLETED
    rejection_reason = Column(Text, nullable=True)
    reviewed_by = Column(String(36), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    student = relationship("Student")
    sanctions = relationship("Sanction", back_populates="settlement")

    def __repr__(self):
        return f"<SanctionSettlement(student_id={self.student_id}, type={self.resolution_type}, status={self.status})>"
