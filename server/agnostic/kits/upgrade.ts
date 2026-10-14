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
import { appendNodes, insertNodes, p, muted, val, button, pAlign } from "./doc";
import {
  CA_KIT_FOLDER, rankTooltip, abilityTabContent, abilityTemplateSnapshot, abilityPage, itemRollsNodes, ABILITY_LIST_COLUMNS,
  FOCUS_FORMULA, CA_SHEET_ACL, CA_ITEM_TEMPLATE_NAMES, ABILITY_HELP, INVENTORY_HELP,
  effectsNodes, WOUND_EFFECTS_HELP, ITEM_EFFECTS_HELP, USABLE_FORMULA, USABLE_NOTE,
  TEMP_HP_COLOR, TEMP_ENERGY_COLOR, TEMP_ENERGY_LINE,
} from "./ca";
import type { AgAction, AgRollSpec } from "@shared/agnostic/types";

/** Bump when adding a step below. */
export const CA_KIT_LEVEL = 4;
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
      for (const [starts, text] of [["Use spends the ability", ABILITY_HELP], ["Click an item to open it: its Use, Strike", INVENTORY_HELP]] as const) {
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
