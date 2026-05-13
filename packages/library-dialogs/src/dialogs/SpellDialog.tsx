/**
 * <SpellDialog>
 *
 * Full create/edit dialog for the `spells` table. Mirrors Arcana's
 * AdminSettings SpellFormDialog field-set (name, description, image,
 * action type, duration, attribute) plus reuses <RollEntriesEditor>
 * for nested rolls and <ItemTemplateLinksPanel> for AAv2 spell↔
 * roll-template links.
 *
 * Save flow: bundles `rolls` and `templateLinks` into a single sync
 * upsert payload. The server's children-aware `applyChildren` writes
 * roll_entries; spell_template_links is replaced by the server's
 * `replaceSpellTemplateLinks` based on `kind === "spell"`.
 *
 * Load flow: hydrates from the enriched GET response (rolls,
 * templateLinks). All other spell columns (school, level, mana cost,
 * AOE, save throw, etc.) are round-tripped through the draft so they
 * survive an edit even though the form doesn't currently expose them.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Select, SelectItem,
  Stack, Row, Grid2, Section,
} from "../ui/primitives";
import { HostModal, SaveCancelFooter } from "../ui/DefaultModal";
import { RollEntriesEditor, type RollEntryDraft } from "../components/RollEntriesEditor";
import { ItemTemplateLinksPanel } from "../components/ItemTemplateLinksPanel";
import { isAAv2 } from "../lib/effectTypes";
import type { DialogProps } from "../types";

const SPELL_ATTRIBUTES = ["", "might", "finesse", "wit", "presence", "will", "craft"] as const;
const ACTION_TYPES = ["action", "bonus action"] as const;
const DURATIONS = [
  "Instant", "1 Round", "1 Minute", "10 Minutes", "30 Minutes",
  "1 Hour", "6 Hours", "12 Hours", "1 Day", "1 Week", "1 Month",
  "1 Year", "Permanent",
] as const;

export interface SpellDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;

  // Mirrors Arcana admin SpellFormDialog
  name: string;
  description?: string | null;
  image?: string | null;
  castingTime?: string | null;
  rangeNum?: number | null;
  range?: number | null;       // legacy/alt; admin form writes "X ft" string here too
  duration?: string | null;
  attribute?: string | null;

  // Carried through (round-trip) so edits don't drop schema columns
  damage?: string | null;
  damageDice?: string | null;
  healingDice?: string | null;
  damageType?: string | null;
  aoe?: string | null;
  level?: number;
  school?: string | null;
  mod?: number | null;
  energyCost?: number | null;
  manaCost?: number | null;
  isEquipped?: boolean;
  isAttack?: boolean;
  gainEnergy?: boolean;
  isAoe?: boolean;
  aoeRange?: number | null;
  aoeShape?: string | null;
  passesThroughWalls?: boolean;
  requiresSave?: boolean;
  saveAttribute?: string | null;
  saveDc?: number | null;
  saveSuccessEffect?: string | null;
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
  castingTime: "action",
  rangeNum: 30,
  duration: "Instant",
  attribute: "",
  level: 0,
  energyCost: 1,
  manaCost: 0,
  isAttack: true,
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
    host.transport.get<SpellDraft & { rolls?: unknown[]; templateLinks?: unknown[] }>("spell", initialValue.id)
      .then(env => {
        const envelope = env as unknown as { data?: SpellDraft & { rolls?: unknown[]; templateLinks?: unknown[] } };
        const data = (envelope.data ?? env) as SpellDraft & { rolls?: unknown[]; templateLinks?: unknown[] };
        setDraft({
          ...FRESH,
          ...data,
          castingTime: normalizeCastingTime(data.castingTime),
          duration: normalizeDuration(data.duration),
          rolls: ((data.rolls as RollEntryDraft[] | undefined) ?? []).map(r => ({ ...r, _localId: r.id })),
          templateLinks: ((data.templateLinks as unknown[] | undefined) ?? []).map(l =>
            typeof l === "string" ? l : (l as { templateId?: string })?.templateId ?? "",
          ).filter((s): s is string => !!s),
        });
      })
      .catch(e => host.notify("error", `Failed to load spell: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host]);

  const set = (patch: Partial<SpellDraft>) => setDraft(d => ({ ...d, ...patch }));

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
      description="Fields mirror the Arcana admin spell editor exactly."
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
                <Label>Description</Label>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={e => set({ description: e.target.value })}
                  data-testid="textarea-spell-description"
                />
              </div>

              <div>
                <Label>Spell Image URL</Label>
                <Row>
                  <Input
                    value={draft.image ?? ""}
                    onChange={e => set({ image: e.target.value })}
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
                      Pick…
                    </Button>
                  )}
                </Row>
              </div>

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
                    value={draft.rangeNum ?? 30}
                    onChange={e => {
                      const n = e.target.value === "" ? 30 : parseInt(e.target.value, 10);
                      set({ rangeNum: Number.isFinite(n) ? n : 30 });
                    }}
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
                    {SPELL_ATTRIBUTES.map(a => (
                      <SelectItem key={a || "_none"} value={a}>
                        {a ? a.charAt(0).toUpperCase() + a.slice(1) : "None"}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </Grid2>
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
