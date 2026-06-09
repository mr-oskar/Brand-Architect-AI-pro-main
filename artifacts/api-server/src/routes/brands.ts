import { Router, type IRouter } from "express";
import { eq, desc, count, sql, and, ilike, or, inArray, isNotNull, type SQL } from "drizzle-orm";
import { db, brandsTable, campaignsTable, postsTable } from "@workspace/db";
import { parsePagination, setPaginationHeaders } from "../lib/pagination";
import {
  CreateBrandBody,
  UpdateBrandBody,
  GetBrandParams,
  UpdateBrandParams,
  DeleteBrandParams,
  GenerateBrandKitParams,
  GenerateCampaignParams,
  GenerateCampaignBody,
  GetBrandStatsParams,
} from "@workspace/api-zod";
import { generateBrandKit, generateCampaign, generateBrandStory, generateLongFormContent, analyzeBrief, type BrandKit } from "../lib/ai";
import { chargeCredits, refundCredits } from "../lib/credits";
import { fetchIndustryTrends } from "../lib/trends";
import { asyncHandler } from "../lib/asyncHandler";
import { createJob, updateJob } from "../lib/jobStore";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { randomUUID } from "crypto";
import { generateLogoVariants, dataUrlToBuffer, extractLogoColors } from "../lib/logoProcessor";
import { uploadImageBuffer, storagePathToUrl } from "../lib/imageStorage";

const router: IRouter = Router();

// ─── List brands ──────────────────────────────────────────────────────────────

router.get("/brands", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const pg = parsePagination(req, { defaultPageSize: 50, maxPageSize: 200 });

  const filters: SQL[] = [eq(brandsTable.userId, userId)];
  if (pg.q) {
    const search = or(
      ilike(brandsTable.companyName, `%${pg.q}%`),
      ilike(brandsTable.industry, `%${pg.q}%`),
    );
    if (search) filters.push(search);
  }
  const where = filters.length > 1 ? and(...filters) : filters[0];

  const [[totalRow], brands] = await Promise.all([
    db.select({ n: count() }).from(brandsTable).where(where),
    db
      .select({
        id: brandsTable.id,
        companyName: brandsTable.companyName,
        industry: brandsTable.industry,
        logoUrl: brandsTable.logoUrl,
        status: brandsTable.status,
        createdAt: brandsTable.createdAt,
        updatedAt: brandsTable.updatedAt,
      })
      .from(brandsTable)
      .where(where)
      .orderBy(desc(brandsTable.createdAt))
      .limit(pg.limit)
      .offset(pg.offset),
  ]);
  const total = Number(totalRow?.n ?? 0);
  setPaginationHeaders(res, pg, total);
  res.json(brands);
}));

// ─── Create brand ─────────────────────────────────────────────────────────────

router.post("/brands", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = CreateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [brand] = await db
    .insert(brandsTable)
    .values({
      userId,
      companyName: parsed.data.companyName,
      companyDescription: parsed.data.companyDescription,
      industry: parsed.data.industry,
      websiteUrl: parsed.data.websiteUrl ?? null,
      logoUrl: parsed.data.logoUrl ?? null,
      status: "draft",
    })
    .returning();

  res.status(201).json({ ...brand, brandKit: brand.brandKit ?? null, createdAt: brand.createdAt.toISOString(), updatedAt: brand.updatedAt.toISOString() });
}));

// ─── Get brand ────────────────────────────────────────────────────────────────

router.get("/brands/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GetBrandParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, params.data.id), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  res.json({ ...brand, brandKit: brand.brandKit ?? null, createdAt: brand.createdAt.toISOString(), updatedAt: brand.updatedAt.toISOString() });
}));

// ─── Update brand ─────────────────────────────────────────────────────────────

router.patch("/brands/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = UpdateBrandParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateBrandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.companyName !== undefined) updateData.companyName = parsed.data.companyName;
  if (parsed.data.companyDescription !== undefined) updateData.companyDescription = parsed.data.companyDescription;
  if (parsed.data.industry !== undefined) updateData.industry = parsed.data.industry;
  if (parsed.data.websiteUrl !== undefined) updateData.websiteUrl = parsed.data.websiteUrl;
  if (parsed.data.logoUrl !== undefined) updateData.logoUrl = parsed.data.logoUrl;

  const [brand] = await db.update(brandsTable).set(updateData).where(and(eq(brandsTable.id, params.data.id), eq(brandsTable.userId, userId))).returning();
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  res.json({ ...brand, brandKit: brand.brandKit ?? null, createdAt: brand.createdAt.toISOString(), updatedAt: brand.updatedAt.toISOString() });
}));

// ─── Delete brand ─────────────────────────────────────────────────────────────

router.delete("/brands/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = DeleteBrandParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [brand] = await db.delete(brandsTable).where(and(eq(brandsTable.id, params.data.id), eq(brandsTable.userId, userId))).returning();
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  res.sendStatus(204);
}));

// ─── Generate brand kit ───────────────────────────────────────────────────────

router.post("/brands/:id/generate-kit", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GenerateBrandKitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, params.data.id), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  await chargeCredits(userId, "brand.generate-kit");

  const { brandColors = [], targetAudience, brandValues, tonePreference } = req.body as {
    brandColors?: string[];
    targetAudience?: string;
    brandValues?: string[];
    tonePreference?: string;
  };

  let enrichedDescription = brand.companyDescription;
  if (targetAudience) enrichedDescription += ` Target audience: ${targetAudience}.`;
  if (brandValues && brandValues.length > 0) enrichedDescription += ` Core values: ${brandValues.join(", ")}.`;
  if (tonePreference) enrichedDescription += ` Communication tone preference: ${tonePreference}.`;

  const kit = await generateBrandKit(brand.companyName, enrichedDescription, brand.industry, brandColors);

  const [updated] = await db
    .update(brandsTable)
    .set({ brandKit: kit, status: "kit_ready" })
    .where(and(eq(brandsTable.id, params.data.id), eq(brandsTable.userId, userId)))
    .returning();

  res.json({ ...updated, brandKit: updated.brandKit ?? null, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
}));

// ─── Generate logo variants (black, white, grayscale) ────────────────────────

router.post("/brands/:id/generate-logo-variants", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid brand id" }); return; }

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, id), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
  if (!brand.logoUrl) { res.status(400).json({ error: "Brand has no logo" }); return; }

  await chargeCredits(userId, "brand.generate-logo-variants");

  const logoBuffer = dataUrlToBuffer(brand.logoUrl as string);
  const { black, white, grayscale } = await generateLogoVariants(logoBuffer);
  const extractedColors = await extractLogoColors(logoBuffer);

  const [blackPath, whitePath, grayPath] = await Promise.all([
    uploadImageBuffer(black, "image/png"),
    uploadImageBuffer(white, "image/png"),
    uploadImageBuffer(grayscale, "image/png"),
  ]);

  const logoVariants = {
    original: brand.logoUrl,
    black: storagePathToUrl(blackPath),
    white: storagePathToUrl(whitePath),
    grayscale: storagePathToUrl(grayPath),
  };

  const [updated] = await db
    .update(brandsTable)
    .set({ logoVariants })
    .where(and(eq(brandsTable.id, id), eq(brandsTable.userId, userId)))
    .returning();

  res.json({
    logoVariants,
    extractedColors,
    brand: { ...updated, brandKit: updated.brandKit ?? null, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
  });
}));

// ─── Generate / regenerate brand story ───────────────────────────────────────

router.post("/brands/:id/generate-story", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid brand id" }); return; }

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, id), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const kit = brand.brandKit as BrandKit | null;
  if (!kit) { res.status(400).json({ error: "Generate brand kit first" }); return; }

  await chargeCredits(userId, "brand.generate-story");

  const story = await generateBrandStory(brand.companyName, brand.companyDescription, brand.industry, kit);

  const updatedKit = { ...kit, brandStory: story };
  const [updated] = await db
    .update(brandsTable)
    .set({ brandKit: updatedKit })
    .where(and(eq(brandsTable.id, id), eq(brandsTable.userId, userId)))
    .returning();

  res.json({ brandStory: story, brand: { ...updated, brandKit: updated.brandKit, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() } });
}));

// ─── Generate long-form content for brand ─────────────────────────────────────

router.post("/brands/:id/generate-content", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid brand id" }); return; }

  const { contentType = "blog", topic } = req.body as { contentType?: string; topic?: string };
  if (!["blog", "email", "newsletter"].includes(contentType)) {
    res.status(400).json({ error: "contentType must be blog | email | newsletter" });
    return;
  }

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, id), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const kit = brand.brandKit as BrandKit | null;
  if (!kit) { res.status(400).json({ error: "Generate brand kit first" }); return; }

  await chargeCredits(userId, "brand.generate-content");

  const content = await generateLongFormContent(
    brand.companyName, brand.companyDescription, brand.industry, kit,
    contentType as "blog" | "email" | "newsletter",
    topic
  );

  res.json(content);
}));

// ─── Shared campaign execution logic ─────────────────────────────────────────

async function runCampaignGeneration(
  brandId: number,
  userId: string,
  brand: { id: number; companyName: string; companyDescription: string; industry: string; brandKit: unknown },
  brief: string | undefined,
  postCount: number,
  platforms: string[],
  onProgress?: (step: number) => void,
) {
  let kit = brand.brandKit as BrandKit | null;
  if (!kit) {
    kit = await generateBrandKit(brand.companyName, brand.companyDescription, brand.industry);
    await db.update(brandsTable).set({ brandKit: kit, status: "kit_ready" }).where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
  }
  onProgress?.(1);

  const trendData = await fetchIndustryTrends(brand.industry, brief);
  onProgress?.(2);

  const campaignData = await generateCampaign(
    brand.companyName, brand.companyDescription, brand.industry, kit, brief, postCount, platforms,
    trendData.summary,
  );

  const [campaign] = await db
    .insert(campaignsTable)
    .values({ brandId: brand.id, title: campaignData.title, strategy: campaignData.strategy, days: campaignData.days })
    .returning();

  const insertedPosts = await db
    .insert(postsTable)
    .values(
      campaignData.posts.map((p) => ({
        campaignId: campaign.id,
        day: p.day,
        caption: p.caption,
        hook: p.hook,
        cta: p.cta,
        hashtags: p.hashtags,
        imagePrompt: p.imagePrompt,
        platform: p.platform,
      }))
    )
    .returning();

  await db.update(brandsTable).set({ status: "active" }).where(and(eq(brandsTable.id, brand.id), eq(brandsTable.userId, userId)));

  return {
    id: campaign.id,
    brandId: campaign.brandId,
    title: campaign.title,
    strategy: campaign.strategy,
    days: campaign.days,
    posts: insertedPosts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

// ─── Generate campaign ────────────────────────────────────────────────────────

router.post("/brands/:id/generate-campaign", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GenerateCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const bodyParsed = GenerateCampaignBody.safeParse(req.body ?? {});
  const brief = bodyParsed.success ? (bodyParsed.data.brief ?? undefined) : undefined;
  const postCount = bodyParsed.success ? (bodyParsed.data.postCount ?? 7) : 7;
  const platforms = (req.body as { platforms?: string[] })?.platforms ?? ["instagram"];

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, params.data.id), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  await chargeCredits(userId, "brand.generate-campaign", Math.max(1, postCount / 7));

  const result = await runCampaignGeneration(params.data.id, userId, brand, brief, postCount, platforms);
  res.json(result);
}));

// ─── Async campaign generation (returns job id immediately) ──────────────────

router.post("/brands/:id/generate-campaign-async", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GenerateCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const bodyParsed = GenerateCampaignBody.safeParse(req.body ?? {});
  const brief = bodyParsed.success ? (bodyParsed.data.brief ?? undefined) : undefined;
  const postCount = bodyParsed.success ? (bodyParsed.data.postCount ?? 7) : 7;
  const platforms = (req.body as { platforms?: string[] })?.platforms ?? ["instagram"];

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, params.data.id), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const { charged } = await chargeCredits(userId, "brand.generate-campaign", Math.max(1, postCount / 7));

  const jobId = randomUUID();
  createJob(jobId, 3, userId);
  res.status(202).json({ jobId });

  (async () => {
    try {
      updateJob(jobId, { status: "running", progress: 0 });
      const result = await runCampaignGeneration(
        params.data.id, userId, brand, brief, postCount, platforms,
        (step) => updateJob(jobId, { progress: step }),
      );
      updateJob(jobId, { status: "done", progress: 3, result });
    } catch (err) {
      updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : "Unknown error" });
      await refundCredits(userId, charged).catch(() => {});
    }
  })();
}));

// ─── Get brand campaigns ──────────────────────────────────────────────────────

router.get("/brands/:id/campaigns", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const brandId = parseInt(raw, 10);
  if (isNaN(brandId)) { res.status(400).json({ error: "Invalid brand id" }); return; }

  const [brand] = await db.select({ id: brandsTable.id }).from(brandsTable).where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.brandId, brandId))
    .orderBy(desc(campaignsTable.createdAt));

  const campaignIds = campaigns.map((c) => c.id);
  const allPosts =
    campaignIds.length > 0
      ? await db.select().from(postsTable).where(inArray(postsTable.campaignId, campaignIds))
      : [];

  const result = campaigns.map((c) => ({
    id: c.id,
    brandId: c.brandId,
    title: c.title,
    strategy: c.strategy,
    days: c.days,
    posts: allPosts.filter((p) => p.campaignId === c.id).map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  res.json(result);
}));

// ─── Get brand stats ──────────────────────────────────────────────────────────

router.get("/brands/:id/stats", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GetBrandStatsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, params.data.id), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const campaigns = await db
    .select({ id: campaignsTable.id, createdAt: campaignsTable.createdAt })
    .from(campaignsTable)
    .where(eq(campaignsTable.brandId, params.data.id))
    .orderBy(desc(campaignsTable.createdAt));

  const campaignIds = campaigns.map((c) => c.id);
  let totalPosts = 0;
  let postsWithImages = 0;

  if (campaignIds.length > 0) {
    const [row] = await db
      .select({ cnt: count() })
      .from(postsTable)
      .where(inArray(postsTable.campaignId, campaignIds));
    totalPosts = Number(row?.cnt ?? 0);

    const [imgRow] = await db
      .select({ cnt: count() })
      .from(postsTable)
      .where(and(inArray(postsTable.campaignId, campaignIds), isNotNull(postsTable.imageUrl)));
    postsWithImages = Number(imgRow?.cnt ?? 0);
  }

  res.json({
    brandId: params.data.id,
    totalCampaigns: campaigns.length,
    totalPosts,
    postsWithImages,
    brandKitGenerated: brand.brandKit != null,
    hasExtendedKit: !!(brand.brandKit as BrandKit | null)?.brandStory,
    lastCampaignDate: campaigns[0]?.createdAt?.toISOString() ?? null,
  });
}));

// ─── Smart campaign brief job (new full-pipeline with progress) ───────────────

router.post("/brands/:id/campaign-brief-job", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const brandId = parseInt(req.params.id, 10);
  if (isNaN(brandId)) { res.status(400).json({ error: "Invalid brand id" }); return; }

  const body = (req.body ?? {}) as {
    brief?: string;
    referenceImages?: string[];
    postCount?: number;
    platforms?: string[];
  };

  const brief = body.brief?.trim() || undefined;
  const referenceImages: string[] = Array.isArray(body.referenceImages) ? body.referenceImages.slice(0, 5) : [];
  const postCount = Math.min(Math.max(Number(body.postCount ?? 7), 1), 14);
  const platforms: string[] = Array.isArray(body.platforms) && body.platforms.length > 0 ? body.platforms : ["instagram"];

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const { charged } = await chargeCredits(userId, "brand.generate-campaign", Math.max(1, postCount / 7));

  const jobId = randomUUID();
  createJob(jobId, 6, userId);
  res.status(202).json({ jobId });

  // Run the full pipeline asynchronously with per-step progress updates
  (async () => {
    try {
      updateJob(jobId, { status: "running", progress: 0, result: { _step: 0 } });

      // Step 0: Analyze brief
      const analyzed = await analyzeBrief(brief ?? "", referenceImages, brand.companyName, brand.industry);
      updateJob(jobId, { progress: 1, result: { _step: 1 } });

      // Step 1: Fetch trends
      const trendData = await fetchIndustryTrends(brand.industry, brief);
      updateJob(jobId, { progress: 2, result: { _step: 2 } });

      // Step 2: Image analysis step (already done in analyzeBrief, just advance)
      await new Promise((r) => setTimeout(r, 400));
      updateJob(jobId, { progress: 3, result: { _step: 3 } });

      // Step 3: Ensure brand kit
      let kit = brand.brandKit as BrandKit | null;
      if (!kit) {
        kit = await generateBrandKit(brand.companyName, brand.companyDescription, brand.industry);
        await db.update(brandsTable).set({ brandKit: kit, status: "kit_ready" }).where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
      }

      // Step 4: Generate campaign with analyzed brief
      const campaignData = await generateCampaign(
        brand.companyName, brand.companyDescription, brand.industry,
        kit, brief, postCount, platforms, trendData.summary, analyzed,
      );
      updateJob(jobId, { progress: 4, result: { _step: 4 } });

      // Step 5: Save to database
      const [campaign] = await db
        .insert(campaignsTable)
        .values({ brandId: brand.id, title: campaignData.title, strategy: campaignData.strategy, days: campaignData.days })
        .returning();

      const insertedPosts = await db
        .insert(postsTable)
        .values(
          campaignData.posts.map((p) => ({
            campaignId: campaign.id,
            day: p.day,
            caption: p.caption,
            hook: p.hook,
            cta: p.cta,
            hashtags: p.hashtags,
            imagePrompt: p.imagePrompt,
            platform: p.platform,
          }))
        )
        .returning();

      await db.update(brandsTable).set({ status: "active" }).where(and(eq(brandsTable.id, brand.id), eq(brandsTable.userId, userId)));
      updateJob(jobId, { progress: 5, result: { _step: 5 } });

      const result = {
        id: campaign.id,
        brandId: campaign.brandId,
        title: campaign.title,
        strategy: campaign.strategy,
        days: campaign.days,
        posts: insertedPosts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
      };

      updateJob(jobId, { status: "done", progress: 6, result });
    } catch (err) {
      updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : "Unknown error" });
      await refundCredits(userId, charged).catch(() => {});
    }
  })();
}));

export default router;
