import { useEffect, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { Plus, Minus, Maximize, Crosshair } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ZOOM_STEP = 1.2;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

export default function CanvasControls() {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const [pct, setPct] = useState(Math.round(zoom * 100));

  useEffect(() => {
    setPct(Math.round(zoom * 100));
  }, [zoom]);

  const setZoom = (z: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    rf.zoomTo(clamped, { duration: 180 });
  };

  const onPctSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(pct);
    if (Number.isFinite(n) && n > 0) setZoom(n / 100);
    else setPct(Math.round(zoom * 100));
  };

  return (
    <div
      className="absolute top-4 right-4 z-30 flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-[#13151c]/85 backdrop-blur-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.7)] p-1"
      data-testid="canvas-zoom-controls"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setZoom(zoom / ZOOM_STEP)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors"
            data-testid="button-zoom-out"
          >
            <Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom out</TooltipContent>
      </Tooltip>

      <form onSubmit={onPctSubmit} className="flex items-center">
        <input
          type="text"
          inputMode="numeric"
          value={pct}
          onChange={(e) => setPct(Number(e.target.value.replace(/\D/g, "")) || 0)}
          onBlur={onPctSubmit}
          className="w-9 text-center text-[10.5px] font-mono bg-transparent text-foreground/85 focus:outline-none focus:bg-white/5 rounded-md py-1 tracking-tight"
          data-testid="input-zoom-pct"
        />
        <span className="text-[10px] text-muted-foreground/55 -ml-1 mr-1 select-none">%</span>
      </form>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setZoom(zoom * ZOOM_STEP)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors"
            data-testid="button-zoom-in"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => rf.fitView({ padding: 0.2, duration: 220 })}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors"
            data-testid="button-fit-view"
          >
            <Maximize className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Fit view</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => rf.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 220 })}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors"
            data-testid="button-reset-view"
          >
            <Crosshair className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Reset (100%)</TooltipContent>
      </Tooltip>
    </div>
  );
}
