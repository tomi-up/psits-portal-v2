"""Admin self-service password change."""

from app.core.security import verify_password
from app.models.admin import AdminAccount


class TestChangePassword:
    def test_admin_can_change_their_password(self, client, db, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "newpassword456"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "CHANGED"

        admin = db.query(AdminAccount).filter(AdminAccount.email == "admin@psits-test.org").one()
        assert verify_password("newpassword456", admin.password_hash)
        assert not verify_password("adminpass123", admin.password_hash)

        # The new password works for a fresh login.
        login = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "newpassword456"},
        )
        assert login.status_code == 200, login.text

    def test_rejects_wrong_current_password(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "wrong-password", "new_password": "newpassword456"},
        )
        assert res.status_code == 401

    def test_rejects_short_new_password(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "short"},
        )
        assert res.status_code == 422

    def test_rejects_oversized_new_password(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "x" * 73},
        )
        assert res.status_code == 422

    def test_requires_admin(self, client):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            json={"current_password": "adminpass123", "new_password": "newpassword456"},
        )
        assert res.status_code in (401, 403)
