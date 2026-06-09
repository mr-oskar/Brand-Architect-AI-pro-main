import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useCreateBrand, useGenerateBrandKit, getListBrandsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2, Globe, Upload, Check, Sparkles, Loader2, ChevronRight,
  ChevronLeft, X, Palette, Target, Users, MessageSquare, Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractColorsFromDataUrl } from "@/lib/colorExtractor";

const steps = [
  { id: 1, label: "Company Info" },
  { id: 2, label: "Brand Profile" },
  { id: 3, label: "Logo Upload" },
  { id: 4, label: "Review" },
  { id: 5, label: "Generate" },
];

const industries = [
  "Technology", "SaaS", "E-commerce", "Fashion", "Luxury", "Health & Fitness",
  "Food & Beverage", "Finance", "Legal", "Real Estate", "Education", "Media",
  "Travel", "Beauty", "Consulting", "Non-profit", "Manufacturing", "Other",
];

const toneOptions = [
  { value: "professional", label: "Professional", desc: "Formal, authoritative, trustworthy" },
  { value: "friendly", label: "Friendly", desc: "Warm, approachable, conversational" },
  { value: "bold", label: "Bold", desc: "Confident, direct, impactful" },
  { value: "playful", label: "Playful", desc: "Fun, energetic, creative" },
  { value: "minimalist", label: "Minimalist", desc: "Clean, refined, understated" },
  { value: "luxury", label: "Luxury", desc: "Premium, exclusive, sophisticated" },
];

export default function BrandWizard() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    companyName: "",
    companyDescription: "",
    industry: "",
    websiteUrl: "",
    logoUrl: "",
    targetAudience: "",
    brandValues: "",
    tonePreference: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [extractingColors, setExtractingColors] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const createBrand = useCreateBrand();
  const generateKit = useGenerateBrandKit();

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        // Check for transparency — keep PNG format for transparent images
        const isPng = file.type === "image/png";
        let hasAlpha = false;
        if (isPng) {
          ctx.drawImage(img, 0, 0, width, height);
          const pixels = ctx.getImageData(0, 0, width, height).data;
          for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] < 200) { hasAlpha = true; break; }
          }
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Use PNG for transparent logos, JPEG for opaque ones
        const outputUrl = hasAlpha
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", 0.85);

        setLogoPreview(outputUrl);
        setForm((f) => ({ ...f, logoUrl: outputUrl }));

        setExtractingColors(true);
        const colors = await extractColorsFromDataUrl(outputUrl, 6);
        setExtractedColors(colors);
        setExtractingColors(false);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoPreview(null);
    setExtractedColors([]);
    setForm((f) => ({ ...f, logoUrl: "" }));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleCreateAndGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const enrichedDescription = [
        form.companyDescription,
        form.targetAudience ? `Target Audience: ${form.targetAudience}` : "",
        form.brandValues ? `Brand Values: ${form.brandValues}` : "",
        form.tonePreference ? `Tone of Voice: ${form.tonePreference}` : "",
      ].filter(Boolean).join("\n\n");

      const brand = await createBrand.mutateAsync({
        data: {
          companyName: form.companyName,
          companyDescription: enrichedDescription,
          industry: form.industry,
          websiteUrl: form.websiteUrl || null,
          logoUrl: form.logoUrl || null,
          brandColors: extractedColors.length > 0 ? extractedColors : undefined,
        },
      });

      await generateKit.mutateAsync({ id: brand.id, data: { brandColors: extractedColors.length > 0 ? extractedColors : undefined } });

      queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });

      setGenerated(true);
      setGenerating(false);

      setTimeout(() => {
        navigate(`/brands/${brand.id}`);
      }, 1500);
    } catch (err: unknown) {
      setGenerating(false);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setError(msg);
    }
  }

  const canProceed1 = form.companyName.trim() && form.companyDescription.trim() && form.industry;
  const canProceed2 = true;

  const canProceedForStep = (s: number) => {
    if (s === 1) return canProceed1;
    if (s === 2) return canProceed2;
    return true;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center mx-auto mb-3">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Brand Creation Wizard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The AI agent will analyze your inputs and build a complete brand identity.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                  step > s.id
                    ? "bg-primary border-primary text-primary-foreground"
                    : step === s.id
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground bg-background"
                )}
              >
                {step > s.id ? <Check className="w-4 h-4" /> : s.id}
              </div>
              {i < steps.length - 1 && (
                <div className={cn("w-8 h-0.5 mx-1", step > s.id ? "bg-primary" : "bg-border")} />
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider mb-6">
          Step {step} of {steps.length}: {steps[step - 1].label}
        </p>

        {/* Card */}
        <div className="rounded-2xl border border-card-border bg-card p-8 shadow-sm">
          {/* Step 1: Company Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Company Name *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    placeholder="e.g. Acme Corp"
                    value={form.companyName}
                    onChange={(e) => update("companyName", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Company Description *</label>
                <textarea
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
                  rows={4}
                  placeholder="Describe what your company does, who it serves, and what makes it unique. Include location, languages, and any key numbers..."
                  value={form.companyDescription}
                  onChange={(e) => update("companyDescription", e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">{form.companyDescription.length} / 500 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Industry *</label>
                <select
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  value={form.industry}
                  onChange={(e) => update("industry", e.target.value)}
                >
                  <option value="">Select industry...</option>
                  {industries.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Website URL (optional)</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    placeholder="https://yourwebsite.com"
                    value={form.websiteUrl}
                    onChange={(e) => update("websiteUrl", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Brand Profile */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-2.5">
                <Brain className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  The AI agent uses these inputs to deeply understand your brand's positioning, audience, and communication style — resulting in a much more accurate and resonant brand identity.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  <span className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-muted-foreground" />
                    Target Audience (optional)
                  </span>
                </label>
                <textarea
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
                  rows={3}
                  placeholder="e.g. Small business owners aged 25-45 in the MENA region who need digital marketing solutions..."
                  value={form.targetAudience}
                  onChange={(e) => update("targetAudience", e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                    Core Brand Values (optional)
                  </span>
                </label>
                <input
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="e.g. Innovation, Integrity, Excellence, Customer-First..."
                  value={form.brandValues}
                  onChange={(e) => update("brandValues", e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                    Tone of Voice (optional)
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {toneOptions.map((tone) => (
                    <button
                      key={tone.value}
                      type="button"
                      onClick={() => update("tonePreference", form.tonePreference === tone.value ? "" : tone.value)}
                      className={cn(
                        "text-left p-3 rounded-lg border-2 transition-all",
                        form.tonePreference === tone.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground leading-none">{tone.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{tone.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Logo Upload */}
          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Upload your logo. The AI agent will perform deep analysis: extracting brand colors, detecting visual patterns, and inferring your brand's aesthetic DNA.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              {!logoPreview ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-xl py-12 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Click to upload logo</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG up to 10MB</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <div className="rounded-xl border border-card-border bg-muted/30 p-6 flex items-center justify-center">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="max-h-40 max-w-full object-contain"
                      />
                    </div>
                    <button
                      onClick={removeLogo}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      Change logo
                    </button>
                  </div>

                  {extractingColors ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      AI agent is analyzing logo colors and patterns...
                    </div>
                  ) : extractedColors.length > 0 && (
                    <div className="rounded-lg bg-muted/40 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Palette className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Colors extracted from logo</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {extractedColors.map((color, i) => (
                          <div key={i} className="flex flex-col items-center gap-1.5">
                            <div
                              className="w-10 h-10 rounded-lg border border-black/10 shadow-sm"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-[10px] font-mono text-muted-foreground">{color}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-green-600 dark:text-green-400 mt-3 flex items-center gap-1.5">
                        <Check className="w-3 h-3" /> These colors will anchor your brand palette
                      </p>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                You can skip this step — the AI will derive a palette from your industry and brand profile.
              </p>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Review all details before the AI generates your brand kit.</p>
              <div className="rounded-lg bg-muted/40 divide-y divide-border">
                {[
                  { label: "Company", value: form.companyName },
                  { label: "Industry", value: form.industry },
                  { label: "Website", value: form.websiteUrl || "—" },
                  { label: "Logo", value: logoPreview ? "Uploaded ✓" : "Not uploaded" },
                  { label: "Tone", value: form.tonePreference || "AI will decide" },
                ].map((row) => (
                  <div key={row.label} className="flex items-start gap-3 px-4 py-3">
                    <span className="text-xs font-medium text-muted-foreground w-24 flex-shrink-0 pt-0.5">{row.label}</span>
                    <span className="text-sm text-foreground">{row.value}</span>
                  </div>
                ))}
                <div className="px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground block mb-1">Description</span>
                  <span className="text-sm text-foreground">{form.companyDescription}</span>
                </div>
                {form.targetAudience && (
                  <div className="px-4 py-3">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">Target Audience</span>
                    <span className="text-sm text-foreground">{form.targetAudience}</span>
                  </div>
                )}
                {form.brandValues && (
                  <div className="px-4 py-3">
                    <span className="text-xs font-medium text-muted-foreground block mb-1">Brand Values</span>
                    <span className="text-sm text-foreground">{form.brandValues}</span>
                  </div>
                )}
                {extractedColors.length > 0 && (
                  <div className="px-4 py-3">
                    <span className="text-xs font-medium text-muted-foreground block mb-2">Logo Colors</span>
                    <div className="flex items-center gap-2">
                      {extractedColors.map((color, i) => (
                        <div key={i} className="w-8 h-8 rounded-md border border-black/10" style={{ backgroundColor: color }} title={color} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5: Generate */}
          {step === 5 && (
            <div className="text-center py-4 space-y-6">
              {generated ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto">
                    <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Brand kit generated!</h3>
                    <p className="text-sm text-muted-foreground mt-1">Redirecting to your brand dashboard...</p>
                  </div>
                </div>
              ) : generating ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">AI agent is building your brand kit...</h3>
                    <p className="text-sm text-muted-foreground mt-1">Analyzing your company profile in depth.</p>
                  </div>
                  <div className="space-y-2 text-left">
                    {[
                      "Analyzing company profile and industry",
                      extractedColors.length > 0 ? "Deep-analyzing logo colors and patterns" : "Deriving brand color palette from context",
                      form.targetAudience ? "Processing audience segmentation data" : "Inferring target audience from industry",
                      "Building brand personality & market positioning",
                      "Defining tone of voice & visual style rules",
                    ].map((task) => (
                      <div key={task} className="flex items-center gap-3">
                        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Ready to generate</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                      The AI agent will analyze all your inputs and build a complete brand identity — personality, positioning, color palette, tone of voice, and visual style guidelines.
                    </p>
                  </div>

                  <div className="rounded-lg bg-muted/30 p-4 text-left space-y-2">
                    {[
                      { icon: Users, text: "Target audience profiling" },
                      { icon: Palette, text: "Color palette generation" },
                      { icon: MessageSquare, text: "Tone of voice definition" },
                      { icon: Target, text: "Market positioning strategy" },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-center gap-3">
                        <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">{text}</span>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive text-left">
                      <strong className="font-semibold">Error:</strong> {error}
                    </div>
                  )}
                  <button
                    onClick={handleCreateAndGenerate}
                    className="w-full py-3 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {error ? "Try Again" : "Generate Brand Kit with AI"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        {step < 5 && (
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => (step > 1 ? setStep(step - 1) : navigate("/"))}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              <ChevronLeft className="w-4 h-4" />
              {step === 1 ? "Cancel" : "Back"}
            </button>
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceedForStep(step)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors",
                !canProceedForStep(step)
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {step === 4 ? "Go to Generate" : "Continue"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
