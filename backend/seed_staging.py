#!/usr/bin/env python
"""Seed the staging database with synthetic sample data matching prod's
schema/shape. Safe to re-run - skips creation if data already exists.

Run against staging by setting DATABASE_URL (and the other required env
vars) inline - see the invocation instructions given alongside this file.
Never run this against the prod DATABASE_URL.
"""
import uuid
from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal, init_db
from app.core.security import hash_password
from app.models.admin import AdminAccount
from app.models.student import Student, StudentSchoolYear, SchoolYear, Program
from app.models.event import Event, EventRegistration, Attendance

SAMPLE_STUDENTS = [
    ("22-09876", "Juan", "Dela Cruz", 4),
    ("22-11223", "Maria", "Santos", 4),
    ("23-33445", "Jose", "Reyes", 3),
    ("23-55667", "Ana", "Garcia", 3),
    ("24-77889", "Pedro", "Bautista", 2),
    ("24-99001", "Rosa", "Mendoza", 2),
    ("25-12345", "Carlos", "Villanueva", 1),
    ("25-54321", "Liza", "Aquino", 1),
    ("26-67890", "Miguel", "Torres", 1),
    ("26-09988", "Sofia", "Ramos", 1),
]


def main():
    print("Creating tables (if not already present)...")
    init_db()

    db = SessionLocal()
    try:
        # Admin account
        if not db.query(AdminAccount).filter(AdminAccount.email == "admin@usm.edu.ph").first():
            db.add(AdminAccount(
                id=str(uuid.uuid4()),
                email="admin@usm.edu.ph",
                password_hash=hash_password("StagingAdmin@2026"),
                display_name="Staging Admin",
                is_active=True,
            ))
            print("Created admin account: admin@usm.edu.ph / StagingAdmin@2026")

        # Program
        program = db.query(Program).filter(Program.code == "BSCS").first()
        if not program:
            program = Program(
                id=str(uuid.uuid4()),
                code="BSCS",
                name="Bachelor of Science in Computer Science",
            )
            db.add(program)
            db.flush()
            print("Created program: BSCS")

        # School year
        school_year = db.query(SchoolYear).filter(SchoolYear.label == "2026-2027").first()
        if not school_year:
            school_year = SchoolYear(
                id=str(uuid.uuid4()),
                label="2026-2027",
                start_date=datetime(2026, 8, 1, tzinfo=timezone.utc),
                end_date=datetime(2027, 5, 31, tzinfo=timezone.utc),
                is_active=True,
            )
            db.add(school_year)
            db.flush()
            print("Created school year: 2026-2027")

        # Students + enrollment
        created_students = []
        for student_id, first_name, last_name, year_level in SAMPLE_STUDENTS:
            student = db.query(Student).filter(Student.student_id == student_id).first()
            if not student:
                student = Student(
                    id=str(uuid.uuid4()),
                    student_id=student_id,
                    first_name=first_name,
                    last_name=last_name,
                    email=f"{student_id.lower()}@usm.edu.ph",
                    is_active=True,
                )
                db.add(student)
                db.flush()

                db.add(StudentSchoolYear(
                    id=str(uuid.uuid4()),
                    student_id=student.id,
                    school_year_id=school_year.id,
                    program_id=program.id,
                    year_level=year_level,
                    section="A",
                    status="ACTIVE",
                    academic_standing="REGULAR",
                ))
                created_students.append(student)

        if created_students:
            print(f"Created {len(created_students)} sample students")

        # Sample event
        event = db.query(Event).filter(Event.name == "Staging Test Event").first()
        if not event:
            event = Event(
                id=str(uuid.uuid4()),
                name="Staging Test Event",
                venue="Test Venue",
                description="Sample event for staging environment testing",
                event_date=datetime.now(timezone.utc) + timedelta(days=1),
                status="ACTIVE",
                attendance_required=False,
            )
            db.add(event)
            db.flush()
            print("Created sample event: Staging Test Event")

        db.commit()
        print("\nSeed complete.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
