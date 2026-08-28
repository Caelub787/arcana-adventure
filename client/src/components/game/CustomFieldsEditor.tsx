import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CustomField } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, X, Pencil, Lock } from "lucide-react";

interface CustomFieldsEditorProps {
  ownerType: "character" | "item";
  ownerId?: string;
  canEdit: boolean;
  // Only a real GM/assistant-GM can see or set gmOnly/gmNotes — the server
  // already strips that data out of the response for non-GM viewers, so
  // this only controls whether the GM-only controls are rendered at all.
  isGM?: boolean;
}

// C.A. only: freeform header+body sections, used on the Overview tab
// (ownerType="character") and on blank-sheet items (ownerType="item").
// Each field can carry a GM-only companion note (gmNotes) that's stored
// separately from the player-visible body — a player editing body can never
// touch or overwrite it, since they're different fields entirely — and/or
// be marked gmOnly to hide the whole field from players.
export function CustomFieldsEditor({ ownerType, ownerId, canEdit, isGM = false }: CustomFieldsEditorProps) {
  const queryClient = useQueryClient();
  const [addingNew, setAddingNew] = useState(false);
  const [newHeader, setNewHeader] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newGmOnly, setNewGmOnly] = useState(false);
  const [newGmNotes, setNewGmNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHeader, setEditHeader] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editGmOnly, setEditGmOnly] = useState(false);
  const [editGmNotes, setEditGmNotes] = useState("");

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
      setNewGmOnly(false);
      setNewGmNotes("");
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
    setEditGmOnly(!!field.gmOnly);
    setEditGmNotes(field.gmNotes || "");
  };

  return (
    <div className="space-y-2" data-testid="section-custom-fields">
      {sorted.map((field, i) => (
        <div
          key={field.id}
          className={`rounded border p-2 bg-stone-900/50 ${field.gmOnly ? 'border-violet-700/70' : 'border-stone-700'}`}
          data-testid={`row-custom-field-${field.id}`}
        >
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
              {isGM && (
                <div className="space-y-1.5 rounded border border-violet-800/50 bg-violet-950/20 p-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer text-violet-300">
                    <input
                      type="checkbox"
                      checked={editGmOnly}
                      onChange={(e) => setEditGmOnly(e.target.checked)}
                      data-testid={`checkbox-edit-custom-field-gmonly-${field.id}`}
                    />
                    <Lock className="h-3 w-3" /> GM Only (hide entire section from players)
                  </label>
                  <div>
                    <Label className="text-[10px] text-violet-400">GM Notes (never visible to players)</Label>
                    <Textarea
                      value={editGmNotes}
                      onChange={(e) => setEditGmNotes(e.target.value)}
                      placeholder="Notes only you can see..."
                      className="bg-stone-900 border-violet-800/60 text-sm min-h-[50px]"
                      data-testid={`textarea-edit-custom-field-gmnotes-${field.id}`}
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!editHeader.trim() || updateMutation.isPending}
                  onClick={() => updateMutation.mutate({
                    id: field.id,
                    data: { header: editHeader.trim(), body: editBody, ...(isGM ? { gmOnly: editGmOnly, gmNotes: editGmNotes } : {}) },
                  })}
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
                <div className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                  {field.header}
                  {field.gmOnly && (
                    <span className="flex items-center gap-0.5 text-[10px] text-violet-400 font-normal" data-testid={`badge-gmonly-custom-field-${field.id}`}>
                      <Lock className="h-2.5 w-2.5" /> GM Only
                    </span>
                  )}
                </div>
                {field.body && <div className="text-xs text-stone-300 whitespace-pre-wrap mt-0.5">{field.body}</div>}
                {isGM && field.gmNotes && (
                  <div className="mt-1.5 pl-2 border-l-2 border-violet-700/60" data-testid={`text-gmnotes-custom-field-${field.id}`}>
                    <div className="text-[10px] text-violet-400 flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> GM Notes</div>
                    <div className="text-xs text-violet-200 whitespace-pre-wrap">{field.gmNotes}</div>
                  </div>
                )}
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
            {isGM && (
              <div className="space-y-1.5 rounded border border-violet-800/50 bg-violet-950/20 p-2">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer text-violet-300">
                  <input
                    type="checkbox"
                    checked={newGmOnly}
                    onChange={(e) => setNewGmOnly(e.target.checked)}
                    data-testid="checkbox-new-custom-field-gmonly"
                  />
                  <Lock className="h-3 w-3" /> GM Only (hide entire section from players)
                </label>
                <div>
                  <Label className="text-[10px] text-violet-400">GM Notes (never visible to players)</Label>
                  <Textarea
                    value={newGmNotes}
                    onChange={(e) => setNewGmNotes(e.target.value)}
                    placeholder="Notes only you can see..."
                    className="bg-stone-900 border-violet-800/60 text-sm min-h-[50px]"
                    data-testid="textarea-new-custom-field-gmnotes"
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!newHeader.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({
                  ownerType, ownerId, header: newHeader.trim(), body: newBody, sortOrder: fields.length,
                  ...(isGM ? { gmOnly: newGmOnly, gmNotes: newGmNotes } : {}),
                })}
                data-testid="button-save-new-custom-field"
              >
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingNew(false); setNewHeader(""); setNewBody(""); setNewGmOnly(false); setNewGmNotes(""); }} data-testid="button-cancel-new-custom-field">
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
