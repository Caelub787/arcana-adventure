import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type V3Spell } from "@/lib/api";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { useToast } from "@/hooks/use-toast";
import { V3SpellCrafter } from "./V3SpellCrafter";
import { castV3Spell, v3ReachExtraMana, type V3CastCharacter } from "@/lib/v3cast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  V3_INTENT_MAP,
  V3_DELIVERY_MAP,
  V3_ELEMENT_MAP,
  V3_REACH_MAP,
  V3_REACHES,
  V3_DURATION_MAP,
  V3_ROLE_MAP,
  v3LevelDiceNotation,
  v3LevelExtraMana,
} from "@shared/v3spells";
import { v3ExhaustionCostMultiplier } from "@shared/v3";
import { BookOpen, Sparkles, Trash2, Wand2, Clock, Minus, Plus, Dices, Info, Package } from "lucide-react";

interface SpellbookCharacter {
  id: string;
  name?: string;
  mana?: number | null;
  anemos?: number | null;
  spellCreationTokens?: number | null;
}

interface SpellbookPanelProps {
  open: boolean;
  onClose: () => void;
  item: any;
  character: SpellbookCharacter;
  canEdit?: boolean;
  bringToFront?: (panelKey: string) => void;
  floatingZIndices?: Record<string, number>;
  charPanelSuffix?: string;
  onSpellCast?: () => void;
  defaultPosition?: { x: number; y: number };
  runesSection?: React.ReactNode;
}

// One-line description of a crafted spell's composition (core + intent + delivery).
export function v3SpellSummary(spell: V3Spell): string {
  const comp = spell.composition;
  if (!comp) return "";
  const parts: string[] = [];
  if (comp.core) parts.push(V3_ELEMENT_MAP[comp.core]?.name ?? comp.core);
  if (comp.intent) parts.push(V3_INTENT_MAP[comp.intent]?.name ?? comp.intent);
  if (comp.delivery) parts.push(V3_DELIVERY_MAP[comp.delivery]?.name ?? comp.delivery);
  return parts.join(" · ");
}

// Read-only detail dialog for a crafted V3 spell (used by spellbook + hotbar slots).
export function V3SpellDetailDialog({
  open,
  onOpenChange,
  spell,
  castCharacter,
  onCast,
  bringToFront,
  floatingZIndices,
  panelKey: panelKeyProp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spell: V3Spell | null;
  castCharacter?: V3CastCharacter;
  onCast?: () => void;
  bringToFront?: (key: string) => void;
  floatingZIndices?: Record<string, number>;
  panelKey?: string;
}) {
  const [level, setLevel] = useState(1);
  const [reach, setReach] = useState<string>(spell?.composition?.reach || "");
  const panelKey = panelKeyProp ?? "v3-spell-detail";

  useEffect(() => {
    if (open && spell) {
      bringToFront?.(panelKey);
    }
  }, [open, spell?.id, panelKey]);

  if (!open || !spell) return null;
  const comp = spell.composition;
  const awaiting = spell.status === "awaiting_gm";
  const lv = Math.max(1, Math.floor(level || 1));
  const diceLabel = v3LevelDiceNotation(lv);
  const extraMana = v3LevelExtraMana(lv);
  const baseMana = spell.manaCost ?? 0;
  const craftedReach = comp?.reach || "";
  const chosenReach = reach || craftedReach;
  const reachExtra = v3ReachExtraMana(spell, chosenReach);
  const preExhaustionMana = Math.max(0, baseMana + extraMana + reachExtra);
  // At exhaustion 4+, V3 mana costs are doubled (must match v3cast.castV3Spell).
  const manaMult = v3ExhaustionCostMultiplier(castCharacter?.exhaustion);
  const totalMana = preExhaustionMana * manaMult;
  const canCast = !!castCharacter && !awaiting;

  const handleClose = () => {
    setLevel(1);
    setReach(spell?.composition?.reach || "");
    onOpenChange(false);
  };

  const handleCast = () => {
    if (!castCharacter) return;
    const ok = castV3Spell(castCharacter, spell, lv, chosenReach);
    if (ok) {
      onCast?.();
      setLevel(1);
      setReach(spell?.composition?.reach || "");
      onOpenChange(false);
    }
  };

  return (
    <FloatingPanel
      open={open}
      onClose={handleClose}
      title={
        <span className="flex items-center gap-2 text-amber-300">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="truncate">{spell.name || (awaiting ? "Unnamed spell" : "Spell")}</span>
        </span>
      }
      defaultSize={{ width: 400, height: Math.min(700, window.innerHeight - 40) }}
      minWidth={320}
      minHeight={360}
      panelKey={panelKey}
      zIndex={floatingZIndices?.[panelKey] ?? 10060}
      onBringToFront={() => bringToFront?.(panelKey)}
      data-testid="dialog-v3-spell-detail"
    >
      <div className="space-y-3 text-sm p-1 overflow-y-auto h-full">
        {spell.image && (
          <img src={spell.image} alt={spell.name} className="w-full h-32 object-cover rounded" />
        )}
        {awaiting && (
          <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-900/30 px-2 py-1 rounded w-fit">
            <Clock className="h-3 w-3" /> Awaiting GM authoring
          </div>
        )}
        {spell.description && <p className="text-stone-300">{spell.description}</p>}
        <div className="flex gap-3 text-xs text-stone-400">
          <span>Mana: <span className="text-fuchsia-300">{spell.manaCost}</span></span>
          <span>Craft DC: <span className="text-amber-300">{spell.craftDc}</span></span>
        </div>
        {comp && (
          <div className="space-y-1 border-t border-stone-700 pt-2">
            {comp.core && (
              <p className="text-xs"><span className="text-stone-500">Core:</span> <span className="text-amber-300">{V3_ELEMENT_MAP[comp.core]?.name ?? comp.core}</span></p>
            )}
            {comp.secondaries && comp.secondaries.length > 0 && (
              <p className="text-xs">
                <span className="text-stone-500">Secondary:</span>{" "}
                {comp.secondaries.map((s, i) => (
                  <span key={i} className="text-stone-300">
                    {V3_ELEMENT_MAP[s.element]?.name ?? s.element}
                    {s.role ? ` (${V3_ROLE_MAP[s.role]?.name ?? s.role})` : ""}
                    {i < comp.secondaries.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            )}
            {comp.intent && <p className="text-xs"><span className="text-stone-500">Intent:</span> <span className="text-stone-300">{V3_INTENT_MAP[comp.intent]?.name ?? comp.intent}</span></p>}
            {comp.delivery && <p className="text-xs"><span className="text-stone-500">Delivery:</span> <span className="text-stone-300">{V3_DELIVERY_MAP[comp.delivery]?.name ?? comp.delivery}</span></p>}
            {comp.reach && <p className="text-xs"><span className="text-stone-500">Reach:</span> <span className="text-stone-300">{V3_REACH_MAP[comp.reach]?.name ?? comp.reach}</span></p>}
            {comp.duration && <p className="text-xs"><span className="text-stone-500">Duration:</span> <span className="text-stone-300">{V3_DURATION_MAP[comp.duration]?.name ?? comp.duration}</span></p>}
          </div>
        )}

        {canCast && (
          <div className="space-y-2 border-t border-stone-700 pt-3" data-testid="section-v3-spell-cast">
            {craftedReach && (
              <div className="space-y-1" data-testid="section-v3-spell-reach">
                <span className="text-xs uppercase tracking-wide text-stone-500">Range</span>
                <Select value={chosenReach} onValueChange={setReach}>
                  <SelectTrigger className="h-8 bg-stone-950 border-stone-600 text-stone-200" data-testid="select-v3-reach">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {V3_REACHES.map((r) => (
                      <SelectItem key={r.key} value={r.key} className="text-xs">
                        {r.name} ({r.description})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-stone-500">Cast Level</span>
              <span className="flex items-center gap-1 text-amber-300 font-semibold" data-testid="text-v3-dice-readout">
                <Dices className="h-4 w-4" /> {diceLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 border-stone-600 text-stone-300 hover:bg-stone-800"
                onClick={() => setLevel((l) => Math.max(1, Math.floor(l || 1) - 1))}
                disabled={lv <= 1}
                data-testid="button-v3-level-minus"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <NumberInput
                value={lv}
                onChange={(v) => setLevel(v ?? 1)}
                min={1}
                fallback={1}
                className="h-8 w-20 text-center bg-stone-950 border-stone-600"
                data-testid="input-v3-level"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 border-stone-600 text-stone-300 hover:bg-stone-800"
                onClick={() => setLevel((l) => Math.max(1, Math.floor(l || 1)) + 1)}
                data-testid="button-v3-level-plus"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-stone-400" data-testid="text-v3-total-mana">
              Total mana: <span className="text-fuchsia-300">{totalMana}</span>
              <span className="text-stone-500"> (base {baseMana}{extraMana > 0 ? ` + ${extraMana} for level` : ""}{reachExtra !== 0 ? ` ${reachExtra > 0 ? "+" : "−"} ${Math.abs(reachExtra)} for range` : ""})</span>
            </p>
            {manaMult > 1 && (
              <p className="text-xs text-red-400/90" data-testid="text-v3-exhaustion-mana">
                Mana: {totalMana} (doubled from {preExhaustionMana}, Exhaustion)
              </p>
            )}
            <Button
              type="button"
              className="w-full bg-amber-700 hover:bg-amber-600 text-white"
              onClick={handleCast}
              data-testid="button-v3-roll-spell"
            >
              <Dices className="h-4 w-4 mr-2" /> Roll {diceLabel}
            </Button>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}

export function SpellbookPanel({
  open,
  onClose,
  item,
  character,
  canEdit = true,
  bringToFront,
  floatingZIndices,
  charPanelSuffix = "",
  onSpellCast,
  defaultPosition,
  runesSection,
}: SpellbookPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const panelKey = `spellbook${charPanelSuffix}`;
  const [detailSpellId, setDetailSpellId] = useState<string | null>(null);

  const { data: spells = [], isLoading } = useQuery<V3Spell[]>({
    queryKey: ["spellbook-spells", item?.id],
    queryFn: () => api.getSpellbookSpells(item.id),
    enabled: open && !!item?.id,
  });

  // Derive the open detail spell from the live list so it updates in place
  // when the GM authors it (status awaiting_gm -> ready) with no manual refresh.
  const detailSpell = detailSpellId ? (spells.find((s) => s.id === detailSpellId) ?? null) : null;

  const invalidateSpells = () =>
    queryClient.invalidateQueries({ queryKey: ["spellbook-spells", item?.id] });

  const removeMutation = useMutation({
    mutationFn: (spellId: string) => api.removeSpellFromSpellbook(spellId),
    onSuccess: () => {
      invalidateSpells();
      toast({ title: "Spell removed", description: "The spell was removed from this spellbook." });
    },
    onError: (err: any) =>
      toast({ title: "Could not remove spell", description: err?.message || "Try again.", variant: "destructive" }),
  });

  if (!open || !item) return null;

  return (
    <>
    <FloatingPanel
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{item.name || "Spellbook"}</span>
          <span
            className="shrink-0 rounded-full bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-xs font-medium text-amber-300"
            data-testid="text-spellbook-capacity"
          >
            {spells.length}{(item.maxSpells ?? 0) > 0 ? ` / ${item.maxSpells}` : ""}
          </span>
        </span>
      }
      defaultSize={{ width: 640, height: Math.min(700, window.innerHeight - 40) }}
      defaultPosition={defaultPosition}
      minWidth={360}
      minHeight={360}
      panelKey={panelKey}
      zIndex={floatingZIndices?.[panelKey] || 10050}
      onBringToFront={() => bringToFront?.(panelKey)}
    >
      <Tabs defaultValue="spells" className="flex flex-col h-full">
        <TabsList className="grid grid-cols-3 bg-stone-950 border-b border-stone-700 shrink-0 rounded-none">
          <TabsTrigger value="spells" data-testid="tab-spellbook-spells" className="data-[state=active]:bg-amber-900/60 data-[state=active]:text-amber-200">
            <BookOpen className="h-4 w-4 mr-2" /> Spells
          </TabsTrigger>
          <TabsTrigger value="builder" data-testid="tab-spellbook-builder" className="data-[state=active]:bg-amber-900/60 data-[state=active]:text-amber-200">
            <Wand2 className="h-4 w-4 mr-2" /> Builder
          </TabsTrigger>
          <TabsTrigger value="info" data-testid="tab-spellbook-info" className="data-[state=active]:bg-amber-900/60 data-[state=active]:text-amber-200">
            <Info className="h-4 w-4 mr-2" /> Item Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spells" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0" data-testid="content-spellbook-spells">
          {isLoading ? (
            <div className="text-center py-12 text-stone-400 text-sm">Loading spells…</div>
          ) : spells.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No spells in this book yet.</p>
              <p className="text-xs text-stone-500 mt-1">Use the Builder tab to craft one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {spells.map((spell) => {
                const awaiting = spell.status === "awaiting_gm";
                return (
                  <div
                    key={spell.id}
                    className="bg-stone-900 rounded-lg p-3 border border-stone-700 cursor-pointer hover:border-amber-600 hover:bg-stone-800/60 transition-colors"
                    onClick={() => setDetailSpellId(spell.id)}
                    data-testid={`spellbook-spell-${spell.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-stone-800 rounded flex items-center justify-center flex-shrink-0">
                        {spell.image ? (
                          <img src={spell.image} alt={spell.name} className="w-full h-full object-cover rounded" />
                        ) : (
                          <Sparkles className="h-6 w-6 text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-stone-100 truncate">
                            {spell.name || (awaiting ? "Unnamed spell" : "Spell")}
                          </h4>
                          {awaiting && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">
                              <Clock className="h-3 w-3" /> Awaiting GM
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 mt-0.5 truncate">{v3SpellSummary(spell)}</p>
                        {spell.description && (
                          <p className="text-xs text-stone-500 mt-1 line-clamp-2">{spell.description}</p>
                        )}
                        {canEdit && (
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300"
                              onClick={(e) => { e.stopPropagation(); removeMutation.mutate(spell.id); }}
                              data-testid={`button-remove-spell-${spell.id}`}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Remove
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="builder" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0" data-testid="content-spellbook-builder">
          <V3SpellCrafter
            character={character}
            spellbookItemId={item.id}
            spellsUsed={spells.length}
            maxSpells={item.maxSpells ?? 0}
            atCapacity={(item.maxSpells ?? 0) > 0 && spells.length >= item.maxSpells}
            onCrafted={(spell, autoFilled) => { if (spell) invalidateSpells(); }}
          />
        </TabsContent>

        <TabsContent value="info" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0 space-y-4" data-testid="content-spellbook-info">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              {item.image ? (
                <img src={item.image} alt={item.name} className="h-24 w-24 rounded object-cover border border-stone-600" />
              ) : (
                <div className="h-24 w-24 rounded bg-stone-700 flex items-center justify-center border border-stone-600">
                  <Package className="h-10 w-10 text-stone-500" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 flex-1 content-start">
              <div>
                <span className="text-xs text-stone-400 block">Type</span>
                <p className="text-stone-200 capitalize">{item.itemType || "—"}</p>
              </div>
              {item.rarity && (
                <div>
                  <span className="text-xs text-stone-400 block">Rarity</span>
                  <p className={`capitalize font-medium ${
                    item.rarity === 'legendary' ? 'text-amber-400' :
                    item.rarity === 'epic' ? 'text-amber-400' :
                    item.rarity === 'rare' ? 'text-blue-400' :
                    item.rarity === 'uncommon' ? 'text-green-400' :
                    'text-stone-300'
                  }`}>{item.rarity}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-stone-400 block">Quantity</span>
                <p className="text-stone-200">{item.totalQuantity || item.quantity || 1}</p>
              </div>
              <div>
                <span className="text-xs text-stone-400 block">Weight</span>
                <p className="text-stone-200">{item.itemWeight != null ? `${item.itemWeight} lbs` : "—"}</p>
              </div>
              <div>
                <span className="text-xs text-stone-400 block">Price</span>
                <p className="text-stone-200">{item.price != null && item.price !== 0 ? `${item.price} ${item.currency || "copper"}` : "—"}</p>
              </div>
              <div>
                <span className="text-xs text-stone-400 block">Spell Capacity</span>
                <p className="text-stone-200">{(item.maxSpells ?? 0) > 0 ? item.maxSpells : "Unlimited"}</p>
              </div>
            </div>
          </div>
          {item.description && (
            <div>
              <span className="text-xs text-stone-400 block">Description</span>
              <p className="text-sm text-stone-300 whitespace-pre-wrap" data-testid="text-spellbook-item-description">{item.description}</p>
            </div>
          )}
          {runesSection}
        </TabsContent>
      </Tabs>
    </FloatingPanel>
    <V3SpellDetailDialog
      open={!!detailSpell}
      onOpenChange={(o) => { if (!o) setDetailSpellId(null); }}
      spell={detailSpell}
      castCharacter={character}
      onCast={onSpellCast}
      panelKey={`v3-spell-detail${charPanelSuffix}`}
    />
    </>
  );
}
