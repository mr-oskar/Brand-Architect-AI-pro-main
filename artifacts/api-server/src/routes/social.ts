import { Router, type IRouter, type Response } from "express";
import { eq, and, lte, isNull } from "drizzle-orm";
import { db, socialAccountsTable, postsTable, campaignsTable, brandsTable } from "@workspace/db";
import { asyncHandler } from "../lib/asyncHandler";
import { publishPost } from "../lib/publisher";
import { logger } from "../lib/logger";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

// All routes in this file require an authenticated user.
router.use(requireAuth);

// ─── Ownership helpers ────────────────────────────────────────────────────────

async function assertBrandOwned(
  brandId: number,
  userId: string,
  res: Response,
): Promise<boolean> {
  const [brand] = await db
    .select({ id: brandsTable.id, userId: brandsTable.userId })
    .from(brandsTable)
    .where(eq(brandsTable.id, brandId));
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return false;
  }
  if (brand.userId && brand.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

async function assertCampaignOwned(
  campaignId: number,
  userId: string,
  res: Response,
): Promise<{ ok: true; brandId: number } | { ok: false }> {
  const [campaign] = await db
    .select({ id: campaignsTable.id, brandId: campaignsTable.brandId })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return { ok: false };
  }
  const owned = await assertBrandOwned(campaign.brandId, userId, res);
  if (!owned) return { ok: false };
  return { ok: true, brandId: campaign.brandId };
}

async function assertPostOwned(
  postId: number,
  userId: string,
  res: Response,
): Promise<
  | { ok: true; post: typeof postsTable.$inferSelect; campaign: typeof campaignsTable.$inferSelect }
  | { ok: false }
> {
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return { ok: false };
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, post.campaignId));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return { ok: false };
  }
  const owned = await assertBrandOwned(campaign.brandId, userId, res);
  if (!owned) return { ok: false };
  return { ok: true, post, campaign };
}

// ─── List social accounts for brand ───────────────────────────────────────────

router.get("/brands/:brandId/social-accounts", asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const brandId = parseInt(String(req.params.brandId), 10);
  if (isNaN(brandId)) { res.status(400).json({ error: "Invalid brand id" }); return; }
  if (!(await assertBrandOwned(brandId, userId, res))) return;

  const accounts = await db
    .select({
      id: socialAccountsTable.id,
      brandId: socialAccountsTable.brandId,
      platform: socialAccountsTable.platform,
      accountName: socialAccountsTable.accountName,
      accountId: socialAccountsTable.accountId,
      pageId: socialAccountsTable.pageId,
      createdAt: socialAccountsTable.createdAt,
    })
    .from(socialAccountsTable)
    .where(eq(socialAccountsTable.brandId, brandId));

  res.json(accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
}));

// ─── Connect social account ────────────────────────────────────────────────────

router.post("/brands/:brandId/social-accounts", asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const brandId = parseInt(String(req.params.brandId), 10);
  if (isNaN(brandId)) { res.status(400).json({ error: "Invalid brand id" }); return; }
  if (!(await assertBrandOwned(brandId, userId, res))) return;

  const { platform, accountName, accountId, accessToken, refreshToken, pageId } = req.body as {
    platform: string;
    accountName: string;
    accountId?: string;
    accessToken: string;
    refreshToken?: string;
    pageId?: string;
  };

  if (!platform || !accountName || !accessToken) {
    res.status(400).json({ error: "platform, accountName, and accessToken are required" });
    return;
  }

  const existing = await db
    .select({ id: socialAccountsTable.id })
    .from(socialAccountsTable)
    .where(and(eq(socialAccountsTable.brandId, brandId), eq(socialAccountsTable.platform, platform)));

  let account;
  if (existing.length > 0) {
    [account] = await db
      .update(socialAccountsTable)
      .set({ accountName, accountId: accountId ?? null, accessToken, refreshToken: refreshToken ?? null, pageId: pageId ?? null })
      .where(eq(socialAccountsTable.id, existing[0].id))
      .returning();
  } else {
    [account] = await db
      .insert(socialAccountsTable)
      .values({ brandId, platform, accountName, accountId: accountId ?? null, accessToken, refreshToken: refreshToken ?? null, pageId: pageId ?? null })
      .returning();
  }

  res.status(201).json({
    id: account.id,
    brandId: account.brandId,
    platform: account.platform,
    accountName: account.accountName,
    accountId: account.accountId,
    pageId: account.pageId,
    createdAt: account.createdAt.toISOString(),
  });
}));

// ─── Delete social account ─────────────────────────────────────────────────────

router.delete("/social-accounts/:id", asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid account id" }); return; }

  const [acc] = await db
    .select({ id: socialAccountsTable.id, brandId: socialAccountsTable.brandId })
    .from(socialAccountsTable)
    .where(eq(socialAccountsTable.id, id));
  if (!acc) { res.status(404).json({ error: "Account not found" }); return; }
  if (!(await assertBrandOwned(acc.brandId, userId, res))) return;

  await db.delete(socialAccountsTable).where(eq(socialAccountsTable.id, id));
  res.sendStatus(204);
}));

// ─── Schedule campaign posts ───────────────────────────────────────────────────

router.post("/campaigns/:id/schedule", asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const campaignId = parseInt(String(req.params.id), 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const owned = await assertCampaignOwned(campaignId, userId, res);
  if (!owned.ok) return;

  const { startDate, endDate, publishHour = 9, publishMinute = 0 } = req.body as {
    startDate: string;
    endDate?: string;
    publishHour?: number;
    publishMinute?: number;
  };

  if (!startDate) { res.status(400).json({ error: "startDate is required" }); return; }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const posts = await db
    .select({ id: postsTable.id, day: postsTable.day })
    .from(postsTable)
    .where(eq(postsTable.campaignId, campaignId));

  if (posts.length === 0) { res.status(400).json({ error: "No posts found for campaign" }); return; }

  const sortedPosts = posts.sort((a, b) => a.day - b.day);
  const totalDays = Math.max(...posts.map(p => p.day));
  const start = new Date(startDate);

  let calculatedEnd: Date;
  if (endDate) {
    calculatedEnd = new Date(endDate);
  } else {
    calculatedEnd = new Date(start);
    calculatedEnd.setDate(calculatedEnd.getDate() + totalDays - 1);
  }

  const totalRangeDays = Math.max(
    Math.ceil((calculatedEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    totalDays - 1
  );

  const scheduleMap: Record<number, Date> = {};
  sortedPosts.forEach((post, index) => {
    const daysOffset = totalRangeDays > 0
      ? Math.round((index / (sortedPosts.length - 1 || 1)) * totalRangeDays)
      : index;
    const scheduledDate = new Date(start);
    scheduledDate.setDate(scheduledDate.getDate() + daysOffset);
    scheduledDate.setHours(publishHour, publishMinute, 0, 0);
    scheduleMap[post.id] = scheduledDate;
  });

  for (const [postIdStr, scheduledAt] of Object.entries(scheduleMap)) {
    await db
      .update(postsTable)
      .set({ scheduledAt, publishStatus: "scheduled" })
      .where(eq(postsTable.id, parseInt(postIdStr, 10)));
  }

  await db
    .update(campaignsTable)
    .set({
      scheduleStart: start,
      scheduleEnd: calculatedEnd,
      publishTimeHour: publishHour,
      publishTimeMinute: publishMinute,
    })
    .where(eq(campaignsTable.id, campaignId));

  const updatedPosts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.campaignId, campaignId));

  res.json({
    message: "Campaign scheduled successfully",
    scheduleStart: start.toISOString(),
    scheduleEnd: calculatedEnd.toISOString(),
    posts: updatedPosts.map(p => ({
      ...p,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}));

// ─── Publish post now ──────────────────────────────────────────────────────────

router.post("/posts/:id/publish", asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const postId = parseInt(String(req.params.id), 10);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const owned = await assertPostOwned(postId, userId, res);
  if (!owned.ok) return;
  const { post, campaign } = owned;

  const accounts = await db
    .select()
    .from(socialAccountsTable)
    .where(and(
      eq(socialAccountsTable.brandId, campaign.brandId),
      eq(socialAccountsTable.platform, post.platform)
    ));

  if (accounts.length === 0) {
    res.status(400).json({ error: `No ${post.platform} account connected for this brand` });
    return;
  }

  const account = accounts[0];
  const result = await publishPost(
    account.platform,
    account.accessToken,
    account.accountId ?? account.id.toString(),
    account.pageId,
    { caption: post.caption, imageUrl: post.imageUrl, hashtags: post.hashtags }
  );

  const [updated] = await db
    .update(postsTable)
    .set({
      publishStatus: result.success ? "published" : "failed",
      publishedAt: result.success ? new Date() : null,
      publishError: result.error ?? null,
      externalPostId: result.externalPostId ?? null,
    })
    .where(eq(postsTable.id, postId))
    .returning();

  res.json({
    success: result.success,
    error: result.error,
    externalPostId: result.externalPostId,
    post: {
      ...updated,
      scheduledAt: updated.scheduledAt?.toISOString() ?? null,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}));

// ─── Cancel scheduled post ─────────────────────────────────────────────────────

router.post("/posts/:id/unschedule", asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const postId = parseInt(String(req.params.id), 10);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const owned = await assertPostOwned(postId, userId, res);
  if (!owned.ok) return;

  const [updated] = await db
    .update(postsTable)
    .set({ scheduledAt: null, publishStatus: "draft" })
    .where(eq(postsTable.id, postId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }

  res.json({
    ...updated,
    scheduledAt: null,
    publishedAt: updated.publishedAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}));

// ─── Get scheduled posts (for calendar view) ──────────────────────────────────

router.get("/campaigns/:id/schedule", asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const campaignId = parseInt(String(req.params.id), 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const owned = await assertCampaignOwned(campaignId, userId, res);
  if (!owned.ok) return;

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.campaignId, campaignId));

  res.json({
    campaignId,
    scheduleStart: campaign.scheduleStart?.toISOString() ?? null,
    scheduleEnd: campaign.scheduleEnd?.toISOString() ?? null,
    publishTimeHour: campaign.publishTimeHour,
    publishTimeMinute: campaign.publishTimeMinute,
    posts: posts.map(p => ({
      ...p,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}));

// ─── Trigger scheduler manually (admin only) ─────────────────────────────────
// Mounted with requireAdmin to override the file-level requireAuth.

router.post("/scheduler/run", requireAdmin, asyncHandler(async (_req, res) => {
  const now = new Date();

  const duePosts = await db
    .select()
    .from(postsTable)
    .where(and(
      lte(postsTable.scheduledAt, now),
      isNull(postsTable.publishedAt),
      eq(postsTable.publishStatus, "scheduled")
    ));

  const results: { postId: number; success: boolean; error?: string }[] = [];

  for (const post of duePosts) {
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, post.campaignId));
    if (!campaign) continue;

    const accounts = await db
      .select()
      .from(socialAccountsTable)
      .where(and(
        eq(socialAccountsTable.brandId, campaign.brandId),
        eq(socialAccountsTable.platform, post.platform)
      ));

    if (accounts.length === 0) {
      logger.warn({ postId: post.id, platform: post.platform }, "No account connected, skipping");
      continue;
    }

    const account = accounts[0];
    const result = await publishPost(
      account.platform,
      account.accessToken,
      account.accountId ?? account.id.toString(),
      account.pageId,
      { caption: post.caption, imageUrl: post.imageUrl, hashtags: post.hashtags }
    );

    await db
      .update(postsTable)
      .set({
        publishStatus: result.success ? "published" : "failed",
        publishedAt: result.success ? new Date() : null,
        publishError: result.error ?? null,
        externalPostId: result.externalPostId ?? null,
      })
      .where(eq(postsTable.id, post.id));

    results.push({ postId: post.id, success: result.success, error: result.error });
  }

  res.json({ processed: results.length, results });
}));

export default router;
