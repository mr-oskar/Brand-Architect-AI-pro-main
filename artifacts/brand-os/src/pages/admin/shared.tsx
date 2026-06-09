import { Loader2, AlertCircle, Search, RefreshCw, X } from "lucide-react";
import type { ReactNode } from "react";
import { getAuthToken } from "@/contexts/AuthContext";

export async function adminFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const baseUrl = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}${url}`, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fmtDate(s?: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

export function fmtRelative(s?: string | null) {
  if (!s) return "—";
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function fmtMoney(cents: number) {
  if (!cents) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-medium text-sm text-red-500">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-red-500 hover:text-red-600 font-medium">Retry</button>
      )}
    </div>
  );
}

export function Toolbar({ search, setSearch, placeholder, onRefresh, count, hideSearch, right }: {
  search?: string; setSearch?: (s: string) => void; placeholder?: string;
  onRefresh?: () => void; count?: number; hideSearch?: boolean; right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-1">
      {!hideSearch && (
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <input
            value={search ?? ""}
            onChange={(e) => setSearch?.(e.target.value)}
            placeholder={placeholder ?? "Search…"}
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}
      {typeof count === "number" && (
        <span className="text-xs text-muted-foreground">{count} item{count === 1 ? "" : "s"}</span>
      )}
      <div className="flex-1" />
      {right}
      {onRefresh && (
        <button onClick={onRefresh} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className={`bg-card border border-border rounded-2xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5 max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-card pb-2 -mt-1 pt-1 z-10">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

export const inputCls = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
