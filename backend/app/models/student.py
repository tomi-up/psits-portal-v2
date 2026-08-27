"""Student related models."""

from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, Index, INTEGER, func
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Student(BaseModel):
    """Student record."""

    __tablename__ = "students"

    student_id = Column(String(20), unique=True, nullable=False)  # e.g., "22-12345"
    first_name = Column(String(100), nullable=False)
    middle_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=False)
    suffix = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    contact_number = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)

    # Relationships
    school_years = relationship(
        "StudentSchoolYear",
        back_populates="student",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index('ix_students_student_id', 'student_id'),
        Index('ix_students_last_name_first_name', 'last_name', 'first_name'),
        Index('ix_students_is_active', 'is_active'),
    )

    def __repr__(self):
        return f"<Student(student_id={self.student_id}, name={self.first_name} {self.last_name})>"

    @property
    def full_name(self) -> str:
        """Get full name."""
        name = f"{self.first_name} {self.last_name}"
        if self.suffix:
            name += f" {self.suffix}"
        return name.strip()


class StudentSchoolYear(BaseModel):
    """Student enrollment in a specific school year."""

    __tablename__ = "student_school_years"

    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    school_year_id = Column(String(36), ForeignKey("school_years.id", ondelete="CASCADE"), nullable=False)
    program_id = Column(String(36), ForeignKey("programs.id"), nullable=False)
    year_level = Column(INTEGER, nullable=False)  # 1, 2, 3, 4
    section = Column(String(10), nullable=True)  # A, B, C, D
    status = Column(String(20), default="ACTIVE")  # enrollment status: ACTIVE, INACTIVE
    # Academic standing for this school year - REGULAR, IRREGULAR, or OVER_STAY.
    # Distinct from `status` above (enrollment ACTIVE/INACTIVE) and from
    # Student.is_active (MFA activation, gates login) - three different
    # "status" concepts on a student; do not conflate them.
    academic_standing = Column(String(20), default="REGULAR", nullable=False)
    enrolled_at = Column(DateTime, default=func.now())

    # Relationships
    student = relationship("Student", back_populates="school_years")
    school_year = relationship("SchoolYear")
    program = relationship("Program")

    __table_args__ = (
        Index('ix_student_school_years_student_sy', 'student_id', 'school_year_id'),
        Index('ix_student_school_years_school_year', 'school_year_id'),
    )

    def __repr__(self):
        return f"<StudentSchoolYear(student_id={self.student_id}, school_year_id={self.school_year_id})>"


class SchoolYear(BaseModel):
    """Academic school year."""

    __tablename__ = "school_years"

    label = Column(String(20), unique=True, nullable=False)  # e.g., "2026-2027"
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=False)

    __table_args__ = (
        Index('ix_school_years_label', 'label'),
        Index('ix_school_years_is_active', 'is_active'),
    )

    def __repr__(self):
        return f"<SchoolYear(label={self.label}, is_active={self.is_active})>"


class Program(BaseModel):
    """IT Program."""

    __tablename__ = "programs"

    code = Column(String(10), unique=True, nullable=False)  # e.g., "BSCS"
    name = Column(String(255), nullable=False)  # e.g., "Bachelor of Science in Computer Science"
    description = Column(String(1000), nullable=True)

    __table_args__ = (
        Index('ix_programs_code', 'code'),
    )

    def __repr__(self):
        return f"<Program(code={self.code}, name={self.name})>"
