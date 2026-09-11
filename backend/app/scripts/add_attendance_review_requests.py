"""Schema migration: creates the attendance_review_requests table.

This project manages schema with Base.metadata.create_all rather than
Alembic, which creates MISSING TABLES but never alters an existing one - this
migration only needs the former, since this is a brand new table.

Idempotent - create_all skips any table that already exists.

    python -m app.scripts.add_attendance_review_requests

Prints which Supabase project it is about to touch and refuses to proceed
without confirmation, same as the other one-off scripts in this directory.
"""

import logging
import sys

from sqlalchemy import create_engine

from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def _project_ref() -> str:
    url = settings.database_url
    if "postgres." in url:
        return url.split("postgres.")[1].split(":")[0]
    return "(unknown - not a Supabase pooler URL)"


def run(assume_yes: bool = False) -> None:
    ref = _project_ref()
    logger.info("Target database project ref: %s", ref)

    if not assume_yes:
        answer = input(f"Create attendance_review_requests on '{ref}'? [y/N] ").strip().lower()
        if answer != "y":
            logger.info("Aborted - nothing was changed.")
            return

    engine = create_engine(settings.database_url)

    from app.models.base import Base
    import app.models.event  # noqa: F401 - Attendance FK target
    import app.models.student  # noqa: F401 - Student FK target
    import app.models.attendance_review  # noqa: F401 - registers the new table

    logger.info("Creating attendance_review_requests (skips if it already exists)...")
    Base.metadata.create_all(bind=engine)
    logger.info("Done.")

    engine.dispose()


if __name__ == "__main__":
    run(assume_yes="--yes" in sys.argv)
