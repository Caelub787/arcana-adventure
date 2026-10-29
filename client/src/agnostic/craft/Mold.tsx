// Blacksmithing, the free way: you draw the mold and the shape you drew is the
// weapon. Click to lay points down, pull a line into a curve, and the silhouette
// fills in behind as you go — a long thin point, a heavy head out at the end, a
// curved belly, whatever you make of it. There is no list of weapons anywhere in
// here: what the thing does comes off its shape (see moldTraits in shared), so
// drawing a scythe gets you a scythe's reach and a scythe's slowness because
// that is what a scythe is. Then work the metal down to it, and name it.
import React, { useMemo, useState } from "react";
import { Hammer, Pen, Trash2, Undo2, Eraser, ScrollText, CornerUpLeft, Sparkles } from "lucide-react";
import {
  moldPath, measureMold, moldTraits, moldResembles, moldTraitWords, moldWeapon, registerMold,
  MOLD_MAX_POINTS, MOLD_NAME_HINT, insertMoldPoint, moldPointAt, packMetal, numOf, TIER_COLOR, TIER_LABEL,
  type Mold, type MoldPoint, type Metal,
} from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { useToast } from "@/hooks/use-toast";
import { valueOn, hasValue, qtyOf, inventoryOf, craftHand, toolEffectsOn, type CraftState } from "./session";
import { ItemTile, ResultBanner, QuickCraftButton, ChoiceRow, announceRoll, colorOf, Needs, type CraftOutcome } from "./common";
import { partPortrait } from "./render";
import { Anvil } from "./Anvil";

type ScopeState = ReturnType<typeof useAg>["state"];
interface Props {
  characterId: string; s: CraftState; set: (p: CraftState) => void; playing: boolean;
  start: (p: CraftState) => void; stationId?: string;
  onMode: () => void; hasBlueprints: boolean;
}

/** A plain bar to start from, so nobody faces an empty canvas. */
const START: MoldPoint[] = [{ x: 14, y: 44 }, { x: 86, y: 44 }, { x: 86, y: 56 }, { x: 14, y: 56 }];
const pointsOf = (s: CraftState): MoldPoint[] => (Array.isArray(s.mold) && s.mold.length >= 2 ? (s.mold as MoldPoint[]) : START);
const isMaterial = (st: ScopeState, id: string) => hasValue(st, id, "heat_min") || hasValue(st, id, "hardness") || valueOn(st, id, "item_type") === "Material";

export function ForgeModeSwitch({ mode, onChange, playing }: { mode: "free" | "blueprint"; onChange: () => void; playing: boolean }) {
  if (!playing) return null;
  return (
    <div className="flex items-center gap-2 text-[11px] text-stone-400">
      <span className="inline-flex items-center gap-1 text-stone-300">{mode === "free" ? <><Pen className="h-3.5 w-3.5 text-amber-400" /> Your own mold</> : <><ScrollText className="h-3.5 w-3.5 text-amber-400" /> From a blueprint</>}</span>
      <button type="button" onClick={onChange} className="ml-auto h-7 px-2 rounded-md border border-stone-700 text-stone-300 hover:border-stone-500 inline-flex items-center gap-1" data-testid="forge-mode">
        <CornerUpLeft className="h-3 w-3" />{mode === "free" ? "Use a blueprint" : "Draw a mold"}
      </button>
    </div>
  );
}

export function MoldForge({ characterId, s, set, start, playing, stationId, onMode, hasBlueprints }: Props) {
  const { state, request, scope, openNote } = useAg();
  const { toast } = useToast();
  const character = state.notes.get(characterId);
  const inventory = inventoryOf(state, characterId);
  const materials = inventory.filter((n) => isMaterial(state, n.id) && valueOn(state, n.id, "station_for") === undefined);
  const hammers = inventory.filter((n) => hasValue(state, n.id, "tool_skill") || hasValue(state, n.id, "mark_style"));
  const matId: string | undefined = s.mat;
  const material = matId ? state.notes.get(matId) : undefined;
  const mold: Mold = useMemo(() => ({ points: pointsOf(s) }), [JSON.stringify(s.mold)]); // eslint-disable-line react-hooks/exhaustive-deps
  const hand = craftHand(state, characterId, "blacksmithing", [s.hammer]);
  const [busy, setBusy] = useState(false);

  const mat = {
    hardness: numOf(valueOn(state, matId ?? "", "hardness"), 3),
    value: numOf(valueOn(state, matId ?? "", "value"), 1),
    weight: numOf(valueOn(state, matId ?? "", "weight"), 1),
    color: matId ? colorOf(state, matId, "metal_color", "#9ca3af") : "#9ca3af",
  };
  const measure = useMemo(() => measureMold(mold), [mold]);
  const traits = useMemo(() => moldTraits(measure), [measure]);
  const resembles = moldResembles(measure);
  const called = String(s.wname ?? "");

  const missing = [
    !matId && "Pick what to forge it from",
    !!matId && qtyOf(state, matId) < 1 && `No ${material?.name ?? "material"} left`,
    mold.points.length < 3 && "A mold needs three points at least",
  ];
  const ready = !missing.some(Boolean);

  const forge = async (mode: "quick" | "game", metal?: Metal, shape?: number) => {
    if (!matId || !character) return;
    setBusy(true);
    try {
      const portrait = metal ? partPortrait(registerMold(mold), metal, mat.color) : partPortrait(registerMold(mold), null, mat.color);
      const res: CraftOutcome = await request({
        op: "craft.forgeMold", characterId, stationId, materialId: matId, toolId: s.hammer ?? null,
        mold, name: called.trim() || undefined, mode, shape, metal: metal ? packMetal(metal) : null, portrait,
      });
      announceRoll(character.name, res.roll, scope.kind === "campaign");
      start({ stage: undefined, metal: undefined, tool: undefined, strikes: 0, good: 0, bad: 0, result: res });
    } catch (e: any) { toast({ title: "Couldn't forge it", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  // At the anvil: the mold itself is the gold outline to work the metal down to.
  if (s.stage === "anvil") {
    const shape = registerMold(mold, called.trim() || resembles);
    return (
      <Anvil title={called.trim() || `A ${resembles} of your own`} sub={`Blacksmithing ${hand.skill}`} shape={shape} matId={matId} skill={hand.skill}
        s={s} set={set} playing={playing} onBack={() => set({ stage: undefined, metal: undefined, tool: undefined })}
        onQuench={(metal, shapePct) => forge("game", metal, shapePct)}
        stats={(shapePct) => {
          const w = moldWeapon(mold, shapePct >= 95 ? "huge" : shapePct >= 80 ? "slight" : shapePct >= 50 ? "default" : shapePct > 0 ? "weak" : "fail", mat);
          return <>d{w.die} <b style={{ color: TIER_COLOR[w.tier] }}>{w.damageBonus >= 0 ? "+" : ""}{w.damageBonus}</b> damage · durability <b className="text-stone-200">{w.durability}%</b> · {TIER_LABEL[w.tier]}</>;
        }} />
    );
  }

  return (
    <div className="space-y-2.5">
      {hasBlueprints && <ForgeModeSwitch mode="free" onChange={onMode} playing={playing} />}
      <ResultBanner result={s.result} onOpen={openNote} onClose={playing ? () => set({ result: undefined }) : undefined} />
      <MoldDesigner points={mold.points} color={mat.color} playing={playing} sel={typeof s.sel === "number" ? s.sel : null}
        onPoints={(points, sel) => set({ mold: points, sel })} />
      <TradeOffs traits={traits} resembles={resembles} />
      <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2 space-y-1.5">
        <ChoiceRow label="Metal" empty="No materials — you need an ingot, wood or leather." testId="mold-materials">
          {materials.map((n) => (
            <ItemTile key={n.id} compact note={n} selected={matId === n.id} disabled={!playing} color={colorOf(state, n.id, "metal_color", "#9ca3af")}
              onClick={() => set({ mat: matId === n.id ? undefined : n.id })}
              sub={`hard ${numOf(valueOn(state, n.id, "hardness"), 3)}${hasValue(state, n.id, "heat_min") ? ` · ${numOf(valueOn(state, n.id, "heat_min"))}–${numOf(valueOn(state, n.id, "heat_max"), 100)}°` : ""}`}
              testId={`mold-mat-${n.name}`} />
          ))}
        </ChoiceRow>
        {hammers.length > 0 && (
          <ChoiceRow label="Tool" empty="No smithing tools.">
            {hammers.map((n) => { const e = toolEffectsOn(state, n.id); return (
              <ItemTile key={n.id} compact note={n} selected={s.hammer === n.id} disabled={!playing}
                onClick={() => set({ hammer: s.hammer === n.id ? undefined : n.id })}
                sub={e.skill ? `${e.skill > 0 ? "+" : "−"}${Math.abs(e.skill)} Blacksmithing` : "no help either way"} testId={`mold-tool-${n.name}`} />
            ); })}
          </ChoiceRow>
        )}
        <label className="flex items-center gap-2 text-xs">
          <span className="text-[10px] uppercase tracking-wide text-stone-500 w-16 shrink-0">Call it</span>
          <input value={called} disabled={!playing} maxLength={60} onChange={(e) => set({ wname: e.target.value })}
            placeholder={material ? `${material.name} ${resembles}` : `your own ${resembles}`}
            className="flex-1 min-w-0 h-8 px-2 rounded-md bg-stone-950 border border-stone-700 text-stone-100 placeholder:text-stone-600" data-testid="mold-name" />
        </label>
        <div className="text-[11px] text-stone-500">{MOLD_NAME_HINT[resembles] ?? MOLD_NAME_HINT.blade} Leave it blank and it takes the metal's name.</div>
      </div>
      {playing && (<>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!ready || busy} onClick={() => start({ stage: "anvil", metal: undefined, tool: "hammer", heat: 20, good: 0, bad: 0, strikes: 0, result: undefined })}
            className="h-9 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40" data-testid="mold-work">
            <Hammer className="h-4 w-4" /> Work the metal
          </button>
          <QuickCraftButton kind="forge" characterId={characterId} busy={busy} disabled={!ready} onClick={() => forge("quick")} tools={[s.hammer]}
            title="Roll d20 + Blacksmithing and cast it from this mold straight away" />
        </div>
        <Needs items={missing} />
        <div className="text-[11px] text-stone-500">Work the metal to play it out at the anvil — how close you get to your own outline is how well it comes out. Quick Craft casts it on a roll instead.</div>
      </>)}
    </div>
  );
}

/**
 * The pen: click the empty canvas to lay a point down, drag a point to move it,
 * and with one picked, the slider bends the line running into it. The shape
 * fills in behind as you draw, which is the whole point — you are looking at
 * the weapon, not at a plan of one.
 */
function MoldDesigner({ points, color, playing, sel, onPoints }: {
  points: MoldPoint[]; color: string; playing: boolean; sel: number | null;
  onPoints: (points: MoldPoint[], sel: number | null) => void;
}) {
  const S = 100;
  const [local, setLocal] = useState<MoldPoint[] | null>(null);
  const pts = local ?? points;
  const drag = React.useRef<{ i: number; moved: boolean } | null>(null);
  const lastSend = React.useRef(0);
  const svg = React.useRef<SVGSVGElement>(null);
  const mold = { points: pts };
  const at = (e: React.PointerEvent) => {
    const r = (svg.current ?? (e.currentTarget as SVGSVGElement)).getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * S)), y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * S)) };
  };
  const down = (e: React.PointerEvent) => {
    if (!playing) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = at(e);
    const hit = moldPointAt(pts, p);
    if (hit >= 0) { drag.current = { i: hit, moved: false }; onPoints(pts, hit); return; }
    if (pts.length >= MOLD_MAX_POINTS) return;
    const next = insertMoldPoint(pts, p);
    onPoints(next.points, next.index);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !playing) return;
    const p = at(e);
    drag.current.moved = true;
    const next = pts.map((q, i) => (i === drag.current!.i ? { ...q, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 } : q));
    setLocal(next);
    // Watchers see the shape move as it's dragged, not only where it lands.
    const now = performance.now();
    if (now - lastSend.current > 90) { lastSend.current = now; onPoints(next, drag.current.i); }
  };
  const up = () => {
    if (!drag.current) return;
    const was = drag.current;
    drag.current = null;
    if (local && was.moved) onPoints(local, was.i);
    setLocal(null);
  };

  const curve = sel !== null && pts[sel] ? (pts[sel].c ?? 0) : 0;
  const setCurve = (c: number) => sel !== null && onPoints(pts.map((q, i) => (i === sel ? { ...q, c } : q)), sel);
  const drop = () => sel !== null && pts.length > 3 && onPoints(pts.filter((_, i) => i !== sel), null);
  const line = sel !== null ? `${sel === 0 ? pts.length : sel} → ${sel + 1}` : "";

  return (
    <div className="space-y-2" data-testid="mold-designer">
      <div className="relative mx-auto max-w-[420px]">
        <svg ref={svg} viewBox="0 0 100 100" className={`w-full block rounded-lg border border-stone-700 bg-stone-950 touch-none select-none ${playing ? "cursor-crosshair" : ""}`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} data-testid="mold-canvas">
          <defs>
            <linearGradient id="moldsheen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {/* The grip end is on the left, so "where the weight sits" means something. */}
          {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={0} y1={(i + 1) * 10} x2={100} y2={(i + 1) * 10} stroke="#292524" strokeWidth={0.3} />)}
          {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={(i + 1) * 10} y1={0} x2={(i + 1) * 10} y2={100} stroke="#292524" strokeWidth={0.3} />)}
          <line x1={0} y1={50} x2={100} y2={50} stroke="#44403c" strokeWidth={0.5} strokeDasharray="2 2" />
          <rect x={0} y={44} width={9} height={12} fill="#1c1917" stroke="#44403c" strokeWidth={0.4} rx={1} />
          <text x={4.5} y={51.2} textAnchor="middle" fontSize={3} fill="#78716c">grip</text>
          {/* The shape itself, filling in as it's drawn. */}
          <path d={moldPath(mold)} fill={color} stroke="#0c0a09" strokeWidth={0.8} opacity={0.95} />
          <path d={moldPath(mold)} fill="url(#moldsheen)" stroke="none" />
          {/* The points, and the one picked. */}
          {pts.map((q, i) => (
            <g key={i}>
              {!!q.c && <circle cx={q.x} cy={q.y} r={2.6} fill="none" stroke="#38bdf8" strokeWidth={0.5} />}
              <circle cx={q.x} cy={q.y} r={i === sel ? 2.2 : 1.5} fill={i === sel ? "#fbbf24" : "#e7e5e4"} stroke="#0c0a09" strokeWidth={0.5} />
            </g>
          ))}
        </svg>
        {playing && <div className="absolute bottom-1.5 left-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-stone-300">{pts.length} points · tap to add, drag to move</div>}
      </div>
      {playing && (
        <div className="space-y-1.5 text-xs max-w-[420px] mx-auto">
          <label className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-stone-400">Curve</span>
            <input type="range" min={-100} max={100} value={curve} disabled={sel === null} onChange={(e) => setCurve(Number(e.target.value))}
              className="flex-1 accent-sky-500 h-6 disabled:opacity-40" data-testid="mold-curve" />
            <span className="w-16 text-right text-stone-500">{sel === null ? "pick a point" : `line ${line}`}</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={drop} disabled={sel === null || pts.length <= 3}
              className="h-7 px-2 rounded-md border border-stone-700 text-stone-200 inline-flex items-center gap-1 disabled:opacity-40" data-testid="mold-delete"><Trash2 className="h-3 w-3" /> Delete point</button>
            <button type="button" onClick={() => setCurve(0)} disabled={sel === null || !curve}
              className="h-7 px-2 rounded-md border border-stone-700 text-stone-200 inline-flex items-center gap-1 disabled:opacity-40" data-testid="mold-straighten"><Undo2 className="h-3 w-3" /> Straighten</button>
            <button type="button" onClick={() => onPoints([...START], null)}
              className="h-7 px-2 rounded-md border border-stone-700 text-stone-200 inline-flex items-center gap-1 ml-auto" data-testid="mold-reset"><Eraser className="h-3 w-3" /> Start over</button>
          </div>
          <div className="text-[11px] text-stone-500">Tap the shape's edge to add a point there. Pick a point and the slider bends the line running into it — one way for a belly, the other for a hollow.</div>
        </div>
      )}
    </div>
  );
}

/** What the shape you drew is good and bad at — live, as you draw it. */
function TradeOffs({ traits, resembles }: { traits: ReturnType<typeof moldTraits>; resembles: string }) {
  const words = moldTraitWords(traits);
  const good = (w: string) => w.startsWith("+") || /reach/.test(w);
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2 space-y-1" data-testid="mold-tradeoffs">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-[11px] text-stone-300">Shaping up like a <b className="text-stone-100">{resembles}</b></span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {words.length ? words.map((w, i) => (
          <span key={i} className={`inline-flex items-center h-6 px-2 rounded-md border text-[11px] ${good(w) ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200/90" : "border-red-900/60 bg-red-950/30 text-red-200/90"}`}>{w}</span>
        )) : <span className="text-[11px] text-stone-500">Nothing much either way yet — give it a shape.</span>}
      </div>
      <div className="text-[11px] text-stone-400">{traits.notes.join(" · ")}</div>
    </div>
  );
}
