"""Admin-set image URL fields (payment QR, event cover) must come from this
app's own upload flow, not an arbitrary pasted URL - otherwise any
authenticated admin session could point a student-facing image (e.g. the
payment QR) at an attacker-controlled host."""

from app.core.config import settings
from app.services.image_storage import is_trusted_image_url


def _trusted_url() -> str:
    base = (settings.supabase_storage_url or settings.supabase_url).rstrip("/")
    return f"{base}/storage/v1/object/public/psits-uploads/admin/payment-qr/x.png"


class TestIsTrustedImageUrl:
    def test_accepts_a_url_this_app_would_have_produced(self):
        assert is_trusted_image_url(_trusted_url()) is True

    def test_rejects_an_arbitrary_external_host(self):
        assert is_trusted_image_url("https://evil.example.com/fake-qr.png") is False

    def test_rejects_a_bare_prefix_with_no_object_path(self):
        base = (settings.supabase_storage_url or settings.supabase_url).rstrip("/")
        assert is_trusted_image_url(f"{base}/storage/v1/object/public/") is False

    def test_rejects_empty_string(self):
        assert is_trusted_image_url("") is False


class TestPaymentQrEndpointRejectsUntrustedUrl:
    def test_rejects_arbitrary_url(self, client, admin_headers):
        res = client.put(
            "/api/v1/officer/settings/payment-qr",
            headers=admin_headers,
            json={"qr_image_url": "https://evil.example.com/fake-qr.png"},
        )
        assert res.status_code == 422

    def test_accepts_trusted_url(self, client, admin_headers):
        res = client.put(
            "/api/v1/officer/settings/payment-qr",
            headers=admin_headers,
            json={"qr_image_url": _trusted_url()},
        )
        assert res.status_code == 200, res.text

    def test_accepts_clearing_the_qr(self, client, admin_headers):
        res = client.put(
            "/api/v1/officer/settings/payment-qr", headers=admin_headers, json={"qr_image_url": ""},
        )
        assert res.status_code == 200, res.text
        assert res.json()["qr_image_url"] is None


class TestEventCoverImageRejectsUntrustedUrl:
    def test_create_event_rejects_arbitrary_url(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/events/",
            headers=admin_headers,
            json={
                "name": "Test Event",
                "venue": "Test Venue",
                "description": "Test description",
                "event_date": "2026-09-01T08:30:00",
                "status": "DRAFT",
                "cover_image_url": "https://evil.example.com/fake.png",
            },
        )
        assert res.status_code == 422

    def test_create_event_accepts_trusted_url(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/events/",
            headers=admin_headers,
            json={
                "name": "Test Event",
                "venue": "Test Venue",
                "description": "Test description",
                "event_date": "2026-09-01T08:30:00",
                "status": "DRAFT",
                "cover_image_url": _trusted_url(),
            },
        )
        assert res.status_code == 200, res.text
