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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
  title?: string;
  content?: string;
  noteId?: string;
  noteTitle?: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
}

export type ConnectionSide = "top" | "right" | "bottom" | "left";
export type ArrowType = "end" | "start" | "both" | "none";

export interface ConnectionWaypoint {
  id: string;
  x: number;
  y: number;
}

export interface CanvasConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromSide?: ConnectionSide;
  toSide?: ConnectionSide;
  arrowType?: ArrowType;
  waypoints?: ConnectionWaypoint[];
  label?: string;
  labelOffset?: { x: number; y: number };
  labelWidth?: number;
  labelHeight?: number;
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
  const [connectionStart, setConnectionStart] = useState<{ nodeId: string; side: ConnectionSide; x: number; y: number } | null>(null);
  const [connectionEnd, setConnectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [hoveredDropTarget, setHoveredDropTarget] = useState<string | null>(null);
  const [hoveredDropSide, setHoveredDropSide] = useState<ConnectionSide | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [showConnectionDelete, setShowConnectionDelete] = useState<string | null>(null);
  const [draggingWaypoint, setDraggingWaypoint] = useState<{ connectionId: string; waypointId: string } | null>(null);
  const [draggingLabel, setDraggingLabel] = useState<{ connectionId: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [resizingLabelId, setResizingLabelId] = useState<string | null>(null);
  const labelResizeStartRef = useRef<{ width: number; height: number; x: number; y: number } | null>(null);
  
  const dragStartRef = useRef<{ nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const resizeStartRef = useRef<{ nodeId: string; startX: number; startY: number; width: number; height: number } | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  
  const [noteSearchOpen, setNoteSearchOpen] = useState(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);

  // Cleanup long-press timer on unmount or selection change
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

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

  const addConnection = useCallback((fromNodeId: string, toNodeId: string, fromSide?: ConnectionSide, toSide?: ConnectionSide) => {
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
      fromSide: fromSide || "right",
      toSide: toSide || "left",
      arrowType: "end",
      waypoints: [],
    };
    onChange({
      ...canvasData,
      connections: [...canvasData.connections, newConnection],
    });
  }, [canvasData, onChange, readOnly]);

  const updateConnection = useCallback((connectionId: string, updates: Partial<CanvasConnection>) => {
    if (readOnly) return;
    const newConnections = canvasData.connections.map((c) =>
      c.id === connectionId ? { ...c, ...updates } : c
    );
    onChange({ ...canvasData, connections: newConnections });
  }, [canvasData, onChange, readOnly]);

  const addWaypoint = useCallback((connectionId: string, x: number, y: number) => {
    if (readOnly) return;
    const connection = canvasData.connections.find((c) => c.id === connectionId);
    if (!connection) return;
    
    const newWaypoint: ConnectionWaypoint = {
      id: crypto.randomUUID(),
      x,
      y,
    };
    const waypoints = [...(connection.waypoints || []), newWaypoint];
    updateConnection(connectionId, { waypoints });
  }, [canvasData.connections, updateConnection, readOnly]);

  const removeWaypoint = useCallback((connectionId: string, waypointId: string) => {
    if (readOnly) return;
    const connection = canvasData.connections.find((c) => c.id === connectionId);
    if (!connection) return;
    
    const waypoints = (connection.waypoints || []).filter((w) => w.id !== waypointId);
    updateConnection(connectionId, { waypoints });
  }, [canvasData.connections, updateConnection, readOnly]);

  const updateWaypoint = useCallback((connectionId: string, waypointId: string, x: number, y: number) => {
    if (readOnly) return;
    const connection = canvasData.connections.find((c) => c.id === connectionId);
    if (!connection) return;
    
    const waypoints = (connection.waypoints || []).map((w) =>
      w.id === waypointId ? { ...w, x, y } : w
    );
    updateConnection(connectionId, { waypoints });
  }, [canvasData.connections, updateConnection, readOnly]);

  // Global pointer move/up handlers for label drag/resize
  useEffect(() => {
    if (!draggingLabel && !resizingLabelId) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (draggingLabel) {
        const world = screenToWorld(e.clientX, e.clientY);
        const deltaX = world.x - draggingLabel.startX;
        const deltaY = world.y - draggingLabel.startY;
        
        updateConnection(draggingLabel.connectionId, {
          labelOffset: {
            x: draggingLabel.offsetX + deltaX,
            y: draggingLabel.offsetY + deltaY,
          },
        });
      }
      
      if (resizingLabelId && labelResizeStartRef.current) {
        const dx = (e.clientX - labelResizeStartRef.current.x) / zoomRef.current;
        const dy = (e.clientY - labelResizeStartRef.current.y) / zoomRef.current;
        updateConnection(resizingLabelId, {
          labelWidth: Math.max(80, labelResizeStartRef.current.width + dx),
          labelHeight: Math.max(30, labelResizeStartRef.current.height + dy),
        });
      }
    };

    const handleGlobalPointerUp = () => {
      setDraggingLabel(null);
      setResizingLabelId(null);
      labelResizeStartRef.current = null;
    };

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [draggingLabel, resizingLabelId, screenToWorld, updateConnection]);

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

  const getClosestSide = useCallback((node: CanvasNode, worldX: number, worldY: number): ConnectionSide => {
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    const relX = worldX - centerX;
    const relY = worldY - centerY;
    
    // Normalize to account for aspect ratio
    const normX = relX / (node.width / 2);
    const normY = relY / (node.height / 2);
    
    if (Math.abs(normX) > Math.abs(normY)) {
      return normX > 0 ? "right" : "left";
    } else {
      return normY > 0 ? "bottom" : "top";
    }
  }, []);

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    if (isConnecting && connectionStart) {
      const world = screenToWorld(e.clientX, e.clientY);
      setConnectionEnd(world);
      
      const targetNode = findNodeAtPosition(world.x, world.y);
      if (targetNode && targetNode.id !== connectionStart.nodeId) {
        setHoveredDropTarget(targetNode.id);
        setHoveredDropSide(getClosestSide(targetNode, world.x, world.y));
      } else {
        setHoveredDropTarget(null);
        setHoveredDropSide(null);
      }
    }
    
    if (isPanning && panStartRef.current && !draggingLabel && !resizingLabelId) {
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
    
    // Label drag/resize is handled by global pointer handlers in useEffect
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    if (isConnecting && connectionStart) {
      const world = screenToWorld(e.clientX, e.clientY);
      const targetNode = findNodeAtPosition(world.x, world.y);
      if (targetNode && targetNode.id !== connectionStart.nodeId) {
        const toSide = hoveredDropSide || "left";
        addConnection(connectionStart.nodeId, targetNode.id, connectionStart.side, toSide);
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
    setHoveredDropSide(null);
    setDraggingLabel(null);
    setResizingLabelId(null);
    labelResizeStartRef.current = null;
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

  const getNodeAnchor = useCallback((node: CanvasNode, side: ConnectionSide) => {
    switch (side) {
      case "top": return { x: node.x + node.width / 2, y: node.y };
      case "bottom": return { x: node.x + node.width / 2, y: node.y + node.height };
      case "left": return { x: node.x, y: node.y + node.height / 2 };
      case "right": return { x: node.x + node.width, y: node.y + node.height / 2 };
    }
  }, []);

  const handleConnectionHandlePointerDown = (e: React.PointerEvent, node: CanvasNode, side: ConnectionSide) => {
    e.stopPropagation();
    if (readOnly) return;
    
    const anchor = getNodeAnchor(node, side);
    setIsConnecting(true);
    setConnectionStart({
      nodeId: node.id,
      side,
      x: anchor.x,
      y: anchor.y,
    });
    setConnectionEnd({
      x: anchor.x,
      y: anchor.y,
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
    
    const fromSide = connection.fromSide || "right";
    const toSide = connection.toSide || "left";
    const fromAnchor = getNodeAnchor(fromNode, fromSide);
    const toAnchor = getNodeAnchor(toNode, toSide);
    
    const waypoints = connection.waypoints || [];
    const allPoints = [fromAnchor, ...waypoints, toAnchor];
    
    const getControlPoint = (point: {x: number, y: number}, side: ConnectionSide, offset: number) => {
      switch (side) {
        case "top": return { x: point.x, y: point.y - offset };
        case "bottom": return { x: point.x, y: point.y + offset };
        case "left": return { x: point.x - offset, y: point.y };
        case "right": return { x: point.x + offset, y: point.y };
      }
    };
    
    if (allPoints.length === 2) {
      const [start, end] = allPoints;
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      const controlOffset = Math.max(30, Math.min(80, dist / 3));
      
      const cp1 = getControlPoint(start, fromSide, controlOffset);
      const cp2 = getControlPoint(end, toSide, controlOffset);
      
      return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
    }
    
    // With waypoints: use smooth bezier curves through all points
    const start = allPoints[0];
    const end = allPoints[allPoints.length - 1];
    const startOffset = Math.min(40, Math.hypot(allPoints[1].x - start.x, allPoints[1].y - start.y) / 2);
    const endOffset = Math.min(40, Math.hypot(end.x - allPoints[allPoints.length - 2].x, end.y - allPoints[allPoints.length - 2].y) / 2);
    
    let path = `M ${start.x} ${start.y}`;
    
    // First segment from start to first waypoint with control point based on side
    const startCp = getControlPoint(start, fromSide, startOffset);
    const firstWp = allPoints[1];
    const midX1 = (start.x + firstWp.x) / 2;
    const midY1 = (start.y + firstWp.y) / 2;
    path += ` C ${startCp.x} ${startCp.y}, ${midX1} ${midY1}, ${firstWp.x} ${firstWp.y}`;
    
    // Middle waypoints with smooth curves
    for (let i = 2; i < allPoints.length - 1; i++) {
      const prev = allPoints[i - 1];
      const curr = allPoints[i];
      const cpX = (prev.x + curr.x) / 2;
      const cpY = (prev.y + curr.y) / 2;
      path += ` S ${cpX} ${cpY}, ${curr.x} ${curr.y}`;
    }
    
    // Last segment to end with control point based on side
    const lastWp = allPoints[allPoints.length - 2];
    const endCp = getControlPoint(end, toSide, endOffset);
    const midX2 = (lastWp.x + end.x) / 2;
    const midY2 = (lastWp.y + end.y) / 2;
    path += ` C ${midX2} ${midY2}, ${endCp.x} ${endCp.y}, ${end.x} ${end.y}`;
    
    return path;
  };

  const getConnectionMidpoint = (connection: CanvasConnection) => {
    const fromNode = canvasData.nodes.find((n) => n.id === connection.fromNodeId);
    const toNode = canvasData.nodes.find((n) => n.id === connection.toNodeId);
    if (!fromNode || !toNode) return { x: 0, y: 0 };
    
    const fromSide = connection.fromSide || "right";
    const toSide = connection.toSide || "left";
    const fromAnchor = getNodeAnchor(fromNode, fromSide);
    const toAnchor = getNodeAnchor(toNode, toSide);
    
    const waypoints = connection.waypoints || [];
    if (waypoints.length > 0) {
      const midIndex = Math.floor(waypoints.length / 2);
      return waypoints[midIndex];
    }
    
    return {
      x: (fromAnchor.x + toAnchor.x) / 2,
      y: (fromAnchor.y + toAnchor.y) / 2,
    };
  };

  const renderNode = (node: CanvasNode) => {
    const isSelected = selectedNodeId === node.id;
    const isDropTarget = hoveredDropTarget === node.id;
    
    const getDefaultTitle = () => {
      if (node.type === "note") return node.noteTitle || "Note";
      if (node.type === "entity") return node.entityName || "Entity";
      return "Text";
    };
    
    return (
      <div
        key={node.id}
        className={`absolute bg-stone-800 rounded-lg border-2 cursor-move group ${
          isDropTarget 
            ? "border-green-400 shadow-lg shadow-green-400/30" 
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
          <div className="flex items-center justify-between mb-1 gap-1">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {node.type === "text" && <Type className="h-3 w-3 text-stone-400 flex-shrink-0" />}
              {node.type === "note" && <FileText className="h-3 w-3 text-amber-400 flex-shrink-0" />}
              {node.type === "entity" && node.entityType && (
                <span className={`flex-shrink-0 ${getEntityColor(node.entityType)}`}>
                  {getEntityIcon(node.entityType)}
                </span>
              )}
              {!readOnly && isSelected ? (
                <Input
                  value={node.title ?? getDefaultTitle()}
                  onChange={(e) => updateNode(node.id, { title: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="h-5 text-xs bg-stone-900/50 border-stone-700 px-1 py-0 flex-1 min-w-0"
                  data-testid={`input-node-title-${node.id}`}
                />
              ) : (
                <span className="text-xs text-stone-400 truncate">{node.title || getDefaultTitle()}</span>
              )}
            </div>
            {!readOnly && isSelected && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-stone-400 hover:text-red-400 flex-shrink-0"
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
            {/* Connection handles on all 4 sides */}
            {(["top", "right", "bottom", "left"] as ConnectionSide[]).map((side) => {
              const isDropHovered = isDropTarget && hoveredDropSide === side;
              const positionClass = {
                top: "left-1/2 -translate-x-1/2 -top-2.5",
                right: "top-1/2 -translate-y-1/2 -right-2.5",
                bottom: "left-1/2 -translate-x-1/2 -bottom-2.5",
                left: "top-1/2 -translate-y-1/2 -left-2.5",
              }[side];
              
              return (
                <div
                  key={side}
                  className={`absolute ${positionClass} w-4 h-4 rounded-full cursor-crosshair border-2 transition-opacity ${
                    isDropHovered
                      ? "bg-green-400 border-green-300 opacity-100 scale-125"
                      : isConnecting 
                        ? "bg-indigo-400 border-indigo-300 opacity-100" 
                        : "bg-indigo-500 border-indigo-400 opacity-0 hover:opacity-100 group-hover:opacity-60"
                  } shadow-lg shadow-indigo-500/50`}
                  onPointerDown={(e) => handleConnectionHandlePointerDown(e, node, side)}
                  onPointerEnter={() => {
                    if (isConnecting && connectionStart?.nodeId !== node.id) {
                      setHoveredDropTarget(node.id);
                      setHoveredDropSide(side);
                    }
                  }}
                  onPointerLeave={() => {
                    if (hoveredDropSide === side) {
                      setHoveredDropSide(null);
                    }
                  }}
                  data-testid={`connection-handle-${side}-${node.id}`}
                />
              );
            })}
            <div
              className="absolute -right-1 -bottom-1 w-4 h-4 bg-stone-500 hover:bg-stone-400 rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
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

              <Tooltip>
                <ReferencePicker
                  open={entityPickerOpen}
                  onOpenChange={setEntityPickerOpen}
                  onSelect={handleEntitySelect}
                  triggerElement={
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
                  }
                />
                <TooltipContent side="right">
                  <p>Add Entity</p>
                </TooltipContent>
              </Tooltip>
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
                  {/* End arrow markers */}
                  <marker id="arrowhead" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,8 L10,4 z" fill="rgb(120 113 108)" />
                  </marker>
                  <marker id="arrowhead-selected" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,8 L10,4 z" fill="rgb(99 102 241)" />
                  </marker>
                  <marker id="arrowhead-preview" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,8 L10,4 z" fill="rgb(129 140 248)" />
                  </marker>
                  {/* Start arrow markers (reversed) */}
                  <marker id="arrowhead-start" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M10,0 L10,8 L0,4 z" fill="rgb(120 113 108)" />
                  </marker>
                  <marker id="arrowhead-start-selected" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M10,0 L10,8 L0,4 z" fill="rgb(99 102 241)" />
                  </marker>
                </defs>
                
                {canvasData.connections.map((connection) => {
                  const isSelected = selectedConnectionId === connection.id;
                  const arrowType = connection.arrowType || "end";
                  const strokeColor = isSelected ? "rgb(99 102 241)" : (connection.color || "rgb(120 113 108)");
                  const midpoint = getConnectionMidpoint(connection);
                  
                  const getMarkerEnd = () => {
                    if (arrowType === "none") return undefined;
                    if (arrowType === "start") return undefined;
                    return isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)";
                  };
                  
                  const getMarkerStart = () => {
                    if (arrowType === "none") return undefined;
                    if (arrowType === "end") return undefined;
                    return isSelected ? "url(#arrowhead-start-selected)" : "url(#arrowhead-start)";
                  };
                  
                  return (
                    <g key={connection.id}>
                      {/* Invisible hit area for clicking */}
                      <path
                        d={getConnectionPath(connection)}
                        stroke="transparent"
                        strokeWidth={16}
                        fill="none"
                        className="cursor-pointer pointer-events-auto"
                        onClick={(e) => {
                          setShowConnectionDelete(null);
                          setSelectedConnectionId(connection.id);
                          setSelectedNodeId(null);
                        }}
                        onDoubleClick={(e) => {
                          if (readOnly) return;
                          const world = screenToWorld(e.clientX, e.clientY);
                          addWaypoint(connection.id, world.x, world.y);
                        }}
                        onPointerDown={(e) => {
                          if (readOnly) return;
                          if (longPressTimer) clearTimeout(longPressTimer);
                          const timer = setTimeout(() => {
                            setShowConnectionDelete(connection.id);
                            setLongPressTimer(null);
                          }, 600);
                          setLongPressTimer(timer);
                        }}
                        onPointerUp={() => {
                          if (longPressTimer) {
                            clearTimeout(longPressTimer);
                            setLongPressTimer(null);
                          }
                        }}
                        onPointerLeave={() => {
                          if (longPressTimer) {
                            clearTimeout(longPressTimer);
                            setLongPressTimer(null);
                          }
                        }}
                      />
                      {/* Visible connection line */}
                      <path
                        d={getConnectionPath(connection)}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 2.5 : 2}
                        fill="none"
                        markerEnd={getMarkerEnd()}
                        markerStart={getMarkerStart()}
                        className="pointer-events-none"
                        data-testid={`connection-${connection.id}`}
                      />
                      
                      {/* Waypoints - only shown when selected */}
                      {isSelected && (connection.waypoints || []).map((waypoint) => (
                        <g key={waypoint.id}>
                          <circle
                            cx={waypoint.x}
                            cy={waypoint.y}
                            r={6}
                            fill="rgb(99 102 241)"
                            stroke="rgb(41 37 36)"
                            strokeWidth={2}
                            className="cursor-move pointer-events-auto"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (readOnly) return;
                              (e.target as SVGCircleElement).setPointerCapture(e.pointerId);
                              setDraggingWaypoint({ connectionId: connection.id, waypointId: waypoint.id });
                              if (longPressTimer) clearTimeout(longPressTimer);
                              const timer = setTimeout(() => {
                                removeWaypoint(connection.id, waypoint.id);
                                setDraggingWaypoint(null);
                                setLongPressTimer(null);
                              }, 800);
                              setLongPressTimer(timer);
                            }}
                            onPointerMove={(e) => {
                              if (draggingWaypoint?.waypointId === waypoint.id) {
                                if (longPressTimer) {
                                  clearTimeout(longPressTimer);
                                  setLongPressTimer(null);
                                }
                                const world = screenToWorld(e.clientX, e.clientY);
                                updateWaypoint(connection.id, waypoint.id, world.x, world.y);
                              }
                            }}
                            onPointerUp={(e) => {
                              try {
                                (e.target as SVGCircleElement).releasePointerCapture(e.pointerId);
                              } catch {}
                              if (longPressTimer) {
                                clearTimeout(longPressTimer);
                                setLongPressTimer(null);
                              }
                              setDraggingWaypoint(null);
                            }}
                            data-testid={`waypoint-${waypoint.id}`}
                          />
                        </g>
                      ))}
                      
                      {/* Delete button when long-pressed */}
                      {showConnectionDelete === connection.id && (
                        <g
                          className="pointer-events-auto cursor-pointer"
                          onClick={() => {
                            deleteConnection(connection.id);
                            setShowConnectionDelete(null);
                          }}
                        >
                          <circle cx={midpoint.x} cy={midpoint.y} r={12} fill="rgb(220 38 38)" />
                          <text x={midpoint.x} y={midpoint.y + 4} textAnchor="middle" fontSize={14} fill="white">×</text>
                        </g>
                      )}
                      
                      {/* Inline label note on arrow */}
                      {(() => {
                        const labelWidth = connection.labelWidth || 120;
                        const labelHeight = connection.labelHeight || 40;
                        // Default offset centers the label on the midpoint
                        const labelOffset = connection.labelOffset || { x: 0, y: 0 };
                        const labelX = midpoint.x + labelOffset.x - labelWidth / 2;
                        const labelY = midpoint.y + labelOffset.y - labelHeight / 2;
                        const isEditing = editingLabelId === connection.id;
                        const hasLabel = connection.label && connection.label.trim().length > 0;
                        
                        // Show label area when: has content, is selected, or is being edited
                        if (!hasLabel && !isSelected && !isEditing) return null;
                        
                        // Only show connecting line if label is offset from center
                        const showConnectingLine = Math.abs(labelOffset.x) > 5 || Math.abs(labelOffset.y) > 5;
                        
                        return (
                          <g>
                            {/* Line connecting label to arrow midpoint (only when offset) */}
                            {showConnectingLine && (
                              <line
                                x1={midpoint.x}
                                y1={midpoint.y}
                                x2={labelX + labelWidth / 2}
                                y2={labelY + labelHeight / 2}
                                stroke="rgb(87 83 78)"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                                className="pointer-events-none"
                              />
                            )}
                            
                            {/* Label container */}
                            <foreignObject
                              x={labelX}
                              y={labelY}
                              width={labelWidth}
                              height={labelHeight}
                              className="pointer-events-auto overflow-visible"
                            >
                              <div
                                className={`w-full h-full rounded border ${
                                  isSelected || isEditing
                                    ? "border-indigo-500 bg-stone-900/95"
                                    : "border-stone-700/50 bg-stone-900/80"
                                } flex flex-col`}
                                style={{ minWidth: labelWidth, minHeight: labelHeight }}
                                onPointerDown={(e) => {
                                  if (readOnly || isEditing) return;
                                  e.stopPropagation();
                                  e.preventDefault(); // Prevent text selection and scroll on mobile
                                  const world = screenToWorld(e.clientX, e.clientY);
                                  setDraggingLabel({
                                    connectionId: connection.id,
                                    startX: world.x,
                                    startY: world.y,
                                    offsetX: labelOffset.x,
                                    offsetY: labelOffset.y,
                                  });
                                  setSelectedConnectionId(connection.id);
                                  setSelectedNodeId(null);
                                }}
                                onDoubleClick={(e) => {
                                  if (readOnly) return;
                                  e.stopPropagation();
                                  setEditingLabelId(connection.id);
                                  setSelectedConnectionId(connection.id);
                                }}
                              >
                                {isEditing ? (
                                  <textarea
                                    autoFocus
                                    value={connection.label || ""}
                                    onChange={(e) => updateConnection(connection.id, { label: e.target.value })}
                                    onBlur={() => setEditingLabelId(null)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        setEditingLabelId(null);
                                      }
                                    }}
                                    className="w-full h-full bg-transparent text-stone-200 text-xs p-1.5 resize-none focus:outline-none"
                                    style={{ minHeight: labelHeight - 4 }}
                                    placeholder="Add label..."
                                    data-testid={`label-input-${connection.id}`}
                                  />
                                ) : (
                                  <div className="w-full h-full p-1.5 text-xs text-stone-300 whitespace-pre-wrap overflow-hidden cursor-move">
                                    {connection.label || (isSelected ? "Double-click to add label" : "")}
                                  </div>
                                )}
                              </div>
                            </foreignObject>
                            
                            {/* Resize handle when selected */}
                            {isSelected && !readOnly && (
                              <rect
                                x={labelX + labelWidth - 8}
                                y={labelY + labelHeight - 8}
                                width={10}
                                height={10}
                                fill="rgb(99 102 241)"
                                rx={2}
                                className="cursor-se-resize pointer-events-auto"
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault(); // Prevent text selection and scroll on mobile
                                  setResizingLabelId(connection.id);
                                  labelResizeStartRef.current = {
                                    width: labelWidth,
                                    height: labelHeight,
                                    x: e.clientX,
                                    y: e.clientY,
                                  };
                                }}
                              />
                            )}
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}
                
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
              
              {/* Connection settings panel */}
              {selectedConnectionId && !readOnly && (() => {
                const selectedConnection = canvasData.connections.find((c) => c.id === selectedConnectionId);
                if (!selectedConnection) return null;
                
                return (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-stone-900 border border-stone-700 rounded-lg p-3 shadow-xl z-10 min-w-[280px]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-stone-200">Arrow Settings</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-stone-400 hover:text-red-400"
                        onClick={() => {
                          deleteConnection(selectedConnectionId);
                        }}
                        data-testid="button-delete-connection"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-stone-400">Arrow Type</Label>
                        <Select
                          value={selectedConnection.arrowType || "end"}
                          onValueChange={(value: ArrowType) => updateConnection(selectedConnectionId, { arrowType: value })}
                        >
                          <SelectTrigger className="h-8 text-xs bg-stone-800 border-stone-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-stone-900 border-stone-700">
                            <SelectItem value="end" className="text-xs">Arrow at end →</SelectItem>
                            <SelectItem value="start" className="text-xs">Arrow at start ←</SelectItem>
                            <SelectItem value="both" className="text-xs">Both ends ↔</SelectItem>
                            <SelectItem value="none" className="text-xs">No arrow —</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <p className="text-[10px] text-stone-500 italic">
                        Double-click the label box on the arrow to edit text. Drag to reposition.
                      </p>
                      
                      {(selectedConnection.waypoints?.length || 0) > 0 && (
                        <div className="pt-2 border-t border-stone-700">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-stone-400">
                              {selectedConnection.waypoints?.length} waypoint(s)
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-stone-400 hover:text-stone-200"
                              onClick={() => updateConnection(selectedConnectionId, { waypoints: [] })}
                            >
                              Clear all
                            </Button>
                          </div>
                          <p className="text-[10px] text-stone-500 mt-1">
                            Drag waypoints to adjust. Hold to remove.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
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
