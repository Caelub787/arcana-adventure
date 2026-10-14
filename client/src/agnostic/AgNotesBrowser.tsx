// Browse, search and create sheets in a scope. Used by the campaign's
// side panel, My Library and the Admin library.
import React, { useMemo, useState } from "react";
import {
  Plus, Search, FolderOpen, Pin, PinOff, MapPin, Download, Library, ChevronRight, ChevronDown, Lock, Flame, Loader2,
} from "lucide-react";
import type { AgNote, AgScope } from "@shared/agnostic/types";
import { AG_BUILTIN_TYPES, agTypeLabel, agLibraryScope } from "@shared/agnostic/types";
import { useToast } from "@/hooks/use-toast";
import { AgPanel, agConfirm } from "./float";
import { NotePicker } from "./pickers";
import { useAuth } from "@/lib/AuthContext";
import { useAg, AgScopeProvider } from "./hooks";
import { usePlayView } from "./viewMode";
import { Portrait } from "./widgets";
import { agClient } from "./client";
import { ComponentsManager } from "./ComponentsManager";
import { ImportExportDialog } from "./ImportExport";
import { GuideButton } from "./AgGuide";

type Tab = "sheets" | "templates" | "components";

export interface BrowserOptions {
  /** Only these note types are offered (libraries: character/item/species). */
  types?: string[];
  onPlaceOnMap?: (noteId: string) => void;
  showTrackerPin?: boolean;
  /** Offer importing from My Library / Admin (campaigns). */
  importSources?: boolean;
}

export function AgNotesBrowser({ opts = {} }: { opts?: BrowserOptions }) {
  const { state, viewer, openNote } = useAg();
  const [tabState, setTab] = useState<Tab>("sheets");
  const play = usePlayView();
  // Player view: just the sheets — templates, components and imports are building tools.
  const tab: Tab = play ? "sheets" : tabState;
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [creating, setCreating] = useState<null | { template: boolean }>(null);
  const [io, setIo] = useState(false);
  const [importing, setImporting] = useState(false);
  const isGM = viewer.isGM;
  const all = [...Array.from(state.notes.values())];
  const typeIds = useMemo(() => {
    const base = opts.types ?? AG_BUILTIN_TYPES.map((t) => t.id);
    return [...Array.from(new Set([...base, ...all.map((n) => n.type).filter((t) => !opts.types || opts.types.includes(t))]))];
  }, [all.length, opts.types]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = all
    .filter((n) => (tab === "templates" ? n.isTemplate : !n.isTemplate))
    .filter((n) => !typeFilter || n.type === typeFilter)
    .filter((n) => !opts.types || opts.types.includes(n.type))
    .filter((n) => !q.trim() || n.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const groups = new Map<string, AgNote[]>();
  for (const n of list) {
    const key = n.folder || agTypeLabel(n.type);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }

  return (
    <div className="h-full flex flex-col text-stone-200" data-testid="ag-browser">
      {isGM && !play && (
        <div className="flex items-center gap-1 px-2 pt-2 shrink-0">
          {([["sheets", "Sheets"], ["templates", "Templates"], ["components", "Components"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`h-8 px-2.5 rounded text-xs ${tab === t ? "bg-amber-600/90 text-white" : "bg-stone-800/80 text-stone-300"}`} data-testid={`ag-browser-tab-${t}`}>{label}</button>
          ))}
          <GuideButton compact topic={tab === "components" ? "components" : tab === "templates" ? "templates" : "start"} className="ml-auto" />
          <button type="button" onClick={() => setIo(true)} className="h-8 w-8 grid place-items-center rounded bg-stone-800/80 text-stone-300" title="Import / export templates" data-testid="ag-io"><Download className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {tab === "components" ? <div className="flex-1 min-h-0 overflow-y-auto"><ComponentsManager /></div> : (
        <>
          <div className="p-2 space-y-1.5 shrink-0">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-stone-500" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-9 pl-7 pr-2 rounded bg-stone-900 border border-stone-700 text-sm" data-testid="ag-browser-search" />
              </div>
              {isGM && <button type="button" onClick={() => setCreating({ template: tab === "templates" })} className="h-9 px-3 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm inline-flex items-center gap-1" data-testid="ag-new"><Plus className="h-4 w-4" /> New</button>}
            </div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              <button type="button" onClick={() => setTypeFilter("")} className={`h-7 px-2.5 rounded-full text-[11px] border shrink-0 ${!typeFilter ? "border-amber-500 text-amber-300" : "border-stone-700 text-stone-400"}`}>All</button>
              {typeIds.map((t) => (
                <button key={t} type="button" onClick={() => setTypeFilter(typeFilter === t ? "" : t)} className={`h-7 px-2.5 rounded-full text-[11px] border shrink-0 ${typeFilter === t ? "border-amber-500 text-amber-300" : "border-stone-700 text-stone-400"}`}>{AG_BUILTIN_TYPES.find((x) => x.id === t)?.plural ?? agTypeLabel(t)}</button>
              ))}
            </div>
            {isGM && !play && opts.importSources && <button type="button" onClick={() => setImporting(true)} className="h-8 w-full rounded border border-dashed border-stone-700 text-xs text-stone-300 hover:border-amber-600 inline-flex items-center justify-center gap-1.5" data-testid="ag-import-from-library"><Library className="h-3.5 w-3.5" /> Bring in from My Library / Admin</button>}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-2">
            {[...Array.from(groups.entries())].map(([group, notes]) => <Group key={group} title={group} notes={notes} opts={opts} onOpen={openNote} />)}
            {!list.length && <div className="text-sm text-stone-500 p-3 text-center">{tab === "templates" ? "No templates yet. A template is a sheet whose values, layout and buttons every new sheet starts with." : isGM ? "Nothing here yet — press New." : "Nothing has been shared with you yet."}</div>}
            {!all.length && isGM && <div className="text-center"><GuideButton label="New to Agnostic? Open the step-by-step guide" /></div>}
            {tab === "templates" && isGM && !all.some((n) => n.isTemplate) && <StarterTemplates types={(opts.types ?? ["character", "npc", "item"]).filter((t) => t !== "species" || !!opts.types)} />}
            {tab === "templates" && isGM && !opts.types && <StarterKits />}
          </div>
        </>
      )}
      {creating && <CreateDialog template={creating.template} types={typeIds} onClose={() => setCreating(null)} />}
      {io && <ImportExportDialog onClose={() => setIo(false)} />}
      {importing && <ImportFromLibraryDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function Group({ title, notes, opts, onOpen }: { title: string; notes: AgNote[]; opts: BrowserOptions; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-1 text-[11px] uppercase tracking-wide text-stone-500 py-1">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}<FolderOpen className="h-3 w-3" />{title}<span className="ml-1 text-stone-600">{notes.length}</span>
      </button>
      {open && <div className="space-y-1">{notes.map((n) => <NoteRow key={n.id} note={n} opts={opts} onOpen={onOpen} />)}</div>}
    </div>
  );
}

function NoteRow({ note, opts, onOpen }: { note: AgNote; opts: BrowserOptions; onOpen: (id: string) => void }) {
  const { state, request, viewer } = useAg();
  const pinned = state.settings?.tracker.pinned.includes(note.id);
  const template = note.templateId ? state.notes.get(note.templateId) : undefined;
  const togglePin = () => {
    if (!state.settings) return;
    const t = state.settings.tracker;
    request({ op: "settings.update", settings: { ...state.settings, tracker: { ...t, pinned: pinned ? t.pinned.filter((x) => x !== note.id) : [...t.pinned, note.id] } } });
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-stone-800 bg-stone-900/70 hover:border-stone-600 px-1.5 py-1 group" draggable onDragStart={(e) => { e.dataTransfer.setData("application/character-id", `ag:${note.id}`); e.dataTransfer.effectAllowed = "copy"; }} data-testid={`ag-note-row-${note.name}`}>
      <button type="button" onClick={() => onOpen(note.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        <Portrait note={note} size={34} radius={6} />
        <span className="min-w-0">
          <span className="block text-sm text-stone-100 truncate">{note.name || "Untitled"}</span>
          <span className="block text-[10px] text-stone-500 truncate">{agTypeLabel(note.type)}{note.isTemplate ? ` template · v${note.templateMeta?.version ?? 1}` : ""}{template ? ` · ${template.name}` : ""}{viewer.isGM && note.ownerIds.length ? ` · ${note.ownerIds.map((id) => state.members.find((m) => m.userId === id)?.name ?? "?").join(", ")}` : ""}</span>
        </span>
      </button>
      {note.isTemplate && <Lock className="h-3.5 w-3.5 text-stone-600" />}
      {viewer.isGM && opts.showTrackerPin && !note.isTemplate && (
        <button type="button" onClick={togglePin} className={`h-8 w-8 grid place-items-center rounded ${pinned ? "text-amber-400" : "text-stone-500 hover:text-stone-200"}`} title={pinned ? "Unpin from tracker" : "Pin to tracker"} data-testid={`ag-pin-${note.name}`}>{pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>
      )}
      {viewer.isGM && opts.onPlaceOnMap && !note.isTemplate && (
        <button type="button" onClick={() => opts.onPlaceOnMap!(note.id)} className="h-8 w-8 grid place-items-center rounded text-stone-500 hover:text-stone-200" title="Place on the map" data-testid={`ag-place-${note.name}`}><MapPin className="h-4 w-4" /></button>
      )}
    </div>
  );
}

function CreateDialog({ template, types, onClose }: { template: boolean; types: string[]; onClose: () => void }) {
  const { state, request, openNote } = useAg();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState(types[0] ?? "character");
  const templates = [...Array.from(state.notes.values())].filter((n) => n.isTemplate && n.type === type);
  const [templateId, setTemplateId] = useState<string>("");
  const [owners, setOwners] = useState<string[]>([]);
  const players = state.members.filter((m) => m.role !== "gm");
  const create = async () => {
    try {
      const res = await request<{ noteId: string }>({ op: "note.create", type, name: name.trim() || (template ? `${agTypeLabel(type)} template` : `New ${agTypeLabel(type)}`), isTemplate: template, templateId: template ? null : templateId || null, ownerIds: owners });
      onClose();
      openNote(res.noteId);
    } catch (e: any) { toast({ title: "Couldn't create it", description: e.message, variant: "destructive" }); }
  };
  return (
    <AgPanel title={template ? "New template" : "New sheet"} onClose={onClose} width={440} height={520} testId="ag-create"
      footer={<>
        <button type="button" onClick={onClose} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800">Cancel</button>
        <button type="button" onClick={create} className="h-9 px-4 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm" data-testid="ag-create-submit">Create</button>
      </>}>
        <div className="space-y-3 text-stone-200">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Name" className="w-full h-10 bg-stone-950 border border-stone-700 rounded px-2" data-testid="ag-create-name" />
          <div>
            <div className="text-[11px] text-stone-400 mb-1">Kind</div>
            <div className="flex flex-wrap gap-1">
              {types.map((t) => <button key={t} type="button" onClick={() => { setType(t); setTemplateId(""); }} className={`h-8 px-2.5 rounded-full border text-xs ${type === t ? "border-amber-500 text-amber-200 bg-amber-500/10" : "border-stone-700 text-stone-300"}`}>{agTypeLabel(t)}</button>)}
              <input placeholder="+ new kind" onBlur={(e) => { const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"); if (v) setType(v); }} className="h-8 w-28 bg-stone-950 border border-stone-700 rounded-full px-2.5 text-xs" />
            </div>
          </div>
          {!template && (
            <div>
              <div className="text-[11px] text-stone-400 mb-1">Template (locked once chosen)</div>
              <NotePicker value={templateId} onChange={setTemplateId} notes={templates} title={`${agTypeLabel(type)} templates`} noneLabel="Blank sheet" placeholder="Blank sheet" testId="ag-create-template" />
              {!templates.length && <div className="text-[10px] text-stone-500 mt-1">No {agTypeLabel(type)} templates yet — make one in the Templates tab.</div>}
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
      "Adds the Cultivator's Adventure character sheet (Overview, Skills, Ability, Inventory, Traits), item templates (weapon, armor, consumable, rune, container, currency…), wounds and traits, a C.A. tracker card, and an example character with gear to try it on. Everything is ordinary Agnostic content you can change.",
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
