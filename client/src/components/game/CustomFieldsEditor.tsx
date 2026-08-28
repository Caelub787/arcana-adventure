import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CustomField } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, X, Pencil } from "lucide-react";

interface CustomFieldsEditorProps {
  ownerType: "character" | "item";
  ownerId?: string;
  canEdit: boolean;
}

// C.A. only: freeform header+body sections, used on the Overview tab
// (ownerType="character") and on blank-sheet items (ownerType="item").
export function CustomFieldsEditor({ ownerType, ownerId, canEdit }: CustomFieldsEditorProps) {
  const queryClient = useQueryClient();
  const [addingNew, setAddingNew] = useState(false);
  const [newHeader, setNewHeader] = useState("");
  const [newBody, setNewBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHeader, setEditHeader] = useState("");
  const [editBody, setEditBody] = useState("");

  const queryKey = ["customFields", ownerType, ownerId];

  const { data: fields = [] } = useQuery({
    queryKey,
    queryFn: () => (ownerType === "item" ? api.getItemCustomFields(ownerId!) : api.getCharacterCustomFields(ownerId!)),
    enabled: !!ownerId,
    staleTime: 5 * 60 * 1000,
  });

  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);

  const createMutation = useMutation({
    mutationFn: (data: Partial<CustomField>) => api.createCustomField(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setAddingNew(false);
      setNewHeader("");
      setNewBody("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomField> }) => api.updateCustomField(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCustomField(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, sortOrder }: { id: string; sortOrder: number }) => api.updateCustomField(id, { sortOrder }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = sorted[index + direction];
    const current = sorted[index];
    if (!target || !current) return;
    moveMutation.mutate({ id: current.id, sortOrder: target.sortOrder });
    moveMutation.mutate({ id: target.id, sortOrder: current.sortOrder });
  };

  const startEdit = (field: CustomField) => {
    setEditingId(field.id);
    setEditHeader(field.header);
    setEditBody(field.body || "");
  };

  return (
    <div className="space-y-2" data-testid="section-custom-fields">
      {sorted.map((field, i) => (
        <div key={field.id} className="rounded border border-stone-700 bg-stone-900/50 p-2" data-testid={`row-custom-field-${field.id}`}>
          {editingId === field.id ? (
            <div className="space-y-2">
              <Input
                value={editHeader}
                onChange={(e) => setEditHeader(e.target.value)}
                placeholder="Header"
                className="bg-stone-800 border-stone-600 text-sm"
                data-testid={`input-edit-custom-field-header-${field.id}`}
              />
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Body"
                className="bg-stone-800 border-stone-600 text-sm min-h-[60px]"
                data-testid={`textarea-edit-custom-field-body-${field.id}`}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!editHeader.trim() || updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: field.id, data: { header: editHeader.trim(), body: editBody } })}
                  data-testid={`button-save-custom-field-${field.id}`}
                >
                  <Save className="h-3 w-3 mr-1" /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)} data-testid={`button-cancel-custom-field-${field.id}`}>
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-amber-400">{field.header}</div>
                {field.body && <div className="text-xs text-stone-300 whitespace-pre-wrap mt-0.5">{field.body}</div>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => handleMove(i, -1)} data-testid={`button-move-up-custom-field-${field.id}`}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === sorted.length - 1} onClick={() => handleMove(i, 1)} data-testid={`button-move-down-custom-field-${field.id}`}>
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(field)} data-testid={`button-edit-custom-field-${field.id}`}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMutation.mutate(field.id)} data-testid={`button-delete-custom-field-${field.id}`}>
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {canEdit && (
        addingNew ? (
          <div className="rounded border border-amber-700 bg-stone-900/50 p-2 space-y-2" data-testid="form-new-custom-field">
            <div>
              <Label className="text-xs text-stone-400">Header</Label>
              <Input
                value={newHeader}
                onChange={(e) => setNewHeader(e.target.value)}
                placeholder="Section title"
                className="bg-stone-800 border-stone-600 text-sm"
                data-testid="input-new-custom-field-header"
              />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Body</Label>
              <Textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Content..."
                className="bg-stone-800 border-stone-600 text-sm min-h-[60px]"
                data-testid="textarea-new-custom-field-body"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!newHeader.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({
                  ownerType, ownerId, header: newHeader.trim(), body: newBody, sortOrder: fields.length,
                })}
                data-testid="button-save-new-custom-field"
              >
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewHeader(""); setNewBody(""); }} data-testid="button-cancel-new-custom-field">
                <X className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAddingNew(true)} data-testid="button-add-custom-field">
            <Plus className="h-3 w-3 mr-1" /> Add Section
          </Button>
        )
      )}
    </div>
  );
}
