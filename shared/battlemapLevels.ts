// Battlemap levels: a scene can stack several floors (a basement, the ground,
// an upper storey, a rooftop...). Each level sits at an elevation in feet and
// can carry its own map image; walls, doors, windows, lights, vision zones
// and pins belong to one level, and a token's elevation decides which level
// it's standing on. What a viewer sees follows the level they're on.
//
// The ground level always exists. Its image is the scene's own background,
// so a scene with no extra levels behaves exactly as before.

export interface SceneLevel {
  id: string;
  name: string;
  /** Floor height in feet. The ground is 0; basements are negative. */
  elevation: number;
  /** Map image for this level, drawn over the levels below it. Ground uses the scene background. */
  image?: string | null;
  /** A solid floor hides every level beneath it while you stand on it. */
  solidFloor?: boolean;
}

export const BASE_LEVEL_ID = "base";

export function baseLevel(name?: string): SceneLevel {
  return { id: BASE_LEVEL_ID, name: name || "Ground", elevation: 0, image: null, solidFloor: false };
}

/** All of a scene's levels, ground included, lowest first. */
export function sceneLevels(raw: unknown): SceneLevel[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: SceneLevel[] = [];
  let base: SceneLevel | null = null;
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const id = typeof (r as any).id === "string" && (r as any).id ? String((r as any).id).slice(0, 64) : null;
    if (!id) continue;
    const lvl: SceneLevel = {
      id,
      name: String((r as any).name ?? "").slice(0, 60) || (id === BASE_LEVEL_ID ? "Ground" : "Level"),
      elevation: id === BASE_LEVEL_ID ? 0 : Number.isFinite(Number((r as any).elevation)) ? Math.round(Number((r as any).elevation) * 100) / 100 : 0,
      image: typeof (r as any).image === "string" && (r as any).image ? (r as any).image : null,
      solidFloor: !!(r as any).solidFloor,
    };
    if (id === BASE_LEVEL_ID) base = lvl;
    else if (!out.some((o) => o.id === id)) out.push(lvl);
  }
  out.push(base ?? baseLevel());
  // Ground wins a tie with another level at elevation 0.
  return out.sort((a, b) => a.elevation - b.elevation || (a.id === BASE_LEVEL_ID ? -1 : b.id === BASE_LEVEL_ID ? 1 : 0));
}

export function hasExtraLevels(raw: unknown): boolean {
  return sceneLevels(raw).length > 1;
}

export function findLevel(levels: SceneLevel[], id: string | null | undefined): SceneLevel {
  return levels.find((l) => l.id === (id || BASE_LEVEL_ID)) ?? levels.find((l) => l.id === BASE_LEVEL_ID) ?? levels[0];
}

/** The level a token at `elevation` feet stands on: the highest floor at or below it. */
export function levelForElevation(levels: SceneLevel[], elevation: number | null | undefined): SceneLevel {
  const e = Number(elevation) || 0;
  let best: SceneLevel | null = null;
  for (const l of levels) if (l.elevation <= e + 1e-6 && (!best || l.elevation >= best.elevation)) best = l;
  // Below every floor (deep underground with no basement level): the lowest one.
  return best ?? levels[0];
}

/** Whether something tagged with `itemLevelId` (null = ground) is on `levelId`. */
export function onLevel(itemLevelId: string | null | undefined, levelId: string | null | undefined): boolean {
  return (itemLevelId || BASE_LEVEL_ID) === (levelId || BASE_LEVEL_ID);
}

/** The id to store on a wall/door/light/etc. drawn while viewing `levelId` (ground stays null, as before levels). */
export function storedLevelId(levelId: string | null | undefined): string | null {
  return !levelId || levelId === BASE_LEVEL_ID ? null : levelId;
}

/**
 * The map images to draw for someone viewing `levelId`, bottom to top: every
 * level up to and including theirs, starting from the highest solid floor at
 * or below them (a solid floor hides what's under it). Levels above are never drawn.
 */
export function visibleLevelStack(levels: SceneLevel[], levelId: string | null | undefined): SceneLevel[] {
  const current = findLevel(levels, levelId);
  const below = levels.filter((l) => l.elevation <= current.elevation && l.id !== current.id);
  const stack = [...below, current];
  let start = 0;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].solidFloor && stack[i].id !== current.id) { start = i; break; }
  }
  // Standing on a solid floor yourself hides everything beneath you.
  if (current.solidFloor) return [current];
  return stack.slice(start);
}

/** A short label for an elevation, e.g. "+10 ft", "-5 ft". */
export function elevationLabel(elevation: number | null | undefined, unit = "ft"): string {
  const e = Math.round((Number(elevation) || 0) * 10) / 10;
  return `${e > 0 ? "+" : ""}${e} ${unit}`;
}

export function newLevelId(): string {
  return `lvl_${Math.random().toString(36).slice(2, 10)}`;
}
