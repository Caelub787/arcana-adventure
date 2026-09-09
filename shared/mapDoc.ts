// The map document.
//
// A map is not a picture. It is a structured document: layers holding
// independent elements — stamps, paths, walls, shapes, text, lights, regions,
// doors, links — over a terrain mask and the materials painted onto it. An
// exported PNG is a rendering of this document; the document is the map.
//
// Everything here is shared between the editor and the server so that one
// definition of "what a map is" serves both, and so a map handed to a campaign
// arrives with its walls, doors, lights and grid still meaning something
// rather than baked into pixels.

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/**
 * What a layer is for. Art layers are drawn into the map image; VTT layers
 * carry interactive data the campaign reads and the export leaves out; GM
 * layers are both hidden from players and left out of a player-facing export.
 */
export const MAP_LAYER_KINDS = ["art", "vtt", "gm"] as const;
export type MapLayerKind = (typeof MAP_LAYER_KINDS)[number];

export interface MapLayerSeed {
  name: string;
  kind: MapLayerKind;
  /** Bottom of the stack first, the way the map is drawn. */
  sortOrder: number;
  locked?: boolean;
  visible?: boolean;
}

/**
 * The layers a new map starts with, bottom to top.
 *
 * The art half is ordered the way a map reads: ground, then what sits on it,
 * then what stands on that, then what is written over the whole thing. The
 * VTT half is not drawn at all - it is the data a campaign needs to make the
 * map playable, and it is why this editor exists inside a VTT rather than
 * beside one.
 */
export const DEFAULT_MAP_LAYERS: MapLayerSeed[] = [
  { name: "Terrain", kind: "art", sortOrder: 0 },
  { name: "Terrain Details", kind: "art", sortOrder: 1 },
  { name: "Vegetation", kind: "art", sortOrder: 2 },
  { name: "Buildings", kind: "art", sortOrder: 3 },
  { name: "Props", kind: "art", sortOrder: 4 },
  { name: "Labels", kind: "art", sortOrder: 5 },
  { name: "Grid", kind: "vtt", sortOrder: 6 },
  { name: "Walls", kind: "vtt", sortOrder: 7 },
  { name: "Lighting", kind: "vtt", sortOrder: 8 },
  { name: "Regions", kind: "vtt", sortOrder: 9 },
  { name: "GM Only", kind: "gm", sortOrder: 10 },
];

/** Where a newly placed element of each kind belongs, by layer name. */
export const DEFAULT_LAYER_FOR_KIND: Record<MapElementKind, string> = {
  stamp: "Props",
  path: "Terrain Details",
  shape: "Terrain Details",
  text: "Labels",
  wall: "Walls",
  door: "Walls",
  light: "Lighting",
  region: "Regions",
  link: "Labels",
};

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export const MAP_ELEMENT_KINDS = [
  "stamp",
  "path",
  "wall",
  "shape",
  "text",
  "light",
  "region",
  "door",
  "link",
] as const;
export type MapElementKind = (typeof MAP_ELEMENT_KINDS)[number];

export interface MapPoint {
  x: number;
  y: number;
}

/** A placed piece of art from the asset library. */
export interface StampData {
  stampAssetId: string;
  /** Overrides the map-wide variant index for this one object. */
  variantIndex?: number | null;
  shadow?: ShadowSpec | null;
}

export interface ShadowSpec {
  enabled: boolean;
  /** Degrees clockwise from "down the screen". */
  angle: number;
  distance: number;
  blur: number;
  opacity: number;
}

/**
 * A road, a river, a border, a trail. One tool: the difference between them is
 * width, colour, texture and end caps, not a different kind of object.
 */
export interface PathData {
  points: MapPoint[];
  /** 0 = straight segments between points, 1 = a fully smoothed spline. */
  smoothing: number;
  width: number;
  color: string;
  /** A material key from the texture library, drawn along the path instead of a flat colour. */
  texture?: string | null;
  dash?: number[] | null;
  /** Narrows towards the far end - rivers running to a source, roads to a track. */
  taper?: number;
  capStart?: "flat" | "round";
  capEnd?: "flat" | "round";
  preset?: string | null;
}

/**
 * An architectural run of wall. Vector geometry that is also, optionally, the
 * campaign's collision and vision blocking - which is the whole point of
 * drawing walls in a map editor that lives inside a VTT.
 */
export interface WallData {
  points: MapPoint[];
  thickness: number;
  color: string;
  texture?: string | null;
  blocksMovement: boolean;
  blocksVision: boolean;
  /** Metres or feet, per the map's own units; used by sight lines, not drawing. */
  height?: number | null;
}

export interface ShapeData {
  shape: "rect" | "roundedRect" | "ellipse" | "polygon";
  /** For polygons; rect and ellipse use the element's own box. */
  points?: MapPoint[];
  cornerRadius?: number;
  fill?: string | null;
  fillTexture?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
}

export interface TextData {
  text: string;
  font: string;
  size: number;
  weight: number;
  align: "left" | "center" | "right";
  color: string;
  letterSpacing?: number;
  lineHeight?: number;
  outline?: { color: string; width: number } | null;
  /** Presets (Continent, Kingdom, River…) only set these fields; there is no separate label type. */
  preset?: string | null;
  /**
   * Whether the label grows with the map or stays a readable size as the
   * camera zooms - which matters once the map is being played on.
   */
  scaleWithMap: boolean;
}

export interface LightData {
  kind: "point" | "cone" | "area" | "ambient";
  color: string;
  /** In map units, the same ones the grid is calibrated in. */
  bright: number;
  dim: number;
  intensity: number;
  /** Cone lights only. */
  angle?: number;
  direction?: number;
  flicker?: boolean;
}

export interface RegionData {
  points: MapPoint[];
  color: string;
  description?: string;
  /** What being inside it does, for the campaign to act on. */
  movementMultiplier?: number | null;
  music?: string | null;
  ambience?: string | null;
  gmNotes?: string;
}

export interface DoorData {
  /** Doors sit on a wall run; a door with no wall still works as a standalone. */
  wallElementId?: string | null;
  state: "closed" | "open" | "locked" | "secret";
  blocksMovement: boolean;
  blocksVision: boolean;
  /** Optional art; a door with none is drawn as a gap marker. */
  stampAssetId?: string | null;
}

/**
 * A point of interest that goes somewhere: a note in the campaign's knowledge
 * base, a character, or another map. This is what turns a world map into a way
 * of getting around rather than a picture of one.
 */
export interface LinkData {
  label: string;
  target:
    | { kind: "note"; noteId: string }
    | { kind: "character"; characterId: string }
    | { kind: "map"; mapId: string }
    | { kind: "none" };
  icon?: string | null;
}

export type MapElementData =
  | ({ kind: "stamp" } & StampData)
  | ({ kind: "path" } & PathData)
  | ({ kind: "wall" } & WallData)
  | ({ kind: "shape" } & ShapeData)
  | ({ kind: "text" } & TextData)
  | ({ kind: "light" } & LightData)
  | ({ kind: "region" } & RegionData)
  | ({ kind: "door" } & DoorData)
  | ({ kind: "link" } & LinkData);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SHADOW: ShadowSpec = {
  enabled: false,
  angle: 135,
  distance: 6,
  blur: 8,
  opacity: 0.35,
};

/**
 * What each kind of element is when it is first made. Every tool starts from
 * one of these, so a road drawn today and a road drawn next month agree.
 */
export function defaultElementData(kind: MapElementKind): Record<string, any> {
  switch (kind) {
    case "stamp":
      return { stampAssetId: "", variantIndex: null, shadow: null };
    case "path":
      return {
        points: [], smoothing: 0.6, width: 24, color: "#7a6a4f",
        texture: null, dash: null, taper: 0, capStart: "round", capEnd: "round", preset: null,
      } satisfies PathData;
    case "wall":
      return {
        points: [], thickness: 8, color: "#2b2622", texture: null,
        blocksMovement: true, blocksVision: true, height: null,
      } satisfies WallData;
    case "shape":
      return {
        shape: "rect", cornerRadius: 0, fill: "#5a5148",
        fillTexture: null, stroke: null, strokeWidth: 0,
      } satisfies ShapeData;
    case "text":
      return {
        text: "Label", font: "Cinzel, serif", size: 48, weight: 600, align: "center",
        color: "#f5ecd8", letterSpacing: 2, lineHeight: 1.15, outline: null,
        preset: null, scaleWithMap: true,
      } satisfies TextData;
    case "light":
      return {
        kind: "point", color: "#ffb066", bright: 20, dim: 40,
        intensity: 1, flicker: false,
      } satisfies LightData;
    case "region":
      return { points: [], color: "#4fa3ff", description: "", movementMultiplier: null, music: null, ambience: null, gmNotes: "" } satisfies RegionData;
    case "door":
      return { wallElementId: null, state: "closed", blocksMovement: true, blocksVision: true, stampAssetId: null } satisfies DoorData;
    case "link":
      return { label: "New marker", target: { kind: "none" }, icon: null } satisfies LinkData;
  }
}

/**
 * Text presets change how a label looks and nothing else - they are not a
 * different kind of object, so a Kingdom can be restyled into a River without
 * being deleted and remade.
 */
export const TEXT_PRESETS: Record<string, Partial<TextData>> = {
  continent: { size: 96, weight: 700, letterSpacing: 14, color: "#f3e6c8" },
  kingdom: { size: 64, weight: 700, letterSpacing: 8, color: "#f0dfba" },
  city: { size: 40, weight: 600, letterSpacing: 3, color: "#f5ecd8" },
  village: { size: 28, weight: 500, letterSpacing: 2, color: "#e8dcc4" },
  mountains: { size: 44, weight: 600, letterSpacing: 6, color: "#d8cdb6" },
  river: { size: 30, weight: 400, letterSpacing: 4, color: "#bcd8e6" },
  ocean: { size: 72, weight: 500, letterSpacing: 16, color: "#a8cfe0" },
  poi: { size: 24, weight: 600, letterSpacing: 1, color: "#f5ecd8" },
};

/** Same idea for paths: one tool, several looks. */
export const PATH_PRESETS: Record<string, Partial<PathData>> = {
  road: { width: 26, color: "#8a7554", smoothing: 0.7, taper: 0 },
  trail: { width: 10, color: "#9c8a68", smoothing: 0.8, dash: [14, 10] },
  river: { width: 30, color: "#4a7f9e", smoothing: 0.9, taper: 0.6 },
  border: { width: 6, color: "#c9a227", smoothing: 0.3, dash: [18, 12] },
  route: { width: 8, color: "#b4623a", smoothing: 0.5, dash: [4, 12] },
  cliff: { width: 34, color: "#5f584c", smoothing: 0.5 },
};

// ---------------------------------------------------------------------------
// Grid and measurement
// ---------------------------------------------------------------------------

export const MAP_GRID_TYPES = ["none", "square", "hexH", "hexV", "isometric"] as const;
export type MapGridType = (typeof MAP_GRID_TYPES)[number];

export interface MapGrid {
  type: MapGridType;
  size: number;
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
  lineWidth: number;
  /** Every Nth line drawn heavier; 0 turns it off. */
  major: number;
  snap: boolean;
  /** What one cell is worth in the world, so distances mean something in play. */
  unitsPerCell: number;
  unitLabel: string;
}

export const DEFAULT_MAP_GRID: MapGrid = {
  type: "square",
  size: 50,
  offsetX: 0,
  offsetY: 0,
  color: "#000000",
  opacity: 0.25,
  lineWidth: 1,
  major: 0,
  snap: true,
  unitsPerCell: 5,
  unitLabel: "ft",
};

export function normalizeGrid(value: unknown): MapGrid {
  const v = (value ?? {}) as Partial<MapGrid>;
  const type = (MAP_GRID_TYPES as readonly string[]).includes(String(v.type))
    ? (v.type as MapGridType)
    : DEFAULT_MAP_GRID.type;
  const num = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? n : fallback);
  return {
    type,
    size: Math.max(4, num(v.size, DEFAULT_MAP_GRID.size)),
    offsetX: num(v.offsetX, 0),
    offsetY: num(v.offsetY, 0),
    color: typeof v.color === "string" ? v.color : DEFAULT_MAP_GRID.color,
    opacity: Math.min(1, Math.max(0, num(v.opacity, DEFAULT_MAP_GRID.opacity))),
    lineWidth: Math.max(0.25, num(v.lineWidth, 1)),
    major: Math.max(0, Math.floor(num(v.major, 0))),
    snap: v.snap !== false,
    unitsPerCell: Math.max(0.01, num(v.unitsPerCell, DEFAULT_MAP_GRID.unitsPerCell)),
    unitLabel: typeof v.unitLabel === "string" && v.unitLabel ? v.unitLabel : DEFAULT_MAP_GRID.unitLabel,
  };
}

// ---------------------------------------------------------------------------
// Map styles
// ---------------------------------------------------------------------------

/**
 * A style is a starting point, not a different file format: it picks the
 * canvas, the grid and which asset packs come to hand. Every map is the same
 * kind of document underneath, so one editor serves all of them.
 */
export interface MapStyle {
  key: string;
  label: string;
  blurb: string;
  width: number;
  height: number;
  grid: Partial<MapGrid>;
  /** Asset pack keys surfaced first in the stamp browser. */
  packs: string[];
}

export const MAP_STYLES: MapStyle[] = [
  {
    key: "world", label: "World / Region", blurb: "Continents, coastlines and kingdoms.",
    width: 4000, height: 3000, grid: { type: "none", unitsPerCell: 50, unitLabel: "mi" },
    packs: ["terrain", "mountains", "forest", "settlements"],
  },
  {
    key: "city", label: "City", blurb: "Streets, districts and buildings.",
    width: 3000, height: 3000, grid: { type: "none", unitsPerCell: 20, unitLabel: "ft" },
    packs: ["buildings", "streets", "props"],
  },
  {
    key: "battlemap", label: "Battlemap", blurb: "A tactical encounter on a grid.",
    width: 2400, height: 1800, grid: { type: "square", size: 50, unitsPerCell: 5, unitLabel: "ft" },
    packs: ["dungeon", "furniture", "nature", "props"],
  },
  {
    key: "dungeon", label: "Dungeon / Interior", blurb: "Rooms, corridors and doors.",
    width: 2400, height: 1800, grid: { type: "square", size: 50, unitsPerCell: 5, unitLabel: "ft" },
    packs: ["dungeon", "furniture", "traps", "props"],
  },
  {
    key: "blank", label: "Blank", blurb: "Nothing assumed.",
    width: 2000, height: 1500, grid: { type: "square", size: 50, unitsPerCell: 5, unitLabel: "ft" },
    packs: [],
  },
];

export function mapStyle(key: string | null | undefined): MapStyle {
  return MAP_STYLES.find((s) => s.key === key) ?? MAP_STYLES[MAP_STYLES.length - 1];
}

// ---------------------------------------------------------------------------
// Z-order
// ---------------------------------------------------------------------------

export interface ZOrdered {
  id: string;
  zIndex: number;
}

/**
 * Reorder within a layer. Returns only the rows whose z actually changed, so a
 * "bring forward" is one or two writes rather than renumbering everything.
 */
export function reorderZ<T extends ZOrdered>(
  siblings: T[],
  ids: string[],
  move: "forward" | "backward" | "front" | "back",
): Array<{ id: string; zIndex: number }> {
  const ordered = [...siblings].sort((a, b) => a.zIndex - b.zIndex);
  const moving = new Set(ids);
  const picked = ordered.filter((o) => moving.has(o.id));
  if (picked.length === 0) return [];
  const rest = ordered.filter((o) => !moving.has(o.id));

  let next: T[];
  if (move === "front") next = [...rest, ...picked];
  else if (move === "back") next = [...picked, ...rest];
  else {
    next = [...ordered];
    const step = move === "forward" ? 1 : -1;
    // Walk the moving items from the end they are heading towards, so a
    // multi-selection keeps its own internal order instead of shuffling.
    const order = move === "forward" ? [...next].reverse() : next;
    for (const item of order) {
      if (!moving.has(item.id)) continue;
      const i = next.indexOf(item);
      const j = i + step;
      if (j < 0 || j >= next.length) continue;
      if (moving.has(next[j].id)) continue;
      next.splice(i, 1);
      next.splice(j, 0, item);
    }
  }

  const changes: Array<{ id: string; zIndex: number }> = [];
  next.forEach((item, i) => {
    if (item.zIndex !== i) changes.push({ id: item.id, zIndex: i });
  });
  return changes;
}
