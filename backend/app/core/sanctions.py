"""Shared sanction logic: absence detection and donation-in-kind rates, used
by both the student and admin sanction endpoints."""

import math

from sqlalchemy.orm import Session

from app.models.event import Event, Attendance
from app.models.excuse_request import ExcuseRequest
from app.models.sanction import Sanction

COMMUNITY_SERVICE_HOURS_PER_ABSENCE = 2

# Each entry: how many units are owed, and per how many absences that many
# units covers. E.g. long bondpaper is "1 ream per 4 absents" -> (1, 4).
DONATION_OPTIONS = {
    "black_ink_printer": {"label": "Black ink printer", "unit_qty": 1, "per_absences": 1},
    "cert_holders": {"label": "Certificate holders", "unit_qty": 2, "per_absences": 1},
    "vellum": {"label": "Vellum paper (pcs)", "unit_qty": 10, "per_absences": 1},
    "long_bondpaper": {"label": "Long bondpaper (ream)", "unit_qty": 1, "per_absences": 4},
    "a4_bondpaper": {"label": "A4 bondpaper (ream)", "unit_qty": 1, "per_absences": 4},
    "thumbtacks": {"label": "Thumbtacks (boxes)", "unit_qty": 2, "per_absences": 1},
    "big_tissue": {"label": "Big tissue (pack)", "unit_qty": 1, "per_absences": 1},
}


def donation_quantity(item_key: str, absence_count: int) -> int:
    option = DONATION_OPTIONS[item_key]
    cycles = math.ceil(absence_count / option["per_absences"])
    return cycles * option["unit_qty"]


def donation_options_for(absence_count: int) -> list[dict]:
    return [
        {"key": key, "label": opt["label"], "quantity": donation_quantity(key, absence_count)}
        for key, opt in DONATION_OPTIONS.items()
    ]


def sync_sanctions_for_student(student_id: str, db: Session) -> None:
    """Ensure a Sanction row exists for every required, ARCHIVED event this
    student missed with no approved excuse. Safe to call repeatedly - does
    nothing for events already recorded."""

    already_recorded = {
        s.event_id for s in db.query(Sanction).filter(Sanction.student_id == student_id).all()
    }

    required_archived = db.query(Event).filter(
        Event.status == "ARCHIVED", Event.attendance_required.is_(True)
    ).all()

    excused_event_ids = {
        e.event_id for e in db.query(ExcuseRequest).filter(
            ExcuseRequest.student_id == student_id, ExcuseRequest.status == "APPROVED"
        ).all()
    }

    attendance_by_event = {
        a.event_id: a for a in db.query(Attendance).filter(Attendance.student_id == student_id).all()
    }

    for event in required_archived:
        if event.id in already_recorded or event.id in excused_event_ids:
            continue

        attendance = attendance_by_event.get(event.id)
        # PRESENT (finalized) or EXCUSED attendance means no absence. Anything
        # else - no registration at all, or INCOMPLETE (finalizes to ABSENT
        # once archived) - counts as a missed required event.
        if attendance and attendance.status in ("PRESENT", "EXCUSED"):
            continue

        db.add(Sanction(student_id=student_id, event_id=event.id, status="PENDING"))

    db.commit()


def get_unclaimed_sanctions(student_id: str, db: Session) -> list[Sanction]:
    return (
        db.query(Sanction)
        .filter(Sanction.student_id == student_id, Sanction.status == "PENDING", Sanction.settlement_id.is_(None))
        .all()
    )
