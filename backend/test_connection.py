"""Test Supabase database connection."""

from sqlalchemy import create_engine, text
from app.core.config import settings

print("=" * 60)
print("Testing Supabase PostgreSQL Connection")
print("=" * 60)

print(f"Database URL: {settings.database_url[:50]}...")

try:
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        result = conn.execute(text('SELECT 1'))
        print("\n✓ SUCCESS: Connected to Supabase PostgreSQL!")
        print(f"✓ Host: {settings.database_url.split('@')[1].split(':')[0]}")
        print(f"✓ Database: postgres")
        print(f"✓ Port: 5432")
        print("\nYou can now initialize the database with:")
        print("  python -m app.scripts.init_roles_permissions")

except Exception as e:
    print(f"\n✗ FAILED: {str(e)}")
    print("\nTroubleshooting:")
    print("1. Check DATABASE_URL in .env")
    print("2. Verify internet connection")
    print("3. Check Supabase project is active")

print("=" * 60)
