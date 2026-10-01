"""Admin TOTP 2FA: enrollment, login with MFA required, and reset."""

import pyotp

from app.models.admin import AdminAccount


class TestEnrollAndConfirm:
    def test_enroll_then_confirm_enables_mfa(self, client, db, admin_headers):
        enroll = client.post("/api/v1/admin/auth/mfa/enroll", headers=admin_headers)
        assert enroll.status_code == 200, enroll.text
        body = enroll.json()
        assert body["qr_code_image"].startswith("data:image/png;base64,")
        secret = body["manual_entry_key"]

        code = pyotp.TOTP(secret).now()
        confirm = client.post(
            "/api/v1/admin/auth/mfa/confirm",
            headers=admin_headers,
            json={"setup_token": body["setup_token"], "totp_code": code},
        )
        assert confirm.status_code == 200, confirm.text
        assert confirm.json()["status"] == "ENABLED"

        admin = db.query(AdminAccount).filter(AdminAccount.email == "admin@psits-test.org").one()
        assert admin.mfa_enabled is True
        assert admin.totp_secret is not None

    def test_confirm_rejects_wrong_code(self, client, admin_headers):
        enroll = client.post("/api/v1/admin/auth/mfa/enroll", headers=admin_headers)
        setup_token = enroll.json()["setup_token"]

        confirm = client.post(
            "/api/v1/admin/auth/mfa/confirm",
            headers=admin_headers,
            json={"setup_token": setup_token, "totp_code": "000000"},
        )
        assert confirm.status_code == 401

    def test_enroll_requires_admin(self, client):
        res = client.post("/api/v1/admin/auth/mfa/enroll")
        assert res.status_code in (401, 403)


class TestLoginWithMfa:
    def _enroll_mfa(self, client, admin_headers):
        enroll = client.post("/api/v1/admin/auth/mfa/enroll", headers=admin_headers)
        body = enroll.json()
        secret = body["manual_entry_key"]
        code = pyotp.TOTP(secret).now()
        client.post(
            "/api/v1/admin/auth/mfa/confirm",
            headers=admin_headers,
            json={"setup_token": body["setup_token"], "totp_code": code},
        )
        return secret

    def test_login_requires_mfa_code_once_enabled(self, client, admin_headers):
        self._enroll_mfa(client, admin_headers)

        login = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "adminpass123"},
        )
        assert login.status_code == 200, login.text
        body = login.json()
        assert body["status"] == "MFA_REQUIRED"
        assert "pending_token" in body
        assert "access_token" not in body

    def test_pending_token_cannot_access_admin_routes(self, client, admin_headers):
        self._enroll_mfa(client, admin_headers)

        login = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "adminpass123"},
        )
        pending_token = login.json()["pending_token"]

        res = client.get(
            "/api/v1/admin/auth/me", headers={"Authorization": f"Bearer {pending_token}"}
        )
        assert res.status_code == 401

    def test_verify_mfa_completes_login(self, client, admin_headers):
        secret = self._enroll_mfa(client, admin_headers)

        login = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "adminpass123"},
        )
        pending_token = login.json()["pending_token"]

        verify = client.post(
            "/api/v1/admin/auth/login/verify-mfa",
            json={"pending_token": pending_token, "totp_code": pyotp.TOTP(secret).now()},
        )
        assert verify.status_code == 200, verify.text
        body = verify.json()
        assert "access_token" in body

        me = client.get(
            "/api/v1/admin/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
        )
        assert me.status_code == 200

    def test_verify_mfa_rejects_wrong_code(self, client, admin_headers):
        self._enroll_mfa(client, admin_headers)

        login = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "adminpass123"},
        )
        pending_token = login.json()["pending_token"]

        verify = client.post(
            "/api/v1/admin/auth/login/verify-mfa",
            json={"pending_token": pending_token, "totp_code": "000000"},
        )
        assert verify.status_code == 401

    def test_login_without_mfa_enrolled_is_unchanged(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "adminpass123"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert "access_token" in body
        assert "status" not in body


class TestResetMfa:
    def test_reset_disables_mfa(self, client, db, admin_headers):
        enroll = client.post("/api/v1/admin/auth/mfa/enroll", headers=admin_headers)
        body = enroll.json()
        code = pyotp.TOTP(body["manual_entry_key"]).now()
        client.post(
            "/api/v1/admin/auth/mfa/confirm",
            headers=admin_headers,
            json={"setup_token": body["setup_token"], "totp_code": code},
        )

        reset = client.post(
            "/api/v1/admin/auth/mfa/reset", headers=admin_headers, json={"password": "adminpass123"},
        )
        assert reset.status_code == 200, reset.text
        assert reset.json()["status"] == "DISABLED"

        admin = db.query(AdminAccount).filter(AdminAccount.email == "admin@psits-test.org").one()
        assert admin.mfa_enabled is False
        assert admin.totp_secret is None

        # Login no longer asks for a code once reset.
        login = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "adminpass123"},
        )
        assert "access_token" in login.json()

    def test_reset_rejects_wrong_password(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/mfa/reset", headers=admin_headers, json={"password": "wrong-password"},
        )
        assert res.status_code == 401

    def test_reset_requires_admin(self, client):
        res = client.post("/api/v1/admin/auth/mfa/reset", json={"password": "adminpass123"})
        assert res.status_code in (401, 403)
