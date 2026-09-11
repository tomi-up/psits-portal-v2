"""Student-facing sanctions: view current absences and choose how to settle
them - 2 hours of community service per absence, or a donation in kind."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_student
from app.core.sanctions import (
    COMMUNITY_SERVICE_HOURS_PER_ABSENCE,
    DONATION_OPTIONS,
    donation_options_for,
    donation_quantity,
    sync_sanctions_for_student,
    get_unclaimed_sanctions,
)
from app.models.student import Student
from app.models.sanction import Sanction, SanctionSettlement

router = APIRouter(prefix="/sanctions", tags=["sanctions"])


class MissedEventRow(BaseModel):
    event_id: str
    event_name: str
    event_date: datetime | None


class SettlementRow(BaseModel):
    id: str
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


class SanctionsResponse(BaseModel):
    pending_count: int
    missed_events: list[MissedEventRow]
    donation_options: list[dict]
    community_service_hours_required: float
    active_settlement: SettlementRow | None


class SettleRequest(BaseModel):
    resolution_type: str  # COMMUNITY_SERVICE or DONATION
    donation_item: str | None = None


def _settlement_row(s: SanctionSettlement) -> SettlementRow:
    donation_label = DONATION_OPTIONS[s.donation_item]["label"] if s.donation_item else None
    return SettlementRow(
        id=s.id,
        resolution_type=s.resolution_type,
        sanctions_count=s.sanctions_count,
        donation_item=s.donation_item,
        donation_label=donation_label,
        donation_quantity=s.donation_quantity,
        community_service_hours_required=s.community_service_hours_required,
        community_service_hours_logged=s.community_service_hours_logged,
        status=s.status,
        rejection_reason=s.rejection_reason,
        created_at=s.created_at,
    )


@router.get("/", response_model=SanctionsResponse)
def get_my_sanctions(student: Student = Depends(get_current_student), db: Session = Depends(get_db)):
    sync_sanctions_for_student(student.id, db)

    active_settlement = (
        db.query(SanctionSettlement)
        .filter(
            SanctionSettlement.student_id == student.id,
            SanctionSettlement.status.in_(["PENDING", "REJECTED"]),
        )
        .order_by(SanctionSettlement.created_at.desc())
        .first()
    )

    unclaimed = get_unclaimed_sanctions(student.id, db)
    pending_count = len(unclaimed)

    missed_events = []
    if unclaimed:
        rows = (
            db.query(Sanction)
            .options(joinedload(Sanction.event))
            .filter(Sanction.id.in_([s.id for s in unclaimed]))
            .all()
        )
        missed_events = [
            MissedEventRow(event_id=r.event.id, event_name=r.event.name, event_date=r.event.event_date)
            for r in rows
            if r.event
        ]

    return SanctionsResponse(
        pending_count=pending_count,
        missed_events=missed_events,
        donation_options=donation_options_for(pending_count) if pending_count else [],
        community_service_hours_required=pending_count * COMMUNITY_SERVICE_HOURS_PER_ABSENCE,
        active_settlement=_settlement_row(active_settlement) if active_settlement else None,
    )


@router.post("/settle")
def settle_sanctions(
    body: SettleRequest, student: Student = Depends(get_current_student), db: Session = Depends(get_db)
):
    sync_sanctions_for_student(student.id, db)

    existing_active = db.query(SanctionSettlement).filter(
        SanctionSettlement.student_id == student.id, SanctionSettlement.status == "PENDING"
    ).first()
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a settlement pending review.",
        )

    unclaimed = get_unclaimed_sanctions(student.id, db)
    if not unclaimed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have no pending sanctions.")

    count = len(unclaimed)

    if body.resolution_type == "COMMUNITY_SERVICE":
        settlement = SanctionSettlement(
            student_id=student.id, resolution_type="COMMUNITY_SERVICE", sanctions_count=count,
            community_service_hours_required=count * COMMUNITY_SERVICE_HOURS_PER_ABSENCE,
            community_service_hours_logged=0, status="PENDING",
        )
    elif body.resolution_type == "DONATION":
        if not body.donation_item or body.donation_item not in DONATION_OPTIONS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Please choose a valid donation item")
        settlement = SanctionSettlement(
            student_id=student.id, resolution_type="DONATION", sanctions_count=count,
            donation_item=body.donation_item, donation_quantity=donation_quantity(body.donation_item, count),
            status="PENDING",
        )
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid resolution type")

    db.add(settlement)
    db.flush()

    for sanction in unclaimed:
        sanction.settlement_id = settlement.id

    db.commit()
    return {"status": "PENDING", "settlement_id": settlement.id}
