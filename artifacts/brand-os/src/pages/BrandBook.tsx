import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Edit3, Loader2, FileText, Download, ImageDown } from "lucide-react";
import { jsPDF } from "jspdf";
import { useGetBrand } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpecObject {
  type: "rect" | "circle" | "text" | "image" | "line";
  left: number; top: number;
  width?: number; height?: number;
  radius?: number;
  fill?: string; stroke?: string; strokeWidth?: number;
  rx?: number; opacity?: number;
  text?: string; fontSize?: number; fontFamily?: string;
  fontWeight?: string; fontStyle?: string;
  textAlign?: "left" | "center" | "right";
  src?: string;
}

interface PageSpec {
  background: string;
  objects: SpecObject[];
  aiSpec?: boolean;
}

interface DesignRow {
  id: number;
  brandId: number;
  name: string;
  width: number;
  height: number;
  preset: string;
  canvasData: PageSpec | null;
  updatedAt: string;
}

// ─── Single page renderer (HTML/CSS — exact A4 px) ────────────────────────────

function PagePreview({ design, scale }: { design: DesignRow; scale: number }) {
  const data = design.canvasData;
  if (!data || !Array.isArray(data.objects)) {
    return <div className="text-sm text-muted-foreground">Empty page</div>;
  }
  const W = design.width;
  const H = design.height;

  return (
    <div
      style={{
        position: "relative",
        width: W * scale,
        height: H * scale,
        background: data.background || "#FFFFF0",
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {data.objects.map((o, i) => renderObject(o, i))}
      </div>
    </div>
  );
}

function renderObject(o: SpecObject, key: number) {
  const opacity = o.opacity ?? 1;
  const stroke = o.stroke && o.strokeWidth ? `${o.strokeWidth}px solid ${o.stroke}` : undefined;

  if (o.type === "rect") {
    return (
      <div
        key={key}
        style={{
          position: "absolute",
          left: o.left, top: o.top,
          width: o.width ?? 0, height: o.height ?? 0,
          background: o.fill && o.fill !== "transparent" ? o.fill : "transparent",
          opacity,
          borderRadius: o.rx ?? 0,
          border: stroke,
          boxSizing: "border-box",
        }}
      />
    );
  }

  if (o.type === "circle") {
    const r = o.radius ?? (o.width ?? 0) / 2;
    return (
      <div
        key={key}
        style={{
          position: "absolute",
          left: o.left, top: o.top,
          width: r * 2, height: r * 2,
          background: o.fill && o.fill !== "transparent" ? o.fill : "transparent",
          borderRadius: "50%",
          opacity,
          border: stroke,
          boxSizing: "border-box",
        }}
      />
    );
  }

  if (o.type === "line") {
    return (
      <div
        key={key}
        style={{
          position: "absolute",
          left: o.left, top: o.top,
          width: o.width ?? 0,
          height: Math.max(1, o.strokeWidth ?? 1),
          background: o.stroke || "#000",
          opacity,
        }}
      />
    );
  }

  if (o.type === "text") {
    const fontStyle = o.fontStyle && o.fontStyle !== "normal" ? o.fontStyle : "normal";
    const fontWeight = o.fontWeight || "normal";
    return (
      <div
        key={key}
        style={{
          position: "absolute",
          left: o.left, top: o.top,
          width: o.width,
          color: o.fill || "#1a1a2e",
          fontSize: (o.fontSize || 16) + "px",
          fontFamily: `"${o.fontFamily || "Inter"}", system-ui, sans-serif`,
          fontWeight,
          fontStyle,
          textAlign: o.textAlign || "left",
          opacity,
          lineHeight: 1.16,
          whiteSpace: o.width ? "normal" : "pre",
          wordBreak: "break-word",
        }}
      >
        {o.text}
      </div>
    );
  }

  if (o.type === "image" && o.src) {
    return (
      <img
        key={key}
        src={o.src}
        alt=""
        crossOrigin="anonymous"
        style={{
          position: "absolute",
          left: o.left, top: o.top,
          width: o.width, height: o.height,
          objectFit: "contain",
          opacity,
        }}
      />
    );
  }

  return null;
}

// ─── Pre-load every <img> referenced in the supplied designs ──────────────────

async function preloadDesignImages(designs: DesignRow[]): Promise<Map<string, HTMLImageElement>> {
  const cache = new Map<string, HTMLImageElement>();
  const sources = new Set<string>();
  for (const d of designs) {
    for (const o of d.canvasData?.objects ?? []) {
      if (o.type === "image" && o.src) sources.add(o.src);
    }
  }
  await Promise.all(
    Array.from(sources).map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { cache.set(src, img); resolve(); };
          img.onerror = () => resolve(); // skip broken sources, never block export
          img.src = src;
        }),
    ),
  );
  return cache;
}

// ─── Render a single page to a data-URL via off-screen canvas ─────────────────
// `format` defaults to JPEG (small, for multi-page PDFs) but can be PNG for
// per-page downloads where quality > size.

function renderPageToCanvas(
  design: DesignRow,
  imageCache?: Map<string, HTMLImageElement>,
  format: "image/jpeg" | "image/png" = "image/jpeg",
): string {
  const data = design.canvasData;
  if (!data) return "";
  const W = design.width;
  const H = design.height;
  const canvas = document.createElement("canvas");
  canvas.width = W * 2; // 2x for crisp PDF
  canvas.height = H * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = data.background || "#FFFFF0";
  ctx.fillRect(0, 0, W, H);

  for (const o of data.objects || []) {
    ctx.globalAlpha = o.opacity ?? 1;

    if (o.type === "rect") {
      if (o.fill && o.fill !== "transparent") {
        ctx.fillStyle = o.fill;
        const rx = o.rx ?? 0;
        if (rx > 0) {
          roundRect(ctx, o.left, o.top, o.width || 0, o.height || 0, rx);
          ctx.fill();
        } else {
          ctx.fillRect(o.left, o.top, o.width || 0, o.height || 0);
        }
      }
      if (o.stroke && o.strokeWidth) {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        const rx = o.rx ?? 0;
        if (rx > 0) {
          roundRect(ctx, o.left, o.top, o.width || 0, o.height || 0, rx);
          ctx.stroke();
        } else {
          ctx.strokeRect(o.left, o.top, o.width || 0, o.height || 0);
        }
      }
    } else if (o.type === "circle") {
      const r = o.radius ?? (o.width || 0) / 2;
      ctx.beginPath();
      ctx.arc(o.left + r, o.top + r, r, 0, Math.PI * 2);
      if (o.fill && o.fill !== "transparent") {
        ctx.fillStyle = o.fill;
        ctx.fill();
      }
      if (o.stroke && o.strokeWidth) {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.stroke();
      }
    } else if (o.type === "line") {
      ctx.beginPath();
      ctx.moveTo(o.left, o.top);
      ctx.lineTo(o.left + (o.width || 0), o.top + (o.height || 0));
      ctx.strokeStyle = o.stroke || "#000";
      ctx.lineWidth = o.strokeWidth || 1;
      ctx.stroke();
    } else if (o.type === "text") {
      const size = o.fontSize || 16;
      const family = o.fontFamily || "Inter";
      const weight = o.fontWeight || "normal";
      const style = o.fontStyle || "normal";
      ctx.font = `${style} ${weight} ${size}px "${family}", system-ui, sans-serif`;
      ctx.fillStyle = o.fill || "#1a1a2e";
      ctx.textBaseline = "top";
      ctx.textAlign = (o.textAlign as CanvasTextAlign) || "left";

      const text = o.text || "";
      const lines = wrapText(ctx, text, o.width);
      const lineH = size * 1.16;
      const xBase =
        ctx.textAlign === "center" && o.width ? o.left + o.width / 2 :
        ctx.textAlign === "right" && o.width ? o.left + o.width :
        o.left;

      lines.forEach((ln, i) => {
        ctx.fillText(ln, xBase, o.top + i * lineH);
      });
    } else if (o.type === "image" && o.src) {
      const img = imageCache?.get(o.src);
      if (img && img.complete && img.naturalWidth > 0) {
        // Letterbox-fit (object-fit: contain) to match on-screen <img> rendering.
        const boxW = o.width || img.naturalWidth;
        const boxH = o.height || img.naturalHeight;
        const ratio = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
        const drawW = img.naturalWidth * ratio;
        const drawH = img.naturalHeight * ratio;
        const dx = o.left + (boxW - drawW) / 2;
        const dy = o.top + (boxH - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
      }
    }
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL(format, format === "image/jpeg" ? 0.92 : 1);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth?: number): string[] {
  if (!maxWidth) return [text];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
    } else {
      if (line) out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [text];
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrandBook() {
  const { id } = useParams<{ id: string }>();
  const brandId = parseInt(id || "0", 10);
  const { data: brand } = useGetBrand(brandId);

  const [designs, setDesigns] = useState<DesignRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [scale, setScale] = useState(0.7);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!brandId) return;
    setLoading(true); setError(null);
    fetch(`/api/designs?brandId=${brandId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Failed")))
      .then((rows: DesignRow[]) => {
        // Keep only A4 brand book pages (aiSpec) and sort by name (which starts with "01 ·" etc)
        const pages = rows
          .filter((r) => r.preset === "a4" && r.canvasData && (r.canvasData as PageSpec).aiSpec)
          .sort((a, b) => a.name.localeCompare(b.name));
        setDesigns(pages);
      })
      .catch((e) => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [brandId]);

  // Responsive scale — fit ~640px wide at most
  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      const target = w < 900 ? Math.min(w - 320, 480) : Math.min(640, w - 380);
      setScale(Math.max(0.32, Math.min(0.85, target / 794)));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const indexEntries = useMemo(() => (designs || []).map((d) => ({ id: d.id, name: d.name })), [designs]);

  function jumpTo(id: number) {
    const el = pageRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function exportPdf() {
    if (!designs || designs.length === 0) return;
    setExporting(true);
    try {
      const W = designs[0].width;
      const H = designs[0].height;
      // Pre-load every image referenced anywhere in the brand book BEFORE we
      // start rendering, so logos/AI-generated images appear in the PDF (the
      // off-screen canvas is sync — it can't await image loads mid-render).
      const cache = await preloadDesignImages(designs);
      const pdf = new jsPDF({ unit: "px", format: [W, H], orientation: "portrait" });
      designs.forEach((d, i) => {
        if (i > 0) pdf.addPage([W, H], "portrait");
        const dataUrl = renderPageToCanvas(d, cache, "image/jpeg");
        if (dataUrl) pdf.addImage(dataUrl, "JPEG", 0, 0, W, H);
      });
      pdf.save(`${(brand?.companyName || "brand").replace(/\s+/g, "-")}-brand-book.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  async function downloadPagePng(d: DesignRow) {
    try {
      const cache = await preloadDesignImages([d]);
      const dataUrl = renderPageToCanvas(d, cache, "image/png");
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      const slug = `${(brand?.companyName || "brand").replace(/\s+/g, "-")}-${d.name.replace(/[^\w\u0600-\u06ff-]+/g, "_")}`;
      a.download = `${slug}.png`;
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Page download failed");
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href={`/brands/${brandId}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to brand
            </Link>
            <span className="text-muted-foreground">·</span>
            <h1 className="text-base font-semibold text-foreground truncate">
              {brand?.companyName || "Brand"} — Brand Book
            </h1>
            {designs && (
              <span className="text-xs text-muted-foreground">{designs.length} pages</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportPdf}
              disabled={exporting || !designs || designs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? "Building PDF..." : "Download PDF"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar index */}
        <aside className="hidden md:block w-60 shrink-0">
          <div className="sticky top-20 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Pages
            </div>
            {indexEntries.map((e) => (
              <button
                key={e.id}
                onClick={() => jumpTo(e.id)}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {e.name}
              </button>
            ))}
          </div>
        </aside>

        {/* Pages stack */}
        <div className="flex-1 min-w-0 flex flex-col items-center gap-12">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-16">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading brand book...
            </div>
          )}
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              {error}
            </div>
          )}
          {!loading && !error && designs && designs.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No brand book yet.</p>
              <p className="text-xs mt-1">Go back to the brand and click "Generate Brand Book".</p>
            </div>
          )}
          {!loading && designs && designs.map((d) => (
            <div
              key={d.id}
              ref={(el) => { pageRefs.current[d.id] = el; }}
              className="flex flex-col items-center gap-3"
            >
              <PagePreview design={d} scale={scale} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium mr-2">{d.name}</span>
                <Link
                  href={`/brands/${brandId}/design?designId=${d.id}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Edit3 className="w-3 h-3" /> Edit in Studio
                </Link>
                <button
                  onClick={() => downloadPagePng(d)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Download this page as PNG"
                >
                  <ImageDown className="w-3 h-3" /> PNG
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
