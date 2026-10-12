// /ws/agnostic — the live channel for everything Agnostic.
//
// Data (notes, fields, links…) is pushed as entity upserts/removes, computed
// PER CONNECTION from the shared ACL rules: a player is never sent a value,
// a region's text, or even a hidden note's name they aren't allowed to see.
// Sheet documents are Yjs docs synced over the same socket; writes are
// accepted only from connections allowed to edit that doc.
//
// When permissions change (owners, ACLs, a template switch…), every affected
// connection is re-evaluated immediately: newly-visible things are sent,
// newly-hidden things are removed, open docs are revoked or made read-only.
import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import type { AgScope, AgViewer, AgNote, AgField, AgRegion, AgLink, AgAction } from "@shared/agnostic/types";
import { parseDocName, scopeKey, noteDocName, regionDocName } from "@shared/agnostic/types";
import {
  canViewNote, canViewField, canViewRegion, canEditRegion, canViewBody, canEditBody, canViewLink, canSeeAction,
} from "@shared/agnostic/acl";
import type { AgClientMsg, AgServerMsg, AgActionView, AgEntityKind } from "@shared/agnostic/protocol";
import { getStore, peekStore, sweepStores, type ChangeSet, type ScopeStore } from "./store";
import { resolveScopeAccess, scopeMembers } from "./access";
import { runOp, OpError, type HostHooks } from "./ops";
import * as docs from "./docs";
import { recordVersion } from "./snapshot";

type Kind = AgEntityKind;

interface ScopeSub {
  scope: AgScope;
  viewer: AgViewer;
  store: ScopeStore;
  /** What this connection currently holds, per entity kind (so we know what to remove). */
  sent: Record<Kind, Set<string>>;
  off: () => void;
}

interface DocSub {
  name: string;
  scopeKey: string;
  noteId: string;
  regionId: string | null;
  readOnly: boolean;
  off: () => void;
}

interface Conn {
  ws: WebSocket;
  userId: string;
  scopes: Map<string, ScopeSub>;
  docs: Map<string, DocSub>;
  alive: boolean;
}

const conns = new Set<Conn>();
let wss: WebSocketServer | null = null;
let sessionMiddleware: any = null;
let host: HostHooks = { deleteTokensForNote: async () => {} };

const emptySent = (): Record<Kind, Set<string>> => ({
  note: new Set(), field: new Set(), region: new Set(), link: new Set(), modifier: new Set(), action: new Set(), component: new Set(),
});

function send(c: Conn, msg: AgServerMsg) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

// --- visibility per viewer -------------------------------------------------------
function fieldView(f: AgField, viewer: AgViewer): AgField {
  // Formulas can name hidden sheets/fields; players only get the result.
  return viewer.isGM || f.type === "dice" ? f : { ...f, formula: null };
}
function actionView(a: AgAction, viewer: AgViewer): AgActionView {
  return { ...a, steps: viewer.isGM ? a.steps : null };
}

function visible(store: ScopeStore, kind: Kind, id: string, viewer: AgViewer): unknown | null {
  switch (kind) {
    case "note": { const n = store.notes.get(id); return n && canViewNote(n, viewer) ? n : null; }
    case "field": {
      const f = store.fields.get(id); const n = f && store.notes.get(f.noteId);
      return f && n && canViewField(f, n, viewer) ? fieldView(f, viewer) : null;
    }
    case "region": {
      const r = store.regions.get(id); const n = r && store.notes.get(r.noteId);
      return r && n && canViewRegion(r, n, viewer) ? r : null;
    }
    case "link": {
      const l = store.links.get(id);
      return l && canViewLink(l, store.notes.get(l.fromNoteId), store.notes.get(l.toNoteId), viewer) ? l : null;
    }
    case "modifier": return viewer.isGM ? store.modifiers.get(id) ?? null : null;
    case "action": {
      const a = store.actions.get(id); const n = a && store.notes.get(a.noteId);
      return a && n && canSeeAction(a, n, viewer) ? actionView(a, viewer) : null;
    }
    case "component": return store.components.get(id) ?? null;
  }
}

function pushEntity(c: Conn, sub: ScopeSub, kind: Kind, id: string) {
  const item = visible(sub.store, kind, id, sub.viewer);
  const key = sub.store.key;
  if (item) {
    sub.sent[kind].add(id);
    send(c, { t: "upsert", scope: key, kind, item } as AgServerMsg);
  } else if (sub.sent[kind].has(id)) {
    sub.sent[kind].delete(id);
    send(c, { t: "remove", scope: key, kind, id });
  }
}

/** Expand a ChangeSet so permission changes re-evaluate everything beneath them. */
function expand(store: ScopeStore, cs: ChangeSet) {
  for (const noteId of cs.aclNotes) {
    cs.notes.add(noteId);
    store.fieldsOf(noteId).forEach((f) => cs.fields.add(f.id));
    store.regionsOf(noteId).forEach((r) => cs.regions.add(r.id));
    store.actionsOf(noteId).forEach((a) => cs.actions.add(a.id));
    store.linksOf(noteId).forEach((l) => cs.links.add(l.id));
  }
  // A link's visibility depends on both ends.
  for (const noteId of cs.notes) store.linksOf(noteId).forEach((l) => cs.links.add(l.id));
}

function fanOut(store: ScopeStore, cs: ChangeSet) {
  expand(store, cs);
  for (const c of conns) {
    const sub = c.scopes.get(store.key);
    if (!sub) continue;
    // Removed notes are removed before their children are re-evaluated.
    for (const id of cs.notes) pushEntity(c, sub, "note", id);
    for (const id of cs.fields) pushEntity(c, sub, "field", id);
    for (const id of cs.regions) pushEntity(c, sub, "region", id);
    for (const id of cs.links) pushEntity(c, sub, "link", id);
    for (const id of cs.modifiers) pushEntity(c, sub, "modifier", id);
    for (const id of cs.actions) pushEntity(c, sub, "action", id);
    for (const id of cs.components) pushEntity(c, sub, "component", id);
    if (cs.settings && store.settings) send(c, { t: "settings", scope: store.key, settings: store.settings });
    // Open documents whose permissions may have moved.
    if (cs.aclNotes.size || cs.regions.size || cs.notes.size) recheckDocs(c, store, cs);
  }
}

function docAccess(store: ScopeStore, viewer: AgViewer, name: string): { ok: boolean; readOnly: boolean; noteId: string; regionId: string | null } {
  const p = parseDocName(name);
  if (!p) return { ok: false, readOnly: true, noteId: "", regionId: null };
  if (p.kind === "note") {
    const n = store.notes.get(p.id);
    if (!n || n.docEpoch !== p.epoch || !canViewBody(n, viewer)) return { ok: false, readOnly: true, noteId: p.id, regionId: null };
    return { ok: true, readOnly: !canEditBody(n, viewer), noteId: n.id, regionId: null };
  }
  const r = store.regions.get(p.id);
  const n = r && store.notes.get(r.noteId);
  if (!r || !n || n.docEpoch !== p.epoch || !canViewRegion(r, n, viewer)) return { ok: false, readOnly: true, noteId: r?.noteId ?? "", regionId: p.id };
  return { ok: true, readOnly: !canEditRegion(r, n, viewer), noteId: n.id, regionId: r.id };
}

function recheckDocs(c: Conn, store: ScopeStore, cs: ChangeSet) {
  const sub = c.scopes.get(store.key);
  if (!sub) return;
  for (const d of [...c.docs.values()]) {
    if (d.scopeKey !== store.key) continue;
    if (!cs.aclNotes.has(d.noteId) && !cs.notes.has(d.noteId) && !(d.regionId && cs.regions.has(d.regionId))) continue;
    const a = docAccess(store, sub.viewer, d.name);
    if (!a.ok) {
      d.off();
      c.docs.delete(d.name);
      docs.unsubscribe(d.name, c);
      send(c, { t: "doc.revoked", doc: d.name });
    } else if (a.readOnly !== d.readOnly) {
      d.readOnly = a.readOnly;
      send(c, { t: "doc.mode", doc: d.name, readOnly: a.readOnly });
    }
  }
}

// --- message handling ------------------------------------------------------------
async function subscribeScope(c: Conn, scope: AgScope) {
  const key = scopeKey(scope);
  const viewer = await resolveScopeAccess(c.userId, scope);
  if (!viewer) { send(c, { t: "scope.denied", scope: key, reason: "You don't have access to this." }); return; }
  const store = await getStore(scope);
  c.scopes.get(key)?.off();
  // Fan-out is one listener per store (ensureFanout), not one per connection.
  const sub: ScopeSub = { scope, viewer, store, sent: emptySent(), off: () => {} };
  c.scopes.set(key, sub);
  ensureFanout(store);
  const pick = <T,>(kind: Kind, ids: Iterable<string>) => {
    const out: T[] = [];
    for (const id of ids) { const v = visible(store, kind, id, viewer); if (v) { sub.sent[kind].add(id); out.push(v as T); } }
    return out;
  };
  send(c, {
    t: "scope.snapshot", scope: key, isGM: viewer.isGM, userId: c.userId,
    members: await scopeMembers(scope),
    notes: pick("note", store.notes.keys()),
    fields: pick("field", store.fields.keys()),
    regions: pick("region", store.regions.keys()),
    links: pick("link", store.links.keys()),
    modifiers: pick("modifier", store.modifiers.keys()),
    actions: pick("action", store.actions.keys()),
    components: pick("component", store.components.keys()),
    settings: store.settings,
  });
}

const fanoutAttached = new WeakSet<ScopeStore>();
function ensureFanout(store: ScopeStore) {
  if (fanoutAttached.has(store)) return;
  fanoutAttached.add(store);
  store.onChange((cs) => fanOut(store, cs));
}

async function subscribeDoc(c: Conn, scope: AgScope, name: string) {
  const key = scopeKey(scope);
  const sub = c.scopes.get(key);
  if (!sub) { send(c, { t: "doc.denied", doc: name, reason: "Not subscribed" }); return; }
  const a = docAccess(sub.store, sub.viewer, name);
  if (!a.ok) { send(c, { t: "doc.denied", doc: name, reason: "You can't see this" }); return; }
  if (c.docs.has(name)) return;
  const entry = await docs.getDoc(name, a.noteId);
  docs.subscribe(entry, c);
  const off = docs.addListener(entry, (update, origin) => {
    if (origin === c) return;
    send(c, { t: "doc.update", doc: name, u: docs.toB64(update) });
  });
  c.docs.set(name, { name, scopeKey: key, noteId: a.noteId, regionId: a.regionId, readOnly: a.readOnly, off });
  send(c, { t: "doc.sync", doc: name, u: docs.toB64(Y.encodeStateAsUpdate(entry.doc)), readOnly: a.readOnly });
}

async function applyDocUpdate(c: Conn, name: string, u: string) {
  const d = c.docs.get(name);
  if (!d) return;
  const sub = c.scopes.get(d.scopeKey);
  // Re-check on every write: permissions can change between keystrokes.
  const a = sub ? docAccess(sub.store, sub.viewer, name) : null;
  if (!a?.ok || a.readOnly) {
    send(c, { t: "doc.denied", doc: name, reason: "You can't edit this" });
    return;
  }
  const entry = await docs.getDoc(name, d.noteId);
  try {
    Y.applyUpdate(entry.doc, docs.fromB64(u), c);
    if (sub) maybeAutoVersion(sub.store, d.noteId, c.userId);
  } catch (e) {
    send(c, { t: "doc.denied", doc: name, reason: "Bad update" });
  }
}

// Version history keeps itself: while a sheet is being edited, a snapshot is
// taken at most every AUTO_VERSION_MS, so older states survive long after the
// editor's own undo history is gone.
const AUTO_VERSION_MS = 10 * 60_000;
const lastAuto = new Map<string, number>();
function maybeAutoVersion(store: ScopeStore, noteId: string, userId: string) {
  const now = Date.now();
  const prev = lastAuto.get(noteId) ?? 0;
  if (now - prev < AUTO_VERSION_MS) return;
  lastAuto.set(noteId, now);
  if (!prev) return; // first edit since load: the baseline is whatever is stored
  setTimeout(() => {
    if (!store.notes.has(noteId)) return;
    recordVersion(store, noteId, "autosave", null, userId).catch((e) => console.warn("[agnostic] autosave version failed", e.message));
  }, 2000);
}

function relayAwareness(c: Conn, name: string, u: string) {
  if (!c.docs.has(name)) return;
  for (const other of conns) {
    if (other !== c && other.docs.has(name)) send(other, { t: "doc.awareness", doc: name, u });
  }
}

async function handle(c: Conn, msg: AgClientMsg) {
  switch (msg.t) {
    case "ping": send(c, { t: "pong" }); return;
    case "scope.sub": return subscribeScope(c, msg.scope);
    case "scope.unsub": {
      const key = scopeKey(msg.scope);
      c.scopes.get(key)?.off();
      c.scopes.delete(key);
      for (const d of [...c.docs.values()]) if (d.scopeKey === key) closeDoc(c, d.name);
      return;
    }
    case "doc.sub": return subscribeDoc(c, msg.scope, msg.doc);
    case "doc.unsub": closeDoc(c, msg.doc); return;
    case "doc.update": return applyDocUpdate(c, msg.doc, msg.u);
    case "doc.awareness": relayAwareness(c, msg.doc, msg.u); return;
    case "op": {
      const key = scopeKey(msg.scope);
      let sub = c.scopes.get(key);
      if (!sub) {
        await subscribeScope(c, msg.scope);
        sub = c.scopes.get(key);
      }
      if (!sub) { send(c, { t: "op.ack", rid: msg.rid, ok: false, error: "You don't have access to this." }); return; }
      // Membership/role can change mid-session (kicked, promoted): re-check on every write.
      const fresh = await resolveScopeAccess(c.userId, msg.scope);
      if (!fresh) {
        send(c, { t: "op.ack", rid: msg.rid, ok: false, error: "You no longer have access to this." });
        sub.off();
        c.scopes.delete(key);
        for (const d of [...c.docs.values()]) if (d.scopeKey === key) { closeDoc(c, d.name); send(c, { t: "doc.revoked", doc: d.name }); }
        send(c, { t: "scope.denied", scope: key, reason: "You no longer have access to this." });
        return;
      }
      if (fresh.isGM !== sub.viewer.isGM) {
        // Role changed: start over with what the new role may see.
        await subscribeScope(c, msg.scope);
        sub = c.scopes.get(key)!;
      }
      try {
        const result = await runOp({ store: sub.store, viewer: sub.viewer, host }, msg.body);
        const touched = (msg.body as any).id && (msg.body.op === "field.set" || msg.body.op === "field.adjust") ? sub.store.fields.get((msg.body as any).id)?.noteId : null;
        if (touched) maybeAutoVersion(sub.store, touched, c.userId);
        send(c, { t: "op.ack", rid: msg.rid, ok: true, result });
      } catch (e) {
        const error = e instanceof OpError ? e.message : "Something went wrong";
        if (!(e instanceof OpError)) console.error("[agnostic] op failed", msg.body?.op, e);
        send(c, { t: "op.ack", rid: msg.rid, ok: false, error });
      }
      return;
    }
  }
}

function closeDoc(c: Conn, name: string) {
  const d = c.docs.get(name);
  if (!d) return;
  d.off();
  c.docs.delete(name);
  docs.unsubscribe(name, c);
}

// --- server wiring ---------------------------------------------------------------
export function initAgnosticRealtime(session: any, hooks: HostHooks) {
  sessionMiddleware = session;
  host = hooks;
  wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const userId = (req as any).session?.userId as string;
    const c: Conn = { ws, userId, scopes: new Map(), docs: new Map(), alive: true };
    conns.add(c);
    // Messages from one connection are handled strictly in order.
    let chain: Promise<unknown> = Promise.resolve();
    ws.on("message", (data) => {
      let msg: AgClientMsg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      chain = chain.then(() => handle(c, msg)).catch((e) => console.error("[agnostic] ws handler", e));
    });
    ws.on("pong", () => { c.alive = true; });
    ws.on("close", () => {
      conns.delete(c);
      for (const s of c.scopes.values()) s.off();
      for (const name of [...c.docs.keys()]) closeDoc(c, name);
    });
  });
  const heartbeat = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch {}
    }
    sweepStores((key) => [...conns].some((c) => c.scopes.has(key)));
  }, 30_000);
  wss.on("close", () => clearInterval(heartbeat));
}

export function handleAgnosticUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
  if (!wss || !sessionMiddleware) { socket.destroy(); return; }
  // Same-origin only: a cross-site page must not ride the user's cookie.
  const origin = req.headers.origin;
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch {}
    const hostHeader = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    if (!originHost || originHost !== hostHeader.split(",")[0].trim()) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  const mockRes = { getHeader: () => {}, setHeader: () => {}, end: () => {} };
  sessionMiddleware(req, mockRes, () => {
    const userId = (req as any).session?.userId;
    if (!userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit("connection", ws, req));
  });
}

/** Server-side reads for other routes (e.g. the battlemap token list). */
export async function noteForViewer(scope: AgScope, noteId: string, userId: string): Promise<AgNote | null> {
  const viewer = await resolveScopeAccess(userId, scope);
  if (!viewer) return null;
  const store = peekStore(scope) ?? (await getStore(scope));
  const n = store.notes.get(noteId);
  return n && canViewNote(n, viewer) ? n : null;
}

export { noteDocName, regionDocName };
export type { AgRegion, AgLink };
