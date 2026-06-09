import { useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Sliders,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Wand2,
  Image as ImageIcon,
  Upload,
  X,
  Cpu,
  Loader2,
} from "lucide-react";
import type {
  GenerateModel,
  GenerateNodeBackground,
  GenerateNodeQuality,
  GenerateNodeSize,
  SettingsNodeData,
} from "./types";
import NodeActions from "./NodeActions";

const MAX_BYTES = 8 * 1024 * 1024;

const SIZE_PRESETS: { value: GenerateNodeSize; label: string; Icon: typeof Square }[] = [
  { value: "1024x1024", label: "1:1", Icon: Square },
  { value: "1024x1536", label: "2:3", Icon: RectangleVertical },
  { value: "1536x1024", label: "3:2", Icon: RectangleHorizontal },
  { value: "auto", label: "Auto", Icon: Wand2 },
];
const QUALITY_OPTIONS: GenerateNodeQuality[] = ["auto", "low", "medium", "high"];
const BG_OPTIONS: GenerateNodeBackground[] = ["auto", "opaque", "transparent"];
const MODEL_OPTIONS: { value: GenerateModel; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "gpt-image-1", label: "OpenAI · gpt-image-1" },
  { value: "gemini-2.5-flash-image", label: "Gemini · 2.5 Flash" },
];

type Raw = Partial<SettingsNodeData> & {
  onChange?: (id: string, patch: Partial<SettingsNodeData>) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

export default function SettingsNode({ id, data, selected }: NodeProps) {
  const raw = (data ?? {}) as Raw;
  const d: SettingsNodeData = {
    label: raw.label ?? "Settings",
    model: raw.model ?? "auto",
    size: raw.size ?? "1024x1024",
    quality: raw.quality ?? "auto",
    background: raw.background ?? "auto",
    referenceImageDataUrl: raw.referenceImageDataUrl ?? null,
    referenceImageFilename: raw.referenceImageFilename ?? null,
    textReference: raw.textReference ?? "",
    unifiedPrompt: raw.unifiedPrompt ?? "",
  };
  const onChange = raw.onChange ?? (() => {});
  const onDelete = raw.onDelete ?? (() => {});
  const onDuplicate = raw.onDuplicate ?? (() => {});

  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = (file: File | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Image files only");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Max 8 MB");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      onChange(id, {
        referenceImageDataUrl: String(reader.result),
        referenceImageFilename: file.name,
      });
      setUploading(false);
    };
    reader.onerror = () => {
      setError("Could not read file");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={`group/node relative w-[280px] rounded-2xl backdrop-blur-xl bg-[#15171f]/85 border transition-all duration-200 ${
        selected
          ? "border-emerald-300/55 shadow-[0_0_0_1px_rgba(110,231,183,0.40),0_18px_50px_-12px_rgba(110,231,183,0.40)]"
          : "border-white/[0.07] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] hover:border-white/15"
      }`}
      data-testid={`node-settings-${id}`}
    >
      <div
        aria-hidden
        className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/55 to-transparent"
      />

      <NodeActions nodeId={id} onDuplicate={onDuplicate} onDelete={onDelete} />

      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_2px_rgba(110,231,183,0.55)]" />
        <input
          value={d.label}
          onChange={(e) => onChange(id, { label: e.target.value })}
          className="flex-1 bg-transparent text-[11px] font-medium text-foreground/95 tracking-tight focus:outline-none nodrag truncate"
          data-testid={`input-settings-label-${id}`}
          aria-label="Settings label"
        />
        <span className="inline-flex items-center gap-1 text-[9.5px] text-emerald-300/85 font-medium uppercase tracking-wider">
          <Sliders className="w-2.5 h-2.5" strokeWidth={2} /> Apply
        </span>
      </div>

      <div className="px-2.5 pb-2.5 space-y-2">
        {/* Model */}
        <div>
          <Label icon={<Cpu className="w-2.5 h-2.5" />}>Model</Label>
          <select
            value={d.model}
            onChange={(e) => onChange(id, { model: e.target.value as GenerateModel })}
            className="w-full text-[11px] bg-[#0f1117] border border-white/10 rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:border-emerald-300/40 nodrag"
            data-testid={`select-settings-model-${id}`}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value} className="bg-[#0f1117] text-foreground">
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Aspect */}
        <div>
          <Label>Aspect</Label>
          <div className="grid grid-cols-4 gap-1">
            {SIZE_PRESETS.map((s) => (
              <button
                key={s.value}
                onClick={() => onChange(id, { size: s.value })}
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-md border transition-all nodrag ${
                  d.size === s.value
                    ? "border-emerald-300/55 bg-emerald-300/10 text-foreground"
                    : "border-white/[0.06] bg-white/[0.025] text-foreground/75 hover:border-white/20 hover:text-foreground"
                }`}
                data-testid={`settings-node-size-${s.value}-${id}`}
              >
                <s.Icon className="w-3 h-3" strokeWidth={1.5} />
                <span className="text-[9px] font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quality + BG */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Quality</Label>
            <select
              value={d.quality}
              onChange={(e) => onChange(id, { quality: e.target.value as GenerateNodeQuality })}
              className="w-full text-[10.5px] bg-[#0f1117] border border-white/10 rounded-md px-1.5 py-1 text-foreground focus:outline-none focus:border-emerald-300/40 nodrag capitalize"
              data-testid={`select-settings-quality-${id}`}
            >
              {QUALITY_OPTIONS.map((q) => (
                <option key={q} value={q} className="bg-[#0f1117] capitalize">
                  {q}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Background</Label>
            <select
              value={d.background}
              onChange={(e) => onChange(id, { background: e.target.value as GenerateNodeBackground })}
              className="w-full text-[10.5px] bg-[#0f1117] border border-white/10 rounded-md px-1.5 py-1 text-foreground focus:outline-none focus:border-emerald-300/40 nodrag capitalize"
              data-testid={`select-settings-bg-${id}`}
            >
              {BG_OPTIONS.map((b) => (
                <option key={b} value={b} className="bg-[#0f1117] capitalize">
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Reference image */}
        <div>
          <Label icon={<ImageIcon className="w-2.5 h-2.5" />}>Reference image</Label>
          {d.referenceImageDataUrl ? (
            <div className="relative rounded-md overflow-hidden border border-white/10">
              <img src={d.referenceImageDataUrl} alt="" className="w-full h-20 object-cover" />
              <button
                onClick={() => onChange(id, { referenceImageDataUrl: null, referenceImageFilename: null })}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-red-500/85 nodrag"
                data-testid={`settings-remove-ref-${id}`}
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent text-[9px] text-white/90 truncate">
                {d.referenceImageFilename ?? "image"}
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full h-16 rounded-md border border-dashed border-white/15 bg-white/[0.025] hover:border-emerald-300/40 hover:bg-emerald-300/[0.04] flex flex-col items-center justify-center gap-1 text-foreground/75 nodrag transition-all"
              data-testid={`settings-upload-ref-${id}`}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
              ) : (
                <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              <span className="text-[10px]">{uploading ? "Loading…" : "Upload reference"}</span>
            </button>
          )}
          {error && <div className="text-[9.5px] text-red-300 mt-1">{error}</div>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>

        {/* Text reference */}
        <div>
          <Label>Text reference</Label>
          <textarea
            value={d.textReference}
            onChange={(e) => onChange(id, { textReference: e.target.value })}
            rows={2}
            placeholder="Brand voice, style notes…"
            className="w-full text-[11px] bg-[#0f1117] border border-white/10 rounded-md px-2 py-1.5 text-foreground placeholder:text-foreground/35 focus:outline-none focus:border-emerald-300/40 resize-none nodrag"
            data-testid={`textarea-settings-textref-${id}`}
          />
        </div>

        {/* Unified prompt */}
        <div>
          <Label>Unified prompt</Label>
          <textarea
            value={d.unifiedPrompt}
            onChange={(e) => onChange(id, { unifiedPrompt: e.target.value })}
            rows={3}
            placeholder="Wrap every connected prompt with this instruction…"
            className="w-full text-[11px] bg-[#0f1117] border border-white/10 rounded-md px-2 py-1.5 text-foreground placeholder:text-foreground/35 focus:outline-none focus:border-emerald-300/40 resize-none nodrag"
            data-testid={`textarea-settings-prompt-${id}`}
          />
        </div>

        <div className="text-[9.5px] text-foreground/55 leading-relaxed border-t border-white/5 pt-1.5">
          Connect to any generate or extractor node to apply.
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="settings"
        className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-emerald-300 hover:!w-3 hover:!h-3 transition-all"
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
