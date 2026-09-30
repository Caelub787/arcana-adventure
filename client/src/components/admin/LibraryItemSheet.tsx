/**
 * A library item, laid out as a sheet with a View and an Edit face.
 *
 * View is how an item spends nearly all its life: read, glanced at, rolled
 * from. It shows only the fields that are actually set, laid out like an
 * entry in a bestiary rather than a form nobody finished filling in. Edit is
 * a deliberate mode a GM or trusted player steps into with the pencil in the
 * header - every field on the item becomes a plain, always-active input,
 * and nothing reaches the server until Save. Cancel throws the whole draft
 * away. This replaced an earlier version where every field edited itself in
 * place on double-click with no separate mode at all - fine for a handful of
 * values, but a crafter (Handling, Crafting Recipes, Repair, Build Recipe,
 * Effects, Rolls all at once) read as a pile of independently-editable
 * scraps rather than one thing.
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
  Pencil, Check, Feather,
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

/**
 * What a new item may be set to, matching what the old form offered: crafters
 * are V2 and V3, spellbooks and miscellaneous are V3 only. Runes, scrolls and
 * currency are made by their own flows rather than picked here, so they are
 * not on the list - but an item that already is one keeps showing as one,
 * because a select that cannot represent its own value is worse than a long
 * list.
 */
const ITEM_TYPES_BASE = ["ammunition", "armor", "consumable", "container", "utility", "weapon"];
function itemTypeOptions(systemSlug: string, current: string) {
  const list = [...ITEM_TYPES_BASE];
  if (systemSlug === "aa-v2" || systemSlug === "aa-v3" || systemSlug === "ca") list.push("crafter");
  if (systemSlug === "aa-v3") list.push("miscellaneous", "spellbook");
  if (systemSlug === "ca") list.push("beast_orb");
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

/**
 * One boolean, shown two different ways: a plain checked/unchecked mark when
 * the sheet is being read, an actual checkbox when it's being edited. There
 * is no third, disabled-but-visible state - a control you cannot use is not
 * information, it's clutter.
 */
function ToggleRow({
  label,
  value,
  onChange,
  editing,
  testId,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  editing: boolean;
  testId: string;
}) {
  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-xs" data-testid={testId}>
        <span
          className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border shrink-0 ${value ? "border-transparent" : "border-stone-600"}`}
          style={value ? { background: "var(--ca-gilt)" } : undefined}
        >
          {value && <Check className="h-2.5 w-2.5 text-stone-950" />}
        </span>
        <span className={value ? "text-stone-300" : "text-stone-600"}>{label}</span>
      </div>
    );
  }
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
 * The sheet's one field primitive. Read mode is label-above-value, plain
 * text, no affordance suggesting it can be touched. Edit mode is the same
 * label over a plain, always-active input - no double-click, no per-field
 * Save/Cancel, because the whole sheet is already in one editing session
 * with its own Save/Cancel at top and bottom.
 */
function ItemField({
  editing,
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
  empty = "—",
  testId,
  decimal = false,
}: {
  editing: boolean;
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
  /** What to show when the value is unset. */
  empty?: string;
  testId?: string;
  /** Set true for `kind="number"` fields like weight that take fractional values. */
  decimal?: boolean;
}) {
  const id = testId ?? `item-field-${field}`;

  if (!editing) {
    const shown =
      kind === "select"
        ? options?.find((o) => o.value === String(value ?? ""))?.label ?? (value ? String(value) : "")
        : value === null || value === undefined || value === "" ? "" : String(value);
    return (
      <CaField label={label} wide={wide}>
        <CaValue
          className={`${shown ? "" : "text-stone-600 italic"} ${kind === "textarea" ? "whitespace-pre-wrap" : "truncate"}`}
          data-testid={`${id}-value`}
        >
          {shown || empty}
          {shown && suffix ? <span className="text-stone-500 text-xs ml-1">{suffix}</span> : null}
        </CaValue>
      </CaField>
    );
  }

  return (
    <CaField label={label} wide={wide}>
      {kind === "number" ? (
        <NumberInput
          min={min}
          max={max}
          integer={!decimal}
          value={value ?? min ?? 0}
          onChange={(v) => onChange(v ?? min ?? 0)}
          className="bg-stone-900 border-stone-700 text-stone-200 h-8 text-sm w-full"
          data-testid={id}
        />
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
}) {
  const [isEditing, setIsEditing] = useState(!!initialEditing);
  const { draft, patch: setDraft, isDirty, clear: clearDraft } = useItemDraft(isEditing);
  const queryClient = useQueryClient();

  /** Reads a field's pending edit if there is one, else the saved value -
   * identical to the saved value whenever the sheet isn't being edited. */
  const val = (field: string) => (field in draft ? draft[field] : item?.[field]);
  const chg = (field: string) => (v: any) => setDraft({ [field]: v });

  const handleSave = () => {
    if (isDirty) {
      const normalized: Record<string, any> = {};
      for (const [k, v] of Object.entries(draft)) {
        normalized[k] = typeof v === "string" ? v.trim() : v;
      }
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
  const type = String(val("itemType") || "");
  const isV3 = systemSlug === "aa-v3";
  // C.A. has one roll system and it is the Rolls panel at the bottom of this
  // sheet. The old per-item damage/attack columns were a second, weaker one
  // saying the same thing in fewer words, so C.A. doesn't show them at all -
  // an item that hits for 1d8 says so as a roll, the way an Ability does.
  const isCA = isWoundSystem(systemSlug);
  const damageTypes = getEffectTypes(systemSlug);
  const rules = woundSystemRules(systemSlug) as any;

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

  const section = (icon: React.ReactNode, title: string, body: React.ReactNode) => (
    <>
      <CaDivider />
      <CaSection icon={icon} title={title}>{body}</CaSection>
    </>
  );

  // Every section except Identity and Handling: shown by default, with a
  // "Show" checkbox only the GM/admin sees in its own header to collapse
  // just that section's body for their own view (the header stays for them,
  // so it's never lost). A player - including a trusted player - never sees
  // a hidden section at all: not the body, not even its header.
  const toggleableSection = (key: string, icon: React.ReactNode, title: string, body: React.ReactNode) => {
    const hidden = hiddenSections.includes(key);
    if (hidden && !isSheetGM) return null;
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
              editing
              onChange={(v) => setSectionHidden(key, !v)}
              testId={`toggle-library-item-section-${key}`}
            />
          ) : undefined}
        >
          {!hidden && body}
        </CaSection>
      </>
    );
  };

  return (
    <CaSheetFrame className="w-full max-w-3xl">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--ca-gilt-line-soft)" }}>
        <span className="flex items-center gap-1.5 min-w-0">
          {/* A rarity gem rather than a text label - the sheet already says
              the rarity in Identity; this is just a glance-able tell, the
              way a loot table's own entries are colour-coded. */}
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
        <CaSection icon={<Package className="h-3.5 w-3.5" />} title="Identity">
          <div className="flex gap-3 items-start">
            {/* The picture, in the same ringed square a character's portrait
                gets, so an item and a character read as the same kind of
                thing. */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={pickImage}
                disabled={!isEditing}
                className="relative w-20 h-20 rounded-xl p-[2px] block disabled:cursor-default"
                style={{ background: "linear-gradient(135deg, var(--ca-gilt) 0%, var(--ca-gilt-dim) 45%, var(--ca-gilt-bright) 100%)" }}
                aria-label={val("image") ? "Change item image" : "Add an item image"}
                title={isEditing ? "Click to choose an image" : undefined}
                data-testid="button-library-item-image"
              >
                <span className="w-full h-full rounded-[10px] overflow-hidden bg-stone-800 flex items-center justify-center relative">
                  {val("image") ? (
                    <img src={val("image")} alt="" className="w-full h-full object-cover" data-testid="img-library-item" />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-stone-600" />
                  )}
                  {isEditing && (
                    <span className="absolute bottom-0 right-0 w-5 h-5 rounded-tl-lg bg-stone-950/80 flex items-center justify-center" style={{ color: "var(--ca-gilt)" }}>
                      <Pencil className="h-2.5 w-2.5" />
                    </span>
                  )}
                </span>
              </button>
              {isEditing && val("image") && (
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
              <ItemField editing={isEditing} field="name" label="Name" value={val("name")} onChange={chg("name")} placeholder="Untitled Item" testId="library-item-name" />
              <ItemField editing={isEditing} field="itemType" label="Type" value={type} onChange={chg("itemType")} kind="select" options={itemTypeOptions(systemSlug, type)} testId="library-item-type" />
              <ItemField editing={isEditing} field="rarity" label="Rarity" value={val("rarity")} onChange={chg("rarity")} kind="select" options={opts(RARITIES)} testId="library-item-rarity" />
              <ItemField editing={isEditing} field="size" label="Size" value={val("size")} onChange={chg("size")} testId="library-item-size" />
              <ItemField editing={isEditing} field="description" label="Description" value={val("description")} onChange={chg("description")} kind="textarea" wide placeholder="What it is." testId="library-item-description" />
            </CaFieldGrid>
          </div>
        </CaSection>

        {section(<Coins className="h-3.5 w-3.5" />, "Handling", (
          <>
            <CaFieldGrid>
              <ItemField editing={isEditing} field="quantity" label="Quantity" value={val("quantity") ?? 1} onChange={chg("quantity")} kind="number" min={0} testId="library-item-quantity" />
              <ItemField editing={isEditing} field="itemWeight" label="Weight" value={val("itemWeight") ?? 0} onChange={chg("itemWeight")} kind="number" min={0} decimal suffix="lb" testId="library-item-weight" />
              <ItemField editing={isEditing} field="price" label="Value" value={val("price") ?? 0} onChange={chg("price")} kind="number" min={0} testId="library-item-price" />
              <ItemField editing={isEditing} field="durability" label="Durability" value={val("durability") ?? 10} onChange={chg("durability")} kind="number" min={0} testId="library-item-durability" />
              <ItemField editing={isEditing} field="maxDurability" label="Max durability" value={val("maxDurability") ?? 10} onChange={chg("maxDurability")} kind="number" min={0} testId="library-item-max-durability" />
              <ItemField editing={isEditing} field="carryCapacity" label="Carry capacity" value={val("carryCapacity") ?? 0} onChange={chg("carryCapacity")} kind="number" min={0} testId="library-item-carry-capacity" />
              {isV3 && (
                <ItemField
                  editing={isEditing}
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
            <div className="mt-2 space-y-1">
              <ToggleRow label="Container" value={!!val("isContainer")} editing={isEditing} onChange={chg("isContainer")} testId="toggle-library-item-container" />
              {/* Two-handedness is how the item is held, not how it hits, so
                  it stays behind when C.A. drops the Attack block. */}
              {isCA && type === "weapon" && (
                <ToggleRow label="Heavy (two-handed)" value={!!val("isHeavy")} editing={isEditing} onChange={chg("isHeavy")} testId="toggle-library-item-heavy" />
              )}
            </div>
          </>
        ))}

        {renderAfterHandling}

        {!isCA && (type === "weapon" || type === "consumable" || type === "ammunition") && toggleableSection("attack", <Sword className="h-3.5 w-3.5" />, "Attack", (
          <>
            <CaFieldGrid>
              <ItemField editing={isEditing} field="damage" label="Damage" value={val("damage")} onChange={chg("damage")} placeholder="1d8" testId="library-item-damage" />
              <ItemField editing={isEditing} field="damageType" label="Damage type" value={val("damageType")} onChange={chg("damageType")} kind="select" options={opts(damageTypes, "None")} testId="library-item-damage-type" />
              <ItemField editing={isEditing} field="mod" label="Modifier" value={val("mod") ?? 0} onChange={chg("mod")} kind="number" min={-99} testId="library-item-mod" />
              <ItemField editing={isEditing} field="range" label="Range" value={val("range") ?? 0} onChange={chg("range")} kind="number" min={0} suffix="ft" testId="library-item-range" />
              <ItemField editing={isEditing} field="attribute" label="Attribute" value={val("attribute")} onChange={chg("attribute")} kind="select" options={opts(ATTRIBUTES, "None")} testId="library-item-attribute" />
              <ItemField editing={isEditing} field="aoe" label="Area" value={val("aoe")} onChange={chg("aoe")} kind="select" options={opts(AOE_SHAPES, "None")} testId="library-item-aoe" />
              {type === "weapon" && (
                <ItemField editing={isEditing} field="weaponCategory" label="Weapon category" value={val("weaponCategory")} onChange={chg("weaponCategory")} placeholder="bow, sling…" testId="library-item-weapon-category" />
              )}
              {isV3 && type === "weapon" && (
                <ItemField
                  editing={isEditing}
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
              <ToggleRow label="Heavy (two-handed)" value={!!val("isHeavy")} editing={isEditing} onChange={chg("isHeavy")} testId="toggle-library-item-heavy" />
              <ToggleRow label="Can apply token effects" value={!!val("canApplyEffects")} editing={isEditing} onChange={chg("canApplyEffects")} testId="toggle-library-item-effects" />
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
                        editing={isEditing}
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
        ))}

        {type === "armor" && toggleableSection("protection", <Shield className="h-3.5 w-3.5" />, "Protection", (
          <>
            <CaFieldGrid>
              <ItemField editing={isEditing} field="armorSlot" label="Slot" value={val("armorSlot")} onChange={chg("armorSlot")} kind="select" options={opts(ARMOR_SLOTS, "None")} testId="library-item-armor-slot" />
              <ItemField editing={isEditing} field="armorBonus" label="DC bonus" value={val("armorBonus") ?? 0} onChange={chg("armorBonus")} kind="number" min={0} testId="library-item-armor-bonus" />
              <ItemField editing={isEditing} field="damageReduction" label="Damage reduction" value={val("damageReduction") ?? 0} onChange={chg("damageReduction")} kind="number" min={0} testId="library-item-damage-reduction" />
              <ItemField editing={isEditing} field="damageReductionType" label="Reduces" value={val("damageReductionType")} onChange={chg("damageReductionType")} kind="select" options={opts(damageTypes, "All")} testId="library-item-damage-reduction-type" />
              {val("grantsDcBonus") && (
                <ItemField editing={isEditing} field="dcBonusValue" label="Granted DC bonus" value={val("dcBonusValue") ?? 0} onChange={chg("dcBonusValue")} kind="number" min={0} testId="library-item-dc-bonus-value" />
              )}
            </CaFieldGrid>
            <div className="mt-2 space-y-1">
              <ToggleRow label="Grants a DC bonus" value={!!val("grantsDcBonus")} editing={isEditing} onChange={chg("grantsDcBonus")} testId="toggle-library-item-grants-dc" />
            </div>
            {isV3 && (
              <div className="mt-2">
                <span className="text-xs text-stone-400 block mb-1">Attribute and skill boosts while worn</span>
                <TargetAmountList
                  rows={((val("v3ArmorBoosts") as any[]) || []) as Array<{ target: string; amount: number }>}
                  targets={effectTargets}
                  editing={isEditing}
                  onChange={(next) => setDraft({ v3ArmorBoosts: next })}
                  makeRow={() => ({ target: effectTargets[0]?.value ?? "", amount: 0 })}
                  emptyText="No boosts."
                  idOf={(_r, i) => String(i)}
                  testId="library-item-armor-boosts"
                />
              </div>
            )}
          </>
        ))}

        {type === "consumable" && toggleableSection("when-used", <FlaskConical className="h-3.5 w-3.5" />, "When used", (
          <>
            <CaFieldGrid>
              <ItemField editing={isEditing} field="rationServings" label="Ration servings" value={val("rationServings") ?? 0} onChange={chg("rationServings")} kind="number" min={0} testId="library-item-ration-servings" />
              {/* The stat changes and the detonation are a roll wearing a
                  different hat - C.A. writes them as rolls instead. */}
              {!isCA && (
                <>
                  <ItemField editing={isEditing} field="consumableHpChange" label="HP change" value={val("consumableHpChange") ?? 0} onChange={chg("consumableHpChange")} kind="number" min={-999} testId="library-item-hp-change" />
                  <ItemField editing={isEditing} field="consumableEnergyChange" label="Energy change" value={val("consumableEnergyChange") ?? 0} onChange={chg("consumableEnergyChange")} kind="number" min={-999} testId="library-item-energy-change" />
                  <ItemField editing={isEditing} field="consumableManaChange" label="Mana change" value={val("consumableManaChange") ?? 0} onChange={chg("consumableManaChange")} kind="number" min={-999} testId="library-item-mana-change" />
                </>
              )}
              <ItemField editing={isEditing} field="consumableEffectDescription" label="Effect" value={val("consumableEffectDescription")} onChange={chg("consumableEffectDescription")} kind="textarea" wide placeholder="What happens when it is used." testId="library-item-consumable-effect" />
              {!isCA && val("isDetonatable") && (
                <>
                  <ItemField editing={isEditing} field="detonateAoeShape" label="Detonation area" value={val("detonateAoeShape")} onChange={chg("detonateAoeShape")} kind="select" options={opts(AOE_SHAPES, "None")} testId="library-item-detonate-shape" />
                  <ItemField editing={isEditing} field="detonateAoeRange" label="Detonation range" value={val("detonateAoeRange") ?? 15} onChange={chg("detonateAoeRange")} kind="number" min={0} suffix="ft" testId="library-item-detonate-range" />
                </>
              )}
            </CaFieldGrid>
            {!isCA && (
              <div className="mt-2 space-y-1">
                <ToggleRow label="Rolls like a weapon" value={!!val("isDamaging")} editing={isEditing} onChange={chg("isDamaging")} testId="toggle-library-item-damaging" />
                <ToggleRow label="Can be detonated" value={!!val("isDetonatable")} editing={isEditing} onChange={chg("isDetonatable")} testId="toggle-library-item-detonatable" />
              </div>
            )}
            {isCA && (
              <div className="mt-3">
                <span className="text-xs text-stone-400 block mb-1">Wound effect options</span>
                {isEditing && (
                  <p className="text-[11px] text-stone-500 mb-2">
                    Each option is one way to use this potion - the player picks one on use. "Heal" removes that
                    many of the player's own wounds at that severity (they choose which); "Deal" adds new ones.
                  </p>
                )}
                {!isEditing ? (
                  <div className="space-y-1" data-testid="library-item-wound-options">
                    {woundOptions.length === 0 ? (
                      <p className="text-[11px] text-stone-500">No wound options.</p>
                    ) : (
                      woundOptions.map((opt) => (
                        <p key={opt.id} className="text-xs text-stone-300">{caConsumableWoundOptionLabel(opt)}</p>
                      ))
                    )}
                  </div>
                ) : (
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
                )}
              </div>
            )}
          </>
        ))}

        {type === "ammunition" && toggleableSection("ammunition", <Crosshair className="h-3.5 w-3.5" />, "Ammunition", (
          <CaFieldGrid>
            <ItemField editing={isEditing} field="ammunitionType" label="Ammunition type" value={val("ammunitionType")} onChange={chg("ammunitionType")} placeholder="arrow, bolt…" testId="library-item-ammo-type" />
            <ItemField editing={isEditing} field="breakChance" label="Break chance" value={val("breakChance") ?? 10} onChange={chg("breakChance")} kind="number" min={0} max={100} suffix="%" testId="library-item-break-chance" />
            {isV3 && (
              <ItemField
                editing={isEditing}
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
        ))}

        {type === "rune" && toggleableSection("rune", <Gem className="h-3.5 w-3.5" />, "Rune", (
          <>
            <CaFieldGrid>
              <ItemField editing={isEditing} field="runeTargetItemType" label="Sockets into" value={val("runeTargetItemType") ?? "any"} onChange={chg("runeTargetItemType")} kind="select" options={V3_RUNE_TARGET_ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))} testId="library-item-rune-target" />
              <ItemField editing={isEditing} field="runeRemoveDurabilityCost" label="Removal cost" value={val("runeRemoveDurabilityCost") ?? 1} onChange={chg("runeRemoveDurabilityCost")} kind="number" min={0} suffix="max durability" testId="library-item-rune-remove-cost" />
              <ItemField editing={isEditing} field="runeUseMode" label="Use" value={val("runeUseMode") ?? "none"} onChange={chg("runeUseMode")} kind="select" options={RUNE_USE_MODES} testId="library-item-rune-use-mode" />
              <ItemField editing={isEditing} field="runeWeaponDamageLevelBonus" label="Weapon damage levels" value={val("runeWeaponDamageLevelBonus") ?? 0} onChange={chg("runeWeaponDamageLevelBonus")} kind="number" min={0} testId="library-item-rune-damage-levels" />
              {val("runeUseMode") === "skill_check" && (
                <>
                  <ItemField editing={isEditing} field="runeSkillKey" label="Skill" value={val("runeSkillKey")} onChange={chg("runeSkillKey")} kind="select" options={v3SkillOpts} testId="library-item-rune-skill" />
                  <ItemField editing={isEditing} field="runeSkillAdjustment" label="Skill adjustment" value={val("runeSkillAdjustment") ?? 0} onChange={chg("runeSkillAdjustment")} kind="number" min={-99} testId="library-item-rune-skill-adjustment" />
                </>
              )}
            </CaFieldGrid>
            <div className="mt-2 space-y-1">
              <ToggleRow label="Cannot be removed once socketed" value={!!val("runeUnremovable")} editing={isEditing} onChange={chg("runeUnremovable")} testId="toggle-library-item-rune-unremovable" />
            </div>
            <div className="mt-2">
              <span className="text-xs text-stone-400 block mb-1">What it does to the host item</span>
              <TargetAmountList
                rows={((val("runeStatEffects") as any[]) || []) as Array<{ target: string; amount: number }>}
                targets={V3_RUNE_STAT_TARGETS.map((t) => ({ value: t.value, label: t.label }))}
                editing={isEditing}
                onChange={(next) => setDraft({ runeStatEffects: next })}
                makeRow={() => ({ target: V3_RUNE_STAT_TARGETS[0].value, amount: 0 })}
                emptyText="No stat changes."
                idOf={(_r, i) => String(i)}
                testId="library-item-rune-stats"
              />
            </div>
          </>
        ))}

        {type === "scroll" && toggleableSection("scroll", <ScrollText className="h-3.5 w-3.5" />, "Scroll", (
          <CaFieldGrid>
            <ItemField editing={isEditing} field="scrollEffectMode" label="Does" value={val("scrollEffectMode") ?? "spell"} onChange={chg("scrollEffectMode")} kind="select" options={SCROLL_MODES} wide testId="library-item-scroll-mode" />
            {val("scrollEffectMode") === "knowledge" && (
              <>
                <ItemField editing={isEditing} field="scrollKnowledgeName" label="Knowledge" value={val("scrollKnowledgeName")} onChange={chg("scrollKnowledgeName")} testId="library-item-scroll-knowledge" />
                <ItemField editing={isEditing} field="scrollKnowledgeAttribute" label="Attribute" value={val("scrollKnowledgeAttribute") ?? "intelligence"} onChange={chg("scrollKnowledgeAttribute")} kind="select" options={opts(ATTRIBUTES)} testId="library-item-scroll-attribute" />
                <ItemField editing={isEditing} field="scrollKnowledgeValue" label="Value" value={val("scrollKnowledgeValue") ?? 0} onChange={chg("scrollKnowledgeValue")} kind="number" min={0} testId="library-item-scroll-value" />
              </>
            )}
            {val("scrollEffectMode") === "skill" && (
              <>
                <ItemField editing={isEditing} field="scrollSkillKey" label="Skill" value={val("scrollSkillKey")} onChange={chg("scrollSkillKey")} kind="select" options={v3SkillOpts} testId="library-item-scroll-skill" />
                <ItemField editing={isEditing} field="scrollSkillAmount" label="Adjustment" value={val("scrollSkillAmount") ?? 0} onChange={chg("scrollSkillAmount")} kind="number" min={-99} testId="library-item-scroll-skill-amount" />
              </>
            )}
          </CaFieldGrid>
        ))}

        {type === "spellbook" && toggleableSection("spellbook", <BookOpen className="h-3.5 w-3.5" />, "Spellbook", (
          <CaFieldGrid>
            <ItemField editing={isEditing} field="maxSpells" label="Capacity" value={val("maxSpells") ?? 10} onChange={chg("maxSpells")} kind="number" min={0} suffix="spells (0 = unlimited)" wide testId="library-item-max-spells" />
          </CaFieldGrid>
        ))}

        {type === "crafter" && isSheetGM && toggleableSection("crafting-recipes", <Hammer className="h-3.5 w-3.5" />, "Crafting Recipes", (
          !isEditing ? (
            <p className="text-xs text-stone-500 italic">Press the pencil above and switch to Edit to view and manage this crafter's recipes.</p>
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

        {isV3 && type !== "crafter" && toggleableSection("repair", <Hammer className="h-3.5 w-3.5" />, "Repair", (
          <>
            {isEditing && <p className="text-[11px] text-stone-500 mb-2">What a crafter's Repair recipe restores and consumes when it targets this item.</p>}
            <CaFieldGrid>
              <ItemField editing={isEditing} field="repairAmount" label="Durability restored" value={val("repairAmount") ?? 0} onChange={chg("repairAmount")} kind="number" min={0} wide testId="library-item-repair-amount" />
            </CaFieldGrid>
            <div className="mt-2">
              <span className="text-xs text-stone-400 block mb-1">Consumed per repair</span>
              {!isEditing ? (
                <div className="space-y-1" data-testid="library-item-repair-ingredients">
                  {(((val("repairIngredients") as any[]) || []).length === 0) ? (
                    <p className="text-[11px] text-stone-500">Nothing. Repairs cost no materials.</p>
                  ) : (
                    ((val("repairIngredients") as any[]) || []).map((ing: any, i: number) => (
                      <p key={i} className="text-xs text-stone-300">{ing.itemName || "Unnamed item"} × {ing.quantity ?? 1}</p>
                    ))
                  )}
                </div>
              ) : (
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
              )}
            </div>
          </>
        ))}

        {!!item?.isTemplate && isSheetGM && toggleableSection("build-recipe", <Hammer className="h-3.5 w-3.5" />, "Build Recipe", (
          !isEditing ? (
            <div className="space-y-1" data-testid="library-item-build-ingredients">
              {buildIngredients.length === 0 ? (
                <p className="text-[11px] text-stone-500">No build recipe set.</p>
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

        {toggleableSection("effects", <Sparkles className="h-3.5 w-3.5" />, "Effects", (
          <>
            {isEditing && (
              <p className="text-[11px] text-stone-500 mb-1">
                What holding this item does to its owner. Each one says for itself whether it needs the item equipped.
              </p>
            )}
            <TargetAmountList<CAItemEffect>
              rows={effects}
              targets={effectTargets}
              editing={isEditing}
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
          </>
        ))}

        {item?.id && liveTemplates.length > 0 && toggleableSection("roll-templates", <Layers className="h-3.5 w-3.5" />, "Roll templates", (
          <>
            <p className="text-[11px] text-stone-500 mb-1">Rolls this item inherits from a shared template.</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {liveTemplates.map((t: any) => (
                <ToggleRow
                  key={t.id}
                  label={t.name}
                  value={linkedTemplateIds.includes(t.id)}
                  editing={isEditing}
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
              ))}
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
