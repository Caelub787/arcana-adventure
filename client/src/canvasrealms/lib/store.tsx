import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef, type MutableRefObject } from "react";

const PANES_STORAGE_KEY = "reborn:panes-by-realm";
const VIEW_MODE_STORAGE_KEY = "reborn:view-mode-by-realm";
const EDIT_MODE_STORAGE_KEY = "reborn:edit-mode-by-realm";
const FOCUSED_PANE_STORAGE_KEY = "reborn:focused-pane-by-realm";
const FOCUSED_FULLSCREEN_STORAGE_KEY = "reborn:focused-fullscreen-by-realm";
const COMPASS_CHATS_KEY = "reborn:compass-chats-by-realm";
const LEGACY_OPEN_NODES_KEY = "reborn:open-nodes-by-realm";
const LEGACY_GRAPH_MODE_KEY = "reborn:graph-mode-by-realm";
const SIDEBAR_LAYOUT_KEY = "reborn:sidebar-layout";

export const LIBRARY_MIN_WIDTH = 220;
export const LIBRARY_MAX_WIDTH = 560;
export const LIBRARY_DEFAULT_WIDTH = 288;
export const COMPASS_MIN_WIDTH = 260;
export const COMPASS_MAX_WIDTH = 640;
export const COMPASS_DEFAULT_WIDTH = 320;

interface SidebarLayout {
  libraryWidth: number;
  compassWidth: number;
  libraryCollapsed: boolean;
  compassCollapsed: boolean;
}

function loadSidebarLayout(): SidebarLayout {
  const fallback: SidebarLayout = {
    libraryWidth: LIBRARY_DEFAULT_WIDTH,
    compassWidth: COMPASS_DEFAULT_WIDTH,
    libraryCollapsed: false,
    compassCollapsed: false,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_LAYOUT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SidebarLayout>;
    const clamp = (n: unknown, min: number, max: number, def: number) =>
      typeof n === "number" && Number.isFinite(n)
        ? Math.min(max, Math.max(min, n))
        : def;
    return {
      libraryWidth: clamp(
        parsed.libraryWidth,
        LIBRARY_MIN_WIDTH,
        LIBRARY_MAX_WIDTH,
        LIBRARY_DEFAULT_WIDTH,
      ),
      compassWidth: clamp(
        parsed.compassWidth,
        COMPASS_MIN_WIDTH,
        COMPASS_MAX_WIDTH,
        COMPASS_DEFAULT_WIDTH,
      ),
      libraryCollapsed: !!parsed.libraryCollapsed,
      compassCollapsed: !!parsed.compassCollapsed,
    };
  } catch {
    return fallback;
  }
}

function saveSidebarLayout(layout: SidebarLayout) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(layout));
  } catch {}
}

export type ViewMode = "windows" | "graph" | "wiki";

/**
 * Per-realm "am I reading or writing" mode. Defaults to "view" so new
 * realms open in a clean read-only-feeling state where `[[key]]` wiki
 * links render as clickable titles instead of raw key text in textareas.
 * Switching to "edit" reveals the textareas + Compass suggestion strips
 * everywhere. Separate from the user's realm role (read-only viewers
 * are always in view mode regardless of this setting).
 */
export type EditMode = "view" | "edit";

function loadEditModeByRealm(): Record<string, EditMode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EDIT_MODE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, EditMode>;
    }
    return {};
  } catch {
    return {};
  }
}

function saveEditModeByRealm(map: Record<string, EditMode>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EDIT_MODE_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export type PaneTree =
  | { kind: "leaf"; id: string; nodeId: string }
  | { kind: "split"; id: string; direction: "h" | "v"; ratio: number; a: PaneTree; b: PaneTree };

export type SplitEdge = "left" | "right" | "top" | "bottom" | "center";

let paneIdCounter = 0;
function nextPaneId(): string {
  paneIdCounter += 1;
  // Combine time, monotonic counter, and randomness so IDs stay unique across
  // reloads even if the in-memory counter resets to zero.
  const rand = Math.random().toString(36).slice(2, 8);
  return `p${Date.now().toString(36)}-${paneIdCounter}-${rand}`;
}

function makeLeaf(nodeId: string): PaneTree {
  return { kind: "leaf", id: nextPaneId(), nodeId };
}

function migrateLegacyOpenNodes(): Record<string, PaneTree | null> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_OPEN_NODES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, PaneTree | null> = {};
    for (const [realmId, ids] of Object.entries(parsed)) {
      if (!Array.isArray(ids) || ids.length === 0) {
        out[realmId] = null;
        continue;
      }
      // Build a left-leaning horizontal split chain
      let tree: PaneTree = makeLeaf(ids[0]);
      for (let i = 1; i < ids.length; i++) {
        tree = {
          kind: "split",
          id: nextPaneId(),
          direction: "h",
          ratio: 1 / (i + 1),
          a: makeLeaf(ids[i]),
          b: tree,
        };
      }
      out[realmId] = tree;
    }
    return out;
  } catch {
    return {};
  }
}

function loadPanes(): Record<string, PaneTree | null> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PANES_STORAGE_KEY);
    if (!raw) {
      const migrated = migrateLegacyOpenNodes();
      if (Object.keys(migrated).length > 0) {
        try {
          window.localStorage.setItem(PANES_STORAGE_KEY, JSON.stringify(migrated));
          window.localStorage.removeItem(LEGACY_OPEN_NODES_KEY);
        } catch {}
      }
      return migrated;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, PaneTree | null>;
    return {};
  } catch {
    return {};
  }
}

function savePanes(map: Record<string, PaneTree | null>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PANES_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function loadViewModeByRealm(): Record<string, ViewMode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, ViewMode>;
    }
    // Migrate legacy boolean map
    const legacy = window.localStorage.getItem(LEGACY_GRAPH_MODE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Record<string, boolean>;
      const out: Record<string, ViewMode> = {};
      for (const [k, v] of Object.entries(parsed)) {
        out[k] = v ? "graph" : "windows";
      }
      try {
        window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, JSON.stringify(out));
        window.localStorage.removeItem(LEGACY_GRAPH_MODE_KEY);
      } catch {}
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function saveViewModeByRealm(map: Record<string, ViewMode>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function loadFocusedByRealm(): Record<string, string | null> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOCUSED_PANE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string | null>;
    return {};
  } catch {
    return {};
  }
}

function saveFocusedByRealm(map: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOCUSED_PANE_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function loadFocusedFullscreenByRealm(): Record<string, string | null> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOCUSED_FULLSCREEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string | null>;
    return {};
  } catch {
    return {};
  }
}

function saveFocusedFullscreenByRealm(map: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOCUSED_FULLSCREEN_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

// --- Pane tree helpers ---

export function findFirstLeaf(tree: PaneTree | null): PaneTree | null {
  if (!tree) return null;
  if (tree.kind === "leaf") return tree;
  return findFirstLeaf(tree.a) ?? findFirstLeaf(tree.b);
}

export function collectOpenNodeIds(tree: PaneTree | null): string[] {
  if (!tree) return [];
  if (tree.kind === "leaf") return [tree.nodeId];
  return [...collectOpenNodeIds(tree.a), ...collectOpenNodeIds(tree.b)];
}

export function collectLeaves(tree: PaneTree | null): { id: string; nodeId: string }[] {
  if (!tree) return [];
  if (tree.kind === "leaf") return [{ id: tree.id, nodeId: tree.nodeId }];
  return [...collectLeaves(tree.a), ...collectLeaves(tree.b)];
}

function replaceLeafNode(tree: PaneTree, leafId: string, newNodeId: string): PaneTree {
  if (tree.kind === "leaf") {
    return tree.id === leafId ? { ...tree, nodeId: newNodeId } : tree;
  }
  return {
    ...tree,
    a: replaceLeafNode(tree.a, leafId, newNodeId),
    b: replaceLeafNode(tree.b, leafId, newNodeId),
  };
}

function splitAtLeaf(
  tree: PaneTree,
  leafId: string,
  edge: SplitEdge,
  newNodeId: string,
): PaneTree {
  if (tree.kind === "leaf") {
    if (tree.id !== leafId) return tree;
    if (edge === "center") {
      return { ...tree, nodeId: newNodeId };
    }
    const newLeaf = makeLeaf(newNodeId);
    const direction: "h" | "v" = edge === "left" || edge === "right" ? "h" : "v";
    const placeFirst = edge === "left" || edge === "top";
    return {
      kind: "split",
      id: nextPaneId(),
      direction,
      ratio: 0.5,
      a: placeFirst ? newLeaf : tree,
      b: placeFirst ? tree : newLeaf,
    };
  }
  return {
    ...tree,
    a: splitAtLeaf(tree.a, leafId, edge, newNodeId),
    b: splitAtLeaf(tree.b, leafId, edge, newNodeId),
  };
}

function removeLeaf(tree: PaneTree, leafId: string): PaneTree | null {
  if (tree.kind === "leaf") return tree.id === leafId ? null : tree;
  const a = removeLeaf(tree.a, leafId);
  const b = removeLeaf(tree.b, leafId);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return { ...tree, a, b };
}

function removeNodeFromTree(tree: PaneTree | null, nodeId: string): PaneTree | null {
  if (!tree) return null;
  if (tree.kind === "leaf") return tree.nodeId === nodeId ? null : tree;
  const a = removeNodeFromTree(tree.a, nodeId);
  const b = removeNodeFromTree(tree.b, nodeId);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return { ...tree, a, b };
}

function setRatio(tree: PaneTree, splitId: string, ratio: number): PaneTree {
  if (tree.kind === "leaf") return tree;
  if (tree.id === splitId) {
    // No-op guard: bail out if the ratio hasn't meaningfully changed. Without
    // this, every onLayout pass from `react-resizable-panels` (including the
    // ones triggered by sibling re-renders) would build a brand-new tree
    // object, re-trigger a layout pass, and feed back into another write —
    // causing visible jumping/flicker when 3+ panes are open.
    if (Math.abs(tree.ratio - ratio) < 0.001) return tree;
    return { ...tree, ratio };
  }
  const a = setRatio(tree.a, splitId, ratio);
  const b = setRatio(tree.b, splitId, ratio);
  if (a === tree.a && b === tree.b) return tree;
  return { ...tree, a, b };
}

// --- URL-friendly serialization for shareable layouts ---
// Leaf  -> nodeId string
// Split -> [direction, ratio, a, b]
// Pane ids are intentionally omitted: they are local handles, not addressable
// state, and would bloat URLs without changing the visible layout.
export type SerializedPaneTree =
  | string
  | ["h" | "v", number, SerializedPaneTree, SerializedPaneTree];

export function serializePaneTree(tree: PaneTree): SerializedPaneTree {
  if (tree.kind === "leaf") return tree.nodeId;
  return [
    tree.direction,
    Math.round(tree.ratio * 1000) / 1000,
    serializePaneTree(tree.a),
    serializePaneTree(tree.b),
  ];
}

export function deserializePaneTree(s: unknown): PaneTree | null {
  if (typeof s === "string" && s.length > 0) return makeLeaf(s);
  if (
    Array.isArray(s) &&
    s.length === 4 &&
    (s[0] === "h" || s[0] === "v") &&
    typeof s[1] === "number"
  ) {
    const a = deserializePaneTree(s[2]);
    const b = deserializePaneTree(s[3]);
    if (!a || !b) return null;
    return {
      kind: "split",
      id: nextPaneId(),
      direction: s[0],
      ratio: Math.min(0.95, Math.max(0.05, s[1])),
      a,
      b,
    };
  }
  return null;
}

export function encodePaneLayoutForUrl(tree: PaneTree): string {
  return encodeURIComponent(JSON.stringify(serializePaneTree(tree)));
}

export function decodePaneLayoutFromUrl(s: string): PaneTree | null {
  try {
    return deserializePaneTree(JSON.parse(decodeURIComponent(s)));
  } catch {
    return null;
  }
}

export type GuideParams = {
  // Optional hint for guides that need to highlight a kind-specific menu
  // item (e.g. create-node → highlight the "character" option after the
  // user opens the + New menu). Lower-case kind name like "character",
  // "location", "lore", etc.
  kindHint?: string;
};

export type ActiveGuide = {
  guideId: string;
  stepIndex: number;
  params?: GuideParams;
};

interface AppState {
  activeRealmId: string | null;
  setActiveRealmId: (id: string | null) => void;

  activeGuide: ActiveGuide | null;
  startGuide: (guideId: string, params?: GuideParams) => void;
  cancelGuide: () => void;
  advanceGuide: () => void;

  paneTree: PaneTree | null;
  focusedPaneId: string | null;
  currentNodeId: string | null;
  openNodeIds: string[];
  hasHydratedPanesForRealm: (realmId: string) => boolean;

  openInFocused: (nodeId: string) => void;
  openNewNode: (nodeId: string, opts?: { matchQuery?: string }) => void;
  pendingFocusNodeId: string | null;
  consumePendingFocus: (nodeId: string) => void;
  // When the user picks a content-search result from the palette, we carry
  // the matched phrase through to the opened node so the editor can scroll
  // to it and briefly highlight it. Cleared by the editor via
  // `consumePendingMatch` once handled.
  pendingMatch: { nodeId: string; query: string } | null;
  consumePendingMatch: (nodeId: string) => void;
  splitAtPane: (targetPaneId: string, edge: SplitEdge, nodeId: string) => void;
  closePane: (paneId: string) => void;
  closeAllPanes: () => void;
  setFocusedPane: (paneId: string) => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
  setLayout: (tree: PaneTree | null, focusedLeafIndex: number) => void;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  editMode: EditMode;
  setEditMode: (mode: EditMode) => void;
  toggleEditMode: () => void;

  removeNodeFromAllPanes: (nodeId: string) => void;
  forgetRealmLocalState: (realmId: string, fallbackRealmId: string | null) => void;

  isLibraryOpen: boolean;
  setLibraryOpen: (open: boolean) => void;
  isCompassOpen: boolean;
  setCompassOpen: (open: boolean) => void;

  // Desktop sidebar layout. Widths are pixel values used on md+ (library)
  // / lg+ (compass); mobile drawers still use their fixed viewport widths.
  // The collapsed flag swaps the panel for a slim rail with an expand
  // button. Both are persisted to localStorage.
  libraryWidth: number;
  setLibraryWidth: (px: number) => void;
  libraryCollapsed: boolean;
  setLibraryCollapsed: (collapsed: boolean) => void;
  compassWidth: number;
  setCompassWidth: (px: number) => void;
  compassCollapsed: boolean;
  setCompassCollapsed: (collapsed: boolean) => void;

  // Focus mode: when set, the workspace renders only this node filling the
  // entire workspace area. The underlying pane tree / canvas layout is
  // preserved unchanged so exiting focus restores it exactly.
  focusedNodeIdFullscreen: string | null;
  toggleFocusedNode: (nodeId: string) => void;
  setFocusedNodeFullscreen: (nodeId: string | null) => void;

  guideConfirmation: string | null;
  setGuideConfirmation: (msg: string | null) => void;

  // Live (uncommitted-to-render) center of the currently-visible canvas in
  // flow coordinates. The active CanvasPaneInner writes into `.current` on
  // mount and on every `onMoveEnd`. Sidebars (e.g. Compass) read it when
  // they need to drop new content "where the user is looking" without
  // forcing a re-render of every consumer on every pan. `null` when no
  // canvas is focused.
  canvasCenterRef: MutableRefObject<{ x: number; y: number } | null>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeRealmId, setActiveRealmId] = useState<string | null>(null);
  const [panesByRealm, setPanesByRealm] = useState<Record<string, PaneTree | null>>(() => loadPanes());
  const [focusedByRealm, setFocusedByRealm] = useState<Record<string, string | null>>(() => loadFocusedByRealm());
  const [viewModeByRealm, setViewModeByRealm] = useState<Record<string, ViewMode>>(() => loadViewModeByRealm());
  const [editModeByRealm, setEditModeByRealm] = useState<Record<string, EditMode>>(() => loadEditModeByRealm());
  const [isLibraryOpen, setLibraryOpen] = useState(false);
  const [isCompassOpen, setCompassOpen] = useState(false);
  const [sidebarLayout, setSidebarLayout] = useState<SidebarLayout>(() =>
    loadSidebarLayout(),
  );
  useEffect(() => {
    saveSidebarLayout(sidebarLayout);
  }, [sidebarLayout]);
  const setLibraryWidth = useCallback((px: number) => {
    setSidebarLayout((s) => ({
      ...s,
      libraryWidth: Math.min(
        LIBRARY_MAX_WIDTH,
        Math.max(LIBRARY_MIN_WIDTH, Math.round(px)),
      ),
    }));
  }, []);
  const setCompassWidth = useCallback((px: number) => {
    setSidebarLayout((s) => ({
      ...s,
      compassWidth: Math.min(
        COMPASS_MAX_WIDTH,
        Math.max(COMPASS_MIN_WIDTH, Math.round(px)),
      ),
    }));
  }, []);
  const setLibraryCollapsed = useCallback((collapsed: boolean) => {
    setSidebarLayout((s) => ({ ...s, libraryCollapsed: collapsed }));
  }, []);
  const setCompassCollapsed = useCallback((collapsed: boolean) => {
    setSidebarLayout((s) => ({ ...s, compassCollapsed: collapsed }));
  }, []);
  const [focusedFullscreenByRealm, setFocusedFullscreenByRealm] = useState<Record<string, string | null>>(() => loadFocusedFullscreenByRealm());
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<{ nodeId: string; query: string } | null>(null);
  const [activeGuide, setActiveGuide] = useState<ActiveGuide | null>(null);
  const [guideConfirmation, setGuideConfirmation] = useState<string | null>(null);
  const canvasCenterRef = useRef<{ x: number; y: number } | null>(null);

  const startGuide = useCallback((guideId: string, params?: GuideParams) => {
    setActiveGuide({ guideId, stepIndex: 0, params });
    setGuideConfirmation(null);
  }, []);
  const cancelGuide = useCallback(() => {
    setActiveGuide(null);
  }, []);
  const advanceGuide = useCallback(() => {
    setActiveGuide((curr) =>
      curr ? { ...curr, stepIndex: curr.stepIndex + 1 } : curr,
    );
  }, []);

  useEffect(() => {
    savePanes(panesByRealm);
  }, [panesByRealm]);

  useEffect(() => {
    saveViewModeByRealm(viewModeByRealm);
  }, [viewModeByRealm]);

  useEffect(() => {
    saveEditModeByRealm(editModeByRealm);
  }, [editModeByRealm]);

  useEffect(() => {
    saveFocusedByRealm(focusedByRealm);
  }, [focusedByRealm]);

  useEffect(() => {
    saveFocusedFullscreenByRealm(focusedFullscreenByRealm);
  }, [focusedFullscreenByRealm]);

  const paneTree = activeRealmId ? panesByRealm[activeRealmId] ?? null : null;
  const focusedNodeIdFullscreen = activeRealmId
    ? focusedFullscreenByRealm[activeRealmId] ?? null
    : null;
  const viewMode: ViewMode = activeRealmId ? viewModeByRealm[activeRealmId] ?? "windows" : "windows";
  const editMode: EditMode = activeRealmId ? editModeByRealm[activeRealmId] ?? "view" : "view";

  // Ensure focusedPaneId stays valid when tree changes
  const focusedPaneId = useMemo(() => {
    if (!activeRealmId) return null;
    const stored = focusedByRealm[activeRealmId] ?? null;
    const leaves = collectLeaves(paneTree);
    if (stored && leaves.some((l) => l.id === stored)) return stored;
    return leaves[0]?.id ?? null;
  }, [activeRealmId, focusedByRealm, paneTree]);

  const openNodeIds = useMemo(() => collectOpenNodeIds(paneTree), [paneTree]);

  // The "currently selected" node — the nodeId in the focused leaf pane.
  // Used by Compass so prompts like "rewrite this" can target whatever the
  // user is actively viewing, without them naming the node explicitly.
  const currentNodeId = useMemo(() => {
    if (!paneTree || !focusedPaneId) return null;
    const leaf = collectLeaves(paneTree).find((l) => l.id === focusedPaneId);
    return leaf?.nodeId ?? null;
  }, [paneTree, focusedPaneId]);

  const updateTree = useCallback(
    (updater: (prev: PaneTree | null) => PaneTree | null) => {
      setPanesByRealm((prev) => {
        if (!activeRealmId) return prev;
        return { ...prev, [activeRealmId]: updater(prev[activeRealmId] ?? null) };
      });
    },
    [activeRealmId],
  );

  const setFocusedPane = useCallback(
    (paneId: string) => {
      if (!activeRealmId) return;
      setFocusedByRealm((prev) => ({ ...prev, [activeRealmId]: paneId }));
    },
    [activeRealmId],
  );

  const openInFocused = useCallback(
    (nodeId: string) => {
      if (!activeRealmId) return;
      // Opening a (potentially different) node while a node is focused
      // exits focus mode — the user explicitly asked to look at something
      // else, so dropping them back into the regular multi-pane layout
      // is the least surprising behavior.
      setFocusedFullscreenByRealm((p) => ({ ...p, [activeRealmId]: null }));
      updateTree((prev) => {
        if (!prev) {
          const leaf = makeLeaf(nodeId);
          setFocusedByRealm((p) => ({ ...p, [activeRealmId]: leaf.id }));
          return leaf;
        }
        // Replace focused leaf
        const leaves = collectLeaves(prev);
        const target =
          leaves.find((l) => l.id === (focusedByRealm[activeRealmId] ?? "")) ??
          leaves[0];
        if (!target) {
          const leaf = makeLeaf(nodeId);
          setFocusedByRealm((p) => ({ ...p, [activeRealmId]: leaf.id }));
          return leaf;
        }
        return replaceLeafNode(prev, target.id, nodeId);
      });
    },
    [activeRealmId, focusedByRealm, updateTree],
  );

  const consumePendingFocus = useCallback((nodeId: string) => {
    setPendingFocusNodeId((curr) => (curr === nodeId ? null : curr));
  }, []);

  const openNewNode = useCallback(
    (nodeId: string, opts?: { matchQuery?: string }) => {
      if (!activeRealmId) return;
      setPendingFocusNodeId(nodeId);
      // Record the matched search phrase (if any) so the opening editor can
      // scroll/highlight it. Set BEFORE openInFocused so the editor sees the
      // value on its very first render of the (possibly re-used) node.
      const q = opts?.matchQuery?.trim();
      setPendingMatch(q ? { nodeId, query: q } : null);
      setViewModeByRealm((prev) => {
        if ((prev[activeRealmId] ?? "windows") === "windows") return prev;
        return { ...prev, [activeRealmId]: "windows" };
      });
      openInFocused(nodeId);
      setLibraryOpen(false);
      setCompassOpen(false);
    },
    [activeRealmId, openInFocused],
  );

  const consumePendingMatch = useCallback((nodeId: string) => {
    setPendingMatch((curr) => (curr && curr.nodeId === nodeId ? null : curr));
  }, []);

  const splitAtPane = useCallback(
    (targetPaneId: string, edge: SplitEdge, nodeId: string) => {
      if (!activeRealmId) return;
      // Splitting (or center-replacing) panes implies the user wants the
      // multi-pane layout back; exit focus mode so the change is visible.
      setFocusedFullscreenByRealm((p) => ({ ...p, [activeRealmId]: null }));
      updateTree((prev) => {
        if (!prev) {
          const leaf = makeLeaf(nodeId);
          setFocusedByRealm((p) => ({ ...p, [activeRealmId]: leaf.id }));
          return leaf;
        }
        const next = splitAtLeaf(prev, targetPaneId, edge, nodeId);
        // Focus the newly created leaf — find a leaf with this nodeId not present before
        const beforeIds = new Set(collectLeaves(prev).map((l) => l.id));
        const newLeaf = collectLeaves(next).find((l) => !beforeIds.has(l.id));
        if (newLeaf) {
          setFocusedByRealm((p) => ({ ...p, [activeRealmId]: newLeaf.id }));
        }
        return next;
      });
    },
    [activeRealmId, updateTree],
  );

  const closePane = useCallback(
    (paneId: string) => {
      if (!activeRealmId) return;
      updateTree((prev) => (prev ? removeLeaf(prev, paneId) : null));
    },
    [activeRealmId, updateTree],
  );

  const closeAllPanes = useCallback(() => {
    if (!activeRealmId) return;
    updateTree(() => null);
  }, [activeRealmId, updateTree]);

  const setLayout = useCallback(
    (tree: PaneTree | null, focusedLeafIndex: number) => {
      if (!activeRealmId) return;
      const id = activeRealmId;
      setPanesByRealm((prev) => ({ ...prev, [id]: tree }));
      const leaves = collectLeaves(tree);
      const idx =
        leaves.length === 0
          ? -1
          : Math.max(0, Math.min(leaves.length - 1, focusedLeafIndex));
      const focusId = idx >= 0 ? leaves[idx].id : null;
      setFocusedByRealm((prev) => ({ ...prev, [id]: focusId }));
    },
    [activeRealmId],
  );

  const setSplitRatio = useCallback(
    (splitId: string, ratio: number) => {
      if (!activeRealmId) return;
      updateTree((prev) => (prev ? setRatio(prev, splitId, ratio) : prev));
    },
    [activeRealmId, updateTree],
  );

  const setFocusedNodeFullscreen = useCallback(
    (nodeId: string | null) => {
      if (!activeRealmId) return;
      setFocusedFullscreenByRealm((prev) => {
        const cur = prev[activeRealmId] ?? null;
        if (cur === nodeId) return prev;
        return { ...prev, [activeRealmId]: nodeId };
      });
    },
    [activeRealmId],
  );

  const toggleFocusedNode = useCallback(
    (nodeId: string) => {
      if (!activeRealmId) return;
      setFocusedFullscreenByRealm((prev) => {
        const cur = prev[activeRealmId] ?? null;
        return { ...prev, [activeRealmId]: cur === nodeId ? null : nodeId };
      });
    },
    [activeRealmId],
  );

  const removeNodeFromAllPanes = useCallback((nodeId: string) => {
    setFocusedFullscreenByRealm((prev) => {
      let changed = false;
      const next: Record<string, string | null> = {};
      for (const [realmId, val] of Object.entries(prev)) {
        if (val === nodeId) {
          next[realmId] = null;
          changed = true;
        } else {
          next[realmId] = val;
        }
      }
      return changed ? next : prev;
    });
    setPanesByRealm((prev) => {
      const next: Record<string, PaneTree | null> = {};
      let changed = false;
      for (const [realmId, tree] of Object.entries(prev)) {
        const updated = removeNodeFromTree(tree, nodeId);
        if (updated !== tree) changed = true;
        next[realmId] = updated;
      }
      return changed ? next : prev;
    });
  }, []);

  const forgetRealmLocalState = useCallback(
    (realmId: string, fallbackRealmId: string | null) => {
      setPanesByRealm((prev) => {
        if (!(realmId in prev)) return prev;
        const next = { ...prev };
        delete next[realmId];
        return next;
      });
      setViewModeByRealm((prev) => {
        if (!(realmId in prev)) return prev;
        const next = { ...prev };
        delete next[realmId];
        return next;
      });
      setEditModeByRealm((prev) => {
        if (!(realmId in prev)) return prev;
        const next = { ...prev };
        delete next[realmId];
        return next;
      });
      setFocusedByRealm((prev) => {
        if (!(realmId in prev)) return prev;
        const next = { ...prev };
        delete next[realmId];
        return next;
      });
      setFocusedFullscreenByRealm((prev) => {
        if (!(realmId in prev)) return prev;
        const next = { ...prev };
        delete next[realmId];
        return next;
      });
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(COMPASS_CHATS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && realmId in parsed) {
              delete parsed[realmId];
              window.localStorage.setItem(COMPASS_CHATS_KEY, JSON.stringify(parsed));
            }
          }
        } catch {}
      }
      setActiveRealmId((curr) => (curr === realmId ? fallbackRealmId : curr));
    },
    [],
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeByRealm((prev) => {
        if (!activeRealmId) return prev;
        if ((prev[activeRealmId] ?? "windows") === mode) return prev;
        return { ...prev, [activeRealmId]: mode };
      });
    },
    [activeRealmId],
  );

  const setEditMode = useCallback(
    (mode: EditMode) => {
      setEditModeByRealm((prev) => {
        if (!activeRealmId) return prev;
        if ((prev[activeRealmId] ?? "view") === mode) return prev;
        return { ...prev, [activeRealmId]: mode };
      });
    },
    [activeRealmId],
  );

  const toggleEditMode = useCallback(() => {
    setEditModeByRealm((prev) => {
      if (!activeRealmId) return prev;
      const cur = prev[activeRealmId] ?? "view";
      return { ...prev, [activeRealmId]: cur === "view" ? "edit" : "view" };
    });
  }, [activeRealmId]);

  const hasHydratedPanesForRealm = useCallback(
    (realmId: string) => Object.prototype.hasOwnProperty.call(panesByRealm, realmId),
    [panesByRealm],
  );

  return (
    <AppContext.Provider
      value={{
        activeRealmId,
        setActiveRealmId,
        paneTree,
        focusedPaneId,
        currentNodeId,
        openNodeIds,
        hasHydratedPanesForRealm,
        openInFocused,
        openNewNode,
        pendingFocusNodeId,
        consumePendingFocus,
        pendingMatch,
        consumePendingMatch,
        splitAtPane,
        closePane,
        closeAllPanes,
        setFocusedPane,
        setSplitRatio,
        setLayout,
        viewMode,
        setViewMode,
        editMode,
        setEditMode,
        toggleEditMode,
        removeNodeFromAllPanes,
        forgetRealmLocalState,
        isLibraryOpen,
        setLibraryOpen,
        isCompassOpen,
        setCompassOpen,
        libraryWidth: sidebarLayout.libraryWidth,
        setLibraryWidth,
        libraryCollapsed: sidebarLayout.libraryCollapsed,
        setLibraryCollapsed,
        compassWidth: sidebarLayout.compassWidth,
        setCompassWidth,
        compassCollapsed: sidebarLayout.compassCollapsed,
        setCompassCollapsed,
        focusedNodeIdFullscreen,
        toggleFocusedNode,
        setFocusedNodeFullscreen,
        activeGuide,
        startGuide,
        cancelGuide,
        advanceGuide,
        guideConfirmation,
        setGuideConfirmation,
        canvasCenterRef,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppStore must be used within an AppProvider");
  }
  return context;
}
