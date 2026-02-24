import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Package, Eye } from "lucide-react";

interface InventoryEmbedProps {
  characterId: string;
  campaignId: string;
  mode?: "compact" | "expanded";
  readOnly?: boolean;
}

const RARITY_COLORS: Record<string, string> = {
  common: "text-stone-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-amber-400",
};

export function InventoryEmbed({ characterId, campaignId, mode = "compact", readOnly = true }: InventoryEmbedProps) {
  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ["/api/campaigns", campaignId, "characters", characterId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/characters/${characterId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    enabled: !!characterId && !!campaignId,
  });

  if (isLoading) return <div className="animate-pulse bg-stone-800 rounded p-3 h-12" />;
  if (error) return <div className="text-stone-500 text-xs p-2">Inventory not available</div>;

  const equipped = items.filter((i: any) => i.isEquipped);
  const displayItems = mode === "compact" ? items.slice(0, 6) : items;

  return (
    <div className="border border-stone-700 rounded-lg bg-stone-900/80 overflow-hidden" data-testid={`inventory-embed-${characterId}`}>
      <div className="flex items-center gap-1.5 px-2 py-1 bg-stone-800/60 border-b border-stone-700">
        <Eye className="h-3 w-3 text-amber-400" />
        <span className="text-[10px] text-amber-400 font-medium tracking-wide uppercase">Linked Live Inventory</span>
        <span className="text-[10px] text-stone-500 ml-auto">{items.length} items</span>
      </div>
      <div className="p-2">
        {displayItems.length === 0 ? (
          <div className="text-stone-500 text-xs py-2 text-center">No items</div>
        ) : (
          <div className="space-y-0.5">
            {displayItems.map((item: any) => (
              <div key={item.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-stone-800/60 transition-colors" data-testid={`inventory-item-${item.id}`}>
                {item.image ? (
                  <img src={item.image} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                ) : (
                  <Package className="w-4 h-4 text-stone-500 flex-shrink-0" />
                )}
                <span className={`text-xs truncate flex-1 ${RARITY_COLORS[item.rarity] || "text-stone-300"}`}>
                  {item.name}
                </span>
                {item.quantity > 1 && (
                  <span className="text-[10px] text-stone-500">x{item.quantity}</span>
                )}
                {item.isEquipped && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-600/50 text-amber-400">E</Badge>
                )}
              </div>
            ))}
            {mode === "compact" && items.length > 6 && (
              <div className="text-center text-[10px] text-stone-500 py-1">+{items.length - 6} more</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
