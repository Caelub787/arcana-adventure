// AA V3 Spell Crafting — single source of truth shared by client and server.
// Composition = one Core element + 0+ secondary elements (each tagged a Role)
//   + one Intent + one Delivery + one Reach + one Duration.
// No AI: name/description/image are authored by the GM (or auto-filled from an
// admin-approved canonical version matched by compositionHash).

export interface V3Option {
  key: string;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Elements (17)
// ---------------------------------------------------------------------------
export const V3_ELEMENTS: V3Option[] = [
  { key: "fire", name: "Fire", description: "Heat, combustion, and consuming flame. Destroys, illuminates, and spreads. Its nature is aggressive and difficult to control once unleashed." },
  { key: "water", name: "Water", description: "Flowing liquid force, pressure, and adaptability. Finds every gap and weakness, erodes over time, and takes the shape of whatever contains it." },
  { key: "earth", name: "Earth", description: "Stone, soil, and immovable physical mass. The most durable and persistent of forces. Slow to move but devastating once it does." },
  { key: "air", name: "Air", description: "Wind, breath, and invisible movement. The fastest natural element. Carries and disperses everything it touches across wide areas." },
  { key: "lightning", name: "Lightning", description: "Raw electrical discharge and instantaneous energy. Travels faster than anything else, jumps between conductive surfaces, and strikes without warning." },
  { key: "ice", name: "Ice", description: "Cold, stillness, and crystallization. Slows and preserves whatever it touches. Can hold things in suspension or shatter them under pressure." },
  { key: "shadow", name: "Shadow", description: "Darkness and entropy as active forces. Not simply the absence of light but a thing unto itself, concealing, corrupting, and wearing things down." },
  { key: "light", name: "Light", description: "Radiance, revelation, and precision. Illuminates what is hidden, purifies what is corrupt, and travels in exact straight lines." },
  { key: "life", name: "Life", description: "Growth, healing, and biological force. The fundamental drive of living things to persist and expand. Can restore, accelerate, or overwhelm organic matter." },
  { key: "death", name: "Death", description: "Decay, entropy, and the ending of things. Necrotic force that breaks down structure, consumes vitality, and resists natural healing." },
  { key: "mind", name: "Mind", description: "Concentrated will and psychic force made tangible. Targets consciousness directly rather than the physical body. Shaped entirely by intent." },
  { key: "void", name: "Void", description: "Pure absence and anti-existence. Does not damage so much as erase. The hardest force to resist because there is nothing to push back against." },
  { key: "sound", name: "Sound", description: "Vibration and resonance. Travels through any medium, bypasses physical barriers, and can shatter or heal depending on the frequency." },
  { key: "metal", name: "Metal", description: "Hardness, conductivity, and magnetism. Precise and structured. Conducts other forces efficiently and holds its shape under extreme conditions." },
  { key: "poison", name: "Poison", description: "Toxicity, corruption, and chemical degradation. Invades living systems, spreads through contact, and lingers long after the initial exposure." },
  { key: "time", name: "Time", description: "Temporal force. The ability to accelerate, decelerate, suspend, or age whatever it touches. One of the most dangerous forces to work with." },
  { key: "space", name: "Space", description: "Spatial force. Manipulates distance, location, and physical boundaries. Can fold distance, anchor objects in place, or move things instantly." },
];

// ---------------------------------------------------------------------------
// Roles (6) — Core is required and unique; the other 5 tag secondary elements.
// Each role has a display color used by the live color-coded formula display.
// ---------------------------------------------------------------------------
export interface V3Role extends V3Option {
  color: string; // hex
}

export const V3_CORE_ROLE_KEY = "core";

export const V3_ROLES: V3Role[] = [
  { key: "core", name: "Core", color: "#f59e0b", description: "What element the spell is made from" },
  { key: "catalyst", name: "Catalyst", color: "#ef4444", description: "Drives the reaction between the spells with the core being the main focus" },
  { key: "carrier", name: "Carrier", color: "#3b82f6", description: "Is the vessel or medium the spell moves through or is contained within" },
  { key: "amplifier", name: "Amplifier", color: "#a855f7", description: "Strengthens or weakens the core element in the spell by merging the two" },
  { key: "seal", name: "Seal", color: "#10b981", description: "Anchors and stabilizes the spell or unstabilizes it" },
  { key: "trigger", name: "Trigger", color: "#ec4899", description: "What causes the spell to activate or detonate" },
];

// Secondary roles only (exclude Core)
export const V3_SECONDARY_ROLES: V3Role[] = V3_ROLES.filter((r) => r.key !== V3_CORE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Intent (15)
// ---------------------------------------------------------------------------
export const V3_INTENTS: V3Option[] = [
  { key: "create", name: "Create", description: "Bring something into existence from the magical force itself. The spell produces something that was not there before." },
  { key: "destroy", name: "Destroy", description: "Damage, unmake, or consume a target. The spell's purpose is to reduce, break down, or eliminate something." },
  { key: "move", name: "Move", description: "Displace, push, pull, or reposition something without changing what it fundamentally is. The target ends up somewhere different than where it started." },
  { key: "shape", name: "Shape", description: "Change the physical form or structure of something without altering its fundamental nature or substance. Water reshaped into a wall is still water." },
  { key: "transform", name: "Transform", description: "Change the state or nature of something entirely. Water transformed into ice has become something different. More thorough than Shape." },
  { key: "sense", name: "Sense", description: "Gather information, detect presence, read conditions, or reveal what is hidden. The spell reaches out and brings knowledge back." },
  { key: "bind", name: "Bind", description: "Restrict, hold, or anchor something in place. The target cannot move, act, or change as long as the Bind holds." },
  { key: "release", name: "Release", description: "Undo a binding, free something that is constrained, or break a held magical effect. The opposite of Bind." },
  { key: "amplify", name: "Amplify", description: "Make something that already exists in the world larger, stronger, or more intense. The spell finds an existing force or quality and magnifies it. Unlike the Amplifier role, this acts on things outside the spell rather than elements within it." },
  { key: "diminish", name: "Diminish", description: "Reduce, weaken, or suppress something that already exists. The spell finds a force or quality and makes it less." },
  { key: "absorb", name: "Absorb", description: "Take in, drain, or consume something. The spell pulls a force, quality, or energy into itself or into the caster." },
  { key: "reflect", name: "Reflect", description: "Redirect or bounce something back toward its source or in a new direction. The spell intercepts a force and returns it." },
  { key: "convert", name: "Convert", description: "Change one substance or type of energy into a fundamentally different one. Unlike Transform, Convert changes what something is made of, not just its state." },
  { key: "summon", name: "Summon", description: "Call something from elsewhere to your location. The thing summoned already exists somewhere and the spell brings it here." },
  { key: "communicate", name: "Communicate", description: "Convey information, send messages, or transmit will across distance. The spell carries meaning rather than force." },
];

// ---------------------------------------------------------------------------
// Delivery (6)
// ---------------------------------------------------------------------------
export const V3_DELIVERIES: V3Option[] = [
  { key: "projectile", name: "Projectile", description: "From cast to target in a straight line" },
  { key: "stream", name: "Stream", description: "A continuous flowing line" },
  { key: "wave", name: "Wave", description: "A moving wall/wave" },
  { key: "pulse", name: "Pulse", description: "From the final spot in a circular radius" },
  { key: "conjure", name: "Conjure", description: "From the ground" },
  { key: "rain", name: "Rain", description: "From the sky" },
];

// Deliveries that produce an area of effect and therefore expose an AOE Range.
export const V3_AOE_DELIVERY_KEYS = ["stream", "wave", "pulse"];

export function v3IsAoeDelivery(deliveryKey: string): boolean {
  return V3_AOE_DELIVERY_KEYS.includes(deliveryKey);
}

// ---------------------------------------------------------------------------
// Reach (7) — index is the "slot"; mana = +1 per slot above Self (index 0).
// ---------------------------------------------------------------------------
export const V3_REACHES: V3Option[] = [
  { key: "self", name: "Self", description: "Stays at origin" },
  { key: "touch", name: "Touch", description: "5ft" },
  { key: "close", name: "Close", description: "15ft" },
  { key: "near", name: "Near", description: "30ft" },
  { key: "far", name: "Far", description: "60ft" },
  { key: "extreme", name: "Extreme", description: "90ft" },
  { key: "unlimited", name: "Unlimited", description: "No range limit" },
];

// AOE Range reuses the Reach options minus Self and Unlimited. Only shown for
// area-of-effect deliveries (stream, wave, pulse).
export const V3_AOE_RANGES: V3Option[] = V3_REACHES.filter(
  (r) => r.key !== "self" && r.key !== "unlimited",
);

// ---------------------------------------------------------------------------
// Duration (8) — index is the "slot"; mana = +1 per slot above Instant (index 0).
// ---------------------------------------------------------------------------
export const V3_DURATIONS: V3Option[] = [
  { key: "instant", name: "Instant", description: "Happens immediately, no lasting effect" },
  { key: "brief", name: "Brief", description: "6 seconds" },
  { key: "short", name: "Short", description: "30 seconds" },
  { key: "medium", name: "Medium", description: "1 minute" },
  { key: "long", name: "Long", description: "1 hour" },
  { key: "permanent", name: "Permanent", description: "Lasts forever" },
  { key: "concentration", name: "Concentration", description: "Requires concentration to maintain" },
  { key: "until_triggered", name: "Until Triggered", description: "Stays until a condition activates it" },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
function toMap(list: V3Option[]): Record<string, V3Option> {
  return Object.fromEntries(list.map((o) => [o.key, o]));
}

export const V3_ELEMENT_MAP = toMap(V3_ELEMENTS);
export const V3_ROLE_MAP: Record<string, V3Role> = Object.fromEntries(V3_ROLES.map((r) => [r.key, r]));
export const V3_INTENT_MAP = toMap(V3_INTENTS);
export const V3_DELIVERY_MAP = toMap(V3_DELIVERIES);
export const V3_REACH_MAP = toMap(V3_REACHES);
export const V3_AOE_RANGE_MAP = toMap(V3_AOE_RANGES);
export const V3_DURATION_MAP = toMap(V3_DURATIONS);

export function v3ReachIndex(key: string): number {
  const i = V3_REACHES.findIndex((r) => r.key === key);
  return i < 0 ? 0 : i;
}

export function v3DurationIndex(key: string): number {
  const i = V3_DURATIONS.findIndex((d) => d.key === key);
  return i < 0 ? 0 : i;
}

export function v3RoleColor(roleKey: string): string {
  return V3_ROLE_MAP[roleKey]?.color ?? "#9ca3af";
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------
export interface V3SpellSecondary {
  element: string; // element key
  role: string; // secondary role key (not "core")
}

export interface V3SpellComposition {
  core: string; // element key
  secondaries: V3SpellSecondary[];
  intent: string;
  delivery: string;
  reach: string;
  duration: string;
  // Only meaningful for area-of-effect deliveries (stream/wave/pulse). A reach
  // key excluding "self"/"unlimited". Optional for backward compatibility.
  aoeRange?: string;
}

/** Total elements in the spell (Core + secondaries). */
export function v3ElementCount(comp: V3SpellComposition): number {
  return 1 + (comp.secondaries?.length ?? 0);
}

/**
 * Mana cost = 1 per element + 1 per Reach slot above Self + 1 per Duration slot
 * above Instant.
 */
export function v3ManaCost(comp: V3SpellComposition): number {
  return v3ElementCount(comp) + v3ReachIndex(comp.reach) + v3DurationIndex(comp.duration);
}

/**
 * Crafting DC scales with element count:
 *   1 element  -> 0  (auto-success)
 *   2 elements -> 6
 *   3 elements -> 12
 *   4 elements -> 18
 *   n elements -> (n - 1) * 6
 */
export function v3CraftDc(comp: V3SpellComposition): number {
  const n = v3ElementCount(comp);
  return n <= 1 ? 0 : (n - 1) * 6;
}

// ---------------------------------------------------------------------------
// Cast level → dice + mana scaling
// ---------------------------------------------------------------------------
const V3_LEVEL_DIE_SIDES = [6, 8, 10, 12];

/**
 * Dice for a crafted spell cast at a given level (>= 1). Every 4 levels adds
 * one die and the die size cycles d6 -> d8 -> d10 -> d12. There is no upper
 * bound on level.
 *   1->1d6, 2->1d8, 3->1d10, 4->1d12, 5->2d6, 6->2d8, 7->2d10, 8->2d12, 9->3d6 ...
 */
export function v3LevelDice(level: number): { count: number; sides: number } {
  const lv = Math.max(1, Math.floor(level || 1));
  const count = 1 + Math.floor((lv - 1) / 4);
  const sides = V3_LEVEL_DIE_SIDES[(lv - 1) % 4];
  return { count, sides };
}

/** Dice notation for a cast level, e.g. level 5 -> "2d6". */
export function v3LevelDiceNotation(level: number): string {
  const { count, sides } = v3LevelDice(level);
  return `${count}d${sides}`;
}

/** Extra mana for casting above level 1 (level 1 = 0 extra, each level +1). */
export function v3LevelExtraMana(level: number): number {
  return Math.max(0, Math.floor(level || 1) - 1);
}

/**
 * Canonical, order-dependent serialization of a composition. Secondary
 * [role, element] pairs are kept in their listed order, so two spells built
 * with the same parts in a different order hash differently and are treated
 * as distinct compositions.
 */
export function serializeV3Composition(comp: V3SpellComposition): string {
  const secondaries = (comp.secondaries ?? []).map((s) => ({ role: s.role, element: s.element }));
  const obj: Record<string, unknown> = {
    core: comp.core,
    secondaries,
    intent: comp.intent,
    delivery: comp.delivery,
    reach: comp.reach,
    duration: comp.duration,
  };
  // Only include aoeRange when set, so existing (non-AOE) spells hash unchanged.
  if (comp.aoeRange) obj.aoeRange = comp.aoeRange;
  return JSON.stringify(obj);
}

/** Validate that a composition references only known keys and a single Core. */
export function isValidV3Composition(comp: V3SpellComposition): boolean {
  if (!comp || !V3_ELEMENT_MAP[comp.core]) return false;
  if (!V3_INTENT_MAP[comp.intent]) return false;
  if (!V3_DELIVERY_MAP[comp.delivery]) return false;
  if (!V3_REACH_MAP[comp.reach]) return false;
  if (!V3_DURATION_MAP[comp.duration]) return false;
  if (comp.aoeRange && !V3_AOE_RANGE_MAP[comp.aoeRange]) return false;
  if (!Array.isArray(comp.secondaries)) return false;
  for (const s of comp.secondaries) {
    if (!V3_ELEMENT_MAP[s.element]) return false;
    if (!V3_ROLE_MAP[s.role] || s.role === V3_CORE_ROLE_KEY) return false;
  }
  return true;
}

export type V3SpellStatus = "awaiting_gm" | "ready" | "approved" | "rejected";

// ---------------------------------------------------------------------------
// AA V3 element craft requirements (eligibility gating)
// ---------------------------------------------------------------------------
// A single OR'd unlock condition for an element. Meeting ANY one condition
// unlocks the element; an element with no conditions is freely usable.
export interface V3ElementCondition {
  conditionType: "knowledge" | "item";
  knowledgeName?: string | null; // for knowledge conditions
  itemId?: string | null; // admin system item id (item conditions)
  itemName?: string | null; // denormalized item name (display + fallback match)
  consumed?: boolean | null; // item consumed on successful craft (item conditions)
}

export interface V3CharacterEligibilityInput {
  knowledgeNames: string[]; // the crafting character's custom-skill (Knowledge) names
  items: { templateItemId?: string | null; name?: string | null }[]; // inventory
}

export interface V3ElementEligibility {
  usable: boolean;
  // Human-readable requirement lines for locked display (one per condition).
  requirements: string[];
  // The item to consume on a successful craft — set only when the element is
  // usable AND its only satisfied condition is a consumable item (so a free
  // path, e.g. Knowledge or a non-consumable item, is always preferred).
  consumeItem?: { itemId?: string | null; name?: string | null } | null;
}

/**
 * Evaluate whether a character may use an element given its OR'd conditions.
 * - No conditions => freely usable.
 * - Prefers a non-consuming satisfaction (Knowledge / non-consumable item);
 *   only charges a consumable item when that is the sole satisfying path.
 */
export function evaluateV3ElementEligibility(
  conditions: V3ElementCondition[] | undefined | null,
  input: V3CharacterEligibilityInput,
): V3ElementEligibility {
  if (!conditions || conditions.length === 0) {
    return { usable: true, requirements: [] };
  }

  const knowledgeSet = new Set(
    (input.knowledgeNames || []).map((n) => (n || "").trim().toLowerCase()).filter(Boolean),
  );
  const hasItem = (c: V3ElementCondition): boolean =>
    (input.items || []).some((it) => {
      if (c.itemId && it.templateItemId && it.templateItemId === c.itemId) return true;
      if (
        c.itemName &&
        it.name &&
        it.name.trim().toLowerCase() === c.itemName.trim().toLowerCase()
      )
        return true;
      return false;
    });

  let usable = false;
  let satisfiedNonConsuming = false;
  let consumableCandidate: { itemId?: string | null; name?: string | null } | null = null;
  const requirements: string[] = [];

  for (const c of conditions) {
    if (c.conditionType === "knowledge") {
      const name = (c.knowledgeName || "").trim();
      requirements.push(`Requires Knowledge: ${name || "?"}`);
      if (name && knowledgeSet.has(name.toLowerCase())) {
        usable = true;
        satisfiedNonConsuming = true;
      }
    } else if (c.conditionType === "item") {
      const label = (c.itemName || "item").trim();
      requirements.push(`Requires item: ${label}${c.consumed ? " (consumed)" : ""}`);
      if (hasItem(c)) {
        usable = true;
        if (c.consumed) {
          if (!consumableCandidate) consumableCandidate = { itemId: c.itemId, name: c.itemName };
        } else {
          satisfiedNonConsuming = true;
        }
      }
    }
  }

  const consumeItem = usable && !satisfiedNonConsuming ? consumableCandidate : null;
  return { usable, requirements, consumeItem };
}
