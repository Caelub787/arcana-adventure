// Custom document nodes for Agnostic sheets. Every node is a *reference*:
// values live in the data layer, restricted text lives in its own region doc.
// The document only says where things go.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import * as Y from "yjs";
import { Settings2, GripVertical, Trash2, Lock, EyeOff, LayoutGrid, Check, Plus, Minus, ArrowUp, ArrowDown } from "lucide-react";
import { Fragment } from "@tiptap/pm/model";
import type { AgLayout, AgLayoutItem, AgLook } from "@shared/agnostic/types";
import { regionDocName } from "@shared/agnostic/types";
import { describeAudience } from "@shared/agnostic/acl";
import { useAg, useAgMaybe, useMemberName } from "../hooks";
import { FieldDisplay, ActionButton, ChartWidget, LinksTable, NoteChip, ComponentView, LayoutView } from "../widgets";
import { LayoutEditor, RefList } from "../LayoutEditor";
import { RefPicker, AclEditor, ComponentPicker } from "../pickers";
import { AgPanel, agConfirm } from "../float";
import { AgIcon, IconGrid } from "../icons";
import { LinksConfigEditor } from "../links";
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
  if (inline) return <NodeViewWrapper as="span" className={`ag-inline ${selected ? "ring-1 ring-amber-400 rounded" : ""} ${className}`}>{body}{editable && <span className={`ag-inline-tools ${selected ? "" : "ag-touch-only"}`}>{tools}</span>}</NodeViewWrapper>;
  return (
    <NodeViewWrapper className={`ag-node-wrap group relative my-1.5 ${className}`}>
      {editable && (
        <div className={`ag-node-tools absolute -left-1 -top-2.5 z-10 flex items-center gap-0.5 rounded bg-stone-900/95 border border-stone-700 px-0.5 shadow ${selected ? "opacity-100" : "opacity-0"} transition-opacity`} contentEditable={false}>
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

function ConfigPopover({ children, defaultOpen, look, title = "Settings" }: {
  children?: React.ReactNode; defaultOpen?: boolean;
  /** Adds a "Look" tab: size, colours, text, style. */
  look?: { value: AgLook; onChange: (l: AgLook) => void; kind: LookKind };
  title?: string;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [tab, setTab] = useState<"data" | "look">(children ? "data" : "look");
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)} className={`h-6 w-6 grid place-items-center rounded hover:bg-stone-800 ${open ? "text-amber-300" : "text-stone-300"}`} title="Settings & look" data-testid="ag-node-config"><Settings2 className="h-3.5 w-3.5" /></button>
      {open && (
        <AgPanel title={title} onClose={() => setOpen(false)} width={360} height={560} padded={false} testId="ag-node-panel">
          {look && children && (
            <div className="flex gap-1 sticky top-0 px-3 pt-3 pb-2 bg-stone-900 z-10 border-b border-stone-800">
              <button type="button" onClick={() => setTab("data")} className={`h-8 px-3 rounded text-xs ${tab === "data" ? "bg-amber-600 text-white" : "bg-stone-800 text-stone-300"}`}>Settings</button>
              <button type="button" onClick={() => setTab("look")} className={`h-8 px-3 rounded text-xs ${tab === "look" ? "bg-amber-600 text-white" : "bg-stone-800 text-stone-300"}`} data-testid="ag-node-look-tab">Look & size</button>
            </div>
          )}
          <div className="p-3 space-y-2">
            {tab === "data" && children}
            {tab === "look" && look && <LookEditor look={look.value} onChange={look.onChange} kind={look.kind} />}
          </div>
        </AgPanel>
      )}
    </>
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
    <Shell inline selected={p.selected} editable={p.editor.isEditable} tools={<span contentEditable={false}><ConfigPopover title="Value in the text" look={{ value: a.look ?? {}, onChange: (l) => p.updateAttributes({ look: l }), kind: "inlineValue" }}><FieldConfig attrs={a} update={p.updateAttributes} noteId={ctx.noteId} block={false} /></ConfigPopover></span>}>
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
      tools={<><ConfigPopover title={a.display === "bar" ? "Resource bar" : "Value block"} look={{ value: look, onChange: (l) => p.updateAttributes({ look: l, color: "" }), kind: lookKindFor(a.display, false) }}><FieldConfig attrs={a} update={p.updateAttributes} noteId={ctx.noteId} block /></ConfigPopover><ToolButton title="Remove" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton></>}
    >
      {(live) => <div contentEditable={false} className="py-0.5">{a.ref ? <FieldDisplay blockTip noteId={ctx.noteId} refPath={a.ref} maxRef={a.maxRef || undefined} display={a.display} label={a.label || undefined} showLabel={a.showLabel !== false} look={live?.height ? { ...look, height: live.height } : look} /> : <span className="text-xs text-stone-500">Choose a value (⚙)</span>}</div>}
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
      <ConfigPopover title={region.label || "Hidden section"} look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "section" }}>
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
  const [aclOpen, setAclOpen] = useState(false);
  const regionId = p.node.attrs.regionId as string;
  const { region, note, gmView } = useRegion(regionId);
  if (!region || !note) return <NodeViewWrapper as="span" />;
  return (
    <NodeViewWrapper as="span" className={`ag-secret inline-block align-baseline ${gmView ? "rounded border border-dashed border-violet-600/80 bg-violet-950/30 px-0.5" : ""} ${p.selected ? "ring-1 ring-amber-400" : ""}`} data-testid={`ag-secret-${regionId}`}>
      {gmView && p.editor.isEditable && (
        <span contentEditable={false} className="inline-flex align-middle mr-0.5">
          <button type="button" onClick={() => setAclOpen(!aclOpen)} className="text-violet-300" title="Who can see these words" data-testid="ag-secret-lock"><Lock className="h-3 w-3" /></button>
          {aclOpen && (
            <AgPanel title="Secret words" onClose={() => setAclOpen(false)} width={340} height={260} testId="ag-secret-panel">
              <div className="text-xs text-stone-300">Who can see / edit these words</div>
              <RegionAcl regionId={regionId} />
              <button type="button" onClick={() => { setAclOpen(false); p.deleteNode(); }} className="h-8 px-2.5 rounded text-xs text-red-300 hover:bg-red-950">Remove the secret words</button>
            </AgPanel>
          )}
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
    const end = pos + p.node.nodeSize - 1;
    const go = () => p.editor.chain().deleteRange({ from: end - last.nodeSize, to: end }).run();
    if (!last.textContent.trim()) go();
    else agConfirm("What's written in it goes too (Ctrl+Z brings it back).", { title: "Remove the last column?", confirm: "Remove" }).then((ok) => { if (ok) go(); });
  };
  return (
    <NodeViewWrapper className="ag-columns-wrap ag-node-wrap group relative my-1.5">
      {editable && (
        <div contentEditable={false} className="ag-node-tools absolute -left-1 -top-2.5 z-10 flex items-center gap-0.5 rounded bg-stone-900/95 border border-stone-700 px-0.5 opacity-0 transition-opacity">
          <span data-drag-handle draggable className="h-6 w-5 grid place-items-center cursor-grab text-stone-400"><GripVertical className="h-3.5 w-3.5" /></span>
          <span className="text-[10px] text-stone-400 px-0.5">{n} columns</span>
          <ToolButton title="One column fewer" onClick={removeColumn}><Minus className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton title="One more column" onClick={addColumn}><Plus className="h-3.5 w-3.5" /></ToolButton>
          <ConfigPopover title="Columns" look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "columns" }} />
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
      <ConfigPopover title="Canvas" look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "canvas" }} />
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
    <Shell inline selected={p.selected} editable={p.editor.isEditable} tools={<span contentEditable={false}><ConfigPopover title="Button" look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "button" }}>
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
      <ConfigPopover title="Chart" look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "chart" }}>
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
  const cols = Array.isArray(a.columns) ? a.columns : [];
  const config = a.config && typeof a.config === "object" ? a.config : {};
  const look = nodeLook(a);
  return (
    <Shell selected={p.selected} editable={p.editor.isEditable} label="connections" frame={{ look, onLook: lookUpdater(p), height: { value: look.height ?? 0, min: 60, max: 1200 } }} tools={<>
      <ConfigPopover title={config.layout === "cards" ? "Inventory / item cards" : "Connections table"} look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "links" }}>
        <LinksConfigEditor noteId={ctx.noteId} value={{ label: a.label, columns: cols, config }} onChange={(v) => p.updateAttributes({ label: v.label, columns: v.columns, config: v.config ?? {} })} />
      </ConfigPopover>
      <ToolButton title="Remove" danger onClick={p.deleteNode}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
    </>}>
      {(live) => <div contentEditable={false}><LinksTable noteId={ctx.noteId} label={a.label} columns={cols} config={config} look={live?.height ? { ...look, height: live.height } : look} /></div>}
    </Shell>
  );
}

export const AgLinks = Node.create({
  name: "agLinks", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ label: { default: "" }, columns: { default: [] }, config: { default: {} }, look: { default: {} } }),
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
      <ConfigPopover title={comp ? `Component — ${comp.name}` : "Component"} look={{ value: look, onChange: (l) => p.updateAttributes({ look: l }), kind: "component" }}>
        <Row label="Component">
          <ComponentPicker value={a.componentId} onChange={(componentId) => p.updateAttributes({ componentId, bindings: {} })} />
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

// --------------------------------------------------------------------------- icons (inline)
function IconView(p: NodeViewProps) {
  const a = p.node.attrs;
  const [open, setOpen] = useState(false);
  const editable = p.editor.isEditable;
  return (
    <NodeViewWrapper as="span" className={`inline-flex align-middle ${p.selected ? "ring-1 ring-amber-400 rounded" : ""}`}>
      <span contentEditable={false} className={`inline-flex ${editable ? "cursor-pointer" : ""}`} onClick={() => editable && setOpen(true)} title={editable ? "Click to change the icon" : undefined}>
        <AgIcon name={a.name} size={a.size || 16} color={a.color || "#d4a24c"} />
      </span>
      {open && (
        <AgPanel title="Icon" onClose={() => setOpen(false)} width={340} height={480}>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-stone-400">Colour</span><input type="color" value={a.color || "#d4a24c"} onChange={(e) => p.updateAttributes({ color: e.target.value })} className="h-7 w-9 bg-transparent" />
            <span className="text-stone-400">Size</span><input type="range" min={10} max={64} value={a.size || 16} onChange={(e) => p.updateAttributes({ size: Number(e.target.value) })} className="flex-1 accent-amber-500" />
            <button type="button" onClick={() => { setOpen(false); p.deleteNode(); }} className="h-7 px-2 rounded text-red-300 hover:bg-red-950">Remove</button>
          </div>
          <IconGrid value={a.name} onPick={(name) => p.updateAttributes({ name })} />
        </AgPanel>
      )}
    </NodeViewWrapper>
  );
}

export const AgIconNode = Node.create({
  name: "agIcon", group: "inline", inline: true, atom: true, selectable: true, draggable: true,
  addAttributes: () => ({ name: { default: "Star" }, color: { default: "" }, size: { default: 16 } }),
  parseHTML: () => [{ tag: "span[data-ag-icon]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-ag-icon": "" })],
  addNodeView: () => ReactNodeViewRenderer(IconView, { stopEvent: () => true, as: "span" }),
});

// --------------------------------------------------------------------------- tabs
// A row of tabs, each holding its own part of the page. Which tab is open is
// each viewer's own (remembered on this device); the content is shared.
const activeTabs = new Map<string, number>();
const tabListeners = new Set<() => void>();
const tabKey = (noteId: string, tabsId: string) => `ag-tab:${noteId}:${tabsId}`;
function getActiveTab(noteId: string, tabsId: string): number {
  const k = tabKey(noteId, tabsId);
  if (!activeTabs.has(k)) { let v = 0; try { v = Number(localStorage.getItem(k) ?? 0) || 0; } catch { /* storage blocked */ } activeTabs.set(k, v); }
  return activeTabs.get(k)!;
}
function setActiveTab(noteId: string, tabsId: string, i: number) {
  const k = tabKey(noteId, tabsId);
  activeTabs.set(k, i);
  try { localStorage.setItem(k, String(i)); } catch { /* storage blocked */ }
  tabListeners.forEach((l) => l());
}
function useActiveTab(noteId: string, tabsId: string) {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); tabListeners.add(l); return () => { tabListeners.delete(l); }; }, []);
  return getActiveTab(noteId, tabsId);
}

function TabsView(p: NodeViewProps) {
  const ctx = useDocCtx();
  const a = p.node.attrs;
  const tabsId: string = a.tabsId || "t";
  const noteId = ctx?.noteId ?? "";
  const active = Math.min(useActiveTab(noteId, tabsId), Math.max(0, p.node.childCount - 1));
  const editable = p.editor.isEditable;
  const look = nodeLook(a);
  const [editing, setEditing] = useState(false);
  const tabs = Array.from({ length: p.node.childCount }, (_, i) => p.node.child(i));
  const accent = look.color ?? "#d4a24c";
  return (
    <NodeViewWrapper className="ag-node-wrap group relative my-2 ag-tabs" data-testid="ag-tabs">
      {editable && (
        <div contentEditable={false} className="ag-node-tools absolute -left-1 -top-2.5 z-10 flex items-center gap-0.5 rounded bg-stone-900/95 border border-stone-700 px-0.5 opacity-0 transition-opacity">
          <span data-drag-handle draggable className="h-6 w-5 grid place-items-center cursor-grab text-stone-400"><GripVertical className="h-3.5 w-3.5" /></span>
          <span className="text-[10px] text-stone-400 px-0.5">tabs</span>
          <ToolButton title="Edit tabs (names, icons, order)" onClick={() => setEditing(true)}><Settings2 className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton title="Remove the tabs (and everything in them)" danger onClick={() => agConfirm("Everything inside every tab goes too (Ctrl+Z brings it back).", { title: "Remove these tabs?", confirm: "Remove" }).then((ok) => ok && p.deleteNode())}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
        </div>
      )}
      <div contentEditable={false} className="flex gap-1 p-1.5 rounded-xl border overflow-x-auto no-scrollbar" style={{ borderColor: look.outline ?? `color-mix(in srgb, ${accent} 35%, transparent)`, background: look.bg ?? "rgba(12,10,9,0.8)" }} data-testid="ag-tab-strip">
        {tabs.map((t, i) => (
          <button key={i} type="button" onClick={() => setActiveTab(noteId, tabsId, i)}
            className={`flex-1 min-w-[64px] flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-1.5 text-[11px] sm:text-xs font-medium transition-colors ${i === active ? "text-stone-100" : "border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"}`}
            style={i === active ? { borderColor: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: look.textColor } : undefined}
            data-testid={`ag-tab-button-${t.attrs.title}`}>
            {t.attrs.icon ? <AgIcon name={t.attrs.icon} size={16} color={t.attrs.color || (i === active ? accent : undefined)} /> : null}
            <span className="truncate max-w-full">{t.attrs.title || `Tab ${i + 1}`}</span>
          </button>
        ))}
      </div>
      <NodeViewContent className="ag-tabs-body pt-2" />
      {editing && <TabsEditor p={p} onClose={() => setEditing(false)} />}
    </NodeViewWrapper>
  );
}

function TabsEditor({ p, onClose }: { p: NodeViewProps; onClose: () => void }) {
  const tabs = Array.from({ length: p.node.childCount }, (_, i) => p.node.child(i));
  const [iconFor, setIconFor] = useState<number | null>(null);
  const childPos = (i: number) => { let pos = (p.getPos() as number) + 1; for (let k = 0; k < i; k++) pos += p.node.child(k).nodeSize; return pos; };
  const setTab = (i: number, attrs: Record<string, any>) => p.editor.view.dispatch(p.editor.state.tr.setNodeMarkup(childPos(i), undefined, { ...p.node.child(i).attrs, ...attrs }));
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= tabs.length) return;
    const list = [...tabs];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const start = (p.getPos() as number) + 1;
    p.editor.view.dispatch(p.editor.state.tr.replaceWith(start, start + p.node.content.size, Fragment.from(list)));
  };
  const add = () => {
    const end = (p.getPos() as number) + p.node.nodeSize - 1;
    p.editor.chain().insertContentAt(end, { type: "agTab", attrs: { title: `Tab ${tabs.length + 1}` }, content: [{ type: "paragraph" }] }).run();
  };
  const remove = (i: number) => {
    if (tabs.length <= 1) return;
    const go = () => { const from = childPos(i); p.editor.view.dispatch(p.editor.state.tr.delete(from, from + p.node.child(i).nodeSize)); };
    if (!tabs[i].textContent.trim() && tabs[i].childCount <= 1) go();
    else agConfirm(`Everything in “${tabs[i].attrs.title}” goes too (Ctrl+Z brings it back).`, { title: "Remove this tab?", confirm: "Remove" }).then((ok) => ok && go());
  };
  const look = nodeLook(p.node.attrs);
  return (
    <AgPanel title="Tabs" onClose={onClose} width={380} height={560} testId="ag-tabs-editor">
      <div className="space-y-1.5">
        {tabs.map((t, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-lg bg-stone-800 border border-stone-700 p-1.5">
            <button type="button" onClick={() => setIconFor(i)} className="h-8 w-8 grid place-items-center rounded border border-stone-700 bg-stone-900 shrink-0" title="Icon">{t.attrs.icon ? <AgIcon name={t.attrs.icon} size={16} color="#d4a24c" /> : <span className="text-[10px] text-stone-500">icon</span>}</button>
            <input defaultValue={t.attrs.title} onBlur={(e) => e.target.value !== t.attrs.title && setTab(i, { title: e.target.value || `Tab ${i + 1}` })} className="h-8 flex-1 min-w-0 bg-stone-900 border border-stone-700 rounded px-2 text-sm" data-testid={`ag-tab-title-${i}`} />
            <ToolButton title="Move left" onClick={() => reorder(i, i - 1)}><ArrowUp className="h-3.5 w-3.5" /></ToolButton>
            <ToolButton title="Move right" onClick={() => reorder(i, i + 1)}><ArrowDown className="h-3.5 w-3.5" /></ToolButton>
            <ToolButton title="Remove tab" danger onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></ToolButton>
          </div>
        ))}
        <button type="button" onClick={add} className="h-9 w-full rounded-lg border border-dashed border-stone-700 text-xs text-stone-300 hover:border-amber-600 inline-flex items-center justify-center gap-1" data-testid="ag-tab-add"><Plus className="h-3.5 w-3.5" /> Add a tab</button>
      </div>
      <div className="border-t border-stone-800 pt-2">
        <div className="text-[10px] uppercase tracking-wide text-amber-400/80 mb-1">Look</div>
        <LookEditor look={look} onChange={(l) => p.updateAttributes({ look: l })} kind="tabs" />
      </div>
      {iconFor !== null && (
        <AgPanel title={`Icon for “${tabs[iconFor]?.attrs.title ?? ""}”`} onClose={() => setIconFor(null)} width={340} height={420}>
          <button type="button" onClick={() => { setTab(iconFor, { icon: "" }); setIconFor(null); }} className="h-8 px-2 rounded text-xs text-stone-300 hover:bg-stone-800">No icon</button>
          <IconGrid value={tabs[iconFor]?.attrs.icon} onPick={(name) => { setTab(iconFor, { icon: name }); setIconFor(null); }} />
        </AgPanel>
      )}
    </AgPanel>
  );
}

function TabView(p: NodeViewProps) {
  const ctx = useDocCtx();
  const pos = typeof p.getPos === "function" ? p.getPos() : undefined;
  let index = 0, tabsId = "t";
  if (typeof pos === "number") {
    const $pos = p.editor.state.doc.resolve(pos);
    index = $pos.index();
    tabsId = $pos.parent.attrs.tabsId || "t";
  }
  const active = useActiveTab(ctx?.noteId ?? "", tabsId);
  const shown = Math.min(active, Math.max(0, ((typeof pos === "number" ? p.editor.state.doc.resolve(pos).parent.childCount : 1)) - 1)) === index;
  return (
    <NodeViewWrapper data-ag-tab="" style={shown ? undefined : { display: "none" }}>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const AgTabs = Node.create({
  name: "agTabs", group: "block", content: "agTab+", draggable: true, isolating: true,
  addAttributes: () => ({ tabsId: { default: "" }, look: { default: {} } }),
  parseHTML: () => [{ tag: "div[data-ag-tabs]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-tabs": "" }), 0],
  addNodeView: () => ReactNodeViewRenderer(TabsView),
});
export const AgTab = Node.create({
  name: "agTab", content: "block+", isolating: true, defining: true,
  addAttributes: () => ({ title: { default: "Tab" }, icon: { default: "" }, color: { default: "" } }),
  parseHTML: () => [{ tag: "div[data-ag-tab]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-ag-tab": "" }), 0],
  addNodeView: () => ReactNodeViewRenderer(TabView),
});

export const AG_NODES = [AgTabs, AgTab, AgIconNode, AgField, AgFieldBlock, AgRegion, AgSecret, AgColumns, AgColumn, AgCanvas, AgButton, AgChart, AgLinks, AgNoteLink, AgComponent];

