"""Load 2nd, 3rd, and 4th year students from the attendance workbook into
staging. Dry-run unless --commit is used. Companion to
prepare_first_year_launch.py, which only handles the 1ST YR sheet.

Safety checks (all driven by what's actually in the database, not a
hardcoded list of IDs - so this stays correct if the source workbook changes):

- A Student ID already in the database but attached to a different name is
  skipped entirely and reported - almost always a typo in one of the two
  rows in the source spreadsheet, never auto-resolved here.
- A Student ID that already has an enrollment for this school year at a
  *different* year level is skipped entirely and reported, rather than
  silently overwriting which year they're actually in.
- An email already used by a different Student ID (in the database, or
  elsewhere in this same import) is dropped for the new row instead of
  being assigned - duplicate emails break Google Sign-In's account binding.

Only aggregate counts and the specific Student IDs that were skipped print to
the console - never names or emails - so this script's own output can't leak
student data even if it ends up in a log somewhere.
"""

import argparse
import re
import uuid
from decimal import Decimal
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.balance import MembershipFee
from app.models.student import Program, SchoolYear, Student, StudentSchoolYear

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ATTENDANCE_WORKBOOK = PROJECT_ROOT / "private_data" / "psits_attendance_with_emails.xlsx"
SCHOOL_YEAR_LABEL = "2026-2027"
FEE_AMOUNT = Decimal("100.00")
SEMESTERS = ("1ST", "2ND")
PROGRAM_NAMES = {
    "BSCS": "Bachelor of Science in Computer Science",
    "BSIT": "Bachelor of Science in Information Technology",
    "BLIS": "Bachelor of Library and Information Science",
    "BSINFOSYS": "Bachelor of Science in Information Systems",
    "BSCA": "Bachelor of Science in Computer Applications",
}

# sheet name -> (year_level, {sheet YEAR-column value: academic_standing})
SHEET_CONFIG = {
    "2ND YR": (2, {"2ND": "REGULAR"}),
    "3RD YR": (3, {"3RD": "REGULAR"}),
    "4TH YR": (4, {"4TH": "REGULAR", "OS": "OVER_STAY"}),
}


def _norm_name(first: str, last: str) -> str:
    return re.sub(r"[^A-Z]", "", f"{first}{last}".upper())


def load_sheet(sheet_name: str, year_standings: dict[str, str]) -> list[dict[str, object]]:
    if not ATTENDANCE_WORKBOOK.exists():
        raise ValueError(f"Attendance workbook not found: {ATTENDANCE_WORKBOOK}")

    workbook = load_workbook(ATTENDANCE_WORKBOOK, read_only=True, data_only=True)
    sheet = workbook[sheet_name]
    records: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    seen_emails: set[str] = set()
    for row in sheet.iter_rows(min_row=8, values_only=True):
        student_id = str(row[1] or "").strip().upper()
        if not re.fullmatch(r"\d{2}-\d{5}", student_id):
            continue
        year_tag = str(row[5] or "").strip().upper()
        if year_tag not in year_standings:
            continue

        values = {
            "student_id": student_id,
            "last_name": str(row[2] or "").strip().upper(),
            "first_name": str(row[3] or "").strip().upper(),
            "middle_name": str(row[4] or "").strip().upper() or None,
            "course": str(row[6] or "").strip().upper(),
            "section": str(row[7] or "").strip().upper(),
            "email": str(row[8] or "").strip().lower(),
            "academic_standing": year_standings[year_tag],
        }
        required = ("last_name", "first_name", "course", "section")
        if any(not values[field] for field in required):
            continue

        email = str(values["email"])
        if email and not email.endswith("@usm.edu.ph"):
            raise ValueError(f"{sheet_name}: an email is outside the required @usm.edu.ph domain")
        if student_id in seen_ids or (email and email in seen_emails):
            raise ValueError(f"{sheet_name}: duplicate Student ID or email within the sheet")
        seen_ids.add(student_id)
        if email:
            seen_emails.add(email)
        else:
            values["email"] = None
        records.append(values)
    return records


def import_students(commit: bool) -> None:
    if settings.environment.lower() != "staging":
        raise ValueError("Refusing to run: ENVIRONMENT must be staging")

    sheet_rows: dict[str, list[dict[str, object]]] = {}
    for sheet_name, (_, year_standings) in SHEET_CONFIG.items():
        sheet_rows[sheet_name] = load_sheet(sheet_name, year_standings)

    # A Student ID or email appearing in more than one of these sheets is
    # ambiguous (which year is it?) - stop rather than guess.
    all_ids: dict[str, str] = {}
    all_emails: dict[str, str] = {}
    for sheet_name, rows in sheet_rows.items():
        for row in rows:
            sid = str(row["student_id"])
            if sid in all_ids:
                raise ValueError(f"Student ID {sid} appears in both {all_ids[sid]} and {sheet_name}")
            all_ids[sid] = sheet_name
            email = row.get("email")
            if email:
                email = str(email)
                if email in all_emails:
                    raise ValueError(f"An email appears in both {all_emails[email]} and {sheet_name}")
                all_emails[email] = sheet_name

    counts = {key: 0 for key in (
        "students_created", "students_updated", "enrollments_created",
        "enrollments_updated", "fees_created", "programs_created",
        "id_mismatch_skipped", "year_conflict_skipped", "email_collision_dropped",
    )}
    skipped_ids = {"id_mismatch": [], "year_conflict": []}

    # hide_parameters: a failed query's exception normally echoes back its
    # bound values (names, emails, ...) - this keeps student data out of any
    # traceback this script ever prints or logs, even on an unexpected error.
    target_engine = create_engine(settings.database_url, pool_pre_ping=True, hide_parameters=True)
    with Session(target_engine) as db:
        try:
            school_year = db.query(SchoolYear).filter(SchoolYear.label == SCHOOL_YEAR_LABEL).first()
            if not school_year:
                raise ValueError(f"School year {SCHOOL_YEAR_LABEL} does not exist in staging")

            programs = {program.code.upper(): program for program in db.query(Program).all()}
            all_courses = {str(row["course"]) for rows in sheet_rows.values() for row in rows}
            missing_programs = all_courses - set(programs)
            unknown_programs = missing_programs - set(PROGRAM_NAMES)
            if unknown_programs:
                raise ValueError(f"Unknown source programs: {sorted(unknown_programs)}")
            for code in sorted(missing_programs):
                program = Program(id=str(uuid.uuid4()), code=code, name=PROGRAM_NAMES[code])
                db.add(program)
                programs[code] = program
                counts["programs_created"] += 1

            # Whole-database maps, not just matching incoming IDs: an email
            # collision can be against ANY existing student, e.g. the 1st-year
            # roster this import doesn't otherwise touch.
            existing_by_id = {s.student_id: s for s in db.query(Student).all()}
            existing_email_owner = {
                s.email.lower(): s.student_id for s in existing_by_id.values() if s.email
            }
            claimed_emails_this_run: dict[str, str] = {}

            # Batch-load once, outside the loop, exactly like
            # prepare_first_year_launch.py - a per-row query here turns into
            # ~1,800 round trips to the Supabase pooler for 468 rows (2
            # lookups + an autoflush-triggered reflush each), which is slow
            # enough to time out the connection mid-import.
            existing_db_ids = [s.id for s in existing_by_id.values()]
            existing_enrollments = {
                e.student_id: e
                for e in db.query(StudentSchoolYear)
                .filter(
                    StudentSchoolYear.school_year_id == school_year.id,
                    StudentSchoolYear.student_id.in_(existing_db_ids),
                )
                .all()
            }
            existing_fees = {
                (f.student_id, f.semester): f
                for f in db.query(MembershipFee)
                .filter(
                    MembershipFee.school_year_id == school_year.id,
                    MembershipFee.student_id.in_(existing_db_ids),
                )
                .all()
            }

            for sheet_name, (year_level, _) in SHEET_CONFIG.items():
                for row in sheet_rows[sheet_name]:
                    student_id = str(row["student_id"])
                    email = row.get("email")
                    email = str(email) if email else None

                    student = existing_by_id.get(student_id)
                    if student is not None:
                        if _norm_name(student.first_name, student.last_name) != _norm_name(
                            str(row["first_name"]), str(row["last_name"])
                        ):
                            counts["id_mismatch_skipped"] += 1
                            skipped_ids["id_mismatch"].append(student_id)
                            continue

                        existing_enrollment = existing_enrollments.get(student.id)
                        if existing_enrollment is not None and existing_enrollment.year_level != year_level:
                            counts["year_conflict_skipped"] += 1
                            skipped_ids["year_conflict"].append(student_id)
                            continue
                    else:
                        existing_enrollment = None

                    if email:
                        owner = existing_email_owner.get(email) or claimed_emails_this_run.get(email)
                        if owner and owner != student_id:
                            counts["email_collision_dropped"] += 1
                            email = None

                    if student is None:
                        student = Student(
                            id=str(uuid.uuid4()), student_id=student_id,
                            first_name=str(row["first_name"]), middle_name=row.get("middle_name"),
                            last_name=str(row["last_name"]), email=email, is_active=False,
                        )
                        db.add(student)
                        existing_by_id[student_id] = student
                        counts["students_created"] += 1
                    else:
                        changed = False
                        for field in ("first_name", "middle_name", "last_name"):
                            if getattr(student, field) != row.get(field):
                                setattr(student, field, row.get(field))
                                changed = True
                        if email and student.email != email:
                            student.email = email
                            changed = True
                        counts["students_updated"] += int(changed)

                    if email:
                        claimed_emails_this_run[email] = student_id

                    program = programs[str(row["course"])]
                    desired = (
                        program.id, year_level, row.get("section"), "ACTIVE", row["academic_standing"],
                    )
                    if existing_enrollment is None:
                        new_enrollment = StudentSchoolYear(
                            id=str(uuid.uuid4()), student_id=student.id, school_year_id=school_year.id,
                            program_id=desired[0], year_level=year_level, section=desired[2],
                            status=desired[3], academic_standing=desired[4],
                        )
                        db.add(new_enrollment)
                        existing_enrollments[student.id] = new_enrollment
                        counts["enrollments_created"] += 1
                    else:
                        current = (
                            existing_enrollment.program_id, existing_enrollment.year_level,
                            existing_enrollment.section, existing_enrollment.status,
                            existing_enrollment.academic_standing,
                        )
                        if current != desired:
                            (existing_enrollment.program_id, existing_enrollment.year_level,
                             existing_enrollment.section, existing_enrollment.status,
                             existing_enrollment.academic_standing) = desired
                            counts["enrollments_updated"] += 1

                    for semester in SEMESTERS:
                        if (student.id, semester) not in existing_fees:
                            new_fee = MembershipFee(
                                id=str(uuid.uuid4()), student_id=student.id,
                                school_year_id=school_year.id, semester=semester,
                                amount_due=FEE_AMOUNT, amount_paid=Decimal("0.00"),
                            )
                            db.add(new_fee)
                            existing_fees[(student.id, semester)] = new_fee
                            counts["fees_created"] += 1

            db.flush()
            db.commit() if commit else db.rollback()
        except Exception:
            db.rollback()
            raise
    target_engine.dispose()

    print(f"Mode: {'COMMITTED' if commit else 'DRY RUN (rolled back)'}")
    for sheet_name in SHEET_CONFIG:
        print(f"{sheet_name} source records: {len(sheet_rows[sheet_name])}")
    for key, value in counts.items():
        print(f"{key}: {value}")
    if skipped_ids["id_mismatch"]:
        print(f"Student IDs with a name mismatch against the database (not imported): {sorted(skipped_ids['id_mismatch'])}")
    if skipped_ids["year_conflict"]:
        print(f"Student IDs with a conflicting existing enrollment this school year (not imported): {sorted(skipped_ids['year_conflict'])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Commit changes; default is rollback")
    args = parser.parse_args()
    import_students(args.commit)
