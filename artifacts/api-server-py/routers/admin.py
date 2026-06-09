import hashlib
import json
import os
import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any, List
from lib.db import DB
from lib.auth import hash_password
from lib.pagination import parse_pagination, pagination_meta
from .deps import require_admin, require_auth

router = APIRouter(prefix="/admin")
public_router = APIRouter()


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
def admin_stats(user_id: str = Depends(require_admin)):
    with DB() as db:
        users_count = db.fetchval("SELECT COUNT(*) FROM users") or 0
        brands_count = db.fetchval("SELECT COUNT(*) FROM brands") or 0
        campaigns_count = db.fetchval("SELECT COUNT(*) FROM campaigns") or 0
        posts_count = db.fetchval("SELECT COUNT(*) FROM posts") or 0
        recent_brands = db.fetchall(
            "SELECT id, company_name, industry, status, created_at FROM brands ORDER BY created_at DESC LIMIT 5"
        )
    return {
        "counts": {"users": users_count, "brands": brands_count, "campaigns": campaigns_count, "posts": posts_count},
        "postsByStatus": [],
        "recentBrands": recent_brands,
        "env": {
            "gemini": bool(os.environ.get("GEMINI_API_KEY")),
            "openai": bool(os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")),
            "clerk": bool(os.environ.get("CLERK_SECRET_KEY")),
            "demoMode": os.environ.get("AUTH_ALLOW_DEMO") == "1",
            "nodeEnv": os.environ.get("NODE_ENV", "development"),
        },
    }


# ── Users ──────────────────────────────────────────────────────────────────────

@router.get("/users")
def admin_list_users(
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    q: Optional[str] = None,
    user_id: str = Depends(require_admin),
):
    p = parse_pagination(page=page, page_size=pageSize, q=q, default_page_size=20)
    with DB() as db:
        where = "WHERE email ILIKE %s OR name ILIKE %s" if p["q"] else ""
        base_params = ([f"%{p['q']}%", f"%{p['q']}%"] if p["q"] else [])
        total = db.fetchval(f"SELECT COUNT(*) FROM users {where}", base_params) or 0
        users = db.fetchall(
            f"SELECT id, email, name, role, status, credits, created_at FROM users {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
            base_params + [p["limit"], p["offset"]],
        )
        for u in users:
            u["brandCount"] = db.fetchval("SELECT COUNT(*) FROM brands WHERE user_id = %s", (u["id"],)) or 0
    return {"users": users, "pagination": pagination_meta(p, total)}


class CreateUserBody(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    role: Optional[str] = "user"


@router.post("/users")
def admin_create_user(body: CreateUserBody, user_id: str = Depends(require_admin)):
    pw_hash = hash_password(body.password)
    with DB() as db:
        existing = db.fetchone("SELECT id FROM users WHERE email = %s", (body.email.lower(),))
        if existing:
            raise HTTPException(409, "User with this email already exists")
        user = db.fetchone(
            "INSERT INTO users (email, password_hash, name, role, status, credits) VALUES (%s, %s, %s, %s, 'active', 100) RETURNING id, email, name, role, status, credits",
            (body.email.lower(), pw_hash, body.name, body.role or "user"),
        )
    user["brandCount"] = 0
    return {"user": user}


class UpdateUserBody(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    credits: Optional[int] = None


@router.patch("/users/{target_id}")
def admin_update_user(target_id: str, body: UpdateUserBody, user_id: str = Depends(require_admin)):
    updates, params = [], []
    if body.name is not None:
        updates.append("name = %s"); params.append(body.name)
    if body.role is not None:
        updates.append("role = %s"); params.append(body.role)
    if body.status is not None:
        updates.append("status = %s"); params.append(body.status)
    if body.credits is not None:
        updates.append("credits = %s"); params.append(body.credits)
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates.append("updated_at = NOW()")
    params.append(target_id)
    with DB() as db:
        user = db.fetchone(
            f"UPDATE users SET {', '.join(updates)} WHERE id = %s RETURNING id, email, name, role, status, credits",
            params,
        )
    if not user:
        raise HTTPException(404, "User not found")
    return {"user": user}


class ResetPasswordBody(BaseModel):
    password: str


@router.post("/users/{target_id}/reset-password")
def admin_reset_password(target_id: str, body: ResetPasswordBody, user_id: str = Depends(require_admin)):
    if len(body.password) < 8:
        raise HTTPException(400, "Password too short")
    pw_hash = hash_password(body.password)
    with DB() as db:
        db.execute("UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s", (pw_hash, target_id))
    return {"ok": True}


@router.delete("/users/{target_id}")
def admin_delete_user(target_id: str, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("DELETE FROM brands WHERE user_id = %s", (target_id,))
        db.execute("DELETE FROM users WHERE id = %s", (target_id,))
    return {"ok": True}


# ── Brands / Campaigns / Posts ─────────────────────────────────────────────────

@router.get("/brands")
def admin_list_brands(page: Optional[int] = None, pageSize: Optional[int] = None, user_id: str = Depends(require_admin)):
    p = parse_pagination(page=page, page_size=pageSize, default_page_size=20)
    with DB() as db:
        total = db.fetchval("SELECT COUNT(*) FROM brands") or 0
        brands = db.fetchall("SELECT id, company_name, industry, status, user_id, created_at FROM brands ORDER BY created_at DESC LIMIT %s OFFSET %s", [p["limit"], p["offset"]])
    return {"brands": brands, "pagination": pagination_meta(p, total)}


@router.delete("/brands/{brand_id}")
def admin_delete_brand(brand_id: int, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("DELETE FROM brands WHERE id = %s", (brand_id,))
    return {"ok": True}


@router.get("/campaigns")
def admin_list_campaigns(page: Optional[int] = None, pageSize: Optional[int] = None, user_id: str = Depends(require_admin)):
    p = parse_pagination(page=page, page_size=pageSize, default_page_size=20)
    with DB() as db:
        total = db.fetchval("SELECT COUNT(*) FROM campaigns") or 0
        rows = db.fetchall("SELECT id, brand_id, title, created_at FROM campaigns ORDER BY created_at DESC LIMIT %s OFFSET %s", [p["limit"], p["offset"]])
    return {"campaigns": rows, "pagination": pagination_meta(p, total)}


@router.delete("/campaigns/{campaign_id}")
def admin_delete_campaign(campaign_id: int, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("DELETE FROM campaigns WHERE id = %s", (campaign_id,))
    return {"ok": True}


@router.get("/posts")
def admin_list_posts(page: Optional[int] = None, pageSize: Optional[int] = None, user_id: str = Depends(require_admin)):
    p = parse_pagination(page=page, page_size=pageSize, default_page_size=20)
    with DB() as db:
        total = db.fetchval("SELECT COUNT(*) FROM posts") or 0
        rows = db.fetchall("SELECT id, campaign_id, day, platform, created_at FROM posts ORDER BY created_at DESC LIMIT %s OFFSET %s", [p["limit"], p["offset"]])
    return {"posts": rows, "pagination": pagination_meta(p, total)}


@router.delete("/posts/{post_id}")
def admin_delete_post(post_id: int, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("DELETE FROM posts WHERE id = %s", (post_id,))
    return {"ok": True}


# ── Settings ───────────────────────────────────────────────────────────────────

SETTING_DEFAULTS = {
    "ai": {"imageModel": "gemini-2.0-flash-exp-image-generation", "textModel": "gpt-4o-mini", "maxTokens": 4096, "temperature": 0.7},
    "credits": {"brand.generate-kit": 50, "post.generate-image": 10, "campaign.generate": 30},
    "features": {"demoMode": False, "allowRegistration": True},
}


@router.get("/settings")
def admin_get_settings(user_id: str = Depends(require_admin)):
    with DB() as db:
        rows = db.fetchall("SELECT key, value FROM app_settings")
    settings = {**SETTING_DEFAULTS}
    for row in rows:
        settings[row["key"]] = row["value"]
    return {"settings": settings}


class UpdateSettingsBody(BaseModel):
    settings: dict[str, Any]


@router.put("/settings")
def admin_update_settings(body: UpdateSettingsBody, user_id: str = Depends(require_admin)):
    with DB() as db:
        for key, value in body.settings.items():
            db.execute(
                "INSERT INTO app_settings (key, value, updated_at) VALUES (%s, %s, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
                (key, json.dumps(value)),
            )
    return {"ok": True}


# ── Audit Logs ─────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
def admin_audit_logs(user_id: str = Depends(require_admin)):
    with DB() as db:
        rows = db.fetchall("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100")
    return {"logs": rows}


# ── Events stream (usage_events) ───────────────────────────────────────────────

@router.get("/events")
def admin_events(
    limit: int = 100,
    kind: Optional[str] = None,
    errorsOnly: Optional[str] = None,
    user_id: str = Depends(require_admin),
):
    conditions = []
    params: list = []
    if kind and kind != "all":
        conditions.append("ue.kind = %s")
        params.append(kind)
    if errorsOnly == "1":
        conditions.append("ue.status_code >= 400")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(min(limit, 500))
    with DB() as db:
        rows = db.fetchall(
            f"""
            SELECT ue.id, ue.kind, ue.route, ue.method, ue.status_code, ue.duration_ms,
                   ue.tokens_used, ue.user_id, ue.created_at, u.email as user_email
            FROM usage_events ue
            LEFT JOIN users u ON ue.user_id = u.id::text
            {where}
            ORDER BY ue.created_at DESC
            LIMIT %s
            """,
            params,
        )
    events = []
    for r in rows:
        events.append({
            "id": r["id"],
            "kind": r["kind"],
            "route": r["route"],
            "method": r["method"],
            "statusCode": r["status_code"],
            "durationMs": r["duration_ms"],
            "tokensUsed": r["tokens_used"],
            "userId": r["user_id"],
            "userEmail": r.get("user_email"),
            "createdAt": r["created_at"],
        })
    return {"events": events}


# ── Usage analytics ────────────────────────────────────────────────────────────

@router.get("/usage")
def admin_usage(days: int = 14, user_id: str = Depends(require_admin)):
    days = max(1, min(days, 365))
    with DB() as db:
        by_day = db.fetchall(
            f"""
            SELECT DATE(created_at) as day, COUNT(*) as requests,
                   COUNT(*) FILTER (WHERE status_code >= 400) as errors,
                   COALESCE(AVG(duration_ms), 0)::int as avg_latency
            FROM usage_events
            WHERE created_at >= NOW() - INTERVAL '{days} days'
            GROUP BY DATE(created_at) ORDER BY day
            """
        )
        by_kind = db.fetchall(
            f"""
            SELECT kind, COUNT(*) as count, COALESCE(SUM(tokens_used), 0) as tokens
            FROM usage_events
            WHERE created_at >= NOW() - INTERVAL '{days} days'
            GROUP BY kind ORDER BY count DESC
            """
        )
        top_users = db.fetchall(
            f"""
            SELECT ue.user_id, u.email, COUNT(*) as requests
            FROM usage_events ue
            LEFT JOIN users u ON ue.user_id = u.id::text
            WHERE ue.created_at >= NOW() - INTERVAL '{days} days'
            GROUP BY ue.user_id, u.email ORDER BY requests DESC LIMIT 20
            """
        )
        top_routes = db.fetchall(
            f"""
            SELECT route, COUNT(*) as count, COALESCE(AVG(duration_ms), 0)::int as avg_latency
            FROM usage_events
            WHERE created_at >= NOW() - INTERVAL '{days} days'
            GROUP BY route ORDER BY count DESC LIMIT 20
            """
        )
    for r in by_day:
        if r.get("day"):
            r["day"] = str(r["day"])
    return {"byDay": by_day, "byKind": by_kind, "topUsers": top_users, "topRoutes": top_routes}


# ── Workflows / Funnel ─────────────────────────────────────────────────────────

@router.get("/workflows")
def admin_workflows(user_id: str = Depends(require_admin)):
    with DB() as db:
        total_users = db.fetchval("SELECT COUNT(*) FROM users") or 0
        users_with_brand = db.fetchval("SELECT COUNT(DISTINCT user_id) FROM brands") or 0
        users_with_campaign = db.fetchval(
            "SELECT COUNT(DISTINCT b.user_id) FROM campaigns c JOIN brands b ON c.brand_id = b.id"
        ) or 0
        users_with_post = db.fetchval(
            "SELECT COUNT(DISTINCT b.user_id) FROM posts p JOIN campaigns c ON p.campaign_id = c.id JOIN brands b ON c.brand_id = b.id"
        ) or 0
        signups_by_day = db.fetchall(
            """
            SELECT DATE(created_at) as day, COUNT(*) as signups
            FROM users
            WHERE created_at >= NOW() - INTERVAL '14 days'
            GROUP BY DATE(created_at) ORDER BY day
            """
        )
    for r in signups_by_day:
        if r.get("day"):
            r["day"] = str(r["day"])
    funnel = [
        {"step": "Signed up", "count": int(total_users), "rate": 100},
        {"step": "Created a brand", "count": int(users_with_brand),
         "rate": round(int(users_with_brand) / max(int(total_users), 1) * 100, 1)},
        {"step": "Generated a campaign", "count": int(users_with_campaign),
         "rate": round(int(users_with_campaign) / max(int(total_users), 1) * 100, 1)},
        {"step": "Has posts", "count": int(users_with_post),
         "rate": round(int(users_with_post) / max(int(total_users), 1) * 100, 1)},
    ]
    return {"funnel": funnel, "signupsByDay": signups_by_day}


# ── Plans ──────────────────────────────────────────────────────────────────────

@router.get("/plans")
def admin_list_plans(user_id: str = Depends(require_admin)):
    with DB() as db:
        plans = db.fetchall("SELECT * FROM plans ORDER BY sort_order")
    return {"plans": plans}


class CreatePlanBody(BaseModel):
    id: str
    name: str
    priceCents: Optional[int] = 0
    interval: Optional[str] = "month"
    isActive: Optional[bool] = True
    isDefault: Optional[bool] = False
    sortOrder: Optional[int] = 0
    limits: Optional[dict] = None
    features: Optional[list] = None


@router.post("/plans")
def admin_create_plan(body: CreatePlanBody, user_id: str = Depends(require_admin)):
    with DB() as db:
        plan = db.fetchone(
            "INSERT INTO plans (id, name, price_cents, interval, is_active, is_default, sort_order, limits, features) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (body.id, body.name, body.priceCents, body.interval, body.isActive, body.isDefault,
             body.sortOrder, json.dumps(body.limits or {}), json.dumps(body.features or [])),
        )
    return {"plan": plan}


class UpdatePlanBody(BaseModel):
    name: Optional[str] = None
    priceCents: Optional[int] = None
    interval: Optional[str] = None
    isActive: Optional[bool] = None
    isDefault: Optional[bool] = None
    sortOrder: Optional[int] = None
    limits: Optional[dict] = None
    features: Optional[list] = None


@router.patch("/plans/{plan_id}")
def admin_update_plan(plan_id: str, body: UpdatePlanBody, user_id: str = Depends(require_admin)):
    updates, params = [], []
    if body.name is not None:
        updates.append("name = %s"); params.append(body.name)
    if body.priceCents is not None:
        updates.append("price_cents = %s"); params.append(body.priceCents)
    if body.interval is not None:
        updates.append("interval = %s"); params.append(body.interval)
    if body.isActive is not None:
        updates.append("is_active = %s"); params.append(body.isActive)
    if body.isDefault is not None:
        updates.append("is_default = %s"); params.append(body.isDefault)
    if body.sortOrder is not None:
        updates.append("sort_order = %s"); params.append(body.sortOrder)
    if body.limits is not None:
        updates.append("limits = %s"); params.append(json.dumps(body.limits))
    if body.features is not None:
        updates.append("features = %s"); params.append(json.dumps(body.features))
    if not updates:
        raise HTTPException(400, "No fields to update")
    params.append(plan_id)
    with DB() as db:
        plan = db.fetchone(
            f"UPDATE plans SET {', '.join(updates)} WHERE id = %s RETURNING *",
            params,
        )
    if not plan:
        raise HTTPException(404, "Plan not found")
    return {"plan": plan}


@router.delete("/plans/{plan_id}")
def admin_delete_plan(plan_id: str, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("DELETE FROM plans WHERE id = %s", (plan_id,))
    return {"ok": True}


# ── Subscriptions ──────────────────────────────────────────────────────────────

@router.get("/subscriptions")
def admin_list_subscriptions(user_id: str = Depends(require_admin)):
    with DB() as db:
        rows = db.fetchall(
            """
            SELECT s.*, u.email as user_email, u.name as user_name
            FROM subscriptions s
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC LIMIT 200
            """
        )
    subs = []
    for r in rows:
        subs.append({
            "id": r["id"],
            "userId": r["user_id"],
            "userEmail": r.get("user_email"),
            "userName": r.get("user_name"),
            "planId": r["plan_id"],
            "status": r["status"],
            "startedAt": r["started_at"],
            "currentPeriodEnd": r["current_period_end"],
            "canceledAt": r.get("canceled_at"),
            "createdAt": r["created_at"],
        })
    return {"subscriptions": subs}


class CreateSubscriptionBody(BaseModel):
    userId: str
    planId: str
    currentPeriodEnd: Optional[str] = None


@router.post("/subscriptions")
def admin_create_subscription(body: CreateSubscriptionBody, user_id: str = Depends(require_admin)):
    with DB() as db:
        sub = db.fetchone(
            "INSERT INTO subscriptions (user_id, plan_id, status, started_at, current_period_end) VALUES (%s, %s, 'active', NOW(), %s) RETURNING *",
            (body.userId, body.planId, body.currentPeriodEnd or None),
        )
    return {"subscription": sub}


class UpdateSubscriptionBody(BaseModel):
    planId: Optional[str] = None
    status: Optional[str] = None
    currentPeriodEnd: Optional[str] = None


@router.patch("/subscriptions/{sub_id}")
def admin_update_subscription(sub_id: str, body: UpdateSubscriptionBody, user_id: str = Depends(require_admin)):
    updates, params = [], []
    if body.planId is not None:
        updates.append("plan_id = %s"); params.append(body.planId)
    if body.status is not None:
        updates.append("status = %s"); params.append(body.status)
        if body.status == "canceled":
            updates.append("canceled_at = NOW()")
    if body.currentPeriodEnd is not None:
        updates.append("current_period_end = %s"); params.append(body.currentPeriodEnd or None)
    if not updates:
        raise HTTPException(400, "No fields to update")
    params.append(sub_id)
    with DB() as db:
        sub = db.fetchone(
            f"UPDATE subscriptions SET {', '.join(updates)} WHERE id = %s RETURNING *",
            params,
        )
    if not sub:
        raise HTTPException(404, "Subscription not found")
    return {"subscription": sub}


@router.delete("/subscriptions/{sub_id}")
def admin_delete_subscription(sub_id: str, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("DELETE FROM subscriptions WHERE id = %s", (sub_id,))
    return {"ok": True}


# ── Pages ──────────────────────────────────────────────────────────────────────

def _page_to_dict(p: dict) -> dict:
    return {
        "slug": p["slug"],
        "title": p["title"],
        "enabled": p["enabled"],
        "requireAuth": p["require_auth"],
        "requiredPlan": p.get("required_plan"),
        "seoTitle": p.get("seo_title"),
        "seoDescription": p.get("seo_description"),
        "ogImage": p.get("og_image"),
        "noticeHtml": p.get("notice_html"),
        "sortOrder": p.get("sort_order", 0),
        "updatedAt": p.get("updated_at"),
    }


@router.get("/pages")
def admin_list_pages(user_id: str = Depends(require_admin)):
    _seed_pages_if_empty()
    with DB() as db:
        pages = db.fetchall("SELECT * FROM pages ORDER BY sort_order, slug")
    return {"pages": [_page_to_dict(p) for p in pages]}


class UpdatePageBody(BaseModel):
    enabled: Optional[bool] = None
    requireAuth: Optional[bool] = None
    requiredPlan: Optional[str] = None
    title: Optional[str] = None
    seoTitle: Optional[str] = None
    seoDescription: Optional[str] = None
    ogImage: Optional[str] = None
    noticeHtml: Optional[str] = None
    sortOrder: Optional[int] = None


@router.patch("/pages/{slug}")
def admin_update_page(slug: str, body: UpdatePageBody, user_id: str = Depends(require_admin)):
    updates, params = [], []
    if body.enabled is not None:
        updates.append("enabled = %s"); params.append(body.enabled)
    if body.requireAuth is not None:
        updates.append("require_auth = %s"); params.append(body.requireAuth)
    if body.requiredPlan is not None:
        updates.append("required_plan = %s"); params.append(body.requiredPlan or None)
    if body.title is not None:
        updates.append("title = %s"); params.append(body.title)
    if body.seoTitle is not None:
        updates.append("seo_title = %s"); params.append(body.seoTitle)
    if body.seoDescription is not None:
        updates.append("seo_description = %s"); params.append(body.seoDescription)
    if body.ogImage is not None:
        updates.append("og_image = %s"); params.append(body.ogImage)
    if body.noticeHtml is not None:
        updates.append("notice_html = %s"); params.append(body.noticeHtml)
    if body.sortOrder is not None:
        updates.append("sort_order = %s"); params.append(body.sortOrder)
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates.append("updated_at = NOW()")
    params.append(slug)
    with DB() as db:
        p = db.fetchone(
            f"UPDATE pages SET {', '.join(updates)} WHERE slug = %s RETURNING *",
            params,
        )
    if not p:
        raise HTTPException(404, "Page not found")
    return {"page": _page_to_dict(p)}


def _seed_pages_if_empty():
    DEFAULT_PAGES = [
        ("", "Landing Page", True, False, 0),
        ("dashboard", "Dashboard", True, True, 10),
        ("brands", "Brands", True, True, 20),
        ("campaign-brief", "Campaign Brief", True, True, 30),
        ("campaigns", "Campaigns", True, True, 40),
        ("nodes", "Visual Nodes Editor", True, True, 50),
        ("analytics", "Analytics", True, True, 60),
        ("brand-kit", "Brand Kit", True, True, 70),
        ("templates", "Templates", True, True, 80),
        ("assets", "Assets", True, True, 90),
        ("sign-in", "Sign In", True, False, 100),
        ("sign-up", "Sign Up", True, False, 110),
    ]
    with DB() as db:
        count = db.fetchval("SELECT COUNT(*) FROM pages") or 0
        if count == 0:
            for slug, title, enabled, req_auth, sort_order in DEFAULT_PAGES:
                db.execute(
                    "INSERT INTO pages (slug, title, enabled, require_auth, sort_order, updated_at) VALUES (%s, %s, %s, %s, %s, NOW()) ON CONFLICT (slug) DO NOTHING",
                    (slug, title, enabled, req_auth, sort_order),
                )


# ── API Keys ───────────────────────────────────────────────────────────────────

@router.get("/api-keys")
def admin_list_api_keys(user_id: str = Depends(require_admin)):
    with DB() as db:
        keys = db.fetchall(
            """
            SELECT ak.id, ak.name, ak.prefix, ak.scopes, ak.user_id,
                   ak.last_used_at, ak.revoked_at, ak.created_at, u.email as user_email
            FROM api_keys ak
            LEFT JOIN users u ON ak.user_id = u.id
            ORDER BY ak.created_at DESC
            """
        )
    result = []
    for k in keys:
        result.append({
            "id": k["id"],
            "name": k["name"],
            "prefix": k["prefix"],
            "scopes": k["scopes"] or [],
            "userId": k["user_id"],
            "userEmail": k.get("user_email"),
            "lastUsedAt": k["last_used_at"],
            "revokedAt": k["revoked_at"],
            "createdAt": k["created_at"],
        })
    return {"apiKeys": result}


class CreateApiKeyBody(BaseModel):
    name: str
    userId: str
    scopes: Optional[List[str]] = None


@router.post("/api-keys")
def admin_create_api_key(body: CreateApiKeyBody, user_id: str = Depends(require_admin)):
    raw = secrets.token_urlsafe(32)
    prefix = raw[:8]
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    with DB() as db:
        key = db.fetchone(
            "INSERT INTO api_keys (user_id, name, prefix, hash, scopes) VALUES (%s, %s, %s, %s, %s) RETURNING id, name, prefix, scopes, user_id, created_at",
            (body.userId, body.name, prefix, hashed, json.dumps(body.scopes or ["read"])),
        )
    return {"apiKey": key, "secret": raw}


@router.post("/api-keys/{key_id}/revoke")
def admin_revoke_api_key(key_id: str, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("UPDATE api_keys SET revoked_at = NOW() WHERE id = %s", (key_id,))
    return {"ok": True}


@router.delete("/api-keys/{key_id}")
def admin_delete_api_key(key_id: str, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("DELETE FROM api_keys WHERE id = %s", (key_id,))
    return {"ok": True}


# ── Webhooks ───────────────────────────────────────────────────────────────────

def _webhook_dict(h: dict) -> dict:
    return {
        "id": h["id"],
        "url": h["url"],
        "events": h["events"] or [],
        "isActive": h["is_active"],
        "createdAt": h["created_at"],
    }


@router.get("/webhooks")
def admin_list_webhooks(user_id: str = Depends(require_admin)):
    with DB() as db:
        hooks = db.fetchall("SELECT * FROM webhooks ORDER BY created_at DESC")
    return {"webhooks": [_webhook_dict(h) for h in hooks]}


class CreateWebhookBody(BaseModel):
    url: str
    secret: Optional[str] = None
    events: Optional[List[str]] = None


@router.post("/webhooks")
def admin_create_webhook(body: CreateWebhookBody, user_id: str = Depends(require_admin)):
    with DB() as db:
        h = db.fetchone(
            "INSERT INTO webhooks (url, secret, events, is_active) VALUES (%s, %s, %s, true) RETURNING *",
            (body.url, body.secret, json.dumps(body.events or [])),
        )
    return {"webhook": _webhook_dict(h)}


class UpdateWebhookBody(BaseModel):
    isActive: Optional[bool] = None


@router.patch("/webhooks/{hook_id}")
def admin_update_webhook(hook_id: str, body: UpdateWebhookBody, user_id: str = Depends(require_admin)):
    with DB() as db:
        h = db.fetchone(
            "UPDATE webhooks SET is_active = %s WHERE id = %s RETURNING *",
            (body.isActive, hook_id),
        )
    if not h:
        raise HTTPException(404, "Webhook not found")
    return {"webhook": _webhook_dict(h)}


@router.delete("/webhooks/{hook_id}")
def admin_delete_webhook(hook_id: str, user_id: str = Depends(require_admin)):
    with DB() as db:
        db.execute("DELETE FROM webhooks WHERE id = %s", (hook_id,))
    return {"ok": True}


# ── Public Settings ────────────────────────────────────────────────────────────

@public_router.get("/public-settings")
def public_settings():
    PUBLIC_KEYS = ("features", "branding", "registration")
    with DB() as db:
        rows = db.fetchall("SELECT key, value FROM app_settings WHERE key = ANY(%s)", (list(PUBLIC_KEYS),))
    settings = {}
    for row in rows:
        settings[row["key"]] = row["value"]
    return {"settings": settings}
