// Per-device saved position for the free hotbar (V3FreeHotbar). A plain
// localStorage point, deliberately not synced to the account - moving the
// hotbar on one device shouldn't relocate it on another.
export interface HotbarPosition {
  x: number;
  y: number;
}

const HOTBAR_POSITION_KEY = "arcana_free_hotbar_position";

export function getHotbarPosition(): HotbarPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(HOTBAR_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function setHotbarPosition(pos: HotbarPosition) {
  try {
    localStorage.setItem(HOTBAR_POSITION_KEY, JSON.stringify(pos));
  } catch {
    // ignore (private browsing / storage full)
  }
}

export function clearHotbarPosition() {
  try {
    localStorage.removeItem(HOTBAR_POSITION_KEY);
  } catch {
    // ignore
  }
}
