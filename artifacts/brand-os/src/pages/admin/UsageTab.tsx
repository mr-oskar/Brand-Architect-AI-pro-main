import { useEffect, useState } from "react";
import { adminFetch, Loading, ErrorBox } from "./shared";

export default function UsageTab() {
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setData(await adminFetch(`/api/admin/usage?days=${days}`)); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return null;

  const max = Math.max(1, ...data.byDay.map((d: any) => d.requests));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">Usage analytics</p>
        <div className="flex-1" />
        <div className="flex gap-1">
          {[7, 14, 30, 60].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-md ${days === d ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Daily requests chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-3">Requests per day</p>
        <div className="flex items-end gap-1 h-40">
          {data.byDay.map((d: any) => {
            const h = (d.requests / max) * 100;
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100">{d.requests}</div>
                <div className="w-full bg-primary/70 hover:bg-primary rounded-t transition-all" style={{ height: `${Math.max(2, h)}%` }} title={`${d.day}: ${d.requests} requests, ${d.errors} errors, ${d.avg_latency}ms avg`} />
                <div className="text-[9px] text-muted-foreground">{new Date(d.day).getDate()}</div>
              </div>
            );
          })}
          {!data.byDay.length && <div className="flex-1 text-center text-sm text-muted-foreground self-center">No data yet</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By kind */}
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs uppercase text-muted-foreground font-semibold mb-3">By event type</p>
          <div className="space-y-2">
            {data.byKind.map((k: any) => (
              <div key={k.kind} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${k.kind === "ai_image" || k.kind === "ai_text" ? "bg-violet-500" : k.kind === "publish" ? "bg-emerald-500" : "bg-blue-500"}`} />
                  <span className="font-medium">{k.kind}</span>
                </div>
                <div className="font-mono text-xs">{k.count}{k.tokens ? ` · ${k.tokens.toLocaleString()} tokens` : ""}</div>
              </div>
            ))}
            {!data.byKind.length && <p className="text-sm text-muted-foreground">No events</p>}
          </div>
        </div>

        {/* Top users */}
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs uppercase text-muted-foreground font-semibold mb-3">Top users</p>
          <div className="space-y-2">
            {data.topUsers.slice(0, 8).map((u: any) => (
              <div key={u.user_id} className="flex items-center justify-between text-sm">
                <span className="truncate max-w-[200px]">{u.email ?? u.user_id}</span>
                <span className="font-mono text-xs">{u.requests}</span>
              </div>
            ))}
            {!data.topUsers.length && <p className="text-sm text-muted-foreground">No tracked users</p>}
          </div>
        </div>
      </div>

      {/* Top routes */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-3">Top API routes</p>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="text-left pb-2">Route</th><th className="text-right pb-2">Requests</th><th className="text-right pb-2">Avg latency</th></tr>
          </thead>
          <tbody>
            {data.topRoutes.map((r: any) => (
              <tr key={r.route} className="border-t border-border/50">
                <td className="py-1.5 font-mono text-xs">{r.route}</td>
                <td className="py-1.5 text-right font-mono">{r.count}</td>
                <td className="py-1.5 text-right font-mono text-muted-foreground">{r.avg_latency}ms</td>
              </tr>
            ))}
            {!data.topRoutes.length && <tr><td colSpan={3} className="py-4 text-center text-muted-foreground text-sm">No routes tracked</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
