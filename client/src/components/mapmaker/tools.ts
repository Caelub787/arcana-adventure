// What the map editor's toolbar offers, and what each tool opens beside it.
//
// The rule this encodes: the toolbar chooses the editing MODE, and the side
// panel changes completely to match. One giant properties panel holding every
// control at once is how a map editor becomes unusable at the point it becomes
// capable, so each tool gets its own panel and nothing else is on screen.
//
// Select is first and is the default, deliberately. Opening a map on a tool
// that paints means the first stray click edits the map.

export const MAP_TOOLS = [
  "select",
  "terrain",
  "texture",
  "stamp",
  "path",
  "wall",
  "shape",
  "text",
  "grid",
  "light",
  "vtt",
] as const;
export type MapTool = (typeof MAP_TOOLS)[number];

export interface MapToolDef {
  key: MapTool;
  label: string;
  /** One line, shown on hover: what this tool is for, not what it is called. */
  hint: string;
  /** Single-key shortcut, the way every editor of this kind works. */
  shortcut: string;
  /** Whether using it changes the map. Select doesn't, which is why it is safe to open on. */
  destructive: boolean;
  /** Which kind of element it makes, for the tools that make one. */
  creates?: string;
}

export const MAP_TOOL_DEFS: MapToolDef[] = [
  { key: "select", label: "Select", hint: "Move, resize, rotate and reorder what is already there", shortcut: "V", destructive: false },
  { key: "terrain", label: "Terrain", hint: "Where land and floor exist - paint it in, cut it away", shortcut: "T", destructive: true },
  { key: "texture", label: "Texture", hint: "What those surfaces look like: grass, stone, snow, sand", shortcut: "B", destructive: true },
  { key: "stamp", label: "Stamps", hint: "Place art from the library - trees, buildings, furniture", shortcut: "S", destructive: true, creates: "stamp" },
  { key: "path", label: "Path", hint: "Roads, rivers, trails and borders as editable curves", shortcut: "P", destructive: true, creates: "path" },
  { key: "wall", label: "Wall", hint: "Architectural walls that can also block movement and sight", shortcut: "W", destructive: true, creates: "wall" },
  { key: "shape", label: "Shape", hint: "Rooms, platforms, pools and zones", shortcut: "R", destructive: true, creates: "shape" },
  { key: "text", label: "Text", hint: "Labels for continents, cities, rivers and points of interest", shortcut: "X", destructive: true, creates: "text" },
  { key: "grid", label: "Grid", hint: "Cell size, offset and what one square is worth in the world", shortcut: "G", destructive: false },
  { key: "light", label: "Lighting", hint: "Torches and lanterns that light the map and the campaign alike", shortcut: "L", destructive: true, creates: "light" },
  { key: "vtt", label: "Play data", hint: "Doors, regions and links - what the map does once it is in play", shortcut: "D", destructive: true },
];

export const DEFAULT_MAP_TOOL: MapTool = "select";

export function mapToolDef(key: MapTool): MapToolDef {
  return MAP_TOOL_DEFS.find((t) => t.key === key) ?? MAP_TOOL_DEFS[0];
}

/**
 * The tool a single keypress selects, or null if that key isn't one.
 *
 * Deliberately ignores anything with a modifier held and anything typed into a
 * field - a map full of labels means the editor is a text editor half the
 * time, and "t" should type a t.
 */
export function toolForKey(
  key: string,
  opts: { ctrl?: boolean; meta?: boolean; alt?: boolean; typing?: boolean } = {},
): MapTool | null {
  if (opts.ctrl || opts.meta || opts.alt || opts.typing) return null;
  const upper = key.toUpperCase();
  return MAP_TOOL_DEFS.find((t) => t.shortcut === upper)?.key ?? null;
}
