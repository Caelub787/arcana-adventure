// Cultivator's Adventure (C.A.) — a fresh, independent 4th game system.
// Nothing in this file is imported from or exported to shared/v3.ts (or any
// other system's constants) — C.A. starts as an editable copy of ideas from
// other systems where the user asked for that, but must stay fully
// independent so future edits to either system never affect the other.

// ---------------------------------------------------------------------------
// Wounds — replaces HP entirely for C.A. 6 slots, each with 1 "major" wound
// and 3 "minor" wounds. Purely narrative/GM-discretion tracking, no
// mechanical HP derivation.
// ---------------------------------------------------------------------------

export interface CAWoundEntry {
  checked: boolean;
  injury: string;
  effect: string;
}

export interface CAWoundSlot {
  label: string;
  major: CAWoundEntry;
  minor: CAWoundEntry[]; // always length 3
}

export const CA_WOUND_SLOT_COUNT = 6;
export const CA_WOUND_MINOR_PER_SLOT = 3;
export const CA_WOUND_TOTAL_BOXES = CA_WOUND_SLOT_COUNT * (1 + CA_WOUND_MINOR_PER_SLOT);

function emptyWoundEntry(): CAWoundEntry {
  return { checked: false, injury: "", effect: "" };
}

export function makeEmptyCAWounds(): CAWoundSlot[] {
  return Array.from({ length: CA_WOUND_SLOT_COUNT }, (_, i) => ({
    label: `Wound ${i + 1}`,
    major: emptyWoundEntry(),
    minor: Array.from({ length: CA_WOUND_MINOR_PER_SLOT }, () => emptyWoundEntry()),
  }));
}

// Tolerates missing/malformed data (e.g. a character predating this column,
// or a slot count that doesn't match if this ever changes) by falling back
// to a fresh empty set rather than throwing.
export function normalizeCAWounds(raw: unknown): CAWoundSlot[] {
  if (!Array.isArray(raw) || raw.length !== CA_WOUND_SLOT_COUNT) {
    return makeEmptyCAWounds();
  }
  return raw.map((slot: any, i: number) => ({
    label: typeof slot?.label === "string" ? slot.label : `Wound ${i + 1}`,
    major: normalizeWoundEntry(slot?.major),
    minor: Array.from({ length: CA_WOUND_MINOR_PER_SLOT }, (_, j) =>
      normalizeWoundEntry(slot?.minor?.[j])
    ),
  }));
}

function normalizeWoundEntry(raw: any): CAWoundEntry {
  return {
    checked: !!raw?.checked,
    injury: typeof raw?.injury === "string" ? raw.injury : "",
    effect: typeof raw?.effect === "string" ? raw.effect : "",
  };
}

export function caWoundCount(wounds: unknown): number {
  const normalized = normalizeCAWounds(wounds);
  let count = 0;
  for (const slot of normalized) {
    if (slot.major.checked) count++;
    for (const m of slot.minor) if (m.checked) count++;
  }
  return count;
}
