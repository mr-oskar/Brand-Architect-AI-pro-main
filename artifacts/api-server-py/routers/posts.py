import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from lib.db import DB
from lib.ai import (
    regenerate_post,
    generate_post_variant,
    generate_long_form_content,
    generate_post_image,
)
from lib.image_storage import upload_image_buffer, storage_path_to_url, is_storage_path
from lib.credits import charge_credits, InsufficientCreditsError
from .deps import require_auth

router = APIRouter()


def _get_post(post_id: int, user_id: str) -> dict:
    with DB() as db:
        post = db.fetchone(
            """
            SELECT p.id, p.campaign_id, p.day, p.platform, p.hook, p.caption,
                   p.cta, p.hashtags, p.image_prompt, p.image_url,
                   p.image_history, p.created_at, p.updated_at
            FROM posts p
            JOIN campaigns c ON c.id = p.campaign_id
            JOIN brands b ON b.id = c.brand_id
            WHERE p.id = %s AND b.user_id = %s
            """,
            (post_id, user_id),
        )
    if not post:
        raise HTTPException(404, "Post not found")
    if is_storage_path(post.get("imageUrl")):
        post["imageUrl"] = storage_path_to_url(post["imageUrl"])
    return post


def _get_brand_for_post(post_id: int) -> dict:
    with DB() as db:
        return db.fetchone(
            """
            SELECT b.id, b.company_name, b.industry, b.brand_kit
            FROM brands b
            JOIN campaigns c ON c.brand_id = b.id
            JOIN posts p ON p.campaign_id = c.id
            WHERE p.id = %s
            """,
            (post_id,),
        ) or {}


@router.get("/posts/{post_id}")
def get_post(post_id: int, user_id: str = Depends(require_auth)):
    return _get_post(post_id, user_id)


class UpdatePostBody(BaseModel):
    caption: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None
    hashtags: Optional[list[str]] = None
    imagePrompt: Optional[str] = None
    platform: Optional[str] = None


@router.patch("/posts/{post_id}")
def update_post(post_id: int, body: UpdatePostBody, user_id: str = Depends(require_auth)):
    _get_post(post_id, user_id)

    updates = []
    params = []
    if body.caption is not None:
        updates.append("caption = %s"); params.append(body.caption)
    if body.hook is not None:
        updates.append("hook = %s"); params.append(body.hook)
    if body.cta is not None:
        updates.append("cta = %s"); params.append(body.cta)
    if body.hashtags is not None:
        updates.append("hashtags = %s"); params.append(body.hashtags)
    if body.imagePrompt is not None:
        updates.append("image_prompt = %s"); params.append(body.imagePrompt)
    if body.platform is not None:
        updates.append("platform = %s"); params.append(body.platform)

    if not updates:
        return _get_post(post_id, user_id)

    updates.append("updated_at = NOW()")
    params.append(post_id)

    with DB() as db:
        db.execute(
            f"UPDATE posts SET {', '.join(updates)} WHERE id = %s", params
        )
    return _get_post(post_id, user_id)


class GenerateImageBody(BaseModel):
    customPrompt: Optional[str] = None
    size: Optional[str] = "1024x1024"
    model: Optional[str] = "auto"
    logoDataUrl: Optional[str] = None
    overlayText: Optional[str] = None
    brandName: Optional[str] = None
    referenceImages: Optional[list[dict]] = None


@router.post("/posts/{post_id}/generate-image")
def post_generate_image(
    post_id: int,
    body: GenerateImageBody,
    user_id: str = Depends(require_auth),
):
    post = _get_post(post_id, user_id)
    brand = _get_brand_for_post(post_id)

    try:
        charge_credits(user_id, "post.generate-image")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    prompt = body.customPrompt or post.get("imagePrompt") or "Professional commercial photo"
    size = body.size or "1024x1024"
    valid_sizes = {"1024x1024", "1024x1536", "1536x1024"}
    if size not in valid_sizes:
        size = "1024x1024"

    try:
        img_bytes = generate_post_image(
            prompt=prompt,
            size=size,
            logo_data_url=body.logoDataUrl,
            overlay_text=body.overlayText,
            brand_name=body.brandName or brand.get("companyName"),
            reference_images=body.referenceImages,
            model=body.model or "auto",
        )
        path = upload_image_buffer(img_bytes)
        url = storage_path_to_url(path)

        history_entry = json.dumps({"url": url, "prompt": prompt[:200], "createdAt": datetime.utcnow().isoformat()})
        with DB() as db:
            db.execute(
                """
                UPDATE posts
                SET image_url = %s,
                    image_history = COALESCE(image_history, '[]'::jsonb) || %s::jsonb,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (path, f"[{history_entry}]", post_id),
            )
        return _get_post(post_id, user_id)
    except Exception as e:
        raise HTTPException(500, f"Image generation failed: {str(e)}")


class RestoreImageBody(BaseModel):
    url: str


@router.post("/posts/{post_id}/restore-image")
def restore_image(post_id: int, body: RestoreImageBody, user_id: str = Depends(require_auth)):
    _get_post(post_id, user_id)
    with DB() as db:
        db.execute(
            "UPDATE posts SET image_url = %s, updated_at = NOW() WHERE id = %s",
            (body.url, post_id),
        )
    return _get_post(post_id, user_id)


@router.post("/posts/{post_id}/regenerate")
def regenerate_post_content(post_id: int, user_id: str = Depends(require_auth)):
    post = _get_post(post_id, user_id)
    brand = _get_brand_for_post(post_id)

    try:
        charge_credits(user_id, "post.regenerate")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    new_content = regenerate_post(post, brand)

    with DB() as db:
        db.execute(
            """
            UPDATE posts SET hook = %s, caption = %s, cta = %s,
                hashtags = %s, image_prompt = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (
                new_content.get("hook", post.get("hook")),
                new_content.get("caption", post.get("caption")),
                new_content.get("cta", post.get("cta")),
                new_content.get("hashtags", post.get("hashtags")),
                new_content.get("imagePrompt", post.get("imagePrompt")),
                post_id,
            ),
        )
    return _get_post(post_id, user_id)


@router.post("/posts/{post_id}/generate-variant")
def generate_variant(post_id: int, user_id: str = Depends(require_auth)):
    post = _get_post(post_id, user_id)
    brand = _get_brand_for_post(post_id)
    kit = brand.get("brandKit") or {}

    variant = generate_post_variant(
        company_name=brand.get("companyName", ""),
        industry=brand.get("industry", ""),
        brand_kit=kit,
        original_post=post,
    )
    return variant


class LongFormBody(BaseModel):
    contentType: str


@router.post("/posts/{post_id}/generate-content")
def generate_content(post_id: int, body: LongFormBody, user_id: str = Depends(require_auth)):
    post = _get_post(post_id, user_id)
    brand = _get_brand_for_post(post_id)

    if body.contentType not in ("blog", "email", "newsletter"):
        raise HTTPException(400, "Invalid contentType")

    result = generate_long_form_content(post, brand, body.contentType)
    return result
