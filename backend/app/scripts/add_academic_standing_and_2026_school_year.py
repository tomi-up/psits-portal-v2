"""Schema change for the SY 2026-2027 real-roster migration.

Additive/idempotent only - safe to re-run. This does NOT insert any student
data; it only prepares the schema and school-year row the bulk importer
(scripts/student_import/load_students_to_db.py) needs, and enables RLS on
the four tables PostgREST would otherwise expose via the public anon key.

Run from backend/ so `.env` resolves:
    python -m app.scripts.add_academic_standing_and_2026_school_year
"""

from sqlalchemy import create_engine, text
import logging
import uuid
from datetime import datetime, timezone

from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> bool:
    engine = create_engine(settings.database_url)

    with engine.begin() as conn:
        logger.info("Connecting...")
        conn.execute(text("SELECT 1"))

        # --- academic_standing column ---------------------------------
        # Distinct from two existing "status" fields that mean something
        # else entirely:
        #   - Student.is_active        -> has the student completed MFA
        #                                  activation (gates login)
        #   - StudentSchoolYear.status -> enrollment ACTIVE/INACTIVE
        # academic_standing is REGULAR / IRREGULAR / OVER_STAY - the
        # roster's per-year academic standing, independent of the above.
        logger.info("Adding student_school_years.academic_standing (if missing)...")
        conn.execute(text("""
            ALTER TABLE student_school_years
            ADD COLUMN IF NOT EXISTS academic_standing VARCHAR(20) NOT NULL DEFAULT 'REGULAR'
        """))

        # --- 2026-2027 school year -------------------------------------
        logger.info("Ensuring school_years row for 2026-2027 exists...")
        conn.execute(
            text("""
                INSERT INTO school_years (id, label, start_date, end_date, is_active, created_at, updated_at)
                VALUES (:id, :label, :start_date, :end_date, TRUE, now(), now())
                ON CONFLICT (label) DO NOTHING
            """),
            {
                "id": str(uuid.uuid4()),
                "label": "2026-2027",
                "start_date": datetime(2026, 8, 1, tzinfo=timezone.utc),
                "end_date": datetime(2027, 5, 31, tzinfo=timezone.utc),
            },
        )

        logger.info("Marking 2026-2027 as the only active school year...")
        conn.execute(text("""
            UPDATE school_years SET is_active = (label = '2026-2027')
        """))

        # --- RLS ----------------------------------------------------------
        # No CREATE POLICY: RLS enabled + zero policies = deny-all for every
        # role subject to RLS (anon, authenticated via PostgREST). The
        # backend's own connection uses the Supavisor pooler `postgres` role,
        # which bypasses RLS regardless (superuser-equivalent) - this only
        # closes off direct anon-key REST access to these tables.
        for table in ("students", "student_school_years", "school_years", "programs"):
            logger.info(f"Enabling RLS on {table}...")
            conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))

    logger.info("Done.")
    return True


if __name__ == "__main__":
    main()
