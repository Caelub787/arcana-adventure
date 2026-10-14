// ScopeStore — the authoritative in-memory state of one Agnostic scope
// (a campaign, a user's library, or the admin library).
//
// Every mutation runs through `run()`, which serialises them per scope (so two
// players pressing "-1 HP" at once can't lose an update), persists to the
// database, recomputes formulas, and hands a ChangeSet to the realtime layer,
// which fans it out to each connection filtered by that viewer's permissions.
import type {
  AgAction, AgCampaignSettings, AgComponentDef, AgField, AgLink, AgModifier, AgNote, AgRegion, AgScope,
} from "@shared/agnostic/types";
import { scopeKey } from "@shared/agnostic/types";
import { AgComputer, type Computed } from "@shared/agnostic/compute";
import * as repo from "./repo";
import { seedBuiltins } from "./builtins";

export interface ChangeSet {
  notes: Set<string>;
  fields: Set<string>;
  regions: Set<string>;
  links: Set<string>;
  modifiers: Set<string>;
  actions: Set<string>;
  components: Set<string>;
  settings: boolean;
  /** Notes whose permissions/owners changed: everything under them must be re-evaluated per viewer. */
  aclNotes: Set<string>;
  /** Notes whose document epoch changed: clients must re-open their docs. */
  epochNotes: Set<string>;
}

export const emptyChanges = (): ChangeSet => ({
  notes: new Set(), fields: new Set(), regions: new Set(), links: new Set(), modifiers: new Set(),
  actions: new Set(), components: new Set(), settings: false, aclNotes: new Set(), epochNotes: new Set(),
});

export class ScopeStore {
  readonly key: string;
  notes = new Map<string, AgNote>();
  fields = new Map<string, AgField>();
  fieldsByNote = new Map<string, Map<string, AgField>>();
  regions = new Map<string, AgRegion>();
  links = new Map<string, AgLink>();
  modifiers = new Map<string, AgModifier>();
  actions = new Map<string, AgAction>();
  components = new Map<string, AgComponentDef>();
  settings: AgCampaignSettings | null = null;
  computed = new Map<string, Computed>();
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(c: ChangeSet) => void>();
  /** Last activity, for unloading idle scopes. */
  touchedAt = Date.now();

  constructor(readonly scope: AgScope) {
    this.key = scopeKey(scope);
  }

  static async load(scope: AgScope): Promise<ScopeStore> {
    const s = new ScopeStore(scope);
    const rows = await repo.loadScope(scope);
    rows.notes.forEach((n) => s.notes.set(n.id, n));
    rows.fields.forEach((f) => s.indexField(f));
    rows.regions.forEach((r) => s.regions.set(r.id, r));
    // Links are only kept when both ends are in this scope.
    rows.links.forEach((l) => { if (s.notes.has(l.fromNoteId) && s.notes.has(l.toNoteId)) s.links.set(l.id, l); });
    rows.modifiers.forEach((m) => s.modifiers.set(m.id, m));
    rows.actions.forEach((a) => s.actions.set(a.id, a));
    rows.components.forEach((c) => s.components.set(c.id, c));
    s.settings = rows.settings;
    // Built-in components (HP bar, HP, Max HP). Never let this block a scope from opening.
    await seedBuiltins(s).catch((e) => console.error("[agnostic] couldn't add built-in components", e));
    s.recompute();
    return s;
  }

  onChange(fn: (c: ChangeSet) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Serialise a mutation, then broadcast what it changed. */
  run<T>(fn: (cs: ChangeSet) => Promise<T>): Promise<T> {
    this.touchedAt = Date.now();
    const next = this.queue.then(async () => {
      const cs = emptyChanges();
      const result = await fn(cs);
      // Anything structural may change formula results anywhere in the scope.
      for (const id of this.recompute()) cs.fields.add(id);
      for (const l of Array.from(this.listeners)) {
        try { l(cs); } catch (e) { console.error("[agnostic] listener failed", e); }
      }
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  // --- indexing ------------------------------------------------------------------
  private indexField(f: AgField) {
    const prev = this.fields.get(f.id);
    if (prev && prev.key !== f.key) this.fieldsByNote.get(prev.noteId)?.delete(prev.key);
    this.fields.set(f.id, f);
    let m = this.fieldsByNote.get(f.noteId);
    if (!m) { m = new Map(); this.fieldsByNote.set(f.noteId, m); }
    m.set(f.key, f);
  }
  private unindexField(id: string) {
    const f = this.fields.get(id);
    if (!f) return;
    this.fields.delete(id);
    const m = this.fieldsByNote.get(f.noteId);
    if (m?.get(f.key)?.id === id) m.delete(f.key);
  }

  computer(): AgComputer {
    return new AgComputer({ notes: this.notes, fieldsByNote: this.fieldsByNote, links: this.links.values(), modifiers: this.modifiers.values() });
  }

  /** Recompute every field; returns ids whose effective value or error changed. */
  recompute(): string[] {
    const next = this.computer().computeAll();
    const changed: string[] = [];
    for (const [id, c] of Array.from(next)) {
      const prev = this.computed.get(id);
      if (!prev || prev.eff !== c.eff || prev.err !== c.err) changed.push(id);
    }
    this.computed = next;
    for (const [id, c] of Array.from(next)) {
      const f = this.fields.get(id);
      if (f) { f.eff = c.eff; f.err = c.err; }
    }
    return changed;
  }

  fieldsOf(noteId: string): AgField[] {
    return Array.from(this.fieldsByNote.get(noteId)?.values() ?? []);
  }
  regionsOf(noteId: string) { return [...Array.from(this.regions.values())].filter((r) => r.noteId === noteId); }
  actionsOf(noteId: string) { return [...Array.from(this.actions.values())].filter((a) => a.noteId === noteId); }
  modifiersOf(noteId: string) { return [...Array.from(this.modifiers.values())].filter((m) => m.noteId === noteId); }
  linksOf(noteId: string) { return [...Array.from(this.links.values())].filter((l) => l.fromNoteId === noteId || l.toNoteId === noteId); }

  // --- writes (call inside run()) --------------------------------------------------
  async putNote(n: AgNote, cs: ChangeSet, aclChanged = false) {
    n.updatedAt = Date.now();
    await repo.upsertNote(n);
    this.notes.set(n.id, n);
    cs.notes.add(n.id);
    if (aclChanged) cs.aclNotes.add(n.id);
  }
  async removeNote(id: string, cs: ChangeSet) {
    const n = this.notes.get(id);
    if (!n) return;
    for (const f of this.fieldsOf(id)) { this.unindexField(f.id); cs.fields.add(f.id); }
    this.fieldsByNote.delete(id);
    for (const r of this.regionsOf(id)) { this.regions.delete(r.id); cs.regions.add(r.id); }
    for (const a of this.actionsOf(id)) { this.actions.delete(a.id); cs.actions.add(a.id); }
    for (const m of this.modifiersOf(id)) { this.modifiers.delete(m.id); cs.modifiers.add(m.id); }
    for (const l of this.linksOf(id)) { this.links.delete(l.id); cs.links.add(l.id); }
    this.notes.delete(id);
    cs.notes.add(id);
    await repo.deleteNote(id); // cascades children + docs + versions
    if (this.settings) {
      const t = this.settings.tracker;
      if (t.pinned.includes(id) || id in t.cardByNote) {
        t.pinned = t.pinned.filter((x) => x !== id);
        delete t.cardByNote[id];
        await repo.saveSettings(this.scope.id, this.settings);
        cs.settings = true;
      }
    }
  }
  async putField(f: AgField, cs: ChangeSet) {
    await repo.upsertField(f);
    this.indexField(f);
    cs.fields.add(f.id);
  }
  async removeField(id: string, cs: ChangeSet) {
    if (!this.fields.has(id)) return;
    await repo.deleteField(id);
    this.unindexField(id);
    cs.fields.add(id);
  }
  async putRegion(r: AgRegion, cs: ChangeSet) {
    await repo.upsertRegion(r);
    this.regions.set(r.id, r);
    cs.regions.add(r.id);
  }
  async removeRegion(id: string, cs: ChangeSet) {
    await repo.deleteRegion(id);
    this.regions.delete(id);
    cs.regions.add(id);
  }
  async putLink(l: AgLink, cs: ChangeSet) {
    await repo.upsertLink(l);
    this.links.set(l.id, l);
    cs.links.add(l.id);
  }
  async removeLink(id: string, cs: ChangeSet) {
    await repo.deleteLink(id);
    this.links.delete(id);
    cs.links.add(id);
  }
  async putModifier(m: AgModifier, cs: ChangeSet) {
    await repo.upsertModifier(m);
    this.modifiers.set(m.id, m);
    cs.modifiers.add(m.id);
  }
  async removeModifier(id: string, cs: ChangeSet) {
    await repo.deleteModifier(id);
    this.modifiers.delete(id);
    cs.modifiers.add(id);
  }
  async putAction(a: AgAction, cs: ChangeSet) {
    await repo.upsertAction(a);
    this.actions.set(a.id, a);
    cs.actions.add(a.id);
  }
  async removeAction(id: string, cs: ChangeSet) {
    await repo.deleteAction(id);
    this.actions.delete(id);
    cs.actions.add(id);
  }
  async putComponent(c: AgComponentDef, cs: ChangeSet) {
    c.updatedAt = Date.now();
    await repo.upsertComponent(c);
    this.components.set(c.id, c);
    cs.components.add(c.id);
  }
  async removeComponent(id: string, cs: ChangeSet) {
    await repo.deleteComponent(id);
    this.components.delete(id);
    cs.components.add(id);
  }
  async putSettings(s: AgCampaignSettings, cs: ChangeSet) {
    if (this.scope.kind !== "campaign") return;
    await repo.saveSettings(this.scope.id, s);
    this.settings = s;
    cs.settings = true;
  }
}

// --- registry -------------------------------------------------------------------
const stores = new Map<string, ScopeStore>();
const loadingStores = new Map<string, Promise<ScopeStore>>();

export async function getStore(scope: AgScope): Promise<ScopeStore> {
  const key = scopeKey(scope);
  const hit = stores.get(key);
  if (hit) { hit.touchedAt = Date.now(); return hit; }
  const pending = loadingStores.get(key);
  if (pending) return pending;
  const p = ScopeStore.load(scope).then(async (s) => {
    // Systems built on Agnostic fill a new campaign / library with their templates.
    const { seedSystemContent } = await import("./systemSeed");
    await seedSystemContent(s).catch((e) => console.error("[agnostic] couldn't add the system's templates", e));
    stores.set(key, s);
    return s;
  });
  loadingStores.set(key, p);
  try { return await p; } finally { loadingStores.delete(key); }
}

export function peekStore(scope: AgScope): ScopeStore | undefined {
  return stores.get(scopeKey(scope));
}

/** Unload scopes nobody is using (the realtime layer reports who is). */
export function sweepStores(inUse: (key: string) => boolean, idleMs = 10 * 60_000) {
  const now = Date.now();
  for (const [key, s] of Array.from(stores)) {
    if (!inUse(key) && now - s.touchedAt > idleMs) stores.delete(key);
  }
}
