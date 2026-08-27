"""Authentication/profile business logic.

Supabase Auth owns credentials and sessions. This service only handles what
our application is responsible for: linking a Supabase account to a student
roster record (profile creation) and resolving a profile's roles/permissions.
"""

from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
import logging

from app.models.user import Profile, Role, AccountStatus
from app.models.student import Student
from app.core.exceptions import (
    NotFoundException,
    ConflictException,
    ValidationException,
)

logger = logging.getLogger(__name__)

STUDENT_ROLE_CODE = "STUDENT"


class AuthService:
    """Profile/activation service."""

    def __init__(self, db: Session):
        self.db = db

    def activate_student_account(
        self,
        auth_user_id: str,
        email: str,
        student_id: str,
        last_name: str,
    ) -> Profile:
        """
        Create a `profiles` row linking a Supabase account to a student
        roster record, and grant the STUDENT role.

        Args:
            auth_user_id: The caller's Supabase auth.users.id (from their
                verified access token).
            email: The caller's email (from their verified access token).
            student_id: Student ID from the roster (e.g., "22-12345").
            last_name: Student's last name, must match the roster record.

        Returns:
            The newly created Profile.

        Raises:
            NotFoundException: If student not found in roster.
            ValidationException: If last name doesn't match.
            ConflictException: If this Supabase account or this student is
                already activated.
        """
        student = self.db.query(Student).filter(
            Student.student_id == student_id
        ).first()

        if not student:
            logger.warning(f"Activation attempt for non-existent student: {student_id}")
            raise NotFoundException("Student", student_id)

        if student.last_name.lower() != last_name.lower():
            logger.warning(f"Last name mismatch for student: {student_id}")
            raise ValidationException("Last name does not match student record")

        existing = self.db.query(Profile).filter(
            (Profile.auth_user_id == auth_user_id) | (Profile.student_id == student_id)
        ).first()

        if existing:
            logger.warning(f"Activation attempt for already activated student: {student_id}")
            raise ConflictException("Student account already activated")

        profile = Profile(
            auth_user_id=auth_user_id,
            student_id=student_id,
            display_name=student.full_name,
            email=email,
            status=AccountStatus.ACTIVE,
        )
        self.db.add(profile)
        self.db.flush()

        student_role = self.db.query(Role).filter(
            Role.code == STUDENT_ROLE_CODE
        ).first()

        if student_role:
            self.db.execute(
                text(
                    "INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)"
                ),
                {"user_id": profile.id, "role_id": student_role.id},
            )
        else:
            logger.warning("STUDENT role not found - profile created without a role")

        self.db.commit()
        self.db.refresh(profile)

        logger.info(f"Student account activated: {student_id}")
        return profile

    def get_profile_with_permissions(self, auth_user_id: str) -> dict:
        """
        Get a profile with its resolved roles and permissions.

        Args:
            auth_user_id: Supabase auth.users.id

        Returns:
            Dictionary with profile info, roles, and permissions.

        Raises:
            NotFoundException: If no profile is linked to this account.
        """
        profile = self.db.query(Profile).filter(
            Profile.auth_user_id == auth_user_id
        ).first()

        if not profile:
            raise NotFoundException("Profile", auth_user_id)

        roles = self.db.execute(
            text(
                """
                SELECT r.id, r.code, r.name
                FROM roles r
                JOIN user_roles ur ON ur.role_id = r.id
                WHERE ur.user_id = :profile_id AND r.is_active = TRUE
                """
            ),
            {"profile_id": profile.id},
        ).mappings().all()

        role_ids = [r["id"] for r in roles]
        permissions: set[str] = set()

        if role_ids:
            stmt = text(
                """
                SELECT DISTINCT p.code
                FROM permissions p
                JOIN role_permissions rp ON rp.permission_id = p.id
                WHERE rp.role_id IN :role_ids
                """
            ).bindparams(bindparam("role_ids", expanding=True))
            permissions = {row[0] for row in self.db.execute(stmt, {"role_ids": role_ids}).all()}

        return {
            "id": profile.id,
            "auth_user_id": profile.auth_user_id,
            "student_id": profile.student_id,
            "display_name": profile.display_name,
            "email": profile.email,
            "profile_image_url": profile.profile_image_url,
            "status": profile.status,
            "roles": [dict(r) for r in roles],
            "permissions": list(permissions),
            "created_at": profile.created_at,
        }
