# Brand Architect AI Pro

Cloned from https://github.com/mr-oskar/Brand-Architect-AI-pro-12-main-pro.1.1.3.2 and configured to run in Replit.

> 📘 **Full project documentation:** see [`DOCUMENTATION.md`](./DOCUMENTATION.md)  
> 🤖 **AI agent instructions (must-read for any agent editing this repo):** see [`AGENTS.md`](./AGENTS.md)  
> 🚀 **Deployment guide:** see [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## Stack (quick reference)

- pnpm workspace monorepo (Node 24, TypeScript 5.9)
- **Backend: Python 3.11 + FastAPI (`artifacts/api-server-py`) on port 8080** (replaced TypeScript Express)
- Frontend: React 19 + Vite 7 SPA (`artifacts/brand-os`) on port 5000 (Replit webview)
- DB: PostgreSQL — schema managed by Drizzle ORM (`lib/db`), accessed by Python via psycopg2
- AI: OpenAI Python SDK (`openai`) + Gemini via REST
- Auth: JWT (python-jose) + bcrypt (Python)

## Configured env (Replit)

- `DATABASE_URL` (Replit Postgres)
- `SESSION_SECRET`, `AUTH_JWT_SECRET`
- `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` (auto)
- `GEMINI_API_KEY` (user secret)
- `GITHUB_PERSONAL_ACCESS_TOKEN` (user secret — stored in `~/.git-credentials`)
- `VITE_CLERK_PUBLISHABLE_KEY` (test key)

## Workflows

- `API Server` — `cd artifacts/api-server-py && PORT=8080 uvicorn main:app --host 0.0.0.0 --port 8080 --reload` (console)
- `Start application` — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` (webview, port 5000 required by Replit preview)

> The `artifacts/api-server` (TypeScript/Express) is preserved for reference but no longer runs. The Python server owns port 8080.

## Common commands

- `pnpm install` — install workspace deps
- `pnpm --filter @workspace/db run push` — push DB schema
- `pnpm run typecheck` / `pnpm run build`

## GitHub remote

- Origin: `https://github.com/mr-oskar/Brand-Architect-AI-pro-node.0.1`
- Push works directly from Replit Git pane (token stored in `~/.git-credentials`).

## Recent significant changes

- 2026-04-27 — **Nodes editor — Brand Kit node**: added a sixth node type `brandKit` (orange-300 accent, `Briefcase` icon) to `/nodes` that pulls a saved brand from the existing Brands DB and broadcasts its identity into Generate nodes. The node renders a brand picker (fetches `GET /api/brands?pageSize=200`), then loads full details from `GET /api/brands/:id`, and shows the logo, color swatches, tone of voice and primary tagline with a refresh button. Connects via a dedicated **brand** handle (orange) on a single counterpart pair: Generate nodes gained a 4th left-side target handle `brand` (between `prompt` and `settings`). `isValidConnection` rejects any cross-typed brand handle. New memo `brandByTargetId` mirrors `settingsByTargetId`. In `runGenerate`, if a brand is wired in: (a) the brand logo is fetched, converted to a data URL and pushed as the LAST reference image; (b) a "Brand identity" section is prepended FIRST in the composed prompt (above settings, user request and style layer) covering company/industry, tone, personality, visual style + rules, full color palette, taglines, brand keywords and do/don't communication rules. Generate node header now shows a **BRAND** badge (orange) when a brand is inherited, alongside the existing **SET** badge. Sidebar palette gained a Brand Kit button; Inspector tab gained a `BrandKitNodeInspector` (logo + palette grid + tone + taglines + warning when the brand has no kit yet). New file: `BrandKitNode.tsx`. Touched: `types.ts` (added `brandKit` kind, `BrandSummary`, `BrandColorPalette`, `BrandKitPayload`, `BrandFull`, `BrandKitNodeData`, plus `inheritedBrand?` on `GenerateNodeData`), `index.tsx` (registration, `addBrandKitNode` helper supporting `at?` for context-menu placement, `paneMenuItems`, decorated nodes, deps), `GenerateImageNode.tsx` (4th `brand` target handle + BRAND badge), `Sidebar.tsx` (palette button, badge, inspector, title).
- 2026-04-27 — **Nodes editor — Settings + Style Extractor nodes, model picker, accurate sizing, dark-text fix**: 6 user-requested upgrades for `/nodes`. (1) Brightened low-contrast text inside Generate/ImageInput nodes (muted-foreground/55→foreground/65–75). (2) Each node now shows hover-revealed copy/delete icons in its top-right (`NodeActions.tsx`) so removal no longer requires the inspector. (3) Generated images are returned at the **exact** requested aspect: `routes/nodes.ts` post-processes provider output via `sharp` (`enforceSize`) using cover-crop to the chosen `size`. (4) New **Settings node** (emerald) — reusable preset that, when its source handle is connected to a Generate node's new `settings` target (handle at 85% on the right), overrides model/aspect/quality/background and additionally injects an optional reference image, a free-form text reference (brand voice/palette/etc.), and a "unified prompt" prefix prepended to every connected prompt. (5) New **Style Extractor node** (fuchsia) — accepts an Image or Generate node on the left and calls new `POST /api/nodes/extract-style` (gpt-4o-mini vision + a curated `STYLE_EXTRACT_SYSTEM`) to produce a professional, image-gen-ready style prompt; output flows into a Generate node's `prompt` handle just like a regular Prompt node. (6) Prompt nodes now auto-display the references of the Generate node they feed into as a chip strip (`inheritedRefs`), so users see `@ref1` mappings without clicking the Generate node. Generate node also gained a model picker (Auto / GPT Image / Gemini Flash) — `lib/integrations/integrations-openai-ai-server` exports `ImageModel` and `resolveProvider(model)` to route requests + `withAspectHint()` so explicit-model calls still get aspect hints baked into the prompt. New files: `SettingsNode.tsx`, `StyleExtractorNode.tsx`, `NodeActions.tsx`. Touched: `index.tsx`, `Sidebar.tsx`, `PromptNode.tsx`, `ImageInputNode.tsx`, `GenerateImageNode.tsx`, `types.ts`, `routes/nodes.ts`, `image/client.ts`. Header legend gained Settings + Style Extractor swatches; MiniMap updated.
- 2026-04-27 — **Nodes editor — elegant Krea-style redesign + model settings**: refined the entire `/nodes` UI to a calm, monochrome palette (bg `#0b0d12`, surface `#15171f`, accent `#7c5cff`) with glassmorphism, hairline type-color accents (sky/amber/violet) instead of rainbow gradient headers, tighter typography, smooth hover-revealed action bars, and a polished MiniMap/zoom HUD. Added real **model settings** (the user's "settings" meant model knobs, not workspace settings): each Generate node now has a Sliders icon → popover with Aspect (Square/Portrait/Landscape/Auto), Quality (Auto/Low/Medium/High), and Background (Auto/Solid/Transparent), plus a compact summary strip below the prompt. The same controls are exposed in the Inspector tab. Backend: `lib/integrations/integrations-openai-ai-server` now exports `ImageQuality` / `ImageBackground` / `ImageGenOptions`; `generateImageWithReferences` accepts `{ size, quality, background }`. `routes/nodes.ts` validates and forwards `quality`/`background` to OpenAI's `gpt-image-1` (Gemini ignores them — surfaced as a note in the UI). Reference chips, run button, output preview action bar, and inspector size/quality/background grids all use the new accent system. NodesEditor + `routes/nodes.ts` typecheck cleanly (remaining repo TS errors are pre-existing in unrelated files).
- 2026-04-27 — **Nodes editor overhaul (`/nodes`)**: redesigned with a left collapsible sidebar (3 tabs: **Projects** = per-project workspaces with create/rename/duplicate/delete, **Add** = node palette + reset, **Inspector** = settings for the selected node, position editor, connection list with disconnect). Custom zoom control top-right (in/out/% input/fit/reset). All copy now in English; node frames shrunk; all action buttons icon-only with shadcn tooltips. Generate-image node outputs can be used as references for downstream generate nodes (frontend fetches the URL and converts to a base64 data URL before calling the backend). Reference uploads expose an `uploading` flag — the **Run** button is disabled until every connected reference is fully ready. Image-input nodes now expose `onUploadingChange` and image-input/generate-image nodes both feed into the reference list (`kind` flag). Workspaces persisted in `localStorage` under `nodes-editor-store-v2` (legacy `nodes-editor-graph-v1` migrated automatically). New files: `Sidebar.tsx`, `CanvasControls.tsx`, `storage.ts`. Default `deleteKeyCode` disabled on ReactFlow; custom `Delete`/`Backspace` shortcut deletes the selected node only when the focus isn't in an input/textarea.
- 2026-04-26 — Pushed full project state (Nodes editor + toolbar refinements) to the new empty `Brand-Architect-AI-pro-node.0.1` repo. Because the local clone was shallow with a dangling parent reference and the remote was empty, the 4 local commits were rewritten so the oldest (`a5a4094` → `2f85a5e`) became a root commit; commit content/messages preserved, SHAs new. Origin tip after the docs note: `422e838` (later auto-commits added by the platform are pushed automatically by a `.git/hooks/post-commit` hook).
- 2026-04-26 — Added Krea-style **Nodes** visual editor at `/nodes` (image references → prompt → AI image generation). Backend route `POST /api/nodes/generate-image` charges credits via `design.generate-image` and uses `generateImageWithReferences`. Frontend uses `@xyflow/react` with custom nodes (`ImageInputNode`, `PromptNode`, `GenerateImageNode`). Sidebar link added to Tools section.
- 2026-04-26 — Added comprehensive `DOCUMENTATION.md` (Arabic, full feature/architecture docs) and `AGENTS.md` (instructions for AI agents).
- 2026-04-26 — Fixed GitHub remote URL (was pointing to non-existent `oskar-77/...`); configured persistent credential storage.
- 2026-04-26 — Unified error notification system in `artifacts/brand-os/src/lib/apiError.ts` (`extractApiError` / `notifyError` / `notifySuccess`); wired into BrandDesignStudio, CampaignWorkspace, BrandKit.
- 2026-04-25 — Design Studio improvements: logo auto-injection (`ensureLogo`), `new-page` endpoint, mockup prompts, `safeParseJson`, Gemini provider priority.
