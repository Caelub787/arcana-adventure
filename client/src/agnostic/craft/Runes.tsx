// Rune Making: pick a rune, the item it goes on, the tool that carves or draws
// it and (if any) the ink, then trace its sigil on the item. The guide can be
// hidden — harder to follow, so bonuses come easier. The rune shows on the
// item (and its picture) in the ink's colour and glow, carved or drawn by the tool.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PenTool, Eye, EyeOff, Undo2, Eraser, Sparkles, ArrowLeft, ZoomIn, ZoomOut } from "lucide-react";
import type { AgNote } from "@shared/agnostic/types";
import { traceAccuracy, runeTier, itemMatches, numOf, unpackMetal, runeFit, findRuneSpot, RUNE_FIT_WORDS, RUNE_SIZE_MAX, toolEffectWords, CRAFT_KIND_LABEL, TIER_COLOR, TIER_LABEL, type RuneConfig, type ForgeRole, type RunePlacement } from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { useToast } from "@/hooks/use-toast";
import { valueOn, hasValue, runesOn, qtyOf, toolEffectsOn, craftHand, runeSpaceOn, type CraftState } from "./session";
import { ItemTile, ResultBanner, QuickCraftButton, ChoiceRow, DefStrip, DefCard, useDefs, NotHere, stationNameOf, announceRoll, colorOf, Needs, type CraftOutcome } from "./common";
import { drawSigil, loadImage, runePortrait, weaponPortrait, type MarkStyle, type RuneLook } from "./render";

interface Props { characterId: string; state: CraftState; set: (p: CraftState) => void; playing: boolean; /** Begin crafting (whoever does is the one at the controls). */ start: (p: CraftState) => void; /** The station item it's worked at. */ stationId?: string }
type ScopeState = ReturnType<typeof useAg>["state"];
const FREEHAND = "freehand";
/** Where a freehand rune will go (a plain ring, since there's no sigil to show). */
const FREEHAND_MARK: number[][][] = [Array.from({ length: 25 }, (_, i) => [50 + 40 * Math.cos((i / 24) * Math.PI * 2), 50 + 40 * Math.sin((i / 24) * Math.PI * 2)])];

const parse = <T,>(v: unknown, d: T): T => { if (typeof v !== "string" || !v) return d; try { return JSON.parse(v) as T; } catch { return d; } };
/** How an existing rune on an item looks (from its values). */
export function runeLookOf(state: ScopeState, rune: AgNote): RuneLook {
  const drawn = parse<number[][][]>(valueOn(state, rune.id, "rune_drawn"), []);
  return {
    strokes: drawn.length ? drawn : parse<number[][][]>(valueOn(state, rune.id, "sigil"), []),
    color: String(valueOn(state, rune.id, "rune_color") ?? ""), glow: numOf(valueOn(state, rune.id, "rune_glow")),
    style: (valueOn(state, rune.id, "rune_style") === "Drawn" ? "Drawn" : "Carved") as MarkStyle,
    placement: parse(valueOn(state, rune.id, "placement"), { x: 50, y: 50, s: 30, r: 0 }),
  };
}
/**
 * The item's picture without its runes. A forged weapon keeps how it was built, so it's drawn fresh from that (always
 * as the parts were made, joined as they are now); anything else uses its picture from before its first rune.
 */
const baseOf = (state: ScopeState, item: AgNote | undefined) => {
  if (!item) return null;
  const build = valueOn(state, item.id, "forge_build");
  if (typeof build === "string" && build) { const drawn = buildPicture(build); if (drawn) return drawn; }
  const b = valueOn(state, item.id, "base_portrait");
  return (typeof b === "string" && b) || (hasValue(state, item.id, "base_portrait") ? null : item.portrait) || null;
};
const buildCache = new Map<string, string | null>();
function buildPicture(build: string): string | null {
  if (buildCache.has(build)) return buildCache.get(build)!;
  let out: string | null = null;
  try {
    const b = JSON.parse(build) as { failed?: boolean; parts: Array<{ key: string; label: string; role: ForgeRole; shape: string; color: string; metal: string | null }> };
    out = weaponPortrait(b.parts.map((p) => ({ part: { key: p.key, label: p.label, role: p.role, shape: p.shape }, color: p.color, metal: p.metal ? unpackMetal(p.metal) : null })), 320, { failed: !!b.failed });
  } catch { out = null; }
  buildCache.set(build, out);
  return out;
}

export function RuneTool({ characterId, state: s, set, start, playing, stationId }: Props) {
  const { state, request, scope, openNote } = useAg();
  const { toast } = useToast();
  const defs = useDefs<RuneConfig>("rune", characterId, stationId);
  // Freehand: no rune picked and no guide — whatever the marks come closest to (if close enough) is what takes.
  const freehand = s.rune === FREEHAND;
  const rune = freehand ? null : defs.find((d) => d.defId === s.rune && d.here) ?? null;
  const character = state.notes.get(characterId);
  const inventory = useMemo(() => Array.from(new Set(Array.from(state.links.values()).filter((l) => l.toNoteId === characterId).map((l) => l.fromNoteId)))
    .map((id) => state.notes.get(id)).filter((n): n is AgNote => !!n && n.type === "item" && !n.isTemplate).sort((a, b) => a.name.localeCompare(b.name)), [state, characterId]);
  const inks = inventory.filter((n) => hasValue(state, n.id, "ink_color"));
  const tools = inventory.filter((n) => hasValue(state, n.id, "mark_style"));
  // What a rune can go on: gear, not supplies (inks, tools, materials, ingredients, stations, scrolls).
  const targets = inventory.filter((n) => !["ink_color", "mark_style", "heat_min", "station_for", "teaches"].some((k) => hasValue(state, n.id, k)) && valueOn(state, n.id, "item_type") !== "Ingredient");
  const target = s.target ? state.notes.get(s.target) : undefined;
  const ink = s.ink ? state.notes.get(s.ink) : undefined;
  const tool = s.tool ? state.notes.get(s.tool) : undefined;
  const look = { color: ink ? colorOf(state, ink.id, "ink_color", "#a78bfa") : "", glow: ink ? numOf(valueOn(state, ink.id, "ink_glow")) : 0, style: (tool && valueOn(state, tool.id, "mark_style") === "Drawn" ? "Drawn" : "Carved") as MarkStyle };
  // What the tool in hand can do: how fine a mark it cuts, and the points it
  // lends (or costs) the hand. A plain tool does neither.
  const kit = toolEffectsOn(state, tool?.id);
  const placement: RunePlacement = s.placement ?? { x: 50, y: 50, s: Math.max(34, kit.minRuneSize) };
  const guide = s.guide !== false;
  const strokes: number[][][] = s.strokes ?? [];
  const [busy, setBusy] = useState(false);
  const have = (need: { noteId?: string | null; name: string; qty: number }) => inventory.filter((n) => n.id !== s.target && itemMatches(n, need)).reduce((a, n) => a + qtyOf(state, n.id), 0);
  const toolOk = !rune?.config.tools.length || (!!tool && rune.config.tools.some((t) => itemMatches(tool, t)));
  // Room, not sockets: what stops a rune is the surface it would be cut into.
  const space = target ? runeSpaceOn(state, target.id, kit.minRuneSize) : null;
  const problem = target && space ? runeFit(placement, space.taken, kit.minRuneSize) : null;
  const socketMsg: string | false = !!target && !!space?.full
    ? `${target.name} has no room left for a rune this tool can cut`
    : !!problem && RUNE_FIT_WORDS[problem];
  const missing = rune ? [
    !target && "Pick the item to inscribe",
    socketMsg,
    !toolOk && `Needs a tool: ${rune.config.tools.map((t) => t.name).join(" or ")}`,
    rune.config.needsInk && !ink && "Needs a liquid or ink",
    ...rune.config.ingredients.filter((i) => have(i) < i.qty).map((i) => `Needs ${i.qty}× ${i.name} (you have ${have(i)})`),
  ] : freehand ? [!target && "Pick the item to inscribe", socketMsg] : [];
  const ready = (!!rune || freehand) && !missing.some(Boolean);

  const inscribe = async (mode: "quick" | "game" | "freehand") => {
    if ((!rune && mode !== "freehand") || !target || !character) return;
    setBusy(true);
    try {
      const drawn = mode === "quick" ? rune!.config.sigil : strokes;
      const accuracy = mode === "game" ? traceAccuracy(rune!.config.sigil, strokes) : 0;
      const existing = runesOn(state, target.id).map((r) => runeLookOf(state, r));
      const portrait = await runePortrait(baseOf(state, target), target.name, [...existing, { strokes: drawn, ...look, placement }]);
      const res: CraftOutcome = await request({ op: "craft.rune", characterId, stationId, runeId: rune?.id ?? null, targetId: target.id, inkId: ink?.id ?? null, toolId: tool?.id ?? null, mode, accuracy, guide, strokes: drawn, placement, portrait: portrait || null });
      announceRoll(character.name, res.roll, scope.kind === "campaign");
      start({ stage: "plan", strokes: [], result: { ...res, message: mode === "game" ? `${res.message} (traced ${accuracy}%)` : res.message } });
    } catch (e: any) { toast({ title: "Couldn't inscribe it", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const hand = craftHand(state, characterId, "rune_making", [tool?.id]);
  const handSkill = hand.skill;
  if (s.stage === "trace" && (rune || freehand) && target) {
    const useGuide = !freehand && guide;
    return (
      <div className="space-y-2" data-testid="rune-trace">
        <div className="flex flex-wrap items-center gap-2">
          {playing && <button type="button" onClick={() => set({ stage: "plan" })} className="h-8 px-2 rounded-md border border-stone-700 text-xs text-stone-300 inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
          <span className="text-sm font-bold text-stone-100">{rune ? rune.name : "Freehand rune"} on {target.name}</span>
          <span className="text-[11px] text-stone-400">{look.style}{ink ? ` · ${ink.name}` : " · no ink"} · {freehand ? "no guide" : `guide ${guide ? "on" : "off"}`}</span>
          {!playing && <span className="text-[10px] px-2 py-0.5 rounded-full border border-stone-600 text-stone-300">Watching live</span>}
        </div>
        <TraceCanvas base={baseOf(state, target)} name={target.name} existing={runesOn(state, target.id).map((r) => runeLookOf(state, r))} sigil={rune?.config.sigil ?? []} guide={useGuide} placement={placement} look={look} strokes={strokes} playing={playing} onStrokes={(st) => set({ strokes: st })} skill={handSkill} />
        {playing && <div className="text-[11px] text-stone-400" data-testid="rune-hand">Rune Making {handSkill}{hand.tool ? ` (${hand.own} ${hand.tool > 0 ? "+" : "−"} ${Math.abs(hand.tool)} from ${tool!.name})` : ""}: {HAND_WORDS[handSkill]}</div>}
        {playing && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => set({ strokes: strokes.slice(0, -1) })} disabled={!strokes.length} className="h-9 px-3 rounded-lg border border-stone-700 text-xs text-stone-200 inline-flex items-center gap-1 disabled:opacity-40"><Undo2 className="h-4 w-4" /> Undo</button>
            <button type="button" onClick={() => set({ strokes: [] })} disabled={!strokes.length} className="h-9 px-3 rounded-lg border border-stone-700 text-xs text-stone-200 inline-flex items-center gap-1 disabled:opacity-40"><Eraser className="h-4 w-4" /> Clear</button>
            <button type="button" disabled={busy || !strokes.length} onClick={() => inscribe(freehand ? "freehand" : "game")} className="ml-auto h-10 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-40" data-testid="rune-inscribe"><Sparkles className="h-4 w-4" /> Inscribe</button>
          </div>
        )}
        <div className="text-[11px] text-stone-500">{freehand ? "Draw freely. If your marks come close enough to any rune (60%+) it takes as that rune: 80%+ is fine, 95%+ masterwork. Under 60% nothing takes and nothing is used up." : <>Trace the sigil{guide ? " over the guide" : " from memory"}. {guide ? "With the guide: 60%+ takes, 80%+ is fine, 95%+ masterwork." : "Without the guide: 40%+ takes, 65%+ is fine, 85%+ masterwork."} Under that, the socket is spent with no effect.</>}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <ResultBanner result={s.result} onOpen={openNote} onClose={playing ? () => set({ result: undefined }) : undefined} />
      <DefStrip>
        <DefCard selected={freehand} disabled={!playing} onClick={() => set({ rune: FREEHAND, strokes: [], result: undefined })}
          art={<PenTool className="h-8 w-8 text-stone-400" />} name="Freehand" sub="no scroll needed" testId="rune-freehand" />
        {defs.map((d) => (
          <DefCard key={d.defId} selected={s.rune === d.defId} locked={!d.here} disabled={!playing} onClick={() => set({ rune: d.defId, strokes: [], result: undefined })}
            art={<SigilThumb strokes={d.config.sigil} />} name={d.name} testId={`rune-def-${d.name}`}
            sub={d.here ? (d.config.effect ? `${d.config.effect.key.replace(/_/g, " ")} +${d.config.effect.values.default ?? 0}` : "rune") : <NotHere station={stationNameOf(state, stationId)} />} />
        ))}
      </DefStrip>
      {!rune && !freehand && <div className="text-[11px] text-stone-400">{defs.length ? "Pick a rune you know to trace it over a guide — or " : "You don't know any runes yet (each is learned from a scroll) — "}draw Freehand: if it comes close enough to a rune, it takes.</div>}
      {(rune || freehand) && (
        <>
          <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2 space-y-1.5">
            <ChoiceRow label="On" empty="Nothing to inscribe in the inventory." testId="rune-targets">
              {targets.map((n) => { const k = runeSpaceOn(state, n.id, kit.minRuneSize); return <ItemTile key={n.id} compact note={n} selected={s.target === n.id} disabled={!playing || k.full} onClick={() => set({ target: n.id })} sub={k.label} testId={`rune-target-${n.name}`} />; })}
            </ChoiceRow>
            <ChoiceRow label="Tool" empty="No carving tools or pens.">
              {tools.map((n) => { const e = toolEffectsOn(state, n.id); return <ItemTile key={n.id} compact note={n} selected={s.tool === n.id} disabled={!playing} onClick={() => set({ tool: s.tool === n.id ? undefined : n.id })} sub={[String(valueOn(state, n.id, "mark_style") ?? "Carved"), ...toolEffectWords(e, CRAFT_KIND_LABEL.rune)].join(" · ")} testId={`rune-tool-${n.name}`} />; })}
            </ChoiceRow>
            <ChoiceRow label="Ink" empty="No inks — the rune will be plain.">
              {inks.map((n) => <ItemTile key={n.id} compact note={n} selected={s.ink === n.id} disabled={!playing} color={colorOf(state, n.id, "ink_color", "#a78bfa")} onClick={() => set({ ink: s.ink === n.id ? undefined : n.id })} sub={`glow ${numOf(valueOn(state, n.id, "ink_glow"))}`} testId={`rune-ink-${n.name}`} />)}
            </ChoiceRow>
            {rune && (rune.config.ingredients.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]"><span className="text-[10px] uppercase tracking-wide text-stone-500 w-16">Uses</span>
                {rune.config.ingredients.map((i, k) => { const h = have(i); return <span key={k} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${h >= i.qty ? "bg-emerald-400" : "bg-red-500"}`} />{i.qty}× {i.name} <span className="text-stone-500">({h})</span></span>; })}
              </div>
            )}
            {freehand && <div className="text-[11px] text-stone-500">Whatever the rune you draw needs (ingredients, tool, ink) is checked when it takes.</div>}
          </div>
          {target && (
            <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-stone-500">Where it goes</span>
                {!freehand && <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-stone-300"><input type="checkbox" checked={guide} disabled={!playing} onChange={(e) => set({ guide: e.target.checked })} data-testid="rune-guide" />{guide ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Guide <span className="text-stone-500 hidden sm:inline">(off: harder, bonuses come easier)</span></label>}
              </div>
              <PlacementEditor base={baseOf(state, target)} name={target.name} existing={runesOn(state, target.id).map((r) => runeLookOf(state, r))} sigil={rune?.config.sigil ?? FREEHAND_MARK} placement={placement} look={look} playing={playing} onChange={(p) => set({ placement: p })}
                taken={space?.taken ?? []} minSize={kit.minRuneSize} toolName={tool?.name} />
            </div>
          )}
          {playing && (<>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!ready} onClick={() => start({ stage: "trace", strokes: [], result: undefined })} className="h-9 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40" data-testid="rune-start"><PenTool className="h-4 w-4" /> {freehand ? "Start drawing" : "Start tracing"}</button>
              {rune && <QuickCraftButton kind="rune" characterId={characterId} busy={busy} disabled={!ready} onClick={() => inscribe("quick")} tools={[tool?.id]} />}
            </div>
            <Needs items={missing} />
          </>)}
        </>
      )}
    </div>
  );
}

function SigilThumb({ strokes }: { strokes: number[][][] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const ctx = ref.current?.getContext("2d"); if (!ctx) return; ctx.clearRect(0, 0, 96, 96); drawSigil(ctx, strokes, 48, 48, 80, { color: "#c4b5fd", glow: 40, style: "Drawn", width: 3 }); }, [strokes]);
  return <canvas ref={ref} width={96} height={96} className="h-16 w-16 block" />;
}

function useImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => { let on = true; if (!src) { setImg(null); return; } void loadImage(src).then((i) => on && setImg(i)); return () => { on = false; }; }, [src]);
  return img;
}
function paintItem(ctx: CanvasRenderingContext2D, size: number, img: HTMLImageElement | null, name: string) {
  const g = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size * 0.7); g.addColorStop(0, "#26212b"); g.addColorStop(1, "#09080a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  if (img) { const k = Math.max(size / img.width, size / img.height); ctx.drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k); }
  else { ctx.fillStyle = "rgba(214,211,209,0.1)"; ctx.font = `bold ${size * 0.42}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((name[0] ?? "?").toUpperCase(), size / 2, size / 2); }
}
function placeSigil(ctx: CanvasRenderingContext2D, size: number, r: RuneLook, alpha = 1) {
  ctx.save(); ctx.translate((r.placement.x / 100) * size, (r.placement.y / 100) * size); ctx.rotate(((r.placement.r ?? 0) * Math.PI) / 180);
  drawSigil(ctx, r.strokes, 0, 0, (r.placement.s / 100) * size, { color: r.color, glow: r.glow, style: r.style, alpha });
  ctx.restore();
}

/** Looking at part of the item: how far in (z) and where (cx, cy, in the canvas's own pixels at 1×). */
type View = { z: number; cx: number; cy: number };
/** Into the view's coordinates (draw the item, its runes and the strokes after this). */
function applyView(ctx: CanvasRenderingContext2D, size: number, v: View) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(size / 2, size / 2); ctx.scale(v.z, v.z); ctx.translate(-v.cx, -v.cy); }
/** A point on the canvas (on screen) to the item's own pixels. */
function unview(e: React.PointerEvent<HTMLCanvasElement>, size: number, v: View) { const r = e.currentTarget.getBoundingClientRect(); const sx = ((e.clientX - r.left) / r.width) * size, sy = ((e.clientY - r.top) / r.height) * size; return [(sx - size / 2) / v.z + v.cx, (sy - size / 2) / v.z + v.cy] as const; }
/** Close enough in that the rune's circle fills most of the view, wherever it sits on the item. */
const fitZoom = (p: RuneLook["placement"]) => Math.max(1, Math.min(10, 0.68 / Math.max(0.04, p.s / 100)));
function ZoomButtons({ zoom, setZoom, testId }: { zoom: number; setZoom: (z: number) => void; testId: string }) {
  const btn = "h-9 w-9 rounded-md border border-stone-700 bg-stone-900/90 text-stone-200 grid place-items-center active:bg-stone-700";
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1" data-testid={testId}>
      <button type="button" className={btn} onClick={() => setZoom(Math.min(10, zoom * 1.5))} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
      <button type="button" className={btn} onClick={() => setZoom(Math.max(1, zoom / 1.5))} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
    </div>
  );
}

/**
 * Where the rune goes: drag it about on the item's picture (zoom in for small
 * items); size and turn below. A rune has to sit on the item and clear of every
 * rune already cut there, and it can be no finer than the tool can cut, so the
 * ring turns red and says what's wrong rather than letting it be inscribed.
 */
function PlacementEditor({ base, name, existing, sigil, placement, look, playing, onChange, taken, minSize, toolName }: { base: string | null; name: string; existing: RuneLook[]; sigil: number[][][]; placement: RuneLook["placement"]; look: Omit<RuneLook, "strokes" | "placement">; playing: boolean; onChange: (p: RuneLook["placement"]) => void; taken: RunePlacement[]; minSize: number; toolName?: string }) {
  const S = 360;
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useImage(base);
  const [zoom, setZoom] = useState(1);
  const [local, setLocal] = useState<RuneLook["placement"] | null>(null);
  const pl = local ?? placement;
  const view: View = zoom <= 1 ? { z: 1, cx: S / 2, cy: S / 2 } : { z: zoom, cx: (pl.x / 100) * S, cy: (pl.y / 100) * S };
  const dragging = useRef(false), lastSend = useRef(0);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d"); if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#09080a"; ctx.fillRect(0, 0, S, S);
    applyView(ctx, S, view);
    paintItem(ctx, S, img, name);
    for (const r of existing) placeSigil(ctx, S, r);
    placeSigil(ctx, S, { strokes: sigil, ...look, color: look.color || "#c4b5fd", style: "Drawn", glow: 30, placement: pl }, 0.7);
    // The room each rune already there takes up, so it's clear what's in the way.
    ctx.setLineDash([3 / view.z, 5 / view.z]); ctx.lineWidth = 1 / view.z; ctx.strokeStyle = "rgba(168,162,158,0.5)";
    for (const t of taken) { ctx.beginPath(); ctx.arc((t.x / 100) * S, (t.y / 100) * S, (t.s / 100) * S * 0.5, 0, Math.PI * 2); ctx.stroke(); }
    const bad = runeFit(pl, taken, minSize);
    ctx.strokeStyle = bad ? "rgba(248,113,113,0.95)" : "rgba(251,191,36,0.8)"; ctx.setLineDash([4 / view.z, 4 / view.z]); ctx.lineWidth = 1.5 / view.z;
    ctx.beginPath(); ctx.arc((pl.x / 100) * S, (pl.y / 100) * S, (pl.s / 100) * S * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  });
  const bad = runeFit(pl, taken, minSize);
  // Somewhere it would fit, when where it's been put won't do. A rune too fine
  // for the tool is grown to what the tool can cut first, then found room for.
  const room = bad ? findRuneSpot(bad === "tooSmall" ? { ...pl, s: minSize } : pl, taken, minSize) : null;
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const [x, y] = unview(e, S, { ...view, cx: zoom <= 1 ? S / 2 : view.cx, cy: zoom <= 1 ? S / 2 : view.cy });
    const next = { ...pl, x: Math.round(Math.max(2, Math.min(98, (x / S) * 100)) * 10) / 10, y: Math.round(Math.max(2, Math.min(98, (y / S) * 100)) * 10) / 10 };
    setLocal(next);
    const now = performance.now(); if (now - lastSend.current > 90) { lastSend.current = now; onChange(next); }
  };
  const end = () => { if (!dragging.current) return; dragging.current = false; if (local) onChange(local); setLocal(null); };
  return (
    <div className="space-y-2" data-testid="rune-placement-editor">
      <div className="relative mx-auto max-w-[360px]">
        <canvas ref={ref} width={S} height={S} className={`w-full block rounded-lg border border-stone-700 touch-none select-none ${playing ? "cursor-move" : ""}`} data-testid="rune-placement-canvas"
          onPointerDown={(e) => { if (!playing) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; move(e); }}
          onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
        <ZoomButtons zoom={zoom} setZoom={setZoom} testId="rune-placement-zoom" />
        {playing && <div className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-stone-200">Drag to place it{zoom > 1 ? ` · ${zoom.toFixed(1)}×` : ""}</div>}
      </div>
      <div className="space-y-1.5 text-xs max-w-[360px] mx-auto">
        {(["s", "r"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2"><span className="w-10 text-stone-400">{k === "s" ? "Size" : "Turn"}</span>
            <input type="range" min={k === "s" ? minSize : -180} max={k === "s" ? RUNE_SIZE_MAX : 180} value={Math.max(pl[k] ?? 0, k === "s" ? minSize : -180)} disabled={!playing} onChange={(e) => onChange({ ...pl, [k]: Number(e.target.value) })} className="flex-1 accent-amber-500 h-6" data-testid={`rune-placement-${k}`} />
            <span className="w-8 text-right text-stone-500">{Math.round(pl[k] ?? 0)}{k === "s" ? "%" : "°"}</span></label>
        ))}
        {playing && (bad ? (
          <div className="flex items-center gap-2 text-[11px] text-red-300" data-testid="rune-placement-problem">
            <span>{RUNE_FIT_WORDS[bad]}{bad === "tooSmall" && toolName ? ` — ${toolName} can't go finer than ${minSize}%` : ""}</span>
            {room && <button type="button" onClick={() => onChange(room)} className="ml-auto h-6 px-2 rounded-md border border-stone-600 text-stone-200 shrink-0" data-testid="rune-placement-findroom">{bad === "tooSmall" ? `Cut it at ${minSize}%` : "Find room"}</button>}
          </div>
        ) : (
          <div className="text-[11px] text-stone-500" data-testid="rune-placement-ok">It fits here{minSize > 4 && toolName ? ` · ${toolName} cuts down to ${minSize}%` : ""}</div>
        ))}
      </div>
    </div>
  );
}

/** The tracing surface: zoomed in on where the rune goes (it fills the view, however small it is on the item) — the
 *  item, its runes, the guide and the strokes, live. Zoom in or out with the buttons. */
/** How unsteady a rune maker's hand is, by Rune Making (0–4): how far the pen tip wanders (in the sigil's 0–100), and how
 *  quickly it catches up with where they're aiming. At 4 it goes exactly where you draw. */
const HAND = [{ wobble: 9, follow: 0.14 }, { wobble: 6.5, follow: 0.22 }, { wobble: 4, follow: 0.32 }, { wobble: 2, follow: 0.5 }, { wobble: 0, follow: 1 }];
export const HAND_WORDS = ["Shaky: the pen wanders and lags behind your hand.", "Unsteady: the pen wanders a fair bit.", "Practised: a little wobble.", "Skilled: barely a tremor.", "Master: the pen goes exactly where you draw."];

/** The tracing surface: zoomed in on where the rune goes (it fills the view, however small it is on the item) — the
 *  item, its runes, the guide and the strokes, live. The ink comes from the pen's tip, which an unskilled hand can't hold
 *  steady (it trails and wobbles); on a touch screen the pen is held just above the finger, so you can see its tip. */
function TraceCanvas({ base, name, existing, sigil, guide, placement, look, strokes, playing, onStrokes, skill }: {
  base: string | null; name: string; existing: RuneLook[]; sigil: number[][][]; guide: boolean; placement: RuneLook["placement"]; look: Omit<RuneLook, "strokes" | "placement">;
  strokes: number[][][]; playing: boolean; onStrokes: (s: number[][][]) => void; skill: number;
}) {
  const S = 520;
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useImage(base);
  const current = useRef<number[][] | null>(null);
  const lastSync = useRef(0);
  const local = useRef(strokes);
  const [zoomMul, setZoomMul] = useState(1);
  const zoom = Math.max(1, Math.min(14, fitZoom(placement) * zoomMul));
  const view: View = { z: zoom, cx: (placement.x / 100) * S, cy: (placement.y / 100) * S };
  const viewRef = useRef(view); viewRef.current = view;
  const hand = HAND[Math.max(0, Math.min(4, Math.floor(skill)))];
  // The pen: where it's aimed (sigil units), where its tip is, whether it's down, and its tremor's phases.
  const pen = useRef({ aim: null as null | number[], tip: null as null | number[], down: false, touch: false, finger: null as null | number[], ph: [Math.random() * 9, Math.random() * 9, Math.random() * 9, Math.random() * 9] });
  useEffect(() => { if (!current.current) local.current = strokes; }, [strokes]);

  const geo = () => ({ cx: (placement.x / 100) * S, cy: (placement.y / 100) * S, sz: (placement.s / 100) * S, a: ((placement.r ?? 0) * Math.PI) / 180 });
  /** The item's pixels to the sigil's 0–100, and back. */
  const toSig = (px: number, py: number) => { const { cx, cy, sz, a } = geo(); const dx = px - cx, dy = py - cy; const rx = dx * Math.cos(-a) - dy * Math.sin(-a), ry = dx * Math.sin(-a) + dy * Math.cos(-a); return [50 + (rx / sz) * 100, 50 + (ry / sz) * 100]; };
  const fromSig = (x: number, y: number) => { const { cx, cy, sz, a } = geo(); const rx = ((x - 50) / 100) * sz, ry = ((y - 50) / 100) * sz; return [cx + rx * Math.cos(a) - ry * Math.sin(a), cy + rx * Math.sin(a) + ry * Math.cos(a)]; };
  /** Where a pointer aims, in sigil units (a finger aims a little above itself, where the pen's tip is). */
  const aimOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const lift = e.pointerType === "touch" ? (56 * S) / r.width : 0;
    const v = viewRef.current;
    const sx = ((e.clientX - r.left) / r.width) * S, sy = ((e.clientY - r.top) / r.height) * S - lift;
    pen.current.finger = [((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S];
    return toSig((sx - S / 2) / v.z + v.cx, (sy - S / 2) / v.z + v.cy);
  };

  useEffect(() => {
    let raf = 0, last = performance.now();
    const f = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const P = pen.current;
      // The tip follows the aim (a shaky hand lags) and trembles; the ink is laid where the tip is.
      if (P.aim) {
        if (!P.tip) P.tip = [...P.aim];
        const k = 1 - Math.pow(1 - hand.follow, dt * 60);
        P.tip = [P.tip[0] + (P.aim[0] - P.tip[0]) * k, P.tip[1] + (P.aim[1] - P.tip[1]) * k];
      }
      const ts = t / 1000;
      const wob = [hand.wobble * (Math.sin(ts * 2.3 + P.ph[0]) * 0.7 + Math.sin(ts * 5.7 + P.ph[1]) * 0.3), hand.wobble * (Math.sin(ts * 1.9 + P.ph[2]) * 0.7 + Math.sin(ts * 6.1 + P.ph[3]) * 0.3)];
      const ink = P.tip ? [Math.round((P.tip[0] + wob[0]) * 10) / 10, Math.round((P.tip[1] + wob[1]) * 10) / 10] : null;
      if (P.down && ink && current.current) {
        const lastPt = current.current[current.current.length - 1];
        if (!lastPt || Math.hypot(ink[0] - lastPt[0], ink[1] - lastPt[1]) > 0.5) current.current.push(ink);
        if (t - lastSync.current > 150) { lastSync.current = t; onStrokes([...local.current, current.current]); }
      }
      const ctx = ref.current?.getContext("2d");
      if (ctx) {
        const v = viewRef.current;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#09080a"; ctx.fillRect(0, 0, S, S);
        applyView(ctx, S, v);
        paintItem(ctx, S, img, name);
        for (const r of existing) placeSigil(ctx, S, r);
        const { cx, cy, sz } = geo();
        ctx.save(); ctx.strokeStyle = "rgba(167,139,250,0.35)"; ctx.lineWidth = 1.5 / v.z; ctx.setLineDash([4 / v.z, 6 / v.z]); ctx.beginPath(); ctx.arc(cx, cy, sz * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        if (guide) {
          const pulse = 0.35 + 0.15 * Math.sin(t / 400);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(((placement.r ?? 0) * Math.PI) / 180);
          drawSigil(ctx, sigil, 0, 0, sz, { color: "#e9d5ff", glow: 30, style: "Drawn", alpha: pulse, width: Math.max(2 / v.z, sz / 30) });
          ctx.restore();
        }
        const all = current.current ? [...local.current, current.current] : local.current;
        if (all.length) placeSigil(ctx, S, { strokes: all, ...look, placement });
        // The pen, at its tip (on screen, unzoomed).
        if (playing && ink && (P.down || P.aim)) {
          const [ix, iy] = fromSig(ink[0], ink[1]);
          const sx = (ix - v.cx) * v.z + S / 2, sy = (iy - v.cy) * v.z + S / 2;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (P.touch && P.finger && P.down) { ctx.strokeStyle = "rgba(214,211,209,0.25)"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.finger[0], P.finger[1]); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]); }
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(-Math.PI / 4);
          ctx.fillStyle = look.style === "Carved" ? "#a8a29e" : "#d6d3d1";
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, 5); ctx.lineTo(7, 46); ctx.lineTo(-7, 46); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill();
          ctx.fillStyle = look.color || "#c4b5fd"; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [img, name, existing, sigil, guide, placement, look, hand, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const lift = () => {
    const P = pen.current;
    P.down = false; P.aim = null; P.tip = null;
    if (!current.current) return;
    const st = current.current; current.current = null;
    if (st.length > 1) { local.current = [...local.current, st]; onStrokes(local.current); }
  };
  return (
    <div className="relative rounded-xl overflow-hidden border border-stone-700 mx-auto max-w-[520px]">
      <canvas ref={ref} width={S} height={S} className={`w-full block touch-none select-none ${playing ? "cursor-none" : ""}`} data-testid="rune-canvas"
        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }} onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => { if (!playing) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const P = pen.current; P.touch = e.pointerType === "touch"; P.aim = aimOf(e); P.tip = [...P.aim]; P.down = true; current.current = []; }}
        onPointerMove={(e) => { if (!playing) return; const P = pen.current; if (!P.down && e.pointerType === "touch") return; P.touch = e.pointerType === "touch"; P.aim = aimOf(e); }}
        onPointerUp={lift} onPointerCancel={lift} onLostPointerCapture={() => { if (pen.current.down) lift(); }}
        onPointerLeave={() => { if (!pen.current.down) { pen.current.aim = null; pen.current.tip = null; } }}
      />
      <ZoomButtons zoom={zoomMul} setZoom={(z) => setZoomMul(Math.max(1 / fitZoom(placement), Math.min(3, z)))} testId="rune-trace-zoom" />
      <div className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-stone-200">{zoom.toFixed(1)}×</div>
      <div className="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 border border-violet-700/50" style={{ color: "#ddd6fe" }}>{strokes.length ? `${strokes.length} stroke${strokes.length === 1 ? "" : "s"}` : "Draw"}</div>
    </div>
  );
}
void TIER_LABEL;
