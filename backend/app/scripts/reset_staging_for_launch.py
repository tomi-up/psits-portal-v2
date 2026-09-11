"""Remove staging test data and lock down public tables before launch.

Dry-run by default. Preserves admin_accounts, programs, school_years, roles,
permissions, and role_permissions so the application remains manageable.
"""

import argparse

from sqlalchemy import create_engine, inspect, text

from app.core.config import settings

PRESERVED_TABLES = {
    "admin_accounts",
    "permissions",
    "programs",
    "role_permissions",
    "roles",
    "school_years",
}

RESET_TABLES = {
    "attendance",
    "attendance_checkpoint_scans",
    "attendance_review_requests",
    "audit_logs",
    "event_attendance_phase_logs",
    "event_officer_assignments",
    "event_registrations",
    "events",
    "excuse_requests",
    "inventory_items",
    "membership_fees",
    "news_posts",
    "officers",
    "org_settings",
    "payments",
    "profiles",
    "sanction_settlements",
    "sanctions",
    "scanner_sessions",
    "student_school_years",
    "students",
    "survey_responses",
    "user_roles",
}


def reset(commit: bool) -> None:
    if settings.environment.lower() != "staging":
        raise ValueError("Refusing to run: ENVIRONMENT must be staging")

    engine = create_engine(settings.database_url, pool_pre_ping=True)
    public_tables = set(inspect(engine).get_table_names(schema="public"))
    unknown_tables = public_tables - PRESERVED_TABLES - RESET_TABLES
    missing_tables = RESET_TABLES - public_tables
    if unknown_tables:
        raise ValueError(f"Unclassified public tables; update the reset plan first: {sorted(unknown_tables)}")
    if missing_tables:
        raise ValueError(f"Expected staging tables are missing: {sorted(missing_tables)}")

    with engine.begin() as connection:
        before = {
            table: connection.execute(text(f'SELECT count(*) FROM public."{table}"')).scalar_one()
            for table in sorted(RESET_TABLES)
        }

        quoted_tables = ", ".join(f'public."{table}"' for table in sorted(RESET_TABLES))
        connection.execute(text(f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE"))

        for table in sorted(public_tables):
            connection.execute(text(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY'))
            connection.execute(
                text(f'REVOKE ALL PRIVILEGES ON TABLE public."{table}" FROM anon, authenticated')
            )

        if not commit:
            connection.rollback()

    engine.dispose()
    print(f"Mode: {'COMMITTED' if commit else 'DRY RUN (rolled back)'}")
    print(f"Operational tables reset: {len(RESET_TABLES)}")
    print(f"Operational rows removed: {sum(before.values())}")
    print(f"Public tables protected with RLS: {len(public_tables)}")
    print(f"Preserved tables: {', '.join(sorted(PRESERVED_TABLES))}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Commit reset; default is rollback")
    args = parser.parse_args()
    reset(args.commit)
