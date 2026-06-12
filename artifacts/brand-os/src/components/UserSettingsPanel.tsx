import { useState } from "react";
import { X, Globe, Palette, User, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { useUserSettings, type Theme } from "@/contexts/UserSettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { type Lang, t } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "language" | "theme" | "account";

const TABS: { id: Tab; icon: typeof Globe; key: "language" | "theme" | "account" }[] = [
  { id: "language", icon: Globe, key: "language" },
  { id: "theme", icon: Palette, key: "theme" },
  { id: "account", icon: User, key: "account" },
];

export default function UserSettingsPanel({ open, onClose }: Props) {
  const { prefs, setLanguage, setTheme, updateProfile } = useUserSettings();
  const { user, refresh } = useAuth();
  const lang = prefs.language;

  const [tab, setTab] = useState<Tab>("language");
  const [name, setName] = useState(user?.name ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!open) return null;

  function flash(ok: boolean, msg: string) {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 3000);
  }

  async function handleLangChange(l: Lang) {
    setSaving(true);
    await setLanguage(l).catch(() => {});
    setSaving(false);
    flash(true, t(l, "saved"));
  }

  async function handleThemeChange(th: Theme) {
    setSaving(true);
    await setTheme(th).catch(() => {});
    setSaving(false);
  }

  async function handleSaveAccount() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(name.trim(), currentPw || undefined, newPw || undefined);
      await refresh();
      setCurrentPw("");
      setNewPw("");
      flash(true, t(lang, "saved"));
    } catch (e: any) {
      flash(false, e.message || t(lang, "errorSaving"));
    } finally {
      setSaving(false);
    }
  }

  const dir = lang === "ar" ? "rtl" : "ltr";

  const langOptions: { value: Lang; label: string; flag: string }[] = [
    { value: "ar", label: t(lang, "arabic"), flag: "🇸🇦" },
    { value: "en", label: t(lang, "english"), flag: "🇺🇸" },
  ];

  const themeOptions: { value: Theme; label: string; icon: string }[] = [
    { value: "dark", label: t(lang, "dark"), icon: "🌙" },
    { value: "light", label: t(lang, "light"), icon: "☀️" },
    { value: "system", label: t(lang, "systemTheme"), icon: "⚙️" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        dir={dir}
        className="fixed inset-y-0 end-0 z-[90] w-full max-w-sm bg-[#0f1117] border-s border-border shadow-2xl flex flex-col"
        style={{ borderInlineStart: "1px solid hsl(var(--border))" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-base text-foreground">{t(lang, "settingsTitle")}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-4 pb-0">
          {TABS.map(({ id, icon: Icon, key }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                tab === id
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(lang, key as any)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {/* ── Language Tab ── */}
          {tab === "language" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t(lang, "langDesc")}</p>
              {langOptions.map(({ value, label, flag }) => (
                <button
                  key={value}
                  onClick={() => handleLangChange(value)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-start ${
                    prefs.language === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent"
                  }`}
                >
                  <span className="text-2xl leading-none">{flag}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {value === "ar" ? "Arabic — Right to Left" : "English — Left to Right"}
                    </p>
                  </div>
                  {prefs.language === value && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Theme Tab ── */}
          {tab === "theme" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t(lang, "themeDesc")}</p>
              {themeOptions.map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => handleThemeChange(value)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-start ${
                    prefs.theme === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent"
                  }`}
                >
                  <span className="text-2xl leading-none">{icon}</span>
                  <span className="flex-1 font-semibold text-sm">{label}</span>
                  {prefs.theme === value && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Account Tab ── */}
          {tab === "account" && (
            <div className="space-y-5">
              {/* Info */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t(lang, "profileInfo")}
                </p>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {t(lang, "displayName")}
                  </label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t(lang, "namePlaceholder")}
                    className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {t(lang, "email")}
                  </label>
                  <input
                    value={user?.email ?? ""}
                    disabled
                    className="w-full px-3 py-2.5 rounded-lg bg-muted/40 border border-border text-sm text-muted-foreground cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t(lang, "passwordSection")}
                </p>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {t(lang, "currentPassword")}
                  </label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {t(lang, "newPassword")}
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      placeholder={t(lang, "passwordPlaceholder")}
                      className="w-full px-3 py-2.5 pe-10 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border space-y-2">
          {feedback && (
            <p className={`text-xs text-center font-medium ${feedback.ok ? "text-emerald-500" : "text-red-500"}`}>
              {feedback.msg}
            </p>
          )}

          {tab === "account" && (
            <button
              onClick={handleSaveAccount}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t(lang, "saving")}</>
              ) : (
                t(lang, "save")
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {t(lang, "cancel")}
          </button>
        </div>
      </div>
    </>
  );
}
