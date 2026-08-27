"""Database initialization with direct SQL (Supabase Auth architecture).

Creates the auth-adjacent tables (profiles, roles, permissions, and their
join tables) and seeds them with the roles/permissions defined in
docs/RBAC_CORRECTED.md. There is no `users` table - Supabase's `auth.users`
is the identity source of truth; `profiles.auth_user_id` links to it.
"""

from sqlalchemy import create_engine, text
import logging
import uuid

from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# code -> (description, category derived from code prefix)
PERMISSIONS: dict[str, str] = {
    # Users & access management
    "users.view": "View users",
    "users.create": "Create users",
    "users.update": "Update users",
    "users.manage": "Full user lifecycle management",
    "roles.view": "View roles",
    "roles.manage": "Manage role definitions",
    "permissions.manage": "Manage role-permission assignments",

    # Organization
    "organization.view": "View organization profile",
    "organization.update": "Update organization profile",
    "directory.view": "View organizational directory",
    "directory.update": "Manage organizational directory",
    "committees.view": "View committees",
    "committees.manage": "Manage committees",

    # Events
    "events.view": "View events",
    "events.create": "Create events",
    "events.update": "Update events",
    "events.publish": "Publish events",
    "events.delete": "Delete draft events",
    "events.register": "Register for events",

    # Registrations & attendance
    "event_registrations.view": "View event registrations",
    "event_registrations.manage": "Manage event registrations",
    "attendance.view": "View attendance records",
    "attendance.scan": "Scan QR codes for attendance",
    "attendance.record": "Manually record attendance",

    # Membership
    "membership.view": "View membership ledgers",
    "membership.manage": "Manage membership ledgers and fees",
    "membership_fees.view": "View membership fee schedule",

    # Finance
    "payments.view": "View payment records",
    "payments.create": "Record new payments",
    "payments.update": "Correct payment details",
    "payments.void": "Void a payment (no hard delete)",
    "remittance.view": "View remittances",
    "remittance.create": "Create remittances",
    "remittance.update": "Update remittances",
    "remittance.approve": "Approve remittances",

    # Inventory
    "inventory.view": "View inventory assets",
    "inventory.manage": "Manage inventory assets",
    "inventory.borrow": "Borrow/return inventory assets",

    # Sanctions
    "sanctions.view": "View sanctions",
    "sanctions.create": "Issue sanctions",
    "sanctions.update": "Modify sanctions",
    "sanctions.settle": "Settle sanctions",

    # Content & communications
    "announcements.view": "View announcements",
    "announcements.create": "Create announcements",
    "announcements.update": "Edit/archive announcements",
    "content.manage": "Manage featured content",
    "content.landing": "Control landing page layout",

    # Students
    "students.view": "View students",
    "students.create": "Manually add students",
    "students.update": "Edit student records",
    "students.import": "Bulk import students from Excel",
    "students.export": "Export student data",

    # School years
    "school_years.view": "View school years",
    "school_years.manage": "Create/activate/deactivate school years",

    # Reporting
    "reports.view": "View reports",
    "reports.generate": "Generate/export reports",
    "audit_logs.view": "View audit trail",

    # System settings
    "settings.view": "View system configuration",
    "settings.manage": "Manage system configuration",

    # QR & personal
    "qr.view": "View own QR code",
    "qr.generate": "Generate QR code for an event",
    "qr.scan": "Use the QR scanner",

    # Profile
    "profile.view": "View own profile",
    "profile.update": "Update own profile",
}

# (code, name, description, order)
ROLES: list[tuple[str, str, str, int]] = [
    ("SYSTEM_ADMIN", "System Admin", "System-level administrator (not an organization executive)", 0),
    ("PRESIDENT", "President", "Organization President", 1),
    ("VP_INTERNAL", "VP Internal", "Vice President - Internal", 2),
    ("VP_EXTERNAL", "VP External", "Vice President - External", 3),
    ("SECRETARY", "Secretary", "Organization Secretary", 4),
    ("ASSISTANT_SECRETARY", "Assistant Secretary", "Assistant Secretary", 5),
    ("MW_COMMITTEE", "Membership & Welfare Committee", "Membership & Welfare Chair/members", 6),
    ("EVENTS_LOGISTICS", "Events & Logistics Committee", "Events & Logistics Chair/members", 7),
    ("PIO", "PIO", "Public Information Officer", 8),
    ("TREASURER", "Treasurer", "Organization Treasurer", 9),
    ("ASSISTANT_TREASURER", "Assistant Treasurer", "Assistant Treasurer", 10),
    ("FINANCE_COMMITTEE", "Finance Committee", "Finance Committee members", 11),
    ("STUDENT", "Student", "Student member", 12),
]

_BASELINE = ["profile.view", "profile.update"]
_EXECUTIVE_PERMISSIONS = list(PERMISSIONS.keys())  # Executives inherit everything

# code -> list of permission codes
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "SYSTEM_ADMIN": _BASELINE + [
        "users.view", "users.create", "users.update", "users.manage",
        "roles.view", "roles.manage", "permissions.manage",
        "school_years.view", "school_years.manage",
        "students.view", "students.import", "students.export",
        "audit_logs.view", "settings.view", "settings.manage",
    ],
    "PRESIDENT": _EXECUTIVE_PERMISSIONS,
    "VP_INTERNAL": _EXECUTIVE_PERMISSIONS,
    "VP_EXTERNAL": _EXECUTIVE_PERMISSIONS,
    "SECRETARY": _BASELINE + [
        "organization.view", "organization.update",
        "events.view", "events.create", "events.update",
        "event_registrations.view", "event_registrations.manage",
        "attendance.view", "attendance.scan", "attendance.record",
        "announcements.view",
        "directory.view", "directory.update",
        "reports.view",
        "qr.view", "qr.generate",
    ],
    "ASSISTANT_SECRETARY": _BASELINE + [
        "organization.view",
        "events.view", "events.update",
        "event_registrations.view",
        "attendance.view", "attendance.scan",
        "announcements.view",
        "directory.view",
        "reports.view",
        "qr.view", "qr.generate",
    ],
    "MW_COMMITTEE": _BASELINE + [
        "organization.view",
        "membership.view", "membership.manage", "membership_fees.view",
        "students.view",
        "sanctions.view", "sanctions.create", "sanctions.update", "sanctions.settle",
        "attendance.view",
        "directory.view",
        "reports.view",
        "qr.view", "qr.generate",
    ],
    "EVENTS_LOGISTICS": _BASELINE + [
        "organization.view",
        "events.view", "events.create", "events.update", "events.publish",
        "event_registrations.view", "event_registrations.manage",
        "attendance.view", "attendance.scan", "attendance.record",
        "announcements.view",
        "directory.view",
        "reports.view",
        "qr.view", "qr.generate",
    ],
    "PIO": _BASELINE + [
        "organization.view",
        "announcements.view", "announcements.create", "announcements.update",
        "content.manage", "content.landing",
        "events.view",
        "directory.view", "directory.update",
        "qr.view", "qr.generate",
    ],
    "TREASURER": _BASELINE + [
        "organization.view",
        "payments.view", "payments.create", "payments.update", "payments.void",
        "remittance.view", "remittance.create", "remittance.update", "remittance.approve",
        "inventory.view", "inventory.manage",
        "membership.view", "membership.manage",
        "reports.view", "reports.generate",
        "audit_logs.view",
        "qr.view", "qr.generate",
    ],
    "ASSISTANT_TREASURER": _BASELINE + [
        "organization.view",
        "payments.view", "payments.create", "payments.update",
        "remittance.view", "remittance.create",
        "inventory.view",
        "membership.view",
        "reports.view",
        "qr.view", "qr.generate",
    ],
    "FINANCE_COMMITTEE": _BASELINE + [
        "organization.view",
        "payments.view",
        "remittance.view", "remittance.approve",
        "reports.view", "reports.generate",
        "audit_logs.view",
        "qr.view", "qr.generate",
    ],
    "STUDENT": _BASELINE + [
        "organization.view",
        "events.view", "events.register",
        "event_registrations.view",
        "attendance.view",
        "membership.view", "membership_fees.view",
        "announcements.view",
        "directory.view",
        "qr.view", "qr.generate", "qr.scan",
    ],
}


def main() -> bool:
    """Initialize database with the corrected schema, roles, and permissions."""
    logger.info("=" * 60)
    logger.info("PSITS Portal V2 - Database Initialization (Supabase Auth)")
    logger.info("=" * 60)

    engine = create_engine(settings.database_url)

    with engine.begin() as conn:
        logger.info("\n[1/4] Checking database connection...")
        try:
            conn.execute(text("SELECT 1"))
            logger.info("Database connected")
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False

        logger.info("\n[2/4] Dropping stale pre-Supabase-Auth tables...")
        try:
            # These carry the old custom-JWT schema (users.password_hash,
            # profiles.user_id, roles without a code column, etc). They were
            # only ever seeded with mock/test data, so it's safe to rebuild
            # them against the corrected Supabase Auth schema.
            for stale_table in (
                "audit_logs", "role_permissions", "user_roles",
                "roles", "permissions", "profiles", "users",
            ):
                conn.execute(text(f"DROP TABLE IF EXISTS {stale_table} CASCADE"))
            logger.info("  stale tables dropped")
        except Exception as e:
            logger.error(f"Failed to drop stale tables: {e}")
            return False

        logger.info("\n[2/4] Creating tables...")
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS profiles (
                    id VARCHAR(36) PRIMARY KEY,
                    auth_user_id VARCHAR(36) NOT NULL UNIQUE,
                    student_id VARCHAR(20) UNIQUE,
                    display_name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    profile_image_url VARCHAR(512),
                    status VARCHAR(20) DEFAULT 'ACTIVE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("  profiles")

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS permissions (
                    id VARCHAR(36) PRIMARY KEY,
                    code VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT,
                    category VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("  permissions")

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS roles (
                    id VARCHAR(36) PRIMARY KEY,
                    code VARCHAR(50) NOT NULL UNIQUE,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    "order" INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("  roles")

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_roles (
                    user_id VARCHAR(36) NOT NULL,
                    role_id VARCHAR(36) NOT NULL,
                    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, role_id),
                    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
                    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
                )
            """))
            logger.info("  user_roles")

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS role_permissions (
                    role_id VARCHAR(36) NOT NULL,
                    permission_id VARCHAR(36) NOT NULL,
                    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (role_id, permission_id),
                    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
                )
            """))
            logger.info("  role_permissions")

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36),
                    action VARCHAR(100) NOT NULL,
                    entity_type VARCHAR(50) NOT NULL,
                    entity_id VARCHAR(36) NOT NULL,
                    old_values JSON,
                    new_values JSON,
                    ip_address VARCHAR(45),
                    user_agent VARCHAR(512),
                    details JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
                )
            """))
            logger.info("  audit_logs")

        except Exception as e:
            logger.error(f"Failed to create tables: {e}")
            return False

        logger.info("\n[3/4] Seeding permissions...")
        for code, description in PERMISSIONS.items():
            category = code.split(".")[0]
            conn.execute(text("""
                INSERT INTO permissions (id, code, description, category)
                VALUES (:id, :code, :description, :category)
                ON CONFLICT (code) DO NOTHING
            """), {
                "id": str(uuid.uuid4()),
                "code": code,
                "description": description,
                "category": category,
            })
        logger.info(f"  {len(PERMISSIONS)} permissions seeded/verified")

        logger.info("\n[4/4] Seeding roles and role-permission assignments...")
        for code, name, description, order in ROLES:
            conn.execute(text("""
                INSERT INTO roles (id, code, name, description, "order", is_active)
                VALUES (:id, :code, :name, :description, :order, TRUE)
                ON CONFLICT (code) DO NOTHING
            """), {
                "id": str(uuid.uuid4()),
                "code": code,
                "name": name,
                "description": description,
                "order": order,
            })
        logger.info(f"  {len(ROLES)} roles seeded/verified")

        for role_code, permission_codes in ROLE_PERMISSIONS.items():
            role_row = conn.execute(
                text("SELECT id FROM roles WHERE code = :code"),
                {"code": role_code},
            ).first()
            if not role_row:
                logger.warning(f"  Role not found, skipping: {role_code}")
                continue

            for perm_code in permission_codes:
                perm_row = conn.execute(
                    text("SELECT id FROM permissions WHERE code = :code"),
                    {"code": perm_code},
                ).first()
                if not perm_row:
                    logger.warning(f"  Permission not found, skipping: {perm_code}")
                    continue

                conn.execute(text("""
                    INSERT INTO role_permissions (role_id, permission_id)
                    VALUES (:role_id, :permission_id)
                    ON CONFLICT DO NOTHING
                """), {"role_id": role_row[0], "permission_id": perm_row[0]})

        logger.info("  role-permission assignments seeded/verified")

        logger.info("\n" + "=" * 60)
        logger.info("Database initialization complete")
        logger.info(f"  {len(PERMISSIONS)} permissions, {len(ROLES)} roles")
        logger.info("Next: start the backend server")
        logger.info("  Command: poetry run uvicorn app.main:app --port 8000")
        logger.info("=" * 60)

        return True


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
