/**
 * <SpeciesDialog>
 *
 * Full create/edit dialog for the `system_species` table (kind="species").
 * Renders every flat column on the species row (identity, defaults, pools,
 * vision) and exposes a feat-tree picker fed from
 * `host.transport.list("feat-tree")` so partner apps can attach a species
 * to its progression tree without inventing their own resolver.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section,
} from "../ui/primitives";
import { NumberInput } from "../components/NumberInput";
import { HostModal, SaveCancelFooter } from "../ui/DefaultModal";
import type { DialogProps } from "../types";

const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"] as const;
const VISION_TYPES = ["normal", "darkvision", "blindsight", "truesight", "tremorsense"] as const;

export interface SpeciesDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;

  systemName?: string;
  name: string;
  description?: string | null;
  defaultImage?: string | null;

  lifespan: number;
  speed: number;
  flySpeed: number;
  size: string;
  naturalArmor: number;
  sizeBonus: number;

  startingHp: number;
  startingMaxHp: number;
  hpPerLevel: number;
  startingEnergy: number;
  startingMaxEnergy: number;
  energyPerLevel: number;
  startingMana: number;
  startingMaxMana: number;
  manaPerLevel: number;
  carryWeight: number;

  featTree?: string | null;

  visionType: string;
  dayVisionDistance: number;
  nightVisionDistance: number;

  ownerUserId?: string | null;
}

interface FeatTreeListEntry { id: string; name?: string; }

const FRESH: SpeciesDraft = {
  systemName: "A.A. V2",
  name: "",
  description: "",
  defaultImage: "",
  lifespan: 100,
  speed: 30,
  flySpeed: 0,
  size: "Medium",
  naturalArmor: 5,
  sizeBonus: 0,
  startingHp: 10,
  startingMaxHp: 10,
  hpPerLevel: 5,
  startingEnergy: 10,
  startingMaxEnergy: 10,
  energyPerLevel: 6,
  startingMana: 0,
  startingMaxMana: 0,
  manaPerLevel: 0,
  carryWeight: 50,
  featTree: "",
  visionType: "normal",
  dayVisionDistance: 60,
  nightVisionDistance: 30,
};

export const SpeciesDialog: React.FC<DialogProps<SpeciesDraft>> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, mode,
}) => {
  const [draft, setDraft] = React.useState<SpeciesDraft>(FRESH);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [featTrees, setFeatTrees] = React.useState<FeatTreeListEntry[]>([]);
  const editing = mode ? mode === "edit" : !!initialValue?.id;

  React.useEffect(() => {
    if (!open) return;
    host.transport.list<FeatTreeListEntry>("feat-tree")
      .then(r => setFeatTrees(r.data ?? []))
      .catch(e => host.notify("warning", `Could not load feat trees: ${e instanceof Error ? e.message : String(e)}`));
  }, [open, host]);

  React.useEffect(() => {
    if (!open) return;
    if (!initialValue?.id) {
      setDraft({ ...FRESH, ...(initialValue ?? {}) });
      return;
    }
    setLoading(true);
    host.transport.get<SpeciesDraft>("species", initialValue.id)
      .then(env => setDraft({ ...FRESH, ...env.data }))
      .catch(e => host.notify("error", `Failed to load species: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host]);

  const set = (patch: Partial<SpeciesDraft>) => setDraft(d => ({ ...d, ...patch }));
  const numChange = (field: keyof SpeciesDraft, value: string, fallback = 0) => {
    if (value === "") return set({ [field]: fallback } as Partial<SpeciesDraft>);
    const n = parseInt(value, 10);
    set({ [field]: Number.isFinite(n) ? n : fallback } as Partial<SpeciesDraft>);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      host.notify("warning", "Species name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload: SpeciesDraft = { ...draft, featTree: draft.featTree ?? "" };
      const env = editing
        ? await host.transport.patch<SpeciesDraft>("species", draft.id!, payload)
        : await host.transport.upsert<SpeciesDraft>("species", payload);
      const saved = { ...env.data, id: env.id, externalId: env.externalId ?? undefined };
      host.notify("success", editing ? "Species updated." : "Species created.");
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
      title={editing ? "Edit Species" : "Create Species"}
      description="Mirrors Arcana's system_species editor — identity, pools, vision, and linked feat tree."
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Identity">
            <Stack gap="sm">
              <div>
                <Label required>Name</Label>
                <Input value={draft.name} onChange={e => set({ name: e.target.value })} data-testid="input-species-name" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={e => set({ description: e.target.value })}
                  rows={3}
                  data-testid="textarea-species-description"
                />
              </div>
              <div>
                <Label>Default Token Image</Label>
                <Row>
                  <Input
                    value={draft.defaultImage ?? ""}
                    onChange={e => set({ defaultImage: e.target.value })}
                    placeholder="https://… or data: URL"
                    data-testid="input-species-default-image"
                  />
                  {host.imagePicker && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const r = await host.imagePicker!({ title: "Pick species token image", initialUrl: draft.defaultImage ?? undefined });
                        if (r) set({ defaultImage: r.url });
                      }}
                      data-testid="button-pick-species-image"
                    >
                      Choose Image
                    </Button>
                  )}
                </Row>
              </div>
            </Stack>
          </Section>

          <Section title="Body">
            <Grid3>
              <div>
                <Label>Size</Label>
                <Select value={draft.size} onValueChange={v => set({ size: v })} data-testid="select-species-size">
                  {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </Select>
              </div>
              <div>
                <Label>Size Bonus</Label>
                <NumberInput value={draft.sizeBonus} onChange={(v) => set({ sizeBonus: v ?? 0 })} data-testid="input-species-size-bonus" />
              </div>
              <div>
                <Label>Natural Armor</Label>
                <NumberInput value={draft.naturalArmor} fallback={5} onChange={(v) => set({ naturalArmor: v ?? 5 })} data-testid="input-species-natural-armor" />
              </div>
              <div>
                <Label>Lifespan (yrs)</Label>
                <NumberInput value={draft.lifespan} fallback={100} onChange={(v) => set({ lifespan: v ?? 100 })} data-testid="input-species-lifespan" />
              </div>
              <div>
                <Label>Speed (ft)</Label>
                <NumberInput value={draft.speed} fallback={30} onChange={(v) => set({ speed: v ?? 30 })} data-testid="input-species-speed" />
              </div>
              <div>
                <Label>Fly Speed (ft)</Label>
                <NumberInput value={draft.flySpeed} onChange={(v) => set({ flySpeed: v ?? 0 })} data-testid="input-species-fly-speed" />
              </div>
              <div>
                <Label>Carry Weight</Label>
                <NumberInput value={draft.carryWeight} fallback={50} onChange={(v) => set({ carryWeight: v ?? 50 })} data-testid="input-species-carry-weight" />
              </div>
            </Grid3>
          </Section>

          <Section title="Pools">
            <Stack gap="sm">
              <Grid3>
                <div>
                  <Label>Starting HP</Label>
                  <NumberInput value={draft.startingHp} fallback={10} onChange={(v) => set({ startingHp: v ?? 10 })} data-testid="input-species-starting-hp" />
                </div>
                <div>
                  <Label>Starting Max HP</Label>
                  <NumberInput value={draft.startingMaxHp} fallback={10} onChange={(v) => set({ startingMaxHp: v ?? 10 })} data-testid="input-species-starting-max-hp" />
                </div>
                <div>
                  <Label>HP / Level</Label>
                  <NumberInput value={draft.hpPerLevel} fallback={5} onChange={(v) => set({ hpPerLevel: v ?? 5 })} data-testid="input-species-hp-per-level" />
                </div>
              </Grid3>
              <Grid3>
                <div>
                  <Label>Starting Energy</Label>
                  <NumberInput value={draft.startingEnergy} fallback={10} onChange={(v) => set({ startingEnergy: v ?? 10 })} data-testid="input-species-starting-energy" />
                </div>
                <div>
                  <Label>Starting Max Energy</Label>
                  <NumberInput value={draft.startingMaxEnergy} fallback={10} onChange={(v) => set({ startingMaxEnergy: v ?? 10 })} data-testid="input-species-starting-max-energy" />
                </div>
                <div>
                  <Label>Energy / Level (die size)</Label>
                  <NumberInput value={draft.energyPerLevel} fallback={6} onChange={(v) => set({ energyPerLevel: v ?? 6 })} data-testid="input-species-energy-per-level" />
                </div>
              </Grid3>
              <Grid3>
                <div>
                  <Label>Starting Mana</Label>
                  <NumberInput value={draft.startingMana} onChange={(v) => set({ startingMana: v ?? 0 })} data-testid="input-species-starting-mana" />
                </div>
                <div>
                  <Label>Starting Max Mana</Label>
                  <NumberInput value={draft.startingMaxMana} onChange={(v) => set({ startingMaxMana: v ?? 0 })} data-testid="input-species-starting-max-mana" />
                </div>
                <div>
                  <Label>Mana / Level</Label>
                  <NumberInput value={draft.manaPerLevel} onChange={(v) => set({ manaPerLevel: v ?? 0 })} data-testid="input-species-mana-per-level" />
                </div>
              </Grid3>
            </Stack>
          </Section>

          <Section title="Vision">
            <Grid3>
              <div>
                <Label>Vision Type</Label>
                <Select value={draft.visionType} onValueChange={v => set({ visionType: v })} data-testid="select-species-vision-type">
                  {VISION_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </Select>
              </div>
              <div>
                <Label>Day Vision (ft)</Label>
                <NumberInput value={draft.dayVisionDistance} fallback={60} onChange={(v) => set({ dayVisionDistance: v ?? 60 })} data-testid="input-species-day-vision" />
              </div>
              <div>
                <Label>Night Vision (ft)</Label>
                <NumberInput value={draft.nightVisionDistance} fallback={30} onChange={(v) => set({ nightVisionDistance: v ?? 30 })} data-testid="input-species-night-vision" />
              </div>
            </Grid3>
          </Section>

          <Section title="Progression">
            <Grid2>
              <div>
                <Label>Linked Feat Tree</Label>
                <Select value={draft.featTree ?? ""} onValueChange={v => set({ featTree: v })} data-testid="select-species-feat-tree">
                  <SelectItem value="">None</SelectItem>
                  {featTrees.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <Label>System</Label>
                <Input
                  value={draft.systemName ?? ""}
                  onChange={e => set({ systemName: e.target.value })}
                  placeholder="A.A. V2"
                  data-testid="input-species-system"
                />
              </div>
            </Grid2>
          </Section>
        </Stack>
      )}
    </HostModal>
  );
};
