/**
 * Embedded child-row editors for <CharacterDialog>.
 *
 * The full Arcana inventory / spell / hotbar / trait / feat / class panels
 * are several thousand lines and tightly coupled to the live game runtime
 * (battle map, websockets, drag-and-drop). Partner apps that mount the
 * library-dialogs package only need a faithful editor for the persisted
 * row shape, not the live UX, so each editor here is a focused
 * add / remove / inline-edit list keyed on the child table's columns.
 *
 * Server `replaceCharacterChildren` performs FK ID remapping on items+
 * spells (oldId -> newId) so client-side ids on hotbars/etc. that point
 * at child rows in the same payload are rewritten correctly. Each editor
 * therefore preserves the child row's `id` (or assigns a stable
 * placeholder for create) when emitting onChange.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section, Panel, Badge,
} from "../ui/primitives";
import { optionalNum, uid } from "../lib/utils";

const ATTRIBUTES = ["might", "finesse", "wit", "presence", "will", "craft"] as const;
const HOTBAR_TYPES = [
  "weapons", "magic", "skills", "consumables", "utility", "armor",
] as const;

export interface CharItemDraft {
  id?: string;
  name: string;
  itemType?: string;
  quantity?: number;
  description?: string | null;
  damage?: string | null;
  damageType?: string | null;
  mod?: number | null;
  range?: number | null;
  armorBonus?: number | null;
  damageReduction?: number | null;
  armorSlot?: string | null;
  isEquipped?: boolean;
  /** Parent container item id for nested inventory; preserved verbatim
   *  through the upsert so server-side ID remap rewrites it correctly. */
  containerId?: string | null;
  /** Per-item roll entries. Server `replaceCharacterChildren` strips and
   *  re-inserts these against the freshly-remapped item id. */
  rolls?: unknown[];
}
export interface CharSpellDraft {
  id?: string;
  name: string;
  level?: number;
  damageDice?: string | null;
  damageType?: string | null;
  attribute?: string | null;
  energyCost?: number;
  manaCost?: number;
  isEquipped?: boolean;
  description?: string | null;
  /** Per-spell roll entries. Server `replaceCharacterChildren` strips and
   *  re-inserts these against the freshly-remapped spell id. */
  rolls?: unknown[];
}
export interface CharHotbarDraft {
  id?: string;
  hotbarType: string;
  slotNumber: number;
  itemId?: string | null;
  spellId?: string | null;
  skillName?: string | null;
  traitId?: string | null;
}
export interface CharCustomSkillDraft {
  id?: string;
  systemSkillId?: string | null;
  name: string;
  parentAttribute: string;
  value: number;
}
export interface CharTraitDraft {
  id?: string;
  systemTraitId?: string | null;
  name: string;
  description?: string | null;
  parentAttribute: string;
  usesPerLongRest: number;
  usesPerShortRest?: number | null;
  currentUses: number;
  damageModifierType?: string | null;
  damageModifierDamageType?: string | null;
  damageModifierValue?: number | null;
  visionModifier?: number | null;
}
export interface CharFeatRefDraft {
  id?: string;
  featId: string;
}
export interface CharClassDraft {
  id?: string;
  classId: string;
  classLevel: number;
  classPoints: number;
}
export interface CharClassSkillDraft {
  id?: string;
  classId: string;
  nodeId: string;
}

/* ===================== Items ===================== */
export const CharacterItemsEditor: React.FC<{
  value: CharItemDraft[];
  onChange: (next: CharItemDraft[]) => void;
}> = ({ value, onChange }) => {
  const set = (i: number, patch: Partial<CharItemDraft>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, { id: uid("item"), name: "New Item", itemType: "utility", quantity: 1 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Panel data-testid="char-items-editor">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Inventory items</Label>
          <Badge tone="muted">{value.length}</Badge>
        </Row>
        {value.map((it, i) => (
          <Panel key={it.id ?? i}>
            <Stack gap="sm">
              <Grid3>
                <div><Label>Name</Label>
                  <Input value={it.name} onChange={e => set(i, { name: e.target.value })} data-testid={`input-charitem-name-${i}`} />
                </div>
                <div><Label>Type</Label>
                  <Input value={it.itemType ?? ""} onChange={e => set(i, { itemType: e.target.value })} placeholder="weapon, armor, …" />
                </div>
                <div><Label>Quantity</Label>
                  <Input type="number" value={it.quantity ?? 1} onChange={e => set(i, { quantity: optionalNum(e.target.value) ?? 1 })} />
                </div>
              </Grid3>
              <Grid3>
                <div><Label>Damage</Label>
                  <Input value={it.damage ?? ""} placeholder="1d8" onChange={e => set(i, { damage: e.target.value || null })} />
                </div>
                <div><Label>Damage type</Label>
                  <Input value={it.damageType ?? ""} onChange={e => set(i, { damageType: e.target.value || null })} />
                </div>
                <div><Label>Mod</Label>
                  <Input type="number" value={it.mod ?? 0} onChange={e => set(i, { mod: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <div><Label>Armor bonus</Label>
                  <Input type="number" value={it.armorBonus ?? 0} onChange={e => set(i, { armorBonus: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <div><Label>Armor slot</Label>
                  <Input value={it.armorSlot ?? ""} placeholder="helm, chest…" onChange={e => set(i, { armorSlot: e.target.value || null })} />
                </div>
                <Row><Checkbox checked={!!it.isEquipped} onCheckedChange={v => set(i, { isEquipped: v })} /><Label>Equipped</Label></Row>
              </Grid3>
              <div><Label>Description</Label>
                <Textarea value={it.description ?? ""} onChange={e => set(i, { description: e.target.value })} />
              </div>
              <Row><Button variant="danger" size="sm" onClick={() => remove(i)} data-testid={`button-remove-charitem-${i}`}>Remove</Button></Row>
            </Stack>
          </Panel>
        ))}
        <Button size="sm" onClick={add} data-testid="button-add-charitem">+ Add item</Button>
      </Stack>
    </Panel>
  );
};

/* ===================== Spells ===================== */
export const CharacterSpellsEditor: React.FC<{
  value: CharSpellDraft[];
  onChange: (next: CharSpellDraft[]) => void;
}> = ({ value, onChange }) => {
  const set = (i: number, patch: Partial<CharSpellDraft>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, { id: uid("spell"), name: "New Spell", level: 1, energyCost: 1, manaCost: 0 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Panel data-testid="char-spells-editor">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Known spells</Label>
          <Badge tone="muted">{value.length}</Badge>
        </Row>
        {value.map((sp, i) => (
          <Panel key={sp.id ?? i}>
            <Stack gap="sm">
              <Grid3>
                <div><Label>Name</Label>
                  <Input value={sp.name} onChange={e => set(i, { name: e.target.value })} data-testid={`input-charspell-name-${i}`} />
                </div>
                <div><Label>Level</Label>
                  <Input type="number" value={sp.level ?? 1} onChange={e => set(i, { level: optionalNum(e.target.value) ?? 1 })} />
                </div>
                <div><Label>Attribute</Label>
                  <Select value={sp.attribute ?? ""} onValueChange={v => set(i, { attribute: v || null })}>
                    <SelectItem value="">—</SelectItem>
                    {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </Select>
                </div>
                <div><Label>Damage dice</Label>
                  <Input value={sp.damageDice ?? ""} placeholder="2d6" onChange={e => set(i, { damageDice: e.target.value || null })} />
                </div>
                <div><Label>Damage type</Label>
                  <Input value={sp.damageType ?? ""} onChange={e => set(i, { damageType: e.target.value || null })} />
                </div>
                <Row><Checkbox checked={!!sp.isEquipped} onCheckedChange={v => set(i, { isEquipped: v })} /><Label>Equipped</Label></Row>
                <div><Label>Energy cost</Label>
                  <Input type="number" value={sp.energyCost ?? 1} onChange={e => set(i, { energyCost: optionalNum(e.target.value) ?? 1 })} />
                </div>
                <div><Label>Mana cost</Label>
                  <Input type="number" value={sp.manaCost ?? 0} onChange={e => set(i, { manaCost: optionalNum(e.target.value) ?? 0 })} />
                </div>
              </Grid3>
              <div><Label>Description</Label>
                <Textarea value={sp.description ?? ""} onChange={e => set(i, { description: e.target.value })} />
              </div>
              <Row><Button variant="danger" size="sm" onClick={() => remove(i)} data-testid={`button-remove-charspell-${i}`}>Remove</Button></Row>
            </Stack>
          </Panel>
        ))}
        <Button size="sm" onClick={add} data-testid="button-add-charspell">+ Add spell</Button>
      </Stack>
    </Panel>
  );
};

/* ===================== Hotbars ===================== */
export const CharacterHotbarsEditor: React.FC<{
  value: CharHotbarDraft[];
  items: CharItemDraft[];
  spells: CharSpellDraft[];
  traits: CharTraitDraft[];
  onChange: (next: CharHotbarDraft[]) => void;
}> = ({ value, items, spells, traits, onChange }) => {
  const set = (i: number, patch: Partial<CharHotbarDraft>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, { id: uid("hb"), hotbarType: "weapons", slotNumber: 0 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Panel data-testid="char-hotbars-editor">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Hotbar slots</Label>
          <Badge tone="muted">{value.length}</Badge>
        </Row>
        {value.map((hb, i) => (
          <Panel key={hb.id ?? i}>
            <Grid3>
              <div><Label>Type</Label>
                <Select value={hb.hotbarType} onValueChange={v => set(i, { hotbarType: v })}>
                  {HOTBAR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </Select>
              </div>
              <div><Label>Slot</Label>
                <Input type="number" value={hb.slotNumber} onChange={e => set(i, { slotNumber: optionalNum(e.target.value) ?? 0 })} />
              </div>
              <Row><Button variant="danger" size="sm" onClick={() => remove(i)}>Remove</Button></Row>
              <div><Label>Item</Label>
                <Select value={hb.itemId ?? ""} onValueChange={v => set(i, { itemId: v || null })}>
                  <SelectItem value="">—</SelectItem>
                  {items.map(it => <SelectItem key={it.id ?? it.name} value={it.id ?? ""}>{it.name}</SelectItem>)}
                </Select>
              </div>
              <div><Label>Spell</Label>
                <Select value={hb.spellId ?? ""} onValueChange={v => set(i, { spellId: v || null })}>
                  <SelectItem value="">—</SelectItem>
                  {spells.map(sp => <SelectItem key={sp.id ?? sp.name} value={sp.id ?? ""}>{sp.name}</SelectItem>)}
                </Select>
              </div>
              <div><Label>Skill / Trait</Label>
                <Input value={hb.skillName ?? ""} placeholder="skill name" onChange={e => set(i, { skillName: e.target.value || null })} />
                <Select value={hb.traitId ?? ""} onValueChange={v => set(i, { traitId: v || null })}>
                  <SelectItem value="">— trait —</SelectItem>
                  {traits.map(t => <SelectItem key={t.id ?? t.name} value={t.id ?? ""}>{t.name}</SelectItem>)}
                </Select>
              </div>
            </Grid3>
          </Panel>
        ))}
        <Button size="sm" onClick={add} data-testid="button-add-hotbar">+ Add slot</Button>
      </Stack>
    </Panel>
  );
};

/* ===================== Custom skills ===================== */
export const CharacterCustomSkillsEditor: React.FC<{
  value: CharCustomSkillDraft[];
  onChange: (next: CharCustomSkillDraft[]) => void;
}> = ({ value, onChange }) => {
  const set = (i: number, patch: Partial<CharCustomSkillDraft>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, { id: uid("cs"), name: "New Skill", parentAttribute: "wit", value: 0 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Panel data-testid="char-custom-skills-editor">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Custom skills</Label>
          <Badge tone="muted">{value.length}</Badge>
        </Row>
        {value.map((s, i) => (
          <Grid3 key={s.id ?? i}>
            <div><Label>Name</Label>
              <Input value={s.name} onChange={e => set(i, { name: e.target.value })} />
            </div>
            <div><Label>Attribute</Label>
              <Select value={s.parentAttribute} onValueChange={v => set(i, { parentAttribute: v })}>
                {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </Select>
            </div>
            <Row>
              <div style={{ flex: 1 }}><Label>Value</Label>
                <Input type="number" value={s.value} onChange={e => set(i, { value: optionalNum(e.target.value) ?? 0 })} />
              </div>
              <Button variant="danger" size="sm" onClick={() => remove(i)}>×</Button>
            </Row>
          </Grid3>
        ))}
        <Button size="sm" onClick={add} data-testid="button-add-customskill">+ Add custom skill</Button>
      </Stack>
    </Panel>
  );
};

/* ===================== Traits ===================== */
export const CharacterTraitsEditor: React.FC<{
  value: CharTraitDraft[];
  onChange: (next: CharTraitDraft[]) => void;
}> = ({ value, onChange }) => {
  const set = (i: number, patch: Partial<CharTraitDraft>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, {
    id: uid("tr"), name: "New Trait", parentAttribute: "will",
    usesPerLongRest: 1, usesPerShortRest: 0, currentUses: 1,
  }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Panel data-testid="char-traits-editor">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Traits</Label>
          <Badge tone="muted">{value.length}</Badge>
        </Row>
        {value.map((t, i) => (
          <Panel key={t.id ?? i}>
            <Stack gap="sm">
              <Grid3>
                <div><Label>Name</Label>
                  <Input value={t.name} onChange={e => set(i, { name: e.target.value })} />
                </div>
                <div><Label>Attribute</Label>
                  <Select value={t.parentAttribute} onValueChange={v => set(i, { parentAttribute: v })}>
                    {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </Select>
                </div>
                <Row><Button variant="danger" size="sm" onClick={() => remove(i)}>Remove</Button></Row>
                <div><Label>Uses / long rest</Label>
                  <Input type="number" value={t.usesPerLongRest} onChange={e => set(i, { usesPerLongRest: optionalNum(e.target.value) ?? 1 })} />
                </div>
                <div><Label>Uses / short rest</Label>
                  <Input type="number" value={t.usesPerShortRest ?? 0} onChange={e => set(i, { usesPerShortRest: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <div><Label>Current uses</Label>
                  <Input type="number" value={t.currentUses} onChange={e => set(i, { currentUses: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <div><Label>Damage mod type</Label>
                  <Select value={t.damageModifierType ?? "none"} onValueChange={v => set(i, { damageModifierType: v })}>
                    <SelectItem value="none">none</SelectItem>
                    <SelectItem value="reduce">reduce</SelectItem>
                    <SelectItem value="resistance">resistance</SelectItem>
                    <SelectItem value="immune">immune</SelectItem>
                  </Select>
                </div>
                <div><Label>Damage type</Label>
                  <Input value={t.damageModifierDamageType ?? ""} onChange={e => set(i, { damageModifierDamageType: e.target.value || null })} />
                </div>
                <div><Label>Damage mod value</Label>
                  <Input type="number" value={t.damageModifierValue ?? 0} onChange={e => set(i, { damageModifierValue: optionalNum(e.target.value) ?? 0 })} />
                </div>
                <div><Label>Vision modifier</Label>
                  <Input type="number" value={t.visionModifier ?? 0} onChange={e => set(i, { visionModifier: optionalNum(e.target.value) ?? 0 })} />
                </div>
              </Grid3>
              <div><Label>Description</Label>
                <Textarea value={t.description ?? ""} onChange={e => set(i, { description: e.target.value })} />
              </div>
            </Stack>
          </Panel>
        ))}
        <Button size="sm" onClick={add} data-testid="button-add-trait">+ Add trait</Button>
      </Stack>
    </Panel>
  );
};

/* ===================== Feat refs ===================== */
export const CharacterFeatsEditor: React.FC<{
  value: CharFeatRefDraft[];
  onChange: (next: CharFeatRefDraft[]) => void;
}> = ({ value, onChange }) => {
  const set = (i: number, patch: Partial<CharFeatRefDraft>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, { featId: "" }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Panel data-testid="char-feats-editor">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Unlocked feats (by feat id)</Label>
          <Badge tone="muted">{value.length}</Badge>
        </Row>
        {value.map((f, i) => (
          <Row key={f.id ?? i}>
            <Input style={{ flex: 1 }} value={f.featId} placeholder="feats.id" onChange={e => set(i, { featId: e.target.value })} />
            <Button variant="danger" size="sm" onClick={() => remove(i)}>×</Button>
          </Row>
        ))}
        <Button size="sm" onClick={add} data-testid="button-add-featref">+ Add feat ref</Button>
      </Stack>
    </Panel>
  );
};

/* ===================== Classes & class skills ===================== */
export const CharacterClassesEditor: React.FC<{
  value: CharClassDraft[];
  onChange: (next: CharClassDraft[]) => void;
}> = ({ value, onChange }) => {
  const set = (i: number, patch: Partial<CharClassDraft>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, { classId: "", classLevel: 1, classPoints: 0 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Panel data-testid="char-classes-editor">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Character classes</Label>
          <Badge tone="muted">{value.length}</Badge>
        </Row>
        {value.map((c, i) => (
          <Grid3 key={c.id ?? i}>
            <div><Label>Class id</Label>
              <Input value={c.classId} onChange={e => set(i, { classId: e.target.value })} />
            </div>
            <div><Label>Level</Label>
              <Input type="number" value={c.classLevel} onChange={e => set(i, { classLevel: optionalNum(e.target.value) ?? 1 })} />
            </div>
            <Row>
              <div style={{ flex: 1 }}><Label>Points</Label>
                <Input type="number" value={c.classPoints} onChange={e => set(i, { classPoints: optionalNum(e.target.value) ?? 0 })} />
              </div>
              <Button variant="danger" size="sm" onClick={() => remove(i)}>×</Button>
            </Row>
          </Grid3>
        ))}
        <Button size="sm" onClick={add} data-testid="button-add-class">+ Add class</Button>
      </Stack>
    </Panel>
  );
};

export const CharacterClassSkillsEditor: React.FC<{
  value: CharClassSkillDraft[];
  onChange: (next: CharClassSkillDraft[]) => void;
}> = ({ value, onChange }) => {
  const set = (i: number, patch: Partial<CharClassSkillDraft>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, { classId: "", nodeId: "" }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Panel data-testid="char-classskills-editor">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Unlocked class skill nodes</Label>
          <Badge tone="muted">{value.length}</Badge>
        </Row>
        {value.map((s, i) => (
          <Grid2 key={s.id ?? i}>
            <div><Label>Class id</Label>
              <Input value={s.classId} onChange={e => set(i, { classId: e.target.value })} />
            </div>
            <Row>
              <div style={{ flex: 1 }}><Label>Node id</Label>
                <Input value={s.nodeId} onChange={e => set(i, { nodeId: e.target.value })} />
              </div>
              <Button variant="danger" size="sm" onClick={() => remove(i)}>×</Button>
            </Row>
          </Grid2>
        ))}
        <Button size="sm" onClick={add} data-testid="button-add-classskill">+ Add class skill</Button>
      </Stack>
    </Panel>
  );
};
