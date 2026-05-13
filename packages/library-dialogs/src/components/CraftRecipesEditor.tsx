/**
 * Draft-mode CraftRecipesEditor.
 *
 * Like RollEntriesEditor: works on local draft state. Parent dialog
 * bundles the draft into the sync upsert. Data shape matches
 * `craft_recipes` (shared/schema.ts:578) including the
 * `craft_recipe_ingredients` child array under `ingredients`.
 *
 * Crafter items are AAv2-only.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section, Panel, Badge,
} from "../ui/primitives";
import { uid, optionalNum } from "../lib/utils";
import type { HostAdapter } from "../types";

export type CraftRecipeIngredientDraft = {
  id?: string;
  itemId?: string | null;
  itemName: string;
  quantity: number;
  sortOrder?: number;
};

export type CraftRecipeDraft = {
  id?: string;
  _localId?: string;
  fromTemplateRecipeId?: string | null;
  name: string;
  description: string;
  outputItemId?: string | null;
  outputItemName?: string;            // denormalized for display
  outputQuantity: number;
  noRoll: boolean;
  diceFormula: string;
  attribute: string;
  mod: number;
  requireCustomSkill: boolean;
  requiredSkillName: string;
  requiredSkillMinValue: number;
  costEnergyEnabled: boolean;
  costEnergy: number;
  costManaEnabled: boolean;
  costMana: number;
  costHpEnabled: boolean;
  costHp: number;
  sortOrder: number;
  ingredients: CraftRecipeIngredientDraft[];
};

const ATTRIBUTES = ["none", "might", "finesse", "wit", "presence", "will", "craft"];

export interface CraftRecipesEditorProps {
  value: CraftRecipeDraft[];
  onChange: (next: CraftRecipeDraft[]) => void;
  host: HostAdapter;
  /** Pre-loaded admin items (output picker). Defaults to fetched on demand. */
  adminItems?: Array<{ id: string; name: string }>;
}

function emptyRecipe(): CraftRecipeDraft {
  return {
    _localId: uid("recipe"),
    name: "Recipe",
    description: "",
    outputItemId: null,
    outputQuantity: 1,
    noRoll: false,
    diceFormula: "1d20",
    attribute: "craft",
    mod: 0,
    requireCustomSkill: false,
    requiredSkillName: "",
    requiredSkillMinValue: 0,
    costEnergyEnabled: false, costEnergy: 0,
    costManaEnabled: false,   costMana: 0,
    costHpEnabled: false,     costHp: 0,
    sortOrder: 0,
    ingredients: [],
  };
}

export const CraftRecipesEditor: React.FC<CraftRecipesEditorProps> = ({ value, onChange, host, adminItems: adminItemsProp }) => {
  const [adminItems, setAdminItems] = React.useState<Array<{ id: string; name: string }>>(adminItemsProp ?? []);
  React.useEffect(() => {
    if (adminItems.length > 0) return;
    let cancelled = false;
    host.transport.list<{ id: string; name: string }>("item")
      .then(res => { if (!cancelled) setAdminItems((res.data ?? []).map((it: any) => ({ id: it.id, name: it.name }))); })
      .catch(e => host.notify("warning", `Could not load items for recipe picker: ${e?.message ?? e}`));
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => onChange([...value, { ...emptyRecipe(), sortOrder: value.length }]);
  const update = (idx: number, patch: Partial<CraftRecipeDraft>) => {
    const next = value.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <Stack data-testid="craft-recipes-editor">
      <Row style={{ justifyContent: "space-between" }}>
        <span className="ld-label" style={{ margin: 0 }}>Crafting Recipes ({value.length})</span>
        <Button variant="primary" size="sm" onClick={add} data-testid="button-add-recipe">+ Add Recipe</Button>
      </Row>

      {value.length === 0 && <div className="ld-subtle">No recipes yet.</div>}

      {value.map((r, idx) => (
        <Panel key={r._localId ?? r.id ?? idx}>
          <div className="ld-panel-header">
            <Row>
              <strong style={{ color: "var(--ld-text)" }}>{r.name || "(unnamed recipe)"}</strong>
              {r.fromTemplateRecipeId && <Badge tone="accent">from template</Badge>}
            </Row>
            <Button size="sm" variant="danger" onClick={() => remove(idx)} data-testid={`button-remove-recipe-${idx}`}>Remove</Button>
          </div>
          <Stack gap="sm">
            <Grid2>
              <div><Label>Name</Label>
                <Input value={r.name} onChange={e => update(idx, { name: e.target.value })} />
              </div>
              <div><Label>Output Item</Label>
                <Select value={r.outputItemId ?? ""} onValueChange={v => {
                  const found = adminItems.find(it => it.id === v);
                  update(idx, { outputItemId: v || null, outputItemName: found?.name });
                }}>
                  <SelectItem value="">— select —</SelectItem>
                  {adminItems.map(it => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
                </Select>
              </div>
            </Grid2>
            <div><Label>Description</Label>
              <Textarea value={r.description} onChange={e => update(idx, { description: e.target.value })} />
            </div>
            <Grid3>
              <div><Label>Output Quantity</Label>
                <Input type="number" value={r.outputQuantity} onChange={e => update(idx, { outputQuantity: optionalNum(e.target.value) ?? 1 })} />
              </div>
              <div><Label>Dice Formula</Label>
                <Input value={r.diceFormula} onChange={e => update(idx, { diceFormula: e.target.value })} disabled={r.noRoll} />
              </div>
              <div><Label>Attribute</Label>
                <Select value={r.attribute} onValueChange={v => update(idx, { attribute: v })}>
                  {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </Select>
              </div>
            </Grid3>
            <Grid3>
              <div><Label>Mod</Label>
                <Input type="number" value={r.mod} onChange={e => update(idx, { mod: optionalNum(e.target.value) ?? 0 })} />
              </div>
              <Row><Checkbox checked={r.noRoll} onCheckedChange={v => update(idx, { noRoll: v })} /><Label>No roll (auto)</Label></Row>
              <div />
            </Grid3>

            <Section title="Custom skill requirement">
              <Row><Checkbox checked={r.requireCustomSkill} onCheckedChange={v => update(idx, { requireCustomSkill: v })} /><Label>Require custom skill</Label></Row>
              {r.requireCustomSkill && (
                <Grid2 style={{ marginTop: 8 }}>
                  <div><Label>Skill name</Label>
                    <Input value={r.requiredSkillName} onChange={e => update(idx, { requiredSkillName: e.target.value })} />
                  </div>
                  <div><Label>Min value</Label>
                    <Input type="number" value={r.requiredSkillMinValue} onChange={e => update(idx, { requiredSkillMinValue: optionalNum(e.target.value) ?? 0 })} />
                  </div>
                </Grid2>
              )}
            </Section>

            <Section title="Resource cost">
              <Grid3>
                <Row><Checkbox checked={r.costEnergyEnabled} onCheckedChange={v => update(idx, { costEnergyEnabled: v })} /><Label>Energy</Label></Row>
                {r.costEnergyEnabled && <Input type="number" value={r.costEnergy} onChange={e => update(idx, { costEnergy: optionalNum(e.target.value) ?? 0 })} />}
                {!r.costEnergyEnabled && <div />}
              </Grid3>
              <Grid3 style={{ marginTop: 6 }}>
                <Row><Checkbox checked={r.costManaEnabled} onCheckedChange={v => update(idx, { costManaEnabled: v })} /><Label>Mana</Label></Row>
                {r.costManaEnabled && <Input type="number" value={r.costMana} onChange={e => update(idx, { costMana: optionalNum(e.target.value) ?? 0 })} />}
                {!r.costManaEnabled && <div />}
              </Grid3>
              <Grid3 style={{ marginTop: 6 }}>
                <Row><Checkbox checked={r.costHpEnabled} onCheckedChange={v => update(idx, { costHpEnabled: v })} /><Label>HP</Label></Row>
                {r.costHpEnabled && <Input type="number" value={r.costHp} onChange={e => update(idx, { costHp: optionalNum(e.target.value) ?? 0 })} />}
                {!r.costHpEnabled && <div />}
              </Grid3>
            </Section>

            <Section title={`Ingredients (${r.ingredients.length})`}>
              {r.ingredients.map((ing, ii) => (
                <Row key={ing.id ?? ii} style={{ marginBottom: 6 }}>
                  <Select value={ing.itemId ?? ""} onValueChange={v => {
                    const found = adminItems.find(it => it.id === v);
                    const next = r.ingredients.slice();
                    next[ii] = { ...ing, itemId: v || null, itemName: found?.name ?? ing.itemName };
                    update(idx, { ingredients: next });
                  }}>
                    <SelectItem value="">— item —</SelectItem>
                    {adminItems.map(it => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
                  </Select>
                  <Input style={{ width: 80 }} type="number" value={ing.quantity}
                    onChange={e => {
                      const next = r.ingredients.slice();
                      next[ii] = { ...ing, quantity: optionalNum(e.target.value) ?? 1 };
                      update(idx, { ingredients: next });
                    }} />
                  <Button size="sm" variant="danger" onClick={() => {
                    update(idx, { ingredients: r.ingredients.filter((_, i) => i !== ii) });
                  }}>×</Button>
                </Row>
              ))}
              <Button size="sm" onClick={() => update(idx, { ingredients: [...r.ingredients, { itemName: "", quantity: 1, sortOrder: r.ingredients.length }] })}>+ Add ingredient</Button>
            </Section>
          </Stack>
        </Panel>
      ))}
    </Stack>
  );
};
