// Yjs document registry for Agnostic sheets. Each sheet body is one doc
// (note:<id>:<epoch>) and every permission-scoped region — a GM-only block, a
// secret phrase inside a sentence, a canvas text box — is its own doc
// (region:<id>:<epoch>), so a player is never even sent the bytes of content
// they can't see. Docs are loaded on first subscribe, persisted (debounced)
// as base64 state, and released when nobody has them open.
import * as Y from "yjs";
import * as repo from "./repo";

export interface DocListener {
  /** Called for every applied update with the origin that produced it. */
  (update: Uint8Array, origin: unknown): void;
}

interface Entry {
  name: string;
  noteId: string;
  doc: Y.Doc;
  subs: Set<unknown>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  listeners: Set<DocListener>;
}

const SAVE_DEBOUNCE_MS = 1200;
const RELEASE_AFTER_MS = 60_000;

const entries = new Map<string, Entry>();
const loading = new Map<string, Promise<Entry>>();

export const toB64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
export const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

function makeEntry(name: string, noteId: string, doc: Y.Doc): Entry {
  const e: Entry = { name, noteId, doc, subs: new Set(), saveTimer: null, releaseTimer: null, listeners: new Set() };
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    scheduleSave(e);
    for (const l of Array.from(e.listeners)) l(update, origin);
  });
  return e;
}

export async function getDoc(name: string, noteId: string): Promise<Entry> {
  const hit = entries.get(name);
  if (hit) { if (hit.releaseTimer) { clearTimeout(hit.releaseTimer); hit.releaseTimer = null; } return hit; }
  const pending = loading.get(name);
  if (pending) return pending;
  const p = (async () => {
    const doc = new Y.Doc();
    const state = await repo.loadDoc(name);
    if (state) Y.applyUpdate(doc, fromB64(state));
    const e = makeEntry(name, noteId, doc);
    entries.set(name, e);
    return e;
  })();
  loading.set(name, p);
  try { return await p; } finally { loading.delete(name); }
}

function scheduleSave(e: Entry) {
  if (e.saveTimer) clearTimeout(e.saveTimer);
  e.saveTimer = setTimeout(() => { e.saveTimer = null; void flush(e); }, SAVE_DEBOUNCE_MS);
}

async function flush(e: Entry) {
  try {
    await repo.saveDoc(e.name, e.noteId, toB64(Y.encodeStateAsUpdate(e.doc)));
  } catch (err) {
    // The note may have been deleted meanwhile (FK). Nothing to keep then.
    console.warn(`[agnostic] failed to save doc ${e.name}:`, (err as Error).message);
  }
}

export function subscribe(e: Entry, sub: unknown) {
  e.subs.add(sub);
  if (e.releaseTimer) { clearTimeout(e.releaseTimer); e.releaseTimer = null; }
}

export function unsubscribe(name: string, sub: unknown) {
  const e = entries.get(name);
  if (!e) return;
  e.subs.delete(sub);
  if (e.subs.size === 0 && !e.releaseTimer) {
    e.releaseTimer = setTimeout(async () => {
      if (e.subs.size) return;
      if (e.saveTimer) { clearTimeout(e.saveTimer); e.saveTimer = null; await flush(e); }
      entries.delete(e.name);
      e.doc.destroy();
    }, RELEASE_AFTER_MS);
  }
}

export function subscribers(name: string): Set<unknown> {
  return entries.get(name)?.subs ?? new Set();
}

export function addListener(e: Entry, l: DocListener) {
  e.listeners.add(l);
  return () => e.listeners.delete(l);
}

/** Current full state of a doc (live if open, else from the database). */
export async function stateOf(name: string): Promise<string | null> {
  const e = entries.get(name);
  if (e) return toB64(Y.encodeStateAsUpdate(e.doc));
  return repo.loadDoc(name);
}

/** Write a doc wholesale (new epoch, clone, import). Persists immediately. */
export async function putState(name: string, noteId: string, state: string | null) {
  const existing = entries.get(name);
  if (existing) {
    existing.doc.destroy();
    entries.delete(name);
  }
  if (state) await repo.saveDoc(name, noteId, state);
}

/** Flush every pending save — used before snapshots and at shutdown. */
export async function flushNote(noteId: string) {
  await Promise.all([...Array.from(entries.values())].filter((e) => e.noteId === noteId && e.saveTimer).map((e) => {
    clearTimeout(e.saveTimer!);
    e.saveTimer = null;
    return flush(e);
  }));
}

export function openDocNames(noteId: string): string[] {
  return [...Array.from(entries.values())].filter((e) => e.noteId === noteId).map((e) => e.name);
}

/** Drop a doc from memory without saving (its note's epoch moved on). */
export function discard(name: string) {
  const e = entries.get(name);
  if (!e) return;
  if (e.saveTimer) clearTimeout(e.saveTimer);
  if (e.releaseTimer) clearTimeout(e.releaseTimer);
  entries.delete(name);
  e.doc.destroy();
}

// ---------------------------------------------------------------------------
// Id remapping inside documents. When a template is instantiated (or a note
// copied), its regions and actions get new ids; the nodes and canvas items
// that point at them must follow. Works on raw state so it needs no editor
// schema: walks every XML element's attributes and every canvas item.
// ---------------------------------------------------------------------------
const REMAP_ATTRS = ["regionId", "actionId", "noteId"];

export function remapState(state: string | null, idMap: Map<string, string>): string | null {
  if (!state) return state;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromB64(state));
  doc.transact(() => {
    const walk = (node: Y.XmlFragment | Y.XmlElement) => {
      node.toArray().forEach((child) => {
        if (child instanceof Y.XmlElement) {
          for (const attr of REMAP_ATTRS) {
            const v = child.getAttribute(attr);
            if (typeof v === "string" && idMap.has(v)) child.setAttribute(attr, idMap.get(v)!);
          }
          walk(child);
        }
      });
    };
    walk(doc.getXmlFragment("default"));
    const canvases = doc.getMap<Y.Map<any>>("canvases");
    canvases.forEach((items) => {
      if (!(items instanceof Y.Map)) return;
      items.forEach((item: any, itemId: string) => {
        const w = item?.widget;
        if (!w) return;
        let changed = false;
        const next = { ...item, widget: { ...w } };
        for (const k of ["regionId", "actionId"] as const) {
          if (typeof w[k] === "string" && idMap.has(w[k])) { (next.widget as any)[k] = idMap.get(w[k]); changed = true; }
        }
        if (changed) items.set(itemId, next);
      });
    });
  });
  const out = toB64(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return out;
}

/** Ids of every region / action a document references (for templates' "what's used"). */
export function referencedIds(state: string | null): { regions: Set<string>; actions: Set<string> } {
  const regions = new Set<string>(), actions = new Set<string>();
  if (!state) return { regions, actions };
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromB64(state));
  const walk = (node: Y.XmlFragment | Y.XmlElement) => {
    node.toArray().forEach((child) => {
      if (child instanceof Y.XmlElement) {
        const r = child.getAttribute("regionId"), a = child.getAttribute("actionId");
        if (typeof r === "string") regions.add(r);
        if (typeof a === "string") actions.add(a);
        walk(child);
      }
    });
  };
  walk(doc.getXmlFragment("default"));
  doc.getMap<Y.Map<any>>("canvases").forEach((items) => {
    if (items instanceof Y.Map) items.forEach((item: any) => {
      if (typeof item?.widget?.regionId === "string") regions.add(item.widget.regionId);
      if (typeof item?.widget?.actionId === "string") actions.add(item.widget.actionId);
    });
  });
  doc.destroy();
  return { regions, actions };
}

/** Plain text of a doc (search, export previews). */
export function plainText(state: string | null): string {
  if (!state) return "";
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromB64(state));
  const text = doc.getXmlFragment("default").toString().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  doc.destroy();
  return text;
}
