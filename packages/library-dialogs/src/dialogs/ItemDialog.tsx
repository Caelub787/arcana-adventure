/**
 * <ItemDialog>
 *
 * Full create/edit dialog for the `items` table. Mirrors Arcana's
 * AdminSettings ItemFormDialog field-set, including the conditional
 * branches for weapon / ammunition / armor / consumable / utility /
 * container / currency / crafter (AAv2 only).
 *
 * Save flow: bundles `rolls`, `craftRecipes`, and `templateLinks` into
 * a single sync upsert payload. The server's children-aware `applyChildren`
 * persists the rolls; `templateLinks` is forwarded to the existing
 * /api/sync/v1 contract for link table writes.
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
import { ItemTemplateLinksPanel } from "../components/ItemTemplateLinksPanel";
import { isAAv2, AAV2_EFFECT_TYPES, LEGACY_DAMAGE_TYPES } from "../lib/effectTypes";
import { optionalNum } from "../lib/utils";
import type { DialogProps } from "../types";

const ITEM_TYPES = [
  "weapon", "ammunition", "armor", "consumable",
  "utility", "container", "currency", "crafter",
] as const;
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
const CURRENCIES = ["copper", "silver", "gold", "platinum"] as const;
const ARMOR_SLOTS = ["helm", "chest", "arm", "legs", "boots"] as const;
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
  rationServings?: number | null;
  isDamaging?: boolean;
  isDetonatable?: boolean;
  detonateAoeShape?: string | null;
  detonateAoeRange?: number | null;
  canApplyEffects?: boolean;
  isTemplate?: boolean;
  isLiveTemplate?: boolean;
  templatePriority?: number;
  templateUseOwnOrder?: boolean;
  system?: string;
  // Children
  rolls?: RollEntryDraft[];
  craftRecipes?: CraftRecipeDraft[];
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
  templateLinks: [],
  system: "aa-v2",
};

export const ItemDialog: React.FC<DialogProps<ItemDraft>> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, campaignSystem, mode,
}) => {
  const [draft, setDraft] = React.useState<ItemDraft>(FRESH);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const aav2 = isAAv2(campaignSystem ?? draft.system);
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
          templateLinks: data.templateLinks ?? [],
        });
      })
      .catch(e => host.notify("error", `Failed to load item: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host]);

  const set = (patch: Partial<ItemDraft>) => setDraft(d => ({ ...d, ...patch }));

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
        rolls: _rolls, craftRecipes: _cr, templateLinks: _tl,
        ...parentFields
      } = draft;
      const payload: any = { ...parentFields };
      payload.rolls = (draft.rolls ?? []).map(({ _localId, templateName, templatePriority, templateUseOwnOrder, templateOwnerKey, ...r }) => r);
      payload.craftRecipes = (draft.craftRecipes ?? []).map(({ _localId, ...r }) => r);
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
                  <Select value={draft.itemType} onValueChange={v => set({ itemType: v })} data-testid="select-item-type">
                    {ITEM_TYPES.filter(t => aav2 || t !== "crafter").map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </Select>
                </div>
                <div><Label>Rarity</Label>
                  <Select value={draft.rarity ?? "common"} onValueChange={v => set({ rarity: v })}>
                    {RARITIES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </Select>
                </div>
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

          {isWeaponLike && (
            <Section title="Combat / weapon">
              <Grid3>
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
                <Row><Checkbox checked={!!draft.isHeavy} onCheckedChange={v => set({ isHeavy: v })} /><Label>Heavy weapon</Label></Row>
                <Row><Checkbox checked={!!draft.canApplyEffects} onCheckedChange={v => set({ canApplyEffects: v })} /><Label>Can apply token effects</Label></Row>
                <div />
              </Grid3>
              {it === "ammunition" && (
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
                <div><Label>Armor Bonus</Label>
                  <Input type="number" value={draft.armorBonus ?? 0} onChange={e => set({ armorBonus: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <div><Label>Damage Reduction</Label>
                  <Input type="number" value={draft.damageReduction ?? 0} onChange={e => set({ damageReduction: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <div><Label>Reduction Type</Label>
                  <Select value={draft.damageReductionType ?? ""} onValueChange={v => set({ damageReductionType: v || null })}>
                    <SelectItem value="">—</SelectItem>
                    {damageTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </Select>
                </div>
                <Row><Checkbox checked={!!draft.grantsDcBonus} onCheckedChange={v => set({ grantsDcBonus: v })} /><Label>Grants DC bonus</Label></Row>
                {draft.grantsDcBonus && (
                  <div><Label>DC bonus value</Label>
                    <Input type="number" value={draft.dcBonusValue ?? 0} onChange={e => set({ dcBonusValue: optionalNum(e.target.value) ?? 0 })} />
                  </div>
                )}
              </Grid3>
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
            </Section>
          )}

          <Section title="Rolls">
            <RollEntriesEditor
              ownerType="item"
              value={draft.rolls ?? []}
              onChange={(rolls) => set({ rolls })}
              campaignSystem={campaignSystem ?? draft.system}
              host={host}
            />
          </Section>

          {aav2 && it === "crafter" && (
            <Section title="Crafting recipes (crafter item)">
              <CraftRecipesEditor
                value={draft.craftRecipes ?? []}
                onChange={(craftRecipes) => set({ craftRecipes })}
                host={host}
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
