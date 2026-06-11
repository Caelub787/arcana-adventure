import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node as FlowNode,
  type NodeTypes,
  type NodeChange,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Node,
  CanvasMember,
  useListNodes,
  useListRelationships,
  useCreateRelationship,
  getListNodesQueryKey,
  getListRelationshipsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@cr/lib/store";
import { useRealmRole } from "@cr/lib/useRealmRole";
import { hasSidebarNodeDrag, getSidebarNodeDrag } from "@cr/lib/drag";
import { registerTouchDropTarget } from "@cr/lib/touchDrag";
import { CustomNodeWindow } from "@cr/components/canvas/CustomNodeWindow";
import { useCanvasYMap, useRealtime } from "@cr/lib/realtime";
import { CanvasCursors } from "@cr/components/canvas/CanvasCursors";
import { PaneControls } from "@cr/components/workspace/PaneControls";
import { Undo2, Redo2 } from "lucide-react";
import {
  notePaneActive,
  registerPaneShortcuts,
} from "@cr/lib/paneShortcuts";

interface Props {
  canvasNode: Node;
  paneId: string;
  onClosePane?: () => void;
}

// Snapshot of the full canvas membership at a point in time: which members
// exist, their member node id, and their position/size/zIndex. Used as the
// unit of undo/redo history so we can roll back not just drag/resize but
// also add/remove gestures.
type MemberSnapshot = {
  memberNodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};
type CanvasSnapshot = Map<string, MemberSnapshot>;

function snapshotMembers(members: CanvasMember[]): CanvasSnapshot {
  const snap: CanvasSnapshot = new Map();
  for (const m of members) {
    snap.set(m.id, {
      memberNodeId: m.memberNodeId,
      x: m.x,
      y: m.y,
      width: m.width,
      height: m.height,
      zIndex: m.zIndex,
    });
  }
  return snap;
}

function memberSnapshotsEqual(a: MemberSnapshot, b: MemberSnapshot): boolean {
  return (
    a.memberNodeId === b.memberNodeId &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.zIndex === b.zIndex
  );
}

function snapshotsEqual(a: CanvasSnapshot, b: CanvasSnapshot): boolean {
  if (a.size !== b.size) return false;
  for (const [id, va] of a) {
    const vb = b.get(id);
    if (!vb) return false;
    if (!memberSnapshotsEqual(va, vb)) return false;
  }
  return true;
}

const nodeTypes: NodeTypes = { customWindow: CustomNodeWindow };

function CanvasPaneInner({ canvasNode, paneId, onClosePane }: Props) {
  const { activeRealmId, canvasCenterRef, splitAtPane } = useAppStore();
  const queryClient = useQueryClient();
  const rf = useReactFlow();
  const createRelationship = useCreateRelationship();
  const { canEdit } = useRealmRole(activeRealmId);
  const yMap = useCanvasYMap(canvasNode.id);
  const realtime = useRealtime();

  const [members, setMembers] = useState<CanvasMember[]>([]);
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data: realmNodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });
  const { data: relationships } = useListRelationships(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListRelationshipsQueryKey(activeRealmId || ""),
    },
  });

  const nodesById = useMemo(() => {
    const map = new Map<string, Node>();
    (realmNodes ?? []).forEach((n) => map.set(n.id, n));
    return map;
  }, [realmNodes]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/${canvasNode.id}/members`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as CanvasMember[];
      setMembers(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load members");
    }
  }, [canvasNode.id]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  // Subscribe to remote canvas Y.Map updates and mirror them into the local
  // members list. We only adopt the Y.Map snapshot once the WS is connected
  // (and therefore the server has had a chance to hydrate the room from
  // Postgres). Before that, an empty doc would briefly clear the REST-fetched
  // list and flash the canvas to "empty". Once connected, an empty Y.Map is
  // authoritative — the canvas really has zero members.
  useEffect(() => {
    if (!yMap || !realtime) return;
    if (realtime.status !== "connected") return;
    const sync = () => {
      const next: CanvasMember[] = [];
      yMap.forEach((v, id) => {
        // The Y.Map mirror doesn't carry createdAt; we don't render it,
        // so an empty placeholder is fine for the local state shape.
        next.push({
          id,
          canvasNodeId: canvasNode.id,
          memberNodeId: v.memberNodeId,
          x: v.x,
          y: v.y,
          width: v.width,
          height: v.height,
          zIndex: v.zIndex,
          createdAt: new Date(0).toISOString(),
        } as CanvasMember);
      });
      setMembers(next);
    };
    sync();
    const handler = () => sync();
    yMap.observe(handler);
    return () => yMap.unobserve(handler);
  }, [yMap, canvasNode.id, realtime, realtime?.status]);

  // Publish the canvas center (in flow coordinates) into the shared
  // `canvasCenterRef` so other UI (e.g. Compass) can drop new nodes
  // around what the user is currently looking at instead of (0,0).
  // Initial publish on mount + a one-shot RAF after fitView lands; the
  // continuous updates while the user pans/zooms come from `onMoveEnd`
  // on the ReactFlow component below.
  const publishCanvasCenter = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    try {
      const center = rf.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      canvasCenterRef.current = { x: center.x, y: center.y };
    } catch {
      // ReactFlow may not be ready yet; ignore.
    }
  }, [rf, canvasCenterRef]);

  useEffect(() => {
    publishCanvasCenter();
    const raf = requestAnimationFrame(() => publishCanvasCenter());
    return () => {
      cancelAnimationFrame(raf);
      // Only clear if we're still the publisher — avoid clobbering a
      // pane that mounted right after us.
      canvasCenterRef.current = null;
    };
  }, [publishCanvasCenter, canvasCenterRef]);

  // Live cursor broadcast: throttle to one update per animation frame.
  useEffect(() => {
    if (!realtime) return;
    const containerEl = containerRef.current;
    if (!containerEl) return;
    let raf: number | null = null;
    let lastEvent: { clientX: number; clientY: number } | null = null;
    const flush = () => {
      raf = null;
      if (!lastEvent) return;
      const flow = rf.screenToFlowPosition({
        x: lastEvent.clientX,
        y: lastEvent.clientY,
      });
      const local = realtime.awareness.getLocalState() ?? {};
      realtime.awareness.setLocalState({
        ...local,
        cursor: { canvasNodeId: canvasNode.id, x: flow.x, y: flow.y },
      });
    };
    const onMove = (e: MouseEvent) => {
      lastEvent = { clientX: e.clientX, clientY: e.clientY };
      if (raf == null) raf = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      lastEvent = null;
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
      const local = realtime.awareness.getLocalState() ?? {};
      realtime.awareness.setLocalState({ ...local, cursor: null });
    };
    containerEl.addEventListener("mousemove", onMove);
    containerEl.addEventListener("mouseleave", onLeave);
    return () => {
      containerEl.removeEventListener("mousemove", onMove);
      containerEl.removeEventListener("mouseleave", onLeave);
      if (raf != null) cancelAnimationFrame(raf);
      const local = realtime.awareness.getLocalState() ?? {};
      realtime.awareness.setLocalState({ ...local, cursor: null });
    };
  }, [realtime, rf, canvasNode.id]);

  // ----- Undo / redo history (per-canvas-pane, in-memory only) -----
  // We snapshot the full membership (which members exist + their position,
  // size, zIndex, and target node) before each user gesture so Ctrl/Cmd+Z
  // can restore both layout (drag/resize) and structure (add/remove).
  // Restored adds reuse the original member id by passing it back through
  // POST so peers and history references stay consistent.
  const HISTORY_LIMIT = 50;
  const historyRef = useRef<{
    past: CanvasSnapshot[];
    future: CanvasSnapshot[];
  }>({ past: [], future: [] });
  const membersRef = useRef<CanvasMember[]>(members);
  membersRef.current = members;
  // Snapshot taken when a drag/resize gesture starts; pushed onto `past`
  // on gesture-end if the layout actually changed.
  const gestureStartSnapshotRef = useRef<CanvasSnapshot | null>(null);

  // Mirror of historyRef lengths kept in React state so the toolbar
  // Undo/Redo buttons can reactively enable/disable.
  const [historyLens, setHistoryLens] = useState({ past: 0, future: 0 });
  const syncHistoryLens = useCallback(() => {
    const h = historyRef.current;
    setHistoryLens((prev) =>
      prev.past === h.past.length && prev.future === h.future.length
        ? prev
        : { past: h.past.length, future: h.future.length },
    );
  }, []);

  // Low-level DELETE: updates local state immediately and pushes through the
  // server. Y.Map is updated server-side by applyMemberDelete in the REST
  // handler, which broadcasts to peers. Does NOT touch undo history; callers
  // that represent a user gesture are responsible for snapshotting first.
  const deleteMember = useCallback(
    async (memberId: string): Promise<boolean> => {
      const prev = membersRef.current;
      setMembers((m) => m.filter((x) => x.id !== memberId));
      try {
        const res = await fetch(
          `/api/nodes/${canvasNode.id}/members/${memberId}`,
          { method: "DELETE" },
        );
        if (!res.ok && res.status !== 404) {
          throw new Error(String(res.status));
        }
        return true;
      } catch {
        setMembers(prev);
        return false;
      }
    },
    [canvasNode.id],
  );

  // Low-level POST: when `id` is provided, the server reuses that exact UUID
  // (used by undo-restore). Otherwise the DB allocates a fresh id. Returns
  // the created row, or null on failure. Like deleteMember, this does not
  // record undo history — callers handle that.
  const createMember = useCallback(
    async (payload: {
      id?: string;
      memberNodeId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      zIndex?: number;
    }): Promise<CanvasMember | null> => {
      try {
        const res = await fetch(`/api/nodes/${canvasNode.id}/members`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 409) {
          // Already a member (or id collision). Surface as a no-op so undo
          // doesn't blow up the history stack.
          return null;
        }
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setLoadError(err.error || `Failed to add (${res.status})`);
          return null;
        }
        const created = (await res.json()) as CanvasMember;
        setMembers((m) =>
          m.some((x) => x.id === created.id) ? m : [...m, created],
        );
        return created;
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to add member",
        );
        return null;
      }
    },
    [canvasNode.id],
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      const before = snapshotMembers(membersRef.current);
      const ok = await deleteMember(memberId);
      if (!ok) return;
      // Push history only after the server confirms the delete, so a failed
      // delete doesn't leave a stale "restore" entry behind.
      const h = historyRef.current;
      const past = [...h.past, before];
      while (past.length > HISTORY_LIMIT) past.shift();
      historyRef.current = { past, future: [] };
      syncHistoryLens();
    },
    [deleteMember, syncHistoryLens],
  );

  const updateMemberPosition = useCallback(
    async (memberId: string, x: number, y: number) => {
      // Prefer the Y.Map path so peers see drag in real time. Server flushes
      // to Postgres on a debounce. Fall back to REST if no realtime doc.
      if (yMap) {
        const cur = yMap.get(memberId);
        if (cur) yMap.set(memberId, { ...cur, x, y });
        return;
      }
      try {
        await fetch(`/api/nodes/${canvasNode.id}/members/${memberId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ x, y }),
        });
      } catch {
        // best effort
      }
    },
    [canvasNode.id, yMap],
  );

  const updateMemberSize = useCallback(
    async (memberId: string, width: number, height: number) => {
      if (yMap) {
        const cur = yMap.get(memberId);
        if (cur) yMap.set(memberId, { ...cur, width, height });
        return;
      }
      try {
        await fetch(`/api/nodes/${canvasNode.id}/members/${memberId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ width, height }),
        });
      } catch {}
    },
    [canvasNode.id, yMap],
  );

  // Sync ReactFlow node state from server-side members whenever the membership
  // set, the underlying nodes, or sizes/positions change. We treat `members`
  // as the source of truth for which nodes exist on the canvas; intermediate
  // drag/resize is applied locally via setFlowNodes(applyNodeChanges(...)) and
  // persisted on drag/resize end.
  useEffect(() => {
    setFlowNodes(() => {
      return members
        .map((m) => {
          const n = nodesById.get(m.memberNodeId);
          if (!n) return null;
          return {
            id: m.id,
            type: "customWindow",
            position: { x: m.x, y: m.y },
            dragHandle: ".custom-drag-handle",
            data: {
              node: n,
              onClose: () => removeMember(m.id),
            },
            style: { width: m.width, height: m.height, zIndex: m.zIndex },
          } as FlowNode;
        })
        .filter((x): x is FlowNode => x !== null);
    });
  }, [members, nodesById, removeMember]);

  const memberByFlowId = useMemo(() => {
    const map = new Map<string, CanvasMember>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  const memberNodeIds = useMemo(() => new Set(members.map((m) => m.memberNodeId)), [members]);
  const memberIdByNodeId = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.memberNodeId, m.id));
    return map;
  }, [members]);

  const flowEdges: Edge[] = useMemo(() => {
    if (!relationships) return [];
    return relationships
      .filter((e) => memberNodeIds.has(e.fromNodeId) && memberNodeIds.has(e.toNodeId))
      .map((e) => ({
        id: e.id,
        source: memberIdByNodeId.get(e.fromNodeId)!,
        target: memberIdByNodeId.get(e.toNodeId)!,
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, opacity: 0.6 },
      }));
  }, [relationships, memberNodeIds, memberIdByNodeId]);

  // Apply a previously-captured snapshot as the new canvas membership state.
  // Diff against current members:
  //   - id in snapshot but not current → re-create via POST with explicit id
  //   - id in current but not snapshot → DELETE
  //   - id in both with different pos/size → PATCH (via Y.Map when realtime)
  // For pos/size-only changes we update local state synchronously up front
  // so undo feels instant; add/remove rely on the server round-trip to keep
  // ids consistent and to broadcast to peers.
  const applySnapshot = useCallback(
    (snap: CanvasSnapshot) => {
      const cur = membersRef.current;
      const curById = new Map(cur.map((m) => [m.id, m] as const));

      // 1. Pos/size updates for members present in both — apply locally first
      //    for instant feedback, then push to server/peers.
      const updatedMembers = cur.map((m) => {
        const s = snap.get(m.id);
        if (!s) return m;
        if (
          s.x === m.x &&
          s.y === m.y &&
          s.width === m.width &&
          s.height === m.height
        ) {
          return m;
        }
        if (s.x !== m.x || s.y !== m.y) {
          updateMemberPosition(m.id, s.x, s.y);
        }
        if (s.width !== m.width || s.height !== m.height) {
          updateMemberSize(m.id, s.width, s.height);
        }
        return { ...m, x: s.x, y: s.y, width: s.width, height: s.height };
      });
      setMembers(updatedMembers);

      // 2. Delete members that exist now but not in the snapshot.
      for (const m of cur) {
        if (!snap.has(m.id)) {
          void deleteMember(m.id);
        }
      }

      // 3. Re-create members that exist in the snapshot but not currently,
      //    reusing their original ids so a redo (or a peer's stale reference)
      //    still finds the same canvas member.
      for (const [id, s] of snap) {
        if (curById.has(id)) continue;
        void createMember({
          id,
          memberNodeId: s.memberNodeId,
          x: s.x,
          y: s.y,
          width: s.width,
          height: s.height,
          zIndex: s.zIndex,
        });
      }
    },
    [updateMemberPosition, updateMemberSize, deleteMember, createMember],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const cur = snapshotMembers(membersRef.current);
    const prev = h.past[h.past.length - 1]!;
    historyRef.current = {
      past: h.past.slice(0, -1),
      future: [...h.future, cur],
    };
    syncHistoryLens();
    applySnapshot(prev);
  }, [applySnapshot, syncHistoryLens]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const cur = snapshotMembers(membersRef.current);
    const next = h.future[h.future.length - 1]!;
    historyRef.current = {
      past: [...h.past, cur],
      future: h.future.slice(0, -1),
    };
    syncHistoryLens();
    applySnapshot(next);
  }, [applySnapshot, syncHistoryLens]);

  // Reset history when switching to a different canvas node so we don't
  // restore positions onto unrelated members.
  const historyKeyRef = useRef<string>(canvasNode.id);
  useEffect(() => {
    if (historyKeyRef.current !== canvasNode.id) {
      historyKeyRef.current = canvasNode.id;
      historyRef.current = { past: [], future: [] };
      gestureStartSnapshotRef.current = null;
      syncHistoryLens();
    }
  }, [canvasNode.id, syncHistoryLens]);

  // Register undo/redo with the global per-pane shortcut registry.
  useEffect(() => {
    return registerPaneShortcuts(paneId, { undo, redo });
  }, [paneId, undo, redo]);

  // Mark this canvas pane as the last-active pane on mount and whenever
  // the user interacts with it. This is what lets the global Cmd/Ctrl+Z
  // handler in MainLayout route to us in fullscreen focus mode, where
  // the pane tree's `focusedPaneId` is unset.
  useEffect(() => {
    notePaneActive(paneId);
  }, [paneId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply intermediate updates so ReactFlow drag/resize feel responsive.
      setFlowNodes((cur) => applyNodeChanges(changes, cur));
      // Viewers may visually nudge nodes during a drag (ReactFlow's drag
      // gesture is local), but we never persist anything for them.
      if (!canEdit) return;
      // Snapshot the layout at the START of a drag/resize gesture so undo
      // can restore the pre-gesture positions. Pushed onto the history on
      // gesture-end only if the layout actually changed.
      const gestureStarting = changes.some(
        (c) =>
          (c.type === "position" && c.dragging) ||
          (c.type === "dimensions" && c.resizing),
      );
      if (gestureStarting && !gestureStartSnapshotRef.current) {
        gestureStartSnapshotRef.current = snapshotMembers(membersRef.current);
      }
      const gestureEnding = changes.some(
        (c) =>
          (c.type === "position" && c.dragging === false) ||
          (c.type === "dimensions" && c.resizing === false),
      );
      // Stream live during drag/resize when the realtime Y.Map is available
      // — peers see motion in real time, not just on drop. When realtime is
      // absent we fall back to the drop-end REST patch only (to avoid
      // hammering the API every frame).
      changes.forEach((change) => {
        if (change.type === "position" && change.position) {
          if (yMap || !change.dragging) {
            updateMemberPosition(
              change.id,
              change.position.x,
              change.position.y,
            );
          }
          if (!change.dragging) {
            setMembers((ms) =>
              ms.map((m) =>
                m.id === change.id
                  ? { ...m, x: change.position!.x, y: change.position!.y }
                  : m,
              ),
            );
          }
        }
        if (change.type === "dimensions" && change.dimensions) {
          if (yMap || !change.resizing) {
            updateMemberSize(
              change.id,
              change.dimensions.width,
              change.dimensions.height,
            );
          }
          if (!change.resizing) {
            setMembers((ms) =>
              ms.map((m) =>
                m.id === change.id
                  ? {
                      ...m,
                      width: change.dimensions!.width,
                      height: change.dimensions!.height,
                    }
                  : m,
              ),
            );
          }
        }
      });
      // Commit a history entry at the end of a drag/resize gesture, but only
      // if the pre-gesture snapshot actually differs from the latest layout.
      if (gestureEnding && gestureStartSnapshotRef.current) {
        const start = gestureStartSnapshotRef.current;
        gestureStartSnapshotRef.current = null;
        // Build the post-gesture snapshot from the latest members plus the
        // pending change set (membersRef hasn't been flushed yet because
        // setMembers is async).
        const after: CanvasSnapshot = snapshotMembers(membersRef.current);
        for (const change of changes) {
          if (change.type === "position" && change.position) {
            const prev = after.get(change.id);
            if (prev) {
              after.set(change.id, {
                ...prev,
                x: change.position.x,
                y: change.position.y,
              });
            }
          }
          if (change.type === "dimensions" && change.dimensions) {
            const prev = after.get(change.id);
            if (prev) {
              after.set(change.id, {
                ...prev,
                width: change.dimensions.width,
                height: change.dimensions.height,
              });
            }
          }
        }
        if (!snapshotsEqual(start, after)) {
          const h = historyRef.current;
          const past = [...h.past, start];
          while (past.length > HISTORY_LIMIT) past.shift();
          historyRef.current = { past, future: [] };
          syncHistoryLens();
        }
      }
    },
    [updateMemberPosition, updateMemberSize, canEdit, yMap],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!canEdit) return;
      if (!conn.source || !conn.target || !activeRealmId) return;
      const src = memberByFlowId.get(conn.source);
      const tgt = memberByFlowId.get(conn.target);
      if (!src || !tgt) return;
      if (src.memberNodeId === tgt.memberNodeId) return;
      createRelationship.mutate(
        {
          realmId: activeRealmId,
          data: {
            fromNodeId: src.memberNodeId,
            toNodeId: tgt.memberNodeId,
            label: "related",
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListRelationshipsQueryKey(activeRealmId),
            });
          },
        },
      );
    },
    [activeRealmId, memberByFlowId, createRelationship, queryClient, canEdit],
  );

  const onDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;
    if (!hasSidebarNodeDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const onDrop = async (e: React.DragEvent) => {
    setDragOver(false);
    if (!canEdit) return;
    const payload = getSidebarNodeDrag(e);
    if (!payload) return;
    e.preventDefault();
    e.stopPropagation();
    if (payload.nodeId === canvasNode.id) return;
    if (memberNodeIds.has(payload.nodeId)) return;

    const flowPos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });

    // Snapshot the pre-add membership so undo can remove the dropped item.
    const before = snapshotMembers(membersRef.current);
    const created = await createMember({
      memberNodeId: payload.nodeId,
      x: flowPos.x - 160,
      y: flowPos.y - 60,
      width: 320,
      height: 220,
    });
    if (!created) return;
    const h = historyRef.current;
    const past = [...h.past, before];
    while (past.length > HISTORY_LIMIT) past.shift();
    historyRef.current = { past, future: [] };
    syncHistoryLens();
  };

  // Touch drag-and-drop drop target. Mirrors the HTML5 onDrop handler for
  // finger drags from the sidebar: the canvas body owns ALL drops inside
  // the pane and adds the dropped node as a member at the drop point.
  // Edge-based splits are intentionally disabled here so finger-drops
  // near a pane border behave the same as mouse drops — they add a
  // member at that location rather than splitting the pane. Splits can
  // still be triggered by dropping onto a different pane or via the
  // pane controls.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return registerTouchDropTarget({
      el,
      onHover: (active) => setDragOver(active),
      onDrop: async ({ clientX, clientY, payload }) => {
        setDragOver(false);
        if (!canEdit) return;
        if (payload.nodeId === canvasNode.id) return;
        if (memberNodeIds.has(payload.nodeId)) return;
        const flowPos = rf.screenToFlowPosition({ x: clientX, y: clientY });
        const before = snapshotMembers(membersRef.current);
        const created = await createMember({
          memberNodeId: payload.nodeId,
          x: flowPos.x - 160,
          y: flowPos.y - 60,
          width: 320,
          height: 220,
        });
        if (!created) return;
        const h = historyRef.current;
        const past = [...h.past, before];
        while (past.length > HISTORY_LIMIT) past.shift();
        historyRef.current = { past, future: [] };
        syncHistoryLens();
      },
    });
  }, [
    canEdit,
    canvasNode.id,
    memberNodeIds,
    rf,
    createMember,
    syncHistoryLens,
  ]);

  return (
    <div
      ref={containerRef}
      className={`flex-1 relative overflow-hidden ${dragOver ? "ring-2 ring-accent ring-inset" : ""}`}
      onPointerDownCapture={() => notePaneActive(paneId)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <PaneControls nodeId={canvasNode.id} onClosePane={onClosePane} />
      {canEdit && (
        <div className="absolute top-1 left-2 z-30 flex items-center gap-1 bg-card/95 border border-border rounded-md shadow-sm p-0.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              undo();
            }}
            disabled={historyLens.past === 0}
            title="Undo (Cmd/Ctrl+Z)"
            aria-label="Undo"
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              redo();
            }}
            disabled={historyLens.future === 0}
            title="Redo (Cmd/Ctrl+Shift+Z)"
            aria-label="Redo"
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onMoveEnd={publishCanvasCenter}
        onInit={publishCanvasCenter}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        elementsSelectable
        panOnDrag
        zoomOnPinch
        zoomOnScroll
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={3}
        fitView={members.length > 0}
        className="touch-none"
      >
        <Background color="hsl(var(--muted-foreground))" gap={24} size={1.5} className="opacity-15" />
        <Controls className="!bottom-3 !left-3 !bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
        <CanvasCursors canvasNodeId={canvasNode.id} />
      </ReactFlow>
      {members.length === 0 && !loadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center px-6">
          <div className="text-sm text-muted-foreground max-w-xs">
            Empty canvas. Drag nodes from the sidebar onto this surface to compose them visually.
          </div>
        </div>
      )}
      {loadError && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1">
          {loadError}
        </div>
      )}
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 rounded border-2 border-dashed border-accent flex items-center justify-center text-accent text-sm font-medium bg-accent/5">
          Add to canvas
        </div>
      )}
    </div>
  );
}

export function CanvasPaneBody({ canvasNode, paneId, onClosePane }: Props) {
  return (
    <ReactFlowProvider>
      <CanvasPaneInner
        canvasNode={canvasNode}
        paneId={paneId}
        onClosePane={onClosePane}
      />
    </ReactFlowProvider>
  );
}
