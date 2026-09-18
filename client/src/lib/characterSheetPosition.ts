// Per-device, per-character saved position for character sheet floating
// panels, mirroring hotbarPosition.ts's pattern. A character sheet opens at
// wherever it was last dragged to on THIS device rather than a fixed
// cascading spot, so moving it "sticks" the way the hotbar's own position
// already does.
export interface CharacterSheetPosition {
  x: number;
  y: number;
}

const STORAGE_KEY_PREFIX = "arcana_char_sheet_position_";

export function getCharacterSheetPosition(characterId: string): CharacterSheetPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + characterId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

export function setCharacterSheetPosition(characterId: string, pos: CharacterSheetPosition) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + characterId, JSON.stringify(pos));
  } catch {
    // ignore (private browsing / storage full)
  }
}
