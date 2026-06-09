import os
from fastapi import Request, HTTPException

from lib.auth import AUTH_COOKIE_NAME, verify_auth_token

ALLOW_DEMO = os.environ.get("AUTH_ALLOW_DEMO") == "1" and os.environ.get("NODE_ENV") != "production"
DEMO_USER_ID = "demo-user"


def require_auth(request: Request) -> str:
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if token:
        payload = verify_auth_token(token)
        if payload:
            return payload["userId"]

    if ALLOW_DEMO:
        return DEMO_USER_ID

    raise HTTPException(401, "Unauthorized")


def require_admin(request: Request) -> str:
    from lib.db import DB
    user_id = require_auth(request)
    with DB() as db:
        role = db.fetchval("SELECT role FROM users WHERE id = %s", (user_id,))
    if role != "admin":
        raise HTTPException(403, "Forbidden")
    return user_id
