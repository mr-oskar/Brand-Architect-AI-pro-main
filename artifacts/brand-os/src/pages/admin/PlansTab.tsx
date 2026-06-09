import { useEffect, useState } from "react";
import { Plus, Trash2, Star, Zap, Check } from "lucide-react";
import { adminFetch, Loading, ErrorBox, Toolbar, Modal, Field, inputCls, fmtMoney } from "./shared";

const QUOTA_KEYS = [
  ["brands", "Brands", "علامات تجارية"],
  ["campaignsPerMonth", "Campaigns / month", "حملات/شهر"],
  ["postsPerMonth", "Posts / month", "منشورات/شهر"],
  ["imagesPerMonth", "Images / month", "صور/شهر"],
  ["aiTokensPerMonth", "AI tokens / month", "توكنز AI/شهر"],
  ["apiCallsPerDay", "API calls / day", "استدعاءات API/يوم"],
] as const;

const GEN_KEYS = [
  ["postsPerCampaign", "Posts / campaign", "منشورات لكل حملة", 5],
  ["imagesPerPost", "Images / post", "صور لكل منشور", 1],
  ["captionVariants", "Caption variants", "بدائل الكابشن", 1],
  ["hashtagsPerPost", "Hashtags / post", "هاشتاقات لكل منشور", 10],
  ["brandKitRevisions", "Brand-kit revisions", "تعديلات الهوية", 3],
  ["videoSecondsPerMonth", "Video seconds / month", "ثوانٍ فيديو/شهر", 0],
] as const;

const FEATURE_CATALOG = [
  { id: "brand-wizard", label: "Brand Wizard", desc: "معالج بناء الهوية" },
  { id: "brand-kit", label: "Brand Kit Editor", desc: "محرر الهوية البصرية" },
  { id: "campaign-generator", label: "Campaign Generator", desc: "مولّد الحملات بالـAI" },
  { id: "templates", label: "Templates Library", desc: "مكتبة القوالب" },
  { id: "image-generation", label: "AI Image Generation", desc: "توليد الصور بالـAI" },
  { id: "video-generation", label: "AI Video Generation", desc: "توليد الفيديو" },
  { id: "social-publishing", label: "Social Publishing", desc: "نشر مباشر على السوشيال" },
  { id: "scheduler", label: "Content Scheduler", desc: "جدولة المحتوى" },
  { id: "full-analytics", label: "Full Analytics", desc: "تحليلات متقدمة" },
  { id: "basic-analytics", label: "Basic Analytics", desc: "تحليلات أساسية" },
  { id: "api-access", label: "API Access", desc: "وصول REST API" },
  { id: "webhooks", label: "Webhooks", desc: "خطافات الويب" },
  { id: "team-seats", label: "Team Seats", desc: "مقاعد الفريق" },
  { id: "white-label", label: "White Label", desc: "علامة بيضاء" },
  { id: "priority-support", label: "Priority Support", desc: "دعم ذو أولوية" },
  { id: "custom-domain", label: "Custom Domain", desc: "نطاق مخصص" },
] as const;

export default function PlansTab() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try { const d = await adminFetch("/api/admin/plans"); setPlans(d.plans); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save(plan: any) {
    if (plan.id && plans.find((p) => p.id === plan.id)) {
      const { plan: u } = await adminFetch(`/api/admin/plans/${plan.id}`, { method: "PATCH", body: JSON.stringify(plan) });
      setPlans((p) => p.map((x) => (x.id === u.id ? u : x)));
    } else {
      const { plan: u } = await adminFetch("/api/admin/plans", { method: "POST", body: JSON.stringify(plan) });
      setPlans((p) => [...p, u]);
    }
    setEditing(null); setCreateOpen(false);
  }
  async function del(id: string) {
    if (!confirm(`Delete plan "${id}"?`)) return;
    await adminFetch(`/api/admin/plans/${id}`, { method: "DELETE" });
    setPlans((p) => p.filter((x) => x.id !== id));
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Toolbar hideSearch onRefresh={load} count={plans.length}
          right={<button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"><Plus className="w-4 h-4" />New plan</button>} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p) => {
          const enabledFeatures: string[] = Array.isArray(p.features) ? p.features : [];
          return (
            <div key={p.id} className={`bg-card border rounded-2xl p-5 ${p.isDefault ? "border-primary/50 ring-1 ring-primary/20" : "border-border"}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base">{p.name}</h3>
                    {p.isDefault && <Star className="w-3.5 h-3.5 text-primary fill-primary" />}
                  </div>
                  <code className="text-[10px] text-muted-foreground">{p.id}</code>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                  {p.isActive ? "active" : "disabled"}
                </span>
              </div>
              <div className="text-2xl font-bold mb-1">{fmtMoney(p.priceCents)}<span className="text-xs text-muted-foreground font-normal"> / {p.interval}</span></div>

              <p className="text-[10px] font-semibold text-muted-foreground uppercase mt-3 mb-1">Quotas</p>
              <div className="space-y-0.5">
                {QUOTA_KEYS.map(([k, lbl]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{lbl}</span>
                    <span className="font-mono">{p.limits?.[k] ?? "∞"}</span>
                  </div>
                ))}
              </div>

              <p className="text-[10px] font-semibold text-muted-foreground uppercase mt-3 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" />Generation defaults</p>
              <div className="space-y-0.5">
                {GEN_KEYS.map(([k, lbl]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{lbl}</span>
                    <span className="font-mono">{p.limits?.[k] ?? "—"}</span>
                  </div>
                ))}
              </div>

              <p className="text-[10px] font-semibold text-muted-foreground uppercase mt-3 mb-1">Features ({enabledFeatures.length})</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {enabledFeatures.length === 0 && <span className="text-[10px] text-muted-foreground">None</span>}
                {enabledFeatures.slice(0, 6).map((f: string) => (
                  <span key={f} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />{f}</span>
                ))}
                {enabledFeatures.length > 6 && <span className="text-[10px] text-muted-foreground">+{enabledFeatures.length - 6} more</span>}
              </div>
              <div className="flex gap-2 pt-2 border-t border-border">
                <button onClick={() => setEditing(p)} className="flex-1 text-xs py-1.5 rounded border border-border hover:bg-muted">Edit</button>
                <button onClick={() => del(p.id)} className="text-red-500 hover:text-red-600 px-2 rounded hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {(editing || createOpen) && (
        <PlanEditModal plan={editing ?? { id: "", name: "", priceCents: 0, interval: "month", isActive: true, isDefault: false, sortOrder: 50, limits: {}, features: [] }}
          isNew={createOpen} onClose={() => { setEditing(null); setCreateOpen(false); }} onSave={save} />
      )}
    </div>
  );
}

function PlanEditModal({ plan, isNew, onClose, onSave }: { plan: any; isNew: boolean; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const [form, setForm] = useState<any>({
    ...plan,
    limits: { ...(plan.limits ?? {}) },
    features: [...(plan.features ?? [])],
  });
  const [busy, setBusy] = useState(false);
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }
  function setLimit(k: string, v: string) { setForm((f: any) => ({ ...f, limits: { ...f.limits, [k]: v === "" ? undefined : Number(v) } })); }
  function toggleFeature(id: string, on: boolean) {
    setForm((f: any) => {
      const set = new Set<string>(f.features ?? []);
      if (on) set.add(id); else set.delete(id);
      return { ...f, features: Array.from(set) };
    });
  }
  const enabled = new Set<string>(form.features ?? []);

  return (
    <Modal title={isNew ? "Create plan" : `Edit plan · ${plan.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="ID (slug)"><input disabled={!isNew} className={inputCls + (isNew ? "" : " opacity-60")} value={form.id} onChange={(e) => set("id", e.target.value)} placeholder="pro" /></Field>
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Price (USD cents)"><input type="number" className={inputCls} value={form.priceCents} onChange={(e) => set("priceCents", +e.target.value)} /></Field>
          <Field label="Billing interval">
            <select className={inputCls} value={form.interval} onChange={(e) => set("interval", e.target.value)}>
              <option value="month">month</option><option value="year">year</option><option value="once">one-time</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />Active</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} />Default for new users</label>
        </div>

        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 mt-2">Monthly quotas · حصص شهرية</p>
          <div className="grid grid-cols-2 gap-3">
            {QUOTA_KEYS.map(([k, lbl, ar]) => (
              <Field key={k} label={`${lbl} · ${ar}`}>
                <input type="number" className={inputCls} value={form.limits[k] ?? ""} onChange={(e) => setLimit(k, e.target.value)} placeholder="unlimited" />
              </Field>
            ))}
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 mt-2 flex items-center gap-1"><Zap className="w-3.5 h-3.5" />Generation points · نقاط التوليد بالأدوات</p>
          <p className="text-[11px] text-muted-foreground mb-2">القيم الافتراضية التي تستخدمها أدوات الـAI عند كل عملية توليد لهذه الخطة.</p>
          <div className="grid grid-cols-2 gap-3">
            {GEN_KEYS.map(([k, lbl, ar, dflt]) => (
              <Field key={k} label={`${lbl} · ${ar}`}>
                <input type="number" min={0} className={inputCls} value={form.limits[k] ?? ""} onChange={(e) => setLimit(k, e.target.value)} placeholder={`default ${dflt}`} />
              </Field>
            ))}
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 mt-2">Features · تفعيل/تعطيل الميزات</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-muted/30 rounded-lg p-3">
            {FEATURE_CATALOG.map((f) => {
              const on = enabled.has(f.id);
              return (
                <label key={f.id} className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${on ? "bg-primary/10 border border-primary/30" : "bg-background border border-transparent hover:border-border"}`}>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{f.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{f.desc}</div>
                  </div>
                  <button type="button" onClick={() => toggleFeature(f.id, !on)}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
                  </button>
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{enabled.size} feature(s) enabled · {enabled.size} ميزة مفعّلة</p>
        </section>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">Cancel</button>
          <button disabled={busy} onClick={async () => { setBusy(true); try { await onSave(form); } finally { setBusy(false); } }}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
