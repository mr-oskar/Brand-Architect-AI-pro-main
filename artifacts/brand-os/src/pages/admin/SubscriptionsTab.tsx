import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { adminFetch, Loading, ErrorBox, Toolbar, Modal, Field, inputCls, fmtDate } from "./shared";

export default function SubscriptionsTab() {
  const [subs, setSubs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [s, p, u] = await Promise.all([
        adminFetch("/api/admin/subscriptions"), adminFetch("/api/admin/plans"), adminFetch("/api/admin/users"),
      ]);
      setSubs(s.subscriptions); setPlans(p.plans); setUsers(u.users);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function update(id: string, patch: any) {
    const { subscription } = await adminFetch(`/api/admin/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    setSubs((p) => p.map((s) => (s.id === id ? { ...s, ...subscription } : s)));
  }
  async function del(id: string) {
    if (!confirm("Delete subscription?")) return;
    await adminFetch(`/api/admin/subscriptions/${id}`, { method: "DELETE" });
    setSubs((p) => p.filter((s) => s.id !== id));
  }
  async function create(payload: any) {
    const { subscription } = await adminFetch("/api/admin/subscriptions", { method: "POST", body: JSON.stringify(payload) });
    const u = users.find((u) => u.id === payload.userId);
    setSubs((p) => [{ ...subscription, userEmail: u?.email, userName: u?.name }, ...p]);
    setCreateOpen(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter((s) => (s.userEmail ?? "").toLowerCase().includes(q) || (s.planId ?? "").toLowerCase().includes(q));
  }, [search, subs]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Toolbar search={search} setSearch={setSearch} placeholder="Filter by email or plan…" onRefresh={load} count={filtered.length}
          right={<button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"><Plus className="w-4 h-4" />New subscription</button>} />
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">User</th>
              <th className="px-4">Plan</th>
              <th className="px-4">Status</th>
              <th className="px-4">Started</th>
              <th className="px-4">Renews</th>
              <th className="px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((s) => (
              <tr key={s.id} className="h-12 hover:bg-muted/20">
                <td className="px-4">
                  <div className="font-medium">{s.userName ?? s.userEmail ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{s.userEmail}</div>
                </td>
                <td className="px-4">
                  <select value={s.planId} onChange={(e) => update(s.id, { planId: e.target.value })}
                    className="bg-background border border-border rounded px-2 py-1 text-xs">
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td className="px-4">
                  <select value={s.status} onChange={(e) => update(s.id, { status: e.target.value })}
                    className={`bg-background border border-border rounded px-2 py-1 text-xs ${s.status === "active" ? "text-emerald-500" : s.status === "canceled" ? "text-muted-foreground" : "text-amber-500"}`}>
                    <option value="active">active</option><option value="trialing">trialing</option>
                    <option value="past_due">past_due</option><option value="canceled">canceled</option>
                  </select>
                </td>
                <td className="px-4 text-xs text-muted-foreground">{fmtDate(s.startedAt)}</td>
                <td className="px-4 text-xs text-muted-foreground">{fmtDate(s.currentPeriodEnd)}</td>
                <td className="px-4 text-right">
                  <button onClick={() => del(s.id)} className="text-red-500 hover:text-red-600 p-1.5 rounded hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">No subscriptions yet. Create one to assign a plan to a user.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {createOpen && <CreateSubModal users={users} plans={plans} onClose={() => setCreateOpen(false)} onCreate={create} />}
    </div>
  );
}

function CreateSubModal({ users, plans, onClose, onCreate }: { users: any[]; plans: any[]; onClose: () => void; onCreate: (p: any) => Promise<void> }) {
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [periodEnd, setPeriodEnd] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Create subscription" onClose={onClose}>
      <div className="space-y-3">
        <Field label="User">
          <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email} {u.name ? `(${u.name})` : ""}</option>)}
          </select>
        </Field>
        <Field label="Plan">
          <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Renews on (optional)"><input type="date" className={inputCls} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">Cancel</button>
          <button disabled={busy || !userId || !planId} onClick={async () => { setBusy(true); try { await onCreate({ userId, planId, currentPeriodEnd: periodEnd || null }); } finally { setBusy(false); } }}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground disabled:opacity-50">{busy ? "Creating…" : "Create"}</button>
        </div>
      </div>
    </Modal>
  );
}
