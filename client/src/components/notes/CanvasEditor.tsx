import React, { useState, useRef, useEffect, useCallback } from "react";
import { LoadingLogo } from "@/components/LoadingLogo";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Type, FileText, Sparkles, Package, Shield, Zap, Users, Link2, Trash2, Plus, RotateCcw, Search, GripHorizontal, X, ArrowLeft, Settings2, Image, Video, Link, Play, ExternalLink, Upload } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReferencePicker, getEntityIcon, getEntityColor } from "./ReferencePicker";

export interface CanvasNode {
  id: string;
  type: "text" | "note" | "entity" | "image" | "video" | "link";
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
  mediaUrl?: string;
  thumbnailUrl?: string;
  videoProvider?: "youtube" | "vimeo" | "direct";
  linkTitle?: string;
  linkDescription?: string;
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

export interface NoteSearchProvider {
  search: (query: string) => Promise<{ id: string; title: string }[]>;
  create?: (title: string) => Promise<{ id: string; title: string }>;
  onNodeClick?: (id: string) => void;
  label?: string;
}

export interface EntitySearchProvider {
  component: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (entity: SearchableEntity | { id: string; name: string; type: string }) => void;
    triggerElement?: React.ReactNode;
  }>;
}

interface CanvasEditorProps {
  canvasData: CanvasData;
  onChange: (data: CanvasData) => void;
  readOnly?: boolean;
  onClose?: () => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  noteSearchProvider?: NoteSearchProvider;
  entitySearchProvider?: EntitySearchProvider;
  hideNoteNodes?: boolean;
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
  noteSearchProvider,
  entitySearchProvider,
  hideNoteNodes = false,
}: CanvasEditorProps) {
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgGroupRef = useRef<SVGGElement>(null);
  const nodesContainerRef = useRef<HTMLDivElement>(null);
  
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(DEFAULT_ZOOM);
  const rafIdRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null); // Separate editing state
  const [showDeleteNodeId, setShowDeleteNodeId] = useState<string | null>(null); // Long-press delete
  const nodeLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const multiDragStartsRef = useRef<{ nodeId: string; nodeX: number; nodeY: number }[] | null>(null);
  
  const canvasHistoryRef = useRef<CanvasData[]>([]);
  const canvasHistoryIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);
  
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
  const labelDragStartRef = useRef<{ connectionId: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  
  const dragStartRef = useRef<{ nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const resizeStartRef = useRef<{ nodeId: string; startX: number; startY: number; width: number; height: number } | null>(null);
  // Multi-touch pinch zoom tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; midX: number; midY: number; zoom: number; panX: number; panY: number } | null>(null);
  // Connection drag tracking - only capture pointer after drag starts (not on tap)
  const connectionDragStartRef = useRef<{ x: number; y: number; pointerId: number; captured: boolean } | null>(null);
  
  const [noteSearchOpen, setNoteSearchOpen] = useState(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const [arrowSettingsOpen, setArrowSettingsOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageTab, setImageTab] = useState<"url" | "upload">("url");
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [connectionDropMenu, setConnectionDropMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    worldX: number;
    worldY: number;
    sourceNodeId: string;
    sourceSide: ConnectionSide;
  } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<{
    worldX: number;
    worldY: number;
    sourceNodeId: string;
    sourceSide: ConnectionSide;
  } | null>(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  const queryClient = useQueryClient();

  // Cleanup long-press timer on unmount or selection change
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    const history = canvasHistoryRef.current;
    const index = canvasHistoryIndexRef.current;
    canvasHistoryRef.current = [...history.slice(0, index + 1), canvasData];
    canvasHistoryIndexRef.current = canvasHistoryRef.current.length - 1;
    if (canvasHistoryRef.current.length > 50) {
      canvasHistoryRef.current = canvasHistoryRef.current.slice(-50);
      canvasHistoryIndexRef.current = canvasHistoryRef.current.length - 1;
    }
  }, [canvasData]);

  const { data: searchedNotes = [], isLoading: notesLoading } = useQuery({
    queryKey: noteSearchProvider
      ? ["/canvas/custom-note-search", noteSearchQuery]
      : ["/api/notes/search", noteSearchQuery],
    queryFn: () => noteSearchProvider
      ? noteSearchProvider.search(noteSearchQuery)
      : (noteSearchQuery.length > 0 ? api.searchNotes(noteSearchQuery) : api.getNotes()),
    enabled: noteSearchOpen,
    staleTime: 30000,
  });

  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = (screenX - rect.left - panRef.current.x) / zoomRef.current;
    const y = (screenY - rect.top - panRef.current.y) / zoomRef.current;
    return { x, y };
  }, []);

  // Apply transforms directly to DOM without triggering React re-renders
  const applyTransform = useCallback(() => {
    const transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
    if (svgGroupRef.current) {
      svgGroupRef.current.style.transform = transform;
    }
    if (nodesContainerRef.current) {
      nodesContainerRef.current.style.transform = transform;
    }
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

  const addNodeAtPosition = useCallback((type: CanvasNode["type"], worldX: number, worldY: number, extra: Partial<CanvasNode> = {}) => {
    if (readOnly) return null;
    const newNode: CanvasNode = {
      id: crypto.randomUUID(),
      type,
      x: worldX - 75,
      y: worldY - 50,
      width: 150,
      height: 100,
      ...extra,
    };
    onChange({
      ...canvasData,
      nodes: [...canvasData.nodes, newNode],
    });
    setSelectedNodeId(newNode.id);
    return newNode;
  }, [canvasData, onChange, readOnly]);

  const deleteNode = useCallback((nodeId: string) => {
    if (readOnly) return;
    const newNodes = canvasData.nodes.filter((n) => n.id !== nodeId);
    const newConnections = canvasData.connections.filter(
      (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
    );
    onChange({ nodes: newNodes, connections: newConnections });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [canvasData, onChange, selectedNodeId, readOnly]);

  const deleteNodes = useCallback((nodeIds: Set<string>) => {
    if (readOnly) return;
    const newNodes = canvasData.nodes.filter(n => !nodeIds.has(n.id));
    const newConnections = canvasData.connections.filter(
      c => !nodeIds.has(c.fromNodeId) && !nodeIds.has(c.toNodeId)
    );
    onChange({ nodes: newNodes, connections: newConnections });
    setSelectedNodeIds(new Set());
    setSelectedNodeId(null);
  }, [canvasData, onChange, readOnly]);

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
      const isInput = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
      
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (isInput) return;
        e.preventDefault();
        if (canvasHistoryIndexRef.current > 0) {
          canvasHistoryIndexRef.current--;
          isUndoRedoRef.current = true;
          onChange(canvasHistoryRef.current[canvasHistoryIndexRef.current]);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        if (isInput) return;
        e.preventDefault();
        if (canvasHistoryIndexRef.current < canvasHistoryRef.current.length - 1) {
          canvasHistoryIndexRef.current++;
          isUndoRedoRef.current = true;
          onChange(canvasHistoryRef.current[canvasHistoryIndexRef.current]);
        }
        return;
      }
      
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isInput) return;
        if (selectedNodeIds.size > 0) {
          deleteNodes(selectedNodeIds);
        } else if (selectedNodeId) {
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
        } else if (selectedNodeIds.size > 0) {
          setSelectedNodeIds(new Set());
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
  }, [selectedNodeId, selectedNodeIds, selectedConnectionId, deleteNode, deleteNodes, deleteConnection, isConnecting, onClose, onChange]);

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
        if (resizeStartRef.current || dragStartRef.current || labelResizeStartRef.current) return;
        if (canvasData.nodes.length === 0 || !userInteractedRef.current || isContentClipped()) {
          resetView();
          userInteractedRef.current = false;
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
      if (!resizeStartRef.current && !dragStartRef.current) {
        userInteractedRef.current = false;
      }
      nodesSignatureRef.current = newSignature;
    }
  }, [canvasData.nodes]);

  // Unified multi-touch pinch zoom using pointer events
  const handlePinchUpdate = useCallback(() => {
    const pointers = Array.from(activePointersRef.current.values());
    if (pointers.length !== 2) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const [p1, p2] = pointers;
    
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const midX = (p1.x + p2.x) / 2 - rect.left;
    const midY = (p1.y + p2.y) / 2 - rect.top;
    
    if (!pinchStartRef.current) {
      // Initialize pinch gesture
      pinchStartRef.current = {
        distance,
        midX,
        midY,
        zoom: zoomRef.current,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      return;
    }
    
    userInteractedRef.current = true;
    
    // Calculate scale from initial pinch distance
    const scale = distance / pinchStartRef.current.distance;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartRef.current.zoom * scale));
    
    // Calculate world point at initial pinch center
    const worldX = (pinchStartRef.current.midX - pinchStartRef.current.panX) / pinchStartRef.current.zoom;
    const worldY = (pinchStartRef.current.midY - pinchStartRef.current.panY) / pinchStartRef.current.zoom;
    
    // Pan to keep world point under current midpoint, plus any midpoint movement
    const midDeltaX = midX - pinchStartRef.current.midX;
    const midDeltaY = midY - pinchStartRef.current.midY;
    
    const newPan = {
      x: midX - worldX * newZoom + midDeltaX,
      y: midY - worldY * newZoom + midDeltaY,
    };
    
    panRef.current = newPan;
    zoomRef.current = newZoom;
    // Apply transform directly for smooth pinch zoom
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(applyTransform);
  }, [applyTransform]);

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    // Allow touch events and left mouse clicks
    if (e.pointerType === "mouse" && e.button !== 0) return;
    
    userInteractedRef.current = true; // Mark as user interaction to prevent view reset
    
    // Track this pointer for multi-touch
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    // If 2+ fingers, handle as pinch gesture
    if (activePointersRef.current.size >= 2) {
      setIsPanning(false);
      panStartRef.current = null;
      handlePinchUpdate();
      return;
    }
    
    // Cancel any in-progress connection on canvas tap
    if (isConnecting) {
      setIsConnecting(false);
      setConnectionStart(null);
      setConnectionEnd(null);
      setHoveredDropTarget(null);
      setHoveredDropSide(null);
    }
    
    setSelectedConnectionId(null);
    setEditingNodeId(null);
    setShowDeleteNodeId(null);
    
    if (e.shiftKey && e.pointerType === "mouse") {
      e.preventDefault();
      const world = screenToWorld(e.clientX, e.clientY);
      setIsBoxSelecting(true);
      setSelectionBox({ startX: world.x, startY: world.y, endX: world.x, endY: world.y });
      setSelectedNodeId(null);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    
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
    // Update tracked pointer position
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    
    // Clear long-press timer when user starts moving (prevents delete button during drag)
    if (nodeLongPressTimerRef.current && isDragging) {
      clearTimeout(nodeLongPressTimerRef.current);
      nodeLongPressTimerRef.current = null;
    }
    
    // Handle pinch gesture when 2 fingers are active
    if (activePointersRef.current.size >= 2) {
      handlePinchUpdate();
      return; // Don't process other gestures during pinch
    }
    
    if (isConnecting && connectionStart) {
      const world = screenToWorld(e.clientX, e.clientY);
      setConnectionEnd(world);
      
      // Capture pointer for drag-to-connect after user starts dragging (5px threshold)
      if (connectionDragStartRef.current && !connectionDragStartRef.current.captured) {
        const dx = e.clientX - connectionDragStartRef.current.x;
        const dy = e.clientY - connectionDragStartRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          connectionDragStartRef.current.captured = true;
          if (containerRef.current) {
            containerRef.current.setPointerCapture(connectionDragStartRef.current.pointerId);
          }
        }
      }
      
      const targetNode = findNodeAtPosition(world.x, world.y);
      if (targetNode && targetNode.id !== connectionStart.nodeId) {
        setHoveredDropTarget(targetNode.id);
        setHoveredDropSide(getClosestSide(targetNode, world.x, world.y));
      } else {
        setHoveredDropTarget(null);
        setHoveredDropSide(null);
      }
    }
    
    if (isBoxSelecting && selectionBox) {
      const world = screenToWorld(e.clientX, e.clientY);
      setSelectionBox({ ...selectionBox, endX: world.x, endY: world.y });
      return;
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
      // Apply transform directly without React state update for performance
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(applyTransform);
    }
    
    if (isDragging && dragStartRef.current) {
      const world = screenToWorld(e.clientX, e.clientY);
      const deltaX = world.x - dragStartRef.current.startX;
      const deltaY = world.y - dragStartRef.current.startY;
      
      if (multiDragStartsRef.current && multiDragStartsRef.current.length > 0) {
        const newNodes = canvasData.nodes.map(n => {
          const dragInfo = multiDragStartsRef.current!.find(d => d.nodeId === n.id);
          if (dragInfo) {
            return { ...n, x: dragInfo.nodeX + deltaX, y: dragInfo.nodeY + deltaY };
          }
          return n;
        });
        onChange({ ...canvasData, nodes: newNodes });
      } else {
        updateNode(dragStartRef.current.nodeId, {
          x: dragStartRef.current.nodeX + deltaX,
          y: dragStartRef.current.nodeY + deltaY,
        });
      }
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
    // Remove this pointer from tracking
    activePointersRef.current.delete(e.pointerId);
    
    // Reset pinch state when fingers are released
    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
    
    // If still have one finger, don't reset pan state (could continue panning)
    if (activePointersRef.current.size >= 1) {
      return;
    }
    
    if (isBoxSelecting && selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX);
      const maxX = Math.max(selectionBox.startX, selectionBox.endX);
      const minY = Math.min(selectionBox.startY, selectionBox.endY);
      const maxY = Math.max(selectionBox.startY, selectionBox.endY);
      
      const intersecting = new Set<string>();
      canvasData.nodes.forEach(node => {
        const nodeRight = node.x + node.width;
        const nodeBottom = node.y + node.height;
        if (node.x < maxX && nodeRight > minX && node.y < maxY && nodeBottom > minY) {
          intersecting.add(node.id);
        }
      });
      
      setSelectedNodeIds(intersecting);
      setIsBoxSelecting(false);
      setSelectionBox(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      return;
    }
    
    // For drag-to-connect: complete connection if we have a hovered target (green glow)
    // This is the most reliable check - if they see green, the connection should work
    if (isConnecting && connectionStart && hoveredDropTarget) {
      const targetNode = canvasData.nodes.find(n => n.id === hoveredDropTarget);
      if (targetNode && hoveredDropTarget !== connectionStart.nodeId) {
        const toSide = hoveredDropSide || getClosestSide(targetNode, screenToWorld(e.clientX, e.clientY).x, screenToWorld(e.clientX, e.clientY).y);
        addConnection(connectionStart.nodeId, hoveredDropTarget, connectionStart.side, toSide);
      }
      // Reset connection state after drag
      setIsConnecting(false);
      setConnectionStart(null);
      setConnectionEnd(null);
      setHoveredDropTarget(null);
      setHoveredDropSide(null);
      connectionDragStartRef.current = null;
    } else if (isConnecting && connectionStart && connectionDragStartRef.current?.captured) {
      // Fallback: if dragging but no hover target, try hit-testing at release position
      const world = screenToWorld(e.clientX, e.clientY);
      const targetNode = findNodeAtPosition(world.x, world.y);
      if (targetNode && targetNode.id !== connectionStart.nodeId) {
        const toSide = getClosestSide(targetNode, world.x, world.y);
        addConnection(connectionStart.nodeId, targetNode.id, connectionStart.side, toSide);
        // Reset after successful connection
        setIsConnecting(false);
        setConnectionStart(null);
        setConnectionEnd(null);
        setHoveredDropTarget(null);
        setHoveredDropSide(null);
        connectionDragStartRef.current = null;
      } else if (!targetNode && !readOnly) {
        // Dropped on empty space - show context menu to create a new node
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setConnectionDropMenu({
            visible: true,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            worldX: world.x,
            worldY: world.y,
            sourceNodeId: connectionStart.nodeId,
            sourceSide: connectionStart.side,
          });
        }
        // Reset connection state but keep menu visible
        setIsConnecting(false);
        setConnectionStart(null);
        setConnectionEnd(null);
        setHoveredDropTarget(null);
        setHoveredDropSide(null);
        connectionDragStartRef.current = null;
      } else {
        // Reset after failed drag attempt
        setIsConnecting(false);
        setConnectionStart(null);
        setConnectionEnd(null);
        setHoveredDropTarget(null);
        setHoveredDropSide(null);
        connectionDragStartRef.current = null;
      }
    }
    // Don't reset for tap-to-connect (no drag, no hover)
    
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    
    // Clear connection drag tracking
    connectionDragStartRef.current = null;
    
    // Clear long-press timer
    if (nodeLongPressTimerRef.current) {
      clearTimeout(nodeLongPressTimerRef.current);
      nodeLongPressTimerRef.current = null;
    }
    
    // Sync React state with refs at end of gesture (for re-renders that need the values)
    if (isPanning) {
      setPan({ ...panRef.current });
      setZoom(zoomRef.current);
    }
    
    setIsPanning(false);
    setIsDragging(false);
    setIsResizing(false);
    // Don't clear connection state here - it persists for tap-to-connect
    setDraggingLabel(null);
    setResizingLabelId(null);
    labelResizeStartRef.current = null;
    panStartRef.current = null;
    dragStartRef.current = null;
    resizeStartRef.current = null;
    multiDragStartsRef.current = null;
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (readOnly) return;
    // Allow touch events (button is 0 for touch) and left mouse clicks
    if (e.pointerType === "mouse" && e.button !== 0) return;
    
    userInteractedRef.current = true; // Mark as user interaction to prevent view reset
    
    // Clear any existing long-press timer
    if (nodeLongPressTimerRef.current) {
      clearTimeout(nodeLongPressTimerRef.current);
      nodeLongPressTimerRef.current = null;
    }
    
    // Start long-press timer for delete button (700ms)
    nodeLongPressTimerRef.current = setTimeout(() => {
      setShowDeleteNodeId(node.id);
    }, 700);
    
    setSelectedConnectionId(null);
    if (editingNodeId !== node.id) setEditingNodeId(null);
    setShowDeleteNodeId(null);
    
    const isMultiSelected = selectedNodeIds.has(node.id);
    
    if (isMultiSelected) {
      setIsDragging(true);
      const world = screenToWorld(e.clientX, e.clientY);
      dragStartRef.current = {
        nodeId: node.id,
        startX: world.x,
        startY: world.y,
        nodeX: node.x,
        nodeY: node.y,
      };
      multiDragStartsRef.current = canvasData.nodes
        .filter(n => selectedNodeIds.has(n.id))
        .map(n => ({ nodeId: n.id, nodeX: n.x, nodeY: n.y }));
    } else {
      setSelectedNodeId(node.id);
      setSelectedNodeIds(new Set());
      
      setIsDragging(true);
      const world = screenToWorld(e.clientX, e.clientY);
      dragStartRef.current = {
        nodeId: node.id,
        startX: world.x,
        startY: world.y,
        nodeX: node.x,
        nodeY: node.y,
      };
      multiDragStartsRef.current = null;
    }
    
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (e: React.PointerEvent, node: CanvasNode) => {
    e.stopPropagation();
    if (readOnly) return;
    // Allow touch events and left mouse clicks
    if (e.pointerType === "mouse" && e.button !== 0) return;
    
    userInteractedRef.current = true; // Mark as user interaction to prevent view reset
    
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
    e.preventDefault();
    if (readOnly) return;
    
    userInteractedRef.current = true; // Mark as user interaction to prevent view reset
    
    // Start a new connection from this handle (drag-only, no tap-to-connect)
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
    setSelectedNodeId(node.id);
    
    // Track this pointer for potential drag-to-connect
    // Don't capture immediately - capture only when drag starts (in pointermove)
    // This allows tap-to-connect to work (second tap goes to target node, not canvas)
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    connectionDragStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, captured: false };
  };

  const handleNoteSelect = useCallback((note: Note) => {
    // Close dialog first, then add node after a microtask to avoid state conflicts
    setNoteSearchOpen(false);
    setNoteSearchQuery("");
    
    const pending = pendingConnection;
    setPendingConnection(null);
    
    // Use requestAnimationFrame to ensure the dialog close doesn't interfere with addNode
    requestAnimationFrame(() => {
      if (pending) {
        // Create node at pending position and connect
        const newNode = addNodeAtPosition("note", pending.worldX, pending.worldY, {
          noteId: note.id,
          noteTitle: note.title,
          content: note.title,
        });
        if (newNode) {
          const toSide: ConnectionSide = pending.sourceSide === "right" ? "left" : 
                                         pending.sourceSide === "left" ? "right" :
                                         pending.sourceSide === "top" ? "bottom" : "top";
          addConnection(pending.sourceNodeId, newNode.id, pending.sourceSide, toSide);
        }
      } else {
        addNode("note", {
          noteId: note.id,
          noteTitle: note.title,
          content: note.title,
        });
      }
    });
  }, [addNode, addNodeAtPosition, addConnection, pendingConnection]);

  const handleCreateNoteFromSearch = useCallback(async (title: string) => {
    if (!title.trim() || isCreatingNote) return;
    
    const pending = pendingConnection;
    setPendingConnection(null);
    
    setIsCreatingNote(true);
    try {
      let newNote: { id: string; title: string };
      if (noteSearchProvider?.create) {
        newNote = await noteSearchProvider.create(title.trim());
        queryClient.invalidateQueries({ queryKey: ["/canvas/custom-note-search"] });
      } else {
        newNote = await api.createNote({
          title: title.trim(),
          content: "",
          type: "document",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/notes/search"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      }
      
      setNoteSearchOpen(false);
      setNoteSearchQuery("");
      
      requestAnimationFrame(() => {
        if (pending) {
          // Create node at pending position and connect
          const createdNode = addNodeAtPosition("note", pending.worldX, pending.worldY, {
            noteId: newNote.id,
            noteTitle: newNote.title,
            content: newNote.title,
          });
          if (createdNode) {
            const toSide: ConnectionSide = pending.sourceSide === "right" ? "left" : 
                                           pending.sourceSide === "left" ? "right" :
                                           pending.sourceSide === "top" ? "bottom" : "top";
            addConnection(pending.sourceNodeId, createdNode.id, pending.sourceSide, toSide);
          }
        } else {
          addNode("note", {
            noteId: newNote.id,
            noteTitle: newNote.title,
            content: newNote.title,
          });
        }
      });
    } catch (error) {
      console.error("Failed to create note:", error);
    } finally {
      setIsCreatingNote(false);
    }
  }, [addNode, addNodeAtPosition, addConnection, isCreatingNote, pendingConnection, queryClient]);

  const handleConnectionDropMenuSelect = useCallback((nodeType: "text" | "note" | "entity") => {
    if (!connectionDropMenu) return;
    
    const { worldX, worldY, sourceNodeId, sourceSide } = connectionDropMenu;
    
    if (nodeType === "note") {
      setPendingConnection({ worldX, worldY, sourceNodeId, sourceSide });
      setConnectionDropMenu(null);
      setNoteSearchOpen(true);
      return;
    }
    
    if (nodeType === "entity") {
      setPendingConnection({ worldX, worldY, sourceNodeId, sourceSide });
      setConnectionDropMenu(null);
      setEntityPickerOpen(true);
      return;
    }
    
    const newNode = addNodeAtPosition("text", worldX, worldY, {
      title: "Text",
      content: "",
    });
    
    if (newNode) {
      const toSide: ConnectionSide = sourceSide === "right" ? "left" : 
                                     sourceSide === "left" ? "right" :
                                     sourceSide === "top" ? "bottom" : "top";
      addConnection(sourceNodeId, newNode.id, sourceSide, toSide);
      setEditingNodeId(newNode.id);
    }
    
    setConnectionDropMenu(null);
  }, [connectionDropMenu, addNodeAtPosition, addConnection]);

  const handleImageFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        addNode("image", {
          mediaUrl: dataUrl,
          title: file.name.replace(/\.[^/.]+$/, ""),
          width: 200,
          height: 150,
        });
        setImageDialogOpen(false);
        setImageUrl("");
        setImageTab("url");
      }
    };
    reader.readAsDataURL(file);
    
    if (e.target) {
      e.target.value = "";
    }
  }, [addNode]);

  const handleEntitySelect = useCallback((entity: SearchableEntity) => {
    // Close picker first, then add node after a microtask to avoid state conflicts
    setEntityPickerOpen(false);
    
    const pending = pendingConnection;
    setPendingConnection(null);
    
    // Use requestAnimationFrame to ensure the picker close doesn't interfere with addNode
    requestAnimationFrame(() => {
      if (pending) {
        // Create node at pending position and connect
        const newNode = addNodeAtPosition("entity", pending.worldX, pending.worldY, {
          entityType: entity.type,
          entityId: entity.id,
          entityName: entity.name,
          content: entity.name,
        });
        if (newNode) {
          const toSide: ConnectionSide = pending.sourceSide === "right" ? "left" : 
                                         pending.sourceSide === "left" ? "right" :
                                         pending.sourceSide === "top" ? "bottom" : "top";
          addConnection(pending.sourceNodeId, newNode.id, pending.sourceSide, toSide);
        }
      } else {
        addNode("entity", {
          entityType: entity.type,
          entityId: entity.id,
          entityName: entity.name,
          content: entity.name,
        });
      }
    });
  }, [addNode, addNodeAtPosition, addConnection, pendingConnection]);

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
    const isMultiSelected = selectedNodeIds.has(node.id);
    const isDropTarget = hoveredDropTarget === node.id;
    
    const getDefaultTitle = () => {
      if (node.type === "note") return node.noteTitle || "Note";
      if (node.type === "entity") return node.entityName || "Entity";
      if (node.type === "image") return node.title || "Image";
      if (node.type === "video") return node.title || "Video";
      if (node.type === "link") return node.linkTitle || "Link";
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
              : isMultiSelected
                ? "border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/40"
                : "border-stone-600 hover:border-stone-500"
        }`}
        style={{
          left: node.x,
          top: node.y,
          width: node.width,
          height: node.height,
        }}
        onPointerDown={(e) => handleNodePointerDown(e, node)}
        onPointerUp={(e) => {
          // Complete connection when released on the node body
          if (isConnecting && connectionStart && connectionStart.nodeId !== node.id) {
            e.stopPropagation();
            const world = screenToWorld(e.clientX, e.clientY);
            const toSide = getClosestSide(node, world.x, world.y);
            addConnection(connectionStart.nodeId, node.id, connectionStart.side, toSide);
            setIsConnecting(false);
            setConnectionStart(null);
            setConnectionEnd(null);
            setHoveredDropTarget(null);
            setHoveredDropSide(null);
            connectionDragStartRef.current = null;
            activePointersRef.current.delete(e.pointerId);
          }
        }}
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
              {node.type === "image" && <Image className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
              {node.type === "video" && <Video className="h-3 w-3 text-rose-400 flex-shrink-0" />}
              {node.type === "link" && <Link className="h-3 w-3 text-blue-400 flex-shrink-0" />}
              {!readOnly && editingNodeId === node.id ? (
                <Input
                  value={node.title ?? getDefaultTitle()}
                  onChange={(e) => updateNode(node.id, { title: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    // Only exit editing if focus moves outside the node
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    const nodeElement = e.currentTarget.closest('[data-testid^="canvas-node-"]');
                    if (!relatedTarget || !nodeElement?.contains(relatedTarget)) {
                      setEditingNodeId(null);
                    }
                  }}
                  className="h-5 text-xs bg-stone-900/50 border-stone-700 px-1 py-0 flex-1 min-w-0"
                  data-testid={`input-node-title-${node.id}`}
                />
              ) : (
                <span 
                  className="text-xs text-stone-400 truncate cursor-text"
                  onPointerDown={(e) => {
                    // Prevent parent drag from intercepting the click
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    // Click on title enters edit mode directly
                    if (readOnly) return;
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                    setEditingNodeId(node.id);
                  }}
                >{node.title || getDefaultTitle()}</span>
              )}
            </div>
            {!readOnly && (selectedNodeId === node.id || isMultiSelected || showDeleteNodeId === node.id) && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-5 w-5 text-red-400 hover:text-red-300 hover:bg-red-900/30 flex-shrink-0 ${showDeleteNodeId === node.id ? 'animate-pulse' : ''}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNode(node.id);
                  setShowDeleteNodeId(null);
                }}
                data-testid={`delete-node-${node.id}`}
                title="Delete node"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          <div className="flex-1 overflow-hidden border-t border-stone-700/50 pt-1 mt-1">
            {node.type === "text" && !readOnly && editingNodeId === node.id ? (
              <Textarea
                value={node.content || ""}
                onChange={(e) => updateNode(node.id, { content: e.target.value })}
                className="h-full resize-none bg-stone-900/50 border-stone-700 text-sm"
                placeholder="Enter text..."
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  // Only exit editing if focus moves outside the node
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  const nodeElement = e.currentTarget.closest('[data-testid^="canvas-node-"]');
                  if (!relatedTarget || !nodeElement?.contains(relatedTarget)) {
                    setEditingNodeId(null);
                  }
                }}
                autoFocus
                data-testid={`textarea-node-${node.id}`}
              />
            ) : node.type === "text" ? (
              <div 
                className="text-sm text-stone-300 whitespace-pre-wrap cursor-text h-full"
                onPointerDown={(e) => {
                  // Stop propagation so parent doesn't start drag
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  // Click on text content enters edit mode directly
                  if (readOnly) return;
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                  setEditingNodeId(node.id);
                }}
              >{node.content || "Click to edit"}</div>
            ) : node.type === "note" ? (
              <button
                className="flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm w-full text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  if (node.noteId) {
                    if (noteSearchProvider?.onNodeClick) {
                      noteSearchProvider.onNodeClick(node.noteId);
                    } else {
                      setLocation(`/notes/${node.noteId}`);
                    }
                  }
                }}
                data-testid={`note-link-${node.id}`}
              >
                <Link2 className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{node.noteTitle || (noteSearchProvider?.label ? `Linked ${noteSearchProvider.label}` : "Linked Note")}</span>
              </button>
            ) : node.type === "entity" ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${getEntityColor(node.entityType || "")}`}>
                  {node.entityType}
                </Badge>
                <span className="text-sm text-stone-300 truncate">{node.entityName}</span>
              </div>
            ) : node.type === "image" ? (
              <div className="h-full w-full flex items-center justify-center overflow-hidden">
                {node.mediaUrl ? (
                  <img 
                    src={node.mediaUrl} 
                    alt={node.title || "Image"} 
                    className="max-w-full max-h-full object-contain rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpath d='m21 15-5-5L5 21'/%3E%3C/svg%3E";
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-stone-500 gap-2">
                    <Image className="h-8 w-8" />
                    <span className="text-xs">No image URL</span>
                  </div>
                )}
              </div>
            ) : node.type === "video" ? (
              <div className="h-full w-full flex items-center justify-center overflow-hidden relative">
                {node.mediaUrl ? (
                  (() => {
                    const getVideoEmbedUrl = (url: string) => {
                      const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                      if (youtubeMatch) {
                        return { 
                          embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
                          thumbnailUrl: `https://img.youtube.com/vi/${youtubeMatch[1]}/hqdefault.jpg`,
                          provider: "youtube" as const
                        };
                      }
                      const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
                      if (vimeoMatch) {
                        return {
                          embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
                          thumbnailUrl: null,
                          provider: "vimeo" as const
                        };
                      }
                      return { embedUrl: url, thumbnailUrl: null, provider: "direct" as const };
                    };
                    const videoInfo = getVideoEmbedUrl(node.mediaUrl);
                    
                    if (videoInfo.provider === "youtube" && videoInfo.thumbnailUrl) {
                      return (
                        <a 
                          href={node.mediaUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="relative w-full h-full flex items-center justify-center group/video"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <img 
                            src={videoInfo.thumbnailUrl} 
                            alt="Video thumbnail"
                            className="max-w-full max-h-full object-contain rounded"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/video:bg-black/50 transition-colors">
                            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                              <Play className="h-6 w-6 text-white ml-1" fill="white" />
                            </div>
                          </div>
                        </a>
                      );
                    }
                    
                    return (
                      <a 
                        href={node.mediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center text-rose-400 hover:text-rose-300 gap-2 w-full h-full"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="w-12 h-12 rounded-full bg-rose-600/20 flex items-center justify-center">
                          <Play className="h-6 w-6 ml-1" />
                        </div>
                        <span className="text-xs text-center px-2 truncate max-w-full">
                          {videoInfo.provider === "vimeo" ? "Vimeo Video" : "Watch Video"}
                        </span>
                      </a>
                    );
                  })()
                ) : (
                  <div className="flex flex-col items-center justify-center text-stone-500 gap-2">
                    <Video className="h-8 w-8" />
                    <span className="text-xs">No video URL</span>
                  </div>
                )}
              </div>
            ) : node.type === "link" ? (
              <div className="h-full w-full">
                {node.mediaUrl ? (
                  <a 
                    href={node.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col gap-1 text-blue-400 hover:text-blue-300 h-full"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {node.linkTitle || new URL(node.mediaUrl).hostname}
                      </span>
                    </div>
                    {node.linkDescription && (
                      <p className="text-xs text-stone-400 line-clamp-2">{node.linkDescription}</p>
                    )}
                    <span className="text-xs text-stone-500 truncate mt-auto">{node.mediaUrl}</span>
                  </a>
                ) : (
                  <div className="flex flex-col items-center justify-center text-stone-500 gap-2 h-full">
                    <Link className="h-8 w-8" />
                    <span className="text-xs">No link URL</span>
                  </div>
                )}
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
                  className={`absolute ${positionClass} w-5 h-5 rounded-full cursor-crosshair border-2 transition-all ${
                    isDropHovered
                      ? "bg-green-400 border-green-300 opacity-100 scale-125"
                      : isConnecting 
                        ? "bg-indigo-400 border-indigo-300 opacity-100" 
                        : isSelected
                          ? "bg-indigo-500 border-indigo-400 opacity-100"
                          : "bg-indigo-500 border-indigo-400 opacity-0 hover:opacity-100 group-hover:opacity-60"
                  } shadow-lg shadow-indigo-500/50`}
                  onPointerDown={(e) => handleConnectionHandlePointerDown(e, node, side)}
                  onPointerUp={(e) => {
                    // Complete connection when released on a handle
                    if (isConnecting && connectionStart && connectionStart.nodeId !== node.id) {
                      e.stopPropagation();
                      addConnection(connectionStart.nodeId, node.id, connectionStart.side, side);
                      setIsConnecting(false);
                      setConnectionStart(null);
                      setConnectionEnd(null);
                      setHoveredDropTarget(null);
                      setHoveredDropSide(null);
                      connectionDragStartRef.current = null;
                      activePointersRef.current.delete(e.pointerId);
                    }
                  }}
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

              {!hideNoteNodes && (
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
                  <p>{noteSearchProvider?.label ? `Add ${noteSearchProvider.label} Link` : "Add Note Link"}</p>
                </TooltipContent>
              </Tooltip>
              )}

              <Tooltip>
                {entitySearchProvider ? (
                  <entitySearchProvider.component
                    open={entityPickerOpen}
                    onOpenChange={(open) => {
                      setEntityPickerOpen(open);
                      if (!open) {
                        setPendingConnection(null);
                      }
                    }}
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
                ) : (
                  <ReferencePicker
                    open={entityPickerOpen}
                    onOpenChange={(open) => {
                      setEntityPickerOpen(open);
                      if (!open) {
                        setPendingConnection(null);
                      }
                    }}
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
                )}
                <TooltipContent side="right">
                  <p>Add Entity</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setImageDialogOpen(true)}
                    className="h-8 w-8 text-stone-400 hover:text-white"
                    data-testid="button-add-image"
                  >
                    <Image className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Add Image</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setVideoDialogOpen(true)}
                    className="h-8 w-8 text-stone-400 hover:text-white"
                    data-testid="button-add-video"
                  >
                    <Video className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Add Video</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLinkDialogOpen(true)}
                    className="h-8 w-8 text-stone-400 hover:text-white"
                    data-testid="button-add-link"
                  >
                    <Link className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Add Link</p>
                </TooltipContent>
              </Tooltip>

              {selectedConnectionId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setArrowSettingsOpen(true)}
                      className="h-8 w-8 text-indigo-400 hover:text-indigo-300"
                      data-testid="button-arrow-settings"
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Arrow Settings</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}

          <div className="flex-1 relative overflow-hidden min-h-[300px]">
            <div
              ref={containerRef}
              className={`w-full h-full cursor-grab active:cursor-grabbing touch-none ${isConnecting || isDragging || isResizing || isBoxSelecting ? 'select-none' : ''}`}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              data-testid="canvas-container"
            >
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ overflow: "visible" }}
              >
                <defs>
                  {/* End arrow markers - strokeWidth units for zoom-independent sizing */}
                  <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L6,3 L0,6 z" fill="rgb(120 113 108)" />
                  </marker>
                  <marker id="arrowhead-selected" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L6,3 L0,6 z" fill="rgb(99 102 241)" />
                  </marker>
                  <marker id="arrowhead-preview" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L6,3 L0,6 z" fill="rgb(129 140 248)" />
                  </marker>
                  {/* Start arrow markers (reversed) */}
                  <marker id="arrowhead-start" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M6,0 L0,3 L6,6 z" fill="rgb(120 113 108)" />
                  </marker>
                  <marker id="arrowhead-start-selected" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M6,0 L0,3 L6,6 z" fill="rgb(99 102 241)" />
                  </marker>
                </defs>
                <g ref={svgGroupRef} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
                
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
                                  // Store potential drag start - actual drag begins on move
                                  labelDragStartRef.current = {
                                    connectionId: connection.id,
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    offsetX: labelOffset.x,
                                    offsetY: labelOffset.y,
                                  };
                                  setSelectedConnectionId(connection.id);
                                  setSelectedNodeId(null);
                                }}
                                onPointerMove={(e) => {
                                  if (!labelDragStartRef.current || labelDragStartRef.current.connectionId !== connection.id) return;
                                  const dx = e.clientX - labelDragStartRef.current.startX;
                                  const dy = e.clientY - labelDragStartRef.current.startY;
                                  // Only start dragging after 5px movement
                                  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                                    e.preventDefault();
                                    const world = screenToWorld(e.clientX, e.clientY);
                                    setDraggingLabel({
                                      connectionId: connection.id,
                                      startX: world.x,
                                      startY: world.y,
                                      offsetX: labelDragStartRef.current.offsetX,
                                      offsetY: labelDragStartRef.current.offsetY,
                                    });
                                    labelDragStartRef.current = null;
                                  }
                                }}
                                onPointerUp={() => {
                                  labelDragStartRef.current = null;
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
                </g>
              </svg>
              
              <div
                ref={nodesContainerRef}
                className="absolute"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
              >
                {canvasData.nodes.map(renderNode)}
                {isBoxSelecting && selectionBox && (
                  <div
                    className="absolute pointer-events-none border-2 border-dashed border-blue-500 bg-blue-500/10"
                    style={{
                      left: Math.min(selectionBox.startX, selectionBox.endX),
                      top: Math.min(selectionBox.startY, selectionBox.endY),
                      width: Math.abs(selectionBox.endX - selectionBox.startX),
                      height: Math.abs(selectionBox.endY - selectionBox.startY),
                    }}
                    data-testid="selection-box"
                  />
                )}
              </div>
              
              {connectionDropMenu && connectionDropMenu.visible && (
                <div
                  className="absolute z-50 bg-stone-900 border border-stone-700 rounded-lg shadow-lg py-1 min-w-[160px]"
                  style={{
                    left: connectionDropMenu.x,
                    top: connectionDropMenu.y,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid="connection-drop-menu"
                >
                  <div className="px-3 py-1.5 text-xs text-stone-500 border-b border-stone-700">
                    Create Node
                  </div>
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-stone-800 transition-colors text-left"
                    onClick={() => handleConnectionDropMenuSelect("text")}
                    data-testid="drop-menu-text"
                  >
                    <Type className="h-4 w-4 text-stone-400" />
                    <span className="text-sm text-stone-200">Text</span>
                  </button>
                  {!hideNoteNodes && (
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-stone-800 transition-colors text-left"
                    onClick={() => handleConnectionDropMenuSelect("note")}
                    data-testid="drop-menu-note"
                  >
                    <FileText className="h-4 w-4 text-amber-400" />
                    <span className="text-sm text-stone-200">{noteSearchProvider?.label ? `${noteSearchProvider.label} Reference` : "Note Reference"}</span>
                  </button>
                  )}
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-stone-800 transition-colors text-left"
                    onClick={() => handleConnectionDropMenuSelect("entity")}
                    data-testid="drop-menu-entity"
                  >
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <span className="text-sm text-stone-200">Entity Reference</span>
                  </button>
                  <div className="border-t border-stone-700 mt-1 pt-1">
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-stone-800 transition-colors text-left"
                      onClick={() => setConnectionDropMenu(null)}
                      data-testid="drop-menu-cancel"
                    >
                      <X className="h-4 w-4 text-stone-500" />
                      <span className="text-sm text-stone-400">Cancel</span>
                    </button>
                  </div>
                </div>
              )}
              
            </div>
          </div>
        </div>

        <Dialog open={noteSearchOpen} onOpenChange={(open) => {
          setNoteSearchOpen(open);
          if (!open) {
            setPendingConnection(null);
          }
        }}>
          <DialogContent className="bg-stone-950 border-stone-800">
            <DialogHeader>
              <DialogTitle className="text-stone-200">{noteSearchProvider?.label ? `Link to ${noteSearchProvider.label}` : "Link to Note"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                <Input
                  value={noteSearchQuery}
                  onChange={(e) => setNoteSearchQuery(e.target.value)}
                  placeholder="Search or create note..."
                  className="pl-9 bg-stone-900 border-stone-700"
                  data-testid="input-note-search"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && noteSearchQuery.trim()) {
                      const exactMatch = searchedNotes.find(
                        (note) => note.title.toLowerCase() === noteSearchQuery.toLowerCase()
                      );
                      if (exactMatch) {
                        handleNoteSelect(exactMatch);
                      } else {
                        handleCreateNoteFromSearch(noteSearchQuery);
                      }
                    }
                  }}
                />
              </div>
              <ScrollArea className="h-60">
                {notesLoading || isCreatingNote ? (
                  <div className="flex items-center justify-center py-8 text-stone-500">
                    <LoadingLogo className="h-5 w-5 mr-2" />
                    {isCreatingNote ? 'Creating note...' : noteSearchQuery.length > 0 ? 'Searching...' : 'Loading notes...'}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {noteSearchQuery.trim() && !searchedNotes.find(
                      (note) => note.title.toLowerCase() === noteSearchQuery.toLowerCase()
                    ) && (
                      <button
                        onClick={() => handleCreateNoteFromSearch(noteSearchQuery)}
                        className="w-full flex items-center gap-3 p-2 rounded hover:bg-cyan-900/30 transition-colors text-left border border-dashed border-cyan-700/50 mb-2"
                        data-testid="button-create-note-from-search"
                      >
                        <Plus className="h-4 w-4 text-cyan-400" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-cyan-300">
                            Create "{noteSearchQuery}"
                          </span>
                          <p className="text-xs text-stone-500">Create new note and link</p>
                        </div>
                      </button>
                    )}
                    {searchedNotes.length === 0 && !noteSearchQuery.trim() ? (
                      <div className="text-center py-8 text-stone-500 text-sm">
                        No notes found
                      </div>
                    ) : (
                      searchedNotes.map((note) => (
                        <button
                          key={note.id}
                          onClick={() => handleNoteSelect(note)}
                          className="w-full flex items-center gap-3 p-2 rounded hover:bg-stone-800/50 transition-colors text-left"
                          data-testid={`note-result-${note.id}`}
                        >
                          <FileText className="h-4 w-4 text-amber-400" />
                          <span className="text-sm text-stone-200 truncate">{note.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>

        {/* Arrow Settings Dialog */}
        <Dialog open={arrowSettingsOpen} onOpenChange={setArrowSettingsOpen}>
          <DialogContent className="bg-stone-950 border-stone-800 max-w-[320px]">
            <DialogHeader>
              <DialogTitle className="text-stone-200">Arrow Settings</DialogTitle>
            </DialogHeader>
            {selectedConnectionId && (() => {
              const selectedConnection = canvasData.connections.find((c) => c.id === selectedConnectionId);
              if (!selectedConnection) return null;
              
              return (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-stone-400">Arrow Type</Label>
                    <Select
                      value={selectedConnection.arrowType || "end"}
                      onValueChange={(value: ArrowType) => updateConnection(selectedConnectionId, { arrowType: value })}
                    >
                      <SelectTrigger className="bg-stone-900 border-stone-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-stone-900 border-stone-700">
                        <SelectItem value="end">Arrow at end →</SelectItem>
                        <SelectItem value="start">Arrow at start ←</SelectItem>
                        <SelectItem value="both">Both ends ↔</SelectItem>
                        <SelectItem value="none">No arrow —</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <p className="text-xs text-stone-500 italic">
                    Double-click the label on the arrow to edit text. Drag to reposition.
                  </p>
                  
                  {(selectedConnection.waypoints?.length || 0) > 0 && (
                    <div className="pt-3 border-t border-stone-700">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-stone-400">
                          {selectedConnection.waypoints?.length} waypoint(s)
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-stone-400 hover:text-stone-200"
                          onClick={() => updateConnection(selectedConnectionId, { waypoints: [] })}
                        >
                          Clear all
                        </Button>
                      </div>
                      <p className="text-xs text-stone-500 mt-1">
                        Drag waypoints to adjust. Hold to remove.
                      </p>
                    </div>
                  )}
                  
                  <div className="pt-3 border-t border-stone-700">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        deleteConnection(selectedConnectionId);
                        setArrowSettingsOpen(false);
                      }}
                      data-testid="button-delete-connection"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Arrow
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        <Dialog open={imageDialogOpen} onOpenChange={(open) => {
          setImageDialogOpen(open);
          if (!open) {
            setImageUrl("");
            setImageTab("url");
          }
        }}>
          <DialogContent className="bg-stone-900 border-stone-700">
            <DialogHeader>
              <DialogTitle className="text-white">Add Image</DialogTitle>
            </DialogHeader>
            <Tabs value={imageTab} onValueChange={(v) => setImageTab(v as "url" | "upload")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-stone-800">
                <TabsTrigger value="url" className="data-[state=active]:bg-stone-700">
                  <Link className="h-4 w-4 mr-2" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="upload" className="data-[state=active]:bg-stone-700">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-sm text-stone-400">Image URL</Label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="bg-stone-800 border-stone-700"
                    data-testid="input-image-url"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setImageDialogOpen(false);
                      setImageUrl("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (imageUrl.trim()) {
                        addNode("image", { 
                          mediaUrl: imageUrl.trim(),
                          width: 200,
                          height: 150,
                        });
                      }
                      setImageDialogOpen(false);
                      setImageUrl("");
                    }}
                    disabled={!imageUrl.trim()}
                    data-testid="button-confirm-add-image"
                  >
                    Add Image
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="upload" className="space-y-4 mt-4">
                <div 
                  className="border-2 border-dashed border-stone-600 rounded-lg p-6 text-center cursor-pointer hover:border-amber-500 transition-colors"
                  onClick={() => imageFileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-stone-400 mb-2" />
                  <p className="text-stone-400 text-sm">Click to upload an image</p>
                  <p className="text-stone-500 text-xs mt-1">PNG, JPG, GIF, WebP</p>
                </div>
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFileUpload}
                  data-testid="input-image-file"
                />
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setImageDialogOpen(false);
                      setImageUrl("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
          <DialogContent className="bg-stone-900 border-stone-700">
            <DialogHeader>
              <DialogTitle className="text-white">Add Video</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-stone-400">Video URL</Label>
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-video-url"
                />
                <p className="text-xs text-stone-500">Supports YouTube, Vimeo, and direct video URLs</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setVideoDialogOpen(false);
                    setVideoUrl("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (videoUrl.trim()) {
                      const youtubeMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                      const vimeoMatch = videoUrl.match(/vimeo\.com\/(\d+)/);
                      let provider: "youtube" | "vimeo" | "direct" = "direct";
                      let thumbnailUrl: string | undefined;
                      
                      if (youtubeMatch) {
                        provider = "youtube";
                        thumbnailUrl = `https://img.youtube.com/vi/${youtubeMatch[1]}/hqdefault.jpg`;
                      } else if (vimeoMatch) {
                        provider = "vimeo";
                      }
                      
                      addNode("video", { 
                        mediaUrl: videoUrl.trim(),
                        videoProvider: provider,
                        thumbnailUrl,
                        width: 200,
                        height: 150,
                      });
                    }
                    setVideoDialogOpen(false);
                    setVideoUrl("");
                  }}
                  disabled={!videoUrl.trim()}
                  data-testid="button-confirm-add-video"
                >
                  Add Video
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent className="bg-stone-900 border-stone-700">
            <DialogHeader>
              <DialogTitle className="text-white">Add Link</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-stone-400">URL</Label>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-link-url"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-stone-400">Title (optional)</Label>
                <Input
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="Link title"
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-link-title"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-stone-400">Description (optional)</Label>
                <Textarea
                  value={linkDescription}
                  onChange={(e) => setLinkDescription(e.target.value)}
                  placeholder="Brief description..."
                  className="bg-stone-800 border-stone-700 resize-none"
                  rows={2}
                  data-testid="input-link-description"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLinkDialogOpen(false);
                    setLinkUrl("");
                    setLinkTitle("");
                    setLinkDescription("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (linkUrl.trim()) {
                      addNode("link", { 
                        mediaUrl: linkUrl.trim(),
                        linkTitle: linkTitle.trim() || undefined,
                        linkDescription: linkDescription.trim() || undefined,
                        width: 200,
                        height: 100,
                      });
                    }
                    setLinkDialogOpen(false);
                    setLinkUrl("");
                    setLinkTitle("");
                    setLinkDescription("");
                  }}
                  disabled={!linkUrl.trim()}
                  data-testid="button-confirm-add-link"
                >
                  Add Link
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
