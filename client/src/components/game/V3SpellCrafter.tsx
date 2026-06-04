import { useState, useEffect, useMemo, useCallback } from "react";
import {
  V3_ELEMENTS,
  V3_SECONDARY_ROLES,
  V3_ROLE_MAP,
  V3_CORE_ROLE_KEY,
  V3_INTENTS,
  V3_DELIVERIES,
  V3_REACHES,
  V3_AOE_RANGES,
  V3_DURATIONS,
  V3_ELEMENT_MAP,
  V3_INTENT_MAP,
  V3_DELIVERY_MAP,
  V3_REACH_MAP,
  V3_AOE_RANGE_MAP,
  V3_DURATION_MAP,
  v3IsAoeDelivery,
  v3ManaCost,
  v3CraftDc,
  v3ElementCount,
  v3RoleColor,
  isValidV3Composition,
  evaluateV3ElementEligibility,
  type V3SpellComposition,
  type V3ElementEligibility,
  type V3ElementCondition,
} from "@shared/v3spells";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Sparkles, Plus, X, Wand2, Loader2, Droplet, Image as ImageIcon, ChevronUp, ChevronDown, Lock } from "lucide-react";

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
      {(comp.intent || comp.delivery || comp.reach || comp.duration || comp.aoeRange) && (
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
      {comp.aoeRange && (
        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 text-xs" data-testid="formula-aoe-range">
          AOE {V3_AOE_RANGE_MAP[comp.aoeRange]?.name}
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
// Reusable composition editor — the Core / Secondary / Intent / Delivery /
// Reach / Duration picker plus the live formula. Shared by the player-facing
// crafter and the admin/library spellbook pre-load manager.
// ---------------------------------------------------------------------------
export function V3CompositionEditor({
  value: comp,
  onChange,
  eligibility,
}: {
  value: V3SpellComposition;
  onChange: (next: V3SpellComposition) => void;
  // AA V3 element gating. When provided, elements whose `usable` is false are
  // locked (un-selectable) with their requirements surfaced. When undefined
  // (e.g. the admin library manager), every element is freely selectable.
  eligibility?: Record<string, V3ElementEligibility>;
}) {
  const setComp = (updater: (c: V3SpellComposition) => V3SpellComposition) => onChange(updater(comp));

  // Mobile tap-to-reveal: which locked core element's requirements are shown.
  const [revealedLocked, setRevealedLocked] = useState<string | null>(null);

  const isUsable = (key: string) => !eligibility || eligibility[key]?.usable !== false;
  const firstUsableElement = () => V3_ELEMENTS.find((el) => isUsable(el.key))?.key ?? V3_ELEMENTS[0].key;

  const setCore = (key: string) => {
    if (!isUsable(key)) return;
    setComp((c) => ({ ...c, core: c.core === key ? "" : key }));
  };

  const addSecondary = () =>
    setComp((c) => ({
      ...c,
      secondaries: [...c.secondaries, { element: firstUsableElement(), role: V3_SECONDARY_ROLES[0].key }],
    }));

  const updateSecondary = (i: number, patch: Partial<{ element: string; role: string }>) =>
    setComp((c) => ({
      ...c,
      secondaries: c.secondaries.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));

  const removeSecondary = (i: number) =>
    setComp((c) => ({ ...c, secondaries: c.secondaries.filter((_, idx) => idx !== i) }));

  const moveSecondary = (i: number, dir: -1 | 1) =>
    setComp((c) => {
      const j = i + dir;
      if (j < 0 || j >= c.secondaries.length) return c;
      const secondaries = [...c.secondaries];
      [secondaries[i], secondaries[j]] = [secondaries[j], secondaries[i]];
      return { ...c, secondaries };
    });

  return (
    <div className="space-y-4">
      {/* Core element */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-amber-400 flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Core Element <span className="text-stone-500 normal-case">(required)</span>
        </Label>
        <TooltipProvider>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {V3_ELEMENTS.map((el) => {
              const selected = comp.core === el.key;
              const locked = !isUsable(el.key);
              const revealed = revealedLocked === el.key;
              // Locked elements are NOT wrapped in a Radix Tooltip: on touch
              // devices the tooltip's pointer handling can swallow the first tap,
              // so the reveal never fired. A plain button guarantees the tap
              // toggles the inline requirements banner on every device. Unlocked
              // elements keep the hover tooltip with the element description.
              if (locked) {
                return (
                  <button
                    key={el.key}
                    type="button"
                    onClick={() => setRevealedLocked((cur) => (cur === el.key ? null : el.key))}
                    aria-disabled
                    aria-expanded={revealed}
                    title="Locked — tap to see how to unlock"
                    className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors flex items-center justify-center gap-1 cursor-help ${
                      revealed
                        ? "bg-amber-500/10 border-amber-500/50 text-amber-300"
                        : "bg-stone-900/60 border-stone-800 text-stone-500 hover:border-stone-600"
                    }`}
                    data-testid={`button-core-${el.key}`}
                  >
                    <Lock className="h-3 w-3 shrink-0" />
                    {el.name}
                  </button>
                );
              }
              return (
                <Tooltip key={el.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setCore(el.key)}
                      className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
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
        {/* Mobile/tap reveal — Tooltips are hover-only, so surface the tapped
            locked element's requirements inline as well. */}
        {revealedLocked && !isUsable(revealedLocked) && eligibility?.[revealedLocked]?.requirementSummary && (
          <div
            className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 flex items-start gap-1.5"
            data-testid={`text-core-locked-reveal-${revealedLocked}`}
          >
            <Lock className="h-3 w-3 shrink-0 mt-0.5 text-amber-400" />
            <p className="text-xs text-amber-200 leading-snug">
              <span className="font-semibold">{V3_ELEMENT_MAP[revealedLocked]?.name ?? revealedLocked} is locked.</span>{" "}
              {eligibility[revealedLocked].requirementSummary}
            </p>
          </div>
        )}
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
            const roleDesc = V3_ROLE_MAP[s.role]?.description;
            return (
              <div key={i} className="flex gap-1.5" data-testid={`row-secondary-${i}`}>
                <span className="w-1.5 self-stretch rounded" style={{ backgroundColor: roleColor }} />
                <div className="flex flex-col">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-4 w-5 text-stone-400 hover:text-amber-400 disabled:opacity-30"
                    onClick={() => moveSecondary(i, -1)}
                    disabled={i === 0}
                    data-testid={`button-move-secondary-up-${i}`}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-4 w-5 text-stone-400 hover:text-amber-400 disabled:opacity-30"
                    onClick={() => moveSecondary(i, 1)}
                    disabled={i === comp.secondaries.length - 1}
                    data-testid={`button-move-secondary-down-${i}`}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Select value={s.element} onValueChange={(v) => updateSecondary(i, { element: v })}>
                      <SelectTrigger className="h-8 text-xs flex-1" data-testid={`select-secondary-element-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {V3_ELEMENTS.map((el) => {
                          const locked = !isUsable(el.key);
                          const summary = eligibility?.[el.key]?.requirementSummary ?? "";
                          return (
                            <SelectItem key={el.key} value={el.key} disabled={locked} className="text-xs">
                              <span className="flex items-center gap-1">
                                {locked && <Lock className="h-3 w-3 shrink-0" />}
                                {el.name}
                                {locked && summary && (
                                  <span className="ml-1 text-[10px] text-amber-400/80">{summary}</span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
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
                  {roleDesc && (
                    <p className="text-[11px] leading-snug text-stone-500" data-testid={`text-secondary-role-description-${i}`}>
                      {roleDesc}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Intent / Delivery / Reach / Duration */}
      <div className="grid grid-cols-2 gap-2">
        <V3SelectField label="Intent" value={comp.intent} options={V3_INTENTS} onChange={(v) => setComp((c) => ({ ...c, intent: v }))} testid="select-intent" placeholder="Choose…" />
        <V3SelectField label="Delivery" value={comp.delivery} options={V3_DELIVERIES} onChange={(v) => setComp((c) => ({ ...c, delivery: v, aoeRange: v3IsAoeDelivery(v) ? c.aoeRange : "" }))} testid="select-delivery" placeholder="Choose…" showDescription />
        {v3IsAoeDelivery(comp.delivery) && (
          <V3SelectField label="AOE Range" value={comp.aoeRange || ""} options={V3_AOE_RANGES} onChange={(v) => setComp((c) => ({ ...c, aoeRange: v }))} testid="select-aoe-range" placeholder="Choose…" showDescription />
        )}
        <V3SelectField label="Reach" value={comp.reach} options={V3_REACHES} onChange={(v) => setComp((c) => ({ ...c, reach: v }))} testid="select-reach" showDescription />
        <V3SelectField label="Duration" value={comp.duration} options={V3_DURATIONS} onChange={(v) => setComp((c) => ({ ...c, duration: v }))} testid="select-duration" showDescription />
      </div>

      {/* Live formula */}
      <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-3 space-y-2">
        <Label className="text-[10px] uppercase tracking-wide text-stone-500">Formula</Label>
        <FormulaDisplay comp={comp} />
      </div>
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
  // When true, the target spellbook is at capacity — crafting is blocked.
  atCapacity?: boolean;
  // Spells currently used in the target spellbook (for the "x of y" readout).
  spellsUsed?: number;
  // Spellbook capacity (0/undefined = unlimited).
  maxSpells?: number;
}

const DEFAULT_COMP: V3SpellComposition = {
  core: "",
  secondaries: [],
  intent: "",
  delivery: "",
  reach: "self",
  duration: "instant",
};

export function V3SpellCrafter({ character, onCrafted, spellbookItemId, atCapacity = false, spellsUsed, maxSpells }: V3SpellCrafterProps) {
  const { toast } = useToast();
  const [comp, setComp] = useState<V3SpellComposition>(DEFAULT_COMP);
  const [crafting, setCrafting] = useState(false);

  // Element craft requirements (AA V3) — gate which elements this character may
  // use, based on admin-configured OR'd conditions vs. the character's Knowledge
  // (custom skills) and inventory.
  const { data: elementRequirements } = useQuery({
    queryKey: ["v3-element-requirements"],
    queryFn: () => api.getV3ElementRequirements(),
  });
  const { data: customSkills } = useQuery({
    queryKey: ["character-custom-skills", character.id],
    queryFn: () => api.getCharacterCustomSkills(character.id),
  });
  const { data: inventory } = useQuery({
    queryKey: ["character-items", character.id],
    queryFn: () => api.getItems(character.id),
  });

  const eligibility = useMemo<Record<string, V3ElementEligibility>>(() => {
    const byElement: Record<string, V3ElementCondition[]> = {};
    for (const r of elementRequirements ?? []) {
      (byElement[r.element] ||= []).push({
        conditionType: r.conditionType,
        knowledgeName: r.knowledgeName,
        itemId: r.itemId,
        itemName: r.itemName,
        consumed: r.consumed,
      });
    }
    const input = {
      knowledgeNames: (customSkills ?? []).map((s: any) => s.name).filter(Boolean),
      items: (inventory ?? []).map((it: any) => ({ templateItemId: it.templateItemId, name: it.name })),
    };
    const map: Record<string, V3ElementEligibility> = {};
    for (const el of V3_ELEMENTS) {
      map[el.key] = evaluateV3ElementEligibility(byElement[el.key], input);
    }
    return map;
  }, [elementRequirements, customSkills, inventory]);

  const manaCost = useMemo(() => v3ManaCost(comp), [comp]);
  const craftDc = useMemo(() => v3CraftDc(comp), [comp]);
  const elementCount = useMemo(() => v3ElementCount(comp), [comp]);
  const usedElementKeys = useMemo(
    () => [comp.core, ...comp.secondaries.map((s) => s.element)].filter(Boolean),
    [comp],
  );
  const lockedUsed = useMemo(
    () => usedElementKeys.filter((k) => eligibility[k]?.usable === false),
    [usedElementKeys, eligibility],
  );
  const valid = useMemo(
    () => isValidV3Composition(comp) && !!comp.core && !!comp.intent && !!comp.delivery && lockedUsed.length === 0,
    [comp, lockedUsed],
  );

  const currentMana = character.mana ?? 0;
  const currentTokens = character.spellCreationTokens ?? 0;
  const notEnoughMana = currentMana < manaCost;
  const noTokens = currentTokens < 1;
  const hasCapacity = (maxSpells ?? 0) > 0;

  const handleCraft = async () => {
    if (!valid || crafting || atCapacity) return;
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
      <V3CompositionEditor value={comp} onChange={setComp} eligibility={eligibility} />

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
          disabled={!valid || crafting || notEnoughMana || noTokens || atCapacity}
          className="bg-amber-600 hover:bg-amber-700 text-stone-950"
          data-testid="button-craft-spell"
        >
          {crafting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
          {atCapacity ? "Spellbook full" : `Craft (${elementCount} element${elementCount === 1 ? "" : "s"})`}
        </Button>
      </div>
      {hasCapacity && (
        <p
          className={`text-xs ${atCapacity ? "text-red-400" : "text-stone-400"}`}
          data-testid="text-crafter-capacity"
        >
          {atCapacity
            ? `Spellbook full — ${spellsUsed ?? maxSpells} of ${maxSpells} spells used. Remove a spell to craft a new one.`
            : `${spellsUsed ?? 0} of ${maxSpells} spells used.`}
        </p>
      )}
      {!atCapacity && lockedUsed.length > 0 && (
        <p className="text-xs text-red-400" data-testid="text-crafter-locked-element">
          You haven't unlocked {lockedUsed.map((k) => V3_ELEMENT_MAP[k]?.name ?? k).join(", ")}. Remove or replace to craft.
        </p>
      )}
      {!atCapacity && notEnoughMana && <p className="text-xs text-red-400">Not enough mana to craft this spell.</p>}
      {!atCapacity && !notEnoughMana && noTokens && <p className="text-xs text-red-400">No spell creation tokens left. Take a long rest to refill.</p>}
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
  showDescription,
}: {
  label: string;
  value: string;
  options: { key: string; name: string; description: string }[];
  onChange: (v: string) => void;
  testid: string;
  placeholder?: string;
  showDescription?: boolean;
}) {
  const selected = options.find((o) => o.key === value);
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
      {showDescription && selected?.description && (
        <p className="text-[11px] leading-snug text-stone-500" data-testid={`${testid}-description`}>
          {selected.description}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Non-blocking notifier: GMs get a dismissible toast and a live pending-count
// (surfaced as a badge on the Crafted Spells button). Authoring happens in the
// Crafted Spells manager, never via an auto-opening pop-up.
export function V3SpellAuthoringListener({
  campaignId,
  isGM,
  onPendingCountChange,
}: {
  campaignId: string;
  isGM: boolean;
  onPendingCountChange?: (count: number) => void;
}) {
  const { toast } = useToast();

  const refresh = useCallback(() => {
    if (!isGM || !campaignId) {
      onPendingCountChange?.(0);
      return;
    }
    api
      .getV3SpellRequests(campaignId)
      .then((rows) => onPendingCountChange?.(rows.length))
      .catch(() => {});
  }, [campaignId, isGM, onPendingCountChange]);

  // Load the current pending count on mount (e.g. GM joined after the craft).
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for real-time craft requests + authoring to keep the badge accurate.
  useEffect(() => {
    if (!isGM) return;
    const unsubscribe = gameWs.onMessage((data: any) => {
      if (data?.type === "v3_spell_request" && data.spell) {
        toast({
          title: "New spell crafted",
          description: `${data.characterName || "A player"} crafted a new spell. Open Crafted Spells to author it.`,
        });
        refresh();
      } else if (data?.type === "v3_spell_authored") {
        refresh();
      }
    });
    return () => {
      unsubscribe();
    };
  }, [isGM, refresh, toast]);

  return null;
}

// Live-sync for ALL AA V3 users (players included): when a spell is crafted or
// authored, refresh the spellbook + hotbar spell queries so any open panel or
// detail dialog updates in place with no manual refresh.
export function V3SpellLiveSync({ campaignId: _campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unsubscribe = gameWs.onMessage((data: any) => {
      if (data?.type === "v3_spell_authored" || data?.type === "v3_spell_request") {
        queryClient.invalidateQueries({ queryKey: ["spellbook-spells"] });
        queryClient.invalidateQueries({ queryKey: ["v3-character-spells"] });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [queryClient]);
  return null;
}

// ---------------------------------------------------------------------------
// GM crafted-spell manager — lets a GM review every crafted spell already in
// their campaign and re-edit the name / description / image after the fact.
// Canonical/approved spells are admin-governed and shown read-only here.
// ---------------------------------------------------------------------------
const V3_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  awaiting_gm: { label: "Awaiting GM", className: "bg-amber-900/40 text-amber-300 border border-amber-700" },
  ready: { label: "Ready", className: "bg-blue-900/40 text-blue-300 border border-blue-700" },
  approved: { label: "Approved", className: "bg-emerald-900/40 text-emerald-300 border border-emerald-700" },
  rejected: { label: "Rejected", className: "bg-red-900/40 text-red-300 border border-red-700" },
};

export function V3GmSpellManager({
  campaignId,
  isGM,
  open,
  onClose,
}: {
  campaignId: string;
  isGM: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [spells, setSpells] = useState<V3Spell[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<V3Spell | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(() => {
    if (!campaignId || !isGM) return;
    setLoading(true);
    api
      .getCampaignV3Spells(campaignId)
      .then(setSpells)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaignId, isGM]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  // Keep the list fresh while open as players craft / GMs author spells.
  useEffect(() => {
    if (!open || !isGM) return;
    const unsubscribe = gameWs.onMessage((data: any) => {
      if (data?.type === "v3_spell_authored" || data?.type === "v3_spell_request") {
        reload();
      }
    });
    return () => {
      unsubscribe();
    };
  }, [open, isGM, reload]);

  const openEditor = (spell: V3Spell) => {
    setEditing(spell);
    setName(spell.name || "");
    setDescription(spell.description || "");
    setImage(spell.image || null);
  };

  const isLocked = (spell: V3Spell) => spell.isCanonical || spell.status === "approved";

  const handleSave = async () => {
    if (!editing || !name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.authorV3Spell(editing.id, { name: name.trim(), description, image });
      toast({ title: "Spell updated", description: `"${name.trim()}" was saved.` });
      setEditing(null);
      reload();
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

  if (!isGM) return null;

  const renderSpellRow = (spell: V3Spell) => {
    const locked = isLocked(spell);
    const badge = V3_STATUS_BADGE[spell.status];
    const isPending = spell.status === "awaiting_gm";
    return (
      <div
        key={spell.id}
        className="rounded-lg border border-stone-700 bg-stone-900/60 p-3"
        data-testid={`spell-manager-row-${spell.id}`}
      >
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 rounded-lg border border-stone-700 bg-stone-800 overflow-hidden flex items-center justify-center">
            {spell.image ? (
              <img src={spell.image} alt={spell.name} className="h-full w-full object-cover" />
            ) : (
              <Sparkles className="h-5 w-5 text-purple-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-stone-100 truncate" data-testid={`text-spell-name-${spell.id}`}>
                {spell.name || <span className="italic text-stone-500">Unnamed spell</span>}
              </h4>
              {badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.className}`}>{badge.label}</span>
              )}
              {spell.isCanonical && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-700">Canonical</span>
              )}
              {spell.flagged && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-300 border border-orange-700" data-testid={`badge-flagged-${spell.id}`}>Flagged</span>
              )}
            </div>
            {spell.createdByCharacterName && (
              <p className="text-[10px] text-stone-400 mt-0.5" data-testid={`text-spell-requester-${spell.id}`}>
                Crafted by {spell.createdByCharacterName}
              </p>
            )}
            {spell.composition && <div className="mt-1.5"><FormulaDisplay comp={spell.composition} /></div>}
            {spell.description && (
              <p className="text-xs text-stone-400 mt-1 line-clamp-2">{spell.description}</p>
            )}
            <p className="text-[10px] text-stone-500 mt-1">{spell.manaCost} mana · DC {spell.craftDc}</p>
          </div>
          <Button
            size="sm"
            variant={isPending ? "default" : "outline"}
            className={`h-7 text-xs shrink-0 ${isPending ? "bg-amber-600 hover:bg-amber-700 text-stone-950" : ""}`}
            disabled={locked}
            title={locked ? "Canonical spells can only be edited by an admin" : undefined}
            onClick={() => openEditor(spell)}
            data-testid={`button-edit-spell-${spell.id}`}
          >
            {isPending ? "Author" : "Edit"}
          </Button>
        </div>
      </div>
    );
  };

  const pendingSpells = spells.filter((s) => s.status === "awaiting_gm");
  const otherSpells = spells.filter((s) => s.status !== "awaiting_gm");

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-v3-spell-manager">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-amber-400" />
              Crafted Spells
            </DialogTitle>
            <DialogDescription>
              Review and tweak the spells your players have crafted. Canonical spells are managed by admins.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-10 text-center text-stone-400 text-sm" data-testid="text-spell-manager-loading">
              <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
              Loading crafted spells…
            </div>
          ) : spells.length === 0 ? (
            <div className="py-10 text-center text-stone-500" data-testid="text-spell-manager-empty">
              <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No crafted spells in this campaign yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingSpells.length > 0 && (
                <div className="space-y-2">
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide text-amber-400"
                    data-testid="heading-pending-requests"
                  >
                    Pending requests ({pendingSpells.length})
                  </h3>
                  {pendingSpells.map(renderSpellRow)}
                </div>
              )}
              {otherSpells.length > 0 && (
                <div className="space-y-2">
                  {pendingSpells.length > 0 && (
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                      All crafted spells
                    </h3>
                  )}
                  {otherSpells.map(renderSpellRow)}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit form */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-edit-crafted-spell">
          <DialogHeader>
            <DialogTitle>Edit Crafted Spell</DialogTitle>
            <DialogDescription>Update this spell's name, description, and profile image.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              {editing.composition && (
                <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-2">
                  <FormulaDisplay comp={editing.composition} />
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowImageBrowser(true)}
                  className="h-20 w-20 shrink-0 rounded-lg border border-stone-700 bg-stone-900 overflow-hidden flex items-center justify-center hover:border-amber-500 transition-colors"
                  data-testid="button-edit-spell-image"
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
                    data-testid="input-edit-spell-name"
                  />
                  <p className="text-[10px] text-stone-500">Click the box to set a profile image.</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-stone-400">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  data-testid="input-edit-spell-description"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || submitting}
              className="bg-amber-600 hover:bg-amber-700 text-stone-950"
              data-testid="button-save-crafted-spell"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save Changes
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
