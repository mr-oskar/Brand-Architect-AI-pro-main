import { Copy, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  nodeId: string;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Position relative to the node — floats above the top-right corner. */
  className?: string;
};

/**
 * Floating duplicate / delete buttons placed just outside a node's top-right
 * corner. Visible on hover or when the node is selected.
 */
export default function NodeActions({ nodeId, onDuplicate, onDelete, className = "" }: Props) {
  return (
    <div
      className={`absolute -top-3 -right-3 z-20 flex items-center gap-1 rounded-lg bg-[#0d0f15]/95 backdrop-blur-xl border border-white/10 shadow-[0_6px_18px_-4px_rgba(0,0,0,0.7)] p-0.5 opacity-0 group-hover/node:opacity-100 nodrag transition-opacity ${className}`}
      data-testid={`node-actions-${nodeId}`}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(nodeId);
            }}
            className="w-6 h-6 rounded-md flex items-center justify-center text-foreground/85 hover:text-white hover:bg-white/10 transition-colors"
            data-testid={`node-action-duplicate-${nodeId}`}
            aria-label="Duplicate node"
          >
            <Copy className="w-3 h-3" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Duplicate</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this node?")) onDelete(nodeId);
            }}
            className="w-6 h-6 rounded-md flex items-center justify-center text-foreground/85 hover:text-red-200 hover:bg-red-500/20 transition-colors"
            data-testid={`node-action-delete-${nodeId}`}
            aria-label="Delete node"
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>
    </div>
  );
}
