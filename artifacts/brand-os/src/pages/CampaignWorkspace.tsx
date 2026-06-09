import { useParams, Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import {
  useGetCampaign, useUpdatePost, useRegeneratePost,
  getGetCampaignQueryKey, getGetPostQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, Edit3, Check, X, RefreshCw, Loader2, Hash, Image as ImageIcon,
  Megaphone, Sparkles, Wand2, Copy, CheckCircle2, Download, FileText,
  Mail, Newspaper, ChevronDown, TestTube2, Instagram, Linkedin, Twitter, Facebook,
  ZoomIn, BarChart2, Target, Settings2, Zap, Clock, Eye, Images,
  Upload, History, Trash2, Plus, Send,
} from "lucide-react";
import type { SocialPost } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { extractApiError, notifyError } from "@/lib/apiError";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostVariant {
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
}

interface LongFormContent {
  type: string;
  title: string;
  content: string;
  metaDescription?: string;
  subjectLine?: string;
}

type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

interface ImageGenOptions {
  customPrompt: string;
  size: ImageSize;
  customWidth?: number;
  customHeight?: number;
  model: "nano" | "mini" | "pro";
  overlayText: string;
  includeLogo: boolean;
  logoDataUrl?: string;
  referenceImages?: Array<{ dataUrl: string; label?: string }>;
}

interface PostImageHistoryEntry {
  url: string;
  prompt?: string;
  createdAt: string;
}

interface ReferenceImageItem {
  id: string;
  dataUrl: string;
  name: string;
  label: string;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  icon: React.ElementType;
}> = {
  instagram: { label: "Instagram", color: "#E1306C", bgColor: "bg-pink-50 dark:bg-pink-950/40", textColor: "text-pink-600 dark:text-pink-400", icon: Instagram },
  linkedin: { label: "LinkedIn", color: "#0A66C2", bgColor: "bg-blue-50 dark:bg-blue-950/40", textColor: "text-blue-600 dark:text-blue-400", icon: Linkedin },
  twitter: { label: "X / Twitter", color: "#000000", bgColor: "bg-slate-50 dark:bg-slate-900", textColor: "text-slate-700 dark:text-slate-300", icon: Twitter },
  facebook: { label: "Facebook", color: "#1877F2", bgColor: "bg-blue-50 dark:bg-blue-950/40", textColor: "text-blue-700 dark:text-blue-300", icon: Facebook },
};

function PlatformBadge({ platform }: { platform: string }) {
  const cfg = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.instagram;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold", cfg.bgColor, cfg.textColor)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// Strip background from logo using canvas (corner-sample approach)
async function removeLogoBackground(logoUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      // Sample the 4 corners to detect background color
      const corners = [
        [d[0], d[1], d[2]],
        [d[(canvas.width - 1) * 4], d[(canvas.width - 1) * 4 + 1], d[(canvas.width - 1) * 4 + 2]],
        [d[(canvas.height - 1) * canvas.width * 4], d[(canvas.height - 1) * canvas.width * 4 + 1], d[(canvas.height - 1) * canvas.width * 4 + 2]],
        [d[((canvas.height - 1) * canvas.width + canvas.width - 1) * 4], d[((canvas.height - 1) * canvas.width + canvas.width - 1) * 4 + 1], d[((canvas.height - 1) * canvas.width + canvas.width - 1) * 4 + 2]],
      ];
      const bgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
      const bgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
      const bgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);
      const tolerance = 50;
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.abs(d[i] - bgR) + Math.abs(d[i + 1] - bgG) + Math.abs(d[i + 2] - bgB);
        if (dist < tolerance) d[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(logoUrl);
    img.src = logoUrl;
  });
}

// ─── Image Generation Dialog ──────────────────────────────────────────────────

function AspectRatioIcon({ ratio }: { ratio: "portrait" | "square" | "landscape" | "auto" }) {
  if (ratio === "auto") return <Sparkles className="w-4 h-4" />;
  const w = ratio === "landscape" ? 20 : ratio === "square" ? 14 : 10;
  const h = ratio === "portrait" ? 20 : ratio === "square" ? 14 : 10;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="flex-shrink-0">
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

const PRESET_SIZES: { id: ImageSize | "custom"; label: string; sublabel: string; ratio: "portrait" | "square" | "landscape" | "auto"; w?: number; h?: number }[] = [
  { id: "1024x1024", label: "Square", sublabel: "1:1 · 1024", ratio: "square", w: 1024, h: 1024 },
  { id: "1024x1536", label: "Story", sublabel: "2:3 · Portrait", ratio: "portrait", w: 1024, h: 1536 },
  { id: "1536x1024", label: "Wide", sublabel: "3:2 · Landscape", ratio: "landscape", w: 1536, h: 1024 },
  { id: "auto",      label: "Auto",  sublabel: "AI picks", ratio: "auto" },
  { id: "custom",    label: "Custom", sublabel: "Enter W × H", ratio: "square" },
];

const ASPECT_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1:1",  w: 1080, h: 1080 },
  { label: "4:5",  w: 1080, h: 1350 },
  { label: "9:16", w: 1080, h: 1920 },
  { label: "16:9", w: 1920, h: 1080 },
  { label: "3:2",  w: 1500, h: 1000 },
  { label: "2:3",  w: 1000, h: 1500 },
  { label: "21:9", w: 2100, h: 900 },
  { label: "4:3",  w: 1200, h: 900 },
];

function ImageGenDialog({
  open,
  onClose,
  onGenerate,
  defaultPrompt,
  generating,
  brandLogoUrl,
  brandName,
  imageHistory,
  currentImageUrl,
  onRestoreFromHistory,
}: {
  open: boolean;
  onClose: () => void;
  onGenerate: (opts: ImageGenOptions) => void;
  defaultPrompt: string;
  generating: boolean;
  brandLogoUrl?: string | null;
  brandName: string;
  imageHistory: PostImageHistoryEntry[];
  currentImageUrl?: string | null;
  onRestoreFromHistory: (url: string) => Promise<void>;
}) {
  const [customPrompt, setCustomPrompt] = useState(defaultPrompt);
  const [overlayText, setOverlayText] = useState("");
  const [sizeMode, setSizeMode] = useState<ImageSize | "custom">("1024x1024");
  const [customW, setCustomW] = useState<number>(1080);
  const [customH, setCustomH] = useState<number>(1080);
  const [model, setModel] = useState<"nano" | "mini" | "pro">("pro");
  const [includeLogo, setIncludeLogo] = useState(!!brandLogoUrl);
  const [refImages, setRefImages] = useState<ReferenceImageItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [restoring, setRestoring] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!generating) {
      const t = setTimeout(() => setProgress(0), 350);
      return () => clearTimeout(t);
    }
    setProgress((p) => (p < 8 ? 8 : p));
    const interval = setInterval(() => {
      setProgress((p) => (p < 92 ? Math.min(92, p + Math.max(0.4, (92 - p) * 0.05)) : p));
    }, 350);
    return () => clearInterval(interval);
  }, [generating]);

  // Lock body scroll, focus the prompt, and trap Escape while dialog is open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = setTimeout(() => {
      promptRef.current?.focus({ preventScroll: true });
      const len = promptRef.current?.value.length ?? 0;
      promptRef.current?.setSelectionRange(len, len);
    }, 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !generating) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
    };
  }, [open, generating, onClose]);

  if (!open) return null;

  const models: { id: "nano" | "mini" | "pro"; label: string; desc: string; icon: React.ElementType }[] = [
    { id: "nano", label: "Nano", desc: "Fast, direct", icon: Zap },
    { id: "mini", label: "Mini", desc: "Enhanced", icon: Sparkles },
    { id: "pro", label: "GPT Pro", desc: "Best quality", icon: Wand2 },
  ];

  async function handleAddReferenceFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newItems: ReferenceImageItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await fileToDataUrl(file);
      newItems.push({
        id: Math.random().toString(36).slice(2),
        dataUrl,
        name: file.name,
        label: "",
      });
    }
    setRefImages((prev) => [...prev, ...newItems].slice(0, 6));
  }

  function removeRef(id: string) {
    setRefImages((prev) => prev.filter((r) => r.id !== id));
  }

  function setRefLabel(id: string, label: string) {
    setRefImages((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
  }

  function insertRefToken(idx: number) {
    const token = `@${idx + 1}`;
    setCustomPrompt((p) => (p.endsWith(" ") || p.length === 0 ? `${p}${token} ` : `${p} ${token} `));
  }

  function applyAspect(w: number, h: number) {
    setSizeMode("custom");
    setCustomW(w);
    setCustomH(h);
  }

  async function handleSubmit() {
    if (generating || !customPrompt.trim()) return;
    let size: ImageSize;
    let cW: number | undefined;
    let cH: number | undefined;
    if (sizeMode === "custom") {
      cW = customW;
      cH = customH;
      const r = customW / Math.max(1, customH);
      size = r > 1.2 ? "1536x1024" : r < 0.84 ? "1024x1536" : "1024x1024";
    } else {
      size = sizeMode;
    }
    onGenerate({
      customPrompt,
      size,
      customWidth: cW,
      customHeight: cH,
      model,
      overlayText,
      includeLogo,
      referenceImages: refImages.map((r) => ({ dataUrl: r.dataUrl, label: r.label.trim() || undefined })),
    });
  }

  async function handleRestore(url: string) {
    if (generating) return;
    setRestoring(url);
    try {
      await onRestoreFromHistory(url);
    } finally {
      setRestoring(null);
    }
  }

  const refTokensInPrompt = Array.from(customPrompt.matchAll(/@(\d+)/g)).map((m) => parseInt(m[1]!, 10));
  const invalidTokens = refTokensInPrompt.filter((n) => n < 1 || n > refImages.length);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain"
      onClick={() => { if (!generating) onClose(); }}
      onWheel={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-background sm:rounded-2xl rounded-t-2xl border border-card-border shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[92vh] overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_340px] grid-rows-[1fr_auto] lg:grid-rows-1 overscroll-contain"
      >
        {/* ─── Left column: design controls ─── */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-5 relative min-h-0">
          {/* Top loading bar */}
          {generating && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary/10">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary" /> AI Image Studio
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Upload reference images and reference them in the prompt with <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono">@1</code>, <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono">@2</code>…
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" disabled={generating}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Reference images section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-primary" />
                Reference Images <span className="text-muted-foreground font-normal">({refImages.length}/6)</span>
              </label>
              <label className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-primary/40 text-xs text-primary cursor-pointer hover:bg-primary/5 transition-colors",
                refImages.length >= 6 && "opacity-50 pointer-events-none"
              )}>
                <Upload className="w-3.5 h-3.5" /> Add
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { handleAddReferenceFiles(e.target.files); e.target.value = ""; }}
                />
              </label>
            </div>

            {refImages.length === 0 ? (
              <label className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors cursor-pointer text-center">
                <Plus className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Drop images or click to upload — order becomes <code className="font-mono">@1, @2…</code></span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { handleAddReferenceFiles(e.target.files); e.target.value = ""; }}
                />
              </label>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {refImages.map((r, idx) => (
                  <div key={r.id} className="group relative rounded-xl border border-border overflow-hidden bg-muted/30">
                    <div className="aspect-square relative">
                      <img src={r.dataUrl} alt={r.name} className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-mono font-semibold">
                        @{idx + 1}
                      </div>
                      <button
                        onClick={() => removeRef(r.id)}
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="p-1.5 flex items-center gap-1">
                      <input
                        type="text"
                        placeholder={`Label for @${idx + 1}`}
                        value={r.label}
                        onChange={(e) => setRefLabel(r.id, e.target.value)}
                        className="flex-1 min-w-0 px-1.5 py-1 text-[11px] bg-transparent border-0 focus:outline-none text-foreground placeholder:text-muted-foreground"
                      />
                      <button
                        onClick={() => insertRefToken(idx)}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
                        title="Insert into prompt"
                      >
                        @{idx + 1}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Logo reference toggle */}
          {brandLogoUrl && (
            <div
              onClick={() => !generating && setIncludeLogo(!includeLogo)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                includeLogo ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                generating && "opacity-60 pointer-events-none"
              )}
            >
              <img src={brandLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover border border-border flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">Use brand logo as visual reference</p>
                <p className="text-[11px] text-muted-foreground">Background removed · guides AI style and placement</p>
              </div>
              <div className={cn("w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all", includeLogo ? "border-primary bg-primary" : "border-muted-foreground")} />
            </div>
          )}

          {/* Main design prompt */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Design Description</label>
            <textarea
              ref={promptRef}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
              rows={5}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Describe the visual: style, mood, colors, subject, composition. Reference uploaded images with @1, @2…"
              disabled={generating}
            />
            {invalidTokens.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Prompt references {invalidTokens.map((n) => `@${n}`).join(", ")} but only {refImages.length} reference image(s) uploaded.
              </p>
            )}
          </div>

          {/* Overlay text */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Text in Design <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              placeholder="e.g. 'New Collection 2025' or brand tagline to render in the image..."
              disabled={generating}
            />
          </div>

          {/* Canvas size */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Canvas Size</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {PRESET_SIZES.map(({ id, label, sublabel, ratio }) => (
                <button
                  key={id}
                  onClick={() => setSizeMode(id)}
                  disabled={generating}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-all",
                    sizeMode === id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    generating && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <AspectRatioIcon ratio={ratio} />
                  <span className="font-semibold">{label}</span>
                  <span className={cn("text-[10px]", sizeMode === id ? "text-primary/70" : "text-muted-foreground")}>{sublabel}</span>
                </button>
              ))}
            </div>

            {sizeMode === "custom" && (
              <div className="mt-3 p-3 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Width (px)</label>
                    <input
                      type="number"
                      min={256}
                      max={4096}
                      value={customW}
                      onChange={(e) => setCustomW(Math.max(256, Math.min(4096, parseInt(e.target.value, 10) || 0)))}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      disabled={generating}
                    />
                  </div>
                  <span className="pb-2 text-muted-foreground">×</span>
                  <div className="flex-1">
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Height (px)</label>
                    <input
                      type="number"
                      min={256}
                      max={4096}
                      value={customH}
                      onChange={(e) => setCustomH(Math.max(256, Math.min(4096, parseInt(e.target.value, 10) || 0)))}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      disabled={generating}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ASPECT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => applyAspect(p.w, p.h)}
                      disabled={generating}
                      className={cn(
                        "px-2 py-1 rounded-md border text-[11px] font-medium transition-colors",
                        customW === p.w && customH === p.h
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  AI generation supports 1:1, 2:3, and 3:2 — custom dimensions snap to the closest aspect ratio.
                </p>
              </div>
            )}
          </div>

          {/* AI model */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Prompt Quality</label>
            <div className="grid grid-cols-3 gap-2">
              {models.map(({ id, label, desc, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setModel(id)}
                  disabled={generating}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all",
                    model === id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    generating && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-semibold">{label}</span>
                  <span className={cn("text-[10px]", model === id ? "text-primary/70" : "text-muted-foreground")}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-3 pt-1 sticky bottom-0 bg-background pt-3 -mx-6 px-6 border-t border-border">
            <button
              onClick={onClose}
              disabled={generating}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              {generating ? "Generating..." : "Cancel"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={generating || !customPrompt.trim()}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating
                ? `Generating ${Math.round(progress)}%`
                : `Generate${refImages.length > 0 ? ` with ${refImages.length} ref${refImages.length === 1 ? "" : "s"}` : ""}`}
            </button>
          </div>
        </div>

        {/* ─── Right column: history & current ─── */}
        <div className="border-t lg:border-t-0 lg:border-l border-border bg-muted/20 overflow-y-auto p-4 sm:p-5 space-y-4 max-h-[40vh] lg:max-h-none">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-primary" /> Current
              </h4>
              <div className="mt-2 rounded-xl overflow-hidden border border-border bg-background">
                {currentImageUrl ? (
                  <img src={currentImageUrl} alt="Current" className="w-full aspect-square object-cover" />
                ) : (
                  <div className="aspect-square flex items-center justify-center text-muted-foreground text-xs">
                    <ImageIcon className="w-8 h-8 opacity-40" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <History className="w-4 h-4 text-primary" /> History
                {imageHistory.length > 0 && (
                  <span className="text-[10px] font-normal text-muted-foreground">({imageHistory.length})</span>
                )}
              </h4>
              {imageHistory.length === 0 ? (
                <p className="mt-2 text-[11px] text-muted-foreground italic">
                  Past generations will appear here so you can compare and restore.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {imageHistory.map((h, i) => (
                    <button
                      key={`${h.url}-${i}`}
                      onClick={() => handleRestore(h.url)}
                      disabled={generating || restoring !== null}
                      className="group relative rounded-lg overflow-hidden border border-border hover:border-primary transition-colors disabled:opacity-60"
                      title={h.prompt ? h.prompt.slice(0, 200) : "Restore"}
                    >
                      <img src={h.url} alt="History" className="w-full aspect-square object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                        {restoring === h.url ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <span className="text-[10px] text-white font-semibold opacity-0 group-hover:opacity-100">Restore</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="hidden lg:block text-[10px] text-muted-foreground border-t border-border pt-3">
            Brand: <span className="text-foreground font-medium">{brandName}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Post Preview Dialog ──────────────────────────────────────────────────────

function PostPreviewDialog({
  open, onClose, post, brandName, brandLogoUrl, brandPrimaryColor,
}: {
  open: boolean;
  onClose: () => void;
  post: SocialPost;
  brandName: string;
  brandLogoUrl?: string | null;
  brandPrimaryColor: string;
}) {
  const [platform, setPlatform] = useState(post.platform ?? "instagram");
  if (!open) return null;

  const platforms = [
    { id: "instagram", label: "Instagram", icon: Instagram },
    { id: "linkedin", label: "LinkedIn", icon: Linkedin },
    { id: "twitter", label: "Twitter / X", icon: Twitter },
    { id: "facebook", label: "Facebook", icon: Facebook },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Dialog header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Post Preview</span>
          </div>
          <div className="flex items-center gap-1">
            {platforms.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPlatform(id)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  platform === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
            <button onClick={onClose} className="ml-2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Instagram preview */}
        {platform === "instagram" && (
          <div className="bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: brandPrimaryColor }}>
                {brandLogoUrl ? <img src={brandLogoUrl} className="w-full h-full rounded-full object-cover" /> : brandName[0]}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">{brandName.toLowerCase().replace(/\s/g, "_")}</p>
              </div>
              <span className="text-muted-foreground">···</span>
            </div>
            {post.imageUrl
              ? <img src={post.imageUrl} className="w-full aspect-square object-cover" />
              : <div className="aspect-square bg-gradient-to-br from-pink-100 to-purple-100 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center"><ImageIcon className="w-10 h-10 text-pink-300" /></div>
            }
            <div className="px-3 pt-2 pb-3">
              <div className="flex items-center gap-3 mb-2 text-zinc-800 dark:text-zinc-200">
                <span>♥</span><span>💬</span><span>✈</span>
                <span className="ml-auto">🔖</span>
              </div>
              <p className="text-xs text-zinc-900 dark:text-white leading-relaxed">
                <span className="font-semibold">{brandName.toLowerCase().replace(/\s/g, "_")} </span>
                {post.caption.slice(0, 120)}{post.caption.length > 120 ? "... more" : ""}
              </p>
              <p className="text-xs text-blue-500 mt-1">{post.hashtags.slice(0, 5).join(" ")}</p>
            </div>
          </div>
        )}

        {/* LinkedIn preview */}
        {platform === "linkedin" && (
          <div className="bg-[#f3f2ef] dark:bg-zinc-800 p-3 space-y-2">
            <div className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 p-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: brandPrimaryColor }}>
                  {brandLogoUrl ? <img src={brandLogoUrl} className="w-full h-full rounded-full object-cover" /> : brandName[0]}
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-900 dark:text-white">{brandName}</p>
                  <p className="text-[10px] text-zinc-500">Company · Just now</p>
                </div>
              </div>
              <p className="px-3 pb-3 text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">{post.caption.slice(0, 200)}{post.caption.length > 200 ? "..." : ""}</p>
              {post.imageUrl && <img src={post.imageUrl} className="w-full aspect-video object-cover" />}
              <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-700 flex gap-4 text-[11px] text-zinc-500">
                <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span>
              </div>
            </div>
          </div>
        )}

        {/* Twitter preview */}
        {platform === "twitter" && (
          <div className="bg-black p-3">
            <div className="flex gap-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: brandPrimaryColor }}>
                {brandLogoUrl ? <img src={brandLogoUrl} className="w-full h-full rounded-full object-cover" /> : brandName[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-bold text-white">{brandName}</p>
                  <p className="text-xs text-zinc-500">@{brandName.toLowerCase().replace(/\s/g,"_")} · now</p>
                </div>
                <p className="text-sm text-white leading-relaxed mt-1">{post.hook}</p>
                {post.imageUrl && <img src={post.imageUrl} className="w-full rounded-xl mt-2 aspect-video object-cover" />}
                <div className="flex gap-5 mt-2 text-zinc-500 text-xs">
                  <span>💬 0</span><span>🔁 0</span><span>♥ 0</span><span>📤</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Facebook preview */}
        {platform === "facebook" && (
          <div className="bg-[#f0f2f5] dark:bg-zinc-800 p-3">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 p-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: brandPrimaryColor }}>
                  {brandLogoUrl ? <img src={brandLogoUrl} className="w-full h-full rounded-full object-cover" /> : brandName[0]}
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-900 dark:text-white">{brandName}</p>
                  <p className="text-[10px] text-zinc-500">Just now · 🌐</p>
                </div>
              </div>
              <p className="px-3 pb-2 text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">{post.caption.slice(0, 200)}{post.caption.length > 200 ? "..." : ""}</p>
              {post.imageUrl && <img src={post.imageUrl} className="w-full aspect-video object-cover" />}
              <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-700 flex gap-4 text-[11px] text-zinc-500">
                <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  published: { label: "Published", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  failed:    { label: "Failed",    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function PostCard({ post, brandLogoUrl, brandName, brandPrimaryColor, onSave, onRegenerate, onGenerateImage, onRestoreImage, onPublishNow, publishingNow }: {
  post: SocialPost;
  brandLogoUrl?: string | null;
  brandName: string;
  brandPrimaryColor: string;
  onSave: (id: number, data: Partial<SocialPost>) => Promise<void>;
  onRegenerate: (id: number) => Promise<void>;
  onGenerateImage: (id: number, opts: ImageGenOptions) => Promise<SocialPost | undefined>;
  onRestoreImage: (id: number, url: string) => Promise<void>;
  onPublishNow?: (id: number) => void;
  publishingNow?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVariant, setGeneratingVariant] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [showContentDropdown, setShowContentDropdown] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [variant, setVariant] = useState<PostVariant | null>(null);
  const [longFormContent, setLongFormContent] = useState<LongFormContent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"post" | "variant" | "content">("post");
  const [imageExpanded, setImageExpanded] = useState(false);

  const [draft, setDraft] = useState({
    hook: post.hook,
    caption: post.caption,
    cta: post.cta,
    imagePrompt: post.imagePrompt,
    hashtags: post.hashtags.join(" "),
  });

  async function save() {
    setSaving(true);
    await onSave(post.id, {
      hook: draft.hook,
      caption: draft.caption,
      cta: draft.cta,
      imagePrompt: draft.imagePrompt,
      hashtags: draft.hashtags.split(/\s+/).filter(Boolean),
    });
    setSaving(false);
    setEditing(false);
    setDraft({ hook: post.hook, caption: post.caption, cta: post.cta, imagePrompt: post.imagePrompt, hashtags: post.hashtags.join(" ") });
  }

  async function regen() {
    setRegenerating(true);
    await onRegenerate(post.id);
    setRegenerating(false);
    setVariant(null);
  }

  async function handleGenerateWithOptions(opts: ImageGenOptions) {
    if (generatingImage) return;
    setShowImageDialog(false);
    setGeneratingImage(true);

    try {
      let logoDataUrl: string | undefined;
      if (opts.includeLogo && brandLogoUrl) {
        logoDataUrl = await removeLogoBackground(brandLogoUrl);
      }
      await onGenerateImage(post.id, { ...opts, logoDataUrl });
    } catch (err) {
      notifyError("Image generation failed", err);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleRestoreFromHistory(url: string) {
    if (generatingImage) return;
    setGeneratingImage(true);
    try {
      await onRestoreImage(post.id, url);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function downloadImage() {
    const src = post.imageUrl;
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `${brandName.replace(/\s+/g, "-")}-day${post.day}.jpg`;
    a.click();
  }

  async function generateVariant() {
    setGeneratingVariant(true);
    setActivePanel("variant");
    try {
      const res = await fetch(`/api/posts/${post.id}/generate-variant`, { method: "POST" });
      if (!res.ok) throw new Error(await extractApiError(res, "Variant generation failed"));
      const data = await res.json() as PostVariant;
      setVariant(data);
    } catch (err) {
      setVariant(null);
      notifyError("Variant generation failed", err);
    } finally {
      setGeneratingVariant(false);
    }
  }

  async function generateLongForm(type: "blog" | "email" | "newsletter") {
    setGeneratingContent(true);
    setShowContentDropdown(false);
    setActivePanel("content");
    try {
      const res = await fetch(`/api/posts/${post.id}/generate-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: type }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Content generation failed"));
      const data = await res.json() as LongFormContent;
      setLongFormContent(data);
    } catch (err) {
      setLongFormContent(null);
      notifyError("Content generation failed", err);
    } finally {
      setGeneratingContent(false);
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function cancel() {
    setDraft({ hook: post.hook, caption: post.caption, cta: post.cta, imagePrompt: post.imagePrompt, hashtags: post.hashtags.join(" ") });
    setEditing(false);
  }

  const displayImage = post.imageUrl;

  return (
    <>
      <ImageGenDialog
        open={showImageDialog}
        onClose={() => setShowImageDialog(false)}
        onGenerate={handleGenerateWithOptions}
        defaultPrompt={post.imagePrompt}
        generating={generatingImage}
        brandLogoUrl={brandLogoUrl}
        brandName={brandName}
        imageHistory={(post as unknown as { imageHistory?: PostImageHistoryEntry[] }).imageHistory ?? []}
        currentImageUrl={post.imageUrl}
        onRestoreFromHistory={handleRestoreFromHistory}
      />
      <PostPreviewDialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        post={post}
        brandName={brandName}
        brandLogoUrl={brandLogoUrl}
        brandPrimaryColor={brandPrimaryColor}
      />

      <div className="rounded-xl border border-card-border bg-card overflow-hidden flex flex-col">
        {displayImage ? (
          <div className="relative group">
            <img
              src={displayImage}
              alt={`Day ${post.day} visual`}
              className={cn("w-full object-cover transition-all cursor-pointer", imageExpanded ? "aspect-auto" : "aspect-video")}
              onClick={() => setImageExpanded((v) => !v)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent pointer-events-none" />
            <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setImageExpanded((v) => !v)} className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-colors">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadImage}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-slate-800 text-xs font-semibold hover:bg-white transition-colors backdrop-blur-sm shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              </div>
              <button
                onClick={() => setShowImageDialog(true)}
                disabled={generatingImage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-medium backdrop-blur-sm transition-colors disabled:opacity-60"
              >
                {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {generatingImage ? "Generating..." : "Regenerate"}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-video bg-gradient-to-br from-muted/60 to-muted/30 flex flex-col items-center justify-center gap-3 border-b border-card-border">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ImageIcon className="w-7 h-7 text-primary/50" />
            </div>
            <p className="text-xs text-muted-foreground max-w-[200px] text-center">{post.imagePrompt.slice(0, 60)}...</p>
            <button
              onClick={() => setShowImageDialog(true)}
              disabled={generatingImage}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
            >
              {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generatingImage ? "Generating AI Image..." : "Generate AI Image"}
            </button>
            <p className="text-[11px] text-muted-foreground">AI generates image + auto-embeds brand logo</p>
          </div>
        )}

        {/* Card header */}
        <div className="px-4 py-3 bg-muted/30 border-b border-card-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
              {post.day}
            </div>
            <span className="text-sm font-semibold text-foreground">Day {post.day}</span>
            <PlatformBadge platform={post.platform} />
            {(() => {
              const status = (post as unknown as Record<string, unknown>).publishStatus as string | undefined;
              if (!status || status === "draft") return null;
              const scheduledAt = (post as unknown as Record<string, unknown>).scheduledAt as string | null;
              const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
              return (
                <div className="flex items-center gap-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>
                    {status === "scheduled" && <Clock className="w-2.5 h-2.5" />}
                    {status === "published" && <CheckCircle2 className="w-2.5 h-2.5" />}
                    {badge.label}
                  </span>
                  {scheduledAt && status === "scheduled" && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(scheduledAt).toLocaleDateString("en-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {onPublishNow && !editing && (post as unknown as Record<string, unknown>).publishStatus !== "published" && (
              <button
                onClick={() => onPublishNow(post.id)}
                disabled={publishingNow}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors"
              >
                {publishingNow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {publishingNow ? "Publishing..." : "Publish Now"}
              </button>
            )}
            {editing ? (
              <>
                <button onClick={cancel} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button onClick={save} disabled={saving} className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2.5 py-1.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                </button>
              </>
            ) : (
              <>
                <button onClick={regen} disabled={regenerating} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </button>
                <button onClick={generateVariant} disabled={generatingVariant} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  {generatingVariant ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                  A/B Variant
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowContentDropdown((v) => !v)}
                    disabled={generatingContent}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors"
                  >
                    {generatingContent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                    {generatingContent ? "Generating..." : "Long-Form"}
                    {!generatingContent && <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showContentDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-card-border bg-card shadow-lg z-20 py-1 overflow-hidden">
                      {([
                        { key: "blog", label: "Blog Post", icon: FileText },
                        { key: "email", label: "Email Campaign", icon: Mail },
                        { key: "newsletter", label: "Newsletter", icon: Newspaper },
                      ] as const).map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => generateLongForm(key)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-foreground hover:bg-muted/50 transition-colors text-left"
                        >
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowPreview(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
              </>
            )}
          </div>
        </div>

        {/* Panel tabs */}
        {(variant || longFormContent) && !editing && (
          <div className="flex border-b border-card-border">
            {[
              { id: "post" as const, label: "Post A", icon: Megaphone },
              ...(variant ? [{ id: "variant" as const, label: "Post B (Variant)", icon: TestTube2 }] : []),
              ...(longFormContent ? [{ id: "content" as const, label: longFormContent.type === "blog" ? "Blog Post" : longFormContent.type === "email" ? "Email" : "Newsletter", icon: FileText }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors flex-1 justify-center",
                  activePanel === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="w-3 h-3" /> {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content panels */}
        <div className="p-5 space-y-4 flex-1">
          {(activePanel === "post" || (activePanel === "variant" && generatingVariant)) && (
            <>
              <PostTextField label="Hook" value={editing ? draft.hook : post.hook} editing={editing} onChange={(v) => setDraft((d) => ({ ...d, hook: v }))} onCopy={() => copyText(post.hook, "hook")} copied={copied === "hook"} />
              <PostTextArea label="Caption" value={editing ? draft.caption : post.caption} editing={editing} rows={5} onChange={(v) => setDraft((d) => ({ ...d, caption: v }))} onCopy={() => copyText(post.caption, "caption")} copied={copied === "caption"} />
              <PostTextField label="Call to Action" value={editing ? draft.cta : post.cta} editing={editing} onChange={(v) => setDraft((d) => ({ ...d, cta: v }))} onCopy={() => copyText(post.cta, "cta")} copied={copied === "cta"} isHighlight />
              <HashtagsField value={editing ? draft.hashtags : post.hashtags.join(" ")} editing={editing} tags={post.hashtags} onChange={(v) => setDraft((d) => ({ ...d, hashtags: v }))} onCopy={() => copyText(post.hashtags.join(" "), "tags")} copied={copied === "tags"} />
              <ImagePromptField value={editing ? draft.imagePrompt : post.imagePrompt} editing={editing} onChange={(v) => setDraft((d) => ({ ...d, imagePrompt: v }))} />
            </>
          )}

          {activePanel === "variant" && !generatingVariant && variant && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <TestTube2 className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This is your <strong>B variant</strong> — a different creative angle for A/B testing.
                </p>
              </div>
              <PostTextField label="Variant Hook" value={variant.hook} editing={false} onCopy={() => copyText(variant.hook, "vhook")} copied={copied === "vhook"} />
              <PostTextArea label="Variant Caption" value={variant.caption} editing={false} rows={5} onCopy={() => copyText(variant.caption, "vcaption")} copied={copied === "vcaption"} />
              <PostTextField label="Variant CTA" value={variant.cta} editing={false} onCopy={() => copyText(variant.cta, "vcta")} copied={copied === "vcta"} isHighlight />
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Hash className="w-3 h-3" /> Variant Hashtags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {variant.hashtags.map((tag, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium">{tag}</span>
                  ))}
                </div>
              </div>
              <button
                onClick={async () => {
                  await onSave(post.id, {
                    hook: variant.hook, caption: variant.caption, cta: variant.cta,
                    hashtags: variant.hashtags, imagePrompt: variant.imagePrompt,
                  });
                  setVariant(null);
                  setActivePanel("post");
                }}
                className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
              >
                Apply Variant B → Replace Post A
              </button>
            </div>
          )}

          {activePanel === "content" && longFormContent && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                <p className="text-xs text-violet-700 dark:text-violet-300">
                  {longFormContent.type === "blog" ? "Blog post" : longFormContent.type === "email" ? "Email campaign" : "Newsletter"} generated from this post concept.
                </p>
              </div>
              {longFormContent.subjectLine && (
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Subject Line</p>
                  <p className="text-sm font-medium text-foreground">{longFormContent.subjectLine}</p>
                </div>
              )}
              {longFormContent.metaDescription && (
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Meta Description</p>
                  <p className="text-sm text-foreground">{longFormContent.metaDescription}</p>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{longFormContent.title}</p>
                  <button onClick={() => copyText(longFormContent.content, "content")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {copied === "content" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied === "content" ? "Copied!" : "Copy All"}
                  </button>
                </div>
                <div className="rounded-lg bg-muted/30 p-4 max-h-72 overflow-y-auto">
                  <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{longFormContent.content}</pre>
                </div>
              </div>
            </div>
          )}

          {activePanel === "variant" && generatingVariant && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Generating A/B variant...</p>
            </div>
          )}
          {activePanel === "content" && generatingContent && !longFormContent && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Generating long-form content...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Reusable field components ────────────────────────────────────────────────

function PostTextField({ label, value, editing, onChange, onCopy, copied, isHighlight }: {
  label: string; value: string; editing: boolean; onChange?: (v: string) => void;
  onCopy?: () => void; copied?: boolean; isHighlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
        {onCopy && !editing && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {editing && onChange ? (
        <input
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <p className={cn("text-sm leading-relaxed", isHighlight ? "text-primary font-medium" : "text-foreground")}>{value}</p>
      )}
    </div>
  );
}

function PostTextArea({ label, value, editing, onChange, rows, onCopy, copied }: {
  label: string; value: string; editing: boolean; onChange?: (v: string) => void;
  rows?: number; onCopy?: () => void; copied?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
        {onCopy && !editing && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {editing && onChange ? (
        <textarea
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          rows={rows ?? 5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{value}</p>
      )}
    </div>
  );
}

function HashtagsField({ value, editing, tags, onChange, onCopy, copied }: {
  value: string; editing: boolean; tags: string[]; onChange?: (v: string) => void; onCopy?: () => void; copied?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Hash className="w-3 h-3" /> Hashtags
        </label>
        {onCopy && !editing && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {editing && onChange ? (
        <input
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#hashtag1 #hashtag2"
        />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ImagePromptField({ value, editing, onChange }: {
  value: string; editing: boolean; onChange?: (v: string) => void;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3.5">
      <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        <ImageIcon className="w-3 h-3" /> AI Image Prompt
      </label>
      {editing && onChange ? (
        <textarea
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <p className="text-xs text-muted-foreground font-mono leading-relaxed">{value}</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignWorkspace() {
  const params = useParams<{ id: string }>();
  const campaignId = parseInt(params.id, 10);
  const queryClient = useQueryClient();

  const { data: campaign, isLoading } = useGetCampaign(campaignId, {
    query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) },
  });

  const updatePost = useUpdatePost();
  const regeneratePost = useRegeneratePost();
  const [publishingPostId, setPublishingPostId] = useState<number | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ generated: number; total: number } | null>(null);

  async function handlePublishNow(postId: number) {
    setPublishingPostId(postId);
    try {
      const res = await fetch(`${BASE}/api/posts/${postId}/publish`, { method: "POST" });
      if (!res.ok) throw new Error(await extractApiError(res, "Publish failed"));
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    } catch (err) {
      notifyError("Publish failed", err);
    } finally {
      setPublishingPostId(null);
    }
  }

  async function handleSavePost(id: number, data: Partial<SocialPost>) {
    await updatePost.mutateAsync({ id, data: { caption: data.caption, hook: data.hook, cta: data.cta, hashtags: data.hashtags, imagePrompt: data.imagePrompt } });
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
  }

  async function handleRegeneratePost(id: number) {
    await regeneratePost.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
  }

  function exportCampaignCSV() {
    if (!campaign?.posts) return;
    const posts = campaign.posts as (SocialPost & { day: number })[];
    const headers = ["Day", "Platform", "Hook", "Caption", "CTA", "Hashtags", "Image Prompt", "Has Image"];
    const rows = posts
      .sort((a, b) => a.day - b.day)
      .map((p) => [
        p.day,
        p.platform ?? "instagram",
        `"${(p.hook ?? "").replace(/"/g, '""')}"`,
        `"${(p.caption ?? "").replace(/"/g, '""')}"`,
        `"${(p.cta ?? "").replace(/"/g, '""')}"`,
        `"${(p.hashtags ?? []).join(" ").replace(/"/g, '""')}"`,
        `"${(p.imagePrompt ?? "").replace(/"/g, '""')}"`,
        p.imageUrl ? "Yes" : "No",
      ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${campaign.title?.replace(/\s+/g, "-") ?? "campaign"}-posts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkGenerateImages() {
    if (!campaign?.posts) return;
    setBulkGenerating(true);
    const total = (campaign.posts as SocialPost[]).filter((p) => !p.imageUrl).length;
    setBulkProgress({ generated: 0, total });
    try {
      const res = await fetch(`${BASE}/api/campaigns/${campaignId}/generate-all-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipExisting: true }),
      });
      const data = await res.json() as { generated: number; total: number };
      setBulkProgress({ generated: data.generated, total: data.total });
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    } finally {
      setBulkGenerating(false);
      setTimeout(() => setBulkProgress(null), 4000);
    }
  }

  async function handleGenerateImage(id: number, opts: ImageGenOptions): Promise<SocialPost | undefined> {
    const body: Record<string, unknown> = {
      customPrompt: opts.customPrompt,
      size: opts.size,
      model: opts.model,
      brandName: brandInfo?.companyName ?? undefined,
    };
    if (opts.overlayText) body.overlayText = opts.overlayText;
    if (opts.logoDataUrl) body.logoDataUrl = opts.logoDataUrl;
    if (opts.customWidth && opts.customHeight) {
      body.customWidth = opts.customWidth;
      body.customHeight = opts.customHeight;
    }
    if (opts.referenceImages && opts.referenceImages.length > 0) {
      body.referenceImages = opts.referenceImages;
    }

    const res = await fetch(`/api/posts/${id}/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(await extractApiError(res, "Image generation failed"));
    }
    const result = await res.json() as SocialPost;
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
    return result;
  }

  async function handleRestoreImage(id: number, url: string): Promise<void> {
    const res = await fetch(`/api/posts/${id}/restore-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error("Restore failed");
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Campaign not found</p>
        <Link href="/" className="text-primary text-sm hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const brandInfo = (campaign as unknown as { brand?: { logoUrl?: string; companyName?: string; primaryColor?: string } })?.brand;
  const brandLogoUrl = brandInfo?.logoUrl ?? undefined;
  const brandName = brandInfo?.companyName ?? "Brand";
  const brandPrimaryColor = brandInfo?.primaryColor ?? "#6366F1";

  type CampaignDay = { day: number; marketingAngle: string; postConcept: string; objective: string; cta: string };
  type CampaignPost = SocialPost & { day: number };

  return (
    <>
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="space-y-4">
        {/* Title row */}
        <div className="flex items-start gap-3">
          <Link
            href={`/brands/${campaign.brandId}/campaigns`}
            className="text-muted-foreground hover:text-foreground transition-colors mt-1 flex-shrink-0"
            title="Back to campaigns"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight break-words">
                {campaign.title}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-medium text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {campaign.days?.length ?? 0}d
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-medium text-muted-foreground">
                <Megaphone className="w-3 h-3" />
                {campaign.posts?.length ?? 0} posts
              </span>
            </div>
            {campaign.strategy && (
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
                {campaign.strategy}
              </p>
            )}
          </div>
        </div>

        {/* Action toolbar */}
        <div className="flex items-center gap-2 flex-wrap pl-8">
          <button
            onClick={handleBulkGenerateImages}
            disabled={bulkGenerating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/40 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
          >
            {bulkGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Images className="w-3.5 h-3.5" />}
            {bulkGenerating
              ? bulkProgress ? `${bulkProgress.generated}/${bulkProgress.total} images…` : "Generating…"
              : "Generate All Images"
            }
          </button>
          {bulkProgress && !bulkGenerating && (
            <span className="inline-flex items-center text-[11px] text-green-600 font-medium">
              {bulkProgress.generated} generated ✓
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={exportCampaignCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Campaign Timeline */}
      <div>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-muted-foreground" />
          Campaign Strategy Plan
        </h2>
        <div className="relative">
          <div className="absolute left-0 right-0 top-5 h-0.5 bg-border hidden sm:block" />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {(campaign.days as CampaignDay[] | undefined)?.map((day) => (
              <div key={day.day} className="relative flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold relative z-10 shadow-sm">
                  {day.day}
                </div>
                <div className="w-full rounded-xl border border-card-border bg-card p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider">{day.marketingAngle}</p>
                  <p className="text-[11px] text-foreground leading-snug font-medium">{day.postConcept}</p>
                  <p className="text-[10px] text-muted-foreground">{day.objective}</p>
                  <div className="pt-1 border-t border-border">
                    <p className="text-[10px] text-primary font-semibold">{day.cta}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Posts grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-muted-foreground" />
            Social Posts ({campaign.posts?.length ?? 0})
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border">
              <Settings2 className="w-3 h-3" /> Model & size control
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(campaign.posts as CampaignPost[] | undefined)
            ?.sort((a, b) => a.day - b.day)
            .map((post) => (
              <PostCard
                key={post.id}
                post={post}
                brandLogoUrl={brandLogoUrl}
                brandName={brandName}
                brandPrimaryColor={brandPrimaryColor}
                onSave={handleSavePost}
                onRegenerate={handleRegeneratePost}
                onGenerateImage={handleGenerateImage}
                onRestoreImage={handleRestoreImage}
                onPublishNow={handlePublishNow}
                publishingNow={publishingPostId === post.id}
              />
            ))}
        </div>
      </div>
    </div>
    </>
  );
}
