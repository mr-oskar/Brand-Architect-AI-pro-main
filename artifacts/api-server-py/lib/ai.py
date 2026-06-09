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
