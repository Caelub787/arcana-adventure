import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Dices, Pencil, Trash2, ChevronDown, ChevronUp, Save, X } from "lucide-react";

interface RollEntry {
  id: string;
  ownerType: string;
  ownerId: string;
  name: string;
  rollType: string;
  diceFormula?: string;
  mod?: number;
  damageType?: string;
  attribute?: string;
  applyToStat?: string;
  sortOrder: number;
  range?: number;
  aoeShape?: string;
  aoeRange?: number;
  requiresSave?: boolean;
  saveAttribute?: string;
  saveDc?: number;
  saveSuccessEffect?: string;
  gainEnergy?: boolean;
  isAttack?: boolean;
  isAoe?: boolean;
  passesThroughWalls?: boolean;
}

interface RollEntriesEditorProps {
  ownerType: "item" | "spell";
  ownerId: string;
  canEdit: boolean;
  onExecuteRoll?: (roll: any) => void;
}

const ATTRIBUTE_OPTIONS = ["might", "finesse", "wit", "presence", "will", "craft"];
const ROLL_TYPE_OPTIONS = ["attack", "damage", "heal", "effect"];
const AOE_SHAPE_OPTIONS = ["cone", "sphere", "line", "cube", "cylinder"];
const APPLY_TO_STAT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "hp", label: "HP (subtract damage / add healing)" },
  { value: "energy", label: "Energy (subtract / add)" },
];

const ROLL_TYPE_COLORS: Record<string, string> = {
  attack: "bg-red-700 text-red-100",
  damage: "bg-amber-700 text-amber-100",
  heal: "bg-green-700 text-green-100",
  effect: "bg-blue-700 text-blue-100",
};

const DAMAGE_TYPES = [
  "Sharp", "Blunt", "Piercing", "Flame", "Frost", "Storm",
  "Tide", "Stone", "Flux", "Light", "Dark", "Sound", "Health",
];

function emptyFormData(ownerType: string, ownerId: string): Partial<RollEntry> {
  return {
    ownerType,
    ownerId,
    name: "",
    rollType: "damage",
    diceFormula: "",
    mod: 0,
    damageType: "",
    attribute: "",
    applyToStat: "none",
    sortOrder: 0,
    range: undefined,
    aoeShape: "",
    aoeRange: undefined,
    requiresSave: false,
    saveAttribute: "",
    saveDc: undefined,
    saveSuccessEffect: "",
    gainEnergy: false,
    isAttack: false,
    isAoe: false,
    passesThroughWalls: false,
  };
}

function getRollSummary(roll: RollEntry): string {
  const parts: string[] = [];
  const formula = roll.diceFormula || "";
  const modStr = roll.mod && roll.mod !== 0 ? (roll.mod > 0 ? `+${roll.mod}` : `${roll.mod}`) : "";
  const diceStr = formula ? `${formula}${modStr}` : modStr || "";

  if (roll.rollType === "attack") {
    const attrStr = roll.attribute ? ` (${roll.attribute.charAt(0).toUpperCase() + roll.attribute.slice(1)})` : "";
    parts.push(`${diceStr} Attack${attrStr}`.trim());
  } else if (roll.rollType === "damage") {
    const dmgType = roll.damageType || "";
    parts.push(`${diceStr} ${dmgType} damage`.trim());
  } else if (roll.rollType === "heal") {
    parts.push(`${diceStr} Healing`.trim());
  } else {
    parts.push(`${diceStr} Effect`.trim());
  }

  return parts.filter(Boolean).join(" ");
}

function getRollDetails(roll: RollEntry): string[] {
  const details: string[] = [];
  if (roll.range) details.push(`Range: ${roll.range}ft`);
  if (roll.isAoe && roll.aoeRange && roll.aoeShape) details.push(`AOE: ${roll.aoeRange}ft ${roll.aoeShape}`);
  if (roll.requiresSave && roll.saveDc && roll.saveAttribute) {
    details.push(`DC ${roll.saveDc} ${roll.saveAttribute.charAt(0).toUpperCase() + roll.saveAttribute.slice(1)} save`);
  }
  return details;
}

function ToggleButton({ active, onClick, label, testId }: { active: boolean; onClick: () => void; label: string; testId: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={`h-7 text-xs border-stone-600 ${active ? "bg-amber-700 text-white border-amber-600" : "bg-stone-900 text-stone-300"}`}
      onClick={onClick}
      data-testid={testId}
    >
      {label}
    </Button>
  );
}

function CollapsibleSection({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-stone-700 rounded-md">
      <button
        type="button"
        className="flex items-center justify-between w-full px-2 py-1 text-xs text-stone-300 hover:bg-stone-700/50"
        onClick={() => setOpen(!open)}
        data-testid={testId}
      >
        <span>{title}</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && <div className="p-2 pt-1 space-y-2 border-t border-stone-700">{children}</div>}
    </div>
  );
}

function RollForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  form: Partial<RollEntry>;
  setForm: React.Dispatch<React.SetStateAction<Partial<RollEntry>>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  const prefix = isNew ? "new-roll" : `edit-roll-${form.id}`;

  return (
    <div className="space-y-2" data-testid={isNew ? "form-new-roll" : `form-edit-roll-${form.id}`}>
      <div>
        <Label className="text-xs text-stone-400">Name</Label>
        <Input
          className="bg-stone-900 border-stone-600 h-7 text-xs"
          value={form.name || ""}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Roll name"
          data-testid={`input-${prefix}-name`}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs text-stone-400">Dice Formula</Label>
          <Input
            className="bg-stone-900 border-stone-600 h-7 text-xs"
            value={form.diceFormula || ""}
            onChange={(e) => setForm((f) => ({ ...f, diceFormula: e.target.value }))}
            placeholder="e.g. 2d6"
            data-testid={`input-${prefix}-diceFormula`}
          />
        </div>
        <div>
          <Label className="text-xs text-stone-400">Mod</Label>
          <Input
            className="bg-stone-900 border-stone-600 h-7 text-xs"
            type="number"
            value={form.mod ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, mod: parseInt(e.target.value) || 0 }))}
            data-testid={`input-${prefix}-mod`}
          />
        </div>
        <div>
          <Label className="text-xs text-stone-400">Damage Type</Label>
          <Select value={form.damageType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, damageType: v === "_none" ? "" : v }))}>
            <SelectTrigger className="bg-stone-900 border-stone-600 h-7 text-xs" data-testid={`select-${prefix}-damageType`}>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {DAMAGE_TYPES.map((dt) => (
                <SelectItem key={dt} value={dt}>{dt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-stone-400">Attribute</Label>
          <Select value={form.attribute || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, attribute: v === "_none" ? "" : v }))}>
            <SelectTrigger className="bg-stone-900 border-stone-600 h-7 text-xs" data-testid={`select-${prefix}-attribute`}>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {ATTRIBUTE_OPTIONS.map((attr) => (
                <SelectItem key={attr} value={attr}>
                  {attr.charAt(0).toUpperCase() + attr.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-stone-400">Apply to Stat</Label>
          <Select value={form.applyToStat || "none"} onValueChange={(v) => setForm((f) => ({ ...f, applyToStat: v }))}>
            <SelectTrigger className="bg-stone-900 border-stone-600 h-7 text-xs" data-testid={`select-${prefix}-applyToStat`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPLY_TO_STAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CollapsibleSection title="Range & AOE" testId={`section-${prefix}-range-aoe`}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-stone-400">Range (ft)</Label>
            <Input
              className="bg-stone-900 border-stone-600 h-7 text-xs"
              type="number"
              value={form.range ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, range: e.target.value ? parseInt(e.target.value) : undefined }))}
              placeholder="—"
              data-testid={`input-${prefix}-range`}
            />
          </div>
          <div className="flex items-end">
            <ToggleButton
              active={!!form.isAoe}
              onClick={() => setForm((f) => ({ ...f, isAoe: !f.isAoe }))}
              label="Is AOE"
              testId={`toggle-${prefix}-isAoe`}
            />
          </div>
        </div>
        {form.isAoe && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-stone-400">AOE Shape</Label>
              <Select value={form.aoeShape || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, aoeShape: v === "_none" ? "" : v }))}>
                <SelectTrigger className="bg-stone-900 border-stone-600 h-7 text-xs" data-testid={`select-${prefix}-aoeShape`}>
                  <SelectValue placeholder="Select shape" />
                </SelectTrigger>
                <SelectContent>
                  {AOE_SHAPE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">AOE Range (ft)</Label>
              <Input
                className="bg-stone-900 border-stone-600 h-7 text-xs"
                type="number"
                value={form.aoeRange ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, aoeRange: e.target.value ? parseInt(e.target.value) : undefined }))}
                data-testid={`input-${prefix}-aoeRange`}
              />
            </div>
          </div>
        )}
        <ToggleButton
          active={!!form.passesThroughWalls}
          onClick={() => setForm((f) => ({ ...f, passesThroughWalls: !f.passesThroughWalls }))}
          label="Passes Through Walls"
          testId={`toggle-${prefix}-passesThroughWalls`}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Save DC" testId={`section-${prefix}-save-dc`}>
        <ToggleButton
          active={!!form.requiresSave}
          onClick={() => setForm((f) => ({ ...f, requiresSave: !f.requiresSave }))}
          label="Requires Save"
          testId={`toggle-${prefix}-requiresSave`}
        />
        {form.requiresSave && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label className="text-xs text-stone-400">Save Attribute</Label>
              <Select value={form.saveAttribute || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, saveAttribute: v === "_none" ? "" : v }))}>
                <SelectTrigger className="bg-stone-900 border-stone-600 h-7 text-xs" data-testid={`select-${prefix}-saveAttribute`}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {ATTRIBUTE_OPTIONS.map((attr) => (
                    <SelectItem key={attr} value={attr}>
                      {attr.charAt(0).toUpperCase() + attr.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Save DC</Label>
              <Input
                className="bg-stone-900 border-stone-600 h-7 text-xs"
                type="number"
                value={form.saveDc ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, saveDc: e.target.value ? parseInt(e.target.value) : undefined }))}
                data-testid={`input-${prefix}-saveDc`}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-stone-400">Save Success Effect</Label>
              <Input
                className="bg-stone-900 border-stone-600 h-7 text-xs"
                value={form.saveSuccessEffect || ""}
                onChange={(e) => setForm((f) => ({ ...f, saveSuccessEffect: e.target.value }))}
                placeholder="e.g. Half damage"
                data-testid={`input-${prefix}-saveSuccessEffect`}
              />
            </div>
          </div>
        )}
      </CollapsibleSection>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 text-xs bg-amber-700 hover:bg-amber-600"
          onClick={onSave}
          disabled={saving || !form.name?.trim()}
          data-testid={`button-${prefix}-save`}
        >
          <Save className="w-3 h-3 mr-1" />
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-stone-600"
          onClick={onCancel}
          data-testid={`button-${prefix}-cancel`}
        >
          <X className="w-3 h-3 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function RollEntriesEditor({ ownerType, ownerId, canEdit, onExecuteRoll }: RollEntriesEditorProps) {
  const queryClient = useQueryClient();
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newForm, setNewForm] = useState<Partial<RollEntry>>(() => emptyFormData(ownerType, ownerId));
  const [editForm, setEditForm] = useState<Partial<RollEntry>>({});

  const queryKey = ownerType === "item" ? ["rollEntries", "item", ownerId] : ["rollEntries", "spell", ownerId];

  const { data: rolls = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => (ownerType === "item" ? api.getItemRolls(ownerId) : api.getSpellRolls(ownerId)),
    enabled: !!ownerId,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<RollEntry>) => api.createRollEntry(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setAddingNew(false);
      setNewForm(emptyFormData(ownerType, ownerId));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RollEntry> }) => api.updateRollEntry(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
      setEditForm({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRollEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleStartEdit = (roll: RollEntry) => {
    setEditingId(roll.id);
    setEditForm({ ...roll });
    setAddingNew(false);
  };

  const handleSaveNew = () => {
    const maxSort = rolls.length > 0 ? Math.max(...rolls.map((r: any) => r.sortOrder ?? 0)) : -1;
    createMutation.mutate({ ...newForm, ownerType, ownerId, sortOrder: maxSort + 1 });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const { id, ...data } = editForm as RollEntry;
    updateMutation.mutate({ id: editingId, data });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const sortedRolls = [...(rolls as RollEntry[])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="space-y-2" data-testid="roll-entries-editor">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-stone-200">
          <Dices className="w-4 h-4" />
          <span className="text-sm font-semibold">Rolls</span>
        </div>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs border-stone-600 text-stone-300"
            onClick={() => {
              setAddingNew(true);
              setEditingId(null);
              setNewForm(emptyFormData(ownerType, ownerId));
            }}
            data-testid="button-add-roll"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Roll
          </Button>
        )}
      </div>

      {addingNew && (
        <div className="bg-stone-800/50 rounded-lg border border-stone-700 p-2">
          <RollForm
            form={newForm}
            setForm={setNewForm}
            onSave={handleSaveNew}
            onCancel={() => setAddingNew(false)}
            saving={createMutation.isPending}
            isNew
          />
        </div>
      )}

      {isLoading && <p className="text-xs text-stone-400 italic">Loading rolls...</p>}

      {!isLoading && sortedRolls.length === 0 && !addingNew && (
        <p className="text-xs text-stone-400 italic" data-testid="text-no-rolls">No rolls defined</p>
      )}

      {sortedRolls.map((roll) => {
        const isEditing = editingId === roll.id;
        const isExpanded = expandedId === roll.id;
        const summary = getRollSummary(roll);
        const details = getRollDetails(roll);
        const badgeClass = ROLL_TYPE_COLORS[roll.rollType] || "bg-stone-600 text-stone-200";

        return (
          <div
            key={roll.id}
            className="bg-stone-800/50 rounded-lg border border-stone-700 p-2"
            data-testid={`card-roll-${roll.id}`}
          >
            {isEditing ? (
              <RollForm
                form={editForm}
                setForm={setEditForm}
                onSave={handleSaveEdit}
                onCancel={() => { setEditingId(null); setEditForm({}); }}
                saving={updateMutation.isPending}
                isNew={false}
              />
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <button
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                    onClick={() => setExpandedId(isExpanded ? null : roll.id)}
                    data-testid={`button-toggle-roll-${roll.id}`}
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-stone-400 shrink-0" /> : <ChevronDown className="w-3 h-3 text-stone-400 shrink-0" />}
                    <span className="text-xs font-medium text-stone-200 truncate" data-testid={`text-roll-name-${roll.id}`}>{roll.name}</span>
                    {roll.diceFormula && (
                      <span className="text-[10px] text-stone-400 shrink-0" data-testid={`text-roll-formula-${roll.id}`}>
                        {roll.diceFormula}{roll.mod && roll.mod !== 0 ? (roll.mod > 0 ? `+${roll.mod}` : roll.mod) : ""}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {onExecuteRoll && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 w-6 p-0 border-stone-600 text-stone-300 hover:text-amber-400"
                        onClick={() => onExecuteRoll(roll)}
                        data-testid={`button-execute-roll-${roll.id}`}
                      >
                        <Dices className="w-3 h-3" />
                      </Button>
                    )}
                    {canEdit && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0 border-stone-600 text-stone-300"
                          onClick={() => handleStartEdit(roll)}
                          data-testid={`button-edit-roll-${roll.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {roll.name !== 'Detonate' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 p-0 border-stone-600 text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(roll.id)}
                            data-testid={`button-delete-roll-${roll.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-1.5 pl-5 space-y-0.5">
                    <p className="text-xs text-stone-300" data-testid={`text-roll-summary-${roll.id}`}>{summary}</p>
                    {details.map((d, i) => (
                      <p key={i} className="text-[10px] text-stone-400" data-testid={`text-roll-detail-${roll.id}-${i}`}>{d}</p>
                    ))}
                    {roll.saveSuccessEffect && roll.requiresSave && (
                      <p className="text-[10px] text-stone-400">On save: {roll.saveSuccessEffect}</p>
                    )}
                    {roll.isAttack && <p className="text-[10px] text-stone-400">⚔️ Attack roll</p>}
                    {roll.gainEnergy && <p className="text-[10px] text-stone-400">⚡ Gains energy</p>}
                    {roll.passesThroughWalls && <p className="text-[10px] text-stone-400">🔮 Passes through walls</p>}
                    {roll.applyToStat && roll.applyToStat !== "none" && (
                      <p className="text-[10px] text-stone-400">
                        Applies to: {roll.applyToStat === "hp" ? "HP" : "Energy"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default RollEntriesEditor;
