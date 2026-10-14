// The Agnostic sheet editor: a collaborative rich-text document (TipTap +
// Yjs) that can hold live values, resource bars, buttons, columns, free
// canvases, charts, connection tables, components, and sections / words with
// their own permissions. Regions are nested editors bound to their own docs.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  Image as ImageIcon, Table as TableIcon, BarChart3, Link2, Puzzle, Minus, Highlighter, Palette, Loader2, FileText, Code, Sparkles, PanelsTopLeft, Backpack,
  Activity,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAg, useDoc } from "../hooks";
import { usePlayView } from "../viewMode";
import { parseDocName } from "@shared/agnostic/types";
import { CANVAS_ORIGIN } from "../client";
import { AG_NODES, AgDocContext, FieldConfig, lookKindFor } from "./nodes";
import { LookEditor } from "../look";
import { FieldDisplay, ActionButton, ChartWidget, LinksTable, ComponentView } from "../widgets";
import { RefPicker, ComponentPicker, noteItems } from "../pickers";
import { LinksConfigEditor } from "../links";
import { AgPanel, AgSelector } from "../float";
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

// --------------------------------------------------------------------------- images
/** Images drag-resize from their sides / corners and can be aligned. */
const AgImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("data-align"), renderHTML: (a: any) => (a.align ? { "data-align": a.align } : {}) },
    };
  },
}).configure({
  inline: false, allowBase64: false,
  resize: { enabled: true, directions: ["left", "right", "bottom-left", "bottom-right"], minWidth: 40, minHeight: 24, alwaysPreserveAspectRatio: true },
});

// --------------------------------------------------------------------------- editor
export function AgEditor({ docName, noteId, nested, inline, placeholder }: { docName: string; noteId: string; nested?: boolean; inline?: boolean; placeholder?: string }) {
  const handle = useDoc(docName);
  const { previewUserId, state, realViewer } = useAg();
  // Player view locks the page, but the GM's own GM-only sections stay writable:
  // they're notes, not layout.
  const parsed = parseDocName(docName);
  const gmSection = parsed?.kind === "region" && realViewer.isGM && state.regions.get(parsed.id)?.acl.view === "gm";
  const play = usePlayView() && !gmSection;
  if (!handle) return null;
  if (handle.revoked) return null; // no longer allowed: nothing to show
  if (!handle.synced) return <span className="inline-flex items-center gap-1 text-xs text-stone-500"><Loader2 className="h-3 w-3 animate-spin" />{inline ? "" : "Loading…"}</span>;
  // Blocks draw their tools once, for the editability they started with: switching
  // GM / Player view (or previewing a player) builds the editor afresh.
  return <BoundEditor key={`${docName}#${handle.generation}#${play ? "play" : "build"}#${previewUserId ?? ""}`} doc={handle.doc} awareness={handle.awareness} readOnly={handle.readOnly} locked={play} noteId={noteId} nested={nested} inline={inline} placeholder={placeholder} />;
}

function BoundEditor({ doc, awareness, readOnly, locked: play, noteId, nested, inline, placeholder }: {
  doc: Y.Doc; awareness: any; readOnly: boolean; locked: boolean; noteId: string; nested?: boolean; inline?: boolean; placeholder?: string;
}) {
  const { viewer, previewUserId } = useAg();
  const active = useActiveEditor();
  // Preview-as-player: the GM sees exactly what the player could change.
  // Player view: the page is locked (its values, bars and buttons still work).
  const editable = !readOnly && !previewUserId && !play;
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
      AgImage,
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
    <AgDocContext.Provider value={{ doc, noteId, undo: () => undoManager.undo(), redo: () => undoManager.redo() }}>
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
    <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar py-1" data-testid="ag-toolbar"
      // Keep the page's cursor while pressing toolbar buttons — but only for the toolbar itself:
      // panels it opens (insert settings, pickers) are portalled and must take clicks / focus normally.
      onMouseDown={(e) => { if (e.currentTarget.contains(e.target as Node)) e.preventDefault(); }}>
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
      {editor?.isActive("image") && (
        <>
          <span className="w-px h-5 bg-stone-700 mx-1 shrink-0" />
          <span className="text-[10px] text-stone-500 shrink-0">Image</span>
          {([["S", 160], ["M", 320], ["L", 520], ["Full", 2000]] as const).map(([t, w]) => (
            <button key={t} type="button" className="h-7 px-1.5 rounded text-[11px] text-stone-300 hover:bg-stone-800 shrink-0" title={`Width: ${t === "Full" ? "the whole line" : `${w}px`}`} onClick={run((e) => e.chain().focus().updateAttributes("image", { width: w, height: null }).run())} data-testid={`ag-image-size-${t}`}>{t}</button>
          ))}
          {(["left", "center", "right"] as const).map((al) => (
            <button key={al} type="button" className={btn(editor.getAttributes("image").align === al || (al === "left" && !editor.getAttributes("image").align))} title={`Align ${al}`} onClick={run((e) => e.chain().focus().updateAttributes("image", { align: al === "left" ? null : al }).run())}>
              {al === "left" ? <AlignLeft className="h-4 w-4" /> : al === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
            </button>
          ))}
        </>
      )}
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} className={`h-8 w-8 sm:h-7 sm:w-7 grid place-items-center rounded hover:bg-stone-800 disabled:opacity-40 shrink-0 ${open ? "text-amber-300" : "text-stone-300"}`} title="Colour"><Palette className="h-4 w-4" /></button>
      {open && <AgPanel title="Text colour & highlight" onClose={() => setOpen(false)} width={280} height={240}>
        <div className="text-[10px] uppercase text-stone-500">Text</div>
        <div className="flex flex-wrap gap-1">{colors.map((c) => <button key={c} type="button" className="h-6 w-6 rounded border border-stone-700" style={{ background: c }} onClick={() => editor?.chain().focus().setColor(c).run()} />)}
          <button type="button" className="h-6 px-1 text-[10px] text-stone-400" onClick={() => editor?.chain().focus().unsetColor().run()}>reset</button></div>
        <div className="text-[10px] uppercase text-stone-500 flex items-center gap-1"><Highlighter className="h-3 w-3" /> Highlight</div>
        <div className="flex flex-wrap gap-1">{["#78350f", "#7f1d1d", "#14532d", "#1e3a8a", "#581c87"].map((c) => <button key={c} type="button" className="h-6 w-6 rounded border border-stone-700" style={{ background: c }} onClick={() => editor?.chain().focus().toggleHighlight({ color: c }).run()} />)}
          <button type="button" className="h-6 px-1 text-[10px] text-stone-400" onClick={() => editor?.chain().focus().unsetHighlight().run()}>none</button></div>
      </AgPanel>}
    </>
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
    { label: "Value (in text)", hint: "A live value inside a sentence", icon: <Hash className="h-4 w-4" />, run: () => configure("agField", { ref: "", display: "value", label: "", showLabel: false }, "Value in the text") },
    { label: "Value block", hint: "A value on its own line", icon: <Hash className="h-4 w-4" />, run: () => configure("agFieldBlock", { ref: "", maxRef: "", display: "input", label: "", showLabel: true, color: "" }, "Value") },
    { label: "Resource bar", hint: "Current / max as a bar", icon: <Gauge className="h-4 w-4" />, run: () => configure("agFieldBlock", { ref: "", maxRef: "", display: "bar", label: "", showLabel: true, color: "#16a34a" }, "Resource bar") },
    { label: "Button / roll", hint: "Rolls dice, changes values, posts messages", icon: <Dices className="h-4 w-4" />, gm: true, run: () => configure("agButton", { actionId: "", label: "" }, "Button") },
    { label: "Effects", hint: "Changes this sheet makes to another's values (a wound's −2 Athletics)", icon: <Activity className="h-4 w-4" />, gm: true, run: () => insert({ type: "agEffects", attrs: { via: "", condition: "" } }) },
    { label: "Rolls", hint: "Named rolls with dice, bonus and costs — as many as you like", icon: <Dices className="h-4 w-4" />, gm: true, run: () => insert({ type: "agRolls", attrs: { via: "", costs: [] } }) },
    { label: "Hidden section", icon: <EyeOff className="h-4 w-4" />, gm: true, run: () => makeRegion(false), hint: "Its own who-can-see / who-can-edit" },
    { label: "Secret words", icon: <Lock className="h-4 w-4" />, gm: true, run: () => makeRegion(true), hint: "Hidden words inside a sentence" },
    { label: "Tabs", hint: "Split the page into tabs (Overview, Skills, Inventory…)", icon: <PanelsTopLeft className="h-4 w-4" />, run: () => insert({ type: "agTabs", attrs: { tabsId: uid() }, content: ["Overview", "Details", "Notes"].map((title) => ({ type: "agTab", attrs: { title }, content: [{ type: "paragraph" }] })) }) },
    { label: "2 columns", hint: "Side by side", icon: <Columns2 className="h-4 w-4" />, run: () => insert({ type: "agColumns", content: [col(), col()] }) },
    { label: "3 columns", hint: "Side by side", icon: <Columns3 className="h-4 w-4" />, run: () => insert({ type: "agColumns", content: [col(), col(), col()] }) },
    { label: "Free canvas", icon: <LayoutGrid className="h-4 w-4" />, run: () => insert({ type: "agCanvas", attrs: { canvasId: uid(), width: 600, height: 260 } }), hint: "Drag & drop anything anywhere" },
    { label: "Image (upload)", hint: "From your device", icon: <ImageIcon className="h-4 w-4" />, run: () => { setOpen(false); fileRef.current?.click(); } },
    { label: "Image (library)", hint: "From the image library", icon: <ImageIcon className="h-4 w-4" />, run: () => { setOpen(false); setPicker("image"); } },
    { label: "Table", hint: "Rows and columns", icon: <TableIcon className="h-4 w-4" />, run: () => { editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setOpen(false); } },
    { label: "Chart", hint: "Radar, bars, line or pie of several values", icon: <BarChart3 className="h-4 w-4" />, run: () => configure("agChart", { chart: "radar", refs: [], maxRef: "", height: 220 }, "Chart") },
    { label: "Connections table", hint: "Every connected sheet, with value columns", icon: <Link2 className="h-4 w-4" />, run: () => configure("agLinks", { label: "", columns: [], config: {} }, "Connections table") },
    { label: "Inventory", hint: "Item cards with search, filters, Add and equip", icon: <Backpack className="h-4 w-4" />, run: () => configure("agLinks", { label: "items", columns: [{ ref: "qty", display: "input", label: "Qty" }, { ref: "weight", display: "value", suffix: "lbs" }, { ref: "equipped", display: "toggle", label: "Equip" }], config: { layout: "cards", search: true, add: { types: ["item"], reverse: "owner", existing: true }, remove: "delete" } }, "Inventory") },
    { label: "Link to a sheet", hint: "A chip that opens another sheet", icon: <FileText className="h-4 w-4" />, run: () => { setOpen(false); setPicker("note"); } },
    { label: "Component", hint: "One of your reusable designs", icon: <Puzzle className="h-4 w-4" />, run: () => configure("agComponent", { componentId: "", bindings: {} }, "Component") },
    { label: "Icon", hint: "A small picture in the text (heart, sword, coins…)", icon: <Sparkles className="h-4 w-4" />, run: () => insert({ type: "agIcon", attrs: { name: "Star", color: "#d4a24c", size: 16 } }) },
    { label: "Divider", hint: "A horizontal line", icon: <Minus className="h-4 w-4" />, run: () => { editor?.chain().focus().setHorizontalRule().run(); setOpen(false); } },
  ];
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} className="h-8 sm:h-7 px-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1 disabled:opacity-40 shrink-0" data-testid="ag-insert">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Insert
      </button>
      {open && (
        <AgPanel title="Insert" onClose={() => setOpen(false)} width={340} height={600} testId="ag-insert-panel">
          <div className="text-[11px] text-stone-500">Goes where the cursor is on the page.</div>
          <div className="space-y-1">
            {items.filter((i) => !i.gm || isGM).map((i) => (
              <button key={i.label} type="button" onClick={i.run} className="w-full flex items-center gap-3 p-2 rounded-lg bg-stone-800 border border-stone-700 hover:border-amber-700 text-left" data-testid={`ag-insert-${i.label}`}>
                <span className="h-8 w-8 rounded bg-stone-900 border border-stone-700 grid place-items-center text-amber-400 shrink-0">{i.icon}</span>
                <span className="min-w-0"><span className="block text-sm text-stone-100">{i.label}</span>{i.hint && <span className="block text-[11px] text-stone-400 truncate">{i.hint}</span>}</span>
              </button>
            ))}
          </div>
        </AgPanel>
      )}
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
      {picker === "image" && <ImageBrowser floating open onOpenChange={(o) => { if (!o) setPicker(null); }} onSelect={(src) => { editor?.chain().focus().setImage({ src }).run(); setPicker(null); }} />}
      {picker === "note" && (
        <NotePickerDialog onClose={() => setPicker(null)} exclude={noteId} onPick={(id) => { editor?.chain().focus().insertContent({ type: "agNoteLink", attrs: { noteId: id } }).insertContent(" ").run(); setPicker(null); }} notes={[...Array.from(state.notes.values())].filter((n) => !n.isTemplate)} />
      )}
    </>
  );
}

const col = () => ({ type: "agColumn", content: [{ type: "paragraph" }] });

export function NotePickerDialog({ notes, onPick, onClose, exclude, title = "Link to a sheet" }: { notes: import("@shared/agnostic/types").AgNote[]; onPick: (id: string) => void; onClose: () => void; exclude?: string; title?: string }) {
  return <AgSelector title={title} items={noteItems(notes.filter((n) => n.id !== exclude))} onPick={onPick} onClose={onClose} emptyText="No other sheets yet." testId="ag-note-selector" />;
}



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
  const isField = config.type === "agField" || config.type === "agFieldBlock";
  const lookKind = isField ? lookKindFor(a.display, config.type === "agField")
    : config.type === "agButton" ? "button" : config.type === "agChart" ? "chart" : config.type === "agLinks" ? "links" : config.type === "agComponent" ? "component" : null;
  const look = { ...(a.color ? { color: a.color } : {}), ...(a.look ?? {}) };
  const preview = !ready ? null
    : isField ? <FieldDisplay noteId={noteId} refPath={a.ref} maxRef={a.maxRef || undefined} display={a.display} label={a.label || undefined} showLabel={a.showLabel !== false} look={look} />
    : config.type === "agButton" ? <ActionButton actionId={a.actionId} label={a.label || undefined} look={look} />
    : config.type === "agChart" ? <ChartWidget noteId={noteId} chart={a.chart} refs={(a.refs ?? []).filter(Boolean)} maxRef={a.maxRef || undefined} height={Math.min(220, look.height ?? a.height ?? 220)} look={look} />
    : config.type === "agLinks" ? <LinksTable noteId={noteId} label={a.label} columns={a.columns ?? []} config={a.config} look={look} />
    : config.type === "agComponent" ? <ComponentView componentId={a.componentId} noteId={noteId} bindings={a.bindings ?? {}} />
    : null;
  return (
    <AgPanel title={`Insert ${config.title.toLowerCase()}`} onClose={onCancel} width={400} height={640} testId="ag-insert-config"
      footer={<>
        <button type="button" onClick={onCancel} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800">Cancel</button>
        <button type="button" disabled={!ready} onClick={() => onInsert({ ...a, refs: Array.isArray(a.refs) ? a.refs.filter(Boolean) : a.refs })} className="h-9 px-4 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm disabled:opacity-50" data-testid="ag-insert-confirm">Insert</button>
      </>}>
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
              <LinksConfigEditor noteId={noteId} value={{ label: a.label, columns: a.columns ?? [], config: a.config }} onChange={(v) => update({ label: v.label, columns: v.columns, config: v.config ?? {} })} />
              <div className="text-[10px] text-stone-500">Lists every sheet connected by that name (Links tab). As item cards with Add, it's an inventory.</div>
            </>
          )}
          {config.type === "agComponent" && (
            <>
              {row("Component", <ComponentPicker value={a.componentId} onChange={(componentId) => update({ componentId, bindings: {} })} />)}
              {(comp?.params ?? []).map((p) => <React.Fragment key={p}>{row(`$${p}`, <RefPicker noteId={noteId} value={a.bindings?.[p]} placeholder={`(this sheet's ${p})`} onChange={(ref) => update({ bindings: { ...(a.bindings ?? {}), [p]: ref } })} />)}</React.Fragment>)}
              {comp && comp.params.length > 0 && <div className="text-[10px] text-stone-500">Leave a parameter empty to use this sheet's value with the same name.</div>}
              {!state.components.size && <div className="text-xs text-stone-500">Make components in the Components tab first.</div>}
            </>
          )}
          {preview && (
            <div className="rounded border border-dashed border-stone-700 p-2" data-testid="ag-insert-preview">
              <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Preview</div>
              <div style={{ width: look.width ? `${look.width}%` : undefined, marginLeft: look.align && look.align !== "left" ? "auto" : undefined, marginRight: look.align === "center" ? "auto" : undefined }}>{preview}</div>
            </div>
          )}
          {lookKind && (
            <details className="rounded border border-stone-800 px-2 py-1" data-testid="ag-insert-look">
              <summary className="text-xs text-stone-300 cursor-pointer select-none py-1">Look & size — colours, text, style (change any time with ⚙ or by dragging its edges)</summary>
              <LookEditor look={look} onChange={(l) => update({ look: l, ...(isField ? { color: "" } : {}) })} kind={lookKind} />
            </details>
          )}
        </div>
    </AgPanel>
  );
}
