/**
 * Draft-mode CustomFieldsEditor.
 *
 * Operates entirely on a local draft array passed in via `value`/`onChange`,
 * matching RollEntriesEditor's draft-mode pattern in this package — no live
 * REST calls per-field, the parent dialog bundles the draft into the
 * transport upsert payload.
 *
 * C.A. only: freeform header+body sections on a blank-sheet item.
 */
import * as React from "react";
import { Button, Input, Textarea, Label, Stack, Row } from "../ui/primitives";
import { uid } from "../lib/utils";

export type CustomFieldDraft = {
  id?: string;
  _localId?: string;
  ownerType?: "item";
  ownerId?: string;
  header: string;
  body?: string | null;
  sortOrder?: number;
};

export interface CustomFieldsEditorProps {
  value: CustomFieldDraft[];
  onChange: (next: CustomFieldDraft[]) => void;
}

function keyOf(f: CustomFieldDraft): string {
  return f.id ?? f._localId!;
}

export const CustomFieldsEditor: React.FC<CustomFieldsEditorProps> = ({ value, onChange }) => {
  const addField = () => onChange([...value, { _localId: uid("field"), header: "New Section", body: "", sortOrder: value.length }]);
  const updateField = (key: string, patch: Partial<CustomFieldDraft>) =>
    onChange(value.map(f => (keyOf(f) === key ? { ...f, ...patch } : f)));
  const removeField = (key: string) => onChange(value.filter(f => keyOf(f) !== key));
  const moveField = (index: number, direction: -1 | 1) => {
    const next = [...value];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((f, i) => ({ ...f, sortOrder: i })));
  };

  return (
    <Stack gap="sm" data-testid="section-custom-fields">
      {value.map((field, i) => {
        const key = keyOf(field);
        return (
          <div key={key} className="ld-panel" style={{ border: "1px solid var(--ld-border)", borderRadius: 6, padding: 8 }} data-testid={`row-custom-field-${key}`}>
            <Stack gap="sm">
              <div>
                <Label>Header</Label>
                <Input value={field.header} onChange={e => updateField(key, { header: e.target.value })} data-testid={`input-custom-field-header-${key}`} />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea value={field.body ?? ""} onChange={e => updateField(key, { body: e.target.value })} data-testid={`textarea-custom-field-body-${key}`} />
              </div>
              <Row>
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveField(i, -1)} data-testid={`button-move-up-custom-field-${key}`}>Up</Button>
                <Button size="sm" variant="ghost" disabled={i === value.length - 1} onClick={() => moveField(i, 1)} data-testid={`button-move-down-custom-field-${key}`}>Down</Button>
                <Button size="sm" variant="danger" onClick={() => removeField(key)} data-testid={`button-remove-custom-field-${key}`}>Remove</Button>
              </Row>
            </Stack>
          </div>
        );
      })}
      <Button size="sm" onClick={addField} data-testid="button-add-custom-field">+ Add Section</Button>
    </Stack>
  );
};
