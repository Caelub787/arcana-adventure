// A fixed set of icons sheets can use (icon blocks, layout items, tabs). Named
// rather than imported by the editor so documents just store "Heart".
import React from "react";
import {
  Heart, HeartPulse, Shield, ShieldPlus, Zap, Flame, Star, Sparkles, Swords, Sword, Axe, Backpack, Package, Gem, Skull, User, Users,
  Ruler, Clock, CalendarDays, MessageSquare, Languages, Footprints, Feather, Waves, Wind, Mountain, Eye, Brain, Dumbbell, Target,
  Crosshair, Dices, Coins, Scale, Hourglass, Sun, Moon, Droplet, Leaf, Hammer, Wand2, Scroll, BookOpen, Crown, Activity, TrendingUp,
  Infinity as InfinityIcon, Anchor, Bird, Fish, Hand, Bone, FlaskConical, Key, Lock, MapPin, Compass, Tent, Weight, Gauge, Orbit, Atom,
  CircleDot, Hexagon, Diamond, Snowflake, CloudLightning, Ghost, PawPrint, Shirt, Medal, Trophy, Flag, Bell, Music, Map as MapIcon,
} from "lucide-react";

export const AG_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Heart, HeartPulse, Shield, ShieldPlus, Zap, Flame, Star, Sparkles, Swords, Sword, Axe, Backpack, Package, Gem, Skull, User, Users,
  Ruler, Clock, CalendarDays, MessageSquare, Languages, Footprints, Feather, Waves, Wind, Mountain, Eye, Brain, Dumbbell, Target,
  Crosshair, Dices, Coins, Scale, Hourglass, Sun, Moon, Droplet, Leaf, Hammer, Wand2, Scroll, BookOpen, Crown, Activity, TrendingUp,
  Infinity: InfinityIcon, Anchor, Bird, Fish, Hand, Bone, FlaskConical, Key, Lock, MapPin, Compass, Tent, Weight, Gauge, Orbit, Atom,
  CircleDot, Hexagon, Diamond, Snowflake, CloudLightning, Ghost, PawPrint, Shirt, Medal, Trophy, Flag, Bell, Music, Map: MapIcon,
};
export const AG_ICON_NAMES = Object.keys(AG_ICONS);

export function AgIcon({ name, size = 16, color, className = "" }: { name: string | null | undefined; size?: number; color?: string; className?: string }) {
  const C = name ? AG_ICONS[name] : undefined;
  if (!C) return null;
  return <C className={className} style={{ width: size, height: size, color }} />;
}

/** A grid of every icon; click one to pick it. */
export function IconGrid({ value, onPick }: { value?: string | null; onPick: (name: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1" data-testid="ag-icon-grid">
      {AG_ICON_NAMES.map((n) => (
        <button key={n} type="button" title={n} onClick={() => onPick(n)} className={`h-8 grid place-items-center rounded border ${value === n ? "border-amber-500 bg-amber-900/30 text-amber-200" : "border-stone-800 bg-stone-800 text-stone-300 hover:border-amber-700"}`} data-testid={`ag-icon-${n}`}>
          <AgIcon name={n} size={16} />
        </button>
      ))}
    </div>
  );
}
