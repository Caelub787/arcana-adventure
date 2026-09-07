/**
 * C.A.-only pieces: the rank readout and its reference panel, and the Aura
 * (colour + animated shape) that replaces beacon colours throughout C.A.
 *
 * Kept out of GameComponents.tsx, which is already past 30k lines.
 */
import React, { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  CA_RANKS,
  CA_AURA_SHAPES,
  CA_AURA_SHAPE_LABELS,
  CA_AURA_DEFAULT_COLOR,
  caRankForEnergyPool,
  caRankLabel,
  caUsableEnergy,
  caAuraOf,
  caAuraShapeOf,
  caAuraAngleOf,
  caAuraColorAt,
  caAuraGradient,
  type CAAura,
  type CAAuraShape,
} from "@shared/ca";

const fmt = (n: number) => n.toLocaleString();

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------

/**
 * The whole ladder, every rung, with what each one is worth. Rank is derived
 * from the Energy Pool and never set by hand, so without this there is no way
 * for a player to see what the next rung costs.
 */
export function CaRankReferenceDialog({
  open,
  onOpenChange,
  energyPool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  energyPool?: number | null;
}) {
  const here = energyPool == null ? null : caRankForEnergyPool(energyPool);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-ca-rank-reference">
        <DialogHeader>
          <DialogTitle className="text-amber-400">Ranks</DialogTitle>
          <DialogDescription className="text-stone-400">
            Your rank is read from your Energy Pool — it isn't set by hand. Usable
            Energy is half the pool, and is what you actually spend.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {CA_RANKS.map((rank) => (
            <div key={rank.name} data-testid={`ca-rank-block-${rank.name.toLowerCase()}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-stone-700 pb-1 mb-1.5">
                <h3 className="text-sm font-bold text-stone-100">{rank.name}</h3>
                <div className="flex gap-3 text-[11px] text-stone-400">
                  <span>Lifespan {fmt(rank.lifespan)} yrs</span>
                  <span>Absorbs {fmt(rank.absorptionLimit)}</span>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-stone-500 text-left">
                    <th className="font-medium pb-0.5 w-20">Star</th>
                    <th className="font-medium pb-0.5 text-right">Energy Pool</th>
                    <th className="font-medium pb-0.5 text-right">Usable</th>
                  </tr>
                </thead>
                <tbody>
                  {rank.stars.map((star) => {
                    const isHere = here?.rank.name === rank.name && here?.star === star.star;
                    return (
                      <tr
                        key={star.star}
                        className={isHere ? "text-amber-300 font-semibold" : "text-stone-300"}
                        data-testid={`ca-rank-row-${rank.name.toLowerCase()}-${star.star}`}
                      >
                        <td className="py-0.5">
                          {rank.name} {star.star}
                          {isHere && <span className="ml-1 text-[10px] text-amber-500">you</span>}
                        </td>
                        <td className="py-0.5 text-right tabular-nums">{fmt(star.energyPool)}</td>
                        <td className="py-0.5 text-right tabular-nums">{fmt(caUsableEnergy(star.energyPool))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Gold 3", with the info button that opens the ladder. */
export function CaRankBadge({ energyPool }: { energyPool: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  const position = caRankForEnergyPool(energyPool);
  const toNext =
    position.nextEnergyPool == null
      ? null
      : position.nextEnergyPool - Math.max(0, Math.floor(Number(energyPool) || 0));

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <span className="text-xs font-bold text-amber-300" data-testid="text-ca-rank">
          {caRankLabel(energyPool)}
        </span>
        {toNext != null && toNext > 0 && (
          <span className="text-[10px] text-stone-500" data-testid="text-ca-rank-to-next">
            {fmt(toNext)} to next
          </span>
        )}
        {/* A bare icon, not a Button: every button variant carries a frame
            of some kind, and a boxed `i` beside the rank read as a control
            you were meant to press rather than a footnote. */}
        <button
          type="button"
          className="inline-flex items-center justify-center text-amber-400 hover:text-amber-200 transition-colors"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          aria-label="What the ranks mean"
          data-testid="button-ca-rank-info"
        >
          <Info className="h-3 w-3" />
        </button>
      </span>
      <CaRankReferenceDialog open={open} onOpenChange={setOpen} energyPool={energyPool} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Aura
// ---------------------------------------------------------------------------

// Each shape is a path on a 0..24 canvas, drawn in the aura colour.
//
// They are meant to read at 8-15px, which is what rules all of them: two bold
// forms beat five accurate ones, and anything that leaves half the canvas
// empty is a speck by the time it is drawn. Several of these started out
// faithful to the name and unreadable at size - three scattered bubbles, a
// four-branch crack, a nine-spoke web - and were cut down until they held.
const AURA_SHAPE_PATHS: Record<Exclude<CAAuraShape, "none">, string> = {
  bubbles: "M9 10a6 6 0 1 0 .01 0ZM17.5 17.5a4 4 0 1 0 .01 0Z",
  rings: "M12 3a9 9 0 1 0 .01 0ZM12 8.5a3.5 3.5 0 1 0 .01 0Z",
  hexagons: "M12 2 20.6 7 20.6 17 12 22 3.4 17 3.4 7Z",
  diamonds: "M9.5 2 16.5 12 9.5 22 2.5 12ZM18.5 4.5 22.5 10.5 18.5 16.5 14.5 10.5Z",
  triangles: "M12 3 21 20 3 20ZM12 9.5 16.5 18 7.5 18Z",
  squares: "M2.5 3h11.5v11.5H2.5ZM15 14.5h6.5V21H15Z",
  shards: "M3.5 3 14.5 6 9 15.5 2 11ZM15.5 10.5 22 8 20 21 13.5 17.5Z",
  sparks: "M12 1.5c1 7.5 3 9.5 10.5 10.5-7.5 1-9.5 3-10.5 10.5-1-7.5-3-9.5-10.5-10.5 7.5-1 9.5-3 10.5-10.5Z",
  motes: "M9.5 11a5 5 0 1 0 .01 0ZM18 18.5a3 3 0 1 0 .01 0Z",
  wisps: "M12 1.8c4 6.2 7 9.2 7 13.2 0 4-3 7-7 7s-7-3-7-7c0-3.4 3-6.4 7-13.2Z",
  spirals: "M12 12A2 2 0 0 1 16 12A4 4 0 0 1 8 12A5.5 5.5 0 0 1 19 12A7 7 0 0 1 5 12",
  crescents: "M16.5 3.6a9.6 9.6 0 1 0 0 16.8 8 8 0 1 1 0-16.8Z",
  ripples: "M2 17.5a10.5 10.5 0 0 1 20 0M6.5 20a5.5 5.5 0 0 1 11 0",
  cracks: "M13.5 2 10.5 10 14 13.5 11 22M10.5 10 3.5 12.5M14 13.5 20.5 10",
  runes: "M5.5 3v18M18.5 3v18M5.5 10.5 18.5 5",
  eyes: "M2 12c4.5-6.5 15.5-6.5 20 0-4.5 6.5-15.5 6.5-20 0ZM12 8.7a3.3 3.3 0 1 0 .01 0Z",
  stars: "M12 2 14.9 9.1 22.5 9.6 16.7 14.5 18.5 21.9 12 17.8 5.5 21.9 7.3 14.5 1.5 9.6 9.1 9.1Z",
  crosses: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7Z",
  arcs: "M2.5 15.5A11 11 0 0 1 13 3M11 21A11 11 0 0 0 21.5 8.5",
  links: "M9 12m-6 0a6 4 0 1 0 12 0a6 4 0 1 0-12 0M15 12m-6 0a6 4 0 1 0 12 0a6 4 0 1 0-12 0",
  cells: "M12 2.5c5.2 0 9.2 4.2 8.2 9.3-1 5.1-5.2 9.4-9.4 8.3C5.6 19 2.5 14.8 3.6 9.8 4.6 5.4 7.8 2.5 12 2.5Z",
  webbing: "M12 3 20 7.5v9L12 21 4 16.5v-9ZM12 12V3M12 12 20 16.5M12 12 4 16.5",
  waves: "M2 7c3-6 7 6 10 0s7 6 10 0M2 17c3-6 7 6 10 0s7 6 10 0",
  zigzags: "M3 6.5 8 12 3 17.5M10 4.5 15.5 12 10 19.5M17.5 6.5 21.5 12 17.5 17.5",
};

/**
 * Shapes drawn as line work rather than solid forms. A branching crack or a
 * pair of waves filled in is a blob; these carry their meaning in the stroke.
 */
const AURA_OUTLINE_SHAPES = new Set<CAAuraShape>([
  "rings",
  "triangles",
  "spirals",
  "ripples",
  "cracks",
  "runes",
  "arcs",
  "links",
  "webbing",
  "waves",
  "zigzags",
]);

/**
 * The aura particle engine.
 *
 * Every one of these fields used to be CSS keyframes, and keyframes repeat -
 * watch a card for twenty seconds and you can see the loop come round. These
 * are simulated instead: each shape gets its own randomly drawn speed, size,
 * lifetime and heading when it spawns, drifts under a bit of noise while it
 * lives, and is redrawn from scratch when it dies. Nothing is ever the same
 * twice and there is no cycle to notice.
 *
 * One requestAnimationFrame loop drives every field on the page rather than
 * one per field - a battlemap can easily have a dozen of these up at once
 * (every tracker card, every hotbar slot, the sheet, the roll trays), and a
 * dozen rAF loops fighting each other is how you lose a frame budget. Each
 * frame writes nothing but `transform` and `opacity`, so none of it touches
 * layout.
 */

/** How visible a shape gets to be, against what the motion asks for. */
const AURA_ALPHA = 0.8;

type AuraTicker = (dt: number) => void;
const auraTickers = new Set<AuraTicker>();
let auraRaf: number | null = null;
let auraLastTs = 0;

function auraFrame(ts: number) {
  // Clamped: a backgrounded tab resumes with a huge delta, and without this
  // every particle teleports the moment you come back to it.
  const dt = Math.min(0.05, auraLastTs ? (ts - auraLastTs) / 1000 : 0.016);
  auraLastTs = ts;
  auraTickers.forEach((t) => t(dt));
  auraRaf = auraTickers.size ? requestAnimationFrame(auraFrame) : null;
}

function subscribeAura(t: AuraTicker) {
  auraTickers.add(t);
  if (auraRaf === null) {
    auraLastTs = 0;
    auraRaf = requestAnimationFrame(auraFrame);
  }
  return () => {
    auraTickers.delete(t);
    if (auraTickers.size === 0 && auraRaf !== null) {
      cancelAnimationFrame(auraRaf);
      auraRaf = null;
    }
  };
}

function auraReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface AuraParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Drawn size in px; the glyph is rendered at 24 and scaled to this. */
  size: number;
  /** Negative while a particle is still waiting to be born. */
  age: number;
  ttl: number;
  fadeIn: number;
  fadeOut: number;
  peak: number;
  rot: number;
  vrot: number;
  /** Perimeter walkers only: distance along the path, and how fast. */
  d: number;
  sp: number;
  inset: number;
}

type AuraMotion = "interior" | "edge" | "current";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T, b: T) => (Math.random() < 0.5 ? a : b);

/**
 * A point some distance along a rounded rectangle inset from the box's edge.
 * Perimeter walkers ride this so a shape curves through a corner instead of
 * turning on the spot.
 */
function pointOnRoundedRect(d: number, w: number, h: number, inset: number, radius: number) {
  const iw = Math.max(1, w - inset * 2);
  const ih = Math.max(1, h - inset * 2);
  const c = Math.max(0, Math.min(radius, iw / 2, ih / 2));
  const sx = iw - c * 2;
  const sy = ih - c * 2;
  const arc = (Math.PI * c) / 2;
  const total = 2 * sx + 2 * sy + 4 * arc;
  let t = ((d % total) + total) % total;

  const onArc = (cx: number, cy: number, from: number, frac: number) => {
    const a = from + (Math.PI / 2) * frac;
    return { x: cx + Math.cos(a) * c, y: cy + Math.sin(a) * c };
  };

  if (t < sx) return { x: inset + c + t, y: inset };
  t -= sx;
  if (t < arc) return onArc(inset + iw - c, inset + c, -Math.PI / 2, t / arc);
  t -= arc;
  if (t < sy) return { x: inset + iw, y: inset + c + t };
  t -= sy;
  if (t < arc) return onArc(inset + iw - c, inset + ih - c, 0, t / arc);
  t -= arc;
  if (t < sx) return { x: inset + iw - c - t, y: inset + ih };
  t -= sx;
  if (t < arc) return onArc(inset + c, inset + ih - c, Math.PI / 2, t / arc);
  t -= arc;
  if (t < sy) return { x: inset, y: inset + ih - c - t };
  t -= sy;
  return onArc(inset + c, inset + c, Math.PI, t / arc);
}

/**
 * How each kind of surface behaves. `spawn` draws a particle's whole life at
 * random; `step` moves it for one frame. `first` is true only for the initial
 * fill, where particles start part-way through their lives so a field is
 * already busy rather than blooming from nothing.
 */
function auraBehaviour(motion: AuraMotion, speed: number, active: boolean) {
  switch (motion) {
    // A drift inside a circular colour field: the aura chip, and a beacon.
    //
    // Pure noise was the first attempt and it huddled: identical forces on
    // every particle meant they all ended up in the same place. Each one
    // holds its own radius and its own rate instead, and it is those two that
    // wander - so the paths stay separated and still never repeat.
    case "interior":
      return {
        spawn(p: AuraParticle, w: number, h: number, first: boolean) {
          const R = Math.min(w, h) / 2;
          const a = rnd(0, Math.PI * 2);
          p.inset = R * rnd(0.22, 0.6);
          p.d = rnd(0.25, 0.75) * speed * pick(1, -1);
          p.x = w / 2 + Math.cos(a) * p.inset;
          p.y = h / 2 + Math.sin(a) * p.inset;
          p.vx = 0;
          p.vy = 0;
          p.size = Math.max(7, Math.min(w, h) * rnd(0.17, 0.26));
          p.ttl = rnd(7, 15) / speed;
          p.age = first ? rnd(0, p.ttl) : 0;
          p.fadeIn = Math.min(1.2, p.ttl * 0.25);
          p.fadeOut = Math.min(1.6, p.ttl * 0.3);
          p.peak = rnd(0.6, 0.95);
          p.rot = rnd(0, 360);
          p.vrot = rnd(-16, 16) * speed;
        },
        step(p: AuraParticle, dt: number, w: number, h: number) {
          const R = Math.min(w, h) / 2;
          const dx = p.x - w / 2;
          const dy = p.y - h / 2;
          const dist = Math.hypot(dx, dy) || 0.001;
          const ux = dx / dist;
          const uy = dy / dist;
          const tx = -uy;
          const ty = ux;
          // Chase the rate this particle wants to be turning at...
          const wantTan = p.d * dist;
          const haveTan = p.vx * tx + p.vy * ty;
          const accT = (wantTan - haveTan) * 2.6;
          // ...and the radius it wants to be at, damped so it settles rather
          // than bouncing in and out.
          const haveRad = p.vx * ux + p.vy * uy;
          const accR = (p.inset - dist) * 2.4 - haveRad * 1.8;
          p.vx += (tx * accT + ux * accR) * dt;
          p.vy += (ty * accT + uy * accR) * dt;
          // The wander lives in what it is aiming for, not in its velocity,
          // which is what keeps the motion smooth and the path unrepeatable.
          p.inset += rnd(-1, 1) * R * 0.3 * dt;
          if (p.inset < R * 0.18) p.inset = R * 0.18;
          if (p.inset > R * 0.62) p.inset = R * 0.62;
          p.d += rnd(-1, 1) * 0.4 * dt * speed;
          const lo = 0.14 * speed;
          const hi = 0.95 * speed;
          const mag = Math.abs(p.d);
          if (mag < lo) p.d = lo * Math.sign(p.d || 1);
          if (mag > hi) p.d = hi * Math.sign(p.d);
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        },
      };

    // A lap of the border, for a whole sheet.
    case "edge":
      return {
        spawn(p: AuraParticle, w: number, h: number, first: boolean) {
          p.inset = rnd(6, 16);
          p.sp = rnd(14, 34) * speed * pick(1, -1);
          p.d = rnd(0, 2 * (w + h));
          p.size = rnd(8, 15);
          p.ttl = rnd(14, 30);
          p.age = first ? rnd(0, p.ttl) : 0;
          p.fadeIn = 1.6;
          p.fadeOut = 2.2;
          p.peak = rnd(0.34, 0.56);
          p.rot = rnd(0, 360);
          p.vrot = rnd(-9, 9);
          p.x = 0;
          p.y = 0;
        },
        step(p: AuraParticle, dt: number, w: number, h: number) {
          // The speed itself wanders, so shapes pull apart and bunch up
          // instead of holding formation the way keyframes made them.
          p.sp += rnd(-1, 1) * 7 * dt;
          const cap = 46 * speed;
          if (p.sp > cap) p.sp = cap;
          if (p.sp < -cap) p.sp = -cap;
          if (Math.abs(p.sp) < 5 * speed) p.sp = 5 * speed * Math.sign(p.sp || 1);
          p.d += p.sp * dt;
          const pt = pointOnRoundedRect(p.d, w, h, p.inset, 14);
          p.x = pt.x;
          p.y = pt.y;
        },
      };

    // A current through a short, wide card: in one end and out the other.
    // Also what a roll tray uses: the shapes ride its edges rather than
    // crossing the middle, where they were only ever behind the number.
    default:
      return {
        spawn(p: AuraParticle, w: number, h: number, first: boolean) {
          const onTop = Math.random() < 0.5;
          p.inset = rnd(3, 9);
          p.sp = rnd(16, 40) * speed * (onTop ? 1 : -1);
          p.y = onTop ? p.inset : h - p.inset;
          const span = w + 28;
          p.ttl = span / Math.abs(p.sp);
          p.age = first ? rnd(0, p.ttl) : 0;
          // Position is a function of age, so the initial fill spreads them
          // along the edge instead of stacking them all at the entrance.
          p.x = (onTop ? -14 : w + 14) + p.sp * p.age;
          p.vy = rnd(-2, 2);
          p.size = rnd(8, 14);
          p.fadeIn = p.ttl * 0.18;
          p.fadeOut = p.ttl * 0.22;
          p.peak = rnd(0.34, 0.52);
          p.rot = rnd(0, 360);
          p.vrot = rnd(-12, 12);
        },
        step(p: AuraParticle, dt: number, w: number, h: number) {
          p.x += p.sp * dt;
          // A shallow wobble across the edge, kept inside the glow band.
          p.vy += rnd(-1, 1) * 6 * dt;
          p.vy *= 0.96;
          p.y += p.vy * dt;
          const lo = 2;
          const hi = h - 2;
          if (p.y < lo) { p.y = lo; p.vy = Math.abs(p.vy); }
          if (p.y > hi) { p.y = hi; p.vy = -Math.abs(p.vy); }
        },
      };

  }
}

/**
 * Runs a field of particles over a host element and writes each frame
 * straight to the DOM. Deliberately not React state: this is sixty updates a
 * second per particle, and rendering that through React would be the most
 * expensive thing on the battlemap.
 */
function useAuraParticles({
  motion,
  count,
  animate = true,
  speed = 1,
  active = false,
  fixedSize,
}: {
  motion: AuraMotion;
  count: number;
  animate?: boolean;
  speed?: number;
  active?: boolean;
  /** Square hosts of a known size skip measuring. */
  fixedSize?: number;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const nodesRef = useRef<Array<HTMLSpanElement | null>>([]);
  const boxRef = useRef({ w: fixedSize ?? 0, h: fixedSize ?? 0 });

  useEffect(() => {
    if (fixedSize) {
      boxRef.current = { w: fixedSize, h: fixedSize };
      return;
    }
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      boxRef.current = { w: host.offsetWidth, h: host.offsetHeight };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [fixedSize]);

  useEffect(() => {
    if (!animate || auraReducedMotion()) return;
    const behaviour = auraBehaviour(motion, speed, active);
    const parts: AuraParticle[] = Array.from({ length: count }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, size: 10,
      age: 0, ttl: 1, fadeIn: 0.2, fadeOut: 0.2, peak: 0.5,
      rot: 0, vrot: 0, d: 0, sp: 0, inset: 6,
    }));
    let seeded = false;

    const tick = (dt: number) => {
      const { w, h } = boxRef.current;
      // Nothing to draw on: a collapsed roll tray, a hidden panel.
      if (w < 8 || h < 8) return;
      if (!seeded) {
        parts.forEach((p) => behaviour.spawn(p, w, h, true));
        seeded = true;
      }
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.ttl) behaviour.spawn(p, w, h, false);
        else if (p.age > 0) behaviour.step(p, dt, w, h);
        p.rot += p.vrot * dt;

        const node = nodesRef.current[i];
        if (!node) continue;
        let a: number;
        if (p.age <= 0) a = 0;
        else if (p.age < p.fadeIn) a = p.peak * (p.age / p.fadeIn);
        else if (p.age > p.ttl - p.fadeOut) a = p.peak * ((p.ttl - p.age) / p.fadeOut);
        else a = p.peak;
        node.style.opacity = String(Math.max(0, a) * AURA_ALPHA);
        node.style.transform =
          `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)` +
          ` rotate(${p.rot.toFixed(1)}deg) scale(${(p.size / 24).toFixed(3)})`;
      }
    };

    // Only while it is actually on screen. Chat mounts one of these per
    // message and a roster mounts one per character, so a long scrollback
    // would otherwise have hundreds of fields simulating into the void.
    let stop: (() => void) | null = null;
    const start = () => { if (!stop) stop = subscribeAura(tick); };
    const halt = () => { if (stop) { stop(); stop = null; } };

    // Started straight away and paused by the observer, rather than waiting
    // for the observer to start it: the first intersection callback is not
    // guaranteed to be prompt, and a field that needs one before it draws
    // anything shows an empty box until it arrives.
    start();
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return halt;
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : halt()),
      { rootMargin: "80px" },
    );
    io.observe(host);
    return () => {
      io.disconnect();
      halt();
    };
  }, [motion, count, animate, speed, active]);

  return { hostRef, nodesRef };
}

/** One shape, at the weight every aura surface draws it. */
function AuraGlyph({ color, shape }: { color: string; shape: CAAuraShape }) {
  if (shape === "none") return null;
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden style={{ display: "block", overflow: "visible" }}>
      <path
        d={AURA_SHAPE_PATHS[shape]}
        fill={AURA_OUTLINE_SHAPES.has(shape) ? "none" : color}
        fillOpacity={0.18}
        stroke={color}
        strokeOpacity={0.72}
        // Line-work shapes carry all their meaning in the stroke, so they need
        // more of it to survive being drawn at ten pixels. A filled form with
        // the same weight just goes blobby.
        strokeWidth={AURA_OUTLINE_SHAPES.has(shape) ? 2.3 : 1.7}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The nodes the engine writes to. Positioned entirely by `transform`. */
function AuraParticleNodes({
  count,
  color,
  color2 = null,
  shape,
  nodesRef,
  glow,
}: {
  count: number;
  color: string;
  color2?: string | null;
  shape: CAAuraShape;
  nodesRef: React.MutableRefObject<Array<HTMLSpanElement | null>>;
  glow?: boolean;
}) {
  if (shape === "none") return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        // Spread along the gradient rather than all one colour, so a
        // two-colour aura reads as two colours in the drift as well as in
        // the glow.
        const tone = caAuraColorAt({ color, color2 }, count > 1 ? i / (count - 1) : 0);
        return (
        <span
          key={i}
          ref={(el) => { nodesRef.current[i] = el; }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            lineHeight: 0,
            opacity: 0,
            willChange: "transform, opacity",
            // Drawn in the aura's colour on a ground already glowing in it,
            // so a flat outline disappears into the glow without this.
            ...(glow ? { filter: `drop-shadow(0 0 3px ${tone})` } : {}),
          }}
        >
          <AuraGlyph color={tone} shape={shape} />
        </span>
        );
      })}
    </>
  );
}

/**
 * The inset ring every aura surface wears, so no ancestor can clip the glow.
 *
 * A gradient one is two glows rather than one: an inset shadow thrown from
 * the gradient's near side in the first colour and one from the far side in
 * the second, offset along the gradient's own angle. A box-shadow cannot hold
 * a gradient, and the obvious alternative - a gradient-filled layer clipped to
 * the border - needs a mask, and masks do not render at all here (see
 * woundBodyImages.ts for the same finding). The hairline takes the colour
 * halfway along, since it can only be one.
 */
function AuraRing({
  color,
  color2 = null,
  angle = 180,
  strength = 1,
}: {
  color: string;
  color2?: string | null;
  angle?: number;
  strength?: number;
}) {
  const blur = Math.round(26 * strength);
  const hair = caAuraColorAt({ color, color2 }, 0.5);
  if (!color2) {
    return (
      <span
        className="absolute inset-0 rounded-[inherit]"
        style={{ boxShadow: `inset 0 0 0 1px ${hair}55, inset 0 0 ${blur}px -6px ${color}` }}
      />
    );
  }
  // 0deg points up, and CSS gradients run toward that angle.
  const rad = ((angle - 90) * Math.PI) / 180;
  const dx = Math.round(Math.cos(rad) * 6);
  const dy = Math.round(Math.sin(rad) * 6);
  return (
    <span
      className="absolute inset-0 rounded-[inherit]"
      style={{
        boxShadow:
          `inset 0 0 0 1px ${hair}55, ` +
          `inset ${-dx}px ${-dy}px ${blur}px -6px ${color}, ` +
          `inset ${dx}px ${dy}px ${blur}px -6px ${color2}`,
      }}
    />
  );
}

/**
 * A slow random walk for anything too small to hold particles - the plain
 * colour dot, and the single shape a tiny chip falls back to. A keyframed
 * pulse is a loop you can see at that size; this never repeats.
 */
function useAuraBreathe(animate: boolean, speed = 1) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!animate || auraReducedMotion()) return;
    let target = rnd(0.7, 1);
    let cur = target;
    let hold = 0;
    return subscribeAura((dt) => {
      hold -= dt;
      if (hold <= 0) {
        target = rnd(0.62, 1);
        hold = rnd(0.7, 2.1) / speed;
      }
      cur += (target - cur) * Math.min(1, dt * 2.2 * speed);
      const el = ref.current;
      if (!el) return;
      el.style.opacity = (0.5 + cur * 0.5).toFixed(3);
      el.style.transform = `scale(${(0.9 + cur * 0.16).toFixed(3)})`;
    });
  }, [animate, speed]);
  return ref;
}

/**
 * The aura: the character's colour as a field, with their shape drifting
 * around inside it like something suspended in it.
 *
 * Below `PARTICLE_MIN_SIZE` there is no room for any of this - at 12px a
 * particle is three pixels - so it falls back to a single shape that breathes
 * instead.
 */
const PARTICLE_MIN_SIZE = 18;
const PARTICLE_COUNT = 8;

export function AuraShapeMark({
  color,
  color2 = null,
  angle = 180,
  shape,
  size = 16,
  animate = true,
  speed = 1,
  className,
  title,
}: {
  color: string;
  color2?: string | null;
  angle?: number;
  shape: CAAuraShape;
  size?: number;
  animate?: boolean;
  /**
   * How much faster than usual the shapes move. The drift is slow by design -
   * it sits on a sheet you are reading - but a beacon is on screen for a
   * second and a half, and over that a normal drift does not visibly move at
   * all. The beacon winds it up rather than settling for a still image.
   */
  speed?: number;
  className?: string;
  title?: string;
}) {
  const small = shape === "none" || size < PARTICLE_MIN_SIZE;
  const breatheRef = useAuraBreathe(animate && small, speed);
  const { hostRef, nodesRef } = useAuraParticles({
    motion: "interior",
    count: PARTICLE_COUNT,
    animate: animate && !small,
    speed,
    fixedSize: size,
  });

  const field = (children: React.ReactNode, ref?: React.Ref<HTMLSpanElement>) => (
    <span
      ref={ref}
      className={className}
      title={title}
      aria-hidden={title ? undefined : true}
      data-testid="aura-mark"
      data-aura-shape={shape}
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "9999px",
        overflow: "hidden",
        // The colour itself, densest in the middle - the "space" the shapes
        // are suspended in. A two-colour aura runs its gradient underneath and
        // uses the radial only to fade the edges out.
        backgroundImage: color2
          ? `radial-gradient(circle at 50% 50%, #0000 0%, #0000 45%, #000 82%), ${caAuraGradient({ color, color2, angle }, "66")}`
          : `radial-gradient(circle at 50% 50%, ${color}66 0%, ${color}22 55%, transparent 78%)`,
        ...(color2 ? { backgroundBlendMode: "destination-out" as const } : {}),
        boxShadow: `0 0 ${Math.max(3, size / 3)}px ${caAuraColorAt({ color, color2 }, 0.5)}55`,
      }}
    >
      {children}
    </span>
  );

  if (shape === "none") {
    return field(
      <span
        ref={breatheRef as React.Ref<HTMLSpanElement>}
        style={{
          position: "absolute",
          inset: "22%",
          borderRadius: "9999px",
          backgroundImage: caAuraGradient({ color, color2, angle }),
          opacity: 0.85,
        }}
      />,
    );
  }

  if (small) {
    return (
      <span
        className={className}
        title={title}
        aria-hidden={title ? undefined : true}
        data-testid="aura-mark"
        data-aura-shape={shape}
        style={{ display: "inline-block", lineHeight: 0 }}
      >
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          ref={breatheRef as React.Ref<SVGSVGElement>}
          role={title ? "img" : "presentation"}
          style={{ overflow: "visible", filter: `drop-shadow(0 0 ${Math.max(2, size / 5)}px ${color})` }}
        >
          {title && <title>{title}</title>}
          <path
            d={AURA_SHAPE_PATHS[shape]}
            fill={AURA_OUTLINE_SHAPES.has(shape) ? "none" : color}
            fillOpacity={0.28}
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
        strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  return field(
    <>
      <AuraParticleNodes count={PARTICLE_COUNT} color={color} color2={color2} shape={shape} nodesRef={nodesRef} glow />
      {title && <span className="sr-only">{title}</span>}
    </>,
    hostRef,
  );
}


/** A character's aura, resolved and drawn. */
export function CharacterAuraMark({
  character,
  fallbackColor,
  size,
  animate,
  className,
  title,
}: {
  character: { caAuraColor?: string | null; caAuraShape?: string | null } | null | undefined;
  fallbackColor?: string | null;
  size?: number;
  animate?: boolean;
  className?: string;
  title?: string;
}) {
  const aura = caAuraOf(character, fallbackColor);
  return <AuraShapeMark {...aura} size={size} animate={animate} className={className} title={title} />;
}

/** Colour picker plus shape picker, with a live preview of the pair. */
export function CaAuraEditor({
  color,
  color2,
  angle,
  shape,
  onChange,
}: {
  color: string | null | undefined;
  color2?: string | null;
  angle?: number | null;
  shape: string | null | undefined;
  onChange: (next: { color: string; color2: string | null; angle: number; shape: CAAuraShape }) => void;
}) {
  const resolved = caAuraOf({
    caAuraColor: color,
    caAuraColor2: color2,
    caAuraAngle: angle,
    caAuraShape: shape,
  });
  const emit = (patch: Partial<CAAura>) => onChange({ ...resolved, ...patch });

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="ca-aura-editor">
      <input
        type="color"
        value={resolved.color}
        onChange={(e) => emit({ color: e.target.value })}
        className="h-7 w-10 rounded border border-stone-700 bg-stone-900 p-0.5 cursor-pointer"
        aria-label="Aura colour"
        data-testid="input-ca-aura-color"
      />

      {/* The second colour is opt-in: without it the aura is one colour, which
          is what most are, and an always-on second picker would imply every
          aura has to be a gradient. */}
      {resolved.color2 ? (
        <>
          <span className="text-stone-600 text-xs">to</span>
          <input
            type="color"
            value={resolved.color2}
            onChange={(e) => emit({ color2: e.target.value })}
            className="h-7 w-10 rounded border border-stone-700 bg-stone-900 p-0.5 cursor-pointer"
            aria-label="Aura second colour"
            data-testid="input-ca-aura-color2"
          />
          <label className="flex items-center gap-1 text-[10px] text-stone-400">
            <input
              type="range"
              min={0}
              max={359}
              step={15}
              value={resolved.angle}
              onChange={(e) => emit({ angle: caAuraAngleOf(e.target.value) })}
              className="w-20 accent-amber-600"
              aria-label="Gradient direction"
              data-testid="input-ca-aura-angle"
            />
            <span className="tabular-nums w-8">{resolved.angle}°</span>
          </label>
          <button
            type="button"
            onClick={() => emit({ color2: null })}
            className="text-[10px] text-stone-500 hover:text-stone-300 underline"
            data-testid="button-ca-aura-gradient-off"
          >
            single
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => emit({ color2: shiftHue(resolved.color, 40) })}
          className="text-[10px] text-stone-500 hover:text-amber-300 underline"
          data-testid="button-ca-aura-gradient-on"
        >
          + gradient
        </button>
      )}

      <select
        value={resolved.shape}
        onChange={(e) => emit({ shape: caAuraShapeOf(e.target.value) })}
        className="h-7 rounded border border-stone-700 bg-stone-900 text-stone-200 text-xs px-1.5"
        aria-label="Aura shape"
        data-testid="select-ca-aura-shape"
      >
        {CA_AURA_SHAPES.map((s) => (
          <option key={s} value={s}>{CA_AURA_SHAPE_LABELS[s]}</option>
        ))}
      </select>
      <AuraShapeMark {...resolved} size={30} />
      {resolved.color.toLowerCase() === CA_AURA_DEFAULT_COLOR.toLowerCase() && !color && (
        <span className="text-[10px] text-stone-500">default</span>
      )}
    </div>
  );
}

/** A starting second colour that is visibly a gradient rather than a repeat. */
function shiftHue(hex: string, degrees: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  let [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (((h * 60 + degrees) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const [rr, gg, bb] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, "0");
  return `#${to(rr)}${to(gg)}${to(bb)}`;
}

/**
 * The aura as an edge treatment for a whole surface: a glow that hugs every
 * side, with the character's shape drifting along the border.
 *
 * The sheet's glow used to be a plain outer `box-shadow` on the root, which a
 * scroll container or a full-screen dialog clips - on a phone that left a
 * bright line under the header and nothing down the sides. This is an inset
 * ring plus its own absolutely positioned layer, so there is nothing to clip.
 *
 * Faint on purpose. It is meant to be noticed the way a colour is, not read
 * the way an icon is.
 */
export function AuraEdgeField({
  color,
  color2 = null,
  angle = 180,
  shape,
  count = 12,
  className = "",
}: {
  color: string;
  color2?: string | null;
  angle?: number;
  shape: CAAuraShape;
  count?: number;
  className?: string;
}) {
  const { hostRef, nodesRef } = useAuraParticles({ motion: "edge", count, animate: shape !== "none" });
  return (
    <span
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
      data-testid="aura-edge-field"
    >
      <AuraRing color={color} color2={color2} angle={angle} />
      <AuraParticleNodes count={count} color={color} color2={color2} shape={shape} nodesRef={nodesRef} />
    </span>
  );
}

/**
 * Tracker cards, the mini player card, the hotbar slot holding a character -
 * anything short and wide.
 *
 * Shapes run the long edges only, in one end and out the other, so the card
 * reads as having a current moving through it. A lap of the border is what a
 * sheet gets; on a 100px strip it is a shape spending half its life rounding
 * corners.
 */
export function AuraCurrentField({
  color,
  color2 = null,
  angle = 180,
  shape,
  count = 9,
  active = false,
  className = "",
}: {
  color: string;
  color2?: string | null;
  angle?: number;
  shape: CAAuraShape;
  count?: number;
  /** Winds the current up - a roll tray uses it while the dice tumble. */
  active?: boolean;
  className?: string;
}) {
  const { hostRef, nodesRef } = useAuraParticles({
    motion: "current",
    count,
    animate: shape !== "none",
    speed: active ? 2.6 : 1,
  });
  return (
    <span
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
      data-testid="aura-current-field"
    >
      <AuraRing color={color} color2={color2} angle={angle} strength={active ? 1 : 0.7} />
      <AuraParticleNodes count={count} color={color} color2={color2} shape={shape} nodesRef={nodesRef} />
    </span>
  );
}

