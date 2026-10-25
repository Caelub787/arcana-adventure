// Crafting ops, for every Agnostic system (see shared/agnostic/crafting.ts).
// The crafting tool plays its minigame in the browser — shared live through the
// session sheet's document — and comes here to turn the result into items:
// what it used up leaves the inventory, what it made arrives there, and the
// numbers come from the tier. Everything is checked here: the character must
// be the player's own (or the GM's), and what's used must be in its inventory.
import { randomUUID } from "crypto";
import type { AgField, AgNote, AgValue, AgViewer, AgSnapshot, AgFieldType } from "@shared/agnostic/types";
import { noteDocName, regionDocName, defaultScaleStep } from "@shared/agnostic/types";
import {
  traceAccuracy, stationAllows, metalFits, sellValue, CRAFT_DEF_TYPE, parseCraftConfig, quickCraftTier, runeTier, accuracyTier, itemMatches, numOf, partStats, weaponStats,
  TIER_LABEL, TIER_BONUS, TIER_DICE, TIER_WORTH, moreDice, CRAFT_KIND_LABEL, ALCHEMY_STEP_LABEL, FORGE_SHAPES,
  type CraftTier, type CraftKind, type ForgeConfig, type AlchemyConfig, type RuneConfig, type ForgeRole, type CraftNeed,
} from "@shared/agnostic/crafting";
import { asNumber } from "@shared/agnostic/formula";
import { rollDie } from "@shared/agnostic/compute";
import type { AgOp } from "@shared/agnostic/protocol";
import type { ChangeSet, ScopeStore } from "./store";
import * as snap from "./snapshot";
import * as docs from "./docs";
import { copySheet, markAsCopy, syncCopyOwners } from "./copies";
import * as Y from "yjs";
import { buildDocState, appendNodes, p, i, t, h, hr, pAlign, muted, val, block, type DocNode } from "./kits/doc";
import type { HostHooks } from "./ops";

class CraftError extends Error {}
const fail = (msg: string): never => { throw new CraftError(msg); };
export { CraftError };

/** The skill each craft adds to a Quick Craft roll (a number value on the character). */
export const CRAFT_SKILL: Record<CraftKind, string> = { forge: "blacksmithing", alchemy: "alchemy", rune: "rune_making" };
const CRAFT_FOLDER = "Crafting";
const EXPERIMENT_FOLDER = "Crafting Experiments";

type CraftOp = Extract<AgOp, { op: `craft.${string}` }>;
export interface CraftResult {
  tier: CraftTier;
  tierLabel: string;
  noteId?: string;
  name?: string;
  message: string;
  roll?: { natural: number; skill: number; total: number; label: string; breakdown: string };
  pending?: boolean;
}

interface Ctx { store: ScopeStore; viewer: AgViewer; host: HostHooks }

// --------------------------------------------------------------------------- helpers
function noteOf(store: ScopeStore, id: string | null | undefined, what = "That sheet"): AgNote {
  return (id && store.notes.get(id)) || fail(`${what} no longer exists`);
}
const fieldsOf = (store: ScopeStore, id: string) => store.fieldsByNote.get(id) ?? new Map<string, AgField>();
const valueOf = (store: ScopeStore, id: string, key: string): AgValue | undefined => {
  const f = fieldsOf(store, id).get(key);
  if (!f) return undefined;
  return (store.computer().effOf(f).eff as AgValue) ?? f.value;
};

/** The player's own character (or any, for the GM). */
function crafter(ctx: Ctx, characterId: string): AgNote {
  const c = noteOf(ctx.store, characterId, "That character");
  if (c.isTemplate) fail("Craft with a character, not a template");
  if (!ctx.viewer.isGM && !c.ownerIds.includes(ctx.viewer.userId)) fail("You can only craft as your own character");
  return c;
}

/** The connection a character's inventory uses (its list that takes items) — "items" ← "owner" by default. */
async function inventoryList(store: ScopeStore, host: AgNote): Promise<{ label: string; reverse: string; copyFolder: string | null }> {
  const names = [noteDocName(host.id, host.docEpoch), ...Array.from(store.regions.values()).filter((r) => r.noteId === host.id).map((r) => regionDocName(r.id, host.docEpoch))];
  const lists = await docs.linkListsOf(names).catch(() => [] as Array<{ label: string; config: any }>);
  const l = lists.find((x) => !x.label.includes(".") && Array.isArray(x.config?.add?.types) && x.config.add.types.includes("item"));
  const cfg = l?.config;
  return {
    label: l?.label ?? "items", reverse: cfg?.add?.reverse || "owner",
    copyFolder: cfg?.add?.copy ? (typeof cfg.add.copyFolder === "string" && cfg.add.copyFolder.trim() ? cfg.add.copyFolder.trim() : "Copies") : null,
  };
}
/** What's in a character's inventory (the items connected to it by its inventory's connection). */
function inventoryOf(store: ScopeStore, characterId: string, reverse: string): AgNote[] {
  return store.linksOf(characterId).filter((l) => l.toNoteId === characterId && l.label === reverse)
    .map((l) => store.notes.get(l.fromNoteId)).filter((n): n is AgNote => !!n && !n.isTemplate);
}
function inInventory(inv: AgNote[], id: string | null | undefined, what: string): AgNote {
  return inv.find((n) => n.id === id) ?? fail(`${what} isn't in this character's inventory`);
}
const qtyOf = (store: ScopeStore, id: string) => { const f = fieldsOf(store, id).get("qty"); return f ? Math.max(0, asNumber((f.value as any) ?? 0)) : 1; };

/** Find inventory items for a recipe's needs (enough of each), or say what's missing. */
function gather(store: ScopeStore, inv: AgNote[], needs: CraftNeed[]): Array<{ item: AgNote; qty: number; consumed: boolean }> {
  const out: Array<{ item: AgNote; qty: number; consumed: boolean }> = [];
  const missing: string[] = [];
  for (const need of needs) {
    let left = need.qty;
    for (const item of inv.filter((n) => itemMatches(n, need))) {
      if (left <= 0) break;
      const have = qtyOf(store, item.id) - out.filter((o) => o.item.id === item.id).reduce((s, o) => s + o.qty, 0);
      const take = Math.min(have, left);
      if (take > 0) { out.push({ item, qty: take, consumed: need.consumed !== false }); left -= take; }
    }
    if (left > 0) missing.push(`${need.qty} × ${need.name || "an ingredient"}`);
  }
  if (missing.length) fail(`Missing: ${missing.join(", ")}`);
  return out;
}
/** Use up `qty` of an item: its quantity goes down; the last one is gone. */
async function consume(store: ScopeStore, item: AgNote, qty: number, cs: ChangeSet) {
  const f = fieldsOf(store, item.id).get("qty");
  const left = (f ? asNumber((f.value as any) ?? 0) : 1) - qty;
  if (f && left > 0) { await store.putField({ ...f, value: left }, cs); return; }
  await store.removeNote(item.id, cs);
}

/** Set a value on a sheet, adding it if the sheet doesn't have it yet. */
async function setValue(store: ScopeStore, noteId: string, key: string, value: AgValue, cs: ChangeSet, label?: string) {
  const f = fieldsOf(store, noteId).get(key);
  if (f) {
    if (f.type === "formula" || f.type === "dice") { if (f.type === "dice" && typeof value === "string") await store.putField({ ...f, formula: value }, cs); return; }
    const v = f.type === "number" ? numOf(value) : f.type === "boolean" ? !!value : f.type === "select" ? String(value ?? "") : value;
    await store.putField({ ...f, value: v }, cs);
    return;
  }
  const type: AgFieldType = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "text";
  const order = Math.max(0, ...Array.from(fieldsOf(store, noteId).values()).map((x) => x.sortOrder)) + 1;
  await store.putField({
    id: randomUUID(), noteId, key, label: label ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), type, value, formula: null,
    options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: order, templateFieldId: null,
  }, cs);
}

/**
 * A new item in the character's inventory, made from `sourceId` (a template, or
 * an item to copy) — or a plain item when there's none.
 */
async function giveItem(ctx: Ctx, character: AgNote, sourceId: string | null | undefined, name: string, cs: ChangeSet): Promise<AgNote> {
  const { store } = ctx;
  const inv = await inventoryList(store, character);
  const source = sourceId ? store.notes.get(sourceId) : undefined;
  let item: AgNote;
  if (source?.isTemplate) {
    const s = await snap.takeSnapshot(store, source.id);
    item = await snap.createFromSnapshot(store, s, { name, ownerIds: [], folder: inv.copyFolder, portrait: source.portrait }, cs, { fromTemplateId: source.id });
  } else if (source) {
    item = await copySheet(store, source.id, cs, { folder: inv.copyFolder, ownerIds: [] });
    await store.putNote({ ...store.notes.get(item.id)!, name }, cs);
  } else {
    const now = Date.now();
    item = {
      id: randomUUID(), scope: store.scope.kind, scopeId: store.scope.id, type: "item", isTemplate: false, templateMeta: null, templateId: null, templateVersion: null,
      name, portrait: null, ownerIds: [], acl: { view: "owners", edit: "owners" }, bodyAcl: { view: "inherit", edit: "inherit" }, tokenBars: null,
      folder: inv.copyFolder, sortOrder: now % 1_000_000_000, docEpoch: 0, createdAt: now, updatedAt: now,
    };
    await store.putNote(item, cs);
  }
  await store.putLink({ id: randomUUID(), fromNoteId: item.id, toNoteId: character.id, label: inv.reverse, reverseLabel: inv.label, acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
  if (inv.copyFolder) await markAsCopy(store, item.id, cs, inv.copyFolder);
  await syncCopyOwners(store, item.id, cs);
  return store.notes.get(item.id)!;
}

async function setPortrait(ctx: Ctx, noteId: string, dataUrl: string | null | undefined, cs: ChangeSet) {
  if (!dataUrl || !ctx.host.saveImage || !/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl) || dataUrl.length > 4_000_000) return;
  const url = await ctx.host.saveImage(dataUrl).catch(() => null);
  if (!url) return;
  const n = ctx.store.notes.get(noteId);
  if (!n) return;
  await ctx.store.putNote({ ...n, portrait: url }, cs);
  if (ctx.store.scope.kind === "campaign") void ctx.host.refreshNoteTokens?.(ctx.store.scope.id, noteId, url).catch(() => {});
}

/** Quick Craft: d20 + the craft's skill on the character. */
function quickRoll(store: ScopeStore, character: AgNote, kind: CraftKind, station: AgNote | undefined) {
  const natural = rollDie(20);
  const skill = Math.round(numOf(valueOf(store, character.id, CRAFT_SKILL[kind])));
  const bonus = station ? Math.round(numOf(valueOf(store, station.id, "station_bonus"))) : 0;
  const total = natural + skill + bonus;
  const tier = quickCraftTier(natural, total);
  const label = `Quick Craft (${CRAFT_KIND_LABEL[kind]})`;
  const sign = (n: number) => `${n >= 0 ? "+" : "−"} ${Math.abs(n)}`;
  return { tier, roll: { natural, skill, total, label, breakdown: `1d20 [${natural}]${skill ? ` ${sign(skill)} ${CRAFT_KIND_LABEL[kind]}` : ""}${bonus ? ` ${sign(bonus)} ${station!.name}` : ""} = ${total} → ${TIER_LABEL[tier]}` } };
}

// --------------------------------------------------------------------------- stations
// A crafting station is an item the crafter has to carry to work a craft — a
// forge, an alchemist's pot, a rune pen: any item whose "station_for" value
// names the craft. Once a system has any (a template or item with that value),
// every craft needs its station; its "station_bonus" adds to Quick Craft.
export function stationsInUse(store: ScopeStore): boolean {
  for (const fields of Array.from(store.fieldsByNote.values())) if (fields.has("station_for")) return true;
  return false;
}
function stationIn(store: ScopeStore, inv: AgNote[], kind: CraftKind): AgNote | undefined {
  return inv.find((n) => String(valueOf(store, n.id, "station_for") ?? "") === CRAFT_KIND_LABEL[kind]);
}
/** The station's name for a craft (what the system calls it), for messages. */
function stationName(store: ScopeStore, kind: CraftKind): string {
  for (const n of Array.from(store.notes.values())) if (!n.copyOf && String(valueOf(store, n.id, "station_for") ?? "") === CRAFT_KIND_LABEL[kind] && !n.isTemplate) return n.name;
  return `${CRAFT_KIND_LABEL[kind]} station`;
}
/** The station it's worked at: the one named (carried, and for this craft), else the first carried. */
function needStation(store: ScopeStore, inv: AgNote[], kind: CraftKind, stationId?: string | null): AgNote | undefined {
  if (stationId) {
    const st = inv.find((n) => n.id === stationId);
    if (!st) fail("That station isn't in the inventory");
    if (String(valueOf(store, st!.id, "station_for") ?? "") !== CRAFT_KIND_LABEL[kind]) fail(`${st!.name} isn't for ${CRAFT_KIND_LABEL[kind]}`);
    return st;
  }
  const st = stationIn(store, inv, kind);
  if (stationsInUse(store) && !st) fail(`You need a ${stationName(store, kind)} in your inventory for ${CRAFT_KIND_LABEL[kind]}`);
  return st;
}
/** Not every station makes everything: its "station_recipes" (if set) lists what it can. */
const canMakeAt = (store: ScopeStore, station: AgNote | undefined, defId: string) => !station || stationAllows(valueOf(store, station.id, "station_recipes"), defId);
function needMakeAt(store: ScopeStore, station: AgNote | undefined, defId: string, name: string) {
  if (!canMakeAt(store, station, defId)) fail(`${name} can't be made at ${station!.name} — it takes a different station`);
}

// --------------------------------------------------------------------------- knowledge (scrolls)
// A character knows a blueprint, recipe or rune by carrying a scroll that
// teaches it: an item whose "teaches" value is that sheet (with its name in
// "teaches_name" and a copy of its setup in "craft", kept in step with it).
type Def<K extends CraftKind> = { defId: string; name: string; config: Extract<ForgeConfig | AlchemyConfig | RuneConfig, { kind: K }> };
function knownDef<K extends CraftKind>(store: ScopeStore, inv: AgNote[], id: string, kind: K, what: string): Def<K> {
  const scroll = inv.find((n) => n.id === id || String(valueOf(store, n.id, "teaches") ?? "") === id);
  if (!scroll) fail(`${what} isn't known — it takes a scroll that teaches it`);
  const defId = String(valueOf(store, scroll!.id, "teaches") ?? "") || scroll!.id;
  const def = store.notes.get(defId);
  const config = (def && parseCraftConfig(valueOf(store, def.id, "craft"))) || parseCraftConfig(valueOf(store, scroll!.id, "craft"));
  if (!config || config.kind !== kind) fail(`${scroll!.name} doesn't teach ${CRAFT_KIND_LABEL[kind]}`);
  return { defId, name: def?.name ?? String(valueOf(store, scroll!.id, "teaches_name") ?? scroll!.name), config: config as any };
}
/** Every definition sheet of a craft here (for experiments and freehand runes, which find recipes nobody has taught). */
function allDefs<K extends CraftKind>(store: ScopeStore, kind: K): Array<{ note: AgNote; config: Extract<ForgeConfig | AlchemyConfig | RuneConfig, { kind: K }> }> {
  const out: any[] = [];
  for (const n of Array.from(store.notes.values())) {
    if (n.isTemplate || n.type !== CRAFT_DEF_TYPE[kind]) continue;
    const c = parseCraftConfig(valueOf(store, n.id, "craft"));
    if (c && c.kind === kind) out.push({ note: n, config: c });
  }
  return out;
}
const scrollName = (def: AgNote) => `${def.name.replace(/\s*recipe\s*$/i, "").trim() || def.name} Scroll`;
/** A scroll that teaches `def` — the GM's (in the recipe's folder), or given straight to a character. */
export async function makeScroll(ctx: Ctx, def: AgNote, cs: ChangeSet, character?: AgNote): Promise<AgNote> {
  const { store } = ctx;
  const tpl = Array.from(store.notes.values()).find((n) => n.isTemplate && n.type === "item" && fieldsOf(store, n.id).has("teaches"));
  let scroll: AgNote;
  if (character) scroll = await giveItem(ctx, character, tpl?.id ?? null, scrollName(def), cs);
  else if (tpl) scroll = await snap.createFromSnapshot(store, await snap.takeSnapshot(store, tpl.id), { name: scrollName(def), folder: def.folder, ownerIds: [] }, cs, { fromTemplateId: tpl.id });
  else {
    const now = Date.now();
    scroll = { id: randomUUID(), scope: store.scope.kind, scopeId: store.scope.id, type: "item", isTemplate: false, templateMeta: null, templateId: null, templateVersion: null, name: scrollName(def), portrait: null, ownerIds: [], acl: { view: "owners", edit: "owners" }, bodyAcl: { view: "inherit", edit: "inherit" }, tokenBars: null, folder: def.folder, sortOrder: now % 1e9, docEpoch: 0, createdAt: now, updatedAt: now };
    await store.putNote(scroll, cs);
  }
  for (const [k, v] of Object.entries({ teaches: def.id, teaches_name: def.name, craft: String(valueOf(store, def.id, "craft") ?? ""), item_type: "Scroll", qty: 1 } as Record<string, AgValue>)) await setValue(store, scroll.id, k, v, cs);
  return store.notes.get(scroll.id)!;
}
/** A definition's setup changed: the scrolls that teach it follow. */
export async function syncScrolls(store: ScopeStore, defId: string, cs: ChangeSet) {
  const craft = fieldsOf(store, defId).get("craft");
  if (!craft) return;
  for (const fields of Array.from(store.fieldsByNote.values())) {
    if (String(fields.get("teaches")?.value ?? "") !== defId) continue;
    const f = fields.get("craft");
    if (f && f.value !== craft.value) await store.putField({ ...f, value: craft.value }, cs);
  }
}

/** An item with "rune_sockets" takes that many runes (its rank decides); one with no such value, any number. */
export function socketsOf(store: ScopeStore, itemId: string): { max: number | null; used: number } {
  const used = store.linksOf(itemId).filter((l) => l.toNoteId === itemId && fieldsOf(store, l.fromNoteId).has("sigil")).length;
  return fieldsOf(store, itemId).has("rune_sockets") ? { max: Math.max(0, Math.floor(numOf(valueOf(store, itemId, "rune_sockets")))), used } : { max: null, used };
}
function needSocket(store: ScopeStore, item: AgNote) {
  const { max, used } = socketsOf(store, item.id);
  if (max === null) return;
  if (max === 0) fail(`${item.name} has no rune sockets — its rank is too low`);
  if (used >= max) fail(`${item.name}'s rune sockets are full (${used} of ${max})`);
}

async function announce(ctx: Ctx, text: string) {
  if (ctx.store.scope.kind === "campaign") await ctx.host.postChat?.(ctx.store.scope.id, { sender: "Crafting", text, audience: "everyone" }).catch(() => {});
}

/**
 * The smith's mark on what they forged: who made it (kept on the item, so it stays theirs wherever it goes), and a
 * signature at the foot of its page — their name in a hand. Added once; a page that has one already keeps it.
 */
async function signItem(store: ScopeStore, itemId: string, character: AgNote, cs: ChangeSet) {
  await setValue(store, itemId, "forged_by", character.name || "Unknown smith", cs, "Forged by");
  await setValue(store, itemId, "forged_by_id", character.id, cs, "Forged by (sheet)");
  const note = store.notes.get(itemId);
  if (!note) return;
  const name = noteDocName(note.id, note.docEpoch);
  const entry = await docs.getDoc(name, note.id);
  const frag = entry.doc.getXmlFragment("default");
  const signed = (el: Y.XmlFragment | Y.XmlElement): boolean => el.toArray().some((c) => c instanceof Y.XmlElement && ((c.nodeName === "agField" && c.getAttribute("ref") === "forged_by") || signed(c)));
  if (!signed(frag)) {
    entry.doc.transact(() => appendNodes(frag, [
      hr(),
      pAlign("right", muted("Forged by  "), val("forged_by", { look: { font: "script", fontSize: 22, textColor: "#e7c27a" } })),
    ]));
  }
  // Saved like any edit; let it go from memory when nobody has the page open.
  docs.subscribe(entry, "craft-signature");
  docs.unsubscribe(name, "craft-signature");
}

/** Apply a tier's changes to the output (values set or added; text — dice, a choice, words — is always set). */
async function applyEffects(store: ScopeStore, noteId: string, effects: Array<{ key: string; mode?: "set" | "add"; values: Partial<Record<CraftTier, number | string>> }>, tier: CraftTier, cs: ChangeSet) {
  for (const e of effects) {
    const v = e.values[tier];
    if (v === undefined) continue;
    if (typeof v === "string") { await setValue(store, noteId, e.key, v, cs); continue; }
    const cur = numOf(fieldsOf(store, noteId).get(e.key)?.value);
    // Durability is a percentage.
    const next = e.key === "durability" ? Math.max(0, Math.min(100, e.mode === "set" ? v : cur + v)) : e.mode === "set" ? v : cur + v;
    await setValue(store, noteId, e.key, next, cs);
  }
}

/** A made weapon's rolls follow its numbers: Damage rolls its die + damage bonus, Attack adds accuracy. */
async function patchWeaponRolls(store: ScopeStore, noteId: string, damageDie: number, failed: boolean, cs: ChangeSet) {
  for (const a of store.actionsOf(noteId)) {
    const r = a.options?.roll;
    if (!r) continue;
    if (/damage/i.test(a.name)) {
      // The blueprint's die, and Damage Die ready to use: the wielder can spend to roll more of it (a failed weapon can't).
      const { scale: _old, ...rest } = r;
      const scale = failed ? undefined : { step: String(defaultScaleStep(damageDie)), pay: r.scale?.pay ?? r.costs[0]?.key ?? "energy" };
      const icon = /^die:d\d+$/.test(a.options?.icon ?? "") && [4, 6, 8, 10, 12, 20].includes(damageDie) ? `die:d${damageDie}` : a.options?.icon;
      await store.putAction({ ...a, options: { ...a.options, icon, roll: { ...rest, die: failed ? "1" : String(damageDie), bonus: failed ? "-1" : "damage_bonus", ...(scale ? { scale } : {}) } } }, cs);
    }
    else if (/strike|attack|hit/i.test(a.name)) await store.putAction({ ...a, options: { ...a.options, roll: { ...r, bonus: "accuracy" } } }, cs);
  }
}

// --------------------------------------------------------------------------- ops
export async function runCraftOp(ctx: Ctx, body: CraftOp): Promise<any> {
  const { store, viewer } = ctx;
  switch (body.op) {
    // A crafting session: a sheet whose document holds the tool's live state, so the
    // GM (and anyone the session is shared with) can watch it as it happens.
    case "craft.session": {
      const character = crafter(ctx, body.characterId);
      const kind = (["forge", "alchemy", "rune"] as const).includes(body.kind as any) ? body.kind : fail("Unknown craft");
      // One session per character, craft and station (two forges are two workbenches).
      const stationId = body.stationId ? noteOf(store, body.stationId, "That station").id : "";
      const open = store.linksOf(character.id).filter((l) => l.toNoteId === character.id && l.label === "crafter")
        .map((l) => store.notes.get(l.fromNoteId)).find((n) => n?.type === "craft" && numOf(valueOf(store, n.id, "craft_done")) === 0 && valueOf(store, n.id, "craft_kind") === kind && String(valueOf(store, n.id, "station_id") ?? "") === stationId);
      if (open && !body.fresh) return { noteId: open.id, stations: stationsInUse(store) };
      return store.run(async (cs) => {
        const s: AgSnapshot = {
          note: {
            type: "craft", isTemplate: false, templateMeta: null, templateId: null, templateVersion: null, name: `${CRAFT_KIND_LABEL[kind]} — ${character.name}`,
            portrait: null, ownerIds: [...character.ownerIds], userIds: [...(character.userIds ?? [])], acl: { view: "owners", edit: "owners" }, bodyAcl: { view: "inherit", edit: "inherit" },
            tokenBars: null, folder: CRAFT_FOLDER, sortOrder: 0,
          },
          fields: [
            { id: "f_kind", noteId: "SELF", key: "craft_kind", label: "Craft", type: "text", value: kind, formula: null, options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: 0, templateFieldId: null },
            { id: "f_done", noteId: "SELF", key: "craft_done", label: "Finished", type: "number", value: 0, formula: null, options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: 1, templateFieldId: null },
            { id: "f_station", noteId: "SELF", key: "station_id", label: "Station", type: "text", value: stationId, formula: null, options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: 2, templateFieldId: null },
          ],
          regions: [], actions: [], modifiers: [],
          docs: { note: buildDocState([p(i(`${character.name}'s ${CRAFT_KIND_LABEL[kind].toLowerCase()} — open their crafting station's sheet to watch.`))]) },
        };
        const n = await snap.createFromSnapshot(store, s, {}, cs);
        await store.putLink({ id: randomUUID(), fromNoteId: n.id, toNoteId: character.id, label: "crafter", reverseLabel: "crafting", acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
        return { noteId: n.id, stations: stationsInUse(store) };
      });
    }
    case "craft.makeScroll": {
      if (!viewer.isGM) fail("Only the GM makes scrolls");
      const def = noteOf(store, body.defId, "That recipe");
      if (!parseCraftConfig(valueOf(store, def.id, "craft"))) fail(`${def.name} isn't set up as a recipe yet`);
      const character = body.characterId ? noteOf(store, body.characterId, "That character") : undefined;
      return store.run(async (cs) => { const sc = await makeScroll(ctx, def, cs, character); return { noteId: sc.id, name: sc.name }; });
    }
    case "craft.close": {
      const n = noteOf(store, body.sessionId);
      if (n.type !== "craft") fail("That isn't a crafting session");
      if (!viewer.isGM && !n.ownerIds.includes(viewer.userId)) fail("Only whoever is crafting can close it");
      return store.run(async (cs) => { await store.removeNote(n.id, cs); return { ok: true }; });
    }

    // ---------------------------------------------------------------- blacksmithing
    case "craft.forgePart": {
      const character = crafter(ctx, body.characterId);
      const inv = inventoryOf(store, character.id, (await inventoryList(store, character)).reverse);
      const station = needStation(store, inv, "forge", body.stationId);
      const { defId, name: bpName, config } = knownDef(store, inv, body.blueprintId, "forge", "That blueprint");
      needMakeAt(store, station, defId, bpName);
      const bp = { id: defId, name: bpName };
      const part = config.parts.find((x) => x.key === body.partKey) ?? fail("That blueprint has no such part");
      const material = inInventory(inv, body.materialId, "That material");
      const mat = { hardness: numOf(valueOf(store, material.id, "hardness"), 3), value: numOf(valueOf(store, material.id, "value"), 1), weight: numOf(valueOf(store, material.id, "weight"), 1) };
      const st = partStats(part.role, Math.max(0, Math.min(100, body.shape)), Math.max(0, Math.min(100, body.heat)), mat);
      return store.run(async (cs) => {
        await consume(store, material, 1, cs);
        const item = await giveItem(ctx, character, config.partTemplate, `${material.name} ${part.label}`, cs);
        const vals: Record<string, AgValue> = {
          item_type: "Part", part_key: part.key, part_role: part.role, part_shape: part.shape, blueprint_id: bp.id, part_of: bp.name, material: material.name,
          metal_color: String(valueOf(store, material.id, "metal_color") ?? "#a8a29e"), quality: st.quality, durability: st.durability, durability_max: 100,
          damage_bonus: st.damageBonus, accuracy: st.accuracy, weight: st.weight, value: st.value, qty: 1, craft_tier: TIER_LABEL[st.tier],
          ...(body.metal && metalFits(body.metal) ? { part_metal: body.metal } : {}),
        };
        for (const [k, v] of Object.entries(vals)) await setValue(store, item.id, k, v, cs);
        await setPortrait(ctx, item.id, body.portrait, cs);
        await signItem(store, item.id, character, cs);
        const name = store.notes.get(item.id)!.name;
        await announce(ctx, `⚒ ${character.name} forged ${name} — shape ${st.quality}%, ${st.durability}% durability.`);
        return { tier: st.tier, tierLabel: TIER_LABEL[st.tier], noteId: item.id, name, message: `${name}: shape ${st.quality}%, durability ${st.durability}%${part.role === "blade" ? `, damage ${st.damageBonus >= 0 ? "+" : ""}${st.damageBonus}` : part.role === "handle" ? `, accuracy ${st.accuracy >= 0 ? "+" : ""}${st.accuracy}` : ""}.` } satisfies CraftResult;
      });
    }
    case "craft.forgeWeapon":
    case "craft.forgeQuick": {
      const character = crafter(ctx, body.characterId);
      const inv = inventoryOf(store, character.id, (await inventoryList(store, character)).reverse);
      const station = needStation(store, inv, "forge", body.stationId);
      const { defId, name: bpName, config } = knownDef(store, inv, body.blueprintId, "forge", "That blueprint");
      needMakeAt(store, station, defId, bpName);
      const bp = { id: defId, name: bpName };
      const quick = body.op === "craft.forgeQuick" ? quickRoll(store, character, "forge", station) : null;
      const QUICK: Record<CraftTier, number> = { fail: 5, weak: 45, default: 72, slight: 88, huge: 98 };
      const used: AgNote[] = [];
      // How it's put together — each part's shape, colour and metal as made — so its picture can be drawn again.
      const build: Array<{ key: string; label: string; role: ForgeRole; shape: string; color: string; metal: string | null }> = [];
      const parts: Array<{ role: ForgeRole; durability: number; damageBonus: number; accuracy: number; weight: number; value: number; material: string; quality: number }> = [];
      for (const part of config.parts) {
        const id = body.op === "craft.forgeQuick" ? body.materials[part.key] : body.partIds[part.key];
        if (!id) { if (part.optional) continue; fail(`${part.label} is needed`); }
        const it = inInventory(inv, id, body.op === "craft.forgeQuick" ? `The ${part.label.toLowerCase()} material` : `The ${part.label.toLowerCase()}`);
        if (used.some((u) => u.id === it.id) && (body.op === "craft.forgeWeapon" || qtyOf(store, it.id) < used.filter((u) => u.id === it.id).length + 1)) fail(`${it.name} can only be used once here`);
        used.push(it);
        const metal = body.op === "craft.forgeWeapon" ? valueOf(store, it.id, "part_metal") : null;
        build.push({ key: part.key, label: part.label, role: part.role, shape: part.shape, color: /^#[0-9a-f]{3,8}$/i.test(String(valueOf(store, it.id, "metal_color") ?? "")) ? String(valueOf(store, it.id, "metal_color")) : "#9ca3af", metal: typeof metal === "string" && metalFits(metal) ? metal : null });
        if (body.op === "craft.forgeWeapon") {
          if (String(valueOf(store, it.id, "part_key") ?? "") !== part.key || String(valueOf(store, it.id, "blueprint_id") ?? "") !== bp.id) fail(`${it.name} isn't a ${part.label.toLowerCase()} for ${bp.name}`);
          parts.push({ role: part.role, durability: numOf(valueOf(store, it.id, "durability")), damageBonus: numOf(valueOf(store, it.id, "damage_bonus")), accuracy: numOf(valueOf(store, it.id, "accuracy")), weight: numOf(valueOf(store, it.id, "weight")), value: numOf(valueOf(store, it.id, "value")), material: String(valueOf(store, it.id, "material") ?? ""), quality: numOf(valueOf(store, it.id, "quality"), 60) });
        } else {
          const q = QUICK[quick!.tier];
          const mat = { hardness: numOf(valueOf(store, it.id, "hardness"), 3), value: numOf(valueOf(store, it.id, "value"), 1), weight: numOf(valueOf(store, it.id, "weight"), 1) };
          parts.push({ ...partStats(part.role, q, q, mat), role: part.role, material: it.name });
        }
      }
      const w = weaponStats(parts);
      // Assembled from hammered parts: its tier is the parts' average quality (earned at the anvil).
      const tier: CraftTier = quick ? quick.tier : accuracyTier(parts.reduce((s, x) => s + x.quality, 0) / Math.max(1, parts.length));
      const failed = tier === "fail";
      const blade = parts.find((x) => x.role === "blade");
      const name = body.name?.trim().slice(0, 80) || `${failed ? "Failed " : ""}${blade?.material ? `${blade.material} ` : ""}${bp.name.replace(/\s*blueprint\s*/i, "").trim() || "Weapon"}`;
      return store.run(async (cs) => {
        for (const it of used) await consume(store, it, 1, cs);
        const item = await giveItem(ctx, character, config.output, name, cs);
        const vals: Record<string, AgValue> = {
          durability: failed ? 10 : w.durability, durability_max: 100, damage_bonus: failed ? 0 : w.damageBonus + (quick ? TIER_BONUS[quick.tier] : 0),
          accuracy: failed ? 0 : w.accuracy, weight: w.weight, value: failed ? 0 : w.value, qty: 1, craft_tier: TIER_LABEL[tier], blueprint_id: bp.id,
          forge_build: JSON.stringify({ failed, parts: build }),
        };
        for (const [k, v] of Object.entries(vals)) await setValue(store, item.id, k, v, cs);
        await applyEffects(store, item.id, config.effects ?? [], tier, cs);
        await patchWeaponRolls(store, item.id, config.damageDie, failed, cs);
        await setPortrait(ctx, item.id, body.portrait, cs);
        await signItem(store, item.id, character, cs);
        await announce(ctx, `⚒ ${character.name} ${quick ? "quick-forged" : "assembled"} ${name}${quick ? ` (${TIER_LABEL[tier]})` : ""}.`);
        return { tier, tierLabel: TIER_LABEL[tier], noteId: item.id, name, roll: quick?.roll, message: failed ? `${name} is done — but it's a failure: it does nothing.` : `${name}: durability ${w.durability}%, damage d${config.damageDie} ${vals.damage_bonus as number >= 0 ? "+" : ""}${vals.damage_bonus}, accuracy ${w.accuracy >= 0 ? "+" : ""}${w.accuracy}, worth ${w.value} (sells for ${sellValue(w.value, w.durability)}).` } satisfies CraftResult;
      });
    }

    // ---------------------------------------------------------------- alchemy
    case "craft.brew": {
      const character = crafter(ctx, body.characterId);
      const inv = inventoryOf(store, character.id, (await inventoryList(store, character)).reverse);
      const station = needStation(store, inv, "alchemy", body.stationId);
      const { defId, name: recipeName, config } = knownDef(store, inv, body.recipeId, "alchemy", "That recipe");
      needMakeAt(store, station, defId, recipeName);
      const recipe = { name: recipeName };
      const use = gather(store, inv, config.ingredients);
      const quick = body.mode === "quick" ? quickRoll(store, character, "alchemy", station) : null;
      const tier = quick ? quick.tier : accuracyTier(Math.max(0, Math.min(100, body.accuracy ?? 0)));
      return store.run(async (cs) => {
        for (const u of use) if (u.consumed) await consume(store, u.item, u.qty, cs);
        const { note: out, does } = await brewOutput(ctx, character, recipe, config, tier, cs);
        await announce(ctx, `⚗ ${character.name} brewed ${out.name} (${TIER_LABEL[tier]}).`);
        return { tier, tierLabel: TIER_LABEL[tier], noteId: out.id, name: out.name, roll: quick?.roll, message: tier === "fail" ? `${out.name} — the brew failed: it has no effect.` : `${out.name} (${TIER_LABEL[tier]})${does ? `: ${does}` : ""}.` } satisfies CraftResult;
      });
    }
    case "craft.experiment": {
      const character = crafter(ctx, body.characterId);
      const inv = inventoryOf(store, character.id, (await inventoryList(store, character)).reverse);
      const station = needStation(store, inv, "alchemy", body.stationId);
      const used = (body.ingredients ?? []).slice(0, 20).map((x) => ({ item: inInventory(inv, x.itemId, "An ingredient"), qty: Math.max(1, Math.min(99, Math.round(x.qty || 1))) }));
      if (used.some((u) => valueOf(store, u.item.id, "station_for") !== undefined)) fail("The pot itself can't go in the brew");
      if (!used.length) fail("Put something in the cauldron first");
      for (const u of used) if (qtyOf(store, u.item.id) < u.qty) fail(`Not enough ${u.item.name}`);
      const log = (body.log ?? []).slice(0, 80).map((l) => String(l).slice(0, 160));
      const steps = (body.steps ?? []).slice(0, 60).filter((s) => typeof s === "string" && s in ALCHEMY_STEP_LABEL);
      // A known recipe followed closely enough (from what was put in and done) is discovered.
      // (Only one this station can make: anything else is the GM's call.)
      const best = bestRecipe(store, used.map((u) => ({ name: u.item.name, note: u.item, qty: u.qty })), steps);
      const found = best && canMakeAt(store, station, best.note.id) ? best : null;
      return store.run(async (cs) => {
        for (const u of used) await consume(store, u.item, u.qty, cs);
        if (found) {
          const tier = accuracyTier(found.score);
          const { note: out, does } = await brewOutput(ctx, character, found.note, found.config, tier, cs);
          // Discovered: they write it down — its scroll is theirs (unless they have one already).
          const knew = inv.some((n) => String(valueOf(store, n.id, "teaches") ?? "") === found.note.id);
          if (!knew) await makeScroll(ctx, found.note, cs, character);
          await announce(ctx, `⚗ ${character.name} discovered ${found.note.name} by experimenting!`);
          return { tier, tierLabel: TIER_LABEL[tier], noteId: out.id, name: out.name, message: `You discovered ${found.note.name}! ${out.name} (${TIER_LABEL[tier]})${does ? `: ${does}` : ""}${knew ? "" : " — its recipe scroll is in your inventory"}.` } satisfies CraftResult;
        }
        // Something new: the GM decides what (if anything) it makes.
        const tried = [
          `Ingredients: ${used.map((u) => `${u.qty} × ${u.item.name}`).join(", ")}`,
          ...log.map((l, k) => `${k + 1}. ${l}`),
        ].join("\n");
        const s: AgSnapshot = {
          note: {
            type: "experiment", isTemplate: false, templateMeta: null, templateId: null, templateVersion: null, name: `Experiment — ${character.name}`,
            portrait: null, ownerIds: [], acl: { view: "gm", edit: "gm" }, bodyAcl: { view: "inherit", edit: "inherit" }, tokenBars: null, folder: EXPERIMENT_FOLDER, sortOrder: 0,
          },
          fields: [
            { id: "f_c", noteId: "SELF", key: "crafter_id", label: "Character", type: "text", value: character.id, formula: null, options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: 0, templateFieldId: null },
            { id: "f_s", noteId: "SELF", key: "status", label: "Status", type: "select", value: "Waiting for the GM", formula: null, options: { choices: ["Waiting for the GM", "Made something", "Nothing happened"], choiceColors: { "Waiting for the GM": "#f59e0b", "Made something": "#22c55e", "Nothing happened": "#78716c" } }, acl: { view: "inherit", edit: "inherit" }, sortOrder: 1, templateFieldId: null },
            { id: "f_t", noteId: "SELF", key: "tried", label: "What they tried", type: "text", value: tried, formula: null, options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: 2, templateFieldId: null },
            { id: "f_r", noteId: "SELF", key: "result", label: "Result", type: "text", value: "", formula: null, options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: 3, templateFieldId: null },
          ],
          regions: [], actions: [], modifiers: [],
          docs: { note: buildDocState(experimentPage(character.name)) },
        };
        const n = await snap.createFromSnapshot(store, s, {}, cs);
        await store.putLink({ id: randomUUID(), fromNoteId: n.id, toNoteId: character.id, label: "crafter", reverseLabel: "experiments", acl: { view: "gm", edit: "gm" }, createdAt: Date.now() }, cs);
        if (store.scope.kind === "campaign") {
          await ctx.host.postChat?.(store.scope.id, { sender: "Crafting", text: `[ag-experiment:${n.id}] ${character.name} experimented with a new brew.\n${tried}`, audience: "gm" }).catch(() => {});
        }
        return { tier: "fail", tierLabel: "Waiting", pending: true, noteId: n.id, message: "Something is brewing… the GM will decide what (if anything) comes of it." } satisfies CraftResult;
      });
    }
    case "craft.resolveExperiment": {
      if (!viewer.isGM) fail("Only the GM can decide that");
      const exp = noteOf(store, body.experimentId, "That experiment");
      if (exp.type !== "experiment") fail("That isn't an experiment");
      if (String(valueOf(store, exp.id, "status")) !== "Waiting for the GM") fail("That experiment has already been decided");
      const character = noteOf(store, String(valueOf(store, exp.id, "crafter_id") ?? ""), "The character");
      const output = body.outputId ? noteOf(store, body.outputId, "That item") : null;
      return store.run(async (cs) => {
        let made: AgNote | null = null;
        if (output) made = await giveItem(ctx, character, output.id, output.name, cs);
        await setValue(store, exp.id, "status", made ? "Made something" : "Nothing happened", cs);
        await setValue(store, exp.id, "result", made ? made.name : "No item", cs);
        if (store.scope.kind === "campaign") {
          const text = made ? `⚗ ${character.name}'s experiment made ${made.name}!` : `⚗ ${character.name}'s experiment fizzled — nothing happened.`;
          await ctx.host.postChat?.(store.scope.id, { sender: "Crafting", text, audience: "everyone" }).catch(() => {});
        }
        return { ok: true, noteId: made?.id ?? null };
      });
    }

    // ---------------------------------------------------------------- rune making
    case "craft.rune": {
      const character = crafter(ctx, body.characterId);
      const list = await inventoryList(store, character);
      const inv = inventoryOf(store, character.id, list.reverse);
      const station = needStation(store, inv, "rune", body.stationId);
      // Freehand: whatever rune the marks come closest to (any rune — none needs to be known), at the guided thresholds.
      let freehand: { score: number } | null = null;
      let def: Def<"rune">;
      if (body.mode === "freehand") {
        const drawn = (body.strokes ?? []).slice(0, 40);
        const best = allDefs(store, "rune").filter((d) => canMakeAt(store, station, d.note.id)).map((d) => ({ d, score: traceAccuracy(d.config.sigil, drawn) })).sort((a, b) => b.score - a.score)[0];
        if (!best || best.score < 60) fail(`Those marks don't form any rune${best ? ` (closest: ${best.score}%)` : ""} — nothing took.`);
        def = { defId: best!.d.note.id, name: best!.d.note.name, config: best!.d.config };
        freehand = { score: best!.score };
      } else { def = knownDef(store, inv, body.runeId ?? "", "rune", "That rune"); needMakeAt(store, station, def.defId, def.name); }
      const { config } = def;
      const rune = { name: def.name };
      const target = inInventory(inv, body.targetId, "The item to inscribe");
      if (target.id === body.inkId || target.id === body.toolId) fail("Pick a different item to inscribe");
      needSocket(store, target);
      const use = gather(store, inv.filter((n) => n.id !== target.id), config.ingredients);
      let tool = body.toolId ? inInventory(inv, body.toolId, "That tool") : null;
      // Freehand: nobody knew which rune it would be, so any fitting tool they carry will do.
      if (freehand && config.tools.length && (!tool || !config.tools.some((tn) => itemMatches(tool!, tn)))) tool = inv.find((n) => config.tools.some((tn) => itemMatches(n, tn))) ?? tool;
      if (config.tools.length && (!tool || !config.tools.some((tn) => itemMatches(tool, tn)))) fail(`It needs ${config.tools.map((tn) => tn.name).join(" or ")} to carve`);
      const ink = body.inkId ? inInventory(inv, body.inkId, "That ink") : null;
      if (ink && valueOf(store, ink.id, "ink_color") === undefined) fail(`${ink.name} isn't a liquid or ink`);
      if (config.needsInk && !ink) fail("This rune needs a liquid or ink");
      const quick = body.mode === "quick" ? quickRoll(store, character, "rune", station) : null;
      const accuracy = freehand ? freehand.score : Math.max(0, Math.min(100, body.accuracy ?? 0));
      // Freehand counts like tracing with the guide; tracing a known rune without it is easier to excel at.
      const tier: CraftTier = quick ? quick.tier : runeTier(accuracy, freehand ? true : body.guide !== false);
      const color = ink ? String(valueOf(store, ink.id, "ink_color") ?? "") : "";
      const glow = ink ? numOf(valueOf(store, ink.id, "ink_glow")) : 0;
      const style = tool ? String(valueOf(store, tool.id, "mark_style") ?? "Carved") : "Carved";
      return store.run(async (cs) => {
        for (const u of use) if (u.consumed) await consume(store, u.item, u.qty, cs);
        if (ink) await consume(store, ink, 1, cs);
        // The rune, set into the item for good (only the GM, or something made for it, takes it out).
        const name = `${tier === "fail" ? "Spent " : ""}${rune.name.replace(/\s*recipe\s*/i, "").trim() || "Rune"}`;
        const source = config.output ? store.notes.get(config.output) : undefined;
        let r: AgNote;
        if (source?.isTemplate) r = await snap.createFromSnapshot(store, await snap.takeSnapshot(store, source.id), { name, ownerIds: [], folder: list.copyFolder }, cs, { fromTemplateId: source.id });
        else if (source) { r = await copySheet(store, source.id, cs, { folder: list.copyFolder, ownerIds: [] }); await store.putNote({ ...store.notes.get(r.id)!, name }, cs); }
        else {
          const now = Date.now();
          r = { id: randomUUID(), scope: store.scope.kind, scopeId: store.scope.id, type: "item", isTemplate: false, templateMeta: null, templateId: null, templateVersion: null, name, portrait: null, ownerIds: [], acl: { view: "owners", edit: "owners" }, bodyAcl: { view: "inherit", edit: "inherit" }, tokenBars: null, folder: list.copyFolder, sortOrder: now % 1e9, docEpoch: 0, createdAt: now, updatedAt: now };
          await store.putNote(r, cs);
        }
        const runeLists = await docs.linkListsOf([noteDocName(target.id, target.docEpoch)]).catch(() => [] as any[]);
        const socket = runeLists.find((l: any) => l.label === "runes");
        const reverse = socket?.config?.add?.reverse || "socket";
        await store.putLink({ id: randomUUID(), fromNoteId: r.id, toNoteId: target.id, label: reverse, reverseLabel: "runes", acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
        const amount = config.effect ? config.effect.values[tier] : undefined;
        const vals: Record<string, AgValue> = {
          item_type: "Rune", rune_tier: TIER_LABEL[tier], rune_color: color, rune_glow: glow, rune_style: style,
          sigil: JSON.stringify(config.sigil), rune_drawn: JSON.stringify((body.strokes ?? []).slice(0, 40)), placement: JSON.stringify(body.placement ?? { x: 50, y: 50, s: 30, r: 0 }),
          boosts: tier === "fail" || amount === undefined || !config.effect ? "No effect (socket spent)" : `${config.effect.key.replace(/_/g, " ")} ${amount >= 0 ? "+" : ""}${amount}`,
          rune_accuracy: quick ? 0 : accuracy,
        };
        for (const [k, v] of Object.entries(vals)) await setValue(store, r.id, k, v, cs);
        if (config.effect && amount !== undefined && tier !== "fail") {
          await store.putModifier({ id: randomUUID(), noteId: r.id, via: reverse, targetKey: config.effect.key, op: "add", amount: String(amount), condition: null, label: `${name} (${TIER_LABEL[tier]})` }, cs);
        }
        await markAsCopy(store, r.id, cs, list.copyFolder);
        await syncCopyOwners(store, r.id, cs);
        // The item keeps its own picture underneath, so runes can be redrawn over it.
        if (fieldsOf(store, target.id).get("base_portrait") === undefined) await setValue(store, target.id, "base_portrait", target.portrait ?? "", cs, "Picture without runes");
        await setPortrait(ctx, target.id, body.portrait, cs);
        await announce(ctx, `✦ ${character.name} inscribed ${name} on ${target.name} (${TIER_LABEL[tier]}).`);
        return { tier, tierLabel: TIER_LABEL[tier], noteId: r.id, name, roll: quick?.roll, message: tier === "fail" ? `The rune didn't take — the socket on ${target.name} is spent.` : `${name} on ${target.name}: ${vals.boosts} (${TIER_LABEL[tier]}).` } satisfies CraftResult;
      });
    }
  }
  return fail("Unknown crafting step");
}

/**
 * A brew's output: the recipe's item, with the tier's numbers (a failed brew is inert). What a recipe sets by tier wins;
 * where it says nothing, a better brew rolls more of its dice, is worth more, and is more potent (a worse one, less) —
 * so a Fine potion always does more than a Standard one. Returns the item and what it does now, in words.
 */
async function brewOutput(ctx: Ctx, character: AgNote, recipe: { name: string }, config: AlchemyConfig, tier: CraftTier, cs: ChangeSet): Promise<{ note: AgNote; does: string }> {
  const { store } = ctx;
  const base = recipe.name.replace(/\s*recipe\s*/i, "").trim() || "Potion";
  const name = tier === "fail" ? `Inert ${base}` : tier === "default" ? base : `${TIER_LABEL[tier]} ${base}`;
  const item = await giveItem(ctx, character, config.output, name, cs);
  await setValue(store, item.id, "craft_tier", TIER_LABEL[tier], cs);
  await setValue(store, item.id, "qty", 1, cs);
  const set = new Set((config.effects ?? []).map((e) => e.key));
  const touched: string[] = [];
  if (tier !== "fail") {
    for (const f of Array.from(fieldsOf(store, item.id).values())) {
      if (f.type === "dice" && f.formula && !set.has(f.key) && TIER_DICE[tier]) { await store.putField({ ...f, formula: moreDice(f.formula, TIER_DICE[tier]) }, cs); touched.push(f.key); }
    }
    const worth = fieldsOf(store, item.id).get("value");
    if (worth && !set.has("value") && TIER_WORTH[tier] !== 1) { await setValue(store, item.id, "value", Math.max(0, Math.round(numOf(worth.value) * TIER_WORTH[tier])), cs); touched.push("value"); }
  }
  if (!set.has("potency")) { await setValue(store, item.id, "potency", tier === "fail" ? 0 : TIER_BONUS[tier], cs, "Potency"); if (TIER_BONUS[tier]) touched.push("potency"); }
  await applyEffects(store, item.id, config.effects ?? [], tier, cs);
  for (const e of config.effects ?? []) if (e.values[tier] !== undefined) touched.push(e.key);
  await setValue(store, item.id, "inert", tier === "fail", cs);
  // In words, for the result: "Heals (HP) 3d6 · Heals wounds up to Minor · Potency +2 · Worth 48".
  const fields = fieldsOf(store, item.id);
  const does = Array.from(new Set(touched)).map((k) => {
    const f = fields.get(k);
    if (!f) return null;
    const v = f.type === "dice" ? f.formula : f.value;
    if (v === null || v === undefined || v === "") return null;
    const shown = k === "potency" && typeof v === "number" ? `${v >= 0 ? "+" : ""}${v}` : String(v);
    return `${f.label || k} ${shown}`;
  }).filter(Boolean).join(" · ");
  return { note: store.notes.get(item.id)!, does };
}

/** The recipe an experiment matches best: the same ingredients, and steps close enough. */
function bestRecipe(store: ScopeStore, used: Array<{ name: string; note: AgNote; qty: number }>, steps: string[]) {
  let best: { note: AgNote; config: AlchemyConfig; score: number } | null = null;
  for (const n of Array.from(store.notes.values())) {
    if (n.isTemplate || n.type !== "recipe") continue;
    const config = parseCraftConfig(fieldsOf(store, n.id).get("craft")?.value);
    if (!config || config.kind !== "alchemy" || !config.ingredients.length) continue;
    // Every ingredient it needs, in the right amounts, and nothing else.
    const ok = config.ingredients.every((need) => used.filter((u) => itemMatches(u.note, need)).reduce((s, u) => s + u.qty, 0) === need.qty)
      && used.every((u) => config.ingredients.some((need) => itemMatches(u.note, need)));
    if (!ok) continue;
    const want = config.steps.map((s) => s.type as string);
    const score = want.length ? Math.round((100 * lcs(want, steps)) / Math.max(want.length, steps.length)) : 100;
    if (score >= 60 && (!best || score > best.score)) best = { note: n, config, score };
  }
  return best;
}
function lcs(a: string[], b: string[]) {
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let x = 1; x <= a.length; x++) for (let y = 1; y <= b.length; y++) d[x][y] = a[x - 1] === b[y - 1] ? d[x - 1][y - 1] + 1 : Math.max(d[x - 1][y], d[x][y - 1]);
  return d[a.length][b.length];
}

/** An experiment's page: what they tried, and the GM's choice (see the Experiment block). */
function experimentPage(characterName: string): DocNode[] {
  return [
    block("status", { display: "badge", showLabel: false }),
    h(3, `${characterName} tried something new`),
    block("tried", { display: "text", showLabel: false, look: { fontSize: 13, textColor: "#d6d3d1" } }),
    { type: "agCraftExperiment", attrs: {} },
    p(t("Result", { bold: {} })),
    block("result", { display: "value", showLabel: false }),
  ];
}
void FORGE_SHAPES;
