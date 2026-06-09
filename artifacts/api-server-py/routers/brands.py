import json
import threading
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from lib.db import DB
from lib.ai import (
    generate_brand_kit,
    generate_brand_story,
    generate_campaign,
    analyze_brief,
    generate_image_with_references,
)
from lib.trends import fetch_industry_trends
from lib.image_storage import upload_image_buffer, storage_path_to_url, is_storage_path
from lib.credits import charge_credits, InsufficientCreditsError
from lib.job_store import create_job, update_job
from lib.pagination import parse_pagination, pagination_meta
from .deps import require_auth

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _brand_row(row: dict) -> dict:
    if is_storage_path(row.get("logoUrl")):
        row["logoUrl"] = storage_path_to_url(row["logoUrl"])
    return row


def _get_brand(brand_id: int, user_id: str, db: DB) -> dict:
    brand = db.fetchone(
        "SELECT * FROM brands WHERE id = %s AND user_id = %s", (brand_id, user_id)
    )
    if not brand:
        raise HTTPException(404, "Brand not found")
    return _brand_row(brand)


def _with_posts(posts: list[dict]) -> list[dict]:
    result = []
    for p in posts:
        if is_storage_path(p.get("imageUrl")):
            p["imageUrl"] = storage_path_to_url(p["imageUrl"])
        result.append(p)
    return result


# ── List / Create / Get / Update / Delete ──────────────────────────────────────

@router.get("/brands")
def list_brands(
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    q: Optional[str] = None,
    user_id: str = Depends(require_auth),
):
    p = parse_pagination(page=page, page_size=pageSize, q=q, default_page_size=50)
    with DB() as db:
        where_parts = ["user_id = %s"]
        params: list = [user_id]
        if p["q"]:
            where_parts.append("(company_name ILIKE %s OR industry ILIKE %s)")
            params += [f"%{p['q']}%", f"%{p['q']}%"]
        where = "WHERE " + " AND ".join(where_parts)
        total = db.fetchval(f"SELECT COUNT(*) FROM brands {where}", params) or 0
        rows = db.fetchall(
            f"""
            SELECT id, company_name, industry, logo_url, status, created_at, updated_at
            FROM brands {where} ORDER BY created_at DESC LIMIT %s OFFSET %s
            """,
            params + [p["limit"], p["offset"]],
        )
    return [_brand_row(r) for r in rows]


class CreateBrandBody(BaseModel):
    companyName: str
    companyDescription: str
    industry: str
    websiteUrl: Optional[str] = None
    logoUrl: Optional[str] = None


@router.post("/brands", status_code=201)
def create_brand(body: CreateBrandBody, user_id: str = Depends(require_auth)):
    with DB() as db:
        brand = db.fetchone(
            """
            INSERT INTO brands (user_id, company_name, company_description, industry, website_url, logo_url, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'draft') RETURNING *
            """,
            (user_id, body.companyName, body.companyDescription, body.industry, body.websiteUrl, body.logoUrl),
        )
    return _brand_row(brand)


@router.get("/brands/{brand_id}")
def get_brand(brand_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        return _get_brand(brand_id, user_id, db)


class UpdateBrandBody(BaseModel):
    companyName: Optional[str] = None
    companyDescription: Optional[str] = None
    industry: Optional[str] = None
    websiteUrl: Optional[str] = None
    logoUrl: Optional[str] = None


@router.patch("/brands/{brand_id}")
def update_brand(brand_id: int, body: UpdateBrandBody, user_id: str = Depends(require_auth)):
    updates, params = [], []
    if body.companyName is not None:
        updates.append("company_name = %s"); params.append(body.companyName)
    if body.companyDescription is not None:
        updates.append("company_description = %s"); params.append(body.companyDescription)
    if body.industry is not None:
        updates.append("industry = %s"); params.append(body.industry)
    if body.websiteUrl is not None:
        updates.append("website_url = %s"); params.append(body.websiteUrl)
    if body.logoUrl is not None:
        updates.append("logo_url = %s"); params.append(body.logoUrl)
    if not updates:
        return get_brand(brand_id, user_id)
    updates.append("updated_at = NOW()")
    params += [brand_id, user_id]
    with DB() as db:
        db.execute(f"UPDATE brands SET {', '.join(updates)} WHERE id = %s AND user_id = %s", params)
    return get_brand(brand_id, user_id)


@router.delete("/brands/{brand_id}", status_code=204)
def delete_brand(brand_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        db.execute("DELETE FROM brands WHERE id = %s AND user_id = %s", (brand_id, user_id))


# ── Generate Brand Kit ─────────────────────────────────────────────────────────

class GenerateKitBody(BaseModel):
    brandColors: Optional[list[str]] = None
    targetAudience: Optional[str] = None
    brandValues: Optional[list[str]] = None
    tonePreference: Optional[str] = None


@router.post("/brands/{brand_id}/generate-kit")
def brand_generate_kit(brand_id: int, body: GenerateKitBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "brand.generate-kit")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    with DB() as db:
        brand = _get_brand(brand_id, user_id, db)

    kit = generate_brand_kit(brand, body.model_dump(exclude_none=True))

    with DB() as db:
        updated = db.fetchone(
            """
            UPDATE brands SET brand_kit = %s, status = 'kit_ready', updated_at = NOW()
            WHERE id = %s AND user_id = %s RETURNING *
            """,
            (json.dumps(kit), brand_id, user_id),
        )
    return _brand_row(updated)


# ── Generate Logo Variants ─────────────────────────────────────────────────────

@router.post("/brands/{brand_id}/generate-logo-variants")
def brand_generate_logo_variants(brand_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        brand = _get_brand(brand_id, user_id, db)

    logo_url = brand.get("logoUrl")
    variants = {"original": logo_url, "black": logo_url, "white": logo_url, "grayscale": logo_url}
    extracted_colors: list[str] = []

    if logo_url:
        try:
            import httpx
            from PIL import Image, ImageOps
            import io

            r = httpx.get(logo_url, timeout=10, follow_redirects=True)
            original_bytes = r.content

            img = Image.open(io.BytesIO(original_bytes)).convert("RGBA")

            def _save(image: Image.Image) -> str:
                buf = io.BytesIO()
                image.save(buf, format="PNG")
                path = upload_image_buffer(buf.getvalue(), "image/png")
                return storage_path_to_url(path)

            grayscale = ImageOps.grayscale(img.convert("RGB"))
            grayscale_rgba = grayscale.convert("RGBA")

            black_bg = Image.new("RGB", img.size, (0, 0, 0))
            black_bg.paste(img, mask=img.split()[3] if img.mode == "RGBA" else None)

            white_bg = Image.new("RGB", img.size, (255, 255, 255))
            white_bg.paste(img, mask=img.split()[3] if img.mode == "RGBA" else None)

            variants = {
                "original": logo_url,
                "black": _save(black_bg),
                "white": _save(white_bg),
                "grayscale": _save(grayscale),
            }

            rgb_img = img.convert("RGB").resize((50, 50))
            pixels = list(rgb_img.getdata())
            color_counts: dict[tuple, int] = {}
            for px in pixels:
                bucket = (px[0] // 32 * 32, px[1] // 32 * 32, px[2] // 32 * 32)
                color_counts[bucket] = color_counts.get(bucket, 0) + 1
            top_colors = sorted(color_counts, key=lambda c: -color_counts[c])[:5]
            extracted_colors = ["#%02x%02x%02x" % c for c in top_colors]
        except Exception:
            pass

    with DB() as db:
        db.execute(
            "UPDATE brands SET logo_variants = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (json.dumps(variants), brand_id, user_id),
        )
        brand = _get_brand(brand_id, user_id, db)

    return {"logoVariants": variants, "extractedColors": extracted_colors, "brand": brand}


# ── Generate Brand Story ────────────────────────────────────────────────────────

@router.post("/brands/{brand_id}/generate-story")
def brand_generate_story(brand_id: int, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "brand.generate-story")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    with DB() as db:
        brand = _get_brand(brand_id, user_id, db)

    story = generate_brand_story(brand)
    kit = brand.get("brandKit") or {}
    kit["brandStory"] = story
    with DB() as db:
        db.execute(
            "UPDATE brands SET brand_kit = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (json.dumps(kit), brand_id, user_id),
        )
        brand = _get_brand(brand_id, user_id, db)

    return {"brandStory": story, "brand": brand}


# ── Generate Long-form Content ─────────────────────────────────────────────────

class GenerateContentBody(BaseModel):
    contentType: str
    topic: str


@router.post("/brands/{brand_id}/generate-content")
def brand_generate_content(brand_id: int, body: GenerateContentBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "brand.generate-content")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    with DB() as db:
        brand = _get_brand(brand_id, user_id, db)

    from lib.ai import generate_long_form_content
    fake_post = {"hook": body.topic, "caption": f"Content about {body.topic} for {brand.get('companyName', '')}.", "platform": "blog"}
    return generate_long_form_content(fake_post, brand, body.contentType)


# ── Generate Campaign (sync) ───────────────────────────────────────────────────

class GenerateCampaignBody(BaseModel):
    brief: Optional[str] = None
    postCount: Optional[int] = 7
    platforms: Optional[list[str]] = None


@router.post("/brands/{brand_id}/generate-campaign")
def brand_generate_campaign(brand_id: int, body: GenerateCampaignBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "campaign.generate")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    with DB() as db:
        brand = _get_brand(brand_id, user_id, db)

    post_count = max(1, min(body.postCount or 7, 14))
    platforms = body.platforms or ["instagram"]

    import asyncio
    try:
        loop = asyncio.get_event_loop()
        trends = loop.run_until_complete(fetch_industry_trends(brand.get("industry", ""), body.brief or ""))
    except Exception:
        from lib.trends import _fallback
        trends = _fallback(brand.get("industry", "business"))

    campaign_data = generate_campaign(
        brand=brand,
        brief=body.brief or "",
        post_count=post_count,
        platforms=platforms,
        trends_summary=trends.get("summary", ""),
    )

    return _save_campaign(brand_id, user_id, campaign_data)


# ── Generate Campaign (async job) ─────────────────────────────────────────────

@router.post("/brands/{brand_id}/generate-campaign-async", status_code=202)
def brand_generate_campaign_async(brand_id: int, body: GenerateCampaignBody, user_id: str = Depends(require_auth)):
    with DB() as db:
        _get_brand(brand_id, user_id, db)

    job_id = str(uuid.uuid4())
    create_job(job_id, total=3, user_id=user_id)

    def _run():
        try:
            update_job(job_id, status="running", progress=1)
            with DB() as db:
                brand = _get_brand(brand_id, user_id, db)

            import asyncio
            try:
                loop = asyncio.new_event_loop()
                trends = loop.run_until_complete(fetch_industry_trends(brand.get("industry", ""), body.brief or ""))
                loop.close()
            except Exception:
                from lib.trends import _fallback
                trends = _fallback(brand.get("industry", "business"))

            update_job(job_id, progress=2)
            campaign_data = generate_campaign(brand, body.brief or "", body.postCount or 7, body.platforms or ["instagram"], trends.get("summary", ""))
            result = _save_campaign(brand_id, user_id, campaign_data)
            update_job(job_id, status="done", progress=3, result=result)
        except Exception as e:
            update_job(job_id, status="failed", error=str(e))

    threading.Thread(target=_run, daemon=True).start()
    return {"jobId": job_id}


# ── Smart Campaign Brief Job ───────────────────────────────────────────────────

class CampaignBriefJobBody(BaseModel):
    brief: Optional[str] = None
    referenceImages: Optional[list[str]] = None
    postCount: Optional[int] = 7
    platforms: Optional[list[str]] = None


@router.post("/brands/{brand_id}/campaign-brief-job", status_code=202)
def brand_campaign_brief_job(brand_id: int, body: CampaignBriefJobBody, user_id: str = Depends(require_auth)):
    with DB() as db:
        _get_brand(brand_id, user_id, db)

    job_id = str(uuid.uuid4())
    create_job(job_id, total=6, user_id=user_id)

    def _run():
        try:
            update_job(job_id, status="running", progress=0)

            with DB() as db:
                brand = _get_brand(brand_id, user_id, db)

            update_job(job_id, progress=1)
            analyzed = analyze_brief(body.brief or "", body.referenceImages or [])

            update_job(job_id, progress=2)
            import asyncio
            try:
                loop = asyncio.new_event_loop()
                trends = loop.run_until_complete(fetch_industry_trends(brand.get("industry", ""), body.brief or ""))
                loop.close()
            except Exception:
                from lib.trends import _fallback
                trends = _fallback(brand.get("industry", "business"))

            update_job(job_id, progress=3)
            kit = brand.get("brandKit")
            if not kit:
                try:
                    charge_credits(user_id, "brand.generate-kit")
                    kit = generate_brand_kit(brand)
                    with DB() as db:
                        db.execute(
                            "UPDATE brands SET brand_kit = %s, status = 'kit_ready', updated_at = NOW() WHERE id = %s",
                            (json.dumps(kit), brand_id),
                        )
                    brand["brandKit"] = kit
                except Exception:
                    pass

            update_job(job_id, progress=4)
            post_count = max(1, min(body.postCount or 7, 14))
            platforms = body.platforms or ["instagram"]

            try:
                charge_credits(user_id, "campaign.generate")
            except InsufficientCreditsError:
                update_job(job_id, status="failed", error="Insufficient credits")
                return

            campaign_data = generate_campaign(
                brand=brand,
                brief=body.brief or "",
                post_count=post_count,
                platforms=platforms,
                trends_summary=trends.get("summary", ""),
                analyzed_brief=analyzed,
            )

            update_job(job_id, progress=5)
            result = _save_campaign(brand_id, user_id, campaign_data)
            update_job(job_id, status="done", progress=6, result=result)
        except Exception as e:
            update_job(job_id, status="failed", error=str(e))

    threading.Thread(target=_run, daemon=True).start()
    return {"jobId": job_id}


def _save_campaign(brand_id: int, user_id: str, campaign_data: dict) -> dict:
    title = campaign_data.get("title", "Campaign")
    strategy = campaign_data.get("strategy", "")
    posts_data = campaign_data.get("posts", [])

    with DB() as db:
        campaign = db.fetchone(
            "INSERT INTO campaigns (brand_id, title, strategy, days) VALUES (%s, %s, %s, '[]') RETURNING id, brand_id, title, strategy, created_at, updated_at",
            (brand_id, title, strategy),
        )
        campaign_id = campaign["id"]

        saved_posts = []
        for p in posts_data:
            post = db.fetchone(
                """
                INSERT INTO posts (campaign_id, day, platform, hook, caption, cta, hashtags, image_prompt)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, campaign_id, day, platform, hook, caption, cta, hashtags, image_prompt, image_url, image_history, created_at, updated_at
                """,
                (
                    campaign_id,
                    p.get("day", 1),
                    p.get("platform", "instagram"),
                    p.get("hook", ""),
                    p.get("caption", ""),
                    p.get("cta", ""),
                    p.get("hashtags", []),
                    p.get("imagePrompt", ""),
                ),
            )
            saved_posts.append(post)

    campaign["posts"] = saved_posts
    return campaign


# ── List Brand Campaigns ───────────────────────────────────────────────────────

@router.get("/brands/{brand_id}/campaigns")
def brand_list_campaigns(brand_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        _get_brand(brand_id, user_id, db)
        campaigns = db.fetchall(
            "SELECT id, brand_id, title, strategy, created_at, updated_at FROM campaigns WHERE brand_id = %s ORDER BY created_at DESC",
            (brand_id,),
        )
        for c in campaigns:
            posts = db.fetchall(
                """
                SELECT id, campaign_id, day, platform, hook, caption, cta,
                       hashtags, image_prompt, image_url, image_history, created_at, updated_at
                FROM posts WHERE campaign_id = %s ORDER BY day
                """,
                (c["id"],),
            )
            c["posts"] = _with_posts(posts)
    return campaigns


# ── Brand Stats ────────────────────────────────────────────────────────────────

@router.get("/brands/{brand_id}/stats")
def brand_stats(brand_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        brand = _get_brand(brand_id, user_id, db)
        total_campaigns = db.fetchval("SELECT COUNT(*) FROM campaigns WHERE brand_id = %s", (brand_id,)) or 0
        campaign_ids = [c["id"] for c in db.fetchall("SELECT id FROM campaigns WHERE brand_id = %s", (brand_id,))]

        total_posts = 0
        posts_with_images = 0
        last_campaign_date = None

        if campaign_ids:
            phs = ",".join(["%s"] * len(campaign_ids))
            total_posts = db.fetchval(f"SELECT COUNT(*) FROM posts WHERE campaign_id IN ({phs})", campaign_ids) or 0
            posts_with_images = db.fetchval(f"SELECT COUNT(*) FROM posts WHERE campaign_id IN ({phs}) AND image_url IS NOT NULL", campaign_ids) or 0
            last_row = db.fetchone("SELECT created_at FROM campaigns WHERE brand_id = %s ORDER BY created_at DESC LIMIT 1", (brand_id,))
            last_campaign_date = last_row.get("createdAt") if last_row else None

    kit = brand.get("brandKit") or {}
    return {
        "brandId": brand_id,
        "totalCampaigns": total_campaigns,
        "totalPosts": total_posts,
        "postsWithImages": posts_with_images,
        "brandKitGenerated": bool(kit),
        "hasExtendedKit": bool(kit.get("brandStory")),
        "lastCampaignDate": last_campaign_date,
    }
