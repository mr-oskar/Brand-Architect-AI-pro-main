import { Router, type IRouter, type Request } from "express";
import { eq, desc, sql, count, inArray, or, ilike, and, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  usersTable,
  brandsTable,
  campaignsTable,
  postsTable,
  appSettingsTable,
  auditLogsTable,
} from "@workspace/db/schema";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";
import { syncRuntimeSettings } from "../lib/runtimeSettings";
import { hashPassword } from "../lib/auth";
import { parsePagination, paginationMeta, setPaginationHeaders } from "../lib/pagination";
import { validateBody, validateParams, getBody, Schemas } from "../lib/validate";

const router: IRouter = Router();

router.use("/admin", requireAdmin);

async function audit(
  req: Request,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: any,
) {
  try {
    const r = req as AdminRequest;
    await db.insert(auditLogsTable).values({
      actorId: r.userId,
      actorEmail: r.userEmail ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      metadata: metadata ?? null,
    });
  } catch {
    // best effort
  }
}

// ============================== Validation Schemas ==============================

const IdStringParam = z.object({ id: Schemas.IdString });
const IdNumberParam = z.object({ id: Schemas.IdNumber });

const CreateUserBody = z.object({
  email: Schemas.EmailStr,
  password: Schemas.PasswordStr,
  name: z.string().trim().max(100).optional().nullable(),
  role: Schemas.Role.optional(),
});

const UpdateUserBody = z.object({
  name: z.string().trim().max(100).optional(),
  role: Schemas.Role.optional(),
  status: Schemas.UserStatus.optional(),
  credits: z.number().int().min(0).max(10_000_000).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "Nothing to update" });

const ResetPasswordBody = z.object({
  password: Schemas.PasswordStr,
});

const SettingsBody = z.object({
  settings: z.record(z.string().max(100), z.unknown())
    .refine((v) => v && Object.keys(v).length > 0, { message: "settings object required" }),
});

// ----------------------------- Stats / Overview -----------------------------
router.get("/admin/stats", async (_req, res) => {
  try {
    const [[u], [b], [c], [p]] = await Promise.all([
      db.select({ n: count() }).from(usersTable),
      db.select({ n: count() }).from(brandsTable),
      db.select({ n: count() }).from(campaignsTable),
      db.select({ n: count() }).from(postsTable),
    ]);

    const [postsByStatus] = await Promise.all([
      db
        .select({
          status: postsTable.publishStatus,
          n: count(),
        })
        .from(postsTable)
        .groupBy(postsTable.publishStatus),
    ]);

    const recentBrands = await db
      .select({
        id: brandsTable.id,
        companyName: brandsTable.companyName,
        industry: brandsTable.industry,
        userId: brandsTable.userId,
        createdAt: brandsTable.createdAt,
      })
      .from(brandsTable)
      .orderBy(desc(brandsTable.createdAt))
      .limit(5);

    res.json({
      counts: {
        users: u?.n ?? 0,
        brands: b?.n ?? 0,
        campaigns: c?.n ?? 0,
        posts: p?.n ?? 0,
      },
      postsByStatus,
      recentBrands,
      env: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
        clerk: Boolean(process.env.CLERK_SECRET_KEY),
        demoMode: process.env.AUTH_ALLOW_DEMO === "1",
        nodeEnv: process.env.NODE_ENV ?? "development",
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to load stats" });
  }
});

// ----------------------------- Users -----------------------------
router.get("/admin/users", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 50 });

  const where: SQL | undefined = pg.q
    ? or(ilike(usersTable.email, `%${pg.q}%`), ilike(usersTable.name, `%${pg.q}%`))
    : undefined;

  const [[totalRow], users] = await Promise.all([
    db.select({ n: count() }).from(usersTable).where(where),
    db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        status: usersTable.status,
        credits: usersTable.credits,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(where)
      .orderBy(desc(usersTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);

  const total = Number(totalRow?.n ?? 0);

  // brand counts only for the users on this page (perf)
  const ids = users.map((u) => u.id);
  const brandCounts = ids.length
    ? await db
        .select({ userId: brandsTable.userId, n: count() })
        .from(brandsTable)
        .where(inArray(brandsTable.userId, ids))
        .groupBy(brandsTable.userId)
    : [];
  const map = new Map(brandCounts.map((r) => [r.userId, Number(r.n)]));

  setPaginationHeaders(res, pg, total);
  res.json({
    users: users.map((u) => ({ ...u, brandCount: map.get(u.id) ?? 0 })),
    pagination: paginationMeta(pg, total),
  });
});

router.patch(
  "/admin/users/:id",
  validateParams(IdStringParam),
  validateBody(UpdateUserBody),
  async (req, res) => {
    const id = req.params.id;
    const updates = getBody<z.infer<typeof UpdateUserBody>>(req);

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        status: usersTable.status,
        credits: usersTable.credits,
      });
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await audit(req, "user.updated", "user", id, updates);
    res.json({ user: updated });
  },
);

router.post(
  "/admin/users/:id/reset-password",
  validateParams(IdStringParam),
  validateBody(ResetPasswordBody),
  async (req, res) => {
    const id = req.params.id;
    const { password } = getBody<z.infer<typeof ResetPasswordBody>>(req);
    const passwordHash = await hashPassword(password);
    const [updated] = await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await audit(req, "user.password_reset", "user", id);
    res.json({ ok: true });
  },
);

router.post("/admin/users", validateBody(CreateUserBody), async (req, res) => {
  const { email, password, name, role } = getBody<z.infer<typeof CreateUserBody>>(req);
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const finalRole = role === "admin" ? "admin" : "user";
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      name: name ?? null,
      role: finalRole,
    })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    });
  await audit(req, "user.created", "user", user.id, { role: finalRole });
  res.json({ user: { ...user, brandCount: 0 } });
});

router.delete("/admin/users/:id", validateParams(IdStringParam), async (req, res) => {
  const id = req.params.id;
  const r = req as AdminRequest;
  if (id === r.userId) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }
  const userBrands = await db
    .select({ id: brandsTable.id })
    .from(brandsTable)
    .where(eq(brandsTable.userId, id));
  const brandIds = userBrands.map((b) => b.id);
  if (brandIds.length) {
    await db.delete(brandsTable).where(inArray(brandsTable.id, brandIds));
  }
  const result = await db.delete(usersTable).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
  if (!result.length) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await audit(req, "user.deleted", "user", id, { brands: brandIds.length });
  res.json({ ok: true });
});

// ----------------------------- Brands -----------------------------
router.get("/admin/brands", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 50 });

  const where: SQL | undefined = pg.q
    ? or(ilike(brandsTable.companyName, `%${pg.q}%`), ilike(brandsTable.industry, `%${pg.q}%`))
    : undefined;

  const [[totalRow], rows] = await Promise.all([
    db.select({ n: count() }).from(brandsTable).where(where),
    db
      .select({
        id: brandsTable.id,
        companyName: brandsTable.companyName,
        industry: brandsTable.industry,
        status: brandsTable.status,
        userId: brandsTable.userId,
        logoUrl: brandsTable.logoUrl,
        createdAt: brandsTable.createdAt,
      })
      .from(brandsTable)
      .where(where)
      .orderBy(desc(brandsTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json({ brands: rows, pagination: paginationMeta(pg, total) });
});

router.delete("/admin/brands/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await db.delete(brandsTable).where(eq(brandsTable.id, id)).returning({ id: brandsTable.id });
  if (!result.length) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }
  await audit(req, "brand.deleted", "brand", String(id));
  res.json({ ok: true });
});

// ----------------------------- Campaigns -----------------------------
router.get("/admin/campaigns", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 50 });
  const where: SQL | undefined = pg.q ? ilike(campaignsTable.title, `%${pg.q}%`) : undefined;

  const [[totalRow], rows] = await Promise.all([
    db.select({ n: count() }).from(campaignsTable).where(where),
    db
      .select({
        id: campaignsTable.id,
        title: campaignsTable.title,
        brandId: campaignsTable.brandId,
        brandName: brandsTable.companyName,
        createdAt: campaignsTable.createdAt,
      })
      .from(campaignsTable)
      .leftJoin(brandsTable, eq(brandsTable.id, campaignsTable.brandId))
      .where(where)
      .orderBy(desc(campaignsTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json({ campaigns: rows, pagination: paginationMeta(pg, total) });
});

router.delete("/admin/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await db
    .delete(campaignsTable)
    .where(eq(campaignsTable.id, id))
    .returning({ id: campaignsTable.id });
  if (!result.length) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  await audit(req, "campaign.deleted", "campaign", String(id));
  res.json({ ok: true });
});

// ----------------------------- Posts -----------------------------
router.get("/admin/posts", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 50 });
  const where: SQL | undefined = pg.q
    ? or(ilike(postsTable.caption, `%${pg.q}%`), ilike(postsTable.platform, `%${pg.q}%`))
    : undefined;

  const [[totalRow], rows] = await Promise.all([
    db.select({ n: count() }).from(postsTable).where(where),
    db
      .select({
        id: postsTable.id,
        caption: postsTable.caption,
        platform: postsTable.platform,
        publishStatus: postsTable.publishStatus,
        campaignId: postsTable.campaignId,
        campaignTitle: campaignsTable.title,
        imageUrl: postsTable.imageUrl,
        createdAt: postsTable.createdAt,
      })
      .from(postsTable)
      .leftJoin(campaignsTable, eq(campaignsTable.id, postsTable.campaignId))
      .where(where)
      .orderBy(desc(postsTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json({ posts: rows, pagination: paginationMeta(pg, total) });
});

router.delete("/admin/posts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await db.delete(postsTable).where(eq(postsTable.id, id)).returning({ id: postsTable.id });
  if (!result.length) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  await audit(req, "post.deleted", "post", String(id));
  res.json({ ok: true });
});

// ----------------------------- Settings -----------------------------
const DEFAULT_SETTINGS = {
  adminEmails: [] as string[],
  siteName: "Brand Architect AI Pro",
  tagline: "AI Brand & Marketing OS",
  primaryColor: "#7c3aed",
  defaultLanguage: "ar",
  features: {
    imageGeneration: true,
    socialPublishing: true,
    analytics: true,
    templates: true,
  },
  defaultUserCredits: 100,
  creditCosts: {
    "brand.generate-kit": 50,
    "brand.generate-logo-variants": 40,
    "brand.generate-story": 10,
    "brand.generate-content": 5,
    "brand.generate-campaign": 60,
    "post.generate-image": 10,
    "post.regenerate": 8,
    "post.generate-variant": 5,
    "post.generate-content": 5,
    "design.generate-image": 10,
    "design.generate-layout": 6,
    "campaign.generate-all-images": 10,
  },
  ai: {
    textModel: "gemini-2.5-flash",
    imageModel: "gemini-2.5-flash-image",
    maxTokens: 4096,
    temperature: 0.7,
  },
  limits: {
    brandsPerUser: 10,
    campaignsPerBrand: 50,
    postsPerCampaign: 90,
  },
  maintenance: {
    enabled: false,
    message: "We are performing scheduled maintenance. Please check back soon.",
  },
  landing: {
    accentColor: "#ec4899",
    badge: "Powered by GPT-5 & gpt-image-1",
    heroTitle: "Build Brands &",
    heroTitleAccent: "Campaigns",
    heroTitleSuffix: "with AI",
    heroSubtitle:
      "Brand Architect AI Pro generates complete brand identities, multi-day social media campaigns, and stunning visuals — all in one workspace, isolated per account.",
    primaryCtaLabel: "Start Building for Free",
    secondaryCtaLabel: "Sign In to Your Workspace",
    showStats: false,
    stats: [],
    showProjects: true,
    projectsHeading: "Trusted by ambitious teams",
    projects: [
      { name: "Acme Studios" },
      { name: "Northwind Co." },
      { name: "Lumen Labs" },
      { name: "Pixel Forge" },
      { name: "Atlas & Co." },
      { name: "Quanta Brands" },
      { name: "Vertex Group" },
      { name: "Solace Media" },
    ],
    highlights: [
      "Complete brand kit in minutes",
      "Multi-platform campaign generation",
      "AI-powered image creation",
      "Isolated workspace per account",
      "Export CSV & brand assets",
      "Dark mode support",
    ],
    showHighlights: true,
    featuresHeading: "Everything You Need to Build a Brand",
    featuresSubheading:
      "From identity to content to visuals — AI handles the heavy lifting so you can focus on growth.",
    features: [
      {
        icon: "Sparkles",
        title: "AI Brand Identity",
        description:
          "Generate a complete brand kit — colors, typography, voice, and personality — in seconds.",
      },
      {
        icon: "CalendarDays",
        title: "Campaign Generator",
        description:
          "Create full multi-day social media campaigns with posts tailored per platform.",
      },
      {
        icon: "Image",
        title: "AI Image Generation",
        description:
          "Generate stunning campaign visuals with your brand logo and style applied automatically.",
      },
      {
        icon: "LayoutTemplate",
        title: "Content Calendar",
        description:
          "Visualize all your scheduled posts in a monthly calendar view by platform.",
      },
      {
        icon: "Zap",
        title: "Instant Copy",
        description:
          "AI-powered hooks, captions, CTAs, and hashtags optimized for engagement.",
      },
      {
        icon: "BarChart3",
        title: "Brand Analytics",
        description:
          "Track brand performance and campaign output across all your projects.",
      },
    ],
    showPricing: true,
    pricingHeading: "Simple, transparent pricing",
    pricingSubheading: "Start free. Upgrade as you grow.",
    pricingPlans: [
      {
        name: "Starter",
        price: "$0",
        period: "/month",
        description: "Perfect for trying out Brand Architect.",
        features: ["1 brand kit", "5 campaigns / month", "Community support"],
        ctaLabel: "Start free",
        highlighted: false,
      },
      {
        name: "Pro",
        price: "$29",
        period: "/month",
        description: "Everything you need to scale your brand.",
        features: [
          "Unlimited brand kits",
          "Unlimited campaigns",
          "AI image generation",
          "Priority support",
        ],
        ctaLabel: "Go Pro",
        highlighted: true,
      },
      {
        name: "Agency",
        price: "$99",
        period: "/month",
        description: "Built for teams managing many clients.",
        features: [
          "Team workspaces",
          "Client export & whitelabel",
          "Advanced analytics",
          "Dedicated success manager",
        ],
        ctaLabel: "Contact sales",
        highlighted: false,
      },
    ],
    ctaHeading: "Ready to Build Your Brand?",
    ctaSubheading:
      "Create your account and start generating your brand identity in minutes.",
    ctaButtonLabel: "Get Started Free",
    footerText: "Built with AI",
  },
};

router.get("/admin/settings", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable);
  const obj: Record<string, any> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key === "landing" && r.value && typeof r.value === "object" && !Array.isArray(r.value)) {
      obj.landing = { ...(DEFAULT_SETTINGS as any).landing, ...(r.value as any) };
    } else {
      obj[r.key] = r.value;
    }
  }
  res.json({ settings: obj });
});

router.put("/admin/settings", validateBody(SettingsBody), async (req, res) => {
  const { settings: incoming } = getBody<z.infer<typeof SettingsBody>>(req);

  if ("creditCosts" in incoming || "defaultUserCredits" in incoming) {
    const { invalidateCreditsCache } = await import("../lib/credits");
    invalidateCreditsCache();
  }

  const entries = Object.entries(incoming);
  for (const [key, value] of entries) {
    if (typeof key !== "string" || key.length > 100) continue;
    let normalized: any = value;
    if (key === "adminEmails" && Array.isArray(value)) {
      normalized = Array.from(
        new Set(
          (value as any[])
            .map((e) => String(e).trim().toLowerCase())
            .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
        ),
      );
    }
    await db
      .insert(appSettingsTable)
      .values({ key, value: normalized })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: normalized },
      });
  }

  if (incoming.adminEmails && Array.isArray(incoming.adminEmails)) {
    const list: string[] = Array.from(
      new Set(
        (incoming.adminEmails as any[])
          .map((e) => String(e).trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
      ),
    );
    const allUsers = await db
      .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
      .from(usersTable);
    const actorId = (req as AdminRequest).userId;
    for (const u of allUsers) {
      const shouldBeAdmin = list.includes(u.email.toLowerCase());
      if (shouldBeAdmin && u.role !== "admin") {
        await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, u.id));
      } else if (!shouldBeAdmin && u.role === "admin" && u.id !== actorId) {
        await db.update(usersTable).set({ role: "user" }).where(eq(usersTable.id, u.id));
      }
    }
  }
  await audit(req, "settings.updated", "settings", undefined, {
    keys: entries.map(([k]) => k),
  });
  await syncRuntimeSettings();
  const rows = await db.select().from(appSettingsTable);
  const obj: Record<string, any> = { ...DEFAULT_SETTINGS };
  for (const r of rows) obj[r.key] = r.value;
  res.json({ settings: obj });
});

// ----------------------------- Audit log -----------------------------
router.get("/admin/audit-logs", async (req, res) => {
  const pg = parsePagination(req, { defaultPageSize: 100, maxPageSize: 200 });
  const [[totalRow], rows] = await Promise.all([
    db.select({ n: count() }).from(auditLogsTable),
    db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json({ logs: rows, pagination: paginationMeta(pg, total) });
});

export default router;

// Public settings endpoint (no admin required) - exported separately
export const publicSettingsRouter: IRouter = Router();
publicSettingsRouter.get("/public-settings", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable);
  const obj: Record<string, any> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key === "landing" && r.value && typeof r.value === "object" && !Array.isArray(r.value)) {
      obj.landing = { ...(DEFAULT_SETTINGS as any).landing, ...(r.value as any) };
    } else {
      obj[r.key] = r.value;
    }
  }
  res.json({
    siteName: obj.siteName,
    tagline: obj.tagline,
    primaryColor: obj.primaryColor,
    defaultLanguage: obj.defaultLanguage,
    features: obj.features,
    maintenance: obj.maintenance,
    landing: obj.landing,
  });
});
