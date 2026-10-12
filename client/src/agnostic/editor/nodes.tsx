// Custom document nodes for Agnostic sheets. Every node is a *reference*:
// values live in the data layer, restricted text lives in its own region doc.
// The document only says where things go.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import * as Y from "yjs";
import { Settings2, GripVertical, Trash2, Lock, EyeOff, LayoutGrid, Check, Plus, Minus } from "lucide-react";
import type { AgLayout, AgLayoutItem, AgLook } from "@shared/agnostic/types";
import { regionDocName } from "@shared/agnostic/types";
import { describeAudience } from "@shared/agnostic/acl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAg, useAgMaybe, useMemberName } from "../hooks";
import { FieldDisplay, ActionButton, ChartWidget, LinksTable, NoteChip, ComponentView, LayoutView } from "../widgets";
import { LayoutEditor, RefList } from "../LayoutEditor";
import { RefPicker, AclEditor } from "../pickers";
import { ActionPicker } from "../ActionEditor";
import { CANVAS_ORIGIN } from "../client";
import { BlockFrame, LookEditor, type LookKind } from "../look";
import { mergeLook } from "../lookUtil";
// Circular by design: regions contain editors that contain regions.
import { AgEditor } from "./AgEditor";

/** The Y.Doc and note an editor instance is bound to (regions get their own). */
export interface AgDocCtx { doc: Y.Doc; noteId: string; undo?: () => void; redo?: () => void }
export const AgDocContext = createContext<AgDocCtx | null>(null);
const useDocCtx = () => useContext(AgDocContext);

const stopInside = ({ event }: { event: Event }) => {
  const t = event.target as HTMLElement | null;
  // Let ProseMirror handle dragging the node by its handle; everything else inside stays local.
  if (t?.closest?.("[data-drag-handle]")) return false;
  return true;
};

/** Look stored on a node: the `look` attribute, with older attributes (colour) as a fallback. */
function nodeLook(attrs: any): AgLook {
  return mergeLook({ color: attrs.color || undefined }, attrs.look && typeof attrs.look === "object" ? attrs.look : undefined);
}
function lookUpdater(p: NodeViewProps) {
  return (patch: Partial<AgLook>) => {
    const next: Record<string, unknown> = { ...(p.node.attrs.look ?? {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    p.updateAttributes({ look: next });
  };
}

interface FrameSpec { look: AgLook; onLook: (patch: Partial<AgLook>) => void; height?: { value: number; min: number; max: number } }

function Shell({ selected, editable, children, tools, label, className = "", inline, frame }: {
  selected: boolean; editable: boolean; children: React.ReactNode | ((live: Partial<AgLook> | null) => React.ReactNode); tools?: React.ReactNode; label?: string; className?: string; inline?: boolean;
  /** Blocks: width / align / background + drag-to-resize. */
  frame?: FrameSpec;
}) {
  const body = typeof children === "function" ? children(null) : children;
  if (inline) return <NodeViewWrapper as="span" className={`ag-inline ${selected ? "ring-1 ring-amber-400 rounded" : ""} ${className}`}>{body}{editable && <span className={selected ? "" : "ag-touch-only"}>{tools}</span>}</NodeViewWrapper>;
  return (
    <NodeViewWrapper className={`group relative my-1.5 ${className}`}>
      {editable && (
        <div className={`ag-node-tools absolute -left-1 -top-2.5 z-10 flex items-center gap-0.5 rounded bg-stone-900/95 border border-stone-700 px-0.5 shadow ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"} transition-opacity`} contentEditable={false}>
          <span data-drag-handle draggable className="h-6 w-5 grid place-items-center cursor-grab text-stone-400" title="Drag to move"><GripVertical className="h-3.5 w-3.5" /></span>
          {label && <span className="text-[10px] text-stone-400 px-0.5">{label}</span>}
          {tools}
        </div>
      )}
      <div className={`${editable ? "ag-node-body" : ""} ${selected ? "ring-1 ring-amber-400/70 rounded" : ""}`}>
        {frame ? <BlockFrame look={frame.look} onLook={frame.onLook} editable={editable} height={frame.height} testId={`ag-block-${label ?? "block"}`}>{children}</BlockFrame> : body}
      </div>
    </NodeViewWrapper>
  );
}

function ToolButton({ onClick, title, children, danger }: { onClick: () => void; title: string; children: React.ReactNode; danger?: boolean }) {
  return <button type="button" onClick={onClick} title={title} className={`h-6 w-6 grid place-items-center rounded ${danger ? "text-red-300 hover:bg-red-950" : "text-stone-300 hover:bg-stone-800"}`}>{children}</button>;
}

function ConfigPopover({ children, defaultOpen, look }: {
  children?: React.ReactNode; defaultOpen?: boolean;
  /** Adds a "Look" tab: size, colours, text, style. */
  look?: { value: AgLook; onChange: (l: AgLook) => void; kind: LookKind };
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [tab, setTab] = useState<"data" | "look">(children ? "data" : "look");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" className="h-6 w-6 grid place-items-center rounded text-stone-300 hover:bg-stone-800" title="Settings & look" data-testid="ag-node-config"><Settings2 className="h-3.5 w-3.5" /></button></PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-16px)] max-h-[75vh] overflow-y-auto p-2 bg-stone-900 border-stone-700 space-y-2 text-stone-200" align="start" collisionPadding={8} onKeyDown={(e) => e.stopPropagation()}>
        {look && children && (
          <div className="flex gap-1 sticky -top-2 -mt-2 -mx-2 px-2 pt-2 pb-1 bg-stone-900 z-10">
            <button type="button" onClick={() => setTab("data")} className={`h-7 px-2.5 rounded text-xs ${tab === "data" ? "bg-amber-600 text-white" : "bg-stone-800 text-stone-300"}`}>Settings</button>
            <button type="button" onClick={() => setTab("look")} className={`h-7 px-2.5 rounded text-xs ${tab === "look" ? "bg-amber-600 text-white" : "bg-stone-800 text-stone-300"}`} data-testid="ag-node-look-tab">Look & size</button>
          </div>
        )}
        {tab === "data" && children}
        {tab === "look" && look && <LookEditor look={look.value} onChange={look.onChange} kind={look.kind} />}
      </PopoverContent>
    </Popover>
  );
}

/** Which look panel a value uses, by how it's shown. */
export function lookKindFor(display: string, inline: boolean): LookKind {
  if (inline) return "inlineValue";
  return (["bar", "pips", "dial", "value", "input", "badge", "label"].includes(display) ? display : "value") as LookKind;
}

/** How tall a value block is, for the bottom drag handle (bars / pips / dials). */
function fieldHeight(display: string, look: AgLook): FrameSpec["height"] {
  if (display === "bar") return look.direction === "up" ? { value: look.height ?? 120, min: 20, max: 800 } : { value: look.height ?? 14, min: 4, max: 200 };
  if (display === "pips") return { value: look.height ?? 14, min: 6, max: 64 };
  if (display === "dial") return { value: look.height ?? 56, min: 24, max: 400 };
  return undefined;
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-1.5"><span className="text-[11px] text-stone-400 w-16 shrink-0">{label}</span><div className="flex-1 min-w-0">{children}</div></div>
);

const DISPLAYS: Array<[string, string]> = [["value", "Value"], ["input", "Editable"], ["bar", "Resource bar"], ["pips", "Pips"], ["dial", "Dial"], ["badge", "Badge"]];

// --------------------------------------------------------------------------- field (inline + block)
export function FieldConfig({ attrs, update, noteId, block }: { attrs: any; update: (a: any) => void; noteId: string; block: boolean }) {
  return (
    <>
      <Row label="Value"><RefPicker noteId={noteId} value={attrs.ref} onChange={(ref) => update({ ref })} /></Row>
      {block && <Row label="Max"><RefPicker noteId={noteId} value={attrs.maxRef ?? ""} placeholder="(none)" onChange={(maxRef) => update({ maxRef })} /></Row>}
      <Row label="Show as">
        <select value={attrs.display} onChange={(e) => update({ display: e.target.value })} className="h-7 w-full bg-stone-900 border border-stone-700 rounded text-xs px-1">
          {DISPLAYS.filter(([d]) => block || ["value", "input", "badge"].includes(d)).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </Row>
      <Row label="Label">
        <div className="flex items-center gap-1">
          <input value={attrs.label ?? ""} placeholder="(field name)" onChange={(e) => update({ label: e.target.value })} className="h-7 flex-1 min-w-0 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" />
          <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={attrs.showLabel !== false} onChange={(e) => update({ showLabel: e.target.checked })} />show</label>
        </div>
      </Row>
      <div className="text-[10px] text-stone-500">Size, colours and style are under “Look & size”. Who can see / change the value is set on the value itself (Values tab).</div>
    </>
  );
}

function FieldInlineView(p: NodeViewProps) {
  const ctx = useDocCtx();
  if (!ctx) return <NodeViewWrapper as="span" />;
  const a = p.node.attrs;
  const look = nodeLook(a);
  return (
    <Shell inline selected={p.selected} editable={p.editor.isEditable} tools={<span contentEditable={false}><ConfigPopover look={{ value: a.look ?? {}, onChange: (l) => p.updateAttributes({ look: l }), kind: "inlineValue" }}><FieldConfig attrs={a} update={p.updateAttributes} noteId={ctx.noteId} block={false} /></ConfigPopover></span>}>
      <span contentEditable={false} className="align-baseline">{a.ref ? <FieldDisplay noteId={ctx.noteId} refPath={a.ref} display={a.display} label={a.label || undefined} showLabel={a.showLabel !== false} look={look} /> : <span className="text-xs text-stone-500">[value]</span>}</span>
    </Shell>
  );
}

function FieldBlockView(p: NodeViewProps) {
  const ctx = useDocCtx();
  if (!ctx) return <NodeViewWrapper />;
  const a = p.node.attrs;
  const look = nodeLook(a);
  return (
    <Shell
      selected={p.selected} editable={p.editor.isEditable} label="value"
      frame={{ look, onLook: lookUpdater(p), height: fieldHeight(a.display, look) }}
      tools={<><ConfigPopover look={{ value: look, onChange: (l) => p.updateAttributes({ look: l, color: "" }), kind: lookKindFor(a.display, false) }}><FieldConfig attrs={a} update={p.updateAttributes} noteId={ctx.noteId} block /></ConfigPopover><ToolButton title="Remove" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton></>}
    >
      {(live) => <div contentEditable={false} className="py-0.5">{a.ref ? <FieldDisplay noteId={ctx.noteId} refPath={a.ref} maxRef={a.maxRef || undefined} display={a.display} label={a.label || undefined} showLabel={a.showLabel !== false} look={live?.height ? { ...look, height: live.height } : look} /> : <span className="text-xs text-stone-500">Choose a value (⚙)</span>}</div>}
    </Shell>
  );
}

export const AgField = Node.create({
  name: "agField", group: "inline", inline: true, atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ ref: { default: "" }, display: { default: "value" }, label: { default: "" }, showLabel: { default: true }, look: { default: {} } }),
  parseHTML: () => [{ tag: "span[data-ag-field]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-ag-field": "" })],
  addNodeView: () => ReactNodeViewRenderer(FieldInlineView, { stopEvent: stopInside, as: "span" }),
});

export const AgFieldBlock = Node.create({
  name: "agFieldBlock", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ ref: { default: "" }, maxRef: { default: "" }, display: { default: "value" }, label: { default: "" }, showLabel: { default: true }, color: { default: "" }, look: { default: {} } }),
  parseHTML: () => [{ tag: "div[data-ag-field-block]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-field-block": "" })],
  addNodeView: () => ReactNodeViewRenderer(FieldBlockView, { stopEvent: stopInside }),
});

// --------------------------------------------------------------------------- regions (permission-scoped text)
function useRegion(regionId: string) {
  const { state, realViewer, previewUserId } = useAg();
  const region = state.regions.get(regionId);
  const note = region ? state.notes.get(region.noteId) : undefined;
  return { region, note, gmView: realViewer.isGM && !previewUserId };
}

function RegionAcl({ regionId }: { regionId: string }) {
  const { state, request } = useAg();
  const r = state.regions.get(regionId);
  if (!r) return null;
  return <AclEditor acl={r.acl} onChange={(acl) => request({ op: "region.update", id: regionId, patch: { acl } })} />;
}

function RegionBadge({ regionId }: { regionId: string }) {
  const { state } = useAg();
  const name = useMemberName();
  const r = state.regions.get(regionId);
  if (!r || (r.acl.view === "inherit" && r.acl.edit === "inherit")) return null;
  return <span className="text-[10px] text-violet-300 inline-flex items-center gap-0.5"><EyeOff className="h-3 w-3" />{describeAudience(r.acl.view, name)}</span>;
}

function RegionBlockView(p: NodeViewProps) {
  const regionId = p.node.attrs.regionId as string;
  const { region, note, gmView } = useRegion(regionId);
  const editable = p.editor.isEditable;
  // Not allowed to see it → the block simply isn't there for this viewer.
  if (!region || !note) {
    return <NodeViewWrapper>{gmView && editable ? <div contentEditable={false} className="text-xs text-stone-500 italic my-1">[deleted section]</div> : null}</NodeViewWrapper>;
  }
  const restricted = region.acl.view !== "inherit";
  const look = nodeLook(p.node.attrs);
  return (
    <Shell selected={p.selected} editable={editable && gmView} label={region.label || "section"} frame={{ look, onLook: lookUpdater(p) }} tools={<>
      <ConfigPopover look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "section" }}>
        <div className="text-xs text-stone-300">Who can see and edit this section</div>
        <RegionAcl regionId={regionId} />
        <RegionLabel regionId={regionId} />
      </ConfigPopover>
      <ToolButton title="Remove section" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
    </>}>
      <div contentEditable={false} className={`rounded px-2 py-1 ${restricted && gmView ? "border border-dashed border-violet-700/70 bg-violet-950/20" : ""}`} data-testid={`ag-region-${regionId}`}>
        {gmView && restricted && <div className="mb-0.5"><RegionBadge regionId={regionId} /></div>}
        <AgEditor docName={regionDocName(regionId, note.docEpoch)} noteId={note.id} nested />
      </div>
    </Shell>
  );
}

function RegionLabel({ regionId }: { regionId: string }) {
  const { state, request } = useAg();
  const r = state.regions.get(regionId);
  const [v, setV] = useState(r?.label ?? "");
  return <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => request({ op: "region.update", id: regionId, patch: { label: v || null } })} placeholder="Section name (optional)" className="h-7 w-full bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" />;
}

function SecretInlineView(p: NodeViewProps) {
  const regionId = p.node.attrs.regionId as string;
  const { region, note, gmView } = useRegion(regionId);
  if (!region || !note) return <NodeViewWrapper as="span" />;
  return (
    <NodeViewWrapper as="span" className={`ag-secret inline-block align-baseline ${gmView ? "rounded border border-dashed border-violet-600/80 bg-violet-950/30 px-0.5" : ""} ${p.selected ? "ring-1 ring-amber-400" : ""}`} data-testid={`ag-secret-${regionId}`}>
      {gmView && p.editor.isEditable && (
        <span contentEditable={false} className="inline-flex align-middle mr-0.5">
          <Popover>
            <PopoverTrigger asChild><button type="button" className="text-violet-300" title="Who can see these words"><Lock className="h-3 w-3" /></button></PopoverTrigger>
            <PopoverContent className="w-64 p-2 bg-stone-900 border-stone-700 space-y-2" align="start">
              <div className="text-xs text-stone-300">Who can see / edit these words</div>
              <RegionAcl regionId={regionId} />
              <button type="button" onClick={p.deleteNode} className="h-7 px-2 rounded text-xs text-red-300 hover:bg-red-950">Remove</button>
            </PopoverContent>
          </Popover>
        </span>
      )}
      <span contentEditable={false} className="inline-block align-baseline min-w-[1ch]"><AgEditor docName={regionDocName(regionId, note.docEpoch)} noteId={note.id} nested inline /></span>
    </NodeViewWrapper>
  );
}

export const AgRegion = Node.create({
  name: "agRegion", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ regionId: { default: "" }, look: { default: {} } }),
  parseHTML: () => [{ tag: "div[data-ag-region]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-region": "" })],
  addNodeView: () => ReactNodeViewRenderer(RegionBlockView, { stopEvent: stopInside, ignoreMutation: () => true }),
});

export const AgSecret = Node.create({
  name: "agSecret", group: "inline", inline: true, atom: true, selectable: true,
  addAttributes: () => ({ regionId: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-ag-secret]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-ag-secret": "" })],
  addNodeView: () => ReactNodeViewRenderer(SecretInlineView, { stopEvent: () => true, ignoreMutation: () => true, as: "span" }),
});

// --------------------------------------------------------------------------- columns
function ColumnsView(p: NodeViewProps) {
  const n = p.node.childCount;
  const editable = p.editor.isEditable;
  const look = nodeLook(p.node.attrs);
  const ratio = (look.ratio ?? "").split(":").map(Number).filter((x) => x > 0);
  const template = ratio.length ? Array.from({ length: n }, (_, i) => `minmax(0, ${ratio[i] ?? 1}fr)`).join(" ") : undefined;
  const addColumn = () => {
    const pos = p.getPos();
    if (typeof pos !== "number" || n >= 4) return;
    p.editor.chain().insertContentAt(pos + p.node.nodeSize - 1, { type: "agColumn", content: [{ type: "paragraph" }] }).run();
  };
  const removeColumn = () => {
    const pos = p.getPos();
    if (typeof pos !== "number" || n <= 2) return;
    const last = p.node.lastChild!;
    if (last.textContent.trim() && !window.confirm("Remove the last column and what's in it?")) return;
    const end = pos + p.node.nodeSize - 1;
    p.editor.chain().deleteRange({ from: end - last.nodeSize, to: end }).run();
  };
  return (
    <NodeViewWrapper className="ag-columns-wrap group relative my-1.5">
      {editable && (
        <div contentEditable={false} className="ag-node-tools absolute -left-1 -top-2.5 z-10 flex items-center gap-0.5 rounded bg-stone-900/95 border border-stone-700 px-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <span data-drag-handle draggable className="h-6 w-5 grid place-items-center cursor-grab text-stone-400"><GripVertical className="h-3.5 w-3.5" /></span>
          <span className="text-[10px] text-stone-400 px-0.5">{n} columns</span>
          <ToolButton title="One column fewer" onClick={removeColumn}><Minus className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton title="One more column" onClick={addColumn}><Plus className="h-3.5 w-3.5" /></ToolButton>
          <ConfigPopover look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "columns" }} />
          <ToolButton title="Remove columns" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
        </div>
      )}
      <div style={{
        width: look.width ? `${look.width}%` : undefined, marginLeft: look.align && look.align !== "left" ? "auto" : undefined, marginRight: look.align === "center" ? "auto" : undefined,
        background: look.bg, border: look.outline ? `1px solid ${look.outline}` : undefined, borderRadius: look.bg || look.outline ? (look.radius ?? 6) : undefined, padding: look.padding,
      }}>
        <NodeViewContent className="ag-columns" style={{ ["--ag-cols" as any]: n, ["--ag-cols-tpl" as any]: template, ["--ag-gap" as any]: look.gap !== undefined ? `${look.gap}px` : undefined }} />
      </div>
    </NodeViewWrapper>
  );
}

export const AgColumns = Node.create({
  name: "agColumns", group: "block", content: "agColumn{2,4}", draggable: true, isolating: true,
  addAttributes: () => ({ look: { default: {} } }),
  parseHTML: () => [{ tag: "div[data-ag-columns]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-columns": "" }), 0],
  addNodeView: () => ReactNodeViewRenderer(ColumnsView),
});
export const AgColumn = Node.create({
  name: "agColumn", content: "block+", isolating: true,
  parseHTML: () => [{ tag: "div[data-ag-column]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-column": "", class: "ag-column" }), 0],
});

// --------------------------------------------------------------------------- canvas
function canvasItems(doc: Y.Doc, canvasId: string): Y.Map<AgLayoutItem> | undefined {
  return doc.getMap<Y.Map<AgLayoutItem>>("canvases").get(canvasId);
}

function useCanvas(doc: Y.Doc, canvasId: string) {
  const [items, setItems] = useState<AgLayoutItem[]>(() => Array.from(canvasItems(doc, canvasId)?.values() ?? []));
  useEffect(() => {
    const root = doc.getMap<Y.Map<AgLayoutItem>>("canvases");
    const read = () => setItems(Array.from(canvasItems(doc, canvasId)?.values() ?? []));
    read();
    root.observeDeep(read);
    return () => root.unobserveDeep(read);
  }, [doc, canvasId]);
  return items;
}

function writeCanvas(doc: Y.Doc, canvasId: string, next: AgLayoutItem[]) {
  doc.transact(() => {
    const root = doc.getMap<Y.Map<AgLayoutItem>>("canvases");
    let m = root.get(canvasId);
    if (!m) { m = new Y.Map<AgLayoutItem>(); root.set(canvasId, m); }
    const keep = new Set(next.map((i) => i.id));
    for (const k of Array.from(m.keys())) if (!keep.has(k)) m.delete(k);
    for (const it of next) {
      const prev = m.get(it.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(it)) m.set(it.id, it);
    }
  }, CANVAS_ORIGIN);
}

function CanvasView(p: NodeViewProps) {
  const ctx = useDocCtx();
  const ag = useAgMaybe();
  const [designing, setDesigning] = useState(false);
  const a = p.node.attrs;
  const fallbackDoc = useMemo(() => new Y.Doc(), []);
  const items = useCanvas(ctx?.doc ?? fallbackDoc, a.canvasId);
  if (!ctx || !ag) return <NodeViewWrapper />;
  const layout: AgLayout = { width: a.width, height: a.height, background: a.background || undefined, radius: 8, items };
  const editable = p.editor.isEditable;
  const createRegion = async () => {
    const res = await ag.request<{ regionId: string }>({ op: "region.create", noteId: ctx.noteId, inline: false, acl: { view: "inherit", edit: "inherit" } });
    return res.regionId;
  };
  const renderRegion = (regionId: string) => {
    const r = ag.state.regions.get(regionId);
    const note = r ? ag.state.notes.get(r.noteId) : undefined;
    return r && note ? <AgEditor docName={regionDocName(regionId, note.docEpoch)} noteId={note.id} nested /> : null;
  };
  const look = nodeLook(a);
  return (
    <Shell selected={p.selected} editable={editable} label="canvas" frame={designing ? undefined : { look, onLook: lookUpdater(p) }} tools={<>
      <ToolButton title={designing ? "Done arranging" : "Arrange"} onClick={() => setDesigning(!designing)}>{designing ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <LayoutGrid className="h-3.5 w-3.5" />}</ToolButton>
      <ConfigPopover look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "canvas" }} />
      <ToolButton title="Remove canvas" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
    </>}>
      <div contentEditable={false} className={`w-full ${designing && editable ? "pt-6" : ""}`} data-testid="ag-canvas">
        {designing && editable ? (
          <LayoutEditor
            layout={layout}
            liveDrag
            onUndo={ctx.undo}
            onRedo={ctx.redo}
            allowRichText
            createRegion={createRegion}
            opts={{ noteId: ctx.noteId, renderRegion }}
            onChange={(next) => {
              writeCanvas(ctx.doc, a.canvasId, next.items);
              if (next.width !== a.width || next.height !== a.height || (next.background ?? "") !== (a.background ?? "")) p.updateAttributes({ width: next.width, height: next.height, background: next.background ?? "" });
            }}
          />
        ) : (
          <div onDoubleClick={() => editable && setDesigning(true)}>
            <LayoutView layout={layout} opts={{ noteId: ctx.noteId, renderRegion }} maxScale={look.width ? 8 : 1.5} />
          </div>
        )}
      </div>
    </Shell>
  );
}

export const AgCanvas = Node.create({
  name: "agCanvas", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ canvasId: { default: "" }, width: { default: 600 }, height: { default: 260 }, background: { default: "" }, look: { default: {} } }),
  parseHTML: () => [{ tag: "div[data-ag-canvas]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-canvas": "" })],
  addNodeView: () => ReactNodeViewRenderer(CanvasView, { stopEvent: stopInside, ignoreMutation: () => true }),
});

// --------------------------------------------------------------------------- buttons, charts, links, components
function ButtonView(p: NodeViewProps) {
  const ctx = useDocCtx();
  if (!ctx) return <NodeViewWrapper as="span" />;
  const a = p.node.attrs;
  const look = nodeLook(a);
  return (
    <Shell inline selected={p.selected} editable={p.editor.isEditable} tools={<span contentEditable={false}><ConfigPopover look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "button" }}>
      <Row label="Does"><ActionPicker noteId={ctx.noteId} value={a.actionId} onChange={(actionId) => p.updateAttributes({ actionId })} /></Row>
      <Row label="Text"><input value={a.label ?? ""} placeholder="(action name)" onChange={(e) => p.updateAttributes({ label: e.target.value })} className="h-7 w-full bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" /></Row>
    </ConfigPopover></span>}>
      <span contentEditable={false} className="inline-block align-middle my-0.5">{a.actionId ? <ActionButton actionId={a.actionId} label={a.label || undefined} look={look} /> : <span className="text-xs text-stone-500 px-1">[button — pick an action ⚙]</span>}</span>
    </Shell>
  );
}

export const AgButton = Node.create({
  name: "agButton", group: "inline", inline: true, atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ actionId: { default: "" }, label: { default: "" }, look: { default: {} } }),
  parseHTML: () => [{ tag: "span[data-ag-button]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-ag-button": "" })],
  addNodeView: () => ReactNodeViewRenderer(ButtonView, { stopEvent: stopInside, as: "span" }),
});

function ChartView(p: NodeViewProps) {
  const ctx = useDocCtx();
  if (!ctx) return <NodeViewWrapper />;
  const a = p.node.attrs;
  const refs: string[] = Array.isArray(a.refs) ? a.refs : [];
  const look = nodeLook(a);
  const height = look.height ?? a.height ?? 220;
  return (
    <Shell selected={p.selected} editable={p.editor.isEditable} label="chart" frame={{ look, onLook: lookUpdater(p), height: { value: height, min: 80, max: 900 } }} tools={<>
      <ConfigPopover look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "chart" }}>
        <Row label="Type"><select value={a.chart} onChange={(e) => p.updateAttributes({ chart: e.target.value })} className="h-7 w-full bg-stone-900 border border-stone-700 rounded text-xs px-1"><option value="radar">Radar</option><option value="bar">Bars</option><option value="line">Line</option><option value="pie">Pie</option></select></Row>
        <RefList noteId={ctx.noteId} refs={refs} onChange={(r) => p.updateAttributes({ refs: r })} />
        <Row label="Scale max"><RefPicker noteId={ctx.noteId} value={a.maxRef} placeholder="(auto)" onChange={(maxRef) => p.updateAttributes({ maxRef })} /></Row>
      </ConfigPopover>
      <ToolButton title="Remove" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
    </>}>
      {(live) => <div contentEditable={false}><ChartWidget noteId={ctx.noteId} chart={a.chart} refs={refs} maxRef={a.maxRef || undefined} height={live?.height ?? height} look={look} /></div>}
    </Shell>
  );
}

export const AgChart = Node.create({
  name: "agChart", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ chart: { default: "radar" }, refs: { default: [] }, maxRef: { default: "" }, height: { default: 220 }, look: { default: {} } }),
  parseHTML: () => [{ tag: "div[data-ag-chart]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-chart": "" })],
  addNodeView: () => ReactNodeViewRenderer(ChartView, { stopEvent: stopInside }),
});

function LinksView(p: NodeViewProps) {
  const ctx = useDocCtx();
  const ag = useAgMaybe();
  if (!ctx || !ag) return <NodeViewWrapper />;
  const a = p.node.attrs;
  const cols: string[] = Array.isArray(a.columns) ? a.columns : [];
  const labels = new Set<string>();
  for (const l of Array.from(ag.state.links.values())) { if (l.fromNoteId === ctx.noteId) labels.add(l.label); if (l.toNoteId === ctx.noteId) labels.add(l.reverseLabel); }
  const look = nodeLook(a);
  return (
    <Shell selected={p.selected} editable={p.editor.isEditable} label="connections" frame={{ look, onLook: lookUpdater(p), height: { value: look.height ?? 0, min: 60, max: 1200 } }} tools={<>
      <ConfigPopover look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "links" }}>
        <Row label="Connection">
          <input list="ag-link-labels" value={a.label} placeholder="e.g. items" onChange={(e) => p.updateAttributes({ label: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} className="h-7 w-full bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" />
          <datalist id="ag-link-labels">{[...Array.from(labels)].map((l) => <option key={l} value={l} />)}</datalist>
        </Row>
        <Row label="Columns"><input value={cols.join(", ")} placeholder="weight, qty" onChange={(e) => p.updateAttributes({ columns: e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) })} className="h-7 w-full bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" /></Row>
      </ConfigPopover>
      <ToolButton title="Remove" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
    </>}>
      {(live) => <div contentEditable={false}><LinksTable noteId={ctx.noteId} label={a.label} columns={cols} look={live?.height ? { ...look, height: live.height } : look} /></div>}
    </Shell>
  );
}

export const AgLinks = Node.create({
  name: "agLinks", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ label: { default: "" }, columns: { default: [] }, look: { default: {} } }),
  parseHTML: () => [{ tag: "div[data-ag-links]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-links": "" })],
  addNodeView: () => ReactNodeViewRenderer(LinksView, { stopEvent: stopInside }),
});

function NoteLinkView(p: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className={p.selected ? "ring-1 ring-amber-400 rounded-full" : ""}>
      <span contentEditable={false}><NoteChip noteId={p.node.attrs.noteId} /></span>
    </NodeViewWrapper>
  );
}

export const AgNoteLink = Node.create({
  name: "agNoteLink", group: "inline", inline: true, atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ noteId: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-ag-note]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-ag-note": "" })],
  addNodeView: () => ReactNodeViewRenderer(NoteLinkView, { stopEvent: stopInside, as: "span" }),
});

function ComponentNodeView(p: NodeViewProps) {
  const ctx = useDocCtx();
  const ag = useAgMaybe();
  if (!ctx || !ag) return <NodeViewWrapper />;
  const a = p.node.attrs;
  const comp = ag.state.components.get(a.componentId);
  const bindings: Record<string, string> = a.bindings && typeof a.bindings === "object" ? a.bindings : {};
  const look = nodeLook(a);
  return (
    <Shell selected={p.selected} editable={p.editor.isEditable} label={comp?.name ?? "component"} frame={{ look, onLook: lookUpdater(p) }} tools={<>
      <ConfigPopover look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "component" }}>
        <Row label="Component">
          <select value={a.componentId} onChange={(e) => p.updateAttributes({ componentId: e.target.value, bindings: {} })} className="h-7 w-full bg-stone-900 border border-stone-700 rounded text-xs px-1">
            <option value="">Choose…</option>
            {[...Array.from(ag.state.components.values())].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Row>
        {(comp?.params ?? []).map((param) => (
          <Row key={param} label={`$${param}`}><RefPicker noteId={ctx.noteId} value={bindings[param]} placeholder={`(this sheet's ${param})`} onChange={(ref) => p.updateAttributes({ bindings: { ...bindings, [param]: ref } })} /></Row>
        ))}
        {!ag.state.components.size && <div className="text-xs text-stone-500">Make components in the Components tab first.</div>}
      </ConfigPopover>
      <ToolButton title="Remove" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
    </>}>
      <div contentEditable={false}>{comp ? <ComponentView componentId={comp.id} noteId={ctx.noteId} bindings={bindings} maxScale={look.width ? 8 : 1.5} /> : <span className="text-xs text-stone-500">Choose a component (⚙)</span>}</div>
    </Shell>
  );
}

export const AgComponent = Node.create({
  name: "agComponent", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ componentId: { default: "" }, bindings: { default: {} }, look: { default: {} } }),
  parseHTML: () => [{ tag: "div[data-ag-component]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-component": "" })],
  addNodeView: () => ReactNodeViewRenderer(ComponentNodeView, { stopEvent: stopInside }),
});

export const AG_NODES = [AgField, AgFieldBlock, AgRegion, AgSecret, AgColumns, AgColumn, AgCanvas, AgButton, AgChart, AgLinks, AgNoteLink, AgComponent];

