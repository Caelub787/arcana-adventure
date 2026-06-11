import { History as HistoryIcon, Maximize2, Minimize2, X } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@cr/lib/store";

interface Props {
  nodeId: string;
  onClosePane?: () => void;
  className?: string;
}

/**
 * Top-right controls shared by Document, Map, and Canvas panes:
 * focus mode toggle, edit-history placeholder, and close-pane.
 * Render inside a `relative` container; this component is `absolute`
 * positioned at the top-right.
 */
export function PaneControls({ nodeId, onClosePane, className }: Props) {
  const { focusedNodeIdFullscreen, toggleFocusedNode } = useAppStore();
  const isFocused = focusedNodeIdFullscreen === nodeId;
  return (
    <div
      className={`absolute top-1 right-2 z-30 flex items-center gap-1 ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleFocusedNode(nodeId);
        }}
        title={isFocused ? "Exit focus mode" : "Focus mode"}
        aria-label={isFocused ? "Exit focus mode" : "Focus mode"}
        className="h-10 w-10 md:h-6 md:w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        {isFocused ? (
          <Minimize2 className="h-5 w-5 md:h-3.5 md:w-3.5" />
        ) : (
          <Maximize2 className="h-5 w-5 md:h-3.5 md:w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toast.info("Edit history is coming soon");
        }}
        title="Edit history"
        aria-label="Edit history"
        className="h-10 w-10 md:h-6 md:w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <HistoryIcon className="h-5 w-5 md:h-3.5 md:w-3.5" />
      </button>
      {onClosePane && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClosePane();
          }}
          title="Close pane"
          aria-label="Close pane"
          className="h-10 w-10 md:h-6 md:w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive-foreground hover:bg-destructive transition-colors"
        >
          <X className="h-5 w-5 md:h-3.5 md:w-3.5" />
        </button>
      )}
    </div>
  );
}
