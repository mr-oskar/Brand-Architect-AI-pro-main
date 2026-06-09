import { logger } from "./logger";

export interface TrendData {
  headlines: string[];
  keywords: string[];
  summary: string;
  source: "news" | "fallback";
}

async function fetchGoogleNewsRSS(query: string): Promise<string[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${encoded}&hl=ar&gl=SA&ceid=SA:ar`;
  const fallbackUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;

  for (const feedUrl of [url, fallbackUrl]) {
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS-reader/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const titles: string[] = [];
      const regex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
      let match: RegExpExecArray | null;
      let count = 0;
      while ((match = regex.exec(xml)) !== null && count < 15) {
        const title = (match[1] || match[2] || "").trim();
        if (title && !title.toLowerCase().includes("google news") && title.length > 10) {
          titles.push(title);
          count++;
        }
      }
      if (titles.length > 0) return titles;
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchGoogleTrendsRSS(): Promise<string[]> {
  try {
    const res = await fetch(
      "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US",
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Trends-reader/1.0)" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const titles: string[] = [];
    const regex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
    let match: RegExpExecArray | null;
    let count = 0;
    while ((match = regex.exec(xml)) !== null && count < 10) {
      const title = (match[1] || match[2] || "").trim();
      if (title && !title.toLowerCase().includes("google") && title.length > 3) {
        titles.push(title);
        count++;
      }
    }
    return titles;
  } catch {
    return [];
  }
}

export async function fetchIndustryTrends(
  industry: string,
  brief?: string
): Promise<TrendData> {
  logger.info({ industry }, "Fetching industry trends");

  try {
    const queries = [
      `${industry} trends 2025 2026`,
      `${industry} marketing latest news`,
      brief ? `${brief} trending` : `${industry} social media viral`,
    ];

    const [industryHeadlines, generalTrends] = await Promise.all([
      fetchGoogleNewsRSS(queries[0]),
      fetchGoogleTrendsRSS(),
    ]);

    const marketingHeadlines = await fetchGoogleNewsRSS(queries[1]);

    const allHeadlines = [
      ...industryHeadlines.slice(0, 6),
      ...marketingHeadlines.slice(0, 4),
    ].filter((h, i, arr) => arr.indexOf(h) === i);

    const allTrendKeywords = generalTrends.slice(0, 8);

    if (allHeadlines.length > 0 || allTrendKeywords.length > 0) {
      const summary = buildTrendSummary(industry, allHeadlines, allTrendKeywords);
      return {
        headlines: allHeadlines,
        keywords: allTrendKeywords,
        summary,
        source: "news",
      };
    }
  } catch (err) {
    logger.warn({ err, industry }, "Failed to fetch live trends, using fallback");
  }

  return buildFallbackTrends(industry);
}

function buildTrendSummary(
  industry: string,
  headlines: string[],
  keywords: string[]
): string {
  let summary = `CURRENT TRENDS AND NEWS IN ${industry.toUpperCase()} (fetched live):\n\n`;

  if (headlines.length > 0) {
    summary += `Latest Headlines:\n`;
    headlines.forEach((h, i) => {
      summary += `${i + 1}. ${h}\n`;
    });
    summary += "\n";
  }

  if (keywords.length > 0) {
    summary += `Trending Topics Globally: ${keywords.join(", ")}\n\n`;
  }

  summary += `DESIGN & MARKETING BEST PRACTICES FOR 2025-2026:\n`;
  summary += `- Minimalist aesthetics with bold typography (anti-grid layouts, expressive type)\n`;
  summary += `- Raw, authentic UGC-style content outperforms polished ads by 3x\n`;
  summary += `- Motion graphics and micro-animations increase engagement by 40%\n`;
  summary += `- Short-form video (Reels/TikTok-style) is the #1 content format\n`;
  summary += `- Muted, earthy palettes with electric accent colors dominate in 2025-2026\n`;
  summary += `- Brutalist and neo-brutalist design is trending for B2B brands\n`;
  summary += `- Social proof integration (numbers, testimonials) increases conversion\n`;
  summary += `- Hyper-personalization: speak to ONE person, not everyone\n`;
  summary += `- AI-generated visuals must feel human and intentional, not sterile\n`;
  summary += `- Nostalgia marketing (Y2K, 90s vibes) has massive engagement in lifestyle brands\n`;

  return summary;
}

function buildFallbackTrends(industry: string): TrendData {
  const summary = `INDUSTRY INSIGHTS FOR ${industry.toUpperCase()} (2025-2026):\n\n` +
    `Current Market Dynamics:\n` +
    `- AI integration is transforming every vertical in ${industry}\n` +
    `- Sustainability and ESG messaging drives purchase decisions for 73% of consumers\n` +
    `- Community-led growth is replacing traditional funnel-based marketing\n` +
    `- Short-form video content generates 3x more engagement than static posts\n` +
    `- Personalization at scale is the key differentiator in ${industry}\n\n` +
    `DESIGN & MARKETING BEST PRACTICES FOR 2025-2026:\n` +
    `- Minimalist aesthetics with bold, expressive typography\n` +
    `- Authentic, raw content outperforms polished ads\n` +
    `- Motion graphics and micro-animations increase engagement by 40%\n` +
    `- Muted, earthy palettes with electric accent colors dominate\n` +
    `- Brutalist and neo-brutalist design is trending for B2B brands\n` +
    `- Social proof with real numbers drives conversion\n` +
    `- Hyper-personalized messaging: speak to ONE person\n` +
    `- Human-first AI visuals that feel genuine, not generated\n`;

  return {
    headlines: [],
    keywords: [`AI in ${industry}`, "sustainability", "community", "personalization", "short-form video"],
    summary,
    source: "fallback",
  };
}
