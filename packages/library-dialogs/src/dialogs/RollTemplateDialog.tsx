/**
 * <RollTemplateDialog>
 *
 * Roll templates are stored in the same `items` table with
 * `isLiveTemplate=true`. The dialog therefore reuses the ItemDraft
 * shape but exposes only the template-relevant fields:
 *   - Identity (name, image, description)
 *   - Template ordering knobs (templatePriority, templateUseOwnOrder)
 *   - The shared <RollEntriesEditor> for the template's roll set
 *
 * Server-side propagation (template-roll fanout to linked items+spells)
 * is handled by the existing routes — this dialog only owns the source
 * of truth for the template itself.
 */
import * as React from "react";
import {
  Button, Input, Textarea, Label, Checkbox, Select, SelectItem,
  Stack, Row, Grid2, Grid3, Section,
} from "../ui/primitives";
import { HostModal, SaveCancelFooter } from "../ui/DefaultModal";
import { RollEntriesEditor, type RollEntryDraft } from "../components/RollEntriesEditor";
import { optionalNum } from "../lib/utils";
import type { DialogProps } from "../types";

export interface RollTemplateDraft {
  id?: string;
  externalId?: string;
  externalUpdatedAt?: string;
  name: string;
  image?: string | null;
  description?: string | null;
  templatePriority?: number;
  templateUseOwnOrder?: boolean;
  system?: string;
  rolls?: RollEntryDraft[];
}

const FRESH: RollTemplateDraft = {
  name: "",
  templatePriority: 1,
  templateUseOwnOrder: false,
  system: "aa-v2",
  rolls: [],
};

export const RollTemplateDialog: React.FC<DialogProps<RollTemplateDraft>> = ({
  open, onOpenChange, initialValue, onSaved, onCancel, host, campaignSystem,
}) => {
  const [draft, setDraft] = React.useState<RollTemplateDraft>(FRESH);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const editing = !!initialValue?.id;

  React.useEffect(() => {
    if (!open) return;
    if (!initialValue?.id) {
      setDraft({ ...FRESH, ...(initialValue ?? {}) });
      return;
    }
    setLoading(true);
    host.transport.get<any>("roll-template", initialValue.id)
      .then(env => {
        const data: any = env.data ?? env;
        setDraft({
          ...FRESH,
          ...data,
          rolls: (data.rolls ?? []).map((r: any) => ({ ...r, _localId: r.id })),
        });
      })
      .catch(e => host.notify("error", `Failed to load template: ${e?.message ?? e}`))
      .finally(() => setLoading(false));
  }, [open, initialValue?.id, host]);

  const set = (patch: Partial<RollTemplateDraft>) => setDraft(d => ({ ...d, ...patch }));

  const handleSave = async () => {
    if (!draft.name.trim()) { host.notify("warning", "Template name is required."); return; }
    setSaving(true);
    try {
      const payload: any = {
        ...draft,
        isLiveTemplate: true,
        itemType: "utility",  // satisfies items.itemType NOT NULL — Arcana convention for live templates
        rolls: (draft.rolls ?? []).map(({ _localId, templateName, templatePriority: _tp, templateUseOwnOrder: _tu, templateOwnerKey, ...r }) => r),
      };
      const env = editing
        ? await host.transport.patch<RollTemplateDraft>("roll-template", draft.id!, payload)
        : await host.transport.upsert<RollTemplateDraft>("roll-template", payload);
      const saved: any = env.data ?? env;
      host.notify("success", editing ? "Roll template updated." : "Roll template created.");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e: any) {
      host.notify("error", `Save failed: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <HostModal
      component={host.modal}
      open={open}
      onOpenChange={(o) => { if (!o) onCancel?.(); onOpenChange(o); }}
      title={editing ? "Edit Roll Template" : "Create Roll Template"}
      description="Edits propagate to every linked item and spell automatically."
      footer={<SaveCancelFooter onCancel={() => { onCancel?.(); onOpenChange(false); }} onSave={handleSave} saving={saving} />}
    >
      {loading ? <div className="ld-subtle">Loading…</div> : (
        <Stack data-ld-root>
          <Section title="Identity">
            <Stack gap="sm">
              <Grid2>
                <div><Label required>Name</Label>
                  <Input value={draft.name} onChange={e => set({ name: e.target.value })} data-testid="input-template-name" />
                </div>
                <div><Label>Image URL</Label>
                  <Row>
                    <Input value={draft.image ?? ""} onChange={e => set({ image: e.target.value })} />
                    {host.imagePicker && (
                      <Button size="sm" onClick={async () => {
                        const r = await host.imagePicker!({ title: "Pick template image", initialUrl: draft.image ?? undefined });
                        if (r) set({ image: r.url });
                      }}>Pick…</Button>
                    )}
                  </Row>
                </div>
              </Grid2>
              <div><Label>Description</Label>
                <Textarea value={draft.description ?? ""} onChange={e => set({ description: e.target.value })} />
              </div>
            </Stack>
          </Section>

          <Section title="Template ordering">
            <Grid3>
              <div><Label>Template Priority</Label>
                <Input type="number" value={draft.templatePriority ?? 1}
                  onChange={e => set({ templatePriority: optionalNum(e.target.value) ?? 1 })} />
              </div>
              <Row><Checkbox checked={!!draft.templateUseOwnOrder}
                onCheckedChange={v => set({ templateUseOwnOrder: v })} /><Label>Use own order (group)</Label></Row>
              <div />
            </Grid3>
            <div className="ld-subtle" style={{ marginTop: 6 }}>
              When "Use own order" is on, this template's inherited rolls render as a contiguous block on every linked item/spell, ordered by their per-roll priorities and anchored at the template priority above.
            </div>
          </Section>

          <Section title="Rolls">
            <RollEntriesEditor
              ownerType="item"
              value={draft.rolls ?? []}
              onChange={(rolls) => set({ rolls })}
              campaignSystem={campaignSystem ?? draft.system}
              host={host}
            />
          </Section>
        </Stack>
      )}
    </HostModal>
  );
};
