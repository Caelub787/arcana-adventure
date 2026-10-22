// Drawing for the crafting tools: glowing metal, finished weapons, sigils —
// and the pictures crafted items get as their portraits.
import { FORGE_SHAPES, FORGE_COLS, FORGE_ROWS, assemblyOrder, type ForgePart } from "@shared/agnostic/crafting";

/** Metal colour by heat (0 cold … 1 white-hot), tinted toward the material's own colour when cool. */
export function heatColor(t: number, base = "#9ca3af"): string {
  const h = Math.max(0, Math.min(1, t));
  if (h < 0.18) return base;
  const stops: Array<[number, [number, number, number]]> = [[0.18, hexRgb(base)], [0.38, [120, 22, 12]], [0.55, [200, 40, 10]], [0.72, [255, 110, 20]], [0.86, [255, 200, 60]], [1, [255, 250, 220]]];
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (h <= t1) { const k = (h - t0) / (t1 - t0); return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(",")})`; }
  }
  return "rgb(255,250,220)";
}
export function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [156, 163, 175];
  const s = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
const shade = (hex: string, k: number) => { const [r, g, b] = hexRgb(hex); const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

/** A part's outline as a path in a box (the outline's 100 × 40 coordinates scaled into it). */
export function shapePath(ctx: CanvasRenderingContext2D, shape: string, x: number, y: number, w: number, h: number) {
  const pts = FORGE_SHAPES[shape]?.points ?? FORGE_SHAPES.long_blade.points;
  ctx.beginPath();
  pts.forEach(([px, py], i) => { const X = x + (px / 100) * w, Y = y + (py / 40) * h; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
  ctx.closePath();
}

/** A solid part: metal (or wood, leather) with a sheen along it and a bright edge. */
export function drawSolidPart(ctx: CanvasRenderingContext2D, shape: string, color: string, x: number, y: number, w: number, h: number, glow = 0) {
  ctx.save();
  shapePath(ctx, shape, x, y, w, h);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.45, shade(color, 0.1)); g.addColorStop(0.55, shade(color, -0.25)); g.addColorStop(1, shade(color, -0.55));
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1, w / 140); ctx.strokeStyle = shade(color, -0.6); ctx.stroke();
  ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.18;
  ctx.lineWidth = Math.max(1, w / 200); ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.restore();
}

/** The metal on the anvil, cell by cell, glowing with its heat. */
export function drawMetal(ctx: CanvasRenderingContext2D, metal: string, color: string, heat: number, x: number, y: number, w: number, h: number) {
  const cw = w / FORGE_COLS, ch = h / FORGE_ROWS;
  const fill = heatColor(heat, color);
  ctx.save();
  if (heat > 0.3) { ctx.shadowColor = heatColor(Math.min(1, heat + 0.1), color); ctx.shadowBlur = 18 * heat; }
  ctx.fillStyle = fill;
  for (let r = 0; r < FORGE_ROWS; r++) for (let c = 0; c < FORGE_COLS; c++) {
    if (metal[r * FORGE_COLS + c] !== "1") continue;
    ctx.fillRect(x + c * cw - 0.3, y + r * ch - 0.3, cw + 0.6, ch + 0.6);
  }
  ctx.shadowBlur = 0;
  // Each cell's lit top edge, so the metal reads as hammered, not flat.
  ctx.fillStyle = heat > 0.3 ? "rgba(255,255,220,0.25)" : "rgba(255,255,255,0.12)";
  for (let r = 0; r < FORGE_ROWS; r++) for (let c = 0; c < FORGE_COLS; c++) {
    if (metal[r * FORGE_COLS + c] !== "1" || (r > 0 && metal[(r - 1) * FORGE_COLS + c] === "1")) continue;
    ctx.fillRect(x + c * cw, y + r * ch, cw, Math.max(1, ch * 0.18));
  }
  ctx.restore();
}

/** Where each part of an assembled weapon sits along it (fractions of its length). */
function layout(parts: Array<{ part: ForgePart }>) {
  const len = (p: ForgePart) => (p.role === "blade" ? 0.58 : p.role === "handle" ? (p.shape === "long_haft" ? 0.7 : 0.3) : p.shape === "pommel" ? 0.07 : p.shape === "fletching" ? 0.16 : 0.07);
  const ordered = assemblyOrder(parts.map((x) => x.part));
  const total = ordered.reduce((s, p) => s + len(p), 0);
  let at = 0;
  return ordered.map((p) => { const w = len(p) / total; const r = { part: p, from: at, w }; at += w; return r; });
}

/** A whole weapon on a dark, glowing backdrop — the finished item's picture. */
export function weaponPortrait(parts: Array<{ part: ForgePart; color: string }>, size = 320, opts: { failed?: boolean; tierColor?: string } = {}): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  backdrop(ctx, size, opts.tierColor ?? "#f59e0b");
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-Math.PI / 4);
  const L = size * 1.12;
  const colorOf = new Map(parts.map((x) => [x.part.key, x.color]));
  for (const seg of layout(parts)) {
    const w = seg.w * L, h = seg.part.role === "blade" ? Math.max(size * 0.13, w * 0.24) : seg.part.role === "handle" ? size * 0.09 : seg.part.shape === "guard" ? size * 0.26 : size * 0.12;
    const x = -L / 2 + seg.from * L;
    drawSolidPart(ctx, seg.part.shape, opts.failed ? "#57534e" : colorOf.get(seg.part.key) ?? "#9ca3af", x, -h / 2, w, h, seg.part.role === "blade" ? 10 : 0);
  }
  ctx.restore();
  if (opts.failed) crack(ctx, size);
  return c.toDataURL("image/png");
}

/** One part, as it came off the anvil. */
export function partPortrait(shape: string, metal: string | null, color: string, size = 256): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  backdrop(ctx, size, color);
  const w = size * 0.86, h = w * 0.4;
  ctx.save();
  ctx.translate(size / 2, size / 2); ctx.rotate(-Math.PI / 6);
  if (metal) drawMetal(ctx, metal, color, 0, -w / 2, -h / 2, w, h);
  else drawSolidPart(ctx, shape, color, -w / 2, -h / 2, w, h, 6);
  ctx.restore();
  return c.toDataURL("image/png");
}

function backdrop(ctx: CanvasRenderingContext2D, size: number, accent: string) {
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, "#2a2320"); g.addColorStop(0.6, "#151110"); g.addColorStop(1, "#080605");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const a = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.5);
  const [r, gg, b] = hexRgb(accent);
  a.addColorStop(0, `rgba(${r},${gg},${b},0.22)`); a.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = a; ctx.fillRect(0, 0, size, size);
}
function crack(ctx: CanvasRenderingContext2D, size: number) {
  ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = size / 90;
  ctx.beginPath(); ctx.moveTo(size * 0.35, size * 0.3); ctx.lineTo(size * 0.48, size * 0.46); ctx.lineTo(size * 0.44, size * 0.55); ctx.lineTo(size * 0.62, size * 0.7); ctx.stroke(); ctx.restore();
}

// --------------------------------------------------------------------------- runes
export type MarkStyle = "Carved" | "Drawn";
export interface RuneLook { strokes: number[][][]; color: string; glow: number; style: MarkStyle; placement: { x: number; y: number; s: number; r: number } }

/** A sigil in a box: carved (a groove with a lit edge) or drawn (ink, glowing if the ink does). */
export function drawSigil(ctx: CanvasRenderingContext2D, strokes: number[][][], cx: number, cy: number, size: number, look: { color: string; glow: number; style: MarkStyle; alpha?: number; width?: number }) {
  const s = size / 100;
  const path = (dx = 0, dy = 0) => {
    ctx.beginPath();
    for (const st of strokes) st.forEach(([x, y], i) => { const X = cx + (x - 50) * s + dx, Y = cy + (y - 50) * s + dy; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
  };
  const lw = look.width ?? Math.max(2, size / 22);
  ctx.save();
  ctx.globalAlpha = look.alpha ?? 1;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (look.style === "Carved") {
    // A cut into the surface: dark groove, a lit lower edge, then the ink settled in it.
    path(); ctx.lineWidth = lw * 1.25; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.stroke();
    path(lw * 0.25, lw * 0.3); ctx.lineWidth = lw * 0.35; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.stroke();
    if (look.color) { path(); ctx.lineWidth = lw * 0.55; ctx.strokeStyle = look.color; if (look.glow > 0) { ctx.shadowColor = look.color; ctx.shadowBlur = look.glow * 0.4; } ctx.stroke(); }
  } else {
    const col = look.color || "#3f3f46";
    if (look.glow > 0) {
      // A soft halo first, then the line itself.
      path(); ctx.lineWidth = lw * 2.2; ctx.strokeStyle = col; ctx.globalAlpha = (look.alpha ?? 1) * 0.25; ctx.shadowColor = col; ctx.shadowBlur = look.glow * 0.6; ctx.stroke();
      ctx.globalAlpha = look.alpha ?? 1;
    }
    path(); ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = look.glow * 0.35; ctx.stroke();
    path(); ctx.lineWidth = lw * 0.3; ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.shadowBlur = 0; ctx.stroke();
  }
  ctx.restore();
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/** An item's picture with every rune on it (its own picture underneath, or a plain plate if it has none). */
export async function runePortrait(base: string | null, name: string, runes: RuneLook[], size = 384): Promise<string> {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = base ? await loadImage(base) : null;
  if (img) {
    const k = Math.max(size / img.width, size / img.height);
    ctx.drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k);
  } else {
    backdrop(ctx, size, "#a78bfa");
    ctx.fillStyle = "rgba(214,211,209,0.12)"; ctx.font = `bold ${size * 0.42}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((name.trim()[0] ?? "?").toUpperCase(), size / 2, size / 2);
  }
  for (const r of runes) {
    ctx.save();
    ctx.translate((r.placement.x / 100) * size, (r.placement.y / 100) * size);
    ctx.rotate(((r.placement.r ?? 0) * Math.PI) / 180);
    drawSigil(ctx, r.strokes, 0, 0, (r.placement.s / 100) * size, { color: r.color, glow: r.glow, style: r.style });
    ctx.restore();
  }
  try { return c.toDataURL("image/png"); } catch { return ""; }
}

/** Embers and sparks: tiny particles that fly and fade (drawn each frame). */
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
export function stepParticles(ctx: CanvasRenderingContext2D, ps: Particle[], dt: number, gravity = 260) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) { ps.splice(i, 1); continue; }
    p.vy += gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const a = p.life / p.max;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
