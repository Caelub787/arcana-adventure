import { useState, useMemo, useEffect, useRef } from "react";
import { useGetNode, getGetNodeQueryKey } from "@workspace/api-client-react";
import { useAppStore, type SplitEdge } from "@cr/lib/store";
import { Button } from "@cr/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { hasSidebarNodeDrag, getSidebarNodeDrag } from "@cr/lib/drag";
import { registerTouchDropTarget } from "@cr/lib/touchDrag";
import { DocumentEditor } from "./DocumentEditor";
import { CanvasPaneBody } from "./CanvasPaneBody";
import { MapNodeView } from "./MapNodeView";
import { notePaneActive } from "@cr/lib/paneShortcuts";

interface Props {
  paneId: string;
  nodeId: string;
}

export function DocumentPane({ paneId, nodeId }: Props) {
  const {
    closePane,
    splitAtPane,
    setFocusedPane,
    focusedPaneId,
    pendingFocusNodeId,
    consumePendingFocus,
  } = useAppStore();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoFocus = pendingFocusNodeId === nodeId;
  const { data: node, isLoading } = useGetNode(nodeId, {
    query: { queryKey: getGetNodeQueryKey(nodeId), retry: false },
  });

  const [hoverEdge, setHoverEdge] = useState<SplitEdge | null>(null);
  const isFocused = focusedPaneId === paneId;
  const isCanvas = node?.kind === "canvas";
  const isMap = node?.kind === "map";

  const edgeFromEvent = (e: React.DragEvent, rect: DOMRect): SplitEdge => {
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const EDGE = 0.22;
    if (x < EDGE) return "left";
    if (x > 1 - EDGE) return "right";
    if (y < EDGE) return "top";
    if (y > 1 - EDGE) return "bottom";
    return "center";
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!hasSidebarNodeDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    // For canvas/map panes the inner body owns ALL drops within the pane
    // (adds a canvas member / opens on the map). The pane-perimeter
    // edge-split zone used to claim a 22% margin on every side, which
    // overlapped the visible canvas/map area and silently swallowed drops
    // intended for the body. Suppress edge-split detection entirely for
    // these kinds; users can still split via the pane controls or by
    // dropping onto a different pane.
    if (isCanvas || isMap) {
      setHoverEdge(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverEdge(edgeFromEvent(e, rect));
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setHoverEdge(null);
  };

  const onDrop = (e: React.DragEvent) => {
    const payload = getSidebarNodeDrag(e);
    setHoverEdge(null);
    if (!payload) return;
    // Canvas/map panes: never edge-split from drops anywhere inside the
    // pane. The inner body's own drop handler (if any) takes over via
    // event bubbling. This is what makes drops onto canvas members work
    // reliably regardless of where in the pane the user releases.
    if (isCanvas || isMap) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const edge = edgeFromEvent(e, rect);
    e.preventDefault();
    e.stopPropagation();
    // Both "center" (replace) and edge (split) map to splitAtPane against THIS
    // pane's id deterministically — avoids the async-focus race that previously
    // could replace the wrong pane when dropping on a non-focused one.
    splitAtPane(paneId, edge, payload.nodeId);
    // After a center replace, the user expects the now-replaced pane to gain
    // focus. splitAtPane already focuses the new leaf for edge splits; for
    // center we re-focus this pane explicitly since the leaf id is preserved.
    if (edge === "center") setFocusedPane(paneId);
  };

  const overlayClass = useMemo(() => {
    if (!hoverEdge) return null;
    const base = "pointer-events-none absolute z-30 bg-accent/20 border border-accent/60 transition-opacity";
    switch (hoverEdge) {
      case "left":   return `${base} left-0 top-0 bottom-0 w-1/3`;
      case "right":  return `${base} right-0 top-0 bottom-0 w-1/3`;
      case "top":    return `${base} left-0 right-0 top-0 h-1/3`;
      case "bottom": return `${base} left-0 right-0 bottom-0 h-1/3`;
      case "center": return `${base} inset-2 rounded`;
    }
  }, [hoverEdge]);

  // Robust cleanup: a drop event on a sibling pane (or anywhere else) won't
  // fire dragLeave on us reliably. Clear any stale hover overlay on the next
  // global drag-end / drop / escape.
  useEffect(() => {
    if (!hoverEdge) return;
    const clear = () => setHoverEdge(null);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    window.addEventListener("mouseup", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
      window.removeEventListener("mouseup", clear);
    };
  }, [hoverEdge]);

  // For canvas/map kinds, give the body container keyboard focus when this
  // pane was just created. Document kinds focus their title input via the
  // autoFocus prop on DocumentEditor.
  useEffect(() => {
    if (!shouldAutoFocus || !node) return;
    if (isCanvas || isMap) {
      surfaceRef.current?.focus();
      consumePendingFocus(nodeId);
    }
  }, [shouldAutoFocus, node, isCanvas, isMap, nodeId, consumePendingFocus]);

  // Touch drag-and-drop drop target. Mirrors the HTML5 onDrop edge-split
  // math so finger drags from the sidebar can open a node in a split or
  // replace this pane. For canvas/map nodes the inner body registers its
  // own deeper target which handles center drops (add member / pin); this
  // outer target only fires when the drop falls in an edge zone (or on a
  // plain text-doc pane, where no inner target exists).
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    return registerTouchDropTarget({
      el,
      onHover: (active) => {
        if (!active) setHoverEdge(null);
      },
      onDrop: ({ clientX, clientY, payload }) => {
        setHoverEdge(null);
        // Mirror the HTML5 handler: canvas/map panes never edge-split
        // from a finger-drop. Their inner body registers its own deeper
        // touch drop target which handles the drop.
        if (isCanvas || isMap) return;
        const rect = el.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        const EDGE = 0.22;
        let edge: SplitEdge = "center";
        if (x < EDGE) edge = "left";
        else if (x > 1 - EDGE) edge = "right";
        else if (y < EDGE) edge = "top";
        else if (y > 1 - EDGE) edge = "bottom";
        splitAtPane(paneId, edge, payload.nodeId);
        if (edge === "center") setFocusedPane(paneId);
      },
    });
  }, [paneId, splitAtPane, setFocusedPane, isCanvas, isMap]);

  return (
    <div
      ref={surfaceRef}
      tabIndex={-1}
      data-pane-root="true"
      className="flex flex-col h-full w-full bg-transparent relative overflow-hidden outline-none"
      onClick={() => {
        setFocusedPane(paneId);
        notePaneActive(paneId);
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
        <CanvasPaneBody
          canvasNode={node}
          paneId={paneId}
          onClosePane={() => closePane(paneId)}
        />
      )}
      {node && isMap && (
        <MapNodeView
          node={node}
          paneId={paneId}
          onClosePane={() => closePane(paneId)}
        />
      )}
      {node && !isCanvas && !isMap && (
        <DocumentEditor
          node={node}
          paneId={paneId}
          autoFocusTitle={shouldAutoFocus}
          onConsumeAutoFocus={() => consumePendingFocus(nodeId)}
          isFocusedPane={isFocused}
          onClosePane={() => closePane(paneId)}
        />
      )}

      {overlayClass && <div className={overlayClass} />}
    </div>
  );
}
