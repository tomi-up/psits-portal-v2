"""Events, registration, and QR attendance endpoints.

Listing/viewing an event and registering are public (students use these
without logging in). Actually recording attendance - scan-in, scan-out, and
the officer-facing stats/attendance-list views - requires an admin session,
so the scanner itself needs an admin logged in on that device.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_student, get_optional_current_student
from app.core.security import decode_access_token
from app.core.attendance import as_utc as _as_utc
from app.core.checkpoints import active_checkpoint, uses_checkpoints
from app.models.student import Student
from app.models.event import Event, EventRegistration, Attendance
from app.models.excuse_request import ExcuseRequest
from app.models.attendance_review import AttendanceReviewRequest
from app.models.admin import AdminAccount
from app.models.survey import SurveyResponse

router = APIRouter(prefix="/events", tags=["events"])


class AttendanceConnectionManager:
    """Tracks live WebSocket clients per event so a scan can push an update
    only to admins watching that specific event's registrations table."""

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}

    def connect(self, event_id: str, ws: WebSocket):
        self._connections.setdefault(event_id, []).append(ws)

    def disconnect(self, event_id: str, ws: WebSocket):
        conns = self._connections.get(event_id)
        if conns and ws in conns:
            conns.remove(ws)
            if not conns:
                self._connections.pop(event_id, None)

    async def broadcast(self, event_id: str, message: dict):
        for ws in list(self._connections.get(event_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(event_id, ws)


attendance_ws_manager = AttendanceConnectionManager()


# ============================================================================
# SCHEMAS
# ============================================================================

class EventResponse(BaseModel):
    id: str
    name: str
    venue: str | None
    description: str | None
    event_date: datetime | None
    cover_image_url: str | None
    attendance_required: bool = False
    is_registered: bool = False
    is_checked_in: bool = False   # time_in set (scanned in at least once)
    is_checked_out: bool = False  # time_out set (fully present, QR no longer needed)
    excuse_status: str | None = None  # PENDING, APPROVED, REJECTED, or None if never requested
    excuse_rejection_reason: str | None = None
    survey_required: bool = False
    # PENDING once checked out with no response yet, SUBMITTED once they've
    # responded, or None if no survey applies yet (survey not required, or
    # attendance isn't checked out and no response exists regardless).
    survey_status: str | None = None
    # NOT_STARTED for every legacy two-scan event; anything else means this
    # event is running the 3-checkpoint workflow.
    attendance_phase: str = "NOT_STARTED"
    current_checkpoint: str | None = None

    class Config:
        from_attributes = True


class QrScanRequest(BaseModel):
    student_id: str
    officer_id: str | None = None


class AttendanceRecord(BaseModel):
    student_id: str
    student_name: str
    time_in: datetime | None
    time_out: datetime | None
    status: str


class AttendanceResponse(BaseModel):
    event_id: str
    event_name: str
    total_recorded: int
    records: list[AttendanceRecord]


class AttendanceStats(BaseModel):
    checked_in: int      # scanned in at least once (time_in set)
    currently_inside: int  # time_in set, time_out not yet set
    completed: int        # time_out set (status = PRESENT)


# ============================================================================
# EVENT ENDPOINTS
# ============================================================================

@router.get("/")
def list_events(
    student: Student | None = Depends(get_optional_current_student), db: Session = Depends(get_db)
):
    """List active events, optionally flagged with this student's registration/check-in
    status if the caller is a logged-in student. Also used with no student context at all
    by the scanner's event picker."""

    events = db.query(Event).filter(Event.status == "ACTIVE").order_by(Event.event_date).all()

    registered_ids = set()
    checked_in_ids = set()
    checked_out_ids = set()
    excuse_status_by_event: dict[str, str] = {}
    excuse_reason_by_event: dict[str, str | None] = {}
    survey_submitted_ids: set[str] = set()
    if student:
        registered_ids = {
            r.event_id for r in db.query(EventRegistration).filter(
                EventRegistration.student_id == student.id
            ).all()
        }
        for a in db.query(Attendance).filter(Attendance.student_id == student.id).all():
            if a.time_in:
                checked_in_ids.add(a.event_id)
            if a.time_out:
                checked_out_ids.add(a.event_id)

        # Most recent request per event, in case a REJECTED one was resubmitted.
        for req in (
            db.query(ExcuseRequest)
            .filter(ExcuseRequest.student_id == student.id)
            .order_by(ExcuseRequest.created_at.desc())
            .all()
        ):
            excuse_status_by_event.setdefault(req.event_id, req.status)
            excuse_reason_by_event.setdefault(req.event_id, req.rejection_reason)

        survey_submitted_ids = {
            r.event_id for r in db.query(SurveyResponse).filter(SurveyResponse.student_id == student.id).all()
        }

    def _survey_status(event: Event) -> str | None:
        if not event.survey_required:
            return None
        if event.id in survey_submitted_ids:
            return "SUBMITTED"
        if event.id in checked_out_ids:
            return "PENDING"
        return None

    return {
        "events": [
            EventResponse(
                id=e.id,
                name=e.name,
                venue=e.venue,
                description=e.description,
                event_date=e.event_date,
                cover_image_url=e.cover_image_url,
                attendance_required=e.attendance_required,
                is_registered=e.id in registered_ids,
                is_checked_in=e.id in checked_in_ids,
                is_checked_out=e.id in checked_out_ids,
                excuse_status=excuse_status_by_event.get(e.id),
                excuse_rejection_reason=excuse_reason_by_event.get(e.id),
                survey_required=e.survey_required,
                survey_status=_survey_status(e),
                attendance_phase=e.attendance_phase,
                current_checkpoint=active_checkpoint(e.attendance_phase),
            )
            for e in events
        ]
    }


@router.get("/{event_id}")
def get_event(event_id: str, db: Session = Depends(get_db)):
    """Fetch a single event's details (used by the scanner page to show which event it's scanning for)."""

    event = db.query(Event).filter(Event.id == event_id, Event.status == "ACTIVE").first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    return EventResponse(
        id=event.id,
        name=event.name,
        venue=event.venue,
        description=event.description,
        event_date=event.event_date,
        cover_image_url=event.cover_image_url,
        attendance_required=event.attendance_required,
        attendance_phase=event.attendance_phase,
        current_checkpoint=active_checkpoint(event.attendance_phase),
    )


@router.websocket("/{event_id}/attendance/ws")
async def attendance_updates_ws(
    websocket: WebSocket,
    event_id: str,
    db: Session = Depends(get_db),
):
    """Admin registrations table subscribes here for a push the instant any
    officer scans someone in/out for this event. Payload is a bare signal -
    the client re-fetches the REST endpoint for the actual data, keeping a
    single source of truth for the response shape."""
    # This is the admin viewer's notification channel. Officer scanners keep
    # using their independent event-code + PIN authentication flow.
    await websocket.accept()
    try:
        message = await asyncio.wait_for(websocket.receive_json(), timeout=5)
    except WebSocketDisconnect:
        return
    except (asyncio.TimeoutError, ValueError):
        await websocket.close(code=1008)
        return

    token = message.get("token") if isinstance(message, dict) else None
    payload = decode_access_token(token) if isinstance(token, str) else None
    admin = (
        db.query(AdminAccount).filter(AdminAccount.id == payload["sub"]).first()
        if payload and payload.get("sub")
        else None
    )
    event_exists = db.query(Event.id).filter(Event.id == event_id).first()
    if not admin or not admin.is_active or not event_exists:
        await websocket.close(code=1008)
        return

    attendance_ws_manager.connect(event_id, websocket)
    await websocket.send_json({"type": "authenticated"})
    try:
        while True:
            # We don't expect messages from the client; this just blocks
            # until the connection closes so we can detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        attendance_ws_manager.disconnect(event_id, websocket)


@router.post("/{event_id}/register")
def register_for_event(
    event_id: str,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Student registers their own intent to attend an event. Unlocks their
    check-in QR. Identity comes from the verified Bearer token - previously
    took student_id in the request body with no check the caller WAS that
    student, so anyone could register any student for any event."""

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    existing = db.query(EventRegistration).filter(
        EventRegistration.event_id == event_id,
        EventRegistration.student_id == student.id,
    ).first()

    if not existing:
        db.add(EventRegistration(event_id=event_id, student_id=student.id))
        try:
            db.commit()
        except IntegrityError:
            # Two requests from the same student raced between the check
            # above and this commit (double-click, retried request on a
            # flaky connection) - the unique (event_id, student_id) index
            # caught it at the DB level. The end state either request wanted
            # ("this student is registered") is already true, so treat it as
            # success instead of surfacing a raw 500.
            db.rollback()

    return {"status": "REGISTERED", "event_id": event_id, "student_id": student.student_id}


class ExcuseRequestCreate(BaseModel):
    reason: str


@router.post("/{event_id}/excuse-request")
def submit_excuse_request(
    event_id: str,
    body: ExcuseRequestCreate,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Student asks to be excused from a required event, pending admin
    review. Only meaningful for events that actually require attendance."""

    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reason is required")

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if not event.attendance_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event doesn't require attendance, so there's nothing to be excused from",
        )

    existing = (
        db.query(ExcuseRequest)
        .filter(
            ExcuseRequest.event_id == event_id,
            ExcuseRequest.student_id == student.id,
            ExcuseRequest.status.in_(["PENDING", "APPROVED"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a {existing.status.lower()} excuse request for this event",
        )

    db.add(ExcuseRequest(event_id=event_id, student_id=student.id, reason=reason, status="PENDING"))
    db.commit()

    return {"status": "PENDING"}


class AttendanceReviewCreate(BaseModel):
    reason: str


@router.post("/{event_id}/attendance-review")
def submit_attendance_review(
    event_id: str,
    body: AttendanceReviewCreate,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Student explains an ambiguous (FOR_REVIEW) checkpoint scan pattern -
    e.g. they missed the MIDDLE sweep but were there for IN and OUT - pending
    admin review. Approving it marks their attendance PRESENT for this event.

    Only meaningful while the record actually reads FOR_REVIEW: this is not a
    general "dispute my attendance" form, it exists specifically for the
    ambiguous-scan-pattern case the 3-checkpoint workflow can produce.
    """

    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reason is required")

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    record = db.query(Attendance).filter(
        Attendance.event_id == event_id, Attendance.student_id == student.id
    ).first()
    if not record or record.status != "FOR_REVIEW":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your attendance for this event isn't currently under review",
        )

    existing = (
        db.query(AttendanceReviewRequest)
        .filter(
            AttendanceReviewRequest.event_id == event_id,
            AttendanceReviewRequest.student_id == student.id,
            AttendanceReviewRequest.status.in_(["PENDING", "APPROVED"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a {existing.status.lower()} request for this event",
        )

    db.add(AttendanceReviewRequest(event_id=event_id, student_id=student.id, reason=reason, status="PENDING"))
    db.commit()

    return {"status": "PENDING"}


# ============================================================================
# QR ATTENDANCE ENDPOINTS (scan-in / scan-out)
# ============================================================================

def _reject_if_checkpoint_event(event: Event):
    """The legacy two-scan flow and the 3-checkpoint flow both write
    Attendance.status, so letting them touch the same event would have one
    silently overwrite the other's verdict - a student evaluated LATE from
    their checkpoint scans would be flipped to PRESENT by a stray scan-out.

    Once an admin has opened the IN checkpoint, this event belongs to the
    checkpoint flow and its officers scan through POST /scanner/scan.
    """
    if uses_checkpoints(event.attendance_phase):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This event uses the 3-checkpoint attendance workflow. "
                "Officers must scan through the checkpoint scanner instead."
            ),
        )


def _find_student_and_registration(db: Session, event_id: str, student_id: str) -> tuple[Student, Event]:
    """Shared lookup + validation for both scan-in and scan-out."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    _reject_if_checkpoint_event(event)

    student = db.query(Student).filter(Student.student_id == student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid QR code")

    registered = db.query(EventRegistration).filter(
        EventRegistration.event_id == event_id,
        EventRegistration.student_id == student.id,
    ).first()

    if not registered:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{student.first_name} {student.last_name} is not registered for this event",
        )

    return student, event


@router.post("/{event_id}/attendance/scan-in")
async def scan_in(
    event_id: str,
    request: QrScanRequest,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Scan a student's QR to check them IN. Requires the event to be ACTIVE
    (open for check-in) and the student to be registered."""

    student, event = _find_student_and_registration(db, event_id, request.student_id)

    if event.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event is not currently open for check-in",
        )

    record = db.query(Attendance).filter(
        Attendance.event_id == event_id,
        Attendance.student_id == student.id,
    ).first()

    if record and record.time_in:
        return {
            "status": "ALREADY_SCANNED_IN",
            "student_name": f"{student.first_name} {student.last_name}",
            "time_in": _as_utc(record.time_in).isoformat(),
        }

    if not record:
        record = Attendance(event_id=event_id, student_id=student.id)
        db.add(record)

    record.time_in = datetime.now(timezone.utc)
    record.recorded_in_by = request.officer_id
    record.status = "INCOMPLETE"
    db.commit()

    await attendance_ws_manager.broadcast(event_id, {"type": "attendance_updated"})

    return {
        "status": "SCANNED_IN",
        "student_name": f"{student.first_name} {student.last_name}",
        "time_in": _as_utc(record.time_in).isoformat(),
    }


@router.post("/{event_id}/attendance/scan-out")
async def scan_out(
    event_id: str,
    request: QrScanRequest,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Scan a student's QR to check them OUT. They must have scanned in first."""

    student, _event = _find_student_and_registration(db, event_id, request.student_id)

    record = db.query(Attendance).filter(
        Attendance.event_id == event_id,
        Attendance.student_id == student.id,
    ).first()

    if not record or not record.time_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{student.first_name} {student.last_name} has not scanned in yet",
        )

    if record.time_out:
        return {
            "status": "ALREADY_SCANNED_OUT",
            "student_name": f"{student.first_name} {student.last_name}",
            "time_out": _as_utc(record.time_out).isoformat(),
        }

    record.time_out = datetime.now(timezone.utc)
    record.recorded_out_by = request.officer_id
    record.status = "PRESENT"
    db.commit()

    await attendance_ws_manager.broadcast(event_id, {"type": "attendance_updated"})

    return {
        "status": "SCANNED_OUT",
        "student_name": f"{student.first_name} {student.last_name}",
        "time_out": _as_utc(record.time_out).isoformat(),
    }


@router.get("/{event_id}/attendance/stats", response_model=AttendanceStats)
def get_attendance_stats(
    event_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Live counters for the scanner UI, shared across every officer scanning this event."""

    records = db.query(Attendance).filter(
        Attendance.event_id == event_id,
        Attendance.time_in.isnot(None),
    ).all()

    return AttendanceStats(
        checked_in=len(records),
        currently_inside=sum(1 for r in records if not r.time_out),
        completed=sum(1 for r in records if r.time_out),
    )


@router.get("/{event_id}/attendance")
def get_event_attendance(
    event_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    """Officer view: all students who have checked in to an event."""

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    records = db.query(Attendance).filter(
        Attendance.event_id == event_id,
        Attendance.time_in.isnot(None),
    ).all()

    return AttendanceResponse(
        event_id=event_id,
        event_name=event.name,
        total_recorded=len(records),
        records=[
            AttendanceRecord(
                student_id=r.student.student_id,
                student_name=f"{r.student.first_name} {r.student.last_name}",
                time_in=_as_utc(r.time_in),
                time_out=_as_utc(r.time_out),
                status=r.status,
            )
            for r in records
        ],
    )
