import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AtSign, Loader2 } from "lucide-react";
import type { PromptNodeData } from "./types";
import NodeActions from "./NodeActions";

type Raw = Partial<PromptNodeData> & {
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

export default function PromptNode({ id, data, selected }: NodeProps) {
  const raw = (data ?? {}) as Raw;
  const d: PromptNodeData = {
    text: raw.text ?? "",
    inheritedRefs: raw.inheritedRefs ?? [],
    onChange: raw.onChange ?? (() => {}),
  };
  const onDelete = raw.onDelete ?? (() => {});
  const onDuplicate = raw.onDuplicate ?? (() => {});

  const refs = d.inheritedRefs ?? [];
  const anyRefLoading = refs.some((r) => !r.ready);

  return (
    <div
      className={`group/node relative w-64 rounded-2xl backdrop-blur-xl bg-[#15171f]/85 border transition-all duration-200 ${
        selected
          ? "border-amber-300/55 shadow-[0_0_0_1px_rgba(252,211,77,0.35),0_18px_50px_-12px_rgba(252,211,77,0.30)]"
          : "border-white/[0.07] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] hover:border-white/15"
      }`}
      data-testid={`node-prompt-${id}`}
    >
      <div
        aria-hidden
        className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/55 to-transparent"
      />

      <NodeActions nodeId={id} onDuplicate={onDuplicate} onDelete={onDelete} />

      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_2px_rgba(252,211,77,0.45)]" />
        <span className="text-[11px] font-medium text-foreground/95 tracking-tight">Instructions</span>
      </div>

      <div className="px-2.5 pb-2.5 space-y-2">
        {/* Inherited references from a downstream generate node */}
        {refs.length > 0 && (
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-1.5">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-foreground/70 font-semibold mb-1">
              <AtSign className="w-2 h-2" />
              <span>Refs from target</span>
              {anyRefLoading && (
                <span className="ml-auto inline-flex items-center gap-1 text-amber-300/85 normal-case">
                  <Loader2 className="w-2 h-2 animate-spin" />
                  loading
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {refs.map((ref) => (
                <span
                  key={ref.id}
                  className={`inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full border text-[9.5px] ${
                    ref.kind === "generateImage"
                      ? "bg-[#7c5cff]/[0.10] border-[#7c5cff]/25 text-[#c4b5fd]"
                      : "bg-sky-400/[0.08] border-sky-400/25 text-sky-200"
                  }`}
                  data-testid={`prompt-inherited-ref-${ref.id}`}
                >
                  {ref.thumbnail ? (
                    <img
                      src={ref.thumbnail}
                      alt=""
                      className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-white/15"
                    />
                  ) : (
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                        ref.kind === "generateImage" ? "bg-[#7c5cff]/30" : "bg-sky-400/30"
                      }`}
                    >
                      <AtSign className="w-2 h-2 text-white/85" />
                    </div>
                  )}
                  <span className="font-mono">{ref.mention}</span>
                </span>
              ))}
            </div>
            <div className="text-[9px] text-foreground/55 mt-1 leading-relaxed">
              Use these mentions in your prompt below.
            </div>
          </div>
        )}

        <textarea
          value={d.text}
          onChange={(e) => d.onChange(id, e.target.value)}
          placeholder={
            refs.length > 0
              ? "Describe what to generate. Use @ref1, @ref2 to cite the references shown above."
              : "Describe what to generate…"
          }
          rows={5}
          className="w-full text-[11px] leading-relaxed bg-[#0f1117] border border-white/10 rounded-md px-2 py-2 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-amber-300/40 resize-none nodrag transition-colors"
          data-testid={`textarea-prompt-${id}`}
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="prompt"
        className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-amber-300 hover:!w-3 hover:!h-3 transition-all"
      />
    </div>
  );
}
