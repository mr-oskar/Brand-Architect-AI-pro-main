import { useEffect, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Briefcase,
  Loader2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import type { BrandKitNodeData, BrandSummary, BrandFull } from "./types";
import NodeActions from "./NodeActions";

type Raw = Partial<BrandKitNodeData> & {
  onChange?: (id: string, patch: Partial<BrandKitNodeData>) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

async function fetchBrandList(): Promise<BrandSummary[]> {
  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const res = await fetch(`${baseUrl}/api/brands?pageSize=200`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load brands (${res.status})`);
  return (await res.json()) as BrandSummary[];
}

async function fetchBrandDetail(brandId: number): Promise<BrandFull> {
  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const res = await fetch(`${baseUrl}/api/brands/${brandId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load brand (${res.status})`);
  return (await res.json()) as BrandFull;
}

export default function BrandKitNode({ id, data, selected }: NodeProps) {
  const raw = (data ?? {}) as Raw;
  const d: BrandKitNodeData = {
    label: raw.label ?? "Brand Kit",
    brandId: raw.brandId ?? null,
    brandSnapshot: raw.brandSnapshot ?? null,
  };
  const onChange = raw.onChange ?? (() => {});
  const onDelete = raw.onDelete ?? (() => {});
  const onDuplicate = raw.onDuplicate ?? (() => {});

  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    setError(null);
    fetchBrandList()
      .then((list) => {
        if (!cancelled) setBrands(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load brands");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSnapshot = async (brandId: number) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const full = await fetchBrandDetail(brandId);
      onChange(id, { brandId, brandSnapshot: full });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load brand");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSelect = (value: string) => {
    if (!value) {
      onChange(id, { brandId: null, brandSnapshot: null });
      return;
    }
    const newId = Number(value);
    if (Number.isFinite(newId)) refreshSnapshot(newId);
  };

  const swatches = useMemo(() => {
    const palette = d.brandSnapshot?.brandKit?.colorPalette;
    if (!palette) return [];
    return [
      palette.primary,
      palette.secondary,
      palette.accent,
      palette.background,
      palette.text,
      palette.neutral,
    ].filter((c): c is string => typeof c === "string" && c.length > 0);
  }, [d.brandSnapshot]);

  const snap = d.brandSnapshot;
  const tagline = snap?.brandKit?.taglines?.[0] ?? null;
  const tone = snap?.brandKit?.toneOfVoice ?? null;

  return (
    <div
      className={`group/node relative w-[280px] rounded-2xl backdrop-blur-xl bg-[#15171f]/85 border transition-all duration-200 ${
        selected
          ? "border-orange-300/55 shadow-[0_0_0_1px_rgba(251,146,60,0.40),0_18px_50px_-12px_rgba(251,146,60,0.40)]"
          : "border-white/[0.07] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] hover:border-white/15"
      }`}
      data-testid={`node-brandkit-${id}`}
    >
      <div
        aria-hidden
        className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-orange-300/55 to-transparent"
      />

      <NodeActions nodeId={id} onDuplicate={onDuplicate} onDelete={onDelete} />

      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-300 shadow-[0_0_8px_2px_rgba(251,146,60,0.55)]" />
        <input
          value={d.label}
          onChange={(e) => onChange(id, { label: e.target.value })}
          className="flex-1 bg-transparent text-[11px] font-medium text-foreground/95 tracking-tight focus:outline-none nodrag truncate"
          data-testid={`input-brandkit-label-${id}`}
          aria-label="Brand kit label"
        />
        <span className="inline-flex items-center gap-1 text-[9.5px] text-orange-300/85 font-medium uppercase tracking-wider">
          <Briefcase className="w-2.5 h-2.5" strokeWidth={2} /> Apply
        </span>
      </div>

      <div className="px-2.5 pb-2.5 space-y-2">
        {/* Brand selector */}
        <div>
          <Label icon={<Briefcase className="w-2.5 h-2.5" />}>Brand</Label>
          <div className="relative">
            <select
              value={d.brandId ? String(d.brandId) : ""}
              onChange={(e) => handleSelect(e.target.value)}
              disabled={loadingList}
              className="w-full text-[11px] bg-[#0f1117] border border-white/10 rounded-md px-2 py-1.5 pr-7 text-foreground focus:outline-none focus:border-orange-300/40 nodrag appearance-none disabled:opacity-60"
              data-testid={`select-brandkit-${id}`}
            >
              <option value="" className="bg-[#0f1117]">
                {loadingList ? "Loading brands…" : "Choose a brand…"}
              </option>
              {brands.map((b) => (
                <option key={b.id} value={String(b.id)} className="bg-[#0f1117]">
                  {b.companyName}
                  {b.industry ? ` · ${b.industry}` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground/55" />
          </div>
          {brands.length === 0 && !loadingList && !error && (
            <div className="mt-1 text-[9.5px] text-foreground/55 leading-relaxed">
              No brands yet. Create one from the Brands page first.
            </div>
          )}
        </div>

        {/* Status / error */}
        {error && (
          <div className="flex items-start gap-1.5 text-[10px] text-red-300 bg-red-500/[0.08] border border-red-400/20 rounded-md px-2 py-1.5">
            <AlertCircle className="w-3 h-3 mt-px flex-shrink-0" strokeWidth={1.75} />
            <span className="break-words">{error}</span>
          </div>
        )}
        {loadingDetail && (
          <div className="flex items-center gap-1.5 text-[10px] text-orange-200 bg-orange-400/[0.08] border border-orange-400/20 rounded-md px-2 py-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Pulling brand details…
          </div>
        )}

        {/* Brand snapshot preview */}
        {snap && !loadingDetail && (
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="flex items-center gap-2 px-2 py-2 border-b border-white/5">
              {snap.logoUrl ? (
                <div className="w-8 h-8 rounded-md bg-white/90 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img src={snap.logoUrl} alt="" className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-md bg-white/[0.04] border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-3.5 h-3.5 text-foreground/55" strokeWidth={1.5} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-foreground/95 truncate tracking-tight">
                  {snap.companyName}
                </div>
                {snap.industry && (
                  <div className="text-[9.5px] text-foreground/55 truncate">{snap.industry}</div>
                )}
              </div>
              <button
                onClick={() => snap.id != null && refreshSnapshot(snap.id)}
                title="Refresh brand data"
                className="w-6 h-6 rounded text-foreground/65 hover:text-foreground hover:bg-white/5 flex items-center justify-center nodrag"
                data-testid={`button-brandkit-refresh-${id}`}
              >
                <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </div>

            {swatches.length > 0 && (
              <div className="px-2 py-1.5 border-b border-white/5">
                <div className="text-[9px] uppercase tracking-wider text-foreground/55 font-semibold mb-1">
                  Palette
                </div>
                <div className="flex items-center gap-1">
                  {swatches.map((c, i) => (
                    <div
                      key={`${c}-${i}`}
                      className="w-5 h-5 rounded-md border border-white/15 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}

            {(tone || tagline) && (
              <div className="px-2 py-1.5 space-y-1">
                {tone && (
                  <div className="text-[10px] text-foreground/80 leading-snug">
                    <span className="text-foreground/55">Voice: </span>
                    <span className="line-clamp-1">{tone}</span>
                  </div>
                )}
                {tagline && (
                  <div className="text-[10px] text-foreground/80 leading-snug italic">
                    “{tagline}”
                  </div>
                )}
              </div>
            )}

            {!snap.brandKit && (
              <div className="px-2 py-1.5 text-[9.5px] text-amber-200/80">
                This brand has no kit generated yet. Open the brand page and generate its kit for full identity.
              </div>
            )}
          </div>
        )}

        <div className="text-[9.5px] text-foreground/55 leading-relaxed border-t border-white/5 pt-1.5">
          Connect to a generate node's brand input to apply identity.
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="brand"
        className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-orange-300 hover:!w-3 hover:!h-3 transition-all"
      />
    </div>
  );
}

function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-foreground/65 font-semibold mb-1">
      {icon}
      <span>{children}</span>
    </div>
  );
}
