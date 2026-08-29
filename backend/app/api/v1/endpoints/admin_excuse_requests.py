"""Admin review of student-submitted excuse requests."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.admin import AdminAccount
from app.models.excuse_request import ExcuseRequest
from app.models.event import EventRegistration, Attendance

router = APIRouter(
    prefix="/officer/excuse-requests", tags=["admin-excuse-requests"], dependencies=[Depends(get_current_admin)]
)


class ExcuseRequestRow(BaseModel):
    id: str
    event_id: str
    event_name: str
    student_id: str
    student_name: str
    reason: str
    status: str
    created_at: datetime
    reviewed_at: datetime | None
    rejection_reason: str | None


class RejectRequestBody(BaseModel):
    reason: str


@router.get("/")
def list_excuse_requests(status_filter: str | None = None, db: Session = Depends(get_db)):
    """List excuse requests, newest first. Pass ?status_filter=PENDING to
    narrow to just what still needs review; omit it to see everything."""

    query = db.query(ExcuseRequest).options(
        joinedload(ExcuseRequest.event), joinedload(ExcuseRequest.student)
    )
    if status_filter:
        query = query.filter(ExcuseRequest.status == status_filter.upper())

    requests = query.order_by(ExcuseRequest.created_at.desc()).all()

    return {
        "requests": [
            ExcuseRequestRow(
                id=r.id,
                event_id=r.event_id,
                event_name=r.event.name if r.event else "(deleted event)",
                student_id=r.student.student_id if r.student else "(deleted student)",
                student_name=f"{r.student.first_name} {r.student.last_name}" if r.student else "(deleted student)",
                reason=r.reason,
                status=r.status,
                created_at=r.created_at,
                reviewed_at=r.reviewed_at,
                rejection_reason=r.rejection_reason,
            )
            for r in requests
        ]
    }


@router.put("/{request_id}/approve")
def approve_excuse_request(
    request_id: str, db: Session = Depends(get_db), admin: AdminAccount = Depends(get_current_admin)
):
    """Approve a request: marks it APPROVED and sets the student's
    attendance for that event to EXCUSED, auto-registering them first if
    they weren't already (same as a manual admin override)."""

    req = db.query(ExcuseRequest).filter(ExcuseRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Excuse request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Request is already {req.status.lower()}")

    req.status = "APPROVED"
    req.reviewed_by = admin.id
    req.reviewed_at = datetime.now(timezone.utc)

    registration = db.query(EventRegistration).filter(
        EventRegistration.event_id == req.event_id, EventRegistration.student_id == req.student_id
    ).first()
    if not registration:
        db.add(EventRegistration(event_id=req.event_id, student_id=req.student_id))

    attendance = db.query(Attendance).filter(
        Attendance.event_id == req.event_id, Attendance.student_id == req.student_id
    ).first()
    if not attendance:
        attendance = Attendance(id=str(uuid.uuid4()), event_id=req.event_id, student_id=req.student_id)
        db.add(attendance)

    attendance.time_in = None
    attendance.time_out = None
    attendance.status = "EXCUSED"

    db.commit()
    return {"status": "APPROVED"}


@router.put("/{request_id}/reject")
def reject_excuse_request(
    request_id: str,
    body: RejectRequestBody,
    db: Session = Depends(get_db),
    admin: AdminAccount = Depends(get_current_admin),
):
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A rejection reason is required")

    req = db.query(ExcuseRequest).filter(ExcuseRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Excuse request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Request is already {req.status.lower()}")

    req.status = "REJECTED"
    req.reviewed_by = admin.id
    req.reviewed_at = datetime.now(timezone.utc)
    req.rejection_reason = reason
    db.commit()

    return {"status": "REJECTED"}
