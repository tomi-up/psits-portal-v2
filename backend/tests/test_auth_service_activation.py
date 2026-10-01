"""Legacy Supabase-based student activation (/auth/activate).

Covers the email cross-match fix: Student ID + last name alone are both
guessable from class lists/printed IDs, so activation must also require the
caller's authenticated email to match the roster email - the same check
google_login already enforces on the newer path.
"""

import pytest

from app.core.exceptions import ValidationException, ConflictException, NotFoundException
from app.services.auth_service import AuthService


class TestActivateStudentAccount:
    def test_rejects_email_not_matching_roster(self, db, make_student):
        student = make_student()
        student.email = "realstudent@usm.edu.ph"
        db.commit()

        with pytest.raises(ValidationException):
            AuthService(db).activate_student_account(
                auth_user_id="attacker-auth-id",
                email="attacker@gmail.com",
                student_id=student.student_id,
                last_name=student.last_name,
            )

    def test_rejects_when_student_has_no_email_on_file(self, db, make_student):
        student = make_student()
        assert student.email is None

        with pytest.raises(ValidationException):
            AuthService(db).activate_student_account(
                auth_user_id="attacker-auth-id",
                email="attacker@gmail.com",
                student_id=student.student_id,
                last_name=student.last_name,
            )

    def test_succeeds_when_email_matches_roster(self, db, make_student):
        student = make_student()
        student.email = "realstudent@usm.edu.ph"
        db.commit()

        profile = AuthService(db).activate_student_account(
            auth_user_id="real-auth-id",
            email="RealStudent@usm.edu.ph",  # case-insensitive match
            student_id=student.student_id,
            last_name=student.last_name,
        )
        assert profile.student_id == student.student_id
        assert profile.auth_user_id == "real-auth-id"

    def test_rejects_unknown_student(self, db):
        with pytest.raises(NotFoundException):
            AuthService(db).activate_student_account(
                auth_user_id="x", email="x@usm.edu.ph", student_id="00-00000", last_name="Nobody",
            )

    def test_rejects_double_activation(self, db, make_student):
        student = make_student()
        student.email = "realstudent@usm.edu.ph"
        db.commit()

        AuthService(db).activate_student_account(
            auth_user_id="real-auth-id", email=student.email,
            student_id=student.student_id, last_name=student.last_name,
        )
        with pytest.raises(ConflictException):
            AuthService(db).activate_student_account(
                auth_user_id="other-auth-id", email=student.email,
                student_id=student.student_id, last_name=student.last_name,
            )
