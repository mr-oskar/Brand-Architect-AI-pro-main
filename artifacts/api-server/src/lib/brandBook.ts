// ─── Brand Book Generator ─────────────────────────────────────────────────────
// Builds a complete 8-page A4 brand identity document.
// Each page uses a deterministic "premium Ivory" layout template so visual
// consistency is guaranteed; AI is used only to author the textual content.

import { openai } from "@workspace/integrations-openai-ai-server";

// ─── Page constants (A4 portrait @ 96dpi) ─────────────────────────────────────

const A4_W = 794;
const A4_H = 1123;
const IVORY = "#FFFFF0";
const INK = "#1a1a2e";
const INK_SOFT = "#3a3a52";
const RULE = "#1a1a2e";

const FONT_HEAD = "Georgia";
const FONT_BODY = "Inter";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandBookInput {
  companyName: string;
  industry: string;
  tagline: string;
  mission?: string;
  personality?: string[];
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    surface?: string;
  };
  fonts: { heading: string; body: string };
  logoUrl?: string | null;
  logoVariants?: { original?: string; black?: string; white?: string; grayscale?: string } | null;
}

export interface DesignSpecObject {
  type: "rect" | "circle" | "text" | "image" | "line";
  left: number;
  top: number;
  width?: number;
  height?: number;
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: "left" | "center" | "right";
  src?: string;
}

export interface PageSpec {
  background: string;
  objects: DesignSpecObject[];
  aiSpec: true;
}

export interface BrandBookPage {
  name: string;
  preset: string;
  width: number;
  height: number;
  canvasData: PageSpec;
}

interface AIContent {
  cover: { tagline: string; footer: string };
  overview: { personality: string; audience: string; tone: string; mission: string };
  logo: { intro: string; clearSpace: string; minSize: string };
  color: { intro: string; psychology: { primary: string; secondary: string; accent: string; neutral: string } };
  typography: { intro: string; headingDesc: string; bodyDesc: string };
  ui: { intro: string };
  visual: { iconStyle: string; pattern: string; imagery: string };
  rules: { dos: string[]; donts: string[] };
}

// ─── Hex → RGB helper ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// ─── AI text content (single call) ────────────────────────────────────────────

async function generateBookContent(input: BrandBookInput): Promise<AIContent> {
  const personalityHint = (input.personality || []).join(", ") || "Futuristic, Minimal, Intelligent";

  const sys = `You are a senior brand strategist writing copy for a premium brand identity guidelines book.
Tone: confident, refined, premium-tech (Apple × Stripe × leading AI startup).
Keep every line concise, evocative, and visually balanced. No emojis. No marketing fluff.`;

  const usr = `Brand: ${input.companyName}
Industry: ${input.industry}
Tagline: ${input.tagline}
Personality cues: ${personalityHint}
${input.mission ? `Mission: ${input.mission}` : ""}
Primary color: ${input.palette.primary}
Secondary color: ${input.palette.secondary}
Accent color: ${input.palette.accent}

Return STRICT JSON with this exact shape:
{
  "cover": { "tagline": "<refined tagline, 4-8 words>", "footer": "Brand Identity Guidelines · 2026" },
  "overview": {
    "personality": "<2-3 keywords joined with em-dash, e.g. Futuristic — Minimal — Intelligent>",
    "audience": "<one sentence describing target audience>",
    "tone": "<two short keywords joined with em-dash, e.g. Trust — Innovation>",
    "mission": "<one elegant sentence (max 120 chars) capturing brand mission>"
  },
  "logo": {
    "intro": "<one sentence about the logo system>",
    "clearSpace": "Maintain clear space equal to the height of the brand mark on all sides.",
    "minSize": "Minimum digital size: 24px height. Minimum print size: 12mm height."
  },
  "color": {
    "intro": "<one sentence about the palette>",
    "psychology": {
      "primary":   "<5-8 words, role and feeling>",
      "secondary": "<5-8 words, role and feeling>",
      "accent":    "<5-8 words, role and feeling>",
      "neutral":   "<5-8 words, role and feeling>"
    }
  },
  "typography": {
    "intro": "<one sentence about typography system>",
    "headingDesc": "<5-7 words about heading face usage>",
    "bodyDesc": "<5-7 words about body face usage>"
  },
  "ui": { "intro": "<one sentence about the UI component system>" },
  "visual": {
    "iconStyle": "Outline · 1.5pt · rounded joins",
    "pattern":   "<5-8 words: neural mesh / geometric grid / etc>",
    "imagery":   "<5-8 words: dark, neon-lit, futuristic environments>"
  },
  "rules": {
    "dos":   ["<rule>", "<rule>", "<rule>", "<rule>", "<rule>"],
    "donts": ["<rule>", "<rule>", "<rule>", "<rule>", "<rule>"]
  }
}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: usr },
    ],
    response_format: { type: "json_object" },
    temperature: 0.6,
    max_completion_tokens: 1400,
  });

  return JSON.parse(res.choices[0].message.content || "{}") as AIContent;
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function pageFrame(): DesignSpecObject[] {
  // Outer hairline border + corner ticks for premium book feel.
  return [
    { type: "rect", left: 32, top: 32, width: A4_W - 64, height: A4_H - 64, fill: "transparent", stroke: RULE, strokeWidth: 0.5, opacity: 0.35 },
    // top-left tick
    { type: "line" as any, left: 32, top: 32, width: 14, height: 0, stroke: RULE, strokeWidth: 1, opacity: 0.7 } as DesignSpecObject,
  ];
}

function header(label: string, pageNumber: string): DesignSpecObject[] {
  return [
    { type: "text", left: 56, top: 56, text: label.toUpperCase(), fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6, textAlign: "left" },
    { type: "text", left: A4_W - 56 - 60, top: 56, width: 60, text: pageNumber, fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6, textAlign: "right" },
    { type: "rect", left: 56, top: 78, width: A4_W - 112, height: 1, fill: INK, opacity: 0.15 },
  ];
}

function footer(brand: string): DesignSpecObject[] {
  return [
    { type: "rect", left: 56, top: A4_H - 80, width: A4_W - 112, height: 1, fill: INK, opacity: 0.15 },
    { type: "text", left: 56, top: A4_H - 64, text: brand.toUpperCase(), fontSize: 9, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.55, textAlign: "left" },
    { type: "text", left: A4_W - 56 - 200, top: A4_H - 64, width: 200, text: "BRAND GUIDELINES", fontSize: 9, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.55, textAlign: "right" },
  ];
}

function sectionTitle(title: string, top: number, accentColor: string): DesignSpecObject[] {
  return [
    { type: "rect", left: 56, top: top + 10, width: 32, height: 3, fill: accentColor, opacity: 1 },
    { type: "text", left: 56, top: top + 28, width: 600, text: title, fontSize: 42, fontFamily: FONT_HEAD, fontWeight: "bold", fill: INK, textAlign: "left" },
  ];
}

// ─── Page 1: Cover ────────────────────────────────────────────────────────────

function pageCover(input: BrandBookInput, c: AIContent): PageSpec {
  const objs: DesignSpecObject[] = [];

  // Subtle accent ring (top-right)
  objs.push({ type: "circle", left: A4_W - 220, top: -120, radius: 220, fill: input.palette.primary, opacity: 0.06 });
  objs.push({ type: "circle", left: A4_W - 180, top: -80, radius: 180, fill: input.palette.accent, opacity: 0.05 });

  // Bottom-left subtle block
  objs.push({ type: "rect", left: -80, top: A4_H - 280, width: 280, height: 280, fill: input.palette.secondary, opacity: 0.04 });

  // Top label
  objs.push({ type: "text", left: 56, top: 56, text: "BRAND IDENTITY", fontSize: 11, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.7, textAlign: "left" });
  objs.push({ type: "rect", left: 56, top: 76, width: 24, height: 1, fill: INK, opacity: 0.7 });

  // Center brand mark (logo if available)
  if (input.logoUrl) {
    objs.push({ type: "image", left: A4_W / 2 - 90, top: A4_H / 2 - 220, width: 180, height: 180, src: input.logoUrl });
  } else {
    // Geometric placeholder mark
    objs.push({ type: "circle", left: A4_W / 2 - 60, top: A4_H / 2 - 200, radius: 60, fill: input.palette.primary, opacity: 1 });
    objs.push({ type: "circle", left: A4_W / 2 - 40, top: A4_H / 2 - 180, radius: 40, fill: IVORY, opacity: 1 });
    objs.push({ type: "circle", left: A4_W / 2 - 24, top: A4_H / 2 - 164, radius: 24, fill: input.palette.accent, opacity: 1 });
  }

  // Brand name
  objs.push({
    type: "text", left: 56, top: A4_H / 2 + 10, width: A4_W - 112,
    text: input.companyName.toUpperCase(),
    fontSize: input.companyName.length > 14 ? 56 : 78,
    fontFamily: FONT_HEAD, fontWeight: "bold", fill: INK, textAlign: "center",
  });

  // Hairline rule
  objs.push({ type: "rect", left: A4_W / 2 - 30, top: A4_H / 2 + 110, width: 60, height: 1, fill: input.palette.primary, opacity: 1 });

  // Tagline
  objs.push({
    type: "text", left: 80, top: A4_H / 2 + 130, width: A4_W - 160,
    text: c.cover?.tagline || input.tagline,
    fontSize: 18, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT, textAlign: "center",
  });

  // Industry badge
  objs.push({
    type: "text", left: 80, top: A4_H / 2 + 170, width: A4_W - 160,
    text: input.industry.toUpperCase(),
    fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.5, textAlign: "center",
  });

  // Footer
  objs.push({ type: "rect", left: 56, top: A4_H - 96, width: A4_W - 112, height: 1, fill: INK, opacity: 0.15 });
  objs.push({
    type: "text", left: 56, top: A4_H - 80, width: A4_W - 112,
    text: c.cover?.footer || "Brand Identity Guidelines · 2026",
    fontSize: 11, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.65, textAlign: "center",
  });

  return { background: IVORY, objects: objs, aiSpec: true };
}

// ─── Page 2: Brand Overview ───────────────────────────────────────────────────

function pageOverview(input: BrandBookInput, c: AIContent): PageSpec {
  const objs: DesignSpecObject[] = [
    ...header("01 · Brand Overview", "02"),
    ...sectionTitle("Brand Overview", 110, input.palette.primary),
  ];

  // Lede text
  objs.push({
    type: "text", left: 56, top: 220, width: A4_W - 112,
    text: "A clear voice in a noisy industry — designed to feel inevitable, intelligent, and quietly powerful.",
    fontSize: 16, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT, textAlign: "left",
  });

  // Three-column grid: Personality / Audience / Tone
  const colW = (A4_W - 112 - 32) / 3;
  const cols = [
    { label: "Personality", value: c.overview?.personality || "Futuristic — Minimal — Intelligent" },
    { label: "Audience",    value: c.overview?.audience    || "Forward-thinking teams building the next decade." },
    { label: "Tone",        value: c.overview?.tone        || "Trust — Innovation" },
  ];

  cols.forEach((col, i) => {
    const x = 56 + i * (colW + 16);
    objs.push({ type: "rect", left: x, top: 320, width: colW, height: 200, fill: "#FFFFFF", opacity: 0.5, rx: 8, stroke: INK, strokeWidth: 0.5 });
    objs.push({ type: "rect", left: x, top: 320, width: 28, height: 3, fill: input.palette.primary, opacity: 1 });
    objs.push({ type: "text", left: x + 20, top: 340, width: colW - 40, text: col.label.toUpperCase(), fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
    objs.push({ type: "text", left: x + 20, top: 365, width: colW - 40, text: col.value, fontSize: 16, fontFamily: FONT_HEAD, fontWeight: "bold", fill: INK });
  });

  // Mission quote
  objs.push({ type: "rect", left: 56, top: 580, width: A4_W - 112, height: 220, fill: input.palette.primary, opacity: 0.06, rx: 8 });
  objs.push({ type: "text", left: 80, top: 610, text: "“", fontSize: 80, fontFamily: FONT_HEAD, fontWeight: "bold", fill: input.palette.primary, opacity: 0.5 });
  objs.push({
    type: "text", left: 130, top: 660, width: A4_W - 220,
    text: c.overview?.mission || input.mission || `${input.companyName} — Excellence in ${input.industry}.`,
    fontSize: 22, fontFamily: FONT_HEAD, fontStyle: "italic", fill: INK,
  });
  objs.push({ type: "text", left: 130, top: 760, width: A4_W - 220, text: "— BRAND MISSION", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.55 });

  objs.push(...footer(input.companyName));
  return { background: IVORY, objects: objs, aiSpec: true };
}

// ─── Page 3: Logo System ──────────────────────────────────────────────────────

function pageLogoSystem(input: BrandBookInput, c: AIContent): PageSpec {
  const objs: DesignSpecObject[] = [
    ...header("02 · Logo System", "03"),
    ...sectionTitle("Logo System", 110, input.palette.primary),
  ];

  objs.push({
    type: "text", left: 56, top: 220, width: A4_W - 112,
    text: c.logo?.intro || "A flexible mark, engineered for clarity at every scale.",
    fontSize: 14, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT,
  });

  // 2x2 logo grid: Light bg, Dark bg, Mono, Icon
  const variants = input.logoVariants || {};
  const tileW = (A4_W - 112 - 16) / 2;
  const tileH = 180;
  const startY = 280;

  const tiles: { label: string; bg: string; logo?: string; isText?: boolean; textColor?: string }[] = [
    { label: "Primary · Light Background", bg: IVORY, logo: variants.original || input.logoUrl || undefined },
    { label: "Primary · Dark Background",  bg: INK,   logo: variants.white || variants.original || input.logoUrl || undefined, textColor: "#FFFFFF" },
    { label: "Monochrome · Black",          bg: IVORY, logo: variants.black || variants.original || input.logoUrl || undefined },
    { label: "Symbol Only",                 bg: IVORY, logo: variants.original || input.logoUrl || undefined },
  ];

  tiles.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 56 + col * (tileW + 16);
    const y = startY + row * (tileH + 60);
    objs.push({ type: "rect", left: x, top: y, width: tileW, height: tileH, fill: t.bg, opacity: 1, rx: 8, stroke: INK, strokeWidth: 0.5 });
    if (t.logo) {
      objs.push({ type: "image", left: x + tileW / 2 - 50, top: y + tileH / 2 - 50, width: 100, height: 100, src: t.logo });
    } else {
      objs.push({ type: "text", left: x, top: y + tileH / 2 - 14, width: tileW, text: input.companyName.toUpperCase(), fontSize: 22, fontFamily: FONT_HEAD, fontWeight: "bold", fill: t.textColor || INK, textAlign: "center" });
    }
    objs.push({ type: "text", left: x, top: y + tileH + 12, width: tileW, text: t.label, fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6, textAlign: "center" });
  });

  // Rules row
  const rulesY = startY + 2 * (tileH + 60) + 16;
  const ruleW = (A4_W - 112 - 16) / 2;
  objs.push({ type: "rect", left: 56, top: rulesY, width: ruleW, height: 100, fill: "#FFFFFF", opacity: 0.6, rx: 8, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "text", left: 72, top: rulesY + 16, text: "CLEAR SPACE", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: input.palette.primary });
  objs.push({ type: "text", left: 72, top: rulesY + 36, width: ruleW - 32, text: c.logo?.clearSpace || "Maintain clear space equal to the height of the brand mark on all sides.", fontSize: 12, fontFamily: FONT_BODY, fill: INK });

  objs.push({ type: "rect", left: 56 + ruleW + 16, top: rulesY, width: ruleW, height: 100, fill: "#FFFFFF", opacity: 0.6, rx: 8, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "text", left: 56 + ruleW + 32, top: rulesY + 16, text: "MINIMUM SIZE", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: input.palette.primary });
  objs.push({ type: "text", left: 56 + ruleW + 32, top: rulesY + 36, width: ruleW - 32, text: c.logo?.minSize || "Minimum digital size: 24px height. Minimum print size: 12mm height.", fontSize: 12, fontFamily: FONT_BODY, fill: INK });

  objs.push(...footer(input.companyName));
  return { background: IVORY, objects: objs, aiSpec: true };
}

// ─── Page 4: Color System ─────────────────────────────────────────────────────

function pageColor(input: BrandBookInput, c: AIContent): PageSpec {
  const objs: DesignSpecObject[] = [
    ...header("03 · Color System", "04"),
    ...sectionTitle("Color System", 110, input.palette.primary),
  ];

  objs.push({
    type: "text", left: 56, top: 220, width: A4_W - 112,
    text: c.color?.intro || "A focused palette built for contrast, clarity, and confidence.",
    fontSize: 14, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT,
  });

  const swatches = [
    { label: "PRIMARY",   hex: input.palette.primary,    psy: c.color?.psychology?.primary   || "Authority and confidence." },
    { label: "SECONDARY", hex: input.palette.secondary,  psy: c.color?.psychology?.secondary || "Depth and intelligence." },
    { label: "ACCENT",    hex: input.palette.accent,     psy: c.color?.psychology?.accent    || "Energy and signal." },
    { label: "NEUTRAL",   hex: input.palette.text || INK, psy: c.color?.psychology?.neutral  || "Calm, structured ground." },
  ];

  const startY = 280;
  const rowH = 150;

  swatches.forEach((s, i) => {
    const y = startY + i * (rowH + 16);
    // Color block
    objs.push({ type: "rect", left: 56, top: y, width: 200, height: rowH, fill: s.hex, opacity: 1, rx: 8 });
    // Info card
    objs.push({ type: "rect", left: 272, top: y, width: A4_W - 56 - 272, height: rowH, fill: "#FFFFFF", opacity: 0.6, rx: 8, stroke: INK, strokeWidth: 0.5 });
    objs.push({ type: "text", left: 292, top: y + 18, text: s.label, fontSize: 11, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
    objs.push({ type: "text", left: 292, top: y + 36, text: s.hex.toUpperCase(), fontSize: 24, fontFamily: FONT_HEAD, fontWeight: "bold", fill: INK });
    objs.push({ type: "text", left: 292, top: y + 72, text: `RGB ${hexToRgb(s.hex)}`, fontSize: 11, fontFamily: FONT_BODY, fill: INK, opacity: 0.7 });
    objs.push({ type: "text", left: 292, top: y + 96, width: A4_W - 56 - 292 - 20, text: s.psy, fontSize: 12, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT });
  });

  objs.push(...footer(input.companyName));
  return { background: IVORY, objects: objs, aiSpec: true };
}

// ─── Page 5: Typography ───────────────────────────────────────────────────────

function pageTypography(input: BrandBookInput, c: AIContent): PageSpec {
  const head = input.fonts.heading || FONT_HEAD;
  const body = input.fonts.body || FONT_BODY;

  const objs: DesignSpecObject[] = [
    ...header("04 · Typography", "05"),
    ...sectionTitle("Typography", 110, input.palette.primary),
  ];

  objs.push({
    type: "text", left: 56, top: 220, width: A4_W - 112,
    text: c.typography?.intro || "Type carries the voice. Restraint and rhythm define the system.",
    fontSize: 14, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT,
  });

  // Heading face card
  objs.push({ type: "rect", left: 56, top: 280, width: A4_W - 112, height: 200, fill: "#FFFFFF", opacity: 0.6, rx: 8, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "text", left: 76, top: 296, text: "HEADING FACE", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: input.palette.primary });
  objs.push({ type: "text", left: 76, top: 314, text: head, fontSize: 14, fontFamily: FONT_BODY, fill: INK, opacity: 0.6 });
  objs.push({ type: "text", left: 76, top: 340, width: A4_W - 152, text: "Aa", fontSize: 96, fontFamily: head, fontWeight: "bold", fill: INK });
  objs.push({ type: "text", left: 200, top: 380, width: A4_W - 280, text: c.typography?.headingDesc || "Editorial, confident, structural.", fontSize: 14, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT });

  // Body face card
  objs.push({ type: "rect", left: 56, top: 500, width: A4_W - 112, height: 200, fill: "#FFFFFF", opacity: 0.6, rx: 8, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "text", left: 76, top: 516, text: "BODY FACE", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: input.palette.primary });
  objs.push({ type: "text", left: 76, top: 534, text: body, fontSize: 14, fontFamily: FONT_BODY, fill: INK, opacity: 0.6 });
  objs.push({ type: "text", left: 76, top: 560, width: A4_W - 152, text: "Aa", fontSize: 96, fontFamily: body, fontWeight: "normal", fill: INK });
  objs.push({ type: "text", left: 200, top: 600, width: A4_W - 280, text: c.typography?.bodyDesc || "Neutral, legible, modern.", fontSize: 14, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT });

  // Scale
  const scaleY = 740;
  objs.push({ type: "text", left: 56, top: scaleY, text: "SCALE", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
  objs.push({ type: "rect", left: 56, top: scaleY + 18, width: A4_W - 112, height: 1, fill: INK, opacity: 0.15 });

  const steps = [
    { label: "H1 · 48", size: 48, fam: head, weight: "bold" },
    { label: "H2 · 32", size: 32, fam: head, weight: "bold" },
    { label: "H3 · 22", size: 22, fam: head, weight: "bold" },
    { label: "Body · 14", size: 14, fam: body, weight: "normal" },
    { label: "Caption · 11", size: 11, fam: body, weight: "normal" },
  ];

  let y = scaleY + 36;
  steps.forEach((s) => {
    objs.push({ type: "text", left: 56, top: y, width: 90, text: s.label, fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.55 });
    objs.push({ type: "text", left: 160, top: y - (s.size - 14) / 2, text: input.companyName, fontSize: s.size, fontFamily: s.fam, fontWeight: s.weight, fill: INK });
    y += s.size + 14;
  });

  objs.push(...footer(input.companyName));
  return { background: IVORY, objects: objs, aiSpec: true };
}

// ─── Page 6: UI Components ────────────────────────────────────────────────────

function pageUI(input: BrandBookInput, c: AIContent): PageSpec {
  const objs: DesignSpecObject[] = [
    ...header("05 · UI Components", "06"),
    ...sectionTitle("UI Components", 110, input.palette.primary),
  ];

  objs.push({
    type: "text", left: 56, top: 220, width: A4_W - 112,
    text: c.ui?.intro || "Components built on a single radius, padding, and elevation system.",
    fontSize: 14, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT,
  });

  // Buttons row
  objs.push({ type: "text", left: 56, top: 280, text: "BUTTONS", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
  objs.push({ type: "rect", left: 56, top: 298, width: A4_W - 112, height: 1, fill: INK, opacity: 0.15 });

  // Primary
  objs.push({ type: "rect", left: 56, top: 320, width: 150, height: 44, fill: input.palette.primary, opacity: 1, rx: 10 });
  objs.push({ type: "text", left: 56, top: 332, width: 150, text: "Get Started", fontSize: 14, fontFamily: FONT_BODY, fontWeight: "bold", fill: "#FFFFFF", textAlign: "center" });
  // Secondary
  objs.push({ type: "rect", left: 222, top: 320, width: 150, height: 44, fill: "transparent", opacity: 1, rx: 10, stroke: input.palette.primary, strokeWidth: 1.5 });
  objs.push({ type: "text", left: 222, top: 332, width: 150, text: "Learn More", fontSize: 14, fontFamily: FONT_BODY, fontWeight: "bold", fill: input.palette.primary, textAlign: "center" });
  // Ghost
  objs.push({ type: "rect", left: 388, top: 320, width: 150, height: 44, fill: INK, opacity: 0.06, rx: 10 });
  objs.push({ type: "text", left: 388, top: 332, width: 150, text: "Cancel", fontSize: 14, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, textAlign: "center" });
  // Disabled
  objs.push({ type: "rect", left: 554, top: 320, width: 150, height: 44, fill: INK, opacity: 0.12, rx: 10 });
  objs.push({ type: "text", left: 554, top: 332, width: 150, text: "Disabled", fontSize: 14, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.5, textAlign: "center" });

  // Card
  objs.push({ type: "text", left: 56, top: 410, text: "CARD · GLASS", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
  objs.push({ type: "rect", left: 56, top: 428, width: A4_W - 112, height: 1, fill: INK, opacity: 0.15 });
  objs.push({ type: "rect", left: 56, top: 450, width: 320, height: 180, fill: "#FFFFFF", opacity: 0.7, rx: 14, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "rect", left: 76, top: 470, width: 32, height: 32, fill: input.palette.primary, opacity: 1, rx: 8 });
  objs.push({ type: "text", left: 120, top: 478, text: "System Card", fontSize: 16, fontFamily: FONT_HEAD, fontWeight: "bold", fill: INK });
  objs.push({ type: "text", left: 76, top: 520, width: 280, text: "Translucent surface · 14px radius · 0.5pt border. Used for grouped content and secondary actions.", fontSize: 12, fontFamily: FONT_BODY, fill: INK_SOFT });
  objs.push({ type: "rect", left: 76, top: 590, width: 100, height: 32, fill: input.palette.primary, opacity: 1, rx: 8 });
  objs.push({ type: "text", left: 76, top: 597, width: 100, text: "Action", fontSize: 12, fontFamily: FONT_BODY, fontWeight: "bold", fill: "#FFFFFF", textAlign: "center" });

  // Input
  objs.push({ type: "text", left: 400, top: 450, text: "INPUT FIELD", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
  objs.push({ type: "rect", left: 400, top: 478, width: 320, height: 48, fill: "#FFFFFF", opacity: 0.7, rx: 10, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "text", left: 416, top: 492, text: "you@example.com", fontSize: 14, fontFamily: FONT_BODY, fill: INK, opacity: 0.45 });
  objs.push({ type: "text", left: 400, top: 538, text: "FOCUS STATE", fontSize: 9, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.5 });
  objs.push({ type: "rect", left: 400, top: 558, width: 320, height: 48, fill: "#FFFFFF", opacity: 1, rx: 10, stroke: input.palette.primary, strokeWidth: 2 });
  objs.push({ type: "text", left: 416, top: 572, text: "you@example.com", fontSize: 14, fontFamily: FONT_BODY, fill: INK });

  // Nav bar
  objs.push({ type: "text", left: 56, top: 680, text: "NAVIGATION", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
  objs.push({ type: "rect", left: 56, top: 698, width: A4_W - 112, height: 1, fill: INK, opacity: 0.15 });
  objs.push({ type: "rect", left: 56, top: 720, width: A4_W - 112, height: 56, fill: "#FFFFFF", opacity: 0.7, rx: 14, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "circle", left: 76, top: 736, radius: 12, fill: input.palette.primary, opacity: 1 });
  objs.push({ type: "text", left: 110, top: 740, text: input.companyName, fontSize: 14, fontFamily: FONT_HEAD, fontWeight: "bold", fill: INK });
  const navItems = ["Product", "Pricing", "Docs"];
  navItems.forEach((n, i) => {
    objs.push({ type: "text", left: A4_W - 320 + i * 80, top: 742, text: n, fontSize: 12, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.7 });
  });
  objs.push({ type: "rect", left: A4_W - 56 - 90, top: 730, width: 90, height: 36, fill: input.palette.primary, opacity: 1, rx: 8 });
  objs.push({ type: "text", left: A4_W - 56 - 90, top: 740, width: 90, text: "Sign in", fontSize: 12, fontFamily: FONT_BODY, fontWeight: "bold", fill: "#FFFFFF", textAlign: "center" });

  // Spacing notes
  objs.push({ type: "text", left: 56, top: 820, text: "SPACING · 8PT GRID", fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
  objs.push({ type: "rect", left: 56, top: 838, width: A4_W - 112, height: 1, fill: INK, opacity: 0.15 });
  const stops = [4, 8, 16, 24, 32, 48];
  let sx = 56;
  stops.forEach((s) => {
    objs.push({ type: "rect", left: sx, top: 870, width: s, height: s, fill: input.palette.primary, opacity: 0.85 });
    objs.push({ type: "text", left: sx, top: 870 + s + 8, width: 60, text: `${s}px`, fontSize: 10, fontFamily: FONT_BODY, fill: INK, opacity: 0.7 });
    sx += s + 36;
  });

  objs.push(...footer(input.companyName));
  return { background: IVORY, objects: objs, aiSpec: true };
}

// ─── Page 7: Visual Style ─────────────────────────────────────────────────────

function pageVisual(input: BrandBookInput, c: AIContent): PageSpec {
  const objs: DesignSpecObject[] = [
    ...header("06 · Visual Style", "07"),
    ...sectionTitle("Visual Style & Elements", 110, input.palette.primary),
  ];

  // Three cards: Icon style, Pattern, Imagery
  const cards = [
    { label: "ICON STYLE",   value: c.visual?.iconStyle || "Outline · 1.5pt · rounded joins" },
    { label: "PATTERN",      value: c.visual?.pattern   || "Neural mesh & geometric grids" },
    { label: "IMAGERY",      value: c.visual?.imagery   || "Dark, neon-lit, futuristic environments" },
  ];

  cards.forEach((card, i) => {
    const y = 240 + i * 200;
    objs.push({ type: "rect", left: 56, top: y, width: A4_W - 112, height: 170, fill: "#FFFFFF", opacity: 0.6, rx: 8, stroke: INK, strokeWidth: 0.5 });
    objs.push({ type: "rect", left: 56, top: y, width: 28, height: 3, fill: input.palette.primary, opacity: 1 });
    objs.push({ type: "text", left: 80, top: y + 18, text: card.label, fontSize: 10, fontFamily: FONT_BODY, fontWeight: "bold", fill: INK, opacity: 0.6 });
    objs.push({ type: "text", left: 80, top: y + 42, width: A4_W - 200, text: card.value, fontSize: 22, fontFamily: FONT_HEAD, fontWeight: "bold", fill: INK });

    // Decorative right-side preview
    if (i === 0) {
      // Icon outline preview (simple geometric)
      const ix = A4_W - 200, iy = y + 30;
      objs.push({ type: "circle", left: ix, top: iy, radius: 50, fill: "transparent", stroke: input.palette.primary, strokeWidth: 1.5 });
      objs.push({ type: "rect", left: ix + 25, top: iy + 25, width: 50, height: 50, fill: "transparent", stroke: input.palette.primary, strokeWidth: 1.5, rx: 8 });
    } else if (i === 1) {
      // Pattern preview: dot grid
      for (let r = 0; r < 5; r++) {
        for (let c2 = 0; c2 < 8; c2++) {
          objs.push({ type: "circle", left: A4_W - 220 + c2 * 18, top: y + 28 + r * 22, radius: 2, fill: input.palette.primary, opacity: 0.6 });
        }
      }
    } else {
      // Imagery preview: dark gradient block with neon accents
      objs.push({ type: "rect", left: A4_W - 220, top: y + 24, width: 150, height: 120, fill: "#0a0a1a", opacity: 1, rx: 6 });
      objs.push({ type: "circle", left: A4_W - 200, top: y + 50, radius: 24, fill: input.palette.accent, opacity: 0.85 });
      objs.push({ type: "circle", left: A4_W - 130, top: y + 90, radius: 16, fill: input.palette.primary, opacity: 0.85 });
    }
  });

  objs.push(...footer(input.companyName));
  return { background: IVORY, objects: objs, aiSpec: true };
}

// ─── Page 8: Brand Rules ──────────────────────────────────────────────────────

function pageRules(input: BrandBookInput, c: AIContent): PageSpec {
  const objs: DesignSpecObject[] = [
    ...header("07 · Brand Rules", "08"),
    ...sectionTitle("Brand Rules", 110, input.palette.primary),
  ];

  objs.push({
    type: "text", left: 56, top: 220, width: A4_W - 112,
    text: "Consistency builds trust. These rules protect the brand at every touchpoint.",
    fontSize: 14, fontFamily: FONT_BODY, fontStyle: "italic", fill: INK_SOFT,
  });

  const colW = (A4_W - 112 - 16) / 2;

  // DO column
  const doX = 56;
  const doY = 290;
  objs.push({ type: "rect", left: doX, top: doY, width: colW, height: 580, fill: "#FFFFFF", opacity: 0.6, rx: 8, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "rect", left: doX, top: doY, width: 28, height: 3, fill: "#10b981", opacity: 1 });
  objs.push({ type: "text", left: doX + 20, top: doY + 18, text: "✓  DO", fontSize: 16, fontFamily: FONT_HEAD, fontWeight: "bold", fill: "#10b981" });

  const dos = (c.rules?.dos || [
    "Use brand colors at full saturation",
    "Maintain consistent spacing and rhythm",
    "Lead with the wordmark on cover assets",
    "Keep typography to defined hierarchy",
    "Prefer clarity over decoration",
  ]).slice(0, 5);

  dos.forEach((d, i) => {
    const y = doY + 56 + i * 96;
    objs.push({ type: "circle", left: doX + 20, top: y, radius: 4, fill: "#10b981", opacity: 1 });
    objs.push({ type: "text", left: doX + 36, top: y - 6, width: colW - 60, text: d, fontSize: 13, fontFamily: FONT_BODY, fill: INK });
    if (i < dos.length - 1) {
      objs.push({ type: "rect", left: doX + 20, top: y + 60, width: colW - 40, height: 1, fill: INK, opacity: 0.1 });
    }
  });

  // DON'T column
  const dnX = 56 + colW + 16;
  objs.push({ type: "rect", left: dnX, top: doY, width: colW, height: 580, fill: "#FFFFFF", opacity: 0.6, rx: 8, stroke: INK, strokeWidth: 0.5 });
  objs.push({ type: "rect", left: dnX, top: doY, width: 28, height: 3, fill: "#ef4444", opacity: 1 });
  objs.push({ type: "text", left: dnX + 20, top: doY + 18, text: "✗  DON’T", fontSize: 16, fontFamily: FONT_HEAD, fontWeight: "bold", fill: "#ef4444" });

  const donts = (c.rules?.donts || [
    "Don't recolor or distort the logo",
    "Don't crowd the mark with other elements",
    "Don't use unauthorized fonts",
    "Don't apply effects that reduce contrast",
    "Don't place the logo on busy imagery",
  ]).slice(0, 5);

  donts.forEach((d, i) => {
    const y = doY + 56 + i * 96;
    objs.push({ type: "circle", left: dnX + 20, top: y, radius: 4, fill: "#ef4444", opacity: 1 });
    objs.push({ type: "text", left: dnX + 36, top: y - 6, width: colW - 60, text: d, fontSize: 13, fontFamily: FONT_BODY, fill: INK });
    if (i < donts.length - 1) {
      objs.push({ type: "rect", left: dnX + 20, top: y + 60, width: colW - 40, height: 1, fill: INK, opacity: 0.1 });
    }
  });

  objs.push(...footer(input.companyName));
  return { background: IVORY, objects: objs, aiSpec: true };
}

// ─── Public entry ─────────────────────────────────────────────────────────────

export async function generateBrandBookPages(input: BrandBookInput): Promise<BrandBookPage[]> {
  const content = await generateBookContent(input);

  const pages: { name: string; build: () => PageSpec }[] = [
    { name: "01 · Cover",          build: () => pageCover(input, content) },
    { name: "02 · Brand Overview", build: () => pageOverview(input, content) },
    { name: "03 · Logo System",    build: () => pageLogoSystem(input, content) },
    { name: "04 · Color System",   build: () => pageColor(input, content) },
    { name: "05 · Typography",     build: () => pageTypography(input, content) },
    { name: "06 · UI Components",  build: () => pageUI(input, content) },
    { name: "07 · Visual Style",   build: () => pageVisual(input, content) },
    { name: "08 · Brand Rules",    build: () => pageRules(input, content) },
  ];

  return pages.map((p) => ({
    name: p.name,
    preset: "a4",
    width: A4_W,
    height: A4_H,
    canvasData: p.build(),
  }));
}
