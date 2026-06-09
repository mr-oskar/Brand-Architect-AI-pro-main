import { openai, generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  neutral: string;
}

export interface BrandKit {
  // Core identity
  personality: string;
  positioning: string;
  toneOfVoice: string;
  audienceSegments: string[];
  visualStyle: string;
  colorPalette: ColorPalette;
  visualStyleRules: string;
  // Extended brand identity
  brandStory: string;
  missionStatement: string;
  visionStatement: string;
  taglines: string[];
  brandKeywords: string[];
  messagingPillars: string[];
  // Communication guide
  dosCommunication: string[];
  dontsCommunication: string[];
  // Social & digital
  socialBio: string;
  typographyRecommendations: string;
  competitivePosition: string;
}

export interface CampaignDay {
  day: number;
  objective: string;
  postConcept: string;
  marketingAngle: string;
  cta: string;
}

export interface SocialPostData {
  day: number;
  caption: string;
  hook: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
  platform: string;
}

export interface CampaignData {
  title: string;
  strategy: string;
  days: CampaignDay[];
  posts: SocialPostData[];
}

export interface PostVariant {
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
}

export interface LongFormContent {
  type: string;
  title: string;
  content: string;
  metaDescription?: string;
  subjectLine?: string;
}

// ─── Core AI caller ───────────────────────────────────────────────────────────

async function callAI(systemPrompt: string, userPrompt: string, maxTokens = 8192): Promise<string> {
  const model = process.env.AI_TEXT_MODEL || "gpt-5-nano";
  const rawTemp = parseFloat(process.env.AI_TEMPERATURE ?? "");
  const temperature = !isNaN(rawTemp) ? rawTemp : undefined;
  const response = await openai.chat.completions.create({
    model,
    max_completion_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

// ─── Brand Kit Generation ─────────────────────────────────────────────────────

export async function generateBrandKit(
  companyName: string,
  companyDescription: string,
  industry: string,
  brandColors?: string[]
): Promise<BrandKit> {
  logger.info({ companyName, industry }, "Generating comprehensive brand kit with AI agent");

  const colorContext = brandColors && brandColors.length > 0
    ? `The company logo contains these extracted colors: ${brandColors.join(", ")}. Use these as the foundation for the brand color palette — keep them as primary/secondary, and derive accent/background/text/neutral from them. Honor these colors precisely.`
    : `Derive a distinctive, professional brand color palette from the industry, positioning, and target audience.`;

  const systemPrompt = `You are the world's most accomplished brand strategist, creative director, and chief marketing officer combined. You have built brands for Fortune 500 companies, luxury conglomerates, and unicorn startups. Your brand identity systems are used as case studies at top business schools. You produce COMPREHENSIVE, SPECIFIC, ORIGINAL brand identities — never generic. You ALWAYS respond with valid JSON only — no markdown, no explanation, just the raw JSON object.`;

  const userPrompt = `Perform a deep brand analysis and generate a complete, professional brand identity system for this company:

Company: ${companyName}
Industry: ${industry}
Description: ${companyDescription}
${colorContext}

Return a JSON object with EXACTLY these fields (be deeply specific and original — no generic templates):
{
  "personality": "2-3 sentence brand personality statement — who they truly are, their character, energy, and essence. Make it vivid and specific.",
  "positioning": "2-3 sentence market positioning — where they sit in the competitive landscape, their unique angle, what they own in the mind of customers.",
  "toneOfVoice": "Specific description of their communication style — vocabulary range, sentence rhythm, emotional register, energy level, examples of how they would and wouldn't speak.",
  "audienceSegments": [
    "Primary segment: [job title/role], [age range], [specific pain point], [aspiration], [platform where they spend time]",
    "Secondary segment: [detailed demographic + psychographic]",
    "Tertiary segment: [detailed demographic + psychographic]"
  ],
  "visualStyle": "one of exactly: tech | luxury | bold | minimal",
  "colorPalette": {
    "primary": "#HEXCODE",
    "secondary": "#HEXCODE",
    "accent": "#HEXCODE",
    "background": "#HEXCODE",
    "text": "#HEXCODE",
    "neutral": "#HEXCODE"
  },
  "visualStyleRules": "Comprehensive paragraph: photography style (lighting, mood, subject types), layout principles (grid, spacing, white space usage), typography hierarchy (heading weight, body size, letter-spacing), iconography style, what to ALWAYS do and NEVER do in visual design.",
  "brandStory": "A compelling 3-paragraph brand origin and purpose story. Paragraph 1: The founding insight or problem observed. Paragraph 2: The turning point, the unique approach. Paragraph 3: The promise and the future being built.",
  "missionStatement": "One powerful sentence: what we do, for whom, and why it matters. Under 20 words.",
  "visionStatement": "One inspiring sentence: the world we are building toward. Under 20 words.",
  "taglines": [
    "Primary tagline: 3-5 words, memorable",
    "Alternative tagline 1",
    "Alternative tagline 2",
    "Campaign tagline"
  ],
  "brandKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"],
  "messagingPillars": [
    "Pillar 1: [Theme] — [One-sentence explanation of what we communicate about this]",
    "Pillar 2: [Theme] — [Explanation]",
    "Pillar 3: [Theme] — [Explanation]"
  ],
  "dosCommunication": [
    "Do: [specific communication rule with example]",
    "Do: [specific rule]",
    "Do: [specific rule]",
    "Do: [specific rule]"
  ],
  "dontsCommunication": [
    "Don't: [specific thing to avoid with reason]",
    "Don't: [specific thing to avoid]",
    "Don't: [specific thing to avoid]",
    "Don't: [specific thing to avoid]"
  ],
  "socialBio": "Ready-to-use social media bio (under 150 chars): emoji + core value prop + CTA",
  "typographyRecommendations": "Heading font style (e.g., geometric sans-serif, weight 700), Body font style (e.g., humanist sans-serif, weight 400), accent/quote font, font pairing rationale.",
  "competitivePosition": "2-3 sentences on where this brand sits vs. competitors — what space they uniquely own, their moat."
}

Be deeply specific, original, and tailored to ${companyName}. Every field must reflect this exact company, not a generic ${industry} brand.`;

  const raw = await callAI(systemPrompt, userPrompt, 8192);

  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const kit = JSON.parse(cleaned) as BrandKit;
    if (!["tech", "luxury", "bold", "minimal"].includes(kit.visualStyle)) {
      kit.visualStyle = "minimal";
    }
    // Ensure neutral exists
    if (!kit.colorPalette.neutral) {
      kit.colorPalette.neutral = "#6B7280";
    }
    return kit;
  } catch (err) {
    logger.error({ err, raw }, "Failed to parse AI brand kit response, using fallback");
    return buildFallbackKit(companyName, companyDescription, industry, brandColors);
  }
}

function buildFallbackKit(
  companyName: string,
  companyDescription: string,
  industry: string,
  brandColors?: string[]
): BrandKit {
  const palette: ColorPalette = brandColors && brandColors.length >= 2
    ? { primary: brandColors[0], secondary: brandColors[1], accent: brandColors[2] ?? "#06B6D4", background: "#0F172A", text: "#F1F5F9", neutral: "#6B7280" }
    : { primary: "#6366F1", secondary: "#8B5CF6", accent: "#06B6D4", background: "#0F172A", text: "#F1F5F9", neutral: "#6B7280" };

  return {
    personality: `${companyName} is a dynamic, results-driven brand in the ${industry} space that combines deep expertise with genuine human connection. We are ambitious yet approachable, innovative yet reliable.`,
    positioning: `${companyName} occupies a unique position as the intelligent choice in ${industry} — where professional excellence meets authentic partnership. We deliver measurable impact, not just services.`,
    toneOfVoice: "Direct, confident, and human. We speak plainly but powerfully — no jargon, no corporate speak. We sound like the smartest person in the room who is also the most helpful.",
    audienceSegments: ["Growth-focused business owners (30–45), frustrated with slow results, seeking a reliable partner", "Senior managers at SMBs who need to justify ROI to stakeholders", "Entrepreneurs building their second or third venture"],
    visualStyle: "minimal",
    colorPalette: palette,
    visualStyleRules: "Clean, modern compositions with generous white space. Primary color used for key focal points only. Photography: natural light, authentic moments, people-first. Typography: strong hierarchy, readable body text. Always leave breathing room — never crowd elements.",
    brandStory: `${companyName} was founded with a single observation: ${companyDescription.slice(0, 100)}. The gap between what businesses needed and what they were getting was too wide to ignore.\n\nSo we built a different approach. One that combines intelligent systems with genuine human expertise — creating outcomes that neither alone could achieve. Every decision we make is filtered through one question: does this actually help our clients grow?\n\nToday, ${companyName} is the partner that growth-minded businesses trust when the stakes are real. We are not building a company — we are building a movement toward better results for businesses everywhere.`,
    missionStatement: `Helping ${industry} businesses achieve breakthrough results through intelligent strategy and genuine partnership.`,
    visionStatement: `A world where every ambitious business has access to world-class expertise and delivers on its full potential.`,
    taglines: [`Built for Growth`, `Intelligence Meets Action`, `Results, Not Just Promises`, `Your Growth Partner`],
    brandKeywords: ["growth", "results", "intelligent", "trusted", "innovative", "strategic", "human", "impactful"],
    messagingPillars: [
      `Results-First — We lead with measurable outcomes and always tie our work to business impact`,
      `Intelligent Partnership — We bring both AI-driven insights and deep human expertise to every engagement`,
      `Proven Excellence — We back every claim with evidence, case studies, and transparent methodology`,
    ],
    dosCommunication: [
      "Do: Lead with specific outcomes and numbers when possible",
      "Do: Use active, direct language that respects the reader's time",
      "Do: Acknowledge real challenges before presenting solutions",
      "Do: Speak to ambitions, not just problems",
    ],
    dontsCommunication: [
      "Don't: Use buzzwords or vague superlatives ('world-class', 'best-in-class')",
      "Don't: Over-promise or use absolute claims without evidence",
      "Don't: Speak down to the audience or be condescending",
      "Don't: Use passive voice or corporate jargon",
    ],
    socialBio: `✦ ${industry} growth partner | Results-driven strategy | Link below 👇`,
    typographyRecommendations: "Headings: Geometric sans-serif (e.g., Inter Bold or Neue Haas Grotesk, weight 700–900). Body: Humanist sans-serif (e.g., Inter Regular, weight 400). Accent: Same family, weight 500 italic for pull quotes. Pairing rationale: consistency creates trust; variation in weight creates hierarchy.",
    competitivePosition: `${companyName} occupies the intelligent professional space — more sophisticated than generalist agencies, more human than pure-tech platforms. The moat is the combination: enterprise-quality thinking delivered with boutique-level care.`,
  };
}

// ─── Brand Story Generation ───────────────────────────────────────────────────

export async function generateBrandStory(
  companyName: string,
  companyDescription: string,
  industry: string,
  brandKit: BrandKit
): Promise<string> {
  logger.info({ companyName }, "Generating brand story");

  const systemPrompt = `You are a master brand storyteller who has crafted origin stories for iconic global brands. You write in a way that is compelling, human, and emotionally resonant — never corporate or generic. Return only the story text, no JSON.`;

  const userPrompt = `Write a powerful 3-paragraph brand story for ${companyName} in the ${industry} industry.

Brand personality: ${brandKit.personality}
Mission: ${brandKit.missionStatement}
Positioning: ${brandKit.positioning}
Company description: ${companyDescription}

Structure:
Paragraph 1 (The Origin): The specific moment or observation that made starting ${companyName} feel necessary. Make it vivid and concrete.
Paragraph 2 (The Approach): What makes how ${companyName} works fundamentally different. The philosophy, the method, the breakthrough thinking.
Paragraph 3 (The Promise): The future being built and the commitment to clients/customers. End on an inspiring, forward-looking note.

Write in first-person plural ("we"). Keep each paragraph 3-4 sentences. Be specific to ${companyName} — avoid all generic language.`;

  try {
    const story = await callAI(systemPrompt, userPrompt, 2048);
    return story.trim();
  } catch {
    return brandKit.brandStory;
  }
}

// ─── Campaign Generation ──────────────────────────────────────────────────────

const PLATFORM_SIZES: Record<string, { size: string; ratio: string }> = {
  instagram: { size: "1080×1080px", ratio: "1:1 square" },
  instagram_portrait: { size: "1080×1350px", ratio: "4:5 portrait" },
  linkedin: { size: "1200×628px", ratio: "1.91:1 landscape" },
  twitter: { size: "1200×675px", ratio: "16:9 landscape" },
  facebook: { size: "1200×630px", ratio: "1.91:1 landscape" },
};

export async function generateCampaign(
  companyName: string,
  companyDescription: string,
  industry: string,
  brandKit: BrandKit,
  brief?: string,
  postCount: number = 7,
  platforms: string[] = ["instagram"],
  trendContext?: string,
  analyzedBrief?: AnalyzedBrief
): Promise<CampaignData> {
  const count = Math.min(Math.max(Math.round(postCount), 1), 14);
  const platformList = platforms.length > 0 ? platforms : ["instagram"];
  logger.info({ companyName, industry, count, platforms: platformList }, `Generating ${count}-post campaign with AI`);

  const palette = brandKit.colorPalette;
  const style = brandKit.visualStyle;
  const platformStr = platformList.join(", ");

  const isArabic = analyzedBrief?.language === "arabic" || analyzedBrief?.language === "bilingual" || /[\u0600-\u06FF]/.test(brief ?? "");
  const languageInstruction = isArabic
    ? `LANGUAGE: Write ALL captions and hooks in Arabic (Modern Standard Arabic / العربية الفصحى). Hashtags should be in both Arabic and English. Arabic text must be right-to-left, culturally appropriate for Arab markets, and use engaging colloquial expressions when suitable for the platform.`
    : `LANGUAGE: Write in English unless the brand/brief specifies otherwise.`;

  const analyzedBriefSection = analyzedBrief
    ? `\n\nANALYZED CAMPAIGN BRIEF:
- Objective: ${analyzedBrief.objective}
- Target Audience: ${analyzedBrief.targetAudience}
- Tone: ${analyzedBrief.tone}
- Themes: ${analyzedBrief.themes.join(", ")}
- Enhanced Brief: ${analyzedBrief.enhancedBrief}
${analyzedBrief.visualStyleFromImages ? `- Reference Image Style: ${analyzedBrief.visualStyleFromImages}` : ""}`
    : "";

  const briefContext = brief
    ? `\n\nCRITICAL campaign brief from client (follow this closely):\n"${brief}"\n${analyzedBriefSection}`
    : analyzedBriefSection
      ? `\n\n${analyzedBriefSection}`
      : "";

  const trendSection = trendContext
    ? `\n\n${trendContext}\n\nIMPORTANT: Integrate relevant trends, keywords, and current cultural moments above into the campaign strategy and post content. Reference real trends to make posts feel timely and relevant. Apply the modern design best practices in the image prompts.`
    : "";

  const systemPrompt = `You are a world-class social media strategist, creative director, and brand consultant with 15 years experience building viral campaigns for global brands. You have deep knowledge of the latest design trends, visual aesthetics, and digital marketing best practices for 2025-2026. You create complete ${count}-day multi-platform marketing campaigns that are specific, creative, culturally relevant, and trend-aware. You are fluent in Arabic and English. ${languageInstruction} Every post you write is UNIQUE, TAILORED, and MODERN. You ALWAYS respond with valid JSON only — no markdown, no explanation, just the raw JSON object.`;

  const imageStyleNotes = style === "luxury"
    ? "editorial aspirational mood, magazine-quality lighting, elegant negative space, premium textures, soft film grain, fashion-forward composition"
    : style === "tech"
    ? "clean futuristic aesthetic, gradient overlays, glowing UI elements, dark-mode vibes, neon accents, isometric or abstract tech visuals"
    : style === "bold"
    ? "high-contrast energy, saturated colors, dynamic diagonal compositions, street-art influence, punchy and loud, graphic shapes"
    : "breathing room, intentional white space, refined typography hierarchy, quiet confidence, Scandinavian minimal influence";

  const userPrompt = `Create a complete ${count}-day social media campaign for this brand across platforms: ${platformStr}

Company: ${companyName}
Industry: ${industry}  
Description: ${companyDescription}
Brand Personality: ${brandKit.personality}
Positioning: ${brandKit.positioning}
Tone of Voice: ${brandKit.toneOfVoice}
Brand Keywords: ${brandKit.brandKeywords?.join(", ") ?? ""}
Messaging Pillars: ${brandKit.messagingPillars?.join(" | ") ?? ""}
Visual Style: ${style}
Primary Color: ${palette.primary}
Secondary Color: ${palette.secondary}
Accent Color: ${palette.accent}
${briefContext}
${trendSection}

Return a JSON object with exactly this structure:
{
  "title": "Compelling campaign title that captures the campaign theme and references current cultural moment",
  "strategy": "3-4 sentence strategic overview: what narrative arc this campaign follows, how it leverages current trends, what psychological journey the audience goes on, expected outcomes",
  "days": [
    {
      "day": 1,
      "objective": "Specific objective for day 1",
      "postConcept": "Specific creative concept for this post — tie it to a current trend or cultural moment when relevant",
      "marketingAngle": "The psychological/marketing angle (e.g., scarcity, social proof, transformation, authority, trend-jacking)",
      "cta": "Specific, compelling call to action"
    }
    ... (${count} days total)
  ],
  "posts": [
    {
      "day": 1,
      "platform": "${platformList[0]}",
      "hook": "Scroll-stopping opening line — reference a trend, use a surprising stat, or open a pattern interrupt. Under 12 words.",
      "caption": "Full platform-appropriate caption (3-5 paragraphs). Match the brand's exact tone. Weave in relevant trends naturally. Use line breaks. End with the CTA.",
      "cta": "Specific call to action that matches the day's objective",
      "hashtags": ["#relevant1", "#relevant2", "#trending3", "#niche4", "#brand5"],
      "imagePrompt": "Professional commercial visual for ${companyName}: [describe the specific scene in detail]. Canvas size: EXACT ${platformList.map((p) => { const s = PLATFORM_SIZES[p] ?? PLATFORM_SIZES["instagram"]; return `${p}: ${s.size} (${s.ratio})`; }).join("; ")} — do NOT change or assume any other aspect ratio. Visual direction: ${style} aesthetic — ${imageStyleNotes}.${analyzedBrief?.visualStyleFromImages ? ` Inspired by reference images: ${analyzedBrief.visualStyleFromImages}.` : ""} Color palette: ${palette.primary} as hero color, ${palette.secondary} supporting, ${palette.accent} for accents. Lighting: [specify mood-appropriate lighting]. Composition: [describe layout — hero subject placement, supporting elements, depth]. Typography integration: [specify if text/headline should be part of the image; if the campaign language is Arabic, the text inside the image MUST be in clear, legible Arabic script using a professional Arabic font]. Include brand name or key message text in the design if appropriate. Logo placement area: reserve clean space in [corner/area] if logo overlay is needed. Quality: ultra-high resolution, commercial advertising quality."
    }
    ... (${count} posts total, one per day)
  ]
}

Rules:
- Every hook must be DIFFERENT in structure (question, statistic, statement, story-start, counter-intuitive claim, trend reference, etc.)
- Every caption must be UNIQUE — different length, different angle, different story
- ACTIVELY incorporate trends from the trend context into hooks, captions, and concepts
- Image prompts must describe SPECIFIC, DETAILED scenes that visually reinforce the day's concept
- Image prompts should specify whether text/typography is part of the design and what it says
- Hashtags must mix popular (#Marketing 2M+), trending, niche (#${industry.replace(/\s+/g, "")}), and brand-specific tags
- Platform "${platformList[0]}" tone: ${platformList[0] === "linkedin" ? "professional, thought-leadership, no slang" : platformList[0] === "twitter" ? "punchy, conversational, under 280 chars for hook" : platformList[0] === "facebook" ? "community-focused, longer stories" : "visual-first, engaging, uses emojis appropriately"}
- Apply 2025-2026 design best practices: bold typography, authentic visuals, trend-aware aesthetics

Make every post SPECIFIC to ${companyName} and CULTURALLY RELEVANT to current trends — no generic content.`;

  const raw = await callAI(systemPrompt, userPrompt, 8192);

  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const campaign = JSON.parse(cleaned) as CampaignData;
    return campaign;
  } catch (err) {
    logger.error({ err, raw }, "Failed to parse AI campaign response, using fallback");
    return buildFallbackCampaign(companyName, industry, brandKit);
  }
}

function buildFallbackCampaign(companyName: string, industry: string, brandKit: BrandKit): CampaignData {
  const palette = brandKit.colorPalette;
  const style = brandKit.visualStyle;

  const days: CampaignDay[] = [
    { day: 1, objective: "Brand awareness", postConcept: `Introduce ${companyName} with our origin story`, marketingAngle: "Storytelling & curiosity", cta: "Learn our story" },
    { day: 2, objective: "Pain point acknowledgment", postConcept: "The problem we were built to solve", marketingAngle: "Empathy & problem agitation", cta: "See how we help" },
    { day: 3, objective: "Value proposition", postConcept: "Our unique approach and what makes us different", marketingAngle: "Differentiation & superiority", cta: "Discover our difference" },
    { day: 4, objective: "Social proof", postConcept: "Client transformation story", marketingAngle: "Social proof & aspiration", cta: "Read the full story" },
    { day: 5, objective: "Thought leadership", postConcept: `3 trends reshaping ${industry} in 2026`, marketingAngle: "Authority & education", cta: "Get our full report" },
    { day: 6, objective: "Behind the scenes", postConcept: "How we actually work — our process revealed", marketingAngle: "Transparency & trust", cta: "Work with us" },
    { day: 7, objective: "Conversion", postConcept: "Our limited offer — why now is the time", marketingAngle: "Urgency & scarcity", cta: "Claim your spot" },
  ];

  const posts: SocialPostData[] = days.map((d) => ({
    day: d.day,
    platform: "instagram",
    hook: `${companyName}: ${d.postConcept}.`,
    caption: `${d.postConcept}\n\nAt ${companyName}, we believe every ${industry} business deserves ${d.objective}.\n\nHere's what that means in practice:\n\n→ Real results, not promises\n→ Strategy backed by data\n→ A partner who is invested in your growth\n\n${d.cta} — link in bio.`,
    cta: d.cta,
    hashtags: [`#${companyName.replace(/\s+/g, "")}`, `#${industry.replace(/\s+/g, "")}`, "#Marketing", "#BusinessGrowth", "#Strategy"],
    imagePrompt: `Commercial advertising photography: ${d.postConcept} scene. ${style} aesthetic, ${palette.primary} color as dominant accent, ${palette.secondary} as supporting tone. Professional cinematic lighting, ultra high quality. Bold typography overlay with key message or brand name "${companyName}". 16:9 ratio.`,
  }));

  return {
    title: `${companyName} — 7-Day Brand Launch Campaign`,
    strategy: `A strategically sequenced 7-day campaign for ${companyName} following the awareness → trust → authority → conversion arc. Each day builds on the previous, guiding the audience through a journey from discovering the brand to feeling confident enough to act. The campaign balances educational content with emotional storytelling.`,
    days,
    posts,
  };
}

// ─── Post Variant Generation (A/B Testing) ────────────────────────────────────

export async function generatePostVariant(
  companyName: string,
  industry: string,
  brandKit: BrandKit,
  originalPost: { hook: string; caption: string; cta: string; platform: string; day: number }
): Promise<PostVariant> {
  logger.info({ companyName, day: originalPost.day }, "Generating A/B variant for post");

  const style = brandKit.visualStyle;
  const primaryColor = brandKit.colorPalette.primary;
  const tone = brandKit.toneOfVoice;

  const prompt = `You are a world-class social media copywriter. Create a completely different, better-performing A/B variant of this social media post for "${companyName}" (${industry}).

Original post (Day ${originalPost.day}, ${originalPost.platform}):
- Hook: ${originalPost.hook}
- Caption excerpt: ${originalPost.caption.slice(0, 120)}
- CTA: ${originalPost.cta}

Brand tone: ${tone}
Visual style: ${style}

Create a DIFFERENT approach — different hook structure, different angle, different emotional trigger. The variant must feel completely fresh while staying true to the brand.

Return ONLY a JSON object:
{
  "hook": "completely different attention-grabbing hook (different structure than original)",
  "caption": "fresh caption from a completely different angle (3-4 paragraphs, line breaks)",
  "cta": "a different but compelling call to action",
  "hashtags": ["#new1", "#new2", "#new3", "#different4", "#fresh5"],
  "imagePrompt": "Professional commercial visual — completely different scene from original: [describe scene in detail]. ${style} aesthetic, ${primaryColor} as dominant color accent. Specify typography: [include brand name, key headline, or tagline text in the design if it strengthens the concept — describe font style and placement]. Cinematic lighting, ultra-high quality commercial photography, 16:9 ratio. Reserve clean area if logo overlay is needed."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as PostVariant;
  } catch {
    return {
      hook: `Here's a truth about ${industry} most brands won't tell you...`,
      caption: `The ${industry} landscape has changed dramatically.\n\nWhile most brands are still using yesterday's playbook, ${companyName} has been quietly building something different.\n\nA smarter approach. A more human approach. One that actually works in 2026.\n\nReady to see what's possible? The link in bio has the answer.`,
      cta: "Discover the difference",
      hashtags: [`#${companyName.replace(/\s+/g, "")}`, `#${industry.replace(/\s+/g, "")}Trends`, "#Innovation", "#BusinessStrategy", "#Results"],
      imagePrompt: `Commercial photography: abstract modern concept for ${industry}. ${style} aesthetic, ${primaryColor} dominant color, studio lighting. Bold typography with the brand name prominently displayed. Ultra high quality 16:9.`,
    };
  }
}

// ─── Long-Form Content Generation ────────────────────────────────────────────

export async function generateLongFormContent(
  companyName: string,
  companyDescription: string,
  industry: string,
  brandKit: BrandKit,
  type: "blog" | "email" | "newsletter",
  topic?: string
): Promise<LongFormContent> {
  logger.info({ companyName, type, topic }, "Generating long-form content");

  const tone = brandKit.toneOfVoice;
  const persona = brandKit.personality;
  const topicStr = topic ?? `How ${companyName} is transforming ${industry}`;

  let systemPrompt = "";
  let userPrompt = "";

  if (type === "blog") {
    systemPrompt = `You are a world-class content strategist and B2B writer. You create SEO-optimized blog posts that rank, engage, and convert. Return only JSON.`;
    userPrompt = `Write a complete blog post for ${companyName} (${industry}).

Topic: ${topicStr}
Brand tone: ${tone}
Brand personality: ${persona}

Return JSON:
{
  "type": "blog",
  "title": "SEO-optimized compelling title",
  "metaDescription": "Meta description under 160 chars",
  "content": "Full blog post in markdown format. Structure: Hook paragraph → 3-4 H2 sections with 2-3 paragraphs each → Conclusion with CTA. Total 600-900 words. Use the brand's exact tone throughout."
}`;
  } else if (type === "email") {
    systemPrompt = `You are a world-class email copywriter who specializes in high-converting B2B emails. Return only JSON.`;
    userPrompt = `Write a high-converting marketing email for ${companyName} (${industry}).

Topic/Goal: ${topicStr}
Brand tone: ${tone}

Return JSON:
{
  "type": "email",
  "title": "Email campaign name",
  "subjectLine": "Email subject line (under 50 chars, high open rate)",
  "content": "Full email body. Structure: Personalized greeting → Hook (1 sentence) → Problem acknowledgment → Solution/value → Social proof element → Clear CTA → PS line. Conversational, direct, no corporate speak. Under 300 words."
}`;
  } else {
    systemPrompt = `You are a world-class newsletter writer who builds loyal audiences. Return only JSON.`;
    userPrompt = `Write a compelling brand newsletter for ${companyName} (${industry}).

Topic: ${topicStr}
Brand tone: ${tone}

Return JSON:
{
  "type": "newsletter",
  "title": "Newsletter edition name",
  "subjectLine": "Newsletter subject line",
  "content": "Full newsletter in markdown. Structure: Personal opening → Main insight/story (400 words) → Quick tips section (3 bullets) → Featured resource or tool → CTA → Sign-off. Feels like a letter from a knowledgeable friend."
}`;
  }

  try {
    const raw = await callAI(systemPrompt, userPrompt, 4096);
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as LongFormContent;
  } catch {
    return {
      type,
      title: topicStr,
      content: `# ${topicStr}\n\nAt ${companyName}, we believe that ${companyDescription.slice(0, 150)}.\n\n## The Challenge\n\nThe ${industry} landscape is evolving faster than most businesses can adapt...\n\n## Our Approach\n\nWe've developed a systematic approach that combines deep expertise with intelligent systems...\n\n## The Results\n\nClients who work with us see measurable improvements within the first 90 days...\n\n## Ready to Transform Your ${industry} Strategy?\n\nConnect with our team to discover what's possible for your business.`,
      metaDescription: `Discover how ${companyName} is transforming ${industry} with innovative strategies and measurable results.`,
      subjectLine: `${topicStr.slice(0, 45)}...`,
    };
  }
}

// ─── Image with Logo Overlay ──────────────────────────────────────────────────

// ─── Brief Analysis ───────────────────────────────────────────────────────────

export interface AnalyzedBrief {
  objective: string;
  targetAudience: string;
  language: "arabic" | "english" | "bilingual";
  tone: string;
  themes: string[];
  visualStyleFromImages: string;
  enhancedBrief: string;
}

export async function analyzeBrief(
  brief: string,
  referenceImages: string[] = [],
  companyName = "",
  industry = ""
): Promise<AnalyzedBrief> {
  logger.info({ companyName, hasImages: referenceImages.length > 0 }, "Analyzing campaign brief");

  const model = process.env.AI_TEXT_MODEL || "gpt-5-nano";

  let visualStyleFromImages = "";

  if (referenceImages.length > 0) {
    try {
      const imageMessages = referenceImages.slice(0, 3).map((img) => ({
        type: "image_url" as const,
        image_url: { url: img, detail: "low" as const },
      }));

      const visionResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              ...imageMessages,
              {
                type: "text",
                text: "Analyze these reference images and describe their visual style for use in AI image generation. Focus on: color palette, composition style, lighting mood, typography style, overall aesthetic. Keep it concise and actionable for image prompts.",
              },
            ],
          },
        ],
      });
      visualStyleFromImages = visionResp.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      logger.warn({ err }, "Failed to analyze reference images");
    }
  }

  const systemPrompt = `You are a senior marketing strategist. Analyze a campaign brief and return a structured JSON analysis. Always respond with valid JSON only.`;

  const userPrompt = `Analyze this campaign brief for ${companyName} in the ${industry} industry:

Brief: "${brief}"

${visualStyleFromImages ? `Reference image style: ${visualStyleFromImages}` : ""}

Return JSON with this exact structure:
{
  "objective": "one sentence campaign objective",
  "targetAudience": "specific audience description",
  "language": "arabic" | "english" | "bilingual",
  "tone": "tone description (e.g. warm, energetic, professional)",
  "themes": ["theme1", "theme2", "theme3"],
  "enhancedBrief": "enriched 2-3 sentence brief with more specific details for AI generation"
}

Detect language from the brief text itself. If brief is in Arabic or mentions Arabic-speaking audience, set language to "arabic". If mixed, set "bilingual".`;

  try {
    const raw = await openai.chat.completions.create({
      model,
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }).then((r) => r.choices[0]?.message?.content ?? "{}");

    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as AnalyzedBrief;
    return { ...parsed, visualStyleFromImages };
  } catch {
    return {
      objective: brief.slice(0, 100),
      targetAudience: "General audience",
      language: /[\u0600-\u06FF]/.test(brief) ? "arabic" : "english",
      tone: "professional and engaging",
      themes: [],
      visualStyleFromImages,
      enhancedBrief: brief,
    };
  }
}

export async function generateImageWithLogoOverlay(
  imagePrompt: string,
  logoDataUrl: string | null,
  brandName: string,
  primaryColor: string
): Promise<string> {
  logger.info({ brandName }, "Generating AI image with logo overlay");

  // Generate base AI image
  const imageBuffer = await generateImageBuffer(imagePrompt, "1024x1024");
  const baseImageBase64 = imageBuffer.toString("base64");

  // If no logo, return base image
  if (!logoDataUrl) {
    return `data:image/png;base64,${baseImageBase64}`;
  }

  // Return base64 image; logo overlay is done client-side for reliability
  return `data:image/png;base64,${baseImageBase64}`;
}
