import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api, type SystemSpecies } from "@/lib/api";
import { V3SpeciesDefaultsEditor, type V3DefaultSkill, type V3DefaultTrait } from "@/components/game/V3SpeciesDefaultsEditor";

interface V3SystemSpeciesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemName: string; // display systemName, e.g. "A.A. V3"
  initialData?: SystemSpecies | null;
  onSaved?: () => void;
}

const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

export function V3SystemSpeciesDialog({ open, onOpenChange, systemName, initialData, onSaved }: V3SystemSpeciesDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    description: "",
    defaultImage: "",
    lifespan: 100,
    speed: 30,
    flySpeed: 0,
    swimSpeed: 0,
    size: "Medium",
    naturalArmor: 5,
    sizeBonus: 0,
    startingHp: 10,
    startingMaxHp: 10,
    hpPerLevel: 5,
    startingEnergy: 10,
    startingMaxEnergy: 10,
    energyPerLevel: 6,
    startingMana: 0,
    startingMaxMana: 0,
    carryWeight: 50,
    visionType: "normal",
    dayVisionDistance: 60,
    nightVisionDistance: 30,
    attributeBonuses: {} as Record<string, number>,
    skillBonuses: {} as Record<string, number>,
    defaultCustomSkills: [] as V3DefaultSkill[],
    defaultTraits: [] as V3DefaultTrait[],
  });

  useEffect(() => {
    if (open) {
      const s = initialData as any;
      setForm({
        name: s?.name || "",
        description: s?.description || "",
        defaultImage: s?.defaultImage || "",
        lifespan: s?.lifespan ?? 100,
        speed: s?.speed ?? 30,
        flySpeed: s?.flySpeed ?? 0,
        swimSpeed: s?.swimSpeed ?? 0,
        size: s?.size || "Medium",
        naturalArmor: s?.naturalArmor ?? 5,
        sizeBonus: s?.sizeBonus ?? 0,
        startingHp: s?.startingHp ?? 10,
        startingMaxHp: s?.startingMaxHp ?? 10,
        hpPerLevel: s?.hpPerLevel ?? 5,
        startingEnergy: s?.startingEnergy ?? 10,
        startingMaxEnergy: s?.startingMaxEnergy ?? 10,
        energyPerLevel: s?.energyPerLevel ?? 6,
        startingMana: s?.startingMana ?? 0,
        startingMaxMana: s?.startingMaxMana ?? 0,
        carryWeight: s?.carryWeight ?? 50,
        visionType: s?.visionType || "normal",
        dayVisionDistance: s?.dayVisionDistance ?? 60,
        nightVisionDistance: s?.nightVisionDistance ?? 30,
        attributeBonuses: s?.attributeBonuses || {},
        skillBonuses: s?.skillBonuses || {},
        defaultCustomSkills: (s?.defaultCustomSkills || []).map((sk: any) => ({ ...sk, _key: sk._key || Math.random().toString(36).slice(2) })),
        defaultTraits: (s?.defaultTraits || []).map((tr: any) => ({ ...tr, _key: tr._key || Math.random().toString(36).slice(2) })),
      });
    }
  }, [open, initialData?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<SystemSpecies> = { ...form, systemName } as any;
      if (initialData?.id) {
        return api.updateSystemSpecies(initialData.id, payload);
      }
      return api.createSystemSpecies(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-species"] });
      toast({ title: initialData ? "Species Updated" : "Species Created" });
      onSaved?.();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save species", variant: "destructive" });
    },
  });

  const num = (field: keyof typeof form, fb = 0) => ({
    value: (form[field] as number) ?? fb,
    onChange: (v: number | undefined) => setForm({ ...form, [field]: v ?? fb }),
    fallback: fb,
    className: "bg-stone-800 border-stone-700 h-8",
  });

  // V3 stats are Max-only; keep the legacy "starting/current" column equal to Max
  // so new characters start full and downstream readers stay consistent.
  const maxStat = (maxField: keyof typeof form, startField: keyof typeof form, fb = 0) => ({
    value: (form[maxField] as number) ?? fb,
    onChange: (v: number | undefined) => {
      const val = v ?? fb;
      setForm({ ...form, [maxField]: val, [startField]: val });
    },
    fallback: fb,
    className: "bg-stone-800 border-stone-700 h-8",
  });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Error", description: "Species name is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-amber-500">{initialData ? "Edit V3 Species" : "Create V3 Species"}</DialogTitle>
          <DialogDescription className="text-stone-400">Define an AA V3 species (attribute bonuses + default skills & traits, no skill tree).</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-4 min-h-0">
          <div className="space-y-4 py-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-stone-800 border-stone-700"
                data-testid="input-v3-system-species-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="bg-stone-800 border-stone-700 min-h-[70px]"
                data-testid="textarea-v3-system-species-description"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Lifespan</Label>
                <NumberInput {...num("lifespan", 100)} data-testid="input-v3-system-species-lifespan" />
              </div>
              <div>
                <Label className="text-xs">Speed</Label>
                <NumberInput {...num("speed", 30)} data-testid="input-v3-system-species-speed" />
              </div>
              <div>
                <Label className="text-xs">Fly Speed</Label>
                <NumberInput {...num("flySpeed")} data-testid="input-v3-system-species-flyspeed" />
              </div>
              <div>
                <Label className="text-xs">Swim Speed</Label>
                <NumberInput {...num("swimSpeed")} data-testid="input-v3-system-species-swimspeed" />
              </div>
              <div>
                <Label className="text-xs">Size</Label>
                <Select value={form.size} onValueChange={(v) => setForm({ ...form, size: v })}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 h-8" data-testid="select-v3-system-species-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Carry Weight</Label>
                <NumberInput {...num("carryWeight", 50)} data-testid="input-v3-system-species-carry" />
              </div>
              <div>
                <Label className="text-xs">Max HP</Label>
                <NumberInput {...maxStat("startingMaxHp", "startingHp", 10)} data-testid="input-v3-system-species-maxhp" />
              </div>
              <div>
                <Label className="text-xs">HP / Level</Label>
                <NumberInput {...num("hpPerLevel", 5)} data-testid="input-v3-system-species-hpperlevel" />
              </div>
              <div>
                <Label className="text-xs">Max Energy</Label>
                <NumberInput {...maxStat("startingMaxEnergy", "startingEnergy", 10)} data-testid="input-v3-system-species-maxenergy" />
              </div>
              <div>
                <Label className="text-xs">Energy / Level</Label>
                <NumberInput {...num("energyPerLevel", 6)} data-testid="input-v3-system-species-energyperlevel" />
              </div>
              <div>
                <Label className="text-xs">Max Mana</Label>
                <NumberInput {...maxStat("startingMaxMana", "startingMana")} data-testid="input-v3-system-species-maxmana" />
              </div>
            </div>

            <div className="border-t border-stone-700 pt-4">
              <V3SpeciesDefaultsEditor
                attributeBonuses={form.attributeBonuses}
                skillBonuses={form.skillBonuses}
                defaultCustomSkills={form.defaultCustomSkills}
                defaultTraits={form.defaultTraits}
                onChange={(patch) => setForm({ ...form, ...patch })}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 shrink-0 border-t border-stone-700">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-stone-800 border-stone-700">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || !form.name.trim()}
            className="bg-amber-700 hover:bg-amber-600"
            data-testid="button-save-v3-system-species"
          >
            {saveMutation.isPending ? "Saving..." : (initialData ? "Update Species" : "Create Species")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
