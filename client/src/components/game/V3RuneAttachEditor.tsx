import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { v3AttachRune, v3DetachRune, v3RuneSlotCount, type V3SocketedRune } from '@shared/v3';

/**
 * AA V3 reusable rune-attach editor. Operates on a generic "host" item object
 * (anything with itemType, rarity, socketedRunes, and the baked stat columns)
 * and emits the merged field updates via onChange. Runes are sourced from the
 * library (no inventory consumption) and slot limits are enforced by rarity.
 * Used when adding an item to a character sheet and for shop items.
 */
export function V3RuneAttachEditor({
  host,
  onChange,
  campaignSystem,
  campaignId,
}: {
  host: { itemType?: string; rarity?: string; socketedRunes?: V3SocketedRune[] | null; [k: string]: any };
  onChange: (updates: Record<string, any>) => void;
  campaignSystem?: string;
  campaignId?: string;
}) {
  const { data: allItems = [] } = useQuery({
    queryKey: ['system-items-full', campaignSystem, campaignId],
    queryFn: () => api.getSystemItems(campaignSystem, campaignId),
    staleTime: 10 * 60 * 1000,
  });
  const runeItems = (allItems as any[]).filter((i) => i.itemType === 'rune');

  const slots = v3RuneSlotCount(host.rarity);
  const socketed: V3SocketedRune[] = Array.isArray(host.socketedRunes) ? host.socketedRunes : [];
  const compatibleRunes = runeItems.filter((r) => {
    const t = r.runeTargetItemType || 'any';
    return t === 'any' || t === host.itemType;
  });

  return (
    <div className="space-y-2" data-testid="rune-attach-editor">
      <div className="flex items-center justify-between">
        <Label className="text-stone-300">Runes</Label>
        <span className="text-xs text-stone-400" data-testid="text-rune-slot-count">
          {socketed.length} / {slots} slots
        </span>
      </div>
      {socketed.map((rune) => (
        <div
          key={rune.slotIndex}
          className="flex items-center justify-between gap-2 p-2 bg-stone-800 rounded border border-stone-700"
          data-testid={`row-attached-rune-${rune.slotIndex}`}
        >
          <span className="text-sm text-stone-200">
            <span className="font-medium">{rune.name}</span>
            {rune.statEffects?.length ? (
              <span className="text-xs text-amber-400 ml-2">
                {rune.statEffects.map((e) => `${e.amount > 0 ? '+' : ''}${e.amount} ${e.target}`).join(', ')}
              </span>
            ) : null}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-stone-400 hover:text-red-400"
            onClick={() => {
              const res = v3DetachRune(host, rune.slotIndex);
              if (res.ok && res.updates) onChange(res.updates);
            }}
            data-testid={`button-remove-attached-rune-${rune.slotIndex}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {slots === 0 ? (
        <p className="text-xs text-stone-500" data-testid="text-no-rune-slots">
          This rarity has no rune slots. Raise the rarity to add runes.
        </p>
      ) : socketed.length < slots ? (
        <Select
          value=""
          onValueChange={(id) => {
            const rune = runeItems.find((r) => r.id === id);
            if (!rune) return;
            const res = v3AttachRune(host, rune);
            if (res.ok && res.updates) onChange(res.updates);
          }}
        >
          <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-add-rune">
            <SelectValue placeholder="Add a rune…" />
          </SelectTrigger>
          <SelectContent>
            {compatibleRunes.length === 0 ? (
              <SelectItem value="__none" disabled>No compatible runes</SelectItem>
            ) : (
              compatibleRunes.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-stone-500" data-testid="text-rune-slots-full">All rune slots used.</p>
      )}
    </div>
  );
}
