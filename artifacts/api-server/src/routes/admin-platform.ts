import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql, count, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  pagesTable, plansTable, subscriptionsTable, usageEventsTable, apiKeysTable,
  webhooksTable, usersTable, brandsTable, campaignsTable, postsTable, auditLogsTable,
} from "@workspace/db/schema";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";
import { generateApiKey } from "../lib/apiKeys";
import { getMetricsSnapshot } from "../lib/metrics";
import { parsePagination, paginationMeta, setPaginationHeaders } from "../lib/pagination";
import { validateBody, validateParams, getBody, Schemas } from "../lib/validate";

const router: IRouter = Router();
router.use("/admin", requireAdmin);

async function audit(req: any, action: string, targetType?: string, targetId?: string, metadata?: any) {
  const r = req as AdminRequest;
  try {
    await db.insert(auditLogsTable).values({
      actorId: r.userId ?? null, actorEmail: r.adminEmail ?? null,
      action, targetType: targetType ?? null, targetId: targetId ?? null,
      metadata: metadata ?? null,
    });
  } catch {}
}

// ============================== Validation Schemas ==============================

const IdStringParam = z.object({ id: Schemas.IdString });
const SlugParam = z.object({ slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9_-]+$/i) });

const PlanLimits = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional();

const CreatePlanBody = z.object({
  id: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  priceCents: z.number().int().min(0).max(10_000_000).optional(),
  interval: z.enum(["month", "year", "once"]).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  limits: PlanLimits,
  features: z.array(z.string().max(100)).max(100).optional(),
});

const UpdatePlanBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  interval: z.enum(["month", "year", "once"]).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priceCents: z.number().int().min(0).max(10_000_000).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  limits: PlanLimits,
  features: z.array(z.string().max(100)).max(100).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "Nothing to update" });

const CreateSubscriptionBody = z.object({
  userId: Schemas.IdString,
  planId: z.string().trim().min(1).max(50),
  status: z.string().trim().max(50).optional(),
  currentPeriodEnd: z.coerce.date().nullable().optional(),
});

const UpdateSubscriptionBody = z.object({
  planId: z.string().trim().min(1).max(50).optional(),
  status: z.string().trim().max(50).optional(),
  currentPeriodEnd: z.coerce.date().nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "Nothing to update" });

const UpdatePageBody = z.object({
  title: z.string().trim().max(200).optional(),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(500).nullable().optional(),
  ogImage: z.string().trim().max(2000).nullable().optional(),
  noticeHtml: z.string().max(10_000).nullable().optional(),
  requiredPlan: z.string().trim().max(50).nullable().optional(),
  enabled: z.boolean().optional(),
  requireAuth: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "No updates" });

const CreateApiKeyBody = z.object({
  userId: Schemas.IdString,
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.string().max(50)).max(50).optional(),
});

const CreateWebhookBody = z.object({
  url: z.string().trim().url().max(2000),
  events: z.array(z.string().max(100)).max(100).optional(),
  secret: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

const UpdateWebhookBody = z.object({
  url: z.string().trim().url().max(2000).optional(),
  events: z.array(z.string().max(100)).max(100).optional(),
  secret: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "Nothing to update" });

/* ════════════════════ PAGES ════════════════════ */

const DEFAULT_PAGES = [
  { slug: "dashboard", title: "Dashboard", sortOrder: 1 },
  { slug: "brands", title: "Brands", sortOrder: 2 },
  { slug: "campaigns", title: "Campaigns", sortOrder: 3 },
  { slug: "calendar", title: "Content Calendar", sortOrder: 4 },
  { slug: "analytics", title: "Analytics", sortOrder: 5 },
  { slug: "assets", title: "Asset Library", sortOrder: 6 },
  { slug: "templates", title: "Templates", sortOrder: 7 },
  { slug: "admin", title: "Admin Panel", sortOrder: 99 },
];

async function ensureDefaultPages() {
  const rows = await db.select({ slug: pagesTable.slug }).from(pagesTable);
  const have = new Set(rows.map((r) => r.slug));
  const missing = DEFAULT_PAGES.filter((p) => !have.has(p.slug));
  if (missing.length) {
    await db.insert(pagesTable).values(missing.map((p) => ({
      slug: p.slug, title: p.title, sortOrder: p.sortOrder,
    }))).onConflictDoNothing();
  }
}

router.get("/admin/pages", async (_req, res) => {
  await ensureDefaultPages();
  const rows = await db.select().from(pagesTable).orderBy(pagesTable.sortOrder);
  res.json({ pages: rows });
});

router.patch(
  "/admin/pages/:slug",
  validateParams(SlugParam),
  validateBody(UpdatePageBody),
  async (req, res) => {
    const slug = req.params.slug;
    const updates = getBody<z.infer<typeof UpdatePageBody>>(req);
    const [updated] = await db.update(pagesTable).set(updates).where(eq(pagesTable.slug, slug)).returning();
    if (!updated) { res.status(404).json({ error: "Page not found" }); return; }
    await audit(req, "page.updated", "page", slug, updates);
    res.json({ page: updated });
  },
);

/* ════════════════════ PLANS ════════════════════ */

const DEFAULT_PLANS = [
  { id: "free", name: "Free", priceCents: 0, isActive: true, isDefault: true, sortOrder: 1,
    limits: { brands: 1, campaignsPerMonth: 3, postsPerMonth: 20, imagesPerMonth: 10, aiTokensPerMonth: 50000, apiCallsPerDay: 200 },
    features: ["basic-analytics", "1-brand"] },
  { id: "pro", name: "Pro", priceCents: 2900, isActive: true, isDefault: false, sortOrder: 2,
    limits: { brands: 10, campaignsPerMonth: 50, postsPerMonth: 500, imagesPerMonth: 200, aiTokensPerMonth: 2000000, apiCallsPerDay: 5000 },
    features: ["full-analytics", "social-publishing", "api-access", "templates"] },
  { id: "business", name: "Business", priceCents: 9900, isActive: true, isDefault: false, sortOrder: 3,
    limits: { brands: 100, campaignsPerMonth: 500, postsPerMonth: 5000, imagesPerMonth: 2000, aiTokensPerMonth: 20000000, apiCallsPerDay: 50000 },
    features: ["everything", "priority-support", "team-seats", "white-label"] },
];

async function ensureDefaultPlans() {
  const rows = await db.select({ id: plansTable.id }).from(plansTable);
  if (!rows.length) {
    await db.insert(plansTable).values(DEFAULT_PLANS as any).onConflictDoNothing();
  }
}

router.get("/admin/plans", async (_req, res) => {
  await ensureDefaultPlans();
  const rows = await db.select().from(plansTable).orderBy(plansTable.sortOrder);
  res.json({ plans: rows });
});

router.post("/admin/plans", validateBody(CreatePlanBody), async (req, res) => {
  const b = getBody<z.infer<typeof CreatePlanBody>>(req);
  const id = b.id.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!id) { res.status(400).json({ error: "Invalid plan id" }); return; }
  const [plan] = await db.insert(plansTable).values({
    id,
    name: b.name,
    priceCents: b.priceCents ?? 0,
    interval: b.interval ?? "month",
    isActive: b.isActive !== false,
    isDefault: !!b.isDefault,
    sortOrder: b.sortOrder ?? 50,
    limits: b.limits ?? {},
    features: Array.isArray(b.features) ? b.features : [],
  }).returning();
  await audit(req, "plan.created", "plan", plan.id);
  res.json({ plan });
});

router.patch(
  "/admin/plans/:id",
  validateParams(IdStringParam),
  validateBody(UpdatePlanBody),
  async (req, res) => {
    const updates = getBody<z.infer<typeof UpdatePlanBody>>(req);
    const [plan] = await db.update(plansTable).set(updates).where(eq(plansTable.id, req.params.id)).returning();
    if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
    await audit(req, "plan.updated", "plan", plan.id, updates);
    res.json({ plan });
  },
);

router.delete("/admin/plans/:id", validateParams(IdStringParam), async (req, res) => {
  await db.delete(plansTable).where(eq(plansTable.id, req.params.id));
  await audit(req, "plan.deleted", "plan", req.params.id);
  res.json({ ok: true });
});

/* ════════════════════ SUBSCRIPTIONS ════════════════════ */

router.get("/admin/subscriptions", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 50 });
  const where: SQL | undefined = pg.q
    ? ilike(usersTable.email, `%${pg.q}%`)
    : undefined;

  const [[totalRow], rows] = await Promise.all([
    db
      .select({ n: count() })
      .from(subscriptionsTable)
      .leftJoin(usersTable, eq(usersTable.id, subscriptionsTable.userId))
      .where(where),
    db
      .select({
        id: subscriptionsTable.id, userId: subscriptionsTable.userId, planId: subscriptionsTable.planId,
        status: subscriptionsTable.status, startedAt: subscriptionsTable.startedAt,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd, canceledAt: subscriptionsTable.canceledAt,
        userEmail: usersTable.email, userName: usersTable.name,
      })
      .from(subscriptionsTable)
      .leftJoin(usersTable, eq(usersTable.id, subscriptionsTable.userId))
      .where(where)
      .orderBy(desc(subscriptionsTable.startedAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json({ subscriptions: rows, pagination: paginationMeta(pg, total) });
});

router.post("/admin/subscriptions", validateBody(CreateSubscriptionBody), async (req, res) => {
  const b = getBody<z.infer<typeof CreateSubscriptionBody>>(req);
  const [sub] = await db.insert(subscriptionsTable).values({
    userId: b.userId,
    planId: b.planId,
    status: b.status ?? "active",
    currentPeriodEnd: b.currentPeriodEnd ?? null,
  }).returning();
  await audit(req, "subscription.created", "subscription", sub.id, { userId: b.userId, planId: b.planId });
  res.json({ subscription: sub });
});

router.patch(
  "/admin/subscriptions/:id",
  validateParams(IdStringParam),
  validateBody(UpdateSubscriptionBody),
  async (req, res) => {
    const b = getBody<z.infer<typeof UpdateSubscriptionBody>>(req);
    const updates: any = { ...b };
    if (b.status === "canceled") updates.canceledAt = new Date();
    const [sub] = await db.update(subscriptionsTable).set(updates).where(eq(subscriptionsTable.id, req.params.id)).returning();
    if (!sub) { res.status(404).json({ error: "Not found" }); return; }
    await audit(req, "subscription.updated", "subscription", sub.id, updates);
    res.json({ subscription: sub });
  },
);

router.delete("/admin/subscriptions/:id", validateParams(IdStringParam), async (req, res) => {
  await db.delete(subscriptionsTable).where(eq(subscriptionsTable.id, req.params.id));
  await audit(req, "subscription.deleted", "subscription", req.params.id);
  res.json({ ok: true });
});

/* ════════════════════ USAGE ════════════════════ */

router.get("/admin/usage", async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 14)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const byDayRaw = await db.execute(sql`
    SELECT DATE_TRUNC('day', created_at) AS day,
           COUNT(*)::int AS requests,
           COUNT(*) FILTER (WHERE status_code >= 500)::int AS errors,
           COALESCE(AVG(duration_ms), 0)::int AS avg_latency
    FROM usage_events WHERE created_at >= ${since}
    GROUP BY day ORDER BY day ASC
  `);
  const byKindRaw = await db.execute(sql`
    SELECT kind, COUNT(*)::int AS count, COALESCE(SUM(tokens_used), 0)::int AS tokens
    FROM usage_events WHERE created_at >= ${since}
    GROUP BY kind ORDER BY count DESC
  `);
  const topUsersRaw = await db.execute(sql`
    SELECT u.user_id, us.email, us.name, COUNT(*)::int AS requests
    FROM usage_events u LEFT JOIN users us ON us.id::text = u.user_id
    WHERE u.created_at >= ${since} AND u.user_id IS NOT NULL
    GROUP BY u.user_id, us.email, us.name ORDER BY requests DESC LIMIT 20
  `);
  const topRoutesRaw = await db.execute(sql`
    SELECT route, COUNT(*)::int AS count, COALESCE(AVG(duration_ms), 0)::int AS avg_latency
    FROM usage_events WHERE created_at >= ${since} AND route IS NOT NULL
    GROUP BY route ORDER BY count DESC LIMIT 15
  `);

  res.json({
    days,
    byDay: (byDayRaw as any).rows ?? byDayRaw,
    byKind: (byKindRaw as any).rows ?? byKindRaw,
    topUsers: (topUsersRaw as any).rows ?? topUsersRaw,
    topRoutes: (topRoutesRaw as any).rows ?? topRoutesRaw,
  });
});

/* ════════════════════ EVENTS ════════════════════ */

router.get("/admin/events", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 100, maxPageSize: 200 });
  const kind = typeof req.query.kind === "string" ? req.query.kind : null;
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;
  const minStatus = req.query.errorsOnly === "1" ? 400 : 0;

  const conds: any[] = [];
  if (kind) conds.push(eq(usageEventsTable.kind, kind));
  if (userId) conds.push(eq(usageEventsTable.userId, userId));
  if (minStatus) conds.push(gte(usageEventsTable.statusCode, minStatus));
  const where = conds.length ? and(...conds) : undefined;

  const [[totalRow], rows] = await Promise.all([
    db.select({ n: count() }).from(usageEventsTable).where(where),
    db
      .select({
        id: usageEventsTable.id, userId: usageEventsTable.userId, kind: usageEventsTable.kind,
        route: usageEventsTable.route, method: usageEventsTable.method,
        statusCode: usageEventsTable.statusCode, durationMs: usageEventsTable.durationMs,
        createdAt: usageEventsTable.createdAt, userEmail: usersTable.email,
      })
      .from(usageEventsTable)
      .leftJoin(usersTable, sql`${usersTable.id}::text = ${usageEventsTable.userId}`)
      .where(where)
      .orderBy(desc(usageEventsTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json({ events: rows, pagination: paginationMeta(pg, total) });
});

/* ════════════════════ API KEYS ════════════════════ */

router.get("/admin/api-keys", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 50 });
  const where: SQL | undefined = pg.q ? ilike(apiKeysTable.name, `%${pg.q}%`) : undefined;
  const [[totalRow], rows] = await Promise.all([
    db.select({ n: count() }).from(apiKeysTable).where(where),
    db
      .select({
        id: apiKeysTable.id, userId: apiKeysTable.userId, name: apiKeysTable.name,
        prefix: apiKeysTable.prefix, scopes: apiKeysTable.scopes,
        lastUsedAt: apiKeysTable.lastUsedAt, revokedAt: apiKeysTable.revokedAt,
        createdAt: apiKeysTable.createdAt, userEmail: usersTable.email,
      })
      .from(apiKeysTable)
      .leftJoin(usersTable, eq(usersTable.id, apiKeysTable.userId))
      .where(where)
      .orderBy(desc(apiKeysTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json({ apiKeys: rows, pagination: paginationMeta(pg, total) });
});

router.post("/admin/api-keys", validateBody(CreateApiKeyBody), async (req, res) => {
  const { userId, name, scopes } = getBody<z.infer<typeof CreateApiKeyBody>>(req);
  const { full, prefix, hash } = generateApiKey();
  const [key] = await db.insert(apiKeysTable).values({
    userId, name, prefix, hash,
    scopes: Array.isArray(scopes) && scopes.length ? scopes : ["read"],
  }).returning({
    id: apiKeysTable.id, prefix: apiKeysTable.prefix, name: apiKeysTable.name,
    scopes: apiKeysTable.scopes, createdAt: apiKeysTable.createdAt,
  });
  await audit(req, "apikey.created", "apikey", key.id, { userId });
  res.json({ apiKey: key, secret: full });
});

router.post("/admin/api-keys/:id/revoke", validateParams(IdStringParam), async (req, res) => {
  const [k] = await db.update(apiKeysTable).set({ revokedAt: new Date() })
    .where(eq(apiKeysTable.id, req.params.id)).returning();
  if (!k) { res.status(404).json({ error: "Not found" }); return; }
  await audit(req, "apikey.revoked", "apikey", k.id);
  res.json({ ok: true });
});

router.delete("/admin/api-keys/:id", validateParams(IdStringParam), async (req, res) => {
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, req.params.id));
  await audit(req, "apikey.deleted", "apikey", req.params.id);
  res.json({ ok: true });
});

/* ════════════════════ MONITORING ════════════════════ */

router.get("/admin/monitoring", async (_req, res) => {
  const snap = getMetricsSnapshot();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const persisted = await db.execute(sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status_code >= 500)::int AS errors,
           COALESCE(AVG(duration_ms), 0)::int AS avg_latency
    FROM usage_events WHERE created_at >= ${since}
  `);
  const dbHealth = await db.execute(sql`SELECT 1 AS ok`).then(() => "ok").catch(() => "down");
  res.json({
    ...snap,
    db: { status: dbHealth },
    persisted60m: ((persisted as any).rows ?? persisted)[0] ?? null,
  });
});

/* ════════════════════ WORKFLOWS (user funnel) ════════════════════ */

router.get("/admin/workflows", async (_req, res) => {
  const totalUsers = await db.select({ c: sql<number>`COUNT(*)::int` }).from(usersTable);
  const usersWithBrand = await db.execute(sql`
    SELECT COUNT(DISTINCT user_id)::int AS c FROM brands
  `);
  const usersWithCampaign = await db.execute(sql`
    SELECT COUNT(DISTINCT b.user_id)::int AS c
    FROM campaigns c JOIN brands b ON b.id = c.brand_id
  `);
  const usersWithPublishedPost = await db.execute(sql`
    SELECT COUNT(DISTINCT b.user_id)::int AS c
    FROM posts p JOIN campaigns c ON c.id = p.campaign_id JOIN brands b ON b.id = c.brand_id
    WHERE p.status = 'published'
  `).catch(() => ({ rows: [{ c: 0 }] }));

  const total = totalUsers[0]?.c ?? 0;
  const wb = ((usersWithBrand as any).rows ?? usersWithBrand)[0]?.c ?? 0;
  const wc = ((usersWithCampaign as any).rows ?? usersWithCampaign)[0]?.c ?? 0;
  const wp = ((usersWithPublishedPost as any).rows ?? usersWithPublishedPost)[0]?.c ?? 0;

  const recent = await db.execute(sql`
    SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*)::int AS signups
    FROM users WHERE created_at >= NOW() - INTERVAL '14 days'
    GROUP BY day ORDER BY day ASC
  `);

  res.json({
    funnel: [
      { step: "Signed up", count: total },
      { step: "Created brand", count: wb, rate: total ? +((wb / total) * 100).toFixed(1) : 0 },
      { step: "Launched campaign", count: wc, rate: total ? +((wc / total) * 100).toFixed(1) : 0 },
      { step: "Published a post", count: wp, rate: total ? +((wp / total) * 100).toFixed(1) : 0 },
    ],
    signupsByDay: (recent as any).rows ?? recent,
  });
});

/* ════════════════════ WEBHOOKS ════════════════════ */

router.get("/admin/webhooks", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 50 });
  const [[totalRow], rows] = await Promise.all([
    db.select({ n: count() }).from(webhooksTable),
    db.select().from(webhooksTable).orderBy(desc(webhooksTable.createdAt)).limit(pg.limit).offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json({ webhooks: rows, pagination: paginationMeta(pg, total) });
});

router.post("/admin/webhooks", validateBody(CreateWebhookBody), async (req, res) => {
  const b = getBody<z.infer<typeof CreateWebhookBody>>(req);
  const [wh] = await db.insert(webhooksTable).values({
    url: b.url,
    events: Array.isArray(b.events) ? b.events : [],
    secret: b.secret ?? null,
    isActive: b.isActive !== false,
  }).returning();
  await audit(req, "webhook.created", "webhook", wh.id);
  res.json({ webhook: wh });
});

router.patch(
  "/admin/webhooks/:id",
  validateParams(IdStringParam),
  validateBody(UpdateWebhookBody),
  async (req, res) => {
    const updates = getBody<z.infer<typeof UpdateWebhookBody>>(req);
    const [wh] = await db.update(webhooksTable).set(updates).where(eq(webhooksTable.id, req.params.id)).returning();
    if (!wh) { res.status(404).json({ error: "Not found" }); return; }
    await audit(req, "webhook.updated", "webhook", wh.id, updates);
    res.json({ webhook: wh });
  },
);

router.delete("/admin/webhooks/:id", validateParams(IdStringParam), async (req, res) => {
  await db.delete(webhooksTable).where(eq(webhooksTable.id, req.params.id));
  await audit(req, "webhook.deleted", "webhook", req.params.id);
  res.json({ ok: true });
});

export default router;
