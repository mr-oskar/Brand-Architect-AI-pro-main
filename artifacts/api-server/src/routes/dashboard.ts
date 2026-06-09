import { Router, type IRouter } from "express";
import { desc, count, eq, inArray } from "drizzle-orm";
import { db, brandsTable, campaignsTable, postsTable } from "@workspace/db";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const [brandCount, recentBrands] = await Promise.all([
    db.select({ cnt: count() }).from(brandsTable).where(eq(brandsTable.userId, userId)),
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
      .where(eq(brandsTable.userId, userId))
      .orderBy(desc(brandsTable.createdAt))
      .limit(5),
  ]);

  const userBrands = await db
    .select({ id: brandsTable.id })
    .from(brandsTable)
    .where(eq(brandsTable.userId, userId));

  const brandIds = userBrands.map((b) => b.id);

  let totalCampaigns = 0;
  let totalPosts = 0;

  if (brandIds.length > 0) {
    const userCampaigns = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(inArray(campaignsTable.brandId, brandIds));

    totalCampaigns = userCampaigns.length;

    const campaignIds = userCampaigns.map((c) => c.id);
    if (campaignIds.length > 0) {
      const [postRow] = await db
        .select({ cnt: count() })
        .from(postsTable)
        .where(inArray(postsTable.campaignId, campaignIds));
      totalPosts = Number(postRow?.cnt ?? 0);
    }
  }

  res.json({
    totalBrands: Number(brandCount[0]?.cnt ?? 0),
    totalCampaigns,
    totalPosts,
    recentBrands: recentBrands.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
  });
}));

export default router;
