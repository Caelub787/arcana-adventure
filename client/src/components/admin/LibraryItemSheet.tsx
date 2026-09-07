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
 * It deliberately does not cover everything an item can carry. Roll entries,
 * template links, crafter recipes, V3 armour boosts and socketed runes are
 * their own editors with their own rules, and the full form is one button
 * away for those.
 */
import React from "react";
import { Package, Sword, Shield, Coins, Trash2, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCaInlineEdit,
  CaSheetFrame,
  CaSection,
  CaMedallion,
  CaFieldGrid,
  CaInlineField,
  CaDivider,
} from "@/components/game/CASheetUI";
import { getEffectTypes } from "@/lib/effectTypes";

const opts = (values: readonly string[], blank?: string) => [
  ...(blank === undefined ? [] : [{ value: "", label: blank }]),
  ...values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })),
];

const ITEM_TYPES = ["weapon", "armor", "consumable", "utility", "container", "ammunition", "currency", "miscellaneous"];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const CURRENCIES = ["copper", "silver", "gold", "platinum"];
const WEIGHT_CLASSES = ["light", "medium", "heavy"];
const ATTRIBUTES = ["might", "finesse", "wit", "presence", "will", "craft"];
const ARMOR_SLOTS = ["helm", "chest", "arm", "legs", "boots"];
const AOE_SHAPES = ["cone", "sphere", "line", "cube", "cylinder"];

/** A boolean is one click, not a double-click and a picker. */
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
    <label className={`flex items-center justify-between gap-2 text-xs ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="text-stone-300">{label}</span>
      <input
        type="checkbox"
        checked={!!value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-amber-600 h-3.5 w-3.5"
        data-testid={testId}
      />
    </label>
  );
}

export function LibraryItemSheet({
  item,
  systemSlug,
  canEdit = true,
  onUpdate,
  onOpenFullForm,
  onDelete,
  onClose,
}: {
  item: any;
  systemSlug: string;
  canEdit?: boolean;
  onUpdate: (updates: Record<string, any>) => void;
  onOpenFullForm: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const edit = useCaInlineEdit(onUpdate, canEdit);
  const type = String(item?.itemType || "");
  const damageTypes = getEffectTypes(systemSlug);

  return (
    <CaSheetFrame className="w-full max-w-3xl">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--ca-gilt-line-soft)" }}>
        <span className="text-sm font-bold" style={{ color: "var(--ca-gilt-bright)" }} data-testid="text-library-item-sheet-title">
          {item?.name || "Untitled Item"}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenFullForm} data-testid="button-library-item-full-form">
            <SlidersHorizontal className="h-3 w-3 mr-1" /> All settings
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-400" onClick={onDelete} data-testid="button-library-item-delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={onClose} data-testid="button-library-item-close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: "70vh" }}>
        <CaSection icon={<CaMedallion><Package className="h-3.5 w-3.5" /></CaMedallion>} title="Identity">
          <CaFieldGrid>
            <CaInlineField edit={edit} field="name" label="Name" value={item?.name} placeholder="Untitled Item" testId="library-item-name" />
            <CaInlineField edit={edit} field="itemType" label="Type" value={type} kind="select" options={opts(ITEM_TYPES)} testId="library-item-type" />
            <CaInlineField edit={edit} field="rarity" label="Rarity" value={item?.rarity} kind="select" options={opts(RARITIES)} testId="library-item-rarity" />
            <CaInlineField edit={edit} field="size" label="Size" value={item?.size} testId="library-item-size" />
            <CaInlineField edit={edit} field="description" label="Description" value={item?.description} kind="textarea" wide placeholder="What it is." testId="library-item-description" />
            <CaInlineField edit={edit} field="rules" label="Rules" value={item?.rules} kind="textarea" wide placeholder="What it does." testId="library-item-rules" />
          </CaFieldGrid>
          <div className="mt-2 space-y-1">
            <ToggleRow label="Rules visible to players" value={item?.rulesVisible ?? true} disabled={!canEdit} onChange={(v) => onUpdate({ rulesVisible: v })} testId="toggle-library-item-rules-visible" />
          </div>
        </CaSection>

        <CaDivider />

        <CaSection icon={<CaMedallion><Coins className="h-3.5 w-3.5" /></CaMedallion>} title="Handling">
          <CaFieldGrid>
            <CaInlineField edit={edit} field="quantity" label="Quantity" value={item?.quantity ?? 1} kind="number" min={0} testId="library-item-quantity" />
            <CaInlineField edit={edit} field="itemWeight" label="Weight" value={item?.itemWeight ?? 0} kind="number" min={0} suffix="lb" testId="library-item-weight" />
            <CaInlineField edit={edit} field="price" label="Price" value={item?.price ?? 0} kind="number" min={0} testId="library-item-price" />
            <CaInlineField edit={edit} field="currency" label="Currency" value={item?.currency} kind="select" options={opts(CURRENCIES)} testId="library-item-currency" />
            <CaInlineField edit={edit} field="durability" label="Durability" value={item?.durability ?? 10} kind="number" min={0} testId="library-item-durability" />
            <CaInlineField edit={edit} field="maxDurability" label="Max durability" value={item?.maxDurability ?? 10} kind="number" min={0} testId="library-item-max-durability" />
            <CaInlineField edit={edit} field="weight" label="Weight class" value={item?.weight} kind="select" options={opts(WEIGHT_CLASSES)} testId="library-item-weight-class" />
            <CaInlineField edit={edit} field="carryCapacity" label="Carry capacity" value={item?.carryCapacity ?? 0} kind="number" min={0} testId="library-item-carry-capacity" />
          </CaFieldGrid>
          <div className="mt-2 space-y-1">
            <ToggleRow label="Container" value={!!item?.isContainer} disabled={!canEdit} onChange={(v) => onUpdate({ isContainer: v })} testId="toggle-library-item-container" />
          </div>
        </CaSection>

        {(type === "weapon" || type === "consumable" || type === "ammunition") && (
          <>
            <CaDivider />
            <CaSection icon={<CaMedallion><Sword className="h-3.5 w-3.5" /></CaMedallion>} title="Attack">
              <CaFieldGrid>
                <CaInlineField edit={edit} field="damage" label="Damage" value={item?.damage} placeholder="1d8" testId="library-item-damage" />
                <CaInlineField edit={edit} field="damageType" label="Damage type" value={item?.damageType} kind="select" options={opts(damageTypes, "None")} testId="library-item-damage-type" />
                <CaInlineField edit={edit} field="mod" label="Modifier" value={item?.mod ?? 0} kind="number" min={-99} testId="library-item-mod" />
                <CaInlineField edit={edit} field="range" label="Range" value={item?.range ?? 0} kind="number" min={0} suffix="ft" testId="library-item-range" />
                <CaInlineField edit={edit} field="attribute" label="Attribute" value={item?.attribute} kind="select" options={opts(ATTRIBUTES, "None")} testId="library-item-attribute" />
                <CaInlineField edit={edit} field="aoe" label="Area" value={item?.aoe} kind="select" options={opts(AOE_SHAPES, "None")} testId="library-item-aoe" />
              </CaFieldGrid>
              <div className="mt-2 space-y-1">
                <ToggleRow label="Heavy (two-handed)" value={!!item?.isHeavy} disabled={!canEdit} onChange={(v) => onUpdate({ isHeavy: v })} testId="toggle-library-item-heavy" />
                <ToggleRow label="Can apply token effects" value={!!item?.canApplyEffects} disabled={!canEdit} onChange={(v) => onUpdate({ canApplyEffects: v })} testId="toggle-library-item-effects" />
              </div>
            </CaSection>
          </>
        )}

        {type === "armor" && (
          <>
            <CaDivider />
            <CaSection icon={<CaMedallion><Shield className="h-3.5 w-3.5" /></CaMedallion>} title="Protection">
              <CaFieldGrid>
                <CaInlineField edit={edit} field="armorSlot" label="Slot" value={item?.armorSlot} kind="select" options={opts(ARMOR_SLOTS, "None")} testId="library-item-armor-slot" />
                <CaInlineField edit={edit} field="armorBonus" label="DC bonus" value={item?.armorBonus ?? 0} kind="number" min={0} testId="library-item-armor-bonus" />
                <CaInlineField edit={edit} field="damageReduction" label="Damage reduction" value={item?.damageReduction ?? 0} kind="number" min={0} testId="library-item-damage-reduction" />
                <CaInlineField edit={edit} field="damageReductionType" label="Reduces" value={item?.damageReductionType} kind="select" options={opts(damageTypes, "All")} testId="library-item-damage-reduction-type" />
              </CaFieldGrid>
            </CaSection>
          </>
        )}
      </div>
    </CaSheetFrame>
  );
}
