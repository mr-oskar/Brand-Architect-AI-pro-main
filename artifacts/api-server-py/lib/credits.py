import time
from typing import Optional
from .db import DB

_DEFAULTS: dict[str, int] = {
    "brand.generate-kit": 50,
    "brand.generate-story": 20,
    "brand.generate-content": 15,
    "campaign.generate": 30,
    "post.generate-image": 10,
    "post.regenerate": 5,
    "design.generate-image": 10,
    "design.generate-layout": 15,
    "design.smart-generate": 20,
    "design.ai-edit": 8,
    "design.generate-brand-book": 40,
    "nodes.generate-image": 10,
    "nodes.extract-style": 5,
    "nodes.expand-prompts": 5,
}

_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 30.0


def _get_credit_costs() -> dict[str, int]:
    now = time.time()
    if "costs" in _cache and now - _cache["costs"][1] < _CACHE_TTL:
        return _cache["costs"][0]

    try:
        with DB() as db:
            rows = db.fetchall("SELECT key, value FROM app_settings")
            for row in rows:
                if row.get("key") == "credits":
                    v = row.get("value") or {}
                    if isinstance(v, dict):
                        merged = {**_DEFAULTS, **{k: int(c) for k, c in v.items() if str(c).isdigit()}}
                        _cache["costs"] = (merged, now)
                        return merged
    except Exception:
        pass

    _cache["costs"] = (_DEFAULTS, now)
    return _DEFAULTS


class InsufficientCreditsError(Exception):
    def __init__(self, action: str, cost: int):
        self.action = action
        self.cost = cost
        self.status_code = 402
        super().__init__(f"Insufficient credits for {action} (cost: {cost})")


def charge_credits(user_id: str, action: str, multiplier: int = 1) -> int:
    costs = _get_credit_costs()
    cost = costs.get(action, 0) * max(1, multiplier)
    if cost == 0:
        return 0

    with DB() as db:
        is_admin = db.fetchval(
            "SELECT role FROM users WHERE id = %s", (user_id,)
        )
        if is_admin == "admin":
            return 0

        updated = db.fetchval(
            """
            UPDATE users
            SET credits = credits - %s
            WHERE id = %s AND credits >= %s
            RETURNING credits
            """,
            (cost, user_id, cost),
        )
        if updated is None:
            raise InsufficientCreditsError(action, cost)
        return updated
