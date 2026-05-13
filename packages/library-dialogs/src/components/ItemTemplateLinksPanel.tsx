/**
 * Draft-mode ItemTemplateLinksPanel.
 *
 * Manages the set of roll-template IDs an item or spell is linked to.
 * Edits collect into `value` (string[]); the parent dialog persists by
 * sending `templateLinks: string[]` alongside the upsert payload.
 *
 * AAv2-only — caller is responsible for hiding this panel when system
 * is not AA V2.
 */
import * as React from "react";
import { Stack, Row, Checkbox, Label, Badge, Panel, Input } from "../ui/primitives";
import type { HostAdapter } from "../types";

export interface ItemTemplateLinksPanelProps {
  value: string[];
  onChange: (next: string[]) => void;
  host: HostAdapter;
}

interface TemplateRow { id: string; name: string; }

export const ItemTemplateLinksPanel: React.FC<ItemTemplateLinksPanelProps> = ({ value, onChange, host }) => {
  const [templates, setTemplates] = React.useState<TemplateRow[]>([]);
  const [filter, setFilter] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    host.transport.list<{ id: string; name: string; isLiveTemplate?: boolean }>("roll-template")
      .then(res => {
        if (cancelled) return;
        const rows = (res.data ?? []).map((t: any) => ({ id: t.id, name: t.name }));
        setTemplates(rows);
      })
      .catch(e => host.notify("warning", `Could not load roll templates: ${e?.message ?? e}`))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [host]);

  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t => t.name.toLowerCase().includes(q));
  }, [templates, filter]);

  const toggle = (id: string, on: boolean) => {
    const set = new Set(value);
    if (on) set.add(id); else set.delete(id);
    onChange(Array.from(set));
  };

  return (
    <Panel data-testid="item-template-links-panel">
      <Stack gap="sm">
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Linked Roll Templates</Label>
          <Badge tone="muted">{value.length} linked</Badge>
        </Row>
        <Input placeholder="Filter templates…" value={filter} onChange={e => setFilter(e.target.value)} data-testid="input-filter-templates" />
        {loading && <div className="ld-subtle">Loading…</div>}
        {!loading && filtered.length === 0 && <div className="ld-subtle">No templates match.</div>}
        <div style={{ maxHeight: 240, overflowY: "auto", paddingRight: 4 }}>
          {filtered.map(t => {
            const checked = value.includes(t.id);
            return (
              <label key={t.id} className="ld-row" style={{ padding: "4px 0", cursor: "pointer" }}>
                <Checkbox checked={checked} onCheckedChange={(v) => toggle(t.id, v)} data-testid={`checkbox-template-${t.id}`} />
                <span style={{ color: "var(--ld-text)" }}>{t.name}</span>
              </label>
            );
          })}
        </div>
      </Stack>
    </Panel>
  );
};
