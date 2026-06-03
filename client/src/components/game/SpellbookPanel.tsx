import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type V3Spell } from "@/lib/api";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { V3SpellCrafter } from "./V3SpellCrafter";
import {
  V3_INTENT_MAP,
  V3_DELIVERY_MAP,
  V3_ELEMENT_MAP,
  V3_REACH_MAP,
  V3_DURATION_MAP,
  V3_ROLE_MAP,
} from "@shared/v3spells";
import { BookOpen, Sparkles, Send, Trash2, Wand2, Clock } from "lucide-react";

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spell: V3Spell | null;
}) {
  if (!spell) return null;
  const comp = spell.composition;
  const awaiting = spell.status === "awaiting_gm";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md" data-testid="dialog-v3-spell-detail">
        <DialogHeader>
          <DialogTitle className="text-purple-300 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {spell.name || (awaiting ? "Unnamed spell" : "Spell")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
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
            <span>Mana: <span className="text-blue-300">{spell.manaCost}</span></span>
            <span>Craft DC: <span className="text-amber-300">{spell.craftDc}</span></span>
          </div>
          {comp && (
            <div className="space-y-1 border-t border-stone-700 pt-2">
              {comp.core && (
                <p className="text-xs"><span className="text-stone-500">Core:</span> <span className="text-purple-300">{V3_ELEMENT_MAP[comp.core]?.name ?? comp.core}</span></p>
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
        </div>
      </DialogContent>
    </Dialog>
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
}: SpellbookPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const panelKey = `spellbook${charPanelSuffix}`;

  const { data: spells = [], isLoading } = useQuery<V3Spell[]>({
    queryKey: ["spellbook-spells", item?.id],
    queryFn: () => api.getSpellbookSpells(item.id),
    enabled: open && !!item?.id,
  });

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

  const sendToHotbar = async (spell: V3Spell) => {
    try {
      const hotbars = await api.getHotbars(character.id);
      const usedSlots = new Set(
        hotbars.filter((h) => h.hotbarType === "magic").map((h) => h.slotNumber),
      );
      let slot = -1;
      for (let i = 0; i < 5; i++) {
        if (!usedSlots.has(i)) { slot = i; break; }
      }
      if (slot === -1) {
        toast({ title: "Magic hotbar is full", description: "Free up a magic slot first.", variant: "destructive" });
        return;
      }
      await api.upsertHotbar(character.id, {
        hotbarType: "magic",
        slotNumber: slot,
        v3SpellId: spell.id,
      } as any);
      queryClient.invalidateQueries({ queryKey: ["hotbars", character.id] });
      toast({ title: "Sent to hotbar", description: `${spell.name || "Spell"} added to magic slot ${slot + 1}.` });
    } catch (err: any) {
      toast({ title: "Could not send to hotbar", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  if (!open || !item) return null;

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      title={item.name || "Spellbook"}
      defaultSize={{ width: 640, height: 560 }}
      minWidth={360}
      minHeight={360}
      panelKey={panelKey}
      zIndex={floatingZIndices?.[panelKey] || 10050}
      onBringToFront={() => bringToFront?.(panelKey)}
    >
      <Tabs defaultValue="spells" className="flex flex-col h-full">
        <TabsList className="grid grid-cols-2 bg-stone-950 border-b border-stone-700 shrink-0 rounded-none">
          <TabsTrigger value="spells" data-testid="tab-spellbook-spells" className="data-[state=active]:bg-purple-900/60 data-[state=active]:text-purple-200">
            <BookOpen className="h-4 w-4 mr-2" /> Spells
          </TabsTrigger>
          <TabsTrigger value="builder" data-testid="tab-spellbook-builder" className="data-[state=active]:bg-purple-900/60 data-[state=active]:text-purple-200">
            <Wand2 className="h-4 w-4 mr-2" /> Builder
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
                    className="bg-stone-900 rounded-lg p-3 border border-stone-700"
                    data-testid={`spellbook-spell-${spell.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-stone-800 rounded flex items-center justify-center flex-shrink-0">
                        {spell.image ? (
                          <img src={spell.image} alt={spell.name} className="w-full h-full object-cover rounded" />
                        ) : (
                          <Sparkles className="h-6 w-6 text-purple-400" />
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
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-purple-700 text-purple-300 hover:bg-purple-900/40"
                            disabled={awaiting}
                            onClick={() => sendToHotbar(spell)}
                            data-testid={`button-send-hotbar-${spell.id}`}
                          >
                            <Send className="h-3 w-3 mr-1" /> Send to Hotbar
                          </Button>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300"
                              onClick={() => removeMutation.mutate(spell.id)}
                              data-testid={`button-remove-spell-${spell.id}`}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Remove
                            </Button>
                          )}
                        </div>
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
            onCrafted={(spell, autoFilled) => { if (spell) invalidateSpells(); }}
          />
        </TabsContent>
      </Tabs>
    </FloatingPanel>
  );
}
