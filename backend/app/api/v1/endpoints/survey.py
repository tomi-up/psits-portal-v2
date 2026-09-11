"""Post-event survey: student-facing. A survey response is entirely separate
from Attendance - submitting one never changes Attendance.status. Eligibility
requires only that the student has scanned in (an Attendance row exists);
Time Out is not required to submit, so a student can fill it out before an
officer's scan-out is recorded without the survey silently standing in for
Time Out (see app/core/attendance.py's finalize_status - untouched by this)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_student
from app.core.survey_questions import SURVEY_SECTIONS, RATING_SCALE, validate_answers
from app.models.student import Student
from app.models.event import Event, Attendance
from app.models.survey import SurveyResponse

router = APIRouter(prefix="/events", tags=["survey"])


class SurveySubmit(BaseModel):
    answers: dict


@router.get("/{event_id}/survey")
def get_survey(event_id: str, student: Student = Depends(get_current_student), db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if not event.survey_required:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event does not require a survey")

    attendance = db.query(Attendance).filter(
        Attendance.event_id == event_id, Attendance.student_id == student.id
    ).first()
    if not attendance or not attendance.time_in:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You need a recorded attendance (time in) for this event before taking the survey",
        )

    existing = db.query(SurveyResponse).filter(
        SurveyResponse.event_id == event_id, SurveyResponse.student_id == student.id
    ).first()

    return {
        "event_name": event.name,
        "sections": SURVEY_SECTIONS,
        "rating_scale": RATING_SCALE,
        "already_submitted": existing is not None,
        "answers": existing.answers if existing else None,
    }


@router.post("/{event_id}/survey")
def submit_survey(
    event_id: str,
    body: SurveySubmit,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if not event.survey_required:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This event does not require a survey")

    attendance = db.query(Attendance).filter(
        Attendance.event_id == event_id, Attendance.student_id == student.id
    ).first()
    if not attendance or not attendance.time_in:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You need a recorded attendance (time in) for this event before taking the survey",
        )

    existing = db.query(SurveyResponse).filter(
        SurveyResponse.event_id == event_id, SurveyResponse.student_id == student.id
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You've already submitted this survey")

    error = validate_answers(body.answers)
    if error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error)

    db.add(SurveyResponse(
        event_id=event_id, student_id=student.id,
        answers=body.answers, submitted_at=datetime.now(timezone.utc),
    ))
    try:
        db.commit()
    except Exception:
        # UNIQUE(event_id, student_id) race - two submissions landed at once.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You've already submitted this survey")

    # Deliberately not touching attendance.status here - Time In/Time Out
    # remain the sole source of truth for attendance completeness. Whether
    # this now reads as "confirmed" is purely a frontend combination of
    # is_checked_out + survey_status, not a new backend status.
    return {"status": "SUBMITTED"}
