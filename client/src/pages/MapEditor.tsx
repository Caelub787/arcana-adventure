// Map Maker editor — Inkarnate-inspired: a bounded map "sheet" you paint
// textured terrain onto and scatter/place asset stamps over, organized
// into layers, navigated with cursor/touch-anchored pan/zoom. Fundamentals:
//   - Terrain has two modes: a freehand textured brush, and a vector Land
//     Shape tool (tap points around a landmass, close it, and it's smoothed
//     into a soft ink-outlined coastline and filled with the chosen
//     texture) — the actual mechanic Inkarnate maps are recognizable by,
//     not a raster blob. Both bake onto the active paint layer, which
//     "Generate Terrain" can also fill in one shot from a noise heightmap.
//   - Painting reveals a single large, already-tiled texture image (per
//     terrain kind + scale) rather than stamping independent copies per
//     dab/shape — every tool samples the SAME cached source canvas at
//     world-aligned coordinates, so grain never shows a seam or a
//     repeated-stamp look no matter how strokes overlap.
//   - Layers come in three types: one fixed Background (always water,
//     bottom of the stack), any number of Paint layers (each own canvas,
//     opacity + blend-mode effects, terrain tools always target the
//     active one), and any number of Stamp layers (each with visibility +
//     an active one new placements land in). Everything is flattened into
//     one raster on Save/Import — layer structure itself is session-only.
//   - A single "Assets" tool places stamp instances: a quick tap drops one,
//     a drag scatters several with jittered position/rotation/scale along
//     the stroke — Inkarnate's mechanic for both single buildings and
//     tree/mountain clusters.
//   - Every stamp instance also renders the variant at the map's
//     activeVariantIndex from its own asset's variant list — pressing V
//     cycles that one number so a whole map's placed stamps can flip
//     state together (e.g. "village" -> "village on fire") without
//     touching position, rotation, or size.
//   - Touch: one finger drives the active tool (paint/place/select); two
//     fingers pan and pinch-zoom, mirroring how Procreate/Photoshop split
//     drawing from navigation on a touchscreen. Desktop keeps
//     shift/middle/right-drag to pan and scroll-to-zoom (cursor-anchored).
//   - "Import to Campaign" flattens background + visible paint layers +
//     visible-layer stamps into one PNG and creates a brand new Scene — a
//     one-way export, the source Map stays independently editable after.
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
  Undo2, Grid3x3, Layers as LayersIcon, PaintBucket, Plus, Trash2,
} from "lucide-react";
import { api, type StampAsset, type MapObject } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LoadingLogo } from "@/components/LoadingLogo";
import { TERRAIN_KINDS, type TerrainKind, type TerrainBand, getTerrainPattern, getFullSizeTerrainTexture, floodFillTerrain, paintSoftDab, fillSmoothPathFeathered, renderOrganicTerrain } from "@/components/mapmaker/terrainTextures";
import { traceSmoothClosedPath, traceSmoothOpenPath, type Point } from "@/components/mapmaker/pathSmoothing";

type Tool = 'terrain' | 'assets' | 'select';
type TerrainMode = 'brush' | 'shape' | 'path' | 'bucket';
type PathKind = 'river' | 'road';
type MobileSheet = null | 'terrain' | 'assets' | 'select' | 'layers';

// Canvas globalCompositeOperation names that double as valid CSS
// mix-blend-mode values, except 'source-over' (canvas) <-> 'normal' (CSS) —
// CSS_BLEND_MODE below bridges that one mismatch for live on-screen display.
type BlendMode = 'source-over' | 'multiply' | 'overlay' | 'soft-light' | 'screen' | 'darken' | 'lighten';
const BLEND_MODES: { mode: BlendMode; label: string }[] = [
  { mode: 'source-over', label: 'Normal' },
  { mode: 'multiply', label: 'Multiply' },
  { mode: 'overlay', label: 'Overlay' },
  { mode: 'soft-light', label: 'Soft Light' },
  { mode: 'screen', label: 'Screen' },
  { mode: 'darken', label: 'Darken' },
  { mode: 'lighten', label: 'Lighten' },
];
const CSS_BLEND_MODE: Record<BlendMode, React.CSSProperties['mixBlendMode']> = {
  'source-over': 'normal',
  multiply: 'multiply',
  overlay: 'overlay',
  'soft-light': 'soft-light',
  screen: 'screen',
  darken: 'darken',
  lighten: 'lighten',
};

interface PaintLayer {
  id: string;
  name: string;
  opacity: number; // 0-100
  blendMode: BlendMode;
  visible: boolean;
}
interface StampLayerDef {
  key: string;
  label: string;
}

const DEFAULT_STAMP_LAYERS: StampLayerDef[] = [
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

// Builds a single elevation field (0..1) that "Generate Terrain" classifies
// into biome bands. Combines: a base fractal-noise landmass at the chosen
// feature size, an optional domain warp (offsetting sample coordinates by
// a second noise field) for non-radial, organic coastlines instead of
// blobby noise contours, and an optional min() blend with a higher-frequency
// "detail" field that carves inlets/channels into a landmass — the standard
// way to turn one big blob into a fragmented island chain — rather than
// just uniformly shrinking it.
function makeElevationFn(opts: {
  seed: number;
  featureSize: number;
  islandFragmentation: number; // 0..1
  coastlineRoughness: number; // 0..1
}) {
  const baseNoise = makeNoise2D(opts.seed);
  const warpNoiseX = makeNoise2D(opts.seed + 1000);
  const warpNoiseY = makeNoise2D(opts.seed + 2000);
  const detailNoise = makeNoise2D(opts.seed + 3000);
  const baseScale = 1 / Math.max(20, opts.featureSize);
  const warpAmount = opts.coastlineRoughness * opts.featureSize * 0.5;
  const detailScale = baseScale * (2.5 + opts.islandFragmentation * 7);

  return (worldX: number, worldY: number) => {
    const warpX = worldX + (fractalNoise(warpNoiseX, worldX * baseScale * 0.6, worldY * baseScale * 0.6) - 0.5) * 2 * warpAmount;
    const warpY = worldY + (fractalNoise(warpNoiseY, worldX * baseScale * 0.6, worldY * baseScale * 0.6) - 0.5) * 2 * warpAmount;
    let e = fractalNoise(baseNoise, warpX * baseScale, warpY * baseScale);
    if (opts.islandFragmentation > 0) {
      const detail = fractalNoise(detailNoise, warpX * detailScale, warpY * detailScale);
      const carved = Math.min(e, detail);
      e = e * (1 - opts.islandFragmentation) + carved * opts.islandFragmentation;
    }
    return e;
  };
}

type GenScaleKey = 'world' | 'continent' | 'region' | 'city';
const GEN_SCALE_PRESETS: { key: GenScaleKey; label: string; featureSize: number }[] = [
  { key: 'world', label: 'World Map', featureSize: 3000 },
  { key: 'continent', label: 'Continent', featureSize: 1200 },
  { key: 'region', label: 'Region', featureSize: 500 },
  { key: 'city', label: 'City / Local', featureSize: 150 },
];

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const UNDO_LIMIT = 8;

function pillClass(active: boolean) {
  return `px-2.5 py-1 rounded text-xs border ${active ? 'bg-amber-900/30 text-amber-200 border-amber-700' : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'}`;
}

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
  const [terrainMode, setTerrainMode] = useState<TerrainMode>('brush');
  const [terrainKind, setTerrainKind] = useState<TerrainKind>('grass');
  const [pathKind, setPathKind] = useState<PathKind>('river');
  const [brushSize, setBrushSize] = useState(50);
  // 0 = hard edge, 100 = maximally feathered — mirrors Inkarnate's brush
  // "softness" control, applied to the freehand brush's dabs and to the
  // land-shape/river-road fill edges alike.
  const [softness, setSoftness] = useState(55);
  // How large the tiled source texture is drawn before it's revealed by
  // brush/shape/bucket — a bigger scale means bigger, more zoomed-in grain.
  const [textureScale, setTextureScale] = useState(1);
  const [genOpen, setGenOpen] = useState(false);
  const [genScale, setGenScale] = useState<GenScaleKey>('continent');
  const [genFeatureSize, setGenFeatureSize] = useState(GEN_SCALE_PRESETS[1].featureSize);
  const [genLandAmount, setGenLandAmount] = useState(55);
  const [genFragmentation, setGenFragmentation] = useState(25);
  const [genRoughness, setGenRoughness] = useState(40);
  const [shapePoints, setShapePointsState] = useState<Point[]>([]);
  const shapePointsRef = useRef<Point[]>([]);
  const setShapePoints = useCallback((next: Point[]) => {
    shapePointsRef.current = next;
    setShapePointsState(next);
  }, []);
  const [selectedStampAssetId, setSelectedStampAssetId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  const [paintLayers, setPaintLayers] = useState<PaintLayer[]>([
    { id: 'land', name: 'Land', opacity: 100, blendMode: 'source-over', visible: true },
  ]);
  const [activePaintLayerId, setActivePaintLayerId] = useState('land');

  const [stampLayers, setStampLayers] = useState<StampLayerDef[]>(DEFAULT_STAMP_LAYERS);
  const [activeStampLayer, setActiveStampLayer] = useState('structures');
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DEFAULT_STAMP_LAYERS.map((l) => [l.key, true]))
  );

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.4);
  const [hasFitOnce, setHasFitOnce] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const imgRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  const isPaintingRef = useRef(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const scatterRef = useRef<{ lastX: number; lastY: number; lastTime: number; placedAny: boolean } | null>(null);
  const dragRef = useRef<null | { mode: 'move' | 'rotate' | 'resize'; id: string; startX: number; startY: number; orig: MapObject }>(null);
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<null | { startDist: number; startMid: { x: number; y: number }; startZoom: number; startPan: { x: number; y: number } }>(null);
  const undoStackRef = useRef<{ layerId: string; snap: ImageData }[]>([]);
  const dabScratchRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));

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

  // Fill the background with water once, and (for maps saved before the
  // layer rework) draw the old flattened terrain image onto the default
  // "Land" paint layer so existing maps still open looking the same.
  useEffect(() => {
    if (!map || loadedTerrainFor === map.id) return;
    const bg = bgCanvasRef.current;
    const land = paintCanvasRefs.current.get('land');
    if (!bg || !land) return;
    const bgCtx = bg.getContext('2d');
    if (bgCtx) {
      bgCtx.fillStyle = getTerrainPattern(bgCtx, 'water');
      bgCtx.fillRect(0, 0, bg.width, bg.height);
    }
    if (map.terrainImage) {
      const landCtx = land.getContext('2d');
      if (landCtx) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => landCtx.drawImage(img, 0, 0, land.width, land.height);
        img.src = map.terrainImage;
      }
    }
    setShowGrid(map.mapType === 'battle');
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

  const pushUndoSnapshot = (layerId: string = activePaintLayerId) => {
    const canvas = paintCanvasRefs.current.get(layerId);
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    try {
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStackRef.current.push({ layerId, snap });
      if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
      setUndoCount(undoStackRef.current.length);
    } catch { /* ignore */ }
  };

  const handleUndo = () => {
    const entry = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    if (!entry) return;
    const canvas = paintCanvasRefs.current.get(entry.layerId);
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.putImageData(entry.snap, 0, 0);
  };

  // Paints dense, overlapping SOFT dabs — each revealing a piece of the
  // same large cached source texture at its world-aligned position, rather
  // than a freshly-stamped tile copy — so a drag reads as one continuous,
  // seamlessly painted material instead of gapped or repeated-looking
  // circles. lastPaintPosRef is null at the start of a stroke (pointerdown)
  // so the first call just drops a single dab.
  const lastPaintPosRef = useRef<{ x: number; y: number } | null>(null);
  const paintAt = (x: number, y: number) => {
    if (!map) return;
    const canvas = paintCanvasRefs.current.get(activePaintLayerId);
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const sourceTexture = getFullSizeTerrainTexture(terrainKind, map.width, map.height, textureScale);
    const last = lastPaintPosRef.current;
    if (!last) {
      paintSoftDab(ctx, x, y, brushSize, sourceTexture, softness, dabScratchRef.current);
    } else {
      const dist = Math.hypot(x - last.x, y - last.y);
      const spacing = Math.max(2, brushSize * 0.18);
      const steps = Math.max(1, Math.round(dist / spacing));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        paintSoftDab(ctx, last.x + (x - last.x) * t, last.y + (y - last.y) * t, brushSize, sourceTexture, softness, dabScratchRef.current);
      }
    }
    lastPaintPosRef.current = { x, y };
  };

  const finishTerrainPoints = () => {
    const points = shapePointsRef.current;
    const canvas = paintCanvasRefs.current.get(activePaintLayerId);
    if (!canvas) { setShapePoints([]); return; }
    const ctx = canvas.getContext('2d')!;
    const softnessPx = 1 + (softness / 100) * 10;
    if (terrainMode === 'shape') {
      if (points.length < 3) { setShapePoints([]); return; }
      pushUndoSnapshot();
      fillSmoothPathFeathered(ctx, (c) => traceSmoothClosedPath(c, points), points, terrainKind, true, 0, softnessPx, textureScale);
    } else if (terrainMode === 'path') {
      if (points.length < 2) { setShapePoints([]); return; }
      pushUndoSnapshot();
      fillSmoothPathFeathered(ctx, (c) => traceSmoothOpenPath(c, points), points, pathKind === 'river' ? 'water' : 'road', false, brushSize, softnessPx, textureScale);
    }
    setShapePoints([]);
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
      layer: activeStampLayer,
    });
  };

  // --- pointer interaction on the world container ---
  const handleContainerPointerDown = (e: React.PointerEvent) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      // Second finger down: switch to two-finger pan/zoom, abort whatever
      // the first finger was doing.
      isPaintingRef.current = false;
      scatterRef.current = null;
      dragRef.current = null;
      tapStartRef.current = null;
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      pinchRef.current = { startDist: dist, startMid: mid, startZoom: zoom, startPan: pan };
      return;
    }
    if (activePointersRef.current.size > 2) return;

    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    if (e.button !== 0) return;

    if (tool === 'terrain' && (terrainMode === 'shape' || terrainMode === 'path' || terrainMode === 'bucket')) {
      tapStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = toWorld(e.clientX, e.clientY);
    if (tool === 'terrain') {
      pushUndoSnapshot();
      isPaintingRef.current = true;
      lastPaintPosRef.current = null;
      paintAt(x, y);
    } else if (tool === 'assets' && selectedStampAssetId) {
      scatterRef.current = { lastX: x, lastY: y, lastTime: performance.now(), placedAny: false };
      placeStamp(x, y, false);
    } else {
      setSelectedObjectId(null);
    }
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (activePointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const scaleFactor = dist / Math.max(1, pinchRef.current.startDist);
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.startZoom * scaleFactor));
      const rect = viewportRef.current!.getBoundingClientRect();
      const startMidLocal = { x: pinchRef.current.startMid.x - rect.left, y: pinchRef.current.startMid.y - rect.top };
      const worldAtStart = {
        x: (startMidLocal.x - pinchRef.current.startPan.x) / pinchRef.current.startZoom,
        y: (startMidLocal.y - pinchRef.current.startPan.y) / pinchRef.current.startZoom,
      };
      const midLocal = { x: mid.x - rect.left, y: mid.y - rect.top };
      setZoom(newZoom);
      setPan({ x: midLocal.x - worldAtStart.x * newZoom, y: midLocal.y - worldAtStart.y * newZoom });
      return;
    }
    if (activePointersRef.current.size >= 2) return;

    if (isPanningRef.current) {
      setPan({ x: panStartRef.current.panX + (e.clientX - panStartRef.current.x), y: panStartRef.current.panY + (e.clientY - panStartRef.current.y) });
      return;
    }
    if (isPaintingRef.current && tool === 'terrain' && terrainMode === 'brush') {
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

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    const wasTap = !!tapStartRef.current && Math.hypot(e.clientX - tapStartRef.current.x, e.clientY - tapStartRef.current.y) < 10;
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;

    if (wasTap && tool === 'terrain' && (terrainMode === 'shape' || terrainMode === 'path')) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const prev = shapePointsRef.current;
      if (terrainMode === 'shape' && prev.length >= 3 && Math.hypot(x - prev[0].x, y - prev[0].y) < 20 / zoom) {
        finishTerrainPoints();
      } else {
        setShapePoints([...prev, { x, y }]);
      }
    } else if (wasTap && tool === 'terrain' && terrainMode === 'bucket') {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const canvas = paintCanvasRefs.current.get(activePaintLayerId);
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        pushUndoSnapshot();
        floodFillTerrain(ctx, x, y, terrainKind, textureScale);
      }
    }
    tapStartRef.current = null;

    isPanningRef.current = false;
    isPaintingRef.current = false;
    lastPaintPosRef.current = null;
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
  // variant state, Ctrl/Cmd+Z undoes the last terrain edit, Escape cancels
  // an in-progress land shape — all ignored while typing in a field.
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
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Escape' && shapePointsRef.current.length > 0) {
        setShapePoints([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedObjectId, maxVariantCount]);

  const runGenerate = () => {
    const canvas = paintCanvasRefs.current.get(activePaintLayerId);
    if (!map || !canvas) return;
    pushUndoSnapshot();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const elevationAt = makeElevationFn({
      seed: Math.random() * 100000,
      featureSize: genFeatureSize,
      islandFragmentation: genFragmentation / 100,
      coastlineRoughness: genRoughness / 100,
    });
    const seaLevel = 1 - genLandAmount / 100;
    const landRange = Math.max(0.05, genLandAmount / 100);
    const bands: TerrainBand[] = [
      { kind: 'water', max: seaLevel },
      { kind: 'sand', max: seaLevel + landRange * 0.08 },
      { kind: 'grass', max: seaLevel + landRange * 0.45 },
      { kind: 'forest', max: seaLevel + landRange * 0.72 },
      { kind: 'stone', max: seaLevel + landRange * 0.90 },
      { kind: 'snow', max: 1 },
    ];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderOrganicTerrain(ctx, map.width, map.height, elevationAt, bands, textureScale, 4);
  };

  // Composites background + visible paint layers (respecting each layer's
  // opacity/blend-mode effect) into one flattened canvas. Shared by Save
  // (terrain only) and flattenToDataUrl (which adds stamps on top).
  const flattenTerrainCanvas = (): HTMLCanvasElement | null => {
    if (!map) return null;
    const bg = bgCanvasRef.current;
    if (!bg) return null;
    const out = document.createElement('canvas');
    out.width = map.width;
    out.height = map.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bg, 0, 0);
    for (const layer of paintLayers) {
      if (!layer.visible) continue;
      const canvas = paintCanvasRefs.current.get(layer.id);
      if (!canvas) continue;
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = layer.blendMode;
      ctx.drawImage(canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return out;
  };

  const handleSave = async () => {
    if (!map) return;
    const flat = flattenTerrainCanvas();
    if (!flat) return;
    setSaving(true);
    try {
      const dataUrl = flat.toDataURL('image/png');
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
    if (!map) return null;
    const out = flattenTerrainCanvas();
    if (!out) return null;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
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

  const updatePaintLayer = (paintLayerId: string, patch: Partial<PaintLayer>) => {
    setPaintLayers((prev) => prev.map((l) => (l.id === paintLayerId ? { ...l, ...patch } : l)));
  };

  const addPaintLayer = () => {
    const name = window.prompt('New paint layer name?', `Paint Layer ${paintLayers.length + 1}`);
    if (!name || !name.trim()) return;
    const newId = `paint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPaintLayers((prev) => [...prev, { id: newId, name: name.trim(), opacity: 100, blendMode: 'source-over', visible: true }]);
    setActivePaintLayerId(newId);
  };

  const removePaintLayer = (paintLayerId: string) => {
    if (paintLayers.length <= 1) return;
    const remaining = paintLayers.filter((l) => l.id !== paintLayerId);
    setPaintLayers(remaining);
    paintCanvasRefs.current.delete(paintLayerId);
    if (activePaintLayerId === paintLayerId) setActivePaintLayerId(remaining[0]?.id ?? '');
  };

  const addStampLayer = () => {
    const name = window.prompt('New stamp layer name?', `Stamp Layer ${stampLayers.length + 1}`);
    if (!name || !name.trim()) return;
    const key = `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setStampLayers((prev) => [...prev, { key, label: name.trim() }]);
    setLayerVisibility((prev) => ({ ...prev, [key]: true }));
    setActiveStampLayer(key);
  };

  const removeStampLayer = (key: string) => {
    if (stampLayers.length <= 1 || (objectCountByLayer[key] ?? 0) > 0) return;
    const remaining = stampLayers.filter((l) => l.key !== key);
    setStampLayers(remaining);
    if (activeStampLayer === key) setActiveStampLayer(remaining[0]?.key ?? '');
  };

  if (mapQuery.isError) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-stone-400 gap-3 px-4 text-center">
        <p className="text-red-400">Couldn't load this map.</p>
        <p className="text-xs text-stone-500 max-w-sm">{(mapQuery.error as any)?.message || "The server didn't respond as expected — it may still be deploying, or the map may not exist."}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="border-stone-700" onClick={() => mapQuery.refetch()} data-testid="button-retry-load-map">
            Try Again
          </Button>
          <Button variant="outline" className="border-stone-700" onClick={() => setLocation('/maps')} data-testid="button-back-to-maps">
            Back to Maps
          </Button>
        </div>
      </div>
    );
  }

  if (mapQuery.isLoading || !map) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-stone-400">
        <LoadingLogo className="h-6 w-6 mr-2" /> Loading map...
      </div>
    );
  }

  const visibleObjects = [...objects].filter((o) => layerVisibility[o.layer] !== false).sort((a, b) => a.zIndex - b.zIndex);
  const activePaintLayer = paintLayers.find((l) => l.id === activePaintLayerId);

  const terrainFlyoutContent = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-2">Terrain</p>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <button className={pillClass(terrainMode === 'brush')} onClick={() => { setTerrainMode('brush'); setShapePoints([]); }} data-testid="button-terrain-mode-brush">Brush</button>
        <button className={pillClass(terrainMode === 'shape')} onClick={() => { setTerrainMode('shape'); setShapePoints([]); }} data-testid="button-terrain-mode-shape">Land Shape</button>
        <button className={pillClass(terrainMode === 'path')} onClick={() => { setTerrainMode('path'); setShapePoints([]); }} data-testid="button-terrain-mode-path">River/Road</button>
        <button className={pillClass(terrainMode === 'bucket')} onClick={() => { setTerrainMode('bucket'); setShapePoints([]); }} data-testid="button-terrain-mode-bucket">Fill</button>
      </div>
      <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Painting On</p>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {paintLayers.map((l) => (
          <button key={l.id} className={pillClass(activePaintLayerId === l.id)} onClick={() => setActivePaintLayerId(l.id)} data-testid={`button-active-paint-layer-${l.id}`}>
            {l.name}
          </button>
        ))}
      </div>
      {terrainMode !== 'path' && (
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {TERRAIN_KINDS.filter((t) => t.kind !== 'road').map(({ kind, label }) => (
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
      )}
      <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Texture Scale</p>
      <Slider min={0.5} max={3} step={0.1} value={[textureScale]} onValueChange={([v]) => setTextureScale(v)} data-testid="slider-texture-scale" />
      <p className="text-xs text-stone-500 mt-1 mb-3">{textureScale.toFixed(1)}x</p>
      {terrainMode === 'brush' && (
        <>
          <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Brush Size</p>
          <Slider min={10} max={200} step={5} value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} />
          <p className="text-xs text-stone-500 mt-1 mb-2">{brushSize}px</p>
          <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Softness</p>
          <Slider min={0} max={100} step={5} value={[softness]} onValueChange={([v]) => setSoftness(v)} data-testid="slider-softness" />
          <p className="text-xs text-stone-500 mt-1">{softness}%</p>
        </>
      )}
      {terrainMode === 'shape' && (
        <>
          <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Edge Softness</p>
          <Slider min={0} max={100} step={5} value={[softness]} onValueChange={([v]) => setSoftness(v)} data-testid="slider-softness" />
          <p className="text-xs text-stone-500 mt-1 mb-2">{softness}%</p>
          <p className="text-xs text-stone-500 mb-2">Tap to place points around a landmass. Tap near your first point (or press Finish) to close it into a smooth coastline.</p>
          {shapePoints.length > 0 && (
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1 bg-emerald-800 hover:bg-emerald-700" onClick={finishTerrainPoints} disabled={shapePoints.length < 3} data-testid="button-finish-land-shape">
                Finish ({shapePoints.length})
              </Button>
              <Button size="sm" variant="outline" className="border-stone-700" onClick={() => setShapePoints([])} data-testid="button-cancel-land-shape">
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
      {terrainMode === 'path' && (
        <>
          <div className="flex gap-1.5 mb-3">
            <button className={pillClass(pathKind === 'river')} onClick={() => setPathKind('river')} data-testid="button-path-kind-river">River</button>
            <button className={pillClass(pathKind === 'road')} onClick={() => setPathKind('road')} data-testid="button-path-kind-road">Road</button>
          </div>
          <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Width</p>
          <Slider min={8} max={120} step={2} value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} />
          <p className="text-xs text-stone-500 mt-1 mb-2">{brushSize}px</p>
          <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Edge Softness</p>
          <Slider min={0} max={100} step={5} value={[softness]} onValueChange={([v]) => setSoftness(v)} data-testid="slider-softness" />
          <p className="text-xs text-stone-500 mt-1 mb-2">{softness}%</p>
          <p className="text-xs text-stone-500 mb-2">Tap to place points along the {pathKind}. Press Finish when done — it won't auto-close like a land shape.</p>
          {shapePoints.length > 0 && (
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1 bg-emerald-800 hover:bg-emerald-700" onClick={finishTerrainPoints} disabled={shapePoints.length < 2} data-testid="button-finish-path">
                Finish ({shapePoints.length})
              </Button>
              <Button size="sm" variant="outline" className="border-stone-700" onClick={() => setShapePoints([])} data-testid="button-cancel-path">
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
      {terrainMode === 'bucket' && (
        <p className="text-xs text-stone-500">Tap anywhere on the terrain to flood-fill that connected region with the selected texture — it stops at the edge of whatever's already painted there, so it respects land shapes, rivers, and other fills already on the map.</p>
      )}
    </>
  );

  const assetsFlyoutContent = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-2">Assets</p>
      <div className="grid grid-cols-4 md:grid-cols-3 gap-1.5 mb-3">
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
      <p className="text-xs text-stone-500 mt-1 mb-2">Tap to place one, drag to scatter a cluster.</p>
      <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Placing into</p>
      <p className="text-xs text-amber-400">{stampLayers.find((l) => l.key === activeStampLayer)?.label}</p>
    </>
  );

  const selectInfoContent = (
    <p className="text-xs text-stone-500">Tap a stamp to select it. Drag its body to move, the top handle to rotate, the corner handle to resize. Delete/Backspace removes it. Press V anytime to cycle the map's variant state.</p>
  );

  const layersContent = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Background</p>
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-stone-400 border border-stone-800 mb-3">
        <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: '#2a5f8f' }} />
        <span className="flex-1">Water (fixed)</span>
      </div>

      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-stone-500">Paint Layers</p>
        <button className="text-stone-400 hover:text-amber-400" onClick={addPaintLayer} title="Add paint layer" data-testid="button-add-paint-layer">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2 mb-3">
        {paintLayers.map((l) => (
          <div
            key={l.id}
            className={`rounded px-2 py-1.5 border cursor-pointer ${activePaintLayerId === l.id ? 'bg-amber-900/30 border-amber-700/60' : 'border-stone-800 hover:bg-stone-800'}`}
            onClick={() => setActivePaintLayerId(l.id)}
            data-testid={`paint-layer-row-${l.id}`}
          >
            <div className="flex items-center gap-1.5 text-sm">
              <button
                className="text-stone-400 hover:text-white shrink-0"
                onClick={(e) => { e.stopPropagation(); updatePaintLayer(l.id, { visible: !l.visible }); }}
                data-testid={`button-toggle-paint-layer-${l.id}`}
              >
                {l.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <span className={`flex-1 truncate ${activePaintLayerId === l.id ? 'text-amber-300' : 'text-stone-300'}`}>{l.name}</span>
              {paintLayers.length > 1 && (
                <button
                  className="text-stone-500 hover:text-red-400 shrink-0"
                  onClick={(e) => { e.stopPropagation(); removePaintLayer(l.id); }}
                  data-testid={`button-remove-paint-layer-${l.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] text-stone-500 w-10 shrink-0">{l.opacity}%</span>
              <Slider min={0} max={100} step={5} value={[l.opacity]} onValueChange={([v]) => updatePaintLayer(l.id, { opacity: v })} data-testid={`slider-paint-layer-opacity-${l.id}`} />
            </div>
            <select
              className="mt-1.5 w-full bg-stone-900 border border-stone-700 rounded text-xs text-stone-300 px-1.5 py-1"
              value={l.blendMode}
              onChange={(e) => updatePaintLayer(l.id, { blendMode: e.target.value as BlendMode })}
              onClick={(e) => e.stopPropagation()}
              data-testid={`select-paint-layer-blend-${l.id}`}
            >
              {BLEND_MODES.map((b) => <option key={b.mode} value={b.mode}>{b.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-stone-500">Stamp Layers</p>
        <button className="text-stone-400 hover:text-amber-400" onClick={addStampLayer} title="Add stamp layer" data-testid="button-add-stamp-layer">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        {stampLayers.map((l) => (
          <div
            key={l.key}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-sm ${activeStampLayer === l.key ? 'bg-amber-900/30 text-amber-300 border border-amber-700/60' : 'text-stone-300 border border-transparent hover:bg-stone-800'}`}
            onClick={() => setActiveStampLayer(l.key)}
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
            {stampLayers.length > 1 && (objectCountByLayer[l.key] ?? 0) === 0 && (
              <button
                className="text-stone-500 hover:text-red-400 shrink-0"
                onClick={(e) => { e.stopPropagation(); removeStampLayer(l.key); }}
                data-testid={`button-remove-stamp-layer-${l.key}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-stone-600 mt-3">Tap a layer to place new assets into it. The eye toggles visibility on the canvas and in exports. Layer structure (not the art) resets if you leave without saving.</p>
    </>
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-stone-100 flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-stone-950 border-b border-stone-800 overflow-x-auto flex-nowrap shrink-0 z-20">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/maps')} className="text-stone-400 hover:text-white shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          key={map.id}
          defaultValue={map.name}
          onBlur={(e) => { if (e.target.value.trim() && e.target.value !== map.name) updateMapMutation.mutate({ name: e.target.value.trim() }); }}
          className="h-8 w-28 sm:w-48 bg-stone-900 border-stone-700 text-sm shrink-0"
          data-testid="input-map-name"
        />
        <div className="w-px h-6 bg-stone-800 mx-1 shrink-0" />
        <Button size="sm" variant="outline" className="border-stone-700 shrink-0" onClick={handleUndo} disabled={undoCount === 0} title="Undo (Ctrl/Cmd+Z)" data-testid="button-undo">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className={`border-stone-700 shrink-0 ${showGrid ? 'text-amber-400 border-amber-700' : ''}`} onClick={() => setShowGrid((v) => !v)} title="Toggle battle-map grid" data-testid="button-toggle-grid">
          <Grid3x3 className="h-3.5 w-3.5" />
        </Button>
        <Input
          key={`grid-${map.id}`}
          type="number"
          min={5}
          max={500}
          defaultValue={map.gridSize}
          onBlur={(e) => {
            const parsed = Math.round(Number(e.target.value));
            const next = Number.isFinite(parsed) ? Math.max(5, Math.min(500, parsed)) : map.gridSize;
            e.target.value = String(next);
            if (next !== map.gridSize) updateMapMutation.mutate({ gridSize: next });
          }}
          title="Grid cell size in pixels — carried over exactly when you import this map as a Scene, so tokens line up"
          className="h-8 w-16 bg-stone-900 border-stone-700 text-xs px-1.5 shrink-0"
          data-testid="input-grid-size"
        />
        <Button size="sm" variant="outline" className="border-stone-700 shrink-0" onClick={() => setGenOpen(true)} title={`Generate onto: ${activePaintLayer?.name ?? ''}`} data-testid="button-generate-terrain">
          <Wand2 className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Generate</span>
        </Button>
        <Button
          size="sm" variant="outline" className="border-stone-700 shrink-0"
          onClick={() => { const next = (activeVariantIndex + 1) % Math.max(1, maxVariantCount); setActiveVariantIndex(next); updateMapMutation.mutate({ activeVariantIndex: next }); }}
          title="Cycle variant state (hotkey: V)"
          data-testid="button-cycle-variant"
        >
          <RefreshCw className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Variant {activeVariantIndex + 1}/{maxVariantCount}</span>
        </Button>
        <div className="flex-1 min-w-2" />
        <Button size="sm" variant="outline" className="border-stone-700 shrink-0" onClick={fitToScreen} title="Fit to screen" data-testid="button-fit-screen">
          <Maximize className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="border-stone-700 shrink-0" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.85)}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <span className="text-xs text-stone-500 w-10 text-center shrink-0">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="outline" className="border-stone-700 shrink-0" onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.15)}><ZoomIn className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="outline" className="border-stone-700 shrink-0" onClick={() => setImportOpen(true)} data-testid="button-import-scene">
          <Upload className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Import</span>
        </Button>
        <Button size="sm" className="bg-emerald-800 hover:bg-emerald-700 shrink-0" onClick={handleSave} disabled={saving} data-testid="button-save-map">
          {saving ? <LoadingLogo className="h-3.5 w-3.5 sm:mr-1" /> : <Save className="h-3.5 w-3.5 sm:mr-1" />} <span className="hidden sm:inline">Save</span>
        </Button>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {/* Desktop icon rail */}
        <div className="hidden md:flex w-12 bg-stone-950 border-r border-stone-800 flex-col items-center py-2 gap-1 shrink-0">
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

        {/* Desktop contextual flyout panel */}
        <div className="hidden md:block w-48 bg-stone-950 border-r border-stone-800 p-2 overflow-y-auto shrink-0">
          {tool === 'terrain' && terrainFlyoutContent}
          {tool === 'assets' && assetsFlyoutContent}
          {tool === 'select' && selectInfoContent}
        </div>

        {/* Canvas viewport */}
        <div
          ref={viewportRef}
          className="flex-1 relative overflow-hidden bg-[#141414] cursor-crosshair touch-none"
          style={{ backgroundImage: 'radial-gradient(#2a2a2a 1px, transparent 1px)', backgroundSize: '24px 24px', touchAction: 'none' }}
          onPointerDown={handleContainerPointerDown}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
          onPointerCancel={handleContainerPointerUp}
          onPointerLeave={handleContainerPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.08 : 0.93); }}
        >
          <div
            style={{ position: 'absolute', left: 0, top: 0, width: map.width, height: map.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.6)' }}
          >
            <canvas ref={bgCanvasRef} width={map.width} height={map.height} className="absolute left-0 top-0" />
            {paintLayers.map((l) => (
              <canvas
                key={l.id}
                ref={(el) => { if (el) paintCanvasRefs.current.set(l.id, el); else paintCanvasRefs.current.delete(l.id); }}
                width={map.width}
                height={map.height}
                className="absolute left-0 top-0"
                style={{ opacity: l.visible ? l.opacity / 100 : 0, mixBlendMode: CSS_BLEND_MODE[l.blendMode] }}
              />
            ))}
            {showGrid && (
              <svg className="absolute left-0 top-0 pointer-events-none" width={map.width} height={map.height}>
                {Array.from({ length: Math.ceil(map.width / map.gridSize) + 1 }).map((_, i) => (
                  <line key={`v${i}`} x1={i * map.gridSize} y1={0} x2={i * map.gridSize} y2={map.height} stroke="rgba(255,255,255,0.25)" strokeWidth={1 / zoom} />
                ))}
                {Array.from({ length: Math.ceil(map.height / map.gridSize) + 1 }).map((_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * map.gridSize} x2={map.width} y2={i * map.gridSize} stroke="rgba(255,255,255,0.25)" strokeWidth={1 / zoom} />
                ))}
              </svg>
            )}
            {shapePoints.length > 0 && (
              <svg className="absolute left-0 top-0 pointer-events-none" width={map.width} height={map.height}>
                <polyline
                  points={shapePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="#fbbf24" strokeWidth={3 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                />
                {shapePoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={7 / zoom} fill={i === 0 ? '#f59e0b' : '#fde68a'} stroke="#78350f" strokeWidth={1.5 / zoom} />
                ))}
              </svg>
            )}
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
                        className="absolute -top-6 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-amber-400 cursor-alias touch-none"
                        onPointerDown={(e) => startObjectDrag(e, obj, 'rotate')}
                        data-testid={`handle-rotate-${obj.id}`}
                      />
                      <div
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-amber-400 cursor-nwse-resize touch-none"
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

        {/* Desktop layers panel */}
        <div className="hidden md:block w-52 bg-stone-950 border-l border-stone-800 p-2 overflow-y-auto shrink-0">
          {layersContent}
        </div>
      </div>

      {/* Mobile bottom sheet + tab bar */}
      <div className="md:hidden shrink-0">
        {mobileSheet && (
          <div className="max-h-[42vh] overflow-y-auto bg-stone-950 border-t border-stone-800 p-3" data-testid="mobile-sheet">
            {mobileSheet === 'terrain' && terrainFlyoutContent}
            {mobileSheet === 'assets' && assetsFlyoutContent}
            {mobileSheet === 'select' && selectInfoContent}
            {mobileSheet === 'layers' && layersContent}
          </div>
        )}
        <div className="h-14 bg-stone-950 border-t border-stone-800 flex items-stretch justify-around">
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${tool === 'terrain' ? 'text-amber-400' : 'text-stone-400'}`}
            onClick={() => { setTool('terrain'); setMobileSheet((s) => (s === 'terrain' ? null : 'terrain')); }}
            data-testid="button-mobile-tool-terrain"
          >
            <Mountain className="h-5 w-5" />
            <span className="text-[10px]">Terrain</span>
          </button>
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${tool === 'assets' ? 'text-amber-400' : 'text-stone-400'}`}
            onClick={() => { setTool('assets'); setMobileSheet((s) => (s === 'assets' ? null : 'assets')); }}
            data-testid="button-mobile-tool-assets"
          >
            <Trees className="h-5 w-5" />
            <span className="text-[10px]">Assets</span>
          </button>
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${tool === 'select' ? 'text-amber-400' : 'text-stone-400'}`}
            onClick={() => { setTool('select'); setMobileSheet((s) => (s === 'select' ? null : 'select')); }}
            data-testid="button-mobile-tool-select"
          >
            <MousePointer2 className="h-5 w-5" />
            <span className="text-[10px]">Select</span>
          </button>
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${mobileSheet === 'layers' ? 'text-amber-400' : 'text-stone-400'}`}
            onClick={() => setMobileSheet((s) => (s === 'layers' ? null : 'layers'))}
            data-testid="button-mobile-tool-layers"
          >
            <LayersIcon className="h-5 w-5" />
            <span className="text-[10px]">Layers</span>
          </button>
        </div>
      </div>

      <ImportToSceneDialog open={importOpen} onOpenChange={setImportOpen} mapName={map.name} onFlatten={flattenToDataUrl} mapId={map.id} />
      <GenerateTerrainDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        targetLayerName={activePaintLayer?.name ?? ''}
        scale={genScale}
        onScaleChange={(key, featureSize) => { setGenScale(key); setGenFeatureSize(featureSize); }}
        featureSize={genFeatureSize}
        onFeatureSizeChange={setGenFeatureSize}
        landAmount={genLandAmount}
        onLandAmountChange={setGenLandAmount}
        fragmentation={genFragmentation}
        onFragmentationChange={setGenFragmentation}
        roughness={genRoughness}
        onRoughnessChange={setGenRoughness}
        onGenerate={runGenerate}
      />
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

function GenerateTerrainDialog({
  open, onOpenChange, targetLayerName,
  scale, onScaleChange, featureSize, onFeatureSizeChange,
  landAmount, onLandAmountChange, fragmentation, onFragmentationChange,
  roughness, onRoughnessChange, onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetLayerName: string;
  scale: GenScaleKey;
  onScaleChange: (key: GenScaleKey, featureSize: number) => void;
  featureSize: number;
  onFeatureSizeChange: (v: number) => void;
  landAmount: number;
  onLandAmountChange: (v: number) => void;
  fragmentation: number;
  onFragmentationChange: (v: number) => void;
  roughness: number;
  onRoughnessChange: (v: number) => void;
  onGenerate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-stone-200">Generate Terrain</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-stone-500">Generates onto the active paint layer ({targetLayerName || 'none'}), using the same textures as the brush. Adjust and press Generate again for a new variation.</p>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1.5">Map Scale</p>
            <div className="grid grid-cols-2 gap-1.5">
              {GEN_SCALE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  className={pillClass(scale === p.key)}
                  onClick={() => onScaleChange(p.key, p.featureSize)}
                  data-testid={`button-gen-scale-${p.key}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Feature Size</p>
            <Slider min={50} max={4000} step={25} value={[featureSize]} onValueChange={([v]) => onFeatureSizeChange(v)} data-testid="slider-gen-feature-size" />
            <p className="text-xs text-stone-500 mt-1">{featureSize}px — how large a single landmass/region reads, independent of the preset above</p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Land Amount</p>
            <Slider min={5} max={95} step={5} value={[landAmount]} onValueChange={([v]) => onLandAmountChange(v)} data-testid="slider-gen-land-amount" />
            <p className="text-xs text-stone-500 mt-1">{landAmount}% land, {100 - landAmount}% water</p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Islands / Fragmentation</p>
            <Slider min={0} max={100} step={5} value={[fragmentation]} onValueChange={([v]) => onFragmentationChange(v)} data-testid="slider-gen-fragmentation" />
            <p className="text-xs text-stone-500 mt-1">{fragmentation === 0 ? "One solid landmass" : `${fragmentation}% — breaks land into islands/archipelago`}</p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Coastline Roughness</p>
            <Slider min={0} max={100} step={5} value={[roughness]} onValueChange={([v]) => onRoughnessChange(v)} data-testid="slider-gen-roughness" />
            <p className="text-xs text-stone-500 mt-1">{roughness}% — how jagged vs. smooth the coastline is</p>
          </div>

          <Button className="w-full bg-amber-700 hover:bg-amber-600" onClick={onGenerate} data-testid="button-run-generate-terrain">
            <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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
