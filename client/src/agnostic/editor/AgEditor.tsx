// The Agnostic sheet editor: a collaborative rich-text document (TipTap +
// Yjs) that can hold live values, resource bars, buttons, columns, free
// canvases, charts, connection tables, components, and sections / words with
// their own permissions. Regions are nested editors bound to their own docs.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Plus, Hash, Gauge, Dices, EyeOff, Lock, Columns2, Columns3, LayoutGrid,
  Image as ImageIcon, Table as TableIcon, BarChart3, Link2, Puzzle, Minus, Highlighter, Palette, Loader2, FileText, Code,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAg, useDoc } from "../hooks";
import { CANVAS_ORIGIN } from "../client";
import { AG_NODES, AgDocContext, FieldConfig } from "./nodes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefPicker } from "../pickers";
import { RefList } from "../LayoutEditor";
import { ActionPicker } from "../ActionEditor";
import { uploadImage } from "../widgets";
import { ImageBrowser } from "@/components/ImageBrowser";
import "../agnostic.css";

// --------------------------------------------------------------------------- active editor (toolbar target)
interface ActiveCtx { active: Editor | null; setActive: (e: Editor | null) => void; noteId: string }
const ActiveEditorContext = createContext<ActiveCtx | null>(null);

export function ActiveEditorProvider({ noteId, children }: { noteId: string; children: React.ReactNode }) {
  const [active, setActive] = useState<Editor | null>(null);
  const value = useMemo(() => ({ active, setActive, noteId }), [active, noteId]);
  return <ActiveEditorContext.Provider value={value}>{children}</ActiveEditorContext.Provider>;
}
export const useActiveEditor = () => useContext(ActiveEditorContext);

// --------------------------------------------------------------------------- editor
export function AgEditor({ docName, noteId, nested, inline, placeholder }: { docName: string; noteId: string; nested?: boolean; inline?: boolean; placeholder?: string }) {
  const handle = useDoc(docName);
  if (!handle) return null;
  if (handle.revoked) return null; // no longer allowed: nothing to show
  if (!handle.synced) return <span className="inline-flex items-center gap-1 text-xs text-stone-500"><Loader2 className="h-3 w-3 animate-spin" />{inline ? "" : "Loading…"}</span>;
  return <BoundEditor key={`${docName}#${handle.generation}`} doc={handle.doc} awareness={handle.awareness} readOnly={handle.readOnly} noteId={noteId} nested={nested} inline={inline} placeholder={placeholder} />;
}

function BoundEditor({ doc, awareness, readOnly, noteId, nested, inline, placeholder }: {
  doc: Y.Doc; awareness: any; readOnly: boolean; noteId: string; nested?: boolean; inline?: boolean; placeholder?: string;
}) {
  const { viewer, previewUserId } = useAg();
  const active = useActiveEditor();
  // Preview-as-player: the GM sees exactly what the player could change.
  const editable = !readOnly && !previewUserId;
  const undoManager = useMemo(() => new Y.UndoManager([doc.getXmlFragment("default"), doc.getMap("canvases")], {
    trackedOrigins: new Set([ySyncPluginKey, CANVAS_ORIGIN]),
    captureTransaction: (tr) => tr.meta.get("addToHistory") !== false,
  }), [doc]);
  useEffect(() => () => undoManager.destroy(), [undoManager]);
  const user = awareness.getLocalState()?.user ?? { name: "Someone", color: "#f59e0b" };

  const editor = useEditor({
    editable,
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({ undoRedo: false, heading: { levels: [1, 2, 3] } }),
      Collaboration.configure({ document: doc, yUndoOptions: { undoManager } as any }),
      CollaborationCaret.configure({ provider: { awareness }, user }),
      Placeholder.configure({ placeholder: placeholder ?? (inline ? "secret…" : nested ? "Write here…" : "Start writing — use + to add values, bars, buttons, sections…") }),
      TextStyle, Color, Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList, TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ inline: false, allowBase64: false }),
      ...AG_NODES,
    ],
    editorProps: {
      attributes: {
        class: `ag-prose ${inline ? "ag-prose-inline" : ""} outline-none ${nested ? "" : "min-h-[120px]"}`,
        "data-testid": nested ? (inline ? "ag-editor-inline" : "ag-editor-nested") : "ag-editor-main",
      },
    },
    onFocus: ({ editor }) => active?.setActive(editor as Editor),
  }, [doc]);

  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  // The sheet's main document is the toolbar's target until another editor is focused.
  useEffect(() => { if (!nested && editor && active && !active.active) active.setActive(editor as Editor); }, [editor, nested, active?.active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (active?.active === editor) active?.setActive(null); }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AgDocContext.Provider value={{ doc, noteId }}>
      <EditorContent editor={editor} className={inline ? "inline" : ""} />
    </AgDocContext.Provider>
  );
}

// --------------------------------------------------------------------------- toolbar
const uid = () => Math.random().toString(36).slice(2, 10);

export function EditorToolbar({ noteId, isGM }: { noteId: string; isGM: boolean }) {
  const ctx = useActiveEditor();
  const editor = ctx?.active ?? null;
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const f = () => force((n) => n + 1);
    editor.on("transaction", f);
    editor.on("selectionUpdate", f);
    return () => { editor.off("transaction", f); editor.off("selectionUpdate", f); };
  }, [editor]);
  const disabled = !editor || !editor.isEditable;
  const btn = (on: boolean) => `h-8 w-8 sm:h-7 sm:w-7 grid place-items-center rounded shrink-0 ${on ? "bg-amber-600/30 text-amber-200" : "text-stone-300 hover:bg-stone-800"} disabled:opacity-40`;
  const run = (fn: (e: Editor) => void) => () => { if (editor) fn(editor); };
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar py-1" data-testid="ag-toolbar" onMouseDown={(e) => e.preventDefault()}>
      <InsertMenu editor={editor} noteId={noteId} isGM={isGM} disabled={disabled} />
      <span className="w-px h-5 bg-stone-700 mx-1 shrink-0" />
      <button type="button" disabled={disabled} className={btn(false)} title="Undo (Ctrl+Z)" onClick={run((e) => e.commands.undo())}><Undo2 className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(false)} title="Redo (Ctrl+Shift+Z)" onClick={run((e) => e.commands.redo())}><Redo2 className="h-4 w-4" /></button>
      <span className="w-px h-5 bg-stone-700 mx-1 shrink-0" />
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("heading", { level: 1 }))} title="Title" onClick={run((e) => e.chain().focus().toggleHeading({ level: 1 }).run())}><Heading1 className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("heading", { level: 2 }))} title="Heading" onClick={run((e) => e.chain().focus().toggleHeading({ level: 2 }).run())}><Heading2 className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("heading", { level: 3 }))} title="Subheading" onClick={run((e) => e.chain().focus().toggleHeading({ level: 3 }).run())}><Heading3 className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("bold"))} title="Bold" onClick={run((e) => e.chain().focus().toggleBold().run())}><Bold className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("italic"))} title="Italic" onClick={run((e) => e.chain().focus().toggleItalic().run())}><Italic className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("underline"))} title="Underline" onClick={run((e) => e.chain().focus().toggleUnderline().run())}><UnderlineIcon className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("strike"))} title="Strikethrough" onClick={run((e) => e.chain().focus().toggleStrike().run())}><Strikethrough className="h-4 w-4" /></button>
      <ColorMenu editor={editor} disabled={disabled} />
      <span className="w-px h-5 bg-stone-700 mx-1 shrink-0" />
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("bulletList"))} title="Bullets" onClick={run((e) => e.chain().focus().toggleBulletList().run())}><List className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("orderedList"))} title="Numbered" onClick={run((e) => e.chain().focus().toggleOrderedList().run())}><ListOrdered className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("taskList"))} title="Checklist" onClick={run((e) => e.chain().focus().toggleTaskList().run())}><ListChecks className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("blockquote"))} title="Quote" onClick={run((e) => e.chain().focus().toggleBlockquote().run())}><Quote className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive("codeBlock"))} title="Code" onClick={run((e) => e.chain().focus().toggleCodeBlock().run())}><Code className="h-4 w-4" /></button>
      <span className="w-px h-5 bg-stone-700 mx-1 shrink-0" />
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive({ textAlign: "left" }))} title="Left" onClick={run((e) => e.chain().focus().setTextAlign("left").run())}><AlignLeft className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive({ textAlign: "center" }))} title="Centre" onClick={run((e) => e.chain().focus().setTextAlign("center").run())}><AlignCenter className="h-4 w-4" /></button>
      <button type="button" disabled={disabled} className={btn(!!editor?.isActive({ textAlign: "right" }))} title="Right" onClick={run((e) => e.chain().focus().setTextAlign("right").run())}><AlignRight className="h-4 w-4" /></button>
      {editor?.isActive("table") && (
        <>
          <span className="w-px h-5 bg-stone-700 mx-1 shrink-0" />
          {([["+ row", (e: Editor) => e.chain().focus().addRowAfter().run()], ["+ col", (e: Editor) => e.chain().focus().addColumnAfter().run()], ["− row", (e: Editor) => e.chain().focus().deleteRow().run()], ["− col", (e: Editor) => e.chain().focus().deleteColumn().run()], ["✕ table", (e: Editor) => e.chain().focus().deleteTable().run()]] as const).map(([t, fn]) => (
            <button key={t} type="button" className="h-7 px-1.5 rounded text-[11px] text-stone-300 hover:bg-stone-800 shrink-0" onClick={run(fn)}>{t}</button>
          ))}
        </>
      )}
    </div>
  );
}

function ColorMenu({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const colors = ["#e7e5e4", "#fbbf24", "#f87171", "#34d399", "#60a5fa", "#c084fc", "#f472b6", "#a8a29e"];
  return (
    <Popover>
      <PopoverTrigger asChild><button type="button" disabled={disabled} className="h-8 w-8 sm:h-7 sm:w-7 grid place-items-center rounded text-stone-300 hover:bg-stone-800 disabled:opacity-40 shrink-0" title="Colour"><Palette className="h-4 w-4" /></button></PopoverTrigger>
      <PopoverContent className="w-52 p-2 bg-stone-900 border-stone-700 space-y-2">
        <div className="text-[10px] uppercase text-stone-500">Text</div>
        <div className="flex flex-wrap gap-1">{colors.map((c) => <button key={c} type="button" className="h-6 w-6 rounded border border-stone-700" style={{ background: c }} onClick={() => editor?.chain().focus().setColor(c).run()} />)}
          <button type="button" className="h-6 px-1 text-[10px] text-stone-400" onClick={() => editor?.chain().focus().unsetColor().run()}>reset</button></div>
        <div className="text-[10px] uppercase text-stone-500 flex items-center gap-1"><Highlighter className="h-3 w-3" /> Highlight</div>
        <div className="flex flex-wrap gap-1">{["#78350f", "#7f1d1d", "#14532d", "#1e3a8a", "#581c87"].map((c) => <button key={c} type="button" className="h-6 w-6 rounded border border-stone-700" style={{ background: c }} onClick={() => editor?.chain().focus().toggleHighlight({ color: c }).run()} />)}
          <button type="button" className="h-6 px-1 text-[10px] text-stone-400" onClick={() => editor?.chain().focus().unsetHighlight().run()}>none</button></div>
      </PopoverContent>
    </Popover>
  );
}

function InsertMenu({ editor, noteId, isGM, disabled }: { editor: Editor | null; noteId: string; isGM: boolean; disabled: boolean }) {
  const { request, state } = useAg();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<null | "note" | "image">(null);
  const [configuring, setConfiguring] = useState<null | { type: string; attrs: Record<string, any>; title: string }>(null);
  const configure = (type: string, attrs: Record<string, any>, title: string) => { setOpen(false); setConfiguring({ type, attrs, title }); };
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const insert = (content: any) => { editor?.chain().focus().insertContent(content).run(); setOpen(false); };
  const makeRegion = async (inline: boolean) => {
    if (!editor) return;
    setBusy(true);
    try {
      const { regionId } = await request<{ regionId: string }>({ op: "region.create", noteId, inline, acl: { view: "gm", edit: "gm" } });
      if (inline) {
        const { from, to } = editor.state.selection;
        editor.chain().focus().deleteRange({ from, to }).insertContent({ type: "agSecret", attrs: { regionId } }).run();
      } else {
        insert({ type: "agRegion", attrs: { regionId } });
      }
    } catch (e: any) { toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); setOpen(false); }
  };
  const items: Array<{ label: string; icon: React.ReactNode; gm?: boolean; run: () => void; hint?: string }> = [
    { label: "Value (in text)", icon: <Hash className="h-4 w-4" />, run: () => configure("agField", { ref: "", display: "value", label: "", showLabel: false }, "Value in the text") },
    { label: "Value block", icon: <Hash className="h-4 w-4" />, run: () => configure("agFieldBlock", { ref: "", maxRef: "", display: "input", label: "", showLabel: true, color: "" }, "Value") },
    { label: "Resource bar", icon: <Gauge className="h-4 w-4" />, run: () => configure("agFieldBlock", { ref: "", maxRef: "", display: "bar", label: "", showLabel: true, color: "#16a34a" }, "Resource bar") },
    { label: "Button / roll", icon: <Dices className="h-4 w-4" />, gm: true, run: () => configure("agButton", { actionId: "", label: "" }, "Button") },
    { label: "Hidden section", icon: <EyeOff className="h-4 w-4" />, gm: true, run: () => makeRegion(false), hint: "Its own who-can-see / who-can-edit" },
    { label: "Secret words", icon: <Lock className="h-4 w-4" />, gm: true, run: () => makeRegion(true), hint: "Hidden words inside a sentence" },
    { label: "2 columns", icon: <Columns2 className="h-4 w-4" />, run: () => insert({ type: "agColumns", content: [col(), col()] }) },
    { label: "3 columns", icon: <Columns3 className="h-4 w-4" />, run: () => insert({ type: "agColumns", content: [col(), col(), col()] }) },
    { label: "Free canvas", icon: <LayoutGrid className="h-4 w-4" />, run: () => insert({ type: "agCanvas", attrs: { canvasId: uid(), width: 600, height: 260 } }), hint: "Drag & drop anything anywhere" },
    { label: "Image (upload)", icon: <ImageIcon className="h-4 w-4" />, run: () => { setOpen(false); fileRef.current?.click(); } },
    { label: "Image (library)", icon: <ImageIcon className="h-4 w-4" />, run: () => { setOpen(false); setPicker("image"); } },
    { label: "Table", icon: <TableIcon className="h-4 w-4" />, run: () => { editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setOpen(false); } },
    { label: "Chart", icon: <BarChart3 className="h-4 w-4" />, run: () => configure("agChart", { chart: "radar", refs: [], maxRef: "", height: 220 }, "Chart") },
    { label: "Connections table", icon: <Link2 className="h-4 w-4" />, run: () => configure("agLinks", { label: "", columns: [] }, "Connections table") },
    { label: "Link to a sheet", icon: <FileText className="h-4 w-4" />, run: () => { setOpen(false); setPicker("note"); } },
    { label: "Component", icon: <Puzzle className="h-4 w-4" />, run: () => configure("agComponent", { componentId: "", bindings: {} }, "Component") },
    { label: "Divider", icon: <Minus className="h-4 w-4" />, run: () => { editor?.chain().focus().setHorizontalRule().run(); setOpen(false); } },
  ];
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" disabled={disabled} className="h-8 sm:h-7 px-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1 disabled:opacity-40 shrink-0" data-testid="ag-insert">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Insert
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 max-w-[calc(100vw-24px)] p-1.5 bg-stone-900 border-stone-700 grid grid-cols-2 gap-0.5" align="start">
          {items.filter((i) => !i.gm || isGM).map((i) => (
            <button key={i.label} type="button" onClick={i.run} title={i.hint} className="h-9 px-2 rounded hover:bg-stone-800 text-xs text-stone-200 inline-flex items-center gap-1.5 text-left" data-testid={`ag-insert-${i.label}`}>
              {i.icon}<span className="truncate">{i.label}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f || !editor) return;
        setBusy(true);
        try { const url = await uploadImage(f); editor.chain().focus().setImage({ src: url }).run(); }
        catch (err: any) { toast({ title: "Upload failed", description: err.message, variant: "destructive" }); }
        finally { setBusy(false); }
      }} />
      {configuring && (
        <InsertConfigDialog
          noteId={noteId}
          config={configuring}
          onCancel={() => setConfiguring(null)}
          onInsert={(attrs) => { editor?.chain().focus().insertContent({ type: configuring.type, attrs }).run(); setConfiguring(null); }}
        />
      )}
      {picker === "image" && <ImageBrowser open onOpenChange={(o) => { if (!o) setPicker(null); }} onSelect={(src) => { editor?.chain().focus().setImage({ src }).run(); setPicker(null); }} />}
      {picker === "note" && (
        <NotePickerDialog onClose={() => setPicker(null)} exclude={noteId} onPick={(id) => { editor?.chain().focus().insertContent({ type: "agNoteLink", attrs: { noteId: id } }).insertContent(" ").run(); setPicker(null); }} notes={[...state.notes.values()].filter((n) => !n.isTemplate)} />
      )}
    </>
  );
}

const col = () => ({ type: "agColumn", content: [{ type: "paragraph" }] });

export function NotePickerDialog({ notes, onPick, onClose, exclude, title = "Link to a sheet" }: { notes: import("@shared/agnostic/types").AgNote[]; onPick: (id: string) => void; onClose: () => void; exclude?: string; title?: string }) {
  const [q, setQ] = useState("");
  const shown = notes.filter((n) => n.id !== exclude && (!q.trim() || n.name.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 100);
  return (
    <div className="fixed inset-0 z-[20000] bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-stone-700 bg-stone-900 p-3 space-y-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="text-sm text-stone-200">{title}</div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-9 px-2 rounded bg-stone-800 border border-stone-700 text-sm text-stone-100" />
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {shown.map((n) => (
            <button key={n.id} type="button" onClick={() => onPick(n.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-800 text-left text-sm text-stone-200">
              {n.portrait ? <img src={n.portrait} className="h-6 w-6 rounded object-cover" alt="" /> : <span className="h-6 w-6 rounded bg-stone-700" />}{n.name || "Untitled"}<span className="ml-auto text-[10px] text-stone-500">{n.type}</span>
            </button>
          ))}
          {!shown.length && <div className="text-xs text-stone-500 p-2">No sheets.</div>}
        </div>
      </div>
    </div>
  );
}

export { useCallback };

/** Set up a value / bar / button / chart / table / component before it lands in the document. */
function InsertConfigDialog({ noteId, config, onCancel, onInsert }: { noteId: string; config: { type: string; attrs: Record<string, any>; title: string }; onCancel: () => void; onInsert: (attrs: Record<string, any>) => void }) {
  const { state } = useAg();
  const [a, setA] = useState(config.attrs);
  const update = (p: Record<string, any>) => setA((x) => ({ ...x, ...p }));
  const comp = config.type === "agComponent" ? state.components.get(a.componentId) : undefined;
  const ready =
    config.type === "agField" || config.type === "agFieldBlock" ? !!a.ref
    : config.type === "agButton" ? !!a.actionId
    : config.type === "agChart" ? (a.refs ?? []).filter(Boolean).length > 0
    : config.type === "agLinks" ? !!a.label
    : config.type === "agComponent" ? !!a.componentId : true;
  const row = (label: string, el: React.ReactNode) => <div className="flex items-center gap-1.5"><span className="text-[11px] text-stone-400 w-20 shrink-0">{label}</span><div className="flex-1 min-w-0">{el}</div></div>;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-sm" onKeyDown={(e) => e.stopPropagation()} data-testid="ag-insert-config">
        <DialogHeader><DialogTitle className="text-stone-100">Insert {config.title.toLowerCase()}</DialogTitle></DialogHeader>
        <div className="space-y-2 text-stone-200">
          {(config.type === "agField" || config.type === "agFieldBlock") && <FieldConfig attrs={a} update={update} noteId={noteId} block={config.type === "agFieldBlock"} />}
          {config.type === "agButton" && (
            <>
              {row("Does", <ActionPicker noteId={noteId} value={a.actionId} onChange={(actionId) => update({ actionId })} />)}
              {row("Text", <input value={a.label} placeholder="(action name)" onChange={(e) => update({ label: e.target.value })} className="h-8 w-full bg-stone-950 border border-stone-700 rounded px-2 text-sm" />)}
            </>
          )}
          {config.type === "agChart" && (
            <>
              {row("Type", <select value={a.chart} onChange={(e) => update({ chart: e.target.value })} className="h-8 w-full bg-stone-950 border border-stone-700 rounded px-1 text-sm"><option value="radar">Radar</option><option value="bar">Bars</option><option value="line">Line</option><option value="pie">Pie</option></select>)}
              <RefList noteId={noteId} refs={a.refs?.length ? a.refs : [""]} onChange={(refs) => update({ refs })} />
              {row("Scale max", <RefPicker noteId={noteId} value={a.maxRef} placeholder="(auto)" onChange={(maxRef) => update({ maxRef })} />)}
            </>
          )}
          {config.type === "agLinks" && (
            <>
              {row("Connection", <input value={a.label} placeholder="e.g. items" onChange={(e) => update({ label: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} className="h-8 w-full bg-stone-950 border border-stone-700 rounded px-2 text-sm" />)}
              {row("Columns", <input value={(a.columns ?? []).join(", ")} placeholder="weight, qty" onChange={(e) => update({ columns: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })} className="h-8 w-full bg-stone-950 border border-stone-700 rounded px-2 text-sm" />)}
              <div className="text-[10px] text-stone-500">Lists every sheet connected by that name (Links tab), with the chosen values as columns.</div>
            </>
          )}
          {config.type === "agComponent" && (
            <>
              {row("Component", <select value={a.componentId} onChange={(e) => update({ componentId: e.target.value, bindings: {} })} className="h-8 w-full bg-stone-950 border border-stone-700 rounded px-1 text-sm"><option value="">Choose…</option>{[...state.components.values()].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>)}
              {(comp?.params ?? []).map((p) => <React.Fragment key={p}>{row(`$${p}`, <RefPicker noteId={noteId} value={a.bindings?.[p]} onChange={(ref) => update({ bindings: { ...(a.bindings ?? {}), [p]: ref } })} />)}</React.Fragment>)}
              {!state.components.size && <div className="text-xs text-stone-500">Make components in the Components tab first.</div>}
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800">Cancel</button>
            <button type="button" disabled={!ready} onClick={() => onInsert({ ...a, refs: Array.isArray(a.refs) ? a.refs.filter(Boolean) : a.refs })} className="h-9 px-4 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm disabled:opacity-50" data-testid="ag-insert-confirm">Insert</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
