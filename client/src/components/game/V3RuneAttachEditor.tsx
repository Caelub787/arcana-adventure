import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Search, Gem } from 'lucide-react';
import { api } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { v3AttachRune, v3DetachRune, v3RuneSlotCount, type V3SocketedRune } from '@shared/v3';

/**
 * AA V3 reusable rune-attach editor. Operates on a generic "host" item object
 * (anything with itemType, rarity, socketedRunes, and the baked stat columns)
 * and emits the merged field updates via onChange. Runes display as slots; an
 * empty slot opens a searchable picker panel. Slot limits are enforced by rarity.
 *
 * By default the picker lists every library rune. Pass `availableRunes` to scope
 * the picker to a specific set (e.g. a character's inventory runes on the sheet).
 * Used when adding an item to a character sheet and for shop items.
 */
export function V3RuneAttachEditor({
  host,
  onChange,
  campaignSystem,
  campaignId,
  availableRunes,
  emptyPickerLabel,
}: {
  host: { itemType?: string; rarity?: string; socketedRunes?: V3SocketedRune[] | null; [k: string]: any };
  onChange: (updates: Record<string, any>) => void;
  campaignSystem?: string;
  campaignId?: string;
  availableRunes?: any[];
  emptyPickerLabel?: string;
}) {
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const { data: allItems = [] } = useQuery({
    queryKey: ['system-items-full', campaignSystem, campaignId],
    queryFn: () => api.getSystemItems(campaignSystem, campaignId),
    staleTime: 10 * 60 * 1000,
    enabled: !availableRunes,
  });
  const runeItems = (availableRunes ?? (allItems as any[])).filter((i) => i.itemType === 'rune');

  const slots = v3RuneSlotCount(host.rarity);
  const socketed: V3SocketedRune[] = Array.isArray(host.socketedRunes) ? host.socketedRunes : [];
  // Always render every socketed rune (even ones whose slotIndex now exceeds the
  // current slot count, e.g. after rarity was lowered) so they stay removable.
  const cellCount = Math.max(slots, socketed.reduce((m, r) => Math.max(m, r.slotIndex + 1), 0));
  const compatibleRunes = runeItems.filter((r) => {
    const t = r.runeTargetItemType || 'any';
    return t === 'any' || t === host.itemType;
  });
  const filtered = compatibleRunes.filter((r) =>
    (r.name || '').toLowerCase().includes(search.toLowerCase()),
  );

  const attach = (rune: any) => {
    const res = v3AttachRune(host, rune);
    if (res.ok && res.updates) onChange(res.updates);
    setOpenSlot(null);
    setSearch('');
  };
  const detach = (slotIndex: number) => {
    const res = v3DetachRune(host, slotIndex);
    if (res.ok && res.updates) onChange(res.updates);
  };

  return (
    <div className="space-y-2" data-testid="rune-attach-editor">
      <div className="flex items-center justify-between">
        <Label className="text-stone-300">Runes</Label>
        <span className="text-xs text-stone-400" data-testid="text-rune-slot-count">
          {socketed.length} / {slots} slots
        </span>
      </div>
      {slots === 0 && socketed.length === 0 ? (
        <p className="text-xs text-stone-500" data-testid="text-no-rune-slots">
          This rarity has no rune slots. Raise the rarity to add runes.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: cellCount }).map((_, i) => {
            const rune = socketed.find((r) => r.slotIndex === i);
            if (rune) {
              return (
                <div
                  key={i}
                  className="relative w-20 h-20 rounded-lg border-2 border-amber-700/60 bg-stone-800 flex flex-col items-center justify-center p-1 text-center"
                  data-testid={`rune-slot-filled-${i}`}
                  title={rune.statEffects?.length
                    ? rune.statEffects.map((e) => `${e.amount > 0 ? '+' : ''}${e.amount} ${e.target}`).join(', ')
                    : rune.name}
                >
                  {rune.image ? (
                    <img src={rune.image} alt={rune.name} className="w-8 h-8 object-cover rounded mb-1" />
                  ) : (
                    <Gem className="w-6 h-6 text-amber-400 mb-1" />
                  )}
                  <span className="text-[10px] leading-tight text-stone-200 line-clamp-2">{rune.name}</span>
                  <button
                    type="button"
                    onClick={() => detach(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-900 border border-stone-600 text-stone-400 hover:text-red-400 flex items-center justify-center"
                    data-testid={`button-remove-attached-rune-${i}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            }
            if (i >= slots) return null;
            return (
              <Popover
                key={i}
                open={openSlot === i}
                onOpenChange={(o) => {
                  setOpenSlot(o ? i : null);
                  setSearch('');
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-20 h-20 rounded-lg border-2 border-dashed border-stone-600 bg-stone-900/50 hover:border-amber-700/60 hover:bg-stone-800 flex items-center justify-center transition-colors"
                    data-testid={`rune-slot-empty-${i}`}
                  >
                    <Plus className="w-6 h-6 text-stone-500" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2 bg-stone-900 border-stone-700" align="start">
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search runes…"
                      className="pl-8 h-8 bg-stone-800 border-stone-700 text-sm"
                      data-testid="input-rune-search"
                      autoFocus
                    />
                  </div>
                  <ScrollArea className="h-56">
                    {filtered.length === 0 ? (
                      <p className="text-xs text-stone-500 py-4 text-center" data-testid="text-no-runes-available">
                        {emptyPickerLabel || 'No compatible runes'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {filtered.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => attach(r)}
                            className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-stone-800 text-left"
                            data-testid={`rune-option-${r.id}`}
                          >
                            <div className="w-8 h-8 rounded bg-stone-800 flex items-center justify-center overflow-hidden shrink-0">
                              {r.image ? (
                                <img src={r.image} alt={r.name} className="w-full h-full object-cover" />
                              ) : (
                                <Gem className="w-4 h-4 text-amber-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-stone-200 truncate">{r.name}</div>
                              {Array.isArray(r.runeStatEffects) && r.runeStatEffects.length ? (
                                <div className="text-[11px] text-amber-400 truncate">
                                  {r.runeStatEffects
                                    .map((e: any) => `${e.amount > 0 ? '+' : ''}${e.amount} ${e.target}`)
                                    .join(', ')}
                                </div>
                              ) : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      )}
    </div>
  );
}
