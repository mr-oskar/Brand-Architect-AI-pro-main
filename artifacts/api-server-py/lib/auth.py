import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import jwt, JWTError

AUTH_COOKIE_NAME = "auth_token"

_secret = (
    os.environ.get("AUTH_JWT_SECRET")
    or os.environ.get("SESSION_SECRET")
    or secrets.token_hex(32)
)
ALGORITHM = "HS256"
TOKEN_TTL_DAYS = 30


def sign_auth_token(user_id: str, email: str) -> str:
    payload = {
        "userId": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, _secret, algorithm=ALGORITHM)


def verify_auth_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, _secret, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def cookie_options(secure: bool = False) -> dict:
    return {
        "key": AUTH_COOKIE_NAME,
        "httponly": True,
        "secure": secure,
        "samesite": "lax",
        "path": "/",
        "max_age": TOKEN_TTL_DAYS * 24 * 3600,
    }
