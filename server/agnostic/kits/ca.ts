// "Cultivator's Adventure" for Agnostic: the C.A. character sheet rebuilt out
// of ordinary Agnostic parts — values, formulas, buttons, connections, tabs,
// item cards — so a GM can open any piece and change it. Nothing here touches
// the real C.A. system; it is a starter kit applied to one Agnostic scope.
//
// Wounds keep their function (effects on skills and speed, severity, where
// they land, treating them, potions healing them) without the body diagram:
// each wound is its own small sheet connected to the character, and its
// effects are modifiers on the character.
import { randomUUID } from "crypto";
import type { AgAction, AgActionStep, AgField, AgFieldOptions, AgFieldType, AgModifier, AgNote, AgRegion, AgSnapshot, AgTrackerCard, AgValue } from "@shared/agnostic/types";
import type { ChangeSet, ScopeStore } from "../store";
import * as snap from "../snapshot";
import {
  buildDocState, type DocNode, p, pAlign, h, hr, b, i, muted, t, icon, val, block, button, columns, section, tabs, links, canvas, table,
} from "./doc";

export const CA_KIT_FOLDER = "Cultivator's Adventure";

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

// The Universal Rank ladder: Bronze 1 at 0, then the source table's figures.
const RANK_NAMES = ["Bronze", "Silver", "Gold", "Obsidian", "Terran"];
const THRESHOLDS = [0, 20, 30, 40, 50, ...[100, 1000, 10000, 100000].flatMap((base) => [1, 2, 3, 4, 5].map((s) => base * s))];
const HP_LADDER = THRESHOLDS.map((_, idx) => { let hp = 20; for (let k = 1; k <= idx; k++) hp += k % 5 === 0 ? 10 : 5; return hp; });
const LADDER_LABELS = THRESHOLDS.map((_, idx) => `${RANK_NAMES[Math.floor(idx / 5)]} ${idx % 5 + 1}`);

const ITEM_TYPES = ["Ammunition", "Armor", "Beast Orb", "Consumable", "Container", "Crafter", "Currency", "Miscellaneous", "Rune", "Weapon"];
const ITEM_TYPE_COLORS: Record<string, string> = { Weapon: "#f87171", Armor: "#60a5fa", Consumable: "#34d399", Rune: "#c084fc", Container: "#fbbf24", Currency: "#facc15", Ammunition: "#fb923c", "Beast Orb": "#2dd4bf", Crafter: "#a3e635", Miscellaneous: "#a8a29e" };
const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const RARITY_COLORS: Record<string, string> = { Common: "#a8a29e", Uncommon: "#22c55e", Rare: "#3b82f6", Epic: "#a855f7", Legendary: "#f59e0b" };
const SEVERITIES = ["Minor", "Moderate", "Severe"];
const SEVERITY_COLORS: Record<string, string> = { Minor: "#a8a29e", Moderate: "#ea580c", Severe: "#dc2626" };
const LOCATIONS = ["Body", "Arm", "Leg", "Head"];
const LOCATION_COLORS: Record<string, string> = { Body: "#d6d3d1", Arm: "#fcd34d", Leg: "#fcd34d", Head: "#f87171" };

const GILT = "#d4a24c";
const SECTION_LOOK = { bg: "#1c1917", outline: "#d4a24c55", radius: 10, padding: 12 };
const OWNERS_EDIT = { view: "everyone", edit: "owners" } as const;

// --------------------------------------------------------------------------- sheet builder
class Sheet {
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
  text(key: string, label: string, value = "") { return this.add(key, label, "text", value); }
  bool(key: string, label: string, value = false) { return this.add(key, label, "boolean", value); }
  choice(key: string, label: string, choices: string[], value: string, colors?: Record<string, string>) { return this.add(key, label, "select", value, null, { choices, choiceColors: colors }); }
  calc(key: string, label: string, formula: string, resultType: "number" | "text" = "number") { return this.add(key, label, "formula", null, formula, { resultType }); }
  dice(key: string, label: string, expr: string) { return this.add(key, label, "dice", null, expr); }

  action(id: string, name: string, steps: AgActionStep[], color: string | null = null, edit: "owners" | "gm" | "everyone" = "owners") {
    this.actions.push({ id, noteId: "SELF", name, steps, acl: { view: "inherit", edit }, color });
    return id;
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
        acl: { ...OWNERS_EDIT }, bodyAcl: { view: "inherit", edit: "inherit" }, tokenBars: null, folder: CA_KIT_FOLDER, sortOrder: 0,
      },
      fields: this.fields, regions: this.regions, actions: this.actions, modifiers: this.modifiers,
      docs: { ...this.docs, note: buildDocState(page, canvases) },
    };
  }
}

/** A titled, framed section: icon + title on the left, a value on the right, then a body. */
function framed(sheet: Sheet, id: string, iconName: string, title: string, right: Array<DocNode | ReturnType<typeof t> | string>, body: DocNode[]): DocNode {
  sheet.region(`r_${id}`, title, [
    columns([[p(icon(iconName, GILT, 18), " ", b(title))], [pAlign("right", ...right)]], { ratio: "3:2", gap: 8 }),
    ...body,
  ]);
  return section(`r_${id}`, SECTION_LOOK);
}

// --------------------------------------------------------------------------- the character
function characterTemplate(): AgSnapshot {
  const s = new Sheet();
  // Identity
  s.text("race", "Race", "Human").num("dc", "DC", 5).choice("size", "Size", ["Tiny", "Small", "Medium", "Large", "Huge"], "Medium")
    .num("level", "Level", 1, { min: 1 }).num("speed", "Speed", 30).num("fly_speed", "Fly Speed", 0).num("swim_speed", "Swim Speed", 15)
    .num("age", "Age", 20).text("birthday", "Birthday").text("languages", "Languages", "Common").text("aura", "Aura", "#d4a24c");
  // Rank — read straight off the Energy Pool, never set by hand.
  s.num("energy_pool", "Energy Pool", 0, { min: 0 })
    .calc("rank_index", "Rank step", `tier(energy_pool, ${THRESHOLDS.join(", ")})`)
    .calc("rank", "Rank", `concat(choose(floor(rank_index / 5), ${RANK_NAMES.map((n) => `"${n}"`).join(", ")}), " ", rank_index % 5 + 1)`, "text")
    .calc("to_next_rank", "To next rank", `max(0, choose(rank_index + 1, ${THRESHOLDS.join(", ")}) - energy_pool)`)
    .calc("rank_next", "Next rank", `if(to_next_rank > 0, concat(to_next_rank, " to next"), "top of the ladder")`, "text")
    .calc("lifespan", "Lifespan", `choose(floor(rank_index / 5), 100, 150, 200, 250, 300)`)
    .calc("absorption_limit", "Absorption limit", `choose(floor(rank_index / 5), 20, 50, 500, 5000, 50000)`);
  // Health, Physique, Energy, Focus
  s.calc("hp_max", "Max HP", `choose(rank_index, ${HP_LADDER.join(", ")})`).num("hp", "HP", 20, { min: 0 })
    .num("physique", "Physique", 100, { min: 0 })
    .calc("overload", "Overload", `if(physique > 0 && energy_pool > physique, concat("Overloaded by ", energy_pool - physique, " — overload effects are active"), "Within your Physique")`, "text")
    .calc("usable_energy", "Usable Energy", "floor(energy_pool / 2)").num("energy", "Energy", 0, { min: 0 })
    .calc("focus_max", "Max Focus", "10 + 2 * rank_index").num("focus", "Focus", 10, { min: 0 })
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
  s.calc("attr_budget", "Attribute budget", "4 + floor(level / 3)").calc("attr_used", "Attribute points used", attrSum)
    .calc("attr_points", "Attribute Points", `concat(attr_used, " / ", attr_budget, if(attr_used > attr_budget, " (too many)", ""))`, "text");
  for (const k of SKILLS) s.num(k.key, `${k.name} (${ABBR[k.parent]})`, 0, { min: -2, max: 10 });
  s.calc("skill_reclaimed", "Skill points reclaimed", `min(6, -(${negatives}))`)
    .calc("skill_budget", "Skill budget", "8 + (level - 1) + skill_reclaimed").calc("skill_used", "Skill points used", positives)
    .calc("skill_points", "Skill Points", `concat(skill_used, " / ", skill_budget, if(skill_used > skill_budget, " (too many)", ""))`, "text");
  // Ability
  s.text("ability_name", "Ability", "").text("ability_description", "Ability description", "").text("cultivation", "Cultivation", "");
  // Inventory totals
  s.num("weight_capacity", "Carry weight", 50, { min: 0 }).calc("carried", "Weight carried", "sum(@items.total_weight)")
    .calc("currency", "Currency", "sum(@items.coin_total)");

  // Skill roll buttons
  const roll = (k: typeof SKILLS[number]) => s.action(`a_${k.key}`, k.name, [{ type: "roll", name: "r", expr: `roll(1, ${k.parent}_die) + ${k.key}`, label: k.name }], "#78350f");
  const skillRolls = Object.fromEntries(SKILLS.map((k) => [k.key, roll(k)]));
  const abilityRoll = s.action("a_ability", "Ability roll", [{ type: "roll", name: "r", expr: "roll(1, anemos_die) + arcana", label: "Ability" }], "#9f1239");

  // ---- Overview: identity chips on a canvas
  const chip = (key: string, label: string, iconName: string, suffix?: string, w = 152) => ({ key, label, iconName, suffix, w });
  const grid = [
    [chip("race", "Race", "User"), chip("dc", "DC", "Shield"), chip("size", "Size", "Ruler"), chip("level", "Level", "Star")],
    [chip("speed", "Speed", "Footprints", "ft"), chip("fly_speed", "Fly speed", "Feather", "ft"), chip("swim_speed", "Swim speed", "Waves", "ft"), chip("lifespan", "Lifespan", "Hourglass", "yrs")],
    // Languages runs long, so its chip is wider.
    [chip("age", "Age", "Clock", undefined, 108), chip("birthday", "Birthday", "CalendarDays", undefined, 164), chip("languages", "Languages", "Languages", undefined, 228), chip("aura", "Aura", "Sparkles", undefined, 108)],
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

  const overview: DocNode[] = [
    canvas("cv_identity", 648, 162),
    framed(s, "rank", "Star", "Rank", [val("rank", { look: { color: GILT, bold: true } }), " ", val("rank_next", { look: { textColor: "#78716c", fontSize: 11 } })], [
      p(muted("Read off the Energy Pool. Bronze 1 starts at 0; each star and rank above raises Health and Focus.")),
    ]),
    hr(),
    framed(s, "health", "Heart", "Health", [val("hp", { look: { bold: true } }), " / ", val("hp_max", { look: { bold: true } })], [
      block("hp", { maxRef: "hp_max", display: "bar", showLabel: false, look: { color: "#f43f5e", track: "#3f3a2a", height: 8, radius: 4, numbers: "none" } }),
      p(muted("20 base, +5 per star, +10 per rank — scales with Rank above. Click the bar to heal or hurt.")),
    ]),
    hr(),
    framed(s, "physique", "TrendingUp", "Physique", [val("physique", { look: { bold: true } })], [
      p(val("overload", { look: { textColor: "#a8a29e", fontSize: 12 } })),
      p(muted("A pool above your Physique is overload. GM: overload effects are changes on this sheet (Links → Changes values) with the condition “energy_pool > physique”.")),
    ]),
    hr(),
    framed(s, "energy", "Zap", "Energy Pool", [val("energy_pool", { look: { bold: true } })], [
      p(muted("Usable Energy "), val("usable_energy", { look: { fontSize: 12, textColor: "#a8a29e" } }), muted(" — half the pool")),
      block("energy", { maxRef: "usable_energy", display: "bar", label: "Energy", showLabel: true, look: { color: "#06b6d4", track: "#3f3a2a", height: 16, radius: 4, labelPos: "above", numbers: "fraction", iconName: "Zap", iconColor: "#22d3ee" } }),
    ]),
    hr(),
    framed(s, "focus", "Sparkles", "Focus", [val("focus", { display: "input" }), " / ", val("focus_max", { look: { bold: true } })], [
      block("focus", { maxRef: "focus_max", display: "bar", showLabel: false, look: { color: "#8b5cf6", track: "#3f3a2a", height: 8, radius: 4, numbers: "none" } }),
      p(muted("Choosing where a wound lands costs Focus: Body 0, Arm 2, Leg 2, Head 4. Resets on a long rest.")),
    ]),
    hr(),
    framed(s, "wounds", "HeartPulse", "Wounds", [val("wounds_count", { look: { bold: true } })], [
      links("wounds", [{ ref: "severity", display: "badge" }, { ref: "location", display: "badge" }, { ref: "effects", display: "value", label: "Effects" }], {
        layout: "cards", accentBy: "severity", add: { types: ["wound"], reverse: "bearer", existing: false }, remove: "delete", emptyText: "No wounds.",
      }),
      p(muted("Minor = 5+ over the DC · Moderate = 10+ · Severe = 15+. A wound's effects change skills and speed while it lasts — open it to Treat it.")),
    ]),
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
    columns([
      [p(b("Attribute Points  "), val("attr_points", { look: { color: GILT, bold: true } })), p(muted("Attributes can't go below 0. 4 + one per 3 levels."))],
      [p(b("Skill Points  "), val("skill_points", { look: { color: GILT, bold: true } })), p(muted("8 + one per level; up to 6 back from skills below 0."))],
    ], { gap: 12 }),
    canvas("cv_attributes", 652, 172),
    p(muted("Each attribute sets the die its skills roll: 0 → d6, 1 → d8, 2 → d10, 3 → d12, 4+ → d20. Double-click a number to change it.")),
    hr(),
    h(3, icon("Zap", GILT, 18), " Skills"),
    table(skillRows),
    p(muted("Roll = the attribute's die + the skill. Wounds and equipped items change skills automatically (the green / red number beside a skill).")),
  ];

  // ---- Ability
  const abilityTab: DocNode[] = [
    framed(s, "ability", "Flame", "Ability", [], [
      block("ability_name", { display: "value", showLabel: false, look: { fontSize: 18, bold: true } }),
      block("ability_description", { display: "value", showLabel: false, look: { fontSize: 13, textColor: "#d6d3d1" } }),
      p(muted("Double-click the name or the line under it to change them. Write what the ability does at length right here, under this box.")),
    ]),
    hr(),
    framed(s, "cultivation", "Flame", "Cultivation", [val("cultivation", { look: { bold: true } })], [p(muted("Energy type. Double-click to set it."))]),
    hr(),
    framed(s, "ability_rolls", "Dices", "Rolls", [], [
      p(button(abilityRoll, "Ability roll")),
      p(muted("GM: change this button (⚙) or add more in Settings → Buttons, then Insert → Button here.")),
    ]),
  ];

  // ---- Inventory
  const inventoryTab: DocNode[] = [
    columns([
      [p(muted("Weight Carried")), p(val("carried", { look: { fontSize: 18, bold: true, textColor: "#4ade80" } }), t(" / ", { bold: {} }), val("weight_capacity", { look: { fontSize: 18, bold: true } }), muted(" lbs"))],
      [p(muted("Currency")), p(val("currency", { look: { fontSize: 18, bold: true, textColor: "#facc15" } }), muted(" coins"))],
    ], { ...SECTION_LOOK, gap: 12 }),
    links("items", [
      { ref: "item_type", display: "badge" }, { ref: "rarity", display: "badge" }, { ref: "rank_tag", display: "badge" },
      { ref: "qty", display: "input", label: "Qty" }, { ref: "weight", display: "value", label: "Wt", suffix: "lbs" },
      { ref: "durability", display: "bar", label: "Dur", maxRef: "durability_max", color: "#22c55e" }, { ref: "value", display: "value", label: "Value" },
      { ref: "equipped", display: "toggle", label: "Equip" },
    ], { layout: "cards", search: true, sortBy: "name", filterBy: "item_type", accentBy: "rarity", add: { types: ["item"], reverse: "owner", existing: true }, remove: "delete", emptyText: "No items yet — press Add." }),
    p(muted("Click an item to open it: its Use, Strike and Damage buttons are there. Equipped items' bonuses (and a backpack's extra carry weight) apply on their own.")),
  ];

  // ---- Traits
  const traitsTab: DocNode[] = [
    links("traits", [{ ref: "summary", display: "value", label: "" }], { layout: "cards", search: true, add: { types: ["trait"], reverse: "holder", existing: true }, remove: "delete", emptyText: "No traits added yet." }),
  ];

  const page: DocNode[] = [
    tabs("ca_tabs", [
      { title: "Overview", icon: "User", content: overview },
      { title: "Skills", icon: "Zap", content: skillsTab },
      { title: "Ability", icon: "Flame", content: abilityTab },
      { title: "Inventory", icon: "Backpack", content: inventoryTab },
      { title: "Traits", icon: "Star", content: traitsTab },
    ], { color: GILT }),
  ];
  return s.snapshot({ type: "character", name: "CA Character", description: "The Cultivator's Adventure character sheet: rank, health, physique, energy, focus, wounds, attributes, skills, ability, inventory and traits." }, page, { cv_identity: chips, cv_attributes: attrBoxes });
}

// --------------------------------------------------------------------------- items
type ItemKind = "Weapon" | "Armor" | "Consumable" | "Rune" | "Container" | "Currency" | "Ammunition" | "Miscellaneous";

function itemTemplate(kind: ItemKind): AgSnapshot {
  const s = new Sheet();
  s.choice("item_type", "Type", ITEM_TYPES, kind, ITEM_TYPE_COLORS)
    .choice("rarity", "Rarity", RARITIES, "Common", RARITY_COLORS)
    .choice("rank_tag", "Rank", ["Unranked", ...LADDER_LABELS], "Unranked")
    .num("qty", "Qty", 1, { min: 0 }).num("weight", "Weight", kind === "Rune" || kind === "Currency" ? 0 : 1, { min: 0, step: 0.1 })
    .calc("total_weight", "Total weight", "weight * qty").num("value", "Value", kind === "Currency" ? 1 : 10, { min: 0 })
    .calc("coin_total", "Coins", `if(item_type == "Currency", qty * value, 0)`)
    .num("durability", "Durability", 10, { min: 0 }).num("durability_max", "Max durability", 10, { min: 0 }).bool("equipped", "Equipped", false);

  const body: DocNode[] = [];
  const stats = p(
    muted("QTY "), val("qty", { look: { bold: true } }), "    ",
    muted("WEIGHT "), val("weight", { look: { bold: true } }), muted(" lb"), "    ",
    muted("VALUE "), val("value", { look: { bold: true, textColor: "#f97316" } }), "    ",
    muted("EQUIPPED "), val("equipped", { display: "input" }),
  );

  if (kind === "Weapon") {
    s.dice("damage", "Damage", "1d8").choice("handedness", "Handedness", ["Melee (one-handed)", "Melee (two-handed)", "Ranged"], "Melee (one-handed)");
    const strike = s.action("a_strike", "Strike", [{ type: "roll", name: "hit", expr: "1d20", label: "Strike" }], "#b45309");
    const dmg = s.action("a_damage", "Damage", [{ type: "roll", name: "dmg", expr: "damage", label: "Damage" }], "#b91c1c");
    body.push(
      h(3, icon("Swords", GILT, 16), " Attack"),
      p(muted("DAMAGE "), val("damage", { look: { bold: true } }), "    ", muted("HANDEDNESS "), val("handedness", { look: { bold: true } })),
      h(3, icon("Dices", GILT, 16), " Rolls"),
      p(button(strike, "Strike"), " ", button(dmg, "Damage")),
    );
  }
  if (kind === "Armor") {
    s.num("armor_dc", "DC bonus", 1);
    s.modifier("owner", "dc", "armor_dc", "equipped", "Armor while equipped");
    body.push(h(3, icon("Shield", GILT, 16), " Defense"), p(muted("Adds "), val("armor_dc", { look: { bold: true } }), muted(" to the owner's DC while equipped.")));
  }
  if (kind === "Consumable") {
    s.dice("heal_dice", "Heals (HP)", "2d6").choice("heal_wounds", "Heals wounds up to", ["None", "Minor", "Moderate", "Severe"], "Minor", SEVERITY_COLORS)
      .calc("heal_rank", "Heal level", `if(heal_wounds == "Severe", 3, if(heal_wounds == "Moderate", 2, if(heal_wounds == "Minor", 1, 0)))`);
    const used = (): AgActionStep[] => [
      { type: "modify", target: "qty", op: "subtract", value: "1" },
      { type: "remove", target: "self", when: "qty <= 0" },
    ];
    const healHp = s.action("a_heal_hp", "Heal HP", [
      { type: "roll", name: "heal", expr: "heal_dice", label: "Heal" },
      { type: "modify", target: "@owner.hp", op: "add", value: "$heal" },
      { type: "modify", target: "@owner.hp", op: "set", value: "min(@owner.hp, @owner.hp_max)" },
      ...used(),
    ], "#15803d");
    const healWound = s.action("a_heal_wound", "Heal a wound", [
      { type: "choose", name: "wound", from: "@owner.wounds", filter: "severity_rank <= @source.heal_rank", prompt: "Which wound does it heal?" },
      { type: "remove", target: "wound" },
      ...used(),
    ], "#0f766e");
    body.push(
      h(3, icon("FlaskConical", "#34d399", 16), " Use"),
      p(button(healHp, "Heal HP"), " ", button(healWound, "Heal a wound")),
      p(muted("Heals "), val("heal_dice", { look: { bold: true } }), muted(" HP, or one wound up to "), val("heal_wounds", { look: { bold: true } }), muted(". Using one takes it from the stack; the last one is gone.")),
    );
  }
  if (kind === "Rune") {
    s.text("boosts", "Boosts", "Damage +2");
    body.push(h(3, icon("Gem", "#c084fc", 16), " Boosts"), block("boosts", { display: "value", showLabel: false, look: { bold: true } }),
      p(muted("Attach it to a weapon or armor from that item's Runes list. The GM can also make it change values (Links → Changes values).")));
  }
  if (kind === "Container") {
    s.choice("container_kind", "Kind", ["Backpack", "Storage Ring"], "Backpack").num("capacity", "Capacity", 20, { min: 0 })
      .calc("stored", "Stored weight", "sum(@contents.total_weight)");
    s.modifier("owner", "weight_capacity", "capacity", `equipped && container_kind == "Backpack"`, "Backpack capacity while equipped");
    body.push(
      h(3, icon("Backpack", GILT, 16), " Container"),
      p(muted("KIND "), val("container_kind", { look: { bold: true } }), "    ", muted("CAPACITY "), val("capacity", { look: { bold: true } }), muted(" lb    STORED "), val("stored", { look: { bold: true } })),
      p(muted("A Backpack raises its owner's carry weight by its capacity while equipped. A Storage Ring holds its own items:")),
      links("contents", [{ ref: "item_type", display: "badge" }, { ref: "qty", display: "input", label: "Qty" }, { ref: "weight", display: "value", label: "Wt", suffix: "lbs" }], {
        layout: "cards", add: { types: ["item"], reverse: "container", existing: true }, remove: "disconnect", emptyText: "Empty.",
      }),
    );
  }
  if (kind === "Weapon" || kind === "Armor") {
    body.push(
      h(3, icon("Gem", "#c084fc", 16), " Runes"),
      links("runes", [{ ref: "boosts", display: "value", label: "" }], { layout: "cards", add: { types: ["item"], reverse: "socket", existing: true }, remove: "disconnect", emptyText: "No runes attached." }),
    );
  }

  s.region("r_gm", "GM notes", [p(t("GM only: ", { bold: {}, textStyle: { color: "#fbbf24" } }), i("notes about this item only the GM sees."))], { view: "gm", edit: "gm" });
  const page: DocNode[] = [
    p(val("item_type", { display: "badge" }), " ", val("rarity", { display: "badge" }), " ", val("rank_tag", { display: "badge" })),
    p(i("Describe the item here — what it looks like, where it came from.")),
    section("r_gm", { bg: "#451a0322", outline: "#f59e0b66", radius: 8, padding: 8 }),
    stats,
    block("durability", { maxRef: "durability_max", display: "bar", label: "Durability", showLabel: true, look: { color: "#22c55e", height: 8, radius: 4, labelPos: "left", numbers: "fraction", width: 60 } }),
    ...(body.length ? [hr(), ...body] : []),
  ];
  return s.snapshot({
    type: "item", name: kind === "Miscellaneous" ? "CA Item" : `CA ${kind}`, playersCanCreate: true,
    description: { Weapon: "Damage, handedness, Strike and Damage rolls, runes.", Armor: "Adds to the owner's DC while equipped; runes.", Consumable: "Use it to heal HP or a wound; the stack goes down.", Rune: "Boosts; attach it to a weapon or armor.", Container: "Backpack (more carry weight) or Storage Ring (its own contents).", Currency: "Coins: quantity × value counts toward Currency.", Ammunition: "Arrows, bolts, shot.", Miscellaneous: "Anything else: crafters, beast orbs, trinkets." }[kind],
  }, page);
}

// --------------------------------------------------------------------------- wounds & traits
function woundTemplate(): AgSnapshot {
  const s = new Sheet();
  s.choice("severity", "Severity", SEVERITIES, "Minor", SEVERITY_COLORS).choice("location", "Location", LOCATIONS, "Body", LOCATION_COLORS)
    .calc("severity_rank", "Severity level", `if(severity == "Severe", 3, if(severity == "Moderate", 2, 1))`)
    .calc("focus_cost", "Focus cost", `choose(if(location == "Head", 2, if(location == "Body", 0, 1)), 0, 2, 4)`)
    .text("effects", "Effects", "");
  const treat = s.action("a_treat", "Treat", [{ type: "remove", target: "self" }], "#15803d");
  const page: DocNode[] = [
    p(val("severity", { display: "badge" }), " ", val("location", { display: "badge" }), "  ", muted("Focus cost to aim here: "), val("focus_cost", { look: { bold: true } })),
    p(i("What happened — describe the wound here.")),
    h(3, icon("Activity", GILT, 16), " Effects"),
    block("effects", { display: "value", label: "Summary", showLabel: true, look: { labelPos: "left" } }),
    p(muted("GM: make the effects real in this wound's Links tab → “Changes values on connected sheets”: via "), b("bearer"), muted(", e.g. athletics −2, speed −5. They apply while the wound exists.")),
    hr(),
    p(button(treat, "Treat (removes the wound)", { color: "#15803d" })),
  ];
  return s.snapshot({ type: "wound", name: "Wound", playersCanCreate: true, description: "A wound with severity, location and effects on its bearer's skills and speed. Treat removes it." }, page);
}

function traitTemplate(): AgSnapshot {
  const s = new Sheet();
  s.text("summary", "Summary", "");
  const page: DocNode[] = [
    block("summary", { display: "value", showLabel: false, look: { bold: true } }),
    p(i("Describe the trait here.")),
    p(muted("GM: a trait can change its holder's values (Links → Changes values, via “holder”) and carry its own buttons.")),
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
async function connect(store: ScopeStore, from: AgNote, to: AgNote, label: string, reverseLabel: string, cs: ChangeSet) {
  await store.putLink({ id: randomUUID(), fromNoteId: from.id, toNoteId: to.id, label, reverseLabel, acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
}

export const CA_TRACKER_CARD: AgTrackerCard = {
  id: "ca-card", name: "CA card",
  layout: {
    width: 200, height: 92, background: "rgba(28,25,23,0.94)", border: "#d4a24c", radius: 10, items: [
      { id: "p", x: 6, y: 6, w: 56, h: 56, widget: { kind: "portrait", radius: 8 } },
      { id: "n", x: 68, y: 6, w: 126, h: 18, widget: { kind: "name", fontSize: 13, color: "#fde68a" } },
      { id: "hp", x: 68, y: 28, w: 126, h: 14, widget: { kind: "field", ref: "hp", maxRef: "hp_max", display: "bar", label: "HP", showLabel: true, look: { color: "#f43f5e", labelPos: "inside", numbers: "fraction", radius: 3 } } },
      { id: "en", x: 68, y: 46, w: 126, h: 12, widget: { kind: "field", ref: "energy", maxRef: "usable_energy", display: "bar", label: "Energy", showLabel: true, look: { color: "#06b6d4", labelPos: "inside", numbers: "fraction", radius: 3 } } },
      { id: "rk", x: 6, y: 66, w: 90, h: 20, widget: { kind: "field", ref: "rank", display: "value", look: { fontSize: 11, color: "#d4a24c", bold: true } } },
      { id: "r", x: 100, y: 68, w: 94, h: 14, widget: { kind: "lastRoll" } },
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
  for (const k of ["Weapon", "Armor", "Consumable", "Rune", "Container", "Currency", "Ammunition", "Miscellaneous"] as ItemKind[]) await add(k, itemTemplate(k));
  await add("wound", woundTemplate());
  await add("trait", traitTemplate());

  // The tracker and tokens show HP and Energy the C.A. way.
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

  let sheets = 0;
  if (opts.examples) {
    const hero = await createFrom(store, made.character, "Example Cultivator", {
      race: "Human", dc: 5, level: 3, size: "Medium", speed: 30, fly_speed: 0, swim_speed: 15, age: 34, birthday: "3rd of Frostfall", languages: "Common, Old Veridish", aura: "#e2c163",
      energy_pool: 1200, hp: 40, physique: 1500, energy: 480, focus: 9,
      might: 2, finesse: 1, constitution: 1, will: 1, anemos: 0, intelligence: 0,
      athletics: 2, intimidation: 1, focus_skill: 2, perception: 1, influence: 1, arcana: 1,
      ability_name: "Oathbound Bulwark", ability_description: "Plant your shield and draw every eye in the room.", cultivation: "Ember", weight_capacity: 50,
    }, cs);
    const sword = await createFrom(store, made.Weapon, "Ashen Oath Longsword", { rarity: "Rare", rank_tag: "Bronze 3", weight: 3, value: 400, durability: 40, durability_max: 40, equipped: true, damage: "1d8 + 6" }, cs);
    const shield = await createFrom(store, made.Armor, "Bulwark of Veridun", { rarity: "Uncommon", weight: 6, value: 180, armor_dc: 2, equipped: true }, cs);
    const potion = await createFrom(store, made.Consumable, "Minor Health Potion", { rarity: "Uncommon", qty: 2, weight: 0.2, value: 50 }, cs);
    const rune = await createFrom(store, made.Rune, "Rune of Embers", { rarity: "Uncommon", value: 120, boosts: "Fire Damage +2" }, cs);
    const pack = await createFrom(store, made.Container, "Traveller's Pack", { weight: 2, value: 15, capacity: 20, equipped: true }, cs);
    const coins = await createFrom(store, made.Currency, "Silver Marks", { qty: 35, value: 1 }, cs);
    for (const it of [sword, shield, potion, pack, coins]) await connect(store, it, hero, "owner", "items", cs);
    await connect(store, rune, sword, "socket", "runes", cs);
    const arrow = await createFrom(store, made.wound, "Goblin arrow", { severity: "Moderate", location: "Body", effects: "Athletics −2" }, cs);
    const cut = await createFrom(store, made.wound, "Shallow cut", { severity: "Minor", location: "Leg", effects: "Speed −5" }, cs);
    await connect(store, arrow, hero, "bearer", "wounds", cs);
    await connect(store, cut, hero, "bearer", "wounds", cs);
    await store.putModifier({ id: randomUUID(), noteId: arrow.id, via: "bearer", targetKey: "athletics", op: "add", amount: "-2", condition: null, label: "Goblin arrow" }, cs);
    await store.putModifier({ id: randomUUID(), noteId: cut.id, via: "bearer", targetKey: "speed", op: "add", amount: "-5", condition: null, label: "Shallow cut" }, cs);
    const trait = await createFrom(store, made.trait, "Iron Will", { summary: "Never breaks under fear — the GM may grant advantage on Focus rolls against it." }, cs);
    await connect(store, trait, hero, "holder", "traits", cs);
    sheets = 10;
    if (store.scope.kind === "campaign" && store.settings) {
      const st = store.settings;
      if (!st.tracker.pinned.includes(hero.id)) await store.putSettings({ ...st, tracker: { ...st.tracker, pinned: [...st.tracker.pinned, hero.id] } }, cs);
    }
  }
  return { templates: Object.keys(made).length, sheets };
}
