"""Admin review of student-submitted explanations for ambiguous (FOR_REVIEW)
checkpoint attendance. Mirrors admin_excuse_requests.py's shape - same kind
of student-submits/admin-approves queue, just resolving a different status."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.admin import AdminAccount
from app.models.attendance_review import AttendanceReviewRequest
from app.models.event import Attendance

router = APIRouter(
    prefix="/officer/attendance-reviews",
    tags=["admin-attendance-reviews"],
    dependencies=[Depends(get_current_admin)],
)


class AttendanceReviewRow(BaseModel):
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
def list_attendance_reviews(status_filter: str | None = None, db: Session = Depends(get_db)):
    """List attendance review requests, newest first. Pass ?status_filter=PENDING
    to narrow to just what still needs review; omit it to see everything."""

    query = db.query(AttendanceReviewRequest).options(
        joinedload(AttendanceReviewRequest.event), joinedload(AttendanceReviewRequest.student)
    )
    if status_filter:
        query = query.filter(AttendanceReviewRequest.status == status_filter.upper())

    requests = query.order_by(AttendanceReviewRequest.created_at.desc()).all()

    return {
        "requests": [
            AttendanceReviewRow(
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
def approve_attendance_review(
    request_id: str, db: Session = Depends(get_db), admin: AdminAccount = Depends(get_current_admin)
):
    """Approve: marks the request APPROVED and the student's attendance for
    that event PRESENT. time_in/time_out are left untouched - only the
    verdict on an already-ambiguous scan pattern changes."""

    req = db.query(AttendanceReviewRequest).filter(AttendanceReviewRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Request is already {req.status.lower()}")

    req.status = "APPROVED"
    req.reviewed_by = admin.id
    req.reviewed_at = datetime.now(timezone.utc)

    attendance = db.query(Attendance).filter(
        Attendance.event_id == req.event_id, Attendance.student_id == req.student_id
    ).first()
    if attendance:
        attendance.status = "PRESENT"

    db.commit()
    return {"status": "APPROVED"}


@router.put("/{request_id}/reject")
def reject_attendance_review(
    request_id: str,
    body: RejectRequestBody,
    db: Session = Depends(get_db),
    admin: AdminAccount = Depends(get_current_admin),
):
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A rejection reason is required")

    req = db.query(AttendanceReviewRequest).filter(AttendanceReviewRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Request is already {req.status.lower()}")

    req.status = "REJECTED"
    req.reviewed_by = admin.id
    req.reviewed_at = datetime.now(timezone.utc)
    req.rejection_reason = reason
    db.commit()

    return {"status": "REJECTED"}
