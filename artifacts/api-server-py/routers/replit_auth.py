import base64
import hashlib
import json
import os
import secrets
import time
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from lib.db import DB
from lib.auth import sign_auth_token, AUTH_COOKIE_NAME

router = APIRouter(prefix="/auth/replit")

ISSUER_URL = os.environ.get("ISSUER_URL", "https://replit.com/oidc")
REPL_ID = os.environ.get("REPL_ID", "")
DEFAULT_CREDITS = 100

_state_store: dict = {}


def _cleanup_states():
    now = time.time()
    expired = [k for k, v in _state_store.items() if v["expires_at"] < now]
    for k in expired:
        del _state_store[k]


def _get_redirect_uri(request: Request) -> str:
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc))
    return f"{scheme}://{host}/api/auth/replit/callback"


def _make_pkce() -> tuple[str, str]:
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


def _decode_jwt_payload(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT structure")
    padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(padded))


@router.get("/login")
def login(request: Request, redirect_to: str = "/"):
    if not REPL_ID:
        return RedirectResponse("/sign-in?error=replit_auth_not_configured")

    _cleanup_states()
    state = secrets.token_urlsafe(16)
    code_verifier, code_challenge = _make_pkce()
    _state_store[state] = {
        "code_verifier": code_verifier,
        "redirect_to": redirect_to,
        "expires_at": time.time() + 600,
    }

    params = {
        "client_id": REPL_ID,
        "response_type": "code",
        "redirect_uri": _get_redirect_uri(request),
        "scope": "openid profile email offline_access",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "prompt": "login consent",
    }
    return RedirectResponse(f"{ISSUER_URL}/auth?{urlencode(params)}")


@router.get("/callback")
def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    if error:
        return RedirectResponse(f"/sign-in?error=replit_auth_failed")

    if not code or not state or state not in _state_store:
        return RedirectResponse("/sign-in?error=invalid_state")

    state_data = _state_store.pop(state, None)
    if not state_data or state_data["expires_at"] < time.time():
        return RedirectResponse("/sign-in?error=state_expired")

    redirect_uri = _get_redirect_uri(request)

    try:
        resp = httpx.post(
            f"{ISSUER_URL}/token",
            data={
                "grant_type": "authorization_code",
                "client_id": REPL_ID,
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": state_data["code_verifier"],
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        resp.raise_for_status()
        token_data = resp.json()
    except Exception as e:
        print(f"[replit_auth] Token exchange failed: {e}")
        return RedirectResponse("/sign-in?error=token_exchange_failed")

    id_token = token_data.get("id_token", "")
    try:
        claims = _decode_jwt_payload(id_token)
    except Exception as e:
        print(f"[replit_auth] JWT decode failed: {e}")
        return RedirectResponse("/sign-in?error=invalid_token")

    replit_id = str(claims.get("sub", ""))
    email = claims.get("email") or None
    first_name = claims.get("first_name") or ""
    last_name = claims.get("last_name") or ""
    name = f"{first_name} {last_name}".strip() or (email.split("@")[0] if email else f"User {replit_id[:8]}")
    profile_image_url = claims.get("profile_image_url")

    if not replit_id:
        return RedirectResponse("/sign-in?error=no_user_id")

    with DB() as db:
        user = db.fetchone(
            "SELECT id, email, name, role FROM users WHERE replit_id = %s",
            (replit_id,),
        )
        if not user and email:
            existing_by_email = db.fetchone(
                "SELECT id, email, name, role FROM users WHERE email = %s",
                (email,),
            )
            if existing_by_email:
                db.execute(
                    "UPDATE users SET replit_id = %s, updated_at = NOW() WHERE id = %s",
                    (replit_id, existing_by_email["id"]),
                )
                user = existing_by_email

        if not user:
            fallback_email = email or f"replit_{replit_id}@users.replit.local"
            user = db.fetchone(
                """
                INSERT INTO users (email, password_hash, name, role, status, credits, replit_id)
                VALUES (%s, NULL, %s, 'user', 'active', %s, %s)
                ON CONFLICT (email) DO UPDATE
                  SET replit_id = EXCLUDED.replit_id,
                      name = COALESCE(users.name, EXCLUDED.name),
                      updated_at = NOW()
                RETURNING id, email, name, role
                """,
                (fallback_email, name, DEFAULT_CREDITS, replit_id),
            )

    if not user:
        return RedirectResponse("/sign-in?error=user_upsert_failed")

    token = sign_auth_token(str(user["id"]), user.get("email", ""))
    redirect_to = state_data.get("redirect_to", "/")

    response = RedirectResponse(redirect_to, status_code=302)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=30 * 24 * 3600,
    )
    return response
