import { Router, type IRouter } from "express";
import sharp from "sharp";
import { Buffer } from "node:buffer";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { asyncHandler } from "../lib/asyncHandler";
import {
  generateImageWithReferences,
  openai,
  type ImageSize,
  type ImageQuality,
  type ImageBackground,
  type ImageModel,
} from "@workspace/integrations-openai-ai-server";
import { uploadImageBuffer, storagePathToUrl } from "../lib/imageStorage";
import { chargeCredits, InsufficientCreditsError } from "../lib/credits";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAX_REFS = 6;
const MAX_PROMPT_LEN = 4000;
const VALID_SIZES: ReadonlyArray<ImageSize> = ["1024x1024", "1024x1536", "1536x1024", "auto"];
const VALID_QUALITIES: ReadonlyArray<ImageQuality> = ["low", "medium", "high", "auto"];
const VALID_BACKGROUNDS: ReadonlyArray<ImageBackground> = ["transparent", "opaque", "auto"];
const VALID_MODELS: ReadonlyArray<ImageModel> = ["auto", "gpt-image-1", "gemini-2.5-flash-image"];
const VALID_UPSCALES = [1, 2, 3, 4] as const;
type Upscale = (typeof VALID_UPSCALES)[number];

/** Parse "1024x1536" into [width, height]. Returns null for "auto" or invalid. */
function parseSize(size: ImageSize): [number, number] | null {
  if (size === "auto") return null;
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/**
 * Guarantee the output matches the requested aspect ratio. If the model returned
 * a buffer that doesn't match (common with Gemini), we cover-crop & resize to the
 * exact pixel dimensions so the user always gets the size they asked for.
 */
async function enforceSize(buf: Buffer, size: ImageSize, upscale: Upscale = 1): Promise<Buffer> {
  const target = parseSize(size);
  const factor = Math.max(1, Math.min(4, upscale));
  if (!target) {
    if (factor === 1) return buf;
    try {
      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) return buf;
      return await sharp(buf)
        .resize(meta.width * factor, meta.height * factor, { kernel: "lanczos3" })
        .png()
        .toBuffer();
    } catch (err) {
      logger.warn({ err }, "[nodes] upscale (auto) failed; returning original");
      return buf;
    }
  }
  const [tw, th] = target;
  const finalW = tw * factor;
  const finalH = th * factor;
  try {
    const meta = await sharp(buf).metadata();
    if (meta.width === finalW && meta.height === finalH) return buf;
    return await sharp(buf)
      .resize(finalW, finalH, { fit: "cover", position: "attention", kernel: "lanczos3" })
      .png()
      .toBuffer();
  } catch (err) {
    logger.warn({ err }, "[nodes] enforceSize failed; returning original buffer");
    return buf;
  }
}

router.post(
  "/nodes/generate-image",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { prompt, referenceImages, size, quality, background, model } = req.body ?? {};

    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LEN} chars)` });
      return;
    }

    const refs: string[] = Array.isArray(referenceImages) ? referenceImages : [];
    if (refs.length > MAX_REFS) {
      res.status(400).json({ error: `Too many reference images (max ${MAX_REFS})` });
      return;
    }
    for (const r of refs) {
      if (typeof r !== "string" || !r.startsWith("data:image/")) {
        res.status(400).json({ error: "Each reference image must be a base64 data URL" });
        return;
      }
    }

    const requestedSize: ImageSize =
      typeof size === "string" && VALID_SIZES.includes(size as ImageSize)
        ? (size as ImageSize)
        : "1024x1024";

    const requestedQuality: ImageQuality | undefined =
      typeof quality === "string" && VALID_QUALITIES.includes(quality as ImageQuality)
        ? (quality as ImageQuality)
        : undefined;

    const requestedBackground: ImageBackground | undefined =
      typeof background === "string" && VALID_BACKGROUNDS.includes(background as ImageBackground)
        ? (background as ImageBackground)
        : undefined;

    const requestedModel: ImageModel | undefined =
      typeof model === "string" && VALID_MODELS.includes(model as ImageModel)
        ? (model as ImageModel)
        : undefined;

    const upscaleRaw = (req.body ?? {}).upscale;
    const requestedUpscale: Upscale =
      typeof upscaleRaw === "number" && (VALID_UPSCALES as readonly number[]).includes(upscaleRaw)
        ? (upscaleRaw as Upscale)
        : 1;
    const upscaleMultiplier = Math.max(1, requestedUpscale * requestedUpscale);

    try {
      await chargeCredits(userId, "design.generate-image", upscaleMultiplier);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: err.message });
        return;
      }
      throw err;
    }

    try {
      const buf = await generateImageWithReferences(refs, prompt, {
        size: requestedSize,
        quality: requestedQuality,
        background: requestedBackground,
        model: requestedModel,
      });
      const enforced = await enforceSize(buf, requestedSize, requestedUpscale);
      const objectPath = await uploadImageBuffer(enforced, "image/png");
      const url = storagePathToUrl(objectPath);
      res.json({ url });
    } catch (err: any) {
      logger.error({ err }, "[nodes] image generation failed");
      const message = err?.message || "Image generation failed";
      res.status(500).json({ error: message });
    }
  }),
);

const STYLE_EXTRACT_SYSTEM = `You are an expert visual prompt engineer. Given an image, write a single dense paragraph that captures ONLY the visual STYLE of that image, so it can be applied as a style overlay to ANY other subject without distorting that subject.

Strict rules:
- Do NOT describe the subject, characters, objects, scene, action, or composition of the source image.
- Do NOT include nouns that name the depicted content (e.g. "a cat on a chair") — describe only HOW it looks, not WHAT is shown.
- Do NOT mention the source image, the analysis task, or that this is a description.
- Write the paragraph as a reusable style instruction that begins with phrasing like "Render in a style characterized by…" or "Apply a visual treatment featuring…".

Cover ONLY these stylistic dimensions, in flowing prose (no headings, no bullets):
- Art style / medium (photo, oil painting, 3D render, vector, anime, etc.)
- Color palette (specific hues, saturation, contrast)
- Lighting quality (direction, hardness, color temperature, mood)
- Texture, materials, surface finish, grain
- Rendering technique, line quality, brushwork, post-processing
- Mood and overall atmosphere

Keep it under 160 words.`;

router.post(
  "/nodes/extract-style",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { imageDataUrl } = req.body ?? {};

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      res.status(400).json({ error: "imageDataUrl must be a base64 data URL" });
      return;
    }
    if (imageDataUrl.length > 12 * 1024 * 1024) {
      res.status(400).json({ error: "Image is too large (max ~9 MB)" });
      return;
    }

    try {
      await chargeCredits(userId, "design.generate-image");
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: err.message });
        return;
      }
      throw err;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 500,
        temperature: 0.4,
        messages: [
          { role: "system", content: STYLE_EXTRACT_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image and produce a professional image-generation prompt as described.",
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      });
      const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) {
        res.status(500).json({ error: "Model returned no text" });
        return;
      }
      res.json({ prompt: text });
    } catch (err: any) {
      logger.error({ err }, "[nodes] style extraction failed");
      res.status(500).json({ error: err?.message || "Style extraction failed" });
    }
  }),
);

/**
 * Smart Prompt Expansion: take one base prompt + a target count and return
 * `count` distinct prompt variations that all describe the same subject but
 * vary in framing, lighting, mood, palette accents, etc. Used by the
 * Reference Studio node so each batch slot gets its own nuanced prompt.
 */
router.post(
  "/nodes/expand-prompts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { prompt, count, mode } = req.body ?? {};

    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LEN} chars)` });
      return;
    }
    const n = Number.isFinite(Number(count)) ? Math.max(2, Math.min(16, Math.floor(Number(count)))) : 4;
    const modeKey = typeof mode === "string" ? mode : "variations";

    try {
      await chargeCredits(userId, "post.generate-content");
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: err.message });
        return;
      }
      throw err;
    }

    const guidance: Record<string, string> = {
      variations:
        "Vary framing, camera angle, lens, lighting direction, time of day, and color emphasis. Keep the SAME subject and overall mood.",
      styleLock:
        "Keep the visual style (medium, palette, lighting quality) IDENTICAL across all prompts. Vary only subject pose, angle, or scene context slightly.",
      subjectLock:
        "Keep the SAME subject identity (same person/character/object). Vary only background, outfit, action, or environment.",
      matrix:
        "Treat the prompts as a 2-axis matrix: vary one axis (e.g. lighting: soft daylight → moody dusk → studio neon → overcast) and a second axis (e.g. angle: front → 3/4 → profile → top-down).",
      aspectPack:
        "Same scene composed for different aspect ratios. Vary how the framing is cropped/extended for square, portrait, and landscape orientations while preserving the subject.",
    };
    const modeNote = guidance[modeKey] ?? guidance.variations;

    const system = `You are a prompt-engineer for image-generation models.
Given ONE base prompt, produce exactly ${n} distinct, self-contained variation prompts.

Rules:
- Output a JSON array of ${n} strings — nothing else, no commentary, no markdown fences.
- Each prompt must be 1-3 sentences and stand on its own (do not reference "the original" or "variation 2").
- ${modeNote}
- Preserve any @refN reference tokens that appear in the base prompt — keep them spelled exactly the same in every variation.
- Do not invent new @refN tokens that weren't in the base.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 1500,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Base prompt:\n${prompt.trim()}\n\nReturn JSON of the form { "prompts": ["...", "...", ...] } with exactly ${n} entries.`,
          },
        ],
      });
      const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        res.status(500).json({ error: "Model returned invalid JSON" });
        return;
      }
      const arr = Array.isArray((parsed as { prompts?: unknown }).prompts)
        ? ((parsed as { prompts: unknown[] }).prompts.filter((x): x is string => typeof x === "string" && x.trim().length > 0))
        : [];
      if (arr.length === 0) {
        res.status(500).json({ error: "Model returned no prompt variations" });
        return;
      }
      // Pad / trim to exactly n entries (use the base prompt as filler if short).
      const out = arr.slice(0, n);
      while (out.length < n) out.push(prompt.trim());
      res.json({ prompts: out });
    } catch (err: any) {
      logger.error({ err }, "[nodes] prompt expansion failed");
      res.status(500).json({ error: err?.message || "Prompt expansion failed" });
    }
  }),
);

export default router;
