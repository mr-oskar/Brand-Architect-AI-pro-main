import { useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Loader2,
  AlertCircle,
  Download,
  Play,
  AtSign,
  Maximize2,
  Image as ImageIcon,
  Send,
  Palette,
  Briefcase,
  Library,
  Megaphone,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Wand2,
} from "lucide-react";
import type {
  BrandFull,
  GenerateModel,
  GenerateNodeBackground,
  GenerateNodeData,
  GenerateNodeQuality,
  GenerateNodeSize,
  SettingsNodeData,
} from "./types";
import ImageLightbox from "@/components/ImageLightbox";
import { pushExport, type ExportTarget } from "@/lib/nodesExport";
import { notifySuccess, notifyError } from "@/lib/apiError";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import NodeActions from "./NodeActions";

const SEND_TARGETS: { key: ExportTarget; label: string; Icon: typeof Palette }[] = [
  { key: "design-studio", label: "Design Studio", Icon: Palette },
  { key: "brand-kit", label: "Brand Kit", Icon: Briefcase },
  { key: "assets", label: "Assets Library", Icon: Library },
  { key: "campaign", label: "New Campaign", Icon: Megaphone },
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

export default function GenerateImageNode({ id, data, selected }: NodeProps) {
  const raw = (data ?? {}) as Partial<GenerateNodeData> & {
    onSettingsChange?: (id: string, patch: Partial<GenerateNodeData>) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
  };
  const d: GenerateNodeData = {
    prompt: raw.prompt ?? "",
    status: raw.status ?? "idle",
    resultUrl: raw.resultUrl ?? null,
    error: raw.error ?? null,
    references: raw.references ?? [],
    size: raw.size ?? "1024x1024",
    quality: raw.quality ?? "auto",
    background: raw.background ?? "auto",
    model: raw.model ?? "auto",
    label: raw.label ?? "Generate",
    inheritedSettings: raw.inheritedSettings ?? null,
    inheritedBrand: raw.inheritedBrand ?? null,
    onPromptChange: raw.onPromptChange ?? (() => {}),
    onRun: raw.onRun ?? (() => {}),
  };
  const onSettingsChange = raw.onSettingsChange ?? (() => {});
  const onDelete = raw.onDelete ?? (() => {});
  const onDuplicate = raw.onDuplicate ?? (() => {});

  // Effective settings (settings node overrides local)
  const inh: SettingsNodeData | null = d.inheritedSettings ?? null;
  const inhBrand: BrandFull | null = d.inheritedBrand ?? null;
  const effSize = inh?.size ?? d.size ?? "1024x1024";
  const effQuality = inh?.quality ?? d.quality ?? "auto";
  const effBackground = inh?.background ?? d.background ?? "auto";
  const effModel = inh?.model ?? d.model ?? "auto";

  const isRunning = d.status === "running";
  const isDone = d.status === "done" && !!d.resultUrl;
  const isError = d.status === "error";

  const anyRefUploading = d.references.some((r) => !r.ready);
  const runDisabled = isRunning || anyRefUploading;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const sendMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSend && !showSettings) return;
    const onDocClick = (e: MouseEvent) => {
      if (showSend && sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) {
        setShowSend(false);
      }
      if (showSettings && settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showSend, showSettings]);

  const insertMention = (mention: string) => {
    const el = textareaRef.current;
    const current = d.prompt || "";
    if (!el) {
      d.onPromptChange(id, `${current}${current && !current.endsWith(" ") ? " " : ""}${mention} `);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const padBefore = before.length === 0 || before.endsWith(" ") ? "" : " ";
    const padAfter = after.length === 0 || after.startsWith(" ") ? "" : " ";
    const next = `${before}${padBefore}${mention}${padAfter}${after}`;
    d.onPromptChange(id, next);
    requestAnimationFrame(() => {
      const pos = (before + padBefore + mention + padAfter).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const downloadImage = () => {
    if (!d.resultUrl) return;
    try {
      const a = document.createElement("a");
      a.href = d.resultUrl;
      a.download = `nodes-${id}-${Date.now()}.png`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notifySuccess("Download started");
    } catch (err) {
      notifyError("Download failed", err);
    }
  };

  const copyUrl = async () => {
    if (!d.resultUrl) return;
    try {
      await navigator.clipboard.writeText(d.resultUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      notifyError("Copy failed", err);
    }
  };

  const handleSendTo = (target: ExportTarget) => {
    if (!d.resultUrl) return;
    pushExport(target, { imageUrl: d.resultUrl, prompt: d.prompt });
    setShowSend(false);
  };

  const SizeIcon = SIZE_PRESETS.find((s) => s.value === effSize)?.Icon ?? Square;

  return (
    <>
      <div
        className={`group/node relative w-[300px] rounded-2xl backdrop-blur-xl bg-[#15171f]/85 border transition-all duration-200 ${
          selected
            ? "border-[#7c5cff]/55 shadow-[0_0_0_1px_rgba(124,92,255,0.40),0_24px_60px_-16px_rgba(124,92,255,0.50)]"
            : "border-white/[0.07] shadow-[0_12px_36px_-12px_rgba(0,0,0,0.7)] hover:border-white/15"
        }`}
        data-testid={`node-generate-${id}`}
      >
        {/* Hairline accent */}
        <div
          aria-hidden
          className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-[#a78bfa]/55 to-transparent"
        />

        <NodeActions nodeId={id} onDuplicate={onDuplicate} onDelete={onDelete} />

        {/* Connection handles */}
        <Handle
          type="target"
          position={Position.Left}
          id="references"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-sky-400 hover:!w-3 hover:!h-3 transition-all"
          style={{ top: "18%" }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="prompt"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-amber-300 hover:!w-3 hover:!h-3 transition-all"
          style={{ top: "44%" }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="brand"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-orange-300 hover:!w-3 hover:!h-3 transition-all"
          style={{ top: "68%" }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="settings"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-emerald-300 hover:!w-3 hover:!h-3 transition-all"
          style={{ top: "90%" }}
        />

        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] shadow-[0_0_8px_2px_rgba(167,139,250,0.45)]" />
          <span className="flex-1 text-[11px] font-medium text-foreground/95 tracking-tight truncate">
            {d.label}
          </span>
          {inh && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-300 bg-emerald-300/10 border border-emerald-300/30 rounded px-1 py-0.5"
                  data-testid={`generate-inherited-badge-${id}`}
                >
                  <Sliders className="w-2 h-2" />
                  <span>SET</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Settings inherited from "{inh.label}"
              </TooltipContent>
            </Tooltip>
          )}
          {inhBrand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-0.5 text-[9px] font-medium text-orange-300 bg-orange-300/10 border border-orange-300/30 rounded px-1 py-0.5"
                  data-testid={`generate-inherited-brand-badge-${id}`}
                >
                  <Briefcase className="w-2 h-2" />
                  <span>BRAND</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Brand identity from "{inhBrand.companyName}"
              </TooltipContent>
            </Tooltip>
          )}
          <span className="text-[9px] font-mono text-foreground/65">5 CU</span>

          {/* Settings button */}
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
                  data-testid={`button-settings-${id}`}
                >
                  <Sliders className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Model settings</TooltipContent>
            </Tooltip>
            {showSettings && (
              <div
                className="absolute top-7 right-0 w-64 rounded-xl border border-white/10 bg-[#13151c]/95 backdrop-blur-xl shadow-2xl shadow-black/70 z-30 overflow-hidden"
                data-testid={`menu-settings-${id}`}
              >
                <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
                  <Sliders className="w-3 h-3 text-foreground/85" />
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-foreground/85">
                    Model settings
                  </span>
                  {inh && (
                    <span className="ml-auto text-[9px] text-emerald-300 font-medium">
                      Overridden by Settings node
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-3">
                  {/* Model */}
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-foreground/65 font-semibold mb-1.5">
                      Model
                    </div>
                    <select
                      value={d.model ?? "auto"}
                      onChange={(e) => onSettingsChange(id, { model: e.target.value as GenerateModel })}
                      disabled={!!inh}
                      className="w-full text-[10.5px] bg-[#0f1117] border border-white/10 rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:border-[#7c5cff]/40 disabled:opacity-60 nodrag"
                      data-testid={`select-generate-model-${id}`}
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value} className="bg-[#0f1117] text-foreground">
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Aspect / size */}
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-foreground/65 font-semibold mb-1.5">
                      Aspect
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {SIZE_PRESETS.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => onSettingsChange(id, { size: s.value })}
                          disabled={!!inh}
                          className={`flex flex-col items-center gap-1 py-1.5 rounded-lg border transition-all disabled:opacity-60 ${
                            effSize === s.value
                              ? "border-[#7c5cff]/55 bg-[#7c5cff]/10 text-foreground"
                              : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
                          }`}
                          data-testid={`settings-size-${s.value}`}
                        >
                          <s.Icon className="w-3 h-3" strokeWidth={1.5} />
                          <span className="text-[9px]">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quality */}
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-foreground/65 font-semibold mb-1.5">
                      Quality
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {QUALITY_OPTIONS.map((q) => (
                        <button
                          key={q.value}
                          onClick={() => onSettingsChange(id, { quality: q.value })}
                          disabled={!!inh}
                          className={`py-1.5 rounded-lg border text-[9.5px] transition-all disabled:opacity-60 ${
                            effQuality === q.value
                              ? "border-[#7c5cff]/55 bg-[#7c5cff]/10 text-foreground"
                              : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
                          }`}
                          data-testid={`settings-quality-${q.value}`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background */}
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-foreground/65 font-semibold mb-1.5">
                      Background
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {BG_OPTIONS.map((b) => (
                        <button
                          key={b.value}
                          onClick={() => onSettingsChange(id, { background: b.value })}
                          disabled={!!inh}
                          className={`py-1.5 rounded-lg border text-[9.5px] transition-all disabled:opacity-60 ${
                            effBackground === b.value
                              ? "border-[#7c5cff]/55 bg-[#7c5cff]/10 text-foreground"
                              : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
                          }`}
                          data-testid={`settings-bg-${b.value}`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-[9.5px] text-foreground/65 leading-relaxed pt-1 border-t border-white/5">
                    Quality and background only apply to OpenAI <span className="font-mono text-foreground/85">gpt-image-1</span>.
                    Gemini ignores them.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Run button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => d.onRun(id)}
                disabled={runDisabled}
                className={`flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-medium transition-all nodrag ${
                  runDisabled
                    ? "bg-white/5 text-muted-foreground/40 cursor-not-allowed"
                    : "bg-gradient-to-b from-[#8b6dff] to-[#6e4cf2] text-white shadow-[0_4px_14px_-2px_rgba(124,92,255,0.55)] hover:from-[#9a7eff] hover:to-[#7d5cff]"
                }`}
                data-testid={`button-run-${id}`}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Running</span>
                  </>
                ) : isDone ? (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    <span>Re-run</span>
                  </>
                ) : (
                  <>
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>Run</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {anyRefUploading ? "Waiting for references…" : isRunning ? "Generating…" : "Run model"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="px-2.5 pb-2.5 space-y-2">
          {/* === IMAGE PREVIEW === */}
          <div className="relative w-full rounded-xl overflow-hidden bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.04)_0%,_rgba(0,0,0,0.4)_100%)] border border-white/[0.06] group/preview">
            {d.resultUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full h-44 nodrag cursor-zoom-in"
                data-testid={`button-preview-${id}`}
              >
                <img
                  src={d.resultUrl}
                  alt="generated"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/preview:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/55 to-transparent opacity-0 group-hover/preview:opacity-100 transition-opacity" />
              </button>
            ) : isRunning ? (
              <div className="flex flex-col items-center justify-center gap-2 h-44 text-muted-foreground">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full blur-xl bg-[#7c5cff]/40 animate-pulse" />
                  <Loader2 className="relative w-6 h-6 animate-spin text-[#a78bfa]" />
                </div>
                <span className="text-[10px] text-[#a78bfa]/85 tracking-wide">Generating</span>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center gap-1.5 h-44 px-3 text-center">
                <div className="w-7 h-7 rounded-full bg-red-500/10 border border-red-400/25 flex items-center justify-center">
                  <AlertCircle className="w-3.5 h-3.5 text-red-300" />
                </div>
                <span className="text-[10px] leading-tight text-red-300/90 line-clamp-3">
                  {d.error || "Generation failed"}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => d.onRun(id)}
                      className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md text-red-100 bg-red-500/15 hover:bg-red-500/30 border border-red-400/30 transition-colors nodrag"
                      data-testid={`button-retry-${id}`}
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Retry</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 h-44 text-muted-foreground/60">
                <div className="w-8 h-8 rounded-full bg-white/[0.025] border border-white/[0.06] flex items-center justify-center">
                  <ImageIcon className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
                </div>
                <span className="text-[10px]">Output appears here</span>
              </div>
            )}

            {/* === Floating action bar (Krea-style at bottom) === */}
            {isDone && (
              <div className="absolute inset-x-0 bottom-0 p-1.5 flex items-center justify-end gap-1 nodrag opacity-0 group-hover/preview:opacity-100 transition-opacity bg-gradient-to-t from-black/70 to-transparent">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setLightboxOpen(true)}
                      className="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur text-white flex items-center justify-center transition-colors"
                      data-testid={`button-expand-${id}`}
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Full view</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={copyUrl}
                      className="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur text-white flex items-center justify-center transition-colors"
                      data-testid={`button-copy-${id}`}
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{copied ? "Copied!" : "Copy URL"}</TooltipContent>
                </Tooltip>
                <div ref={sendMenuRef} className="relative">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowSend((s) => !s)}
                        className={`w-7 h-7 rounded-lg backdrop-blur text-white flex items-center justify-center transition-colors ${
                          showSend ? "bg-[#7c5cff]" : "bg-black/60 hover:bg-black/80"
                        }`}
                        data-testid={`button-send-${id}`}
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Send to…</TooltipContent>
                  </Tooltip>
                  {showSend && (
                    <div
                      className="absolute bottom-8 right-0 w-44 rounded-xl border border-white/10 bg-[#13151c]/95 backdrop-blur-xl shadow-2xl shadow-black/70 overflow-hidden z-30"
                      data-testid={`menu-send-${id}`}
                    >
                      <div className="px-3 py-2 border-b border-white/5 text-[9.5px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                        Send to
                      </div>
                      {SEND_TARGETS.map(({ key, label, Icon }) => (
                        <button
                          key={key}
                          onClick={() => handleSendTo(key)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[10.5px] text-foreground/85 hover:text-foreground hover:bg-white/5 transition-colors"
                          data-testid={`button-send-${key}-${id}`}
                        >
                          <Icon className="w-3 h-3 text-[#a78bfa]" strokeWidth={1.6} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={downloadImage}
                      className="w-7 h-7 rounded-lg bg-[#7c5cff] hover:bg-[#8b6dff] text-white flex items-center justify-center transition-colors shadow-[0_4px_12px_-2px_rgba(124,92,255,0.6)]"
                      data-testid={`button-download-${id}`}
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          {/* Reference chips */}
          {d.references.length > 0 && (
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
                {d.references.map((ref) => (
                  <button
                    key={ref.id}
                    onClick={() => insertMention(ref.mention)}
                    disabled={!ref.ready}
                    className={`group flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full border text-[9.5px] transition-all nodrag disabled:opacity-50 disabled:cursor-wait ${
                      ref.kind === "generateImage"
                        ? "bg-[#7c5cff]/[0.10] hover:bg-[#7c5cff]/[0.18] border-[#7c5cff]/25 hover:border-[#7c5cff]/50 text-[#c4b5fd] hover:text-white"
                        : "bg-sky-400/[0.08] hover:bg-sky-400/[0.16] border-sky-400/25 hover:border-sky-400/50 text-sky-200 hover:text-white"
                    }`}
                    data-testid={`chip-mention-${ref.id}`}
                  >
                    {ref.thumbnail ? (
                      <img src={ref.thumbnail} alt="" className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-white/15" />
                    ) : ref.ready ? (
                      <div
                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                          ref.kind === "generateImage" ? "bg-[#7c5cff]/30" : "bg-sky-400/30"
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

          {/* Prompt */}
          <textarea
            ref={textareaRef}
            value={d.prompt}
            onChange={(e) => d.onPromptChange(id, e.target.value)}
            placeholder={
              d.references.length > 0
                ? "Describe the image. Use @ref1, @ref2 to cite references."
                : "Describe the image, or connect references on the left."
            }
            rows={3}
            className="w-full text-[11px] leading-relaxed bg-[#0f1117] border border-white/10 rounded-md px-2.5 py-2 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-[#7c5cff]/45 resize-none nodrag transition-colors"
            data-testid={`textarea-generate-prompt-${id}`}
          />

          {/* Compact settings strip */}
          <div className="flex items-center gap-1.5 px-1 pt-0.5 text-[9.5px] text-foreground/70">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1 hover:text-foreground transition-colors nodrag"
              data-testid={`button-settings-summary-${id}`}
            >
              <SizeIcon className="w-2.5 h-2.5" strokeWidth={1.5} />
              <span className="font-mono">{effSize}</span>
            </button>
            <span className="text-foreground/40">·</span>
            <button
              onClick={() => setShowSettings(true)}
              className="hover:text-foreground transition-colors capitalize nodrag"
            >
              {effQuality}
            </button>
            {effBackground !== "auto" && (
              <>
                <span className="text-foreground/40">·</span>
                <button
                  onClick={() => setShowSettings(true)}
                  className="hover:text-foreground transition-colors capitalize nodrag"
                >
                  {effBackground}
                </button>
              </>
            )}
            <span className="text-foreground/40">·</span>
            <button
              onClick={() => setShowSettings(true)}
              className="hover:text-foreground transition-colors nodrag"
              title={`Model: ${effModel}`}
            >
              {effModel === "auto" ? "auto" : effModel === "gpt-image-1" ? "OpenAI" : "Gemini"}
            </button>
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id="image"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-emerald-400 hover:!w-3 hover:!h-3 transition-all"
        />
      </div>

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        src={d.resultUrl}
        title="Generated image"
        subtitle={d.prompt ? d.prompt.slice(0, 140) : undefined}
        filename={`nodes-${id}.png`}
      />
    </>
  );
}
