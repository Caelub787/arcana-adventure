// Cultivator's Adventure crafting: the Blueprint, Recipe and Rune Recipe
// templates (built on the Agnostic crafting engine — see
// shared/agnostic/crafting.ts) and a starter set: blueprints for the common
// weapons, materials, ingredients, inks, tools, a recipe and runes. GMs make
// more from the templates in campaigns and My Library; admin in Admin.
import { randomUUID } from "crypto";
import type { AgField, AgNote, AgSnapshot, AgValue } from "@shared/agnostic/types";
import { SIGILS, CRAFT_DEF_TYPE, parseCraftConfig, type ForgeConfig, type AlchemyConfig, type RuneConfig, type CraftNeed, type CraftTierEffect } from "@shared/agnostic/crafting";
import type { ChangeSet, ScopeStore } from "../store";
import * as snap from "../snapshot";
import { p, i, t, h, block, icon, tip, section, type DocNode } from "./doc";
import { Sheet, itemTemplate, CA_CRAFT_ITEM_KINDS, CA_COPIES_FOLDER, type ItemKind } from "./ca";
import { syncCopyOwners } from "../copies";

export const CA_CRAFT_FOLDER = "Cultivator's Adventure — Crafting";
const GILT = "#d4a24c";
export const CA_DEF_TEMPLATE_NAMES = { forge: "CA Blueprint", alchemy: "CA Recipe", rune: "CA Rune Recipe" } as const;
export const CA_CRAFT_ITEM_TEMPLATE_NAMES: Record<string, string> = { Material: "CA Material", Ingredient: "CA Ingredient", Ink: "CA Ink", Tool: "CA Tool", Part: "CA Part", Station: "CA Station", Scroll: "CA Scroll" };

const DEF_HELP = {
  forge: "A blueprint: the parts a weapon is forged from, each part's shape, and what it makes. Players pick it at the forge, choose a material for each part, then hammer each part to shape (or Quick Craft the lot).",
  alchemy: "A recipe: its ingredients, its steps in order, and what it makes. Players follow it at the cauldron, scored step by step; the better they follow it, the more potent the result. Share it with players who know it — others can discover it by experimenting.",
  rune: "A rune recipe: its sigil, the ingredients and tools it needs, and what it does to the item it's set into (by how well it was traced).",
};

/** A definition template's page: what it is, its setup, the GM's notes. */
function defPage(kind: keyof typeof DEF_HELP): DocNode[] {
  return [
    block("description", { display: "value", showLabel: false, look: { fontSize: 13, textColor: "#d6d3d1" } }),
    h(3, icon(kind === "forge" ? "Hammer" : kind === "alchemy" ? "FlaskConical" : "PenTool", GILT, 16), kind === "forge" ? " Blueprint " : kind === "alchemy" ? " Recipe " : " Rune ", tip(DEF_HELP[kind])),
    { type: "agCraftDef", attrs: {} },
    section("r_gm", { bg: "#451a0322", outline: "#f59e0b66", radius: 8, padding: 8 }),
  ];
}
function defTemplate(kind: "forge" | "alchemy" | "rune", config: object): AgSnapshot {
  const s = new Sheet();
  s.text("description", "Description", "").text("craft", "Crafting setup", JSON.stringify(config));
  s.region("r_gm", "GM notes", [p(t("GM only: ", { bold: {}, textStyle: { color: "#fbbf24" } }), i("notes only the GM sees."))], { view: "gm", edit: "gm" });
  const type = kind === "forge" ? "blueprint" : kind === "alchemy" ? "recipe" : "rune_recipe";
  return s.snapshot({ type, name: CA_DEF_TEMPLATE_NAMES[kind], description: DEF_HELP[kind] }, defPage(kind));
}

const byName = (store: ScopeStore, name: string, tpl: boolean) => Array.from(store.notes.values()).find((n) => n.isTemplate === tpl && n.name === name);
const fieldVal = async (store: ScopeStore, note: AgNote, key: string, value: AgValue, cs: ChangeSet) => {
  const f = store.fieldsByNote.get(note.id)?.get(key);
  if (f) await store.putField({ ...f, formula: f.type === "dice" ? String(value) : f.formula, value: f.type === "dice" ? null : value }, cs);
};

/**
 * The crafting templates (and, with `starter`, the starter set). Adds only what's
 * missing, so it's safe to run on a scope that has some of it already.
 */
/** A station template per craft, ready to use: the forge, pot or pen is already set to its craft. */
export const CA_STATION_TEMPLATES: Array<{ name: string; craft: "Blacksmithing" | "Alchemy" | "Rune Making"; description: string; weight: number; value: number }> = [
  { name: "CA Forge", craft: "Blacksmithing", description: "A forge for Blacksmithing: whoever carries it forges here.", weight: 50, value: 150 },
  { name: "CA Alchemist Pot", craft: "Alchemy", description: "An alchemist's pot for brewing: whoever carries it brews here.", weight: 8, value: 60 },
  { name: "CA Runemaking Pen", craft: "Rune Making", description: "A runemaking pen: whoever carries it inscribes runes (it draws them).", weight: 0.1, value: 40 },
];

/**
 * C.A. crafting's templates: its item kinds (materials, ingredients, inks, tools, parts, stations, scrolls), a
 * Forge, Alchemist Pot and Runemaking Pen ready to use, and the Blueprint / Recipe / Rune Recipe templates. Only
 * what's missing is made. (No items, blueprints or recipes: the GM makes their own from these.)
 */
export async function applyCACrafting(store: ScopeStore, cs: ChangeSet, _opts: { starter?: boolean } = {}): Promise<Record<string, AgNote>> {
  const tpl: Record<string, AgNote> = {};
  for (const kind of CA_CRAFT_ITEM_KINDS) {
    const name = CA_CRAFT_ITEM_TEMPLATE_NAMES[kind];
    tpl[kind] = byName(store, name, true) ?? await snap.createFromSnapshot(store, itemTemplate(kind as ItemKind), {}, cs);
  }
  const weaponTpl = byName(store, "CA Weapon", true), ammoTpl = byName(store, "CA Ammunition", true), runeTpl = byName(store, "CA Rune", true), potionTpl = byName(store, "CA Consumable", true);
  const defs: Array<["forge" | "alchemy" | "rune", object]> = [
    ["forge", { kind: "forge", parts: [{ key: "blade", label: "Blade", role: "blade", shape: "long_blade" }, { key: "handle", label: "Handle", role: "handle", shape: "grip" }], damageDie: 8, output: weaponTpl?.id ?? null, partTemplate: tpl.Part.id, effects: [] } satisfies ForgeConfig],
    ["alchemy", { kind: "alchemy", ingredients: [], steps: [{ id: "s0", type: "mix", amount: 8 }], output: potionTpl?.id ?? null, effects: [] } satisfies AlchemyConfig],
    ["rune", { kind: "rune", sigil: SIGILS.flame.strokes, ingredients: [], tools: [], needsInk: false, output: runeTpl?.id ?? null, effect: { key: "damage_bonus", values: { default: 1, slight: 2, huge: 3 } } } satisfies RuneConfig],
  ];
  for (const [kind, config] of defs) tpl[kind] = byName(store, CA_DEF_TEMPLATE_NAMES[kind], true) ?? await snap.createFromSnapshot(store, defTemplate(kind, config), {}, cs);
  for (const st of CA_STATION_TEMPLATES) {
    let t = byName(store, st.name, true);
    if (!t) {
      const s = itemTemplate("Station");
      s.note = { ...s.note, name: st.name, templateMeta: s.note.templateMeta ? { ...s.note.templateMeta, description: st.description } : s.note.templateMeta };
      s.fields = s.fields.map((f) => (f.key === "station_for" ? { ...f, value: st.craft } : f.key === "weight" ? { ...f, value: st.weight } : f.key === "value" ? { ...f, value: st.value } : f));
      t = await snap.createFromSnapshot(store, s, {}, cs);
      // The pen draws its runes (a forge or pot doesn't mark them).
      if (st.craft === "Rune Making") await ensureField(store, t, "mark_style", "Mark style", "select", "Drawn", cs, { options: { choices: ["Carved", "Drawn"], choiceColors: { Carved: "#d6d3d1", Drawn: "#c4b5fd" } } });
    }
    tpl[st.name] = t;
  }
  return tpl;
}

/**
 * A scroll for every blueprint, recipe and rune that has none yet (kept with it,
 * for the GM to hand out): whoever carries one knows what it teaches.
 * Returned as "scroll:<recipe name>".
 */
export async function ensureScrolls(store: ScopeStore, cs: ChangeSet, scrollTpl: AgNote | undefined): Promise<Record<string, AgNote>> {
  const out: Record<string, AgNote> = {};
  const teaches = new Map<string, AgNote>();
  for (const n of Array.from(store.notes.values())) {
    if (n.isTemplate || n.copyOf) continue;
    const t = store.fieldsByNote.get(n.id)?.get("teaches");
    if (t && t.value) teaches.set(String(t.value), n);
  }
  const defTypes = new Set(Object.values(CRAFT_DEF_TYPE));
  for (const def of Array.from(store.notes.values())) {
    if (def.isTemplate || !defTypes.has(def.type)) continue;
    const craft = store.fieldsByNote.get(def.id)?.get("craft");
    if (!craft || !parseCraftConfig(craft.value)) continue;
    let sc = teaches.get(def.id);
    if (!sc) {
      const name = `${def.name.replace(/\s*recipe\s*$/i, "").trim() || def.name} Scroll`;
      if (scrollTpl) sc = await snap.createFromSnapshot(store, await snap.takeSnapshot(store, scrollTpl.id), { name, folder: def.folder, ownerIds: [] }, cs, { fromTemplateId: scrollTpl.id });
      else continue;
      for (const [k, v] of Object.entries({ teaches: def.id, teaches_name: def.name, craft: String(craft.value ?? ""), item_type: "Scroll", rarity: def.type === "blueprint" ? "Uncommon" : "Rare", value: 25 } as Record<string, AgValue>)) await fieldVal(store, sc, k, v, cs);
    }
    out[`scroll:${def.name}`] = sc;
  }
  return out;
}

/** A value on a sheet, added if it doesn't have it. */
async function ensureField(store: ScopeStore, note: AgNote, key: string, label: string, type: AgField["type"], value: AgValue, cs: ChangeSet, extra: { formula?: string; options?: AgField["options"] } = {}) {
  const have = store.fieldsByNote.get(note.id);
  const f = have?.get(key);
  if (f) { await store.putField({ ...f, value: type === "dice" ? null : value, formula: type === "dice" ? (extra.formula ?? f.formula) : f.formula }, cs); return; }
  const order = Math.max(0, ...Array.from(have?.values() ?? []).map((x) => x.sortOrder)) + 1;
  await store.putField({ id: randomUUID(), noteId: note.id, key, label, type, value: type === "dice" ? null : value, formula: extra.formula ?? null, options: extra.options ?? {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: order, templateFieldId: null }, cs);
}

/**
 * What each starter brew gives by grade — so a Fine potion plainly does more than a Standard one, and the GM has
 * examples to copy: more dice, worse wounds healed, stronger at the top.
 */
export const STARTER_BREW_EFFECTS: Record<string, CraftTierEffect[]> = {
  "Healing Draught Recipe": [
    { key: "heal_dice", mode: "set", values: { weak: "1d6", default: "2d6", slight: "3d6", huge: "4d6+2" } },
    { key: "heal_wounds", mode: "set", values: { weak: "None", default: "None", slight: "Minor", huge: "Moderate" } },
  ],
  "Energy Tonic Recipe": [{ key: "restore_dice", mode: "set", values: { weak: "2d6", default: "3d6", slight: "4d6", huge: "6d6" } }],
  "Focus Elixir Recipe": [{ key: "restore_dice", mode: "set", values: { weak: "1d2", default: "1d4", slight: "1d6", huge: "2d4" } }],
  "Wound Salve Recipe": [
    { key: "heal_wounds", mode: "set", values: { weak: "Minor", default: "Moderate", slight: "Severe", huge: "Severe" } },
    { key: "heal_dice", mode: "set", values: { weak: "1d2", default: "1d4", slight: "1d6", huge: "2d6" } },
  ],
};

// ---- Weapons by damage die: Dagger d6, Short Sword d8, Longsword d10, Warhammer d12, Bow d8, Longbow d10, Warbow d12.
export const NEW_BLUEPRINTS: Array<{ name: string; description: string; damageDie: number; parts: ForgeConfig["parts"] }> = [
  { name: "Short Sword", description: "A short straight blade — longer than a dagger, quicker than a longsword.", damageDie: 8,
    parts: [{ key: "blade", label: "Blade", role: "blade", shape: "short_sword" }, { key: "handle", label: "Handle", role: "handle", shape: "grip" }, { key: "guard", label: "Guard", role: "extra", shape: "guard", optional: true }] },
  { name: "Longbow", description: "A tall bow — a long, springy stave and a grip.", damageDie: 10,
    parts: [{ key: "stave", label: "Stave", role: "blade", shape: "long_stave" }, { key: "grip", label: "Grip", role: "handle", shape: "grip", optional: true }] },
  { name: "Warbow", description: "A heavy war bow — a thick stave that takes real strength to draw.", damageDie: 12,
    parts: [{ key: "stave", label: "Stave", role: "blade", shape: "war_stave" }, { key: "grip", label: "Grip", role: "handle", shape: "grip", optional: true }] },
];
/** The old starter dice, to change only blueprints the GM hasn't (Dagger d4 → d6, Longsword d8 → d10, Warhammer d10 → d12). */
const REDICED: Record<string, [number, number]> = { Dagger: [4, 6], Longsword: [8, 10], Warhammer: [10, 12] };
/**
 * Bring a campaign's weapon blueprints to the dice above: the starter ones that still have their old die get the new
 * one, and Short Sword, Longbow and Warbow are added (made like the Longsword blueprint) if there aren't any by those names.
 */
export async function updateWeaponBlueprints(store: ScopeStore, cs: ChangeSet) {
  const defs = Array.from(store.notes.values()).filter((n) => !n.isTemplate && !n.copyOf && n.type === CRAFT_DEF_TYPE.forge);
  const configOf = (n: AgNote) => { const f = store.fieldsByNote.get(n.id)?.get("craft"); const c = f ? parseCraftConfig(f.value) : null; return f && c?.kind === "forge" ? { f, c } : null; };
  for (const n of defs) {
    const r = REDICED[n.name], fc = configOf(n);
    if (!r || !fc || fc.c.damageDie !== r[0]) continue;
    const next = { ...fc.c, damageDie: r[1] };
    await store.putField({ ...fc.f, value: (typeof fc.f.value === "string" ? JSON.stringify(next) : next) as any }, cs);
  }
  const model = defs.find((n) => n.name === "Longsword" && configOf(n)) ?? defs.find((n) => configOf(n));
  if (!model) return;
  const base = configOf(model)!.c;
  for (const nb of NEW_BLUEPRINTS) {
    if (defs.some((n) => n.name === nb.name)) continue;
    const made = await snap.createFromSnapshot(store, await snap.takeSnapshot(store, model.id), { name: nb.name, folder: model.folder, ownerIds: [], acl: model.acl }, cs, { fromTemplateId: model.templateId ?? undefined });
    await fieldVal(store, made, "description", nb.description, cs);
    await fieldVal(store, made, "craft", JSON.stringify({ ...base, damageDie: nb.damageDie, parts: nb.parts }), cs);
  }
}

export const STARTER_SCROLLS = ["scroll:Longsword", "scroll:Dagger", "scroll:Battle Axe", "scroll:Healing Draught Recipe", "scroll:Energy Tonic Recipe", "scroll:Rune of Flame", "scroll:Rune of Frost"];
/** Give a character a copy of each of these (by key in `made`). */
export async function giveCopies(store: ScopeStore, hero: AgNote, made: Record<string, AgNote>, give: Array<[string, number]>, cs: ChangeSet) {
  for (const [k, qty] of give) {
    const n = made[k];
    if (!n) continue;
    const s = await snap.takeSnapshot(store, n.id);
    const c = await snap.createFromSnapshot(store, s, { name: n.name, folder: CA_COPIES_FOLDER, ownerIds: [], copyOf: n.id }, cs);
    const q = store.fieldsByNote.get(c.id)?.get("qty");
    if (q) await store.putField({ ...q, value: qty }, cs);
    await store.putLink({ id: randomUUID(), fromNoteId: c.id, toNoteId: hero.id, label: "owner", reverseLabel: "items", acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
    await syncCopyOwners(store, c.id, cs);
  }
}
