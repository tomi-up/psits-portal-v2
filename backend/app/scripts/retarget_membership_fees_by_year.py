"""Reassign which school year each student's membership fee belongs to:

- 1st year students (as of their current 2026-2027 enrollment): keep their
  2026-2027 fees. They just joined - 2026-2027 is the only year they owe.
- 2nd-4th year students: their 2026-2027 fees are re-pointed to 2025-2026
  instead - they already belong to the org, and 2025-2026 is the year
  being backfilled for them, not 2026-2027.

Re-points MembershipFee.school_year_id in place rather than deleting and
recreating rows, so a fee's id, amount_paid, and any Payment rows tied to it
(there are none today - checked before writing this) survive untouched.

Dry-run by default; --commit to actually write.
"""

import argparse

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.balance import MembershipFee, Payment
from app.models.student import SchoolYear, Student, StudentSchoolYear

FROM_YEAR_LABEL = "2026-2027"
TO_YEAR_LABEL = "2025-2026"


def retarget(commit: bool) -> None:
    if settings.environment.lower() != "staging":
        raise ValueError("Refusing to run: ENVIRONMENT must be staging")

    engine = create_engine(settings.database_url, pool_pre_ping=True, hide_parameters=True)
    with Session(engine) as db:
        try:
            from_year = db.query(SchoolYear).filter(SchoolYear.label == FROM_YEAR_LABEL).first()
            to_year = db.query(SchoolYear).filter(SchoolYear.label == TO_YEAR_LABEL).first()
            if not from_year or not to_year:
                raise ValueError(f"Both {FROM_YEAR_LABEL} and {TO_YEAR_LABEL} must already exist")

            # Current enrollment year_level, keyed by student.id - this is
            # each student's year level *as of {FROM_YEAR_LABEL}*, which is
            # the only enrollment record most of them have.
            year_level_by_student = {
                ssy.student_id: ssy.year_level
                for ssy in db.query(StudentSchoolYear).filter(
                    StudentSchoolYear.school_year_id == from_year.id
                )
            }

            fees = (
                db.query(MembershipFee)
                .filter(MembershipFee.school_year_id == from_year.id)
                .all()
            )

            to_retarget = [f for f in fees if year_level_by_student.get(f.student_id) != 1]
            kept = len(fees) - len(to_retarget)

            retarget_ids = {f.id for f in to_retarget}
            payments_moved = (
                db.query(Payment).filter(Payment.membership_fee_id.in_(retarget_ids)).count()
                if retarget_ids else 0
            )

            for fee in to_retarget:
                fee.school_year_id = to_year.id

            if not commit:
                db.rollback()
        except Exception:
            db.rollback()
            raise
        else:
            if commit:
                db.commit()

        print(f"Mode: {'COMMITTED' if commit else 'DRY RUN (rolled back)'}")
        print(f"{FROM_YEAR_LABEL} fee rows kept (1st year): {kept}")
        print(f"{FROM_YEAR_LABEL} fee rows moved to {TO_YEAR_LABEL} (2nd-4th year): {len(to_retarget)}")
        print(f"Payment rows carried along with the move: {payments_moved}")
    engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Commit changes; default is rollback")
    args = parser.parse_args()
    retarget(args.commit)
