// Cultivator's Adventure crafting: the Blueprint, Recipe and Rune Recipe
// templates (built on the Agnostic crafting engine — see
// shared/agnostic/crafting.ts) and a starter set: blueprints for the common
// weapons, materials, ingredients, inks, tools, a recipe and runes. GMs make
// more from the templates in campaigns and My Library; admin in Admin.
import { randomUUID } from "crypto";
import type { AgNote, AgSnapshot, AgValue } from "@shared/agnostic/types";
import { SIGILS, type ForgeConfig, type AlchemyConfig, type RuneConfig, type CraftNeed } from "@shared/agnostic/crafting";
import type { ChangeSet, ScopeStore } from "../store";
import * as snap from "../snapshot";
import { p, i, t, h, block, icon, tip, section, type DocNode } from "./doc";
import { Sheet, itemTemplate, CA_CRAFT_ITEM_KINDS, CA_COPIES_FOLDER, type ItemKind } from "./ca";
import { syncCopyOwners } from "../copies";

export const CA_CRAFT_FOLDER = "Cultivator's Adventure — Crafting";
const GILT = "#d4a24c";
export const CA_DEF_TEMPLATE_NAMES = { forge: "CA Blueprint", alchemy: "CA Recipe", rune: "CA Rune Recipe" } as const;
export const CA_CRAFT_ITEM_TEMPLATE_NAMES: Record<string, string> = { Material: "CA Material", Ingredient: "CA Ingredient", Ink: "CA Ink", Tool: "CA Tool", Part: "CA Part" };

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
export async function applyCACrafting(store: ScopeStore, cs: ChangeSet, opts: { starter: boolean }): Promise<Record<string, AgNote>> {
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
  if (!opts.starter || Array.from(store.notes.values()).some((n) => n.folder === CA_CRAFT_FOLDER)) return tpl;

  // ---- starter set: originals the GM gives copies of (and recipes to share)
  const make = async (template: AgNote | undefined, name: string, values: Record<string, AgValue>, acl?: AgNote["acl"]) => {
    if (!template) return null;
    const n = await snap.createFromSnapshot(store, await snap.takeSnapshot(store, template.id), { name, folder: CA_CRAFT_FOLDER, ownerIds: [], ...(acl ? { acl } : {}) }, cs, { fromTemplateId: template.id });
    for (const [k, v] of Object.entries(values)) await fieldVal(store, n, k, v, cs);
    return n;
  };
  const M = tpl.Material, IG = tpl.Ingredient, INK = tpl.Ink, TOOL = tpl.Tool;
  const mats = {
    iron: await make(M, "Iron Ingot", { heat_min: 55, heat_max: 78, hardness: 4, metal_color: "#9ca3af", weight: 2, value: 8, rarity: "Common" }),
    steel: await make(M, "Steel Ingot", { heat_min: 64, heat_max: 84, hardness: 6, metal_color: "#cbd5e1", weight: 2, value: 20, rarity: "Uncommon" }),
    bronze: await make(M, "Bronze Ingot", { heat_min: 40, heat_max: 62, hardness: 3, metal_color: "#c2853d", weight: 2, value: 6, rarity: "Common" }),
    silver: await make(M, "Starsteel Ingot", { heat_min: 72, heat_max: 88, hardness: 8, metal_color: "#e0f2fe", weight: 1.5, value: 60, rarity: "Rare" }),
    oak: await make(M, "Oak Haft", { heat_min: 0, heat_max: 0, hardness: 2, metal_color: "#8b5a2b", weight: 1, value: 2, rarity: "Common" }),
    leather: await make(M, "Leather Grip", { heat_min: 0, heat_max: 0, hardness: 1, metal_color: "#6b4226", weight: 0.3, value: 3, rarity: "Common" }),
  };
  const ing = {
    redleaf: await make(IG, "Redleaf", { rarity: "Common", value: 2 }),
    water: await make(IG, "Spring Water", { rarity: "Common", value: 1 }),
    moss: await make(IG, "Ember Moss", { rarity: "Uncommon", value: 6 }),
    moonpetal: await make(IG, "Moonpetal", { rarity: "Rare", value: 15 }),
  };
  const inks = {
    ember: await make(INK, "Emberglow Ink", { ink_color: "#f97316", ink_glow: 85, rarity: "Uncommon", value: 12 }),
    frost: await make(INK, "Frostlight Ink", { ink_color: "#38bdf8", ink_glow: 70, rarity: "Uncommon", value: 12 }),
    gall: await make(INK, "Iron Gall Ink", { ink_color: "#27272a", ink_glow: 0, rarity: "Common", value: 3 }),
  };
  const tools = {
    knife: await make(TOOL, "Carving Knife", { mark_style: "Carved", weight: 0.5, value: 10 }),
    quill: await make(TOOL, "Rune Quill", { mark_style: "Drawn", weight: 0.1, value: 15 }),
  };
  const need = (n: AgNote | null, qty = 1, consumed = true): CraftNeed => ({ noteId: n?.id ?? null, name: n?.name ?? "", qty, consumed });

  // Blueprints: known to everyone (the forge is no secret); recipes and runes the GM shares.
  const open = { view: "everyone" as const, edit: "gm" as const };
  const bp = (name: string, desc: string, config: Omit<ForgeConfig, "kind" | "partTemplate" | "effects">) =>
    make(tpl.forge, name, { description: desc, craft: JSON.stringify({ kind: "forge", partTemplate: tpl.Part.id, effects: [], ...config } satisfies ForgeConfig) }, open);
  const W = weaponTpl?.id ?? null;
  await bp("Longsword", "A straight two-edged blade on a gripped handle, with a guard and pommel if you like.", { damageDie: 8, output: W, parts: [{ key: "blade", label: "Blade", role: "blade", shape: "long_blade" }, { key: "handle", label: "Handle", role: "handle", shape: "grip" }, { key: "guard", label: "Guard", role: "extra", shape: "guard", optional: true }, { key: "pommel", label: "Pommel", role: "extra", shape: "pommel", optional: true }] });
  await bp("Dagger", "A short blade — quick and light.", { damageDie: 4, output: W, parts: [{ key: "blade", label: "Blade", role: "blade", shape: "short_blade" }, { key: "handle", label: "Handle", role: "handle", shape: "grip" }, { key: "guard", label: "Guard", role: "extra", shape: "guard", optional: true }] });
  await bp("Sabre", "A curved, single-edged blade.", { damageDie: 8, output: W, parts: [{ key: "blade", label: "Blade", role: "blade", shape: "curved_blade" }, { key: "handle", label: "Handle", role: "handle", shape: "grip" }, { key: "guard", label: "Guard", role: "extra", shape: "guard", optional: true }] });
  await bp("Battle Axe", "A heavy axe head on a long haft.", { damageDie: 10, output: W, parts: [{ key: "head", label: "Axe head", role: "blade", shape: "axe_head" }, { key: "haft", label: "Haft", role: "handle", shape: "long_haft" }] });
  await bp("Scythe", "A sweeping blade on a pole.", { damageDie: 10, output: W, parts: [{ key: "blade", label: "Blade", role: "blade", shape: "scythe_blade" }, { key: "haft", label: "Haft", role: "handle", shape: "long_haft" }] });
  await bp("Spear", "A leaf-shaped head on a long haft.", { damageDie: 8, output: W, parts: [{ key: "head", label: "Spear head", role: "blade", shape: "spear_head" }, { key: "haft", label: "Haft", role: "handle", shape: "long_haft" }] });
  await bp("Warhammer", "A crushing head on a haft.", { damageDie: 10, output: W, parts: [{ key: "head", label: "Hammer head", role: "blade", shape: "hammer_head" }, { key: "haft", label: "Haft", role: "handle", shape: "long_haft" }] });
  await bp("Bow Stave", "The bow's body — a springy stave and a grip.", { damageDie: 8, output: W, parts: [{ key: "stave", label: "Stave", role: "blade", shape: "bow_stave" }, { key: "grip", label: "Grip", role: "handle", shape: "grip", optional: true }] });
  await bp("Arrowhead", "Arrow tips (with fletching if you like).", { damageDie: 6, output: ammoTpl?.id ?? W, parts: [{ key: "tip", label: "Arrow tip", role: "blade", shape: "arrow_tip" }, { key: "fletching", label: "Fletching", role: "extra", shape: "fletching", optional: true }] });

  // A recipe and what it makes.
  const draught = await make(potionTpl, "Healing Draught", { heal_dice: "2d6", heal_wounds: "None", rarity: "Common", value: 30, weight: 0.2 });
  await make(tpl.alchemy, "Healing Draught Recipe", {
    description: "A red, bitter draught that knits flesh.",
    craft: JSON.stringify({
      kind: "alchemy", ingredients: [need(ing.redleaf, 2), need(ing.water, 1)], output: draught?.id ?? null, effects: [],
      steps: [{ id: "s1", type: "dice", ingredient: "Redleaf", amount: 3 }, { id: "s2", type: "heat", amount: 62 }, { id: "s3", type: "add", ingredient: "Redleaf", amount: 55 },
        { id: "s4", type: "mix", amount: 8 }, { id: "s5", type: "strain" }, { id: "s6", type: "rest", amount: 5 }],
    } satisfies AlchemyConfig),
  });
  // Runes.
  const runeOut = runeTpl?.id ?? null;
  await make(tpl.rune, "Rune of Flame", {
    description: "A burning sigil: the weapon strikes hotter.",
    craft: JSON.stringify({ kind: "rune", sigil: SIGILS.flame.strokes, ingredients: [need(ing.moss, 1)], tools: [need(tools.knife, 1, false), need(tools.quill, 1, false)], needsInk: false, output: runeOut, effect: { key: "damage_bonus", values: { default: 1, slight: 2, huge: 3 } } } satisfies RuneConfig),
  });
  await make(tpl.rune, "Rune of Warding", {
    description: "A warding sigil drawn in luminous ink: armor turns blows more surely.",
    craft: JSON.stringify({ kind: "rune", sigil: SIGILS.ward.strokes, ingredients: [need(ing.moonpetal, 1)], tools: [need(tools.quill, 1, false)], needsInk: true, output: runeOut, effect: { key: "armor_dc", values: { default: 1, slight: 1, huge: 2 } } } satisfies RuneConfig),
  });
  return { ...tpl, ...Object.fromEntries(Object.entries({ ...mats, ...ing, ...inks, ...tools }).filter(([, v]) => !!v)) as Record<string, AgNote> };
}

/** Give a character copies of starter supplies (the example character). */
export async function giveStarterSupplies(store: ScopeStore, hero: AgNote, made: Record<string, AgNote>, cs: ChangeSet) {
  const give: Array<[string, number]> = [["iron", 3], ["steel", 1], ["oak", 2], ["leather", 1], ["redleaf", 4], ["water", 2], ["moss", 2], ["ember", 2], ["knife", 1], ["quill", 1]];
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
  for (const [k, v] of Object.entries({ blacksmithing: 2, alchemy: 1, rune_making: 1 })) await fieldVal(store, hero, k, v, cs);
}
