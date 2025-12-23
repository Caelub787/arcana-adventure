import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, Note, SearchableEntity } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Type,
  FileText,
  Sparkles,
  Package,
  Shield,
  Zap,
  Users,
  Link2,
  Trash2,
  Plus,
  RotateCcw,
  Search,
  Loader2,
  GripHorizontal,
} from "lucide-react";
import { ReferencePicker, getEntityIcon, getEntityColor } from "./ReferencePicker";

export interface CanvasNode {
  id: string;
  type: "text" | "note" | "entity";
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  noteId?: string;
  noteTitle?: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
}

export interface CanvasConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  color?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
}

interface CanvasEditorProps {
  canvasData: CanvasData;
  onChange: (data: CanvasData) => void;
  readOnly?: boolean;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const DEFAULT_ZOOM = 1;
const GRID_SIZE = 20;

export function CanvasEditor({ canvasData, onChange, readOnly = false }: CanvasEditorProps) {
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [connectionEnd, setConnectionEnd] = useState<{ x: number; y: number } | null>(null);
  
  const dragStartRef = useRef<{ nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const resizeStartRef = useRef<{ nodeId: string; startX: number; startY: number; width: number; height: number } | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  
  const [noteSearchOpen, setNoteSearchOpen] = useState(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  
  const { data: searchedNotes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["/api/notes/search", noteSearchQuery],
    queryFn: () => api.searchNotes(noteSearchQuery),
    enabled: noteSearchOpen && noteSearchQuery.length > 0,
    staleTime: 30000,
  });

  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = (screenX - rect.left - panRef.current.x) / zoomRef.current;
    const y = (screenY - rect.top - panRef.current.y) / zoomRef.current;
    return { x, y };
  }, []);

  const getViewportCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [screenToWorld]);

  const updateNode = useCallback((nodeId: string, updates: Partial<CanvasNode>) => {
    if (readOnly) return;
    const newNodes = canvasData.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...updates } : n
    );
    onChange({ ...canvasData, nodes: newNodes });
  }, [canvasData, onChange, readOnly]);

  const addNode = useCallback((type: CanvasNode["type"], extra: Partial<CanvasNode> = {}) => {
    if (readOnly) return;
    const center = getViewportCenter();
    const newNode: CanvasNode = {
      id: crypto.randomUUID(),
      type,
      x: center.x - 75,
      y: center.y - 50,
      width: 150,
      height: 100,
      ...extra,
    };
    onChange({
      ...canvasData,
      nodes: [...canvasData.nodes, newNode],
    });
    setSelectedNodeId(newNode.id);
  }, [canvasData, onChange, getViewportCenter, readOnly]);

  const deleteNode = useCallback((nodeId: string) => {
    if (readOnly) return;
    const newNodes = canvasData.nodes.filter((n) => n.id !== nodeId);
    const newConnections = canvasData.connections.filter(
      (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
    );
    onChange({ nodes: newNodes, connections: newConnections });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [canvasData, onChange, selectedNodeId, readOnly]);

  const deleteConnection = useCallback((connectionId: string) => {
    if (readOnly) return;
    const newConnections = canvasData.connections.filter((c) => c.id !== connectionId);
    onChange({ ...canvasData, connections: newConnections });
    if (selectedConnectionId === connectionId) setSelectedConnectionId(null);
  }, [canvasData, onChange, selectedConnectionId, readOnly]);

  const addConnection = useCallback((fromNodeId: string, toNodeId: string) => {
    if (readOnly) return;
    if (fromNodeId === toNodeId) return;
    const exists = canvasData.connections.some(
      (c) => (c.fromNodeId === fromNodeId && c.toNodeId === toNodeId) ||
             (c.fromNodeId === toNodeId && c.toNodeId === fromNodeId)
    );
    if (exists) return;
    
    const newConnection: CanvasConnection = {
      id: crypto.randomUUID(),
      fromNodeId,
      toNodeId,
    };
    onChange({
      ...canvasData,
      connections: [...canvasData.connections, newConnection],
    });
  }, [canvasData, onChange, readOnly]);

  const resetView = useCallback(() => {
    if (canvasData.nodes.length === 0) {
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = DEFAULT_ZOOM;
      setPan({ x: 0, y: 0 });
      setZoom(DEFAULT_ZOOM);
      return;
    }
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    canvasData.nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    });
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const newZoom = Math.min(
      Math.max(MIN_ZOOM, Math.min((rect.width - 100) / contentWidth, (rect.height - 100) / contentHeight)),
      MAX_ZOOM
    );
    
    const newPanX = rect.width / 2 - centerX * newZoom;
    const newPanY = rect.height / 2 - centerY * newZoom;
    
    panRef.current = { x: newPanX, y: newPanY };
    zoomRef.current = newZoom;
    setPan({ x: newPanX, y: newPanY });
    setZoom(newZoom);
  }, [canvasData.nodes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
          return;
        }
        if (selectedNodeId) {
          deleteNode(selectedNodeId);
        } else if (selectedConnectionId) {
          deleteConnection(selectedConnectionId);
        }
      }
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setSelectedConnectionId(null);
        setIsConnecting(false);
        setConnectionStart(null);
        setConnectionEnd(null);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, selectedConnectionId, deleteNode, deleteConnection]);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDistanceRef.current !== null) {
        e.preventDefault();
        
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const scale = distance / lastTouchDistanceRef.current;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * scale));
        
        const rect = container.getBoundingClientRect();
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        
        const worldX = (centerX - panRef.current.x) / zoomRef.current;
        const worldY = (centerY - panRef.current.y) / zoomRef.current;
        
        const newPan = {
          x: centerX - worldX * newZoom,
          y: centerY - worldY * newZoom,
        };
        
        panRef.current = newPan;
        zoomRef.current = newZoom;
        lastTouchDistanceRef.current = distance;
        setPan(newPan);
        setZoom(newZoom);
      }
    };

    const handleTouchEnd = () => {
      lastTouchDistanceRef.current = null;
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.button !== 0) return;
    
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
    
    setIsPanning(true);
    panStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (isConnecting && connectionStart) {
      const world = screenToWorld(e.clientX, e.clientY);
      setConnectionEnd(world);
    }
    
    if (isPanning && panStartRef.current) {
      const deltaX = e.clientX - panStartRef.current.pointerX;
      const deltaY = e.clientY - panStartRef.current.pointerY;
      
      const newPan = {
        x: panStartRef.current.panX + deltaX,
        y: panStartRef.current.panY + deltaY,
      };
      
      panRef.current = newPan;
      setPan(newPan);
    }
    
    if (isDragging && dragStartRef.current) {
      const world = screenToWorld(e.clientX, e.clientY);
      const deltaX = world.x - dragStartRef.current.startX;
      const deltaY = world.y - dragStartRef.current.startY;
      
      updateNode(dragStartRef.current.nodeId, {
        x: dragStartRef.current.nodeX + deltaX,
        y: dragStartRef.current.nodeY + deltaY,
      });
    }
    
    if (isResizing && resizeStartRef.current) {
      const world = screenToWorld(e.clientX, e.clientY);
      const deltaX = world.x - resizeStartRef.current.startX;
      const deltaY = world.y - resizeStartRef.current.startY;
      
      updateNode(resizeStartRef.current.nodeId, {
        width: Math.max(80, resizeStartRef.current.width + deltaX),
        height: Math.max(40, resizeStartRef.current.height + deltaY),
      });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    if (isConnecting && connectionStart) {
      const world = screenToWorld(e.clientX, e.clientY);
      const targetNode = canvasData.nodes.find((n) => 
        world.x >= n.x && world.x <= n.x + n.width &&
        world.y >= n.y && world.y <= n.y + n.height
      );
      if (targetNode && targetNode.id !== connectionStart.nodeId) {
        addConnection(connectionStart.nodeId, targetNode.id);
      }
    }
    
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    
    setIsPanning(false);
    setIsDragging(false);
    setIsResizing(false);
    setIsConnecting(false);
    setConnectionStart(null);
    setConnectionEnd(null);
    panStartRef.current = null;
    dragStartRef.current = null;
    resizeStartRef.current = null;
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (readOnly) return;
    if (e.button !== 0) return;
    
    setSelectedNodeId(node.id);
    setSelectedConnectionId(null);
    
    setIsDragging(true);
    const world = screenToWorld(e.clientX, e.clientY);
    dragStartRef.current = {
      nodeId: node.id,
      startX: world.x,
      startY: world.y,
      nodeX: node.x,
      nodeY: node.y,
    };
    
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (readOnly) return;
    if (e.button !== 0) return;
    
    setIsResizing(true);
    const world = screenToWorld(e.clientX, e.clientY);
    resizeStartRef.current = {
      nodeId: node.id,
      startX: world.x,
      startY: world.y,
      width: node.width,
      height: node.height,
    };
    
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleConnectionHandlePointerDown = (e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (readOnly) return;
    
    setIsConnecting(true);
    setConnectionStart({
      nodeId: node.id,
      x: node.x + node.width,
      y: node.y + node.height / 2,
    });
    setConnectionEnd({
      x: node.x + node.width,
      y: node.y + node.height / 2,
    });
  };

  const handleNoteSelect = (note: Note) => {
    addNode("note", {
      noteId: note.id,
      noteTitle: note.title,
      content: note.title,
    });
    setNoteSearchOpen(false);
    setNoteSearchQuery("");
  };

  const handleEntitySelect = (entity: SearchableEntity) => {
    addNode("entity", {
      entityType: entity.type,
      entityId: entity.id,
      entityName: entity.name,
      content: entity.name,
    });
    setEntityPickerOpen(false);
  };

  const getConnectionPath = (connection: CanvasConnection) => {
    const fromNode = canvasData.nodes.find((n) => n.id === connection.fromNodeId);
    const toNode = canvasData.nodes.find((n) => n.id === connection.toNodeId);
    if (!fromNode || !toNode) return "";
    
    const fromX = fromNode.x + fromNode.width;
    const fromY = fromNode.y + fromNode.height / 2;
    const toX = toNode.x;
    const toY = toNode.y + toNode.height / 2;
    
    const controlX = (fromX + toX) / 2;
    
    return `M ${fromX} ${fromY} C ${controlX} ${fromY}, ${controlX} ${toY}, ${toX} ${toY}`;
  };

  const renderNode = (node: CanvasNode) => {
    const isSelected = selectedNodeId === node.id;
    
    return (
      <div
        key={node.id}
        className={`absolute bg-stone-800 rounded-lg border-2 transition-colors cursor-move ${
          isSelected ? "border-indigo-500 shadow-lg shadow-indigo-500/20" : "border-stone-600 hover:border-stone-500"
        }`}
        style={{
          left: node.x,
          top: node.y,
          width: node.width,
          height: node.height,
        }}
        onPointerDown={(e) => handleNodePointerDown(e, node)}
        data-testid={`canvas-node-${node.id}`}
      >
        <div className="p-2 h-full flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              {node.type === "text" && <Type className="h-3 w-3 text-stone-400" />}
              {node.type === "note" && <FileText className="h-3 w-3 text-amber-400" />}
              {node.type === "entity" && node.entityType && (
                <span className={getEntityColor(node.entityType)}>
                  {getEntityIcon(node.entityType)}
                </span>
              )}
              <span className="text-xs text-stone-500 capitalize">{node.type}</span>
            </div>
            {!readOnly && isSelected && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-stone-400 hover:text-red-400"
                onClick={() => deleteNode(node.id)}
                data-testid={`delete-node-${node.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          <div className="flex-1 overflow-hidden">
            {node.type === "text" && !readOnly ? (
              <Textarea
                value={node.content || ""}
                onChange={(e) => updateNode(node.id, { content: e.target.value })}
                className="h-full resize-none bg-stone-900/50 border-stone-700 text-sm"
                placeholder="Enter text..."
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`textarea-node-${node.id}`}
              />
            ) : node.type === "text" ? (
              <div className="text-sm text-stone-300 whitespace-pre-wrap">{node.content}</div>
            ) : node.type === "note" ? (
              <button
                className="flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm w-full text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  if (node.noteId) setLocation(`/notes/${node.noteId}`);
                }}
                data-testid={`note-link-${node.id}`}
              >
                <Link2 className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{node.noteTitle || "Linked Note"}</span>
              </button>
            ) : node.type === "entity" ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${getEntityColor(node.entityType || "")}`}>
                  {node.entityType}
                </Badge>
                <span className="text-sm text-stone-300 truncate">{node.entityName}</span>
              </div>
            ) : null}
          </div>
        </div>
        
        {!readOnly && (
          <>
            <div
              className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-indigo-500 rounded-full cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
              onPointerDown={(e) => handleConnectionHandlePointerDown(e, node)}
              data-testid={`connection-handle-${node.id}`}
            />
            <div
              className="absolute -right-1 -bottom-1 w-3 h-3 bg-stone-500 rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100 hover:opacity-100"
              onPointerDown={(e) => handleResizePointerDown(e, node)}
              data-testid={`resize-handle-${node.id}`}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-stone-950">
      {!readOnly && (
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-stone-900/90 backdrop-blur-sm rounded-lg p-2 border border-stone-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addNode("text", { content: "" })}
              className="text-stone-300 hover:text-white"
              data-testid="button-add-text"
            >
              <Type className="h-4 w-4 mr-2" />
              Add Text
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNoteSearchOpen(true)}
              className="text-stone-300 hover:text-white"
              data-testid="button-add-note"
            >
              <FileText className="h-4 w-4 mr-2" />
              Add Note Link
            </Button>
            <ReferencePicker
              open={entityPickerOpen}
              onOpenChange={setEntityPickerOpen}
              onSelect={handleEntitySelect}
              triggerElement={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-stone-300 hover:text-white"
                  data-testid="button-add-entity"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Add Entity
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={resetView}
              className="text-stone-300 hover:text-white"
              data-testid="button-reset-view"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset View
            </Button>
          </div>
          <div className="text-xs text-stone-500 bg-stone-900/90 backdrop-blur-sm rounded px-2 py-1 border border-stone-800">
            Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>
      )}
      
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerLeave={handleCanvasPointerUp}
        data-testid="canvas-container"
      >
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          <defs>
            <pattern
              id="grid"
              width={GRID_SIZE}
              height={GRID_SIZE}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                fill="none"
                stroke="rgb(68 64 60)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect
            x={-10000}
            y={-10000}
            width={20000}
            height={20000}
            fill="url(#grid)"
          />
          
          {canvasData.connections.map((connection) => (
            <g key={connection.id}>
              <path
                d={getConnectionPath(connection)}
                stroke={selectedConnectionId === connection.id ? "rgb(99 102 241)" : (connection.color || "rgb(120 113 108)")}
                strokeWidth={selectedConnectionId === connection.id ? 3 : 2}
                fill="none"
                className="cursor-pointer pointer-events-auto"
                onClick={() => {
                  setSelectedConnectionId(connection.id);
                  setSelectedNodeId(null);
                }}
                data-testid={`connection-${connection.id}`}
              />
              {connection.label && (
                <text
                  x={(canvasData.nodes.find((n) => n.id === connection.fromNodeId)?.x ?? 0) + (canvasData.nodes.find((n) => n.id === connection.fromNodeId)?.width ?? 0) + 20}
                  y={(canvasData.nodes.find((n) => n.id === connection.fromNodeId)?.y ?? 0) + (canvasData.nodes.find((n) => n.id === connection.fromNodeId)?.height ?? 0) / 2}
                  className="text-xs fill-stone-400"
                >
                  {connection.label}
                </text>
              )}
            </g>
          ))}
          
          {isConnecting && connectionStart && connectionEnd && (
            <path
              d={`M ${connectionStart.x} ${connectionStart.y} C ${(connectionStart.x + connectionEnd.x) / 2} ${connectionStart.y}, ${(connectionStart.x + connectionEnd.x) / 2} ${connectionEnd.y}, ${connectionEnd.x} ${connectionEnd.y}`}
              stroke="rgb(99 102 241)"
              strokeWidth={2}
              strokeDasharray="4"
              fill="none"
            />
          )}
        </svg>
        
        <div
          className="absolute"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          {canvasData.nodes.map(renderNode)}
        </div>
      </div>
      
      <Dialog open={noteSearchOpen} onOpenChange={setNoteSearchOpen}>
        <DialogContent className="bg-stone-950 border-stone-800">
          <DialogHeader>
            <DialogTitle className="text-stone-200">Link to Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
              <Input
                value={noteSearchQuery}
                onChange={(e) => setNoteSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className="pl-9 bg-stone-900 border-stone-700"
                data-testid="input-note-search"
              />
            </div>
            <ScrollArea className="h-60">
              {notesLoading ? (
                <div className="flex items-center justify-center py-8 text-stone-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Searching...
                </div>
              ) : noteSearchQuery.length === 0 ? (
                <div className="text-center py-8 text-stone-500 text-sm">
                  Type to search for notes
                </div>
              ) : searchedNotes.length === 0 ? (
                <div className="text-center py-8 text-stone-500 text-sm">
                  No notes found
                </div>
              ) : (
                <div className="space-y-1">
                  {searchedNotes.map((note) => (
                    <button
                      key={note.id}
                      onClick={() => handleNoteSelect(note)}
                      className="w-full flex items-center gap-3 p-2 rounded hover:bg-stone-800/50 transition-colors text-left"
                      data-testid={`note-result-${note.id}`}
                    >
                      <FileText className="h-4 w-4 text-amber-400" />
                      <span className="text-sm text-stone-200 truncate">{note.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
