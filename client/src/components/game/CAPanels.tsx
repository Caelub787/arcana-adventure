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
const AURA_SHAPE_PATHS: Record<Exclude<CAAuraShape, "none">, string> = {
  ring: "M12 3 A9 9 0 1 1 11.99 3 Z",
  star: "M12 2 L14.9 9.1 L22.5 9.6 L16.7 14.5 L18.5 21.9 L12 17.8 L5.5 21.9 L7.3 14.5 L1.5 9.6 L9.1 9.1 Z",
  diamond: "M12 1.5 L22.5 12 L12 22.5 L1.5 12 Z",
  hexagon: "M12 1.8 L21 7 L21 17 L12 22.2 L3 17 L3 7 Z",
  bolt: "M13.8 1.5 L4.5 13.5 L10.8 13.5 L9.6 22.5 L19.5 10.2 L13.2 10.2 Z",
  flame: "M12 1.5 C15 6 18.6 7.8 18.6 13.2 C18.6 17.8 15.6 22.5 12 22.5 C8.4 22.5 5.4 17.8 5.4 13.2 C5.4 9.9 7.5 8.4 8.7 6.3 C9.3 8.7 10.5 9.6 11.4 9.6 C12.6 9.6 12.9 7.5 12 1.5 Z",
};

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

type AuraMotion = "interior" | "edge" | "current" | "burst";

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
          p.size = Math.max(3, Math.min(w, h) * rnd(0.13, 0.21));
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
          p.size = rnd(6, 13);
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
    case "current":
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
          p.size = rnd(5, 11);
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

    // Thrown out of the middle, for a tray announcing a result.
    default:
      return {
        spawn(p: AuraParticle, w: number, h: number, first: boolean) {
          const a = rnd(0, Math.PI * 2);
          p.ttl = rnd(1.3, 2.8) / (active ? 1.5 : 1);
          // Speed comes from how far it should get, not a fixed px/s: a roll
          // tray is 85px across, and an absolute speed threw every shape out
          // of it and into the clip within a few frames.
          const R = Math.min(w, h) / 2;
          const sp = (R * rnd(0.55, 1.05) * speed) / p.ttl;
          p.x = w / 2;
          p.y = h / 2;
          p.vx = Math.cos(a) * sp;
          p.vy = Math.sin(a) * sp * 0.7;
          p.size = rnd(5, 11);
          // Negative age is a wait: they come out in their own time rather
          // than all at once on a shared beat.
          p.age = first ? rnd(-0.6, p.ttl) : -rnd(0, 0.6);
          p.fadeIn = p.ttl * 0.22;
          p.fadeOut = p.ttl * 0.45;
          p.peak = active ? rnd(0.5, 0.72) : rnd(0.28, 0.46);
          p.rot = rnd(0, 360);
          p.vrot = rnd(-30, 30);
        },
        step(p: AuraParticle, dt: number, _w: number, _h: number) {
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
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
        fill={shape === "ring" ? "none" : color}
        fillOpacity={0.18}
        stroke={color}
        strokeOpacity={0.72}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The nodes the engine writes to. Positioned entirely by `transform`. */
function AuraParticleNodes({
  count,
  color,
  shape,
  nodesRef,
  glow,
}: {
  count: number;
  color: string;
  shape: CAAuraShape;
  nodesRef: React.MutableRefObject<Array<HTMLSpanElement | null>>;
  glow?: boolean;
}) {
  if (shape === "none") return null;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
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
            ...(glow ? { filter: `drop-shadow(0 0 3px ${color})` } : {}),
          }}
        >
          <AuraGlyph color={color} shape={shape} />
        </span>
      ))}
    </>
  );
}

/** The inset ring every aura surface wears, so no ancestor can clip the glow. */
function AuraRing({ color, strength = 1 }: { color: string; strength?: number }) {
  return (
    <span
      className="absolute inset-0 rounded-[inherit]"
      style={{ boxShadow: `inset 0 0 0 1px ${color}55, inset 0 0 ${Math.round(26 * strength)}px -6px ${color}` }}
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
  shape,
  size = 16,
  animate = true,
  speed = 1,
  className,
  title,
}: {
  color: string;
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
        // are suspended in.
        background: `radial-gradient(circle at 50% 50%, ${color}66 0%, ${color}22 55%, transparent 78%)`,
        boxShadow: `0 0 ${Math.max(3, size / 3)}px ${color}55`,
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
          backgroundColor: color,
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
            fill={shape === "ring" ? "none" : color}
            fillOpacity={0.28}
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return field(
    <>
      <AuraParticleNodes count={PARTICLE_COUNT} color={color} shape={shape} nodesRef={nodesRef} glow />
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
  return <AuraShapeMark color={aura.color} shape={aura.shape} size={size} animate={animate} className={className} title={title} />;
}

/** Colour picker plus shape picker, with a live preview of the pair. */
export function CaAuraEditor({
  color,
  shape,
  onChange,
}: {
  color: string | null | undefined;
  shape: string | null | undefined;
  onChange: (next: { color: string; shape: CAAuraShape }) => void;
}) {
  const resolved = caAuraOf({ caAuraColor: color, caAuraShape: shape });

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="ca-aura-editor">
      <input
        type="color"
        value={resolved.color}
        onChange={(e) => onChange({ color: e.target.value, shape: resolved.shape })}
        className="h-7 w-10 rounded border border-stone-700 bg-stone-900 p-0.5 cursor-pointer"
        aria-label="Aura colour"
        data-testid="input-ca-aura-color"
      />
      <select
        value={resolved.shape}
        onChange={(e) => onChange({ color: resolved.color, shape: caAuraShapeOf(e.target.value) })}
        className="h-7 rounded border border-stone-700 bg-stone-900 text-stone-200 text-xs px-1.5"
        aria-label="Aura shape"
        data-testid="select-ca-aura-shape"
      >
        {CA_AURA_SHAPES.map((s) => (
          <option key={s} value={s}>{CA_AURA_SHAPE_LABELS[s]}</option>
        ))}
      </select>
      <AuraShapeMark color={resolved.color} shape={resolved.shape} size={30} />
      {resolved.color.toLowerCase() === CA_AURA_DEFAULT_COLOR.toLowerCase() && !color && (
        <span className="text-[10px] text-stone-500">default</span>
      )}
    </div>
  );
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
  shape,
  count = 12,
  className = "",
}: {
  color: string;
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
      <AuraRing color={color} />
      <AuraParticleNodes count={count} color={color} shape={shape} nodesRef={nodesRef} />
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
  shape,
  count = 9,
  className = "",
}: {
  color: string;
  shape: CAAuraShape;
  count?: number;
  className?: string;
}) {
  const { hostRef, nodesRef } = useAuraParticles({ motion: "current", count, animate: shape !== "none" });
  return (
    <span
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
      data-testid="aura-current-field"
    >
      <AuraRing color={color} strength={0.7} />
      <AuraParticleNodes count={count} color={color} shape={shape} nodesRef={nodesRef} />
    </span>
  );
}

/**
 * The roll tray, and anything else that exists to announce a result.
 *
 * Shapes are thrown out of the middle and fade on the way to the edge, so the
 * tray reads as something arriving rather than something idling. `active`
 * winds it up while the dice are actually rolling, which is the difference
 * between a number landing and a number having landed.
 */
export function AuraBurstField({
  color,
  shape,
  count = 9,
  active = false,
  className = "",
}: {
  color: string;
  shape: CAAuraShape;
  count?: number;
  active?: boolean;
  className?: string;
}) {
  const { hostRef, nodesRef } = useAuraParticles({
    motion: "burst",
    count,
    active,
    animate: shape !== "none",
  });
  return (
    <span
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
      data-testid="aura-burst-field"
    >
      <AuraRing color={color} strength={active ? 1 : 0.6} />
      <AuraParticleNodes count={count} color={color} shape={shape} nodesRef={nodesRef} />
    </span>
  );
}
