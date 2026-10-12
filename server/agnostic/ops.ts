// Agnostic mutation handlers. Every op is validated and permission-checked
// here, on the server — the client hiding a control is never what keeps a
// player from changing something.
import { randomUUID } from "crypto";
import type {
  AgAcl, AgAction, AgActionResult, AgActionStep, AgCampaignSettings, AgComponentDef, AgExportBundle, AgField, AgFieldOptions,
  AgFieldType, AgLayout, AgLink, AgModifier, AgNote, AgScope, AgTokenBar, AgValue, AgViewer,
} from "@shared/agnostic/types";
import { defaultCampaignSettings, isValidKey, slugifyKey } from "@shared/agnostic/types";
import {
  canEditField, canEditNoteHeader, canRunAction, canViewNote, normalizeAcl, normalizeAudience,
} from "@shared/agnostic/acl";
import { FormulaError, interpolate, parseFormula, toFieldValue, asNumber } from "@shared/agnostic/formula";
import { rollDie } from "@shared/agnostic/compute";
import type { AgOp, AgOpResult } from "@shared/agnostic/protocol";
import { getStore, type ChangeSet, type ScopeStore } from "./store";
import { resolveScopeAccess } from "./access";
import * as snap from "./snapshot";
import * as repo from "./repo";

export interface HostHooks {
  /** Remove battlemap tokens that stood for a deleted note. */
  deleteTokensForNote(campaignId: string, noteId: string): Promise<void>;
}

export class OpError extends Error {}
const fail = (msg: string): never => { throw new OpError(msg); };

const FIELD_TYPES: AgFieldType[] = ["number", "text", "boolean", "select", "formula", "dice", "image"];
const MAX_TEXT = 20_000;

function requireGM(viewer: AgViewer) {
  if (!viewer.isGM) fail("Only the GM can do that");
}
function noteOf(store: ScopeStore, id: string): AgNote {
  return store.notes.get(id) ?? fail("That sheet no longer exists");
}
function fieldOf(store: ScopeStore, id: string): AgField {
  return store.fields.get(id) ?? fail("That field no longer exists");
}

function cleanOptions(raw: unknown): AgFieldOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as any;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const out: AgFieldOptions = {};
  if (n(o.min) !== undefined) out.min = o.min;
  if (n(o.max) !== undefined) out.max = o.max;
  if (n(o.step) !== undefined && o.step > 0) out.step = o.step;
  if (n(o.decimals) !== undefined) out.decimals = Math.max(0, Math.min(6, Math.round(o.decimals)));
  if (Array.isArray(o.choices)) out.choices = o.choices.filter((c: unknown) => typeof c === "string").map((c: string) => c.slice(0, 200)).slice(0, 100);
  if (typeof o.color === "string") out.color = o.color.slice(0, 40);
  if (o.resultType === "text" || o.resultType === "number") out.resultType = o.resultType;
  return out;
}

/** Coerce a value to what the field type stores. */
export function coerceValue(f: Pick<AgField, "type" | "options">, raw: AgValue): AgValue {
  switch (f.type) {
    case "number": {
      if (raw === null || raw === "") return null;
      const v = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(v)) fail("That's not a number");
      let x = v as number;
      if (typeof f.options.min === "number") x = Math.max(f.options.min, x);
      if (typeof f.options.max === "number") x = Math.min(f.options.max, x);
      return x;
    }
    case "boolean": return raw === true || raw === "true" || raw === 1;
    case "select": {
      const s = raw === null ? "" : String(raw);
      if (s && f.options.choices && !f.options.choices.includes(s)) fail("Not one of the choices");
      return s;
    }
    case "image": {
      const s = raw === null ? "" : String(raw);
      if (s.length > 4096) fail("Image link is too long — upload the image instead");
      if (s && !/^(https?:\/\/|\/|data:image\/)/.test(s)) fail("Not an image link");
      return s;
    }
    case "text": return raw === null ? "" : String(raw).slice(0, MAX_TEXT);
    default: fail("This field's value is calculated");
  }
  return null;
}

function uniqueKey(store: ScopeStore, noteId: string, wanted: string, exceptId?: string): string {
  let key = isValidKey(wanted) ? wanted : slugifyKey(wanted);
  const taken = (k: string) => { const f = store.fieldsByNote.get(noteId)?.get(k); return !!f && f.id !== exceptId; };
  if (!taken(key)) return key;
  for (let i = 2; i < 1000; i++) if (!taken(`${key}_${i}`)) return `${key}_${i}`;
  return `${key}_${randomUUID().slice(0, 4)}`;
}

function cleanLabel(s: unknown, max = 120) {
  const v = String(s ?? "").trim().slice(0, max);
  return v;
}
const labelKey = (s: unknown) => slugifyKey(String(s ?? "")).slice(0, 40);

function cleanTokenBars(raw: unknown): AgTokenBar[] | null {
  if (raw === null) return null;
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 6).map((b: any) => ({
    id: typeof b?.id === "string" ? b.id.slice(0, 40) : randomUUID().slice(0, 8),
    value: String(b?.value ?? "").slice(0, 200),
    max: b?.max ? String(b.max).slice(0, 200) : undefined,
    color: typeof b?.color === "string" ? b.color.slice(0, 40) : "#16a34a",
    showNumbers: !!b?.showNumbers,
    label: b?.label ? String(b.label).slice(0, 40) : undefined,
  })).filter((b) => b.value);
}

function cleanSteps(raw: unknown): AgActionStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: AgActionStep[] = [];
  for (const s of raw.slice(0, 30)) {
    if (s?.type === "roll") {
      const expr = String(s.expr ?? "").slice(0, 500);
      try { parseFormula(expr); } catch (e) { fail(`Roll "${s.name || "roll"}": ${(e as Error).message}`); }
      steps.push({ type: "roll", name: labelKey(s.name || "r") || "r", expr, label: s.label ? String(s.label).slice(0, 80) : undefined });
    } else if (s?.type === "modify") {
      const value = String(s.value ?? "").slice(0, 500);
      try { parseFormula(value); } catch (e) { fail(`Change value: ${(e as Error).message}`); }
      const op = s.op === "set" || s.op === "add" || s.op === "subtract" ? s.op : "subtract";
      steps.push({ type: "modify", target: String(s.target ?? "").slice(0, 200), op, value });
    } else if (s?.type === "message") {
      steps.push({ type: "message", text: String(s.text ?? "").slice(0, 1000) });
    }
  }
  return steps;
}

function cleanLayout(raw: unknown): AgLayout {
  const l = (raw && typeof raw === "object" ? raw : {}) as any;
  const num = (v: unknown, d: number, lo = -10000, hi = 10000) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    width: num(l.width, 300, 20, 4000),
    height: num(l.height, 120, 20, 4000),
    background: typeof l.background === "string" ? l.background.slice(0, 200) : undefined,
    border: typeof l.border === "string" ? l.border.slice(0, 60) : undefined,
    radius: num(l.radius, 8, 0, 200),
    items: Array.isArray(l.items) ? l.items.slice(0, 200).filter((i: any) => i && typeof i.widget === "object" && typeof i.widget.kind === "string").map((i: any) => ({
      id: typeof i.id === "string" ? i.id.slice(0, 40) : randomUUID().slice(0, 8),
      x: num(i.x, 0), y: num(i.y, 0), w: num(i.w, 40, 2), h: num(i.h, 20, 2), z: num(i.z, 0),
      widget: JSON.parse(JSON.stringify(i.widget).slice(0, 20_000)),
      showTo: i.showTo ? normalizeAudience(i.showTo, false) : undefined,
    })) : [],
  };
}

function cleanSettings(raw: unknown): AgCampaignSettings {
  const d = defaultCampaignSettings();
  const s = (raw && typeof raw === "object" ? raw : {}) as any;
  const t = s.tracker ?? {};
  const strMap = (m: any) => Object.fromEntries(Object.entries(m && typeof m === "object" ? m : {}).filter(([k, v]) => typeof k === "string" && typeof v === "string").slice(0, 500)) as Record<string, string>;
  return {
    tracker: {
      placement: ["top", "left", "right", "bottom"].includes(t.placement) ? t.placement : d.tracker.placement,
      pinned: Array.isArray(t.pinned) ? t.pinned.filter((x: unknown) => typeof x === "string").slice(0, 60) : [],
      cards: Array.isArray(t.cards) && t.cards.length ? t.cards.slice(0, 30).map((c: any) => ({ id: String(c.id ?? randomUUID()).slice(0, 40), name: cleanLabel(c.name, 60) || "Card", layout: cleanLayout(c.layout) })) : d.tracker.cards,
      cardByType: strMap(t.cardByType),
      cardByNote: strMap(t.cardByNote),
      scale: typeof t.scale === "number" ? Math.max(0.4, Math.min(2.5, t.scale)) : 1,
    },
    tokenBarsByType: Object.fromEntries(Object.entries(s.tokenBarsByType && typeof s.tokenBarsByType === "object" ? s.tokenBarsByType : d.tokenBarsByType).slice(0, 50).map(([k, v]) => [k.slice(0, 40), cleanTokenBars(v) ?? []])),
  };
}

function newNote(store: ScopeStore, init: Partial<AgNote>): AgNote {
  const now = Date.now();
  return {
    id: randomUUID(), scope: store.scope.kind, scopeId: store.scope.id, type: "note", isTemplate: false, templateMeta: null,
    templateId: null, templateVersion: null, name: "", portrait: null, ownerIds: [],
    acl: { view: "everyone", edit: "gm" }, bodyAcl: { view: "inherit", edit: "inherit" }, tokenBars: null,
    folder: null, sortOrder: now % 1_000_000_000, docEpoch: 0, createdAt: now, updatedAt: now, ...init,
  };
}

/** Starter fields a blank sheet of a built-in type gets. Templates replace these entirely. */
function starterFields(type: string): Array<Pick<AgField, "key" | "label" | "type" | "value" | "formula">> {
  if (type === "character" || type === "npc") return [
    { key: "hp", label: "HP", type: "number", value: 10, formula: null },
    { key: "hp_max", label: "Max HP", type: "number", value: 10, formula: null },
  ];
  return [];
}

export interface OpContext {
  store: ScopeStore;
  viewer: AgViewer;
  host: HostHooks;
}

export async function runOp(ctx: OpContext, body: AgOp): Promise<AgOpResult> {
  const { store, viewer } = ctx;
  switch (body.op) {
    // ------------------------------------------------------------------ notes
    case "note.create": {
      requireGM(viewer);
      const name = cleanLabel(body.name) || "Untitled";
      const type = labelKey(body.type) || "note";
      return store.run(async (cs) => {
        if (body.templateId) {
          const t = noteOf(store, body.templateId);
          if (!t.isTemplate) fail("That isn't a template");
          const s = await snap.takeSnapshot(store, t.id);
          const n = await snap.createFromSnapshot(store, s, {
            name, folder: body.folder ?? null, portrait: body.portrait ?? null, ownerIds: (body.ownerIds ?? []).slice(0, 50),
          }, cs, { fromTemplateId: t.id });
          return { noteId: n.id };
        }
        const n = newNote(store, {
          type, name, folder: body.folder ?? null, portrait: body.portrait ?? null, ownerIds: (body.ownerIds ?? []).slice(0, 50),
          isTemplate: !!body.isTemplate, templateMeta: body.isTemplate ? { version: 1 } : null,
          // A template's own permissions are what its sheets start with; the
          // template itself is always GM-only (see acl.ts templateGuard).
          acl: { view: "everyone", edit: "gm" },
        });
        await store.putNote(n, cs);
        let order = 0;
        for (const f of starterFields(type)) {
          await store.putField({ id: randomUUID(), noteId: n.id, ...f, options: {}, acl: { view: "inherit", edit: "inherit" }, sortOrder: order++, templateFieldId: null }, cs);
        }
        return { noteId: n.id };
      });
    }
    case "note.update": {
      const n = noteOf(store, body.id);
      const p = body.patch ?? {};
      const headerOnly = Object.keys(p).every((k) => k === "name" || k === "portrait");
      if (headerOnly ? !canEditNoteHeader(n, viewer) : !viewer.isGM) fail("You can't change that");
      return store.run(async (cs) => {
        const note = noteOf(store, body.id);
        let aclChanged = false;
        if (p.name !== undefined) note.name = cleanLabel(p.name) || note.name;
        if (p.portrait !== undefined) {
          const s = p.portrait ? String(p.portrait) : null;
          if (s && (s.length > 4096 || !/^(https?:\/\/|\/|data:image\/)/.test(s))) fail("Upload the image instead of pasting it");
          note.portrait = s;
        }
        if (p.folder !== undefined) note.folder = p.folder ? cleanLabel(p.folder, 80) : null;
        if (p.sortOrder !== undefined && Number.isFinite(p.sortOrder)) note.sortOrder = p.sortOrder;
        if (p.type !== undefined) note.type = labelKey(p.type) || note.type;
        if (p.ownerIds !== undefined) { note.ownerIds = (p.ownerIds ?? []).filter((x) => typeof x === "string").slice(0, 50); aclChanged = true; }
        if (p.acl !== undefined) { note.acl = normalizeAcl(p.acl, true, { view: "everyone", edit: "gm" }); aclChanged = true; }
        if (p.bodyAcl !== undefined) { note.bodyAcl = normalizeAcl(p.bodyAcl, true); aclChanged = true; }
        if (p.tokenBars !== undefined) note.tokenBars = cleanTokenBars(p.tokenBars);
        if (p.templateMeta !== undefined && note.isTemplate) note.templateMeta = { ...note.templateMeta!, description: cleanLabel(p.templateMeta?.description, 500) };
        await store.putNote(note, cs, aclChanged);
        return { ok: true as const };
      });
    }
    case "note.delete": {
      requireGM(viewer);
      return store.run(async (cs) => {
        noteOf(store, body.id);
        await store.removeNote(body.id, cs);
        if (store.scope.kind === "campaign") await ctx.host.deleteTokensForNote(store.scope.id, body.id).catch(() => {});
        return { ok: true as const };
      });
    }
    case "note.duplicate": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const n = noteOf(store, body.id);
        const s = await snap.takeSnapshot(store, n.id);
        const copy = await snap.createFromSnapshot(store, s, { name: `${n.name} (copy)` }, cs);
        return { noteId: copy.id };
      });
    }
    case "note.copyFrom": {
      requireGM(viewer);
      const src = body.sourceScope;
      const srcViewer = await resolveScopeAccess(viewer.userId, src);
      if (!srcViewer?.isGM) fail("You can't copy from there");
      const srcStore = await getStore(src);
      const source = srcStore.notes.get(body.sourceNoteId) ?? fail("That sheet no longer exists");
      const s = await snap.takeSnapshot(srcStore, source.id);
      return store.run(async (cs) => {
        const isTemplate = body.asTemplate ?? source.isTemplate;
        const copy = await snap.createFromSnapshot(store, { ...s, note: { ...s.note, isTemplate, templateMeta: isTemplate ? (s.note.templateMeta ?? { version: 1 }) : null, templateId: null, templateVersion: null, ownerIds: [] } }, {}, cs);
        return { noteId: copy.id };
      });
    }
    case "note.switchTemplate": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const t = body.templateId ? noteOf(store, body.templateId) : null;
        if (t && !t.isTemplate) fail("That isn't a template");
        noteOf(store, body.id);
        const versionId = await snap.switchTemplate(store, body.id, t, viewer.userId, cs);
        return { versionId };
      });
    }

    // ------------------------------------------------------------------ fields
    case "field.create": {
      requireGM(viewer);
      if (!FIELD_TYPES.includes(body.type)) fail("Unknown field type");
      return store.run(async (cs) => {
        const n = noteOf(store, body.noteId);
        const label = cleanLabel(body.label) || "Field";
        const key = uniqueKey(store, n.id, body.key || slugifyKey(label));
        const options = cleanOptions(body.options);
        const f: AgField = {
          id: randomUUID(), noteId: n.id, key, label, type: body.type, value: null,
          formula: body.formula ? String(body.formula).slice(0, 2000) : null, options,
          acl: normalizeAcl(body.acl), sortOrder: store.fieldsOf(n.id).length, templateFieldId: null,
        };
        f.value = body.value !== undefined && body.type !== "formula" && body.type !== "dice"
          ? coerceValue(f, body.value)
          : body.type === "number" ? 0 : body.type === "boolean" ? false : body.type === "formula" || body.type === "dice" ? null : "";
        await store.putField(f, cs);
        return { fieldId: f.id, key: f.key };
      });
    }
    case "field.update": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const f = { ...fieldOf(store, body.id) };
        const p = body.patch ?? {};
        if (p.label !== undefined) f.label = cleanLabel(p.label) || f.label;
        if (p.key !== undefined && p.key !== f.key) f.key = uniqueKey(store, f.noteId, p.key, f.id);
        if (p.type !== undefined) {
          if (!FIELD_TYPES.includes(p.type)) fail("Unknown field type");
          if (p.type !== f.type) {
            f.type = p.type;
            try { f.value = f.type === "formula" || f.type === "dice" ? null : coerceValue(f, f.value); }
            catch { f.value = f.type === "number" ? 0 : f.type === "boolean" ? false : ""; }
          }
        }
        if (p.formula !== undefined) f.formula = p.formula ? String(p.formula).slice(0, 2000) : null;
        if (p.options !== undefined) f.options = cleanOptions(p.options);
        if (p.acl !== undefined) f.acl = normalizeAcl(p.acl);
        if (p.sortOrder !== undefined && Number.isFinite(p.sortOrder)) f.sortOrder = p.sortOrder;
        delete f.eff; delete f.err;
        await store.putField(f, cs);
        return { ok: true as const };
      });
    }
    case "field.set":
    case "field.adjust": {
      const f0 = fieldOf(store, body.id);
      if (!canEditField(f0, noteOf(store, f0.noteId), viewer)) fail("You can't change that value");
      return store.run(async (cs) => {
        const f = { ...fieldOf(store, body.id) };
        if (body.op === "field.adjust") {
          if (f.type !== "number") fail("Only numbers can be adjusted");
          const d = Number(body.delta);
          if (!Number.isFinite(d)) fail("Bad amount");
          f.value = coerceValue(f, asNumber((f.value as number) ?? 0) + d);
        } else {
          f.value = coerceValue(f, body.value);
        }
        delete f.eff; delete f.err;
        await store.putField(f, cs);
        return { ok: true as const };
      });
    }
    case "field.delete": {
      requireGM(viewer);
      return store.run(async (cs) => { await store.removeField(body.id, cs); return { ok: true as const }; });
    }

    // ------------------------------------------------------------------ regions
    case "region.create": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const n = noteOf(store, body.noteId);
        const r = { id: randomUUID(), noteId: n.id, inline: !!body.inline, acl: normalizeAcl(body.acl, true, { view: "gm", edit: "gm" }), label: body.label ? cleanLabel(body.label, 80) : null, templateRegionId: null };
        await store.putRegion(r, cs);
        return { regionId: r.id };
      });
    }
    case "region.update": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const r = store.regions.get(body.id) ?? fail("That block no longer exists");
        const next = { ...r };
        if (body.patch.acl !== undefined) next.acl = normalizeAcl(body.patch.acl);
        if (body.patch.label !== undefined) next.label = body.patch.label ? cleanLabel(body.patch.label, 80) : null;
        await store.putRegion(next, cs);
        cs.aclNotes.add(r.noteId);
        return { ok: true as const };
      });
    }
    case "region.delete": {
      requireGM(viewer);
      return store.run(async (cs) => { await store.removeRegion(body.id, cs); return { ok: true as const }; });
    }

    // ------------------------------------------------------------------ links & modifiers
    case "link.create": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const from = noteOf(store, body.fromNoteId), to = noteOf(store, body.toNoteId);
        if (from.id === to.id) fail("A sheet can't connect to itself");
        const label = labelKey(body.label) || "link", reverseLabel = labelKey(body.reverseLabel) || "linked";
        const dupe = [...Array.from(store.links.values())].find((l) => l.fromNoteId === from.id && l.toNoteId === to.id && l.label === label);
        if (dupe) return { linkId: dupe.id };
        const l: AgLink = { id: randomUUID(), fromNoteId: from.id, toNoteId: to.id, label, reverseLabel, acl: normalizeAcl(body.acl), createdAt: Date.now() };
        await store.putLink(l, cs);
        return { linkId: l.id };
      });
    }
    case "link.update": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const l = { ...(store.links.get(body.id) ?? fail("That connection no longer exists")) };
        if (body.patch.label !== undefined) l.label = labelKey(body.patch.label) || l.label;
        if (body.patch.reverseLabel !== undefined) l.reverseLabel = labelKey(body.patch.reverseLabel) || l.reverseLabel;
        if (body.patch.acl !== undefined) l.acl = normalizeAcl(body.patch.acl);
        await store.putLink(l, cs);
        return { ok: true as const };
      });
    }
    case "link.delete": {
      requireGM(viewer);
      return store.run(async (cs) => { await store.removeLink(body.id, cs); return { ok: true as const }; });
    }
    case "modifier.upsert": {
      requireGM(viewer);
      const m = body.modifier;
      for (const [what, expr] of [["Amount", m.amount], ["Condition", m.condition]] as const) {
        if (expr) { try { parseFormula(expr); } catch (e) { fail(`${what}: ${(e as Error).message}`); } }
      }
      return store.run(async (cs) => {
        noteOf(store, m.noteId);
        const mod: AgModifier = {
          id: m.id && store.modifiers.has(m.id) ? m.id : randomUUID(), noteId: m.noteId,
          via: labelKey(m.via) || "self", targetKey: labelKey(m.targetKey), op: m.op === "multiply" ? "multiply" : "add",
          amount: String(m.amount ?? "0").slice(0, 500), condition: m.condition ? String(m.condition).slice(0, 500) : null,
          label: m.label ? cleanLabel(m.label, 80) : null,
        };
        if (!mod.targetKey) fail("Pick the value to change");
        await store.putModifier(mod, cs);
        return { modifierId: mod.id };
      });
    }
    case "modifier.delete": {
      requireGM(viewer);
      return store.run(async (cs) => { await store.removeModifier(body.id, cs); return { ok: true as const }; });
    }

    // ------------------------------------------------------------------ actions
    case "action.upsert": {
      requireGM(viewer);
      const a = body.action;
      const steps = cleanSteps(a.steps);
      return store.run(async (cs) => {
        noteOf(store, a.noteId);
        // An id is only reused when it belongs to THIS scope — never another campaign's row.
        const existing = a.id ? store.actions.get(a.id) : undefined;
        const action: AgAction = {
          id: existing?.id ?? randomUUID(), noteId: a.noteId, name: cleanLabel(a.name, 80) || "Action", steps,
          acl: a.acl ? normalizeAcl(a.acl) : existing?.acl ?? { view: "inherit", edit: "owners" },
          color: a.color ? String(a.color).slice(0, 40) : existing?.color ?? null,
        };
        await store.putAction(action, cs);
        return { actionId: action.id };
      });
    }
    case "action.delete": {
      requireGM(viewer);
      return store.run(async (cs) => { await store.removeAction(body.id, cs); return { ok: true as const }; });
    }
    case "action.run": {
      const action = store.actions.get(body.id) ?? fail("That button no longer works — its action was deleted");
      const note = noteOf(store, action.noteId);
      if (!canRunAction(action, note, viewer)) fail("You can't use that");
      const targets = (body.targetNoteIds ?? []).filter((id) => store.notes.has(id)).slice(0, 20);
      return store.run(async (cs) => {
        const result = await executeAction(store, action, targets, cs);
        return { result, noteName: note.name };
      });
    }

    // ------------------------------------------------------------------ settings & components
    case "settings.update": {
      requireGM(viewer);
      if (store.scope.kind !== "campaign") fail("Settings belong to a campaign");
      return store.run(async (cs) => { await store.putSettings(cleanSettings(body.settings), cs); return { ok: true as const }; });
    }
    case "component.upsert": {
      requireGM(viewer);
      const c = body.component;
      return store.run(async (cs) => {
        const comp: AgComponentDef = {
          id: c.id && store.components.has(c.id) ? c.id : randomUUID(), scope: store.scope.kind, scopeId: store.scope.id,
          name: cleanLabel(c.name, 80) || "Component",
          params: (Array.isArray(c.params) ? c.params : []).map(labelKey).filter(Boolean).slice(0, 30),
          layout: cleanLayout(c.layout), updatedAt: Date.now(),
        };
        await store.putComponent(comp, cs);
        return { componentId: comp.id };
      });
    }
    case "component.delete": {
      requireGM(viewer);
      return store.run(async (cs) => { await store.removeComponent(body.id, cs); return { ok: true as const }; });
    }

    // ------------------------------------------------------------------ templates & versions
    case "template.saveVersion": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const t = noteOf(store, body.id);
        if (!t.isTemplate) fail("That isn't a template");
        const version = (t.templateMeta?.version ?? 1) + 1;
        t.templateMeta = { ...t.templateMeta, version, savedAt: Date.now() };
        await store.putNote(t, cs);
        const v = await snap.recordVersion(store, t.id, "template-version", `v${version}${body.label ? ` — ${cleanLabel(body.label, 80)}` : ""}`, viewer.userId);
        return { versionId: v.id, version };
      });
    }
    case "template.apply": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const t = noteOf(store, body.templateId);
        if (!t.isTemplate) fail("That isn't a template");
        const ids = body.noteIds.filter((id) => store.notes.get(id)?.templateId === t.id).slice(0, 500);
        for (const id of ids) await snap.applyTemplate(store, t, id, body.mode === "full" ? "full" : "fields", !!body.removeMissing, viewer.userId, cs);
        return { applied: ids.length };
      });
    }
    case "version.list": {
      requireGM(viewer);
      noteOf(store, body.noteId);
      return { versions: await repo.listVersions(body.noteId) };
    }
    case "version.create": {
      requireGM(viewer);
      noteOf(store, body.noteId);
      const v = await snap.recordVersion(store, body.noteId, "manual", body.label ? cleanLabel(body.label, 80) : null, viewer.userId);
      return { versionId: v.id };
    }
    case "version.restore": {
      requireGM(viewer);
      const v = await repo.getVersion(body.versionId) ?? fail("That version no longer exists");
      noteOf(store, v.noteId);
      return store.run(async (cs) => {
        const before = await snap.recordVersion(store, v.noteId, "before-restore", "Before restoring an older version", viewer.userId);
        await snap.restoreSnapshot(store, v.noteId, v.snapshot, cs);
        return { versionId: before.id };
      });
    }

    // ------------------------------------------------------------------ import / export
    case "export": {
      requireGM(viewer);
      const templates = [];
      for (const id of body.templateIds.slice(0, 200)) {
        const n = store.notes.get(id);
        if (!n?.isTemplate) continue;
        templates.push(snap.sanitizeForExport(await snap.takeSnapshot(store, id), !!body.includeGmText));
      }
      const components = body.componentIds.map((id) => store.components.get(id)).filter(Boolean).map((c) => ({ name: c!.name, params: c!.params, layout: c!.layout }));
      const bundle: AgExportBundle = {
        format: "arcana-agnostic", version: 1, exportedAt: Date.now(), templates, components,
        trackerCards: body.includeTracker && store.settings ? store.settings.tracker.cards : undefined,
      };
      return { bundle };
    }
    case "import": {
      requireGM(viewer);
      const b = body.bundle;
      if (!b || b.format !== "arcana-agnostic" || b.version !== 1) fail("That isn't an Arcana Agnostic export");
      return store.run(async (cs) => {
        let templates = 0, components = 0;
        for (const t of (b.templates ?? []).slice(0, 200)) {
          if (!t?.note) continue;
          const s = {
            note: { ...t.note, isTemplate: true, templateMeta: { version: 1, description: t.note.templateMeta?.description }, ownerIds: [], templateId: null, templateVersion: null, name: cleanLabel(t.note.name) || "Imported template" },
            fields: (t.fields ?? []).map((f) => ({ ...f, options: cleanOptions(f.options), acl: normalizeAcl(f.acl) })),
            regions: (t.regions ?? []).map((r) => ({ ...r, acl: normalizeAcl(r.acl) })),
            actions: (t.actions ?? []).map((a) => ({ ...a, steps: cleanSteps(a.steps), acl: normalizeAcl(a.acl) })),
            modifiers: t.modifiers ?? [],
            docs: Object.fromEntries(Object.entries(t.docs ?? {}).filter(([, v]) => typeof v === "string" && v.length < 5_000_000)),
          };
          s.note.acl = normalizeAcl(s.note.acl, true, { view: "everyone", edit: "gm" });
          s.note.bodyAcl = normalizeAcl(s.note.bodyAcl);
          await snap.createFromSnapshot(store, s as any, {}, cs);
          templates++;
        }
        for (const c of (b.components ?? []).slice(0, 200)) {
          await store.putComponent({ id: randomUUID(), scope: store.scope.kind, scopeId: store.scope.id, name: cleanLabel(c.name, 80) || "Component", params: (c.params ?? []).map(labelKey).filter(Boolean), layout: cleanLayout(c.layout), updatedAt: Date.now() }, cs);
          components++;
        }
        if (b.trackerCards?.length && store.settings) {
          const next = cleanSettings({ ...store.settings, tracker: { ...store.settings.tracker, cards: [...store.settings.tracker.cards, ...b.trackerCards.map((c) => ({ ...c, id: randomUUID().slice(0, 8) }))] } });
          await store.putSettings(next, cs);
        }
        return { templates, components };
      });
    }
    case "eval": {
      requireGM(viewer);
      noteOf(store, body.noteId);
      try {
        const r = store.computer().evalIn(body.noteId, body.expr);
        const v = r.value;
        return { value: Array.isArray(v) ? (v.flat(5) as AgValue[]) : (v as AgValue) };
      } catch (e) {
        return { value: null, error: e instanceof FormulaError ? e.message : String(e) };
      }
    }
  }
  fail("Unknown operation");
  return { ok: true };
}

/** Run an action's steps with the GM-authored authority of the action itself. */
async function executeAction(store: ScopeStore, action: AgAction, targetNoteIds: string[], cs: ChangeSet): Promise<AgActionResult> {
  const result: AgActionResult = { rolls: [], changes: [], messages: [] };
  const locals: Record<string, any> = {};
  const roots = { target: targetNoteIds, targets: targetNoteIds };
  for (const step of action.steps) {
    const comp = store.computer();
    if (step.type === "roll") {
      try {
        const r = comp.evalIn(action.noteId, step.expr, { rollDie, locals, roots });
        const total = asNumber(r.value as any);
        locals[step.name] = total;
        result.rolls.push({ name: step.name, label: step.label || action.name, expr: step.expr, total, breakdown: `${r.breakdown} = ${Math.round(total * 100) / 100}` });
      } catch (e) {
        result.messages.push(`⚠ ${step.label || step.name}: ${(e as Error).message}`);
      }
    } else if (step.type === "modify") {
      try {
        const ref = parseFormula(step.target);
        if (ref.t !== "ref") fail("Change target must be a field");
        const { noteIds, key } = comp.targetsOf(action.noteId, (ref as any).path, (ref as any).abs, roots);
        const amount = asNumber(comp.evalIn(action.noteId, step.value, { locals, roots }).value as any);
        for (const nid of noteIds) {
          const f = store.fieldsByNote.get(nid)?.get(key);
          if (!f || f.type === "formula" || f.type === "dice") { result.messages.push(`⚠ ${store.notes.get(nid)?.name ?? "Sheet"} has no "${key}" value to change`); continue; }
          const from = f.value;
          const base = asNumber((from as any) ?? 0);
          const to = coerceValue(f, step.op === "set" ? amount : step.op === "add" ? base + amount : base - amount);
          await store.putField({ ...f, value: to }, cs);
          result.changes.push({ noteId: nid, key, from, to });
        }
      } catch (e) {
        result.messages.push(`⚠ ${(e as Error).message}`);
      }
    } else if (step.type === "message") {
      result.messages.push(interpolate(step.text, (expr) => store.computer().evalIn(action.noteId, expr, { locals, roots }).value));
    }
  }
  return result;
}

export { toFieldValue };
