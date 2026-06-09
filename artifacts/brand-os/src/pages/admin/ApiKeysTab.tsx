import { useEffect, useState } from "react";
import { Plus, Trash2, Ban, Copy, CheckCheck } from "lucide-react";
import { adminFetch, Loading, ErrorBox, Toolbar, Modal, Field, inputCls, fmtDate, fmtRelative } from "./shared";

export default function ApiKeysTab() {
  const [keys, setKeys] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [k, u] = await Promise.all([adminFetch("/api/admin/api-keys"), adminFetch("/api/admin/users")]);
      setKeys(k.apiKeys); setUsers(u.users);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create(payload: any) {
    const d = await adminFetch("/api/admin/api-keys", { method: "POST", body: JSON.stringify(payload) });
    setNewSecret(d.secret);
    setCreateOpen(false);
    await load();
  }
  async function revoke(id: string) {
    await adminFetch(`/api/admin/api-keys/${id}/revoke`, { method: "POST" });
    await load();
  }
  async function del(id: string) {
    if (!confirm("Permanently delete this API key?")) return;
    await adminFetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
    setKeys((p) => p.filter((k) => k.id !== id));
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Toolbar hideSearch onRefresh={load} count={keys.length}
          right={<button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"><Plus className="w-4 h-4" />Generate API key</button>} />
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-left px-4">Owner</th>
              <th className="text-left px-4">Key</th>
              <th className="px-4">Scopes</th>
              <th className="px-4">Last used</th>
              <th className="px-4">Created</th>
              <th className="px-4">Status</th>
              <th className="px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {keys.map((k) => (
              <tr key={k.id} className="h-12 hover:bg-muted/20">
                <td className="px-4 font-medium">{k.name}</td>
                <td className="px-4 text-xs text-muted-foreground">{k.userEmail ?? k.userId}</td>
                <td className="px-4 font-mono text-xs">{k.prefix}…</td>
                <td className="px-4 text-xs">{(k.scopes ?? []).join(", ") || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 text-xs text-muted-foreground">{fmtRelative(k.lastUsedAt)}</td>
                <td className="px-4 text-xs text-muted-foreground">{fmtDate(k.createdAt)}</td>
                <td className="px-4">
                  {k.revokedAt
                    ? <span className="text-[10px] bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded">revoked</span>
                    : <span className="text-[10px] bg-emerald-500/15 text-emerald-500 px-1.5 py-0.5 rounded">active</span>}
                </td>
                <td className="px-4 text-right whitespace-nowrap">
                  {!k.revokedAt && <button onClick={() => revoke(k.id)} className="text-amber-500 hover:text-amber-600 p-1.5 rounded hover:bg-amber-500/10 mr-1" title="Revoke"><Ban className="w-4 h-4" /></button>}
                  <button onClick={() => del(k.id)} className="text-red-500 hover:text-red-600 p-1.5 rounded hover:bg-red-500/10" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {!keys.length && <tr><td colSpan={8} className="text-center py-12 text-sm text-muted-foreground">No API keys yet</td></tr>}
          </tbody>
        </table>
      </div>
      {createOpen && <CreateKeyModal users={users} onClose={() => setCreateOpen(false)} onCreate={create} />}
      {newSecret && <SecretModal secret={newSecret} onClose={() => setNewSecret(null)} />}
    </div>
  );
}

function CreateKeyModal({ users, onClose, onCreate }: { users: any[]; onClose: () => void; onCreate: (p: any) => Promise<void> }) {
  const [name, setName] = useState("");
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [busy, setBusy] = useState(false);
  const SCOPES = ["read", "write", "publish", "admin"];
  return (
    <Modal title="Generate API key" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name / label"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CI bot, Mobile app" /></Field>
        <Field label="Owner">
          <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        </Field>
        <Field label="Scopes">
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <label key={s} className={`text-xs px-2.5 py-1 rounded border cursor-pointer ${scopes.includes(s) ? "bg-primary/15 text-primary border-primary/40" : "border-border"}`}>
                <input type="checkbox" className="hidden" checked={scopes.includes(s)}
                  onChange={(e) => setScopes((p) => e.target.checked ? [...p, s] : p.filter((x) => x !== s))} />
                {s}
              </label>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">Cancel</button>
          <button disabled={busy || !name || !userId} onClick={async () => { setBusy(true); try { await onCreate({ name, userId, scopes }); } finally { setBusy(false); } }}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">{busy ? "Generating…" : "Generate"}</button>
        </div>
      </div>
    </Modal>
  );
}

function SecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Save your API key" onClose={onClose}>
      <p className="text-sm text-amber-500 mb-3">⚠ This is the only time you'll see this key. Store it securely.</p>
      <div className="bg-background border border-border rounded-lg p-3 font-mono text-xs break-all mb-3">{secret}</div>
      <button onClick={() => { navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
        {copied ? <><CheckCheck className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy to clipboard</>}
      </button>
    </Modal>
  );
}
