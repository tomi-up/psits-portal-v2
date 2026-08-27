"""Admin/officer student management - list, add, edit.

Gated behind admin login, same as admin_events.py - every route on this
router requires a valid Authorization: Bearer token from
POST /api/v1/admin/auth/login.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.student import Student, StudentSchoolYear, SchoolYear, Program
from app.models.user import Profile, AccountStatus

router = APIRouter(prefix="/officer/students", tags=["admin-students"], dependencies=[Depends(get_current_admin)])


class StudentRow(BaseModel):
    id: str
    student_id: str
    first_name: str
    middle_name: str | None
    last_name: str
    suffix: str | None
    email: str | None
    contact_number: str | None
    is_active: bool
    program: str | None
    year_level: int | None
    section: str | None
    academic_standing: str | None
    enrollment_status: str | None


class StudentListResponse(BaseModel):
    students: list[StudentRow]


class StudentUpsertRequest(BaseModel):
    student_id: str
    first_name: str
    middle_name: str | None = None
    last_name: str
    suffix: str | None = None
    email: str | None = None
    contact_number: str | None = None
    program: str
    year_level: int
    section: str
    academic_standing: str = "REGULAR"
    enrollment_status: str = "ACTIVE"
    is_active: bool = False


def _row_for(student: Student, ssy: StudentSchoolYear | None) -> StudentRow:
    return StudentRow(
        id=student.id,
        student_id=student.student_id,
        first_name=student.first_name,
        middle_name=student.middle_name,
        last_name=student.last_name,
        suffix=student.suffix,
        email=student.email,
        contact_number=student.contact_number,
        is_active=student.is_active,
        program=ssy.program.code if ssy and ssy.program else None,
        year_level=ssy.year_level if ssy else None,
        section=ssy.section if ssy else None,
        academic_standing=ssy.academic_standing if ssy else None,
        enrollment_status=ssy.status if ssy else None,
    )


def _latest_school_year(db: Session) -> SchoolYear:
    school_year = db.query(SchoolYear).filter(SchoolYear.is_active.is_(True)).first()
    if not school_year:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No active school year configured",
        )
    return school_year


@router.get("/", response_model=StudentListResponse)
def list_students(db: Session = Depends(get_db)):
    students = db.query(Student).order_by(Student.last_name, Student.first_name).all()

    # Bulk-prefetch every enrollment (not one query per student) and keep
    # only the most recent per student.
    all_ssy = db.query(StudentSchoolYear).order_by(StudentSchoolYear.enrolled_at.desc()).all()
    latest_ssy_by_student: dict[str, StudentSchoolYear] = {}
    for ssy in all_ssy:
        latest_ssy_by_student.setdefault(ssy.student_id, ssy)

    rows = [_row_for(s, latest_ssy_by_student.get(s.id)) for s in students]
    return StudentListResponse(students=rows)


@router.post("/", response_model=StudentRow, status_code=status.HTTP_201_CREATED)
def create_student(request: StudentUpsertRequest, db: Session = Depends(get_db)):
    existing = db.query(Student).filter(Student.student_id == request.student_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Student ID {request.student_id} already exists",
        )

    program = db.query(Program).filter(Program.code == request.program).first()
    if not program:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown program code: {request.program}",
        )

    school_year = _latest_school_year(db)

    student = Student(
        student_id=request.student_id,
        first_name=request.first_name,
        middle_name=request.middle_name,
        last_name=request.last_name,
        suffix=request.suffix,
        email=request.email,
        contact_number=request.contact_number,
        is_active=request.is_active,
    )
    db.add(student)
    db.flush()

    ssy = StudentSchoolYear(
        student_id=student.id,
        school_year_id=school_year.id,
        program_id=program.id,
        year_level=request.year_level,
        section=request.section,
        status=request.enrollment_status,
        academic_standing=request.academic_standing,
    )
    db.add(ssy)
    db.commit()
    db.refresh(student)
    db.refresh(ssy)

    return _row_for(student, ssy)


@router.put("/{student_id}", response_model=StudentRow)
def update_student(student_id: str, request: StudentUpsertRequest, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    if request.student_id != student.student_id:
        collision = db.query(Student).filter(Student.student_id == request.student_id).first()
        if collision:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Student ID {request.student_id} already in use",
            )

    program = db.query(Program).filter(Program.code == request.program).first()
    if not program:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown program code: {request.program}",
        )

    student.student_id = request.student_id
    student.first_name = request.first_name
    student.middle_name = request.middle_name
    student.last_name = request.last_name
    student.suffix = request.suffix
    student.email = request.email
    student.contact_number = request.contact_number
    student.is_active = request.is_active

    ssy = (
        db.query(StudentSchoolYear)
        .filter(StudentSchoolYear.student_id == student.id)
        .order_by(StudentSchoolYear.enrolled_at.desc())
        .first()
    )
    if ssy is None:
        # No enrollment on record yet (e.g. a student added elsewhere without
        # one) - create against the current school year rather than error.
        ssy = StudentSchoolYear(student_id=student.id, school_year_id=_latest_school_year(db).id)
        db.add(ssy)

    ssy.program_id = program.id
    ssy.year_level = request.year_level
    ssy.section = request.section
    ssy.status = request.enrollment_status
    ssy.academic_standing = request.academic_standing

    db.commit()
    db.refresh(student)
    db.refresh(ssy)

    return _row_for(student, ssy)


@router.post("/{student_id}/reset-authenticator", response_model=StudentRow)
def reset_authenticator(student_id: str, db: Session = Depends(get_db)):
    """Clear this student's TOTP enrollment and un-activate their account,
    so they can go through /student-activate/enroll-mfa again from scratch -
    for a lost/replaced device. Does not touch their roster/enrollment data."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    profile = db.query(Profile).filter(Profile.student_id == student.student_id).first()
    if profile:
        profile.totp_secret = None
        # /student-activate/verify (step 1 of activation) gates re-activation
        # on THIS field, not Student.is_active - miss it and the student is
        # bounced with "Account already activated" even after totp_secret is
        # cleared.
        profile.status = AccountStatus.INACTIVE

    student.is_active = False
    db.commit()
    db.refresh(student)

    ssy = (
        db.query(StudentSchoolYear)
        .filter(StudentSchoolYear.student_id == student.id)
        .order_by(StudentSchoolYear.enrolled_at.desc())
        .first()
    )
    return _row_for(student, ssy)
