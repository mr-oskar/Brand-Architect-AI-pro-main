import re
import httpx
from typing import TypedDict, Literal


class TrendData(TypedDict):
    headlines: list[str]
    keywords: list[str]
    summary: str
    source: Literal["news", "fallback"]


async def _fetch_google_news(query: str) -> list[str]:
    encoded = httpx.URL("").copy_with(params={"q": query}).params
    urls = [
        f"https://news.google.com/rss/search?q={query}&hl=ar&gl=SA&ceid=SA:ar",
        f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en",
    ]
    headers = {"User-Agent": "Mozilla/5.0 (compatible; RSS-reader/1.0)"}
    async with httpx.AsyncClient(timeout=8.0) as client:
        for url in urls:
            try:
                r = await client.get(url, headers=headers)
                if not r.is_success:
                    continue
                xml = r.text
                titles: list[str] = []
                pattern = re.compile(r"<title><!\[CDATA\[(.*?)\]\]></title>|<title>(.*?)</title>")
                for m in pattern.finditer(xml):
                    t = (m.group(1) or m.group(2) or "").strip()
                    if t and "google news" not in t.lower() and len(t) > 10:
                        titles.append(t)
                    if len(titles) >= 15:
                        break
                if titles:
                    return titles
            except Exception:
                continue
    return []


async def _fetch_google_trends() -> list[str]:
    url = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US"
    headers = {"User-Agent": "Mozilla/5.0 (compatible; Trends-reader/1.0)"}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(url, headers=headers)
            if not r.is_success:
                return []
            xml = r.text
            titles: list[str] = []
            pattern = re.compile(r"<title><!\[CDATA\[(.*?)\]\]></title>|<title>(.*?)</title>")
            for m in pattern.finditer(xml):
                t = (m.group(1) or m.group(2) or "").strip()
                if t and "google" not in t.lower() and len(t) > 3:
                    titles.append(t)
                if len(titles) >= 10:
                    break
            return titles
    except Exception:
        return []


def _build_summary(industry: str, headlines: list[str], keywords: list[str]) -> str:
    s = f"CURRENT TRENDS AND NEWS IN {industry.upper()} (fetched live):\n\n"
    if headlines:
        s += "Latest Headlines:\n"
        for i, h in enumerate(headlines, 1):
            s += f"{i}. {h}\n"
        s += "\n"
    if keywords:
        s += f"Trending Topics Globally: {', '.join(keywords)}\n\n"
    s += "DESIGN & MARKETING BEST PRACTICES FOR 2025-2026:\n"
    s += "- Minimalist aesthetics with bold typography\n"
    s += "- Raw, authentic UGC-style content outperforms polished ads by 3x\n"
    s += "- Motion graphics and micro-animations increase engagement by 40%\n"
    s += "- Short-form video (Reels/TikTok-style) is the #1 content format\n"
    s += "- Muted, earthy palettes with electric accent colors dominate in 2025-2026\n"
    s += "- Brutalist and neo-brutalist design is trending for B2B brands\n"
    s += "- Social proof integration (numbers, testimonials) increases conversion\n"
    s += "- Hyper-personalization: speak to ONE person, not everyone\n"
    return s


def _fallback(industry: str) -> TrendData:
    summary = (
        f"INDUSTRY INSIGHTS FOR {industry.upper()} (2025-2026):\n\n"
        f"Current Market Dynamics:\n"
        f"- AI integration is transforming every vertical in {industry}\n"
        f"- Sustainability and ESG messaging drives purchase decisions for 73% of consumers\n"
        f"- Community-led growth is replacing traditional funnel-based marketing\n"
        f"- Short-form video content generates 3x more engagement than static posts\n"
        f"- Personalization at scale is the key differentiator in {industry}\n\n"
        "DESIGN & MARKETING BEST PRACTICES FOR 2025-2026:\n"
        "- Minimalist aesthetics with bold, expressive typography\n"
        "- Authentic, raw content outperforms polished ads\n"
        "- Motion graphics and micro-animations increase engagement by 40%\n"
        "- Muted, earthy palettes with electric accent colors dominate\n"
        "- Human-first AI visuals that feel genuine, not generated\n"
    )
    return TrendData(
        headlines=[],
        keywords=[f"AI in {industry}", "sustainability", "community", "personalization", "short-form video"],
        summary=summary,
        source="fallback",
    )


async def fetch_industry_trends(industry: str, brief: str = "") -> TrendData:
    try:
        industry_headlines, trends_keywords = await _fetch_google_trends(), []
        news = await _fetch_google_news(f"{industry} trends 2025 2026")
        marketing = await _fetch_google_news(f"{industry} marketing latest news")

        all_headlines = list(dict.fromkeys(news[:6] + marketing[:4]))
        all_keywords = (await _fetch_google_trends())[:8]

        if all_headlines or all_keywords:
            return TrendData(
                headlines=all_headlines,
                keywords=all_keywords,
                summary=_build_summary(industry, all_headlines, all_keywords),
                source="news",
            )
    except Exception:
        pass
    return _fallback(industry)
