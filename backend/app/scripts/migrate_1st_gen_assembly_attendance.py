"""One-off migration: bring the "1st General Assembly 2026-2027" event, its
507 registrations, and its 506 attendance records across from the old
database (PRODUCTION_DATABASE_URL) into the current one (DATABASE_URL).

Why this is needed: this event was run and archived on the old deployment,
before this database took over as the single live one. The data itself was
never lost - it just lives in the other database and has to be copied over
once, by hand, rather than re-entered.

Student matching: the old attendance/registration tables key students by
their internal UUID (students.id), not the business student_id string, so
every row is joined through old.students to resolve the business id first,
then matched against the *current* students table by that business id. One
registered student in the old data ("22-99999", "Test Student") is a dummy
test row with no real counterpart and is always skipped and reported - not
a data problem to fix.

Not carried over: recorded_in_by / recorded_out_by (the old values are
officer ids from a different, unrelated Officer table in the old database -
preserving them would point at the wrong officers or nothing at all here).

Idempotent: re-running after a --commit is a no-op. The event is looked up
by name first; registrations and attendance rows are skipped individually
if they already exist for that (event, student) pair.

Dry-run by default; --commit to actually write.
"""

import argparse

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.event import Attendance, Event, EventRegistration
from app.models.student import Student

OLD_EVENT_ID = "fd66f8b3-462f-412f-b392-9c81438f65de"
EVENT_NAME = "1st General Assembly 2026-2027"
# The old row has a mojibake-corrupted byte in place of the dash
# ("A.Y. 2026�2027") - the original byte is unrecoverable, so this is
# rewritten using this app's own school-year label convention (a plain
# hyphen, e.g. "2026-2027") rather than guessing at a dash variant.
DESCRIPTION = (
    "The PSITS-USM 1st General Assembly (A.Y. 2026-2027) marks the "
    "official start of the academic year for our tech community."
)
KNOWN_DUMMY_IDS = {"22-99999"}


def fetch_old_data(old_engine):
    with old_engine.connect() as conn:
        event_row = conn.execute(text(
            "SELECT venue, event_date, cover_image_url, status, is_active, "
            "attendance_required, excused_year_levels FROM events WHERE id = :id"
        ), {"id": OLD_EVENT_ID}).fetchone()
        if not event_row:
            raise ValueError(f"Event {OLD_EVENT_ID} not found in old database")

        registrations = conn.execute(text(
            "SELECT s.student_id, r.registered_at "
            "FROM event_registrations r JOIN students s ON s.id = r.student_id "
            "WHERE r.event_id = :id"
        ), {"id": OLD_EVENT_ID}).fetchall()

        attendance = conn.execute(text(
            "SELECT s.student_id, a.time_in, a.time_out, a.status "
            "FROM attendance a JOIN students s ON s.id = a.student_id "
            "WHERE a.event_id = :id"
        ), {"id": OLD_EVENT_ID}).fetchall()

    return event_row, registrations, attendance


def migrate(commit: bool) -> None:
    if not settings.production_database_url:
        raise ValueError("PRODUCTION_DATABASE_URL is not set")

    old_engine = create_engine(settings.production_database_url, pool_pre_ping=True, hide_parameters=True)
    new_engine = create_engine(settings.database_url, pool_pre_ping=True, hide_parameters=True)

    event_row, old_registrations, old_attendance = fetch_old_data(old_engine)
    old_engine.dispose()

    venue, event_date, cover_image_url, status, is_active, attendance_required, excused_year_levels = event_row

    with Session(new_engine) as db:
        try:
            business_id_to_student_id = {
                s.student_id: s.id for s in db.query(Student.id, Student.student_id)
            }

            event = db.query(Event).filter(Event.name == EVENT_NAME).first()
            event_created = False
            if not event:
                event = Event(
                    name=EVENT_NAME,
                    venue=venue,
                    description=DESCRIPTION,
                    event_date=event_date,
                    cover_image_url=cover_image_url,
                    status=status,
                    is_active=is_active,
                    attendance_required=attendance_required,
                    excused_year_levels=excused_year_levels,
                    survey_required=False,
                    event_code=None,
                    attendance_phase="CLOSED",
                )
                db.add(event)
                db.flush()
                event_created = True

            skipped_unknown = set()
            regs_created = 0
            regs_skipped_existing = 0
            for business_id, registered_at in old_registrations:
                student_id = business_id_to_student_id.get(business_id)
                if not student_id:
                    skipped_unknown.add(business_id)
                    continue
                exists = db.query(EventRegistration).filter(
                    EventRegistration.event_id == event.id,
                    EventRegistration.student_id == student_id,
                ).first()
                if exists:
                    regs_skipped_existing += 1
                    continue
                db.add(EventRegistration(
                    event_id=event.id,
                    student_id=student_id,
                    registered_at=registered_at,
                ))
                regs_created += 1

            att_created = 0
            att_skipped_existing = 0
            for business_id, time_in, time_out, old_status in old_attendance:
                student_id = business_id_to_student_id.get(business_id)
                if not student_id:
                    skipped_unknown.add(business_id)
                    continue
                exists = db.query(Attendance).filter(
                    Attendance.event_id == event.id,
                    Attendance.student_id == student_id,
                ).first()
                if exists:
                    att_skipped_existing += 1
                    continue
                db.add(Attendance(
                    event_id=event.id,
                    student_id=student_id,
                    time_in=time_in,
                    time_out=time_out,
                    status=old_status,
                ))
                att_created += 1

            if not commit:
                db.rollback()
        except Exception:
            db.rollback()
            raise
        else:
            if commit:
                db.commit()

        print(f"Mode: {'COMMITTED' if commit else 'DRY RUN (rolled back)'}")
        print(f"Event: {'created' if event_created else 'already existed'} - {EVENT_NAME}")
        print(f"Registrations created: {regs_created}")
        print(f"Registrations already existing (skipped): {regs_skipped_existing}")
        print(f"Attendance rows created: {att_created}")
        print(f"Attendance rows already existing (skipped): {att_skipped_existing}")
        print(f"Business student_ids with no match in current database: {sorted(skipped_unknown)}")
        unexpected = skipped_unknown - KNOWN_DUMMY_IDS
        if unexpected:
            print(f"WARNING - unexpected unmatched ids (not the known dummy row): {sorted(unexpected)}")
    new_engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Commit changes; default is rollback")
    args = parser.parse_args()
    migrate(args.commit)
