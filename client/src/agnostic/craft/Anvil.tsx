// The anvil: the metal, the heat, and the gold outline to work it down to. The
// outline can be a blueprint's part or a mold the smith drew themselves — the
// anvil doesn't know the difference, so both are played here.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Hammer, Wind, Droplets, ArrowLeft, Disc3 } from "lucide-react";
import {
  FINE_COLS, FINE_ROWS, startingStock, shapeMask, shapeScore, hammerMetal, grindMetal, outlineDistance, GRIND_REACH, breakLoose, packMetal, unpackMetal, numOf,
  type Metal,
} from "@shared/agnostic/crafting";
import { useAg } from "../hooks";
import { valueOn, hasValue, type CraftState } from "./session";
import { ResultBanner, colorOf } from "./common";
import { drawMetal, drawTarget, drawBlocks, drawWheel, heatColor, stepParticles, type Particle } from "./render";

type ScopeState = ReturnType<typeof useAg>["state"];

/** A material's numbers (an item with heat_min / heat_max / hardness / metal_color). */
export function materialOf(st: ScopeState, id: string | undefined) {
  if (!id) return null;
  // "Heat to" 0: a material that isn't heated (wood, leather).
  const hasHeat = (hasValue(st, id, "heat_min") || hasValue(st, id, "heat_max")) && numOf(valueOn(st, id, "heat_max"), 100) > 0;
  return {
    heatMin: numOf(valueOn(st, id, "heat_min"), 0), heatMax: numOf(valueOn(st, id, "heat_max"), 100), hasHeat,
    hardness: numOf(valueOn(st, id, "hardness"), 3), color: colorOf(st, id, "metal_color", "#9ca3af"),
    weight: numOf(valueOn(st, id, "weight"), 1), value: numOf(valueOn(st, id, "value"), 1),
  };
}

// --------------------------------------------------------------------------- the anvil
// The bar fills the canvas (it's what you work); the heat gauge sits below it.
const W = 760, H = 320;
const BAR = { x: 20, y: 16, w: 720, h: 288 };
const SKILL_WORDS = ["Rough: a blow often knocks the blocks beside it off too.", "Steadier: a blow sometimes takes a neighbour.", "Careful: now and then a neighbour goes too.", "Precise: each blow lands exactly where you strike.", "Master: drag to cut along a line, like a saw."];
const wheelRadius = (skill: number) => [4, 4, 3.6, 3.3, 3][Math.max(0, Math.min(4, skill))];
const GRIND_WORDS = ["Rough: the wheel often bites past the line.", "Steadier: it sometimes bites past the line.", "Careful: it rarely bites past the line.", "Precise: it hardly ever bites past the line.", "Master: it stops right at the line."];
/** Which way is out from the metal at a point (radians): the wheel sits on that side, off the work, so it never hides the edge. */
function outward(metal: Metal, fx: number, fy: number): number | null {
  let vx = 0, vy = 0;
  const R = 9;
  for (let r = Math.floor(fy - R); r <= Math.ceil(fy + R); r++) for (let c = Math.floor(fx - R); c <= Math.ceil(fx + R); c++) {
    const dx = c + 0.5 - fx, dy = r + 0.5 - fy, d2 = dx * dx + dy * dy;
    if (d2 > R * R || d2 < 0.01) continue;
    const solid = r >= 0 && c >= 0 && r < FINE_ROWS && c < FINE_COLS && metal[r * FINE_COLS + c] === 1;
    const w = (solid ? -1 : 1) / Math.sqrt(d2);
    vx += dx * w; vy += dy * w;
  }
  return Math.hypot(vx, vy) < 0.5 ? null : Math.atan2(vy, vx);
}

/**
 * The anvil: the metal, the heat and the gold outline to work it down to. It
 * doesn't care what the outline is — a blueprint's part or a mold the smith
 * drew themselves — so the shape, the material and what happens at the quench
 * all come in from whoever is using it.
 */
export function Anvil({ title, sub, shape, matId, skill, s, set, playing, onBack, onQuench, stats }: {
  title: string; sub?: string; shape: string; matId: string | undefined; skill: number;
  s: CraftState; set: (p: CraftState) => void; playing: boolean; onBack: () => void;
  /** Done: the metal as worked, how close it came to the outline, and how well the heat was kept. */
  onQuench: (metal: Metal, shapePct: number, heatPct: number) => Promise<void>;
  /** What the work is coming out as, said in the smith's own terms. */
  stats: (shapePct: number, heatPct: number) => React.ReactNode;
}) {
  const { state, openNote } = useAg();
  const mat = materialOf(state, matId) ?? { heatMin: 0, heatMax: 100, hasHeat: false, hardness: 3, color: "#9ca3af", weight: 1, value: 1 };
  const mask = useMemo(() => shapeMask(shape), [shape]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fromState = () => (typeof s.metal === "string" ? unpackMetal(s.metal) : null) ?? startingStock(shape);
  const live = useRef({ heat: Number(s.heat ?? 20), bellows: false, metal: fromState(), lastSync: 0, lastMetalSync: 0, dirty: false, pointer: null as null | { x: number; y: number }, lastBlock: -1, lastGrind: 0, wheelAngle: -Math.PI / 2 });
  const particles = useRef<Particle[]>([]);
  const shake = useRef(0);
  const [busy, setBusy] = useState(false);
  const tool: "hammer" | "grind" = s.tool === "grind" ? "grind" : "hammer";
  const [miss, setMiss] = useState(0);
  const [skate, setSkate] = useState<null | "far" | "loose">(null);
  // Watchers follow the crafter's heat and metal; the crafter runs the furnace.
  useEffect(() => { if (!playing) live.current.heat = Number(s.heat ?? 20); }, [s.heat, playing]);
  useEffect(() => { if (!playing || !live.current.dirty) live.current.metal = fromState(); }, [s.metal, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const inRange = (h: number) => !mat.hasHeat || (h >= mat.heatMin && h <= mat.heatMax);

  useEffect(() => {
    let raf = 0, last = performance.now(), t = 0;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const L = live.current;
      if (playing) {
        // The furnace: the bellows push heat in; otherwise the metal cools toward the air.
        if (mat.hasHeat) L.heat = Math.max(8, Math.min(100, L.heat + (L.bellows ? 32 : -7) * dt));
        if (now - L.lastSync > 140) { L.lastSync = now; set({ heat: Math.round(L.heat * 10) / 10, bellows: L.bellows }); }
        // The grindstone works while it's held on the metal.
        if (tool === "grind" && L.pointer && now - L.lastGrind > 35) { L.lastGrind = now; grindAt(L.pointer.x, L.pointer.y); }
        if (L.dirty && now - L.lastMetalSync > 150) syncMetal(now);
      }
      draw(ctx, t, dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const L = live.current;
    const heat01 = mat.hasHeat ? L.heat / 100 : 0.08;
    ctx.save();
    if (shake.current > 0) { ctx.translate((Math.random() - 0.5) * shake.current, (Math.random() - 0.5) * shake.current); shake.current = Math.max(0, shake.current - dt * 30); }
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a1614"); bg.addColorStop(1, "#0a0807");
    ctx.fillStyle = bg; ctx.fillRect(-10, -10, W + 20, H + 20);
    const flick = 0.75 + 0.25 * Math.sin(t * 7) * Math.sin(t * 3.3) + (s.bellows ? 0.35 : 0);
    const fg = ctx.createRadialGradient(W / 2, H + 40, 10, W / 2, H + 40, 420 * flick);
    fg.addColorStop(0, `rgba(255,140,40,${0.35 * flick})`); fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    if (tool === "hammer") drawBlocks(ctx, BAR.x, BAR.y, BAR.w, BAR.h);
    drawMetal(ctx, L.metal, mat.color, heat01, BAR.x, BAR.y, BAR.w, BAR.h);
    drawTarget(ctx, shape, mask, L.metal, BAR.x, BAR.y, BAR.w, BAR.h, t);
    if (Math.random() < (s.bellows ? 0.6 : 0.15)) particles.current.push({ x: Math.random() * W, y: H, vx: (Math.random() - 0.5) * 30, vy: -50 - Math.random() * 60, life: 1.4, max: 1.4, color: "#ff8a3d", size: 1.4 });
    stepParticles(ctx, particles.current, dt);
    const wheel = playing ? (tool === "grind" ? L.pointer : null) : s.wheel && Date.now() - s.wheel.at < 400 ? s.wheel : null;
    if (wheel) {
      // Turn the wheel round to the open side of the edge it's on, easing so it doesn't jitter.
      const [fx, fy] = toFine(wheel.x, wheel.y);
      const want = outward(L.metal, fx, fy);
      if (want !== null) { let d = want - L.wheelAngle; d = Math.atan2(Math.sin(d), Math.cos(d)); L.wheelAngle += d * Math.min(1, dt * 12); }
      drawWheel(ctx, wheel.x, wheel.y, 34, t, L.wheelAngle);
    }
    ctx.restore();
  };

  const cellW = BAR.w / FINE_COLS, cellH = BAR.h / FINE_ROWS;
  const toFine = (x: number, y: number) => [(x - BAR.x) / cellW, (y - BAR.y) / cellH] as const;
  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  /** Pieces no longer joined to the rest fall off the anvil. */
  const drop = (metal: Metal, color: string) => {
    const { metal: kept, fell } = breakLoose(metal);
    for (const i of fell.slice(0, 400)) {
      const x = BAR.x + ((i % FINE_COLS) + 0.5) * cellW, y = BAR.y + (Math.floor(i / FINE_COLS) + 0.5) * cellH;
      particles.current.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, life: 1.4, max: 1.4, color, size: Math.max(cellW, cellH) * 1.1, gravity: 900, square: true } as Particle);
    }
    return { metal: kept, fell };
  };
  const syncMetal = (now = performance.now(), extra: CraftState = {}) => {
    const L = live.current;
    L.dirty = false; L.lastMetalSync = now;
    set({ metal: packMetal(L.metal), ...extra });
  };
  const sparks = (x: number, y: number, col: string, n: number) => { for (let k = 0; k < n; k++) { const a = -Math.PI * Math.random(); const v = 120 + Math.random() * 240; particles.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, max: 1, color: col, size: 1.4 + Math.random() * 1.6 }); } };

  const blow = (x: number, y: number, saw: boolean) => {
    const L = live.current;
    const [fx, fy] = toFine(x, y);
    const block = Math.floor(fy / 4) * 1000 + Math.floor(fx / 4);
    if (saw && block === L.lastBlock) return;
    const good = inRange(L.heat);
    const cold = mat.hasHeat && L.heat < mat.heatMin;
    // Off the metal: the hammer rings on the anvil and nothing moves.
    const onMetal = fx >= 0 && fy >= 0 && fx < FINE_COLS && fy < FINE_ROWS && L.metal[Math.floor(fy) * FINE_COLS + Math.floor(fx)] === 1;
    if (!onMetal) { if (!saw) { sparks(x, y, "#78716c", 4); setMiss((m) => m + 1); } return; }
    L.lastBlock = block;
    // Cold metal often won't move; too hot, it smears into its neighbours.
    if (cold && Math.random() < 0.5) { sparks(x, y, "#93c5fd", 8); shake.current = 3; set({ strikes: Number(s.strikes ?? 0) + 1, bad: Number(s.bad ?? 0) + 1, lastHit: { x, y, good: false, at: Date.now() } }); return; }
    const hot = mat.hasHeat && L.heat > mat.heatMax;
    const { metal: struck, hit } = hammerMetal(L.metal, fx, fy, saw ? 4 : Math.max(0, skill - (hot ? 1 : 0)));
    if (!hit.length) return;
    const { metal, fell } = drop(struck, heatColor(mat.hasHeat ? L.heat / 100 : 0.08, mat.color));
    L.metal = metal;
    if (mat.hasHeat) L.heat = Math.max(8, L.heat - (saw ? 0.4 : 1.6));
    shake.current = saw ? 1.5 : 6;
    sparks(x, y, good ? "#ffcc55" : "#ff5533", good ? 20 : 10);
    syncMetal(performance.now(), { strikes: Number(s.strikes ?? 0) + 1, good: Number(s.good ?? 0) + (good ? 1 : 0), bad: Number(s.bad ?? 0) + (good ? 0 : 1), lastHit: { x, y, good, at: Date.now() }, ...(fell.length ? { lastFall: { cells: fell.slice(0, 300), at: Date.now() } } : {}) });
  };
  const grindAt = (x: number, y: number) => {
    const L = live.current;
    const [fx, fy] = toFine(x, y);
    const { metal: ground, hit, loose } = grindMetal(L.metal, shape, fx, fy, wheelRadius(skill), skill);
    if (!hit.length) {
      // Stock too far from the line, or grinding here would knock a whole piece off: the stone skates (the hammer's job).
      const c = Math.floor(fx), r = Math.floor(fy);
      if (loose) setSkate("loose");
      else if (c >= 0 && r >= 0 && c < FINE_COLS && r < FINE_ROWS && L.metal[r * FINE_COLS + c] && outlineDistance(shape)[r * FINE_COLS + c] > GRIND_REACH) setSkate("far");
      return;
    }
    setSkate(null);
    const { metal, fell } = drop(ground, mat.color);
    L.metal = metal; L.dirty = true;
    sparks(x, y, "#fde68a", 3);
    if (fell.length) set({ lastFall: { cells: fell.slice(0, 300), at: Date.now() } });
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!playing || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointOf(e);
    live.current.lastBlock = -1;
    if (tool === "grind") { live.current.pointer = p; set({ wheel: { ...p, at: Date.now() } }); return; }
    live.current.pointer = skill >= 4 ? p : null;
    blow(p.x, p.y, false);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const L = live.current;
    if (!playing || !L.pointer) return;
    const p = pointOf(e);
    // A master's hammer cuts along the drag, block by block, like a saw.
    if (tool === "hammer" && skill >= 4) { const steps = Math.ceil(Math.hypot(p.x - L.pointer.x, p.y - L.pointer.y) / (cellW * 2)); for (let k = 1; k <= steps; k++) blow(L.pointer.x + ((p.x - L.pointer.x) * k) / steps, L.pointer.y + ((p.y - L.pointer.y) * k) / steps, true); }
    L.pointer = p;
    if (tool === "grind" && Date.now() - (s.wheel?.at ?? 0) > 120) set({ wheel: { ...p, at: Date.now() } });
  };
  const up = () => { const L = live.current; L.pointer = null; if (L.dirty) syncMetal(); };

  // Watchers see the crafter's sparks and the bits that fall.
  useEffect(() => {
    if (playing || !s.lastHit) return;
    const { x, y, good } = s.lastHit;
    shake.current = 5;
    sparks(x, y, good ? "#ffcc55" : "#ff5533", 18);
  }, [s.lastHit?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (playing || !s.lastFall?.cells) return;
    for (const i of s.lastFall.cells as number[]) particles.current.push({ x: BAR.x + ((i % FINE_COLS) + 0.5) * cellW, y: BAR.y + (Math.floor(i / FINE_COLS) + 0.5) * cellH, vx: (Math.random() - 0.5) * 60, vy: -20, life: 1.4, max: 1.4, color: mat.color, size: Math.max(cellW, cellH) * 1.1, gravity: 900, square: true } as Particle);
  }, [s.lastFall?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const metalNow = (typeof s.metal === "string" ? unpackMetal(s.metal) : null) ?? live.current.metal;
  const shapePct = shapeScore(shape, playing ? live.current.metal : metalNow);
  const strikes = Number(s.strikes ?? 0);
  const heatPct = strikes ? Math.round((100 * Number(s.good ?? 0)) / strikes) : mat.hasHeat ? 0 : 100;
  const heatNow = Number(s.heat ?? live.current.heat);

  const quench = async () => {
    if (!matId) return;
    setBusy(true);
    try { await onQuench(live.current.metal, shapeScore(shape, live.current.metal), mat.hasHeat ? heatPct : 100); }
    finally { setBusy(false); }
  };
  const pctColor = (v: number) => (v >= 80 ? "#4ade80" : v >= 55 ? "#fbbf24" : "#f87171");
  const toolBtn = (on: boolean) => `h-10 px-3 inline-flex items-center gap-1.5 ${on ? "bg-stone-700 text-stone-100" : "bg-stone-900 text-stone-400"}`;

  return (
    <div className="space-y-2" data-testid="forge-anvil">
      <div className="flex items-center gap-2 min-w-0">
        {playing && <button type="button" onClick={onBack} className="h-8 w-8 shrink-0 rounded-md border border-stone-700 text-stone-300 grid place-items-center hover:border-stone-500" title="Back (this work isn't saved)" data-testid="forge-back"><ArrowLeft className="h-4 w-4" /></button>}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-100 truncate">{title}</div>
          <div className="text-[11px] text-stone-400 truncate">{matId ? state.notes.get(matId)?.name : "no material"}{mat.hasHeat ? ` · hammer it at ${mat.heatMin}–${mat.heatMax}°` : " · no heat needed"}{sub ? ` · ${sub}` : ""}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Stat icon={<Hammer className="h-3.5 w-3.5" />} value={`${shapePct}%`} color={pctColor(shapePct)} title="Shape: how close it is to the outline" testId="forge-shape" />
          {mat.hasHeat && <Stat icon={<Flame className="h-3.5 w-3.5" />} value={strikes ? `${heatPct}%` : "—"} color={pctColor(heatPct)} title="Heat control: blows struck in the green band" />}
        </div>
      </div>
      <canvas ref={canvas} width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
        className={`w-full block rounded-lg border border-stone-700 touch-none select-none ${playing ? "cursor-crosshair" : ""}`} data-testid="forge-canvas" />
      {mat.hasHeat && <HeatGauge heat={heatNow} min={mat.heatMin} max={mat.heatMax} />}
      <div className="flex flex-wrap items-center gap-2">
        {playing && (
          <div className="inline-flex rounded-md border border-stone-700 overflow-hidden text-xs" data-testid="forge-tool">
            <button type="button" onClick={() => { up(); set({ tool: "hammer" }); }} className={toolBtn(tool === "hammer")} data-testid="forge-tool-hammer"><Hammer className="h-4 w-4" />Hammer</button>
            <button type="button" onClick={() => { up(); set({ tool: "grind" }); }} className={toolBtn(tool === "grind")} data-testid="forge-tool-grind"><Disc3 className="h-4 w-4" />Grindstone</button>
          </div>
        )}
        {playing && mat.hasHeat && tool === "hammer" && (
          <button type="button"
            onPointerDown={(e) => { e.preventDefault(); live.current.bellows = true; }} onPointerUp={() => { live.current.bellows = false; }} onPointerLeave={() => { live.current.bellows = false; }} onPointerCancel={() => { live.current.bellows = false; }}
            className={`h-10 px-4 rounded-md border text-sm font-medium inline-flex items-center gap-2 select-none touch-none ${s.bellows ? "border-orange-400 bg-orange-600/30 text-orange-100" : "border-stone-600 bg-stone-800 text-stone-100"}`} data-testid="forge-bellows">
            <Wind className="h-4 w-4" /> Bellows <span className="text-[10px] text-stone-400">hold</span>
          </button>
        )}
        <span className="text-[11px] text-stone-400">{stats(shapePct, mat.hasHeat ? heatPct : 100)}</span>
        {playing && (
          <button type="button" disabled={busy || (strikes === 0 && shapePct === 0)} onClick={quench}
            className="ml-auto h-10 px-4 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-40" data-testid="forge-quench">
            <Droplets className="h-4 w-4" /> Quench & save
          </button>
        )}
      </div>
      {playing && (
        <div className="text-[11px] text-stone-500" data-testid="forge-hint">
          {tool === "hammer"
            ? <>Hit the red stock to knock it off, block by block — down to the gold line. Hammer while the heat is in the green band. <span className="text-stone-400">Blacksmithing {skill}: {SKILL_WORDS[skill]}</span>{miss > 0 && <span className="text-amber-300/90"> Hit the metal itself.</span>}</>
            : <>The grindstone smooths the edge down to the gold line: hold it on the stock near the line and move along it to bring out points and curves. It wears from the outside in, only within about a block of the line — stock farther out is the hammer's. <span className="text-stone-400">Blacksmithing {skill}: {GRIND_WORDS[skill]}</span>{skate && <span className="text-amber-300/90" data-testid="forge-skate"> {skate === "far" ? "That's too far from the line — hammer it away first." : "Grinding there would knock a whole piece off — hammer the stock beyond it first."}</span>}</>}
        </div>
      )}
      <ResultBanner result={s.result} onOpen={openNote} />
    </div>
  );
}

/** The metal's heat, with the material's working range in green. */
function HeatGauge({ heat, min, max }: { heat: number; min: number; max: number }) {
  const ok = heat >= min && heat <= max;
  return (
    <div className="relative h-4 rounded-full bg-stone-900 border border-stone-700 overflow-hidden" data-testid="forge-heat">
      <div className="absolute inset-0 opacity-50" style={{ background: `linear-gradient(90deg, #44403c, ${heatColor(0.5)}, ${heatColor(0.75)}, ${heatColor(1)})` }} />
      <div className="absolute inset-y-0 border-x-2 border-emerald-400 bg-emerald-400/20" style={{ left: `${min}%`, width: `${Math.max(1, max - min)}%` }} />
      <div className="absolute inset-y-0 w-1 -ml-0.5 rounded-full" style={{ left: `${Math.max(0, Math.min(100, heat))}%`, background: ok ? "#4ade80" : heat < min ? "#60a5fa" : "#f87171", boxShadow: "0 0 6px rgba(0,0,0,0.8)" }} />
      <div className="absolute right-1.5 inset-y-0 text-[10px] font-mono leading-4 text-stone-200">{Math.round(heat)}°</div>
    </div>
  );
}

function Stat({ value, color, icon, title, testId }: { value: string; color: string; icon?: React.ReactNode; title?: string; testId?: string }) {
  return (
    <span className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-stone-700 bg-stone-900" title={title} data-testid={testId}>
      {icon && <span className="text-stone-400">{icon}</span>}
      <span className="text-sm font-bold font-mono" style={{ color }}>{value}</span>
    </span>
  );
}
