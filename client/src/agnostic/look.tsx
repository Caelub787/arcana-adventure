// "Look": how any insert is drawn — size, colours, text, label, style.
// LookEditor is the one panel every insert uses (sheet blocks, inline values,
// buttons, canvas / tracker / component items, token bars); BlockFrame gives
// sheet blocks their width / alignment / background and drag-to-resize handles.
import React, { useRef, useState } from "react";
import { RotateCcw, X, AlignLeft, AlignCenter, AlignRight, Paintbrush } from "lucide-react";
import { AgPanel } from "./float";
import { AgIcon, IconGrid } from "./icons";
import type { AgLook } from "@shared/agnostic/types";
import { mergeLook, defaultLabelPos } from "./lookUtil";
import { TipIcon } from "./tips";

export { mergeLook, defaultLabelPos };

export type LookKind =
  | "bar" | "pips" | "dial" | "value" | "input" | "badge" | "label"
  | "inlineValue" | "button" | "chart" | "links" | "component" | "canvas" | "section" | "columns" | "tokenBar" | "text" | "tabs";

/** Strip keys set back to their default so stored looks stay small. */
function patchLook(look: AgLook, patch: Partial<AgLook>): AgLook {
  const next: Record<string, unknown> = { ...look, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null || next[k] === "") delete next[k];
  return next as AgLook;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// --------------------------------------------------------------------------- editor
interface Spec {
  width?: boolean; align?: boolean;
  height?: { label: string; min: number; max: number; def: number };
  minWidth?: boolean;
  color?: string; track?: boolean; text?: boolean; labelColor?: boolean; frame?: boolean; border?: boolean;
  font?: boolean; labelPos?: Array<NonNullable<AgLook["labelPos"]>>; numbers?: boolean;
  barStyle?: boolean; direction?: boolean; shape?: boolean; radius?: boolean; padding?: boolean;
  columns?: boolean; icon?: boolean;
}

function specFor(kind: LookKind, inCanvas: boolean): Spec {
  const block = !inCanvas;
  switch (kind) {
    case "bar": return { width: block, align: block, height: block ? { label: "Thickness", min: 4, max: 200, def: 14 } : undefined, color: "Fill", track: true, text: true, labelColor: true, frame: block, border: true, font: true, labelPos: ["above", "left", "right", "below", "inside", "none"], numbers: true, barStyle: true, direction: true, radius: true, padding: block };
    case "tokenBar": return { width: true, height: { label: "Thickness", min: 3, max: 30, def: 6 }, color: "Fill", track: true, text: true, border: true, font: true, numbers: true, barStyle: true, radius: true };
    case "pips": return { width: block, align: block, height: block ? { label: "Pip size", min: 6, max: 64, def: 14 } : undefined, color: "Filled", track: true, labelColor: true, frame: block, font: true, labelPos: ["above", "left", "right", "below", "none"], shape: true, radius: true, padding: block };
    case "dial": return { width: block, align: block, height: block ? { label: "Dial size", min: 24, max: 400, def: 56 } : undefined, color: "Ring", track: true, text: true, labelColor: true, frame: block, font: true, labelPos: ["above", "left", "right", "below", "none"], numbers: true, padding: block };
    case "value": case "label": return { width: block, align: block, color: "Accent", text: true, labelColor: true, frame: block, font: true, labelPos: ["above", "left", "right", "below", "none"], padding: block, radius: block };
    case "input": return { width: block, align: block, text: true, labelColor: true, frame: block, font: true, labelPos: ["above", "left", "right", "below", "none"], padding: block, radius: block };
    case "badge": return { width: block, align: block, color: "Border", text: true, labelColor: true, frame: block, font: true, labelPos: ["left", "right", "none"], radius: true, padding: block };
    case "inlineValue": return { color: "Accent", text: true, labelColor: true, font: true, labelPos: ["left", "right", "none"], minWidth: true };
    case "button": return { width: block, align: block, height: { label: "Height", min: 18, max: 120, def: 32 }, minWidth: true, color: "Button", text: true, border: true, font: true, radius: true, icon: true };
    case "chart": return { width: block, align: block, height: block ? { label: "Height", min: 80, max: 900, def: 220 } : undefined, color: "Main", text: true, frame: block, padding: block, radius: block };
    case "links": return { width: block, align: block, height: { label: "Max height", min: 60, max: 1200, def: 0 }, color: "Header", text: true, border: true, font: true, frame: block, radius: true, padding: block };
    case "component": case "canvas": return { width: block, align: block, frame: block, radius: block, padding: block };
    case "section": return { width: true, align: true, frame: true, radius: true, padding: true };
    case "columns": return { width: true, align: true, frame: true, radius: true, padding: true, columns: true };
    case "tabs": return { color: "Active tab", text: true, frame: true };
    case "text": return { text: true, font: true };
  }
}

/** Where the colour picker starts when nothing is set yet. */
const DEFAULT_SWATCH: Record<string, string> = { color: "#16a34a", track: "#1c1917", textColor: "#ffffff", labelColor: "#a8a29e", border: "#000000", bg: "#1c1917", outline: "#78350f" };
function toHex(c: string | undefined, fallback: string) {
  if (c && /^#[0-9a-f]{6}$/i.test(c)) return c;
  if (c && /^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  return fallback;
}

const LABEL_POS: Record<string, string> = { above: "Above", left: "Left", right: "Right", below: "Below", inside: "Inside the bar", none: "Hidden" };

export function LookEditor({ look, onChange, kind, inCanvas = false }: { look: AgLook | undefined; onChange: (l: AgLook) => void; kind: LookKind; inCanvas?: boolean }) {
  const L = look ?? {};
  const s = specFor(kind, inCanvas);
  const set = (p: Partial<AgLook>) => onChange(patchLook(L, p));
  const row = (label: string, el: React.ReactNode, key?: string) => (
    <div key={key ?? label} className="flex items-center gap-1.5 min-h-8"><span className="text-[11px] text-stone-400 w-[72px] shrink-0">{label}</span><div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">{el}</div></div>
  );
  const slider = (key: keyof AgLook, min: number, max: number, def: number, unit = "px", step = 1) => {
    const v = (L[key] as number | undefined);
    return (
      <>
        <input type="range" min={min} max={max} step={step} value={v ?? def} onChange={(e) => set({ [key]: Number(e.target.value) } as any)} className="flex-1 min-w-[90px] accent-amber-500" data-testid={`ag-look-${String(key)}`} />
        <input type="number" min={min} max={max} value={v ?? ""} placeholder={def ? String(def) : "auto"} onChange={(e) => set({ [key]: e.target.value === "" ? undefined : clamp(Number(e.target.value), min, max) } as any)} className="h-7 w-14 bg-stone-900 border border-stone-700 rounded px-1 text-xs" />
        <span className="text-[10px] text-stone-500 w-4">{unit}</span>
      </>
    );
  };
  const color = (key: keyof AgLook, title: string) => {
    const v = L[key] as string | undefined;
    return (
      <span key={String(key)} className="inline-flex items-center gap-0.5">
        <label className="relative inline-flex items-center h-8 sm:h-7 px-1.5 rounded border border-stone-700 bg-stone-900 cursor-pointer" title={v ? `${title}: ${v}` : `${title}: default`}>
          <span className="h-5 w-6 rounded-sm border border-black/40" style={v ? { background: v } : { background: "repeating-linear-gradient(45deg, #44403c 0 3px, #1c1917 3px 6px)" }} />
          <input type="color" value={toHex(v, DEFAULT_SWATCH[String(key)] ?? "#f59e0b")} onChange={(e) => set({ [key]: e.target.value } as any)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        {v ? <button type="button" onClick={() => set({ [key]: undefined } as any)} className="h-6 w-5 grid place-items-center text-stone-500 hover:text-stone-200" title="Back to default"><X className="h-3 w-3" /></button> : <span className="w-5" />}
      </span>
    );
  };
  const select = (key: keyof AgLook, options: Array<[string, string]>, def: string) => (
    <select value={(L[key] as string | undefined) ?? def} onChange={(e) => set({ [key]: e.target.value === def ? undefined : e.target.value } as any)} className="h-7 bg-stone-900 border border-stone-700 rounded text-xs px-1 max-w-full" data-testid={`ag-look-${String(key)}`}>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );
  const colours: Array<[keyof AgLook, string]> = [];
  if (s.color) colours.push(["color", s.color]);
  if (s.track) colours.push(["track", "Empty part"]);
  if (s.text) colours.push(["textColor", "Text"]);
  if (s.labelColor) colours.push(["labelColor", "Label"]);
  if (s.border) colours.push(["border", "Border"]);
  if (s.frame) { colours.push(["bg", "Background"]); colours.push(["outline", "Outline"]); }

  return (
    <div className="space-y-0.5 text-stone-200" data-testid="ag-look-editor">
      {(s.width || s.align) && <div className="text-[10px] uppercase tracking-wide text-amber-400/80 pt-1">Size & place</div>}
      {s.width && row("Width", slider("width", 10, 100, 100, "%"))}
      {s.align && row("Align", (
        <span className="inline-flex rounded border border-stone-700 overflow-hidden">
          {(["left", "center", "right"] as const).map((a) => (
            <button key={a} type="button" onClick={() => set({ align: a === "left" ? undefined : a })} className={`h-7 w-8 grid place-items-center ${(L.align ?? "left") === a ? "bg-amber-600/40 text-amber-100" : "text-stone-400 hover:bg-stone-800"}`} title={a}>
              {a === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : a === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
            </button>
          ))}
        </span>
      ))}
      {s.height && row(s.height.label, slider("height", s.height.min, s.height.max, s.height.def))}
      {s.minWidth && row("Min width", slider("minWidth", 0, 600, 0))}
      {s.padding && row("Padding", slider("padding", 0, 48, 0))}
      {s.radius && row("Corners", slider("radius", 0, 40, kind === "bar" || kind === "tokenBar" ? 2 : 6))}
      {s.columns && row("Gap", slider("gap", 0, 64, 14))}
      {s.columns && row("Boxes", (
        <label className="flex items-center gap-1.5 text-xs text-stone-300"><input type="checkbox" checked={!!L.boxed} onChange={(e) => set({ boxed: e.target.checked || undefined })} data-testid="ag-look-boxed" /> Each column in its own box</label>
      ))}
      {s.columns && row("Widths", (
        <>
          {select("ratio", [["", "Equal"], ["2:1", "Wide left"], ["1:2", "Wide right"], ["3:1", "Very wide left"], ["1:3", "Very wide right"], ["1:2:1", "Wide middle"]], "")}
          <input value={L.ratio ?? ""} placeholder="e.g. 2:1:1" onChange={(e) => set({ ratio: e.target.value.replace(/[^0-9.:]/g, "") || undefined })} className="h-7 w-20 bg-stone-900 border border-stone-700 rounded px-1 text-xs font-mono" />
        </>
      ))}

      {colours.length > 0 && <div className="text-[10px] uppercase tracking-wide text-amber-400/80 pt-1.5">Colours</div>}
      {colours.length > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {colours.map(([k, t]) => <div key={String(k)} className="flex items-center justify-between gap-1"><span className="text-[11px] text-stone-400 truncate">{t}</span>{color(k, t)}</div>)}
        </div>
      )}

      {(s.font || s.labelPos || s.numbers) && <div className="text-[10px] uppercase tracking-wide text-amber-400/80 pt-1.5">Text</div>}
      {s.font && row("Size", slider("fontSize", 6, 72, 0, "px"))}
      {(kind === "value" || kind === "inlineValue" || kind === "badge") && row("After value", <input value={L.suffix ?? ""} placeholder="e.g. lbs, ft" onChange={(e) => set({ suffix: e.target.value || undefined })} className="h-7 w-28 bg-stone-900 border border-stone-700 rounded px-1.5 text-xs" />)}
      {s.font && row("Weight", (
        <>
          <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!L.bold} onChange={(e) => set({ bold: e.target.checked || undefined })} /> Bold</label>
          <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!L.italic} onChange={(e) => set({ italic: e.target.checked || undefined })} /> Italic</label>
        </>
      ))}
      {s.font && row("Font", select("font", [["body", "Sheet"], ["display", "Title"], ["script", "Handwritten"], ["mono", "Typewriter"]], "body"))}
      {s.labelPos && row("Label", select("labelPos", s.labelPos.map((p) => [p, LABEL_POS[p]]), defaultLabelPos(kind)))}
      {s.labelPos && row("Label text", (
        <>
          <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!L.labelUpper} onChange={(e) => set({ labelUpper: e.target.checked || undefined })} /> SMALL CAPS</label>
          <input type="number" min={6} max={40} value={L.labelSize ?? ""} placeholder="size" onChange={(e) => set({ labelSize: e.target.value === "" ? undefined : clamp(Number(e.target.value), 6, 40) })} className="h-7 w-16 bg-stone-900 border border-stone-700 rounded px-1 text-xs" />
        </>
      ))}
      {s.numbers && row("Numbers", select("numbers", [["fraction", "Current / max"], ["value", "Current only"], ["percent", "Percent"], ["none", "None"]], "fraction"))}

      {(s.barStyle || s.shape || s.direction || s.icon) && <div className="text-[10px] uppercase tracking-wide text-amber-400/80 pt-1.5">Style</div>}
      {(s.font || s.icon) && kind !== "tokenBar" && kind !== "text" && row("Icon", <IconPick value={L.iconName} color={L.iconColor} onChange={(iconName, iconColor) => set({ iconName, iconColor })} />)}
      {s.barStyle && row("Bar", select("barStyle", [["solid", "Solid"], ["gradient", "Shaded"], ["striped", "Striped"], ["segments", "Segments (one per point)"], ["glow", "Glowing"]], "solid"))}
      {s.direction && row("Fills", select("direction", [["right", "Left → right"], ["left", "Right → left"], ["up", "Bottom → top (tall bar)"]], "right"))}
      {s.shape && row("Shape", select("shape", [["circle", "Circles"], ["square", "Squares"], ["diamond", "Diamonds"], ["heart", "Hearts"], ["star", "Stars"]], "circle"))}
      {s.icon && row("Icon", <label className="text-xs inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={L.icon !== false} onChange={(e) => set({ icon: e.target.checked ? undefined : false })} /> Show dice icon</label>)}

      {kind !== "tokenBar" && kind !== "columns" && kind !== "tabs" && <TooltipEditor value={L.tooltip} onChange={(t) => set({ tooltip: t || undefined })} />}
      {Object.keys(L).length > 0 && (
        <button type="button" onClick={() => onChange({})} className="mt-1 h-7 px-2 rounded text-[11px] text-stone-400 hover:text-stone-100 hover:bg-stone-800 inline-flex items-center gap-1" data-testid="ag-look-reset"><RotateCcw className="h-3 w-3" /> Reset look</button>
      )}
    </div>
  );
}

/** Tooltip text: shown behind a "?" next to the value / insert. Saved when you leave the box. */
export function TooltipEditor({ value, onChange, hint }: { value?: string; onChange: (t: string) => void; hint?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="space-y-1 pt-1">
      <div className="text-[11px] text-stone-400 inline-flex items-center gap-1">Tooltip <TipIcon text={"Adds a **?** that shows this text on hover (or a tap on phones).\n\n## Formatting\n- **bold** with two stars each side\n- ## at the start of a line: a heading\n- lines with | between cells make a table (first line = header)\n- a row whose first cell matches the current value is highlighted"} /></div>
      <textarea value={draft ?? value ?? ""} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== null && draft !== (value ?? "")) onChange(draft); setDraft(null); }}
        rows={4} placeholder={hint ?? "Explain this to the players (optional)"} className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs font-mono text-stone-200" data-testid="ag-tooltip-text" />
    </div>
  );
}

/** A small brush button that opens the look panel (token bars and other compact rows). */
export function LookButton({ look, onChange, kind, title = "Look & size" }: { look: AgLook | undefined; onChange: (l: AgLook) => void; kind: LookKind; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)} className={`h-7 w-7 grid place-items-center rounded hover:bg-stone-800 ${look && Object.keys(look).length ? "text-amber-300" : "text-stone-400"}`} title={title} data-testid={`ag-look-button-${kind}`}><Paintbrush className="h-3.5 w-3.5" /></button>
      {open && <AgPanel title={title} onClose={() => setOpen(false)} width={360} height={540}><LookEditor look={look} onChange={onChange} kind={kind} /></AgPanel>}
    </>
  );
}

// --------------------------------------------------------------------------- block frame (sheet documents)
/**
 * Width, alignment, background and padding for a block on a sheet, plus
 * drag handles: the side edge sets the width, the bottom edge the height
 * (thickness of a bar, size of a dial, height of a chart…).
 */
export function BlockFrame({ look, onLook, editable, height, children, testId }: {
  look: AgLook; onLook: (patch: Partial<AgLook>) => void; editable: boolean;
  /** Present when the block has a height the bottom handle can change. */
  height?: { value: number; min: number; max: number };
  /** A function child gets the in-progress drag size, so the content can follow the drag live. */
  children: React.ReactNode | ((live: Partial<AgLook> | null) => React.ReactNode); testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<Partial<AgLook> | null>(null);
  const L = { ...look, ...(live ?? {}) };
  const align = L.align ?? "left";
  const style: React.CSSProperties = {
    width: L.width ? `${L.width}%` : undefined,
    marginLeft: align === "left" ? undefined : "auto",
    marginRight: align === "center" ? "auto" : undefined,
    background: L.bg, border: L.outline ? `1px solid ${L.outline}` : undefined,
    borderRadius: L.bg || L.outline ? (L.radius ?? 6) : undefined, padding: L.padding,
  };
  const start = (e: React.PointerEvent, mode: "w" | "h" | "wh") => {
    e.preventDefault();
    e.stopPropagation();
    const el = ref.current;
    if (!el?.parentElement) return;
    const pw = el.parentElement.getBoundingClientRect().width || 1;
    const startW = el.getBoundingClientRect().width;
    // 0 = automatic: start from what's on screen.
    const startH = height?.value || el.getBoundingClientRect().height;
    const sx = e.clientX, sy = e.clientY;
    const sign = align === "right" ? -1 : align === "center" ? 2 : 1;
    let latest: Partial<AgLook> = {};
    const move = (ev: PointerEvent) => {
      const next: Partial<AgLook> = {};
      if (mode !== "h") next.width = clamp(Math.round(((startW + (ev.clientX - sx) * sign) / pw) * 100), 10, 100);
      if (mode !== "w" && height) next.height = clamp(Math.round(startH + ev.clientY - sy), height.min, height.max);
      latest = next;
      setLive(next);
    };
    // Capture phase: the windows / map underneath stop pointer events from bubbling to window.
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      setLive(null);
      if (Object.keys(latest).length) onLook(latest.width === 100 ? { ...latest, width: undefined } : latest);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  };
  const side = align === "right" ? "left" : "right";
  return (
    <div ref={ref} className="relative" style={style} data-testid={testId}>
      {typeof children === "function" ? children(live) : children}
      {L.tooltip && <span className="absolute top-1 right-1 z-[6]"><TipIcon text={L.tooltip} /></span>}
      {editable && (
        <>
          <div className={`ag-resize absolute top-0 bottom-0 w-3 cursor-ew-resize touch-none grid place-items-center ${side === "right" ? "-right-3" : "-left-3"}`} onPointerDown={(e) => start(e, "w")} title="Drag to change the width" data-testid="ag-resize-w">
            <span className="w-1 h-6 max-h-full rounded-full bg-amber-500/80" />
          </div>
          {height && (
            <>
              <div className="ag-resize absolute left-0 right-0 -bottom-3 h-3 cursor-ns-resize touch-none grid place-items-center" onPointerDown={(e) => start(e, "h")} title="Drag to change the height" data-testid="ag-resize-h">
                <span className="h-1 w-6 rounded-full bg-amber-500/80" />
              </div>
              <div className={`ag-resize absolute -bottom-3 h-3.5 w-3.5 rounded-sm bg-amber-500 border border-stone-900 touch-none ${side === "right" ? "-right-3 cursor-nwse-resize" : "-left-3 cursor-nesw-resize"}`} onPointerDown={(e) => start(e, "wh")} title="Drag to resize" data-testid="ag-resize-wh" />
            </>
          )}
          {live && (
            <span className="absolute -top-5 right-0 z-20 rounded bg-amber-600 text-white text-[10px] px-1 pointer-events-none">
              {live.width !== undefined ? `${live.width}%` : ""}{live.width !== undefined && live.height !== undefined ? " · " : ""}{live.height !== undefined ? `${live.height}px` : ""}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Pick an icon (and its colour) shown before a value or on a button. */
function IconPick({ value, color, onChange }: { value?: string; color?: string; onChange: (name: string | undefined, color: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-7 px-2 rounded border border-stone-700 bg-stone-900 text-xs text-stone-200 inline-flex items-center gap-1.5" data-testid="ag-look-icon">
        {value ? <AgIcon name={value} size={14} color={color ?? "#d4a24c"} /> : null}{value ?? "None"}
      </button>
      {value && <input type="color" value={color ?? "#d4a24c"} onChange={(e) => onChange(value, e.target.value)} className="h-6 w-7 bg-transparent" title="Icon colour" />}
      {value && <button type="button" onClick={() => onChange(undefined, undefined)} className="h-6 w-5 grid place-items-center text-stone-500 hover:text-stone-200" title="No icon"><X className="h-3 w-3" /></button>}
      {open && <AgPanel title="Choose an icon" onClose={() => setOpen(false)} width={340} height={420}><IconGrid value={value} onPick={(n) => { onChange(n, color); setOpen(false); }} /></AgPanel>}
    </>
  );
}
