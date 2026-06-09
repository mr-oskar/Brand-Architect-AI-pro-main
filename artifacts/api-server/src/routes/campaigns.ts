import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, campaignsTable, postsTable, brandsTable } from "@workspace/db";
import {
  GetCampaignParams,
} from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import type { BrandKit } from "../lib/ai";
import { generateImageBuffer, generateImageWithLogoReference, type ImageSize } from "@workspace/integrations-openai-ai-server";
import { uploadImageBuffer, storagePathToUrl } from "../lib/imageStorage";
import { chargeCredits, refundCredits, getCostFor, InsufficientCreditsError } from "../lib/credits";

const router: IRouter = Router();

router.get("/campaigns/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, campaign.brandId), eq(brandsTable.userId, userId)));
  if (!brand) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.campaignId, params.data.id))
    .orderBy(postsTable.day);

  const kit = brand?.brandKit as BrandKit | null;
  const primaryColor = kit?.colorPalette?.primary ?? "#6366F1";

  res.json({
    id: campaign.id,
    brandId: campaign.brandId,
    title: campaign.title,
    strategy: campaign.strategy,
    days: campaign.days,
    posts: posts.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
    brand: {
      companyName: brand.companyName,
      logoUrl: brand.logoUrl,
      primaryColor,
    },
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  });
}));

// ─── Bulk Image Generation ────────────────────────────────────────────────────

router.post("/campaigns/:id/generate-all-images", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const campaignId = parseInt(String(req.params.id), 10);
  if (isNaN(campaignId)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, campaign.brandId), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Campaign not found" }); return; }

  const body = req.body as {
    size?: ImageSize;
    logoDataUrl?: string;
    skipExisting?: boolean;
  };
  const size: ImageSize = (["1024x1024", "1024x1536", "1536x1024"].includes(body.size ?? ""))
    ? (body.size as ImageSize)
    : "1024x1024";
  const logoDataUrl = body.logoDataUrl?.trim() || null;
  const skipExisting = body.skipExisting !== false;

  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.campaignId, campaignId))
    .orderBy(postsTable.day);

  const postsToProcess = skipExisting ? posts.filter((p) => !p.imageUrl) : posts;

  if (postsToProcess.length === 0) {
    res.json({ generated: 0, skipped: posts.length, total: posts.length });
    return;
  }

  // Charge credits up-front for all images; refund any not generated.
  const perImage = await getCostFor("post.generate-image");
  try {
    await chargeCredits(userId, "post.generate-image", postsToProcess.length);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      res.status(402).json({ error: err.message, required: err.required, available: err.available });
      return;
    }
    throw err;
  }

  const brandName = brand.companyName;
  const logoPlacement = size === "1024x1536"
    ? "lower-center area, leaving the top two-thirds clear for the main visual"
    : size === "1536x1024"
    ? "top-left corner, with the main visual occupying the right side"
    : "top-right corner, keeping the subject in the left 70% of the frame";

  let generated = 0;
  let failed = 0;

  for (const post of postsToProcess) {
    try {
      let prompt = post.imagePrompt;
      if (logoDataUrl && brandName) {
        prompt += `. The brand logo for "${brandName}" is provided as a reference — incorporate it naturally in the ${logoPlacement}. Match the logo's color scheme in the overall palette.`;
      } else if (brandName) {
        prompt += `. Reserve a clean area in the ${logoPlacement} for the brand logo to be composited on top.`;
      }

      let imageBuffer: Buffer;
      if (logoDataUrl) {
        imageBuffer = await generateImageWithLogoReference(logoDataUrl, prompt, size);
      } else {
        imageBuffer = await generateImageBuffer(prompt, size);
      }
      const objectPath = await uploadImageBuffer(imageBuffer, "image/png");
      const imageUrl = storagePathToUrl(objectPath);
      await db.update(postsTable).set({ imageUrl }).where(eq(postsTable.id, post.id));
      generated++;
    } catch {
      failed++;
    }
  }

  // Refund credits for any failed generations
  if (failed > 0) {
    await refundCredits(userId, perImage * failed);
  }

  res.json({
    generated,
    failed,
    skipped: posts.length - postsToProcess.length,
    total: posts.length,
  });
}));

export default router;
