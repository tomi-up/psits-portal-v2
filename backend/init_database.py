"""Initialize Supabase PostgreSQL database for PSITS Portal V2."""

import sys
import uuid
from sqlalchemy import create_engine, text
from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

def main():
    logger.info("=" * 70)
    logger.info("PSITS Portal V2 - Database Initialization")
    logger.info("=" * 70)

    engine = create_engine(settings.database_url, echo=False)

    try:
        with engine.begin() as conn:
            logger.info("\n[1/3] Testing database connection...")
            conn.execute(text("SELECT 1"))
            logger.info("✓ Connected to Supabase PostgreSQL")

            logger.info("\n[2/3] Creating tables...")

            # Create users table
            conn.execute(text(
                "CREATE TABLE IF NOT EXISTS users ("
                "id VARCHAR(36) PRIMARY KEY, "
                "email VARCHAR(255) UNIQUE NOT NULL, "
                "password_hash VARCHAR(255) NOT NULL, "
                "is_active BOOLEAN DEFAULT TRUE, "
                "status VARCHAR(20) DEFAULT 'ACTIVE', "
                "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                ")"
            ))
            logger.info("  ✓ users")

            # Create other tables
            conn.execute(text(
                "CREATE TABLE IF NOT EXISTS profiles ("
                "id VARCHAR(36) PRIMARY KEY, "
                "user_id VARCHAR(36) UNIQUE, "
                "full_name VARCHAR(255), "
                "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                ")"
            ))
            logger.info("  ✓ profiles")

            conn.execute(text(
                "CREATE TABLE IF NOT EXISTS permissions ("
                "id VARCHAR(36) PRIMARY KEY, "
                "code VARCHAR(100) UNIQUE NOT NULL, "
                "description TEXT, "
                "category VARCHAR(50)"
                ")"
            ))
            logger.info("  ✓ permissions")

            conn.execute(text(
                "CREATE TABLE IF NOT EXISTS roles ("
                "id VARCHAR(36) PRIMARY KEY, "
                "name VARCHAR(100) UNIQUE NOT NULL, "
                "description TEXT, "
                "is_active BOOLEAN DEFAULT TRUE"
                ")"
            ))
            logger.info("  ✓ roles")

            logger.info("\n[3/3] Initializing roles and permissions...")

            # Insert 13 roles
            roles_list = [
                ("President", "Organization President"),
                ("VP Internal", "Vice President - Internal"),
                ("VP External", "Vice President - External"),
                ("Secretary", "Organization Secretary"),
                ("Assistant Secretary", "Assistant Secretary"),
                ("Membership & Welfare Committee", "Membership & Welfare Chair"),
                ("Events & Logistics Committee", "Events & Logistics Chair"),
                ("PIO", "Public Information Officer"),
                ("Treasurer", "Organization Treasurer"),
                ("Assistant Treasurer", "Assistant Treasurer"),
                ("Finance Committee", "Finance Committee Chair"),
                ("Admin", "System Administrator"),
                ("Student", "Student Member"),
            ]

            for name, desc in roles_list:
                try:
                    conn.execute(text(
                        "INSERT INTO roles (id, name, description) "
                        "VALUES (:id, :name, :desc) "
                        "ON CONFLICT DO NOTHING"
                    ), {"id": str(uuid.uuid4()), "name": name, "desc": desc})
                except:
                    pass

            logger.info(f"  ✓ {len(roles_list)} roles created")

            # Insert permissions
            perms = ["organization.view", "organization.update", "events.view",
                     "events.create", "events.update", "attendance.scan",
                     "membership.view", "payments.create", "users.manage",
                     "students.import", "reports.view", "audit_logs.view"]

            for perm_code in perms:
                try:
                    conn.execute(text(
                        "INSERT INTO permissions (id, code, category) "
                        "VALUES (:id, :code, :cat) "
                        "ON CONFLICT DO NOTHING"
                    ), {
                        "id": str(uuid.uuid4()),
                        "code": perm_code,
                        "cat": perm_code.split(".")[0]
                    })
                except:
                    pass

            logger.info(f"  ✓ {len(perms)} key permissions created")

            logger.info("\n" + "=" * 70)
            logger.info("✓ Database initialization successful!")
            logger.info("✓ Tables created")
            logger.info(f"✓ {len(roles_list)} roles initialized")
            logger.info("✓ Permissions ready")
            logger.info("\nNext: Start the backend server")
            logger.info("  python -m uvicorn app.main:app --reload")
            logger.info("\nAPI Docs: http://localhost:8000/api/docs")
            logger.info("=" * 70)
            return 0

    except Exception as e:
        logger.error(f"\n✗ Initialization failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
