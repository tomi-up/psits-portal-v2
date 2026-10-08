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
            json={"setup_token": body["setup_token"], "totp_code": code, "password": "adminpass123"},
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
            json={"setup_token": setup_token, "totp_code": "000000", "password": "adminpass123"},
        )
        assert confirm.status_code == 400

    def test_enroll_requires_admin(self, client):
        res = client.post("/api/v1/admin/auth/mfa/enroll")
        assert res.status_code in (401, 403)

    def test_confirm_rejects_wrong_password(self, client, db, admin_headers):
        """A stolen bearer token alone can't finalize new MFA - the current
        password is required too, so a hijacked session can't silently
        replace the real owner's authenticator."""
        enroll = client.post("/api/v1/admin/auth/mfa/enroll", headers=admin_headers)
        body = enroll.json()
        code = pyotp.TOTP(body["manual_entry_key"]).now()

        confirm = client.post(
            "/api/v1/admin/auth/mfa/confirm",
            headers=admin_headers,
            json={"setup_token": body["setup_token"], "totp_code": code, "password": "wrong-password"},
        )
        assert confirm.status_code == 400

        admin = db.query(AdminAccount).filter(AdminAccount.email == "admin@psits-test.org").one()
        assert admin.mfa_enabled is False


class TestLoginWithMfa:
    def _enroll_mfa(self, client, admin_headers):
        enroll = client.post("/api/v1/admin/auth/mfa/enroll", headers=admin_headers)
        body = enroll.json()
        secret = body["manual_entry_key"]
        code = pyotp.TOTP(secret).now()
        confirm = client.post(
            "/api/v1/admin/auth/mfa/confirm",
            headers=admin_headers,
            json={"setup_token": body["setup_token"], "totp_code": code, "password": "adminpass123"},
        )
        assert confirm.status_code == 200, confirm.text
        # Enabling MFA rotates the session stamp; the old headers are now dead.
        return secret, {"Authorization": f"Bearer {confirm.json()['access_token']}"}

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
        secret, _ = self._enroll_mfa(client, admin_headers)

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

    def test_pending_token_rejected_after_password_change(self, client, admin_headers):
        """A pending MFA token captured before a password change must not
        still complete login afterward - it carries the security stamp that
        was current at /login time, and that stamp rotates on every
        password change."""
        secret, headers = self._enroll_mfa(client, admin_headers)

        login = client.post(
            "/api/v1/admin/auth/login",
            json={"email": "admin@psits-test.org", "password": "adminpass123"},
        )
        pending_token = login.json()["pending_token"]

        changed = client.post(
            "/api/v1/admin/auth/change-password",
            headers=headers,
            json={"current_password": "adminpass123", "new_password": "NewPass123!"},
        )
        assert changed.status_code == 200, changed.text

        verify = client.post(
            "/api/v1/admin/auth/login/verify-mfa",
            json={"pending_token": pending_token, "totp_code": pyotp.TOTP(secret).now()},
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
        confirm = client.post(
            "/api/v1/admin/auth/mfa/confirm",
            headers=admin_headers,
            json={"setup_token": body["setup_token"], "totp_code": code, "password": "adminpass123"},
        )
        headers = {"Authorization": f"Bearer {confirm.json()['access_token']}"}

        reset = client.post(
            "/api/v1/admin/auth/mfa/reset", headers=headers, json={"password": "adminpass123"},
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

    def test_setup_token_cannot_be_replayed_after_reset(self, client, db, admin_headers):
        enroll = client.post("/api/v1/admin/auth/mfa/enroll", headers=admin_headers).json()
        body = {
            "setup_token": enroll["setup_token"],
            "totp_code": pyotp.TOTP(enroll["manual_entry_key"]).now(),
            "password": "adminpass123",
        }
        confirm = client.post("/api/v1/admin/auth/mfa/confirm", headers=admin_headers, json=body)
        headers = {"Authorization": f"Bearer {confirm.json()['access_token']}"}

        reset = client.post("/api/v1/admin/auth/mfa/reset", headers=headers, json={"password": "adminpass123"})
        headers = {"Authorization": f"Bearer {reset.json()['access_token']}"}

        replay = client.post("/api/v1/admin/auth/mfa/confirm", headers=headers, json=body)
        assert replay.status_code == 400

        admin = db.query(AdminAccount).filter(AdminAccount.email == "admin@psits-test.org").one()
        assert admin.mfa_enabled is False

    def test_enabling_mfa_signs_out_other_sessions(self, client, admin_headers):
        enroll = client.post("/api/v1/admin/auth/mfa/enroll", headers=admin_headers).json()
        client.post(
            "/api/v1/admin/auth/mfa/confirm",
            headers=admin_headers,
            json={
                "setup_token": enroll["setup_token"],
                "totp_code": pyotp.TOTP(enroll["manual_entry_key"]).now(),
                "password": "adminpass123",
            },
        )
        assert client.get("/api/v1/admin/auth/me", headers=admin_headers).status_code == 401

    def test_reset_rejects_wrong_password(self, client, admin_headers):
        res = client.post(
            "/api/v1/admin/auth/mfa/reset", headers=admin_headers, json={"password": "wrong-password"},
        )
        assert res.status_code == 400

    def test_reset_requires_admin(self, client):
        res = client.post("/api/v1/admin/auth/mfa/reset", json={"password": "adminpass123"})
        assert res.status_code in (401, 403)
