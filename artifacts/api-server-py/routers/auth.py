import re
from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel
from typing import Optional

from lib.db import DB
from lib.auth import sign_auth_token, verify_auth_token, hash_password, verify_password, AUTH_COOKIE_NAME

router = APIRouter(prefix="/auth")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
DEFAULT_CREDITS = 100


def _make_cookie(response: Response, token: str):
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=30 * 24 * 3600,
    )


class RegisterBody(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/register")
def register(body: RegisterBody, response: Response):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(400, "Invalid email address")
    if len(body.password) < 8 or len(body.password) > 200:
        raise HTTPException(400, "Password must be 8-200 characters")
    if body.name and len(body.name) > 100:
        raise HTTPException(400, "Name too long")

    with DB() as db:
        existing = db.fetchone("SELECT id FROM users WHERE email = %s", (email,))
        if existing:
            raise HTTPException(409, "An account with this email already exists")

        pw_hash = hash_password(body.password)
        user = db.fetchone(
            """
            INSERT INTO users (email, password_hash, name, role, status, credits)
            VALUES (%s, %s, %s, 'user', 'active', %s)
            RETURNING id, email, name, role
            """,
            (email, pw_hash, body.name or None, DEFAULT_CREDITS),
        )

    token = sign_auth_token(user["id"], user["email"])
    _make_cookie(response, token)
    return {"user": user, "token": token}


@router.post("/login")
def login(body: LoginBody, response: Response):
    email = body.email.strip().lower()

    with DB() as db:
        user = db.fetchone_raw(
            "SELECT id, email, name, role, status, password_hash FROM users WHERE email = %s",
            (email,),
        )

    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")

    token = sign_auth_token(str(user["id"]), user["email"])
    _make_cookie(response, token)
    return {
        "user": {"id": user["id"], "email": user["email"], "name": user.get("name"), "role": user["role"]},
        "token": token,
    }


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(AUTH_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(401, "Not signed in")

    payload = verify_auth_token(token)
    if not payload:
        raise HTTPException(401, "Invalid session")

    with DB() as db:
        user = db.fetchone(
            "SELECT id, email, name, role, status, credits FROM users WHERE id = %s",
            (payload["userId"],),
        )

    if not user:
        raise HTTPException(401, "User no longer exists")

    return {"user": user}
