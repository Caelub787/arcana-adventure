// Browser side of the Agnostic live channel. One websocket per tab carries:
//   • scope state — every note/field/link/… this user may see, kept current
//     by server pushes (no polling, no refetch-on-open)
//   • ops — mutations, answered by acks
//   • documents — Yjs sheet bodies and regions, collaboratively edited
// It reconnects on its own and re-subscribes everything it had open.
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import type {
  AgCampaignSettings, AgComponentDef, AgField, AgLink, AgModifier, AgNote, AgRegion, AgScope,
} from "@shared/agnostic/types";
import { scopeKey } from "@shared/agnostic/types";
import { readSnapshot, writeSnapshot } from "./snapCache";
import type { AgActionView, AgClientMsg, AgMember, AgOp, AgServerMsg } from "@shared/agnostic/protocol";

export interface ScopeState {
  scope: AgScope;
  key: string;
  ready: boolean;
  /** Opened on this browser's last copy; the server's snapshot hasn't arrived yet. */
  cached?: boolean;
  denied: string | null;
  isGM: boolean;
  userId: string;
  members: AgMember[];
  notes: Map<string, AgNote>;
  fields: Map<string, AgField>;
  regions: Map<string, AgRegion>;
  links: Map<string, AgLink>;
  modifiers: Map<string, AgModifier>;
  actions: Map<string, AgActionView>;
  components: Map<string, AgComponentDef>;
  settings: AgCampaignSettings | null;
  /** Bumped on every change — cheap equality for React. */
  version: number;
}

export const CANVAS_ORIGIN = "ag-canvas";
const REMOTE = "ag-remote";

export interface DocHandle {
  name: string;
  scope: AgScope;
  doc: Y.Doc;
  awareness: Awareness;
  synced: boolean;
  readOnly: boolean;
  revoked: boolean;
  /** Changes when the doc had to be replaced (denied write → resync). Editors rebind on change. */
  generation: number;
  refs: number;
  listeners: Set<() => void>;
  dirtyOffline: boolean;
  cleanup: () => void;
}

type Listener = () => void;

function makeScopeState(scope: AgScope): ScopeState {
  return {
    scope, key: scopeKey(scope), ready: false, denied: null, isGM: false, userId: "", members: [],
    notes: new Map(), fields: new Map(), regions: new Map(), links: new Map(), modifiers: new Map(),
    actions: new Map(), components: new Map(), settings: null, version: 0,
  };
}

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];

class AgnosticClient {
  private ws: WebSocket | null = null;
  private open = false;
  private backoff = 500;
  private rid = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private scopes = new Map<string, { state: ScopeState; refs: number; listeners: Set<Listener> }>();
  private docs = new Map<string, DocHandle>();
  private outbox: AgClientMsg[] = [];
  private connListeners = new Set<Listener>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  connected = false;
  private _user: { id: string; name: string } = { id: "", name: "" };
  private userWaiters: Array<() => void> = [];
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  get user() { return this._user; }
  setUser(u: { id: string; name: string }) {
    this._user = u;
    if (u.id) { const w = this.userWaiters; this.userWaiters = []; w.forEach((f) => f()); }
  }
  private whenUser(ms: number): Promise<boolean> {
    if (this._user.id) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      this.userWaiters.push(() => { clearTimeout(t); resolve(true); });
    });
  }

  // --- connection ---------------------------------------------------------------
  private ensure() {
    if (this.ws) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws/agnostic`);
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      this.connected = true;
      this.backoff = 500;
      this.connListeners.forEach((l) => l());
      for (const { state } of Array.from(this.scopes.values())) this.raw({ t: "scope.sub", scope: state.scope });
      for (const d of Array.from(this.docs.values())) if (!d.revoked) this.raw({ t: "doc.sub", scope: d.scope, doc: d.name });
      const queued = this.outbox;
      this.outbox = [];
      queued.forEach((m) => this.raw(m));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.raw({ t: "ping" }), 25_000);
    };
    ws.onmessage = (ev) => {
      let msg: AgServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this.handle(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      this.open = false;
      this.connected = false;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.connListeners.forEach((l) => l());
      for (const d of Array.from(this.docs.values())) { d.synced = false; this.notifyDoc(d); }
      // Anything in flight can't be answered on a new socket.
      for (const [id, p] of Array.from(this.pending)) { clearTimeout(p.timer); p.reject(new Error("Connection lost — try again")); this.pending.delete(id); }
      if (this.scopes.size || this.docs.size) {
        setTimeout(() => this.ensure(), this.backoff);
        this.backoff = Math.min(this.backoff * 2, 8000);
      }
    };
  }

  onConnection(l: Listener) { this.connListeners.add(l); return () => { this.connListeners.delete(l); }; }

  private raw(m: AgClientMsg) {
    if (this.ws && this.open) this.ws.send(JSON.stringify(m));
  }
  private sendOrQueue(m: AgClientMsg) {
    if (this.ws && this.open) this.ws.send(JSON.stringify(m));
    else { this.outbox.push(m); this.ensure(); }
  }

  // --- scopes -------------------------------------------------------------------
  retainScope(scope: AgScope): () => void {
    const key = scopeKey(scope);
    let s = this.scopes.get(key);
    if (!s) {
      s = { state: makeScopeState(scope), refs: 0, listeners: new Set() };
      this.scopes.set(key, s);
      this.ensure();
      this.raw({ t: "scope.sub", scope });
      void this.openCached(key);
    }
    s.refs++;
    return () => {
      const cur = this.scopes.get(key);
      if (!cur) return;
      cur.refs--;
      if (cur.refs <= 0) {
        // Keep it a moment: panels open/close constantly and resubscribing re-sends everything.
        setTimeout(() => {
          const again = this.scopes.get(key);
          if (again && again.refs <= 0) {
            this.scopes.delete(key);
            this.raw({ t: "scope.unsub", scope });
          }
        }, 15_000);
      }
    };
  }

  getScope(key: string): ScopeState | undefined { return this.scopes.get(key)?.state; }

  // --- this browser's last copy ----------------------------------------------------
  /** Show the last copy at once, unless the server's snapshot beat it here. */
  private async openCached(key: string) {
    if (!(await this.whenUser(10_000))) return;
    const userId = this._user.id;
    const snap = await readSnapshot<Omit<Extract<AgServerMsg, { t: "scope.snapshot" }>, "t" | "scope">>(userId, key);
    const s = this.scopes.get(key);
    if (!snap || !s || s.state.ready || snap.userId !== userId) return;
    s.state = this.stateFrom(s.state, snap, true);
    s.listeners.forEach((l) => l());
  }
  private stateFrom(prev: ScopeState, msg: Omit<Extract<AgServerMsg, { t: "scope.snapshot" }>, "t" | "scope">, cached: boolean): ScopeState {
    const st = makeScopeState(prev.scope);
    st.ready = true;
    st.cached = cached;
    st.isGM = msg.isGM;
    st.userId = msg.userId;
    st.members = msg.members;
    msg.notes.forEach((n) => st.notes.set(n.id, n));
    msg.fields.forEach((f) => st.fields.set(f.id, f));
    msg.regions.forEach((r) => st.regions.set(r.id, r));
    msg.links.forEach((l) => st.links.set(l.id, l));
    msg.modifiers.forEach((m) => st.modifiers.set(m.id, m));
    msg.actions.forEach((a) => st.actions.set(a.id, a));
    msg.components.forEach((c) => st.components.set(c.id, c));
    st.settings = msg.settings;
    st.version = prev.version + 1;
    return st;
  }
  /** Keep the last copy current: a few seconds after changes settle. */
  private scheduleSave(key: string) {
    const s = this.scopes.get(key);
    if (!s || !s.state.ready || s.state.cached || s.state.denied || !s.state.userId) return;
    if (this.saveTimers.has(key)) return;
    this.saveTimers.set(key, setTimeout(() => {
      this.saveTimers.delete(key);
      const cur = this.scopes.get(key)?.state;
      if (!cur || !cur.ready || cur.cached || cur.denied) return;
      void writeSnapshot(cur.userId, key, {
        isGM: cur.isGM, userId: cur.userId, members: cur.members,
        notes: Array.from(cur.notes.values()), fields: Array.from(cur.fields.values()), regions: Array.from(cur.regions.values()),
        links: Array.from(cur.links.values()), modifiers: Array.from(cur.modifiers.values()), actions: Array.from(cur.actions.values()),
        components: Array.from(cur.components.values()), settings: cur.settings,
      });
    }, 4000));
  }

  subscribeScope(key: string, l: Listener) {
    const s = this.scopes.get(key);
    if (!s) return () => {};
    s.listeners.add(l);
    return () => { s.listeners.delete(l); };
  }

  private bump(key: string) {
    const s = this.scopes.get(key);
    if (!s) return;
    // New object identity so useSyncExternalStore consumers re-render.
    s.state = { ...s.state, version: s.state.version + 1 };
    s.listeners.forEach((l) => l());
    this.scheduleSave(key);
  }

  /**
   * Show a value change at once, before the server confirms it. The server's
   * own update replaces it moments later; `revert()` puts the old one back if
   * the change was refused (unless something newer arrived meanwhile).
   */
  optimisticField(key: string, fieldId: string, next: (f: AgField) => AgField): () => void {
    const s = this.scopes.get(key);
    const prev = s?.state.fields.get(fieldId);
    if (!s || !prev) return () => {};
    const mine = next(prev);
    s.state.fields.set(fieldId, mine);
    this.bump(key);
    return () => {
      const cur = this.scopes.get(key);
      if (cur && cur.state.fields.get(fieldId) === mine) { cur.state.fields.set(fieldId, prev); this.bump(key); }
    };
  }

  // --- ops ----------------------------------------------------------------------
  request<T = any>(scope: AgScope, body: AgOp): Promise<T> {
    const rid = this.rid++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(rid); reject(new Error("The server didn't answer — try again")); }, 30_000);
      this.pending.set(rid, { resolve, reject, timer });
      this.sendOrQueue({ t: "op", scope, rid, body });
    });
  }

  // --- documents ----------------------------------------------------------------
  openDoc(scope: AgScope, name: string): DocHandle {
    let d = this.docs.get(name);
    if (d) { d.refs++; return d; }
    d = this.createDocHandle(scope, name);
    d.refs = 1;
    this.docs.set(name, d);
    this.sendOrQueue({ t: "doc.sub", scope, doc: name });
    return d;
  }

  private createDocHandle(scope: AgScope, name: string, generation = 0): DocHandle {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const color = COLORS[Math.abs(hash(this.user.id)) % COLORS.length];
    awareness.setLocalStateField("user", { name: this.user.name || "Someone", color });
    const handle: DocHandle = {
      name, scope, doc, awareness, synced: false, readOnly: true, revoked: false, generation, refs: 0,
      listeners: new Set(), dirtyOffline: false, cleanup: () => {},
    };
    let queued: Uint8Array[] = [];
    let flushScheduled = false;
    const onUpdate = (u: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      if (handle.readOnly) return;
      if (!this.open || !handle.synced) { handle.dirtyOffline = true; return; }
      queued.push(u);
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(() => {
          flushScheduled = false;
          const merged = queued.length === 1 ? queued[0] : Y.mergeUpdates(queued);
          queued = [];
          this.raw({ t: "doc.update", doc: name, u: b64(merged) });
        });
      }
    };
    doc.on("update", onUpdate);
    const onAwareness = ({ added, updated, removed }: any, origin: unknown) => {
      if (origin === REMOTE) return;
      const changed = added.concat(updated, removed);
      this.raw({ t: "doc.awareness", doc: name, u: b64(encodeAwarenessUpdate(awareness, changed)) });
    };
    awareness.on("update", onAwareness);
    handle.cleanup = () => {
      doc.off("update", onUpdate);
      awareness.off("update", onAwareness);
      removeAwarenessStates(awareness, [doc.clientID], "local");
      awareness.destroy();
      doc.destroy();
    };
    return handle;
  }

  closeDoc(name: string) {
    const d = this.docs.get(name);
    if (!d) return;
    d.refs--;
    if (d.refs > 0) return;
    // Let a quick re-open (re-render, tab switch) reuse the synced doc.
    setTimeout(() => {
      const cur = this.docs.get(name);
      if (!cur || cur.refs > 0) return;
      this.raw({ t: "doc.awareness", doc: name, u: b64(encodeAwarenessUpdate(cur.awareness, [cur.doc.clientID], new Map())) });
      this.docs.delete(name);
      this.raw({ t: "doc.unsub", doc: name });
      cur.cleanup();
    }, 10_000);
  }

  getDoc(name: string) { return this.docs.get(name); }

  subscribeDoc(name: string, l: Listener) {
    const d = this.docs.get(name);
    if (!d) return () => {};
    d.listeners.add(l);
    return () => { d.listeners.delete(l); };
  }
  private notifyDoc(d: DocHandle) { d.listeners.forEach((l) => l()); }

  /** Replace a doc whose local edits were refused — the server's copy wins. */
  private resetDoc(d: DocHandle) {
    const fresh = this.createDocHandle(d.scope, d.name, d.generation + 1);
    fresh.refs = d.refs;
    fresh.listeners = d.listeners;
    this.docs.set(d.name, fresh);
    d.cleanup();
    this.raw({ t: "doc.unsub", doc: d.name });
    this.raw({ t: "doc.sub", scope: d.scope, doc: d.name });
    this.notifyDoc(fresh);
  }

  // --- incoming -------------------------------------------------------------------
  private handle(msg: AgServerMsg) {
    switch (msg.t) {
      case "scope.snapshot": {
        const s = this.scopes.get(msg.scope);
        if (!s) return;
        s.state = this.stateFrom(s.state, msg, false);
        s.listeners.forEach((l) => l());
        this.scheduleSave(msg.scope);
        return;
      }
      case "scope.denied": {
        const s = this.scopes.get(msg.scope);
        if (!s) return;
        s.state = { ...s.state, ready: true, denied: msg.reason, version: s.state.version + 1 };
        s.listeners.forEach((l) => l());
        return;
      }
      case "upsert": {
        const s = this.scopes.get(msg.scope);
        if (!s) return;
        const map = mapFor(s.state, msg.kind);
        map.set((msg.item as any).id, msg.item as any);
        this.bump(msg.scope);
        return;
      }
      case "remove": {
        const s = this.scopes.get(msg.scope);
        if (!s) return;
        mapFor(s.state, msg.kind).delete(msg.id);
        this.bump(msg.scope);
        return;
      }
      case "batch": {
        // Everything one change touched: apply it all, then render once.
        const s = this.scopes.get(msg.scope);
        if (!s) return;
        for (const it of msg.items) {
          const map = mapFor(s.state, it.kind);
          if (it.item) map.set((it.item as any).id, it.item as any);
          else if (it.id) map.delete(it.id);
        }
        if (msg.settings) s.state.settings = msg.settings;
        this.bump(msg.scope);
        return;
      }
      case "settings": {
        const s = this.scopes.get(msg.scope);
        if (!s) return;
        s.state.settings = msg.settings;
        this.bump(msg.scope);
        return;
      }
      case "op.ack": {
        const p = this.pending.get(msg.rid);
        if (!p) return;
        this.pending.delete(msg.rid);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.result ?? {});
        else p.reject(new Error(msg.error));
        return;
      }
      case "doc.sync": {
        const d = this.docs.get(msg.doc);
        if (!d) return;
        Y.applyUpdate(d.doc, unb64(msg.u), REMOTE);
        d.readOnly = msg.readOnly;
        d.synced = true;
        d.revoked = false;
        // Edits made while disconnected go up now that we're caught up.
        if (d.dirtyOffline && !d.readOnly) this.raw({ t: "doc.update", doc: d.name, u: b64(Y.encodeStateAsUpdate(d.doc)) });
        d.dirtyOffline = false;
        // Announce our presence (cursor colour/name).
        this.raw({ t: "doc.awareness", doc: d.name, u: b64(encodeAwarenessUpdate(d.awareness, [d.doc.clientID])) });
        this.notifyDoc(d);
        return;
      }
      case "doc.update": {
        const d = this.docs.get(msg.doc);
        if (d) Y.applyUpdate(d.doc, unb64(msg.u), REMOTE);
        return;
      }
      case "doc.awareness": {
        const d = this.docs.get(msg.doc);
        if (d) applyAwarenessUpdate(d.awareness, unb64(msg.u), REMOTE);
        return;
      }
      case "doc.mode": {
        const d = this.docs.get(msg.doc);
        if (!d) return;
        d.readOnly = msg.readOnly;
        this.notifyDoc(d);
        return;
      }
      case "doc.revoked": {
        const d = this.docs.get(msg.doc);
        if (!d) return;
        // Wipe what we held: the viewer is no longer allowed to have it.
        d.revoked = true;
        d.synced = false;
        const fresh = this.createDocHandle(d.scope, d.name, d.generation + 1);
        fresh.refs = d.refs;
        fresh.listeners = d.listeners;
        fresh.revoked = true;
        this.docs.set(d.name, fresh);
        d.cleanup();
        this.notifyDoc(fresh);
        return;
      }
      case "doc.denied": {
        const d = this.docs.get(msg.doc);
        if (!d) return;
        if (!d.synced) {
          d.revoked = true;
          this.notifyDoc(d);
        } else {
          d.readOnly = true;
          this.resetDoc(d);
        }
        return;
      }
      case "pong": return;
    }
  }

  /** Re-request a doc that was revoked (e.g. after permissions were granted again). */
  retryDoc(name: string) {
    const d = this.docs.get(name);
    if (!d || !d.revoked) return;
    d.revoked = false;
    this.raw({ t: "doc.sub", scope: d.scope, doc: d.name });
  }
}

function mapFor(s: ScopeState, kind: string): Map<string, any> {
  switch (kind) {
    case "note": return s.notes;
    case "field": return s.fields;
    case "region": return s.regions;
    case "link": return s.links;
    case "modifier": return s.modifiers;
    case "action": return s.actions;
    case "component": return s.components;
  }
  return new Map();
}

function b64(u: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u.length; i += chunk) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + chunk)));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export const agClient = new AgnosticClient();
