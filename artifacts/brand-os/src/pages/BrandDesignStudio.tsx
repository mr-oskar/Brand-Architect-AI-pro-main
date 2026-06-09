import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useGetBrand } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import {
  ArrowLeft, Download, Undo2, Redo2, ZoomIn, ZoomOut, Wand2, Loader2,
  Type, Square, Circle, Minus, Trash2,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, Copy, Save,
  Plus, Palette, Sparkles, ChevronDown,
  X, LayoutTemplate, RefreshCw, Upload, ChevronRight, ChevronLeft,
  Triangle, Star, MousePointer, Lock, Unlock,
  MoveUp, MoveDown, ImagePlus, Paintbrush,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Maximize2, FileText, FileImage, FileType, Check,
  Brain, Layers, Scan, MessageSquare, ChevronUp, Link,
  Eye, Info, Cpu, Pencil, ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractApiError, notifyError, notifySuccess } from "@/lib/apiError";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandKit {
  colorPalette?: { primary?: string; secondary?: string; accent?: string; background?: string; text?: string; surface?: string };
  taglines?: string[];
  missionStatement?: string;
  typographyRecommendations?: { heading?: string; body?: string };
  personality?: string[];
}

interface LogoVariants { original?: string; black?: string; white?: string; grayscale?: string }

interface CanvasPreset { id: string; label: string; width: number; height: number }

interface ColorPalette {
  primary: string; secondary: string; accent: string;
  background: string; text: string; surface: string;
}

interface SelectedProps {
  left?: number; top?: number; width?: number; height?: number;
  angle?: number; opacity?: number; fill?: string; fontSize?: number;
  fontFamily?: string; fontWeight?: string; fontStyle?: string;
  textAlign?: string; type?: string; lockMovementX?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESETS: CanvasPreset[] = [
  { id: "a4",               label: "A4 (Portrait)",    width: 794,  height: 1123 },
  { id: "business-card",    label: "Business Card",     width: 680,  height: 400  },
  { id: "instagram-post",   label: "Instagram Post",    width: 1080, height: 1080 },
  { id: "instagram-story",  label: "Instagram Story",   width: 1080, height: 1920 },
  { id: "banner",           label: "Web Banner",        width: 1200, height: 400  },
  { id: "fb-cover",         label: "Facebook Cover",    width: 1200, height: 628  },
  { id: "custom",           label: "Custom",            width: 800,  height: 600  },
];

const FONT_FAMILIES = [
  "Inter", "Georgia", "Arial", "Helvetica", "Times New Roman",
  "Courier New", "Verdana", "Trebuchet MS", "Roboto", "Montserrat",
];

function defaultPalette(kit?: BrandKit): ColorPalette {
  return {
    primary:    kit?.colorPalette?.primary    || "#6366f1",
    secondary:  kit?.colorPalette?.secondary  || "#8b5cf6",
    accent:     kit?.colorPalette?.accent     || "#f59e0b",
    background: kit?.colorPalette?.background || "#ffffff",
    text:       kit?.colorPalette?.text       || "#1a1a2e",
    surface:    kit?.colorPalette?.surface    || "#f8fafc",
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BrandDesignStudio() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const brandId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const { data: brand, isLoading } = useGetBrand(brandId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Suppress history capture while we programmatically mutate the canvas
  // (loading a saved design, restoring an undo frame, applying an AI spec).
  // Without this, every object:added fired during a load would fork the
  // history stack and corrupt undo/redo.
  const suppressHistoryRef = useRef(false);
  // Remember whether the currently-loaded design was created by the AI
  // brand-book builder. We need to re-attach the marker on save so the page
  // stays part of the brand-book navigation strip after edits.
  const loadedAiSpecRef = useRef(false);
  // True once the canvas has been auto-fit on first mount, so re-measures
  // don't keep jumping the user's zoom around.
  const didInitialFitRef = useRef(false);
  const hasUnsavedChangesRef = useRef(false);

  const [fabric, setFabric] = useState<any>(null);
  const [fabricLoaded, setFabricLoaded] = useState(false);
  const [selectedObj, setSelectedObj] = useState<any>(null);
  const [selectedProps, setSelectedProps] = useState<SelectedProps>({});
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyLen, setHistoryLen] = useState(0);

  const [zoom, setZoom] = useState(0.6);
  const [preset, setPreset] = useState<CanvasPreset>(PRESETS[0]);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<"images" | "elements" | "text" | "brand" | "ai">("images");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const [logoVariants, setLogoVariants] = useState<LogoVariants>({});
  const [genVariants, setGenVariants] = useState(false);
  const [variantErr, setVariantErr] = useState<string | null>(null);

  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAIPrompt] = useState("");
  const [aiGenerating, setAIGenerating] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);

  const [showImgDialog, setShowImgDialog] = useState(false);
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgSize, setImgSize] = useState<"1024x1024" | "1024x1536" | "1536x1024">("1024x1024");
  const [imgGenerating, setImgGenerating] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgResult, setImgResult] = useState<string | null>(null);

  // ── Smart Design Workflow state ────────────────────────────────────────────
  const [smartStep, setSmartStep] = useState<"input" | "thinking" | "result">("input");
  const [smartInput, setSmartInput] = useState("");
  const [smartGenerating, setSmartGenerating] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartResult, setSmartResult] = useState<{
    detectedIndustry?: string;
    detectedStyle?: string;
    detectedLayout?: string;
    internalPrompt?: string;
    designDescription?: string;
    layerExplanation?: Array<{ index: number; type: string; purpose: string; color: string; opacity: number; zIndex: number }>;
    layout?: any;
  } | null>(null);

  // ── Image → Editable Layers state ──────────────────────────────────────────
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false);
  const [analyzeImageUrl, setAnalyzeImageUrl] = useState("");
  const [analyzeProcessing, setAnalyzeProcessing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<{
    colorSystem?: Record<string, string>;
    layoutStructure?: string;
    typographyStyle?: string;
    designAnalysis?: string;
    layers?: any[];
    fabricLayout?: any;
  } | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeStep, setAnalyzeStep] = useState<"input" | "result">("input");

  // ── AI Edit Command state ───────────────────────────────────────────────────
  const [aiEditCommand, setAIEditCommand] = useState("");
  const [aiEditProcessing, setAIEditProcessing] = useState(false);
  const [aiEditError, setAIEditError] = useState<string | null>(null);
  const [aiEditSuccess, setAIEditSuccess] = useState(false);

  const [saving, setSaving] = useState(false);
  const [designId, setDesignId] = useState<number | null>(null);
  const [designName, setDesignName] = useState("Untitled Design");
  const [loadedDesignId, setLoadedDesignId] = useState<number | null>(null);
  const [siblingPages, setSiblingPages] = useState<Array<{ id: number; name: string }>>([]);
  const [navigatingPage, setNavigatingPage] = useState(false);

  const kit = (brand?.brandKit as BrandKit | undefined) || {};
  const palette = defaultPalette(kit);
  const logoUrl = brand?.logoUrl || undefined;

  // ─── Load Fabric ──────────────────────────────────────────────────────────

  useEffect(() => {
    import("fabric").then((fab) => { setFabric(fab); setFabricLoaded(true); });
  }, []);

  // ─── Init Canvas ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!fabricLoaded || !fabric || !canvasRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, {
      backgroundColor: bgColor,
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
    });
    canvas.setDimensions({ width: Math.round(preset.width * zoom), height: Math.round(preset.height * zoom) });
    canvas.setZoom(zoom);
    fabricRef.current = canvas;

    canvas.on("selection:created", (e: any) => { const o = e.selected?.[0]; setSelectedObj(o); syncProps(o); });
    canvas.on("selection:updated", (e: any) => { const o = e.selected?.[0]; setSelectedObj(o); syncProps(o); });
    canvas.on("selection:cleared", () => { setSelectedObj(null); setSelectedProps({}); });
    canvas.on("object:modified", () => { const o = canvas.getActiveObject(); if (o) syncProps(o); pushHistory(canvas); });
    canvas.on("object:added", () => pushHistory(canvas));
    canvas.on("object:removed", () => pushHistory(canvas));
    pushHistory(canvas);

    // Auto-fit the empty A4 canvas to the available viewport on first mount.
    // The container needs a paint cycle to measure, so defer with rAF; only
    // run once so subsequent panel toggles don't yank the user's zoom around.
    requestAnimationFrame(() => {
      if (didInitialFitRef.current) return;
      const c = canvasContainerRef.current;
      if (!c || c.clientWidth === 0 || c.clientHeight === 0) return;
      didInitialFitRef.current = true;
      const z = computeFitZoom(preset.width, preset.height);
      setZoom(z);
      canvas.setDimensions({ width: Math.round(preset.width * z), height: Math.round(preset.height * z) });
      canvas.setZoom(z);
      canvas.renderAll();
    });

    return () => { canvas.dispose(); fabricRef.current = null; };
  }, [fabricLoaded, fabric]);

  // ─── Load brand logo variants ─────────────────────────────────────────────

  useEffect(() => {
    const b = brand as any;
    if (b?.logoVariants) setLogoVariants(b.logoVariants as LogoVariants);
  }, [brand]);

  // ─── History ──────────────────────────────────────────────────────────────

  const pushHistory = useCallback((canvas: any) => {
    // Skip while we're programmatically rebuilding the scene — otherwise every
    // object added during a load would create a new history frame and clobber
    // the redo stack, making undo/redo behave erratically.
    if (suppressHistoryRef.current) return;
    const json = JSON.stringify(canvas.toJSON());
    // Avoid adjacent duplicate frames (some Fabric internals emit object:added
    // for swap-style edits that don't actually change the JSON).
    const last = historyRef.current[historyIndexRef.current];
    if (last === json) return;
    const sliced = historyRef.current.slice(0, historyIndexRef.current + 1);
    const next = [...sliced, json].slice(-60);
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    setHistoryIndex(next.length - 1);
    setHistoryLen(next.length);
    hasUnsavedChangesRef.current = true;
  }, []);

  // Replace the canvas with the JSON at `idx` without polluting history.
  // Fabric v7's loadFromJSON returns a Promise; the second argument is a
  // per-object reviver, NOT a completion callback (the v4/v5 signature) — so
  // the previous code was firing the "callback" once per loaded object.
  const restoreHistoryAt = useCallback(async (idx: number) => {
    if (!fabricRef.current) return;
    suppressHistoryRef.current = true;
    try {
      await fabricRef.current.loadFromJSON(JSON.parse(historyRef.current[idx]));
      fabricRef.current.renderAll();
      historyIndexRef.current = idx;
      setHistoryIndex(idx);
      // Clear stale selection so the right-panel doesn't reference a now-gone obj.
      fabricRef.current.discardActiveObject?.();
      setSelectedObj(null);
      setSelectedProps({});
    } finally {
      suppressHistoryRef.current = false;
    }
  }, []);

  const undo = useCallback(() => {
    if (!fabricRef.current || historyIndexRef.current <= 0) return;
    void restoreHistoryAt(historyIndexRef.current - 1);
  }, [restoreHistoryAt]);

  const redo = useCallback(() => {
    if (!fabricRef.current || historyIndexRef.current >= historyRef.current.length - 1) return;
    void restoreHistoryAt(historyIndexRef.current + 1);
  }, [restoreHistoryAt]);

  // ─── Sync properties ──────────────────────────────────────────────────────

  function syncProps(obj: any) {
    if (!obj) return;
    setSelectedProps({
      left: Math.round(obj.left), top: Math.round(obj.top),
      width: Math.round(obj.getScaledWidth()), height: Math.round(obj.getScaledHeight()),
      angle: Math.round(obj.angle || 0), opacity: obj.opacity ?? 1,
      fill: typeof obj.fill === "string" ? obj.fill : "#000000",
      fontSize: obj.fontSize, fontFamily: obj.fontFamily,
      fontWeight: obj.fontWeight, fontStyle: obj.fontStyle,
      textAlign: obj.textAlign, type: obj.type,
      lockMovementX: obj.lockMovementX,
    });
  }

  function applyProp(key: string, value: unknown) {
    if (!selectedObj || !fabricRef.current) return;
    selectedObj.set(key, value);
    fabricRef.current.renderAll();
    syncProps(selectedObj);
    setSelectedProps((p) => ({ ...p, [key]: value }));
  }

  // ─── Zoom / Preset ────────────────────────────────────────────────────────

  // Compute the zoom that makes the design fully visible inside the available
  // canvas viewport (with a small breathing margin). Falls back to 0.6 if the
  // container hasn't measured yet.
  const computeFitZoom = useCallback((targetWidth: number, targetHeight: number): number => {
    const container = canvasContainerRef.current;
    if (!container) return 0.6;
    const padding = 80; // matches p-10 frame
    const availW = Math.max(50, container.clientWidth - padding);
    const availH = Math.max(50, container.clientHeight - padding);
    const z = Math.min(availW / targetWidth, availH / targetHeight);
    return Math.max(0.1, Math.min(2, z));
  }, []);

  function setCanvasSize(p: CanvasPreset, z: number) {
    if (!fabricRef.current) return;
    fabricRef.current.setDimensions({ width: Math.round(p.width * z), height: Math.round(p.height * z) });
    fabricRef.current.setZoom(z);
    fabricRef.current.renderAll();
  }

  function applyPreset(p: CanvasPreset) {
    setPreset(p); setShowPresetMenu(false);
    if (!fabricRef.current) return;
    const z = computeFitZoom(p.width, p.height);
    setZoom(z);
    setCanvasSize(p, z);
  }

  function changeZoom(delta: number) {
    const z = Math.min(3, Math.max(0.1, zoom + delta));
    setZoom(z);
    setCanvasSize(preset, z);
  }

  function fitToScreen() {
    const z = computeFitZoom(preset.width, preset.height);
    setZoom(z);
    setCanvasSize(preset, z);
  }

  function zoomTo100() {
    setZoom(1);
    setCanvasSize(preset, 1);
  }

  // ─── Add Elements ─────────────────────────────────────────────────────────

  function addRect() {
    if (!fabric || !fabricRef.current) return;
    const r = new fabric.Rect({ left: 100, top: 100, width: 200, height: 120, fill: palette.primary, rx: 8 });
    fabricRef.current.add(r); fabricRef.current.setActiveObject(r); fabricRef.current.renderAll();
  }

  function addCircle() {
    if (!fabric || !fabricRef.current) return;
    const c = new fabric.Circle({ left: 150, top: 150, radius: 60, fill: palette.secondary });
    fabricRef.current.add(c); fabricRef.current.setActiveObject(c); fabricRef.current.renderAll();
  }

  function addTriangle() {
    if (!fabric || !fabricRef.current) return;
    const t = new fabric.Triangle({ left: 150, top: 150, width: 100, height: 100, fill: palette.accent });
    fabricRef.current.add(t); fabricRef.current.setActiveObject(t); fabricRef.current.renderAll();
  }

  function addLine() {
    if (!fabric || !fabricRef.current) return;
    const l = new fabric.Line([0, 0, 300, 0], { left: 100, top: 200, stroke: palette.primary, strokeWidth: 3 });
    fabricRef.current.add(l); fabricRef.current.setActiveObject(l); fabricRef.current.renderAll();
  }

  // Fabric v7 doesn't ship a Star primitive, so we build a 5-point star out of
  // a Polygon. Computes the alternating outer/inner radius vertices around the
  // origin then lets Fabric handle positioning via left/top.
  function addStar() {
    if (!fabric || !fabricRef.current) return;
    const numPoints = 5;
    const outerR = 60;
    const innerR = 26;
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < numPoints * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      // Start at the top (-90°) so the star points up.
      const a = (Math.PI * i) / numPoints - Math.PI / 2;
      points.push({ x: outerR + r * Math.cos(a), y: outerR + r * Math.sin(a) });
    }
    const star = new fabric.Polygon(points, {
      left: 150, top: 150, fill: palette.accent,
      originX: "left", originY: "top",
    });
    fabricRef.current.add(star);
    fabricRef.current.setActiveObject(star);
    fabricRef.current.renderAll();
  }

  function addText(txt: string, size = 32, weight = "bold", color = palette.text) {
    if (!fabric || !fabricRef.current) return;
    const t = new fabric.IText(txt, {
      left: 100, top: 100, fontSize: size, fill: color,
      fontFamily: kit.typographyRecommendations?.heading || "Inter",
      fontWeight: weight as any,
    });
    fabricRef.current.add(t); fabricRef.current.setActiveObject(t); fabricRef.current.renderAll();
  }

  function addGradientBackground() {
    if (!fabric || !fabricRef.current) return;
    const grad = new fabric.Gradient({
      type: "linear",
      coords: { x1: 0, y1: 0, x2: preset.width, y2: preset.height },
      colorStops: [{ offset: 0, color: palette.primary }, { offset: 1, color: palette.secondary }],
    });
    const r = new fabric.Rect({ left: 0, top: 0, width: preset.width, height: preset.height, fill: grad });
    fabricRef.current.add(r);
    fabricRef.current.sendObjectToBack(r);
    fabricRef.current.renderAll();
  }

  function addImageFromUrl(src: string) {
    if (!fabric || !fabricRef.current) return;
    fabric.FabricImage.fromURL(src, { crossOrigin: "anonymous" }).then((img: any) => {
      const maxW = 300;
      if ((img.width || 0) > maxW) img.scale(maxW / (img.width || maxW));
      img.set({ left: 80, top: 80 });
      fabricRef.current.add(img);
      fabricRef.current.setActiveObject(img);
      fabricRef.current.renderAll();
    });
  }

  function handleLocalImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !fabric || !fabricRef.current) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      addImageFromUrl(src);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function deleteSelected() {
    if (!fabricRef.current) return;
    const obj = fabricRef.current.getActiveObject();
    if (obj) { fabricRef.current.remove(obj); fabricRef.current.discardActiveObject(); fabricRef.current.renderAll(); setSelectedObj(null); setSelectedProps({}); }
  }

  function duplicateSelected() {
    if (!fabricRef.current || !selectedObj) return;
    selectedObj.clone().then((c: any) => {
      c.set({ left: (selectedObj.left || 0) + 20, top: (selectedObj.top || 0) + 20 });
      fabricRef.current.add(c); fabricRef.current.setActiveObject(c); fabricRef.current.renderAll();
    });
  }

  function toggleLock() {
    if (!selectedObj || !fabricRef.current) return;
    const locked = selectedObj.lockMovementX;
    selectedObj.set({ lockMovementX: !locked, lockMovementY: !locked, lockScalingX: !locked, lockScalingY: !locked });
    fabricRef.current.renderAll();
    syncProps(selectedObj);
  }

  function bringForward() {
    if (!selectedObj || !fabricRef.current) return;
    fabricRef.current.bringObjectForward(selectedObj); fabricRef.current.renderAll();
  }

  function sendBackward() {
    if (!selectedObj || !fabricRef.current) return;
    fabricRef.current.sendObjectBackwards(selectedObj); fabricRef.current.renderAll();
  }

  function applyBgColor(color: string) {
    setBgColor(color);
    if (!fabricRef.current) return;
    fabricRef.current.set("backgroundColor", color);
    fabricRef.current.renderAll();
  }

  // ─── Logo Variants ────────────────────────────────────────────────────────

  async function generateVariants() {
    setGenVariants(true); setVariantErr(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/generate-logo-variants`, { method: "POST" });
      if (!res.ok) throw new Error(await extractApiError(res, "Logo variants generation failed"));
      const data = await res.json();
      setLogoVariants(data.logoVariants);
      queryClient.invalidateQueries({ queryKey: [`/api/brands/${brandId}`] });
      notifySuccess("Logo variants generated", "Your logo variants are ready.");
    } catch (err) {
      setVariantErr(err instanceof Error ? err.message : "Failed");
      notifyError("Logo variants generation failed", err);
    } finally { setGenVariants(false); }
  }

  // ─── Apply AI spec layout (used by AI generator + saved design loader) ────

  const applySpecToCanvas = useCallback(async (layout: any) => {
    if (!fabricRef.current || !fabric) return;
    // Suppress history capture for the entire bulk load so a 20-object AI
    // layout doesn't produce 20 garbage history frames.
    suppressHistoryRef.current = true;
    try {
    fabricRef.current.clear();
    if (layout.background && layout.background !== "transparent") {
      fabricRef.current.set("backgroundColor", layout.background);
      setBgColor(layout.background);
    }
    if (!Array.isArray(layout.objects)) { fabricRef.current.renderAll(); return; }

    for (const obj of layout.objects) {
      if (obj.type === "rect") {
        fabricRef.current.add(new fabric.Rect({
          left: obj.left || 0, top: obj.top || 0, width: obj.width || 100, height: obj.height || 50,
          fill: obj.fill || "#e5e7eb", rx: obj.rx ?? 0, opacity: obj.opacity ?? 1,
          stroke: obj.stroke, strokeWidth: obj.strokeWidth ?? 0,
        }));
      } else if (obj.type === "circle") {
        fabricRef.current.add(new fabric.Circle({
          left: obj.left || 0, top: obj.top || 0, radius: obj.radius ?? (obj.width || 100) / 2,
          fill: obj.fill || "#e5e7eb", opacity: obj.opacity ?? 1,
          stroke: obj.stroke, strokeWidth: obj.strokeWidth ?? 0,
        }));
      } else if (obj.type === "line") {
        fabricRef.current.add(new fabric.Line(
          [obj.left || 0, obj.top || 0, (obj.left || 0) + (obj.width || 0), (obj.top || 0) + (obj.height || 0)],
          { stroke: obj.stroke || "#000", strokeWidth: obj.strokeWidth ?? 1, opacity: obj.opacity ?? 1 }
        ));
      } else if (obj.type === "text") {
        const aiTxtContent = String(obj.text || "Text");
        const aiTxtObj = obj.width
          ? new fabric.Textbox(aiTxtContent, {
              left: obj.left || 0, top: obj.top || 0, width: obj.width,
              fontSize: obj.fontSize || 24, fill: obj.fill || "#1a1a2e",
              fontFamily: obj.fontFamily || "Inter", fontWeight: obj.fontWeight || "normal",
              fontStyle: obj.fontStyle || "normal",
              textAlign: (obj.textAlign || "left") as any, opacity: obj.opacity ?? 1,
              splitByGrapheme: false,
            })
          : new fabric.IText(aiTxtContent, {
              left: obj.left || 0, top: obj.top || 0,
              fontSize: obj.fontSize || 24, fill: obj.fill || "#1a1a2e",
              fontFamily: obj.fontFamily || "Inter", fontWeight: obj.fontWeight || "normal",
              fontStyle: obj.fontStyle || "normal",
              textAlign: (obj.textAlign || "left") as any, opacity: obj.opacity ?? 1,
            });
        fabricRef.current.add(aiTxtObj);
      } else if (obj.type === "image" && obj.src) {
        try {
          const img = await fabric.FabricImage.fromURL(obj.src, { crossOrigin: "anonymous" });
          const scX = obj.width ? obj.width / (img.width || obj.width) : 1;
          const scY = obj.height ? obj.height / (img.height || obj.height) : 1;
          img.set({ left: obj.left || 0, top: obj.top || 0, scaleX: scX, scaleY: scY, opacity: obj.opacity ?? 1 });
          fabricRef.current.add(img);
        } catch { /* skip */ }
      }
    }
    fabricRef.current.renderAll();
    } finally {
      // Reset history to a single clean frame for the freshly loaded layout
      // so the user's first action lands on a meaningful undo target.
      suppressHistoryRef.current = false;
      historyRef.current = [JSON.stringify(fabricRef.current.toJSON())];
      historyIndexRef.current = 0;
      setHistoryIndex(0);
      setHistoryLen(1);
      hasUnsavedChangesRef.current = false;
    }
  }, [fabric]);

  // ─── Load existing design (extracted so we can reuse for page navigation) ─

  const loadDesignById = useCallback(async (idNum: number) => {
    if (!fabricRef.current || !fabric) return;
    try {
      const res = await fetch(`/api/designs/${idNum}`);
      if (!res.ok) return;
      const design = await res.json();
      setDesignId(design.id);
      setDesignName(design.name || "Untitled Design");
      setLoadedDesignId(idNum);

      // Resize the canvas to the saved design's dimensions. Use the named
      // preset when available, otherwise synthesize one from width/height
      // so the canvas always matches the saved artwork exactly.
      const known = design.preset ? PRESETS.find((x) => x.id === design.preset) : null;
      const target: CanvasPreset = known
        ?? { id: design.preset || "custom", label: "Custom", width: design.width, height: design.height };
      setPreset(target);
      // Auto-fit so the loaded design is fully visible no matter how big it is.
      const z = computeFitZoom(target.width, target.height);
      setZoom(z);
      fabricRef.current.setDimensions({
        width: Math.round(target.width * z),
        height: Math.round(target.height * z),
      });
      fabricRef.current.setZoom(z);

      const data = design.canvasData;
      // Remember the aiSpec marker so handleSave can re-attach it and the
      // brand-book navigation strip survives subsequent edits/saves.
      loadedAiSpecRef.current = !!data?.aiSpec;
      if (!data) {
        fabricRef.current.renderAll();
        // Reset history to a single clean baseline for the new (empty) design.
        suppressHistoryRef.current = false;
        historyRef.current = [JSON.stringify(fabricRef.current.toJSON())];
        historyIndexRef.current = 0;
        setHistoryIndex(0);
        setHistoryLen(1);
        hasUnsavedChangesRef.current = false;
        return;
      }
      if (data.aiSpec) {
        await applySpecToCanvas(data);
      } else {
        suppressHistoryRef.current = true;
        try {
          // Fabric v7: loadFromJSON returns a Promise; second arg is a per-object
          // reviver, NOT a completion callback. Awaiting is the correct pattern.
          await fabricRef.current.loadFromJSON(data);
          fabricRef.current.renderAll();
          if (data.background) setBgColor(data.background);
        } finally {
          suppressHistoryRef.current = false;
          // Reset history to a single clean baseline for the loaded design.
          historyRef.current = [JSON.stringify(fabricRef.current.toJSON())];
          historyIndexRef.current = 0;
          setHistoryIndex(0);
          setHistoryLen(1);
          hasUnsavedChangesRef.current = false;
        }
      }
    } catch { /* ignore */ }
  }, [fabric, applySpecToCanvas]);

  // ─── Load existing design via ?designId= query param (initial mount) ─────

  useEffect(() => {
    if (!fabricLoaded || !fabricRef.current || !fabric) return;
    const params = new URLSearchParams(window.location.search);
    const did = params.get("designId");
    if (!did) return;
    const idNum = parseInt(did, 10);
    if (isNaN(idNum) || idNum === loadedDesignId) return;
    loadDesignById(idNum);
  }, [fabricLoaded, fabric, loadedDesignId, loadDesignById]);

  // ─── Fetch sibling brand-book pages (for prev/next navigation) ────────────
  // Bumping `siblingsRefreshTick` forces a re-fetch (used after adding pages).
  const [siblingsRefreshTick, setSiblingsRefreshTick] = useState(0);

  useEffect(() => {
    if (!designId || !brandId) { setSiblingPages([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/designs?brandId=${brandId}`);
        if (!res.ok) return;
        const all: Array<{ id: number; name: string; preset?: string; canvasData?: any }> = await res.json();
        // Brand-book pages are A4 designs whose canvasData was generated by the
        // deterministic builder (i.e. carries the aiSpec marker). They share the
        // same brandId. Sort by id so the natural insertion order is preserved.
        const pages = all
          .filter((d) => d.preset === "a4" && d.canvasData?.aiSpec === true)
          .sort((a, b) => a.id - b.id)
          .map((d) => ({ id: d.id, name: d.name }));
        // Show the strip if the currently-loaded design is part of this set.
        if (cancelled) return;
        if (pages.some((p) => p.id === designId)) setSiblingPages(pages);
        else setSiblingPages([]);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [designId, brandId, siblingsRefreshTick]);

  // ─── Add a new blank page to the current brand-book sequence ─────────────
  const [addingPage, setAddingPage] = useState(false);
  const addNewPage = useCallback(async () => {
    if (!brandId || addingPage) return;
    setAddingPage(true);
    try {
      // Save current page first so unsaved tweaks aren't lost.
      if (hasUnsavedChangesRef.current) {
        await handleSaveRef.current?.();
      }
      const res = await fetch("/api/designs/new-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          name: `Page ${siblingPages.length + 1}`,
          width: preset.width,
          height: preset.height,
          preset: preset.id,
        }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Could not create new page"));
      const created = await res.json();
      setSiblingsRefreshTick((t) => t + 1);
      await loadDesignById(created.id);
      window.history.replaceState(null, "", `/brands/${brandId}/design?designId=${created.id}`);
      notifySuccess("New page added");
    } catch (err) {
      notifyError("Could not add new page", err);
    } finally {
      setAddingPage(false);
    }
  }, [brandId, addingPage, siblingPages.length, preset, loadDesignById]);

  const currentPageIdx = useMemo(
    () => siblingPages.findIndex((p) => p.id === designId),
    [siblingPages, designId],
  );

  const navigateToBrandBookPage = useCallback(async (targetId: number) => {
    if (targetId === designId) return;
    setNavigatingPage(true);
    try {
      // Auto-save current page first so unsaved tweaks aren't lost — but only
      // when something actually changed, otherwise we'd needlessly bump the
      // page on the server and reset the "saved at" timestamp on every click.
      if (hasUnsavedChangesRef.current) {
        await handleSaveRef.current?.();
      }
      await loadDesignById(targetId);
      // Update URL silently so refresh / shareable link still works,
      // without triggering the wouter re-render that would re-run the
      // mount effect and double-load the design.
      window.history.replaceState(null, "", `/brands/${brandId}/design?designId=${targetId}`);
    } finally {
      setNavigatingPage(false);
    }
  }, [designId, loadDesignById, brandId]);

  // ─── AI Layout ────────────────────────────────────────────────────────────

  async function runAIDesign() {
    if (!aiPrompt.trim() || !fabricRef.current || !fabric) return;
    setAIGenerating(true); setAIError(null);
    try {
      const res = await fetch("/api/designs/generate-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, prompt: aiPrompt, width: preset.width, height: preset.height, preset: preset.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const layout = await res.json();
      // The AI generator returns an aiSpec layout. Treat freshly-generated
      // designs the same way we treat loaded brand-book pages so saving
      // preserves the marker.
      loadedAiSpecRef.current = !!layout?.aiSpec;
      await applySpecToCanvas(layout);
      setShowAIDialog(false); setAIPrompt("");
    } catch (err) {
      setAIError(err instanceof Error ? err.message : "Generation failed");
    } finally { setAIGenerating(false); }
  }

  // ─── Smart Design Workflow ────────────────────────────────────────────────

  async function runSmartGenerate() {
    if (!smartInput.trim() || !fabricRef.current || !fabric) return;
    setSmartGenerating(true);
    setSmartError(null);
    setSmartStep("thinking");
    setSmartResult(null);
    try {
      const res = await fetch("/api/designs/smart-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, userInput: smartInput, width: preset.width, height: preset.height, preset: preset.id }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Smart generation failed"));
      const data = await res.json();
      setSmartResult(data);
      setSmartStep("result");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Smart generation failed";
      setSmartError(msg);
      setSmartStep("input");
      notifyError("Smart generation failed", err);
    } finally {
      setSmartGenerating(false);
    }
  }

  async function applySmartResult() {
    if (!smartResult?.layout) return;
    loadedAiSpecRef.current = false;
    await applySpecToCanvas(smartResult.layout);
    setShowAIDialog(false);
    setSmartStep("input");
    setSmartInput("");
    setSmartResult(null);
  }

  // ─── Image → Editable Layers ──────────────────────────────────────────────

  async function runAnalyzeImage() {
    if (!analyzeImageUrl.trim()) return;
    setAnalyzeProcessing(true);
    setAnalyzeError(null);
    setAnalyzeResult(null);
    try {
      const res = await fetch("/api/designs/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: analyzeImageUrl, brandId, width: preset.width, height: preset.height }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Image analysis failed"));
      const data = await res.json();
      setAnalyzeResult(data);
      setAnalyzeStep("result");
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Image analysis failed");
      notifyError("Image analysis failed", err);
    } finally {
      setAnalyzeProcessing(false);
    }
  }

  async function applyAnalyzedLayout() {
    if (!analyzeResult?.fabricLayout) return;
    await applySpecToCanvas(analyzeResult.fabricLayout);
    setShowAnalyzeDialog(false);
    setAnalyzeStep("input");
    setAnalyzeImageUrl("");
    setAnalyzeResult(null);
  }

  function handleAnalyzeImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAnalyzeImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ─── AI Edit Command ──────────────────────────────────────────────────────

  async function runAIEdit() {
    if (!aiEditCommand.trim() || !fabricRef.current) return;
    setAIEditProcessing(true);
    setAIEditError(null);
    setAIEditSuccess(false);
    try {
      const canvasData = fabricRef.current.toJSON();
      const res = await fetch("/api/designs/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasData, command: aiEditCommand, brandId }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "AI edit failed"));
      const data = await res.json();
      if (data.layout) {
        await applySpecToCanvas(data.layout);
        setAIEditCommand("");
        setAIEditSuccess(true);
        setTimeout(() => setAIEditSuccess(false), 3000);
      }
    } catch (err) {
      setAIEditError(err instanceof Error ? err.message : "AI edit failed");
      notifyError("AI edit failed", err);
    } finally {
      setAIEditProcessing(false);
    }
  }

  // ─── Image Generation ────────────────────────────────────────────────────

  async function runImageGenerate() {
    if (!imgPrompt.trim()) return;
    setImgGenerating(true); setImgError(null); setImgResult(null);
    try {
      const res = await fetch("/api/designs/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, prompt: imgPrompt, size: imgSize }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Image generation failed"));
      const data = await res.json();
      setImgResult(data.url);
    } catch (err) {
      setImgError(err instanceof Error ? err.message : "Image generation failed");
      notifyError("Image generation failed", err);
    } finally { setImgGenerating(false); }
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!fabricRef.current) return;
    setSaving(true);
    setSaveStatus("saving");
    try {
      const canvasData = fabricRef.current.toJSON();
      // Preserve the AI brand-book marker so the page stays part of the
      // brand-book navigation strip after edits — without this the page would
      // silently fall out of the strip on the very first save.
      if (loadedAiSpecRef.current) (canvasData as any).aiSpec = true;
      // Preview thumbnail: 0.5x of native resolution. Note `multiplier` operates
      // on the displayed canvas, which is already scaled by `zoom`; divide to
      // cancel out so the saved thumbnail is consistent regardless of zoom.
      const previewDataUrl = fabricRef.current.toDataURL({ format: "jpeg", quality: 0.7, multiplier: 0.5 / zoom });
      const body = { brandId, name: designName, canvasData, width: preset.width, height: preset.height, preset: preset.id };
      let dId = designId;
      if (dId) {
        const res = await fetch(`/api/designs/${dId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(await extractApiError(res, `Save failed (${res.status})`));
      } else {
        const res = await fetch("/api/designs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(await extractApiError(res, `Save failed (${res.status})`));
        const d = await res.json();
        dId = d.id;
        setDesignId(d.id);
        setLoadedDesignId(d.id);
        // Reflect the new id in the URL so a refresh re-opens the same design
        // (and so subsequent saves PATCH instead of creating duplicates).
        window.history.replaceState(null, "", `/brands/${brandId}/design?designId=${d.id}`);
      }
      if (dId) {
        await fetch(`/api/designs/${dId}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: previewDataUrl }) });
      }
      hasUnsavedChangesRef.current = false;
      setSaveStatus("saved");
      // Auto-clear "saved" indicator after 2.5s
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2500);
      // Invalidate any cached design lists so the dashboard/brand view refreshes.
      queryClient.invalidateQueries({ queryKey: [`/api/designs`] });
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus((s) => (s === "error" ? "idle" : s)), 4000);
      notifyError("Save failed", err);
    } finally { setSaving(false); }
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  // For raster exports we want at least 2× the native canvas resolution. The
  // Fabric `multiplier` operates on the on-screen canvas (which is already
  // scaled by `zoom`), so `2 / zoom` produces a 2× output regardless of the
  // current zoom level.

  function exportMultiplier() {
    return Math.max(2 / Math.max(zoom, 0.0001), 2);
  }

  function safeFilename() {
    return (designName || "design").replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "-");
  }

  function exportPNG() {
    if (!fabricRef.current) return;
    const url = fabricRef.current.toDataURL({ format: "png", multiplier: exportMultiplier() });
    const a = document.createElement("a"); a.href = url;
    a.download = `${safeFilename()}.png`; a.click();
    setShowExportMenu(false);
  }

  function exportSVG() {
    if (!fabricRef.current) return;
    const svg = fabricRef.current.toSVG();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${safeFilename()}.svg`; a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  // Image-based PDF: rasterizes the canvas at 2× resolution and embeds it.
  // Use this when the design contains effects (gradients, complex strokes) that
  // wouldn't survive vector translation.
  function exportPDFImage() {
    if (!fabricRef.current) return;
    const url = fabricRef.current.toDataURL({ format: "png", multiplier: exportMultiplier() });
    const isLandscape = preset.width > preset.height;
    const pdf = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "px", format: [preset.width, preset.height] });
    pdf.addImage(url, "PNG", 0, 0, preset.width, preset.height);
    pdf.save(`${safeFilename()}.pdf`);
    setShowExportMenu(false);
  }

  // Vector PDF: walks the Fabric scene graph and emits jsPDF primitives so
  // the resulting file has selectable text, scalable shapes, and small file
  // size — i.e. a real editable PDF.
  function exportPDFVector() {
    if (!fabricRef.current) return;
    const W = preset.width;
    const H = preset.height;
    const isLandscape = W > H;
    const pdf = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "px", format: [W, H], compress: true });

    // Background fill
    const bg = (fabricRef.current as any).backgroundColor || bgColor || "#ffffff";
    if (bg && bg !== "transparent") {
      const rgb = parseColor(bg);
      if (rgb) {
        pdf.setFillColor(rgb.r, rgb.g, rgb.b);
        pdf.rect(0, 0, W, H, "F");
      }
    }

    const objects = fabricRef.current.getObjects?.() ?? [];
    for (const obj of objects) {
      try { drawObjectToPdf(pdf, obj); } catch { /* skip unsupported */ }
    }
    pdf.save(`${safeFilename()}-editable.pdf`);
    setShowExportMenu(false);
  }

  // ─── Keep latest handlers in a ref so global keyboard shortcuts always
  // call the freshest closure without re-binding the listener every render. ──

  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);
  const handlersRef = useRef({ undo, redo, deleteSelected, duplicateSelected, handleSave });
  useEffect(() => {
    handlersRef.current = { undo, redo, deleteSelected, duplicateSelected, handleSave };
    handleSaveRef.current = handleSave;
  });

  // Close dropdown menus on any click outside their trigger/menu region.
  // Using a `data-menu` attribute lets the trigger button & its dropdown opt
  // out — anything else dismisses both menus.
  useEffect(() => {
    if (!showPresetMenu && !showExportMenu) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("[data-menu]")) return;
      setShowPresetMenu(false);
      setShowExportMenu(false);
    }
    // mousedown so the dismissal happens before any focus shift / click handler.
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showPresetMenu, showExportMenu]);

  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!t || !(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      // Don't intercept while a Fabric text element is being edited inline.
      const active = fabricRef.current?.getActiveObject?.();
      if (active?.isEditing) return;

      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const h = handlersRef.current;

      if (mod && !e.shiftKey && k === "z") { e.preventDefault(); h.undo(); }
      else if (mod && (k === "y" || (e.shiftKey && k === "z"))) { e.preventDefault(); h.redo(); }
      else if (mod && k === "s") { e.preventDefault(); h.handleSave(); }
      else if (mod && k === "d") { e.preventDefault(); h.duplicateSelected(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && fabricRef.current?.getActiveObject?.()) {
        e.preventDefault(); h.deleteSelected();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen bg-[#0a0a14]"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>;
  }

  const brandColors = Object.values(palette) as string[];
  const canApplyBrand = Object.keys(logoVariants).length > 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#0d0d1a] text-white overflow-hidden select-none">

      {/* ═══ TOP BAR ═════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#111122] border-b border-white/10 shrink-0 z-30">
        <button onClick={() => navigate(`/brands/${brandId}`)}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors mr-1">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline text-white/70 font-medium">{brand?.companyName}</span>
        </button>

        <span className="text-white/20 text-sm">·</span>

        <input value={designName} onChange={(e) => setDesignName(e.target.value)}
          className="text-sm font-semibold bg-transparent border-b border-transparent hover:border-white/20 focus:border-violet-500 focus:outline-none px-1 w-36 text-white/90" />

        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Panel toggles */}
        <button onClick={() => setLeftOpen((v) => !v)}
          title={leftOpen ? "Hide tools panel" : "Show tools panel"}
          className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white">
          {leftOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
        <button onClick={() => setRightOpen((v) => !v)}
          title={rightOpen ? "Hide properties panel" : "Show properties panel"}
          className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white">
          {rightOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>

        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Preset Picker */}
        <div className="relative" data-menu>
          <button onClick={() => { setShowPresetMenu(!showPresetMenu); setShowExportMenu(false); }}
            className="flex items-center gap-1.5 text-xs bg-white/8 hover:bg-white/15 border border-white/10 px-2.5 py-1.5 rounded-md transition-colors">
            <LayoutTemplate className="w-3.5 h-3.5 text-white/60" />
            <span className="text-white/80 max-w-[120px] truncate">{preset.label}</span>
            <span className="text-white/30 text-[10px]">{preset.width}×{preset.height}</span>
            <ChevronDown className="w-3 h-3 text-white/30" />
          </button>
          {showPresetMenu && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => applyPreset(p)}
                  className={cn("w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/8 transition-colors text-left",
                    preset.id === p.id ? "text-violet-400" : "text-white/70")}>
                  <span>{p.label}</span>
                  <span className="text-white/30">{p.width}×{p.height}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zoom group with Fit + 100% */}
        <div className="flex items-center bg-white/8 border border-white/10 rounded-md overflow-hidden">
          <button onClick={() => changeZoom(-0.1)} title="Zoom out"
            className="px-2 py-1.5 hover:bg-white/10 transition-colors text-white/60 hover:text-white">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={zoomTo100} title="100%"
            className="text-xs w-10 text-center text-white/70 hover:text-white hover:bg-white/10 transition-colors py-1">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => changeZoom(0.1)} title="Zoom in"
            className="px-2 py-1.5 hover:bg-white/10 transition-colors text-white/60 hover:text-white">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={fitToScreen} title="Fit to screen"
            className="px-2 py-1.5 hover:bg-white/10 transition-colors text-white/60 hover:text-white border-l border-white/10">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center bg-white/8 border border-white/10 rounded-md overflow-hidden">
          <button onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)"
            className="px-2 py-1.5 hover:bg-white/10 disabled:opacity-25 transition-colors text-white/60 hover:text-white">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={redo} disabled={historyIndex >= historyLen - 1} title="Redo (Ctrl+Shift+Z)"
            className="px-2 py-1.5 hover:bg-white/10 disabled:opacity-25 transition-colors text-white/60 hover:text-white">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Save status indicator (subtle, lives next to the Save button) */}
          {saveStatus !== "idle" && (
            <span className={cn(
              "flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors",
              saveStatus === "saving" && "text-white/50 bg-white/5",
              saveStatus === "saved" && "text-emerald-300 bg-emerald-500/10 border border-emerald-500/20",
              saveStatus === "error" && "text-red-300 bg-red-500/10 border border-red-500/20",
            )}>
              {saveStatus === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
              {saveStatus === "saved" && <><Check className="w-3 h-3" /> Saved</>}
              {saveStatus === "error" && <><X className="w-3 h-3" /> Save failed</>}
            </span>
          )}

          {/* Smart AI Design */}
          <button onClick={() => { setShowAIDialog(true); setSmartStep("input"); }}
            className="flex items-center gap-1.5 text-xs bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 border border-fuchsia-500/30 px-3 py-1.5 rounded-md transition-all font-medium shadow-sm shadow-fuchsia-900/30">
            <Brain className="w-3.5 h-3.5" /> <span className="hidden md:inline">Smart Designer</span>
          </button>

          {/* Save */}
          <button onClick={handleSave} disabled={saving}
            title="Save (Ctrl+S)"
            className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{saving ? "Saving…" : "Save"}</span>
          </button>

          {/* Export dropdown — Adobe-style consolidated menu */}
          <div className="relative" data-menu>
            <button onClick={() => { setShowExportMenu((v) => !v); setShowPresetMenu(false); }}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 px-3 py-1.5 rounded-md transition-colors font-medium">
              <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" />
            </button>
            {showExportMenu && (
              <div className="absolute top-full right-0 mt-1 w-72 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                <button onClick={exportPDFVector}
                  className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/8 transition-colors text-left">
                  <FileText className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white/90">Editable PDF (vector)</p>
                    <p className="text-[10px] text-white/40 leading-tight mt-0.5">Real text & shapes — open in Acrobat/Illustrator and edit anything</p>
                  </div>
                </button>
                <button onClick={exportPDFImage}
                  className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/8 transition-colors text-left border-t border-white/5">
                  <FileImage className="w-5 h-5 text-blue-300 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white/90">PDF as image</p>
                    <p className="text-[10px] text-white/40 leading-tight mt-0.5">Pixel-perfect raster snapshot — best for complex effects</p>
                  </div>
                </button>
                <button onClick={exportPNG}
                  className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/8 transition-colors text-left border-t border-white/5">
                  <FileImage className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white/90">PNG image (2×)</p>
                    <p className="text-[10px] text-white/40 leading-tight mt-0.5">High-resolution image, transparent background supported</p>
                  </div>
                </button>
                <button onClick={exportSVG}
                  className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/8 transition-colors text-left border-t border-white/5">
                  <FileType className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white/90">SVG vector</p>
                    <p className="text-[10px] text-white/40 leading-tight mt-0.5">Web/print scalable vector — open in any vector tool</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ BRAND-BOOK PAGE NAVIGATION ══════════════════════════════════════
          Visible only when the loaded design is part of a brand book — gives
          users prev/next + a clickable list so they can edit every page in
          the book without bouncing back to the viewer. Auto-saves between
          pages so unsaved tweaks aren't lost. */}
      {currentPageIdx >= 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d0d1a] border-b border-white/8 shrink-0 overflow-hidden">
          <button
            onClick={() => navigateToBrandBookPage(siblingPages[currentPageIdx - 1].id)}
            disabled={currentPageIdx <= 0 || navigatingPage}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white/8 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/8 border border-white/10 transition-colors text-white/70 shrink-0"
            title="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 scrollbar-thin">
            {siblingPages.map((p, i) => (
              <button
                key={p.id}
                onClick={() => navigateToBrandBookPage(p.id)}
                disabled={navigatingPage}
                className={cn(
                  "text-[10px] px-2 py-1 rounded whitespace-nowrap transition-colors shrink-0",
                  i === currentPageIdx
                    ? "bg-violet-600 text-white font-semibold"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80",
                )}
                title={p.name}
              >
                <span className="text-white/40 mr-1">{i + 1}.</span>{p.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigateToBrandBookPage(siblingPages[currentPageIdx + 1].id)}
            disabled={currentPageIdx >= siblingPages.length - 1 || navigatingPage}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white/8 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/8 border border-white/10 transition-colors text-white/70 shrink-0"
            title="Next page"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={addNewPage}
            disabled={addingPage || navigatingPage}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-40 border border-emerald-400/30 transition-colors text-white shrink-0 font-medium"
            title="Add new blank page"
          >
            {addingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            New Page
          </button>
          <span className="text-[10px] text-white/30 shrink-0 ml-1">
            {navigatingPage
              ? <Loader2 className="w-3 h-3 animate-spin inline" />
              : `${currentPageIdx + 1} / ${siblingPages.length}`}
          </span>
        </div>
      )}

      {/* ═══ BODY ════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ══ LEFT PANEL — collapsible ════════════════════════════════════════
            When closed we render a thin rail of tab icons so users can re-open
            the panel to a specific tab in one click (Adobe-style behaviour). */}
        {leftOpen ? (
        <div className="w-[220px] bg-[#111122] border-r border-white/8 flex flex-col overflow-hidden shrink-0">

          {/* Tab bar */}
          <div className="flex border-b border-white/8 shrink-0 text-[10px] font-semibold uppercase tracking-wide">
            {([
              { key: "images",    icon: ImagePlus,      label: "Images" },
              { key: "elements",  icon: Square,         label: "Shapes" },
              { key: "text",      icon: Type,           label: "Text" },
              { key: "brand",     icon: Palette,        label: "Brand" },
              { key: "ai",        icon: Brain,          label: "AI" },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => setActiveTab(key as any)}
                title={label}
                className={cn("flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors",
                  activeTab === key
                    ? key === "ai" ? "text-fuchsia-400 border-b-2 border-fuchsia-500" : "text-violet-400 border-b-2 border-violet-500"
                    : "text-white/30 hover:text-white/60")}>
                <Icon className="w-4 h-4" />
                <span className="hidden">{label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">

            {/* ── Images ── */}
            {activeTab === "images" && (
              <>
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Add Images</p>
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border-2 border-dashed border-white/20 hover:border-violet-500/50 rounded-xl transition-all text-sm text-white/60 hover:text-white">
                  <Upload className="w-5 h-5 shrink-0" />
                  <span className="text-xs">Upload Image</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLocalImageUpload} />

                <button onClick={() => { setShowImgDialog(true); setImgResult(null); setImgError(null); setImgPrompt(""); }}
                  className="w-full flex items-center gap-3 p-3 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 hover:border-violet-400/50 rounded-xl transition-all text-sm">
                  <Sparkles className="w-5 h-5 text-violet-400 shrink-0" />
                  <div className="text-left">
                    <p className="text-xs font-semibold text-violet-300">AI Image Generator</p>
                    <p className="text-[10px] text-violet-400/70">Create from text prompt</p>
                  </div>
                </button>

                {/* Logo section */}
                <div className="border-t border-white/8 pt-3">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">Brand Logo</p>
                  {!brand?.logoUrl ? (
                    <p className="text-xs text-white/30 text-center py-2">No logo uploaded</p>
                  ) : Object.keys(logoVariants).length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-white/50">Generate variants (black, white, grayscale)</p>
                      {variantErr && <p className="text-[11px] text-red-400">{variantErr}</p>}
                      <button onClick={generateVariants} disabled={genVariants}
                        className="w-full text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-60 rounded-lg py-2 flex items-center justify-center gap-1.5 transition-colors">
                        {genVariants ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {genVariants ? "Generating…" : "Generate Variants"}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { key: "original", bg: "#f8fafc", label: "Original" },
                        { key: "black", bg: "#f8fafc", label: "Black" },
                        { key: "white", bg: "#1a1a2e", label: "White" },
                        { key: "grayscale", bg: "#f8fafc", label: "Gray" },
                      ].map(({ key, bg, label }) =>
                        logoVariants[key as keyof LogoVariants] ? (
                          <button key={key}
                            onClick={() => addImageFromUrl(logoVariants[key as keyof LogoVariants]!)}
                            className="rounded-xl overflow-hidden border border-white/10 hover:border-violet-400/50 transition-all group"
                            style={{ backgroundColor: bg }}>
                            <img src={logoVariants[key as keyof LogoVariants]} alt={label}
                              className="w-full h-12 object-contain p-1.5" crossOrigin="anonymous" />
                            <div className="text-[10px] text-center py-1 text-white/40 group-hover:text-violet-300 bg-[#111122]">{label}</div>
                          </button>
                        ) : null
                      )}
                      <button onClick={generateVariants} disabled={genVariants}
                        className="col-span-2 text-[11px] text-white/30 hover:text-white/60 flex items-center justify-center gap-1 py-1">
                        <RefreshCw className={cn("w-3 h-3", genVariants && "animate-spin")} /> Regenerate
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Elements (Shapes) ── */}
            {activeTab === "elements" && (
              <>
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Shapes</p>
                <div className="grid grid-cols-3 gap-1.5">
                  <ShapeBtn onClick={addRect} label="Rect"><Square className="w-5 h-5" /></ShapeBtn>
                  <ShapeBtn onClick={addCircle} label="Circle"><Circle className="w-5 h-5" /></ShapeBtn>
                  <ShapeBtn onClick={addTriangle} label="Triangle"><Triangle className="w-5 h-5" /></ShapeBtn>
                  <ShapeBtn onClick={addLine} label="Line"><Minus className="w-5 h-5" /></ShapeBtn>
                  <ShapeBtn onClick={addStar} label="Star"><Star className="w-5 h-5" /></ShapeBtn>
                </div>
                <div className="pt-2 border-t border-white/8">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">Quick Styles</p>
                  <button onClick={addGradientBackground}
                    className="w-full text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-2 mb-1.5 transition-colors flex items-center gap-2 px-3 text-white/70">
                    <Paintbrush className="w-3.5 h-3.5" /> Add Gradient BG
                  </button>
                </div>
              </>
            )}

            {/* ── Text ── */}
            {activeTab === "text" && (
              <>
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Text Elements</p>
                <div className="space-y-1.5">
                  <button onClick={() => addText(brand?.companyName || "Brand Name", 42, "bold", palette.primary)}
                    className="w-full text-left px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg transition-colors">
                    <span className="text-lg font-black text-white/90">Brand Name</span>
                  </button>
                  <button onClick={() => addText("Your Headline Here", 34, "bold")}
                    className="w-full text-left px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg transition-colors">
                    <span className="text-base font-bold text-white/80">Heading</span>
                  </button>
                  <button onClick={() => addText(kit.taglines?.[0] || "Your tagline goes here", 20, "normal")}
                    className="w-full text-left px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg transition-colors">
                    <span className="text-sm text-white/60">Tagline</span>
                  </button>
                  <button onClick={() => addText("Subheading", 22, "bold", palette.secondary)}
                    className="w-full text-left px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg transition-colors">
                    <span className="text-sm font-semibold text-white/70">Subheading</span>
                  </button>
                  <button onClick={() => addText("Body text — double click to edit this text content.", 16, "normal", "#64748b")}
                    className="w-full text-left px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg transition-colors">
                    <span className="text-xs text-white/50">Body Text</span>
                  </button>
                  <button onClick={() => addText((brand as any)?.website || brand?.websiteUrl || "www.example.com", 14, "normal", palette.primary)}
                    className="w-full text-left px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg transition-colors">
                    <span className="text-xs text-blue-400 underline">Website Link</span>
                  </button>
                </div>
              </>
            )}

            {/* ── Brand ── */}
            {activeTab === "brand" && (
              <>
                <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Brand Colors</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(palette).map(([name, color]) => (
                    <button key={name} onClick={() => { if (selectedObj) applyProp("fill", color); }}
                      className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-white/5 border border-white/8 transition-colors">
                      <div className="w-full h-8 rounded-md border border-white/10" style={{ backgroundColor: color }} />
                      <span className="text-[9px] text-white/40 capitalize">{name}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-white/30 text-center mt-1">Click to apply to selected element</p>

                <div className="border-t border-white/8 pt-3">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">Custom Color</p>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={typeof selectedProps.fill === "string" ? selectedProps.fill : "#6366f1"}
                      onChange={(e) => applyProp("fill", e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-white/10 shrink-0" />
                    <span className="text-xs text-white/50">Apply to selected element</span>
                  </div>
                </div>

                {/* Canvas background — moved here from the removed Templates tab */}
                <div className="border-t border-white/8 pt-3">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">Canvas Background</p>
                  <div className="grid grid-cols-5 gap-1.5 mb-2">
                    {["#ffffff", "#0d0d1a", palette.primary, palette.secondary, palette.accent,
                      "#f8fafc", "#1a1a2e", palette.background, "#f0f0f0", "#333333"].map((c, i) => (
                      <button key={`${c}-${i}`} onClick={() => applyBgColor(c)}
                        className="w-full aspect-square rounded-md border-2 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c, borderColor: bgColor === c ? "#a78bfa" : "rgba(255,255,255,0.1)" }}
                        title={c} />
                    ))}
                  </div>
                  <input type="color" value={bgColor} onChange={(e) => applyBgColor(e.target.value)}
                    className="w-full h-8 rounded-lg cursor-pointer bg-transparent border border-white/10" />
                  <button onClick={addGradientBackground}
                    className="w-full mt-2 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-2 transition-colors flex items-center justify-center gap-1.5 text-white/70">
                    <Plus className="w-3.5 h-3.5" /> Brand Gradient
                  </button>
                </div>

                {(() => {
                  const personality = kit.personality as unknown;
                  const traits = Array.isArray(personality)
                    ? (personality as string[])
                    : typeof personality === "string" && personality.trim()
                      ? personality.split(/[,،]\s*/).filter(Boolean)
                      : [];
                  if (traits.length === 0) return null;
                  return (
                    <div className="border-t border-white/8 pt-3">
                      <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">Brand Traits</p>
                      <div className="flex flex-wrap gap-1.5">
                        {traits.slice(0, 6).map((p) => (
                          <span key={p} className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full">{p}</span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* ── AI Tab ── */}
            {activeTab === "ai" && (
              <>
                {/* Smart Design */}
                <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-fuchsia-500/20">
                    <Brain className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400">Smart Designer</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-[10px] text-white/50 leading-relaxed">
                      Describe your idea simply. The AI detects your intent, writes a professional prompt, then generates a polished design.
                    </p>
                    <button onClick={() => { setShowAIDialog(true); setSmartStep("input"); }}
                      className="w-full py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Launch Smart Designer
                    </button>
                  </div>
                </div>

                {/* Image → Editable */}
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-cyan-500/20">
                    <ScanLine className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Image → Layers</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-[10px] text-white/50 leading-relaxed">
                      Upload any design image. AI analyzes its structure and converts it to editable layers on your canvas.
                    </p>
                    <button onClick={() => { setShowAnalyzeDialog(true); setAnalyzeStep("input"); }}
                      className="w-full py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5">
                      <Scan className="w-3.5 h-3.5" /> Convert Image to Layers
                    </button>
                  </div>
                </div>

                {/* AI Edit Command */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/20">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">AI Edit</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-[10px] text-white/50 leading-relaxed">
                      Tell the AI how to change your design in plain language.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {["make it premium", "more minimal", "bolder text", "add contrast"].map((cmd) => (
                        <button key={cmd} onClick={() => setAIEditCommand(cmd)}
                          className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors">
                          {cmd}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <input
                        value={aiEditCommand}
                        onChange={(e) => setAIEditCommand(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") runAIEdit(); }}
                        placeholder="e.g. make it more premium"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs placeholder:text-white/25 focus:outline-none focus:border-amber-500/50 min-w-0"
                      />
                      <button onClick={runAIEdit} disabled={!aiEditCommand.trim() || aiEditProcessing}
                        className="px-2 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors text-white shrink-0">
                        {aiEditProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
                      </button>
                    </div>
                    {aiEditSuccess && (
                      <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Design updated successfully
                      </p>
                    )}
                    {aiEditError && (
                      <p className="text-[10px] text-red-400">{aiEditError}</p>
                    )}
                  </div>
                </div>

                {/* Layer Inspector */}
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-500/15">
                    <Layers className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Layer Count</span>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-white/60">
                      Canvas has <span className="text-violet-300 font-bold">
                        {fabricRef.current ? (fabricRef.current as any)._objects?.length ?? 0 : 0}
                      </span> objects
                    </p>
                    <p className="text-[10px] text-white/30 mt-1">Select any element to edit its properties in the right panel</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        ) : (
          /* Collapsed left rail — click any icon to re-open the panel on that tab. */
          <div className="w-10 bg-[#111122] border-r border-white/8 flex flex-col items-center py-2 gap-1 shrink-0">
            {([
              { key: "images",   icon: ImagePlus, label: "Images" },
              { key: "elements", icon: Square,    label: "Shapes" },
              { key: "text",     icon: Type,      label: "Text" },
              { key: "brand",    icon: Palette,   label: "Brand" },
              { key: "ai",       icon: Brain,     label: "AI Tools" },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => { setActiveTab(key as any); setLeftOpen(true); }}
                title={label}
                className={cn(
                  "w-8 h-8 flex items-center justify-center rounded-md transition-colors",
                  activeTab === key
                    ? key === "ai" ? "text-fuchsia-400 bg-fuchsia-500/10" : "text-violet-400 bg-violet-500/10"
                    : "text-white/40 hover:text-white hover:bg-white/8",
                )}>
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}

        {/* ══ CANVAS AREA ══════════════════════════════════════════════════════
            The outer wrapper scrolls; the inner grid uses `min-w-full min-h-full
            place-items-center` so the canvas is centered when it fits and only
            scrolls when it overflows — fixes the "shifted left" bug that
            appeared when a brand-book A4 page was loaded into the studio. */}
        <div ref={canvasContainerRef}
          className="flex-1 overflow-auto bg-[#0a0a14] relative"
          onClick={() => { setShowPresetMenu(false); setShowExportMenu(false); }}>
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
            backgroundImage: "radial-gradient(circle, #334155 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }} />
          <div className="min-w-full min-h-full grid place-items-center p-10 relative">
            <div className="relative shadow-2xl shadow-black/60 z-10">
              <canvas ref={canvasRef} />
            </div>
          </div>
        </div>

        {/* ══ RIGHT PANEL (Properties) — collapsible ══════════════════════════ */}
        {rightOpen && (
        <div className="w-[200px] bg-[#111122] border-l border-white/8 overflow-y-auto shrink-0">
          {selectedObj ? (
            <div className="p-3 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 capitalize">{selectedProps.type}</span>
                <div className="flex items-center gap-1">
                  <button onClick={toggleLock} title={selectedProps.lockMovementX ? "Unlock" : "Lock"}
                    className="p-1 hover:text-yellow-400 text-white/40 transition-colors">
                    {selectedProps.lockMovementX ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={duplicateSelected} title="Duplicate" className="p-1 hover:text-violet-400 text-white/40 transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={deleteSelected} title="Delete" className="p-1 hover:text-red-400 text-white/40 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Layer controls */}
              <div className="flex gap-1">
                <button onClick={bringForward} className="flex-1 flex items-center justify-center gap-1 text-[10px] bg-white/5 hover:bg-white/10 border border-white/8 rounded-md py-1.5 text-white/50 hover:text-white transition-colors">
                  <MoveUp className="w-3 h-3" /> Forward
                </button>
                <button onClick={sendBackward} className="flex-1 flex items-center justify-center gap-1 text-[10px] bg-white/5 hover:bg-white/10 border border-white/8 rounded-md py-1.5 text-white/50 hover:text-white transition-colors">
                  <MoveDown className="w-3 h-3" /> Back
                </button>
              </div>

              {/* Position */}
              <PropSection title="Position & Size">
                <div className="grid grid-cols-2 gap-1.5">
                  <PropIn label="X" value={selectedProps.left ?? 0} onChange={(v) => applyProp("left", v)} />
                  <PropIn label="Y" value={selectedProps.top ?? 0} onChange={(v) => applyProp("top", v)} />
                  <PropIn label="W" value={selectedProps.width ?? 0} onChange={(v) => {
                    if (!selectedObj || !fabricRef.current) return;
                    // Textbox honours `width` directly (re-flows text); other shapes
                    // use scaleX so we don't distort the original geometry.
                    if (selectedObj.type === "textbox") {
                      selectedObj.set("width", Math.max(1, v));
                    } else {
                      selectedObj.set("scaleX", v / (selectedObj.width || 1));
                    }
                    fabricRef.current.renderAll();
                    syncProps(selectedObj);
                  }} />
                  <PropIn label="H" value={selectedProps.height ?? 0} onChange={(v) => {
                    if (!selectedObj || !fabricRef.current) return;
                    // Textbox auto-heights based on content — silently ignore.
                    if (selectedObj.type === "textbox") return;
                    selectedObj.set("scaleY", v / (selectedObj.height || 1));
                    fabricRef.current.renderAll();
                    syncProps(selectedObj);
                  }} />
                  <PropIn label="Angle" value={selectedProps.angle ?? 0} onChange={(v) => applyProp("angle", v)} />
                  <PropIn label="Opacity %" value={Math.round((selectedProps.opacity ?? 1) * 100)} onChange={(v) => applyProp("opacity", Math.max(0, Math.min(1, v / 100)))} />
                </div>
              </PropSection>

              {/* Fill */}
              {selectedProps.type !== "image" && (
                <PropSection title="Fill Color">
                  <input type="color"
                    value={typeof selectedProps.fill === "string" && selectedProps.fill.startsWith("#") ? selectedProps.fill : "#000000"}
                    onChange={(e) => applyProp("fill", e.target.value)}
                    className="w-full h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
                  <div className="grid grid-cols-5 gap-1 mt-2">
                    {brandColors.slice(0, 10).map((c, i) => (
                      <button key={i} onClick={() => applyProp("fill", c)}
                        className="w-full aspect-square rounded-md border border-white/10 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </PropSection>
              )}

              {/* Stroke */}
              {selectedProps.type !== "image" && (
                <PropSection title="Stroke">
                  <div className="flex gap-2 items-center">
                    <input type="color"
                      value={typeof selectedObj?.stroke === "string" ? selectedObj.stroke : "#000000"}
                      onChange={(e) => applyProp("stroke", e.target.value)}
                      className="w-9 h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent shrink-0" />
                    <PropIn label="Width" value={selectedObj?.strokeWidth ?? 0} onChange={(v) => applyProp("strokeWidth", v)} />
                  </div>
                </PropSection>
              )}

              {/* Text */}
              {["i-text", "textbox", "text"].includes(selectedProps.type || "") && (
                <PropSection title="Typography">
                  <PropIn label="Font size" value={selectedProps.fontSize ?? 24} onChange={(v) => applyProp("fontSize", v)} />
                  <select value={selectedProps.fontFamily || "Inter"}
                    onChange={(e) => applyProp("fontFamily", e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs mt-1.5 focus:outline-none focus:border-violet-500">
                    {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <div className="flex gap-1 mt-1.5">
                    <button onClick={() => applyProp("fontWeight", selectedProps.fontWeight === "bold" ? "normal" : "bold")}
                      className={cn("flex-1 py-1.5 rounded-lg text-xs transition-colors", selectedProps.fontWeight === "bold" ? "bg-violet-600 text-white" : "bg-white/8 hover:bg-white/15 text-white/60")}>
                      <Bold className="w-3.5 h-3.5 mx-auto" />
                    </button>
                    <button onClick={() => applyProp("fontStyle", selectedProps.fontStyle === "italic" ? "normal" : "italic")}
                      className={cn("flex-1 py-1.5 rounded-lg text-xs transition-colors", selectedProps.fontStyle === "italic" ? "bg-violet-600 text-white" : "bg-white/8 hover:bg-white/15 text-white/60")}>
                      <Italic className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {[["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]].map(([a, Icon]: any) => (
                      <button key={a} onClick={() => applyProp("textAlign", a)}
                        className={cn("flex-1 py-1.5 rounded-lg text-xs transition-colors", selectedProps.textAlign === a ? "bg-violet-600 text-white" : "bg-white/8 hover:bg-white/15 text-white/60")}>
                        <Icon className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    ))}
                  </div>
                </PropSection>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3">
              <MousePointer className="w-8 h-8 text-white/20" />
              <p className="text-xs text-white/30">Select an element to edit its properties</p>
              <p className="text-[10px] text-white/20">Double-click text to edit it</p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* ═══ SMART AI DESIGNER DIALOG ════════════════════════════════════════ */}
      {showAIDialog && (
        <Modal
          onClose={() => { setShowAIDialog(false); setSmartStep("input"); setSmartResult(null); setSmartError(null); }}
          title="Smart AI Designer"
          icon={<Brain className="w-4 h-4 text-fuchsia-400" />}
        >
          {/* Pipeline steps indicator */}
          <div className="flex items-center gap-1 mb-5">
            {[
              { id: 1, label: "Intent", icon: Eye },
              { id: 2, label: "Prompt", icon: Cpu },
              { id: 3, label: "Design", icon: Sparkles },
              { id: 4, label: "Layers", icon: Layers },
            ].map(({ id, label, icon: StepIcon }, idx) => {
              const isActive = smartStep === "thinking" && id <= 2 || smartStep === "result" && id <= 4 || smartStep === "input" && id === 1;
              const isDone = smartStep === "result";
              return (
                <div key={id} className="flex items-center gap-1 flex-1">
                  <div className={cn("flex flex-col items-center gap-0.5 flex-1",
                    isDone ? "text-fuchsia-400" : isActive ? "text-white/70" : "text-white/20")}>
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center border",
                      isDone ? "bg-fuchsia-500/20 border-fuchsia-500/50" : isActive ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10")}>
                      {isDone ? <Check className="w-3.5 h-3.5" /> : <StepIcon className="w-3 h-3" />}
                    </div>
                    <span className="text-[8px] font-medium">{label}</span>
                  </div>
                  {idx < 3 && <div className={cn("w-px h-4 self-start mt-1.5 shrink-0", isDone ? "bg-fuchsia-500/40" : "bg-white/10")} />}
                </div>
              );
            })}
          </div>

          {/* STEP: Input */}
          {smartStep === "input" && (
            <>
              <p className="text-xs text-white/50 mb-3 leading-relaxed">
                Describe your idea simply. The AI will detect your intent, craft a professional design prompt, generate the layout, and explain every layer.
              </p>
              <div className="grid grid-cols-1 gap-1.5 mb-3">
                {[
                  `logistics ad with bold modern style`,
                  `luxury ${brand?.industry} social post`,
                  `futuristic tech product announcement`,
                  `minimal business card for ${brand?.companyName}`,
                ].map((ex) => (
                  <button key={ex} onClick={() => setSmartInput(ex)}
                    className="text-left text-xs bg-white/5 hover:bg-fuchsia-500/15 border border-white/10 hover:border-fuchsia-500/40 rounded-lg px-3 py-2 transition-all text-white/70 hover:text-white">
                    "{ex}"
                  </button>
                ))}
              </div>
              <textarea value={smartInput} onChange={(e) => setSmartInput(e.target.value)}
                placeholder={`Simple description… e.g. "modern fintech post" or "luxury skincare ad"`}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-white/25 resize-none focus:outline-none focus:border-fuchsia-500/60 mb-3" />
              {smartError && <p className="text-xs text-red-400 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{smartError}</p>}
              <div className="flex gap-2">
                <button onClick={() => setShowAIDialog(false)} className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-sm transition-colors text-white/70">Cancel</button>
                <button onClick={runSmartGenerate} disabled={!smartInput.trim() || smartGenerating}
                  className="flex-1 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-sm transition-colors flex items-center justify-center gap-2 font-medium">
                  <Brain className="w-4 h-4" /> Think & Design
                </button>
              </div>
            </>
          )}

          {/* STEP: Thinking/Generating */}
          {smartStep === "thinking" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-fuchsia-500/30 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-fuchsia-500/50 animate-pulse" />
                <div className="absolute inset-4 rounded-full bg-fuchsia-600/30 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-fuchsia-300 animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white mb-1">AI is thinking…</p>
                <p className="text-xs text-white/40">Detecting intent → building professional prompt → generating design → mapping layers</p>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1">
                <div className="bg-fuchsia-500 h-1 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          {/* STEP: Result */}
          {smartStep === "result" && smartResult && (
            <>
              {/* Detection badges */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {smartResult.detectedIndustry && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 flex items-center gap-1">
                    <Info className="w-2.5 h-2.5" /> {smartResult.detectedIndustry}
                  </span>
                )}
                {smartResult.detectedStyle && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 flex items-center gap-1">
                    <Eye className="w-2.5 h-2.5" /> {smartResult.detectedStyle}
                  </span>
                )}
                {smartResult.detectedLayout && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                    <LayoutTemplate className="w-2.5 h-2.5" /> {smartResult.detectedLayout}
                  </span>
                )}
              </div>

              {/* Design description */}
              {smartResult.designDescription && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1.5">Design Description</p>
                  <p className="text-xs text-white/70 leading-relaxed">{smartResult.designDescription}</p>
                </div>
              )}

              {/* Internal prompt (collapsible) */}
              {smartResult.internalPrompt && (
                <details className="mb-3 group">
                  <summary className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400/70 cursor-pointer flex items-center gap-1 hover:text-fuchsia-400 transition-colors">
                    <Cpu className="w-3 h-3" /> Internal AI Prompt (generated)
                    <ChevronDown className="w-3 h-3 ml-auto group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="mt-2 bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-xl p-3">
                    <p className="text-[10px] text-white/50 leading-relaxed font-mono">{smartResult.internalPrompt}</p>
                  </div>
                </details>
              )}

              {/* Layer explanation */}
              {smartResult.layerExplanation && smartResult.layerExplanation.length > 0 && (
                <details className="mb-4 group">
                  <summary className="text-[10px] font-bold uppercase tracking-wider text-violet-400/70 cursor-pointer flex items-center gap-1 hover:text-violet-400 transition-colors">
                    <Layers className="w-3 h-3" /> {smartResult.layerExplanation.length} Layers Explained
                    <ChevronDown className="w-3 h-3 ml-auto group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                    {smartResult.layerExplanation.map((layer) => (
                      <div key={layer.index} className="flex items-center gap-2 bg-white/3 hover:bg-white/5 rounded-lg px-2 py-1.5 transition-colors">
                        <span className="text-[9px] font-mono text-white/30 w-4 shrink-0">{layer.index}</span>
                        <div className="w-3 h-3 rounded shrink-0 border border-white/20" style={{ backgroundColor: layer.color || "#888" }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[9px] text-white/60 font-medium truncate block">{layer.purpose}</span>
                        </div>
                        <span className="text-[9px] text-white/25 shrink-0 capitalize">{layer.type}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setSmartStep("input"); setSmartResult(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-sm transition-colors text-white/70">
                  <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Regenerate
                </button>
                <button onClick={applySmartResult}
                  className="flex-1 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-sm transition-colors flex items-center justify-center gap-2 font-medium">
                  <Check className="w-4 h-4" /> Apply to Canvas
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ═══ IMAGE → EDITABLE LAYERS DIALOG ═════════════════════════════════ */}
      {showAnalyzeDialog && (
        <Modal
          onClose={() => { setShowAnalyzeDialog(false); setAnalyzeStep("input"); setAnalyzeResult(null); setAnalyzeError(null); setAnalyzeImageUrl(""); }}
          title="Image → Editable Layers"
          icon={<ScanLine className="w-4 h-4 text-cyan-400" />}
        >
          {analyzeStep === "input" && (
            <>
              <p className="text-xs text-white/50 mb-4 leading-relaxed">
                Upload or paste the URL of any design image. The AI will analyze its layout, extract layers, colors, and typography — then reconstruct it as editable canvas objects.
              </p>

              {/* Image preview */}
              {analyzeImageUrl && (
                <div className="mb-3 rounded-xl overflow-hidden border border-white/10 bg-black/30 relative">
                  <img src={analyzeImageUrl} alt="To analyze" className="w-full max-h-40 object-cover" crossOrigin="anonymous" />
                  <button onClick={() => setAnalyzeImageUrl("")}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* URL input */}
              <div className="flex gap-2 mb-3">
                <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-cyan-500/50">
                  <Link className="w-3.5 h-3.5 text-white/30 shrink-0" />
                  <input
                    value={analyzeImageUrl.startsWith("data:") ? "" : analyzeImageUrl}
                    onChange={(e) => setAnalyzeImageUrl(e.target.value)}
                    placeholder="Paste image URL…"
                    className="flex-1 bg-transparent text-sm placeholder:text-white/25 focus:outline-none min-w-0"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-white/30">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <label className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all cursor-pointer text-white/50 hover:text-white text-xs mb-3">
                <Upload className="w-4 h-4" />
                Upload image from your device
                <input type="file" accept="image/*" className="hidden" onChange={handleAnalyzeImageUpload} />
              </label>

              {analyzeError && <p className="text-xs text-red-400 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{analyzeError}</p>}

              <div className="flex gap-2">
                <button onClick={() => setShowAnalyzeDialog(false)} className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-sm transition-colors text-white/70">Cancel</button>
                <button onClick={runAnalyzeImage} disabled={!analyzeImageUrl.trim() || analyzeProcessing}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-sm transition-colors flex items-center justify-center gap-2 font-medium">
                  {analyzeProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Scan className="w-4 h-4" /> Analyze & Convert</>}
                </button>
              </div>
            </>
          )}

          {analyzeStep === "result" && analyzeResult && (
            <>
              {/* Design Analysis */}
              {analyzeResult.designAnalysis && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-1.5">Design Analysis</p>
                  <p className="text-xs text-white/70 leading-relaxed">{analyzeResult.designAnalysis}</p>
                </div>
              )}

              {/* Extracted Color System */}
              {analyzeResult.colorSystem && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">Extracted Colors</p>
                  <div className="flex gap-2">
                    {Object.entries(analyzeResult.colorSystem).map(([name, color]) => (
                      <div key={name} className="flex flex-col items-center gap-1">
                        <div className="w-8 h-8 rounded-lg border border-white/20" style={{ backgroundColor: color }} />
                        <span className="text-[8px] text-white/40 capitalize">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Layout & Typography */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {analyzeResult.layoutStructure && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Layout</p>
                    <p className="text-[10px] text-white/60 leading-relaxed">{analyzeResult.layoutStructure}</p>
                  </div>
                )}
                {analyzeResult.typographyStyle && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Typography</p>
                    <p className="text-[10px] text-white/60 leading-relaxed">{analyzeResult.typographyStyle}</p>
                  </div>
                )}
              </div>

              {/* Layer count */}
              {analyzeResult.layers && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">
                    {analyzeResult.layers.length} Detected Layers
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {analyzeResult.layers.map((layer: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 bg-white/3 rounded-lg px-2 py-1.5">
                        <span className="text-[9px] font-mono text-white/25 w-4">{i + 1}</span>
                        <div className="w-3 h-3 rounded shrink-0 border border-white/15" style={{ backgroundColor: layer.style?.fill || "#888" }} />
                        <span className="text-[10px] text-white/60 flex-1 truncate">{layer.name || layer.type}</span>
                        <span className="text-[9px] text-white/25 capitalize">{layer.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setAnalyzeStep("input"); setAnalyzeResult(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-sm transition-colors text-white/70">
                  <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Try Another
                </button>
                <button onClick={applyAnalyzedLayout} disabled={!analyzeResult.fabricLayout}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-sm transition-colors flex items-center justify-center gap-2 font-medium">
                  <Layers className="w-4 h-4" /> Apply Layers
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ═══ IMAGE GENERATOR DIALOG ══════════════════════════════════════════ */}
      {showImgDialog && (
        <Modal onClose={() => setShowImgDialog(false)} title="AI Image Generator" icon={<ImagePlus className="w-4 h-4 text-emerald-400" />}>
          <p className="text-xs text-white/50 mb-4">Generate a unique image using AI and add it directly to your canvas.</p>

          {!imgResult ? (
            <>
              <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-2">Quick Ideas & Mockups</p>
              <div className="grid grid-cols-1 gap-1.5 mb-4">
                {[
                  `Abstract background with ${brand?.companyName || "brand"} colors ${palette.primary || ""} ${palette.secondary || ""}`,
                  `Professional ${brand?.industry || "business"} hero image, photorealistic, studio lighting`,
                  `Photorealistic mockup of a business card on a clean marble desk for ${brand?.companyName || "the brand"}, top-down view, soft shadows`,
                  `Photorealistic t-shirt mockup folded on wooden surface, branded for ${brand?.companyName || "the brand"}, natural lighting`,
                  `Product packaging mockup standing on minimalist studio backdrop, ${brand?.companyName || "brand"} colors ${palette.primary || ""} ${palette.accent || ""}, premium feel`,
                  `Storefront signage mockup on a modern building facade for ${brand?.companyName || "the brand"}, evening lighting, photorealistic`,
                  `Smartphone mockup floating on gradient background showing ${brand?.companyName || "brand"} app interface, professional render`,
                ].map((ex) => (
                  <button key={ex} onClick={() => setImgPrompt(ex)}
                    className="text-left text-xs bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 rounded-lg px-3 py-2 transition-all text-white/70 hover:text-white">
                    {ex}
                  </button>
                ))}
              </div>
              <textarea value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)}
                placeholder="Describe the image you want to create…"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-white/25 resize-none focus:outline-none focus:border-emerald-500/60 mb-3" />
              <div className="flex gap-2 mb-3">
                {[
                  { value: "1024x1024", label: "Square", sub: "1:1" },
                  { value: "1024x1536", label: "Portrait", sub: "2:3" },
                  { value: "1536x1024", label: "Landscape", sub: "3:2" },
                ].map((s) => (
                  <button key={s.value} onClick={() => setImgSize(s.value as any)}
                    className={cn("flex-1 py-2 rounded-xl text-xs border transition-colors flex flex-col items-center",
                      imgSize === s.value ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-300" : "bg-white/5 border-white/10 text-white/50 hover:border-white/20")}>
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-[10px] opacity-60">{s.sub}</span>
                  </button>
                ))}
              </div>
              {imgError && <p className="text-xs text-red-400 mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{imgError}</p>}
              <div className="flex gap-2">
                <button onClick={() => setShowImgDialog(false)} className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-sm transition-colors text-white/70">Cancel</button>
                <button onClick={runImageGenerate} disabled={!imgPrompt.trim() || imgGenerating}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm transition-colors flex items-center justify-center gap-2 font-medium">
                  {imgGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {imgGenerating ? "Generating…" : "Generate Image"}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
                <img src={imgResult} alt="Generated" className="w-full object-cover" crossOrigin="anonymous" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setImgResult(null); setImgPrompt(""); }}
                  className="flex-1 py-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-sm transition-colors text-white/70">
                  Try Again
                </button>
                <button onClick={() => { addImageFromUrl(imgResult!); setShowImgDialog(false); }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm transition-colors flex items-center justify-center gap-2 font-medium">
                  <Plus className="w-4 h-4" /> Add to Canvas
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function Modal({ children, onClose, title, icon }: { children: React.ReactNode; onClose: () => void; title: string; icon: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#16162a] rounded-2xl border border-white/10 p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">{icon}</div>
            <h2 className="text-sm font-bold text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PropSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-2">{title}</p>
      {children}
    </div>
  );
}

function PropIn({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="text-[10px] text-white/30 block mb-0.5">{label}</span>
      <input type="number" value={Math.round(value)} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-violet-500/60 text-white/90" />
    </div>
  );
}

function ShapeBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-3 bg-white/5 hover:bg-violet-500/20 border border-white/8 hover:border-violet-500/40 rounded-xl transition-all text-white/50 hover:text-violet-300">
      {children}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

// ─── Vector PDF helpers ──────────────────────────────────────────────────────
// Convert a CSS color string ("#rrggbb", "#rgb", "rgb(…)", "rgba(…)") into
// {r,g,b,a} (0-255 for r/g/b, 0-1 for a). Returns null for un-parseable inputs
// so callers can simply skip drawing.
export function parseColor(input: unknown): { r: number; g: number; b: number; a: number } | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (!s || s === "transparent" || s === "none") return null;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgb) {
    return {
      r: Math.round(parseFloat(rgb[1])),
      g: Math.round(parseFloat(rgb[2])),
      b: Math.round(parseFloat(rgb[3])),
      a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1,
    };
  }
  return null;
}

// Map a Fabric font weight/style into one of jsPDF's standard PDF font styles.
// jsPDF only ships helvetica/times/courier with normal/bold/italic/bolditalic;
// for other fonts we still emit a font name and the PDF reader falls back.
function pdfFontStyle(weight: unknown, style: unknown): "normal" | "bold" | "italic" | "bolditalic" {
  const isBold = weight === "bold" || (typeof weight === "string" && /^[6-9]00|bold/i.test(weight)) || (typeof weight === "number" && weight >= 600);
  const isItalic = style === "italic" || style === "oblique";
  if (isBold && isItalic) return "bolditalic";
  if (isBold) return "bold";
  if (isItalic) return "italic";
  return "normal";
}

function pdfFontName(fontFamily: unknown): string {
  const f = typeof fontFamily === "string" ? fontFamily.toLowerCase() : "";
  if (f.includes("times") || f.includes("georgia") || f.includes("serif")) return "times";
  if (f.includes("courier") || f.includes("mono")) return "courier";
  return "helvetica";
}

// Draw a single Fabric object as native PDF primitives. Skips gracefully on
// unsupported types so a single weird object never breaks the whole export.
function drawObjectToPdf(pdf: jsPDF, obj: any) {
  if (!obj || obj.visible === false) return;

  const left = obj.left || 0;
  const top = obj.top || 0;
  const scaleX = obj.scaleX || 1;
  const scaleY = obj.scaleY || 1;
  const opacity = typeof obj.opacity === "number" ? obj.opacity : 1;
  const angle = obj.angle || 0;

  // jsPDF lacks a stable per-object opacity API in our version, so we
  // pre-multiply the alpha into the fill/stroke colors instead.
  const applyAlpha = (rgb: { r: number; g: number; b: number; a: number } | null, extra = 1): { r: number; g: number; b: number } | null => {
    if (!rgb) return null;
    const a = rgb.a * opacity * extra;
    if (a <= 0.01) return null;
    // Composite over white for an approximate look (PDF readers handle alpha
    // natively but jsPDF's basic API doesn't always pass it through cleanly).
    return {
      r: Math.round(rgb.r * a + 255 * (1 - a)),
      g: Math.round(rgb.g * a + 255 * (1 - a)),
      b: Math.round(rgb.b * a + 255 * (1 - a)),
    };
  };

  // Skip rotation handling for now — jsPDF supports it via .text(angle), but
  // shapes would need full matrix transforms. The 95% case is unrotated, so we
  // emit objects axis-aligned and accept some degradation for rotated ones.
  const _ = angle; // placeholder, intentional

  const t = obj.type;

  if (t === "rect") {
    const w = (obj.width || 0) * scaleX;
    const h = (obj.height || 0) * scaleY;
    const fillRgb = applyAlpha(parseColor(obj.fill));
    const strokeRgb = applyAlpha(parseColor(obj.stroke));
    const sw = obj.strokeWidth || 0;
    const rx = obj.rx || 0;
    const ry = obj.ry || rx;
    const mode = fillRgb && strokeRgb && sw > 0 ? "FD" : fillRgb ? "F" : strokeRgb && sw > 0 ? "S" : null;
    if (!mode) return;
    if (fillRgb) pdf.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b);
    if (strokeRgb) { pdf.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b); pdf.setLineWidth(sw); }
    if (rx > 0) pdf.roundedRect(left, top, w, h, rx, ry, mode as any);
    else pdf.rect(left, top, w, h, mode as any);
  } else if (t === "circle") {
    const r = (obj.radius || 0) * Math.max(scaleX, scaleY);
    const fillRgb = applyAlpha(parseColor(obj.fill));
    const strokeRgb = applyAlpha(parseColor(obj.stroke));
    const sw = obj.strokeWidth || 0;
    const mode = fillRgb && strokeRgb && sw > 0 ? "FD" : fillRgb ? "F" : strokeRgb && sw > 0 ? "S" : null;
    if (!mode) return;
    if (fillRgb) pdf.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b);
    if (strokeRgb) { pdf.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b); pdf.setLineWidth(sw); }
    pdf.circle(left + r, top + r, r, mode as any);
  } else if (t === "ellipse") {
    const rx = (obj.rx || 0) * scaleX;
    const ry = (obj.ry || 0) * scaleY;
    const fillRgb = applyAlpha(parseColor(obj.fill));
    if (!fillRgb) return;
    pdf.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b);
    pdf.ellipse(left + rx, top + ry, rx, ry, "F");
  } else if (t === "triangle") {
    const w = (obj.width || 0) * scaleX;
    const h = (obj.height || 0) * scaleY;
    const fillRgb = applyAlpha(parseColor(obj.fill));
    if (!fillRgb) return;
    pdf.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b);
    pdf.triangle(left + w / 2, top, left, top + h, left + w, top + h, "F");
  } else if (t === "line") {
    const strokeRgb = applyAlpha(parseColor(obj.stroke));
    if (!strokeRgb) return;
    pdf.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b);
    pdf.setLineWidth(obj.strokeWidth || 1);
    const x1 = (obj.x1 ?? 0) * scaleX + left;
    const y1 = (obj.y1 ?? 0) * scaleY + top;
    const x2 = (obj.x2 ?? 0) * scaleX + left;
    const y2 = (obj.y2 ?? 0) * scaleY + top;
    pdf.line(x1, y1, x2, y2);
  } else if (t === "i-text" || t === "textbox" || t === "text") {
    const text = String(obj.text || "");
    if (!text) return;
    const fillRgb = applyAlpha(parseColor(obj.fill));
    if (!fillRgb) return;
    const fontSize = (obj.fontSize || 16) * Math.max(scaleX, scaleY);
    pdf.setTextColor(fillRgb.r, fillRgb.g, fillRgb.b);
    pdf.setFontSize(fontSize);
    pdf.setFont(pdfFontName(obj.fontFamily), pdfFontStyle(obj.fontWeight, obj.fontStyle));
    // Fabric renders text top-anchored, jsPDF baseline-anchored. Adding the
    // font size approximates the baseline offset closely enough for design use.
    const lines = text.split("\n");
    const lineHeight = fontSize * (obj.lineHeight || 1.16);
    const align = (obj.textAlign === "center" || obj.textAlign === "right") ? obj.textAlign : "left";
    const widthAvail = (obj.width || 0) * scaleX;
    const xAnchor = align === "center" ? left + widthAvail / 2
      : align === "right" ? left + widthAvail : left;
    lines.forEach((line: string, i: number) => {
      pdf.text(line, xAnchor, top + fontSize * 0.85 + i * lineHeight, { align: align as any, baseline: "alphabetic" });
    });
  } else if (t === "image") {
    // Embed the image as PNG (raster). Use the underlying HTMLImageElement
    // when available; fall back to obj.src as a URL.
    const w = (obj.width || 0) * scaleX;
    const h = (obj.height || 0) * scaleY;
    if (w <= 0 || h <= 0) return;
    const elem = obj.getElement?.() || obj._element;
    let dataUrl: string | null = null;
    if (elem && elem instanceof HTMLImageElement && elem.complete && elem.naturalWidth > 0) {
      try {
        const tmp = document.createElement("canvas");
        tmp.width = elem.naturalWidth;
        tmp.height = elem.naturalHeight;
        tmp.getContext("2d")?.drawImage(elem, 0, 0);
        dataUrl = tmp.toDataURL("image/png");
      } catch { /* tainted canvas — skip */ }
    }
    if (dataUrl) pdf.addImage(dataUrl, "PNG", left, top, w, h);
  }
}
