import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, Maximize2, Minimize2, Copy, Check } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/apiError";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string | null;
  title?: string;
  filename?: string;
  subtitle?: string;
  meta?: { sizeBytes?: number | null };
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ImageLightbox({ open, onOpenChange, src, title, filename, subtitle, meta }: Props) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setDims(null);
      setZoom("fit");
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !src) return;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src, open]);

  const handleDownload = async () => {
    if (!src) return;
    try {
      const a = document.createElement("a");
      a.href = src;
      a.download = filename || "image.png";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notifySuccess("بدأ التحميل");
    } catch (err) {
      notifyError("تعذر التحميل", err);
    }
  };

  const handleCopyUrl = async () => {
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      notifySuccess("تم نسخ رابط الصورة");
    } catch (err) {
      notifyError("تعذر النسخ", err);
    }
  };

  const dimsLabel = dims ? `${dims.w} × ${dims.h}` : "...";
  const aspect = dims ? `${(dims.w / dims.h).toFixed(2)}:1` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[min(96vw,1400px)] !w-auto !p-0 !border-white/10 !bg-[#0a0a14]/95 !backdrop-blur-xl !rounded-2xl overflow-hidden"
        data-testid="image-lightbox"
      >
        <DialogTitle className="sr-only">{title || filename || "معاينة الصورة"}</DialogTitle>
        <DialogDescription className="sr-only">{subtitle || "معاينة الصورة بمقاسها الأصلي"}</DialogDescription>

        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-black/40">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-foreground truncate">{title || filename || "معاينة"}</div>
            {subtitle && <div className="text-[10.5px] text-muted-foreground/80 truncate">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoom((z) => (z === "fit" ? "actual" : "fit"))}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-foreground/85 hover:text-foreground transition-colors"
              title={zoom === "fit" ? "العرض بالحجم الأصلي" : "ملاءمة الشاشة"}
              data-testid="lightbox-zoom-toggle"
            >
              {zoom === "fit" ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{zoom === "fit" ? "حجم أصلي" : "ملاءمة"}</span>
            </button>
            <button
              onClick={handleCopyUrl}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-foreground/85 hover:text-foreground transition-colors"
              title="نسخ رابط الصورة"
              data-testid="lightbox-copy-url"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? "تم النسخ" : "نسخ الرابط"}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-[11px] text-violet-200 hover:text-violet-100 transition-colors"
              title="تحميل الصورة"
              data-testid="lightbox-download"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تحميل</span>
            </button>
            {/* Spacer for the auto Close X */}
            <div className="w-8" />
          </div>
        </div>

        {/* Image area */}
        <div className="relative bg-[radial-gradient(ellipse_at_center,_#1a1d2e_0%,_#0a0a14_70%)] flex items-center justify-center overflow-auto" style={{ maxHeight: "80vh" }}>
          {src ? (
            <img
              src={src}
              alt={title || filename || ""}
              draggable={false}
              className={
                zoom === "fit"
                  ? "max-w-full max-h-[80vh] object-contain select-none"
                  : "max-w-none max-h-none object-none select-none"
              }
              data-testid="lightbox-image"
            />
          ) : (
            <div className="h-64 w-full flex items-center justify-center text-muted-foreground text-sm">
              لا توجد صورة
            </div>
          )}
        </div>

        {/* Footer meta */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 px-4 py-2 border-t border-white/10 bg-black/40 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>الأبعاد: <span className="text-foreground/85 font-mono">{dimsLabel}</span> px</span>
          </span>
          {dims && <span>النسبة: <span className="text-foreground/85 font-mono">{aspect}</span></span>}
          {meta?.sizeBytes != null && (
            <span>الحجم: <span className="text-foreground/85 font-mono">{formatBytes(meta.sizeBytes)}</span></span>
          )}
          <span className="ml-auto opacity-70">اضغط ESC للإغلاق</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
