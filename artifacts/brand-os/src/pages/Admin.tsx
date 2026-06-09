import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck, Users, Brain, BarChart3, Settings as SettingsIcon, Activity,
  Database, FileText, Image as ImageIcon, Trash2, Save, RefreshCw,
  CheckCircle2, AlertCircle, Layers, Megaphone, Globe, Wrench, ScrollText,
  Plus, Mail, KeyRound, UserPlus, X, FileCog, CreditCard, ReceiptText,
  TrendingUp, Radio, KeySquare, GitBranch, Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import NotFound from "./not-found";
import { adminFetch, fmtDate, Toolbar, Loading, ErrorBox } from "./admin/shared";
import PagesTab from "./admin/PagesTab";
import PlansTab from "./admin/PlansTab";
import SubscriptionsTab from "./admin/SubscriptionsTab";
import UsageTab from "./admin/UsageTab";
import EventsTab from "./admin/EventsTab";
import ApiKeysTab from "./admin/ApiKeysTab";
import MonitoringTab from "./admin/MonitoringTab";
import WorkflowsTab from "./admin/WorkflowsTab";
import WebhooksTab from "./admin/WebhooksTab";

const NAV_GROUPS = [
  { label: "Insights", items: [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "monitoring", label: "Live Monitoring", icon: Activity },
    { id: "usage", label: "Usage Analytics", icon: TrendingUp },
    { id: "events", label: "Events Stream", icon: Radio },
    { id: "workflows", label: "User Funnel", icon: GitBranch },
  ] },
  { label: "Customers", items: [
    { id: "users", label: "Users", icon: Users },
    { id: "subscriptions", label: "Subscriptions", icon: ReceiptText },
    { id: "plans", label: "Plans & Pricing", icon: CreditCard },
  ] },
  { label: "Content", items: [
    { id: "brands", label: "Brands", icon: Layers },
    { id: "campaigns", label: "Campaigns", icon: Megaphone },
    { id: "posts", label: "Posts", icon: FileText },
  ] },
  { label: "Platform", items: [
    { id: "pages", label: "Pages", icon: FileCog },
    { id: "settings", label: "Site Settings", icon: SettingsIcon },
    { id: "apikeys", label: "API Keys", icon: KeySquare },
    { id: "webhooks", label: "Webhooks", icon: Webhook },
    { id: "audit", label: "Audit Log", icon: ScrollText },
  ] },
] as const;

type TabId =
  | "overview" | "monitoring" | "usage" | "events" | "workflows"
  | "users" | "subscriptions" | "plans"
  | "brands" | "campaigns" | "posts"
  | "pages" | "settings" | "apikeys" | "webhooks" | "audit";

export default function Admin() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const isAdmin = (user?.role ?? "") === "admin";
  if (!user || !isAdmin) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-card/40 flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">Control Center</h1>
              <p className="text-[10px] text-muted-foreground">Full platform admin</p>
            </div>
          </div>
        </div>
        <nav className="p-2 space-y-4">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 mb-1">{g.label}</p>
              <div className="space-y-0.5">
                {g.items.map((it) => {
                  const Icon = it.icon;
                  const active = activeTab === (it.id as TabId);
                  return (
                    <button key={it.id} onClick={() => setActiveTab(it.id as TabId)}
                      className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                        active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                      <Icon className="w-3.5 h-3.5" /> {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="border-b border-border bg-card/30 backdrop-blur sticky top-0 z-20 px-6 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{
            (NAV_GROUPS as unknown as { label: string; items: { id: string; label: string }[] }[]).flatMap((g) => g.items).find((i) => i.id === activeTab)?.label ?? "Overview"
          }</h2>
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{user?.email ?? "—"}</span>
          </div>
        </div>
        <div className="p-6 max-w-7xl">
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "monitoring" && <MonitoringTab />}
          {activeTab === "usage" && <UsageTab />}
          {activeTab === "events" && <EventsTab />}
          {activeTab === "workflows" && <WorkflowsTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "subscriptions" && <SubscriptionsTab />}
          {activeTab === "plans" && <PlansTab />}
          {activeTab === "brands" && <BrandsTab />}
          {activeTab === "campaigns" && <CampaignsTab />}
          {activeTab === "posts" && <PostsTab />}
          {activeTab === "pages" && <PagesTab />}
          {activeTab === "settings" && <SettingsTab />}
          {activeTab === "apikeys" && <ApiKeysTab />}
          {activeTab === "webhooks" && <WebhooksTab />}
          {activeTab === "audit" && <AuditTab />}
        </div>
      </div>
    </div>
  );
}

/* ============================ Overview ============================ */

function OverviewTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setData(await adminFetch("/api/admin/stats")); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  const c = data.counts;
  const cards = [
    { label: "Total Users", value: c.users, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Brands", value: c.brands, icon: Layers, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Campaigns", value: c.campaigns, icon: Megaphone, color: "text-cyan-500", bg: "bg-cyan-500/10" },
    { label: "Posts", value: c.posts, icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", k.bg)}>
                  <Icon className={cn("w-4 h-4", k.color)} />
                </div>
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />Posts by status</h3>
          <div className="space-y-2">
            {(data.postsByStatus ?? []).length === 0 && <p className="text-sm text-muted-foreground">No posts yet.</p>}
            {(data.postsByStatus ?? []).map((s: any) => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className="capitalize">{s.status}</span>
                <span className="font-mono font-semibold">{s.n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" />Environment</h3>
          <ul className="space-y-2 text-sm">
            <EnvRow label="Gemini AI" on={data.env.gemini} />
            <EnvRow label="OpenAI" on={data.env.openai} />
            <EnvRow label="Clerk Auth" on={data.env.clerk} />
            <EnvRow label="Demo Mode" on={data.env.demoMode} />
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">NODE_ENV</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">{data.env.nodeEnv}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Layers className="w-4 h-4 text-primary" />Recent brands</h3>
        {data.recentBrands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No brands yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr><th className="text-left py-2">Name</th><th className="text-left">Industry</th><th className="text-left">Owner</th><th className="text-right">Created</th></tr>
            </thead>
            <tbody>
              {data.recentBrands.map((b: any) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="py-2 font-medium">{b.companyName}</td>
                  <td className="text-muted-foreground">{b.industry}</td>
                  <td className="text-muted-foreground font-mono text-xs">{(b.userId ?? "—").slice(0, 12)}</td>
                  <td className="text-right text-muted-foreground text-xs">{fmtDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EnvRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
        on ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground")}>
        {on ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
        {on ? "Configured" : "Not set"}
      </span>
    </li>
  );
}

/* ============================ Users ============================ */

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resetForId, setResetForId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { const d = await adminFetch("/api/admin/users"); setUsers(d.users); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createUser(payload: { email: string; password: string; name?: string; role: string }) {
    const d = await adminFetch("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
    setUsers((p) => [d.user, ...p]);
  }
  async function resetPassword(id: string, password: string) {
    await adminFetch(`/api/admin/users/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.email ?? "").toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q));
  }, [users, search]);

  async function updateUser(id: string, patch: any) {
    try {
      const d = await adminFetch(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...d.user } : u)));
    } catch (e: any) { alert(e.message); }
  }
  async function removeUser(id: string) {
    if (!confirm("Delete this user and all their brands? This cannot be undone.")) return;
    try {
      await adminFetch(`/api/admin/users/${id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e: any) { alert(e.message); }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  const resetUser = users.find((u) => u.id === resetForId);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Toolbar search={search} setSearch={setSearch} placeholder="Search by email or name…" onRefresh={load} count={filtered.length} />
        <button onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 whitespace-nowrap">
          <UserPlus className="w-4 h-4" /> New user
        </button>
      </div>
      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreate={createUser} />}
      {resetUser && (
        <ResetPasswordModal
          email={resetUser.email}
          onClose={() => setResetForId(null)}
          onReset={async (pw) => { await resetPassword(resetUser.id, pw); setResetForId(null); }}
        />
      )}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">User</th>
              <th className="text-left px-4">Role</th>
              <th className="text-left px-4">Status</th>
              <th className="text-left px-4">Credits</th>
              <th className="text-left px-4">Brands</th>
              <th className="text-left px-4">Joined</th>
              <th className="text-right px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name || u.email.split("@")[0]}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4">
                  <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })}
                    className="bg-background border border-border rounded-md px-2 py-1 text-xs">
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4">
                  <select value={u.status} onChange={(e) => updateUser(u.id, { status: e.target.value })}
                    className="bg-background border border-border rounded-md px-2 py-1 text-xs">
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                  </select>
                </td>
                <td className="px-4">
                  <input
                    type="number"
                    min={0}
                    defaultValue={u.credits ?? 0}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v !== u.credits) updateUser(u.id, { credits: v });
                    }}
                    className="w-20 bg-background border border-border rounded-md px-2 py-1 text-xs font-mono"
                    title="عدد النقاط — اضغط Tab لحفظ التغيير"
                  />
                </td>
                <td className="px-4 font-mono">{u.brandCount}</td>
                <td className="px-4 text-xs text-muted-foreground">{fmtDate(u.createdAt)}</td>
                <td className="px-4 text-right whitespace-nowrap">
                  <button onClick={() => setResetForId(u.id)} className="text-amber-500 hover:text-amber-600 p-1.5 rounded hover:bg-amber-500/10 mr-1" title="Reset password">
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeUser(u.id)} className="text-red-500 hover:text-red-600 p-1.5 rounded hover:bg-red-500/10" title="Delete user">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ Brands ============================ */

function BrandsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true); setError(null);
    try { const d = await adminFetch("/api/admin/brands"); setItems(d.brands); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((b) => (b.companyName ?? "").toLowerCase().includes(q) || (b.industry ?? "").toLowerCase().includes(q));
  }, [items, search]);

  async function remove(id: number) {
    if (!confirm("Delete this brand and all its campaigns/posts?")) return;
    try { await adminFetch(`/api/admin/brands/${id}`, { method: "DELETE" });
      setItems((p) => p.filter((b) => b.id !== id));
    } catch (e: any) { alert(e.message); }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <Toolbar search={search} setSearch={setSearch} placeholder="Search brands…" onRefresh={load} count={filtered.length} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && <div className="col-span-full text-center text-muted-foreground py-12 text-sm">No brands found.</div>}
        {filtered.map((b) => (
          <div key={b.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              {b.logoUrl ? (
                <img src={b.logoUrl} alt="" className="w-12 h-12 rounded-lg object-cover bg-muted" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{b.companyName}</p>
                <p className="text-xs text-muted-foreground truncate">{b.industry}</p>
              </div>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                b.status === "ready" ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground")}>
                {b.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Owner: <span className="font-mono">{(b.userId ?? "—").slice(0, 10)}</span></span>
              <button onClick={() => remove(b.id)} className="text-red-500 hover:text-red-600 p-1 rounded hover:bg-red-500/10">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ Campaigns ============================ */

function CampaignsTab() {
  return <SimpleListTab
    endpoint="/api/admin/campaigns"
    pluralKey="campaigns"
    columns={[
      { key: "title", label: "Title" },
      { key: "brandName", label: "Brand" },
      { key: "createdAt", label: "Created", render: (v) => fmtDate(v) },
    ]}
    deletePath={(id) => `/api/admin/campaigns/${id}`}
    placeholder="Search campaigns…"
  />;
}

/* ============================ Posts ============================ */

function PostsTab() {
  return <SimpleListTab
    endpoint="/api/admin/posts"
    pluralKey="posts"
    columns={[
      { key: "caption", label: "Caption", render: (v) => <span className="line-clamp-2">{v}</span> },
      { key: "campaignTitle", label: "Campaign" },
      { key: "platform", label: "Platform" },
      { key: "publishStatus", label: "Status" },
      { key: "createdAt", label: "Created", render: (v) => fmtDate(v) },
    ]}
    deletePath={(id) => `/api/admin/posts/${id}`}
    placeholder="Search posts…"
  />;
}

/* ============================ Settings ============================ */

function SettingsTab() {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { const d = await adminFetch("/api/admin/settings"); setS(d.settings); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setError(null);
    try {
      const d = await adminFetch("/api/admin/settings", { method: "PUT", body: JSON.stringify({ settings: s }) });
      setS(d.settings);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!s) return null;

  function set(key: string, value: any) { setS({ ...s, [key]: value }); }
  function setNested(group: string, key: string, value: any) {
    setS({ ...s, [group]: { ...(s[group] ?? {}), [key]: value } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Site Settings</h2>
          <p className="text-xs text-muted-foreground">Edit any aspect of the site. Changes apply immediately to all users.</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-xs text-green-600">Saved at {savedAt}</span>}
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Admin emails */}
      <Card title="Administrator emails" icon={ShieldCheck}>
        <p className="text-xs text-muted-foreground -mt-1 mb-2">
          Anyone signing in with one of these emails is automatically an admin. Removing an email here demotes that account back to a regular user.
        </p>
        <AdminEmailsEditor
          value={Array.isArray(s.adminEmails) ? s.adminEmails : []}
          onChange={(list) => set("adminEmails", list)}
        />
      </Card>

      {/* Branding */}
      <Card title="Branding" icon={Globe}>
        <Field label="Site name"><input className="input" value={s.siteName ?? ""} onChange={(e) => set("siteName", e.target.value)} /></Field>
        <Field label="Tagline"><input className="input" value={s.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} /></Field>
        <Field label="Primary color">
          <div className="flex gap-2 items-center">
            <input type="color" className="w-10 h-9 rounded border border-border bg-background" value={s.primaryColor ?? "#7c3aed"} onChange={(e) => set("primaryColor", e.target.value)} />
            <input className="input flex-1" value={s.primaryColor ?? ""} onChange={(e) => set("primaryColor", e.target.value)} />
          </div>
        </Field>
        <Field label="Default language">
          <select className="input" value={s.defaultLanguage ?? "ar"} onChange={(e) => set("defaultLanguage", e.target.value)}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </Field>
      </Card>

      {/* Features */}
      <Card title="Feature toggles" icon={Wrench}>
        {Object.entries(s.features ?? {}).map(([k, v]) => (
          <label key={k} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <span className="text-sm capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
            <input type="checkbox" checked={Boolean(v)} onChange={(e) => setNested("features", k, e.target.checked)} className="w-4 h-4" />
          </label>
        ))}
      </Card>

      {/* AI */}
      <Card title="AI configuration" icon={Brain}>
        <Field label="Text model">
          <input className="input" value={s.ai?.textModel ?? ""} onChange={(e) => setNested("ai", "textModel", e.target.value)} />
        </Field>
        <Field label="Image model">
          <input className="input" value={s.ai?.imageModel ?? ""} onChange={(e) => setNested("ai", "imageModel", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Max tokens">
            <input type="number" className="input" value={s.ai?.maxTokens ?? 0} onChange={(e) => setNested("ai", "maxTokens", Number(e.target.value))} />
          </Field>
          <Field label="Temperature">
            <input type="number" step="0.1" min="0" max="2" className="input" value={s.ai?.temperature ?? 0} onChange={(e) => setNested("ai", "temperature", Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      {/* Limits */}
      <Card title="Usage limits" icon={Database}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Brands / user">
            <input type="number" className="input" value={s.limits?.brandsPerUser ?? 0} onChange={(e) => setNested("limits", "brandsPerUser", Number(e.target.value))} />
          </Field>
          <Field label="Campaigns / brand">
            <input type="number" className="input" value={s.limits?.campaignsPerBrand ?? 0} onChange={(e) => setNested("limits", "campaignsPerBrand", Number(e.target.value))} />
          </Field>
          <Field label="Posts / campaign">
            <input type="number" className="input" value={s.limits?.postsPerCampaign ?? 0} onChange={(e) => setNested("limits", "postsPerCampaign", Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      {/* Credits & costs */}
      <Card title="Credits & generation costs · النقاط وتكاليف التوليد" icon={Activity}>
        <p className="text-xs text-muted-foreground mb-3">
          كل مستخدم جديد يبدأ بعدد النقاط الافتراضية، وكل أداة AI تخصم نقاط بحسب قوتها واستهلاكها. الأدمن معفى من الخصم.
        </p>
        <Field label="Default credits for new users · النقاط الافتراضية للمستخدم الجديد">
          <input type="number" min={0} className="input" value={s.defaultUserCredits ?? 100}
            onChange={(e) => set("defaultUserCredits", Number(e.target.value))} />
        </Field>
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 mt-4">Cost per AI action</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {[
            ["brand.generate-kit", "Brand kit · توليد الهوية", 50],
            ["brand.generate-logo-variants", "Logo variants · بدائل الشعار", 40],
            ["brand.generate-story", "Brand story · قصة العلامة", 10],
            ["brand.generate-content", "Long-form content · محتوى طويل", 5],
            ["brand.generate-campaign", "Campaign (per 7 posts) · حملة", 60],
            ["post.generate-image", "Post image · صورة منشور", 10],
            ["post.regenerate", "Regenerate post · إعادة توليد منشور", 8],
            ["post.generate-variant", "Post A/B variant · نسخة بديلة", 5],
            ["post.generate-content", "Post long content · محتوى منشور طويل", 5],
            ["design.generate-image", "Design image · صورة تصميم", 10],
            ["design.generate-layout", "Design layout · تخطيط تصميم", 6],
            ["campaign.generate-all-images", "Bulk image (per image) · صور بالجملة", 10],
          ].map(([k, lbl, dflt]) => (
            <Field key={k as string} label={lbl as string}>
              <input type="number" min={0} className="input"
                value={s.creditCosts?.[k as string] ?? (dflt as number)}
                onChange={(e) => setNested("creditCosts", k as string, Number(e.target.value))} />
            </Field>
          ))}
        </div>
      </Card>

      {/* Landing page */}
      <LandingEditor s={s} setS={setS} />

      {/* Maintenance */}
      <Card title="Maintenance mode" icon={AlertCircle}>
        <label className="flex items-center justify-between py-2">
          <span className="text-sm">Enable maintenance mode</span>
          <input type="checkbox" checked={Boolean(s.maintenance?.enabled)} onChange={(e) => setNested("maintenance", "enabled", e.target.checked)} className="w-4 h-4" />
        </label>
        <Field label="Message shown to users">
          <textarea rows={3} className="input" value={s.maintenance?.message ?? ""} onChange={(e) => setNested("maintenance", "message", e.target.value)} />
        </Field>
      </Card>

      <style>{`
        .input { width: 100%; background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: hsl(var(--primary)); }
      `}</style>
    </div>
  );
}

/* ============================ Landing page editor ============================ */

const ICON_OPTIONS = ["Sparkles", "Zap", "LayoutTemplate", "Image", "BarChart3", "CalendarDays"];

function LandingEditor({ s, setS }: { s: any; setS: (next: any) => void }) {
  const landing = s.landing ?? {};

  function setL(key: string, value: any) {
    setS({ ...s, landing: { ...landing, [key]: value } });
  }
  function setStat(i: number, key: "value" | "label", v: string) {
    const arr = [...(landing.stats ?? [])];
    arr[i] = { ...arr[i], [key]: v };
    setL("stats", arr);
  }
  function addStat() {
    setL("stats", [...(landing.stats ?? []), { value: "", label: "" }]);
  }
  function removeStat(i: number) {
    setL("stats", (landing.stats ?? []).filter((_: any, idx: number) => idx !== i));
  }
  function setHighlight(i: number, v: string) {
    const arr = [...(landing.highlights ?? [])];
    arr[i] = v;
    setL("highlights", arr);
  }
  function addHighlight() {
    setL("highlights", [...(landing.highlights ?? []), ""]);
  }
  function removeHighlight(i: number) {
    setL("highlights", (landing.highlights ?? []).filter((_: any, idx: number) => idx !== i));
  }
  function setFeature(i: number, key: "icon" | "title" | "description", v: string) {
    const arr = [...(landing.features ?? [])];
    arr[i] = { ...arr[i], [key]: v };
    setL("features", arr);
  }
  function addFeature() {
    setL("features", [
      ...(landing.features ?? []),
      { icon: "Sparkles", title: "", description: "" },
    ]);
  }
  function removeFeature(i: number) {
    setL("features", (landing.features ?? []).filter((_: any, idx: number) => idx !== i));
  }
  function setProject(i: number, key: "name" | "logoUrl" | "link", v: string) {
    const arr = [...(landing.projects ?? [])];
    arr[i] = { ...arr[i], [key]: v };
    setL("projects", arr);
  }
  function addProject() {
    setL("projects", [...(landing.projects ?? []), { name: "" }]);
  }
  function removeProject(i: number) {
    setL("projects", (landing.projects ?? []).filter((_: any, idx: number) => idx !== i));
  }
  function setPlan(i: number, patch: any) {
    const arr = [...(landing.pricingPlans ?? [])];
    arr[i] = { ...arr[i], ...patch };
    setL("pricingPlans", arr);
  }
  function setPlanFeature(i: number, fi: number, v: string) {
    const arr = [...(landing.pricingPlans ?? [])];
    const feats = [...(arr[i]?.features ?? [])];
    feats[fi] = v;
    arr[i] = { ...arr[i], features: feats };
    setL("pricingPlans", arr);
  }
  function addPlanFeature(i: number) {
    const arr = [...(landing.pricingPlans ?? [])];
    arr[i] = { ...arr[i], features: [...(arr[i]?.features ?? []), ""] };
    setL("pricingPlans", arr);
  }
  function removePlanFeature(i: number, fi: number) {
    const arr = [...(landing.pricingPlans ?? [])];
    arr[i] = { ...arr[i], features: (arr[i]?.features ?? []).filter((_: any, idx: number) => idx !== fi) };
    setL("pricingPlans", arr);
  }
  function addPlan() {
    setL("pricingPlans", [
      ...(landing.pricingPlans ?? []),
      { name: "New plan", price: "$0", period: "/month", description: "", features: [], ctaLabel: "Get started", highlighted: false },
    ]);
  }
  function removePlan(i: number) {
    setL("pricingPlans", (landing.pricingPlans ?? []).filter((_: any, idx: number) => idx !== i));
  }

  return (
    <Card title="Landing page (homepage)" icon={Globe}>
      <p className="text-xs text-muted-foreground -mt-1 mb-3">
        Every section of the public landing page is editable here. Changes take effect immediately after saving.
      </p>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colors</h4>
        <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
          The primary color (set in Branding above) themes the entire app. The accent color is used for landing page gradients alongside the primary color.
        </p>
        <Field label="Accent color (gradient pair with primary)">
          <div className="flex gap-2 items-center">
            <input
              type="color"
              className="w-10 h-9 rounded border border-border bg-background"
              value={landing.accentColor ?? "#ec4899"}
              onChange={(e) => setL("accentColor", e.target.value)}
            />
            <input className="input flex-1" value={landing.accentColor ?? ""} onChange={(e) => setL("accentColor", e.target.value)} />
          </div>
        </Field>
      </div>

      <div className="space-y-2 mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hero</h4>
        <Field label="Top badge"><input className="input" value={landing.badge ?? ""} onChange={(e) => setL("badge", e.target.value)} /></Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Headline (start)"><input className="input" value={landing.heroTitle ?? ""} onChange={(e) => setL("heroTitle", e.target.value)} /></Field>
          <Field label="Headline (highlight)"><input className="input" value={landing.heroTitleAccent ?? ""} onChange={(e) => setL("heroTitleAccent", e.target.value)} /></Field>
          <Field label="Headline (after break)"><input className="input" value={landing.heroTitleSuffix ?? ""} onChange={(e) => setL("heroTitleSuffix", e.target.value)} /></Field>
        </div>
        <Field label="Subtitle"><textarea rows={3} className="input" value={landing.heroSubtitle ?? ""} onChange={(e) => setL("heroSubtitle", e.target.value)} /></Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Primary button label"><input className="input" value={landing.primaryCtaLabel ?? ""} onChange={(e) => setL("primaryCtaLabel", e.target.value)} /></Field>
          <Field label="Secondary button label"><input className="input" value={landing.secondaryCtaLabel ?? ""} onChange={(e) => setL("secondaryCtaLabel", e.target.value)} /></Field>
        </div>
      </div>

      <div className="space-y-2 mt-5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stats row</h4>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={landing.showStats !== false} onChange={(e) => setL("showStats", e.target.checked)} className="w-3.5 h-3.5" />
            Show on page
          </label>
        </div>
        <div className="space-y-2">
          {(landing.stats ?? []).map((st: any, i: number) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
              <input className="input" placeholder="Value (e.g. 10k+)" value={st.value ?? ""} onChange={(e) => setStat(i, "value", e.target.value)} />
              <input className="input" placeholder="Label" value={st.label ?? ""} onChange={(e) => setStat(i, "label", e.target.value)} />
              <button onClick={() => removeStat(i)} className="p-2 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={addStat} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add stat</button>
        </div>
      </div>

      <div className="space-y-2 mt-5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Highlight chips</h4>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={landing.showHighlights !== false} onChange={(e) => setL("showHighlights", e.target.checked)} className="w-3.5 h-3.5" />
            Show on page
          </label>
        </div>
        <div className="space-y-2">
          {(landing.highlights ?? []).map((h: string, i: number) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <input className="input" value={h} onChange={(e) => setHighlight(i, e.target.value)} />
              <button onClick={() => removeHighlight(i)} className="p-2 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={addHighlight} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add highlight</button>
        </div>
      </div>

      <div className="space-y-2 mt-5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects marquee (animated strip)</h4>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={landing.showProjects !== false} onChange={(e) => setL("showProjects", e.target.checked)} className="w-3.5 h-3.5" />
            Show on page
          </label>
        </div>
        <Field label="Heading above the marquee">
          <input className="input" value={landing.projectsHeading ?? ""} onChange={(e) => setL("projectsHeading", e.target.value)} />
        </Field>
        <div className="space-y-2">
          {(landing.projects ?? []).map((p: any, i: number) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input className="input" placeholder="Project name" value={p.name ?? ""} onChange={(e) => setProject(i, "name", e.target.value)} />
              <input className="input" placeholder="Logo URL (optional)" value={p.logoUrl ?? ""} onChange={(e) => setProject(i, "logoUrl", e.target.value)} />
              <input className="input" placeholder="Link (optional)" value={p.link ?? ""} onChange={(e) => setProject(i, "link", e.target.value)} />
              <button onClick={() => removeProject(i)} className="p-2 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={addProject} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add project</button>
        </div>
      </div>

      <div className="space-y-2 mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Features section</h4>
        <Field label="Section heading"><input className="input" value={landing.featuresHeading ?? ""} onChange={(e) => setL("featuresHeading", e.target.value)} /></Field>
        <Field label="Section subheading"><textarea rows={2} className="input" value={landing.featuresSubheading ?? ""} onChange={(e) => setL("featuresSubheading", e.target.value)} /></Field>
        <div className="space-y-3 mt-2">
          {(landing.features ?? []).map((f: any, i: number) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
              <div className="grid grid-cols-[160px_1fr_auto] gap-2 items-center">
                <select className="input" value={f.icon ?? "Sparkles"} onChange={(e) => setFeature(i, "icon", e.target.value)}>
                  {ICON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <input className="input" placeholder="Feature title" value={f.title ?? ""} onChange={(e) => setFeature(i, "title", e.target.value)} />
                <button onClick={() => removeFeature(i)} className="p-2 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
              </div>
              <textarea rows={2} className="input" placeholder="Description" value={f.description ?? ""} onChange={(e) => setFeature(i, "description", e.target.value)} />
            </div>
          ))}
          <button onClick={addFeature} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add feature</button>
        </div>
      </div>

      <div className="space-y-2 mt-5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing section</h4>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={landing.showPricing !== false} onChange={(e) => setL("showPricing", e.target.checked)} className="w-3.5 h-3.5" />
            Show on page
          </label>
        </div>
        <Field label="Section heading"><input className="input" value={landing.pricingHeading ?? ""} onChange={(e) => setL("pricingHeading", e.target.value)} /></Field>
        <Field label="Section subheading"><textarea rows={2} className="input" value={landing.pricingSubheading ?? ""} onChange={(e) => setL("pricingSubheading", e.target.value)} /></Field>
        <div className="space-y-3 mt-2">
          {(landing.pricingPlans ?? []).map((plan: any, i: number) => (
            <div key={i} className="border border-border rounded-lg p-3 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input className="input flex-1 font-semibold" placeholder="Plan name" value={plan.name ?? ""} onChange={(e) => setPlan(i, { name: e.target.value })} />
                <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={Boolean(plan.highlighted)} onChange={(e) => setPlan(i, { highlighted: e.target.checked })} className="w-3.5 h-3.5" />
                  Highlight
                </label>
                <button onClick={() => removePlan(i)} className="p-2 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input className="input" placeholder="Price (e.g. $29)" value={plan.price ?? ""} onChange={(e) => setPlan(i, { price: e.target.value })} />
                <input className="input" placeholder="Period (e.g. /month)" value={plan.period ?? ""} onChange={(e) => setPlan(i, { period: e.target.value })} />
                <input className="input" placeholder="Button label" value={plan.ctaLabel ?? ""} onChange={(e) => setPlan(i, { ctaLabel: e.target.value })} />
              </div>
              <textarea rows={2} className="input" placeholder="Short description" value={plan.description ?? ""} onChange={(e) => setPlan(i, { description: e.target.value })} />
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Features</div>
                {(plan.features ?? []).map((feat: string, fi: number) => (
                  <div key={fi} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <input className="input" value={feat} onChange={(e) => setPlanFeature(i, fi, e.target.value)} placeholder="Feature line" />
                    <button onClick={() => removePlanFeature(i, fi)} className="p-2 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => addPlanFeature(i)} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add feature</button>
              </div>
            </div>
          ))}
          <button onClick={addPlan} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add pricing plan</button>
        </div>
      </div>

      <div className="space-y-2 mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Call-to-action band</h4>
        <Field label="Heading"><input className="input" value={landing.ctaHeading ?? ""} onChange={(e) => setL("ctaHeading", e.target.value)} /></Field>
        <Field label="Subheading"><textarea rows={2} className="input" value={landing.ctaSubheading ?? ""} onChange={(e) => setL("ctaSubheading", e.target.value)} /></Field>
        <Field label="Button label"><input className="input" value={landing.ctaButtonLabel ?? ""} onChange={(e) => setL("ctaButtonLabel", e.target.value)} /></Field>
      </div>

      <div className="space-y-2 mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Footer</h4>
        <Field label="Footer note"><input className="input" value={landing.footerText ?? ""} onChange={(e) => setL("footerText", e.target.value)} /></Field>
      </div>
    </Card>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreate }: { onClose: () => void; onCreate: (p: { email: string; password: string; name?: string; role: string }) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setErr(null);
    try { await onCreate({ email: email.trim(), password, name: name.trim() || undefined, role }); onClose(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Create new user" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="text-xs text-muted-foreground">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
        <div><label className="text-xs text-muted-foreground">Name (optional)</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Password</label><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="At least 8 characters" /></div>
        <div><label className="text-xs text-muted-foreground">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">user</option><option value="admin">admin</option>
          </select>
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
        </div>
        <style>{`.input { width: 100%; background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; margin-top: 0.25rem; }`}</style>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ email, onClose, onReset }: { email: string; onClose: () => void; onReset: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setErr(null);
    try { await onReset(pw); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Reset password" onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">For <span className="font-medium text-foreground">{email}</span></p>
      <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (min 8 chars)" />
      {err && <p className="text-xs text-red-500 mt-2">{err}</p>}
      <div className="flex justify-end gap-2 pt-3">
        <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">Cancel</button>
        <button onClick={submit} disabled={busy} className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Set new password"}</button>
      </div>
      <style>{`.input { width: 100%; background: hsl(var(--background)); border: 1px solid hsl(var(--border)); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }`}</style>
    </Modal>
  );
}

function AdminEmailsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function add() {
    const e = draft.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { alert("Please enter a valid email address."); return; }
    if (value.map((x) => x.toLowerCase()).includes(e)) { setDraft(""); return; }
    onChange([...value, e]);
    setDraft("");
  }
  function remove(email: string) {
    onChange(value.filter((e) => e.toLowerCase() !== email.toLowerCase()));
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            placeholder="name@example.com"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none"
          />
        </div>
        <button onClick={add} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No admin emails configured.</span>
        )}
        {value.map((email) => (
          <span key={email} className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            {email}
            <button onClick={() => remove(email)} className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-red-500/20 hover:text-red-500" title="Remove">
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tip: don't forget to click <span className="font-semibold">Save changes</span> at the top to apply.
      </p>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><Icon className="w-4 h-4 text-primary" />{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

/* ============================ Audit Log ============================ */

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { const d = await adminFetch("/api/admin/audit-logs"); setLogs(d.logs); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <Toolbar search="" setSearch={() => {}} placeholder="" onRefresh={load} count={logs.length} hideSearch />
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">When</th>
              <th className="text-left px-4">Action</th>
              <th className="text-left px-4">Actor</th>
              <th className="text-left px-4">Target</th>
              <th className="text-left px-4">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit entries yet.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                <td className="px-4 font-medium">{l.action}</td>
                <td className="px-4 text-xs">{l.actorEmail ?? <span className="font-mono text-muted-foreground">{(l.actorId ?? "—").slice(0, 12)}</span>}</td>
                <td className="px-4 text-xs">{l.targetType ? `${l.targetType}#${l.targetId ?? "?"}` : "—"}</td>
                <td className="px-4 text-xs text-muted-foreground font-mono max-w-xs truncate">{l.metadata ? JSON.stringify(l.metadata) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ Helpers ============================ */

/* Toolbar, Loading, ErrorBox imported from ./admin/shared */

function SimpleListTab({ endpoint, pluralKey, columns, deletePath, placeholder }: {
  endpoint: string;
  pluralKey: string;
  columns: { key: string; label: string; render?: (v: any, row: any) => any }[];
  deletePath: (id: any) => string;
  placeholder: string;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true); setError(null);
    try { const d = await adminFetch(endpoint); setItems(d[pluralKey] ?? []); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => columns.some((c) => String(it[c.key] ?? "").toLowerCase().includes(q)));
  }, [items, search]);

  async function remove(id: any) {
    if (!confirm("Delete this item?")) return;
    try { await adminFetch(deletePath(id), { method: "DELETE" });
      setItems((p) => p.filter((it) => it.id !== id));
    } catch (e: any) { alert(e.message); }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <Toolbar search={search} setSearch={setSearch} placeholder={placeholder} onRefresh={load} count={filtered.length} />
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              {columns.map((c) => <th key={c.key} className="text-left px-4 py-2.5">{c.label}</th>)}
              <th className="text-right px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted-foreground">No items.</td></tr>}
            {filtered.map((it) => (
              <tr key={it.id} className="border-t border-border hover:bg-muted/20">
                {columns.map((c) => <td key={c.key} className="px-4 py-2 align-top">{c.render ? c.render(it[c.key], it) : (it[c.key] ?? "—")}</td>)}
                <td className="px-4 text-right">
                  <button onClick={() => remove(it.id)} className="text-red-500 hover:text-red-600 p-1.5 rounded hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
