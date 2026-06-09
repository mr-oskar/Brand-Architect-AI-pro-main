import math
from typing import Optional
from fastapi import Query


def parse_pagination(
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    q: Optional[str] = None,
    default_page_size: int = 50,
    max_page_size: int = 200,
) -> dict:
    explicit = any(v is not None for v in [page, page_size, limit, offset])

    ps = page_size or limit or default_page_size
    ps = max(1, min(ps, max_page_size))

    off = offset or 0
    pg = page or (math.floor(off / ps) + 1)
    pg = max(1, pg)
    if offset is None:
        off = (pg - 1) * ps

    return {
        "page": pg,
        "pageSize": ps,
        "limit": ps,
        "offset": off,
        "q": q,
        "explicit": explicit,
    }


def pagination_meta(p: dict, total: int) -> dict:
    return {
        "page": p["page"],
        "pageSize": p["pageSize"],
        "total": total,
        "totalPages": max(1, math.ceil(total / p["pageSize"])),
        "hasMore": p["offset"] + p["pageSize"] < total,
    }
