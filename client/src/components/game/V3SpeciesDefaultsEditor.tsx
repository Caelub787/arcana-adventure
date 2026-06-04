import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { V3_ATTRIBUTES } from "@shared/v3";

export interface V3DefaultSkill {
  name: string;
  description?: string;
  parentAttribute: string;
  value: number;
}

export interface V3DefaultTrait {
  name: string;
  description?: string;
  parentAttribute: string;
  usesPerLongRest: number;
}

interface V3SpeciesDefaultsEditorProps {
  attributeBonuses: Record<string, number>;
  defaultCustomSkills: V3DefaultSkill[];
  defaultTraits: V3DefaultTrait[];
  onChange: (patch: {
    attributeBonuses?: Record<string, number>;
    defaultCustomSkills?: V3DefaultSkill[];
    defaultTraits?: V3DefaultTrait[];
  }) => void;
}

export function V3SpeciesDefaultsEditor({
  attributeBonuses,
  defaultCustomSkills,
  defaultTraits,
  onChange,
}: V3SpeciesDefaultsEditorProps) {
  const setBonus = (key: string, value: number) => {
    onChange({ attributeBonuses: { ...attributeBonuses, [key]: value } });
  };

  const addSkill = () => {
    onChange({
      defaultCustomSkills: [
        ...defaultCustomSkills,
        { name: "", description: "", parentAttribute: V3_ATTRIBUTES[0].key, value: 0 },
      ],
    });
  };
  const updateSkill = (i: number, patch: Partial<V3DefaultSkill>) => {
    const next = defaultCustomSkills.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange({ defaultCustomSkills: next });
  };
  const removeSkill = (i: number) => {
    onChange({ defaultCustomSkills: defaultCustomSkills.filter((_, idx) => idx !== i) });
  };

  const addTrait = () => {
    onChange({
      defaultTraits: [
        ...defaultTraits,
        { name: "", description: "", parentAttribute: "will", usesPerLongRest: 1 },
      ],
    });
  };
  const updateTrait = (i: number, patch: Partial<V3DefaultTrait>) => {
    const next = defaultTraits.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    onChange({ defaultTraits: next });
  };
  const removeTrait = (i: number) => {
    onChange({ defaultTraits: defaultTraits.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-5" data-testid="editor-v3-species-defaults">
      {/* Attribute bonuses */}
      <div>
        <Label className="text-amber-500">Starting Attribute Bonuses</Label>
        <p className="text-xs text-stone-500 mb-2">Applied on top of base attributes when a character of this species is created.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {V3_ATTRIBUTES.map((attr) => (
            <div key={attr.key} className="flex items-center gap-2">
              <Label className="text-xs text-stone-300 w-24 shrink-0">{attr.name}</Label>
              <Input
                type="number"
                value={attributeBonuses[attr.key] ?? 0}
                onChange={(e) => setBonus(attr.key, e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                className="bg-stone-800 border-stone-700 h-8"
                data-testid={`input-v3-species-bonus-${attr.key}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Default custom skills */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-amber-500">Default Knowledge</Label>
          <Button type="button" size="sm" variant="outline" onClick={addSkill} className="bg-stone-800 border-stone-700 h-7" data-testid="button-add-v3-species-skill">
            <Plus className="h-3 w-3 mr-1" /> Add Skill
          </Button>
        </div>
        {defaultCustomSkills.length === 0 && <p className="text-xs text-stone-500">No default skills.</p>}
        <div className="space-y-2">
          {defaultCustomSkills.map((skill, i) => (
            <div key={i} className="bg-stone-800/60 border border-stone-700 rounded p-2 space-y-2" data-testid={`row-v3-species-skill-${i}`}>
              <div className="flex gap-2">
                <Input
                  placeholder="Skill name"
                  value={skill.name}
                  onChange={(e) => updateSkill(i, { name: e.target.value })}
                  className="bg-stone-800 border-stone-700 h-8 flex-1"
                  data-testid={`input-v3-species-skill-name-${i}`}
                />
                <Select value={skill.parentAttribute} onValueChange={(v) => updateSkill(i, { parentAttribute: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 h-8 w-32" data-testid={`select-v3-species-skill-attr-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {V3_ATTRIBUTES.map((a) => (
                      <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={skill.value}
                  onChange={(e) => updateSkill(i, { value: e.target.value === "" ? 0 : parseInt(e.target.value) || 0 })}
                  className="bg-stone-800 border-stone-700 h-8 w-16"
                  data-testid={`input-v3-species-skill-value-${i}`}
                />
                <Button type="button" size="icon" variant="ghost" onClick={() => removeSkill(i)} className="h-8 w-8 text-red-400 shrink-0" data-testid={`button-remove-v3-species-skill-${i}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Description (optional)"
                value={skill.description || ""}
                onChange={(e) => updateSkill(i, { description: e.target.value })}
                className="bg-stone-800 border-stone-700 h-8 text-xs"
                data-testid={`input-v3-species-skill-desc-${i}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Default traits */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-amber-500">Default Traits</Label>
          <Button type="button" size="sm" variant="outline" onClick={addTrait} className="bg-stone-800 border-stone-700 h-7" data-testid="button-add-v3-species-trait">
            <Plus className="h-3 w-3 mr-1" /> Add Trait
          </Button>
        </div>
        {defaultTraits.length === 0 && <p className="text-xs text-stone-500">No default traits.</p>}
        <div className="space-y-2">
          {defaultTraits.map((trait, i) => (
            <div key={i} className="bg-stone-800/60 border border-stone-700 rounded p-2 space-y-2" data-testid={`row-v3-species-trait-${i}`}>
              <div className="flex gap-2">
                <Input
                  placeholder="Trait name"
                  value={trait.name}
                  onChange={(e) => updateTrait(i, { name: e.target.value })}
                  className="bg-stone-800 border-stone-700 h-8 flex-1"
                  data-testid={`input-v3-species-trait-name-${i}`}
                />
                <Select value={trait.parentAttribute} onValueChange={(v) => updateTrait(i, { parentAttribute: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 h-8 w-32" data-testid={`select-v3-species-trait-attr-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {V3_ATTRIBUTES.map((a) => (
                      <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-stone-400 whitespace-nowrap">Uses/LR</Label>
                  <Input
                    type="number"
                    min={0}
                    value={trait.usesPerLongRest}
                    onChange={(e) => updateTrait(i, { usesPerLongRest: e.target.value === "" ? 0 : parseInt(e.target.value) || 0 })}
                    className="bg-stone-800 border-stone-700 h-8 w-14"
                    data-testid={`input-v3-species-trait-uses-${i}`}
                  />
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => removeTrait(i)} className="h-8 w-8 text-red-400 shrink-0" data-testid={`button-remove-v3-species-trait-${i}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                placeholder="Description (optional)"
                value={trait.description || ""}
                onChange={(e) => updateTrait(i, { description: e.target.value })}
                className="bg-stone-800 border-stone-700 text-xs min-h-[48px]"
                data-testid={`textarea-v3-species-trait-desc-${i}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
