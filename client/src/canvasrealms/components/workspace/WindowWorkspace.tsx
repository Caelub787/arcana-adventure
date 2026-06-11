import { useCallback, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useAppStore, type PaneTree, collectLeaves } from "@cr/lib/store";
import { DocumentPane } from "./DocumentPane";
import { hasSidebarNodeDrag, getSidebarNodeDrag } from "@cr/lib/drag";
import { LayoutGrid, Layers, X } from "lucide-react";
import { useMediaQuery } from "@cr/lib/useMediaQuery";
import {
  useListNodes,
  getListNodesQueryKey,
  type Node as ApiNode,
} from "@workspace/api-client-react";
import { cn } from "@cr/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@cr/components/ui/sheet";

function renderTree(
  tree: PaneTree,
  setSplitRatio: (id: string, ratio: number) => void,
  lastRatiosRef: React.MutableRefObject<Map<string, number>>,
): React.ReactNode {
  if (tree.kind === "leaf") {
    return <DocumentPane paneId={tree.id} nodeId={tree.nodeId} />;
  }
  const sizeA = Math.max(10, Math.min(90, tree.ratio * 100));
  const sizeB = 100 - sizeA;
  return (
    <PanelGroup
      // Stable id so react-resizable-panels can identify this group across
      // re-renders when the tree object is rebuilt. Without an id, RRP
      // treats every render as a brand-new group and replays its initial
      // layout pass — which fights with sibling updates and visibly jumps
      // when 3+ panes are open.
      id={tree.id}
      direction={tree.direction === "h" ? "horizontal" : "vertical"}
      onLayout={(sizes) => {
        if (sizes.length !== 2) return;
        const newRatio = sizes[0] / 100;
        // Compare against the last ratio we recorded for THIS group, not
        // against `tree.ratio` (which is the pre-render value). This keeps
        // us from echoing onLayout events back into setSplitRatio after a
        // sibling state update triggers a re-layout with the same ratios.
        const prev = lastRatiosRef.current.get(tree.id) ?? tree.ratio;
        if (Math.abs(prev - newRatio) < 0.005) return;
        lastRatiosRef.current.set(tree.id, newRatio);
        setSplitRatio(tree.id, newRatio);
      }}
    >
      <Panel id={`${tree.id}:a`} order={1} defaultSize={sizeA} minSize={10}>
        {renderTree(tree.a, setSplitRatio, lastRatiosRef)}
      </Panel>
      <PanelResizeHandle
        className={
          tree.direction === "h"
            ? "w-px bg-transparent hover:bg-primary/30 transition-colors"
            : "h-px bg-transparent hover:bg-primary/30 transition-colors"
        }
      />
      <Panel id={`${tree.id}:b`} order={2} defaultSize={sizeB} minSize={10}>
        {renderTree(tree.b, setSplitRatio, lastRatiosRef)}
      </Panel>
    </PanelGroup>
  );
}

function MobileSinglePane({
  tree,
  realmNodes,
}: {
  tree: PaneTree;
  realmNodes: ApiNode[] | undefined;
}) {
  const { focusedPaneId, setFocusedPane, closePane } = useAppStore();
  const leaves = collectLeaves(tree);
  const focusedIndex = Math.max(
    0,
    leaves.findIndex((l) => l.id === focusedPaneId),
  );
  const focused = leaves[focusedIndex] ?? leaves[0];
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [paneListOpen, setPaneListOpen] = useState(false);
  if (!focused) return null;

  const nodeFor = (nodeId: string) => realmNodes?.find((n) => n.id === nodeId);
  const titleFor = (nodeId: string) => nodeFor(nodeId)?.title ?? "Untitled";
  const kindFor = (nodeId: string) => nodeFor(nodeId)?.kind ?? "node";

  // Swipe horizontally between open panes (mobile carousel). Threshold of 60px
  // and dominant horizontal motion to avoid hijacking vertical scroll.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0 && focusedIndex < leaves.length - 1) {
      setFocusedPane(leaves[focusedIndex + 1].id);
    } else if (dx > 0 && focusedIndex > 0) {
      setFocusedPane(leaves[focusedIndex - 1].id);
    }
  };

  return (
    <div className="absolute inset-0 pt-topbar flex flex-col">
      {leaves.length > 1 && (
        <div className="flex items-stretch gap-1 px-2 py-1.5 border-b border-border bg-muted/30 flex-shrink-0">
          <button
            onClick={() => setPaneListOpen(true)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-background text-muted-foreground hover:text-foreground transition-colors min-h-[32px] flex-shrink-0"
            aria-label={`Show all open panes (${leaves.length})`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="font-medium">{leaves.length}</span>
          </button>
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {leaves.map((l, i) => (
              <div key={l.id} className="flex items-center flex-shrink-0">
                <button
                  onClick={() => setFocusedPane(l.id)}
                  className={cn(
                    "text-xs px-2.5 py-1.5 rounded-l-md max-w-[140px] truncate transition-colors min-h-[32px]",
                    l.id === focused.id
                      ? "bg-primary/20 text-primary"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="opacity-50 mr-1">{i + 1}/{leaves.length}</span>
                  {titleFor(l.nodeId)}
                </button>
                <button
                  onClick={() => closePane(l.id)}
                  className={cn(
                    "text-base leading-none px-2 py-1.5 rounded-r-md transition-colors min-h-[32px]",
                    l.id === focused.id
                      ? "bg-primary/20 text-primary hover:bg-destructive/30 hover:text-destructive"
                      : "bg-background text-muted-foreground/60 hover:text-destructive",
                  )}
                  aria-label="Close pane"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        className="flex-1 relative overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <DocumentPane paneId={focused.id} nodeId={focused.nodeId} />
      </div>
      <Sheet open={paneListOpen} onOpenChange={setPaneListOpen}>
        <SheetContent
          side="bottom"
          className="p-0 max-h-[75vh] flex flex-col rounded-t-xl"
        >
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
            <SheetTitle className="text-base">
              Open panes ({leaves.length})
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-1">
            {leaves.map((l, i) => (
              <div
                key={l.id}
                className={cn(
                  "flex items-stretch border-b border-border/50 last:border-b-0",
                  l.id === focused.id && "bg-primary/10",
                )}
              >
                <button
                  onClick={() => {
                    setFocusedPane(l.id);
                    setPaneListOpen(false);
                  }}
                  className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="text-xs font-mono text-muted-foreground/60 w-8 flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-sm font-medium truncate",
                        l.id === focused.id ? "text-primary" : "text-foreground",
                      )}
                    >
                      {titleFor(l.nodeId)}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize mt-0.5">
                      {kindFor(l.nodeId)}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    const wasLast = leaves.length === 1;
                    closePane(l.id);
                    if (wasLast) setPaneListOpen(false);
                  }}
                  className="px-4 flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`Close ${titleFor(l.nodeId)}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function WindowWorkspace() {
  const { paneTree, setSplitRatio, openInFocused, activeRealmId } = useAppStore();
  const isMobile = useMediaQuery("(max-width: 767px)");
  // Tracks the last ratio we wrote per split-group id so onLayout passes
  // triggered by sibling re-renders (rather than real user gestures) are
  // recognized as no-ops and don't echo back into the store.
  const lastRatiosRef = useRef<Map<string, number>>(new Map());

  const { data: realmNodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId && isMobile,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });

  const onEmptyDrop = useCallback(
    (e: React.DragEvent) => {
      const p = getSidebarNodeDrag(e);
      if (!p) return;
      e.preventDefault();
      openInFocused(p.nodeId);
    },
    [openInFocused],
  );

  if (!paneTree) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pt-topbar"
        onDragOver={(e) => {
          if (hasSidebarNodeDrag(e)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={onEmptyDrop}
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
          <LayoutGrid className="w-7 h-7 text-primary" />
        </div>
        <h3 className="font-medium text-foreground mb-1">Empty workspace</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {isMobile
            ? "Tap any node in the library to open it. Long-press a node to choose where it goes."
            : "Click any node in the library to open it as a document. Drag a node onto the left, right, top, or bottom of an open pane to split it. Open a Canvas node to compose multiple nodes visually."}
        </p>
      </div>
    );
  }

  if (isMobile) {
    return <MobileSinglePane tree={paneTree} realmNodes={realmNodes} />;
  }

  return (
    <div className="absolute inset-0 pt-topbar">
      {renderTree(paneTree, setSplitRatio, lastRatiosRef)}
    </div>
  );
}
