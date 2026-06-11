import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  type Edge,
  type Node as FlowNode,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import {
  useListNodes,
  useListRelationships,
  useUpdateNode,
  getListNodesQueryKey,
  getListRelationshipsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Node as ApiNode } from "@workspace/api-zod";
import { useAppStore } from "@cr/lib/store";

import { getKindIcon } from "@cr/lib/nodeKinds";
import { objectUrl } from "@cr/lib/uploadImage";

interface PillData extends Record<string, unknown> {
  title: string;
  kind: string;
  color: string;
  isOpen: boolean;
  imageUrl: string | null;
  nodeKey: string | null;
}

type SimNode = SimulationNodeDatum & { id: string };
type SimLink = { source: string; target: string };

function resolveImageSrc(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("/objects/")) return objectUrl(imageUrl);
  return imageUrl;
}

function GraphPill({ data, selected }: NodeProps) {
  const d = data as PillData;
  const Icon = getKindIcon(d.kind);
  const src = resolveImageSrc(d.imageUrl);
  return (
    <div
      className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full bg-card/95 border shadow-md text-xs whitespace-nowrap select-none transition-shadow ${
        selected ? "border-border ring-1 ring-primary/40" : "border-border"
      } ${d.isOpen ? "ring-1 ring-accent/50" : ""}`}
      style={{ borderTopColor: d.color, borderTopWidth: 2 }}
      title={d.nodeKey ? `${d.title} · ${d.nodeKey}` : d.title}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="w-6 h-6 rounded-full object-cover border border-border/60"
          draggable={false}
        />
      ) : (
        <Icon className="w-3 h-3 opacity-70 ml-2" />
      )}
      <span className="font-medium text-foreground/90 max-w-[180px] truncate">{d.title}</span>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
    </div>
  );
}

const nodeTypes: NodeTypes = { pill: GraphPill };

const SETTLE_MS = 450;
const POSITION_EPSILON = 0.5;

function GraphInner() {
  const { activeRealmId, openInFocused, openNodeIds, setViewMode } = useAppStore();
  const queryClient = useQueryClient();
  const updateNode = useUpdateNode();
  const updateMutateRef = useRef(updateNode.mutate);
  updateMutateRef.current = updateNode.mutate;

  const { data: apiNodes } = useListNodes(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListNodesQueryKey(activeRealmId || ""),
    },
  });
  const { data: apiEdges } = useListRelationships(activeRealmId || "", {
    query: {
      enabled: !!activeRealmId,
      queryKey: getListRelationshipsQueryKey(activeRealmId || ""),
    },
  });

  // Live simulation kept across renders
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  // Positions used for rendering — kept off React state via a tick counter
  // so simulation ticks don't trigger expensive recomputes elsewhere.
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [tick, setTick] = useState(0);
  const tickScheduledRef = useRef(false);
  const requestRender = useCallback(() => {
    if (tickScheduledRef.current) return;
    tickScheduledRef.current = true;
    requestAnimationFrame(() => {
      tickScheduledRef.current = false;
      setTick((t) => t + 1);
    });
  }, []);

  // Track which node is being dragged so click-vs-drag can be distinguished.
  const draggingRef = useRef<string | null>(null);
  const dragMovedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  // Adjacency lookup so a drag can pin every non-neighbor node in place.
  // Only direct neighbors of the dragged node should be pulled along by
  // the link spring; everything else stays exactly where it was.
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    const adj = new Map<string, Set<string>>();
    (apiEdges ?? []).forEach((e) => {
      if (!adj.has(e.fromNodeId)) adj.set(e.fromNodeId, new Set());
      if (!adj.has(e.toNodeId)) adj.set(e.toNodeId, new Set());
      adj.get(e.fromNodeId)!.add(e.toNodeId);
      adj.get(e.toNodeId)!.add(e.fromNodeId);
    });
    adjacencyRef.current = adj;
  }, [apiEdges]);

  // Snapshot of server positions (for diffing on save) and the realm being shown.
  const serverPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const currentRealmRef = useRef<string | null>(null);

  // Hash topology so we can incrementally update the simulation when the
  // node/edge set changes.
  const topologyKey = useMemo(() => {
    const nodeIds = (apiNodes ?? []).map((n) => n.id).sort().join(",");
    const edgeIds = (apiEdges ?? [])
      .map((e) => `${e.fromNodeId}>${e.toNodeId}`)
      .sort()
      .join(",");
    return `${activeRealmId ?? ""}|${nodeIds}|${edgeIds}`;
  }, [activeRealmId, apiNodes, apiEdges]);
  const lastTopologyRef = useRef<string>("");

  useEffect(() => {
    if (!activeRealmId || !apiNodes || !apiEdges) return;
    if (lastTopologyRef.current === topologyKey) return;
    lastTopologyRef.current = topologyKey;

    const realmChanged = currentRealmRef.current !== activeRealmId;
    currentRealmRef.current = activeRealmId;
    if (realmChanged) {
      simNodesRef.current = new Map();
      positionsRef.current = new Map();
      serverPositionsRef.current = new Map();
      if (simRef.current) {
        simRef.current.stop();
        simRef.current = null;
      }
    }

    // Refresh server-position snapshot and seed positions for new nodes.
    const serverPositions = new Map<string, { x: number; y: number }>();
    apiNodes.forEach((n) => {
      serverPositions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    });
    serverPositionsRef.current = serverPositions;

    const existing = simNodesRef.current;
    const newcomerIds = new Set<string>();
    const next: SimNode[] = apiNodes.map((n) => {
      const prior = existing.get(n.id);
      if (prior) return prior;
      const saved = serverPositions.get(n.id);
      const hasSaved = saved && (saved.x !== 0 || saved.y !== 0);
      const seedX = hasSaved ? saved!.x : (Math.random() - 0.5) * 200;
      const seedY = hasSaved ? saved!.y : (Math.random() - 0.5) * 200;
      const node: SimNode = { id: n.id, x: seedX, y: seedY };
      // If we have a saved layout, also seed velocity to 0 so this node
      // starts at rest where the user left it.
      if (hasSaved) {
        node.vx = 0;
        node.vy = 0;
      } else {
        newcomerIds.add(n.id);
      }
      return node;
    });
    const nextMap = new Map<string, SimNode>();
    next.forEach((n) => nextMap.set(n.id, n));
    simNodesRef.current = nextMap;

    // Seed render positions immediately so first paint uses saved layout.
    const renderMap = new Map<string, { x: number; y: number }>();
    next.forEach((n) => renderMap.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 }));
    positionsRef.current = renderMap;

    const ids = new Set(next.map((n) => n.id));
    const links: SimLink[] = apiEdges
      .filter((e) => ids.has(e.fromNodeId) && ids.has(e.toNodeId))
      .map((e) => ({ source: e.fromNodeId, target: e.toNodeId }));

    const newcomersNeedLayout = newcomerIds.size > 0;

    // Hard-pin every node that already has a saved layout so that the
    // initial force pass only moves the brand-new nodes (those still at
    // the default origin). Pins are released once the simulation cools.
    const pinSavedNodes = () => {
      next.forEach((n) => {
        if (!newcomerIds.has(n.id)) {
          n.fx = n.x ?? 0;
          n.fy = n.y ?? 0;
        }
      });
    };
    const releaseSavedPins = () => {
      next.forEach((n) => {
        if (!newcomerIds.has(n.id) && draggingRef.current !== n.id) {
          n.fx = null;
          n.fy = null;
        }
      });
    };

    if (simRef.current) {
      simRef.current.nodes(next);
      const linkForce = simRef.current.force("link") as
        | ReturnType<typeof forceLink<SimNode, SimLink>>
        | undefined;
      if (linkForce) linkForce.links(links);
      if (newcomersNeedLayout) {
        pinSavedNodes();
        simRef.current.alpha(0.6).restart();
        simRef.current.on("end.layout", () => {
          releaseSavedPins();
          simRef.current?.on("end.layout", null);
        });
      }
      // If no newcomers, do not restart — saved nodes must not drift.
    } else {
      const sim = forceSimulation<SimNode>(next)
        .force("charge", forceManyBody().strength(-220))
        .force(
          "link",
          forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .distance(140)
            .strength(0.7),
        )
        .force("center", forceCenter(0, 0))
        .force("collide", forceCollide(70))
        .alphaDecay(0.04)
        .on("tick", () => {
          const map = positionsRef.current;
          simNodesRef.current.forEach((n, id) => {
            map.set(id, { x: n.x ?? 0, y: n.y ?? 0 });
          });
          requestRender();
        });
      simRef.current = sim;
      if (newcomersNeedLayout) {
        pinSavedNodes();
        sim.alpha(1).restart();
        sim.on("end.layout", () => {
          releaseSavedPins();
          sim.on("end.layout", null);
        });
      } else {
        // All nodes have saved layouts — keep the simulation cold so
        // forces (center, link, charge) cannot nudge anything until the
        // user drags. Drag handlers will reheat as needed.
        sim.alpha(0).stop();
      }
    }
    setTick((t) => t + 1);
  }, [activeRealmId, apiNodes, apiEdges, topologyKey, requestRender]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (simRef.current) {
        simRef.current.stop();
        simRef.current = null;
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, []);

  const persistPositions = useCallback(() => {
    const realmId = currentRealmRef.current;
    if (!realmId) return;
    const positions = positionsRef.current;
    const server = serverPositionsRef.current;
    const changed: { id: string; x: number; y: number }[] = [];
    positions.forEach((pos, id) => {
      const prev = server.get(id);
      if (
        !prev ||
        Math.abs(prev.x - pos.x) > POSITION_EPSILON ||
        Math.abs(prev.y - pos.y) > POSITION_EPSILON
      ) {
        changed.push({ id, x: pos.x, y: pos.y });
      }
    });
    if (changed.length === 0) return;

    // Optimistically update the local cache so a reload before the
    // requests resolve still shows the new layout.
    const queryKey = getListNodesQueryKey(realmId);
    queryClient.setQueryData<ApiNode[] | undefined>(queryKey, (prev) => {
      if (!prev) return prev;
      const byId = new Map(changed.map((c) => [c.id, c]));
      return prev.map((n) => {
        const c = byId.get(n.id);
        return c ? { ...n, x: c.x, y: c.y } : n;
      });
    });
    // Refresh the server snapshot so future drags only diff against the
    // new baseline (no duplicate writes for unchanged nodes).
    changed.forEach((c) => {
      server.set(c.id, { x: c.x, y: c.y });
    });

    // Throttle: fire requests serially in small batches to avoid a
    // thundering herd when many neighbors moved.
    let i = 0;
    const flushNext = () => {
      const slice = changed.slice(i, i + 4);
      if (slice.length === 0) return;
      i += slice.length;
      slice.forEach((c) => {
        updateMutateRef.current({ nodeId: c.id, data: { x: c.x, y: c.y } });
      });
      if (i < changed.length) {
        window.setTimeout(flushNext, 30);
      }
    };
    flushNext();
  }, [queryClient]);

  const flowNodes: FlowNode[] = useMemo(() => {
    if (!apiNodes) return [];
    const positions = positionsRef.current;
    return apiNodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: n.x ?? 0, y: n.y ?? 0 };
      return {
        id: n.id,
        type: "pill",
        position: pos,
        draggable: true,
        data: {
          title: n.title,
          kind: n.kind,
          color: n.color || "hsl(var(--primary))",
          isOpen: openNodeIds.includes(n.id),
          imageUrl: n.imageUrl ?? null,
          nodeKey: n.key ?? null,
        } as PillData,
      } as FlowNode;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiNodes, openNodeIds, tick]);

  const flowEdges: Edge[] = useMemo(() => {
    if (!apiEdges) return [];
    return apiEdges.map((e) => ({
      id: e.id,
      source: e.fromNodeId,
      target: e.toNodeId,
      style: {
        stroke: "hsl(var(--muted-foreground))",
        strokeWidth: 1,
        opacity: 0.45,
      },
    }));
  }, [apiEdges]);

  // Hold React Flow nodes in stateful form so React Flow can register
  // dimensions / selection / drag changes via `onNodesChange`. Without
  // this, controlled-mode nodes lose their `measured` data every tick
  // and dragging triggers "node is not initialized" runtime errors.
  // We re-derive from `flowNodes` on every change but merge
  // into prior nodes by id so React Flow's internal measurement state
  // is preserved across the merge.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowNode>([]);
  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return flowNodes.map((n) => {
        const old = prevById.get(n.id);
        if (!old) return n;
        // Preserve internal fields (measured, etc) by spreading old first,
        // then layering our derived position / data / style on top.
        return { ...old, ...n };
      });
    });
  }, [flowNodes, setRfNodes]);

  const handleNodeDragStart = useCallback((_e: unknown, n: FlowNode) => {
    draggingRef.current = n.id;
    dragMovedRef.current = false;
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    const sim = simRef.current;
    const sn = simNodesRef.current.get(n.id);
    if (!sim || !sn) return;

    // Free the dragged node and its direct neighbors so the link spring
    // can pull the neighbors along during this drag. Every other node
    // stays pinned to its previous position (pinned at the end of the
    // last drag — see handleNodeDragStop) so charge / collide / center
    // forces can't push them around.
    const neighbors = adjacencyRef.current.get(n.id) ?? new Set<string>();
    simNodesRef.current.forEach((other, id) => {
      if (id === n.id || neighbors.has(id)) {
        other.fx = null;
        other.fy = null;
      }
    });

    // Now pin the dragged node to its current cursor position.
    sn.fx = n.position.x;
    sn.fy = n.position.y;

    sim.alphaTarget(0.35).restart();
  }, []);

  const handleNodeDrag = useCallback((_e: unknown, n: FlowNode) => {
    dragMovedRef.current = true;
    const sn = simNodesRef.current.get(n.id);
    if (!sn) return;
    sn.fx = n.position.x;
    sn.fy = n.position.y;
    // Reflect the cursor-followed position immediately even between sim ticks.
    positionsRef.current.set(n.id, { x: n.position.x, y: n.position.y });
  }, []);

  const handleNodeDragStop = useCallback(
    (_e: unknown, _n: FlowNode) => {
      const sim = simRef.current;
      // Freeze every node at its current position so nothing drifts
      // back after the user lets go. The next drag start will release
      // the dragged node and its neighbors as needed.
      simNodesRef.current.forEach((other) => {
        other.fx = other.x ?? 0;
        other.fy = other.y ?? 0;
      });
      if (sim) {
        sim.alphaTarget(0);
      }
      const wasMoved = dragMovedRef.current;
      // Settle, then freeze and persist.
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (simRef.current) simRef.current.stop();
        // Snap render positions to the simulation's final values.
        const map = positionsRef.current;
        simNodesRef.current.forEach((sNode, id) => {
          map.set(id, { x: sNode.x ?? 0, y: sNode.y ?? 0 });
        });
        setTick((t) => t + 1);
        if (wasMoved) persistPositions();
        // Clear drag flag a tick after stop so the trailing click (if any)
        // is suppressed.
        window.setTimeout(() => {
          draggingRef.current = null;
          dragMovedRef.current = false;
        }, 50);
      }, SETTLE_MS);
    },
    [persistPositions],
  );

  const handleNodeClick = useCallback((_e: unknown, _n: FlowNode) => {
    // No-op: React Flow's built-in selection state drives the faint
    // outline on the clicked node and clears it on pane click. We only
    // keep this handler to suppress the trailing click after a drag.
  }, []);

  const handleNodeDoubleClick = useCallback(
    (_e: unknown, n: FlowNode) => {
      setViewMode("windows");
      openInFocused(n.id);
    },
    [openInFocused, setViewMode],
  );

  return (
    <div className="absolute inset-0 pt-topbar">
      <ReactFlow
        nodes={rfNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnPinch
        zoomOnScroll
        minZoom={0.1}
        maxZoom={2.5}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        className="touch-none"
      >
        <Background color="hsl(var(--muted-foreground))" gap={32} size={1.5} className="opacity-10" />
        <Controls className="!bottom-4 !left-4 !bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
      </ReactFlow>
      {(!apiNodes || apiNodes.length === 0) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          No nodes in this realm yet.
        </div>
      )}
    </div>
  );
}

export function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
