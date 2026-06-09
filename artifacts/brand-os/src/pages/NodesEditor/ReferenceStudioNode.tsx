import { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Loader2,
  AlertCircle,
  Download,
  Play,
  AtSign,
  Image as ImageIcon,
  Sparkles,
  Sliders,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Wand2,
  RefreshCw,
  Star,
  Briefcase,
  CheckCircle2,
  Circle,
  Lock,
  Unlock,
  Dices,
  Send,
  Layers as LayersIcon,
  Trash2,
  Maximize2,
  Grid3x3,
  Palette,
  Library,
  Megaphone,
} from "lucide-react";
import type {
  GenerateModel,
  GenerateNodeBackground,
  GenerateNodeQuality,
  GenerateNodeSize,
  ReferenceStudioMode,
  ReferenceStudioNodeData,
  ReferenceStudioResolution,
  ReferenceStudioItem,
  SettingsNodeData,
  BrandFull,
} from "./types";
import ImageLightbox from "@/components/ImageLightbox";
import { pushExport, type ExportTarget } from "@/lib/nodesExport";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import NodeActions from "./NodeActions";

const MODE_OPTIONS: { value: ReferenceStudioMode; label: string; hint: string }[] = [
  { value: "variations", label: "Variations", hint: "Same subject, varied composition & lighting." },
  { value: "styleLock", label: "Style Lock", hint: "Lock the visual style; vary subject only." },
  { value: "subjectLock", label: "Subject Lock", hint: "Lock the subject identity; vary scene." },
  { value: "matrix", label: "Matrix", hint: "Two-axis grid (lighting × angle)." },
  { value: "aspectPack", label: "Aspect Pack", hint: "Same scene across square / portrait / landscape." },
];

const COUNT_PRESETS = [2, 4, 6, 8, 12, 16] as const;

const RES_OPTIONS: { value: ReferenceStudioResolution; label: string; mult: number }[] = [
  { value: "1k", label: "1K", mult: 1 },
  { value: "2k", label: "2K", mult: 2 },
  { value: "4k", label: "4K", mult: 4 },
];

const SIZE_PRESETS: { value: GenerateNodeSize; label: string; Icon: typeof Square }[] = [
  { value: "1024x1024", label: "Square", Icon: Square },
  { value: "1024x1536", label: "Portrait", Icon: RectangleVertical },
  { value: "1536x1024", label: "Landscape", Icon: RectangleHorizontal },
  { value: "auto", label: "Auto", Icon: Wand2 },
];

const QUALITY_OPTIONS: { value: GenerateNodeQuality; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const BG_OPTIONS: { value: GenerateNodeBackground; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "opaque", label: "Solid" },
  { value: "transparent", label: "Transparent" },
];

const MODEL_OPTIONS: { value: GenerateModel; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "gpt-image-1", label: "OpenAI" },
  { value: "gemini-2.5-flash-image", label: "Gemini" },
];

const SEND_TARGETS: { key: ExportTarget; label: string; Icon: typeof Palette }[] = [
  { key: "design-studio", label: "Design Studio", Icon: Palette },
  { key: "brand-kit", label: "Brand Kit", Icon: Briefcase },
  { key: "assets", label: "Assets Library", Icon: Library },
  { key: "campaign", label: "New Campaign", Icon: Megaphone },
];

/** Per-image base credit cost (kept in sync with backend's design.generate-image). */
const PER_IMAGE_COST = 10;

export default function ReferenceStudioNode({ id, data, selected }: NodeProps) {
  const raw = (data ?? {}) as Partial<ReferenceStudioNodeData> & {
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
  };
  const d: ReferenceStudioNodeData = {
    label: raw.label ?? "Reference Studio",
    prompt: raw.prompt ?? "",
    status: raw.status ?? "idle",
    error: raw.error ?? null,
    count: clampCount(raw.count ?? 4),
    mode: raw.mode ?? "variations",
    resolution: raw.resolution ?? "1k",
    size: raw.size ?? "1024x1024",
    quality: raw.quality ?? "high",
    background: raw.background ?? "auto",
    model: raw.model ?? "auto",
    fidelity: typeof raw.fidelity === "number" ? Math.max(0, Math.min(100, raw.fidelity)) : 65,
    seed: typeof raw.seed === "number" ? raw.seed : 42,
    seedLocked: raw.seedLocked ?? false,
    expandedPrompts: raw.expandedPrompts ?? null,
    items: raw.items ?? [],
    references: raw.references ?? [],
    inheritedSettings: raw.inheritedSettings ?? null,
    inheritedBrand: raw.inheritedBrand ?? null,
    onPromptChange: raw.onPromptChange,
    onRun: raw.onRun,
    onRetryFailed: raw.onRetryFailed,
    onRetryItem: raw.onRetryItem,
    onSettingsChange: raw.onSettingsChange,
    onExpandPrompts: raw.onExpandPrompts,
    onPromoteSelected: raw.onPromoteSelected,
    onClearResults: raw.onClearResults,
  };

  const onDelete = raw.onDelete ?? (() => {});
  const onDuplicate = raw.onDuplicate ?? (() => {});
  const set = (patch: Partial<ReferenceStudioNodeData>) => d.onSettingsChange?.(id, patch);

  // Inherited settings override local
  const inh: SettingsNodeData | null = d.inheritedSettings ?? null;
  const inhBrand: BrandFull | null = d.inheritedBrand ?? null;
  const effSize: GenerateNodeSize = inh?.size ?? d.size;
  const effQuality: GenerateNodeQuality = inh?.quality ?? d.quality;
  const effBackground: GenerateNodeBackground = inh?.background ?? d.background;
  const effModel: GenerateModel = inh?.model ?? d.model;

  const isRunning = d.status === "running";
  const anyRefUploading = (d.references ?? []).some((r) => !r.ready);
  const runDisabled = isRunning || anyRefUploading;

  const upscaleMult = RES_OPTIONS.find((r) => r.value === d.resolution)?.mult ?? 1;
  // Cost is per-image × upscale^2 (matches backend chargeCredits multiplier).
  const totalCost = d.count * PER_IMAGE_COST * upscaleMult * upscaleMult;

  const doneCount = d.items.filter((it) => it.status === "done").length;
  const failedCount = d.items.filter((it) => it.status === "error").length;
  const runningCount = d.items.filter((it) => it.status === "running").length;
  const selectedItems = d.items.filter((it) => it.selected && it.status === "done");

  const [showSettings, setShowSettings] = useState(false);
  const [lightbox, setLightbox] = useState<ReferenceStudioItem | null>(null);
  const [showCustomCount, setShowCustomCount] = useState(false);
  const [sendMenuFor, setSendMenuFor] = useState<number | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const sendMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings && sendMenuFor === null) return;
    const onDocClick = (e: MouseEvent) => {
      if (showSettings && settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
      if (sendMenuFor !== null && sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) {
        setSendMenuFor(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showSettings, sendMenuFor]);

  const gridCols = useMemo(() => {
    if (d.count <= 2) return "grid-cols-2";
    if (d.count <= 4) return "grid-cols-2";
    if (d.count <= 9) return "grid-cols-3";
    return "grid-cols-4";
  }, [d.count]);

  const previewSlots: ReferenceStudioItem[] = useMemo(() => {
    if (d.items.length === d.count) return d.items;
    // Placeholder slots so the grid renders at the right size before/while running.
    const slots: ReferenceStudioItem[] = [];
    for (let i = 1; i <= d.count; i++) {
      const existing = d.items.find((it) => it.index === i);
      if (existing) slots.push(existing);
      else
        slots.push({
          index: i,
          status: "pending",
          url: null,
          error: null,
          prompt: "",
          seed: d.seed + i,
          size: effSize,
          selected: false,
          starred: false,
        });
    }
    return slots;
  }, [d.items, d.count, d.seed, effSize]);

  const insertMention = (mention: string) => {
    const cur = d.prompt || "";
    const next = `${cur}${cur && !cur.endsWith(" ") ? " " : ""}${mention} `;
    d.onPromptChange?.(id, next);
  };

  const downloadOne = (item: ReferenceStudioItem) => {
    if (!item.url) return;
    const a = document.createElement("a");
    a.href = item.url;
    a.download = `reference-studio-${id}-${item.index}.png`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sendOne = (item: ReferenceStudioItem, target: ExportTarget) => {
    if (!item.url) return;
    pushExport(target, { imageUrl: item.url, prompt: item.prompt || d.prompt });
    setSendMenuFor(null);
  };

  return (
    <>
      <div
        className={`group/node relative w-[520px] rounded-2xl backdrop-blur-xl bg-[#15171f]/85 border transition-all duration-200 ${
          selected
            ? "border-cyan-400/55 shadow-[0_0_0_1px_rgba(34,211,238,0.40),0_24px_60px_-16px_rgba(34,211,238,0.45)]"
            : "border-white/[0.07] shadow-[0_12px_36px_-12px_rgba(0,0,0,0.7)] hover:border-white/15"
        }`}
        data-testid={`node-reference-studio-${id}`}
      >
        {/* Hairline accent */}
        <div
          aria-hidden
          className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/55 to-transparent"
        />

        <NodeActions nodeId={id} onDuplicate={onDuplicate} onDelete={onDelete} />

        {/* Connection handles — same as Generate so it slots into existing graphs */}
        <Handle
          type="target"
          position={Position.Left}
          id="references"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-sky-400 hover:!w-3 hover:!h-3 transition-all"
          style={{ top: "12%" }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="prompt"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-amber-300 hover:!w-3 hover:!h-3 transition-all"
          style={{ top: "32%" }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="brand"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-orange-300 hover:!w-3 hover:!h-3 transition-all"
          style={{ top: "52%" }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="settings"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-emerald-300 hover:!w-3 hover:!h-3 transition-all"
          style={{ top: "72%" }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="image"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-emerald-400 hover:!w-3 hover:!h-3 transition-all"
        />

        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_2px_rgba(34,211,238,0.55)]" />
          <input
            value={d.label}
            onChange={(e) => set({ label: e.target.value })}
            className="flex-1 bg-transparent text-[12px] font-medium text-foreground/95 tracking-tight focus:outline-none nodrag"
            data-testid={`input-rs-label-${id}`}
          />
          {inh && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-300 bg-emerald-300/10 border border-emerald-300/30 rounded px-1 py-0.5">
                  <Sliders className="w-2 h-2" />
                  <span>SET</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>Settings inherited from "{inh.label}"</TooltipContent>
            </Tooltip>
          )}
          {inhBrand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-orange-300 bg-orange-300/10 border border-orange-300/30 rounded px-1 py-0.5">
                  <Briefcase className="w-2 h-2" />
                  <span>BRAND</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>Brand identity from "{inhBrand.companyName}"</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="text-[9.5px] font-mono font-semibold text-cyan-200/90 bg-cyan-400/10 border border-cyan-400/25 rounded px-1.5 py-0.5"
                data-testid={`rs-cost-${id}`}
              >
                {totalCost} CU
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {d.count} × {PER_IMAGE_COST} CU
              {upscaleMult > 1 && ` × ${upscaleMult * upscaleMult} (${d.resolution.toUpperCase()})`}
            </TooltipContent>
          </Tooltip>

          {/* Settings popover */}
          <div ref={settingsMenuRef} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowSettings((s) => !s)}
                  className={`w-6 h-6 rounded-md flex items-center justify-center transition-all nodrag ${
                    showSettings
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-white/5"
                  }`}
                  data-testid={`button-rs-settings-${id}`}
                >
                  <Sliders className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Model settings</TooltipContent>
            </Tooltip>
            {showSettings && (
              <div
                className="absolute top-7 right-0 w-72 rounded-xl border border-white/10 bg-[#13151c]/95 backdrop-blur-xl shadow-2xl shadow-black/70 z-30 overflow-hidden nodrag"
                data-testid={`menu-rs-settings-${id}`}
              >
                <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
                  <Sliders className="w-3 h-3 text-foreground/85" />
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-foreground/85">
                    Studio settings
                  </span>
                  {inh && (
                    <span className="ml-auto text-[9px] text-emerald-300 font-medium">
                      Overridden by Settings node
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-3 max-h-[420px] overflow-y-auto">
                  <SettingGroup label="Model">
                    <div className="grid grid-cols-3 gap-1">
                      {MODEL_OPTIONS.map((m) => (
                        <ChipButton
                          key={m.value}
                          active={effModel === m.value}
                          onClick={() => set({ model: m.value })}
                          disabled={!!inh}
                          accent="cyan"
                          testId={`rs-model-${m.value}-${id}`}
                        >
                          {m.label}
                        </ChipButton>
                      ))}
                    </div>
                  </SettingGroup>

                  <SettingGroup label="Aspect">
                    <div className="grid grid-cols-4 gap-1">
                      {SIZE_PRESETS.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => set({ size: s.value })}
                          disabled={!!inh}
                          className={`flex flex-col items-center gap-1 py-1.5 rounded-lg border transition-all disabled:opacity-60 ${
                            effSize === s.value
                              ? "border-cyan-400/55 bg-cyan-400/10 text-foreground"
                              : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
                          }`}
                          data-testid={`rs-size-${s.value}-${id}`}
                        >
                          <s.Icon className="w-3 h-3" strokeWidth={1.5} />
                          <span className="text-[9px]">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </SettingGroup>

                  <SettingGroup label="Quality">
                    <div className="grid grid-cols-4 gap-1">
                      {QUALITY_OPTIONS.map((q) => (
                        <ChipButton
                          key={q.value}
                          active={effQuality === q.value}
                          onClick={() => set({ quality: q.value })}
                          disabled={!!inh}
                          accent="cyan"
                          testId={`rs-q-${q.value}-${id}`}
                        >
                          {q.label}
                        </ChipButton>
                      ))}
                    </div>
                  </SettingGroup>

                  <SettingGroup label="Background">
                    <div className="grid grid-cols-3 gap-1">
                      {BG_OPTIONS.map((b) => (
                        <ChipButton
                          key={b.value}
                          active={effBackground === b.value}
                          onClick={() => set({ background: b.value })}
                          disabled={!!inh}
                          accent="cyan"
                          testId={`rs-bg-${b.value}-${id}`}
                        >
                          {b.label}
                        </ChipButton>
                      ))}
                    </div>
                  </SettingGroup>

                  <div className="text-[9.5px] text-foreground/65 leading-relaxed pt-1 border-t border-white/5">
                    Quality and background only apply to OpenAI{" "}
                    <span className="font-mono text-foreground/85">gpt-image-1</span>. Gemini ignores them.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Run button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => d.onRun?.(id)}
                disabled={runDisabled}
                className={`flex items-center gap-1 px-2.5 h-6 rounded-md text-[10.5px] font-medium transition-all nodrag ${
                  runDisabled
                    ? "bg-white/5 text-muted-foreground/40 cursor-not-allowed"
                    : "bg-gradient-to-b from-cyan-400 to-cyan-600 text-white shadow-[0_4px_14px_-2px_rgba(34,211,238,0.55)] hover:from-cyan-300 hover:to-cyan-500"
                }`}
                data-testid={`button-rs-run-${id}`}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>
                      {doneCount}/{d.count}
                    </span>
                  </>
                ) : doneCount > 0 ? (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    <span>Re-run</span>
                  </>
                ) : (
                  <>
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>Run {d.count}</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {anyRefUploading ? "Waiting for references…" : isRunning ? "Generating…" : "Generate batch"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="px-2.5 pb-2.5 space-y-2">
          {/* === MODE STRIP === */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
            <div className="flex items-center gap-1 mb-1">
              <LayersIcon className="w-2.5 h-2.5 text-cyan-300" />
              <span className="text-[9px] uppercase tracking-wider text-foreground/65 font-semibold">
                Mode
              </span>
              <span className="ml-auto text-[9.5px] text-foreground/55 truncate max-w-[280px]">
                {MODE_OPTIONS.find((m) => m.value === d.mode)?.hint}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {MODE_OPTIONS.map((m) => (
                <Tooltip key={m.value}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => set({ mode: m.value })}
                      className={`py-1 rounded-md border text-[9.5px] font-medium transition-all nodrag truncate px-1 ${
                        d.mode === m.value
                          ? "border-cyan-400/55 bg-cyan-400/10 text-cyan-100"
                          : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
                      }`}
                      data-testid={`rs-mode-${m.value}-${id}`}
                    >
                      {m.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{m.hint}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* === COUNT + RESOLUTION === */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
              <div className="flex items-center gap-1 mb-1">
                <Grid3x3 className="w-2.5 h-2.5 text-cyan-300" />
                <span className="text-[9px] uppercase tracking-wider text-foreground/65 font-semibold">
                  Image count
                </span>
                <button
                  onClick={() => setShowCustomCount((c) => !c)}
                  className="ml-auto text-[9px] text-cyan-300 hover:text-cyan-200 nodrag"
                  data-testid={`rs-count-toggle-custom-${id}`}
                >
                  {showCustomCount ? "Presets" : "Custom"}
                </button>
              </div>
              {showCustomCount ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={d.count}
                    onChange={(e) => set({ count: clampCount(Number(e.target.value)) })}
                    className="w-16 text-[11px] text-center bg-[#0f1117] border border-cyan-400/40 rounded-md px-1.5 py-1 text-foreground focus:outline-none focus:border-cyan-400 nodrag"
                    data-testid={`rs-count-custom-${id}`}
                  />
                  <span className="text-[9.5px] text-foreground/55">images (1–16)</span>
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-1">
                  {COUNT_PRESETS.map((n) => (
                    <button
                      key={n}
                      onClick={() => set({ count: n })}
                      className={`py-1 rounded-md border text-[10px] font-mono font-semibold transition-all nodrag ${
                        d.count === n
                          ? "border-cyan-400/55 bg-cyan-400/15 text-cyan-100"
                          : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
                      }`}
                      data-testid={`rs-count-${n}-${id}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5">
              <div className="flex items-center gap-1 mb-1">
                <Maximize2 className="w-2.5 h-2.5 text-cyan-300" />
                <span className="text-[9px] uppercase tracking-wider text-foreground/65 font-semibold">
                  Resolution
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {RES_OPTIONS.map((r) => (
                  <Tooltip key={r.value}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => set({ resolution: r.value })}
                        className={`py-1 rounded-md border text-[10px] font-mono font-semibold transition-all nodrag ${
                          d.resolution === r.value
                            ? "border-cyan-400/55 bg-cyan-400/15 text-cyan-100"
                            : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
                        }`}
                        data-testid={`rs-res-${r.value}-${id}`}
                      >
                        {r.label}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {r.value === "1k" ? "Native model resolution" : `Lanczos upscale ×${r.mult} (×${r.mult * r.mult} cost)`}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          </div>

          {/* === FIDELITY + SEED === */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-foreground/65 font-semibold w-14">
                Fidelity
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={d.fidelity}
                onChange={(e) => set({ fidelity: Number(e.target.value) })}
                className="flex-1 accent-cyan-400 nodrag"
                data-testid={`rs-fidelity-${id}`}
              />
              <span className="text-[10px] font-mono text-cyan-200 w-8 text-right">{d.fidelity}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-foreground/65 font-semibold w-14">
                Seed
              </span>
              <input
                type="number"
                value={d.seed}
                onChange={(e) => set({ seed: Number(e.target.value) || 0 })}
                disabled={!d.seedLocked}
                className="w-20 text-[10.5px] font-mono bg-[#0f1117] border border-white/10 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-cyan-400/40 disabled:opacity-50 nodrag"
                data-testid={`rs-seed-${id}`}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => set({ seedLocked: !d.seedLocked })}
                    className={`px-2 h-6 rounded-md flex items-center gap-1 text-[9.5px] font-medium border transition-colors nodrag ${
                      d.seedLocked
                        ? "border-cyan-400/55 bg-cyan-400/10 text-cyan-100"
                        : "border-white/10 bg-white/[0.025] text-foreground/70 hover:border-white/25"
                    }`}
                    data-testid={`rs-seed-lock-${id}`}
                  >
                    {d.seedLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                    {d.seedLocked ? "Locked" : "Random"}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {d.seedLocked ? "Same seed for all slots" : "New random seed per slot"}
                </TooltipContent>
              </Tooltip>
              <button
                onClick={() => set({ seed: Math.floor(Math.random() * 1_000_000) })}
                className="w-6 h-6 rounded-md flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors nodrag"
                title="Roll new seed"
                data-testid={`rs-seed-roll-${id}`}
              >
                <Dices className="w-3 h-3" />
              </button>
              <span className="ml-auto text-[9px] text-foreground/50 font-mono">
                {d.seedLocked ? `all = ${d.seed}` : "varies"}
              </span>
            </div>
          </div>

          {/* === REFERENCE CHIPS === */}
          {(d.references ?? []).length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[8.5px] uppercase tracking-wider text-foreground/70 font-semibold">
                <AtSign className="w-2 h-2" />
                <span>References</span>
                {anyRefUploading && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[8.5px] text-amber-300 normal-case font-medium">
                    <Loader2 className="w-2 h-2 animate-spin" />
                    loading
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {(d.references ?? []).map((ref) => (
                  <button
                    key={ref.id}
                    onClick={() => insertMention(ref.mention)}
                    disabled={!ref.ready}
                    className={`group flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full border text-[9.5px] transition-all nodrag disabled:opacity-50 disabled:cursor-wait ${
                      ref.kind === "generateImage"
                        ? "bg-cyan-400/[0.10] hover:bg-cyan-400/[0.18] border-cyan-400/25 hover:border-cyan-400/50 text-cyan-200 hover:text-white"
                        : "bg-sky-400/[0.08] hover:bg-sky-400/[0.16] border-sky-400/25 hover:border-sky-400/50 text-sky-200 hover:text-white"
                    }`}
                    data-testid={`rs-chip-${ref.id}-${id}`}
                  >
                    {ref.thumbnail ? (
                      <img
                        src={ref.thumbnail}
                        alt=""
                        className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-white/15"
                      />
                    ) : ref.ready ? (
                      <div
                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                          ref.kind === "generateImage" ? "bg-cyan-400/30" : "bg-sky-400/30"
                        }`}
                      >
                        <AtSign className="w-2 h-2 text-white/85" />
                      </div>
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span className="font-mono">{ref.mention}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* === PROMPT === */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-foreground/65 font-semibold">
                Prompt
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => d.onExpandPrompts?.(id)}
                    disabled={!d.prompt.trim() || isRunning}
                    className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 text-[9.5px] font-medium hover:bg-cyan-400/20 hover:border-cyan-400/50 disabled:opacity-40 disabled:cursor-not-allowed nodrag transition-colors"
                    data-testid={`rs-expand-${id}`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    Smart Expand
                  </button>
                </TooltipTrigger>
                <TooltipContent>Expand into {d.count} unique prompt variations</TooltipContent>
              </Tooltip>
              {d.expandedPrompts && d.expandedPrompts.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => set({ expandedPrompts: null })}
                      className="text-[9px] text-foreground/55 hover:text-foreground nodrag"
                      data-testid={`rs-expand-clear-${id}`}
                    >
                      Clear
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Clear expanded prompts (use base prompt for all slots)</TooltipContent>
                </Tooltip>
              )}
            </div>
            <textarea
              value={d.prompt}
              onChange={(e) => d.onPromptChange?.(id, e.target.value)}
              placeholder="Describe the image. Use @ref1, @ref2 to cite references."
              rows={3}
              className="w-full text-[11px] leading-relaxed bg-[#0f1117] border border-white/10 rounded-md px-2.5 py-2 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-cyan-400/45 resize-none nodrag transition-colors"
              data-testid={`textarea-rs-prompt-${id}`}
            />
            {d.expandedPrompts && d.expandedPrompts.length > 0 && (
              <div className="flex items-center gap-1 text-[9px] text-cyan-200/85 px-1">
                <Sparkles className="w-2.5 h-2.5" />
                {d.expandedPrompts.length} expanded prompts ready — each slot will use its own.
              </div>
            )}
          </div>

          {/* === RESULTS GRID === */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 px-0.5">
              <span className="text-[9px] uppercase tracking-wider text-foreground/65 font-semibold">
                Results
              </span>
              {(doneCount > 0 || runningCount > 0 || failedCount > 0) && (
                <span className="text-[9px] font-mono text-foreground/55">
                  {doneCount}/{d.count}
                  {failedCount > 0 && (
                    <span className="text-red-300/85"> · {failedCount} failed</span>
                  )}
                  {runningCount > 0 && (
                    <span className="text-cyan-300"> · {runningCount} running</span>
                  )}
                </span>
              )}
              {d.items.length > 0 && (
                <button
                  onClick={() => d.onClearResults?.(id)}
                  className="ml-auto inline-flex items-center gap-1 text-[9px] text-foreground/55 hover:text-foreground/85 nodrag"
                  data-testid={`rs-clear-${id}`}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  Clear
                </button>
              )}
            </div>
            <div className={`grid ${gridCols} gap-1.5`}>
              {previewSlots.map((item) => (
                <ResultTile
                  key={item.index}
                  nodeId={id}
                  item={item}
                  onRetry={() => d.onRetryItem?.(id, item.index)}
                  onToggleSelect={() =>
                    d.onSettingsChange?.(id, {
                      items: d.items.map((it) =>
                        it.index === item.index ? { ...it, selected: !it.selected } : it,
                      ),
                    })
                  }
                  onToggleStar={() =>
                    d.onSettingsChange?.(id, {
                      items: d.items.map((it) =>
                        it.index === item.index ? { ...it, starred: !it.starred } : it,
                      ),
                    })
                  }
                  onZoom={() => setLightbox(item)}
                  onDownload={() => downloadOne(item)}
                  onSendOpen={() => setSendMenuFor(item.index)}
                  sendOpen={sendMenuFor === item.index}
                  sendMenuRef={sendMenuRef}
                  onSendTo={(target) => sendOne(item, target)}
                />
              ))}
            </div>
          </div>

          {/* === BOTTOM ACTION BAR === */}
          {(doneCount > 0 || failedCount > 0) && (
            <div className="flex items-center gap-1.5 px-1 pt-1 border-t border-white/[0.05]">
              {failedCount > 0 && (
                <button
                  onClick={() => d.onRetryFailed?.(id)}
                  disabled={isRunning}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-400/30 bg-red-500/10 text-red-200 text-[9.5px] font-medium hover:bg-red-500/20 hover:border-red-400/50 disabled:opacity-50 nodrag transition-colors"
                  data-testid={`rs-retry-failed-${id}`}
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Retry {failedCount} failed
                </button>
              )}
              {selectedItems.length > 0 && (
                <button
                  onClick={() => d.onPromoteSelected?.(id)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-cyan-400/40 bg-cyan-400/10 text-cyan-100 text-[9.5px] font-medium hover:bg-cyan-400/20 hover:border-cyan-400/60 nodrag transition-colors"
                  data-testid={`rs-promote-${id}`}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Promote {selectedItems.length} to Generate
                </button>
              )}
              <span className="ml-auto text-[9px] text-foreground/50">
                {selectedItems.length > 0
                  ? `${selectedItems.length} selected`
                  : doneCount > 0
                    ? "Click an image to select"
                    : ""}
              </span>
            </div>
          )}

          {d.error && (
            <div className="text-[10px] text-red-300/90 bg-red-500/10 border border-red-400/25 rounded-md px-2 py-1.5">
              {d.error}
            </div>
          )}
        </div>
      </div>

      <ImageLightbox
        open={!!lightbox}
        onOpenChange={(o) => !o && setLightbox(null)}
        src={lightbox?.url ?? null}
        title={`Reference Studio · #${lightbox?.index ?? ""}`}
        subtitle={lightbox?.prompt ? lightbox.prompt.slice(0, 140) : undefined}
        filename={`reference-studio-${id}-${lightbox?.index ?? "x"}.png`}
      />
    </>
  );
}

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(16, Math.floor(n)));
}

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-foreground/65 font-semibold mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  disabled,
  children,
  accent = "cyan",
  testId,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  accent?: "cyan" | "violet";
  testId?: string;
}) {
  const accentClass =
    accent === "cyan"
      ? "border-cyan-400/55 bg-cyan-400/10 text-foreground"
      : "border-[#7c5cff]/55 bg-[#7c5cff]/10 text-foreground";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`py-1.5 rounded-lg border text-[9.5px] transition-all disabled:opacity-60 nodrag ${
        active
          ? accentClass
          : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function ResultTile({
  nodeId,
  item,
  onRetry,
  onToggleSelect,
  onToggleStar,
  onZoom,
  onDownload,
  onSendOpen,
  sendOpen,
  sendMenuRef,
  onSendTo,
}: {
  nodeId: string;
  item: ReferenceStudioItem;
  onRetry: () => void;
  onToggleSelect: () => void;
  onToggleStar: () => void;
  onZoom: () => void;
  onDownload: () => void;
  onSendOpen: () => void;
  sendOpen: boolean;
  sendMenuRef: React.RefObject<HTMLDivElement | null>;
  onSendTo: (target: ExportTarget) => void;
}) {
  const isDone = item.status === "done" && !!item.url;
  const isError = item.status === "error";
  const isRunning = item.status === "running";
  const isPending = item.status === "pending";

  return (
    <div
      className={`group/tile relative aspect-square rounded-lg overflow-hidden border transition-all ${
        item.selected
          ? "border-cyan-400 ring-2 ring-cyan-400/40 shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)]"
          : isDone
            ? "border-white/10 hover:border-cyan-400/40"
            : "border-white/[0.05]"
      } ${
        isPending
          ? "bg-[radial-gradient(ellipse_at_center,_rgba(34,211,238,0.06)_0%,_rgba(0,0,0,0.4)_100%)]"
          : "bg-[#0d0f15]"
      }`}
      data-testid={`rs-tile-${nodeId}-${item.index}`}
    >
      {/* Index badge */}
      <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-black/55 backdrop-blur text-[8.5px] font-mono text-white/85 nodrag">
        #{item.index}
      </div>

      {/* Star badge */}
      {item.starred && (
        <div className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-amber-400/90 flex items-center justify-center nodrag">
          <Star className="w-2.5 h-2.5 fill-white text-white" />
        </div>
      )}

      {/* Image / state */}
      {isDone ? (
        <button
          type="button"
          onClick={onToggleSelect}
          className="block w-full h-full nodrag"
          data-testid={`rs-tile-select-${nodeId}-${item.index}`}
        >
          <img
            src={item.url!}
            alt={`Result ${item.index}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover/tile:scale-[1.04]"
          />
        </button>
      ) : isRunning ? (
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
          <span className="text-[9px] text-cyan-200/80 tracking-wide">Rendering</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-full gap-1 px-2 text-center">
          <AlertCircle className="w-3.5 h-3.5 text-red-300" />
          <span className="text-[8.5px] leading-tight text-red-300/85 line-clamp-3">
            {item.error || "Failed"}
          </span>
          <button
            onClick={onRetry}
            className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded text-red-100 bg-red-500/15 hover:bg-red-500/30 border border-red-400/30 nodrag"
            data-testid={`rs-tile-retry-${nodeId}-${item.index}`}
          >
            <RefreshCw className="w-2.5 h-2.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1 text-foreground/40">
          <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="text-[8.5px]">Slot {item.index}</span>
        </div>
      )}

      {/* Hover toolbar */}
      {isDone && (
        <div className="absolute inset-x-0 bottom-0 p-1 flex items-center justify-end gap-0.5 nodrag opacity-0 group-hover/tile:opacity-100 transition-opacity bg-gradient-to-t from-black/70 to-transparent">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar();
                }}
                className={`w-6 h-6 rounded-md backdrop-blur flex items-center justify-center transition-colors ${
                  item.starred
                    ? "bg-amber-400/90 text-white"
                    : "bg-black/60 hover:bg-black/85 text-white"
                }`}
                data-testid={`rs-tile-star-${nodeId}-${item.index}`}
              >
                <Star className={`w-2.5 h-2.5 ${item.starred ? "fill-current" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{item.starred ? "Unstar" : "Star"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onZoom();
                }}
                className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/85 backdrop-blur text-white flex items-center justify-center"
                data-testid={`rs-tile-zoom-${nodeId}-${item.index}`}
              >
                <Maximize2 className="w-2.5 h-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Full view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/85 backdrop-blur text-white flex items-center justify-center"
                data-testid={`rs-tile-download-${nodeId}-${item.index}`}
              >
                <Download className="w-2.5 h-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/85 backdrop-blur text-white flex items-center justify-center"
                data-testid={`rs-tile-rerun-${nodeId}-${item.index}`}
              >
                <RefreshCw className="w-2.5 h-2.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Re-run this slot</TooltipContent>
          </Tooltip>
          <div className="relative" ref={sendOpen ? sendMenuRef : undefined}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendOpen();
                  }}
                  className={`w-6 h-6 rounded-md backdrop-blur text-white flex items-center justify-center ${
                    sendOpen ? "bg-cyan-500" : "bg-cyan-500/85 hover:bg-cyan-400"
                  }`}
                  data-testid={`rs-tile-send-${nodeId}-${item.index}`}
                >
                  <Send className="w-2.5 h-2.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Send to…</TooltipContent>
            </Tooltip>
            {sendOpen && (
              <div
                className="absolute bottom-7 right-0 w-40 rounded-lg border border-white/10 bg-[#13151c]/95 backdrop-blur-xl shadow-2xl shadow-black/70 overflow-hidden z-30"
                onClick={(e) => e.stopPropagation()}
              >
                {SEND_TARGETS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => onSendTo(key)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-foreground/85 hover:text-foreground hover:bg-white/5 transition-colors"
                    data-testid={`rs-tile-send-${key}-${nodeId}-${item.index}`}
                  >
                    <Icon className="w-2.5 h-2.5 text-cyan-300" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selection indicator */}
      {isDone && (
        <div className="absolute top-1 right-1 z-10 nodrag pointer-events-none">
          {item.selected ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300 fill-cyan-400/30" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-white/40 opacity-0 group-hover/tile:opacity-100 transition-opacity" />
          )}
        </div>
      )}
    </div>
  );
}
