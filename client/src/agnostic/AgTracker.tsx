// The Agnostic player tracker. Unlike the fixed tracker other systems use,
// every card is a layout the GM designs (portrait, bars, values, buttons,
// last roll…), placed where the GM wants it. Values are the live ones —
// change HP anywhere and every card updates instantly.
import React, { useMemo, useState } from "react";
import { Settings2, Plus, Trash2, Copy, ArrowUp, ArrowDown, X } from "lucide-react";
import type { AgCampaignSettings, AgTrackerCard } from "@shared/agnostic/types";
import { DEFAULT_TRACKER_CARD, agTypeLabel } from "@shared/agnostic/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAg, useAgMaybe } from "./hooks";
import { LayoutView } from "./widgets";
import { LayoutEditor } from "./LayoutEditor";
import { ColorInput, RefPicker } from "./pickers";
import type { AgTokenBar } from "@shared/agnostic/types";

export interface RollFeedLike { characterName?: string; label?: string; total?: number; ts?: number; timestamp?: number }

export function cardFor(settings: AgCampaignSettings, noteId: string, type: string): AgTrackerCard {
  const t = settings.tracker;
  const id = t.cardByNote[noteId] ?? t.cardByType[type];
  return t.cards.find((c) => c.id === id) ?? t.cards[0] ?? DEFAULT_TRACKER_CARD;
}

/** Safe to mount before Agnostic has connected: renders nothing until then. */
export function AgTracker(props: { rollFeed?: RollFeedLike[]; isMobile?: boolean; leftOffset?: number }) {
  return useAgMaybe() ? <AgTrackerInner {...props} /> : null;
}

function AgTrackerInner({ rollFeed = [], isMobile, leftOffset }: { rollFeed?: RollFeedLike[]; isMobile?: boolean; leftOffset?: number }) {
  const { state, openNote, viewer } = useAg();
  const [designing, setDesigning] = useState(false);
  const settings = state.settings;
  if (!settings) return null;
  const t = settings.tracker;
  const notes = t.pinned.map((id) => state.notes.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof state.notes.get>>[];
  const scale = (isMobile ? 0.8 : 1) * (t.scale || 1);
  const lastRollOf = (name: string) => {
    const r = [...rollFeed].reverse().find((x) => x.characterName === name);
    return r ? { label: r.label ?? "Roll", total: Number(r.total ?? 0), ts: r.ts ?? r.timestamp ?? Date.now() } : null;
  };
  const vertical = t.placement === "left" || t.placement === "right";
  const pos: React.CSSProperties =
    t.placement === "top" ? { top: 56, left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100vw - 32px)" }
    : t.placement === "bottom" ? { bottom: isMobile ? 132 : 104, left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100vw - 32px)" }
    : t.placement === "left" ? { left: 16, top: leftOffset ?? 240, maxHeight: "calc(100vh - 300px)" }
    : { right: 16, top: 72, maxHeight: "calc(100vh - 200px)" };
  if (!notes.length && !viewer.isGM) return null;
  return (
    <>
      <div className="absolute z-30 pointer-events-auto" style={pos} data-testid="ag-tracker">
        <div className={`flex ${vertical ? "flex-col overflow-y-auto" : "flex-row overflow-x-auto"} gap-2 no-scrollbar p-0.5`} style={{ maxHeight: pos.maxHeight, maxWidth: pos.maxWidth }}>
          {notes.map((n) => {
            const card = cardFor(settings, n.id, n.type);
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                // Cards hold live controls (bars, buttons); only a click on the card itself opens the sheet.
                onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, select, a")) openNote(n.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") openNote(n.id); }}
                className="shrink-0 text-left rounded-[10px] shadow-lg hover:brightness-110 transition cursor-pointer"
                style={{ width: card.layout.width * scale }}
                data-testid={`ag-tracker-card-${n.name}`}
              >
                <LayoutView layout={card.layout} opts={{ noteId: n.id, lastRoll: lastRollOf(n.name) }} maxWidth={card.layout.width * scale} />
              </div>
            );
          })}
          {viewer.isGM && (
            <button type="button" onClick={() => setDesigning(true)} className="shrink-0 self-center h-8 w-8 grid place-items-center rounded-full bg-stone-900/80 border border-stone-700 text-stone-400 hover:text-amber-300" title="Design the tracker" data-testid="ag-tracker-design"><Settings2 className="h-4 w-4" /></button>
          )}
        </div>
      </div>
      {designing && <TrackerDesigner onClose={() => setDesigning(false)} />}
    </>
  );
}

export function TrackerDesigner({ onClose }: { onClose: () => void }) {
  const { state, request } = useAg();
  const { toast } = useToast();
  const settings = state.settings!;
  const t = settings.tracker;
  const [cardId, setCardId] = useState(t.cards[0]?.id ?? "default");
  const card = t.cards.find((c) => c.id === cardId) ?? t.cards[0];
  const sheets = [...state.notes.values()].filter((n) => !n.isTemplate);
  const [previewId, setPreviewId] = useState(t.pinned[0] ?? sheets[0]?.id ?? "");
  const types = useMemo(() => [...new Set(sheets.map((n) => n.type))], [sheets.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-3xl w-[calc(100vw-16px)] max-h-[92vh] overflow-y-auto" onKeyDown={(e) => e.stopPropagation()} data-testid="ag-tracker-designer">
        <DialogHeader><DialogTitle className="text-stone-100">Player tracker</DialogTitle></DialogHeader>
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
          </div>

          <section className="space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-amber-400/90">Shown in the tracker</div>
            {t.pinned.map((id, i) => {
              const n = state.notes.get(id);
              return (
                <div key={id} className="flex items-center gap-2 rounded border border-stone-800 bg-stone-950/60 px-2 py-1">
                  <span className="flex-1 truncate">{n?.name ?? "(deleted)"}</span>
                  <select value={t.cardByNote[id] ?? ""} onChange={(e) => { const m = { ...t.cardByNote }; if (e.target.value) m[id] = e.target.value; else delete m[id]; save({ ...t, cardByNote: m }); }} className="h-7 bg-stone-900 border border-stone-700 rounded px-1 text-xs">
                    <option value="">Card: by kind</option>
                    {t.cards.map((c) => <option key={c.id} value={c.id}>Card: {c.name}</option>)}
                  </select>
                  <button type="button" onClick={() => movePinned(i, -1)} className="h-7 w-7 grid place-items-center text-stone-400"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => movePinned(i, 1)} className="h-7 w-7 grid place-items-center text-stone-400"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => save({ ...t, pinned: t.pinned.filter((x) => x !== id) })} className="h-7 w-7 grid place-items-center text-stone-500 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
            <select value="" onChange={(e) => e.target.value && save({ ...t, pinned: [...t.pinned, e.target.value] })} className="h-8 bg-stone-950 border border-stone-700 rounded px-1 text-xs" data-testid="ag-tracker-add">
              <option value="">+ Add a sheet…</option>
              {sheets.filter((n) => !t.pinned.includes(n.id)).map((n) => <option key={n.id} value={n.id}>{n.name} ({agTypeLabel(n.type)})</option>)}
            </select>
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
                  <select value={previewId} onChange={(e) => setPreviewId(e.target.value)} className="h-7 bg-stone-950 border border-stone-700 rounded px-1 text-stone-200">
                    {sheets.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </div>
                {previewId ? (
                  <LayoutEditor key={card.id} layout={card.layout} allowLastRoll opts={{ noteId: previewId, lastRoll: { label: "Attack", total: 17, ts: Date.now() } }} maxWidth={560}
                    onChange={(layout, final) => { if (final) updateCard({ layout }); }} />
                ) : <div className="text-xs text-stone-500">Create a sheet to design against.</div>}
                <div className="text-[10px] text-stone-500">Bars and values pick fields by key (e.g. <span className="font-mono">hp</span>), so one card works for every sheet that has them. Players only ever see values their permissions allow.</div>
              </div>
            )}
          </section>

          <TokenBarDefaults previewId={previewId} types={types} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Default battlemap bars per kind of sheet (a sheet can override in its Settings). */
function TokenBarDefaults({ previewId, types }: { previewId: string; types: string[] }) {
  const { state, request } = useAg();
  const settings = state.settings!;
  const kinds = [...new Set([...types, ...Object.keys(settings.tokenBarsByType)])];
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
