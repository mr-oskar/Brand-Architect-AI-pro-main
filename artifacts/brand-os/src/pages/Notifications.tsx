import { useState } from "react";
import { Bell, CheckCheck, Sparkles, Zap, Building2, Megaphone, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { t } from "@/lib/i18n";
import { NOTIFICATIONS, getReadIds, saveReadIds } from "@/lib/notifications";

const ICON_MAP = { Sparkles, Zap, Building2, Megaphone, Info };

const CATEGORY_BADGE: Record<string, { ar: string; en: string; className: string }> = {
  info:    { ar: "معلومة",  en: "Info",    className: "bg-blue-500/10 text-blue-500" },
  tip:     { ar: "نصيحة",   en: "Tip",     className: "bg-amber-500/10 text-amber-500" },
  system:  { ar: "النظام",  en: "System",  className: "bg-muted text-muted-foreground" },
  feature: { ar: "ميزة",    en: "Feature", className: "bg-primary/10 text-primary" },
};

export default function Notifications() {
  const { user } = useAuth();
  const { prefs } = useUserSettings();
  const lang = prefs.language;

  const [read, setRead] = useState<Set<string>>(() =>
    user ? getReadIds(user.id) : new Set()
  );

  function markOne(id: string) {
    if (!user) return;
    const next = new Set(read);
    next.add(id);
    setRead(next);
    saveReadIds(user.id, next);
  }

  function markAll() {
    if (!user) return;
    const all = new Set(NOTIFICATIONS.map(n => n.id));
    setRead(all);
    saveReadIds(user.id, all);
  }

  const unreadCount = NOTIFICATIONS.filter(n => !read.has(n.id)).length;

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              {t(lang, "notifications")}
            </h1>
            {unreadCount > 0 && (
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? `لديك ${unreadCount} إشعار${unreadCount !== 1 ? "ات" : ""} غير مقروء${unreadCount !== 1 ? "ة" : ""}`
              : `You have ${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
            }
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            {lang === "ar" ? "تحديد الكل كمقروء" : "Mark all as read"}
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Notifications list */}
      <div className="space-y-3">
        {NOTIFICATIONS.map((n) => {
          const Icon = n.icon;
          const isRead = read.has(n.id);
          const badge = CATEGORY_BADGE[n.category];

          return (
            <button
              key={n.id}
              onClick={() => markOne(n.id)}
              className={cn(
                "w-full text-start flex items-start gap-4 p-5 rounded-2xl border transition-all group",
                isRead
                  ? "border-border bg-card hover:bg-accent/30"
                  : "border-primary/20 bg-primary/5 hover:bg-primary/10"
              )}
            >
              {/* Icon */}
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 transition-opacity",
                isRead ? "bg-muted opacity-50" : "bg-muted"
              )}>
                <Icon className={cn("w-5 h-5", n.color)} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className={cn(
                    "text-sm font-semibold",
                    isRead ? "text-muted-foreground" : "text-foreground"
                  )}>
                    {lang === "ar" ? n.titleAr : n.titleEn}
                  </p>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
                    badge.className
                  )}>
                    {lang === "ar" ? badge.ar : badge.en}
                  </span>
                </div>
                <p className={cn(
                  "text-xs leading-relaxed",
                  isRead ? "text-muted-foreground/60" : "text-muted-foreground"
                )}>
                  {lang === "ar" ? n.bodyAr : n.bodyEn}
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-2">
                  {lang === "ar" ? n.timeAr : n.timeEn}
                </p>
              </div>

              {/* Unread dot */}
              {!isRead && (
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
              )}
            </button>
          );
        })}
      </div>

      {/* All-read state */}
      {unreadCount === 0 && (
        <div className="text-center py-8">
          <CheckCheck className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">
            {lang === "ar" ? "كل الإشعارات مقروءة" : "All caught up!"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {lang === "ar" ? "لا توجد إشعارات غير مقروءة" : "No unread notifications"}
          </p>
        </div>
      )}
    </div>
  );
}
