// React access to Agnostic live state.
//
// <AgScopeProvider scope=…> subscribes to a scope for its subtree. Everything
// under it reads through useAg(), which already applies "preview as player":
// when the GM previews, the same shared ACL rules the server uses filter what
// is shown, and editing is limited to what that player could edit.
import { climb, reachAll } from "@shared/agnostic/compute";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AgField, AgLink, AgNote, AgScope, AgViewer, AgValue } from "@shared/agnostic/types";
import { scopeKey, noteDocName, regionDocName, agLibrarySystem } from "@shared/agnostic/types";
import {
  canViewNote, canViewField, canViewRegion, canSeeAction, canViewLink, canEditField, canEditNoteHeader,
  canEditBody, canViewBody, canEditRegion, canRunAction,
} from "@shared/agnostic/acl";
import type { AgOp } from "@shared/agnostic/protocol";
import { agClient, type ScopeState, type DocHandle } from "./client";
import { useAuth } from "@/lib/AuthContext";

interface AgCtx {
  scope: AgScope;
  key: string;
  /** The game system this scope belongs to ("agnostic" or a system built on it): picks its libraries. */
  system: string;
  /** Filtered for the effective viewer (preview-aware). */
  state: ScopeState;
  /** Who we're rendering for. */
  viewer: AgViewer;
  /** The real user (GM stays GM even while previewing). */
  realViewer: AgViewer;
  previewUserId: string | null;
  setPreviewUserId: (id: string | null) => void;
  request: <T = any>(op: AgOp) => Promise<T>;
  openNote: (noteId: string) => void;
}

const Ctx = createContext<AgCtx | null>(null);

function useScopeState(scope: AgScope): ScopeState | undefined {
  const key = scopeKey(scope);
  useEffect(() => agClient.retainScope(scope), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(
    (cb) => agClient.subscribeScope(key, cb),
    () => agClient.getScope(key),
  );
}

/** Filter a scope state down to what `viewer` could see (preview as player). */
export function filterState(st: ScopeState, viewer: AgViewer): ScopeState {
  const notes = new Map([...Array.from(st.notes)].filter(([, n]) => canViewNote(n, viewer)));
  const fields = new Map([...Array.from(st.fields)].filter(([, f]) => { const n = notes.get(f.noteId); return !!n && canViewField(f, n, viewer); }));
  const regions = new Map([...Array.from(st.regions)].filter(([, r]) => { const n = notes.get(r.noteId); return !!n && canViewRegion(r, n, viewer); }));
  const actions = new Map([...Array.from(st.actions)].filter(([, a]) => { const n = notes.get(a.noteId); return !!n && canSeeAction(a as any, n, viewer); }));
  const links = new Map([...Array.from(st.links)].filter(([, l]) => canViewLink(l, notes.get(l.fromNoteId), notes.get(l.toNoteId), viewer)));
  const modifiers = new Map([...Array.from(st.modifiers)].filter(([, m]) => notes.has(m.noteId)));
  return { ...st, notes, fields, regions, actions, links, modifiers, isGM: false };
}

export function AgScopeProvider({ scope, children, onOpenNote, blocking = true, system: systemProp }: { scope: AgScope; children: React.ReactNode; onOpenNote?: (noteId: string) => void; blocking?: boolean; system?: string | null }) {
  const system = systemProp || agLibrarySystem(scope) || "agnostic";
  const raw = useScopeState(scope);
  const { user } = useAuth() as any;
  useEffect(() => {
    if (user) agClient.setUser({ id: user.id, name: user.username || user.name || "Someone" });
  }, [user]);
  const key = scopeKey(scope);
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);
  const realViewer: AgViewer = useMemo(() => ({ userId: raw?.userId || user?.id || "", isGM: !!raw?.isGM }), [raw?.userId, raw?.isGM, user?.id]);
  const viewer: AgViewer = previewUserId && realViewer.isGM ? { userId: previewUserId, isGM: false } : realViewer;
  const state = useMemo(() => {
    if (!raw) return undefined;
    return previewUserId && realViewer.isGM ? filterState(raw, viewer) : raw;
  }, [raw, previewUserId, realViewer.isGM]); // eslint-disable-line react-hooks/exhaustive-deps
  const request = useCallback(<T,>(op: AgOp) => agClient.request<T>(scope, op), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // A sheet you only see as a card on the player tracker doesn't open.
  const openNote = useCallback((id: string) => {
    if (state?.notes.get(id)?.trackerOnly) return;
    onOpenNote?.(id);
  }, [onOpenNote, state]);
  const value = useMemo<AgCtx | null>(() => state ? ({ scope, key, system, state, viewer, realViewer, previewUserId, setPreviewUserId, request, openNote }) : null,
    [state, viewer.userId, viewer.isGM, realViewer, previewUserId, request, openNote, system]); // eslint-disable-line react-hooks/exhaustive-deps
  const usable = !!value && value.state.ready && !value.state.denied;
  // Non-blocking mounts (a whole campaign page) keep the same tree shape and
  // just expose no context until Agnostic is ready — nothing remounts.
  if (!blocking) return <Ctx.Provider value={usable ? value : null}>{children}</Ctx.Provider>;
  if (!usable) {
    if (!value) return <div className="p-4 text-sm text-stone-400">Connecting…</div>;
    if (value.state.denied) return <div className="p-4 text-sm text-red-300">{value.state.denied}</div>;
    return <div className="p-4 text-sm text-stone-400">Loading…</div>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Use when a component may be rendered outside a provider (renders nothing then). */
export function useAgMaybe(): AgCtx | null {
  return useContext(Ctx);
}
export function useAg(): AgCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAg outside AgScopeProvider");
  return c;
}

// --- selectors ------------------------------------------------------------------------
export function useNote(noteId: string | null | undefined): AgNote | undefined {
  const { state } = useAg();
  return noteId ? state.notes.get(noteId) : undefined;
}

// Lookups by sheet, built once per change and shared by every widget (a big
// sheet has hundreds of values on screen; scanning the whole campaign for each
// one made every update slow).
interface ScopeIndex {
  fieldsByNote: Map<string, AgField[]>;
  fieldByNoteKey: Map<string, Map<string, AgField[]>>;
  linksByNote: Map<string, AgLink[]>;
}
const indexes = new WeakMap<ScopeState, ScopeIndex>();
export function scopeIndex(state: ScopeState): ScopeIndex {
  let ix = indexes.get(state);
  if (ix) return ix;
  ix = { fieldsByNote: new Map(), fieldByNoteKey: new Map(), linksByNote: new Map() };
  for (const f of Array.from(state.fields.values())) {
    let list = ix.fieldsByNote.get(f.noteId);
    if (!list) { list = []; ix.fieldsByNote.set(f.noteId, list); }
    list.push(f);
    let byKey = ix.fieldByNoteKey.get(f.noteId);
    if (!byKey) { byKey = new Map(); ix.fieldByNoteKey.set(f.noteId, byKey); }
    const same = byKey.get(f.key);
    if (same) same.push(f); else byKey.set(f.key, [f]);
  }
  for (const list of Array.from(ix.fieldsByNote.values())) list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  for (const l of Array.from(state.links.values())) {
    for (const id of [l.fromNoteId, l.toNoteId]) {
      let list = ix.linksByNote.get(id);
      if (!list) { list = []; ix.linksByNote.set(id, list); }
      if (!list.includes(l)) list.push(l);
    }
  }
  indexes.set(state, ix);
  return ix;
}

export function fieldsOf(state: ScopeState, noteId: string): AgField[] {
  return [...(scopeIndex(state).fieldsByNote.get(noteId) ?? [])];
}
/** Links touching a sheet (either end). */
export function linksOfNote(state: ScopeState, noteId: string): AgLink[] {
  return scopeIndex(state).linksByNote.get(noteId) ?? [];
}

export function useNoteFields(noteId: string): AgField[] {
  const { state } = useAg();
  return useMemo(() => fieldsOf(state, noteId), [state, noteId]);
}

/** Notes reached from noteId by one connection label (client-visible links only). */
function followOne(state: ScopeState, noteId: string, l: string): string[] {
  if (l === "self" || !l) return [noteId];
  const out: string[] = [];
  for (const link of linksOfNote(state, noteId)) {
    if (link.fromNoteId === noteId && link.label === l) out.push(link.toNoteId);
    if (link.toNoteId === noteId && link.reverseLabel === l) out.push(link.fromNoteId);
  }
  return out.filter((id) => state.notes.has(id));
}

/**
 * Notes reached from noteId by a connection label, or a path of them:
 * "ability.holder" = the holder of this sheet's ability; "abilities.aspects"
 * = every aspect of every ability this sheet has.
 */
export function follow(state: ScopeState, noteId: string, label: string): string[] {
  return Array.from(followWithParents(state, noteId, label).keys());
}

/** Like follow, with the sheet each one was reached from (its direct connection: what to disconnect it from). */
export function followWithParents(state: ScopeState, noteId: string, label: string): Map<string, string> {
  const path = label.toLowerCase().split(".").filter(Boolean);
  let set = new Map<string, string>([[noteId, noteId]]);
  for (const seg of path.length ? path : ["self"]) {
    if (seg === "self") continue;
    const next = new Map<string, string>();
    const step = (ids: string[], l: string) => Array.from(new Set(ids.flatMap((x) => followOne(state, x, l))));
    for (const id of Array.from(set.keys())) {
      if (seg.endsWith("+")) {
        // "abilities+": every one along the way, each with the sheet it hangs from.
        for (const [to, from] of Array.from(reachAll([id], seg.slice(0, -1), step).entries())) if (!next.has(to)) next.set(to, from);
        continue;
      }
      // "holder*": followed as far as it goes (the parent is where the chain started).
      const reached = seg.endsWith("*") ? climb([id], seg.slice(0, -1), step) : followOne(state, id, seg);
      for (const to of reached) if (!next.has(to)) next.set(to, id);
    }
    set = next;
  }
  return set;
}

/** Is this connection label a path through other sheets ("abilities.aspects")? */
export const isLinkPath = (label: string) => label.split(".").filter((x) => x && x !== "self").length > 1;

export function connectionLabels(state: ScopeState, noteId: string): string[] {
  const set = new Set<string>();
  for (const link of linksOfNote(state, noteId)) {
    if (link.fromNoteId === noteId) set.add(link.label);
    if (link.toNoteId === noteId) set.add(link.reverseLabel);
  }
  return [...Array.from(set)];
}

/**
 * Resolve a FieldRef ("hp", "@owner.str", "@{noteId}.hp", "$param") from a
 * note to the live field(s) it names. Params are substituted first.
 */
export function resolveRef(state: ScopeState, noteId: string, ref: string | undefined | null, params?: Record<string, string>): AgField[] {
  if (!ref) return [];
  let r = ref.trim();
  if (r.startsWith("$")) {
    // A parameter left unconnected uses this sheet's value with the same key.
    const name = r.slice(1).toLowerCase();
    r = (params?.[name] || name).trim();
  }
  let start = noteId;
  const abs = /^@\{([^}]+)\}\.(.+)$/.exec(r);
  if (abs) { start = abs[1]; r = abs[2]; }
  const path = r.replace(/^@/, "").toLowerCase().split(".").filter(Boolean);
  if (!path.length) return [];
  let set = [start];
  for (let i = 0; i < path.length - 1; i++) set = [...Array.from(new Set(set.flatMap((id) => follow(state, id, path[i]))))];
  const key = path[path.length - 1];
  const out: AgField[] = [];
  const ix = scopeIndex(state);
  for (const id of set) { const hit = ix.fieldByNoteKey.get(id)?.get(key); if (hit) out.push(...hit); }
  return out;
}

export function useRef1(noteId: string, ref: string | undefined | null, params?: Record<string, string>): AgField | undefined {
  const { state } = useAg();
  return useMemo(() => resolveRef(state, noteId, ref, params)[0], [state, noteId, ref, params]);
}

export function effOf(f: AgField | undefined): AgValue {
  if (!f) return null;
  return f.eff !== undefined ? f.eff : f.value;
}

// --- permission helpers (preview-aware) --------------------------------------------------
export function usePerms(noteId: string | null | undefined) {
  const { state, viewer } = useAg();
  const note = noteId ? state.notes.get(noteId) : undefined;
  return useMemo(() => ({
    note,
    canEditHeader: !!note && canEditNoteHeader(note, viewer),
    canViewBody: !!note && canViewBody(note, viewer),
    canEditBody: !!note && canEditBody(note, viewer),
    canEditField: (f: AgField) => !!note && canEditField(f, note, viewer),
    canEditRegion: (regionId: string) => { const r = state.regions.get(regionId); return !!note && !!r && canEditRegion(r, note, viewer); },
    canRun: (actionId: string) => { const a = state.actions.get(actionId); return !!note && !!a && canRunAction(a as any, note, viewer); },
    isGM: viewer.isGM,
  }), [note, viewer, state]);
}

// --- documents ----------------------------------------------------------------------------
export function useDoc(name: string | null): DocHandle | null {
  const { scope } = useAg();
  const [handle, setHandle] = useState<DocHandle | null>(null);
  useEffect(() => {
    if (!name) { setHandle(null); return; }
    agClient.openDoc(scope, name);
    const update = () => setHandle(agClient.getDoc(name) ? { ...agClient.getDoc(name)! } : null);
    update();
    const off = agClient.subscribeDoc(name, update);
    return () => { off(); agClient.closeDoc(name); };
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  return handle;
}

/**
 * Open every document of a sheet at once (its page and all its sections) while
 * it's on screen. Sections otherwise only ask for their text once the page
 * above them has drawn, one wave after another; this makes it one request.
 */
export function usePrefetchSheetDocs(noteId: string | null | undefined) {
  const { scope, state } = useAg();
  const note = noteId ? state.notes.get(noteId) : undefined;
  const names: string[] = [];
  if (note) {
    names.push(noteDocName(note.id, note.docEpoch));
    for (const r of Array.from(state.regions.values())) if (r.noteId === note.id) names.push(regionDocName(r.id, note.docEpoch));
  }
  const key = names.join("|");
  useEffect(() => {
    if (!key) return;
    const list = key.split("|");
    list.forEach((n) => agClient.openDoc(scope, n));
    return () => list.forEach((n) => agClient.closeDoc(n));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const docNames = { note: noteDocName, region: regionDocName };

/** Members by id → name, for permission pickers. */
export function useMemberName() {
  const { state } = useAg();
  return useCallback((id: string) => state.members.find((m) => m.userId === id)?.name ?? "Player", [state.members]);
}
