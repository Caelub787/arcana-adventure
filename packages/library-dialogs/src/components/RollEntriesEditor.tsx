/**
 * Draft-mode RollEntriesEditor.
 *
 * Operates entirely on a local draft array passed in via `value`/`onChange`.
 * The parent dialog bundles the draft into the sync upsert payload — there
 * are NO live REST calls per-roll, which matches CanvasRealms' transport
 * model and the children-aware /api/sync/v1 contract.
 *
 * The data shape produced here is byte-identical to Arcana's `roll_entries`
 * row shape (see shared/schema.ts:1435), so a roll created here round-trips
 * faithfully into Arcana's UI.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section, Panel, Badge,
} from "../ui/primitives";
import { sortRollsForDisplay, collectFolderNames } from "../lib/rollSort";
import { AAV2_EFFECT_TYPES, LEGACY_DAMAGE_TYPES, isAAv2 } from "../lib/effectTypes";
import { uid, optionalNum } from "../lib/utils";
import type { HostAdapter } from "../types";

/* ----- public draft shape ----- */
export type RollEntryDraft = {
  id?: string;
  // Local-only key for keying React lists pre-server-id.
  _localId?: string;
  ownerType?: "item" | "spell";
  ownerId?: string;
  name: string;
  description?: string | null;
  rollType: string;
  diceFormula?: string | null;
  mod?: number | null;
  damageType?: string | null;
  attribute?: string | null;
  applyToStat?: "none" | "hp" | "energy" | "mana" | string;
  sortOrder?: number;
  folder?: string | null;
  priority?: number;
  range?: number | null;
  aoeShape?: string | null;
  aoeRange?: number | null;
  requiresSave?: boolean;
  saveAttribute?: string | null;
  saveDc?: number | null;
  saveSuccessEffect?: string | null;
  saveDcType?: "value" | "caster";
  saveDcAttribute?: string | null;
  statDirection?: "subtract" | "add";
  gainEnergy?: boolean;
  isAttack?: boolean;
  isAoe?: boolean;
  passesThroughWalls?: boolean;
  primaryColor?: string | null;
  requiresEnergy?: boolean;
  energyCost?: number | null;
  requiresMana?: boolean;
  manaCost?: number | null;
  noRoll?: boolean;
  enableChatMessage?: boolean;
  chatMessage?: string | null;
  applyTokenEffects?: boolean;
  tokenEffectIds?: string[] | null;
  effectTriggerCondition?: string;
  isHidden?: boolean;
  hasDcCheck?: boolean;
  dcToSucceed?: number | null;
  dcToSucceedAttribute?: string | null;
  dcToSucceedType?: "value" | "caster" | "target";
  dcToSucceedDcAttribute?: string | null;
  dcToSucceedSuccessEffect?: string | null;
  dcCheckRollMode?: "main" | "separate";
  hasItemCost?: boolean;
  itemCosts?: Array<{ itemId: string; name: string; consumed: boolean }>;
  fromTemplateRollId?: string | null;
  isOverridden?: boolean;
  // Read-only enrichment from the server (see server/routes.ts enrichWithTemplateNames):
  templateName?: string;
  templatePriority?: number;
  templateUseOwnOrder?: boolean;
  templateOwnerKey?: string;
};

const ATTRIBUTES = ["might", "finesse", "wit", "presence", "will", "craft"] as const;
const ROLL_TYPES = ["attack", "damage", "heal", "effect"] as const;
const AOE_SHAPES = ["", "cone", "sphere", "line", "cube", "cylinder"] as const;

export interface RollEntriesEditorProps {
  value: RollEntryDraft[];
  onChange: (next: RollEntryDraft[]) => void;
  ownerType: "item" | "spell";
  /** Drives `mana` apply-to-stat option + AAv2-only item costs. */
  campaignSystem?: string;
  host: HostAdapter;
  /** AAv2 admin items list, for the Item Cost picker. Defaults to fetched via host on demand. */
  adminItems?: Array<{ id: string; name: string }>;
}

function emptyRoll(ownerType: "item" | "spell"): RollEntryDraft {
  return {
    _localId: uid("roll"),
    ownerType,
    name: "New Roll",
    rollType: "attack",
    diceFormula: "1d20",
    mod: 0,
    isAttack: true,
    priority: 1,
    sortOrder: 0,
    applyToStat: "none",
    saveDcType: "value",
    statDirection: "subtract",
    effectTriggerCondition: "always",
    dcCheckRollMode: "main",
    dcToSucceedType: "value",
    hasItemCost: false,
    itemCosts: [],
  };
}

export const RollEntriesEditor: React.FC<RollEntriesEditorProps> = ({
  value, onChange, ownerType, campaignSystem, host, adminItems: adminItemsProp,
}) => {
  const [adminItems, setAdminItems] = React.useState<Array<{ id: string; name: string }>>(adminItemsProp ?? []);

  // Lazy-load admin items via the sync API the first time an item-cost picker opens.
  const ensureAdminItems = React.useCallback(async () => {
    if (adminItems.length > 0) return;
    try {
      const res = await host.transport.list<{ id: string; name: string }>("item");
      setAdminItems((res.data ?? []).map((it: any) => ({ id: it.id, name: it.name })));
    } catch (e: any) {
      host.notify("warning", `Could not load items for cost picker: ${e?.message ?? e}`);
    }
  }, [adminItems.length, host]);

  const aav2 = isAAv2(campaignSystem);
  const damageTypes = aav2 ? AAV2_EFFECT_TYPES : LEGACY_DAMAGE_TYPES;

  const addRoll = () => onChange([...value, { ...emptyRoll(ownerType), sortOrder: value.length }]);
  const updateAt = (idx: number, patch: Partial<RollEntryDraft>) => {
    const next = value.slice();
    const cur = next[idx];
    next[idx] = { ...cur, ...patch };
    // If this was an inherited roll, mark it overridden the moment a meaningful field changes.
    if (cur.fromTemplateRollId && !cur.isOverridden) {
      next[idx].isOverridden = true;
    }
    onChange(next);
  };
  const removeAt = (idx: number) => {
    const cur = value[idx];
    if (cur.fromTemplateRollId && !cur.isOverridden) {
      host.notify("info", "Inherited rolls are detached on delete (the template still has its copy).");
    }
    onChange(value.filter((_, i) => i !== idx));
  };
  // Reset-to-template is intentionally NOT wired in the foundation slice.
  // The endpoint POST /api/roll-entries/:id/reset-template lives outside the
  // sync API and isn't reachable through ArcanaSyncClient. The "(modified)"
  // badge still surfaces overridden status so users aren't misled.

  const sorted = React.useMemo(() => sortRollsForDisplay(value as any), [value]);
  const folders = React.useMemo(() => collectFolderNames(value as any), [value]);

  return (
    <Stack data-testid="roll-entries-editor">
      <Row style={{ justifyContent: "space-between" }}>
        <span className="ld-label" style={{ margin: 0 }}>Rolls ({value.length})</span>
        <Button variant="primary" size="sm" onClick={addRoll} data-testid="button-add-roll">+ Add Roll</Button>
      </Row>

      {value.length === 0 && (
        <div className="ld-subtle" style={{ padding: "10px 0" }}>No rolls yet.</div>
      )}

      {sorted.map((sortedRoll: any) => {
        const idx = value.findIndex(r => (r._localId ?? r.id) === (sortedRoll._localId ?? sortedRoll.id));
        if (idx < 0) return null;
        const roll = value[idx];
        return (
          <RollRow
            key={roll._localId ?? roll.id ?? idx}
            roll={roll}
            damageTypes={damageTypes}
            aav2={aav2}
            adminItems={adminItems}
            ensureAdminItems={ensureAdminItems}
            knownFolders={folders}
            onChange={(patch) => updateAt(idx, patch)}
            onRemove={() => removeAt(idx)}
          />
        );
      })}
    </Stack>
  );
};

/* ====== single-row editor — rendered once per roll ====== */
const RollRow: React.FC<{
  roll: RollEntryDraft;
  damageTypes: string[];
  aav2: boolean;
  adminItems: Array<{ id: string; name: string }>;
  ensureAdminItems: () => Promise<void>;
  knownFolders: string[];
  onChange: (patch: Partial<RollEntryDraft>) => void;
  onRemove: () => void;
}> = ({ roll, damageTypes, aav2, adminItems, ensureAdminItems, knownFolders, onChange, onRemove }) => {
  const [open, setOpen] = React.useState(true);
  const inherited = !!roll.fromTemplateRollId;

  return (
    <Panel data-testid={`roll-row-${roll._localId ?? roll.id}`}>
      <div className="ld-panel-header">
        <Row>
          <button
            className="ld-btn"
            data-variant="ghost"
            data-size="sm"
            onClick={() => setOpen(o => !o)}
            data-testid="button-toggle-roll"
          >{open ? "▾" : "▸"}</button>
          <strong style={{ color: "var(--ld-text)" }}>{roll.name || "(unnamed roll)"}</strong>
          <Badge tone="muted">{roll.rollType}</Badge>
          {inherited && (
            <Badge tone={roll.isOverridden ? "violet" : "accent"}>
              from {roll.templateName ?? "template"}{roll.isOverridden ? " (modified)" : ""}
            </Badge>
          )}
        </Row>
        <Row>
          <Button size="sm" variant="danger" onClick={onRemove} data-testid="button-remove-roll">Remove</Button>
        </Row>
      </div>

      {!open ? null : (
        <Stack gap="sm">
          <Grid2>
            <div>
              <Label>Name</Label>
              <Input value={roll.name} onChange={e => onChange({ name: e.target.value })} data-testid="input-roll-name" />
            </div>
            <div>
              <Label>Roll Type</Label>
              <Select value={roll.rollType} onValueChange={v => onChange({ rollType: v })}>
                {ROLL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </Select>
            </div>
          </Grid2>

          <div>
            <Label>Description</Label>
            <Textarea value={roll.description ?? ""} onChange={e => onChange({ description: e.target.value })}
              placeholder="Optional — explain what this roll does."
              data-testid="textarea-roll-description" />
          </div>

          <Grid3>
            <div>
              <Label>Dice Formula</Label>
              <Input value={roll.diceFormula ?? ""} placeholder="1d20"
                onChange={e => onChange({ diceFormula: e.target.value })}
                disabled={!!roll.noRoll}
                data-testid="input-roll-dice" />
            </div>
            <div>
              <Label>Mod</Label>
              <Input type="number" value={roll.mod ?? 0}
                onChange={e => onChange({ mod: optionalNum(e.target.value) ?? 0 })}
                data-testid="input-roll-mod" />
            </div>
            <div>
              <Label>Attribute</Label>
              <Select value={roll.attribute ?? ""} onValueChange={v => onChange({ attribute: v || null })}>
                <SelectItem value="">None</SelectItem>
                {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </Select>
            </div>
          </Grid3>

          <Grid3>
            <div>
              <Label>Damage Type</Label>
              <Select value={roll.damageType ?? ""} onValueChange={v => onChange({ damageType: v || null })}>
                <SelectItem value="">None</SelectItem>
                {damageTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </Select>
            </div>
            <div>
              <Label>Apply to Stat</Label>
              <Select value={roll.applyToStat ?? "none"} onValueChange={v => onChange({ applyToStat: v as any })}>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="hp">HP</SelectItem>
                <SelectItem value="energy">Energy</SelectItem>
                {aav2 && <SelectItem value="mana">Mana</SelectItem>}
              </Select>
            </div>
            <div>
              <Label>Direction</Label>
              <Select value={roll.statDirection ?? "subtract"} onValueChange={v => onChange({ statDirection: v as any })}>
                <SelectItem value="subtract">Subtract</SelectItem>
                <SelectItem value="add">Add (heal)</SelectItem>
              </Select>
            </div>
          </Grid3>

          <Grid3>
            <Row>
              <Checkbox checked={!!roll.isAttack} onCheckedChange={v => onChange({ isAttack: v })} data-testid="checkbox-is-attack" />
              <Label>Is Attack</Label>
            </Row>
            <Row>
              <Checkbox checked={!!roll.isAoe} onCheckedChange={v => onChange({ isAoe: v })} data-testid="checkbox-is-aoe" />
              <Label>Is AOE</Label>
            </Row>
            <Row>
              <Checkbox checked={!!roll.noRoll} onCheckedChange={v => onChange({ noRoll: v })} data-testid="checkbox-no-roll" />
              <Label>No Roll (auto)</Label>
            </Row>
          </Grid3>

          {roll.isAoe && (
            <Grid3>
              <div>
                <Label>AOE Shape</Label>
                <Select value={roll.aoeShape ?? ""} onValueChange={v => onChange({ aoeShape: v || null })}>
                  {AOE_SHAPES.map(s => <SelectItem key={s} value={s}>{s || "—"}</SelectItem>)}
                </Select>
              </div>
              <div>
                <Label>AOE Range</Label>
                <Input type="number" value={roll.aoeRange ?? ""} onChange={e => onChange({ aoeRange: optionalNum(e.target.value) ?? null })} />
              </div>
              <Row><Checkbox checked={!!roll.passesThroughWalls} onCheckedChange={v => onChange({ passesThroughWalls: v })} /><Label>Through walls</Label></Row>
            </Grid3>
          )}

          <Grid2>
            <div>
              <Label>Range (ft)</Label>
              <Input type="number" value={roll.range ?? ""} onChange={e => onChange({ range: optionalNum(e.target.value) ?? null })} />
            </div>
            <div>
              <Label>Primary Color (hex)</Label>
              <Input value={roll.primaryColor ?? ""} placeholder="#f59e0b" onChange={e => onChange({ primaryColor: e.target.value || null })} />
            </div>
          </Grid2>

          <Section title="Folder & priority">
            <Grid3>
              <div>
                <Label>Folder</Label>
                <Input list={`ld-folders-${roll._localId ?? roll.id}`} value={roll.folder ?? ""}
                  onChange={e => onChange({ folder: e.target.value || null })}
                  placeholder="(none)" data-testid="input-roll-folder" />
                <datalist id={`ld-folders-${roll._localId ?? roll.id}`}>
                  {knownFolders.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div>
                <Label>Priority</Label>
                <Input type="number" value={roll.priority ?? 1} onChange={e => onChange({ priority: optionalNum(e.target.value) ?? 1 })} />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={roll.sortOrder ?? 0} onChange={e => onChange({ sortOrder: optionalNum(e.target.value) ?? 0 })} />
              </div>
            </Grid3>
          </Section>

          <Section title="Resource cost">
            <Grid3>
              <Row><Checkbox checked={!!roll.requiresEnergy} onCheckedChange={v => onChange({ requiresEnergy: v })} /><Label>Requires Energy</Label></Row>
              {roll.requiresEnergy && (
                <div><Label>Energy Cost</Label>
                  <Input type="number" value={roll.energyCost ?? 0} onChange={e => onChange({ energyCost: optionalNum(e.target.value) ?? 0 })} />
                </div>
              )}
              <Row><Checkbox checked={!!roll.gainEnergy} onCheckedChange={v => onChange({ gainEnergy: v })} /><Label>Gain Energy</Label></Row>
            </Grid3>
            {aav2 && (
              <Grid2 style={{ marginTop: 8 }}>
                <Row><Checkbox checked={!!roll.requiresMana} onCheckedChange={v => onChange({ requiresMana: v })} /><Label>Requires Mana</Label></Row>
                {roll.requiresMana && (
                  <div><Label>Mana Cost</Label>
                    <Input type="number" value={roll.manaCost ?? 0} onChange={e => onChange({ manaCost: optionalNum(e.target.value) ?? 0 })} />
                  </div>
                )}
              </Grid2>
            )}
          </Section>

          <Section title="Saving throw">
            <Row><Checkbox checked={!!roll.requiresSave} onCheckedChange={v => onChange({ requiresSave: v })} /><Label>Requires Save</Label></Row>
            {roll.requiresSave && (
              <Grid3 style={{ marginTop: 8 }}>
                <div><Label>Save Attribute</Label>
                  <Select value={roll.saveAttribute ?? ""} onValueChange={v => onChange({ saveAttribute: v || null })}>
                    <SelectItem value="">None</SelectItem>
                    {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </Select>
                </div>
                <div><Label>DC Type</Label>
                  <Select value={roll.saveDcType ?? "value"} onValueChange={v => onChange({ saveDcType: v as any })}>
                    <SelectItem value="value">Static value</SelectItem>
                    <SelectItem value="caster">8 + Caster mod</SelectItem>
                  </Select>
                </div>
                {roll.saveDcType === "value" ? (
                  <div><Label>DC</Label>
                    <Input type="number" value={roll.saveDc ?? ""} onChange={e => onChange({ saveDc: optionalNum(e.target.value) ?? null })} />
                  </div>
                ) : (
                  <div><Label>DC Attribute</Label>
                    <Select value={roll.saveDcAttribute ?? ""} onValueChange={v => onChange({ saveDcAttribute: v || null })}>
                      <SelectItem value="">None</SelectItem>
                      {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </Select>
                  </div>
                )}
                <div style={{ gridColumn: "span 3" }}><Label>Save success effect (text)</Label>
                  <Input value={roll.saveSuccessEffect ?? ""} onChange={e => onChange({ saveSuccessEffect: e.target.value || null })} />
                </div>
              </Grid3>
            )}
          </Section>

          <Section title="DC to Succeed">
            <Row><Checkbox checked={!!roll.hasDcCheck} onCheckedChange={v => onChange({ hasDcCheck: v })} /><Label>Has DC check</Label></Row>
            {roll.hasDcCheck && (
              <Grid3 style={{ marginTop: 8 }}>
                <div><Label>Roll Mode</Label>
                  <Select value={roll.dcCheckRollMode ?? "main"} onValueChange={v => onChange({ dcCheckRollMode: v as any })}>
                    <SelectItem value="main">Compare main roll</SelectItem>
                    <SelectItem value="separate">Roll separate d20</SelectItem>
                  </Select>
                </div>
                <div><Label>DC Type</Label>
                  <Select value={roll.dcToSucceedType ?? "value"} onValueChange={v => onChange({ dcToSucceedType: v as any })}>
                    <SelectItem value="value">Static value</SelectItem>
                    <SelectItem value="caster">8 + Caster mod</SelectItem>
                    <SelectItem value="target">Target's DC</SelectItem>
                  </Select>
                </div>
                {roll.dcToSucceedType === "value" && (
                  <div><Label>DC</Label>
                    <Input type="number" value={roll.dcToSucceed ?? ""} onChange={e => onChange({ dcToSucceed: optionalNum(e.target.value) ?? null })} />
                  </div>
                )}
                {roll.dcCheckRollMode === "separate" && (
                  <div><Label>Separate-roll attribute</Label>
                    <Select value={roll.dcToSucceedAttribute ?? ""} onValueChange={v => onChange({ dcToSucceedAttribute: v || null })}>
                      <SelectItem value="">None</SelectItem>
                      {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </Select>
                  </div>
                )}
                {roll.dcToSucceedType === "caster" && (
                  <div><Label>DC caster attribute</Label>
                    <Select value={roll.dcToSucceedDcAttribute ?? ""} onValueChange={v => onChange({ dcToSucceedDcAttribute: v || null })}>
                      <SelectItem value="">None</SelectItem>
                      {ATTRIBUTES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </Select>
                  </div>
                )}
                <div style={{ gridColumn: "span 3" }}><Label>Success effect (text)</Label>
                  <Input value={roll.dcToSucceedSuccessEffect ?? ""} onChange={e => onChange({ dcToSucceedSuccessEffect: e.target.value || null })} />
                </div>
              </Grid3>
            )}
          </Section>

          <Section title="Item cost">
            <Row><Checkbox checked={!!roll.hasItemCost}
              onCheckedChange={v => { onChange({ hasItemCost: v }); if (v) ensureAdminItems(); }} /><Label>Requires items in inventory</Label></Row>
            {roll.hasItemCost && (
              <Stack gap="sm" style={{ marginTop: 8 }}>
                {(roll.itemCosts ?? []).map((cost, ci) => (
                  <Row key={ci}>
                    <Select value={cost.itemId} onValueChange={(v) => {
                      const found = adminItems.find(it => it.id === v);
                      const next = (roll.itemCosts ?? []).slice();
                      next[ci] = { ...cost, itemId: v, name: found?.name ?? cost.name };
                      onChange({ itemCosts: next });
                    }}>
                      <SelectItem value="">Select item…</SelectItem>
                      {adminItems.map(it => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}
                    </Select>
                    <Row><Checkbox checked={cost.consumed}
                      onCheckedChange={(v) => {
                        const next = (roll.itemCosts ?? []).slice();
                        next[ci] = { ...cost, consumed: v };
                        onChange({ itemCosts: next });
                      }} /><span className="ld-subtle">consumed</span></Row>
                    <Button size="sm" variant="danger" onClick={() => {
                      const next = (roll.itemCosts ?? []).filter((_, i) => i !== ci);
                      onChange({ itemCosts: next });
                    }}>×</Button>
                  </Row>
                ))}
                <Button size="sm" onClick={() => onChange({ itemCosts: [...(roll.itemCosts ?? []), { itemId: "", name: "", consumed: false }] })}>+ Add item cost</Button>
              </Stack>
            )}
          </Section>

          <Section title="Chat & visibility">
            <Grid2>
              <Row><Checkbox checked={!!roll.enableChatMessage} onCheckedChange={v => onChange({ enableChatMessage: v })} /><Label>Custom chat message</Label></Row>
              <Row><Checkbox checked={!!roll.isHidden} onCheckedChange={v => onChange({ isHidden: v })} /><Label>Hide from players</Label></Row>
            </Grid2>
            {roll.enableChatMessage && (
              <Textarea value={roll.chatMessage ?? ""} onChange={e => onChange({ chatMessage: e.target.value })}
                style={{ marginTop: 8 }} placeholder="What appears in chat when this roll fires." />
            )}
          </Section>
        </Stack>
      )}
    </Panel>
  );
};
