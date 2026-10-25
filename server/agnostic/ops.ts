// Agnostic mutation handlers. Every op is validated and permission-checked
// here, on the server — the client hiding a control is never what keeps a
// player from changing something.
import { randomUUID } from "crypto";
import type {
  AgAcl, AgAction, AgActionChoice, AgActionOptions, AgActionResult, AgActionStep, AgCampaignSettings, AgRollMods, AgRollSpec, AgComponentDef, AgExportBundle, AgField, AgFieldOptions,
  AgFieldType, AgLayout, AgLink, AgLook, AgModifier, AgNote, AgScope, AgTokenBar, AgValue, AgViewer,
} from "@shared/agnostic/types";
import { defaultCampaignSettings, isValidKey, slugifyKey, noteDocName, regionDocName, scaleCost } from "@shared/agnostic/types";
import {
  canEditBody, canEditField, canEditNoteHeader, canRunAction, canViewNote, normalizeAcl, normalizeAudience,
} from "@shared/agnostic/acl";
import { FormulaError, interpolate, parseFormula, toFieldValue, asNumber, isTruthy } from "@shared/agnostic/formula";
import { rollDie } from "@shared/agnostic/compute";
import type { AgOp, AgOpResult } from "@shared/agnostic/protocol";
import { getStore, type ChangeSet, type ScopeStore } from "./store";
import { resolveScopeAccess } from "./access";
import * as snap from "./snapshot";
import * as docs from "./docs";
import { copySheet, markAsCopy, syncCopyOwners, syncCopiesOn } from "./copies";
import { applyCAKit } from "./kits/ca";
import { runCraftOp, CraftError, syncScrolls } from "./crafting";
import { systemOfScope } from "./systemSeed";
import * as repo from "./repo";

export interface HostHooks {
  /** Remove battlemap tokens that stood for a deleted note. */
  deleteTokensForNote(campaignId: string, noteId: string): Promise<void>;
  /** Save a pasted / library image (a data: URL) as a file and return its link. */
  saveImage?(dataUrl: string): Promise<string>;
  /** A sheet's picture changed: its battlemap tokens show the new one for everyone. */
  refreshNoteTokens?(campaignId: string, noteId: string, portrait: string | null): Promise<void>;
  /** Put a sheet into the campaign's initiative order (or update its place). */
  joinInitiative?(campaignId: string, sheet: { noteId: string; name: string; portrait: string | null }, value: number): Promise<void>;
  /** A line in the campaign's chat — for everyone, or only the GMs (who can act on it there). */
  postChat?(campaignId: string, msg: { sender: string; text: string; audience: "everyone" | "gm" }): Promise<void>;
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
  if (o.choiceColors && typeof o.choiceColors === "object") {
    const cc: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.choiceColors).slice(0, 100)) if (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v)) cc[String(k).slice(0, 200)] = v;
    if (Object.keys(cc).length) out.choiceColors = cc;
  }
  if (typeof o.tooltip === "string" && o.tooltip.trim()) out.tooltip = o.tooltip.slice(0, 8000);
  if (typeof o.follows === "string" && isValidKey(o.follows)) out.follows = o.follows;
  if (typeof o.shield === "string" && isValidKey(o.shield)) out.shield = o.shield;
  if (o.isColor === true) out.isColor = true;
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
/** A connection label or a path of them ("ability.holder"). */
const pathKey = (s: unknown) => String(s ?? "").split(".").map((seg) => { const m = /[*+]$/.exec(seg.trim()); const k = labelKey(seg.trim().replace(/[*+]$/, "")); return k && m ? `${k}${m[0]}` : k; }).filter(Boolean).slice(0, 4).join(".");

/** Presentation only — but still bounded: short strings, finite numbers, known keys. */
function cleanLook(raw: unknown): AgLook | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (!/^[a-zA-Z]{1,20}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(-5000, Math.min(5000, v));
    else if (typeof v === "string") out[k] = v.slice(0, k === "tooltip" ? 8000 : 60);
    else if (typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length ? (out as AgLook) : undefined;
}

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
    look: cleanLook(b?.look),
  })).filter((b) => b.value);
}

function cleanSteps(raw: unknown): AgActionStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: AgActionStep[] = [];
  const formula = (v: unknown, what: string) => {
    const t = String(v ?? "").slice(0, 500);
    if (t.trim()) { try { parseFormula(t); } catch (e) { fail(`${what}: ${(e as Error).message}`); } }
    return t.trim() || undefined;
  };
  for (const s of raw.slice(0, 30)) {
    const when = formula(s?.when, "“Only if”");
    const before = steps.length;
    if (s?.type === "choose") {
      steps.push({ type: "choose", name: labelKey(s.name || "pick") || "pick", from: String(s.from ?? "").slice(0, 200), filter: formula(s.filter, "Choose filter"), prompt: s.prompt ? String(s.prompt).slice(0, 120) : undefined });
    } else if (s?.type === "remove") {
      steps.push({ type: "remove", target: labelKey(s.target || "self") || "self" });
    } else if (s?.type === "roll") {
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
    } else if (s?.type === "stop") {
      steps.push({ type: "stop" });
    } else if (s?.type === "initiative") {
      const expr = String(s.expr ?? "").slice(0, 500) || "1d20";
      try { parseFormula(expr); } catch (e) { fail(`Initiative: ${(e as Error).message}`); }
      steps.push({ type: "initiative", expr, label: s.label ? String(s.label).slice(0, 80) : undefined });
    }
    if (when && steps.length > before) steps[steps.length - 1].when = when;
  }
  return steps;
}

/** A button's look and its simple roll, bounded and checked like everything else. */
function cleanActionOptions(raw: unknown): AgActionOptions | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as any;
  const out: AgActionOptions = {};
  const formula = (v: unknown, what: string, d: string) => {
    const t = String(v ?? "").slice(0, 500).trim() || d;
    try { parseFormula(t); } catch (e) { fail(`${what}: ${(e as Error).message}`); }
    return t;
  };
  if (o.roll && typeof o.roll === "object") {
    const r = o.roll;
    out.roll = {
      via: pathKey(r.via ?? "") || "",
      count: formula(r.count, "Dice", "1"),
      die: formula(r.die, "Die", "20"),
      add: typeof r.add === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(r.add) ? r.add : "",
      bonus: formula(r.bonus, "Bonus", "0"),
      costs: (Array.isArray(r.costs) ? r.costs : []).slice(0, 8)
        .filter((c: any) => c && typeof c.key === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(c.key))
        .map((c: any) => ({ key: c.key, amount: formula(c.amount, "Cost", "0") })),
      ...(r.scale && typeof r.scale === "object" && typeof r.scale.pay === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(r.scale.pay)
        ? { scale: { step: formula(r.scale.step, "Damage Die step", "20"), pay: r.scale.pay } } : {}),
      ...(r.uses && typeof r.uses === "object" && typeof r.uses.list === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(r.uses.list)
        ? { uses: { list: r.uses.list, match: typeof r.uses.match === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(r.uses.match) ? r.uses.match : "", qty: formula(r.uses.qty, "Uses", "1") } } : {}),
    };
  }
  if (typeof o.icon === "string" && o.icon.trim()) out.icon = o.icon.trim().slice(0, 120);
  if (typeof o.showName === "boolean") out.showName = o.showName;
  if (typeof o.showIcon === "boolean") out.showIcon = o.showIcon;
  if (typeof o.listed === "boolean") out.listed = o.listed;
  if (typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder)) out.sortOrder = o.sortOrder;
  return Object.keys(out).length ? out : undefined;
}

/** The sheets a "choose" step offers: its connection path, filtered, and only ones this viewer can see. */
function chooseOptions(store: ScopeStore, action: AgAction, step: Extract<AgActionStep, { type: "choose" }>, roots: Record<string, string[]>, viewer: AgViewer, locals: Record<string, any> = {}): string[] {
  const comp = store.computer();
  const path = step.from.replace(/^@/, "").toLowerCase().split(".").filter(Boolean);
  if (!path.length) return [];
  const { noteIds } = comp.targetsOf(action.noteId, [...path, "_"], undefined, roots);
  return noteIds.filter((id) => {
    const n = store.notes.get(id);
    if (!n || !canViewNote(n, viewer)) return false;
    if (!step.filter) return true;
    try { return isTruthy(comp.evalIn(id, step.filter, { locals, roots }).value as any); } catch { return false; }
  });
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
      diceTray: t.diceTray !== false,
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

/** A copy no one has changed: the same values as its original (how many, and whether it's equipped, aside), the same
 *  picture, and nothing attached to it (no runes) — so more of it can simply join its stack. */
const STACK_NEUTRAL = new Set(["qty", "equipped"]);
function sameAsOriginal(store: ScopeStore, copy: AgNote, original: AgNote, holderId: string): boolean {
  if (copy.name !== original.name || (copy.portrait ?? null) !== (original.portrait ?? null)) return false;
  if (store.linksOf(copy.id).some((l) => !(l.fromNoteId === copy.id && l.toNoteId === holderId))) return false;
  const a = store.fieldsByNote.get(copy.id) ?? new Map(), b = store.fieldsByNote.get(original.id) ?? new Map();
  const keys = new Set([...Array.from(a.keys()), ...Array.from(b.keys())]);
  for (const k of Array.from(keys)) {
    if (STACK_NEUTRAL.has(k)) continue;
    const x = a.get(k), y = b.get(k);
    if (!x || !y || JSON.stringify(x.value ?? null) !== JSON.stringify(y.value ?? null) || (x.formula ?? null) !== (y.formula ?? null)) return false;
  }
  return true;
}

export async function runOp(ctx: OpContext, body: AgOp): Promise<AgOpResult> {
  const { store, viewer } = ctx;
  switch (body.op) {
    // ------------------------------------------------------------------ notes
    case "note.create": {
      requireGM(viewer);
      const name = cleanLabel(body.name) || "Untitled";
      const hiddenByDefault = (await systemOfScope(store.scope).catch(() => null)) === "ca-agnostic";
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
          // CA Agnostic: nothing is visible to players until the GM shares it.
          acl: { view: hiddenByDefault ? "owners" : "everyone", edit: "gm" },
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
          const s = p.portrait ? await storedImage(ctx.host, String(p.portrait)) : null;
          if (s && (s.length > 4096 || !/^(https?:\/\/|\/|data:image\/)/.test(s))) fail("Upload the image instead of pasting it");
          const changed = note.portrait !== s;
          note.portrait = s;
          if (changed && store.scope.kind === "campaign") void ctx.host.refreshNoteTokens?.(store.scope.id, note.id, s).catch(() => {});
        }
        if (p.folder !== undefined) note.folder = p.folder ? cleanLabel(p.folder, 80) : null;
        if (p.sortOrder !== undefined && Number.isFinite(p.sortOrder)) note.sortOrder = p.sortOrder;
        if (p.type !== undefined) note.type = labelKey(p.type) || note.type;
        if (p.ownerIds !== undefined) { note.ownerIds = (p.ownerIds ?? []).filter((x) => typeof x === "string").slice(0, 50); aclChanged = true; }
        if (p.acl !== undefined) { note.acl = normalizeAcl(p.acl, true, { view: "everyone", edit: "gm" }); aclChanged = true; }
        if (p.bodyAcl !== undefined) { note.bodyAcl = normalizeAcl(p.bodyAcl, true); aclChanged = true; }
        if (p.tokenBars !== undefined) note.tokenBars = cleanTokenBars(p.tokenBars);
        if (p.templateMeta !== undefined && note.isTemplate) {
          note.templateMeta = {
            ...note.templateMeta!,
            ...(p.templateMeta?.description !== undefined ? { description: cleanLabel(p.templateMeta?.description, 500) } : {}),
            ...(p.templateMeta?.playersCanCreate !== undefined ? { playersCanCreate: !!p.templateMeta.playersCanCreate } : {}),
          };
        }
        // A template's window size is every sheet made from it's (for everyone).
        let sizeFollowers: AgNote[] = [];
        if (p.windowSize !== undefined) {
          const w = Number((p.windowSize as any)?.width), h = Number((p.windowSize as any)?.height);
          note.windowSize = p.windowSize && Number.isFinite(w) && Number.isFinite(h) ? { width: Math.round(Math.max(320, Math.min(2400, w))), height: Math.round(Math.max(260, Math.min(2000, h))) } : null;
          if (note.isTemplate) sizeFollowers = Array.from(store.notes.values()).filter((x) => x.templateId === note.id);
        }
        await store.putNote(note, cs, aclChanged);
        for (const x of sizeFollowers) await store.putNote({ ...x, windowSize: note.windowSize ?? null }, cs);
        // Its own copies (items given to it…) are seen by whoever has it.
        if (p.ownerIds !== undefined) { await syncCopiesOn(store, note.id, cs); await syncCopyOwners(store, note.id, cs); }
        return { ok: true as const };
      });
    }
    case "note.delete": {
      requireGM(viewer);
      return store.run(async (cs) => {
        noteOf(store, body.id);
        const attached = store.linksOf(body.id).filter((l) => l.toNoteId === body.id).map((l) => l.fromNoteId);
        await store.removeNote(body.id, cs);
        for (const id of attached) await syncCopyOwners(store, id, cs);
        if (store.scope.kind === "campaign") void ctx.host.deleteTokensForNote(store.scope.id, body.id).catch(() => {}); // map tokens follow; nobody waits on it
        return { ok: true as const };
      });
    }
    case "note.duplicate": {
      requireGM(viewer);
      return store.run(async (cs) => {
        const n = noteOf(store, body.id);
        if (n.copyOf) {
          // Duplicating someone's copy gives a normal sheet (with what's inside it, e.g. an
          // ability's aspects): the GM's, kept where its original is (or with its kind).
          const original = store.notes.get(n.copyOf);
          const folder = original && !original.isTemplate && !original.copyOf ? original.folder : null;
          const dup = await copySheet(store, n.id, cs, { folder, ownerIds: [], asOriginal: true });
          return { noteId: dup.id };
        }
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
        const componentIds = srcStore === store ? undefined : await snap.carryComponents(srcStore, store, s, cs);
        const copy = await snap.createFromSnapshot(store, { ...s, note: { ...s.note, isTemplate, templateMeta: isTemplate ? (s.note.templateMeta ?? { version: 1 }) : null, templateId: null, templateVersion: null, ownerIds: [] } }, {}, cs, { componentIds });
        return { noteId: copy.id };
      });
    }
    case "kit.apply": {
      requireGM(viewer);
      if (body.kit !== "ca") fail("Unknown kit");
      return store.run(async (cs) => {
        try { return await applyCAKit(store, cs, { examples: body.examples !== false }); }
        catch (e) { return fail((e as Error).message); }
      });
    }
    case "note.creatableTemplates": {
      const types = (body.types ?? []).map(labelKey).filter(Boolean);
      const list = Array.from(store.notes.values())
        .filter((n) => n.isTemplate && (!types.length || types.includes(n.type)) && (viewer.isGM || n.templateMeta?.playersCanCreate))
        .map((n) => ({ id: n.id, name: n.name, type: n.type, portrait: n.portrait, description: n.templateMeta?.description ?? null }));
      return { templates: list };
    }
    case "note.createLinked": {
      const host = noteOf(store, body.hostNoteId);
      const listCfg = (await listsOnSheet(store, host)).find((l) => l.label === labelKey(body.label))?.config;
      // A list that only takes existing sheets (a character's items: they're added, not made there).
      if (listCfg?.add?.createNew === false) fail("Nothing new can be made here — add one from the sidebar (drag it here, or Add → pick it)");
      const template = body.templateId ? noteOf(store, body.templateId) : null;
      if (template && !template.isTemplate) fail("That isn't a template");
      if (!viewer.isGM) {
        // Players: only from templates the GM opened up, only onto sheets they can edit.
        if (!template?.templateMeta?.playersCanCreate) fail("Only the GM can add that");
        if (!canEditBody(host, viewer) && !host.ownerIds.includes(viewer.userId)) fail("You can't add to that sheet");
      }
      const label = labelKey(body.label) || "linked", reverse = labelKey(body.reverseLabel) || "link";
      return store.run(async (cs) => {
        let n: AgNote;
        const init = { name: cleanLabel(body.name) || template?.name || "New", ownerIds: [...host.ownerIds], folder: null, portrait: template?.portrait ?? null };
        if (template) {
          const s = await snap.takeSnapshot(store, template.id);
          n = await snap.createFromSnapshot(store, s, init, cs, { fromTemplateId: template.id });
        } else {
          n = newNote(store, { ...init, type: labelKey(body.type) || "note" });
          await store.putNote(n, cs);
        }
        await store.putLink({ id: randomUUID(), fromNoteId: n.id, toNoteId: host.id, label: reverse, reverseLabel: label, acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
        // A list that gives copies: what's made in it is this sheet's own, kept with the other copies.
        if (listCfg?.add?.copy) {
          // The host's players use it; the GM decides who owns (can change) it.
          await markAsCopy(store, n.id, cs, copyFolderOf(listCfg));
          await store.putNote({ ...store.notes.get(n.id)!, ownerIds: [] }, cs, true);
          await syncCopyOwners(store, n.id, cs);
        }
        return { noteId: n.id };
      });
    }
    case "note.attach": {
      const host = noteOf(store, body.hostNoteId);
      const n = noteOf(store, body.noteId);
      if (host.id === n.id) fail("A sheet can't go onto itself");
      // Nor inside something that's inside it (an ability into one of its own sub-abilities).
      const inside = (id: string, seen = new Set<string>()): boolean => store.linksOf(id).some((l) => l.toNoteId === id && !seen.has(l.fromNoteId) && (seen.add(l.fromNoteId), l.fromNoteId === host.id || inside(l.fromNoteId, seen)));
      if (inside(n.id)) fail(`${host.name || "That sheet"} is inside ${n.name || "it"} — it can't also hold it`);
      if (n.isTemplate) fail("Drag a sheet, not a template — make one from it first");
      const fromHost = body.fromNoteId && body.fromNoteId !== host.id ? store.notes.get(body.fromNoteId) : undefined;
      // The GM, or a player putting their own sheet onto their own character (moving it off one of theirs).
      if (!viewer.isGM && !(n.ownerIds.includes(viewer.userId) && host.ownerIds.includes(viewer.userId) && (!fromHost || fromHost.ownerIds.includes(viewer.userId)))) fail("Only the GM can do that");
      // The host's lists say where that kind of sheet goes (its page, and its sections) — the
      // one named when picked from a list's Add, else the one that takes this kind of sheet.
      const lists = await listsOnSheet(store, host);
      const wanted = body.label ? labelKey(body.label) : "";
      const list = wanted ? lists.find((l) => l.label === wanted) ?? (viewer.isGM && body.reverseLabel ? { label: wanted, config: { add: { reverse: body.reverseLabel } } } : undefined)
        : lists.find((l) => !l.label.includes(".") && Array.isArray(l.config?.add?.types) && l.config.add.types.includes(n.type));
      if (!list) fail(`${host.name || "That sheet"} has no list for ${n.type} sheets`);
      const label = labelKey(list!.label), reverse = labelKey(list!.config?.add?.reverse) || "owner";
      const copies = !!list!.config?.add?.copy;
      return store.run(async (cs) => {
        const already = store.linksOf(n.id).some((l) => (l.fromNoteId === n.id && l.toNoteId === host.id && l.label === reverse) || (l.toNoteId === n.id && l.fromNoteId === host.id && l.label === label));
        if (already) return { ok: true as const, label, already: true };
        let item = n;
        let how: "linked" | "copied" | "moved" = "linked";
        if (fromHost) {
          // Dragged from one sheet to another: off that one, onto this one (no new copy).
          const off = store.linksOf(n.id).filter((l) => (l.fromNoteId === n.id && l.toNoteId === fromHost.id) || (l.toNoteId === n.id && l.fromNoteId === fromHost.id));
          for (const l of off) await store.removeLink(l.id, cs);
          how = "moved";
        } else if (n.copyOf) {
          // Someone's copy: it moves here (off the sheets it was on, in this kind of list).
          const from = store.linksOf(n.id).filter((l) => l.fromNoteId === n.id && l.label === reverse && l.toNoteId !== host.id);
          for (const l of from) await store.removeLink(l.id, cs);
          how = from.length ? "moved" : "linked";
        } else if (copies) {
          const qty = body.qty !== undefined ? Math.max(1, Math.min(1_000_000, Math.round(Number(body.qty) || 1))) : 1;
          // Already holding an unchanged copy of it: that stack just grows.
          const stack = store.linksOf(host.id).filter((l) => l.toNoteId === host.id && l.label === reverse).map((l) => store.notes.get(l.fromNoteId))
            .find((x): x is AgNote => !!x && x.copyOf === n.id && sameAsOriginal(store, x, n, host.id));
          const qf = stack ? store.fieldsByNote.get(stack.id)?.get("qty") : undefined;
          if (stack && qf) {
            const now = (typeof qf.value === "number" ? qf.value : 1) + qty;
            await store.putField({ ...qf, value: now }, cs);
            return { ok: true as const, label, how: "stacked" as const, noteId: stack.id, qty: now };
          }
          // An original: this sheet gets its own copy; the original stays as it was.
          item = await copySheet(store, n.id, cs, { folder: copyFolderOf(list!.config), ownerIds: [] });
          how = "copied";
          const q = store.fieldsByNote.get(item.id)?.get("qty");
          if (q && body.qty !== undefined) await store.putField({ ...q, value: qty }, cs);
        }
        await store.putLink({ id: randomUUID(), fromNoteId: item.id, toNoteId: host.id, label: reverse, reverseLabel: label, acl: { view: "inherit", edit: "inherit" }, createdAt: Date.now() }, cs);
        await syncCopyOwners(store, item.id, cs);
        return { ok: true as const, label, how, noteId: item.id };
      });
    }
    case "note.removeLinked": {
      const host = noteOf(store, body.hostNoteId);
      const n = noteOf(store, body.noteId);
      if (!viewer.isGM) {
        const t = n.templateId ? store.notes.get(n.templateId) : undefined;
        if (!t?.templateMeta?.playersCanCreate || !n.ownerIds.includes(viewer.userId)) fail("Only the GM can remove that");
        if (!canEditBody(host, viewer) && !host.ownerIds.includes(viewer.userId)) fail("You can't change that sheet");
      }
      return store.run(async (cs) => {
        const links = store.linksOf(n.id).filter((l) => l.fromNoteId === host.id || l.toNoteId === host.id);
        if (body.mode === "delete") {
          await store.removeNote(n.id, cs);
          if (store.scope.kind === "campaign") void ctx.host.deleteTokensForNote(store.scope.id, n.id).catch(() => {});
        } else {
          for (const l of links) await store.removeLink(l.id, cs);
          // A copy taken off stays (with its notes) among the copies, for the GM to give again.
          await syncCopyOwners(store, n.id, cs);
        }
        return { ok: true as const };
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
          f.value = capToMax(store, f, coerceValue(f, asNumber((f.value as number) ?? 0) + await absorb(store, f, d, cs)));
        } else {
          const raw = f.type === "image" && typeof body.value === "string" ? await storedImage(ctx.host, body.value) : body.value;
          f.value = capToMax(store, f, coerceValue(f, raw));
        }
        delete f.eff; delete f.err;
        await store.putField(f, cs);
        // A recipe's setup: the scrolls that teach it follow, live.
        if (f.key === "craft") await syncScrolls(store, f.noteId, cs);
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
        await syncCopyOwners(store, from.id, cs);
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
      return store.run(async (cs) => {
        const l = store.links.get(body.id);
        await store.removeLink(body.id, cs);
        if (l) await syncCopyOwners(store, l.fromNoteId, cs);
        return { ok: true as const };
      });
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
          via: pathKey(m.via) || "self", targetKey: labelKey(m.targetKey), op: m.op === "multiply" ? "multiply" : "add",
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
      // Players: their own roll functions (for the hotbar), on a sheet they own.
      if (!viewer.isGM) return store.run((cs) => upsertPlayerFunction(store, viewer, body.action, cs));
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
          options: a.options !== undefined ? cleanActionOptions(a.options) : existing?.options,
        };
        // Still the player's own function after the GM changes it.
        if (existing?.options?.playerMade && action.options) action.options.playerMade = true;
        if (!action.options) delete action.options;
        await store.putAction(action, cs);
        return { actionId: action.id };
      });
    }
    case "action.delete": {
      if (!viewer.isGM) {
        // A player deletes only their own functions.
        const act = store.actions.get(body.id) ?? fail("That button no longer exists");
        const host = noteOf(store, act.noteId);
        if (!act.options?.playerMade || !host.ownerIds.includes(viewer.userId)) fail("Only the GM can delete that");
      }
      return store.run(async (cs) => { await store.removeAction(body.id, cs); return { ok: true as const }; });
    }
    case "action.prepare": {
      // What the presser has to pick before the button can run (its "choose" steps).
      const action = store.actions.get(body.id) ?? fail("That button no longer works — its action was deleted");
      const note = noteOf(store, action.noteId);
      if (!canRunAction(action, note, viewer)) fail("You can't use that");
      const targets = (body.targetNoteIds ?? []).filter((id) => store.notes.has(id)).slice(0, 20);
      // @source = the sheet the button is on (so a choose filter can compare against it).
      const roots: Record<string, string[]> = { target: targets, targets, source: [action.noteId] };
      const choices: AgActionChoice[] = [];
      for (const step of action.steps) {
        if (step.type !== "choose") continue;
        const ids = chooseOptions(store, action, step, roots, viewer);
        choices.push({
          name: step.name, prompt: step.prompt || `Choose for “${action.name}”`,
          options: ids.map((id) => { const n = store.notes.get(id)!; return { id, name: n.name || "Untitled", portrait: n.portrait, sub: n.type }; }),
        });
        // Later choices can depend on this one only at run time; offer the full list now.
        roots[step.name] = ids;
      }
      return { choices };
    }
    case "action.run": {
      const action = store.actions.get(body.id) ?? fail("That button no longer works — its action was deleted");
      const note = noteOf(store, action.noteId);
      if (!canRunAction(action, note, viewer)) fail("You can't use that");
      const targets = (body.targetNoteIds ?? []).filter((id) => store.notes.has(id)).slice(0, 20);
      const mods = cleanMods(body.mods);
      return store.run(async (cs) => {
        const result = await executeAction(store, action, targets, cs, { viewer, choices: body.choices ?? {}, host: ctx.host, mods });
        // Who the roll belongs to: the sheet itself if it's a character/NPC, else the
        // character it hangs off (a sword's owner, an ability's holder) — so the roll
        // lands under that character's player tracker card.
        const roller = personOf(store, note);
        return { result, noteName: note.name, rollerName: roller?.name ?? note.name };
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
            actions: (t.actions ?? []).map((a) => ({ ...a, steps: cleanSteps(a.steps), acl: normalizeAcl(a.acl), options: cleanActionOptions(a.options) })),
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
    case "craft.session": case "craft.close": case "craft.forgePart": case "craft.forgeWeapon": case "craft.forgeQuick":
    case "craft.brew": case "craft.experiment": case "craft.resolveExperiment": case "craft.rune": case "craft.makeScroll": {
      try { return await runCraftOp(ctx, body); }
      catch (e) { if (e instanceof CraftError) fail(e.message); throw e; }
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

/** A whole image pasted in (a data: URL from the image library or the clipboard) is stored (in the database); a link stays as it is. */
async function storedImage(host: HostHooks, v: string): Promise<string> {
  if (!/^data:image\//.test(v) || !host.saveImage) return v;
  try { return await host.saveImage(v); } catch { fail("Couldn't save that image — try uploading it"); }
  return v;
}

/**
 * A current value that goes up with its maximum (HP with Max HP) can't be
 * raised past it — only its temporary points (Temp HP) go over.
 */
function capToMax(store: ScopeStore, f: AgField, v: AgValue): AgValue {
  if (typeof v !== "number" || !f.options.follows) return v;
  const max = store.fieldsByNote.get(f.noteId)?.get(f.options.follows);
  const m = max ? (max.eff !== undefined ? max.eff : max.value) : undefined;
  return typeof m === "number" && Number.isFinite(m) ? Math.min(v, Math.max(0, m)) : v;
}

/**
 * A loss to a value with temporary points (its "shield", e.g. Temp HP) comes off
 * those first. Returns what's left to change on the value itself.
 */
async function absorb(store: ScopeStore, f: AgField, delta: number, cs: ChangeSet, result?: AgActionResult): Promise<number> {
  if (delta >= 0 || !f.options.shield) return delta;
  const s = store.fieldsByNote.get(f.noteId)?.get(f.options.shield);
  if (!s || s.type !== "number") return delta;
  const have = Math.max(0, asNumber((s.value as any) ?? 0));
  const soak = Math.min(have, -delta);
  if (soak <= 0) return delta;
  const from = s.value;
  const to = coerceValue(s, have - soak);
  await store.putField({ ...s, value: to }, cs);
  result?.changes.push({ noteId: s.noteId, key: s.key, from, to });
  return delta + soak;
}

const isPerson = (n?: AgNote) => !!n && (n.type === "character" || n.type === "npc");
/** The character a sheet stands for: itself, or the character/NPC it hangs off (a sword's owner). */
function personOf(store: ScopeStore, note: AgNote): AgNote | undefined {
  // The nearest character up its connections: a sword's owner, an aspect's ability's holder.
  let level = [note.id];
  const seen = new Set(level);
  for (let depth = 0; depth < 4 && level.length; depth++) {
    const n = store.notes.get(level[0]);
    if (depth === 0 && isPerson(n)) return n;
    const next: string[] = [];
    for (const id of level) {
      for (const l of store.linksOf(id)) {
        if (l.fromNoteId !== id || seen.has(l.toNoteId)) continue;
        const to = store.notes.get(l.toNoteId);
        if (isPerson(to)) return to;
        seen.add(l.toNoteId); next.push(l.toNoteId);
      }
    }
    level = next;
  }
  return undefined;
}

function cleanMods(raw: unknown): AgRollMods {
  const m = (raw && typeof raw === "object" ? raw : {}) as any;
  const bonus = Number(m.bonus), extra = Number(m.extra);
  return {
    mode: m.mode === "adv" || m.mode === "dis" ? m.mode : null, bonus: Number.isFinite(bonus) ? Math.max(-1000, Math.min(1000, Math.round(bonus))) : 0,
    extra: Number.isFinite(extra) ? Math.max(0, Math.min(99, Math.floor(extra))) : 0,
  };
}
const round2 = (x: number) => Math.round(x * 100) / 100;
const signed = (x: number) => (x < 0 ? `− ${round2(-x)}` : `+ ${round2(x)}`);

/**
 * Roll an expression once, or twice keeping the better/worse (advantage /
 * disadvantage), then add the press's one-off modifier. The working says which.
 */
function rollWithMods(once: () => { total: number; breakdown: string }, mods: AgRollMods): { total: number; breakdown: string } {
  let r = once();
  if (mods.mode) {
    const r2 = once();
    const keepSecond = mods.mode === "adv" ? r2.total > r.total : r2.total < r.total;
    const kept = keepSecond ? r2 : r, dropped = keepSecond ? r : r2;
    r = { total: kept.total, breakdown: `${kept.breakdown}  (${mods.mode === "adv" ? "advantage" : "disadvantage"}: kept ${round2(kept.total)}, dropped ${round2(dropped.total)})` };
  }
  if (mods.bonus) r = { total: r.total + mods.bonus, breakdown: `${r.breakdown} ${signed(mods.bonus)} temp` };
  return r;
}

/** Roll a step's expression (a lone dice value rolls its own dice so the working shows them). */
function rollExpr(store: ScopeStore, noteId: string, exprIn: string, locals: Record<string, any>, roots: Record<string, string[]>, mods: AgRollMods) {
  const comp = store.computer();
  let expr = exprIn, at = noteId;
  try {
    const node = parseFormula(exprIn);
    if (node.t === "ref") {
      const { noteIds, key } = comp.targetsOf(noteId, node.path, node.abs, roots);
      const f = noteIds.length === 1 ? store.fieldsByNote.get(noteIds[0])?.get(key) : undefined;
      if (f?.type === "dice" && f.formula?.trim()) { expr = f.formula; at = f.noteId; }
    }
  } catch { /* fall through to the plain evaluation, which reports the error */ }
  const r = rollWithMods(() => { const e = comp.evalIn(at, expr, { rollDie, locals, roots }); return { total: asNumber(e.value as any), breakdown: e.breakdown }; }, mods);
  return { total: r.total, breakdown: `${r.breakdown} = ${round2(r.total)}` };
}

/**
 * A button's simple roll: check and spend its costs on the rolling sheet, then
 * roll the dice and add the value and bonus. Returns false when it couldn't go
 * ahead (nothing to roll with, or not enough to pay).
 */
async function runRollSpec(store: ScopeStore, action: AgAction, spec: AgRollSpec, cs: ChangeSet, result: AgActionResult, locals: Record<string, any>, roots: Record<string, string[]>, mods: AgRollMods): Promise<boolean> {
  const comp = store.computer();
  const me = store.notes.get(action.noteId)!;
  const via = spec.via;
  const rollerId = via ? comp.follow(action.noteId, via)[0] : action.noteId;
  if (!rollerId) { result.messages.push(`${me.name || "This"} isn't connected to anyone to roll it (needs a “${via}”).`); return false; }
  const roller = store.notes.get(rollerId)!;
  const num = (expr: string, d: number) => { try { return asNumber(comp.evalIn(action.noteId, expr || String(d), { locals, roots }).value as any); } catch (e) { result.messages.push(`⚠ ${(e as Error).message}`); return d; } };

  // Damage Die: extra dice bought for this roll, each a step dearer than the last, paid with the other costs.
  const extra = spec.scale ? Math.max(0, Math.min(99, Math.floor(mods.extra ?? 0))) : 0;
  const extraCost = extra ? scaleCost(num(spec.scale!.step, 0), extra) : 0;
  const costList = spec.costs.map((c) => ({ c, f: store.fieldsByNote.get(rollerId)?.get(c.key), amount: num(c.amount, 0) }));
  if (extraCost) {
    const same = costList.find((x) => x.c.key === spec.scale!.pay);
    if (same) same.amount += extraCost;
    else costList.push({ c: { key: spec.scale!.pay, amount: String(extraCost) }, f: store.fieldsByNote.get(rollerId)?.get(spec.scale!.pay), amount: extraCost });
  }
  // Costs: all checked first, so nothing is spent unless everything can be.
  const costs = costList.filter((x) => x.amount !== 0);
  // Ammunition (or anything a roll uses up): enough matching items in the roller's inventory, checked first too.
  let useUp: Array<{ id: string; take: number }> = [];
  let usedName = "";
  if (spec.uses) {
    const need = Math.max(0, Math.floor(num(spec.uses.qty, 1)));
    const own = spec.uses.match ? store.fieldsByNote.get(action.noteId)?.get(spec.uses.match) : undefined;
    const want = own ? String(comp.effOf(own).eff ?? own.value ?? "").trim().toLowerCase() : "";
    const qtyOf = (id: string) => { const q = store.fieldsByNote.get(id)?.get("qty"); return q ? Math.max(0, Math.floor(asNumber((q.value as any) ?? 0))) : 1; };
    const matches = comp.follow(rollerId, spec.uses.list).filter((id) => {
      if (id === action.noteId || !store.notes.has(id)) return false;
      if (!spec.uses!.match) return true;
      const f = store.fieldsByNote.get(id)?.get(spec.uses!.match);
      return !!f && String(comp.effOf(f).eff ?? f.value ?? "").trim().toLowerCase() === want && !!want;
    }).sort((a, b) => qtyOf(a) - qtyOf(b));
    const have = matches.reduce((s, id) => s + qtyOf(id), 0);
    usedName = (own ? String(comp.effOf(own).eff ?? own.value ?? "") : "") || (matches[0] ? store.notes.get(matches[0])!.name : "ammunition");
    if (need > 0 && have < need) { result.messages.push(have ? `${roller.name} has only ${have} ${usedName} — ${me.name}'s ${action.name} needs ${need}.` : `${roller.name} has no ${usedName} left for ${me.name}'s ${action.name}.`); return false; }
    let left = need;
    for (const id of matches) { if (left <= 0) break; const take = Math.min(left, qtyOf(id)); useUp.push({ id, take }); left -= take; }
  }
  for (const { c, f, amount } of costs) {
    if (!f || f.type === "formula" || f.type === "dice") { result.messages.push(`⚠ ${roller.name} has no “${c.key}” to spend.`); return false; }
    // Temporary points (Temp Energy…) count, and are spent first.
    const temp = f.options.shield ? store.fieldsByNote.get(rollerId)?.get(f.options.shield) : undefined;
    const have = asNumber((comp.effOf(f).eff as any) ?? 0) + (temp ? Math.max(0, asNumber((temp.value as any) ?? 0)) : 0);
    if (have < amount) { result.messages.push(`Not enough ${f.label} for ${action.name}: it needs ${round2(amount)} and ${roller.name} has ${round2(have)}.`); return false; }
  }
  for (const { f, amount } of costs) {
    const cur = store.fieldsByNote.get(rollerId)?.get(f!.key) ?? f!;
    const rest = await absorb(store, cur, -amount, cs, result);
    if (rest === 0) continue;
    const from = cur.value;
    const to = coerceValue(cur, asNumber((from as any) ?? 0) + rest);
    await store.putField({ ...cur, value: to }, cs);
    result.changes.push({ noteId: rollerId, key: cur.key, from, to });
  }

  // Used up: each item's quantity goes down, and it leaves the inventory when none are left.
  for (const { id, take } of useUp) {
    const q = store.fieldsByNote.get(id)?.get("qty");
    const rest = (q ? asNumber((q.value as any) ?? 0) : 1) - take;
    if (q && rest > 0) { await store.putField({ ...q, value: rest }, cs); result.changes.push({ noteId: id, key: "qty", from: q.value, to: rest }); }
    else { const was = store.linksOf(id).filter((l) => l.toNoteId === id).map((l) => l.fromNoteId); await store.removeNote(id, cs); for (const o of was) await syncCopyOwners(store, o, cs); }
  }
  const usedTotal = useUp.reduce((s, u) => s + u.take, 0);
  const count = Math.max(1, Math.min(100, Math.floor(num(spec.count, 1)) + extra));
  const die = Math.max(1, Math.min(1000, Math.floor(num(spec.die, 20))));
  const after = store.computer();
  const addField = spec.add ? store.fieldsByNote.get(rollerId)?.get(spec.add) : undefined;
  const addVal = addField ? asNumber((after.effOf(addField).eff as any) ?? 0) : 0;
  const bonus = num(spec.bonus, 0);
  const r = rollWithMods(() => {
    const dice = Array.from({ length: count }, () => rollDie(die));
    const sum = dice.reduce((a, b) => a + b, 0);
    return { total: sum, breakdown: `${count}d${die} [${dice.join(", ")}]` };
  }, { mode: mods.mode });
  let total = r.total, breakdown = r.breakdown;
  if (addField && addVal) { total += addVal; breakdown += ` ${signed(addVal)} ${addField.label}`; }
  if (bonus) { total += bonus; breakdown += ` ${signed(bonus)} bonus`; }
  if (mods.bonus) { total += mods.bonus; breakdown += ` ${signed(mods.bonus)} temp`; }
  const spent = [costs.map(({ f, amount }) => `${round2(amount)} ${f!.label}`).join(", ") + (extra ? ` (${extra} extra ${extra === 1 ? "die" : "dice"})` : ""), usedTotal ? `${usedTotal} ${usedName}` : ""].filter(Boolean).join(", ");
  locals.roll = total;
  result.rolls.push({ name: "roll", label: action.name, expr: `${count}d${die}`, total, breakdown: `${breakdown} = ${round2(total)}${spent ? `  · spent ${spent}` : ""}` });
  return true;
}

/** Run an action's steps with the GM-authored authority of the action itself. */
async function executeAction(
  store: ScopeStore, action: AgAction, targetNoteIds: string[], cs: ChangeSet,
  run: { viewer: AgViewer; choices: Record<string, string>; host: HostHooks; mods?: AgRollMods },
): Promise<AgActionResult> {
  const result: AgActionResult = { rolls: [], changes: [], messages: [] };
  const locals: Record<string, any> = {};
  const roots: Record<string, string[]> = { target: targetNoteIds, targets: targetNoteIds, source: [action.noteId] };
  const mods: AgRollMods = run.mods ?? {};
  if (action.options?.roll && !(await runRollSpec(store, action, action.options.roll, cs, result, locals, roots, mods))) return result;
  for (const step of action.steps) {
    const comp = store.computer();
    if (!store.notes.has(action.noteId)) break; // the button's own sheet was removed by an earlier step
    if (step.when) {
      let go = false;
      try { go = isTruthy(comp.evalIn(action.noteId, step.when, { locals, roots }).value as any); } catch (e) { result.messages.push(`⚠ ${(e as Error).message}`); }
      if (!go) continue;
    }
    if (step.type === "stop") break;
    if (step.type === "choose") {
      const allowed = chooseOptions(store, action, step, roots, run.viewer, locals);
      const picked = run.choices[step.name];
      if (!allowed.length) { result.messages.push(step.prompt ? `Nothing to choose for “${step.prompt}”.` : "There was nothing to choose."); break; }
      if (!picked || !allowed.includes(picked)) { result.messages.push("Nothing was chosen, so the rest didn't happen."); break; }
      roots[step.name] = [picked];
      continue;
    }
    if (step.type === "remove") {
      const id = step.target === "self" ? action.noteId : roots[step.target]?.[0];
      if (!id || !store.notes.has(id)) { result.messages.push("⚠ Nothing to remove."); continue; }
      const name = store.notes.get(id)!.name;
      await store.removeNote(id, cs);
      if (store.scope.kind === "campaign") void run.host.deleteTokensForNote(store.scope.id, id).catch(() => {});
      result.messages.push(`${name || "A sheet"} was removed.`);
      continue;
    }
    if (step.type === "roll") {
      try {
        const r = rollExpr(store, action.noteId, step.expr, locals, roots, mods);
        locals[step.name] = r.total;
        // A label can name things on the sheet: "{name} hits" → "Fireball hits".
        const label = step.label?.includes("{") ? interpolate(step.label, (e) => store.computer().evalIn(action.noteId, e, { locals, roots }).value) : step.label;
        result.rolls.push({ name: step.name, label: label || action.name, expr: step.expr, total: r.total, breakdown: r.breakdown });
      } catch (e) {
        result.messages.push(`⚠ ${step.label || step.name}: ${(e as Error).message}`);
      }
    } else if (step.type === "initiative") {
      try {
        const me = store.notes.get(action.noteId)!;
        const who = personOf(store, me) ?? me;
        const r = rollExpr(store, action.noteId, step.expr || "1d20", locals, roots, mods);
        locals.initiative = r.total;
        const label = step.label || "Initiative";
        result.rolls.push({ name: "initiative", label, expr: step.expr, total: r.total, breakdown: r.breakdown });
        if (store.scope.kind === "campaign" && run.host.joinInitiative) {
          await run.host.joinInitiative(store.scope.id, { noteId: who.id, name: who.name || "Untitled", portrait: who.portrait }, Math.round(r.total));
          result.initiative = { noteId: who.id, name: who.name, total: Math.round(r.total) };
        } else {
          result.messages.push("Initiative only works in a campaign.");
        }
      } catch (e) {
        result.messages.push(`⚠ ${step.label || "Initiative"}: ${(e as Error).message}`);
      }
    } else if (step.type === "modify") {
      try {
        // The target can be worked out from the sheet: "@owner.{raise_key}" changes whichever value raise_key names.
        const target = step.target.includes("{") ? interpolate(step.target, (e) => store.computer().evalIn(action.noteId, e, { locals, roots }).value) : step.target;
        const ref = parseFormula(target);
        if (ref.t !== "ref") fail("Change target must be a field");
        const { noteIds, key } = comp.targetsOf(action.noteId, (ref as any).path, (ref as any).abs, roots);
        const amount = asNumber(comp.evalIn(action.noteId, step.value, { locals, roots }).value as any);
        for (const nid of noteIds) {
          const f = store.fieldsByNote.get(nid)?.get(key);
          if (!f || f.type === "formula" || f.type === "dice") { result.messages.push(`⚠ ${store.notes.get(nid)?.name ?? "Sheet"} has no "${key}" value to change`); continue; }
          const from = f.value;
          const base = asNumber((from as any) ?? 0);
          // A loss comes off temporary points first (e.g. Temp HP before HP).
          const change = step.op === "set" ? 0 : await absorb(store, f, step.op === "add" ? amount : -amount, cs, result);
          const to = capToMax(store, f, coerceValue(f, step.op === "set" ? amount : base + change));
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

/** Every connections list on a sheet (its page and its sections): connection + settings. */
async function listsOnSheet(store: ScopeStore, host: AgNote): Promise<Array<{ label: string; config: any }>> {
  const names = [noteDocName(host.id, host.docEpoch), ...Array.from(store.regions.values()).filter((r) => r.noteId === host.id).map((r) => regionDocName(r.id, host.docEpoch))];
  return (await docs.linkListsOf(names)).map((l) => ({ ...l, label: l.label.split(".").map(labelKey).filter(Boolean).join(".") }));
}
const copyFolderOf = (config: any): string => (typeof config?.add?.copyFolder === "string" && config.add.copyFolder.trim() ? config.add.copyFolder.trim().slice(0, 80) : "Copies");

/**
 * A player's own roll function (for their hotbar): kept on a sheet they own, it
 * only rolls dice and that sheet's own values and spends its own resources — no
 * steps, no other sheets — so it can't change or reveal anything they couldn't
 * already. Numbers, or names of values on that sheet; nothing else is accepted.
 */
async function upsertPlayerFunction(store: ScopeStore, viewer: AgViewer, a: any, cs: ChangeSet) {
  const note = noteOf(store, String(a?.noteId ?? ""));
  if (note.isTemplate || !note.ownerIds.includes(viewer.userId)) fail("You can only make functions on your own sheets");
  const existing = a?.id ? store.actions.get(a.id) : undefined;
  if (existing && (existing.noteId !== note.id || !existing.options?.playerMade)) fail("Only the GM can change that button");
  const own = store.fieldsByNote.get(note.id) ?? new Map<string, AgField>();
  const plain = (v: unknown, what: string, d: string) => {
    const t = String(v ?? "").trim() || d;
    if (/^-?\d{1,6}$/.test(t)) return t;
    if (/^[a-z][a-z0-9_]{0,39}$/.test(t) && own.has(t)) return t;
    return fail(`${what}: use a number or one of this sheet's values`);
  };
  const r = a?.options?.roll ?? {};
  const add = typeof r.add === "string" && r.add ? r.add : "";
  if (add && !own.has(add)) fail("Adds: one of this sheet's values");
  const costs = (Array.isArray(r.costs) ? r.costs : []).slice(0, 8).map((c: any) => {
    const f = own.get(String(c?.key ?? ""));
    if (!f || f.type !== "number") fail("A cost must be one of this sheet's numbers (Energy, Focus…)");
    return { key: f!.key, amount: plain(c.amount, "Cost", "0") };
  });
  const o = a?.options ?? {};
  const options: AgActionOptions = {
    roll: { via: "", count: plain(r.count, "Dice", "1"), die: plain(r.die, "Die", "20"), add, bonus: plain(r.bonus, "Bonus", "0"), costs },
    icon: typeof o.icon === "string" && o.icon.trim() ? o.icon.trim().slice(0, 120) : existing?.options?.icon ?? "die:d20",
    showName: typeof o.showName === "boolean" ? o.showName : existing?.options?.showName ?? true,
    showIcon: typeof o.showIcon === "boolean" ? o.showIcon : existing?.options?.showIcon ?? true,
    listed: typeof o.listed === "boolean" ? o.listed : existing?.options?.listed ?? false,
    sortOrder: typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder) ? o.sortOrder : existing?.options?.sortOrder ?? 100,
    playerMade: true,
  };
  const action: AgAction = {
    id: existing?.id ?? randomUUID(), noteId: note.id, name: cleanLabel(a?.name, 80) || existing?.name || "My roll", steps: [],
    acl: { view: "owners", edit: "owners" },
    color: typeof a?.color === "string" && /^#[0-9a-f]{3,8}$/i.test(a.color) ? a.color : existing?.color ?? "#7c3aed",
    options,
  };
  await store.putAction(action, cs);
  return { actionId: action.id };
}
