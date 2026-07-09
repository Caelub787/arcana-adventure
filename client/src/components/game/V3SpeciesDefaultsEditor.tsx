import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { V3_ATTRIBUTES, V3_SKILLS } from "@shared/v3";

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
  skillBonuses: Record<string, number>;
  defaultCustomSkills: V3DefaultSkill[];
  defaultTraits: V3DefaultTrait[];
  onChange: (patch: {
    attributeBonuses?: Record<string, number>;
    skillBonuses?: Record<string, number>;
    defaultCustomSkills?: V3DefaultSkill[];
    defaultTraits?: V3DefaultTrait[];
  }) => void;
}

export function V3SpeciesDefaultsEditor({
  attributeBonuses,
  skillBonuses,
  defaultCustomSkills,
  defaultTraits,
  onChange,
}: V3SpeciesDefaultsEditorProps) {
  // Admin-made knowledge (system skills) and traits for the A.A. V3 system.
  const { data: adminKnowledge = [] } = useQuery({
    queryKey: ["admin-skills", "aa-v3"],
    queryFn: () => api.getSystemSkills("aa-v3"),
  });
  const { data: adminTraits = [] } = useQuery({
    queryKey: ["admin-traits", "aa-v3"],
    queryFn: () => api.getSystemTraits("aa-v3"),
  });

  const setBonus = (key: string, value: number) => {
    onChange({ attributeBonuses: { ...attributeBonuses, [key]: value } });
  };

  const setSkillBonus = (key: string, value: number) => {
    onChange({ skillBonuses: { ...skillBonuses, [key]: value } });
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
  const pickKnowledge = (i: number, name: string) => {
    const k: any = (adminKnowledge as any[]).find((x) => x.name === name);
    if (!k) return;
    updateSkill(i, {
      name: k.name,
      description: k.description || "",
      parentAttribute: k.parentAttribute || V3_ATTRIBUTES[0].key,
    });
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
  const pickTrait = (i: number, name: string) => {
    const t: any = (adminTraits as any[]).find((x) => x.name === name);
    if (!t) return;
    updateTrait(i, {
      name: t.name,
      description: t.description || "",
      parentAttribute: t.parentAttribute || "will",
      usesPerLongRest: Number(t.usesPerLongRest) || 1,
    });
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
              <NumberInput
                value={attributeBonuses[attr.key] ?? 0}
                onChange={(v) => setBonus(attr.key, v ?? 0)}
                className="bg-stone-800 border-stone-700 h-8"
                data-testid={`input-v3-species-bonus-${attr.key}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Skill bonuses */}
      <div>
        <Label className="text-amber-500">Starting Skill Bonuses</Label>
        <p className="text-xs text-stone-500 mb-2">A free per-skill bonus added when a character of this species is created (like attribute bonuses).</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...V3_SKILLS].sort((a, b) => a.name.localeCompare(b.name)).map((skill) => (
            <div key={skill.key} className="flex items-center gap-2">
              <Label className="text-xs text-stone-300 w-24 shrink-0" title={skill.description}>{skill.name}</Label>
              <NumberInput
                value={skillBonuses[skill.key] ?? 0}
                onChange={(v) => setSkillBonus(skill.key, v ?? 0)}
                className="bg-stone-800 border-stone-700 h-8"
                data-testid={`input-v3-species-skillbonus-${skill.key}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Default knowledge (from admin-made knowledge) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-amber-500">Default Knowledge</Label>
          <Button type="button" size="sm" variant="outline" onClick={addSkill} className="bg-stone-800 border-stone-700 h-7" data-testid="button-add-v3-species-skill">
            <Plus className="h-3 w-3 mr-1" /> Add Knowledge
          </Button>
        </div>
        <p className="text-xs text-stone-500 mb-2">Knowledge created in Admin that is added to a character of this species by default.</p>
        {(adminKnowledge as any[]).length === 0 && (
          <p className="text-xs text-amber-400/70">No admin knowledge exists yet. Create knowledge in Admin first.</p>
        )}
        {defaultCustomSkills.length === 0 && <p className="text-xs text-stone-500">No default knowledge.</p>}
        <div className="space-y-2">
          {defaultCustomSkills.map((skill, i) => (
            <div key={i} className="bg-stone-800/60 border border-stone-700 rounded p-2" data-testid={`row-v3-species-skill-${i}`}>
              <div className="flex gap-2 items-center">
                <Select value={skill.name || undefined} onValueChange={(v) => pickKnowledge(i, v)}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 h-8 flex-1" data-testid={`select-v3-species-skill-name-${i}`}>
                    <SelectValue placeholder="Select knowledge" />
                  </SelectTrigger>
                  <SelectContent>
                    {(adminKnowledge as any[]).map((k) => (
                      <SelectItem key={k.id} value={k.name}>{k.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-stone-400 whitespace-nowrap">Bonus</Label>
                  <NumberInput
                    value={skill.value}
                    onChange={(v) => updateSkill(i, { value: v ?? 0 })}
                    className="bg-stone-800 border-stone-700 h-8 w-16"
                    data-testid={`input-v3-species-skill-value-${i}`}
                  />
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => removeSkill(i)} className="h-8 w-8 text-red-400 shrink-0" data-testid={`button-remove-v3-species-skill-${i}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {skill.description && <p className="text-[10px] text-stone-500 mt-1">{skill.description}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Default traits (from admin-made traits) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-amber-500">Default Traits</Label>
          <Button type="button" size="sm" variant="outline" onClick={addTrait} className="bg-stone-800 border-stone-700 h-7" data-testid="button-add-v3-species-trait">
            <Plus className="h-3 w-3 mr-1" /> Add Trait
          </Button>
        </div>
        <p className="text-xs text-stone-500 mb-2">Traits created in Admin that are added to a character of this species by default.</p>
        {(adminTraits as any[]).length === 0 && (
          <p className="text-xs text-amber-400/70">No admin traits exist yet. Create traits in Admin first.</p>
        )}
        {defaultTraits.length === 0 && <p className="text-xs text-stone-500">No default traits.</p>}
        <div className="space-y-2">
          {defaultTraits.map((trait, i) => (
            <div key={i} className="bg-stone-800/60 border border-stone-700 rounded p-2" data-testid={`row-v3-species-trait-${i}`}>
              <div className="flex gap-2 items-center">
                <Select value={trait.name || undefined} onValueChange={(v) => pickTrait(i, v)}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 h-8 flex-1" data-testid={`select-v3-species-trait-name-${i}`}>
                    <SelectValue placeholder="Select trait" />
                  </SelectTrigger>
                  <SelectContent>
                    {(adminTraits as any[]).map((t) => (
                      <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-stone-400 whitespace-nowrap">Uses/LR</Label>
                  <NumberInput
                    value={trait.usesPerLongRest}
                    onChange={(v) => updateTrait(i, { usesPerLongRest: v ?? 0 })}
                    min={0}
                    className="bg-stone-800 border-stone-700 h-8 w-14"
                    data-testid={`input-v3-species-trait-uses-${i}`}
                  />
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => removeTrait(i)} className="h-8 w-8 text-red-400 shrink-0" data-testid={`button-remove-v3-species-trait-${i}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {trait.description && <p className="text-[10px] text-stone-500 mt-1">{trait.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
