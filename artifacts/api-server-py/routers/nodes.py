import base64
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
from lib.ai import generate_image_with_references, extract_image_style, expand_prompts
from lib.image_storage import upload_image_buffer, storage_path_to_url
from lib.credits import charge_credits, InsufficientCreditsError
from .deps import require_auth

router = APIRouter()


class GenerateImageBody(BaseModel):
    prompt: str
    referenceImages: Optional[list[dict]] = None
    size: Optional[str] = "1024x1024"
    quality: Optional[str] = "auto"
    background: Optional[str] = "auto"
    model: Optional[str] = "auto"
    upscale: Optional[int] = 1


@router.post("/nodes/generate-image")
def nodes_generate_image(body: GenerateImageBody, user_id: str = Depends(require_auth)):
    upscale = max(1, min(body.upscale or 1, 4))
    try:
        charge_credits(user_id, "nodes.generate-image", upscale)
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    size = body.size or "1024x1024"
    valid_sizes = {"1024x1024", "1024x1536", "1536x1024"}
    if size not in valid_sizes:
        size = "1024x1024"

    try:
        img_bytes = generate_image_with_references(
            prompt=body.prompt,
            reference_images=body.referenceImages,
            size=size,
            quality=body.quality or "auto",
            background=body.background or "auto",
            model=body.model or "auto",
        )

        if upscale > 1:
            try:
                from PIL import Image
                import io
                img = Image.open(io.BytesIO(img_bytes))
                w, h = img.size
                img = img.resize((w * upscale, h * upscale), Image.LANCZOS)
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                img_bytes = buf.getvalue()
            except Exception:
                pass

        path = upload_image_buffer(img_bytes)
        return {"imageUrl": storage_path_to_url(path), "path": path}
    except Exception as e:
        raise HTTPException(500, str(e))


class ExtractStyleBody(BaseModel):
    imageBase64: Optional[str] = None
    imageUrl: Optional[str] = None


@router.post("/nodes/extract-style")
def nodes_extract_style(body: ExtractStyleBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "nodes.extract-style")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    b64 = body.imageBase64 or ""
    if body.imageUrl and not b64:
        import httpx
        try:
            r = httpx.get(body.imageUrl, timeout=10)
            b64 = base64.b64encode(r.content).decode()
        except Exception:
            raise HTTPException(400, "Could not fetch image")

    if "," in b64:
        b64 = b64.split(",", 1)[1]

    style = extract_image_style(b64)
    return {"stylePrompt": style}


class ExpandPromptsBody(BaseModel):
    basePrompt: str
    n: Optional[int] = 4
    mode: Optional[str] = "variations"


@router.post("/nodes/expand-prompts")
def nodes_expand_prompts(body: ExpandPromptsBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "nodes.expand-prompts")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    prompts = expand_prompts(body.basePrompt, body.n or 4, body.mode or "variations")
    return {"prompts": prompts}
