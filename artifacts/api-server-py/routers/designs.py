import json
import base64
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
from lib.db import DB
from lib.ai import (
    generate_image_with_references,
    generate_design_layout,
    smart_generate_design,
    analyze_image_for_design,
    ai_edit_canvas,
)
from lib.image_storage import upload_image_buffer, storage_path_to_url, is_storage_path
from lib.credits import charge_credits, InsufficientCreditsError
from .deps import require_auth

router = APIRouter()


def _format_design(d: dict) -> dict:
    if is_storage_path(d.get("previewUrl")):
        d["previewUrl"] = storage_path_to_url(d["previewUrl"])
    return d


@router.get("/designs")
def list_designs(brand_id: Optional[int] = None, user_id: str = Depends(require_auth)):
    with DB() as db:
        if brand_id:
            rows = db.fetchall(
                "SELECT * FROM designs WHERE user_id = %s AND brand_id = %s ORDER BY created_at DESC",
                (user_id, brand_id),
            )
        else:
            rows = db.fetchall(
                "SELECT * FROM designs WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
    return [_format_design(r) for r in rows]


@router.get("/designs/{design_id}")
def get_design(design_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        d = db.fetchone(
            "SELECT * FROM designs WHERE id = %s AND user_id = %s", (design_id, user_id)
        )
    if not d:
        raise HTTPException(404, "Design not found")
    return _format_design(d)


class CreateDesignBody(BaseModel):
    brandId: Optional[int] = None
    name: Optional[str] = "Untitled Design"
    canvasData: Optional[Any] = None
    width: Optional[int] = 794
    height: Optional[int] = 1123
    preset: Optional[str] = "a4"
    previewUrl: Optional[str] = None


@router.post("/designs")
def create_design(body: CreateDesignBody, user_id: str = Depends(require_auth)):
    with DB() as db:
        d = db.fetchone(
            """
            INSERT INTO designs (brand_id, user_id, name, canvas_data, width, height, preset, preview_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                body.brandId,
                user_id,
                body.name or "Untitled Design",
                json.dumps(body.canvasData) if body.canvasData else None,
                body.width or 794,
                body.height or 1123,
                body.preset or "a4",
                body.previewUrl,
            ),
        )
    return _format_design(d)


class UpdateDesignBody(BaseModel):
    name: Optional[str] = None
    canvasData: Optional[Any] = None
    width: Optional[int] = None
    height: Optional[int] = None
    preset: Optional[str] = None
    previewUrl: Optional[str] = None


@router.patch("/designs/{design_id}")
def update_design(design_id: int, body: UpdateDesignBody, user_id: str = Depends(require_auth)):
    updates, params = [], []
    if body.name is not None:
        updates.append("name = %s"); params.append(body.name)
    if body.canvasData is not None:
        updates.append("canvas_data = %s"); params.append(json.dumps(body.canvasData))
    if body.width is not None:
        updates.append("width = %s"); params.append(body.width)
    if body.height is not None:
        updates.append("height = %s"); params.append(body.height)
    if body.preset is not None:
        updates.append("preset = %s"); params.append(body.preset)
    if body.previewUrl is not None:
        updates.append("preview_url = %s"); params.append(body.previewUrl)
    if not updates:
        return get_design(design_id, user_id)
    updates.append("updated_at = NOW()")
    params.extend([design_id, user_id])
    with DB() as db:
        db.execute(f"UPDATE designs SET {', '.join(updates)} WHERE id = %s AND user_id = %s", params)
    return get_design(design_id, user_id)


@router.delete("/designs/{design_id}", status_code=204)
def delete_design(design_id: int, user_id: str = Depends(require_auth)):
    with DB() as db:
        db.execute("DELETE FROM designs WHERE id = %s AND user_id = %s", (design_id, user_id))


class PreviewBody(BaseModel):
    dataUrl: str


@router.post("/designs/{design_id}/preview")
def save_preview(design_id: int, body: PreviewBody, user_id: str = Depends(require_auth)):
    data_url = body.dataUrl
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    img_bytes = base64.b64decode(data_url)
    path = upload_image_buffer(img_bytes, "image/png")
    url = storage_path_to_url(path)
    with DB() as db:
        db.execute(
            "UPDATE designs SET preview_url = %s, updated_at = NOW() WHERE id = %s AND user_id = %s",
            (path, design_id, user_id),
        )
    return {"previewUrl": url}


class GenerateImageBody(BaseModel):
    prompt: str
    brandId: Optional[int] = None
    size: Optional[str] = "1024x1024"


@router.post("/designs/generate-image")
def design_generate_image(body: GenerateImageBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "design.generate-image")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    prompt = body.prompt
    if body.brandId:
        with DB() as db:
            brand = db.fetchone("SELECT company_name, industry, brand_kit FROM brands WHERE id = %s AND user_id = %s", (body.brandId, user_id))
        if brand:
            kit = brand.get("brandKit") or {}
            palette = kit.get("colorPalette") or {}
            primary = palette.get("primary", "")
            prompt += f" Brand: {brand.get('companyName', '')}. Industry: {brand.get('industry', '')}. Primary color: {primary}."

    size = body.size if body.size in {"1024x1024", "1024x1536", "1536x1024"} else "1024x1024"
    try:
        img_bytes = generate_image_with_references(prompt, size=size)
        path = upload_image_buffer(img_bytes)
        return {"imageUrl": storage_path_to_url(path), "path": path}
    except Exception as e:
        raise HTTPException(500, str(e))


class GenerateLayoutBody(BaseModel):
    brandId: Optional[int] = None
    prompt: Optional[str] = None
    style: Optional[str] = None


@router.post("/designs/generate-layout")
def design_generate_layout(body: GenerateLayoutBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "design.generate-layout")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    brand_name, style, colors = "Brand", "modern professional", {}
    if body.brandId:
        with DB() as db:
            brand = db.fetchone("SELECT company_name, brand_kit FROM brands WHERE id = %s AND user_id = %s", (body.brandId, user_id))
        if brand:
            brand_name = brand.get("companyName", "Brand")
            kit = brand.get("brandKit") or {}
            style = kit.get("visualStyle", style)
            colors = kit.get("colorPalette") or {}

    layout = generate_design_layout(brand_name, style, colors, body.prompt or "")
    return {"layout": layout}


class SmartGenerateBody(BaseModel):
    brandId: Optional[int] = None
    content: Optional[str] = None


@router.post("/designs/smart-generate")
def design_smart_generate(body: SmartGenerateBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "design.smart-generate")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    brand_name, style, colors = "Brand", "modern professional", {}
    if body.brandId:
        with DB() as db:
            brand = db.fetchone("SELECT company_name, brand_kit FROM brands WHERE id = %s AND user_id = %s", (body.brandId, user_id))
        if brand:
            brand_name = brand.get("companyName", "Brand")
            kit = brand.get("brandKit") or {}
            style = kit.get("visualStyle", style)
            colors = kit.get("colorPalette") or {}

    result = smart_generate_design(brand_name, style, colors, body.content or "")
    return result


class AnalyzeImageBody(BaseModel):
    imageBase64: str


@router.post("/designs/analyze-image")
def design_analyze_image(body: AnalyzeImageBody, user_id: str = Depends(require_auth)):
    b64 = body.imageBase64
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return analyze_image_for_design(b64)


class AiEditBody(BaseModel):
    canvasData: Any
    instruction: str
    brandName: Optional[str] = None


@router.post("/designs/ai-edit")
def design_ai_edit(body: AiEditBody, user_id: str = Depends(require_auth)):
    try:
        charge_credits(user_id, "design.ai-edit")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")
    result = ai_edit_canvas(body.canvasData, body.instruction, body.brandName or "")
    return {"canvasData": result}


class NewPageBody(BaseModel):
    brandId: int
    name: Optional[str] = None
    width: Optional[int] = 794
    height: Optional[int] = 1123
    preset: Optional[str] = "a4"


@router.post("/designs/new-page")
def new_page(body: NewPageBody, user_id: str = Depends(require_auth)):
    with DB() as db:
        brand = db.fetchone("SELECT id, brand_kit FROM brands WHERE id = %s AND user_id = %s", (body.brandId, user_id))
        if not brand:
            raise HTTPException(404, "Brand not found")
        count = db.fetchval("SELECT COUNT(*) FROM designs WHERE brand_id = %s AND user_id = %s", (body.brandId, user_id)) or 0
        name = body.name or f"Page {int(count) + 1}"
        w = body.width or 794
        h = body.height or 1123
        preset = body.preset or "a4"
        kit = brand.get("brandKit") or {}
        palette = kit.get("colorPalette") or {}
        background = palette.get("background", "#ffffff")
        blank = {"aiSpec": True, "background": background, "objects": [
            {"type": "rect", "left": 0, "top": 0, "width": w, "height": h, "fill": background, "opacity": 1}
        ]}
        d = db.fetchone(
            """
            INSERT INTO designs (brand_id, user_id, name, canvas_data, width, height, preset)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *
            """,
            (body.brandId, user_id, name, json.dumps(blank), w, h, preset),
        )
    return _format_design(d)


class GenerateBrandBookBody(BaseModel):
    brandId: int


@router.post("/designs/generate-brand-book", status_code=201)
def generate_brand_book(body: GenerateBrandBookBody, user_id: str = Depends(require_auth)):
    from lib.ai import generate_brand_book_pages
    try:
        charge_credits(user_id, "design.generate-brand-book")
    except InsufficientCreditsError:
        raise HTTPException(402, "Insufficient credits")

    with DB() as db:
        brand = db.fetchone("SELECT * FROM brands WHERE id = %s AND user_id = %s", (body.brandId, user_id))
        if not brand:
            raise HTTPException(404, "Brand not found")
        if not brand.get("brandKit"):
            raise HTTPException(400, "Generate the brand kit first")

        kit = brand.get("brandKit") or {}
        variants = brand.get("logoVariants") or {}
        palette = kit.get("colorPalette") or {}
        taglines = kit.get("taglines") or []

        pages = generate_brand_book_pages({
            "companyName": brand.get("companyName", ""),
            "industry": brand.get("industry", ""),
            "tagline": taglines[0] if taglines else f"{brand.get('companyName', '')} — Excellence in {brand.get('industry', '')}",
            "mission": kit.get("missionStatement"),
            "personality": kit.get("personality") if isinstance(kit.get("personality"), list) else None,
            "palette": {
                "primary": palette.get("primary", "#6366f1"),
                "secondary": palette.get("secondary", "#8b5cf6"),
                "accent": palette.get("accent", "#e94560"),
                "background": palette.get("background", "#FFFFF0"),
                "text": palette.get("text", "#1a1a2e"),
                "surface": palette.get("surface"),
                "neutral": palette.get("neutral", "#6B7280"),
            },
            "fonts": {
                "heading": (kit.get("typographyRecommendations") or {}).get("heading") or "Georgia",
                "body": (kit.get("typographyRecommendations") or {}).get("body") or "Inter",
            },
            "logoUrl": brand.get("logoUrl"),
            "logoVariants": variants,
        })

        inserted = []
        for p in pages:
            d = db.fetchone(
                """INSERT INTO designs (brand_id, user_id, name, canvas_data, width, height, preset)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (body.brandId, user_id, p["name"], json.dumps(p["canvasData"]), p["width"], p["height"], p["preset"]),
            )
            inserted.append(_format_design(d))

    return {"designs": inserted}
