/**
 * A library item, laid out as a sheet with a View face and an Edit face.
 *
 * View is how an item spends nearly all its life: read, glanced at, rolled
 * from. It's a stat block shaped like the kind of item it is - a weapon
 * shows a damage chip, not a "Damage: 1d8" label; a potion reads like a
 * label, listing what it heals or deals; a crafter shows its actual
 * recipes, not a form for writing them. Edit is a deliberate mode a GM or
 * trusted player steps into with the pencil in the header: every field
 * becomes a plain, always-active input in an ordinary form, and nothing
 * reaches the server until Save. Cancel throws the whole draft away.
 *
 * This replaced an earlier version where every field edited itself in place
 * on double-click with no separate mode at all - fine for a handful of
 * values, but a crafter (Handling, Crafting Recipes, Repair, Build Recipe,
 * Effects, Rolls all at once) read as a pile of independently-editable
 * scraps rather than one thing. A second pass then made View real but left
 * it as the same field-grid layout with the inputs simply turned off - a
 * disabled form is not a stat block, so this pass gives each section its
 * own shape in View while Edit keeps the ordinary form underneath it.
 *
 * The sections after Handling appear only for the kind of item they belong
 * to, so a utility item is a handful of fields and a rune is those plus the
 * six that make it a rune - rather than one long form where most of it is
 * inert. There is no "advanced" button hiding the rest: a setting you cannot
 * find is a setting you do not have.
 *
 * One thing is deliberately absent, not authoring: `socketedRunes` is what
 * has been socketed into this item during play.
 */
import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, Sword, Shield, Coins, Trash2, X, Sparkles, ImageIcon,
  FlaskConical, Crosshair, Gem, ScrollText, BookOpen, Hammer, Dices, Layers,
  Pencil, Check, Feather, HeartPulse, Skull, Boxes, Wand2, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { api } from "@/lib/api";
import {
  CaSheetFrame,
  CaSection,
  CaFieldGrid,
  CaField,
  CaValue,
  CaDivider,
  CaMedallion,
} from "@/components/game/CASheetUI";
import { RollEntriesEditor } from "@/components/game/RollEntriesEditor";
import { CraftRecipesEditor } from "@/components/game/CraftRecipesEditor";
import { CrafterTemplateLinksPanel } from "@/components/admin/CrafterTemplateLinksPanel";
import { getEffectTypes } from "@/lib/effectTypes";
import { useImageBrowserBridge } from "@/lib/library-dialog-bridges";
import {
  CA_ITEM_EFFECT_TRIGGERS,
  CA_ITEM_EFFECT_TRIGGER_LABELS,
  makeCAItemEffect,
  normalizeCAItemEffects,
  type CAItemEffect,
  CA_WOUND_SEVERITIES,
  CA_WOUND_SEVERITY_LABELS,
  makeCAConsumableWoundOption,
  normalizeCAConsumableWoundOptions,
  caConsumableWoundOptionLabel,
  type CAConsumableWoundOption,
  CA_ATTRIBUTES,
  CA_ITEM_TYPES,
  CA_ITEM_TYPE_LABELS,
  type CAItemType,
  caNormalizeItemType,
  CA_WEAPON_HANDEDNESS,
  CA_WEAPON_HANDEDNESS_LABELS,
  type CAWeaponHandedness,
  CA_CONTAINER_KINDS,
  CA_CONTAINER_KIND_LABELS,
  CA_CONTAINER_KIND_DESCRIPTIONS,
  type CAContainerKind,
  type CARankScaling,
  type CARankScalingMode,
  normalizeCARankScaling,
  makeDefaultCARankScaling,
  makeNoCARankScaling,
  makeDefaultPriceCARankScaling,
  caEffectivePriceScaling,
  caRankScaledValue,
  caItemRankLabel,
  CA_RANK_LADDER,
  type CARuneBoost,
  makeCARuneBoost,
  normalizeCARuneBoosts,
  normalizeCASocketedRunes,
  caSplitDescriptionGmNotes,
} from "@shared/ca";
import { isWoundSystem, woundSystemRules } from "@shared/systemRules";
import { V3_SKILLS, V3_RUNE_TARGET_ITEM_TYPES, V3_RUNE_STAT_TARGETS } from "@shared/v3";

const opts = (values: readonly string[], blank?: string) => [
  ...(blank === undefined ? [] : [{ value: "", label: blank }]),
  ...values.map((v) => ({
    value: v,
    label: v.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
  })),
];
const titleCase = (v: string) => v.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/**
 * What a new item may be set to. C.A. has its own complete, alphabetical
 * list (shared/ca.ts CA_ITEM_TYPES) with every type pickable - unlike V2/V3,
 * nothing here is made by a separate flow. V2/V3 keep the older rule:
 * crafters are V2 and V3, spellbooks/miscellaneous are V3 only, and runes/
 * scrolls/currency are made by their own flows rather than picked here - but
 * an item that already is one keeps showing as one, because a select that
 * cannot represent its own value is worse than a long list.
 */
const ITEM_TYPES_BASE = ["ammunition", "armor", "consumable", "container", "utility", "weapon"];
function itemTypeOptions(systemSlug: string, current: string) {
  if (systemSlug === "ca") {
    const list: string[] = [...CA_ITEM_TYPES];
    const normalizedCurrent = caNormalizeItemType(current);
    if (current && current !== normalizedCurrent && !list.includes(current)) list.push(current);
    return list.map((v) => ({ value: v, label: CA_ITEM_TYPE_LABELS[v as CAItemType] ?? titleCase(v) }));
  }
  const list = [...ITEM_TYPES_BASE];
  if (systemSlug === "aa-v2" || systemSlug === "aa-v3") list.push("crafter");
  if (systemSlug === "aa-v3") list.push("miscellaneous", "spellbook");
  if (current && !list.includes(current)) list.push(current);
  return opts(list.sort());
}
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const ATTRIBUTES = ["might", "finesse", "wit", "presence", "will", "craft"];
const ARMOR_SLOTS = ["helm", "chest", "arm", "legs", "boots"];
const AOE_SHAPES = ["cone", "sphere", "line", "cube", "cylinder"];
const SCROLL_MODES = [
  { value: "spell", label: "Casts a spell" },
  { value: "knowledge", label: "Grants a Knowledge" },
  { value: "skill", label: "Adjusts a skill" },
];
const RUNE_USE_MODES = [
  { value: "none", label: "None (flavour only)" },
  { value: "skill_check", label: "Skill check" },
];
const v3SkillOpts = [{ value: "", label: "None" }, ...V3_SKILLS.map((s) => ({ value: s.key, label: s.name }))];

const RARITY_COLORS: Record<string, string> = {
  common: "text-stone-300",
  uncommon: "text-emerald-400",
  rare: "text-sky-400",
  epic: "text-purple-400",
  legendary: "text-amber-400",
};

/** The item-type icon shown in the View masthead and on type-specific chips. */
const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  weapon: Sword,
  armor: Shield,
  consumable: FlaskConical,
  ammunition: Crosshair,
  rune: Gem,
  scroll: ScrollText,
  spellbook: BookOpen,
  crafter: Hammer,
  container: Boxes,
  beast_orb: Wand2,
  currency: Coins,
  miscellaneous: Package,
};

/**
 * Local, unsent edits made while the sheet is in Edit mode. Nothing here
 * reaches the server until Save; Cancel just throws it away. Only fields the
 * sheet's own editor actually touches ever appear in it, so Save only ever
 * sends a real diff, never a wholesale copy of every column the item has.
 */
function useItemDraft(editing: boolean) {
  const [draft, setDraftState] = useState<Record<string, any>>({});
  useEffect(() => { if (!editing) setDraftState({}); }, [editing]);
  const patch = (p: Record<string, any>) => setDraftState((d) => ({ ...d, ...p }));
  return { draft, patch, isDirty: Object.keys(draft).length > 0, clear: () => setDraftState({}) };
}

/** A small gilt-bordered pill - a true flag made visible in View, never shown
 * at all when false (a badge that isn't there says nothing, which is right). */
function ItemBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide font-semibold ${tone === "danger" ? "border-red-800 text-red-400" : ""}`}
      style={tone === "neutral" ? { borderColor: "var(--ca-gilt-line)", color: "var(--ca-gilt)" } : undefined}
    >
      {children}
    </span>
  );
}

/**
 * View mode's one stat primitive: a flowing line of `label value` pairs,
 * no box, no grid - a reference strip rather than a form laid out flat.
 * Falsy entries (an attribute that doesn't apply to this item) are dropped,
 * and the whole strip disappears if nothing is left.
 */
function StatStrip({ stats }: { stats: Array<{ label: string; value: React.ReactNode } | null | false | undefined> }) {
  const visible = stats.filter((s): s is { label: string; value: React.ReactNode } => !!s);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {visible.map((s, i) => (
        <span key={i} className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[10px] uppercase tracking-wide text-stone-500">{s.label}</span>
          <span className="text-xs font-semibold text-stone-100">{s.value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * View mode's section chrome - a small inline icon and a label, no border,
 * no medallion. Deliberately lighter than CaSection (Edit mode's box): a
 * stat block reads top to bottom, it doesn't need every fact boxed off
 * from its neighbors the way a form's fields do.
 */
function ViewBlock({
  label,
  icon,
  value,
  children,
  testId,
}: {
  label: string;
  icon?: React.ReactNode;
  value?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ca-gilt)" }}>
          {icon}
          {label}
        </span>
        {value}
      </div>
      {children}
    </div>
  );
}

/** A real checkbox - Edit mode only. View mode renders a true flag as an
 * ItemBadge instead (see above) and nothing at all when false. */
function ToggleRow({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs w-fit cursor-pointer">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-amber-600 h-3.5 w-3.5 shrink-0"
        data-testid={testId}
      />
      <span className="text-stone-300">{label}</span>
    </label>
  );
}

/**
 * A list of {target, amount} rows. Three different things on this sheet have
 * that shape - the item's own effects, a V3 armour's boosts, a rune's stat
 * effects - and they differ only in what may be targeted, whether a row
 * carries a trigger, and (effects only) how a read-mode row is worded.
 */
function TargetAmountList<T extends { target: string; amount: number }>({
  rows,
  targets,
  editing,
  onChange,
  makeRow,
  emptyText,
  idOf,
  renderLead,
  renderReadRow,
  testId,
}: {
  rows: T[];
  targets: Array<{ value: string; label: string; group?: string }>;
  editing: boolean;
  onChange: (next: T[]) => void;
  makeRow: () => T;
  emptyText: string;
  idOf: (row: T, index: number) => string;
  renderLead?: (row: T, patch: (p: Partial<T>) => void) => React.ReactNode;
  /** Overrides the default "label: +amount" read-mode row, e.g. to fold a trigger into it. */
  renderReadRow?: (row: T, label: string) => React.ReactNode;
  testId: string;
}) {
  const groups = Array.from(new Set(targets.map((t) => t.group ?? "")));
  const known = new Set(targets.map((t) => t.value));
  const labelFor = (t: string) => targets.find((x) => x.value === t)?.label ?? t;

  if (!editing) {
    if (rows.length === 0) return <p className="text-[11px] text-stone-500">{emptyText}</p>;
    return (
      <div className="space-y-1" data-testid={testId}>
        {rows.map((row, i) => (
          <div key={idOf(row, i)} className="flex items-center justify-between gap-2 text-xs">
            {renderReadRow ? renderReadRow(row, labelFor(row.target)) : (
              <>
                <span className="text-stone-300">{labelFor(row.target)}</span>
                <span className="font-mono font-semibold" style={{ color: "var(--ca-gilt)" }}>
                  {row.amount > 0 ? `+${row.amount}` : row.amount}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid={testId}>
      {rows.length === 0 && <p className="text-[11px] text-stone-500">{emptyText}</p>}
      {rows.map((row, i) => {
        const id = idOf(row, i);
        const patch = (p: Partial<T>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
        return (
          <div key={id} className="flex items-center gap-1">
            {renderLead?.(row, patch)}
            <select
              value={row.target}
              onChange={(e) => patch({ target: e.target.value } as Partial<T>)}
              className="h-7 flex-1 min-w-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1"
              data-testid={`${testId}-${id}-target`}
            >
              {groups.map((g) =>
                g ? (
                  <optgroup key={g} label={g}>
                    {targets.filter((t) => t.group === g).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                ) : (
                  targets.filter((t) => !t.group).map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))
                ),
              )}
              {/* A target the lists no longer offer - a skill since renamed,
                  say - would otherwise display as whatever the first option
                  happens to be, and the next edit would quietly overwrite it
                  with that. */}
              {!known.has(row.target) && <option value={row.target}>{row.target} (unknown)</option>}
            </select>
            <input
              type="number"
              value={row.amount}
              onChange={(e) => patch({ amount: Math.round(Number(e.target.value) || 0) } as Partial<T>)}
              className="w-16 h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
              data-testid={`${testId}-${id}-amount`}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="text-stone-500 hover:text-red-400 shrink-0"
              data-testid={`${testId}-${id}-remove`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="text-[11px] text-amber-500 hover:text-amber-400"
        onClick={() => onChange([...rows, makeRow()])}
        data-testid={`${testId}-add`}
      >
        + Add
      </button>
    </div>
  );
}

/**
 * Edit-mode authoring for a rank-scalable C.A. stat: off by default (the
 * stat is just its own flat value), or Steady increase (one number added
 * per rung climbed) or Set value per rank (a GM-typed table, one cell per
 * rung on the same ladder a character's Rank uses - any rung left blank
 * just reads as the item's own base value).
 */
function RankScalingEditor({
  scaling,
  onChange,
  suffix,
  defaultOnValue,
  testId,
}: {
  /** The item's current config - pass the resolved effective value (see
   * caEffectivePriceScaling for Value's own GM-facing default). */
  scaling: CARankScaling | null;
  onChange: (next: CARankScaling) => void;
  suffix?: string;
  /** What checking the box on sets it to. Defaults to a blank Steady increase. */
  defaultOnValue?: CARankScaling;
  testId: string;
}) {
  const active = !!scaling && scaling.mode !== "none";
  const s = scaling && scaling.mode !== "none" ? scaling : makeDefaultCARankScaling();
  return (
    <div className="rounded border border-stone-700 bg-stone-900/40 p-1.5 space-y-1.5" data-testid={testId}>
      <label className="flex items-center gap-1.5 text-[10px] text-stone-400 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => onChange(e.target.checked ? (defaultOnValue ?? makeDefaultCARankScaling()) : makeNoCARankScaling())}
          className="accent-amber-600 h-3 w-3"
          data-testid={`${testId}-toggle`}
        />
        Scales with Rank
      </label>
      {active && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={s.mode}
              onChange={(e) => onChange({ ...s, mode: e.target.value as CARankScalingMode })}
              className="h-7 text-xs rounded border border-stone-700 bg-stone-800 text-stone-200 px-1.5"
              data-testid={`${testId}-mode`}
            >
              <option value="steady">Steady increase</option>
              <option value="table">Set value per rank</option>
              <option value="percent">Percentage per rank up</option>
            </select>
            {s.mode === "steady" && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={s.perRank}
                  onChange={(e) => onChange({ ...s, perRank: Number(e.target.value) || 0 })}
                  className="w-16 h-7 text-xs rounded border border-stone-700 bg-stone-800 text-stone-200 px-1.5"
                  data-testid={`${testId}-per-rank`}
                />
                <span className="text-[10px] text-stone-500">per rank{suffix ? ` (${suffix})` : ""}</span>
              </div>
            )}
            {s.mode === "percent" && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={s.percentPerRank}
                  onChange={(e) => onChange({ ...s, percentPerRank: Number(e.target.value) || 0 })}
                  className="w-16 h-7 text-xs rounded border border-stone-700 bg-stone-800 text-stone-200 px-1.5"
                  data-testid={`${testId}-percent-per-rank`}
                />
                <span className="text-[10px] text-stone-500">% per rank up (not star)</span>
              </div>
            )}
          </div>
          {s.mode === "table" && (
            <div className="grid grid-cols-5 gap-1 max-h-32 overflow-y-auto pr-1">
              {CA_RANK_LADDER.map((rung, i) => (
                <div key={i} className="flex flex-col items-center">
                  <span className="text-[8px] text-stone-500">{rung.rank.name[0]}{rung.star.star}</span>
                  <input
                    type="number"
                    value={s.table[i] ?? ""}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      const table = [...s.table];
                      table[i] = v;
                      onChange({ ...s, table });
                    }}
                    className="w-full h-6 text-[10px] text-center rounded border border-stone-700 bg-stone-800 text-stone-200"
                    data-testid={`${testId}-table-${i}`}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The sheet's Edit-mode field primitive: a label over a plain, always-active
 * input. No double-click, no per-field Save/Cancel - the whole sheet is
 * already in one editing session with its own Save/Cancel at top and
 * bottom. (View mode doesn't use this at all - each section builds its own
 * read layout, shaped like the stat it's showing rather than a form row.)
 */
function ItemField({
  field,
  label,
  value,
  onChange,
  kind = "text",
  options,
  placeholder,
  suffix,
  min,
  max,
  wide = false,
  testId,
  decimal = false,
}: {
  field: string;
  label: React.ReactNode;
  value: any;
  onChange: (value: any) => void;
  kind?: "text" | "number" | "textarea" | "select";
  /** For `select`: the values on offer, in order. */
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  /** Trailing unit shown after the value, e.g. "lb". */
  suffix?: React.ReactNode;
  min?: number;
  max?: number;
  wide?: boolean;
  testId?: string;
  /** Set true for `kind="number"` fields like weight that take fractional values. */
  decimal?: boolean;
}) {
  const id = testId ?? `item-field-${field}`;
  return (
    <CaField label={label} wide={wide}>
      {kind === "number" ? (
        <div className="flex items-center gap-1">
          <NumberInput
            min={min}
            max={max}
            integer={!decimal}
            value={value ?? min ?? 0}
            onChange={(v) => onChange(v ?? min ?? 0)}
            className="bg-stone-900 border-stone-700 text-stone-200 h-8 text-sm w-full"
            data-testid={id}
          />
          {suffix && <span className="text-stone-500 text-xs shrink-0">{suffix}</span>}
        </div>
      ) : kind === "select" ? (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full rounded border border-stone-700 bg-stone-900 text-stone-200 text-sm px-2"
          data-testid={id}
        >
          {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : kind === "textarea" ? (
        <textarea
          rows={3}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded border border-stone-700 bg-stone-900 text-stone-200 text-sm p-2 resize-y"
          data-testid={id}
        />
      ) : (
        <input
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 w-full rounded border border-stone-700 bg-stone-900 text-stone-200 text-sm px-2"
          data-testid={id}
        />
      )}
    </CaField>
  );
}

export function LibraryItemSheet({
  item,
  systemSlug,
  personal = false,
  canEdit = true,
  isGM,
  onUpdate,
  onDelete,
  onClose,
  hideCloseButton = false,
  onExecuteRoll,
  characterEnergy,
  characterMana,
  characterItems,
  characterCustomSkills,
  renderAfterHandling,
  initialEditing = false,
  onCaSocketRune,
  onCaUnsocketRune,
}: {
  item: any;
  systemSlug: string;
  /** Scopes the V3 lookup lists to the viewer's own library. */
  personal?: boolean;
  canEdit?: boolean;
  /**
   * Gates crafting-recipe authoring specifically. In Admin/My Library there
   * is no "owner" distinct from the editor, so this is left unset and falls
   * back to `canEdit`. The in-game item view passes the real GM flag so a
   * player who merely owns a crafter (which is also `canEdit`) can't author
   * its recipes - only view/use them via the separate play-mode Craft panel.
   */
  isGM?: boolean;
  onUpdate: (updates: Record<string, any>) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Hides the sheet's own close button for a host that already provides one
   * in its own chrome (e.g. a FloatingPanel title bar) - avoids two close
   * buttons stacked on top of each other. */
  hideCloseButton?: boolean;
  /**
   * In-game context for the Rolls section at the bottom of the sheet. Left
   * unset (as the admin library and blank-item-creation flows do), Rolls are
   * editable but not executable - there's no character to roll for yet.
   * A host with a live character (the in-game item view) passes these so the
   * same Rolls section becomes a real "use this item" control, matching what
   * the old item-detail view's own roll button did.
   */
  onExecuteRoll?: (roll: any) => void;
  characterEnergy?: number;
  characterMana?: number;
  characterItems?: any[];
  characterCustomSkills?: any[];
  /**
   * Extra content rendered right after Handling and before the type-specific
   * sections - Identity and Handling always show, so this is the spot for
   * something that should feel like it's always there too. Used in-game to
   * put the "Use this item" control (e.g. C.A.'s wound consumable panel) up
   * top rather than buried under every optional section.
   */
  renderAfterHandling?: React.ReactNode;
  /** Opens the sheet straight into Edit mode - for a just-created blank item,
   * which has nothing worth looking at in View yet. */
  initialEditing?: boolean;
  /**
   * C.A. rune attaching - unlimited, no slots. Both unset (as the admin
   * library's templates do - there's no real inventory to pull a rune from)
   * collapses Runes to a read-only, name-only list; the in-game item view
   * passes real handlers so a player can actually attach/detach one.
   */
  onCaSocketRune?: (runeItemId: string) => void;
  onCaUnsocketRune?: (socketId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(!!initialEditing);
  // A rune picked (via the add dropdown) or dropped onto the Runes section,
  // awaiting the player's confirmation before it's actually attached.
  const [pendingRuneAttach, setPendingRuneAttach] = useState<{ id: string; name: string } | null>(null);
  const [isRuneDragOver, setIsRuneDragOver] = useState(false);
  const { draft, patch: setDraft, isDirty, clear: clearDraft } = useItemDraft(isEditing);
  const queryClient = useQueryClient();

  /** Reads a field's pending edit if there is one, else the saved value -
   * identical to the saved value whenever the sheet isn't being edited. */
  const val = (field: string) => (field in draft ? draft[field] : item?.[field]);
  const chg = (field: string) => (v: any) => setDraft({ [field]: v });

  const handleSave = () => {
    // Saving any edit to a legacy C.A. item ("utility", or anything else
    // its new type list can't represent) also migrates its stored itemType
    // to the normalized value - a quiet, incidental cleanup riding along
    // on a GM's own edit, rather than a separate migration pass.
    const needsTypeMigration = isCA && !("itemType" in draft) && rawType && rawType !== type;
    if (isDirty || needsTypeMigration) {
      const normalized: Record<string, any> = {};
      for (const [k, v] of Object.entries(draft)) {
        normalized[k] = typeof v === "string" ? v.trim() : v;
      }
      if (needsTypeMigration) normalized.itemType = type;
      onUpdate(normalized);
    }
    clearDraft();
    setIsEditing(false);
  };
  const handleCancel = () => {
    clearDraft();
    setIsEditing(false);
  };
  const handleCloseClick = () => {
    if (isEditing && isDirty && !window.confirm("Discard unsaved changes?")) return;
    clearDraft();
    setIsEditing(false);
    onClose();
  };

  // Same "GM or admin" flag used both to gate crafting-recipe authoring and
  // to decide who can ever see a section the GM has hidden below.
  const isSheetGM = isGM ?? canEdit;
  // Which optional sections the GM has hidden from this item's own sheet -
  // never Identity or Handling, which always apply. Everything else starts
  // visible; nothing is pre-hidden on the GM's behalf. Declutter is its own
  // concern from editing the item's data, so it stays live-clickable and
  // immediate regardless of Edit mode.
  const hiddenSections: string[] = Array.isArray(item?.hiddenSections) ? item.hiddenSections : [];
  const setSectionHidden = (key: string, hide: boolean) => {
    onUpdate({ hiddenSections: hide ? [...hiddenSections, key] : hiddenSections.filter((k) => k !== key) });
  };

  // C.A. consumable wound heal/deal options - see shared/ca.ts.
  const woundOptions: CAConsumableWoundOption[] = normalizeCAConsumableWoundOptions(val("consumableWoundOptions"));
  const writeWoundOptions = (next: CAConsumableWoundOption[]) => setDraft({ consumableWoundOptions: next });
  const updateWoundOption = (id: string, p: Partial<CAConsumableWoundOption>) => {
    writeWoundOptions(woundOptions.map((o) => (o.id === id ? { ...o, ...p } : o)));
  };
  const removeWoundOption = (id: string) => writeWoundOptions(woundOptions.filter((o) => o.id !== id));
  const addWoundOption = () => writeWoundOptions([...woundOptions, makeCAConsumableWoundOption()]);
  // A crafter viewed on a character sheet is an inventory COPY; its recipes
  // and their "add a recipe" writes live against the library item it was
  // added from (`templateItemId`), not this row's own id.
  const craftRecipeItemId: string | undefined = item?.isTemplate ? item?.id : (item?.templateItemId || item?.id);
  const isV3 = systemSlug === "aa-v3";
  const isCA = isWoundSystem(systemSlug);
  // C.A. folds its one retired type ("utility") into Miscellaneous and
  // never lets Scroll/Spellbook (AA-V3 only) through its own type list, so a
  // C.A. item's type is always normalized before anything branches on it.
  const rawType = String(val("itemType") || "");
  const type = isCA ? caNormalizeItemType(rawType) : rawType;
  const damageTypes = getEffectTypes(systemSlug);
  const rules = woundSystemRules(systemSlug) as any;
  const attrLabel = (a?: string | null) => {
    if (!a || a === "none") return null;
    if (isCA) return CA_ATTRIBUTES.find((x) => x.key === a)?.name ?? titleCase(a);
    return titleCase(a);
  };
  const typeLabel = (t: string) => (isCA ? CA_ITEM_TYPE_LABELS[t as CAItemType] ?? titleCase(t) : titleCase(t));
  // An item's own Rank tag - an index into the same ladder a character's
  // Rank reads (shared/ca.ts CA_RANK_LADDER). Null/unset = unranked, and
  // every rank-scalable stat just reads as its own flat base value.
  const itemRankIndex: number | null = (() => {
    const v = val("itemRank");
    return v === null || v === undefined || v === "" ? null : Math.max(0, Math.min(CA_RANK_LADDER.length - 1, Math.trunc(Number(v))));
  })();
  const rankScalingOptions = [
    { value: "", label: "Unranked" },
    ...CA_RANK_LADDER.map((rung, i) => ({ value: String(i), label: `${rung.rank.name} ${rung.star.star}` })),
  ];
  const scaledStat = (base: number, field: string): number =>
    caRankScaledValue(
      base,
      field === "priceScaling" ? caEffectivePriceScaling(val(field)) : normalizeCARankScaling(val(field)),
      itemRankIndex,
    );
  // C.A.'s own rune boosts - what THIS item (a rune) grants once socketed, or
  // what's currently filled into THIS item's own rune slots (any item type).
  const runeBoosts: CARuneBoost[] = normalizeCARuneBoosts(val("caRuneBoosts"));
  const writeRuneBoosts = (next: CARuneBoost[]) => setDraft({ caRuneBoosts: next });
  const runeSockets = normalizeCASocketedRunes(val("caRuneSockets"));
  const availableRunesToAttach = (characterItems ?? []).filter(
    (it: any) => caNormalizeItemType(it.itemType) === "rune" && it.id !== item?.id,
  );
  // GM-only text embedded in the description between ## marks - a GM's aside
  // written right next to the public line it's about, rather than a second
  // field. Only C.A. parses this; every other system's description is shown
  // raw, unchanged.
  const descriptionParts = isCA ? caSplitDescriptionGmNotes(val("description")) : null;

  // The sheet carries its own image browser rather than asking each host to
  // wire one in: the admin page and a character sheet would otherwise need to
  // pass the same picker down two different trees.
  const { imagePicker, element: imageBrowser } = useImageBrowserBridge();
  const pickImage = async () => {
    if (!isEditing) return;
    const picked = await imagePicker({ title: "Item Image" });
    if (picked?.url) setDraft({ image: picked.url });
  };

  const effects = normalizeCAItemEffects(val("effects"));
  const effectTargets = [
    ...rules.FIXED_STAT_TARGETS.map((t: string) => ({ value: t, label: rules.FIXED_STAT_LABELS[t], group: "Movement" })),
    ...rules.SKILLS.map((sk: { key: string; name: string }) => ({ value: sk.key, label: sk.name, group: "Skills" })),
  ];

  // Lookup lists the V3 sections pick from. Only fetched for the system that
  // has them, and only for the sections that are actually on screen.
  const { data: ammoTypes = [] } = useQuery({
    queryKey: ["v3-ammunition-types"],
    queryFn: () => api.getV3AmmunitionTypes(),
    enabled: isV3 && (type === "weapon" || type === "ammunition"),
  });
  const { data: advancedTypes = [] } = useQuery({
    queryKey: ["advanced-item-types", personal],
    queryFn: () => api.getAdvancedItemTypes(personal),
    enabled: isV3,
  });
  const { data: techniqueGroups = [] } = useQuery({
    queryKey: ["v3-technique-groups", personal],
    queryFn: () => api.getV3TechniqueGroups(personal),
    enabled: isV3 && type === "weapon",
  });
  const { data: rollTemplates = [] } = useQuery({
    queryKey: ["item-sheet-roll-templates", systemSlug, personal],
    queryFn: () => api.getSystemItems(systemSlug, undefined, personal),
    enabled: !!item?.id,
  });
  const { data: templateLinks } = useQuery({
    queryKey: ["item-template-links", item?.id],
    queryFn: () => api.getItemTemplateLinks(item.id),
    enabled: !!item?.id,
  });
  const linkedTemplateIds: string[] = templateLinks?.templateIds ?? [];
  const liveTemplates = (rollTemplates as any[]).filter((t) => t.isLiveTemplate);
  const itemNameFor = (id?: string | null) => (id ? (rollTemplates as any[]).find((it) => it.id === id)?.name : undefined);

  // The crafter's own recipes, read straight for View (a real recipe list,
  // not a stand-in telling the GM to go to Edit) and shared by key with
  // CraftRecipesEditor's own query so Edit and View never show stale data
  // relative to each other.
  const { data: craftRecipes = [] } = useQuery<any[]>({
    queryKey: ["craft-recipes", craftRecipeItemId],
    queryFn: () => api.getCraftRecipes(craftRecipeItemId!),
    enabled: type === "crafter" && !!craftRecipeItemId,
  });

  // Build recipe: "what this item is built from", authored on the item's own
  // library row so a crafter can later pick it up via "Add from items". Only
  // meaningful on a library item itself (isTemplate), not a character's copy.
  const { data: buildRecipeData } = useQuery({
    queryKey: ["item-build-recipe", item?.id],
    queryFn: () => api.getItemBuildRecipe(item.id),
    enabled: !!item?.id && !!item?.isTemplate,
  });
  const buildRecipe = buildRecipeData?.buildRecipe ?? null;
  const buildIngredients: any[] = buildRecipe?.ingredients ?? [];
  const buildOutputQuantity: number = buildRecipe?.outputQuantity ?? 1;
  const saveBuildRecipeMut = useMutation({
    mutationFn: (data: { outputQuantity: number; ingredients: any[] }) => api.saveItemBuildRecipe(item.id, data),
    onSuccess: (res) => {
      queryClient.setQueryData(["item-build-recipe", item.id], { buildRecipe: res.buildRecipe });
    },
  });
  const writeBuildRecipe = (outputQuantity: number, ingredients: any[]) => {
    saveBuildRecipeMut.mutate({
      outputQuantity,
      ingredients: ingredients.map(({ itemId, itemName, quantity }) => ({ itemId: itemId ?? null, itemName, quantity })),
    });
  };
  const buildRecipeRaritySurcharge = (rarity?: string | null) =>
    ({ common: 2, uncommon: 5, rare: 10, epic: 30, legendary: 50 } as Record<string, number>)[(rarity ?? "common").toLowerCase()] ?? 0;
  const recommendBuildPrice = (value: number): number => {
    if (value <= 0) return 0;
    const step = value < 10 ? 1 : value < 100 ? 5 : value < 1000 ? 10 : 50;
    return Math.ceil(value / step) * step;
  };
  const buildIngredientsValue = buildIngredients.reduce((sum, ing) => {
    const found = (rollTemplates as any[]).find((it) => it.id === ing.itemId);
    if (!found) return sum;
    const perUnit = (Number(found.price) || 0) + buildRecipeRaritySurcharge(found.rarity);
    return sum + perUnit * (ing.quantity || 0);
  }, 0);
  const buildOutputRarityValue = buildRecipeRaritySurcharge(val("rarity")) * Math.max(1, buildOutputQuantity);
  const buildPerUnitValue = buildIngredients.length > 0
    ? Math.ceil(((buildIngredientsValue + buildOutputRarityValue) * 1.2) / Math.max(1, buildOutputQuantity))
    : 0;
  const buildRecommendedPrice = recommendBuildPrice(buildPerUnitValue);

  // Edit keeps the boxed CaSection form chrome throughout - that's "the
  // normal editor look" the sheet is meant to have once the pencil is
  // pressed. View uses the much lighter ViewBlock instead: no border, no
  // medallion, just a small label - a stat block reads top to bottom rather
  // than needing every fact boxed off from its neighbors.
  const section = (icon: React.ReactNode, title: string, body: React.ReactNode) => (
    <>
      <CaDivider />
      {isEditing ? (
        <CaSection icon={icon} title={title}>{body}</CaSection>
      ) : (
        <ViewBlock icon={icon} label={title}>{body}</ViewBlock>
      )}
    </>
  );

  // Every section except Identity and Handling: shown by default, with a
  // declutter toggle only the GM/admin sees in its own header to collapse
  // just that section's body for their own view (the header stays for them,
  // so it's never lost). A player - including a trusted player - never sees
  // a hidden section at all: not the body, not even its header.
  const toggleableSection = (key: string, icon: React.ReactNode, title: string, body: React.ReactNode) => {
    const hidden = hiddenSections.includes(key);
    if (hidden && !isSheetGM) return null;
    if (isEditing) {
      return (
        <>
          <CaDivider />
          <CaSection
            icon={icon}
            title={title}
            value={isSheetGM ? (
              <ToggleRow
                label="Show"
                value={!hidden}
                onChange={(v) => setSectionHidden(key, !v)}
                testId={`toggle-library-item-section-${key}`}
              />
            ) : undefined}
          >
            {!hidden && body}
          </CaSection>
        </>
      );
    }
    return (
      <>
        <CaDivider />
        <ViewBlock
          icon={icon}
          label={title}
          testId={`section-library-item-${key}`}
          value={isSheetGM ? (
            <button
              type="button"
              onClick={() => setSectionHidden(key, !hidden)}
              className="text-stone-500 hover:text-stone-300"
              title={hidden ? "Hidden from players - click to show" : "Visible to players - click to hide"}
              data-testid={`toggle-library-item-section-${key}`}
            >
              {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          ) : undefined}
        >
          {!hidden && body}
        </ViewBlock>
      </>
    );
  };

  const TypeIcon = TYPE_ICON[type] ?? Package;

  return (
    <CaSheetFrame className="w-full max-w-3xl">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--ca-gilt-line-soft)" }}>
        <span className="flex items-center gap-1.5 min-w-0">
          {/* A rarity gem rather than a text label - this is a glance-able
              tell, the way a loot table's own entries are colour-coded. */}
          <span
            className={`shrink-0 w-2 h-2 rounded-full ${RARITY_COLORS[String(val("rarity") || "common")] ?? "text-stone-300"}`}
            style={{ background: "currentColor" }}
            aria-hidden
          />
          <span className="text-sm font-bold truncate" style={{ color: "var(--ca-gilt-bright)" }} data-testid="text-library-item-sheet-title">
            {val("name") || "Untitled Item"}
          </span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {canEdit && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="transition-transform hover:scale-105"
              title="Edit this item"
              data-testid="button-library-item-edit"
            >
              <CaMedallion>
                <Pencil className="h-3.5 w-3.5" />
              </CaMedallion>
            </button>
          )}
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-400" onClick={onDelete} data-testid="button-library-item-delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {!hideCloseButton && (
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={handleCloseClick} data-testid="button-library-item-close">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* The editing ribbon - present only while the sheet is in Edit mode,
          so Save/Cancel are reachable without scrolling all the way down for
          a long sheet, and so there is never any doubt which mode this is. */}
      {isEditing && (
        <div
          className="flex items-center justify-between gap-2 px-4 py-1.5 border-b"
          style={{
            borderColor: "var(--ca-gilt-line-soft)",
            background: "linear-gradient(90deg, transparent, var(--ca-gilt-dim) 50%, transparent)",
          }}
          data-testid="banner-library-item-editing"
        >
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: "var(--ca-gilt-bright)" }}>
            <Feather className="h-3 w-3" /> Editing
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] border-stone-700" onClick={handleCancel} data-testid="button-library-item-cancel-top">
              Cancel
            </Button>
            <Button size="sm" className="h-6 px-2 text-[11px] bg-emerald-700 hover:bg-emerald-600 text-white" onClick={handleSave} data-testid="button-library-item-save-top">
              <Check className="h-3 w-3 mr-1" /> Save
            </Button>
          </div>
        </div>
      )}

      {/* No height cap or scroll of its own - every host that embeds this
          sheet (the admin full-screen overlay, a FloatingPanel's own
          content area) already scrolls itself, and a second overflow-y-auto
          in here just fought that one for the wheel/touch input instead of
          actually letting the page scroll. */}
      <div className="p-4 space-y-3">
        {/* ============================= IDENTITY ============================= */}
        {!isEditing ? (
          // The masthead: a bigger portrait, the name in display type, a
          // type/rarity badge row, and the description read as flavour text
          // under it - the way a bestiary entry or a card front reads,
          // rather than a stack of "Name:" / "Type:" labels.
          <div className="flex gap-3 items-start" data-testid="card-library-item-masthead">
            <div
              className="shrink-0 w-24 h-24 rounded-xl p-[2px]"
              style={{ background: "linear-gradient(135deg, var(--ca-gilt) 0%, var(--ca-gilt-dim) 45%, var(--ca-gilt-bright) 100%)" }}
            >
              <span className="w-full h-full rounded-[10px] overflow-hidden bg-stone-800 flex items-center justify-center block">
                {val("image") ? (
                  <img src={val("image")} alt="" className="w-full h-full object-cover" data-testid="img-library-item" />
                ) : (
                  <TypeIcon className="h-9 w-9 text-stone-600" />
                )}
              </span>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <h2 className="font-display text-xl font-bold text-stone-100 truncate" data-testid="text-library-item-view-name">
                {val("name") || "Untitled Item"}
              </h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ItemBadge>{typeLabel(type || "item")}</ItemBadge>
                {isCA && <ItemBadge>{caItemRankLabel(itemRankIndex)}</ItemBadge>}
                <span className={`text-[10px] uppercase tracking-wide font-semibold ${RARITY_COLORS[String(val("rarity") || "common")]}`}>
                  {titleCase(String(val("rarity") || "common"))}
                </span>
                {val("size") && <span className="text-[10px] uppercase tracking-wide text-stone-500">{val("size")}</span>}
              </div>
              {(descriptionParts ? descriptionParts.player : val("description")) ? (
                <p className="text-xs text-stone-400 italic leading-relaxed" data-testid="text-library-item-view-description">
                  {descriptionParts ? descriptionParts.player : val("description")}
                </p>
              ) : (
                <p className="text-xs text-stone-600 italic">No description.</p>
              )}
              {isSheetGM && descriptionParts?.hasGmNotes && (
                <p
                  className="text-xs text-amber-300/90 italic leading-relaxed rounded border border-dashed border-amber-700/50 bg-amber-950/20 px-2 py-1"
                  data-testid="text-library-item-gm-note"
                >
                  <span className="not-italic font-semibold text-amber-500 mr-1">GM only:</span>
                  {descriptionParts.gm}
                </p>
              )}
              {/* Quantity/Weight/Value/Durability fold straight into the
                  masthead - the one row every item has, so it doesn't need
                  its own titled box the way a type-specific stat does. */}
              <div className="pt-1">
                <StatStrip
                  stats={[
                    { label: "Qty", value: val("quantity") ?? 1 },
                    { label: "Weight", value: `${val("itemWeight") ?? 0} lb` },
                    { label: "Value", value: isCA ? scaledStat(val("price") ?? 0, "priceScaling") : val("price") ?? 0 },
                    { label: "Durability", value: `${val("durability") ?? 10}/${val("maxDurability") ?? 10}` },
                  ]}
                />
                {isV3 && val("advancedItemTypeId") && (
                  <p className="text-[11px] text-stone-500 mt-1">
                    Advanced type: <span className="text-stone-300">{(advancedTypes as any[]).find((t) => t.id === val("advancedItemTypeId"))?.name ?? "—"}</span>
                  </p>
                )}
                {(val("isContainer") || (isCA && type === "weapon" && val("isHeavy"))) && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    {val("isContainer") && (
                      <ItemBadge>Container ({isCA ? scaledStat(val("carryCapacity") ?? 0, "carryCapacityScaling") : val("carryCapacity") ?? 0} lb capacity)</ItemBadge>
                    )}
                    {isCA && type === "weapon" && val("isHeavy") && <ItemBadge>Heavy (two-handed)</ItemBadge>}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <CaSection icon={<Package className="h-3.5 w-3.5" />} title="Identity">
            <div className="flex gap-3 items-start">
              {/* The picture, in the same ringed square a character's
                  portrait gets, so an item and a character read as the
                  same kind of thing. */}
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={pickImage}
                  className="relative w-20 h-20 rounded-xl p-[2px] block"
                  style={{ background: "linear-gradient(135deg, var(--ca-gilt) 0%, var(--ca-gilt-dim) 45%, var(--ca-gilt-bright) 100%)" }}
                  aria-label={val("image") ? "Change item image" : "Add an item image"}
                  title="Click to choose an image"
                  data-testid="button-library-item-image"
                >
                  <span className="w-full h-full rounded-[10px] overflow-hidden bg-stone-800 flex items-center justify-center relative">
                    {val("image") ? (
                      <img src={val("image")} alt="" className="w-full h-full object-cover" data-testid="img-library-item" />
                    ) : (
                      <ImageIcon className="h-7 w-7 text-stone-600" />
                    )}
                    <span className="absolute bottom-0 right-0 w-5 h-5 rounded-tl-lg bg-stone-950/80 flex items-center justify-center" style={{ color: "var(--ca-gilt)" }}>
                      <Pencil className="h-2.5 w-2.5" />
                    </span>
                  </span>
                </button>
                {val("image") && (
                  <button
                    type="button"
                    onClick={() => setDraft({ image: null })}
                    className="mt-1 w-full text-[10px] text-stone-500 hover:text-red-400"
                    data-testid="button-library-item-image-clear"
                  >
                    Remove
                  </button>
                )}
              </div>
              <CaFieldGrid className="flex-1 min-w-0">
                <ItemField field="name" label="Name" value={val("name")} onChange={chg("name")} placeholder="Untitled Item" testId="library-item-name" />
                <ItemField field="itemType" label="Type" value={type} onChange={chg("itemType")} kind="select" options={itemTypeOptions(systemSlug, type)} testId="library-item-type" />
                <ItemField field="rarity" label="Rarity" value={val("rarity")} onChange={chg("rarity")} kind="select" options={opts(RARITIES)} testId="library-item-rarity" />
                <ItemField field="size" label="Size" value={val("size")} onChange={chg("size")} testId="library-item-size" />
                {isCA && (
                  <ItemField
                    field="itemRank"
                    label="Rank"
                    value={itemRankIndex === null ? "" : String(itemRankIndex)}
                    onChange={(v) => setDraft({ itemRank: v === "" ? null : Number(v) })}
                    kind="select"
                    options={rankScalingOptions}
                    testId="library-item-rank"
                  />
                )}
                <ItemField
                  field="description"
                  label={isCA ? "Description (wrap GM-only text in # marks)" : "Description"}
                  value={val("description")}
                  onChange={chg("description")}
                  kind="textarea"
                  wide
                  placeholder={isCA ? "What it is. #A GM-only aside.#" : "What it is."}
                  testId="library-item-description"
                />
              </CaFieldGrid>
            </div>
          </CaSection>
        )}

        {/* ============================= HANDLING ============================= */}
        {/* View has nothing of its own to show here - Qty/Weight/Value/
            Durability and the Container/Heavy badges already read straight
            off the masthead above. Handling only exists as an Edit-mode
            form, for the fields too fiddly to put in the masthead itself
            (max durability, carry capacity, advanced type, the toggles). */}
        {isEditing && section(<Coins className="h-3.5 w-3.5" />, "Handling", (
            <>
              <CaFieldGrid>
                <ItemField field="quantity" label="Quantity" value={val("quantity") ?? 1} onChange={chg("quantity")} kind="number" min={0} testId="library-item-quantity" />
                <ItemField field="itemWeight" label="Weight" value={val("itemWeight") ?? 0} onChange={chg("itemWeight")} kind="number" min={0} decimal suffix="lb" testId="library-item-weight" />
                <ItemField field="price" label="Value" value={val("price") ?? 0} onChange={chg("price")} kind="number" min={0} testId="library-item-price" />
                <ItemField field="durability" label="Durability" value={val("durability") ?? 10} onChange={chg("durability")} kind="number" min={0} testId="library-item-durability" />
                <ItemField field="maxDurability" label="Max durability" value={val("maxDurability") ?? 10} onChange={chg("maxDurability")} kind="number" min={0} testId="library-item-max-durability" />
                <ItemField field="carryCapacity" label="Carry capacity" value={val("carryCapacity") ?? 0} onChange={chg("carryCapacity")} kind="number" min={0} testId="library-item-carry-capacity" />
                {isV3 && (
                  <ItemField
                    field="advancedItemTypeId"
                    label="Advanced item type"
                    value={val("advancedItemTypeId")}
                    onChange={chg("advancedItemTypeId")}
                    kind="select"
                    options={[{ value: "", label: "None" }, ...(advancedTypes as any[]).map((t) => ({ value: t.id, label: t.name }))]}
                    testId="library-item-advanced-type"
                  />
                )}
              </CaFieldGrid>
              {isCA && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-stone-500 block mb-1">Value scaling</span>
                    <RankScalingEditor
                      scaling={caEffectivePriceScaling(val("priceScaling"))}
                      onChange={(next) => setDraft({ priceScaling: next })}
                      defaultOnValue={makeDefaultPriceCARankScaling()}
                      testId="library-item-price-scaling"
                    />
                    <p className="text-[10px] text-stone-500 mt-1">On by default: +50% value per rank up (not star up).</p>
                  </div>
                  {val("isContainer") && (
                    <div>
                      <span className="text-[10px] text-stone-500 block mb-1">Carry capacity scaling</span>
                      <RankScalingEditor
                        scaling={normalizeCARankScaling(val("carryCapacityScaling"))}
                        onChange={(next) => setDraft({ carryCapacityScaling: next })}
                        suffix="lb"
                        testId="library-item-carry-capacity-scaling"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2 space-y-1">
                <ToggleRow label="Container" value={!!val("isContainer")} onChange={chg("isContainer")} testId="toggle-library-item-container" />
                {/* Two-handedness is how the item is held, not how it hits, so
                    it stays behind when C.A. drops the Attack block. */}
                {isCA && type === "weapon" && (
                  <ToggleRow label="Heavy (two-handed)" value={!!val("isHeavy")} onChange={chg("isHeavy")} testId="toggle-library-item-heavy" />
                )}
              </div>
            </>
        ))}

        {renderAfterHandling}

        {/* ============================== ATTACK =============================== */}
        {!isCA && (type === "weapon" || type === "consumable" || type === "ammunition") && toggleableSection("attack", <Sword className="h-3.5 w-3.5" />, "Attack", (
          !isEditing ? (
            <>
              <StatStrip
                stats={[
                  { label: "Damage", value: val("damage") || "—" },
                  val("damageType") && { label: "Type", value: titleCase(val("damageType")) },
                  { label: "Mod", value: val("mod") >= 0 ? `+${val("mod") ?? 0}` : val("mod") },
                  { label: "Range", value: val("range") ? `${val("range")} ft` : "Melee" },
                  attrLabel(val("attribute")) && { label: "Attribute", value: attrLabel(val("attribute")) },
                  val("aoe") && { label: "Area", value: titleCase(val("aoe")) },
                  type === "weapon" && val("weaponCategory") && { label: "Category", value: titleCase(val("weaponCategory")) },
                  isV3 && type === "weapon" && val("ammunitionTypeId") && {
                    label: "Ammunition",
                    value: (ammoTypes as any[]).find((t) => t.id === val("ammunitionTypeId"))?.name ?? "—",
                  },
                ]}
              />
              {(val("isHeavy") || val("canApplyEffects")) && (
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {val("isHeavy") && <ItemBadge>Heavy (two-handed)</ItemBadge>}
                  {val("canApplyEffects") && <ItemBadge>Applies token effects</ItemBadge>}
                </div>
              )}
              {isV3 && type === "weapon" && (techniqueGroups as any[]).length > 0 && (() => {
                const on = ((val("v3TechniqueGroupIds") as string[]) || []);
                const named = (techniqueGroups as any[]).filter((g) => on.includes(g.id));
                return named.length > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    {named.map((g) => <ItemBadge key={g.id}>{g.name}</ItemBadge>)}
                  </div>
                ) : null;
              })()}
            </>
          ) : (
            <>
              <CaFieldGrid>
                <ItemField field="damage" label="Damage" value={val("damage")} onChange={chg("damage")} placeholder="1d8" testId="library-item-damage" />
                <ItemField field="damageType" label="Damage type" value={val("damageType")} onChange={chg("damageType")} kind="select" options={opts(damageTypes, "None")} testId="library-item-damage-type" />
                <ItemField field="mod" label="Modifier" value={val("mod") ?? 0} onChange={chg("mod")} kind="number" min={-99} testId="library-item-mod" />
                <ItemField field="range" label="Range" value={val("range") ?? 0} onChange={chg("range")} kind="number" min={0} suffix="ft" testId="library-item-range" />
                <ItemField field="attribute" label="Attribute" value={val("attribute")} onChange={chg("attribute")} kind="select" options={opts(ATTRIBUTES, "None")} testId="library-item-attribute" />
                <ItemField field="aoe" label="Area" value={val("aoe")} onChange={chg("aoe")} kind="select" options={opts(AOE_SHAPES, "None")} testId="library-item-aoe" />
                {type === "weapon" && (
                  <ItemField field="weaponCategory" label="Weapon category" value={val("weaponCategory")} onChange={chg("weaponCategory")} placeholder="bow, sling…" testId="library-item-weapon-category" />
                )}
                {isV3 && type === "weapon" && (
                  <ItemField
                    field="ammunitionTypeId"
                    label="Uses ammunition"
                    value={val("ammunitionTypeId")}
                    onChange={chg("ammunitionTypeId")}
                    kind="select"
                    options={[{ value: "", label: "None (melee)" }, ...(ammoTypes as any[]).map((t) => ({ value: t.id, label: t.name }))]}
                    testId="library-item-uses-ammo"
                  />
                )}
              </CaFieldGrid>
              <div className="mt-2 space-y-1">
                <ToggleRow label="Heavy (two-handed)" value={!!val("isHeavy")} onChange={chg("isHeavy")} testId="toggle-library-item-heavy" />
                <ToggleRow label="Can apply token effects" value={!!val("canApplyEffects")} onChange={chg("canApplyEffects")} testId="toggle-library-item-effects" />
              </div>
              {isV3 && type === "weapon" && (techniqueGroups as any[]).length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-stone-400 block mb-1">Technique groups</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {(techniqueGroups as any[]).map((g) => {
                      const on = ((val("v3TechniqueGroupIds") as string[]) || []).includes(g.id);
                      return (
                        <ToggleRow
                          key={g.id}
                          label={g.name}
                          value={on}
                          onChange={(next) => {
                            const current = (val("v3TechniqueGroupIds") as string[]) || [];
                            setDraft({ v3TechniqueGroupIds: next ? [...current, g.id] : current.filter((x) => x !== g.id) });
                          }}
                          testId={`toggle-library-item-technique-${g.id}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )
        ))}

        {/* ========================== C.A. WEAPON ATTACK ========================= */}
        {isCA && type === "weapon" && toggleableSection("attack", <Sword className="h-3.5 w-3.5" />, "Attack", (
          !isEditing ? (
            <>
              <StatStrip
                stats={[
                  { label: "Damage", value: scaledStat(val("caBaseDamage") ?? 0, "caBaseDamageScaling") },
                  { label: "Handedness", value: CA_WEAPON_HANDEDNESS_LABELS[(val("caWeaponHandedness") as CAWeaponHandedness) ?? "one_handed"] },
                  val("caWeaponHandedness") === "ranged" && { label: "Range", value: val("range") ? `${val("range")} ft` : "—" },
                ]}
              />
              {val("caWeaponHandedness") === "ranged" && val("ammunitionType") && (
                <p className="text-[11px] text-stone-500 mt-1">Uses <span className="text-stone-300">{val("ammunitionType")}</span> ammunition.</p>
              )}
            </>
          ) : (
            <>
              <CaFieldGrid>
                <ItemField
                  field="caWeaponHandedness"
                  label="Handedness"
                  value={val("caWeaponHandedness") ?? "one_handed"}
                  onChange={chg("caWeaponHandedness")}
                  kind="select"
                  options={CA_WEAPON_HANDEDNESS.map((h) => ({ value: h, label: CA_WEAPON_HANDEDNESS_LABELS[h] }))}
                  testId="library-item-ca-handedness"
                />
                <ItemField field="caBaseDamage" label="Base damage" value={val("caBaseDamage") ?? 0} onChange={chg("caBaseDamage")} kind="number" min={0} testId="library-item-ca-base-damage" />
                {val("caWeaponHandedness") === "ranged" && (
                  <>
                    <ItemField field="range" label="Range" value={val("range") ?? 0} onChange={chg("range")} kind="number" min={0} suffix="ft" testId="library-item-range" />
                    <ItemField field="ammunitionType" label="Uses ammunition" value={val("ammunitionType")} onChange={chg("ammunitionType")} placeholder="arrow, bolt…" testId="library-item-ca-ammo-type" />
                  </>
                )}
              </CaFieldGrid>
              <div className="mt-2">
                <span className="text-[10px] text-stone-500 block mb-1">Base damage scaling</span>
                <RankScalingEditor
                  scaling={normalizeCARankScaling(val("caBaseDamageScaling"))}
                  onChange={(next) => setDraft({ caBaseDamageScaling: next })}
                  testId="library-item-ca-base-damage-scaling"
                />
              </div>
            </>
          )
        ))}

        {/* ============================= PROTECTION ============================= */}
        {type === "armor" && toggleableSection("protection", <Shield className="h-3.5 w-3.5" />, "Protection", (
          !isEditing ? (
            <>
              <StatStrip
                stats={[
                  { label: "Slot", value: val("armorSlot") ? (isCA ? val("armorSlot") : titleCase(val("armorSlot"))) : "—" },
                  { label: "DC Bonus", value: `+${isCA ? scaledStat(val("armorBonus") ?? 0, "armorBonusScaling") : val("armorBonus") ?? 0}` },
                  isCA
                    ? { label: "Wound reduction", value: `${scaledStat(val("caWoundReductionSteps") ?? 0, "caWoundReductionStepsScaling")} step(s)` }
                    : { label: "Reduction", value: `${val("damageReduction") ?? 0}${val("damageReductionType") ? ` ${titleCase(val("damageReductionType"))}` : ""}` },
                ]}
              />
              {!isCA && val("grantsDcBonus") && (
                <p className="text-[11px] text-stone-500 mt-1">Grants a DC bonus of <span className="text-stone-300">+{val("dcBonusValue") ?? 0}</span>.</p>
              )}
              {isV3 && (((val("v3ArmorBoosts") as any[]) || []).length > 0) && (
                <div className="mt-1.5">
                  <span className="text-[11px] text-stone-500 block mb-1">While worn</span>
                  <TargetAmountList
                    rows={((val("v3ArmorBoosts") as any[]) || []) as Array<{ target: string; amount: number }>}
                    targets={effectTargets}
                    editing={false}
                    onChange={() => {}}
                    makeRow={() => ({ target: effectTargets[0]?.value ?? "", amount: 0 })}
                    emptyText="No boosts."
                    idOf={(_r, i) => String(i)}
                    testId="library-item-armor-boosts"
                  />
                </div>
              )}
            </>
          ) : isCA ? (
            <>
              <CaFieldGrid>
                <ItemField field="armorSlot" label="Slot" value={val("armorSlot")} onChange={chg("armorSlot")} placeholder="head, chest, arms, legs…" testId="library-item-armor-slot" />
                <ItemField field="armorBonus" label="DC bonus" value={val("armorBonus") ?? 0} onChange={chg("armorBonus")} kind="number" min={0} testId="library-item-armor-bonus" />
                <ItemField field="caWoundReductionSteps" label="Wound reduction (steps)" value={val("caWoundReductionSteps") ?? 0} onChange={chg("caWoundReductionSteps")} kind="number" min={0} testId="library-item-ca-wound-reduction" />
              </CaFieldGrid>
              <p className="text-[11px] text-stone-500 mt-1">0 by default. Each step lowers a wound one tier (Severe → Moderate → Minor → none).</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-stone-500 block mb-1">DC bonus scaling</span>
                  <RankScalingEditor
                    scaling={normalizeCARankScaling(val("armorBonusScaling"))}
                    onChange={(next) => setDraft({ armorBonusScaling: next })}
                    testId="library-item-armor-bonus-scaling"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-stone-500 block mb-1">Wound reduction scaling</span>
                  <RankScalingEditor
                    scaling={normalizeCARankScaling(val("caWoundReductionStepsScaling"))}
                    onChange={(next) => setDraft({ caWoundReductionStepsScaling: next })}
                    testId="library-item-ca-wound-reduction-scaling"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <CaFieldGrid>
                <ItemField field="armorSlot" label="Slot" value={val("armorSlot")} onChange={chg("armorSlot")} kind="select" options={opts(ARMOR_SLOTS, "None")} testId="library-item-armor-slot" />
                <ItemField field="armorBonus" label="DC bonus" value={val("armorBonus") ?? 0} onChange={chg("armorBonus")} kind="number" min={0} testId="library-item-armor-bonus" />
                <ItemField field="damageReduction" label="Damage reduction" value={val("damageReduction") ?? 0} onChange={chg("damageReduction")} kind="number" min={0} testId="library-item-damage-reduction" />
                <ItemField field="damageReductionType" label="Reduces" value={val("damageReductionType")} onChange={chg("damageReductionType")} kind="select" options={opts(damageTypes, "All")} testId="library-item-damage-reduction-type" />
                {val("grantsDcBonus") && (
                  <ItemField field="dcBonusValue" label="Granted DC bonus" value={val("dcBonusValue") ?? 0} onChange={chg("dcBonusValue")} kind="number" min={0} testId="library-item-dc-bonus-value" />
                )}
              </CaFieldGrid>
              <div className="mt-2 space-y-1">
                <ToggleRow label="Grants a DC bonus" value={!!val("grantsDcBonus")} onChange={chg("grantsDcBonus")} testId="toggle-library-item-grants-dc" />
              </div>
              {isV3 && (
                <div className="mt-2">
                  <span className="text-xs text-stone-400 block mb-1">Attribute and skill boosts while worn</span>
                  <TargetAmountList
                    rows={((val("v3ArmorBoosts") as any[]) || []) as Array<{ target: string; amount: number }>}
                    targets={effectTargets}
                    editing
                    onChange={(next) => setDraft({ v3ArmorBoosts: next })}
                    makeRow={() => ({ target: effectTargets[0]?.value ?? "", amount: 0 })}
                    emptyText="No boosts."
                    idOf={(_r, i) => String(i)}
                    testId="library-item-armor-boosts"
                  />
                </div>
              )}
            </>
          )
        ))}

        {/* ============================= WHEN USED ============================== */}
        {type === "consumable" && toggleableSection("when-used", <FlaskConical className="h-3.5 w-3.5" />, "When used", (
          !isEditing ? (
            <>
              {!isCA && (
                <StatStrip
                  stats={[
                    { label: "HP", value: (val("consumableHpChange") ?? 0) >= 0 ? `+${val("consumableHpChange") ?? 0}` : val("consumableHpChange") },
                    { label: "Energy", value: (val("consumableEnergyChange") ?? 0) >= 0 ? `+${val("consumableEnergyChange") ?? 0}` : val("consumableEnergyChange") },
                    { label: "Mana", value: (val("consumableManaChange") ?? 0) >= 0 ? `+${val("consumableManaChange") ?? 0}` : val("consumableManaChange") },
                    (val("rationServings") ?? 0) > 0 && { label: "Rations", value: val("rationServings") },
                  ]}
                />
              )}
              {val("consumableEffectDescription") && (
                <p className="text-xs text-stone-300 italic mt-1.5">{val("consumableEffectDescription")}</p>
              )}
              {!isCA && (val("isDamaging") || val("isDetonatable")) && (
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {val("isDamaging") && <ItemBadge>Rolls like a weapon</ItemBadge>}
                  {val("isDetonatable") && (
                    <ItemBadge tone="danger">
                      Detonates{val("detonateAoeShape") ? ` · ${titleCase(val("detonateAoeShape"))}` : ""}{val("detonateAoeRange") ? ` · ${val("detonateAoeRange")}ft` : ""}
                    </ItemBadge>
                  )}
                </div>
              )}
              {isCA && (
                <div className="space-y-1.5 mt-1" data-testid="library-item-wound-options">
                  {woundOptions.length === 0 ? (
                    <p className="text-xs text-stone-500 italic">No effect configured - this potion does nothing yet.</p>
                  ) : (
                    woundOptions.map((opt) => (
                      <div
                        key={opt.id}
                        className="flex items-center gap-2 rounded-lg border bg-stone-900/50 px-2.5 py-1.5"
                        style={{ borderColor: "var(--ca-gilt-line-soft)" }}
                      >
                        {opt.mode === "heal" ? (
                          <HeartPulse className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Skull className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        )}
                        <span className="text-xs text-stone-200">{caConsumableWoundOptionLabel(opt)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <CaFieldGrid>
                <ItemField field="rationServings" label="Ration servings" value={val("rationServings") ?? 0} onChange={chg("rationServings")} kind="number" min={0} testId="library-item-ration-servings" />
                {/* The stat changes and the detonation are a roll wearing a
                    different hat - C.A. writes them as rolls instead. */}
                {!isCA && (
                  <>
                    <ItemField field="consumableHpChange" label="HP change" value={val("consumableHpChange") ?? 0} onChange={chg("consumableHpChange")} kind="number" min={-999} testId="library-item-hp-change" />
                    <ItemField field="consumableEnergyChange" label="Energy change" value={val("consumableEnergyChange") ?? 0} onChange={chg("consumableEnergyChange")} kind="number" min={-999} testId="library-item-energy-change" />
                    <ItemField field="consumableManaChange" label="Mana change" value={val("consumableManaChange") ?? 0} onChange={chg("consumableManaChange")} kind="number" min={-999} testId="library-item-mana-change" />
                  </>
                )}
                <ItemField field="consumableEffectDescription" label="Effect" value={val("consumableEffectDescription")} onChange={chg("consumableEffectDescription")} kind="textarea" wide placeholder="What happens when it is used." testId="library-item-consumable-effect" />
                {!isCA && val("isDetonatable") && (
                  <>
                    <ItemField field="detonateAoeShape" label="Detonation area" value={val("detonateAoeShape")} onChange={chg("detonateAoeShape")} kind="select" options={opts(AOE_SHAPES, "None")} testId="library-item-detonate-shape" />
                    <ItemField field="detonateAoeRange" label="Detonation range" value={val("detonateAoeRange") ?? 15} onChange={chg("detonateAoeRange")} kind="number" min={0} suffix="ft" testId="library-item-detonate-range" />
                  </>
                )}
              </CaFieldGrid>
              {!isCA && (
                <div className="mt-2 space-y-1">
                  <ToggleRow label="Rolls like a weapon" value={!!val("isDamaging")} onChange={chg("isDamaging")} testId="toggle-library-item-damaging" />
                  <ToggleRow label="Can be detonated" value={!!val("isDetonatable")} onChange={chg("isDetonatable")} testId="toggle-library-item-detonatable" />
                </div>
              )}
              {isCA && (
                <div className="mt-3">
                  <span className="text-xs text-stone-400 block mb-1">Wound effect options</span>
                  <p className="text-[11px] text-stone-500 mb-2">
                    Each option is one way to use this potion - the player picks one on use. "Heal" removes that
                    many of the player's own wounds at that severity (they choose which); "Deal" adds new ones.
                  </p>
                  <div className="space-y-1" data-testid="library-item-wound-options">
                    {woundOptions.length === 0 && (
                      <p className="text-[11px] text-stone-500">No wound options yet.</p>
                    )}
                    {woundOptions.map((opt, i) => (
                      <div key={opt.id} className="flex items-center gap-1 flex-wrap">
                        <select
                          value={opt.mode}
                          onChange={(e) => updateWoundOption(opt.id, { mode: e.target.value === "deal" ? "deal" : "heal" })}
                          className="h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                          data-testid={`library-item-wound-option-${i}-mode`}
                        >
                          <option value="heal">Heal</option>
                          <option value="deal">Deal</option>
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={opt.count}
                          onChange={(e) => updateWoundOption(opt.id, { count: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                          className="w-14 h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                          data-testid={`library-item-wound-option-${i}-count`}
                        />
                        <select
                          value={opt.severity}
                          onChange={(e) => updateWoundOption(opt.id, { severity: e.target.value as any })}
                          className="h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                          data-testid={`library-item-wound-option-${i}-severity`}
                        >
                          {CA_WOUND_SEVERITIES.map((s) => (
                            <option key={s} value={s}>{CA_WOUND_SEVERITY_LABELS[s]}</option>
                          ))}
                        </select>
                        <input
                          value={opt.label ?? ""}
                          onChange={(e) => updateWoundOption(opt.id, { label: e.target.value })}
                          placeholder="Custom label (optional)"
                          className="flex-1 min-w-[140px] h-7 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                          data-testid={`library-item-wound-option-${i}-label`}
                        />
                        <button
                          type="button"
                          onClick={() => removeWoundOption(opt.id)}
                          className="text-stone-500 hover:text-red-400 shrink-0"
                          data-testid={`library-item-wound-option-${i}-remove`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-[11px] text-amber-500 hover:text-amber-400"
                      onClick={addWoundOption}
                      data-testid="library-item-wound-option-add"
                    >
                      + Add option
                    </button>
                  </div>
                </div>
              )}
            </>
          )
        ))}

        {/* ============================= AMMUNITION ============================= */}
        {type === "ammunition" && toggleableSection("ammunition", <Crosshair className="h-3.5 w-3.5" />, "Ammunition", (
          !isEditing ? (
            <>
              <StatStrip
                stats={[
                  { label: "Type", value: val("ammunitionType") || "—" },
                  { label: "Break chance", value: `${val("breakChance") ?? 10}%` },
                  isCA
                    ? { label: "Damage boost", value: `+${scaledStat(val("ammoDamageBoost") ?? 0, "ammoDamageBoostScaling")}` }
                    : isV3
                      ? { label: "V3 type", value: (ammoTypes as any[]).find((t) => t.id === val("ammunitionTypeId"))?.name ?? "—" }
                      : null,
                ]}
              />
              {isCA && (
                <p className="text-[11px] text-stone-500 mt-1">
                  Only boosts damage while this and a matching weapon are both equipped. Equipping more than one
                  ammunition type at once blocks rolling until one is unequipped.
                </p>
              )}
            </>
          ) : (
            <>
              <CaFieldGrid>
                <ItemField field="ammunitionType" label="Ammunition type" value={val("ammunitionType")} onChange={chg("ammunitionType")} placeholder="arrow, bolt…" testId="library-item-ammo-type" />
                <ItemField field="breakChance" label="Break chance" value={val("breakChance") ?? 10} onChange={chg("breakChance")} kind="number" min={0} max={100} suffix="%" testId="library-item-break-chance" />
                {isCA && (
                  <ItemField field="ammoDamageBoost" label="Damage boost" value={val("ammoDamageBoost") ?? 0} onChange={chg("ammoDamageBoost")} kind="number" min={0} testId="library-item-ammo-damage-boost" />
                )}
                {isV3 && (
                  <ItemField
                    field="ammunitionTypeId"
                    label="V3 type"
                    value={val("ammunitionTypeId")}
                    onChange={chg("ammunitionTypeId")}
                    kind="select"
                    options={[{ value: "", label: "None" }, ...(ammoTypes as any[]).map((t) => ({ value: t.id, label: t.name }))]}
                    testId="library-item-ammo-type-id"
                  />
                )}
              </CaFieldGrid>
              {isCA && (
                <div className="mt-2">
                  <span className="text-[10px] text-stone-500 block mb-1">Damage boost scaling</span>
                  <RankScalingEditor
                    scaling={normalizeCARankScaling(val("ammoDamageBoostScaling"))}
                    onChange={(next) => setDraft({ ammoDamageBoostScaling: next })}
                    testId="library-item-ammo-damage-boost-scaling"
                  />
                </div>
              )}
            </>
          )
        ))}

        {/* ============================= CONTAINER ============================== */}
        {isCA && type === "container" && toggleableSection("container", <Boxes className="h-3.5 w-3.5" />, "Container", (
          !isEditing ? (
            <>
              <StatStrip
                stats={[
                  { label: "Kind", value: CA_CONTAINER_KIND_LABELS[(val("caContainerKind") as CAContainerKind) ?? "backpack"] },
                  { label: "Capacity", value: `${scaledStat(val("carryCapacity") ?? 0, "carryCapacityScaling")} lb` },
                ]}
              />
              <p className="text-[11px] text-stone-500 mt-1">
                {CA_CONTAINER_KIND_DESCRIPTIONS[(val("caContainerKind") as CAContainerKind) ?? "backpack"]}
              </p>
            </>
          ) : (
            <>
              <CaFieldGrid>
                <ItemField
                  field="caContainerKind"
                  label="Kind"
                  value={val("caContainerKind") ?? "backpack"}
                  onChange={chg("caContainerKind")}
                  kind="select"
                  options={CA_CONTAINER_KINDS.map((k) => ({ value: k, label: CA_CONTAINER_KIND_LABELS[k] }))}
                  testId="library-item-ca-container-kind"
                />
                <ItemField field="carryCapacity" label="Capacity" value={val("carryCapacity") ?? 0} onChange={chg("carryCapacity")} kind="number" min={0} suffix="lb" testId="library-item-ca-container-capacity" />
              </CaFieldGrid>
              <p className="text-[11px] text-stone-500 mt-1">{CA_CONTAINER_KIND_DESCRIPTIONS[(val("caContainerKind") as CAContainerKind) ?? "backpack"]}</p>
              <div className="mt-1">
                <ToggleRow label="Container (holds items)" value={!!val("isContainer")} onChange={chg("isContainer")} testId="toggle-library-item-container-2" />
              </div>
              <div className="mt-2">
                <span className="text-[10px] text-stone-500 block mb-1">Capacity scaling</span>
                <RankScalingEditor
                  scaling={normalizeCARankScaling(val("carryCapacityScaling"))}
                  onChange={(next) => setDraft({ carryCapacityScaling: next })}
                  suffix="lb"
                  testId="library-item-ca-container-capacity-scaling"
                />
              </div>
            </>
          )
        ))}

        {/* ================================ RUNE ================================ */}
        {/* C.A.'s own rune authoring - "unlimited possibilities" means a
            free-text label per boost rather than a fixed target list, and
            nothing here is applied to the host automatically when socketed. */}
        {isCA && type === "rune" && toggleableSection("rune", <Gem className="h-3.5 w-3.5" />, "Rune", (
          !isEditing ? (
            runeBoosts.length === 0 ? (
              <p className="text-xs text-stone-500 italic">No boosts set - this rune does nothing yet.</p>
            ) : (
              <div className="space-y-1" data-testid="library-item-rune-boosts">
                {runeBoosts.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-stone-300">{b.label || "Unnamed boost"}</span>
                    <span className="font-mono font-semibold" style={{ color: "var(--ca-gilt)" }}>{b.amount > 0 ? `+${b.amount}` : b.amount}</span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <p className="text-[11px] text-stone-500 mb-2">
                What this rune grants once socketed - type whatever it boosts ("Damage", "Carry Capacity", "Fire
                Resistance", anything) and by how much. The player applies it themselves when they use the host item.
              </p>
              <div className="space-y-1" data-testid="library-item-rune-boosts">
                {runeBoosts.length === 0 && <p className="text-[11px] text-stone-500">No boosts yet.</p>}
                {runeBoosts.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-1">
                    <input
                      value={b.label}
                      onChange={(e) => writeRuneBoosts(runeBoosts.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                      placeholder="What it boosts…"
                      className="flex-1 min-w-0 h-7 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                      data-testid={`library-item-rune-boost-${i}-label`}
                    />
                    <input
                      type="number"
                      value={b.amount}
                      onChange={(e) => writeRuneBoosts(runeBoosts.map((r, j) => (j === i ? { ...r, amount: Math.round(Number(e.target.value) || 0) } : r)))}
                      className="w-16 h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                      data-testid={`library-item-rune-boost-${i}-amount`}
                    />
                    <button
                      type="button"
                      onClick={() => writeRuneBoosts(runeBoosts.filter((_, j) => j !== i))}
                      className="text-stone-500 hover:text-red-400 shrink-0"
                      data-testid={`library-item-rune-boost-${i}-remove`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-[11px] text-amber-500 hover:text-amber-400"
                  onClick={() => writeRuneBoosts([...runeBoosts, makeCARuneBoost()])}
                  data-testid="library-item-rune-boost-add"
                >
                  + Add boost
                </button>
              </div>
            </>
          )
        ))}

        {!isCA && type === "rune" && toggleableSection("rune", <Gem className="h-3.5 w-3.5" />, "Rune", (
          !isEditing ? (
            <>
              <StatStrip
                stats={[
                  { label: "Sockets into", value: titleCase(val("runeTargetItemType") ?? "any") },
                  { label: "Removal cost", value: val("runeRemoveDurabilityCost") ?? 1 },
                  { label: "Use", value: val("runeUseMode") === "skill_check" ? "Skill check" : "Flavour only" },
                ]}
              />
              {val("runeUseMode") === "skill_check" && (
                <p className="text-[11px] text-stone-500 mt-1.5">
                  {v3SkillOpts.find((s) => s.value === val("runeSkillKey"))?.label ?? "No skill set"}
                  {val("runeSkillAdjustment") ? ` (${val("runeSkillAdjustment") > 0 ? "+" : ""}${val("runeSkillAdjustment")})` : ""}
                </p>
              )}
              {(val("runeWeaponDamageLevelBonus") > 0 || val("runeUnremovable")) && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {val("runeWeaponDamageLevelBonus") > 0 && <ItemBadge>+{val("runeWeaponDamageLevelBonus")} weapon damage levels</ItemBadge>}
                  {val("runeUnremovable") && <ItemBadge tone="danger">Unremovable</ItemBadge>}
                </div>
              )}
              {(((val("runeStatEffects") as any[]) || []).length > 0) && (
                <div className="mt-2">
                  <span className="text-[11px] text-stone-500 block mb-1">What it does to the host item</span>
                  <TargetAmountList
                    rows={((val("runeStatEffects") as any[]) || []) as Array<{ target: string; amount: number }>}
                    targets={V3_RUNE_STAT_TARGETS.map((t) => ({ value: t.value, label: t.label }))}
                    editing={false}
                    onChange={() => {}}
                    makeRow={() => ({ target: V3_RUNE_STAT_TARGETS[0].value, amount: 0 })}
                    emptyText="No stat changes."
                    idOf={(_r, i) => String(i)}
                    testId="library-item-rune-stats"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <CaFieldGrid>
                <ItemField field="runeTargetItemType" label="Sockets into" value={val("runeTargetItemType") ?? "any"} onChange={chg("runeTargetItemType")} kind="select" options={V3_RUNE_TARGET_ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))} testId="library-item-rune-target" />
                <ItemField field="runeRemoveDurabilityCost" label="Removal cost" value={val("runeRemoveDurabilityCost") ?? 1} onChange={chg("runeRemoveDurabilityCost")} kind="number" min={0} suffix="max durability" testId="library-item-rune-remove-cost" />
                <ItemField field="runeUseMode" label="Use" value={val("runeUseMode") ?? "none"} onChange={chg("runeUseMode")} kind="select" options={RUNE_USE_MODES} testId="library-item-rune-use-mode" />
                <ItemField field="runeWeaponDamageLevelBonus" label="Weapon damage levels" value={val("runeWeaponDamageLevelBonus") ?? 0} onChange={chg("runeWeaponDamageLevelBonus")} kind="number" min={0} testId="library-item-rune-damage-levels" />
                {val("runeUseMode") === "skill_check" && (
                  <>
                    <ItemField field="runeSkillKey" label="Skill" value={val("runeSkillKey")} onChange={chg("runeSkillKey")} kind="select" options={v3SkillOpts} testId="library-item-rune-skill" />
                    <ItemField field="runeSkillAdjustment" label="Skill adjustment" value={val("runeSkillAdjustment") ?? 0} onChange={chg("runeSkillAdjustment")} kind="number" min={-99} testId="library-item-rune-skill-adjustment" />
                  </>
                )}
              </CaFieldGrid>
              <div className="mt-2 space-y-1">
                <ToggleRow label="Cannot be removed once socketed" value={!!val("runeUnremovable")} onChange={chg("runeUnremovable")} testId="toggle-library-item-rune-unremovable" />
              </div>
              <div className="mt-2">
                <span className="text-xs text-stone-400 block mb-1">What it does to the host item</span>
                <TargetAmountList
                  rows={((val("runeStatEffects") as any[]) || []) as Array<{ target: string; amount: number }>}
                  targets={V3_RUNE_STAT_TARGETS.map((t) => ({ value: t.value, label: t.label }))}
                  editing
                  onChange={(next) => setDraft({ runeStatEffects: next })}
                  makeRow={() => ({ target: V3_RUNE_STAT_TARGETS[0].value, amount: 0 })}
                  emptyText="No stat changes."
                  idOf={(_r, i) => String(i)}
                  testId="library-item-rune-stats"
                />
              </div>
            </>
          )
        ))}

        {/* ================================ RUNES ================================ */}
        {/* No slots, no cap - any number of runes can be attached. Attach via
            the dropdown or by dragging a rune in from inventory; either way
            it's confirmed before it actually attaches. */}
        {isCA && type !== "rune" && toggleableSection("runes", <Gem className="h-3.5 w-3.5" />, "Runes", (
          <>
            {runeSockets.length === 0 ? (
              <p className="text-xs text-stone-500 italic">No runes attached.</p>
            ) : (
              <div className="space-y-1.5" data-testid="library-item-runes">
                {runeSockets.map((socket) => (
                  <div
                    key={socket.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-stone-900/50 px-2.5 py-1.5"
                    style={{ borderColor: "var(--ca-gilt-line-soft)" }}
                    data-testid={`library-item-rune-${socket.id}`}
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-stone-200 block truncate">{socket.name}</span>
                      {socket.boosts.length > 0 && (
                        <span className="text-[10px] text-stone-500 block truncate">
                          {socket.boosts.map((b) => `${b.label || "?"} ${b.amount > 0 ? "+" : ""}${b.amount}`).join(", ")}
                        </span>
                      )}
                    </div>
                    {!!onCaUnsocketRune && (
                      <button
                        type="button"
                        onClick={() => onCaUnsocketRune(socket.id)}
                        className="text-stone-500 hover:text-red-400 shrink-0"
                        title="Detach"
                        data-testid={`button-library-item-rune-${socket.id}-detach`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {onCaSocketRune && (
              <div
                className={`mt-2 rounded-lg border border-dashed p-2 text-center transition-colors ${isRuneDragOver ? "border-amber-500 bg-amber-950/20" : "border-stone-700"}`}
                onDragOver={(e) => { e.preventDefault(); setIsRuneDragOver(true); }}
                onDragLeave={() => setIsRuneDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsRuneDragOver(false);
                  try {
                    const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
                    if (data?.type === "item" && data.item && data.itemId !== item?.id && caNormalizeItemType(data.item.itemType) === "rune") {
                      setPendingRuneAttach({ id: data.itemId, name: data.item.name || "this rune" });
                    }
                  } catch {
                    // Not a rune drag payload - ignore.
                  }
                }}
                data-testid="dropzone-library-item-rune"
              >
                {pendingRuneAttach ? (
                  <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                    <span className="text-stone-300">Attach "{pendingRuneAttach.name}"?</span>
                    <Button
                      size="sm"
                      className="h-6 text-[11px] bg-emerald-700 hover:bg-emerald-600 text-white"
                      onClick={() => { onCaSocketRune(pendingRuneAttach.id); setPendingRuneAttach(null); }}
                      data-testid="button-library-item-rune-confirm"
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] border-stone-700"
                      onClick={() => setPendingRuneAttach(null)}
                      data-testid="button-library-item-rune-cancel"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-stone-500 mb-1.5">Drag a rune in from inventory, or</p>
                    <select
                      value=""
                      onChange={(e) => {
                        const found = availableRunesToAttach.find((r: any) => r.id === e.target.value);
                        if (found) setPendingRuneAttach({ id: found.id, name: found.name });
                      }}
                      className="h-7 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                      data-testid="select-library-item-rune-add"
                    >
                      <option value="">+ Add a rune…</option>
                      {availableRunesToAttach.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
            {!onCaSocketRune && runeSockets.length === 0 && (
              <p className="text-[11px] text-stone-500 mt-1">Runes are attached in-game, from the character's own inventory.</p>
            )}
          </>
        ))}

        {/* =============================== SCROLL =============================== */}
        {type === "scroll" && toggleableSection("scroll", <ScrollText className="h-3.5 w-3.5" />, "Scroll", (
          !isEditing ? (
            <p className="text-sm text-stone-200" data-testid="text-library-item-scroll-summary">
              {val("scrollEffectMode") === "knowledge" ? (
                <>Grants Knowledge: <span className="font-semibold">{val("scrollKnowledgeName") || "—"}</span> ({attrLabel(val("scrollKnowledgeAttribute")) ?? titleCase(val("scrollKnowledgeAttribute") ?? "intelligence")} {val("scrollKnowledgeValue") ?? 0})</>
              ) : val("scrollEffectMode") === "skill" ? (
                <>Adjusts Skill: <span className="font-semibold">{v3SkillOpts.find((s) => s.value === val("scrollSkillKey"))?.label ?? "—"}</span> {(val("scrollSkillAmount") ?? 0) >= 0 ? "+" : ""}{val("scrollSkillAmount") ?? 0}</>
              ) : (
                <>Casts a spell on use.</>
              )}
            </p>
          ) : (
            <CaFieldGrid>
              <ItemField field="scrollEffectMode" label="Does" value={val("scrollEffectMode") ?? "spell"} onChange={chg("scrollEffectMode")} kind="select" options={SCROLL_MODES} wide testId="library-item-scroll-mode" />
              {val("scrollEffectMode") === "knowledge" && (
                <>
                  <ItemField field="scrollKnowledgeName" label="Knowledge" value={val("scrollKnowledgeName")} onChange={chg("scrollKnowledgeName")} testId="library-item-scroll-knowledge" />
                  <ItemField field="scrollKnowledgeAttribute" label="Attribute" value={val("scrollKnowledgeAttribute") ?? "intelligence"} onChange={chg("scrollKnowledgeAttribute")} kind="select" options={opts(ATTRIBUTES)} testId="library-item-scroll-attribute" />
                  <ItemField field="scrollKnowledgeValue" label="Value" value={val("scrollKnowledgeValue") ?? 0} onChange={chg("scrollKnowledgeValue")} kind="number" min={0} testId="library-item-scroll-value" />
                </>
              )}
              {val("scrollEffectMode") === "skill" && (
                <>
                  <ItemField field="scrollSkillKey" label="Skill" value={val("scrollSkillKey")} onChange={chg("scrollSkillKey")} kind="select" options={v3SkillOpts} testId="library-item-scroll-skill" />
                  <ItemField field="scrollSkillAmount" label="Adjustment" value={val("scrollSkillAmount") ?? 0} onChange={chg("scrollSkillAmount")} kind="number" min={-99} testId="library-item-scroll-skill-amount" />
                </>
              )}
            </CaFieldGrid>
          )
        ))}

        {/* ============================== SPELLBOOK ============================= */}
        {type === "spellbook" && toggleableSection("spellbook", <BookOpen className="h-3.5 w-3.5" />, "Spellbook", (
          !isEditing ? (
            <StatStrip stats={[{ label: "Capacity", value: (val("maxSpells") ?? 10) === 0 ? "Unlimited" : val("maxSpells") ?? 10 }]} />
          ) : (
            <CaFieldGrid>
              <ItemField field="maxSpells" label="Capacity" value={val("maxSpells") ?? 10} onChange={chg("maxSpells")} kind="number" min={0} suffix="spells (0 = unlimited)" wide testId="library-item-max-spells" />
            </CaFieldGrid>
          )
        ))}

        {/* ========================== CRAFTING RECIPES ========================== */}
        {type === "crafter" && isSheetGM && toggleableSection("crafting-recipes", <Hammer className="h-3.5 w-3.5" />, "Crafting Recipes", (
          !isEditing ? (
            <div className="space-y-2" data-testid="library-item-crafting-recipes-view">
              {craftRecipes.length === 0 ? (
                <p className="text-xs text-stone-500 italic">No recipes yet.</p>
              ) : (
                craftRecipes.map((r: any) => (
                  <div key={r.id} className="rounded-lg border bg-stone-900/50 px-2.5 py-2" style={{ borderColor: "var(--ca-gilt-line-soft)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-stone-100">{r.name || "Unnamed recipe"}</span>
                      {!r.noRoll && (
                        <span className="font-mono text-xs shrink-0" style={{ color: "var(--ca-gilt)" }}>
                          {r.diceFormula}{r.mod ? (r.mod > 0 ? ` +${r.mod}` : ` ${r.mod}`) : ""}{attrLabel(r.attribute) ? ` ${attrLabel(r.attribute)}` : ""}
                        </span>
                      )}
                    </div>
                    {r.description && <p className="text-[11px] text-stone-400 italic mt-0.5">{r.description}</p>}
                    {Array.isArray(r.ingredients) && r.ingredients.length > 0 && (
                      <p className="text-[11px] text-stone-500 mt-1">Uses: {r.ingredients.map((ing: any) => `${ing.itemName} ×${ing.quantity}`).join(", ")}</p>
                    )}
                    {Array.isArray(r.toolItems) && r.toolItems.length > 0 && (
                      <p className="text-[11px] text-stone-500">Tools: {r.toolItems.map((t: any) => t.name).join(", ")}</p>
                    )}
                    <p className="text-[11px] text-stone-500">
                      Makes: {itemNameFor(r.outputItemId) || "—"} {r.outputQuantity > 1 ? `×${r.outputQuantity}` : ""}
                    </p>
                    {(r.costEnergyEnabled || r.costManaEnabled || r.costHpEnabled) && (
                      <p className="text-[11px] text-stone-500">
                        Costs: {[
                          r.costEnergyEnabled && `${r.costEnergy} Energy`,
                          r.costManaEnabled && `${r.costMana} Mana`,
                          r.costHpEnabled && `${r.costHp} HP`,
                        ].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              <p className="text-[11px] text-stone-500 mb-2">
                GM only. Recipes made here belong only to this crafter. To reuse the same recipes across
                several crafters, author them on a Crafter Recipe Template instead and link it below.
                {!item?.isTemplate && !item?.templateItemId && (
                  <span className="block mt-1 text-amber-600">
                    This crafter isn't linked to a library item, so new recipes may fail to save - open its
                    library version instead, or re-add it to the character from the library.
                  </span>
                )}
              </p>
              {craftRecipeItemId && <CraftRecipesEditor itemId={craftRecipeItemId} systemSlug={systemSlug} />}
              <div className="mt-3">
                {craftRecipeItemId && <CrafterTemplateLinksPanel itemId={craftRecipeItemId} systemSlug={systemSlug} personal={personal} />}
              </div>
            </>
          )
        ))}

        {/* ================================ REPAIR ============================== */}
        {isV3 && type !== "crafter" && toggleableSection("repair", <Hammer className="h-3.5 w-3.5" />, "Repair", (
          !isEditing ? (
            <>
              <StatStrip stats={[{ label: "Restores", value: `${val("repairAmount") ?? 0} durability` }]} />
              <div className="mt-1.5">
                <span className="text-[11px] text-stone-500 block mb-1">Consumed per repair</span>
                <div className="space-y-1" data-testid="library-item-repair-ingredients">
                  {(((val("repairIngredients") as any[]) || []).length === 0) ? (
                    <p className="text-[11px] text-stone-500">Nothing. Repairs cost no materials.</p>
                  ) : (
                    ((val("repairIngredients") as any[]) || []).map((ing: any, i: number) => (
                      <p key={i} className="text-xs text-stone-300">{ing.itemName || "Unnamed item"} × {ing.quantity ?? 1}</p>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] text-stone-500 mb-2">What a crafter's Repair recipe restores and consumes when it targets this item.</p>
              <CaFieldGrid>
                <ItemField field="repairAmount" label="Durability restored" value={val("repairAmount") ?? 0} onChange={chg("repairAmount")} kind="number" min={0} wide testId="library-item-repair-amount" />
              </CaFieldGrid>
              <div className="mt-2">
                <span className="text-xs text-stone-400 block mb-1">Consumed per repair</span>
                <div className="space-y-1" data-testid="library-item-repair-ingredients">
                  {(((val("repairIngredients") as any[]) || []).length === 0) && (
                    <p className="text-[11px] text-stone-500">Nothing. Repairs cost no materials.</p>
                  )}
                  {((val("repairIngredients") as any[]) || []).map((ing: any, i: number) => (
                    <div key={i} className="flex items-center gap-1">
                      <input
                        value={ing.itemName ?? ""}
                        onChange={(e) => {
                          const next = [...((val("repairIngredients") as any[]) || [])];
                          next[i] = { ...next[i], itemName: e.target.value };
                          setDraft({ repairIngredients: next });
                        }}
                        placeholder="Item name"
                        className="h-7 flex-1 min-w-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                        data-testid={`library-item-repair-ingredient-${i}-name`}
                      />
                      <input
                        type="number"
                        value={ing.quantity ?? 1}
                        onChange={(e) => {
                          const next = [...((val("repairIngredients") as any[]) || [])];
                          next[i] = { ...next[i], quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) };
                          setDraft({ repairIngredients: next });
                        }}
                        className="w-16 h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                        data-testid={`library-item-repair-ingredient-${i}-qty`}
                      />
                      <button
                        type="button"
                        onClick={() => setDraft({ repairIngredients: ((val("repairIngredients") as any[]) || []).filter((_: any, j: number) => j !== i) })}
                        className="text-stone-500 hover:text-red-400 shrink-0"
                        data-testid={`library-item-repair-ingredient-${i}-remove`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-[11px] text-amber-500 hover:text-amber-400"
                    onClick={() => setDraft({ repairIngredients: [...((val("repairIngredients") as any[]) || []), { itemId: null, itemName: "", quantity: 1 }] })}
                    data-testid="library-item-repair-ingredient-add"
                  >
                    + Add ingredient
                  </button>
                </div>
              </div>
            </>
          )
        ))}

        {/* ============================= BUILD RECIPE =========================== */}
        {!!item?.isTemplate && isSheetGM && toggleableSection("build-recipe", <Hammer className="h-3.5 w-3.5" />, "Build Recipe", (
          !isEditing ? (
            <div className="space-y-1" data-testid="library-item-build-ingredients">
              {buildIngredients.length === 0 ? (
                <p className="text-xs text-stone-500 italic">No build recipe set.</p>
              ) : (
                <>
                  <p className="text-xs text-stone-300">Makes {buildOutputQuantity}</p>
                  {buildIngredients.map((ing: any, i: number) => (
                    <p key={i} className="text-xs text-stone-300">{ing.itemName || "Unnamed item"} × {ing.quantity ?? 1}</p>
                  ))}
                  <p className="text-[11px] text-stone-500">
                    Recommended value: <span className="font-semibold" style={{ color: "var(--ca-gilt)" }}>{buildRecommendedPrice}</span>
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="text-[11px] text-stone-500 mb-2">
                GM only. What this item is built from - a crafter can pick it up later via "Add from items".
                Ingredient values are summed, +20% markup, rounded up to a clean number.
              </p>
              <div className="mb-2" style={{ maxWidth: 160 }}>
                <span className="text-xs text-stone-400 block mb-1">Output quantity</span>
                <NumberInput
                  min={1}
                  value={buildOutputQuantity}
                  onChange={(v) => writeBuildRecipe(v ?? 1, buildIngredients)}
                  className="h-7 bg-stone-800 border-stone-700 text-stone-200 text-xs"
                  data-testid="input-library-item-build-output-quantity"
                />
              </div>
              <div className="space-y-1" data-testid="library-item-build-ingredients">
                {buildIngredients.length === 0 && (
                  <p className="text-[11px] text-stone-500">No ingredients yet.</p>
                )}
                {buildIngredients.map((ing: any, i: number) => (
                  <div key={i} className="flex items-center gap-1">
                    <select
                      value={ing.itemId ?? ""}
                      onChange={(e) => {
                        const found = (rollTemplates as any[]).find((it) => it.id === e.target.value);
                        const next = [...buildIngredients];
                        next[i] = { ...ing, itemId: e.target.value || null, itemName: found?.name ?? ing.itemName };
                        writeBuildRecipe(buildOutputQuantity, next);
                      }}
                      className="h-7 flex-1 min-w-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                      data-testid={`library-item-build-ingredient-${i}-item`}
                    >
                      <option value="">— item —</option>
                      {(rollTemplates as any[]).map((it) => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={ing.quantity ?? 1}
                      onChange={(e) => {
                        const next = [...buildIngredients];
                        next[i] = { ...ing, quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) };
                        writeBuildRecipe(buildOutputQuantity, next);
                      }}
                      className="w-16 h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                      data-testid={`library-item-build-ingredient-${i}-qty`}
                    />
                    <button
                      type="button"
                      onClick={() => writeBuildRecipe(buildOutputQuantity, buildIngredients.filter((_: any, j: number) => j !== i))}
                      className="text-stone-500 hover:text-red-400 shrink-0"
                      data-testid={`library-item-build-ingredient-${i}-remove`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-[11px] text-amber-500 hover:text-amber-400"
                  onClick={() => writeBuildRecipe(buildOutputQuantity, [...buildIngredients, { itemId: null, itemName: "", quantity: 1 }])}
                  data-testid="library-item-build-ingredient-add"
                >
                  + Add ingredient
                </button>
              </div>
              {buildIngredients.length > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-stone-500">
                    Recommended value: <span className="font-semibold" style={{ color: "var(--ca-gilt)" }} data-testid="text-library-item-build-recommended-price">{buildRecommendedPrice}</span>
                  </span>
                  <button
                    type="button"
                    className="text-[11px] hover:underline"
                    style={{ color: "var(--ca-gilt)" }}
                    onClick={() => setDraft({ price: buildRecommendedPrice })}
                    data-testid="button-library-item-build-apply-price"
                  >
                    Apply to Value
                  </button>
                </div>
              )}
            </>
          )
        ))}

        {/* =============================== EFFECTS ============================== */}
        {toggleableSection("effects", <Sparkles className="h-3.5 w-3.5" />, "Effects", (
          !isEditing ? (
            <TargetAmountList<CAItemEffect>
              rows={effects}
              targets={effectTargets}
              editing={false}
              onChange={() => {}}
              makeRow={() => makeCAItemEffect()}
              emptyText="No effects. This item changes nothing on its own."
              idOf={(row) => row.id}
              renderReadRow={(row, label) => (
                <>
                  <span className="text-stone-300">{CA_ITEM_EFFECT_TRIGGER_LABELS[row.trigger]} · {label}</span>
                  <span className="font-mono font-semibold" style={{ color: "var(--ca-gilt)" }}>
                    {row.amount > 0 ? `+${row.amount}` : row.amount}
                  </span>
                </>
              )}
              testId="library-item-effects"
            />
          ) : (
            <>
              <p className="text-[11px] text-stone-500 mb-1">
                What holding this item does to its owner. Each one says for itself whether it needs the item equipped.
              </p>
              <TargetAmountList<CAItemEffect>
                rows={effects}
                targets={effectTargets}
                editing
                onChange={(next) => setDraft({ effects: next })}
                makeRow={() => makeCAItemEffect()}
                emptyText="No effects. This item changes nothing on its own."
                idOf={(row) => row.id}
                renderLead={(row, p) => (
                  <select
                    value={row.trigger}
                    onChange={(e) => p({ trigger: e.target.value as CAItemEffect["trigger"] })}
                    className="h-7 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1 shrink-0"
                    data-testid={`select-item-effect-${row.id}-trigger`}
                  >
                    {CA_ITEM_EFFECT_TRIGGERS.map((t) => (
                      <option key={t} value={t}>{CA_ITEM_EFFECT_TRIGGER_LABELS[t]}</option>
                    ))}
                  </select>
                )}
                testId="library-item-effects"
              />
            </>
          )
        ))}

        {item?.id && liveTemplates.length > 0 && toggleableSection("roll-templates", <Layers className="h-3.5 w-3.5" />, "Roll templates", (
          <>
            <p className="text-[11px] text-stone-500 mb-1">Rolls this item inherits from a shared template.</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {isEditing ? (
                liveTemplates.map((t: any) => (
                  <ToggleRow
                    key={t.id}
                    label={t.name}
                    value={linkedTemplateIds.includes(t.id)}
                    onChange={(next) => {
                      const ids = next
                        ? [...linkedTemplateIds, t.id]
                        : linkedTemplateIds.filter((x) => x !== t.id);
                      // Its own endpoint and its own cache entry, so it writes
                      // itself the way this section always has, independent of
                      // the rest of the sheet's Save/Cancel.
                      api.setItemTemplateLinks(item.id, ids).then(() => onUpdate({}));
                    }}
                    testId={`toggle-library-item-template-${t.id}`}
                  />
                ))
              ) : (
                liveTemplates.filter((t: any) => linkedTemplateIds.includes(t.id)).map((t: any) => (
                  <ItemBadge key={t.id}>{t.name}</ItemBadge>
                ))
              )}
            </div>
          </>
        ))}

        {item?.id && toggleableSection("rolls", <Dices className="h-3.5 w-3.5" />, "Rolls", (
          <RollEntriesEditor
            ownerType="item"
            ownerId={item.id}
            canEdit={canEdit && isEditing}
            campaignSystem={systemSlug}
            onExecuteRoll={onExecuteRoll}
            characterEnergy={characterEnergy}
            characterMana={characterMana}
            characterItems={characterItems}
            characterCustomSkills={characterCustomSkills}
            quickAddPresets={!isCA ? undefined : type === "weapon" ? [{
              label: "Attack Roll",
              icon: <Sword className="w-3 h-3 mr-1" />,
              preset: { name: "Attack", rollType: "damage", mod: scaledStat(val("caBaseDamage") ?? 0, "caBaseDamageScaling"), isAttack: true },
            }] : type === "consumable" ? [{
              label: "Use Roll",
              icon: <FlaskConical className="w-3 h-3 mr-1" />,
              preset: { name: "Use", rollType: "effect", noRoll: true },
            }] : undefined}
          />
        ))}

        {isEditing && (
          <div className="pt-1">
            <CaDivider />
            <div className="flex items-center justify-end gap-2 mt-2">
              <Button size="sm" variant="outline" className="border-stone-700" onClick={handleCancel} data-testid="button-library-item-cancel-bottom">
                Cancel
              </Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white" onClick={handleSave} data-testid="button-library-item-save-bottom">
                <Check className="h-3.5 w-3.5 mr-1" /> Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>
      {imageBrowser}
    </CaSheetFrame>
  );
}
