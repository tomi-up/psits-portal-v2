"""Schema migration for the 3-checkpoint attendance workflow.

This project manages schema with Base.metadata.create_all rather than Alembic.
create_all creates MISSING TABLES but never adds a column to an existing one,
so the new tables come from create_all and the four new events columns need
explicit ALTERs here.

Idempotent - every statement is IF NOT EXISTS, so re-running is a no-op.

    python -m app.scripts.add_checkpoint_attendance

Prints which Supabase project it is about to touch and refuses to proceed
without confirmation, because "which database is this .env pointed at" is not
a question worth getting wrong once.
"""

import logging
import sys

from sqlalchemy import create_engine, text

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# events columns that create_all cannot add to the existing table.
EVENT_COLUMNS = [
    ("event_code", "VARCHAR(12)"),
    ("attendance_phase", "VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED'"),
    ("late_threshold_minutes", "INTEGER NOT NULL DEFAULT 20"),
]


def _project_ref() -> str:
    """The Supabase project ref embedded in the connection string."""
    url = settings.database_url
    if "postgres." in url:
        return url.split("postgres.")[1].split(":")[0]
    return "(unknown - not a Supabase pooler URL)"


def run(assume_yes: bool = False) -> None:
    ref = _project_ref()
    logger.info("Target database project ref: %s", ref)

    if not assume_yes:
        answer = input(f"Apply checkpoint attendance schema to '{ref}'? [y/N] ").strip().lower()
        if answer != "y":
            logger.info("Aborted - nothing was changed.")
            return

    engine = create_engine(settings.database_url)

    # New tables: officers, event_officer_assignments, scanner_sessions,
    # attendance_checkpoint_scans, event_attendance_phase_logs. Importing the
    # module registers them on the shared metadata; create_all skips every
    # table that already exists.
    from app.models.base import Base
    import app.models.admin  # noqa: F401
    import app.models.event  # noqa: F401
    import app.models.officer  # noqa: F401
    import app.models.student  # noqa: F401
    import app.models.survey  # noqa: F401

    logger.info("Creating any missing tables...")
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        for column, definition in EVENT_COLUMNS:
            logger.info("Ensuring events.%s ...", column)
            conn.execute(text(f"ALTER TABLE events ADD COLUMN IF NOT EXISTS {column} {definition}"))

        # event_officer_assignments started as (course, section) where section
        # meant a combined "1A" string; split into course + year_level +
        # section as three independent fields. Both tables this touches were
        # empty when this ran, so no data migration was needed - if that ever
        # changes, this block must be revisited before reapplying.
        logger.info("Ensuring event_officer_assignments.year_level ...")
        conn.execute(
            text(
                "ALTER TABLE event_officer_assignments "
                "ADD COLUMN IF NOT EXISTS year_level INTEGER"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE event_officer_assignments "
                "DROP CONSTRAINT IF EXISTS uq_event_officer_assignment"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE event_officer_assignments "
                "ALTER COLUMN year_level SET NOT NULL"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE event_officer_assignments "
                "ADD CONSTRAINT uq_event_officer_assignment "
                "UNIQUE (event_id, officer_id, course, year_level, section)"
            )
        )

        for column in ("officer_year_level", "student_year_level"):
            logger.info("Ensuring attendance_checkpoint_scans.%s ...", column)
            conn.execute(
                text(
                    f"ALTER TABLE attendance_checkpoint_scans "
                    f"ADD COLUMN IF NOT EXISTS {column} INTEGER"
                )
            )

        # Unique index rather than a table constraint so IF NOT EXISTS works.
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_events_event_code "
                "ON events (event_code) WHERE event_code IS NOT NULL"
            )
        )

        # Backfill a code for events that predate the column, so an organiser
        # can switch an existing event onto checkpoint scanning without
        # editing and re-saving it first.
        missing = conn.execute(
            text("SELECT COUNT(*) FROM events WHERE event_code IS NULL")
        ).scalar()
        if missing:
            logger.info("Backfilling event_code for %s existing event(s)...", missing)
            conn.execute(
                text(
                    """
                    UPDATE events
                    SET event_code = UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 6))
                    WHERE event_code IS NULL
                    """
                )
            )

    logger.info("Done.")
    engine.dispose()


if __name__ == "__main__":
    run(assume_yes="--yes" in sys.argv)
