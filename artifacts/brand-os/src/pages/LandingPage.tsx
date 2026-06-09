import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  Sparkles,
  Zap,
  LayoutTemplate,
  Image as ImageIcon,
  BarChart3,
  CalendarDays,
  ArrowRight,
  CheckCircle2,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Zap,
  LayoutTemplate,
  Image: ImageIcon,
  BarChart3,
  CalendarDays,
};

interface Stat { value: string; label: string }
interface Project { name: string; logoUrl?: string; link?: string }
interface Feature { icon: string; title: string; description: string }
interface PricingPlan {
  name: string;
  price: string;
  period?: string;
  description?: string;
  features: string[];
  ctaLabel?: string;
  highlighted?: boolean;
}

interface LandingConfig {
  accentColor: string;
  badge: string;
  heroTitle: string;
  heroTitleAccent: string;
  heroTitleSuffix: string;
  heroSubtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  showStats: boolean;
  stats: Stat[];
  showProjects: boolean;
  projectsHeading: string;
  projects: Project[];
  showHighlights: boolean;
  highlights: string[];
  featuresHeading: string;
  featuresSubheading: string;
  features: Feature[];
  showPricing: boolean;
  pricingHeading: string;
  pricingSubheading: string;
  pricingPlans: PricingPlan[];
  ctaHeading: string;
  ctaSubheading: string;
  ctaButtonLabel: string;
  footerText: string;
}

const DEFAULTS: LandingConfig = {
  accentColor: "#ec4899",
  badge: "Powered by GPT-5 & gpt-image-1",
  heroTitle: "Build Brands &",
  heroTitleAccent: "Campaigns",
  heroTitleSuffix: "with AI",
  heroSubtitle:
    "Brand Architect AI Pro generates complete brand identities, multi-day social media campaigns, and stunning visuals — all in one workspace, isolated per account.",
  primaryCtaLabel: "Start Building for Free",
  secondaryCtaLabel: "Sign In to Your Workspace",
  showStats: false,
  stats: [],
  showProjects: true,
  projectsHeading: "Trusted by ambitious teams",
  projects: [],
  showHighlights: true,
  highlights: [],
  featuresHeading: "Everything You Need to Build a Brand",
  featuresSubheading:
    "From identity to content to visuals — AI handles the heavy lifting so you can focus on growth.",
  features: [],
  showPricing: true,
  pricingHeading: "Simple, transparent pricing",
  pricingSubheading: "Start free. Upgrade as you grow.",
  pricingPlans: [],
  ctaHeading: "Ready to Build Your Brand?",
  ctaSubheading:
    "Create your account and start generating your brand identity in minutes.",
  ctaButtonLabel: "Get Started Free",
  footerText: "Built with AI",
};

const apiBase = (import.meta as any).env?.BASE_URL ?? "/";

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [124, 58, 237];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export default function LandingPage() {
  const reduce = useReducedMotion();
  const [config, setConfig] = useState<LandingConfig>(DEFAULTS);
  const [siteName, setSiteName] = useState("Brand Architect AI Pro");
  const [tagline, setTagline] = useState("AI Brand & Marketing OS");
  const [primaryColor, setPrimaryColor] = useState("#7c3aed");

  useEffect(() => {
    let alive = true;
    fetch(`${apiBase}api/public-settings`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        if (d.siteName) setSiteName(d.siteName);
        if (d.tagline) setTagline(d.tagline);
        if (d.primaryColor) setPrimaryColor(d.primaryColor);
        if (d.landing) setConfig({ ...DEFAULTS, ...d.landing });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const accent = config.accentColor || "#ec4899";
  const gradientText = useMemo(
    () => `linear-gradient(90deg, ${primaryColor}, ${accent}, ${primaryColor})`,
    [primaryColor, accent],
  );
  const gradientBtn = useMemo(
    () => `linear-gradient(90deg, ${primaryColor}, ${accent})`,
    [primaryColor, accent],
  );

  const fadeUp = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as any },
      };

  return (
    <div
      dir="ltr"
      className="relative min-h-screen overflow-hidden bg-[#06070d] text-white"
      style={
        {
          ["--lp-primary" as any]: primaryColor,
          ["--lp-accent" as any]: accent,
        } as React.CSSProperties
      }
    >
      <BackgroundFx primary={primaryColor} accent={accent} reduce={!!reduce} />

      {/* Nav */}
      <header className="relative z-30 border-b border-white/5 backdrop-blur-xl bg-[#06070d]/60 sticky top-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <motion.div
            initial={reduce ? false : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2.5"
          >
            <div
              className="relative w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: gradientBtn, boxShadow: `0 12px 30px -12px ${rgba(primaryColor, 0.7)}` }}
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm tracking-tight">{siteName}</span>
              <span className="text-[10px] text-white/50 font-medium uppercase tracking-[0.2em]">
                {tagline}
              </span>
            </div>
          </motion.div>
          <div className="flex items-center gap-2">
            {config.showPricing && (
              <a
                href="#pricing"
                className="hidden sm:inline-block text-sm text-white/70 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Pricing
              </a>
            )}
            <Link href="/sign-in">
              <button className="text-sm text-white/70 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
                Sign In
              </button>
            </Link>
            <Link href="/sign-up">
              <button
                className="text-sm font-medium text-white px-4 py-1.5 rounded-lg shadow-lg transition-transform hover:scale-[1.02]"
                style={{ background: gradientBtn, boxShadow: `0 10px 24px -10px ${rgba(primaryColor, 0.7)}` }}
              >
                Get Started
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-16 text-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-white/80 text-xs font-medium px-3.5 py-1.5 rounded-full mb-8 backdrop-blur"
        >
          <span className="relative flex h-2 w-2">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: primaryColor }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: primaryColor }}
            />
          </span>
          {config.badge}
        </motion.div>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight mb-6"
        >
          {config.heroTitle}{" "}
          <span className="relative inline-block">
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: gradientText,
                backgroundSize: "200% 100%",
                WebkitBackgroundClip: "text",
                animation: reduce ? undefined : "lpShine 8s linear infinite",
              }}
            >
              {config.heroTitleAccent}
            </span>
            {!reduce && (
              <motion.span
                aria-hidden
                className="absolute -inset-x-2 -inset-y-1 -z-10 rounded-2xl blur-2xl"
                style={{
                  background: `linear-gradient(90deg, ${rgba(primaryColor, 0.25)}, ${rgba(accent, 0.25)})`,
                }}
                animate={{ opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
            )}
          </span>
          {config.heroTitleSuffix && (
            <>
              <br />
              {config.heroTitleSuffix}
            </>
          )}
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-base sm:text-lg text-white/65 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          {config.heroSubtitle}
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14"
        >
          {config.primaryCtaLabel && (
            <Link href="/sign-up">
              <button
                className="group relative flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white overflow-hidden shadow-2xl transition-transform hover:scale-[1.02]"
                style={{ background: gradientBtn, boxShadow: `0 20px 40px -16px ${rgba(primaryColor, 0.7)}` }}
              >
                <span className="relative flex items-center gap-2">
                  {config.primaryCtaLabel}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </button>
            </Link>
          )}
          {config.secondaryCtaLabel && (
            <Link href="/sign-in">
              <button className="flex items-center gap-2 border border-white/15 bg-white/5 backdrop-blur text-white/90 px-6 py-3.5 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors">
                {config.secondaryCtaLabel}
              </button>
            </Link>
          )}
        </motion.div>

        {/* Stats */}
        {config.showStats && config.stats?.length > 0 && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto mb-12"
          >
            {config.stats.map((s, i) => (
              <div
                key={i}
                className="relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur px-4 py-4 overflow-hidden"
              >
                <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                  {s.value}
                </div>
                <div className="text-[11px] text-white/50 mt-1 uppercase tracking-wider">
                  {s.label}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Highlights grid */}
        {config.showHighlights && config.highlights?.length > 0 && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-2xl mx-auto"
          >
            {config.highlights.map((h) => (
              <div
                key={h}
                className="flex items-center gap-2 text-xs sm:text-sm text-white/70 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2"
              >
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: primaryColor }} />
                <span className="text-left">{h}</span>
              </div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Projects marquee */}
      {config.showProjects && config.projects?.length > 0 && (
        <ProjectsMarquee
          heading={config.projectsHeading}
          projects={config.projects}
          primary={primaryColor}
          accent={accent}
          reduce={!!reduce}
        />
      )}

      {/* Features */}
      {config.features.length > 0 && (
        <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
              {config.featuresHeading}
            </h2>
            <p className="text-white/60 max-w-xl mx-auto">{config.featuresSubheading}</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {config.features.map((f, i) => {
              const Icon = ICONS[f.icon] ?? Sparkles;
              const glow = i % 2 === 0 ? primaryColor : accent;
              return (
                <motion.div
                  key={`${f.title}-${i}`}
                  initial={reduce ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={reduce ? undefined : { y: -4 }}
                  className="group relative p-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur overflow-hidden"
                >
                  <div
                    className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-30 group-hover:opacity-60 transition-opacity duration-500"
                    style={{ background: glow }}
                  />
                  <div
                    className="relative w-11 h-11 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center mb-4"
                    style={{ color: glow }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="relative font-semibold mb-2 text-base">{f.title}</h3>
                  <p className="relative text-sm text-white/65 leading-relaxed">{f.description}</p>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Pricing */}
      {config.showPricing && config.pricingPlans?.length > 0 && (
        <section id="pricing" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-24">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
              {config.pricingHeading}
            </h2>
            <p className="text-white/60 max-w-xl mx-auto">{config.pricingSubheading}</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {config.pricingPlans.map((p, i) => (
              <motion.div
                key={`${p.name}-${i}`}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "relative rounded-2xl p-7 border bg-white/[0.03] backdrop-blur flex flex-col",
                  p.highlighted ? "border-transparent" : "border-white/10",
                )}
                style={
                  p.highlighted
                    ? {
                        background: `linear-gradient(180deg, ${rgba(primaryColor, 0.15)}, ${rgba(accent, 0.08)}), rgba(255,255,255,0.03)`,
                        boxShadow: `0 30px 60px -30px ${rgba(primaryColor, 0.5)}, inset 0 0 0 1px ${rgba(primaryColor, 0.4)}`,
                      }
                    : undefined
                }
              >
                {p.highlighted && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full text-white"
                    style={{ background: gradientBtn }}
                  >
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold mb-1">{p.name}</h3>
                {p.description && (
                  <p className="text-xs text-white/55 mb-5">{p.description}</p>
                )}
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                  {p.period && <span className="text-sm text-white/50">{p.period}</span>}
                </div>
                <ul className="space-y-2.5 mb-7 flex-1">
                  {p.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-sm text-white/75">
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: primaryColor }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up">
                  <button
                    className={cn(
                      "w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-transform hover:scale-[1.02]",
                      p.highlighted ? "text-white" : "border border-white/15 text-white/90 hover:bg-white/5",
                    )}
                    style={
                      p.highlighted
                        ? { background: gradientBtn, boxShadow: `0 12px 30px -12px ${rgba(primaryColor, 0.7)}` }
                        : undefined
                    }
                  >
                    {p.ctaLabel || "Get started"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative z-10 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
          <motion.div
            {...fadeUp}
            className="relative rounded-3xl border border-white/10 backdrop-blur p-10 sm:p-14 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${rgba(primaryColor, 0.18)}, ${rgba(accent, 0.12)})`,
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at top, ${rgba(primaryColor, 0.25)}, transparent 60%)`,
              }}
            />
            <h2 className="relative text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
              {config.ctaHeading}
            </h2>
            <p className="relative text-white/70 mb-8 max-w-lg mx-auto">{config.ctaSubheading}</p>
            <Link href="/sign-up">
              <button
                className="relative inline-flex items-center gap-2 mx-auto px-8 py-4 rounded-xl text-sm font-semibold text-white overflow-hidden shadow-2xl transition-transform hover:scale-[1.02]"
                style={{ background: gradientBtn, boxShadow: `0 24px 50px -16px ${rgba(primaryColor, 0.7)}` }}
              >
                {config.ctaButtonLabel}
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: gradientBtn }}
            >
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs text-white/60 font-medium">
              {siteName} {tagline}
            </span>
          </div>
          {config.footerText && (
            <p className="text-xs text-white/40">
              {config.footerText} · {new Date().getFullYear()}
            </p>
          )}
        </div>
      </footer>

      <style>{`
        @keyframes lpShine {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes lpMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .lp-marquee-track { animation: lpMarquee 36s linear infinite; }
        .lp-marquee:hover .lp-marquee-track { animation-play-state: paused; }
      `}</style>
    </div>
  );
}

function ProjectsMarquee({
  heading,
  projects,
  primary,
  accent,
  reduce,
}: {
  heading: string;
  projects: Project[];
  primary: string;
  accent: string;
  reduce: boolean;
}) {
  const items = [...projects, ...projects];
  return (
    <section className="relative z-10 py-12 border-y border-white/5 bg-white/[0.015]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {heading && (
          <p className="text-center text-xs uppercase tracking-[0.25em] text-white/45 mb-8">
            {heading}
          </p>
        )}
        <div
          className="lp-marquee relative overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
          }}
        >
          <div
            className={cn("flex gap-8 whitespace-nowrap w-max", !reduce && "lp-marquee-track")}
          >
            {items.map((p, i) => {
              const initial = (p.name?.[0] ?? "?").toUpperCase();
              const Inner = (
                <div className="group inline-flex items-center gap-3 px-5 py-3 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur hover:bg-white/[0.08] transition-colors min-w-[180px]">
                  {p.logoUrl ? (
                    <img src={p.logoUrl} alt={p.name} className="h-7 w-7 rounded-md object-cover" />
                  ) : (
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${primary}, ${accent})`,
                      }}
                    >
                      {initial}
                    </div>
                  )}
                  <span className="text-sm font-medium text-white/85 tracking-tight">
                    {p.name}
                  </span>
                </div>
              );
              return (
                <div key={i} className="flex-shrink-0">
                  {p.link ? (
                    <a href={p.link} target="_blank" rel="noopener noreferrer">
                      {Inner}
                    </a>
                  ) : (
                    Inner
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function BackgroundFx({
  primary,
  accent,
  reduce,
}: {
  primary: string;
  accent: string;
  reduce: boolean;
}) {
  return (
    <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
        }}
      />
      <motion.div
        className="absolute -top-32 left-1/4 w-[520px] h-[520px] rounded-full blur-[120px]"
        style={{ background: rgba(primary, 0.32) }}
        animate={
          reduce ? undefined : { x: [0, 60, -40, 0], y: [0, 30, -20, 0], scale: [1, 1.1, 0.95, 1] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-40 right-1/4 w-[460px] h-[460px] rounded-full blur-[120px]"
        style={{ background: rgba(accent, 0.28) }}
        animate={
          reduce ? undefined : { x: [0, -40, 50, 0], y: [0, 40, -30, 0], scale: [1, 0.95, 1.1, 1] }
        }
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px]"
        style={{ background: rgba(primary, 0.22) }}
        animate={reduce ? undefined : { opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}
