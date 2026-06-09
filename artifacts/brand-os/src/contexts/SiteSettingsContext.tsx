import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface SiteSettings {
  siteName: string;
  tagline: string;
  primaryColor: string;
  defaultLanguage: "ar" | "en" | string;
  features: {
    imageGeneration: boolean;
    socialPublishing: boolean;
    analytics: boolean;
    templates: boolean;
  };
  maintenance: { enabled: boolean; message: string };
}

const FALLBACK: SiteSettings = {
  siteName: "Brand Architect AI Pro",
  tagline: "AI Brand & Marketing OS",
  primaryColor: "#7c3aed",
  defaultLanguage: "ar",
  features: { imageGeneration: true, socialPublishing: true, analytics: true, templates: true },
  maintenance: { enabled: false, message: "" },
};

interface Ctx {
  settings: SiteSettings;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const SiteSettingsContext = createContext<Ctx>({
  settings: FALLBACK,
  isLoading: true,
  refresh: async () => {},
});

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

/* hex (#rrggbb) -> "h s% l%" Tailwind-compatible HSL string */
function hexToHsl(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyToDOM(s: SiteSettings) {
  try {
    document.title = s.siteName || "Brand Architect AI Pro";
    const html = document.documentElement;
    const lang = s.defaultLanguage || "ar";
    html.setAttribute("lang", lang);
    html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    const hsl = hexToHsl(s.primaryColor);
    if (hsl) {
      html.style.setProperty("--primary", hsl);
      html.style.setProperty("--ring", hsl);
      html.style.setProperty("--sidebar-primary", hsl);
    }
  } catch {}
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    try {
      const baseUrl = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/public-settings`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as Partial<SiteSettings>;
        const merged: SiteSettings = { ...FALLBACK, ...data, features: { ...FALLBACK.features, ...(data.features ?? {}) }, maintenance: { ...FALLBACK.maintenance, ...(data.maintenance ?? {}) } };
        setSettings(merged);
        applyToDOM(merged);
      }
    } catch {}
    finally { setIsLoading(false); }
  }

  useEffect(() => { refresh(); /* refresh every 60s so changes propagate */
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ settings, isLoading, refresh }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}
