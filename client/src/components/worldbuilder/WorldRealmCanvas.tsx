import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  useEntities,
  useWorldCanvasNodes,
  useUpsertWorldCanvasNode,
  useDeleteWorldCanvasNode,
  type Entity,
} from '@/lib/worldbuilding-api';
import { ItemDialog, SpellDialog, arcanaSessionHostAdapter } from '@arcana/library-dialogs';
import '@arcana/library-dialogs/theme.css';
import {
  arcanaApiTransport,
  ArcanaModalChrome,
  useImageBrowserBridge,
  itemToDraft,
} from '@/lib/library-dialog-bridges';
import { SpellbookLibraryManager } from '@/components/library/SpellbookLibraryManager';
import { CharacterSheet, ItemDetailDialog } from '@/components/game/GameComponents';
import { RelationshipGraph } from '@/components/worldbuilding/RelationshipGraph';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sword, Sparkles, Users, FileText, Frame, Plus, X, Search, ChevronRight, ChevronDown,
  LayoutGrid, Network, Columns2, Rows2, ZoomIn, ZoomOut, Maximize2, Loader2, ExternalLink,
} from 'lucide-react';

type RefType = 'entity' | 'item' | 'spell' | 'character';

interface RealmNode {
  key: string;
  refType: RefType;
  refId: string;
  title: string;
  subtitle?: string;
  image?: string | null;
  category: string;
  raw: any;
}

interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

// --- Pane tiling tree ---
type PaneLeaf = { type: 'leaf'; id: string; nodeKey: string | null };
type PaneSplit = { type: 'split'; id: string; dir: 'h' | 'v'; a: PaneTree; b: PaneTree };
type PaneTree = PaneLeaf | PaneSplit;

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function systemSlug(system: string | null | undefined): 'aa-v2' | 'aa-v3' | 'arcana-adventure' {
  if (system === 'aa-v2') return 'aa-v2';
  if (system === 'aa-v3') return 'aa-v3';
  return 'arcana-adventure';
}
function systemDisplay(slug: 'aa-v2' | 'aa-v3' | 'arcana-adventure'): string {
  if (slug === 'aa-v2') return 'A.A. V2';
  if (slug === 'aa-v3') return 'A.A. V3';
  return 'Arcana Adventure';
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Sword; color: string }> = {
  Articles: { label: 'Articles', icon: FileText, color: 'text-sky-400' },
  Canvases: { label: 'Canvases', icon: Frame, color: 'text-violet-400' },
  Items: { label: 'Items', icon: Sword, color: 'text-amber-400' },
  Spells: { label: 'Spells', icon: Sparkles, color: 'text-fuchsia-400' },
  Characters: { label: 'Characters', icon: Users, color: 'text-emerald-400' },
};
const CATEGORY_ORDER = ['Articles', 'Canvases', 'Items', 'Spells', 'Characters'];

const DEFAULT_W = 280;
const DEFAULT_H = 200;

export function WorldRealmCanvas({
  worldId,
  system,
  canEdit,
  onOpenArticle,
}: {
  worldId: string;
  system: string | null | undefined;
  canEdit: boolean;
  onOpenArticle?: (entityId: string) => void;
}) {
  const slug = systemSlug(system);
  const display = systemDisplay(slug);
  const queryClient = useQueryClient();

  // ---- Data ----
  const { data: entities = [] } = useEntities(worldId);
  const { data: items = [] } = useQuery({
    queryKey: ['world-items', worldId],
    queryFn: () => api.getSystemItems(slug, undefined, undefined, worldId),
  });
  const { data: spells = [] } = useQuery({
    queryKey: ['world-spells', worldId],
    queryFn: () => api.getSystemSpells(slug, undefined, worldId),
  });
  const { data: characters = [] } = useQuery({
    queryKey: ['world-characters', worldId],
    queryFn: () => api.getCharacterTemplates(undefined, worldId),
  });
  const { data: allSpecies = [] } = useQuery({
    queryKey: ['world-species', display],
    queryFn: () => api.getSystemSpecies(display),
  });
  const { data: canvasNodes = [] } = useWorldCanvasNodes(worldId);
  const upsertNode = useUpsertWorldCanvasNode(worldId);
  const deleteNode = useDeleteWorldCanvasNode(worldId);

  const invalidateCharacters = () => queryClient.invalidateQueries({ queryKey: ['world-characters', worldId] });

  // ---- Unified node list ----
  const nodes: RealmNode[] = useMemo(() => {
    const list: RealmNode[] = [];
    for (const e of entities as Entity[]) {
      const isCanvas = e.entityType === 'canvas';
      list.push({
        key: `entity:${e.id}`,
        refType: 'entity',
        refId: e.id,
        title: e.displayName || 'Untitled',
        subtitle: e.description || undefined,
        image: e.image,
        category: isCanvas ? 'Canvases' : 'Articles',
        raw: e,
      });
    }
    for (const it of items as any[]) {
      list.push({ key: `item:${it.id}`, refType: 'item', refId: it.id, title: it.name || 'Item', subtitle: it.description, image: it.icon, category: 'Items', raw: it });
    }
    for (const sp of spells as any[]) {
      list.push({ key: `spell:${sp.id}`, refType: 'spell', refId: sp.id, title: sp.name || 'Spell', subtitle: sp.description, image: sp.icon, category: 'Spells', raw: sp });
    }
    for (const ch of characters as any[]) {
      list.push({ key: `character:${ch.id}`, refType: 'character', refId: ch.id, title: ch.name || 'Character', subtitle: ch.race || ch.description, image: ch.avatar || ch.image, category: 'Characters', raw: ch });
    }
    return list;
  }, [entities, items, spells, characters]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, RealmNode>();
    for (const n of nodes) m.set(n.key, n);
    return m;
  }, [nodes]);

  // ---- Placement state (canvas) ----
  const [placed, setPlaced] = useState<Record<string, Placement>>({});
  useEffect(() => {
    setPlaced((prev) => {
      const next: Record<string, Placement> = {};
      for (const n of canvasNodes) {
        const key = `${n.refType}:${n.refId}`;
        // Preserve in-progress local placement to avoid clobbering optimistic drags.
        next[key] = prev[key] ?? { x: n.x, y: n.y, width: n.width, height: n.height, z: n.z };
      }
      return next;
    });
  }, [canvasNodes]);

  const maxZ = useMemo(() => Object.values(placed).reduce((m, p) => Math.max(m, p.z), 0), [placed]);

  const persistPlacement = useCallback((key: string, p: Placement) => {
    if (!canEdit) return;
    const [refType, refId] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    upsertNode.mutate({ refType, refId, x: p.x, y: p.y, width: p.width, height: p.height, z: p.z });
  }, [canEdit, upsertNode]);

  // ---- Viewport (pan/zoom) ----
  const [viewport, setViewport] = useState<{ x: number; y: number; scale: number }>(() => {
    try {
      const raw = localStorage.getItem(`realm-viewport-${worldId}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 0, y: 0, scale: 1 };
  });
  useEffect(() => {
    try { localStorage.setItem(`realm-viewport-${worldId}`, JSON.stringify(viewport)); } catch {}
  }, [viewport, worldId]);
  // Reset cached placement / viewport view when the world changes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`realm-viewport-${worldId}`);
      setViewport(raw ? JSON.parse(raw) : { x: 0, y: 0, scale: 1 });
    } catch { setViewport({ x: 0, y: 0, scale: 1 }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  const containerRef = useRef<HTMLDivElement>(null);

  // ---- Mode + sidebar ----
  const [mode, setMode] = useState<'canvas' | 'panes' | 'graph'>('canvas');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ---- Pane tree ----
  const [paneTree, setPaneTree] = useState<PaneTree>(() => {
    try {
      const raw = localStorage.getItem(`realm-panes-${worldId}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { type: 'leaf', id: newId(), nodeKey: null };
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`realm-panes-${worldId}`);
      setPaneTree(raw ? JSON.parse(raw) : { type: 'leaf', id: newId(), nodeKey: null });
    } catch { setPaneTree({ type: 'leaf', id: newId(), nodeKey: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);
  useEffect(() => {
    try { localStorage.setItem(`realm-panes-${worldId}`, JSON.stringify(paneTree)); } catch {}
  }, [paneTree, worldId]);
  const [activePaneId, setActivePaneId] = useState<string | null>(null);

  // ---- Real-sheet host ----
  const { imagePicker, element: imageBrowserElement } = useImageBrowserBridge();
  const transport = useMemo(() => arcanaApiTransport(slug, undefined, worldId), [slug, worldId]);
  const host = useMemo(
    () =>
      arcanaSessionHostAdapter({
        transport,
        notify: (level: string, message: string) =>
          toast({
            title: level === 'error' ? 'Error' : level === 'warning' ? 'Warning' : 'Notice',
            description: message,
            variant: level === 'error' ? 'destructive' : 'default',
          }),
        imagePicker,
        modal: ArcanaModalChrome,
        spellbookManager: SpellbookLibraryManager,
      }),
    [transport, imagePicker],
  );

  // ---- Sheet dialog state ----
  const [editItem, setEditItem] = useState<any | null>(null);
  const [viewItem, setViewItem] = useState<any | null>(null);
  const [editSpell, setEditSpell] = useState<any | null>(null);
  const [viewSpell, setViewSpell] = useState<any | null>(null);
  const [viewChar, setViewChar] = useState<any | null>(null);
  const viewerCharacter = useMemo(() => ({ id: '', name: 'Viewer', isTemplate: true }) as any, []);

  const openSheet = useCallback((node: RealmNode) => {
    if (node.refType === 'entity') {
      if (onOpenArticle) onOpenArticle(node.refId);
      return;
    }
    if (node.refType === 'item') { canEdit ? setEditItem(node.raw) : setViewItem(node.raw); return; }
    if (node.refType === 'spell') { canEdit ? setEditSpell(node.raw) : setViewSpell(node.raw); return; }
    if (node.refType === 'character') { setViewChar(node.raw); return; }
  }, [canEdit, onOpenArticle]);

  // ---- Add a node to the canvas ----
  const addToCanvas = useCallback((key: string, atScreen?: { x: number; y: number }) => {
    if (!canEdit) return;
    if (placed[key]) {
      // already on canvas — just bring to front
      setPlaced((prev) => {
        const p = { ...prev[key], z: maxZ + 1 };
        persistPlacement(key, p);
        return { ...prev, [key]: p };
      });
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = atScreen ? atScreen.x - (rect?.left ?? 0) : (rect?.width ?? 800) / 2;
    const cy = atScreen ? atScreen.y - (rect?.top ?? 0) : (rect?.height ?? 600) / 2;
    const worldX = (cx - viewport.x) / viewport.scale - DEFAULT_W / 2;
    const worldY = (cy - viewport.y) / viewport.scale - DEFAULT_H / 2;
    const p: Placement = { x: worldX, y: worldY, width: DEFAULT_W, height: DEFAULT_H, z: maxZ + 1 };
    setPlaced((prev) => ({ ...prev, [key]: p }));
    persistPlacement(key, p);
  }, [canEdit, placed, maxZ, viewport, persistPlacement]);

  const removeFromCanvas = useCallback((key: string) => {
    if (!canEdit) return;
    setPlaced((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const [refType, refId] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    deleteNode.mutate({ refType, refId });
  }, [canEdit, deleteNode]);

  // ---- Sidebar item activation ----
  const activateNode = useCallback((node: RealmNode) => {
    if (mode === 'panes') {
      // assign to active pane (or first empty leaf, else root replace)
      setPaneTree((tree) => assignToPane(tree, activePaneId, node.key));
      return;
    }
    if (mode === 'canvas') {
      addToCanvas(node.key);
      return;
    }
    openSheet(node);
  }, [mode, activePaneId, addToCanvas, openSheet]);

  // ---- Grouped sidebar ----
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups: Record<string, RealmNode[]> = {};
    for (const n of nodes) {
      if (q && !n.title.toLowerCase().includes(q)) continue;
      (groups[n.category] ??= []).push(n);
    }
    for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.title.localeCompare(b.title));
    return groups;
  }, [nodes, search]);

  // ---- Pane operations ----
  const splitPane = (paneId: string, dir: 'h' | 'v') => {
    setPaneTree((tree) => splitLeaf(tree, paneId, dir));
  };
  const closePane = (paneId: string) => {
    setPaneTree((tree) => closeLeaf(tree, paneId) ?? { type: 'leaf', id: newId(), nodeKey: null });
  };
  const setPaneNode = (paneId: string, key: string | null) => {
    setPaneTree((tree) => assignToPane(tree, paneId, key));
  };

  // ---- Canvas drag/pan/zoom handlers ----
  const dragRef = useRef<null | {
    kind: 'pan' | 'move' | 'resize';
    key?: string;
    startX: number;
    startY: number;
    orig: Placement | { x: number; y: number };
  }>(null);

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, orig: { x: viewport.x, y: viewport.y } };
  };

  const onNodeMouseDown = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setPlaced((prev) => {
      const p = { ...prev[key], z: maxZ + 1 };
      persistPlacement(key, p);
      return { ...prev, [key]: p };
    });
    if (!canEdit) return;
    const p = placed[key];
    dragRef.current = { kind: 'move', key, startX: e.clientX, startY: e.clientY, orig: { ...p, z: maxZ + 1 } };
  };

  const onResizeMouseDown = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    if (!canEdit) return;
    dragRef.current = { kind: 'resize', key, startX: e.clientX, startY: e.clientY, orig: { ...placed[key] } };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (d.kind === 'pan') {
        const o = d.orig as { x: number; y: number };
        setViewport((v) => ({ ...v, x: o.x + dx, y: o.y + dy }));
      } else if (d.kind === 'move' && d.key) {
        const o = d.orig as Placement;
        const key = d.key;
        setPlaced((prev) => ({ ...prev, [key]: { ...prev[key], x: o.x + dx / viewport.scale, y: o.y + dy / viewport.scale } }));
      } else if (d.kind === 'resize' && d.key) {
        const o = d.orig as Placement;
        const key = d.key;
        setPlaced((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            width: Math.max(160, o.width + dx / viewport.scale),
            height: Math.max(120, o.height + dy / viewport.scale),
          },
        }));
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (d && (d.kind === 'move' || d.kind === 'resize') && d.key) {
        const key = d.key;
        setPlaced((prev) => {
          if (prev[key]) persistPlacement(key, prev[key]);
          return prev;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [viewport.scale, persistPlacement]);

  const onWheel = (e: React.WheelEvent) => {
    if (mode !== 'canvas') return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    const px = e.clientX - (rect?.left ?? 0);
    const py = e.clientY - (rect?.top ?? 0);
    setViewport((v) => {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale = Math.min(2.5, Math.max(0.2, v.scale * factor));
      // keep cursor point stable
      const wx = (px - v.x) / v.scale;
      const wy = (py - v.y) / v.scale;
      return { scale: newScale, x: px - wx * newScale, y: py - wy * newScale };
    });
  };

  const zoomBy = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const px = (rect?.width ?? 800) / 2;
    const py = (rect?.height ?? 600) / 2;
    setViewport((v) => {
      const newScale = Math.min(2.5, Math.max(0.2, v.scale * factor));
      const wx = (px - v.x) / v.scale;
      const wy = (py - v.y) / v.scale;
      return { scale: newScale, x: px - wx * newScale, y: py - wy * newScale };
    });
  };
  const resetView = () => setViewport({ x: 0, y: 0, scale: 1 });

  // ---- Drag-from-sidebar onto canvas ----
  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/realm-node');
    if (key) addToCanvas(key, { x: e.clientX, y: e.clientY });
  };

  // ============ Render helpers ============
  const renderNodePreview = (node: RealmNode, compact: boolean) => {
    const meta = CATEGORY_META[node.category];
    const Icon = meta?.icon ?? FileText;
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-start gap-2 p-2 border-b border-stone-700/60">
          {node.image ? (
            <img src={node.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded bg-stone-700/70 flex items-center justify-center flex-shrink-0">
              <Icon className={`w-5 h-5 ${meta?.color ?? 'text-stone-400'}`} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-stone-100 truncate" title={node.title}>{node.title}</div>
            <div className={`text-[10px] uppercase tracking-wide ${meta?.color ?? 'text-stone-400'}`}>{node.category.slice(0, -1)}</div>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-2 text-xs text-stone-400">
          {node.subtitle ? <p className="whitespace-pre-wrap line-clamp-6">{node.subtitle}</p> : <span className="italic text-stone-600">No description.</span>}
        </div>
        <div className="p-2 border-t border-stone-700/60">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={() => openSheet(node)}
            data-testid={`button-open-sheet-${node.key}`}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            {node.refType === 'entity' ? 'Open article' : canEdit && node.refType !== 'character' ? 'Open sheet (edit)' : 'Open sheet'}
          </Button>
        </div>
      </div>
    );
  };

  // Recursive pane renderer
  const renderPane = (tree: PaneTree): React.ReactElement => {
    if (tree.type === 'split') {
      const isH = tree.dir === 'h';
      return (
        <div className={`flex ${isH ? 'flex-row' : 'flex-col'} w-full h-full min-h-0 min-w-0`}>
          <div className="flex-1 min-w-0 min-h-0">{renderPane(tree.a)}</div>
          <div className={isH ? 'w-px bg-stone-700' : 'h-px bg-stone-700'} />
          <div className="flex-1 min-w-0 min-h-0">{renderPane(tree.b)}</div>
        </div>
      );
    }
    const node = tree.nodeKey ? nodeMap.get(tree.nodeKey) : null;
    const isActive = activePaneId === tree.id;
    return (
      <div
        className={`flex flex-col h-full min-h-0 min-w-0 bg-stone-900/60 border ${isActive ? 'border-amber-500/60' : 'border-stone-700/60'} m-0.5 rounded`}
        onMouseDown={() => setActivePaneId(tree.id)}
        data-testid={`pane-${tree.id}`}
      >
        <div className="flex items-center gap-1 px-1.5 py-1 border-b border-stone-700/60 bg-stone-800/50">
          <span className="text-xs text-stone-300 truncate flex-1">{node ? node.title : 'Empty pane'}</span>
          <button className="p-1 hover:bg-stone-700 rounded" title="Split right" onClick={() => splitPane(tree.id, 'h')} data-testid={`button-split-h-${tree.id}`}>
            <Columns2 className="w-3.5 h-3.5 text-stone-400" />
          </button>
          <button className="p-1 hover:bg-stone-700 rounded" title="Split down" onClick={() => splitPane(tree.id, 'v')} data-testid={`button-split-v-${tree.id}`}>
            <Rows2 className="w-3.5 h-3.5 text-stone-400" />
          </button>
          <button className="p-1 hover:bg-stone-700 rounded" title="Close pane" onClick={() => closePane(tree.id)} data-testid={`button-close-pane-${tree.id}`}>
            <X className="w-3.5 h-3.5 text-stone-400" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {node ? (
            renderNodePreview(node, true)
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-stone-600 p-3 text-center">
              Click this pane, then pick a node from the library to fill it.
            </div>
          )}
        </div>
      </div>
    );
  };

  const placedKeys = Object.keys(placed);

  return (
    <div className="flex h-full min-h-0" data-testid="panel-world-realm">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-60 flex-shrink-0 border-r border-stone-700 bg-stone-900/70 flex flex-col min-h-0">
          <div className="p-2 border-b border-stone-700">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search nodes..."
                className="h-8 pl-7 text-xs bg-stone-800 border-stone-700"
                data-testid="input-realm-search"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {CATEGORY_ORDER.map((cat) => {
              const rows = grouped[cat] || [];
              if (rows.length === 0) return null;
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              const isCollapsed = collapsed[cat];
              return (
                <div key={cat}>
                  <button
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-stone-300 hover:bg-stone-800 rounded"
                    onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                    data-testid={`folder-${cat}`}
                  >
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                    {meta.label}
                    <span className="ml-auto text-[10px] text-stone-500">{rows.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="ml-3 mt-0.5 space-y-0.5">
                      {rows.map((node) => {
                        const onCanvas = !!placed[node.key];
                        return (
                          <div
                            key={node.key}
                            className="group flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-stone-800 cursor-pointer"
                            draggable={canEdit}
                            onDragStart={(e) => { e.dataTransfer.setData('text/realm-node', node.key); }}
                            onClick={() => activateNode(node)}
                            title={node.title}
                            data-testid={`sidebar-node-${node.key}`}
                          >
                            {node.image ? (
                              <img src={node.image} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
                            ) : (
                              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${meta.color} opacity-70`} />
                            )}
                            <span className="text-xs text-stone-300 truncate flex-1">{node.title}</span>
                            {onCanvas && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="On canvas" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {nodes.length === 0 && (
              <div className="text-center text-xs text-stone-600 py-8">No nodes in this world yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-stone-700 bg-stone-900/50">
          <button
            className="p-1.5 hover:bg-stone-800 rounded text-stone-400"
            onClick={() => setSidebarOpen((s) => !s)}
            title={sidebarOpen ? 'Hide library' : 'Show library'}
            data-testid="button-toggle-sidebar"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-0.5 ml-1 bg-stone-800/60 rounded p-0.5">
            {([
              { id: 'canvas', label: 'Canvas', icon: Frame },
              { id: 'panes', label: 'Panes', icon: Columns2 },
              { id: 'graph', label: 'Graph', icon: Network },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors ${
                  mode === id ? 'bg-amber-500/20 text-amber-300' : 'text-stone-400 hover:text-stone-200'
                }`}
                data-testid={`button-mode-${id}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {mode === 'canvas' && (
            <div className="flex items-center gap-0.5 ml-2">
              <button className="p-1.5 hover:bg-stone-800 rounded text-stone-400" onClick={() => zoomBy(1 / 1.2)} title="Zoom out" data-testid="button-zoom-out"><ZoomOut className="w-4 h-4" /></button>
              <span className="text-xs text-stone-500 w-10 text-center">{Math.round(viewport.scale * 100)}%</span>
              <button className="p-1.5 hover:bg-stone-800 rounded text-stone-400" onClick={() => zoomBy(1.2)} title="Zoom in" data-testid="button-zoom-in"><ZoomIn className="w-4 h-4" /></button>
              <button className="p-1.5 hover:bg-stone-800 rounded text-stone-400" onClick={resetView} title="Reset view" data-testid="button-reset-view"><Maximize2 className="w-4 h-4" /></button>
            </div>
          )}

          <span className="ml-auto text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">{display}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 relative">
          {/* Canvas mode */}
          {mode === 'canvas' && (
            <div
              ref={containerRef}
              className="absolute inset-0 overflow-hidden bg-stone-950 cursor-grab active:cursor-grabbing"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(120,113,108,0.18) 1px, transparent 1px)',
                backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
                backgroundPosition: `${viewport.x}px ${viewport.y}px`,
              }}
              onMouseDown={onCanvasMouseDown}
              onWheel={onWheel}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={onCanvasDrop}
              data-testid="realm-canvas-surface"
            >
              <div
                className="absolute top-0 left-0"
                style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`, transformOrigin: '0 0' }}
              >
                {placedKeys.map((key) => {
                  const node = nodeMap.get(key);
                  const p = placed[key];
                  if (!node || !p) return null;
                  return (
                    <div
                      key={key}
                      className="absolute bg-stone-900 border border-stone-700 rounded-md shadow-lg overflow-hidden flex flex-col"
                      style={{ left: p.x, top: p.y, width: p.width, height: p.height, zIndex: p.z }}
                      data-testid={`canvas-node-${key}`}
                    >
                      <div
                        className="flex items-center gap-1 px-2 py-1 bg-stone-800 border-b border-stone-700 cursor-move flex-shrink-0"
                        onMouseDown={(e) => onNodeMouseDown(e, key)}
                        onDoubleClick={() => openSheet(node)}
                      >
                        <span className="text-xs text-stone-200 truncate flex-1">{node.title}</span>
                        {canEdit && (
                          <button
                            className="p-0.5 hover:bg-stone-700 rounded"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => removeFromCanvas(key)}
                            title="Remove from canvas"
                            data-testid={`button-remove-canvas-${key}`}
                          >
                            <X className="w-3.5 h-3.5 text-stone-400" />
                          </button>
                        )}
                      </div>
                      <div className="flex-1 min-h-0">{renderNodePreview(node, true)}</div>
                      {canEdit && (
                        <div
                          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize"
                          onMouseDown={(e) => onResizeMouseDown(e, key)}
                          style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(168,162,158,0.6) 50%)' }}
                          data-testid={`resize-${key}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {placedKeys.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-stone-600">
                    <Frame className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{canEdit ? 'Drag nodes from the library, or click one to drop it here.' : 'No nodes placed on this canvas yet.'}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Panes mode */}
          {mode === 'panes' && (
            <div className="absolute inset-0 bg-stone-950 p-0.5" data-testid="realm-panes-surface">
              {renderPane(paneTree)}
            </div>
          )}

          {/* Graph mode */}
          {mode === 'graph' && (
            <div className="absolute inset-0" data-testid="realm-graph-surface">
              <RelationshipGraph
                worldId={worldId}
                onSelectEntity={(entityId) => {
                  const node = nodeMap.get(`entity:${entityId}`);
                  if (node) openSheet(node);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ---- Real sheets ---- */}
      {editItem && (
        <ItemDialog
          open={!!editItem}
          onOpenChange={(open: boolean) => { if (!open) setEditItem(null); }}
          mode="edit"
          initialValue={itemToDraft(editItem)}
          host={host}
          campaignSystem={slug}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['world-items', worldId] });
            setEditItem(null);
            toast({ title: 'Item Updated', description: 'World item updated successfully' });
          }}
        />
      )}
      {viewItem && (
        <ItemDetailDialog
          item={viewItem}
          open={!!viewItem}
          onOpenChange={(open: boolean) => { if (!open) setViewItem(null); }}
          isGM={false}
          isOwner={false}
          character={viewerCharacter}
          items={[]}
          onUpdate={() => {}}
          onDelete={() => {}}
          campaignSystem={slug}
        />
      )}
      {editSpell && (
        <SpellDialog
          open={!!editSpell}
          onOpenChange={(open: boolean) => { if (!open) setEditSpell(null); }}
          mode="edit"
          initialValue={editSpell as any}
          host={host}
          campaignSystem={slug}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['world-spells', worldId] });
            setEditSpell(null);
            toast({ title: 'Spell Updated', description: 'World spell updated successfully' });
          }}
        />
      )}
      {viewSpell && (
        <Dialog open={!!viewSpell} onOpenChange={(open) => { if (!open) setViewSpell(null); }}>
          <DialogContent className="max-w-md" data-testid="dialog-view-realm-spell">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {viewSpell.icon ? <img src={viewSpell.icon} alt="" className="w-8 h-8 rounded" /> : null}
                {viewSpell.name || 'Spell'}
              </DialogTitle>
              {viewSpell.description ? (
                <DialogDescription className="whitespace-pre-wrap">{viewSpell.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 text-sm text-stone-300">
              {viewSpell.school ? <div><span className="text-stone-500">School:</span> {viewSpell.school}</div> : null}
              {viewSpell.level != null ? <div><span className="text-stone-500">Level:</span> {viewSpell.level}</div> : null}
              {viewSpell.manaCost != null ? <div><span className="text-stone-500">Mana:</span> {viewSpell.manaCost}</div> : null}
              {viewSpell.rangeNum != null ? <div><span className="text-stone-500">Range:</span> {viewSpell.rangeNum} ft</div> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewSpell(null)} data-testid="button-close-view-realm-spell">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {viewChar && (
        <div className="fixed inset-0 z-[10000] bg-stone-950/95 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <CharacterSheet
              character={viewChar}
              isGM={canEdit}
              isOwner={canEdit}
              isTemplate={true}
              accessLevel={canEdit ? 'edit' : 'view'}
              campaignSystem={slug}
              allSpecies={allSpecies}
              onUpdate={(updates: any) => {
                if (!canEdit) return;
                api.updateCharacterTemplate(viewChar.id, updates).then((updated) => {
                  if (updated) setViewChar(updated);
                  invalidateCharacters();
                });
              }}
              onClose={() => { setViewChar(null); invalidateCharacters(); }}
            />
          </div>
        </div>
      )}

      {imageBrowserElement}
    </div>
  );
}

// ============ Pane tree pure helpers (exported for tests) ============
export function splitLeaf(tree: PaneTree, paneId: string, dir: 'h' | 'v', idGen: () => string = newId): PaneTree {
  if (tree.type === 'leaf') {
    if (tree.id !== paneId) return tree;
    return {
      type: 'split',
      id: idGen(),
      dir,
      a: tree,
      b: { type: 'leaf', id: idGen(), nodeKey: null },
    };
  }
  return { ...tree, a: splitLeaf(tree.a, paneId, dir, idGen), b: splitLeaf(tree.b, paneId, dir, idGen) };
}

export function closeLeaf(tree: PaneTree, paneId: string): PaneTree | null {
  if (tree.type === 'leaf') {
    return tree.id === paneId ? null : tree;
  }
  const a = closeLeaf(tree.a, paneId);
  const b = closeLeaf(tree.b, paneId);
  if (a === null) return b;
  if (b === null) return a;
  return { ...tree, a, b };
}

// Set nodeKey on the leaf matching paneId (returns same ref if not found).
function setPaneNodeById(tree: PaneTree, paneId: string, key: string | null): PaneTree {
  if (tree.type === 'leaf') {
    return tree.id === paneId ? { ...tree, nodeKey: key } : tree;
  }
  return { ...tree, a: setPaneNodeById(tree.a, paneId, key), b: setPaneNodeById(tree.b, paneId, key) };
}

// Fill the first (left-to-right, depth-first) empty leaf. Returns null when none.
function fillFirstEmpty(tree: PaneTree, key: string | null): PaneTree | null {
  if (tree.type === 'leaf') {
    return tree.nodeKey === null ? { ...tree, nodeKey: key } : null;
  }
  const a = fillFirstEmpty(tree.a, key);
  if (a) return { ...tree, a };
  const b = fillFirstEmpty(tree.b, key);
  if (b) return { ...tree, b };
  return null;
}

// Replace the first (left-to-right) leaf's nodeKey regardless of occupancy.
function replaceFirstLeaf(tree: PaneTree, key: string | null): PaneTree {
  if (tree.type === 'leaf') return { ...tree, nodeKey: key };
  return { ...tree, a: replaceFirstLeaf(tree.a, key) };
}

export function assignToPane(tree: PaneTree, paneId: string | null, key: string | null): PaneTree {
  if (paneId) return setPaneNodeById(tree, paneId, key);
  // No explicit target: prefer the first empty leaf, otherwise overwrite the first leaf.
  return fillFirstEmpty(tree, key) ?? replaceFirstLeaf(tree, key);
}

export type { PaneTree, PaneLeaf, PaneSplit };
