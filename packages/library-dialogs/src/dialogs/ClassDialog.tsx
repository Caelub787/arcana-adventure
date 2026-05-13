/**
 * <ClassDialog>
 *
 * Full create/edit dialog for the `classes` table (kind="class").
 * Renders class metadata (name, description, image, system, gridWidth,
 * gridHeight, default-view fields, optional feat-tree link) and embeds
 * <SkillTreeEditor> for graphical editing of skill nodes + prerequisite
 * connections, plus <ClassSkillsPanel> for a flat list view of the same
 * nodes.
 *
 * Save bundles the class metadata + `skillNodes[]` + `skillConnections[]`
 * into a single `host.transport.upsert("class", …)` call. The server's
 * `replaceClassChildren` handler writes the parent + both child tables
 * in one bundled write, performing FK ID remapping so brand-new
 * connections referencing brand-new nodes resolve correctly.
 *
 * Loading uses `host.transport.get("class", id)` which returns the
 * enriched payload including `skillNodes` and `skillConnections`.
 *
 * Schema note: in the Arcana data model "class skills" and "skill tree
 * nodes" are the same record (`class_skill_nodes`). The `classSkills`
 * field on `ClassDraft` is a convenience alias for `skillNodes` — when
 * both are present `skillNodes` wins.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section,
} from "../ui/primitives";
import { HostModal, SaveCancelFooter } from "../ui/DefaultModal";
import {
  SkillTreeEditor, ClassSkillsPanel, stripLocalIds,
  type SkillNodeDraft, type SkillConnectionDraft, type SkillTreeValue,
} from "../components/SkillTreeEditor";
import type { DialogProps } from "../types";

export interface ClassDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;

  name: string;
  description?: string | null;
  image?: string | null;
  system?: string;
  /** Optional link to a `feat_trees` row for species-style progression alongside the class skill tree. */
  skillTreeId?: string | null;

  gridWidth: number;
  gridHeight: number;
  defaultViewX?: number | null;
  defaultViewY?: number | null;
  defaultViewZoom?: number | null;
  ownerUserId?: string | null;

  /** Graph nodes — same records as `classSkills`. */
  skillNodes?: SkillNodeDraft[];
  /** Convenience alias for `skillNodes`. When both are present `skillNodes` wins. */
  classSkills?: SkillNodeDraft[];
  skillConnections?: SkillConnectionDraft[];
}

interface ClassApiPayload extends Omit<ClassDraft, "skillNodes" | "skillConnections" | "classSkills"> {
  skillNodes?: SkillNodeDraft[];
  classSkills?: SkillNodeDraft[];
  skillConnections?: SkillConnectionDraft[];
}

interface FeatTreeListEntry { id: string; name?: string; }

const FRESH: ClassDraft = {
  name: "",
  description: "",
  image: "",
  system: "aa-v2",
  skillTreeId: "",
  gridWidth: 7,
  gridHeight: 10,
  skillNodes: [],
  skillConnections: [],
};

export const ClassDialog: React.FC<DialogProps<ClassDraft>> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, campaignSystem, mode,
}) => {
  const [draft, setDraft] = React.useState<ClassDraft>(FRESH);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [featTrees, setFeatTrees] = React.useState<FeatTreeListEntry[]>([]);
  const [view, setView] = React.useState<"tree" | "list">("tree");
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
      const seedNodes = initialValue?.skillNodes ?? initialValue?.classSkills ?? [];
      setDraft({
        ...FRESH,
        system: campaignSystem ?? FRESH.system,
        ...(initialValue ?? {}),
        skillNodes: seedNodes,
        skillConnections: initialValue?.skillConnections ?? [],
      });
      return;
    }
    setLoading(true);
    host.transport.get<ClassApiPayload>("class", initialValue.id)
      .then(env => {
        const data = env.data;
        const seedNodes = data.skillNodes ?? data.classSkills ?? [];
        setDraft({
          ...FRESH,
          ...data,
          id: env.id,
          externalId: env.externalId ?? undefined,
          skillNodes: seedNodes,
          skillConnections: data.skillConnections ?? [],
        });
      })
      .catch(e => host.notify("error", `Failed to load class: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host, campaignSystem]);

  const set = (patch: Partial<ClassDraft>) => setDraft(d => ({ ...d, ...patch }));
  const numChange = (field: keyof ClassDraft, value: string, fallback = 0) => {
    if (value === "") return set({ [field]: fallback } as Partial<ClassDraft>);
    const n = parseInt(value, 10);
    set({ [field]: Number.isFinite(n) ? n : fallback } as Partial<ClassDraft>);
  };

  const treeValue: SkillTreeValue = {
    skillNodes: draft.skillNodes ?? [],
    skillConnections: draft.skillConnections ?? [],
  };
  const onTreeChange = (next: SkillTreeValue) =>
    set({ skillNodes: next.skillNodes, skillConnections: next.skillConnections });

  const handleSave = async () => {
    if (!draft.name.trim()) {
      host.notify("warning", "Class name is required.");
      return;
    }
    setSaving(true);
    try {
      const stripped = stripLocalIds(treeValue);
      const payload: ClassApiPayload = {
        ...draft,
        system: draft.system ?? campaignSystem ?? "aa-v2",
        skillTreeId: draft.skillTreeId || null,
        skillNodes: stripped.skillNodes,
        skillConnections: stripped.skillConnections,
      };
      // Drop the convenience alias before sending so the server only sees the canonical key.
      delete (payload as { classSkills?: unknown }).classSkills;
      const env = editing
        ? await host.transport.patch<ClassApiPayload>("class", draft.id!, payload)
        : await host.transport.upsert<ClassApiPayload>("class", payload);
      const saved: ClassDraft & { id: string; externalId?: string | null } = {
        ...FRESH,
        ...draft,
        ...env.data,
        id: env.id,
        externalId: env.externalId ?? undefined,
        skillNodes: env.data.skillNodes ?? env.data.classSkills ?? [],
        skillConnections: env.data.skillConnections ?? [],
      };
      host.notify("success", editing ? "Class updated." : "Class created.");
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
      title={editing ? "Edit Class" : "Create Class"}
      description="Class metadata + embedded skill-tree editor. Save bundles skill nodes and connections into one sync upsert."
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Class Identity">
            <Stack gap="sm">
              <div>
                <Label required>Name</Label>
                <Input
                  value={draft.name}
                  onChange={e => set({ name: e.target.value })}
                  placeholder="e.g., Battlemage"
                  data-testid="input-class-name"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={e => set({ description: e.target.value })}
                  rows={2}
                  data-testid="textarea-class-description"
                />
              </div>
              <Grid2>
                <div>
                  <Label>Class Icon (image URL)</Label>
                  <Input
                    value={draft.image ?? ""}
                    onChange={e => set({ image: e.target.value })}
                    placeholder="https://… or data:image/…"
                    data-testid="input-class-image"
                  />
                </div>
                <div>
                  <Label>System</Label>
                  <Input
                    value={draft.system ?? ""}
                    onChange={e => set({ system: e.target.value })}
                    placeholder="aa-v2"
                    data-testid="input-class-system"
                  />
                </div>
              </Grid2>
              <div>
                <Label>Linked Feat Tree (optional)</Label>
                <Select
                  value={draft.skillTreeId || "_none"}
                  onValueChange={v => set({ skillTreeId: v === "_none" ? "" : v })}
                  data-testid="select-class-feattree"
                >
                  <SelectItem value="_none">None</SelectItem>
                  {featTrees.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>
                  ))}
                </Select>
              </div>
            </Stack>
          </Section>

          <Section title="Skill Tree Layout">
            <Grid3>
              <div>
                <Label>Grid Width (cells)</Label>
                <Input
                  type="number" min={1}
                  value={draft.gridWidth}
                  onChange={e => numChange("gridWidth", e.target.value, 7)}
                  data-testid="input-class-grid-width"
                />
              </div>
              <div>
                <Label>Grid Height (cells)</Label>
                <Input
                  type="number" min={1}
                  value={draft.gridHeight}
                  onChange={e => numChange("gridHeight", e.target.value, 10)}
                  data-testid="input-class-grid-height"
                />
              </div>
              <div>
                <Label>Default View Zoom</Label>
                <Input
                  type="number" step={0.1}
                  value={draft.defaultViewZoom ?? ""}
                  onChange={e => set({ defaultViewZoom: e.target.value === "" ? null : parseFloat(e.target.value) })}
                  data-testid="input-class-default-view-zoom"
                />
              </div>
            </Grid3>
            <Grid2>
              <div>
                <Label>Default View Center X</Label>
                <Input
                  type="number"
                  value={draft.defaultViewX ?? ""}
                  onChange={e => set({ defaultViewX: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
                  data-testid="input-class-default-view-x"
                />
              </div>
              <div>
                <Label>Default View Center Y</Label>
                <Input
                  type="number"
                  value={draft.defaultViewY ?? ""}
                  onChange={e => set({ defaultViewY: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
                  data-testid="input-class-default-view-y"
                />
              </div>
            </Grid2>
          </Section>

          <Section title="Class Skills">
            <Stack gap="sm">
              <Row>
                <Button
                  size="sm"
                  variant={view === "tree" ? "primary" : "outline"}
                  onClick={() => setView("tree")}
                  data-testid="button-class-view-tree"
                >
                  Tree View
                </Button>
                <Button
                  size="sm"
                  variant={view === "list" ? "primary" : "outline"}
                  onClick={() => setView("list")}
                  data-testid="button-class-view-list"
                >
                  Flat List
                </Button>
              </Row>
              {view === "tree" ? (
                <SkillTreeEditor
                  value={treeValue}
                  onChange={onTreeChange}
                  gridWidth={draft.gridWidth}
                  gridHeight={draft.gridHeight}
                />
              ) : (
                <ClassSkillsPanel value={treeValue} onChange={onTreeChange} />
              )}
            </Stack>
          </Section>
        </Stack>
      )}
    </HostModal>
  );
};
