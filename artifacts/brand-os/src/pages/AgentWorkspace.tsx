import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Send, Building2, Megaphone, Image as ImageIcon, Sparkles,
  ChevronRight, Loader2, Check, Plus, ArrowLeft, Pencil,
  Workflow, LayoutTemplate, Palette, Globe, FileText,
  Bot, User as UserIcon, AlertCircle, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSettings } from "@/contexts/UserSettingsContext";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ToolResult {
  type: "brands_list" | "brand_created" | "brand_kit_generated" | "campaign_created" | "image_generated" | "error";
  [key: string]: any;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResult?: ToolResult | null;
  loading?: boolean;
}

// ── Skill suggestions ──────────────────────────────────────────────────────────

const SKILLS = {
  ar: [
    { icon: Building2, color: "text-primary", bg: "bg-primary/10",
      title: "هوية العلامة التجارية",
      desc: "أنشئ هوية بصرية كاملة لعلامتك",
      prompt: "أريد إنشاء هوية بصرية كاملة لعلامة تجارية جديدة" },
    { icon: Megaphone, color: "text-violet-500", bg: "bg-violet-500/10",
      title: "حملة تسويقية",
      desc: "خطة حملة متعددة الأيام لوسائل التواصل",
      prompt: "أريد إنشاء حملة تسويقية متعددة الأيام" },
    { icon: ImageIcon, color: "text-cyan-500", bg: "bg-cyan-500/10",
      title: "توليد صورة AI",
      desc: "أنشئ صوراً احترافية بالذكاء الاصطناعي",
      prompt: "أريد توليد صورة احترافية بالذكاء الاصطناعي" },
    { icon: Palette, color: "text-amber-500", bg: "bg-amber-500/10",
      title: "هوية بصرية كاملة",
      desc: "ألوان، خطوط، وأنماط تصميمية",
      prompt: "ساعدني في بناء الهوية البصرية الكاملة لشركتي مع الألوان والخطوط" },
    { icon: Globe, color: "text-emerald-500", bg: "bg-emerald-500/10",
      title: "محتوى متعدد المنصات",
      desc: "محتوى مخصص لإنستغرام، تويتر، لينكدإن",
      prompt: "أريد إنشاء محتوى تسويقي لوسائل التواصل الاجتماعي المختلفة" },
    { icon: FileText, color: "text-rose-500", bg: "bg-rose-500/10",
      title: "استراتيجية العلامة",
      desc: "رسالة، قيم، وتموضع تنافسي",
      prompt: "ساعدني في بناء استراتيجية علامة تجارية متكاملة" },
  ],
  en: [
    { icon: Building2, color: "text-primary", bg: "bg-primary/10",
      title: "Brand Identity",
      desc: "Create a complete visual identity for your brand",
      prompt: "I want to create a complete brand identity for a new brand" },
    { icon: Megaphone, color: "text-violet-500", bg: "bg-violet-500/10",
      title: "Marketing Campaign",
      desc: "Multi-day campaign plan for social media",
      prompt: "I want to create a multi-day marketing campaign" },
    { icon: ImageIcon, color: "text-cyan-500", bg: "bg-cyan-500/10",
      title: "AI Image Generation",
      desc: "Generate professional images with AI",
      prompt: "I want to generate a professional AI image" },
    { icon: Palette, color: "text-amber-500", bg: "bg-amber-500/10",
      title: "Full Visual Identity",
      desc: "Colors, fonts, and design patterns",
      prompt: "Help me build a complete visual identity with colors and fonts" },
    { icon: Globe, color: "text-emerald-500", bg: "bg-emerald-500/10",
      title: "Cross-Platform Content",
      desc: "Content for Instagram, Twitter, LinkedIn",
      prompt: "I want to create marketing content for different social platforms" },
    { icon: FileText, color: "text-rose-500", bg: "bg-rose-500/10",
      title: "Brand Strategy",
      desc: "Mission, values, and competitive positioning",
      prompt: "Help me build a complete brand strategy" },
  ],
};

// ── Canvas result cards ────────────────────────────────────────────────────────

function BrandCard({ brand, lang }: { brand: any; lang: "ar" | "en" }) {
  return (
    <Link href={`/brands/${brand.id}`}>
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors cursor-pointer group">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt={brand.name} className="w-full h-full rounded-lg object-cover" />
            : <Building2 className="w-5 h-5 text-primary" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{brand.name}</p>
          <p className="text-xs text-muted-foreground">{brand.industry}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-semibold px-2 py-0.5 rounded-full",
            brand.status === "kit_ready" ? "bg-blue-500/10 text-blue-500" :
            brand.status === "active"    ? "bg-green-500/10 text-green-500" :
            "bg-muted text-muted-foreground"
          )}>
            {brand.status === "kit_ready" ? (lang === "ar" ? "جاهز" : "Ready") :
             brand.status === "active"    ? (lang === "ar" ? "نشط" : "Active") :
             lang === "ar" ? "مسودة" : "Draft"}
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground rtl:rotate-180" />
        </div>
      </div>
    </Link>
  );
}

function ToolResultCard({ result, lang }: { result: ToolResult; lang: "ar" | "en" }) {
  if (result.type === "error") {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{result.message}</span>
      </div>
    );
  }

  if (result.type === "brands_list") {
    const brands = result.brands || [];
    if (brands.length === 0) return (
      <p className="text-sm text-muted-foreground italic">
        {lang === "ar" ? "لا توجد علامات تجارية بعد" : "No brands yet"}
      </p>
    );
    return (
      <div className="space-y-2">
        {brands.map((b: any) => <BrandCard key={b.id} brand={b} lang={lang} />)}
      </div>
    );
  }

  if (result.type === "brand_created") {
    const b = result.brand;
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Check className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-emerald-500">
            {lang === "ar" ? "تم إنشاء العلامة التجارية!" : "Brand created!"}
          </span>
        </div>
        <BrandCard brand={b} lang={lang} />
        <p className="text-xs text-muted-foreground mt-2">
          {lang === "ar" ? `رقم التعريف: #${b.id}` : `Brand ID: #${b.id}`}
        </p>
      </div>
    );
  }

  if (result.type === "brand_kit_generated") {
    const { kit, brandName, brandId } = result;
    const colors = Object.values(kit.colorPalette || {}) as string[];
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-primary">
            {lang === "ar" ? `هوية "${brandName}" جاهزة!` : `"${brandName}" identity ready!`}
          </span>
        </div>
        {kit.personality && (
          <p className="text-xs text-muted-foreground">{kit.personality.slice(0, 120)}…</p>
        )}
        {colors.length > 0 && (
          <div className="flex gap-2">
            {colors.slice(0, 6).map((c: string, i: number) => (
              <div key={i} className="w-8 h-8 rounded-lg border border-black/10" style={{ backgroundColor: c }} title={c} />
            ))}
          </div>
        )}
        {kit.taglines?.length > 0 && (
          <p className="text-xs italic text-muted-foreground">"{kit.taglines[0]}"</p>
        )}
        <Link href={`/brands/${brandId}`}>
          <button className="text-xs text-primary hover:underline flex items-center gap-1">
            {lang === "ar" ? "عرض الهوية الكاملة" : "View full identity"}
            <ChevronRight className="w-3 h-3 rtl:rotate-180" />
          </button>
        </Link>
      </div>
    );
  }

  if (result.type === "campaign_created") {
    const { campaign } = result;
    return (
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Check className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-violet-500">
            {lang === "ar" ? "تم إنشاء الحملة!" : "Campaign created!"}
          </span>
        </div>
        <p className="font-semibold text-sm text-foreground mb-1">{campaign.title}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {campaign.daysCount} {lang === "ar" ? "أيام مخططة" : "days planned"}
        </p>
        <Link href={`/campaigns/${campaign.id}`}>
          <button className="text-xs text-violet-500 hover:underline flex items-center gap-1">
            {lang === "ar" ? "عرض الحملة" : "View campaign"}
            <ChevronRight className="w-3 h-3 rtl:rotate-180" />
          </button>
        </Link>
      </div>
    );
  }

  if (result.type === "image_generated") {
    return (
      <div className="rounded-xl overflow-hidden border border-border">
        <img
          src={result.imageData}
          alt={result.prompt}
          className="w-full max-h-64 object-cover"
        />
        <p className="px-3 py-2 text-xs text-muted-foreground">{result.prompt?.slice(0, 80)}…</p>
      </div>
    );
  }

  return null;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AgentWorkspace() {
  const { user } = useAuth();
  const { prefs } = useUserSettings();
  const lang = prefs.language;
  const [, navigate] = useLocation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState(lang === "ar" ? "مشروع جديد" : "New Project");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Pre-fill from homepage prompt box
  useEffect(() => {
    const saved = sessionStorage.getItem("brand_wizard_prompt");
    if (saved) {
      sessionStorage.removeItem("brand_wizard_prompt");
      setInput(saved);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  function uid() { return Math.random().toString(36).slice(2); }

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    setInput("");
    const userMsg: Message = { id: uid(), role: "user", content };
    const loadingMsg: Message = { id: uid(), role: "assistant", content: "", loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    try {
      const token = localStorage.getItem("brand_os_auth_token");
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json();
      const assistantMsg: Message = {
        id: uid(),
        role: "assistant",
        content: data.reply || "",
        toolResult: data.toolResult || null,
      };
      setMessages(prev => [...prev.filter(m => !m.loading), assistantMsg]);
    } catch {
      setMessages(prev => [...prev.filter(m => !m.loading), {
        id: uid(),
        role: "assistant",
        content: lang === "ar" ? "حدث خطأ، يرجى المحاولة مجدداً." : "Something went wrong. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  const skills = SKILLS[lang];
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-0px)] bg-background overflow-hidden">

      {/* ══════ LEFT — Canvas ══════ */}
      <div className="flex flex-col flex-1 border-e border-border min-w-0">

        {/* Canvas top bar */}
        <div className="h-12 flex items-center gap-3 px-4 border-b border-border bg-card/50 flex-shrink-0">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          </button>

          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={() => { setProjectName(nameInput || projectName); setEditingName(false); }}
              onKeyDown={e => { if (e.key === "Enter") { setProjectName(nameInput || projectName); setEditingName(false); } }}
              className="bg-transparent text-sm font-semibold text-foreground border-b border-primary focus:outline-none px-1 w-40"
            />
          ) : (
            <button
              onClick={() => { setNameInput(projectName); setEditingName(true); }}
              className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              {projectName}
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
          )}

          <div className="ms-auto flex items-center gap-2">
            <Link href="/nodes">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <Workflow className="w-3.5 h-3.5" />
                {lang === "ar" ? "محرر الصور" : "Image Editor"}
              </button>
            </Link>
            <Link href="/brands/new">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <Plus className="w-3.5 h-3.5" />
                {lang === "ar" ? "علامة جديدة" : "New Brand"}
              </button>
            </Link>
          </div>
        </div>

        {/* Canvas body */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.filter(m => m.toolResult).length === 0 ? (
            // Empty state
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3 select-none">
              <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary/40" />
              </div>
              <p className="text-sm font-medium">
                {lang === "ar"
                  ? "ابدأ بكتابة فكرتك في المحادثة"
                  : "Start by typing your idea in the chat"}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {lang === "ar"
                  ? "سيظهر هنا ما ينشئه الذكاء الاصطناعي"
                  : "AI-created content will appear here"}
              </p>
            </div>
          ) : (
            // Results
            <div className="max-w-xl mx-auto space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                {lang === "ar" ? "النتائج" : "Results"}
              </h3>
              {messages
                .filter(m => m.toolResult)
                .map(m => (
                  <ToolResultCard key={m.id} result={m.toolResult!} lang={lang} />
                ))
              }
            </div>
          )}
        </div>

        {/* Canvas toolbar */}
        <div className="h-14 border-t border-border flex items-center px-4 gap-2 bg-card/30 flex-shrink-0">
          {[
            { icon: Building2, label: lang === "ar" ? "علامة" : "Brand", href: "/brands/new" },
            { icon: Megaphone, label: lang === "ar" ? "حملة" : "Campaign", href: "/brands/new" },
            { icon: Workflow,  label: lang === "ar" ? "صور AI" : "AI Images", href: "/nodes" },
            { icon: LayoutTemplate, label: lang === "ar" ? "قوالب" : "Templates", href: "/templates" },
          ].map(({ icon: Icon, label, href }) => (
            <Link key={href + label} href={href}>
              <button className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-medium">{label}</span>
              </button>
            </Link>
          ))}
        </div>
      </div>

      {/* ══════ RIGHT — Chat ══════ */}
      <div className="w-[400px] flex-shrink-0 flex flex-col bg-card">

        {/* Chat header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              {lang === "ar" ? "محادثة جديدة" : "New chat"}
            </span>
          </div>
          {hasMessages && (
            <button
              onClick={() => setMessages([])}
              title={lang === "ar" ? "محادثة جديدة" : "New chat"}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Messages or skills */}
        <div className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            // Skills panel
            <div className="p-4">
              <p className="text-sm font-semibold text-foreground text-center mb-4">
                {lang === "ar" ? "جرّب هذه المهارات" : "Try these Skills"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {skills.map((skill, i) => {
                  const Icon = skill.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => sendMessage(skill.prompt)}
                      className="flex flex-col items-start gap-2 p-3 rounded-xl border border-border bg-background hover:border-primary/40 hover:bg-primary/5 transition-all text-start"
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", skill.bg)}>
                        <Icon className={cn("w-4 h-4", skill.color)} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground leading-tight">{skill.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{skill.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            // Chat messages
            <div className="p-4 space-y-4">
              {messages.map(msg => {
                if (msg.loading) {
                  return (
                    <div key={msg.id} className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-ss-none bg-muted text-muted-foreground text-sm">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{lang === "ar" ? "يفكر..." : "Thinking..."}</span>
                      </div>
                    </div>
                  );
                }

                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="flex items-start gap-2 flex-row-reverse">
                      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-primary-foreground">
                        {(user?.name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()}
                      </div>
                      <div className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-se-none bg-primary text-primary-foreground text-sm leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      {msg.content && (
                        <div className="px-4 py-2.5 rounded-2xl rounded-ss-none bg-muted text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      )}
                      {msg.toolResult && (
                        <ToolResultCard result={msg.toolResult} lang={lang} />
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border flex-shrink-0">
          <div className={cn(
            "rounded-xl border bg-background transition-colors",
            input ? "border-primary/50" : "border-border"
          )}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder={
                lang === "ar"
                  ? 'ابدأ بفكرة، أو اكتب "@" للإشارة...'
                  : 'Start with an idea, or type "@" to mention...'
              }
              disabled={loading}
              rows={1}
              className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none leading-relaxed disabled:opacity-50"
              style={{ minHeight: "44px", maxHeight: "160px" }}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="text-[10px] text-muted-foreground/50">
                {lang === "ar" ? "Enter للإرسال، Shift+Enter لسطر جديد" : "Enter to send, Shift+Enter for new line"}
              </span>
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                  input.trim() && !loading
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground opacity-40 cursor-not-allowed"
                )}
              >
                {loading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
