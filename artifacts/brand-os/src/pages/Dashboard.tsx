import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, BookOpen, Lightbulb, ArrowUp, Building2, Megaphone,
  Workflow, LayoutTemplate, FileText, ShoppingBag, ChevronRight,
  Sparkles, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useListBrands, getListBrandsQueryKey } from "@workspace/api-client-react";

// ── Quick-action chips ─────────────────────────────────────────────────────────

const CHIPS = [
  { icon: Building2,     ar: "هوية العلامة",     en: "Brand Identity",   href: "/brands/new", color: "text-primary" },
  { icon: Megaphone,     ar: "حملة تسويقية",     en: "Campaign",         href: "/brands/new", color: "text-violet-500" },
  { icon: Workflow,      ar: "محرر الصور AI",     en: "AI Image Editor",  href: "/nodes",      color: "text-cyan-500" },
  { icon: LayoutTemplate,ar: "القوالب",           en: "Templates",        href: "/templates",  color: "text-amber-500" },
  { icon: FileText,      ar: "محتوى سوشيال",     en: "Social Content",   href: "/brands/new", color: "text-emerald-500" },
  { icon: ShoppingBag,   ar: "تجارة إلكترونية",  en: "E-Commerce",       href: "/brands/new", color: "text-rose-500" },
];

// ── Suggestion prompts ─────────────────────────────────────────────────────────

const SUGGESTIONS = {
  ar: [
    "أنشئ هوية بصرية كاملة لمطعم عصري في الرياض",
    "ابنِ علامة تجارية لمتجر أزياء فاخر يستهدف الشباب",
    "صمّم هوية احترافية لشركة تقنية ناشئة في السعودية",
    "أنشئ حملة تسويقية لمنتج جمال طبيعي",
  ],
  en: [
    "Create a complete brand identity for a modern café",
    "Build a luxury fashion brand targeting Gen Z",
    "Design a professional identity for a tech startup",
    "Launch a marketing campaign for a natural beauty product",
  ],
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { prefs } = useUserSettings();
  const lang = prefs.language;
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [prompt, setPrompt] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  const { data: brands, isLoading } = useListBrands({
    query: { queryKey: getListBrandsQueryKey() },
  });

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [prompt]);

  // Close suggestions on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSubmit() {
    const val = prompt.trim();
    if (!val) return;
    sessionStorage.setItem("brand_wizard_prompt", val);
    navigate("/workspace");
  }

  function handleSuggestion(s: string) {
    setPrompt(s);
    setShowSuggestions(false);
    textareaRef.current?.focus();
  }

  const firstName = user?.name?.split(" ")[0] || (lang === "ar" ? "هناك" : "there");
  const suggestions = SUGGESTIONS[lang];
  const recentBrands = Array.isArray(brands) ? brands.slice(0, 7) : [];

  return (
    <div className="flex flex-col min-h-[calc(100vh-0px)]">

      {/* ── Hero ── */}
      <div className="flex flex-col items-center justify-center px-6 pt-14 pb-10 flex-1">
        <div className="w-full max-w-2xl mx-auto">

          {/* Greeting */}
          <p className="text-center text-sm text-muted-foreground mb-3">
            {lang === "ar" ? `مرحباً، ${firstName} 👋` : `Hello, ${firstName} 👋`}
          </p>

          {/* Title */}
          <h1 className="text-center text-3xl sm:text-4xl font-bold text-foreground mb-2 leading-tight">
            {lang === "ar" ? (
              <>التصميم أسهل مع{" "}
                <span className="text-primary">Brand Architect AI</span>
              </>
            ) : (
              <>Design is easier with{" "}
                <span className="text-primary">Brand Architect AI</span>
              </>
            )}
          </h1>
          <p className="text-center text-sm text-muted-foreground mb-8">
            {lang === "ar"
              ? "وكيل الذكاء الاصطناعي الذي يفهمك ويُنجز المهمة"
              : "The AI agent that gets you and gets the job done"}
          </p>

          {/* ── Input Box ── */}
          <div className={cn(
            "relative rounded-2xl border bg-card transition-colors",
            prompt ? "border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]" : "border-border"
          )}>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
              }}
              placeholder={
                lang === "ar"
                  ? "اطلب من Brand Architect إنشاء علامة تجارية احترافية..."
                  : "Ask Brand Architect to craft your brand..."
              }
              rows={2}
              className="w-full bg-transparent px-5 pt-4 pb-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none leading-relaxed"
              style={{ minHeight: "64px", maxHeight: "200px" }}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              {/* Left actions */}
              <div className="flex items-center gap-1">
                <Link href="/brands/new">
                  <button
                    title={lang === "ar" ? "مشروع جديد" : "New project"}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </Link>
                <Link href="/templates">
                  <button
                    title={lang === "ar" ? "القوالب" : "Templates"}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                  </button>
                </Link>
              </div>

              {/* Right actions */}
              <div className="flex items-center gap-1">
                {/* Suggestions */}
                <div ref={suggestRef} className="relative">
                  <button
                    onClick={() => setShowSuggestions(v => !v)}
                    title={lang === "ar" ? "اقتراحات" : "Suggestions"}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                      showSuggestions
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Lightbulb className="w-4 h-4" />
                  </button>

                  {/* Suggestions dropdown */}
                  {showSuggestions && (
                    <div className="absolute bottom-full end-0 mb-2 w-72 bg-[#0f1117] border border-border rounded-xl shadow-xl overflow-hidden z-50">
                      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {lang === "ar" ? "أفكار مقترحة" : "Suggested ideas"}
                      </p>
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestion(s)}
                          className="w-full text-start px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border-t border-border/40 first:border-0 flex items-start gap-2"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <Link href="/nodes">
                  <button
                    title={lang === "ar" ? "محرر الصور" : "Image Editor"}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Workflow className="w-4 h-4" />
                  </button>
                </Link>

                {/* Send */}
                <button
                  onClick={handleSubmit}
                  disabled={!prompt.trim()}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                    prompt.trim()
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                      : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  )}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Chips ── */}
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {CHIPS.map((chip) => {
              const Icon = chip.icon;
              return (
                <Link key={chip.en} href={chip.href}>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-primary/5 transition-all">
                    <Icon className={cn("w-3.5 h-3.5", chip.color)} />
                    {lang === "ar" ? chip.ar : chip.en}
                  </button>
                </Link>
              );
            })}
          </div>

        </div>
      </div>

      {/* ── Recent Projects ── */}
      <div className="px-6 pb-12 max-w-5xl mx-auto w-full">

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">
            {lang === "ar" ? "المشاريع الأخيرة" : "Recent Projects"}
          </h2>
          {recentBrands.length > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {recentBrands.length} {lang === "ar" ? "علامة" : "brands"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">

          {/* New Project card */}
          <Link href="/workspace">
            <div className="group cursor-pointer">
              <div className="aspect-[4/3] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2.5 hover:border-primary/50 hover:bg-primary/5 transition-all">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold text-foreground px-0.5">
                {lang === "ar" ? "مشروع جديد" : "New Project"}
              </p>
            </div>
          </Link>

          {/* Loading skeletons */}
          {isLoading && [1, 2, 3].map(i => (
            <div key={i}>
              <div className="aspect-[4/3] rounded-xl bg-muted/50 animate-pulse" />
              <div className="mt-2 h-3 w-24 bg-muted/50 animate-pulse rounded" />
              <div className="mt-1 h-2.5 w-16 bg-muted/30 animate-pulse rounded" />
            </div>
          ))}

          {/* Brand cards */}
          {!isLoading && recentBrands.map((brand) => (
            <Link key={brand.id} href={`/brands/${brand.id}`}>
              <div className="group cursor-pointer">
                <div className="aspect-[4/3] rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all">
                  {brand.logoUrl ? (
                    <img
                      src={brand.logoUrl}
                      alt={brand.companyName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-primary/10 to-violet-500/10">
                      <Building2 className="w-8 h-8 text-primary/30" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold text-foreground truncate px-0.5">
                  {brand.companyName || (lang === "ar" ? "بدون عنوان" : "Untitled")}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1 px-0.5">
                  <Clock className="w-3 h-3" />
                  {lang === "ar" ? "تم التحديث " : "Updated "}
                  {new Date(brand.createdAt).toLocaleDateString(
                    lang === "ar" ? "ar-SA" : "en-US",
                    { month: "short", day: "numeric", year: "numeric" }
                  )}
                </p>
              </div>
            </Link>
          ))}

          {/* Empty state when no brands */}
          {!isLoading && recentBrands.length === 0 && (
            <div className="col-span-full text-center py-8">
              <p className="text-sm text-muted-foreground">
                {lang === "ar"
                  ? "لا توجد مشاريع بعد — أنشئ أول علامة تجارية لك ↑"
                  : "No projects yet — create your first brand ↑"}
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
