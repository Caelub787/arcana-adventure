// AA V3 free hotbar — per-user, per-campaign quick-access loadouts.
// 9 loadouts (0-8) of 10 slots each. A slot holds a character (opens their
// sheet) or a direct link to an item row (character inventory item, or a
// GM-assigned admin/My Library item). Replaces the V2-style battle hotbars,
// character-sheet hotbars, and GM character hotbar in V3 campaigns only.
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { ChevronUp, ChevronDown, Plus, User, Package, ArrowLeft, X, Library, Filter, Eye } from "lucide-react";
import { LazyItemImage } from "./GameComponents";
import { caWoundTotalCost, CA_WOUND_MAX } from "@shared/ca";

const NUM_LOADOUTS = 9;
const NUM_SLOTS = 10;

export interface FreeHotbarCharView {
  id: string;
  name: string;
  portrait: string | null;
  hp?: number;
  maxHp?: number;
  energy?: number;
  maxEnergy?: number;
  mana?: number;
  maxMana?: number;
  caWounds?: unknown;
  canEdit?: boolean;
}

export interface FreeHotbarEntryView {
  id: string;
  loadoutIndex: number;
  slotIndex: number;
  characterId: string | null;
  itemId: string | null;
  character: FreeHotbarCharView | null;
  item: any | null;
  sourceCharacter: { id: string; name: string; portrait: string | null } | null;
}

// Compact stacked HP/Energy/Mana bars for character slot tiles + peek panel.
// `medium` is a touch taller than `thin` — used for C.A.'s 2-bar tile display,
// which has the vertical room to be a bit more noticeable than V3's 3-bar one.
function StatBar({ value, max, color, thin, medium }: { value: number; max: number; color: string; thin?: boolean; medium?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const heightClass = medium ? 'h-[5px]' : thin ? 'h-[3px]' : 'h-2';
  return (
    <div className={`w-full ${heightClass} bg-black/60 ${medium || !thin ? 'rounded-sm' : ''} overflow-hidden`}>
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CharStatBars({ char, thin, isCA }: { char: FreeHotbarCharView; thin?: boolean; isCA?: boolean }) {
  // C.A. has no HP/mana — show Wound Capacity remaining + Energy instead.
  if (isCA) {
    const remaining = Math.max(0, CA_WOUND_MAX - caWoundTotalCost(char.caWounds));
    return (
      <div className={thin ? 'space-y-0.5' : 'space-y-1.5'}>
        <StatBar value={remaining} max={CA_WOUND_MAX} color="bg-red-600" thin={thin} medium={thin} />
        <StatBar value={char.energy ?? 0} max={char.maxEnergy ?? 0} color="bg-blue-500" thin={thin} medium={thin} />
      </div>
    );
  }
  if (char.maxHp == null) return null;
  return (
    <div className={thin ? 'space-y-px' : 'space-y-1.5'}>
      <StatBar value={char.hp ?? 0} max={char.maxHp ?? 0} color="bg-red-500" thin={thin} />
      <StatBar value={char.energy ?? 0} max={char.maxEnergy ?? 0} color="bg-green-500" thin={thin} />
      <StatBar value={char.mana ?? 0} max={char.maxMana ?? 0} color="bg-fuchsia-400" thin={thin} />
    </div>
  );
}

interface V3FreeHotbarProps {
  campaignId: string;
  isGM: boolean;
  onOpenCharacterSheet: (characterId: string) => void;
  onOpenItem: (item: any, sourceCharacterId: string | null) => void;
  // Pixel width of an open right-side panel (notes/world builder) so the
  // hotbar shifts left instead of being covered. 0 when closed / on mobile.
  rightOffset?: number;
  // Campaign system slug ('aa-v3', 'ca', ...) — swaps the HP/Energy/Mana
  // stat-bar display for C.A.'s Wounds/Energy display where relevant.
  campaignSystem?: string;
}

export function V3FreeHotbar({ campaignId, isGM, onOpenCharacterSheet, onOpenItem, rightOffset = 0, campaignSystem }: V3FreeHotbarProps) {
  const isCA = campaignSystem === 'ca';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loadout, setLoadout] = useState(() => {
    const saved = Number(localStorage.getItem(`aa-free-hotbar-loadout-${campaignId}`));
    return Number.isInteger(saved) && saved >= 0 && saved < NUM_LOADOUTS ? saved : 0;
  });
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FreeHotbarEntryView | null>(null);
  const [peekCharId, setPeekCharId] = useState<string | null>(null);
  const hHeld = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdArmed = useRef(false);

  useEffect(() => {
    localStorage.setItem(`aa-free-hotbar-loadout-${campaignId}`, String(loadout));
  }, [loadout, campaignId]);

  // Keyboard shortcuts: H + digit switches loadouts; a plain digit (1-9, 0)
  // opens the assigned slot (1 = first slot, 0 = tenth). Both are ignored
  // while typing in any text/value field.
  const openSlotByKeyRef = useRef<(slotIndex: number) => void>(() => {});
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === 'h' || e.key === 'H') hHeld.current = true;
      else if (hHeld.current && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (/^[0-8]$/.test(e.key)) setLoadout(Number(e.key));
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[0-9]$/.test(e.key)) {
        // 1..9 -> slots 0..8, 0 -> slot 9
        const slotIndex = e.key === '0' ? 9 : Number(e.key) - 1;
        openSlotByKeyRef.current(slotIndex);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') hHeld.current = false;
    };
    const blur = () => { hHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const { data: entries = [] } = useQuery<FreeHotbarEntryView[]>({
    queryKey: ['free-hotbar', campaignId],
    queryFn: () => api.getFreeHotbar(campaignId),
  });

  // Live stat overlay: the campaign characters query is invalidated by the
  // character-update WebSocket flow, so merging its hp/energy/mana values on
  // top of the hotbar snapshot keeps the slot bars current during play.
  const { data: liveChars } = useQuery<any[]>({
    queryKey: [`/api/campaigns/${campaignId}/characters`],
  });
  const liveCharMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of liveChars ?? []) map.set(c.id, c);
    return map;
  }, [liveChars]);
  const mergeLive = (char: FreeHotbarCharView): FreeHotbarCharView => {
    const live = liveCharMap.get(char.id);
    if (!live) return char;
    return {
      ...char,
      hp: live.hp ?? char.hp,
      maxHp: live.maxHp ?? char.maxHp,
      energy: live.energy ?? char.energy,
      maxEnergy: live.maxEnergy ?? char.maxEnergy,
      mana: live.mana ?? char.mana,
      maxMana: live.maxMana ?? char.maxMana,
      caWounds: live.caWounds ?? char.caWounds,
      // live.portrait can be a genuine null (no portrait set) while char.portrait
      // already carries the species-default fallback resolved server-side —
      // an empty live value must not clobber that fallback.
      portrait: live.portrait || char.portrait,
      name: live.name ?? char.name,
    };
  };

  const setSlotMutation = useMutation({
    mutationFn: (data: { loadoutIndex: number; slotIndex: number; characterId?: string | null; itemId?: string | null }) =>
      api.setFreeHotbarSlot(campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['free-hotbar', campaignId] });
      setPickerSlot(null);
    },
    onError: (err: any) => {
      toast({ title: "Couldn't assign slot", description: err?.message || 'Failed', variant: 'destructive' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (entryId: string) => api.deleteFreeHotbarEntry(campaignId, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['free-hotbar', campaignId] });
      setRemoveTarget(null);
    },
  });

  const currentEntries = useMemo(() => {
    const map = new Map<number, FreeHotbarEntryView>();
    for (const e of entries) {
      if (e.loadoutIndex === loadout) map.set(e.slotIndex, e);
    }
    return map;
  }, [entries, loadout]);

  const startHold = (entry: FreeHotbarEntryView) => {
    holdArmed.current = false;
    holdTimer.current = setTimeout(() => { holdArmed.current = true; }, 550);
  };
  const endHold = (entry: FreeHotbarEntryView) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (holdArmed.current) {
      // Leave holdArmed set: on desktop the click event still fires after
      // pointerup, and the click handler consumes+resets the flag so the
      // hold doesn't also open the sheet/item over the remove dialog.
      setRemoveTarget(entry);
      return true; // consumed as a hold
    }
    return false;
  };
  const cancelHold = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    holdArmed.current = false;
  };

  const handleSlotClick = (slotIndex: number) => {
    const entry = currentEntries.get(slotIndex);
    if (!entry) { setPickerSlot(slotIndex); return; }
    if (entry.characterId && entry.character) {
      if (entry.character.canEdit === false) {
        setPeekCharId(entry.characterId);
      } else {
        onOpenCharacterSheet(entry.characterId);
      }
    } else if (entry.item) {
      onOpenItem(entry.item, entry.item.characterId || null);
    }
  };

  // Digit shortcut: only opens assigned slots; an empty slot does nothing
  // (unlike a click, which opens the picker).
  openSlotByKeyRef.current = (slotIndex: number) => {
    if (currentEntries.get(slotIndex)) handleSlotClick(slotIndex);
  };

  return (
    <div
      className="fixed bottom-2 right-2 sm:bottom-4 sm:right-4 z-30 pointer-events-auto transition-all duration-300 ease-in-out"
      style={{ right: rightOffset > 0 ? `${rightOffset + 16}px` : undefined }}
      data-testid="v3-free-hotbar"
    >
      <div className="flex items-center gap-1 sm:gap-2 bg-stone-900/95 border border-stone-700 rounded-xl p-1 sm:p-2 shadow-xl backdrop-blur-sm">
        {/* Loadout switcher */}
        <div className="flex flex-col items-center mr-0.5 sm:mr-1 select-none">
          <button
            onClick={() => setLoadout((l) => (l + 1) % NUM_LOADOUTS)}
            className="text-stone-400 hover:text-amber-400 p-0.5"
            data-testid="button-loadout-up"
            aria-label="Next loadout"
          >
            <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <span className="text-amber-400 font-bold text-xs sm:text-sm w-4 sm:w-5 text-center" data-testid="text-loadout-index">{loadout}</span>
          <button
            onClick={() => setLoadout((l) => (l + NUM_LOADOUTS - 1) % NUM_LOADOUTS)}
            className="text-stone-400 hover:text-amber-400 p-0.5"
            data-testid="button-loadout-down"
            aria-label="Previous loadout"
          >
            <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>

        {/* Slots — 10 per loadout; wraps to 2 rows of 5 when a single row can't fit */}
        <div className="grid grid-cols-5 xl:grid-cols-10 gap-1 sm:gap-2">
        {Array.from({ length: NUM_SLOTS }).map((_, slotIndex) => {
          const entry = currentEntries.get(slotIndex);
          return (
            <div key={slotIndex} className="relative">
              <button
                onClick={() => {
                  if (holdArmed.current) { holdArmed.current = false; return; }
                  handleSlotClick(slotIndex);
                }}
                onPointerDown={() => { if (entry) startHold(entry); }}
                onPointerUp={(e) => {
                  if (entry && endHold(entry)) { e.preventDefault(); e.stopPropagation(); }
                }}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
                onContextMenu={(e) => { if (entry) { e.preventDefault(); setRemoveTarget(entry); } }}
                className={`w-10 h-10 sm:w-14 sm:h-14 rounded-lg border-2 flex items-center justify-center overflow-hidden transition-all duration-200 hover:scale-105 select-none touch-none ${
                  entry ? 'border-amber-600 bg-stone-800 hover:border-amber-500' : 'border-stone-600 bg-stone-800/50 hover:border-stone-500 hover:bg-stone-700/50'
                }`}
                data-testid={`free-hotbar-slot-${slotIndex}`}
              >
                {entry ? (
                  entry.character ? (
                    <div className="relative w-full h-full pointer-events-none">
                      {entry.character.portrait ? (
                        <img src={entry.character.portrait} alt={entry.character.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0" data-testid={`free-hotbar-slot-${slotIndex}-bars`}>
                        <CharStatBars char={mergeLive(entry.character)} thin isCA={isCA} />
                      </div>
                    </div>
                  ) : entry.item ? (
                    entry.item.image ? (
                      <img src={entry.item.image} alt={entry.item.name} className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <LazyItemImage itemId={entry.item.id} itemType={entry.item.itemType} />
                    )
                  ) : null
                ) : (
                  <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-stone-500" />
                )}
              </button>
              {/* Source-character badge on items from a character's inventory */}
              {entry?.item && entry.sourceCharacter && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-amber-600 bg-stone-900 overflow-hidden flex items-center justify-center"
                        data-testid={`free-hotbar-slot-${slotIndex}-source-badge`}
                      >
                        {entry.sourceCharacter.portrait ? (
                          <img src={entry.sourceCharacter.portrait} alt={entry.sourceCharacter.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="h-3 w-3 text-amber-500" />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-stone-800 border-stone-700 text-stone-200">
                      <p>{entry.sourceCharacter.name}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {/* Slot picker */}
      {pickerSlot !== null && (
        <SlotPickerDialog
          campaignId={campaignId}
          isGM={isGM}
          onClose={() => setPickerSlot(null)}
          onAssignCharacter={(characterId) =>
            setSlotMutation.mutate({ loadoutIndex: loadout, slotIndex: pickerSlot, characterId })
          }
          onAssignItem={(itemId) =>
            setSlotMutation.mutate({ loadoutIndex: loadout, slotIndex: pickerSlot, itemId })
          }
        />
      )}

      {/* Read-only teammate peek panel */}
      <Dialog open={!!peekCharId} onOpenChange={(open) => { if (!open) setPeekCharId(null); }}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-xs" data-testid="dialog-char-peek">
          {(() => {
            const raw = entries.find((e) => e.characterId === peekCharId)?.character;
            if (!raw) return null;
            const c = mergeLive(raw);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-stone-200 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-stone-400" />
                    <span data-testid="text-peek-name">{c.name}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="flex items-start gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-stone-800 border border-stone-700 flex items-center justify-center shrink-0">
                    {c.portrait ? (
                      <img src={c.portrait} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="h-7 w-7 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2 pt-0.5">
                    {isCA ? (
                      <>
                        <div>
                          <div className="flex justify-between text-xs text-stone-400 mb-0.5">
                            <span>Wounds</span>
                            <span data-testid="text-peek-wounds">{Math.max(0, CA_WOUND_MAX - caWoundTotalCost(c.caWounds))} / {CA_WOUND_MAX}</span>
                          </div>
                          <StatBar value={Math.max(0, CA_WOUND_MAX - caWoundTotalCost(c.caWounds))} max={CA_WOUND_MAX} color="bg-red-600" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-stone-400 mb-0.5">
                            <span>Energy</span>
                            <span data-testid="text-peek-energy">{c.energy ?? 0} / {c.maxEnergy ?? 0}</span>
                          </div>
                          <StatBar value={c.energy ?? 0} max={c.maxEnergy ?? 0} color="bg-blue-500" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <div className="flex justify-between text-xs text-stone-400 mb-0.5">
                            <span>HP</span>
                            <span data-testid="text-peek-hp">{c.hp ?? 0} / {c.maxHp ?? 0}</span>
                          </div>
                          <StatBar value={c.hp ?? 0} max={c.maxHp ?? 0} color="bg-red-500" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-stone-400 mb-0.5">
                            <span>Energy</span>
                            <span data-testid="text-peek-energy">{c.energy ?? 0} / {c.maxEnergy ?? 0}</span>
                          </div>
                          <StatBar value={c.energy ?? 0} max={c.maxEnergy ?? 0} color="bg-green-500" />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-stone-400 mb-0.5">
                            <span>Mana</span>
                            <span data-testid="text-peek-mana">{c.mana ?? 0} / {c.maxMana ?? 0}</span>
                          </div>
                          <StatBar value={c.mana ?? 0} max={c.maxMana ?? 0} color="bg-fuchsia-400" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-xs text-stone-500">View only — you can't open this character's sheet.</p>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-stone-200">Remove from hotbar?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-stone-400">
            {removeTarget?.character?.name || removeTarget?.item?.name || 'This entry'} will be removed from slot {(removeTarget?.slotIndex ?? 0) + 1}.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoveTarget(null)} className="border-stone-600" data-testid="button-cancel-remove">Cancel</Button>
            <Button
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
              className="bg-red-800 hover:bg-red-700 text-white"
              data-testid="button-confirm-remove"
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SlotPickerDialog({ campaignId, isGM, onClose, onAssignCharacter, onAssignItem }: {
  campaignId: string;
  isGM: boolean;
  onClose: () => void;
  onAssignCharacter: (characterId: string) => void;
  onAssignItem: (itemId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [browsingChar, setBrowsingChar] = useState<{ id: string; name: string } | null>(null);
  const [librarySection, setLibrarySection] = useState<null | 'admin' | 'personal'>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');

  const { data: characters = [] } = useQuery({
    queryKey: ['free-hotbar-chars', campaignId],
    queryFn: () => api.getFreeHotbarCharacters(campaignId),
  });

  const { data: charItems = [], isLoading: charItemsLoading } = useQuery({
    queryKey: ['items', browsingChar?.id],
    queryFn: () => api.getItems(browsingChar!.id),
    enabled: !!browsingChar,
  });

  // Same source as every other in-campaign item browser: campaign library
  // items (incl. the GM's cross-campaign personal items) + admin system items.
  const { data: templateItems, isLoading: libraryLoading } = useQuery({
    queryKey: ['template-items', campaignId],
    queryFn: () => api.getTemplateItems(campaignId),
    enabled: isGM && !!librarySection,
  });
  const libraryItems = useMemo(() => {
    if (!templateItems) return [];
    return librarySection === 'personal'
      ? templateItems.campaignItems ?? []
      : templateItems.systemItems ?? [];
  }, [templateItems, librarySection]);

  const q = search.trim().toLowerCase();
  const filteredChars = characters.filter((c) => !q || c.name.toLowerCase().includes(q));
  const browserItems = browsingChar ? charItems : librarySection ? libraryItems : [];
  // Distinct item types present in the current list (for the filter picker).
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const it of browserItems as any[]) {
      if (it?.itemType) set.add(it.itemType);
    }
    return Array.from(set).sort();
  }, [browserItems]);
  const filteredItems = (browserItems as any[])
    .filter((it: any) => (!q || it.name?.toLowerCase().includes(q)) && (!typeFilter || it.itemType === typeFilter));

  const inItemBrowser = !!browsingChar || !!librarySection;
  const browserTitle = browsingChar ? `${browsingChar.name}'s Inventory` : librarySection === 'personal' ? 'Campaign & My Library' : 'Admin Library';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-stone-200 flex items-center gap-2">
            {inItemBrowser && (
              <button
                onClick={() => { setBrowsingChar(null); setLibrarySection(null); setSearch(''); setTypeFilter(null); }}
                className="text-stone-400 hover:text-stone-200"
                data-testid="button-picker-back"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {inItemBrowser ? browserTitle : 'Assign to Slot'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            placeholder={inItemBrowser ? 'Search items...' : 'Search characters...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-stone-800 border-stone-700 flex-1"
            data-testid="input-picker-search"
          />
          {inItemBrowser && (
            <Popover open={typeFilterOpen} onOpenChange={(open) => { setTypeFilterOpen(open); if (!open) setTypeSearch(''); }}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 shrink-0 border-stone-600 ${typeFilter ? 'text-amber-400 border-amber-700' : 'text-stone-300'} hover:bg-stone-700`}
                  data-testid="button-picker-type-filter"
                >
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  <span className="text-xs capitalize">{typeFilter || 'All types'}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 bg-stone-900 border-stone-700" align="end">
                <Input
                  placeholder="Search types..."
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                  className="bg-stone-800 border-stone-700 h-8 mb-2"
                  data-testid="input-type-filter-search"
                />
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  <button
                    onClick={() => { setTypeFilter(null); setTypeFilterOpen(false); setTypeSearch(''); }}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-stone-800 ${!typeFilter ? 'text-amber-400' : 'text-stone-300'}`}
                    data-testid="button-type-filter-all"
                  >
                    All types
                  </button>
                  {availableTypes
                    .filter((t) => !typeSearch.trim() || t.toLowerCase().includes(typeSearch.trim().toLowerCase()))
                    .map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTypeFilter(t); setTypeFilterOpen(false); setTypeSearch(''); }}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm capitalize hover:bg-stone-800 ${typeFilter === t ? 'text-amber-400' : 'text-stone-300'}`}
                        data-testid={`button-type-filter-${t}`}
                      >
                        {t}
                      </button>
                    ))}
                  {availableTypes.length === 0 && (
                    <p className="text-xs text-stone-500 px-2 py-1.5">No types available</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0" data-testid="picker-list">
          {!inItemBrowser && (
            <>
              {filteredChars.map((c) => (
                <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-stone-800/70 border border-stone-700" data-testid={`picker-char-${c.id}`}>
                  <div className="w-8 h-8 rounded-md overflow-hidden bg-stone-700 flex items-center justify-center shrink-0">
                    {c.portrait ? <img src={c.portrait} alt={c.name} className="w-full h-full object-cover" /> : <User className="h-4 w-4 text-amber-500" />}
                  </div>
                  <span className="text-sm text-stone-200 flex-1 truncate">{c.name}</span>
                  {c.canEdit === false && (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-stone-500 shrink-0" data-testid={`badge-view-only-${c.id}`}>
                      <Eye className="h-3 w-3" /> View only
                    </span>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs border-amber-700 text-amber-400 hover:bg-amber-900/30"
                    onClick={() => onAssignCharacter(c.id)} data-testid={`button-assign-char-${c.id}`}>
                    Assign
                  </Button>
                  {c.canEdit !== false && (
                    <Button size="sm" variant="outline" className="h-7 text-xs border-stone-600 text-stone-300 hover:bg-stone-700"
                      onClick={() => { setBrowsingChar({ id: c.id, name: c.name }); setSearch(''); }} data-testid={`button-browse-items-${c.id}`}>
                      <Package className="h-3 w-3 mr-1" /> Item
                    </Button>
                  )}
                </div>
              ))}
              {filteredChars.length === 0 && (
                <p className="text-sm text-stone-500 text-center py-4">No characters found</p>
              )}
              {isGM && (
                <div className="pt-2 mt-2 border-t border-stone-700 space-y-1">
                  <p className="text-xs text-stone-500 uppercase tracking-wide">GM Libraries</p>
                  <Button variant="outline" className="w-full justify-start border-stone-600 text-stone-300 hover:bg-stone-700"
                    onClick={() => { setLibrarySection('admin'); setSearch(''); }} data-testid="button-library-admin">
                    <Library className="h-4 w-4 mr-2" /> Admin Library
                  </Button>
                  <Button variant="outline" className="w-full justify-start border-stone-600 text-stone-300 hover:bg-stone-700"
                    onClick={() => { setLibrarySection('personal'); setSearch(''); }} data-testid="button-library-personal">
                    <Library className="h-4 w-4 mr-2" /> Campaign & My Library
                  </Button>
                </div>
              )}
            </>
          )}
          {inItemBrowser && (
            <>
              {(charItemsLoading || libraryLoading) && (
                <p className="text-sm text-stone-500 text-center py-4">Loading…</p>
              )}
              {filteredItems.map((it: any) => (
                <button
                  key={it.id}
                  onClick={() => onAssignItem(it.id)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg bg-stone-800/70 border border-stone-700 hover:border-amber-600 text-left"
                  data-testid={`picker-item-${it.id}`}
                >
                  <div className="w-8 h-8 rounded-md overflow-hidden bg-stone-700 flex items-center justify-center shrink-0">
                    {it.image ? <img src={it.image} alt={it.name} className="w-full h-full object-cover" /> : <Package className="h-4 w-4 text-stone-400" />}
                  </div>
                  <span className="text-sm text-stone-200 flex-1 truncate">{it.name}</span>
                  <span className="text-xs text-stone-500 capitalize">{it.itemType}</span>
                </button>
              ))}
              {!charItemsLoading && !libraryLoading && filteredItems.length === 0 && (
                <p className="text-sm text-stone-500 text-center py-4">No items found</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
