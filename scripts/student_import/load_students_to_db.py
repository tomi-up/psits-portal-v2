"""
Bulk-loads the validated roster CSV into the real students / student_school_years
tables in Supabase Postgres.

Reads private_data/import_preview/normalized_students_preview.csv - the
already-reviewed output of import_students.py. Does NOT re-parse the Excel
workbook, keeping the two stages decoupled.

Safety:
- Dry-run by default (writes are computed, then rolled back). Pass --commit
  to actually write.
- Idempotent: re-running is a no-op for anything already imported (matched
  by Student.student_id, then by (student_id, school_year_id) for the
  enrollment row).
- Never creates a new Program row - if any valid row's course doesn't
  resolve to an existing program, the whole run aborts before writing
  anything.
- Never prints bulk student data to the terminal - aggregate counts only.
- All existing-record lookups are bulk-prefetched once (not one query per
  row) - a per-row SELECT loop over 700+ students against a remote Supabase
  pooler is slow enough to look hung.

Run from backend/ (so .env resolves):
    cd backend
    python ../scripts/student_import/load_students_to_db.py           # dry run
    python ../scripts/student_import/load_students_to_db.py --commit  # writes
"""

import argparse
import csv
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.student import Student, StudentSchoolYear, SchoolYear, Program  # noqa: E402

CSV_PATH = PROJECT_ROOT / "private_data" / "import_preview" / "normalized_students_preview.csv"
REPORT_PATH = PROJECT_ROOT / "private_data" / "import_preview" / "db_import_report.txt"

YEAR_LABEL_TO_INT = {"1ST": 1, "2ND": 2, "3RD": 3, "4TH": 4}
TARGET_SCHOOL_YEAR_LABEL = "2026-2027"

# Own engine, echo forced off regardless of settings.debug - this script
# processes 700+ rows and per-query SQL echo makes that output unreadable
# (and, piped through a buffering shell, can look like the process hung).
engine = create_engine(settings.database_url, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=True, bind=engine)


def load_csv_rows() -> list[dict]:
    if not CSV_PATH.exists():
        print(f"STOP: preview CSV not found at {CSV_PATH}")
        print("Run scripts/student_import/import_students.py first.")
        sys.exit(1)
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main(commit: bool) -> None:
    rows = load_csv_rows()
    valid_rows = [r for r in rows if r["is_valid"] == "True"]
    skipped_invalid = len(rows) - len(valid_rows)

    db = SessionLocal()
    created_students = 0
    created_enrollments = 0
    already_present = 0
    row_errors: list[str] = []

    try:
        school_year = db.query(SchoolYear).filter(SchoolYear.label == TARGET_SCHOOL_YEAR_LABEL).first()
        if not school_year:
            print(f"STOP: school_years row for '{TARGET_SCHOOL_YEAR_LABEL}' not found.")
            print("Run app/scripts/add_academic_standing_and_2026_school_year.py first.")
            sys.exit(1)

        programs_by_code = {p.code.upper(): p for p in db.query(Program).all()}

        # Pre-flight: every valid row's course must resolve BEFORE anything is written.
        unmapped_courses = {r["course"] for r in valid_rows if r["course"].upper() not in programs_by_code}
        if unmapped_courses:
            print(f"STOP: unmapped course value(s), nothing written: {sorted(unmapped_courses)}")
            print("This importer never creates a new Program row - map or add it manually first.")
            sys.exit(1)

        # Bulk-prefetch once, instead of a SELECT per row.
        print("Prefetching existing students/enrollments...")
        students_by_student_id = {s.student_id: s for s in db.query(Student).all()}
        enrolled_student_ids_this_year = {
            ssy.student_id
            for ssy in db.query(StudentSchoolYear).filter(StudentSchoolYear.school_year_id == school_year.id).all()
        }
        print(
            f"Prefetched {len(students_by_student_id)} existing students, "
            f"{len(enrolled_student_ids_this_year)} already enrolled for {TARGET_SCHOOL_YEAR_LABEL}."
        )

        print(f"Processing {len(valid_rows)} valid roster rows...")
        for row in valid_rows:
            try:
                student = students_by_student_id.get(row["student_id"])
                if student is None:
                    student = Student(
                        id=str(uuid.uuid4()),
                        student_id=row["student_id"],
                        first_name=row["first_name"],
                        middle_name=row["middle_name"] or None,
                        last_name=row["last_name"],
                        # Explicit - this column means "completed MFA activation",
                        # defaults to True on the model, and none of these
                        # students have activated yet.
                        is_active=False,
                    )
                    db.add(student)
                    students_by_student_id[row["student_id"]] = student
                    created_students += 1

                if student.id in enrolled_student_ids_this_year:
                    already_present += 1
                    continue

                program = programs_by_code[row["course"].upper()]
                is_over_stay = row["is_over_stay"] == "True"
                year_level = 4 if is_over_stay else YEAR_LABEL_TO_INT[row["year_level"].upper()]
                academic_standing = "OVER_STAY" if is_over_stay else "REGULAR"

                db.add(
                    StudentSchoolYear(
                        id=str(uuid.uuid4()),
                        student_id=student.id,
                        school_year_id=school_year.id,
                        program_id=program.id,
                        year_level=year_level,
                        section=row["section"],
                        status="ACTIVE",
                        academic_standing=academic_standing,
                    )
                )
                enrolled_student_ids_this_year.add(student.id)
                created_enrollments += 1
            except Exception as exc:
                row_errors.append(f"sheet={row['source_sheet']} row={row['source_row']}: {exc}")

        if row_errors:
            print(f"STOP: {len(row_errors)} row-level error(s) building records - nothing written.")
            db.rollback()
        elif commit:
            print("Committing...")
            db.commit()
        else:
            print("Dry run - rolling back...")
            db.rollback()
    finally:
        db.close()

    mode = "COMMITTED" if (commit and not row_errors) else "DRY RUN / ABORTED (rolled back - nothing written)"
    report_lines = [
        "PSITS STUDENT DB IMPORT",
        f"Mode: {mode}",
        "",
        f"CSV rows total: {len(rows)}",
        f"Valid rows processed: {len(valid_rows)}",
        f"Skipped (invalid in CSV, e.g. missing Student ID): {skipped_invalid}",
        f"New students created: {created_students}",
        f"New enrollments created: {created_enrollments}",
        f"Already present (skipped): {already_present}",
        f"Row-level errors: {len(row_errors)}",
    ]
    if row_errors:
        report_lines.append("")
        report_lines.append("Row-level errors (row numbers only, no PII):")
        report_lines.extend(f"  {e}" for e in row_errors)

    report_text = "\n".join(report_lines)
    print(report_text)

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report_text, encoding="utf-8")
    print(f"\n[written] {REPORT_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Actually write. Without this flag, runs as a dry-run and rolls back.",
    )
    args = parser.parse_args()
    main(commit=args.commit)
