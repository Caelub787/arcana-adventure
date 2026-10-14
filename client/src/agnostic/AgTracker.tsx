// The Agnostic player tracker. Unlike the fixed tracker other systems use,
// every card is a layout the GM designs (portrait, bars, values, buttons,
// last roll…), placed where the GM wants it. Values are the live ones —
// change HP anywhere and every card updates instantly.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Settings2, Plus, Trash2, Copy, ArrowUp, ArrowDown, X, LayoutTemplate, Dices } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import type { AgCampaignSettings, AgTrackerCard } from "@shared/agnostic/types";
import { DEFAULT_TRACKER_CARD, agTypeLabel } from "@shared/agnostic/types";
import { AgPanel, AgSelector, PickField } from "./float";
import { NotePicker, noteItems } from "./pickers";
import { useToast } from "@/hooks/use-toast";
import { useAg, useAgMaybe } from "./hooks";
import { usePlayView } from "./viewMode";
import { LayoutView } from "./widgets";
import { LayoutEditor } from "./LayoutEditor";
import { ColorInput, RefPicker } from "./pickers";
import { LookButton } from "./look";
import { GuideButton } from "./AgGuide";
import type { AgTokenBar } from "@shared/agnostic/types";

/** A roll as the campaign's roll feed carries it (newest first). */
export interface RollFeedLike { id?: string; userId?: string; username?: string; characterName?: string; text?: string; label?: string; total?: number | null; ts?: number; timestamp?: number; dieType?: string; historical?: boolean; breakdown?: string }

export function cardFor(settings: AgCampaignSettings, noteId: string, type: string): AgTrackerCard {
  const t = settings.tracker;
  const id = t.cardByNote[noteId] ?? t.cardByType[type];
  return t.cards.find((c) => c.id === id) ?? t.cards[0] ?? DEFAULT_TRACKER_CARD;
}

/** Safe to mount before Agnostic has connected: renders nothing until then. */
export function AgTracker(props: { rollFeed?: RollFeedLike[]; isMobile?: boolean; leftOffset?: number; rightInset?: number }) {
  return useAgMaybe() ? <AgTrackerInner {...props} /> : null;
}

function AgTrackerInner({ rollFeed = [], isMobile, leftOffset, rightInset = 0 }: { rollFeed?: RollFeedLike[]; isMobile?: boolean; leftOffset?: number; rightInset?: number }) {
  const { state, openNote, viewer, system } = useAg();
  const [designing, setDesigning] = useState(false);
  const [history, setHistory] = useState<string | null>(null);
  // CA Agnostic: the tracker card keeps a roll history button.
  const ca = system === "ca-agnostic";
  const play = usePlayView();
  const settings = state.settings;
  if (!settings) return null;
  const t = settings.tracker;
  const notes = t.pinned.map((id) => state.notes.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof state.notes.get>>[];
  const scale = (isMobile ? 0.8 : 1) * (t.scale || 1);
  // A card's rolls: rolled as that sheet, or by a player who owns it (newest first).
  const rollsOf = (n: AgNote) => rollFeed.filter((r) => r.characterName === n.name || (!!r.userId && n.ownerIds.includes(r.userId)));
  const lastRollOf = (n: AgNote) => {
    const r = rollsOf(n)[0];
    return r ? { label: r.text || r.label || "Roll", total: Number(r.total ?? 0), ts: r.ts ?? r.timestamp ?? Date.now() } : null;
  };
  const tray = t.diceTray !== false;
  // Rolls slide out from the card toward the middle of the screen.
  const trayFrom: TraySide = t.placement === "bottom" ? "above" : t.placement === "left" ? "right" : t.placement === "right" ? "left" : "below";
  const vertical = t.placement === "left" || t.placement === "right";
  const pos: React.CSSProperties =
    t.placement === "top" ? { top: 56, left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100vw - 32px)" }
    : t.placement === "bottom" ? { bottom: isMobile ? 132 : 104, left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100vw - 32px)" }
    : t.placement === "left" ? { left: 16, top: leftOffset ?? 240, maxHeight: "calc(100vh - 300px)" }
    // On phones the map's tool buttons run down the right edge: sit beside them, not on them.
    // …and on a desktop it sits left of the open side panel, never under it.
    : { right: (isMobile ? 64 : 16) + rightInset, top: 72, maxHeight: "calc(100vh - 200px)", maxWidth: isMobile ? "calc(100vw - 132px)" : undefined };
  if (!notes.length && !viewer.isGM) return null;
  return (
    <>
      <div className="absolute z-30 pointer-events-none" style={pos} data-testid="ag-tracker">
        <div className={`flex ${vertical ? "flex-col overflow-y-auto" : "flex-row overflow-x-auto"} gap-2 no-scrollbar p-0.5`}
          style={{ maxHeight: pos.maxHeight, maxWidth: pos.maxWidth }}>
          {notes.map((n) => {
            const card = cardFor(settings, n.id, n.type);
            return (
              <TrackerSlot key={n.id} note={n} rolls={rollsOf(n)} tray={tray} side={trayFrom} accent={card.layout.border} onHistory={ca ? () => setHistory(n.id) : undefined}>
                <div
                  role="button"
                  tabIndex={0}
                  // Cards hold live controls (bars, buttons); only a click on the card itself opens the sheet.
                  onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, select, a")) openNote(n.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter") openNote(n.id); }}
                  className="shrink-0 text-left rounded-[10px] shadow-lg hover:brightness-110 transition cursor-pointer"
                  style={{ width: card.layout.width * scale }}
                  data-testid={`ag-tracker-card-${n.name}`}
                >
                  <LayoutView layout={card.layout} opts={{ noteId: n.id, lastRoll: lastRollOf(n), noTips: true }} maxWidth={card.layout.width * scale} />
                </div>
              </TrackerSlot>
            );
          })}
          {viewer.isGM && !play && (
            <button type="button" onClick={() => setDesigning(true)} className="pointer-events-auto shrink-0 self-center h-8 w-8 grid place-items-center rounded-full bg-stone-900/80 border border-stone-700 text-stone-400 hover:text-amber-300" title="Design the player tracker" data-testid="ag-tracker-design"><Settings2 className="h-4 w-4" /></button>
          )}
        </div>
      </div>
      {designing && <TrackerDesigner onClose={() => setDesigning(false)} />}
      {history && <RollHistory notes={notes} rollsOf={rollsOf} first={history} onClose={() => setHistory(null)} />}
    </>
  );
}

/** Every recent roll by the sheets on the player tracker, with its working; filter by sheet. */
function RollHistory({ notes, rollsOf, onClose, first }: { notes: AgNote[]; rollsOf: (n: AgNote) => RollFeedLike[]; onClose: () => void; first?: string | null }) {
  const [only, setOnly] = useState<string | null>(first ?? null);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ r: RollFeedLike; who: AgNote }> = [];
    for (const n of notes) for (const r of rollsOf(n)) {
      const k = r.id ?? `${r.ts}-${r.total}-${r.text}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ r, who: n });
    }
    return out.sort((a, b) => (b.r.ts ?? b.r.timestamp ?? 0) - (a.r.ts ?? a.r.timestamp ?? 0));
  }, [notes, rollsOf]);
  const shown = only ? rows.filter((x) => x.who.id === only) : rows;
  return (
    <AgPanel title={<span className="inline-flex items-center gap-1.5"><Dices className="h-4 w-4 text-amber-400" />Roll history</span>} onClose={onClose} width={420} height={520} testId="ag-roll-history">
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setOnly(null)} className={`h-7 px-2.5 rounded-full border text-[11px] ${!only ? "border-amber-500 text-amber-200" : "border-stone-700 text-stone-400"}`}>Everyone</button>
        {notes.map((n) => <button key={n.id} type="button" onClick={() => setOnly(n.id)} className={`h-7 px-2.5 rounded-full border text-[11px] ${only === n.id ? "border-amber-500 text-amber-200" : "border-stone-700 text-stone-400"}`}>{n.name || "Untitled"}</button>)}
      </div>
      <div className="space-y-1.5">
        {shown.slice(0, 60).map(({ r, who }, i) => <RollRow key={(r.id ?? "") + i} r={r} who={only ? null : who.name} />)}
        {!shown.length && <div className="text-xs text-stone-500">No rolls yet.</div>}
      </div>
    </AgPanel>
  );
}

const timeOf = (r: RollFeedLike) => { const t = r.ts ?? r.timestamp; return t ? new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; };

/** One roll: what, by whom, its working and its total. */
function RollRow({ r, who, color = "#d4a24c" }: { r: RollFeedLike; who?: string | null; color?: string }) {
  return (
    <div className="rounded-md border border-stone-800 bg-stone-950/60 px-2 py-1.5" data-testid="ag-roll-row">
      <div className="flex items-center gap-2 text-xs">
        <span className="flex-1 min-w-0 truncate text-stone-200">{who && <span className="text-stone-500">{who} · </span>}{r.text || r.label || "Roll"}</span>
        <span className="text-[10px] text-stone-600 shrink-0">{timeOf(r)}</span>
        {r.total !== null && r.total !== undefined && <span className="font-mono font-bold text-sm shrink-0" style={{ color }}>{r.total}</span>}
      </div>
      {r.breakdown && <div className="mt-0.5 font-mono text-[10.5px] leading-snug text-stone-400 break-words" data-testid="ag-roll-working">{r.breakdown}</div>}
    </div>
  );
}

// --------------------------------------------------------------------------- dice tray
// The player tracker is where rolls land: each new roll slides out from its
// card, tumbles for a beat, settles on the total, then tucks away again.
// Hover the card to peek at the last one; click it for the recent rolls.
type TraySide = "below" | "above" | "left" | "right";
const TRAY_W = 150, TRAY_H = 62, REVEAL_MS = 3200;
/** Beside a card (tracker on the left / right) the tray is narrower. */
const TRAY_SIDE_W = 112;

/**
 * What the dice in a roll can show: "1d6" → 1–6, "2d6 + 3" → 2–12 (the dice,
 * before what's added). Read off the roll's working; falls back to its die type.
 */
export function tumbleRange(r: Pick<RollFeedLike, "breakdown" | "dieType" | "text">): [number, number] {
  const src = String(r.breakdown ?? "").split(/\s\((?:advantage|disadvantage)/)[0];
  let lo = 0, hi = 0;
  for (const m of Array.from(src.matchAll(/(\d+)d(\d+)(?:k[hl](\d+))?/g))) {
    const n = Number(m[3] ?? m[1]), sides = Number(m[2]);
    if (n > 0 && sides > 0) { lo += n; hi += n * sides; }
  }
  if (hi > 0) return [lo, hi];
  const faces = parseInt(String(r.dieType ?? "").replace(/^d/i, ""), 10);
  if (faces > 0) return [1, faces];
  const m = /(\d*)d(\d+)/.exec(String(r.text ?? ""));
  if (m) { const n = Number(m[1] || 1), sides = Number(m[2]); return [n, n * sides]; }
  return [1, 20];
}

function TrackerSlot({ note, rolls, tray, side, accent, children, onHistory }: { note: AgNote; rolls: RollFeedLike[]; tray: boolean; side: TraySide; accent?: string; children: React.ReactNode; onHistory?: () => void }) {
  const latest = rolls[0];
  const key = (r?: RollFeedLike) => (r ? r.id ?? `${r.ts}-${r.total}-${r.text ?? r.label}` : undefined);
  const lastSeen = useRef<string | undefined>(key(latest));
  const [shown, setShown] = useState(false);
  const [rolling, setRolling] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const hover = useRef(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>>([]);
  const clear = () => { timers.current.forEach((x) => { clearTimeout(x as any); clearInterval(x as any); }); timers.current = []; };
  useEffect(() => () => clear(), []);
  useEffect(() => {
    const k = key(latest);
    if (!latest || k === lastSeen.current) return;
    lastSeen.current = k;
    if (latest.historical || !tray) return;
    clear();
    setShown(true);
    // Tumble only through numbers the dice could show (a d6 never flashes a 7), then settle on the real total.
    const [lo, hi] = tumbleRange(latest);
    const face = () => lo + Math.floor(Math.random() * (hi - lo + 1));
    if (latest.total !== null && latest.total !== undefined) {
      setRolling(face());
      timers.current.push(setInterval(() => setRolling(face()), 80));
      timers.current.push(setTimeout(() => { clear(); setRolling(null); timers.current.push(setTimeout(() => { if (!hover.current) setShown(false); }, REVEAL_MS - 1000)); }, 1000));
    } else {
      timers.current.push(setTimeout(() => { if (!hover.current) setShown(false); }, REVEAL_MS));
    }
  }, [key(latest)]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = accent && /^#|^rgb/.test(accent) ? accent : "#d4a24c";
  const open = tray && !!latest && (shown || history);
  // The tray is drawn over everything, placed beside the card, so the
  // tracker's scrolling strip can never cut it off.
  const slotRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => { if (slotRef.current) setRect(slotRef.current.getBoundingClientRect()); };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open]);
  const sideways = side === "left" || side === "right";
  const trayW = sideways ? TRAY_SIDE_W : TRAY_W;
  const GAP = 6;
  const trayPos: React.CSSProperties = !rect ? { left: -9999, top: -9999 }
    : side === "below" ? { left: rect.left + rect.width / 2, top: rect.bottom + GAP, transform: "translateX(-50%)" }
    : side === "above" ? { left: rect.left + rect.width / 2, top: rect.top - GAP, transform: "translate(-50%, -100%)" }
    : side === "right" ? { left: rect.right + GAP, top: rect.top + rect.height / 2, transform: "translateY(-50%)" }
    : { left: rect.left - GAP, top: rect.top + rect.height / 2, transform: "translate(-100%, -50%)" };
  const hidden = side === "below" ? "translateY(-12px)" : side === "above" ? "translateY(12px)" : side === "right" ? "translateX(-12px)" : "translateX(12px)";
  return (
    <div ref={slotRef} className="relative shrink-0 pointer-events-auto"
      onMouseEnter={() => { hover.current = true; if (latest) setShown(true); }}
      onMouseLeave={() => { hover.current = false; if (rolling === null) timers.current.push(setTimeout(() => setShown(false), 400)); }}>
      {children}
      {/* Roll history, inside the card's corner. */}
      {onHistory && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onHistory(); }} className="absolute top-0.5 right-0.5 z-[2] h-4 w-4 grid place-items-center rounded bg-black/50 text-stone-400 hover:text-amber-300 hover:bg-black/80" title="Roll history" data-testid={`ag-tracker-history-${note.name}`}>
          <Dices className="h-3 w-3" />
        </button>
      )}
      {tray && latest && createPortal(
        <div className="fixed z-40" style={{ ...trayPos, pointerEvents: open ? "auto" : "none" }}
          onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; if (rolling === null) timers.current.push(setTimeout(() => setShown(false), 400)); }}>
          <button type="button" onClick={(e) => { e.stopPropagation(); setHistory(true); }}
            className="rounded-lg border shadow-lg flex flex-col items-center justify-center px-1.5 py-1 transition-all duration-300 ease-out"
            style={{ width: trayW, minHeight: sideways ? TRAY_H - 6 : TRAY_H, background: "rgba(19,20,28,0.95)", borderColor: color, opacity: open ? 1 : 0, transform: open ? "none" : hidden, boxShadow: rolling !== null ? `0 0 12px 2px color-mix(in srgb, ${color} 55%, transparent)` : undefined }}
            title="Recent rolls" data-testid={`ag-dice-tray-${note.name}`}>
            <span className="text-[10px] text-stone-300 truncate max-w-full leading-tight">{latest.text || latest.label || "Roll"}</span>
            <span className={`text-xl font-bold leading-tight ${rolling !== null ? "animate-pulse" : ""}`} style={{ color }}>{rolling ?? latest.total ?? ""}</span>
          </button>
        </div>,
        document.body,
      )}
      {history && (
        <AgPanel title={<span className="inline-flex items-center gap-1.5"><Dices className="h-4 w-4 text-amber-400" />{note.name || "Sheet"} — recent rolls</span>} onClose={() => setHistory(false)} width={320} height={360} testId="ag-dice-history">
          <div className="space-y-1">
            {/* Roll history and chat are where a roll's working shows (not the tray or the popup). */}
            {rolls.slice(0, 30).map((r, i) => <RollRow key={key(r) ?? i} r={r} color={color} />)}
            {!rolls.length && <div className="text-xs text-stone-500">No rolls yet.</div>}
          </div>
        </AgPanel>
      )}
    </div>
  );
}

export function TrackerDesigner({ onClose }: { onClose: () => void }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const settings = state.settings!;
  const t = settings.tracker;
  const [cardId, setCardId] = useState(t.cards[0]?.id ?? "default");
  const card = t.cards.find((c) => c.id === cardId) ?? t.cards[0];
  const sheets = [...Array.from(state.notes.values())].filter((n) => !n.isTemplate);
  const [previewId, setPreviewId] = useState(t.pinned[0] ?? sheets[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const types = useMemo(() => [...Array.from(new Set(sheets.map((n) => n.type)))], [sheets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next: AgCampaignSettings["tracker"]) =>
    request({ op: "settings.update", settings: { ...settings, tracker: next } }).catch((e) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }));
  const updateCard = (patch: Partial<AgTrackerCard>) => save({ ...t, cards: t.cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)) });
  const newCard = (from?: AgTrackerCard) => {
    const id = Math.random().toString(36).slice(2, 8);
    const c: AgTrackerCard = from ? { ...from, id, name: `${from.name} copy`, layout: JSON.parse(JSON.stringify(from.layout)) } : { id, name: "New card", layout: { width: 180, height: 76, background: "rgba(28,25,23,0.92)", border: "#57534e", radius: 10, items: [] } };
    save({ ...t, cards: [...t.cards, c] });
    setCardId(id);
  };
  const movePinned = (i: number, d: number) => {
    const p = [...t.pinned];
    const j = i + d;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    save({ ...t, pinned: p });
  };

  return (
    <AgPanel title={<span className="inline-flex items-center gap-1">Player tracker <GuideButton compact topic="tracker" /></span>} onClose={onClose} width={780} height={760} testId="ag-tracker-designer">
        <div className="space-y-4 text-stone-200 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs">Where
              <select value={t.placement} onChange={(e) => save({ ...t, placement: e.target.value as any })} className="h-8 bg-stone-950 border border-stone-700 rounded px-1" data-testid="ag-tracker-placement">
                <option value="top">Top</option><option value="left">Left</option><option value="right">Right</option><option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs">Size
              <input type="range" min={0.5} max={1.8} step={0.05} value={t.scale} onChange={(e) => save({ ...t, scale: Number(e.target.value) })} className="w-32" />
              <span className="w-8 text-stone-400">{Math.round(t.scale * 100)}%</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs" title="Each new roll slides out from its card for a moment, like a dice tray">
              <input type="checkbox" checked={t.diceTray !== false} onChange={(e) => save({ ...t, diceTray: e.target.checked })} data-testid="ag-tracker-dicetray" />
              Dice tray (show rolls as they land)
            </label>
          </div>

          <section className="space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-amber-400/90">Shown in the player tracker</div>
            {t.pinned.map((id, i) => {
              const n = state.notes.get(id);
              return (
                <div key={id} className="flex items-center gap-2 rounded border border-stone-800 bg-stone-950/60 px-2 py-1">
                  <span className="flex-1 truncate">{n?.name ?? "(deleted)"}</span>
                  <div className="w-36"><PickField value={t.cardByNote[id] ?? ""} items={t.cards.map((c) => ({ id: c.id, name: c.name, icon: <LayoutTemplate className="h-4 w-4" />, sub: `${c.layout.items.length} items` }))} noneLabel="Card: by kind" placeholder="Card: by kind" title={`Card for ${n?.name ?? "this sheet"}`} onChange={(cid) => { const m = { ...t.cardByNote }; if (cid) m[id] = cid; else delete m[id]; save({ ...t, cardByNote: m }); }} /></div>
                  <button type="button" onClick={() => movePinned(i, -1)} className="h-7 w-7 grid place-items-center text-stone-400"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => movePinned(i, 1)} className="h-7 w-7 grid place-items-center text-stone-400"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => save({ ...t, pinned: t.pinned.filter((x) => x !== id) })} className="h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
            <button type="button" onClick={() => setAdding(true)} className="h-8 px-2.5 rounded bg-stone-800 hover:bg-stone-700 text-xs inline-flex items-center gap-1" data-testid="ag-tracker-add"><Plus className="h-3.5 w-3.5" /> Add sheets…</button>
            {adding && <AgSelector title="Add to the player tracker" keepOpen items={noteItems(sheets.filter((n) => !t.pinned.includes(n.id)))} onPick={(id) => save({ ...t, pinned: [...t.pinned, id] })} onClose={() => setAdding(false)} hint="Click each sheet to add it; this window stays open." emptyText="Every sheet is already in the player tracker." testId="ag-tracker-add-selector" />}
          </section>

          <section className="space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-amber-400/90">Card designs</div>
            <div className="flex flex-wrap gap-1">
              {t.cards.map((c) => <button key={c.id} type="button" onClick={() => setCardId(c.id)} className={`h-8 px-2.5 rounded text-xs ${c.id === card?.id ? "bg-amber-600 text-white" : "bg-stone-800 text-stone-300"}`}>{c.name}</button>)}
              <button type="button" onClick={() => newCard()} className="h-8 px-2 rounded bg-stone-800 text-xs inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New</button>
            </div>
            {card && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input key={card.id} defaultValue={card.name} onBlur={(e) => e.target.value !== card.name && updateCard({ name: e.target.value })} className="h-8 w-40 bg-stone-950 border border-stone-700 rounded px-2 text-sm" />
                  <button type="button" onClick={() => newCard(card)} className="h-8 px-2 rounded bg-stone-800 text-xs inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
                  {t.cards.length > 1 && <button type="button" onClick={() => { save({ ...t, cards: t.cards.filter((c) => c.id !== card.id) }); setCardId(t.cards[0].id); }} className="h-8 px-2 rounded text-xs text-red-300 hover:bg-red-950 inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
                  <span className="text-xs text-stone-400 ml-auto">Used for</span>
                  {types.map((ty) => {
                    const on = (t.cardByType[ty] ?? t.cards[0]?.id) === card.id;
                    return <button key={ty} type="button" onClick={() => save({ ...t, cardByType: { ...t.cardByType, [ty]: card.id } })} className={`h-7 px-2 rounded-full border text-[11px] ${on ? "border-amber-500 text-amber-200" : "border-stone-700 text-stone-400"}`}>{agTypeLabel(ty)}</button>;
                  })}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-400">Preview with
                  <div className="w-44"><NotePicker value={previewId} onChange={(id) => id && setPreviewId(id)} notes={sheets} title="Preview with which sheet?" /></div>
                </div>
                {!previewId && <div className="text-[11px] text-stone-500">No sheets yet, so values show as “—”. You can still design the card.</div>}
                <LayoutEditor key={card.id} layout={card.layout} allowLastRoll opts={{ noteId: previewId, lastRoll: { label: "Attack", total: 17, ts: Date.now() } }} maxWidth={560}
                  onChange={(layout, final) => { if (final) updateCard({ layout }); }} />
                <div className="text-[10px] text-stone-500">Bars and values pick fields by key (e.g. <span className="font-mono">hp</span>), so one card works for every sheet that has them. Players only ever see values their permissions allow.</div>
              </div>
            )}
          </section>

          <TokenBarDefaults previewId={previewId} types={types} />
        </div>
    </AgPanel>
  );
}

/** Default battlemap bars per kind of sheet (a sheet can override in its Settings). */
function TokenBarDefaults({ previewId, types }: { previewId: string; types: string[] }) {
  const { state, request } = useAg();
  const settings = state.settings!;
  const kinds = [...Array.from(new Set([...types, ...Object.keys(settings.tokenBarsByType)]))];
  const save = (type: string, bars: AgTokenBar[]) =>
    request({ op: "settings.update", settings: { ...settings, tokenBarsByType: { ...settings.tokenBarsByType, [type]: bars } } });
  return (
    <section className="space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-amber-400/90">Bars on battlemap tokens (by kind)</div>
      {kinds.map((ty) => {
        const bars = settings.tokenBarsByType[ty] ?? [];
        return (
          <div key={ty} className="rounded border border-stone-800 p-1.5 space-y-1">
            <div className="text-xs text-stone-300">{agTypeLabel(ty)}</div>
            {bars.map((b, i) => (
              <div key={b.id} className="flex flex-wrap items-center gap-1.5">
                {previewId ? <div className="w-32"><RefPicker noteId={previewId} value={b.value} onChange={(value) => save(ty, bars.map((x, j) => (j === i ? { ...x, value } : x)))} /></div>
                  : <input defaultValue={b.value} onBlur={(e) => save(ty, bars.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-7 w-28 bg-stone-950 border border-stone-700 rounded px-1 text-xs" />}
                <span className="text-[11px] text-stone-500">of</span>
                {previewId ? <div className="w-32"><RefPicker noteId={previewId} value={b.max} placeholder="(no max)" onChange={(max) => save(ty, bars.map((x, j) => (j === i ? { ...x, max } : x)))} /></div>
                  : <input defaultValue={b.max ?? ""} onBlur={(e) => save(ty, bars.map((x, j) => (j === i ? { ...x, max: e.target.value || undefined } : x)))} className="h-7 w-28 bg-stone-950 border border-stone-700 rounded px-1 text-xs" />}
                <ColorInput value={b.color} onChange={(color) => save(ty, bars.map((x, j) => (j === i ? { ...x, color } : x)))} />
                <label className="text-[11px] inline-flex items-center gap-1"><input type="checkbox" className="accent-amber-500" checked={!!b.showNumbers} onChange={(e) => save(ty, bars.map((x, j) => (j === i ? { ...x, showNumbers: e.target.checked } : x)))} />numbers</label>
                <LookButton look={b.look} onChange={(look) => save(ty, bars.map((x, j) => (j === i ? { ...x, look } : x)))} kind="tokenBar" title="Bar look: thickness, width, colours, style" />
                <button type="button" onClick={() => save(ty, bars.filter((_, j) => j !== i))} className="h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <button type="button" onClick={() => save(ty, [...bars, { id: Math.random().toString(36).slice(2, 8), value: "hp", max: "hp_max", color: "#16a34a" }])} className="h-7 px-2 rounded bg-stone-800 text-[11px] inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Bar</button>
          </div>
        );
      })}
      <div className="text-[10px] text-stone-500">Any sheet placed on the map shows these bars, linked to its live values.</div>
    </section>
  );
}
