// The alchemy steps as small tests of a steady hand — each a tap or a hold on one pad
// (never a drag, so the page doesn't scroll or the panel move under it), each scored
// 0–100 and shared live: whoever watches sees the same pot. They're drawn like the
// forge (a dark workshop lit by the fire, iron, wood and stone), and their numbers sit
// below the picture, as at the anvil. How sure the alchemist's hands are (Alchemy 0–4)
// changes each one, the way Blacksmithing steadies the hammer.
import React, { useEffect, useRef, useState } from "react";
import type { AlchemyStep } from "@shared/agnostic/crafting";
import type { CraftState } from "./session";
import { heatColor } from "./render";

export interface StepGameProps { step: AlchemyStep; s: CraftState; set: (p: CraftState) => void; playing: boolean; onDone: (score: number, detail: string) => void; /** The alchemist's Alchemy (0–4). */ skill: number }

const W = 640, H = 240;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const tri = (x: number) => { const f = x - Math.floor(x); return f < 0.5 ? f * 2 : 2 - f * 2; };
const gauss = () => { let u = 0; for (let k = 0; k < 4; k++) u += Math.random(); return (u - 2) / 1.15; };

// --------------------------------------------------------------------------- skill
/** What each level of Alchemy (0–4) does to each step: lower is harder. */
const SK = {
  mixBand: [0.12, 0.15, 0.18, 0.21, 0.24], mixKick: [0.09, 0.07, 0.05, 0.025, 0],
  diceSlip: [0.035, 0.025, 0.016, 0.008, 0], diceSpeed: [0.42, 0.38, 0.34, 0.31, 0.28],
  heatBand: [0.025, 0.03, 0.035, 0.042, 0.05], heatGust: [0.14, 0.1, 0.07, 0.035, 0],
  addWind: [46, 34, 22, 11, 0], addRing: [22, 24, 27, 30, 33],
  grindTol: [380, 330, 290, 255, 225], grindJitter: [0.15, 0.11, 0.07, 0.035, 0],
  strainBand: [[0.42, 0.6], [0.4, 0.63], [0.38, 0.66], [0.36, 0.68], [0.34, 0.7]], strainShake: [0.32, 0.24, 0.15, 0.07, 0],
  restLife: [0.95, 1.1, 1.25, 1.4, 1.55], restGold: [0.36, 0.32, 0.28, 0.24, 0.2],
};
export const ALCHEMY_SKILL_WORDS = [
  "Unpractised: a heavy, wandering hand — every step fights you.",
  "Learning: your hands still slip now and then.",
  "Practised: steady, most of the time.",
  "Skilled: only the smallest slips.",
  "Master: the brew does what you mean.",
];
const lvl = (skill: number) => Math.max(0, Math.min(4, Math.floor(skill)));

// --------------------------------------------------------------------------- the pad
/**
 * One canvas for a step: it runs `frame` every animation frame (the step's clock and drawing) and turns presses on it
 * into down / up — with the page's own gestures (scrolling, selecting, dragging the window) switched off on it.
 */
function Pad({ frame, onDown, onUp, testId, playing }: { frame: (ctx: CanvasRenderingContext2D, t: number, dt: number) => void; onDown?: (x: number, y: number) => void; onUp?: () => void; testId: string; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const f = useRef(frame); f.current = frame;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0, last = performance.now(), t = 0;
    const loop = (now: number) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; f.current(ctx, t, dt); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const; };
  return (
    <canvas ref={ref} width={W} height={H} data-testid={testId}
      className={`w-full block rounded-lg border border-stone-700 touch-none select-none ${playing ? "cursor-pointer" : ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { if (!playing) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); const [x, y] = pt(e); onDown?.(x, y); }}
      onPointerUp={() => onUp?.()} onPointerCancel={() => onUp?.()} onLostPointerCapture={() => onUp?.()} />
  );
}

/** The workshop behind every step, as at the forge: dark, warm, lit from the fire below, embers drifting up. */
function scene(ctx: CanvasRenderingContext2D, t: number, fx: Fx, fire = 0.35) {
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a1614"); bg.addColorStop(1, "#0a0807");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const flick = 0.8 + 0.2 * Math.sin(t * 7) * Math.sin(t * 3.3);
  const g = ctx.createRadialGradient(W / 2, H + 40, 10, W / 2, H + 40, 380 * flick);
  g.addColorStop(0, `rgba(255,140,40,${(0.12 + fire * 0.3) * flick})`); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (Math.random() < 0.1 + fire * 0.3) fx.bits.push({ x: Math.random() * W, y: H, vx: (Math.random() - 0.5) * 24, vy: -40 - Math.random() * 50, life: 1.6, max: 1.6, color: "#ff8a3d", size: 1.6, g: 0 });
}

// Bits that fly — chips, drops, embers — drawn as small squares, like the forge's sparks and falling metal.
interface Fx { bits: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }> }
const newFx = (): Fx => ({ bits: [] });
function chips(fx: Fx, x: number, y: number, color: string, n = 8, speed = 120, g = 600, size = 3) {
  for (let k = 0; k < n; k++) { const a = -Math.PI * Math.random(); const v = speed * (0.4 + Math.random() * 0.8); fx.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, max: 1, color, size: size * (0.6 + Math.random() * 0.8), g }); }
}
function drawFx(ctx: CanvasRenderingContext2D, fx: Fx, dt: number) {
  for (const b of fx.bits) { b.life -= dt; b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; ctx.globalAlpha = clamp(b.life / b.max); ctx.fillStyle = b.color; ctx.fillRect(Math.round(b.x - b.size / 2), Math.round(b.y - b.size / 2), b.size, b.size); }
  fx.bits = fx.bits.filter((b) => b.life > 0 && b.y < H + 10);
  ctx.globalAlpha = 1;
}
/** An iron pot from above: rim, inner wall, and the brew (`liquid`), lit from one side. */
function potTop(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, liquid: string) {
  ctx.fillStyle = "#121314"; ctx.beginPath(); ctx.ellipse(cx, cy + 6, rx + 14, ry + 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1b1c1f"; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 12, ry + 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#3a3d44"; ctx.lineWidth = 3; ctx.stroke();
  const g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 4, cx, cy, Math.max(rx, ry)); g.addColorStop(0, liquid); g.addColorStop(1, "#0d1210");
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
const BREW = "#557a52";

/** Keep the live numbers moving for watchers (a few times a second). */
function useSync(playing: boolean, set: StepGameProps["set"]) {
  const last = useRef(0);
  return (st: Record<string, unknown>, force = false) => {
    if (!playing) return;
    const now = performance.now();
    if (!force && now - last.current < 120) return;
    last.current = now;
    set({ st });
  };
}
/** Re-draw the numbers under the pad a few times a second (they live in refs while playing). */
function useTick() {
  const [, setN] = useState(0);
  useEffect(() => { const i = setInterval(() => setN((n) => n + 1), 150); return () => clearInterval(i); }, []);
}

// --------------------------------------------------------------------------- under the pad
const pctColor = (v: number) => (v >= 80 ? "#4ade80" : v >= 55 ? "#fbbf24" : "#f87171");
function Chip({ label, value, color = "#e7e5e4", testId }: { label: string; value: string; color?: string; testId?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md border border-stone-700 bg-stone-900" data-testid={testId}>
      <span className="text-[10px] uppercase tracking-wide text-stone-500">{label}</span>
      <span className="text-sm font-bold font-mono" style={{ color }}>{value}</span>
    </span>
  );
}
/** A gauge like the forge's heat: its good band in green, the needle where it is now. */
function Gauge({ value, lo, hi, text, testId }: { value: number; lo: number; hi: number; text: string; testId?: string }) {
  const ok = value >= lo && value <= hi;
  return (
    <div className="relative h-4 rounded-full bg-stone-900 border border-stone-700 overflow-hidden" data-testid={testId}>
      <div className="absolute inset-y-0 border-x-2 border-emerald-400 bg-emerald-400/20" style={{ left: `${lo * 100}%`, width: `${Math.max(1, (hi - lo) * 100)}%` }} />
      <div className="absolute inset-y-0 w-1 -ml-0.5 rounded-full" style={{ left: `${clamp(value) * 100}%`, background: ok ? "#4ade80" : value < lo ? "#60a5fa" : "#f87171", boxShadow: "0 0 6px rgba(0,0,0,0.8)" }} />
      <div className="absolute right-1.5 inset-y-0 text-[10px] font-mono leading-4 text-stone-200">{text}</div>
    </div>
  );
}
function Hud({ chips: cs, gauge, hint, skill, playing }: { chips: React.ReactNode; gauge?: React.ReactNode; hint: React.ReactNode; skill: number; playing: boolean }) {
  return (
    <div className="space-y-1.5" data-testid="alchemy-hud">
      {gauge}
      <div className="flex flex-wrap items-center gap-1.5">{cs}</div>
      <div className="text-[11px] text-stone-500" data-testid="alchemy-hint">{playing ? hint : "Watching the brew."} <span className="text-stone-400">Alchemy {skill}: {ALCHEMY_SKILL_WORDS[skill]}</span></div>
    </div>
  );
}

// --------------------------------------------------------------------------- mix
/** Stir: the swirl keeps slowing (in gusts) — tap to stir, and keep its pace in the band for the time asked. */
export function MixGame({ step, s, set, playing, onDone, skill }: StepGameProps) {
  const k = lvl(skill);
  const need = Math.max(3, Math.min(30, step.amount ?? 8));
  const lo = 0.575 - SK.mixBand[k] / 2, hi = 0.575 + SK.mixBand[k] / 2;
  const L = useRef({ speed: 0.2, inBand: 0, total: 0, started: false, done: false, spin: 0 });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  useTick();
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const M = L.current;
    if (playing && M.started && !M.done) {
      M.speed = clamp(M.speed - (0.22 + 0.16 * Math.max(0, Math.sin(t * 1.7)) + 0.1 * Math.max(0, Math.sin(t * 4.1))) * dt);
      M.total += dt;
      if (M.speed >= lo && M.speed <= hi) M.inBand += dt;
      sync({ speed: M.speed, inBand: M.inBand, total: M.total });
      // Done when it's been stirred steady long enough — or the time's run well over.
      if (M.inBand >= need || M.total >= need * 2.5) { M.done = true; onDone((100 * M.inBand) / Math.max(M.total, need), `Stirred ${need}s`); }
    }
    const speed = playing ? M.speed : Number(s.st?.speed ?? 0.2);
    M.spin += speed * dt * 8;
    scene(ctx, t, fx.current, 0.25);
    const cx = W / 2, cy = 124, rx = 170, ry = 74;
    potTop(ctx, cx, cy, rx, ry, BREW);
    // The swirl, as fast as it's stirred.
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = `rgba(210,230,200,${0.1 + speed * 0.3})`; ctx.lineWidth = 2;
    for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.ellipse(cx, cy, 30 + j * 28, 12 + j * 12, 0, M.spin + j * 0.9, M.spin + j * 0.9 + 1.6 + speed); ctx.stroke(); }
    if (Math.random() < speed * 0.5) { const a = Math.random() * Math.PI * 2, r = Math.random(); fx.current.bits.push({ x: cx + Math.cos(a) * rx * r * 0.9, y: cy + Math.sin(a) * ry * r * 0.9, vx: 0, vy: -6, life: 0.5, max: 0.5, color: "rgba(200,225,190,0.5)", size: 3, g: 0 }); }
    ctx.restore();
    // The wooden spoon, riding round.
    const sa = M.spin * 0.6, sx = cx + Math.cos(sa) * rx * 0.55, sy = cy + Math.sin(sa) * ry * 0.55;
    ctx.strokeStyle = "#3a2615"; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sx + 2, sy + 2); ctx.lineTo(sx + 34, sy - 108); ctx.stroke();
    ctx.strokeStyle = "#7a5534"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 32, sy - 110); ctx.stroke(); ctx.lineCap = "butt";
    drawFx(ctx, fx.current, dt);
  };
  const M = L.current;
  const speed = playing ? M.speed : Number(s.st?.speed ?? 0.2), inBand = playing ? M.inBand : Number(s.st?.inBand ?? 0), total = playing ? M.total : Number(s.st?.total ?? 0);
  const pct = total > 0 ? Math.round((100 * inBand) / Math.max(total, 0.01)) : 0;
  return (
    <div className="space-y-2">
      <Pad testId="alchemy-mix-pad" playing={playing} frame={frame} onDown={() => { const m = L.current; m.started = true; m.speed = clamp(m.speed + 0.13 + (Math.random() * 2 - 1) * SK.mixKick[k]); }} />
      <Hud skill={k} playing={playing} gauge={<Gauge value={speed} lo={lo} hi={hi} text="pace" testId="alchemy-mix-gauge" />}
        chips={<><Chip label="Steady" value={`${Math.min(need, inBand).toFixed(1)} / ${need}s`} testId="alchemy-mix-steady" />{total > 0 && <Chip label="Even" value={`${pct}%`} color={pctColor(pct)} />}</>}
        hint={M.started || !playing ? "Tap the pot to stir — keep the pace inside the green band." : "Tap the pot to start stirring."} />
    </div>
  );
}

// --------------------------------------------------------------------------- dice
/** Dice: the knife sweeps back and forth, quicker after every cut — tap as it crosses each marked line. */
export function DiceGame({ step, s, set, playing, onDone, skill }: StepGameProps) {
  const k = lvl(skill);
  const n = Math.max(1, Math.min(8, Math.round(step.amount ?? 3)));
  const x0 = 0.12, x1 = 0.88;
  const lines = Array.from({ length: n }, (_, j) => x0 + ((j + 1) * (x1 - x0)) / (n + 1));
  const L = useRef({ phase: 0, cuts: [] as Array<{ at: number; score: number }>, done: false, chop: 0, spread: [] as number[] });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  useTick();
  const top = 96, bot = 164;
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const D = L.current;
    if (playing && !D.done) { D.phase += dt * (SK.diceSpeed[k] + D.cuts.length * 0.06); sync({ knife: knifeAt(D.phase), cuts: D.cuts }); }
    const cuts: Array<{ at: number; score: number }> = playing ? D.cuts : s.st?.cuts ?? [];
    const knife = playing ? knifeAt(D.phase) : Number(s.st?.knife ?? 0.5);
    scene(ctx, t, fx.current, 0.2);
    // The board: dark worn wood with its grain.
    const wood = ctx.createLinearGradient(0, 66, 0, 192); wood.addColorStop(0, "#4a3220"); wood.addColorStop(1, "#2b1d12");
    ctx.fillStyle = wood; ctx.fillRect(24, 66, W - 48, 126);
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
    for (let j = 0; j < 8; j++) { ctx.beginPath(); for (let x = 26; x <= W - 26; x += 16) { const y = 74 + j * 15 + Math.sin(x / 60 + j * 1.7) * 3; if (x === 26) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.strokeStyle = "#1a120b"; ctx.lineWidth = 2; ctx.strokeRect(24, 66, W - 48, 126);
    // The ingredient, in pieces that part where it's been cut.
    const sorted = [...cuts].map((c) => c.at).sort((a, b) => a - b);
    const edges = [x0, ...sorted, x1];
    while (D.spread.length < edges.length - 1) D.spread.push(0);
    for (let j = 0; j < edges.length - 1; j++) {
      D.spread[j] += (j * 7 - D.spread[j]) * Math.min(1, dt * 10);
      const off = D.spread[j] - ((edges.length - 2) * 7) / 2;
      const a = Math.round(edges[j] * W + off + 2), b = Math.round(edges[j + 1] * W + off - 2);
      const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, "#8f9a5a"); g.addColorStop(0.5, "#6b7640"); g.addColorStop(1, "#3f4724");
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(a + 3, top + 5, Math.max(4, b - a), bot - top);
      ctx.fillStyle = g; ctx.fillRect(a, top, Math.max(4, b - a), bot - top);
      ctx.fillStyle = "rgba(255,255,230,0.12)"; ctx.fillRect(a, top, Math.max(4, b - a), 4);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(a, bot - 5, Math.max(4, b - a), 5);
      if (j > 0) { ctx.fillStyle = "#c9d19a"; ctx.fillRect(a, top + 1, 2, bot - top - 2); }
    }
    // Cuts made: how true each was (gold true, stone fair, red ragged); lines still to cut, dashed.
    for (const c of cuts) { ctx.fillStyle = c.score >= 80 ? "#facc15" : c.score >= 50 ? "#a8a29e" : "#ef4444"; ctx.fillRect(Math.round(c.at * W) - 1, bot + 6, 3, 8); }
    ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(250,204,21,0.55)"; ctx.lineWidth = 2;
    for (const l of lines) { if (cuts.some((c) => Math.abs(c.at - l) < 0.06)) continue; ctx.beginPath(); ctx.moveTo(l * W, top - 10); ctx.lineTo(l * W, bot + 10); ctx.stroke(); }
    ctx.setLineDash([]);
    // The knife; it drops to chop.
    const kx = Math.round(knife * W);
    D.chop = Math.max(0, D.chop - dt * 5);
    const drop = Math.sin(Math.min(1, D.chop) * Math.PI) * 44;
    ctx.save(); ctx.translate(kx, drop + 10);
    const blade = ctx.createLinearGradient(-7, 0, 7, 0); blade.addColorStop(0, "#6b7280"); blade.addColorStop(0.5, "#d6d3d1"); blade.addColorStop(1, "#78716c");
    ctx.fillStyle = blade; ctx.beginPath(); ctx.moveTo(-7, 44); ctx.lineTo(7, 44); ctx.lineTo(3, 132); ctx.lineTo(-1, 136); ctx.lineTo(-3, 132); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2b1d12"; ctx.fillRect(-7, 12, 14, 32); ctx.fillStyle = "#57534e"; ctx.fillRect(-8, 40, 16, 4);
    ctx.restore();
    drawFx(ctx, fx.current, dt);
  };
  const tap = () => {
    const D = L.current;
    if (D.done) return;
    // The cut lands where the knife is — give or take how sure the hand is.
    const at = clamp(knifeAt(D.phase) + gauss() * SK.diceSlip[k], 0.02, 0.98);
    const open = lines.filter((l) => !D.cuts.some((c) => Math.abs(c.at - l) < 0.06));
    const nearest = open.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a), open[0] ?? at);
    const score = Math.max(0, Math.round(100 - Math.abs(nearest - at) * 1400));
    D.cuts = [...D.cuts, { at, score }];
    D.chop = 1;
    chips(fx.current, at * W, top + 10, "#8f9a5a", 8, 140, 700, 4);
    sync({ knife: at, cuts: D.cuts }, true);
    if (D.cuts.length >= n) { D.done = true; const sc = D.cuts.reduce((a, c) => a + c.score, 0) / n; setTimeout(() => onDone(sc, `Diced ${step.ingredient ?? "it"} into ${n + 1} pieces`), 600); }
  };
  const cuts: Array<{ at: number; score: number }> = playing ? L.current.cuts : s.st?.cuts ?? [];
  const avg = cuts.length ? Math.round(cuts.reduce((a, c) => a + c.score, 0) / cuts.length) : 0;
  return (
    <div className="space-y-2">
      <Pad testId="alchemy-dice-pad" playing={playing} frame={frame} onDown={tap} />
      <Hud skill={k} playing={playing} chips={<><Chip label="Cuts" value={`${cuts.length} / ${n}`} testId="alchemy-dice-cuts" />{cuts.length > 0 && <Chip label="Clean" value={`${avg}%`} color={pctColor(avg)} />}</>}
        hint="Tap as the knife crosses each dashed line — it quickens after every cut." />
    </div>
  );
}
const knifeAt = (phase: number) => 0.08 + 0.84 * tri(phase);

// --------------------------------------------------------------------------- heat
/** Heat: hold to work the bellows — the heat has momentum, draughts push it about, the mark drifts. Hold it there. */
export function HeatGame({ step, s, set, playing, onDone, skill }: StepGameProps) {
  const k = lvl(skill);
  const base = clamp((step.amount ?? 60) / 100, 0.15, 0.9);
  const band = SK.heatBand[k];
  const L = useRef({ temp: 0.2, vel: 0, hold: false, onMark: 0, over: 0, total: 0, done: false, gust: 0 });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  useTick();
  const need = 4;
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const HT = L.current;
    const mark = clamp(base + 0.07 * Math.sin(t * 0.55), 0.1, 0.95);
    if (playing && !HT.done) {
      // Draughts through the workshop: an unsure hand doesn't catch them.
      if (Math.random() < dt * 0.8) HT.gust = (Math.random() * 2 - 1) * SK.heatGust[k];
      HT.gust *= Math.pow(0.4, dt);
      HT.vel += ((HT.hold ? 0.55 : -0.42) + HT.gust) * dt; HT.vel *= Math.pow(0.35, dt);
      HT.temp = clamp(HT.temp + HT.vel * dt);
      HT.total += dt;
      if (Math.abs(HT.temp - mark) <= band) HT.onMark += dt;
      HT.over = Math.max(HT.over, HT.temp - (mark + band));
      sync({ temp: HT.temp, mark, onMark: HT.onMark, hold: HT.hold });
      if (HT.onMark >= need) { HT.done = true; onDone(100 * Math.min(1, (need / HT.total) * 1.6) - Math.max(0, HT.over) * 300, `Heated it to ${Math.round(mark * 100)}°`); }
    }
    const temp = playing ? HT.temp : Number(s.st?.temp ?? 0.2), mk = playing ? mark : Number(s.st?.mark ?? base);
    const hold = playing ? HT.hold : !!s.st?.hold;
    scene(ctx, t, fx.current, 0.25 + temp * 0.6 + (hold ? 0.2 : 0));
    // Coals under the pot, brighter with the heat.
    for (let j = 0; j < 14; j++) { const x = 170 + j * 22, y = 206 + (j % 3) * 4; ctx.fillStyle = heatColor(clamp(0.3 + temp * 0.7 * (0.75 + 0.25 * Math.sin(t * 5 + j))), "#3f3a36"); ctx.fillRect(x, y, 18, 10); }
    if (Math.random() < 0.2 + temp * 0.8) fx.current.bits.push({ x: 180 + Math.random() * 300, y: 204, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 60 - (hold ? 60 : 0), life: 0.6, max: 0.6, color: heatColor(0.75 + Math.random() * 0.25), size: 2, g: 0 });
    // The pot, side on: iron, glowing at its base as it heats; steam when it's right.
    const px = W / 2, py = 140;
    ctx.fillStyle = "#1b1c1f"; ctx.beginPath(); ctx.moveTo(px - 130, py - 50); ctx.lineTo(px + 130, py - 50); ctx.quadraticCurveTo(px + 140, py + 60, px, py + 62); ctx.quadraticCurveTo(px - 140, py + 60, px - 130, py - 50); ctx.fill();
    ctx.strokeStyle = "#3a3d44"; ctx.lineWidth = 3; ctx.stroke();
    const glow = ctx.createLinearGradient(0, py + 62, 0, py - 10); glow.addColorStop(0, heatColor(clamp(temp * 0.9), "#1b1c1f")); glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = clamp(temp * 0.9); ctx.fillStyle = glow; ctx.beginPath(); ctx.moveTo(px - 128, py); ctx.lineTo(px + 128, py); ctx.quadraticCurveTo(px + 138, py + 60, px, py + 60); ctx.quadraticCurveTo(px - 138, py + 60, px - 128, py); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = "#2a2c30"; ctx.fillRect(px - 140, py - 58, 280, 10);
    if (Math.abs(temp - mk) <= band && Math.random() < 0.5) fx.current.bits.push({ x: px - 100 + Math.random() * 200, y: py - 60, vx: (Math.random() - 0.5) * 10, vy: -30, life: 1.2, max: 1.2, color: "rgba(214,211,209,0.25)", size: 6, g: -10 });
    // The bellows, squeezed while held.
    const sq = hold ? 0.6 + 0.4 * Math.abs(Math.sin(t * 10)) : 1;
    ctx.fillStyle = "#4a3220"; ctx.beginPath(); ctx.moveTo(40, 196); ctx.lineTo(120, 186 + 10 * (1 - sq)); ctx.lineTo(120, 210); ctx.lineTo(40, 214); ctx.fill();
    ctx.fillStyle = "#57534e"; ctx.fillRect(120, 196, 46, 6);
    drawFx(ctx, fx.current, dt);
  };
  const HT = L.current;
  const temp = playing ? HT.temp : Number(s.st?.temp ?? 0.2), on = playing ? HT.onMark : Number(s.st?.onMark ?? 0);
  const markNow = Number(s.st?.mark ?? base);
  return (
    <div className="space-y-2">
      <Pad testId="alchemy-heat-pad" playing={playing} frame={frame} onDown={() => { L.current.hold = true; }} onUp={() => { L.current.hold = false; }} />
      <Hud skill={k} playing={playing} gauge={<Gauge value={temp} lo={markNow - band} hi={markNow + band} text={`${Math.round(temp * 100)}°`} testId="alchemy-heat-gauge" />}
        chips={<><Chip label="Mark" value={`${Math.round(markNow * 100)}°`} /><Chip label="On the mark" value={`${Math.min(need, on).toFixed(1)} / ${need}s`} testId="alchemy-heat-on" /></>}
        hint="Hold to work the bellows, let go to let it cool — keep the heat on the mark as it drifts." />
    </div>
  );
}

// --------------------------------------------------------------------------- add
/** Add: the dropper swings, the ripple drifts, and a drop takes a moment to fall — lead it. Three drops. */
export function AddGame({ step, s, set, playing, onDone, skill }: StepGameProps) {
  const k = lvl(skill);
  const drops = 3, fall = 0.55, surface = 176;
  const L = useRef({ t: 0, falling: [] as Array<{ x: number; at: number; drift: number }>, landed: [] as Array<{ x: number; score: number }>, done: false, rings: [] as Array<{ x: number; life: number; good: boolean }> });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  useTick();
  const dropperX = (t: number, j: number) => W / 2 + 230 * Math.sin(t * (1.5 + j * 0.25));
  const ringX = (t: number) => W / 2 + 170 * Math.sin(t * 0.8 + 1.3);
  const ring = SK.addRing[k];
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const A = L.current;
    if (playing && !A.done) {
      A.t += dt;
      for (const d of [...A.falling]) if (A.t - d.at >= fall) {
        A.falling = A.falling.filter((x) => x !== d);
        const x = d.x + d.drift;
        const score = Math.max(0, Math.round(100 - Math.max(0, Math.abs(x - ringX(A.t)) - ring * 0.25) * 1.15));
        A.landed = [...A.landed, { x, score }];
        A.rings.push({ x, life: 0.8, good: score >= 60 });
        chips(fx.current, x, surface, "#9fb4a0", 8, 110, 500, 3);
        if (A.landed.length >= drops) { A.done = true; setTimeout(() => onDone(A.landed.reduce((a, b) => a + b.score, 0) / drops, `Added ${step.ingredient ?? "it"} drop by drop`), 400); }
      }
      sync({ t: A.t, falling: A.falling, landed: A.landed });
    }
    const tt = playing ? A.t : Number(s.st?.t ?? 0);
    const landed: Array<{ x: number; score: number }> = playing ? A.landed : s.st?.landed ?? [];
    const falling: Array<{ x: number; at: number; drift: number }> = playing ? A.falling : s.st?.falling ?? [];
    const j = landed.length + falling.length;
    scene(ctx, t, fx.current, 0.2);
    // The brew in the pot, side on, and the ripple to drop into.
    ctx.fillStyle = "#1b1c1f"; ctx.fillRect(10, surface - 6, W - 20, H - surface);
    const lg = ctx.createLinearGradient(0, surface, 0, H); lg.addColorStop(0, BREW); lg.addColorStop(1, "#0d1210");
    ctx.fillStyle = lg; ctx.fillRect(18, surface, W - 36, H - surface);
    ctx.fillStyle = "#3a3d44"; ctx.fillRect(10, surface - 8, W - 20, 4);
    const rx = ringX(tt);
    ctx.strokeStyle = "rgba(250,204,21,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(rx, surface + 6, ring, 6, 0, 0, Math.PI * 2); ctx.stroke();
    // The dropper: glass, its bulb, a bead of the ingredient at its tip.
    if (j < drops) {
      const dx = dropperX(tt, j);
      ctx.fillStyle = "#2b1d12"; ctx.fillRect(dx - 7, 18, 14, 18);
      ctx.fillStyle = "rgba(214,211,209,0.35)"; ctx.fillRect(dx - 4, 36, 8, 30); ctx.strokeStyle = "rgba(214,211,209,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(dx - 4, 36, 8, 30);
      ctx.fillStyle = "#a78b5a"; ctx.fillRect(dx - 3, 66, 6, 6);
    }
    for (const d of falling) { const p = clamp((tt - d.at) / fall); ctx.fillStyle = "#c9b48a"; ctx.fillRect(Math.round(d.x + d.drift * p - 3), Math.round(70 + (surface - 70) * p * p - 3), 6, 6); }
    for (const r of L.current.rings) { r.life -= dt; ctx.strokeStyle = r.good ? `rgba(250,204,21,${r.life})` : `rgba(168,162,158,${r.life})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(r.x, surface + 6, 40 * (1.2 - r.life), 7 * (1.2 - r.life), 0, 0, Math.PI * 2); ctx.stroke(); }
    L.current.rings = L.current.rings.filter((x) => x.life > 0);
    drawFx(ctx, fx.current, dt);
  };
  // Your hand isn't quite still: a drop drifts on its way down.
  const tap = () => { const A = L.current; if (A.done || A.landed.length + A.falling.length >= drops) return; A.falling = [...A.falling, { x: dropperX(A.t, A.landed.length + A.falling.length), at: A.t, drift: (Math.random() * 2 - 1) * SK.addWind[k] }]; };
  const landed: Array<{ x: number; score: number }> = playing ? L.current.landed : s.st?.landed ?? [];
  const avg = landed.length ? Math.round(landed.reduce((a, b) => a + b.score, 0) / landed.length) : 0;
  return (
    <div className="space-y-2">
      <Pad testId="alchemy-add-pad" playing={playing} frame={frame} onDown={tap} />
      <Hud skill={k} playing={playing} chips={<><Chip label="Drops" value={`${landed.length} / ${drops}`} testId="alchemy-add-drops" />{landed.length > 0 && <Chip label="On target" value={`${avg}%`} color={pctColor(avg)} />}</>}
        hint="Tap to let a drop go — it lands a moment later, where the ripple will be by then." />
    </div>
  );
}

// --------------------------------------------------------------------------- grind
/** Grind: a ring closes on the mortar's rim — tap as it meets it. The beat quickens, and wanders in unsure hands. */
export function GrindGame({ step, s, set, playing, onDone, skill }: StepGameProps) {
  const k = lvl(skill);
  const need = Math.max(3, Math.min(12, Math.round(step.amount ?? 5)));
  const L = useRef({ t: 0, beat: 1.2, prev: 0, hits: [] as number[], tapped: false, done: false, press: 0, flash: 0, flashGood: false });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  useTick();
  const interval = (j: number) => Math.max(0.55, 1.05 - j * 0.06);
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const G = L.current;
    if (playing && !G.done) {
      G.t += dt;
      // Missed: the ring passed the rim with no tap.
      if (G.t > G.beat + 0.3) { if (!G.tapped) { G.hits = [...G.hits, 0]; G.flash = 0.5; G.flashGood = false; } G.tapped = false; G.prev = G.beat; G.beat += interval(G.hits.length) + (Math.random() * 2 - 1) * SK.grindJitter[k]; }
      sync({ t: G.t, beat: G.beat, prev: G.prev, hits: G.hits });
      if (G.hits.length >= need) { G.done = true; onDone(G.hits.reduce((a, b) => a + b, 0) / need, `Ground ${step.ingredient ?? "it"} ${need} strokes`); }
    }
    const tt = playing ? G.t : Number(s.st?.t ?? 0), beat = playing ? G.beat : Number(s.st?.beat ?? 1), prev = playing ? G.prev : Number(s.st?.prev ?? 0);
    scene(ctx, t, fx.current, 0.2);
    const cx = W / 2, cy = 132, r = 58;
    // The mortar: stone, from above, the powder in its bowl.
    ctx.fillStyle = "#121314"; ctx.beginPath(); ctx.arc(cx + 4, cy + 6, r + 4, 0, Math.PI * 2); ctx.fill();
    const sg = ctx.createRadialGradient(cx - 20, cy - 20, 4, cx, cy, r); sg.addColorStop(0, "#78716c"); sg.addColorStop(1, "#44403c");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#292524"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#6b7640"; ctx.beginPath(); ctx.arc(cx, cy + 4, r * 0.5, 0, Math.PI * 2); ctx.fill();
    G.flash = Math.max(0, G.flash - dt);
    ctx.strokeStyle = G.flash > 0 ? (G.flashGood ? "#facc15" : "#ef4444") : "#a8a29e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // The closing ring: the beat.
    const left = beat - tt, span = Math.max(0.3, beat - prev);
    if (left > -0.3) { const rr = r + Math.max(0, left / span) * 100; ctx.strokeStyle = `rgba(250,204,21,${clamp(0.25 + (1 - left / span) * 0.6)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); }
    // The pestle, pressing down on each stroke.
    G.press = Math.max(0, G.press - dt * 6);
    const py = cy - 44 + Math.sin(Math.min(1, G.press) * Math.PI) * 30;
    ctx.save(); ctx.translate(cx + 34, py); ctx.rotate(0.35);
    const pg = ctx.createLinearGradient(-9, 0, 9, 0); pg.addColorStop(0, "#57534e"); pg.addColorStop(0.5, "#a8a29e"); pg.addColorStop(1, "#57534e");
    ctx.fillStyle = pg; ctx.fillRect(-9, -44, 18, 84); ctx.restore();
    drawFx(ctx, fx.current, dt);
  };
  const tap = () => {
    const G = L.current;
    if (G.done || G.tapped) return;
    const err = Math.abs(G.t - G.beat);
    if (err > 0.4) { G.flash = 0.3; G.flashGood = false; return; }
    const sc = Math.max(0, Math.round(100 - err * SK.grindTol[k]));
    G.hits = [...G.hits, sc]; G.tapped = true; G.press = 1; G.flash = 0.3; G.flashGood = sc >= 55;
    chips(fx.current, W / 2, 132, "#8f9a5a", 6, 70, 200, 3);
    sync({ t: G.t, beat: G.beat, prev: G.prev, hits: G.hits }, true);
  };
  const hits: number[] = playing ? L.current.hits : s.st?.hits ?? [];
  const avg = hits.length ? Math.round(hits.reduce((a, b) => a + b, 0) / hits.length) : 0;
  return (
    <div className="space-y-2">
      <Pad testId="alchemy-grind-pad" playing={playing} frame={frame} onDown={tap} />
      <Hud skill={k} playing={playing} chips={<><Chip label="Strokes" value={`${hits.length} / ${need}`} testId="alchemy-grind-strokes" />{hits.length > 0 && <Chip label="Rhythm" value={`${avg}%`} color={pctColor(avg)} />}</>}
        hint="Tap as the ring meets the mortar's rim — a missed beat is a wasted stroke." />
    </div>
  );
}

// --------------------------------------------------------------------------- strain
/** Strain: hold to tip the pot — the flow follows slowly. Too slow and it takes forever; too fast and it spills. */
export function StrainGame({ s, set, playing, onDone, skill }: Omit<StepGameProps, "step"> & { step?: AlchemyStep }) {
  const k = lvl(skill);
  const [lo, hi] = SK.strainBand[k];
  const L = useRef({ hold: false, tilt: 0, flow: 0, poured: 0, spill: 0, total: 0, done: false });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  useTick();
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const S = L.current;
    if (playing && !S.done) {
      S.tilt = clamp(S.tilt + (S.hold ? 0.9 : -1.2) * dt + (S.hold ? (Math.random() * 2 - 1) * SK.strainShake[k] * dt * 4 : 0));
      S.flow += (S.tilt - S.flow) * Math.min(1, dt * 2.2);
      S.poured = Math.min(100, S.poured + S.flow * dt * 22);
      if (S.flow > hi) S.spill += (S.flow - hi) * dt * 45;
      if (S.poured > 0) S.total += dt;
      sync({ flow: S.flow, poured: S.poured, spill: S.spill, tilt: S.tilt });
      if (S.poured >= 100) { S.done = true; onDone(100 - S.spill * 2.5 - Math.max(0, S.total - 9) * 4, "Strained it"); }
    }
    const flow = playing ? S.flow : Number(s.st?.flow ?? 0), poured = playing ? S.poured : Number(s.st?.poured ?? 0), tilt = playing ? S.tilt : Number(s.st?.tilt ?? 0);
    scene(ctx, t, fx.current, 0.2);
    // The pot tipping over a cloth sieve into a glass flask.
    ctx.save(); ctx.translate(200, 92); ctx.rotate(tilt * 0.9);
    ctx.fillStyle = "#1b1c1f"; ctx.fillRect(-70, -34, 140, 76); ctx.strokeStyle = "#3a3d44"; ctx.lineWidth = 3; ctx.strokeRect(-70, -34, 140, 76);
    ctx.fillStyle = "#2a2c30"; ctx.fillRect(-76, -40, 152, 8);
    ctx.restore();
    if (flow > 0.04) { ctx.strokeStyle = `rgba(85,122,82,${0.5 + flow * 0.4})`; ctx.lineWidth = 2 + flow * 9; ctx.beginPath(); ctx.moveTo(268, 100 + tilt * 30); ctx.quadraticCurveTo(300, 130, 312, 156); ctx.stroke(); }
    ctx.fillStyle = "#d6d3d1"; ctx.globalAlpha = 0.5; ctx.fillRect(272, 156, 80, 4); ctx.globalAlpha = 1;
    // The flask: its glass, and what's been strained into it.
    const fxl = 286, fw = 52, fy = 168, fh = 54;
    ctx.fillStyle = BREW; ctx.fillRect(fxl, fy + fh - (poured / 100) * fh, fw, (poured / 100) * fh);
    ctx.strokeStyle = "rgba(214,211,209,0.55)"; ctx.lineWidth = 2; ctx.strokeRect(fxl, fy, fw, fh);
    if (flow > 0.05 && Math.random() < flow) fx.current.bits.push({ x: 312 + (Math.random() - 0.5) * 10, y: 158, vx: (Math.random() - 0.5) * 16, vy: 50, life: 0.35, max: 0.35, color: "rgba(140,170,135,0.85)", size: 3, g: 600 });
    if (flow > hi && Math.random() < 0.6) fx.current.bits.push({ x: 312, y: 156, vx: (Math.random() - 0.5) * 220, vy: -50, life: 0.6, max: 0.6, color: "rgba(85,122,82,0.95)", size: 4, g: 700 });
    drawFx(ctx, fx.current, dt);
  };
  const S = L.current;
  const flow = playing ? S.flow : Number(s.st?.flow ?? 0), poured = playing ? S.poured : Number(s.st?.poured ?? 0), spill = playing ? S.spill : Number(s.st?.spill ?? 0);
  return (
    <div className="space-y-2">
      <Pad testId="alchemy-strain-pad" playing={playing} frame={frame} onDown={() => { L.current.hold = true; }} onUp={() => { L.current.hold = false; }} />
      <Hud skill={k} playing={playing} gauge={<Gauge value={flow} lo={lo} hi={hi} text="flow" testId="alchemy-strain-gauge" />}
        chips={<><Chip label="Strained" value={`${Math.round(poured)}%`} testId="alchemy-strain-poured" />{spill > 0.5 && <Chip label="Spilt" value={`${Math.round(spill)}`} color="#f87171" />}</>}
        hint="Hold to tip the pot, let go to ease it back — keep the flow in the green band." />
    </div>
  );
}

// --------------------------------------------------------------------------- rest
/** Rest: while it settles, dark scum rises — skim it off before it sinks back. Leave the golden glints alone. */
export function RestGame({ step, s, set, playing, onDone, skill }: StepGameProps) {
  const k = lvl(skill);
  const need = Math.max(4, Math.min(30, step.amount ?? 6));
  type Mote = { id: number; x: number; y: number; life: number; gold: boolean };
  const L = useRef({ t: 0, next: 0.6, motes: [] as Mote[], seq: 0, spawned: 0, skimmed: 0, wrong: 0, done: false, marks: [] as Array<{ x: number; y: number; life: number; good: boolean }> });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  useTick();
  const cx = W / 2, cy = 124, rx = 250, ry = 70;
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const R = L.current;
    if (playing && !R.done) {
      R.t += dt;
      if (R.t >= R.next) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.85;
        const gold = Math.random() < SK.restGold[k];
        R.motes.push({ id: R.seq++, x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, life: gold ? 1.3 : SK.restLife[k], gold });
        if (!gold) R.spawned++;
        R.next = R.t + 0.4 + Math.random() * 0.5;
      }
      for (const m of R.motes) m.life -= dt;
      R.motes = R.motes.filter((m) => m.life > 0);
      sync({ t: R.t, motes: R.motes, skimmed: R.skimmed, spawned: R.spawned, wrong: R.wrong });
      if (R.t >= need) { R.done = true; onDone((100 * R.skimmed) / Math.max(1, R.spawned) - R.wrong * 20, `Let it rest ${need}s, skimming as it settled`); }
    }
    const motes: Mote[] = playing ? R.motes : s.st?.motes ?? [];
    scene(ctx, t, fx.current, 0.2);
    potTop(ctx, cx, cy, rx, ry, BREW);
    for (const m of motes) {
      const a = clamp(m.life * 2);
      if (m.gold) { ctx.fillStyle = `rgba(250,204,21,${a})`; ctx.fillRect(Math.round(m.x) - 3, Math.round(m.y) - 3, 6, 6); ctx.fillStyle = `rgba(255,250,220,${a * 0.8})`; ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 2, 2); }
      else { ctx.fillStyle = `rgba(20,18,16,${a})`; ctx.fillRect(Math.round(m.x) - 7, Math.round(m.y) - 5, 14, 10); ctx.fillStyle = `rgba(68,64,60,${a})`; ctx.fillRect(Math.round(m.x) - 5, Math.round(m.y) - 5, 6, 3); }
    }
    for (const p of R.marks) { p.life -= dt; ctx.strokeStyle = p.good ? `rgba(250,204,21,${p.life * 2})` : `rgba(239,68,68,${p.life * 2})`; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - 12 * (1.5 - p.life), p.y - 9 * (1.5 - p.life), 24 * (1.5 - p.life), 18 * (1.5 - p.life)); }
    R.marks = R.marks.filter((p) => p.life > 0);
    if (Math.random() < 0.2) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.8; fx.current.bits.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, vx: 0, vy: -5, life: 0.8, max: 0.8, color: "rgba(200,225,190,0.3)", size: 3, g: 0 }); }
    drawFx(ctx, fx.current, dt);
  };
  const tap = (x: number, y: number) => {
    const R = L.current;
    if (R.done) return;
    const hit = R.motes.map((m) => ({ m, d: Math.hypot(m.x - x, m.y - y) })).filter((h) => h.d < 30).sort((a, b) => a.d - b.d)[0];
    if (!hit) return;
    R.motes = R.motes.filter((m) => m !== hit.m);
    if (hit.m.gold) R.wrong++; else R.skimmed++;
    R.marks.push({ x: hit.m.x, y: hit.m.y, life: 0.5, good: !hit.m.gold });
    chips(fx.current, hit.m.x, hit.m.y, hit.m.gold ? "#facc15" : "#292524", 6, 70, 200, 3);
  };
  const R = L.current;
  const tt = playing ? R.t : Number(s.st?.t ?? 0), skimmed = playing ? R.skimmed : Number(s.st?.skimmed ?? 0), spawned = playing ? R.spawned : Number(s.st?.spawned ?? 0), wrong = playing ? R.wrong : Number(s.st?.wrong ?? 0);
  return (
    <div className="space-y-2">
      <Pad testId="alchemy-rest-pad" playing={playing} frame={frame} onDown={tap} />
      <Hud skill={k} playing={playing} chips={<><Chip label="Settling" value={`${Math.min(need, tt).toFixed(1)} / ${need}s`} /><Chip label="Skimmed" value={`${skimmed} / ${spawned}`} testId="alchemy-rest-skimmed" />{wrong > 0 && <Chip label="Glints lost" value={`${wrong}`} color="#f87171" />}</>}
        hint="Tap the dark scum to skim it off before it sinks — leave the golden glints." />
    </div>
  );
}
