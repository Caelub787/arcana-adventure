import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SceneWall, SceneDoor, SceneWindow, SceneLight } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';
import {
  Layers, Eye, EyeOff, Lock, Unlock, DoorOpen, DoorClosed,
  Sun, Moon, Lightbulb, Trash2, Plus, X, Square, Minus
} from 'lucide-react';
import { getBlockingSegments, calculateVisionPolygon, type VisionPolygon } from '@/lib/visionEngine';

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
}

export function FogOfWarOverlay({ scene, isGM, gridSize, fogToolActive, onFogToolToggle, tokens = [], characters = [], currentUserId, onVisionPolygonsChange, showDrawingTools = true, gmSeeAsPlayer = false, selectedTokenId, gmSeeAllVision = false }: FogOfWarOverlayProps) {
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

  const toggleDoorMutation = useMutation({
    mutationFn: async (doorId: string) => {
      const door = doors.find(d => d.id === doorId);
      if (!door) return;
      const res = await fetch(`/api/doors/${doorId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isOpen: !door.isOpen }),
      });
      if (!res.ok) throw new Error('Failed to toggle door');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-doors', sceneId] });
    },
  });

  const fogEnabled = scene?.fogEnabled ?? false;
  const fogOpacity = scene?.fogOpacity ?? 0.85;

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
          {isGM && (
            <rect
              x={Math.min(door.x1, door.x2) + MAP_OFFSET - 4}
              y={Math.min(door.y1, door.y2) + MAP_OFFSET - 4}
              width={Math.abs(door.x2 - door.x1) + 8}
              height={Math.abs(door.y2 - door.y1) + 8}
              fill="transparent"
              stroke="none"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                toggleDoorMutation.mutate(door.id);
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

  const renderLights = useMemo(() => {
    if (!isGM && fogEnabled) return null;
    return lights.filter(l => l.enabled).map((light) => {
      const radiusPixels = (light.radius / 5) * gridSize;
      const cx = light.x + MAP_OFFSET;
      const cy = light.y + MAP_OFFSET;

      return (
        <g key={`light-${light.id}`} data-testid={`light-${light.id}`}>
          <defs>
            <radialGradient id={`light-grad-${light.id}`}>
              <stop offset="0%" stopColor={light.color} stopOpacity={light.intensity * 0.4} />
              <stop offset="70%" stopColor={light.color} stopOpacity={light.intensity * 0.15} />
              <stop offset="100%" stopColor={light.color} stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle
            cx={cx}
            cy={cy}
            r={radiusPixels}
            fill={`url(#light-grad-${light.id})`}
          />
          {isGM && (
            <circle
              cx={cx}
              cy={cy}
              r={6}
              fill={light.color}
              stroke="#fff"
              strokeWidth={1.5}
              strokeOpacity={0.8}
            />
          )}
        </g>
      );
    });
  }, [lights, gridSize, isGM]);

  const visionPolygons = useMemo(() => {
    if (!fogEnabled) return [];
    if (isGM && !gmSeeAsPlayer) return [];
    
    const blockingSegs = getBlockingSegments(
      walls.map(w => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, oneWayDirection: w.oneWayDirection })),
      doors.map(d => ({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, isOpen: d.isOpen, blocksVisionWhenClosed: d.blocksVisionWhenClosed })),
      windows.map(w => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, shutterClosed: w.shutterClosed }))
    );
    
    const isDayTime = scene?.isDayTime ?? true;
    const polys: VisionPolygon[] = [];
    
    let playerTokens: FogToken[];
    if (gmSeeAllVision) {
      playerTokens = tokens;
    } else if (selectedTokenId) {
      playerTokens = tokens.filter(t => t.id === selectedTokenId);
    } else if (currentUserId) {
      playerTokens = tokens.filter(t => {
        if (!t.characterId) return false;
        const char = characters.find(c => c.id === t.characterId);
        return char && char.userId === currentUserId;
      });
    } else {
      playerTokens = tokens;
    }
    
    for (const token of playerTokens) {
      if ((token as any).isBlind) continue;
      
      const character = token.characterId 
        ? characters.find(c => c.id === token.characterId)
        : undefined;
      
      let visionDistFeet: number;
      if (token.visionOverrideDistance != null) {
        visionDistFeet = token.visionOverrideDistance;
      } else if (character) {
        visionDistFeet = isDayTime 
          ? (character.dayVisionDistance ?? 120)
          : (character.nightVisionDistance ?? 60);
      } else {
        visionDistFeet = isDayTime ? 120 : 60;
      }
      
      const visionRadius = (visionDistFeet / 5) * gridSize;
      const tokenCenterX = token.x + gridSize / 2;
      const tokenCenterY = token.y + gridSize / 2;
      
      const poly = calculateVisionPolygon(tokenCenterX, tokenCenterY, visionRadius, blockingSegs);
      polys.push(poly);
    }
    
    return polys;
  }, [fogEnabled, isGM, gmSeeAsPlayer, walls, doors, windows, tokens, characters, gridSize, scene?.isDayTime, currentUserId, selectedTokenId, gmSeeAllVision]);

  const prevVisionPolygonsRef = useRef<string>('');
  useEffect(() => {
    const key = JSON.stringify(visionPolygons.map(p => ({ tx: p.tokenX, ty: p.tokenY, r: p.radius, n: p.points.length })));
    if (key !== prevVisionPolygonsRef.current) {
      prevVisionPolygonsRef.current = key;
      onVisionPolygonsChange?.(visionPolygons);
    }
  }, [visionPolygons]);

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
        <rect
          x={0}
          y={0}
          width={20000}
          height={20000}
          fill="#1a1a2e"
          fillOpacity={0.15}
          data-testid="fog-gm-preview"
        />
      );
    }

    const visionPathData = visionPolygons.map((poly) => {
      if (poly.points.length < 3) return '';
      const pts = poly.points.map((p, j) => 
        `${j === 0 ? 'M' : 'L'} ${p.x + MAP_OFFSET} ${p.y + MAP_OFFSET}`
      ).join(' ');
      return pts + ' Z';
    }).filter(Boolean).join(' ');

    return (
      <g>
        <defs>
          <mask id="fog-vision-mask">
            <rect x={0} y={0} width={20000} height={20000} fill="white" />
            {visionPathData && (
              <path d={visionPathData} fill="black" />
            )}
          </mask>
        </defs>
        <rect
          x={0}
          y={0}
          width={20000}
          height={20000}
          fill="black"
          fillOpacity={1}
          mask="url(#fog-vision-mask)"
        />
      </g>
    );
  }, [fogEnabled, isGM, gmSeeAsPlayer, visionPolygons]);

  if (!sceneId) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{
        width: 20000,
        height: 20000,
        left: 0,
        top: 0,
        overflow: 'visible',
        zIndex: 100,
      }}
      data-testid="fog-of-war-overlay"
    >
      {renderNightFilter}
      {renderFog}
      {showDrawingTools && renderLights}
      {showDrawingTools && renderWalls}
      {showDrawingTools && renderDoors}
      {showDrawingTools && renderWindows}
    </svg>
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
    const snappedX = snapToGrid(worldX, gridSize);
    const snappedY = snapToGrid(worldY, gridSize);

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
  }, [wallDrawMode, doorPlaceMode, windowPlaceMode, lightPlaceMode, wallPoints, doorStart, windowStart, gridSize, selectedWallType, lightRadius, lightColor, lightIntensity, createWallMutation, createDoorMutation, createWindowMutation, createLightMutation, walls, doors, windowsList, lightsList, deleteWallMutation, deleteDoorMutation, deleteWindowMutation, deleteLightMutation]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / (rect.width / 20000);
    const rawY = (e.clientY - rect.top) / (rect.height / 20000);

    const worldX = rawX - MAP_OFFSET;
    const worldY = rawY - MAP_OFFSET;
    const snappedX = snapToGrid(worldX, gridSize);
    const snappedY = snapToGrid(worldY, gridSize);
    setMousePos({ x: snappedX, y: snappedY });
  }, [gridSize]);

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
}: FogToolsPanelProps) {
  const queryClient = useQueryClient();
  const sceneId = scene?.id;

  const [panelPos, setPanelPos] = useState({ x: Math.max(0, (window.innerWidth - 256) / 2), y: Math.max(0, (window.innerHeight - 400) / 2) });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragRef.current = { startX: clientX, startY: clientY, origX: panelPos.x, origY: panelPos.y };

    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const cx = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const dx = cx - dragRef.current.startX;
      const dy = cy - dragRef.current.startY;
      setPanelPos({
        x: Math.max(0, Math.min(window.innerWidth - 260, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + dy)),
      });
    };
    const handleEnd = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);
  }, [panelPos]);

  const fogEnabled = scene?.fogEnabled ?? false;
  const fogOpacity = scene?.fogOpacity ?? 0.85;
  const fogExploredDimness = scene?.fogExploredDimness ?? 0.5;
  const isDayTime = scene?.isDayTime ?? true;

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
  }, [setWallDrawMode, setDoorPlaceMode, setWindowPlaceMode, setLightPlaceMode]);

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
      className="fixed z-[80] w-64 rounded-lg border border-stone-700 bg-stone-900/95 shadow-2xl backdrop-blur-sm"
      style={{ left: panelPos.x, top: panelPos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      data-testid="fog-tools-panel"
    >
      <div
        className="flex items-center justify-between border-b border-stone-700 px-3 py-2 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
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
          onMouseDown={(e) => e.stopPropagation()}
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
