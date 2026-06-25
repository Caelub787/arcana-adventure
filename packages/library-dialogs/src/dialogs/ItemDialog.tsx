/**
 * <ItemDialog>
 *
 * Full create/edit dialog for the `items` table. Mirrors Arcana's
 * AdminSettings ItemFormDialog field-set, including the conditional
 * branches for weapon / ammunition / armor / consumable / utility /
 * container / currency / crafter (AAv2 and AAv3).
 *
 * Save flow: bundles `rolls`, `craftRecipes`, and `templateLinks` into
 * a single transport upsert payload. The host's children-aware write path
 * persists the rolls; `templateLinks` is forwarded for link table writes.
 *
 * Load flow: hydrates from the enriched GET response (rolls, recipes,
 * templateLinks).
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section, Panel,
} from "../ui/primitives";
import { HostModal, SaveCancelFooter } from "../ui/DefaultModal";
import { RollEntriesEditor, type RollEntryDraft } from "../components/RollEntriesEditor";
import { CraftRecipesEditor, type CraftRecipeDraft } from "../components/CraftRecipesEditor";
import { ItemBuildRecipeEditor, type BuildRecipeDraft } from "../components/ItemBuildRecipeEditor";
import { ItemTemplateLinksPanel } from "../components/ItemTemplateLinksPanel";
import { EntityPickerModal } from "../components/EntityPickerModal";
import { isAAv2, AAV2_EFFECT_TYPES, LEGACY_DAMAGE_TYPES } from "../lib/effectTypes";
import { optionalNum } from "../lib/utils";
import type { DialogProps } from "../types";

const ITEM_TYPES = [
  "weapon", "ammunition", "armor", "consumable",
  "utility", "container", "currency", "crafter", "spellbook", "scroll", "rune", "miscellaneous",
] as const;

// AA V3 scroll effect modes (mirrors shared/schema scrollEffectMode).
const V3_SCROLL_EFFECT_MODES: { value: string; label: string }[] = [
  { value: "spell", label: "Cast Spell" },
  { value: "knowledge", label: "Grant Knowledge" },
  { value: "skill", label: "Boost Skill" },
];
// AA V3 rune host-item targets (mirrors V3_RUNE_TARGET_ITEM_TYPES in shared/v3.ts).
const V3_RUNE_TARGET_ITEM_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "any", label: "Any item" },
  { value: "weapon", label: "Weapon" },
  { value: "armor", label: "Armor" },
  { value: "consumable", label: "Consumable" },
  { value: "utility", label: "Utility" },
  { value: "container", label: "Container" },
];
// AA V3 rune stat-effect targets (mirrors V3_RUNE_STAT_TARGETS in shared/v3.ts).
const V3_RUNE_STAT_TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "carryCapacity", label: "Carry Capacity" },
  { value: "range", label: "Range (ft)" },
  { value: "price", label: "Price" },
  { value: "itemWeight", label: "Weight (lb)" },
];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
const CURRENCIES = ["copper", "silver", "gold", "platinum"] as const;
const ARMOR_SLOTS = ["helm", "chest", "arm", "legs", "boots"] as const;

// AA V3 rune-slot count by rarity (mirrors v3RuneSlotCount in shared/v3.ts).
// Inlined because this package has no shared imports.
const V3_RUNE_SLOTS_BY_RARITY: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
};
const v3RuneSlots = (rarity?: string | null): number =>
  V3_RUNE_SLOTS_BY_RARITY[(rarity ?? "common").toLowerCase()] ?? 0;
const V3_RUNE_STAT_COLUMN_SET = new Set(V3_RUNE_STAT_TARGET_OPTIONS.map(o => o.value));

// A socketed-rune snapshot baked onto a host item (mirrors V3SocketedRune in shared/v3.ts).
interface SocketedRuneSnapshot {
  slotIndex: number;
  runeItemId: string | null;
  name: string;
  image: string | null;
  description: string | null;
  statEffects: { target: string; amount: number }[];
  useMode: string;
  skillKey: string | null;
  skillAdjustment: number;
  weaponDamageLevelBonus: number;
  removable: boolean;
  removeDurabilityCost: number;
}

function runeItemToSnapshot(rune: any, slotIndex: number): SocketedRuneSnapshot {
  return {
    slotIndex,
    runeItemId: rune?.id ?? null,
    name: rune?.name ?? "Rune",
    image: rune?.image ?? null,
    description: rune?.description ?? null,
    statEffects: Array.isArray(rune?.runeStatEffects) ? rune.runeStatEffects : [],
    useMode: rune?.runeUseMode || "none",
    skillKey: rune?.runeSkillKey ?? null,
    skillAdjustment: Math.trunc(Number(rune?.runeSkillAdjustment) || 0),
    weaponDamageLevelBonus: Math.trunc(Number(rune?.runeWeaponDamageLevelBonus) || 0),
    removable: !rune?.runeUnremovable,
    removeDurabilityCost: Math.trunc(Number(rune?.runeRemoveDurabilityCost) || 0),
  };
}

// Returns the host-field deltas (socketedRunes + baked stat columns) for
// attaching a rune, or an error string. Pure; does not mutate the draft.
function attachRuneToDraft(draft: ItemDraft, rune: any): { error?: string; updates?: Partial<ItemDraft> } {
  if (!rune || rune.itemType !== "rune") return { error: "That item is not a rune" };
  const target = rune.runeTargetItemType || "any";
  if (target !== "any" && target !== draft.itemType) {
    return { error: `This rune only fits ${target} items` };
  }
  const slots = v3RuneSlots(draft.rarity);
  const socketed: SocketedRuneSnapshot[] = Array.isArray(draft.socketedRunes) ? [...draft.socketedRunes] : [];
  if (socketed.length >= slots) {
    return { error: slots === 0 ? "This rarity has no rune slots" : "No free rune slots" };
  }
  const used = new Set(socketed.map(r => r.slotIndex));
  let slotIndex = 0;
  while (used.has(slotIndex)) slotIndex++;
  const snap = runeItemToSnapshot(rune, slotIndex);
  const updates: any = { socketedRunes: [...socketed, snap] };
  for (const e of snap.statEffects) {
    if (!e || !e.target || !V3_RUNE_STAT_COLUMN_SET.has(e.target)) continue;
    const amt = Math.trunc(Number(e.amount) || 0);
    if (!amt) continue;
    updates[e.target] = (Number((draft as any)[e.target]) || 0) + amt;
  }
  return { updates };
}

function detachRuneFromDraft(draft: ItemDraft, slotIndex: number): Partial<ItemDraft> {
  const socketed: SocketedRuneSnapshot[] = Array.isArray(draft.socketedRunes) ? [...draft.socketedRunes] : [];
  const idx = socketed.findIndex(r => r.slotIndex === slotIndex);
  if (idx < 0) return {};
  const rune = socketed[idx];
  const updates: any = { socketedRunes: socketed.filter((_, i) => i !== idx) };
  for (const e of (Array.isArray(rune.statEffects) ? rune.statEffects : [])) {
    if (!e || !e.target || !V3_RUNE_STAT_COLUMN_SET.has(e.target)) continue;
    const amt = Math.trunc(Number(e.amount) || 0);
    if (!amt) continue;
    updates[e.target] = (Number((draft as any)[e.target]) || 0) - amt;
  }
  return updates;
}

// AA V3 armor-boost targets. Inlined here because this package has no @shared
// imports; mirrors V3_ATTRIBUTES + V3_SKILLS in shared/v3.ts.
const V3_BOOST_TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "might", label: "Might (Attribute)" },
  { value: "finesse", label: "Finesse (Attribute)" },
  { value: "constitution", label: "Constitution (Attribute)" },
  { value: "will", label: "Will (Attribute)" },
  { value: "anemos", label: "Anemos (Attribute)" },
  { value: "intelligence", label: "Intelligence (Attribute)" },
  { value: "acrobatics", label: "Acrobatics (Skill)" },
  { value: "animalHandling", label: "Animal Handling (Skill)" },
  { value: "athletics", label: "Athletics (Skill)" },
  { value: "endurance", label: "Endurance (Skill)" },
  { value: "focus", label: "Focus (Skill)" },
  { value: "fortitude", label: "Fortitude (Skill)" },
  { value: "insight", label: "Insight (Skill)" },
  { value: "investigation", label: "Investigation (Skill)" },
  { value: "naturecraft", label: "Nature (Skill)" },
  { value: "perception", label: "Perception (Skill)" },
  { value: "resolve", label: "Resolve (Skill)" },
  { value: "sense", label: "Sense (Skill)" },
  { value: "sleightOfHand", label: "Sleight of Hand (Skill)" },
  { value: "stealth", label: "Stealth (Skill)" },
  { value: "survival", label: "Survival (Skill)" },
];
const ATTRIBUTES = ["", "might", "finesse", "wit", "presence", "will", "craft"] as const;
const AOE_SHAPES = ["", "cone", "sphere", "line", "cube", "cylinder"] as const;
const SIZES = ["tiny", "small", "medium", "large", "huge"] as const;

export interface ItemDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;
  name: string;
  image?: string | null;
  description?: string | null;
  rules?: string | null;
  rulesVisible?: boolean;
  itemType: string;
  rarity?: string;
  damage?: string | null;
  damageType?: string | null;
  mod?: number | null;
  range?: number | null;
  aoe?: string | null;
  attribute?: string | null;
  size?: string | null;
  isHeavy?: boolean;
  ammunitionType?: string | null;
  // AA V3 only — id of a v3_ammunition_type. On an ammunition item: the type it IS.
  // On a weapon: the type it USES (non-null marks the weapon as ranged).
  ammunitionTypeId?: string | null;
  weaponCategory?: string | null;
  breakChance?: number;
  price?: number;
  currency?: string;
  itemWeight?: number;
  quantity?: number;
  durability?: number;
  isContainer?: boolean;
  carryCapacity?: number | null;
  armorSlot?: string | null;
  armorBonus?: number | null;
  damageReduction?: number | null;
  damageReductionType?: string | null;
  grantsDcBonus?: boolean;
  dcBonusValue?: number | null;
  v3ArmorBoosts?: { target: string; amount: number }[];
  rationServings?: number | null;
  isDamaging?: boolean;
  isDetonatable?: boolean;
  detonateAoeShape?: string | null;
  detonateAoeRange?: number | null;
  // AA V3 consumable "use effect": signed HP/Mana/Energy deltas + description.
  consumableHpChange?: number | null;
  consumableManaChange?: number | null;
  consumableEnergyChange?: number | null;
  consumableEffectDescription?: string | null;
  canApplyEffects?: boolean;
  maxSpells?: number | null;
  isTemplate?: boolean;
  isLiveTemplate?: boolean;
  templatePriority?: number;
  templateUseOwnOrder?: boolean;
  system?: string;
  v3TechniqueGroupIds?: string[];
  advancedItemTypeId?: string | null;
  maxDurability?: number;
  // AA V3 repair cost (lives on the item; crafter repair recipes just declare types).
  repairAmount?: number;
  repairIngredients?: { itemId: string | null; itemName: string; quantity: number }[];
  // AA V3 scrolls & runes (Task #198)
  scrollEffectMode?: string;
  scrollKnowledgeName?: string | null;
  scrollKnowledgeAttribute?: string | null;
  scrollKnowledgeValue?: number | null;
  scrollSkillKey?: string | null;
  scrollSkillAmount?: number | null;
  runeTargetItemType?: string | null;
  runeStatEffects?: { target: string; amount: number }[];
  runeRemoveDurabilityCost?: number | null;
  runeUnremovable?: boolean;
  runeUseMode?: string;
  runeSkillKey?: string | null;
  runeSkillAdjustment?: number | null;
  runeWeaponDamageLevelBonus?: number | null;
  // AA V3 default (pre-loaded) runes baked onto a non-rune item at authoring time.
  socketedRunes?: SocketedRuneSnapshot[] | null;
  // Children
  rolls?: RollEntryDraft[];
  craftRecipes?: CraftRecipeDraft[];
  buildRecipe?: BuildRecipeDraft | null;
  templateLinks?: string[];
}

const FRESH: ItemDraft = {
  name: "",
  itemType: "weapon",
  rarity: "common",
  rulesVisible: true,
  isHeavy: false,
  breakChance: 10,
  price: 0,
  currency: "copper",
  itemWeight: 0,
  quantity: 1,
  durability: 10,
  isContainer: false,
  rolls: [],
  craftRecipes: [],
  buildRecipe: { outputQuantity: 1, ingredients: [] },
  templateLinks: [],
  maxSpells: 10,
  system: "aa-v2",
  v3TechniqueGroupIds: [],
  advancedItemTypeId: null,
  ammunitionTypeId: null,
  repairAmount: 0,
  repairIngredients: [],
};

export const ItemDialog: React.FC<DialogProps<ItemDraft>> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, campaignSystem, mode, renderCrafterExtras,
}) => {
  const [draft, setDraft] = React.useState<ItemDraft>(FRESH);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [techniqueGroups, setTechniqueGroups] = React.useState<{ id: string; name: string }[]>([]);
  const [techPickerOpen, setTechPickerOpen] = React.useState(false);
  const [advancedItemTypes, setAdvancedItemTypes] = React.useState<{ id: string; name: string }[]>([]);
  const [ammunitionTypes, setAmmunitionTypes] = React.useState<{ id: string; name: string }[]>([]);
  const aav2 = isAAv2(campaignSystem ?? draft.system);
  const aav3 = (campaignSystem ?? draft.system) === "aa-v3";
  const damageTypes = aav2 ? AAV2_EFFECT_TYPES : LEGACY_DAMAGE_TYPES;
  // Explicit `mode` prop wins; otherwise infer from initialValue.id.
  const editing = mode ? mode === "edit" : !!initialValue?.id;

  // ---- Load on open ----
  React.useEffect(() => {
    if (!open) return;
    if (!initialValue?.id) {
      setDraft({ ...FRESH, ...(initialValue ?? {}) });
      return;
    }
    setLoading(true);
    host.transport.get<ItemDraft & { rolls?: any[]; craftRecipes?: any[]; templateLinks?: string[] }>("item", initialValue.id)
      .then(env => {
        const data: any = env.data ?? env;
        setDraft({
          ...FRESH,
          ...data,
          rolls: (data.rolls ?? []).map((r: any) => ({ ...r, _localId: r.id })),
          craftRecipes: (data.craftRecipes ?? []).map((r: any) => ({ ...r, _localId: r.id, ingredients: r.ingredients ?? [] })),
          buildRecipe: data.buildRecipe
            ? { id: data.buildRecipe.id, outputQuantity: data.buildRecipe.outputQuantity ?? 1, ingredients: data.buildRecipe.ingredients ?? [] }
            : { outputQuantity: 1, ingredients: [] },
          templateLinks: data.templateLinks ?? [],
        });
      })
      .catch(e => host.notify("error", `Failed to load item: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host]);

  // Load assignable V3 technique groups when the dialog opens in a V3 host.
  React.useEffect(() => {
    if (!open || !aav3 || !host.techniqueGroups) { setTechniqueGroups([]); return; }
    host.techniqueGroups()
      .then(setTechniqueGroups)
      .catch(e => host.notify("error", `Failed to load technique groups: ${e?.message ?? e}`));
  }, [open, aav3, host]);

  // Load assignable V3 advanced item types when the dialog opens in a V3 host.
  React.useEffect(() => {
    if (!open || !aav3 || !host.advancedItemTypes) { setAdvancedItemTypes([]); return; }
    host.advancedItemTypes()
      .then(setAdvancedItemTypes)
      .catch(e => host.notify("error", `Failed to load advanced item types: ${e?.message ?? e}`));
  }, [open, aav3, host]);

  // Load assignable V3 ammunition types when the dialog opens in a V3 host.
  React.useEffect(() => {
    if (!open || !aav3 || !host.ammunitionTypes) { setAmmunitionTypes([]); return; }
    host.ammunitionTypes()
      .then(setAmmunitionTypes)
      .catch(e => host.notify("error", `Failed to load ammunition types: ${e?.message ?? e}`));
  }, [open, aav3, host]);

  // Load library rune items so a GM can pre-load default runes onto a V3 item.
  const [runeItems, setRuneItems] = React.useState<any[]>([]);
  const [runePickerSlot, setRunePickerSlot] = React.useState<number | null>(null);
  const [runeSearch, setRuneSearch] = React.useState("");
  // All library items, used by the V3 repair-ingredient picker below.
  const [libraryItems, setLibraryItems] = React.useState<any[]>([]);
  const [repairIngPickerOpen, setRepairIngPickerOpen] = React.useState(false);
  const [repairIngSearch, setRepairIngSearch] = React.useState("");
  React.useEffect(() => {
    if (!open || !aav3) { setRuneItems([]); setLibraryItems([]); return; }
    host.transport.list<any>("item")
      .then(res => {
        const all = res?.data ?? [];
        setRuneItems(all.filter((i: any) => i.itemType === "rune"));
        setLibraryItems(all);
      })
      .catch(() => { setRuneItems([]); setLibraryItems([]); });
  }, [open, aav3, host]);

  const set = (patch: Partial<ItemDraft>) => setDraft(d => ({ ...d, ...patch }));

  const toggleTechniqueGroup = (id: string) => setDraft(d => {
    const cur = d.v3TechniqueGroupIds ?? [];
    return { ...d, v3TechniqueGroupIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
  });

  const handleSave = async () => {
    if (!draft.name.trim()) {
      host.notify("warning", "Item name is required.");
      return;
    }
    setSaving(true);
    try {
      // Whitelist columns that map to the `items` table — anything else
      // would crash storage.createItem/updateItem (Drizzle would reject
      // an unknown column). `rolls`, `craftRecipes`, and `templateLinks`
      // are recognized by the server's children-aware sync handler
      // (server/sync/children.ts) and stripped before the parent insert.
      const {
        rolls: _rolls, craftRecipes: _cr, buildRecipe: _br, templateLinks: _tl,
        ...parentFields
      } = draft;
      const payload: any = { ...parentFields };
      payload.rolls = (draft.rolls ?? []).map(({ _localId, templateName, templatePriority, templateUseOwnOrder, templateOwnerKey, ...r }) => r);
      payload.craftRecipes = (draft.craftRecipes ?? []).map(({ _localId, ...r }) => r);
      payload.buildRecipe = draft.buildRecipe ?? { outputQuantity: 1, ingredients: [] };
      payload.templateLinks = draft.templateLinks ?? [];
      const env = editing
        ? await host.transport.patch<ItemDraft>("item", draft.id!, payload)
        : await host.transport.upsert<ItemDraft>("item", payload);
      const saved: any = env.data ?? env;
      host.notify("success", editing ? "Item updated." : "Item created.");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e: any) {
      host.notify("error", `Save failed: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const it = draft.itemType;
  const isWeaponLike = it === "weapon" || it === "ammunition" || (it === "consumable" && draft.isDamaging);

  return (
    <HostModal
      component={host.modal}
      open={open}
      onOpenChange={(o) => { if (!o) onCancel?.(); onOpenChange(o); }}
      title={editing ? "Edit Item" : "Create Item"}
      description="Fields mirror the Arcana admin item editor exactly."
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Basics">
            <Stack gap="sm">
              <Grid2>
                <div><Label required>Name</Label>
                  <Input value={draft.name} onChange={e => set({ name: e.target.value })} data-testid="input-item-name" />
                </div>
                <div><Label>Image URL</Label>
                  <Row>
                    <Input value={draft.image ?? ""} onChange={e => set({ image: e.target.value })} data-testid="input-item-image" />
                    {host.imagePicker && (
                      <Button size="sm" onClick={async () => {
                        const r = await host.imagePicker!({ title: "Pick item image", initialUrl: draft.image ?? undefined });
                        if (r) set({ image: r.url });
                      }} data-testid="button-pick-image">Pick…</Button>
                    )}
                  </Row>
                </div>
              </Grid2>
              <Grid3>
                <div><Label>Item Type</Label>
                  <Select value={draft.itemType} onValueChange={v => set(v === "scroll" ? { itemType: v, maxSpells: 1 } : { itemType: v })} data-testid="select-item-type">
                    {ITEM_TYPES.filter(t => {
                      if (t === "crafter") return aav2 || aav3;
                      if (t === "spellbook") return aav3;
                      if (t === "scroll") return aav3;
                      if (t === "rune") return aav3;
                      if (t === "miscellaneous") return aav3;
                      return true;
                    }).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </Select>
                </div>
                {aav3 && it === "rune" ? <div /> : (
                <div><Label>Rarity</Label>
                  <Select value={draft.rarity ?? "common"} onValueChange={v => set({ rarity: v })}>
                    {RARITIES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </Select>
                </div>
                )}
                <div><Label>Size</Label>
                  <Select value={draft.size ?? ""} onValueChange={v => set({ size: v || null })}>
                    <SelectItem value="">—</SelectItem>
                    {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </Select>
                </div>
              </Grid3>
              <div><Label>Description</Label>
                <Textarea value={draft.description ?? ""} onChange={e => set({ description: e.target.value })} />
              </div>
              <div><Label>Rules (GM-editable)</Label>
                <Textarea value={draft.rules ?? ""} onChange={e => set({ rules: e.target.value })} />
              </div>
              <Row>
                <Checkbox checked={!!draft.rulesVisible} onCheckedChange={v => set({ rulesVisible: v })} />
                <Label>Rules visible to players</Label>
              </Row>
            </Stack>
          </Section>

          <Section title="Economy & inventory">
            <Grid3>
              <div><Label>Quantity</Label>
                <Input type="number" value={draft.quantity ?? 1} onChange={e => set({ quantity: optionalNum(e.target.value) ?? 1 })} />
              </div>
              <div><Label>Weight (lb)</Label>
                <Input type="number" step="0.1" value={draft.itemWeight ?? 0} onChange={e => set({ itemWeight: optionalNum(e.target.value) ?? 0 })} />
              </div>
              <div><Label>Durability (0–10)</Label>
                <Input type="number" min={0} max={10} value={draft.durability ?? 10} onChange={e => set({ durability: optionalNum(e.target.value) ?? 10 })} />
              </div>
              <div><Label>Price</Label>
                <Input type="number" value={draft.price ?? 0} onChange={e => set({ price: optionalNum(e.target.value) ?? 0 })} />
              </div>
              <div><Label>Currency</Label>
                <Select value={draft.currency ?? "copper"} onValueChange={v => set({ currency: v })}>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </Select>
              </div>
              <Row><Checkbox checked={!!draft.isContainer} onCheckedChange={v => set({ isContainer: v })} /><Label>Is container</Label></Row>
              {draft.isContainer && (
                <div><Label>Carry capacity</Label>
                  <Input type="number" value={draft.carryCapacity ?? 0} onChange={e => set({ carryCapacity: optionalNum(e.target.value) ?? 0 })} />
                </div>
              )}
            </Grid3>
          </Section>

          {aav3 && host.advancedItemTypes && (
            <Section title="Advanced Item Type">
              <div>
                <Label>Advanced Item Type</Label>
                <Select
                  value={draft.advancedItemTypeId ?? ""}
                  onValueChange={v => set({ advancedItemTypeId: v || null })}
                >
                  <SelectItem value="">— None —</SelectItem>
                  {advancedItemTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </Select>
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  Tag this item with an advanced type so crafter repair recipes can target it.
                </p>
              </div>
              <div style={{ marginTop: 12 }}>
                <Label>Durability restored per repair</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.repairAmount ?? 0}
                  onChange={e => set({ repairAmount: Math.max(0, optionalNum(e.target.value) ?? 0) })}
                  data-testid="input-repair-amount"
                />
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  How much durability one repair restores (0 = this item can't be repaired).
                </p>
              </div>
              <div style={{ marginTop: 12 }}>
                <Label>Repair ingredients</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                  {(draft.repairIngredients ?? []).length === 0 && (
                    <p className="ld-subtle" style={{ fontSize: 12, opacity: 0.6 }}>No ingredients — repair is free.</p>
                  )}
                  {(draft.repairIngredients ?? []).map((ing, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }} data-testid={`repair-ingredient-${idx}`}>
                      <span style={{ flex: 1, fontSize: 13, color: "#e7e5e4" }}>{ing.itemName || "Unnamed item"}</span>
                      <Input
                        type="number"
                        min={1}
                        value={ing.quantity}
                        onChange={e => {
                          const next = [...(draft.repairIngredients ?? [])];
                          next[idx] = { ...next[idx], quantity: Math.max(1, optionalNum(e.target.value) ?? 1) };
                          set({ repairIngredients: next });
                        }}
                        style={{ width: 70 }}
                        data-testid={`input-repair-ingredient-qty-${idx}`}
                      />
                      <button
                        type="button"
                        onClick={() => set({ repairIngredients: (draft.repairIngredients ?? []).filter((_, i) => i !== idx) })}
                        style={{
                          width: 28, height: 28, borderRadius: 4, background: "#1c1917",
                          border: "1px solid #57534e", color: "#a8a29e", cursor: "pointer", lineHeight: 1,
                        }}
                        data-testid={`button-remove-repair-ingredient-${idx}`}
                      >×</button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { setRepairIngPickerOpen(o => !o); setRepairIngSearch(""); }}
                  style={{
                    padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13,
                    border: repairIngPickerOpen ? "1px solid rgba(180,83,9,0.8)" : "1px solid #57534e",
                    background: repairIngPickerOpen ? "#292524" : "rgba(28,25,23,0.5)", color: "#e7e5e4",
                  }}
                  data-testid="button-add-repair-ingredient"
                >+ Add ingredient</button>
                {repairIngPickerOpen && (
                  <div
                    style={{ border: "1px solid #44403c", borderRadius: 8, padding: 8, background: "#1c1917", marginTop: 8 }}
                    data-testid="repair-ingredient-picker-panel"
                  >
                    <Input
                      value={repairIngSearch}
                      onChange={e => setRepairIngSearch(e.target.value)}
                      placeholder="Search items…"
                      data-testid="input-repair-ingredient-search"
                      autoFocus
                    />
                    <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 8 }}>
                      {(() => {
                        const chosen = new Set((draft.repairIngredients ?? []).map(i => i.itemId).filter(Boolean));
                        const matches = libraryItems
                          .filter(i => !chosen.has(i.id))
                          .filter(i => (i.name || "").toLowerCase().includes(repairIngSearch.toLowerCase()));
                        if (matches.length === 0) {
                          return <p className="ld-subtle" data-testid="text-no-repair-items" style={{ textAlign: "center", padding: 12 }}>No matching items</p>;
                        }
                        return matches.map(i => (
                          <button
                            key={i.id}
                            type="button"
                            onClick={() => {
                              set({ repairIngredients: [...(draft.repairIngredients ?? []), { itemId: i.id, itemName: i.name || "", quantity: 1 }] });
                              setRepairIngPickerOpen(false);
                              setRepairIngSearch("");
                            }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%",
                              padding: 6, borderRadius: 4, background: "transparent",
                              border: "none", cursor: "pointer", textAlign: "left", color: "#e7e5e4",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#292524")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            data-testid={`repair-ingredient-option-${i.id}`}
                          >
                            <span style={{
                              width: 28, height: 28, borderRadius: 4, background: "#292524",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              overflow: "hidden", flexShrink: 0,
                            }}>
                              {i.image ? (
                                <img src={i.image} alt={i.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : <span style={{ fontSize: 14 }}>📦</span>}
                            </span>
                            <span style={{ fontSize: 13 }}>{i.name}</span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  Items consumed from the player's inventory each time this item is repaired.
                </p>
              </div>
            </Section>
          )}

          {isWeaponLike && (
            <Section title="Combat / weapon">
              <Grid3>
                {!aav3 && (<>
                <div><Label>Damage</Label>
                  <Input value={draft.damage ?? ""} placeholder="1d8" onChange={e => set({ damage: e.target.value })} />
                </div>
                <div><Label>Damage Type</Label>
                  <Select value={draft.damageType ?? ""} onValueChange={v => set({ damageType: v || null })}>
                    <SelectItem value="">—</SelectItem>
                    {damageTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </Select>
                </div>
                <div><Label>Mod</Label>
                  <Input type="number" value={draft.mod ?? 0} onChange={e => set({ mod: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <div><Label>Range (ft)</Label>
                  <Input type="number" value={draft.range ?? ""} onChange={e => set({ range: optionalNum(e.target.value) ?? null })} />
                </div>
                <div><Label>AOE</Label>
                  <Select value={draft.aoe ?? ""} onValueChange={v => set({ aoe: v || null })}>
                    {AOE_SHAPES.map(s => <SelectItem key={s} value={s}>{s || "—"}</SelectItem>)}
                  </Select>
                </div>
                <div><Label>Attribute</Label>
                  <Select value={draft.attribute ?? ""} onValueChange={v => set({ attribute: v || null })}>
                    {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a || "—"}</SelectItem>)}
                  </Select>
                </div>
                </>)}
                {!aav3 && <Row><Checkbox checked={!!draft.isHeavy} onCheckedChange={v => set({ isHeavy: v })} /><Label>Heavy weapon</Label></Row>}
                {!aav3 && <Row><Checkbox checked={!!draft.canApplyEffects} onCheckedChange={v => set({ canApplyEffects: v })} /><Label>Can apply token effects</Label></Row>}
                <div />
              </Grid3>
              {it === "ammunition" && !aav3 && (
                <Grid3 style={{ marginTop: 8 }}>
                  <div><Label>Ammunition Type</Label>
                    <Input value={draft.ammunitionType ?? ""} placeholder="arrow / bolt / bullet / dart"
                      onChange={e => set({ ammunitionType: e.target.value || null })} />
                  </div>
                  <div><Label>Weapon Category</Label>
                    <Input value={draft.weaponCategory ?? ""} placeholder="bow / crossbow / sling"
                      onChange={e => set({ weaponCategory: e.target.value || null })} />
                  </div>
                  <div><Label>Break chance %</Label>
                    <Input type="number" min={0} max={100} value={draft.breakChance ?? 10}
                      onChange={e => set({ breakChance: optionalNum(e.target.value) ?? 10 })} />
                  </div>
                </Grid3>
              )}
              {it === "ammunition" && aav3 && host.ammunitionTypes && (
                <div style={{ marginTop: 8 }}>
                  <Label>Ammunition Type</Label>
                  <Select value={draft.ammunitionTypeId ?? ""} onValueChange={v => set({ ammunitionTypeId: v || null })}>
                    <SelectItem value="">— None —</SelectItem>
                    {ammunitionTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </Select>
                  <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                    Which ammunition type this item is. Ranged weapons that use this type can only fire when a matching item is equipped.
                  </p>
                </div>
              )}
              {it === "weapon" && aav3 && host.ammunitionTypes && (
                <div style={{ marginTop: 8 }}>
                  <Label>Ranged — Ammunition Type</Label>
                  <Select value={draft.ammunitionTypeId ?? ""} onValueChange={v => set({ ammunitionTypeId: v || null })}>
                    <SelectItem value="">— Melee (no ammunition) —</SelectItem>
                    {ammunitionTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </Select>
                  <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                    Pick an ammunition type to make this a ranged weapon. It can only attack when a matching ammunition item is equipped.
                  </p>
                </div>
              )}
              {aav3 && it === "weapon" && host.techniqueGroups && (() => {
                const selIds = draft.v3TechniqueGroupIds ?? [];
                const selectedGroups = techniqueGroups.filter(g => selIds.includes(g.id));
                return (
                  <div style={{ marginTop: 8 }}>
                    <Label>Technique Groups</Label>
                    <Stack gap="sm">
                      {selectedGroups.length > 0 ? (
                        selectedGroups.map(g => (
                          <Row key={g.id}>
                            <div style={{ flex: 1 }}>{g.name}</div>
                            <Button size="sm" variant="ghost" onClick={() => toggleTechniqueGroup(g.id)} data-testid={`button-remove-technique-groups-${g.id}`}>✕</Button>
                          </Row>
                        ))
                      ) : (
                        <div className="ld-subtle" data-testid="text-no-technique-groups">No technique groups selected.</div>
                      )}
                      <Button size="sm" onClick={() => setTechPickerOpen(true)} data-testid="button-browse-technique-groups">+ Add technique groups</Button>
                    </Stack>
                    <EntityPickerModal
                      open={techPickerOpen}
                      title="Add technique groups"
                      options={techniqueGroups}
                      selectedIds={selIds}
                      onPick={(g) => toggleTechniqueGroup(g.id)}
                      onClose={() => setTechPickerOpen(false)}
                      searchPlaceholder="Search technique groups…"
                      emptyText="No technique groups defined yet."
                      testIdPrefix="technique-groups"
                    />
                    <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                      Changes here automatically sync to copies already in players' inventories.
                    </p>
                  </div>
                );
              })()}
            </Section>
          )}

          {it === "armor" && (
            <Section title="Armor">
              <Grid3>
                <div><Label>Armor Slot</Label>
                  <Select value={draft.armorSlot ?? ""} onValueChange={v => set({ armorSlot: v || null })}>
                    <SelectItem value="">—</SelectItem>
                    {ARMOR_SLOTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </Select>
                </div>
                {!aav3 && <div><Label>Armor Bonus</Label>
                  <Input type="number" value={draft.armorBonus ?? 0} onChange={e => set({ armorBonus: optionalNum(e.target.value) ?? 0 })} />
                </div>}
                {!aav3 && <div><Label>Damage Reduction</Label>
                  <Input type="number" value={draft.damageReduction ?? 0} onChange={e => set({ damageReduction: optionalNum(e.target.value) ?? 0 })} />
                </div>}
                {!aav3 && <div><Label>Reduction Type</Label>
                  <Select value={draft.damageReductionType ?? ""} onValueChange={v => set({ damageReductionType: v || null })}>
                    <SelectItem value="">—</SelectItem>
                    {damageTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </Select>
                </div>}
                {!aav3 && <Row><Checkbox checked={!!draft.grantsDcBonus} onCheckedChange={v => set({ grantsDcBonus: v })} /><Label>Grants DC bonus</Label></Row>}
                {!aav3 && draft.grantsDcBonus && (
                  <div><Label>DC bonus value</Label>
                    <Input type="number" value={draft.dcBonusValue ?? 0} onChange={e => set({ dcBonusValue: optionalNum(e.target.value) ?? 0 })} />
                  </div>
                )}
              </Grid3>
              {aav3 && (
                <Stack gap="sm" style={{ marginTop: 8 }}>
                  <Label>Boosts when equipped</Label>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Equipping this armor boosts the wearer's chosen attributes or skills.</div>
                  {(draft.v3ArmorBoosts && draft.v3ArmorBoosts.length > 0 ? draft.v3ArmorBoosts : [{ target: "", amount: 1 }]).map((row, idx) => {
                    const rows = draft.v3ArmorBoosts && draft.v3ArmorBoosts.length > 0 ? draft.v3ArmorBoosts : [{ target: "", amount: 1 }];
                    return (
                      <Row key={idx}>
                        <div style={{ flex: 1 }}>
                          <Select value={row.target ?? ""} onValueChange={v => set({ v3ArmorBoosts: rows.map((r, i) => i === idx ? { ...r, target: v } : r) })}>
                            <SelectItem value="">Select attribute or skill…</SelectItem>
                            {V3_BOOST_TARGET_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </Select>
                        </div>
                        <div style={{ width: 90 }}>
                          <Input type="number" value={row.amount ?? 1} onChange={e => set({ v3ArmorBoosts: rows.map((r, i) => i === idx ? { ...r, amount: optionalNum(e.target.value) ?? 0 } : r) })} />
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => set({ v3ArmorBoosts: rows.filter((_, i) => i !== idx) })}>✕</Button>
                      </Row>
                    );
                  })}
                  <div>
                    <Button size="sm" variant="outline" onClick={() => set({ v3ArmorBoosts: [...(draft.v3ArmorBoosts ?? []), { target: "", amount: 1 }] })}>+ Add Boost</Button>
                  </div>
                </Stack>
              )}
            </Section>
          )}

          {it === "consumable" && (
            <Section title="Consumable">
              <Grid3>
                <div><Label>Ration servings</Label>
                  <Input type="number" value={draft.rationServings ?? 0} onChange={e => set({ rationServings: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <Row><Checkbox checked={!!draft.isDamaging} onCheckedChange={v => set({ isDamaging: v })} /><Label>Damaging (rollable)</Label></Row>
                <Row><Checkbox checked={!!draft.isDetonatable} onCheckedChange={v => set({ isDetonatable: v })} /><Label>Detonatable</Label></Row>
              </Grid3>
              {draft.isDetonatable && (
                <Grid2 style={{ marginTop: 8 }}>
                  <div><Label>Detonate AOE Shape</Label>
                    <Select value={draft.detonateAoeShape ?? ""} onValueChange={v => set({ detonateAoeShape: v || null })}>
                      {AOE_SHAPES.map(s => <SelectItem key={s} value={s}>{s || "—"}</SelectItem>)}
                    </Select>
                  </div>
                  <div><Label>Detonate AOE Range</Label>
                    <Input type="number" value={draft.detonateAoeRange ?? 15} onChange={e => set({ detonateAoeRange: optionalNum(e.target.value) ?? 15 })} />
                  </div>
                </Grid2>
              )}
              {aav3 && (
                <Stack gap="sm" style={{ marginTop: 8 }}>
                  <Label>Use effect</Label>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>When a player uses this consumable, apply these to their character. Positive numbers add, negative subtract. Leave at 0 for none.</div>
                  <Grid3>
                    <div><Label>HP change</Label>
                      <Input type="number" value={draft.consumableHpChange ?? 0} onChange={e => set({ consumableHpChange: optionalNum(e.target.value) ?? 0 })} />
                    </div>
                    <div><Label>Mana change</Label>
                      <Input type="number" value={draft.consumableManaChange ?? 0} onChange={e => set({ consumableManaChange: optionalNum(e.target.value) ?? 0 })} />
                    </div>
                    <div><Label>Energy change</Label>
                      <Input type="number" value={draft.consumableEnergyChange ?? 0} onChange={e => set({ consumableEnergyChange: optionalNum(e.target.value) ?? 0 })} />
                    </div>
                  </Grid3>
                  <div><Label>Effect description</Label>
                    <Input value={draft.consumableEffectDescription ?? ""} onChange={e => set({ consumableEffectDescription: e.target.value })} placeholder="e.g. Restores vitality and focus" />
                  </div>
                </Stack>
              )}
            </Section>
          )}

          {aav3 && it === "scroll" && (
            <Section title="Scroll">
              <Stack gap="sm">
                <div className="ld-subtle" data-testid="text-scroll-consumed">
                  A scroll does exactly one thing when used, then is consumed.
                </div>
                <div><Label>Scroll Effect</Label>
                  <Select
                    value={draft.scrollEffectMode ?? "spell"}
                    onValueChange={v => set({ scrollEffectMode: v })}
                    data-testid="select-scroll-effect-mode"
                  >
                    {V3_SCROLL_EFFECT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </Select>
                </div>
                {(draft.scrollEffectMode ?? "spell") === "knowledge" && (
                  <Grid3>
                    <div><Label>Knowledge name</Label>
                      <Input
                        value={draft.scrollKnowledgeName ?? ""}
                        onChange={e => set({ scrollKnowledgeName: e.target.value })}
                        placeholder="e.g. Ancient Runes"
                        data-testid="input-scroll-knowledge-name"
                      />
                    </div>
                    <div><Label>Parent attribute</Label>
                      <Select
                        value={draft.scrollKnowledgeAttribute ?? "intelligence"}
                        onValueChange={v => set({ scrollKnowledgeAttribute: v })}
                        data-testid="select-scroll-knowledge-attr"
                      >
                        {V3_BOOST_TARGET_OPTIONS.filter(o => o.label.includes("Attribute")).map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div><Label>Value</Label>
                      <Input
                        type="number"
                        value={draft.scrollKnowledgeValue ?? 0}
                        onChange={e => set({ scrollKnowledgeValue: optionalNum(e.target.value) ?? 0 })}
                        data-testid="input-scroll-knowledge-value"
                      />
                    </div>
                  </Grid3>
                )}
                {(draft.scrollEffectMode ?? "spell") === "skill" && (
                  <Grid2>
                    <div><Label>Skill to boost</Label>
                      <Select
                        value={draft.scrollSkillKey ?? ""}
                        onValueChange={v => set({ scrollSkillKey: v || null })}
                        data-testid="select-scroll-skill-key"
                      >
                        <SelectItem value="">—</SelectItem>
                        {V3_BOOST_TARGET_OPTIONS.filter(o => o.label.includes("Skill")).map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div><Label>Amount (raises modifier + cap)</Label>
                      <Input
                        type="number"
                        value={draft.scrollSkillAmount ?? 1}
                        onChange={e => set({ scrollSkillAmount: optionalNum(e.target.value) ?? 1 })}
                        data-testid="input-scroll-skill-amount"
                      />
                    </div>
                  </Grid2>
                )}
                {(draft.scrollEffectMode ?? "spell") === "spell" && (
                  host.spellbookManager ? (
                    draft.id ? (
                      <host.spellbookManager
                        itemId={draft.id}
                        maxSpells={1}
                        campaignSystem={campaignSystem ?? draft.system}
                      />
                    ) : (
                      <div className="ld-subtle" data-testid="text-spellbook-save-first">
                        Save this scroll first to pre-load a spell into it.
                      </div>
                    )
                  ) : null
                )}
              </Stack>
            </Section>
          )}

          {aav3 && it === "spellbook" && (
            <Section title="Spellbook">
              <Stack gap="sm">
                <div><Label>Max spells (0 = unlimited)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.maxSpells ?? 0}
                    onChange={e => set({ maxSpells: optionalNum(e.target.value) ?? 0 })}
                    data-testid="input-spellbook-max-spells"
                  />
                </div>
                {host.spellbookManager ? (
                  draft.id ? (
                    <host.spellbookManager
                      itemId={draft.id}
                      maxSpells={draft.maxSpells ?? 0}
                      campaignSystem={campaignSystem ?? draft.system}
                    />
                  ) : (
                    <div className="ld-subtle" data-testid="text-spellbook-save-first">
                      Save this spellbook first to pre-load spells into it.
                    </div>
                  )
                ) : null}
              </Stack>
            </Section>
          )}

          {aav3 && it === "rune" && (
            <Section title="Rune">
              <Stack gap="sm">
                <div className="ld-subtle" data-testid="text-rune-help">
                  A rune sockets into another item (slots by rarity). It modifies the host's stats and/or adds a usable skill-check action.
                </div>
                <div><Label>Can be applied to</Label>
                  <Select
                    value={draft.runeTargetItemType ?? "any"}
                    onValueChange={v => set({ runeTargetItemType: v })}
                    data-testid="select-rune-target-item-type"
                  >
                    {V3_RUNE_TARGET_ITEM_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </Select>
                </div>

                <div>
                  <Label>Stat effects (applied to host while socketed)</Label>
                  <Stack gap="sm">
                    {(draft.runeStatEffects ?? []).map((eff: { target: string; amount: number }, i: number) => (
                      <Row key={i}>
                        <Select
                          value={eff.target ?? ""}
                          onValueChange={v => {
                            const next = [...(draft.runeStatEffects ?? [])];
                            next[i] = { ...next[i], target: v };
                            set({ runeStatEffects: next });
                          }}
                          data-testid={`select-rune-stat-target-${i}`}
                        >
                          <SelectItem value="">—</SelectItem>
                          {V3_RUNE_STAT_TARGET_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </Select>
                        <Input
                          type="number"
                          value={eff.amount ?? 0}
                          onChange={e => {
                            const next = [...(draft.runeStatEffects ?? [])];
                            next[i] = { ...next[i], amount: optionalNum(e.target.value) ?? 0 };
                            set({ runeStatEffects: next });
                          }}
                          data-testid={`input-rune-stat-amount-${i}`}
                        />
                        <Button size="sm" variant="outline" onClick={() => {
                          const next = (draft.runeStatEffects ?? []).filter((_: unknown, j: number) => j !== i);
                          set({ runeStatEffects: next });
                        }} data-testid={`button-rune-stat-remove-${i}`}>✕</Button>
                      </Row>
                    ))}
                    <div>
                      <Button size="sm" variant="outline" onClick={() => set({ runeStatEffects: [...(draft.runeStatEffects ?? []), { target: "", amount: 1 }] })} data-testid="button-rune-stat-add">+ Add Stat Effect</Button>
                    </div>
                  </Stack>
                </div>

                <Grid2>
                  <div><Label>Remove cost (max durability lost)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.runeRemoveDurabilityCost ?? 1}
                      onChange={e => set({ runeRemoveDurabilityCost: optionalNum(e.target.value) ?? 1 })}
                      data-testid="input-rune-remove-cost"
                    />
                  </div>
                  <Row><Checkbox checked={!!draft.runeUnremovable} onCheckedChange={v => set({ runeUnremovable: v })} data-testid="checkbox-rune-unremovable" /><Label>Unremovable</Label></Row>
                </Grid2>

                <div><Label>Use mode</Label>
                  <Select
                    value={draft.runeUseMode ?? "none"}
                    onValueChange={v => set({ runeUseMode: v })}
                    data-testid="select-rune-use-mode"
                  >
                    <SelectItem value="none">Nothing (RP only)</SelectItem>
                    <SelectItem value="skill_check">Skill Check</SelectItem>
                  </Select>
                </div>
                {(draft.runeUseMode ?? "none") === "skill_check" && (
                  <Grid2>
                    <div><Label>Skill</Label>
                      <Select
                        value={draft.runeSkillKey ?? ""}
                        onValueChange={v => set({ runeSkillKey: v || null })}
                        data-testid="select-rune-skill-key"
                      >
                        <SelectItem value="">—</SelectItem>
                        {V3_BOOST_TARGET_OPTIONS.filter(o => o.label.includes("Skill")).map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div><Label>Adjustment (+/-)</Label>
                      <Input
                        type="number"
                        value={draft.runeSkillAdjustment ?? 0}
                        onChange={e => set({ runeSkillAdjustment: optionalNum(e.target.value) ?? 0 })}
                        data-testid="input-rune-skill-adjustment"
                      />
                    </div>
                  </Grid2>
                )}
                {(draft.runeTargetItemType ?? "any") === "weapon" && (
                  <div><Label>Weapon base-damage-level bonus (stacks, no extra mana)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.runeWeaponDamageLevelBonus ?? 0}
                      onChange={e => set({ runeWeaponDamageLevelBonus: optionalNum(e.target.value) ?? 0 })}
                      data-testid="input-rune-weapon-damage-level-bonus"
                    />
                  </div>
                )}
              </Stack>
            </Section>
          )}

          {aav3 && it !== "rune" && (
            <Section title="Default runes">
              <Stack>
                <p className="ld-subtle" data-testid="text-default-runes-help">
                  Pre-load runes onto this item. Slots come from rarity
                  ({draft.rarity ?? "common"} = {v3RuneSlots(draft.rarity)}).
                  Used {(draft.socketedRunes ?? []).length} / {v3RuneSlots(draft.rarity)}.
                </p>
                {v3RuneSlots(draft.rarity) === 0 && (draft.socketedRunes ?? []).length === 0 ? (
                  <p className="ld-subtle" data-testid="text-no-rune-slots">
                    This rarity has no rune slots. Raise the rarity to add runes.
                  </p>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid="rune-slot-grid">
                      {Array.from({ length: Math.max(v3RuneSlots(draft.rarity), (draft.socketedRunes ?? []).reduce((m, r) => Math.max(m, r.slotIndex + 1), 0)) }).map((_, i) => {
                        const rune = (draft.socketedRunes ?? []).find(r => r.slotIndex === i);
                        if (rune) {
                          return (
                            <div
                              key={i}
                              style={{
                                position: "relative", width: 80, height: 80, padding: 4,
                                borderRadius: 8, border: "2px solid rgba(180,83,9,0.6)",
                                background: "#292524", display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center", textAlign: "center",
                              }}
                              data-testid={`rune-slot-filled-${i}`}
                              title={rune.statEffects?.length
                                ? rune.statEffects.map(e => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.target}`).join(", ")
                                : rune.name}
                            >
                              {rune.image ? (
                                <img src={rune.image} alt={rune.name} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, marginBottom: 4 }} />
                              ) : (
                                <span style={{ fontSize: 20, marginBottom: 4 }}>💎</span>
                              )}
                              <span style={{ fontSize: 10, lineHeight: 1.1, color: "#e7e5e4", overflow: "hidden" }}>{rune.name}</span>
                              <button
                                type="button"
                                onClick={() => { setRunePickerSlot(null); set(detachRuneFromDraft(draft, i)); }}
                                style={{
                                  position: "absolute", top: -6, right: -6, width: 20, height: 20,
                                  borderRadius: "50%", background: "#1c1917", border: "1px solid #57534e",
                                  color: "#a8a29e", cursor: "pointer", lineHeight: 1, fontSize: 12,
                                }}
                                data-testid={`button-remove-default-rune-${i}`}
                              >×</button>
                            </div>
                          );
                        }
                        if (i >= v3RuneSlots(draft.rarity)) return null;
                        const active = runePickerSlot === i;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => { setRunePickerSlot(active ? null : i); setRuneSearch(""); }}
                            style={{
                              width: 80, height: 80, borderRadius: 8, cursor: "pointer",
                              border: active ? "2px solid rgba(180,83,9,0.8)" : "2px dashed #57534e",
                              background: active ? "#292524" : "rgba(28,25,23,0.5)",
                              color: "#78716c", fontSize: 28, lineHeight: 1,
                            }}
                            data-testid={`rune-slot-empty-${i}`}
                          >+</button>
                        );
                      })}
                    </div>
                    {runePickerSlot !== null && (
                      <div
                        style={{
                          border: "1px solid #44403c", borderRadius: 8, padding: 8,
                          background: "#1c1917",
                        }}
                        data-testid="rune-picker-panel"
                      >
                        <Input
                          value={runeSearch}
                          onChange={e => setRuneSearch(e.target.value)}
                          placeholder="Search runes…"
                          data-testid="input-rune-search"
                          autoFocus
                        />
                        <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 8 }}>
                          {(() => {
                            const compat = runeItems
                              .filter(r => {
                                const t = r.runeTargetItemType || "any";
                                return t === "any" || t === draft.itemType;
                              })
                              .filter(r => (r.name || "").toLowerCase().includes(runeSearch.toLowerCase()));
                            if (compat.length === 0) {
                              return <p className="ld-subtle" data-testid="text-no-runes-available" style={{ textAlign: "center", padding: 12 }}>No compatible runes</p>;
                            }
                            return compat.map(r => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  const res = attachRuneToDraft(draft, r);
                                  if (res.error) { host.notify("warning", res.error); return; }
                                  set(res.updates!);
                                  setRunePickerSlot(null);
                                  setRuneSearch("");
                                }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                                  padding: 6, borderRadius: 4, background: "transparent",
                                  border: "none", cursor: "pointer", textAlign: "left", color: "#e7e5e4",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#292524")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                data-testid={`rune-option-${r.id}`}
                              >
                                <span style={{
                                  width: 28, height: 28, borderRadius: 4, background: "#292524",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  overflow: "hidden", flexShrink: 0,
                                }}>
                                  {r.image ? (
                                    <img src={r.image} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  ) : <span style={{ fontSize: 14 }}>💎</span>}
                                </span>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                  <span style={{ display: "block", fontSize: 13 }}>{r.name}</span>
                                  {Array.isArray(r.runeStatEffects) && r.runeStatEffects.length ? (
                                    <span style={{ display: "block", fontSize: 11, color: "#fbbf24" }}>
                                      {r.runeStatEffects.map((e: any) => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.target}`).join(", ")}
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Stack>
            </Section>
          )}

          {!aav3 && (
            <Section title="Rolls">
              <RollEntriesEditor
                ownerType="item"
                value={draft.rolls ?? []}
                onChange={(rolls) => set({ rolls })}
                campaignSystem={campaignSystem ?? draft.system}
                host={host}
              />
            </Section>
          )}

          {(aav2 || aav3) && it === "crafter" && (
            <Section title="Crafting recipes (crafter item)">
              {renderCrafterExtras
                ? renderCrafterExtras({ itemId: draft.id })
                : (
                  <CraftRecipesEditor
                    value={draft.craftRecipes ?? []}
                    onChange={(craftRecipes) => set({ craftRecipes })}
                    host={host}
                  />
                )}
            </Section>
          )}

          {(aav2 || aav3) && (
            <Section title="Build recipe & recommended price">
              <ItemBuildRecipeEditor
                value={draft.buildRecipe ?? { outputQuantity: 1, ingredients: [] }}
                onChange={(buildRecipe) => set({ buildRecipe })}
                host={host}
                onApplyPrice={(price, currency) => set({ price, currency })}
                outputRarity={draft.rarity}
                isV3={aav3}
              />
            </Section>
          )}

          {aav2 && (
            <Section title="Linked Roll Templates">
              <ItemTemplateLinksPanel
                value={draft.templateLinks ?? []}
                onChange={(templateLinks) => set({ templateLinks })}
                host={host}
              />
            </Section>
          )}
        </Stack>
      )}
    </HostModal>
  );
};
