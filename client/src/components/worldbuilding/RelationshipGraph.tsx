import React, { useRef, useEffect, useState, useCallback } from "react";
import { type Entity, type EntityLink, ENTITY_TYPE_CONFIG, LINK_TYPE_LABELS } from "@/lib/worldbuilding-api";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Loader2 } from "lucide-react";

interface RelationshipGraphProps {
  entities: Entity[];
  links: EntityLink[];
  onSelectEntity: (entityId: string) => void;
  selectedEntityId?: string | null;
}

interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  label: string;
  type: string;
  color: string;
  radius: number;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

export function RelationshipGraph({ entities, links, onSelectEntity, selectedEntityId }: RelationshipGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animFrameRef = useRef<number>(0);
  const simulationRef = useRef({ running: true, iteration: 0 });

  useEffect(() => {
    const linkedEntityIds = new Set<string>();
    links.forEach(l => { linkedEntityIds.add(l.fromEntityId); linkedEntityIds.add(l.toEntityId); });

    const relevantEntities = entities.filter(e => linkedEntityIds.has(e.id));

    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;
    const cx = width / 2;
    const cy = height / 2;

    const nodes: GraphNode[] = relevantEntities.map((e, i) => {
      const angle = (2 * Math.PI * i) / Math.max(relevantEntities.length, 1);
      const r = Math.min(width, height) * 0.3;
      const cfg = ENTITY_TYPE_CONFIG[e.entityType];
      return {
        id: e.id,
        x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 50,
        y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        label: e.displayName,
        type: e.entityType,
        color: cfg?.color || "#888",
        radius: 20,
      };
    });

    const nodeSet = new Set(nodes.map(n => n.id));
    const edges: GraphEdge[] = links
      .filter(l => nodeSet.has(l.fromEntityId) && nodeSet.has(l.toEntityId))
      .map(l => ({
        from: l.fromEntityId,
        to: l.toEntityId,
        label: LINK_TYPE_LABELS[l.linkType] || l.label || l.linkType,
      }));

    nodesRef.current = nodes;
    edgesRef.current = edges;
    simulationRef.current = { running: true, iteration: 0 };
    setPan({ x: 0, y: 0 });

    return () => { simulationRef.current.running = false; };
  }, [entities, links]);

  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (nodes.length === 0) return;

    const repulsionForce = 8000;
    const springForce = 0.005;
    const springLength = 150;
    const damping = 0.85;
    const centerPull = 0.001;
    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;
    const cx = width / 2;
    const cy = height / 2;

    for (let i = 0; i < nodes.length; i++) {
      let fx = 0, fy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = repulsionForce / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }
      fx += (cx - nodes[i].x) * centerPull;
      fy += (cy - nodes[i].y) * centerPull;
      nodes[i].vx = (nodes[i].vx + fx) * damping;
      nodes[i].vy = (nodes[i].vy + fy) * damping;
    }

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const edge of edges) {
      const a = nodeMap.get(edge.from);
      const b = nodeMap.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist - springLength) * springForce;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0c0a09";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    for (const edge of edges) {
      const a = nodeMap.get(edge.from);
      const b = nodeMap.get(edge.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "rgba(120, 113, 108, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.fillStyle = "rgba(168, 162, 158, 0.6)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(edge.label, mx, my - 4);
    }

    for (const node of nodes) {
      const isSelected = node.id === selectedEntityId;
      const isHovered = node.id === hoveredNode;

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? node.color + "33" : node.color + "22";
        ctx.fill();
        ctx.strokeStyle = node.color + "88";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color + "dd";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#fbbf24" : "#44403c";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      const initial = node.label.charAt(0).toUpperCase();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initial, node.x, node.y);

      ctx.fillStyle = isHovered || isSelected ? "#e7e5e4" : "#a8a29e";
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(node.label, node.x, node.y + node.radius + 4);
    }

    ctx.restore();
  }, [pan, zoom, selectedEntityId, hoveredNode]);

  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      if (simulationRef.current.iteration < 200) {
        simulate();
        simulationRef.current.iteration++;
      }
      draw();
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, [simulate, draw]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
  }, [pan, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    const clickedNode = nodesRef.current.find(n => {
      const dx = n.x - world.x;
      const dy = n.y - world.y;
      return Math.sqrt(dx * dx + dy * dy) < n.radius + 5;
    });

    if (clickedNode) {
      onSelectEntity(clickedNode.id);
    } else {
      setDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [screenToWorld, onSelectEntity, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    } else {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hovered = nodesRef.current.find(n => {
        const dx = n.x - world.x;
        const dy = n.y - world.y;
        return Math.sqrt(dx * dx + dy * dy) < n.radius + 5;
      });
      setHoveredNode(hovered?.id || null);
    }
  }, [dragging, dragStart, screenToWorld]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(3, z * delta)));
  }, []);

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    simulationRef.current = { running: true, iteration: 0 };
  }, []);

  if (nodesRef.current.length === 0 && entities.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-stone-500" data-testid="graph-empty">
        <p className="text-sm">No relationships to display</p>
        <p className="text-xs mt-1">Add links between entities to see them on the graph</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-stone-950" data-testid="relationship-graph">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ display: "block" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      <div className="absolute top-3 right-3 flex gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7 bg-stone-800/80 text-stone-400 hover:text-stone-200" onClick={() => setZoom(z => Math.min(3, z * 1.2))} data-testid="button-zoom-in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 bg-stone-800/80 text-stone-400 hover:text-stone-200" onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} data-testid="button-zoom-out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 bg-stone-800/80 text-stone-400 hover:text-stone-200" onClick={resetView} data-testid="button-reset-view">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
