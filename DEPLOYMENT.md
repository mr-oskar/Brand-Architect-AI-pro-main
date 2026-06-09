# Deployment Guide — Brand Architect AI Pro

This project is a pnpm monorepo with two deployable artifacts:

| Artifact | Path | Description | Default port |
|---|---|---|---|
| `@workspace/api-server` | `artifacts/api-server` | Express 5 backend (REST + Clerk auth + AI orchestration) | `8080` |
| `@workspace/brand-os`   | `artifacts/brand-os`   | React + Vite frontend (SPA) | dev: any, prod: served by API |

There are **two supported deployment modes**:

1. **Replit (default)** — frontend and API run as separate services. Already configured.
2. **Single-container / generic cloud** — one Node process serves the API _and_ the built frontend. Use this for Docker, Render, Railway, Fly.io, AWS, Azure, GCP, a bare VPS, etc.

The exact same source tree supports both modes. The switch is the env var `SERVE_FRONTEND=1`.

---

## 1. Prerequisites

- **Node.js** 22+
- **pnpm** 10.26+ (`corepack enable && corepack prepare pnpm@10.26.1 --activate`)
- **PostgreSQL** 14+ (any flavor: managed, Docker, on-prem)
- One AI provider key: **OpenAI** or **Google Gemini** (or both)
- Optional: **Clerk** account (for production-grade auth)

---

## 2. Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env
```

`.env.example` documents every variable. The minimum required for a self-hosted deploy:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `SESSION_SECRET` | ✅ | Signs session cookies (`openssl rand -hex 32`) |
| `AUTH_JWT_SECRET` | ✅ | Signs custom JWTs (use another 32-byte hex) |
| `OPENAI_API_KEY` _or_ `GEMINI_API_KEY` | ✅ | At least one AI provider |
| `PORT` |  | Defaults to `8080` |
| `NODE_ENV` |  | Set to `production` in prod |
| `SERVE_FRONTEND` |  | Set to `1` for single-container mode |
| `BASE_PATH` |  | Frontend base path (default `/`) |
| `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` + `VITE_CLERK_PUBLISHABLE_KEY` |  | Enables Clerk auth instead of built-in JWT |
| `REPLIT_DOMAINS` |  | Comma-separated CORS allowlist (e.g. `app.example.com`) |
| `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS` |  | Local upload directories (or S3 bucket id) |

> **Never commit `.env`.** It is already in `.gitignore` / `.dockerignore`.

---

## 3. Deploy with Docker Compose (recommended)

The fastest way to run the entire stack on any machine that has Docker.

```bash
# 1. Configure
cp .env.example .env
# edit .env: set SESSION_SECRET, AUTH_JWT_SECRET, OPENAI_API_KEY (or GEMINI_API_KEY)

# 2. Build the image and start Postgres + the app
docker compose up -d --build

# 3. (Once) push the database schema
docker compose run --rm migrator

# 4. Open the app
open http://localhost:8080
```

### What `docker-compose.yml` provisions

- `db` — Postgres 16 (data persisted in the `db_data` volume)
- `app` — single container that serves both `/api` and the React SPA on `:8080`
- `uploads` — named volume mounted at `/data/uploads` for user-generated files
- `migrator` — one-shot service (profile `tools`) that runs `drizzle-kit push`

### Useful commands

```bash
docker compose logs -f app          # tail logs
docker compose exec app sh          # shell inside the running container
docker compose restart app          # restart only the app
docker compose down                 # stop everything (data volumes preserved)
docker compose down -v              # stop AND wipe data volumes
```

---

## 4. Deploy with the `Dockerfile` directly

For PaaS providers that build from a Dockerfile (Render, Railway, Fly.io, Google Cloud Run, AWS App Runner, Azure Container Apps, Coolify, Dokploy, etc.):

1. Push this repo to your provider.
2. Point the build at the root `Dockerfile`. No build args required.
3. Set the env vars from §2 in the provider's secret/config UI.
4. Expose port `8080` (or set `PORT` to whatever the provider injects).
5. Add a managed Postgres add-on (or external DB) and put its URL in `DATABASE_URL`.
6. After the first deploy, run the migration once:

```bash
# Open a shell into the running instance, then:
pnpm --filter @workspace/db run push
```

The Dockerfile is multi-stage — final image is roughly 250 MB and runs as a non-root `app` user.

### Provider-specific notes

| Provider | Notes |
|---|---|
| **Render**     | Web Service → "Docker". Add a Render Postgres instance and reference its internal URL. |
| **Railway**    | Add the repo, then add a Postgres plugin. Railway will auto-set `DATABASE_URL`. |
| **Fly.io**     | `fly launch` (detects Dockerfile). `fly postgres create` and `fly postgres attach`. |
| **Cloud Run**  | Build & push to Artifact Registry, deploy with `--set-env-vars`. Use Cloud SQL Proxy. |
| **AWS ECS / Fargate** | Push image to ECR. Mount EFS for `/data/uploads` if you need persistence. |
| **Heroku**     | Use the container stack: `heroku stack:set container`. Postgres add-on. |

---

## 5. Deploy on a bare Linux VPS (no Docker)

```bash
# 1. Install Node 22 and pnpm
curl -fsSL https://nodejs.org/dist/v22.13.1/node-v22.13.1-linux-x64.tar.xz | tar -xJ -C /opt
export PATH=/opt/node-v22.13.1-linux-x64/bin:$PATH
corepack enable && corepack prepare pnpm@10.26.1 --activate

# 2. Clone & install
git clone <your-repo-url> brand-os && cd brand-os
pnpm install --frozen-lockfile

# 3. Configure
cp .env.example .env && $EDITOR .env

# 4. Build everything
NODE_ENV=production BASE_PATH=/ pnpm -r --if-present run build

# 5. Push DB schema
pnpm --filter @workspace/db run push

# 6. Run with a process manager (systemd/pm2). Example with pm2:
pnpm add -g pm2
SERVE_FRONTEND=1 PORT=8080 pm2 start \
  "node --enable-source-maps artifacts/api-server/dist/index.mjs" \
  --name brand-os
pm2 save && pm2 startup
```

Put nginx/Caddy in front of `:8080` for TLS.

### systemd unit example

```ini
# /etc/systemd/system/brand-os.service
[Unit]
Description=Brand Architect AI Pro
After=network.target postgresql.service

[Service]
Type=simple
User=app
WorkingDirectory=/srv/brand-os
EnvironmentFile=/srv/brand-os/.env
Environment=NODE_ENV=production
Environment=SERVE_FRONTEND=1
Environment=PORT=8080
ExecStart=/opt/node-v22.13.1-linux-x64/bin/node --enable-source-maps artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now brand-os
```

---

## 6. Replit (current setup, unchanged)

This repo is already wired for Replit:

- The frontend artifact (`artifacts/brand-os`) is served as a static deployment via its `artifact.toml`.
- The API artifact (`artifacts/api-server`) runs the Node process on `PORT=8080`.
- Workflows: `artifacts/api-server: API Server`, `artifacts/brand-os: web`.
- Secrets are stored in the Replit Secrets pane (NOT in a `.env` file).

Do **not** set `SERVE_FRONTEND` on Replit — leaving it unset is what keeps the static-asset performance edge. The Replit deployment serves the SPA from a CDN-style static layer, while the API runs separately.

To deploy on Replit, click **Publish** in the workspace.

---

## 7. Migrating from Replit to your own infra

1. **Export secrets** — copy each secret out of the Replit Secrets pane into a local `.env`.
2. **Export the database** — `pg_dump $DATABASE_URL > backup.sql`. Restore with `psql $NEW_DATABASE_URL < backup.sql`.
3. **Export user uploads** — if you used Replit Object Storage, download via the storage UI or `gsutil`. Place files under your new `PRIVATE_OBJECT_DIR`.
4. **Pick a target** from §3 / §4 / §5 and follow it.
5. **Update CORS** — set `REPLIT_DOMAINS` to your new public hostname(s).
6. **Update Clerk** — in Clerk Dashboard, add your new domain to "Allowed origins" and update the redirect URLs.

Going **back** to Replit is the same flow in reverse: import the repo, set Secrets, push schema, restore data.

---

## 8. Project layout reference

```
.
├── Dockerfile                 ← multi-stage build (deps→build→runtime)
├── docker-compose.yml         ← Postgres + app, single command bring-up
├── .dockerignore              ← keeps the build context lean
├── .env.example               ← every supported env var, documented
├── DEPLOYMENT.md              ← this file
├── replit.md                  ← Replit-specific knowledge base
├── package.json               ← root scripts (build, typecheck)
├── pnpm-workspace.yaml        ← monorepo + dependency catalog
├── pnpm-lock.yaml
├── artifacts/
│   ├── api-server/            ← Express 5 backend (esbuild bundle)
│   │   ├── src/
│   │   ├── build.mjs
│   │   └── dist/              ← built output (in container only)
│   └── brand-os/              ← React + Vite frontend
│       ├── src/
│       ├── vite.config.ts
│       └── dist/public/       ← built output (in container only)
├── lib/
│   ├── api-spec/              ← OpenAPI source of truth
│   ├── api-zod/               ← generated Zod schemas
│   ├── api-client-react/      ← generated React Query hooks
│   ├── db/                    ← Drizzle schema + push command
│   └── integrations/
│       └── integrations-openai-ai-server/
└── scripts/
```

---

## 9. Verifying a deploy

After bringing the app up, validate these in order:

```bash
# 1. Health check
curl -fsS http://localhost:8080/api/healthz
# → {"status":"ok"}

# 2. Public settings (no auth required)
curl -fsS http://localhost:8080/api/public-settings | head -c 300

# 3. Frontend (single-container mode only — SERVE_FRONTEND=1)
curl -fsS http://localhost:8080/ | grep -o '<title>[^<]*' 
# → <title>Brand Architect AI Pro</title>  (or your customized title)

# 4. Database connectivity
psql "$DATABASE_URL" -c '\dt'
# → should list users, brands, campaigns, posts, designs, social_accounts, …
```

If any of those fail, check `docker compose logs -f app` (or `journalctl -u brand-os -f` on systemd).

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Error: PORT environment variable is required` | `PORT` not set | Set `PORT=8080` (or whatever) in env |
| 401 on every request including `/api/healthz` | Wrong: healthz is public. Check the route mounts | Ensure `helmet`/CORS aren't blocking — see logs |
| Frontend loads but API calls 404 | `SERVE_FRONTEND=1` and `BASE_PATH` mismatch | Ensure both API and frontend agree on `BASE_PATH` |
| `relation "users" does not exist` | Schema not pushed | `docker compose run --rm migrator` |
| AI calls fail with 401 | No provider key set | Set `OPENAI_API_KEY` or `GEMINI_API_KEY` |
| CORS errors in browser | New domain not allow-listed | Add hostname to `REPLIT_DOMAINS` |
| Container exits immediately | Required env var missing | `docker compose logs app` will show which one |
| `sharp` install fails on Alpine | Glibc-only prebuilds | The Dockerfile uses Debian slim — avoid Alpine for this app |

---

## 11. Updating

```bash
git pull
docker compose build --no-cache app
docker compose up -d app
docker compose run --rm migrator   # only if lib/db/src/schema/ changed
```
