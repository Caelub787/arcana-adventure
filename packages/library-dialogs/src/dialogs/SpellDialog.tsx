/**
 * <SpellDialog>
 *
 * Full create/edit dialog for AAv2 system spells. Targets the
 * `system_spells` table via the sync API (`kind="spell"` is wired in
 * `server/sync/api.ts` to `storage.{create,update,get}SystemSpell`).
 *
 * The form exposes the union of every persisted column on `system_spells`
 * plus the conditional behavior copied verbatim from Arcana's two
 * canonical spell editors:
 *  - admin (`client/src/pages/AdminSettings.tsx` `SpellFormDialog` ~7495):
 *    name, description, icon, action type, duration, range, attribute,
 *    AAv2 template-links panel.
 *  - in-game (`client/src/components/game/GameComponents.tsx` ~20463):
 *    damageDice, damageType (with `Energy → gainEnergy` conditional),
 *    energyCost, AAv2 manaCost, isAttack toggle, isAoe (with shape +
 *    range + passes-through-walls), requiresSave (with saveAttribute,
 *    saveDc, saveSuccessEffect including the `quarter` "Quarter Damage"
 *    option).
 *
 * In addition, the schema-only fields not currently rendered by either
 * Arcana dialog but persisted on `system_spells` are exposed so partner
 * apps (CanvasRealms) get full table coverage on create: school, level,
 * components, concentration, ritual, targetType, areaSize, savingThrow,
 * healingDice, mod, effects (raw JSON edit). The `aoe` legacy text
 * column and `isArchived` are round-tripped through the draft.
 *
 * Save flow: bundles `rolls` and `templateLinks` into a single
 * `transport.upsert/patch("spell", ...)` call. The server's
 * `applyChildren` writes `roll_entries` (for kind="spell"); template
 * links are replaced by `replaceSpellTemplateLinks`.
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
const AOE_SHAPES = ["circle", "sphere", "square", "cube", "cone", "line"] as const;
// Mirrors GameComponents.tsx ~20872-20880 (`half`, `none`, `no_effect`,
// `quarter`) — the in-game spell editor's full save-success option set.
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

  // Basics (admin form parity)
  name: string;
  description?: string | null;
  icon?: string | null;

  // Classification (system_spells columns)
  school?: string | null;
  level?: number;
  components?: string | null;
  concentration?: boolean;
  ritual?: boolean;
  targetType?: string | null;
  areaSize?: string | null;

  // Cast / range
  castingTime?: string | null;
  duration?: string | null;
  rangeNum?: number | null;
  range?: string | null; // dual-write "X ft" string
  attribute?: string | null;

  // Damage / cost (in-game form parity)
  damageDice?: string | null;
  damageType?: string | null;
  gainEnergy?: boolean;
  healingDice?: string | null;
  mod?: number | null;
  energyCost?: number;
  manaCost?: number;

  // Behavior toggles
  isAttack?: boolean;
  isAoe?: boolean;
  aoeShape?: string | null;
  aoeRange?: number | null;
  passesThroughWalls?: boolean;
  aoe?: string | null; // legacy text column, round-tripped

  // Save throw
  requiresSave?: boolean;
  saveAttribute?: string | null;
  saveDc?: number | null;
  saveSuccessEffect?: string | null;
  savingThrow?: string | null;

  // Generic JSON effects (advanced — raw JSON textarea)
  effects?: unknown;

  // Routing / state
  system?: string;
  isArchived?: boolean;
  isLiveTemplate?: boolean;
  ownerUserId?: string | null;

  // Children
  rolls?: RollEntryDraft[];
  templateLinks?: string[];
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

// AdminSettings normalizers — keep legacy free-text in sync with controlled dropdowns.
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
  const [effectsText, setEffectsText] = React.useState("[]");
  const [effectsError, setEffectsError] = React.useState<string | null>(null);

  const aav2 = isAAv2(campaignSystem ?? draft.system);
  const damageTypes = getEffectTypes(campaignSystem ?? draft.system);
  const damageTypeLabel = getEffectTypeLabel(campaignSystem ?? draft.system);
  // Explicit `mode` wins; otherwise infer from initialValue.id. Edit
  // requires initialValue.id so the load + patch can resolve the row.
  const editing = mode ? mode === "edit" : !!initialValue?.id;

  // ---- Load on open ----
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
    host.transport.get<SpellDraft>("spell", initialValue.id)
      .then(env => {
        // Same envelope-handling idiom as ItemDialog/RollTemplateDialog
        // (transport returns `{ data }` for upserts and raw rows for GET).
        const data: any = env.data ?? env;
        const next: SpellDraft = {
          ...FRESH,
          ...data,
          castingTime: normalizeCastingTime(data.castingTime),
          duration: normalizeDuration(data.duration),
          rolls: ((data.rolls as RollEntryDraft[] | undefined) ?? []).map((r: RollEntryDraft) => ({ ...r, _localId: r.id })),
          templateLinks: ((data.templateLinks as unknown[] | undefined) ?? []).map((l: unknown) =>
            typeof l === "string" ? l : (l as { templateId?: string })?.templateId ?? "",
          ).filter((s: string) => !!s),
        };
        setDraft(next);
        setEffectsText(JSON.stringify(next.effects ?? [], null, 2));
        setEffectsError(null);
      })
      .catch(e => host.notify("error", `Failed to load spell: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host]);

  const set = (patch: Partial<SpellDraft>) => setDraft(d => ({ ...d, ...patch }));

  // Mirror the in-game form's handleSpellNumericChange.
  const numChange = (field: keyof SpellDraft, value: string, fallback: number = 0) => {
    if (value === "") return set({ [field]: fallback } as Partial<SpellDraft>);
    const n = parseInt(value, 10);
    set({ [field]: Number.isFinite(n) ? n : fallback } as Partial<SpellDraft>);
  };

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
      // Whitelist: strip nested-children keys before parent insert.
      // server/sync/children.ts CHILD_KEYS["spell"] = ["rolls", "templateLinks"].
      const { rolls: _rolls, templateLinks: _tl, ...parentFields } = draft;
      // `payload: any` matches ItemDialog/RollTemplateDialog (package
      // convention) — the children-aware sync envelope expects the
      // base parent shape PLUS optional `rolls`/`templateLinks` arrays
      // that aren't in the SyncEnvelope generic.
      const payload: any = { ...parentFields };

      // Mirror AdminSettings: dual-write `range` ("X ft" string) and `rangeNum` (int).
      if (typeof draft.rangeNum === "number") {
        payload.rangeNum = draft.rangeNum;
        payload.range = `${draft.rangeNum} ft`;
      }
      // "_none"/empty normalization (matches admin + in-game forms).
      payload.attribute = draft.attribute && draft.attribute !== "_none" ? draft.attribute : "";
      payload.saveAttribute = draft.saveAttribute && draft.saveAttribute !== "_none" ? draft.saveAttribute : "";
      payload.damageType = draft.damageType && draft.damageType !== "_none" ? draft.damageType : "";
      payload.aoeShape = draft.isAoe && draft.aoeShape && draft.aoeShape !== "_none" ? draft.aoeShape : "";
      payload.targetType = draft.targetType || "single";

      // Effects: parse the textarea JSON; fall back to draft.effects if empty.
      try {
        payload.effects = effectsText.trim() ? JSON.parse(effectsText) : [];
      } catch {
        payload.effects = draft.effects ?? [];
      }

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
      const saved: any = env.data ?? env;
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
      description="Mirrors Arcana's admin + in-game spell editors with full system_spells column coverage."
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Basics">
            <Stack gap="sm">
              <div>
                <Label required>Name</Label>
                <Input
                  value={draft.name}
                  onChange={e => set({ name: e.target.value })}
                  data-testid="input-spell-name"
                />
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
                  <Input
                    type="number"
                    min={0}
                    max={9}
                    value={draft.level ?? 1}
                    onChange={e => numChange("level", e.target.value, 1)}
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
                Token effects payload (jsonb on system_spells.effects). Leave as
                <code> []</code> if you don't need spell-driven token effects.
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

          {/*
            Spell↔roll-template links (AAv2 only). Hidden on live templates
            themselves. Roll-templates for spells live in the unified
            `items.isLiveTemplate=true` pool (same source as item links).
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
