"""AI Agent router — understands user intent and executes brand/marketing tools."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
import base64

from routers.deps import require_auth
from lib.db import DB
from lib.ai import (
    get_client, TEXT_MODEL, _parse_json_response,
    generate_brand_kit, generate_campaign,
    generate_image_with_references,
)

router = APIRouter()

# ── System prompt ──────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are Brand Architect AI Pro — an expert brand identity and marketing agent.
You help users create complete brands, campaigns, and visual content using AI.

AVAILABLE TOOLS:
1. create_brand — Create a new brand project in the system
   Required params: company_name, description, industry
   Optional: website

2. generate_brand_kit — Generate a complete AI brand identity (colors, personality, taglines)
   Required params: brand_id (integer)

3. generate_campaign — Create a multi-day marketing campaign
   Required params: brand_id (integer), strategy (campaign theme/brief)
   Optional: days (integer, default 7)

4. list_brands — Show the user's existing brand projects
   No params needed

5. generate_image — Generate an AI image
   Required params: prompt (detailed image description)

RESPONSE — always output ONLY valid JSON, no markdown:
{
  "reply": "Your conversational response in the same language as the user",
  "tool": null | "create_brand" | "generate_brand_kit" | "generate_campaign" | "list_brands" | "generate_image",
  "tool_params": null | { ...params },
  "needs_info": null | ["specific question 1", "question 2"]
}

BEHAVIOR RULES:
- Detect language from user message — respond in ARABIC if they write Arabic, ENGLISH if English
- Be warm, professional, and encouraging
- If a tool needs info you don't have yet → set needs_info with specific questions (max 2 at a time)
- Only set tool + tool_params when you have ALL required information
- After creating a brand, suggest generating the brand kit next
- After generating a kit, suggest creating a campaign
- If user mentions a brand name/idea, ask for description and industry before creating
- brand_id values come from previous tool results visible in the conversation
- For generate_image: craft a detailed, professional image generation prompt from the user's idea
"""

# ── Models ─────────────────────────────────────────────────────────────────────

class AgentMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str

class AgentChatRequest(BaseModel):
    messages: list[AgentMessage]

# ── Gemini call ────────────────────────────────────────────────────────────────

def _call_agent(messages: list[dict]) -> dict:
    client = get_client()
    resp = client.chat.completions.create(
        model=TEXT_MODEL,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages],
        temperature=0.7,
        max_tokens=1024,
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        return _parse_json_response(raw)
    except Exception:
        return {"reply": raw, "tool": None, "tool_params": None, "needs_info": None}

# ── Tool execution ─────────────────────────────────────────────────────────────

def _execute(tool: str, params: dict, user_id: str) -> dict:
    if tool == "list_brands":
        with DB() as db:
            rows = db.fetchall(
                "SELECT id, company_name, industry, status, logo_url FROM brands WHERE user_id = %s ORDER BY created_at DESC LIMIT 10",
                (user_id,),
            )
        return {
            "type": "brands_list",
            "brands": [
                {"id": r["id"], "name": r["company_name"], "industry": r["industry"],
                 "status": r["status"], "logoUrl": r.get("logo_url")}
                for r in (rows or [])
            ],
        }

    if tool == "create_brand":
        name = (params.get("company_name") or "").strip()
        desc = (params.get("description") or "").strip()
        ind  = (params.get("industry") or "").strip()
        site = params.get("website") or None
        if not name or not desc or not ind:
            raise ValueError("Missing required brand info (name / description / industry)")
        with DB() as db:
            brand = db.fetchone(
                "INSERT INTO brands (user_id, company_name, company_description, industry, website_url, status) "
                "VALUES (%s,%s,%s,%s,%s,'draft') RETURNING id, company_name, industry, status",
                (user_id, name, desc, ind, site),
            )
        return {
            "type": "brand_created",
            "brand": {"id": brand["id"], "name": brand["company_name"],
                      "industry": brand["industry"], "status": brand["status"]},
        }

    if tool == "generate_brand_kit":
        brand_id = int(params.get("brand_id", 0))
        with DB() as db:
            brand = db.fetchone("SELECT * FROM brands WHERE id=%s AND user_id=%s", (brand_id, user_id))
        if not brand:
            raise ValueError(f"Brand {brand_id} not found")
        kit = generate_brand_kit(dict(brand))
        with DB() as db:
            db.execute(
                "UPDATE brands SET brand_kit=%s, status='kit_ready' WHERE id=%s AND user_id=%s",
                (json.dumps(kit), brand_id, user_id),
            )
        return {
            "type": "brand_kit_generated",
            "brandId": brand_id,
            "brandName": brand["company_name"],
            "kit": {
                "personality": kit.get("personality", ""),
                "toneOfVoice": kit.get("toneOfVoice", ""),
                "colorPalette": kit.get("colorPalette", {}),
                "taglines": (kit.get("taglines") or [])[:3],
            },
        }

    if tool == "generate_campaign":
        brand_id = int(params.get("brand_id", 0))
        strategy = params.get("strategy", "general marketing")
        days = min(int(params.get("days", 7)), 14)
        with DB() as db:
            brand = db.fetchone("SELECT * FROM brands WHERE id=%s AND user_id=%s", (brand_id, user_id))
        if not brand:
            raise ValueError(f"Brand {brand_id} not found")
        campaign_data = generate_campaign(
            brand=dict(brand), brief=strategy,
            post_count=days, platforms=["instagram", "twitter"],
            trends_summary="",
        )
        title = campaign_data.get("title") or f"{brand['company_name']} Campaign"
        with DB() as db:
            campaign = db.fetchone(
                "INSERT INTO campaigns (brand_id, title, strategy, days, posts, status) "
                "VALUES (%s,%s,%s,%s,%s,'draft') RETURNING id, title",
                (brand_id, title, strategy,
                 json.dumps(campaign_data.get("days", [])),
                 json.dumps(campaign_data.get("posts", []))),
            )
        return {
            "type": "campaign_created",
            "campaign": {"id": campaign["id"], "title": campaign["title"],
                         "brandId": brand_id, "daysCount": days},
        }

    if tool == "generate_image":
        prompt = params.get("prompt", "")
        img_bytes = generate_image_with_references(prompt, [])
        return {
            "type": "image_generated",
            "imageData": f"data:image/png;base64,{base64.b64encode(img_bytes).decode()}",
            "prompt": prompt,
        }

    return {"type": "unknown", "tool": tool}

# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/agent/chat")
def agent_chat(body: AgentChatRequest, user_id: str = Depends(require_auth)):
    try:
        messages = [{"role": m.role, "content": m.content} for m in body.messages]
        parsed = _call_agent(messages)

        reply      = parsed.get("reply", "")
        tool       = parsed.get("tool")
        tool_params = parsed.get("tool_params") or {}
        needs_info = parsed.get("needs_info")

        tool_result = None
        if tool and not needs_info:
            try:
                tool_result = _execute(tool, tool_params, user_id)
            except Exception as e:
                tool_result = {"type": "error", "message": str(e)}

        return {"reply": reply, "tool": tool, "toolResult": tool_result, "needsInfo": needs_info}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
