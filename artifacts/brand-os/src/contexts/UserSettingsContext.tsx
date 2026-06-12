import {
  createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { type Lang } from "@/lib/i18n";

export type Theme = "dark" | "light" | "system";

export interface UserPreferences {
  language: Lang;
  theme: Theme;
}

const DEFAULTS: UserPreferences = { language: "ar", theme: "dark" };

interface Ctx {
  prefs: UserPreferences;
  setLanguage: (lang: Lang) => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  updateProfile: (name: string, currentPassword?: string, newPassword?: string) => Promise<void>;
  isLoading: boolean;
}

const UserSettingsContext = createContext<Ctx>({
  prefs: DEFAULTS,
  setLanguage: async () => {},
  setTheme: async () => {},
  updateProfile: async () => {},
  isLoading: true,
});

export function useUserSettings() {
  return useContext(UserSettingsContext);
}

function cacheKey(userId: string) {
  return `user_prefs_${userId}`;
}

function loadCached(userId: string): UserPreferences {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

function saveCache(userId: string, prefs: UserPreferences) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(prefs));
  } catch {}
}

function applyPrefsToDOM(prefs: UserPreferences) {
  const html = document.documentElement;
  const lang = prefs.language ?? "ar";
  html.setAttribute("lang", lang);
  html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  // Mark that user lang is active so SiteSettingsContext won't override
  html.setAttribute("data-user-lang", lang);

  const theme = prefs.theme ?? "dark";
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.classList.toggle("dark", prefersDark);
  } else {
    html.classList.toggle("dark", theme === "dark");
  }
}

async function apiFetch(url: string, options?: RequestInit) {
  const token = localStorage.getItem("brand_os_auth_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
}

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const prevUserIdRef = useRef<string | null>(null);

  const applyAndCache = useCallback((next: UserPreferences, userId: string) => {
    setPrefs(next);
    applyPrefsToDOM(next);
    saveCache(userId, next);
  }, []);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    if (prevUserIdRef.current !== user.id) {
      prevUserIdRef.current = user.id;
      const cached = loadCached(user.id);
      applyPrefsToDOM(cached);
      setPrefs(cached);
    }

    setIsLoading(true);
    apiFetch("/api/user/preferences")
      .then(r => r.json())
      .then(data => {
        const merged: UserPreferences = { ...DEFAULTS, ...(data.preferences ?? {}) };
        applyAndCache(merged, user.id);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [user?.id, applyAndCache]);

  const setLanguage = useCallback(async (lang: Lang) => {
    if (!user) return;
    const next = { ...prefs, language: lang };
    applyAndCache(next, user.id);
    await apiFetch("/api/user/preferences", {
      method: "PUT",
      body: JSON.stringify({ language: lang }),
    });
  }, [prefs, user, applyAndCache]);

  const setTheme = useCallback(async (theme: Theme) => {
    if (!user) return;
    const next = { ...prefs, theme };
    applyAndCache(next, user.id);
    await apiFetch("/api/user/preferences", {
      method: "PUT",
      body: JSON.stringify({ theme }),
    });
  }, [prefs, user, applyAndCache]);

  const updateProfile = useCallback(async (name: string, currentPassword?: string, newPassword?: string) => {
    const res = await apiFetch("/api/user/profile", {
      method: "PUT",
      body: JSON.stringify({ name, currentPassword, newPassword }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Failed to update profile");
    }
  }, []);

  return (
    <UserSettingsContext.Provider value={{ prefs, setLanguage, setTheme, updateProfile, isLoading }}>
      {children}
    </UserSettingsContext.Provider>
  );
}
