import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from lib.credits import InsufficientCreditsError
from routers import health, auth, replit_auth, brands, campaigns, posts, dashboard, jobs, images, designs, nodes, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[api-server-py] Starting Python/FastAPI server...")
    _seed_admins_bg()
    yield
    print("[api-server-py] Shutting down...")


def _seed_admins_bg():
    import threading
    def _run():
        try:
            from lib.db import DB
            from lib.auth import hash_password
            admin_emails_env = os.environ.get("ADMIN_EMAILS", "")
            admin_password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD", "")
            if not admin_emails_env:
                return
            emails = [e.strip() for e in admin_emails_env.split(",") if e.strip()]
            for email in emails:
                with DB() as db:
                    existing = db.fetchone("SELECT id, role FROM users WHERE email = %s", (email,))
                    if existing:
                        if existing.get("role") != "admin":
                            db.execute("UPDATE users SET role = 'admin', updated_at = NOW() WHERE email = %s", (email,))
                    elif admin_password and len(admin_password) >= 8:
                        pw_hash = hash_password(admin_password)
                        db.execute(
                            "INSERT INTO users (email, password_hash, name, role, status, credits) VALUES (%s, %s, 'Admin', 'admin', 'active', 999) ON CONFLICT (email) DO NOTHING",
                            (email, pw_hash),
                        )
        except Exception as e:
            print(f"[seed_admins] Warning: {e}")
    threading.Thread(target=_run, daemon=True).start()


app = FastAPI(
    title="Brand Architect AI Pro",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, str):
        return JSONResponse(status_code=exc.status_code, content={"error": detail})
    return JSONResponse(status_code=exc.status_code, content=detail)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    msg = errors[0].get("msg", "Validation error") if errors else "Validation error"
    return JSONResponse(status_code=422, content={"error": msg})


@app.exception_handler(InsufficientCreditsError)
async def credits_handler(request: Request, exc: InsufficientCreditsError):
    return JSONResponse(status_code=402, content={"error": str(exc), "action": exc.action, "cost": exc.cost})


@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


PREFIX = "/api"

app.include_router(health.router, prefix=PREFIX)
app.include_router(auth.router, prefix=PREFIX)
app.include_router(replit_auth.router, prefix=PREFIX)
app.include_router(brands.router, prefix=PREFIX)
app.include_router(campaigns.router, prefix=PREFIX)
app.include_router(posts.router, prefix=PREFIX)
app.include_router(dashboard.router, prefix=PREFIX)
app.include_router(jobs.router, prefix=PREFIX)
app.include_router(images.router, prefix=PREFIX)
app.include_router(designs.router, prefix=PREFIX)
app.include_router(nodes.router, prefix=PREFIX)
app.include_router(admin.router, prefix=PREFIX)
app.include_router(admin.public_router, prefix=PREFIX)


@app.get("/")
def root():
    return {"ok": True, "server": "Brand Architect AI Pro (Python/FastAPI)"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
