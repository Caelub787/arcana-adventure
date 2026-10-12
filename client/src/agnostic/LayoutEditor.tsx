// Free-form layout editor — drag, resize, configure. Used for canvas blocks on
// sheets, tracker card designs and reusable components. Pointer events, so it
// works the same with a mouse or a finger; the design is scaled to fit the
// screen and every coordinate is converted back to design pixels.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, Copy, ArrowUp, ArrowDown, Type, Image as ImageIcon, User, Hash, BarChart3, Square, Link2, Dices, Puzzle, SlidersHorizontal, Gauge, X, AlignLeft, FileText,
} from "lucide-react";
import type { AgAudience, AgLayout, AgLayoutItem, AgWidget } from "@shared/agnostic/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAg } from "./hooks";
import { WidgetView, type LayoutRenderOpts } from "./widgets";
import { AudienceSelect, ColorInput, RefPicker } from "./pickers";
import { ActionPicker } from "./ActionEditor";

const SNAP = 4;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const uid = () => Math.random().toString(36).slice(2, 10);

interface PaletteEntry { label: string; icon: React.ReactNode; make: () => AgWidget; w: number; h: number }

export function widgetPalette(opts: { allowRichText?: boolean; allowLastRoll?: boolean }): PaletteEntry[] {
  const p: PaletteEntry[] = [
    { label: "Value", icon: <Hash className="h-4 w-4" />, make: () => ({ kind: "field", ref: "", display: "value", showLabel: true }), w: 120, h: 24 },
    { label: "Editable value", icon: <SlidersHorizontal className="h-4 w-4" />, make: () => ({ kind: "field", ref: "", display: "input", showLabel: true }), w: 150, h: 28 },
    { label: "Resource bar", icon: <Gauge className="h-4 w-4" />, make: () => ({ kind: "field", ref: "", maxRef: "", display: "bar", color: "#16a34a" }), w: 140, h: 14 },
    { label: "Pips", icon: <Gauge className="h-4 w-4" />, make: () => ({ kind: "field", ref: "", maxRef: "", display: "pips", color: "#f59e0b" }), w: 120, h: 20 },
    { label: "Dial", icon: <Gauge className="h-4 w-4" />, make: () => ({ kind: "field", ref: "", maxRef: "", display: "dial", color: "#38bdf8" }), w: 60, h: 72 },
    { label: "Badge", icon: <Hash className="h-4 w-4" />, make: () => ({ kind: "field", ref: "", display: "badge", showLabel: true }), w: 90, h: 24 },
    { label: "Label", icon: <Type className="h-4 w-4" />, make: () => ({ kind: "text", text: "Label", fontSize: 13 }), w: 100, h: 20 },
    { label: "Portrait", icon: <User className="h-4 w-4" />, make: () => ({ kind: "portrait", radius: 8 }), w: 56, h: 56 },
    { label: "Name", icon: <Type className="h-4 w-4" />, make: () => ({ kind: "name", fontSize: 14 }), w: 120, h: 20 },
    { label: "Image", icon: <ImageIcon className="h-4 w-4" />, make: () => ({ kind: "image", src: null, fit: "cover" }), w: 80, h: 80 },
    { label: "Button", icon: <Dices className="h-4 w-4" />, make: () => ({ kind: "button", actionId: "" }), w: 110, h: 30 },
    { label: "Chart", icon: <BarChart3 className="h-4 w-4" />, make: () => ({ kind: "chart", chart: "radar", refs: [] }), w: 200, h: 160 },
    { label: "Connections table", icon: <Link2 className="h-4 w-4" />, make: () => ({ kind: "links", label: "", columns: [] }), w: 260, h: 120 },
    { label: "Shape", icon: <Square className="h-4 w-4" />, make: () => ({ kind: "shape", shape: "rect", color: "rgba(120,53,15,0.5)", radius: 6 }), w: 80, h: 40 },
    { label: "Component", icon: <Puzzle className="h-4 w-4" />, make: () => ({ kind: "component", componentId: "", bindings: {} }), w: 160, h: 60 },
  ];
  if (opts.allowRichText) p.splice(6, 0, { label: "Text box", icon: <FileText className="h-4 w-4" />, make: () => ({ kind: "richtext", regionId: "" }), w: 200, h: 80 });
  if (opts.allowLastRoll) p.push({ label: "Last roll", icon: <Dices className="h-4 w-4" />, make: () => ({ kind: "lastRoll" }), w: 160, h: 14 });
  return p;
}

interface Props {
  layout: AgLayout;
  /** final=false during a drag (only used by storages that are cheap to write). */
  onChange: (next: AgLayout, final: boolean) => void;
  opts: LayoutRenderOpts;
  /** Parameter names (components) offered in ref pickers. */
  params?: string[];
  allowRichText?: boolean;
  allowLastRoll?: boolean;
  /** Create a rich-text region for a new "Text box" item; returns its id. */
  createRegion?: () => Promise<string>;
  maxWidth?: number;
  liveDrag?: boolean;
}

export function LayoutEditor({ layout, onChange, opts, params, allowRichText, allowLastRoll, createRegion, maxWidth, liveDrag }: Props) {
  const [local, setLocal] = useState<AgLayout>(layout);
  const [selected, setSelected] = useState<string | null>(null);
  const dragging = useRef<null | { id: string; mode: "move" | "resize"; edge: string; startX: number; startY: number; orig: AgLayoutItem; lastSent: number }>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Remote changes flow in unless we're mid-drag.
  useEffect(() => { if (!dragging.current) setLocal(layout); }, [layout]);

  useEffect(() => {
    const el = wrapRef.current?.parentElement;
    if (!el) return;
    const update = () => {
      const avail = Math.min(el.clientWidth, maxWidth ?? Infinity);
      setScale(avail > 0 ? Math.min(1.5, avail / local.width) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [local.width, maxWidth]);

  const commit = (next: AgLayout, final = true) => { setLocal(next); onChange(next, final); };
  const sel = local.items.find((i) => i.id === selected) ?? null;
  const updateItem = (id: string, patch: Partial<AgLayoutItem>) => commit({ ...local, items: local.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const updateWidget = (id: string, patch: Partial<AgWidget>) => commit({ ...local, items: local.items.map((i) => (i.id === id ? { ...i, widget: { ...i.widget, ...patch } as AgWidget } : i)) });

  const addItem = async (entry: PaletteEntry) => {
    let widget = entry.make();
    if (widget.kind === "richtext") {
      if (!createRegion) return;
      widget = { kind: "richtext", regionId: await createRegion() };
    }
    const z = Math.max(0, ...local.items.map((i) => i.z ?? 0)) + 1;
    const item: AgLayoutItem = { id: uid(), x: snap(Math.min(16, local.width - entry.w)), y: snap(Math.min(16, local.height - entry.h)), w: Math.min(entry.w, local.width), h: Math.min(entry.h, local.height), z, widget };
    commit({ ...local, items: [...local.items, item] });
    setSelected(item.id);
  };

  const onPointerDown = (e: React.PointerEvent, item: AgLayoutItem, mode: "move" | "resize", edge = "se") => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelected(item.id);
    dragging.current = { id: item.id, mode, edge, startX: e.clientX, startY: e.clientY, orig: { ...item }, lastSent: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale, dy = (e.clientY - d.startY) / scale;
    const o = d.orig;
    let next: Partial<AgLayoutItem>;
    if (d.mode === "move") {
      next = { x: snap(Math.max(0, Math.min(local.width - o.w, o.x + dx))), y: snap(Math.max(0, Math.min(local.height - o.h, o.y + dy))) };
    } else {
      let { x, y, w, h } = o;
      if (d.edge.includes("e")) w = Math.max(8, Math.min(local.width - x, o.w + dx));
      if (d.edge.includes("s")) h = Math.max(6, Math.min(local.height - y, o.h + dy));
      if (d.edge.includes("w")) { const nx = Math.max(0, Math.min(o.x + o.w - 8, o.x + dx)); w = o.w + (o.x - nx); x = nx; }
      if (d.edge.includes("n")) { const ny = Math.max(0, Math.min(o.y + o.h - 6, o.y + dy)); h = o.h + (o.y - ny); y = ny; }
      next = { x: snap(x), y: snap(y), w: snap(w) || SNAP, h: snap(h) || SNAP };
    }
    const updated = { ...local, items: local.items.map((i) => (i.id === d.id ? { ...i, ...next } : i)) };
    setLocal(updated);
    if (liveDrag && Date.now() - d.lastSent > 80) { d.lastSent = Date.now(); onChange(updated, false); }
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = null;
    onChange(local, true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!sel) return;
    const step = e.shiftKey ? 16 : SNAP;
    const move = (dx: number, dy: number) => { e.preventDefault(); updateItem(sel.id, { x: Math.max(0, sel.x + dx), y: Math.max(0, sel.y + dy) }); };
    if (e.key === "ArrowLeft") move(-step, 0);
    else if (e.key === "ArrowRight") move(step, 0);
    else if (e.key === "ArrowUp") move(0, -step);
    else if (e.key === "ArrowDown") move(0, step);
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); commit({ ...local, items: local.items.filter((i) => i.id !== sel.id) }); setSelected(null); }
    else if (e.key === "Escape") setSelected(null);
  };

  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handleStyle = (h: string): React.CSSProperties => {
    const s = 12 / scale;
    const pos: React.CSSProperties = { width: s, height: s, cursor: `${h}-resize` };
    if (h.includes("n")) pos.top = -s / 2; else if (h.includes("s")) pos.bottom = -s / 2; else pos.top = `calc(50% - ${s / 2}px)`;
    if (h.includes("w")) pos.left = -s / 2; else if (h.includes("e")) pos.right = -s / 2; else pos.left = `calc(50% - ${s / 2}px)`;
    return pos;
  };

  return (
    <div className="space-y-2" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <LayoutToolbar local={local} commit={commit} addItem={addItem} palette={widgetPalette({ allowRichText: allowRichText && !!createRegion, allowLastRoll })} sel={sel}
        onDuplicate={() => { if (!sel) return; const copy = { ...sel, id: uid(), x: sel.x + 8, y: sel.y + 8, widget: { ...sel.widget } as AgWidget }; commit({ ...local, items: [...local.items, copy] }); setSelected(copy.id); }}
        onDelete={() => { if (!sel) return; commit({ ...local, items: local.items.filter((i) => i.id !== sel.id) }); setSelected(null); }}
        onZ={(d) => { if (!sel) return; updateItem(sel.id, { z: (sel.z ?? 0) + d }); }} />
      <div ref={wrapRef} style={{ width: local.width * scale, height: local.height * scale }} className="touch-none">
        <div
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerDown={() => setSelected(null)}
          className="relative origin-top-left outline-none"
          style={{
            width: local.width, height: local.height, transform: `scale(${scale})`, background: local.background ?? "rgba(28,25,23,0.6)",
            border: `1px dashed ${local.border ?? "#57534e"}`, borderRadius: local.radius,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: `${SNAP * 4}px ${SNAP * 4}px`,
          }}
          data-testid="ag-layout-surface"
        >
          {[...local.items].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)).map((it) => (
            <div
              key={it.id}
              className={`absolute ${selected === it.id ? "ring-2 ring-amber-400" : "hover:ring-1 hover:ring-amber-400/50"}`}
              style={{ left: it.x, top: it.y, width: it.w, height: it.h, zIndex: (it.z ?? 0) + 1 }}
              onPointerDown={(e) => onPointerDown(e, it, "move")}
              data-testid={`ag-layout-item-${it.widget.kind}`}
            >
              {/* Widgets are inert while designing: a drag is never a button press. */}
              <div className="w-full h-full pointer-events-none select-none">
                <WidgetView widget={it.widget} opts={opts} w={it.w} h={it.h} />
              </div>
              {it.showTo && <span className="absolute -top-2 -right-2 text-[9px] bg-violet-700 text-white rounded px-1">limited</span>}
              {selected === it.id && handles.map((h) => (
                <div key={h} className="absolute bg-amber-400 border border-stone-900 rounded-sm" style={handleStyle(h)} onPointerDown={(e) => onPointerDown(e, it, "resize", h)} />
              ))}
            </div>
          ))}
          {local.items.length === 0 && <div className="absolute inset-0 grid place-items-center text-xs text-stone-500 pointer-events-none">Add something with “+ Add”</div>}
        </div>
      </div>
      {sel && <ItemInspector key={sel.id} item={sel} noteId={opts.noteId} params={params} onItem={(p) => updateItem(sel.id, p)} onWidget={(p) => updateWidget(sel.id, p)} onClose={() => setSelected(null)} />}
    </div>
  );
}

function LayoutToolbar({ local, commit, addItem, palette, sel, onDuplicate, onDelete, onZ }: {
  local: AgLayout; commit: (l: AgLayout) => void; addItem: (p: PaletteEntry) => void; palette: PaletteEntry[]; sel: AgLayoutItem | null;
  onDuplicate: () => void; onDelete: () => void; onZ: (d: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="h-8 px-2.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs inline-flex items-center gap-1" data-testid="ag-layout-add"><Plus className="h-3.5 w-3.5" /> Add</button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1.5 bg-stone-900 border-stone-700 grid grid-cols-2 gap-1" align="start">
          {palette.map((p) => (
            <button key={p.label} type="button" onClick={() => { setOpen(false); addItem(p); }} className="h-9 px-2 rounded hover:bg-stone-800 text-xs text-stone-200 inline-flex items-center gap-1.5 text-left" data-testid={`ag-layout-add-${p.label}`}>
              {p.icon}{p.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <label className="text-[11px] text-stone-400 inline-flex items-center gap-1">W
        <input type="number" value={local.width} min={40} max={2000} onChange={(e) => commit({ ...local, width: Math.max(40, Math.min(2000, Number(e.target.value) || 40)) })} className="h-7 w-16 bg-stone-900 border border-stone-700 rounded px-1 text-stone-100" />
      </label>
      <label className="text-[11px] text-stone-400 inline-flex items-center gap-1">H
        <input type="number" value={local.height} min={20} max={3000} onChange={(e) => commit({ ...local, height: Math.max(20, Math.min(3000, Number(e.target.value) || 20)) })} className="h-7 w-16 bg-stone-900 border border-stone-700 rounded px-1 text-stone-100" />
      </label>
      <ColorInput value={local.background} onChange={(background) => commit({ ...local, background })} title="Background" />
      <button type="button" onClick={() => commit({ ...local, background: undefined })} className="h-7 px-1.5 rounded text-[11px] text-stone-400 hover:text-stone-200" title="Clear background">No bg</button>
      {sel && (
        <span className="inline-flex items-center gap-0.5 ml-auto">
          <button type="button" onClick={() => onZ(1)} className="h-7 w-7 grid place-items-center rounded hover:bg-stone-800 text-stone-300" title="Bring forward"><ArrowUp className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onZ(-1)} className="h-7 w-7 grid place-items-center rounded hover:bg-stone-800 text-stone-300" title="Send back"><ArrowDown className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onDuplicate} className="h-7 w-7 grid place-items-center rounded hover:bg-stone-800 text-stone-300" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onDelete} className="h-7 w-7 grid place-items-center rounded hover:bg-red-900/60 text-red-300" title="Delete" data-testid="ag-layout-delete"><Trash2 className="h-3.5 w-3.5" /></button>
        </span>
      )}
    </div>
  );
}

const DISPLAYS: Array<[string, string]> = [["value", "Value"], ["input", "Editable"], ["bar", "Bar"], ["pips", "Pips"], ["dial", "Dial"], ["badge", "Badge"], ["label", "Label only"]];

function ItemInspector({ item, noteId, params, onItem, onWidget, onClose }: {
  item: AgLayoutItem; noteId: string; params?: string[]; onItem: (p: Partial<AgLayoutItem>) => void; onWidget: (p: Partial<AgWidget>) => void; onClose: () => void;
}) {
  const { state } = useAg();
  const w = item.widget as any;
  const row = "flex flex-wrap items-center gap-1.5";
  const lbl = "text-[11px] text-stone-400 w-14 shrink-0";
  return (
    <div className="rounded border border-stone-700 bg-stone-900/90 p-2 space-y-1.5 text-stone-200" data-testid="ag-layout-inspector">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-amber-400/90">{w.kind}</span>
        <button type="button" onClick={onClose} className="h-6 w-6 grid place-items-center text-stone-500 hover:text-stone-200"><X className="h-3.5 w-3.5" /></button>
      </div>
      {w.kind === "field" && (
        <>
          <div className={row}><span className={lbl}>Value</span><div className="flex-1 min-w-[140px]"><RefPicker noteId={noteId} value={w.ref} params={params} onChange={(ref) => onWidget({ ref } as any)} /></div></div>
          {["bar", "pips", "dial", "value"].includes(w.display) && (
            <div className={row}><span className={lbl}>Max</span><div className="flex-1 min-w-[140px]"><RefPicker noteId={noteId} value={w.maxRef} params={params} placeholder="(none)" onChange={(maxRef) => onWidget({ maxRef } as any)} /></div></div>
          )}
          <div className={row}><span className={lbl}>Show as</span>
            <select value={w.display} onChange={(e) => onWidget({ display: e.target.value } as any)} className="h-7 bg-stone-900 border border-stone-700 rounded text-xs px-1">
              {DISPLAYS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!w.showLabel} onChange={(e) => onWidget({ showLabel: e.target.checked } as any)} /> Label</label>
            <ColorInput value={w.color} onChange={(color) => onWidget({ color } as any)} />
          </div>
          <div className={row}><span className={lbl}>Label</span><input value={w.label ?? ""} placeholder="(field name)" onChange={(e) => onWidget({ label: e.target.value } as any)} className="h-7 flex-1 min-w-[100px] bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" /></div>
          <TextStyle w={w} onWidget={onWidget} />
        </>
      )}
      {w.kind === "text" && (
        <>
          <textarea value={w.text} onChange={(e) => onWidget({ text: e.target.value } as any)} className="w-full min-h-[48px] bg-stone-900 border border-stone-700 rounded px-1.5 py-1 text-sm" />
          <TextStyle w={w} onWidget={onWidget} bold />
        </>
      )}
      {w.kind === "name" && <TextStyle w={w} onWidget={onWidget} />}
      {(w.kind === "portrait" || w.kind === "image") && (
        <div className={row}><span className={lbl}>Corners</span><input type="range" min={0} max={100} value={w.radius ?? 0} onChange={(e) => onWidget({ radius: Number(e.target.value) } as any)} className="flex-1" /></div>
      )}
      {w.kind === "image" && (
        <>
          <div className={row}><span className={lbl}>From</span><div className="flex-1 min-w-[140px]"><RefPicker noteId={noteId} value={w.ref} params={params} allowTypes={["image", "text"]} placeholder="(fixed image below)" onChange={(ref) => onWidget({ ref } as any)} /></div></div>
          <div className={row}><span className={lbl}>Link</span><input value={w.src ?? ""} placeholder="https://…" onChange={(e) => onWidget({ src: e.target.value } as any)} className="h-7 flex-1 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" /></div>
          <div className={row}><span className={lbl}>Fit</span>
            <select value={w.fit ?? "cover"} onChange={(e) => onWidget({ fit: e.target.value } as any)} className="h-7 bg-stone-900 border border-stone-700 rounded text-xs px-1"><option value="cover">Fill</option><option value="contain">Fit inside</option></select>
          </div>
        </>
      )}
      {w.kind === "button" && (
        <>
          <div className={row}><span className={lbl}>Action</span><div className="flex-1 min-w-[140px]"><ActionPicker noteId={noteId} value={w.actionId} onChange={(actionId) => onWidget({ actionId } as any)} /></div></div>
          <div className={row}><span className={lbl}>Text</span><input value={w.label ?? ""} placeholder="(action name)" onChange={(e) => onWidget({ label: e.target.value } as any)} className="h-7 flex-1 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" /></div>
        </>
      )}
      {w.kind === "chart" && (
        <>
          <div className={row}><span className={lbl}>Type</span>
            <select value={w.chart} onChange={(e) => onWidget({ chart: e.target.value } as any)} className="h-7 bg-stone-900 border border-stone-700 rounded text-xs px-1">
              <option value="radar">Radar</option><option value="bar">Bars</option><option value="line">Line</option><option value="pie">Pie</option>
            </select>
          </div>
          <RefList noteId={noteId} params={params} refs={w.refs} onChange={(refs) => onWidget({ refs } as any)} />
          <div className={row}><span className={lbl}>Scale max</span><div className="flex-1 min-w-[140px]"><RefPicker noteId={noteId} value={w.maxRef} params={params} placeholder="(auto)" onChange={(maxRef) => onWidget({ maxRef } as any)} /></div></div>
        </>
      )}
      {w.kind === "links" && (
        <>
          <div className={row}><span className={lbl}>Connection</span><input value={w.label} placeholder="e.g. items" onChange={(e) => onWidget({ label: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") } as any)} className="h-7 flex-1 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" /></div>
          <div className={row}><span className={lbl}>Columns</span><input value={(w.columns ?? []).join(", ")} placeholder="weight, qty" onChange={(e) => onWidget({ columns: e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) } as any)} className="h-7 flex-1 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" /></div>
        </>
      )}
      {w.kind === "shape" && (
        <div className={row}><span className={lbl}>Shape</span>
          <select value={w.shape} onChange={(e) => onWidget({ shape: e.target.value } as any)} className="h-7 bg-stone-900 border border-stone-700 rounded text-xs px-1"><option value="rect">Box</option><option value="circle">Circle</option><option value="line">Line</option></select>
          <ColorInput value={w.color} onChange={(color) => onWidget({ color } as any)} title="Fill" />
          <ColorInput value={w.border} onChange={(border) => onWidget({ border } as any)} title="Border" />
          <input type="range" min={0} max={1} step={0.05} value={w.opacity ?? 1} onChange={(e) => onWidget({ opacity: Number(e.target.value) } as any)} className="w-20" title="Opacity" />
        </div>
      )}
      {w.kind === "component" && (
        <>
          <div className={row}><span className={lbl}>Component</span>
            <select value={w.componentId} onChange={(e) => onWidget({ componentId: e.target.value, bindings: {} } as any)} className="h-7 flex-1 bg-stone-900 border border-stone-700 rounded text-xs px-1">
              <option value="">Choose…</option>
              {[...state.components.values()].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {(state.components.get(w.componentId)?.params ?? []).map((p) => (
            <div key={p} className={row}><span className={`${lbl} font-mono text-sky-300`}>${p}</span><div className="flex-1 min-w-[140px]"><RefPicker noteId={noteId} params={params} value={w.bindings?.[p]} onChange={(ref) => onWidget({ bindings: { ...(w.bindings ?? {}), [p]: ref } } as any)} /></div></div>
          ))}
        </>
      )}
      <div className={row}><span className={lbl}>Shown to</span>
        <AudienceSelect allowInherit value={(item.showTo ?? "inherit") as any} onChange={(a) => onItem({ showTo: a === "inherit" ? undefined : (a as AgAudience) })} />
        <span className="text-[10px] text-stone-500">Values stay protected by their own permissions either way.</span>
      </div>
    </div>
  );
}

function TextStyle({ w, onWidget, bold }: { w: any; onWidget: (p: any) => void; bold?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-stone-400 w-14 shrink-0">Text</span>
      <input type="number" min={6} max={72} value={w.fontSize ?? 13} onChange={(e) => onWidget({ fontSize: Number(e.target.value) })} className="h-7 w-14 bg-stone-900 border border-stone-700 rounded px-1 text-xs" title="Size" />
      <ColorInput value={w.color} onChange={(color) => onWidget({ color })} />
      <select value={w.align ?? "left"} onChange={(e) => onWidget({ align: e.target.value })} className="h-7 bg-stone-900 border border-stone-700 rounded text-xs px-1"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select>
      {bold && <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!w.bold} onChange={(e) => onWidget({ bold: e.target.checked })} /> Bold</label>}
      <AlignLeft className="h-3 w-3 text-stone-600" />
    </div>
  );
}

export function RefList({ noteId, refs, onChange, params }: { noteId: string; refs: string[]; onChange: (r: string[]) => void; params?: string[] }) {
  return (
    <div className="space-y-1">
      {refs.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="flex-1"><RefPicker noteId={noteId} value={r} params={params} onChange={(v) => onChange(refs.map((x, j) => (j === i ? v : x)))} /></div>
          <button type="button" onClick={() => onChange(refs.filter((_, j) => j !== i))} className="h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...refs, ""])} className="h-7 px-2 rounded bg-stone-800 text-xs text-stone-300 inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Add value</button>
    </div>
  );
}

export function useLayoutFromItems(items: AgLayoutItem[], meta: Omit<AgLayout, "items">): AgLayout {
  return useMemo(() => ({ ...meta, items }), [items, meta.width, meta.height, meta.background]); // eslint-disable-line react-hooks/exhaustive-deps
}
