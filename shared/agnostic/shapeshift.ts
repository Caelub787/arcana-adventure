/**
 * Shapeshifting: one creature, several sheets.
 *
 * A druid who becomes a bear is not one sheet with a bear mode — the bear has
 * its own health, its own values, its own rolls. So each form is an ordinary
 * sheet, and what ties them together is an ability: tick **Shapeshifting** on
 * it, give it a number, and every character or beast holding an ability with
 * that same number is another form of the same creature.
 *
 * Nothing is connected by hand. Give the bear a copy of the ability with the
 * same number and it joins; change the number, or take the ability off, and it
 * leaves. Whoever plays one form plays all of them, and shifting carries the
 * state of the creature — not the numbers, the *share* of them: at 1 of 10
 * health you come out of the shift at 10 of 100, still as badly hurt as you
 * were.
 */

/** Tick this on an ability and it shapeshifts. */
export const SHIFT_KEY = "shapeshift";
/** Which creature: every form with the same number is the same one. 0 = not set. */
export const SHIFT_GROUP_KEY = "shift_group";
/** The kinds of sheet a creature can wear. */
export const SHIFT_FORM_TYPES = ["character", "npc", "beast"];
/** How deep a chain of abilities-inside-abilities is followed. */
const DEPTH = 4;

/** What a shift carries over: the share of each pool, in order of importance. */
export const SHIFT_POOLS: Array<{ value: string; max: string; label: string }> = [
  { value: "hp", max: "hp_max", label: "Health" },
  { value: "energy", max: "usable_energy", label: "Energy" },
  { value: "focus", max: "focus_max", label: "Focus" },
];

/**
 * The same wound in a bigger body. A tenth of your health left is a tenth of
 * your health left, whichever shape you are in — so 1 of 10 becomes 10 of 100,
 * and dead stays dead.
 */
export function carryPool(current: number, fromMax: number, toMax: number): number {
  if (!Number.isFinite(toMax) || toMax <= 0) return Math.max(0, Math.round(current));
  if (!Number.isFinite(fromMax) || fromMax <= 0) return Math.max(0, Math.min(Math.round(current), Math.round(toMax)));
  if (current <= 0) return 0;
  const share = Math.min(1, current / fromMax);
  return Math.max(1, Math.min(Math.round(toMax), Math.round(toMax * share)));
}

/** Everything the rules need to know about a scope, from either side of the wire. */
export interface ShiftWorld {
  /** Every sheet, in no particular order. */
  ids(): string[];
  type(id: string): string | undefined;
  isTemplate(id: string): boolean;
  /** A plain value on a sheet by key (its effective value, if there is one). */
  value(id: string, key: string): unknown;
  /** Sheets reached from this one by a connection label, either way round. */
  linked(id: string, label: string): string[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const on = (v: unknown): boolean => v === true || v === 1 || v === "true";

/** The number an ability shapeshifts by, or 0 if it doesn't (or hasn't been given one). */
export function abilityGroup(w: ShiftWorld, abilityId: string): number {
  if (!on(w.value(abilityId, SHIFT_KEY))) return 0;
  return Math.round(num(w.value(abilityId, SHIFT_GROUP_KEY)));
}

/** Every ability a sheet holds, including the ones held inside other abilities. */
export function abilitiesOf(w: ShiftWorld, sheetId: string): string[] {
  const seen = new Set<string>();
  let level = [sheetId];
  for (let d = 0; d < DEPTH && level.length; d++) {
    const next: string[] = [];
    for (const id of level) for (const to of w.linked(id, "abilities")) {
      if (seen.has(to)) continue;
      seen.add(to);
      next.push(to);
    }
    level = next;
  }
  return [...Array.from(seen)];
}

/** The creature a sheet belongs to: its number, or 0 if it isn't a form of anything. */
export function groupOfSheet(w: ShiftWorld, sheetId: string): number {
  for (const a of abilitiesOf(w, sheetId)) {
    const g = abilityGroup(w, a);
    if (g) return g;
  }
  return 0;
}

/**
 * The creature a sheet is about, from wherever you ask: the ability itself, one
 * of its aspects, or the character holding it.
 */
export function groupOf(w: ShiftWorld, noteId: string): number {
  const type = w.type(noteId);
  if (!type) return 0;
  const direct = abilityGroup(w, noteId);
  if (direct) return direct;
  if (type === "aspect") {
    for (const ability of w.linked(noteId, "ability")) {
      const g = abilityGroup(w, ability);
      if (g) return g;
      // An aspect of an ability held inside another ability.
      for (const up of w.linked(ability, "holder")) { const h = groupOf(w, up); if (h) return h; }
    }
    return 0;
  }
  if (type === "ability") {
    // Not itself a shapeshifter, but held by one (an ability inside the ability).
    for (const up of w.linked(noteId, "holder")) { const g = groupOfSheet(w, up); if (g) return g; }
    return 0;
  }
  return groupOfSheet(w, noteId);
}

/** Every creature in a scope at once: which form belongs to which number. */
export interface ShiftIndex {
  /** Sheet → the creature it's a form of. */
  group: Map<string, number>;
  /** Creature → its forms. */
  forms: Map<number, string[]>;
}

/**
 * Walk it from the abilities rather than the sheets: a scope has a handful of
 * shapeshifting abilities and hundreds of sheets, and only the abilities say
 * anything.
 */
export function shiftIndex(w: ShiftWorld): ShiftIndex {
  const group = new Map<string, number>();
  const forms = new Map<number, string[]>();
  for (const id of w.ids()) {
    if (w.type(id) !== "ability") continue;
    const g = abilityGroup(w, id);
    if (!g) continue;
    // Up to whoever holds it — through any abilities it sits inside.
    const seen = new Set<string>([id]);
    let level = [id];
    for (let d = 0; d < DEPTH && level.length; d++) {
      const next: string[] = [];
      for (const cur of level) for (const up of w.linked(cur, "holder")) {
        if (seen.has(up)) continue;
        seen.add(up);
        if (w.isTemplate(up)) continue;
        if (SHIFT_FORM_TYPES.includes(w.type(up) ?? "")) {
          if (!group.has(up)) group.set(up, g);
          if (group.get(up) === g) {
            const list = forms.get(g) ?? [];
            if (!list.includes(up)) { list.push(up); forms.set(g, list); }
          }
          continue;
        }
        next.push(up);
      }
      level = next;
    }
  }
  return { group, forms };
}

/** Every form of one creature: the sheets it can be, in name order where the caller sorts them. */
export function formsOf(w: ShiftWorld, group: number): string[] {
  if (!group) return [];
  return shiftIndex(w).forms.get(group) ?? [];
}

/** Are these two sheets forms of the same creature? */
export function sameCreature(w: ShiftWorld, a: string, b: string): boolean {
  if (a === b) return false;
  const g = groupOfSheet(w, a);
  return !!g && g === groupOfSheet(w, b);
}
