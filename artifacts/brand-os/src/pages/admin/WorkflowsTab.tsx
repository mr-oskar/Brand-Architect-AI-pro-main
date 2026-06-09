import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { adminFetch, Loading, ErrorBox } from "./shared";

export default function WorkflowsTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try { setData(await adminFetch("/api/admin/workflows")); setError(null); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);

  if (error && !data) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Loading />;

  const top = data.funnel[0]?.count ?? 0;
  const maxSignups = Math.max(1, ...data.signupsByDay.map((d: any) => d.signups));

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-xl p-6">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">User onboarding funnel</p>
        <p className="text-sm text-muted-foreground mb-5">From signup to first published post.</p>
        <div className="space-y-2">
          {data.funnel.map((step: any, i: number) => {
            const widthPct = top ? (step.count / top) * 100 : 0;
            return (
              <div key={step.step}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">{step.step}</p>
                  <p className="text-sm font-mono">
                    {step.count.toLocaleString()}
                    {i > 0 && <span className="text-xs text-muted-foreground ml-2">{step.rate}%</span>}
                  </p>
                </div>
                <div className="bg-muted rounded h-9 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-violet-500 flex items-center px-3 text-xs text-primary-foreground font-medium transition-all" style={{ width: `${Math.max(widthPct, 1)}%` }}>
                    {widthPct > 8 && `${widthPct.toFixed(0)}%`}
                  </div>
                </div>
                {i < data.funnel.length - 1 && (
                  <div className="flex justify-center py-0.5 text-muted-foreground"><ArrowDown className="w-3 h-3" /></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-xs uppercase text-muted-foreground font-semibold mb-3">Signups (last 14 days)</p>
        <div className="flex items-end gap-1 h-32">
          {data.signupsByDay.map((d: any) => {
            const h = (d.signups / maxSignups) * 100;
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100">{d.signups}</div>
                <div className="w-full bg-emerald-500/70 hover:bg-emerald-500 rounded-t transition-all" style={{ height: `${Math.max(2, h)}%` }} title={`${d.day}: ${d.signups}`} />
                <div className="text-[9px] text-muted-foreground">{new Date(d.day).getDate()}</div>
              </div>
            );
          })}
          {!data.signupsByDay.length && <div className="flex-1 text-center text-sm text-muted-foreground self-center">No signups yet</div>}
        </div>
      </div>
    </div>
  );
}
