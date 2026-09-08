/**
 * A library item, laid out as a sheet you edit in place.
 *
 * Creating an item used to mean filling in a form before the item existed:
 * thirty fields, most of them irrelevant to whatever you were making, and no
 * way to see what you had until you saved. This is the character sheet's
 * arrangement instead - the row is created blank the moment you ask for one,
 * and every value is changed by double-clicking it (long-pressing on touch)
 * and writes only itself.
 *
 * Everything an item carries is here. The sections after Handling appear only
 * for the kind of item they belong to, so a utility item is eight fields and a
 * rune is the eight plus the six that make it a rune - rather than one long
 * form where most of it is inert. There is no "advanced" button hiding the
 * rest: a setting you cannot find is a setting you do not have.
 *
 * Two things are deliberately absent, neither of them authoring:
 * `socketedRunes` is what has been socketed into this item during play, and
 * the legacy per-coin price columns were superseded by the price/currency
 * pair above.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package, Sword, Shield, Coins, Trash2, X, Sparkles, ImageIcon,
  FlaskConical, Crosshair, Gem, ScrollText, BookOpen, Hammer, Dices, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import {
  useCaInlineEdit,
  CaSheetFrame,
  CaSection,
  CaFieldGrid,
  CaInlineField,
  CaDivider,
  type CaInlineEdit,
} from "@/components/game/CASheetUI";
import { RollEntriesEditor } from "@/components/game/RollEntriesEditor";
import { getEffectTypes } from "@/lib/effectTypes";
import { useImageBrowserBridge } from "@/lib/library-dialog-bridges";
import {
  CA_ITEM_EFFECT_TRIGGERS,
  CA_ITEM_EFFECT_TRIGGER_LABELS,
  makeCAItemEffect,
  normalizeCAItemEffects,
  type CAItemEffect,
} from "@shared/ca";
import { isWoundSystem, woundSystemRules } from "@shared/systemRules";
import { V3_SKILLS, V3_RUNE_TARGET_ITEM_TYPES, V3_RUNE_STAT_TARGETS } from "@shared/v3";

const opts = (values: readonly string[], blank?: string) => [
  ...(blank === undefined ? [] : [{ value: "", label: blank }]),
  ...values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })),
];

/**
 * What a new item may be set to, matching what the old form offered: crafters
 * are V2 and V3, spellbooks and miscellaneous are V3 only. Runes, scrolls and
 * currency are made by their own flows rather than picked here, so they are
 * not on the list - but an item that already is one keeps showing as one,
 * because a select that cannot represent its own value is worse than a long
 * list.
 */
const ITEM_TYPES_BASE = ["weapon", "ammunition", "armor", "consumable", "utility", "container"];
function itemTypeOptions(systemSlug: string, current: string) {
  const list = [...ITEM_TYPES_BASE];
  if (systemSlug === "aa-v2" || systemSlug === "aa-v3") list.push("crafter");
  if (systemSlug === "aa-v3") list.push("spellbook", "miscellaneous");
  if (current && !list.includes(current)) list.push(current);
  return opts(list);
}
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const CURRENCIES = ["copper", "silver", "gold", "platinum"];
const WEIGHT_CLASSES = ["light", "medium", "heavy"];
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

/**
 * A boolean is one click, not a double-click and a picker.
 *
 * The box sits against its label rather than out at the right margin: with
 * two or three of these stacked, a column of boxes a hand's width from the
 * words meant working out which belonged to which.
 */
function ToggleRow({
  label,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <label className={`flex items-center gap-2 text-xs w-fit ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={!!value}
        disabled={disabled}
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
 * effects - and they differ only in what may be targeted and whether a row
 * carries a trigger.
 */
function TargetAmountList<T extends { target: string; amount: number }>({
  rows,
  targets,
  canEdit,
  onChange,
  makeRow,
  emptyText,
  idOf,
  renderLead,
  testId,
}: {
  rows: T[];
  targets: Array<{ value: string; label: string; group?: string }>;
  canEdit: boolean;
  onChange: (next: T[]) => void;
  makeRow: () => T;
  emptyText: string;
  idOf: (row: T, index: number) => string;
  renderLead?: (row: T, patch: (p: Partial<T>) => void) => React.ReactNode;
  testId: string;
}) {
  const groups = Array.from(new Set(targets.map((t) => t.group ?? "")));
  const known = new Set(targets.map((t) => t.value));
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
              disabled={!canEdit}
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
              disabled={!canEdit}
              onChange={(e) => patch({ amount: Math.round(Number(e.target.value) || 0) } as Partial<T>)}
              className="w-16 h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
              data-testid={`${testId}-${id}-amount`}
            />
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="text-stone-500 hover:text-red-400 shrink-0 disabled:opacity-40"
              data-testid={`${testId}-${id}-remove`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      {canEdit && (
        <button
          type="button"
          className="text-[11px] text-amber-500 hover:text-amber-400"
          onClick={() => onChange([...rows, makeRow()])}
          data-testid={`${testId}-add`}
        >
          + Add
        </button>
      )}
    </div>
  );
}

export function LibraryItemSheet({
  item,
  systemSlug,
  personal = false,
  canEdit = true,
  onUpdate,
  onDelete,
  onClose,
}: {
  item: any;
  systemSlug: string;
  /** Scopes the V3 lookup lists to the viewer's own library. */
  personal?: boolean;
  canEdit?: boolean;
  onUpdate: (updates: Record<string, any>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const edit = useCaInlineEdit(onUpdate, canEdit);
  const type = String(item?.itemType || "");
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
    if (!canEdit) return;
    const picked = await imagePicker({ title: "Item Image" });
    if (picked?.url) onUpdate({ image: picked.url });
  };

  const effects = normalizeCAItemEffects(item?.effects);
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

  const section = (icon: React.ReactNode, title: string, body: React.ReactNode) => (
    <>
      <CaDivider />
      <CaSection icon={icon} title={title}>{body}</CaSection>
    </>
  );

  return (
    <CaSheetFrame className="w-full max-w-3xl">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--ca-gilt-line-soft)" }}>
        <span className="text-sm font-bold" style={{ color: "var(--ca-gilt-bright)" }} data-testid="text-library-item-sheet-title">
          {item?.name || "Untitled Item"}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-400" onClick={onDelete} data-testid="button-library-item-delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={onClose} data-testid="button-library-item-close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: "70vh" }}>
        <CaSection icon={<Package className="h-3.5 w-3.5" />} title="Identity">
          <div className="flex gap-3 items-start">
            {/* The picture, in the same ringed square a character's portrait
                gets, so an item and a character read as the same kind of
                thing. */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={pickImage}
                disabled={!canEdit}
                className="relative w-20 h-20 rounded-xl p-[2px] block disabled:cursor-default"
                style={{ background: "linear-gradient(135deg, var(--ca-gilt) 0%, var(--ca-gilt-dim) 45%, var(--ca-gilt-bright) 100%)" }}
                aria-label={item?.image ? "Change item image" : "Add an item image"}
                title={canEdit ? "Click to choose an image" : undefined}
                data-testid="button-library-item-image"
              >
                <span className="w-full h-full rounded-[10px] overflow-hidden bg-stone-800 flex items-center justify-center">
                  {item?.image ? (
                    <img src={item.image} alt="" className="w-full h-full object-cover" data-testid="img-library-item" />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-stone-600" />
                  )}
                </span>
              </button>
              {canEdit && item?.image && (
                <button
                  type="button"
                  onClick={() => onUpdate({ image: null })}
                  className="mt-1 w-full text-[10px] text-stone-500 hover:text-red-400"
                  data-testid="button-library-item-image-clear"
                >
                  Remove
                </button>
              )}
            </div>
            <CaFieldGrid className="flex-1 min-w-0">
              <CaInlineField edit={edit} field="name" label="Name" value={item?.name} placeholder="Untitled Item" testId="library-item-name" />
              <CaInlineField edit={edit} field="itemType" label="Type" value={type} kind="select" options={itemTypeOptions(systemSlug, type)} testId="library-item-type" />
              <CaInlineField edit={edit} field="rarity" label="Rarity" value={item?.rarity} kind="select" options={opts(RARITIES)} testId="library-item-rarity" />
              <CaInlineField edit={edit} field="size" label="Size" value={item?.size} testId="library-item-size" />
              <CaInlineField edit={edit} field="description" label="Description" value={item?.description} kind="textarea" wide placeholder="What it is." testId="library-item-description" />
              <CaInlineField edit={edit} field="rules" label="Rules" value={item?.rules} kind="textarea" wide placeholder="What it does." testId="library-item-rules" />
            </CaFieldGrid>
          </div>
          <div className="mt-2 space-y-1">
            <ToggleRow label="Rules visible to players" value={item?.rulesVisible ?? true} disabled={!canEdit} onChange={(v) => onUpdate({ rulesVisible: v })} testId="toggle-library-item-rules-visible" />
          </div>
        </CaSection>

        {section(<Coins className="h-3.5 w-3.5" />, "Handling", (
          <>
            <CaFieldGrid>
              <CaInlineField edit={edit} field="quantity" label="Quantity" value={item?.quantity ?? 1} kind="number" min={0} testId="library-item-quantity" />
              <CaInlineField edit={edit} field="itemWeight" label="Weight" value={item?.itemWeight ?? 0} kind="number" min={0} suffix="lb" testId="library-item-weight" />
              <CaInlineField edit={edit} field="price" label="Price" value={item?.price ?? 0} kind="number" min={0} testId="library-item-price" />
              <CaInlineField edit={edit} field="currency" label="Currency" value={item?.currency} kind="select" options={opts(CURRENCIES)} testId="library-item-currency" />
              <CaInlineField edit={edit} field="durability" label="Durability" value={item?.durability ?? 10} kind="number" min={0} testId="library-item-durability" />
              <CaInlineField edit={edit} field="maxDurability" label="Max durability" value={item?.maxDurability ?? 10} kind="number" min={0} testId="library-item-max-durability" />
              <CaInlineField edit={edit} field="weight" label="Weight class" value={item?.weight} kind="select" options={opts(WEIGHT_CLASSES)} testId="library-item-weight-class" />
              <CaInlineField edit={edit} field="carryCapacity" label="Carry capacity" value={item?.carryCapacity ?? 0} kind="number" min={0} testId="library-item-carry-capacity" />
              {isV3 && (
                <CaInlineField
                  edit={edit}
                  field="advancedItemTypeId"
                  label="Advanced item type"
                  value={item?.advancedItemTypeId}
                  kind="select"
                  options={[{ value: "", label: "None" }, ...(advancedTypes as any[]).map((t) => ({ value: t.id, label: t.name }))]}
                  testId="library-item-advanced-type"
                />
              )}
            </CaFieldGrid>
            <div className="mt-2 space-y-1">
              <ToggleRow label="Container" value={!!item?.isContainer} disabled={!canEdit} onChange={(v) => onUpdate({ isContainer: v })} testId="toggle-library-item-container" />
              {/* Two-handedness is how the item is held, not how it hits, so
                  it stays behind when C.A. drops the Attack block. */}
              {isCA && type === "weapon" && (
                <ToggleRow label="Heavy (two-handed)" value={!!item?.isHeavy} disabled={!canEdit} onChange={(v) => onUpdate({ isHeavy: v })} testId="toggle-library-item-heavy" />
              )}
            </div>
          </>
        ))}

        {!isCA && (type === "weapon" || type === "consumable" || type === "ammunition") && section(<Sword className="h-3.5 w-3.5" />, "Attack", (
          <>
            <CaFieldGrid>
              <CaInlineField edit={edit} field="damage" label="Damage" value={item?.damage} placeholder="1d8" testId="library-item-damage" />
              <CaInlineField edit={edit} field="damageType" label="Damage type" value={item?.damageType} kind="select" options={opts(damageTypes, "None")} testId="library-item-damage-type" />
              <CaInlineField edit={edit} field="mod" label="Modifier" value={item?.mod ?? 0} kind="number" min={-99} testId="library-item-mod" />
              <CaInlineField edit={edit} field="range" label="Range" value={item?.range ?? 0} kind="number" min={0} suffix="ft" testId="library-item-range" />
              <CaInlineField edit={edit} field="attribute" label="Attribute" value={item?.attribute} kind="select" options={opts(ATTRIBUTES, "None")} testId="library-item-attribute" />
              <CaInlineField edit={edit} field="aoe" label="Area" value={item?.aoe} kind="select" options={opts(AOE_SHAPES, "None")} testId="library-item-aoe" />
              {type === "weapon" && (
                <CaInlineField edit={edit} field="weaponCategory" label="Weapon category" value={item?.weaponCategory} placeholder="bow, sling…" testId="library-item-weapon-category" />
              )}
              {isV3 && type === "weapon" && (
                <CaInlineField
                  edit={edit}
                  field="ammunitionTypeId"
                  label="Uses ammunition"
                  value={item?.ammunitionTypeId}
                  kind="select"
                  options={[{ value: "", label: "None (melee)" }, ...(ammoTypes as any[]).map((t) => ({ value: t.id, label: t.name }))]}
                  testId="library-item-uses-ammo"
                />
              )}
            </CaFieldGrid>
            <div className="mt-2 space-y-1">
              <ToggleRow label="Heavy (two-handed)" value={!!item?.isHeavy} disabled={!canEdit} onChange={(v) => onUpdate({ isHeavy: v })} testId="toggle-library-item-heavy" />
              <ToggleRow label="Can apply token effects" value={!!item?.canApplyEffects} disabled={!canEdit} onChange={(v) => onUpdate({ canApplyEffects: v })} testId="toggle-library-item-effects" />
            </div>
            {isV3 && type === "weapon" && (techniqueGroups as any[]).length > 0 && (
              <div className="mt-2">
                <span className="text-xs text-stone-400 block mb-1">Technique groups</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(techniqueGroups as any[]).map((g) => {
                    const on = ((item?.v3TechniqueGroupIds as string[]) || []).includes(g.id);
                    return (
                      <ToggleRow
                        key={g.id}
                        label={g.name}
                        value={on}
                        disabled={!canEdit}
                        onChange={(next) => {
                          const current = (item?.v3TechniqueGroupIds as string[]) || [];
                          onUpdate({ v3TechniqueGroupIds: next ? [...current, g.id] : current.filter((x) => x !== g.id) });
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

        {type === "armor" && section(<Shield className="h-3.5 w-3.5" />, "Protection", (
          <>
            <CaFieldGrid>
              <CaInlineField edit={edit} field="armorSlot" label="Slot" value={item?.armorSlot} kind="select" options={opts(ARMOR_SLOTS, "None")} testId="library-item-armor-slot" />
              <CaInlineField edit={edit} field="armorBonus" label="DC bonus" value={item?.armorBonus ?? 0} kind="number" min={0} testId="library-item-armor-bonus" />
              <CaInlineField edit={edit} field="damageReduction" label="Damage reduction" value={item?.damageReduction ?? 0} kind="number" min={0} testId="library-item-damage-reduction" />
              <CaInlineField edit={edit} field="damageReductionType" label="Reduces" value={item?.damageReductionType} kind="select" options={opts(damageTypes, "All")} testId="library-item-damage-reduction-type" />
              {item?.grantsDcBonus && (
                <CaInlineField edit={edit} field="dcBonusValue" label="Granted DC bonus" value={item?.dcBonusValue ?? 0} kind="number" min={0} testId="library-item-dc-bonus-value" />
              )}
            </CaFieldGrid>
            <div className="mt-2 space-y-1">
              <ToggleRow label="Grants a DC bonus" value={!!item?.grantsDcBonus} disabled={!canEdit} onChange={(v) => onUpdate({ grantsDcBonus: v })} testId="toggle-library-item-grants-dc" />
            </div>
            {isV3 && (
              <div className="mt-2">
                <span className="text-xs text-stone-400 block mb-1">Attribute and skill boosts while worn</span>
                <TargetAmountList
                  rows={((item?.v3ArmorBoosts as any[]) || []) as Array<{ target: string; amount: number }>}
                  targets={effectTargets}
                  canEdit={canEdit}
                  onChange={(next) => onUpdate({ v3ArmorBoosts: next })}
                  makeRow={() => ({ target: effectTargets[0]?.value ?? "", amount: 0 })}
                  emptyText="No boosts."
                  idOf={(_r, i) => String(i)}
                  testId="library-item-armor-boosts"
                />
              </div>
            )}
          </>
        ))}

        {type === "consumable" && section(<FlaskConical className="h-3.5 w-3.5" />, "When used", (
          <>
            <CaFieldGrid>
              <CaInlineField edit={edit} field="rationServings" label="Ration servings" value={item?.rationServings ?? 0} kind="number" min={0} testId="library-item-ration-servings" />
              {/* The stat changes and the detonation are a roll wearing a
                  different hat - C.A. writes them as rolls instead. */}
              {!isCA && (
                <>
                  <CaInlineField edit={edit} field="consumableHpChange" label="HP change" value={item?.consumableHpChange ?? 0} kind="number" min={-999} testId="library-item-hp-change" />
                  <CaInlineField edit={edit} field="consumableEnergyChange" label="Energy change" value={item?.consumableEnergyChange ?? 0} kind="number" min={-999} testId="library-item-energy-change" />
                  <CaInlineField edit={edit} field="consumableManaChange" label="Mana change" value={item?.consumableManaChange ?? 0} kind="number" min={-999} testId="library-item-mana-change" />
                </>
              )}
              <CaInlineField edit={edit} field="consumableEffectDescription" label="Effect" value={item?.consumableEffectDescription} kind="textarea" wide placeholder="What happens when it is used." testId="library-item-consumable-effect" />
              {!isCA && item?.isDetonatable && (
                <>
                  <CaInlineField edit={edit} field="detonateAoeShape" label="Detonation area" value={item?.detonateAoeShape} kind="select" options={opts(AOE_SHAPES, "None")} testId="library-item-detonate-shape" />
                  <CaInlineField edit={edit} field="detonateAoeRange" label="Detonation range" value={item?.detonateAoeRange ?? 15} kind="number" min={0} suffix="ft" testId="library-item-detonate-range" />
                </>
              )}
            </CaFieldGrid>
            {!isCA && (
              <div className="mt-2 space-y-1">
                <ToggleRow label="Rolls like a weapon" value={!!item?.isDamaging} disabled={!canEdit} onChange={(v) => onUpdate({ isDamaging: v })} testId="toggle-library-item-damaging" />
                <ToggleRow label="Can be detonated" value={!!item?.isDetonatable} disabled={!canEdit} onChange={(v) => onUpdate({ isDetonatable: v })} testId="toggle-library-item-detonatable" />
              </div>
            )}
          </>
        ))}

        {type === "ammunition" && section(<Crosshair className="h-3.5 w-3.5" />, "Ammunition", (
          <CaFieldGrid>
            <CaInlineField edit={edit} field="ammunitionType" label="Ammunition type" value={item?.ammunitionType} placeholder="arrow, bolt…" testId="library-item-ammo-type" />
            <CaInlineField edit={edit} field="breakChance" label="Break chance" value={item?.breakChance ?? 10} kind="number" min={0} max={100} suffix="%" testId="library-item-break-chance" />
            {isV3 && (
              <CaInlineField
                edit={edit}
                field="ammunitionTypeId"
                label="V3 type"
                value={item?.ammunitionTypeId}
                kind="select"
                options={[{ value: "", label: "None" }, ...(ammoTypes as any[]).map((t) => ({ value: t.id, label: t.name }))]}
                testId="library-item-ammo-type-id"
              />
            )}
          </CaFieldGrid>
        ))}

        {type === "rune" && section(<Gem className="h-3.5 w-3.5" />, "Rune", (
          <>
            <CaFieldGrid>
              <CaInlineField edit={edit} field="runeTargetItemType" label="Sockets into" value={item?.runeTargetItemType ?? "any"} kind="select" options={V3_RUNE_TARGET_ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))} testId="library-item-rune-target" />
              <CaInlineField edit={edit} field="runeRemoveDurabilityCost" label="Removal cost" value={item?.runeRemoveDurabilityCost ?? 1} kind="number" min={0} suffix="max durability" testId="library-item-rune-remove-cost" />
              <CaInlineField edit={edit} field="runeUseMode" label="Use" value={item?.runeUseMode ?? "none"} kind="select" options={RUNE_USE_MODES} testId="library-item-rune-use-mode" />
              <CaInlineField edit={edit} field="runeWeaponDamageLevelBonus" label="Weapon damage levels" value={item?.runeWeaponDamageLevelBonus ?? 0} kind="number" min={0} testId="library-item-rune-damage-levels" />
              {item?.runeUseMode === "skill_check" && (
                <>
                  <CaInlineField edit={edit} field="runeSkillKey" label="Skill" value={item?.runeSkillKey} kind="select" options={v3SkillOpts} testId="library-item-rune-skill" />
                  <CaInlineField edit={edit} field="runeSkillAdjustment" label="Skill adjustment" value={item?.runeSkillAdjustment ?? 0} kind="number" min={-99} testId="library-item-rune-skill-adjustment" />
                </>
              )}
            </CaFieldGrid>
            <div className="mt-2 space-y-1">
              <ToggleRow label="Cannot be removed once socketed" value={!!item?.runeUnremovable} disabled={!canEdit} onChange={(v) => onUpdate({ runeUnremovable: v })} testId="toggle-library-item-rune-unremovable" />
            </div>
            <div className="mt-2">
              <span className="text-xs text-stone-400 block mb-1">What it does to the host item</span>
              <TargetAmountList
                rows={((item?.runeStatEffects as any[]) || []) as Array<{ target: string; amount: number }>}
                targets={V3_RUNE_STAT_TARGETS.map((t) => ({ value: t.value, label: t.label }))}
                canEdit={canEdit}
                onChange={(next) => onUpdate({ runeStatEffects: next })}
                makeRow={() => ({ target: V3_RUNE_STAT_TARGETS[0].value, amount: 0 })}
                emptyText="No stat changes."
                idOf={(_r, i) => String(i)}
                testId="library-item-rune-stats"
              />
            </div>
          </>
        ))}

        {type === "scroll" && section(<ScrollText className="h-3.5 w-3.5" />, "Scroll", (
          <CaFieldGrid>
            <CaInlineField edit={edit} field="scrollEffectMode" label="Does" value={item?.scrollEffectMode ?? "spell"} kind="select" options={SCROLL_MODES} wide testId="library-item-scroll-mode" />
            {item?.scrollEffectMode === "knowledge" && (
              <>
                <CaInlineField edit={edit} field="scrollKnowledgeName" label="Knowledge" value={item?.scrollKnowledgeName} testId="library-item-scroll-knowledge" />
                <CaInlineField edit={edit} field="scrollKnowledgeAttribute" label="Attribute" value={item?.scrollKnowledgeAttribute ?? "intelligence"} kind="select" options={opts(ATTRIBUTES)} testId="library-item-scroll-attribute" />
                <CaInlineField edit={edit} field="scrollKnowledgeValue" label="Value" value={item?.scrollKnowledgeValue ?? 0} kind="number" min={0} testId="library-item-scroll-value" />
              </>
            )}
            {item?.scrollEffectMode === "skill" && (
              <>
                <CaInlineField edit={edit} field="scrollSkillKey" label="Skill" value={item?.scrollSkillKey} kind="select" options={v3SkillOpts} testId="library-item-scroll-skill" />
                <CaInlineField edit={edit} field="scrollSkillAmount" label="Adjustment" value={item?.scrollSkillAmount ?? 0} kind="number" min={-99} testId="library-item-scroll-skill-amount" />
              </>
            )}
          </CaFieldGrid>
        ))}

        {type === "spellbook" && section(<BookOpen className="h-3.5 w-3.5" />, "Spellbook", (
          <CaFieldGrid>
            <CaInlineField edit={edit} field="maxSpells" label="Capacity" value={item?.maxSpells ?? 10} kind="number" min={0} suffix="spells (0 = unlimited)" wide testId="library-item-max-spells" />
          </CaFieldGrid>
        ))}

        {type === "crafter" && section(<Hammer className="h-3.5 w-3.5" />, "Repair", (
          <>
            <CaFieldGrid>
              <CaInlineField edit={edit} field="repairAmount" label="Durability restored" value={item?.repairAmount ?? 0} kind="number" min={0} wide testId="library-item-repair-amount" />
            </CaFieldGrid>
            <div className="mt-2">
              <span className="text-xs text-stone-400 block mb-1">Consumed per repair</span>
              <div className="space-y-1" data-testid="library-item-repair-ingredients">
                {(((item?.repairIngredients as any[]) || []).length === 0) && (
                  <p className="text-[11px] text-stone-500">Nothing. Repairs cost no materials.</p>
                )}
                {((item?.repairIngredients as any[]) || []).map((ing: any, i: number) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      value={ing.itemName ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = [...((item?.repairIngredients as any[]) || [])];
                        next[i] = { ...next[i], itemName: e.target.value };
                        onUpdate({ repairIngredients: next });
                      }}
                      placeholder="Item name"
                      className="h-7 flex-1 min-w-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                      data-testid={`library-item-repair-ingredient-${i}-name`}
                    />
                    <input
                      type="number"
                      value={ing.quantity ?? 1}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = [...((item?.repairIngredients as any[]) || [])];
                        next[i] = { ...next[i], quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) };
                        onUpdate({ repairIngredients: next });
                      }}
                      className="w-16 h-7 shrink-0 rounded border border-stone-700 bg-stone-800 text-stone-200 text-xs px-1.5"
                      data-testid={`library-item-repair-ingredient-${i}-qty`}
                    />
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onUpdate({ repairIngredients: ((item?.repairIngredients as any[]) || []).filter((_: any, j: number) => j !== i) })}
                      className="text-stone-500 hover:text-red-400 shrink-0 disabled:opacity-40"
                      data-testid={`library-item-repair-ingredient-${i}-remove`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {canEdit && (
                  <button
                    type="button"
                    className="text-[11px] text-amber-500 hover:text-amber-400"
                    onClick={() => onUpdate({ repairIngredients: [...((item?.repairIngredients as any[]) || []), { itemId: null, itemName: "", quantity: 1 }] })}
                    data-testid="library-item-repair-ingredient-add"
                  >
                    + Add ingredient
                  </button>
                )}
              </div>
            </div>
          </>
        ))}

        {section(<Sparkles className="h-3.5 w-3.5" />, "Effects", (
          <>
            <p className="text-[11px] text-stone-500 mb-1">
              What holding this item does to its owner. Each one says for itself whether it needs the item equipped.
            </p>
            <TargetAmountList<CAItemEffect>
              rows={effects}
              targets={effectTargets}
              canEdit={canEdit}
              onChange={(next) => onUpdate({ effects: next })}
              makeRow={() => makeCAItemEffect()}
              emptyText="No effects. This item changes nothing on its own."
              idOf={(row) => row.id}
              renderLead={(row, patch) => (
                <select
                  value={row.trigger}
                  disabled={!canEdit}
                  onChange={(e) => patch({ trigger: e.target.value as CAItemEffect["trigger"] })}
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
        ))}

        {item?.id && liveTemplates.length > 0 && section(<Layers className="h-3.5 w-3.5" />, "Roll templates", (
          <>
            <p className="text-[11px] text-stone-500 mb-1">Rolls this item inherits from a shared template.</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {liveTemplates.map((t: any) => (
                <ToggleRow
                  key={t.id}
                  label={t.name}
                  value={linkedTemplateIds.includes(t.id)}
                  disabled={!canEdit}
                  onChange={(next) => {
                    const ids = next
                      ? [...linkedTemplateIds, t.id]
                      : linkedTemplateIds.filter((x) => x !== t.id);
                    // Its own endpoint and its own cache entry, so it writes
                    // itself the way every other value on this sheet does.
                    api.setItemTemplateLinks(item.id, ids).then(() => onUpdate({}));
                  }}
                  testId={`toggle-library-item-template-${t.id}`}
                />
              ))}
            </div>
          </>
        ))}

        {item?.id && section(<Dices className="h-3.5 w-3.5" />, "Rolls", (
          <RollEntriesEditor
            ownerType="item"
            ownerId={item.id}
            canEdit={canEdit}
            campaignSystem={systemSlug}
          />
        ))}
      </div>
      {imageBrowser}
    </CaSheetFrame>
  );
}
