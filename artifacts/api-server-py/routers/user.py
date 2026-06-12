import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from lib.db import DB
from lib.auth import hash_password, verify_password
from routers.deps import require_auth

router = APIRouter(prefix="/user")

VALID_LANGUAGES = {"ar", "en"}
VALID_THEMES = {"dark", "light", "system"}


class UpdatePreferencesBody(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None


class UpdateProfileBody(BaseModel):
    name: Optional[str] = None
    currentPassword: Optional[str] = None
    newPassword: Optional[str] = None


def _parse_prefs(raw) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return {}


@router.get("/preferences")
def get_preferences(user_id: str = Depends(require_auth)):
    with DB() as db:
        row = db.fetchone(
            "SELECT name, email, preferences FROM users WHERE id = %s", (user_id,)
        )
    if not row:
        raise HTTPException(404, "User not found")
    return {
        "preferences": _parse_prefs(row.get("preferences")),
        "name": row.get("name"),
        "email": row.get("email"),
    }


@router.put("/preferences")
def update_preferences(body: UpdatePreferencesBody, user_id: str = Depends(require_auth)):
    if body.language and body.language not in VALID_LANGUAGES:
        raise HTTPException(400, f"Invalid language. Valid: {VALID_LANGUAGES}")
    if body.theme and body.theme not in VALID_THEMES:
        raise HTTPException(400, f"Invalid theme. Valid: {VALID_THEMES}")

    with DB() as db:
        row = db.fetchone("SELECT preferences FROM users WHERE id = %s", (user_id,))
        if not row:
            raise HTTPException(404, "User not found")
        prefs = _parse_prefs(row.get("preferences"))

        if body.language is not None:
            prefs["language"] = body.language
        if body.theme is not None:
            prefs["theme"] = body.theme

        db.execute(
            "UPDATE users SET preferences = %s, updated_at = NOW() WHERE id = %s",
            (json.dumps(prefs), user_id),
        )
    return {"ok": True, "preferences": prefs}


@router.put("/profile")
def update_profile(body: UpdateProfileBody, user_id: str = Depends(require_auth)):
    updates: list[str] = []
    params: list = []

    if body.name is not None:
        name = body.name.strip()[:100]
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        updates.append("name = %s")
        params.append(name)

    if body.newPassword:
        if len(body.newPassword) < 8:
            raise HTTPException(400, "New password must be at least 8 characters")
        if not body.currentPassword:
            raise HTTPException(400, "Current password is required to set a new one")
        with DB() as db:
            row = db.fetchone_raw(
                "SELECT password_hash FROM users WHERE id = %s", (user_id,)
            )
        if not row or not verify_password(body.currentPassword, row.get("password_hash", "")):
            raise HTTPException(401, "Current password is incorrect")
        updates.append("password_hash = %s")
        params.append(hash_password(body.newPassword))

    if not updates:
        return {"ok": True}

    updates.append("updated_at = NOW()")
    params.append(user_id)
    with DB() as db:
        db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", params)
    return {"ok": True}
