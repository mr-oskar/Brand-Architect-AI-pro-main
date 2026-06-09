import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from lib.db import DB
from lib.publisher import publish_post
from .deps import require_auth, require_admin

router = APIRouter()


def _fmt_post(p: dict) -> dict:
    for f in ("scheduledAt", "publishedAt", "createdAt", "updatedAt"):
        if p.get(f) and hasattr(p[f], "isoformat"):
            p[f] = p[f].isoformat()
    return p


def _assert_brand_owned(brand_id: int, user_id: str, db) -> dict:
    brand = db.fetchone("SELECT id FROM brands WHERE id = %s AND user_id = %s", (brand_id, user_id))
    if not brand:
        raise HTTPException(404, "Brand not found")
    return brand


def _assert_campaign_owned(campaign_id: int, user_id: str, db) -> dict:
    campaign = db.fetchone("SELECT id, brand_id FROM campaigns WHERE id = %s", (campaign_id,))
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    _assert_brand_owned(campaign["brand_id"], user_id, db)
    return campaign


def _assert_post_owned(post_id: int, user_id: str, db) -> tuple[dict, dict]:
    post = db.fetchone("SELECT * FROM posts WHERE id = %s", (post_id,))
    if not post:
        raise HTTPException(404, "Post not found")
    campaign = db.fetchone("SELECT * FROM campaigns WHERE id = %s", (post["campaign_id"],))
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    _assert_brand_owned(campaign["brand_id"], user_id, db)
    return post, campaign


# ── Social Accounts ────────────────────────────────────────────────────────────

@router.get("/brands/{brand_id}/social-accounts")
def list_social_accounts(brand_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        _assert_brand_owned(brand_id, user_id, db)
        accounts = db.fetchall(
            "SELECT id, brand_id, platform, account_name, account_id, page_id, created_at FROM social_accounts WHERE brand_id = %s",
            (brand_id,),
        )
    return accounts


class ConnectAccountBody(BaseModel):
    platform: str
    accountName: str
    accountId: Optional[str] = None
    accessToken: str
    refreshToken: Optional[str] = None
    pageId: Optional[str] = None


@router.post("/brands/{brand_id}/social-accounts", status_code=201)
def connect_social_account(brand_id: int, body: ConnectAccountBody, user_id: str = Depends(require_auth)):
    if not body.platform or not body.accountName or not body.accessToken:
        raise HTTPException(400, "platform, accountName, and accessToken are required")
    with DB() as db:
        _assert_brand_owned(brand_id, user_id, db)
        existing = db.fetchone(
            "SELECT id FROM social_accounts WHERE brand_id = %s AND platform = %s",
            (brand_id, body.platform),
        )
        if existing:
            acc = db.fetchone(
                """UPDATE social_accounts SET account_name = %s, account_id = %s, access_token = %s,
                   refresh_token = %s, page_id = %s WHERE id = %s RETURNING *""",
                (body.accountName, body.accountId, body.accessToken, body.refreshToken, body.pageId, existing["id"]),
            )
        else:
            acc = db.fetchone(
                """INSERT INTO social_accounts (brand_id, platform, account_name, account_id, access_token, refresh_token, page_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (brand_id, body.platform, body.accountName, body.accountId, body.accessToken, body.refreshToken, body.pageId),
            )
    return {
        "id": acc["id"],
        "brandId": acc["brand_id"],
        "platform": acc["platform"],
        "accountName": acc["account_name"],
        "accountId": acc["account_id"],
        "pageId": acc["page_id"],
        "createdAt": acc["created_at"].isoformat() if acc.get("created_at") else None,
    }


@router.delete("/social-accounts/{account_id}", status_code=204)
def delete_social_account(account_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        acc = db.fetchone("SELECT id, brand_id FROM social_accounts WHERE id = %s", (account_id,))
        if not acc:
            raise HTTPException(404, "Account not found")
        _assert_brand_owned(acc["brand_id"], user_id, db)
        db.execute("DELETE FROM social_accounts WHERE id = %s", (account_id,))


# ── Schedule Campaign ─────────────────────────────────────────────────────────

class ScheduleBody(BaseModel):
    startDate: str
    endDate: Optional[str] = None
    publishHour: Optional[int] = 9
    publishMinute: Optional[int] = 0


@router.post("/campaigns/{campaign_id}/schedule")
def schedule_campaign(campaign_id: int, body: ScheduleBody, user_id: str = Depends(require_auth)):
    if not body.startDate:
        raise HTTPException(400, "startDate is required")

    with DB() as db:
        campaign = _assert_campaign_owned(campaign_id, user_id, db)
        posts = db.fetchall(
            "SELECT id, day FROM posts WHERE campaign_id = %s ORDER BY day",
            (campaign_id,),
        )
        if not posts:
            raise HTTPException(400, "No posts found for campaign")

        start = datetime.fromisoformat(body.startDate.replace("Z", "+00:00"))
        max_day = max(p["day"] for p in posts)

        if body.endDate:
            end = datetime.fromisoformat(body.endDate.replace("Z", "+00:00"))
        else:
            from datetime import timedelta
            end = start + timedelta(days=max_day - 1)

        total_range = max(
            int((end - start).total_seconds() / 86400),
            max_day - 1,
        )

        ph = body.publishHour or 9
        pm = body.publishMinute or 0

        for i, post in enumerate(posts):
            from datetime import timedelta
            offset = round((i / (len(posts) - 1 or 1)) * total_range) if total_range > 0 else i
            scheduled = start + timedelta(days=offset)
            scheduled = scheduled.replace(hour=ph, minute=pm, second=0, microsecond=0)
            db.execute(
                "UPDATE posts SET scheduled_at = %s, publish_status = 'scheduled' WHERE id = %s",
                (scheduled, post["id"]),
            )

        db.execute(
            """UPDATE campaigns SET schedule_start = %s, schedule_end = %s,
               publish_time_hour = %s, publish_time_minute = %s WHERE id = %s""",
            (start, end, ph, pm, campaign_id),
        )

        updated_posts = db.fetchall("SELECT * FROM posts WHERE campaign_id = %s", (campaign_id,))

    return {
        "message": "Campaign scheduled successfully",
        "scheduleStart": start.isoformat(),
        "scheduleEnd": end.isoformat(),
        "posts": [_fmt_post(p) for p in updated_posts],
    }


@router.get("/campaigns/{campaign_id}/schedule")
def get_campaign_schedule(campaign_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        campaign = _assert_campaign_owned(campaign_id, user_id, db)
        full_campaign = db.fetchone("SELECT * FROM campaigns WHERE id = %s", (campaign_id,))
        posts = db.fetchall("SELECT * FROM posts WHERE campaign_id = %s", (campaign_id,))

    return {
        "campaignId": campaign_id,
        "scheduleStart": full_campaign.get("schedule_start").isoformat() if full_campaign.get("schedule_start") else None,
        "scheduleEnd": full_campaign.get("schedule_end").isoformat() if full_campaign.get("schedule_end") else None,
        "publishTimeHour": full_campaign.get("publish_time_hour"),
        "publishTimeMinute": full_campaign.get("publish_time_minute"),
        "posts": [_fmt_post(p) for p in posts],
    }


# ── Publish Post Now ──────────────────────────────────────────────────────────

@router.post("/posts/{post_id}/publish")
def publish_post_now(post_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        post, campaign = _assert_post_owned(post_id, user_id, db)
        account = db.fetchone(
            "SELECT * FROM social_accounts WHERE brand_id = %s AND platform = %s LIMIT 1",
            (campaign["brand_id"], post["platform"]),
        )
        if not account:
            raise HTTPException(400, f"No {post['platform']} account connected for this brand")

        result = publish_post(
            platform=account["platform"],
            access_token=account["access_token"],
            account_id=account.get("account_id") or str(account["id"]),
            page_id=account.get("page_id"),
            caption=post.get("caption") or "",
            image_url=post.get("image_url"),
            hashtags=post.get("hashtags") or [],
        )

        updated = db.fetchone(
            """UPDATE posts SET publish_status = %s, published_at = %s, publish_error = %s,
               external_post_id = %s WHERE id = %s RETURNING *""",
            (
                "published" if result.success else "failed",
                datetime.now(timezone.utc) if result.success else None,
                result.error,
                result.external_post_id,
                post_id,
            ),
        )

    return {
        "success": result.success,
        "error": result.error,
        "externalPostId": result.external_post_id,
        "post": _fmt_post(updated),
    }


@router.post("/posts/{post_id}/unschedule")
def unschedule_post(post_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        _assert_post_owned(post_id, user_id, db)
        updated = db.fetchone(
            "UPDATE posts SET scheduled_at = NULL, publish_status = 'draft' WHERE id = %s RETURNING *",
            (post_id,),
        )
    if not updated:
        raise HTTPException(404, "Post not found")
    return _fmt_post(updated)


# ── Scheduler Run (admin) ─────────────────────────────────────────────────────

@router.post("/scheduler/run")
def scheduler_run(user_id: str = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    results = []

    with DB() as db:
        due_posts = db.fetchall(
            "SELECT * FROM posts WHERE scheduled_at <= %s AND published_at IS NULL AND publish_status = 'scheduled'",
            (now,),
        )

        for post in due_posts:
            campaign = db.fetchone("SELECT * FROM campaigns WHERE id = %s", (post["campaign_id"],))
            if not campaign:
                continue

            account = db.fetchone(
                "SELECT * FROM social_accounts WHERE brand_id = %s AND platform = %s LIMIT 1",
                (campaign["brand_id"], post["platform"]),
            )
            if not account:
                continue

            result = publish_post(
                platform=account["platform"],
                access_token=account["access_token"],
                account_id=account.get("account_id") or str(account["id"]),
                page_id=account.get("page_id"),
                caption=post.get("caption") or "",
                image_url=post.get("image_url"),
                hashtags=post.get("hashtags") or [],
            )

            db.execute(
                """UPDATE posts SET publish_status = %s, published_at = %s,
                   publish_error = %s, external_post_id = %s WHERE id = %s""",
                (
                    "published" if result.success else "failed",
                    datetime.now(timezone.utc) if result.success else None,
                    result.error,
                    result.external_post_id,
                    post["id"],
                ),
            )
            results.append({"postId": post["id"], "success": result.success, "error": result.error})

    return {"processed": len(results), "results": results}
