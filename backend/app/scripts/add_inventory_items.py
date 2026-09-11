"""Schema migration for inventory_items.

The table's shape changed while empty (rebuilt to match the chapter's real
Property Inventory report - Forwarded/New records, fund_source, accountable
officers - rather than the earlier bought/donated design), so this drops and
recreates it rather than trying to ALTER a stale column set. Refuses to run
if the table already has rows, since that would silently discard them.

    python -m app.scripts.add_inventory_items
"""

import logging
import sys

from sqlalchemy import create_engine, text

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

    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT to_regclass('public.inventory_items')")
        ).scalar()
        row_count = 0
        if exists:
            row_count = conn.execute(text("SELECT COUNT(*) FROM inventory_items")).scalar()

    if row_count:
        logger.error(
            "inventory_items has %s row(s) - refusing to drop it automatically. "
            "This script only handles the empty-table case.",
            row_count,
        )
        engine.dispose()
        return

    if not assume_yes:
        answer = input(
            f"Recreate inventory_items on '{ref}' with the new schema (table is empty)? [y/N] "
        ).strip().lower()
        if answer != "y":
            logger.info("Aborted - nothing was changed.")
            engine.dispose()
            return

    from app.models.base import Base
    import app.models.student  # noqa: F401 - SchoolYear FK target
    import app.models.inventory  # noqa: F401 - registers the table

    if exists:
        logger.info("Dropping old inventory_items...")
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE inventory_items"))

    logger.info("Creating inventory_items with the current schema...")
    Base.metadata.create_all(bind=engine)
    logger.info("Done.")

    engine.dispose()


if __name__ == "__main__":
    run(assume_yes="--yes" in sys.argv)
