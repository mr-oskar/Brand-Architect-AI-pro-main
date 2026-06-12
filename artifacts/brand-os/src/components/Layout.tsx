import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Sparkles, PlusCircle, Menu, X,
  Library, LayoutTemplate, ShieldCheck, ChevronRight, Bell,
  CalendarDays, LogOut, Workflow, Settings,
  CheckCheck, Megaphone, Building2, Zap, Info,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { t } from "@/lib/i18n";
import { getGetDashboardSummaryQueryKey, getListBrandsQueryKey } from "@workspace/api-client-react";
import UserSettingsPanel from "@/components/UserSettingsPanel";

// ── Nav ────────────────────────────────────────────────────────────────────────

function buildNavSections(isAdmin: boolean, features: { analytics: boolean; templates: boolean; socialPublishing: boolean }, lang: "ar" | "en") {
  const tools = [
    { href: "/nodes",     label: t(lang, "nodes"),           icon: Workflow },
    { href: "/calendar",  label: t(lang, "contentCalendar"), icon: CalendarDays },
    { href: "/assets",    label: t(lang, "assetLibrary"),    icon: Library },
  ];
  if (features.templates !== false) tools.push({ href: "/templates", label: t(lang, "templates"), icon: LayoutTemplate });

  const sections = [
    {
      label: t(lang, "workspace"),
      items: [
        { href: "/",           label: t(lang, "dashboard"), icon: LayoutDashboard },
        { href: "/brands/new", label: t(lang, "newBrand"),  icon: PlusCircle },
      ],
    },
    { label: t(lang, "tools"), items: tools },
  ];
  if (isAdmin) {
    sections.push({
      label: t(lang, "system"),
      items: [{ href: "/admin", label: t(lang, "adminPanel"), icon: ShieldCheck }],
    });
  }
  return sections;
}

// ── Prefetch ───────────────────────────────────────────────────────────────────

function usePrefetchCoreData() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const prefetchIfMissing = async (queryKey: readonly unknown[], url: string) => {
      if (queryClient.getQueryData(queryKey)) return;
      try {
        const res = await fetch(`${baseUrl}${url}`);
        if (res.ok) queryClient.setQueryData(queryKey, await res.json());
      } catch {}
    };
    prefetchIfMissing(getGetDashboardSummaryQueryKey(), "/api/dashboard/summary");
    prefetchIfMissing(getListBrandsQueryKey(), "/api/brands");
  }, [queryClient]);
}

// ── Notifications ──────────────────────────────────────────────────────────────

interface Notif {
  id: string;
  icon: React.ElementType;
  color: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  time: string;
}

const STATIC_NOTIFS: Notif[] = [
  {
    id: "n1",
    icon: Sparkles,
    color: "text-primary",
    titleAr: "مرحباً بك في المنصة",
    titleEn: "Welcome to the platform",
    bodyAr: "ابدأ بإنشاء علامتك التجارية الأولى وتجربة قوة الذكاء الاصطناعي.",
    bodyEn: "Start by creating your first brand and experience the power of AI.",
    time: "now",
  },
  {
    id: "n2",
    icon: Zap,
    color: "text-amber-500",
    titleAr: "نصيحة: محرر العقد",
    titleEn: "Tip: Nodes Editor",
    bodyAr: "يمكنك دمج الصور والنصوص وتوليد صور احترافية بالذكاء الاصطناعي.",
    bodyEn: "Combine images and prompts to generate professional AI images.",
    time: "1h",
  },
  {
    id: "n3",
    icon: Building2,
    color: "text-cyan-500",
    titleAr: "جاهز لبناء هويتك؟",
    titleEn: "Ready to build your identity?",
    bodyAr: "أضف شعارك وألوانك وسيُنشئ الذكاء الاصطناعي هويتك البصرية الكاملة.",
    bodyEn: "Add your logo and colors and AI will build your complete visual identity.",
    time: "2h",
  },
  {
    id: "n4",
    icon: Megaphone,
    color: "text-violet-500",
    titleAr: "الحملات التسويقية",
    titleEn: "Marketing Campaigns",
    bodyAr: "جرّب توليد حملة تسويقية متعددة الأيام لأي علامة تجارية.",
    bodyEn: "Try generating a multi-day marketing campaign for any brand.",
    time: "5h",
  },
  {
    id: "n5",
    icon: Info,
    color: "text-muted-foreground",
    titleAr: "تحديث النظام",
    titleEn: "System Update",
    bodyAr: "تم تحديث المنصة بميزات جديدة. استكشف التحسينات الجديدة.",
    bodyEn: "The platform has been updated with new features. Explore the improvements.",
    time: "1d",
  },
];

function NOTIF_STORAGE_KEY(userId: string) { return `notifs_read_${userId}`; }

function NotificationsPanel({ lang, userId }: { lang: "ar" | "en"; userId: string }) {
  const [read, setRead] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY(userId)) ?? "[]")); }
    catch { return new Set(); }
  });

  function markAllRead() {
    const all = new Set(STATIC_NOTIFS.map(n => n.id));
    setRead(all);
    try { localStorage.setItem(NOTIF_STORAGE_KEY(userId), JSON.stringify([...all])); } catch {}
  }

  function markOne(id: string) {
    const next = new Set(read);
    next.add(id);
    setRead(next);
    try { localStorage.setItem(NOTIF_STORAGE_KEY(userId), JSON.stringify([...next])); } catch {}
  }

  const unread = STATIC_NOTIFS.filter(n => !read.has(n.id));

  return (
    <div className="absolute end-0 top-full mt-2 w-80 bg-[#0f1117] border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">{t(lang, "notifications")}</h3>
          {unread.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread.length}
            </span>
          )}
        </div>
        {unread.length > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {lang === "ar" ? "تحديد الكل كمقروء" : "Mark all read"}
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
        {STATIC_NOTIFS.map((n) => {
          const Icon = n.icon;
          const isRead = read.has(n.id);
          return (
            <button
              key={n.id}
              onClick={() => markOne(n.id)}
              className={cn(
                "w-full flex items-start gap-3 px-4 py-3 text-start hover:bg-accent/50 transition-colors",
                !isRead && "bg-primary/5"
              )}
            >
              <div className={cn("w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5", isRead ? "opacity-50" : "")}>
                <Icon className={cn("w-4 h-4", n.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-xs font-semibold text-foreground", isRead && "text-muted-foreground")}>
                  {lang === "ar" ? n.titleAr : n.titleEn}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                  {lang === "ar" ? n.bodyAr : n.bodyEn}
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">{n.time}</p>
              </div>
              {!isRead && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-2" />}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border text-center">
        <p className="text-[11px] text-muted-foreground">
          {lang === "ar" ? "إشعارات النظام فقط في هذه المرحلة" : "System notifications only at this stage"}
        </p>
      </div>
    </div>
  );
}

// ── UserProfile ────────────────────────────────────────────────────────────────

function UserProfile({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user, signOut, refresh } = useAuth();
  const { prefs } = useUserSettings();
  const lang = prefs.language;

  if (!user) return null;

  const displayName = user.name || user.email.split("@")[0] || "User";
  const initials = (user.name?.[0] ?? user.email[0] ?? "U").toUpperCase();
  const credits = user.credits ?? 0;
  const isAdmin = user.role === "admin";
  const lowCredits = !isAdmin && credits <= 20;

  return (
    <div className="px-3 pt-3 border-t border-sidebar-border/60 mt-2">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center text-[11px] font-bold text-white">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-sidebar-foreground leading-none truncate">{displayName}</p>
          <p className="text-[10px] text-sidebar-foreground/40 mt-0.5 truncate">{user.email}</p>
        </div>
        <button
          onClick={onOpenSettings}
          title={t(lang, "settings")}
          className="w-6 h-6 rounded-md flex items-center justify-center text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-primary transition-colors flex-shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Credits balance */}
      <button
        onClick={() => refresh()}
        title={lang === "ar" ? "نقاطك المتاحة — اضغط للتحديث" : "Your credits — click to refresh"}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg mb-2 transition-colors ${
          isAdmin
            ? "bg-emerald-500/10 hover:bg-emerald-500/15"
            : lowCredits
            ? "bg-amber-500/10 hover:bg-amber-500/15"
            : "bg-primary/10 hover:bg-primary/15"
        }`}
      >
        <span className={`flex items-center gap-1.5 text-[11px] font-medium ${
          isAdmin ? "text-emerald-500" : lowCredits ? "text-amber-500" : "text-primary"
        }`}>
          <span className="text-sm">⚡</span>
          {isAdmin ? t(lang, "unlimited") : `${credits.toLocaleString()} ${t(lang, "credits")}`}
        </span>
      </button>

      <button
        onClick={() => { signOut(); }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-sidebar-foreground/50 hover:bg-red-500/10 hover:text-red-400 transition-colors group"
      >
        <LogOut className="w-3.5 h-3.5 group-hover:text-red-400" />
        {t(lang, "signOut")}
      </button>
    </div>
  );
}

// ── Main Layout ────────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const { prefs } = useUserSettings();
  const lang = prefs.language;

  const isAdmin = (user?.role ?? "") === "admin";
  const navSections = buildNavSections(isAdmin, settings.features, lang);
  usePrefetchCoreData();

  // Close notif panel on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
      setNotifOpen(false);
    }
  }, []);

  useEffect(() => {
    if (notifOpen) document.addEventListener("mousedown", handleOutsideClick);
    else document.removeEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [notifOpen, handleOutsideClick]);

  // Unread count from localStorage
  const readIds: Set<string> = (() => {
    if (!user) return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY(user.id)) ?? "[]")); }
    catch { return new Set(); }
  })();
  const unreadCount = STATIC_NOTIFS.filter(n => !readIds.has(n.id)).length;

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-50 w-64 flex flex-col transition-transform duration-200",
          "bg-sidebar border-e border-sidebar-border",
          mobileOpen
            ? "translate-x-0"
            : lang === "ar"
            ? "translate-x-full lg:translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-sidebar-border gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-sidebar-foreground tracking-tight leading-none truncate">{settings.siteName}</p>
            <p className="text-[10px] text-sidebar-foreground/40 font-medium mt-0.5 uppercase tracking-wider truncate">{settings.tagline}</p>
          </div>
          <button
            className="lg:hidden text-sidebar-foreground/50 hover:text-sidebar-foreground"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="text-[10px] font-semibold text-sidebar-foreground/35 uppercase tracking-widest px-3 mb-1.5">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    location === item.href ||
                    (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-primary" : "")} />
                      <span className="flex-1">{item.label}</span>
                      {active && <ChevronRight className={cn("w-3 h-3 text-primary/60", lang === "ar" ? "rotate-180" : "")} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: notifications + user */}
        <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
          {/* Notifications button */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen(v => !v)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
            >
              <Bell className="w-4 h-4" />
              {t(lang, "notifications")}
              {unreadCount > 0 && (
                <span className="ms-auto w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown panel */}
            {notifOpen && user && (
              <NotificationsPanel lang={lang} userId={user.id} />
            )}
          </div>

          <UserProfile onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 lg:ms-64 flex flex-col min-h-screen">
        {/* Top bar - mobile only */}
        <header className="lg:hidden h-14 border-b border-border flex items-center px-4 bg-background/95 backdrop-blur sticky top-0 z-30">
          <button
            className="text-foreground/60 hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 ms-3">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm text-foreground">{settings.siteName}</span>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      {/* Settings Modal */}
      <UserSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
