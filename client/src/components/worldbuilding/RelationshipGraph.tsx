import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { LoadingLogo } from "@/components/LoadingLogo";
import { TAG_COLORS, useWorldGraphData, type WorldGraphData } from "@/lib/worldbuilding-api";
import { Button } from "@/components/ui/button";
import { PREDEFINED_TAGS } from "@shared/schema";
import { Filter, Tag, FileText, Sparkles, Package, Shield, Zap, UserCircle, X, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

type NodeCategory = "article" | "canvas" | "spell" | "item" | "trait" | "skill" | "character";

interface GraphNode {
  id: string;
  category: NodeCategory;
  tag?: string;
  tags?: string[];
  name: string;
  description?: string;
  portrait?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  fromId: string;
  toId: string;
}

const NODE_RADIUS = 8;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 0.8;

const REPULSION_STRENGTH = 800;
const ATTRACTION_STRENGTH = 0.015;
const EDGE_REST_LENGTH = 60;
const MAX_EDGE_LENGTH = 200;
const CENTER_GRAVITY = 0.008;
const DRIFT_ATTRACTION = 0.02;
const DAMPING = 0.92;
const MIN_VELOCITY = 0.005;
const NODE_MASS = 1.5;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const CATEGORY_COLORS: Record<NodeCategory, { fill: string; stroke: string; glow: string }> = {
  article: { fill: "#fff176", stroke: "#ffee58", glow: "rgba(255, 241, 118, 0.4)" },
  canvas: { fill: "#90caf9", stroke: "#64b5f6", glow: "rgba(144, 202, 249, 0.4)" },
  spell: { fill: "#ce93d8", stroke: "#ba68c8", glow: "rgba(206, 147, 216, 0.4)" },
  item: { fill: "#4db6ac", stroke: "#26a69a", glow: "rgba(77, 182, 172, 0.4)" },
  trait: { fill: "#81c784", stroke: "#66bb6a", glow: "rgba(129, 199, 132, 0.4)" },
  skill: { fill: "#64b5f6", stroke: "#42a5f5", glow: "rgba(100, 181, 246, 0.4)" },
  character: { fill: "#f97316", stroke: "#fb923c", glow: "rgba(249, 115, 22, 0.4)" },
};

const ADMIN_CATEGORIES: { key: NodeCategory; label: string }[] = [
  { key: "spell", label: "Spells" },
  { key: "item", label: "Items" },
  { key: "trait", label: "Traits" },
  { key: "skill", label: "Skills" },
  { key: "character", label: "Characters" },
];

function getNodeColor(node: GraphNode): { fill: string; stroke: string; glow: string } {
  if (node.tag && TAG_COLORS[node.tag]) {
    const base = TAG_COLORS[node.tag];
    return { fill: base, stroke: base, glow: base + "66" };
  }
  return CATEGORY_COLORS[node.category] || CATEGORY_COLORS.article;
}

function initializeSphericalShell(nodes: GraphNode[], radius: number = 200): void {
  const n = nodes.length;
  if (n === 0) return;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const theta = i * GOLDEN_ANGLE;
    const jitter = 0.15;
    nodes[i].x = (r * Math.cos(theta) + (Math.random() - 0.5) * jitter) * radius;
    nodes[i].y = (y + (Math.random() - 0.5) * jitter) * radius;
    nodes[i].vx = (Math.random() - 0.5) * 0.5;
    nodes[i].vy = (Math.random() - 0.5) * 0.5;
  }
}

function parseWikiLinksFromContent(content: string): { type: string; id: string }[] {
  const refs: { type: string; id: string }[] = [];
  const pattern = /\[\[(\w+):([^\|\]]+)\|?[^\]]*\]\]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    refs.push({ type: match[1], id: match[2] });
  }
  return refs;
}

function buildGraphData(
  data: WorldGraphData,
  tagFilters: Record<string, boolean>,
  categoryFilters: Record<NodeCategory, boolean>
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const nodeIdSet = new Set<string>();

  const addNode = (id: string, category: NodeCategory, name: string, description?: string | null, tag?: string, portrait?: string | null, allTags?: string[]) => {
    if (nodeIdSet.has(id)) return;
    nodeIdSet.add(id);
    nodes.push({
      id,
      category,
      tag,
      tags: allTags,
      name,
      description: description || undefined,
      portrait: portrait || undefined,
      x: 0, y: 0, vx: 0, vy: 0,
    });
  };

  for (const entity of data.entities) {
    const cat: NodeCategory = entity.entityType === "canvas" ? "canvas" : "article";
    const entityTags = (entity.tags as string[]) || [];
    const primaryTag = entityTags[0];
    addNode(`entity-${entity.id}`, cat, entity.displayName, entity.description, primaryTag, undefined, entityTags);
  }

  for (const item of data.items) {
    addNode(`item-${item.id}`, "item", item.name, item.description);
  }
  for (const spell of data.spells) {
    addNode(`spell-${spell.id}`, "spell", spell.name, spell.description);
  }
  for (const trait of data.traits) {
    addNode(`trait-${trait.id}`, "trait", trait.name, trait.description);
  }
  for (const skill of data.skills) {
    addNode(`skill-${skill.id}`, "skill", skill.name, skill.description);
  }
  for (const char of data.characters) {
    addNode(`character-${char.id}`, "character", char.name, char.biography, undefined, char.portrait);
  }

  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  const addEdge = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    if (!nodeIdSet.has(fromId) || !nodeIdSet.has(toId)) return;
    const key1 = `${fromId}-${toId}`;
    const key2 = `${toId}-${fromId}`;
    if (seenEdges.has(key1) || seenEdges.has(key2)) return;
    seenEdges.add(key1);
    edges.push({ fromId, toId });
  };

  for (const link of data.entityLinks) {
    addEdge(`entity-${link.fromEntityId}`, `entity-${link.toEntityId}`);
  }

  for (const entity of data.entities) {
    if (!entity.articleContent) continue;
    const refs = parseWikiLinksFromContent(entity.articleContent);
    for (const ref of refs) {
      let targetId: string;
      switch (ref.type) {
        case "entity": targetId = `entity-${ref.id}`; break;
        case "item": targetId = `item-${ref.id}`; break;
        case "spell": targetId = `spell-${ref.id}`; break;
        case "trait": targetId = `trait-${ref.id}`; break;
        case "skill": targetId = `skill-${ref.id}`; break;
        case "character": targetId = `character-${ref.id}`; break;
        case "map": targetId = `map-${ref.id}`; break;
        default: continue;
      }
      addEdge(`entity-${entity.id}`, targetId);
    }
  }

  const isNodeVisible = (node: GraphNode): boolean => {
    if (categoryFilters[node.category] === false) return false;
    if (node.category === "article" || node.category === "canvas") {
      const nodeTags = node.tags || (node.tag ? [node.tag] : []);
      if (nodeTags.length > 0) {
        const allTagsDisabled = nodeTags.every(t => tagFilters[t] === false);
        if (allTagsDisabled) return false;
      }
    }
    return true;
  };

  const visibleNodes = nodes.filter(isNodeVisible);
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = edges.filter(e => visibleIds.has(e.fromId) && visibleIds.has(e.toId));

  const radius = Math.max(120, Math.min(300, Math.sqrt(visibleNodes.length) * 25));
  initializeSphericalShell(visibleNodes, radius);

  return { nodes: visibleNodes, edges: visibleEdges };
}

interface RelationshipGraphProps {
  worldId: string;
  onSelectEntity: (entityId: string) => void;
  selectedEntityId?: string | null;
}

const DRAG_THRESHOLD = 5;
const FILTER_STORAGE_KEY = "worldGraph.filters";

function loadFilters(): { tags: Record<string, boolean>; categories: Record<NodeCategory, boolean> } {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { tags: {}, categories: { article: true, canvas: true, spell: true, item: true, trait: true, skill: true, character: true } };
}

function saveFilters(filters: { tags: Record<string, boolean>; categories: Record<NodeCategory, boolean> }) {
  try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters)); } catch {}
}

export function RelationshipGraph({ worldId, onSelectEntity, selectedEntityId }: RelationshipGraphProps) {
  const { data: graphData, isLoading } = useWorldGraphData(worldId);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const transformGroupRef = useRef<SVGGElement>(null);
  const panAnimationRef = useRef<number>(0);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(DEFAULT_ZOOM);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [savedFilters, setSavedFilters] = useState(loadFilters);
  const tagFilters = savedFilters.tags;
  const categoryFilters = savedFilters.categories;

  const isPanningRef = useRef(false);
  const isDraggingRef = useRef(false);
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number; startedOnNode: GraphNode | null } | null>(null);
  const touchStartRef = useRef<{ touches: { x: number; y: number }[]; zoom: number; pan: { x: number; y: number } } | null>(null);

  const updateTransform = useCallback(() => {
    if (transformGroupRef.current) {
      transformGroupRef.current.setAttribute(
        "transform",
        `translate(${panRef.current.x}, ${panRef.current.y}) scale(${zoomRef.current})`
      );
    }
  }, []);

  const toggleTagFilter = useCallback((tag: string) => {
    setSavedFilters(prev => {
      const next = { ...prev, tags: { ...prev.tags, [tag]: prev.tags[tag] === false ? true : false } };
      saveFilters(next);
      return next;
    });
  }, []);

  const toggleCategoryFilter = useCallback((cat: NodeCategory) => {
    setSavedFilters(prev => {
      const next = { ...prev, categories: { ...prev.categories, [cat]: !prev.categories[cat] } };
      saveFilters(next);
      return next;
    });
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!graphData) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    return buildGraphData(graphData, tagFilters, categoryFilters);
  }, [graphData, tagFilters, categoryFilters]);

  const nodesRef = useRef<GraphNode[]>(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const connectedNodesMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!map.has(edge.fromId)) map.set(edge.fromId, new Set());
      if (!map.has(edge.toId)) map.set(edge.toId, new Set());
      map.get(edge.fromId)!.add(edge.toId);
      map.get(edge.toId)!.add(edge.fromId);
    }
    return map;
  }, [edges]);

  const nodeIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((node, idx) => map.set(node.id, idx));
    return map;
  }, [nodes]);

  const nodeElementsRef = useRef<Map<string, SVGGElement>>(new Map());
  const edgeElementsRef = useRef<Map<string, SVGLineElement>>(new Map());

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let settledFrames = 0;
    let frameCount = 0;
    const SETTLE_THRESHOLD = 0.5;
    const SETTLED_SKIP = 10;

    const simulate = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 16.67, 2);
      lastTime = currentTime;
      frameCount++;

      const currentNodes = nodesRef.current;
      if (currentNodes.length === 0) {
        frameId = requestAnimationFrame(simulate);
        return;
      }

      if (settledFrames > 60 && frameCount % SETTLED_SKIP !== 0) {
        frameId = requestAnimationFrame(simulate);
        return;
      }

      const targetRadius = Math.max(120, Math.min(300, Math.sqrt(currentNodes.length) * 25));

      for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];
        let fx = 0, fy = 0;

        for (let j = 0; j < currentNodes.length; j++) {
          if (i === j) continue;
          const other = currentNodes[j];
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 90000) continue;
          const dist = Math.sqrt(distSq) || 1;
          const repulsion = REPULSION_STRENGTH / (distSq + 100);
          fx += (dx / dist) * repulsion;
          fy += (dy / dist) * repulsion;
        }

        const connections = connectedNodesMap.get(node.id);
        if (connections) {
          for (const otherId of Array.from(connections)) {
            const otherIdx = nodeIndexMap.get(otherId);
            if (otherIdx === undefined) continue;
            const other = currentNodes[otherIdx];
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            let strength = ATTRACTION_STRENGTH;
            if (dist > MAX_EDGE_LENGTH) {
              strength *= 2 + (dist - MAX_EDGE_LENGTH) / 100;
            }
            const displacement = dist - EDGE_REST_LENGTH;
            const attraction = displacement * strength;
            fx += (dx / dist) * attraction;
            fy += (dy / dist) * attraction;
          }
        }

        fx -= node.x * CENTER_GRAVITY;
        fy -= node.y * CENTER_GRAVITY;

        const distFromCenter = Math.sqrt(node.x * node.x + node.y * node.y);
        if (distFromCenter > targetRadius) {
          const driftFactor = (distFromCenter - targetRadius) / targetRadius;
          fx -= (node.x / distFromCenter) * driftFactor * DRIFT_ATTRACTION * distFromCenter;
          fy -= (node.y / distFromCenter) * driftFactor * DRIFT_ATTRACTION * distFromCenter;
        }

        node.vx = (node.vx + fx / NODE_MASS) * DAMPING;
        node.vy = (node.vy + fy / NODE_MASS) * DAMPING;

        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (speed < MIN_VELOCITY && speed > 0) {
          node.vx *= (MIN_VELOCITY / speed) * 0.3;
          node.vy *= (MIN_VELOCITY / speed) * 0.3;
        }
      }

      let totalEnergy = 0;
      for (const node of currentNodes) {
        node.x += node.vx * dt;
        node.y += node.vy * dt;
        totalEnergy += node.vx * node.vx + node.vy * node.vy;
      }

      if (totalEnergy < SETTLE_THRESHOLD) settledFrames++;
      else settledFrames = 0;

      const nodeEntries = Array.from(nodeElementsRef.current.entries());
      for (const [id, el] of nodeEntries) {
        const idx = nodeIndexMap.get(id);
        if (idx !== undefined) {
          el.setAttribute("transform", `translate(${currentNodes[idx].x}, ${currentNodes[idx].y})`);
        }
      }

      const edgeEntries = Array.from(edgeElementsRef.current.entries());
      for (const [key, el] of edgeEntries) {
        const [fromId, toId] = key.split("|");
        const fromIdx = nodeIndexMap.get(fromId);
        const toIdx = nodeIndexMap.get(toId);
        if (fromIdx !== undefined && toIdx !== undefined) {
          el.setAttribute("x1", String(currentNodes[fromIdx].x));
          el.setAttribute("y1", String(currentNodes[fromIdx].y));
          el.setAttribute("x2", String(currentNodes[toIdx].x));
          el.setAttribute("y2", String(currentNodes[toIdx].y));
        }
      }

      frameId = requestAnimationFrame(simulate);
    };

    frameId = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(frameId);
  }, [connectedNodesMap, nodeIndexMap]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * (1 + delta)));
      if (Math.abs(newZoom - zoomRef.current) > 0.001) {
        const worldX = (mouseX - panRef.current.x) / zoomRef.current;
        const worldY = (mouseY - panRef.current.y) / zoomRef.current;
        panRef.current = { x: mouseX - worldX * newZoom, y: mouseY - worldY * newZoom };
        zoomRef.current = newZoom;
        updateTransform();
        setPan({ ...panRef.current });
        setZoom(newZoom);
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [updateTransform]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".entity-popup")) return;
    const nodeElement = target.closest(".graph-node");
    let startedOnNode: GraphNode | null = null;
    if (nodeElement) {
      const nodeId = nodeElement.getAttribute("data-node-id");
      if (nodeId) startedOnNode = nodesRef.current.find(n => n.id === nodeId) || null;
    }
    isPanningRef.current = true;
    isDraggingRef.current = false;
    panStartRef.current = { pointerX: e.clientX, pointerY: e.clientY, panX: panRef.current.x, panY: panRef.current.y, startedOnNode };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.pointerX;
    const dy = e.clientY - panStartRef.current.pointerY;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      isDraggingRef.current = true;
      setHoveredNodeId(null);
    }
    if (isDraggingRef.current) {
      panRef.current = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
      if (!panAnimationRef.current) {
        panAnimationRef.current = requestAnimationFrame(() => {
          updateTransform();
          panAnimationRef.current = 0;
        });
      }
    }
  }, [updateTransform]);

  const handlePointerUp = useCallback(() => {
    const clickedNode = panStartRef.current?.startedOnNode;
    const wasDragging = isDraggingRef.current;
    if (wasDragging) setPan({ ...panRef.current });
    isPanningRef.current = false;
    isDraggingRef.current = false;
    panStartRef.current = null;
    if (clickedNode && !wasDragging) {
      if (clickedNode.category === "article" || clickedNode.category === "canvas") {
        const entityId = clickedNode.id.replace("entity-", "");
        onSelectEntity(entityId);
      } else {
        setSelectedNode(clickedNode);
      }
    }
  }, [onSelectEntity]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
      touchStartRef.current = { touches, zoom: zoomRef.current, pan: { ...panRef.current } };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const startDist = Math.hypot(
        touchStartRef.current.touches[1].x - touchStartRef.current.touches[0].x,
        touchStartRef.current.touches[1].y - touchStartRef.current.touches[0].y
      );
      const scale = currentDist / startDist;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, touchStartRef.current.zoom * scale));
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;
      const startCenterX = (touchStartRef.current.touches[0].x + touchStartRef.current.touches[1].x) / 2;
      const startCenterY = (touchStartRef.current.touches[0].y + touchStartRef.current.touches[1].y) / 2;
      const zoomDelta = newZoom / touchStartRef.current.zoom;
      panRef.current = {
        x: centerX - (startCenterX - touchStartRef.current.pan.x) * zoomDelta,
        y: centerY - (startCenterY - touchStartRef.current.pan.y) * zoomDelta,
      };
      zoomRef.current = newZoom;
      if (!panAnimationRef.current) {
        panAnimationRef.current = requestAnimationFrame(() => { updateTransform(); panAnimationRef.current = 0; });
      }
    }
  }, [updateTransform]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2 && touchStartRef.current) {
      setPan({ ...panRef.current });
      setZoom(zoomRef.current);
      touchStartRef.current = null;
    }
  }, []);

  const resetView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || nodes.length === 0) {
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = DEFAULT_ZOOM;
      setPan({ x: 0, y: 0 });
      setZoom(DEFAULT_ZOOM);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x - NODE_RADIUS * 2);
      minY = Math.min(minY, node.y - NODE_RADIUS * 2);
      maxX = Math.max(maxX, node.x + NODE_RADIUS * 2);
      maxY = Math.max(maxY, node.y + NODE_RADIUS * 2);
    }
    const cw = maxX - minX, ch = maxY - minY;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const newZoom = Math.min(Math.max(MIN_ZOOM, Math.min((rect.width - 100) / cw, (rect.height - 100) / ch)), MAX_ZOOM);
    const newPan = { x: rect.width / 2 - cx * newZoom, y: rect.height / 2 - cy * newZoom };
    panRef.current = newPan;
    zoomRef.current = newZoom;
    setPan(newPan);
    setZoom(newZoom);
  }, [nodes]);

  const initialViewSetRef = useRef(false);
  useEffect(() => {
    if (!initialViewSetRef.current && nodes.length > 0) {
      const timer = setTimeout(() => { resetView(); initialViewSetRef.current = true; }, 100);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, resetView]);

  const prevDataKeyRef = useRef("");
  useEffect(() => {
    const key = `${nodes.length}-${edges.length}`;
    if (prevDataKeyRef.current !== key) {
      prevDataKeyRef.current = key;
      initialViewSetRef.current = false;
    }
  }, [nodes.length, edges.length]);

  const isConnected = (nodeId: string) => {
    if (!hoveredNodeId) return false;
    if (nodeId === hoveredNodeId) return true;
    return connectedNodesMap.get(hoveredNodeId)?.has(nodeId) || false;
  };

  const isEdgeConnected = (edge: GraphEdge) => {
    if (!hoveredNodeId) return false;
    return edge.fromId === hoveredNodeId || edge.toId === hoveredNodeId;
  };

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const usedTags = useMemo(() => {
    if (!graphData) return [];
    const tags = new Set<string>();
    for (const entity of graphData.entities) {
      for (const tag of ((entity.tags as string[]) || [])) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }, [graphData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-stone-500" data-testid="graph-loading">
        <LoadingLogo className="h-6 w-6 mr-2" />
        <span className="text-sm">Loading graph data...</span>
      </div>
    );
  }

  if (!graphData || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-stone-500" data-testid="graph-empty">
        <p className="text-sm">No data to display</p>
        <p className="text-xs mt-1">Add entities, wiki-links, or connect a campaign to see the graph</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-stone-950" data-testid="relationship-graph">
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-testid="graph-container"
      >
        <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ background: "transparent" }}>
          <g ref={transformGroupRef} transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {edges.map((edge, i) => {
              const fromNode = nodeMap.get(edge.fromId);
              const toNode = nodeMap.get(edge.toId);
              if (!fromNode || !toNode) return null;
              const connected = isEdgeConnected(edge);
              const opacity = hoveredNodeId ? (connected ? 0.8 : 0.1) : 0.3;
              const edgeKey = `${edge.fromId}|${edge.toId}`;
              return (
                <line
                  key={`edge-${i}`}
                  ref={(el) => { if (el) edgeElementsRef.current.set(edgeKey, el); else edgeElementsRef.current.delete(edgeKey); }}
                  x1={fromNode.x || 0}
                  y1={fromNode.y || 0}
                  x2={toNode.x || 0}
                  y2={toNode.y || 0}
                  stroke={connected ? "#a8a29e" : "#57534e"}
                  strokeWidth={(connected ? 1.5 : 1) / zoom}
                  opacity={opacity}
                />
              );
            })}

            {nodes.map((node) => {
              const colors = getNodeColor(node);
              const connected = isConnected(node.id);
              const isHovered = hoveredNodeId === node.id;
              const isSelected = selectedEntityId && node.id === `entity-${selectedEntityId}`;
              const opacity = hoveredNodeId ? (connected ? 1 : 0.3) : 1;
              const isChar = node.category === "character";
              const baseRadius = isChar ? NODE_RADIUS * 1.4 : NODE_RADIUS;
              const scale = isHovered ? 1.5 : isSelected ? 1.3 : 1;
              const radius = baseRadius * scale;
              const displayName = node.name.length > 18 ? node.name.substring(0, 18) + "..." : node.name;
              const hasPortrait = isChar && node.portrait;
              const nx = node.x || 0;
              const ny = node.y || 0;

              return (
                <g
                  key={node.id}
                  ref={(el) => { if (el) nodeElementsRef.current.set(node.id, el); else nodeElementsRef.current.delete(node.id); }}
                  transform={`translate(${nx}, ${ny})`}
                  className="graph-node cursor-pointer"
                  style={{ opacity }}
                  onMouseEnter={() => !isDraggingRef.current && setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  data-testid={`graph-node-${node.id}`}
                  data-node-id={node.id}
                >
                  {isSelected && !isHovered && (
                    <circle cx={0} cy={0} r={radius + 5} fill="none" stroke="#fbbf24" strokeWidth={2.5 / zoom} strokeDasharray={`${4 / zoom} ${2 / zoom}`} />
                  )}
                  {isHovered && (
                    <circle cx={0} cy={0} r={radius + 4} fill={colors.glow} className="animate-pulse" />
                  )}
                  {hasPortrait ? (
                    <>
                      <defs>
                        <clipPath id={`clip-${node.id}`}>
                          <circle cx={0} cy={0} r={radius - 1} />
                        </clipPath>
                      </defs>
                      <circle cx={0} cy={0} r={radius} fill={colors.fill} stroke={colors.stroke} strokeWidth={2 / zoom} />
                      <image
                        href={node.portrait}
                        x={-radius + 1}
                        y={-radius + 1}
                        width={(radius - 1) * 2}
                        height={(radius - 1) * 2}
                        clipPath={`url(#clip-${node.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </>
                  ) : (
                    <>
                      <circle cx={0} cy={0} r={radius} fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5 / zoom} />
                      {radius >= 6 && (
                        <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill={node.category === "article" || node.category === "canvas" ? "#1c1917" : "#fff"} fontSize={radius * 0.9} fontFamily="system-ui" className="pointer-events-none select-none">
                          {node.category === "spell" ? "\u2728" : node.category === "item" ? "\u2692" : node.category === "trait" ? "\u2694" : node.category === "skill" ? "\u26A1" : node.category === "character" ? "\u263A" : node.category === "canvas" ? "\u25A1" : "\u270E"}
                        </text>
                      )}
                    </>
                  )}
                  {showLabels && !isHovered && (
                    <g className="pointer-events-none">
                      <rect x={-50 / zoom} y={NODE_RADIUS + 4 / zoom} width={100 / zoom} height={18 / zoom} rx={3 / zoom} fill="rgba(28, 25, 23, 0.85)" stroke={colors.stroke} strokeWidth={0.5 / zoom} />
                      <text x={0} y={NODE_RADIUS + 16 / zoom} textAnchor="middle" fill="#d6d3d1" fontSize={10 / zoom} fontFamily="system-ui">{displayName}</text>
                    </g>
                  )}
                  {isHovered && (
                    <g className="pointer-events-none">
                      <rect x={-60 / zoom} y={radius + 8 / zoom} width={120 / zoom} height={24 / zoom} rx={4 / zoom} fill="rgba(28, 25, 23, 0.95)" stroke="#44403c" strokeWidth={1 / zoom} />
                      <text x={0} y={radius + 20 / zoom} textAnchor="middle" fill="#e7e5e4" fontSize={12 / zoom} fontFamily="system-ui">{displayName}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {selectedNode && (
        <div className="entity-popup absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-stone-900 border border-stone-700 rounded-lg shadow-2xl p-4 max-w-sm z-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {selectedNode.category === "character" && selectedNode.portrait ? (
                <img src={selectedNode.portrait} alt={selectedNode.name} className="w-10 h-10 rounded-full object-cover border-2" style={{ borderColor: getNodeColor(selectedNode).stroke }} />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: getNodeColor(selectedNode).fill }}>
                  {selectedNode.category === "spell" && <Sparkles className="h-3 w-3 text-white" />}
                  {selectedNode.category === "item" && <Package className="h-3 w-3 text-white" />}
                  {selectedNode.category === "trait" && <Shield className="h-3 w-3 text-white" />}
                  {selectedNode.category === "skill" && <Zap className="h-3 w-3 text-white" />}
                  {selectedNode.category === "character" && <UserCircle className="h-3 w-3 text-white" />}
                  {(selectedNode.category === "article" || selectedNode.category === "canvas") && <FileText className="h-3 w-3 text-stone-800" />}
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-stone-100">{selectedNode.name}</div>
                <div className="text-xs text-stone-400 capitalize">{selectedNode.tag || selectedNode.category}</div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-stone-400 hover:text-stone-200" onClick={() => setSelectedNode(null)} data-testid="button-close-entity-popup">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selectedNode.description && (
            <p className="text-sm text-stone-300 line-clamp-4">{selectedNode.description}</p>
          )}
          <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
            <span>{connectedNodesMap.get(selectedNode.id)?.size || 0} connections</span>
          </div>
        </div>
      )}

      {filtersOpen && (
        <div className="absolute top-4 right-16 bg-stone-900/95 border border-stone-700 rounded-lg p-2 flex flex-col gap-0.5 animate-in fade-in slide-in-from-right-2 duration-200 z-20 max-h-[80vh] overflow-y-auto" data-testid="graph-filter-panel">
          <div className="text-xs text-stone-500 mb-1 flex items-center justify-between">
            <span>Categories</span>
            <button onClick={() => setFiltersOpen(false)} className="text-stone-500 hover:text-stone-300">
              <X className="h-3 w-3" />
            </button>
          </div>
          <button
            onClick={() => toggleCategoryFilter("article")}
            className={`flex items-center gap-2 px-2 py-1 rounded text-left transition-all ${categoryFilters.article !== false ? "bg-stone-800/50 hover:bg-stone-700/50" : "bg-stone-900/30 opacity-40 hover:opacity-60"}`}
            data-testid="filter-toggle-article"
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS.article.fill, opacity: categoryFilters.article !== false ? 1 : 0.4 }} />
            <span className={`text-xs ${categoryFilters.article !== false ? "text-stone-300" : "text-stone-600 line-through"}`}>Articles</span>
          </button>
          <button
            onClick={() => toggleCategoryFilter("canvas")}
            className={`flex items-center gap-2 px-2 py-1 rounded text-left transition-all ${categoryFilters.canvas !== false ? "bg-stone-800/50 hover:bg-stone-700/50" : "bg-stone-900/30 opacity-40 hover:opacity-60"}`}
            data-testid="filter-toggle-canvas"
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS.canvas.fill, opacity: categoryFilters.canvas !== false ? 1 : 0.4 }} />
            <span className={`text-xs ${categoryFilters.canvas !== false ? "text-stone-300" : "text-stone-600 line-through"}`}>Canvas</span>
          </button>
          {ADMIN_CATEGORIES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleCategoryFilter(key)}
              className={`flex items-center gap-2 px-2 py-1 rounded text-left transition-all ${categoryFilters[key] !== false ? "bg-stone-800/50 hover:bg-stone-700/50" : "bg-stone-900/30 opacity-40 hover:opacity-60"}`}
              data-testid={`filter-toggle-${key}`}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[key].fill, opacity: categoryFilters[key] !== false ? 1 : 0.4 }} />
              <span className={`text-xs ${categoryFilters[key] !== false ? "text-stone-300" : "text-stone-600 line-through"}`}>{label}</span>
            </button>
          ))}
          <div className="text-xs text-stone-500 mt-2 mb-1">Article Tags</div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {PREDEFINED_TAGS.map(tag => {
              const isEnabled = tagFilters[tag] !== false;
              const hasNodes = usedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className={`flex items-center gap-2 px-2 py-0.5 rounded text-left transition-all w-full ${isEnabled ? "bg-stone-800/50 hover:bg-stone-700/50" : "bg-stone-900/30 opacity-40 hover:opacity-60"} ${!hasNodes ? "opacity-30" : ""}`}
                  data-testid={`filter-toggle-tag-${tag}`}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TAG_COLORS[tag] || "#78909c", opacity: isEnabled ? 1 : 0.4 }} />
                  <span className={`text-[10px] ${isEnabled ? "text-stone-300" : "text-stone-600 line-through"}`}>{tag}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <Button variant="outline" size="icon" onClick={() => setFiltersOpen(!filtersOpen)} className={`bg-stone-900/80 border-stone-700 hover:bg-stone-800 ${filtersOpen ? "text-amber-400 border-amber-600" : ""}`} data-testid="button-toggle-filters">
          <Filter className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => { const nz = Math.min(MAX_ZOOM, zoomRef.current * 1.3); zoomRef.current = nz; setZoom(nz); }} className="bg-stone-900/80 border-stone-700 hover:bg-stone-800" data-testid="button-zoom-in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => { const nz = Math.max(MIN_ZOOM, zoomRef.current / 1.3); zoomRef.current = nz; setZoom(nz); }} className="bg-stone-900/80 border-stone-700 hover:bg-stone-800" data-testid="button-zoom-out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={resetView} className="bg-stone-900/80 border-stone-700 hover:bg-stone-800" data-testid="button-reset-view">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => setShowLabels(!showLabels)} className={`bg-stone-900/80 border-stone-700 hover:bg-stone-800 ${showLabels ? "text-amber-400 border-amber-600" : ""}`} data-testid="button-toggle-labels">
          <Tag className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute bottom-4 left-4">
        <div className="text-xs text-stone-500">
          {nodes.length} nodes {edges.length} connections
        </div>
      </div>
    </div>
  );
}
