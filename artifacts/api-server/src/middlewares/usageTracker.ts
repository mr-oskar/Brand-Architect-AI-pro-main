import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usageEventsTable } from "@workspace/db/schema";
import { recordRequest } from "../lib/metrics";

/**
 * Records every /api request into the live in-memory metrics store, and
 * persists a sampled subset to usage_events for the audit/usage history.
 *
 * - All requests update the in-memory metrics ring buffer (cheap).
 * - To avoid table bloat, only meaningful requests are persisted:
 *     * any AI/image route, any /publish, any login/signup, any error (>=400),
 *     * plus a 10% sample of everything else.
 */

const NORMALIZE_RE = /\/[a-f0-9-]{8,}|\/\d+/gi;
function normalizeRoute(url: string): string {
  const path = url.split("?")[0] ?? url;
  return path.replace(NORMALIZE_RE, "/:id");
}

function classify(route: string): string {
  if (route.includes("/generate-image") || route.includes("/generate-all-images")) return "ai_image";
  if (route.includes("/generate-kit") || route.includes("/generate-campaign") || route.includes("/regenerate")) return "ai_text";
  if (route.includes("/publish")) return "publish";
  if (route.includes("/auth/login")) return "login";
  if (route.includes("/auth/register")) return "signup";
  return "api";
}

export function usageTracker(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on("finish", () => {
    const route = normalizeRoute(req.originalUrl);
    const durationMs = Date.now() - startedAt;
    const status = res.statusCode;

    // Skip noisy polling endpoints to keep metrics clean.
    if (
      route === "/api/health" ||
      route.startsWith("/api/admin/monitoring") ||
      route.startsWith("/api/admin/events") ||
      route === "/api/public-settings"
    ) return;

    recordRequest({ route, statusCode: status, durationMs });

    const kind = classify(route);
    const interesting = kind !== "api" || status >= 400;
    if (!interesting && Math.random() > 0.1) return; // 10% sample

    const userId = (req as any).userId ?? null;
    db.insert(usageEventsTable).values({
      userId,
      kind,
      route,
      method: req.method,
      statusCode: status,
      durationMs,
      tokensUsed: 0,
    }).catch(() => { /* best-effort */ });
  });
  next();
}
