"""Membership fee balances and student-submitted payment proofs."""

from sqlalchemy import Column, String, Text, ForeignKey, DateTime, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class MembershipFee(BaseModel):
    """A single semester's membership due for one student. Fixed at 200
    pesos per semester for now - amount_due is still stored per-row (rather
    than assumed) so a future fee change doesn't rewrite history."""

    __tablename__ = "membership_fees"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    school_year_id = Column(String(36), ForeignKey("school_years.id", ondelete="CASCADE"), nullable=False)
    semester = Column(String(10), nullable=False)  # "1ST" or "2ND"
    amount_due = Column(Numeric(10, 2), nullable=False, default=200)
    amount_paid = Column(Numeric(10, 2), nullable=False, default=0)

    student = relationship("Student")
    school_year = relationship("SchoolYear")
    payments = relationship("Payment", back_populates="membership_fee", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("student_id", "school_year_id", "semester", name="uq_membership_fee_term"),
    )

    def __repr__(self):
        return f"<MembershipFee(student_id={self.student_id}, semester={self.semester})>"


class Payment(BaseModel):
    """A student's claim of having paid a specific semester's due, pending
    admin review. Approving one adds the amount to that fee's amount_paid."""

    __tablename__ = "payments"

    membership_fee_id = Column(String(36), ForeignKey("membership_fees.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    reference_number = Column(String(100), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, APPROVED, REJECTED
    rejection_reason = Column(Text, nullable=True)
    reviewed_by = Column(String(36), nullable=True)  # admin_accounts.id, no FK - kept even if admin is later removed
    reviewed_at = Column(DateTime, nullable=True)

    membership_fee = relationship("MembershipFee", back_populates="payments")
    student = relationship("Student")

    def __repr__(self):
        return f"<Payment(membership_fee_id={self.membership_fee_id}, status={self.status})>"


class OrgSettings(BaseModel):
    """Singleton row of org-wide settings. Always query/update the first
    (and only) row - there's no lookup key because there's only ever one."""

    __tablename__ = "org_settings"

    payment_qr_image_url = Column(Text, nullable=True)
