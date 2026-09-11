"""Admin-authenticated image uploads for portal-managed public artwork."""

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.core.deps import get_current_admin
from app.services.image_storage import ImageStorageError, MAX_IMAGE_BYTES, upload_public_image

router = APIRouter(
    prefix="/officer/uploads",
    tags=["admin-uploads"],
    dependencies=[Depends(get_current_admin)],
)


@router.post("/image")
async def upload_admin_image(
    file: UploadFile = File(...),
    purpose: Literal["payment-qr", "event-cover"] = Form(...),
):
    data = await file.read(MAX_IMAGE_BYTES + 1)
    await file.close()

    try:
        url = await upload_public_image(data, purpose)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ImageStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return {"url": url}
