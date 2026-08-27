#!/usr/bin/env python3
"""
MVP Database initialization script.
Creates schema and seeds with synthetic test data.
Use: python init_db_mvp.py
"""

import os
import sys
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# Add app to path
sys.path.insert(0, os.path.dirname(__file__))

from app.core.config import settings
from app.models.base import Base
from app.models.user import Profile, Role, Permission, user_roles, role_permissions, AccountStatus
from app.models.student import Student, StudentSchoolYear, SchoolYear, Program
from app.models.audit_log import AuditLog


def init_database():
    """Create all tables in database."""
    print("[*] Connecting to database...")
    engine = create_engine(settings.database_url)

    print("[*] Creating schema...")
    Base.metadata.create_all(bind=engine)
    print("[OK] Schema created")

    return engine


def seed_data(engine):
    """Seed database with synthetic test data."""

    with Session(engine) as session:
        print("\n[*] Seeding data...")

        # 1. Create school year (skip if exists)
        print("  [1/6] School years...")
        sy = session.query(SchoolYear).filter(SchoolYear.label == "2025-2026").first()
        if not sy:
            sy = SchoolYear(
                label="2025-2026",
                start_date=datetime(2025, 8, 1),
                end_date=datetime(2026, 7, 31),
                is_active=True
            )
            session.add(sy)
            session.flush()  # Get ID
        else:
            print("    (already exists, skipping)")

        # 2. Create programs (skip if exist)
        print("  [2/6] Programs...")
        programs_to_create = [
            ("BSCS", "Bachelor of Science in Computer Science"),
            ("BSIT", "Bachelor of Science in Information Technology"),
            ("BLIS", "Bachelor of Science in Library and Information Science"),
            ("BAIS", "Bachelor of Science in Artificial Intelligence Systems"),
        ]

        for code, name in programs_to_create:
            existing = session.query(Program).filter(Program.code == code).first()
            if not existing:
                program = Program(code=code, name=name)
                session.add(program)

        session.flush()

        # 3. Create roles (skip if exist)
        print("  [3/6] RBAC roles...")
        roles_to_create = [
            ("STUDENT", "Student", "Student account"),
            ("PRESIDENT", "President", "Organization president"),
            ("VP_INTERNAL", "VP Internal", "VP for Internal Affairs"),
            ("VP_EXTERNAL", "VP External", "VP for External Affairs"),
            ("SECRETARY", "Secretary", "Organization secretary"),
            ("TREASURER", "Treasurer", "Organization treasurer"),
            ("EVENTS_LOGISTICS", "Events & Logistics", "Events coordinator"),
            ("SYSTEM_ADMIN", "System Admin", "System administrator"),
        ]

        for code, name, desc in roles_to_create:
            existing = session.query(Role).filter(Role.code == code).first()
            if not existing:
                role = Role(code=code, name=name, description=desc)
                session.add(role)

        session.flush()

        # 4. Create permissions (skip if exist)
        print("  [4/6] Permissions...")
        perms_to_create = [
            ("events.create", "events", "Create events"),
            ("events.read", "events", "View events"),
            ("events.update", "events", "Edit events"),
            ("events.delete", "events", "Delete events"),
            ("attendance.record", "attendance", "Record attendance"),
            ("attendance.view", "attendance", "View attendance"),
            ("students.view", "students", "View student data"),
            ("students.activate", "students", "Activate student accounts"),
            ("admin.reset_mfa", "admin", "Reset student MFA"),
        ]

        for code, category, desc in perms_to_create:
            existing = session.query(Permission).filter(Permission.code == code).first()
            if not existing:
                perm = Permission(code=code, category=category, description=desc)
                session.add(perm)

        session.flush()

        # Map roles to permissions
        print("  [5/6] Role permissions...")
        roles_dict = {r.code: r for r in session.query(Role).all()}
        perms_dict = {p.code: p for p in session.query(Permission).all()}

        # President: full event + attendance access
        for perm_code in ["events.create", "events.read", "events.update", "attendance.record", "attendance.view"]:
            stmt = role_permissions.insert().values(
                role_id=roles_dict["PRESIDENT"].id,
                permission_id=perms_dict[perm_code].id
            )
            session.execute(stmt)

        # Events coordinator: manage events
        for perm_code in ["events.read", "events.create", "events.update", "attendance.record", "attendance.view"]:
            stmt = role_permissions.insert().values(
                role_id=roles_dict["EVENTS_LOGISTICS"].id,
                permission_id=perms_dict[perm_code].id
            )
            session.execute(stmt)

        # Students: read-only
        for perm_code in ["events.read", "attendance.view"]:
            stmt = role_permissions.insert().values(
                role_id=roles_dict["STUDENT"].id,
                permission_id=perms_dict[perm_code].id
            )
            session.execute(stmt)

        # 5. Create synthetic students (skip if exist)
        print("  [6/6] Synthetic students...")
        synthetic_names = [
            ("ALGORITHM", "Brook", "James"),
            ("BINARY", "Cara", "Michelle"),
            ("CACHE", "Dylan", "Robert"),
            ("DATABASE", "Emma", "Louise"),
            ("ENCODE", "Frank", "Michael"),
            ("FUNCTION", "Grace", "Alice"),
            ("GATEWAY", "Henry", "Martin"),
            ("HASH", "Isabel", "Margaret"),
            ("INDEX", "Jack", "Paul"),
            ("KERNEL", "Kelly", "Marie"),
        ]

        program_ids = [p.id for p in session.query(Program).all()]
        program_cycle = iter(program_ids * 3)

        existing_count = session.query(Student).count()
        if existing_count > 0:
            print(f"    (skipping, {existing_count} students already exist)")
        else:
            for seq, (last_name, first_name, middle_name) in enumerate(synthetic_names, 1):
                student = Student(
                    student_id=f"25-{seq:05d}",
                    first_name=first_name,
                    middle_name=middle_name,
                    last_name=last_name,
                    is_active=False,  # Not yet activated
                )
                session.add(student)
                session.flush()

                # Link to school year
                ssy = StudentSchoolYear(
                    student_id=student.id,
                    school_year_id=sy.id,
                    program_id=next(program_cycle),
                    year_level=1 + (seq % 4),  # 1st-4th year
                    section=chr(65 + (seq % 3)),  # A, B, C
                    status="ACTIVE"
                )
                session.add(ssy)

        session.commit()
        print("[OK] Data seeded successfully")

        # Print summary
        student_count = session.query(Student).count()
        print(f"\n[SUMMARY]")
        print(f"  Students: {student_count}")
        print(f"  Roles: {session.query(Role).count()}")
        print(f"  Permissions: {session.query(Permission).count()}")
        print(f"  School years: {session.query(SchoolYear).count()}")
        print(f"  Programs: {session.query(Program).count()}")


if __name__ == "__main__":
    try:
        engine = init_database()
        seed_data(engine)
        print("\n[SUCCESS] Database initialized for MVP")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
