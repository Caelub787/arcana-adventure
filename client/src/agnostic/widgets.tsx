// Presentation widgets. Every one of them reads the single live value from
// the scope store and writes back through ops — the same HP shows (and
// changes) identically on a sheet, the tracker and a battlemap token.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Dices, Image as ImageIcon, Loader2 } from "lucide-react";
import { Bar, BarChart, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Cell } from "recharts";
import type { AgField, AgFieldDisplay, AgLayout, AgLayoutItem, AgWidget, AgNote, AgAudience } from "@shared/agnostic/types";
import { audienceIncludes } from "@shared/agnostic/acl";
import { formatValue, asNumber } from "@shared/agnostic/formula";
import { useAg, resolveRef, effOf, follow, usePerms, fieldsOf } from "./hooks";
import { triggerRollNotification } from "@/components/game/RollNotification";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { pushUndo } from "./undo";

// --- battlemap / tracker targets ("@target" in actions) -----------------------------
let currentTargets: string[] = [];
const targetListeners = new Set<() => void>();
export function setAgTargets(noteIds: string[]) {
  currentTargets = noteIds;
  targetListeners.forEach((l) => l());
}
export function getAgTargets() { return currentTargets; }

// --- field edits ------------------------------------------------------------------------
export function useFieldWriter() {
  const { request, key } = useAg();
  const { toast } = useToast();
  return useMemo(() => {
    const fail = (e: any) => { toast({ title: "Couldn't change it", description: e.message, variant: "destructive" }); throw e; };
    return {
      set: (f: AgField, value: any) => {
        const before = f.value;
        return request({ op: "field.set", id: f.id, value })
          .then(() => pushUndo(key, { label: `${f.label} change`, undo: () => request({ op: "field.set", id: f.id, value: before }) }))
          .catch(fail).catch(() => {});
      },
      adjust: (f: AgField, delta: number) =>
        request({ op: "field.adjust", id: f.id, delta })
          .then(() => pushUndo(key, { label: `${f.label} ${delta > 0 ? "+" : ""}${delta}`, undo: () => request({ op: "field.adjust", id: f.id, delta: -delta }) }))
          .catch(fail).catch(() => {}),
    };
  }, [request, toast, key]);
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
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {/* Portal events still bubble through React to whatever hosts the bar (a token starts a drag on pointerdown) — stop them here. */}
      <PopoverContent className="w-56 p-2 bg-stone-900 border-stone-700" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <div className="text-xs text-stone-400 mb-1.5">{field.label}{max != null ? ` (max ${formatValue(max)})` : ""}</div>
        <div className="flex items-center gap-1">
          {[-5, -1].map((d) => <button key={d} type="button" onClick={() => w.adjust(field, d)} className="h-9 px-2 rounded bg-stone-800 hover:bg-red-900/60 text-sm text-stone-200">{d}</button>)}
          <CommitInput value={field.value as number} type="number" className="h-9 w-16 text-center" onCommit={(s) => w.set(field, s === "" ? null : Number(s))} />
          {[1, 5].map((d) => <button key={d} type="button" onClick={() => w.adjust(field, d)} className="h-9 px-2 rounded bg-stone-800 hover:bg-emerald-900/60 text-sm text-stone-200">+{d}</button>)}
        </div>
        {max != null && (
          <div className="flex gap-1 mt-1.5">
            <button type="button" onClick={() => w.set(field, 0)} className="flex-1 h-7 rounded bg-stone-800 text-xs text-stone-300">0</button>
            <button type="button" onClick={() => w.set(field, max)} className="flex-1 h-7 rounded bg-stone-800 text-xs text-stone-300">Full</button>
          </div>
        )}
        <div className="text-[10px] text-stone-500 mt-1.5">Now {formatValue(v)}</div>
      </PopoverContent>
    </Popover>
  );
}

export function ResourceBar({ field, maxField, color = "#16a34a", label, showNumbers = true, height = 14, compact }: {
  field: AgField; maxField?: AgField; color?: string; label?: string; showNumbers?: boolean; height?: number; compact?: boolean;
}) {
  const { canEditField } = usePerms(field.noteId);
  const cur = asNumber(effOf(field) as any);
  const max = maxField ? asNumber(effOf(maxField) as any) : null;
  const bar = (
    <div
      className={`relative w-full rounded-sm overflow-hidden bg-black/60 border border-black/40 ${canEditField(field) ? "cursor-pointer" : ""}`}
      style={{ height }}
      title={`${label ?? field.label}: ${formatValue(cur)}${max != null ? ` / ${formatValue(max)}` : ""}`}
      data-testid={`ag-bar-${field.key}`}
    >
      <div className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out" style={{ width: `${max != null ? pct(cur, max) : 100}%`, background: color }} />
      {showNumbers && height >= 10 && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-white leading-none" style={{ fontSize: Math.max(8, Math.min(12, height - 3)), textShadow: "0 0 2px #000, 0 0 2px #000" }}>
          {!compact && label ? `${label} ` : ""}{formatValue(cur)}{max != null ? `/${formatValue(max)}` : ""}
        </div>
      )}
    </div>
  );
  return canEditField(field) ? <NumberEditor field={field} max={max}>{bar}</NumberEditor> : bar;
}

function Pips({ field, maxField, color = "#f59e0b" }: { field: AgField; maxField?: AgField; color?: string }) {
  const { canEditField } = usePerms(field.noteId);
  const w = useFieldWriter();
  const cur = Math.round(asNumber(effOf(field) as any));
  const max = Math.min(40, Math.max(1, Math.round(maxField ? asNumber(effOf(maxField) as any) : Math.max(cur, 5))));
  const editable = canEditField(field);
  return (
    <div className="flex flex-wrap gap-1" title={`${field.label}: ${cur}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={!editable}
          onClick={() => w.set(field, i + 1 === cur ? i : i + 1)}
          className="w-3.5 h-3.5 rounded-full border border-black/50 disabled:cursor-default"
          style={{ background: i < cur ? color : "rgba(255,255,255,0.12)" }}
          aria-label={`${field.label} ${i + 1}`}
        />
      ))}
    </div>
  );
}

function Dial({ field, maxField, color = "#38bdf8", size = 56 }: { field: AgField; maxField?: AgField; color?: string; size?: number }) {
  const { canEditField } = usePerms(field.noteId);
  const cur = asNumber(effOf(field) as any);
  const max = maxField ? asNumber(effOf(maxField) as any) : 0;
  const r = size / 2 - 4, c = 2 * Math.PI * r, p = max > 0 ? pct(cur, max) / 100 : 1;
  const dial = (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.12)" strokeWidth={5} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={5} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset .5s" }} />
      </svg>
      <span className="absolute text-xs font-mono text-stone-100">{formatValue(cur)}</span>
    </div>
  );
  return canEditField(field) ? <NumberEditor field={field} max={max || null}><button type="button">{dial}</button></NumberEditor> : dial;
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
    return <span className={className}>{formatValue(v, field.options.decimals)}</span>;
  }
  switch (field.type) {
    case "number":
      return (
        <span className={`inline-flex items-center gap-0.5 ${className}`}>
          <button type="button" onClick={() => w.adjust(field, -(field.options.step ?? 1))} className="h-7 w-6 sm:h-6 sm:w-5 grid place-items-center rounded bg-stone-800 hover:bg-stone-700 text-stone-300" aria-label={`Lower ${field.label}`}><Minus className="h-3 w-3" /></button>
          <CommitInput value={field.value as number} type="number" step={field.options.step} className="h-7 sm:h-6 w-14 text-center" onCommit={(s) => w.set(field, s === "" ? null : Number(s))} aria-label={field.label} />
          <button type="button" onClick={() => w.adjust(field, field.options.step ?? 1)} className="h-7 w-6 sm:h-6 sm:w-5 grid place-items-center rounded bg-stone-800 hover:bg-stone-700 text-stone-300" aria-label={`Raise ${field.label}`}><Plus className="h-3 w-3" /></button>
        </span>
      );
    case "boolean":
      return <input type="checkbox" checked={!!v} onChange={(e) => w.set(field, e.target.checked)} className={`h-4 w-4 accent-amber-500 ${className}`} aria-label={field.label} />;
    case "select":
      return (
        <select value={String(v ?? "")} onChange={(e) => w.set(field, e.target.value)} className={`h-7 sm:h-6 bg-stone-900 border border-stone-700 rounded text-stone-100 px-1 ${className}`} aria-label={field.label}>
          <option value="">—</option>
          {(field.options.choices ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    case "image":
      return <ImageFieldInput field={field} className={className} />;
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
export function FieldDisplay({ noteId, refPath, maxRef, display, label, showLabel = true, color, params, fontSize, align }: {
  noteId: string; refPath: string; maxRef?: string; display: AgFieldDisplay; label?: string; showLabel?: boolean; color?: string;
  params?: Record<string, string>; fontSize?: number; align?: "left" | "center" | "right";
}) {
  const { state } = useAg();
  const fields = resolveRef(state, noteId, refPath, params);
  const maxField = maxRef ? resolveRef(state, noteId, maxRef, params)[0] : undefined;
  const field = fields[0];
  if (!field) return <span className="text-stone-600 text-xs" title={`Nothing at "${refPath}" for this viewer`}>—</span>;
  const name = label || field.label;
  const style: React.CSSProperties = { fontSize, textAlign: align };
  switch (display) {
    case "bar": return <div className="w-full" style={style}>{showLabel && name ? <div className="text-[11px] text-stone-400 mb-0.5">{name}</div> : null}<ResourceBar field={field} maxField={maxField} color={color} /></div>;
    case "pips": return <div style={style}>{showLabel && <div className="text-[11px] text-stone-400 mb-0.5">{name}</div>}<Pips field={field} maxField={maxField} color={color} /></div>;
    case "dial": return <div className="inline-flex flex-col items-center" style={style}><Dial field={field} maxField={maxField} color={color} />{showLabel && <div className="text-[10px] text-stone-400">{name}</div>}</div>;
    case "badge":
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-xs" style={{ borderColor: color ?? "#78350f", background: "rgba(0,0,0,.35)", ...style }}>
          {showLabel && <span className="text-stone-400">{name}</span>}<span className="font-semibold text-stone-100">{fields.length > 1 ? fields.map((f) => formatValue(effOf(f))).join(", ") : formatValue(effOf(field), field.options.decimals)}</span>
        </span>
      );
    case "label": return <span className="text-stone-400" style={style}>{name}</span>;
    case "input":
      return <span className="inline-flex items-center gap-1.5" style={style}>{showLabel && <span className="text-stone-400 text-sm">{name}</span>}<FieldInput field={field} /></span>;
    default:
      return (
        <span className="inline-flex items-baseline gap-1.5" style={{ color, ...style }}>
          {showLabel && <span className="text-stone-400 text-sm">{name}</span>}
          <span className={`font-semibold ${field.err ? "text-red-400" : "text-stone-100"}`} title={field.err ?? undefined}>
            {field.err ? "⚠" : fields.length > 1 ? fields.map((f) => formatValue(effOf(f))).join(", ") : formatValue(effOf(field), field.options.decimals)}
            {maxField ? <span className="text-stone-400 font-normal"> / {formatValue(effOf(maxField))}</span> : null}
          </span>
        </span>
      );
  }
}

// --- actions -------------------------------------------------------------------------------
export function ActionButton({ actionId, label, className = "" }: { actionId: string; label?: string; className?: string }) {
  const { state, request, scope, realViewer, viewer } = useAg();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const action = state.actions.get(actionId);
  const { canRun } = usePerms(action?.noteId);
  if (!action) return realViewer.isGM && !viewer.isGM ? null : realViewer.isGM ? <span className="text-xs text-red-400">[missing action]</span> : null;
  const allowed = canRun(actionId);
  const run = async () => {
    if (!allowed || busy) return;
    setBusy(true);
    try {
      const res = await request<{ result: import("@shared/agnostic/types").AgActionResult; noteName: string }>({ op: "action.run", id: actionId, targetNoteIds: getAgTargets() });
      const broadcast = scope.kind === "campaign";
      for (const r of res.result.rolls) {
        triggerRollNotification({
          type: "custom", label: r.label, result: r.total, total: r.total, username: res.noteName, characterName: res.noteName,
          calculationBreakdown: r.breakdown, customColor: action.color ?? undefined,
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
  return (
    <button
      type="button"
      onClick={run}
      disabled={!allowed || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 h-8 text-sm font-medium border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{ background: action.color ?? "#92400e", borderColor: "rgba(0,0,0,.4)", color: "#fff" }}
      title={allowed ? action.name : "You can't use this"}
      data-testid={`ag-action-${action.name}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Dices className="h-3.5 w-3.5" />}
      {label || action.name}
    </button>
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

/** A table of every sheet connected by `label`, with chosen columns. */
export function LinksTable({ noteId, label, columns }: { noteId: string; label: string; columns: string[] }) {
  const { state, openNote } = useAg();
  const ids = follow(state, noteId, label);
  return (
    <div className="overflow-x-auto rounded border border-stone-700">
      <table className="w-full text-sm">
        <thead className="bg-stone-800/80 text-stone-300">
          <tr><th className="text-left px-2 py-1 font-medium">{label.replace(/_/g, " ") || "Connected"}</th>{columns.map((c) => <th key={c} className="text-left px-2 py-1 font-medium">{c.replace(/_/g, " ")}</th>)}</tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const n = state.notes.get(id)!;
            return (
              <tr key={id} className="border-t border-stone-800 hover:bg-stone-800/40">
                <td className="px-2 py-1"><button type="button" className="inline-flex items-center gap-1.5 text-amber-200 hover:underline" onClick={() => openNote(id)}><Portrait note={n} size={20} radius={4} />{n.name}</button></td>
                {columns.map((c) => { const f = resolveRef(state, id, c)[0]; return <td key={c} className="px-2 py-1">{f ? <FieldInput field={f} /> : <span className="text-stone-600">—</span>}</td>; })}
              </tr>
            );
          })}
          {ids.length === 0 && <tr><td colSpan={columns.length + 1} className="px-2 py-2 text-stone-500 text-xs">Nothing connected as “{label}” yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const CHART_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

export function ChartWidget({ noteId, chart, refs, maxRef, params, height = 200 }: { noteId: string; chart: "bar" | "radar" | "line" | "pie"; refs: string[]; maxRef?: string; params?: Record<string, string>; height?: number }) {
  const { state } = useAg();
  const data = refs.flatMap((r) => resolveRef(state, noteId, r, params).map((f) => ({ name: f.label, value: asNumber(effOf(f) as any) })));
  const max = maxRef ? asNumber(effOf(resolveRef(state, noteId, maxRef, params)[0]) as any) : undefined;
  if (!data.length) return <div className="text-xs text-stone-500 p-2">Pick values to chart.</div>;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        {chart === "radar" ? (
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="#57534e" />
            <PolarAngleAxis dataKey="name" tick={{ fill: "#d6d3d1", fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, max ?? "auto"]} tick={false} axisLine={false} />
            <Radar dataKey="value" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.35} isAnimationActive={false} />
          </RadarChart>
        ) : chart === "line" ? (
          <LineChart data={data}><XAxis dataKey="name" tick={{ fill: "#a8a29e", fontSize: 11 }} /><YAxis domain={[0, max ?? "auto"]} tick={{ fill: "#a8a29e", fontSize: 11 }} width={28} /><RTooltip /><Line dataKey="value" stroke="#f59e0b" isAnimationActive={false} /></LineChart>
        ) : chart === "pie" ? (
          <PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius="80%" label={{ fill: "#e7e5e4", fontSize: 11 }} isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><RTooltip /></PieChart>
        ) : (
          <BarChart data={data}><XAxis dataKey="name" tick={{ fill: "#a8a29e", fontSize: 11 }} /><YAxis domain={[0, max ?? "auto"]} tick={{ fill: "#a8a29e", fontSize: 11 }} width={28} /><RTooltip /><Bar dataKey="value" isAnimationActive={false}>{data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar></BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// --- free layouts (canvas blocks, tracker cards, components) -----------------------------------
export interface LayoutRenderOpts {
  noteId: string;
  params?: Record<string, string>;
  /** Latest roll for this note (tracker). */
  lastRoll?: { label: string; total: number; ts: number } | null;
  /** Renders a rich-text region item (provided by the sheet editor). */
  renderRegion?: (regionId: string) => React.ReactNode;
}

function showToAllows(aud: AgAudience | undefined, viewer: { userId: string; isGM: boolean }, ownerIds: string[]) {
  return !aud || audienceIncludes(aud, viewer, ownerIds);
}

export function WidgetView({ widget, opts, w, h }: { widget: AgWidget; opts: LayoutRenderOpts; w: number; h: number }) {
  const { state } = useAg();
  const note = state.notes.get(opts.noteId);
  switch (widget.kind) {
    case "field":
      if (widget.display === "bar") {
        const f = resolveRef(state, opts.noteId, widget.ref, opts.params)[0];
        const mf = widget.maxRef ? resolveRef(state, opts.noteId, widget.maxRef, opts.params)[0] : undefined;
        return f ? <div className="w-full h-full flex flex-col justify-center">{widget.showLabel && <div className="text-[10px] text-stone-300 leading-none mb-0.5">{widget.label || f.label}</div>}<ResourceBar field={f} maxField={mf} color={widget.color} height={Math.max(6, (widget.showLabel ? h - 12 : h))} compact /></div> : <div className="w-full h-full rounded-sm bg-black/30" />;
      }
      return <div className="w-full h-full flex items-center overflow-hidden" style={{ justifyContent: widget.align === "center" ? "center" : widget.align === "right" ? "flex-end" : "flex-start" }}>
        <FieldDisplay noteId={opts.noteId} refPath={widget.ref} maxRef={widget.maxRef} display={widget.display} label={widget.label} showLabel={widget.showLabel ?? false} color={widget.color} params={opts.params} fontSize={widget.fontSize} align={widget.align} />
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
    case "button": return <ActionButton actionId={widget.actionId} label={widget.label} className="w-full h-full" />;
    case "chart": return <ChartWidget noteId={opts.noteId} chart={widget.chart} refs={widget.refs} maxRef={widget.maxRef} params={opts.params} height={h} />;
    case "links": return <div className="w-full h-full overflow-auto"><LinksTable noteId={opts.noteId} label={widget.label} columns={widget.columns} /></div>;
    case "component": return <ComponentView componentId={widget.componentId} noteId={opts.noteId} bindings={widget.bindings} width={w} lastRoll={opts.lastRoll} />;
    case "shape":
      return <div className="w-full h-full" style={{
        background: widget.shape === "line" ? "transparent" : widget.color, borderRadius: widget.shape === "circle" ? "50%" : widget.radius ?? 0,
        border: widget.border ? `2px solid ${widget.border}` : undefined, opacity: widget.opacity ?? 1,
        borderTop: widget.shape === "line" ? `2px solid ${widget.color}` : undefined,
      }} />;
    case "lastRoll":
      return opts.lastRoll && Date.now() - opts.lastRoll.ts < 10 * 60_000
        ? <div className="w-full h-full truncate text-[11px] text-stone-300 leading-tight"><Dices className="inline h-3 w-3 mr-0.5 text-amber-400" />{opts.lastRoll.label}: <b className="text-amber-200">{formatValue(opts.lastRoll.total)}</b></div>
        : null;
  }
  return null;
}

/** Render a free layout scaled to fit the available width (keeps the GM's design on phones). */
export function LayoutView({ layout, opts, maxWidth, fit = "width", className = "" }: { layout: AgLayout; opts: LayoutRenderOpts; maxWidth?: number; fit?: "width" | "none"; className?: string }) {
  const { viewer, state } = useAg();
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (fit !== "width" || !ref.current) return;
    const el = ref.current.parentElement!;
    const update = () => {
      const avail = Math.min(el.clientWidth, maxWidth ?? Infinity);
      setScale(avail > 0 ? Math.min(1.5, avail / layout.width) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.width, fit, maxWidth]);
  const owners = state.notes.get(opts.noteId)?.ownerIds ?? [];
  return (
    <div ref={ref} className={className} style={{ width: layout.width * scale, height: layout.height * scale }}>
      <div className="relative origin-top-left" style={{
        width: layout.width, height: layout.height, transform: `scale(${scale})`,
        background: layout.background, border: layout.border ? `1px solid ${layout.border}` : undefined, borderRadius: layout.radius,
      }}>
        {[...layout.items].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)).map((it) => showToAllows(it.showTo, viewer, owners) && (
          <div key={it.id} className="absolute" style={{ left: it.x, top: it.y, width: it.w, height: it.h }}>
            <WidgetView widget={it.widget} opts={opts} w={it.w} h={it.h} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComponentView({ componentId, noteId, bindings, width, lastRoll }: { componentId: string; noteId: string; bindings: Record<string, string>; width?: number; lastRoll?: LayoutRenderOpts["lastRoll"] }) {
  const { state } = useAg();
  const comp = state.components.get(componentId);
  if (!comp) return <div className="text-xs text-stone-500">[component removed]</div>;
  return <LayoutView layout={comp.layout} opts={{ noteId, params: bindings, lastRoll }} maxWidth={width} />;
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

