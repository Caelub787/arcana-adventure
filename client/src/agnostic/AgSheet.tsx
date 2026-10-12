// One Agnostic sheet: portrait + name, then the GM's free-form document.
// GMs also get the sheet's data (Values), Connections and Settings.
import React, { useEffect, useRef, useState } from "react";
import { Lock, Eye, FileText, Hash, Link2, Settings, Image as ImageIcon, Upload, Users, Loader2, WifiOff, Undo2 } from "lucide-react";
import { agTypeLabel, noteDocName } from "@shared/agnostic/types";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageBrowser } from "@/components/ImageBrowser";
import { useAg, usePerms, useDoc } from "./hooks";
import { agClient } from "./client";
import { AgEditor, ActiveEditorProvider, EditorToolbar } from "./editor/AgEditor";
import { FieldsPanel } from "./FieldsPanel";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { Portrait, CommitInput, uploadImage } from "./widgets";
import { undoLast, isTextTarget, onUndoChange, peekUndo } from "./undo";

type Tab = "sheet" | "fields" | "links" | "settings";

export function AgSheet({ noteId, onClose }: { noteId: string; onClose?: () => void }) {
  const { state, realViewer, previewUserId, key: scopeKeyStr } = useAg();
  const perms = usePerms(noteId);
  const note = perms.note;
  const [tab, setTab] = useState<Tab>("sheet");
  const rootRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  useEffect(() => onUndoChange(() => force((n) => n + 1)), []);
  const [connected, setConnected] = useState(agClient.connected);
  useEffect(() => agClient.onConnection(() => setConnected(agClient.connected)), []);

  // Ctrl+Z outside the text editor: value changes, template switches.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !isTextTarget(e.target)) {
        e.preventDefault();
        void undoLast(scopeKeyStr);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [scopeKeyStr]);

  if (!note) {
    return <div className="p-6 text-sm text-stone-400">{state.ready ? "This sheet was deleted, or you can no longer see it." : "Loading…"}</div>;
  }
  const isGM = perms.isGM;
  const tabs: Array<[Tab, string, React.ReactNode]> = [
    ["sheet", "Sheet", <FileText key="s" className="h-3.5 w-3.5" />],
    ["fields", "Values", <Hash key="f" className="h-3.5 w-3.5" />],
    ...(isGM ? ([["links", "Links", <Link2 key="l" className="h-3.5 w-3.5" />], ["settings", "Settings", <Settings key="g" className="h-3.5 w-3.5" />]] as Array<[Tab, string, React.ReactNode]>) : []),
  ];
  const lastUndo = peekUndo(scopeKeyStr);

  return (
    <ActiveEditorProvider noteId={noteId}>
      <div ref={rootRef} tabIndex={-1} className="h-full flex flex-col bg-stone-950 text-stone-200 outline-none select-text" data-testid={`ag-sheet-${noteId}`}>
        <SheetHeader noteId={noteId} />
        <div className="flex items-center gap-1 px-2 border-b border-stone-800 shrink-0 overflow-x-auto no-scrollbar">
          {tabs.map(([t, label, icon]) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`h-9 px-2.5 text-xs inline-flex items-center gap-1 border-b-2 -mb-px shrink-0 ${tab === t ? "border-amber-500 text-amber-200" : "border-transparent text-stone-400 hover:text-stone-200"}`} data-testid={`ag-tab-${t}`}>{icon}{label}</button>
          ))}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {!connected && <span className="text-[10px] text-red-300 inline-flex items-center gap-1" title="Reconnecting — your edits will sync when it's back"><WifiOff className="h-3 w-3" /> offline</span>}
            {lastUndo && <button type="button" onClick={() => undoLast(scopeKeyStr)} className="h-7 px-1.5 rounded text-[11px] text-stone-400 hover:text-stone-100 hover:bg-stone-800 inline-flex items-center gap-1" title={`Undo ${lastUndo.label} (Ctrl+Z)`}><Undo2 className="h-3.5 w-3.5" /></button>}
            {realViewer.isGM && <PreviewSelect />}
          </div>
        </div>
        {previewUserId && <div className="px-3 py-1 text-[11px] bg-sky-950/60 text-sky-200 border-b border-sky-900 shrink-0">Previewing as {state.members.find((m) => m.userId === previewUserId)?.name ?? "player"} — exactly what they can see and change.</div>}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {tab === "sheet" && <SheetBody noteId={noteId} />}
          {tab === "fields" && <FieldsPanel noteId={noteId} />}
          {tab === "links" && isGM && <ConnectionsPanel noteId={noteId} />}
          {tab === "settings" && isGM && <SettingsPanel noteId={noteId} onDeleted={() => onClose?.()} />}
        </div>
      </div>
    </ActiveEditorProvider>
  );
}

function SheetHeader({ noteId }: { noteId: string }) {
  const { state, request } = useAg();
  const { note, canEditHeader, isGM } = usePerms(noteId);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [browse, setBrowse] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!note) return null;
  const template = note.templateId ? state.notes.get(note.templateId) : undefined;
  const setPortrait = (portrait: string | null) => request({ op: "note.update", id: noteId, patch: { portrait } }).catch((e) => toast({ title: "Couldn't change it", description: e.message, variant: "destructive" }));
  const portrait = <Portrait note={note} size={64} radius={10} className="shrink-0 border border-stone-700" />;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-stone-800 shrink-0 bg-gradient-to-b from-stone-900 to-stone-950">
      {canEditHeader ? (
        <Popover>
          <PopoverTrigger asChild><button type="button" className="relative shrink-0 group" title="Change portrait" data-testid="ag-portrait">{portrait}<span className="absolute inset-0 rounded-[10px] bg-black/50 opacity-0 group-hover:opacity-100 grid place-items-center">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}</span></button></PopoverTrigger>
          <PopoverContent className="w-52 p-1.5 bg-stone-900 border-stone-700">
            <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-8 px-2 rounded hover:bg-stone-800 text-sm text-stone-200 inline-flex items-center gap-2"><Upload className="h-3.5 w-3.5" /> Upload…</button>
            <button type="button" onClick={() => setBrowse(true)} className="w-full h-8 px-2 rounded hover:bg-stone-800 text-sm text-stone-200 inline-flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" /> Image library…</button>
            {note.portrait && <button type="button" onClick={() => setPortrait(null)} className="w-full h-8 px-2 rounded hover:bg-stone-800 text-sm text-red-300">Remove</button>}
          </PopoverContent>
        </Popover>
      ) : portrait}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setBusy(true);
        try { await setPortrait(await uploadImage(f)); } catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); } finally { setBusy(false); }
      }} />
      {browse && <ImageBrowser open onOpenChange={(o) => { if (!o) setBrowse(false); }} onSelect={(src) => { setPortrait(src); setBrowse(false); }} />}
      <div className="min-w-0 flex-1">
        {canEditHeader
          ? <CommitInput value={note.name} onCommit={(name) => request({ op: "note.update", id: noteId, patch: { name } })} className="w-full h-9 text-lg font-semibold bg-transparent border-transparent hover:border-stone-700 text-amber-100" aria-label="Name" data-testid="ag-name" />
          : <div className="text-lg font-semibold text-amber-100 truncate">{note.name || "Untitled"}</div>}
        <div className="flex items-center gap-2 text-[11px] text-stone-400 flex-wrap">
          <span>{note.isTemplate ? `${agTypeLabel(note.type)} template` : agTypeLabel(note.type)}</span>
          {isGM && template && <span className="inline-flex items-center gap-1 text-amber-300/90" title="Template is locked — change it in Settings"><Lock className="h-3 w-3" />{template.name} v{note.templateVersion}</span>}
          {isGM && note.ownerIds.length > 0 && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{note.ownerIds.map((id) => state.members.find((m) => m.userId === id)?.name ?? "?").join(", ")}</span>}
          <Presence noteId={noteId} />
        </div>
      </div>
    </div>
  );
}

/** Who else has this sheet open right now (from the document's awareness). */
function Presence({ noteId }: { noteId: string }) {
  const { state } = useAg();
  const note = state.notes.get(noteId)!;
  const handle = useDoc(noteDocName(noteId, note.docEpoch));
  const [names, setNames] = useState<Array<{ name: string; color: string }>>([]);
  useEffect(() => {
    if (!handle) return;
    const read = () => {
      const out: Array<{ name: string; color: string }> = [];
      handle.awareness.getStates().forEach((s: any, id: number) => { if (id !== handle.doc.clientID && s?.user) out.push(s.user); });
      setNames(out);
    };
    read();
    handle.awareness.on("change", read);
    return () => handle.awareness.off("change", read);
  }, [handle?.awareness]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!names.length) return null;
  return <span className="inline-flex items-center gap-1" data-testid="ag-presence">{names.slice(0, 5).map((u, i) => <span key={i} className="h-4 px-1 rounded text-[10px] font-semibold text-stone-950" style={{ background: u.color }}>{u.name}</span>)}</span>;
}

function SheetBody({ noteId }: { noteId: string }) {
  const { note, canViewBody, canEditBody, isGM } = usePerms(noteId);
  const { previewUserId } = useAg();
  if (!note) return null;
  if (!canViewBody) return <div className="p-6 text-sm text-stone-400 flex items-center gap-2"><Eye className="h-4 w-4" /> Only the name and portrait are shared with you.</div>;
  const showToolbar = canEditBody && !previewUserId;
  return (
    <div>
      {showToolbar && <div className="sticky top-0 z-20 bg-stone-950/95 backdrop-blur border-b border-stone-800 px-2"><EditorToolbar noteId={noteId} isGM={isGM} /></div>}
      <div className="px-4 py-3 sm:px-6">
        <AgEditor docName={noteDocName(noteId, note.docEpoch)} noteId={noteId} />
      </div>
    </div>
  );
}

function PreviewSelect() {
  const { state, previewUserId, setPreviewUserId } = useAg();
  const players = state.members.filter((m) => m.role !== "gm");
  if (!players.length) return null;
  return (
    <select value={previewUserId ?? ""} onChange={(e) => setPreviewUserId(e.target.value || null)} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-[11px] text-stone-300" title="Preview as a player" data-testid="ag-preview-as">
      <option value="">View as GM</option>
      {players.map((m) => <option key={m.userId} value={m.userId}>View as {m.name}</option>)}
    </select>
  );
}
