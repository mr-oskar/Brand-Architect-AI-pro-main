import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response as FastAPIResponse
from lib.image_storage import stream_stored_image

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)
router = APIRouter()


@router.get("/storage/images/objects/uploads/{image_id}")
def serve_image(image_id: str):
    if not UUID_RE.match(image_id):
        raise HTTPException(400, "Invalid image ID")

    result = stream_stored_image(f"/objects/uploads/{image_id}")
    if not result:
        raise HTTPException(404, "Image not found")

    data, content_type = result
    return FastAPIResponse(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
