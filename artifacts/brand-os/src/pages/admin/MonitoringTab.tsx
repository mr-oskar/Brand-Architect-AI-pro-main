import { useEffect, useState } from "react";
import { Activity, Cpu, Database, AlertTriangle, Clock } from "lucide-react";
import { adminFetch, Loading, ErrorBox } from "./shared";

function fmtUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function MonitoringTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try { setData(await adminFetch("/api/admin/monitoring")); setError(null); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); const id = setInterval(load, 2000); return () => clearInterval(id); }, []);

  if (error && !data) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const max = Math.max(1, ...data.series.map((s: any) => s.requests));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Activity className="w-4 h-4" />} label="Requests / sec" value={data.last60s.rps.toFixed(2)} hint="last 60s" color="emerald" />
        <StatCard icon={<Clock className="w-4 h-4" />} label="Avg latency" value={`${data.last60s.avgLatencyMs}ms`} hint="last 60s" color="blue" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Error rate" value={`${data.last60s.errorRate}%`} hint={`${data.last60s.errors} errors`} color={data.last60s.errorRate > 1 ? "red" : "emerald"} />
        <StatCard icon={<Cpu className="w-4 h-4" />} label="Heap used" value={`${data.process.memory.heapUsedMb} MB`} hint={`of ${data.process.memory.heapTotalMb} MB`} color="violet" />
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase text-muted-foreground font-semibold">Live request volume — last 5 minutes</p>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> live
          </span>
        </div>
        <div className="flex items-end gap-px h-32">
          {data.series.length ? data.series.map((s: any) => {
            const h = (s.requests / max) * 100;
            const isErr = s.errors > 0;
            return <div key={s.ts} className={`flex-1 rounded-sm ${isErr ? "bg-red-500/70" : "bg-primary/70"}`} style={{ height: `${Math.max(2, h)}%` }} title={`${s.requests} req · ${s.avgLatencyMs}ms${isErr ? ` · ${s.errors} errors` : ""}`} />;
          }) : <div className="flex-1 text-center text-sm text-muted-foreground self-center">Waiting for traffic…</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs uppercase text-muted-foreground font-semibold mb-3">Process</p>
          <Row label="Uptime" value={fmtUptime(data.process.uptimeMs)} />
          <Row label="Node" value={data.process.nodeVersion} />
          <Row label="PID" value={String(data.process.pid)} />
          <Row label="RSS memory" value={`${data.process.memory.rssMb} MB`} />
          <Row label="DB" value={<span className={data.db.status === "ok" ? "text-emerald-500" : "text-red-500"}><Database className="w-3 h-3 inline mr-1" />{data.db.status}</span>} />
          <Row label="Total requests" value={data.totals.requests.toLocaleString()} />
          <Row label="Total errors" value={data.totals.errors.toLocaleString()} />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-xs uppercase text-muted-foreground font-semibold mb-3">Status codes (5min)</p>
          <div className="space-y-1.5">
            {data.topStatus.map(([code, count]: [string, number]) => (
              <Row key={code} label={code} value={<span className={`font-mono ${+code >= 500 ? "text-red-500" : +code >= 400 ? "text-amber-500" : "text-emerald-500"}`}>{count}</span>} />
            ))}
            {!data.topStatus.length && <p className="text-sm text-muted-foreground">No traffic</p>}
          </div>
          <p className="text-xs uppercase text-muted-foreground font-semibold mt-4 mb-3">Hot routes (5min)</p>
          <div className="space-y-1">
            {data.topRoutes.slice(0, 8).map(([route, count]: [string, number]) => (
              <div key={route} className="flex justify-between text-xs">
                <span className="font-mono truncate max-w-[260px]">{route}</span>
                <span className="font-mono text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, hint, color }: { icon: React.ReactNode; label: string; value: string; hint?: string; color: "emerald" | "blue" | "red" | "violet" }) {
  const colorMap = {
    emerald: "text-emerald-500 bg-emerald-500/10", blue: "text-blue-500 bg-blue-500/10",
    red: "text-red-500 bg-red-500/10", violet: "text-violet-500 bg-violet-500/10",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg ${colorMap[color]} flex items-center justify-center mb-2`}>{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm py-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-xs">{value}</span>
    </div>
  );
}
