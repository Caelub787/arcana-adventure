// "Cultivator's Adventure" for Agnostic: the C.A. character sheet rebuilt out
// of ordinary Agnostic parts — values, formulas, buttons, connections, tabs,
// item cards — so a GM can open any piece and change it. Nothing here touches
// the real C.A. system; it is a starter kit applied to one Agnostic scope.
//
// Wounds keep their function (effects on skills and speed, severity, where
// they land, treating them, potions healing them) without the body diagram:
// each wound is its own small sheet connected to the character, and its
// effects are modifiers on the character.
import { SELL_VALUE_FORMULA } from "@shared/agnostic/crafting";
import { randomUUID } from "crypto";
import type { AgAction, AgActionOptions, AgActionStep, AgField, AgFieldOptions, AgFieldType, AgModifier, AgNote, AgRegion, AgSnapshot, AgTrackerCard, AgValue, AgRollScale } from "@shared/agnostic/types";
import { defaultScaleStep } from "@shared/agnostic/types";
import type { ChangeSet, ScopeStore } from "../store";
import * as snap from "../snapshot";
import { copySheet, markAsCopy, syncCopyOwners } from "../copies";
import { applyCACrafting, giveStarterSupplies } from "./caCrafting";
import {
  buildDocState, type DocNode, p, pAlign, h, hr, b, i, muted, t, icon, tip, val, block, button, columns, section, tabs, links, canvas, table, rolls, effects,
} from "./doc";

export const CA_KIT_FOLDER = "Cultivator's Adventure";
/** Where characters' own copies of items, abilities and traits are kept (and stay when taken off). */
export const CA_COPIES_FOLDER = "Player Owned Copies";
const COPY = { copy: true, copyFolder: CA_COPIES_FOLDER };
/** A character's lists only take what already exists (made in the sidebar), never make new ones — each gets its own copy. */
const ADD_ONLY = { ...COPY, createNew: false };

// --------------------------------------------------------------------------- C.A. rules, as data
const ATTRS = [
  { key: "might", name: "Might", abbr: "MIG" },
  { key: "finesse", name: "Finesse", abbr: "FIN" },
  { key: "constitution", name: "Constitution", abbr: "CON" },
  { key: "will", name: "Will", abbr: "WIL" },
  { key: "anemos", name: "Anemos", abbr: "ANE" },
  { key: "intelligence", name: "Intelligence", abbr: "INT" },
] as const;
const ABBR: Record<string, string> = Object.fromEntries(ATTRS.map((a) => [a.key, a.abbr]));

const SKILLS: Array<{ key: string; name: string; parent: string; desc: string }> = [
  { key: "athletics", name: "Athletics", parent: "might", desc: "Climbing, jumping, swimming, lifting, and physical exertion." },
  { key: "intimidation", name: "Intimidation", parent: "might", desc: "Threatening, dominating, and forcing compliance." },
  { key: "acrobatics", name: "Acrobatics", parent: "finesse", desc: "Balance, tumbling, climbing, and agile movement." },
  { key: "stealth", name: "Stealth", parent: "finesse", desc: "Moving unseen, unheard, and unnoticed." },
  { key: "sleight_of_hand", name: "Sleight of Hand", parent: "finesse", desc: "Picking pockets, palming items, and delicate manipulation." },
  { key: "endurance", name: "Endurance", parent: "constitution", desc: "Resisting fatigue, harsh conditions, and exhaustion." },
  { key: "fortitude", name: "Fortitude", parent: "constitution", desc: "Resisting poison, disease, and bodily afflictions." },
  { key: "perception", name: "Perception", parent: "constitution", desc: "Noticing sights, sounds, and other physical details." },
  { key: "focus_skill", name: "Focus", parent: "will", desc: "Maintaining concentration under pressure." },
  { key: "influence", name: "Influence", parent: "will", desc: "Persuading, deceiving, negotiating, and inspiring others." },
  { key: "insight", name: "Insight", parent: "will", desc: "Reading intentions, lies, and emotional cues." },
  { key: "arcana", name: "Arcana", parent: "anemos", desc: "Understanding spells, enchantments, and magical theory." },
  { key: "sense", name: "Sense", parent: "anemos", desc: "Detecting magic, spirits, and Anemos currents." },
  { key: "animal_handling", name: "Animal Handling", parent: "intelligence", desc: "Taming, calming, and handling animals and beasts." },
  { key: "investigation", name: "Investigation", parent: "intelligence", desc: "Finding clues, solving problems, and recognizing patterns." },
  { key: "knowledge", name: "Knowledge", parent: "intelligence", desc: "Recalling history, cultures, religions, and academic lore." },
  { key: "medicine", name: "Medicine", parent: "intelligence", desc: "Treating injuries, diagnosing illnesses, and providing care." },
  { key: "nature", name: "Nature", parent: "intelligence", desc: "Understanding plants, wildlife, weather, and terrain." },
  { key: "survival", name: "Survival", parent: "intelligence", desc: "Tracking, foraging, navigating, and living off the land." },
].sort((a, b) => a.name.localeCompare(b.name));

// The rank ladder: nine ranks of nine Pillars, read off the Energy Pool. A Pillar is a tenth of its rank (Pillar 9
// holds the last two tenths); Awakened's 900 splits evenly into nine 100s. Health and Lifespan are the rank's own;
// Usable Energy is the floor of the Pillar you're on; Focus and skill points rise on each rank up and on Pillars 2,
// 4, 6 and 8 (+5 a rank); attribute points rise once a rank. Absorption is half a Pillar (Mortal: 20).
export interface RankRung { name: string; start: number; step: number; hp: number; lifespan: number }
export const RANKS: RankRung[] = [
  { name: "Mortal", start: 0, step: 10, hp: 50, lifespan: 100 },
  { name: "Awakened", start: 100, step: 100, hp: 100, lifespan: 200 },
  { name: "Tempered", start: 1000, step: 100, hp: 150, lifespan: 300 },
  { name: "Refined", start: 2000, step: 100, hp: 200, lifespan: 400 },
  { name: "Enlightened", start: 3000, step: 100, hp: 250, lifespan: 500 },
  { name: "Exalted", start: 4000, step: 100, hp: 300, lifespan: 600 },
  { name: "Ascendant", start: 5000, step: 500, hp: 500, lifespan: 1000 },
  { name: "Transcendent", start: 10000, step: 500, hp: 700, lifespan: 1400 },
  { name: "Paragon", start: 15000, step: 500, hp: 1000, lifespan: 2000 },
];
export const PILLARS = 9;
export const RANK_NAMES = RANKS.map((r) => r.name);

/** Every figure on the ladder, and the formulas that read it. */
export function rankLadder(ranks: RankRung[] = RANKS) {
  const thresholds = ranks.flatMap((r) => Array.from({ length: PILLARS }, (_, k) => r.start + r.step * k));
  const labels = ranks.flatMap((r) => Array.from({ length: PILLARS }, (_, k) => `${r.name} Pillar ${k + 1}`));
  const hp = ranks.map((r) => r.hp);
  const lifespan = ranks.map((r) => r.lifespan);
  const absorb = ranks.map((r, i) => (i === 0 ? 20 : r.step / 2));
  const usable = thresholds;
  // +1 on each rank up and on Pillars 2, 4, 6, 8: five a rank.
  const growth = (idx: number) => 5 * Math.floor(idx / PILLARS) + Math.floor(((idx % PILLARS) + 1) / 2);
  return {
    thresholds, hp, labels, lifespan, absorb, usable, growth,
    formulas: {
      rank_index: `tier(energy_pool, ${thresholds.join(", ")})`,
      rank: `concat(choose(floor(rank_index / ${PILLARS}), ${ranks.map((r) => `"${r.name}"`).join(", ")}), " Pillar ", rank_index % ${PILLARS} + 1)`,
      to_next_rank: `max(0, choose(rank_index + 1, ${thresholds.join(", ")}) - energy_pool)`,
      lifespan: `choose(floor(rank_index / ${PILLARS}), ${lifespan.join(", ")})`,
      absorption_limit: `choose(floor(rank_index / ${PILLARS}), ${absorb.join(", ")})`,
      hp_max: `choose(floor(rank_index / ${PILLARS}), ${hp.join(", ")})`,
      usable_energy: `choose(rank_index, ${usable.join(", ")})`,
    } as Record<string, string>,
  };
}
const LADDER = rankLadder();
const THRESHOLDS = LADDER.thresholds;
export const LADDER_LABELS = LADDER.labels;
/** An item's rank is its rarity: Unranked, or one of the ranks (never a Pillar). It colours the item and sets its rune sockets. */
export const ITEM_RANKS = ["Unranked", ...RANK_NAMES];
export const ITEM_RANK_COLORS: Record<string, string> = {
  Unranked: "#78716c", Mortal: "#c2783e", Awakened: "#cbd5e1", Tempered: "#facc15", Refined: "#34d399", Enlightened: "#38bdf8",
  Exalted: "#a78bfa", Ascendant: "#f472b6", Transcendent: "#f87171", Paragon: "#fde68a",
};
/** Rune sockets by rank: none Unranked, one at Mortal, one more each rank up (Paragon 9). */
export const RUNE_SOCKETS_FORMULA = RANK_NAMES.reduceRight((acc, r, i) => `if(rank_tag == "${r}", ${i + 1}, ${acc})`, "0");
export const DURABILITY_HELP = "How sound the item is, 0–100%. It sells for that share of its value (100% = full value, 50% = half) — and for nothing below 30%. Use wears it down; a smith can mend it.";
export const SELL_HELP = "Its value at its durability: 100% durability sells for its full value, 50% for half; under 30% it's worth nothing.";
export const RUNE_SOCKETS_HELP = "Rune sockets come with the item's rank: none Unranked, one at Mortal, one more each rank up (Paragon 9). A rune takes one; when they're full, no more can be inscribed.";
/** An item rank from anything (an old rank or a character rank): one of ITEM_RANKS, Unranked if it isn't one. */
export const itemRankOf = (v: unknown) => { const r = String(v ?? "").split(" ")[0]; return RANK_NAMES.includes(r) ? r : "Unranked"; };
/** Item kinds that can carry runes (gear, not supplies). */
export const RUNEABLE_KINDS = ["Weapon", "Armor", "Container", "Miscellaneous"];
const RANK_LIFESPAN = LADDER.lifespan;
const RANK_ABSORB = LADDER.absorb;
export const RANK_FORMULAS = LADDER.formulas;
/** Max Focus: 6 to start, +1 on each rank up and on Pillars 2, 4, 6 and 8 (+5 a rank). */
export const FOCUS_FORMULA = `6 + 5 * floor(rank_index / ${PILLARS}) + floor((rank_index % ${PILLARS} + 1) / 2)`;
const focusAt = (idx: number) => 6 + LADDER.growth(idx);
/** Usable Energy is the floor of the Pillar you're on (Awakened Pillar 2, 257 in the pool → 200), not the pool's every point. */
export const USABLE_LADDER = LADDER.usable;
// Attribute points: +1 per rank. Skill points: +1 on each rank up and on Pillars 2, 4, 6 and 8 (as Focus).
// Training items add bonus points (and pay for the values they raise directly).
// C.A. has no levels — characters grow by rank.
export const ATTR_BUDGET_FORMULA = `4 + floor(rank_index / ${PILLARS}) + bonus_attr_points`;
export const SKILL_BUDGET_FORMULA = `8 + skill_reclaimed + 5 * floor(rank_index / ${PILLARS}) + floor((rank_index % ${PILLARS} + 1) / 2) + bonus_skill_points`;
/** The budgets before levels went (kit levels up to 15), to recognise ones the GM hasn't changed. */
export const LEVEL_ATTR_BUDGET_FORMULA = "4 + floor(level / 3) + floor(rank_index / 5) + bonus_attr_points";
export const LEVEL_SKILL_BUDGET_FORMULA = "8 + (level - 1) + skill_reclaimed + rank_index + bonus_skill_points";
export const ATTR_BUDGET_NOTE = "Attributes can't go below 0. 4 + one per rank (Awakened, Tempered…) + bonus points from training items.";
export const SKILL_BUDGET_NOTE = "8 + one on each rank up and on Pillars 2, 4, 6 and 8 (five a rank) + bonus points from training items; up to 6 back from skills below 0.";
export const ATTR_DIE_NOTE = "Each attribute sets the die its skills roll: 0 → d6, 1 → d8, 2 → d10, 3 → d12, 4+ → d20. Double-click a number to change it.";
export const SKILL_ROLL_NOTE = "Roll = the attribute's die + the skill. Wounds and equipped items change skills automatically (the green / red number beside a skill).";
export const TEMP_HP_COLOR = "#22c55e";
export const TEMP_ENERGY_COLOR = "#ec4899";
export const TEMP_ENERGY_LINE = p(muted("Temp Energy "), val("temp_energy", { display: "input" }), muted("  — spent before Energy; shows in pink on the bar."));
export const USABLE_FORMULA = RANK_FORMULAS.usable_energy;
export const USABLE_NOTE = " — the floor of your Pillar; it goes up when you break through to the next Pillar, not with every point of the pool";

/** The rank ladder as a tooltip: every rung and what it's worth (shown behind the ? by Rank). */
export function rankTooltip(): string {
  const n = (x: number) => x.toLocaleString("en-US");
  const out = ["Your rank is read from your **Energy Pool** — it isn't set by hand. Each rank has nine **Pillars**. **Usable Energy** is what you spend: the floor of the Pillar you're on, so it only goes up when you break through to the next Pillar.", ""];
  RANKS.forEach((r, ri) => {
    out.push(`## ${r.name} · Health ${n(r.hp)} · Lifespan ${n(RANK_LIFESPAN[ri])} yrs · Absorbs ${n(RANK_ABSORB[ri])}`);
    out.push("Pillar | Energy Pool | Usable | Max Focus");
    for (let k = 0; k < PILLARS; k++) {
      const idx = ri * PILLARS + k;
      const top = idx + 1 < THRESHOLDS.length ? n(THRESHOLDS[idx + 1] - 1) : "+";
      out.push(`${k + 1} | ${n(THRESHOLDS[idx])}${top === "+" ? "+" : `–${top}`} | ${n(USABLE_LADDER[idx])} | ${focusAt(idx)}`);
    }
    out.push("");
  });
  return out.join("\n").trim();
}

// ---- The ladder before Pillars (six ranks of five stars), for bringing old campaigns up to date step by step.
export const LEGACY_RANK_NAMES = ["Bronze", "Silver", "Gold", "Obsidian", "Terran", "Livelihood"];
export function legacyRankLadder(names: string[]) {
  const thresholds = [0, 20, 30, 40, 50, ...names.slice(1).flatMap((_, r) => [1, 2, 3, 4, 5].map((st) => 10 ** (r + 2) * st))];
  const hp = thresholds.map((_, idx) => { let v = 20; for (let k = 1; k <= idx; k++) v += k % 5 === 0 ? 10 : 5; return v; });
  const labels = thresholds.map((_, idx) => `${names[Math.floor(idx / 5)]} ${idx % 5 + 1}`);
  const lifespan = names.map((_, r) => 100 + 50 * r);
  const absorb = names.map((_, r) => (r === 0 ? 20 : 50 * 10 ** (r - 1)));
  const usable = thresholds.map((x) => Math.floor(x / 2));
  return {
    thresholds, hp, labels, lifespan, absorb, usable,
    formulas: {
      rank_index: `tier(energy_pool, ${thresholds.join(", ")})`,
      rank: `concat(choose(floor(rank_index / 5), ${names.map((n) => `"${n}"`).join(", ")}), " ", rank_index % 5 + 1)`,
      to_next_rank: `max(0, choose(rank_index + 1, ${thresholds.join(", ")}) - energy_pool)`,
      lifespan: `choose(floor(rank_index / 5), ${lifespan.join(", ")})`,
      absorption_limit: `choose(floor(rank_index / 5), ${absorb.join(", ")})`,
      hp_max: `choose(rank_index, ${hp.join(", ")})`,
      usable_energy: `choose(rank_index, ${usable.join(", ")})`,
    } as Record<string, string>,
  };
}
export const LEGACY_LADDER_LABELS = legacyRankLadder(LEGACY_RANK_NAMES).labels;
/** Old item ranks, with stars ("Gold 3"). */
export const LEGACY_ITEM_RANK_CHOICES = ["Unranked", ...LEGACY_RANK_NAMES.flatMap((r) => [r, ...LEGACY_LADDER_LABELS.filter((l) => l.startsWith(`${r} `))])];

// Abilities: each one its own small sheet held by a character (like items).
const ABILITY_CATEGORIES = ["Attack", "Defense", "Support", "Movement", "Utility", "Passive"];
const ABILITY_COLORS: Record<string, string> = { Attack: "#f87171", Defense: "#60a5fa", Support: "#34d399", Movement: "#fbbf24", Utility: "#c084fc", Passive: "#a8a29e" };

export const ITEM_TYPES = ["Ammunition", "Armor", "Beast Orb", "Consumable", "Container", "Crafter", "Currency", "Ingredient", "Ink", "Material", "Miscellaneous", "Part", "Rune", "Scroll", "Station", "Tool", "Weapon"];
export const ITEM_TYPE_COLORS: Record<string, string> = { Weapon: "#f87171", Armor: "#60a5fa", Consumable: "#34d399", Rune: "#c084fc", Container: "#fbbf24", Currency: "#facc15", Ammunition: "#fb923c", "Beast Orb": "#2dd4bf", Crafter: "#a3e635", Miscellaneous: "#a8a29e", Material: "#d6d3d1", Ingredient: "#86efac", Ink: "#f0abfc", Tool: "#fdba74", Part: "#cbd5e1", Station: "#fb923c", Scroll: "#fcd34d" };
const SEVERITIES = ["Minor", "Moderate", "Severe"];
const SEVERITY_COLORS: Record<string, string> = { Minor: "#a8a29e", Moderate: "#ea580c", Severe: "#dc2626" };
const LOCATIONS = ["Body", "Arm", "Leg", "Head"];
const LOCATION_COLORS: Record<string, string> = { Body: "#d6d3d1", Arm: "#fcd34d", Leg: "#fcd34d", Head: "#f87171" };

const GILT = "#d4a24c";
const SECTION_LOOK = { bg: "#1c1917", outline: "#d4a24c55", radius: 10, padding: 12 };
/** Sheets start hidden from players: only the GM and the players it's given to (its owners) see it. */
export const CA_SHEET_ACL = { view: "owners", edit: "owners" } as const;

// --------------------------------------------------------------------------- sheet builder
export class Sheet {
  fields: Array<Omit<AgField, "eff" | "err">> = [];
  actions: AgAction[] = [];
  regions: AgRegion[] = [];
  modifiers: AgModifier[] = [];
  docs: Record<string, string> = {};
  private order = 0;

  private add(key: string, label: string, type: AgFieldType, value: AgValue, formula: string | null = null, options: AgFieldOptions = {}) {
    this.fields.push({ id: `f_${key}`, noteId: "SELF", key, label, type, value, formula, options, acl: { view: "inherit", edit: "inherit" }, sortOrder: this.order++, templateFieldId: null });
    return this;
  }
  num(key: string, label: string, value: number, options: AgFieldOptions = {}) { return this.add(key, label, "number", value, null, options); }
  text(key: string, label: string, value = "", options: AgFieldOptions = {}) { return this.add(key, label, "text", value, null, options); }
  bool(key: string, label: string, value = false) { return this.add(key, label, "boolean", value); }
  choice(key: string, label: string, choices: string[], value: string, colors?: Record<string, string>) { return this.add(key, label, "select", value, null, { choices, choiceColors: colors }); }
  calc(key: string, label: string, formula: string, resultType: "number" | "text" = "number") { return this.add(key, label, "formula", null, formula, { resultType }); }
  /** A tooltip (the ? beside the value wherever it's shown). */
  tip(key: string, text: string) { const f = this.fields.find((x) => x.key === key); if (f) f.options = { ...f.options, tooltip: text }; return this; }
  dice(key: string, label: string, expr: string) { return this.add(key, label, "dice", null, expr); }

  action(id: string, name: string, steps: AgActionStep[], color: string | null = null, edit: "owners" | "gm" | "everyone" = "owners", options?: AgActionOptions) {
    this.actions.push({ id, noteId: "SELF", name, steps, acl: { view: "inherit", edit }, color, ...(options ? { options } : {}) });
    return id;
  }
  /** A roll set up with boxes (dice, what's added, costs) — see the Rolls block. */
  roll(id: string, name: string, roll: { via: string; count?: string; die: string; add?: string; bonus?: string; costs?: Array<{ key: string; amount: string }>; scale?: AgRollScale }, icon: string, color: string, sortOrder: number) {
    return this.action(id, name, [], color, "owners", {
      roll: { via: roll.via, count: roll.count ?? "1", die: roll.die, add: roll.add ?? "", bonus: roll.bonus ?? "0", costs: roll.costs ?? [], ...(roll.scale ? { scale: roll.scale } : {}) },
      icon, showName: true, showIcon: true, listed: true, sortOrder,
    });
  }
  region(id: string, label: string | null, nodes: DocNode[], acl: AgRegion["acl"] = { view: "inherit", edit: "inherit" }) {
    this.regions.push({ id, noteId: "SELF", acl, inline: false, label, templateRegionId: null });
    this.docs[`region:${id}`] = buildDocState(nodes);
    return id;
  }
  modifier(via: string, targetKey: string, amount: string, condition: string | null, label: string) {
    this.modifiers.push({ id: `m_${this.modifiers.length}`, noteId: "SELF", via, targetKey, op: "add", amount, condition, label });
  }
  snapshot(note: { type: string; name: string; description: string; playersCanCreate?: boolean }, page: DocNode[], canvases: Record<string, Record<string, unknown>[]> = {}): AgSnapshot {
    return {
      note: {
        type: note.type, isTemplate: true, templateMeta: { version: 1, description: note.description, playersCanCreate: !!note.playersCanCreate },
        templateId: null, templateVersion: null, name: note.name, portrait: null, ownerIds: [],
        acl: { ...CA_SHEET_ACL }, bodyAcl: { view: "inherit", edit: "inherit" }, tokenBars: null, folder: CA_KIT_FOLDER, sortOrder: 0,
      },
      fields: this.fields, regions: this.regions, actions: this.actions, modifiers: this.modifiers,
      docs: { ...this.docs, note: buildDocState(page, canvases) },
    };
  }
}

/** A titled, framed section: icon + title (and its ? when it has one) on the left, a value on the right, then a body. */
function framed(sheet: Sheet, id: string, iconName: string, title: string, right: Array<DocNode | ReturnType<typeof t> | string>, body: DocNode[], help?: string): DocNode {
  sheet.region(`r_${id}`, title, [
    columns([[p(icon(iconName, GILT, 18), " ", b(title), ...(help ? [" ", tip(help)] : []))], [pAlign("right", ...right)]], { ratio: "3:2", gap: 8 }),
    ...body,
  ]);
  return section(`r_${id}`, SECTION_LOOK);
}

// --------------------------------------------------------------------------- the character
function characterTemplate(): AgSnapshot {
  const s = new Sheet();
  // Identity
  s.text("race", "Race", "Human").num("dc", "DC", 5).choice("size", "Size", ["Tiny", "Small", "Medium", "Large", "Huge"], "Medium")
    .num("speed", "Speed", 30).num("fly_speed", "Fly Speed", 0).num("swim_speed", "Swim Speed", 15)
    .num("age", "Age", 20).text("birthday", "Birthday").text("languages", "Languages", "Common");
  // Rank — read straight off the Energy Pool, never set by hand.
  s.num("energy_pool", "Energy Pool", 0, { min: 0 })
    .calc("rank_index", "Rank step", RANK_FORMULAS.rank_index)
    .calc("rank", "Rank", RANK_FORMULAS.rank, "text")
    .calc("to_next_rank", "To next rank", RANK_FORMULAS.to_next_rank)
    .calc("rank_next", "Next rank", `if(to_next_rank > 0, concat(to_next_rank, " to next"), "top of the ladder")`, "text")
    .tip("rank", rankTooltip())
    .calc("lifespan", "Lifespan", RANK_FORMULAS.lifespan)
    .calc("absorption_limit", "Absorption limit", RANK_FORMULAS.absorption_limit);
  // Health, Energy, Focus
  // Each current value goes up with its maximum (a rank up adds its extra, without refilling);
  // Temp HP is taken before HP and shows in green on the bar.
  s.calc("hp_max", "Max HP", RANK_FORMULAS.hp_max).num("hp", "HP", 20, { min: 0, follows: "hp_max", shield: "temp_hp" })
    .num("temp_hp", "Temp HP", 0, { min: 0, color: TEMP_HP_COLOR })
    .calc("usable_energy", "Usable Energy", USABLE_FORMULA).num("energy", "Energy", 0, { min: 0, follows: "usable_energy", shield: "temp_energy" })
    .num("temp_energy", "Temp Energy", 0, { min: 0, color: TEMP_ENERGY_COLOR })
    .calc("focus_max", "Max Focus", FOCUS_FORMULA).num("focus", "Focus", 6, { min: 0, follows: "focus_max" })
    .calc("wounds_count", "Wounds", "count(@wounds.name)");
  // Attributes: value → die size (0 d6, 1 d8, 2 d10, 3 d12, 4+ d20)
  for (const a of ATTRS) {
    s.num(a.key, a.name, 0, { min: 0, max: 5 });
    s.calc(`${a.key}_die`, `${a.name} die`, `choose(clamp(${a.key}, 0, 4), 6, 8, 10, 12, 20)`);
    s.calc(`${a.key}_dice`, `${a.abbr} die`, `concat("d", ${a.key}_die)`, "text");
  }
  // Point budgets
  // Budgets count what was spent, so wounds and gear (modifiers) don't change them.
  const attrSum = ATTRS.map((a) => `base(${a.key})`).join(" + ");
  const negatives = SKILLS.map((k) => `min(base(${k.key}), 0)`).join(" + ");
  const positives = SKILLS.map((k) => `max(base(${k.key}), 0)`).join(" + ");
  s.num("bonus_attr_points", "Bonus attribute points", 0, { min: 0, tooltip: "Extra attribute points from training items (manuals, pills, elixirs…). They add to the budget." })
    .num("bonus_skill_points", "Bonus skill points", 0, { min: 0, tooltip: "Extra skill points from training items. They add to the budget." });
  s.calc("attr_budget", "Attribute budget", ATTR_BUDGET_FORMULA).calc("attr_used", "Attribute points used", attrSum)
    .calc("attr_points", "Attribute Points", `concat(attr_used, " / ", attr_budget, if(attr_used > attr_budget, " (too many)", ""))`, "text");
  for (const k of SKILLS) s.num(k.key, `${k.name} (${ABBR[k.parent]})`, 0, { min: -2, max: 10 });
  s.calc("skill_reclaimed", "Skill points reclaimed", `min(6, -(${negatives}))`)
    .calc("skill_budget", "Skill budget", SKILL_BUDGET_FORMULA).calc("skill_used", "Skill points used", positives)
    .calc("skill_points", "Skill Points", `concat(skill_used, " / ", skill_budget, if(skill_used > skill_budget, " (too many)", ""))`, "text");
  // Crafting skills: standalone bonuses (no attribute), added to Quick Craft rolls.
  s.num("blacksmithing", "Blacksmithing", 0, { tooltip: CRAFT_SKILL_HELP.blacksmithing })
    .num("alchemy", "Alchemy", 0, { tooltip: CRAFT_SKILL_HELP.alchemy })
    .num("rune_making", "Rune Making", 0, { tooltip: CRAFT_SKILL_HELP.rune_making });
  // Cultivation (abilities are their own sheets — see the Ability tab)
  s.text("cultivation", "Cultivation", "");
  // Inventory totals
  s.num("weight_capacity", "Carry weight", 50, { min: 0 }).calc("carried", "Weight carried", "sum(@items.total_weight)")
    .calc("currency", "Currency", "sum(@items.coin_total)");

  // Skill roll buttons
  const roll = (k: typeof SKILLS[number]) => s.action(`a_${k.key}`, k.name, [{ type: "roll", name: "r", expr: `roll(1, ${k.parent}_die) + ${k.key}`, label: k.name }], "#78350f");
  const skillRolls = Object.fromEntries(SKILLS.map((k) => [k.key, roll(k)]));
  // Joins the campaign's initiative order with 1d20 + Finesse (the C.A. rule).
  const initiative = s.action("a_initiative", "Initiative", [{ type: "initiative", expr: "1d20 + finesse", label: "Initiative" }], "#b45309", "owners", { icon: "fa-solid fa-bolt", showName: true, showIcon: true, listed: false });

  const overview: DocNode[] = [
    ...vitalsNodes(initiative),
    canvas("cv_identity", 648, 162),
    ...traitsNodes(),
    hr(),
    framed(s, "wounds", "HeartPulse", "Wounds", [val("wounds_count", { look: { bold: true } })], [
      links("wounds", [{ ref: "severity", display: "badge" }, { ref: "location", display: "badge" }, { ref: "", display: "effects" }], {
        layout: "cards", accentBy: "severity", add: { types: ["wound"], reverse: "bearer", existing: false }, remove: "delete", emptyText: "No wounds.",
      }),
    ], WOUNDS_HELP),
  ];

  // ---- Skills
  const attrBoxes: Record<string, unknown>[] = [];
  ATTRS.forEach((a, n) => {
    const x = 4 + (n % 3) * 216, y = 4 + Math.floor(n / 3) * 84;
    attrBoxes.push({ id: `bg_${a.key}`, x, y, w: 208, h: 76, z: 0, widget: { kind: "shape", shape: "rect", color: "rgba(41,37,36,0.6)", border: "#d4a24c55", radius: 8 } });
    attrBoxes.push({ id: `n_${a.key}`, x, y: y + 8, w: 208, h: 16, z: 1, widget: { kind: "text", text: `${a.name} (${a.abbr})`, fontSize: 12, color: "#d6d3d1", align: "center" } });
    attrBoxes.push({ id: `v_${a.key}`, x: x + 60, y: y + 28, w: 50, h: 36, z: 1, widget: { kind: "field", ref: a.key, display: "value", showLabel: false, align: "right", look: { fontSize: 26, bold: true, color: GILT } } });
    attrBoxes.push({ id: `d_${a.key}`, x: x + 114, y: y + 38, w: 40, h: 20, z: 1, widget: { kind: "field", ref: `${a.key}_dice`, display: "value", showLabel: false, look: { fontSize: 12, textColor: "#a8a29e" } } });
  });
  const skillRows: Array<Array<DocNode[]>> = [[[p(b("Skill"))], [p(b("Die"))], [p(b("Mod"))], [p(b("Roll"))]]];
  for (const k of SKILLS) {
    skillRows.push([
      [p(b(k.name), muted(` (${ABBR[k.parent]})`)), p(t(k.desc, { italic: {}, textStyle: { color: "#78716c" } }))],
      [p(val(`${k.parent}_dice`, { look: { color: GILT } }))],
      [p(val(k.key, { display: "input" }))],
      [p(button(skillRolls[k.key], "Roll", { height: 26, fontSize: 12 }))],
    ]);
  }
  const skillsTab: DocNode[] = [
    budgetNodes(),
    canvas("cv_attributes", 652, 172),
    hr(),
    h(3, icon("Zap", GILT, 18), " Skills ", tip(SKILL_ROLL_NOTE)),
    table(skillRows),
    ...craftingSkillNodes(),
  ];

  // ---- Ability
  const abilityTab: DocNode[] = abilityTabContent();

  // ---- Inventory
  const inventoryTab: DocNode[] = [
    columns([
      [p(muted("Weight Carried")), p(val("carried", { look: { fontSize: 18, bold: true, textColor: "#4ade80" } }), t(" / ", { bold: {} }), val("weight_capacity", { look: { fontSize: 18, bold: true } }), muted(" lbs"))],
      [p(muted("Currency")), p(val("currency", { look: { fontSize: 18, bold: true, textColor: "#facc15" } }), muted(" coins"))],
    ], { ...SECTION_LOOK, gap: 12 }),
    itemsHeading(),
    links("items", [
      { ref: "item_type", display: "badge" }, { ref: "rank_tag", display: "badge" },
      { ref: "qty", display: "input", label: "Qty" }, { ref: "weight", display: "value", label: "Wt", suffix: "lbs" },
      { ref: "durability", display: "bar", label: "Dur", maxRef: "durability_max", color: "#22c55e" }, { ref: "value", display: "value", label: "Value" }, { ref: "sell_value", display: "value", label: "Sells" },
      { ref: "equipped", display: "toggle", label: "Equip" }, { ref: "", display: "rolls" },
    ], { layout: "cards", search: true, sortBy: "name", filterBy: "item_type", accentBy: "rank_tag", add: { types: ["item"], reverse: "owner", existing: true, ...ADD_ONLY }, remove: "disconnect", emptyText: "No items yet — press Add, or drag one here from the sidebar." }),
  ];

  const page: DocNode[] = [
    tabs("ca_tabs", [
      { title: "Overview", icon: "User", content: overview },
      { title: "Skills", icon: "Zap", content: skillsTab },
      { title: "Ability", icon: "Flame", content: abilityTab },
      { title: "Inventory", icon: "Backpack", content: inventoryTab },
    ], { color: GILT }),
  ];
  return s.snapshot({ type: "character", name: "CA Character", description: "The Cultivator's Adventure character sheet: rank, health, energy, focus, wounds, attributes, skills, abilities, inventory and traits." }, page, { cv_identity: identityChips(), cv_attributes: attrBoxes });
}

// ---- Crafting on the character (also used to bring existing characters up to date)
export const CRAFT_SKILL_HELP = {
  blacksmithing: "Your Blacksmithing bonus — its own number, not tied to an attribute. A Quick Craft rolls d20 + this.",
  alchemy: "Your Alchemy bonus — its own number, not tied to an attribute. A Quick Craft rolls d20 + this.",
  rune_making: "Your Rune Making bonus — its own number, not tied to an attribute. A Quick Craft rolls d20 + this.",
};
export const CRAFTING_HELP = "Three crafts, each a tool you play: **Blacksmithing** (forge weapon parts at the anvil, then assemble them), **Alchemy** (brew a recipe step by step, or experiment) and **Rune Making** (trace a rune's sigil onto an item). Everything they use and make is ordinary items in your inventory. The GM (and anyone it's shared with) can watch you craft, live.\n\n## Quick Craft · d20 + the craft's skill\nRoll | Result\nNatural 1 | Failed (no effect)\n2–11 | Weak\n12–19 | Standard\n20–24 | Fine\n25+ | Masterwork\n\nA natural 20 is at least Fine. A failed craft still makes the item — it just does nothing.";
export const CRAFT_SKILLS_TIP = "Standalone bonuses (not tied to an attribute). Each craft's Quick Craft rolls d20 + its skill.";
/** The crafting skills box at the bottom of the Skills tab. */
export function craftingSkillNodes(): DocNode[] {
  const cell = (iconName: string, color: string, key: string, label: string) => [p(icon(iconName, color, 16), " ", b(label)), p(val(key, { display: "input" }))];
  return [
    hr(),
    h(3, icon("Hammer", GILT, 18), " Crafting ", tip(CRAFT_SKILLS_TIP)),
    columns([cell("Hammer", "#fb923c", "blacksmithing", "Blacksmithing"), cell("FlaskConical", "#34d399", "alchemy", "Alchemy"), cell("PenTool", "#a78bfa", "rune_making", "Rune Making")], { ...SECTION_LOOK, padding: 10, gap: 10, boxed: true }),
  ];
}
/** The old Crafting tab (characters made before stations opened their crafts on their own sheets). */
export function craftingTabContent(): DocNode[] {
  return [h(3, icon("Anvil", GILT, 18), " Crafting ", tip(CRAFTING_HELP)), { type: "agCraftStation", attrs: { kinds: [] } }];
}

/** On a station item's page: its craft, open right there for whoever holds it. */
export const craftBenchNode = (): DocNode => ({ type: "agCraftBench" });
export const SCROLL_HELP = "Whoever carries this scroll knows what it teaches. **Blacksmithing** needs a blueprint's scroll to forge it. **Alchemy** works without one (experiment), but a recipe's scroll guides the brew. **Rune Making** works freehand without one; a rune's scroll lets you trace it over a guide. A recipe also has to be one the station allows. The GM makes scrolls from a recipe sheet (Make a scroll).";
/** A scroll's page: what it teaches (read from the recipe it was made from). */
export function scrollNodes(): DocNode[] {
  return [h(3, icon("ScrollText", "#fcd34d", 16), " Scroll ", tip(SCROLL_HELP)), p(muted("TEACHES "), val("teaches_name", { look: { bold: true } })), { type: "agCraftDef" }];
}

/** An item's rune slots: how many its rank gives, and the runes set into them. */
export function runeSlotNodes(): DocNode[] {
  return [
    h(3, icon("Gem", "#c084fc", 16), " Runes ", tip(RUNE_SOCKETS_HELP)),
    p(muted("SOCKETS "), val("rune_sockets", { look: { bold: true } }), muted(" (from its rank)")),
    links("runes", [{ ref: "boosts", display: "value", label: "" }, { ref: "rune_tier", display: "badge" }], { layout: "cards", add: { types: ["item"], reverse: "socket", existing: true }, remove: "disconnect", emptyText: "No runes yet — a rune maker inscribes them." }),
  ];
}

// ---- The Overview's parts (also used to bring existing characters up to date)
export const RANK_HELP = "Read off the Energy Pool: nine ranks, Mortal to Paragon, of nine Pillars each. Health and Lifespan come with the rank; Focus and skill points rise on each rank up and on Pillars 2, 4, 6 and 8. The ? beside your rank shows the whole ladder.";
/** The texts before Pillars, to find and replace on existing sheets. */
export const LEGACY_RANK_HELP = "Read off the Energy Pool. Bronze 1 starts at 0; each star and rank above raises Health and Focus. The ? beside your rank shows the whole ladder.";
export const DC_HELP = "Your defence: an attack has to beat it. Equipped armor and other effects add to it. Beating it by 5 or more wounds you (see Wounds).";
export const INITIATIVE_HELP = "Rolls **1d20 + Finesse** and puts you in the turn order.";
export const LEGACY_HEALTH_HELP = "20 base, +5 per star, +10 per rank — a rank up adds its extra HP to your current HP. **Temp HP** is taken before HP and shows in green on the bar (the +number). Click the bar to heal or hurt, or to set Temp HP.";
export const HEALTH_HELP = "Set by your rank: Mortal 50, Awakened 100, Tempered 150, Refined 200, Enlightened 250, Exalted 300, Ascendant 500, Transcendent 700, Paragon 1,000 — a rank up adds its extra HP to your current HP. **Temp HP** is taken before HP and shows in green on the bar (the +number). Click the bar to heal or hurt, or to set Temp HP.";
export const POOL_HELP = "All the energy you've cultivated. It sets your Rank; it doesn't run down when you use abilities — that's Energy, below.";
export const LEGACY_ENERGY_HELP = "What you have to spend on abilities, up to your **Usable Energy** (after the /). Usable Energy is set by your star: it goes up when you break through, not with every point of the pool. **Temp Energy** is spent first and shows in pink on the bar (the +number). Click the bar to spend or restore, or to set Temp Energy.";
export const ENERGY_HELP = "What you have to spend on abilities, up to your **Usable Energy** (after the /). Usable Energy is the floor of the Pillar you're on (257 in an Awakened pool → 200): it goes up when you break through to the next Pillar, not with every point of the pool. **Temp Energy** is spent first and shows in pink on the bar (the +number). Click the bar to spend or restore, or to set Temp Energy.";
export const WOUNDS_HELP = "Minor = 5+ over the DC · Moderate = 10+ · Severe = 15+. A wound's effects change skills and speed while it lasts — open it to Treat it.";
export const TRAITS_HELP = "Hover a trait (tap it on a phone) to see what it does and use its rolls. Click it (double-tap or hold on a phone) to open it. **Show all** lays every trait out in full — just for you, and it stays that way until you press it again.";
/** The vitals' boxes: each stat in its own frame, boxes in a row the same height. */
export const VITALS_LOOK = { bg: "#1c1917", outline: "#d4a24c55", radius: 10, padding: 10, gap: 10, boxed: true };
/**
 * Rank, Energy Pool, DC and Initiative, then Health, Energy and Focus — two rows
 * of matching boxes at the top of the Overview. Each resource is a bar with its
 * numbers on it; clicking it sets the value (and its Temp points).
 */
export function vitalsNodes(initiativeActionId: string | null): DocNode[] {
  const title = (iconName: string, color: string, text: string, help: string) => p(icon(iconName, color, 16), " ", b(text), " ", tip(help));
  const big = (ref: string, color?: string) => val(ref, { look: { bold: true, fontSize: 16, ...(color ? { color } : {}) } });
  const bar = (ref: string, maxRef: string, color: string) => block(ref, { maxRef, display: "bar", showLabel: false, look: { color, track: "#3f3a2a", height: 16, radius: 4, numbers: "fraction", fontSize: 11 } });
  return [
    columns([
      [title("Landmark", GILT, "Rank", RANK_HELP), p(big("rank", GILT), "  ", val("rank_next", { look: { textColor: "#78716c", fontSize: 11 } }))],
      [title("Zap", GILT, "Energy Pool", POOL_HELP), p(big("energy_pool"))],
      [title("Shield", GILT, "DC", DC_HELP), p(big("dc", GILT))],
      [title("Swords", GILT, "Initiative", INITIATIVE_HELP), ...(initiativeActionId ? [p(button(initiativeActionId, "Roll", { height: 26, fontSize: 12 }))] : [])],
    ], VITALS_LOOK),
    columns([
      [title("Heart", "#f43f5e", "Health", HEALTH_HELP), bar("hp", "hp_max", "#f43f5e")],
      [title("Zap", "#22d3ee", "Energy", ENERGY_HELP), bar("energy", "usable_energy", "#06b6d4")],
      [title("Sparkles", "#a78bfa", "Focus", FOCUS_NOTE), bar("focus", "focus_max", "#8b5cf6")],
    ], VITALS_LOOK),
  ];
}
/** Race, size, age… as chips (no Level — C.A. goes by rank — and DC is up in the vitals); Languages runs the whole last row. */
export function identityChips(): Record<string, unknown>[] {
  const chip = (key: string, label: string, iconName: string, suffix?: string, w = 152) => ({ key, label, iconName, suffix, w });
  const grid = [
    [chip("race", "Race", "User"), chip("size", "Size", "Ruler"), chip("age", "Age", "Clock"), chip("birthday", "Birthday", "CalendarDays")],
    [chip("speed", "Speed", "Footprints", "ft"), chip("fly_speed", "Fly speed", "Feather", "ft"), chip("swim_speed", "Swim speed", "Waves", "ft"), chip("lifespan", "Lifespan", "Hourglass", "yrs")],
    [chip("languages", "Languages", "Languages", undefined, 152 * 4 + 8 * 3)],
  ];
  const chips: Record<string, unknown>[] = [];
  grid.forEach((row, r) => {
    let x = 4;
    row.forEach((c) => {
      const y = 4 + r * 52;
      chips.push({ id: `bg_${c.key}`, x, y, w: c.w, h: 46, z: 0, widget: { kind: "shape", shape: "rect", color: "rgba(41,37,36,0.6)", border: "#d4a24c55", radius: 8 } });
      chips.push({ id: `v_${c.key}`, x: x + 8, y: y + 4, w: c.w - 12, h: 38, z: 1, widget: { kind: "field", ref: c.key, display: "value", showLabel: true, label: c.label, look: { labelPos: "below", labelUpper: true, labelSize: 9, fontSize: 14, bold: true, iconName: c.iconName, iconColor: GILT, suffix: c.suffix } } });
      x += c.w + 8;
    });
  });
  return chips;
}
export const TRAIT_ICON_COLUMNS = [{ ref: "summary", display: "text" }, { ref: "", display: "effects" }, { ref: "", display: "rolls" }];
export const TRAIT_ICON_CONFIG = {
  layout: "icons", expand: "page", add: { types: ["trait"], reverse: "holder", existing: true, ...ADD_ONLY }, remove: "disconnect", emptyText: "No traits yet.",
};
/** The character's traits as small icons on the Overview. */
export function traitsNodes(): DocNode[] {
  return [h(3, icon("Star", GILT, 18), " Traits ", tip(TRAITS_HELP)), links("traits", TRAIT_ICON_COLUMNS, TRAIT_ICON_CONFIG)];
}
/** Attribute and skill points at the top of the Skills tab. */
export function budgetNodes(): DocNode {
  return columns([
    [p(b("Attribute Points"), " ", tip(`${ATTR_BUDGET_NOTE}\n\n${ATTR_DIE_NOTE}`), "  ", val("attr_points", { look: { color: GILT, bold: true } }))],
    [p(b("Skill Points"), " ", tip(SKILL_BUDGET_NOTE), "  ", val("skill_points", { look: { color: GILT, bold: true } }))],
  ], { gap: 12 });
}
/** The Inventory tab's heading over the items. */
export function itemsHeading(): DocNode { return h(3, icon("Backpack", GILT, 18), " Items ", tip(INVENTORY_HELP)); }

// --------------------------------------------------------------------------- abilities & aspects
// An Ability is a set (gravity control, ember arts…); each single use of it is a
// Aspect: its own small sheet with rolls, costs and effects, connected to the
// ability (aspect —ability→ ability —holder→ character). The character's
// Ability tab lists the abilities, then every aspect of every ability,
// each tagged with the ability it belongs to.
export const INVENTORY_HELP = "Each item's rolls are on its card (hold a roll for advantage, disadvantage or a modifier). Click an item to open it and set its rolls up. Equipped items' bonuses (and a backpack's extra carry weight) apply on their own. Items given here are this character's own copies (their own notes); the original stays to give again. Drag a copy onto someone else to move it; the remove button puts it away in “Player Owned Copies”.";
export const ABILITY_HELP = "Each ability is a set of aspects. Open one to see its aspects and make new ones. GM: Add (or drag an ability here from the sidebar) gives this character their own copy of it, aspects and all; the remove button puts it away in “Player Owned Copies”.";
export const ASPECT_HELP = "Every aspect from this character's abilities (and the abilities inside them); the tag shows which ability it's from (click it to open the ability). Each roll shows what it rolls and costs; pressing it spends the cost first. Hold a roll for advantage, disadvantage or a modifier.";
export const ABILITY_LIST_COLUMNS = [
  { ref: "aspects", display: "connection", label: "Aspects" }, { ref: "abilities", display: "connection", label: "Abilities within" }, { ref: "description", display: "text" },
];
export const ABILITY_LIST_CONFIG = {
  layout: "cards", search: true, sortBy: "name", accentBy: "tag_color",
  add: { types: ["ability"], reverse: "holder", existing: true, ...ADD_ONLY }, remove: "disconnect", emptyText: "No abilities yet — the GM adds them with Add, or drags one here from the sidebar.",
};
export const ASPECT_COLUMNS = [
  { ref: "category", display: "badge" }, { ref: "range", display: "value", label: "Range" }, { ref: "duration", display: "value", label: "Duration" },
  { ref: "description", display: "text" }, { ref: "", display: "rolls" },
];
/** Every aspect of every ability the character has, tagged (and coloured) by its ability. */
export const ASPECT_LIST_COLUMNS = [{ ref: "ability", display: "connection" }, ...ASPECT_COLUMNS];
export const ASPECT_LIST_CONFIG = {
  layout: "cards", search: true, sortBy: "name", filterBy: "ability", accentBy: "ability",
  add: { types: ["aspect"], reverse: "ability", existing: true, ...COPY }, remove: "none", emptyText: "No aspects yet — open an ability to make one.",
};
/** Abilities inside an ability (a trapped creature's powers inside "Soul Prison"): their aspects are its holder's too. */
export const SUB_ABILITY_CONFIG = {
  layout: "cards", search: true, sortBy: "name", accentBy: "tag_color",
  add: { types: ["ability"], reverse: "holder", existing: true, ...ADD_ONLY }, remove: "disconnect", emptyText: "None — press Add, or drag an ability here (from the sidebar, or off another sheet).",
};
export const SUB_ABILITY_HELP = "Abilities inside this one: their aspects are the character's too, rolled and paid by them. Unlink one (the remove button) and all its aspects go with it; it stays in “Player Owned Copies” to put back later.";
/** An ability's own list of its aspects. */
export const ABILITY_ASPECTS_CONFIG = {
  layout: "cards", search: true, sortBy: "name", filterBy: "category", accentBy: "category",
  add: { types: ["aspect"], reverse: "ability", existing: true, ...COPY }, remove: "disconnect", emptyText: "No aspects yet — press Add to make one.",
};
/** Who rolls and pays for an aspect: its ability's holder — and if that's another ability, its holder, up to the character. */
export const ASPECT_VIA = "ability.holder*";
/** Every ability a character has, and the abilities inside those. */
export const ALL_ABILITIES = "abilities+";
export const DEFAULT_ABILITY_COLOR = "#a78bfa";
const ABILITY_TAG_COLORS = ["#a78bfa", "#f87171", "#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#2dd4bf", "#fb923c"];
/** A colour for the n-th ability (so a character's abilities don't all look alike). */
export const abilityColor = (n: number) => ABILITY_TAG_COLORS[n % ABILITY_TAG_COLORS.length];

export const CULTIVATION_HELP = "Energy type. Double-click to set it.";
/** The character's Ability tab: cultivation, its abilities, then all their aspects. */
export function abilityTabContent(): DocNode[] {
  return [
    columns([[p(icon("Flame", GILT, 18), " ", b("Cultivation"), " ", tip(CULTIVATION_HELP))], [pAlign("right", val("cultivation", { look: { bold: true } }))]], { ...SECTION_LOOK, ratio: "3:2", gap: 8 }),
    h(3, icon("Sparkles", GILT, 18), " Abilities ", tip(ABILITY_HELP)),
    links("abilities", ABILITY_LIST_COLUMNS, ABILITY_LIST_CONFIG),
    h(3, icon("Swords", GILT, 18), " Ability Aspects ", tip(ASPECT_HELP)),
    links(`${ALL_ABILITIES}.aspects`, ASPECT_LIST_COLUMNS, ASPECT_LIST_CONFIG),
  ];
}

export function abilityTemplateSnapshot(): AgSnapshot { return abilityTemplate(); }
export function aspectTemplateSnapshot(): AgSnapshot { return aspectTemplate(); }

export const ABILITY_ASPECTS_HELP = "Each aspect is one use of this ability, with its own rolls and Energy / Focus costs. Press Add to make one (or drag one here from the sidebar); open it to set its rolls up. The character who has this ability rolls and pays.";
/** An ability's tag colour (its ? explains it). */
export const tagColourLine = (): DocNode => p(muted("Tag colour "), val("tag_color", { display: "input" }));
/** An ability's page: what it is, its tag colour, its aspects, passive effects, GM notes. */
export function abilityPage(gmRegionId: string | null): DocNode[] {
  return [
    block("description", { display: "value", showLabel: false, look: { fontSize: 13, textColor: "#d6d3d1" } }),
    tagColourLine(),
    h(3, icon("Swords", GILT, 16), " Ability Aspects ", tip(ABILITY_ASPECTS_HELP)),
    links("aspects", ASPECT_COLUMNS, ABILITY_ASPECTS_CONFIG),
    ...subAbilityNodes(),
    ...effectsNodes("holder*", "", "Passive changes this ability makes to the character who has it (leave empty if none)."),
    ...(gmRegionId ? [section(gmRegionId, { bg: "#451a0322", outline: "#f59e0b66", radius: 8, padding: 8 })] : []),
  ];
}

/** An ability's "Abilities within" heading, list and help. */
export function subAbilityNodes(): DocNode[] {
  return [h(3, icon("Orbit", GILT, 16), " Abilities within ", tip(SUB_ABILITY_HELP)), links("abilities", ABILITY_LIST_COLUMNS, SUB_ABILITY_CONFIG)];
}

/** The ability an aspect belongs to, as a card at the top of its page. */
export function aspectAbilityNode(): DocNode {
  return links("ability", [{ ref: "description", display: "text" }], { layout: "cards", accentBy: "tag_color", emptyText: "Not part of an ability yet — make it from an ability's Aspects, or connect it to one." });
}
export const ASPECT_ROLLS_HELP = "Each roll has its own dice, bonus and Energy / Focus cost, rolled and paid by whoever has this aspect's ability. Hold a roll for advantage, disadvantage or a modifier. Double-click any value to change it.";
export const ASPECT_TEMPLATE_DESCRIPTION = "An aspect: one use of an ability — category, range, duration and as many rolls as it needs, each with its own dice and Energy / Focus cost.";

/** An aspect's page: its ability, category, description, range / duration, its rolls, effects, GM notes. */
export function aspectPage(gmRegionId: string | null): DocNode[] {
  return [
    aspectAbilityNode(),
    p(val("category", { display: "badge" })),
    block("description", { display: "value", showLabel: false, look: { fontSize: 13, textColor: "#d6d3d1" } }),
    p(muted("Range "), val("range", { look: { bold: true } }), "    ", muted("Duration "), val("duration", { look: { bold: true } })),
    h(3, icon("Dices", GILT, 16), " Rolls ", tip(ASPECT_ROLLS_HELP)),
    rolls(ASPECT_VIA, ["energy", "focus"], "#9f1239", SECTION_LOOK),
    ...effectsNodes(ASPECT_VIA, "", "Passive changes this aspect makes to whoever has its ability (leave empty if none)."),
    ...(gmRegionId ? [section(gmRegionId, { bg: "#451a0322", outline: "#f59e0b66", radius: 8, padding: 8 })] : []),
  ];
}

function abilityTemplate(): AgSnapshot {
  const s = new Sheet();
  s.text("description", "Description", "").text("tag_color", "Tag colour", DEFAULT_ABILITY_COLOR, { isColor: true, tooltip: "The colour of this ability's tag on its aspects, and of their cards on the character sheet." });
  s.region("r_gm", "GM notes", [p(t("GM only: ", { bold: {}, textStyle: { color: "#fbbf24" } }), i("notes about this ability only the GM sees."))], { view: "gm", edit: "gm" });
  return s.snapshot({ type: "ability", name: "CA Ability", description: "An ability: a set of aspects (its single uses), each with its own rolls and costs." }, abilityPage("r_gm"));
}

function aspectTemplate(): AgSnapshot {
  const s = new Sheet();
  s.choice("category", "Category", ABILITY_CATEGORIES, "Attack", ABILITY_COLORS)
    .text("range", "Range", "").text("duration", "Duration", "").text("description", "Description", "");
  // One roll to start; the GM adds more (an attack and its damage, two costs…) in the Rolls block.
  s.roll("a_roll", "Roll", { via: ASPECT_VIA, die: `@${ASPECT_VIA}.anemos_die`, add: "arcana", costs: [{ key: "energy", amount: "10" }, { key: "focus", amount: "0" }] }, "die:d20", "#9f1239", 1);
  s.region("r_gm", "GM notes", [p(t("GM only: ", { bold: {}, textStyle: { color: "#fbbf24" } }), i("notes about this aspect only the GM sees."))], { view: "gm", edit: "gm" });
  return s.snapshot({ type: "aspect", name: "CA Ability Aspect", description: ASPECT_TEMPLATE_DESCRIPTION }, aspectPage("r_gm"));
}

// ---- Before aspects (kit levels 1–7): an ability was one single use, held by the character.
// Kept for the upgrade steps that bring old campaigns forward one level at a time.
export const LEGACY_ABILITY_HELP = "Each roll shows what it rolls and costs; pressing it spends the cost first (it won't if there isn't enough). Hold a roll for advantage, disadvantage or a modifier. GM: Add gives this character a new ability or one that already exists; open an ability to add rolls and choose which show here.";
export const LEGACY_INVENTORY_HELP = "Each item's rolls are on its card (hold a roll for advantage, disadvantage or a modifier). Click an item to open it and set its rolls up. Equipped items' bonuses (and a backpack's extra carry weight) apply on their own.";
export const LEGACY_ABILITY_LIST_COLUMNS = [
  { ref: "category", display: "badge" }, { ref: "range", display: "value", label: "Range" }, { ref: "duration", display: "value", label: "Duration" },
  { ref: "description", display: "text" }, { ref: "", display: "rolls" },
];
const LEGACY_ABILITY_LIST_CONFIG = {
  layout: "cards", search: true, sortBy: "name", filterBy: "category", accentBy: "category",
  add: { types: ["ability"], reverse: "holder", existing: true }, remove: "delete", emptyText: "No abilities yet — the GM adds them with Add.",
};

/** The character's Ability tab: cultivation, then every ability as a card with its roll, cost and Use button. */
export function legacyAbilityTabContent(): DocNode[] {
  return [
    columns([[p(icon("Flame", GILT, 18), " ", b("Cultivation"))], [pAlign("right", val("cultivation", { look: { bold: true } }))]], { ...SECTION_LOOK, ratio: "3:2", gap: 8 }),
    p(muted("Energy type. Double-click to set it.")),
    h(3, icon("Sparkles", GILT, 18), " Abilities"),
    links("abilities", LEGACY_ABILITY_LIST_COLUMNS, LEGACY_ABILITY_LIST_CONFIG),
    p(muted(LEGACY_ABILITY_HELP)),
  ];
}

export function legacyAbilityTemplateSnapshot(): AgSnapshot { return legacyAbilityTemplate(); }

/** An ability's page: category, description, range / duration, its rolls, GM notes (that region's id). */
export function legacyAbilityPage(gmRegionId: string | null): DocNode[] {
  return [
    p(val("category", { display: "badge" })),
    block("description", { display: "value", showLabel: false, look: { fontSize: 13, textColor: "#d6d3d1" } }),
    p(muted("Range "), val("range", { look: { bold: true } }), "    ", muted("Duration "), val("duration", { look: { bold: true } })),
    h(3, icon("Dices", GILT, 16), " Rolls"),
    rolls("holder", ["energy", "focus"], "#9f1239", SECTION_LOOK),
    p(muted("Each roll has its own dice, bonus and Energy / Focus cost. Hold a roll for advantage, disadvantage or a modifier. Double-click any value to change it.")),
    ...effectsNodes("holder", "", "Passive changes this ability makes to its holder (leave empty if none)."),
    ...(gmRegionId ? [section(gmRegionId, { bg: "#451a0322", outline: "#f59e0b66", radius: 8, padding: 8 })] : []),
  ];
}

export const WOUND_EFFECTS_HELP = "What this wound does to its bearer while it lasts — each one really changes that value (the red number beside it on the character). Treat or heal the wound and they're gone.";
export const ITEM_EFFECTS_HELP = "What this item changes on its owner. New effects only count while it's equipped (change “equipped” to always for ones that apply anyway).";
/** An "Effects" heading and block: changes this sheet makes to `via`'s values. */
export function effectsNodes(via: string, condition: string, help: string): DocNode[] {
  return [h(3, icon("Activity", GILT, 16), " Effects ", tip(help)), effects(via, condition, SECTION_LOOK)];
}

/** An item's rolls heading and block. */
export function itemRollsNodes(): DocNode[] {
  return [h(3, icon("Dices", GILT, 16), " Rolls"), rolls("owner", [], "#b45309", SECTION_LOOK)];
}
export const CA_ITEM_TEMPLATE_NAMES = ["CA Weapon", "CA Armor", "CA Consumable", "CA Rune", "CA Container", "CA Currency", "CA Ammunition", "CA Item", "CA Training Item"];
export function trainingTemplateSnapshot(): AgSnapshot { return itemTemplate("Training"); }

function legacyAbilityTemplate(): AgSnapshot {
  const s = new Sheet();
  s.choice("category", "Category", ABILITY_CATEGORIES, "Attack", ABILITY_COLORS)
    .text("range", "Range", "").text("duration", "Duration", "").text("description", "Description", "");
  // One roll to start; the GM adds more (an attack and its damage, two costs…) in the Rolls block.
  s.roll("a_roll", "Roll", { via: "holder", die: "@holder.anemos_die", add: "arcana", costs: [{ key: "energy", amount: "10" }, { key: "focus", amount: "0" }] }, "die:d20", "#9f1239", 1);
  s.region("r_gm", "GM notes", [p(t("GM only: ", { bold: {}, textStyle: { color: "#fbbf24" } }), i("notes about this ability only the GM sees."))], { view: "gm", edit: "gm" });
  return s.snapshot({ type: "ability", name: "CA Ability", description: "An ability: category, range, duration and as many rolls as it needs, each with its own dice and Energy / Focus cost." }, legacyAbilityPage("r_gm"));
}

// --------------------------------------------------------------------------- items
export const POTENCY_HELP = "Brewed potions: how well it was brewed adds to (or takes from) its heal. A failed brew is inert — it heals nothing.";
/** The Heal HP step's value: the roll plus potency; nothing if the brew failed. */
export const HEAL_VALUE = "if(inert, 0, max(0, $heal + potency))";
export const MATERIAL_HELP = "For Blacksmithing. **Heat**: the range the metal must be kept in while hammering (set “to” 0 for materials that aren't heated — wood, leather). **Hardness**: harder metal moves less per blow but lasts longer. **Colour**: how it looks forged.";
export const INGREDIENT_HELP = "For Alchemy and Rune Making: recipes ask for it by name (or by this sheet — copies of it count).";
export const INK_HELP = "A liquid or ink for Rune Making. A rune drawn or carved with it takes its **colour**, and **glows** as brightly as its glow (0 = none, 100 = blazing) — on the item and its picture.";
export const TOOL_HELP = "A carving tool or pen for Rune Making. **Carved**: the rune is cut into the item. **Drawn**: it's drawn on. The tool used sets the look.";
export const STATION_HELP = "A crafting station: a **Forge** for Blacksmithing, an **Alchemist Pot** for Alchemy, a **Runemaking Pen** for Rune Making. Open its sheet to craft — the craft opens right below, for whoever carries it; pressing **Craft** puts you at the controls. Its Quick Craft bonus adds to Quick Craft rolls. The GM's **Station setup** picks which recipes can be made at it, so a better forge can make more. Any item can be made a station (Insert → Crafting station).";
export const PART_HELP = "A part forged at the anvil. Its quality comes from the hammering; its durability from keeping the heat right. Assemble parts into a weapon from Blacksmithing.";
export const TRAINING_HELP = "Using it raises that attribute or skill for good (and gives the matching point, so it doesn't use up the points they've earned), and adds any granted points to spend. One is used up each time.";
export const CONSUMABLE_HELP = "**Heal HP** rolls its dice and heals the owner. **Heal a wound** removes one of their wounds up to the severity it heals. Using one takes it from the stack; the last one is gone.";
export const consumableLine = (): DocNode => p(muted("Heals "), val("heal_dice", { look: { bold: true } }), muted(" HP, or one wound up to "), val("heal_wounds", { look: { bold: true } }));
export const RUNE_HELP = "Attach it to a weapon or armor from that item's Runes list. The GM can also make it change values (Links → Changes values).";
export const CONTAINER_HELP = "A Backpack raises its owner's carry weight by its capacity while equipped. A Storage Ring holds its own items (below).";
export type ItemKind = "Weapon" | "Armor" | "Consumable" | "Rune" | "Container" | "Currency" | "Ammunition" | "Miscellaneous" | "Training" | "Material" | "Ingredient" | "Ink" | "Tool" | "Part" | "Station" | "Scroll";
/** Crafting supplies and parts (see kits/caCrafting.ts). */
export const CA_CRAFT_ITEM_KINDS: ItemKind[] = ["Material", "Ingredient", "Ink", "Tool", "Part", "Station", "Scroll"];

/** What a training item can raise: every attribute and skill, by name → value key. */
const RAISABLE = [...ATTRS.map((a) => ({ name: a.name, key: a.key, kind: "attribute" })), ...SKILLS.map((k) => ({ name: k.name, key: k.key, kind: "skill" }))];

export function itemTemplate(kind: ItemKind): AgSnapshot {
  const s = new Sheet();
  s.choice("item_type", "Type", ITEM_TYPES, kind === "Training" ? "Consumable" : kind, ITEM_TYPE_COLORS)
    .choice("rank_tag", "Rank", ITEM_RANKS, ITEM_RANKS[0], ITEM_RANK_COLORS)
    .num("qty", "Qty", 1, { min: 0 }).num("weight", "Weight", kind === "Rune" || kind === "Currency" || kind === "Ink" || kind === "Ingredient" || kind === "Scroll" ? 0 : kind === "Material" ? 2 : 1, { min: 0, step: 0.1 })
    .calc("total_weight", "Total weight", "weight * qty").num("value", "Value", kind === "Currency" ? 1 : 10, { min: 0 })
    .calc("coin_total", "Coins", `if(item_type == "Currency", qty * value, 0)`)
    .num("durability", "Durability", 100, { min: 0, max: 100, tooltip: DURABILITY_HELP }).calc("durability_max", "Max durability", "100")
    .calc("sell_value", "Sells for", SELL_VALUE_FORMULA).tip("sell_value", SELL_HELP).bool("equipped", "Equipped", false);

  const body: DocNode[] = [];
  const stats = p(
    muted("QTY "), val("qty", { look: { bold: true } }), "    ",
    muted("WEIGHT "), val("weight", { look: { bold: true } }), muted(" lb"), "    ",
    muted("VALUE "), val("value", { look: { bold: true, textColor: "#f97316" } }), "    ",
    muted("SELLS FOR "), val("sell_value", { look: { bold: true, textColor: "#facc15" } }), "    ",
    muted("EQUIPPED "), val("equipped", { display: "input" }),
  );

  if (kind === "Weapon") {
    s.choice("handedness", "Handedness", ["Melee (one-handed)", "Melee (two-handed)", "Ranged"], "Melee (one-handed)");
    // Crafted weapons (and runes) raise these; the rolls add them.
    s.num("damage_bonus", "Damage bonus", 0, { tooltip: "Added to the Damage roll. Forging and runes raise it." }).num("accuracy", "Accuracy", 0, { tooltip: "Added to the Strike roll. A well-forged handle raises it." });
    s.roll("a_strike", "Strike", { via: "owner", die: "20", bonus: "accuracy" }, "die:d20", "#b45309", 1);
    // Damage Die: the wielder can spend Energy to roll more of the weapon's die.
    s.roll("a_damage", "Damage", { via: "owner", die: "8", bonus: "damage_bonus", scale: { step: String(defaultScaleStep(8)), pay: "energy" } }, "die:d8", "#b91c1c", 2);
    body.push(p(muted("HANDEDNESS "), val("handedness", { look: { bold: true } }), "    ", muted("DAMAGE "), val("damage_bonus", { look: { bold: true } }), "    ", muted("ACCURACY "), val("accuracy", { look: { bold: true } })));
  }
  if (kind === "Training") {
    // Manuals, pills, elixirs: using one raises a value for good, or grants points to spend.
    // A value it raises comes with a matching bonus point, so it never eats the points already earned.
    s.choice("raises", "Raises", ["Nothing", ...RAISABLE.map((r) => r.name)], "Nothing")
      .num("raise_by", "Raises by", 1, { min: 1, max: 10 })
      .calc("raise_key", "Value it raises", RAISABLE.reduceRight((acc, r) => `if(raises == "${r.name}", "${r.key}", ${acc})`, `""`), "text")
      .calc("raise_kind", "Kind it raises", RAISABLE.reduceRight((acc, r) => `if(raises == "${r.name}", "${r.kind}", ${acc})`, `""`), "text")
      .num("grants_attr_points", "Grants attribute points", 0, { min: 0 })
      .num("grants_skill_points", "Grants skill points", 0, { min: 0 });
    const use = s.action("a_train", "Use", [
      { type: "message", text: "{name} has to be in someone's inventory to be used.", when: "count(@owner.name) == 0" },
      { type: "stop", when: "count(@owner.name) == 0" },
      { type: "modify", target: "@owner.{raise_key}", op: "add", value: "raise_by", when: 'raise_key != ""' },
      { type: "modify", target: "@owner.bonus_attr_points", op: "add", value: "raise_by", when: 'raise_kind == "attribute"' },
      { type: "modify", target: "@owner.bonus_skill_points", op: "add", value: "raise_by", when: 'raise_kind == "skill"' },
      { type: "modify", target: "@owner.bonus_attr_points", op: "add", value: "grants_attr_points", when: "grants_attr_points > 0" },
      { type: "modify", target: "@owner.bonus_skill_points", op: "add", value: "grants_skill_points", when: "grants_skill_points > 0" },
      { type: "message", text: "{@owner.name} used {name}." },
      { type: "modify", target: "qty", op: "subtract", value: "1" },
      { type: "remove", target: "self", when: "qty <= 0" },
    ], "#7c3aed", "owners", { icon: "fa-solid fa-scroll", showName: true, showIcon: true, listed: true, sortOrder: 0 });
    body.push(
      h(3, icon("BookOpen", "#c084fc", 16), " Training ", tip(TRAINING_HELP)),
      p(muted("RAISES "), val("raises", { display: "input" }), muted("  BY "), val("raise_by", { display: "input" })),
      p(muted("GRANTS "), val("grants_attr_points", { display: "input" }), muted(" attribute points  "), val("grants_skill_points", { display: "input" }), muted(" skill points")),
      p(button(use, "Use")),
    );
  }
  if (kind === "Armor") {
    s.num("armor_dc", "DC bonus", 1);
    s.modifier("owner", "dc", "armor_dc", "equipped", "Armor while equipped");
    body.push(h(3, icon("Shield", GILT, 16), " Defense"), p(muted("Adds "), val("armor_dc", { look: { bold: true } }), muted(" to the owner's DC while equipped.")));
  }
  if (kind === "Consumable") {
    s.dice("heal_dice", "Heals (HP)", "2d6").choice("heal_wounds", "Heals wounds up to", ["None", "Minor", "Moderate", "Severe"], "Minor", SEVERITY_COLORS)
      // Brewed potions: their potency (by how well they were brewed) adds to the heal; a failed brew is inert.
      .num("potency", "Potency", 0, { tooltip: POTENCY_HELP }).bool("inert", "Inert", false)
      .calc("heal_rank", "Heal level", `if(heal_wounds == "Severe", 3, if(heal_wounds == "Moderate", 2, if(heal_wounds == "Minor", 1, 0)))`);
    const used = (): AgActionStep[] => [
      { type: "modify", target: "qty", op: "subtract", value: "1" },
      { type: "remove", target: "self", when: "qty <= 0" },
    ];
    const healHp = s.action("a_heal_hp", "Heal HP", [
      { type: "roll", name: "heal", expr: "heal_dice", label: "Heal" },
      { type: "modify", target: "@owner.hp", op: "add", value: HEAL_VALUE },
      { type: "modify", target: "@owner.hp", op: "set", value: "min(@owner.hp, @owner.hp_max)" },
      ...used(),
    ], "#15803d");
    const healWound = s.action("a_heal_wound", "Heal a wound", [
      { type: "choose", name: "wound", from: "@owner.wounds", filter: "severity_rank <= @source.heal_rank", prompt: "Which wound does it heal?" },
      { type: "remove", target: "wound" },
      ...used(),
    ], "#0f766e");
    body.push(
      h(3, icon("FlaskConical", "#34d399", 16), " Use ", tip(CONSUMABLE_HELP)),
      p(button(healHp, "Heal HP"), " ", button(healWound, "Heal a wound")),
      consumableLine(),
    );
  }
  if (kind === "Rune") {
    s.text("boosts", "Boosts", "Damage +2");
    body.push(h(3, icon("Gem", "#c084fc", 16), " Boosts ", tip(RUNE_HELP)), block("boosts", { display: "value", showLabel: false, look: { bold: true } }));
  }
  if (kind === "Container") {
    s.choice("container_kind", "Kind", ["Backpack", "Storage Ring"], "Backpack").num("capacity", "Capacity", 20, { min: 0 })
      .calc("stored", "Stored weight", "sum(@contents.total_weight)");
    s.modifier("owner", "weight_capacity", "capacity", `equipped && container_kind == "Backpack"`, "Backpack capacity while equipped");
    body.push(
      h(3, icon("Backpack", GILT, 16), " Container ", tip(CONTAINER_HELP)),
      p(muted("KIND "), val("container_kind", { look: { bold: true } }), "    ", muted("CAPACITY "), val("capacity", { look: { bold: true } }), muted(" lb    STORED "), val("stored", { look: { bold: true } })),
      links("contents", [{ ref: "item_type", display: "badge" }, { ref: "qty", display: "input", label: "Qty" }, { ref: "weight", display: "value", label: "Wt", suffix: "lbs" }], {
        layout: "cards", add: { types: ["item"], reverse: "container", existing: true }, remove: "disconnect", emptyText: "Empty.",
      }),
    );
  }
  if (kind === "Material") {
    s.num("heat_min", "Heat from", 55, { min: 0, max: 100 }).num("heat_max", "Heat to", 78, { min: 0, max: 100 })
      .num("hardness", "Hardness", 4, { min: 0, max: 10 }).text("metal_color", "Colour", "#9ca3af", { isColor: true });
    body.push(h(3, icon("Hammer", "#fb923c", 16), " Smithing ", tip(MATERIAL_HELP)),
      p(muted("HEAT "), val("heat_min", { display: "input" }), muted(" to "), val("heat_max", { display: "input" }), muted("°    HARDNESS "), val("hardness", { display: "input" }), muted("    COLOUR "), val("metal_color", { display: "input" })));
  }
  if (kind === "Ingredient") body.push(h(3, icon("FlaskConical", "#86efac", 16), " Ingredient ", tip(INGREDIENT_HELP)));
  if (kind === "Ink") {
    s.text("ink_color", "Ink colour", "#a78bfa", { isColor: true }).num("ink_glow", "Glow", 60, { min: 0, max: 100 });
    body.push(h(3, icon("Droplet", "#f0abfc", 16), " Ink ", tip(INK_HELP)), p(muted("COLOUR "), val("ink_color", { display: "input" }), muted("    GLOW "), val("ink_glow", { display: "input" })));
  }
  if (kind === "Tool") {
    s.choice("mark_style", "Mark style", ["Carved", "Drawn"], "Carved", { Carved: "#d6d3d1", Drawn: "#c4b5fd" });
    body.push(h(3, icon("PenTool", "#fdba74", 16), " Tool ", tip(TOOL_HELP)), p(muted("MARKS "), val("mark_style", { display: "input" })));
  }
  if (kind === "Station") {
    s.choice("station_for", "Station for", ["Blacksmithing", "Alchemy", "Rune Making"], "Blacksmithing", { Blacksmithing: "#f97316", Alchemy: "#34d399", "Rune Making": "#a78bfa" })
      .num("station_bonus", "Quick Craft bonus", 0, { min: -5, max: 10, tooltip: "Added to Quick Craft rolls made with it (a master's forge, a cracked pot…)." });
    body.push(h(3, icon("Anvil", "#fb923c", 16), " Crafting station ", tip(STATION_HELP)), p(muted("FOR "), val("station_for", { display: "badge" }), muted("    QUICK CRAFT "), val("station_bonus", { display: "input" })), craftBenchNode());
  }
  if (kind === "Scroll") {
    s.text("teaches", "Teaches (sheet)", "").text("teaches_name", "Teaches", "").text("craft", "Crafting setup", "");
    body.push(...scrollNodes());
  }
  if (kind === "Part") {
    s.text("part_of", "Part of", "").text("part_role", "Role", "").text("material", "Material", "").num("quality", "Quality", 0)
      .num("damage_bonus", "Damage bonus", 0).num("accuracy", "Accuracy", 0).text("craft_tier", "Tier", "").text("metal_color", "Colour", "#9ca3af", { isColor: true });
    body.push(h(3, icon("Hammer", "#cbd5e1", 16), " Forged part ", tip(PART_HELP)),
      p(muted("PART OF "), val("part_of", { look: { bold: true } }), "    ", muted("MATERIAL "), val("material", { look: { bold: true } })),
      p(muted("QUALITY "), val("quality", { look: { bold: true } }), muted("%    DAMAGE "), val("damage_bonus", { look: { bold: true } }), muted("    ACCURACY "), val("accuracy", { look: { bold: true } })));
  }
  // Every item can have rolls (a weapon starts with Strike and Damage) and effects on its owner.
  body.push(...itemRollsNodes(), ...effectsNodes("owner", "equipped", ITEM_EFFECTS_HELP));
  if (RUNEABLE_KINDS.includes(kind)) {
    s.calc("rune_sockets", "Rune sockets", RUNE_SOCKETS_FORMULA).tip("rune_sockets", RUNE_SOCKETS_HELP);
    body.push(...runeSlotNodes());
  }

  s.region("r_gm", "GM notes", [p(t("GM only: ", { bold: {}, textStyle: { color: "#fbbf24" } }), i("notes about this item only the GM sees."))], { view: "gm", edit: "gm" });
  const page: DocNode[] = [
    p(val("item_type", { display: "badge" }), " ", val("rank_tag", { display: "badge" })),
    p(i("Describe the item here — what it looks like, where it came from.")),
    section("r_gm", { bg: "#451a0322", outline: "#f59e0b66", radius: 8, padding: 8 }),
    stats,
    block("durability", { maxRef: "durability_max", display: "bar", label: "Durability", showLabel: true, look: { color: "#22c55e", height: 8, radius: 4, labelPos: "left", numbers: "fraction", width: 60 } }),
    ...(body.length ? [hr(), ...body] : []),
  ];
  return s.snapshot({
    type: "item", name: kind === "Miscellaneous" ? "CA Item" : kind === "Training" ? "CA Training Item" : `CA ${kind}`, playersCanCreate: true,
    description: { Weapon: "Handedness, Strike and Damage rolls (add more), runes.", Armor: "Adds to the owner's DC while equipped; runes.", Consumable: "Use it to heal HP or a wound; the stack goes down.", Rune: "Boosts; attach it to a weapon or armor.", Container: "Backpack (more carry weight) or Storage Ring (its own contents).", Currency: "Coins: quantity × value counts toward Currency.", Ammunition: "Arrows, bolts, shot.", Miscellaneous: "Anything else: crafters, beast orbs, trinkets.", Training: "Manuals, pills, elixirs: using one permanently raises an attribute or skill, or grants points to spend.", Material: "A smithing material: heat range, hardness, colour.", Ingredient: "An alchemy or rune ingredient.", Ink: "A liquid or ink: its colour and glow show on runes drawn with it.", Tool: "A carving tool or pen: runes made with it look carved or drawn.", Part: "A forged weapon part, ready to assemble.", Station: "A crafting station: a forge, an alchemist's pot, a rune pen. Its sheet is where its holder crafts.", Scroll: "Teaches a blueprint, alchemy recipe or rune to whoever carries it." }[kind],
  }, page);
}

// --------------------------------------------------------------------------- wounds & traits
/** Focus: current / max and its bar, kept by hand (it's spent targeting an enemy — nothing to do with wounds). */
export const FOCUS_NOTE = "Spent to choose where a wound lands on an opponent, when you get to choose:\nWhere | Focus\nBody | 0\nArm or leg | 2\nHead | 4\n\n6 to start, +1 on each rank up and on Pillars 2, 4, 6 and 8. Resets on a long rest. Click the bar to spend or restore it.";
export const LEGACY_FOCUS_NOTE = "Spent to choose where a wound lands on an opponent, when you get to choose:\nWhere | Focus\nBody | 0\nArm or leg | 2\nHead | 4\n\n6 to start, +1 per star. Resets on a long rest. Click the bar to spend or restore it.";
/** A wound's severity and location, at the top of its page. */
export const woundBadges = (): DocNode => p(val("severity", { display: "badge" }), " ", val("location", { display: "badge" }));

function woundTemplate(): AgSnapshot {
  const s = new Sheet();
  s.choice("severity", "Severity", SEVERITIES, "Minor", SEVERITY_COLORS).choice("location", "Location", LOCATIONS, "Body", LOCATION_COLORS)
    .calc("severity_rank", "Severity level", `if(severity == "Severe", 3, if(severity == "Moderate", 2, 1))`);
  const treat = s.action("a_treat", "Treat", [{ type: "remove", target: "self" }], "#15803d");
  const page: DocNode[] = [
    woundBadges(),
    p(i("What happened — describe the wound here.")),
    ...effectsNodes("bearer", "", WOUND_EFFECTS_HELP),
    hr(),
    p(button(treat, "Treat (removes the wound)", { color: "#15803d" })),
  ];
  return s.snapshot({ type: "wound", name: "Wound", playersCanCreate: true, description: "A wound with severity, location and effects that really change its bearer's values (skills, speed…). Treat removes it." }, page);
}

export const TRAIT_EFFECTS_HELP = "What this trait changes on its holder, for as long as they have it.";
export const TRAIT_ROLLS_HELP = "Rolls this trait gives the character who has it — they roll and pay. Hold a roll for advantage, disadvantage or a modifier. They show when you hover the trait on the character's Overview.";
/** A trait's rolls heading and block (rolled and paid by its holder). */
export function traitRollsNodes(): DocNode[] {
  return [h(3, icon("Dices", GILT, 16), " Rolls ", tip(TRAIT_ROLLS_HELP)), rolls("holder", ["energy", "focus"], "#b45309", SECTION_LOOK)];
}
function traitTemplate(): AgSnapshot {
  const s = new Sheet();
  s.text("summary", "Summary", "");
  const page: DocNode[] = [
    block("summary", { display: "value", showLabel: false, look: { bold: true } }),
    p(i("Describe the trait here.")),
    ...traitRollsNodes(),
    ...effectsNodes("holder", "", TRAIT_EFFECTS_HELP),
  ];
  return s.snapshot({ type: "trait", name: "Trait", description: "A trait: a summary line, a description, optional effects and rolls." }, page);
}

// --------------------------------------------------------------------------- applying the kit
async function createFrom(store: ScopeStore, template: AgNote, name: string, values: Record<string, AgValue>, cs: ChangeSet): Promise<AgNote> {
  const s = await snap.takeSnapshot(store, template.id);
  const n = await snap.createFromSnapshot(store, s, { name, folder: CA_KIT_FOLDER, ownerIds: [] }, cs, { fromTemplateId: template.id });
  for (const [key, value] of Object.entries(values)) {
    const f = store.fieldsByNote.get(n.id)?.get(key);
    if (f) await store.putField({ ...f, formula: f.type === "dice" ? String(value) : f.formula, value: f.type === "dice" ? null : value }, cs);
  }
  return n;
}
/** Change a roll on a sheet made from a template (e.g. the example sword's damage). */
async function setRoll(store: ScopeStore, note: AgNote, name: string, roll: Partial<NonNullable<AgActionOptions["roll"]>>, cs: ChangeSet) {
  const a = store.actionsOf(note.id).find((x) => x.name === name && x.options?.roll);
  if (a) await store.putAction({ ...a, options: { ...a.options, roll: { ...a.options!.roll!, ...roll } } }, cs);
}
async function addRoll(store: ScopeStore, note: AgNote, name: string, roll: NonNullable<AgActionOptions["roll"]>, icon: string, color: string, sortOrder: number, cs: ChangeSet) {
  await store.putAction({ id: randomUUID(), noteId: note.id, name, steps: [], acl: { view: "inherit", edit: "owners" }, color, options: { roll, icon, showName: true, showIcon: true, listed: true, sortOrder } }, cs);
}
async function connect(store: ScopeStore, from: AgNote, to: AgNote, label: string, reverseLabel: string, cs: ChangeSet) {
  await store.putLink({ id: randomUUID(), fromNoteId: from.id, toNoteId: to.id, label, reverseLabel, acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
}

/** The tracker card's DC (bottom right). */
export const CA_CARD_DC = { kind: "field", ref: "dc", display: "value", label: "DC", showLabel: true, align: "right", look: { fontSize: 11, color: "#d4a24c", bold: true } } as const;

export const CA_TRACKER_CARD: AgTrackerCard = {
  id: "ca-card", name: "CA card",
  layout: {
    width: 200, height: 92, background: "rgba(28,25,23,0.94)", border: "#d4a24c", radius: 10, items: [
      { id: "p", x: 6, y: 6, w: 56, h: 56, widget: { kind: "portrait", radius: 8 } },
      { id: "n", x: 68, y: 6, w: 126, h: 18, widget: { kind: "name", fontSize: 13, color: "#fde68a" } },
      { id: "hp", x: 68, y: 28, w: 126, h: 14, widget: { kind: "field", ref: "hp", maxRef: "hp_max", display: "bar", label: "HP", showLabel: true, look: { color: "#f43f5e", labelPos: "inside", numbers: "fraction", radius: 3 } } },
      { id: "en", x: 68, y: 46, w: 126, h: 12, widget: { kind: "field", ref: "energy", maxRef: "usable_energy", display: "bar", label: "Energy", showLabel: true, look: { color: "#06b6d4", labelPos: "inside", numbers: "fraction", radius: 3 } } },
      { id: "rk", x: 6, y: 66, w: 90, h: 20, widget: { kind: "field", ref: "rank", display: "value", look: { fontSize: 11, color: "#d4a24c", bold: true } } },
      // The character's DC (with armor and other effects); rolls are in the dice tray and roll history.
      { id: "r", x: 100, y: 66, w: 94, h: 18, widget: CA_CARD_DC },
    ],
  },
};

/**
 * Add the C.A. templates (and, optionally, an example character with items,
 * wounds and a trait) to a scope. Refuses to add them twice.
 */
export async function applyCAKit(store: ScopeStore, cs: ChangeSet, opts: { examples: boolean }): Promise<{ templates: number; sheets: number }> {
  if (Array.from(store.notes.values()).some((n) => n.isTemplate && n.name === "CA Character" && n.folder === CA_KIT_FOLDER)) {
    throw new Error("Cultivator's Adventure is already in here");
  }
  const made: Record<string, AgNote> = {};
  const add = async (key: string, s: AgSnapshot) => { made[key] = await snap.createFromSnapshot(store, s, {}, cs); };
  await add("character", characterTemplate());
  for (const k of ["Weapon", "Armor", "Consumable", "Rune", "Container", "Currency", "Ammunition", "Miscellaneous", "Training"] as ItemKind[]) await add(k, itemTemplate(k));
  await add("wound", woundTemplate());
  await add("trait", traitTemplate());
  await add("ability", abilityTemplate());
  await add("aspect", aspectTemplate());
  // Crafting: its item kinds, the Blueprint / Recipe / Rune Recipe templates and the starter set.
  const crafting = await applyCACrafting(store, cs, { starter: true });

  await applyCATrackerSettings(store, cs);

  let sheets = 0;
  if (opts.examples) {
    const hero = await createFrom(store, made.character, "Example Cultivator", {
      race: "Human", dc: 5, size: "Medium", speed: 30, fly_speed: 0, swim_speed: 15, age: 34, birthday: "3rd of Frostfall", languages: "Common, Old Veridish",
      energy_pool: 1200, hp: 40, energy: 480, focus: 9,
      might: 2, finesse: 1, constitution: 1, will: 1, anemos: 0, intelligence: 0,
      athletics: 2, intimidation: 1, focus_skill: 2, perception: 1, influence: 1, arcana: 1,
      cultivation: "Ember", weight_capacity: 50,
    }, cs);
    const sword = await createFrom(store, made.Weapon, "Ashen Oath Longsword", { rarity: "Rare", rank_tag: "Awakened", weight: 3, value: 400, durability: 90, equipped: true, damage_bonus: 6 }, cs);
    await setRoll(store, sword, "Strike", { add: "might" }, cs);
    const shield = await createFrom(store, made.Armor, "Bulwark of Veridun", { rarity: "Uncommon", weight: 6, value: 180, armor_dc: 2, equipped: true }, cs);
    const potion = await createFrom(store, made.Consumable, "Minor Health Potion", { rarity: "Uncommon", qty: 2, weight: 0.2, value: 50 }, cs);
    const rune = await createFrom(store, made.Rune, "Rune of Embers", { rarity: "Uncommon", value: 120, boosts: "Fire Damage +2" }, cs);
    const pack = await createFrom(store, made.Container, "Traveller's Pack", { weight: 2, value: 15, capacity: 20, equipped: true }, cs);
    const coins = await createFrom(store, made.Currency, "Silver Marks", { qty: 35, value: 1 }, cs);
    for (const it of [sword, shield, potion, pack, coins]) await connect(store, it, hero, "owner", "items", cs);
    await connect(store, rune, sword, "socket", "runes", cs);
    const arrow = await createFrom(store, made.wound, "Goblin arrow", { severity: "Moderate", location: "Body" }, cs);
    const cut = await createFrom(store, made.wound, "Shallow cut", { severity: "Minor", location: "Leg" }, cs);
    await connect(store, arrow, hero, "bearer", "wounds", cs);
    await connect(store, cut, hero, "bearer", "wounds", cs);
    await store.putModifier({ id: randomUUID(), noteId: arrow.id, via: "bearer", targetKey: "athletics", op: "add", amount: "-2", condition: null, label: "Goblin arrow" }, cs);
    await store.putModifier({ id: randomUUID(), noteId: cut.id, via: "bearer", targetKey: "speed", op: "add", amount: "-5", condition: null, label: "Shallow cut" }, cs);
    const pill = await createFrom(store, made.Training, "Bloodmarrow Pill", { rarity: "Rare", qty: 1, weight: 0.1, value: 300, raises: "Might", raise_by: 1 }, cs);
    await connect(store, pill, hero, "owner", "items", cs);
    const trait = await createFrom(store, made.trait, "Iron Will", { summary: "Never breaks under fear — the GM may grant advantage on Focus rolls against it." }, cs);
    await connect(store, trait, hero, "holder", "traits", cs);
    // Abilities (sets of aspects) and their aspects (single uses).
    const embers = await createFrom(store, made.ability, "Ember Arts", { description: "Shaping burning Anemos into weapons of flame.", tag_color: "#f97316" }, cs);
    const oath = await createFrom(store, made.ability, "Iron Oath", { description: "A sworn guardian's arts: drawing harm onto yourself and holding the line.", tag_color: "#60a5fa" }, cs);
    for (const a of [embers, oath]) await connect(store, a, hero, "holder", "abilities", cs);
    const bulwark = await createFrom(store, made.aspect, "Oathbound Bulwark", { category: "Defense", range: "Self", duration: "1 round", description: "Plant your shield and draw every eye in the room: enemies within 10 ft must target you." }, cs);
    await setRoll(store, bulwark, "Roll", { die: `@${ASPECT_VIA}.will_die`, add: "focus_skill", costs: [{ key: "energy", amount: "20" }, { key: "focus", amount: "2" }] }, cs);
    const lance = await createFrom(store, made.aspect, "Ember Lance", { category: "Attack", range: "30 ft", description: "A spear of burning Anemos: roll to hit, then its fire damage." }, cs);
    // An attack aspect: an attack roll that pays, and a damage roll.
    for (const a of store.actionsOf(lance.id)) if (a.options?.roll) await store.putAction({ ...a, name: "Attack", options: { ...a.options, roll: { ...a.options.roll, costs: [{ key: "energy", amount: "30" }, { key: "focus", amount: "0" }] } } }, cs);
    await addRoll(store, lance, "Fire damage", { via: ASPECT_VIA, count: "2", die: "6", add: "", bonus: "0", costs: [] }, "fa-solid fa-fire", "#c2410c", 2, cs);
    const veil = await createFrom(store, made.aspect, "Cinder Veil", { category: "Defense", range: "Self", duration: "1 minute", description: "Wreathe yourself in embers: attackers within reach take fire damage." }, cs);
    await setRoll(store, veil, "Roll", { count: "1", die: "4", add: "", costs: [{ key: "energy", amount: "15" }, { key: "focus", amount: "0" }] }, cs);
    await connect(store, lance, embers, "ability", "aspects", cs);
    await connect(store, veil, embers, "ability", "aspects", cs);
    await connect(store, bulwark, oath, "ability", "aspects", cs);
    // An ability inside an ability: whatever creature is trapped, its powers are the hero's.
    const prison = await createFrom(store, made.ability, "Soul Prison", { description: "Trap a defeated creature's soul and wield its powers while it's held. Unlink the trapped ability to free it — its aspects go with it.", tag_color: "#2dd4bf" }, cs);
    await connect(store, prison, hero, "holder", "abilities", cs);
    const hexer = await createFrom(store, made.ability, "Goblin Shaman (trapped)", { description: "The hexes of the goblin shaman held in the Soul Prison.", tag_color: "#a3e635" }, cs);
    await connect(store, hexer, prison, "holder", "abilities", cs);
    const hex = await createFrom(store, made.aspect, "Hex Bolt", { category: "Attack", range: "60 ft", description: "A crackling green curse." }, cs);
    await setRoll(store, hex, "Roll", { count: "2", die: "8", add: "", costs: [{ key: "energy", amount: "25" }, { key: "focus", amount: "1" }] }, cs);
    await connect(store, hex, hexer, "ability", "aspects", cs);
    // Supplies to craft with (copies of the starter set's materials, ingredients, inks and tools).
    await giveStarterSupplies(store, hero, crafting, cs);
    // What the example character has is theirs (in "Player Owned Copies").
    await adoptCharacterCopies(store, cs);
    sheets = 19;
    if (store.scope.kind === "campaign" && store.settings) {
      const st = store.settings;
      if (!st.tracker.pinned.includes(hero.id)) await store.putSettings({ ...st, tracker: { ...st.tracker, pinned: [...st.tracker.pinned, hero.id] } }, cs);
    }
  }
  return { templates: Object.keys(made).length, sheets };
}

/**
 * What characters already have (items, abilities, traits) becomes their own copies,
 * kept in "Player Owned Copies". One made for the character (no folder, or the kit's)
 * simply becomes theirs; an original from one of the GM's folders stays where it is
 * and the character gets a copy. One on several characters: each gets their own.
 */
export async function adoptCharacterCopies(store: ScopeStore, cs: ChangeSet) {
  const isPerson = (n?: AgNote) => !!n && (n.type === "character" || n.type === "npc");
  const kinds: Record<string, string> = { item: "owner", ability: "holder", trait: "holder" };
  for (const n of Array.from(store.notes.values())) {
    if (n.isTemplate || n.copyOf || !kinds[n.type]) continue;
    const held = store.linksOf(n.id).filter((l) => l.fromNoteId === n.id && l.label === kinds[n.type] && isPerson(store.notes.get(l.toNoteId)) && !store.notes.get(l.toNoteId)!.isTemplate);
    if (!held.length) continue;
    const original = !!n.folder && n.folder !== CA_KIT_FOLDER && n.folder !== CA_COPIES_FOLDER;
    const keep = original ? null : held[0];
    if (keep) { await markAsCopy(store, n.id, cs, CA_COPIES_FOLDER); await syncCopyOwners(store, n.id, cs); }
    for (const l of held) {
      if (l === keep) continue;
      const who = store.notes.get(l.toNoteId)!;
      const c = await copySheet(store, n.id, cs, { folder: CA_COPIES_FOLDER, ownerIds: [] });
      await store.removeLink(l.id, cs);
      await store.putLink({ id: randomUUID(), fromNoteId: c.id, toNoteId: who.id, label: l.label, reverseLabel: l.reverseLabel, acl: { ...l.acl }, createdAt: Date.now() }, cs);
      await syncCopyOwners(store, c.id, cs);
    }
  }
}

/** The tracker and tokens show HP and Energy the C.A. way (campaigns only). */
export async function applyCATrackerSettings(store: ScopeStore, cs: ChangeSet) {
  if (store.scope.kind === "campaign" && store.settings) {
    const st = store.settings;
    const cards = [...st.tracker.cards.filter((c) => c.id !== CA_TRACKER_CARD.id), CA_TRACKER_CARD];
    await store.putSettings({
      ...st,
      tracker: { ...st.tracker, cards, cardByType: { ...st.tracker.cardByType, character: CA_TRACKER_CARD.id, npc: CA_TRACKER_CARD.id } },
      tokenBarsByType: {
        ...st.tokenBarsByType,
        character: [{ id: "hp", value: "hp", max: "hp_max", color: "#f43f5e" }, { id: "en", value: "energy", max: "usable_energy", color: "#06b6d4" }],
        npc: [{ id: "hp", value: "hp", max: "hp_max", color: "#dc2626" }],
      },
    }, cs);
  }
}
