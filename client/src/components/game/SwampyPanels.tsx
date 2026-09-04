import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SwampyWarren, type SwampyWorking, type SwampyReading } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Dices, BookOpen, Sparkles, ShieldAlert, Heart, Flame } from "lucide-react";
import {
  SWAMPY_TRAITS,
  SWAMPY_WARREN_CONDITIONS,
  SWAMPY_STATUS_CHECKS,
  SWAMPY_DRAW_DECLARATION,
  SWAMPY_GM_RESPONSE,
  SWAMPY_OVERDRAW_COSTS,
  SWAMPY_ROUTES_FORWARD,
  SWAMPY_WORKING_FIELDS,
  SWAMPY_READING_SPREADS,
  SWAMPY_MAX_HOPE,
  SWAMPY_OUTCOME_LABELS,
  SWAMPY_OUTCOME_DESCRIPTIONS,
  swampyWarrenCondition,
  isSwampyVulnerable,
  swampyThresholdLabel,
  swampyHpCostForDamage,
  normalizeSwampyExperiences,
  makeSwampyExperience,
  type SwampyExperience,
  type SwampyDualityResult,
} from "@shared/swampy";
import { castSwampyDuality } from "@/lib/swampyRoll";

// ===========================================================================
// Shared bits
// ===========================================================================

export function SwampyConditionBadge({ condition }: { condition: string }) {
  const def = swampyWarrenCondition(condition);
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide ${def.color}`}
      title={def.effect}
      data-testid={`swampy-condition-${def.key}`}
    >
      {def.name}
    </span>
  );
}

/** A row of pips — Hope, Strain and Armour Slots are all counted, not measured. */
function PipTrack({
  value, max, onChange, filledClass, label, testId,
}: {
  value: number;
  max: number;
  onChange?: (next: number) => void;
  filledClass: string;
  label: string;
  testId: string;
}) {
  if (max <= 0) return null;
  return (
    <div className="flex items-center gap-1.5" data-testid={testId}>
      <span className="text-[10px] font-bold text-stone-400 w-14 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: max }, (_, i) => {
          const filled = i < value;
          return (
            <button
              key={i}
              type="button"
              disabled={!onChange}
              // Clicking the pip you're on clears it, so a track can be emptied
              // without clicking backwards through every pip.
              onClick={() => onChange?.(filled && i === value - 1 ? i : i + 1)}
              className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                filled ? filledClass : "bg-black/40 border-stone-700"
              } ${onChange ? "cursor-pointer hover:brightness-125" : "cursor-default"}`}
              aria-label={`${label} ${i + 1}`}
              data-testid={`${testId}-pip-${i}`}
            />
          );
        })}
      </div>
      <span className="text-[10px] text-stone-500 ml-auto shrink-0">{value}/{max}</span>
    </div>
  );
}

// ===========================================================================
// Character resources — HP behind thresholds, Armour Slots, Strain, Hope
// ===========================================================================

export function SwampyResourcesCard({
  character, canEdit, onUpdate,
}: {
  character: any;
  canEdit?: boolean;
  onUpdate?: (updates: Record<string, any>) => void;
}) {
  const hp = character?.hp ?? 0;
  const maxHp = Math.max(1, character?.maxHp ?? 1);
  const strain = character?.swampyStrain ?? 0;
  const maxStrain = Math.max(1, character?.swampyMaxStrain ?? 6);
  const hope = character?.swampyHope ?? 0;
  const armour = character?.swampyArmourSlots ?? 0;
  const maxArmour = character?.swampyMaxArmourSlots ?? 0;
  const major = character?.swampyMajorThreshold ?? 8;
  const severe = character?.swampySevereThreshold ?? 16;
  const vulnerable = isSwampyVulnerable(strain, maxStrain);
  const set = (patch: Record<string, any>) => onUpdate?.(patch);

  return (
    <Card className="bg-stone-800 border-stone-700" data-testid="swampy-resources">
      <CardContent className="pt-4 space-y-3">
        {vulnerable && (
          <div
            className="flex items-center gap-2 rounded border border-rose-800 bg-rose-950/40 px-2 py-1.5"
            data-testid="swampy-vulnerable"
          >
            <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
            <span className="text-xs text-rose-300">
              <span className="font-bold">Vulnerable.</span> Strain is full — further forced Strain becomes HP damage.
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <span className="text-[10px] font-bold text-stone-400 w-12 shrink-0">HP</span>
          <div className="flex-1 h-2 bg-black/50 rounded-full overflow-hidden">
            <div className="h-full bg-red-500" style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }} />
          </div>
          <span className="text-[10px] text-stone-400 shrink-0">{hp}/{maxHp}</span>
        </div>

        {/* Damage is compared to these, not subtracted from HP, so they belong
            next to it rather than buried in a stats tab. */}
        <div className="flex items-center gap-2 text-[10px] text-stone-400">
          <span className="font-bold text-stone-500">THRESHOLDS</span>
          {canEdit ? (
            <>
              <label className="flex items-center gap-1">
                Major
                <Input
                  type="number"
                  value={major}
                  onChange={(e) => set({ swampyMajorThreshold: Math.max(1, Number(e.target.value) || 0) })}
                  className="h-6 w-14 bg-stone-900 border-stone-600 text-xs"
                  data-testid="input-swampy-major"
                />
              </label>
              <label className="flex items-center gap-1">
                Severe
                <Input
                  type="number"
                  value={severe}
                  onChange={(e) => set({ swampySevereThreshold: Math.max(1, Number(e.target.value) || 0) })}
                  className="h-6 w-14 bg-stone-900 border-stone-600 text-xs"
                  data-testid="input-swampy-severe"
                />
              </label>
            </>
          ) : (
            <span>Major {major} · Severe {severe}</span>
          )}
        </div>

        <PipTrack
          label="Strain"
          value={strain}
          max={maxStrain}
          filledClass="bg-violet-500 border-violet-400"
          onChange={canEdit ? (n) => set({ swampyStrain: n }) : undefined}
          testId="swampy-strain"
        />
        <PipTrack
          label="Hope"
          value={hope}
          max={SWAMPY_MAX_HOPE}
          filledClass="bg-amber-400 border-amber-300"
          onChange={canEdit ? (n) => set({ swampyHope: n }) : undefined}
          testId="swampy-hope"
        />
        <PipTrack
          label="Armour"
          value={armour}
          max={maxArmour}
          filledClass="bg-sky-500 border-sky-400"
          onChange={canEdit ? (n) => set({ swampyArmourSlots: n }) : undefined}
          testId="swampy-armour"
        />

        {canEdit && (
          <div className="flex items-center gap-2 text-[10px] text-stone-400">
            <label className="flex items-center gap-1">
              Max Strain
              <Input
                type="number"
                value={maxStrain}
                onChange={(e) => set({ swampyMaxStrain: Math.max(1, Number(e.target.value) || 1) })}
                className="h-6 w-14 bg-stone-900 border-stone-600 text-xs"
                data-testid="input-swampy-max-strain"
              />
            </label>
            <label className="flex items-center gap-1">
              Armour Slots
              <Input
                type="number"
                value={maxArmour}
                onChange={(e) => set({ swampyMaxArmourSlots: Math.max(0, Number(e.target.value) || 0) })}
                className="h-6 w-14 bg-stone-900 border-stone-600 text-xs"
                data-testid="input-swampy-max-armour"
              />
            </label>
          </div>
        )}

        <SwampyDamageHelper major={major} severe={severe} armour={armour} />
      </CardContent>
    </Card>
  );
}

/**
 * Type in the damage taken and read off what it actually costs. The threshold
 * maths is the fiddliest part of a hit at the table, and getting it wrong is
 * silent — so the sheet does it rather than the players.
 */
function SwampyDamageHelper({ major, severe, armour }: { major: number; severe: number; armour: number }) {
  const [damage, setDamage] = useState("");
  const dmg = Number(damage);
  const valid = damage !== "" && Number.isFinite(dmg) && dmg > 0;
  const thresholds = { major, severe };

  return (
    <div className="flex items-center gap-2 pt-1 border-t border-stone-700">
      <span className="text-[10px] font-bold text-stone-500 shrink-0">DAMAGE TAKEN</span>
      <Input
        type="number"
        value={damage}
        onChange={(e) => setDamage(e.target.value)}
        placeholder="0"
        className="h-6 w-16 bg-stone-900 border-stone-600 text-xs"
        data-testid="input-swampy-damage"
      />
      {valid && (
        <span className="text-[10px] text-stone-300" data-testid="text-swampy-damage-result">
          {swampyThresholdLabel(dmg, thresholds)} —{" "}
          <span className="font-bold text-red-400">
            {swampyHpCostForDamage(dmg, thresholds, armour)} HP
          </span>
          {armour > 0 && <span className="text-sky-400"> (armoured)</span>}
        </span>
      )}
    </div>
  );
}

// ===========================================================================
// Overview — who they are, and everything a hit needs to resolve against
// ===========================================================================

export function SwampyOverviewTab({
  character, canEdit, onUpdate,
}: {
  character: any;
  canEdit?: boolean;
  onUpdate?: (updates: Record<string, any>) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="space-y-4" data-testid="swampy-overview-tab">
      <Card className="bg-stone-800 border-stone-700">
        <CardContent className="pt-4 flex items-start gap-3">
          <div className="w-20 h-20 rounded-md overflow-hidden bg-stone-900 border border-stone-700 shrink-0">
            {character?.portrait && !imgFailed ? (
              <img
                src={character.portrait}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-600 text-xs">
                No portrait
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="text-lg font-bold text-stone-100 truncate">{character?.name || "Unnamed"}</div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[10px] text-stone-400">
                Ancestry
                {canEdit ? (
                  <Input
                    value={character?.race ?? ""}
                    onChange={(e) => onUpdate?.({ race: e.target.value })}
                    className="h-6 bg-stone-900 border-stone-600 text-xs mt-0.5"
                    data-testid="input-swampy-race"
                  />
                ) : (
                  <div className="text-xs text-stone-200">{character?.race || "—"}</div>
                )}
              </label>
              <label className="text-[10px] text-stone-400">
                Speed
                {canEdit ? (
                  <Input
                    type="number"
                    value={character?.speed ?? 0}
                    onChange={(e) => onUpdate?.({ speed: Number(e.target.value) || 0 })}
                    className="h-6 bg-stone-900 border-stone-600 text-xs mt-0.5"
                    data-testid="input-swampy-speed"
                  />
                ) : (
                  <div className="text-xs text-stone-200">{character?.speed ?? 0}</div>
                )}
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <SwampyResourcesCard character={character} canEdit={canEdit} onUpdate={onUpdate} />
    </div>
  );
}

// ===========================================================================
// Traits & Experiences — and the Duality roll itself
// ===========================================================================

export function SwampyTraitsTab({
  character, campaignId, canEdit, onUpdate,
}: {
  character: any;
  campaignId?: string;
  canEdit?: boolean;
  onUpdate?: (updates: Record<string, any>) => void;
}) {
  const { toast } = useToast();
  const [difficulty, setDifficulty] = useState("");
  const [lastRoll, setLastRoll] = useState<SwampyDualityResult | null>(null);
  const [pendingExperience, setPendingExperience] = useState<string | null>(null);

  const experiences = useMemo(
    () => normalizeSwampyExperiences(character?.swampyExperiences),
    [character?.swampyExperiences],
  );
  const hope = character?.swampyHope ?? 0;

  const saveExperiences = (next: SwampyExperience[]) => onUpdate?.({ swampyExperiences: next });

  const roll = async (traitKey: string, traitName: string) => {
    const traitValue = Number(character?.[traitKey]) || 0;
    const experience = experiences.find((e) => e.id === pendingExperience);
    // Spending a Hope is what buys an Experience's bonus, so it can't be
    // applied on credit.
    if (experience && hope <= 0) {
      toast({ title: "No Hope to spend", description: "An Experience costs a Hope to bring in.", variant: "destructive" });
      return;
    }
    const modifier = traitValue + (experience?.modifier ?? 0);
    const diff = difficulty === "" ? null : Number(difficulty);

    const label = experience
      ? `${traitName} + ${experience.name || "Experience"}`
      : traitName;
    const result = await castSwampyDuality(
      { ...character, name: character?.name },
      label,
      modifier,
      Number.isFinite(diff as number) ? (diff as number) : null,
      { modLabel: traitName },
    );
    setLastRoll(result);

    // The Hope spent on the Experience is separate from any Hope the roll
    // itself grants; castSwampyDuality has already applied the latter.
    if (experience) {
      onUpdate?.({ swampyHope: Math.max(0, hope - 1) });
      setPendingExperience(null);
    }
    if (result.gainsFear && campaignId) {
      try {
        await api.adjustSwampyFear(campaignId, 1);
      } catch {
        // A Fear that can't be recorded shouldn't swallow the roll; the
        // outcome panel still says the GM gains one.
      }
    }
  };

  return (
    <div className="space-y-4" data-testid="swampy-traits-tab">
      <Card className="bg-stone-800 border-stone-700">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-amber-500">Duality Dice</span>
            <label className="flex items-center gap-1 text-[10px] text-stone-400">
              Difficulty
              <Input
                type="number"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                placeholder="GM set"
                className="h-6 w-20 bg-stone-900 border-stone-600 text-xs"
                data-testid="input-swampy-difficulty"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SWAMPY_TRAITS.map((trait) => {
              const value = Number(character?.[trait.key]) || 0;
              return (
                <div key={trait.key} className="rounded border border-stone-700 bg-stone-900/50 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-stone-200 truncate" title={trait.description}>
                      {trait.name}
                    </span>
                    {canEdit ? (
                      <Input
                        type="number"
                        value={value}
                        onChange={(e) => onUpdate?.({ [trait.key]: Number(e.target.value) || 0 })}
                        className="h-6 w-12 bg-stone-950 border-stone-600 text-xs text-center"
                        data-testid={`input-swampy-trait-${trait.key}`}
                      />
                    ) : (
                      <span className="text-xs font-mono text-amber-400">
                        {value >= 0 ? "+" : ""}{value}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-6 text-[10px] border-stone-600"
                    onClick={() => roll(trait.key, trait.name)}
                    data-testid={`button-swampy-roll-${trait.key}`}
                  >
                    <Dices className="h-3 w-3 mr-1" /> Roll
                  </Button>
                </div>
              );
            })}
          </div>

          {lastRoll && (
            <div
              className={`rounded border p-2 space-y-0.5 ${
                lastRoll.isCritical
                  ? "border-amber-500 bg-amber-950/30"
                  : lastRoll.gainsFear
                    ? "border-rose-800 bg-rose-950/25"
                    : "border-sky-800 bg-sky-950/25"
              }`}
              data-testid="swampy-last-roll"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-stone-100">
                  {SWAMPY_OUTCOME_LABELS[lastRoll.outcome]}
                </span>
                <span className="text-lg font-bold text-amber-400">{lastRoll.total}</span>
              </div>
              <div className="text-[10px] text-stone-400">
                Hope {lastRoll.hopeDie} · Fear {lastRoll.fearDie}
                {lastRoll.modifier !== 0 && <> · {lastRoll.modifier > 0 ? "+" : ""}{lastRoll.modifier}</>}
                {lastRoll.difficulty !== null && <> · vs {lastRoll.difficulty}</>}
              </div>
              <div className="text-[10px] text-stone-300">{SWAMPY_OUTCOME_DESCRIPTIONS[lastRoll.outcome]}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-stone-800 border-stone-700">
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-amber-500">Experiences</span>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] border-stone-600"
                onClick={() => saveExperiences([...experiences, makeSwampyExperience()])}
                data-testid="button-swampy-add-experience"
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            )}
          </div>
          <p className="text-[10px] text-stone-500">
            Spend a Hope to bring one into a roll it plausibly applies to. Select one, then roll a trait.
          </p>
          {experiences.length === 0 ? (
            <div className="text-xs text-stone-500">No Experiences yet.</div>
          ) : (
            experiences.map((exp) => {
              const selected = pendingExperience === exp.id;
              return (
                <div key={exp.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPendingExperience(selected ? null : exp.id)}
                    className={`shrink-0 h-6 px-2 rounded text-[10px] border transition-colors ${
                      selected
                        ? "border-amber-500 bg-amber-950/50 text-amber-300"
                        : "border-stone-600 text-stone-400 hover:text-stone-200"
                    }`}
                    data-testid={`button-swampy-use-experience-${exp.id}`}
                  >
                    {selected ? "Using" : "Use"}
                  </button>
                  {canEdit ? (
                    <>
                      <Input
                        value={exp.name}
                        onChange={(e) => saveExperiences(experiences.map((x) => x.id === exp.id ? { ...x, name: e.target.value } : x))}
                        placeholder="Grew up on the docks"
                        className="h-6 flex-1 bg-stone-900 border-stone-600 text-xs"
                        data-testid={`input-swampy-experience-${exp.id}`}
                      />
                      <Input
                        type="number"
                        value={exp.modifier}
                        onChange={(e) => saveExperiences(experiences.map((x) => x.id === exp.id ? { ...x, modifier: Number(e.target.value) || 0 } : x))}
                        className="h-6 w-14 bg-stone-900 border-stone-600 text-xs text-center"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-stone-500 hover:text-red-400"
                        onClick={() => saveExperiences(experiences.filter((x) => x.id !== exp.id))}
                        data-testid={`button-swampy-remove-experience-${exp.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-stone-300 flex-1">
                      {exp.name || "Unnamed"}{" "}
                      <span className="text-amber-400 font-mono">
                        {exp.modifier >= 0 ? "+" : ""}{exp.modifier}
                      </span>
                    </span>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Drawing — the Warrens a character can reach, and the rules for using them
// ===========================================================================

export function SwampyDrawingTab({
  character, campaignId, isGm, canEdit, onUpdate,
}: {
  character: any;
  campaignId?: string;
  isGm?: boolean;
  canEdit?: boolean;
  onUpdate?: (updates: Record<string, any>) => void;
}) {
  const { data: warrens = [] } = useQuery<SwampyWarren[]>({
    queryKey: ["swampy-warrens", campaignId],
    queryFn: () => api.getSwampyWarrens({ campaignId }),
    enabled: !!campaignId,
  });

  const reachable: string[] = Array.isArray(character?.swampyWarrenIds) ? character.swampyWarrenIds : [];
  const mine = warrens.filter((w) => reachable.includes(w.id));

  return (
    <div className="space-y-4" data-testid="swampy-drawing-tab">
      <Card className="bg-stone-800 border-stone-700">
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold text-amber-500">Warrens you can reach</span>
          </div>
          {mine.length === 0 ? (
            <div className="text-xs text-stone-500">
              None yet. Access is the first of the four checks — without a Warren you can open, there is nothing to Draw from.
            </div>
          ) : (
            mine.map((w) => (
              <div key={w.id} className="rounded border border-stone-700 bg-stone-900/50 p-2 space-y-1" data-testid={`swampy-warren-${w.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-100">{w.name}</span>
                  <SwampyConditionBadge condition={w.condition} />
                </div>
                {w.nature && <div className="text-[10px] text-stone-400">{w.nature}</div>}
                <div className="text-[10px] text-stone-500 italic">
                  {swampyWarrenCondition(w.condition).effect}
                </div>
              </div>
            ))
          )}

          {/* Which Warrens a character can reach is the GM's call, so the
              picker only appears for them. */}
          {isGm && canEdit && warrens.length > 0 && (
            <div className="pt-2 border-t border-stone-700 space-y-1">
              <Label className="text-[10px] text-stone-400">Grant access</Label>
              <div className="flex flex-wrap gap-1">
                {warrens.map((w) => {
                  const has = reachable.includes(w.id);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onUpdate?.({
                        swampyWarrenIds: has ? reachable.filter((id) => id !== w.id) : [...reachable, w.id],
                      })}
                      className={`h-6 px-2 rounded text-[10px] border transition-colors ${
                        has ? "border-amber-500 bg-amber-950/40 text-amber-300" : "border-stone-600 text-stone-400"
                      }`}
                      data-testid={`button-swampy-grant-${w.id}`}
                    >
                      {w.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SwampyDrawingReference />
    </div>
  );
}

/**
 * The Drawing procedure, on the sheet rather than in a rulebook nobody opens
 * mid-session. "Players always know the likely cost and main risk before
 * committing" only holds if the questions are in front of both sides.
 */
export function SwampyDrawingReference() {
  return (
    <Card className="bg-stone-800 border-stone-700">
      <CardContent className="pt-4 space-y-3 text-[11px]">
        <div>
          <div className="text-xs font-bold text-amber-500 mb-1">You state</div>
          <ul className="space-y-0.5">
            {SWAMPY_DRAW_DECLARATION.map((d) => (
              <li key={d.key} className="text-stone-300">
                <span className="font-bold text-stone-100">{d.name}:</span> {d.description}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold text-amber-500 mb-1">The GM states, before you commit</div>
          <ul className="space-y-0.5">
            {SWAMPY_GM_RESPONSE.map((d) => (
              <li key={d.key} className="text-stone-300">
                <span className="font-bold text-stone-100">{d.name}:</span> {d.description}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold text-amber-500 mb-1">Four checks on every Status</div>
          <ul className="space-y-0.5">
            {SWAMPY_STATUS_CHECKS.map((c) => (
              <li key={c.key} className="text-stone-300">
                <span className="font-bold text-stone-100">{c.name}:</span> {c.description}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold text-stone-400 mb-1">If it can't happen yet</div>
          <div className="text-stone-400">{SWAMPY_ROUTES_FORWARD.join(" · ")}</div>
        </div>
        <div>
          <div className="text-xs font-bold text-rose-400 mb-1 flex items-center gap-1">
            <Flame className="h-3 w-3" /> Overdrawing at full Strain costs one of
          </div>
          <div className="text-stone-400">{SWAMPY_OVERDRAW_COSTS.join(" · ")}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// The Working Ledger
// ===========================================================================

const EMPTY_WORKING = {
  name: "", warrenId: "", method: "", effect: "",
  cost: "", limits: "", conditionInteraction: "", risk: "",
};

export function SwampyLedgerPanel({ campaignId, isGm }: { campaignId: string; isGm?: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<SwampyWorking | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({ ...EMPTY_WORKING });
  const [open, setOpen] = useState(false);

  const { data: workings = [], isLoading } = useQuery<SwampyWorking[]>({
    queryKey: ["swampy-workings", campaignId],
    queryFn: () => api.getSwampyWorkings(campaignId),
    enabled: !!campaignId,
  });
  const { data: warrens = [] } = useQuery<SwampyWarren[]>({
    queryKey: ["swampy-warrens", campaignId],
    queryFn: () => api.getSwampyWarrens({ campaignId }),
    enabled: !!campaignId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["swampy-workings", campaignId] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { ...draft, warrenId: draft.warrenId || null };
      return editing
        ? api.updateSwampyWorking(editing.id, payload)
        : api.createSwampyWorking(campaignId, payload);
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setEditing(null);
      setDraft({ ...EMPTY_WORKING });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSwampyWorking(id),
    onSuccess: invalidate,
    onError: (e: any) => toast({ title: "Couldn't delete", description: e?.message, variant: "destructive" }),
  });

  const startNew = () => { setEditing(null); setDraft({ ...EMPTY_WORKING }); setOpen(true); };
  const startEdit = (w: SwampyWorking) => {
    setEditing(w);
    setDraft({
      name: w.name, warrenId: w.warrenId || "", method: w.method, effect: w.effect,
      cost: w.cost, limits: w.limits, conditionInteraction: w.conditionInteraction, risk: w.risk,
    });
    setOpen(true);
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-stone-900" data-testid="swampy-ledger">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-stone-700 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-bold text-amber-500">Working Ledger</span>
        </div>
        {isGm && (
          <Button size="sm" className="h-7 text-xs" onClick={startNew} data-testid="button-swampy-add-working">
            <Plus className="h-3 w-3 mr-1" /> Record
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        <p className="text-[10px] text-stone-500">
          Precedents set in play, not a spell list. Anyone can rely on these; they can also be learned, copied,
          countered, altered, or improved.
        </p>
        {isLoading ? (
          <div className="text-xs text-stone-500">Loading…</div>
        ) : workings.length === 0 ? (
          <div className="text-xs text-stone-500">Nothing recorded yet.</div>
        ) : (
          workings.map((w) => {
            const warren = warrens.find((x) => x.id === w.warrenId);
            return (
              <Card key={w.id} className="bg-stone-800 border-stone-700" data-testid={`swampy-working-${w.id}`}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-stone-100 truncate">{w.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-stone-400">{w.warrenName || "No Warren"}</span>
                        {warren && <SwampyConditionBadge condition={warren.condition} />}
                      </div>
                    </div>
                    {isGm && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => startEdit(w)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-stone-500 hover:text-red-400"
                          onClick={() => deleteMutation.mutate(w.id)}
                          data-testid={`button-swampy-delete-working-${w.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <dl className="grid grid-cols-1 gap-0.5 text-[10px]">
                    {([
                      ["Method", w.method], ["Effect", w.effect], ["Cost", w.cost], ["Limits", w.limits],
                      ["Condition", w.conditionInteraction], ["Risk", w.risk],
                    ] as const).filter(([, v]) => !!v).map(([k, v]) => (
                      <div key={k}>
                        <dt className="inline font-bold text-stone-400">{k}: </dt>
                        <dd className="inline text-stone-300">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {w.characterName && (
                    <div className="text-[10px] text-stone-600">Established by {w.characterName}</div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-500">
              {editing ? "Edit Working" : "Record a Working"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {SWAMPY_WORKING_FIELDS.map((field) => {
              if (field.key === "warrenName") {
                return (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs text-stone-400">Warren</Label>
                    <Select
                      value={draft.warrenId || "_none"}
                      onValueChange={(v) => setDraft({ ...draft, warrenId: v === "_none" ? "" : v })}
                    >
                      <SelectTrigger className="bg-stone-800 border-stone-600 h-8 text-xs" data-testid="select-swampy-working-warren">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {warrens.map((w) => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              const isName = field.key === "name";
              return (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs text-stone-400">{field.name}</Label>
                  {isName ? (
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder={field.hint}
                      className="bg-stone-800 border-stone-600 h-8 text-xs"
                      data-testid="input-swampy-working-name"
                    />
                  ) : (
                    <Textarea
                      value={draft[field.key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                      placeholder={field.hint}
                      className="bg-stone-800 border-stone-600 text-xs min-h-[48px]"
                      data-testid={`input-swampy-working-${field.key}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!draft.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              data-testid="button-swampy-save-working"
            >
              {editing ? "Save" : "Record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===========================================================================
// Deck of Houses
// ===========================================================================

export function SwampyDeckPanel({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [spread, setSpread] = useState<string>("three");
  const [reading, setReading] = useState<SwampyReading | null>(null);

  const drawMutation = useMutation({
    mutationFn: () => api.drawSwampyReading(campaignId, spread),
    onSuccess: (r) => setReading(r),
    onError: (e: any) => toast({ title: "Couldn't draw", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="h-full flex flex-col min-h-0 bg-stone-900" data-testid="swampy-deck">
      <div className="flex items-center gap-2 p-3 border-b border-stone-700 shrink-0">
        <span className="text-sm font-bold text-amber-500 flex-1">Deck of Houses</span>
        <Select value={spread} onValueChange={setSpread}>
          <SelectTrigger className="h-7 w-36 bg-stone-800 border-stone-600 text-xs" data-testid="select-swampy-spread">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SWAMPY_READING_SPREADS.map((s) => (
              <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={drawMutation.isPending}
          onClick={() => drawMutation.mutate()}
          data-testid="button-swampy-draw"
        >
          Draw
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        <p className="text-[10px] text-stone-500">
          A reading does not set the future. It reveals movement and pressure — and can make you visible to
          powerful forces interested in the role you are beginning to fulfil.
        </p>
        {!reading ? (
          <div className="text-xs text-stone-500">No reading drawn.</div>
        ) : (
          reading.cards.map((c, i) => (
            <Card key={`${c.cardId}-${i}`} className="bg-stone-800 border-stone-700" data-testid={`swampy-card-${i}`}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-stone-500">{c.position}</span>
                  <Badge
                    variant="outline"
                    className={c.orientation === "upright" ? "border-emerald-700 text-emerald-400" : "border-rose-800 text-rose-400"}
                  >
                    {c.orientation}
                  </Badge>
                </div>
                <div className="text-sm font-bold text-stone-100">{c.name}</div>
                {c.house && <div className="text-[10px] text-amber-500">{c.house}</div>}
                {c.meaning && <div className="text-xs text-stone-300">{c.meaning}</div>}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Fear — the GM's half of the Duality Dice
// ===========================================================================

export function SwampyFearTrack({
  campaignId, fear, isGm,
}: {
  campaignId: string;
  fear: number;
  isGm?: boolean;
}) {
  const { toast } = useToast();
  const adjust = useMutation({
    mutationFn: (delta: number) => api.adjustSwampyFear(campaignId, delta),
    onError: (e: any) => toast({ title: "Couldn't change Fear", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-center gap-1.5" data-testid="swampy-fear-track">
      <Flame className="h-3.5 w-3.5 text-rose-500 shrink-0" />
      <span className="text-[10px] font-bold text-stone-400">Fear</span>
      <span className="text-sm font-bold text-rose-400 font-mono" data-testid="text-swampy-fear">{fear}</span>
      {isGm && (
        <div className="flex gap-0.5">
          <Button
            size="sm" variant="ghost"
            className="h-5 w-5 p-0 text-stone-500 hover:text-rose-400"
            onClick={() => adjust.mutate(-1)}
            disabled={fear <= 0}
            data-testid="button-swampy-fear-down"
          >
            −
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-5 w-5 p-0 text-stone-500 hover:text-rose-400"
            onClick={() => adjust.mutate(1)}
            data-testid="button-swampy-fear-up"
          >
            +
          </Button>
        </div>
      )}
    </div>
  );
}
