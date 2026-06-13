import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  collectLeaves,
  decodePaneLayoutFromUrl,
  deserializePaneTree,
  encodePaneLayoutForUrl,
  serializePaneTree,
  useAppStore,
  type PaneTree,
} from "@cr/lib/store";
import { LibrarySidebar } from "@cr/components/sidebar/LibrarySidebar";
import { CompassSidebar } from "@cr/components/sidebar/CompassSidebar";
import { TopBar } from "@cr/components/layout/TopBar";
import { GuideOverlay } from "@cr/components/layout/GuideOverlay";
import { WindowWorkspace } from "@cr/components/workspace/WindowWorkspace";
import { GraphView } from "@cr/components/workspace/GraphView";
import { WikiEditor } from "@cr/components/workspace/WikiEditor";
import { FocusedNodeView } from "@cr/components/workspace/FocusedNodeView";
import { useLocation, useRoute, useSearch } from "wouter";
import {
  useListRealms,
  useListNodes,
  useGetNode,
  getGetNodeQueryKey,
  getListNodesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@cr/components/ui/button";
import { RealmDocProvider } from "@cr/lib/realtime";
import { toast } from "sonner";
import { getPaneHandlers } from "@cr/lib/paneShortcuts";
import { SearchPalette } from "@cr/components/layout/SearchPalette";
import { Sparkles } from "lucide-react";
import { useIsMobile } from "@cr/hooks/use-mobile";

function MaybeRealmDocProvider({
  realmId,
  children,
}: {
  realmId: string | null;
  children: ReactNode;
}) {
  if (!realmId) return <>{children}</>;
  // Keying by realmId tears down the previous Y.Doc + WS when the user
  // switches realms.
  return (
    <RealmDocProvider key={realmId} realmId={realmId}>
      {children}
    </RealmDocProvider>
  );
}

export function MainLayout({ embeddedRealmId }: { embeddedRealmId?: string } = {}) {
  // Embedded mode (campaign-hosted World Builder): the realm is supplied by the
  // host page instead of the URL, and we never touch the browser location.
  const embedded = !!embeddedRealmId;
  const [matchRealm, realmParams] = useRoute("/app/realm/:realmId");
  const [matchNode, nodeParams] = useRoute("/app/realm/:realmId/node/:nodeId");
  const [, setLocation] = useLocation();
  const {
    activeRealmId,
    setActiveRealmId,
    viewMode,
    paneTree,
    focusedPaneId,
    openNodeIds,
    openInFocused,
    closeAllPanes,
    removeNodeFromAllPanes,
    setLayout,
    focusedNodeIdFullscreen,
    setFocusedNodeFullscreen,
  } = useAppStore();

  // Keep an always-current ref to the focused pane id so the window-level
  // shortcut listener (registered once) can read the latest value without
  // re-binding on every focus change.
  const focusedPaneIdRef = useRef<string | null>(focusedPaneId);
  useEffect(() => {
    focusedPaneIdRef.current = focusedPaneId;
  }, [focusedPaneId]);

  const [searchOpen, setSearchOpen] = useState(false);

  const isEditableTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
  }, []);

  // Single app-level keyboard listener for global Cmd/Ctrl+Z, +Y,
  // +Shift+Z (undo/redo, routed to the focused / last-active map pane)
  // and Cmd/Ctrl+F (open node search palette). The per-map surface
  // handler in MapNodeView stops native propagation when it has already
  // consumed the event, so this fallback only runs when no map surface
  // currently owns DOM focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Defensive collision control: if some other handler already
      // claimed this event, don't run app-level shortcuts on top of it.
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const editable = isEditableTarget(e.target);

      if (key === "f") {
        // Inside a text field, let the browser's native Find win — we
        // never want to hijack typing-context search.
        if (editable) return;
        e.preventDefault();
        // Explicit open (not toggle): the shortcut's job is "open the
        // node search". Inside the palette, Escape closes it.
        setSearchOpen(true);
        return;
      }

      // Undo / redo. Skip when typing into a form control so the
      // browser's native text undo still works.
      if (editable) return;
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const handlers = getPaneHandlers(focusedPaneIdRef.current);
      if (!handlers) {
        // No map currently registered — silently no-op. We deliberately
        // do NOT preventDefault so the browser keeps its native behavior
        // (which is also a no-op in this context, but avoids surprising
        // users who expect their browser shortcut to still work).
        return;
      }
      e.preventDefault();
      if (isUndo) handlers.undo();
      else handlers.redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEditableTarget]);

  // Esc exits focus mode globally. Registered once at the layout level so it
  // works whether focus was entered from the Windows pane or a canvas node.
  useEffect(() => {
    if (!focusedNodeIdFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedNodeFullscreen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedNodeIdFullscreen, setFocusedNodeFullscreen]);
  const search = useSearch();
  const { data: realms, isLoading: realmsLoading } = useListRealms();

  const realmIdFromUrl = embedded
    ? embeddedRealmId!
    : matchNode
      ? nodeParams.realmId
      : matchRealm
        ? realmParams.realmId
        : null;
  const nodeIdFromUrl = embedded ? null : matchNode ? nodeParams.nodeId : null;
  // In embedded mode the host vouches for the realm (a campaign player may have
  // access without the realm appearing in their own `useListRealms`), so never
  // flag it as not-found here — realm-scoped queries are authorized server-side.
  const realmNotFound =
    !embedded &&
    !!realmIdFromUrl &&
    !realmsLoading &&
    !!realms &&
    !realms.some((r) => r.id === realmIdFromUrl);

  // Probe the node from the URL so we can show a friendly "not found" state
  // for deep links to deleted/inaccessible nodes — and avoid promoting the
  // missing id into a pane (which would render a broken/empty pane).
  const shouldProbeNode = !!nodeIdFromUrl && !realmNotFound;
  const { error: nodeProbeError, isLoading: nodeProbeLoading } = useGetNode(
    shouldProbeNode ? (nodeIdFromUrl as string) : "",
    {
      query: {
        queryKey: getGetNodeQueryKey(nodeIdFromUrl ?? ""),
        enabled: shouldProbeNode,
        retry: false,
        staleTime: 0,
      },
    },
  );
  // Duck-type the status to stay resilient across bundle boundaries where
  // `instanceof ApiError` could falsely fail due to duplicated module
  // instances.
  const nodeProbeStatus =
    nodeProbeError && typeof nodeProbeError === "object"
      ? (nodeProbeError as { status?: unknown }).status
      : undefined;
  const nodeNotFound =
    shouldProbeNode &&
    !nodeProbeLoading &&
    (nodeProbeStatus === 404 || nodeProbeStatus === 403);

  useEffect(() => {
    if (realmIdFromUrl) {
      // Don't promote an inaccessible/unknown realm id into active state —
      // it would only trigger noisy 404s from realm-scoped queries.
      if (realmNotFound) {
        if (activeRealmId !== null) setActiveRealmId(null);
        return;
      }
      if (realmIdFromUrl !== activeRealmId) {
        setActiveRealmId(realmIdFromUrl);
      }
      return;
    }
    // No realm in URL — pick the first one and reflect it in the URL so
    // refresh/back/forward preserve where the user is.
    if (realms && realms.length > 0) {
      setLocation(`/app/realm/${realms[0].id}`, { replace: true });
    } else if (realms && realms.length === 0 && activeRealmId !== null) {
      setActiveRealmId(null);
    }
  }, [realmIdFromUrl, realms, activeRealmId, setActiveRealmId, setLocation]);

  // Derive the focused pane's index + nodeId from the pane tree so we can
  // mirror it into the URL.
  const { focusedLeafIndex, focusedNodeId } = useMemo(() => {
    const leaves = collectLeaves(paneTree);
    const idx = leaves.findIndex((l) => l.id === focusedPaneId);
    const safeIdx = idx >= 0 ? idx : 0;
    return {
      focusedLeafIndex: safeIdx,
      focusedNodeId: leaves[safeIdx]?.nodeId ?? null,
    };
  }, [paneTree, focusedPaneId]);

  // Layout query params extracted from the current URL.
  const { panesParam, focusParam } = useMemo(() => {
    const p = new URLSearchParams(search);
    return {
      panesParam: p.get("panes"),
      focusParam: p.get("focus"),
    };
  }, [search]);

  // Build a stable signature for the store-side layout. Pane ids are
  // intentionally excluded so that two trees with the same shape, ratios and
  // nodes compare equal even if their internal handles differ.
  const storeSig = useMemo(() => {
    if (!paneTree) return "EMPTY";
    return JSON.stringify({
      t: serializePaneTree(paneTree),
      f: focusedLeafIndex,
    });
  }, [paneTree, focusedLeafIndex]);

  // Parse the URL into the layout it asks for. Handles three shapes:
  //  - `?panes=...&focus=N`            -> explicit multi-pane layout
  //  - path-only `/.../node/:nodeId`    -> single leaf (back-compat)
  //  - just `/app/realm/:realmId`       -> empty layout
  const urlDesired = useMemo<{
    tree: PaneTree | null;
    focusIdx: number;
    sig: string;
    explicit: boolean; // true when URL carries an authoritative layout
  } | null>(() => {
    if (panesParam) {
      const tree = decodePaneLayoutFromUrl(panesParam);
      if (!tree) return null;
      const leaves = collectLeaves(tree);
      let idx = focusParam !== null ? parseInt(focusParam, 10) : 0;
      if (!Number.isFinite(idx) || idx < 0 || idx >= leaves.length) idx = 0;
      return {
        tree,
        focusIdx: idx,
        sig: JSON.stringify({ t: serializePaneTree(tree), f: idx }),
        explicit: true,
      };
    }
    if (nodeIdFromUrl) {
      const tree = deserializePaneTree(nodeIdFromUrl);
      if (!tree) return null;
      return {
        tree,
        focusIdx: 0,
        sig: JSON.stringify({ t: nodeIdFromUrl, f: 0 }),
        explicit: false, // single nodeId in path doesn't override an existing multi-pane layout from storage
      };
    }
    return { tree: null, focusIdx: 0, sig: "EMPTY", explicit: false };
  }, [panesParam, focusParam, nodeIdFromUrl]);

  // Compose the URL that mirrors the store's current layout.
  const composeStoreUrl = (): string => {
    if (!activeRealmId) return "/app";
    if (!paneTree) return `/app/realm/${activeRealmId}`;
    const leaves = collectLeaves(paneTree);
    if (leaves.length <= 1) {
      const only = leaves[0];
      return only
        ? `/app/realm/${activeRealmId}/node/${only.nodeId}`
        : `/app/realm/${activeRealmId}`;
    }
    const focusedNode = leaves[focusedLeafIndex]?.nodeId;
    const base = focusedNode
      ? `/app/realm/${activeRealmId}/node/${focusedNode}`
      : `/app/realm/${activeRealmId}`;
    return `${base}?panes=${encodePaneLayoutForUrl(paneTree)}&focus=${focusedLeafIndex}`;
  };

  // Bidirectional URL <-> pane-layout sync. Refs let us tell which side
  // changed and avoid feedback loops.
  const lastSyncedSigRef = useRef<string | null>(null);
  const lastSyncedFocusedNodeIdRef = useRef<string | null>(null);
  const initialReconcileRef = useRef(true);
  const lastSyncedRealmRef = useRef<string | null>(null);
  // One-shot guard: when a remote delete closes the focused pane and we
  // redirect to the realm-only URL, suppress the very next URL<->store sync
  // pass so it doesn't immediately push a surviving pane's node back into
  // the URL. Subsequent user actions (opening/focusing a pane) work normally.
  const suppressNextUrlSyncRef = useRef(false);

  useEffect(() => {
    // Embedded mode never mirrors layout to the browser URL — pane state lives
    // in the store for the session only.
    if (embedded) return;
    if (lastSyncedRealmRef.current !== activeRealmId) {
      lastSyncedRealmRef.current = activeRealmId;
      lastSyncedSigRef.current = null;
      lastSyncedFocusedNodeIdRef.current = null;
      initialReconcileRef.current = true;
      suppressNextUrlSyncRef.current = false;
    }

    if (suppressNextUrlSyncRef.current) {
      // Adopt the post-redirect URL as the new "synced" baseline so the
      // surviving focused pane (if any) doesn't get force-closed on the next
      // render: a later store change diffs against the URL value and pushes
      // normally; a later URL change (back/forward) still wins. The result
      // is the URL stays realm-only until the user takes an explicit action.
      suppressNextUrlSyncRef.current = false;
      lastSyncedSigRef.current = urlDesired?.sig ?? "EMPTY";
      lastSyncedFocusedNodeIdRef.current = nodeIdFromUrl;
      initialReconcileRef.current = false;
      return;
    }

    if (!activeRealmId || realmNotFound) return;
    // Skip syncing a known-missing node into a pane — MainLayout shows a
    // NodeNotFound view instead, and we don't want a broken pane behind it.
    if (nodeNotFound) return;
    // Only sync once the URL's realm matches the active realm — otherwise
    // the realm-sync effect above is still mid-flight.
    if (realmIdFromUrl !== activeRealmId) return;

    if (!urlDesired) {
      // Malformed `panes` param — overwrite with a clean URL from the store.
      initialReconcileRef.current = false;
      setLocation(composeStoreUrl(), { replace: true });
      lastSyncedSigRef.current = storeSig;
      lastSyncedFocusedNodeIdRef.current = focusedNodeId;
      return;
    }

    if (urlDesired.sig === storeSig) {
      lastSyncedSigRef.current = urlDesired.sig;
      lastSyncedFocusedNodeIdRef.current = focusedNodeId;
      initialReconcileRef.current = false;
      return;
    }

    if (initialReconcileRef.current) {
      initialReconcileRef.current = false;
      if (urlDesired.explicit) {
        // URL carries an authoritative multi-pane layout — apply it and
        // discard whatever was restored from local storage.
        setLayout(urlDesired.tree, urlDesired.focusIdx);
        const newFocusNode =
          collectLeaves(urlDesired.tree)[urlDesired.focusIdx]?.nodeId ?? null;
        lastSyncedSigRef.current = urlDesired.sig;
        lastSyncedFocusedNodeIdRef.current = newFocusNode;
      } else if (nodeIdFromUrl) {
        // Single-node URL: open in focused pane while preserving any
        // multi-pane layout the user had restored from storage.
        openInFocused(nodeIdFromUrl);
        lastSyncedSigRef.current = urlDesired.sig;
        lastSyncedFocusedNodeIdRef.current = nodeIdFromUrl;
      } else if (paneTree) {
        // Store has a layout, URL doesn't — reflect into URL with replace.
        setLocation(composeStoreUrl(), { replace: true });
        lastSyncedSigRef.current = storeSig;
        lastSyncedFocusedNodeIdRef.current = focusedNodeId;
      } else {
        lastSyncedSigRef.current = urlDesired.sig;
        lastSyncedFocusedNodeIdRef.current = null;
      }
      return;
    }

    if (urlDesired.sig !== lastSyncedSigRef.current) {
      // URL changed externally (back/forward, paste, share link). The URL
      // wins — mirror it into the pane tree exactly, including collapsing
      // back to a single leaf when the URL no longer carries a layout.
      setLayout(urlDesired.tree, urlDesired.focusIdx);
      const newFocusNode = urlDesired.tree
        ? collectLeaves(urlDesired.tree)[urlDesired.focusIdx]?.nodeId ?? null
        : null;
      lastSyncedSigRef.current = urlDesired.sig;
      lastSyncedFocusedNodeIdRef.current = newFocusNode;
    } else {
      // Store changed (open / close / split / focus / resize). Push a new
      // history entry when the focused node changed; otherwise replace so
      // intermediate states (e.g. dragging a split bar) don't pollute the
      // back stack.
      const focusedChanged = focusedNodeId !== lastSyncedFocusedNodeIdRef.current;
      setLocation(composeStoreUrl(), { replace: !focusedChanged });
      lastSyncedSigRef.current = storeSig;
      lastSyncedFocusedNodeIdRef.current = focusedNodeId;
    }
  }, [
    activeRealmId,
    realmIdFromUrl,
    realmNotFound,
    nodeNotFound,
    nodeIdFromUrl,
    paneTree,
    focusedNodeId,
    storeSig,
    urlDesired,
    openInFocused,
    setLayout,
    setLocation,
  ]);

  // Watch the realm's node list and auto-close any panes whose node was
  // deleted elsewhere (another tab, a teammate via the realtime doc, or the
  // server). Local deletes from the sidebar already call
  // `removeNodeFromAllPanes` directly; this catches everything else.
  const { data: realmNodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId && !realmNotFound,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });

  // Track the most recent title we've seen for each node id so we can name
  // it in the auto-close toast even after the server has stopped returning
  // it in the realm node list.
  const lastKnownTitlesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!realmNodes) return;
    const map = lastKnownTitlesRef.current;
    for (const n of realmNodes) {
      map.set(n.id, n.title);
    }
  }, [realmNodes]);
  // Reset the title cache when switching realms — node ids are realm-scoped
  // and stale entries would only ever be misleading.
  useEffect(() => {
    lastKnownTitlesRef.current = new Map();
  }, [activeRealmId]);

  useEffect(() => {
    if (!activeRealmId || realmNotFound) return;
    if (!realmNodes) return;
    if (openNodeIds.length === 0) return;
    const existing = new Set(realmNodes.map((n) => n.id));
    const missing = openNodeIds.filter((id) => !existing.has(id));
    if (missing.length === 0) return;
    // If the focused (URL-mirrored) node is among the deleted ones, fall back
    // to the realm-only URL via replace so back/forward doesn't return to the
    // dead link. Pre-update the sync ref so the URL<->store effect doesn't
    // also push a duplicate entry.
    if (!embedded && focusedNodeId && missing.includes(focusedNodeId)) {
      // Arm the one-shot suppression in the URL<->store sync effect so the
      // surviving focused pane (if any) doesn't immediately push its node
      // back into the URL after our realm-only redirect.
      suppressNextUrlSyncRef.current = true;
      setLocation(`/app/realm/${activeRealmId}`, { replace: true });
    }
    // Build a single coalesced toast describing what disappeared. Local
    // sidebar deletes have already pruned `openNodeIds` synchronously in
    // their onSuccess handler before this effect sees the refetched list,
    // so the user only sees this for remote/other-tab/server-side deletes.
    const titles = missing.map(
      (id) => lastKnownTitlesRef.current.get(id) || "Untitled",
    );
    const message =
      missing.length === 1
        ? `"${titles[0]}" was deleted`
        : `${missing.length} nodes were deleted`;
    toast(message, {
      description:
        missing.length === 1
          ? "Closed by someone else on this realm."
          : `Closed: ${titles.map((t) => `"${t}"`).join(", ")}`,
    });
    for (const id of missing) {
      removeNodeFromAllPanes(id);
      lastKnownTitlesRef.current.delete(id);
    }
  }, [
    activeRealmId,
    realmNotFound,
    realmNodes,
    openNodeIds,
    focusedNodeId,
    removeNodeFromAllPanes,
    setLocation,
  ]);

  const goBackToRealm = () => {
    if (!activeRealmId) return;
    closeAllPanes();
    setLocation(`/app/realm/${activeRealmId}`, { replace: true });
  };

  return (
    <MaybeRealmDocProvider
      realmId={realmNotFound || nodeNotFound ? null : activeRealmId}
    >
      <div className={`flex ${embedded ? "h-full isolate" : "h-[100dvh]"} w-full overflow-hidden bg-background text-foreground safe-pl safe-pr`}>
        <LibrarySidebar />
        <main className="flex-1 flex flex-col relative min-w-0">
          <TopBar embedded={embedded} />
          <div className="flex-1 relative overflow-hidden min-h-0 min-w-0">
            {realmNotFound ? (
              <RealmNotFound />
            ) : nodeNotFound ? (
              <NodeNotFound onBack={goBackToRealm} />
            ) : focusedNodeIdFullscreen ? (
              <FocusedNodeView nodeId={focusedNodeIdFullscreen} />
            ) : viewMode === "graph" ? (
              <GraphView />
            ) : viewMode === "wiki" ? (
              <WikiEditor />
            ) : (
              <WindowWorkspace />
            )}
          </div>
        </main>
        <CompassSidebar />
        <CompassMobileFab />
      </div>
      <GuideOverlay />
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </MaybeRealmDocProvider>
  );
}

function CompassMobileFab() {
  const { isCompassOpen, setCompassOpen, compassCollapsed } = useAppStore();
  const isMobile = useIsMobile();
  // Only on mobile, only when Compass is fully closed. (The TopBar already
  // has a sparkles button up top, but a thumb-reachable FAB is much easier
  // to hit one-handed and matches the task brief.)
  if (!isMobile || isCompassOpen || compassCollapsed) return null;
  return (
    <button
      type="button"
      onClick={() => setCompassOpen(true)}
      aria-label="Open Compass"
      title="Open Compass"
      className="lg:hidden fixed z-30 right-4 bottom-4 h-14 w-14 rounded-full bg-accent text-accent-foreground shadow-lg active:scale-95 transition-transform flex items-center justify-center"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <Sparkles className="w-6 h-6" />
    </button>
  );
}

function NodeNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Node not found</h2>
        <p className="text-sm text-muted-foreground">
          This node has been deleted or you don't have access to it. It may have
          been removed since the link was shared.
        </p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to realm
        </Button>
      </div>
    </div>
  );
}

function RealmNotFound() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Realm not found</h2>
        <p className="text-sm text-muted-foreground">
          This realm doesn't exist or you don't have access to it. Pick a realm
          from the sidebar to get started.
        </p>
      </div>
    </div>
  );
}
