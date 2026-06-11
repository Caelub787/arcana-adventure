import {
  Bird,
  BookOpen,
  Building2,
  Castle,
  Church,
  Clock,
  Cloud,
  Coins,
  Compass,
  Crown,
  Dices,
  Drama,
  Eye,
  FileText,
  Flag,
  Flame,
  Flower2,
  Gem,
  Ghost,
  GitBranch,
  Globe,
  Globe2,
  Hourglass,
  Landmark,
  Languages,
  LayoutGrid,
  Leaf,
  Lock,
  Map as MapIcon,
  MapPin,
  Mountain,
  Package,
  PawPrint,
  Scale,
  Scroll,
  Shield,
  Skull,
  Sparkle,
  Sprout,
  Star,
  Sword,
  Swords,
  Target,
  TreePine,
  Trees,
  UserSquare,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import type { NodeKind } from "@workspace/api-zod";

export interface KindMeta {
  kind: NodeKind;
  label: string;
  color: string;
  icon: LucideIcon;
}

export interface KindCategory {
  id: string;
  label: string;
  kinds: KindMeta[];
}

const m = (
  kind: NodeKind,
  label: string,
  icon: LucideIcon,
  color: string,
): KindMeta => ({ kind, label, icon, color });

export const KIND_CATEGORIES: KindCategory[] = [
  {
    id: "general",
    label: "General",
    kinds: [
      m("note", "Note", FileText, "#7c5cff"),
      m("canvas", "Canvas", LayoutGrid, "#06b6d4"),
      m("map", "Map", MapIcon, "#14b8a6"),
      // Plain "Item" entry that lives outside the Arcana category. The
      // Arcana category also contains an "Item" KindMeta that maps to the
      // same NodeKind — this General entry is what shows up for users who
      // just want a generic in-world object without the RPG sheet
      // wiring. getKindMeta() returns the FIRST match, so this entry
      // wins for display since General comes before Arcana in the
      // categories array.
      m("item", "Item", Package, "#f59e0b"),
    ],
  },
  {
    id: "people-society",
    label: "People & Society",
    kinds: [
      m("character", "Character", Users, "#ec4899"),
      m("faction", "Faction", Globe, "#3b82f6"),
      m("culture", "Culture", Drama, "#f472b6"),
      m("religion", "Religion", Church, "#fbbf24"),
      m("language", "Language", Languages, "#60a5fa"),
      m("social-class", "Social Class", Crown, "#facc15"),
    ],
  },
  {
    id: "places",
    label: "Places",
    kinds: [
      m("location", "Location", MapPin, "#10b981"),
      m("region", "Region", MapIcon, "#34d399"),
      m("settlement", "Settlement", Castle, "#a3e635"),
      m("building", "Building", Building2, "#84cc16"),
      m("ruin-or-dungeon", "Ruin or Dungeon", Skull, "#71717a"),
      m("landmark", "Landmark", Flag, "#fb923c"),
    ],
  },
  {
    id: "world-nature",
    label: "World & Nature",
    kinds: [
      m("world-or-plane", "World or Plane", Globe2, "#0ea5e9"),
      m("geography", "Geography", Mountain, "#a8a29e"),
      m("climate", "Climate", Cloud, "#7dd3fc"),
    ],
  },
  {
    id: "ecology",
    label: "Ecology",
    kinds: [
      m("ecology", "Ecology", Leaf, "#15803d"),
      m("biome", "Biome", Trees, "#16a34a"),
      m("flora", "Flora", Flower2, "#22c55e"),
      m("fauna", "Fauna", Bird, "#65a30d"),
      m("species", "Species", PawPrint, "#22c55e"),
      m("plant", "Plant", Sprout, "#4ade80"),
      m("tree", "Tree", TreePine, "#15803d"),
    ],
  },
  {
    id: "history-lore",
    label: "History & Lore",
    kinds: [
      m("era-or-age", "Era or Age", Hourglass, "#d97706"),
      m("historical-event", "Historical Event", Sword, "#ef4444"),
      m("war-or-conflict", "War or Conflict", Swords, "#dc2626"),
      m("myth-or-legend", "Myth or Legend", Scroll, "#f59e0b"),
      m("prophecy", "Prophecy", Eye, "#a78bfa"),
    ],
  },
  {
    id: "magic-supernatural",
    label: "Magic & the Supernatural",
    kinds: [
      m("magic-system", "Magic System", Wand2, "#9333ea"),
      m("spell", "Spell or Ability", Sparkle, "#8b5cf6"),
      m("artifact-or-relic", "Artifact or Relic", Gem, "#c084fc"),
      m("deity", "Deity", Star, "#fde047"),
      m("supernatural-entity", "Supernatural Entity", Ghost, "#a855f7"),
      m("ritual", "Ritual", Flame, "#f97316"),
    ],
  },
  {
    id: "economy-politics",
    label: "Economy & Politics",
    kinds: [
      m("government", "Government", Landmark, "#475569"),
      m("law-or-tradition", "Law or Tradition", Scale, "#94a3b8"),
      m("trade-good", "Trade Good", Package, "#a855f7"),
      m("currency", "Currency", Coins, "#eab308"),
      m("military", "Military", Target, "#b91c1c"),
    ],
  },
  {
    id: "story-narrative",
    label: "Story & Narrative",
    kinds: [
      m("quest-or-plot-hook", "Quest or Plot Hook", Compass, "#f59e0b"),
      m("timeline", "Timeline", Clock, "#0ea5e9"),
      m("lore-entry", "Lore Entry", BookOpen, "#f59e0b"),
      m("secret-or-mystery", "Secret or Mystery", Lock, "#6b7280"),
    ],
  },
  {
    id: "arcana",
    label: "Arcana",
    kinds: [
      m("item", "Item", Package, "#a855f7"),
      m("spell", "Spell", Sparkle, "#8b5cf6"),
      m("character", "Character", Users, "#ec4899"),
      m("species", "Species", PawPrint, "#22c55e"),
      m("class", "Class", Shield, "#f97316"),
      m("feat-tree", "Feat Tree", GitBranch, "#0ea5e9"),
      m("character-template", "Character Template", UserSquare, "#d946ef"),
      m("roll-template", "Roll Template", Dices, "#eab308"),
    ],
  },
];

const FALLBACK_META: KindMeta = {
  kind: "note" as NodeKind,
  label: "Note",
  icon: FileText,
  color: "#7c5cff",
};

const META_BY_KIND: Map<NodeKind, KindMeta> = (() => {
  const map = new Map<NodeKind, KindMeta>();
  for (const cat of KIND_CATEGORIES) {
    for (const meta of cat.kinds) {
      if (!map.has(meta.kind)) map.set(meta.kind, meta);
    }
  }
  return map;
})();

export function getKindMeta(kind: string): KindMeta {
  return META_BY_KIND.get(kind as NodeKind) ?? FALLBACK_META;
}

export function getKindIcon(kind: string): LucideIcon {
  return getKindMeta(kind).icon;
}

export function getKindLabel(kind: string): string {
  return getKindMeta(kind).label;
}

export function getKindColor(kind: string): string {
  return getKindMeta(kind).color;
}

export const ARCANA_CATEGORY_ID = "arcana";

export function isArcanaCategoryKind(kind: string, categoryId: string): boolean {
  return categoryId === ARCANA_CATEGORY_ID && hasArcanaKind(kind);
}

const ARCANA_KIND_SET = new Set<string>(
  KIND_CATEGORIES.find((c) => c.id === ARCANA_CATEGORY_ID)?.kinds.map(
    (k) => k.kind,
  ) ?? [],
);

export function hasArcanaKind(kind: string): boolean {
  return ARCANA_KIND_SET.has(kind);
}

// Find the category id that a given kind belongs to. Used by the
// create-node guide / + New dropdown to auto-expand the right
// (collapsed-by-default) category when Compass suggests a specific
// kindHint. Several kinds (item, spell, character, species) appear in
// BOTH a regular category and the Arcana category; default to the
// non-Arcana one unless the caller explicitly asks for Arcana.
export function getCategoryIdForKind(
  kind: string,
  opts?: { preferArcana?: boolean },
): string | null {
  const preferArcana = opts?.preferArcana ?? false;
  let arcanaMatch: string | null = null;
  for (const cat of KIND_CATEGORIES) {
    for (const meta of cat.kinds) {
      if (meta.kind === kind) {
        if (cat.id === ARCANA_CATEGORY_ID) {
          if (preferArcana) return cat.id;
          arcanaMatch = cat.id;
        } else {
          return cat.id;
        }
      }
    }
  }
  return arcanaMatch;
}

// ---- Tags ----------------------------------------------------------------

export interface TagOption {
  id: string;
  label: string;
  color: string;
  className: string;
}

export const TAG_OPTIONS: TagOption[] = [
  { id: "template", label: "Template", color: "#a78bfa", className: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  { id: "draft", label: "Draft", color: "#fbbf24", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { id: "canon", label: "Canon", color: "#22c55e", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { id: "non-canon", label: "Non Canon", color: "#94a3b8", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  { id: "archived", label: "Archived", color: "#6b7280", className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  { id: "favorite", label: "Favorite", color: "#facc15", className: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  { id: "private", label: "Private", color: "#f87171", className: "bg-red-500/15 text-red-300 border-red-500/30" },
  { id: "shared", label: "Shared", color: "#60a5fa", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  { id: "player-visible", label: "Player Visible", color: "#34d399", className: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  { id: "gm-only", label: "GM Only", color: "#fb7185", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  { id: "completed", label: "Completed", color: "#10b981", className: "bg-green-500/15 text-green-300 border-green-500/30" },
  { id: "in-progress", label: "In Progress", color: "#3b82f6", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { id: "reference", label: "Reference", color: "#a855f7", className: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { id: "placeholder", label: "Placeholder", color: "#9ca3af", className: "bg-gray-500/15 text-gray-300 border-gray-500/30" },
];

const TAG_BY_ID: Map<string, TagOption> = new Map(
  TAG_OPTIONS.map((t) => [t.id, t]),
);

export function getTagOption(id: string): TagOption | undefined {
  return TAG_BY_ID.get(id);
}
