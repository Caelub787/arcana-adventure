/**
 * <SpellDialog>
 *
 * Full create/edit dialog for the `spells` table. Mirrors Arcana's
 * canonical in-game spell create/edit form (CharacterSheet → Spells tab,
 * `client/src/components/game/GameComponents.tsx` ~line 20463+) one-for-one:
 * name, image, description, damageDice, damageType (with Energy →
 * gainEnergy conditional), energyCost, AAv2 manaCost, action type,
 * duration, range, attribute, isAttack toggle, isAoe toggle (with shape
 * + range + passesThroughWalls), requiresSave toggle (with saveAttribute
 * + saveDc + saveSuccessEffect). Plus the admin-only AAv2 ItemTemplateLinksPanel.
 *
 * Save flow: bundles `rolls` and `templateLinks` into a single sync
 * upsert payload. The server's children-aware `applyChildren` writes
 * roll_entries; spell_template_links is replaced by the server's
 * `replaceSpellTemplateLinks` based on `kind === "spell"`.
 *
 * Load flow: hydrates from the enriched GET response (rolls,
 * templateLinks). All other spell columns (school, level, healingDice,
 * legacy aoe column, isEquipped, etc.) are round-tripped through the
 * draft so they survive an edit even though the form doesn't expose them.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Section,
} from "../ui/primitives";
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
// Mirrors the in-game form's AoE shape options (note: includes "circle"
// + "sphere" both, per Arcana's two-axis 2D/3D toggle).
const AOE_SHAPES = ["circle", "sphere", "square", "cube", "cone", "line"] as const;
const SAVE_SUCCESS = [
  { value: "half", label: "Half Damage" },
  { value: "none", label: "No Damage" },
  { value: "no_effect", label: "No Effect" },
] as const;

export interface SpellDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;

  // Basics (rendered)
  name: string;
  description?: string | null;
  image?: string | null;

  // Damage / cost (rendered)
  damageDice?: string | null;
  damageType?: string | null;
  gainEnergy?: boolean;
  energyCost?: number | null;
  manaCost?: number | null;

  // Cast / range (rendered)
  castingTime?: string | null;
  duration?: string | null;
  rangeNum?: number | null;
  range?: number | string | null; // legacy mirror "X ft" string
  attribute?: string | null;

  // Behavior toggles (rendered)
  isAttack?: boolean;
  isAoe?: boolean;
  aoeShape?: string | null;
  aoeRange?: number | null;
  passesThroughWalls?: boolean;

  // Save throw (rendered)
  requiresSave?: boolean;
  saveAttribute?: string | null;
  saveDc?: number | null;
  saveSuccessEffect?: string | null;

  // Classification (rendered)
  level?: number;
  school?: string | null;
  // Damage extras (rendered)
  healingDice?: string | null;
  mod?: number | null;

  // Round-tripped (preserved through edit; no UI in canonical Arcana form)
  damage?: string | null;
  aoe?: string | null;
  isEquipped?: boolean;
  isTemplate?: boolean;
  isLiveTemplate?: boolean;
  campaignId?: string | null;
  templateSpellId?: string | null;
  characterId?: string | null;
  system?: string;

  // Children
  rolls?: RollEntryDraft[];
  templateLinks?: string[];
}

const FRESH: SpellDraft = {
  name: "",
  description: "",
  image: "",
  damageDice: "",
  damageType: "",
  gainEnergy: false,
  energyCost: 1,
  manaCost: 0,
  castingTime: "action",
  duration: "Instant",
  rangeNum: 30,
  attribute: "",
  isAttack: true,
  isAoe: false,
  aoeShape: "",
  aoeRange: 15,
  passesThroughWalls: false,
  requiresSave: false,
  saveAttribute: "",
  saveDc: 15,
  saveSuccessEffect: "half",
  level: 0,
  school: "",
  healingDice: "",
  mod: 0,
  rolls: [],
  templateLinks: [],
  system: "aa-v2",
};

// AdminSettings does this normalization to keep legacy free-text in sync
// with the controlled dropdowns. We mirror it so partner-created spells
// match Arcana's persisted shape exactly.
function normalizeCastingTime(ct: string | undefined | null): string {
  if (!ct) return "action";
  const lower = ct.toLowerCase();
  if (lower.includes("bonus")) return "bonus action";
  return "action";
}
function normalizeDuration(d: string | undefined | null): string {
  if (!d) return "Instant";
  const lower = d.toLowerCase();
  if (lower === "instantaneous" || lower === "instant") return "Instant";
  return d;
}

export const SpellDialog: React.FC<DialogProps<SpellDraft>> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, campaignSystem, mode,
}) => {
  const [draft, setDraft] = React.useState<SpellDraft>(FRESH);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const aav2 = isAAv2(campaignSystem ?? draft.system);
  const damageTypes = getEffectTypes(campaignSystem ?? draft.system);
  const damageTypeLabel = getEffectTypeLabel(campaignSystem ?? draft.system);
  // Explicit `mode` prop wins; otherwise infer from initialValue.id.
  // The transport keys writes on the internal id; for edit mode the
  // caller MUST supply initialValue.id so the load + patch can resolve.
  const editing = mode ? mode === "edit" : !!initialValue?.id;

  // ---- Load on open ----
  React.useEffect(() => {
    if (!open) return;
    if (!initialValue?.id) {
      setDraft({
        ...FRESH,
        ...(initialValue ?? {}),
        castingTime: normalizeCastingTime(initialValue?.castingTime),
        duration: normalizeDuration(initialValue?.duration),
      });
      return;
    }
    setLoading(true);
    host.transport.get<SpellDraft>("spell", initialValue.id)
      .then(env => {
        // Mirrors ItemDialog's load pattern (transport envelopes wrap the
        // row in `{ data }` for upserts but return raw rows for GET).
        const data: any = env.data ?? env;
        setDraft({
          ...FRESH,
          ...data,
          castingTime: normalizeCastingTime(data.castingTime),
          duration: normalizeDuration(data.duration),
          rolls: ((data.rolls as RollEntryDraft[] | undefined) ?? []).map((r: RollEntryDraft) => ({ ...r, _localId: r.id })),
          templateLinks: ((data.templateLinks as unknown[] | undefined) ?? []).map((l: unknown) =>
            typeof l === "string" ? l : (l as { templateId?: string })?.templateId ?? "",
          ).filter((s: string) => !!s),
        });
      })
      .catch(e => host.notify("error", `Failed to load spell: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host]);

  const set = (patch: Partial<SpellDraft>) => setDraft(d => ({ ...d, ...patch }));

  // Mirror the in-game form's handleSpellNumericChange: empty string
  // collapses to 0 (or null for optional fields), otherwise parseInt.
  const numChange = (field: keyof SpellDraft, value: string, fallback: number | null = 0) => {
    if (value === "") return set({ [field]: fallback } as Partial<SpellDraft>);
    const n = parseInt(value, 10);
    set({ [field]: Number.isFinite(n) ? n : fallback } as Partial<SpellDraft>);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      host.notify("warning", "Spell name is required.");
      return;
    }
    setSaving(true);
    try {
      // Whitelist: strip nested-children keys before parent insert; the
      // children-aware sync handler (server/sync/children.ts) recognizes
      // `rolls` and `templateLinks` for kind="spell".
      const { rolls: _rolls, templateLinks: _tl, ...parentFields } = draft;
      // `any` here matches ItemDialog and lets us add the children keys
      // without fighting the SyncEnvelope generic (which expects the
      // parent-only shape). The transport ultimately serializes JSON.
      const payload: any = { ...parentFields };

      // Mirror AdminSettings: write both legacy `range` (string "X ft")
      // and `rangeNum` (int) so any consumer reading either stays correct.
      if (typeof draft.rangeNum === "number") {
        payload.rangeNum = draft.rangeNum;
        payload.range = `${draft.rangeNum} ft`;
      }
      // "_none"-style empty attribute → empty string (matches admin form).
      payload.attribute = draft.attribute && draft.attribute !== "_none" ? draft.attribute : "";
      payload.saveAttribute = draft.saveAttribute && draft.saveAttribute !== "_none" ? draft.saveAttribute : "";
      payload.damageType = draft.damageType && draft.damageType !== "_none" ? draft.damageType : "";
      payload.aoeShape = draft.isAoe && draft.aoeShape && draft.aoeShape !== "_none" ? draft.aoeShape : "";

      payload.rolls = (draft.rolls ?? []).map(r => {
        const {
          _localId: _l, templateName: _tn, templatePriority: _tp,
          templateUseOwnOrder: _tu, templateOwnerKey: _tk, ...rest
        } = r;
        return rest;
      });
      payload.templateLinks = draft.templateLinks ?? [];

      const env = editing
        ? await host.transport.patch<SpellDraft>("spell", draft.id!, payload)
        : await host.transport.upsert<SpellDraft>("spell", payload);
      const envelope = env as unknown as { data?: SpellDraft };
      const saved = (envelope.data ?? env) as SpellDraft & { id: string; externalId?: string | null };
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
      description="Fields mirror Arcana's in-game spell editor exactly."
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Basics">
            <Stack gap="sm">
              <div>
                <Label required>Spell Name</Label>
                <Input
                  value={draft.name}
                  onChange={e => set({ name: e.target.value })}
                  data-testid="input-spell-name"
                />
              </div>

              <div>
                <Label>Spell Image</Label>
                <Row>
                  <Input
                    value={draft.image ?? ""}
                    onChange={e => set({ image: e.target.value })}
                    placeholder="https://… or data: URL"
                    data-testid="input-spell-image"
                  />
                  {host.imagePicker && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const r = await host.imagePicker!({ title: "Pick spell image", initialUrl: draft.image ?? undefined });
                        if (r) set({ image: r.url });
                      }}
                      data-testid="button-pick-spell-image"
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
            <Grid2>
              <div>
                <Label>Spell Level</Label>
                <Input
                  type="number"
                  min={0}
                  max={9}
                  value={draft.level ?? 0}
                  onChange={e => numChange("level", e.target.value, 0)}
                  data-testid="input-spell-level"
                />
              </div>
              <div>
                <Label>School</Label>
                <Input
                  value={draft.school ?? ""}
                  onChange={e => set({ school: e.target.value })}
                  placeholder="e.g. evocation, abjuration"
                  data-testid="input-spell-school"
                />
              </div>
            </Grid2>
          </Section>

          <Section title="Damage & cost">
            <Stack gap="sm">
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
                <div>
                  <Label>Flat Modifier</Label>
                  <Input
                    type="number"
                    value={draft.mod ?? 0}
                    onChange={e => numChange("mod", e.target.value, 0)}
                    placeholder="Bonus added after dice roll"
                    data-testid="input-spell-mod"
                  />
                </div>
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
                  <Input
                    type="number"
                    min={0}
                    value={draft.energyCost ?? 0}
                    onChange={e => numChange("energyCost", e.target.value, 0)}
                    data-testid="input-spell-energy-cost"
                  />
                </div>
                {aav2 && (
                  <div>
                    <Label>Mana Cost</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.manaCost ?? 0}
                      onChange={e => numChange("manaCost", e.target.value, 0)}
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

              <Grid2>
                <div>
                  <Label>Range (ft)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.rangeNum ?? 30}
                    onChange={e => numChange("rangeNum", e.target.value, 30)}
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
                      <SelectItem key={a} value={a}>
                        {a.charAt(0).toUpperCase() + a.slice(1)}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </Grid2>
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
                      <Input
                        type="number"
                        min={0}
                        value={draft.aoeRange ?? 15}
                        onChange={e => numChange("aoeRange", e.target.value, 15)}
                        placeholder="e.g. 15"
                        data-testid="input-spell-aoe-range"
                      />
                    </div>
                  </Grid2>
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
                          <SelectItem key={a} value={a}>
                            {a.charAt(0).toUpperCase() + a.slice(1)}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Save DC</Label>
                      <Input
                        type="number"
                        min={1}
                        value={draft.saveDc ?? 15}
                        onChange={e => numChange("saveDc", e.target.value, 15)}
                        placeholder="e.g. 15"
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
                </>
              )}
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

          {/*
            Spell↔roll-template links (AAv2 only). Hidden on live templates
            themselves — a template can't link to itself, and roll-templates
            for spells live in the unified `items.isLiveTemplate=true` pool
            (same source as item template links).
          */}
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
