// Browse, search and create sheets in a scope. Used by the campaign's
// side panel, My Library and the Admin library.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Folder, FolderOpen, FolderPlus, Blocks, Pin, PinOff, MapPin, Download, Library, ChevronRight, ChevronDown,
  Lock, Flame, Loader2, MoreVertical, ExternalLink, Share2, Pencil, Copy, Trash2,
} from "lucide-react";
import { createPortal } from "react-dom";
import { AclEditor } from "./pickers";
import type { AgAcl } from "@shared/agnostic/types";
import type { AgNote, AgScope } from "@shared/agnostic/types";
import { AG_BUILTIN_TYPES, agTypeLabel, agLibraryScope } from "@shared/agnostic/types";
import { canEditNoteHeader } from "@shared/agnostic/acl";
import {
  buildFolderTree, canMoveFolder, childFolder, cleanFolderName, countIn, folderName, inFolder, movedFolder,
  normalizeFolder, parentFolder, parseTabFolder, tabFolderKey, type FolderNode,
} from "@shared/agnostic/folders";
import { useToast } from "@/hooks/use-toast";
import { AgPanel, agConfirm } from "./float";
import { NotePicker } from "./pickers";
import { useAuth } from "@/lib/AuthContext";
import { useAg, AgScopeProvider } from "./hooks";
import { usePlayView } from "./viewMode";
import { Portrait } from "./widgets";
import { agClient } from "./client";
import { ComponentsManager } from "./ComponentsManager";
import { MenuAt, type MenuItem } from "./menu";
import { ImportExportDialog } from "./ImportExport";
import { GuideButton } from "./AgGuide";

/**
 * The browser's tabs. A tab for each kind of thing a table keeps, and every
 * sheet lands on one of them — Items is the catch-all, so blueprints, recipes
 * and whatever kind a GM invents sit with the things. Inside a tab it's
 * folders: a folder you made and named says what's in it better than a row of
 * type chips did.
 */
type Tab = "characters" | "abilities" | "items" | "beasts" | "notes";
const TAB_TYPES: Record<string, string[]> = {
  characters: ["character", "npc", "species"],
  // An ability and its aspects (its single uses) are one thing, kept together.
  abilities: ["ability", "aspect"],
  beasts: ["beast"],
  notes: ["note", "location"],
};
const CONTENT_TABS: Array<[Tab, string]> = [
  ["characters", "Characters"], ["abilities", "Abilities"], ["items", "Items"], ["beasts", "Beasts"], ["notes", "Notes"],
];
/** Which tab a kind of sheet sits on. Anything unclaimed is a thing, so: Items. */
export const agTabOfType = (type: string): Tab => (Object.keys(TAB_TYPES).find((k) => TAB_TYPES[k].includes(type)) as Tab) ?? "items";

export interface BrowserOptions {
  /** Only these note types are offered (libraries: character/item/species). */
  types?: string[];
  onPlaceOnMap?: (noteId: string) => void;
  showTrackerPin?: boolean;
  /** Offer importing from My Library / Admin (campaigns). */
  importSources?: boolean;
  /** Only these tabs. One tab, and its row is hidden — there is nothing to choose. */
  tabs?: Tab[];
}

/** An empty folder nobody has filled yet, remembered in this browser's own list. */
function useRememberedFolders(scopeKey: string): [string[], (next: string[]) => void] {
  const key = `ag-folders:${scopeKey}`;
  const [v, setV] = useState<string[]>(() => {
    try { const raw = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []; }
    catch { return []; }
  });
  return [v, (next) => { setV(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ } }];
}

export function AgNotesBrowser({ opts = {} }: { opts?: BrowserOptions }) {
  const { state, viewer, openNote, system, scope, request, key: scopeKey } = useAg();
  const { toast } = useToast();
  const play = usePlayView();
  const isGM = viewer.isGM;
  const allowed = opts.tabs;
  const [tabState, setTab] = useState<Tab>(allowed?.[0] ?? "characters");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<null | { template: boolean; type?: string; folder: string }>(null);
  const [io, setIo] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parts, setParts] = useState(false);
  const [naming, setNaming] = useState<null | { parent: string; path?: string }>(null);
  const [listMenu, setListMenu] = useState<null | { x: number; y: number }>(null);
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [mine, setMine] = useRememberedFolders(scopeKey);

  const fail = (e: any) => toast({ title: "Couldn't do that", description: e?.message, variant: "destructive" });
  const all = [...Array.from(state.notes.values())];
  const typeIds = useMemo(() => {
    const base = opts.types ?? AG_BUILTIN_TYPES.map((t) => t.id);
    return [...Array.from(new Set([...base, ...all.map((n) => n.type).filter((t) => !opts.types || opts.types.includes(t))]))];
  }, [all.length, opts.types]); // eslint-disable-line react-hooks/exhaustive-deps
  const typesOf = (t: Tab) => typeIds.filter((x) => agTabOfType(x) === t);
  // A tab that could never hold anything here isn't offered (My Library keeps no notes).
  const tabs = CONTENT_TABS.filter(([t]) => (!allowed || allowed.includes(t)) && typesOf(t).length > 0);
  const tab: Tab = tabs.some(([t]) => t === tabState) ? tabState : tabs[0]?.[0] ?? "characters";
  const tabTypes = typesOf(tab);
  /** Who may press New here: anyone on a tab of notes, the GM anywhere. */
  const mayCreate = isGM || tab === "notes";
  const search = q.trim().toLowerCase();
  // Templates sit with what they make, in whatever folder they're filed in;
  // they're the GM's building material, so players never see them at all.
  const list = all
    .filter((n) => tabTypes.includes(n.type))
    // One of a kind of creature, out on the table: it belongs to its token.
    // Leaving it out is the point — the only beast you can pick up is the
    // original, with its own stats, not a copy halfway through a fight.
    .filter((n) => !n.spawnedFrom)
    .filter((n) => isGM || !n.isTemplate)
    .filter((n) => !search || n.name.toLowerCase().includes(search))
    .sort((a, b) => Number(b.isTemplate) - Number(a.isTemplate) || a.name.localeCompare(b.name));

  // Folders live on the sheets, so the ones with anything in them need no list.
  // This is the rest: made, named, and still waiting for something.
  const empties = useMemo(() => {
    // An empty folder the GM made is the campaign's, but a player has no use
    // for one until something they can see is in it.
    const raw = Array.from(new Set([...(isGM ? state.settings?.folders ?? [] : []), ...mine]));
    return raw.map(parseTabFolder).filter((f): f is { tab: string; path: string } => !!f);
  }, [state.settings?.folders, mine, isGM]);
  const tree = useMemo(() => buildFolderTree(list, search ? [] : empties.filter((f) => f.tab === tab).map((f) => f.path)), [list, empties, tab, search]);

  const rememberFolders = async (next: Array<{ tab: string; path: string }>) => {
    const keys = Array.from(new Set(next.map((f) => tabFolderKey(f.tab, f.path))));
    // The GM's folders are the campaign's, so everyone gets them at once. A
    // player's own are their own, and live in their browser.
    if (scope.kind === "campaign" && isGM && state.settings) {
      try { await request({ op: "settings.update", settings: { ...state.settings, folders: keys } }); return; }
      catch (e) { fail(e); return; }
    }
    setMine(keys);
  };
  const addFolder = (parent: string, name: string) => {
    const clean = cleanFolderName(name);
    if (!clean) return;
    void rememberFolders([...empties, { tab, path: childFolder(parent, clean) }]);
  };
  const moveNote = (id: string, folder: string) => {
    const note = state.notes.get(id);
    if (!note || normalizeFolder(note.folder) === normalizeFolder(folder)) return;
    request({ op: "note.update", id, patch: { folder: folder || null } }).catch(fail);
  };
  /** Moving, renaming and deleting a folder are all one thing: its sheets get a new path. */
  const refolder = (from: string, to: string) => {
    for (const n of all) {
      if (!inFolder(n.folder ?? "", from) || !n.folder) continue;
      const next = movedFolder(n.folder, from, to);
      if (next !== normalizeFolder(n.folder)) request({ op: "note.update", id: n.id, patch: { folder: next || null } }).catch(fail);
    }
    const kept = empties.filter((f) => !(f.tab === tab && inFolder(f.path, from)));
    const moved = to ? empties.filter((f) => f.tab === tab && inFolder(f.path, from)).map((f) => ({ tab, path: movedFolder(f.path, from, to) })) : [];
    void rememberFolders([...kept, ...moved]);
  };
  const dropFolder = (from: string, parent: string) => { if (canMoveFolder(from, parent)) refolder(from, childFolder(parent, folderName(from))); };
  const renameFolder = (path: string, name: string) => {
    const clean = cleanFolderName(name);
    if (clean && clean !== folderName(path)) refolder(path, childFolder(parentFolder(path), clean));
  };
  const deleteFolder = async (path: string) => {
    const ok = await agConfirm(`Everything in “${folderName(path)}” moves up one level. Nothing is deleted.`, { title: "Remove this folder?", confirm: "Remove it" });
    if (ok) refolder(path, parentFolder(path));
  };
  /** Folders are tidying: the GM files anything, a player files what's theirs. */
  const mayFile = (note: AgNote) => canEditNoteHeader(note, viewer);
  const mayFolder = isGM || tab === "notes";
  const starterTypes = tabTypes.filter((t) => ["character", "npc", "item", "beast"].includes(t));

  const folderProps = {
    opts, onOpen: openNote, shut, toggle: (p: string) => setShut((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; }),
    moveNote, dropFolder, mayFile, mayFolder,
    onNewInside: (parent: string) => setNaming({ parent }),
    onRename: (path: string) => setNaming({ parent: parentFolder(path), path }),
    onDelete: deleteFolder,
    onNewHere: (folder: string) => setCreating({ template: false, folder, type: tabTypes.length === 1 ? tabTypes[0] : undefined }),
    mayCreate,
  };

  return (
    <div className="h-full flex flex-col text-stone-200" data-testid="ag-browser">
      {tabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 px-2 pt-2 shrink-0" data-testid="ag-browser-tabs">
          {tabs.map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`h-8 px-2.5 rounded text-xs ${tab === t ? "bg-amber-600/90 text-white" : "bg-stone-800/80 text-stone-300"}`} data-testid={`ag-browser-tab-${t}`}>{label}</button>
          ))}
          {/* The building tools keep together, and wrap as one when the tabs fill the row. */}
          {isGM && !play && <span className="ml-auto flex items-center gap-1">
            <GuideButton compact topic="start" />
            <button type="button" onClick={() => setParts(true)} className="h-8 w-8 grid place-items-center rounded bg-stone-800/80 text-stone-300" title="Components — the pieces sheets are built from" data-testid="ag-components"><Blocks className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setIo(true)} className="h-8 w-8 grid place-items-center rounded bg-stone-800/80 text-stone-300" title="Import / export templates" data-testid="ag-io"><Download className="h-3.5 w-3.5" /></button>
          </span>}
        </div>
      )}
      <div className="p-2 space-y-1.5 shrink-0">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-stone-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-9 pl-7 pr-2 rounded bg-stone-900 border border-stone-700 text-sm" data-testid="ag-browser-search" />
          </div>
          {mayFolder && <button type="button" onClick={() => setNaming({ parent: "" })} className="h-9 w-9 grid place-items-center rounded bg-stone-800 hover:bg-stone-700 text-stone-200" title="New folder" aria-label="New folder" data-testid="ag-new-folder"><FolderPlus className="h-4 w-4" /></button>}
          {mayCreate && <button type="button" onClick={() => setCreating({ template: false, folder: "", type: tabTypes.length === 1 ? tabTypes[0] : undefined })} className="h-9 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm inline-flex items-center gap-1" data-testid="ag-new"><Plus className="h-4 w-4" /> New</button>}
        </div>
        {isGM && !play && opts.importSources && <button type="button" onClick={() => setImporting(true)} className="h-8 w-full rounded border border-dashed border-stone-700 text-xs text-stone-300 hover:border-amber-600 inline-flex items-center justify-center gap-1.5" data-testid="ag-import-from-library"><Library className="h-3.5 w-3.5" /> Bring in from My Library / Admin</button>}
      </div>
      {/* Drop a sheet out here and it leaves whatever folder it was in, and
          right-click for the things you can make. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3" data-testid="ag-folder-root"
        onContextMenu={(e) => { if (!mayCreate && !mayFolder) return; e.preventDefault(); setListMenu({ x: e.clientX, y: e.clientY }); }}
        onDragOver={(e) => { if (dragKind(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
        onDrop={(e) => {
          const k = dragKind(e);
          if (!k) return;
          e.preventDefault();
          if (k === "note") moveNote(e.dataTransfer.getData(DND_NOTE), "");
          else dropFolder(e.dataTransfer.getData(DND_FOLDER), "");
        }}>
        <FolderRows node={tree} {...folderProps} />
        {!list.length && <div className="text-sm text-stone-500 p-3 text-center" data-testid="ag-browser-empty">{search ? "Nothing matches." : mayCreate ? "Nothing here yet — press New." : "Nothing has been shared with you yet."}</div>}
        {!all.length && isGM && <div className="text-center"><GuideButton label="New to Agnostic? Open the step-by-step guide" /></div>}
        {isGM && !play && !!starterTypes.length && !all.some((n) => n.isTemplate && tabTypes.includes(n.type)) && <StarterTemplates types={starterTypes} />}
        {isGM && !play && !opts.types && tab === "characters" && <StarterKits />}
      </div>
      {listMenu && (
        <MenuAt at={listMenu} testId="ag-list-menu" onClose={() => setListMenu(null)} items={[
          // Right-clicking the list makes what the list is for: on Items a new
          // item, on Characters a new character, and a folder to keep it in.
          ...(mayCreate ? [{
            icon: <Plus className="h-4 w-4" />,
            label: `New ${tabTypes.length === 1 ? agTypeLabel(tabTypes[0]).toLowerCase() : "sheet"}`,
            run: () => setCreating({ template: false, folder: "", type: tabTypes.length === 1 ? tabTypes[0] : undefined }),
            testId: "new",
          } as MenuItem] : []),
          ...(mayFolder ? [{ icon: <FolderPlus className="h-4 w-4" />, label: "New folder", run: () => setNaming({ parent: "" }), testId: "new-folder" } as MenuItem] : []),
          ...(isGM && !play && opts.importSources ? ["sep" as MenuItem,
            { icon: <Library className="h-4 w-4" />, label: "Bring in from My Library / Admin", run: () => setImporting(true), testId: "import" } as MenuItem] : []),
        ]} />
      )}
      {creating && <CreateDialog template={creating.template} types={tabTypes} startType={creating.type} folder={creating.folder} onClose={() => setCreating(null)} />}
      {naming && <FolderDialog name={naming.path ? folderName(naming.path) : ""} parent={naming.parent}
        onSave={(name) => { naming.path ? renameFolder(naming.path, name) : addFolder(naming.parent, name); setNaming(null); }}
        onClose={() => setNaming(null)} />}
      {io && <ImportExportDialog onClose={() => setIo(false)} />}
      {parts && <AgPanel title="Components" onClose={() => setParts(false)} width={520} height={620} testId="ag-components-panel"><ComponentsManager /></AgPanel>}
      {importing && <ImportFromLibraryDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

// What's being dragged over a folder: one sheet, or a folder and all of its own.
const DND_NOTE = "application/ag-note";
const DND_FOLDER = "application/ag-folder";
const dragKind = (e: React.DragEvent): "note" | "folder" | null => {
  const t = Array.from(e.dataTransfer.types ?? []);
  return t.includes(DND_NOTE) ? "note" : t.includes(DND_FOLDER) ? "folder" : null;
};

interface FolderProps {
  opts: BrowserOptions;
  onOpen: (id: string) => void;
  shut: Set<string>;
  toggle: (path: string) => void;
  moveNote: (id: string, folder: string) => void;
  dropFolder: (from: string, parent: string) => void;
  mayFile: (note: AgNote) => boolean;
  mayFolder: boolean;
  mayCreate: boolean;
  onNewInside: (parent: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onNewHere: (folder: string) => void;
}

/** The folders of one folder, then its own sheets. */
function FolderRows({ node, ...p }: { node: FolderNode<AgNote> } & FolderProps) {
  return (
    <>
      {node.folders.map((f) => <FolderBlock key={f.path} node={f} {...p} />)}
      <div className="space-y-1">{node.items.map((n) => <NoteRow key={n.id} note={n} opts={p.opts} onOpen={p.onOpen} mayFile={p.mayFile(n)} />)}</div>
    </>
  );
}

function FolderBlock({ node, ...p }: { node: FolderNode<AgNote> } & FolderProps) {
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<null | { x: number; y: number }>(null);
  const open = !p.shut.has(node.path);
  const count = countIn(node);
  const take = (e: React.DragEvent) => {
    const k = dragKind(e);
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    if (k === "note") p.moveNote(e.dataTransfer.getData(DND_NOTE), node.path);
    else p.dropFolder(e.dataTransfer.getData(DND_FOLDER), node.path);
  };
  return (
    // Anywhere in the folder's block takes a drop, not just the row with its
    // name on it: aiming at a two-line strip is no fun.
    <div className={`rounded ${over ? "bg-amber-600/10 ring-1 ring-amber-500/70" : ""}`}
      onDragOver={(e) => { if (dragKind(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={take}>
      <div className="flex items-center gap-1 rounded px-1 bg-stone-900/50"
        draggable={p.mayFolder}
        onDragStart={(e) => { e.dataTransfer.setData(DND_FOLDER, node.path); e.dataTransfer.effectAllowed = "move"; }}
        onContextMenu={(e) => { if (!p.mayFolder) return; e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
        data-testid={`ag-folder-${node.path}`}>
        <button type="button" onClick={() => p.toggle(node.path)} className="flex items-center gap-1 flex-1 min-w-0 text-[11px] uppercase tracking-wide text-stone-400 py-1">
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {open ? <FolderOpen className="h-3 w-3 shrink-0 text-amber-500/80" /> : <Folder className="h-3 w-3 shrink-0 text-amber-500/80" />}
          <span className="truncate">{node.name}</span>
          <span className="ml-1 text-stone-600">{count}</span>
        </button>
        {p.mayFolder && (
          <button type="button" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: r.right, y: r.bottom }); }}
            className="h-6 w-6 grid place-items-center rounded text-stone-500 hover:text-stone-100 hover:bg-stone-800 shrink-0"
            title={`More for ${node.name}`} aria-label={`More for ${node.name}`} data-testid={`ag-folder-menu-${node.name}`}><MoreVertical className="h-3.5 w-3.5" /></button>
        )}
      </div>
      {menu && (
        <MenuAt at={menu} title={node.name} testId="ag-folder-actions" onClose={() => setMenu(null)} items={[
          ...(p.mayCreate ? [{ icon: <Plus className="h-4 w-4" />, label: "New sheet in here", run: () => p.onNewHere(node.path), testId: "new-sheet" } as MenuItem] : []),
          { icon: <FolderPlus className="h-4 w-4" />, label: "New folder in here", run: () => p.onNewInside(node.path), testId: "new-inside" },
          "sep",
          { icon: <Pencil className="h-4 w-4" />, label: "Rename…", run: () => p.onRename(node.path), testId: "rename" },
          // Nothing inside is deleted — it all moves up one level.
          { icon: <Trash2 className="h-4 w-4" />, label: "Remove folder", danger: true, run: () => p.onDelete(node.path), testId: "delete" },
        ]} />
      )}
      {open && <div className="pl-3 ml-3 border-l-2 border-amber-900/50 space-y-1"><FolderRows node={node} {...p} /></div>}
    </div>
  );
}

/** Making a folder, or renaming one. */
function FolderDialog({ name: start, parent, onSave, onClose }: { name: string; parent: string; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(start);
  const save = () => { if (name.trim()) onSave(name.trim()); else onClose(); };
  return (
    <AgPanel title={start ? "Rename folder" : parent ? `New folder in ${folderName(parent)}` : "New folder"} onClose={onClose} width={340} height={180} testId="ag-folder-dialog"
      footer={<><button type="button" onClick={onClose} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800">Cancel</button><button type="button" onClick={save} className="h-9 px-4 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm" data-testid="ag-folder-save">Save</button></>}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Weapons" className="w-full h-10 bg-stone-950 border border-stone-700 rounded px-2 text-stone-100" data-testid="ag-folder-name" />
      <div className="text-[11px] text-stone-500 mt-1.5">Drag sheets onto a folder to file them, and folders onto each other to nest them.</div>
    </AgPanel>
  );
}

function NoteRow({ note, opts, onOpen, mayFile }: { note: AgNote; opts: BrowserOptions; onOpen: (id: string) => void; mayFile?: boolean }) {
  const { state, viewer } = useAg();
  const template = note.templateId ? state.notes.get(note.templateId) : undefined;
  const pinned = !!state.settings?.tracker.pinned.includes(note.id);
  // Right-click the row, or press ⋯, for everything you can do with the sheet.
  const [menu, setMenu] = useState<null | { x: number; y: number }>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => { if (press.current) { clearTimeout(press.current); press.current = null; } };
  return (
    <div className="flex items-center gap-2 rounded-md border border-stone-800 bg-stone-900/70 hover:border-stone-600 px-1.5 py-1 group" draggable
      onDragStart={(e) => {
        // The map takes one of these; a folder in this list takes the other.
        e.dataTransfer.setData("application/character-id", `ag:${note.id}`);
        if (mayFile) e.dataTransfer.setData("application/ag-note", note.id);
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
      // Long-press on phones = right-click.
      onTouchStart={(e) => { cancelPress(); longPressed.current = false; const t = e.touches[0]; press.current = setTimeout(() => { longPressed.current = true; setMenu({ x: t.clientX, y: t.clientY }); }, 550); }}
      onTouchEnd={cancelPress} onTouchMove={cancelPress}
      data-testid={`ag-note-row-${note.name}`}>
      <button type="button" onClick={() => { if (longPressed.current) { longPressed.current = false; return; } onOpen(note.id); }} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <Portrait note={note} size={34} radius={6} />
        <span className="min-w-0">
          <span className="block text-sm text-stone-100 truncate">{note.name || "Untitled"}</span>
          <span className="block text-[10px] text-stone-500 truncate">{agTypeLabel(note.type)}{note.isTemplate ? ` template · v${note.templateMeta?.version ?? 1}` : ""}{template ? ` · ${template.name}` : ""}{viewer.isGM && note.ownerIds.length ? ` · ${note.ownerIds.map((id) => state.members.find((m) => m.userId === id)?.name ?? "?").join(", ")}` : ""}{note.copyOf ? copyWhere(state, note.id) : ""}</span>
        </span>
      </button>
      {note.isTemplate && <Lock className="h-3.5 w-3.5 text-stone-600" />}
      {pinned && opts.showTrackerPin && <Pin className="h-3.5 w-3.5 text-amber-400/80" aria-label="In the player tracker" />}
      <button type="button" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: r.right, y: r.bottom }); }}
        className="h-8 w-8 grid place-items-center rounded text-stone-500 hover:text-stone-100 hover:bg-stone-800" title="More" aria-label={`More for ${note.name}`} data-testid={`ag-row-menu-${note.name}`}>
        <MoreVertical className="h-4 w-4" />
      </button>
      {menu && <NoteMenu note={note} opts={opts} at={menu} onOpen={onOpen} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Everything you can do with a sheet from the list: open, share, player tracker, map, rename, copy, delete. */
function NoteMenu({ note, opts, at, onOpen, onClose }: { note: AgNote; opts: BrowserOptions; at: { x: number; y: number }; onOpen: (id: string) => void; onClose: () => void }) {
  const { state, request, viewer, scope, system } = useAg();
  const { toast } = useToast();
  const { user } = useAuth() as any;
  const [panel, setPanel] = useState<null | "share" | "rename">(null);
  const pinned = !!state.settings?.tracker.pinned.includes(note.id);
  const fail = (e: any) => toast({ title: "Couldn't do that", description: e.message, variant: "destructive" });
  const togglePin = () => {
    if (!state.settings) return;
    const t = state.settings.tracker;
    request({ op: "settings.update", settings: { ...state.settings, tracker: { ...t, pinned: pinned ? t.pinned.filter((x) => x !== note.id) : [...t.pinned, note.id] } } }).catch(fail);
  };
  const isGM = viewer.isGM;
  type Item = MenuItem;
  const items: Item[] = [
    { icon: <ExternalLink className="h-4 w-4" />, label: "Open", run: () => onOpen(note.id), testId: "open" },
    ...(isGM && !note.isTemplate && scope.kind === "campaign" ? [{ icon: <Share2 className="h-4 w-4" />, label: "Share with players…", run: () => setPanel("share"), testId: "share" } as Item] : []),
    ...(isGM && opts.showTrackerPin && !note.isTemplate ? [{ icon: pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />, label: pinned ? "Remove from player tracker" : "Add to player tracker", run: togglePin, testId: "pin" } as Item] : []),
    ...(isGM && opts.onPlaceOnMap && !note.isTemplate ? [{ icon: <MapPin className="h-4 w-4" />, label: "Place on battlemap", run: () => opts.onPlaceOnMap!(note.id), testId: "place" } as Item] : []),
    ...(isGM ? ["sep" as Item,
      { icon: <Pencil className="h-4 w-4" />, label: "Rename…", run: () => setPanel("rename"), testId: "rename" } as Item,
      { icon: <Copy className="h-4 w-4" />, label: "Duplicate", run: () => request({ op: "note.duplicate", id: note.id }).then(() => toast({ title: "Duplicated" })).catch(fail), testId: "duplicate" } as Item,
      ...(scope.kind === "campaign" && user ? [{ icon: <Library className="h-4 w-4" />, label: "Save to My Library", run: () => agClient.request(agLibraryScope("library", user.id, system), { op: "note.copyFrom", sourceNoteId: note.id, sourceScope: scope }).then(() => toast({ title: "Saved to My Library" })).catch(fail), testId: "library" } as Item] : []),
      "sep" as Item,
      { icon: <Trash2 className="h-4 w-4" />, label: "Delete", danger: true, run: () => agConfirm(`Delete “${note.name}” for everyone? Its version history goes too.`, { title: "Delete this sheet?", confirm: "Delete" }).then((ok) => { if (ok) request({ op: "note.delete", id: note.id }).catch(fail); }), testId: "delete" } as Item,
    ] : []),
  ];
  if (panel === "share") return <ShareDialog note={note} onClose={onClose} />;
  if (panel === "rename") return <RenameDialog note={note} onClose={onClose} />;
  return <MenuAt at={at} title={note.name || "Untitled"} items={items} keep={["share", "rename"]} testId="ag-row-menu" onClose={onClose} />;
}

/** Who sees a sheet, who owns it — in one place, from the list. */
export function ShareDialog({ note: initial, onClose }: { note: AgNote; onClose: () => void }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const note = state.notes.get(initial.id) ?? initial;
  const players = state.members.filter((m) => m.role !== "gm");
  const update = (patch: any) => request({ op: "note.update", id: note.id, patch }).catch((e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }));
  const everyone = note.acl.view === "everyone";
  const hidden = note.acl.view === "gm";
  const quick = (k: "everyone" | "gm") => update({ acl: { ...note.acl, view: k } as AgAcl, ...(k === "everyone" && note.bodyAcl.view === "gm" ? { bodyAcl: { ...note.bodyAcl, view: "inherit" } } : {}) });
  return (
    <AgPanel title={<span className="inline-flex items-center gap-1.5"><Share2 className="h-4 w-4 text-amber-400" />Share “{note.name || "Untitled"}”</span>} onClose={onClose} width={440} height={560} testId="ag-share">
      <div className="space-y-4 text-stone-200">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => quick("everyone")} className={`h-9 px-3 rounded-md border text-sm ${everyone ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-stone-700 hover:border-amber-700"}`} data-testid="ag-share-everyone">Everyone in the campaign</button>
          <button type="button" onClick={() => quick("gm")} className={`h-9 px-3 rounded-md border text-sm ${hidden ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-stone-700 hover:border-amber-700"}`} data-testid="ag-share-gm">Only me (GM)</button>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] text-stone-400">Who sees its name & portrait (or pick specific players)</div>
          <AclEditor acl={note.acl} allowInherit={false} onChange={(acl: AgAcl) => update({ acl })} editLabel="Rename" />
          <div className="text-[11px] text-stone-400 pt-1">Who sees the rest of the sheet</div>
          <AclEditor acl={note.bodyAcl} onChange={(bodyAcl: AgAcl) => update({ bodyAcl })} />
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] text-stone-400">Owners — players who control this sheet (change its values, use its buttons, add items)</div>
          <div className="flex flex-wrap gap-1.5">
            {players.map((m) => {
              const on = note.ownerIds.includes(m.userId);
              return <button key={m.userId} type="button" onClick={() => update({ ownerIds: on ? note.ownerIds.filter((x) => x !== m.userId) : [...note.ownerIds, m.userId] })}
                className={`h-8 px-2.5 rounded-full border text-xs ${on ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-stone-700 text-stone-300"}`} data-testid={`ag-share-owner-${m.name}`}>{m.name}</button>;
            })}
            {!players.length && <span className="text-xs text-stone-500">No players have joined yet.</span>}
          </div>
        </div>
        <div className="text-[10px] text-stone-500">Values, sections and buttons on the sheet can still be hidden individually (their own settings).</div>
      </div>
    </AgPanel>
  );
}

function RenameDialog({ note, onClose }: { note: AgNote; onClose: () => void }) {
  const { request } = useAg();
  const { toast } = useToast();
  const [name, setName] = useState(note.name);
  const save = () => { if (name.trim() && name !== note.name) request({ op: "note.update", id: note.id, patch: { name: name.trim() } }).catch((e: any) => toast({ title: "Couldn't rename it", description: e.message, variant: "destructive" })); onClose(); };
  return (
    <AgPanel title="Rename" onClose={onClose} width={340} height={170} testId="ag-rename"
      footer={<><button type="button" onClick={onClose} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800">Cancel</button><button type="button" onClick={save} className="h-9 px-4 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm" data-testid="ag-rename-save">Save</button></>}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="w-full h-10 bg-stone-950 border border-stone-700 rounded px-2 text-stone-100" data-testid="ag-rename-input" />
    </AgPanel>
  );
}

function CreateDialog({ template: startTemplate, types, startType, folder, onClose }: { template: boolean; types: string[]; startType?: string; folder?: string; onClose: () => void }) {
  const { state, request, openNote, viewer } = useAg();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(startTemplate);
  const [type, setType] = useState(startType ?? types[0] ?? "character");
  const templates = [...Array.from(state.notes.values())].filter((n) => n.isTemplate && n.type === type);
  const [templateId, setTemplateId] = useState<string>("");
  const [owners, setOwners] = useState<string[]>([]);
  const players = state.members.filter((m) => m.role !== "gm");
  const create = async () => {
    try {
      const res = await request<{ noteId: string }>({ op: "note.create", type, name: name.trim() || (template ? `${agTypeLabel(type)} template` : `New ${agTypeLabel(type)}`), isTemplate: template, templateId: template ? null : templateId || null, ownerIds: owners, folder: folder || null });
      onClose();
      openNote(res.noteId);
    } catch (e: any) { toast({ title: "Couldn't create it", description: e.message, variant: "destructive" }); }
  };
  return (
    <AgPanel title={template ? "New template" : "New sheet"} onClose={onClose} width={440} height={560} testId="ag-create"
      footer={<>
        <button type="button" onClick={onClose} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800">Cancel</button>
        <button type="button" onClick={create} className="h-9 px-4 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm" data-testid="ag-create-submit">Create</button>
      </>}>
        <div className="space-y-3 text-stone-200">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Name" className="w-full h-10 bg-stone-950 border border-stone-700 rounded px-2" data-testid="ag-create-name" />
          {folder && <div className="text-[11px] text-stone-400 inline-flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5 text-amber-500/80" /> Goes in {folder}</div>}
          <div>
            <div className="text-[11px] text-stone-400 mb-1">Kind</div>
            <div className="flex flex-wrap gap-1">
              {types.map((t) => <button key={t} type="button" onClick={() => { setType(t); setTemplateId(""); }} className={`h-8 px-2.5 rounded-full border text-xs ${type === t ? "border-amber-500 text-amber-200 bg-amber-500/10" : "border-stone-700 text-stone-300"}`}>{agTypeLabel(t)}</button>)}
              <input placeholder="+ new kind" onBlur={(e) => { const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"); if (v) setType(v); }} className="h-8 w-28 bg-stone-950 border border-stone-700 rounded-full px-2.5 text-xs" />
            </div>
          </div>
          {viewer.isGM && (
            <label className="flex items-start gap-2 rounded-lg border border-stone-800 bg-stone-900/60 p-2 cursor-pointer" data-testid="ag-create-as-template">
              <input type="checkbox" checked={template} onChange={(e) => setTemplate(e.target.checked)} className="mt-0.5 accent-amber-600" />
              <span className="min-w-0">
                <span className="block text-sm text-stone-200">Make this a template</span>
                <span className="block text-[11px] text-stone-500">A sheet others are built from: its values, layout and buttons are what every new one starts with. Only you can see it.</span>
              </span>
            </label>
          )}
          {!template && (
            <div>
              <div className="text-[11px] text-stone-400 mb-1">Template (locked once chosen)</div>
              <NotePicker value={templateId} onChange={setTemplateId} notes={templates} title={`${agTypeLabel(type)} templates`} noneLabel="Blank sheet" placeholder="Blank sheet" testId="ag-create-template" />
              {!templates.length && <div className="text-[10px] text-stone-500 mt-1">No {agTypeLabel(type)} templates yet — tick the box above to make one.</div>}
            </div>
          )}
          {!template && players.length > 0 && (
            <div>
              <div className="text-[11px] text-stone-400 mb-1">Owners</div>
              <div className="flex flex-wrap gap-1">{players.map((m) => <button key={m.userId} type="button" onClick={() => setOwners(owners.includes(m.userId) ? owners.filter((x) => x !== m.userId) : [...owners, m.userId])} className={`h-8 px-2.5 rounded-full border text-xs ${owners.includes(m.userId) ? "border-amber-500 text-amber-200" : "border-stone-700 text-stone-300"}`}>{m.name}</button>)}</div>
            </div>
          )}
        </div>
    </AgPanel>
  );
}

/** Copy sheets/templates from My Library or Admin into this campaign. */
function ImportFromLibraryDialog({ onClose }: { onClose: () => void }) {
  const { scope, system } = useAg();
  const { user, isAdmin } = useAuth() as any;
  // This system's own libraries (CA Agnostic's are separate from plain Agnostic's).
  const lib = (kind: "library" | "admin") => agLibraryScope(kind, user?.id ?? "", system);
  const [source, setSource] = useState<AgScope>(lib("library"));
  return (
    <AgPanel title="Bring in from My Library / Admin" onClose={onClose} width={480} height={620} testId="ag-bring-in">
        <div className="flex gap-1">
          <button type="button" onClick={() => setSource(lib("library"))} className={`h-8 px-3 rounded text-xs ${source.kind === "library" ? "bg-amber-600 text-white" : "bg-stone-800 text-stone-300"}`}>My Library</button>
          {isAdmin && <button type="button" onClick={() => setSource(lib("admin"))} className={`h-8 px-3 rounded text-xs ${source.kind === "admin" ? "bg-amber-600 text-white" : "bg-stone-800 text-stone-300"}`}>Admin</button>}
        </div>
        <div>
          <AgScopeProvider key={`${source.kind}:${source.id}`} scope={source}>
            <SourceList target={scope} source={source} />
          </AgScopeProvider>
        </div>
    </AgPanel>
  );
}

function SourceList({ target, source }: { target: AgScope; source: AgScope }) {
  const { state } = useAg();
  const { toast } = useToast();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const all = Array.from(state.notes.values()).sort((a, b) => Number(b.isTemplate) - Number(a.isTemplate) || a.name.localeCompare(b.name));
  const kinds = Array.from(new Set(all.map((n) => (n.isTemplate ? "Templates" : agTypeLabel(n.type)))));
  const notes = all.filter((n) => (!kind || (n.isTemplate ? "Templates" : agTypeLabel(n.type)) === kind) && (!q.trim() || n.name.toLowerCase().includes(q.trim().toLowerCase())));
  const copy = async (n: AgNote) => {
    try {
      await agClient.request(target, { op: "note.copyFrom", sourceNoteId: n.id, sourceScope: source });
      setDone(new Set([...Array.from(done), n.id]));
    } catch (e: any) { toast({ title: "Couldn't copy", description: e.message, variant: "destructive" }); }
  };
  return (
    <div className="space-y-2 py-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-9 pl-9 pr-2 rounded-md bg-stone-800 border border-stone-700 text-sm text-stone-100" data-testid="ag-bring-in-search" />
      </div>
      {kinds.length > 1 && (
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {["", ...kinds].map((k) => <button key={k || "all"} type="button" onClick={() => setKind(k)} className={`h-7 px-2.5 rounded-full text-[11px] border shrink-0 ${kind === k ? "border-amber-500 text-amber-300 bg-amber-500/10" : "border-stone-700 text-stone-400"}`}>{k || "All"}</button>)}
        </div>
      )}
      <div className="text-[11px] text-stone-500">Each one is copied into this campaign (with the components it uses). The copy is yours to change; the library stays as it is.</div>
      {notes.map((n) => (
        <div key={n.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-stone-800 border border-stone-700">
          <Portrait note={n} size={36} radius={6} />
          <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-stone-100 truncate">{n.name}</span><span className="block text-xs text-stone-400">{agTypeLabel(n.type)}{n.isTemplate ? " template" : ""}</span></span>
          <button type="button" disabled={done.has(n.id)} onClick={() => copy(n)} className="h-8 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1 disabled:bg-emerald-800" data-testid={`ag-copy-${n.name}`}>{done.has(n.id) ? "Added" : <><Plus className="h-3.5 w-3.5" /> Add</>}</button>
        </div>
      ))}
      {!notes.length && <div className="text-sm text-stone-500 p-3 text-center">{q || kind ? "Nothing matches." : "Nothing there yet."}</div>}
    </div>
  );
}


/** Ready-made game systems built from Agnostic parts — fully editable once added. */
function StarterKits() {
  const { state, request } = useAg();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (Array.from(state.notes.values()).some((n) => n.isTemplate && n.name === "CA Character")) return null;
  const add = async () => {
    const ok = await agConfirm(
      "Adds the Cultivator's Adventure character sheet (Overview, Skills, Ability, Inventory, Traits), item templates (weapon, armor, consumable, rune, container, currency…), wounds and traits, a C.A. player tracker card, and an example character with gear to try it on. Everything is ordinary Agnostic content you can change.",
      { title: "Add Cultivator's Adventure?", confirm: "Add it", danger: false },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await request<{ templates: number; sheets: number }>({ op: "kit.apply", kit: "ca", examples: true });
      toast({ title: "Cultivator's Adventure added", description: `${r.templates} templates${r.sheets ? ` and an example character with ${r.sheets - 1} items, wounds and a trait` : ""}. Look in the “${"Cultivator's Adventure"}” folder.` });
    } catch (e: any) { toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-lg border border-stone-800 bg-stone-900/60 p-2.5 space-y-1.5" data-testid="ag-starter-kits">
      <div className="text-[10px] uppercase tracking-wide text-amber-400/90">Starter kits</div>
      <button type="button" disabled={busy} onClick={add} className="w-full flex items-center gap-3 p-2 rounded-lg bg-stone-800 border border-stone-700 hover:border-amber-700 text-left disabled:opacity-60" data-testid="ag-kit-ca">
        <span className="h-9 w-9 rounded bg-stone-900 border border-stone-700 grid place-items-center text-amber-400 shrink-0">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}</span>
        <span className="min-w-0"><span className="block text-sm text-stone-100">Cultivator's Adventure (C.A.)</span><span className="block text-[11px] text-stone-400">The C.A. sheet, inventory, items, wounds and traits — built in Agnostic so you can change any of it.</span></span>
      </button>
    </div>
  );
}

/** One click: a blank template for each kind, ready to be designed. */
function StarterTemplates({ types }: { types: string[] }) {
  const { request } = useAg();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="text-center">
      <button type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        try { for (const t of types) await request({ op: "note.create", type: t, name: `${agTypeLabel(t)}`, isTemplate: true }); }
        catch (e: any) { toast({ title: "Couldn't create them", description: e.message, variant: "destructive" }); }
        finally { setBusy(false); }
      }} className="h-9 px-3 rounded bg-stone-800 hover:bg-stone-700 text-xs text-stone-200" data-testid="ag-starter-templates">
        Add blank templates: {types.map(agTypeLabel).join(", ")}
      </button>
    </div>
  );
}

/** Where someone's copy is now: " · on Aria" (what it's attached to), or " · on no one" (put away). */
function copyWhere(state: ReturnType<typeof useAg>["state"], noteId: string): string {
  const on = Array.from(state.links.values()).filter((l) => l.fromNoteId === noteId).map((l) => state.notes.get(l.toNoteId)?.name).filter(Boolean);
  return on.length ? ` · on ${on.join(", ")}` : " · on no one";
}
