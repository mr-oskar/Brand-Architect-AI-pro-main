from fastapi import APIRouter, Depends
from lib.db import DB
from .deps import require_auth

router = APIRouter()


@router.get("/dashboard/summary")
def dashboard_summary(user_id: str = Depends(require_auth)):
    with DB() as db:
        total_brands = db.fetchval(
            "SELECT COUNT(*) FROM brands WHERE user_id = %s", (user_id,)
        ) or 0

        brand_ids = db.fetchall(
            "SELECT id FROM brands WHERE user_id = %s", (user_id,)
        )
        bid_list = [b["id"] for b in brand_ids]

        total_campaigns = 0
        total_posts = 0
        if bid_list:
            placeholders = ",".join(["%s"] * len(bid_list))
            total_campaigns = db.fetchval(
                f"SELECT COUNT(*) FROM campaigns WHERE brand_id IN ({placeholders})", bid_list
            ) or 0
            campaign_ids = db.fetchall(
                f"SELECT id FROM campaigns WHERE brand_id IN ({placeholders})", bid_list
            )
            cid_list = [c["id"] for c in campaign_ids]
            if cid_list:
                cplaceholders = ",".join(["%s"] * len(cid_list))
                total_posts = db.fetchval(
                    f"SELECT COUNT(*) FROM posts WHERE campaign_id IN ({cplaceholders})", cid_list
                ) or 0

        recent_brands = db.fetchall(
            """
            SELECT id, company_name, industry, logo_url, status, created_at, updated_at
            FROM brands WHERE user_id = %s
            ORDER BY created_at DESC LIMIT 5
            """,
            (user_id,),
        )

    return {
        "totalBrands": total_brands,
        "totalCampaigns": total_campaigns,
        "totalPosts": total_posts,
        "recentBrands": recent_brands,
    }
