"""Admin review of student-submitted membership payments, and the shared
payment QR code setting shown to every student on their Balance page."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.admin import AdminAccount
from app.models.student import Student, SchoolYear
from app.models.balance import MembershipFee, Payment, OrgSettings

VALID_SEMESTERS = {"1ST", "2ND"}
DEFAULT_FEE_AMOUNT = Decimal("100.00")

router = APIRouter(prefix="/officer", tags=["admin-payments"], dependencies=[Depends(get_current_admin)])


def _fee_status(amount_due: float, amount_paid: float) -> str:
    if amount_paid >= amount_due:
        return "PAID"
    if amount_paid > 0:
        return "PARTIAL"
    return "UNPAID"


class PaymentRow(BaseModel):
    id: str
    student_id: str
    student_name: str
    school_year: str
    semester: str
    reference_number: str
    amount: float
    status: str
    rejection_reason: str | None
    created_at: datetime
    reviewed_at: datetime | None


class RejectPaymentBody(BaseModel):
    reason: str


class QrSettingBody(BaseModel):
    qr_image_url: str


class BalanceRow(BaseModel):
    fee_id: str
    student_id: str
    student_name: str
    school_year: str
    semester: str
    amount_due: float
    amount_paid: float
    balance: float
    status: str


class RecordPaymentBody(BaseModel):
    amount: float
    note: str | None = None


class CreateBalanceBody(BaseModel):
    student_id: str  # Student.student_id (business ID), not the internal row id
    school_year_id: str
    semester: str
    amount_due: float = 100.0


class SchoolYearOption(BaseModel):
    id: str
    label: str
    is_active: bool


@router.get("/payments/")
def list_payments(status_filter: str | None = None, db: Session = Depends(get_db)):
    """List payment submissions, newest first. Pass ?status_filter=PENDING
    to narrow to what still needs review; omit it to see everything."""

    query = db.query(Payment).options(
        joinedload(Payment.student),
        joinedload(Payment.membership_fee).joinedload(MembershipFee.school_year),
    )
    if status_filter:
        query = query.filter(Payment.status == status_filter.upper())

    payments = query.order_by(Payment.created_at.desc()).all()

    return {
        "payments": [
            PaymentRow(
                id=p.id,
                student_id=p.student.student_id if p.student else "(deleted student)",
                student_name=f"{p.student.first_name} {p.student.last_name}" if p.student else "(deleted student)",
                school_year=p.membership_fee.school_year.label if p.membership_fee else "-",
                semester=p.membership_fee.semester if p.membership_fee else "-",
                reference_number=p.reference_number,
                amount=float(p.amount),
                status=p.status,
                rejection_reason=p.rejection_reason,
                created_at=p.created_at,
                reviewed_at=p.reviewed_at,
            )
            for p in payments
        ]
    }


@router.put("/payments/{payment_id}/approve")
def approve_payment(
    payment_id: str, db: Session = Depends(get_db), admin: AdminAccount = Depends(get_current_admin)
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if payment.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Payment is already {payment.status.lower()}")

    fee = db.query(MembershipFee).filter(MembershipFee.id == payment.membership_fee_id).first()
    if not fee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated fee not found")

    payment.status = "APPROVED"
    payment.reviewed_by = admin.id
    payment.reviewed_at = datetime.now(timezone.utc)
    fee.amount_paid = float(fee.amount_paid) + float(payment.amount)

    db.commit()
    return {"status": "APPROVED"}


@router.put("/payments/{payment_id}/reject")
def reject_payment(
    payment_id: str,
    body: RejectPaymentBody,
    db: Session = Depends(get_db),
    admin: AdminAccount = Depends(get_current_admin),
):
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A rejection reason is required")

    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if payment.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Payment is already {payment.status.lower()}")

    payment.status = "REJECTED"
    payment.reviewed_by = admin.id
    payment.reviewed_at = datetime.now(timezone.utc)
    payment.rejection_reason = reason
    db.commit()

    return {"status": "REJECTED"}


@router.get("/settings/payment-qr")
def get_payment_qr_setting(db: Session = Depends(get_db)):
    settings_row = db.query(OrgSettings).first()
    return {"qr_image_url": settings_row.payment_qr_image_url if settings_row else None}


@router.put("/settings/payment-qr")
def set_payment_qr_setting(body: QrSettingBody, db: Session = Depends(get_db)):
    settings_row = db.query(OrgSettings).first()
    if not settings_row:
        settings_row = OrgSettings()
        db.add(settings_row)

    settings_row.payment_qr_image_url = body.qr_image_url.strip() or None
    db.commit()

    return {"qr_image_url": settings_row.payment_qr_image_url}


@router.get("/balances/")
def list_balances(db: Session = Depends(get_db)):
    """Every student's membership fee rows, for the admin to record a
    manual payment against (e.g. cash paid in person) without the student
    having to submit anything themselves."""

    fees = (
        db.query(MembershipFee)
        .options(joinedload(MembershipFee.student), joinedload(MembershipFee.school_year))
        .join(MembershipFee.student)
        .order_by(Student.last_name, Student.first_name)
        .all()
    )

    return {
        "balances": [
            BalanceRow(
                fee_id=f.id,
                student_id=f.student.student_id,
                student_name=f"{f.student.first_name} {f.student.last_name}",
                school_year=f.school_year.label,
                semester=f.semester,
                amount_due=float(f.amount_due),
                amount_paid=float(f.amount_paid),
                balance=float(f.amount_due) - float(f.amount_paid),
                status=_fee_status(float(f.amount_due), float(f.amount_paid)),
            )
            for f in fees
        ]
    }


@router.get("/school-years")
def list_school_years(db: Session = Depends(get_db)):
    """For the term dropdown when adding a new balance."""
    years = db.query(SchoolYear).order_by(SchoolYear.start_date.desc()).all()
    return {
        "school_years": [
            SchoolYearOption(id=y.id, label=y.label, is_active=y.is_active) for y in years
        ]
    }


@router.post("/balances/")
def create_balance(
    body: CreateBalanceBody, db: Session = Depends(get_db), admin: AdminAccount = Depends(get_current_admin)
):
    """Assess a new membership due for a student - e.g. a late enrollee who
    doesn't have a fee row for this term yet, or a manually added charge."""

    semester = body.semester.strip().upper()
    if semester not in VALID_SEMESTERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Semester must be one of {sorted(VALID_SEMESTERS)}",
        )
    if body.amount_due < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Amount due cannot be negative")

    student = db.query(Student).filter(Student.student_id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    school_year = db.query(SchoolYear).filter(SchoolYear.id == body.school_year_id).first()
    if not school_year:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found")

    existing = db.query(MembershipFee).filter(
        MembershipFee.student_id == student.id,
        MembershipFee.school_year_id == school_year.id,
        MembershipFee.semester == semester,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{student.first_name} {student.last_name} already has a balance for {semester} {school_year.label}",
        )

    fee = MembershipFee(
        student_id=student.id,
        school_year_id=school_year.id,
        semester=semester,
        amount_due=Decimal(str(body.amount_due)),
        amount_paid=Decimal("0.00"),
    )
    db.add(fee)
    db.commit()

    return BalanceRow(
        fee_id=fee.id,
        student_id=student.student_id,
        student_name=f"{student.first_name} {student.last_name}",
        school_year=school_year.label,
        semester=semester,
        amount_due=float(fee.amount_due),
        amount_paid=0.0,
        balance=float(fee.amount_due),
        status=_fee_status(float(fee.amount_due), 0.0),
    )


@router.post("/balances/{fee_id}/record-payment")
def record_payment(
    fee_id: str,
    body: RecordPaymentBody,
    db: Session = Depends(get_db),
    admin: AdminAccount = Depends(get_current_admin),
):
    """Directly credit a payment to a student's balance - already approved,
    no student submission involved. For cash/in-person payments."""

    if body.amount <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Amount must be greater than 0")

    fee = db.query(MembershipFee).filter(MembershipFee.id == fee_id).first()
    if not fee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee not found")

    note = body.note.strip() if body.note and body.note.strip() else "Recorded by admin"
    db.add(Payment(
        membership_fee_id=fee.id, student_id=fee.student_id,
        reference_number=note, amount=body.amount, status="APPROVED",
        reviewed_by=admin.id, reviewed_at=datetime.now(timezone.utc),
    ))
    fee.amount_paid = float(fee.amount_paid) + body.amount
    db.commit()

    return {"balance": float(fee.amount_due) - float(fee.amount_paid)}
