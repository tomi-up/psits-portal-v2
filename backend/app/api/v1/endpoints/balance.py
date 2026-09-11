"""Student-facing membership balance and payment submission."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_student
from app.models.student import Student
from app.models.balance import MembershipFee, Payment, OrgSettings

router = APIRouter(prefix="/balance", tags=["balance"])


def _fee_status(amount_due: float, amount_paid: float) -> str:
    if amount_paid >= amount_due:
        return "PAID"
    if amount_paid > 0:
        return "PARTIAL"
    return "UNPAID"


class PaymentRow(BaseModel):
    id: str
    reference_number: str
    amount: float
    status: str
    rejection_reason: str | None
    created_at: datetime


class FeeRow(BaseModel):
    id: str
    school_year: str
    semester: str
    amount_due: float
    amount_paid: float
    balance: float
    status: str
    payments: list[PaymentRow]


class BalanceResponse(BaseModel):
    total_balance: float
    fees: list[FeeRow]


class PaymentSubmit(BaseModel):
    reference_number: str
    amount: float


@router.get("/", response_model=BalanceResponse)
def get_my_balance(student: Student = Depends(get_current_student), db: Session = Depends(get_db)):
    fees = (
        db.query(MembershipFee)
        .options(joinedload(MembershipFee.school_year), joinedload(MembershipFee.payments))
        .filter(MembershipFee.student_id == student.id)
        .join(MembershipFee.school_year)
        .order_by(MembershipFee.school_year_id, MembershipFee.semester)
        .all()
    )

    rows = []
    total_balance = 0.0
    for fee in fees:
        due = float(fee.amount_due)
        paid = float(fee.amount_paid)
        balance = due - paid
        total_balance += balance
        rows.append(
            FeeRow(
                id=fee.id,
                school_year=fee.school_year.label,
                semester=fee.semester,
                amount_due=due,
                amount_paid=paid,
                balance=balance,
                status=_fee_status(due, paid),
                payments=[
                    PaymentRow(
                        id=p.id,
                        reference_number=p.reference_number,
                        amount=float(p.amount),
                        status=p.status,
                        rejection_reason=p.rejection_reason,
                        created_at=p.created_at,
                    )
                    for p in sorted(fee.payments, key=lambda p: p.created_at, reverse=True)
                ],
            )
        )

    return BalanceResponse(total_balance=total_balance, fees=rows)


@router.get("/qr")
def get_payment_qr(student: Student = Depends(get_current_student), db: Session = Depends(get_db)):
    settings_row = db.query(OrgSettings).first()
    return {"qr_image_url": settings_row.payment_qr_image_url if settings_row else None}


@router.post("/{fee_id}/pay")
def submit_payment(
    fee_id: str,
    body: PaymentSubmit,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    reference_number = body.reference_number.strip()
    if not reference_number:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A reference number is required")
    if body.amount <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Amount must be greater than 0")

    fee = db.query(MembershipFee).filter(
        MembershipFee.id == fee_id, MembershipFee.student_id == student.id
    ).first()
    if not fee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee not found")

    if _fee_status(float(fee.amount_due), float(fee.amount_paid)) == "PAID":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This semester is already fully paid")

    existing_pending = db.query(Payment).filter(
        Payment.membership_fee_id == fee_id, Payment.status == "PENDING"
    ).first()
    if existing_pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a payment pending review for this semester",
        )

    db.add(Payment(
        membership_fee_id=fee_id, student_id=student.id,
        reference_number=reference_number, amount=body.amount, status="PENDING",
    ))
    db.commit()

    return {"status": "PENDING"}
