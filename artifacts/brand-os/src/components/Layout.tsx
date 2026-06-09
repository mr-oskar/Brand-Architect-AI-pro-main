import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Sparkles, PlusCircle, Menu, X,
  Library, LayoutTemplate, ShieldCheck, ChevronRight, Bell, Moon, Sun, CalendarDays, LogOut, Workflow,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import { getGetDashboardSummaryQueryKey, getListBrandsQueryKey } from "@workspace/api-client-react";

function buildNavSections(isAdmin: boolean, features: { analytics: boolean; templates: boolean; socialPublishing: boolean }) {
  const tools = [
    { href: "/nodes", label: "Nodes", icon: Workflow },
    { href: "/calendar", label: "Content Calendar", icon: CalendarDays },
    { href: "/assets", label: "Asset Library", icon: Library },
  ];
  if (features.templates !== false) tools.push({ href: "/templates", label: "Templates", icon: LayoutTemplate });

  const sections = [
    {
      label: "Workspace",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/brands/new", label: "New Brand", icon: PlusCircle },
      ],
    },
    { label: "Tools", items: tools },
  ];
  if (isAdmin) {
    sections.push({
      label: "System",
      items: [{ href: "/admin", label: "Admin Panel", icon: ShieldCheck }],
    });
  }
  return sections;
}

function usePrefetchCoreData() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const prefetchIfMissing = async (queryKey: readonly unknown[], url: string) => {
      const existing = queryClient.getQueryData(queryKey);
      if (existing) return;
      try {
        const res = await fetch(`${baseUrl}${url}`);
        if (res.ok) {
          const data = await res.json();
          queryClient.setQueryData(queryKey, data);
        }
      } catch {}
    };
    prefetchIfMissing(getGetDashboardSummaryQueryKey(), "/api/dashboard/summary");
    prefetchIfMissing(getListBrandsQueryKey(), "/api/brands");
  }, [queryClient]);
}

function UserProfile() {
  const { user, signOut, refresh } = useAuth();
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
      </div>

      {/* Credits balance */}
      <button
        onClick={() => refresh()}
        title="نقاطك المتاحة — اضغط للتحديث"
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
          {isAdmin ? "Unlimited" : `${credits.toLocaleString()} نقطة`}
        </span>
        {!isAdmin && (
          <span className="text-[9px] text-sidebar-foreground/40">credits</span>
        )}
      </button>

      <button
        onClick={() => { signOut(); }}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-sidebar-foreground/50 hover:bg-red-500/10 hover:text-red-400 transition-colors group"
      >
        <LogOut className="w-3.5 h-3.5 group-hover:text-red-400" />
        Sign Out
      </button>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains("dark"));
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const isAdmin = (user?.role ?? "") === "admin";
  const navSections = buildNavSections(isAdmin, settings.features);
  usePrefetchCoreData();

  function toggleDark() {
    const html = document.documentElement;
    if (html.classList.contains("dark")) {
      html.classList.remove("dark");
      setDarkMode(false);
    } else {
      html.classList.add("dark");
      setDarkMode(true);
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-200",
          "bg-sidebar border-r border-sidebar-border",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
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
                      {active && <ChevronRight className="w-3 h-3 text-primary/60" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer controls */}
        <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
          <button
            onClick={toggleDark}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors">
            <Bell className="w-4 h-4" />
            Notifications
            <span className="ml-auto w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">3</span>
          </button>
          <UserProfile />
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
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar - mobile */}
        <header className="lg:hidden h-14 border-b border-border flex items-center px-4 bg-background/95 backdrop-blur sticky top-0 z-30">
          <button
            className="text-foreground/60 hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm text-foreground">{settings.siteName}</span>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
