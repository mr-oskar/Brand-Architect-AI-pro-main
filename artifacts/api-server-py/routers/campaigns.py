import threading
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from lib.db import DB
from lib.ai import generate_image_with_references
from lib.image_storage import upload_image_buffer, storage_path_to_url, is_storage_path
from lib.credits import charge_credits, InsufficientCreditsError
from .deps import require_auth

router = APIRouter()


def _format_post(p: dict) -> dict:
    if is_storage_path(p.get("imageUrl")):
        p["imageUrl"] = storage_path_to_url(p["imageUrl"])
    return p


def _get_campaign(campaign_id: int, user_id: str) -> dict:
    with DB() as db:
        campaign = db.fetchone(
            """
            SELECT c.id, c.brand_id, c.title, c.strategy, c.days,
                   c.schedule_start, c.schedule_end, c.created_at, c.updated_at
            FROM campaigns c
            JOIN brands b ON b.id = c.brand_id
            WHERE c.id = %s AND b.user_id = %s
            """,
            (campaign_id, user_id),
        )
        if not campaign:
            raise HTTPException(404, "Campaign not found")

        posts = db.fetchall(
            """
            SELECT id, campaign_id, day, platform, hook, caption, cta,
                   hashtags, image_prompt, image_url, image_history,
                   created_at, updated_at
            FROM posts WHERE campaign_id = %s ORDER BY day
            """,
            (campaign_id,),
        )
        brand = db.fetchone(
            "SELECT company_name, logo_url, brand_kit FROM brands WHERE id = %s",
            (campaign.get("brandId"),),
        )

    campaign["posts"] = [_format_post(p) for p in posts]
    kit = brand.get("brandKit") or {}
    palette = kit.get("colorPalette") or {}
    campaign["brand"] = {
        "companyName": brand.get("companyName"),
        "logoUrl": brand.get("logoUrl"),
        "primaryColor": palette.get("primary", "#1a1a2e"),
    }
    return campaign


@router.get("/campaigns/{campaign_id}")
def get_campaign(campaign_id: int, user_id: str = Depends(require_auth)):
    return _get_campaign(campaign_id, user_id)


class GenerateAllImagesBody(BaseModel):
    size: Optional[str] = "1024x1024"
    logoDataUrl: Optional[str] = None
    skipExisting: Optional[bool] = True


@router.post("/campaigns/{campaign_id}/generate-all-images")
def generate_all_images(
    campaign_id: int,
    body: GenerateAllImagesBody,
    user_id: str = Depends(require_auth),
):
    with DB() as db:
        campaign = db.fetchone(
            """
            SELECT c.id FROM campaigns c
            JOIN brands b ON b.id = c.brand_id
            WHERE c.id = %s AND b.user_id = %s
            """,
            (campaign_id, user_id),
        )
        if not campaign:
            raise HTTPException(404, "Campaign not found")

        posts = db.fetchall(
            "SELECT id, image_prompt, image_url FROM posts WHERE campaign_id = %s",
            (campaign_id,),
        )

    generated = 0
    failed = 0
    skipped = 0
    size = body.size or "1024x1024"
    valid_sizes = {"1024x1024", "1024x1536", "1536x1024"}
    if size not in valid_sizes:
        size = "1024x1024"

    for post in posts:
        if body.skipExisting and post.get("imageUrl"):
            skipped += 1
            continue
        try:
            charge_credits(user_id, "post.generate-image")
            prompt = post.get("imagePrompt", "Professional commercial photo")
            img_bytes = generate_image_with_references(prompt, size=size)
            path = upload_image_buffer(img_bytes)
            url = storage_path_to_url(path)
            with DB() as db:
                db.execute(
                    """
                    UPDATE posts
                    SET image_url = %s,
                        image_history = COALESCE(image_history, '[]'::jsonb) || %s::jsonb,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (path, f'[{{"url":"{url}","prompt":"{prompt[:100]}","createdAt":"{__import__("datetime").datetime.utcnow().isoformat()}"}}]', post["id"]),
                )
            generated += 1
        except InsufficientCreditsError:
            raise HTTPException(402, "Insufficient credits")
        except Exception:
            failed += 1

    return {"generated": generated, "failed": failed, "skipped": skipped, "total": len(posts)}
