import { useState, useEffect } from "react";
import {
  X, Globe, Palette, User, Check, Eye, EyeOff, Loader2,
  Moon, Sun, Monitor, Languages, KeyRound,
} from "lucide-react";
import { useUserSettings, type Theme } from "@/contexts/UserSettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { type Lang, t } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "language" | "theme" | "account";

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

  // Sync name when user changes
  useEffect(() => { setName(user?.name ?? ""); }, [user?.name]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

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
    await setTheme(th).catch(() => {});
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

  const TABS: { id: Tab; icon: React.ElementType; labelKey: "language" | "theme" | "account" }[] = [
    { id: "language", icon: Languages, labelKey: "language" },
    { id: "theme",    icon: Palette,   labelKey: "theme" },
    { id: "account",  icon: User,      labelKey: "account" },
  ];

  const langOptions: { value: Lang; icon: React.ElementType; desc: string }[] = [
    { value: "ar", icon: Globe, desc: "العربية — من اليمين لليسار" },
    { value: "en", icon: Globe, desc: "English — Left to Right" },
  ];

  const themeOptions: { value: Theme; icon: React.ElementType; labelKey: "dark" | "light" | "systemTheme" }[] = [
    { value: "dark",   icon: Moon,    labelKey: "dark" },
    { value: "light",  icon: Sun,     labelKey: "light" },
    { value: "system", icon: Monitor, labelKey: "systemTheme" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Centered Modal */}
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="fixed z-[110] inset-0 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="pointer-events-auto w-full max-w-md bg-[#0f1117] border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
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
          <div className="flex gap-1 px-4 pt-3 pb-0">
            {TABS.map(({ id, icon: Icon, labelKey }) => (
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
                {t(lang, labelKey)}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">

            {/* ── Language ── */}
            {tab === "language" && langOptions.map(({ value, desc }) => (
              <button
                key={value}
                onClick={() => handleLangChange(value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-start ${
                  prefs.language === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  prefs.language === value ? "bg-primary/20" : "bg-muted"
                }`}>
                  <Globe className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">
                    {value === "ar" ? t(lang, "arabic") : t(lang, "english")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                {prefs.language === value && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            ))}

            {/* ── Theme ── */}
            {tab === "theme" && themeOptions.map(({ value, icon: Icon, labelKey }) => (
              <button
                key={value}
                onClick={() => handleThemeChange(value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-start ${
                  prefs.theme === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  prefs.theme === value ? "bg-primary/20" : "bg-muted"
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="flex-1 font-semibold text-sm">{t(lang, labelKey)}</span>
                {prefs.theme === value && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            ))}

            {/* ── Account ── */}
            {tab === "account" && (
              <div className="space-y-4">
                {/* Display name */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t(lang, "displayName")}
                  </label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t(lang, "namePlaceholder")}
                    className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                {/* Email (read-only) */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    {t(lang, "email")}
                  </label>
                  <input
                    value={user?.email ?? ""}
                    disabled
                    className="w-full px-3 py-2.5 rounded-lg bg-muted/40 border border-border text-sm text-muted-foreground cursor-not-allowed"
                  />
                </div>

                {/* Password section */}
                <div className="pt-1 border-t border-border">
                  <div className="flex items-center gap-2 mb-3 mt-3">
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t(lang, "passwordSection")}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="password"
                      value={currentPw}
                      onChange={e => setCurrentPw(e.target.value)}
                      placeholder={t(lang, "currentPassword")}
                      className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                    <div className="relative">
                      <input
                        type={showPw ? "text" : "password"}
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        placeholder={t(lang, "newPassword")}
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
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{t(lang, "saving")}</>
                  : t(lang, "save")
                }
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
      </div>
    </>
  );
}
