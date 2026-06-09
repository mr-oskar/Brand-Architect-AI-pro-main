import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useGetBrand } from "@workspace/api-client-react";
import {
  ArrowLeft, Sparkles, Upload, X, Plus, Instagram, Linkedin, Twitter,
  Facebook, CheckSquare, Square, Loader2, Check, Zap, TrendingUp,
  Brain, Palette, FileText, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { notifyError } from "@/lib/apiError";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  { id: "twitter", label: "X / Twitter", icon: Twitter },
  { id: "facebook", label: "Facebook", icon: Facebook },
];

const STEPS = [
  { icon: Brain, label: "تحليل الموجز وفهم المتطلبات", sublabel: "Parsing brief & extracting intent" },
  { icon: TrendingUp, label: "جلب أحدث الترندات من Google", sublabel: "Fetching live industry trends" },
  { icon: Palette, label: "تحليل الأسلوب البصري والمرجعي", sublabel: "Analyzing visual direction" },
  { icon: Sparkles, label: "بناء استراتيجية الحملة بالذكاء الاصطناعي", sublabel: "Crafting campaign strategy" },
  { icon: FileText, label: "صياغة المنشورات والبرومتات", sublabel: "Writing posts & image prompts" },
  { icon: Save, label: "حفظ الحملة", sublabel: "Saving to your workspace" },
];

export default function CampaignBriefPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const brandId = Number(id);

  const { data: brand } = useGetBrand(brandId);

  const [brief, setBrief] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [postCount, setPostCount] = useState(7);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [isDragging, setIsDragging] = useState(false);

  const [phase, setPhase] = useState<"input" | "processing">("input");
  const [jobId, setJobId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const togglePlatform = (pid: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(pid) ? (prev.length > 1 ? prev.filter((p) => p !== pid) : prev) : [...prev, pid]
    );
  };

  const addImages = useCallback((files: FileList | null) => {
    if (!files) return;
    const remaining = 5 - referenceImages.length;
    Array.from(files).slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setReferenceImages((prev) => (prev.length < 5 ? [...prev, result] : prev));
      };
      reader.readAsDataURL(file);
    });
  }, [referenceImages.length]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addImages(e.dataTransfer.files);
  }, [addImages]);

  async function handleSubmit() {
    if (!brief.trim() && referenceImages.length === 0) {
      setError("يرجى إدخال وصف الحملة أو رفع صور مرجعية");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError("يرجى اختيار منصة واحدة على الأقل");
      return;
    }

    setError(null);
    setPhase("processing");
    setCurrentStep(0);

    try {
      const resp = await fetch(`${BASE}/api/brands/${brandId}/campaign-brief-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim() || undefined,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
          postCount,
          platforms: selectedPlatforms,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "فشل إنشاء الحملة");
      }

      const { jobId: jid } = await resp.json() as { jobId: string };
      setJobId(jid);
    } catch (err) {
      setPhase("input");
      const msg = err instanceof Error ? err.message : "فشل إنشاء الحملة";
      setError(msg);
      notifyError("فشل إنشاء الحملة", err);
    }
  }

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${BASE}/api/jobs/${jobId}`);
        if (!resp.ok) return;
        const job = await resp.json() as {
          status: string;
          progress: number;
          total: number;
          result?: { _step?: number; id?: number } | null;
          error?: string;
        };

        if (job.status === "running" || job.status === "pending") {
          const stepFromResult = (job.result as { _step?: number } | null)?._step ?? 0;
          setCurrentStep(Math.max(job.progress, stepFromResult));
        }

        if (job.status === "done" && job.result) {
          clearInterval(pollRef.current!);
          setCurrentStep(STEPS.length);
          const campaignId = (job.result as { id?: number }).id;
          setTimeout(() => {
            if (campaignId) navigate(`/campaigns/${campaignId}`);
          }, 800);
        }

        if (job.status === "failed") {
          clearInterval(pollRef.current!);
          setPhase("input");
          setError(job.error ?? "فشلت عملية التوليد");
        }
      } catch {
        // ignore transient errors
      }
    }, 1500);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {phase === "input" ? (
        <InputPhase
          brand={brand}
          brandId={brandId}
          brief={brief}
          setBrief={setBrief}
          referenceImages={referenceImages}
          setReferenceImages={setReferenceImages}
          postCount={postCount}
          setPostCount={setPostCount}
          selectedPlatforms={selectedPlatforms}
          togglePlatform={togglePlatform}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          fileInputRef={fileInputRef}
          onDrop={handleDrop}
          addImages={addImages}
          error={error}
          onSubmit={handleSubmit}
        />
      ) : (
        <ProcessingPhase currentStep={currentStep} brand={brand} />
      )}
    </div>
  );
}

function InputPhase({
  brand, brandId, brief, setBrief, referenceImages, setReferenceImages,
  postCount, setPostCount, selectedPlatforms, togglePlatform,
  isDragging, setIsDragging, fileInputRef, onDrop, addImages, error, onSubmit,
}: {
  brand: { companyName?: string } | null | undefined;
  brandId: number;
  brief: string;
  setBrief: (v: string) => void;
  referenceImages: string[];
  setReferenceImages: React.Dispatch<React.SetStateAction<string[]>>;
  postCount: number;
  setPostCount: (v: number) => void;
  selectedPlatforms: string[];
  togglePlatform: (id: string) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  addImages: (files: FileList | null) => void;
  error: string | null;
  onSubmit: () => void;
}) {
  const [, navigate] = useLocation();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/brands/${brandId}`)}
          className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">إنشاء حملة ذكية</h1>
          {brand?.companyName && (
            <p className="text-sm text-muted-foreground mt-0.5">لـ {brand.companyName}</p>
          )}
        </div>
      </div>

      {/* Brief textarea */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-foreground">
          صف حملتك
          <span className="ml-2 text-xs font-normal text-muted-foreground">(اكتب بالعربية أو الإنجليزية)</span>
        </label>
        <textarea
          dir="auto"
          className="w-full min-h-[160px] px-4 py-3.5 rounded-xl border border-input bg-muted/20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed transition-colors"
          placeholder={`مثال:\n• حملة إطلاق منتج جديد لشريحة الشباب 18-30 — نريد إثارة الفضول وبناء الانتظار\n• حملة رمضانية بأسلوب دافئ وإنساني تركز على قيم العطاء والمشاركة\n• حملة B2B لاستهداف مدراء الشركات بأسلوب احترافي ومبني على البيانات`}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          كلما كانت التفاصيل أوضح، كانت النتائج أفضل — الجمهور المستهدف، الأهداف، الأسلوب، الرسائل الرئيسية
        </p>
      </div>

      {/* Reference images */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-foreground">
          صور مرجعية للأسلوب البصري
          <span className="ml-2 text-xs font-normal text-muted-foreground">اختياري — حتى 5 صور</span>
        </label>

        <div
          className={cn(
            "rounded-xl border-2 border-dashed transition-colors p-4",
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20"
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <div className="flex items-start gap-3 flex-wrap">
            {referenceImages.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img}
                  alt={`ref ${i + 1}`}
                  className="w-20 h-20 rounded-lg object-cover border border-border"
                />
                <button
                  onClick={() => setReferenceImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {referenceImages.length < 5 && (
              <label
                className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors gap-1"
              >
                <Plus className="w-5 h-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">أضف</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addImages(e.target.files)}
                />
              </label>
            )}
            {referenceImages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center py-4 text-center gap-2">
                <Upload className="w-7 h-7 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  اسحب وأفلت الصور هنا أو اضغط على <span className="text-primary">+</span> لإضافتها
                </p>
                <p className="text-xs text-muted-foreground/70">
                  الذكاء الاصطناعي سيستخرج الأسلوب البصري ويطبقه على جميع التصاميم
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Platforms */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-foreground">المنصات المستهدفة</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PLATFORMS.map(({ id: pid, label, icon: Icon }) => {
            const selected = selectedPlatforms.includes(pid);
            return (
              <button
                key={pid}
                onClick={() => togglePlatform(pid)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                  selected
                    ? "border-primary bg-primary/8 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {selected ? <CheckSquare className="w-4 h-4 flex-shrink-0" /> : <Square className="w-4 h-4 flex-shrink-0" />}
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Post count */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-foreground">
          عدد المنشورات
          <span className="ml-3 text-primary font-bold text-lg">{postCount}</span>
        </label>
        <input
          type="range"
          min={1}
          max={14}
          value={postCount}
          onChange={(e) => setPostCount(Number(e.target.value))}
          className="w-full accent-primary h-2 rounded-lg"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1 منشور (سريع)</span>
          <span>7 منشورات (أسبوع كامل)</span>
          <span>14 منشور (حملة ممتدة)</span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => navigate(`/brands/${brandId}`)}
          className="px-5 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          إلغاء
        </button>
        <button
          onClick={onSubmit}
          className="flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <Sparkles className="w-4 h-4" />
          إنشاء الحملة بالذكاء الاصطناعي
          <Zap className="w-4 h-4 opacity-70" />
        </button>
      </div>
    </div>
  );
}

function ProcessingPhase({
  currentStep,
  brand,
}: {
  currentStep: number;
  brand: { companyName?: string } | null | undefined;
}) {
  const done = currentStep >= STEPS.length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            {done ? (
              <Check className="w-8 h-8 text-primary" />
            ) : (
              <Sparkles className="w-8 h-8 text-primary animate-pulse" />
            )}
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {done ? "الحملة جاهزة! 🎉" : "جاري إنشاء حملتك..."}
          </h2>
          {brand?.companyName && (
            <p className="text-sm text-muted-foreground">
              {done ? `تم إنشاء الحملة لـ ${brand.companyName}` : `نعمل على حملة ذكية لـ ${brand.companyName}`}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.min(100, (currentStep / STEPS.length) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span className="font-medium text-primary">
              {Math.min(100, Math.round((currentStep / STEPS.length) * 100))}%
            </span>
            <span>100%</span>
          </div>
        </div>

        {/* Steps list */}
        <div className="space-y-3">
          {STEPS.map((step, idx) => {
            const StepIcon = step.icon;
            const isActive = idx === currentStep;
            const isDone = idx < currentStep;
            const isPending = idx > currentStep;

            return (
              <div
                key={idx}
                className={cn(
                  "flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all duration-500",
                  isDone && "border-primary/20 bg-primary/5",
                  isActive && "border-primary/50 bg-primary/10 shadow-sm shadow-primary/10",
                  isPending && "border-border/50 bg-muted/20 opacity-40"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
                    isDone && "bg-primary text-primary-foreground",
                    isActive && "bg-primary/20 text-primary",
                    isPending && "bg-muted text-muted-foreground"
                  )}
                >
                  {isDone ? (
                    <Check className="w-4 h-4" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <StepIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium leading-tight",
                      isDone && "text-primary",
                      isActive && "text-foreground",
                      isPending && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.sublabel}</p>
                </div>
              </div>
            );
          })}
        </div>

        {!done && (
          <p className="text-center text-xs text-muted-foreground animate-pulse">
            هذه العملية قد تستغرق دقيقة أو دقيقتين — يرجى الانتظار
          </p>
        )}
      </div>
    </div>
  );
}
