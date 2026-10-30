// Bringing CA Agnostic content that already exists up to date with the kit.
// New campaigns and libraries get the current kit when they're filled; these
// steps upgrade ones made before a change, once each (a level stored per
// scope in agnostic_scope_meta). Each step only adds what's missing and leaves
// anything the GM changed alone wherever it can.
import * as Y from "yjs";
import { randomUUID } from "crypto";
import { noteDocName, regionDocName, type AgNote } from "@shared/agnostic/types";
import type { ScopeStore } from "../store";
import * as repo from "../repo";
import * as docs from "../docs";
import * as snap from "../snapshot";
import { syncCopyOwners } from "../copies";
import { appendNodes, insertNodes, p, h, icon, muted, val, button, pAlign, hr, section, tip, type DocNode } from "./doc";
import { applyCACrafting, giveCopies, STARTER_SCROLLS, STARTER_BREW_EFFECTS, updateWeaponBlueprints, CA_CRAFT_FOLDER } from "./caCrafting";
import type { AgField } from "@shared/agnostic/types";
import {
  CA_KIT_FOLDER, rankTooltip, itemRollsNodes,
  // Levels 1–7 built the single-use abilities that level 8 turns into techniques.
  legacyAbilityTabContent as abilityTabContent, legacyAbilityTemplateSnapshot as abilityTemplateSnapshot, legacyAbilityPage as abilityPage,
  LEGACY_ABILITY_LIST_COLUMNS as ABILITY_LIST_COLUMNS, LEGACY_ABILITY_HELP as ABILITY_HELP, LEGACY_INVENTORY_HELP,
  abilityTabContent as techniqueAbilityTab, abilityTemplateSnapshot as abilityPackSnapshot, aspectAbilityNode as techniqueAbilityNode,
  ASPECT_VIA as TECHNIQUE_VIA, ASPECT_TEMPLATE_DESCRIPTION, INVENTORY_HELP, ABILITY_HELP as ABILITY_SET_HELP, abilityColor,
  CA_COPIES_FOLDER, adoptCharacterCopies, FOCUS_NOTE, woundBadges, LEGACY_ITEM_RANK_CHOICES as ITEM_RANK_CHOICES, CA_CARD_DC,
  ASPECT_VIA, ALL_ABILITIES, ABILITY_LIST_COLUMNS as ABILITY_SET_COLUMNS, ASPECT_HELP, subAbilityNodes,
  FOCUS_FORMULA, CA_SHEET_ACL, CA_ITEM_TEMPLATE_NAMES,
  effectsNodes, WOUND_EFFECTS_HELP, ITEM_EFFECTS_HELP, USABLE_FORMULA, USABLE_NOTE,
  TEMP_HP_COLOR, TEMP_ENERGY_COLOR, TEMP_ENERGY_LINE,
  ATTR_BUDGET_FORMULA, SKILL_BUDGET_FORMULA, ATTR_BUDGET_NOTE, SKILL_BUDGET_NOTE,
  // Levels before 26 knew the six ranks of five stars; level 26 moves everything onto the Pillars.
  LEGACY_RANK_NAMES as RANK_NAMES, RANK_FORMULAS, LEGACY_LADDER_LABELS as LADDER_LABELS, legacyRankLadder as rankLadder, trainingTemplateSnapshot,
  itemTemplate, beastTemplateSnapshot, applyCATrackerSettings, AMMO_TYPES, AMMO_HELP, RANGED_HELP, LEGACY_AMMO, attackAspectTemplateSnapshot, STATION_HELP, CRAFTING_HELP,
  RANK_HELP, LEGACY_RANK_HELP, HEALTH_HELP, LEGACY_HEALTH_HELP, ENERGY_HELP, LEGACY_ENERGY_HELP, LEGACY_FOCUS_NOTE,
  LEGACY_FOCUS_COSTS_NOTE,
  craftingSkillNodes, craftingTabContent, craftBenchNode, scrollNodes, runeSlotNodes, DURABILITY_HELP, SELL_HELP, ITEM_RANKS, ITEM_RANK_COLORS, RUNE_SOCKETS_HELP, RUNE_SPACE_HELP, LEGACY_RUNE_SPACE_HELP, RUNEABLE_KINDS, TOOL_HELP, TOOL_SKILL_HELP, TOOL_MIN_RUNE_HELP, LEGACY_CRAFTING_HELP, LEGACY_CRAFTING_HELP_2, itemRankOf, CRAFT_SKILL_HELP, HEAL_VALUE, POTENCY_HELP, ITEM_TYPES, ITEM_TYPE_COLORS,
  vitalsNodes, identityChips, traitsNodes, budgetNodes, itemsHeading, tagColourLine, consumableLine, traitRollsNodes,
  LEVEL_ATTR_BUDGET_FORMULA, LEVEL_SKILL_BUDGET_FORMULA, WOUNDS_HELP, CULTIVATION_HELP, CONSUMABLE_HELP,
} from "./ca";
import type { AgAction, AgRollSpec } from "@shared/agnostic/types";
import { SELL_VALUE_FORMULA } from "@shared/agnostic/crafting";
import { defaultScaleStep } from "@shared/agnostic/types";

/** Bump when adding a step below. */
export const CA_KIT_LEVEL = 35;
const marker = (key: string) => `kit-upgrade:${key}`;

/** A scope that was just filled with the current kit needs no upgrades. */
export async function markKitCurrent(store: ScopeStore) {
  await repo.setSeedLevel(marker(store.key), CA_KIT_LEVEL);
}

export async function upgradeCAKit(store: ScopeStore) {
  const level = await repo.getSeedLevel(marker(store.key));
  if (level >= CA_KIT_LEVEL) return;
  const characterTemplates = Array.from(store.notes.values()).filter((n) => n.isTemplate && n.name === "CA Character");
  if (!characterTemplates.length) { await repo.setSeedLevel(marker(store.key), CA_KIT_LEVEL); return; }
  if (level < 1) await upgrade1(store, characterTemplates);
  if (level < 2) await upgrade2(store, characterTemplates);
  if (level < 3) await upgrade3(store, characterTemplates);
  if (level < 4) await upgrade4(store, characterTemplates);
  if (level < 5) await upgrade5(store, characterTemplates);
  if (level < 6) await upgrade6(store, characterTemplates);
  if (level < 7) await upgrade7(store, characterTemplates);
  if (level < 8) await upgrade8(store, characterTemplates);
  if (level < 9) await upgrade9(store, characterTemplates);
  if (level < 10) await upgrade10(store, characterTemplates);
  if (level < 11) await upgrade11(store, characterTemplates);
  if (level < 12) await upgrade12(store, characterTemplates);
  if (level < 13) await upgrade13(store);
  if (level < 14) await upgrade14(store);
  if (level < 15) await upgrade15(store);
  if (level < 16) await upgrade16(store, characterTemplates);
  if (level < 17) await upgrade17(store, characterTemplates);
  if (level < 18) await upgrade17(store, characterTemplates);
  if (level < 19) await upgrade19(store, characterTemplates);
  if (level < 20) await upgrade20(store);
  if (level < 21) await upgrade21(store, characterTemplates);
  if (level < 22) await upgrade22(store, characterTemplates);
  if (level < 23) await upgrade23(store, characterTemplates);
  if (level < 25) await upgrade24(store);
  if (level < 26) await upgrade26(store);
  if (level < 27) await upgrade27(store);
  if (level < 28) await upgrade28(store);
  if (level < 29) await upgrade29(store);
  if (level < 30) await upgrade30(store);
  if (level < 31) await upgrade31(store);
  if (level < 32) await upgrade32(store);
  if (level < 33) await upgrade33(store);
  if (level < 34) await upgrade34(store);
  if (level < 35) await upgrade35(store);
  await repo.setSeedLevel(marker(store.key), CA_KIT_LEVEL);
  console.log(`[agnostic] CA kit: ${store.key} brought up to level ${CA_KIT_LEVEL}`);
}

/** Level 1: rank tooltip; abilities become their own sheets listed on the Ability tab. */
async function upgrade1(store: ScopeStore, characterTemplates: AgNote[]) {
  const templateIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => templateIds.has(n.id) || (n.templateId && templateIds.has(n.templateId)));
  await store.run(async (cs) => {
    // The rank ladder behind a ? beside Rank.
    const tip = rankTooltip();
    for (const n of characters) {
      const f = store.fieldsByNote.get(n.id)?.get("rank");
      if (f && !f.options.tooltip) await store.putField({ ...f, options: { ...f.options, tooltip: tip } }, cs);
    }

    // The ability template.
    let abilityTemplate = Array.from(store.notes.values()).find((n) => n.isTemplate && n.name === "CA Ability");
    if (!abilityTemplate) abilityTemplate = await snap.createFromSnapshot(store, abilityTemplateSnapshot(), {}, cs);

    // Each character's single ability (name + description) becomes an ability sheet in its list.
    for (const n of characters) {
      if (n.isTemplate) continue;
      const fields = store.fieldsByNote.get(n.id);
      const name = String(fields?.get("ability_name")?.value ?? "").trim();
      if (!name) continue;
      const already = Array.from(store.links.values()).some((l) => l.toNoteId === n.id && l.label === "holder" && store.notes.get(l.fromNoteId)?.name === name);
      if (already) continue;
      const s = await snap.takeSnapshot(store, abilityTemplate.id);
      const a = await snap.createFromSnapshot(store, s, { name, folder: n.folder ?? CA_KIT_FOLDER, ownerIds: [...n.ownerIds] }, cs, { fromTemplateId: abilityTemplate.id });
      const desc = store.fieldsByNote.get(a.id)?.get("description");
      const oldDesc = String(fields?.get("ability_description")?.value ?? "");
      if (desc && oldDesc) await store.putField({ ...desc, value: oldDesc }, cs);
      await store.putLink({ id: randomUUID(), fromNoteId: a.id, toNoteId: n.id, label: "holder", reverseLabel: "abilities", acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
    }
  });

  // The Ability tab of each character (and its template) shows the abilities list.
  for (const n of characters) await replaceAbilityTab(n);
}

async function replaceAbilityTab(note: AgNote) {
  const name = noteDocName(note.id, note.docEpoch);
  const entry = await docs.getDoc(name, note.id);
  const frag = entry.doc.getXmlFragment("default");
  let tab: Y.XmlElement | null = null;
  const walk = (node: Y.XmlFragment | Y.XmlElement) => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (child.nodeName === "agTab" && child.getAttribute("title") === "Ability") { tab = child; return; }
      walk(child);
      if (tab) return;
    }
  };
  walk(frag);
  if (!tab) return;
  const t = tab as Y.XmlElement;
  // Already has the list: leave it be.
  const hasList = (node: Y.XmlElement): boolean => node.toArray().some((c) => c instanceof Y.XmlElement && ((c.nodeName === "agLinks" && c.getAttribute("label") === "abilities") || hasList(c)));
  if (hasList(t)) return;
  entry.doc.transact(() => {
    t.delete(0, t.length);
    appendNodes(t, abilityTabContent());
  });
  // Saved with everything else (the doc saves itself shortly after a change).
  docs.subscribe(entry, "kit-upgrade");
  docs.unsubscribe(name, "kit-upgrade");
}

// --------------------------------------------------------------------------- level 2
// Physique and Aura go; Max Focus is 6 + 2 per star + 4 per rank; characters
// get an Initiative button; abilities and items get Rolls (as many as the GM
// likes, each with its own dice and costs) in place of their fixed buttons;
// new sheets start hidden from players.

const textOf = (el: Y.XmlElement): string => el.toArray().map((c) => (c instanceof Y.XmlText ? c.toDelta().map((d: any) => (typeof d.insert === "string" ? d.insert : "")).join("") : c instanceof Y.XmlElement ? textOf(c) : "")).join("");
function findAll(node: Y.XmlFragment | Y.XmlElement, pred: (el: Y.XmlElement) => boolean, out: Y.XmlElement[] = []): Y.XmlElement[] {
  for (const c of node.toArray()) if (c instanceof Y.XmlElement) { if (pred(c)) out.push(c); findAll(c, pred, out); }
  return out;
}
const hasType = (node: Y.XmlFragment | Y.XmlElement, type: string) => findAll(node, (e) => e.nodeName === type).length > 0;

/** Change a sheet's page in place; it saves itself shortly after. */
async function editPage(note: AgNote, fn: (doc: Y.Doc, frag: Y.XmlFragment) => void) {
  const name = noteDocName(note.id, note.docEpoch);
  const entry = await docs.getDoc(name, note.id);
  entry.doc.transact(() => fn(entry.doc, entry.doc.getXmlFragment("default")));
  docs.subscribe(entry, "kit-upgrade");
  docs.unsubscribe(name, "kit-upgrade");
}

/** "2d6 + 3" → dice, die, bonus (null if it's anything fancier). */
function parseDice(expr: string): { count: string; die: string; bonus: string } | null {
  const m = /^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(expr ?? "");
  if (!m) return null;
  return { count: m[1] || "1", die: m[2], bonus: m[3] ? `${m[3] === "-" ? "-" : ""}${m[4]}` : "0" };
}

const rollAction = (noteId: string, name: string, roll: AgRollSpec, icon: string, color: string, sortOrder: number): AgAction =>
  ({ id: randomUUID(), noteId, name, steps: [], acl: { view: "inherit", edit: "owners" }, color, options: { roll, icon, showName: true, showIcon: true, listed: true, sortOrder } });

async function upgrade2(store: ScopeStore, characterTemplates: AgNote[]) {
  const notes = Array.from(store.notes.values());
  const charTemplateIds = new Set(characterTemplates.map((t) => t.id));
  const characters = notes.filter((n) => charTemplateIds.has(n.id) || (n.templateId && charTemplateIds.has(n.templateId)));
  const abilityTemplates = notes.filter((n) => n.isTemplate && n.name === "CA Ability");
  const abilityIds = new Set(abilityTemplates.map((t) => t.id));
  const abilities = notes.filter((n) => abilityIds.has(n.id) || (n.templateId && abilityIds.has(n.templateId)));
  const itemTemplates = notes.filter((n) => n.isTemplate && CA_ITEM_TEMPLATE_NAMES.includes(n.name));
  const itemIds = new Set(itemTemplates.map((t) => t.id));
  const items = notes.filter((n) => itemIds.has(n.id) || (n.templateId && itemIds.has(n.templateId)));
  const fieldOf = (noteId: string, key: string) => store.fieldsByNote.get(noteId)?.get(key);
  const initiativeIds = new Map<string, string>();
  const physiqueRegions = new Map<string, string>();

  await store.run(async (cs) => {
    // New sheets made from the kit's templates start hidden from players.
    for (const t of [...characterTemplates, ...abilityTemplates, ...itemTemplates, ...notes.filter((n) => n.isTemplate && (n.name === "Wound" || n.name === "Trait") && n.folder === CA_KIT_FOLDER)]) {
      if (t.acl.view === "everyone") await store.putNote({ ...t, acl: { ...CA_SHEET_ACL } }, cs, true);
    }

    for (const n of characters) {
      // Physique and Aura are gone.
      for (const key of ["physique", "overload", "aura"]) { const f = fieldOf(n.id, key); if (f) await store.removeField(f.id, cs); }
      const reg = store.regionsOf(n.id).find((r) => r.label === "Physique");
      if (reg) physiqueRegions.set(n.id, reg.id);
      // Max Focus: 6 + 2 per star + 4 per rank (only if it's still the kit's old formula).
      const fm = fieldOf(n.id, "focus_max");
      if (fm && fm.formula?.replace(/\s+/g, "") === "10+2*rank_index") await store.putField({ ...fm, formula: FOCUS_FORMULA }, cs);
      const rank = fieldOf(n.id, "rank");
      if (rank && (!rank.options.tooltip || rank.options.tooltip.startsWith("Your rank is read from your"))) await store.putField({ ...rank, options: { ...rank.options, tooltip: rankTooltip() } }, cs);
      // Initiative.
      let init = store.actionsOf(n.id).find((a) => a.steps.some((st) => st.type === "initiative"));
      if (!init) {
        init = { id: randomUUID(), noteId: n.id, name: "Initiative", steps: [{ type: "initiative", expr: "1d20 + finesse", label: "Initiative" }], acl: { view: "inherit", edit: "owners" }, color: "#b45309", options: { icon: "fa-solid fa-bolt", showName: true, showIcon: true, listed: false } };
        await store.putAction(init, cs);
        initiativeIds.set(n.id, init.id);
      }
    }

    // Abilities: their single Use / effect become rolls with their own costs.
    for (const n of abilities) {
      const f = (k: string) => fieldOf(n.id, k);
      const old = store.actionsOf(n.id).filter((a) => a.name === "Use" || a.name === "Roll effect");
      const hasRolls = store.actionsOf(n.id).some((a) => a.options?.roll);
      if (!hasRolls && (old.length || f("attribute"))) {
        const attr = String(f("attribute")?.value ?? "Anemos");
        const skill = String(f("skill")?.value ?? "None");
        const skillKey = skill === "None" ? "" : skill === "Focus" ? "focus_skill" : skill.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        await store.putAction(rollAction(n.id, "Roll", {
          via: "holder", count: String(f("dice_count")?.value ?? 1), die: attr === "None" ? "20" : `@holder.${attr.toLowerCase()}_die`, add: skillKey,
          bonus: String(f("bonus")?.value ?? 0), costs: [{ key: "energy", amount: String(f("energy_cost")?.value ?? 0) }, { key: "focus", amount: String(f("focus_cost")?.value ?? 0) }],
        }, "die:d20", "#9f1239", 1), cs);
        const fx = parseDice(String(f("effect")?.formula ?? ""));
        if (fx) await store.putAction(rollAction(n.id, "Effect", { via: "holder", ...fx, add: "", costs: [] }, "fa-solid fa-burst", "#7c2d12", 2), cs);
      }
      for (const a of old) await store.removeAction(a.id, cs);
      for (const key of ["energy_cost", "focus_cost", "attribute", "skill", "dice_count", "bonus", "die", "skill_bonus", "roll_text", "cost_text", "usable", "effect", "cooldown"]) {
        const x = f(key); if (x) await store.removeField(x.id, cs);
      }
    }

    // Weapons: Strike and Damage become rolls (Damage keeps its dice); every item gets a Rolls block.
    for (const n of items) {
      const acts = store.actionsOf(n.id);
      const strike = acts.find((a) => a.name === "Strike" && !a.options?.roll);
      const damage = acts.find((a) => a.name === "Damage" && !a.options?.roll);
      if (strike) { await store.removeAction(strike.id, cs); await store.putAction(rollAction(n.id, "Strike", { via: "owner", count: "1", die: "20", add: "", bonus: "0", costs: [] }, "die:d20", strike.color ?? "#b45309", 1), cs); }
      if (damage) {
        const dmgField = fieldOf(n.id, "damage");
        const d = parseDice(String(dmgField?.formula ?? "1d8")) ?? { count: "1", die: "8", bonus: "0" };
        await store.removeAction(damage.id, cs);
        await store.putAction(rollAction(n.id, "Damage", { via: "owner", ...d, add: "", costs: [] }, "die:d8", damage.color ?? "#b91c1c", 2), cs);
        if (dmgField) await store.removeField(dmgField.id, cs);
      }
    }
  });

  // Pages.
  for (const n of characters) {
    const physique = physiqueRegions.get(n.id);
    const initId = initiativeIds.get(n.id);
    await editPage(n, (doc, frag) => {
      // Physique section (and the divider after it).
      if (physique) {
        const sec = findAll(frag, (e) => e.nodeName === "agRegion" && e.getAttribute("regionId") === physique)[0];
        const parent = sec?.parent as Y.XmlElement | Y.XmlFragment | undefined;
        if (sec && parent) {
          const kids = parent.toArray();
          const i = kids.indexOf(sec);
          const next = kids[i + 1];
          parent.delete(i, next instanceof Y.XmlElement && next.nodeName === "horizontalRule" ? 2 : 1);
        }
      }
      // Identity chips: no Aura; Age and Birthday as wide as the chips above, Languages across the last two.
      const canvases = doc.getMap<Y.Map<any>>("canvases");
      canvases.forEach((m) => {
        if (!(m instanceof Y.Map) || !m.has("bg_aura")) return;
        m.delete("bg_aura"); m.delete("v_aura");
        const place = (key: string, x: number, w: number) => {
          const bg = m.get(`bg_${key}`), v = m.get(`v_${key}`);
          if (bg) m.set(`bg_${key}`, { ...bg, x, w });
          if (v) m.set(`v_${key}`, { ...v, x: x + 8, w: w - 12 });
        };
        place("age", 4, 152); place("birthday", 164, 152); place("languages", 324, 312);
      });
      // Initiative button at the top of the Overview tab.
      if (initId) {
        const overview = findAll(frag, (e) => e.nodeName === "agTab" && e.getAttribute("title") === "Overview")[0];
        if (overview && !findAll(overview, (e) => e.nodeName === "agButton" && e.getAttribute("actionId") === initId).length) {
          insertNodes(overview, 0, [pAlign("right", button(initId, "Roll initiative", { height: 30, fontSize: 12 }))]);
        }
      }
      // The help lines under the lists describe the rolls now.
      for (const [starts, text] of [["Use spends the ability", ABILITY_HELP], ["Click an item to open it: its Use, Strike", LEGACY_INVENTORY_HELP]] as const) {
        for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).startsWith(starts))) {
          const parent = para.parent as Y.XmlElement | Y.XmlFragment;
          const i = parent.toArray().indexOf(para);
          parent.delete(i, 1);
          insertNodes(parent, i, [p(muted(text))]);
        }
      }
      // Lists: abilities show their rolls; the inventory shows each item's rolls.
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks")) {
        const label = el.getAttribute("label");
        const cols = el.getAttribute("columns") as any;
        if (label === "abilities") {
          const old = Array.isArray(cols) ? cols : [];
          if (old.some((c: any) => c?.ref === "roll_text" || c?.ref === "Use")) el.setAttribute("columns", ABILITY_LIST_COLUMNS as any);
        } else if (label === "items" && Array.isArray(cols) && !cols.some((c: any) => c?.display === "rolls")) {
          el.setAttribute("columns", [...cols, { ref: "", display: "rolls" }] as any);
        }
      }
    });
  }
  for (const n of abilities) {
    const gm = store.regionsOf(n.id).find((r) => r.label === "GM notes");
    await editPage(n, (_doc, frag) => {
      if (hasType(frag, "agRolls")) return;
      frag.delete(0, frag.length);
      appendNodes(frag, abilityPage(gm?.id ?? null));
    });
  }
  for (const n of items) {
    await editPage(n, (_doc, frag) => {
      if (hasType(frag, "agRolls")) return;
      const top = frag.toArray();
      // A weapon's old Attack / Rolls headings and their lines give way to the Rolls block.
      const attack = top.findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "heading" && textOf(c).trim() === "Attack");
      if (attack >= 0) {
        let end = attack;
        for (let k = attack + 1; k < top.length; k++) {
          const c = top[k];
          if (c instanceof Y.XmlElement && c.nodeName === "paragraph" && hasType(c, "agButton")) { end = k; break; }
          if (c instanceof Y.XmlElement && c.nodeName === "heading" && textOf(c).trim() !== "Rolls") break;
          end = k;
        }
        frag.delete(attack, end - attack + 1);
        insertNodes(frag, attack, [p(muted("HANDEDNESS "), val("handedness", { look: { bold: true } })), ...itemRollsNodes()]);
        return;
      }
      const runes = top.findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "heading" && textOf(c).trim() === "Runes");
      if (runes >= 0) insertNodes(frag, runes, itemRollsNodes());
      else appendNodes(frag, itemRollsNodes());
    });
  }
  // The Physique sections' own text goes with them.
  await store.run(async (cs) => { for (const id of Array.from(physiqueRegions.values())) if (store.regions.has(id)) await store.removeRegion(id, cs); });
}

// --------------------------------------------------------------------------- level 3
// Max Focus is 6 + 1 per star; HP, Energy and Focus go up with their maximum
// (a rank up adds its extra); Temp HP is taken first and shows green on the
// bar; wounds, traits, items and abilities get an Effects block that really
// changes the values of the sheet they're on.

async function editRegion(note: AgNote, regionId: string, fn: (frag: Y.XmlFragment) => void) {
  const name = regionDocName(regionId, note.docEpoch);
  const entry = await docs.getDoc(name, note.id);
  entry.doc.transact(() => fn(entry.doc.getXmlFragment("default")));
  docs.subscribe(entry, "kit-upgrade");
  docs.unsubscribe(name, "kit-upgrade");
}
/** Swap the paragraph that starts with `starts` for new nodes (each match). */
function replacePara(frag: Y.XmlFragment | Y.XmlElement, starts: string, nodes: Parameters<typeof insertNodes>[2]) {
  for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).trim().startsWith(starts))) {
    const parent = para.parent as Y.XmlElement | Y.XmlFragment;
    const i = parent.toArray().indexOf(para);
    parent.delete(i, 1);
    insertNodes(parent, i, nodes);
  }
}
const OLD_FOCUS = ["10+2*rank_index", "6+2*rank_index+4*floor(rank_index/5)"];

async function upgrade3(store: ScopeStore, characterTemplates: AgNote[]) {
  const notes = Array.from(store.notes.values());
  const ids = (names: string[]) => new Set(notes.filter((n) => n.isTemplate && names.includes(n.name)).map((n) => n.id));
  const of = (tpl: Set<string>) => notes.filter((n) => tpl.has(n.id) || (n.templateId && tpl.has(n.templateId)));
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = of(charIds);
  const wounds = of(ids(["Wound"])).filter((n) => n.isTemplate ? n.folder === CA_KIT_FOLDER : true);
  const traits = of(ids(["Trait"]));
  const items = of(ids(CA_ITEM_TEMPLATE_NAMES));
  const abilities = of(ids(["CA Ability"]));
  const fieldOf = (noteId: string, key: string) => store.fieldsByNote.get(noteId)?.get(key);

  await store.run(async (cs) => {
    for (const n of characters) {
      const fm = fieldOf(n.id, "focus_max");
      if (fm && OLD_FOCUS.includes((fm.formula ?? "").replace(/\s+/g, ""))) await store.putField({ ...fm, formula: FOCUS_FORMULA }, cs);
      // Usable Energy: the star's set amount, not half of whatever the pool holds.
      const ue = fieldOf(n.id, "usable_energy");
      if (ue && (ue.formula ?? "").replace(/\s+/g, "") === "floor(energy_pool/2)") await store.putField({ ...ue, formula: USABLE_FORMULA }, cs);
      const rank = fieldOf(n.id, "rank");
      if (rank && (!rank.options.tooltip || rank.options.tooltip.startsWith("Your rank is read from your"))) await store.putField({ ...rank, options: { ...rank.options, tooltip: rankTooltip() } }, cs);
      const hp = fieldOf(n.id, "hp");
      if (hp && !fieldOf(n.id, "temp_hp")) {
        await store.putField({ id: randomUUID(), noteId: n.id, key: "temp_hp", label: "Temp HP", type: "number", value: 0, formula: null, options: { min: 0 }, acl: { view: "inherit", edit: "inherit" }, sortOrder: hp.sortOrder, templateFieldId: null }, cs);
      }
      for (const [key, follows, shield] of [["hp", "hp_max", "temp_hp"], ["energy", "usable_energy", undefined], ["focus", "focus_max", undefined]] as const) {
        const f = fieldOf(n.id, key);
        if (!f || f.type !== "number" || (f.options.follows && (!shield || f.options.shield))) continue;
        await store.putField({ ...f, options: { ...f.options, follows: f.options.follows ?? follows, ...(shield ? { shield: f.options.shield ?? shield } : {}) } }, cs);
      }
    }
    // The wound's old "effects" text: gone from the template; kept on a sheet only if it says something.
    for (const n of wounds) {
      const f = fieldOf(n.id, "effects");
      if (f && (n.isTemplate || !String(f.value ?? "").trim())) await store.removeField(f.id, cs);
    }
  });

  for (const n of characters) {
    const regions = store.regionsOf(n.id);
    const health = regions.find((r) => r.label === "Health");
    if (health) await editRegion(n, health.id, (frag) => {
      if (findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "temp_hp").length) return;
      replacePara(frag, "20 base, +5 per star", [
        p(muted("Temp HP "), val("temp_hp", { display: "input" }), muted("  — taken before HP; shows in green on the bar.")),
        p(muted("20 base, +5 per star, +10 per rank — scales with Rank above, and a rank up adds its extra HP to your current HP. Click the bar to heal or hurt.")),
      ]);
    });
    const focus = regions.find((r) => r.label === "Focus");
    if (focus) await editRegion(n, focus.id, (frag) => {
      replacePara(frag, "6 to start, +2 per star", [p(muted("6 to start, +1 per star. Choosing where a wound lands costs Focus: Body 0, Arm 2, Leg 2, Head 4. Resets on a long rest."))]);
      replacePara(frag, "Choosing where a wound lands costs Focus", [p(muted("6 to start, +1 per star. Choosing where a wound lands costs Focus: Body 0, Arm 2, Leg 2, Head 4. Resets on a long rest."))]);
    });
    const energy = regions.find((r) => r.label === "Energy Pool");
    if (energy) await editRegion(n, energy.id, (frag) => {
      for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).includes("half the pool"))) {
        // The value stays; only the words after it change.
        for (const c of para.toArray()) if (c instanceof Y.XmlText && c.toString().includes("half the pool")) {
          const at = c.toDelta().map((d: any) => d.insert).join("").indexOf(" — half the pool");
          if (at >= 0) { c.delete(at, " — half the pool".length); c.insert(at, USABLE_NOTE, { textStyle: { color: "#a8a29e" } }); }
        }
      }
    });
    const wounds = regions.find((r) => r.label === "Wounds");
    const fixWoundList = (frag: Y.XmlFragment) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "wounds")) {
        const cols = el.getAttribute("columns") as any;
        if (Array.isArray(cols) && !cols.some((c: any) => c?.display === "effects")) {
          el.setAttribute("columns", [...cols.filter((c: any) => c?.ref !== "effects"), { ref: "", display: "effects" }] as any);
        }
      }
    };
    if (wounds) await editRegion(n, wounds.id, fixWoundList);
    await editPage(n, (_doc, frag) => fixWoundList(frag));
  }

  // Wounds: the Effects block takes the place of the old summary and the GM's how-to.
  for (const n of wounds) {
    await editPage(n, (_doc, frag) => {
      if (hasType(frag, "agEffects")) return;
      const top = frag.toArray();
      const head = top.findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "heading" && textOf(c).trim() === "Effects");
      if (head >= 0) {
        let end = head;
        for (let k = head + 1; k < top.length; k++) {
          const c = top[k];
          if (!(c instanceof Y.XmlElement)) break;
          if (c.nodeName === "agFieldBlock" || (c.nodeName === "paragraph" && textOf(c).startsWith("GM: make the effects real"))) end = k; else break;
        }
        frag.delete(head, end - head + 1);
        insertNodes(frag, head, effectsNodes("bearer", "", WOUND_EFFECTS_HELP));
        // A sheet that kept its old summary shows it under the effects.
        if (fieldOf(n.id, "effects")) insertNodes(frag, head + 3, [p(muted("Notes "), val("effects", { look: { bold: true } }))]);
      } else {
        const hr = top.findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "horizontalRule");
        insertNodes(frag, hr >= 0 ? hr : frag.length, effectsNodes("bearer", "", WOUND_EFFECTS_HELP));
      }
    });
  }
  for (const n of traits) {
    await editPage(n, (_doc, frag) => {
      if (hasType(frag, "agEffects")) return;
      replacePara(frag, "GM: a trait can change its holder", []);
      appendNodes(frag, effectsNodes("holder", "", "What this trait changes on its holder, for as long as they have it."));
    });
  }
  const afterRolls = (frag: Y.XmlFragment) => {
    const top = frag.toArray();
    const i = top.findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "agRolls");
    if (i < 0) return frag.length;
    const next = top[i + 1];
    return next instanceof Y.XmlElement && next.nodeName === "paragraph" && !hasType(next, "agField") ? i + 2 : i + 1;
  };
  for (const n of items) {
    await editPage(n, (_doc, frag) => {
      if (hasType(frag, "agEffects")) return;
      insertNodes(frag, afterRolls(frag), effectsNodes("owner", "equipped", ITEM_EFFECTS_HELP));
    });
  }
  for (const n of abilities) {
    await editPage(n, (_doc, frag) => {
      if (hasType(frag, "agEffects")) return;
      insertNodes(frag, afterRolls(frag), effectsNodes("holder", "", "Passive changes this ability makes to its holder (leave empty if none)."));
    });
  }
}

// --------------------------------------------------------------------------- level 4
// Temp Energy, like Temp HP: spent before Energy, pink on the bar (and token).
async function upgrade4(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const fieldOf = (noteId: string, key: string) => store.fieldsByNote.get(noteId)?.get(key);
  await store.run(async (cs) => {
    for (const n of characters) {
      const energy = fieldOf(n.id, "energy");
      if (!energy) continue;
      if (!fieldOf(n.id, "temp_energy")) {
        await store.putField({ id: randomUUID(), noteId: n.id, key: "temp_energy", label: "Temp Energy", type: "number", value: 0, formula: null, options: { min: 0, color: TEMP_ENERGY_COLOR }, acl: { view: "inherit", edit: "inherit" }, sortOrder: energy.sortOrder, templateFieldId: null }, cs);
      }
      if (energy.type === "number" && !energy.options.shield) await store.putField({ ...energy, options: { ...energy.options, shield: "temp_energy" } }, cs);
      const th = fieldOf(n.id, "temp_hp");
      if (th && !th.options.color) await store.putField({ ...th, options: { ...th.options, color: TEMP_HP_COLOR } }, cs);
    }
  });
  for (const n of characters) {
    const energy = store.regionsOf(n.id).find((r) => r.label === "Energy Pool");
    if (!energy) continue;
    await editRegion(n, energy.id, (frag) => {
      if (findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "temp_energy").length) return;
      appendNodes(frag, [TEMP_ENERGY_LINE]);
    });
  }
}

// --------------------------------------------------------------------------- level 5
// Every star brings one more attribute point and one more skill (modifier) point.
async function upgrade5(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const flat = (x: string | null | undefined) => (x ?? "").replace(/\s+/g, "");
  await store.run(async (cs) => {
    for (const n of characters) {
      const a = store.fieldsByNote.get(n.id)?.get("attr_budget");
      if (a && flat(a.formula) === "4+floor(level/3)") await store.putField({ ...a, formula: ATTR_BUDGET_FORMULA }, cs);
      const k = store.fieldsByNote.get(n.id)?.get("skill_budget");
      if (k && flat(k.formula) === "8+(level-1)+skill_reclaimed") await store.putField({ ...k, formula: SKILL_BUDGET_FORMULA }, cs);
    }
  });
  for (const n of characters) {
    await editPage(n, (_doc, frag) => {
      replacePara(frag, "Attributes can't go below 0. 4 + one per 3 levels.", [p(muted(ATTR_BUDGET_NOTE))]);
      replacePara(frag, "8 + one per level; up to 6 back", [p(muted(SKILL_BUDGET_NOTE))]);
    });
  }
}

// --------------------------------------------------------------------------- level 6
// Livelihood, the new top rank. A rank formula is only replaced where it is
// still the kit's own for the old five-rank ladder (or the old Usable Energy).
async function upgrade6(store: ScopeStore, characterTemplates: AgNote[]) {
  const flat = (x: string | null | undefined) => (x ?? "").replace(/\s+/g, "");
  const old = rankLadder(RANK_NAMES.slice(0, 5));
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const notes = Array.from(store.notes.values());
  const characters = notes.filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const oldTags = ["Unranked", ...old.labels].join("|");
  await store.run(async (cs) => {
    for (const n of characters) {
      for (const [key, formula] of Object.entries(RANK_FORMULAS)) {
        const f = store.fieldsByNote.get(n.id)?.get(key);
        if (f && flat(f.formula) === flat(old.formulas[key]) && f.formula !== formula) await store.putField({ ...f, formula }, cs);
      }
      const rank = store.fieldsByNote.get(n.id)?.get("rank");
      if (rank && (!rank.options.tooltip || rank.options.tooltip.startsWith("Your rank is read from your"))) await store.putField({ ...rank, options: { ...rank.options, tooltip: rankTooltip() } }, cs);
    }
    // Items' Rank tag can be a Livelihood star too.
    for (const fields of Array.from(store.fieldsByNote.values())) {
      const f = fields.get("rank_tag");
      if (f && f.type === "select" && (f.options.choices ?? []).join("|") === oldTags) await store.putField({ ...f, options: { ...f.options, choices: ["Unranked", ...LADDER_LABELS] } }, cs);
    }
  });
}

// --------------------------------------------------------------------------- level 7
// Attribute points: one per main rank (not per star); skill points stay one per
// star. Training items (manuals, pills…) raise values for good or grant points,
// through bonus point values on the character.
async function upgrade7(store: ScopeStore, characterTemplates: AgNote[]) {
  const flat = (x: string | null | undefined) => (x ?? "").replace(/\s+/g, "");
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const oldAttr = ["4+floor(level/3)", "4+floor(level/3)+rank_index"];
  const oldSkill = ["8+(level-1)+skill_reclaimed", "8+(level-1)+skill_reclaimed+rank_index"];
  await store.run(async (cs) => {
    for (const n of characters) {
      const fields = store.fieldsByNote.get(n.id);
      const level = fields?.get("level");
      for (const [key, label] of [["bonus_attr_points", "Bonus attribute points"], ["bonus_skill_points", "Bonus skill points"]] as const) {
        if (fields?.get(key)) continue;
        await store.putField({ id: randomUUID(), noteId: n.id, key, label, type: "number", value: 0, formula: null, options: { min: 0, tooltip: `Extra ${key === "bonus_attr_points" ? "attribute" : "skill"} points from training items (manuals, pills, elixirs…). They add to the budget.` }, acl: { view: "inherit", edit: "inherit" }, sortOrder: level?.sortOrder ?? 0, templateFieldId: null }, cs);
      }
      const a = store.fieldsByNote.get(n.id)?.get("attr_budget");
      if (a && oldAttr.includes(flat(a.formula))) await store.putField({ ...a, formula: ATTR_BUDGET_FORMULA }, cs);
      const k = store.fieldsByNote.get(n.id)?.get("skill_budget");
      if (k && oldSkill.includes(flat(k.formula))) await store.putField({ ...k, formula: SKILL_BUDGET_FORMULA }, cs);
    }
    if (!Array.from(store.notes.values()).some((x) => x.isTemplate && x.name === "CA Training Item")) {
      await snap.createFromSnapshot(store, trainingTemplateSnapshot(), {}, cs);
    }
  });
  for (const n of characters) {
    await editPage(n, (_doc, frag) => {
      for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).startsWith("Attributes can't go below 0.") && textOf(e) !== ATTR_BUDGET_NOTE)) {
        const parent = para.parent as Y.XmlElement | Y.XmlFragment; const i = parent.toArray().indexOf(para); parent.delete(i, 1); insertNodes(parent, i, [p(muted(ATTR_BUDGET_NOTE))]);
      }
      for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).startsWith("8 + one per level") && textOf(e) !== SKILL_BUDGET_NOTE)) {
        const parent = para.parent as Y.XmlElement | Y.XmlFragment; const i = parent.toArray().indexOf(para); parent.delete(i, 1); insertNodes(parent, i, [p(muted(SKILL_BUDGET_NOTE))]);
      }
    });
  }
}

// --------------------------------------------------------------------------- level 8
// Abilities become sets of techniques. Each single-use ability sheet becomes a
// Technique (same sheet: its rolls, costs, effects, hotbar slots all carry on),
// put inside a new Ability of the same name that the character has. Its rolls
// and effects now reach the character through its ability (ability.holder).
// The character's Ability tab lists the abilities, then all their techniques
// tagged by ability. Items, abilities and traits removed from a character
// stay in the campaign (they're only disconnected).
async function upgrade8(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const isCharacter = (n?: AgNote) => !!n && (charIds.has(n.id) || (!!n.templateId && charIds.has(n.templateId)) || n.type === "character" || n.type === "npc");
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  // Single-use abilities: ability sheets without a tag colour (the new Ability sets have one).
  const legacy = Array.from(store.notes.values()).filter((n) => n.type === "ability" && !store.fieldsByNote.get(n.id)?.get("tag_color"));
  const fix = (x: string) => (x ?? "").replace(/@holder\./g, `@${TECHNIQUE_VIA}.`);
  await store.run(async (cs) => {
    // 1. They become techniques: type, and every route to the character goes through the ability.
    for (const n of legacy) {
      const isKitTemplate = n.isTemplate && n.name === "CA Ability";
      await store.putNote({
        ...n, type: "technique",
        ...(isKitTemplate ? { name: "CA Technique", templateMeta: { ...(n.templateMeta ?? { version: 1 }), description: ASPECT_TEMPLATE_DESCRIPTION } } : {}),
      }, cs);
      for (const a of store.actionsOf(n.id)) {
        const r = a.options?.roll;
        const roll = r ? { ...r, via: r.via === "holder" ? TECHNIQUE_VIA : r.via, count: fix(r.count), die: fix(r.die), bonus: fix(r.bonus), costs: r.costs.map((c) => ({ ...c, amount: fix(c.amount) })) } : undefined;
        const steps = JSON.parse(fix(JSON.stringify(a.steps)));
        await store.putAction({ ...a, steps, ...(roll ? { options: { ...a.options, roll } } : {}) }, cs);
      }
      for (const f of Array.from(store.fieldsByNote.get(n.id)?.values() ?? [])) {
        if (f.formula && f.formula.includes("@holder.")) await store.putField({ ...f, formula: fix(f.formula) }, cs);
      }
      for (const m of Array.from(store.modifiers.values())) {
        if (m.noteId === n.id && m.via === "holder") await store.putModifier({ ...m, via: TECHNIQUE_VIA }, cs);
      }
    }
    // 2. The new Ability (a set of techniques) template.
    let pack = Array.from(store.notes.values()).find((n) => n.isTemplate && n.type === "ability" && store.fieldsByNote.get(n.id)?.get("tag_color"));
    if (!pack) pack = await snap.createFromSnapshot(store, abilityPackSnapshot(), {}, cs);
    const packSnap = await snap.takeSnapshot(store, pack.id);
    // 3. Each technique a character had goes into an Ability of the same name, which the character has.
    const perCharacter = new Map<string, number>();
    for (const n of legacy.filter((x) => !x.isTemplate)) {
      const held = store.linksOf(n.id).map((l) => (l.fromNoteId === n.id && l.label === "holder" ? { l, other: l.toNoteId } : l.toNoteId === n.id && l.reverseLabel === "holder" ? { l, other: l.fromNoteId } : null))
        .filter((x): x is NonNullable<typeof x> => !!x && isCharacter(store.notes.get(x.other)));
      if (!held.length) continue;
      const k = perCharacter.get(held[0].other) ?? 0;
      perCharacter.set(held[0].other, k + 1);
      const a = await snap.createFromSnapshot(store, packSnap, { name: n.name, folder: n.folder, ownerIds: [...n.ownerIds], portrait: n.portrait }, cs, { fromTemplateId: pack.id });
      await store.putNote({ ...store.notes.get(a.id)!, acl: { ...n.acl } }, cs);
      const desc = store.fieldsByNote.get(n.id)?.get("description")?.value;
      const fd = store.fieldsByNote.get(a.id)?.get("description");
      if (fd && typeof desc === "string") await store.putField({ ...fd, value: desc }, cs);
      const fc = store.fieldsByNote.get(a.id)?.get("tag_color");
      if (fc) await store.putField({ ...fc, value: abilityColor(k) }, cs);
      for (const { l, other } of held) {
        await store.removeLink(l.id, cs);
        await store.putLink({ id: randomUUID(), fromNoteId: a.id, toNoteId: other, label: "holder", reverseLabel: "abilities", acl: { ...l.acl }, createdAt: Date.now() }, cs);
      }
      await store.putLink({ id: randomUUID(), fromNoteId: n.id, toNoteId: a.id, label: "ability", reverseLabel: "techniques", acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
    }
  });
  // 4. Pages: techniques show their ability and roll through it; characters get the new Ability tab.
  for (const n of legacy) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agRolls" || e.nodeName === "agEffects")) {
        if (el.getAttribute("via") === "holder") el.setAttribute("via", TECHNIQUE_VIA);
      }
      if (!findAll(frag, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "ability").length) insertNodes(frag, 0, [techniqueAbilityNode()]);
    });
  }
  for (const n of characters) {
    await editPage(n, (_doc, frag) => {
      const tab = findAll(frag, (e) => e.nodeName === "agTab" && e.getAttribute("title") === "Ability")[0];
      if (tab && !findAll(tab, (e) => e.nodeName === "agLinks" && String(e.getAttribute("label")).startsWith("abilities.")).length) {
        tab.delete(0, tab.length);
        appendNodes(tab, techniqueAbilityTab());
      }
      // Removing an item or trait takes it off this character only.
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks" && (e.getAttribute("label") === "items" || e.getAttribute("label") === "traits"))) {
        const cfg = (el.getAttribute("config") ?? {}) as any;
        if (cfg.remove === "delete") el.setAttribute("config", { ...cfg, remove: "disconnect" } as any);
      }
      for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e) === LEGACY_INVENTORY_HELP)) {
        const parent = para.parent as Y.XmlElement | Y.XmlFragment; const i = parent.toArray().indexOf(para); parent.delete(i, 1); insertNodes(parent, i, [p(muted(INVENTORY_HELP))]);
      }
    });
  }
}

// --------------------------------------------------------------------------- level 9
// Characters' items, abilities and traits become their own copies ("Player Owned
// Copies"): picked or dragged onto a character, an original gives a copy and stays
// as it is; a copy moves; one taken off stays among the copies to give again.
async function upgrade9(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  await renameTechniquesToAspects(store, characters);
  // Abilities' own pages: their techniques list gives copies too.
  const abilities = Array.from(store.notes.values()).filter((n) => n.type === "ability" && store.fieldsByNote.get(n.id)?.get("tag_color"));
  await store.run((cs) => adoptCharacterCopies(store, cs));
  const giveCopies = (el: Y.XmlElement) => {
    const cfg = (el.getAttribute("config") ?? {}) as any;
    if (cfg.add && !cfg.add.copy) el.setAttribute("config", { ...cfg, add: { ...cfg.add, copy: true, copyFolder: CA_COPIES_FOLDER } } as any);
  };
  for (const n of characters) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks" && ["items", "traits", "abilities", "abilities.aspects"].includes(String(e.getAttribute("label"))))) giveCopies(el);
      for (const [starts, text] of [["Each item's rolls are on its card", INVENTORY_HELP], ["Each ability is a set of techniques.", ABILITY_SET_HELP]] as const) {
        for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).startsWith(starts) && textOf(e) !== text)) {
          const parent = para.parent as Y.XmlElement | Y.XmlFragment; const i = parent.toArray().indexOf(para); parent.delete(i, 1); insertNodes(parent, i, [p(muted(text))]);
        }
      }
    });
  }
  for (const n of abilities) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "aspects")) giveCopies(el);
    });
  }
}

// Techniques are called Ability Aspects: sheet type "aspect", connected to their
// ability as "aspects"; the kit's wording on the pages follows. Text the GM wrote
// is left alone (only the kit's own sentences change).
const KIT_WORDING: Array<[string, string]> = [
  [" Techniques", " Ability Aspects"],
  ["  — its techniques' tags and cards on the character use it.", "  — its aspects' tags and cards on the character use it."],
  ["Each technique is one use of this ability, with its own rolls and Energy / Focus costs. Press Add to make one (or drag one here from the sidebar); open it to set its rolls up. The character who has this ability rolls and pays.",
    "Each aspect is one use of this ability, with its own rolls and Energy / Focus costs. Press Add to make one (or drag one here from the sidebar); open it to set its rolls up. The character who has this ability rolls and pays."],
  ["rolled and paid by whoever has this technique's ability.", "rolled and paid by whoever has this aspect's ability."],
  ["Passive changes this technique makes to whoever has its ability (leave empty if none).", "Passive changes this aspect makes to whoever has its ability (leave empty if none)."],
  ["notes about this technique only the GM sees.", "notes about this aspect only the GM sees."],
];
const renameJson = (v: unknown) => JSON.parse(JSON.stringify(v).replace(/Techniques/g, "Aspects").replace(/techniques/g, "aspects").replace(/Technique/g, "Aspect").replace(/technique/g, "aspect").replace(/a aspect/g, "an aspect"));
function kitWordingToAspects(frag: Y.XmlFragment) {
  for (const el of findAll(frag, () => true)) {
    for (const c of el.toArray()) {
      if (!(c instanceof Y.XmlText)) continue;
      const delta = c.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>;
      let changed = false;
      const next = delta.map((d) => {
        if (typeof d.insert !== "string") return d;
        let t = d.insert;
        for (const [a, b] of KIT_WORDING) if (t.includes(a)) t = t.split(a).join(b);
        if (t !== d.insert) changed = true;
        return { ...d, insert: t };
      });
      if (changed) { c.delete(0, c.length); c.applyDelta(next); }
    }
    // The lists: their connection, what they add, their columns and empty text.
    if (el.nodeName === "agLinks") {
      for (const k of ["label", "config", "columns"]) {
        const v = el.getAttribute(k) as unknown;
        if (v === undefined || v === null) continue;
        const r = renameJson(v);
        if (JSON.stringify(r) !== JSON.stringify(v)) el.setAttribute(k, r as any);
      }
    }
  }
}
async function renameTechniquesToAspects(store: ScopeStore, characters: AgNote[]) {
  const techniques = Array.from(store.notes.values()).filter((n) => n.type === "technique");
  const abilities = Array.from(store.notes.values()).filter((n) => n.type === "ability");
  await store.run(async (cs) => {
    for (const n of techniques) {
      const kit = n.isTemplate && n.name === "CA Technique";
      await store.putNote({ ...n, type: "aspect", ...(kit ? { name: "CA Ability Aspect", templateMeta: { ...(n.templateMeta ?? { version: 1 }), description: ASPECT_TEMPLATE_DESCRIPTION } } : {}) }, cs);
    }
    for (const l of Array.from(store.links.values())) {
      if (l.label === "techniques" || l.reverseLabel === "techniques") {
        await store.putLink({ ...l, label: l.label === "techniques" ? "aspects" : l.label, reverseLabel: l.reverseLabel === "techniques" ? "aspects" : l.reverseLabel }, cs);
      }
    }
  });
  const pages = async (n: AgNote) => {
    await editPage(n, (_doc, frag) => kitWordingToAspects(frag));
    for (const r of Array.from(store.regions.values()).filter((x) => x.noteId === n.id)) await editRegion(n, r.id, (frag) => kitWordingToAspects(frag));
  };
  for (const n of [...techniques, ...abilities]) await pages(n);
  // Characters: their Ability tab is the kit's — the new one, with Ability Aspects.
  for (const n of characters) {
    await editPage(n, (_doc, frag) => {
      const tab = findAll(frag, (e) => e.nodeName === "agTab" && e.getAttribute("title") === "Ability")[0];
      if (tab && findAll(tab, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "abilities.techniques").length) {
        tab.delete(0, tab.length);
        appendNodes(tab, techniqueAbilityTab());
      }
    });
  }
}

// --------------------------------------------------------------------------- level 10
// Abilities inside abilities: an ability's page gets "Abilities within"; an
// aspect rolls as whoever has its ability at the top of the chain
// (ability.holder*); the character's Ability Aspects list shows the aspects of
// the abilities inside its abilities too (abilities+.aspects).
async function upgrade10(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const aspects = Array.from(store.notes.values()).filter((n) => n.type === "aspect");
  const abilities = Array.from(store.notes.values()).filter((n) => n.type === "ability" && store.fieldsByNote.get(n.id)?.get("tag_color"));
  const OLD = "ability.holder";
  const up = (x: string) => (x ?? "").split(`@${OLD}.`).join(`@${ASPECT_VIA}.`);
  await store.run(async (cs) => {
    for (const n of aspects) {
      for (const a of store.actionsOf(n.id)) {
        const r = a.options?.roll;
        const roll = r ? { ...r, via: r.via === OLD ? ASPECT_VIA : r.via, count: up(r.count), die: up(r.die), bonus: up(r.bonus), costs: r.costs.map((c) => ({ ...c, amount: up(c.amount) })) } : undefined;
        const steps = JSON.parse(up(JSON.stringify(a.steps)));
        if (JSON.stringify(roll) !== JSON.stringify(r) || JSON.stringify(steps) !== JSON.stringify(a.steps)) await store.putAction({ ...a, steps, ...(roll ? { options: { ...a.options, roll } } : {}) }, cs);
      }
      for (const f of Array.from(store.fieldsByNote.get(n.id)?.values() ?? [])) if (f.formula?.includes(`@${OLD}.`)) await store.putField({ ...f, formula: up(f.formula) }, cs);
    }
    for (const m of Array.from(store.modifiers.values())) {
      const owner = store.notes.get(m.noteId);
      if (owner?.type === "aspect" && m.via === OLD) await store.putModifier({ ...m, via: ASPECT_VIA }, cs);
      if (owner?.type === "ability" && m.via === "holder") await store.putModifier({ ...m, via: "holder*" }, cs);
    }
  });
  for (const n of aspects) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agRolls" || e.nodeName === "agEffects")) if (el.getAttribute("via") === OLD) el.setAttribute("via", ASPECT_VIA);
    });
  }
  for (const n of abilities) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agEffects")) if (el.getAttribute("via") === "holder") el.setAttribute("via", "holder*");
      replacePara(frag, "Passive changes this ability makes to its holder", [p(muted("Passive changes this ability makes to the character who has it (leave empty if none)."))]);
      if (findAll(frag, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "abilities").length) return;
      // "Abilities within" goes before the Effects heading (or the GM notes, or at the end).
      const top = frag.toArray();
      let at = top.findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "heading" && textOf(c).trim() === "Effects");
      if (at < 0) at = top.findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "agRegion");
      insertNodes(frag, at < 0 ? top.length : at, subAbilityNodes());
    });
  }
  for (const n of characters) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks")) {
        const label = String(el.getAttribute("label"));
        if (label === "abilities.aspects") el.setAttribute("label", `${ALL_ABILITIES}.aspects`);
        if (label === "abilities") {
          const cols = (el.getAttribute("columns") ?? []) as any[];
          if (Array.isArray(cols) && !cols.some((c) => c?.ref === "abilities")) el.setAttribute("columns", ABILITY_SET_COLUMNS as any);
        }
      }
      replacePara(frag, "Every aspect from this character's abilities", [p(muted(ASPECT_HELP))]);
    });
  }
}

// --------------------------------------------------------------------------- level 11
// A character's items, traits and abilities (and an ability's abilities within)
// are only added — from the sidebar, as the character's own copy — never made
// new right there (a sheet made inside a character had no original to copy).
async function upgrade11(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const abilities = Array.from(store.notes.values()).filter((n) => n.type === "ability" && store.fieldsByNote.get(n.id)?.get("tag_color"));
  const addOnly = (labels: string[]) => (_doc: Y.Doc, frag: Y.XmlFragment) => {
    for (const el of findAll(frag, (e) => e.nodeName === "agLinks" && labels.includes(String(e.getAttribute("label"))))) {
      const cfg = (el.getAttribute("config") ?? {}) as any;
      if (cfg.add && cfg.add.createNew !== false) el.setAttribute("config", { ...cfg, add: { ...cfg.add, createNew: false } } as any);
    }
  };
  for (const n of characters) {
    await editPage(n, addOnly(["items", "traits", "abilities"]));
    for (const r of Array.from(store.regions.values()).filter((x) => x.noteId === n.id)) await editRegion(n, r.id, (frag) => addOnly(["items", "traits", "abilities"])(null as any, frag));
  }
  for (const n of abilities) await editPage(n, addOnly(["abilities"]));
}

// --------------------------------------------------------------------------- level 12
// Focus has nothing to do with wounds (it's spent targeting an enemy, by hand):
// wounds lose their "Focus cost to aim here", and the Focus section its note
// about choosing where a wound lands — it keeps its current / max and bar.
async function upgrade12(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const wounds = Array.from(store.notes.values()).filter((n) => n.type === "wound");
  await store.run(async (cs) => {
    for (const n of wounds) {
      const f = store.fieldsByNote.get(n.id)?.get("focus_cost");
      if (f) await store.removeField(f.id, cs);
    }
  });
  for (const n of wounds) {
    await editPage(n, (_doc, frag) => {
      for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && findAll(e, (x) => x.nodeName === "agField" && x.getAttribute("ref") === "focus_cost").length > 0)) {
        const parent = para.parent as Y.XmlElement | Y.XmlFragment; const i = parent.toArray().indexOf(para); parent.delete(i, 1); insertNodes(parent, i, [woundBadges()]);
      }
    });
  }
  const focusPara = (frag: Y.XmlFragment) => replacePara(frag, "6 to start, +1 per star. Choosing where a wound lands", [p(muted(FOCUS_NOTE))]);
  for (const n of characters) {
    await editPage(n, (_doc, frag) => focusPara(frag));
    for (const r of Array.from(store.regions.values()).filter((x) => x.noteId === n.id)) await editRegion(n, r.id, focusPara);
  }
}

// --------------------------------------------------------------------------- level 13
// Players see and roll what's on their character but don't change it: copies
// lose the owners they picked up from their character (the GM gives ownership
// when they want someone to edit one) and get them as users instead.
async function upgrade13(store: ScopeStore) {
  const copies = Array.from(store.notes.values()).filter((n) => n.copyOf && !n.isTemplate);
  await store.run(async (cs) => {
    for (const n of copies) if (n.ownerIds.length) await store.putNote({ ...n, ownerIds: [] }, cs, true);
    for (const n of copies) await syncCopyOwners(store, n.id, cs);
  });
}

// --------------------------------------------------------------------------- level 14
// Most items have a rank but no star: an item's Rank can be "Gold" as well as
// "Gold 3". Choices the GM added stay (after the kit's).
async function upgrade14(store: ScopeStore) {
  await store.run(async (cs) => {
    for (const fields of Array.from(store.fieldsByNote.values())) {
      const f = fields.get("rank_tag");
      if (!f || f.type !== "select") continue;
      const have = f.options.choices ?? [];
      const choices = [...ITEM_RANK_CHOICES, ...have.filter((c) => !ITEM_RANK_CHOICES.includes(c))];
      if (choices.join("|") !== have.join("|")) await store.putField({ ...f, options: { ...f.options, choices } }, cs);
    }
  });
}

// --------------------------------------------------------------------------- level 15
// The tracker card shows the character's DC where it showed the last roll (rolls
// are in the dice tray and the roll history).
async function upgrade15(store: ScopeStore) {
  const st = store.settings;
  if (store.scope.kind !== "campaign" || !st) return;
  let changed = false;
  const cards = st.tracker.cards.map((c) => {
    if (c.id !== "ca-card") return c;
    const items = c.layout.items.map((it) => {
      if (it.widget.kind !== "lastRoll") return it;
      changed = true;
      return { ...it, y: Math.max(0, it.y - 2), h: Math.max(it.h, 18), widget: { ...CA_CARD_DC } as any };
    });
    return { ...c, layout: { ...c.layout, items } };
  });
  if (changed) await store.run((cs) => store.putSettings({ ...st, tracker: { ...st.tracker, cards } }, cs));
}

// --------------------------------------------------------------------------- level 16
// Help text moves out of the way: each grey description under a title becomes
// a ? beside that title. The Overview is condensed — Rank, DC, Health, Energy
// Pool, Energy and Focus in one panel on top, then the identity chips (no
// Level: C.A. goes by rank; DC is up in the panel; Languages across the whole
// row), the traits as icons, and Wounds. The Traits tab goes (traits are on the
// Overview) and traits get Rolls like items and abilities. The point budgets
// lose their level terms.

const MUTED = "#a8a29e";
/** A plain grey help paragraph the kit put under something (no values or buttons in it). */
function isMutedHelp(el: Y.XmlElement): boolean {
  if (el.nodeName !== "paragraph" || !el.length) return false;
  let text = "";
  for (const c of el.toArray()) {
    if (!(c instanceof Y.XmlText)) return false;
    for (const d of c.toDelta() as Array<{ insert: unknown; attributes?: any }>) {
      if (typeof d.insert !== "string") return false;
      if (!d.insert.trim()) { text += d.insert; continue; }
      if (d.attributes?.textStyle?.color !== MUTED) return false;
      text += d.insert;
    }
  }
  return text.trim().length > 0;
}
const tipNode = (text: string): DocNode => tip(text.trim());
/** Put a ? with `text` beside a title: after a heading's words, or after the bold title in a columns' first cell. */
function addTipTo(title: Y.XmlElement, text: string): boolean {
  if (findAll(title, (e) => e.nodeName === "agTip").length) return true;
  const target = title.nodeName === "heading" ? title : title.nodeName === "agColumns" ? findAll(title, (e) => e.nodeName === "paragraph")[0] : undefined;
  if (!target) return false;
  const last = target.toArray()[target.length - 1];
  if (last instanceof Y.XmlText) last.insert(last.length, " ");
  else appendNodes(target, [{ text: " " } as any]);
  appendNodes(target, [tipNode(text)]);
  return true;
}
/** Every grey help paragraph whose title is close above it becomes that title's ?. */
function helpToTips(frag: Y.XmlFragment | Y.XmlElement) {
  for (const para of findAll(frag, isMutedHelp)) {
    const parent = para.parent as Y.XmlElement | Y.XmlFragment;
    const kids = parent.toArray();
    const at = kids.indexOf(para);
    let title: Y.XmlElement | null = null;
    for (let k = at - 1; k >= Math.max(0, at - 5); k--) {
      const c = kids[k];
      if (!(c instanceof Y.XmlElement) || c.nodeName === "horizontalRule") break;
      if (c.nodeName === "heading" || (c.nodeName === "agColumns" && hasBoldTitle(c))) { title = c; break; }
      if (isMutedHelp(c)) break;
    }
    if (title && addTipTo(title, textOf(para))) parent.delete(parent.toArray().indexOf(para), 1);
  }
}
/** A columns row whose first cell starts with a bold title (a framed section's title row). */
function hasBoldTitle(cols: Y.XmlElement): boolean {
  const para = findAll(cols, (e) => e.nodeName === "paragraph")[0];
  if (!para) return false;
  return para.toArray().some((c) => c instanceof Y.XmlText && (c.toDelta() as any[]).some((d) => typeof d.insert === "string" && d.insert.trim() && d.attributes?.bold));
}
/** Remove the paragraph(s) starting with `starts`. */
function dropPara(frag: Y.XmlFragment | Y.XmlElement, starts: string) {
  for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).trim().startsWith(starts))) {
    const parent = para.parent as Y.XmlElement | Y.XmlFragment;
    parent.delete(parent.toArray().indexOf(para), 1);
  }
}
const KIT_OVERVIEW_SECTIONS = new Set(["Rank", "Health", "Energy Pool", "Focus", "Wounds"]);

async function upgrade16(store: ScopeStore, characterTemplates: AgNote[]) {
  const notes = Array.from(store.notes.values());
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = notes.filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const fieldOf = (n: AgNote, key: string) => store.fieldsByNote.get(n.id)?.get(key);
  const traits = notes.filter((n) => n.type === "trait" && fieldOf(n, "summary"));

  // Budgets without levels (where the GM hasn't changed them); then Level itself, unless something still uses it.
  const flat = (x: string | null | undefined) => (x ?? "").replace(/\s+/g, "");
  await store.run(async (cs) => {
    for (const n of characters) {
      const a = fieldOf(n, "attr_budget");
      if (a && flat(a.formula) === flat(LEVEL_ATTR_BUDGET_FORMULA)) await store.putField({ ...a, formula: ATTR_BUDGET_FORMULA }, cs);
      const k = fieldOf(n, "skill_budget");
      if (k && flat(k.formula) === flat(LEVEL_SKILL_BUDGET_FORMULA)) await store.putField({ ...k, formula: SKILL_BUDGET_FORMULA }, cs);
    }
    for (const n of characters) {
      const lvl = fieldOf(n, "level");
      if (!lvl) continue;
      const used = Array.from(store.fieldsByNote.get(n.id)?.values() ?? []).some((f) => f.key !== "level" && /\blevel\b/.test(f.formula ?? ""));
      if (!used) await store.removeField(lvl.id, cs);
    }
  });

  // Traits: a Rolls block (before their Effects), and help as ?s.
  for (const n of traits) {
    await editPage(n, (_doc, frag) => {
      if (!hasType(frag, "agRolls")) {
        const top = frag.toArray();
        let at = top.findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "heading" && textOf(c).trim() === "Effects");
        if (at < 0) at = top.length;
        insertNodes(frag, at, traitRollsNodes());
      }
      helpToTips(frag);
    });
  }

  // Every other kit sheet: its help as ?s (abilities, aspects, items, wounds).
  const others = notes.filter((n) => !charIds.has(n.id) && !(n.templateId && charIds.has(n.templateId)) && n.type !== "trait"
    && ["ability", "aspect", "item", "wound"].includes(n.type));
  for (const n of others) {
    await editPage(n, (_doc, frag) => {
      if (n.type === "ability") replacePara(frag, "Tag colour", [tagColourLine()]);
      if (n.type === "item") {
        for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).trim().startsWith("Heals") && textOf(e).includes("Using one takes it from the stack"))) {
          const parent = para.parent as Y.XmlElement | Y.XmlFragment;
          const i = parent.toArray().indexOf(para);
          // The "Use" heading above gets the explanation.
          const head = parent.toArray().slice(0, i).reverse().find((c) => c instanceof Y.XmlElement && c.nodeName === "heading") as Y.XmlElement | undefined;
          if (head) addTipTo(head, CONSUMABLE_HELP);
          parent.delete(i, 1);
          insertNodes(parent, i, [consumableLine()]);
        }
      }
      helpToTips(frag);
    });
    for (const r of store.regionsOf(n.id)) await editRegion(n, r.id, helpToTips);
  }

  // Characters (and their template): the new Overview, no Traits tab, help as ?s.
  for (const n of characters) {
    const regions = store.regionsOf(n.id);
    const wounds = regions.find((r) => r.label === "Wounds");
    const initiative = store.actionsOf(n.id).find((a) => a.name === "Initiative");
    await editPage(n, (doc, frag) => {
      const tabsEls = findAll(frag, (e) => e.nodeName === "agTab");
      const overview = tabsEls.find((e) => e.getAttribute("title") === "Overview");
      const traitsTab = tabsEls.find((e) => e.getAttribute("title") === "Traits");
      if (overview) {
        // What the GM added to the Overview themselves stays, after the kit's parts.
        const keep: Y.XmlElement[] = [];
        let canvasId = "cv_identity";
        for (const c of overview.toArray()) {
          if (!(c instanceof Y.XmlElement)) continue;
          if (c.nodeName === "agCanvas") { canvasId = String(c.getAttribute("canvasId") || canvasId); continue; }
          if (c.nodeName === "horizontalRule") continue;
          if (c.nodeName === "agRegion" && KIT_OVERVIEW_SECTIONS.has(store.regions.get(String(c.getAttribute("regionId")))?.label ?? "")) continue;
          // Empty lines, and the initiative button's line (it moves into the panel).
          if (c.nodeName === "paragraph" && !textOf(c).trim() && !findAll(c, () => true).length) continue;
          if (c.nodeName === "paragraph" && initiative && findAll(c, (e) => e.nodeName === "agButton" && e.getAttribute("actionId") === initiative.id).length) continue;
          // An earlier run's vitals panel.
          if (isVitals(c)) continue;
          if (c.nodeName === "heading" && textOf(c).trim() === "Traits") continue;
          if (c.nodeName === "agLinks" && c.getAttribute("label") === "traits") continue;
          keep.push(c.clone() as Y.XmlElement);
        }
        overview.delete(0, overview.length);
        appendNodes(overview, [
          ...vitalsNodes(initiative?.id ?? null),
          { type: "agCanvas", attrs: { canvasId, width: 648, height: 162, background: "", look: {} } },
          ...traitsNodes(),
          ...(wounds ? [hr(), section(wounds.id, { bg: "#1c1917", outline: "#d4a24c55", radius: 10, padding: 12 })] : []),
        ]);
        if (keep.length) overview.insert(overview.length, keep);
        // The identity chips, rearranged (cleared and laid out afresh; values are untouched).
        const root = doc.getMap<Y.Map<any>>("canvases");
        let m = root.get(canvasId);
        if (!(m instanceof Y.Map)) { m = new Y.Map<any>(); root.set(canvasId, m); }
        const chips = identityChips();
        const ids = new Set(chips.map((c) => String(c.id)));
        for (const k of Array.from(m.keys())) if (!ids.has(k)) m.delete(k);
        for (const c of chips) m.set(String(c.id), c);
      }
      // The Traits tab goes; anything the GM put there besides the list moves to the Overview.
      if (traitsTab) {
        const extra = traitsTab.toArray().filter((c): c is Y.XmlElement => c instanceof Y.XmlElement && !(c.nodeName === "agLinks" && c.getAttribute("label") === "traits") && !(c.nodeName === "paragraph" && !textOf(c).trim() && !c.length));
        if (overview && extra.length) overview.insert(overview.length, extra.map((c) => c.clone() as Y.XmlElement));
        const parent = traitsTab.parent as Y.XmlElement;
        if (parent.length > 1) parent.delete(parent.toArray().indexOf(traitsTab), 1);
      }
      // Skills: the budgets with their ?s; the dice note folds into Attribute Points'.
      for (const cols of findAll(frag, (e) => e.nodeName === "agColumns" && textOf(e).trim().startsWith("Attribute Points"))) {
        const parent = cols.parent as Y.XmlElement | Y.XmlFragment;
        const i = parent.toArray().indexOf(cols);
        parent.delete(i, 1);
        insertNodes(parent, i, [budgetNodes()]);
      }
      dropPara(frag, "Each attribute sets the die its skills roll");
      // Ability tab: Cultivation's note.
      for (const cols of findAll(frag, (e) => e.nodeName === "agColumns" && textOf(e).trim().startsWith("Cultivation"))) {
        const parent = cols.parent as Y.XmlElement | Y.XmlFragment;
        const kids = parent.toArray();
        const next = kids[kids.indexOf(cols) + 1];
        if (next instanceof Y.XmlElement && isMutedHelp(next) && textOf(next).trim().startsWith("Energy type")) { addTipTo(cols, CULTIVATION_HELP); parent.delete(kids.indexOf(next), 1); }
      }
      // Inventory: its help goes behind an "Items" heading over the list.
      for (const para of findAll(frag, (e) => isMutedHelp(e) && /^Each item's rolls are on its card/.test(textOf(e).trim()))) {
        const parent = para.parent as Y.XmlElement | Y.XmlFragment;
        parent.delete(parent.toArray().indexOf(para), 1);
        const list = parent.toArray().findIndex((c) => c instanceof Y.XmlElement && c.nodeName === "agLinks" && c.getAttribute("label") === "items");
        if (list >= 0) insertNodes(parent, list, [itemsHeading()]);
      }
      helpToTips(frag);
    });
    // The Wounds section: its note behind a ? by its title.
    if (wounds) {
      await editRegion(n, wounds.id, (frag) => {
        for (const para of findAll(frag, (e) => isMutedHelp(e) && textOf(e).trim().startsWith("Minor = 5+"))) {
          const parent = para.parent as Y.XmlElement | Y.XmlFragment;
          const title = findAll(frag, (e) => e.nodeName === "agColumns")[0];
          if (title) addTipTo(title, WOUNDS_HELP);
          parent.delete(parent.toArray().indexOf(para), 1);
        }
      });
    }
    for (const r of regions) if (r.id !== wounds?.id && !KIT_OVERVIEW_SECTIONS.has(r.label ?? "")) await editRegion(n, r.id, helpToTips);
  }
  // The old Rank / Health / Energy Pool / Focus sections aren't on the page any more.
  await store.run(async (cs) => {
    for (const n of characters) for (const r of store.regionsOf(n.id)) if (r.label && r.label !== "Wounds" && KIT_OVERVIEW_SECTIONS.has(r.label)) await store.removeRegion(r.id, cs);
  });
}

// --------------------------------------------------------------------------- level 17
// The vitals panel as two mirrored rows of boxes (Rank · Energy Pool · DC, then
// Health · Energy · Focus), each stat framed on its own. Its Initiative button
// is the character's: a lone one left above the tabs goes.
/** The Overview's vitals (either the one-panel version or a row of the boxed one). */
// Level 18 runs it again: four boxes on top (Initiative has its own), the
// resources as taller bars with their numbers on them (Temp is set from the bar).
const VITAL_REFS = ["energy_pool", "hp_max", "focus_max"];
function isVitals(el: Y.XmlElement): boolean {
  return el.nodeName === "agColumns" && findAll(el, (e) => (e.nodeName === "agField" || e.nodeName === "agFieldBlock")
    && (VITAL_REFS.includes(String(e.getAttribute("ref"))) || VITAL_REFS.includes(String(e.getAttribute("maxRef") ?? "")))).length > 0;
}
async function upgrade17(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  for (const n of characters) {
    const initiative = store.actionsOf(n.id).find((a) => a.name === "Initiative");
    await editPage(n, (_doc, frag) => {
      const overview = findAll(frag, (e) => e.nodeName === "agTab" && e.getAttribute("title") === "Overview")[0];
      if (!overview) return;
      const kids = overview.toArray();
      const at = kids.findIndex((c) => c instanceof Y.XmlElement && isVitals(c));
      if (at < 0) return;
      // Every old vitals block goes (from the end, so the indexes hold); the new rows take the first one's place.
      for (let i = kids.length - 1; i >= 0; i--) { const c = kids[i]; if (c instanceof Y.XmlElement && isVitals(c)) overview.delete(i, 1); }
      insertNodes(overview, at, vitalsNodes(initiative?.id ?? null));
      // A paragraph holding just the Initiative button, outside the tabs: the vitals have it now.
      if (initiative) {
        for (const c of frag.toArray()) {
          if (!(c instanceof Y.XmlElement) || c.nodeName !== "paragraph" || textOf(c).trim()) continue;
          const els = findAll(c, () => true);
          if (els.length === 1 && els[0].nodeName === "agButton" && els[0].getAttribute("actionId") === initiative.id) frag.delete(frag.toArray().indexOf(c), 1);
        }
      }
    });
  }
}

// --------------------------------------------------------------------------- level 19
// Crafting: Blacksmithing, Alchemy and Rune Making. The crafting item kinds and
// the Blueprint / Recipe / Rune Recipe templates (and the starter set) arrive;
// characters get their crafting skills (on the Skills tab) and a Crafting tab;
// potions get potency (how well they were brewed); weapons get Damage bonus and
// Accuracy, which their rolls add (runes and forging raise them).
async function upgrade19(store: ScopeStore, characterTemplates: AgNote[]) {
  const charIds = new Set(characterTemplates.map((t) => t.id));
  const characters = Array.from(store.notes.values()).filter((n) => charIds.has(n.id) || (n.templateId && charIds.has(n.templateId)));
  const addField = async (note: AgNote, key: string, label: string, value: number | boolean, tooltip: string | undefined, cs: any) => {
    const have = store.fieldsByNote.get(note.id);
    if (have?.get(key)) return false;
    const order = Math.max(0, ...Array.from(have?.values() ?? []).map((f) => f.sortOrder)) + 1;
    const f: AgField = { id: randomUUID(), noteId: note.id, key, label, type: typeof value === "boolean" ? "boolean" : "number", value, formula: null, options: tooltip ? { tooltip } : {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: order, templateFieldId: null };
    await store.putField(f, cs);
    return true;
  };
  await store.run(async (cs) => {
    await applyCACrafting(store, cs, { starter: true });
    // The new item types (the GM's own stay, after the kit's).
    for (const fields of Array.from(store.fieldsByNote.values())) {
      const f = fields.get("item_type");
      if (!f || f.type !== "select") continue;
      const have = f.options.choices ?? [];
      const choices = [...ITEM_TYPES, ...have.filter((c) => !ITEM_TYPES.includes(c))];
      const colors = { ...ITEM_TYPE_COLORS, ...(f.options.choiceColors ?? {}) };
      if (choices.join("|") !== have.join("|")) await store.putField({ ...f, options: { ...f.options, choices, choiceColors: colors } }, cs);
    }
    for (const n of characters) {
      await addField(n, "blacksmithing", "Blacksmithing", 0, CRAFT_SKILL_HELP.blacksmithing, cs);
      await addField(n, "alchemy", "Alchemy", 0, CRAFT_SKILL_HELP.alchemy, cs);
      await addField(n, "rune_making", "Rune Making", 0, CRAFT_SKILL_HELP.rune_making, cs);
    }
    for (const n of Array.from(store.notes.values())) {
      const fields = store.fieldsByNote.get(n.id);
      if (n.type !== "item" || !fields) continue;
      // Potions: potency and inert, and Heal HP adds the potency (unless the GM changed it).
      if (fields.get("heal_dice")) {
        await addField(n, "potency", "Potency", 0, POTENCY_HELP, cs);
        await addField(n, "inert", "Inert", false, undefined, cs);
        for (const a of store.actionsOf(n.id)) {
          if (a.name !== "Heal HP") continue;
          const steps = a.steps.map((st: any) => (st.type === "modify" && st.target === "@owner.hp" && st.op === "add" && st.value === "$heal" ? { ...st, value: HEAL_VALUE } : st));
          if (JSON.stringify(steps) !== JSON.stringify(a.steps)) await store.putAction({ ...a, steps }, cs);
        }
      }
      // Weapons: Damage bonus and Accuracy, which Damage and Strike add.
      if (fields.get("handedness") || String(fields.get("item_type")?.value ?? "") === "Weapon") {
        const newDamage = await addField(n, "damage_bonus", "Damage bonus", 0, "Added to the Damage roll. Forging and runes raise it.", cs);
        await addField(n, "accuracy", "Accuracy", 0, "Added to the Strike roll. A well-forged handle raises it.", cs);
        for (const a of store.actionsOf(n.id)) {
          const r = a.options?.roll;
          if (!r) continue;
          if (/damage/i.test(a.name) && /^-?\d+$/.test(r.bonus.trim())) {
            // A plain number moves into Damage bonus, where runes add to it.
            const fb = store.fieldsByNote.get(n.id)?.get("damage_bonus");
            if (fb && newDamage) await store.putField({ ...fb, value: Number(r.bonus) }, cs);
            await store.putAction({ ...a, options: { ...a.options, roll: { ...r, bonus: Number(r.bonus) && !newDamage ? `${r.bonus} + damage_bonus` : "damage_bonus" } } }, cs);
          } else if (/strike|attack/i.test(a.name) && r.bonus.trim() === "0") {
            await store.putAction({ ...a, options: { ...a.options, roll: { ...r, bonus: "accuracy" } } }, cs);
          }
        }
      }
    }
  });
  // Weapon pages show the two; characters get the crafting box and the Crafting tab.
  for (const n of Array.from(store.notes.values()).filter((x) => x.type === "item" && store.fieldsByNote.get(x.id)?.get("handedness"))) {
    await editPage(n, (_doc, frag) => {
      for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).trim().startsWith("HANDEDNESS") && !textOf(e).includes("DAMAGE"))) {
        appendNodes(para, [{ text: "    " } as any, ...[muted("DAMAGE "), val("damage_bonus", { look: { bold: true } }), { text: "    " } as any, muted("ACCURACY "), val("accuracy", { look: { bold: true } })] as any]);
      }
    });
  }
  for (const n of characters) {
    await editPage(n, (_doc, frag) => {
      const tabsEl = findAll(frag, (e) => e.nodeName === "agTabs")[0];
      if (!tabsEl) return;
      const skills = findAll(tabsEl, (e) => e.nodeName === "agTab" && e.getAttribute("title") === "Skills")[0];
      if (skills && !findAll(skills, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "blacksmithing").length) appendNodes(skills, craftingSkillNodes());
      if (!findAll(tabsEl, (e) => e.nodeName === "agTab" && e.getAttribute("title") === "Crafting").length) {
        appendNodes(tabsEl, [{ type: "agTab", attrs: { title: "Crafting", icon: "Hammer", color: "" }, content: craftingTabContent() }]);
      }
    });
  }
}

// --------------------------------------------------------------------------- level 20
// Crafting stations: a Forge for Blacksmithing, an Alchemist Pot for Alchemy and
// a Runemaking Pen for Rune Making — each craft needs its own in the inventory.
// With them, more to test every craft with: Energy Tonic, Focus Elixir and
// Wound Salve (and their recipes), the Runes of Frost, Storm and Vigor, and
// Bitterroot and Storm Shard.
async function upgrade20(store: ScopeStore) {
  await store.run(async (cs) => {
    await applyCACrafting(store, cs, { starter: true });
    for (const fields of Array.from(store.fieldsByNote.values())) {
      const f = fields.get("item_type");
      if (!f || f.type !== "select") continue;
      const have = f.options.choices ?? [];
      const choices = [...ITEM_TYPES, ...have.filter((c) => !ITEM_TYPES.includes(c))];
      if (choices.join("|") !== have.join("|")) await store.putField({ ...f, options: { ...f.options, choices, choiceColors: { ...ITEM_TYPE_COLORS, ...(f.options.choiceColors ?? {}) } } }, cs);
    }
  });
}

// --------------------------------------------------------------------------- level 21
// Knowledge comes from scrolls: a character knows a blueprint, recipe or rune by
// carrying a scroll that teaches it (Blacksmithing needs one; Alchemy and Rune
// Making work without, but a scroll guides them). Every recipe gets a scroll for
// the GM to hand out, and the example character gets a few. There's no Crafting
// tab any more — a station's own sheet is where its holder crafts.
async function upgrade21(store: ScopeStore, characterTemplates: AgNote[]) {
  let made: Record<string, AgNote> = {};
  await store.run(async (cs) => {
    made = await applyCACrafting(store, cs, { starter: true });
    for (const fields of Array.from(store.fieldsByNote.values())) {
      const f = fields.get("item_type");
      if (!f || f.type !== "select") continue;
      const have = f.options.choices ?? [];
      const choices = [...ITEM_TYPES, ...have.filter((c) => !ITEM_TYPES.includes(c))];
      if (choices.join("|") !== have.join("|")) await store.putField({ ...f, options: { ...f.options, choices, choiceColors: { ...ITEM_TYPE_COLORS, ...(f.options.choiceColors ?? {}) } } }, cs);
    }
    // The example character starts out knowing a few (if it has the starter supplies and no scrolls yet).
    const carried = (id: string) => Array.from(store.links.values()).filter((l) => l.toNoteId === id).map((l) => store.notes.get(l.fromNoteId)).filter((n): n is AgNote => !!n);
    for (const hero of Array.from(store.notes.values()).filter((n) => !n.isTemplate && n.name === "Example Cultivator")) {
      const inv = carried(hero.id);
      if (!inv.some((n) => store.fieldsByNote.get(n.id)?.get("station_for")) || inv.some((n) => store.fieldsByNote.get(n.id)?.get("teaches"))) continue;
      await giveCopies(store, hero, made, STARTER_SCROLLS.map((k): [string, number] => [k, 1]), cs);
    }
  });
  // Characters: the Crafting tab goes (the crafting skills stay on Skills).
  const charIds = new Set(characterTemplates.map((t) => t.id));
  for (const n of Array.from(store.notes.values()).filter((x) => charIds.has(x.id) || (x.templateId && charIds.has(x.templateId)))) {
    await editPage(n, (_doc, frag) => {
      for (const tab of findAll(frag, (e) => e.nodeName === "agTab" && e.getAttribute("title") === "Crafting")) {
        const parent = tab.parent as Y.XmlElement | null;
        if (!parent) continue;
        const idx = parent.toArray().indexOf(tab);
        if (idx >= 0) parent.delete(idx, 1);
      }
    });
  }
  // Stations: their craft opens on their own page.
  for (const n of Array.from(store.notes.values()).filter((x) => x.type === "item" && store.fieldsByNote.get(x.id)?.get("station_for"))) {
    await editPage(n, (_doc, frag) => {
      if (hasType(frag, "agCraftBench")) return;
      const para = findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).trim().startsWith("FOR"))[0];
      const parent = (para?.parent as Y.XmlElement | Y.XmlFragment | null) ?? frag;
      const idx = para ? parent.toArray().indexOf(para) + 1 : parent.length;
      insertNodes(parent, idx, [craftBenchNode()]);
    });
  }
  // Scrolls (the template and those just made) show what they teach.
  for (const n of Array.from(store.notes.values()).filter((x) => x.type === "item" && store.fieldsByNote.get(x.id)?.get("teaches"))) {
    await editPage(n, (_doc, frag) => { if (!hasType(frag, "agCraftDef") && !hasType(frag, "agCraftBench")) appendNodes(frag, scrollNodes()); });
  }
}

// --------------------------------------------------------------------------- level 22
// An item's rank is its rarity: Rarity goes; Rank (whole ranks, no stars) colours
// the item's card and gives its rune sockets (none at the lowest rank, one more
// each rank up). Gear shows its sockets and the runes set into them.
async function upgrade22(store: ScopeStore, characterTemplates: AgNote[]) {
  const runeable = new Set<string>();
  await store.run(async (cs) => {
    for (const n of Array.from(store.notes.values())) {
      const fields = store.fieldsByNote.get(n.id);
      const rank = fields?.get("rank_tag");
      if (!fields || !rank || n.type !== "item") continue;
      if (rank.type === "select") await store.putField({ ...rank, value: itemRankOf(rank.value), options: { ...rank.options, choices: [...ITEM_RANKS], choiceColors: { ...ITEM_RANK_COLORS } } }, cs);
      const rarity = fields.get("rarity");
      if (rarity) await store.removeField(rarity.id, cs);
      const kind = String(fields.get("item_type")?.value ?? "");
      // (Sockets were given here once; level 31 took them out again — runes go by room now.)
      if (RUNEABLE_KINDS.includes(kind) || fields.get("handedness")) runeable.add(n.id);
    }
  });
  // Pages: no Rarity badge; gear gets its sockets line by its runes (or the whole Runes section).
  for (const n of Array.from(store.notes.values()).filter((x) => x.type === "item" && store.fieldsByNote.get(x.id)?.get("rank_tag"))) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "rarity")) {
        const parent = el.parent as Y.XmlElement | null;
        const idx = parent ? parent.toArray().indexOf(el) : -1;
        if (parent && idx >= 0) parent.delete(idx, 1);
      }
      if (!runeable.has(n.id)) return;
      if (!findAll(frag, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "runes").length) appendNodes(frag, runeSlotNodes());
    });
  }
  // Inventories: cards coloured by rank, no Rarity badge.
  const charIds = new Set(characterTemplates.map((t) => t.id));
  for (const n of Array.from(store.notes.values()).filter((x) => charIds.has(x.id) || (x.templateId && charIds.has(x.templateId)))) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "items")) {
        const cols = (el.getAttribute("columns") ?? []) as any[];
        if (Array.isArray(cols) && cols.some((c) => c?.ref === "rarity")) el.setAttribute("columns", cols.filter((c) => c?.ref !== "rarity") as any);
        const cfg = (el.getAttribute("config") ?? {}) as any;
        if (cfg.accentBy === "rarity") el.setAttribute("config", { ...cfg, accentBy: "rank_tag" } as any);
      }
    });
  }
}

// --------------------------------------------------------------------------- level 23
// Durability is a percentage (0–100) on every item, and an item sells for its
// value at that durability (nothing under 30%). What an item had becomes its
// share of its old maximum; the maximum is always 100.
async function upgrade23(store: ScopeStore, characterTemplates: AgNote[]) {
  const items: AgNote[] = [];
  await store.run(async (cs) => {
    for (const n of Array.from(store.notes.values())) {
      const fields = store.fieldsByNote.get(n.id);
      const dur = fields?.get("durability");
      if (!fields || !dur || n.type !== "item") continue;
      items.push(n);
      const max = fields.get("durability_max");
      const d = typeof dur.value === "number" ? dur.value : 100;
      const m = max && typeof max.value === "number" && max.value > 0 ? max.value : null;
      const pct = Math.max(0, Math.min(100, Math.round(m ? (100 * d) / m : d)));
      if (dur.type === "number") await store.putField({ ...dur, value: pct, options: { ...dur.options, min: 0, max: 100, tooltip: DURABILITY_HELP } }, cs);
      if (max && max.type !== "formula") await store.putField({ ...max, type: "formula", value: null, formula: "100", options: { resultType: "number" } }, cs);
      if (!fields.get("sell_value")) {
        const order = Math.max(0, ...Array.from(fields.values()).map((f) => f.sortOrder)) + 1;
        await store.putField({ id: randomUUID(), noteId: n.id, key: "sell_value", label: "Sells for", type: "formula", value: null, formula: SELL_VALUE_FORMULA, options: { resultType: "number", tooltip: SELL_HELP }, acl: { view: "inherit", edit: "inherit" }, sortOrder: order, templateFieldId: null }, cs);
      }
    }
  });
  // Item pages: "Sells for" beside the value.
  for (const n of items) {
    await editPage(n, (_doc, frag) => {
      if (findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "sell_value").length) return;
      const v = findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "value")[0];
      const para = v?.parent as Y.XmlElement | null;
      if (!v || !para) return;
      const idx = para.toArray().indexOf(v);
      insertNodes(para, idx + 1, [{ text: "    " } as any, muted("SELLS FOR "), val("sell_value", { look: { bold: true, textColor: "#facc15" } })] as any);
    });
  }
  // Inventories: what each item sells for.
  const charIds = new Set(characterTemplates.map((t) => t.id));
  for (const n of Array.from(store.notes.values()).filter((x) => charIds.has(x.id) || (x.templateId && charIds.has(x.templateId)))) {
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "items")) {
        const cols = (el.getAttribute("columns") ?? []) as any[];
        if (!Array.isArray(cols) || cols.some((c) => c?.ref === "sell_value")) continue;
        const at = cols.findIndex((c) => c?.ref === "value");
        const next = [...cols]; next.splice(at >= 0 ? at + 1 : next.length, 0, { ref: "sell_value", display: "value", label: "Sells" });
        el.setAttribute("columns", next as any);
      }
    });
  }
}

// --------------------------------------------------------------------------- level 24
// The starter brews say what each grade gives (a Fine draught heals more dice
// and a wound), so it's plain a Fine potion is better. Only recipes the GM
// hasn't given grades of their own.
async function upgrade24(store: ScopeStore) {
  await store.run(async (cs) => {
    for (const n of Array.from(store.notes.values())) {
      const effects = STARTER_BREW_EFFECTS[n.name];
      if (!effects || n.isTemplate || n.copyOf) continue;
      const f = store.fieldsByNote.get(n.id)?.get("craft");
      if (!f) continue;
      // Kept as JSON text, or (set from the recipe editor) as the object itself.
      try {
        const c: any = typeof f.value === "string" ? JSON.parse(f.value) : f.value;
        if (!c || typeof c !== "object" || c.kind !== "alchemy" || (Array.isArray(c.effects) && c.effects.length)) continue;
        const next = { ...c, effects };
        await store.putField({ ...f, value: (typeof f.value === "string" ? JSON.stringify(next) : next) as any }, cs);
      } catch { /* the GM's own text: leave it */ }
    }
  });
}

// --------------------------------------------------------------------------- level 26
// The ladder becomes nine ranks (Mortal to Paragon) of nine Pillars: every character's rank, Health, Usable
// Energy, Focus, skill and attribute points, Lifespan and Absorption follow the Energy Pool they already have (HP,
// Energy and Focus rise with their new maximums, as on any rank up). Stars are Pillars in every text. Item ranks are
// the rank names (no Pillars): every item starts Unranked; sockets are 0 Unranked, 1 Mortal … 9 Paragon. Weapons'
// Damage rolls get Damage Die, and the weapon blueprints their new dice (plus Short Sword, Longbow and Warbow).
const LEGACY_TEXTS: Array<[string, string]> = [
  [LEGACY_RANK_HELP, RANK_HELP],
  [LEGACY_HEALTH_HELP, HEALTH_HELP],
  [LEGACY_ENERGY_HELP, ENERGY_HELP],
  [LEGACY_FOCUS_NOTE, FOCUS_NOTE],
  ["8 + one per star (a rank up counts once) + bonus points from training items; up to 6 back from skills below 0.", SKILL_BUDGET_NOTE],
  ["Attributes can't go below 0. 4 + one per rank (Silver, Gold…) + bonus points from training items.", ATTR_BUDGET_NOTE],
  ["Rune sockets come with the item's rank: none at Bronze, one more each rank up. A rune takes one; when they're full, no more can be inscribed.", RUNE_SOCKETS_HELP],
  [" — set by your star; it goes up when you break through, not with every point of the pool", USABLE_NOTE],
  // Older wordings still on some pages.
  ["20 base, +5 per star, +10 per rank", "Set by your rank (Mortal 50 … Paragon 1,000)"],
  ["6 to start, +1 per star", "6 to start, +1 on each rank up and on Pillars 2, 4, 6 and 8"],
];
/** Swap old wordings for new in a page: the tips' text, and the words of its paragraphs (keeping their styling). */
function retext(frag: Y.XmlFragment, texts: Array<[string, string]> = LEGACY_TEXTS) {
  const LEGACY_TEXTS_ = texts;
  for (const tipEl of findAll(frag, (e) => e.nodeName === "agTip")) {
    let text = String(tipEl.getAttribute("text") ?? "");
    for (const [from, to] of LEGACY_TEXTS_) if (text.includes(from)) text = text.split(from).join(to);
    if (text !== tipEl.getAttribute("text")) tipEl.setAttribute("text", text);
  }
  const walk = (node: Y.XmlFragment | Y.XmlElement) => {
    for (const c of node.toArray()) {
      if (c instanceof Y.XmlElement) { walk(c); continue; }
      if (!(c instanceof Y.XmlText)) continue;
      for (const [from, to] of LEGACY_TEXTS_) {
        for (let guard = 0; guard < 5; guard++) {
          const delta = c.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>;
          const plain = delta.map((d) => (typeof d.insert === "string" ? d.insert : "\u0000")).join("");
          const at = plain.indexOf(from);
          if (at < 0) break;
          // The styling where the old words began.
          let pos = 0, attrs: Record<string, unknown> | undefined;
          for (const d of delta) { const len = typeof d.insert === "string" ? d.insert.length : 1; if (at < pos + len) { attrs = d.attributes; break; } pos += len; }
          c.delete(at, from.length);
          c.insert(at, to, attrs ?? {});
        }
      }
    }
  };
  walk(frag);
}
async function upgrade26(store: ScopeStore) {
  const flat = (x: string | null | undefined) => (x ?? "").replace(/\s+/g, "");
  const ladderKeys = new Set(Object.keys(RANK_FORMULAS));
  const touched = new Set<string>();
  await store.run(async (cs) => {
    for (const n of Array.from(store.notes.values())) {
      const fields = store.fieldsByNote.get(n.id);
      if (!fields) continue;
      // Characters (and their templates): the ladder's formulas, Focus and the point budgets.
      const ri = fields.get("rank_index");
      if (ri && ri.type === "formula") {
        touched.add(n.id);
        for (const key of Array.from(ladderKeys)) {
          const f = fields.get(key);
          if (f && f.type === "formula" && flat(f.formula) !== flat(RANK_FORMULAS[key])) await store.putField({ ...f, formula: RANK_FORMULAS[key] }, cs);
        }
        const rank = fields.get("rank");
        if (rank) await store.putField({ ...(store.fieldsByNote.get(n.id)?.get("rank") ?? rank), options: { ...rank.options, tooltip: rankTooltip() } }, cs);
        for (const [key, formula] of [["focus_max", FOCUS_FORMULA], ["attr_budget", ATTR_BUDGET_FORMULA], ["skill_budget", SKILL_BUDGET_FORMULA]] as const) {
          const f = fields.get(key);
          if (f && f.type === "formula" && flat(f.formula) !== flat(formula)) await store.putField({ ...f, formula }, cs);
        }
      }
      // Items: ranks are the rank names now — everything starts Unranked.
      const tag = fields.get("rank_tag");
      if (tag && tag.type === "select") {
        touched.add(n.id);
        await store.putField({ ...tag, value: "Unranked", options: { ...tag.options, choices: [...ITEM_RANKS], choiceColors: { ...ITEM_RANK_COLORS } } }, cs);
      }
      // Weapons: Damage Die on their Damage roll (paid with Energy), for the die they roll.
      if (n.type === "item") {
        for (const a of store.actionsOf(n.id)) {
          const r = a.options?.roll;
          if (!r || r.scale || !/damage/i.test(a.name) || !(fields.get("handedness") || String(fields.get("item_type")?.value ?? "") === "Weapon")) continue;
          const die = /^\s*\d+\s*$/.test(r.die) ? Number(r.die) : 6;
          await store.putAction({ ...a, options: { ...a.options, roll: { ...r, scale: { step: String(defaultScaleStep(die)), pay: r.costs[0]?.key ?? "energy" } } } }, cs);
        }
      }
    }
    await updateWeaponBlueprints(store, cs);
  });
  // The words on their pages: Stars are Pillars, and the new figures.
  for (const id of Array.from(touched)) {
    const n = store.notes.get(id);
    if (!n) continue;
    await editPage(n, (_doc, frag) => {
      retext(frag);
      // The Rank box's icon: a pillared hall, not a star.
      for (const para of findAll(frag, (e) => e.nodeName === "paragraph" && textOf(e).includes("Rank"))) {
        for (const ic of findAll(para, (e) => e.nodeName === "agIcon" && e.getAttribute("name") === "Star")) ic.setAttribute("name", "Landmark");
      }
    });
    for (const r of store.regionsOf(id)) await editRegion(n, r.id, (frag) => retext(frag));
  }
}

// --------------------------------------------------------------------------- level 27
// A clean slate of items: every item, blueprint, recipe and rune recipe the kit made (its starter set, the example
// character's gear, what was crafted from them, scrolls) is deleted — templates stay, one for each kind, ready to use:
// a Ranged Weapon (its Attack uses up ammunition of its Ammo type), Ammunition with an Ammo type, and a Forge,
// Alchemist Pot and Runemaking Pen already set to their craft. Items the GM made themselves are kept.
async function upgrade27(store: ScopeStore) {
  const kitFolders = new Set([CA_KIT_FOLDER, CA_CRAFT_FOLDER]);
  const crafted = ["forged_by", "craft_tier", "part_key", "teaches", "blueprint_id", "part_metal"];
  await store.run(async (cs) => {
    // The new templates.
    if (!Array.from(store.notes.values()).some((n) => n.isTemplate && n.name === "CA Ranged Weapon")) await snap.createFromSnapshot(store, itemTemplate("Ranged Weapon"), {}, cs);
    await applyCACrafting(store, cs);
    // Ammunition gets its Ammo type.
    for (const n of Array.from(store.notes.values())) {
      const fields = store.fieldsByNote.get(n.id);
      if (!n.isTemplate || n.name !== "CA Ammunition" || !fields || fields.get("ammo_type")) continue;
      const order = Math.max(0, ...Array.from(fields.values()).map((f) => f.sortOrder)) + 1;
      await store.putField({ id: randomUUID(), noteId: n.id, key: "ammo_type", label: "Ammo type", type: "select", value: "Arrow", formula: null, options: { choices: [...AMMO_TYPES] }, acl: { view: "inherit", edit: "inherit" }, sortOrder: order, templateFieldId: null }, cs);
    }
    // What the kit made: in its folders, or a copy (however many times over) of something it made or of a template,
    // or made by crafting. Blueprints, recipes and rune recipes all go, and the crafting sessions with them.
    const rootOf = (n: AgNote) => { let at: AgNote | undefined = n; const seen = new Set<string>(); while (at?.copyOf && !seen.has(at.id)) { seen.add(at.id); const next = store.notes.get(at.copyOf); if (!next) return null; at = next; } return at ?? null; };
    const doomed = Array.from(store.notes.values()).filter((n) => {
      if (n.isTemplate) return false;
      if (n.type === "blueprint" || n.type === "recipe" || n.type === "rune_recipe" || n.type === "craft") return true;
      if (n.type !== "item") return false;
      if (kitFolders.has(n.folder ?? "")) return true;
      const fields = store.fieldsByNote.get(n.id);
      if (fields && crafted.some((k) => fields.get(k) !== undefined)) return true;
      if (!n.copyOf) return false;
      const root = rootOf(n);
      return !root || root.isTemplate || kitFolders.has(root.folder ?? "") || (store.fieldsByNote.get(root.id) && crafted.some((k) => store.fieldsByNote.get(root.id)!.get(k) !== undefined));
    });
    for (const n of doomed) if (store.notes.has(n.id)) await store.removeNote(n.id, cs);
    console.log(`[agnostic] CA kit: ${store.key} cleared ${doomed.length} kit-made items, blueprints and recipes`);
  });
  // The Ammunition template's page shows its type.
  for (const n of Array.from(store.notes.values()).filter((x) => x.isTemplate && x.name === "CA Ammunition")) {
    await editPage(n, (_doc, frag) => {
      if (findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "ammo_type").length) return;
      const qty = findAll(frag, (e) => e.nodeName === "paragraph" && findAll(e, (x) => x.nodeName === "agField" && x.getAttribute("ref") === "qty").length > 0)[0];
      const parent = (qty?.parent ?? frag) as Y.XmlElement | Y.XmlFragment;
      const at = qty ? parent.toArray().indexOf(qty) + 1 : parent.length;
      insertNodes(parent, at, [hr(), h(3, icon("Target", "#fb923c", 16), " Ammunition ", tip(AMMO_HELP)), p(muted("TYPE "), val("ammo_type", { display: "badge" }))]);
    });
  }
}

// --------------------------------------------------------------------------- level 28
// Ranged weapons fire the ammunition their owner has equipped, of the weapon's category: Arrow, Bolt, Dart, Pistol
// Round or Rifle Round (Bullets become Pistol Rounds).
const OLD_RANGED_HELP = "A bow, crossbow or sling. Each **Attack** uses up one piece of its ammunition — an item of the same **Ammo** type (Arrow, Bolt…) in its owner's inventory, which goes when the last one is used. With none, it can't attack.";
const OLD_AMMO_HELP = "Ammunition for ranged weapons: a weapon whose **Ammo** is this type uses one up each Attack. Keep them in a stack (Qty); the last one used is gone from the inventory.";
async function upgrade28(store: ScopeStore) {
  const touched = new Set<string>();
  await store.run(async (cs) => {
    for (const n of Array.from(store.notes.values())) {
      const f = store.fieldsByNote.get(n.id)?.get("ammo_type");
      if (f && f.type === "select") {
        touched.add(n.id);
        const v = String(f.value ?? "");
        const value = AMMO_TYPES.includes(v) ? v : LEGACY_AMMO[v] ?? AMMO_TYPES[0];
        const label = f.label === "Ammo type" ? "Ammo category" : f.label;
        const tooltip = f.options.tooltip ? "Each Attack uses up one equipped ammunition of this category from its owner's inventory." : undefined;
        await store.putField({ ...f, label, value, options: { ...f.options, choices: [...AMMO_TYPES], ...(tooltip ? { tooltip } : {}) } }, cs);
      }
      for (const a of store.actionsOf(n.id)) {
        const u = a.options?.roll?.uses;
        if (u && u.match === "ammo_type" && !u.only) await store.putAction({ ...a, options: { ...a.options, roll: { ...a.options!.roll!, uses: { ...u, only: "equipped" } } } }, cs);
      }
    }
  });
  for (const id of Array.from(touched)) {
    const n = store.notes.get(id);
    if (!n) continue;
    await editPage(n, (_doc, frag) => {
      for (const tipEl of findAll(frag, (e) => e.nodeName === "agTip")) {
        const text = String(tipEl.getAttribute("text") ?? "");
        if (text === OLD_RANGED_HELP) tipEl.setAttribute("text", RANGED_HELP);
        if (text === OLD_AMMO_HELP) tipEl.setAttribute("text", AMMO_HELP);
      }
    });
  }
}

// --------------------------------------------------------------------------- level 29
// The tracker card's rank fits on one line ("Transcendent Pillar 9"): wider, with DC narrower beside it.
async function upgrade29(store: ScopeStore) {
  const st = store.settings;
  if (store.scope.kind !== "campaign" || !st) return;
  let changed = false;
  const cards = st.tracker.cards.map((c) => {
    if (c.id !== "ca-card") return c;
    const items = c.layout.items.map((it) => {
      if (it.id === "rk" && it.x === 6 && it.w === 90) { changed = true; return { ...it, w: 144 }; }
      if (it.id === "r" && it.x === 100 && it.w === 94) { changed = true; return { ...it, x: 150, w: 44 }; }
      return it;
    });
    return { ...c, layout: { ...c.layout, items } };
  });
  if (changed) await store.run((cs) => store.putSettings({ ...st, tracker: { ...st.tracker, cards } }, cs));
}

// --------------------------------------------------------------------------- level 30
// Focus rises on each rank up and on Pillars 3, 5, 7 and 9 (skill points stay on 2, 4, 6 and 8). No "Strike" roll:
// a weapon's are Attack and Damage. Ability aspects come in two templates: a normal one (a Use roll, 1d20) and
// CA Attack Aspect (Attack and Damage). Help texts put right: Focus and skill points, durability (no mending),
// stations (the first step takes the controls), Rune Making (freehand too).
const PREV_TEXTS: Array<[string, string]> = [
  ["Read off the Energy Pool: nine ranks, Mortal to Paragon, of nine Pillars each. Health and Lifespan come with the rank; Focus and skill points rise on each rank up and on Pillars 2, 4, 6 and 8. The ? beside your rank shows the whole ladder.", RANK_HELP],
  ["Spent to choose where a wound lands on an opponent, when you get to choose:\nWhere | Focus\nBody | 0\nArm or leg | 2\nHead | 4\n\n6 to start, +1 on each rank up and on Pillars 2, 4, 6 and 8. Resets on a long rest. Click the bar to spend or restore it.", FOCUS_NOTE],
  ["A crafting station: a **Forge** for Blacksmithing, an **Alchemist Pot** for Alchemy, a **Runemaking Pen** for Rune Making. Open its sheet to craft — the craft opens right below, for whoever carries it; pressing **Craft** puts you at the controls. Its Quick Craft bonus adds to Quick Craft rolls. The GM's **Station setup** picks which recipes can be made at it, so a better forge can make more. Any item can be made a station (Insert → Crafting station).", STATION_HELP],
  ["How sound the item is, 0–100%. It sells for that share of its value (100% = full value, 50% = half) — and for nothing below 30%. Use wears it down; a smith can mend it.", DURABILITY_HELP],
  ["Three crafts, each a tool you play: **Blacksmithing** (forge weapon parts at the anvil, then assemble them), **Alchemy** (brew a recipe step by step, or experiment) and **Rune Making** (trace a rune's sigil onto an item). Everything they use and make is ordinary items in your inventory. The GM (and anyone it's shared with) can watch you craft, live.\n\n## Quick Craft · d20 + the craft's skill\nRoll | Result\nNatural 1 | Failed (no effect)\n2–11 | Weak\n12–19 | Standard\n20–24 | Fine\n25+ | Masterwork\n\nA natural 20 is at least Fine. A failed craft still makes the item — it just does nothing.", CRAFTING_HELP],
  ["Added to the Strike roll. A well-forged handle raises it.", "Added to the Attack roll. A well-forged handle raises it."],
];
async function upgrade30(store: ScopeStore) {
  const pages = new Set<string>();
  await store.run(async (cs) => {
    if (!Array.from(store.notes.values()).some((n) => n.isTemplate && n.name === "CA Attack Aspect")) await snap.createFromSnapshot(store, attackAspectTemplateSnapshot(), {}, cs);
    for (const n of Array.from(store.notes.values())) {
      const fields = store.fieldsByNote.get(n.id);
      // Focus on the odd Pillars, and the ladder (with its skill points) behind Rank's ?.
      const fm = fields?.get("focus_max");
      if (fm && fm.type === "formula" && (fm.formula ?? "").includes("rank_index") && fm.formula !== FOCUS_FORMULA) await store.putField({ ...fm, formula: FOCUS_FORMULA }, cs);
      const rank = fields?.get("rank");
      if (rank && fields?.get("rank_index")) { pages.add(n.id); await store.putField({ ...rank, options: { ...rank.options, tooltip: rankTooltip() } }, cs); }
      // Values' own tooltips.
      for (const f of Array.from(fields?.values() ?? [])) {
        const tt = f.options?.tooltip;
        if (!tt) continue;
        let next = tt;
        for (const [from, to] of PREV_TEXTS) if (next.includes(from)) next = next.split(from).join(to);
        if (next !== tt) { pages.add(n.id); await store.putField({ ...f, options: { ...f.options, tooltip: next } }, cs); }
      }
      if (fields?.get("durability") || fields?.get("station_for")) pages.add(n.id);
      // No Strike: Attack.
      for (const a of store.actionsOf(n.id)) if (a.name === "Strike") await store.putAction({ ...a, name: "Attack" }, cs);
      // Ability aspects' one roll is Use (the normal template: a plain 1d20).
      if (n.type === "aspect") for (const a of store.actionsOf(n.id)) {
        if (a.name !== "Roll" || !a.options?.roll) continue;
        const plain = n.isTemplate && n.name === "CA Ability Aspect";
        await store.putAction({ ...a, name: "Use", options: { ...a.options, roll: { ...a.options.roll, ...(plain ? { die: "20", add: "" } : {}) } } }, cs);
      }
      // The normal aspect template starts as Utility (attacks have their own template).
      if (n.isTemplate && n.type === "aspect" && n.name === "CA Ability Aspect") {
        const cat = fields?.get("category");
        if (cat && cat.value === "Attack") await store.putField({ ...cat, value: "Utility" }, cs);
        await store.putNote({ ...n, templateMeta: { ...(n.templateMeta ?? { version: 1 }), description: ASPECT_TEMPLATE_DESCRIPTION } }, cs);
      }
      // Templates' descriptions.
      if (n.isTemplate && n.templateMeta?.description?.includes("Strike")) await store.putNote({ ...n, templateMeta: { ...n.templateMeta, description: n.templateMeta.description.split("Strike").join("Attack") } }, cs);
    }
  });
  for (const id of Array.from(pages)) {
    const n = store.notes.get(id);
    if (!n) continue;
    await editPage(n, (_doc, frag) => retext(frag, PREV_TEXTS));
    for (const r of store.regionsOf(id)) await editRegion(n, r.id, (frag) => retext(frag, PREV_TEXTS));
  }
}

// --------------------------------------------------------------------------- level 31
// Rune sockets go. How many runes an item takes was its rank; now it is how much
// room is left on its face — two runes can't be cut across one another, and a
// rune can be no finer than the tool cutting it. Tools have a say in the work:
// Skill points lent to whoever holds them (on every craft) and, for a rune
// tool, the finest mark it can manage.
const SOCKET_TEXTS: Array<[string, string]> = [
  [RUNE_SOCKETS_HELP, RUNE_SPACE_HELP],
  [LEGACY_CRAFTING_HELP, CRAFTING_HELP],
  [LEGACY_CRAFTING_HELP_2, CRAFTING_HELP],
  ["Your Blacksmithing bonus — its own number, not tied to an attribute. A Quick Craft rolls d20 + this.", CRAFT_SKILL_HELP.blacksmithing],
  ["Rune sockets come with the item's rank: none at Bronze, one more each rank up. A rune takes one; when they're full, no more can be inscribed.", RUNE_SPACE_HELP],
  ["A carving tool or pen for Rune Making. **Carved**: the rune is cut into the item. **Drawn**: it's drawn on. The tool used sets the look.", TOOL_HELP],
];
async function upgrade31(store: ScopeStore) {
  const pages = new Set<string>();
  await store.run(async (cs) => {
    for (const n of Array.from(store.notes.values())) {
      const fields = store.fieldsByNote.get(n.id);
      if (!fields) continue;
      const sockets = fields.get("rune_sockets");
      if (sockets) { pages.add(n.id); await store.removeField(sockets.id, cs); }
      // Rune tools: what they lend to the hand, and how fine they cut.
      if (fields.get("mark_style")) {
        pages.add(n.id);
        const order = Math.max(0, ...Array.from(fields.values()).map((f) => f.sortOrder)) + 1;
        if (!fields.get("tool_skill")) await store.putField({ id: randomUUID(), noteId: n.id, key: "tool_skill", label: "Skill points", type: "number", value: 0, formula: null, options: { min: -5, max: 5, tooltip: TOOL_SKILL_HELP }, acl: { view: "inherit", edit: "inherit" }, sortOrder: order, templateFieldId: null }, cs);
        if (!fields.get("tool_min_rune")) await store.putField({ id: randomUUID(), noteId: n.id, key: "tool_min_rune", label: "Finest rune", type: "number", value: 4, formula: null, options: { min: 4, max: 80, tooltip: TOOL_MIN_RUNE_HELP }, acl: { view: "inherit", edit: "inherit" }, sortOrder: order + 1, templateFieldId: null }, cs);
      }
    }
  });
  for (const id of Array.from(pages)) {
    const n = store.notes.get(id);
    if (!n) continue;
    await editPage(n, (_doc, frag) => {
      retext(frag, SOCKET_TEXTS);
      // The SOCKETS line on an item's Runes section: there is no count any more.
      for (const el of findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "rune_sockets")) {
        const parent = el.parent as Y.XmlElement | null;
        const row = parent && parent.nodeName === "paragraph" ? parent : null;
        const grand = row ? (row.parent as Y.XmlElement | Y.XmlFragment | null) : null;
        const idx = grand ? grand.toArray().indexOf(row!) : -1;
        if (grand && idx >= 0) { grand.delete(idx, 1); continue; }
        const at = parent ? parent.toArray().indexOf(el) : -1;
        if (parent && at >= 0) parent.delete(at, 1);
      }
      // A tool's page gets its two new values beside the mark style.
      const marks = findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "mark_style")[0];
      if (marks && !findAll(frag, (e) => e.nodeName === "agField" && e.getAttribute("ref") === "tool_skill").length) {
        const row = marks.parent as Y.XmlElement | null;
        if (row && row.nodeName === "paragraph") {
          const grand = row.parent as Y.XmlElement | Y.XmlFragment | null;
          const idx = grand ? grand.toArray().indexOf(row) : -1;
          if (grand && idx >= 0) {
            grand.delete(idx, 1);
            insertNodes(grand, idx, [p(muted("MARKS "), val("mark_style", { display: "input" }), muted("    SKILL "), val("tool_skill", { display: "input" }), muted("    FINEST RUNE "), val("tool_min_rune", { display: "input" }), muted("%"))]);
          }
        }
      }
    });
    for (const r of store.regionsOf(id)) await editRegion(n, r.id, (frag) => retext(frag, SOCKET_TEXTS));
  }
}

// --------------------------------------------------------------------------- level 32
// A rune is a mark cut into a surface: it stays where it was put, spoiled or
// not, and whoever carries the item doesn't get to rub it out. Only the GM
// takes one off again.
async function upgrade32(store: ScopeStore) {
  for (const n of Array.from(store.notes.values())) {
    if (n.type !== "item") continue;
    await editPage(n, (_doc, frag) => {
      for (const el of findAll(frag, (e) => e.nodeName === "agLinks" && e.getAttribute("label") === "runes")) {
        const cfg = (el.getAttribute("config") as any) ?? {};
        if (cfg && typeof cfg === "object" && !cfg.removeGm) el.setAttribute("config", { ...cfg, removeGm: true } as any);
      }
      retext(frag, [[LEGACY_RUNE_SPACE_HELP, RUNE_SPACE_HELP]]);
    });
  }
}

// --------------------------------------------------------------------------- level 33
// Beasts: a kind of creature rather than one creature. The same sheet a
// character has, but dropping it on the map puts a copy of it out there, so a
// pack of wolves is one sheet and six tokens that die one at a time.
async function upgrade33(store: ScopeStore) {
  const has = Array.from(store.notes.values()).some((n) => n.isTemplate && n.name === "CA Beast");
  await store.run(async (cs) => {
    if (!has) await snap.createFromSnapshot(store, beastTemplateSnapshot(), {}, cs);
    // A beast on the table reads like an NPC: a card on the tracker and a health bar.
    await applyCATrackerSettings(store, cs);
  });
}

// --------------------------------------------------------------------------- level 34
// Aiming costs more, and nowhere is free: the body 2 Focus, an arm or a leg 4,
// the head 6. The note also says when the choice is yours to make — an attack
// that beats the DC by 5 or more, the same roll that wounds.
const FOCUS_TEXTS: Array<[string, string]> = [[LEGACY_FOCUS_COSTS_NOTE, FOCUS_NOTE]];
async function upgrade34(store: ScopeStore) {
  const pages = new Set<string>();
  await store.run(async (cs) => {
    for (const n of Array.from(store.notes.values())) {
      for (const f of Array.from(store.fieldsByNote.get(n.id)?.values() ?? [])) {
        const tt = f.options?.tooltip;
        if (!tt || !tt.includes(LEGACY_FOCUS_COSTS_NOTE)) continue;
        pages.add(n.id);
        await store.putField({ ...f, options: { ...f.options, tooltip: tt.split(LEGACY_FOCUS_COSTS_NOTE).join(FOCUS_NOTE) } }, cs);
      }
      // The Focus line on a character's page carries it as a "?" of its own.
      if (store.fieldsByNote.get(n.id)?.get("focus")) pages.add(n.id);
    }
  });
  for (const id of Array.from(pages)) {
    const n = store.notes.get(id);
    if (!n) continue;
    await editPage(n, (_doc, frag) => retext(frag, FOCUS_TEXTS));
    for (const r of store.regionsOf(id)) await editRegion(n, r.id, (frag) => retext(frag, FOCUS_TEXTS));
  }
}

// --------------------------------------------------------------------------- level 35
// A beast put on the table belongs to its token, so the browser leaves it out:
// the only beast anyone can pick up is the original, not one already halfway
// through a fight. The first ones said so in a field on the sheet; it is on
// the sheet itself now, so move them over and take the field off.
async function upgrade35(store: ScopeStore) {
  await store.run(async (cs) => {
    for (const n of Array.from(store.notes.values())) {
      const mark = Array.from(store.fieldsByNote.get(n.id)?.values() ?? []).find((f) => f.key === "spawned_from");
      if (!mark) continue;
      const from = String(mark.value ?? "").replace(/^"|"$/g, "");
      if (from && !n.spawnedFrom) await store.putNote({ ...n, spawnedFrom: from }, cs);
      await store.removeField(mark.id, cs);
    }
  });
}
