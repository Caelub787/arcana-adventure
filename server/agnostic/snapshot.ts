// Snapshots: version history, restore, template instantiation / apply /
// switch, copies between scopes, and import/export all reduce to "capture a
// note's whole content" and "write content into a note".
import { randomUUID } from "crypto";
import type { AgAction, AgField, AgModifier, AgNote, AgRegion, AgSnapshot } from "@shared/agnostic/types";
import { noteDocName, regionDocName } from "@shared/agnostic/types";
import type { ChangeSet, ScopeStore } from "./store";
import * as docs from "./docs";
import * as repo from "./repo";

export async function takeSnapshot(store: ScopeStore, noteId: string): Promise<AgSnapshot> {
  const note = store.notes.get(noteId);
  if (!note) throw new Error("Note not found");
  const regions = store.regionsOf(noteId);
  const docStates: Record<string, string> = {};
  const main = await docs.stateOf(noteDocName(noteId, note.docEpoch));
  if (main) docStates.note = main;
  for (const r of regions) {
    const s = await docs.stateOf(regionDocName(r.id, note.docEpoch));
    if (s) docStates[`region:${r.id}`] = s;
  }
  const { id: _i, createdAt: _c, updatedAt: _u, docEpoch: _e, scope: _s, scopeId: _si, ...meta } = note;
  return {
    note: meta,
    fields: store.fieldsOf(noteId).map(({ eff: _x, err: _y, ...f }) => ({ ...f })),
    regions: regions.map((r) => ({ ...r })),
    actions: store.actionsOf(noteId).map((a) => ({ ...a, steps: [...a.steps], ...(a.options ? { options: JSON.parse(JSON.stringify(a.options)) } : {}) })),
    modifiers: store.modifiersOf(noteId).map((m) => ({ ...m })),
    docs: docStates,
  };
}

export async function recordVersion(store: ScopeStore, noteId: string, reason: string, label: string | null, userId: string | null) {
  const snap = await takeSnapshot(store, noteId);
  return repo.insertVersion(noteId, reason, label, snap, userId);
}

/** Give every region/action/field/modifier a new id; return the remapped content + id map. */
export function reid(snap: AgSnapshot, newNoteId: string, fromTemplate: boolean, extraIds?: Map<string, string>) {
  // extraIds: ids that already have a home in the target scope (copied components).
  const idMap = new Map<string, string>(extraIds ?? []);
  const fresh = (old: string) => { const n = randomUUID(); idMap.set(old, n); return n; };
  const fields: AgField[] = snap.fields.map((f) => ({
    ...f, id: fresh(f.id), noteId: newNoteId,
    templateFieldId: fromTemplate ? f.id : f.templateFieldId,
  }));
  const regions: AgRegion[] = snap.regions.map((r) => ({
    ...r, id: fresh(r.id), noteId: newNoteId,
    templateRegionId: fromTemplate ? r.id : r.templateRegionId,
  }));
  const actions: AgAction[] = snap.actions.map((a) => ({ ...a, id: fresh(a.id), noteId: newNoteId }));
  const modifiers: AgModifier[] = snap.modifiers.map((m) => ({ ...m, id: fresh(m.id), noteId: newNoteId }));
  const docStates: Record<string, string> = {};
  for (const [k, v] of Object.entries(snap.docs)) {
    const remapped = docs.remapState(v, idMap);
    if (!remapped) continue;
    if (k === "note") docStates.note = remapped;
    else if (k.startsWith("region:")) {
      const oldId = k.slice(7);
      const nid = idMap.get(oldId);
      if (nid) docStates[`region:${nid}`] = remapped;
    }
  }
  return { fields, regions, actions, modifiers, docs: docStates, idMap };
}

/**
 * Replace a note's whole content (fields, regions, actions, modifiers, docs)
 * with `content`, whose ids are already final. Documents move to a new epoch
 * so every open editor re-subscribes to the new state cleanly.
 */
export async function writeContent(
  store: ScopeStore, noteId: string,
  content: { fields: AgField[]; regions: AgRegion[]; actions: AgAction[]; modifiers: AgModifier[]; docs: Record<string, string> },
  cs: ChangeSet,
) {
  const note = store.notes.get(noteId)!;
  const keep = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));
  const fieldIds = keep(content.fields), regionIds = keep(content.regions), actionIds = keep(content.actions), modIds = keep(content.modifiers);
  // Remove first: the (note, key) unique index would otherwise trip on renames.
  for (const f of store.fieldsOf(noteId)) if (!fieldIds.has(f.id)) await store.removeField(f.id, cs);
  const incomingKeys = new Map(content.fields.map((f) => [f.key, f.id]));
  for (const f of store.fieldsOf(noteId)) {
    const claimant = incomingKeys.get(f.key);
    if (claimant && claimant !== f.id) await store.removeField(f.id, cs);
  }
  for (const r of store.regionsOf(noteId)) if (!regionIds.has(r.id)) await store.removeRegion(r.id, cs);
  for (const a of store.actionsOf(noteId)) if (!actionIds.has(a.id)) await store.removeAction(a.id, cs);
  for (const m of store.modifiersOf(noteId)) if (!modIds.has(m.id)) await store.removeModifier(m.id, cs);
  for (const f of content.fields) await store.putField({ ...f, noteId }, cs);
  for (const r of content.regions) await store.putRegion({ ...r, noteId }, cs);
  for (const a of content.actions) await store.putAction({ ...a, noteId }, cs);
  for (const m of content.modifiers) await store.putModifier({ ...m, noteId }, cs);

  const oldEpoch = note.docEpoch;
  const epoch = oldEpoch + 1;
  const names: string[] = [];
  const main = noteDocName(noteId, epoch);
  names.push(main);
  await docs.putState(main, noteId, content.docs.note ?? null);
  for (const r of content.regions) {
    const name = regionDocName(r.id, epoch);
    names.push(name);
    await docs.putState(name, noteId, content.docs[`region:${r.id}`] ?? null);
  }
  for (const open of docs.openDocNames(noteId)) if (!names.includes(open)) docs.discard(open);
  docs.deleteDocsOfNote(noteId, names);
  note.docEpoch = epoch;
  await store.putNote(note, cs, true);
  cs.epochNotes.add(noteId);
}

/** Create a brand-new note in `store` from a snapshot (template, copy, import). */
export async function createFromSnapshot(
  store: ScopeStore, snap: AgSnapshot, overrides: Partial<AgNote>, cs: ChangeSet,
  opts: { fromTemplateId?: string | null; componentIds?: Map<string, string> } = {},
): Promise<AgNote> {
  const id = randomUUID();
  const fromTemplate = !!opts.fromTemplateId;
  const content = reid(snap, id, fromTemplate || snap.note.isTemplate, opts.componentIds);
  const now = Date.now();
  const note: AgNote = {
    ...snap.note,
    id, scope: store.scope.kind, scopeId: store.scope.id,
    docEpoch: 0, createdAt: now, updatedAt: now,
    ...(fromTemplate ? { isTemplate: false, templateMeta: null, templateId: opts.fromTemplateId!, templateVersion: snap.note.templateMeta?.version ?? 1 } : {}),
    ...overrides,
  } as AgNote;
  note.docEpoch = -1; // writeContent bumps to 0
  await store.putNote(note, cs);
  await writeContent(store, id, content, cs);
  return store.notes.get(id)!;
}

/**
 * A sheet is being copied in from another scope (My Library → campaign…):
 * bring the components it uses along. One with the same name already here is
 * reused (every scope has its own "HP bar"); otherwise a copy is made.
 * Returns old id → id in `store`.
 */
export async function carryComponents(source: ScopeStore, store: ScopeStore, snap: AgSnapshot, cs: ChangeSet): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pending: string[] = [];
  for (const state of Object.values(snap.docs)) pending.push(...Array.from(docs.referencedIds(state).components));
  const byName = new Map(Array.from(store.components.values()).map((c) => [c.name.toLowerCase(), c.id]));
  while (pending.length) {
    const oldId = pending.shift()!;
    if (map.has(oldId) || store.components.has(oldId)) continue;
    const src = source.components.get(oldId);
    if (!src) continue;
    const existing = byName.get(src.name.toLowerCase());
    if (existing) { map.set(oldId, existing); continue; }
    const newId = randomUUID();
    map.set(oldId, newId);
    // Components can hold components: carry those too, then point at the copies.
    for (const it of src.layout.items) if (it.widget.kind === "component" && it.widget.componentId) pending.push(it.widget.componentId);
    await store.putComponent({ ...JSON.parse(JSON.stringify(src)), id: newId, scope: store.scope.kind, scopeId: store.scope.id }, cs);
    byName.set(src.name.toLowerCase(), newId);
  }
  for (const newId of Array.from(new Set(map.values()))) {
    const c = store.components.get(newId);
    if (!c || !c.layout.items.some((it) => it.widget.kind === "component" && map.has(it.widget.componentId))) continue;
    const layout = { ...c.layout, items: c.layout.items.map((it) => it.widget.kind === "component" && map.has(it.widget.componentId) ? { ...it, widget: { ...it.widget, componentId: map.get(it.widget.componentId)! } } : it) };
    await store.putComponent({ ...c, layout }, cs);
  }
  return map;
}

export async function restoreSnapshot(store: ScopeStore, noteId: string, snap: AgSnapshot, cs: ChangeSet) {
  const note = store.notes.get(noteId)!;
  // Ownership and identity stay as they are now; everything else comes back.
  const { ownerIds: _o, isTemplate: _t, templateMeta, ...rest } = snap.note;
  Object.assign(note, rest);
  if (note.isTemplate && templateMeta) note.templateMeta = { ...templateMeta, version: note.templateMeta?.version ?? templateMeta.version };
  await writeContent(store, noteId, {
    fields: snap.fields.map((f) => ({ ...f })), regions: snap.regions.map((r) => ({ ...r })),
    actions: snap.actions.map((a) => ({ ...a })), modifiers: snap.modifiers.map((m) => ({ ...m })), docs: snap.docs,
  }, cs);
}

/** Switch a sheet to another template (or none). Returns the version id to undo with. */
export async function switchTemplate(store: ScopeStore, noteId: string, template: AgNote | null, userId: string, cs: ChangeSet) {
  const note = store.notes.get(noteId)!;
  const before = await recordVersion(store, noteId, "template-switch", template ? `Before switching to "${template.name}"` : "Before removing template", userId);
  if (template) {
    const tSnap = await takeSnapshot(store, template.id);
    const content = reid(tSnap, noteId, true);
    note.templateId = template.id;
    note.templateVersion = template.templateMeta?.version ?? 1;
    note.acl = { ...tSnap.note.acl };
    note.bodyAcl = { ...tSnap.note.bodyAcl };
    note.tokenBars = tSnap.note.tokenBars ? [...tSnap.note.tokenBars] : null;
    note.type = tSnap.note.type;
    await writeContent(store, noteId, content, cs);
  } else {
    note.templateId = null;
    note.templateVersion = null;
    await writeContent(store, noteId, { fields: [], regions: [], actions: [], modifiers: [], docs: {} }, cs);
  }
  return before.id;
}

export type ApplyMode = "fields" | "full";

/**
 * Bring a sheet up to date with its template. Values and anything the player
 * wrote are kept wherever possible; a version is recorded first so it can be
 * rolled back.
 *   fields: field definitions, actions and modifiers only — layout untouched.
 *   full:   also the layout; regions that came from the template keep the
 *           sheet's own content.
 */
export async function applyTemplate(store: ScopeStore, template: AgNote, noteId: string, mode: ApplyMode, removeMissing: boolean, userId: string, cs: ChangeSet) {
  const note = store.notes.get(noteId)!;
  await recordVersion(store, noteId, "template-apply", `Before applying "${template.name}" v${template.templateMeta?.version ?? 1}`, userId);
  const tSnap = await takeSnapshot(store, template.id);
  const current = await takeSnapshot(store, noteId);
  const idMap = new Map<string, string>();

  // Fields: match by template lineage, then by key.
  const fields: AgField[] = [];
  const used = new Set<string>();
  for (const tf of tSnap.fields) {
    const existing = current.fields.find((f) => f.templateFieldId === tf.id) ?? current.fields.find((f) => f.key === tf.key && !used.has(f.id));
    if (existing) {
      used.add(existing.id);
      idMap.set(tf.id, existing.id);
      const sameKind = existing.type === tf.type || (existing.type !== "formula" && tf.type !== "formula" && typeof existing.value === typeof tf.value);
      fields.push({ ...tf, id: existing.id, noteId, templateFieldId: tf.id, value: sameKind ? existing.value : tf.value });
    } else {
      const id = randomUUID();
      idMap.set(tf.id, id);
      fields.push({ ...tf, id, noteId, templateFieldId: tf.id });
    }
  }
  for (const f of current.fields) {
    if (used.has(f.id)) continue;
    // Fields the GM added to this sheet by hand always stay; template-born ones
    // the template no longer has go only when asked.
    if (removeMissing && f.templateFieldId) continue;
    if (fields.some((x) => x.key === f.key)) continue;
    fields.push(f);
  }

  // Actions: match by name (buttons on the sheet keep pointing at the same id).
  const actions: AgAction[] = [];
  const usedA = new Set<string>();
  for (const ta of tSnap.actions) {
    const existing = current.actions.find((a) => a.name === ta.name && !usedA.has(a.id));
    const id = existing?.id ?? randomUUID();
    if (existing) usedA.add(existing.id);
    idMap.set(ta.id, id);
    actions.push({ ...ta, id, noteId });
  }
  for (const a of current.actions) if (!usedA.has(a.id)) actions.push(a);

  const modifiers: AgModifier[] = tSnap.modifiers.map((m) => ({ ...m, id: randomUUID(), noteId }));

  let regions = current.regions;
  let docStates = current.docs;
  if (mode === "full") {
    regions = [];
    docStates = {};
    for (const tr of tSnap.regions) {
      const existing = current.regions.find((r) => r.templateRegionId === tr.id);
      const id = existing?.id ?? randomUUID();
      idMap.set(tr.id, id);
      regions.push({ ...tr, id, noteId, templateRegionId: tr.id });
      const content = existing ? current.docs[`region:${existing.id}`] : docs.remapState(tSnap.docs[`region:${tr.id}`] ?? null, idMap);
      if (content) docStates[`region:${id}`] = content;
    }
    // Hand-made regions referenced by nothing in the new layout are dropped
    // with it — they're in the version recorded above.
    const main = docs.remapState(tSnap.docs.note ?? null, idMap);
    if (main) docStates.note = main;
    note.bodyAcl = { ...tSnap.note.bodyAcl };
    note.tokenBars = tSnap.note.tokenBars ? [...tSnap.note.tokenBars] : note.tokenBars;
  }
  note.templateVersion = template.templateMeta?.version ?? 1;
  await writeContent(store, noteId, { fields, regions, actions, modifiers, docs: docStates }, cs);
}

/** Strip a snapshot down for export: no values players typed, optionally no GM-only text. */
export function sanitizeForExport(snap: AgSnapshot, includeGmText: boolean): AgSnapshot {
  const gmOnly = (r: AgRegion) => r.acl.view === "gm";
  const regions = includeGmText ? snap.regions : snap.regions.filter((r) => !gmOnly(r));
  const allowed = new Set(regions.map((r) => `region:${r.id}`));
  const docStates: Record<string, string> = {};
  for (const [k, v] of Object.entries(snap.docs)) if (k === "note" || allowed.has(k)) docStates[k] = v;
  return {
    ...snap,
    note: { ...snap.note, ownerIds: [], portrait: snap.note.portrait, templateId: null, templateVersion: null },
    regions,
    docs: docStates,
    // Specific players don't exist in someone else's campaign.
    fields: snap.fields.map((f) => ({ ...f, acl: stripUsers(f.acl) })),
    actions: snap.actions.map((a) => ({ ...a, acl: stripUsers(a.acl) })),
  };
}

function stripUsers<T extends { view: any; edit: any }>(acl: T): T {
  const fix = (a: any) => (a && typeof a === "object" ? (a.owners ? "owners" : "gm") : a);
  return { ...acl, view: fix(acl.view), edit: fix(acl.edit) };
}

/**
 * Copy many sheets from one scope into another in one go, keeping everything
 * that points between them: which template a sheet came from, links to other
 * sheets on the page, and the components they use. Every id is new.
 * Returns old id → new id (sheets, values, sections, buttons, changes, components).
 */
export async function copyNotes(
  source: ScopeStore, store: ScopeStore, noteIds: string[], cs: ChangeSet,
  opts: { keepOwners?: boolean } = {},
): Promise<Map<string, string>> {
  const snaps = new Map<string, AgSnapshot>();
  for (const id of noteIds) if (source.notes.has(id)) snaps.set(id, await takeSnapshot(source, id));
  const idMap = new Map<string, string>();
  for (const s of Array.from(snaps.values())) {
    for (const [k, v] of Array.from((await carryComponents(source, store, s, cs)).entries())) idMap.set(k, v);
  }
  for (const [oldId, s] of Array.from(snaps.entries())) {
    idMap.set(oldId, randomUUID());
    for (const x of [...s.fields, ...s.regions, ...s.actions, ...s.modifiers]) idMap.set(x.id, randomUUID());
  }
  const mapped = (id: string | null | undefined) => (id ? idMap.get(id) ?? null : null);
  for (const [oldId, s] of Array.from(snaps.entries())) {
    const id = idMap.get(oldId)!;
    const now = Date.now();
    const note: AgNote = {
      ...(s.note as AgNote),
      id, scope: store.scope.kind, scopeId: store.scope.id, docEpoch: -1, createdAt: now, updatedAt: now,
      // A sheet whose template didn't come along is no longer locked to one.
      templateId: mapped(s.note.templateId),
      templateVersion: mapped(s.note.templateId) ? s.note.templateVersion : null,
      ownerIds: opts.keepOwners ? [...s.note.ownerIds] : [],
    };
    await store.putNote(note, cs);
    const docStates: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.docs)) {
      const remapped = docs.remapState(v, idMap);
      if (!remapped) continue;
      if (k === "note") docStates.note = remapped;
      else if (k.startsWith("region:")) { const nid = idMap.get(k.slice(7)); if (nid) docStates[`region:${nid}`] = remapped; }
    }
    await writeContent(store, id, {
      fields: s.fields.map((f) => ({ ...f, id: idMap.get(f.id)!, noteId: id, templateFieldId: mapped(f.templateFieldId) })),
      regions: s.regions.map((r) => ({ ...r, id: idMap.get(r.id)!, noteId: id, templateRegionId: mapped(r.templateRegionId) })),
      actions: s.actions.map((a) => ({ ...a, id: idMap.get(a.id)!, noteId: id })),
      modifiers: s.modifiers.map((m) => ({ ...m, id: idMap.get(m.id)!, noteId: id })),
      docs: docStates,
    }, cs);
  }
  return idMap;
}
