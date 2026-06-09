import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Loader2, AlertCircle, Wand2, Image as ImageIcon, Eye } from "lucide-react";
import type { StyleExtractorNodeData } from "./types";
import NodeActions from "./NodeActions";

type Raw = Partial<StyleExtractorNodeData> & {
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

export default function StyleExtractorNode({ id, data, selected }: NodeProps) {
  const raw = (data ?? {}) as Raw;
  const d: StyleExtractorNodeData = {
    label: raw.label ?? "Style Extractor",
    text: raw.text ?? "",
    status: raw.status ?? "idle",
    error: raw.error ?? null,
    sourceImageDataUrl: raw.sourceImageDataUrl ?? null,
    sourceLabel: raw.sourceLabel ?? null,
    onExtract: raw.onExtract ?? (() => {}),
    onTextChange: raw.onTextChange ?? (() => {}),
  };
  const onDelete = raw.onDelete ?? (() => {});
  const onDuplicate = raw.onDuplicate ?? (() => {});

  const isRunning = d.status === "running";
  const isError = d.status === "error";
  const hasSource = !!d.sourceImageDataUrl;

  return (
    <div
      className={`group/node relative w-[280px] rounded-2xl backdrop-blur-xl bg-[#15171f]/85 border transition-all duration-200 ${
        selected
          ? "border-fuchsia-300/55 shadow-[0_0_0_1px_rgba(240,171,252,0.40),0_18px_50px_-12px_rgba(240,171,252,0.40)]"
          : "border-white/[0.07] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] hover:border-white/15"
      }`}
      data-testid={`node-styleextract-${id}`}
    >
      <div
        aria-hidden
        className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-300/55 to-transparent"
      />

      <NodeActions nodeId={id} onDuplicate={onDuplicate} onDelete={onDelete} />

      {/* Image input on the left */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-sky-400 hover:!w-3 hover:!h-3 transition-all"
      />

      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_8px_2px_rgba(240,171,252,0.55)]" />
        <span className="flex-1 text-[11px] font-medium text-foreground/95 tracking-tight truncate">
          {d.label}
        </span>
        <button
          onClick={() => d.onExtract(id)}
          disabled={isRunning || !hasSource}
          className={`flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-medium transition-all nodrag ${
            isRunning || !hasSource
              ? "bg-white/5 text-foreground/40 cursor-not-allowed"
              : "bg-gradient-to-b from-fuchsia-400 to-fuchsia-500 text-white shadow-[0_4px_14px_-2px_rgba(232,121,249,0.55)] hover:from-fuchsia-300 hover:to-fuchsia-400"
          }`}
          data-testid={`button-extract-${id}`}
          title={!hasSource ? "Connect an image first" : "Extract style"}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Reading</span>
            </>
          ) : (
            <>
              <Wand2 className="w-2.5 h-2.5" />
              <span>{d.text ? "Re-extract" : "Extract"}</span>
            </>
          )}
        </button>
      </div>

      <div className="px-2.5 pb-2.5 space-y-2">
        {/* Source preview */}
        <div className="rounded-md border border-white/[0.07] bg-white/[0.02] p-1.5 flex items-center gap-2">
          {d.sourceImageDataUrl ? (
            <img src={d.sourceImageDataUrl} alt="" className="w-10 h-10 rounded object-cover ring-1 ring-white/10" />
          ) : (
            <div className="w-10 h-10 rounded bg-white/[0.04] border border-dashed border-white/15 flex items-center justify-center">
              <ImageIcon className="w-3 h-3 text-foreground/55" strokeWidth={1.5} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-foreground/65 font-semibold flex items-center gap-1">
              <Eye className="w-2.5 h-2.5" />
              <span>Source</span>
            </div>
            <div className="text-[10.5px] text-foreground/85 truncate">
              {d.sourceLabel || (hasSource ? "Connected image" : "Connect an image →")}
            </div>
          </div>
        </div>

        {/* Result text */}
        {isError ? (
          <div className="rounded-md border border-red-400/30 bg-red-500/[0.08] p-2 flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 text-red-300 mt-0.5 flex-shrink-0" />
            <span className="text-[10px] text-red-200 leading-relaxed">{d.error || "Extraction failed"}</span>
          </div>
        ) : (
          <textarea
            value={d.text}
            onChange={(e) => d.onTextChange(id, e.target.value)}
            rows={6}
            placeholder={
              isRunning
                ? "Analyzing image…"
                : hasSource
                ? "Click Extract to generate a professional prompt from the connected image."
                : "Output prompt appears here after extraction."
            }
            disabled={isRunning}
            className="w-full text-[11px] leading-relaxed bg-[#0f1117] border border-white/10 rounded-md px-2 py-1.5 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-fuchsia-300/40 resize-none nodrag"
            data-testid={`textarea-styleextract-${id}`}
          />
        )}

        <div className="text-[9.5px] text-foreground/55 leading-relaxed border-t border-white/5 pt-1.5">
          Connect the output to a generate node's prompt input.
        </div>
      </div>

      {/* Prompt output on the right (compatible with generate "prompt" handle) */}
      <Handle
        type="source"
        position={Position.Right}
        id="prompt"
        className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-amber-300 hover:!w-3 hover:!h-3 transition-all"
      />
    </div>
  );
}
