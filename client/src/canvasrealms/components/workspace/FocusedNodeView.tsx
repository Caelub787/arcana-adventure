import { useEffect } from "react";
import { useGetNode, getGetNodeQueryKey } from "@workspace/api-client-react";
import { Loader2, Minimize2 } from "lucide-react";
import { useAppStore } from "@cr/lib/store";
import { DocumentEditor } from "./DocumentEditor";
import { CanvasPaneBody } from "./CanvasPaneBody";
import { MapNodeView } from "./MapNodeView";

interface Props {
  nodeId: string;
}

// Renders a single node filling the entire workspace area when focus mode
// is active. Unlike DocumentPane, this does not participate in the pane
// tree or split/drop logic — it is a temporary overlay layout. Exiting
// focus restores the previous pane / canvas layout untouched.
export function FocusedNodeView({ nodeId }: Props) {
  const { setFocusedNodeFullscreen } = useAppStore();
  const { data: node, isLoading, error } = useGetNode(nodeId, {
    query: { queryKey: getGetNodeQueryKey(nodeId), retry: false },
  });

  // If the node disappears (deleted / inaccessible) while focused, exit
  // focus mode so the user isn't stuck on an empty surface.
  useEffect(() => {
    if (error) setFocusedNodeFullscreen(null);
  }, [error, setFocusedNodeFullscreen]);

  const isCanvas = node?.kind === "canvas";
  const isMap = node?.kind === "map";

  return (
    <div
      data-pane-root="true"
      className="flex flex-col h-full w-full bg-transparent relative overflow-hidden outline-none pt-topbar"
    >
      {!node && isLoading && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading node...
        </div>
      )}
      {!node && !isLoading && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          This node is no longer available.
        </div>
      )}
      {node && isCanvas && (
        <CanvasPaneBody canvasNode={node} paneId={`focus-${nodeId}`} />
      )}
      {node && isMap && <MapNodeView node={node} paneId={`focus-${nodeId}`} />}
      {node && !isCanvas && !isMap && (
        <DocumentEditor
          node={node}
          paneId={`focus-${nodeId}`}
          isFocusedPane
          onClosePane={() => setFocusedNodeFullscreen(null)}
        />
      )}
      {/* For canvas / map kinds, the underlying view doesn't expose a
          focus toggle in its own chrome, so render a top-right exit
          control here. Document kinds already have their own focus
          toggle inside the editor header. */}
      {node && (isCanvas || isMap) && (
        <button
          type="button"
          onClick={() => setFocusedNodeFullscreen(null)}
          title="Exit focus mode"
          aria-label="Exit focus mode"
          style={{ top: "calc(var(--app-topbar-h) + 0.5rem)" }}
          className="absolute right-2 z-40 h-7 w-7 rounded-full flex items-center justify-center bg-card/90 border border-border shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
