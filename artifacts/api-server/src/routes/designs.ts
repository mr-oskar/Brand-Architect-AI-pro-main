import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, designsTable, brandsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { asyncHandler } from "../lib/asyncHandler";
import { uploadImageBuffer } from "../lib/imageStorage";
import { openai, generateImageBuffer, type ImageSize } from "@workspace/integrations-openai-ai-server";
import { chargeCredits } from "../lib/credits";
import { generateBrandBookPages } from "../lib/brandBook";

const router: IRouter = Router();

// Inject a brand logo into an AI-generated layout. The AI doesn't always
// follow the "include the logo" instruction, and even when it does it often
// hallucinates fake src URLs. This guarantees the real logo appears.
function ensureLogo(layout: any, logoUrl: string | null, width: number, height: number): any {
  if (!layout || !logoUrl) return layout;
  if (!Array.isArray(layout.objects)) layout.objects = [];
  const objs = layout.objects as any[];
  const logoSize = Math.round(Math.min(width, height) * 0.13);

  const existing = objs.find((o) => o && o.type === "image");
  if (existing) {
    existing.src = logoUrl;
    if (!existing.width || existing.width < 40) existing.width = logoSize;
    if (!existing.height || existing.height < 40) existing.height = logoSize;
    if (existing.left == null) existing.left = 40;
    if (existing.top == null) existing.top = 40;
    return layout;
  }

  objs.push({
    type: "image",
    src: logoUrl,
    left: 40,
    top: 40,
    width: logoSize,
    height: logoSize,
    opacity: 1,
  });
  return layout;
}

function safeParseJson(content: string | null | undefined, label: string): any {
  const raw = (content || "").trim();
  if (!raw) {
    throw new Error(`AI returned empty ${label} response. The model may have run out of tokens — try again or use a shorter request.`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try { return JSON.parse(raw.slice(first, last + 1)); } catch {}
    }
    if (first !== -1) {
      try {
        let attempt = raw.slice(first);
        const opens = (attempt.match(/\{/g) || []).length;
        const closes = (attempt.match(/\}/g) || []).length;
        const lastQuote = attempt.lastIndexOf('"');
        if (lastQuote !== -1) {
          const beforeQuote = attempt.slice(0, lastQuote + 1);
          const afterQuote = attempt.slice(lastQuote + 1);
          if (!afterQuote.includes('"')) {
            attempt = beforeQuote + '"';
          }
        }
        attempt = attempt.replace(/,\s*$/, "");
        attempt += "}".repeat(Math.max(0, opens - closes));
        return JSON.parse(attempt);
      } catch {}
    }
    throw new Error(`AI ${label} response was not valid JSON. Try again or simplify your prompt.`);
  }
}

// ─── List designs for a brand ─────────────────────────────────────────────────

router.get("/designs", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const brandId = req.query.brandId ? parseInt(String(req.query.brandId), 10) : undefined;

  let query = db.select().from(designsTable).where(eq(designsTable.userId, userId));
  if (brandId) {
    query = db.select().from(designsTable).where(and(eq(designsTable.userId, userId), eq(designsTable.brandId, brandId)));
  }

  const designs = await query.orderBy(desc(designsTable.updatedAt));
  res.json(designs);
}));

// ─── Get design ───────────────────────────────────────────────────────────────

router.get("/designs/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [design] = await db.select().from(designsTable).where(and(eq(designsTable.id, id), eq(designsTable.userId, userId)));
  if (!design) { res.status(404).json({ error: "Design not found" }); return; }

  res.json(design);
}));

// ─── Create design ────────────────────────────────────────────────────────────

router.post("/designs", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const body = req.body as {
    brandId: number;
    name?: string;
    canvasData?: unknown;
    width?: number;
    height?: number;
    preset?: string;
    previewUrl?: string;
  };

  if (!body.brandId) { res.status(400).json({ error: "brandId required" }); return; }

  const [brand] = await db.select({ id: brandsTable.id }).from(brandsTable)
    .where(and(eq(brandsTable.id, body.brandId), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const [design] = await db.insert(designsTable).values({
    brandId: body.brandId,
    userId,
    name: body.name ?? "Untitled Design",
    canvasData: body.canvasData ?? null,
    width: body.width ?? 794,
    height: body.height ?? 1123,
    preset: body.preset ?? "a4",
    previewUrl: body.previewUrl ?? null,
  }).returning();

  res.status(201).json(design);
}));

// ─── Update design ────────────────────────────────────────────────────────────

router.patch("/designs/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as {
    name?: string;
    canvasData?: unknown;
    width?: number;
    height?: number;
    preset?: string;
    previewUrl?: string;
  };

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.canvasData !== undefined) update.canvasData = body.canvasData;
  if (body.width !== undefined) update.width = body.width;
  if (body.height !== undefined) update.height = body.height;
  if (body.preset !== undefined) update.preset = body.preset;
  if (body.previewUrl !== undefined) update.previewUrl = body.previewUrl;

  const [design] = await db.update(designsTable).set(update)
    .where(and(eq(designsTable.id, id), eq(designsTable.userId, userId)))
    .returning();

  if (!design) { res.status(404).json({ error: "Design not found" }); return; }
  res.json(design);
}));

// ─── Delete design ────────────────────────────────────────────────────────────

router.delete("/designs/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db.delete(designsTable)
    .where(and(eq(designsTable.id, id), eq(designsTable.userId, userId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Design not found" }); return; }
  res.sendStatus(204);
}));

// ─── Save preview thumbnail ───────────────────────────────────────────────────

router.post("/designs/:id/preview", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { dataUrl } = req.body as { dataUrl: string };
  if (!dataUrl) { res.status(400).json({ error: "dataUrl required" }); return; }

  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  const objectPath = await uploadImageBuffer(buffer, "image/png");
  const previewUrl = `/api/storage/images${objectPath}`;

  const [design] = await db.update(designsTable).set({ previewUrl })
    .where(and(eq(designsTable.id, id), eq(designsTable.userId, userId)))
    .returning();

  if (!design) { res.status(404).json({ error: "Design not found" }); return; }
  res.json({ previewUrl });
}));

// ─── AI Image Generation for Studio ──────────────────────────────────────────

router.post("/designs/generate-image", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const { brandId, prompt, size = "1024x1024" } = req.body as {
    brandId?: number;
    prompt: string;
    size?: ImageSize;
  };

  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  await chargeCredits(userId, "design.generate-image");

  let brandContext = "";
  if (brandId) {
    const [brand] = await db.select().from(brandsTable)
      .where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
    if (brand) {
      const kit = brand.brandKit as any;
      brandContext = ` Style: consistent with ${brand.companyName} brand in ${brand.industry} industry.`;
      if (kit?.colorPalette?.primary) brandContext += ` Primary color: ${kit.colorPalette.primary}.`;
    }
  }

  const finalPrompt = `${prompt}${brandContext} Professional, high-quality, clean design. No text overlays unless specifically requested.`;

  const validSizes: ImageSize[] = ["1024x1024", "1024x1536", "1536x1024", "auto"];
  const imageSize: ImageSize = validSizes.includes(size) ? size : "1024x1024";

  const imageBuffer = await generateImageBuffer(finalPrompt, imageSize);
  const objectPath = await uploadImageBuffer(imageBuffer, "image/png");
  const imageUrl = `/api/storage/images${objectPath}`;

  res.json({ url: imageUrl });
}));

// ─── AI Layout Generation ─────────────────────────────────────────────────────

router.post("/designs/generate-layout", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const { brandId, prompt, width, height, preset } = req.body as {
    brandId: number;
    prompt: string;
    width: number;
    height: number;
    preset: string;
  };

  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const [brand] = await db.select().from(brandsTable)
    .where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  await chargeCredits(userId, "design.generate-layout");

  const kit = brand.brandKit as any;
  const variants = brand.logoVariants as Record<string, string> | null;

  const palette = kit?.colorPalette ?? {};
  const primary = palette.primary || "#6366f1";
  const secondary = palette.secondary || "#8b5cf6";
  const accent = palette.accent || "#e94560";
  const background = palette.background || "#ffffff";
  const text = palette.text || "#1a1a2e";

  const tagline = kit?.taglines?.[0] || `${brand.companyName} — Excellence in ${brand.industry}`;
  const logoUrl = variants?.original || brand.logoUrl || null;

  const systemPrompt = `You are a world-class graphic designer AI. Generate a COMPLETE, PROFESSIONAL Fabric.js canvas layout as JSON.

Canvas: ${width}x${height}px | Preset: ${preset}
Brand: ${brand.companyName} | Industry: ${brand.industry}
Tagline: "${tagline}"
Colors: primary=${primary}, secondary=${secondary}, accent=${accent}, bg=${background}, text=${text}
${logoUrl ? `Logo URL: ${logoUrl}` : "No logo available"}

RULES:
- Generate 6-12 objects minimum for a COMPLETE, RICH design
- Use the exact brand colors provided
- Background rect MUST span the full canvas (left:0, top:0, width:${width}, height:${height})
- Include decorative elements (colored bars, shapes, overlapping circles, etc.)
- Use REAL brand name: "${brand.companyName}"
- Use REAL tagline: "${tagline}"
- Text must have good contrast against background
- Make it look like a professional designer created it
${logoUrl ? `- Add the logo as the first image object` : ""}

Return ONLY valid JSON:
{
  "background": "${background}",
  "objects": [
    {
      "type": "rect|circle|text|image|line",
      "left": number, "top": number,
      "width": number, "height": number,
      "fill": "#hexcolor",
      "opacity": 0.0-1.0,
      "rx": number,
      "text": "string (text only)",
      "fontSize": number (text only, 12-80),
      "fontFamily": "Inter|Georgia|Arial|Helvetica",
      "fontWeight": "normal|bold",
      "fontStyle": "normal|italic",
      "textAlign": "left|center|right",
      "stroke": "#hexcolor (optional)",
      "strokeWidth": number (optional),
      "src": "url string (image only)"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Design request: ${prompt}\n\nCreate a complete, professional, polished design ready to use. Fill the entire canvas with engaging content.`
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 12000,
  });

  const layout = safeParseJson(response.choices[0].message.content, "layout");
  res.json(ensureLogo(layout, logoUrl, width, height));
}));

// ─── Smart Design Generate (full AI pipeline) ────────────────────────────────
// Step 1: Understand intent → detect industry, style, layout needs
// Step 2: Auto-generate a professional internal prompt
// Step 3: Generate high-end Fabric.js layout from that prompt
// Returns: { internalPrompt, designDescription, layerExplanation, layout }

router.post("/designs/smart-generate", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const { brandId, userInput, width, height, preset } = req.body as {
    brandId: number;
    userInput: string;
    width: number;
    height: number;
    preset: string;
  };

  if (!userInput) { res.status(400).json({ error: "userInput required" }); return; }

  const [brand] = await db.select().from(brandsTable)
    .where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  await chargeCredits(userId, "design.generate-layout");

  const kit = brand.brandKit as any;
  const variants = brand.logoVariants as Record<string, string> | null;
  const palette = kit?.colorPalette ?? {};
  const primary = palette.primary || "#6366f1";
  const secondary = palette.secondary || "#8b5cf6";
  const accent = palette.accent || "#e94560";
  const background = palette.background || "#ffffff";
  const text = palette.text || "#1a1a2e";
  const tagline = kit?.taglines?.[0] || `${brand.companyName} — Excellence in ${brand.industry}`;
  const logoUrl = variants?.original || brand.logoUrl || null;

  // ── Step 1 + 2: Understand intent and build professional prompt ──────────
  const intentResponse = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "system",
        content: `You are a senior creative director at a top-tier design agency. 
Given a brief user input, you must:
1. Detect: industry type, design style (modern/luxury/futuristic/minimal/bold), layout needs
2. Generate a PROFESSIONAL agency-level design prompt with: composition, layout structure, lighting, colors, typography choices, mood, visual hierarchy, spacing notes
3. Write a concise design description (2-3 sentences)
4. List the layer plan (6-10 layers with purpose)

Brand context:
- Company: ${brand.companyName}
- Industry: ${brand.industry}
- Colors: primary=${primary}, secondary=${secondary}, accent=${accent}, bg=${background}
- Tagline: "${tagline}"
- Canvas: ${width}x${height}px (${preset})

Respond with ONLY a JSON object:
{
  "detectedIndustry": "string",
  "detectedStyle": "string",
  "detectedLayout": "string",
  "internalPrompt": "detailed agency-level prompt string",
  "designDescription": "2-3 sentence description",
  "layerPlan": [{"layer": 1, "type": "rect|text|image|circle|line", "purpose": "string"}]
}`,
      },
      { role: "user", content: `User input: "${userInput}"` },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8000,
  });

  const intent = safeParseJson(intentResponse.choices[0].message.content, "intent");

  // ── Step 3: Generate the full Fabric.js layout ───────────────────────────
  const layoutResponse = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "system",
        content: `You are a world-class graphic designer AI. Generate a COMPLETE, PROFESSIONAL Fabric.js canvas layout as JSON.

Canvas: ${width}x${height}px | Preset: ${preset}
Brand: ${brand.companyName} | Industry: ${brand.industry}
Tagline: "${tagline}"
Colors: primary=${primary}, secondary=${secondary}, accent=${accent}, bg=${background}, text=${text}
${logoUrl ? `Logo URL: ${logoUrl}` : "No logo available"}

Design Style: ${intent.detectedStyle || "modern professional"}
Layout Type: ${intent.detectedLayout || "balanced"}

RULES:
- Generate 8-14 objects for a COMPLETE, RICH design
- Use the exact brand colors provided
- Background rect MUST span the full canvas (left:0, top:0, width:${width}, height:${height})
- Include decorative elements (geometric shapes, accent bars, overlapping elements)
- Use REAL brand name: "${brand.companyName}"
- Use REAL tagline: "${tagline}"
- Text must have strong contrast — never place light text on light background
- Create visual depth with layered elements and varying opacities
- Make it look like a $10,000 agency design
${logoUrl ? `- Add the logo as an image object` : ""}

Return ONLY valid JSON:
{
  "background": "#hexcolor",
  "objects": [
    {
      "type": "rect|circle|text|image|line",
      "left": number, "top": number,
      "width": number, "height": number,
      "fill": "#hexcolor",
      "opacity": 0.0-1.0,
      "rx": number,
      "text": "string (text only)",
      "fontSize": number (text only, 12-80),
      "fontFamily": "Inter|Georgia|Arial|Helvetica",
      "fontWeight": "normal|bold",
      "fontStyle": "normal|italic",
      "textAlign": "left|center|right",
      "stroke": "#hexcolor (optional)",
      "strokeWidth": number (optional),
      "src": "url string (image only)",
      "radius": number (circle only)
    }
  ]
}`,
      },
      {
        role: "user",
        content: intent.internalPrompt || userInput,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 12000,
  });

  const layout = ensureLogo(
    safeParseJson(layoutResponse.choices[0].message.content, "layout"),
    logoUrl,
    width,
    height,
  );

  // ── Build layer explanation ───────────────────────────────────────────────
  const layerExplanation = (layout.objects || []).map((obj: any, i: number) => ({
    index: i + 1,
    type: obj.type,
    purpose: obj.text
      ? `Text layer: "${obj.text.substring(0, 40)}${obj.text.length > 40 ? "…" : ""}"`
      : obj.type === "image"
      ? "Image/Logo layer"
      : `${obj.type.charAt(0).toUpperCase() + obj.type.slice(1)} decorative element`,
    position: { x: Math.round(obj.left || 0), y: Math.round(obj.top || 0) },
    size: { w: Math.round(obj.width || 0), h: Math.round(obj.height || 0) },
    color: obj.fill || "none",
    opacity: obj.opacity ?? 1,
    zIndex: i + 1,
  }));

  res.json({
    detectedIndustry: intent.detectedIndustry,
    detectedStyle: intent.detectedStyle,
    detectedLayout: intent.detectedLayout,
    internalPrompt: intent.internalPrompt,
    designDescription: intent.designDescription,
    layerExplanation,
    layout,
  });
}));

// ─── Image → Editable Layer Conversion ───────────────────────────────────────
// Takes an image URL, analyzes it with vision AI, and returns a structured
// editable layer JSON plus a Fabric.js-compatible layout

router.post("/designs/analyze-image", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const { imageUrl, brandId, width = 794, height = 1123 } = req.body as {
    imageUrl: string;
    brandId?: number;
    width?: number;
    height?: number;
  };

  if (!imageUrl) { res.status(400).json({ error: "imageUrl required" }); return; }

  await chargeCredits(userId, "design.generate-layout");

  let brandContext = "";
  if (brandId) {
    const [brand] = await db.select().from(brandsTable)
      .where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
    if (brand) {
      const kit = brand.brandKit as any;
      const palette = kit?.colorPalette ?? {};
      brandContext = `Brand: ${brand.companyName}, Industry: ${brand.industry}. Colors: primary=${palette.primary || "#6366f1"}, secondary=${palette.secondary || "#8b5cf6"}.`;
    }
  }

  const analysisResponse = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "system",
        content: `You are an expert design analyst and reverse-engineer. Analyze the provided image and convert it into a structured, EDITABLE layer-based design system.

You must extract:
1. Layout structure (grid, columns, hierarchy)
2. All visible text content with estimated positions/sizes
3. Background and decorative elements (shapes, colors, gradients)
4. Image/logo regions
5. Color system (primary, secondary, accent, background, text colors)
6. Typography style (estimated font sizes, weights, families)
7. Spacing and alignment patterns

Target canvas: ${width}x${height}px
${brandContext}

Return ONLY valid JSON:
{
  "colorSystem": {
    "background": "#hex",
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "text": "#hex"
  },
  "layoutStructure": "description of layout (e.g. 'centered hero with bottom CTA bar')",
  "typographyStyle": "description (e.g. 'bold sans-serif headlines, light body text')",
  "designAnalysis": "2-3 sentence professional analysis of the design",
  "layers": [
    {
      "id": "layer_1",
      "name": "Background",
      "type": "rect",
      "x": 0, "y": 0,
      "width": ${width}, "height": ${height},
      "rotation": 0,
      "opacity": 1,
      "zIndex": 1,
      "style": { "fill": "#hex", "rx": 0 }
    },
    {
      "id": "layer_text_1",
      "name": "Headline",
      "type": "text",
      "x": 50, "y": 100,
      "width": 400, "height": 60,
      "rotation": 0,
      "opacity": 1,
      "zIndex": 5,
      "content": "extracted text or placeholder",
      "style": { "fill": "#hex", "fontSize": 48, "fontFamily": "Inter", "fontWeight": "bold", "textAlign": "center" }
    }
  ],
  "fabricLayout": {
    "background": "#hex",
    "objects": [
      {
        "type": "rect|circle|text|image",
        "left": number, "top": number,
        "width": number, "height": number,
        "fill": "#hex",
        "opacity": number,
        "rx": number,
        "text": "string (text only)",
        "fontSize": number,
        "fontFamily": "Inter|Georgia|Arial",
        "fontWeight": "normal|bold",
        "textAlign": "left|center|right"
      }
    ]
  }
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url" as const,
            image_url: { url: imageUrl, detail: "high" as const },
          },
          {
            type: "text" as const,
            text: "Analyze this design image and convert it to an editable layer structure. Extract all visual elements, colors, text, and layout patterns.",
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8000,
  });

  const result = safeParseJson(analysisResponse.choices[0].message.content, "analysis");
  res.json(result);
}));

// ─── AI Text-based Editing ────────────────────────────────────────────────────
// Takes a natural language edit command + current canvas JSON and returns
// an updated Fabric.js layout applying the requested changes

router.post("/designs/ai-edit", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const { canvasData, command, brandId } = req.body as {
    canvasData: any;
    command: string;
    brandId?: number;
  };

  if (!command) { res.status(400).json({ error: "command required" }); return; }
  if (!canvasData) { res.status(400).json({ error: "canvasData required" }); return; }

  await chargeCredits(userId, "design.generate-layout");

  let brandContext = "";
  if (brandId) {
    const [brand] = await db.select().from(brandsTable)
      .where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
    if (brand) {
      const kit = brand.brandKit as any;
      const palette = kit?.colorPalette ?? {};
      brandContext = `Brand: ${brand.companyName}. Colors: primary=${palette.primary || "#6366f1"}, secondary=${palette.secondary || "#8b5cf6"}, accent=${palette.accent || "#e94560"}.`;
    }
  }

  const objectSummary = (canvasData.objects || []).slice(0, 20).map((obj: any, i: number) => ({
    i,
    type: obj.type,
    text: obj.text?.substring?.(0, 30),
    fill: obj.fill,
    fontSize: obj.fontSize,
    left: Math.round(obj.left || 0),
    top: Math.round(obj.top || 0),
    width: Math.round(obj.width || 0),
    height: Math.round(obj.height || 0),
    opacity: obj.opacity,
  }));

  const editResponse = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "system",
        content: `You are an expert UI/graphic designer AI. You receive a Fabric.js canvas JSON and a natural-language edit command. Apply the edit intelligently.

${brandContext}

Current canvas has ${(canvasData.objects || []).length} objects.
Current background: ${canvasData.background || "#ffffff"}

Object summary:
${JSON.stringify(objectSummary, null, 2)}

Edit commands to handle:
- "make it more premium" → richer colors, gold/dark tones, more elegant fonts, refined spacing
- "make it more minimal" → remove decorative elements, increase white space, simplify colors
- "adjust colors" → rebalance the color palette for better harmony and contrast
- "make it bolder" → increase font sizes, stronger colors, more visual weight
- "add more contrast" → ensure text is clearly readable against backgrounds
- "make it futuristic" → dark background, neon/electric colors, tech-style fonts
- "make it warmer" → shift to warm color tones (reds, oranges, yellows)
- "make it cooler" → shift to cool tones (blues, purples, teals)
- "center everything" → align all elements to center of canvas
- "make headlines bigger" → increase font sizes of text objects significantly
- Any other command → apply intelligently based on design principles

Return the COMPLETE updated Fabric.js canvas JSON with ALL modifications applied.
Return ONLY valid JSON — the complete updated canvas:
{
  "background": "#hex",
  "objects": [/* all objects with modifications applied */]
}`,
      },
      { role: "user", content: `Edit command: "${command}"\n\nApply this change to the canvas design.` },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 12000,
  });

  const updatedLayout = safeParseJson(editResponse.choices[0].message.content, "edit");
  res.json({ layout: updatedLayout, command, applied: true });
}));

// ─── AI Brand Book Generation (multi-page A4) ─────────────────────────────────

// ─── Add a blank page to a brand book / current design sequence ──────────────
// Creates a fresh A4 design tied to the same brand and tagged with `aiSpec`
// so it shows up in the page-strip navigator next to the current design.

router.post("/designs/new-page", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const { brandId, name, width = 794, height = 1123, preset = "a4" } = req.body as {
    brandId: number;
    name?: string;
    width?: number;
    height?: number;
    preset?: string;
  };
  if (!brandId) { res.status(400).json({ error: "brandId required" }); return; }

  const [brand] = await db.select().from(brandsTable)
    .where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }

  const kit = brand.brandKit as any;
  const palette = kit?.colorPalette ?? {};
  const background = palette.background || "#ffffff";

  const blank = {
    aiSpec: true,
    background,
    objects: [
      { type: "rect", left: 0, top: 0, width, height, fill: background, opacity: 1 },
    ],
  };

  const [created] = await db.insert(designsTable).values({
    brandId,
    userId,
    name: name || "New Page",
    canvasData: blank as any,
    width,
    height,
    preset,
    previewUrl: null,
  }).returning();

  res.status(201).json(created);
}));

router.post("/designs/generate-brand-book", requireAuth, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const { brandId } = req.body as { brandId: number };

  if (!brandId) { res.status(400).json({ error: "brandId required" }); return; }

  const [brand] = await db.select().from(brandsTable)
    .where(and(eq(brandsTable.id, brandId), eq(brandsTable.userId, userId)));
  if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
  if (!brand.brandKit) { res.status(400).json({ error: "Generate the brand kit first" }); return; }

  await chargeCredits(userId, "design.generate-brand-book");

  const kit = brand.brandKit as any;
  const variants = brand.logoVariants as Record<string, string> | null;
  const palette = kit?.colorPalette ?? {};

  const pages = await generateBrandBookPages({
    companyName: brand.companyName,
    industry: brand.industry,
    tagline: kit?.taglines?.[0] || `${brand.companyName} — Excellence in ${brand.industry}`,
    mission: kit?.missionStatement,
    personality: Array.isArray(kit?.personality) ? kit.personality : undefined,
    palette: {
      primary: palette.primary || "#6366f1",
      secondary: palette.secondary || "#8b5cf6",
      accent: palette.accent || "#e94560",
      background: palette.background || "#FFFFF0",
      text: palette.text || "#1a1a2e",
      surface: palette.surface,
    },
    fonts: {
      heading: kit?.typographyRecommendations?.heading || "Georgia",
      body: kit?.typographyRecommendations?.body || "Inter",
    },
    logoUrl: brand.logoUrl,
    logoVariants: variants as any,
  });

  // Persist each page as a design row
  const inserted = await Promise.all(pages.map((p) =>
    db.insert(designsTable).values({
      brandId,
      userId,
      name: p.name,
      canvasData: p.canvasData as any,
      width: p.width,
      height: p.height,
      preset: p.preset,
      previewUrl: null,
    }).returning()
  ));

  res.status(201).json({ designs: inserted.map((rows) => rows[0]) });
}));

export default router;
