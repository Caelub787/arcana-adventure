import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2, MapPin } from "lucide-react";

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
  mapPins?: Array<{
    id: string;
    sceneId: string;
    x: number;
    y: number;
    label: string | null;
    icon: string | null;
    color: string | null;
    pinType: string;
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

type Directive = { follow: 'host' | 'free' | string; revealFog: boolean };

type LiveTokenPos = { x: number; y: number };
type AoeOverlay = { id: string; spellName?: string; spellAoe?: any; center: { x: number; y: number } | null; casterName?: string };
type TargetOverlay = { id: string; targetTokenId: string; characterName?: string; username?: string; expiresAt: number };
type BeaconOverlay = { id: string; gridX: number; gridY: number; color: string; expiresAt: number };

export default function Spectate() {
  const [match, params] = useRoute("/spectate/:token");
  const token = match ? params?.token : null;

  const { data, error, isLoading, refetch } = useQuery<SpectatorBundle>({
    queryKey: ["spectator-bundle", token],
    queryFn: () => fetchBundle(token!),
    enabled: !!token,
    refetchInterval: 5000,
    staleTime: 0,
    retry: false,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 1, offsetX: 0, offsetY: 0 });

  // ----- WebSocket connection (token-authed) -----
  const wsRef = useRef<WebSocket | null>(null);
  const [directive, setDirective] = useState<Directive>({ follow: 'host', revealFog: false });
  const directiveRef = useRef(directive);
  useEffect(() => { directiveRef.current = directive; }, [directive]);

  // Live overlays driven by WS events
  const [liveTokenPositions, setLiveTokenPositions] = useState<Record<string, LiveTokenPos>>({});
  const [aoeOverlays, setAoeOverlays] = useState<AoeOverlay[]>([]);
  const [targetOverlays, setTargetOverlays] = useState<TargetOverlay[]>([]);
  const [beaconOverlays, setBeaconOverlays] = useState<BeaconOverlay[]>([]);
  // Tracks last-known viewport per user, used when following a specific user
  const lastViewportsRef = useRef<Map<string, { viewportX: number; viewportY: number; viewportWidth: number; viewportHeight: number; zoom: number; at: number }>>(new Map());
  const gmUserIdRef = useRef<string | null>(null); // best-effort: captured from first viewport_update sent for 'host'
  const [followTick, setFollowTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws`;
    let socket: WebSocket | null = null;
    let pingTimer: number | null = null;
    let closed = false;
    let reconnectTimer: number | null = null;
    let backoff = 1000;

    const connect = () => {
      socket = new WebSocket(url);
      wsRef.current = socket;
      socket.onopen = () => {
        backoff = 1000;
        socket?.send(JSON.stringify({ type: 'spectator_join', token }));
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
      };
      socket.onmessage = (event) => {
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }
        switch (msg.type) {
          case 'spectator_joined':
            if (msg.directive) setDirective(msg.directive);
            if (typeof msg.gmUserId === 'string' && msg.gmUserId) {
              gmUserIdRef.current = msg.gmUserId;
              setFollowTick(t => t + 1);
            }
            break;
          case 'spectator_directive':
            if (msg.directive) setDirective(msg.directive);
            break;
          case 'token_move':
            if (msg.tokenId && typeof msg.x === 'number' && typeof msg.y === 'number') {
              setLiveTokenPositions(prev => ({ ...prev, [msg.tokenId]: { x: msg.x, y: msg.y } }));
            }
            break;
          case 'token_created':
          case 'token_deleted':
          case 'token_updated':
          case 'scene_updated':
          case 'scene_changed':
          case 'campaign_map_pin_created':
          case 'campaign_map_pin_updated':
          case 'campaign_map_pin_deleted':
            // Just trigger a bundle re-fetch; positions are authoritative
            refetch();
            break;
          case 'aoe_targeting': {
            const id = `${msg.userId || 'u'}-${msg.casterTokenId || 'c'}`;
            if (msg.active) {
              setAoeOverlays(prev => {
                const filtered = prev.filter(a => a.id !== id);
                return [...filtered, { id, spellName: msg.spellName, spellAoe: msg.spellAoe, center: msg.center || null, casterName: msg.casterName }];
              });
            } else {
              setAoeOverlays(prev => prev.filter(a => a.id !== id));
            }
            break;
          }
          case 'token_targeting': {
            if (!msg.targetTokenId) break;
            const id = `${msg.userId || 'u'}-${msg.targetTokenId}`;
            setTargetOverlays(prev => {
              const filtered = prev.filter(t => t.id !== id);
              return [...filtered, { id, targetTokenId: msg.targetTokenId, characterName: msg.characterName, username: msg.username, expiresAt: Date.now() + 4000 }];
            });
            break;
          }
          case 'beacon': {
            if (typeof msg.gridX !== 'number' || typeof msg.gridY !== 'number') break;
            const id = msg.id || `${msg.userId}-${Date.now()}`;
            setBeaconOverlays(prev => [...prev, { id, gridX: msg.gridX, gridY: msg.gridY, color: msg.beaconColor || '#FBB524', expiresAt: Date.now() + 2500 }]);
            break;
          }
          case 'viewport_update': {
            if (typeof msg.viewportX !== 'number') break;
            const userId = msg.userId;
            if (!userId) break;
            lastViewportsRef.current.set(userId, {
              viewportX: msg.viewportX,
              viewportY: msg.viewportY,
              viewportWidth: msg.viewportWidth,
              viewportHeight: msg.viewportHeight,
              zoom: msg.zoom ?? 1,
              at: Date.now(),
            });
            // If this is the GM (host), capture their userId for the 'host' follow target
            if (directiveRef.current.follow === 'host' && !gmUserIdRef.current) {
              gmUserIdRef.current = userId;
            }
            setFollowTick(t => t + 1);
            break;
          }
          default:
            break;
        }
      };
      socket.onclose = () => {
        if (pingTimer) { window.clearInterval(pingTimer); pingTimer = null; }
        wsRef.current = null;
        if (closed) return;
        reconnectTimer = window.setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 15000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try { socket?.close(); } catch {}
      wsRef.current = null;
    };
  }, [token, refetch]);

  // Expire transient overlays
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setTargetOverlays(prev => prev.filter(t => t.expiresAt > now));
      setBeaconOverlays(prev => prev.filter(b => b.expiresAt > now));
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  // Auto-fit when not following, or when no viewport data yet
  useEffect(() => {
    if (!data?.scene || !containerRef.current || imgDims.w === 0) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const fitScale = Math.min(cw / imgDims.w, ch / imgDims.h);
    const fitView = {
      scale: fitScale,
      offsetX: (cw - imgDims.w * fitScale) / 2,
      offsetY: (ch - imgDims.h * fitScale) / 2,
    };

    const followUserId =
      directive.follow === 'free' ? null :
      directive.follow === 'host' ? gmUserIdRef.current :
      directive.follow;

    if (!followUserId) {
      setView(fitView);
      return;
    }

    const vp = lastViewportsRef.current.get(followUserId);
    if (!vp) {
      setView(fitView);
      return;
    }
    // Compute scale so the followed viewport fits the container
    const vpW = Math.max(1, vp.viewportWidth);
    const vpH = Math.max(1, vp.viewportHeight);
    const scale = Math.min(cw / vpW, ch / vpH);
    const cx = vp.viewportX + vpW / 2;
    const cy = vp.viewportY + vpH / 2;
    setView({
      scale,
      offsetX: cw / 2 - cx * scale,
      offsetY: ch / 2 - cy * scale,
    });
  }, [imgDims, data?.scene?.id, directive, followTick]);

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

  const { scene, tokens, characters, campaign, mapPins } = data;
  const charMap = useMemo(() => new Map(characters.map(c => [c.id, c])), [characters]);
  const tokenMap = useMemo(() => new Map(tokens.map(t => [t.id, t])), [tokens]);
  const SIZE_TO_CELLS: Record<string, number> = {
    Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4,
  };

  // Helper to derive a token's authoritative position (live WS override > bundle)
  const livePos = (id: string, fallbackX: number, fallbackY: number) => {
    const live = liveTokenPositions[id];
    if (live) return { x: live.x, y: live.y };
    return { x: fallbackX, y: fallbackY };
  };

  // ----- AOE shape rendering (best-effort: supports radius circles, lines/cones falls back to circle) -----
  const renderAoe = (ov: AoeOverlay) => {
    if (!scene || !ov.center) return null;
    const aoe = ov.spellAoe || {};
    const radius = typeof aoe.radius === 'number' ? aoe.radius : (typeof aoe.size === 'number' ? aoe.size : 1);
    const cellsRadius = Math.max(0.5, radius);
    const px = ov.center.x * scene.gridSize;
    const py = ov.center.y * scene.gridSize;
    const sizePx = cellsRadius * 2 * scene.gridSize;
    return (
      <div
        key={ov.id}
        className="absolute rounded-full border-2 border-amber-400 bg-amber-400/20 pointer-events-none animate-pulse"
        style={{ left: px - sizePx / 2, top: py - sizePx / 2, width: sizePx, height: sizePx }}
        data-testid={`spectator-aoe-${ov.id}`}
      />
    );
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
          Spectator · Read Only · {directive.follow === 'free' ? 'Free Roam' : directive.follow === 'host' ? 'Following Host' : `Following ${directive.follow.slice(0, 6)}`}
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
            {/* World-space overlay layer */}
            <div
              className="absolute top-0 left-0 pointer-events-none"
              style={{
                transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`,
                transformOrigin: "top left",
                width: imgDims.w,
                height: imgDims.h,
              }}
            >
              {/* Map pins */}
              {(mapPins || []).map((pin) => {
                const px = pin.x * (scene.backgroundImage ? imgDims.w / 100 : scene.gridSize);
                const py = pin.y * (scene.backgroundImage ? imgDims.h / 100 : scene.gridSize);
                return (
                  <div
                    key={pin.id}
                    className="absolute -translate-x-1/2 -translate-y-full"
                    style={{ left: px, top: py }}
                    data-testid={`spectator-pin-${pin.id}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <MapPin
                        className="h-7 w-7 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                        style={{ color: pin.color || '#f59e0b', fill: pin.color || '#f59e0b' }}
                      />
                      {pin.label && (
                        <div className="text-[10px] font-bold text-white px-1 py-0.5 rounded bg-black/70 whitespace-nowrap max-w-[140px] truncate">
                          {pin.label}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* AOE overlays */}
              {aoeOverlays.map(renderAoe)}

              {/* Beacons */}
              {beaconOverlays.map((b) => {
                const px = b.gridX * scene.gridSize;
                const py = b.gridY * scene.gridSize;
                const sizePx = scene.gridSize * 1.5;
                return (
                  <div
                    key={b.id}
                    className="absolute rounded-full border-2 pointer-events-none animate-ping"
                    style={{
                      left: px - sizePx / 2,
                      top: py - sizePx / 2,
                      width: sizePx,
                      height: sizePx,
                      borderColor: b.color,
                      backgroundColor: `${b.color}33`,
                    }}
                    data-testid={`spectator-beacon-${b.id}`}
                  />
                );
              })}

              {/* Tokens */}
              {tokens.map((tok) => {
                const ch = tok.characterId ? charMap.get(tok.characterId) : null;
                const sizeKey = ch?.size ?? null;
                const cells = sizeKey ? (SIZE_TO_CELLS[sizeKey] ?? 1) : 1;
                const sizePx = cells * scene.gridSize;
                const pos = livePos(tok.id, tok.x, tok.y);
                const cx = pos.x * scene.gridSize;
                const cy = pos.y * scene.gridSize;
                const portrait = ch?.portrait || tok.image;
                const label = ch?.nickname || ch?.name || "";
                const hasHp = ch && typeof ch.hp === "number" && typeof ch.maxHp === "number" && ch.maxHp > 0;
                const hpPct = hasHp ? Math.max(0, Math.min(1, (ch!.hp as number) / (ch!.maxHp as number))) : 0;
                // Is this token currently targeted by anyone?
                const targets = targetOverlays.filter(t => t.targetTokenId === tok.id);
                return (
                  <div
                    key={tok.id}
                    className="absolute"
                    style={{ left: cx, top: cy, width: sizePx, height: sizePx, transition: 'left 0.15s linear, top 0.15s linear' }}
                    data-testid={`spectator-token-${tok.id}`}
                  >
                    <div
                      className="w-full h-full rounded-full overflow-hidden border-2"
                      style={{
                        borderColor: tok.type === "enemy" ? "#dc2626" : "#3b82f6",
                        boxShadow: targets.length > 0 ? "0 0 0 4px rgba(239,68,68,0.7), 0 2px 8px rgba(0,0,0,0.6)" : "0 2px 8px rgba(0,0,0,0.6)",
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
                      <div className="absolute left-0 right-0 h-1 bg-stone-900/80 rounded overflow-hidden" style={{ bottom: -6 }}>
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
                      <div className="absolute left-1/2 -translate-x-1/2 text-[10px] font-bold text-white px-1 py-0.5 rounded bg-black/70 whitespace-nowrap max-w-[140px] truncate" style={{ top: -16 }}>
                        {label}
                      </div>
                    )}
                    {targets.length > 0 && (
                      <div className="absolute left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-300 px-1 py-0.5 rounded bg-red-950/80 whitespace-nowrap max-w-[140px] truncate" style={{ bottom: -22 }}>
                        Targeted by {targets.map(t => t.username || t.characterName || '?').join(', ')}
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
