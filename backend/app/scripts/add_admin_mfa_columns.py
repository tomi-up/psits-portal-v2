"""Schema change for admin TOTP 2FA.

Additive/idempotent only - safe to re-run.

Run from backend/ so `.env` resolves:
    python -m app.scripts.add_admin_mfa_columns
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

        logger.info("Adding admin_accounts.totp_secret (if missing)...")
        conn.execute(text("""
            ALTER TABLE admin_accounts
            ADD COLUMN IF NOT EXISTS totp_secret TEXT
        """))

        logger.info("Adding admin_accounts.mfa_enabled (if missing)...")
        conn.execute(text("""
            ALTER TABLE admin_accounts
            ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE
        """))

    logger.info("Done.")
    return True


if __name__ == "__main__":
    main()
