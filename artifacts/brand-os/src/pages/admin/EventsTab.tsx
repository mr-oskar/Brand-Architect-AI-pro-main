import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { adminFetch, Loading, ErrorBox, fmtRelative } from "./shared";

const KINDS = ["all", "api", "ai_text", "ai_image", "publish", "login", "signup"];

export default function EventsTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  async function load() {
    if (pausedRef.current) return;
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (kind !== "all") params.set("kind", kind);
      if (errorsOnly) params.set("errorsOnly", "1");
      const d = await adminFetch(`/api/admin/events?${params}`);
      setEvents(d.events);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); const id = setInterval(load, 3000); return () => clearInterval(id); /* eslint-disable-next-line */ }, [kind, errorsOnly]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${paused ? "bg-muted-foreground" : "bg-emerald-500 animate-pulse"}`} />
          Live events
        </p>
        <div className="flex gap-1 flex-wrap">
          {KINDS.map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`text-xs px-2.5 py-1 rounded-md ${kind === k ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"}`}>
              {k}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs ml-2">
          <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
          Errors only
        </label>
        <div className="flex-1" />
        <button onClick={() => setPaused((p) => !p)}
          className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border hover:bg-muted">
          {paused ? <><Play className="w-3 h-3" />Resume</> : <><Pause className="w-3 h-3" />Pause</>}
        </button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Time</th>
              <th className="px-4">Kind</th>
              <th className="px-4">Method</th>
              <th className="text-left px-4">Route</th>
              <th className="px-4">Status</th>
              <th className="px-4">Latency</th>
              <th className="text-left px-4">User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-muted/20">
                <td className="px-4 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{fmtRelative(e.createdAt)}</td>
                <td className="px-4">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${e.kind?.startsWith("ai") ? "bg-violet-500/15 text-violet-500" : e.kind === "publish" ? "bg-emerald-500/15 text-emerald-500" : e.kind === "signup" || e.kind === "login" ? "bg-blue-500/15 text-blue-500" : "bg-muted text-muted-foreground"}`}>
                    {e.kind}
                  </span>
                </td>
                <td className="px-4 text-[10px] font-mono text-muted-foreground">{e.method}</td>
                <td className="px-4 font-mono text-xs truncate max-w-[280px]">{e.route}</td>
                <td className="px-4">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${e.statusCode >= 500 ? "bg-red-500/15 text-red-500" : e.statusCode >= 400 ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>{e.statusCode}</span>
                </td>
                <td className="px-4 text-xs font-mono text-muted-foreground">{e.durationMs}ms</td>
                <td className="px-4 text-xs text-muted-foreground truncate max-w-[180px]">{e.userEmail ?? e.userId ?? "—"}</td>
              </tr>
            ))}
            {!events.length && <tr><td colSpan={7} className="text-center py-12 text-sm text-muted-foreground">No events match the filter</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
