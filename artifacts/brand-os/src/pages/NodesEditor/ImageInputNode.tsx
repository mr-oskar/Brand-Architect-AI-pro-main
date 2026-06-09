import { useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Image as ImageIcon, Upload, X, Maximize2, RotateCw, Loader2 } from "lucide-react";
import type { ImageNodeData } from "./types";
import ImageLightbox from "@/components/ImageLightbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import NodeActions from "./NodeActions";

const MAX_BYTES = 8 * 1024 * 1024;

function approxBytesFromDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

type Raw = ImageNodeData & {
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

export default function ImageInputNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as Raw;
  const onDelete = d.onDelete ?? (() => {});
  const onDuplicate = d.onDuplicate ?? (() => {});
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isUploading = !!d.uploading;

  const handleSelect = (file: File | null) => {
    if (!file) return;
    setLocalError(null);
    if (!file.type.startsWith("image/")) {
      setLocalError("Image files only");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Max 8 MB");
      return;
    }
    d.onUploadingChange(id, true);
    const reader = new FileReader();
    reader.onload = () => {
      d.onChange(id, String(reader.result), file.name);
      d.onUploadingChange(id, false);
    };
    reader.onerror = () => {
      setLocalError("Could not read file");
      d.onUploadingChange(id, false);
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleSelect(file);
  };

  const sizeBytes = d.imageDataUrl ? approxBytesFromDataUrl(d.imageDataUrl) : null;

  return (
    <>
      <div
        className={`group/node relative w-56 rounded-2xl backdrop-blur-xl bg-[#15171f]/85 border transition-all duration-200 ${
          selected
            ? "border-[#7c5cff]/55 shadow-[0_0_0_1px_rgba(124,92,255,0.35),0_18px_50px_-12px_rgba(124,92,255,0.35)]"
            : "border-white/[0.07] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] hover:border-white/15"
        }`}
        data-testid={`node-image-${id}`}
      >
        {/* Hairline accent */}
        <div
          aria-hidden
          className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent"
        />

        <NodeActions nodeId={id} onDuplicate={onDuplicate} onDelete={onDelete} />

        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_2px_rgba(56,189,248,0.45)]" />
          <span className="flex-1 text-[11px] font-medium text-foreground/95 truncate tracking-tight">
            {d.label}
          </span>
          {d.imageDataUrl && !isUploading && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-5 h-5 rounded-md flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors nodrag"
                  data-testid={`button-replace-${id}`}
                >
                  <RotateCw className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Replace</TooltipContent>
            </Tooltip>
          )}
          {isUploading && <Loader2 className="w-3 h-3 text-sky-300 animate-spin" />}
        </div>

        <div className="px-2.5 pb-2.5 space-y-1.5">
          {isUploading ? (
            <div className="w-full h-32 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] flex flex-col items-center justify-center gap-2 nodrag">
              <Loader2 className="w-5 h-5 text-sky-300 animate-spin" />
              <span className="text-[10px] text-sky-200/80 tracking-wide">Loading file</span>
            </div>
          ) : d.imageDataUrl ? (
            <div className="relative group/img rounded-xl overflow-hidden bg-black/40">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full h-32 nodrag cursor-zoom-in"
                data-testid={`button-preview-image-${id}`}
              >
                <img
                  src={d.imageDataUrl}
                  alt="reference"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-[1.04]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity" />
                <div className="absolute bottom-1.5 left-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/55 backdrop-blur-sm text-white opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <Maximize2 className="w-2.5 h-2.5" />
                </div>
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => d.onChange(id, null, null)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/65 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all hover:bg-red-500/85 nodrag"
                    aria-label="Remove image"
                    data-testid={`button-remove-image-${id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Remove</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`w-full h-32 rounded-xl border border-dashed transition-all flex flex-col items-center justify-center gap-1.5 nodrag ${
                dragOver
                  ? "border-sky-400/60 bg-sky-500/[0.08] text-sky-200"
                  : "border-white/10 bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04] text-muted-foreground"
              }`}
              data-testid={`button-upload-${id}`}
            >
              <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
                {dragOver ? <Upload className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
              </div>
              <span className="text-[10.5px]">{dragOver ? "Drop image here" : "Click or drop"}</span>
              <span className="text-[9px] text-muted-foreground/55">PNG · JPG · WebP · 8 MB</span>
            </button>
          )}
          <div className="flex items-center justify-between px-1.5 text-[9.5px] text-foreground/75 gap-2">
            <span className="truncate flex-1">
              {localError ? <span className="text-red-300">{localError}</span> : d.filename || "No file"}
            </span>
            {sizeBytes != null && !isUploading && (
              <span className="font-mono text-foreground/55 flex-shrink-0">
                {sizeBytes < 1024 * 1024
                  ? `${(sizeBytes / 1024).toFixed(0)} KB`
                  : `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`}
              </span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id="image"
          className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-sky-400 hover:!w-3 hover:!h-3 transition-all"
        />
      </div>

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        src={d.imageDataUrl}
        title={d.label}
        filename={d.filename ?? `${d.label}.png`}
        meta={{ sizeBytes }}
      />
    </>
  );
}
