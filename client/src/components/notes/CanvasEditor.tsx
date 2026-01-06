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
  X,
  ArrowLeft,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  onClose?: () => void;
  title?: string;
  onTitleChange?: (title: string) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const DEFAULT_ZOOM = 1;

export function CanvasEditor({ 
  canvasData, 
  onChange, 
  readOnly = false,
  onClose,
  title,
  onTitleChange,
}: CanvasEditorProps) {
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
  const [hoveredDropTarget, setHoveredDropTarget] = useState<string | null>(null);
  
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

  const findNodeAtPosition = useCallback((worldX: number, worldY: number) => {
    return canvasData.nodes.find((n) => 
      worldX >= n.x && worldX <= n.x + n.width &&
      worldY >= n.y && worldY <= n.y + n.height
    );
  }, [canvasData.nodes]);

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
        if (isConnecting) {
          setIsConnecting(false);
          setConnectionStart(null);
          setConnectionEnd(null);
          setHoveredDropTarget(null);
        } else if (selectedNodeId || selectedConnectionId) {
          setSelectedNodeId(null);
          setSelectedConnectionId(null);
        } else if (onClose) {
          onClose();
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, selectedConnectionId, deleteNode, deleteConnection, isConnecting, onClose]);

  // Track if user has manually interacted with the canvas (panned/zoomed)
  const userInteractedRef = useRef(false);

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
        userInteractedRef.current = true; // User zoomed manually
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
  
  // Helper to check if content is being clipped by current viewport (any direction)
  const isContentClipped = useCallback(() => {
    const container = containerRef.current;
    if (!container || canvasData.nodes.length === 0) return false;
    
    const rect = container.getBoundingClientRect();
    const safeMargin = 20; // Content must stay this far inside viewport to be considered "safe"
    
    // Calculate content bounds in screen coordinates
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    canvasData.nodes.forEach(node => {
      const screenX = node.x * zoomRef.current + panRef.current.x;
      const screenY = node.y * zoomRef.current + panRef.current.y;
      const screenRight = (node.x + node.width) * zoomRef.current + panRef.current.x;
      const screenBottom = (node.y + node.height) * zoomRef.current + panRef.current.y;
      minX = Math.min(minX, screenX);
      minY = Math.min(minY, screenY);
      maxX = Math.max(maxX, screenRight);
      maxY = Math.max(maxY, screenBottom);
    });
    
    // Content is at risk of clipping if it's within safeMargin of the viewport edges or beyond
    const leftClipped = minX < safeMargin;
    const rightClipped = maxX > rect.width - safeMargin;
    const topClipped = minY < safeMargin;
    const bottomClipped = maxY > rect.height - safeMargin;
    
    return leftClipped || rightClipped || topClipped || bottomClipped;
  }, [canvasData.nodes]);
  
  // Track nodes signature to detect canvas changes
  const nodesSignatureRef = useRef(JSON.stringify(canvasData.nodes.map(n => n.id)));
  
  // ResizeObserver to handle container resize - resets view when content would be clipped
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Reset view if: canvas is empty, user hasn't interacted, or content is clipped
        if (canvasData.nodes.length === 0 || !userInteractedRef.current || isContentClipped()) {
          resetView();
          userInteractedRef.current = false; // Reset after auto-fit so future resizes can trigger
        }
      }, 100);
    });

    resizeObserver.observe(container);
    return () => {
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [resetView, canvasData.nodes.length, isContentClipped]);
  
  // Reset user interaction flag when canvas data changes (new/different canvas)
  useEffect(() => {
    const newSignature = JSON.stringify(canvasData.nodes.map(n => n.id));
    if (newSignature !== nodesSignatureRef.current) {
      userInteractedRef.current = false;
      nodesSignatureRef.current = newSignature;
    }
  }, [canvasData.nodes]);

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
        userInteractedRef.current = true; // User pinch-zoomed manually
        
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
      
      const targetNode = findNodeAtPosition(world.x, world.y);
      if (targetNode && targetNode.id !== connectionStart.nodeId) {
        setHoveredDropTarget(targetNode.id);
      } else {
        setHoveredDropTarget(null);
      }
    }
    
    if (isPanning && panStartRef.current) {
      userInteractedRef.current = true; // User panned manually
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
      const targetNode = findNodeAtPosition(world.x, world.y);
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
    setHoveredDropTarget(null);
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
    
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handleNoteSelect = useCallback((note: Note) => {
    // Close dialog first, then add node after a microtask to avoid state conflicts
    setNoteSearchOpen(false);
    setNoteSearchQuery("");
    // Use requestAnimationFrame to ensure the dialog close doesn't interfere with addNode
    requestAnimationFrame(() => {
      addNode("note", {
        noteId: note.id,
        noteTitle: note.title,
        content: note.title,
      });
    });
  }, [addNode]);

  const handleEntitySelect = useCallback((entity: SearchableEntity) => {
    // Close picker first, then add node after a microtask to avoid state conflicts
    setEntityPickerOpen(false);
    // Use requestAnimationFrame to ensure the picker close doesn't interfere with addNode
    requestAnimationFrame(() => {
      addNode("entity", {
        entityType: entity.type,
        entityId: entity.id,
        entityName: entity.name,
        content: entity.name,
      });
    });
  }, [addNode]);

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
    const isDropTarget = hoveredDropTarget === node.id;
    
    return (
      <div
        key={node.id}
        className={`absolute bg-stone-800 rounded-lg border-2 transition-all cursor-move group ${
          isDropTarget 
            ? "border-green-400 shadow-lg shadow-green-400/30 scale-105" 
            : isSelected 
              ? "border-indigo-500 shadow-lg shadow-indigo-500/20" 
              : "border-stone-600 hover:border-stone-500"
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
              className={`absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full cursor-crosshair border-2 transition-all ${
                isConnecting 
                  ? "bg-indigo-400 border-indigo-300 opacity-100 scale-110" 
                  : "bg-indigo-500 border-indigo-400 opacity-80 hover:opacity-100 hover:scale-125 group-hover:opacity-100"
              } shadow-lg shadow-indigo-500/50`}
              onPointerDown={(e) => handleConnectionHandlePointerDown(e, node)}
              data-testid={`connection-handle-${node.id}`}
            >
              <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-30" />
            </div>
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
    <TooltipProvider>
      <div className="flex-1 flex flex-col overflow-hidden bg-stone-950 min-h-0">
        <div className="flex items-center justify-between p-2 border-b border-stone-700 bg-stone-900/50">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-stone-400 hover:text-white"
              data-testid="button-close-canvas"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {title !== undefined && (
              <Input
                value={title}
                onChange={(e) => onTitleChange?.(e.target.value)}
                placeholder="Canvas title"
                className="text-sm font-display bg-stone-800 border-stone-700 h-8 w-48"
                data-testid="input-canvas-title"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500">
              {Math.round(zoom * 100)}%
              {isConnecting && <span className="text-indigo-400 ml-2">• Connecting...</span>}
            </span>
            {!readOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={resetView}
                    className="h-8 w-8 text-stone-400 hover:text-white"
                    data-testid="button-reset-view"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Reset View</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {!readOnly && (
            <div className="flex flex-col gap-1 p-2 border-r border-stone-700 bg-stone-900/30">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => addNode("text", { content: "" })}
                    className="h-8 w-8 text-stone-400 hover:text-white"
                    data-testid="button-add-text"
                  >
                    <Type className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Add Text</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setNoteSearchOpen(true)}
                    className="h-8 w-8 text-stone-400 hover:text-white"
                    data-testid="button-add-note"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Add Note Link</p>
                </TooltipContent>
              </Tooltip>

              <ReferencePicker
                open={entityPickerOpen}
                onOpenChange={setEntityPickerOpen}
                onSelect={handleEntitySelect}
                triggerElement={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-stone-400 hover:text-white"
                        data-testid="button-add-entity"
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>Add Entity</p>
                    </TooltipContent>
                  </Tooltip>
                }
              />
            </div>
          )}

          <div className="flex-1 relative overflow-hidden min-h-[300px]">
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
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="8"
                    refX="9"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,8 L10,4 z" fill="rgb(120 113 108)" />
                  </marker>
                  <marker
                    id="arrowhead-selected"
                    markerWidth="10"
                    markerHeight="8"
                    refX="9"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,8 L10,4 z" fill="rgb(99 102 241)" />
                  </marker>
                  <marker
                    id="arrowhead-preview"
                    markerWidth="10"
                    markerHeight="8"
                    refX="9"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,8 L10,4 z" fill="rgb(129 140 248)" />
                  </marker>
                </defs>
                
                {canvasData.connections.map((connection) => (
                  <g key={connection.id}>
                    <path
                      d={getConnectionPath(connection)}
                      stroke="transparent"
                      strokeWidth={12}
                      fill="none"
                      className="cursor-pointer pointer-events-auto"
                      onClick={() => {
                        setSelectedConnectionId(connection.id);
                        setSelectedNodeId(null);
                      }}
                    />
                    <path
                      d={getConnectionPath(connection)}
                      stroke={selectedConnectionId === connection.id ? "rgb(99 102 241)" : (connection.color || "rgb(120 113 108)")}
                      strokeWidth={selectedConnectionId === connection.id ? 2.5 : 2}
                      fill="none"
                      markerEnd={selectedConnectionId === connection.id ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
                      className="pointer-events-none"
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
                    stroke="rgb(129 140 248)"
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                    fill="none"
                    markerEnd="url(#arrowhead-preview)"
                    className="pointer-events-none"
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
    </TooltipProvider>
  );
}
