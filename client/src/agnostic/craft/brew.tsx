// The alchemy steps as small games of skill — each a tap or a hold on one pad
// (never a drag, so the page doesn't scroll or the panel move under it), each
// scored 0–100, and shared live: whoever watches sees the same pot.
import React, { useEffect, useRef } from "react";
import type { AlchemyStep } from "@shared/agnostic/crafting";
import type { CraftState } from "./session";

export interface StepGameProps { step: AlchemyStep; s: CraftState; set: (p: CraftState) => void; playing: boolean; onDone: (score: number, detail: string) => void }

const W = 640, H = 220;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const tri = (x: number) => { const f = x - Math.floor(x); return f < 0.5 ? f * 2 : 2 - f * 2; };

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

/** Background, a title line and a progress bar along the bottom. */
function frameBase(ctx: CanvasRenderingContext2D, hue: number, title: string, progress: number) {
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0c0f0f"); bg.addColorStop(1, "#050606");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.7, 10, W / 2, H * 0.7, 320); g.addColorStop(0, `hsla(${hue},80%,45%,0.18)`); g.addColorStop(1, "transparent");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(231,229,228,0.85)"; ctx.font = "600 22px ui-sans-serif, system-ui"; ctx.textAlign = "left"; ctx.fillText(title, 14, 30);
  ctx.fillStyle = "#292524"; ctx.fillRect(14, H - 12, W - 28, 5);
  ctx.fillStyle = "#f59e0b"; ctx.fillRect(14, H - 12, (W - 28) * clamp(progress), 5);
}
/** A labelled meter: a rounded track, its good band glowing green, and the needle. */
function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, value: number, lo: number, hi: number, label: string) {
  const ok = value >= lo && value <= hi;
  ctx.save();
  ctx.fillStyle = "#1c1917"; ctx.beginPath(); ctx.roundRect(x, y, w, 16, 8); ctx.fill();
  ctx.strokeStyle = "#44403c"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = ok ? "rgba(34,197,94,0.45)" : "rgba(34,197,94,0.25)"; ctx.shadowColor = "#22c55e"; ctx.shadowBlur = ok ? 12 : 0;
  ctx.beginPath(); ctx.roundRect(x + w * lo, y + 1, w * (hi - lo), 14, 6); ctx.fill(); ctx.shadowBlur = 0;
  const col = ok ? "#4ade80" : value < lo ? "#60a5fa" : "#f87171";
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.roundRect(x + w * clamp(value) - 4, y - 5, 8, 26, 4); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#a8a29e"; ctx.font = "16px ui-sans-serif, system-ui"; ctx.textAlign = "left"; ctx.fillText(label, x, y - 9);
}

// Little effects: sparks and chips that fly, and words that pop up over a hit (how good it was).
interface Fx { bits: Array<{ x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }>; pops: Array<{ x: number; y: number; text: string; color: string; life: number }> }
const newFx = (): Fx => ({ bits: [], pops: [] });
function burst(fx: Fx, x: number, y: number, color: string, n = 10, speed = 160, g = 420, size = 3) {
  for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2; const v = speed * (0.4 + Math.random() * 0.8); fx.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0.5 + Math.random() * 0.5, max: 1, color, size: size * (0.6 + Math.random() * 0.8), g }); }
}
function pop(fx: Fx, x: number, y: number, score: number, words: [string, string, string] = ["Perfect!", "Good", "Off"]) {
  const [text, color] = score >= 85 ? [words[0], "#fde047"] : score >= 55 ? [words[1], "#86efac"] : [words[2], "#fca5a5"];
  fx.pops.push({ x, y, text, color, life: 0.9 });
}
function drawFx(ctx: CanvasRenderingContext2D, fx: Fx, dt: number) {
  for (const b of fx.bits) { b.life -= dt; b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; ctx.globalAlpha = clamp(b.life / b.max); ctx.fillStyle = b.color; ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size); }
  fx.bits = fx.bits.filter((b) => b.life > 0);
  for (const p of fx.pops) { p.life -= dt; ctx.globalAlpha = clamp(p.life * 1.6); ctx.fillStyle = p.color; ctx.font = "800 26px ui-sans-serif, system-ui"; ctx.textAlign = "center"; ctx.fillText(p.text, p.x, p.y - (0.9 - p.life) * 40); }
  fx.pops = fx.pops.filter((p) => p.life > 0);
  ctx.globalAlpha = 1;
}
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

// --------------------------------------------------------------------------- mix
/** Stir: the vortex keeps slowing (in gusts) — tap to stir, and keep its speed in the green for the time asked. */
export function MixGame({ step, s, set, playing, onDone }: StepGameProps) {
  const need = Math.max(3, Math.min(30, step.amount ?? 8));
  const L = useRef({ speed: 0.2, inBand: 0, total: 0, started: false, done: false, spin: 0, was: false });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  const lo = 0.45, hi = 0.7;
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const M = L.current;
    if (playing && M.started && !M.done) {
      M.speed = clamp(M.speed - (0.22 + 0.16 * Math.max(0, Math.sin(t * 1.7)) + 0.1 * Math.max(0, Math.sin(t * 4.1))) * dt);
      M.total += dt;
      if (M.speed >= lo && M.speed <= hi) M.inBand += dt;
      sync({ speed: M.speed, inBand: M.inBand });
      if (M.inBand >= need) { M.done = true; onDone((100 * M.inBand) / Math.max(M.total, M.inBand) + 5, `Stirred ${need}s at a steady pace`); }
    }
    const speed = playing ? M.speed : Number(s.st?.speed ?? 0.2), inBand = playing ? M.inBand : Number(s.st?.inBand ?? 0);
    M.spin += speed * dt * 9;
    frameBase(ctx, 150, playing ? (M.started ? "Tap to stir — keep the speed in the green" : "Tap to start stirring") : "Stirring…", inBand / need);
    // The pot from above: the vortex turns as fast as it's stirred.
    const cx = 210, cy = 118;
    ctx.fillStyle = "#1b1c1f"; ctx.beginPath(); ctx.arc(cx, cy, 82, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "hsl(150,70%,28%)"; ctx.beginPath(); ctx.arc(cx, cy, 72, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `hsla(150,90%,75%,${0.3 + speed * 0.6})`; ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); for (let a = 0; a < 5; a += 0.1) { const r = 6 + a * 13; const ang = M.spin + k * (Math.PI / 2) + a * 0.9; const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r; if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    // Bubbles thrown up by the stirring; the spoon riding round the vortex.
    if (Math.random() < speed * 0.6) { const a = Math.random() * Math.PI * 2, r = Math.random() * 60; fx.current.bits.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: -20, life: 0.6, max: 0.6, color: "rgba(167,243,208,0.7)", size: 4, g: 0 }); }
    const sa = M.spin * 0.6, sx = cx + Math.cos(sa) * 46, sy = cy + Math.sin(sa) * 46;
    ctx.strokeStyle = "#8b6b46"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 26, sy - 70); ctx.stroke(); ctx.lineCap = "butt";
    const inNow = speed >= lo && speed <= hi;
    if (playing && inNow && !M.was) pop(fx.current, 470, 70, 100, ["Steady!", "Steady!", "Steady!"]);
    M.was = inNow;
    drawFx(ctx, fx.current, dt);
    meter(ctx, 330, 100, 280, speed, lo, hi, "Speed");
    ctx.fillStyle = "#a8a29e"; ctx.font = "17px ui-sans-serif, system-ui"; ctx.fillText(`${Math.min(need, inBand).toFixed(1)} / ${need}s steady`, 330, 150);
  };
  return <Pad testId="alchemy-mix-pad" playing={playing} frame={frame} onDown={() => { const M = L.current; M.started = true; M.speed = clamp(M.speed + 0.13); }} />;
}

// --------------------------------------------------------------------------- dice
/** Dice: the knife sweeps back and forth, faster after every cut — tap as it crosses each marked line. */
export function DiceGame({ step, s, set, playing, onDone }: StepGameProps) {
  const n = Math.max(1, Math.min(8, Math.round(step.amount ?? 3)));
  const x0 = 0.12, x1 = 0.88;
  const lines = Array.from({ length: n }, (_, k) => x0 + ((k + 1) * (x1 - x0)) / (n + 1));
  const L = useRef({ phase: 0, cuts: [] as Array<{ at: number; score: number }>, done: false, chop: 0, trail: [] as number[], spread: [] as number[] });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  const top = 92, bot = 160;
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const D = L.current;
    if (playing && !D.done) { D.phase += dt * (0.32 + D.cuts.length * 0.07); sync({ knife: knifeAt(D.phase), cuts: D.cuts }); }
    const cuts: Array<{ at: number; score: number }> = playing ? D.cuts : s.st?.cuts ?? [];
    const knife = playing ? knifeAt(D.phase) : Number(s.st?.knife ?? 0.5);
    frameBase(ctx, 95, playing ? "Tap to chop as the knife crosses each line" : "Dicing…", cuts.length / n);
    // The board: warm wood with its grain.
    const wood = ctx.createLinearGradient(0, 62, 0, 186); wood.addColorStop(0, "#5a3d24"); wood.addColorStop(1, "#3a2615");
    ctx.fillStyle = wood; ctx.beginPath(); ctx.roundRect(24, 62, W - 48, 124, 12); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) { ctx.beginPath(); for (let x = 30; x <= W - 30; x += 20) { const y = 72 + k * 16 + Math.sin(x / 55 + k * 1.7) * 4; if (x === 30) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    // The ingredient, in pieces that slide apart where it's been cut.
    const sorted = [...cuts].map((c) => c.at).sort((a, b) => a - b);
    const edges = [x0, ...sorted, x1];
    while (D.spread.length < edges.length - 1) D.spread.push(0);
    for (let k = 0; k < edges.length - 1; k++) {
      D.spread[k] += (k * 8 - D.spread[k]) * Math.min(1, dt * 10);
      const off = D.spread[k] - ((edges.length - 2) * 8) / 2;
      const a = edges[k] * W + off + 2, b = edges[k + 1] * W + off - 2;
      const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, "#b5d977"); g.addColorStop(0.5, "#7fa83d"); g.addColorStop(1, "#4d6b1f");
      ctx.fillStyle = g; ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.roundRect(a, top, Math.max(4, b - a), bot - top, k === 0 ? [30, 8, 8, 30] : k === edges.length - 2 ? [8, 30, 30, 8] : 8); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // Its veins and a sheen, so it reads as a root, not a block.
      ctx.save(); ctx.beginPath(); ctx.roundRect(a, top, Math.max(4, b - a), bot - top, 8); ctx.clip();
      ctx.strokeStyle = "rgba(230,255,190,0.35)"; ctx.lineWidth = 2;
      for (let v = 0; v < 3; v++) { ctx.beginPath(); ctx.moveTo(a, top + 18 + v * 16); ctx.bezierCurveTo(a + 40, top + 10 + v * 16, b - 40, top + 26 + v * 16, b, top + 18 + v * 16); ctx.stroke(); }
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(a, top + 4, b - a, 8);
      ctx.restore();
      if (k > 0) { ctx.fillStyle = "#e2f5c4"; ctx.fillRect(a - 1, top + 2, 3, bot - top - 4); }
    }
    // Lines still to cut, gently pulsing.
    ctx.setLineDash([7, 6]); ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.25 * Math.sin(t * 5)})`; ctx.lineWidth = 2.5;
    for (const l of lines) { if (cuts.some((c) => Math.abs(c.at - l) < 0.06)) continue; ctx.beginPath(); ctx.moveTo(l * W, top - 12); ctx.lineTo(l * W, bot + 12); ctx.stroke(); }
    ctx.setLineDash([]);
    // The knife, with a blur of where it's just been; it drops to chop.
    const kx = knife * W;
    D.trail.unshift(kx); D.trail = D.trail.slice(0, 6);
    D.chop = Math.max(0, D.chop - dt * 5);
    const drop = Math.sin(Math.min(1, D.chop) * Math.PI) * 46;
    D.trail.forEach((tx, k) => { if (!k) return; ctx.fillStyle = `rgba(231,229,228,${0.12 - k * 0.018})`; ctx.fillRect(tx - 4, 58, 8, 88); });
    ctx.save(); ctx.translate(kx, drop + 14);
    const blade = ctx.createLinearGradient(-8, 0, 8, 0); blade.addColorStop(0, "#9ca3af"); blade.addColorStop(0.5, "#f5f5f4"); blade.addColorStop(1, "#a8a29e");
    ctx.fillStyle = blade; ctx.beginPath(); ctx.moveTo(-8, 44); ctx.lineTo(8, 44); ctx.lineTo(3, 132); ctx.lineTo(-1, 136); ctx.lineTo(-3, 132); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3f2a1d"; ctx.beginPath(); ctx.roundRect(-8, 12, 16, 34, 4); ctx.fill();
    ctx.fillStyle = "#d4a24c"; ctx.fillRect(-9, 42, 18, 4);
    ctx.restore();
    drawFx(ctx, fx.current, dt);
  };
  const tap = () => {
    const D = L.current;
    if (D.done) return;
    const at = knifeAt(D.phase);
    const open = lines.filter((l) => !D.cuts.some((c) => Math.abs(c.at - l) < 0.06));
    const nearest = open.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a), open[0] ?? at);
    const err = Math.abs(nearest - at);
    const score = Math.max(0, Math.round(100 - err * 1100));
    D.cuts = [...D.cuts, { at, score }];
    D.chop = 1;
    burst(fx.current, at * W, top + 30, "#b5d977", 12, 180, 600, 4);
    pop(fx.current, at * W, top - 6, score, ["Clean!", "Good", "Ragged"]);
    sync({ knife: at, cuts: D.cuts }, true);
    if (D.cuts.length >= n) { D.done = true; const sc = D.cuts.reduce((a, c) => a + c.score, 0) / n; setTimeout(() => onDone(sc, `Diced ${step.ingredient ?? "it"} into ${n + 1} pieces`), 700); }
  };
  return <Pad testId="alchemy-dice-pad" playing={playing} frame={frame} onDown={tap} />;
}
const knifeAt = (phase: number) => 0.08 + 0.84 * tri(phase);

// --------------------------------------------------------------------------- heat
/** Heat: hold to stoke the fire — the heat has momentum, and the mark drifts. Keep it on the mark for 3 seconds. */
export function HeatGame({ step, s, set, playing, onDone }: StepGameProps) {
  const base = clamp((step.amount ?? 60) / 100, 0.15, 0.9);
  const L = useRef({ temp: 0.2, vel: 0, hold: false, onMark: 0, over: 0, total: 0, done: false });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  const need = 3;
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const HT = L.current;
    const mark = clamp(base + 0.06 * Math.sin(t * 0.55), 0.1, 0.95);
    if (playing && !HT.done) {
      HT.vel += (HT.hold ? 0.55 : -0.42) * dt; HT.vel *= Math.pow(0.35, dt);
      HT.temp = clamp(HT.temp + HT.vel * dt);
      HT.total += dt;
      if (Math.abs(HT.temp - mark) <= 0.05) HT.onMark += dt;
      HT.over = Math.max(HT.over, HT.temp - (mark + 0.05));
      sync({ temp: HT.temp, mark, onMark: HT.onMark, hold: HT.hold });
      if (HT.onMark >= need) { HT.done = true; onDone(100 - Math.max(0, HT.over) * 300 - Math.max(0, HT.total - 10) * 3, `Heated it to ${Math.round(mark * 100)}°`); }
    }
    const temp = playing ? HT.temp : Number(s.st?.temp ?? 0.2), mk = playing ? mark : Number(s.st?.mark ?? base), on = playing ? HT.onMark : Number(s.st?.onMark ?? 0);
    const hold = playing ? HT.hold : !!s.st?.hold;
    frameBase(ctx, 20, playing ? "Hold to stoke the fire — keep the heat on the mark" : "Heating…", on / need);
    // Flames rise with the heat.
    for (let k = 0; k < 11; k++) {
      const fx = 80 + k * 22, fh = (14 + temp * 70) * (0.7 + 0.3 * Math.sin(t * 9 + k * 1.7)) * (hold ? 1.15 : 1);
      const g = ctx.createLinearGradient(0, 190, 0, 190 - fh); g.addColorStop(0, "rgba(255,90,20,0.95)"); g.addColorStop(0.6, "rgba(255,190,60,0.7)"); g.addColorStop(1, "rgba(255,240,180,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx - 11, 190); ctx.quadraticCurveTo(fx, 190 - fh * 1.3, fx + 11, 190); ctx.fill();
    }
    // The pot over the fire: it glows as it heats, and steams when it's on the mark.
    ctx.fillStyle = "#1b1c1f"; ctx.beginPath(); ctx.ellipse(190, 128, 100, 44, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = `hsla(20,90%,${30 + temp * 30}%,${0.3 + temp * 0.5})`; ctx.beginPath(); ctx.ellipse(190, 128, 92, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4b4f57"; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(190, 128, 100, 16, 0, 0, Math.PI * 2); ctx.stroke();
    if (Math.abs(temp - mk) <= 0.05 && Math.random() < 0.4) fx.current.bits.push({ x: 120 + Math.random() * 140, y: 118, vx: (Math.random() - 0.5) * 12, vy: -40, life: 1.1, max: 1.1, color: "rgba(231,229,228,0.35)", size: 9, g: -20 });
    drawFx(ctx, fx.current, dt);
    meter(ctx, 360, 100, 250, temp, mk - 0.05, mk + 0.05, `Heat ${Math.round(temp * 100)}° — mark ${Math.round(mk * 100)}°`);
    ctx.fillStyle = "#a8a29e"; ctx.font = "17px ui-sans-serif, system-ui"; ctx.textAlign = "left"; ctx.fillText(`${Math.min(need, on).toFixed(1)} / ${need}s on the mark`, 360, 150);
  };
  return <Pad testId="alchemy-heat-pad" playing={playing} frame={frame} onDown={() => { L.current.hold = true; }} onUp={() => { L.current.hold = false; }} />;
}

// --------------------------------------------------------------------------- add
/** Add: the dropper swings, the ring drifts, and a drop takes a moment to fall — lead it. Three drops. */
export function AddGame({ step, s, set, playing, onDone }: StepGameProps) {
  const drops = 3, fall = 0.55, surface = 168;
  const L = useRef({ t: 0, falling: [] as Array<{ x: number; at: number }>, landed: [] as Array<{ x: number; score: number }>, done: false, splash: [] as Array<{ x: number; life: number; good: boolean }> });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  const dropperX = (t: number, k: number) => W / 2 + 230 * Math.sin(t * (1.5 + k * 0.25));
  const ringX = (t: number) => W / 2 + 170 * Math.sin(t * 0.8 + 1.3);
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const A = L.current;
    if (playing && !A.done) {
      A.t += dt;
      for (const d of [...A.falling]) if (A.t - d.at >= fall) {
        A.falling = A.falling.filter((x) => x !== d);
        const err = Math.abs(d.x - ringX(A.t));
        const score = Math.max(0, Math.round(100 - err * 0.75));
        A.landed = [...A.landed, { x: d.x, score }];
        A.splash.push({ x: d.x, life: 0.8, good: score >= 60 });
        burst(fx.current, d.x, surface, score >= 60 ? "#f0abfc" : "#a78bfa", 14, 150, 500, 4);
        pop(fx.current, d.x, surface - 30, score, ["Bullseye!", "Close", "Missed"]);
        if (A.landed.length >= drops) { A.done = true; setTimeout(() => onDone(A.landed.reduce((a, b) => a + b.score, 0) / drops, `Added ${step.ingredient ?? "it"} drop by drop`), 400); }
      }
      sync({ t: A.t, falling: A.falling, landed: A.landed });
    }
    const tt = playing ? A.t : Number(s.st?.t ?? 0);
    const landed: Array<{ x: number; score: number }> = playing ? A.landed : s.st?.landed ?? [];
    const falling: Array<{ x: number; at: number }> = playing ? A.falling : s.st?.falling ?? [];
    const k = landed.length + falling.length;
    frameBase(ctx, 280, playing ? "Tap to let a drop go — it lands a moment later" : "Adding…", landed.length / drops);
    // The brew's surface and the ring to hit.
    ctx.fillStyle = "hsl(280,60%,28%)"; ctx.fillRect(0, surface, W, H - surface - 14);
    const rx = ringX(tt);
    ctx.strokeStyle = "#f0abfc"; ctx.lineWidth = 3; ctx.shadowColor = "#e879f9"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.ellipse(rx, surface + 4, 34, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    // The dropper.
    if (k < drops) { const dx = dropperX(tt, k); ctx.fillStyle = "#d6d3d1"; ctx.fillRect(dx - 4, 34, 8, 26); ctx.fillStyle = "#e879f9"; ctx.beginPath(); ctx.arc(dx, 66, 6, 0, Math.PI * 2); ctx.fill(); }
    for (const d of falling) { const p = clamp((tt - d.at) / fall); ctx.fillStyle = "#f5d0fe"; ctx.beginPath(); ctx.arc(d.x, 66 + (surface - 66) * p * p, 6, 0, Math.PI * 2); ctx.fill(); }
    for (const sp of L.current.splash) { sp.life -= dt; ctx.strokeStyle = sp.good ? `rgba(74,222,128,${sp.life})` : `rgba(248,113,113,${sp.life})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sp.x, surface + 4, 40 * (1.2 - sp.life), 9 * (1.2 - sp.life), 0, 0, Math.PI * 2); ctx.stroke(); }
    L.current.splash = L.current.splash.filter((x) => x.life > 0);
    drawFx(ctx, fx.current, dt);
    ctx.fillStyle = "#a8a29e"; ctx.font = "17px ui-sans-serif, system-ui"; ctx.textAlign = "right"; ctx.fillText(landed.map((l) => `${l.score}%`).join("  ") || `${drops} drops`, W - 14, 58);
  };
  const tap = () => { const A = L.current; if (A.done || A.landed.length + A.falling.length >= drops) return; A.falling = [...A.falling, { x: dropperX(A.t, A.landed.length + A.falling.length), at: A.t }]; };
  return <Pad testId="alchemy-add-pad" playing={playing} frame={frame} onDown={tap} />;
}

// --------------------------------------------------------------------------- grind
/** Grind: a ring closes on the mortar — tap as it meets the edge. The beat quickens. */
export function GrindGame({ step, s, set, playing, onDone }: StepGameProps) {
  const need = Math.max(3, Math.min(12, Math.round(step.amount ?? 5)));
  const L = useRef({ t: 0, beat: 1.2, hits: [] as number[], tapped: false, done: false, word: "", wordLife: 0, press: 0 });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  const interval = (k: number) => Math.max(0.55, 1.05 - k * 0.06);
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const G = L.current;
    if (playing && !G.done) {
      G.t += dt;
      // Missed: the ring passed the edge with no tap.
      if (G.t > G.beat + 0.3) { if (!G.tapped) { G.hits = [...G.hits, 0]; G.word = "Miss"; G.wordLife = 0.6; } G.tapped = false; G.beat += interval(G.hits.length); }
      sync({ t: G.t, beat: G.beat, hits: G.hits });
      if (G.hits.length >= need) { G.done = true; onDone(G.hits.reduce((a, b) => a + b, 0) / need, `Ground ${step.ingredient ?? "it"} ${need} strokes`); }
    }
    const tt = playing ? G.t : Number(s.st?.t ?? 0), beat = playing ? G.beat : Number(s.st?.beat ?? 1);
    const hits: number[] = playing ? G.hits : s.st?.hits ?? [];
    frameBase(ctx, 45, playing ? "Tap as the ring meets the mortar's edge" : "Grinding…", hits.length / need);
    const cx = W / 2, cy = 118, r = 48;
    ctx.fillStyle = "#44403c"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78716c"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const left = beat - tt, span = interval(hits.length);
    if (left > -0.3) { const rr = r + Math.max(0, left / span) * 90; ctx.strokeStyle = `rgba(253,230,138,${clamp(1 - left / span + 0.3)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); }
    if (G.wordLife > 0) { G.wordLife -= dt; ctx.fillStyle = `rgba(253,230,138,${G.wordLife * 1.6})`; ctx.font = "700 24px ui-sans-serif, system-ui"; ctx.textAlign = "center"; ctx.fillText(G.word, cx + r + 90, cy + 8); }
    // The pestle, pressing down on each stroke.
    G.press = Math.max(0, G.press - dt * 6);
    const py = cy - 40 + Math.sin(Math.min(1, G.press) * Math.PI) * 28;
    ctx.save(); ctx.translate(cx + 30, py); ctx.rotate(0.35);
    const pg = ctx.createLinearGradient(-9, 0, 9, 0); pg.addColorStop(0, "#78716c"); pg.addColorStop(0.5, "#d6d3d1"); pg.addColorStop(1, "#78716c");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(-9, -40, 18, 80, 9); ctx.fill(); ctx.restore();
    drawFx(ctx, fx.current, dt);
    hits.forEach((h, k) => { ctx.fillStyle = `hsl(${h * 1.2},80%,50%)`; ctx.fillRect(W - 24 - (need - k) * 18, 46, 14, 10); });
    for (let k = hits.length; k < need; k++) { ctx.fillStyle = "#292524"; ctx.fillRect(W - 24 - (need - k) * 18, 46, 14, 10); }
  };
  const tap = () => {
    const G = L.current;
    if (G.done || G.tapped) return;
    const err = Math.abs(G.t - G.beat);
    if (err > 0.4) { G.word = "Too early"; G.wordLife = 0.6; return; }
    const sc = Math.max(0, Math.round(100 - err * 260));
    G.hits = [...G.hits, sc]; G.tapped = true; G.word = sc >= 85 ? "Perfect" : sc >= 55 ? "Good" : "Off"; G.wordLife = 0.6; G.press = 1;
    burst(fx.current, W / 2, 118, sc >= 55 ? "#e7e5e4" : "#a8a29e", 10, 120, 300, 3);
    sync({ t: G.t, beat: G.beat, hits: G.hits }, true);
  };
  return <Pad testId="alchemy-grind-pad" playing={playing} frame={frame} onDown={tap} />;
}

// --------------------------------------------------------------------------- strain
/** Strain: hold to tip the pot — the flow follows slowly. Too slow and it takes forever; too fast and it spills. */
export function StrainGame({ s, set, playing, onDone }: Omit<StepGameProps, "step"> & { step?: AlchemyStep }) {
  const L = useRef({ hold: false, tilt: 0, flow: 0, poured: 0, spill: 0, total: 0, done: false });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  const lo = 0.35, hi = 0.7;
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const S = L.current;
    if (playing && !S.done) {
      S.tilt = clamp(S.tilt + (S.hold ? 0.9 : -1.2) * dt);
      S.flow += (S.tilt - S.flow) * Math.min(1, dt * 2.2);
      S.poured = Math.min(100, S.poured + S.flow * dt * 22);
      if (S.flow > hi) S.spill += (S.flow - hi) * dt * 45;
      if (S.poured > 0) S.total += dt;
      sync({ flow: S.flow, poured: S.poured, spill: S.spill, tilt: S.tilt });
      if (S.poured >= 100) { S.done = true; onDone(100 - S.spill * 2.2 - Math.max(0, S.total - 9) * 4, "Strained it"); }
    }
    const flow = playing ? S.flow : Number(s.st?.flow ?? 0), poured = playing ? S.poured : Number(s.st?.poured ?? 0), spill = playing ? S.spill : Number(s.st?.spill ?? 0), tilt = playing ? S.tilt : Number(s.st?.tilt ?? 0);
    frameBase(ctx, 200, playing ? "Hold to pour — keep the flow in the green" : "Straining…", poured / 100);
    // The pot tipping over a sieve into the flask.
    ctx.save(); ctx.translate(170, 90); ctx.rotate(tilt * 0.9);
    ctx.fillStyle = "#1b1c1f"; ctx.beginPath(); ctx.roundRect(-60, -30, 120, 70, 14); ctx.fill(); ctx.strokeStyle = "#4b4f57"; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
    if (flow > 0.04) { ctx.strokeStyle = `hsla(200,80%,60%,${0.4 + flow * 0.5})`; ctx.lineWidth = 2 + flow * 10; ctx.beginPath(); ctx.moveTo(230, 100 + tilt * 30); ctx.quadraticCurveTo(250, 140, 250, 168); ctx.stroke(); }
    ctx.strokeStyle = "#a8a29e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(215, 150); ctx.lineTo(285, 150); ctx.stroke();
    ctx.fillStyle = "hsla(200,80%,50%,0.6)"; ctx.fillRect(225, 205 - poured * 0.35, 50, poured * 0.35);
    ctx.strokeStyle = "#78716c"; ctx.strokeRect(225, 170, 50, 36);
    if (flow > hi && Math.random() < 0.5) { ctx.fillStyle = "rgba(96,165,250,0.8)"; ctx.beginPath(); ctx.arc(200 + Math.random() * 100, 160 + Math.random() * 40, 2.5, 0, Math.PI * 2); ctx.fill(); }
    if (flow > 0.05 && Math.random() < flow) fx.current.bits.push({ x: 245 + (Math.random() - 0.5) * 10, y: 150, vx: (Math.random() - 0.5) * 20, vy: 60, life: 0.4, max: 0.4, color: "rgba(125,211,252,0.8)", size: 3, g: 600 });
    if (flow > hi && Math.random() < 0.6) fx.current.bits.push({ x: 245, y: 150, vx: (Math.random() - 0.5) * 220, vy: -60, life: 0.6, max: 0.6, color: "rgba(96,165,250,0.9)", size: 4, g: 700 });
    drawFx(ctx, fx.current, dt);
    meter(ctx, 360, 100, 250, flow, lo, hi, "Flow");
    ctx.fillStyle = "#a8a29e"; ctx.font = "17px ui-sans-serif, system-ui"; ctx.textAlign = "left"; ctx.fillText(`${Math.round(poured)}% strained${spill > 0.5 ? ` · spilled ${Math.round(spill)}` : ""}`, 360, 150);
  };
  return <Pad testId="alchemy-strain-pad" playing={playing} frame={frame} onDown={() => { L.current.hold = true; }} onUp={() => { L.current.hold = false; }} />;
}

// --------------------------------------------------------------------------- rest
/** Rest: while it settles, dark specks rise — skim them off before they sink. Leave the golden glints alone. */
export function RestGame({ step, s, set, playing, onDone }: StepGameProps) {
  const need = Math.max(4, Math.min(30, step.amount ?? 6));
  type Mote = { id: number; x: number; y: number; life: number; gold: boolean };
  const L = useRef({ t: 0, next: 0.6, motes: [] as Mote[], seq: 0, spawned: 0, skimmed: 0, wrong: 0, done: false, pops: [] as Array<{ x: number; y: number; life: number; good: boolean }> });
  const fx = useRef(newFx());
  const sync = useSync(playing, set);
  const cx = W / 2, cy = 118, rx = 250, ry = 62;
  const frame = (ctx: CanvasRenderingContext2D, t: number, dt: number) => {
    const R = L.current;
    if (playing && !R.done) {
      R.t += dt;
      if (R.t >= R.next) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.85;
        const gold = Math.random() < 0.25;
        R.motes.push({ id: R.seq++, x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, life: gold ? 1.3 : 1.5, gold });
        if (!gold) R.spawned++;
        R.next = R.t + 0.45 + Math.random() * 0.55;
      }
      for (const m of R.motes) m.life -= dt;
      R.motes = R.motes.filter((m) => m.life > 0);
      sync({ t: R.t, motes: R.motes, skimmed: R.skimmed, spawned: R.spawned, wrong: R.wrong });
      if (R.t >= need) { R.done = true; onDone((100 * R.skimmed) / Math.max(1, R.spawned) - R.wrong * 15, `Let it rest ${need}s, skimming as it settled`); }
    }
    const tt = playing ? R.t : Number(s.st?.t ?? 0);
    const motes: Mote[] = playing ? R.motes : s.st?.motes ?? [];
    frameBase(ctx, 245, playing ? "Tap the dark specks to skim them — not the golden glints" : "Resting…", tt / need);
    ctx.fillStyle = "#1b1c1f"; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 12, ry + 10, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, rx); g.addColorStop(0, "hsl(245,55%,40%)"); g.addColorStop(1, "hsl(245,50%,18%)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    for (const m of motes) {
      const a = clamp(m.life * 2);
      if (m.gold) { ctx.fillStyle = `rgba(253,224,71,${a})`; ctx.shadowColor = "#fde047"; ctx.shadowBlur = 10; }
      else { ctx.fillStyle = `rgba(28,25,23,${a})`; ctx.shadowBlur = 0; }
      ctx.beginPath(); ctx.arc(m.x, m.y, m.gold ? 6 : 9, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      if (!m.gold) { ctx.strokeStyle = `rgba(214,211,209,${a * 0.5})`; ctx.lineWidth = 1; ctx.stroke(); }
    }
    for (const p of R.pops) { p.life -= dt; ctx.strokeStyle = p.good ? `rgba(74,222,128,${p.life * 2})` : `rgba(248,113,113,${p.life * 2})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 18 * (1.5 - p.life), 0, Math.PI * 2); ctx.stroke(); }
    R.pops = R.pops.filter((p) => p.life > 0);
    // Slow bubbles rising through the settling brew.
    if (Math.random() < 0.25) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.8; fx.current.bits.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, vx: 0, vy: -6, life: 0.9, max: 0.9, color: "rgba(165,180,252,0.35)", size: 5, g: 0 }); }
    drawFx(ctx, fx.current, dt);
    ctx.fillStyle = "#a8a29e"; ctx.font = "17px ui-sans-serif, system-ui"; ctx.textAlign = "right";
    ctx.fillText(`skimmed ${playing ? R.skimmed : Number(s.st?.skimmed ?? 0)}${(playing ? R.wrong : Number(s.st?.wrong ?? 0)) ? ` · ${playing ? R.wrong : s.st?.wrong} glints lost` : ""}`, W - 14, 58);
  };
  const tap = (x: number, y: number) => {
    const R = L.current;
    if (R.done) return;
    const hit = R.motes.map((m) => ({ m, d: Math.hypot(m.x - x, m.y - y) })).filter((h) => h.d < 30).sort((a, b) => a.d - b.d)[0];
    if (!hit) return;
    R.motes = R.motes.filter((m) => m !== hit.m);
    if (hit.m.gold) R.wrong++; else R.skimmed++;
    R.pops.push({ x: hit.m.x, y: hit.m.y, life: 0.5, good: !hit.m.gold });
    burst(fx.current, hit.m.x, hit.m.y, hit.m.gold ? "#fde047" : "#57534e", 8, 90, 200, 3);
    if (hit.m.gold) fx.current.pops.push({ x: hit.m.x, y: hit.m.y - 16, text: "Not that one!", color: "#fca5a5", life: 0.9 });
    else pop(fx.current, hit.m.x, hit.m.y - 16, 100, ["Skimmed", "Skimmed", "Skimmed"]);
  };
  return <Pad testId="alchemy-rest-pad" playing={playing} frame={frame} onDown={tap} />;
}
