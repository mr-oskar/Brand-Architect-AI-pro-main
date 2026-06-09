import os
import re
from datetime import datetime, date
from typing import Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool as pg_pool

DATABASE_URL = os.environ.get("DATABASE_URL", "")

_pool: Optional[pg_pool.ThreadedConnectionPool] = None


def get_pool() -> pg_pool.ThreadedConnectionPool:
    global _pool
    if _pool is None or _pool.closed:
        _pool = pg_pool.ThreadedConnectionPool(1, 20, DATABASE_URL)
    return _pool


def _to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def _serialize(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def _camel_dict(row: dict) -> dict:
    return {_to_camel(k): _serialize(v) for k, v in row.items()}


class DB:
    def __init__(self):
        self.conn = None
        self.cur = None
        self._pool = None

    def __enter__(self) -> "DB":
        self._pool = get_pool()
        self.conn = self._pool.getconn()
        self.cur = self.conn.cursor(cursor_factory=RealDictCursor)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn is None:
            return
        try:
            if exc_type:
                self.conn.rollback()
            else:
                self.conn.commit()
        except Exception:
            pass
        if self.cur:
            try:
                self.cur.close()
            except Exception:
                pass
        try:
            self._pool.putconn(self.conn)
        except Exception:
            try:
                self.conn.close()
            except Exception:
                pass
        finally:
            self.conn = None
            self.cur = None

    def fetchone(self, query: str, params=None) -> Optional[dict]:
        self.cur.execute(query, params)
        row = self.cur.fetchone()
        return _camel_dict(dict(row)) if row else None

    def fetchall(self, query: str, params=None) -> list[dict]:
        self.cur.execute(query, params)
        rows = self.cur.fetchall()
        return [_camel_dict(dict(r)) for r in rows]

    def fetchone_raw(self, query: str, params=None) -> Optional[dict]:
        self.cur.execute(query, params)
        row = self.cur.fetchone()
        return dict(row) if row else None

    def execute(self, query: str, params=None) -> RealDictCursor:
        self.cur.execute(query, params)
        return self.cur

    def fetchval(self, query: str, params=None) -> Any:
        self.cur.execute(query, params)
        row = self.cur.fetchone()
        if row is None:
            return None
        return list(row.values())[0]
