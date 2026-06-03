import { useState, useEffect, useMemo, useCallback } from "react";
import {
  V3_ELEMENTS,
  V3_SECONDARY_ROLES,
  V3_ROLE_MAP,
  V3_CORE_ROLE_KEY,
  V3_INTENTS,
  V3_DELIVERIES,
  V3_REACHES,
  V3_DURATIONS,
  V3_ELEMENT_MAP,
  V3_INTENT_MAP,
  V3_DELIVERY_MAP,
  V3_REACH_MAP,
  V3_DURATION_MAP,
  v3ManaCost,
  v3CraftDc,
  v3ElementCount,
  v3RoleColor,
  isValidV3Composition,
  type V3SpellComposition,
} from "@shared/v3spells";
import { api, gameWs, type V3Spell } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImageBrowser } from "@/components/ImageBrowser";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Plus, X, Wand2, Loader2, Droplet, Image as ImageIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function elementName(key: string): string {
  return V3_ELEMENT_MAP[key]?.name ?? key;
}

interface CrafterCharacter {
  id: string;
  name?: string;
  mana?: number | null;
  anemos?: number | null;
  spellCreationTokens?: number | null;
}

// ---------------------------------------------------------------------------
// Live color-coded formula display
// ---------------------------------------------------------------------------
function FormulaDisplay({ comp }: { comp: V3SpellComposition }) {
  const coreColor = v3RoleColor(V3_CORE_ROLE_KEY);
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-sm"
      data-testid="text-spell-formula"
    >
      {comp.core ? (
        <span
          className="px-2 py-0.5 rounded font-semibold"
          style={{ backgroundColor: `${coreColor}22`, color: coreColor, border: `1px solid ${coreColor}66` }}
          data-testid="formula-core"
        >
          {elementName(comp.core)}
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded text-stone-500 italic border border-dashed border-stone-700">
          choose a Core
        </span>
      )}
      {comp.secondaries.map((s, i) => {
        const c = v3RoleColor(s.role);
        return (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-stone-500">+</span>
            <span
              className="px-2 py-0.5 rounded"
              style={{ backgroundColor: `${c}22`, color: c, border: `1px solid ${c}66` }}
              data-testid={`formula-secondary-${i}`}
            >
              {elementName(s.element)}
              <span className="ml-1 text-[10px] uppercase opacity-80">{V3_ROLE_MAP[s.role]?.name ?? s.role}</span>
            </span>
          </span>
        );
      })}
      {(comp.intent || comp.delivery || comp.reach || comp.duration) && (
        <span className="text-stone-500">·</span>
      )}
      {comp.intent && (
        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-xs" data-testid="formula-intent">
          {V3_INTENT_MAP[comp.intent]?.name}
        </span>
      )}
      {comp.delivery && (
        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-xs" data-testid="formula-delivery">
          {V3_DELIVERY_MAP[comp.delivery]?.name}
        </span>
      )}
      {comp.reach && (
        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-xs" data-testid="formula-reach">
          {V3_REACH_MAP[comp.reach]?.name}
        </span>
      )}
      {comp.duration && (
        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-xs" data-testid="formula-duration">
          {V3_DURATION_MAP[comp.duration]?.name}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable crafter component
// ---------------------------------------------------------------------------
export interface V3SpellCrafterProps {
  character: CrafterCharacter;
  onCrafted?: (spell: V3Spell | undefined, autoFilled: boolean) => void;
  // When set, crafted spells are added to this spellbook item.
  spellbookItemId?: string;
}

const DEFAULT_COMP: V3SpellComposition = {
  core: "",
  secondaries: [],
  intent: "",
  delivery: "",
  reach: "self",
  duration: "instant",
};

export function V3SpellCrafter({ character, onCrafted, spellbookItemId }: V3SpellCrafterProps) {
  const { toast } = useToast();
  const [comp, setComp] = useState<V3SpellComposition>(DEFAULT_COMP);
  const [crafting, setCrafting] = useState(false);

  const manaCost = useMemo(() => v3ManaCost(comp), [comp]);
  const craftDc = useMemo(() => v3CraftDc(comp), [comp]);
  const elementCount = useMemo(() => v3ElementCount(comp), [comp]);
  const valid = useMemo(() => isValidV3Composition(comp) && !!comp.core && !!comp.intent && !!comp.delivery, [comp]);

  const currentMana = character.mana ?? 0;
  const currentTokens = character.spellCreationTokens ?? 0;
  const notEnoughMana = currentMana < manaCost;
  const noTokens = currentTokens < 1;

  const setCore = (key: string) => setComp((c) => ({ ...c, core: c.core === key ? "" : key }));

  const addSecondary = () =>
    setComp((c) => ({
      ...c,
      secondaries: [...c.secondaries, { element: V3_ELEMENTS[0].key, role: V3_SECONDARY_ROLES[0].key }],
    }));

  const updateSecondary = (i: number, patch: Partial<{ element: string; role: string }>) =>
    setComp((c) => ({
      ...c,
      secondaries: c.secondaries.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));

  const removeSecondary = (i: number) =>
    setComp((c) => ({ ...c, secondaries: c.secondaries.filter((_, idx) => idx !== i) }));

  const handleCraft = async () => {
    if (!valid || crafting) return;
    setCrafting(true);
    try {
      const result = await api.craftV3Spell(character.id, comp, spellbookItemId);
      if (result.success) {
        toast({
          title: "Spell crafted!",
          description: result.autoFilled
            ? `Roll ${result.roll.total} vs DC ${result.roll.dc}. This composition is already known — its details were filled in automatically.`
            : `Roll ${result.roll.total} vs DC ${result.roll.dc}. Your GM has been asked to name and describe it.`,
        });
        setComp(DEFAULT_COMP);
        onCrafted?.(result.spell, !!result.autoFilled);
      } else {
        toast({
          title: "Crafting failed",
          description: `Roll ${result.roll.total} vs DC ${result.roll.dc}. The mana was spent, but your token was not consumed — try again.`,
          variant: "destructive",
        });
        onCrafted?.(undefined, false);
      }
    } catch (err: any) {
      toast({
        title: "Could not craft spell",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setCrafting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="v3-spell-crafter">
      {/* Core element */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-amber-400 flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Core Element <span className="text-stone-500 normal-case">(required)</span>
        </Label>
        <TooltipProvider>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {V3_ELEMENTS.map((el) => {
              const selected = comp.core === el.key;
              return (
                <Tooltip key={el.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setCore(el.key)}
                      className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                        selected
                          ? "bg-amber-500/20 border-amber-500 text-amber-200"
                          : "bg-stone-900 border-stone-700 text-stone-300 hover:border-stone-500"
                      }`}
                      data-testid={`button-core-${el.key}`}
                    >
                      {el.name}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-semibold">{el.name}</p>
                    <p className="text-xs text-stone-300">{el.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>

      {/* Secondary elements */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-stone-400">Secondary Elements</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={addSecondary}
            data-testid="button-add-secondary"
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {comp.secondaries.length === 0 && (
          <p className="text-xs text-stone-500 italic">No secondary elements. A single-element spell auto-succeeds (DC 0).</p>
        )}
        <div className="space-y-1.5">
          {comp.secondaries.map((s, i) => {
            const roleColor = v3RoleColor(s.role);
            return (
              <div key={i} className="flex items-center gap-1.5" data-testid={`row-secondary-${i}`}>
                <span className="w-1.5 self-stretch rounded" style={{ backgroundColor: roleColor }} />
                <Select value={s.element} onValueChange={(v) => updateSecondary(i, { element: v })}>
                  <SelectTrigger className="h-8 text-xs flex-1" data-testid={`select-secondary-element-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {V3_ELEMENTS.map((el) => (
                      <SelectItem key={el.key} value={el.key} className="text-xs">
                        {el.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={s.role} onValueChange={(v) => updateSecondary(i, { role: v })}>
                  <SelectTrigger className="h-8 text-xs flex-1" data-testid={`select-secondary-role-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {V3_SECONDARY_ROLES.map((r) => (
                      <SelectItem key={r.key} value={r.key} className="text-xs">
                        <span style={{ color: r.color }}>{r.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-stone-400 hover:text-red-400"
                  onClick={() => removeSecondary(i)}
                  data-testid={`button-remove-secondary-${i}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Intent / Delivery / Reach / Duration */}
      <div className="grid grid-cols-2 gap-2">
        <V3SelectField label="Intent" value={comp.intent} options={V3_INTENTS} onChange={(v) => setComp((c) => ({ ...c, intent: v }))} testid="select-intent" placeholder="Choose…" />
        <V3SelectField label="Delivery" value={comp.delivery} options={V3_DELIVERIES} onChange={(v) => setComp((c) => ({ ...c, delivery: v }))} testid="select-delivery" placeholder="Choose…" />
        <V3SelectField label="Reach" value={comp.reach} options={V3_REACHES} onChange={(v) => setComp((c) => ({ ...c, reach: v }))} testid="select-reach" />
        <V3SelectField label="Duration" value={comp.duration} options={V3_DURATIONS} onChange={(v) => setComp((c) => ({ ...c, duration: v }))} testid="select-duration" />
      </div>

      {/* Live formula */}
      <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-3 space-y-2">
        <Label className="text-[10px] uppercase tracking-wide text-stone-500">Formula</Label>
        <FormulaDisplay comp={comp} />
      </div>

      {/* Cost summary + craft */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-sm">
          <span className={`flex items-center gap-1 ${notEnoughMana ? "text-red-400" : "text-violet-300"}`} data-testid="text-craft-mana-cost">
            <Droplet className="h-4 w-4" /> {manaCost} mana
          </span>
          <span className="text-stone-500">·</span>
          <span className="text-stone-300" data-testid="text-craft-dc">
            DC {craftDc}{craftDc <= 0 ? " (auto)" : ""}
          </span>
          <span className="text-stone-500">·</span>
          <span className={`flex items-center gap-1 ${noTokens ? "text-red-400" : "text-amber-300"}`} data-testid="text-craft-tokens">
            <Sparkles className="h-3.5 w-3.5" /> {currentTokens} token{currentTokens === 1 ? "" : "s"}
          </span>
        </div>
        <Button
          onClick={handleCraft}
          disabled={!valid || crafting || notEnoughMana || noTokens}
          className="bg-amber-600 hover:bg-amber-700 text-stone-950"
          data-testid="button-craft-spell"
        >
          {crafting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
          Craft ({elementCount} element{elementCount === 1 ? "" : "s"})
        </Button>
      </div>
      {notEnoughMana && <p className="text-xs text-red-400">Not enough mana to craft this spell.</p>}
      {!notEnoughMana && noTokens && <p className="text-xs text-red-400">No spell creation tokens left. Take a long rest to refill.</p>}
    </div>
  );
}

function V3SelectField({
  label,
  value,
  options,
  onChange,
  testid,
  placeholder,
}: {
  label: string;
  value: string;
  options: { key: string; name: string; description: string }[];
  onChange: (v: string) => void;
  testid: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-stone-400">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs" data-testid={testid}>
          <SelectValue placeholder={placeholder || "Select"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key} className="text-xs">
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GM authoring pop-up — listens for craft requests and lets the GM author
// the spell's name / description / profile image.
// ---------------------------------------------------------------------------
interface PendingRequest {
  spell: V3Spell;
  characterName?: string;
}

export function V3SpellAuthoringListener({
  campaignId,
  isGM,
}: {
  campaignId: string;
  isGM: boolean;
}) {
  const { toast } = useToast();
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const active = queue[0];

  const enqueue = useCallback((req: PendingRequest) => {
    setQueue((q) => {
      if (q.some((r) => r.spell.id === req.spell.id)) return q;
      return [...q, req];
    });
  }, []);

  // Load any already-pending requests on mount (e.g. GM joined after the craft).
  useEffect(() => {
    if (!isGM || !campaignId) return;
    let cancelled = false;
    api
      .getV3SpellRequests(campaignId)
      .then((rows) => {
        if (cancelled) return;
        rows.forEach((spell) => enqueue({ spell }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId, isGM, enqueue]);

  // Listen for real-time craft requests.
  useEffect(() => {
    if (!isGM) return;
    const unsubscribe = gameWs.onMessage((data: any) => {
      if (data?.type === "v3_spell_request" && data.spell) {
        enqueue({ spell: data.spell, characterName: data.characterName });
        toast({
          title: "New spell crafted",
          description: `${data.characterName || "A player"} crafted a new spell. Author its details.`,
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [isGM, enqueue, toast]);

  // Reset the form whenever the active request changes.
  useEffect(() => {
    if (active) {
      setName(active.spell.name || "");
      setDescription(active.spell.description || "");
      setImage(active.spell.image || null);
    }
  }, [active?.spell.id]);

  if (!isGM || !active) return null;

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.authorV3Spell(active.spell.id, { name: name.trim(), description, image });
      toast({ title: "Spell authored", description: `"${name.trim()}" is ready for the player.` });
      setQueue((q) => q.slice(1));
    } catch (err: any) {
      toast({
        title: "Could not save",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const comp = active.spell.composition;

  return (
    <>
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-lg" data-testid="dialog-v3-spell-authoring">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-amber-400" />
              Author a Crafted Spell
            </DialogTitle>
            <DialogDescription>
              {active.characterName ? `${active.characterName} crafted` : "A player crafted"} a new spell. Give it a
              name, description, and profile image.
              {queue.length > 1 && (
                <span className="ml-1 text-amber-400">({queue.length - 1} more waiting)</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {comp && (
              <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-3 space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-stone-500">Composition</Label>
                <FormulaDisplay comp={comp} />
                <p className="text-xs text-stone-500 pt-1">
                  {active.spell.manaCost} mana · DC {active.spell.craftDc}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowImageBrowser(true)}
                className="h-20 w-20 shrink-0 rounded-lg border border-stone-700 bg-stone-900 overflow-hidden flex items-center justify-center hover:border-amber-500 transition-colors"
                data-testid="button-spell-image"
              >
                {image ? (
                  <img src={image} alt="Spell" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-stone-500" />
                )}
              </button>
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-stone-400">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cinderlance"
                  data-testid="input-spell-name"
                />
                <p className="text-[10px] text-stone-500">Click the box to set a profile image.</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-stone-400">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this spell looks and feels like…"
                rows={4}
                data-testid="input-spell-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || submitting}
              className="bg-amber-600 hover:bg-amber-700 text-stone-950"
              data-testid="button-submit-authoring"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Finalize Spell
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageBrowser
        open={showImageBrowser}
        onOpenChange={setShowImageBrowser}
        onSelect={(url) => setImage(url)}
        saveToFile
        title="Select Spell Image"
      />
    </>
  );
}
