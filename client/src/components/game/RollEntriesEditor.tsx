import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Dices, Pencil, Trash2, ChevronDown, ChevronUp, Save, X, ArrowUp, ArrowDown } from "lucide-react";

interface RollEntry {
  id: string;
  ownerType: string;
  ownerId: string;
  name: string;
  description?: string;
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
  primaryColor?: string | null;
  requiresEnergy?: boolean;
  energyCost?: number;
  noRoll?: boolean;
  enableChatMessage?: boolean;
  chatMessage?: string;
  applyTokenEffects?: boolean;
  tokenEffectIds?: string[];
  effectTriggerCondition?: string;
  isHidden?: boolean;
  requiredSkillId?: string;
  requiredSkillValue?: number;
}

interface RollEntriesEditorProps {
  ownerType: "item" | "spell";
  ownerId?: string;
  canEdit: boolean;
  onExecuteRoll?: (roll: any) => void;
  draftRolls?: Partial<RollEntry>[];
  onDraftRollsChange?: (rolls: Partial<RollEntry>[]) => void;
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
    description: "",
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
    primaryColor: null,
    requiresEnergy: false,
    energyCost: undefined,
    noRoll: false,
    enableChatMessage: false,
    chatMessage: "",
    applyTokenEffects: false,
    tokenEffectIds: [],
    effectTriggerCondition: "always",
    isHidden: false,
    requiredSkillId: undefined,
    requiredSkillValue: 1,
  };
}

function getRollSummary(roll: RollEntry): string {
  const parts: string[] = [];
  const formula = roll.diceFormula || "";
  const modStr = roll.mod && roll.mod !== 0 ? (roll.mod > 0 ? `+${roll.mod}` : `${roll.mod}`) : "";
  const diceStr = formula ? `${formula}${modStr}` : modStr || "";

  if (roll.noRoll) parts.push("[No Roll]");

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
  if (roll.requiresEnergy && roll.energyCost) {
    details.push(`Energy Cost: ${roll.energyCost}`);
  }
  if (roll.applyTokenEffects) {
    const trigger = roll.effectTriggerCondition === 'success' ? 'on success' : 
                    roll.effectTriggerCondition === 'fail' ? 'on fail' : 'always';
    const count = (roll.tokenEffectIds || []).length;
    details.push(`Applies ${count} effect${count !== 1 ? 's' : ''} (${trigger})`);
  }
  if (roll.isHidden) {
    details.push(`Hidden (requires skill lvl ${roll.requiredSkillValue || 1}+)`);
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

function HiddenRollSkillPicker({
  prefix,
  selectedSkillId,
  requiredValue,
  onSkillChange,
  onValueChange,
}: {
  prefix: string;
  selectedSkillId?: string;
  requiredValue: number;
  onSkillChange: (skillId: string | undefined) => void;
  onValueChange: (value: number) => void;
}) {
  const [skillSearch, setSkillSearch] = useState("");
  const { data: systemSkills = [] } = useQuery({
    queryKey: ['system-skills'],
    queryFn: () => api.getPublicSkills(),
  });

  const filteredSkills = systemSkills.filter((s: any) =>
    s.name.toLowerCase().includes(skillSearch.toLowerCase())
  );

  const selectedSkill = systemSkills.find((s: any) => s.id === selectedSkillId);

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs text-stone-400">Required Custom Skill</Label>
        {selectedSkill ? (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-xs text-stone-200 flex items-center justify-between">
              <span>{selectedSkill.name}</span>
              <button
                type="button"
                onClick={() => onSkillChange(undefined)}
                className="text-stone-500 hover:text-red-400"
                data-testid={`button-${prefix}-clearSkill`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 space-y-1">
            <Input
              className="bg-stone-900 border-stone-600 h-7 text-xs"
              placeholder="Search skills..."
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              data-testid={`input-${prefix}-skillSearch`}
            />
            {skillSearch && (
              <div className="max-h-28 overflow-y-auto border border-stone-700 rounded bg-stone-800">
                {filteredSkills.length === 0 ? (
                  <p className="text-xs text-stone-500 p-2 italic">No skills found</p>
                ) : (
                  filteredSkills.map((skill: any) => (
                    <button
                      key={skill.id}
                      type="button"
                      className="w-full text-left px-2 py-1 text-xs text-stone-300 hover:bg-stone-700 transition-colors"
                      onClick={() => {
                        onSkillChange(skill.id);
                        setSkillSearch("");
                      }}
                      data-testid={`button-${prefix}-selectSkill-${skill.id}`}
                    >
                      {skill.name}
                      <span className="text-stone-500 ml-1">({skill.parentAttribute})</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {!skillSearch && systemSkills.length > 0 && (
              <div className="max-h-28 overflow-y-auto border border-stone-700 rounded bg-stone-800">
                {systemSkills.map((skill: any) => (
                  <button
                    key={skill.id}
                    type="button"
                    className="w-full text-left px-2 py-1 text-xs text-stone-300 hover:bg-stone-700 transition-colors"
                    onClick={() => onSkillChange(skill.id)}
                    data-testid={`button-${prefix}-selectSkill-${skill.id}`}
                  >
                    {skill.name}
                    <span className="text-stone-500 ml-1">({skill.parentAttribute})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs text-stone-400">Required Skill Value (1-5)</Label>
        <Select
          value={String(requiredValue)}
          onValueChange={(v) => onValueChange(Number(v))}
        >
          <SelectTrigger className="bg-stone-900 border-stone-600 h-7 text-xs" data-testid={`select-${prefix}-requiredSkillValue`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((v) => (
              <SelectItem key={v} value={String(v)}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-[10px] text-stone-500 italic">
        Characters must have this skill at the required value or higher to see this roll.
      </p>
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
  availableEffects = [],
}: {
  form: Partial<RollEntry>;
  setForm: React.Dispatch<React.SetStateAction<Partial<RollEntry>>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
  availableEffects?: any[];
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

      <div>
        <Label className="text-xs text-stone-400">Description</Label>
        <textarea
          className="w-full bg-stone-900 border border-stone-600 rounded-md px-3 py-1.5 text-xs text-stone-200 placeholder:text-stone-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          value={form.description || ""}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Optional description of what this roll does..."
          rows={2}
          data-testid={`input-${prefix}-description`}
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

      <ToggleButton
        active={!!form.noRoll}
        onClick={() => setForm((f) => ({ ...f, noRoll: !f.noRoll }))}
        label="No Roll (apply effect only)"
        testId={`toggle-${prefix}-noRoll`}
      />

      <CollapsibleSection title="Energy Cost" testId={`section-${prefix}-energy-cost`}>
        <ToggleButton
          active={!!form.requiresEnergy}
          onClick={() => setForm((f) => ({ ...f, requiresEnergy: !f.requiresEnergy }))}
          label="Require Energy"
          testId={`toggle-${prefix}-requiresEnergy`}
        />
        {form.requiresEnergy && (
          <div className="mt-2">
            <Label className="text-xs text-stone-400">Energy Cost</Label>
            <Input
              className="bg-stone-900 border-stone-600 h-7 text-xs"
              type="number"
              value={form.energyCost ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, energyCost: e.target.value ? parseInt(e.target.value) : undefined }))}
              placeholder="Energy cost"
              data-testid={`input-${prefix}-energyCost`}
            />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Chat Message" testId={`section-${prefix}-chat-message`}>
        <ToggleButton
          active={!!form.enableChatMessage}
          onClick={() => setForm((f) => ({ ...f, enableChatMessage: !f.enableChatMessage }))}
          label="Enable Chat Message"
          testId={`toggle-${prefix}-enableChatMessage`}
        />
        {form.enableChatMessage && (
          <div className="mt-2">
            <Label className="text-xs text-stone-400">Chat Message</Label>
            <textarea
              className="bg-stone-900 border border-stone-600 rounded-md text-xs text-stone-200 w-full p-2 min-h-[60px] resize-y"
              value={form.chatMessage || ""}
              onChange={(e) => setForm((f) => ({ ...f, chatMessage: e.target.value }))}
              placeholder="Message to display in chat with the roll..."
              data-testid={`textarea-${prefix}-chatMessage`}
            />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Token Effects" testId={`${prefix}-token-effects`}>
        <ToggleButton
          active={!!form.applyTokenEffects}
          onClick={() => setForm(f => ({ ...f, applyTokenEffects: !f.applyTokenEffects, tokenEffectIds: !f.applyTokenEffects ? f.tokenEffectIds : [] }))}
          label="Apply Token Effects"
          testId={`toggle-${prefix}-apply-effects`}
        />
        {form.applyTokenEffects && (
          <div className="space-y-2 mt-2">
            <div>
              <Label className="text-xs text-stone-400">Trigger Condition</Label>
              <Select value={form.effectTriggerCondition || "always"} onValueChange={(v) => setForm(f => ({ ...f, effectTriggerCondition: v }))}>
                <SelectTrigger className="bg-stone-900 border-stone-600 h-7 text-xs" data-testid={`select-${prefix}-effect-trigger`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always</SelectItem>
                  <SelectItem value="success">On Success</SelectItem>
                  <SelectItem value="fail">On Fail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Effects to Apply</Label>
              <div className="space-y-1 mt-1">
                {availableEffects.map((effect: any) => {
                  const isSelected = (form.tokenEffectIds || []).includes(effect.id);
                  return (
                    <label key={effect.id} className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const current = form.tokenEffectIds || [];
                          setForm(f => ({
                            ...f,
                            tokenEffectIds: isSelected
                              ? current.filter((id: string) => id !== effect.id)
                              : [...current, effect.id]
                          }));
                        }}
                        className="rounded border-stone-600"
                        data-testid={`checkbox-${prefix}-effect-${effect.id}`}
                      />
                      <span>{effect.name}</span>
                      {effect.imageUrl && <img src={effect.imageUrl} alt="" className="w-4 h-4 rounded" />}
                    </label>
                  );
                })}
                {availableEffects.length === 0 && (
                  <p className="text-xs text-stone-500 italic">No token effects defined. Create them in admin settings.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Hidden Roll" testId={`section-${prefix}-hidden`}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isHidden || false}
              onChange={(e) => setForm(f => ({ ...f, isHidden: e.target.checked, requiredSkillId: e.target.checked ? f.requiredSkillId : undefined, requiredSkillValue: e.target.checked ? (f.requiredSkillValue || 1) : 1 }))}
              className="rounded border-stone-600"
              data-testid={`checkbox-${prefix}-isHidden`}
            />
            <Label className="text-xs text-stone-300">Hide this roll (requires custom skill)</Label>
          </div>
          {form.isHidden && (
            <HiddenRollSkillPicker
              prefix={prefix}
              selectedSkillId={form.requiredSkillId}
              requiredValue={form.requiredSkillValue || 1}
              onSkillChange={(skillId) => setForm(f => ({ ...f, requiredSkillId: skillId }))}
              onValueChange={(val) => setForm(f => ({ ...f, requiredSkillValue: val }))}
            />
          )}
        </div>
      </CollapsibleSection>

      <div>
        <Label className="text-xs text-stone-400">Notification Color</Label>
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex flex-wrap gap-1.5">
            {[
              { color: "#ef4444", label: "Red" },
              { color: "#f97316", label: "Orange" },
              { color: "#eab308", label: "Yellow" },
              { color: "#22c55e", label: "Green" },
              { color: "#06b6d4", label: "Cyan" },
              { color: "#3b82f6", label: "Blue" },
              { color: "#8b5cf6", label: "Purple" },
              { color: "#ec4899", label: "Pink" },
              { color: "#f43f5e", label: "Rose" },
              { color: "#14b8a6", label: "Teal" },
              { color: "#a855f7", label: "Violet" },
              { color: "#ffffff", label: "White" },
            ].map((preset) => (
              <button
                key={preset.color}
                type="button"
                title={preset.label}
                className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${form.primaryColor === preset.color ? 'border-amber-400 ring-1 ring-amber-400' : 'border-stone-600 hover:border-stone-400'}`}
                style={{ backgroundColor: preset.color }}
                onClick={() => setForm((f) => ({ ...f, primaryColor: preset.color }))}
                data-testid={`button-${prefix}-color-${preset.label.toLowerCase()}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full border border-stone-600 shrink-0"
              style={{ backgroundColor: form.primaryColor || '#0ea5e9' }}
              data-testid={`preview-${prefix}-primaryColor`}
            />
            <input
              type="color"
              className="w-7 h-7 bg-stone-900 border border-stone-600 rounded cursor-pointer p-0"
              value={form.primaryColor || "#0ea5e9"}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              data-testid={`input-${prefix}-primaryColor`}
            />
            <span className="text-[10px] text-stone-500">{form.primaryColor ? form.primaryColor : 'Default'}</span>
            {form.primaryColor && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-[10px] border-stone-600 text-stone-400"
                onClick={() => setForm((f) => ({ ...f, primaryColor: null }))}
                data-testid={`button-${prefix}-resetColor`}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 text-xs bg-amber-700 hover:bg-amber-600"
          onClick={onSave}
          disabled={saving || !form.name?.trim() || (form.isHidden && !form.requiredSkillId)}
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

export function RollEntriesEditor({ ownerType, ownerId, canEdit, onExecuteRoll, draftRolls, onDraftRollsChange }: RollEntriesEditorProps) {
  const queryClient = useQueryClient();
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newForm, setNewForm] = useState<Partial<RollEntry>>(() => emptyFormData(ownerType, ownerId || ''));
  const [editForm, setEditForm] = useState<Partial<RollEntry>>({});

  const { data: availableEffects = [] } = useQuery({
    queryKey: ['token-effects-list'],
    queryFn: () => api.getTokenEffects(),
    enabled: canEdit,
  });

  const { data: systemSkills = [] } = useQuery({
    queryKey: ['system-skills'],
    queryFn: () => api.getPublicSkills(),
  });

  const isDraftMode = !ownerId;
  const draftRollsData = draftRolls || [];

  const queryKey = ownerType === "item" ? ["rollEntries", "item", ownerId] : ["rollEntries", "spell", ownerId];

  const { data: apiRolls = [], isLoading: apiLoading } = useQuery({
    queryKey,
    queryFn: () => (ownerType === "item" ? api.getItemRolls(ownerId!) : api.getSpellRolls(ownerId!)),
    enabled: !isDraftMode && !!ownerId,
    staleTime: 5 * 60 * 1000,
  });

  const rolls = isDraftMode ? draftRollsData : apiRolls;
  const isLoading = isDraftMode ? false : apiLoading;

  const createMutation = useMutation({
    mutationFn: (data: Partial<RollEntry>) => api.createRollEntry(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setAddingNew(false);
      setNewForm(emptyFormData(ownerType, ownerId || ''));
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
    if (isDraftMode) {
      const newRoll = {
        ...newForm,
        id: `draft-${Date.now()}`,
        sortOrder: draftRollsData.length,
      };
      onDraftRollsChange?.([...draftRollsData, newRoll]);
      setAddingNew(false);
      setNewForm(emptyFormData(ownerType, ownerId || ''));
      return;
    }
    const maxSort = rolls.length > 0 ? Math.max(...rolls.map((r: any) => r.sortOrder ?? 0)) : -1;
    createMutation.mutate({ ...newForm, ownerType, ownerId, sortOrder: maxSort + 1 });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    if (isDraftMode) {
      const updated = draftRollsData.map(r => r.id === editingId ? { ...r, ...editForm } : r);
      onDraftRollsChange?.(updated);
      setEditingId(null);
      setEditForm({});
      return;
    }
    const { id, ...data } = editForm as RollEntry;
    updateMutation.mutate({ id: editingId, data });
  };

  const handleDelete = (id: string) => {
    if (isDraftMode) {
      onDraftRollsChange?.(draftRollsData.filter(r => r.id !== id));
      return;
    }
    deleteMutation.mutate(id);
  };

  const sortedRolls = [...(rolls as RollEntry[])].sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0));

  const handleReorder = async (rollId: string, direction: 'up' | 'down') => {
    const idx = sortedRolls.findIndex(r => r.id === rollId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sortedRolls.length) return;

    const current = sortedRolls[idx];
    const target = sortedRolls[targetIdx];

    if (isDraftMode) {
      const updated = draftRollsData.map(r => {
        if (r.id === current.id) return { ...r, sortOrder: target.sortOrder ?? 0 };
        if (r.id === target.id) return { ...r, sortOrder: current.sortOrder ?? 0 };
        return r;
      });
      onDraftRollsChange?.(updated);
      return;
    }

    await api.updateRollEntry(current.id, { sortOrder: target.sortOrder ?? 0 });
    await api.updateRollEntry(target.id, { sortOrder: current.sortOrder ?? 0 });
    queryClient.invalidateQueries({ queryKey });
  };


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
              setNewForm(emptyFormData(ownerType, ownerId || ''));
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
            saving={isDraftMode ? false : createMutation.isPending}
            isNew
            availableEffects={availableEffects}
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

        const isHiddenRoll = roll.isHidden && !canEdit;
        const hiddenSkillName = roll.isHidden && roll.requiredSkillId
          ? (systemSkills as any[]).find((s: any) => s.id === roll.requiredSkillId)?.name
          : null;

        return (
          <div
            key={roll.id}
            className={`rounded-lg border p-2 ${isHiddenRoll ? 'bg-stone-900/60 border-stone-700/50 opacity-50' : 'bg-stone-800/50 border-stone-700'}`}
            data-testid={`card-roll-${roll.id}`}
          >
            {isEditing ? (
              <RollForm
                form={editForm}
                setForm={setEditForm}
                onSave={handleSaveEdit}
                onCancel={() => { setEditingId(null); setEditForm({}); }}
                saving={isDraftMode ? false : updateMutation.isPending}
                isNew={false}
                availableEffects={availableEffects}
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
                    {roll.primaryColor && (
                      <div className="w-3 h-3 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: roll.primaryColor }} />
                    )}
                    <span className={`text-xs font-medium truncate ${isHiddenRoll ? 'text-stone-500' : 'text-stone-200'}`} data-testid={`text-roll-name-${roll.id}`}>{roll.name}</span>
                    {roll.diceFormula && (
                      <span className="text-[10px] text-stone-400 shrink-0" data-testid={`text-roll-formula-${roll.id}`}>
                        {roll.diceFormula}{roll.mod && roll.mod !== 0 ? (roll.mod > 0 ? `+${roll.mod}` : roll.mod) : ""}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {onExecuteRoll && !isHiddenRoll && (
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
                          onClick={() => handleReorder(roll.id, 'up')}
                          disabled={sortedRolls.indexOf(roll) === 0}
                          data-testid={`button-move-roll-up-${roll.id}`}
                        >
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0 border-stone-600 text-stone-300"
                          onClick={() => handleReorder(roll.id, 'down')}
                          disabled={sortedRolls.indexOf(roll) === sortedRolls.length - 1}
                          data-testid={`button-move-roll-down-${roll.id}`}
                        >
                          <ArrowDown className="w-3 h-3" />
                        </Button>
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

                {isHiddenRoll && (
                  <p className="text-[10px] text-red-400 mt-1 pl-5" data-testid={`text-roll-locked-${roll.id}`}>
                    Requires {hiddenSkillName || 'skill'} level {roll.requiredSkillValue || 1}+ to unlock
                  </p>
                )}

                {isExpanded && (
                  <div className="mt-1.5 pl-5 space-y-0.5">
                    {roll.description && (
                      <p className="text-[11px] text-stone-300/80 italic mb-1" data-testid={`text-roll-description-${roll.id}`}>{roll.description}</p>
                    )}
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
                    {roll.noRoll && <span className="text-[10px] text-purple-400">No Roll</span>}
                    {roll.requiresEnergy && roll.energyCost && <span className="text-[10px] text-cyan-400">⚡ {roll.energyCost} Energy</span>}
                    {roll.enableChatMessage && <span className="text-[10px] text-emerald-400">💬 Chat Message</span>}
                    {roll.applyTokenEffects && (
                      <p className="text-[10px] text-violet-400">
                        Applies effects ({roll.effectTriggerCondition || 'always'})
                      </p>
                    )}
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
