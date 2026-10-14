// Presentation widgets. Every one of them reads the single live value from
// the scope store and writes back through ops — the same HP shows (and
// changes) identically on a sheet, the player tracker and a battlemap token.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Dices, Image as ImageIcon, Loader2 } from "lucide-react";
import { Bar, BarChart, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Cell } from "recharts";
import type { AgActionChoice, AgField, AgFieldDisplay, AgLayout, AgLayoutItem, AgLook, AgWidget, AgNote, AgAudience, AgRollMods } from "@shared/agnostic/types";
import { audienceIncludes } from "@shared/agnostic/acl";
import { formatValue, asNumber } from "@shared/agnostic/formula";
import { useAg, resolveRef, effOf, follow, usePerms, fieldsOf } from "./hooks";
import { triggerRollNotification } from "@/components/game/RollNotification";
import { useToast } from "@/hooks/use-toast";
import { AgPanel, AgSelector, PickField } from "./float";
import { api } from "@/lib/api";
import { pushUndo } from "./undo";
import { agClient } from "./client";
import { mergeLook, defaultLabelPos } from "./lookUtil";
import { LinksTable } from "./links";
import { AgIcon } from "./icons";
import { TipIcon } from "./tips";
import { RollIcon } from "./rollIcons";

// --- battlemap / tracker targets ("@target" in actions) -----------------------------
let currentTargets: string[] = [];
const targetListeners = new Set<() => void>();
export function setAgTargets(noteIds: string[]) {
  currentTargets = noteIds;
  targetListeners.forEach((l) => l());
}
export function getAgTargets() { return currentTargets; }

// --- field edits ------------------------------------------------------------------------
/** What a value will look like once the server applies `value` (shown straight away). */
function predictField(f: AgField, value: any): AgField {
  if (f.type === "formula") return f;
  let v = value;
  if (f.type === "number" && typeof v === "number") {
    const { min, max } = f.options ?? {};
    if (typeof min === "number") v = Math.max(min, v);
    if (typeof max === "number") v = Math.min(max, v);
  }
  // Changes from connected sheets (wounds, gear) only add or multiply; keep their offset.
  const offset = typeof f.eff === "number" && typeof f.value === "number" && typeof v === "number" ? f.eff - f.value : 0;
  return { ...f, value: v, eff: typeof v === "number" ? v + offset : v };
}

export function useFieldWriter() {
  const { request, key, previewUserId, state } = useAg();
  const { toast } = useToast();
  const stateRef = useRef(state);
  stateRef.current = state;
  return useMemo(() => {
    const fail = (e: any) => { toast({ title: "Couldn't change it", description: e.message, variant: "destructive" }); throw e; };
    // A value that goes up with its maximum (HP) stops at it — the server does the same.
    const capped = (f: AgField, value: any) => {
      if (typeof value !== "number" || !f.options?.follows) return value;
      const m = effOf(resolveRef(stateRef.current, f.noteId, f.options.follows)[0]);
      return typeof m === "number" ? Math.min(value, Math.max(0, m)) : value;
    };
    // Shown at once; the server confirms (or it's put back if refused).
    const optimistic = (f: AgField, value: any) => (previewUserId ? () => {} : agClient.optimisticField(key, f.id, (cur) => predictField(cur, capped(f, value))));
    return {
      set: (f: AgField, value: any) => {
        const before = f.value;
        const revert = optimistic(f, value);
        return request({ op: "field.set", id: f.id, value })
          .then(() => pushUndo(key, { label: `${f.label} change`, undo: () => request({ op: "field.set", id: f.id, value: before }) }))
          .catch((e) => { revert(); return fail(e); }).catch(() => {});
      },
      adjust: (f: AgField, delta: number) => {
        const cur = typeof f.value === "number" ? f.value : Number(f.value) || 0;
        // A loss comes off temporary points first (Temp HP before HP) — the server does the same.
        const shield = delta < 0 && f.options?.shield ? resolveRef(stateRef.current, f.noteId, f.options.shield)[0] : undefined;
        if (shield && typeof shield.value === "number" && shield.value > 0) {
          const soak = Math.min(shield.value, -delta);
          const beforeShield = shield.value, beforeCur = f.value;
          const r1 = optimistic(shield, beforeShield - soak), r2 = optimistic(f, cur + delta + soak);
          return request({ op: "field.adjust", id: f.id, delta })
            .then(() => pushUndo(key, { label: `${f.label} ${delta}`, undo: async () => { await request({ op: "field.set", id: shield.id, value: beforeShield }); await request({ op: "field.set", id: f.id, value: beforeCur }); } }))
            .catch((e) => { r1(); r2(); return fail(e); }).catch(() => {});
        }
        const revert = optimistic(f, cur + delta);
        return request({ op: "field.adjust", id: f.id, delta })
          .then(() => pushUndo(key, { label: `${f.label} ${delta > 0 ? "+" : ""}${delta}`, undo: () => request({ op: "field.adjust", id: f.id, delta: -delta }) }))
          .catch((e) => { revert(); return fail(e); }).catch(() => {});
      },
    };
  }, [request, toast, key, previewUserId]);
}

const pct = (v: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);

/** Text input that only commits on blur / Enter so remote updates don't fight the cursor. */
export function CommitInput({ value, onCommit, type = "text", className = "", placeholder, disabled, ...rest }: {
  value: string | number | null; onCommit: (v: string) => void; type?: string; className?: string; placeholder?: string; disabled?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null || value === undefined ? "" : String(value));
  return (
    <input
      {...rest}
      type={type}
      value={shown}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => { setDraft(shown); e.currentTarget.select(); }}
      onBlur={() => { if (draft !== null && draft !== String(value ?? "")) onCommit(draft); setDraft(null); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") { setDraft(null); (e.currentTarget as HTMLInputElement).blur(); }
        e.stopPropagation();
      }}
      className={`bg-stone-900/80 border border-stone-700 rounded px-1.5 text-stone-100 outline-none focus:border-amber-500/70 min-w-0 ${className}`}
    />
  );
}

/** Small popover to set / nudge a number (resource bars, pips, dials). */
function NumberEditor({ field, max, children }: { field: AgField; max?: number | null; children: React.ReactNode }) {
  const w = useFieldWriter();
  const v = asNumber(effOf(field) as any);
  const [open, setOpen] = useState(false);
  const note = useAg().state.notes.get(field.noteId);
  return (
    <>
      <div className="contents" onClick={() => setOpen(true)}>{children}</div>
      {open && (
      <AgPanel title={`${field.label}${note?.name ? ` — ${note.name}` : ""}`} onClose={() => setOpen(false)} width={300} height={220} testId="ag-number-panel">
        <div className="text-xs text-stone-400 mb-1.5">{field.label}{max != null ? ` (max ${formatValue(max)})` : ""}</div>
        <div className="flex items-center gap-1">
          {[-5, -1].map((d) => <button key={d} type="button" onClick={() => w.adjust(field, d)} className="h-9 px-2 rounded bg-stone-800 hover:bg-red-900/60 text-sm text-stone-200">{d}</button>)}
          <CommitInput value={field.value as number} type="number" className="h-9 flex-1 min-w-[4rem] text-center text-base" onCommit={(s) => w.set(field, s === "" ? null : Number(s))} />
          {[1, 5].map((d) => <button key={d} type="button" onClick={() => w.adjust(field, d)} className="h-9 px-2 rounded bg-stone-800 hover:bg-emerald-900/60 text-sm text-stone-200">+{d}</button>)}
        </div>
        {max != null && (
          <div className="flex gap-1 mt-1.5">
            <button type="button" onClick={() => w.set(field, 0)} className="flex-1 h-7 rounded bg-stone-800 text-xs text-stone-300">0</button>
            <button type="button" onClick={() => w.set(field, max)} className="flex-1 h-7 rounded bg-stone-800 text-xs text-stone-300">Full</button>
          </div>
        )}
        <div className="text-[10px] text-stone-500 mt-1.5">Now {formatValue(v)}</div>
      </AgPanel>
      )}
    </>
  );
}

/** Text shown on a bar / dial for its numbers mode. */
function numbersText(mode: AgLook["numbers"], cur: number, max: number | null) {
  if (mode === "none") return "";
  if (mode === "percent") return max != null && max > 0 ? `${Math.round(pct(cur, max))}%` : formatValue(cur);
  if (mode === "value" || max == null) return formatValue(cur);
  return `${formatValue(cur)}/${formatValue(max)}`;
}

function barFill(color: string, style: AgLook["barStyle"]): React.CSSProperties {
  switch (style) {
    case "gradient": return { background: `linear-gradient(180deg, color-mix(in srgb, ${color} 55%, white) 0%, ${color} 45%, color-mix(in srgb, ${color} 70%, black) 100%)` };
    case "striped": return { background: `repeating-linear-gradient(45deg, ${color} 0 6px, color-mix(in srgb, ${color} 72%, black) 6px 12px)` };
    case "glow": return { background: color, boxShadow: `0 0 8px ${color}, inset 0 0 4px color-mix(in srgb, ${color} 50%, white)` };
    default: return { background: color };
  }
}

export function ResourceBar({ field, maxField, color = "#16a34a", label, showNumbers = true, height = 14, compact, look }: {
  field: AgField; maxField?: AgField; color?: string; label?: string; showNumbers?: boolean; height?: number; compact?: boolean; look?: AgLook;
}) {
  const { canEditField } = usePerms(field.noteId);
  const { state } = useAg();
  const L = look ?? {};
  const cur = asNumber(effOf(field) as any);
  const max = maxField ? asNumber(effOf(maxField) as any) : null;
  // Temporary points (e.g. Temp HP): a green layer on top, after the value.
  const shieldF = field.options?.shield ? resolveRef(state, field.noteId, field.options.shield)[0] : undefined;
  const shield = shieldF ? Math.max(0, asNumber(effOf(shieldF) as any)) : 0;
  // The temporary points' own colour (Temp HP green, Temp Energy pink…).
  const shieldColor = shieldF?.options.color ?? "#22c55e";
  const fill = L.color ?? color;
  const vertical = L.direction === "up";
  const h = height;
  const scale = max != null ? Math.max(max, cur + shield) : 0;
  const p = max != null ? pct(cur, scale) : 100;
  const pShield = max != null && shield > 0 ? pct(shield, scale) : 0;
  const mode = !showNumbers ? "none" : L.numbers;
  const nums = numbersText(mode, cur, max) + (shield > 0 && mode !== "none" && mode !== "percent" ? ` +${formatValue(shield)}` : "");
  const name = label ?? field.label;
  const text = [L.labelPos === "inside" ? name : !compact && label ? label : "", nums].filter(Boolean).join(" ");
  const fontSize = L.fontSize ?? Math.max(8, Math.min(12, (vertical ? 14 : h) - 3));
  const segments = L.barStyle === "segments" && max != null && max >= 2 && max <= 60 ? Math.round(max) : 0;
  const bar = (
    <div
      className={`relative w-full overflow-hidden ${L.border ? "" : "border border-black/40"} ${canEditField(field) ? "cursor-pointer" : ""}`}
      style={{ height: h, background: L.track ?? "rgba(0,0,0,0.6)", borderRadius: L.radius ?? 2, border: L.border ? `1px solid ${L.border}` : undefined }}
      title={`${name}: ${formatValue(cur)}${max != null ? ` / ${formatValue(max)}` : ""}${shield > 0 ? ` (+${formatValue(shield)} ${shieldF!.label})` : ""}`}
      data-testid={`ag-bar-${field.key}`}
    >
      <div
        className={`absolute ease-out duration-500 ${vertical ? "inset-x-0 bottom-0 transition-[height]" : `inset-y-0 transition-[width] ${L.direction === "left" ? "right-0" : "left-0"}`}`}
        style={{ ...(vertical ? { height: `${p}%` } : { width: `${p}%` }), ...barFill(fill, L.barStyle), borderRadius: L.radius ? Math.max(0, L.radius - 1) : undefined }}
      />
      {pShield > 0 && (
        <div className={`absolute ease-out duration-500 ${vertical ? "inset-x-0 transition-[height,bottom]" : "inset-y-0 transition-[width,left]"}`} data-testid={`ag-bar-shield-${field.key}`}
          style={{ ...(vertical ? { bottom: `${p}%`, height: `${pShield}%` } : L.direction === "left" ? { right: `${p}%`, width: `${pShield}%` } : { left: `${p}%`, width: `${pShield}%` }), background: shieldColor, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.25)" }} />
      )}
      {segments > 0 && Array.from({ length: segments - 1 }, (_, i) => (
        <div key={i} className="absolute pointer-events-none" style={vertical
          ? { left: 0, right: 0, height: 1, bottom: `${((i + 1) / segments) * 100}%`, background: L.track ?? "rgba(0,0,0,0.75)" }
          : { top: 0, bottom: 0, width: 1, left: `${((i + 1) / segments) * 100}%`, background: L.track ?? "rgba(0,0,0,0.75)" }} />
      ))}
      {text && (L.fontSize || h >= 10) && (
        <div className={`absolute inset-0 flex items-center justify-center leading-none ${L.bold ? "font-bold" : "font-mono"} ${vertical ? "[writing-mode:vertical-rl] rotate-180" : ""}`} style={{ fontSize, color: L.textColor ?? "#fff", fontStyle: L.italic ? "italic" : undefined, textShadow: "0 0 2px #000, 0 0 2px #000" }}>
          {text}
        </div>
      )}
    </div>
  );
  return canEditField(field) ? <NumberEditor field={field} max={max}>{bar}</NumberEditor> : bar;
}

const PIP_GLYPH: Record<string, string> = { heart: "\u2665", star: "\u2605" };

function Pips({ field, maxField, color = "#f59e0b", look, size: sizeProp }: { field: AgField; maxField?: AgField; color?: string; look?: AgLook; size?: number }) {
  const { canEditField } = usePerms(field.noteId);
  const w = useFieldWriter();
  const L = look ?? {};
  const cur = Math.round(asNumber(effOf(field) as any));
  const max = Math.min(60, Math.max(1, Math.round(maxField ? asNumber(effOf(maxField) as any) : Math.max(cur, 5))));
  const editable = canEditField(field);
  const size = sizeProp ?? L.height ?? 14;
  const on = L.color ?? color, off = L.track ?? "rgba(255,255,255,0.12)";
  const shape = L.shape ?? "circle";
  return (
    <div className="flex flex-wrap" style={{ gap: Math.max(2, Math.round(size / 4)) }} title={`${field.label}: ${cur}/${max}`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < cur;
        const glyph = PIP_GLYPH[shape];
        return (
          <button
            key={i}
            type="button"
            disabled={!editable}
            onClick={() => w.set(field, i + 1 === cur ? i : i + 1)}
            className={`disabled:cursor-default grid place-items-center leading-none ${glyph ? "" : "border border-black/50"}`}
            style={glyph
              ? { width: size, height: size, fontSize: size, color: filled ? on : off, textShadow: filled ? "0 0 1px #000" : undefined }
              : { width: size, height: size, background: filled ? on : off, borderRadius: shape === "circle" ? "50%" : (L.radius ?? 2), transform: shape === "diamond" ? "rotate(45deg) scale(.8)" : undefined }}
            aria-label={`${field.label} ${i + 1}`}
          >{glyph ?? null}</button>
        );
      })}
    </div>
  );
}

function Dial({ field, maxField, color = "#38bdf8", size = 56, look }: { field: AgField; maxField?: AgField; color?: string; size?: number; look?: AgLook }) {
  const { canEditField } = usePerms(field.noteId);
  const L = look ?? {};
  const cur = asNumber(effOf(field) as any);
  const max = maxField ? asNumber(effOf(maxField) as any) : 0;
  const stroke = Math.max(3, Math.round(size / 11));
  const r = size / 2 - stroke / 2 - 1, c = 2 * Math.PI * r, p = max > 0 ? pct(cur, max) / 100 : 1;
  const text = numbersText(L.numbers ?? "value", cur, maxField ? max : null);
  const dial = (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={L.track ?? "rgba(255,255,255,0.12)"} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={L.color ?? color} strokeWidth={stroke} fill="none" strokeLinecap={L.radius ? "round" : undefined} strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset .5s" }} />
      </svg>
      {text && <span className={`absolute ${L.bold ? "font-bold" : "font-mono"}`} style={{ fontSize: L.fontSize ?? Math.max(9, Math.round(size / 4.5)), color: L.textColor ?? "#f5f5f4", fontStyle: L.italic ? "italic" : undefined }}>{text}</span>}
    </div>
  );
  return canEditField(field) ? <NumberEditor field={field} max={max || null}><button type="button">{dial}</button></NumberEditor> : dial;
}

/**
 * A shown value that opens its own editor on double-click (long-press on
 * touch), in a floating panel — no edit mode, nothing else changes.
 */
/**
 * Double-click (or long-press) a value to change it right where it is. An empty
 * value shows a faint dash for whoever may fill it in, so there's always
 * something to double-click. The GM can also change a dice value's dice here.
 */
export function EditOnDoubleClick({ field, children, empty }: { field?: AgField; children: React.ReactNode; empty?: boolean }) {
  const { canEditField, isGM } = usePerms(field?.noteId);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editable = !!field && field.type !== "formula" && (field.type === "dice" ? isGM : canEditField(field));
  if (!editable) return <>{children}</>;
  if (empty) children = <span className="inline-block min-w-[1.5em] text-stone-500 font-normal border-b border-dashed border-stone-600" title="Empty — double-click to fill in">—</span>;
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  return (
    <>
      <span className="cursor-pointer" title="Double-click (or long-press) to change"
        onDoubleClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onTouchStart={() => { cancel(); timer.current = setTimeout(() => setOpen(true), 500); }}
        onTouchEnd={cancel} onTouchMove={cancel} onTouchCancel={cancel}
        data-testid={`ag-dbledit-${field!.key}`}>{children}</span>
      {open && (
        <AgPanel title={field!.label} onClose={() => setOpen(false)} width={300} height={field!.type === "text" || field!.type === "dice" ? 200 : 180} testId="ag-value-edit">
          {field!.type === "dice" ? <DiceFormulaInput field={field!} /> : <FieldInput field={field!} className={field!.type === "text" || field!.type === "number" ? "w-full" : ""} />}
        </AgPanel>
      )}
    </>
  );
}

/** The GM changes what a dice value rolls ("1d8 + 2"). */
function DiceFormulaInput({ field }: { field: AgField }) {
  const { request } = useAg();
  const { toast } = useToast();
  return (
    <div className="space-y-1">
      <CommitInput value={field.formula ?? ""} className="w-full h-9 bg-stone-950 border border-stone-700 rounded px-2 font-mono text-sky-200" placeholder="e.g. 1d8 + 2"
        onCommit={(v) => request({ op: "field.update", id: field.id, patch: { formula: v } }).catch((e: any) => toast({ title: "Couldn't change it", description: e.message, variant: "destructive" }))} />
      <div className="text-[11px] text-stone-500">Dice like 2d6 + 3, or roll(1, might_die) + athletics. Press Enter to save.</div>
    </div>
  );
}

/** Inline editor for a field's value, by type. */
export function FieldInput({ field, className = "" }: { field: AgField; className?: string }) {
  const { canEditField } = usePerms(field.noteId);
  const w = useFieldWriter();
  const editable = canEditField(field);
  const v = effOf(field);
  if (field.type === "formula") return <span className={`font-mono ${field.err ? "text-red-400" : "text-amber-200"} ${className}`} title={field.err ?? undefined}>{field.err ? "⚠" : formatValue(v, field.options.decimals)}</span>;
  if (field.type === "dice") return <span className={`font-mono text-sky-300 ${className}`}>{String(v ?? "")}</span>;
  if (!editable) {
    if (field.type === "image") return v ? <img src={String(v)} alt={field.label} className={`max-w-full rounded ${className}`} /> : <span className="text-stone-500">—</span>;
    if (field.type === "boolean") return <span className={className}>{v ? "✓" : "✗"}</span>;
    if (field.options.isColor && typeof v === "string") return <span className={`inline-block h-4 w-6 rounded border border-stone-700 align-middle ${className}`} style={{ background: v }} title={v} />;
    return <span className={className}>{formatValue(v, field.options.decimals)}</span>;
  }
  switch (field.type) {
    case "number": {
      // In a panel (w-full) the box fills it; inline it grows with the number so it's never cut off.
      const wide = /\bw-full\b/.test(className);
      const digits = String(field.value ?? "").length;
      const btn = wide ? "h-9 w-9 grid place-items-center rounded bg-stone-800 hover:bg-stone-700 text-stone-300 shrink-0" : "h-7 w-6 sm:h-6 sm:w-5 grid place-items-center rounded bg-stone-800 hover:bg-stone-700 text-stone-300";
      return (
        <span className={`${wide ? "flex" : "inline-flex"} items-center gap-0.5 ${className}`}>
          <button type="button" onClick={() => w.adjust(field, -(field.options.step ?? 1))} className={btn} aria-label={`Lower ${field.label}`}><Minus className="h-3 w-3" /></button>
          <CommitInput value={field.value as number} type="number" step={field.options.step} className={wide ? "h-9 flex-1 min-w-0 text-center text-base" : "h-7 sm:h-6 text-center"} style={wide ? undefined : { width: `calc(${Math.max(3, digits + 1)}ch + 1.25rem)` }} onCommit={(s) => w.set(field, s === "" ? null : Number(s))} aria-label={field.label} />
          <button type="button" onClick={() => w.adjust(field, field.options.step ?? 1)} className={btn} aria-label={`Raise ${field.label}`}><Plus className="h-3 w-3" /></button>
          {/* Items, wounds and other modifiers change the value in play; the box edits the base. */}
          {typeof v === "number" && typeof field.value === "number" && v !== field.value && (
            <span className={`ml-1 px-1 rounded text-[11px] font-semibold shrink-0 ${v > field.value ? "text-emerald-300 bg-emerald-950/60" : "text-red-300 bg-red-950/60"}`} title={`${formatValue(field.value)} base, ${formatValue(v)} with modifiers`} data-testid={`ag-eff-${field.key}`}>= {formatValue(v)}</span>
          )}
        </span>
      );
    }
    case "boolean":
      return <input type="checkbox" checked={!!v} onChange={(e) => w.set(field, e.target.checked)} className={`h-4 w-4 accent-amber-500 ${className}`} aria-label={field.label} />;
    case "select":
      return (
        <span className={`inline-block min-w-[120px] ${className}`} aria-label={field.label}>
          <PickField value={String(v ?? "")} items={(field.options.choices ?? []).map((c) => ({ id: c, name: c }))} onChange={(c) => w.set(field, c)} title={field.label} placeholder="—" noneLabel="— (none)" emptyText="No choices yet — the GM adds them in the Values tab." />
        </span>
      );
    case "image":
      return <ImageFieldInput field={field} className={className} />;
    case "text":
      if (field.options.isColor) {
        const c = typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "#d4a24c";
        return <input type="color" value={c} onChange={(e) => w.set(field, e.target.value)} className={`h-7 w-10 bg-transparent border border-stone-700 rounded cursor-pointer ${className}`} aria-label={field.label} title={field.label} />;
      }
      return <CommitInput value={String(v ?? "")} className={`h-7 sm:h-6 ${className}`} onCommit={(s) => w.set(field, s)} aria-label={field.label} />;
    default:
      return <CommitInput value={String(v ?? "")} className={`h-7 sm:h-6 ${className}`} onCommit={(s) => w.set(field, s)} aria-label={field.label} />;
  }
}

function ImageFieldInput({ field, className }: { field: AgField; className?: string }) {
  const w = useFieldWriter();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const v = effOf(field);
  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      {v ? <img src={String(v)} alt={field.label} className="max-w-full max-h-48 rounded object-contain" /> : null}
      <button type="button" onClick={() => inputRef.current?.click()} className="h-7 px-2 rounded bg-stone-800 text-xs text-stone-300 inline-flex items-center gap-1">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />} {v ? "Change image" : "Upload image"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy(true);
        try { const url = await uploadImage(file); await w.set(field, url); } finally { setBusy(false); e.target.value = ""; }
      }} />
    </span>
  );
}

export async function uploadImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const { url } = await api.uploadBase64Image(dataUrl);
  return url;
}

/** One field shown the way the GM picked. */
type FieldDisplayProps = {
  noteId: string; refPath: string; maxRef?: string; display: AgFieldDisplay; label?: string; showLabel?: boolean; color?: string;
  params?: Record<string, string>; fontSize?: number; align?: "left" | "center" | "right"; look?: AgLook;
  /** Inside a canvas / card / component item: the item's size decides how big it draws. */
  box?: { w: number; h: number };
  /** The insert's own tooltip is drawn by its block frame, not here. */
  blockTip?: boolean;
  /** No "?" at all (small cards). */
  noTip?: boolean;
};

/** A value, plus a "?" when the value (or this insert) has a tooltip. */
export function FieldDisplay(props: FieldDisplayProps) {
  const { state } = useAg();
  const f = resolveRef(state, props.noteId, props.refPath, props.params)[0];
  const tip = props.noTip ? "" : [f?.options.tooltip, props.blockTip ? null : props.look?.tooltip].filter((x) => x && x.trim()).join("\n\n");
  const core = <FieldDisplayCore {...props} />;
  if (!tip) return core;
  const icon = <TipIcon text={tip} current={f ? formatValue(effOf(f)) : null} size={Math.max(11, Math.round((props.look?.fontSize ?? props.fontSize ?? 14) * 0.85))} />;
  if (props.box) return <span className="flex w-full h-full items-start gap-1"><span className="flex-1 min-w-0 h-full">{core}</span>{icon}</span>;
  if (props.display === "bar") return <span className="flex w-full items-center gap-1"><span className="flex-1 min-w-0">{core}</span>{icon}</span>;
  return <span className="inline-flex items-center gap-1 max-w-full"><span className="min-w-0">{core}</span>{icon}</span>;
}

function FieldDisplayCore({ noteId, refPath, maxRef, display, label, showLabel = true, color, params, fontSize, align, look, box }: FieldDisplayProps) {
  const { state } = useAg();
  const L = mergeLook({ color, fontSize }, look);
  const fields = resolveRef(state, noteId, refPath, params);
  const maxField = maxRef ? resolveRef(state, noteId, maxRef, params)[0] : undefined;
  const field = fields[0];
  if (!field) return <span className="text-stone-600 text-xs" title={`Nothing at "${refPath}" for this viewer`}>—</span>;
  const name = label || field.label;
  // Choice values can carry their own colour (rarity, type…).
  const choiceColor = field.options.choiceColors?.[String(effOf(field) ?? "")];
  let pos = showLabel === false ? "none" : (L.labelPos ?? defaultLabelPos(display));
  if (pos === "inside" && display !== "bar") pos = "left";
  const column = pos === "above" || pos === "below";
  const labelSize = L.fontSize ? Math.max(8, Math.round(L.fontSize * 0.85)) : display === "bar" || display === "pips" || display === "dial" ? 11 : 13;
  const labelH = column && pos !== "none" ? Math.round(labelSize * 1.25) + 2 : 0;
  const labelEl = pos === "none" || pos === "inside" ? null : (
    <span className="leading-tight shrink-0 truncate" style={{ fontSize: L.labelSize ?? labelSize, color: L.labelColor ?? "#a8a29e", fontStyle: L.italic ? "italic" : undefined, maxWidth: "100%", textTransform: L.labelUpper ? "uppercase" : undefined, letterSpacing: L.labelUpper ? "0.12em" : undefined }}>{name}</span>
  );
  const textStyle: React.CSSProperties = { fontSize: L.fontSize, color: L.textColor, fontWeight: L.bold ? 700 : undefined, fontStyle: L.italic ? "italic" : undefined };
  const many = fields.length > 1 ? fields.map((f) => formatValue(effOf(f))).join(", ") : null;
  let body: React.ReactNode;
  switch (display) {
    case "bar": {
      const h = box ? Math.max(4, box.h - labelH) : (L.height ?? 14);
      body = <ResourceBar field={field} maxField={maxField} look={L} label={name} height={L.direction === "up" && !box ? (L.height ?? 120) : h} compact />;
      break;
    }
    case "pips": body = <Pips field={field} maxField={maxField} look={L} size={box ? Math.max(6, Math.min(48, box.h - labelH)) : undefined} />; break;
    case "dial": body = <Dial field={field} maxField={maxField} look={L} size={box ? Math.max(20, Math.min(box.w, box.h - labelH)) : (L.height ?? 56)} />; break;
    case "badge":
      body = (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 border" style={{ borderColor: L.border ?? choiceColor ?? L.color ?? "#78350f", background: choiceColor ? `color-mix(in srgb, ${choiceColor} 14%, transparent)` : "rgba(0,0,0,.35)", borderRadius: L.radius ?? 999, fontSize: L.fontSize ?? 12 }}>
          {pos === "left" && <span style={{ color: L.labelColor ?? "#a8a29e" }}>{name}</span>}
          <EditOnDoubleClick field={many ? undefined : field} empty={!many && formatValue(effOf(field), field.options.decimals) === ""}><span className="font-semibold" style={{ color: L.textColor ?? choiceColor ?? "#f5f5f4", fontStyle: L.italic ? "italic" : undefined, textTransform: L.labelUpper ? "uppercase" : undefined }}>{many ?? formatValue(effOf(field), field.options.decimals)}</span></EditOnDoubleClick>
          {pos === "right" && <span style={{ color: L.labelColor ?? "#a8a29e" }}>{name}</span>}
        </span>
      );
      return <span style={{ textAlign: align, minWidth: L.minWidth }}>{body}</span>;
    case "label": return <span style={{ ...textStyle, color: L.labelColor ?? L.textColor ?? "#a8a29e", textAlign: align }}>{name}</span>;
    case "input": {
      const zoom = L.fontSize ? L.fontSize / 14 : undefined;
      body = <span style={{ zoom, color: L.textColor, fontWeight: L.bold ? 700 : undefined } as React.CSSProperties}><FieldInput field={field} /></span>;
      break;
    }
    default:
      body = (
        <EditOnDoubleClick field={many ? undefined : field} empty={!many && !field.err && formatValue(effOf(field), field.options.decimals) === ""}>
          <span className={`font-semibold ${field.err ? "text-red-400" : "text-stone-100"}`} style={{ ...textStyle, color: field.err ? undefined : (L.textColor ?? choiceColor ?? L.color) }} title={field.err ?? undefined}>
            {field.err ? "\u26a0" : many ?? formatValue(effOf(field), field.options.decimals)}{L.suffix ? <span className="font-normal text-stone-400"> {L.suffix}</span> : null}
            {maxField ? <span className="text-stone-400 font-normal"> / {formatValue(effOf(maxField))}</span> : null}
          </span>
        </EditOnDoubleClick>
      );
  }
  if (L.iconName) {
    // A leading icon, chip-style: icon, then the value (and its label).
    const icon = <AgIcon name={L.iconName} size={Math.round((L.fontSize ?? 14) * 1.15)} color={L.iconColor ?? "#d4a24c"} className="shrink-0" />;
    const inner = labelEl
      // A bar has no width of its own: it stretches across whatever's left.
      ? <span className={`flex min-w-0 ${display === "bar" ? "w-full" : ""}`} style={{ flexDirection: column ? (pos === "above" ? "column" : "column-reverse") : pos === "right" ? "row-reverse" : "row", gap: column ? 0 : 6, alignItems: column ? (display === "bar" ? "stretch" : "flex-start") : "center" }}>{labelEl}<span className={display === "bar" ? (column ? "block w-full" : "flex-1 min-w-0") : ""}>{body}</span></span>
      : body;
    return <span className={`${display === "bar" ? "flex w-full" : "inline-flex"} items-center gap-2 min-w-0`} style={{ minWidth: L.minWidth }}>{icon}<span className={display === "bar" ? "flex flex-1 min-w-0" : "min-w-0"}>{inner}</span></span>;
  }
  if (!labelEl) {
    const fullWidth = display === "bar";
    return <span className={fullWidth ? "block w-full" : "inline-flex items-center"} style={{ textAlign: align, minWidth: L.minWidth }}>{body}</span>;
  }
  const dir = pos === "above" ? "column" : pos === "below" ? "column-reverse" : pos === "right" ? "row-reverse" : "row";
  const grows = display === "bar";
  return (
    <span
      className={grows || column ? "flex w-full" : "inline-flex"}
      style={{ flexDirection: dir, alignItems: column ? (align === "center" ? "center" : align === "right" ? "flex-end" : "stretch") : "center", gap: column ? 2 : 6, minWidth: L.minWidth, justifyContent: !column && pos === "right" ? "flex-end" : undefined }}
    >
      {labelEl}
      <span className={grows ? "flex-1 min-w-0" : column && display !== "dial" && display !== "pips" ? "" : "inline-flex"}>{body}</span>
    </span>
  );
}

// --- actions -------------------------------------------------------------------------------
/** Pressing and holding a roll (or right-clicking it) asks for advantage / disadvantage / a modifier first. */
const HOLD_MS = 450;

/**
 * Pressing a button anywhere (a sheet, a list, the hotbar): asks any "choose"
 * questions first, runs it, posts its rolls (as the character it belongs to)
 * and shows what happened. `askOptions` opens advantage / disadvantage / a
 * modifier first. Render `ui` next to whatever presses it.
 */
export function useActionRunner(actionId: string) {
  const { state, request, scope } = useAg();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<null | { choices: AgActionChoice[]; idx: number; picked: Record<string, string>; mods: AgRollMods }>(null);
  const [asking, setAsking] = useState(false);
  const action = state.actions.get(actionId);
  const { canRun } = usePerms(action?.noteId);
  const allowed = !!action && canRun(actionId);
  const go = async (choices: Record<string, string>, mods: AgRollMods) => {
    if (!action) return;
    setBusy(true);
    try {
      const res = await request<{ result: import("@shared/agnostic/types").AgActionResult; noteName: string; rollerName?: string }>({ op: "action.run", id: actionId, targetNoteIds: getAgTargets(), choices, mods });
      const broadcast = scope.kind === "campaign";
      // A sword's or an ability's roll is the character's roll (their player tracker card shows it).
      const roller = res.rollerName || res.noteName;
      for (const r of res.result.rolls) {
        const label = roller !== res.noteName && !r.label.includes(res.noteName) ? `${res.noteName}: ${r.label}` : r.label;
        triggerRollNotification({
          type: r.name === "initiative" ? "initiative" : "custom", label, result: r.total, total: r.total, username: roller, characterName: roller,
          calculationBreakdown: r.breakdown, customColor: action.color ?? undefined,
          // The working (dice, modifiers, total) goes to chat and roll history, not the popup.
          chatBreakdown: true, hideBreakdown: true,
        }, broadcast);
      }
      if (res.result.messages.length) toast({ title: action.name, description: res.result.messages.join("\n") });
      if (!res.result.rolls.length && !res.result.messages.length && res.result.changes.length) {
        toast({ title: action.name, description: res.result.changes.map((c) => `${state.notes.get(c.noteId)?.name ?? "Sheet"}: ${c.key} ${formatValue(c.from as any)} → ${formatValue(c.to as any)}`).join("\n") });
      }
    } catch (e: any) {
      toast({ title: "Couldn't do that", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const run = async (mods: AgRollMods = {}) => {
    if (!action || !allowed || busy) return;
    // Buttons that ask "which one?" (e.g. which wound a potion heals) get the options first.
    if (action.asks || action.steps?.some((st) => st.type === "choose")) {
      setBusy(true);
      try {
        const { choices } = await request<{ choices: AgActionChoice[] }>({ op: "action.prepare", id: actionId, targetNoteIds: getAgTargets() });
        const empty = choices.find((c) => !c.options.length);
        if (empty) { toast({ title: action.name, description: `Nothing to choose: ${empty.prompt}` }); return; }
        if (!choices.length) { setBusy(false); await go({}, mods); return; }
        setPicking({ choices, idx: 0, picked: {}, mods });
      } catch (e: any) { toast({ title: "Couldn't do that", description: e.message, variant: "destructive" }); }
      finally { setBusy(false); }
      return;
    }
    await go({}, mods);
  };
  const ui = (
    <>
      {asking && action && <RollModsPanel name={action.name} onClose={() => setAsking(false)} onRoll={(mods) => { setAsking(false); void run(mods); }} />}
      {picking && (() => {
        const c = picking.choices[picking.idx];
        return (
          <AgSelector
            title={c.prompt}
            items={c.options.map((o) => ({ id: o.id, name: o.name, image: o.portrait, sub: o.sub }))}
            onClose={() => setPicking(null)}
            onPick={(id) => {
              const picked = { ...picking.picked, [c.name]: id };
              if (picking.idx + 1 < picking.choices.length) setPicking({ ...picking, idx: picking.idx + 1, picked });
              else { setPicking(null); void go(picked, picking.mods); }
            }}
            keepOpen
            testId="ag-action-choose"
          />
        );
      })()}
    </>
  );
  return { action, allowed, busy, run, askOptions: () => { if (allowed) setAsking(true); }, ui };
}

export function ActionButton({ actionId, label, className = "", look, compact }: { actionId: string; label?: string; className?: string; look?: AgLook; compact?: boolean }) {
  const { realViewer, viewer } = useAg();
  const runner = useActionRunner(actionId);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const { action, allowed, busy } = runner;
  if (!action) return realViewer.isGM && !viewer.isGM ? null : realViewer.isGM ? <span className="text-xs text-red-400">[missing action]</span> : null;
  const opts = action.options ?? {};
  const cancelHold = () => { if (hold.current.timer) { clearTimeout(hold.current.timer); hold.current.timer = null; } };
  const showName = opts.showName !== false || (!opts.icon && !look?.iconName);
  const iconEl = busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
    : look?.iconName ? <AgIcon name={look.iconName} size={14} color={look.iconColor} />
    : opts.icon ? (opts.showIcon === false ? null : <RollIcon icon={opts.icon} size={compact ? 14 : 16} color={look?.iconColor} />)
    : look?.icon === false || opts.showIcon === false ? null : <Dices className="h-3.5 w-3.5" />;
  const text = label || action.name;
  return (
    <>
    <button
      type="button"
      onClick={(e) => { if (hold.current.fired) { hold.current.fired = false; e.preventDefault(); return; } void runner.run(); }}
      onPointerDown={(e) => {
        if (!allowed || (e.pointerType === "mouse" && e.button !== 0)) return;
        hold.current.fired = false; cancelHold();
        hold.current.timer = setTimeout(() => { hold.current.fired = true; hold.current.timer = null; runner.askOptions(); }, HOLD_MS);
      }}
      onPointerUp={cancelHold} onPointerLeave={cancelHold} onPointerCancel={cancelHold}
      onContextMenu={(e) => { if (!allowed) return; e.preventDefault(); e.stopPropagation(); cancelHold(); runner.askOptions(); }}
      disabled={!allowed || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md ${showName ? "px-3" : "px-2"} h-8 text-sm font-medium border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation ${className}`}
      style={{
        background: look?.color ?? action.color ?? "#92400e", borderColor: look?.border ?? "rgba(0,0,0,.4)", color: look?.textColor ?? "#fff",
        height: look?.height, minWidth: look?.minWidth, fontSize: look?.fontSize, borderRadius: look?.radius,
        fontWeight: look?.bold ? 700 : undefined, fontStyle: look?.italic ? "italic" : undefined, WebkitTouchCallout: "none",
      }}
      title={allowed ? `${action.name} — hold (or right-click) for advantage, disadvantage or a modifier` : "You can't use this"}
      aria-label={text}
      data-testid={`ag-action-${action.name}`}
    >
      {iconEl}
      {showName && text}
    </button>
    {look?.tooltip && <TipIcon text={look.tooltip} className="ml-1" />}
    {runner.ui}
    </>
  );
}

/** Advantage / disadvantage and a one-off modifier for a single press. */
export function RollModsPanel({ name, onRoll, onClose }: { name: string; onRoll: (mods: AgRollMods) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"adv" | "dis" | null>(null);
  const [bonus, setBonus] = useState(0);
  const [text, setText] = useState("0");
  const set = (n: number) => { const v = Math.max(-999, Math.min(999, Math.round(n))); setBonus(v); setText(String(v)); };
  const opt = (m: "adv" | "dis" | null, label: string, hint: string, color: string) => (
    <button type="button" onClick={() => setMode(m)} className={`flex-1 rounded-lg border px-2 py-2 text-left transition-colors ${mode === m ? "bg-stone-800" : "bg-stone-950/60 hover:bg-stone-800/60"}`} style={{ borderColor: mode === m ? color : "#44403c" }} data-testid={`ag-rollmods-${m ?? "normal"}`}>
      <div className="text-sm font-semibold" style={{ color: mode === m ? color : "#e7e5e4" }}>{label}</div>
      <div className="text-[10px] text-stone-500 leading-tight">{hint}</div>
    </button>
  );
  return (
    <AgPanel title={<span>Roll options — {name}</span>} onClose={onClose} width={380} height={330} testId="ag-rollmods"
      footer={<>
        <button type="button" onClick={onClose} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800" data-testid="ag-rollmods-cancel">Cancel</button>
        <button type="button" onClick={() => onRoll({ mode, bonus })} className="h-9 px-4 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm inline-flex items-center gap-1.5" data-testid="ag-rollmods-roll"><Dices className="h-4 w-4" /> Roll</button>
      </>}>
      <div className="flex gap-1.5">
        {opt("adv", "Advantage", "Roll twice, keep the higher", "#22c55e")}
        {opt(null, "Normal", "One roll", "#d4a24c")}
        {opt("dis", "Disadvantage", "Roll twice, keep the lower", "#ef4444")}
      </div>
      <div>
        <div className="text-[11px] text-stone-400 mb-1">Temporary modifier (this roll only)</div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => set(bonus - 1)} className="h-9 w-9 grid place-items-center rounded border border-stone-700 bg-stone-800 text-stone-200"><Minus className="h-4 w-4" /></button>
          <input value={text} inputMode="numeric" onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n)) setBonus(Math.round(n)); }} onBlur={() => set(bonus)}
            className="h-9 w-20 text-center bg-stone-950 border border-stone-700 rounded text-sm" data-testid="ag-rollmods-bonus" />
          <button type="button" onClick={() => set(bonus + 1)} className="h-9 w-9 grid place-items-center rounded border border-stone-700 bg-stone-800 text-stone-200"><Plus className="h-4 w-4" /></button>
          <div className="flex gap-1 ml-1">{[-2, 2, 5].map((n) => <button key={n} type="button" onClick={() => set(bonus + n)} className="h-9 px-2 rounded bg-stone-800 text-xs text-stone-300">{n > 0 ? `+${n}` : n}</button>)}</div>
        </div>
      </div>
    </AgPanel>
  );
}

// --- notes ------------------------------------------------------------------------------------
export function Portrait({ note, size = 48, radius = 8, className = "" }: { note: AgNote | undefined; size?: number | string; radius?: number; className?: string }) {
  const style: React.CSSProperties = { width: size, height: size, borderRadius: radius };
  if (!note?.portrait) {
    return <div className={`bg-stone-800 border border-stone-700 grid place-items-center text-stone-500 font-semibold ${className}`} style={style}>{(note?.name ?? "?").slice(0, 1).toUpperCase()}</div>;
  }
  return <img src={note.portrait} alt={note.name} className={`object-cover ${className}`} style={style} draggable={false} />;
}

export function NoteChip({ noteId }: { noteId: string }) {
  const { state, openNote } = useAg();
  const note = state.notes.get(noteId);
  if (!note) return <span className="text-stone-500 text-xs">[hidden]</span>;
  return (
    <button type="button" onClick={() => openNote(noteId)} className="inline-flex items-center gap-1 align-middle rounded-full bg-stone-800/90 border border-stone-700 hover:border-amber-600 pl-0.5 pr-2 py-0.5 text-sm text-amber-200" data-testid={`ag-notelink-${noteId}`}>
      <Portrait note={note} size={18} radius={9} />
      {note.name || "Untitled"}
    </button>
  );
}

// Connections tables (and inventories) live in links.tsx.
export { LinksTable } from "./links";

const CHART_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

export function ChartWidget({ noteId, chart, refs, maxRef, params, height = 200, look }: { noteId: string; chart: "bar" | "radar" | "line" | "pie"; refs: string[]; maxRef?: string; params?: Record<string, string>; height?: number; look?: AgLook }) {
  const { state } = useAg();
  const main = look?.color ?? "#f59e0b";
  const ink = look?.textColor ?? "#a8a29e";
  const palette = look?.color ? [main, ...CHART_COLORS.filter((c) => c !== main)] : CHART_COLORS;
  const data = refs.flatMap((r) => resolveRef(state, noteId, r, params).map((f) => ({ name: f.label, value: asNumber(effOf(f) as any) })));
  const max = maxRef ? asNumber(effOf(resolveRef(state, noteId, maxRef, params)[0]) as any) : undefined;
  if (!data.length) return <div className="text-xs text-stone-500 p-2">Pick values to chart.</div>;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        {chart === "radar" ? (
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="#57534e" />
            <PolarAngleAxis dataKey="name" tick={{ fill: look?.textColor ?? "#d6d3d1", fontSize: look?.fontSize ?? 11 }} />
            <PolarRadiusAxis domain={[0, max ?? "auto"]} tick={false} axisLine={false} />
            <Radar dataKey="value" stroke={main} fill={main} fillOpacity={0.35} isAnimationActive={false} />
          </RadarChart>
        ) : chart === "line" ? (
          <LineChart data={data}><XAxis dataKey="name" tick={{ fill: ink, fontSize: look?.fontSize ?? 11 }} /><YAxis domain={[0, max ?? "auto"]} tick={{ fill: ink, fontSize: look?.fontSize ?? 11 }} width={28} /><RTooltip /><Line dataKey="value" stroke={main} isAnimationActive={false} /></LineChart>
        ) : chart === "pie" ? (
          <PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius="80%" label={{ fill: look?.textColor ?? "#e7e5e4", fontSize: look?.fontSize ?? 11 }} isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}</Pie><RTooltip /></PieChart>
        ) : (
          <BarChart data={data}><XAxis dataKey="name" tick={{ fill: ink, fontSize: look?.fontSize ?? 11 }} /><YAxis domain={[0, max ?? "auto"]} tick={{ fill: ink, fontSize: look?.fontSize ?? 11 }} width={28} /><RTooltip /><Bar dataKey="value" isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={look?.color ? main : palette[i % palette.length]} />)}</Bar></BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// --- free layouts (canvas blocks, player tracker cards, components) -----------------------------------
export interface LayoutRenderOpts {
  noteId: string;
  params?: Record<string, string>;
  /** Latest roll for this note (tracker). */
  lastRoll?: { label: string; total: number; ts: number } | null;
  /** Renders a rich-text region item (provided by the sheet editor). */
  renderRegion?: (regionId: string) => React.ReactNode;
  /** Small cards (player tracker, tokens): no "?" tooltips. */
  noTips?: boolean;
}

function showToAllows(aud: AgAudience | undefined, viewer: { userId: string; isGM: boolean }, ownerIds: string[]) {
  return !aud || audienceIncludes(aud, viewer, ownerIds);
}

export function WidgetView({ widget, opts, w, h }: { widget: AgWidget; opts: LayoutRenderOpts; w: number; h: number }) {
  const { state } = useAg();
  const note = state.notes.get(opts.noteId);
  switch (widget.kind) {
    case "field":
      return <div className="w-full h-full flex items-center overflow-hidden" style={{ justifyContent: widget.align === "center" ? "center" : widget.align === "right" ? "flex-end" : "flex-start" }}>
        <FieldDisplay noteId={opts.noteId} refPath={widget.ref} maxRef={widget.maxRef} display={widget.display} label={widget.label} showLabel={widget.showLabel ?? false} color={widget.color} params={opts.params} fontSize={widget.fontSize} align={widget.align} look={widget.look} box={{ w, h }} noTip={opts.noTips} />
      </div>;
    case "text":
      return <div className="w-full h-full overflow-hidden whitespace-pre-wrap leading-tight" style={{ fontSize: widget.fontSize ?? 13, color: widget.color ?? "#e7e5e4", fontWeight: widget.bold ? 700 : 400, textAlign: widget.align }}>{widget.text}</div>;
    case "richtext":
      return <div className="w-full h-full overflow-auto">{opts.renderRegion ? opts.renderRegion(widget.regionId) : null}</div>;
    case "image": {
      const f = widget.ref ? resolveRef(state, opts.noteId, widget.ref, opts.params)[0] : undefined;
      const src = (f ? String(effOf(f) ?? "") : widget.src) || "";
      return src ? <img src={src} alt="" className="w-full h-full" style={{ objectFit: widget.fit ?? "cover", borderRadius: widget.radius ?? 0 }} draggable={false} /> : <div className="w-full h-full bg-stone-800/60 grid place-items-center text-stone-600"><ImageIcon className="h-5 w-5" /></div>;
    }
    case "portrait": return <Portrait note={note} size="100%" radius={widget.radius ?? 8} className="w-full h-full" />;
    case "name": return <div className="w-full h-full truncate font-semibold leading-tight" style={{ fontSize: widget.fontSize ?? 14, color: widget.color ?? "#fde68a", textAlign: widget.align }}>{note?.name}</div>;
    case "button": return <ActionButton actionId={widget.actionId} label={widget.label} className="w-full h-full" look={widget.look ? { ...widget.look, height: undefined } : undefined} />;
    case "chart": return <ChartWidget noteId={opts.noteId} chart={widget.chart} refs={widget.refs} maxRef={widget.maxRef} params={opts.params} height={h} look={widget.look} />;
    case "links": return <div className="w-full h-full overflow-auto"><LinksTable noteId={opts.noteId} label={widget.label} columns={widget.columns} config={widget.config} look={widget.look ? { ...widget.look, height: undefined } : undefined} /></div>;
    case "component": return <ComponentView componentId={widget.componentId} noteId={opts.noteId} bindings={widget.bindings} width={w} lastRoll={opts.lastRoll} />;
    case "shape":
      // A line is just a top border; anything else gets an even border all round.
      // (Never pass borderTop: undefined next to border — React then wipes the top edge.)
      return <div className="w-full h-full" style={{
        background: widget.shape === "line" ? "transparent" : widget.color, borderRadius: widget.shape === "circle" ? "50%" : widget.radius ?? 0,
        opacity: widget.opacity ?? 1,
        ...(widget.shape === "line" ? { borderTop: `2px solid ${widget.color}` } : widget.border ? { border: `2px solid ${widget.border}` } : {}),
      }} />;
    case "icon": return <div className="w-full h-full grid place-items-center"><AgIcon name={widget.name} size={Math.max(8, Math.min(w, h))} color={widget.color ?? "#d4a24c"} /></div>;
    case "lastRoll":
      return opts.lastRoll && Date.now() - opts.lastRoll.ts < 10 * 60_000
        ? <div className="w-full h-full truncate text-[11px] text-stone-300 leading-tight"><Dices className="inline h-3 w-3 mr-0.5 text-amber-400" />{opts.lastRoll.label}: <b className="text-amber-200">{formatValue(opts.lastRoll.total)}</b></div>
        : null;
  }
  return null;
}

/** Render a free layout scaled to fit the available width (keeps the GM's design on phones). */
export function LayoutView({ layout, opts, maxWidth, fit = "width", className = "", maxScale = 1.5 }: { layout: AgLayout; opts: LayoutRenderOpts; maxWidth?: number; fit?: "width" | "none"; className?: string; maxScale?: number }) {
  const { viewer, state } = useAg();
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (fit !== "width" || !ref.current) return;
    const el = ref.current.parentElement!;
    const update = () => {
      const avail = Math.min(el.clientWidth, maxWidth ?? Infinity);
      setScale(avail > 0 ? Math.min(maxScale, avail / layout.width) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.width, fit, maxWidth, maxScale]);
  const owners = state.notes.get(opts.noteId)?.ownerIds ?? [];
  return (
    <div ref={ref} className={className} style={{ width: layout.width * scale, height: layout.height * scale }}>
      {/* zoom, not transform: zoomed layouts snap to whole pixels, so thin borders
          (chips, frames) keep every edge instead of blurring away at odd scales. */}
      <div className="relative" style={{
        width: layout.width, height: layout.height, zoom: scale,
        background: layout.background, border: layout.border ? `1px solid ${layout.border}` : undefined, borderRadius: layout.radius,
      }}>
        {[...layout.items].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)).map((it) => showToAllows(it.showTo, viewer, owners) && (
          <div key={it.id} className="absolute" style={{ left: it.x, top: it.y, width: it.w, height: it.h }}>
            <WidgetView widget={it.widget} opts={opts} w={it.w} h={it.h} />
            {/* Values and buttons draw their own "?"; everything else gets it in its corner. */}
            {!opts.noTips && it.widget.kind !== "field" && it.widget.kind !== "button" && (it.widget as any).look?.tooltip && <span className="absolute top-0.5 right-0.5 z-[2]"><TipIcon text={(it.widget as any).look.tooltip} size={12} /></span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComponentView({ componentId, noteId, bindings, width, lastRoll, maxScale }: { componentId: string; noteId: string; bindings: Record<string, string>; width?: number; lastRoll?: LayoutRenderOpts["lastRoll"]; maxScale?: number }) {
  const { state } = useAg();
  const comp = state.components.get(componentId);
  if (!comp) return <div className="text-xs text-stone-500">[component removed]</div>;
  return <LayoutView layout={comp.layout} opts={{ noteId, params: bindings, lastRoll }} maxWidth={width} maxScale={maxScale} />;
}

/** Every field key on a note + connection paths, for pickers. */
export function useRefOptions(noteId: string) {
  const { state } = useAg();
  return useMemo(() => {
    const own = fieldsOf(state, noteId).map((f) => ({ ref: f.key, label: f.label, type: f.type, via: null as string | null }));
    const via: typeof own = [];
    const seen = new Set<string>();
    for (const link of Array.from(state.links.values())) {
      const pairs: Array<[string, string]> = [];
      if (link.fromNoteId === noteId) pairs.push([link.label, link.toNoteId]);
      if (link.toNoteId === noteId) pairs.push([link.reverseLabel, link.fromNoteId]);
      for (const [label, other] of pairs) {
        for (const f of fieldsOf(state, other)) {
          const ref = `@${label}.${f.key}`;
          if (seen.has(ref)) continue;
          seen.add(ref);
          via.push({ ref, label: `${f.label} (${label})`, type: f.type, via: label });
        }
      }
    }
    return [...own, ...via];
  }, [state, noteId]);
}

