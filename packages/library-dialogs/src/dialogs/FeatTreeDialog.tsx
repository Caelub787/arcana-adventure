/**
 * <FeatTreeDialog>
 *
 * Full create/edit dialog for the `feat_trees` table (kind="feat-tree").
 * Renders tree metadata (name, description, gridWidth, gridHeight) and
 * embeds <FeatTreeCanvas> for graphical editing of feats and their
 * prerequisite connections.
 *
 * Save bundles the tree metadata + `feats[]` + `connections[]` into a
 * single `host.transport.upsert("feat-tree", …)` call. The server's
 * `replaceFeatTreeChildren` handler writes the parent + both child
 * tables in one bundled write, performing FK ID remapping so brand-new
 * connections referencing brand-new feats resolve correctly.
 *
 * Loading uses `host.transport.get("feat-tree", id)` which returns the
 * enriched payload including child feats and connections.
 */
import * as React from "react";
import {
  Input, Textarea, Label, Stack, Grid2, Grid3, Section,
} from "../ui/primitives";
import { NumberInput } from "../components/NumberInput";
import { HostModal, SaveCancelFooter } from "../ui/DefaultModal";
import {
  FeatTreeCanvas, stripLocalIds,
  type FeatDraft, type FeatConnectionDraft, type FeatTreeCanvasValue,
} from "../components/FeatTreeCanvas";
import type { DialogProps } from "../types";

export interface FeatTreeDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;

  name: string;
  description?: string | null;
  system?: string;
  gridWidth: number;
  gridHeight: number;
  defaultViewX?: number | null;
  defaultViewY?: number | null;
  defaultViewZoom?: number | null;
  ownerUserId?: string | null;

  feats?: FeatDraft[];
  connections?: FeatConnectionDraft[];
}

interface FeatTreeApiPayload extends Omit<FeatTreeDraft, "feats" | "connections"> {
  feats?: FeatDraft[];
  connections?: FeatConnectionDraft[];
  /** Server may also nest under `tree`; harmless extras are ignored. */
  tree?: Partial<FeatTreeDraft>;
}

const FRESH: FeatTreeDraft = {
  name: "",
  description: "",
  system: "aa-v2",
  gridWidth: 7,
  gridHeight: 10,
  feats: [],
  connections: [],
};

export const FeatTreeDialog: React.FC<DialogProps<FeatTreeDraft>> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, campaignSystem, mode,
}) => {
  const [draft, setDraft] = React.useState<FeatTreeDraft>(FRESH);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const editing = mode ? mode === "edit" : !!initialValue?.id;

  React.useEffect(() => {
    if (!open) return;
    if (!initialValue?.id) {
      setDraft({
        ...FRESH,
        system: campaignSystem ?? FRESH.system,
        ...(initialValue ?? {}),
        feats: initialValue?.feats ?? [],
        connections: initialValue?.connections ?? [],
      });
      return;
    }
    setLoading(true);
    host.transport.get<FeatTreeApiPayload>("feat-tree", initialValue.id)
      .then(env => {
        const data = env.data;
        const treeMeta = data.tree ?? data;
        setDraft({
          ...FRESH,
          ...treeMeta,
          id: env.id,
          externalId: env.externalId ?? undefined,
          feats: data.feats ?? [],
          connections: data.connections ?? [],
        });
      })
      .catch(e => host.notify("error", `Failed to load feat tree: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host, campaignSystem]);

  const set = (patch: Partial<FeatTreeDraft>) => setDraft(d => ({ ...d, ...patch }));
  const numChange = (field: keyof FeatTreeDraft, value: string, fallback = 0) => {
    if (value === "") return set({ [field]: fallback } as Partial<FeatTreeDraft>);
    const n = parseInt(value, 10);
    set({ [field]: Number.isFinite(n) ? n : fallback } as Partial<FeatTreeDraft>);
  };

  const canvasValue: FeatTreeCanvasValue = {
    feats: draft.feats ?? [],
    connections: draft.connections ?? [],
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      host.notify("warning", "Feat tree name is required.");
      return;
    }
    setSaving(true);
    try {
      const stripped = stripLocalIds({
        feats: draft.feats ?? [],
        connections: draft.connections ?? [],
      });
      const payload: FeatTreeApiPayload = {
        ...draft,
        system: draft.system ?? campaignSystem ?? "aa-v2",
        feats: stripped.feats,
        connections: stripped.connections,
      };
      const env = editing
        ? await host.transport.patch<FeatTreeApiPayload>("feat-tree", draft.id!, payload)
        : await host.transport.upsert<FeatTreeApiPayload>("feat-tree", payload);
      const treeMeta = env.data.tree ?? env.data;
      const saved: FeatTreeDraft & { id: string; externalId?: string | null } = {
        ...FRESH,
        ...draft,
        ...treeMeta,
        id: env.id,
        externalId: env.externalId ?? undefined,
        feats: env.data.feats ?? [],
        connections: env.data.connections ?? [],
      };
      host.notify("success", editing ? "Feat tree updated." : "Feat tree created.");
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
      title={editing ? "Edit Feat Tree" : "Create Feat Tree"}
      description="Tree metadata + embedded canvas. Save bundles feats and connections into one sync upsert."
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Tree Metadata">
            <Stack gap="sm">
              <div>
                <Label required>Name</Label>
                <Input
                  value={draft.name}
                  onChange={e => set({ name: e.target.value })}
                  placeholder="e.g., Warrior Path"
                  data-testid="input-feattree-name"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={e => set({ description: e.target.value })}
                  rows={2}
                  data-testid="textarea-feattree-description"
                />
              </div>
              <Grid3>
                <div>
                  <Label>Grid Width (cells)</Label>
                  <NumberInput
                    min={1} value={draft.gridWidth} fallback={7}
                    onChange={(v) => set({ gridWidth: v ?? 7 })}
                    data-testid="input-feattree-grid-width"
                  />
                </div>
                <div>
                  <Label>Grid Height (cells)</Label>
                  <NumberInput
                    min={1} value={draft.gridHeight} fallback={10}
                    onChange={(v) => set({ gridHeight: v ?? 10 })}
                    data-testid="input-feattree-grid-height"
                  />
                </div>
                <div>
                  <Label>System</Label>
                  <Input
                    value={draft.system ?? ""}
                    onChange={e => set({ system: e.target.value })}
                    placeholder="aa-v2"
                    data-testid="input-feattree-system"
                  />
                </div>
              </Grid3>
              <Grid2>
                <div>
                  <Label>Default View Center X</Label>
                  <NumberInput
                    optional value={draft.defaultViewX ?? undefined}
                    onChange={(v) => set({ defaultViewX: v ?? null })}
                    data-testid="input-feattree-default-view-x"
                  />
                </div>
                <div>
                  <Label>Default View Center Y</Label>
                  <NumberInput
                    optional value={draft.defaultViewY ?? undefined}
                    onChange={(v) => set({ defaultViewY: v ?? null })}
                    data-testid="input-feattree-default-view-y"
                  />
                </div>
              </Grid2>
            </Stack>
          </Section>

          <Section title="Tree Canvas">
            <FeatTreeCanvas
              value={canvasValue}
              onChange={(next) => set({ feats: next.feats, connections: next.connections })}
              gridWidth={draft.gridWidth}
              gridHeight={draft.gridHeight}
            />
          </Section>
        </Stack>
      )}
    </HostModal>
  );
};
