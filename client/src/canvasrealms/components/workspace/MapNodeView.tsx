import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Node,
  useUpdateNode,
  useListNodes,
  getGetNodeQueryKey,
  getListNodesQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { hasSidebarNodeDrag, getSidebarNodeDrag } from "@cr/lib/drag";
import { registerTouchDropTarget } from "@cr/lib/touchDrag";
import { NodeAvatar } from "@cr/components/workspace/NodeAvatar";
import { getKindIcon } from "@cr/lib/nodeKinds";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@cr/lib/store";
import { useRealmRole } from "@cr/lib/useRealmRole";
import { Button } from "@cr/components/ui/button";
import {
  Upload,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ImagePlus,
  X,
  Map as MapIcon,
  MousePointer2,
  Hexagon,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import { uploadImage, objectUrl } from "@cr/lib/uploadImage";
import { toast } from "sonner";
import { PaneControls } from "./PaneControls";
import {
  notePaneActive,
  registerPaneShortcuts,
} from "@cr/lib/paneShortcuts";

const COLOR_PALETTE = [
  "#ef4444", "#f59e0b", "#eab308", "#10b981", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#f8fafc", "#0f172a",
];

// ----- Region (polygon) types -----
// The map editor supports polygon region drawing and node pins. Older
// saved maps may have additional fields (rects, circles, text, icons,
// freehand paths, polygon caption/outline styling); those are parsed
// off and silently dropped so the doc keeps loading.
export interface PolygonRegion {
  id: string;
  type: "polygon";
  points: { x: number; y: number }[];
  color: string;
}

// A pin drops a reference to another node at a point on the map image.
// `x`/`y` are image-relative percentages (0..100). Clicking a pin opens
// the referenced node in the focused pane.
export interface MapPin {
  id: string;
  type: "pin";
  nodeId: string;
  x: number;
  y: number;
}

export interface MapDoc {
  image: string | null;
  annotations: PolygonRegion[];
  pins: MapPin[];
}
const EMPTY_DOC: MapDoc = { image: null, annotations: [], pins: [] };

function parseMapDoc(content: string): MapDoc {
  if (!content) return { image: null, annotations: [], pins: [] };
  try {
    const v = JSON.parse(content) as {
      image?: unknown;
      annotations?: unknown;
      pins?: unknown;
    };
    const image = typeof v.image === "string" ? v.image : null;
    const annotations: PolygonRegion[] = [];
    if (Array.isArray(v.annotations)) {
      for (const raw of v.annotations) {
        if (!raw || typeof raw !== "object") continue;
        const a = raw as Record<string, unknown>;
        if (a.type !== "polygon") continue;
        if (!Array.isArray(a.points)) continue;
        const points = (a.points as unknown[])
          .map((p) => {
            if (!p || typeof p !== "object") return null;
            const pt = p as Record<string, unknown>;
            if (typeof pt.x !== "number" || typeof pt.y !== "number") return null;
            return { x: pt.x, y: pt.y };
          })
          .filter((p): p is { x: number; y: number } => p !== null);
        if (points.length < 3) continue;
        const id = typeof a.id === "string" ? a.id : newId("poly");
        const color =
          typeof a.color === "string" ? a.color : COLOR_PALETTE[0];
        annotations.push({ id, type: "polygon", points, color });
      }
    }
    const pins: MapPin[] = [];
    if (Array.isArray(v.pins)) {
      for (const raw of v.pins) {
        if (!raw || typeof raw !== "object") continue;
        const p = raw as Record<string, unknown>;
        const nodeId = typeof p.nodeId === "string" ? p.nodeId : null;
        if (!nodeId) continue;
        const x = typeof p.x === "number" ? p.x : null;
        const y = typeof p.y === "number" ? p.y : null;
        if (x === null || y === null) continue;
        if (x < 0 || x > 100 || y < 0 || y > 100) continue;
        const id = typeof p.id === "string" ? p.id : newId("pin");
        pins.push({ id, type: "pin", nodeId, x, y });
      }
    }
    return { image, annotations, pins };
  } catch {
    return { image: null, annotations: [], pins: [] };
  }
}

type Tool = "select" | "polygon";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Screen-space distance thresholds (in CSS pixels).
const POLY_CLOSE_PX = 12;
const SNAP_PX = 10;

interface Props {
  node: Node;
  paneId: string;
  onClosePane?: () => void;
}

export function MapNodeView({ node, paneId, onClosePane }: Props) {
  const id = node.id;
  const { activeRealmId, openInFocused } = useAppStore();
  const { canEdit } = useRealmRole(activeRealmId);
  const readOnly = !canEdit;
  const updateNode = useUpdateNode();
  const queryClient = useQueryClient();

  // Realm-wide node lookup for rendering pin avatars + titles. The list
  // is already cached by the sidebar / editor queries, so this is
  // typically a free read from React Query's cache.
  const { data: realmNodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });
  const nodeById = useMemo(() => {
    const m = new Map<string, Node>();
    for (const n of realmNodes ?? []) m.set(n.id, n);
    return m;
  }, [realmNodes]);

  // Visual state for a sidebar-drag hovering over the map surface. Used
  // to subtly highlight the map so users know dropping will pin the
  // node here.
  const [dragOverMap, setDragOverMap] = useState(false);

  // Active pin drag. While set, that pin renders at the live x/y
  // (instead of its committed position) so it follows the finger /
  // cursor smoothly. Commit happens on pointerup.
  const [pinDrag, setPinDrag] = useState<
    | {
        id: string;
        x: number; // current image-% position
        y: number;
        startX: number; // pin's committed x at drag start
        startY: number;
        clientStartX: number; // pointer start in client coords
        clientStartY: number;
        moved: boolean;
        startTime: number;
      }
    | null
  >(null);
  // Mirrors the most recent pointerup outcome so the click handler can
  // decide whether the gesture was a tap (single quick press without
  // movement) and should open the node. React's click event runs after
  // pointerup, and by then setPinDrag(null) has already happened, so
  // a ref-based signal is the only way to thread this through.
  const lastPinGestureRef = useRef<{ id: string; tap: boolean } | null>(null);

  // Bumped whenever the image wrapper changes size (initial load,
  // image swap, window resize). The pin overlay reads imageWrapRef's
  // bounding rect at render time to position itself outside the
  // zoom-transformed wrapper (so the avatar isn't blurred by the
  // parent's CSS scale), and needs a re-render trigger when layout
  // changes without state changes.
  const [wrapTick, setWrapTick] = useState(0);

  // Which pin currently shows its remove (X) button. The X is hidden
  // by default, revealed while the pin is pressed/held, and auto-hidden
  // 2 seconds after release.
  const [revealedPinId, setRevealedPinId] = useState<string | null>(null);
  const hideXTimerRef = useRef<number | null>(null);
  const revealPinX = useCallback((pinId: string) => {
    if (hideXTimerRef.current) {
      window.clearTimeout(hideXTimerRef.current);
      hideXTimerRef.current = null;
    }
    setRevealedPinId(pinId);
  }, []);
  const scheduleHideX = useCallback(() => {
    if (hideXTimerRef.current) window.clearTimeout(hideXTimerRef.current);
    hideXTimerRef.current = window.setTimeout(() => {
      setRevealedPinId(null);
      hideXTimerRef.current = null;
    }, 2000);
  }, []);
  useEffect(() => {
    return () => {
      if (hideXTimerRef.current) window.clearTimeout(hideXTimerRef.current);
    };
  }, []);

  // Observe image-wrapper size changes so the pin overlay (rendered
  // outside the zoom wrapper) repositions when the image loads or the
  // window resizes.
  useEffect(() => {
    const el = imageWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setWrapTick((t) => t + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // Observer is set up once; size changes (including image swaps)
    // fire it automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [doc, setDoc] = useState<MapDoc>(() => parseMapDoc(node.content));
  const [title, setTitle] = useState(node.title);
  const [nodeKey, setNodeKey] = useState(node.key);
  const [uploading, setUploading] = useState(false);
  // Local blob URL for the image being uploaded right now. Lets the
  // freshly-chosen image render instantly (no round-trip to storage)
  // while we PUT it in the background. Cleared once the saved
  // objectPath is what's being displayed.
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  // ----- Undo / redo history (per-map-node, in-memory only) -----
  const HISTORY_LIMIT = 50;
  const [history, setHistory] = useState<{ past: MapDoc[]; future: MapDoc[] }>(
    { past: [], future: [] },
  );
  const pushSnapshot = useCallback((prev: MapDoc) => {
    setHistory((h) => {
      const past = [...h.past, prev];
      while (past.length > HISTORY_LIMIT) past.shift();
      return { past, future: [] };
    });
  }, []);
  const commitDoc = useCallback(
    (updater: (d: MapDoc) => MapDoc) => {
      setDoc((cur) => {
        const next = updater(cur);
        if (next === cur) return cur;
        pushSnapshot(cur);
        return next;
      });
    },
    [pushSnapshot],
  );

  // Currently-selected region (drives the color-picker popover).
  const [selectedAnnotId, setSelectedAnnotId] = useState<string | null>(null);
  // Currently-selected vertex within a region (drives Delete-key removal).
  const [selectedVertex, setSelectedVertex] = useState<
    { regionId: string; index: number } | null
  >(null);
  // Active vertex drag (for cursor / visual state).
  const [draggingVertex, setDraggingVertex] = useState<
    { regionId: string; index: number } | null
  >(null);
  // Snap target shown during a vertex drag (image-relative %).
  // `fromX`/`fromY` is the raw (unsnapped) cursor position in image %,
  // used to draw a faint connector line to the snap target so the user
  // can see *which* neighbor vertex they snapped to.
  const [vertexDragSnap, setVertexDragSnap] = useState<
    { x: number; y: number; fromX: number; fromY: number; regionId: string } | null
  >(null);

  // Pan / zoom state.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  panRef.current = pan;
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  // Tooling state.
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(COLOR_PALETTE[0]);
  const [draftPolygon, setDraftPolygon] = useState<PolygonRegion | null>(null);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const imageWrapRef = useRef<HTMLDivElement | null>(null);

  // Touch long-press tracking for polygon-undo. On touch devices users
  // have no right-click, so a long-press on the surface while a polygon
  // draft is in progress pops the last placed vertex (matching desktop
  // right-click). `suppressNextPolyClickRef` blocks the synthetic
  // mousedown that follows the touch release so we don't immediately
  // place a new point where the user lifted their finger.
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextPolyClickRef = useRef(false);
  // Some mobile browsers also fire a synthetic `contextmenu` after a
  // touch long-press. Remember the wall-clock time we popped via
  // long-press so the context-menu handler can ignore the duplicate.
  const lastLongPressPopAtRef = useRef(0);
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);
  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  // Re-sync doc when the underlying node changes (or when the server-side
  // content changed underneath us while we have no unsaved local edits).
  const initializedFor = useRef<string | null>(null);
  useEffect(() => {
    if (initializedFor.current !== id) {
      initializedFor.current = id;
      setDoc(parseMapDoc(node.content));
      setTitle(node.title);
      setNodeKey(node.key);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setTool("select");
      setDraftPolygon(null);
      setHistory({ past: [], future: [] });
      setSelectedAnnotId(null);
      return;
    }
    const localContent = JSON.stringify(doc);
    const docDirty = localContent !== lastSavedRef.current.content;
    if (docDirty) return;
    if (node.content !== lastSavedRef.current.content) {
      setDoc(parseMapDoc(node.content));
      lastSavedRef.current = { ...lastSavedRef.current, content: node.content };
    }
  }, [id, node.content, doc]);

  // Debounced persistence to the server.
  const lastSavedRef = useRef<{ title: string; key: string; content: string }>({
    title: node.title,
    key: node.key,
    content: node.content,
  });
  const mutateRef = useRef(updateNode.mutate);
  mutateRef.current = updateNode.mutate;

  const patchLocal = useCallback(
    (updated: Node) => {
      queryClient.setQueryData(getGetNodeQueryKey(id), updated);
      if (activeRealmId) {
        queryClient.setQueryData(
          getListNodesQueryKey(activeRealmId),
          (old: Node[] | undefined) =>
            old?.map((n) => (n.id === id ? updated : n)),
        );
      }
    },
    [id, queryClient, activeRealmId],
  );

  const handleKeyError = useCallback((err: unknown) => {
    const code =
      err instanceof ApiError &&
      err.data &&
      typeof err.data === "object" &&
      "code" in err.data
        ? (err.data as { code?: unknown }).code
        : undefined;
    if (code === "key_conflict") {
      toast.error("That key is already used by another node");
    } else if (code === "key_empty") {
      toast.error("Key can't be empty");
    } else {
      toast.error("Couldn't save key");
    }
    setNodeKey(lastSavedRef.current.key);
  }, []);

  useEffect(() => {
    if (initializedFor.current !== id) return;
    if (readOnly) return;
    const nextContent = JSON.stringify(doc);
    const titleChanged = title !== lastSavedRef.current.title;
    const contentChanged = nextContent !== lastSavedRef.current.content;
    if (!titleChanged && !contentChanged) return;
    const t = setTimeout(() => {
      const data: Partial<Node> = {};
      if (titleChanged) data.title = title;
      if (contentChanged) data.content = nextContent;
      mutateRef.current(
        { nodeId: id, data },
        { onSuccess: patchLocal },
      );
      lastSavedRef.current = {
        ...lastSavedRef.current,
        title,
        content: nextContent,
      };
    }, 400);
    return () => clearTimeout(t);
  }, [doc, title, id, readOnly, patchLocal]);

  useEffect(() => {
    if (initializedFor.current !== id) return;
    if (readOnly) return;
    if (nodeKey === lastSavedRef.current.key) return;
    const t = setTimeout(() => {
      const attemptedKey = nodeKey;
      mutateRef.current(
        { nodeId: id, data: { key: attemptedKey } },
        {
          onSuccess: (updated) => {
            lastSavedRef.current = {
              ...lastSavedRef.current,
              key: attemptedKey,
            };
            patchLocal(updated);
          },
          onError: handleKeyError,
        },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [nodeKey, id, readOnly, patchLocal, handleKeyError]);

  // Track latest doc/title in a ref so the unmount cleanup can flush the
  // most recent values rather than a stale closure.
  const latestRef = useRef({ doc, title, nodeKey });
  latestRef.current = { doc, title, nodeKey };
  useEffect(() => {
    return () => {
      if (readOnly) return;
      const nextContent = JSON.stringify(latestRef.current.doc);
      const nextTitle = latestRef.current.title;
      const nextKey = latestRef.current.nodeKey;
      const data: Partial<Node> = {};
      if (nextTitle !== lastSavedRef.current.title) data.title = nextTitle;
      if (nextContent !== lastSavedRef.current.content) data.content = nextContent;
      if (Object.keys(data).length > 0) {
        mutateRef.current({ nodeId: id, data });
      }
      if (nextKey !== lastSavedRef.current.key) {
        mutateRef.current({ nodeId: id, data: { key: nextKey } });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, readOnly]);

  // ----- Image upload -----
  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setUploading(true);
    // Show the chosen image instantly from the local File object so
    // the user doesn't stare at a spinner while we round-trip to
    // storage. Replaced by the served URL once the save persists.
    const previewUrl = URL.createObjectURL(file);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });
    try {
      const objectPath = await uploadImage(file);
      const nextDoc = { ...latestRef.current.doc, image: objectPath };
      const nextContent = JSON.stringify(nextDoc);
      // Mark as already-saved BEFORE awaiting the mutation so the
      // debounced save effect won't fire a duplicate write when the
      // state update flushes.
      lastSavedRef.current = {
        ...lastSavedRef.current,
        content: nextContent,
      };
      commitDoc((d) => ({ ...d, image: objectPath }));
      // Await the persistence so the upload UI stays in "uploading"
      // state until the server has actually durably saved the new
      // image objectPath. Without this await, a quick reload right
      // after the PUT could land before the (fire-and-forget) save
      // request reached the server, and the image would be lost.
      await updateNode.mutateAsync({
        nodeId: id,
        data: { content: nextContent },
      }).then(patchLocal);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setUploading(false);
    }
  }, [id, commitDoc, patchLocal, updateNode]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ----- Pan & zoom -----
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!doc.image) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const surf = surfaceRef.current;
    const clientX = e.clientX;
    const clientY = e.clientY;
    setZoom((z) => {
      const newZ = Math.max(0.2, Math.min(5, z * (1 + delta)));
      if (!surf || newZ === z) return newZ;
      const rect = surf.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 + panRef.current.x;
      const cy = rect.top + rect.height / 2 + panRef.current.y;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const f = newZ / z;
      setPan({
        x: panRef.current.x + dx * (1 - f),
        y: panRef.current.y + dy * (1 - f),
      });
      return newZ;
    });
  }, [doc.image]);

  // Pan dragging (only when select tool active and click on background).
  const dragging = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  const onSurfaceMouseDownPan = (e: React.MouseEvent) => {
    if (!doc.image) return;
    if (tool !== "select") return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-annot]")) return;
    if (target.closest("[data-map-overlay]")) return;
    if (e.button !== 0 && e.button !== 1) return;
    setSelectedAnnotId(null);
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPan: { ...panRef.current },
    };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragging.current;
      if (!d) return;
      setPan({
        x: d.startPan.x + (e.clientX - d.startX),
        y: d.startPan.y + (e.clientY - d.startY),
      });
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const fit = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Touch-screen pan and pinch-zoom.
  const toolRef = useRef(tool);
  toolRef.current = tool;
  useEffect(() => {
    const surf = surfaceRef.current;
    if (!surf) return;
    if (!doc.image) return;
    let mode: "none" | "pan" | "pinch" = "none";
    let panStart = { cx: 0, cy: 0, panX: 0, panY: 0 };
    let pinchStart = {
      dist: 0,
      midX: 0,
      midY: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
    };
    const isInteractive = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      if (
        target.closest("[data-annot]") ||
        target.closest("[data-map-overlay]")
      ) {
        return true;
      }
      if (target instanceof HTMLElement) {
        return !!(
          target.closest("input,textarea,button,select") ||
          target.isContentEditable
        );
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (toolRef.current !== "select") return;
        if (isInteractive(e.target)) return;
        mode = "pan";
        const t = e.touches[0];
        panStart = {
          cx: t.clientX,
          cy: t.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      } else if (e.touches.length === 2) {
        mode = "pinch";
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinchStart = {
          dist: dist || 1,
          midX: (a.clientX + b.clientX) / 2,
          midY: (a.clientY + b.clientY) / 2,
          zoom: zoomRef.current,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (mode === "pan" && e.touches.length === 1) {
        if (e.cancelable) e.preventDefault();
        const t = e.touches[0];
        setPan({
          x: panStart.panX + (t.clientX - panStart.cx),
          y: panStart.panY + (t.clientY - panStart.cy),
        });
      } else if (mode === "pinch" && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const ratio = dist / pinchStart.dist;
        const newZoom = Math.max(0.2, Math.min(5, pinchStart.zoom * ratio));
        const rect = surf.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 + pinchStart.panX;
        const cy = rect.top + rect.height / 2 + pinchStart.panY;
        const dx = pinchStart.midX - cx;
        const dy = pinchStart.midY - cy;
        const f = newZoom / pinchStart.zoom;
        setZoom(newZoom);
        setPan({
          x: pinchStart.panX + dx * (1 - f),
          y: pinchStart.panY + dy * (1 - f),
        });
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        mode = "none";
      } else if (mode === "pinch" && e.touches.length === 1) {
        mode = "pan";
        const t = e.touches[0];
        panStart = {
          cx: t.clientX,
          cy: t.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      }
    };
    surf.addEventListener("touchstart", onStart, { passive: true });
    surf.addEventListener("touchmove", onMove, { passive: false });
    surf.addEventListener("touchend", onEnd);
    surf.addEventListener("touchcancel", onEnd);
    return () => {
      surf.removeEventListener("touchstart", onStart);
      surf.removeEventListener("touchmove", onMove);
      surf.removeEventListener("touchend", onEnd);
      surf.removeEventListener("touchcancel", onEnd);
    };
  }, [doc.image]);

  // Convert client coords to image-relative percentages.
  const clientToImagePct = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const wrap = imageWrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      if (x < 0 || x > 100 || y < 0 || y > 100) return null;
      return { x, y };
    },
    [],
  );

  // Convert image-relative percentages to screen coordinates.
  const imagePctToClient = useCallback(
    (x: number, y: number): { cx: number; cy: number } | null => {
      const wrap = imageWrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      return {
        cx: rect.left + (x / 100) * rect.width,
        cy: rect.top + (y / 100) * rect.height,
      };
    },
    [],
  );

  // ----- Pin drop / removal -----
  // A sidebar drag that releases over the map image creates a pin at
  // that image-relative location pointing at the dragged node. The pin
  // renders as the node's avatar in a rounded square, with the title
  // underneath, and clicking it opens that node in the focused pane.
  // Drops outside the image area (the dark surround) are no-ops.
  const handlePinDrop = useCallback(
    (clientX: number, clientY: number, droppedNodeId: string) => {
      if (readOnly) return;
      // Pinning the map onto itself is meaningless.
      if (droppedNodeId === id) return;
      const pct = clientToImagePct(clientX, clientY);
      if (!pct) return;
      commitDoc((d) => ({
        ...d,
        pins: [
          ...d.pins,
          {
            id: newId("pin"),
            type: "pin",
            nodeId: droppedNodeId,
            x: pct.x,
            y: pct.y,
          },
        ],
      }));
    },
    [readOnly, id, clientToImagePct, commitDoc],
  );

  const removePin = useCallback(
    (pinId: string) => {
      commitDoc((d) => ({ ...d, pins: d.pins.filter((p) => p.id !== pinId) }));
    },
    [commitDoc],
  );

  // Convert a pointer position to image-relative percentages, clamped
  // to the image bounds. Unlike clientToImagePct (which returns null
  // outside the image), this keeps pin dragging usable even if the
  // pointer briefly strays past the image edge.
  const clientToImagePctClamped = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const wrap = imageWrapRef.current;
      if (!wrap) return null;
      const r = wrap.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      const x = ((clientX - r.left) / r.width) * 100;
      const y = ((clientY - r.top) / r.height) * 100;
      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
      };
    },
    [],
  );

  // Start dragging a pin. Reveals the remove button immediately so the
  // user can tap it during/after the gesture.
  const onPinPointerDown = useCallback(
    (e: React.PointerEvent, pin: MapPin) => {
      if (readOnly) return;
      // Only primary button / touch / pen — let right-click pass through.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.stopPropagation();
      e.preventDefault();
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {}
      revealPinX(pin.id);
      lastPinGestureRef.current = null;
      setPinDrag({
        id: pin.id,
        x: pin.x,
        y: pin.y,
        startX: pin.x,
        startY: pin.y,
        clientStartX: e.clientX,
        clientStartY: e.clientY,
        moved: false,
        startTime: performance.now(),
      });
    },
    [readOnly, revealPinX],
  );

  const onPinPointerMove = useCallback(
    (e: React.PointerEvent) => {
      setPinDrag((prev) => {
        if (!prev) return prev;
        const dx = e.clientX - prev.clientStartX;
        const dy = e.clientY - prev.clientStartY;
        const moved = prev.moved || dx * dx + dy * dy > 16;
        if (!moved) return prev;
        const pct = clientToImagePctClamped(e.clientX, e.clientY);
        if (!pct) return { ...prev, moved };
        return { ...prev, x: pct.x, y: pct.y, moved: true };
      });
    },
    [clientToImagePctClamped],
  );

  const onPinPointerUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {}
      setPinDrag((prev) => {
        if (!prev) return null;
        const duration = performance.now() - prev.startTime;
        // A "tap" is a quick press (< 250ms) without movement. Anything
        // longer (hold) or any drag suppresses the open-on-click.
        const tap = !prev.moved && duration < 250;
        lastPinGestureRef.current = { id: prev.id, tap };
        if (prev.moved) {
          // Commit the new position.
          commitDoc((d) => ({
            ...d,
            pins: d.pins.map((p) =>
              p.id === prev.id ? { ...p, x: prev.x, y: prev.y } : p,
            ),
          }));
        }
        return null;
      });
      scheduleHideX();
    },
    [commitDoc, scheduleHideX],
  );

  // HTML5 drag-over / drop on the map surface. We require an image to
  // be present so the pin has a coordinate space to live in.
  const onSurfaceDragOver = useCallback(
    (e: React.DragEvent) => {
      if (readOnly) return;
      if (!doc.image) return;
      if (!hasSidebarNodeDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOverMap(true);
    },
    [readOnly, doc.image],
  );

  const onSurfaceDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragOverMap(false);
  }, []);

  const onSurfaceDrop = useCallback(
    (e: React.DragEvent) => {
      setDragOverMap(false);
      const payload = getSidebarNodeDrag(e);
      if (!payload) return;
      e.preventDefault();
      e.stopPropagation();
      handlePinDrop(e.clientX, e.clientY, payload.nodeId);
    },
    [handlePinDrop],
  );

  // Touch drag-and-drop drop target. Mirrors the HTML5 path so finger
  // drags from the sidebar also drop pins. DocumentPane suppresses its
  // own edge-split touch target for map panes, so this registration is
  // the only thing receiving the drop.
  useEffect(() => {
    if (readOnly) return;
    const el = surfaceRef.current;
    if (!el) return;
    return registerTouchDropTarget({
      el,
      onHover: (active) => setDragOverMap(active),
      onDrop: ({ clientX, clientY, payload }) => {
        setDragOverMap(false);
        handlePinDrop(clientX, clientY, payload.nodeId);
      },
    });
  }, [readOnly, handlePinDrop]);

  // ----- Polygon pen-tool: cursor tracking + snapping -----
  // The snap source is the set of vertices on every FINALIZED region in
  // the current map. We deliberately exclude the in-progress draft so it
  // doesn't snap to itself; closing back to its first vertex is handled
  // separately via the close-hover indicator.
  const finalizedVertices = useMemo(
    () =>
      doc.annotations.flatMap((a) =>
        a.points.map((p) => ({ ...p, regionId: a.id })),
      ),
    [doc.annotations],
  );

  // Nearest finalized vertex to a given screen-space client point.
  // Returns the point (in image percentages) plus its screen coords and
  // owning region id, or null if no vertex is within SNAP_PX. Computed
  // in screen space so the snap radius feels the same at every zoom
  // level.
  const findSnap = useCallback(
    (
      clientX: number,
      clientY: number,
    ): { x: number; y: number; cx: number; cy: number; regionId: string } | null => {
      const wrap = imageWrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      let best:
        | { x: number; y: number; cx: number; cy: number; regionId: string }
        | null = null;
      let bestD2 = SNAP_PX * SNAP_PX;
      for (const p of finalizedVertices) {
        const cx = rect.left + (p.x / 100) * rect.width;
        const cy = rect.top + (p.y / 100) * rect.height;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2) {
          bestD2 = d2;
          best = { x: p.x, y: p.y, cx, cy, regionId: p.regionId };
        }
      }
      return best;
    },
    [finalizedVertices],
  );

  // Nearest point on any finalized region's EDGE to the given screen
  // point. Returns the projected point in image percentages plus its
  // screen coords, or null if no edge is within SNAP_PX. Computed in
  // screen space so the snap radius feels consistent at every zoom
  // level. Vertex snapping takes precedence — callers try findSnap
  // first and only fall back to this when no vertex is in range.
  //
  // `excludeRegionId` + `excludeVertexIndex` let a vertex drag skip the
  // two edges adjacent to the dragged vertex (which would otherwise
  // trivially "snap" to the cursor's own position).
  const findEdgeSnap = useCallback(
    (
      clientX: number,
      clientY: number,
      excludeRegionId?: string,
      excludeVertexIndex?: number,
    ): { x: number; y: number; cx: number; cy: number; regionId: string } | null => {
      const wrap = imageWrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      let best:
        | { x: number; y: number; cx: number; cy: number; regionId: string }
        | null = null;
      let bestD2 = SNAP_PX * SNAP_PX;
      for (const region of doc.annotations) {
        const n = region.points.length;
        if (n < 2) continue;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (
            excludeRegionId === region.id &&
            excludeVertexIndex !== undefined &&
            (i === excludeVertexIndex || j === excludeVertexIndex)
          ) {
            continue;
          }
          const a = region.points[i];
          const b = region.points[j];
          const ax = rect.left + (a.x / 100) * rect.width;
          const ay = rect.top + (a.y / 100) * rect.height;
          const bx = rect.left + (b.x / 100) * rect.width;
          const by = rect.top + (b.y / 100) * rect.height;
          const abx = bx - ax;
          const aby = by - ay;
          const len2 = abx * abx + aby * aby;
          if (len2 === 0) continue;
          let t = ((clientX - ax) * abx + (clientY - ay) * aby) / len2;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const cx = ax + t * abx;
          const cy = ay + t * aby;
          const dx = clientX - cx;
          const dy = clientY - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) {
            bestD2 = d2;
            const x = ((cx - rect.left) / rect.width) * 100;
            const y = ((cy - rect.top) / rect.height) * 100;
            best = { x, y, cx, cy, regionId: region.id };
          }
        }
      }
      return best;
    },
    [doc.annotations],
  );

  const isNearFirstVertex = useCallback(
    (clientX: number, clientY: number): boolean => {
      const draft = draftPolygon;
      if (!draft || draft.points.length === 0) return false;
      const sc = imagePctToClient(draft.points[0].x, draft.points[0].y);
      if (!sc) return false;
      const dx = clientX - sc.cx;
      const dy = clientY - sc.cy;
      return dx * dx + dy * dy <= POLY_CLOSE_PX * POLY_CLOSE_PX;
    },
    [draftPolygon, imagePctToClient],
  );

  // Live cursor / snap state for the in-progress polygon.
  const [polyCursor, setPolyCursor] = useState<{ x: number; y: number } | null>(null);
  const [polySnap, setPolySnap] = useState<
    { x: number; y: number; fromX: number; fromY: number; regionId: string } | null
  >(null);
  const [polyHoverFirst, setPolyHoverFirst] = useState(false);

  useEffect(() => {
    if (tool !== "polygon") {
      setPolyCursor(null);
      setPolySnap(null);
      setPolyHoverFirst(false);
      return;
    }
    const onMove = (e: MouseEvent) => {
      // Vertex snap wins over edge snap when both are in range.
      const snap =
        findSnap(e.clientX, e.clientY) ?? findEdgeSnap(e.clientX, e.clientY);
      const raw = clientToImagePct(e.clientX, e.clientY);
      setPolySnap(
        snap && raw
          ? { x: snap.x, y: snap.y, fromX: raw.x, fromY: raw.y, regionId: snap.regionId }
          : null,
      );
      if (snap) {
        setPolyCursor({ x: snap.x, y: snap.y });
      } else if (raw) {
        setPolyCursor(raw);
      }
      setPolyHoverFirst(isNearFirstVertex(e.clientX, e.clientY));
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [tool, clientToImagePct, findSnap, findEdgeSnap, isNearFirstVertex]);

  // ----- Region click-to-draw -----
  const finishPolygon = useCallback(() => {
    setDraftPolygon((d) => {
      if (!d) return null;
      if (d.points.length >= 3) {
        const finalized = d;
        commitDoc((doc) => ({
          ...doc,
          annotations: [...doc.annotations, finalized],
        }));
        setSelectedAnnotId(finalized.id);
      }
      return null;
    });
    setPolyCursor(null);
    setPolySnap(null);
    setPolyHoverFirst(false);
    setTool("select");
  }, [commitDoc]);

  const cancelDraftPolygon = useCallback(() => {
    setDraftPolygon(null);
    setPolyCursor(null);
    setPolySnap(null);
    setPolyHoverFirst(false);
  }, []);

  // Remove the most recently placed in-progress polygon point. If
  // only one point remains, cancels the draft entirely. Shared by
  // Backspace and right-click so both gestures stay in lockstep.
  const popLastDraftPoint = useCallback(() => {
    setDraftPolygon((d) => {
      if (!d) return d;
      if (d.points.length <= 1) return null;
      return { ...d, points: d.points.slice(0, -1) };
    });
  }, []);

  const onPolygonClick = (e: React.MouseEvent) => {
    if (readOnly || !doc.image) return;
    if (tool !== "polygon") return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-map-overlay]")) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    // Close-onto-first-vertex: requires at least 3 vertices and the
    // cursor near the first vertex. Snapping the closing click is implicit
    // because the first vertex was itself snapped when placed.
    if (
      draftPolygon &&
      draftPolygon.points.length >= 3 &&
      isNearFirstVertex(e.clientX, e.clientY)
    ) {
      finishPolygon();
      return;
    }

    // Otherwise, place a new vertex. Snap to a neighboring vertex when
    // one is in range — applies to every vertex including the first.
    // If no vertex is in range, fall back to the nearest point on a
    // neighboring region's edge so shared borders can be aligned cleanly.
    const snap =
      findSnap(e.clientX, e.clientY) ?? findEdgeSnap(e.clientX, e.clientY);
    let pos: { x: number; y: number } | null = snap
      ? { x: snap.x, y: snap.y }
      : clientToImagePct(e.clientX, e.clientY);
    if (!pos) return;
    const placedPos = pos;
    setDraftPolygon((d) => {
      if (!d) return { id: newId("poly"), type: "polygon", points: [placedPos], color };
      return { ...d, points: [...d.points, placedPos] };
    });
  };

  const removeAnnotation = useCallback(
    (annId: string) => {
      commitDoc((d) => ({ ...d, annotations: d.annotations.filter((a) => a.id !== annId) }));
      setSelectedAnnotId((cur) => (cur === annId ? null : cur));
    },
    [commitDoc],
  );

  const updateRegionColor = useCallback(
    (annId: string, nextColor: string) => {
      commitDoc((d) => ({
        ...d,
        annotations: d.annotations.map((a) =>
          a.id === annId ? { ...a, color: nextColor } : a,
        ),
      }));
    },
    [commitDoc],
  );

  // ----- Vertex editing on finalized regions -----
  // Clear vertex selection when the region selection or tool changes,
  // so stray Delete keypresses don't remove a vertex from a region the
  // user is no longer looking at.
  useEffect(() => {
    setSelectedVertex((cur) =>
      cur && cur.regionId === selectedAnnotId ? cur : null,
    );
  }, [selectedAnnotId]);
  useEffect(() => {
    if (tool !== "select") {
      setSelectedVertex(null);
      setDraggingVertex(null);
      setVertexDragSnap(null);
    }
  }, [tool]);

  // Find the nearest vertex on ANY finalized region to the given screen
  // point, excluding one specific (regionId, index) pair. Used as the
  // snap target while dragging a vertex.
  const findVertexDragSnap = useCallback(
    (
      clientX: number,
      clientY: number,
      excludeRegionId: string,
      excludeIndex: number,
    ): { x: number; y: number; regionId: string } | null => {
      const wrap = imageWrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      let best: { x: number; y: number; regionId: string } | null = null;
      let bestD2 = SNAP_PX * SNAP_PX;
      for (const region of doc.annotations) {
        for (let i = 0; i < region.points.length; i++) {
          if (region.id === excludeRegionId && i === excludeIndex) continue;
          const p = region.points[i];
          const cx = rect.left + (p.x / 100) * rect.width;
          const cy = rect.top + (p.y / 100) * rect.height;
          const dx = clientX - cx;
          const dy = clientY - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) {
            bestD2 = d2;
            best = { x: p.x, y: p.y, regionId: region.id };
          }
        }
      }
      return best;
    },
    [doc.annotations],
  );

  // Nearest point on the infinite line through either edge adjacent to
  // the dragged vertex, using the vertex's *drag-start* position as one
  // anchor and the (stationary) neighbor as the other. Lets users snap
  // a dragged vertex back onto the original direction of either
  // adjacent edge — handy for straightening a kinked border. Returns
  // null when no extension line is within SNAP_PX in screen space.
  const findEdgeExtensionSnap = useCallback(
    (
      clientX: number,
      clientY: number,
      regionId: string,
      index: number,
      startPos: { x: number; y: number },
    ): { x: number; y: number; regionId: string } | null => {
      const wrap = imageWrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const region = doc.annotations.find((a) => a.id === regionId);
      if (!region) return null;
      const n = region.points.length;
      if (n < 2) return null;
      const prev = region.points[(index - 1 + n) % n];
      const next = region.points[(index + 1) % n];
      const sx = rect.left + (startPos.x / 100) * rect.width;
      const sy = rect.top + (startPos.y / 100) * rect.height;
      let best: { x: number; y: number; regionId: string } | null = null;
      let bestD2 = SNAP_PX * SNAP_PX;
      for (const nb of [prev, next]) {
        const nx = rect.left + (nb.x / 100) * rect.width;
        const ny = rect.top + (nb.y / 100) * rect.height;
        const abx = sx - nx;
        const aby = sy - ny;
        const len2 = abx * abx + aby * aby;
        if (len2 === 0) continue;
        // Project cursor onto the infinite line through (nb, startPos).
        const t = ((clientX - nx) * abx + (clientY - ny) * aby) / len2;
        const cx = nx + t * abx;
        const cy = ny + t * aby;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2) {
          bestD2 = d2;
          const x = ((cx - rect.left) / rect.width) * 100;
          const y = ((cy - rect.top) / rect.height) * 100;
          best = { x, y, regionId };
        }
      }
      return best;
    },
    [doc.annotations],
  );

  // Hard constraint: nearest point on the nearer of the two adjacent
  // extension lines, regardless of distance. Used while Shift is held
  // during a vertex drag to lock movement onto an adjacent edge's
  // direction. Same geometry as `findEdgeExtensionSnap` but without the
  // SNAP_PX cap and always returning a result when neighbors are
  // distinct.
  const findExtensionConstraint = useCallback(
    (
      clientX: number,
      clientY: number,
      regionId: string,
      index: number,
      startPos: { x: number; y: number },
    ): { x: number; y: number; regionId: string } | null => {
      const wrap = imageWrapRef.current;
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const region = doc.annotations.find((a) => a.id === regionId);
      if (!region) return null;
      const n = region.points.length;
      if (n < 2) return null;
      const prev = region.points[(index - 1 + n) % n];
      const next = region.points[(index + 1) % n];
      const sx = rect.left + (startPos.x / 100) * rect.width;
      const sy = rect.top + (startPos.y / 100) * rect.height;
      let best: { x: number; y: number; regionId: string } | null = null;
      let bestD2 = Infinity;
      for (const nb of [prev, next]) {
        const nx = rect.left + (nb.x / 100) * rect.width;
        const ny = rect.top + (nb.y / 100) * rect.height;
        const abx = sx - nx;
        const aby = sy - ny;
        const len2 = abx * abx + aby * aby;
        if (len2 === 0) continue;
        const t = ((clientX - nx) * abx + (clientY - ny) * aby) / len2;
        const cx = nx + t * abx;
        const cy = ny + t * aby;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          const x = ((cx - rect.left) / rect.width) * 100;
          const y = ((cy - rect.top) / rect.height) * 100;
          best = { x, y, regionId };
        }
      }
      return best;
    },
    [doc.annotations],
  );

  // Drag bookkeeping: keep the active drag in a ref so the global
  // mousemove/up listeners can see the latest values without
  // re-subscribing on every render.
  const vertexDragRef = useRef<
    {
      regionId: string;
      index: number;
      snapshotPushed: boolean;
      pointerId: number;
      pointerType: string;
      startX: number;
      startY: number;
      moved: boolean;
      startPos: { x: number; y: number };
    } | null
  >(null);
  // Pending long-press timer for touch deletion of a vertex.
  const longPressRef = useRef<{
    timer: number;
    regionId: string;
    index: number;
  } | null>(null);
  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }, []);
  // Ensure no stray long-press timer fires after unmount or tool
  // change (e.g. switching away from the select tool tears down the
  // handle elements without firing pointerup).
  useEffect(() => {
    return () => {
      if (longPressRef.current) {
        window.clearTimeout(longPressRef.current.timer);
        longPressRef.current = null;
      }
    };
  }, [tool]);

  // Remove a vertex by index. Refuses if it would leave fewer than 3.
  const removeVertex = useCallback(
    (regionId: string, index: number) => {
      const region = doc.annotations.find((a) => a.id === regionId);
      if (!region) return;
      if (region.points.length <= 3) {
        toast.error("A region needs at least 3 vertices");
        return;
      }
      commitDoc((d) => ({
        ...d,
        annotations: d.annotations.map((a) =>
          a.id === regionId
            ? { ...a, points: a.points.filter((_, i) => i !== index) }
            : a,
        ),
      }));
      setSelectedVertex((cur) => {
        if (!cur || cur.regionId !== regionId) return cur;
        if (cur.index === index) return null;
        return cur.index > index ? { ...cur, index: cur.index - 1 } : cur;
      });
    },
    [doc.annotations, commitDoc],
  );

  const onVertexPointerDown = useCallback(
    (e: React.PointerEvent, regionId: string, index: number) => {
      if (readOnly) return;
      if (tool !== "select") return;
      // Ignore non-primary mouse buttons; touch/pen primary is button 0.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      setSelectedAnnotId(regionId);
      setSelectedVertex({ regionId, index });
      setDraggingVertex({ regionId, index });
      const region = doc.annotations.find((a) => a.id === regionId);
      const startPos = region?.points[index];
      if (!startPos) return;
      vertexDragRef.current = {
        regionId,
        index,
        snapshotPushed: false,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        startPos: { x: startPos.x, y: startPos.y },
      };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        // Some browsers throw if the pointer is no longer active.
      }
      // Long-press to delete on touch (no right-click available).
      clearLongPress();
      if (e.pointerType === "touch") {
        const timer = window.setTimeout(() => {
          const d = vertexDragRef.current;
          if (!d || d.moved) return;
          if (d.regionId !== regionId || d.index !== index) return;
          // Cancel the in-flight drag so the long-press only deletes.
          vertexDragRef.current = null;
          setDraggingVertex(null);
          setVertexDragSnap(null);
          longPressRef.current = null;
          removeVertex(regionId, index);
        }, 550);
        longPressRef.current = { timer, regionId, index };
      }
      surfaceRef.current?.focus({ preventScroll: true });
    },
    [readOnly, tool, clearLongPress, removeVertex, doc.annotations],
  );

  const onVertexContextMenu = useCallback(
    (e: React.MouseEvent, regionId: string, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (readOnly) return;
      removeVertex(regionId, index);
    },
    [readOnly, removeVertex],
  );

  // Global pointer handlers for the in-progress vertex drag. Pointer
  // events unify mouse, touch and pen input — combined with
  // setPointerCapture on the handle this gives us consistent drag
  // behavior across all input types.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = vertexDragRef.current;
      if (!d) return;
      if (e.pointerId !== d.pointerId) return;
      if (!d.moved) {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (dx * dx + dy * dy > 25) {
          d.moved = true;
          // Movement cancels a pending long-press deletion.
          if (longPressRef.current) {
            window.clearTimeout(longPressRef.current.timer);
            longPressRef.current = null;
          }
        } else {
          // Don't mutate the vertex until movement exceeds the
          // threshold — keeps long-press steady and avoids jitter
          // from minor finger tremor during a tap.
          return;
        }
      }
      // Holding Shift hard-constrains the dragged vertex to whichever
      // adjacent-edge extension line is closer to the cursor —
      // regardless of distance — so users can straighten a border
      // precisely. Ignored for touch (no shift key on a finger).
      const shiftConstrain =
        e.shiftKey && d.pointerType !== "touch"
          ? findExtensionConstraint(
              e.clientX,
              e.clientY,
              d.regionId,
              d.index,
              d.startPos,
            )
          : null;
      // Vertex snap wins over edge snap when both are in range. The
      // edge snap skips the two edges adjacent to the dragged vertex,
      // which would otherwise trivially "snap" to the cursor itself.
      // As a last fallback, snap onto the infinite line through either
      // adjacent edge (anchored at the drag-start position) so users
      // can straighten a kinked border. Vertex/finite-edge snaps still
      // win when in range.
      const snap =
        shiftConstrain ??
        findVertexDragSnap(e.clientX, e.clientY, d.regionId, d.index) ??
        findEdgeSnap(e.clientX, e.clientY, d.regionId, d.index) ??
        findEdgeExtensionSnap(
          e.clientX,
          e.clientY,
          d.regionId,
          d.index,
          d.startPos,
        );
      const raw = clientToImagePct(e.clientX, e.clientY);
      const pos = snap ?? raw;
      if (!pos) return;
      setVertexDragSnap(
        snap && raw
          ? { x: snap.x, y: snap.y, fromX: raw.x, fromY: raw.y, regionId: snap.regionId }
          : null,
      );
      const newPos = pos;
      const apply = (cur: MapDoc): MapDoc => ({
        ...cur,
        annotations: cur.annotations.map((a) =>
          a.id === d.regionId
            ? {
                ...a,
                points: a.points.map((p, i) =>
                  i === d.index ? newPos : p,
                ),
              }
            : a,
        ),
      });
      if (!d.snapshotPushed) {
        d.snapshotPushed = true;
        setDoc((cur) => {
          pushSnapshot(cur);
          return apply(cur);
        });
      } else {
        setDoc((cur) => apply(cur));
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = vertexDragRef.current;
      if (!d) return;
      if (e.pointerId !== d.pointerId) return;
      vertexDragRef.current = null;
      setDraggingVertex(null);
      setVertexDragSnap(null);
      if (longPressRef.current) {
        window.clearTimeout(longPressRef.current.timer);
        longPressRef.current = null;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    findVertexDragSnap,
    findEdgeSnap,
    findEdgeExtensionSnap,
    findExtensionConstraint,
    clientToImagePct,
    pushSnapshot,
  ]);

  // Click on an edge inserts a new vertex at the closest point along
  // that segment, between the two existing vertices.
  const onEdgePointerDown = useCallback(
    (
      e: React.PointerEvent,
      regionId: string,
      edgeIndex: number,
    ) => {
      if (readOnly) return;
      if (tool !== "select") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const region = doc.annotations.find((a) => a.id === regionId);
      if (!region) return;
      const click = clientToImagePct(e.clientX, e.clientY);
      if (!click) return;
      const p1 = region.points[edgeIndex];
      const p2 = region.points[(edgeIndex + 1) % region.points.length];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0
        ? ((click.x - p1.x) * dx + (click.y - p1.y) * dy) / len2
        : 0;
      t = Math.max(0, Math.min(1, t));
      const newPt = { x: p1.x + t * dx, y: p1.y + t * dy };
      commitDoc((d) => ({
        ...d,
        annotations: d.annotations.map((a) =>
          a.id === regionId
            ? {
                ...a,
                points: [
                  ...a.points.slice(0, edgeIndex + 1),
                  newPt,
                  ...a.points.slice(edgeIndex + 1),
                ],
              }
            : a,
        ),
      }));
      const insertedIndex = edgeIndex + 1;
      setSelectedAnnotId(regionId);
      setSelectedVertex({ regionId, index: insertedIndex });
      // Immediately start dragging the new vertex so the user can
      // place it precisely without an extra click. We capture the
      // pointer on the edge element so subsequent move/up events
      // route through the same target — important for touch.
      setDraggingVertex({ regionId, index: insertedIndex });
      vertexDragRef.current = {
        regionId,
        index: insertedIndex,
        snapshotPushed: true, // commitDoc above already snapshotted
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        startPos: newPt,
      };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      surfaceRef.current?.focus({ preventScroll: true });
    },
    [readOnly, tool, doc.annotations, clientToImagePct, commitDoc],
  );

  // ----- Undo / Redo -----
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1];
      const past = h.past.slice(0, -1);
      setDoc((cur) => {
        setHistory((hh) => ({ past, future: [...hh.future, cur] }));
        return prev;
      });
      return h;
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[h.future.length - 1];
      const future = h.future.slice(0, -1);
      setDoc((cur) => {
        setHistory((hh) => ({ past: [...hh.past, cur], future }));
        return next;
      });
      return h;
    });
  }, []);

  const onSurfaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (readOnly) return;
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable)
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        undo();
        return;
      }
      if (mod && ((key === "z" && e.shiftKey) || key === "y")) {
        e.preventDefault();
        e.nativeEvent.stopPropagation();
        redo();
        return;
      }
      if (draftPolygon) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelDraftPolygon();
        } else if (e.key === "Enter") {
          e.preventDefault();
          finishPolygon();
        } else if (e.key === "Backspace") {
          e.preventDefault();
          popLastDraftPoint();
        }
        return;
      }
      // Delete a selected vertex on a finalized region.
      if (selectedVertex && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removeVertex(selectedVertex.regionId, selectedVertex.index);
      }
    },
    [
      readOnly,
      undo,
      redo,
      draftPolygon,
      cancelDraftPolygon,
      finishPolygon,
      popLastDraftPoint,
      selectedVertex,
      removeVertex,
      doc.annotations,
      commitDoc,
    ],
  );

  useEffect(() => {
    return registerPaneShortcuts(paneId, { undo, redo });
  }, [paneId, undo, redo]);

  const cursorStyle =
    tool === "select"
      ? dragging.current
        ? "grabbing"
        : "default"
      : "crosshair";

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-card">
      <PaneControls nodeId={id} onClosePane={onClosePane} />
      {/* Header */}
      <div className="flex flex-col gap-1 px-4 pt-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2 pr-24">
          <input
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-xl font-semibold tracking-tight text-foreground placeholder:text-foreground/30"
            value={title}
            placeholder="Untitled Map"
            onChange={(e) => setTitle(e.target.value)}
            readOnly={readOnly}
          />
          {doc.image && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-[11px]"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Replace map image"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
              Replace
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <span className="uppercase tracking-wider">Key</span>
          <input
            className="font-mono bg-transparent border-b border-transparent hover:border-border focus:border-primary/60 focus:ring-0 outline-none px-1 py-0.5 text-[11px] text-foreground/80 w-32"
            value={nodeKey}
            placeholder="key"
            spellCheck={false}
            onChange={(e) => setNodeKey(e.target.value)}
            readOnly={readOnly}
            title="Unique handle for this node within the realm"
          />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          handleFile(f);
          e.target.value = "";
        }}
      />

      {!doc.image && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
            <MapIcon className="h-8 w-8 opacity-60" />
          </div>
          <div className="text-sm">No map image yet</div>
          {!readOnly ? (
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload map image
            </Button>
          ) : (
            <div className="text-xs">Read-only realm</div>
          )}
          <div className="text-[11px] opacity-70 max-w-xs text-center">
            PNG, JPG, WebP. After uploading you can draw polygon regions
            with the region tool — click to add vertices, click the first
            vertex (or press Enter) to close.
          </div>
        </div>
      )}

      {doc.image && (
        <div
          ref={surfaceRef}
          tabIndex={0}
          className="flex-1 relative overflow-hidden bg-[#0c1218] select-none focus:outline-none"
          onWheel={onWheel}
          onMouseDown={(e) => {
            const tgt = e.target as HTMLElement | null;
            const isFormControl = tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);
            if (!isFormControl) {
              surfaceRef.current?.focus({ preventScroll: true });
            }
            notePaneActive(paneId);
            onSurfaceMouseDownPan(e);
            // If a touch long-press just popped the last polygon point,
            // swallow the synthetic mousedown that follows finger release
            // so we don't immediately place a new vertex at that spot.
            if (suppressNextPolyClickRef.current) {
              suppressNextPolyClickRef.current = false;
              return;
            }
            onPolygonClick(e);
          }}
          onPointerDown={(e) => {
            // Touch-only: arm a long-press timer that pops the last
            // polygon point, mirroring the desktop right-click gesture.
            if (e.pointerType !== "touch") return;
            if (tool !== "polygon" || !draftPolygon) return;
            const tgt = e.target as HTMLElement | null;
            if (tgt && tgt.closest("[data-map-overlay]")) return;
            clearLongPressTimer();
            longPressStartRef.current = { x: e.clientX, y: e.clientY };
            longPressTimerRef.current = window.setTimeout(() => {
              longPressTimerRef.current = null;
              longPressStartRef.current = null;
              suppressNextPolyClickRef.current = true;
              lastLongPressPopAtRef.current = Date.now();
              popLastDraftPoint();
            }, 500);
          }}
          onPointerMove={(e) => {
            if (longPressStartRef.current == null) return;
            const dx = e.clientX - longPressStartRef.current.x;
            const dy = e.clientY - longPressStartRef.current.y;
            if (dx * dx + dy * dy > 100) clearLongPressTimer();
          }}
          onPointerUp={clearLongPressTimer}
          onPointerCancel={clearLongPressTimer}
          onFocus={() => notePaneActive(paneId)}
          onKeyDown={onSurfaceKeyDown}
          onDragOver={onSurfaceDragOver}
          onDragLeave={onSurfaceDragLeave}
          onDrop={onSurfaceDrop}
          onContextMenuCapture={(e) => {
            // While drawing a polygon, right-click pops the last
            // placed point (or cancels the draft if only one point
            // remains). Capture-phase so it pre-empts any child
            // right-click handlers (e.g. finalized region delete).
            if (tool === "polygon" && draftPolygon) {
              e.preventDefault();
              e.stopPropagation();
              // Guard against the synthetic contextmenu some mobile
              // browsers emit right after a touch long-press already
              // popped the last point — would otherwise double-pop.
              if (Date.now() - lastLongPressPopAtRef.current < 800) return;
              popLastDraftPoint();
            }
          }}
          onDoubleClick={() => {
            if (tool === "polygon" && draftPolygon) finishPolygon();
          }}
          style={{ cursor: cursorStyle }}
        >
          {/* Pan/zoom container */}
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            <div ref={imageWrapRef} className="relative">
              <img
                src={uploading && localPreviewUrl ? localPreviewUrl : objectUrl(doc.image)}
                alt={node.title}
                draggable={false}
                onLoad={() => {
                  // Once the served URL has actually rendered (i.e.
                  // we're no longer showing the local preview), drop
                  // the blob URL so we don't keep the File reference
                  // alive forever.
                  if (!uploading && localPreviewUrl) {
                    setLocalPreviewUrl((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                  }
                }}
                className="block max-w-none pointer-events-none"
                style={{ maxHeight: "none" }}
              />

              {/* SVG overlay (uses 0..100 viewBox so we use % directly) */}
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ pointerEvents: "none" }}
              >
                {[
                  ...doc.annotations,
                  ...(draftPolygon ? [draftPolygon] : []),
                ].map((a) =>
                  renderRegion(a, readOnly, removeAnnotation, tool, (region) => {
                    setSelectedAnnotId(region.id);
                  }),
                )}
                {/* Edge hit-targets for the selected region: clicking
                    inserts a new vertex at the closest point on that
                    edge. Stroke is transparent so it's invisible but
                    still picks up clicks via pointer-events="stroke". */}
                {!readOnly && tool === "select" && selectedAnnotId && (() => {
                  const region = doc.annotations.find(
                    (a) => a.id === selectedAnnotId,
                  );
                  if (!region || region.points.length < 2) return null;
                  return (
                    <g>
                      {region.points.map((p, i) => {
                        const p2 = region.points[(i + 1) % region.points.length];
                        return (
                          <line
                            key={`edge-${i}`}
                            data-annot
                            x1={p.x}
                            y1={p.y}
                            x2={p2.x}
                            y2={p2.y}
                            stroke="transparent"
                            strokeWidth={3}
                            style={{
                              pointerEvents: "stroke",
                              cursor: "copy",
                              touchAction: "none",
                            }}
                            onPointerDown={(e) =>
                              onEdgePointerDown(e, region.id, i)
                            }
                          >
                            <title>Click to insert a vertex</title>
                          </line>
                        );
                      })}
                    </g>
                  );
                })()}
                {tool === "polygon" && draftPolygon && polyCursor && draftPolygon.points.length > 0 && (
                  <line
                    x1={draftPolygon.points[draftPolygon.points.length - 1].x}
                    y1={draftPolygon.points[draftPolygon.points.length - 1].y}
                    x2={polyCursor.x}
                    y2={polyCursor.y}
                    stroke={color}
                    strokeWidth={0.4}
                    strokeDasharray="1 1"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
                {/* Snap indicator — highlighted dot at the snap target.
                    Rendered above everything else so it stays visible
                    when overlapping a finalized region's border. Shared
                    between the polygon pen-tool and vertex dragging. */}
                {(() => {
                  const snap =
                    tool === "polygon"
                      ? polySnap
                      : draggingVertex
                        ? vertexDragSnap
                        : null;
                  if (!snap) return null;
                  const showLine =
                    Math.abs(snap.fromX - snap.x) > 0.01 ||
                    Math.abs(snap.fromY - snap.y) > 0.01;
                  // Highlight the owning region's outline so users can
                  // instantly see which region the snap target belongs
                  // to in a dense map.
                  const ownerRegion = doc.annotations.find(
                    (a) => a.id === snap.regionId,
                  );
                  const ownerPts = ownerRegion
                    ? ownerRegion.points.map((p) => `${p.x},${p.y}`).join(" ")
                    : null;
                  return (
                    <g pointerEvents="none">
                      {ownerPts && (
                        <polygon
                          points={ownerPts}
                          fill="none"
                          stroke="#facc15"
                          strokeWidth={1.4}
                          strokeOpacity={0.9}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          style={{
                            filter:
                              "drop-shadow(0 0 2px #facc15) drop-shadow(0 0 4px #facc15)",
                          }}
                        />
                      )}
                      {showLine && (
                        <line
                          x1={snap.fromX}
                          y1={snap.fromY}
                          x2={snap.x}
                          y2={snap.y}
                          stroke="#facc15"
                          strokeWidth={0.5}
                          strokeOpacity={0.6}
                          strokeDasharray="1 1"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </g>
                  );
                })()}
              </svg>

              {/* Snap target marker. Rendered as an HTML element rather
                  than an SVG <circle> because the SVG viewBox is
                  stretched (preserveAspectRatio="none") to fit the
                  image, so an SVG circle becomes an oval on non-square
                  images. An HTML div with equal width/height stays a
                  true circle, and a counter scale(1/zoom) keeps the
                  on-screen size constant. */}
              {(() => {
                const snap =
                  tool === "polygon"
                    ? polySnap
                    : draggingVertex
                      ? vertexDragSnap
                      : null;
                if (!snap) return null;
                return (
                  <div
                    className="absolute"
                    data-map-overlay
                    style={{
                      left: `${snap.x}%`,
                      top: `${snap.y}%`,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                        transformOrigin: "center center",
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "#fef08a",
                          border: "1.5px solid #facc15",
                          boxShadow: "0 0 4px rgba(250,204,21,0.6)",
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Vertex handles for the selected region in select mode.
                  Rendered as HTML inside the zoom-transformed wrapper
                  so they follow the image during pan/zoom. A counter
                  scale(1/zoom) keeps their on-screen size constant. */}
              {!readOnly && tool === "select" && selectedAnnotId && (() => {
                const region = doc.annotations.find(
                  (a) => a.id === selectedAnnotId,
                );
                if (!region) return null;
                return (
                  <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                    {region.points.map((p, i) => {
                      const isDragging =
                        draggingVertex?.regionId === region.id &&
                        draggingVertex.index === i;
                      const isSelected =
                        selectedVertex?.regionId === region.id &&
                        selectedVertex.index === i;
                      return (
                        <div
                          key={i}
                          data-annot
                          title="Drag to move · long-press, right-click, or Delete to remove"
                          style={{
                            position: "absolute",
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            width: 12,
                            height: 12,
                            transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                            transformOrigin: "center center",
                            borderRadius: "9999px",
                            background: isDragging || isSelected ? region.color : "#ffffff",
                            border: `2px solid ${region.color}`,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                            pointerEvents: "auto",
                            cursor: isDragging ? "grabbing" : "grab",
                            touchAction: "none",
                          }}
                          onPointerDown={(e) =>
                            onVertexPointerDown(e, region.id, i)
                          }
                          onContextMenu={(e) =>
                            onVertexContextMenu(e, region.id, i)
                          }
                        />
                      );
                    })}
                    {/* Touch-friendly delete button next to the
                        currently-selected vertex. Always visible (not
                        just on touch) so the affordance is discoverable
                        and works for keyboard / mouse users too. */}
                    {selectedVertex?.regionId === region.id && (() => {
                      const v = region.points[selectedVertex.index];
                      if (!v) return null;
                      const canDelete = region.points.length > 3;
                      return (
                        <div
                          data-annot
                          role="button"
                          aria-label="Remove vertex"
                          title="Remove vertex"
                          style={{
                            position: "absolute",
                            left: `${v.x}%`,
                            top: `${v.y}%`,
                            width: 18,
                            height: 18,
                            transform: `translate(40%, -140%) scale(${1 / zoom})`,
                            transformOrigin: "center center",
                            borderRadius: "9999px",
                            background: canDelete ? "#ef4444" : "#9ca3af",
                            color: "#ffffff",
                            border: "2px solid #ffffff",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            lineHeight: 1,
                            fontWeight: 700,
                            pointerEvents: "auto",
                            cursor: canDelete ? "pointer" : "not-allowed",
                            opacity: canDelete ? 1 : 0.7,
                            touchAction: "none",
                            userSelect: "none",
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (readOnly) return;
                            removeVertex(region.id, selectedVertex.index);
                          }}
                        >
                          ×
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
              {/* In-progress polygon vertex markers. Rendered as HTML
                  divs (like finalized vertex handles) so they stay
                  perfectly round and fixed in on-screen size at every
                  zoom level and map aspect ratio. */}
              {tool === "polygon" && draftPolygon && (
                <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                  {draftPolygon.points.map((p, i) => {
                    const isFirstHover = i === 0 && polyHoverFirst;
                    const size = isFirstHover ? 18 : 12;
                    return (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          left: `${p.x}%`,
                          top: `${p.y}%`,
                          width: size,
                          height: size,
                          transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                          transformOrigin: "center center",
                          borderRadius: "9999px",
                          background: isFirstHover ? color : "#ffffff",
                          border: `2px solid ${color}`,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Pin overlay — rendered OUTSIDE the zoom-transformed
              wrapper so the avatar image isn't blurred by the parent's
              CSS scale chain. Positions are derived from the image
              wrapper's bounding rect (recomputed each render; the
              ResizeObserver above triggers re-renders on layout-only
              changes such as image load). pan, zoom, and wrapTick are
              all in the dependency surface so this stays in sync. */}
          {doc.pins.length > 0 && (() => {
            void wrapTick; // touch dep so the closure re-evaluates
            void pan;      // implicit dep: positions move with pan
            void zoom;     // implicit dep: positions move with zoom
            const wrap = imageWrapRef.current;
            const surface = surfaceRef.current;
            if (!wrap || !surface) return null;
            const w = wrap.getBoundingClientRect();
            const s = surface.getBoundingClientRect();
            if (w.width <= 0 || w.height <= 0) return null;
            return (
              <div
                className="absolute"
                style={{
                  left: w.left - s.left,
                  top: w.top - s.top,
                  width: w.width,
                  height: w.height,
                  pointerEvents: "none",
                }}
              >
                {doc.pins.map((pin) => {
                  const target = nodeById.get(pin.nodeId);
                  const label =
                    target?.title || target?.key || "Missing node";
                  const Icon = getKindIcon(target?.kind || "note");
                  const isDragging = pinDrag?.id === pin.id;
                  const renderX = isDragging ? pinDrag!.x : pin.x;
                  const renderY = isDragging ? pinDrag!.y : pin.y;
                  const showRemove =
                    !readOnly && revealedPinId === pin.id;
                  return (
                    <div
                      key={pin.id}
                      data-map-overlay
                      className="absolute"
                      style={{
                        left: `${renderX}%`,
                        top: `${renderY}%`,
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        className="relative"
                        style={{
                          transform: "translate(-50%, -50%)",
                          pointerEvents: "auto",
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const g = lastPinGestureRef.current;
                            lastPinGestureRef.current = null;
                            if (!g || g.id !== pin.id || !g.tap) return;
                            openInFocused(pin.nodeId);
                          }}
                          onPointerDown={(e) => onPinPointerDown(e, pin)}
                          onPointerMove={onPinPointerMove}
                          onPointerUp={onPinPointerUp}
                          onPointerCancel={onPinPointerUp}
                          className={`flex flex-col items-center gap-1 focus:outline-none ${readOnly ? "cursor-pointer" : isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                          title={
                            target
                              ? readOnly
                                ? `Open ${label}`
                                : `Tap to open ${label}, drag to move`
                              : "Linked node not found"
                          }
                        >
                          <div className="w-12 h-12 rounded-md border border-border bg-card shadow-lg overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-primary/60 transition pointer-events-none">
                            <NodeAvatar
                              imageUrl={target?.imageUrl}
                              icon={Icon}
                              iconClassName="h-6 w-6 text-muted-foreground"
                              imgClassName="w-full h-full object-cover"
                              alt={label}
                            />
                          </div>
                          <span className="max-w-[8rem] truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-foreground bg-card/90 border border-border shadow-sm pointer-events-none">
                            {label}
                          </span>
                        </button>
                        {showRemove && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePin(pin.id);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              revealPinX(pin.id);
                            }}
                            onPointerUp={() => scheduleHideX()}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-card border border-border shadow flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition"
                            title="Remove pin"
                            aria-label="Remove pin"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Floating LEFT toolbar */}
          {!readOnly && (
            <div
              data-map-overlay
              className="absolute top-3 left-3 flex flex-col gap-1 bg-card/95 border border-border rounded-md shadow-lg p-1 backdrop-blur-sm"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo (Cmd/Ctrl+Z)"
                  className="w-11 h-11 md:w-8 md:h-8 rounded flex items-center justify-center text-foreground/70 hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <Undo2 className="h-5 w-5 md:h-4 md:w-4" />
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo (Cmd/Ctrl+Shift+Z)"
                  className="w-11 h-11 md:w-8 md:h-8 rounded flex items-center justify-center text-foreground/70 hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <Redo2 className="h-5 w-5 md:h-4 md:w-4" />
                </button>
              </div>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => {
                  setTool("select");
                  cancelDraftPolygon();
                }}
                title="Select / pan"
                className={`w-11 h-11 md:w-8 md:h-8 rounded flex items-center justify-center transition-colors ${
                  tool === "select"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/70 hover:bg-muted/50"
                }`}
              >
                <MousePointer2 className="h-5 w-5 md:h-4 md:w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTool("polygon");
                  setSelectedAnnotId(null);
                }}
                title="Region (click to add vertex · click first point or Enter to close · Esc cancels · snaps to neighbor vertices)"
                className={`w-11 h-11 md:w-8 md:h-8 rounded flex items-center justify-center transition-colors ${
                  tool === "polygon"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/70 hover:bg-muted/50"
                }`}
              >
                <Hexagon className="h-5 w-5 md:h-4 md:w-4" />
              </button>
              <div className="my-1 border-t border-border" />
              {/* Color swatch picker — drives the color of the next new region. */}
              <div className="grid grid-cols-2 gap-1 px-0.5">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    title={c}
                    className={`w-5 h-5 md:w-3.5 md:h-3.5 rounded-sm border ${color === c ? "ring-2 ring-foreground/60 ring-offset-1 ring-offset-card" : "border-border"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {tool === "polygon" && draftPolygon && (
                <>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={finishPolygon}
                    className="px-1.5 py-1 text-[10px] rounded bg-accent text-accent-foreground hover:opacity-90"
                    title="Close region (Enter)"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          )}

          {/* Floating RIGHT zoom controls */}
          <div
            data-map-overlay
            className="absolute bottom-3 right-3 flex flex-col gap-1 bg-card/90 border border-border rounded-md shadow-lg p-1 backdrop-blur-sm"
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 md:h-7 md:w-7"
              onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
              title="Zoom in"
            >
              <ZoomIn className="h-5 w-5 md:h-3.5 md:w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 md:h-7 md:w-7"
              onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
              title="Zoom out"
            >
              <ZoomOut className="h-5 w-5 md:h-3.5 md:w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 md:h-7 md:w-7"
              onClick={fit}
              title="Reset view"
            >
              <Maximize2 className="h-5 w-5 md:h-3.5 md:w-3.5" />
            </Button>
            <div className="text-[9px] text-center text-muted-foreground pt-0.5">
              {Math.round(zoom * 100)}%
            </div>
          </div>

          {/* Inline color picker for the currently selected region. */}
          {!readOnly && selectedAnnotId && (() => {
            const sel = doc.annotations.find((a) => a.id === selectedAnnotId);
            if (!sel) return null;
            const c = regionCentroid(sel);
            if (!c) return null;
            const wrap = imageWrapRef.current;
            const surface = surfaceRef.current;
            let left = 0;
            let top = 0;
            if (wrap && surface) {
              const w = wrap.getBoundingClientRect();
              const s = surface.getBoundingClientRect();
              left = w.left - s.left + (c.x / 100) * w.width;
              top = w.top - s.top + (c.y / 100) * w.height;
            }
            return (
              <div
                data-map-overlay
                className="absolute z-30 w-56 rounded-md border border-border bg-card shadow-xl p-2 space-y-2"
                style={{ left, top, transform: "translate(-50%, 12px)" }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    Region color
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAnnotId(null)}
                    className="text-muted-foreground/60 hover:text-foreground"
                    title="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {COLOR_PALETTE.map((c2) => (
                    <button
                      key={c2}
                      type="button"
                      onClick={() => updateRegionColor(sel.id, c2)}
                      title={c2}
                      className={`w-7 h-7 rounded border ${sel.color === c2 ? "ring-2 ring-foreground/60 ring-offset-1 ring-offset-card" : "border-border"}`}
                      style={{ backgroundColor: c2 }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-end pt-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-destructive hover:text-destructive gap-1"
                    onClick={() => removeAnnotation(sel.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete region
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* Hint banner */}
          {doc.annotations.length === 0 && tool === "select" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-card/90 border border-border text-[11px] text-muted-foreground shadow backdrop-blur-sm pointer-events-none">
              Pick the region tool to draw a polygon — click to add vertices, click the first point to close
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function regionCentroid(a: PolygonRegion): { x: number; y: number } | null {
  if (a.points.length === 0) return null;
  const sx = a.points.reduce((s, p) => s + p.x, 0);
  const sy = a.points.reduce((s, p) => s + p.y, 0);
  return { x: sx / a.points.length, y: sy / a.points.length };
}

// ----- SVG region rendering -----
// Single color drives both fill (at a fixed opacity) and border. There is
// no separate outline color, outline width, or fill-opacity control.
function renderRegion(
  a: PolygonRegion,
  readOnly: boolean,
  onDelete: (id: string) => void,
  tool: Tool,
  onSelect: (region: PolygonRegion) => void,
) {
  const pts = a.points.map((p) => `${p.x},${p.y}`).join(" ");
  const onCtx = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!readOnly) onDelete(a.id);
  };
  const onClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    if (tool !== "select") return;
    e.stopPropagation();
    onSelect(a);
  };
  return (
    <polygon
      key={a.id}
      data-annot
      points={pts}
      fill={a.color}
      fillOpacity={0.25}
      stroke={a.color}
      strokeWidth={0.6}
      vectorEffect="non-scaling-stroke"
      style={{ pointerEvents: "auto", cursor: tool === "select" ? "pointer" : "default" }}
      onClick={onClick}
      onContextMenu={onCtx}
    >
      <title>{readOnly ? "Region" : tool === "select" ? "Click to change color · right-click to remove" : "Right-click to remove"}</title>
    </polygon>
  );
}
