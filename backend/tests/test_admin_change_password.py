"""Admin self-service password change."""

from app.core.security import verify_password
from app.models.admin import AdminAccount


class TestChangePassword:
    def test_admin_can_change_their_password(self, client, db, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "NewPassword456!"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "CHANGED"

        admin = db.query(AdminAccount).filter(AdminAccount.email == "admin@psits-test.org").one()
        assert verify_password("NewPassword456!", admin.password_hash)
        assert not verify_password("adminpass123", admin.password_hash)

        # The new password works for a fresh login.
        login = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "NewPassword456!"},
        )
        assert login.status_code == 200, login.text

    def test_changing_password_invalidates_the_old_token_but_returns_a_working_new_one(
        self, client, admin_headers
    ):
        """A 12-hour admin JWT has no other revocation mechanism - without
        this, a leaked/stolen token (or a session on another device) would
        stay valid for up to 12 hours after the real owner changes their
        password specifically to shut that access down."""
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "NewPassword456!"},
        )
        assert res.status_code == 200, res.text
        new_token = res.json()["access_token"]

        # The token used to make the change-password call itself is now dead...
        old_session_check = client.get("/api/v1/admin/auth/me", headers=admin_headers)
        assert old_session_check.status_code == 401

        # ...but the fresh token the response handed back works immediately.
        new_session_check = client.get(
            "/api/v1/admin/auth/me", headers={"Authorization": f"Bearer {new_token}"}
        )
        assert new_session_check.status_code == 200

    def test_rejects_wrong_current_password(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "wrong-password", "new_password": "NewPassword456!"},
        )
        assert res.status_code == 400

    def test_wrong_current_password_does_not_invalidate_the_session(self, client, admin_headers):
        """Regression test: a wrong current password must not look like an
        expired/invalid session to the caller - the frontend's adminFetch()
        wrapper force-logs-out on any 401, so this endpoint returning 401
        here used to silently end a perfectly valid admin session over a
        mistyped password."""
        wrong = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "wrong-password", "new_password": "NewPassword456!"},
        )
        assert wrong.status_code == 400

        me = client.get("/api/v1/admin/auth/me", headers=admin_headers)
        assert me.status_code == 200

    def test_rejects_short_new_password(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "Sh0rt!"},
        )
        assert res.status_code == 422

    def test_rejects_oversized_new_password(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "x" * 73},
        )
        assert res.status_code == 422

    def test_rejects_password_missing_uppercase(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "newpassword456!"},
        )
        assert res.status_code == 422

    def test_rejects_password_missing_symbol(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "NewPassword456"},
        )
        assert res.status_code == 422

    def test_rejects_password_missing_digit(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            headers=admin_headers,
            json={"current_password": "adminpass123", "new_password": "NewPassword!"},
        )
        assert res.status_code == 422

    def test_requires_admin(self, client):
        res = client.post(
            "/api/v1/admin/auth/change-password",
            json={"current_password": "adminpass123", "new_password": "NewPassword456!"},
        )
        assert res.status_code in (401, 403)
