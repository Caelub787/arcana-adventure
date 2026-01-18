import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Note, api, SystemSpell, SystemTrait, SystemSkill, SystemSpecies, Item, SearchableEntity, Character } from "@/lib/api";
import { ZoomIn, ZoomOut, RotateCcw, X, Sparkles, Package, Shield, Zap, Users, FileText, Tag, UserCircle, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CanvasData } from "./CanvasEditor";

interface NotesGraphProps {
  notes: Note[];
  characters?: Character[];
  onNoteClick?: (noteId: string) => void;
  onCharacterClick?: (characterId: string) => void;
}

type EntityType = 'note' | 'spell' | 'item' | 'trait' | 'skill' | 'species' | 'character';

interface GraphNode {
  id: string;
  type: EntityType;
  name: string;
  description?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  noteId?: string;
}

interface GraphEdge {
  fromId: string;
  toId: string;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 0.8;
const NODE_RADIUS = 8;

// Golden angle for Fibonacci sphere distribution
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Fibonacci sphere layout - distributes N points evenly on a sphere surface, then projects to 2D
function layoutFibonacciSphere(nodes: GraphNode[], radius: number = 200): void {
  const n = nodes.length;
  if (n === 0) return;
  
  // Apply slight 3D rotation for visual interest (tilt the sphere)
  const rotX = 0.3; // radians
  const rotY = 0.5; // radians
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  
  for (let i = 0; i < n; i++) {
    // Fibonacci sphere: evenly distribute points on sphere surface
    const y = 1 - (2 * (i + 0.5)) / n; // y goes from ~1 to ~-1
    const r = Math.sqrt(1 - y * y); // radius at this y level
    const theta = i * GOLDEN_ANGLE;
    
    // 3D coordinates on unit sphere
    let x3d = r * Math.cos(theta);
    let z3d = r * Math.sin(theta);
    let y3d = y;
    
    // Apply rotation around X axis
    const y1 = y3d * cosX - z3d * sinX;
    const z1 = y3d * sinX + z3d * cosX;
    y3d = y1;
    z3d = z1;
    
    // Apply rotation around Y axis
    const x1 = x3d * cosY + z3d * sinY;
    const z2 = -x3d * sinY + z3d * cosY;
    x3d = x1;
    z3d = z2;
    
    // Project to 2D with slight perspective (nodes "further back" are slightly smaller/closer to center)
    const perspective = 0.3;
    const depth = (z3d + 1) / 2; // normalize to 0-1
    const scale = 1 - perspective * (1 - depth);
    
    nodes[i].x = x3d * radius * scale;
    nodes[i].y = y3d * radius * scale;
    nodes[i].vx = 0;
    nodes[i].vy = 0;
  }
}

const FILTER_STORAGE_KEY = 'notesGraph.entityFilters';

type EntityFilters = Record<EntityType, boolean>;

const DEFAULT_FILTERS: EntityFilters = {
  note: true,
  spell: true,
  item: true,
  trait: true,
  skill: true,
  species: true,
  character: true,
};

function loadFilters(): EntityFilters {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_FILTERS, ...JSON.parse(stored) };
    }
  } catch {}
  return DEFAULT_FILTERS;
}

function saveFilters(filters: EntityFilters): void {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {}
}

const NODE_COLORS: Record<EntityType, { fill: string; stroke: string; glow: string }> = {
  note: { fill: '#d946ef', stroke: '#e879f9', glow: 'rgba(217, 70, 239, 0.4)' },
  spell: { fill: '#ef4444', stroke: '#f87171', glow: 'rgba(239, 68, 68, 0.4)' },
  item: { fill: '#f59e0b', stroke: '#fbbf24', glow: 'rgba(245, 158, 11, 0.4)' },
  trait: { fill: '#22c55e', stroke: '#4ade80', glow: 'rgba(34, 197, 94, 0.4)' },
  skill: { fill: '#06b6d4', stroke: '#22d3ee', glow: 'rgba(6, 182, 212, 0.4)' },
  species: { fill: '#a855f7', stroke: '#c084fc', glow: 'rgba(168, 85, 247, 0.4)' },
  character: { fill: '#f97316', stroke: '#fb923c', glow: 'rgba(249, 115, 22, 0.4)' },
};

function getEntityIcon(type: EntityType) {
  switch (type) {
    case 'note': return <FileText className="h-3 w-3" />;
    case 'spell': return <Sparkles className="h-3 w-3" />;
    case 'item': return <Package className="h-3 w-3" />;
    case 'trait': return <Shield className="h-3 w-3" />;
    case 'skill': return <Zap className="h-3 w-3" />;
    case 'species': return <Users className="h-3 w-3" />;
    case 'character': return <UserCircle className="h-3 w-3" />;
    default: return <FileText className="h-3 w-3" />;
  }
}

function parseConnections(notes: Note[], entityMap: Map<string, GraphNode>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  const addEdge = (fromId: string, toId: string) => {
    const key1 = `${fromId}-${toId}`;
    const key2 = `${toId}-${fromId}`;
    if (!seenEdges.has(key1) && !seenEdges.has(key2) && fromId !== toId) {
      seenEdges.add(key1);
      edges.push({ fromId, toId });
    }
  };

  for (const note of notes) {
    const content = note.content || "";
    
    const referencePattern = /\[\[(\w+):([^\]|]+)\|?[^\]]*\]\]/g;
    let match;
    while ((match = referencePattern.exec(content)) !== null) {
      const entityType = match[1];
      const entityId = match[2];
      
      if (entityType === 'note') {
        if (notes.some(n => n.id === entityId)) {
          addEdge(`note-${note.id}`, `note-${entityId}`);
        }
      } else {
        const entityKey = `${entityType}-${entityId}`;
        if (entityMap.has(entityKey)) {
          addEdge(`note-${note.id}`, entityKey);
        }
      }
    }

    // Match both legacy [*note name] and new [note name] formats
    const noteReferencePattern = /\[\*([^\]]+)\]|\[([^\[\]:|\]]+)\]/g;
    let noteMatch;
    while ((noteMatch = noteReferencePattern.exec(content)) !== null) {
      // Match group 1 for legacy [*note], group 2 for new [note]
      const noteName = noteMatch[1] || noteMatch[2];
      if (noteName) {
        const linkedNote = notes.find(n => n.title.toLowerCase() === noteName.toLowerCase());
        if (linkedNote) {
          addEdge(`note-${note.id}`, `note-${linkedNote.id}`);
        }
      }
    }

    if (note.type === "canvas" && note.canvasData) {
      const canvasData = note.canvasData as CanvasData;
      if (canvasData.nodes) {
        for (const node of canvasData.nodes) {
          if (node.type === "note" && node.noteId && notes.some(n => n.id === node.noteId)) {
            addEdge(`note-${note.id}`, `note-${node.noteId}`);
          }
        }
      }
    }
  }

  return edges;
}

interface GraphNodeExtended extends GraphNode {
  characterId?: string;
  portrait?: string;
}

interface ItemSummary {
  id: string;
  name: string;
  itemType: string;
  rarity: string;
  weight: number;
}

function initializeNodes(
  notes: Note[],
  spells: SystemSpell[],
  traits: SystemTrait[],
  skills: SystemSkill[],
  species: SystemSpecies[],
  items: ItemSummary[],
  characters: Character[],
  filters?: EntityFilters
): { nodes: GraphNodeExtended[]; entityMap: Map<string, GraphNodeExtended> } {
  const nodes: GraphNodeExtended[] = [];
  const entityMap = new Map<string, GraphNodeExtended>();
  
  const addNode = (id: string, type: EntityType, name: string, description?: string, noteId?: string, characterId?: string, portrait?: string) => {
    const node: GraphNodeExtended = {
      id,
      type,
      name,
      description,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      noteId,
      characterId,
      portrait,
    };
    nodes.push(node);
    entityMap.set(id, node);
  };

  for (const note of notes) {
    addNode(`note-${note.id}`, 'note', note.title, note.content?.substring(0, 200), note.id);
  }

  for (const spell of spells) {
    addNode(`spell-${spell.id}`, 'spell', spell.name, spell.description);
  }

  for (const trait of traits) {
    addNode(`trait-${trait.id}`, 'trait', trait.name, trait.description);
  }

  for (const skill of skills) {
    addNode(`skill-${skill.id}`, 'skill', skill.name, skill.description);
  }

  for (const s of species) {
    addNode(`species-${s.id}`, 'species', s.name, s.description);
  }

  for (const item of items) {
    addNode(`item-${item.id}`, 'item', item.name, `${item.itemType} (${item.rarity})`);
  }

  for (const char of characters) {
    addNode(`character-${char.id}`, 'character', char.name, char.biography, undefined, char.id, char.portrait);
  }

  // Apply Fibonacci sphere layout to visible nodes only
  const activeFilters = filters || DEFAULT_FILTERS;
  const visibleNodes = nodes.filter(n => activeFilters[n.type]);
  const radius = Math.max(150, Math.min(400, visibleNodes.length * 8));
  layoutFibonacciSphere(visibleNodes, radius);
  
  // Move hidden nodes off-screen
  for (const node of nodes) {
    if (!activeFilters[node.type]) {
      node.x = 10000;
      node.y = 10000;
    }
  }

  return { nodes, entityMap };
}

export function NotesGraph({ notes, characters = [], onNoteClick, onCharacterClick }: NotesGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const transformGroupRef = useRef<SVGGElement>(null);
  const animationRef = useRef<number>(0);
  const panAnimationRef = useRef<number>(0);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(DEFAULT_ZOOM);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodeExtended | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [entityFilters, setEntityFilters] = useState<EntityFilters>(loadFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isPanningRef = useRef(false);
  const isDraggingRef = useRef(false);
  
  // Touch gesture tracking for pinch-to-zoom
  const touchStartRef = useRef<{ touches: { x: number; y: number }[]; zoom: number; pan: { x: number; y: number } } | null>(null);
  
  const updateTransform = useCallback(() => {
    if (transformGroupRef.current) {
      transformGroupRef.current.setAttribute(
        'transform',
        `translate(${panRef.current.x}, ${panRef.current.y}) scale(${zoomRef.current})`
      );
    }
  }, []);
  
  const toggleFilter = useCallback((type: EntityType) => {
    setEntityFilters(prev => {
      const next = { ...prev, [type]: !prev[type] };
      saveFilters(next);
      return next;
    });
  }, []);
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number; startedOnNode: GraphNodeExtended | null } | null>(null);
  const DRAG_THRESHOLD = 5;

  const { data: spells = [] } = useQuery({
    queryKey: ['/api/spells'],
    queryFn: () => api.getPublicSpells(),
    staleTime: 60000,
  });

  const { data: traits = [] } = useQuery({
    queryKey: ['/api/traits'],
    queryFn: () => api.getPublicTraits(),
    staleTime: 60000,
  });

  const { data: skills = [] } = useQuery({
    queryKey: ['/api/skills'],
    queryFn: () => api.getPublicSkills(),
    staleTime: 60000,
  });

  const { data: species = [] } = useQuery({
    queryKey: ['/api/species'],
    queryFn: () => api.getSpecies(),
    staleTime: 60000,
  });

  const { data: systemItems = [] } = useQuery({
    queryKey: ['/api/system-items/summary'],
    queryFn: () => api.getSystemItemSummaries().catch(() => []),
    staleTime: 60000,
  });

  // Fetch all characters the user has access to (from all campaigns)
  const { data: myCharacters = [] } = useQuery({
    queryKey: ['/api/my-characters'],
    queryFn: () => api.getMyCharacters().catch(() => []),
    staleTime: 60000,
  });

  // Combine prop characters with fetched characters, deduplicating by ID
  // Use stable reference via JSON comparison to prevent infinite loops
  const allCharactersKey = useMemo(() => {
    const ids = [...characters.map(c => c.id), ...myCharacters.map(c => c.id)].sort().join(',');
    return ids;
  }, [characters, myCharacters]);

  const allCharacters = useMemo(() => {
    const charMap = new Map<string, typeof characters[0]>();
    for (const char of characters) {
      charMap.set(char.id, char);
    }
    for (const char of myCharacters) {
      if (!charMap.has(char.id)) {
        charMap.set(char.id, char);
      }
    }
    return Array.from(charMap.values());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCharactersKey]);

  const { nodes: initialNodes, entityMap } = useMemo(
    () => initializeNodes(notes, spells, traits, skills, species, systemItems, allCharacters, entityFilters),
    [notes, spells, traits, skills, species, systemItems, allCharacters, entityFilters]
  );

  const edges = useMemo(() => parseConnections(notes, entityMap), [notes, entityMap]);
  const [nodes, setNodes] = useState<GraphNodeExtended[]>(initialNodes);
  const nodesRef = useRef<GraphNodeExtended[]>(initialNodes);
  const [layoutComplete, setLayoutComplete] = useState(false);

  // Track previous data keys to prevent unnecessary re-initialization
  const prevDataKeyRef = useRef('');
  const prevFiltersKeyRef = useRef(JSON.stringify(entityFilters));
  useEffect(() => {
    const dataKey = `${notes.map(n => n.id).join(',')}|${spells.length}|${traits.length}|${skills.length}|${species.length}|${systemItems.length}|${allCharactersKey}`;
    const filtersKey = JSON.stringify(entityFilters);
    
    if (prevDataKeyRef.current === dataKey && prevFiltersKeyRef.current === filtersKey) return;
    prevDataKeyRef.current = dataKey;
    prevFiltersKeyRef.current = filtersKey;
    
    const { nodes: newNodes } = initializeNodes(notes, spells, traits, skills, species, systemItems, allCharacters, entityFilters);
    setNodes(newNodes);
    nodesRef.current = newNodes;
    setLayoutComplete(true);
  }, [notes, spells, traits, skills, species, systemItems, allCharacters, allCharactersKey, entityFilters]);

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

        panRef.current = {
          x: mouseX - worldX * newZoom,
          y: mouseY - worldY * newZoom,
        };
        zoomRef.current = newZoom;
        
        // Update transform directly, sync state after
        if (transformGroupRef.current) {
          transformGroupRef.current.setAttribute(
            'transform',
            `translate(${panRef.current.x}, ${panRef.current.y}) scale(${zoomRef.current})`
          );
        }
        setPan({ ...panRef.current });
        setZoom(newZoom);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.entity-popup')) return;
    
    const nodeElement = target.closest('.graph-node');
    let startedOnNode: GraphNode | null = null;
    
    if (nodeElement) {
      const nodeId = nodeElement.getAttribute('data-node-id');
      if (nodeId) {
        startedOnNode = nodes.find(n => n.id === nodeId) || null;
      }
    }
    
    isPanningRef.current = true;
    isDraggingRef.current = false;
    panStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
      startedOnNode,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [nodes]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current || !panStartRef.current) return;
    
    const dx = e.clientX - panStartRef.current.pointerX;
    const dy = e.clientY - panStartRef.current.pointerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > DRAG_THRESHOLD) {
      isDraggingRef.current = true;
      setHoveredNodeId(null);
    }
    
    if (isDraggingRef.current) {
      panRef.current = {
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      };
      // Use rAF batching for smooth panning - update DOM directly via ref
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
    
    // Sync state at end of drag for proper re-renders
    if (wasDragging) {
      setPan({ ...panRef.current });
    }
    
    isPanningRef.current = false;
    isDraggingRef.current = false;
    panStartRef.current = null;
    
    if (clickedNode && !wasDragging) {
      if (clickedNode.type === 'note' && clickedNode.noteId && onNoteClick) {
        onNoteClick(clickedNode.noteId);
      } else {
        setSelectedNode(clickedNode);
      }
    }
  }, [onNoteClick]);

  // Touch event handlers for pinch-to-zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
      touchStartRef.current = {
        touches,
        zoom: zoomRef.current,
        pan: { ...panRef.current },
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      // Calculate new distance between fingers
      const currentDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const startDist = Math.hypot(
        touchStartRef.current.touches[1].x - touchStartRef.current.touches[0].x,
        touchStartRef.current.touches[1].y - touchStartRef.current.touches[0].y
      );
      
      // Calculate zoom scale
      const scale = currentDist / startDist;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, touchStartRef.current.zoom * scale));
      
      // Calculate pinch center for zoom origin
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      const startCenterX = (touchStartRef.current.touches[0].x + touchStartRef.current.touches[1].x) / 2;
      const startCenterY = (touchStartRef.current.touches[0].y + touchStartRef.current.touches[1].y) / 2;
      
      // Adjust pan to keep content under pinch center
      const zoomDelta = newZoom / touchStartRef.current.zoom;
      const newPanX = centerX - (startCenterX - touchStartRef.current.pan.x) * zoomDelta;
      const newPanY = centerY - (startCenterY - touchStartRef.current.pan.y) * zoomDelta;
      
      zoomRef.current = newZoom;
      panRef.current = { x: newPanX, y: newPanY };
      
      if (!panAnimationRef.current) {
        panAnimationRef.current = requestAnimationFrame(() => {
          updateTransform();
          panAnimationRef.current = 0;
        });
      }
    }
  }, [updateTransform]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2 && touchStartRef.current) {
      // Sync state when pinch ends
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
    if (layoutComplete && nodes.length > 0) {
      resetView();
      setLayoutComplete(false);
    }
  }, [layoutComplete, nodes.length, resetView]);

  const handleZoomIn = () => {
    const newZoom = Math.min(MAX_ZOOM, zoomRef.current * 1.3);
    zoomRef.current = newZoom;
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(MIN_ZOOM, zoomRef.current / 1.3);
    zoomRef.current = newZoom;
    setZoom(newZoom);
  };

  const handleNodeClick = useCallback((node: GraphNodeExtended) => {
    if (node.type === 'note' && node.noteId && onNoteClick) {
      onNoteClick(node.noteId);
    } else if (node.type === 'character' && node.characterId && onCharacterClick) {
      onCharacterClick(node.characterId);
    } else {
      setSelectedNode(node);
    }
  }, [onNoteClick, onCharacterClick]);

  const isConnected = (nodeId: string) => {
    if (!hoveredNodeId) return false;
    if (nodeId === hoveredNodeId) return true;
    return connectedNodesMap.get(hoveredNodeId)?.has(nodeId) || false;
  };

  const isEdgeConnected = (edge: GraphEdge) => {
    if (!hoveredNodeId) return false;
    return edge.fromId === hoveredNodeId || edge.toId === hoveredNodeId;
  };

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [nodes]);

  // Apply entity type filters
  const filteredNodes = useMemo(() => {
    return nodes.filter(node => entityFilters[node.type]);
  }, [nodes, entityFilters]);

  const filteredNodeIds = useMemo(() => {
    return new Set(filteredNodes.map(n => n.id));
  }, [filteredNodes]);

  const filteredEdges = useMemo(() => {
    return edges.filter(edge => 
      filteredNodeIds.has(edge.fromId) && filteredNodeIds.has(edge.toId)
    );
  }, [edges, filteredNodeIds]);

  const noteCount = notes.length;
  const characterCount = allCharacters.length;
  const entityCount = spells.length + traits.length + skills.length + species.length + systemItems.length;
  const visibleCount = filteredNodes.length;

  return (
    <div className="relative w-full h-full overflow-hidden bg-stone-950">
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
        data-testid="notes-graph-container"
      >
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full"
          style={{ background: 'transparent' }}
        >
          <g ref={transformGroupRef} transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {filteredEdges.map((edge, i) => {
              const fromNode = nodeMap.get(edge.fromId);
              const toNode = nodeMap.get(edge.toId);
              if (!fromNode || !toNode) return null;

              const connected = isEdgeConnected(edge);
              const opacity = hoveredNodeId ? (connected ? 0.8 : 0.1) : 0.3;
              const strokeWidth = connected ? 1.5 : 1;
              const strokeColor = connected ? '#a8a29e' : '#57534e';

              return (
                <line
                  key={`edge-${i}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth / zoom}
                  opacity={opacity}
                  className="transition-opacity duration-150"
                />
              );
            })}

            {filteredNodes.map((node) => {
              const colors = NODE_COLORS[node.type];
              const connected = isConnected(node.id);
              const isHovered = hoveredNodeId === node.id;
              const opacity = hoveredNodeId ? (connected ? 1 : 0.3) : 1;
              const isCharacter = node.type === 'character';
              const baseRadius = isCharacter ? NODE_RADIUS * 1.4 : NODE_RADIUS;
              const scale = isHovered ? 1.5 : 1;
              const radius = baseRadius * scale;
              const displayName = node.name.length > 18 ? node.name.substring(0, 18) + '...' : node.name;
              const hasPortrait = isCharacter && node.portrait;

              return (
                <g
                  key={node.id}
                  className="graph-node cursor-pointer transition-all duration-150"
                  style={{ opacity }}
                  onMouseEnter={() => !isDraggingRef.current && setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  data-testid={`graph-node-${node.id}`}
                  data-node-id={node.id}
                >
                  {isHovered && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius + 4}
                      fill={colors.glow}
                      className="animate-pulse"
                    />
                  )}
                  {hasPortrait ? (
                    <>
                      <defs>
                        <clipPath id={`clip-${node.id}`}>
                          <circle cx={node.x} cy={node.y} r={radius - 1} />
                        </clipPath>
                      </defs>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        fill={colors.fill}
                        stroke={colors.stroke}
                        strokeWidth={2 / zoom}
                      />
                      <image
                        href={node.portrait}
                        x={node.x - radius + 1}
                        y={node.y - radius + 1}
                        width={(radius - 1) * 2}
                        height={(radius - 1) * 2}
                        clipPath={`url(#clip-${node.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </>
                  ) : (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={1.5 / zoom}
                    />
                  )}
                  {showLabels && !isHovered && (
                    <g className="pointer-events-none">
                      <rect
                        x={node.x - 50 / zoom}
                        y={node.y + NODE_RADIUS + 4 / zoom}
                        width={100 / zoom}
                        height={18 / zoom}
                        rx={3 / zoom}
                        fill="rgba(28, 25, 23, 0.85)"
                        stroke={colors.stroke}
                        strokeWidth={0.5 / zoom}
                      />
                      <text
                        x={node.x}
                        y={node.y + NODE_RADIUS + 16 / zoom}
                        textAnchor="middle"
                        fill="#d6d3d1"
                        fontSize={10 / zoom}
                        fontFamily="system-ui"
                      >
                        {displayName}
                      </text>
                    </g>
                  )}
                  {isHovered && (
                    <g className="pointer-events-none">
                      <rect
                        x={node.x - 60 / zoom}
                        y={node.y + radius + 8 / zoom}
                        width={120 / zoom}
                        height={24 / zoom}
                        rx={4 / zoom}
                        fill="rgba(28, 25, 23, 0.95)"
                        stroke="#44403c"
                        strokeWidth={1 / zoom}
                      />
                      <text
                        x={node.x}
                        y={node.y + radius + 20 / zoom}
                        textAnchor="middle"
                        fill="#e7e5e4"
                        fontSize={12 / zoom}
                        fontFamily="system-ui"
                      >
                        {displayName}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {selectedNode && selectedNode.type !== 'note' && (
        <div 
          className="entity-popup absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                     bg-stone-900 border border-stone-700 rounded-lg shadow-2xl p-4 max-w-sm z-50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {selectedNode.type === 'character' && selectedNode.portrait ? (
                <img 
                  src={selectedNode.portrait}
                  alt={selectedNode.name}
                  className="w-10 h-10 rounded-full object-cover border-2"
                  style={{ borderColor: NODE_COLORS[selectedNode.type].stroke }}
                />
              ) : (
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: NODE_COLORS[selectedNode.type].fill }}
                >
                  {getEntityIcon(selectedNode.type)}
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-stone-100">{selectedNode.name}</div>
                <div className="text-xs text-stone-400 capitalize">{selectedNode.type}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-stone-400 hover:text-stone-200"
              onClick={() => setSelectedNode(null)}
              data-testid="button-close-entity-popup"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selectedNode.description && (
            <p className="text-sm text-stone-300 line-clamp-4">
              {selectedNode.description}
            </p>
          )}
          <div className="mt-3 text-xs text-stone-500">
            {connectedNodesMap.get(selectedNode.id)?.size || 0} connections
          </div>
        </div>
      )}

      {/* Collapsible filter panel - positioned absolutely to not affect button layout */}
      {filtersOpen && (
        <div className="absolute top-4 right-16 bg-stone-900/95 border border-stone-700 rounded-lg p-2 flex flex-col gap-1 animate-in fade-in slide-in-from-right-2 duration-200 z-20">
          <div className="text-xs text-stone-500 mb-1 flex items-center justify-between">
            <span>Filters</span>
            <button 
              onClick={() => setFiltersOpen(false)}
              className="text-stone-500 hover:text-stone-300"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {[
            { type: 'note' as EntityType, label: 'Notes' },
            { type: 'character' as EntityType, label: 'Characters' },
            { type: 'spell' as EntityType, label: 'Spells' },
            { type: 'item' as EntityType, label: 'Items' },
            { type: 'trait' as EntityType, label: 'Traits' },
            { type: 'skill' as EntityType, label: 'Skills' },
            { type: 'species' as EntityType, label: 'Species' },
          ].map(({ type, label }) => {
            const isEnabled = entityFilters[type];
            return (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className={`flex items-center gap-2 px-2 py-1 rounded text-left transition-all ${
                  isEnabled 
                    ? 'bg-stone-800/50 hover:bg-stone-700/50' 
                    : 'bg-stone-900/30 opacity-40 hover:opacity-60'
                }`}
                data-testid={`filter-toggle-${type}`}
                title={isEnabled ? `Hide ${label}` : `Show ${label}`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0`}
                  style={{ backgroundColor: NODE_COLORS[type].fill, opacity: isEnabled ? 1 : 0.4 }}
                />
                <span className={`text-xs ${isEnabled ? 'text-stone-300' : 'text-stone-600 line-through'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        {/* Filter toggle button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`bg-stone-900/80 border-stone-700 hover:bg-stone-800 ${filtersOpen ? 'text-amber-400 border-amber-600' : ''}`}
          data-testid="button-toggle-filters"
          title={filtersOpen ? "Hide filters" : "Show filters"}
        >
          <Filter className="h-4 w-4" />
        </Button>
        
        {/* Zoom and view controls */}
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
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowLabels(!showLabels)}
          className={`bg-stone-900/80 border-stone-700 hover:bg-stone-800 ${showLabels ? 'text-amber-400 border-amber-600' : ''}`}
          data-testid="button-toggle-labels"
          title={showLabels ? "Hide labels" : "Show labels"}
        >
          <Tag className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute bottom-4 left-4">
        <div className="text-xs text-stone-500">
          {visibleCount} visible • {nodes.length} total • {filteredEdges.length} connections
        </div>
      </div>
    </div>
  );
}
