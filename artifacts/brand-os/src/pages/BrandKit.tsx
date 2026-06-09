import { useParams, Link } from "wouter";
import { useRef, useState } from "react";
import {
  useGetBrand, useGetBrandStats, useGenerateCampaign,
  getGetBrandQueryKey, getGetBrandStatsQueryKey, getListCampaignsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Sparkles, Loader2, Megaphone, Building2, Globe, Palette,
  MessageSquare, Users, Edit, X, Image as ImageIcon, Plus, BookOpen,
  Type, Target, Star, Copy, CheckCircle2, Wand2, Zap, Quote, Tag,
  Heart, Shield, RefreshCw, FileText, Instagram, Linkedin, Twitter, Facebook,
  CheckSquare, Square, Layers, BarChart2, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { extractApiError, notifyError } from "@/lib/apiError";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandKit {
  personality: string;
  positioning: string;
  toneOfVoice: string;
  audienceSegments: string[];
  visualStyle: string;
  colorPalette: Record<string, string>;
  visualStyleRules: string;
  brandStory?: string;
  missionStatement?: string;
  visionStatement?: string;
  taglines?: string[];
  brandKeywords?: string[];
  messagingPillars?: string[];
  dosCommunication?: string[];
  dontsCommunication?: string[];
  socialBio?: string;
  typographyRecommendations?: string;
  competitivePosition?: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorSwatch({ color, label }: { color: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(color).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={copy}>
      <div
        className="w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-md group-hover:scale-105 transition-transform"
        style={{ backgroundColor: color }}
      />
      <div className="text-center">
        <p className="text-[11px] font-semibold text-foreground capitalize">{label}</p>
        <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
          {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
          {color}
        </p>
      </div>
    </div>
  );
}

const styleLabels: Record<string, { label: string; className: string }> = {
  tech: { label: "Tech", className: "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300" },
  luxury: { label: "Luxury", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300" },
  bold: { label: "Bold", className: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-300" },
  minimal: { label: "Minimal", className: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300" },
};

function InfoCard({ icon: Icon, title, children, className, action }: {
  icon: React.ElementType; title: string; children: React.ReactNode; className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-card-border bg-card p-5", className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium", className)}>
      {children}
    </span>
  );
}

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  { id: "twitter", label: "X / Twitter", icon: Twitter },
  { id: "facebook", label: "Facebook", icon: Facebook },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BrandKit() {
  const params = useParams<{ id: string }>();
  const brandId = parseInt(params.id, 10);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [brief, setBrief] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [postCount, setPostCount] = useState(7);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"identity" | "content" | "strategy" | "story">("identity");
  const [generatingStory, setGeneratingStory] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [generatingBook, setGeneratingBook] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const briefFileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleGenerateBrandBook() {
    if (!brandId) return;
    setGeneratingBook(true); setBookError(null);
    try {
      const res = await fetch("/api/designs/generate-brand-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Failed to generate brand book"));
      await res.json();
      window.location.href = `/brands/${brandId}/book`;
    } catch (err) {
      setBookError(err instanceof Error ? err.message : "Failed to generate brand book");
      notifyError("Brand book generation failed", err);
    } finally {
      setGeneratingBook(false);
    }
  }

  const { data: brand, isLoading } = useGetBrand(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandQueryKey(brandId) },
  });
  const { data: stats } = useGetBrandStats(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandStatsQueryKey(brandId) },
  });

  const generateCampaignMutation = useGenerateCampaign();

  function togglePlatform(id: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((p) => p !== id) : prev) : [...prev, id]
    );
  }

  function handleRefImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX = 512;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            const ratio = Math.min(MAX / width, MAX / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
          setReferenceImages((prev) => [...prev.slice(0, 2), canvas.toDataURL("image/jpeg", 0.75)]);
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  async function handleGenerateCampaign() {
    setGenerating(true);
    setShowBriefModal(false);
    setGenerateError(null);
    try {
      const campaign = await generateCampaignMutation.mutateAsync({
        id: brandId,
        data: {
          brief: brief.trim() || undefined,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
          postCount,
          platforms: selectedPlatforms,
        } as Parameters<typeof generateCampaignMutation.mutateAsync>[0]["data"],
      });
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey(brandId) });
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setGenerating(false);
      const msg = err instanceof Error ? err.message : "Campaign generation failed. Please try again.";
      setGenerateError(msg);
      notifyError("Campaign generation failed", err);
    }
  }

  async function handleRegenerateBrandStory() {
    setGeneratingStory(true);
    setStoryError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/generate-story`, { method: "POST" });
      if (!res.ok) throw new Error(await extractApiError(res, "Story generation failed"));
      queryClient.invalidateQueries({ queryKey: getGetBrandQueryKey(brandId) });
    } catch (err) {
      setStoryError("Failed to regenerate story. Please try again.");
      notifyError("Story generation failed", err);
    } finally {
      setGeneratingStory(false);
    }
  }

  async function handleExportPdf() {
    if (!kit || !brand) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const W = 210;
      const H = 297;
      const primary = kit.colorPalette?.primary ?? "#6366F1";
      const secondary = kit.colorPalette?.secondary ?? "#8B5CF6";
      const accent = kit.colorPalette?.accent ?? "#EC4899";
      const bg = kit.colorPalette?.background ?? "#FFFFFF";
      const textCol = kit.colorPalette?.text ?? "#1E293B";
      const neutral = kit.colorPalette?.neutral ?? "#94A3B8";

      function hexToRgb(hex: string): [number, number, number] {
        const clean = hex.replace("#", "");
        const r = parseInt(clean.substring(0, 2), 16) || 0;
        const g = parseInt(clean.substring(2, 4), 16) || 0;
        const b = parseInt(clean.substring(4, 6), 16) || 0;
        return [r, g, b];
      }

      function setFill(hex: string) { doc.setFillColor(...hexToRgb(hex)); }
      function setDraw(hex: string) { doc.setDrawColor(...hexToRgb(hex)); }
      function setTextColor(hex: string) { doc.setTextColor(...hexToRgb(hex)); }

      function sectionHeader(title: string, y: number) {
        setFill(primary);
        doc.rect(14, y, 4, 6, "F");
        setTextColor(textCol);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(title.toUpperCase(), 22, y + 5);
        return y + 12;
      }

      function bodyText(text: string, x: number, y: number, maxW: number, lineHeight = 5): number {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        setTextColor(neutral);
        const lines = doc.splitTextToSize(text || "", maxW);
        doc.text(lines, x, y);
        return y + lines.length * lineHeight;
      }

      // ── PAGE 1: COVER ──────────────────────────────────────────────────────
      setFill(primary);
      doc.rect(0, 0, W, H * 0.6, "F");

      // Decorative circles
      const [pr, pg, pb] = hexToRgb(primary);
      doc.setFillColor(Math.min(pr + 30, 255), Math.min(pg + 30, 255), Math.min(pb + 30, 255));
      doc.circle(W - 30, 30, 50, "F");
      doc.setFillColor(Math.max(pr - 30, 0), Math.max(pg - 30, 0), Math.max(pb - 30, 0));
      doc.circle(20, H * 0.55, 40, "F");

      // Logo area
      if (brand.logoUrl && brand.logoUrl.startsWith("data:image")) {
        try {
          const format = brand.logoUrl.includes("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(brand.logoUrl, format, 14, 20, 40, 40, undefined, "FAST");
        } catch {
          setTextColor("#FFFFFF");
          doc.setFontSize(28);
          doc.setFont("helvetica", "bold");
          doc.text(brand.companyName.substring(0, 2).toUpperCase(), 14, 55);
        }
      } else {
        setFill("#FFFFFF");
        doc.roundedRect(14, 20, 40, 40, 6, 6, "F");
        setTextColor(primary);
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        const initials = brand.companyName.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
        doc.text(initials, 34, 45, { align: "center" });
      }

      // Brand name
      setTextColor("#FFFFFF");
      doc.setFontSize(32);
      doc.setFont("helvetica", "bold");
      doc.text(brand.companyName.toUpperCase(), 14, 85);

      // Industry
      doc.setFontSize(13);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(220, 220, 240);
      doc.text(brand.industry, 14, 95);

      // Tagline
      if (kit.taglines && kit.taglines.length > 0) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bolditalic");
        setTextColor("#FFFFFF");
        const taglineLines = doc.splitTextToSize(`"${kit.taglines[0]}"`, W - 28);
        doc.text(taglineLines, 14, 115);
      }

      // Document title
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(190, 190, 220);
      doc.text("Brand Identity Guidelines", 14, H * 0.6 - 10);

      // Bottom section (white)
      setFill("#FFFFFF");
      doc.rect(0, H * 0.6, W, H * 0.4, "F");

      // Quick summary boxes
      const summaryY = H * 0.6 + 15;
      const boxes = [
        { label: "Visual Style", value: kit.visualStyle?.toUpperCase() ?? "MINIMAL", color: primary },
        { label: "Personality", value: (kit.personality ?? "").substring(0, 30) + "...", color: secondary },
        { label: "Tone of Voice", value: (kit.toneOfVoice ?? "").substring(0, 30) + "...", color: accent },
      ];
      const boxW = (W - 28 - 10) / 3;
      boxes.forEach((box, i) => {
        const bx = 14 + i * (boxW + 5);
        setFill(box.color);
        doc.roundedRect(bx, summaryY, boxW, 4, 1, 1, "F");
        setTextColor(box.color);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text(box.label.toUpperCase(), bx, summaryY + 12);
        setTextColor(textCol);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const valLines = doc.splitTextToSize(box.value, boxW - 2);
        doc.text(valLines.slice(0, 2), bx, summaryY + 18);
      });

      // Footer
      setTextColor(neutral);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`${brand.companyName} · Confidential Brand Identity Document`, W / 2, H - 10, { align: "center" });

      // ── PAGE 2: COLOR SYSTEM ───────────────────────────────────────────────
      doc.addPage();

      setFill(primary);
      doc.rect(0, 0, W, 18, "F");
      setTextColor("#FFFFFF");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(brand.companyName.toUpperCase(), 14, 11);
      setTextColor("#FFFFFF");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("BRAND COLOR SYSTEM", W - 14, 11, { align: "right" });

      let yPos = 35;
      yPos = sectionHeader("Color Palette", yPos);

      const colorEntries = Object.entries(kit.colorPalette ?? {});
      const swatchSize = 28;
      const swatchCols = 5;
      const swatchGap = (W - 28) / swatchCols;

      colorEntries.forEach(([name, hex], i) => {
        const col = i % swatchCols;
        const row = Math.floor(i / swatchCols);
        const sx = 14 + col * swatchGap;
        const sy = yPos + row * (swatchSize + 22);

        setFill(hex as string);
        setDraw("#E2E8F0");
        doc.roundedRect(sx, sy, swatchSize, swatchSize, 4, 4, "FD");

        setTextColor(textCol);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(name.charAt(0).toUpperCase() + name.slice(1), sx, sy + swatchSize + 6);
        setTextColor(neutral);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text((hex as string).toUpperCase(), sx, sy + swatchSize + 12);
      });

      const swatchRows = Math.ceil(colorEntries.length / swatchCols);
      yPos += swatchRows * (swatchSize + 22) + 15;

      // Color usage rules
      yPos = sectionHeader("Color Usage Guide", yPos);

      const usageRules = [
        { color: primary, label: "Primary", usage: "Main brand color — use for CTAs, headlines, and key UI elements" },
        { color: secondary, label: "Secondary", usage: "Supporting color — use for backgrounds, badges, and secondary buttons" },
        { color: accent, label: "Accent", usage: "Highlight color — use sparingly for emphasis and interactive states" },
        { color: bg, label: "Background", usage: "Page/section background — use for large areas and containers" },
        { color: textCol, label: "Text", usage: "Primary text — use for body copy, headings, and labels" },
      ];

      usageRules.forEach((rule, i) => {
        const rx = 14;
        const ry = yPos + i * 14;
        setFill(rule.color);
        doc.roundedRect(rx, ry - 3.5, 8, 8, 2, 2, "F");
        setTextColor(textCol);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.text(rule.label, rx + 12, ry + 1);
        setTextColor(neutral);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(rule.usage, rx + 40, ry + 1);
      });

      // Page footer
      yPos = H - 15;
      setDraw("#E2E8F0");
      doc.setLineWidth(0.3);
      doc.line(14, yPos, W - 14, yPos);
      setTextColor(neutral);
      doc.setFontSize(7.5);
      doc.text(`${brand.companyName} Brand Identity · Page 2`, W / 2, yPos + 6, { align: "center" });

      // ── PAGE 3: TYPOGRAPHY & VISUAL IDENTITY ──────────────────────────────
      doc.addPage();

      setFill(primary);
      doc.rect(0, 0, W, 18, "F");
      setTextColor("#FFFFFF");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(brand.companyName.toUpperCase(), 14, 11);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("TYPOGRAPHY & VISUAL IDENTITY", W - 14, 11, { align: "right" });

      yPos = 35;
      yPos = sectionHeader("Typography System", yPos);

      // Heading example
      setFill("#F8FAFC");
      setDraw("#E2E8F0");
      doc.roundedRect(14, yPos, W - 28, 28, 4, 4, "FD");
      setTextColor(textCol);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(brand.companyName.toUpperCase(), 22, yPos + 12);
      setTextColor(neutral);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text("DISPLAY / HEADLINE · Weight 900 · Tracking -2 · Used for hero text and brand name", 22, yPos + 22);
      yPos += 33;

      setFill("#F8FAFC");
      doc.roundedRect(14, yPos, W - 28, 22, 4, 4, "FD");
      setTextColor(textCol);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${brand.industry} Excellence Redefined`, 22, yPos + 10);
      setTextColor(neutral);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text("SECTION HEADING · Weight 700 · Normal tracking · H2/H3 level", 22, yPos + 18);
      yPos += 27;

      if (brand.companyDescription) {
        setFill("#F8FAFC");
        doc.roundedRect(14, yPos, W - 28, 22, 4, 4, "FD");
        setTextColor(textCol);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const bodyLines = doc.splitTextToSize(brand.companyDescription.substring(0, 120), W - 44);
        doc.text(bodyLines.slice(0, 2), 22, yPos + 8);
        setTextColor(neutral);
        doc.setFontSize(7.5);
        doc.text("BODY TEXT · Weight 400 · 16px base · Normal spacing · Line height 1.6", 22, yPos + 18);
        yPos += 27;
      }

      if (kit.typographyRecommendations) {
        yPos += 5;
        setFill("#EFF6FF");
        setDraw("#BFDBFE");
        doc.roundedRect(14, yPos, W - 28, 22, 4, 4, "FD");
        setTextColor(textCol);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text("TYPOGRAPHY RECOMMENDATIONS", 22, yPos + 7);
        setTextColor(neutral);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const typoLines = doc.splitTextToSize(kit.typographyRecommendations, W - 44);
        doc.text(typoLines.slice(0, 2), 22, yPos + 14);
        yPos += 27;
      }

      yPos += 5;
      yPos = sectionHeader("Logo Usage Patterns", yPos);

      // Logo on different backgrounds
      const logoPatterns = [
        { bg: "#FFFFFF", label: "On White", border: "#E2E8F0" },
        { bg: primary, label: "On Primary", border: primary },
        { bg: textCol, label: "On Dark", border: textCol },
        { bg: secondary, label: "On Secondary", border: secondary },
      ];

      const patternW = (W - 28 - 15) / 4;
      logoPatterns.forEach((p, i) => {
        const px = 14 + i * (patternW + 5);
        const py = yPos;
        setFill(p.bg);
        setDraw(p.border);
        doc.setLineWidth(0.5);
        doc.roundedRect(px, py, patternW, patternW * 0.75, 4, 4, "FD");

        if (brand.logoUrl && brand.logoUrl.startsWith("data:image")) {
          try {
            const fmt = brand.logoUrl.includes("data:image/png") ? "PNG" : "JPEG";
            const lw = patternW * 0.6;
            const lh = patternW * 0.3;
            doc.addImage(brand.logoUrl, fmt, px + (patternW - lw) / 2, py + (patternW * 0.75 - lh) / 2, lw, lh, undefined, "FAST");
          } catch {
            const textColor = p.bg === "#FFFFFF" ? primary : "#FFFFFF";
            setTextColor(textColor);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            const initials = brand.companyName.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
            doc.text(initials, px + patternW / 2, py + patternW * 0.4, { align: "center" });
          }
        } else {
          const textColor = p.bg === "#FFFFFF" ? primary : "#FFFFFF";
          setTextColor(textColor);
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          const initials = brand.companyName.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
          doc.text(initials, px + patternW / 2, py + patternW * 0.4, { align: "center" });
        }

        setTextColor(neutral);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text(p.label, px + patternW / 2, py + patternW * 0.75 + 7, { align: "center" });
      });

      // Page footer
      yPos = H - 15;
      setDraw("#E2E8F0");
      doc.setLineWidth(0.3);
      doc.line(14, yPos, W - 14, yPos);
      setTextColor(neutral);
      doc.setFontSize(7.5);
      doc.text(`${brand.companyName} Brand Identity · Page 3`, W / 2, yPos + 6, { align: "center" });

      // ── PAGE 4: BRAND PERSONALITY & GUIDELINES ────────────────────────────
      doc.addPage();

      setFill(primary);
      doc.rect(0, 0, W, 18, "F");
      setTextColor("#FFFFFF");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(brand.companyName.toUpperCase(), 14, 11);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("BRAND PERSONALITY & GUIDELINES", W - 14, 11, { align: "right" });

      yPos = 35;
      yPos = sectionHeader("Mission & Vision", yPos);

      if (kit.missionStatement) {
        setFill("#F0FDF4");
        setDraw("#BBF7D0");
        doc.roundedRect(14, yPos, W - 28, 20, 3, 3, "FD");
        setTextColor(textCol);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text("MISSION", 22, yPos + 7);
        setTextColor(textCol);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bolditalic");
        const mLines = doc.splitTextToSize(`"${kit.missionStatement}"`, W - 44);
        doc.text(mLines.slice(0, 2), 22, yPos + 14);
        yPos += 25;
      }

      if (kit.visionStatement) {
        setFill("#FFF7ED");
        setDraw("#FED7AA");
        doc.roundedRect(14, yPos, W - 28, 20, 3, 3, "FD");
        setTextColor(textCol);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text("VISION", 22, yPos + 7);
        setTextColor(textCol);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bolditalic");
        const vLines = doc.splitTextToSize(`"${kit.visionStatement}"`, W - 44);
        doc.text(vLines.slice(0, 2), 22, yPos + 14);
        yPos += 25;
      }

      yPos += 5;
      yPos = sectionHeader("Brand Positioning & Personality", yPos);

      setTextColor(textCol);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text("Positioning:", 14, yPos + 1);
      yPos = bodyText(kit.positioning ?? "", 14, yPos + 6, W - 28);

      yPos += 5;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      setTextColor(textCol);
      doc.text("Personality:", 14, yPos + 1);
      yPos = bodyText(kit.personality ?? "", 14, yPos + 6, W - 28);

      yPos += 5;
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      setTextColor(textCol);
      doc.text("Tone of Voice:", 14, yPos + 1);
      yPos = bodyText(kit.toneOfVoice ?? "", 14, yPos + 6, W - 28);

      // Communication Dos and Don'ts
      if ((kit.dosCommunication?.length ?? 0) > 0 || (kit.dontsCommunication?.length ?? 0) > 0) {
        yPos += 8;
        yPos = sectionHeader("Communication Guide", yPos);

        const halfW = (W - 28 - 5) / 2;

        // Dos
        setFill("#F0FDF4");
        setDraw("#BBF7D0");
        doc.roundedRect(14, yPos, halfW, 4, 1, 1, "F");
        setTextColor("#16A34A");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("✓  DO", 14, yPos + 2.5);
        yPos += 8;
        (kit.dosCommunication ?? []).slice(0, 5).forEach((item) => {
          setTextColor("#15803D");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(`• ${item}`, halfW - 4);
          doc.text(lines.slice(0, 2), 14, yPos);
          yPos += lines.slice(0, 2).length * 4.5;
        });

        // Donts
        const dontsX = 14 + halfW + 5;
        let dontsY = yPos - (8 + (kit.dosCommunication ?? []).slice(0, 5).reduce((acc) => acc + 4.5, 0));
        setFill("#FFF1F2");
        setDraw("#FECDD3");
        doc.roundedRect(dontsX, dontsY, halfW, 4, 1, 1, "F");
        setTextColor("#DC2626");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("✗  DON'T", dontsX, dontsY + 2.5);
        dontsY += 8;
        (kit.dontsCommunication ?? []).slice(0, 5).forEach((item) => {
          setTextColor("#B91C1C");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(`• ${item}`, halfW - 4);
          doc.text(lines.slice(0, 2), dontsX, dontsY);
          dontsY += lines.slice(0, 2).length * 4.5;
        });
      }

      // Page footer
      yPos = H - 15;
      setDraw("#E2E8F0");
      doc.setLineWidth(0.3);
      doc.line(14, yPos, W - 14, yPos);
      setTextColor(neutral);
      doc.setFontSize(7.5);
      doc.text(`${brand.companyName} Brand Identity · Page 4`, W / 2, yPos + 6, { align: "center" });

      // ── PAGE 5: TAGLINES, KEYWORDS & SOCIAL ───────────────────────────────
      doc.addPage();

      setFill(primary);
      doc.rect(0, 0, W, 18, "F");
      setTextColor("#FFFFFF");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(brand.companyName.toUpperCase(), 14, 11);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("TAGLINES, KEYWORDS & SOCIAL", W - 14, 11, { align: "right" });

      yPos = 35;

      if (kit.taglines && kit.taglines.length > 0) {
        yPos = sectionHeader("Brand Taglines", yPos);
        kit.taglines.slice(0, 5).forEach((tagline, i) => {
          setFill(i === 0 ? primary : "#F8FAFC");
          setDraw(i === 0 ? primary : "#E2E8F0");
          doc.roundedRect(14, yPos, W - 28, 12, 3, 3, "FD");
          setTextColor(i === 0 ? "#FFFFFF" : textCol);
          doc.setFontSize(9.5);
          doc.setFont("helvetica", i === 0 ? "bolditalic" : "italic");
          doc.text(`"${tagline}"`, 22, yPos + 8);
          if (i === 0) {
            doc.setTextColor(200, 200, 220);
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.text("PRIMARY", W - 22, yPos + 8, { align: "right" });
          }
          yPos += 16;
        });
        yPos += 5;
      }

      if (kit.brandKeywords && kit.brandKeywords.length > 0) {
        yPos = sectionHeader("Brand Keywords", yPos);
        let kx = 14;
        kit.brandKeywords.slice(0, 16).forEach((kw) => {
          const kwWidth = doc.getTextWidth(kw) + 10;
          if (kx + kwWidth > W - 14) { kx = 14; yPos += 10; }
          setFill(primary + "15");
          setDraw(primary + "40");
          doc.setLineWidth(0.4);
          doc.roundedRect(kx, yPos - 5, kwWidth, 8, 2, 2, "FD");
          setTextColor(primary);
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.text(kw, kx + 5, yPos + 1);
          kx += kwWidth + 4;
        });
        yPos += 15;
      }

      if (kit.socialBio) {
        yPos = sectionHeader("Social Media Bio", yPos);
        setFill("#F8FAFC");
        setDraw("#E2E8F0");
        doc.roundedRect(14, yPos, W - 28, 20, 4, 4, "FD");
        setTextColor(textCol);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const bioLines = doc.splitTextToSize(kit.socialBio, W - 44);
        doc.text(bioLines.slice(0, 3), 22, yPos + 8);
        yPos += 28;
      }

      if (kit.messagingPillars && kit.messagingPillars.length > 0) {
        yPos = sectionHeader("Messaging Pillars", yPos);
        const pillarW = (W - 28 - (kit.messagingPillars.length - 1) * 4) / Math.min(kit.messagingPillars.length, 3);
        kit.messagingPillars.slice(0, 3).forEach((pillar, i) => {
          const px = 14 + i * (pillarW + 4);
          const colors = [primary, secondary, accent];
          setFill(colors[i % 3]);
          doc.roundedRect(px, yPos, pillarW, 3, 1, 1, "F");
          setTextColor(colors[i % 3]);
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.text(`0${i + 1}`, px, yPos + 12);
          setTextColor(textCol);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(pillar, pillarW - 2);
          doc.text(lines.slice(0, 3), px, yPos + 18);
        });
        yPos += 45;
      }

      // Page footer
      yPos = H - 15;
      setDraw("#E2E8F0");
      doc.setLineWidth(0.3);
      doc.line(14, yPos, W - 14, yPos);
      setTextColor(neutral);
      doc.setFontSize(7.5);
      doc.text(`${brand.companyName} Brand Identity · Page 5`, W / 2, yPos + 6, { align: "center" });

      // Save
      doc.save(`${brand.companyName.replace(/\s+/g, "-")}-brand-identity.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExportingPdf(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Brand not found</p>
        <Link href="/" className="text-primary text-sm hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const kit = brand.brandKit as BrandKit | null;
  const style = styleLabels[kit?.visualStyle ?? "minimal"] ?? styleLabels.minimal;

  const tabs = [
    { id: "identity" as const, label: "Visual Identity", icon: Palette },
    { id: "content" as const, label: "Content & Voice", icon: MessageSquare },
    { id: "strategy" as const, label: "Market Strategy", icon: Target },
    { id: "story" as const, label: "Brand Story", icon: BookOpen },
  ];

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      {/* Generating overlay */}
      {generating && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Creating your campaign...</h3>
            <p className="text-sm text-muted-foreground">AI is crafting {postCount} posts for {selectedPlatforms.join(", ")}. This takes 20–40 seconds.</p>
          </div>
          <div className="flex flex-col gap-2 text-left w-72">
            {["Analyzing brand kit & brief", "Building campaign narrative arc", "Writing platform-specific posts", "Creating image composition prompts", "Applying brand voice & tone"].map((step) => (
              <div key={step} className="flex items-center gap-3">
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
                <span className="text-sm text-muted-foreground">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign Brief Modal */}
      {showBriefModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl border border-card-border shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Campaign Brief</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Configure your AI-powered campaign</p>
              </div>
              <button onClick={() => setShowBriefModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Platform selector */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Target Platforms</label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map(({ id, label, icon: Icon }) => {
                  const selected = selectedPlatforms.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => togglePlatform(id)}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                        selected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      {selected ? <CheckSquare className="w-4 h-4 flex-shrink-0" /> : <Square className="w-4 h-4 flex-shrink-0" />}
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">At least one platform required</p>
            </div>

            {/* Post count */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Number of Posts <span className="ml-2 text-primary font-bold text-base">{postCount}</span>
              </label>
              <input
                type="range" min={1} max={14} value={postCount}
                onChange={(e) => setPostCount(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>1 post (quick)</span><span>14 posts (full campaign)</span>
              </div>
            </div>

            {/* Brief */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Campaign Instructions</label>
              <textarea
                className="w-full px-4 py-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={4}
                placeholder={`Examples:\n• Focus on product launch — create urgency and excitement\n• Target B2B decision-makers, keep it professional and data-driven\n• Summer campaign with vibrant, energetic tone`}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>

            {/* Reference images */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                <span className="flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5" /> Reference Images (optional, max 3)
                </span>
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                {referenceImages.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img} alt={`ref ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-card-border" />
                    <button
                      onClick={() => setReferenceImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {referenceImages.length < 3 && (
                  <label className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    <Plus className="w-5 h-5 text-muted-foreground" />
                    <input ref={briefFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleRefImageUpload} />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">These guide the visual style of AI-generated images</p>
            </div>

            {generateError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{generateError}</div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={() => setShowBriefModal(false)} className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleGenerateCampaign}
                disabled={generating}
                className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "Generating..." : `Generate ${postCount} Posts`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/" className="flex-shrink-0 mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.companyName} className="w-12 h-12 rounded-xl object-cover border border-card-border" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-foreground">{brand.companyName}</h1>
                <p className="text-sm text-muted-foreground">{brand.industry}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {kit && (
                <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border", style.className)}>
                  {style.label} Style
                </span>
              )}
              <Link href={`/brands/${brandId}/edit`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <Edit className="w-3.5 h-3.5" /> Edit
              </Link>
              <Link href={`/brands/${brandId}/design`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-sm text-primary hover:bg-primary/10 transition-colors">
                <Layers className="w-3.5 h-3.5" /> Design Studio
              </Link>
              {kit && (
                <Link href={`/brands/${brandId}/book`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <Type className="w-3.5 h-3.5" /> View Brand Book
                </Link>
              )}
              {kit && (
                <button
                  onClick={handleGenerateBrandBook}
                  disabled={generatingBook}
                  title={bookError || "Generate a complete 8-page A4 brand book"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-sm text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
                >
                  {generatingBook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {generatingBook ? "Building Brand Book..." : "Generate Brand Book"}
                </button>
              )}
              <Link href={`/brands/${brandId}/campaigns`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <Megaphone className="w-3.5 h-3.5" /> Campaigns ({stats?.totalCampaigns ?? 0})
              </Link>
              {kit && (
                <button
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
                >
                  {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {exportingPdf ? "Exporting..." : "Export PDF"}
                </button>
              )}
              <button
                onClick={() => navigate(`/brands/${brandId}/campaigns/new`)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Launch Campaign
              </button>
            </div>
          </div>
        </div>
      </div>

      {!kit ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
          <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">Brand kit not generated yet</h3>
          <p className="text-sm text-muted-foreground">Complete the brand wizard to generate your full brand identity.</p>
        </div>
      ) : (
        <>
          {/* Stats strip */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Campaigns", value: stats.totalCampaigns, icon: Megaphone },
                { label: "Posts Created", value: stats.totalPosts, icon: FileText },
                { label: "Images Generated", value: (stats as unknown as Record<string, unknown>).postsWithImages as number ?? 0, icon: ImageIcon },
                { label: "Brand Health", value: "94/100", icon: Star },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-card-border bg-card p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <s.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab navigation */}
          <div className="flex items-center gap-1 border-b border-border">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ─── VISUAL IDENTITY TAB ─────────────────────────────────────── */}
          {activeTab === "identity" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-5">
                {/* Color Palette */}
                <InfoCard icon={Palette} title="Brand Color System">
                  <div className="flex flex-wrap gap-5 mb-4">
                    {Object.entries(kit.colorPalette ?? {}).map(([key, color]) => (
                      <ColorSwatch key={key} color={color as string} label={key} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Click any swatch to copy hex code
                  </p>
                </InfoCard>

                {/* Typography */}
                <InfoCard icon={Type} title="Typography System">
                  <div className="space-y-3">
                    <div className="rounded-lg border border-card-border p-4">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Display / Headline</p>
                      <p className="text-3xl font-black text-foreground tracking-tight leading-none">{brand.companyName}</p>
                      <p className="text-xs text-muted-foreground mt-2">Weight 900 · Tight tracking · Used for hero text</p>
                    </div>
                    <div className="rounded-lg border border-card-border p-4">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Section Headings</p>
                      <p className="text-xl font-bold text-foreground">{brand.industry} Excellence Redefined</p>
                      <p className="text-xs text-muted-foreground mt-2">Weight 700 · Normal tracking · H2 level</p>
                    </div>
                    <div className="rounded-lg border border-card-border p-4">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Body Text</p>
                      <p className="text-sm text-foreground leading-relaxed">{brand.companyDescription?.slice(0, 140)}...</p>
                      <p className="text-xs text-muted-foreground mt-2">Weight 400 · Normal spacing · 16px base</p>
                    </div>
                    {kit.typographyRecommendations && (
                      <div className="rounded-lg bg-muted/30 p-3">
                        <p className="text-xs text-foreground leading-relaxed">{kit.typographyRecommendations}</p>
                      </div>
                    )}
                  </div>
                </InfoCard>

                {/* Visual Style Rules */}
                <InfoCard icon={Globe} title="Visual Design Rules">
                  <p className="text-sm text-foreground leading-relaxed">{kit.visualStyleRules}</p>
                </InfoCard>
              </div>

              <div className="space-y-5">
                {/* Brand Personality */}
                <InfoCard icon={Sparkles} title="Brand Personality">
                  <p className="text-sm text-foreground leading-relaxed">{kit.personality}</p>
                </InfoCard>

                {/* Mission & Vision */}
                {(kit.missionStatement || kit.visionStatement) && (
                  <InfoCard icon={Target} title="Mission & Vision">
                    <div className="space-y-3">
                      {kit.missionStatement && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Mission</p>
                          <p className="text-sm text-foreground font-medium leading-relaxed italic">"{kit.missionStatement}"</p>
                        </div>
                      )}
                      {kit.visionStatement && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Vision</p>
                          <p className="text-sm text-foreground font-medium leading-relaxed italic">"{kit.visionStatement}"</p>
                        </div>
                      )}
                    </div>
                  </InfoCard>
                )}

                {/* Taglines */}
                {kit.taglines && kit.taglines.length > 0 && (
                  <InfoCard icon={Quote} title="Brand Taglines">
                    <div className="space-y-2">
                      {kit.taglines.map((tagline, i) => (
                        <div key={i} className={cn("rounded-lg p-3", i === 0 ? "bg-primary/10 border border-primary/20" : "bg-muted/30")}>
                          <p className={cn("text-sm font-semibold", i === 0 ? "text-primary" : "text-foreground")}>
                            {i === 0 && <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70 block mb-0.5">Primary</span>}
                            "{tagline}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </InfoCard>
                )}

                {/* Generate Campaign CTA */}
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Wand2 className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Launch Campaign</h2>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Generate a multi-platform marketing campaign with AI-composed images and brand-consistent copy.
                  </p>
                  <button
                    onClick={() => navigate(`/brands/${brandId}/campaigns/new`)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Launch Campaign Wizard
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── CONTENT & VOICE TAB ────────────────────────────────────── */}
          {activeTab === "content" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Audience Segments */}
              <InfoCard icon={Users} title="Target Audience Segments" className="lg:col-span-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(kit.audienceSegments ?? []).map((seg, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-card-border">
                      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 text-xs font-bold">
                        {i + 1}
                      </div>
                      <p className="text-sm text-foreground leading-snug">{seg}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>

              {/* Tone of Voice */}
              <InfoCard icon={MessageSquare} title="Tone of Voice & Communication Style">
                <p className="text-sm text-foreground leading-relaxed mb-4">{kit.toneOfVoice}</p>
                {kit.socialBio && (
                  <div className="rounded-lg bg-muted/30 p-3 mt-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Ready-to-use Social Bio</p>
                    <p className="text-sm text-foreground">{kit.socialBio}</p>
                  </div>
                )}
              </InfoCard>

              {/* Messaging Pillars */}
              {kit.messagingPillars && kit.messagingPillars.length > 0 && (
                <InfoCard icon={Layers} title="Messaging Pillars">
                  <div className="space-y-3">
                    {kit.messagingPillars.map((pillar, i) => {
                      const [theme, ...rest] = pillar.split(" — ");
                      return (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                          <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">{theme}</p>
                            {rest.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">{rest.join(" — ")}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </InfoCard>
              )}

              {/* Do's and Don'ts */}
              {(kit.dosCommunication?.length || kit.dontsCommunication?.length) ? (
                <InfoCard icon={Shield} title="Communication Do's & Don'ts" className="lg:col-span-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400 mb-2">✓ Do's</p>
                      <div className="space-y-2">
                        {kit.dosCommunication?.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-foreground">{item.replace(/^Do:\s*/i, "")}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-rose-500 mb-2">✗ Don'ts</p>
                      <div className="space-y-2">
                        {kit.dontsCommunication?.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900">
                            <X className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-foreground">{item.replace(/^Don't:\s*/i, "")}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </InfoCard>
              ) : null}

              {/* Brand Keywords */}
              {kit.brandKeywords && kit.brandKeywords.length > 0 && (
                <InfoCard icon={Tag} title="Brand Keywords">
                  <div className="flex flex-wrap gap-2">
                    {kit.brandKeywords.map((kw, i) => (
                      <Pill key={i} className="bg-primary/10 text-primary border border-primary/20">{kw}</Pill>
                    ))}
                  </div>
                </InfoCard>
              )}

              {/* Competitive Position */}
              {kit.competitivePosition && (
                <InfoCard icon={BarChart2 ?? Target} title="Competitive Positioning">
                  <p className="text-sm text-foreground leading-relaxed">{kit.competitivePosition}</p>
                </InfoCard>
              )}
            </div>
          )}

          {/* ─── MARKET STRATEGY TAB ──────────────────────────────────── */}
          {activeTab === "strategy" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Positioning */}
              <InfoCard icon={Target} title="Market Positioning" className="lg:col-span-2">
                <p className="text-sm text-foreground leading-relaxed text-balance">{kit.positioning}</p>
              </InfoCard>

              {/* Competitive position */}
              {kit.competitivePosition && (
                <InfoCard icon={Zap} title="Competitive Differentiation">
                  <p className="text-sm text-foreground leading-relaxed">{kit.competitivePosition}</p>
                </InfoCard>
              )}

              {/* Personality */}
              <InfoCard icon={Heart} title="Brand Personality & Character">
                <p className="text-sm text-foreground leading-relaxed">{kit.personality}</p>
              </InfoCard>

              {/* Messaging pillars */}
              {kit.messagingPillars && kit.messagingPillars.length > 0 && (
                <InfoCard icon={Layers} title="Strategic Messaging Pillars" className="lg:col-span-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {kit.messagingPillars.map((pillar, i) => {
                      const [theme, ...rest] = pillar.split(" — ");
                      return (
                        <div key={i} className="rounded-xl border border-card-border bg-muted/20 p-4 space-y-2">
                          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                            {i + 1}
                          </div>
                          <p className="text-sm font-semibold text-foreground">{theme}</p>
                          {rest.length > 0 && <p className="text-xs text-muted-foreground leading-relaxed">{rest.join(" — ")}</p>}
                        </div>
                      );
                    })}
                  </div>
                </InfoCard>
              )}

              {/* Target Audience Detail */}
              <InfoCard icon={Users} title="Target Audience Deep-Dive" className="lg:col-span-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(kit.audienceSegments ?? []).map((seg, i) => {
                    const labels = ["Primary", "Secondary", "Tertiary"];
                    return (
                      <div key={i} className="p-4 rounded-xl border border-card-border bg-card space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                            i === 0 ? "bg-primary/10 text-primary" : i === 1 ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          )}>
                            {labels[i] ?? `Segment ${i + 1}`}
                          </span>
                        </div>
                        <p className="text-sm text-foreground leading-snug">{seg}</p>
                      </div>
                    );
                  })}
                </div>
              </InfoCard>
            </div>
          )}

          {/* ─── BRAND STORY TAB ──────────────────────────────────────── */}
          {activeTab === "story" && (
            <div className="space-y-5">
              {/* Brand Story */}
              <InfoCard
                icon={BookOpen}
                title="Brand Story"
                action={
                  <button
                    onClick={handleRegenerateBrandStory}
                    disabled={generatingStory}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors disabled:opacity-60"
                  >
                    {generatingStory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {generatingStory ? "Regenerating..." : "Regenerate Story"}
                  </button>
                }
              >
                {storyError && (
                  <div className="mb-3 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">{storyError}</div>
                )}
                {kit.brandStory ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {kit.brandStory.split("\n\n").filter(Boolean).map((para, i) => (
                      <p key={i} className="text-sm text-foreground leading-relaxed mb-4">{para}</p>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No brand story yet. Generate one to tell your brand's unique origin story.</p>
                    <button
                      onClick={handleRegenerateBrandStory}
                      disabled={generatingStory}
                      className="flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {generatingStory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {generatingStory ? "Generating Story..." : "Generate Brand Story"}
                    </button>
                  </div>
                )}
              </InfoCard>

              {/* Mission & Vision */}
              {(kit.missionStatement || kit.visionStatement) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {kit.missionStatement && (
                    <InfoCard icon={Target} title="Mission Statement">
                      <blockquote className="border-l-4 border-primary pl-4">
                        <p className="text-base font-semibold text-foreground italic leading-relaxed">"{kit.missionStatement}"</p>
                      </blockquote>
                    </InfoCard>
                  )}
                  {kit.visionStatement && (
                    <InfoCard icon={Zap} title="Vision Statement">
                      <blockquote className="border-l-4 border-violet-500 pl-4">
                        <p className="text-base font-semibold text-foreground italic leading-relaxed">"{kit.visionStatement}"</p>
                      </blockquote>
                    </InfoCard>
                  )}
                </div>
              )}

              {/* Taglines */}
              {kit.taglines && kit.taglines.length > 0 && (
                <InfoCard icon={Quote} title="Campaign Taglines">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {kit.taglines.map((tagline, i) => (
                      <div key={i} className={cn("p-4 rounded-xl border", i === 0 ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-card-border")}>
                        {i === 0 && <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">★ Primary Tagline</p>}
                        <p className={cn("text-sm font-semibold", i === 0 ? "text-primary text-base" : "text-foreground")}>"{tagline}"</p>
                      </div>
                    ))}
                  </div>
                </InfoCard>
              )}

              {/* Brand Keywords */}
              {kit.brandKeywords && kit.brandKeywords.length > 0 && (
                <InfoCard icon={Tag} title="Core Brand Keywords">
                  <div className="flex flex-wrap gap-2">
                    {kit.brandKeywords.map((kw, i) => (
                      <span key={i} className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                        {kw}
                      </span>
                    ))}
                  </div>
                </InfoCard>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

