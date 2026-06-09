import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { adminFetch, Loading, ErrorBox, Toolbar, Modal, Field, inputCls, fmtDate } from "./shared";

const EVENT_TYPES = ["user.created", "user.deleted", "subscription.created", "subscription.canceled", "post.published", "campaign.created", "brand.created"];

export default function WebhooksTab() {
  const [hooks, setHooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try { const d = await adminFetch("/api/admin/webhooks"); setHooks(d.webhooks); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create(p: any) {
    const { webhook } = await adminFetch("/api/admin/webhooks", { method: "POST", body: JSON.stringify(p) });
    setHooks((h) => [webhook, ...h]); setCreateOpen(false);
  }
  async function toggle(id: string, isActive: boolean) {
    const { webhook } = await adminFetch(`/api/admin/webhooks/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
    setHooks((h) => h.map((w) => (w.id === id ? webhook : w)));
  }
  async function del(id: string) {
    if (!confirm("Delete webhook?")) return;
    await adminFetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
    setHooks((h) => h.filter((w) => w.id !== id));
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Toolbar hideSearch onRefresh={load} count={hooks.length}
          right={<button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"><Plus className="w-4 h-4" />New webhook</button>} />
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">URL</th>
              <th className="text-left px-4">Events</th>
              <th className="px-4">Status</th>
              <th className="px-4">Created</th>
              <th className="px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hooks.map((w) => (
              <tr key={w.id} className="h-12 hover:bg-muted/20">
                <td className="px-4 font-mono text-xs truncate max-w-[320px]">{w.url}</td>
                <td className="px-4 text-xs">{(w.events ?? []).join(", ") || <span className="text-muted-foreground">all</span>}</td>
                <td className="px-4">
                  <button onClick={() => toggle(w.id, !w.isActive)}
                    className={`text-[10px] px-2 py-0.5 rounded ${w.isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                    {w.isActive ? "active" : "paused"}
                  </button>
                </td>
                <td className="px-4 text-xs text-muted-foreground">{fmtDate(w.createdAt)}</td>
                <td className="px-4 text-right">
                  <button onClick={() => del(w.id)} className="text-red-500 hover:text-red-600 p-1.5 rounded hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {!hooks.length && <tr><td colSpan={5} className="text-center py-12 text-sm text-muted-foreground">No webhooks configured</td></tr>}
          </tbody>
        </table>
      </div>
      {createOpen && <CreateHookModal onClose={() => setCreateOpen(false)} onCreate={create} />}
    </div>
  );
}

function CreateHookModal({ onClose, onCreate }: { onClose: () => void; onCreate: (p: any) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Create webhook" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Endpoint URL"><input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" /></Field>
        <Field label="Signing secret (optional)"><input className={inputCls} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="HMAC secret" /></Field>
        <Field label="Events">
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((ev) => (
              <label key={ev} className={`text-[11px] px-2 py-1 rounded border cursor-pointer ${events.includes(ev) ? "bg-primary/15 text-primary border-primary/40" : "border-border"}`}>
                <input type="checkbox" className="hidden" checked={events.includes(ev)}
                  onChange={(e) => setEvents((p) => e.target.checked ? [...p, ev] : p.filter((x) => x !== ev))} />
                {ev}
              </label>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Leave empty to receive all events.</p>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">Cancel</button>
          <button disabled={busy || !url} onClick={async () => { setBusy(true); try { await onCreate({ url, secret: secret || null, events }); } finally { setBusy(false); } }}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Create"}</button>
        </div>
      </div>
    </Modal>
  );
}
