"""Schema change: admin_accounts.security_stamp, so a password change can
invalidate every previously-issued admin JWT instead of leaving them valid
for up to 12 hours (their current unconditional expiry).

Additive/idempotent only - safe to re-run.

Run from backend/ so `.env` resolves:
    python -m app.scripts.add_admin_security_stamp_column
"""

from sqlalchemy import create_engine, text
import logging

from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> bool:
    engine = create_engine(settings.database_url, hide_parameters=True)

    with engine.begin() as conn:
        logger.info("Connecting...")
        conn.execute(text("SELECT 1"))

        logger.info("Adding admin_accounts.security_stamp (if missing)...")
        # md5(random()::text) needs no extension (unlike gen_random_uuid())
        # and gives every existing row a distinct value, not one shared
        # default - which would otherwise let one admin's token pass as
        # valid for every other admin until they each changed their password.
        conn.execute(text("""
            ALTER TABLE admin_accounts
            ADD COLUMN IF NOT EXISTS security_stamp VARCHAR(36) NOT NULL
            DEFAULT md5(random()::text)
        """))

    logger.info("Done.")
    logger.warning(
        "Every admin's existing session token is now invalid (none carry a "
        "security_stamp claim) - each admin must sign in again."
    )
    return True


if __name__ == "__main__":
    main()
