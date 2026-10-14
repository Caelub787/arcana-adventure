// Persistence for the Agnostic data layer. Rows ↔ shared entity types.
// All writes go through the in-memory ScopeStore first (store.ts); this file
// only knows how to read a scope and write individual rows.
import { and, eq, inArray, or, desc, like, lt } from "drizzle-orm";
import { db } from "../db";
import {
  agnosticNotes, agnosticFields, agnosticRegions, agnosticLinks, agnosticModifiers, agnosticActions,
  agnosticComponents, agnosticSettings, agnosticDocs, agnosticVersions, agnosticScopeMeta,
} from "@shared/agnostic-schema";
import type {
  AgAction, AgCampaignSettings, AgComponentDef, AgField, AgLink, AgModifier, AgNote, AgRegion, AgScope, AgSnapshot, AgVersionMeta,
} from "@shared/agnostic/types";
import { defaultCampaignSettings } from "@shared/agnostic/types";
import { normalizeAcl } from "@shared/agnostic/acl";
import { randomUUID } from "crypto";
import { upsertLater, deleteLater, writeLater, writesSettled } from "./writeQueue";

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : Date.now());

export function rowToNote(r: typeof agnosticNotes.$inferSelect): AgNote {
  return {
    id: r.id, scope: r.scope as AgNote["scope"], scopeId: r.scopeId, type: r.type, isTemplate: r.isTemplate,
    templateMeta: r.templateMeta ?? null, templateId: r.templateId, templateVersion: r.templateVersion,
    name: r.name, portrait: r.portrait, ownerIds: r.ownerIds ?? [],
    acl: normalizeAcl(r.acl, true, { view: "everyone", edit: "gm" }),
    bodyAcl: normalizeAcl(r.bodyAcl, true),
    tokenBars: r.tokenBars ?? null, folder: r.folder, sortOrder: r.sortOrder, docEpoch: r.docEpoch,
    copyOf: r.copyOf ?? null,
    createdAt: ms(r.createdAt), updatedAt: ms(r.updatedAt),
  };
}
export function rowToField(r: typeof agnosticFields.$inferSelect): AgField {
  return {
    id: r.id, noteId: r.noteId, key: r.key, label: r.label, type: r.type as AgField["type"],
    value: (r.value ?? null) as AgField["value"], formula: r.formula, options: r.options ?? {},
    acl: normalizeAcl(r.acl), sortOrder: r.sortOrder, templateFieldId: r.templateFieldId,
  };
}
const rowToRegion = (r: typeof agnosticRegions.$inferSelect): AgRegion => ({
  id: r.id, noteId: r.noteId, acl: normalizeAcl(r.acl), inline: r.inline, label: r.label, templateRegionId: r.templateRegionId,
});
const rowToLink = (r: typeof agnosticLinks.$inferSelect): AgLink => ({
  id: r.id, fromNoteId: r.fromNoteId, toNoteId: r.toNoteId, label: r.label, reverseLabel: r.reverseLabel,
  acl: normalizeAcl(r.acl), createdAt: ms(r.createdAt),
});
const rowToModifier = (r: typeof agnosticModifiers.$inferSelect): AgModifier => ({
  id: r.id, noteId: r.noteId, via: r.via, targetKey: r.targetKey, op: r.op === "multiply" ? "multiply" : "add",
  amount: r.amount, condition: r.condition, label: r.label,
});
const rowToAction = (r: typeof agnosticActions.$inferSelect): AgAction => ({
  id: r.id, noteId: r.noteId, name: r.name, steps: r.steps ?? [], acl: normalizeAcl(r.acl), color: r.color,
  ...(r.options ? { options: r.options } : {}),
});
const rowToComponent = (r: typeof agnosticComponents.$inferSelect): AgComponentDef => ({
  id: r.id, scope: r.scope as AgComponentDef["scope"], scopeId: r.scopeId, name: r.name, params: r.params ?? [], layout: r.layout, updatedAt: ms(r.updatedAt),
});

export interface ScopeRows {
  notes: AgNote[];
  fields: AgField[];
  regions: AgRegion[];
  links: AgLink[];
  modifiers: AgModifier[];
  actions: AgAction[];
  components: AgComponentDef[];
  settings: AgCampaignSettings | null;
}

export async function loadScope(scope: AgScope): Promise<ScopeRows> {
  // Anything of this scope still on its way to the database lands first.
  await writesSettled(`${scope.kind}:${scope.id}`);
  const noteRows = await db.select().from(agnosticNotes).where(and(eq(agnosticNotes.scope, scope.kind), eq(agnosticNotes.scopeId, scope.id)));
  const notes = noteRows.map(rowToNote);
  const ids = notes.map((n) => n.id);
  const components = (await db.select().from(agnosticComponents).where(and(eq(agnosticComponents.scope, scope.kind), eq(agnosticComponents.scopeId, scope.id)))).map(rowToComponent);
  let settings: AgCampaignSettings | null = null;
  if (scope.kind === "campaign") {
    const [s] = await db.select().from(agnosticSettings).where(eq(agnosticSettings.campaignId, scope.id));
    settings = s ? { ...defaultCampaignSettings(), ...s.settings, tracker: { ...defaultCampaignSettings().tracker, ...(s.settings?.tracker ?? {}) } } : defaultCampaignSettings();
  }
  if (!ids.length) return { notes, fields: [], regions: [], links: [], modifiers: [], actions: [], components, settings };
  const [fields, regions, links, modifiers, actions] = await Promise.all([
    db.select().from(agnosticFields).where(inArray(agnosticFields.noteId, ids)),
    db.select().from(agnosticRegions).where(inArray(agnosticRegions.noteId, ids)),
    db.select().from(agnosticLinks).where(or(inArray(agnosticLinks.fromNoteId, ids), inArray(agnosticLinks.toNoteId, ids))),
    db.select().from(agnosticModifiers).where(inArray(agnosticModifiers.noteId, ids)),
    db.select().from(agnosticActions).where(inArray(agnosticActions.noteId, ids)),
  ]);
  return {
    notes, components, settings,
    fields: fields.map(rowToField), regions: regions.map(rowToRegion), links: links.map(rowToLink),
    modifiers: modifiers.map(rowToModifier), actions: actions.map(rowToAction),
  };
}

// --- writes --------------------------------------------------------------------
const noteRow = (n: AgNote) => ({
  id: n.id, scope: n.scope, scopeId: n.scopeId, type: n.type, isTemplate: n.isTemplate, templateMeta: n.templateMeta,
  templateId: n.templateId, templateVersion: n.templateVersion, name: n.name, portrait: n.portrait, ownerIds: n.ownerIds,
  acl: n.acl, bodyAcl: n.bodyAcl, tokenBars: n.tokenBars, folder: n.folder, sortOrder: n.sortOrder, docEpoch: n.docEpoch,
  copyOf: n.copyOf ?? null,
  createdAt: new Date(n.createdAt), updatedAt: new Date(n.updatedAt),
});
export async function upsertNote(n: AgNote) {
  const row = noteRow(n);
  await db.insert(agnosticNotes).values(row).onConflictDoUpdate({ target: agnosticNotes.id, set: { ...row, id: undefined, createdAt: undefined } as any });
}
export async function deleteNote(id: string) {
  await db.delete(agnosticNotes).where(eq(agnosticNotes.id, id));
}

const fieldRow = (f: AgField) => ({
  id: f.id, noteId: f.noteId, key: f.key, label: f.label, type: f.type, value: f.value as any, formula: f.formula,
  options: f.options, acl: f.acl, sortOrder: f.sortOrder, templateFieldId: f.templateFieldId,
});
export async function upsertField(f: AgField) {
  const row = fieldRow(f);
  await db.insert(agnosticFields).values(row).onConflictDoUpdate({ target: agnosticFields.id, set: { ...row, id: undefined } as any });
}
export async function deleteField(id: string) { await db.delete(agnosticFields).where(eq(agnosticFields.id, id)); }

export async function upsertRegion(r: AgRegion) {
  await db.insert(agnosticRegions).values(r).onConflictDoUpdate({ target: agnosticRegions.id, set: { acl: r.acl, inline: r.inline, label: r.label, templateRegionId: r.templateRegionId } });
}
export async function deleteRegion(id: string) { await db.delete(agnosticRegions).where(eq(agnosticRegions.id, id)); }

export async function upsertLink(l: AgLink) {
  const row = { ...l, createdAt: new Date(l.createdAt) };
  await db.insert(agnosticLinks).values(row).onConflictDoUpdate({ target: agnosticLinks.id, set: { label: l.label, reverseLabel: l.reverseLabel, acl: l.acl } });
}
export async function deleteLink(id: string) { await db.delete(agnosticLinks).where(eq(agnosticLinks.id, id)); }

export async function upsertModifier(m: AgModifier) {
  await db.insert(agnosticModifiers).values(m).onConflictDoUpdate({ target: agnosticModifiers.id, set: { via: m.via, targetKey: m.targetKey, op: m.op, amount: m.amount, condition: m.condition, label: m.label } });
}
export async function deleteModifier(id: string) { await db.delete(agnosticModifiers).where(eq(agnosticModifiers.id, id)); }

export async function upsertAction(a: AgAction) {
  await db.insert(agnosticActions).values(a).onConflictDoUpdate({ target: agnosticActions.id, set: { name: a.name, steps: a.steps, acl: a.acl, color: a.color, options: a.options ?? null } });
}
export async function deleteAction(id: string) { await db.delete(agnosticActions).where(eq(agnosticActions.id, id)); }

export async function upsertComponent(c: AgComponentDef) {
  const row = { ...c, updatedAt: new Date(c.updatedAt) };
  await db.insert(agnosticComponents).values(row).onConflictDoUpdate({ target: agnosticComponents.id, set: { name: c.name, params: c.params, layout: c.layout, updatedAt: row.updatedAt } });
}
export async function deleteComponent(id: string) { await db.delete(agnosticComponents).where(eq(agnosticComponents.id, id)); }

// --- write-behind (store.ts) -----------------------------------------------------
// Same rows as the functions above, queued: the change is already live in
// memory and on every screen; the database follows in order, in batches.
const NOTE_UPDATE = ["scope", "scopeId", "type", "isTemplate", "templateMeta", "templateId", "templateVersion", "name", "portrait", "ownerIds", "acl", "bodyAcl", "tokenBars", "folder", "sortOrder", "docEpoch", "copyOf", "updatedAt"];
const FIELD_UPDATE = ["noteId", "key", "label", "type", "value", "formula", "options", "acl", "sortOrder", "templateFieldId"];
const REGION_UPDATE = ["acl", "inline", "label", "templateRegionId"];
const LINK_UPDATE = ["label", "reverseLabel", "acl"];
const MODIFIER_UPDATE = ["via", "targetKey", "op", "amount", "condition", "label"];
const ACTION_UPDATE = ["name", "steps", "acl", "color", "options"];
const COMPONENT_UPDATE = ["name", "params", "layout", "updatedAt"];
const DOC_UPDATE = ["state", "updatedAt"];
const regionRow = (r: AgRegion) => ({ id: r.id, noteId: r.noteId, acl: r.acl, inline: r.inline, label: r.label, templateRegionId: r.templateRegionId });
const linkRow = (l: AgLink) => ({ id: l.id, fromNoteId: l.fromNoteId, toNoteId: l.toNoteId, label: l.label, reverseLabel: l.reverseLabel, acl: l.acl, createdAt: new Date(l.createdAt) });
const modifierRow = (m: AgModifier) => ({ id: m.id, noteId: m.noteId, via: m.via, targetKey: m.targetKey, op: m.op, amount: m.amount, condition: m.condition, label: m.label });
const actionRow = (a: AgAction) => ({ id: a.id, noteId: a.noteId, name: a.name, steps: a.steps, acl: a.acl, color: a.color, options: a.options ?? null });
const componentRow = (c: AgComponentDef) => ({ id: c.id, scope: c.scope, scopeId: c.scopeId, name: c.name, params: c.params, layout: c.layout, updatedAt: new Date(c.updatedAt) });

export const later = {
  note: (scope: string, n: AgNote) => upsertLater(scope, agnosticNotes, noteRow(n), NOTE_UPDATE, { rank: 0 }),
  deleteNote: (scope: string, id: string) => deleteLater(scope, agnosticNotes, id),
  field: (scope: string, f: AgField) => upsertLater(scope, agnosticFields, fieldRow(f), FIELD_UPDATE),
  deleteField: (scope: string, id: string) => deleteLater(scope, agnosticFields, id),
  region: (scope: string, r: AgRegion) => upsertLater(scope, agnosticRegions, regionRow(r), REGION_UPDATE),
  deleteRegion: (scope: string, id: string) => deleteLater(scope, agnosticRegions, id),
  link: (scope: string, l: AgLink) => upsertLater(scope, agnosticLinks, linkRow(l), LINK_UPDATE),
  deleteLink: (scope: string, id: string) => deleteLater(scope, agnosticLinks, id),
  modifier: (scope: string, m: AgModifier) => upsertLater(scope, agnosticModifiers, modifierRow(m), MODIFIER_UPDATE),
  deleteModifier: (scope: string, id: string) => deleteLater(scope, agnosticModifiers, id),
  action: (scope: string, a: AgAction) => upsertLater(scope, agnosticActions, actionRow(a), ACTION_UPDATE),
  deleteAction: (scope: string, id: string) => deleteLater(scope, agnosticActions, id),
  component: (scope: string, c: AgComponentDef) => upsertLater(scope, agnosticComponents, componentRow(c), COMPONENT_UPDATE, { rank: 0 }),
  deleteComponent: (scope: string, id: string) => deleteLater(scope, agnosticComponents, id),
  /** A sheet document's state; a sheet deleted meanwhile just drops it. */
  doc: (name: string, noteId: string, state: string, done: () => void) =>
    upsertLater("docs", agnosticDocs, { name, noteId, state, updatedAt: new Date() }, DOC_UPDATE, { target: "name", retry: false, rank: 2, done }),
  settings: (scope: string, campaignId: string, s: AgCampaignSettings) => {
    const copy = JSON.parse(JSON.stringify(s)) as AgCampaignSettings;
    writeLater(scope, "settings", () => saveSettings(campaignId, copy));
  },
};

export async function saveSettings(campaignId: string, settings: AgCampaignSettings) {
  await db.insert(agnosticSettings).values({ campaignId, settings, updatedAt: new Date() })
    .onConflictDoUpdate({ target: agnosticSettings.campaignId, set: { settings, updatedAt: new Date() } });
}

/** How many rounds of built-in content a scope has already received (deleting a built-in then sticks). */
export async function getSeedLevel(scopeKey: string): Promise<number> {
  const [row] = await db.select({ seedLevel: agnosticScopeMeta.seedLevel }).from(agnosticScopeMeta).where(eq(agnosticScopeMeta.scopeKey, scopeKey));
  return row?.seedLevel ?? 0;
}
/** Markers under a prefix ("kit-upgrade:") whose level is below `below`. */
export async function seedKeysBelow(prefix: string, below: number): Promise<string[]> {
  const rows = await db.select({ scopeKey: agnosticScopeMeta.scopeKey }).from(agnosticScopeMeta)
    .where(and(like(agnosticScopeMeta.scopeKey, `${prefix}%`), lt(agnosticScopeMeta.seedLevel, below)));
  return rows.map((r) => r.scopeKey);
}
export async function setSeedLevel(scopeKey: string, seedLevel: number) {
  await db.insert(agnosticScopeMeta).values({ scopeKey, seedLevel, updatedAt: new Date() })
    .onConflictDoUpdate({ target: agnosticScopeMeta.scopeKey, set: { seedLevel, updatedAt: new Date() } });
}

// --- documents -----------------------------------------------------------------
export async function loadDoc(name: string): Promise<string | null> {
  const [row] = await db.select({ state: agnosticDocs.state }).from(agnosticDocs).where(eq(agnosticDocs.name, name));
  return row?.state ?? null;
}
export async function loadDocs(names: string[]): Promise<Map<string, string>> {
  if (!names.length) return new Map();
  const rows = await db.select({ name: agnosticDocs.name, state: agnosticDocs.state }).from(agnosticDocs).where(inArray(agnosticDocs.name, names));
  return new Map(rows.map((r) => [r.name, r.state]));
}
export async function saveDoc(name: string, noteId: string, state: string) {
  await db.insert(agnosticDocs).values({ name, noteId, state, updatedAt: new Date() })
    .onConflictDoUpdate({ target: agnosticDocs.name, set: { state, updatedAt: new Date() } });
}
export async function deleteDocsOfNote(noteId: string, exceptNames: string[] = []) {
  const rows = await db.select({ name: agnosticDocs.name }).from(agnosticDocs).where(eq(agnosticDocs.noteId, noteId));
  const doomed = rows.map((r) => r.name).filter((n) => !exceptNames.includes(n));
  if (doomed.length) await db.delete(agnosticDocs).where(inArray(agnosticDocs.name, doomed));
}

// --- versions ------------------------------------------------------------------
export async function insertVersion(noteId: string, reason: string, label: string | null, snapshot: AgSnapshot, createdBy: string | null): Promise<AgVersionMeta> {
  // Queued like every other write (it may belong to a sheet that's still on its way).
  const id = randomUUID();
  const createdAt = new Date();
  writeLater("versions", "version", async () => {
    await db.insert(agnosticVersions).values({ id, noteId, reason, label, snapshot, createdBy, createdAt });
    // Keep history bounded: the newest 100 per note.
    const old = await db.select({ id: agnosticVersions.id }).from(agnosticVersions).where(eq(agnosticVersions.noteId, noteId)).orderBy(desc(agnosticVersions.createdAt)).offset(100);
    if (old.length) await db.delete(agnosticVersions).where(inArray(agnosticVersions.id, old.map((o) => o.id)));
  });
  return { id, noteId, reason, label, createdAt: createdAt.getTime(), createdBy };
}
export async function listVersions(noteId: string): Promise<AgVersionMeta[]> {
  await writesSettled();
  const rows = await db.select({ id: agnosticVersions.id, noteId: agnosticVersions.noteId, reason: agnosticVersions.reason, label: agnosticVersions.label, createdAt: agnosticVersions.createdAt, createdBy: agnosticVersions.createdBy })
    .from(agnosticVersions).where(eq(agnosticVersions.noteId, noteId)).orderBy(desc(agnosticVersions.createdAt)).limit(100);
  return rows.map((r) => ({ ...r, createdAt: ms(r.createdAt) }));
}
export async function getVersion(id: string): Promise<{ noteId: string; snapshot: AgSnapshot } | null> {
  await writesSettled();
  const [row] = await db.select().from(agnosticVersions).where(eq(agnosticVersions.id, id));
  return row ? { noteId: row.noteId, snapshot: row.snapshot } : null;
}
export async function latestVersionOfReason(noteId: string, reason: string) {
  await writesSettled();
  const [row] = await db.select().from(agnosticVersions).where(and(eq(agnosticVersions.noteId, noteId), eq(agnosticVersions.reason, reason))).orderBy(desc(agnosticVersions.createdAt)).limit(1);
  return row ?? null;
}

/** A note from any scope (for cross-scope copies, e.g. library → campaign). */
export async function findNoteScope(noteId: string): Promise<AgScope | null> {
  await writesSettled();
  const [row] = await db.select({ scope: agnosticNotes.scope, scopeId: agnosticNotes.scopeId }).from(agnosticNotes).where(eq(agnosticNotes.id, noteId));
  return row ? { kind: row.scope as AgScope["kind"], id: row.scopeId } : null;
}

/** A campaign was deleted: its notes (cascading to fields/docs/versions…) and settings go too. */
export async function deleteAgnosticCampaignData(campaignId: string) {
  await writesSettled();
  await db.delete(agnosticNotes).where(and(eq(agnosticNotes.scope, "campaign"), eq(agnosticNotes.scopeId, campaignId)));
  await db.delete(agnosticComponents).where(and(eq(agnosticComponents.scope, "campaign"), eq(agnosticComponents.scopeId, campaignId)));
  await db.delete(agnosticSettings).where(eq(agnosticSettings.campaignId, campaignId));
  await db.delete(agnosticScopeMeta).where(eq(agnosticScopeMeta.scopeKey, `campaign:${campaignId}`));
}
