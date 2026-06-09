---
name: Python FastAPI backend
description: The api-server was converted from TypeScript/Express to Python/FastAPI at artifacts/api-server-py/
---

The active backend is now `artifacts/api-server-py/` (Python 3.11 + FastAPI).

**Why:** User prefers Python for future development.

**How to apply:** All backend edits go in `artifacts/api-server-py/`, not `artifacts/api-server/`.

Key facts:
- DB schema is still managed by Drizzle ORM in `lib/db/` (TypeScript) — run `pnpm --filter @workspace/db run push` for schema changes
- Python reads same PostgreSQL DB via psycopg2 (raw SQL)
- Auth: python-jose (JWT) + bcrypt — compatible with existing user sessions (same JWT secret env vars)
- Error responses use `{"error": "..."}` format (custom exception handler overrides FastAPI default `{"detail": ...}`)
- bcrypt: use `bcrypt` library directly (NOT passlib — has a wrap-bug detection issue in this env)
- Workflow command: `cd artifacts/api-server-py && PORT=8080 uvicorn main:app --host 0.0.0.0 --port 8080 --reload`
- FastAPI docs available at `/api/docs`
