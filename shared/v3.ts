// AA V3 canonical attribute + skill model.
// Shared between client and server so there is exactly one source of truth.

export type V3AttributeKey =
  | "might"
  | "finesse"
  | "constitution"
  | "will"
  | "anemos"
  | "intelligence";

export interface V3AttributeDef {
  key: V3AttributeKey;
  name: string;
  abbr: string;
}

export const V3_ATTRIBUTES: V3AttributeDef[] = [
  { key: "might",        name: "Might",        abbr: "MIG" },
  { key: "finesse",      name: "Finesse",      abbr: "FIN" },
  { key: "constitution", name: "Constitution", abbr: "CON" },
  { key: "will",         name: "Will",         abbr: "WIL" },
  { key: "anemos",       name: "Anemos",       abbr: "ANE" },
  { key: "intelligence", name: "Intelligence", abbr: "INT" },
];

export const V3_ATTRIBUTE_KEYS: V3AttributeKey[] = V3_ATTRIBUTES.map(a => a.key);

export interface V3SkillDef {
  key: string;
  name: string;
  parent: V3AttributeKey;
  description: string;
}

// Fixed canonical V3 skill list. The `key` is what we use in the
// per-character `v3Skills` JSON map and as a stable identifier.
export const V3_SKILLS: V3SkillDef[] = [
  // Might
  { key: "athletics",     name: "Athletics",     parent: "might",        description: "Climbing, jumping, swimming, and pure physical exertion." },
  // Finesse
  { key: "acrobatics",    name: "Acrobatics",    parent: "finesse",      description: "Balance, tumbling, and graceful body control." },
  { key: "stealth",       name: "Stealth",       parent: "finesse",      description: "Moving unseen and unheard." },
  { key: "sleightOfHand", name: "Sleight of Hand", parent: "finesse",    description: "Picking pockets, palming items, and fine manual trickery." },
  // Constitution
  { key: "endurance",     name: "Endurance",     parent: "constitution", description: "Resisting fatigue, holding your breath, marching for hours." },
  { key: "fortitude",     name: "Fortitude",     parent: "constitution", description: "Resisting poison, disease, and bodily afflictions." },
  { key: "perception",    name: "Perception",    parent: "constitution", description: "Noticing details with your physical senses." },
  // Will
  { key: "resolve",       name: "Resolve",       parent: "will",         description: "Resisting fear, charm, and mental coercion." },
  { key: "focus",         name: "Focus",         parent: "will",         description: "Maintaining concentration under pressure." },
  { key: "insight",       name: "Insight",       parent: "will",         description: "Reading intentions, lies, and subtle social cues." },
  // Anemos
  { key: "sense",         name: "Sense",         parent: "anemos",       description: "Sensing magic, spirits, and currents of the Anemos." },
  // Intelligence
  { key: "animalHandling", name: "Animal Handling", parent: "intelligence", description: "Taming, calming, and handling animals and beasts." },
  { key: "investigation", name: "Investigation", parent: "intelligence", description: "Deductive reasoning, sifting clues, recognizing patterns." },
  { key: "naturecraft",   name: "Nature",        parent: "intelligence", description: "Knowledge of plants, weather, terrain, and the wild." },
  { key: "survival",      name: "Survival",      parent: "intelligence", description: "Tracking, foraging, and surviving in hostile terrain." },
];

export const V3_SKILL_KEYS: string[] = V3_SKILLS.map(s => s.key);

// Default empty v3Skills map keyed by skill key, all zeros.
export function makeEmptyV3Skills(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of V3_SKILLS) out[s.key] = 0;
  return out;
}

// Attribute value -> die sides. Used for skill checks in V3:
// roll 1d{sides} + skillMod, instead of V2's flat d20 + skillMod + attrMod.
// 0 -> d6, 1 -> d8, 2 -> d10, 3 -> d12, 4+ -> d20.
export function attrValueToDieSides(value: number): number {
  const v = Math.max(0, Math.floor(value || 0));
  if (v <= 0) return 6;
  if (v === 1) return 8;
  if (v === 2) return 10;
  if (v === 3) return 12;
  return 20;
}

export function attrDieType(value: number): string {
  return `d${attrValueToDieSides(value)}`;
}

// Effective V3 skill modifier (Task #198): the base allocated skill value plus
// any permanent scroll boost stored in `characters.v3SkillBoosts`. Use this
// everywhere a V3 skill check is rolled so boosted skills affect gameplay.
export function v3EffectiveSkillMod(
  character: { v3Skills?: Record<string, number> | null; v3SkillBoosts?: Record<string, number> | null } | null | undefined,
  skillKey: string | null | undefined,
): number {
  if (!skillKey) return 0;
  const base = Math.floor(Number(character?.v3Skills?.[skillKey]) || 0);
  const boost = Math.floor(Number(character?.v3SkillBoosts?.[skillKey]) || 0);
  return base + boost;
}

// Level-up point budgets (AA V3 only) -----------------------------------------
//
// Attributes: 4 points at level 1, +1 every level divisible by 3.
//   budget = 4 + floor(level / 3). Attributes cannot go negative.
//   Species attribute bonuses are FREE and do not count against this budget.
// Skills: 8 points at level 1, +1 per level up.
//   budget = 8 + (level - 1). A skill can go as low as -2; negatives reclaim
//   points that can be spent elsewhere, up to a total of 6 reclaimed.

export function v3AttrPointBudget(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  return 4 + Math.floor(lv / 3);
}

export function v3SkillPointBudget(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  return 8 + (lv - 1);
}

// Maximum total points a player can reclaim by driving skills negative.
export const V3_MAX_NEGATIVE_SKILL_POINTS = 6;

// Default species jsonb shapes -------------------------------------------------

export type V3AttributeBonuses = Partial<Record<V3AttributeKey, number>>;

export interface V3SpeciesDefaultSkill {
  name: string;
  description?: string;
  parentAttribute: string;
  value: number;
}

export interface V3SpeciesDefaultTrait {
  name: string;
  description?: string;
  parentAttribute: string;
  usesPerLongRest: number;
}

// AA V3 armor boosts ----------------------------------------------------------
//
// In AA V3 armor no longer adds Defense Class or reduces damage by type.
// Instead, equipping a piece of armor boosts one or more of the wearer's
// attributes or skills. Each boost targets a single V3 attribute key OR a V3
// skill key (the two key spaces never collide) by an integer amount.

export interface V3ArmorBoost {
  target: string; // a V3 attribute key or a V3 skill key
  amount: number;
}

export interface V3BoostTarget {
  value: string;
  label: string;
  kind: "attribute" | "skill";
}

// Picker options for the armor-boost editor: the six attributes first, then the
// canonical skills alphabetically.
export const V3_BOOST_TARGETS: V3BoostTarget[] = [
  ...V3_ATTRIBUTES.map(a => ({ value: a.key, label: `${a.name} (Attribute)`, kind: "attribute" as const })),
  ...[...V3_SKILLS]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => ({ value: s.key, label: `${s.name} (Skill)`, kind: "skill" as const })),
];

const V3_ATTR_KEY_SET = new Set<string>(V3_ATTRIBUTE_KEYS);
const V3_SKILL_KEY_SET = new Set<string>(V3_SKILL_KEYS);

export function isV3AttributeKey(key: string): key is V3AttributeKey {
  return V3_ATTR_KEY_SET.has(key);
}

export function isV3SkillKey(key: string): boolean {
  return V3_SKILL_KEY_SET.has(key);
}

export function v3BoostTargetLabel(key: string): string {
  return V3_BOOST_TARGETS.find(t => t.value === key)?.label ?? key;
}

// Fold the boosts from a set of equipped armor items into a single map keyed by
// the boost target (attribute key or skill key). Used by the character sheet to
// apply boosts to die tiers / skill modifiers.
export function computeV3ArmorBoosts(
  equippedArmor: Array<{ v3ArmorBoosts?: V3ArmorBoost[] | null } | null | undefined>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const armor of equippedArmor) {
    const boosts = armor?.v3ArmorBoosts;
    if (!Array.isArray(boosts)) continue;
    for (const b of boosts) {
      if (!b || !b.target) continue;
      const amt = Math.trunc(Number(b.amount) || 0);
      if (!amt) continue;
      out[b.target] = (out[b.target] || 0) + amt;
    }
  }
  return out;
}

// AA V3 runes -----------------------------------------------------------------
//
// Runes are a V3-only socketable item type. An item exposes a number of rune
// slots based on its rarity; a socketed rune modifies the host item's stats
// and/or adds a usable skill-check action. Weapon-targeted runes add a stacking
// base-damage-level bonus to the host weapon (no extra mana).

// Number of rune slots an item exposes, keyed by rarity.
export const V3_RUNE_SLOTS_BY_RARITY: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export function v3RuneSlotCount(rarity: string | null | undefined): number {
  return V3_RUNE_SLOTS_BY_RARITY[(rarity || "common").toLowerCase()] ?? 0;
}

// Item types a rune can be configured to socket into. 'any' fits every item.
export interface V3RuneTargetOption {
  value: string;
  label: string;
}
export const V3_RUNE_TARGET_ITEM_TYPES: V3RuneTargetOption[] = [
  { value: "any", label: "Any item" },
  { value: "weapon", label: "Weapon" },
  { value: "armor", label: "Armor" },
  { value: "consumable", label: "Consumable" },
  { value: "utility", label: "Utility" },
  { value: "container", label: "Container" },
];

// Host-item stats a rune can modify while socketed. Each maps to a numeric
// column on the items table; the aggregated deltas are applied additively.
export interface V3RuneStatTarget {
  value: string;
  label: string;
}
// Only columns that actually exist on the `items` table — a socketed rune
// writes its delta onto the host column (reverted on removal), so an unknown
// key would crash the Drizzle update.
export const V3_RUNE_STAT_TARGETS: V3RuneStatTarget[] = [
  { value: "carryCapacity", label: "Carry Capacity" },
  { value: "range", label: "Range (ft)" },
  { value: "price", label: "Price" },
  { value: "itemWeight", label: "Weight (lb)" },
];

export function v3RuneStatTargetLabel(key: string): string {
  return V3_RUNE_STAT_TARGETS.find(t => t.value === key)?.label ?? key;
}

export interface V3RuneStatEffect {
  target: string;
  amount: number;
}

// A rune snapshot stored on a host item's `socketedRunes` jsonb.
export interface V3SocketedRune {
  slotIndex: number;
  runeItemId?: string | null;
  name: string;
  image?: string | null;
  description?: string | null;
  statEffects: V3RuneStatEffect[];
  useMode: string; // 'none' | 'skill_check'
  skillKey?: string | null;
  skillAdjustment: number;
  weaponDamageLevelBonus: number;
  removable: boolean;
  removeDurabilityCost: number;
}

// Fold every socketed rune's stat effects into a single map keyed by stat
// target. Used to compute a host item's effective stats.
export function aggregateRuneStatEffects(
  socketedRunes: Array<{ statEffects?: V3RuneStatEffect[] | null } | null | undefined> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(socketedRunes)) return out;
  for (const rune of socketedRunes) {
    const effects = rune?.statEffects;
    if (!Array.isArray(effects)) continue;
    for (const e of effects) {
      if (!e || !e.target) continue;
      const amt = Math.trunc(Number(e.amount) || 0);
      if (!amt) continue;
      out[e.target] = (out[e.target] || 0) + amt;
    }
  }
  return out;
}

// Sum the weapon base-damage-level bonus across every socketed rune (stacks).
export function aggregateRuneWeaponDamageLevelBonus(
  socketedRunes: Array<{ weaponDamageLevelBonus?: number | null } | null | undefined> | null | undefined,
): number {
  if (!Array.isArray(socketedRunes)) return 0;
  return socketedRunes.reduce(
    (sum, rune) => sum + Math.trunc(Number(rune?.weaponDamageLevelBonus) || 0),
    0,
  );
}

// Host-item stat columns a rune may write to. Mirrors the server's
// V3_RUNE_STAT_COLUMNS whitelist (an unknown key would crash a Drizzle update).
const V3_RUNE_STAT_COLUMN_SET = new Set<string>(V3_RUNE_STAT_TARGETS.map(t => t.value));

// Build a socketed-rune snapshot from a library/admin rune item. Used when a GM
// pre-loads ("by default") a rune onto an item at authoring time, sourcing the
// rune from the library rather than consuming an owned inventory rune.
export function v3RuneItemToSnapshot(rune: any, slotIndex: number): V3SocketedRune {
  return {
    slotIndex,
    runeItemId: rune?.id ?? null,
    name: rune?.name ?? "Rune",
    image: rune?.image ?? null,
    description: rune?.description ?? null,
    statEffects: Array.isArray(rune?.runeStatEffects) ? rune.runeStatEffects : [],
    useMode: rune?.runeUseMode || "none",
    skillKey: rune?.runeSkillKey ?? null,
    skillAdjustment: Math.trunc(Number(rune?.runeSkillAdjustment) || 0),
    weaponDamageLevelBonus: Math.trunc(Number(rune?.runeWeaponDamageLevelBonus) || 0),
    removable: !rune?.runeUnremovable,
    removeDurabilityCost: Math.trunc(Number(rune?.runeRemoveDurabilityCost) || 0),
  };
}

export interface V3RuneAttachResult {
  ok: boolean;
  error?: string;
  // Field updates to merge into the host item: { socketedRunes, ...statColumns }.
  updates?: Record<string, any>;
}

// Pure: attach a library rune onto a host item object, respecting rune-slot
// limits (by rarity) and target-type compatibility. Returns the field updates
// (socketedRunes + baked stat columns) to merge into the host. Does NOT mutate
// inputs. Mirrors the runtime socket-rune route's math so a pre-loaded rune
// behaves exactly like an in-game socketed one (removal reverts the columns).
export function v3AttachRune(host: any, rune: any): V3RuneAttachResult {
  if (!host) return { ok: false, error: "No host item" };
  if (!rune || rune.itemType !== "rune") return { ok: false, error: "That item is not a rune" };
  if (host.itemType === "rune") return { ok: false, error: "Cannot socket a rune into a rune" };
  const target = rune.runeTargetItemType || "any";
  if (target !== "any" && target !== host.itemType) {
    return { ok: false, error: `This rune can only be applied to ${target} items` };
  }
  const slots = v3RuneSlotCount(host.rarity);
  const socketed: V3SocketedRune[] = Array.isArray(host.socketedRunes) ? [...host.socketedRunes] : [];
  if (socketed.length >= slots) {
    return {
      ok: false,
      error: slots === 0 ? "This item has no rune slots (raise its rarity)" : "No free rune slots on this item",
    };
  }
  const used = new Set(socketed.map(r => r.slotIndex));
  let slotIndex = 0;
  while (used.has(slotIndex)) slotIndex++;
  const snap = v3RuneItemToSnapshot(rune, slotIndex);
  const updates: Record<string, any> = { socketedRunes: [...socketed, snap] };
  for (const e of snap.statEffects) {
    if (!e || !e.target || !V3_RUNE_STAT_COLUMN_SET.has(e.target)) continue;
    const amt = Math.trunc(Number(e.amount) || 0);
    if (!amt) continue;
    updates[e.target] = (Number(host[e.target]) || 0) + amt;
  }
  return { ok: true, updates };
}

// Pure: detach a socketed rune from a host item by slot index, reverting its
// stat-column deltas. Used by authoring UIs (no durability cost — that is a
// runtime-removal mechanic). Does NOT mutate inputs.
export function v3DetachRune(host: any, slotIndex: number): V3RuneAttachResult {
  const socketed: V3SocketedRune[] = Array.isArray(host?.socketedRunes) ? [...host.socketedRunes] : [];
  const idx = socketed.findIndex(r => r.slotIndex === slotIndex);
  if (idx < 0) return { ok: false, error: "No rune in that slot" };
  const rune = socketed[idx];
  const updates: Record<string, any> = { socketedRunes: socketed.filter((_, i) => i !== idx) };
  for (const e of (Array.isArray(rune.statEffects) ? rune.statEffects : [])) {
    if (!e || !e.target || !V3_RUNE_STAT_COLUMN_SET.has(e.target)) continue;
    const amt = Math.trunc(Number(e.amount) || 0);
    if (!amt) continue;
    updates[e.target] = (Number(host[e.target]) || 0) - amt;
  }
  return { ok: true, updates };
}

// AA V3 exhaustion ladder (7 levels). Effects are cumulative as the level rises.
// Index 0 is empty (no exhaustion); indices 1-7 list the effect(s) gained at
// that level. V3 has no attack rolls, so the old "Disadvantage on Attack Rolls"
// effect is replaced by "Only 1 Action per turn" at level 3, and the
// saving-throw / speed-to-0 / HP-to-0 effects shift up to levels 5/6/7.
export const V3_EXHAUSTION_EFFECTS: string[][] = [
  [],
  ["Disadvantage on Skill Checks"],
  ["Speed Halved"],
  ["Only 1 Action per turn"],
  ["Energy/Mana costs are doubled"],
  ["Disadvantage on Saving Throws"],
  ["Speed reduced to 0"],
  ["HP set to 0"],
];

// The highest exhaustion level the V3 control can reach.
export const V3_EXHAUSTION_MAX = 7;

// At exhaustion level 4+, a V3 character's Energy/Mana costs are doubled. This
// multiplier must be applied identically wherever a cost is shown and wherever
// it is actually deducted so the displayed cost always matches what is spent.
export function v3ExhaustionCostMultiplier(exhaustion: number | null | undefined): number {
  return (Math.floor(Number(exhaustion) || 0) >= 4) ? 2 : 1;
}

// AA V3 ranged weapons & ammunition (Task #266). A weapon is "ranged" when it
// declares an ammunitionTypeId; it can only attack when the character has a
// matching ammunition item EQUIPPED. Shared so the client gate and the server
// technique-use gate enforce the exact same rule. Works on both the client
// `Item` shape and server item rows (both expose ammunitionTypeId/isEquipped).
export function v3WeaponRequiresAmmo(
  weapon: { ammunitionTypeId?: string | null } | null | undefined,
): boolean {
  return !!(weapon && weapon.ammunitionTypeId);
}

export function v3HasEquippedAmmo(
  ammunitionTypeId: string | null | undefined,
  inventory: { itemType?: string | null; ammunitionTypeId?: string | null; isEquipped?: boolean | null; quantity?: number | null }[],
): boolean {
  if (!ammunitionTypeId) return true;
  // Must be an actual ammunition item — a weapon also carries the SAME
  // ammunitionTypeId (the type it uses), so without this itemType guard an
  // equipped ranged weapon would wrongly satisfy its own ammo requirement.
  return (inventory || []).some(
    (it) =>
      it.itemType === "ammunition" &&
      it.ammunitionTypeId === ammunitionTypeId &&
      !!it.isEquipped &&
      (it.quantity ?? 1) > 0,
  );
}

// --- V3 Durability-adjusted item value ---
//
// In AA V3, an item's effective sale/display value scales with its durability.
// Each point of durability (baseline 10) represents 10% of the original value.
// effectiveCopper = floor(originalCopper × min(durability, 10) / 10)
//
// Items without a durability value (null/undefined) are unaffected — their
// original price is returned as-is (isDiscounted=false, adjustedCopper equals
// the original copper value).
//
// Currency rates: 1 platinum = 10 gold = 100 silver = 1000 copper.

const V3_CURRENCY_TO_COPPER: Record<string, number> = {
  copper: 1,
  silver: 10,
  gold: 100,
  platinum: 1000,
};

export interface V3AdjustedValue {
  originalCopper: number;
  adjustedCopper: number;
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
  isDiscounted: boolean;
}

export function v3DurabilityAdjustedValue(
  price: number | null | undefined,
  currency: string | null | undefined,
  durability: number | null | undefined,
): V3AdjustedValue {
  const rate = V3_CURRENCY_TO_COPPER[(currency || "copper").toLowerCase()] ?? 1;
  const originalCopper = (price || 0) * rate;

  let adjustedCopper: number;
  if (durability === null || durability === undefined) {
    adjustedCopper = originalCopper;
  } else {
    adjustedCopper = Math.floor(originalCopper * Math.min(durability, 10) / 10);
  }

  const isDiscounted = adjustedCopper < originalCopper;

  let remaining = adjustedCopper;
  const p = Math.floor(remaining / 1000); remaining -= p * 1000;
  const g = Math.floor(remaining / 100); remaining -= g * 100;
  const s = Math.floor(remaining / 10); remaining -= s * 10;
  const c = remaining;

  return { originalCopper, adjustedCopper, platinum: p, gold: g, silver: s, copper: c, isDiscounted };
}

/** Format a V3AdjustedValue as a short compact string like "3g 2s 5c". */
export function formatV3AdjustedValue(v: V3AdjustedValue): string {
  if (v.adjustedCopper === 0) return "0c";
  const parts: string[] = [];
  if (v.platinum > 0) parts.push(`${v.platinum}p`);
  if (v.gold > 0) parts.push(`${v.gold}g`);
  if (v.silver > 0) parts.push(`${v.silver}s`);
  if (v.copper > 0) parts.push(`${v.copper}c`);
  return parts.join(" ");
}

/** Format the ORIGINAL price as a short string for "was X" display. */
export function formatV3OriginalValue(price: number | null | undefined, currency: string | null | undefined): string {
  const p = price || 0;
  const curr = (currency || "copper").toLowerCase();
  const suffix = curr === "platinum" ? "p" : curr === "gold" ? "g" : curr === "silver" ? "s" : "c";
  return `${p}${suffix}`;
}
