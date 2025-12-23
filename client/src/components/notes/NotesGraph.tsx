import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Note } from "@/lib/api";
import { FileText, Grid3X3, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CanvasData, CanvasNode } from "./CanvasEditor";

interface NotesGraphProps {
  notes: Note[];
  onNoteClick?: (noteId: string) => void;
}

interface GraphNode {
  id: string;
  note: Note;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  fromId: string;
  toId: string;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const DEFAULT_ZOOM = 1;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const REPULSION_STRENGTH = 5000;
const ATTRACTION_STRENGTH = 0.05;
const DAMPING = 0.85;
const MIN_DISTANCE = 120;

function parseConnections(notes: Note[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const noteIds = new Set(notes.map((n) => n.id));

  for (const note of notes) {
    const content = note.content || "";
    const referencePattern = /\[\[note:([^\]|]+)\|?[^\]]*\]\]/g;
    let match;
    while ((match = referencePattern.exec(content)) !== null) {
      const referencedId = match[1];
      if (noteIds.has(referencedId) && referencedId !== note.id) {
        const exists = edges.some(
          (e) =>
            (e.fromId === note.id && e.toId === referencedId) ||
            (e.fromId === referencedId && e.toId === note.id)
        );
        if (!exists) {
          edges.push({ fromId: note.id, toId: referencedId });
        }
      }
    }

    if (note.type === "canvas" && note.canvasData) {
      const canvasData = note.canvasData as CanvasData;
      if (canvasData.nodes) {
        for (const node of canvasData.nodes) {
          if (node.type === "note" && node.noteId && noteIds.has(node.noteId) && node.noteId !== note.id) {
            const exists = edges.some(
              (e) =>
                (e.fromId === note.id && e.toId === node.noteId) ||
                (e.fromId === node.noteId && e.toId === note.id)
            );
            if (!exists) {
              edges.push({ fromId: note.id, toId: node.noteId! });
            }
          }
        }
      }
    }
  }

  return edges;
}

function initializeNodes(notes: Note[]): GraphNode[] {
  const count = notes.length;
  const cols = Math.ceil(Math.sqrt(count));
  const spacing = 250;

  return notes.map((note, i) => ({
    id: note.id,
    note,
    x: (i % cols) * spacing - ((cols - 1) * spacing) / 2,
    y: Math.floor(i / cols) * spacing - ((Math.ceil(count / cols) - 1) * spacing) / 2,
    vx: 0,
    vy: 0,
  }));
}

export function NotesGraph({ notes, onNoteClick }: NotesGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(DEFAULT_ZOOM);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);

  const edges = useMemo(() => parseConnections(notes), [notes]);
  const [nodes, setNodes] = useState<GraphNode[]>(() => initializeNodes(notes));
  const nodesRef = useRef<GraphNode[]>(nodes);
  const [isSimulating, setIsSimulating] = useState(true);

  useEffect(() => {
    const newNodes = initializeNodes(notes);
    setNodes(newNodes);
    nodesRef.current = newNodes;
    setIsSimulating(true);
  }, [notes]);

  useEffect(() => {
    if (!isSimulating) return;

    let iterations = 0;
    const maxIterations = 200;

    const simulate = () => {
      const currentNodes = nodesRef.current;
      if (currentNodes.length === 0) {
        setIsSimulating(false);
        return;
      }

      const connectedPairs = new Set<string>();
      for (const edge of edges) {
        connectedPairs.add(`${edge.fromId}-${edge.toId}`);
        connectedPairs.add(`${edge.toId}-${edge.fromId}`);
      }

      for (let i = 0; i < currentNodes.length; i++) {
        let fx = 0;
        let fy = 0;

        for (let j = 0; j < currentNodes.length; j++) {
          if (i === j) continue;
          const dx = currentNodes[i].x - currentNodes[j].x;
          const dy = currentNodes[i].y - currentNodes[j].y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq) || 1;

          const repulsion = REPULSION_STRENGTH / distSq;
          fx += (dx / dist) * repulsion;
          fy += (dy / dist) * repulsion;
        }

        for (const edge of edges) {
          let otherId: string | null = null;
          if (edge.fromId === currentNodes[i].id) otherId = edge.toId;
          else if (edge.toId === currentNodes[i].id) otherId = edge.fromId;
          if (!otherId) continue;

          const other = currentNodes.find((n) => n.id === otherId);
          if (!other) continue;

          const dx = other.x - currentNodes[i].x;
          const dy = other.y - currentNodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const attraction = (dist - MIN_DISTANCE) * ATTRACTION_STRENGTH;
          fx += (dx / dist) * attraction;
          fy += (dy / dist) * attraction;
        }

        currentNodes[i].vx = (currentNodes[i].vx + fx) * DAMPING;
        currentNodes[i].vy = (currentNodes[i].vy + fy) * DAMPING;
      }

      let maxVelocity = 0;
      for (const node of currentNodes) {
        node.x += node.vx;
        node.y += node.vy;
        maxVelocity = Math.max(maxVelocity, Math.abs(node.vx), Math.abs(node.vy));
      }

      nodesRef.current = [...currentNodes];
      setNodes([...currentNodes]);

      iterations++;
      if (maxVelocity < 0.1 || iterations >= maxIterations) {
        setIsSimulating(false);
      } else {
        animationRef.current = requestAnimationFrame(simulate);
      }
    };

    animationRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSimulating, edges]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current + delta));

      if (Math.abs(newZoom - zoomRef.current) > 0.001) {
        const worldX = (mouseX - panRef.current.x) / zoomRef.current;
        const worldY = (mouseY - panRef.current.y) / zoomRef.current;

        const newPan = {
          x: mouseX - worldX * newZoom,
          y: mouseY - worldY * newZoom,
        };

        panRef.current = newPan;
        zoomRef.current = newZoom;
        setPan(newPan);
        setZoom(newZoom);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).closest(".graph-background")) {
      setIsPanning(true);
      panStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.pointerX;
    const dy = e.clientY - panStartRef.current.pointerY;
    const newPan = {
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    };
    panRef.current = newPan;
    setPan(newPan);
  }, [isPanning]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
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
      minX = Math.min(minX, node.x - NODE_WIDTH / 2);
      minY = Math.min(minY, node.y - NODE_HEIGHT / 2);
      maxX = Math.max(maxX, node.x + NODE_WIDTH / 2);
      maxY = Math.max(maxY, node.y + NODE_HEIGHT / 2);
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newZoom = Math.min(
      Math.max(MIN_ZOOM, Math.min((rect.width - 100) / contentWidth, (rect.height - 100) / contentHeight)),
      MAX_ZOOM
    );

    const newPan = {
      x: rect.width / 2 - centerX * newZoom,
      y: rect.height / 2 - centerY * newZoom,
    };

    panRef.current = newPan;
    zoomRef.current = newZoom;
    setPan(newPan);
    setZoom(newZoom);
  }, [nodes]);

  useEffect(() => {
    if (!isSimulating && nodes.length > 0) {
      resetView();
    }
  }, [isSimulating]);

  const handleZoomIn = () => {
    const newZoom = Math.min(MAX_ZOOM, zoomRef.current + 0.2);
    zoomRef.current = newZoom;
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(MIN_ZOOM, zoomRef.current - 0.2);
    zoomRef.current = newZoom;
    setZoom(newZoom);
  };

  const renderEdge = (edge: GraphEdge, index: number) => {
    const fromNode = nodes.find((n) => n.id === edge.fromId);
    const toNode = nodes.find((n) => n.id === edge.toId);
    if (!fromNode || !toNode) return null;

    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const midX = (fromNode.x + toNode.x) / 2;
    const midY = (fromNode.y + toNode.y) / 2;
    const offset = 30;
    const perpX = -dy / (Math.sqrt(dx * dx + dy * dy) || 1) * offset;
    const perpY = dx / (Math.sqrt(dx * dx + dy * dy) || 1) * offset;
    const ctrlX = midX + perpX;
    const ctrlY = midY + perpY;

    const d = `M ${fromNode.x} ${fromNode.y} Q ${ctrlX} ${ctrlY} ${toNode.x} ${toNode.y}`;

    return (
      <path
        key={`edge-${index}`}
        d={d}
        stroke="#78716c"
        strokeWidth={2}
        fill="none"
        className="opacity-60"
      />
    );
  };

  const truncateTitle = (title: string, maxLength: number = 25) => {
    if (title.length <= maxLength) return title;
    return title.slice(0, maxLength) + "...";
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-stone-950">
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        data-testid="notes-graph-container"
      >
        <div
          className="graph-background absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(circle at 1px 1px, #44403c 1px, transparent 0)
            `,
            backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        <svg
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {edges.map((edge, i) => renderEdge(edge, i))}
        </svg>

        <div
          className="absolute"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {nodes.map((node) => {
            const isCanvas = node.note.type === "canvas";
            const isPinned = node.note.isPinned;
            const isHovered = hoveredNodeId === node.id;

            return (
              <div
                key={node.id}
                className={`absolute rounded-lg border-2 cursor-pointer transition-all duration-150 ${
                  isCanvas ? "bg-indigo-700/90" : "bg-stone-700/90"
                } ${isPinned ? "border-yellow-500" : "border-stone-600"} ${
                  isHovered ? "shadow-lg shadow-amber-900/40 scale-105" : ""
                }`}
                style={{
                  left: node.x - NODE_WIDTH / 2,
                  top: node.y - NODE_HEIGHT / 2,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onNoteClick?.(node.id);
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                data-testid={`graph-node-${node.id}`}
              >
                <div className="flex items-center gap-2 p-3 h-full">
                  {isCanvas ? (
                    <Grid3X3 className="h-4 w-4 text-indigo-300 flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-stone-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-100 truncate">
                      {truncateTitle(node.note.title)}
                    </div>
                    <div className="text-xs text-stone-400 truncate">
                      {node.note.content?.substring(0, 40) || "No content"}
                    </div>
                  </div>
                </div>

                {isHovered && (
                  <div
                    className="absolute z-50 p-3 bg-stone-900 border border-stone-700 rounded-lg shadow-xl max-w-xs pointer-events-none"
                    style={{
                      left: NODE_WIDTH + 8,
                      top: 0,
                    }}
                  >
                    <div className="font-medium text-stone-100 mb-1">
                      {node.note.title}
                    </div>
                    <div className="text-xs text-stone-400 line-clamp-3">
                      {node.note.content?.substring(0, 150) || "No content"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          className="bg-stone-900/80 border-stone-700 hover:bg-stone-800"
          data-testid="button-zoom-in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          className="bg-stone-900/80 border-stone-700 hover:bg-stone-800"
          data-testid="button-zoom-out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={resetView}
          className="bg-stone-900/80 border-stone-700 hover:bg-stone-800"
          data-testid="button-reset-view"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute bottom-4 left-4 text-xs text-stone-500">
        {nodes.length} notes • {edges.length} connections
        {isSimulating && " • Arranging..."}
      </div>
    </div>
  );
}
