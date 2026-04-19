import React, { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";

interface SpectatorBundle {
  campaign: { id: string; name: string; activeSceneId: string | null; inCombat: boolean };
  scene: {
    id: string;
    name: string;
    backgroundImage: string | null;
    gridEnabled: boolean;
    gridType: string;
    gridSize: number;
    gridColor: string;
    gridThickness: number;
    gridOpacity: number;
    gridOffsetX: number;
    gridOffsetY: number;
    defaultViewX: number;
    defaultViewY: number;
    defaultViewZoom: number;
    fogEnabled: boolean;
    fogState: string | null;
    fogOpacity: number;
    isDayTime: boolean;
    globalLightLevel: number;
  } | null;
  tokens: Array<{
    id: string;
    sceneId: string | null;
    characterId: string | null;
    type: string;
    x: number;
    y: number;
    image: string;
  }>;
  characters: Array<{
    id: string;
    name: string;
    nickname: string | null;
    portrait: string | null;
    hp?: number;
    maxHp?: number;
    energy?: number;
    maxEnergy?: number;
    mana?: number;
    maxMana?: number;
    showHpBar: boolean;
    showEnergyBar: boolean;
    showManaBar: boolean;
    race: string | null;
    size: string | null;
  }>;
}

const fetchBundle = async (token: string): Promise<SpectatorBundle> => {
  const res = await fetch(`/api/spectator/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return await res.json();
};

export default function Spectate() {
  const [match, params] = useRoute("/spectate/:token");
  const token = match ? params?.token : null;

  const { data, error, isLoading } = useQuery<SpectatorBundle>({
    queryKey: ["spectator-bundle", token],
    queryFn: () => fetchBundle(token!),
    enabled: !!token,
    refetchInterval: 2500,
    staleTime: 0,
    retry: false,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!data?.scene || !containerRef.current || imgDims.w === 0) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scale = Math.min(cw / imgDims.w, ch / imgDims.h);
    setView({
      scale,
      offsetX: (cw - imgDims.w * scale) / 2,
      offsetY: (ch - imgDims.h * scale) / 2,
    });
  }, [imgDims, data?.scene?.id]);

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-stone-300">
        Invalid spectator link.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-stone-300 gap-2" data-testid="spectator-loading">
        <Loader2 className="animate-spin h-5 w-5" /> Loading spectator view...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-stone-300 px-4 text-center" data-testid="spectator-error">
        <div>
          <h1 className="text-xl font-bold mb-2">Spectator link unavailable</h1>
          <p className="text-stone-400 text-sm">
            This share link has been revoked or the campaign no longer exists.
          </p>
        </div>
      </div>
    );
  }

  const { scene, tokens, characters, campaign } = data;
  const charMap = new Map(characters.map(c => [c.id, c]));
  const SIZE_TO_CELLS: Record<string, number> = {
    Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4,
  };

  return (
    <div className="h-screen w-screen bg-black text-stone-100 flex flex-col overflow-hidden">
      <div className="px-4 py-2 bg-stone-950 border-b border-stone-800 flex items-center gap-3 shrink-0">
        <Eye className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-medium text-stone-200" data-testid="text-spectator-campaign-name">
          {campaign.name}
        </span>
        <span className="text-xs text-stone-500">·</span>
        <span className="text-xs text-stone-400" data-testid="text-spectator-scene-name">
          {scene?.name ?? "No active scene"}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-blue-400 px-2 py-0.5 rounded border border-blue-700/50 bg-blue-900/30">
          Spectator · Read Only
        </span>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-stone-900" data-testid="spectator-map">
        {!scene && (
          <div className="absolute inset-0 flex items-center justify-center text-stone-500">
            The GM has not activated a scene yet.
          </div>
        )}
        {scene && scene.backgroundImage && (
          <>
            <img
              src={scene.backgroundImage}
              alt=""
              className="absolute top-0 left-0 select-none pointer-events-none"
              style={{
                transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`,
                transformOrigin: "top left",
                opacity: scene.isDayTime ? 1 : Math.max(0.25, scene.globalLightLevel ?? 1),
              }}
              onLoad={(e) => {
                const el = e.currentTarget;
                setImgDims({ w: el.naturalWidth, h: el.naturalHeight });
              }}
              draggable={false}
            />
            {/* Tokens overlay */}
            <div
              className="absolute top-0 left-0 pointer-events-none"
              style={{
                transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`,
                transformOrigin: "top left",
                width: imgDims.w,
                height: imgDims.h,
              }}
            >
              {tokens.map((tok) => {
                const ch = tok.characterId ? charMap.get(tok.characterId) : null;
                const sizeKey = ch?.size ?? null;
                const cells = sizeKey ? (SIZE_TO_CELLS[sizeKey] ?? 1) : 1;
                const sizePx = cells * scene.gridSize;
                const cx = tok.x * scene.gridSize;
                const cy = tok.y * scene.gridSize;
                const portrait = ch?.portrait || tok.image;
                const label = ch?.nickname || ch?.name || "";
                const hasHp = ch && typeof ch.hp === "number" && typeof ch.maxHp === "number" && ch.maxHp > 0;
                const hpPct = hasHp ? Math.max(0, Math.min(1, (ch!.hp as number) / (ch!.maxHp as number))) : 0;
                return (
                  <div
                    key={tok.id}
                    className="absolute"
                    style={{
                      left: cx,
                      top: cy,
                      width: sizePx,
                      height: sizePx,
                    }}
                    data-testid={`spectator-token-${tok.id}`}
                  >
                    <div
                      className="w-full h-full rounded-full overflow-hidden border-2"
                      style={{
                        borderColor: tok.type === "enemy" ? "#dc2626" : "#3b82f6",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      }}
                    >
                      {portrait ? (
                        <img src={portrait} className="w-full h-full object-cover" alt="" draggable={false} />
                      ) : (
                        <div className="w-full h-full bg-stone-700 flex items-center justify-center text-xs font-bold text-stone-200">
                          {label.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    {ch && ch.showHpBar !== false && hasHp && (
                      <div
                        className="absolute left-0 right-0 h-1 bg-stone-900/80 rounded overflow-hidden"
                        style={{ bottom: -6 }}
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${hpPct * 100}%`,
                            background: hpPct > 0.5 ? "#22c55e" : hpPct > 0.25 ? "#eab308" : "#dc2626",
                          }}
                        />
                      </div>
                    )}
                    {label && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2 text-[10px] font-bold text-white px-1 py-0.5 rounded bg-black/70 whitespace-nowrap max-w-[140px] truncate"
                        style={{ top: -16 }}
                      >
                        {label}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
