// Every window Agnostic opens is a floating panel: draggable, resizable,
// never blocking the rest of the screen (full-width sheet on phones). This
// file holds the three building blocks everything else uses:
//   AgPanel     — a floating panel with Agnostic styling (replaces dialogs / popovers)
//   AgSelector  — an item-selector-style chooser (search, filter chips, rows)
//   PickField   — a field that shows the current choice and opens an AgSelector
//   useAgConfirm — a floating "are you sure?" (replaces window.confirm)
import React, { useId, useMemo, useRef, useState } from "react";
import { Search, X, Check, Plus, ChevronRight } from "lucide-react";
import { FloatingPanel } from "@/components/ui/floating-panel";

let cascade = 0;
const vw = () => (typeof window !== "undefined" ? window.innerWidth : 1280);
const vh = () => (typeof window !== "undefined" ? window.innerHeight : 800);

export function AgPanel({ title, onClose, children, width = 460, height = 560, footer, testId, panelKey, padded = true, minWidth = 280, minHeight = 160 }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode;
  width?: number; height?: number; footer?: React.ReactNode; testId?: string; panelKey?: string; padded?: boolean; minWidth?: number; minHeight?: number;
}) {
  const id = useId();
  const [pos] = useState(() => {
    const w = Math.min(width, vw() - 24);
    const step = (cascade++ % 6) * 24;
    return { x: Math.max(12, Math.round((vw() - w) / 2) + step - 48), y: Math.max(56, Math.round((vh() - Math.min(height, vh() - 80)) / 3) + step) };
  });
  // The panel is portalled, but React still bubbles its events to whatever opened it
  // (a token would start dragging, a player tracker card would open its sheet…). Stop them here,
  // after the panel's own handlers (bring to front, drag) have run.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span style={{ display: "contents" }} onPointerDown={stop} onMouseDown={stop} onClick={stop} onDoubleClick={stop} onContextMenu={stop} onKeyDown={stop} onWheel={stop} onTouchStart={stop}>
    <FloatingPanel
      open
      onClose={onClose}
      title={<span className="text-amber-100 truncate">{title}</span>}
      panelKey={panelKey ?? `ag-panel-${id}`}
      defaultSize={{ width: Math.min(width, vw() - 24), height: Math.min(height, vh() - 80) }}
      defaultPosition={pos}
      minWidth={Math.min(minWidth, vw() - 24)}
      minHeight={minHeight}
    >
      {/* Keys typed here never reach the map / sheet shortcuts underneath. */}
      <div className="h-full flex flex-col bg-stone-900 text-stone-200 select-text" onKeyDown={(e) => e.stopPropagation()} data-testid={testId}>
        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${padded ? "p-3 space-y-3" : ""}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-stone-800 px-3 py-2 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </FloatingPanel>
    </span>
  );
}

// --------------------------------------------------------------------------- selector
export interface SelItem {
  id: string;
  name: string;
  sub?: React.ReactNode;
  /** Small picture (portrait / item art) or an icon. */
  image?: string | null;
  icon?: React.ReactNode;
  /** Filter chip this row belongs to. */
  group?: string;
  badge?: string;
  /** Extra words the search matches. */
  words?: string;
  mono?: boolean;
}

/** The chooser: search, filter chips, a scrolling list of rows. Click a row to pick it. */
export function AgSelector({ title, items, onPick, onClose, selectedId, keepOpen, noneLabel, actions, emptyText = "Nothing here yet.", searchPlaceholder = "Search…", freeText, testId = "ag-selector", hint }: {
  title: React.ReactNode; items: SelItem[]; onPick: (id: string) => void; onClose: () => void;
  selectedId?: string | null; keepOpen?: boolean;
  /** Adds a first row that clears the choice (onPick("")). */
  noneLabel?: string;
  /** Buttons along the bottom, e.g. "+ New action". */
  actions?: React.ReactNode;
  emptyText?: string; searchPlaceholder?: string;
  /** Offer what was typed as a choice when it matches this test (e.g. @owner.hp). */
  freeText?: (q: string) => string | null;
  testId?: string; hint?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("");
  const groups = useMemo(() => Array.from(new Set(items.map((i) => i.group).filter(Boolean))) as string[], [items]);
  const s = q.trim().toLowerCase();
  const shown = items.filter((i) => (!group || i.group === group) && (!s || `${i.name} ${i.words ?? ""} ${typeof i.sub === "string" ? i.sub : ""} ${i.badge ?? ""}`.toLowerCase().includes(s)));
  const free = freeText && q.trim() ? freeText(q.trim()) : null;
  const pick = (id: string) => { onPick(id); if (!keepOpen) onClose(); };
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <AgPanel title={title} onClose={onClose} width={440} height={560} padded={false} testId={testId} footer={actions}>
      <div className="sticky top-0 z-10 bg-stone-900 px-3 pt-3 pb-2 space-y-2 border-b border-stone-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
          <input ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
            onKeyDown={(e) => { if (e.key === "Enter") { if (free) pick(free); else if (shown[0]) pick(shown[0].id); } }}
            className="w-full h-9 pl-9 pr-8 rounded-md bg-stone-800 border border-stone-700 text-sm text-stone-100 outline-none focus:border-amber-600" data-testid={`${testId}-search`} />
          {q && <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center text-stone-500"><X className="h-3.5 w-3.5" /></button>}
        </div>
        {groups.length > 1 && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {["", ...groups].map((g) => (
              <button key={g || "all"} type="button" onClick={() => setGroup(g)} className={`h-7 px-2.5 rounded-full text-[11px] border shrink-0 ${group === g ? "border-amber-500 text-amber-300 bg-amber-500/10" : "border-stone-700 text-stone-400"}`}>{g || "All"}</button>
            ))}
          </div>
        )}
        {hint && <div className="text-[11px] text-stone-500">{hint}</div>}
      </div>
      <div className="p-3 space-y-1.5">
        {free && (
          <Row onClick={() => pick(free)} icon={<Plus className="h-4 w-4 text-sky-300" />} name={`Use “${free}”`} sub="As typed" testId={`${testId}-free`} />
        )}
        {noneLabel && !s && <Row onClick={() => pick("")} icon={<X className="h-4 w-4 text-stone-500" />} name={noneLabel} active={!selectedId} testId={`${testId}-none`} />}
        {shown.map((i) => (
          <Row key={i.id} onClick={() => pick(i.id)} image={i.image} icon={i.icon} name={i.name} sub={i.sub} badge={i.badge} active={selectedId === i.id} mono={i.mono} testId={`${testId}-item-${i.name}`} />
        ))}
        {!shown.length && !free && <div className="text-center py-8 text-sm text-stone-500">{s ? "Nothing matches." : emptyText}</div>}
      </div>
    </AgPanel>
  );
}

function Row({ onClick, image, icon, name, sub, badge, active, mono, testId }: { onClick: () => void; image?: string | null; icon?: React.ReactNode; name: string; sub?: React.ReactNode; badge?: string; active?: boolean; mono?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${active ? "bg-amber-900/25 border-amber-600" : "bg-stone-800 border-stone-700 hover:border-amber-700"}`} data-testid={testId}>
      {image ? <img src={image} alt="" className="h-9 w-9 rounded object-cover shrink-0" draggable={false} />
        : <span className="h-9 w-9 rounded bg-stone-900 border border-stone-700 grid place-items-center shrink-0 text-amber-400">{icon ?? <span className="text-sm text-stone-500">{name.slice(0, 1).toUpperCase()}</span>}</span>}
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className={`text-sm text-stone-100 truncate ${mono ? "font-mono" : "font-medium"}`}>{name}</span>
          {badge && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-stone-700 text-stone-200 shrink-0">{badge}</span>}
        </span>
        {sub && <span className="block text-xs text-stone-400 truncate">{sub}</span>}
      </span>
      {active ? <Check className="h-4 w-4 text-amber-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-stone-600 shrink-0" />}
    </button>
  );
}

/** Shows the current choice; click to open the selector. */
export function PickField({ value, items, onChange, placeholder = "Choose…", title, noneLabel, actions, display, className = "", testId, freeText, hint, keepOpen, emptyText }: {
  value: string | null | undefined; items: SelItem[]; onChange: (id: string) => void;
  placeholder?: string; title: React.ReactNode; noneLabel?: string; actions?: (close: () => void) => React.ReactNode;
  /** How the current value reads when it isn't one of the items (e.g. a typed reference). */
  display?: string | null; className?: string; testId?: string; freeText?: (q: string) => string | null; hint?: React.ReactNode; keepOpen?: boolean; emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = value ? items.find((i) => i.id === value) : undefined;
  const label = current?.name ?? (value ? display ?? value : null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`h-8 sm:h-7 w-full px-2 rounded border border-stone-700 bg-stone-900 hover:border-amber-700 text-xs text-left text-stone-200 inline-flex items-center justify-between gap-1 ${className}`} data-testid={testId}>
        <span className="truncate">{label ?? <span className="text-stone-500">{value === "" && noneLabel ? noneLabel : placeholder}</span>}</span>
        <Search className="h-3 w-3 text-stone-500 shrink-0" />
      </button>
      {open && (
        <AgSelector title={title} items={items} selectedId={value ?? null} noneLabel={noneLabel} keepOpen={keepOpen} freeText={freeText} hint={hint} emptyText={emptyText}
          onPick={onChange} onClose={() => setOpen(false)} actions={actions?.(() => setOpen(false))} testId={testId ? `${testId}-selector` : undefined} />
      )}
    </>
  );
}

// --------------------------------------------------------------------------- confirm
// A floating "are you sure?" instead of the browser's confirm box.
// agConfirm(...) resolves true/false; AgConfirmHost (mounted with Agnostic) draws it.
type Ask = { text: React.ReactNode; title: string; confirm: string; danger: boolean; resolve: (ok: boolean) => void };
let asks: Ask[] = [];
const askListeners = new Set<() => void>();
let confirmHosts = 0;
export function agConfirm(text: React.ReactNode, opts: { title?: string; confirm?: string; danger?: boolean } = {}): Promise<boolean> {
  if (!confirmHosts) return Promise.resolve(window.confirm(typeof text === "string" ? text : opts.title ?? "Are you sure?"));
  return new Promise((resolve) => {
    asks = [...asks, { text, title: opts.title ?? "Are you sure?", confirm: opts.confirm ?? "Yes", danger: opts.danger ?? true, resolve }];
    askListeners.forEach((l) => l());
  });
}
export function AgConfirmHost() {
  const [, force] = useState(0);
  React.useEffect(() => {
    confirmHosts++;
    const l = () => force((n) => n + 1);
    askListeners.add(l);
    return () => { confirmHosts--; askListeners.delete(l); };
  }, []);
  const a = asks[0];
  if (!a) return null;
  const done = (ok: boolean) => { asks = asks.slice(1); a.resolve(ok); askListeners.forEach((l) => l()); };
  return (
    <AgPanel title={a.title} onClose={() => done(false)} width={380} height={250} testId="ag-confirm"
      footer={<>
        <button type="button" onClick={() => done(false)} className="h-9 px-3 rounded text-sm text-stone-300 hover:bg-stone-800" data-testid="ag-confirm-no">Cancel</button>
        <button type="button" onClick={() => done(true)} className={`h-9 px-4 rounded text-white text-sm ${a.danger ? "bg-red-700 hover:bg-red-600" : "bg-amber-600 hover:bg-amber-500"}`} data-testid="ag-confirm-yes">{a.confirm}</button>
      </>}>
      <div className="text-sm text-stone-300 leading-relaxed">{a.text}</div>
    </AgPanel>
  );
}
