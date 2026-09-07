/**
 * C.A.-only pieces: the rank readout and its reference panel, and the Aura
 * (colour + animated shape) that replaces beacon colours throughout C.A.
 *
 * Kept out of GameComponents.tsx, which is already past 30k lines.
 */
import React, { useId, useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 text-stone-500 hover:text-amber-400"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          aria-label="What the ranks mean"
          data-testid="button-ca-rank-info"
        >
          <Info className="h-3 w-3" />
        </Button>
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
 * Deterministic per-particle orbit. Seeded off the particle's index rather
 * than Math.random so a re-render doesn't teleport every particle - they have
 * to keep drifting from wherever they were, not restart somewhere new.
 *
 * A particle travels a closed loop around the middle of the field, so it is
 * always moving and always somewhere the colour actually is. The first pass
 * had them run a line and fade at both ends, which read as blinking in and
 * out of a few fixed spots rather than floating.
 */
function particleOrbit(i: number) {
  const golden = 0.6180339887;
  return {
    // Where on the loop it starts, and how far out it runs. Kept well inside
    // the field: the colour itself fades out around 78%, so a particle any
    // further out would be drifting over nothing.
    angle: ((i * golden) % 1) * Math.PI * 2,
    radius: 22 + ((i * 5) % 9),
    duration: 13 + ((i * 3.3) % 9),
    delay: -((i * 4.1) % 13),
    scale: 0.8 + ((i * 0.37) % 0.45),
    reverse: i % 2 === 1,
  };
}

/**
 * The aura: the character's colour as a field, with their shape drifting
 * around inside it like something suspended in it.
 *
 * The particles fade in as they come out of the middle and fade out again as
 * they reach the edge, so nothing ever hits a hard boundary - a radial mask
 * would be the obvious way to do that, but masks did not render at all when
 * this was checked (see woundBodyImages.ts for the same finding), so the fade
 * is in each particle's own opacity keyframes instead.
 *
 * Below `PARTICLE_MIN_SIZE` there is no room for any of this - at 12px a
 * particle is two pixels - so it falls back to the single centred shape.
 */
const PARTICLE_MIN_SIZE = 20;
const PARTICLE_COUNT = 4;

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
   * How much faster than usual the shapes move. The loop is a slow drift by
   * design - it sits on a sheet you are reading - but a beacon is on screen
   * for a second and a half, and over that a 15s orbit does not visibly move
   * at all. The beacon winds it up rather than settling for a still image.
   */
  speed?: number;
  className?: string;
  title?: string;
}) {
  // Unique per instance: two auras on screen at once must not share a
  // keyframes name, or the second one's animation wins for both.
  const rawId = useId();
  const animId = `aura-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const field = (children: React.ReactNode, extraStyle?: React.CSSProperties) => (
    <span
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
        ...extraStyle,
      }}
    >
      {children}
    </span>
  );

  // No shape, or too small for particles to read: the plain pulsing dot.
  if (shape === "none" || size < PARTICLE_MIN_SIZE) {
    if (shape === "none") {
      return field(
        <>
          <span
            style={{
              position: "absolute",
              inset: "22%",
              borderRadius: "9999px",
              backgroundColor: color,
              ...(animate ? { animation: `${animId}pulse ${(2.4 / speed).toFixed(2)}s ease-in-out infinite` } : {}),
            }}
          />
          {animate && (
            <style>{`@keyframes ${animId}pulse{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.14)}}`}</style>
          )}
        </>,
      );
    }
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        role={title ? "img" : "presentation"}
        aria-hidden={title ? undefined : true}
        data-testid="aura-mark"
        data-aura-shape={shape}
        style={{
          overflow: "visible",
          filter: `drop-shadow(0 0 ${Math.max(2, size / 5)}px ${color})`,
          ...(animate ? { animation: `${animId} ${(2.4 / speed).toFixed(2)}s ease-in-out infinite` } : {}),
        }}
      >
        {title && <title>{title}</title>}
        {animate && (
          <style>{`@keyframes ${animId}{0%,100%{opacity:.7;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}`}</style>
        )}
        <path
          d={AURA_SHAPE_PATHS[shape]}
          fill={shape === "ring" ? "none" : color}
          fillOpacity={0.35}
          stroke={color}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const particleSize = Math.round(size * 0.3);
  const orbits = Array.from({ length: PARTICLE_COUNT }, (_, i) => particleOrbit(i));

  // Four waypoints round the loop, each one pulled in or pushed out a little
  // so the path is a lopsided wander rather than a clean circle.
  const waypoint = (o: ReturnType<typeof particleOrbit>, k: number) => {
    const a = o.angle + (k * Math.PI) / 2;
    const r = o.radius * (k % 2 === 0 ? 1.06 : 0.84);
    return { x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r };
  };

  return field(
    <>
      <style>
        {orbits
          .map((o, i) => {
            const name = `${animId}p${i}`;
            const at = (k: number, pct: number, s: number) => {
              const w = waypoint(o, k);
              return `${pct}%{left:${w.x.toFixed(2)}%;top:${w.y.toFixed(2)}%;transform:translate(-50%,-50%) scale(${(o.scale * s).toFixed(3)})}`;
            };
            // No fade in the loop at all: the particle is simply always there,
            // going round. Only its size breathes, which keeps it alive
            // without the popping the old opacity ramp had.
            return (
              `@keyframes ${name}{` +
              at(0, 0, 1) +
              at(1, 25, 0.88) +
              at(2, 50, 1.08) +
              at(3, 75, 0.92) +
              at(4, 100, 1) +
              `}`
            );
          })
          .join("")}
      </style>
      {orbits.map((o, i) => {
        const start = waypoint(o, 0);
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            width={particleSize}
            height={particleSize}
            aria-hidden
            style={{
              position: "absolute",
              left: `${start.x}%`,
              top: `${start.y}%`,
              transform: "translate(-50%, -50%)",
              overflow: "visible",
              opacity: 0.9,
              // The shapes are drawn in the aura's own colour on a ground
              // that is often already glowing in it - a beacon's ring most of
              // all - so a flat outline disappears into it. A little of the
              // colour thrown off the edge keeps them legible.
              filter: `drop-shadow(0 0 ${Math.max(1, Math.round(particleSize / 3))}px ${color})`,
              ...(animate
                ? {
                    animation: `${animId}p${i} ${(o.duration / speed).toFixed(2)}s linear ${(o.delay / speed).toFixed(2)}s infinite ${o.reverse ? "reverse" : "normal"}`,
                  }
                : {}),
            }}
          >
            <path
              d={AURA_SHAPE_PATHS[shape]}
              fill={shape === "ring" ? "none" : color}
              fillOpacity={0.55}
              stroke={color}
              strokeWidth={2.4}
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
      {title && <span className="sr-only">{title}</span>}
    </>,
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
 * side, with the character's shape drifting faintly along the edges.
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
  count = 7,
  className = "",
}: {
  color: string;
  shape: CAAuraShape;
  count?: number;
  className?: string;
}) {
  const rawId = useId();
  const animId = `auraedge-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  // Every particle rides the perimeter, on the same loop the glow sits on, and
  // the loop is measured in pixels from the edge rather than percentages: a
  // percentage inset on a tall sheet puts the side particles a long way in
  // over the content, which is exactly where the colour isn't. The wrapper
  // clips to the box, so nothing can wander outside the outline either.
  const marks = Array.from({ length: count }, (_, i) => {
    const inset = 7 + ((i * 5) % 9);
    return {
      inset,
      // How far back from each corner the path starts turning, so a particle
      // rounds the corner instead of hitting it square.
      corner: 16,
      size: 11 + ((i * 5) % 9),
      duration: 30 + ((i * 7) % 21),
      delay: -((i * 6.5) % 30),
      spin: 22 + ((i * 4) % 15),
      reverse: i % 2 === 1,
    };
  });

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
      data-testid="aura-edge-field"
    >
      {/* The glow itself, as an inset ring so no ancestor can clip it. */}
      <span
        className="absolute inset-0 rounded-[inherit]"
        style={{ boxShadow: `inset 0 0 0 1px ${color}55, inset 0 0 26px -6px ${color}` }}
      />
      {shape !== "none" && (
        <>
          <style>
            {marks
              .map((m, i) => {
                const near = `${m.inset}px`;
                const nearC = `${m.inset + m.corner}px`;
                const far = `calc(100% - ${m.inset}px)`;
                const farC = `calc(100% - ${m.inset + m.corner}px)`;
                // Eight waypoints: the four sides get most of the loop, the
                // four corner cuts get a sliver each, which slows a particle
                // through the turn the way something with weight would.
                return (
                  `@keyframes ${animId}t${i}{` +
                  `0%{left:${nearC};top:${near}}` +
                  `21%{left:${farC};top:${near}}` +
                  `25%{left:${far};top:${nearC}}` +
                  `46%{left:${far};top:${farC}}` +
                  `50%{left:${farC};top:${far}}` +
                  `71%{left:${nearC};top:${far}}` +
                  `75%{left:${near};top:${farC}}` +
                  `96%{left:${near};top:${nearC}}` +
                  `100%{left:${nearC};top:${near}}}`
                );
              })
              .join("") + `@keyframes ${animId}spin{to{transform:rotate(360deg)}}`}
          </style>
          {marks.map((m, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${m.inset + m.corner}px`,
                top: `${m.inset}px`,
                // The travel animation only touches left/top, so this stays
                // put and the rotation below has the transform to itself.
                transform: "translate(-50%, -50%)",
                lineHeight: 0,
                animation: `${animId}t${i} ${m.duration}s linear ${m.delay}s infinite ${m.reverse ? "reverse" : "normal"}`,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width={m.size}
                height={m.size}
                style={{
                  display: "block",
                  overflow: "visible",
                  // Faint on purpose - it should read as the colour moving,
                  // not as a row of icons.
                  opacity: 0.45,
                  animation: `${animId}spin ${m.spin}s linear ${-i * 3}s infinite ${m.reverse ? "reverse" : "normal"}`,
                }}
              >
                <path
                  d={AURA_SHAPE_PATHS[shape]}
                  fill={shape === "ring" ? "none" : color}
                  fillOpacity={0.18}
                  stroke={color}
                  strokeOpacity={0.7}
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          ))}
        </>
      )}
    </span>
  );
}
