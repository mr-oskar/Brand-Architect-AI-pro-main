import os
import json
import base64
import re
from typing import Any, Optional
from openai import OpenAI

_client: Optional[OpenAI] = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY"),
            base_url=os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL") or None,
        )
    return _client


TEXT_MODEL = os.environ.get("AI_TEXT_MODEL", "gpt-4o-mini")
IMAGE_MODEL = "gpt-image-1"


def _parse_json_response(text: str) -> Any:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        text = m.group(1)
    text = re.sub(r"^[^{\[]*", "", text)
    text = re.sub(r"[^}\]]*$", "", text)
    return json.loads(text)


# ── Brand Kit ─────────────────────────────────────────────────────────────────

def generate_brand_kit(brand: dict, opts: dict = {}) -> dict:
    client = get_client()
    company = brand.get("companyName", "")
    description = brand.get("companyDescription", "")
    industry = brand.get("industry", "")
    brand_colors = opts.get("brandColors") or []

    color_context = (
        f"The company logo contains these extracted colors: {', '.join(brand_colors)}. "
        "Use these as the foundation for the brand color palette — keep them as primary/secondary, "
        "and derive accent/background/text/neutral from them. Honor these colors precisely."
        if brand_colors
        else "Derive a distinctive, professional brand color palette from the industry, positioning, and target audience."
    )

    system_prompt = (
        "You are the world's most accomplished brand strategist, creative director, and chief marketing officer combined. "
        "You have built brands for Fortune 500 companies, luxury conglomerates, and unicorn startups. "
        "Your brand identity systems are used as case studies at top business schools. "
        "You produce COMPREHENSIVE, SPECIFIC, ORIGINAL brand identities — never generic. "
        "You ALWAYS respond with valid JSON only — no markdown, no explanation, just the raw JSON object."
    )

    user_prompt = f"""Perform a deep brand analysis and generate a complete, professional brand identity system for this company:

Company: {company}
Industry: {industry}
Description: {description}
{color_context}

Return a JSON object with EXACTLY these fields (be deeply specific and original — no generic templates):
{{
  "personality": "2-3 sentence brand personality statement — who they truly are, their character, energy, and essence. Make it vivid and specific.",
  "positioning": "2-3 sentence market positioning — where they sit in the competitive landscape, their unique angle, what they own in the mind of customers.",
  "toneOfVoice": "Specific description of their communication style — vocabulary range, sentence rhythm, emotional register, energy level, examples of how they would and wouldn't speak.",
  "audienceSegments": [
    "Primary segment: [job title/role], [age range], [specific pain point], [aspiration], [platform where they spend time]",
    "Secondary segment: [detailed demographic + psychographic]",
    "Tertiary segment: [detailed demographic + psychographic]"
  ],
  "visualStyle": "one of exactly: tech | luxury | bold | minimal",
  "colorPalette": {{
    "primary": "#HEXCODE",
    "secondary": "#HEXCODE",
    "accent": "#HEXCODE",
    "background": "#HEXCODE",
    "text": "#HEXCODE",
    "neutral": "#HEXCODE"
  }},
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
}}

Be deeply specific, original, and tailored to {company}. Every field must reflect this exact company, not a generic {industry} brand."""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=8192,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        kit = _parse_json_response(resp.choices[0].message.content or "")
        if kit.get("visualStyle") not in ("tech", "luxury", "bold", "minimal"):
            kit["visualStyle"] = "minimal"
        palette = kit.get("colorPalette", {})
        if not palette.get("neutral"):
            palette["neutral"] = "#6B7280"
        if not palette.get("text"):
            palette["text"] = "#F1F5F9"
        kit["colorPalette"] = palette
        return kit
    except Exception:
        return _fallback_brand_kit(company, description, industry, brand_colors)


def _fallback_brand_kit(company: str, description: str, industry: str, brand_colors: list = []) -> dict:
    if len(brand_colors) >= 2:
        palette = {
            "primary": brand_colors[0],
            "secondary": brand_colors[1],
            "accent": brand_colors[2] if len(brand_colors) > 2 else "#06B6D4",
            "background": "#0F172A",
            "text": "#F1F5F9",
            "neutral": "#6B7280",
        }
    else:
        palette = {
            "primary": "#6366F1",
            "secondary": "#8B5CF6",
            "accent": "#06B6D4",
            "background": "#0F172A",
            "text": "#F1F5F9",
            "neutral": "#6B7280",
        }
    return {
        "personality": f"{company} is a dynamic, results-driven brand in the {industry} space that combines deep expertise with genuine human connection. We are ambitious yet approachable, innovative yet reliable.",
        "positioning": f"{company} occupies a unique position as the intelligent choice in {industry} — where professional excellence meets authentic partnership. We deliver measurable impact, not just services.",
        "toneOfVoice": "Direct, confident, and human. We speak plainly but powerfully — no jargon, no corporate speak. We sound like the smartest person in the room who is also the most helpful.",
        "audienceSegments": [
            "Growth-focused business owners (30–45), frustrated with slow results, seeking a reliable partner",
            "Senior managers at SMBs who need to justify ROI to stakeholders",
            "Entrepreneurs building their second or third venture",
        ],
        "visualStyle": "minimal",
        "colorPalette": palette,
        "visualStyleRules": "Clean, modern compositions with generous white space. Primary color used for key focal points only. Photography: natural light, authentic moments, people-first. Typography: strong hierarchy, readable body text. Always leave breathing room — never crowd elements.",
        "brandStory": f"{company} was founded with a single observation: {description[:100]}. The gap between what businesses needed and what they were getting was too wide to ignore.\n\nSo we built a different approach. One that combines intelligent systems with genuine human expertise — creating outcomes that neither alone could achieve.\n\nToday, {company} is the partner that growth-minded businesses trust when the stakes are real.",
        "missionStatement": f"Helping {industry} businesses achieve breakthrough results through intelligent strategy and genuine partnership.",
        "visionStatement": f"A world where every ambitious business has access to world-class expertise and delivers on its full potential.",
        "taglines": ["Built for Growth", "Intelligence Meets Action", "Results, Not Just Promises", "Your Growth Partner"],
        "brandKeywords": ["growth", "results", "intelligent", "trusted", "innovative", "strategic", "human", "impactful"],
        "messagingPillars": [
            "Results-First — We lead with measurable outcomes and always tie our work to business impact",
            "Intelligent Partnership — We bring both AI-driven insights and deep human expertise to every engagement",
            "Proven Excellence — We back every claim with evidence, case studies, and transparent methodology",
        ],
        "dosCommunication": [
            "Do: Lead with specific outcomes and numbers when possible",
            "Do: Use active, direct language that respects the reader's time",
            "Do: Acknowledge real challenges before presenting solutions",
            "Do: Speak to ambitions, not just problems",
        ],
        "dontsCommunication": [
            "Don't: Use buzzwords or vague superlatives ('world-class', 'best-in-class')",
            "Don't: Over-promise or use absolute claims without evidence",
            "Don't: Speak down to the audience or be condescending",
            "Don't: Use passive voice or corporate jargon",
        ],
        "socialBio": f"✦ {industry} growth partner | Results-driven strategy | Link below 👇",
        "typographyRecommendations": "Headings: Geometric sans-serif (e.g., Inter Bold or Neue Haas Grotesk, weight 700–900). Body: Humanist sans-serif (e.g., Inter Regular, weight 400). Accent: Same family, weight 500 italic for pull quotes.",
        "competitivePosition": f"{company} occupies the intelligent professional space — more sophisticated than generalist agencies, more human than pure-tech platforms. The moat is the combination: enterprise-quality thinking delivered with boutique-level care.",
    }


def generate_brand_story(brand: dict) -> dict:
    client = get_client()
    company = brand.get("companyName", "")
    description = brand.get("companyDescription", "")
    industry = brand.get("industry", "")
    kit = brand.get("brandKit") or {}

    prompt = f"""You are an elite brand storytelling expert. Create a compelling brand story for {company} ({industry}).

Description: {description}
Tone: {kit.get("toneOfVoice", "Professional")}
Keywords: {", ".join(kit.get("brandKeywords") or [])}

Return ONLY a JSON object:
{{
  "origin": "Compelling origin story (2-3 paragraphs)",
  "mission": "Clear mission statement",
  "vision": "Inspiring vision statement",
  "whyStatement": "Simon Sinek-style WHY statement",
  "brandNarrative": "Full brand story (3-4 paragraphs)",
  "elevatorPitch": "30-second elevator pitch",
  "founderStory": "Personal founder/brand origin story"
}}"""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=3000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        return {"origin": f"{company} was founded with a vision to transform the {industry} industry.", "mission": f"To deliver exceptional {industry} solutions.", "vision": f"To be the leading {industry} company.", "whyStatement": "We believe every business deserves the best.", "brandNarrative": f"{company} stands for excellence in {industry}.", "elevatorPitch": f"{company} provides premium {industry} services.", "founderStory": f"The founders of {company} saw an opportunity to change {industry}."}


# ── Campaign Generation ────────────────────────────────────────────────────────

def generate_campaign(
    brand: dict,
    brief: str = "",
    post_count: int = 7,
    platforms: list[str] = None,
    trends_summary: str = "",
    analyzed_brief: dict = None,
) -> dict:
    client = get_client()
    if platforms is None:
        platforms = ["instagram"]

    company = brand.get("companyName", "")
    industry = brand.get("industry", "")
    description = brand.get("companyDescription", "")
    kit = brand.get("brandKit") or {}
    palette = kit.get("colorPalette") or {}
    primary_color = palette.get("primary", "#1a1a2e")
    style = kit.get("visualStyle", "modern professional")
    tone = kit.get("toneOfVoice", "professional")
    tagline = (kit.get("taglines") or [""])[0]

    is_arabic = analyzed_brief and analyzed_brief.get("language") == "arabic"
    lang_instruction = "\n\nIMPORTANT: Write ALL post content (hook, caption, cta, hashtags) in Arabic." if is_arabic else ""

    platform_sizes = {
        "instagram": "1080x1080",
        "linkedin": "1200x628",
        "twitter": "1200x675",
        "facebook": "1200x630",
        "tiktok": "1080x1920",
    }

    platform_notes = ""
    if platforms:
        notes = []
        for p in platforms:
            size = platform_sizes.get(p.lower(), "1080x1080")
            notes.append(f"{p} ({size})")
        platform_notes = f"\nPlatforms and sizes: {', '.join(notes)}"

    brief_section = ""
    if analyzed_brief:
        brief_section = f"""
ANALYZED CAMPAIGN BRIEF:
- Objective: {analyzed_brief.get("objective", "")}
- Target Audience: {analyzed_brief.get("targetAudience", "")}
- Key Messages: {", ".join(analyzed_brief.get("keyMessages") or [])}
- Visual Direction: {analyzed_brief.get("visualDirection", "")}
- Content Themes: {", ".join(analyzed_brief.get("contentThemes") or [])}
- Language: {analyzed_brief.get("language", "english")}
"""
    elif brief:
        brief_section = f"\nCAMPAIGN BRIEF: {brief}"

    trends_section = f"\n\n{trends_summary}" if trends_summary else ""

    prompt = f"""You are a world-class social media campaign strategist. Create a {post_count}-post campaign for:

Brand: {company}
Industry: {industry}
Description: {description}
Tone of Voice: {tone}
Visual Style: {style}
Primary Color: {primary_color}
Tagline: {tagline}
{platform_notes}
{brief_section}
{trends_section}
{lang_instruction}

Create a strategically sequenced campaign following awareness → trust → authority → conversion arc.

Return ONLY a JSON object:
{{
  "title": "Campaign title",
  "strategy": "Detailed strategy description (3-4 sentences)",
  "posts": [
    {{
      "day": 1,
      "platform": "{platforms[0] if platforms else 'instagram'}",
      "hook": "Attention-grabbing first line",
      "caption": "Full caption with line breaks (3-4 paragraphs)",
      "cta": "Call to action",
      "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
      "imagePrompt": "Detailed image generation prompt with size {platform_sizes.get(platforms[0] if platforms else 'instagram', '1080x1080')}"
    }}
  ]
}}

Generate exactly {post_count} posts. Vary the platform per post if multiple platforms provided: {platforms}."""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=8000,
            messages=[{"role": "user", "content": prompt}],
        )
        data = _parse_json_response(resp.choices[0].message.content or "")
        if not isinstance(data.get("posts"), list):
            raise ValueError("invalid posts")
        return data
    except Exception:
        return _fallback_campaign(company, industry, style, palette, post_count, platforms)


def _fallback_campaign(company: str, industry: str, style: str, palette: dict, post_count: int, platforms: list) -> dict:
    primary = palette.get("primary", "#1a1a2e")
    secondary = palette.get("secondary", "#16213e")
    posts = []
    concepts = [
        ("Introducing a new standard", "You deserve better.", "Learn more"),
        ("The story behind our craft", "Quality isn't an accident.", "Discover more"),
        ("Why our clients trust us", "Real results, real impact.", "See results"),
        ("Behind the scenes", "Excellence takes dedication.", "Follow our journey"),
        ("What sets us apart", "We go beyond expectations.", "Find out why"),
        ("Our commitment to you", "Your success is our mission.", "Get started"),
        ("Join our community", "Together we achieve more.", "Join us today"),
    ]
    for i in range(post_count):
        concept, hook_suffix, cta = concepts[i % len(concepts)]
        platform = platforms[i % len(platforms)] if platforms else "instagram"
        size = {"instagram": "1080x1080", "linkedin": "1200x628"}.get(platform, "1080x1080")
        posts.append({
            "day": i + 1,
            "platform": platform,
            "hook": f"{company}: {concept}.",
            "caption": f"{concept}\n\nAt {company}, we believe every {industry} business deserves excellence.\n\n{hook_suffix}\n\n→ Real results, not promises\n→ Strategy backed by data\n→ A partner invested in your growth\n\n{cta} — link in bio.",
            "cta": cta,
            "hashtags": [f"#{company.replace(' ', '')}", f"#{industry.replace(' ', '')}", "#Marketing", "#BusinessGrowth", "#Strategy"],
            "imagePrompt": f"Commercial advertising photography: {concept} scene for {company}. {style} aesthetic, {primary} color as dominant accent, {secondary} as supporting tone. Bold typography overlay. Professional cinematic lighting, ultra high quality. {size} ratio.",
        })
    return {
        "title": f"{company} — {post_count}-Day Brand Campaign",
        "strategy": f"A strategically sequenced {post_count}-day campaign for {company} following the awareness → trust → authority → conversion arc.",
        "posts": posts,
    }


# ── Post Operations ────────────────────────────────────────────────────────────

def regenerate_post(post: dict, brand: dict) -> dict:
    client = get_client()
    company = brand.get("companyName", "")
    industry = brand.get("industry", "")
    kit = brand.get("brandKit") or {}
    tone = kit.get("toneOfVoice", "professional")
    style = kit.get("visualStyle", "modern")
    primary = (kit.get("colorPalette") or {}).get("primary", "#1a1a2e")
    platform = post.get("platform", "instagram")
    day = post.get("day", 1)

    prompt = f"""You are a world-class social media copywriter. Regenerate this post for {company} ({industry}).

Platform: {platform}, Day: {day}
Original hook: {post.get("hook", "")}
Original caption: {(post.get("caption") or "")[:200]}

Brand tone: {tone}
Visual style: {style}

Return ONLY a JSON object:
{{
  "hook": "New attention-grabbing hook",
  "caption": "New caption (3-4 paragraphs with line breaks)",
  "cta": "Compelling call to action",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "imagePrompt": "Professional commercial visual: [describe scene]. {style} aesthetic, {primary} dominant color. Typography: [brand name/headline]. Cinematic lighting, ultra-high quality. 1080x1080."
}}"""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        return {"hook": f"Discover {company}", "caption": f"At {company}, excellence meets innovation in {industry}.", "cta": "Learn more — link in bio.", "hashtags": [f"#{company.replace(' ', '')}", f"#{industry.replace(' ', '')}"], "imagePrompt": f"Professional commercial photography for {company}, {style} aesthetic."}


def generate_post_variant(company_name: str, industry: str, brand_kit: dict, original_post: dict) -> dict:
    client = get_client()
    style = brand_kit.get("visualStyle", "modern")
    primary = (brand_kit.get("colorPalette") or {}).get("primary", "#1a1a2e")
    tone = brand_kit.get("toneOfVoice", "professional")

    prompt = f"""You are a world-class social media copywriter. Create a completely different A/B variant for "{company_name}" ({industry}).

Original post (Day {original_post.get("day", 1)}, {original_post.get("platform", "instagram")}):
- Hook: {original_post.get("hook", "")}
- Caption: {(original_post.get("caption") or "")[:120]}
- CTA: {original_post.get("cta", "")}

Brand tone: {tone} | Visual style: {style}

Return ONLY a JSON object:
{{
  "hook": "completely different hook",
  "caption": "fresh caption from different angle (3-4 paragraphs)",
  "cta": "different compelling CTA",
  "hashtags": ["#new1", "#new2", "#new3", "#new4", "#new5"],
  "imagePrompt": "Professional commercial visual — completely different scene. {style} aesthetic, {primary} dominant. Cinematic lighting. 1080x1080."
}}"""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        return {"hook": f"A new perspective on {company_name}", "caption": f"Innovation in {industry} starts here.", "cta": "Explore more", "hashtags": [f"#{company_name.replace(' ', '')}"], "imagePrompt": f"Creative commercial photography for {company_name}."}


def generate_long_form_content(post: dict, brand: dict, content_type: str) -> dict:
    client = get_client()
    company = brand.get("companyName", "")
    industry = brand.get("industry", "")
    kit = brand.get("brandKit") or {}
    tone = kit.get("toneOfVoice", "professional")

    type_instructions = {
        "blog": "a comprehensive 800-1200 word blog article",
        "email": "a compelling marketing email with subject line and body",
        "newsletter": "an engaging newsletter edition",
    }

    prompt = f"""Create {type_instructions.get(content_type, "content")} for {company} ({industry}).

Based on this post:
Hook: {post.get("hook", "")}
Caption: {post.get("caption", "")}

Brand tone: {tone}

Return ONLY a JSON object:
{{
  "title": "Compelling title",
  "content": "Full content with proper formatting",
  "meta": {{"wordCount": 0, "readTime": "X min", "contentType": "{content_type}"}}
}}"""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        return {"title": f"{company} — {content_type.title()}", "content": f"Content about {post.get('hook', '')}", "meta": {"contentType": content_type}}


# ── Image Generation ───────────────────────────────────────────────────────────

def generate_image_with_references(
    prompt: str,
    reference_images: list[dict] = None,
    size: str = "1024x1024",
    quality: str = "auto",
    background: str = "auto",
    model: str = "auto",
) -> bytes:
    client = get_client()
    valid_sizes = {"1024x1024", "1024x1536", "1536x1024"}
    if size not in valid_sizes:
        size = "1024x1024"

    gen_kwargs: dict = {
        "model": IMAGE_MODEL,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "output_format": "b64_json",
    }
    if quality and quality != "auto":
        gen_kwargs["quality"] = quality
    if background and background != "auto":
        gen_kwargs["background"] = background
    if reference_images:
        gen_kwargs["prompt"] = prompt + " [Reference style provided]"

    resp = client.images.generate(**gen_kwargs)
    b64 = resp.data[0].b64_json
    return base64.b64decode(b64)


def generate_post_image(
    prompt: str,
    size: str = "1024x1024",
    logo_data_url: str = None,
    overlay_text: str = None,
    brand_name: str = None,
    reference_images: list[dict] = None,
    model: str = "auto",
) -> bytes:
    enhanced_prompt = prompt
    if brand_name:
        enhanced_prompt += f"\n\nBrand: {brand_name}. Include brand name in typography if appropriate."
    if overlay_text:
        enhanced_prompt += f"\n\nInclude this text overlay: '{overlay_text}'"
    return generate_image_with_references(enhanced_prompt, reference_images, size, model=model)


# ── Style Extraction ───────────────────────────────────────────────────────────

def extract_image_style(image_b64: str) -> str:
    client = get_client()
    prompt = """Analyze this image and describe its visual style as a reusable image generation prompt.

Focus ONLY on:
- Art style and technique (photography, illustration, 3D, etc.)
- Color palette and mood (warm/cool, saturated/muted, contrast)
- Lighting quality and direction
- Composition and framing style
- Texture and material feel
- Visual atmosphere

Do NOT describe specific subjects or objects.
Return a single paragraph suitable for image generation prompts."""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_completion_tokens=300,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
                ],
            }],
        )
        return resp.choices[0].message.content or ""
    except Exception:
        return "Professional commercial photography with cinematic lighting, clean composition, high contrast, and vibrant colors."


def expand_prompts(base_prompt: str, n: int = 4, mode: str = "variations") -> list[str]:
    client = get_client()
    n = max(2, min(n, 16))
    mode_desc = {
        "variations": "different creative interpretations",
        "styleLock": "same style, different subjects",
        "subjectLock": "same subject, different styles",
        "matrix": "grid of style × subject combinations",
        "aspectPack": "same scene in different aspect ratios",
    }.get(mode, "variations")

    prompt = f"""Generate {n} prompt variations ({mode_desc}) based on this base prompt:
"{base_prompt}"

Preserve any @refN tokens exactly. Return ONLY a JSON array of {n} strings."""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse_json_response(resp.choices[0].message.content or "")
        if isinstance(result, list):
            return result[:n]
        return [base_prompt] * n
    except Exception:
        return [base_prompt] * n


# ── Brief Analysis ─────────────────────────────────────────────────────────────

def analyze_brief(brief: str, reference_images: list[str] = None) -> dict:
    client = get_client()
    messages = []

    system_prompt = """You are an expert marketing strategist. Analyze this campaign brief and extract structured insights.

Return ONLY a JSON object:
{
  "objective": "Main campaign objective",
  "targetAudience": "Detailed target audience description",
  "keyMessages": ["message1", "message2", "message3"],
  "visualDirection": "Visual style and aesthetic direction",
  "contentThemes": ["theme1", "theme2", "theme3"],
  "tone": "Campaign tone",
  "language": "arabic or english",
  "suggestedHashtags": ["#tag1", "#tag2", "#tag3"],
  "competitiveAngle": "What differentiates this campaign",
  "callToAction": "Primary CTA"
}"""

    content: list = [{"type": "text", "text": f"Campaign Brief:\n{brief}" if brief else "Create a campaign for this brand based on the reference images."}]

    if reference_images:
        for img in reference_images[:5]:
            if img.startswith("data:"):
                content.append({"type": "image_url", "image_url": {"url": img}})
            else:
                content.append({"type": "image_url", "image_url": {"url": img}})

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_completion_tokens=1500,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content},
            ],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        lang = "arabic" if brief and any("\u0600" <= c <= "\u06ff" for c in brief) else "english"
        return {
            "objective": "Brand awareness and engagement",
            "targetAudience": "Target market audience",
            "keyMessages": ["Quality", "Innovation", "Trust"],
            "visualDirection": "Professional and modern",
            "contentThemes": ["Brand story", "Product benefits", "Customer success"],
            "tone": "Professional",
            "language": lang,
            "suggestedHashtags": [],
            "competitiveAngle": "Quality and expertise",
            "callToAction": "Learn more",
        }


# ── Design AI ─────────────────────────────────────────────────────────────────

def generate_design_layout(brand_name: str, style: str, colors: dict, prompt_override: str = "", logo_url: str = None) -> dict:
    client = get_client()
    primary = colors.get("primary", "#1a1a2e")
    secondary = colors.get("secondary", "#16213e")
    accent = colors.get("accent", "#0f3460")

    prompt = f"""You are an expert Fabric.js designer. Create a professional design layout for {brand_name}.

Style: {style}
Colors: primary={primary}, secondary={secondary}, accent={accent}
{f"Additional context: {prompt_override}" if prompt_override else ""}

Return ONLY a valid JSON Fabric.js canvas object:
{{
  "version": "5.3.0",
  "objects": [
    {{
      "type": "rect",
      "left": 0,
      "top": 0,
      "width": 794,
      "height": 1123,
      "fill": "{primary}",
      "selectable": false
    }}
  ],
  "background": "{secondary}"
}}

Create 8-14 objects including background, shapes, text elements with proper branding."""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        return {"version": "5.3.0", "objects": [{"type": "rect", "left": 0, "top": 0, "width": 794, "height": 1123, "fill": primary, "selectable": False}], "background": secondary}


def smart_generate_design(brand_name: str, style: str, colors: dict, content: str = "") -> dict:
    client = get_client()
    detection_prompt = f"""Analyze this design request and detect: industry, style, layout type.

Brand: {brand_name}
Style: {style}
Content hint: {content}

Return ONLY JSON:
{{
  "detectedIndustry": "industry",
  "detectedStyle": "style description",
  "layoutType": "poster|social|banner|flyer|business-card",
  "internalPrompt": "Professional detailed design brief for image generation",
  "layerExplanations": ["layer1 purpose", "layer2 purpose"]
}}"""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=1000,
            messages=[{"role": "user", "content": detection_prompt}],
        )
        detection = _parse_json_response(resp.choices[0].message.content or "")
        layout = generate_design_layout(brand_name, detection.get("detectedStyle", style), colors, detection.get("internalPrompt", ""))
        return {"detection": detection, "layout": layout}
    except Exception:
        layout = generate_design_layout(brand_name, style, colors)
        return {"detection": {"detectedStyle": style, "layoutType": "poster"}, "layout": layout}


def analyze_image_for_design(image_b64: str) -> dict:
    client = get_client()
    prompt = """Analyze this design image and reverse-engineer it into Fabric.js layer descriptions.

Return ONLY JSON:
{
  "colors": ["#hex1", "#hex2", "#hex3"],
  "typography": {"fonts": ["font1"], "sizes": ["heading", "body"], "weights": ["bold", "regular"]},
  "layout": "description of layout structure",
  "objects": [
    {"type": "rect|text|image", "description": "purpose and style", "approximate_position": "top-left|center|etc"}
  ],
  "style": "overall design style",
  "canvasData": {"version": "5.3.0", "objects": [], "background": "#ffffff"}
}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_completion_tokens=2000,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
            ]}],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        return {"colors": [], "typography": {}, "layout": "Standard layout", "objects": [], "style": "Modern", "canvasData": {"version": "5.3.0", "objects": [], "background": "#ffffff"}}


def ai_edit_canvas(canvas_json: dict, instruction: str, brand_name: str = "") -> dict:
    client = get_client()
    prompt = f"""You are an expert Fabric.js designer. Apply this edit instruction to the canvas:

Instruction: "{instruction}"
Brand: {brand_name}

Current canvas (first 2000 chars):
{json.dumps(canvas_json)[:2000]}

Return ONLY the updated Fabric.js JSON canvas object with the instruction applied."""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        return canvas_json


# ── Brand Book Generation ─────────────────────────────────────────────────────

A4_W = 794
A4_H = 1123
IVORY = "#FFFFF0"
INK = "#1a1a2e"
INK_SOFT = "#3a3a52"


def _hex_to_rgb(hex_color: str) -> str:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return "26, 26, 46"
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return f"{r}, {g}, {b}"


def _generate_book_content(input_data: dict) -> dict:
    client = get_client()
    company = input_data.get("companyName", "")
    industry = input_data.get("industry", "")
    tagline = input_data.get("tagline", "")
    mission = input_data.get("mission", "")
    personality = ", ".join(input_data.get("personality") or ["Futuristic", "Minimal", "Intelligent"])
    palette = input_data.get("palette", {})
    fonts = input_data.get("fonts", {})

    prompt = f"""You are a senior brand strategist writing a professional brand book for {company} ({industry}).

Tagline: {tagline}
Mission: {mission}
Brand personality: {personality}
Primary color: {palette.get("primary", "#6366f1")}
Heading font: {fonts.get("heading", "Georgia")}
Body font: {fonts.get("body", "Inter")}

Write professional, specific brand book content. Return ONLY JSON:
{{
  "cover": {{"tagline": "evocative 5-8 word brand tagline", "footer": "brief company descriptor"}},
  "overview": {{"personality": "2 sentences brand personality", "audience": "primary audience description", "tone": "tone of voice summary", "mission": "mission statement"}},
  "logo": {{"intro": "2 sentences logo design rationale", "clearSpace": "clear space rule description", "minSize": "minimum size guideline"}},
  "color": {{"intro": "2 sentences color palette rationale", "psychology": {{"primary": "primary color meaning", "secondary": "secondary color meaning", "accent": "accent color meaning", "neutral": "neutral usage note"}}}},
  "typography": {{"intro": "2 sentences typography rationale", "headingDesc": "heading font usage note", "bodyDesc": "body font usage note"}},
  "ui": {{"intro": "2 sentences UI/digital design principles"}},
  "visual": {{"iconStyle": "icon design style note", "pattern": "pattern/texture usage note", "imagery": "photography/imagery guidelines"}},
  "rules": {{"dos": ["Do: specific rule 1", "Do: specific rule 2", "Do: specific rule 3"], "donts": ["Don't: specific rule 1", "Don't: specific rule 2", "Don't: specific rule 3"]}}
}}"""

    try:
        resp = client.chat.completions.create(
            model=TEXT_MODEL,
            max_completion_tokens=3000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_json_response(resp.choices[0].message.content or "")
    except Exception:
        return {
            "cover": {"tagline": tagline, "footer": f"{company} — {industry}"},
            "overview": {"personality": personality, "audience": "Modern professionals", "tone": "Professional and engaging", "mission": mission or f"Empowering {industry} excellence"},
            "logo": {"intro": f"The {company} logo represents clarity and vision.", "clearSpace": "Maintain clear space equal to the cap-height of the logo.", "minSize": "Never reproduce smaller than 24px height."},
            "color": {"intro": "Our palette communicates trust and modernity.", "psychology": {"primary": "Confidence and leadership", "secondary": "Depth and reliability", "accent": "Energy and action", "neutral": "Balance and clarity"}},
            "typography": {"intro": "Our typefaces pair tradition with modernity.", "headingDesc": f"{fonts.get('heading', 'Georgia')} — authoritative and refined", "bodyDesc": f"{fonts.get('body', 'Inter')} — clear and accessible"},
            "ui": {"intro": "Digital experiences are clean, purposeful, and brand-forward."},
            "visual": {"iconStyle": "Geometric, minimal, consistent stroke weight", "pattern": "Subtle brand-color geometry on white or surface backgrounds", "imagery": "Natural light, authentic moments, purposeful composition"},
            "rules": {"dos": ["Do: Use brand colors consistently", "Do: Maintain generous white space", "Do: Lead with the logo in communications"], "donts": ["Don't: Distort or recolor the logo", "Don't: Use low-contrast color combinations", "Don't: Mix more than 3 typefaces"]},
        }


def _make_cover_page(inp: dict, content: dict) -> dict:
    p = inp.get("palette", {})
    primary = p.get("primary", "#6366f1")
    bg = p.get("background", IVORY)
    text_col = p.get("text", INK)
    company = inp.get("companyName", "Brand")
    logo_url = inp.get("logoUrl")
    cover = content.get("cover", {})
    font_h = inp.get("fonts", {}).get("heading", "Georgia")

    objects = [
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": A4_H, "fill": bg, "selectable": False},
        {"type": "rect", "left": 0, "top": 0, "width": 8, "height": A4_H, "fill": primary, "selectable": False},
        {"type": "rect", "left": 0, "top": A4_H - 120, "width": A4_W, "height": 120, "fill": primary, "selectable": False},
    ]
    if logo_url:
        objects.append({"type": "image", "src": logo_url, "left": A4_W // 2 - 60, "top": 300, "width": 120, "height": 120, "selectable": False})
    objects += [
        {"type": "text", "text": company.upper(), "left": A4_W // 2, "top": 460, "width": 600, "fontSize": 52, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "textAlign": "center", "originX": "center", "selectable": False},
        {"type": "text", "text": "BRAND IDENTITY GUIDELINES", "left": A4_W // 2, "top": 530, "width": 600, "fontSize": 14, "fontFamily": "Inter", "fontWeight": "normal", "fill": INK_SOFT, "textAlign": "center", "originX": "center", "charSpacing": 300, "selectable": False},
        {"type": "text", "text": cover.get("tagline", inp.get("tagline", "")), "left": A4_W // 2, "top": 620, "width": 580, "fontSize": 18, "fontFamily": font_h, "fontStyle": "italic", "fill": INK_SOFT, "textAlign": "center", "originX": "center", "selectable": False},
        {"type": "text", "text": cover.get("footer", ""), "left": A4_W // 2, "top": A4_H - 80, "width": 600, "fontSize": 12, "fontFamily": "Inter", "fill": "#ffffff", "textAlign": "center", "originX": "center", "selectable": False},
    ]
    return {"background": bg, "objects": objects, "aiSpec": True}


def _make_overview_page(inp: dict, content: dict) -> dict:
    p = inp.get("palette", {})
    primary = p.get("primary", "#6366f1")
    bg = p.get("background", IVORY)
    text_col = p.get("text", INK)
    font_h = inp.get("fonts", {}).get("heading", "Georgia")
    font_b = inp.get("fonts", {}).get("body", "Inter")
    ov = content.get("overview", {})

    objects = [
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": A4_H, "fill": bg, "selectable": False},
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": 80, "fill": primary, "selectable": False},
        {"type": "text", "text": "BRAND OVERVIEW", "left": 40, "top": 25, "width": 600, "fontSize": 24, "fontFamily": font_h, "fontWeight": "bold", "fill": "#ffffff", "selectable": False},
        {"type": "text", "text": "Brand Personality", "left": 40, "top": 120, "width": 400, "fontSize": 16, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": ov.get("personality", ""), "left": 40, "top": 145, "width": 700, "fontSize": 13, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
        {"type": "rect", "left": 40, "top": 220, "width": A4_W - 80, "height": 1, "fill": primary, "opacity": 0.3, "selectable": False},
        {"type": "text", "text": "Target Audience", "left": 40, "top": 240, "width": 400, "fontSize": 16, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": ov.get("audience", ""), "left": 40, "top": 265, "width": 700, "fontSize": 13, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
        {"type": "rect", "left": 40, "top": 340, "width": A4_W - 80, "height": 1, "fill": primary, "opacity": 0.3, "selectable": False},
        {"type": "text", "text": "Tone of Voice", "left": 40, "top": 360, "width": 400, "fontSize": 16, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": ov.get("tone", ""), "left": 40, "top": 385, "width": 700, "fontSize": 13, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
        {"type": "rect", "left": 40, "top": 460, "width": A4_W - 80, "height": 1, "fill": primary, "opacity": 0.3, "selectable": False},
        {"type": "text", "text": "Mission Statement", "left": 40, "top": 480, "width": 400, "fontSize": 16, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": ov.get("mission", ""), "left": 40, "top": 505, "width": 700, "fontSize": 13, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
    ]
    return {"background": bg, "objects": objects, "aiSpec": True}


def _make_logo_page(inp: dict, content: dict) -> dict:
    p = inp.get("palette", {})
    primary = p.get("primary", "#6366f1")
    bg = p.get("background", IVORY)
    text_col = p.get("text", INK)
    font_h = inp.get("fonts", {}).get("heading", "Georgia")
    font_b = inp.get("fonts", {}).get("body", "Inter")
    logo_url = inp.get("logoUrl")
    variants = inp.get("logoVariants") or {}
    lc = content.get("logo", {})

    objects = [
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": A4_H, "fill": bg, "selectable": False},
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": 80, "fill": primary, "selectable": False},
        {"type": "text", "text": "LOGO SYSTEM", "left": 40, "top": 25, "width": 600, "fontSize": 24, "fontFamily": font_h, "fontWeight": "bold", "fill": "#ffffff", "selectable": False},
        {"type": "text", "text": lc.get("intro", ""), "left": 40, "top": 110, "width": 700, "fontSize": 13, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
    ]
    if logo_url:
        objects.append({"type": "image", "src": logo_url, "left": A4_W // 2 - 80, "top": 180, "width": 160, "height": 160, "selectable": False})
    black_url = variants.get("black") or logo_url
    white_url = variants.get("white") or logo_url
    gray_url = variants.get("grayscale") or logo_url
    if black_url:
        objects.append({"type": "image", "src": black_url, "left": 80, "top": 420, "width": 100, "height": 100, "selectable": False})
        objects.append({"type": "text", "text": "Black", "left": 130, "top": 530, "fontSize": 11, "fontFamily": font_b, "fill": INK_SOFT, "textAlign": "center", "originX": "center", "selectable": False})
    if white_url:
        objects.append({"type": "rect", "left": 260, "top": 410, "width": 120, "height": 120, "fill": primary, "selectable": False})
        objects.append({"type": "image", "src": white_url, "left": 270, "top": 420, "width": 100, "height": 100, "selectable": False})
        objects.append({"type": "text", "text": "Reversed", "left": 320, "top": 540, "fontSize": 11, "fontFamily": font_b, "fill": INK_SOFT, "textAlign": "center", "originX": "center", "selectable": False})
    objects += [
        {"type": "text", "text": "Clear Space", "left": 40, "top": 620, "width": 400, "fontSize": 14, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": lc.get("clearSpace", ""), "left": 40, "top": 642, "width": 700, "fontSize": 12, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
        {"type": "text", "text": "Minimum Size", "left": 40, "top": 700, "width": 400, "fontSize": 14, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": lc.get("minSize", ""), "left": 40, "top": 722, "width": 700, "fontSize": 12, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
    ]
    return {"background": bg, "objects": objects, "aiSpec": True}


def _make_color_page(inp: dict, content: dict) -> dict:
    p = inp.get("palette", {})
    primary = p.get("primary", "#6366f1")
    secondary = p.get("secondary", "#8b5cf6")
    accent = p.get("accent", "#e94560")
    neutral = p.get("neutral", "#6B7280")
    bg = p.get("background", IVORY)
    text_col = p.get("text", INK)
    font_h = inp.get("fonts", {}).get("heading", "Georgia")
    font_b = inp.get("fonts", {}).get("body", "Inter")
    cc = content.get("color", {})
    psych = cc.get("psychology", {})

    swatches = [
        (primary, "Primary", psych.get("primary", "")),
        (secondary, "Secondary", psych.get("secondary", "")),
        (accent, "Accent", psych.get("accent", "")),
        (neutral, "Neutral", psych.get("neutral", "")),
    ]

    objects = [
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": A4_H, "fill": bg, "selectable": False},
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": 80, "fill": primary, "selectable": False},
        {"type": "text", "text": "COLOR PALETTE", "left": 40, "top": 25, "width": 600, "fontSize": 24, "fontFamily": font_h, "fontWeight": "bold", "fill": "#ffffff", "selectable": False},
        {"type": "text", "text": cc.get("intro", ""), "left": 40, "top": 110, "width": 700, "fontSize": 13, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
    ]

    for i, (color, name, desc) in enumerate(swatches):
        x = 40 + i * 170
        y = 180
        objects += [
            {"type": "rect", "left": x, "top": y, "width": 150, "height": 150, "fill": color, "rx": 8, "selectable": False},
            {"type": "text", "text": name, "left": x, "top": y + 160, "width": 150, "fontSize": 13, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
            {"type": "text", "text": color, "left": x, "top": y + 178, "width": 150, "fontSize": 11, "fontFamily": "Inter", "fill": INK_SOFT, "selectable": False},
            {"type": "text", "text": desc, "left": x, "top": y + 196, "width": 150, "fontSize": 10, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
        ]

    return {"background": bg, "objects": objects, "aiSpec": True}


def _make_typography_page(inp: dict, content: dict) -> dict:
    p = inp.get("palette", {})
    primary = p.get("primary", "#6366f1")
    bg = p.get("background", IVORY)
    text_col = p.get("text", INK)
    font_h = inp.get("fonts", {}).get("heading", "Georgia")
    font_b = inp.get("fonts", {}).get("body", "Inter")
    tc = content.get("typography", {})

    objects = [
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": A4_H, "fill": bg, "selectable": False},
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": 80, "fill": primary, "selectable": False},
        {"type": "text", "text": "TYPOGRAPHY", "left": 40, "top": 25, "width": 600, "fontSize": 24, "fontFamily": font_h, "fontWeight": "bold", "fill": "#ffffff", "selectable": False},
        {"type": "text", "text": tc.get("intro", ""), "left": 40, "top": 110, "width": 700, "fontSize": 13, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
        {"type": "text", "text": "Heading Typeface", "left": 40, "top": 165, "width": 400, "fontSize": 14, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": font_h, "left": 40, "top": 195, "width": 680, "fontSize": 48, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": "Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm", "left": 40, "top": 255, "width": 680, "fontSize": 18, "fontFamily": font_h, "fill": INK_SOFT, "selectable": False},
        {"type": "text", "text": tc.get("headingDesc", ""), "left": 40, "top": 290, "width": 680, "fontSize": 12, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
        {"type": "rect", "left": 40, "top": 340, "width": A4_W - 80, "height": 1, "fill": primary, "opacity": 0.3, "selectable": False},
        {"type": "text", "text": "Body Typeface", "left": 40, "top": 360, "width": 400, "fontSize": 14, "fontFamily": font_h, "fontWeight": "bold", "fill": text_col, "selectable": False},
        {"type": "text", "text": font_b, "left": 40, "top": 390, "width": 680, "fontSize": 36, "fontFamily": font_b, "fill": text_col, "selectable": False},
        {"type": "text", "text": "Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm", "left": 40, "top": 440, "width": 680, "fontSize": 18, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
        {"type": "text", "text": tc.get("bodyDesc", ""), "left": 40, "top": 475, "width": 680, "fontSize": 12, "fontFamily": font_b, "fill": INK_SOFT, "selectable": False},
    ]
    return {"background": bg, "objects": objects, "aiSpec": True}


def _make_rules_page(inp: dict, content: dict) -> dict:
    p = inp.get("palette", {})
    primary = p.get("primary", "#6366f1")
    accent = p.get("accent", "#e94560")
    bg = p.get("background", IVORY)
    text_col = p.get("text", INK)
    font_h = inp.get("fonts", {}).get("heading", "Georgia")
    font_b = inp.get("fonts", {}).get("body", "Inter")
    rules = content.get("rules", {})
    dos = rules.get("dos", [])
    donts = rules.get("donts", [])

    objects = [
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": A4_H, "fill": bg, "selectable": False},
        {"type": "rect", "left": 0, "top": 0, "width": A4_W, "height": 80, "fill": primary, "selectable": False},
        {"type": "text", "text": "BRAND RULES", "left": 40, "top": 25, "width": 600, "fontSize": 24, "fontFamily": font_h, "fontWeight": "bold", "fill": "#ffffff", "selectable": False},
        {"type": "text", "text": "DO", "left": 60, "top": 110, "width": 300, "fontSize": 20, "fontFamily": font_h, "fontWeight": "bold", "fill": primary, "selectable": False},
        {"type": "text", "text": "DON'T", "left": 420, "top": 110, "width": 300, "fontSize": 20, "fontFamily": font_h, "fontWeight": "bold", "fill": accent, "selectable": False},
    ]

    for i, rule in enumerate(dos[:5]):
        y = 155 + i * 65
        objects += [
            {"type": "rect", "left": 40, "top": y, "width": 320, "height": 55, "fill": primary, "opacity": 0.08, "rx": 6, "selectable": False},
            {"type": "text", "text": rule, "left": 55, "top": y + 10, "width": 295, "fontSize": 11, "fontFamily": font_b, "fill": text_col, "selectable": False},
        ]

    for i, rule in enumerate(donts[:5]):
        y = 155 + i * 65
        objects += [
            {"type": "rect", "left": 400, "top": y, "width": 320, "height": 55, "fill": accent, "opacity": 0.08, "rx": 6, "selectable": False},
            {"type": "text", "text": rule, "left": 415, "top": y + 10, "width": 295, "fontSize": 11, "fontFamily": font_b, "fill": text_col, "selectable": False},
        ]

    return {"background": bg, "objects": objects, "aiSpec": True}


def generate_brand_book_pages(inp: dict) -> list:
    content = _generate_book_content(inp)
    pages = [
        {"name": "Cover", "preset": "a4", "width": A4_W, "height": A4_H, "canvasData": _make_cover_page(inp, content)},
        {"name": "Brand Overview", "preset": "a4", "width": A4_W, "height": A4_H, "canvasData": _make_overview_page(inp, content)},
        {"name": "Logo System", "preset": "a4", "width": A4_W, "height": A4_H, "canvasData": _make_logo_page(inp, content)},
        {"name": "Color Palette", "preset": "a4", "width": A4_W, "height": A4_H, "canvasData": _make_color_page(inp, content)},
        {"name": "Typography", "preset": "a4", "width": A4_W, "height": A4_H, "canvasData": _make_typography_page(inp, content)},
        {"name": "Brand Rules", "preset": "a4", "width": A4_W, "height": A4_H, "canvasData": _make_rules_page(inp, content)},
    ]
    return pages
