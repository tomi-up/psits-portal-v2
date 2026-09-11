"""Test fixtures: an isolated SQLite database and a TestClient wired to it.

Deliberately does NOT touch the configured Postgres. Every test gets a fresh
in-memory SQLite database created from the same SQLAlchemy models the real app
uses, so a model change that would break production breaks the tests too.
"""

import os
import sys
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import every model before create_all so SQLAlchemy can resolve the
# relationships between them - querying a model whose FK targets haven't been
# imported yet fails with NoReferencedTableError.
from app.models.base import Base  # noqa: E402
from app.models.admin import AdminAccount  # noqa: E402,F401
from app.models.event import Attendance, Event, EventRegistration  # noqa: E402
from app.models.excuse_request import ExcuseRequest  # noqa: E402,F401
from app.models.attendance_review import AttendanceReviewRequest  # noqa: E402,F401
from app.models.inventory import InventoryItem  # noqa: E402,F401
from app.models.officer import (  # noqa: E402
    AttendanceCheckpointScan,
    EventOfficerAssignment,
    Officer,
    ScannerSession,
)
from app.models.sanction import Sanction  # noqa: E402,F401
from app.models.student import Program, SchoolYear, Student, StudentSchoolYear  # noqa: E402
from app.models.survey import SurveyResponse  # noqa: E402,F401
from app.models.user import Profile  # noqa: E402,F401
from app.core.security import hash_password  # noqa: E402


@pytest.fixture
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def db(db_engine):
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = TestingSession()
    yield session
    session.close()


@pytest.fixture
def client(db_engine, db):
    from app.core.database import get_db
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    # slowapi's per-IP limits would otherwise make the scanner-login tests
    # order-dependent; the limit itself is asserted separately.
    app.state.limiter.enabled = False

    # TrustedHostMiddleware checks the Host header; TestClient's default
    # "testserver" isn't on the allow-list, so every request would 400.
    with TestClient(app, base_url="http://localhost") as test_client:
        yield test_client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Domain fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def school_setup(db):
    """A school year and two programs, so students can have course/section."""
    year = SchoolYear(
        label="2026-2027",
        start_date=datetime(2026, 8, 1),
        end_date=datetime(2027, 7, 31),
        is_active=True,
    )
    bscs = Program(code="BSCS", name="BS Computer Science")
    bsit = Program(code="BSIT", name="BS Information Technology")
    db.add_all([year, bscs, bsit])
    db.commit()
    return {"year": year, "BSCS": bscs, "BSIT": bsit}


@pytest.fixture
def make_student(db, school_setup):
    counter = {"n": 0}

    def _make(first="Test", last="Student", course="BSCS", year_level=1, section="A"):
        counter["n"] += 1
        student = Student(
            student_id=f"22-{10000 + counter['n']}",
            first_name=first,
            last_name=last,
            is_active=True,
        )
        db.add(student)
        db.flush()
        db.add(
            StudentSchoolYear(
                student_id=student.id,
                school_year_id=school_setup["year"].id,
                program_id=school_setup[course].id,
                year_level=year_level,
                section=section,
                enrolled_at=datetime.utcnow(),
            )
        )
        db.commit()
        return student

    return _make


@pytest.fixture
def event(db):
    e = Event(
        name="General Assembly 2026",
        venue="USM Gym",
        description="Test event",
        event_date=datetime(2026, 9, 1, 8, 30),
        status="ACTIVE",
        event_code="GA2026",
        attendance_phase="NOT_STARTED",
        late_threshold_minutes=20,
        attendance_required=True,
    )
    db.add(e)
    db.commit()
    return e


@pytest.fixture
def make_officer(db):
    def _make(name="Officer A", pin="123456", is_active=True):
        officer = Officer(name=name, pin_hash=hash_password(pin), is_active=is_active)
        db.add(officer)
        db.commit()
        return officer

    return _make


@pytest.fixture
def make_assignment(db):
    def _make(event, officer, course="BSCS", year_level=1, section="A"):
        assignment = EventOfficerAssignment(
            event_id=event.id,
            officer_id=officer.id,
            course=course,
            year_level=year_level,
            section=section,
        )
        db.add(assignment)
        db.commit()
        return assignment

    return _make


@pytest.fixture
def register(db):
    def _register(event, student):
        db.add(EventRegistration(event_id=event.id, student_id=student.id))
        db.commit()

    return _register


@pytest.fixture
def admin_token(db, client):
    admin = AdminAccount(
        email="admin@psits-test.org",
        password_hash=hash_password("adminpass123"),
        display_name="Test Admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()

    res = client.post(
        "/api/v1/admin/auth/login",
        json={"email": "admin@psits-test.org", "password": "adminpass123"},
    )
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def scanner_login(client):
    """Log an officer in and return their scanner Authorization headers."""

    def _login(event_code="GA2026", pin="123456"):
        res = client.post(
            "/api/v1/scanner/session", json={"event_code": event_code, "pin": pin}
        )
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['token']}"}

    return _login


@pytest.fixture
def advance_to(db):
    """Move an event's phase directly, for tests about scanning rather than
    about the transition rules themselves (which have their own tests)."""

    def _advance(event, phase):
        event.attendance_phase = phase
        db.commit()

    return _advance
