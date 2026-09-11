"""Validated admin image uploads backed by Supabase Storage."""

import base64
import binascii
import json
from datetime import datetime, timezone
from io import BytesIO
from urllib.parse import quote
from uuid import uuid4

import httpx
from PIL import Image, UnidentifiedImageError

from app.core.config import settings

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_DIMENSION = 6000
ALLOWED_IMAGE_TYPES = {
    "JPEG": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
}


class ImageStorageError(Exception):
    pass


def validate_image(data: bytes) -> tuple[str, str]:
    if not data:
        raise ValueError("Choose an image to upload")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Image must be 5 MB or smaller")

    try:
        with Image.open(BytesIO(data)) as image:
            image_format = image.format
            width, height = image.size
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("The selected file is not a valid image") from exc

    if image_format not in ALLOWED_IMAGE_TYPES:
        raise ValueError("Only PNG, JPEG, and WebP images are supported")
    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        raise ValueError("Image dimensions must not exceed 6000 x 6000 pixels")
    return ALLOWED_IMAGE_TYPES[image_format]


async def upload_public_image(data: bytes, purpose: str) -> str:
    extension, content_type = validate_image(data)
    secret_key = (settings.supabase_service_role_key or "").strip()
    if not secret_key:
        raise ImageStorageError("SUPABASE_SERVICE_ROLE_KEY is not configured")

    storage_project_url = (settings.supabase_storage_url or settings.supabase_url).rstrip("/")
    _validate_key_project(secret_key, storage_project_url)

    bucket = settings.supabase_storage_bucket
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    object_path = f"admin/{purpose}/{timestamp}-{uuid4().hex}.{extension}"
    encoded_path = quote(object_path, safe="/")
    storage_url = f"{storage_project_url}/storage/v1"
    headers = {"apikey": secret_key}
    if not secret_key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {secret_key}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{storage_url}/object/{bucket}/{encoded_path}",
                content=data,
                headers={
                    **headers,
                    "Content-Type": content_type,
                    "Cache-Control": "3600",
                    "x-upsert": "false",
                },
            )

            if response.status_code == 400 and "bucket not found" in response.text.lower():
                created = await client.post(
                    f"{storage_url}/bucket",
                    json={
                        "id": bucket,
                        "name": bucket,
                        "public": True,
                        "file_size_limit": MAX_IMAGE_BYTES,
                        "allowed_mime_types": [
                            mime for _, mime in ALLOWED_IMAGE_TYPES.values()
                        ],
                    },
                    headers=headers,
                )
                if created.status_code not in (200, 201):
                    raise ImageStorageError(_storage_error(created))
                response = await client.post(
                    f"{storage_url}/object/{bucket}/{encoded_path}",
                    content=data,
                    headers={
                        **headers,
                        "Content-Type": content_type,
                        "Cache-Control": "3600",
                        "x-upsert": "false",
                    },
                )
    except httpx.HTTPError as exc:
        raise ImageStorageError("Could not reach Supabase Storage") from exc

    if response.status_code not in (200, 201):
        raise ImageStorageError(_storage_error(response))

    return f"{storage_url}/object/public/{bucket}/{encoded_path}"


def _validate_key_project(secret_key: str, project_url: str) -> None:
    """Give a useful configuration error for legacy keys from another project."""
    if secret_key.startswith("sb_secret_"):
        return

    try:
        payload = secret_key.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
    except (IndexError, ValueError, UnicodeDecodeError, json.JSONDecodeError, binascii.Error):
        raise ImageStorageError("SUPABASE_SERVICE_ROLE_KEY is not a valid Supabase key")

    key_project = claims.get("ref")
    key_role = claims.get("role")
    url_project = project_url.removeprefix("https://").split(".", 1)[0]
    if key_role != "service_role":
        raise ImageStorageError("SUPABASE_SERVICE_ROLE_KEY does not have the service_role role")
    if key_project and key_project != url_project:
        raise ImageStorageError(
            "SUPABASE_SERVICE_ROLE_KEY belongs to a different project than "
            "SUPABASE_STORAGE_URL"
        )


def _storage_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
        message = payload.get("message") or payload.get("error")
        if message:
            return f"Supabase Storage rejected the upload: {message}"
    except ValueError:
        pass
    return f"Supabase Storage rejected the upload (HTTP {response.status_code})"
