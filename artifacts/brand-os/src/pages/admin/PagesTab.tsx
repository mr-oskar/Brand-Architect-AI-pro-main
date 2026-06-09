import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { adminFetch, Loading, ErrorBox, Toolbar, Modal, Field, inputCls, fmtDate } from "./shared";

export default function PagesTab() {
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { const d = await adminFetch("/api/admin/pages"); setPages(d.pages); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggle(slug: string, key: "enabled" | "requireAuth", value: boolean) {
    const { page } = await adminFetch(`/api/admin/pages/${slug}`, { method: "PATCH", body: JSON.stringify({ [key]: value }) });
    setPages((p) => p.map((x) => (x.slug === slug ? page : x)));
  }
  async function save(slug: string, patch: any) {
    const { page } = await adminFetch(`/api/admin/pages/${slug}`, { method: "PATCH", body: JSON.stringify(patch) });
    setPages((p) => p.map((x) => (x.slug === slug ? page : x)));
    setEditing(null);
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center"><Toolbar hideSearch onRefresh={load} count={pages.length} /></div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Page</th>
              <th className="px-4">Slug</th>
              <th className="px-4">Status</th>
              <th className="px-4">Auth</th>
              <th className="px-4">Plan</th>
              <th className="px-4">Updated</th>
              <th className="px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pages.map((p) => (
              <tr key={p.slug} className="h-12 hover:bg-muted/20">
                <td className="px-4 font-medium">{p.title}</td>
                <td className="px-4 text-xs font-mono text-muted-foreground">/{p.slug}</td>
                <td className="px-4">
                  <button onClick={() => toggle(p.slug, "enabled", !p.enabled)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${p.enabled ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                    {p.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {p.enabled ? "Live" : "Hidden"}
                  </button>
                </td>
                <td className="px-4">
                  <button onClick={() => toggle(p.slug, "requireAuth", !p.requireAuth)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${p.requireAuth ? "bg-blue-500/15 text-blue-500" : "bg-muted text-muted-foreground"}`}>
                    {p.requireAuth && <Lock className="w-3 h-3" />}
                    {p.requireAuth ? "Required" : "Public"}
                  </button>
                </td>
                <td className="px-4 text-xs">{p.requiredPlan ?? <span className="text-muted-foreground">any</span>}</td>
                <td className="px-4 text-xs text-muted-foreground">{fmtDate(p.updatedAt)}</td>
                <td className="px-4 text-right">
                  <button onClick={() => setEditing(p)} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PageEditModal page={editing} onClose={() => setEditing(null)} onSave={(patch) => save(editing.slug, patch)} />}
    </div>
  );
}

function PageEditModal({ page, onClose, onSave }: { page: any; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const [title, setTitle] = useState(page.title ?? "");
  const [seoTitle, setSeoTitle] = useState(page.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(page.seoDescription ?? "");
  const [ogImage, setOgImage] = useState(page.ogImage ?? "");
  const [noticeHtml, setNoticeHtml] = useState(page.noticeHtml ?? "");
  const [requiredPlan, setRequiredPlan] = useState(page.requiredPlan ?? "");
  const [sortOrder, setSortOrder] = useState<number>(page.sortOrder ?? 0);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Edit page · /${page.slug}`} onClose={onClose} wide>
      <div className="space-y-3">
        <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="SEO title (browser tab)"><input className={inputCls} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} /></Field>
        <Field label="SEO description (meta)"><textarea className={inputCls} rows={2} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} /></Field>
        <Field label="Open Graph image URL"><input className={inputCls} value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="https://…" /></Field>
        <Field label="Page notice / banner (HTML)"><textarea className={inputCls} rows={3} value={noticeHtml} onChange={(e) => setNoticeHtml(e.target.value)} placeholder="Optional banner shown at top of the page" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Required plan (id)"><input className={inputCls} value={requiredPlan} onChange={(e) => setRequiredPlan(e.target.value)} placeholder="empty = any" /></Field>
          <Field label="Sort order"><input type="number" className={inputCls} value={sortOrder} onChange={(e) => setSortOrder(+e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">Cancel</button>
          <button disabled={busy} onClick={async () => { setBusy(true); try { await onSave({ title, seoTitle, seoDescription, ogImage, noticeHtml, requiredPlan: requiredPlan || null, sortOrder }); } finally { setBusy(false); } }}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
