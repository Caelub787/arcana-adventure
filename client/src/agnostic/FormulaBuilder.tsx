// Formula builder — GMs build formulas by clicking values and functions; the
// text is shown (and editable) but never required. Validated as you type and
// previewed live against the sheet's real values.
import React, { useEffect, useRef, useState } from "react";
import { Calculator, Dices, Check, AlertTriangle, Plus } from "lucide-react";
import { parseFormula, containsDice } from "@shared/agnostic/formula";
import { formatValue } from "@shared/agnostic/formula";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAg } from "./hooks";
import { useRefOptions } from "./widgets";

const FUNCS: Array<[string, string, string]> = [
  ["min(a, b)", "min(", "Smallest"], ["max(a, b)", "max(", "Largest"], ["floor(x)", "floor(", "Round down"], ["ceil(x)", "ceil(", "Round up"],
  ["round(x)", "round(", "Round"], ["abs(x)", "abs(", "Absolute"], ["clamp(x, lo, hi)", "clamp(", "Keep between"], ["if(cond, a, b)", "if(", "If…then…else"],
  ["sum(list)", "sum(", "Total of many"], ["count(list)", "count(", "How many"], ["avg(list)", "avg(", "Average"], ["concat(a, b)", "concat(", "Join text"],
];
const DICE = ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "2d6", "4d6kh3", "1d100"];
const OPS = ["+", "-", "*", "/", "(", ")", ">=", "<=", "==", "&&", "||"];

export function FormulaInput({ noteId, value, onChange, allowDice = false, locals = [], placeholder, autoFocus, testId }: {
  noteId: string; value: string; onChange: (v: string) => void; allowDice?: boolean; locals?: string[]; placeholder?: string; autoFocus?: boolean; testId?: string;
}) {
  const { request, realViewer } = useAg();
  const options = useRefOptions(noteId);
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ value?: any; error?: string } | null>(null);

  let syntax: string | null = null;
  try {
    if (value.trim()) {
      const ast = parseFormula(value);
      if (!allowDice && containsDice(ast)) syntax = "Dice only work in roll buttons";
    }
  } catch (e) { syntax = (e as Error).message; }

  // Live preview against real values (GM only; dice/locals can't be previewed).
  useEffect(() => {
    if (!realViewer.isGM || syntax || !value.trim() || /\$\w/.test(value) || (allowDice && /\d*d\d/.test(value))) { setPreview(null); return; }
    const t = setTimeout(() => {
      request<{ value: any; error?: string }>({ op: "eval", noteId, expr: value }).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [value, noteId, syntax, realViewer.isGM, allowDice, request]);

  const insert = (text: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length, end = el?.selectionEnd ?? value.length;
    const needsSpace = start > 0 && /[\w)]$/.test(value.slice(0, start)) && /^[\w@$(]/.test(text);
    const next = value.slice(0, start) + (needsSpace ? " " : "") + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => { el?.focus(); const p = start + text.length + (needsSpace ? 1 : 0); el?.setSelectionRange(p, p); });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <input
            ref={ref}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={placeholder ?? (allowDice ? "e.g. 1d20 + dex" : "e.g. 10 + con * 2")}
            spellCheck={false}
            className={`w-full h-8 pl-2 pr-7 rounded bg-stone-900 border font-mono text-sm text-stone-100 outline-none ${syntax ? "border-red-700" : "border-stone-700 focus:border-amber-500/70"}`}
            data-testid={testId}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{value.trim() ? (syntax ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> : <Check className="h-3.5 w-3.5 text-emerald-400" />) : null}</span>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="h-8 px-2 rounded bg-stone-800 hover:bg-stone-700 text-xs text-stone-200 inline-flex items-center gap-1 shrink-0" data-testid={testId ? `${testId}-builder` : undefined}><Plus className="h-3.5 w-3.5" /><Calculator className="h-3.5 w-3.5" /></button>
          </PopoverTrigger>
          <PopoverContent className="w-80 max-w-[calc(100vw-24px)] p-2 bg-stone-900 border-stone-700 space-y-2" align="end">
            <Section title="Values">
              <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1">
                {locals.map((l) => <Chip key={l} onClick={() => insert(`$${l}`)} className="text-sky-300">${l}</Chip>)}
                {options.map((o) => <Chip key={o.ref} onClick={() => insert(o.ref.startsWith("@") ? o.ref : o.ref)} title={o.ref}>{o.label}</Chip>)}
                <Chip onClick={() => insert("@target.")} className="text-rose-300" title="The targeted token's sheet (in buttons)">target…</Chip>
                {!options.length && !locals.length && <span className="text-xs text-stone-500">This sheet has no values yet.</span>}
              </div>
            </Section>
            {allowDice && <Section title="Dice"><div className="flex flex-wrap gap-1">{DICE.map((d) => <Chip key={d} onClick={() => insert(d)} className="font-mono text-amber-200"><Dices className="inline h-3 w-3 mr-0.5" />{d}</Chip>)}</div></Section>}
            <Section title="Maths"><div className="flex flex-wrap gap-1">{OPS.map((o) => <Chip key={o} onClick={() => insert(o === "(" || o === ")" ? o : ` ${o} `)} className="font-mono">{o}</Chip>)}</div></Section>
            <Section title="Functions"><div className="grid grid-cols-2 gap-1">{FUNCS.map(([sig, ins, desc]) => <button key={sig} type="button" onClick={() => insert(ins)} className="text-left px-1.5 py-1 rounded hover:bg-stone-800"><div className="font-mono text-xs text-stone-200">{sig}</div><div className="text-[10px] text-stone-500">{desc}</div></button>)}</div></Section>
          </PopoverContent>
        </Popover>
      </div>
      {syntax ? <div className="text-[11px] text-red-400">{syntax}</div>
        : preview ? <div className={`text-[11px] ${preview.error ? "text-red-400" : "text-stone-400"}`}>{preview.error ? `⚠ ${preview.error}` : <>= <b className="text-amber-200">{Array.isArray(preview.value) ? preview.value.map((v: any) => formatValue(v)).join(", ") : formatValue(preview.value)}</b> right now</>}</div>
        : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">{title}</div>{children}</div>;
}
function Chip({ children, onClick, className = "", title }: { children: React.ReactNode; onClick: () => void; className?: string; title?: string }) {
  return <button type="button" title={title} onClick={onClick} className={`px-1.5 h-7 rounded bg-stone-800 hover:bg-stone-700 text-xs text-stone-200 ${className}`}>{children}</button>;
}
