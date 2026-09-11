"""Enable RLS and remove direct client-role access to application tables."""

from sqlalchemy import create_engine, inspect, text

from app.core.config import settings


def main() -> None:
    if settings.environment.lower() != "staging":
        raise ValueError("Refusing to run: ENVIRONMENT must be staging")

    engine = create_engine(settings.database_url, pool_pre_ping=True)
    tables = sorted(inspect(engine).get_table_names(schema="public"))
    with engine.begin() as connection:
        for table in tables:
            connection.execute(text(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY'))
            connection.execute(
                text(f'REVOKE ALL PRIVILEGES ON TABLE public."{table}" FROM anon, authenticated')
            )
        connection.execute(
            text("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated")
        )
        connection.execute(
            text(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                "REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated"
            )
        )
        connection.execute(
            text(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                "REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated"
            )
        )
    engine.dispose()
    print(f"Protected {len(tables)} public tables with RLS and revoked direct client-role access.")


if __name__ == "__main__":
    main()
