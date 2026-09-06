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
 * The aura's shape, pulsing in its colour. `none` renders a plain filled dot
 * so a character with no shape still reads as having an aura at all.
 *
 * The animation is inline rather than a Tailwind class because the glow has
 * to be keyed to the aura's own colour, which isn't known at build time.
 */
export function AuraShapeMark({
  color,
  shape,
  size = 16,
  animate = true,
  className,
  title,
}: {
  color: string;
  shape: CAAuraShape;
  size?: number;
  animate?: boolean;
  className?: string;
  title?: string;
}) {
  // Unique per instance: two auras on screen at once must not share a
  // keyframes name, or the second one's colour wins for both.
  const rawId = useId();
  const animId = `aura-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  if (shape === "none") {
    return (
      <span
        className={className}
        title={title}
        aria-hidden={title ? undefined : true}
        data-testid="aura-mark"
        data-aura-shape="none"
        style={{
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: "9999px",
          backgroundColor: color,
          boxShadow: `0 0 ${size / 2}px ${color}`,
          ...(animate ? { animation: `${animId} 2.4s ease-in-out infinite` } : {}),
        }}
      >
        {animate && (
          <style>{`@keyframes ${animId}{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}`}</style>
        )}
      </span>
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
        ...(animate ? { animation: `${animId} 2.4s ease-in-out infinite` } : {}),
      }}
    >
      {title && <title>{title}</title>}
      {animate && (
        <style>{`@keyframes ${animId}{0%,100%{opacity:.7;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}`}</style>
      )}
      <path
        d={AURA_SHAPE_PATHS[shape]}
        // The ring is the one shape that shouldn't be filled in - it's a ring.
        fill={shape === "ring" ? "none" : color}
        fillOpacity={0.35}
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
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
      <AuraShapeMark color={resolved.color} shape={resolved.shape} size={22} />
      {resolved.color.toLowerCase() === CA_AURA_DEFAULT_COLOR.toLowerCase() && !color && (
        <span className="text-[10px] text-stone-500">default</span>
      )}
    </div>
  );
}
