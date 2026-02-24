import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Heart, Zap, Shield, Swords, Eye } from "lucide-react";

interface SheetEmbedProps {
  characterId: string;
  campaignId: string;
  mode?: "compact" | "expanded";
  readOnly?: boolean;
}

export function SheetEmbed({ characterId, campaignId, mode = "compact", readOnly = true }: SheetEmbedProps) {
  const { data: character, isLoading, error } = useQuery({
    queryKey: ["/api/campaigns", campaignId, "characters", characterId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/characters`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch characters");
      const chars = await res.json();
      return chars.find((c: any) => c.id === characterId);
    },
    enabled: !!characterId && !!campaignId,
  });

  if (isLoading) return <div className="animate-pulse bg-stone-800 rounded p-3 h-16" />;
  if (error || !character) return <div className="text-stone-500 text-xs p-2">Character not found</div>;

  const hpPercent = character.maxHp > 0 ? (character.hp / character.maxHp) * 100 : 0;
  const energyPercent = character.maxEnergy > 0 ? (character.energy / character.maxEnergy) * 100 : 0;

  return (
    <div className="border border-stone-700 rounded-lg bg-stone-900/80 overflow-hidden" data-testid={`sheet-embed-${characterId}`}>
      <div className="flex items-center gap-1.5 px-2 py-1 bg-stone-800/60 border-b border-stone-700">
        <Eye className="h-3 w-3 text-amber-400" />
        <span className="text-[10px] text-amber-400 font-medium tracking-wide uppercase">Linked Live Sheet</span>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-3">
          {character.portrait && (
            <img src={character.portrait} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-600 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-stone-200 text-sm truncate">{character.name}</div>
            <div className="text-xs text-stone-400">Lv. {character.level} {character.race}</div>
          </div>
        </div>

        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <Heart className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${hpPercent}%` }} />
            </div>
            <span className="text-xs text-stone-400 w-16 text-right">{character.hp}/{character.maxHp}</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
            <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${energyPercent}%` }} />
            </div>
            <span className="text-xs text-stone-400 w-16 text-right">{character.energy}/{character.maxEnergy}</span>
          </div>
        </div>

        {mode === "expanded" && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[
              { label: "MIG", value: character.might },
              { label: "FIN", value: character.finesse },
              { label: "WIT", value: character.wit },
              { label: "PRE", value: character.presence },
              { label: "WIL", value: character.will },
              { label: "CRA", value: character.craft },
            ].map(attr => (
              <div key={attr.label} className="bg-stone-800/60 rounded px-2 py-1 text-center">
                <div className="text-[10px] text-stone-500 uppercase">{attr.label}</div>
                <div className="text-sm font-medium text-stone-300">{attr.value >= 0 ? `+${attr.value}` : attr.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
