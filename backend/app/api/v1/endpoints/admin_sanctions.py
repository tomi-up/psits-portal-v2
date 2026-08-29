"""Admin review of student sanction settlements: approve/reject a donation,
or log community service hours until the required total is reached."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.sanctions import DONATION_OPTIONS
from app.models.admin import AdminAccount
from app.models.sanction import Sanction, SanctionSettlement

router = APIRouter(prefix="/officer/sanctions", tags=["admin-sanctions"], dependencies=[Depends(get_current_admin)])


class SettlementRow(BaseModel):
    id: str
    student_id: str
    student_name: str
    resolution_type: str
    sanctions_count: int
    donation_item: str | None
    donation_label: str | None
    donation_quantity: int | None
    community_service_hours_required: float | None
    community_service_hours_logged: float | None
    status: str
    rejection_reason: str | None
    created_at: datetime
    reviewed_at: datetime | None


class RejectSettlementBody(BaseModel):
    reason: str


class LogHoursBody(BaseModel):
    hours: float


def _row(s: SanctionSettlement) -> SettlementRow:
    return SettlementRow(
        id=s.id,
        student_id=s.student.student_id if s.student else "(deleted student)",
        student_name=f"{s.student.first_name} {s.student.last_name}" if s.student else "(deleted student)",
        resolution_type=s.resolution_type,
        sanctions_count=s.sanctions_count,
        donation_item=s.donation_item,
        donation_label=DONATION_OPTIONS[s.donation_item]["label"] if s.donation_item else None,
        donation_quantity=s.donation_quantity,
        community_service_hours_required=s.community_service_hours_required,
        community_service_hours_logged=s.community_service_hours_logged,
        status=s.status,
        rejection_reason=s.rejection_reason,
        created_at=s.created_at,
        reviewed_at=s.reviewed_at,
    )


@router.get("/")
def list_settlements(status_filter: str | None = None, db: Session = Depends(get_db)):
    query = db.query(SanctionSettlement).options(joinedload(SanctionSettlement.student))
    if status_filter:
        query = query.filter(SanctionSettlement.status == status_filter.upper())

    settlements = query.order_by(SanctionSettlement.created_at.desc()).all()
    return {"settlements": [_row(s) for s in settlements]}


@router.put("/{settlement_id}/approve")
def approve_settlement(
    settlement_id: str, db: Session = Depends(get_db), admin: AdminAccount = Depends(get_current_admin)
):
    """Confirms a donation was received - clears every sanction it covers."""

    settlement = db.query(SanctionSettlement).filter(SanctionSettlement.id == settlement_id).first()
    if not settlement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Settlement not found")
    if settlement.resolution_type != "DONATION":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only donations are approved directly - log hours for community service")
    if settlement.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Settlement is already {settlement.status.lower()}")

    settlement.status = "APPROVED"
    settlement.reviewed_by = admin.id
    settlement.reviewed_at = datetime.now(timezone.utc)

    db.query(Sanction).filter(Sanction.settlement_id == settlement.id).update({"status": "SETTLED"})
    db.commit()

    return {"status": "APPROVED"}


@router.put("/{settlement_id}/reject")
def reject_settlement(
    settlement_id: str,
    body: RejectSettlementBody,
    db: Session = Depends(get_db),
    admin: AdminAccount = Depends(get_current_admin),
):
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A rejection reason is required")

    settlement = db.query(SanctionSettlement).filter(SanctionSettlement.id == settlement_id).first()
    if not settlement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Settlement not found")
    if settlement.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Settlement is already {settlement.status.lower()}")

    settlement.status = "REJECTED"
    settlement.reviewed_by = admin.id
    settlement.reviewed_at = datetime.now(timezone.utc)
    settlement.rejection_reason = reason

    # Free up the sanctions it was claiming so the student can try again.
    db.query(Sanction).filter(Sanction.settlement_id == settlement.id).update({"settlement_id": None})
    db.commit()

    return {"status": "REJECTED"}


@router.put("/{settlement_id}/log-hours")
def log_hours(
    settlement_id: str,
    body: LogHoursBody,
    db: Session = Depends(get_db),
    admin: AdminAccount = Depends(get_current_admin),
):
    """Add completed community service hours. Auto-completes (and clears the
    covered sanctions) once the required total is reached."""

    if body.hours <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Hours must be greater than 0")

    settlement = db.query(SanctionSettlement).filter(SanctionSettlement.id == settlement_id).first()
    if not settlement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Settlement not found")
    if settlement.resolution_type != "COMMUNITY_SERVICE":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This settlement isn't community service")
    if settlement.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Settlement is already {settlement.status.lower()}")

    settlement.community_service_hours_logged = float(settlement.community_service_hours_logged) + body.hours

    if settlement.community_service_hours_logged >= settlement.community_service_hours_required:
        settlement.status = "COMPLETED"
        settlement.reviewed_by = admin.id
        settlement.reviewed_at = datetime.now(timezone.utc)
        db.query(Sanction).filter(Sanction.settlement_id == settlement.id).update({"status": "SETTLED"})

    db.commit()
    return {
        "status": settlement.status,
        "hours_logged": settlement.community_service_hours_logged,
        "hours_required": settlement.community_service_hours_required,
    }
