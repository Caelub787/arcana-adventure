import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Section,
} from "../ui/primitives";
import { NumberInput } from "../components/NumberInput";
import { HostModal, SaveCancelFooter } from "../ui/DefaultModal";
import { RollEntriesEditor, type RollEntryDraft } from "../components/RollEntriesEditor";
import { ItemTemplateLinksPanel } from "../components/ItemTemplateLinksPanel";
import { isAAv2, getEffectTypes, getEffectTypeLabel } from "../lib/effectTypes";
import type { DialogProps } from "../types";

const SPELL_ATTRIBUTES = ["might", "finesse", "wit", "presence", "will", "craft"] as const;
const ACTION_TYPES = ["action", "bonus action"] as const;
const DURATIONS = [
  "Instant", "1 Round", "1 Minute", "10 Minutes", "30 Minutes",
  "1 Hour", "6 Hours", "12 Hours", "1 Day", "1 Week", "1 Month",
  "1 Year", "Permanent",
] as const;
const AOE_SHAPES = ["circle", "sphere", "square", "cube", "cone", "line"] as const;
const SAVE_SUCCESS = [
  { value: "half", label: "Half Damage" },
  { value: "quarter", label: "Quarter Damage" },
  { value: "none", label: "No Damage" },
  { value: "no_effect", label: "No Effect" },
] as const;
const TARGET_TYPES = ["single", "self", "area", "multi"] as const;

export interface SpellDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;

  name: string;
  description?: string | null;
  icon?: string | null;

  school?: string | null;
  level?: number;
  components?: string | null;
  concentration?: boolean;
  ritual?: boolean;
  targetType?: string | null;
  areaSize?: string | null;

  castingTime?: string | null;
  duration?: string | null;
  rangeNum?: number | null;
  range?: string | null;
  attribute?: string | null;

  damageDice?: string | null;
  damageType?: string | null;
  gainEnergy?: boolean;
  healingDice?: string | null;
  mod?: number | null;
  energyCost?: number;
  manaCost?: number;

  isAttack?: boolean;
  isAoe?: boolean;
  aoeShape?: string | null;
  aoeRange?: number | null;
  passesThroughWalls?: boolean;
  aoe?: string | null;

  requiresSave?: boolean;
  saveAttribute?: string | null;
  saveDc?: number | null;
  saveSuccessEffect?: string | null;
  savingThrow?: string | null;

  effects?: unknown;

  system?: string;
  isArchived?: boolean;
  isLiveTemplate?: boolean;
  ownerUserId?: string | null;

  rolls?: RollEntryDraft[];
  templateLinks?: string[];
}

// Server enriches GET responses with rolls + templateLinks and may
// return templateLinks as either bare ids or {templateId} objects.
interface SpellApiPayload extends Omit<SpellDraft, "rolls" | "templateLinks"> {
  rolls?: RollEntryDraft[];
  templateLinks?: Array<string | { templateId?: string }>;
}

const FRESH: SpellDraft = {
  name: "",
  description: "",
  icon: "",
  school: "Evocation",
  level: 1,
  components: "V, S",
  concentration: false,
  ritual: false,
  targetType: "single",
  areaSize: "",
  castingTime: "action",
  duration: "Instant",
  rangeNum: 30,
  attribute: "",
  damageDice: "",
  damageType: "",
  gainEnergy: false,
  healingDice: "",
  mod: 0,
  energyCost: 1,
  manaCost: 0,
  isAttack: true,
  isAoe: false,
  aoeShape: "",
  aoeRange: 15,
  passesThroughWalls: false,
  requiresSave: false,
  saveAttribute: "",
  saveDc: 15,
  saveSuccessEffect: "half",
  savingThrow: "",
  effects: [],
  system: "aa-v2",
  rolls: [],
  templateLinks: [],
};

function normalizeCastingTime(ct: string | undefined | null): string {
  if (!ct) return "action";
  return ct.toLowerCase().includes("bonus") ? "bonus action" : "action";
}
function normalizeDuration(d: string | undefined | null): string {
  if (!d) return "Instant";
  const lower = d.toLowerCase();
  return (lower === "instantaneous" || lower === "instant") ? "Instant" : d;
}
function normalizeTemplateLinks(links: SpellApiPayload["templateLinks"]): string[] {
  return (links ?? []).map(l => typeof l === "string" ? l : (l?.templateId ?? "")).filter(s => !!s);
}

export const SpellDialog: React.FC<DialogProps<SpellDraft>> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, campaignSystem, mode,
}) => {
  const [draft, setDraft] = React.useState<SpellDraft>(FRESH);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [effectsText, setEffectsText] = React.useState("[]");
  const [effectsError, setEffectsError] = React.useState<string | null>(null);

  const aav2 = isAAv2(campaignSystem ?? draft.system);
  const aav3 = (campaignSystem ?? draft.system) === "aa-v3";
  const damageTypes = getEffectTypes(campaignSystem ?? draft.system);
  const damageTypeLabel = getEffectTypeLabel(campaignSystem ?? draft.system);
  const editing = mode ? mode === "edit" : !!initialValue?.id;

  React.useEffect(() => {
    if (!open) return;
    if (!initialValue?.id) {
      const seed: SpellDraft = {
        ...FRESH,
        ...(initialValue ?? {}),
        castingTime: normalizeCastingTime(initialValue?.castingTime),
        duration: normalizeDuration(initialValue?.duration),
      };
      setDraft(seed);
      setEffectsText(JSON.stringify(seed.effects ?? [], null, 2));
      setEffectsError(null);
      return;
    }
    setLoading(true);
    host.transport.get<SpellApiPayload>("spell", initialValue.id)
      .then(env => {
        const data = env.data;
        const next: SpellDraft = {
          ...FRESH,
          ...data,
          castingTime: normalizeCastingTime(data.castingTime),
          duration: normalizeDuration(data.duration),
          rolls: (data.rolls ?? []).map(r => ({ ...r, _localId: r.id })),
          templateLinks: normalizeTemplateLinks(data.templateLinks),
        };
        setDraft(next);
        setEffectsText(JSON.stringify(next.effects ?? [], null, 2));
        setEffectsError(null);
      })
      .catch(e => host.notify("error", `Failed to load spell: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host]);

  const set = React.useCallback((patch: Partial<SpellDraft>) => setDraft(d => ({ ...d, ...patch })), []);

  const numChange = React.useCallback((field: keyof SpellDraft, value: string, fallback: number = 0) => {
    if (value === "") { setDraft(d => ({ ...d, [field]: fallback })); return; }
    const n = parseInt(value, 10);
    setDraft(d => ({ ...d, [field]: Number.isFinite(n) ? n : fallback }));
  }, []);

  const handleSave = async () => {
    if (!draft.name.trim()) {
      host.notify("warning", "Spell name is required.");
      return;
    }
    if (effectsError) {
      host.notify("warning", `Fix the Effects JSON before saving: ${effectsError}`);
      return;
    }
    setSaving(true);
    try {
      const { rolls, templateLinks, ...parentFields } = draft;

      let parsedEffects: unknown = draft.effects ?? [];
      try { parsedEffects = effectsText.trim() ? JSON.parse(effectsText) : []; } catch { /* fallback above */ }

      const norm = (v: string | null | undefined) => (v && v !== "_none" ? v : "");

      const payload: SpellApiPayload = {
        ...parentFields,
        attribute: norm(draft.attribute),
        saveAttribute: norm(draft.saveAttribute),
        damageType: norm(draft.damageType),
        aoeShape: draft.isAoe ? norm(draft.aoeShape) : "",
        targetType: draft.targetType || "single",
        effects: parsedEffects,
        rolls: (rolls ?? []).map(r => {
          const { _localId, templateName, templatePriority, templateUseOwnOrder, templateOwnerKey, ...rest } = r;
          return rest;
        }),
        templateLinks: templateLinks ?? [],
      };
      if (typeof draft.rangeNum === "number") {
        payload.rangeNum = draft.rangeNum;
        payload.range = `${draft.rangeNum} ft`;
      }

      const env = editing
        ? await host.transport.patch<SpellApiPayload>("spell", draft.id!, payload)
        : await host.transport.upsert<SpellApiPayload>("spell", payload);
      const saved: SpellDraft & { id: string; externalId?: string | null } = {
        ...env.data,
        id: env.id,
        externalId: env.externalId ?? undefined,
        rolls: env.data.rolls,
        templateLinks: normalizeTemplateLinks(env.data.templateLinks),
      };
      host.notify("success", editing ? "Spell updated." : "Spell created.");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      host.notify("error", `Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <HostModal
      component={host.modal}
      open={open}
      onOpenChange={(o) => { if (!o) onCancel?.(); onOpenChange(o); }}
      title={editing ? "Edit Spell" : "Create Spell"}
      description="Mirrors Arcana's admin + in-game spell editors with full system_spells coverage."
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Basics">
            <Stack gap="sm">
              <div>
                <Label required>Name</Label>
                <Input value={draft.name} onChange={e => set({ name: e.target.value })} data-testid="input-spell-name" />
              </div>
              <div>
                <Label>Spell Icon</Label>
                <Row>
                  <Input
                    value={draft.icon ?? ""}
                    onChange={e => set({ icon: e.target.value })}
                    placeholder="https://… or data: URL"
                    data-testid="input-spell-icon"
                  />
                  {host.imagePicker && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const r = await host.imagePicker!({ title: "Pick spell icon", initialUrl: draft.icon ?? undefined });
                        if (r) set({ icon: r.url });
                      }}
                      data-testid="button-pick-spell-icon"
                    >
                      Choose Image
                    </Button>
                  )}
                </Row>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={e => set({ description: e.target.value })}
                  placeholder="Describe what the spell does..."
                  data-testid="textarea-spell-description"
                />
              </div>
            </Stack>
          </Section>

          <Section title="Classification">
            <Stack gap="sm">
              <Grid2>
                <div>
                  <Label>School</Label>
                  <Input
                    value={draft.school ?? ""}
                    onChange={e => set({ school: e.target.value })}
                    placeholder="e.g. Evocation, Abjuration"
                    data-testid="input-spell-school"
                  />
                </div>
                <div>
                  <Label>Level</Label>
                  <NumberInput
                    min={0} max={9} value={draft.level ?? 1} fallback={1}
                    onChange={(v) => set({ level: v ?? 1 })}
                    data-testid="input-spell-level"
                  />
                </div>
              </Grid2>
              <Grid2>
                <div>
                  <Label>Components</Label>
                  <Input
                    value={draft.components ?? ""}
                    onChange={e => set({ components: e.target.value })}
                    placeholder="e.g. V, S, M"
                    data-testid="input-spell-components"
                  />
                </div>
                <div>
                  <Label>Target Type</Label>
                  <Select
                    value={draft.targetType ?? "single"}
                    onValueChange={(v: SpellDraft["targetType"]) => set({ targetType: v ?? "single" })}
                    data-testid="select-spell-target-type"
                  >
                    {TARGET_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </Select>
                </div>
              </Grid2>
              <Row>
                <Checkbox
                  checked={!!draft.concentration}
                  onCheckedChange={(v: boolean) => set({ concentration: v })}
                  data-testid="checkbox-spell-concentration"
                />
                <Label>Concentration</Label>
                <Checkbox
                  checked={!!draft.ritual}
                  onCheckedChange={(v: boolean) => set({ ritual: v })}
                  data-testid="checkbox-spell-ritual"
                />
                <Label>Ritual</Label>
              </Row>
            </Stack>
          </Section>

          <Section title="Damage & cost">
            <Stack gap="sm">
              {!aav3 && (
              <Grid2>
                <div>
                  <Label>Damage Dice</Label>
                  <Input
                    value={draft.damageDice ?? ""}
                    onChange={e => set({ damageDice: e.target.value })}
                    placeholder="2d6"
                    data-testid="input-spell-damage-dice"
                  />
                </div>
                <div>
                  <Label>{damageTypeLabel}</Label>
                  <Select
                    value={draft.damageType ?? ""}
                    onValueChange={(v: SpellDraft["damageType"]) => set({ damageType: v ?? "" })}
                    data-testid="select-spell-damage-type"
                  >
                    <SelectItem value="">None</SelectItem>
                    {damageTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </Select>
                </div>
              </Grid2>
              )}
              <Grid2>
                <div>
                  <Label>Healing Dice</Label>
                  <Input
                    value={draft.healingDice ?? ""}
                    onChange={e => set({ healingDice: e.target.value })}
                    placeholder="e.g. 1d8"
                    data-testid="input-spell-healing-dice"
                  />
                </div>
                {!aav3 && (
                <div>
                  <Label>Flat Modifier</Label>
                  <NumberInput
                    value={draft.mod ?? 0}
                    onChange={(v) => set({ mod: v ?? 0 })}
                    data-testid="input-spell-mod"
                  />
                </div>
                )}
              </Grid2>
              {draft.damageType === "Energy" && (
                <Row>
                  <Checkbox
                    checked={!!draft.gainEnergy}
                    onCheckedChange={(v: boolean) => set({ gainEnergy: v })}
                    data-testid="checkbox-spell-gain-energy"
                  />
                  <Label>Gain Energy? (If checked, roll adds energy instead of subtracting)</Label>
                </Row>
              )}
              <Grid2>
                <div>
                  <Label>Energy Cost</Label>
                  <NumberInput
                    min={0} value={draft.energyCost ?? 0}
                    onChange={(v) => set({ energyCost: v ?? 0 })}
                    data-testid="input-spell-energy-cost"
                  />
                </div>
                {aav2 && (
                  <div>
                    <Label>Mana Cost</Label>
                    <NumberInput
                      min={0} value={draft.manaCost ?? 0}
                      onChange={(v) => set({ manaCost: v ?? 0 })}
                      data-testid="input-spell-mana-cost"
                    />
                  </div>
                )}
              </Grid2>
            </Stack>
          </Section>

          <Section title="Cast">
            <Stack gap="sm">
              <Grid2>
                <div>
                  <Label>Action Type</Label>
                  <Select
                    value={draft.castingTime ?? "action"}
                    onValueChange={(v: SpellDraft["castingTime"]) => set({ castingTime: v ?? "action" })}
                    data-testid="select-spell-action-type"
                  >
                    {ACTION_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t === "action" ? "Action" : "Bonus Action"}</SelectItem>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Duration</Label>
                  <Select
                    value={draft.duration ?? "Instant"}
                    onValueChange={(v: SpellDraft["duration"]) => set({ duration: v ?? "Instant" })}
                    data-testid="select-spell-duration"
                  >
                    {DURATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </Select>
                </div>
              </Grid2>
              {!aav3 && (
              <Grid2>
                <div>
                  <Label>Range (ft)</Label>
                  <NumberInput
                    min={0} value={draft.rangeNum ?? 30} fallback={30}
                    onChange={(v) => set({ rangeNum: v ?? 30 })}
                    data-testid="input-spell-range"
                  />
                </div>
                <div>
                  <Label>Attribute (for rolls)</Label>
                  <Select
                    value={draft.attribute ?? ""}
                    onValueChange={(v: SpellDraft["attribute"]) => set({ attribute: v ?? "" })}
                    data-testid="select-spell-attribute"
                  >
                    <SelectItem value="">None</SelectItem>
                    {SPELL_ATTRIBUTES.map(a => (
                      <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>
                    ))}
                  </Select>
                </div>
              </Grid2>
              )}
            </Stack>
          </Section>

          <Section title="Behavior">
            <Stack gap="sm">
              <Row>
                <Checkbox
                  checked={!!draft.isAttack}
                  onCheckedChange={(v: boolean) => set({ isAttack: v })}
                  data-testid="checkbox-spell-isattack"
                />
                <Label>Attack? (If checked: Attack/Damage rolls. If not: Use/Effect rolls)</Label>
              </Row>
              {!aav3 && (<>
              <Row>
                <Checkbox
                  checked={!!draft.isAoe}
                  onCheckedChange={(v: boolean) => set({ isAoe: v })}
                  data-testid="checkbox-spell-aoe"
                />
                <Label>Area of Effect (AoE)</Label>
              </Row>
              {draft.isAoe && (
                <>
                  <Grid2>
                    <div>
                      <Label>AoE Shape</Label>
                      <Select
                        value={draft.aoeShape ?? ""}
                        onValueChange={(v: SpellDraft["aoeShape"]) => set({ aoeShape: v ?? "" })}
                        data-testid="select-spell-aoe-shape"
                      >
                        <SelectItem value="">None</SelectItem>
                        {AOE_SHAPES.map(s => (
                          <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>AoE Range (feet)</Label>
                      <NumberInput
                        min={0} value={draft.aoeRange ?? 15} fallback={15}
                        onChange={(v) => set({ aoeRange: v ?? 15 })}
                        data-testid="input-spell-aoe-range"
                      />
                    </div>
                  </Grid2>
                  <div>
                    <Label>Area Size (text)</Label>
                    <Input
                      value={draft.areaSize ?? ""}
                      onChange={e => set({ areaSize: e.target.value })}
                      placeholder="e.g. 20-foot radius"
                      data-testid="input-spell-area-size"
                    />
                  </div>
                  <Row>
                    <Checkbox
                      checked={!!draft.passesThroughWalls}
                      onCheckedChange={(v: boolean) => set({ passesThroughWalls: v })}
                      data-testid="checkbox-spell-passes-walls"
                    />
                    <Label>Passes Through Walls (AoE ignores walls/doors)</Label>
                  </Row>
                </>
              )}
              </>)}
            </Stack>
          </Section>

          <Section title="Save Throw">
            <Stack gap="sm">
              <Row>
                <Checkbox
                  checked={!!draft.requiresSave}
                  onCheckedChange={(v: boolean) => set({ requiresSave: v })}
                  data-testid="checkbox-spell-requires-save"
                />
                <Label>Requires Save (Targets roll to resist)</Label>
              </Row>
              {draft.requiresSave && (
                <>
                  <Grid2>
                    <div>
                      <Label>Save Attribute</Label>
                      <Select
                        value={draft.saveAttribute ?? ""}
                        onValueChange={(v: SpellDraft["saveAttribute"]) => set({ saveAttribute: v ?? "" })}
                        data-testid="select-spell-save-attribute"
                      >
                        <SelectItem value="">None</SelectItem>
                        {SPELL_ATTRIBUTES.map(a => (
                          <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Save DC</Label>
                      <NumberInput
                        min={1} value={draft.saveDc ?? 15} fallback={15}
                        onChange={(v) => set({ saveDc: v ?? 15 })}
                        data-testid="input-spell-save-dc"
                      />
                    </div>
                  </Grid2>
                  <div>
                    <Label>On Successful Save</Label>
                    <Select
                      value={draft.saveSuccessEffect ?? "half"}
                      onValueChange={(v: SpellDraft["saveSuccessEffect"]) => set({ saveSuccessEffect: v ?? "half" })}
                      data-testid="select-spell-save-success"
                    >
                      {SAVE_SUCCESS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Saving Throw (legacy text)</Label>
                    <Input
                      value={draft.savingThrow ?? ""}
                      onChange={e => set({ savingThrow: e.target.value })}
                      placeholder="Free-text saving-throw note"
                      data-testid="input-spell-saving-throw"
                    />
                  </div>
                </>
              )}
            </Stack>
          </Section>

          <Section title="Effects (advanced)">
            <Stack gap="sm">
              <Label>Effects JSON</Label>
              <Textarea
                value={effectsText}
                onChange={e => {
                  setEffectsText(e.target.value);
                  try {
                    JSON.parse(e.target.value || "[]");
                    setEffectsError(null);
                  } catch (err: unknown) {
                    setEffectsError(err instanceof Error ? err.message : String(err));
                  }
                }}
                rows={4}
                data-testid="textarea-spell-effects"
              />
              {effectsError && <div style={{ color: "#ef4444", fontSize: "12px" }}>{effectsError}</div>}
              <div className="ld-subtle">
                Token effects payload (jsonb on system_spells.effects). Leave as <code>[]</code> if unused.
              </div>
            </Stack>
          </Section>

          <Section title="Rolls">
            <RollEntriesEditor
              ownerType="spell"
              value={draft.rolls ?? []}
              onChange={(rolls) => set({ rolls })}
              campaignSystem={campaignSystem ?? draft.system}
              host={host}
            />
          </Section>

          {aav2 && !draft.isLiveTemplate && (
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
