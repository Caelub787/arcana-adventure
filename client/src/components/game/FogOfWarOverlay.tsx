import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SceneWall, SceneDoor, SceneWindow, SceneLight } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';
import {
  Layers, Eye, EyeOff, Lock, Unlock, DoorOpen, DoorClosed,
  Sun, Moon, Lightbulb, Trash2, Plus, X, Square, Minus, Grid3X3
} from 'lucide-react';
import { getBlockingSegments, calculateVisionPolygon, calculateVisionInLight, type VisionPolygon } from '@/lib/visionEngine';
import type { MotionValue } from 'framer-motion';

const MAP_OFFSET = 9000;

type WallType = 'solid' | 'transparent' | 'one_way' | 'invisible';

const WALL_COLORS: Record<WallType, string> = {
  solid: '#f59e0b',
  transparent: '#06b6d4',
  one_way: '#a855f7',
  invisible: '#9ca3af',
};

const WALL_LABELS: Record<WallType, string> = {
  solid: 'Solid',
  transparent: 'Transparent',
  one_way: 'One-Way',
  invisible: 'Invisible',
};

function snapToGrid(val: number, gridSize: number): number {
  return Math.round(val / gridSize) * gridSize;
}

function findNearestEndpoint(
  x: number, y: number,
  walls: Array<{x1: number; y1: number; x2: number; y2: number}>,
  doors: Array<{x1: number; y1: number; x2: number; y2: number}>,
  windows: Array<{x1: number; y1: number; x2: number; y2: number}>,
  lights: Array<{x: number; y: number}>,
  threshold: number
): {x: number; y: number} | null {
  let bestX = 0, bestY = 0, bestDist = threshold;
  let found = false;

  const allPoints: Array<{x: number; y: number}> = [];
  for (const w of walls) {
    allPoints.push({x: w.x1, y: w.y1}, {x: w.x2, y: w.y2});
  }
  for (const d of doors) {
    allPoints.push({x: d.x1, y: d.y1}, {x: d.x2, y: d.y2});
  }
  for (const w of windows) {
    allPoints.push({x: w.x1, y: w.y1}, {x: w.x2, y: w.y2});
  }
  for (const l of lights) {
    allPoints.push({x: l.x, y: l.y});
  }

  for (const p of allPoints) {
    const dist = Math.hypot(x - p.x, y - p.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestX = p.x;
      bestY = p.y;
      found = true;
    }
  }

  return found ? { x: bestX, y: bestY } : null;
}

interface FogToken {
  id: string;
  x: number;
  y: number;
  characterId?: string | null;
  isBlind?: boolean;
  visionOverrideDistance?: number | null;
  visionOverrideType?: string | null;
  lightRadius?: number | null;
}

interface FogCharacter {
  id: string;
  userId?: string | null;
  visionType?: string;
  dayVisionDistance?: number;
  nightVisionDistance?: number;
}

interface FogOfWarOverlayProps {
  scene: any;
  isGM: boolean;
  gridSize: number;
  fogToolActive: boolean;
  onFogToolToggle: (active: boolean) => void;
  tokens?: FogToken[];
  characters?: FogCharacter[];
  currentUserId?: string | null;
  onVisionPolygonsChange?: (polygons: VisionPolygon[]) => void;
  showDrawingTools?: boolean;
  gmSeeAsPlayer?: boolean;
  selectedTokenId?: string | null;
  gmSeeAllVision?: boolean;
  onFogRenderData?: (data: {
    visionPolygons: VisionPolygon[];
    lightVisionPolygons: VisionPolygon[];
    exploredCells: Set<string>;
  }) => void;
}

export function FogOfWarOverlay({ scene, isGM, gridSize, fogToolActive, onFogToolToggle, tokens = [], characters = [], currentUserId, onVisionPolygonsChange, showDrawingTools = true, gmSeeAsPlayer = false, selectedTokenId, gmSeeAllVision = false, onFogRenderData }: FogOfWarOverlayProps) {
  const queryClient = useQueryClient();
  const sceneId = scene?.id;

  const { data: walls = [] } = useQuery<SceneWall[]>({
    queryKey: ['scene-walls', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/walls`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const { data: doors = [] } = useQuery<SceneDoor[]>({
    queryKey: ['scene-doors', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/doors`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const { data: windows = [] } = useQuery<SceneWindow[]>({
    queryKey: ['scene-windows', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/windows`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const { data: lights = [] } = useQuery<SceneLight[]>({
    queryKey: ['scene-lights', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/lights`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const { data: visionZones = [] } = useQuery<Array<{ id: string; mode: string; points: string }>>({
    queryKey: ['scene-vision-zones', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/vision-zones`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const toggleDoorMutation = useMutation({
    mutationFn: async ({ doorId, shiftKey }: { doorId: string; shiftKey: boolean }) => {
      const door = doors.find(d => d.id === doorId);
      if (!door) return;
      if (shiftKey) {
        const res = await fetch(`/api/doors/${doorId}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ blocksVisionWhenClosed: !door.blocksVisionWhenClosed }),
        });
        if (!res.ok) throw new Error('Failed to toggle door vision');
        return res.json();
      } else {
        const res = await fetch(`/api/doors/${doorId}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isOpen: !door.isOpen }),
        });
        if (!res.ok) throw new Error('Failed to toggle door');
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-doors', sceneId] });
    },
  });

  const campaignId = scene?.campaignId;
  const fogEnabled = scene?.fogEnabled ?? false;
  const fogOpacity = scene?.fogOpacity ?? 0.85;

  const { data: traitVisionModifiers = {} } = useQuery<Record<string, { dayBonus: number; nightBonus: number }>>({
    queryKey: ['trait-vision-modifiers', campaignId],
    queryFn: async () => {
      if (!campaignId) return {};
      const res = await fetch(`/api/campaigns/${campaignId}/trait-vision-modifiers`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!campaignId && fogEnabled,
    staleTime: 30000,
  });

  const renderWalls = useMemo(() => {
    if (!isGM) return null;
    return walls.map((wall) => {
      const color = WALL_COLORS[(wall.wallType as WallType) || 'solid'];
      const isDashed = wall.wallType === 'transparent' || wall.wallType === 'invisible';
      const opacity = wall.wallType === 'invisible' ? 0.3 : 0.9;

      return (
        <line
          key={`wall-${wall.id}`}
          x1={wall.x1 + MAP_OFFSET}
          y1={wall.y1 + MAP_OFFSET}
          x2={wall.x2 + MAP_OFFSET}
          y2={wall.y2 + MAP_OFFSET}
          stroke={color}
          strokeWidth={3}
          strokeOpacity={isGM ? opacity : 0}
          strokeDasharray={isDashed ? '8 4' : undefined}
          strokeLinecap="round"
          data-testid={`wall-${wall.id}`}
        />
      );
    });
  }, [walls, isGM, fogEnabled]);

  const renderDoors = useMemo(() => {
    if (!isGM && fogEnabled) return null;
    return doors.map((door) => {
      const color = door.isOpen ? '#22c55e' : '#ef4444';
      const dashArray = door.isOpen ? '6 4' : undefined;
      const mx = (door.x1 + door.x2) / 2 + MAP_OFFSET;
      const my = (door.y1 + door.y2) / 2 + MAP_OFFSET;
      const dx = door.x2 - door.x1;
      const dy = door.y2 - door.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const arcRadius = len * 0.3;
      const perpX = len > 0 ? (-dy / len) * arcRadius : 0;
      const perpY = len > 0 ? (dx / len) * arcRadius : 0;

      return (
        <g key={`door-${door.id}`} data-testid={`door-${door.id}`}>
          <line
            x1={door.x1 + MAP_OFFSET}
            y1={door.y1 + MAP_OFFSET}
            x2={door.x2 + MAP_OFFSET}
            y2={door.y2 + MAP_OFFSET}
            stroke={color}
            strokeWidth={5}
            strokeDasharray={dashArray}
            strokeLinecap="round"
          />
          <path
            d={`M ${mx - perpX * 0.5} ${my - perpY * 0.5} Q ${mx + perpX} ${my + perpY} ${mx + perpX * 0.5} ${my + perpY * 0.5}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeOpacity={0.6}
          />
          {door.isLocked && (
            <circle
              cx={mx}
              cy={my}
              r={6}
              fill="#ef4444"
              stroke="#991b1b"
              strokeWidth={1.5}
            />
          )}
          {isGM && !door.blocksVisionWhenClosed && (
            <circle
              cx={mx}
              cy={my}
              r={5}
              fill="#06b6d4"
              stroke="#0891b2"
              strokeWidth={1.5}
              fillOpacity={0.8}
            />
          )}
          {isGM && (
            <rect
              x={Math.min(door.x1, door.x2) + MAP_OFFSET - 12}
              y={Math.min(door.y1, door.y2) + MAP_OFFSET - 12}
              width={Math.abs(door.x2 - door.x1) + 24}
              height={Math.abs(door.y2 - door.y1) + 24}
              fill="transparent"
              stroke="none"
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleDoorMutation.mutate({ doorId: door.id, shiftKey: e.shiftKey });
              }}
              data-testid={`door-toggle-${door.id}`}
            />
          )}
        </g>
      );
    });
  }, [doors, isGM, toggleDoorMutation]);

  const renderWindows = useMemo(() => {
    if (!isGM && fogEnabled) return null;
    return windows.map((win) => {
      const color = '#3b82f6';
      const dashArray = win.shutterClosed ? undefined : '6 3';
      const mx = (win.x1 + win.x2) / 2 + MAP_OFFSET;
      const my = (win.y1 + win.y2) / 2 + MAP_OFFSET;
      const dx = win.x2 - win.x1;
      const dy = win.y2 - win.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const perpX = len > 0 ? (-dy / len) * 6 : 0;
      const perpY = len > 0 ? (dx / len) * 6 : 0;

      return (
        <g key={`window-${win.id}`} data-testid={`window-${win.id}`}>
          <line
            x1={win.x1 + MAP_OFFSET}
            y1={win.y1 + MAP_OFFSET}
            x2={win.x2 + MAP_OFFSET}
            y2={win.y2 + MAP_OFFSET}
            stroke={color}
            strokeWidth={3}
            strokeDasharray={dashArray}
            strokeLinecap="round"
          />
          <line
            x1={mx - perpX}
            y1={my - perpY}
            x2={mx + perpX}
            y2={my + perpY}
            stroke={color}
            strokeWidth={2}
            strokeOpacity={0.7}
          />
        </g>
      );
    });
  }, [windows]);

  const lightGradientDefs = useMemo(() => {
    if (!isGM || (!isGM && fogEnabled)) return null;
    const enabledLights = lights.filter(l => l.enabled);
    if (enabledLights.length === 0) return null;
    return (
      <defs>
        {enabledLights.map((light) => (
          <radialGradient key={`light-grad-${light.id}`} id={`light-grad-${light.id}`}>
            <stop offset="0%" stopColor={light.color} stopOpacity={light.intensity * 0.3} />
            <stop offset="100%" stopColor={light.color} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
    );
  }, [lights, isGM, fogEnabled]);

  const renderLights = useMemo(() => {
    if (!isGM && fogEnabled) return null;
    return lights.filter(l => l.enabled).map((light) => {
      const cx = light.x + MAP_OFFSET;
      const cy = light.y + MAP_OFFSET;

      return (
        <g key={`light-${light.id}`} data-testid={`light-${light.id}`}>
          {isGM && (
            <>
              <circle
                cx={cx}
                cy={cy}
                r={12}
                fill={`url(#light-grad-${light.id})`}
              />
              <circle
                cx={cx}
                cy={cy}
                r={6}
                fill={light.color}
                stroke="#fff"
                strokeWidth={1.5}
                strokeOpacity={0.8}
              />
            </>
          )}
        </g>
      );
    });
  }, [lights, gridSize, isGM, fogEnabled]);

  function isTokenIndoor(tokenX: number, tokenY: number, zones: Array<{ mode: string; points: string }>): boolean | null {
    for (let i = zones.length - 1; i >= 0; i--) {
      const pts: Array<{x: number; y: number}> = JSON.parse(zones[i].points || '[]');
      if (pts.length < 3) continue;
      if (isPointInPoly(tokenX, tokenY, pts)) {
        return zones[i].mode === 'indoor';
      }
    }
    return null;
  }

  const renderZones = useMemo(() => {
    if (!isGM) return null;
    return visionZones.map((zone) => {
      const pts: Array<{x: number; y: number}> = JSON.parse(zone.points || '[]');
      if (pts.length < 3) return null;
      const polyPoints = pts.map(p => `${p.x + MAP_OFFSET},${p.y + MAP_OFFSET}`).join(' ');
      return (
        <polygon
          key={`zone-${zone.id}`}
          points={polyPoints}
          fill={zone.mode === 'indoor' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(245, 158, 11, 0.1)'}
          stroke={zone.mode === 'indoor' ? '#9333ea' : '#f59e0b'}
          strokeWidth={1.5}
          strokeDasharray="8 4"
          strokeOpacity={0.5}
          data-testid={`vision-zone-${zone.id}`}
        />
      );
    });
  }, [visionZones, isGM]);

  const blockingSegs = useMemo(() => {
    if (!fogEnabled) return [];
    return getBlockingSegments(
      walls.map(w => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, oneWayDirection: w.oneWayDirection })),
      doors.map(d => ({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, isOpen: d.isOpen, blocksVisionWhenClosed: d.blocksVisionWhenClosed })),
      windows.map(w => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, shutterClosed: w.shutterClosed }))
    );
  }, [fogEnabled, walls, doors, windows]);

  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  const tokenPositionKey = useMemo(() => {
    if (!fogEnabled) return '';
    return tokens.map(t => `${t.id}:${t.x}:${t.y}:${t.characterId}:${(t as any).isBlind}:${t.visionOverrideDistance}:${t.visionOverrideType}`).join('|');
  }, [fogEnabled, tokens]);

  const [debouncedTokenKey, setDebouncedTokenKey] = useState(tokenPositionKey);
  const tokenKeyTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (tokenKeyTimerRef.current) {
      clearTimeout(tokenKeyTimerRef.current);
    }
    tokenKeyTimerRef.current = setTimeout(() => {
      setDebouncedTokenKey(tokenPositionKey);
    }, 100);
    return () => {
      if (tokenKeyTimerRef.current) clearTimeout(tokenKeyTimerRef.current);
    };
  }, [tokenPositionKey]);

  const visionPolygons = useMemo(() => {
    if (!fogEnabled) return [];
    if (isGM && !gmSeeAsPlayer) return [];
    
    const isDayTime = scene?.isDayTime ?? true;
    const polys: VisionPolygon[] = [];
    const currentTokens = tokensRef.current;
    
    let playerTokens: FogToken[];
    if (gmSeeAllVision) {
      playerTokens = currentTokens;
    } else if (selectedTokenId) {
      playerTokens = currentTokens.filter(t => t.id === selectedTokenId);
    } else {
      playerTokens = [];
    }
    
    for (const token of playerTokens) {
      if ((token as any).isBlind) continue;
      
      const character = token.characterId 
        ? characters.find(c => c.id === token.characterId)
        : undefined;
      
      const tokenCenterX = token.x + gridSize / 2;
      const tokenCenterY = token.y + gridSize / 2;
      const indoorOverride = isTokenIndoor(tokenCenterX, tokenCenterY, visionZones);
      const effectiveDayTime = indoorOverride !== null 
        ? (indoorOverride ? false : true)
        : isDayTime;
      
      let dayVisionFeet: number;
      let nightVisionFeet: number;
      if (token.visionOverrideDistance != null) {
        dayVisionFeet = nightVisionFeet = token.visionOverrideDistance;
      } else if (character) {
        const traitMods = traitVisionModifiers[character.id];
        dayVisionFeet = Math.max(0, (character.dayVisionDistance ?? 60) + (traitMods?.dayBonus ?? 0));
        nightVisionFeet = Math.max(0, (character.nightVisionDistance ?? 30) + (traitMods?.nightBonus ?? 0));
      } else {
        dayVisionFeet = 60;
        nightVisionFeet = 30;
      }
      
      const visionDistFeet = effectiveDayTime ? dayVisionFeet : nightVisionFeet;
      const hasZonesWithDiffVision = visionZones.length > 0 && dayVisionFeet !== nightVisionFeet;
      const maxVisionFeet = Math.max(dayVisionFeet, nightVisionFeet);
      const castDistFeet = hasZonesWithDiffVision ? maxVisionFeet : visionDistFeet;
      const castRadius = (castDistFeet / 5) * gridSize;
      
      const poly = calculateVisionPolygon(tokenCenterX, tokenCenterY, castRadius, blockingSegs);

      if (hasZonesWithDiffVision) {
        const parsedZones = visionZones.map((z: any) => ({
          mode: z.mode as string,
          pts: (typeof z.points === 'string' ? JSON.parse(z.points || '[]') : z.points) as Array<{x: number; y: number}>,
        })).filter(z => z.pts.length >= 3);

        const dayRadius = (dayVisionFeet / 5) * gridSize;
        const nightRadius = (nightVisionFeet / 5) * gridSize;

        poly.points = poly.points.map(p => {
          const dist = Math.hypot(p.x - tokenCenterX, p.y - tokenCenterY);

          let pointIsIndoor: boolean | null = null;
          for (let zi = parsedZones.length - 1; zi >= 0; zi--) {
            if (isPointInPoly(p.x, p.y, parsedZones[zi].pts)) {
              pointIsIndoor = parsedZones[zi].mode === 'indoor';
              break;
            }
          }

          const pointDayTime = pointIsIndoor !== null ? !pointIsIndoor : isDayTime;
          const targetZoneRadius = pointDayTime ? dayRadius : nightRadius;
          const tokenZoneRadius = effectiveDayTime ? dayRadius : nightRadius;
          const allowedRadius = Math.min(targetZoneRadius, tokenZoneRadius);

          if (dist > allowedRadius + 1) {
            const angle = Math.atan2(p.y - tokenCenterY, p.x - tokenCenterX);
            return {
              x: tokenCenterX + Math.cos(angle) * allowedRadius,
              y: tokenCenterY + Math.sin(angle) * allowedRadius,
            };
          }
          return p;
        });

        poly.radius = (visionDistFeet / 5) * gridSize;
      }

      polys.push(poly);
    }
    
    return polys;
  }, [fogEnabled, isGM, gmSeeAsPlayer, blockingSegs, debouncedTokenKey, characters, gridSize, scene?.isDayTime, currentUserId, selectedTokenId, gmSeeAllVision, traitVisionModifiers, visionZones]);

  const cachedLightPolygons = useMemo(() => {
    if (!fogEnabled) return new Map<string, VisionPolygon>();
    const enabledLights = lights.filter(l => l.enabled);
    if (enabledLights.length === 0) return new Map<string, VisionPolygon>();

    const feetPerCell = 5;
    const cache = new Map<string, VisionPolygon>();

    for (const light of enabledLights) {
      const lightRadiusPixels = (light.radius / feetPerCell) * gridSize;
      const key = `${light.id}`;
      const poly = calculateVisionPolygon(light.x, light.y, lightRadiusPixels, blockingSegs, true);
      cache.set(key, poly);
    }

    return cache;
  }, [fogEnabled, blockingSegs, lights, gridSize]);

  const lightVisionPolygons = useMemo(() => {
    if (!fogEnabled) return [];
    if (isGM && !gmSeeAsPlayer) return [];
    
    const enabledLights = lights.filter(l => l.enabled);
    if (enabledLights.length === 0) return [];
    
    const feetPerCell = 5;
    
    const currentTokens = tokensRef.current;
    let playerTokens: FogToken[];
    if (gmSeeAllVision) {
      playerTokens = currentTokens;
    } else if (selectedTokenId) {
      playerTokens = currentTokens.filter(t => t.id === selectedTokenId);
    } else {
      playerTokens = [];
    }
    
    const polys: VisionPolygon[] = [];
    
    for (const token of playerTokens) {
      if ((token as any).isBlind) continue;
      const tokenCenterX = token.x + gridSize / 2;
      const tokenCenterY = token.y + gridSize / 2;
      
      for (const light of enabledLights) {
        const lightRadiusPixels = (light.radius / feetPerCell) * gridSize;
        const distToLight = Math.hypot(tokenCenterX - light.x, tokenCenterY - light.y);
        if (distToLight > lightRadiusPixels + 5000) continue;
        const precomputed = cachedLightPolygons.get(`${light.id}`);
        const poly = calculateVisionInLight(tokenCenterX, tokenCenterY, light.x, light.y, lightRadiusPixels, blockingSegs, precomputed);
        if (poly.points.length >= 3) {
          polys.push(poly);
        }
      }
    }
    
    return polys;
  }, [fogEnabled, isGM, gmSeeAsPlayer, blockingSegs, lights, gridSize, debouncedTokenKey, selectedTokenId, gmSeeAllVision, cachedLightPolygons]);

  const prevVisionKeyRef = useRef<string>('');
  useEffect(() => {
    const combined = [...visionPolygons, ...lightVisionPolygons];
    const key = combined.map(p => `${p.tokenX}:${p.tokenY}:${p.radius}:${p.points.length}`).join('|');
    if (key !== prevVisionKeyRef.current) {
      prevVisionKeyRef.current = key;
      onVisionPolygonsChange?.(combined);
    }
  }, [visionPolygons, lightVisionPolygons]);

  const [exploredCells, setExploredCells] = useState<Set<string>>(new Set());

  const fogExploredMemoryEnabled = scene?.fogExploredMemory ?? false;
  useEffect(() => {
    setExploredCells(new Set());
  }, [sceneId]);
  useEffect(() => {
    if (!fogExploredMemoryEnabled) {
      setExploredCells(new Set());
    }
  }, [fogExploredMemoryEnabled]);

  function isPointInPoly(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  useEffect(() => {
    if (!fogEnabled || (isGM && !gmSeeAsPlayer)) return;
    if (!scene?.fogExploredMemory) return;

    const allPolys = [...visionPolygons, ...lightVisionPolygons];
    if (allPolys.length === 0) return;

    setExploredCells(prev => {
      const newSet = new Set(prev);
      let changed = false;

      for (const poly of allPolys) {
        if (poly.points.length < 3) continue;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of poly.points) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        const cellSize = gridSize;
        const startCol = Math.floor(minX / cellSize);
        const endCol = Math.ceil(maxX / cellSize);
        const startRow = Math.floor(minY / cellSize);
        const endRow = Math.ceil(maxY / cellSize);

        for (let col = startCol; col <= endCol; col++) {
          for (let row = startRow; row <= endRow; row++) {
            const cx = (col + 0.5) * cellSize;
            const cy = (row + 0.5) * cellSize;
            if (isPointInPoly(cx, cy, poly.points)) {
              const key = `${col},${row}`;
              if (!newSet.has(key)) {
                newSet.add(key);
                changed = true;
              }
            }
          }
        }
      }

      return changed ? newSet : prev;
    });
  }, [visionPolygons, lightVisionPolygons, fogEnabled, isGM, gmSeeAsPlayer, scene?.fogExploredMemory, gridSize]);

  useEffect(() => {
    onFogRenderData?.({
      visionPolygons,
      lightVisionPolygons,
      exploredCells,
    });
  }, [visionPolygons, lightVisionPolygons, exploredCells, onFogRenderData]);

  const renderNightFilter = useMemo(() => {
    const isDayTime = scene?.isDayTime ?? true;
    if (isDayTime) return null;

    return (
      <rect
        x={0}
        y={0}
        width={20000}
        height={20000}
        fill="#0a1628"
        fillOpacity={0.35}
      />
    );
  }, [scene?.isDayTime]);

  const renderFog = useMemo(() => {
    if (!fogEnabled) return null;

    if (isGM && !gmSeeAsPlayer) {
      return (
        <rect x={0} y={0} width={20000} height={20000}
          fill="#1a1a2e" fillOpacity={0.15} data-testid="fog-gm-preview" />
      );
    }

    const fogRect = `M 0 0 L 20000 0 L 20000 20000 L 0 20000 Z`;

    const visionHoles = visionPolygons.map((poly) => {
      if (poly.points.length < 3) return '';
      const pts = poly.points.map((p, j) => 
        `${j === 0 ? 'M' : 'L'} ${p.x + MAP_OFFSET} ${p.y + MAP_OFFSET}`
      ).join(' ');
      return pts + ' Z';
    }).filter(Boolean).join(' ');

    const lightHoles = lightVisionPolygons.map((poly) => {
      if (poly.points.length < 3) return '';
      const pts = poly.points.map((p, j) => 
        `${j === 0 ? 'M' : 'L'} ${p.x + MAP_OFFSET} ${p.y + MAP_OFFSET}`
      ).join(' ');
      return pts + ' Z';
    }).filter(Boolean).join(' ');

    const allHoles = [visionHoles, lightHoles].filter(Boolean).join(' ');

    const fogExploredMemory = scene?.fogExploredMemory ?? false;
    const currentFogOpacity = scene?.fogOpacity ?? 0.85;
    const currentExploredDimness = scene?.fogExploredDimness ?? 0.5;

    if (fogExploredMemory) {
      const cellSize = gridSize;
      const exploredHoleParts: string[] = [];
      const rowMap = new Map<number, number[]>();
      exploredCells.forEach((key) => {
        const [col, row] = key.split(',').map(Number);
        if (!rowMap.has(row)) rowMap.set(row, []);
        rowMap.get(row)!.push(col);
      });

      rowMap.forEach((cols, row) => {
        cols.sort((a, b) => a - b);
        let runStart = cols[0];
        let runEnd = cols[0];

        for (let i = 1; i <= cols.length; i++) {
          if (i < cols.length && cols[i] === runEnd + 1) {
            runEnd = cols[i];
          } else {
            const x = runStart * cellSize + MAP_OFFSET;
            const y = row * cellSize + MAP_OFFSET;
            const w = (runEnd - runStart + 1) * cellSize;
            exploredHoleParts.push(`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + cellSize} L ${x} ${y + cellSize} Z`);
            if (i < cols.length) {
              runStart = cols[i];
              runEnd = cols[i];
            }
          }
        }
      });
      const exploredHoles = exploredHoleParts.join(' ');

      const unexploredPath = [fogRect, exploredHoles, allHoles].filter(Boolean).join(' ');
      const dimPath = [fogRect, allHoles].filter(Boolean).join(' ');

      return (
        <g>
          <path d={unexploredPath} fill="black" fillOpacity={1}
            fillRule="evenodd" shapeRendering="optimizeSpeed" />
          <path d={dimPath} fill="black" fillOpacity={currentExploredDimness}
            fillRule="evenodd" shapeRendering="optimizeSpeed" />
        </g>
      );
    } else {
      const fogPath = [fogRect, allHoles].filter(Boolean).join(' ');
      return (
        <path d={fogPath} fill="black" fillOpacity={currentFogOpacity}
          fillRule="evenodd" shapeRendering="optimizeSpeed" />
      );
    }
  }, [fogEnabled, isGM, gmSeeAsPlayer, visionPolygons, lightVisionPolygons, exploredCells, gridSize, scene?.fogExploredMemory, scene?.fogOpacity, scene?.fogExploredDimness]);

  if (!sceneId) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{
        width: 20000,
        height: 20000,
        left: 0,
        top: 0,
        overflow: 'hidden',
        zIndex: 5,
      }}
      shapeRendering="crispEdges"
      data-testid="fog-of-war-overlay"
    >
      {lightGradientDefs}
      {showDrawingTools && renderZones}
      {showDrawingTools && renderLights}
      {showDrawingTools && renderWalls}
      {renderDoors}
      {showDrawingTools && renderWindows}
    </svg>
  );
}

function drawVisionHoles(
  ctx: CanvasRenderingContext2D,
  polygons: VisionPolygon[],
  toX: (wx: number) => number,
  toY: (wy: number) => number
) {
  for (const poly of polygons) {
    if (poly.points.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(toX(poly.points[0].x), toY(poly.points[0].y));
    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(toX(poly.points[i].x), toY(poly.points[i].y));
    }
    ctx.closePath();
    ctx.fill();
  }
}

interface FogCanvasOverlayProps {
  fogEnabled: boolean;
  isGM: boolean;
  gmSeeAsPlayer: boolean;
  visionPolygons: VisionPolygon[];
  lightVisionPolygons: VisionPolygon[];
  exploredCells: Set<string>;
  gridSize: number;
  scene: any;
  motionX: MotionValue<number>;
  motionY: MotionValue<number>;
  motionZoom: MotionValue<number>;
  containerWidth: number;
  containerHeight: number;
}

export function FogCanvasOverlay({
  fogEnabled,
  isGM,
  gmSeeAsPlayer,
  visionPolygons,
  lightVisionPolygons,
  exploredCells,
  gridSize,
  scene,
  motionX,
  motionY,
  motionZoom,
  containerWidth,
  containerHeight,
}: FogCanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fogEnabledRef = useRef(fogEnabled);
  const isGMRef = useRef(isGM);
  const gmSeeAsPlayerRef = useRef(gmSeeAsPlayer);
  const visionPolygonsRef = useRef(visionPolygons);
  const lightVisionPolygonsRef = useRef(lightVisionPolygons);
  const exploredCellsRef = useRef(exploredCells);
  const gridSizeRef = useRef(gridSize);
  const sceneRef = useRef(scene);
  const containerWidthRef = useRef(containerWidth);
  const containerHeightRef = useRef(containerHeight);

  fogEnabledRef.current = fogEnabled;
  isGMRef.current = isGM;
  gmSeeAsPlayerRef.current = gmSeeAsPlayer;
  visionPolygonsRef.current = visionPolygons;
  lightVisionPolygonsRef.current = lightVisionPolygons;
  exploredCellsRef.current = exploredCells;
  gridSizeRef.current = gridSize;
  sceneRef.current = scene;
  containerWidthRef.current = containerWidth;
  containerHeightRef.current = containerHeight;

  useEffect(() => {
    let rafId: number;

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = containerWidthRef.current;
      const height = containerHeightRef.current;
      if (width === 0 || height === 0) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      } else {
        ctx.clearRect(0, 0, width, height);
      }

      const currentFogEnabled = fogEnabledRef.current;
      const currentIsGM = isGMRef.current;
      const currentGmSeeAsPlayer = gmSeeAsPlayerRef.current;
      const currentScene = sceneRef.current;
      const isDayTime = currentScene?.isDayTime ?? true;

      if (!currentFogEnabled && isDayTime) return;

      const panX = motionX.get();
      const panY = motionY.get();
      const zoom = motionZoom.get();

      function worldToScreenX(wx: number): number {
        return panX + (wx + 9000) * zoom - 9000;
      }
      function worldToScreenY(wy: number): number {
        return panY + (wy + 9000) * zoom - 9000;
      }

      if (!isDayTime) {
        ctx.fillStyle = 'rgba(10, 22, 40, 0.35)';
        ctx.fillRect(0, 0, width, height);
      }

      if (currentFogEnabled) {
        const currentVisionPolygons = visionPolygonsRef.current;
        const currentLightVisionPolygons = lightVisionPolygonsRef.current;
        const currentExploredCells = exploredCellsRef.current;
        const currentGridSize = gridSizeRef.current;

        if (currentIsGM && !currentGmSeeAsPlayer) {
          ctx.fillStyle = 'rgba(26, 26, 46, 0.15)';
          ctx.fillRect(0, 0, width, height);
        } else {
          const fogExploredMemory = currentScene?.fogExploredMemory ?? false;
          const currentFogOpacity = currentScene?.fogOpacity ?? 0.85;
          const currentExploredDimness = currentScene?.fogExploredDimness ?? 0.5;

          if (fogExploredMemory) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 1)';
            ctx.fillRect(0, 0, width, height);

            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0, 0, 0, 1)';

            const cellSize = currentGridSize;
            const rowMap = new Map<number, number[]>();
            currentExploredCells.forEach((key) => {
              const [col, row] = key.split(',').map(Number);
              if (!rowMap.has(row)) rowMap.set(row, []);
              rowMap.get(row)!.push(col);
            });
            rowMap.forEach((cols, row) => {
              cols.sort((a, b) => a - b);
              let runStart = cols[0];
              let runEnd = cols[0];
              for (let i = 1; i <= cols.length; i++) {
                if (i < cols.length && cols[i] === runEnd + 1) {
                  runEnd = cols[i];
                } else {
                  const sx = worldToScreenX(runStart * cellSize);
                  const sy = worldToScreenY(row * cellSize);
                  const sw = (runEnd - runStart + 1) * cellSize * zoom;
                  const sh = cellSize * zoom;
                  ctx.fillRect(sx, sy, sw, sh);
                  if (i < cols.length) {
                    runStart = cols[i];
                    runEnd = cols[i];
                  }
                }
              }
            });

            drawVisionHoles(ctx, currentVisionPolygons, worldToScreenX, worldToScreenY);
            drawVisionHoles(ctx, currentLightVisionPolygons, worldToScreenX, worldToScreenY);
            ctx.restore();

            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${currentExploredDimness})`;
            ctx.fillRect(0, 0, width, height);

            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0, 0, 0, 1)';
            drawVisionHoles(ctx, currentVisionPolygons, worldToScreenX, worldToScreenY);
            drawVisionHoles(ctx, currentLightVisionPolygons, worldToScreenX, worldToScreenY);
            ctx.restore();
          } else {
            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${currentFogOpacity})`;
            ctx.fillRect(0, 0, width, height);

            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0, 0, 0, 1)';
            drawVisionHoles(ctx, currentVisionPolygons, worldToScreenX, worldToScreenY);
            drawVisionHoles(ctx, currentLightVisionPolygons, worldToScreenX, worldToScreenY);
            ctx.restore();
          }
        }
      }
    }

    const unsubX = motionX.on('change', () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(draw); });
    const unsubY = motionY.on('change', () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(draw); });
    const unsubZ = motionZoom.on('change', () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(draw); });

    draw();

    return () => { unsubX(); unsubY(); unsubZ(); cancelAnimationFrame(rafId); };
  }, [motionX, motionY, motionZoom, fogEnabled, visionPolygons, lightVisionPolygons, exploredCells, gridSize, scene?.isDayTime, scene?.fogExploredMemory, scene?.fogOpacity, scene?.fogExploredDimness, isGM, gmSeeAsPlayer, containerWidth, containerHeight]);

  const isDayTime = scene?.isDayTime ?? true;
  if (!fogEnabled && isDayTime) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 30 }}
      data-testid="fog-canvas-overlay"
    />
  );
}

interface WallDrawingOverlayProps {
  scene: any;
  gridSize: number;
  wallDrawMode: boolean;
  selectedWallType: WallType;
  doorPlaceMode: boolean;
  windowPlaceMode: boolean;
  lightPlaceMode: boolean;
  lightRadius: number;
  lightColor: string;
  lightIntensity: number;
  onFinish?: () => void;
  snapToGrid?: boolean;
  zoneDrawMode?: boolean;
}

export function WallDrawingOverlay({
  scene,
  gridSize,
  wallDrawMode,
  selectedWallType,
  doorPlaceMode,
  windowPlaceMode,
  lightPlaceMode,
  lightRadius,
  lightColor,
  lightIntensity,
  onFinish,
  snapToGrid: snapEnabled = true,
  zoneDrawMode = false,
}: WallDrawingOverlayProps) {
  const queryClient = useQueryClient();
  const sceneId = scene?.id;
  const [wallPoints, setWallPoints] = useState<{ x: number; y: number }[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [doorStart, setDoorStart] = useState<{ x: number; y: number } | null>(null);
  const [windowStart, setWindowStart] = useState<{ x: number; y: number } | null>(null);

  const createWallMutation = useMutation({
    mutationFn: async (wall: { x1: number; y1: number; x2: number; y2: number; wallType: string }) => {
      const res = await fetch(`/api/scenes/${sceneId}/walls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...wall, sceneId, snapToGrid: true, playerVisible: true }),
      });
      if (!res.ok) throw new Error('Failed to create wall');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-walls', sceneId] });
    },
  });

  const createDoorMutation = useMutation({
    mutationFn: async (door: { x1: number; y1: number; x2: number; y2: number }) => {
      const res = await fetch(`/api/scenes/${sceneId}/doors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...door, sceneId, isOpen: false, isLocked: false, blocksVisionWhenClosed: true, blocksMovementWhenClosed: true, snapToGrid: true }),
      });
      if (!res.ok) throw new Error('Failed to create door');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-doors', sceneId] });
    },
  });

  const createWindowMutation = useMutation({
    mutationFn: async (win: { x1: number; y1: number; x2: number; y2: number }) => {
      const res = await fetch(`/api/scenes/${sceneId}/windows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...win, sceneId, shutterClosed: false, snapToGrid: true }),
      });
      if (!res.ok) throw new Error('Failed to create window');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-windows', sceneId] });
    },
  });

  const createLightMutation = useMutation({
    mutationFn: async (light: { x: number; y: number; radius: number; color: string }) => {
      const res = await fetch(`/api/scenes/${sceneId}/lights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...light, sceneId, intensity: lightIntensity, softEdge: true, flicker: false, flickerSpeed: 1.0, attachmentType: 'static', enabled: true }),
      });
      if (!res.ok) throw new Error('Failed to create light');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-lights', sceneId] });
    },
  });

  const deleteWallMutation = useMutation({
    mutationFn: async (wallId: string) => {
      const res = await fetch(`/api/walls/${wallId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete wall');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scene-walls', sceneId] }),
  });

  const deleteDoorMutation = useMutation({
    mutationFn: async (doorId: string) => {
      const res = await fetch(`/api/doors/${doorId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete door');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scene-doors', sceneId] }),
  });

  const deleteWindowMutation = useMutation({
    mutationFn: async (windowId: string) => {
      const res = await fetch(`/api/windows/${windowId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete window');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scene-windows', sceneId] }),
  });

  const deleteLightMutation = useMutation({
    mutationFn: async (lightId: string) => {
      const res = await fetch(`/api/lights/${lightId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete light');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scene-lights', sceneId] }),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      const res = await fetch(`/api/vision-zones/${zoneId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete zone');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scene-vision-zones', sceneId] }),
  });

  const { data: walls = [] } = useQuery<any[]>({
    queryKey: ['scene-walls', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/walls`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const { data: doors = [] } = useQuery<any[]>({
    queryKey: ['scene-doors', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/doors`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const { data: windowsList = [] } = useQuery<any[]>({
    queryKey: ['scene-windows', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/windows`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const { data: lightsList = [] } = useQuery<any[]>({
    queryKey: ['scene-lights', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/lights`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const { data: visionZones = [] } = useQuery<any[]>({
    queryKey: ['scene-vision-zones', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/vision-zones`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId && zoneDrawMode,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (wallPoints.length >= 2) {
          setWallPoints([]);
          toast({ title: 'Wall chain finished' });
        } else {
          setWallPoints([]);
          setDoorStart(null);
          setWindowStart(null);
        }
        onFinish?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wallPoints, onFinish]);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / (rect.width / 20000);
    const rawY = (e.clientY - rect.top) / (rect.height / 20000);

    const worldX = rawX - MAP_OFFSET;
    const worldY = rawY - MAP_OFFSET;
    let snappedX = snapEnabled ? snapToGrid(worldX, gridSize) : worldX;
    let snappedY = snapEnabled ? snapToGrid(worldY, gridSize) : worldY;

    if (e.ctrlKey || e.metaKey) {
      const nearest = findNearestEndpoint(worldX, worldY, walls, doors, windowsList, lightsList, gridSize * 1.5);
      if (nearest) {
        snappedX = nearest.x;
        snappedY = nearest.y;
      }
    }

    if (e.altKey) {
      const clickX = snappedX;
      const clickY = snappedY;
      const threshold = gridSize;
      
      const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      };
      
      let closest: { type: string; id: string; dist: number } | null = null;
      
      for (const w of walls) {
        const d = distToSegment(clickX, clickY, w.x1, w.y1, w.x2, w.y2);
        if (d < threshold && (!closest || d < closest.dist)) closest = { type: 'wall', id: w.id, dist: d };
      }
      for (const d of doors) {
        const dist = distToSegment(clickX, clickY, d.x1, d.y1, d.x2, d.y2);
        if (dist < threshold && (!closest || dist < closest.dist)) closest = { type: 'door', id: d.id, dist };
      }
      for (const w of windowsList) {
        const dist = distToSegment(clickX, clickY, w.x1, w.y1, w.x2, w.y2);
        if (dist < threshold && (!closest || dist < closest.dist)) closest = { type: 'window', id: w.id, dist };
      }
      for (const l of lightsList) {
        const dist = Math.hypot(clickX - l.x, clickY - l.y);
        if (dist < threshold && (!closest || dist < closest.dist)) closest = { type: 'light', id: l.id, dist };
      }

      if (zoneDrawMode && visionZones.length > 0) {
        for (let zi = visionZones.length - 1; zi >= 0; zi--) {
          const zone = visionZones[zi];
          const pts = zone.points as { x: number; y: number }[];
          if (pts && pts.length >= 3) {
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
              const xi = pts[i].x, yi = pts[i].y;
              const xj = pts[j].x, yj = pts[j].y;
              if (((yi > clickY) !== (yj > clickY)) && clickX < (xj - xi) * (clickY - yi) / (yj - yi) + xi) {
                inside = !inside;
              }
            }
            if (inside) {
              deleteZoneMutation.mutate(zone.id);
              return;
            }
          }
        }
      }
      
      if (closest) {
        if (closest.type === 'wall') deleteWallMutation.mutate(closest.id);
        else if (closest.type === 'door') deleteDoorMutation.mutate(closest.id);
        else if (closest.type === 'window') deleteWindowMutation.mutate(closest.id);
        else if (closest.type === 'light') deleteLightMutation.mutate(closest.id);
      }
      return;
    }

    if (wallDrawMode) {
      if (wallPoints.length > 0) {
        const lastPoint = wallPoints[wallPoints.length - 1];
        createWallMutation.mutate({
          x1: lastPoint.x,
          y1: lastPoint.y,
          x2: snappedX,
          y2: snappedY,
          wallType: selectedWallType,
        });
        if (e.shiftKey) {
          setWallPoints([{ x: snappedX, y: snappedY }]);
        } else {
          setWallPoints([]);
        }
      } else {
        setWallPoints([{ x: snappedX, y: snappedY }]);
      }
    } else if (doorPlaceMode) {
      if (!doorStart) {
        setDoorStart({ x: snappedX, y: snappedY });
      } else {
        createDoorMutation.mutate({
          x1: doorStart.x,
          y1: doorStart.y,
          x2: snappedX,
          y2: snappedY,
        });
        if (e.shiftKey) {
          setDoorStart({ x: snappedX, y: snappedY });
        } else {
          setDoorStart(null);
        }
      }
    } else if (windowPlaceMode) {
      if (!windowStart) {
        setWindowStart({ x: snappedX, y: snappedY });
      } else {
        createWindowMutation.mutate({
          x1: windowStart.x,
          y1: windowStart.y,
          x2: snappedX,
          y2: snappedY,
        });
        if (e.shiftKey) {
          setWindowStart({ x: snappedX, y: snappedY });
        } else {
          setWindowStart(null);
        }
      }
    } else if (lightPlaceMode) {
      createLightMutation.mutate({
        x: snappedX,
        y: snappedY,
        radius: lightRadius,
        color: lightColor,
      });
    }
  }, [wallDrawMode, doorPlaceMode, windowPlaceMode, lightPlaceMode, wallPoints, doorStart, windowStart, gridSize, selectedWallType, lightRadius, lightColor, lightIntensity, createWallMutation, createDoorMutation, createWindowMutation, createLightMutation, walls, doors, windowsList, lightsList, deleteWallMutation, deleteDoorMutation, deleteWindowMutation, deleteLightMutation, snapEnabled]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / (rect.width / 20000);
    const rawY = (e.clientY - rect.top) / (rect.height / 20000);

    const worldX = rawX - MAP_OFFSET;
    const worldY = rawY - MAP_OFFSET;
    let snappedX = snapEnabled ? snapToGrid(worldX, gridSize) : worldX;
    let snappedY = snapEnabled ? snapToGrid(worldY, gridSize) : worldY;

    if (e.ctrlKey || e.metaKey) {
      const nearest = findNearestEndpoint(worldX, worldY, walls, doors, windowsList, lightsList, gridSize * 1.5);
      if (nearest) {
        snappedX = nearest.x;
        snappedY = nearest.y;
      }
    }
    setMousePos({ x: snappedX, y: snappedY });
  }, [gridSize, snapEnabled, walls, doors, windowsList, lightsList]);

  const isActive = wallDrawMode || doorPlaceMode || windowPlaceMode || lightPlaceMode;
  if (!isActive || !sceneId) return null;

  const previewColor = wallDrawMode
    ? WALL_COLORS[selectedWallType]
    : doorPlaceMode
      ? '#ef4444'
      : windowPlaceMode
        ? '#3b82f6'
        : lightColor;

  return (
    <svg
      className="absolute inset-0"
      style={{
        width: 20000,
        height: 20000,
        left: 0,
        top: 0,
        overflow: 'visible',
        zIndex: 30,
        cursor: 'crosshair',
        pointerEvents: 'all',
      }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      data-testid="wall-drawing-overlay"
    >
      {wallDrawMode && wallPoints.map((pt, i) => (
        <circle
          key={`wp-${i}`}
          cx={pt.x + MAP_OFFSET}
          cy={pt.y + MAP_OFFSET}
          r={5}
          fill={WALL_COLORS[selectedWallType]}
          stroke="#fff"
          strokeWidth={1.5}
          data-testid={`wall-point-${i}`}
        />
      ))}

      {wallDrawMode && wallPoints.length > 0 && mousePos && (
        <line
          x1={wallPoints[wallPoints.length - 1].x + MAP_OFFSET}
          y1={wallPoints[wallPoints.length - 1].y + MAP_OFFSET}
          x2={mousePos.x + MAP_OFFSET}
          y2={mousePos.y + MAP_OFFSET}
          stroke={WALL_COLORS[selectedWallType]}
          strokeWidth={2}
          strokeOpacity={0.5}
          strokeDasharray="6 3"
        />
      )}

      {doorPlaceMode && doorStart && mousePos && (
        <>
          <line
            x1={doorStart.x + MAP_OFFSET}
            y1={doorStart.y + MAP_OFFSET}
            x2={mousePos.x + MAP_OFFSET}
            y2={mousePos.y + MAP_OFFSET}
            stroke="#ef4444"
            strokeWidth={4}
            strokeOpacity={0.5}
            strokeDasharray="6 3"
          />
          <circle
            cx={doorStart.x + MAP_OFFSET}
            cy={doorStart.y + MAP_OFFSET}
            r={5}
            fill="#ef4444"
            stroke="#fff"
            strokeWidth={1.5}
          />
        </>
      )}

      {windowPlaceMode && windowStart && mousePos && (
        <>
          <line
            x1={windowStart.x + MAP_OFFSET}
            y1={windowStart.y + MAP_OFFSET}
            x2={mousePos.x + MAP_OFFSET}
            y2={mousePos.y + MAP_OFFSET}
            stroke="#3b82f6"
            strokeWidth={3}
            strokeOpacity={0.5}
            strokeDasharray="6 3"
          />
          <circle
            cx={windowStart.x + MAP_OFFSET}
            cy={windowStart.y + MAP_OFFSET}
            r={5}
            fill="#3b82f6"
            stroke="#fff"
            strokeWidth={1.5}
          />
        </>
      )}

      {lightPlaceMode && mousePos && (
        <>
          <circle
            cx={mousePos.x + MAP_OFFSET}
            cy={mousePos.y + MAP_OFFSET}
            r={(lightRadius / 5) * gridSize}
            fill={lightColor}
            fillOpacity={0.15}
            stroke={lightColor}
            strokeWidth={2}
            strokeOpacity={0.4}
            strokeDasharray="8 4"
          />
          <circle
            cx={mousePos.x + MAP_OFFSET}
            cy={mousePos.y + MAP_OFFSET}
            r={6}
            fill={lightColor}
            stroke="#fff"
            strokeWidth={1.5}
          />
        </>
      )}

      {mousePos && (
        <circle
          cx={mousePos.x + MAP_OFFSET}
          cy={mousePos.y + MAP_OFFSET}
          r={3}
          fill={previewColor}
          fillOpacity={0.7}
        />
      )}
    </svg>
  );
}

interface ZoneDrawingOverlayProps {
  scene: any;
  gridSize: number;
  zoneDrawMode: boolean;
  selectedZoneMode: 'indoor' | 'outdoor';
  snapToGrid?: boolean;
  onFinish?: () => void;
}

export function ZoneDrawingOverlay({
  scene,
  gridSize,
  zoneDrawMode,
  selectedZoneMode,
  snapToGrid: snapEnabled = true,
  onFinish,
}: ZoneDrawingOverlayProps) {
  const queryClient = useQueryClient();
  const sceneId = scene?.id;
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const { data: existingZones = [] } = useQuery<any[]>({
    queryKey: ['scene-vision-zones', sceneId],
    queryFn: async () => {
      if (!sceneId) return [];
      const res = await fetch(`/api/scenes/${sceneId}/vision-zones`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId && zoneDrawMode,
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      const res = await fetch(`/api/vision-zones/${zoneId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete zone');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scene-vision-zones', sceneId] }),
  });

  const createZoneMutation = useMutation({
    mutationFn: async (zone: { points: string; mode: string; name: string }) => {
      const res = await fetch(`/api/scenes/${sceneId}/vision-zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...zone, sceneId }),
      });
      if (!res.ok) throw new Error('Failed to create vision zone');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-vision-zones', sceneId] });
      toast({ title: `${selectedZoneMode === 'indoor' ? 'Indoor' : 'Outdoor'} vision zone created` });
    },
  });

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!zoneDrawMode) return;
    e.stopPropagation();
    e.preventDefault();

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / (rect.width / 20000);
    const rawY = (e.clientY - rect.top) / (rect.height / 20000);

    let worldX = rawX - MAP_OFFSET;
    let worldY = rawY - MAP_OFFSET;

    if (snapEnabled) {
      worldX = snapToGrid(worldX, gridSize);
      worldY = snapToGrid(worldY, gridSize);
    }

    if (e.altKey && existingZones.length > 0) {
      for (let zi = existingZones.length - 1; zi >= 0; zi--) {
        const zone = existingZones[zi];
        const pts = (typeof zone.points === 'string' ? JSON.parse(zone.points || '[]') : zone.points) as { x: number; y: number }[];
        if (pts && pts.length >= 3) {
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, yi = pts[i].y;
            const xj = pts[j].x, yj = pts[j].y;
            if (((yi > worldY) !== (yj > worldY)) && worldX < (xj - xi) * (worldY - yi) / (yj - yi) + xi) {
              inside = !inside;
            }
          }
          if (inside) {
            deleteZoneMutation.mutate(zone.id);
            return;
          }
        }
      }
      return;
    }

    if (points.length >= 3) {
      const firstPoint = points[0];
      const dist = Math.hypot(worldX - firstPoint.x, worldY - firstPoint.y);
      if (dist < gridSize * 1.5) {
        const zonePoints = JSON.stringify(points);
        createZoneMutation.mutate({
          points: zonePoints,
          mode: selectedZoneMode,
          name: `${selectedZoneMode === 'indoor' ? 'Indoor' : 'Outdoor'} Zone`,
        });
        setPoints([]);
        return;
      }
    }

    setPoints(prev => [...prev, { x: worldX, y: worldY }]);
  }, [zoneDrawMode, snapEnabled, gridSize, points, selectedZoneMode, createZoneMutation, existingZones, deleteZoneMutation]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!zoneDrawMode || points.length < 3) return;
    e.stopPropagation();
    e.preventDefault();

    const zonePoints = JSON.stringify(points);
    createZoneMutation.mutate({
      points: zonePoints,
      mode: selectedZoneMode,
      name: `${selectedZoneMode === 'indoor' ? 'Indoor' : 'Outdoor'} Zone`,
    });
    setPoints([]);
  }, [zoneDrawMode, points, selectedZoneMode, createZoneMutation]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!zoneDrawMode) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / (rect.width / 20000);
    const rawY = (e.clientY - rect.top) / (rect.height / 20000);

    let worldX = rawX - MAP_OFFSET;
    let worldY = rawY - MAP_OFFSET;

    if (snapEnabled) {
      worldX = snapToGrid(worldX, gridSize);
      worldY = snapToGrid(worldY, gridSize);
    }

    setMousePos({ x: worldX, y: worldY });
  }, [zoneDrawMode, snapEnabled, gridSize]);

  useEffect(() => {
    if (!zoneDrawMode) setPoints([]);
  }, [zoneDrawMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && points.length > 0) {
        setPoints([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [points]);

  if (!zoneDrawMode || !sceneId) return null;

  return (
    <svg
      className="absolute inset-0"
      style={{
        width: 20000,
        height: 20000,
        left: 0,
        top: 0,
        overflow: 'visible',
        zIndex: 30,
        cursor: 'crosshair',
        pointerEvents: 'all',
      }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onDoubleClick={handleDoubleClick}
      data-testid="zone-drawing-overlay"
    >
      {existingZones.map((zone: any, idx: number) => {
        const pts = (typeof zone.points === 'string' ? JSON.parse(zone.points || '[]') : zone.points) as { x: number; y: number }[];
        if (pts.length < 3) return null;
        const isIndoor = zone.mode === 'indoor';
        return (
          <polygon
            key={zone.id || idx}
            points={pts.map((p: any) => `${p.x + MAP_OFFSET},${p.y + MAP_OFFSET}`).join(' ')}
            fill={isIndoor ? 'rgba(147, 51, 234, 0.1)' : 'rgba(245, 158, 11, 0.1)'}
            stroke={isIndoor ? '#9333ea' : '#f59e0b'}
            strokeWidth={1.5}
            strokeOpacity={0.5}
            strokeDasharray="4 2"
          />
        );
      })}

      {points.length > 0 && (
        <polygon
          points={points.map(p => `${p.x + MAP_OFFSET},${p.y + MAP_OFFSET}`).join(' ')}
          fill={selectedZoneMode === 'indoor' ? 'rgba(147, 51, 234, 0.15)' : 'rgba(245, 158, 11, 0.15)'}
          stroke={selectedZoneMode === 'indoor' ? '#9333ea' : '#f59e0b'}
          strokeWidth={2}
          strokeDasharray="6 3"
        />
      )}

      {points.length > 0 && mousePos && (
        <>
          <line
            x1={points[points.length - 1].x + MAP_OFFSET}
            y1={points[points.length - 1].y + MAP_OFFSET}
            x2={mousePos.x + MAP_OFFSET}
            y2={mousePos.y + MAP_OFFSET}
            stroke={selectedZoneMode === 'indoor' ? '#9333ea' : '#f59e0b'}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            strokeOpacity={0.6}
          />
          <line
            x1={mousePos.x + MAP_OFFSET}
            y1={mousePos.y + MAP_OFFSET}
            x2={points[0].x + MAP_OFFSET}
            y2={points[0].y + MAP_OFFSET}
            stroke={selectedZoneMode === 'indoor' ? '#9333ea' : '#f59e0b'}
            strokeWidth={1}
            strokeDasharray="4 2"
            strokeOpacity={0.3}
          />
        </>
      )}

      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x + MAP_OFFSET}
          cy={p.y + MAP_OFFSET}
          r={i === 0 ? 6 : 4}
          fill={i === 0 ? (selectedZoneMode === 'indoor' ? '#9333ea' : '#f59e0b') : 'white'}
          stroke={selectedZoneMode === 'indoor' ? '#9333ea' : '#f59e0b'}
          strokeWidth={1.5}
        />
      ))}

      {mousePos && (
        <circle
          cx={mousePos.x + MAP_OFFSET}
          cy={mousePos.y + MAP_OFFSET}
          r={3}
          fill={selectedZoneMode === 'indoor' ? '#9333ea' : '#f59e0b'}
          fillOpacity={0.7}
        />
      )}
    </svg>
  );
}

function VisionZonesList({ sceneId }: { sceneId: string }) {
  const queryClient = useQueryClient();
  const { data: zones = [] } = useQuery<Array<{ id: string; name: string; mode: string; points: string }>>({
    queryKey: ['scene-vision-zones', sceneId],
    queryFn: async () => {
      const res = await fetch(`/api/scenes/${sceneId}/vision-zones`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sceneId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      const res = await fetch(`/api/vision-zones/${zoneId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete zone');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-vision-zones', sceneId] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scenes/${sceneId}/vision-zones`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to clear zones');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-vision-zones', sceneId] });
    },
  });

  if (zones.length === 0) return null;

  return (
    <div className="space-y-1 border-t border-stone-700 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-stone-500 uppercase">Saved Zones</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-red-400 hover:text-red-300"
          onClick={() => clearAllMutation.mutate()}
          data-testid="clear-all-zones"
        >
          Clear All
        </Button>
      </div>
      {zones.map((zone) => (
        <div key={zone.id} className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            {zone.mode === 'indoor' ? (
              <Moon className="h-3 w-3 text-purple-400 flex-shrink-0" />
            ) : (
              <Sun className="h-3 w-3 text-amber-400 flex-shrink-0" />
            )}
            <span className="text-[10px] text-stone-300 truncate">{zone.name || zone.mode}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-red-400 hover:text-red-300"
            onClick={() => deleteMutation.mutate(zone.id)}
            data-testid={`delete-zone-${zone.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

interface FogToolsPanelProps {
  scene: any;
  isGM: boolean;
  gridSize: number;
  fogToolActive: boolean;
  onFogToolToggle: (active: boolean) => void;
  wallDrawMode: boolean;
  setWallDrawMode: (v: boolean) => void;
  selectedWallType: WallType;
  setSelectedWallType: (v: WallType) => void;
  doorPlaceMode: boolean;
  setDoorPlaceMode: (v: boolean) => void;
  windowPlaceMode: boolean;
  setWindowPlaceMode: (v: boolean) => void;
  lightPlaceMode: boolean;
  setLightPlaceMode: (v: boolean) => void;
  lightRadius: number;
  setLightRadius: (v: number) => void;
  lightColor: string;
  setLightColor: (v: string) => void;
  lightIntensity: number;
  setLightIntensity: (v: number) => void;
  showDrawingTools: boolean;
  setShowDrawingTools: (v: boolean) => void;
  gmSeeAsPlayer?: boolean;
  onGmSeeAsPlayerChange?: (val: boolean) => void;
  gmSeeAllVision?: boolean;
  onGmSeeAllVisionChange?: (val: boolean) => void;
  snapToGrid?: boolean;
  setSnapToGrid?: (v: boolean) => void;
  zoneDrawMode?: boolean;
  setZoneDrawMode?: (v: boolean) => void;
  selectedZoneMode?: 'indoor' | 'outdoor';
  setSelectedZoneMode?: (v: 'indoor' | 'outdoor') => void;
}

export function FogToolsPanel({
  scene,
  isGM,
  gridSize,
  fogToolActive,
  onFogToolToggle,
  wallDrawMode,
  setWallDrawMode,
  selectedWallType,
  setSelectedWallType,
  doorPlaceMode,
  setDoorPlaceMode,
  windowPlaceMode,
  setWindowPlaceMode,
  lightPlaceMode,
  setLightPlaceMode,
  lightRadius,
  setLightRadius,
  lightColor,
  setLightColor,
  lightIntensity,
  setLightIntensity,
  showDrawingTools,
  setShowDrawingTools,
  gmSeeAsPlayer,
  onGmSeeAsPlayerChange,
  gmSeeAllVision,
  onGmSeeAllVisionChange,
  snapToGrid: snapEnabled = true,
  setSnapToGrid,
  zoneDrawMode,
  setZoneDrawMode,
  selectedZoneMode,
  setSelectedZoneMode,
}: FogToolsPanelProps) {
  const queryClient = useQueryClient();
  const sceneId = scene?.id;

  const panelPosRef = useRef({ x: Math.max(0, (window.innerWidth - 256) / 2), y: window.innerWidth < 640 ? 10 : Math.max(0, (window.innerHeight - 400) / 2) });
  const panelElRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: panelPosRef.current.x, origY: panelPosRef.current.y };
  }, []);

  const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !panelElRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const newX = Math.max(0, Math.min(window.innerWidth - 260, dragRef.current.origX + (e.clientX - dragRef.current.startX)));
    const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + (e.clientY - dragRef.current.startY)));
    panelPosRef.current = { x: newX, y: newY };
    panelElRef.current.style.left = `${newX}px`;
    panelElRef.current.style.top = `${newY}px`;
  }, []);

  const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  const fogEnabled = scene?.fogEnabled ?? false;
  const fogOpacity = scene?.fogOpacity ?? 0.85;
  const fogExploredDimness = scene?.fogExploredDimness ?? 0.5;
  const isDayTime = scene?.isDayTime ?? true;

  const feetPerCell = 5;

  const [localFogOpacity, setLocalFogOpacity] = useState(fogOpacity);
  const [localFogExploredDimness, setLocalFogExploredDimness] = useState(fogExploredDimness);

  useEffect(() => { setLocalFogOpacity(fogOpacity); }, [fogOpacity]);
  useEffect(() => { setLocalFogExploredDimness(fogExploredDimness); }, [fogExploredDimness]);

  const updateSceneMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await fetch(`/api/scenes/${sceneId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update scene');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${sceneId}`] });
      if (scene?.campaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${scene.campaignId}/scenes`] });
      }
    },
  });

  const clearWallsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scenes/${sceneId}/walls`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to clear walls');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-walls', sceneId] });
      toast({ title: 'All walls cleared' });
    },
  });

  const clearDoorsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scenes/${sceneId}/doors`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to clear doors');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-doors', sceneId] });
      toast({ title: 'All doors cleared' });
    },
  });

  const clearWindowsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scenes/${sceneId}/windows`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to clear windows');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-windows', sceneId] });
      toast({ title: 'All windows cleared' });
    },
  });

  const clearLightsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/scenes/${sceneId}/lights`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to clear lights');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-lights', sceneId] });
      toast({ title: 'All lights cleared' });
    },
  });

  const clearMode = useCallback(() => {
    setWallDrawMode(false);
    setDoorPlaceMode(false);
    setWindowPlaceMode(false);
    setLightPlaceMode(false);
    setZoneDrawMode?.(false);
  }, [setWallDrawMode, setDoorPlaceMode, setWindowPlaceMode, setLightPlaceMode, setZoneDrawMode]);

  const activateWallMode = useCallback(() => {
    clearMode();
    setWallDrawMode(true);
  }, [clearMode, setWallDrawMode]);

  const activateDoorMode = useCallback(() => {
    clearMode();
    setDoorPlaceMode(true);
  }, [clearMode, setDoorPlaceMode]);

  const activateWindowMode = useCallback(() => {
    clearMode();
    setWindowPlaceMode(true);
  }, [clearMode, setWindowPlaceMode]);

  const activateLightMode = useCallback(() => {
    clearMode();
    setLightPlaceMode(true);
  }, [clearMode, setLightPlaceMode]);

  if (!isGM || !fogToolActive) return null;

  const wallTypes: WallType[] = ['solid', 'transparent', 'one_way', 'invisible'];

  return (
    <div
      ref={panelElRef}
      className="fixed z-[80] w-64 rounded-lg border border-stone-700 bg-stone-900/95 shadow-2xl backdrop-blur-sm"
      style={{ left: panelPosRef.current.x, top: panelPosRef.current.y, maxHeight: 'calc(100vh - 20px)', overflowY: 'auto', touchAction: 'none' }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      data-testid="fog-tools-panel"
    >
      <div
        ref={dragHandleRef}
        className="flex items-center justify-between border-b border-stone-700 px-3 py-2 cursor-grab active:cursor-grabbing select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerUp}
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-200">Fog of War</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-stone-400 hover:text-stone-200"
          onClick={() => {
            clearMode();
            onFogToolToggle(false);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid="close-fog-panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-300">Fog Enabled</span>
          <Button
            variant={fogEnabled ? 'default' : 'outline'}
            size="sm"
            className={fogEnabled
              ? 'h-7 bg-amber-600 hover:bg-amber-700 text-white text-xs'
              : 'h-7 border-stone-600 text-stone-400 text-xs'}
            onClick={() => updateSceneMutation.mutate({ fogEnabled: !fogEnabled })}
            data-testid="toggle-fog-enabled"
          >
            {fogEnabled ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
            {fogEnabled ? 'On' : 'Off'}
          </Button>
        </div>

        {fogEnabled && (
          <Button
            variant="outline"
            size="sm"
            className={`h-7 w-full text-xs ${gmSeeAsPlayer ? 'bg-cyan-900/50 border-cyan-600 text-cyan-300' : 'border-stone-600 text-stone-400'}`}
            onClick={() => onGmSeeAsPlayerChange?.(!gmSeeAsPlayer)}
            data-testid="toggle-gm-see-as-player"
          >
            <Eye className="h-3 w-3 mr-1" />
            {gmSeeAsPlayer ? 'Seeing as Player' : 'See as Player'}
          </Button>
        )}

        {fogEnabled && gmSeeAsPlayer && (
          <Button
            variant="outline"
            size="sm"
            className={`h-7 w-full text-xs ${gmSeeAllVision ? 'bg-purple-900/50 border-purple-600 text-purple-300' : 'border-stone-600 text-stone-400'}`}
            onClick={() => onGmSeeAllVisionChange?.(!gmSeeAllVision)}
            data-testid="toggle-gm-see-all-vision"
          >
            <Layers className="h-3 w-3 mr-1" />
            {gmSeeAllVision ? 'All Token Vision' : 'See All Vision'}
          </Button>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-300">Show Tools</span>
          <Button
            variant={showDrawingTools ? 'default' : 'outline'}
            size="sm"
            className={showDrawingTools
              ? 'h-7 bg-stone-600 hover:bg-stone-700 text-white text-xs'
              : 'h-7 border-stone-600 text-stone-400 text-xs'}
            onClick={() => setShowDrawingTools(!showDrawingTools)}
            data-testid="toggle-show-drawing-tools"
          >
            {showDrawingTools ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
            {showDrawingTools ? 'Visible' : 'Hidden'}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-300">Day/Night</span>
          <Button
            variant="outline"
            size="sm"
            className={isDayTime
              ? 'h-7 border-amber-600 text-amber-300 text-xs'
              : 'h-7 border-purple-600 text-purple-300 text-xs'}
            onClick={() => updateSceneMutation.mutate({ isDayTime: !isDayTime })}
            data-testid="toggle-day-night"
          >
            {isDayTime ? <Sun className="h-3 w-3 mr-1" /> : <Moon className="h-3 w-3 mr-1" />}
            {isDayTime ? 'Day' : 'Night'}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-300">Explored Memory</span>
          <Button
            variant="outline"
            size="sm"
            className={scene?.fogExploredMemory
              ? 'h-7 border-green-600 text-green-300 text-xs'
              : 'h-7 border-stone-600 text-stone-400 text-xs'}
            onClick={() => updateSceneMutation.mutate({ fogExploredMemory: !scene?.fogExploredMemory })}
            data-testid="toggle-explored-memory"
          >
            {scene?.fogExploredMemory ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
            {scene?.fogExploredMemory ? 'On' : 'Off'}
          </Button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-300">Fog Opacity</span>
            <span className="text-xs text-stone-500">{Math.round(localFogOpacity * 100)}%</span>
          </div>
          <Slider
            value={[localFogOpacity * 100]}
            min={10}
            max={100}
            step={5}
            onValueChange={(v) => setLocalFogOpacity(v[0] / 100)}
            onValueCommit={(v) => updateSceneMutation.mutate({ fogOpacity: v[0] / 100 })}
            data-testid="slider-fog-opacity"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-300">Explored Dimness</span>
            <span className="text-xs text-stone-500">{Math.round(localFogExploredDimness * 100)}%</span>
          </div>
          <Slider
            value={[localFogExploredDimness * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={(v) => setLocalFogExploredDimness(v[0] / 100)}
            onValueCommit={(v) => updateSceneMutation.mutate({ fogExploredDimness: v[0] / 100 })}
            data-testid="slider-explored-dimness"
          />
        </div>

        <div className="border-t border-stone-700 pt-2">
          <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Drawing Tools</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-300">Snap to Grid</span>
          <Button
            variant={snapEnabled ? 'default' : 'outline'}
            size="sm"
            className={snapEnabled
              ? 'h-7 bg-stone-600 hover:bg-stone-700 text-white text-xs'
              : 'h-7 border-stone-600 text-stone-400 text-xs'}
            onClick={() => setSnapToGrid?.(!snapEnabled)}
            data-testid="toggle-snap-to-grid"
          >
            <Grid3X3 className="h-3 w-3 mr-1" />
            {snapEnabled ? 'On' : 'Off'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant={wallDrawMode ? 'default' : 'outline'}
            size="sm"
            className={wallDrawMode
              ? 'h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs'
              : 'h-8 border-stone-600 text-stone-300 hover:text-white text-xs'}
            onClick={wallDrawMode ? () => setWallDrawMode(false) : activateWallMode}
            data-testid="toggle-wall-draw"
          >
            <Square className="h-3 w-3 mr-1" />
            Walls
          </Button>
          <Button
            variant={doorPlaceMode ? 'default' : 'outline'}
            size="sm"
            className={doorPlaceMode
              ? 'h-8 bg-red-600 hover:bg-red-700 text-white text-xs'
              : 'h-8 border-stone-600 text-stone-300 hover:text-white text-xs'}
            onClick={doorPlaceMode ? () => setDoorPlaceMode(false) : activateDoorMode}
            data-testid="toggle-door-place"
          >
            <DoorClosed className="h-3 w-3 mr-1" />
            Doors
          </Button>
          <Button
            variant={windowPlaceMode ? 'default' : 'outline'}
            size="sm"
            className={windowPlaceMode
              ? 'h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs'
              : 'h-8 border-stone-600 text-stone-300 hover:text-white text-xs'}
            onClick={windowPlaceMode ? () => setWindowPlaceMode(false) : activateWindowMode}
            data-testid="toggle-window-place"
          >
            <Minus className="h-3 w-3 mr-1" />
            Windows
          </Button>
          <Button
            variant={lightPlaceMode ? 'default' : 'outline'}
            size="sm"
            className={lightPlaceMode
              ? 'h-8 bg-yellow-600 hover:bg-yellow-700 text-white text-xs'
              : 'h-8 border-stone-600 text-stone-300 hover:text-white text-xs'}
            onClick={lightPlaceMode ? () => setLightPlaceMode(false) : activateLightMode}
            data-testid="toggle-light-place"
          >
            <Lightbulb className="h-3 w-3 mr-1" />
            Lights
          </Button>
          <Button
            variant={zoneDrawMode ? 'default' : 'outline'}
            size="sm"
            className={zoneDrawMode
              ? 'h-8 bg-teal-600 hover:bg-teal-700 text-white text-xs'
              : 'h-8 border-stone-600 text-stone-300 hover:text-white text-xs'}
            onClick={() => {
              if (zoneDrawMode) {
                setZoneDrawMode?.(false);
              } else {
                clearMode();
                setZoneDrawMode?.(true);
              }
            }}
            data-testid="toggle-zone-draw"
          >
            <Square className="h-3 w-3 mr-1" />
            Zones
          </Button>
        </div>

        {wallDrawMode && (
          <div className="space-y-1.5 rounded border border-stone-700 bg-stone-800/50 p-2">
            <span className="text-xs text-stone-400">Wall Type</span>
            <div className="grid grid-cols-2 gap-1">
              {wallTypes.map((wt) => (
                <Button
                  key={wt}
                  variant={selectedWallType === wt ? 'default' : 'ghost'}
                  size="sm"
                  className={selectedWallType === wt
                    ? 'h-6 text-[10px] text-white'
                    : 'h-6 text-[10px] text-stone-400 hover:text-white'}
                  style={selectedWallType === wt ? { backgroundColor: WALL_COLORS[wt] } : undefined}
                  onClick={() => setSelectedWallType(wt)}
                  data-testid={`wall-type-${wt}`}
                >
                  {WALL_LABELS[wt]}
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-stone-500 mt-1">Click twice for single wall. Hold Shift to chain walls.</p>
          </div>
        )}

        {lightPlaceMode && (
          <div className="space-y-2 rounded border border-stone-700 bg-stone-800/50 p-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">Light Radius</span>
                <span className="text-xs text-stone-500">{lightRadius}ft</span>
              </div>
              <Slider
                value={[lightRadius]}
                min={5}
                max={120}
                step={5}
                onValueChange={(v) => setLightRadius(v[0])}
                data-testid="slider-light-radius"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400">Brightness</span>
                <span className="text-xs text-stone-500">{Math.round(lightIntensity * 100)}%</span>
              </div>
              <Slider
                value={[lightIntensity * 100]}
                min={10}
                max={200}
                step={10}
                onValueChange={(v) => setLightIntensity(v[0] / 100)}
                data-testid="slider-light-intensity"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">Color</span>
              <input
                type="color"
                value={lightColor}
                onChange={(e) => setLightColor(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-stone-600 bg-transparent"
                data-testid="input-light-color"
              />
              <span className="text-[10px] text-stone-500">{lightColor}</span>
            </div>
            <p className="text-[10px] text-stone-500">Click on the map to place a light source.</p>
          </div>
        )}

        {zoneDrawMode && (
          <div className="space-y-2 rounded border border-stone-700 bg-stone-800/50 p-2">
            <div className="space-y-1">
              <span className="text-xs text-stone-400">Zone Type</span>
              <div className="grid grid-cols-2 gap-1">
                <Button
                  variant={selectedZoneMode === 'indoor' ? 'default' : 'ghost'}
                  size="sm"
                  className={selectedZoneMode === 'indoor'
                    ? 'h-6 text-[10px] bg-purple-600 text-white'
                    : 'h-6 text-[10px] text-stone-400 hover:text-white'}
                  onClick={() => setSelectedZoneMode?.('indoor')}
                  data-testid="zone-mode-indoor"
                >
                  <Moon className="h-3 w-3 mr-1" />
                  Indoor
                </Button>
                <Button
                  variant={selectedZoneMode === 'outdoor' ? 'default' : 'ghost'}
                  size="sm"
                  className={selectedZoneMode === 'outdoor'
                    ? 'h-6 text-[10px] bg-amber-600 text-white'
                    : 'h-6 text-[10px] text-stone-400 hover:text-white'}
                  onClick={() => setSelectedZoneMode?.('outdoor')}
                  data-testid="zone-mode-outdoor"
                >
                  <Sun className="h-3 w-3 mr-1" />
                  Outdoor
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-stone-500">Click to place points. Double-click or click near first point to close zone.</p>
            {sceneId && <VisionZonesList sceneId={sceneId} />}
          </div>
        )}

        <div className="border-t border-stone-700 pt-2 space-y-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full border-red-800 text-red-400 hover:bg-red-900/30 hover:text-red-300 text-xs"
            onClick={() => clearWallsMutation.mutate()}
            data-testid="clear-all-walls"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear All Walls
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full border-red-800 text-red-400 hover:bg-red-900/30 hover:text-red-300 text-xs"
            onClick={() => clearDoorsMutation.mutate()}
            data-testid="clear-all-doors"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear All Doors
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full border-red-800 text-red-400 hover:bg-red-900/30 hover:text-red-300 text-xs"
            onClick={() => clearWindowsMutation.mutate()}
            data-testid="clear-all-windows"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear All Windows
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full border-red-800 text-red-400 hover:bg-red-900/30 hover:text-red-300 text-xs"
            onClick={() => clearLightsMutation.mutate()}
            data-testid="clear-all-lights"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear All Lights
          </Button>
        </div>
      </div>
    </div>
  );
}
