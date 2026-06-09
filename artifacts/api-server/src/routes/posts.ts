import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, postsTable, brandsTable, campaignsTable } from "@workspace/db";
import {
  GetPostParams,
  UpdatePostParams,
  UpdatePostBody,
  RegeneratePostParams,
  GeneratePostImageParams,
} from "@workspace/api-zod";
import { openai, generateImageBuffer, generateImageWithLogoReference, generateImageWithReferences, type ImageSize } from "@workspace/integrations-openai-ai-server";
import { chargeCredits } from "../lib/credits";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { generatePostVariant, type BrandKit } from "../lib/ai";
import { uploadImageBuffer, storagePathToUrl } from "../lib/imageStorage";

const router: IRouter = Router();

async function verifyPostOwnership(postId: number, userId: string) {
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (!post) return { post: null, campaign: null, brand: null };

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, post.campaignId));
  if (!campaign) return { post: null, campaign: null, brand: null };

  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, campaign.brandId), eq(brandsTable.userId, userId)));
  if (!brand) return { post: null, campaign: null, brand: null };

  return { post, campaign, brand };
}

// ─── Get post ─────────────────────────────────────────────────────────────────

router.get("/posts/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GetPostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { post } = await verifyPostOwnership(params.data.id, userId);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  res.json({ ...post, createdAt: post.createdAt.toISOString(), updatedAt: post.updatedAt.toISOString() });
}));

// ─── Update post ──────────────────────────────────────────────────────────────

router.patch("/posts/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = UpdatePostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { post } = await verifyPostOwnership(params.data.id, userId);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const parsed = UpdatePostBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.caption !== undefined) updateData.caption = parsed.data.caption;
  if (parsed.data.hook !== undefined) updateData.hook = parsed.data.hook;
  if (parsed.data.cta !== undefined) updateData.cta = parsed.data.cta;
  if (parsed.data.hashtags !== undefined) updateData.hashtags = parsed.data.hashtags;
  if (parsed.data.imagePrompt !== undefined) updateData.imagePrompt = parsed.data.imagePrompt;
  if (parsed.data.platform !== undefined) updateData.platform = parsed.data.platform;

  const [updated] = await db.update(postsTable).set(updateData).where(eq(postsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Post not found" }); return; }

  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
}));

// ─── Generate image ─────────────────────────────────────────────────────────

router.post("/posts/:id/generate-image", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GeneratePostImageParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { post } = await verifyPostOwnership(params.data.id, userId);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  await chargeCredits(userId, "post.generate-image");

  const body = req.body as {
    customPrompt?: string;
    size?: ImageSize;
    customWidth?: number;
    customHeight?: number;
    model?: "nano" | "mini" | "pro";
    logoDataUrl?: string;
    overlayText?: string;
    brandName?: string;
    referenceImages?: Array<{ dataUrl: string; label?: string }>;
  };

  function pickSizeFromDimensions(w: number, h: number): ImageSize {
    const ratio = w / h;
    if (ratio > 1.2) return "1536x1024";
    if (ratio < 0.84) return "1024x1536";
    return "1024x1024";
  }

  let size: ImageSize;
  if (typeof body.customWidth === "number" && typeof body.customHeight === "number" && body.customWidth > 0 && body.customHeight > 0) {
    size = pickSizeFromDimensions(body.customWidth, body.customHeight);
  } else if (["1024x1024", "1024x1536", "1536x1024", "auto"].includes(body.size ?? "")) {
    size = body.size as ImageSize;
  } else {
    size = "1024x1024";
  }

  const model = body.model ?? "pro";
  const logoDataUrl = body.logoDataUrl?.trim() || null;
  const overlayText = body.overlayText?.trim() || null;
  const brandName = body.brandName?.trim() || null;
  const referenceImages = Array.isArray(body.referenceImages)
    ? body.referenceImages.filter((r) => typeof r?.dataUrl === "string" && r.dataUrl.startsWith("data:image/"))
    : [];

  let basePrompt = body.customPrompt?.trim() || post.imagePrompt;

  if (referenceImages.length > 0) {
    basePrompt = basePrompt.replace(/@(\d+)/g, (match, num) => {
      const idx = parseInt(num, 10) - 1;
      if (idx < 0 || idx >= referenceImages.length) return match;
      const label = referenceImages[idx]?.label?.trim();
      return label ? `reference image #${idx + 1} (${label})` : `reference image #${idx + 1}`;
    });
    const refSummary = referenceImages
      .map((r, i) => `image #${i + 1}${r.label ? ` — ${r.label}` : ""}`)
      .join(", ");
    basePrompt += `. You are given ${referenceImages.length} reference image(s): ${refSummary}. Use them as visual guides for style, subject and composition exactly where they are referenced.`;
  }

  const logoPlacement = size === "1024x1536"
    ? "lower-center area, leaving the top two-thirds clear for the main visual"
    : size === "1536x1024"
    ? "top-left corner, with the main visual occupying the right side"
    : "top-right corner, keeping the subject in the left 70% of the frame";

  if (overlayText) {
    basePrompt += `. Include the following text rendered clearly and legibly in the design: "${overlayText}"`;
  }

  if (logoDataUrl && brandName) {
    basePrompt += `. The brand logo for "${brandName}" is provided as a reference — incorporate it naturally in the ${logoPlacement}. Match the logo's color scheme in the overall palette.`;
  } else if (brandName) {
    basePrompt += `. Reserve a clean area in the ${logoPlacement} for the brand logo to be composited on top.`;
  }

  let finalPrompt: string;
  if (model === "nano") {
    finalPrompt = basePrompt;
  } else if (model === "mini") {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 300,
      messages: [{
        role: "user",
        content: `Enhance this social media design prompt to be more vivid and detailed for AI image generation. Keep all logo placement, text instructions, and reference image mentions exactly as written. Return only the enhanced prompt:\n\n${basePrompt}`,
      }],
    });
    finalPrompt = response.choices[0]?.message?.content?.trim() ?? basePrompt;
  } else {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 400,
      messages: [{
        role: "user",
        content: `You are a professional art director and social media designer. Enhance this design prompt with rich visual details, typography guidance, lighting, mood, and cinematic composition to produce a stunning commercial-quality social media image. Keep all logo placement, text overlay, brand instructions, and reference image mentions exactly as written. Return only the enhanced prompt:\n\n${basePrompt}`,
      }],
    });
    finalPrompt = response.choices[0]?.message?.content?.trim() ?? basePrompt;
  }

  const allRefDataUrls: string[] = [];
  if (logoDataUrl) allRefDataUrls.push(logoDataUrl);
  for (const r of referenceImages) allRefDataUrls.push(r.dataUrl);

  let imageBuffer: Buffer;
  if (allRefDataUrls.length > 1) {
    imageBuffer = await generateImageWithReferences(allRefDataUrls, finalPrompt, size);
  } else if (allRefDataUrls.length === 1) {
    imageBuffer = await generateImageWithLogoReference(allRefDataUrls[0]!, finalPrompt, size);
  } else {
    imageBuffer = await generateImageBuffer(finalPrompt, size);
  }

  const objectPath = await uploadImageBuffer(imageBuffer, "image/png");
  const imageUrl = storagePathToUrl(objectPath);

  const existingHistory = Array.isArray(post.imageHistory) ? post.imageHistory : [];
  const newHistory = post.imageUrl
    ? [{ url: post.imageUrl, prompt: post.imagePrompt, createdAt: new Date().toISOString() }, ...existingHistory].slice(0, 12)
    : existingHistory;

  const [updated] = await db
    .update(postsTable)
    .set({ imageUrl, imageHistory: newHistory })
    .where(eq(postsTable.id, params.data.id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
}));

// ─── Restore image from history ───────────────────────────────────────────────

router.post("/posts/:id/restore-image", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = GeneratePostImageParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { post } = await verifyPostOwnership(params.data.id, userId);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") { res.status(400).json({ error: "url required" }); return; }

  const history = Array.isArray(post.imageHistory) ? post.imageHistory : [];
  const target = history.find((h) => h.url === url);
  if (!target) { res.status(404).json({ error: "Image not found in history" }); return; }

  const newHistory = post.imageUrl
    ? [
        { url: post.imageUrl, prompt: post.imagePrompt, createdAt: new Date().toISOString() },
        ...history.filter((h) => h.url !== url),
      ].slice(0, 12)
    : history.filter((h) => h.url !== url);

  const [updated] = await db
    .update(postsTable)
    .set({ imageUrl: url, imageHistory: newHistory })
    .where(eq(postsTable.id, params.data.id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
}));

// ─── Regenerate post content ──────────────────────────────────────────────────

router.post("/posts/:id/regenerate", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const params = RegeneratePostParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { post, brand } = await verifyPostOwnership(params.data.id, userId);
  if (!post || !brand) { res.status(404).json({ error: "Post not found" }); return; }

  await chargeCredits(userId, "post.regenerate");

  const kit = brand.brandKit as BrandKit | null;
  const primaryColor = kit?.colorPalette?.primary ?? "#6366F1";
  const style = kit?.visualStyle ?? "minimal";
  const tone = kit?.toneOfVoice ?? "professional and clear";
  const personality = kit?.personality ?? "";
  const pillarsList = kit?.messagingPillars?.join(" | ") ?? "";

  const platform = post.platform ?? "instagram";
  const platformTone = platform === "linkedin"
    ? "professional, thought-leadership focused, no casual slang, authoritative"
    : platform === "twitter"
    ? "punchy, concise, conversational, under 280 chars for hook"
    : platform === "facebook"
    ? "community-focused, conversational, slightly longer stories"
    : "visual-first, engaging, uses emojis, energetic";

  const prompt = `You are a world-class social media copywriter. Regenerate a completely FRESH, UNIQUE version of this Day ${post.day} ${platform} post for "${brand.companyName}" in the ${brand.industry} industry.

Original post (do NOT repeat this — create something completely different):
- Hook: ${post.hook}
- Caption excerpt: ${post.caption.slice(0, 100)}
- CTA: ${post.cta}

Brand personality: ${personality}
Tone of voice: ${tone}
Messaging pillars: ${pillarsList}
Platform tone for ${platform}: ${platformTone}
Visual style: ${style}

Create a DIFFERENT hook structure, different emotional angle, different story. Make it feel fresh and surprising.

Return ONLY valid JSON:
{
  "hook": "completely new hook — different structure and angle from original",
  "caption": "fresh full caption from a completely different angle (3-5 paragraphs, line breaks, ends with CTA naturally embedded)",
  "cta": "different compelling call to action",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "imagePrompt": "Professional commercial visual — completely different scene: [describe scene in detail]. ${style} aesthetic, ${primaryColor} dominant color accent, cinematic lighting. Typography: [specify if brand name, headline, or key message text should appear in design — include what it says and font style]. 16:9 ultra-high quality, reserve area for logo if needed."
}`;

  let newContent: { hook: string; caption: string; cta: string; hashtags: string[]; imagePrompt: string };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    newContent = JSON.parse(cleaned);
  } catch {
    newContent = {
      hook: `Here is what nobody in ${brand.industry} will tell you about Day ${post.day}...`,
      caption: `The truth about ${brand.companyName} is simpler than most people expect.\n\nWe do not chase trends. We build systems.\n\nSystems that generate consistent results for businesses who are serious about growth in ${brand.industry}.\n\nIf that is you — the link in bio is waiting.`,
      cta: "See how we work",
      hashtags: [`#${brand.companyName.replace(/\s+/g, "")}`, `#${brand.industry.replace(/\s+/g, "")}`, "#GrowthStrategy", "#Results", "#BusinessSuccess"],
      imagePrompt: `Abstract commercial concept: growth and innovation in ${brand.industry}. ${style} aesthetic, ${primaryColor} color accent, studio lighting. Bold typographic overlay with brand message. 16:9 ultra-high quality.`,
    };
  }

  const [updated] = await db
    .update(postsTable)
    .set({ caption: newContent.caption, hook: newContent.hook, cta: newContent.cta, hashtags: newContent.hashtags, imagePrompt: newContent.imagePrompt })
    .where(eq(postsTable.id, params.data.id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
}));

// ─── Generate A/B variant ─────────────────────────────────────────────────────

router.post("/posts/:id/generate-variant", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const { post, brand } = await verifyPostOwnership(id, userId);
  if (!post || !brand) { res.status(404).json({ error: "Post not found" }); return; }

  const kit = brand.brandKit as BrandKit | null;
  if (!kit) { res.status(400).json({ error: "Brand kit not generated yet" }); return; }

  await chargeCredits(userId, "post.generate-variant");

  const variant = await generatePostVariant(brand.companyName, brand.industry, kit, {
    hook: post.hook,
    caption: post.caption,
    cta: post.cta,
    platform: post.platform,
    day: post.day,
  });

  res.json(variant);
}));

// ─── Generate long-form content ───────────────────────────────────────────────

router.post("/posts/:id/generate-content", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const { contentType = "blog" } = req.body as { contentType?: string };
  if (!["blog", "email", "newsletter"].includes(contentType)) {
    res.status(400).json({ error: "contentType must be blog | email | newsletter" });
    return;
  }

  const { post, brand } = await verifyPostOwnership(id, userId);
  if (!post || !brand) { res.status(404).json({ error: "Post not found" }); return; }

  const kit = brand.brandKit as BrandKit | null;
  if (!kit) { res.status(400).json({ error: "Brand kit not generated yet" }); return; }

  await chargeCredits(userId, "post.generate-content");

  const { generateLongFormContent } = await import("../lib/ai");
  const content = await generateLongFormContent(
    brand.companyName, brand.companyDescription, brand.industry, kit,
    contentType as "blog" | "email" | "newsletter",
    post.hook
  );

  res.json(content);
}));

export default router;
