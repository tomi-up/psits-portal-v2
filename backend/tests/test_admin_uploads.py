import base64
import json
from io import BytesIO

from PIL import Image
import pytest

from app.services.image_storage import ImageStorageError, _validate_key_project


def _png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (32, 32), color=(14, 165, 233)).save(output, format="PNG")
    return output.getvalue()


class TestAdminImageUploads:
    def test_requires_admin_authentication(self, client):
        response = client.post(
            "/api/v1/officer/uploads/image",
            data={"purpose": "event-cover"},
            files={"file": ("cover.png", _png_bytes(), "image/png")},
        )

        assert response.status_code == 401

    def test_uploads_a_valid_image(self, client, admin_headers, monkeypatch):
        captured = {}

        async def fake_upload(data: bytes, purpose: str) -> str:
            captured.update(data=data, purpose=purpose)
            return "https://example.supabase.co/storage/v1/object/public/images/cover.png"

        monkeypatch.setattr(
            "app.api.v1.endpoints.admin_uploads.upload_public_image",
            fake_upload,
        )

        response = client.post(
            "/api/v1/officer/uploads/image",
            data={"purpose": "event-cover"},
            files={"file": ("cover.png", _png_bytes(), "image/png")},
            headers=admin_headers,
        )

        assert response.status_code == 200
        assert response.json()["url"].endswith("/cover.png")
        assert captured["purpose"] == "event-cover"
        assert captured["data"].startswith(b"\x89PNG")

    def test_rejects_a_non_image(self, client, admin_headers):
        response = client.post(
            "/api/v1/officer/uploads/image",
            data={"purpose": "payment-qr"},
            files={"file": ("not-an-image.png", b"not an image", "image/png")},
            headers=admin_headers,
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "The selected file is not a valid image"

    def test_rejects_an_unknown_purpose(self, client, admin_headers):
        response = client.post(
            "/api/v1/officer/uploads/image",
            data={"purpose": "profile-photo"},
            files={"file": ("photo.png", _png_bytes(), "image/png")},
            headers=admin_headers,
        )

        assert response.status_code == 422


def _legacy_key(project: str, role: str = "service_role") -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"ref": project, "role": role}).encode()).decode()
    return f"header.{payload.rstrip('=')}.signature"


def test_rejects_legacy_key_from_another_storage_project():
    with pytest.raises(ImageStorageError, match="different project"):
        _validate_key_project(
            _legacy_key("source-project"),
            "https://target-project.supabase.co",
        )


def test_accepts_matching_legacy_storage_key():
    _validate_key_project(
        _legacy_key("target-project"),
        "https://target-project.supabase.co",
    )


def test_accepts_new_server_secret_key_format():
    _validate_key_project("sb_secret_example", "https://target-project.supabase.co")
