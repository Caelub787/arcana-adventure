// Map Maker editor — Inkarnate-inspired: a bounded map "sheet" you paint
// textured terrain onto and scatter/place asset stamps over, organized
// into layers, navigated with cursor-anchored pan/zoom. Fundamentals for
// this pass:
//   - Terrain is one flattened raster painted with tileable placeholder
//     textures (see terrainTextures.ts) rather than flat color, or filled
//     in one shot by the noise-based "Generate Terrain" biome pass.
//   - A single "Assets" tool places stamp instances: a quick click drops
//     one, a drag scatters several with jittered position/rotation/scale
//     along the stroke — the same mechanic Inkarnate uses for both single
//     buildings and tree/mountain clusters.
//   - Every placed stamp belongs to one of four layers (Terrain Features,
//     Vegetation, Structures, Decor); the Layers panel toggles a layer's
//     visibility and picks which layer new placements land in.
//   - Every stamp instance also renders the variant at the map's
//     activeVariantIndex from its own asset's variant list — pressing V
//     cycles that one number so a whole map's placed stamps can flip
//     state together (e.g. "village" -> "village on fire") without
//     touching position, rotation, or size.
//   - "Import to Campaign" flattens terrain + all visible-layer stamps
//     into one PNG and creates a brand new Scene — a one-way export, the
//     source Map stays independently editable after.
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, MousePointer2, Image as ImageIcon, Wand2, Save,
  Upload, ZoomIn, ZoomOut, RefreshCw, Eye, EyeOff, Maximize, Mountain, Trees,
} from "lucide-react";
import { api, type StampAsset, type MapObject } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LoadingLogo } from "@/components/LoadingLogo";
import { TERRAIN_KINDS, type TerrainKind, getTerrainPattern } from "@/components/mapmaker/terrainTextures";

type Tool = 'terrain' | 'assets' | 'select';

const LAYERS: { key: string; label: string }[] = [
  { key: 'terrain-features', label: 'Terrain Features' },
  { key: 'vegetation', label: 'Vegetation' },
  { key: 'structures', label: 'Structures' },
  { key: 'decor', label: 'Decor' },
];

// --- tiny value-noise generator (no dependency) for "Generate Terrain" ---
function makeNoise2D(seed: number) {
  const rand = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1, y1 = y0 + 1;
    const sx = smooth(x - x0), sy = smooth(y - y0);
    const n00 = rand(x0, y0), n10 = rand(x1, y0), n01 = rand(x0, y1), n11 = rand(x1, y1);
    return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
  };
}

function fractalNoise(noise: (x: number, y: number) => number, x: number, y: number) {
  let value = 0, amplitude = 1, frequency = 1, total = 0;
  for (let o = 0; o < 4; o++) {
    value += noise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

function biomeTerrainFor(n: number): TerrainKind {
  if (n < 0.35) return 'water';
  if (n < 0.46) return 'sand';
  if (n < 0.66) return 'grass';
  if (n < 0.82) return 'forest';
  if (n < 0.92) return 'stone';
  return 'snow';
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;

export default function MapEditor() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mapQuery = useQuery({
    queryKey: ['/api/maps', id],
    queryFn: () => api.getMap(id!),
    enabled: !!id,
  });
  const stampAssetsQuery = useQuery<StampAsset[]>({
    queryKey: ['/api/stamp-assets'],
    queryFn: () => api.getStampAssets(),
  });

  const [objects, setObjects] = useState<MapObject[]>([]);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [loadedTerrainFor, setLoadedTerrainFor] = useState<string | null>(null);

  useEffect(() => {
    if (mapQuery.data) {
      setObjects(mapQuery.data.objects);
      setActiveVariantIndex(mapQuery.data.activeVariantIndex);
    }
  }, [mapQuery.data?.id]);

  const map = mapQuery.data;

  const [tool, setTool] = useState<Tool>('terrain');
  const [terrainKind, setTerrainKind] = useState<TerrainKind>('grass');
  const [brushSize, setBrushSize] = useState(50);
  const [selectedStampAssetId, setSelectedStampAssetId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState('structures');
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(
    () => Object.fromEntries(LAYERS.map((l) => [l.key, true]))
  );
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.4);
  const [hasFitOnce, setHasFitOnce] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  const isPaintingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const scatterRef = useRef<{ lastX: number; lastY: number; lastTime: number; placedAny: boolean } | null>(null);
  const dragRef = useRef<null | { mode: 'move' | 'rotate' | 'resize'; id: string; startX: number; startY: number; orig: MapObject }>(null);

  const stampAssetsById = useMemo(() => {
    const m = new Map<string, StampAsset>();
    for (const a of stampAssetsQuery.data ?? []) m.set(a.id, a);
    return m;
  }, [stampAssetsQuery.data]);

  const variantForObject = useCallback((obj: MapObject) => {
    const asset = stampAssetsById.get(obj.stampAssetId);
    if (!asset || asset.variants.length === 0) return null;
    return asset.variants[Math.min(activeVariantIndex, asset.variants.length - 1)];
  }, [stampAssetsById, activeVariantIndex]);

  const maxVariantCount = useMemo(() => {
    let max = 1;
    for (const obj of objects) {
      const asset = stampAssetsById.get(obj.stampAssetId);
      if (asset) max = Math.max(max, asset.variants.length);
    }
    return max;
  }, [objects, stampAssetsById]);

  const objectCountByLayer = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of objects) counts[o.layer] = (counts[o.layer] ?? 0) + 1;
    return counts;
  }, [objects]);

  // Draw the saved terrain image onto the canvas once, per map load.
  useEffect(() => {
    if (!map || !canvasRef.current || loadedTerrainFor === map.id) return;
    const canvas = canvasRef.current;
    canvas.width = map.width;
    canvas.height = map.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = getTerrainPattern(ctx, 'grass');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (map.terrainImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = map.terrainImage;
    }
    setLoadedTerrainFor(map.id);
  }, [map, loadedTerrainFor]);

  // Fit the map to the viewport once, on first load.
  useEffect(() => {
    if (!map || hasFitOnce || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const fitZoom = Math.min(rect.width / map.width, rect.height / map.height) * 0.9;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitZoom));
    setZoom(z);
    setPan({ x: (rect.width - map.width * z) / 2, y: (rect.height - map.height * z) / 2 });
    setHasFitOnce(true);
  }, [map, hasFitOnce]);

  const fitToScreen = () => {
    if (!map || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const fitZoom = Math.min(rect.width / map.width, rect.height / map.height) * 0.9;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitZoom));
    setZoom(z);
    setPan({ x: (rect.width - map.width * z) / 2, y: (rect.height - map.height * z) / 2 });
  };

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }, [pan, zoom]);

  // Zoom anchored on the cursor position, Figma/Inkarnate-style: the world
  // point under the pointer stays under the pointer after zooming.
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    setZoom((prevZoom) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor));
      setPan((prevPan) => ({
        x: cx - ((cx - prevPan.x) / prevZoom) * nextZoom,
        y: cy - ((cy - prevPan.y) / prevZoom) * nextZoom,
      }));
      return nextZoom;
    });
  };

  const paintAt = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = getTerrainPattern(ctx, terrainKind);
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const createObjectMutation = useMutation({
    mutationFn: (data: { stampAssetId: string; x: number; y: number; rotation: number; width: number; height: number; layer: string }) =>
      api.createMapObject(id!, { ...data, zIndex: objects.length }),
    onSuccess: (obj) => setObjects((prev) => [...prev, obj]),
    onError: () => toast({ title: "Couldn't place stamp", variant: "destructive" }),
  });

  const updateObjectMutation = useMutation({
    mutationFn: ({ objId, data }: { objId: string; data: Partial<MapObject> }) => api.updateMapObject(objId, data),
  });

  const deleteObjectMutation = useMutation({
    mutationFn: (objId: string) => api.deleteMapObject(objId),
    onSuccess: (_r, objId) => setObjects((prev) => prev.filter((o) => o.id !== objId)),
  });

  const updateMapMutation = useMutation({
    mutationFn: (data: any) => api.updateMap(id!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/maps'] }),
  });

  const placeStamp = (x: number, y: number, jitter: boolean) => {
    if (!selectedStampAssetId) return;
    const baseSize = 40 + brushSize;
    const variance = jitter ? 0.75 + Math.random() * 0.5 : 1;
    const size = baseSize * variance;
    const jx = jitter ? (Math.random() - 0.5) * brushSize * 0.8 : 0;
    const jy = jitter ? (Math.random() - 0.5) * brushSize * 0.8 : 0;
    const rotation = jitter ? Math.random() * 360 : 0;
    createObjectMutation.mutate({
      stampAssetId: selectedStampAssetId,
      x: x + jx,
      y: y + jy,
      rotation,
      width: size,
      height: size,
      layer: activeLayer,
    });
  };

  // --- pointer interaction on the world container ---
  const handleContainerPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    if (e.button !== 0) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    if (tool === 'terrain') {
      isPaintingRef.current = true;
      paintAt(x, y);
    } else if (tool === 'assets' && selectedStampAssetId) {
      scatterRef.current = { lastX: x, lastY: y, lastTime: performance.now(), placedAny: false };
      placeStamp(x, y, false);
    } else {
      setSelectedObjectId(null);
    }
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      setPan({ x: panStartRef.current.panX + (e.clientX - panStartRef.current.x), y: panStartRef.current.panY + (e.clientY - panStartRef.current.y) });
      return;
    }
    if (isPaintingRef.current && tool === 'terrain') {
      const { x, y } = toWorld(e.clientX, e.clientY);
      paintAt(x, y);
      return;
    }
    if (scatterRef.current && tool === 'assets' && selectedStampAssetId) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const s = scatterRef.current;
      const dist = Math.hypot(x - s.lastX, y - s.lastY);
      const now = performance.now();
      if (dist > brushSize * 0.5 && now - s.lastTime > 70) {
        placeStamp(x, y, true);
        s.lastX = x; s.lastY = y; s.lastTime = now;
      }
      return;
    }
    if (dragRef.current) {
      const { mode, id: objId, startX, startY, orig } = dragRef.current;
      const { x, y } = toWorld(e.clientX, e.clientY);
      if (mode === 'move') {
        setObjects((prev) => prev.map((o) => o.id === objId ? { ...o, x: orig.x + (x - startX), y: orig.y + (y - startY) } : o));
      } else if (mode === 'rotate') {
        const angle = Math.atan2(y - orig.y, x - orig.x) * 180 / Math.PI + 90;
        setObjects((prev) => prev.map((o) => o.id === objId ? { ...o, rotation: angle } : o));
      } else if (mode === 'resize') {
        const dist = Math.hypot(x - orig.x, y - orig.y) * 2;
        const size = Math.max(20, dist);
        const aspect = orig.height / orig.width;
        setObjects((prev) => prev.map((o) => o.id === objId ? { ...o, width: size, height: size * aspect } : o));
      }
    }
  };

  const handleContainerPointerUp = () => {
    isPanningRef.current = false;
    isPaintingRef.current = false;
    scatterRef.current = null;
    if (dragRef.current) {
      const { id: objId } = dragRef.current;
      const obj = objects.find((o) => o.id === objId);
      dragRef.current = null;
      if (obj) updateObjectMutation.mutate({ objId, data: { x: obj.x, y: obj.y, rotation: obj.rotation, width: obj.width, height: obj.height } });
    }
  };

  const startObjectDrag = (e: React.PointerEvent, obj: MapObject, mode: 'move' | 'rotate' | 'resize') => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedObjectId(obj.id);
    const { x, y } = toWorld(e.clientX, e.clientY);
    dragRef.current = { mode, id: obj.id, startX: x, startY: y, orig: obj };
  };

  // Keyboard: Delete removes the selected stamp, V cycles the map's
  // variant state, ignored while typing in a field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId) {
        e.preventDefault();
        deleteObjectMutation.mutate(selectedObjectId);
        setSelectedObjectId(null);
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveVariantIndex((v) => {
          const next = (v + 1) % Math.max(1, maxVariantCount);
          updateMapMutation.mutate({ activeVariantIndex: next });
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedObjectId, maxVariantCount]);

  const handleGenerate = () => {
    if (!map || !canvasRef.current) return;
    if (!confirm("Replace the entire terrain layer with a generated one? This can't be undone.")) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const noise = makeNoise2D(Math.random() * 1000);
    const block = 12;
    const scale = 1 / 260;
    for (let px = 0; px < map.width; px += block) {
      for (let py = 0; py < map.height; py += block) {
        const n = fractalNoise(noise, px * scale, py * scale);
        ctx.fillStyle = getTerrainPattern(ctx, biomeTerrainFor(n));
        ctx.fillRect(px, py, block, block);
      }
    }
  };

  const handleSave = async () => {
    if (!canvasRef.current || !map) return;
    setSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const { url } = await api.uploadBase64Image(dataUrl);
      await api.updateMap(map.id, { terrainImage: url, thumbnail: url });
      queryClient.invalidateQueries({ queryKey: ['/api/maps'] });
      toast({ title: "Map saved" });
    } catch {
      toast({ title: "Couldn't save map", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const flattenToDataUrl = (): string | null => {
    if (!canvasRef.current || !map) return null;
    const out = document.createElement('canvas');
    out.width = map.width;
    out.height = map.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvasRef.current, 0, 0);
    for (const obj of [...objects].filter((o) => layerVisibility[o.layer] !== false).sort((a, b) => a.zIndex - b.zIndex)) {
      const img = imgRefs.current.get(obj.id);
      if (!img || !img.complete || img.naturalWidth === 0) continue;
      ctx.save();
      ctx.translate(obj.x, obj.y);
      ctx.rotate((obj.rotation * Math.PI) / 180);
      ctx.drawImage(img, -obj.width / 2, -obj.height / 2, obj.width, obj.height);
      ctx.restore();
    }
    return out.toDataURL('image/png');
  };

  if (mapQuery.isLoading || !map) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-stone-400">
        <LoadingLogo className="h-6 w-6 mr-2" /> Loading map...
      </div>
    );
  }

  const visibleObjects = [...objects].filter((o) => layerVisibility[o.layer] !== false).sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-stone-100 flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-stone-950 border-b border-stone-800 flex-wrap z-20">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/maps')} className="text-stone-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          key={map.id}
          defaultValue={map.name}
          onBlur={(e) => { if (e.target.value.trim() && e.target.value !== map.name) updateMapMutation.mutate({ name: e.target.value.trim() }); }}
          className="h-8 w-48 bg-stone-900 border-stone-700 text-sm"
          data-testid="input-map-name"
        />
        <div className="w-px h-6 bg-stone-800 mx-1" />
        <Button size="sm" variant="outline" className="border-stone-700" onClick={handleGenerate} data-testid="button-generate-terrain">
          <Wand2 className="h-3.5 w-3.5 mr-1" /> Generate Terrain
        </Button>
        <Button
          size="sm" variant="outline" className="border-stone-700"
          onClick={() => { const next = (activeVariantIndex + 1) % Math.max(1, maxVariantCount); setActiveVariantIndex(next); updateMapMutation.mutate({ activeVariantIndex: next }); }}
          title="Cycle variant state (hotkey: V)"
          data-testid="button-cycle-variant"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Variant {activeVariantIndex + 1}/{maxVariantCount}
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="border-stone-700" onClick={fitToScreen} title="Fit to screen" data-testid="button-fit-screen">
          <Maximize className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="border-stone-700" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.85)}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <span className="text-xs text-stone-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="outline" className="border-stone-700" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.15)}><ZoomIn className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="outline" className="border-stone-700" onClick={() => setImportOpen(true)} data-testid="button-import-scene">
          <Upload className="h-3.5 w-3.5 mr-1" /> Import to Campaign
        </Button>
        <Button size="sm" className="bg-emerald-800 hover:bg-emerald-700" onClick={handleSave} disabled={saving} data-testid="button-save-map">
          {saving ? <LoadingLogo className="h-3.5 w-3.5 mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />} Save
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Icon rail */}
        <div className="w-12 bg-stone-950 border-r border-stone-800 flex flex-col items-center py-2 gap-1 shrink-0">
          <button
            className={`w-9 h-9 rounded flex items-center justify-center ${tool === 'terrain' ? 'bg-amber-700 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
            onClick={() => setTool('terrain')} title="Terrain" data-testid="button-tool-terrain"
          >
            <Mountain className="h-4.5 w-4.5" />
          </button>
          <button
            className={`w-9 h-9 rounded flex items-center justify-center ${tool === 'assets' ? 'bg-amber-700 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
            onClick={() => setTool('assets')} title="Assets" data-testid="button-tool-assets"
          >
            <Trees className="h-4.5 w-4.5" />
          </button>
          <button
            className={`w-9 h-9 rounded flex items-center justify-center ${tool === 'select' ? 'bg-amber-700 text-white' : 'text-stone-400 hover:bg-stone-800'}`}
            onClick={() => setTool('select')} title="Select" data-testid="button-tool-select"
          >
            <MousePointer2 className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Contextual flyout panel */}
        <div className="w-48 bg-stone-950 border-r border-stone-800 p-2 overflow-y-auto shrink-0">
          {tool === 'terrain' && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-2">Terrain</p>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {TERRAIN_KINDS.map(({ kind, label }) => (
                  <button
                    key={kind}
                    title={label}
                    className={`aspect-square rounded border-2 overflow-hidden ${terrainKind === kind ? 'border-amber-500' : 'border-stone-700'}`}
                    onClick={() => setTerrainKind(kind)}
                    data-testid={`button-terrain-${kind}`}
                  >
                    <TextureSwatch kind={kind} />
                  </button>
                ))}
              </div>
              <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Brush Size</p>
              <Slider min={10} max={200} step={5} value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} />
              <p className="text-xs text-stone-500 mt-1">{brushSize}px</p>
            </>
          )}
          {tool === 'assets' && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-2">Assets</p>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {(stampAssetsQuery.data ?? []).map((asset) => {
                  const v = asset.variants[0];
                  return (
                    <button
                      key={asset.id}
                      title={asset.name}
                      className={`aspect-square rounded border-2 bg-stone-900 flex items-center justify-center overflow-hidden ${selectedStampAssetId === asset.id ? 'border-amber-500' : 'border-stone-700'}`}
                      onClick={() => setSelectedStampAssetId(asset.id)}
                      data-testid={`button-select-stamp-${asset.id}`}
                    >
                      {v ? <img src={v.image} alt={asset.name} className="max-w-full max-h-full object-contain" /> : <ImageIcon className="h-4 w-4 text-stone-600" />}
                    </button>
                  );
                })}
              </div>
              {(stampAssetsQuery.data ?? []).length === 0 && (
                <p className="text-xs text-stone-600 mb-2">No stamp assets yet. An admin can add some from the Maps list page.</p>
              )}
              <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Brush Size</p>
              <Slider min={10} max={200} step={5} value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} />
              <p className="text-xs text-stone-500 mt-1 mb-2">Click to place one, drag to scatter a cluster.</p>
              <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Placing into</p>
              <p className="text-xs text-amber-400">{LAYERS.find((l) => l.key === activeLayer)?.label}</p>
            </>
          )}
          {tool === 'select' && (
            <p className="text-xs text-stone-500">Click a stamp to select it. Drag its body to move, the top handle to rotate, the corner handle to resize. Delete/Backspace removes it. Press V anytime to cycle the map's variant state.</p>
          )}
        </div>

        {/* Canvas viewport */}
        <div
          ref={viewportRef}
          className="flex-1 relative overflow-hidden bg-[#141414] cursor-crosshair"
          style={{ backgroundImage: 'radial-gradient(#2a2a2a 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          onPointerDown={handleContainerPointerDown}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
          onPointerLeave={handleContainerPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.08 : 0.93); }}
        >
          <div
            style={{ position: 'absolute', left: 0, top: 0, width: map.width, height: map.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.6)' }}
          >
            <canvas ref={canvasRef} className="absolute left-0 top-0" />
            {visibleObjects.map((obj) => {
              const variant = variantForObject(obj);
              const isSelected = selectedObjectId === obj.id;
              return (
                <div
                  key={obj.id}
                  className="absolute"
                  style={{ left: obj.x - obj.width / 2, top: obj.y - obj.height / 2, width: obj.width, height: obj.height, transform: `rotate(${obj.rotation}deg)` }}
                  onPointerDown={(e) => startObjectDrag(e, obj, 'move')}
                  data-testid={`map-object-${obj.id}`}
                >
                  {variant ? (
                    <img
                      ref={(el) => { if (el) imgRefs.current.set(obj.id, el); else imgRefs.current.delete(obj.id); }}
                      src={variant.image}
                      alt=""
                      className={`w-full h-full object-contain pointer-events-none ${isSelected ? 'outline outline-2 outline-amber-400' : ''}`}
                      draggable={false}
                    />
                  ) : (
                    <div className={`w-full h-full bg-stone-700/60 flex items-center justify-center text-[9px] text-stone-300 ${isSelected ? 'outline outline-2 outline-amber-400' : ''}`}>
                      no image
                    </div>
                  )}
                  {isSelected && tool === 'select' && (
                    <>
                      <div
                        className="absolute -top-5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-400 cursor-alias"
                        onPointerDown={(e) => startObjectDrag(e, obj, 'rotate')}
                        data-testid={`handle-rotate-${obj.id}`}
                      />
                      <div
                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-400 cursor-nwse-resize"
                        onPointerDown={(e) => startObjectDrag(e, obj, 'resize')}
                        data-testid={`handle-resize-${obj.id}`}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Layers panel */}
        <div className="w-48 bg-stone-950 border-l border-stone-800 p-2 overflow-y-auto shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-2">Layers</p>
          <div className="space-y-1">
            {LAYERS.map((l) => (
              <div
                key={l.key}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-sm ${activeLayer === l.key ? 'bg-amber-900/30 text-amber-300 border border-amber-700/60' : 'text-stone-300 border border-transparent hover:bg-stone-800'}`}
                onClick={() => setActiveLayer(l.key)}
                data-testid={`layer-row-${l.key}`}
              >
                <button
                  className="text-stone-400 hover:text-white shrink-0"
                  onClick={(e) => { e.stopPropagation(); setLayerVisibility((prev) => ({ ...prev, [l.key]: prev[l.key] === false ? true : false })); }}
                  data-testid={`button-toggle-layer-${l.key}`}
                >
                  {layerVisibility[l.key] === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <span className="flex-1 truncate">{l.label}</span>
                <span className="text-[10px] text-stone-500">{objectCountByLayer[l.key] ?? 0}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-stone-600 mt-3">Click a layer to place new assets into it. The eye toggles visibility on the canvas and in exports.</p>
        </div>
      </div>

      <ImportToSceneDialog open={importOpen} onOpenChange={setImportOpen} mapName={map.name} onFlatten={flattenToDataUrl} mapId={map.id} />
    </div>
  );
}

function TextureSwatch({ kind }: { kind: TerrainKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 40; canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = getTerrainPattern(ctx, kind);
    ctx.fillRect(0, 0, 40, 40);
  }, [kind]);
  return <canvas ref={ref} className="w-full h-full" />;
}

function ImportToSceneDialog({ open, onOpenChange, mapName, onFlatten, mapId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapName: string;
  onFlatten: () => string | null;
  mapId: string;
}) {
  const { toast } = useToast();
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState(mapName);
  const [importing, setImporting] = useState(false);

  const { data: campaignsData } = useQuery<{ created: any[]; joined: any[] }>({
    queryKey: ['/api/campaigns'],
    enabled: open,
  });
  const gmCampaigns = campaignsData?.created ?? [];

  const handleImport = async () => {
    if (!campaignId) return;
    const image = onFlatten();
    if (!image) {
      toast({ title: "Couldn't flatten map", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      await api.importMapToScene(mapId, { campaignId, image, name: sceneName || mapName });
      toast({ title: "Scene created" });
      onOpenChange(false);
    } catch {
      toast({ title: "Couldn't import map as scene", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-stone-200">Import as Scene</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-stone-500 mb-1">Scene name</p>
            <Input value={sceneName} onChange={(e) => setSceneName(e.target.value)} className="bg-stone-800 border-stone-700" data-testid="input-import-scene-name" />
          </div>
          <div>
            <p className="text-xs text-stone-500 mb-1">Campaign (GM only)</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {gmCampaigns.length === 0 && <p className="text-xs text-stone-600">You aren't the GM of any campaign yet.</p>}
              {gmCampaigns.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setCampaignId(c.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm ${campaignId === c.id ? 'bg-amber-900/40 text-amber-200 border border-amber-700' : 'bg-stone-800 text-stone-300 border border-stone-700 hover:bg-stone-700'}`}
                  data-testid={`button-import-campaign-${c.id}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <Button
            className="w-full bg-amber-700 hover:bg-amber-600"
            disabled={!campaignId || importing}
            onClick={handleImport}
            data-testid="button-confirm-import"
          >
            {importing ? <LoadingLogo className="h-4 w-4 mr-2" /> : null} Create Scene
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
