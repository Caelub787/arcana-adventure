import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  Sword, Shield, Scroll, Map as MapIcon, Settings, 
  Users, User, Plus, Minus, LogOut, Menu, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  Heart, Zap, Backpack, Sparkles, Dice5, MessageSquare, RefreshCw, X, Trash2, Package, FolderOpen, Folder, FolderPlus, GripVertical, Lock, Unlock, Camera,
  BarChart3, Grid3X3, ScrollText, Upload, Image as ImageIcon, Layers, Search, TrendingUp, UserMinus, Ban,
  MousePointer, Target, UserCheck, Swords, ArrowRight, ArrowLeft, Eye, EyeOff, Check, Moon, Coffee, AlertTriangle, GitBranch, Star, BookOpen, Pencil, Dna, Type, Library, Filter, MoreVertical, Flame, Highlighter, Bell, BellOff, FileText, Download, Loader2
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useForm } from "react-hook-form";
import { type Scene, type Hotbar, type SystemSpecies, type FeatTreeWithData, type Feat, type FeatConnection, type CharacterFeat, type SystemSkill, type CharacterCustomSkill, type TokenEffect, type TokenActiveEffect, type ThrownItem, api, gameWs } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import parchmentTexture from "@assets/generated_images/aged_parchment_paper_texture.png";
import battleMapImage1 from "@/assets/rocky_coast_battlemap.jpg";
import warriorToken from "@assets/generated_images/top_down_warrior_token.png";
import goblinToken from "@assets/generated_images/top_down_goblin_token.png";
import { triggerSkillRollNotification, triggerRollNotification, triggerEffectRollNotification, getNotificationStyle, setNotificationStyle, type NotificationStyle } from './RollNotification';
import { ImageBrowser } from '@/components/ImageBrowser';
import { BattlemapAoeOverlay } from './BattlemapAoeOverlay';
import { type AoeTargetState, getTokensInAoe } from '@/lib/aoeHelpers';


// --- Types & Mock Data ---

type Role = "gm" | "player";

interface Character {
  name: string;
  class?: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  inventory: string[];
  level?: number;
  owner?: string;
}

interface Token {
  id: string;
  x: number;
  y: number;
  type: "player" | "enemy";
  image: string;
  characterId?: string;
}

// --- Components ---

// 1. Simplified Character Creation Modal - Only name input
interface CharacterCreationProps {
  onComplete: (char: any) => void;
  onCancel?: () => void;
}

export function CharacterCreation({ onComplete, onCancel }: CharacterCreationProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [speciesTimeout, setSpeciesTimeout] = useState(false);

  // Fetch species to get default stats (Human baseline)
  const { data: systemSpecies = [], isLoading: isLoadingSpecies, isError: isSpeciesError } = useQuery({
    queryKey: ['species'],
    queryFn: () => api.getSpecies('Arcana Adventure'),
  });
  
  // Check if Human species data is available
  const humanSpecies = systemSpecies.find((s: SystemSpecies) => s.name === 'Human');
  
  // Set a timeout to allow creation with fallback values if species fails to load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!humanSpecies) {
        setSpeciesTimeout(true);
      }
    }, 3000); // 3 second timeout before allowing fallback
    return () => clearTimeout(timer);
  }, [humanSpecies]);
  
  // Can submit if species loaded OR timeout reached (fallback mode)
  const canSubmit = !isSubmitting && name.trim() && (humanSpecies || speciesTimeout || isSpeciesError);
  const isWaitingForSpecies = isLoadingSpecies && !speciesTimeout && !humanSpecies;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    
    // Use Human species stats if available, otherwise use fallback defaults
    const defaultStats = humanSpecies ? {
      race: humanSpecies.name,
      size: humanSpecies.size,
      sizeBonus: humanSpecies.sizeBonus,
      naturalArmor: humanSpecies.naturalArmor,
      speed: humanSpecies.speed,
      flySpeed: humanSpecies.flySpeed,
      lifespan: humanSpecies.lifespan,
      hp: humanSpecies.startingHp,
      maxHp: humanSpecies.startingMaxHp,
      energy: humanSpecies.startingEnergy,
      maxEnergy: humanSpecies.startingMaxEnergy,
      featTree: humanSpecies.featTree || '',
    } : {
      race: 'Human',
      size: 'Medium',
      sizeBonus: 0,
      naturalArmor: 5,
      speed: 30,
      flySpeed: 0,
      lifespan: 100,
      hp: 20,
      maxHp: 20,
      energy: 12,
      maxEnergy: 12,
      featTree: '',
    };

    onComplete({
      name: name.trim(),
      level: 1,
      ...defaultStats,
      bonusHpFromLevelUps: 0,
      lastLevelUpRolled: 1,
      bonusEnergyFromLevelUps: 0,
      lastEnergyLevelUpRolled: 1,
      might: 0,
      finesse: 0,
      wit: 0,
      presence: 0,
      will: 0,
      craft: 0,
      skillAgility: 0,
      skillArcana: 0,
      skillCharisma: 0,
      skillConcentration: 0,
      skillDeception: 0,
      skillHistory: 0,
      skillIntimidation: 0,
      skillInvestigation: 0,
      skillMedicine: 0,
      skillPerception: 0,
      skillSleightOfHand: 0,
      skillStealth: 0,
      skillStrength: 0,
      skillWisdom: 0,
      skillCulture: 0,
      inventory: []
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md overflow-hidden rounded-lg border border-white/20 shadow-2xl"
      >
        {/* Background Texture */}
        <div className="absolute inset-0 z-0 opacity-90">
          <img src={parchmentTexture} className="h-full w-full object-cover" alt="" />
        </div>

        <div className="relative z-10 p-6 text-stone-900">
          <div className="mb-6 text-center">
            <h2 className="font-display text-3xl font-bold text-stone-900">Create Character</h2>
            <p className="text-stone-600 font-medieval mt-1">Begin your adventure</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="charName" className="text-stone-800 font-bold">Character Name</Label>
              <Input 
                id="charName" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="border-stone-400 bg-white/50 text-stone-900 text-lg py-3"
                placeholder="Enter character name..."
                required
                autoFocus
                data-testid="input-character-name"
              />
              <p className="text-xs text-stone-500">
                You can customize all other details in the character sheet after creation.
              </p>
            </div>

            <div className="flex gap-3">
              {onCancel && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  className="flex-1 bg-white/50 text-stone-800 border-stone-400"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              )}
              <Button 
                type="submit" 
                disabled={!canSubmit}
                className="flex-1 bg-stone-900 text-stone-100 hover:bg-stone-800 font-display text-lg"
                data-testid="button-create-character"
              >
                {isWaitingForSpecies ? "Loading..." : isSubmitting ? "Creating..." : "Create Character"}
              </Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// Selection mode types
export type SelectionMode = 'select' | 'target' | 'highlight';

// Other players' AoE targeting state (for displaying their AoE markers)
export interface OtherPlayerAoe {
  userId: string;
  username: string;
  active: boolean;
  spellName?: string;
  spellAoe?: string;
  casterTokenId?: string;
  casterName?: string;
  center: { x: number; y: number };
  locked: boolean;
}

// Helper to get grid span based on species size
function getTokenGridSpan(size: string | undefined): number {
  switch (size) {
    case 'Huge': return 2;
    case 'Gargantuan': return 3;
    default: return 1; // Tiny, Small, Medium, Large all use 1x1
  }
}

// 2. BattleMap
interface BattleMapProps {
  tokens: Token[];
  onMoveToken: (id: string, x: number, y: number) => void;
  onTokenClick?: (token: Token) => void;
  onTokenDoubleClick?: (token: Token) => void;
  onDeleteToken?: (tokenId: string) => void;
  role: Role;
  gridSize: number;
  backgroundImage?: string;
  scene?: Scene;
  onViewChange?: (viewState: { x: number; y: number; zoom: number }) => void;
  characters?: any[];
  allSpecies?: { name: string; size: string }[];
  selectionMode?: SelectionMode;
  targetedTokenId?: string | null;
  selectedTokenId?: string | null;
  aoeTargetState?: AoeTargetState;
  onAoeMouseMove?: (x: number, y: number) => void;
  onAoeClick?: (x: number, y: number) => void;
  otherPlayersAoe?: Map<string, OtherPlayerAoe>;
  myPermissions?: { permissions?: Record<string, string> };
  tokenActiveEffects?: Record<string, TokenActiveEffect[]>;
  allTokenEffects?: TokenEffect[];
  onApplyEffect?: (tokenId: string, effectId: string) => void;
  onRemoveEffect?: (activeEffectId: string) => void;
  onToggleInvisibility?: (tokenId: string, isInvisible: boolean) => void;
  currentTurnCharacterId?: string;
  otherPlayersTargeting?: Map<string, {
    userId: string;
    username: string;
    targetTokenId: string | null;
    characterId?: string;
    characterName?: string;
  }>;
  activeBeacons?: Array<{ id: string; gridX: number; gridY: number; username: string }>;
  onBeacon?: (cellKey: string) => void;
  otherPlayersViewports?: Map<string, {
    userId: string;
    username: string;
    viewportX: number;
    viewportY: number;
    viewportWidth: number;
    viewportHeight: number;
    zoom: number;
  }>;
  thrownItems?: ThrownItem[];
  onRefetchThrownItems?: () => void;
  onDeleteThrownItem?: (thrownItemId: string) => void;
  throwableGridTarget?: { x: number; y: number } | null;
  onGridTargetClick?: (gridX: number, gridY: number) => void;
  notesPanelOpen?: boolean;
  onNotesClick?: () => void;
}

export function BattleMap({ tokens, onMoveToken, onTokenClick, onTokenDoubleClick, onDeleteToken, role, gridSize, backgroundImage, scene, onViewChange, characters = [], allSpecies = [], selectionMode = 'select', targetedTokenId, selectedTokenId, aoeTargetState, onAoeMouseMove, onAoeClick, otherPlayersAoe, myPermissions, tokenActiveEffects, allTokenEffects, onApplyEffect, onRemoveEffect, onToggleInvisibility, currentTurnCharacterId, otherPlayersTargeting, activeBeacons, onBeacon, otherPlayersViewports, thrownItems = [], onRefetchThrownItems, onDeleteThrownItem, throwableGridTarget, onGridTargetClick, notesPanelOpen = false, onNotesClick }: BattleMapProps) {
  // Derive isGM from role prop
  const isGM = role === 'gm';
  
  // Use refs for pan/zoom to avoid re-renders during interaction
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [isPinching, setIsPinching] = useState(false);
  const [, forceUpdate] = useState(0); // Only for zoom display updates
  const initializedSceneRef = useRef<string | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState<string | null>(null);
  const [tokenToDelete, setTokenToDelete] = useState<string | null>(null);
  const [effectsDialogToken, setEffectsDialogToken] = useState<string | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Long-press delete mode for thrown items (mobile-friendly)
  const [thrownItemDeleteMode, setThrownItemDeleteMode] = useState<string | null>(null);
  const thrownItemHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup thrown item hold timer on unmount
  useEffect(() => {
    return () => {
      if (thrownItemHoldTimerRef.current) {
        clearTimeout(thrownItemHoldTimerRef.current);
      }
    };
  }, []);
  
  // Track token being dragged with its current visual position
  const [draggingToken, setDraggingToken] = useState<{ 
    id: string; 
    visualX: number; 
    visualY: number;
    startX: number;
    startY: number;
    startPointerX: number;
    startPointerY: number;
  } | null>(null);
  
  // Track animating tokens - tokens that are moving smoothly from one position to another
  // Used for remote player token movements received via WebSocket
  // Using refs to avoid stale closure issues and re-render on every frame
  type AnimatingToken = {
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    waypoints: { x: number; y: number }[];
    startTime: number;
  };
  const animatingTokensRef = useRef<Map<string, AnimatingToken>>(new Map());
  const prevTokenPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  // Simple counter to trigger re-renders during animation without storing full state
  const [animationTick, setAnimationTick] = useState(0);
  
  // Animation speed - milliseconds per grid cell
  const ANIMATION_SPEED_MS_PER_CELL = 120;
  
  // Track pending drag - only becomes actual drag when pointer moves beyond threshold
  const pendingDragRef = useRef<{
    token: Token;
    startPointerX: number;
    startPointerY: number;
  } | null>(null);
  const DRAG_THRESHOLD = 5; // Minimum pixels moved before considering it a drag
  
  // Lock state for preventing map movement
  const [isMapLocked, setIsMapLocked] = useState(false);
  const isMapLockedRef = useRef(false);
  
  // Nametag visibility toggle
  const [showNametags, setShowNametags] = useState(true);
  
  // Player viewport visibility toggle (GM only)
  const [showPlayerViewports, setShowPlayerViewports] = useState(false);
  
  // Notification style toggle (full vs compact)
  const [notificationStyle, setNotificationStyleState] = useState<NotificationStyle>(getNotificationStyle);
  
  // Gesture state machine to prevent conflicts between pan/zoom/token drag
  type GestureMode = 'idle' | 'panning' | 'pinching' | 'draggingToken';
  const gestureModeRef = useRef<GestureMode>('idle');
  
  // Custom pan state for pointer-based panning (replaces Framer Motion drag)
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const panPointerIdRef = useRef<number | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  
  // Track viewport dimensions for viewport-independent centering
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  
  // Motion values for smooth dragging without re-renders
  const motionX = useMotionValue(0);
  const motionY = useMotionValue(0);
  const motionZoom = useMotionValue(1);
  
  // Conversion functions for viewport-independent view storage
  // World coordinates = point on the map that should be at viewport center
  // Pan offsets = pixel translation applied to the container
  const MAP_OFFSET = 9000; // The container offset used in the CSS
  
  const worldToPixelOffset = (worldX: number, worldY: number, zoom: number, vpWidth: number, vpHeight: number) => {
    // Convert world center coordinates to pixel offsets
    // Formula: panX = viewportW/2 - (worldX + MAP_OFFSET) * zoom
    return {
      x: vpWidth / 2 - (worldX + MAP_OFFSET) * zoom,
      y: vpHeight / 2 - (worldY + MAP_OFFSET) * zoom
    };
  };
  
  const pixelOffsetToWorld = (panX: number, panY: number, zoom: number, vpWidth: number, vpHeight: number) => {
    // Convert pixel offsets to world center coordinates
    // Formula: worldX = (viewportW/2 - panX) / zoom - MAP_OFFSET
    return {
      x: (vpWidth / 2 - panX) / zoom - MAP_OFFSET,
      y: (vpHeight / 2 - panY) / zoom - MAP_OFFSET
    };
  };
  
  // Track stored world coordinates for recalculation on viewport changes
  const storedWorldCoordsRef = useRef<{ x: number; y: number } | null>(null);
  
  // Helper function to calculate grid-aligned waypoints for animation
  const calculateWaypoints = (fromX: number, fromY: number, toX: number, toY: number, gridSz: number): { x: number; y: number }[] => {
    const startGridX = Math.round(fromX / gridSz);
    const startGridY = Math.round(fromY / gridSz);
    const endGridX = Math.round(toX / gridSz);
    const endGridY = Math.round(toY / gridSz);
    
    const waypoints: { x: number; y: number }[] = [];
    let currentX = startGridX;
    let currentY = startGridY;
    waypoints.push({ x: currentX * gridSz, y: currentY * gridSz });
    
    // Move towards target using diagonal + straight moves
    while (currentX !== endGridX || currentY !== endGridY) {
      const dx = endGridX - currentX;
      const dy = endGridY - currentY;
      
      if (dx !== 0 && dy !== 0) {
        currentX += dx > 0 ? 1 : -1;
        currentY += dy > 0 ? 1 : -1;
      } else if (dx !== 0) {
        currentX += dx > 0 ? 1 : -1;
      } else if (dy !== 0) {
        currentY += dy > 0 ? 1 : -1;
      }
      waypoints.push({ x: currentX * gridSz, y: currentY * gridSz });
    }
    
    return waypoints;
  };
  
  // Detect token position changes and start animations for remote moves
  useEffect(() => {
    const effectiveGridSize = scene?.gridSize || gridSize;
    let startedNewAnimation = false;
    
    tokens.forEach(token => {
      const prevPos = prevTokenPositionsRef.current.get(token.id);
      const currPos = { x: token.x, y: token.y };
      
      // Skip if this token is being dragged locally
      if (draggingToken?.id === token.id) {
        prevTokenPositionsRef.current.set(token.id, currPos);
        return;
      }
      
      // Skip if already animating to this position
      const existingAnim = animatingTokensRef.current.get(token.id);
      if (existingAnim && existingAnim.toX === token.x && existingAnim.toY === token.y) {
        return;
      }
      
      // Check if position changed significantly (more than 1 pixel)
      if (prevPos && (Math.abs(prevPos.x - currPos.x) > 1 || Math.abs(prevPos.y - currPos.y) > 1)) {
        // Position changed - start animation
        const waypoints = calculateWaypoints(prevPos.x, prevPos.y, currPos.x, currPos.y, effectiveGridSize);
        
        if (waypoints.length > 1) {
          animatingTokensRef.current.set(token.id, {
            id: token.id,
            fromX: prevPos.x,
            fromY: prevPos.y,
            toX: currPos.x,
            toY: currPos.y,
            waypoints,
            startTime: performance.now()
          });
          startedNewAnimation = true;
        }
      }
      
      prevTokenPositionsRef.current.set(token.id, currPos);
    });
    
    // Clean up animations for tokens that no longer exist
    animatingTokensRef.current.forEach((_, tokenId) => {
      if (!tokens.find(t => t.id === tokenId)) {
        animatingTokensRef.current.delete(tokenId);
      }
    });
    
    // Start animation loop if we have new animations and it's not already running
    if (startedNewAnimation && !animationFrameRef.current) {
      startAnimationLoop();
    }
  }, [tokens, draggingToken?.id, scene?.gridSize, gridSize]);
  
  // Animation loop function - uses refs to avoid stale closure
  const startAnimationLoop = () => {
    const animate = () => {
      const now = performance.now();
      let anyStillAnimating = false;
      
      animatingTokensRef.current.forEach((anim, tokenId) => {
        const elapsed = now - anim.startTime;
        const totalWaypoints = anim.waypoints.length;
        const totalDuration = (totalWaypoints - 1) * ANIMATION_SPEED_MS_PER_CELL;
        
        if (elapsed >= totalDuration) {
          // Animation complete - remove
          animatingTokensRef.current.delete(tokenId);
        } else {
          anyStillAnimating = true;
        }
      });
      
      // Trigger re-render to update token positions
      setAnimationTick(t => t + 1);
      
      if (anyStillAnimating) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
  };
  
  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);
  
  // Helper to get current display position for a token (handles animation)
  const getTokenDisplayPosition = (token: Token): { x: number; y: number } => {
    // Check if being dragged
    if (draggingToken?.id === token.id) {
      return { x: draggingToken.visualX, y: draggingToken.visualY };
    }
    
    // Check if animating
    const anim = animatingTokensRef.current.get(token.id);
    if (anim) {
      const now = performance.now();
      const elapsed = now - anim.startTime;
      const totalWaypoints = anim.waypoints.length;
      const totalDuration = (totalWaypoints - 1) * ANIMATION_SPEED_MS_PER_CELL;
      
      if (elapsed < totalDuration) {
        // Calculate current position along waypoints
        const progressTotal = elapsed / ANIMATION_SPEED_MS_PER_CELL;
        const waypointIndex = Math.min(Math.floor(progressTotal), totalWaypoints - 2);
        const waypointProgress = progressTotal - waypointIndex;
        
        const fromWaypoint = anim.waypoints[waypointIndex];
        const toWaypoint = anim.waypoints[waypointIndex + 1];
        
        // Interpolate between waypoints
        return {
          x: fromWaypoint.x + (toWaypoint.x - fromWaypoint.x) * Math.min(waypointProgress, 1),
          y: fromWaypoint.y + (toWaypoint.y - fromWaypoint.y) * Math.min(waypointProgress, 1)
        };
      }
    }
    
    // Default to actual token position
    return { x: token.x, y: token.y };
  };
  
  // Update viewport size on mount and resize using ResizeObserver for accurate dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setViewportSize(prev => {
            // Only update if changed to avoid infinite loops
            if (prev.width !== width || prev.height !== height) {
              return { width, height };
            }
            return prev;
          });
        }
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  // Initialize view from scene's default values when scene changes
  // Version 0 (legacy): defaultViewX/Y are pixel offsets
  // Version 1+: defaultViewX/Y are world center coordinates
  useEffect(() => {
    if (scene && scene.id !== initializedSceneRef.current && viewportSize.width > 0) {
      const defaultZoom = scene.defaultViewZoom ?? 1;
      const viewVersion = (scene as any).defaultViewVersion ?? 0;
      
      let pixelX: number, pixelY: number;
      let worldX: number, worldY: number;
      
      if (viewVersion === 0) {
        // Legacy: stored values are pixel offsets, use directly
        pixelX = scene.defaultViewX ?? 0;
        pixelY = scene.defaultViewY ?? 0;
        // Calculate world coords for consistent parent notification
        const worldCoords = pixelOffsetToWorld(pixelX, pixelY, defaultZoom, viewportSize.width, viewportSize.height);
        worldX = worldCoords.x;
        worldY = worldCoords.y;
        // Don't store world coords for legacy - let user behavior determine future
        storedWorldCoordsRef.current = null;
        // But do set previousViewportRef so promotion path has a baseline
        previousViewportRef.current = { ...viewportSize };
      } else {
        // Version 1+: stored values are world center coordinates
        worldX = scene.defaultViewX ?? 0;
        worldY = scene.defaultViewY ?? 0;
        // Store world coords for recalculation on viewport changes
        storedWorldCoordsRef.current = { x: worldX, y: worldY };
        // Convert world center to pixel offsets based on current viewport
        const pixelOffset = worldToPixelOffset(worldX, worldY, defaultZoom, viewportSize.width, viewportSize.height);
        pixelX = pixelOffset.x;
        pixelY = pixelOffset.y;
      }
      
      panRef.current = { x: pixelX, y: pixelY };
      zoomRef.current = defaultZoom;
      motionX.set(pixelX);
      motionY.set(pixelY);
      motionZoom.set(defaultZoom);
      
      initializedSceneRef.current = scene.id;
      forceUpdate(n => n + 1);
      
      // Notify parent with world coordinates (for consistent save)
      if (onViewChange) {
        onViewChange({ x: worldX, y: worldY, zoom: defaultZoom });
      }
    }
  }, [scene, motionX, motionY, motionZoom, onViewChange, viewportSize]);
  
  // Recalculate pan when viewport changes for version-1 scenes (keeps center consistent)
  const previousViewportRef = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    // Skip if no stored world coords (legacy scene or not initialized)
    if (!storedWorldCoordsRef.current) return;
    // Skip if viewport not ready
    if (viewportSize.width === 0 || viewportSize.height === 0) return;
    // Skip if this is the first measurement (handled by initialization effect)
    if (!previousViewportRef.current) {
      previousViewportRef.current = { ...viewportSize };
      return;
    }
    // Skip if viewport hasn't actually changed
    if (previousViewportRef.current.width === viewportSize.width && 
        previousViewportRef.current.height === viewportSize.height) {
      return;
    }
    
    // Recalculate pixel offsets from stored world coords
    const { x: worldX, y: worldY } = storedWorldCoordsRef.current;
    const currentZoom = zoomRef.current;
    const pixelOffset = worldToPixelOffset(worldX, worldY, currentZoom, viewportSize.width, viewportSize.height);
    
    panRef.current = { x: pixelOffset.x, y: pixelOffset.y };
    motionX.set(pixelOffset.x);
    motionY.set(pixelOffset.y);
    
    previousViewportRef.current = { ...viewportSize };
    forceUpdate(n => n + 1);
  }, [viewportSize, motionX, motionY]);

  // Clear delete button if token no longer exists (after successful deletion)
  useEffect(() => {
    if (showDeleteButton && !tokens.find(t => t.id === showDeleteButton)) {
      setShowDeleteButton(null);
    }
  }, [tokens, showDeleteButton]);
  
  // Throttled view change notification - only on significant changes
  // Converts pixel offsets to world center coordinates for viewport-independent storage
  const notifyViewChangeRef = useRef<NodeJS.Timeout | null>(null);
  const notifyViewChange = () => {
    if (notifyViewChangeRef.current) clearTimeout(notifyViewChangeRef.current);
    notifyViewChangeRef.current = setTimeout(() => {
      if (onViewChange && viewportSize.width > 0) {
        // Convert current pixel offsets to world center coordinates
        const worldCoords = pixelOffsetToWorld(
          panRef.current.x, 
          panRef.current.y, 
          zoomRef.current, 
          viewportSize.width, 
          viewportSize.height
        );
        // If this is upgrading a legacy scene to world coords, seed previousViewportRef
        // so subsequent resizes trigger recalculation
        if (!storedWorldCoordsRef.current && !previousViewportRef.current) {
          previousViewportRef.current = { ...viewportSize };
        }
        // Update stored world coords for viewport recalculation
        storedWorldCoordsRef.current = { x: worldCoords.x, y: worldCoords.y };
        onViewChange({ x: worldCoords.x, y: worldCoords.y, zoom: zoomRef.current });
      }
    }, 100);
  };

  /**
   * startTokenDrag - Initiates custom pointer-based token dragging
   * Captures pointer and sets up drag state for precise grid snapping
   * @param startPointerX - Initial pointer X position (from pointerdown event)
   * @param startPointerY - Initial pointer Y position (from pointerdown event)
   */
  const startTokenDrag = (token: Token, startPointerX: number, startPointerY: number) => {
    // Set gesture mode to prevent map panning
    gestureModeRef.current = 'draggingToken';
    
    const effectiveGridSize = scene?.gridSize || gridSize;
    const gridEnabled = scene?.gridEnabled !== undefined ? scene.gridEnabled : true;
    
    // Calculate initial snapped position
    const visualX = gridEnabled 
      ? Math.round(token.x / effectiveGridSize) * effectiveGridSize 
      : token.x;
    const visualY = gridEnabled 
      ? Math.round(token.y / effectiveGridSize) * effectiveGridSize 
      : token.y;
    
    setDraggingToken({
      id: token.id,
      visualX,
      visualY,
      startX: token.x,
      startY: token.y,
      startPointerX,
      startPointerY
    });
    
    // Clear any delete button
    setShowDeleteButton(null);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  /**
   * moveTokenDrag - Updates token position during drag with grid snapping
   * Token visually snaps to grid cells as pointer moves
   */
  const moveTokenDrag = (e: React.PointerEvent) => {
    if (!draggingToken) return;
    
    const effectiveGridSize = scene?.gridSize || gridSize;
    const gridEnabled = scene?.gridEnabled !== undefined ? scene.gridEnabled : true;
    const currentZoom = zoomRef.current;
    
    // Calculate movement delta in world coordinates (accounting for zoom)
    const deltaX = (e.clientX - draggingToken.startPointerX) / currentZoom;
    const deltaY = (e.clientY - draggingToken.startPointerY) / currentZoom;
    
    // Calculate new position
    const rawX = draggingToken.startX + deltaX;
    const rawY = draggingToken.startY + deltaY;
    
    // Snap to grid if enabled
    const visualX = gridEnabled 
      ? Math.round(rawX / effectiveGridSize) * effectiveGridSize 
      : rawX;
    const visualY = gridEnabled 
      ? Math.round(rawY / effectiveGridSize) * effectiveGridSize 
      : rawY;
    
    setDraggingToken(prev => prev ? { ...prev, visualX, visualY } : null);
  };

  /**
   * endTokenDrag - Finalizes token position on drag end
   * Commits the snapped position to the server
   */
  const endTokenDrag = (e: React.PointerEvent, token: Token) => {
    if (!draggingToken || draggingToken.id !== token.id) return;
    
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    
    // Save the final position
    onMoveToken(token.id, draggingToken.visualX, draggingToken.visualY);
    
    // Reset gesture mode
    gestureModeRef.current = 'idle';
    
    setDraggingToken(null);
  };

  /**
   * getCharacterForToken - Retrieves character data linked to a token
   * Used for displaying HP bars and character portraits on tokens.
   * Returns undefined if token has no associated character.
   */
  const getCharacterForToken = (token: Token) => {
    if (!token.characterId || !characters) return undefined;
    return characters.find((c: any) => c.id === token.characterId);
  };

  // Track if a drag occurred (for distinguishing click from pan)
  const didDragRef = useRef(false);
  
  /**
   * Custom pointer-based map panning (replaces Framer Motion drag)
   * This gives us full control over when panning is allowed and prevents teleportation bugs.
   * In AoE targeting mode, panning still works - click without drag locks the AoE.
   */
  const handleMapPointerDown = (e: React.PointerEvent) => {
    // Don't start panning if locked, pinching, or dragging a token
    if (isMapLockedRef.current) return;
    if (gestureModeRef.current !== 'idle') return;
    
    // Only pan with primary button (left click / single touch)
    if (e.button !== 0) return;
    
    // Clear thrown item delete mode when starting a new map interaction
    if (thrownItemDeleteMode) {
      setThrownItemDeleteMode(null);
    }
    
    // Reset drag tracking
    didDragRef.current = false;
    
    gestureModeRef.current = 'panning';
    panPointerIdRef.current = e.pointerId;
    panStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y
    };
    
    // Capture pointer for reliable tracking
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  
  const handleMapPointerMove = (e: React.PointerEvent) => {
    // Handle AoE targeting mode mouse tracking
    if (aoeTargetState?.active && !aoeTargetState.locked && onAoeMouseMove) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        // Match the wheel handler's coordinate formula: account for 9000px world offset
        const worldX = ((screenX + 9000 - panRef.current.x) / zoomRef.current) - 9000;
        const worldY = ((screenY + 9000 - panRef.current.y) / zoomRef.current) - 9000;
        onAoeMouseMove(worldX, worldY);
      }
    }
    
    // Only handle if we're panning with this pointer
    if (gestureModeRef.current !== 'panning') return;
    if (panPointerIdRef.current !== e.pointerId) return;
    if (!panStartRef.current) return;
    
    const deltaX = e.clientX - panStartRef.current.pointerX;
    const deltaY = e.clientY - panStartRef.current.pointerY;
    
    // Track if we actually moved (threshold of 5px to count as a drag)
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      didDragRef.current = true;
    }
    
    const newX = panStartRef.current.panX + deltaX;
    const newY = panStartRef.current.panY + deltaY;
    
    panRef.current = { x: newX, y: newY };
    motionX.set(newX);
    motionY.set(newY);
  };
  
  const handleMapPointerUp = (e: React.PointerEvent) => {
    if (gestureModeRef.current !== 'panning') return;
    if (panPointerIdRef.current !== e.pointerId) return;
    
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {
      // Pointer capture may already be released
    }
    
    // If we're in AoE targeting mode, didn't drag, and AoE is not already locked, treat as click to lock AoE
    // Once AoE is locked, user can switch to select mode to pick targets without placing new AoE markers
    if (aoeTargetState?.active && !aoeTargetState.locked && !didDragRef.current && onAoeClick) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = ((screenX + 9000 - panRef.current.x) / zoomRef.current) - 9000;
        const worldY = ((screenY + 9000 - panRef.current.y) / zoomRef.current) - 9000;
        onAoeClick(worldX, worldY);
      }
    }
    
    // If we're in highlight mode and didn't drag, create a beacon at the grid cell
    if (selectionMode === 'highlight' && !didDragRef.current && onBeacon) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = ((screenX + 9000 - panRef.current.x) / zoomRef.current) - 9000;
        const worldY = ((screenY + 9000 - panRef.current.y) / zoomRef.current) - 9000;
        // Snap to grid cell
        const effectiveGridSize = scene?.gridSize || gridSize;
        const cellX = Math.floor(worldX / effectiveGridSize);
        const cellY = Math.floor(worldY / effectiveGridSize);
        const cellKey = `${cellX},${cellY}`;
        onBeacon(cellKey);
      }
    }
    
    // If we're in target mode and didn't drag, set the grid target for throwables
    if (selectionMode === 'target' && !didDragRef.current && onGridTargetClick) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = ((screenX + 9000 - panRef.current.x) / zoomRef.current) - 9000;
        const worldY = ((screenY + 9000 - panRef.current.y) / zoomRef.current) - 9000;
        // Snap to grid cell
        const effectiveGridSize = scene?.gridSize || gridSize;
        const cellX = Math.floor(worldX / effectiveGridSize);
        const cellY = Math.floor(worldY / effectiveGridSize);
        onGridTargetClick(cellX, cellY);
      }
    }
    
    gestureModeRef.current = 'idle';
    panPointerIdRef.current = null;
    panStartRef.current = null;
    notifyViewChange();
  };
  
  const handleMapPointerCancel = (e: React.PointerEvent) => {
    if (gestureModeRef.current === 'panning' && panPointerIdRef.current === e.pointerId) {
      gestureModeRef.current = 'idle';
      panPointerIdRef.current = null;
      panStartRef.current = null;
    }
  };
  
  // Force reset all gesture state - used as a failsafe
  // Releases pointer capture and clears all gesture tracking refs
  const forceResetGestureState = () => {
    // Release pointer capture if held on map container
    const container = containerRef.current;
    if (container && panPointerIdRef.current !== null) {
      try {
        container.releasePointerCapture(panPointerIdRef.current);
      } catch (err) {
        // Pointer capture may already be released or invalid
      }
    }
    
    // Reset all gesture state
    gestureModeRef.current = 'idle';
    panPointerIdRef.current = null;
    panStartRef.current = null;
    lastTouchDistanceRef.current = null;
    setIsPinching(false);
  };
  
  // Global cleanup effect - resets gesture state if pointer is lost
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      // Reset panning state on any global pointer up as failsafe
      if (gestureModeRef.current === 'panning' || gestureModeRef.current === 'pinching') {
        forceResetGestureState();
      }
    };
    
    // Also reset on visibility change (when user switches tabs/apps)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        forceResetGestureState();
      }
    };
    
    // Reset on blur (when window loses focus)
    const handleBlur = () => {
      forceResetGestureState();
    };
    
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  /**
   * handleWheel - Desktop zoom-to-cursor implementation
   * 
   * This effect handles mouse wheel zoom while keeping the world point under the cursor stationary.
   * Uses refs to avoid stale closures during event handling.
   * 
   * Coordinate System:
   * - The battlemap world is 20000x20000px positioned at (-9000, -9000)
   * - Background image is at (9000, 9000) within this world space
   * - Tokens use their raw coordinates, offset by +9000 for rendering
   * 
   * Zoom Math:
   * 1. Convert screen coordinates to world coordinates accounting for current pan and zoom
   * 2. Calculate new zoom level (clamped 0.2x to 3x)
   * 3. Adjust pan so the world point stays under the cursor position
   * 4. This creates a "zoom toward cursor" effect instead of zooming to center
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      // Prevent zooming when map is locked or in a gesture
      if (isMapLockedRef.current) return;
      if (gestureModeRef.current !== 'idle' && gestureModeRef.current !== 'panning') return;
      
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const delta = -e.deltaY * 0.002; // Slightly smoother zoom
      const newZoom = Math.max(0.2, Math.min(3, currentZoom + delta));
      
      if (Math.abs(newZoom - currentZoom) > 0.001) {
        // Account for the 9000px world offset when calculating world position
        const worldX = ((mouseX + 9000 - currentPan.x) / currentZoom) - 9000;
        const worldY = ((mouseY + 9000 - currentPan.y) / currentZoom) - 9000;
        
        // Adjust pan to keep the world position under the cursor
        const newPan = {
          x: mouseX + 9000 - (worldX + 9000) * newZoom,
          y: mouseY + 9000 - (worldY + 9000) * newZoom
        };
        
        // Update refs and motion values directly - no state updates
        panRef.current = newPan;
        zoomRef.current = newZoom;
        motionX.set(newPan.x);
        motionY.set(newPan.y);
        motionZoom.set(newZoom);
        notifyViewChange();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [motionX, motionY, motionZoom]);

  /**
   * handleTouch - Mobile pinch-to-zoom implementation
   * 
   * This effect handles two-finger pinch gestures for zooming on touch devices.
   * Separates pan (1 finger) from zoom (2 fingers) to prevent gesture conflicts.
   * 
   * Gesture States:
   * - 1 finger: Pan mode (drag disabled via isPinching=false)
   * - 2 fingers: Zoom mode (drag disabled via isPinching=true)
   * 
   * Pinch Zoom Math:
   * 1. Calculate distance between two touch points
   * 2. Compare with previous distance to determine zoom delta
   * 3. Find center point between the two fingers
   * 4. Convert pinch center to world coordinates
   * 5. Adjust pan so the world point under pinch center stays stationary
   * 
   * This creates a natural pinch-to-zoom experience where the content between
   * your fingers stays in place as you zoom in/out.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Cancel any ongoing pan when pinching starts
        if (gestureModeRef.current === 'panning') {
          gestureModeRef.current = 'idle';
          panPointerIdRef.current = null;
          panStartRef.current = null;
        }
        gestureModeRef.current = 'pinching';
        setIsPinching(true);
      } else if (e.touches.length === 1) {
        setIsPinching(false);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        gestureModeRef.current = 'pinching';
        setIsPinching(true);
        
        // Prevent zooming when map is locked
        if (isMapLockedRef.current) return;
        
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );

        // Calculate pinch center
        const rect = container.getBoundingClientRect();
        const centerX = ((touch1.clientX + touch2.clientX) / 2) - rect.left;
        const centerY = ((touch1.clientY + touch2.clientY) / 2) - rect.top;

        if (lastTouchDistanceRef.current !== null) {
          const delta = (distance - lastTouchDistanceRef.current) * 0.01;
          const newZoom = Math.max(0.2, Math.min(3, currentZoom + delta));
          
          if (Math.abs(newZoom - currentZoom) > 0.001) {
            // Account for the 9000px world offset when calculating world position
            const worldX = ((centerX + 9000 - currentPan.x) / currentZoom) - 9000;
            const worldY = ((centerY + 9000 - currentPan.y) / currentZoom) - 9000;
            
            // Adjust pan to keep the world position under the pinch center
            const newPan = {
              x: centerX + 9000 - (worldX + 9000) * newZoom,
              y: centerY + 9000 - (worldY + 9000) * newZoom
            };
            
            // Update refs and motion values directly - no state updates
            panRef.current = newPan;
            zoomRef.current = newZoom;
            motionX.set(newPan.x);
            motionY.set(newPan.y);
            motionZoom.set(newZoom);
            notifyViewChange();
          }
        }

        lastTouchDistanceRef.current = distance;
      } else if (e.touches.length === 1) {
        // Reset when back to 1 finger
        lastTouchDistanceRef.current = null;
        setIsPinching(false);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastTouchDistanceRef.current = null;
        setIsPinching(false);
        if (gestureModeRef.current === 'pinching') {
          gestureModeRef.current = 'idle';
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black rounded-lg border border-white/10 shadow-inner group" ref={containerRef}>
      
      {/* Map Controls (Top Center) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex gap-1">
        <Button 
           size="sm" 
           variant="secondary" 
           className="bg-black/50 hover:bg-black/80 text-xs border border-white/10 backdrop-blur-sm"
           onClick={() => { 
             const defaultZoom = scene?.defaultViewZoom ?? 1;
             const viewVersion = (scene as any)?.defaultViewVersion ?? 0;
             
             if (viewportSize.width > 0) {
               let pixelX: number, pixelY: number;
               
               if (viewVersion === 0) {
                 // Legacy: stored values are pixel offsets
                 pixelX = scene?.defaultViewX ?? 0;
                 pixelY = scene?.defaultViewY ?? 0;
               } else {
                 // Version 1+: stored values are world center coordinates
                 const worldX = scene?.defaultViewX ?? 0;
                 const worldY = scene?.defaultViewY ?? 0;
                 const pixelOffset = worldToPixelOffset(worldX, worldY, defaultZoom, viewportSize.width, viewportSize.height);
                 pixelX = pixelOffset.x;
                 pixelY = pixelOffset.y;
               }
               
               panRef.current = { x: pixelX, y: pixelY };
               zoomRef.current = defaultZoom;
               motionX.set(pixelX);
               motionY.set(pixelY);
               motionZoom.set(defaultZoom);
               notifyViewChange();
             }
           }}
           data-testid="button-reset-view"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        <Button 
           size="sm" 
           variant="secondary" 
           className={`bg-black/50 hover:bg-black/80 text-xs border backdrop-blur-sm ${isMapLocked ? 'border-amber-500 text-amber-400' : 'border-white/10'}`}
           onClick={() => {
             const newLockState = !isMapLocked;
             
             // Force reset all gesture state when toggling lock to ensure clean state
             forceResetGestureState();
             
             // Update ref synchronously
             isMapLockedRef.current = newLockState;
             setIsMapLocked(newLockState);
           }}
           data-testid="button-lock-map"
           title={isMapLocked ? "Unlock map movement" : "Lock map movement"}
        >
          {isMapLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        </Button>
        <Button 
           size="sm" 
           variant="secondary" 
           className="bg-black/50 hover:bg-black/80 text-xs border border-white/10 backdrop-blur-sm"
           onClick={() => setShowNametags(!showNametags)}
           data-testid="button-toggle-nametags"
           title={showNametags ? "Hide token names" : "Show token names"}
        >
          {showNametags ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </Button>
        {onNotesClick && (
          <Button 
             size="sm" 
             variant="secondary" 
             className={`bg-black/50 hover:bg-black/80 text-xs border backdrop-blur-sm ${notesPanelOpen ? 'border-amber-500 text-amber-400' : 'border-white/10'}`}
             onClick={onNotesClick}
             data-testid="button-notes-battlemap"
             title={notesPanelOpen ? "Close notes" : "Open notes"}
          >
            <FileText className="h-3 w-3" />
          </Button>
        )}
        {role === 'gm' && thrownItems.length > 0 && scene?.id && (
          <Button 
             size="sm" 
             variant="secondary" 
             className="bg-black/50 hover:bg-black/80 text-xs border border-white/10 backdrop-blur-sm hover:border-red-500 hover:text-red-400"
             onClick={async () => {
               try {
                 const response = await fetch(`/api/scenes/${scene.id}/thrown-items`, {
                   method: 'DELETE',
                   credentials: 'include',
                 });
                 if (response.ok) {
                   toast({
                     title: "Throwables cleared",
                     description: "All thrown items have been removed from the battlefield.",
                   });
                   onRefetchThrownItems?.();
                 } else {
                   const data = await response.json();
                   toast({
                     title: "Error",
                     description: data.error || "Failed to clear throwables",
                     variant: "destructive",
                   });
                 }
               } catch (error) {
                 toast({
                   title: "Error",
                   description: "Failed to clear throwables",
                   variant: "destructive",
                 });
               }
             }}
             data-testid="button-clear-throwables"
             title="Clear all thrown items from the battlefield"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Draggable World Container - Large scrollable space beyond image bounds */}
      {/* Using custom pointer handlers instead of Framer Motion drag for stability */}
      {/* GPU-accelerated with will-change and translateZ(0) for smooth pan/zoom performance */}
      <motion.div 
        className={`absolute ${aoeTargetState?.active ? 'cursor-crosshair' : (isMapLocked || draggingToken ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')} touch-none`}
        style={{ 
          width: '20000px', 
          height: '20000px', 
          x: motionX, 
          y: motionY, 
          scale: motionZoom,
          left: '-9000px',
          top: '-9000px',
          transformOrigin: "0 0",
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          // Removed 'contain: layout style paint' - was causing black square rendering glitches when zooming out
          // Using translateZ(0) to force GPU layer creation without contain restrictions
          transform: 'translateZ(0)'
        }}
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={handleMapPointerUp}
        onPointerCancel={handleMapPointerCancel}
        onClick={() => setShowDeleteButton(null)}
      >
        {/* Conditional Grid Overlay - Extends infinitely across the large space */}
        {(scene?.gridEnabled !== undefined ? scene.gridEnabled : true) && (
          <>
            {(() => {
              const effectiveGridSize = scene?.gridSize || gridSize;
              const MAP_OFFSET = 9000;
              // Offset grid to align with token snapping (tokens snap to multiples of gridSize)
              const gridOffset = MAP_OFFSET % effectiveGridSize;
              
              return (scene?.gridType || 'square') === 'square' ? (
                /* Square Grid - Infinite repeating pattern */
                <div className="absolute inset-0 pointer-events-none" 
                     style={{ 
                       opacity: scene?.gridOpacity ?? 0.4,
                       backgroundImage: `linear-gradient(${scene?.gridColor || '#ffffff'} ${scene?.gridThickness ?? 1}px, transparent ${scene?.gridThickness ?? 1}px), linear-gradient(90deg, ${scene?.gridColor || '#ffffff'} ${scene?.gridThickness ?? 1}px, transparent ${scene?.gridThickness ?? 1}px)`,
                       backgroundSize: `${effectiveGridSize}px ${effectiveGridSize}px`,
                       backgroundPosition: `${gridOffset}px ${gridOffset}px`
                     }} 
                />
              ) : (
                /* Hex Grid - Infinite repeating pattern */
                <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" style={{ opacity: scene?.gridOpacity ?? 0.4 }}>
                  <defs>
                    <pattern 
                      id="hexgrid" 
                      patternUnits="userSpaceOnUse" 
                      width={effectiveGridSize} 
                      height={effectiveGridSize * 0.866}
                      x={gridOffset}
                      y={gridOffset * 0.866}
                    >
                      <polygon 
                        points={`${(effectiveGridSize / 4)},0 ${(effectiveGridSize * 3 / 4)},0 ${effectiveGridSize},${(effectiveGridSize * 0.433)} ${(effectiveGridSize * 3 / 4)},${(effectiveGridSize * 0.866)} ${(effectiveGridSize / 4)},${(effectiveGridSize * 0.866)} 0,${(effectiveGridSize * 0.433)}`}
                        fill="none" 
                        stroke={scene?.gridColor || '#ffffff'} 
                        strokeWidth={scene?.gridThickness ?? 1}
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#hexgrid)" />
                </svg>
              );
            })()}
          </>
        )}
        
        {/* Active Beacons Overlay - Render pulsating ring animations */}
        {activeBeacons && activeBeacons.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {activeBeacons.map((beacon) => {
              const effectiveGridSize = scene?.gridSize || gridSize;
              const MAP_OFFSET = 9000;
              const x = beacon.gridX * effectiveGridSize + MAP_OFFSET;
              const y = beacon.gridY * effectiveGridSize + MAP_OFFSET;
              const centerX = x + effectiveGridSize / 2;
              const centerY = y + effectiveGridSize / 2;
              return (
                <div
                  key={beacon.id}
                  className="absolute"
                  style={{
                    left: centerX,
                    top: centerY,
                    transform: 'translate(-50%, -50%)',
                  }}
                  data-testid={`beacon-${beacon.id}`}
                >
                  <div 
                    className="rounded-full border-4 border-amber-400"
                    style={{
                      width: effectiveGridSize * 0.8,
                      height: effectiveGridSize * 0.8,
                      animation: 'beacon-pulse 1.5s ease-out forwards',
                      boxShadow: '0 0 20px 4px rgba(251, 191, 36, 0.6), inset 0 0 10px rgba(251, 191, 36, 0.3)',
                    }}
                  />
                  <style>{`
                    @keyframes beacon-pulse {
                      0% {
                        transform: scale(0.5);
                        opacity: 1;
                        border-width: 6px;
                      }
                      100% {
                        transform: scale(2.5);
                        opacity: 0;
                        border-width: 2px;
                      }
                    }
                  `}</style>
                </div>
              );
            })}
          </div>
        )}

        {/* Map Background - Positioned in the space, displays full image at natural aspect ratio */}
        {/* GPU-accelerated with will-change and translateZ for smooth pan/zoom performance */}
        <img 
          src={scene?.backgroundImage || backgroundImage || battleMapImage1}
          alt="Battle map background"
          className="absolute opacity-80 max-w-none"
          loading="lazy"
          decoding="async"
          style={{ 
            left: '9000px',
            top: '9000px',
            transformOrigin: 'top left',
            willChange: 'transform',
            transform: 'translateZ(0)',
            imageRendering: 'auto',
            backfaceVisibility: 'hidden'
          }}
          draggable={false}
        />

        {/* Tokens - Keep original coordinate system */}
        {tokens.map((token) => {
          // Invisible tokens: GMs see at 40% opacity, non-GMs can't see at all
          const isInvisible = (token as any).isInvisible === true;
          if (isInvisible && role !== 'gm') {
            return null; // Non-GMs can't see invisible tokens
          }
          
          const character = getCharacterForToken(token);
          const tokenImage = character?.portrait || token.image;
          const hpPercent = character ? (character.hp / character.maxHp) * 100 : null;
          const energyPercent = character ? (character.energy / character.maxEnergy) * 100 : null;
          const effectiveGridSize = scene?.gridSize || gridSize;
          
          // Check if user can drag this token:
          // - GMs can drag any token
          // - Users with 'edit' or 'owner' permission to the linked character can drag that character's token
          // Note: token.type === 'player' alone is NOT sufficient - must have actual edit permission
          const permissionLevel = character ? myPermissions?.permissions?.[character.id] : undefined;
          const hasEditAccess = permissionLevel === 'edit' || permissionLevel === 'owner';
          const canDrag = role === 'gm' || hasEditAccess;
          
          // Get species size for grid span calculation
          const speciesData = character?.race ? allSpecies.find(s => s.name === character.race) : null;
          const gridSpan = getTokenGridSpan(speciesData?.size);
          
          const isDragging = draggingToken?.id === token.id;
          const isAnimating = animatingTokensRef.current.has(token.id);
          const displayPos = getTokenDisplayPosition(token);
          const displayX = displayPos.x;
          const displayY = displayPos.y;
          
          // Token size is 90% of grid span to fit within cells with some padding
          // For Huge (4x4) and Gargantuan (6x6) tokens, they take up multiple grid cells
          const tokenSize = effectiveGridSize * gridSpan * 0.9;
          // Center the token in the visible cell area (accounting for grid line thickness)
          // The grid line takes up gridThickness pixels at the left/top edge of each cell
          // So the usable cell area is (gridSize - gridThickness) pixels, starting at gridThickness
          const gridThickness = scene?.gridThickness ?? 1;
          const usableCellSize = effectiveGridSize * gridSpan - gridThickness;
          const tokenOffset = gridThickness + (usableCellSize - tokenSize) / 2;
          
          const handleTokenPointerDown = (e: React.PointerEvent) => {
            // If in AoE targeting mode and AoE is not locked yet, let the click go through to place the AoE
            // Once locked, allow normal token interactions (like selecting for damage application)
            if (aoeTargetState?.active && !aoeTargetState.locked && e.button === 0 && onAoeClick) {
              // Calculate world coordinates and call the AoE click handler
              const container = containerRef.current;
              if (container) {
                const rect = container.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const worldX = ((screenX + 9000 - panRef.current.x) / zoomRef.current) - 9000;
                const worldY = ((screenY + 9000 - panRef.current.y) / zoomRef.current) - 9000;
                onAoeClick(worldX, worldY);
              }
              return; // Don't process token interactions until AoE is placed
            }
            
            e.stopPropagation();
            
            // Set up pending drag instead of starting immediately
            // This allows clicks and double-clicks to work without triggering drag
            if (canDrag) {
              pendingDragRef.current = {
                token,
                startPointerX: e.clientX,
                startPointerY: e.clientY
              };
              // Capture pointer for tracking moves
              const target = e.currentTarget as HTMLElement;
              target.setPointerCapture(e.pointerId);
            }
            
            if (role === 'gm') {
              holdTimerRef.current = setTimeout(() => {
                setShowDeleteButton(token.id);
              }, 500);
            }
          };
          
          const handleTokenPointerUp = (e: React.PointerEvent) => {
            e.stopPropagation();
            if (holdTimerRef.current) {
              clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
            // Clear pending drag if we never started actual drag
            if (pendingDragRef.current) {
              const target = e.currentTarget as HTMLElement;
              target.releasePointerCapture(e.pointerId);
              pendingDragRef.current = null;
            }
            if (isDragging) {
              endTokenDrag(e, token);
            }
          };
          
          const handleTokenPointerMove = (e: React.PointerEvent) => {
            // Check if pending drag should become actual drag
            if (pendingDragRef.current && !isDragging) {
              const pending = pendingDragRef.current;
              const dx = Math.abs(e.clientX - pending.startPointerX);
              const dy = Math.abs(e.clientY - pending.startPointerY);
              
              // If pointer moved beyond threshold, start actual drag using original start coordinates
              if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
                startTokenDrag(pending.token, pending.startPointerX, pending.startPointerY);
                pendingDragRef.current = null;
              }
            }
            
            if (isDragging) {
              e.stopPropagation();
              e.preventDefault();
              moveTokenDrag(e);
            }
          };
          
          const handleTokenPointerCancel = (e: React.PointerEvent) => {
            if (holdTimerRef.current) {
              clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
            // Clear pending drag
            pendingDragRef.current = null;
            if (isDragging) {
              setDraggingToken(null);
            }
          };
          
          return (
            <div
              key={token.id}
              data-testid={`token-${token.id}`}
              onPointerDown={handleTokenPointerDown}
              onPointerUp={handleTokenPointerUp}
              onPointerMove={handleTokenPointerMove}
              onPointerCancel={handleTokenPointerCancel}
              onClick={(e) => { 
                // Don't handle token click when in AoE targeting mode
                if (aoeTargetState?.active) return;
                e.stopPropagation(); 
                if (showDeleteButton !== token.id && !isDragging) {
                  onTokenClick && onTokenClick(token);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (showDeleteButton !== token.id && !isDragging) {
                  onTokenDoubleClick && onTokenDoubleClick(token);
                }
              }}
              className={`absolute top-0 left-0 rounded-full shadow-xl ring-2 ring-white/20 overflow-visible bg-black token-shadow touch-none select-none ${canDrag ? 'cursor-grab' : 'cursor-default'} ${isDragging ? 'z-20 scale-110 cursor-grabbing' : 'hover:scale-105'} transition-transform`}
              style={{ 
                width: tokenSize, 
                height: tokenSize,
                left: displayX + 9000 + tokenOffset,
                top: displayY + 9000 + tokenOffset,
                opacity: isInvisible ? 0.4 : 1 // Invisible tokens shown at 40% opacity for GMs
              }}
              aria-label={`${token.type} token`}
              role="button"
              tabIndex={0}
            >
              <img src={tokenImage} alt="token" className="w-full h-full object-cover pointer-events-none rounded-full" />
              
              {/* Initiative Turn Glow - pulsing golden glow for current turn character */}
              {character && currentTurnCharacterId === character.id && (
                <div 
                  className="absolute -inset-1 rounded-full pointer-events-none animate-pulse"
                  style={{
                    boxShadow: '0 0 15px 5px rgba(251, 191, 36, 0.7), 0 0 30px 10px rgba(251, 191, 36, 0.4), 0 0 45px 15px rgba(251, 191, 36, 0.2)',
                    border: '3px solid rgba(251, 191, 36, 0.9)'
                  }}
                />
              )}
              
              {/* Token border - shows targeting (red), selection (white), or default (blue/red based on type) */}
              <div className={`absolute inset-0 rounded-full ${
                targetedTokenId === token.id 
                  ? 'border-4 border-red-500 ring-2 ring-red-500/50 glow-red' 
                  : selectedTokenId === token.id
                    ? 'border-3 border-white ring-2 ring-white/30'
                    : `border-2 ${token.type === 'player' ? 'border-blue-400 glow-amber' : 'border-red-500 glow-red'}`
              }`} />
              
              {/* Delete Button - Show when holding click (GM only) */}
              {showDeleteButton === token.id && role === 'gm' && (
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setTokenToDelete(token.id);
                  }}
                  className="absolute -top-3 -left-3 w-7 h-7 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg border-2 border-red-400 z-30 pointer-events-auto touch-auto"
                  data-testid={`button-delete-token-${token.id}`}
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              )}
              
              {/* Effects Icon - GM only, opens dialog to apply/remove effects - only visible when holding */}
              {showDeleteButton === token.id && role === 'gm' && allTokenEffects && allTokenEffects.length > 0 && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEffectsDialogToken(token.id);
                  }}
                  className="absolute -top-3 -right-3 w-7 h-7 bg-violet-600 hover:bg-violet-700 rounded-full flex items-center justify-center shadow-lg border-2 border-violet-400 z-30 pointer-events-auto touch-auto"
                  data-testid={`button-effects-${token.id}`}
                >
                  <Flame className="w-4 h-4 text-white" />
                </button>
              )}
              
              {/* Invisibility Toggle - GM only, toggles token visibility for non-GMs */}
              {showDeleteButton === token.id && role === 'gm' && onToggleInvisibility && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleInvisibility(token.id, !isInvisible);
                  }}
                  className={`absolute -bottom-3 -right-3 w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 z-30 pointer-events-auto touch-auto ${
                    isInvisible 
                      ? 'bg-cyan-600 hover:bg-cyan-700 border-cyan-400' 
                      : 'bg-slate-600 hover:bg-slate-700 border-slate-400'
                  }`}
                  data-testid={`button-invisible-${token.id}`}
                  title={isInvisible ? 'Make visible' : 'Make invisible'}
                >
                  {isInvisible ? <Eye className="w-4 h-4 text-white" /> : <EyeOff className="w-4 h-4 text-white" />}
                </button>
              )}
              
              {/* Nametag - displays character/token name at bottom of token, above HP/Energy bars */}
              {/* Only show if: nametags enabled AND (GM or player has view/edit permission for the character) */}
              {/* Players without permission don't see any name at all */}
              {/* Uses nickname if set, otherwise full name. Long names wrap to multiple lines */}
              {showNametags && (role === 'gm' || (character && myPermissions?.permissions?.[character.id])) && (
                <div 
                  className="absolute left-1/2 -translate-x-1/2 font-display text-white pointer-events-none text-center leading-tight"
                  style={{ 
                    bottom: character && hpPercent !== null ? 18 : 2,
                    fontSize: Math.max(8, Math.min(11, tokenSize / 5.5)),
                    textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000',
                    maxWidth: tokenSize * 1.2,
                    wordBreak: 'normal',
                    overflowWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.1
                  }}
                >
                  {character?.name || (token.type === 'player' ? 'Player' : 'Enemy')}
                </div>
              )}
              
              {/* Energy Bar - Only show if token is linked to a character and user has permission */}
              {character && energyPercent !== null && (role === 'gm' || myPermissions?.permissions?.[character.id]) && (
                <div className="absolute bottom-[9px] left-0.5 right-0.5 h-1.5 bg-black/50 rounded-full overflow-hidden border border-black/80">
                  <div 
                    className="h-full transition-all duration-300 bg-cyan-500"
                    style={{ width: `${Math.max(0, Math.min(100, energyPercent))}%` }}
                  />
                </div>
              )}
              
              {/* HP Bar - Only show if token is linked to a character and user has permission */}
              {character && hpPercent !== null && (role === 'gm' || myPermissions?.permissions?.[character.id]) && (
                <div className="absolute bottom-0.5 left-0.5 right-0.5 h-1.5 bg-black/50 rounded-full overflow-hidden border border-black/80">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      hpPercent > 60 ? 'bg-green-500' : hpPercent > 30 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, hpPercent))}%` }}
                  />
                </div>
              )}
              
              {/* Active Effects Display - Show on right side INSIDE the token */}
              {tokenActiveEffects && tokenActiveEffects[token.id] && tokenActiveEffects[token.id].length > 0 && (
                <div 
                  className="absolute flex flex-col gap-px z-20"
                  style={{
                    right: 2,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                >
                  {tokenActiveEffects[token.id].slice(0, 3).map((ae) => (
                    <Popover key={ae.id}>
                      <PopoverTrigger asChild>
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-sm bg-black/60 border border-violet-500/70 shadow-sm flex items-center justify-center overflow-hidden relative"
                          style={{ width: Math.max(10, tokenSize * 0.22), height: Math.max(10, tokenSize * 0.22) }}
                          title={ae.effect.name}
                        >
                          {ae.effect.imageUrl ? (
                            <img src={ae.effect.imageUrl} className="w-full h-full object-cover" />
                          ) : (
                            <Flame className="w-2 h-2 text-violet-400" />
                          )}
                          {ae.duration !== null && ae.duration > 0 && (
                            <div 
                              className="absolute -bottom-0.5 -right-0.5 bg-amber-600 text-white rounded-full flex items-center justify-center font-bold"
                              style={{ 
                                width: Math.max(8, tokenSize * 0.12), 
                                height: Math.max(8, tokenSize * 0.12),
                                fontSize: Math.max(6, tokenSize * 0.08)
                              }}
                            >
                              {ae.duration}
                            </div>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 bg-stone-900 border-stone-700 p-2">
                        <div className="flex items-center gap-2 mb-1">
                          {ae.effect.imageUrl && <img src={ae.effect.imageUrl} className="w-6 h-6 rounded" />}
                          <span className="font-medium text-sm text-stone-200">{ae.effect.name}</span>
                        </div>
                        {ae.effect.description && (
                          <p className="text-xs text-stone-400 mb-2">{ae.effect.description}</p>
                        )}
                        {ae.effect.causesDamage && (
                          <p className="text-xs text-red-400">{ae.effect.diceAmount} {ae.effect.damageType} damage</p>
                        )}
                        {ae.duration !== null && ae.duration > 0 && (
                          <p className="text-xs text-amber-400 mt-1">{ae.duration} {ae.effect.durationType === 'rounds' ? 'rounds' : 'turns'} remaining</p>
                        )}
                        {role === 'gm' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveEffect?.(ae.id);
                            }}
                            className="mt-2 w-full text-xs text-red-400 hover:text-red-300 border border-stone-700 rounded px-2 py-1"
                          >
                            Remove Effect
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>
                  ))}
                  {tokenActiveEffects[token.id].length > 3 && (
                    <div 
                      className="rounded-sm bg-stone-700/80 border border-stone-600 text-stone-300 flex items-center justify-center"
                      style={{ width: Math.max(10, tokenSize * 0.22), height: Math.max(10, tokenSize * 0.22), fontSize: Math.max(6, tokenSize * 0.12) }}
                    >
                      +{tokenActiveEffects[token.id].length - 3}
                    </div>
                  )}
                </div>
              )}
              
              {/* Attached Thrown Items Display - Show on left side of token (like effects but orange) */}
              {(() => {
                const attachedItems = thrownItems.filter(ti => ti.attachedToTokenId === token.id && ti.item);
                if (attachedItems.length === 0) return null;
                
                return (
                  <div 
                    className="absolute flex flex-col gap-px z-20"
                    style={{
                      left: 2,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  >
                    {attachedItems.slice(0, 3).map((thrownItem) => {
                      const item = thrownItem.item!;
                      const hasAoe = item.throwableAoe && (item.throwableAoeRange || 0) > 0;
                      
                      return (
                        <Popover key={thrownItem.id}>
                          <PopoverTrigger asChild>
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-sm bg-black/60 border-2 border-orange-500 shadow-sm flex items-center justify-center overflow-hidden relative"
                              style={{ width: Math.max(10, tokenSize * 0.22), height: Math.max(10, tokenSize * 0.22) }}
                              title={item.name}
                              data-testid={`attached-item-${thrownItem.id}`}
                            >
                              {item.image ? (
                                <img src={item.image} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-2 h-2 text-orange-400" />
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 bg-stone-900 border-stone-700 p-2">
                            <div className="flex items-center gap-2 mb-1">
                              {item.image && <img src={item.image} className="w-6 h-6 rounded" />}
                              <span className="font-medium text-sm text-stone-200">{item.name}</span>
                            </div>
                            {item.description && (
                              <p className="text-xs text-stone-400 mb-2">{item.description}</p>
                            )}
                            {hasAoe && (
                              <p className="text-xs text-orange-400">AOE: {item.throwableAoeRange}ft radius</p>
                            )}
                            <p className="text-xs text-stone-500 mt-1">Attached to token</p>
                            {isGM && onDeleteThrownItem && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteThrownItem(thrownItem.id);
                                }}
                                className="mt-2 w-full text-xs text-red-400 hover:text-red-300 border border-stone-700 rounded px-2 py-1 flex items-center justify-center gap-1"
                                data-testid={`delete-attached-item-${thrownItem.id}`}
                              >
                                <X className="w-3 h-3" /> Remove
                              </button>
                            )}
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                    {attachedItems.length > 3 && (
                      <div 
                        className="rounded-sm bg-stone-700/80 border border-orange-500/50 text-orange-300 flex items-center justify-center"
                        style={{ width: Math.max(10, tokenSize * 0.22), height: Math.max(10, tokenSize * 0.22), fontSize: Math.max(6, tokenSize * 0.12) }}
                      >
                        +{attachedItems.length - 3}
                      </div>
                    )}
                  </div>
                );
              })()}
              
            </div>
          );
        })}

        {/* Attached Item AOE Circles - Always visible for items attached to tokens */}
        {thrownItems.filter(ti => ti.attachedToTokenId && ti.item).map((thrownItem) => {
          const attachedToken = tokens.find(t => t.id === thrownItem.attachedToTokenId);
          if (!attachedToken) return null;
          
          const effectiveGridSize = scene?.gridSize || gridSize;
          const item = thrownItem.item!;
          const aoeRangeInFeet = item.throwableAoeRange || 0;
          const feetPerCell = 5;
          const aoeRadiusCells = aoeRangeInFeet / feetPerCell;
          const aoeRadiusPixels = aoeRadiusCells * effectiveGridSize;
          
          if (aoeRadiusPixels <= 0 || !item.throwableAoe) return null;
          
          const tokenDisplayPos = getTokenDisplayPosition(attachedToken);
          const tokenCenterX = 9000 + tokenDisplayPos.x + effectiveGridSize / 2;
          const tokenCenterY = 9000 + tokenDisplayPos.y + effectiveGridSize / 2;
          
          return (
            <div
              key={`attached-aoe-${thrownItem.id}`}
              className="absolute rounded-full border-2 border-orange-500/60 bg-orange-500/15 pointer-events-none"
              style={{
                left: tokenCenterX - aoeRadiusPixels,
                top: tokenCenterY - aoeRadiusPixels,
                width: aoeRadiusPixels * 2,
                height: aoeRadiusPixels * 2,
                zIndex: 14,
              }}
              data-testid={`attached-item-aoe-${thrownItem.id}`}
            />
          );
        })}

        {/* Thrown Items - Items placed on the map with AOE circles */}
        {thrownItems.map((thrownItem) => {
          const effectiveGridSize = scene?.gridSize || gridSize;
          const item = thrownItem.item;
          if (!item) return null;
          
          const itemSize = effectiveGridSize * 0.6;
          const gridThickness = scene?.gridThickness ?? 1;
          const tokenOffset = gridThickness + (effectiveGridSize - itemSize) / 2;
          
          const aoeRangeInFeet = item.throwableAoeRange || 0;
          const feetPerCell = 5;
          const aoeRadiusCells = aoeRangeInFeet / feetPerCell;
          const aoeRadiusPixels = aoeRadiusCells * effectiveGridSize;
          
          return (
            <div key={thrownItem.id} data-testid={`thrown-item-${thrownItem.id}`}>
              {/* AOE Range Circle */}
              {item.throwableAoe && aoeRadiusPixels > 0 && (
                <div
                  className="absolute rounded-full border-2 border-orange-500/60 bg-orange-500/15 pointer-events-none"
                  style={{
                    left: 9000 + thrownItem.x * effectiveGridSize + effectiveGridSize / 2 - aoeRadiusPixels,
                    top: 9000 + thrownItem.y * effectiveGridSize + effectiveGridSize / 2 - aoeRadiusPixels,
                    width: aoeRadiusPixels * 2,
                    height: aoeRadiusPixels * 2,
                    zIndex: 15,
                  }}
                />
              )}
              
              {/* Thrown Item Token - Interactive for GMs with long-press delete */}
              <div
                className={`absolute group ${isGM ? 'cursor-pointer' : 'pointer-events-none'}`}
                style={{
                  left: 9000 + thrownItem.x * effectiveGridSize + tokenOffset,
                  top: 9000 + thrownItem.y * effectiveGridSize + tokenOffset,
                  width: itemSize,
                  height: itemSize,
                  zIndex: 16,
                  opacity: 0.85,
                }}
                onPointerDown={(e) => {
                  if (!isGM || !onDeleteThrownItem) return;
                  // Only handle primary pointer (left click or first touch)
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  e.stopPropagation();
                  // Start long-press timer
                  if (thrownItemHoldTimerRef.current) {
                    clearTimeout(thrownItemHoldTimerRef.current);
                  }
                  thrownItemHoldTimerRef.current = setTimeout(() => {
                    setThrownItemDeleteMode(thrownItem.id);
                  }, 500);
                }}
                onPointerUp={(e) => {
                  if (!isGM) return;
                  // Clear the timer if pointer is released before long-press
                  if (thrownItemHoldTimerRef.current) {
                    clearTimeout(thrownItemHoldTimerRef.current);
                    thrownItemHoldTimerRef.current = null;
                  }
                }}
                onPointerLeave={(e) => {
                  if (!isGM) return;
                  // Clear the timer if pointer leaves the element
                  if (thrownItemHoldTimerRef.current) {
                    clearTimeout(thrownItemHoldTimerRef.current);
                    thrownItemHoldTimerRef.current = null;
                  }
                }}
                onPointerCancel={(e) => {
                  if (!isGM) return;
                  // Clear the timer if pointer is cancelled
                  if (thrownItemHoldTimerRef.current) {
                    clearTimeout(thrownItemHoldTimerRef.current);
                    thrownItemHoldTimerRef.current = null;
                  }
                }}
                data-testid={`thrown-item-token-${thrownItem.id}`}
              >
                <div
                  className="relative w-full h-full rounded-lg border-2 border-orange-400/70 shadow-lg overflow-hidden bg-stone-900/80"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-orange-400">
                      <Package className="w-1/2 h-1/2" />
                    </div>
                  )}
                  
                  {/* GM Remove Button - shows on long-press (mobile-friendly) */}
                  {isGM && onDeleteThrownItem && thrownItemDeleteMode === thrownItem.id && (
                    <button
                      className="absolute -top-2 -right-2 w-7 h-7 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-lg animate-pulse z-30"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteThrownItem(thrownItem.id);
                        setThrownItemDeleteMode(null);
                      }}
                      data-testid={`delete-thrown-item-${thrownItem.id}`}
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>
                
                {/* Item name tooltip on hover */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                  {item.name}
                </div>
              </div>
            </div>
          );
        })}

        {/* Throwable Grid Target Marker - Shows where throwable will be placed */}
        {throwableGridTarget && selectionMode === 'target' && (() => {
          const effectiveGridSize = scene?.gridSize || gridSize;
          const markerSize = effectiveGridSize * 0.8;
          const markerOffset = (effectiveGridSize - markerSize) / 2;
          
          return (
            <div
              className="absolute animate-pulse pointer-events-none"
              style={{
                left: 9000 + throwableGridTarget.x * effectiveGridSize + markerOffset,
                top: 9000 + throwableGridTarget.y * effectiveGridSize + markerOffset,
                width: markerSize,
                height: markerSize,
                zIndex: 18,
              }}
              data-testid="throwable-grid-target"
            >
              <div className="w-full h-full rounded-lg border-4 border-dashed border-orange-500 bg-orange-500/20 flex items-center justify-center">
                <Target className="w-1/2 h-1/2 text-orange-400" />
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-orange-600/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                Target Location
              </div>
            </div>
          );
        })()}

        {/* Token Movement Path Visualization - Shows path and distance while dragging */}
        {draggingToken && (() => {
          const effectiveGridSize = scene?.gridSize || gridSize;
          
          // Calculate start and end grid positions
          const startGridX = Math.round(draggingToken.startX / effectiveGridSize);
          const startGridY = Math.round(draggingToken.startY / effectiveGridSize);
          const endGridX = Math.round(draggingToken.visualX / effectiveGridSize);
          const endGridY = Math.round(draggingToken.visualY / effectiveGridSize);
          
          // Build grid-aligned path (Manhattan distance with diagonal support)
          const pathPoints: { x: number; y: number }[] = [];
          let currentX = startGridX;
          let currentY = startGridY;
          pathPoints.push({ x: currentX, y: currentY });
          
          // Move towards target using diagonal + straight moves
          while (currentX !== endGridX || currentY !== endGridY) {
            const dx = endGridX - currentX;
            const dy = endGridY - currentY;
            
            // Prefer diagonal movement when both axes need movement
            if (dx !== 0 && dy !== 0) {
              currentX += dx > 0 ? 1 : -1;
              currentY += dy > 0 ? 1 : -1;
            } else if (dx !== 0) {
              currentX += dx > 0 ? 1 : -1;
            } else if (dy !== 0) {
              currentY += dy > 0 ? 1 : -1;
            }
            pathPoints.push({ x: currentX, y: currentY });
          }
          
          // Calculate total distance (diagonal = 1.5 grid cells in D&D, but we'll use 5ft per cell for simplicity)
          // Actually for grid games, each step is 5ft including diagonals for simplicity
          let totalDistance = 0;
          for (let i = 1; i < pathPoints.length; i++) {
            const prevPoint = pathPoints[i - 1];
            const currPoint = pathPoints[i];
            const isDiagonal = prevPoint.x !== currPoint.x && prevPoint.y !== currPoint.y;
            // Standard: 5ft per square, diagonal can be 5ft (simplified) or 7.5ft (alternate)
            // Using 5ft for simplicity as most VTTs do
            totalDistance += isDiagonal ? 5 : 5;
          }
          
          // Convert grid positions to world coordinates (center of each cell)
          const worldPoints = pathPoints.map(p => ({
            x: p.x * effectiveGridSize + effectiveGridSize / 2 + 9000,
            y: p.y * effectiveGridSize + effectiveGridSize / 2 + 9000
          }));
          
          // Only show if actually moved
          if (pathPoints.length <= 1) return null;
          
          // Build SVG path string
          const pathD = worldPoints.map((p, i) => 
            i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
          ).join(' ');
          
          // Calculate label position (midpoint of path)
          const midIndex = Math.floor(worldPoints.length / 2);
          const labelX = worldPoints[midIndex].x;
          const labelY = worldPoints[midIndex].y - 15;
          
          return (
            <svg
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: '20000px',
                height: '20000px',
                overflow: 'visible',
                zIndex: 30, // Above tokens
              }}
            >
              {/* Path trail - dashed line showing movement */}
              <path
                d={pathD}
                fill="none"
                stroke="rgba(59, 130, 246, 0.8)"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="10 6"
              />
              
              {/* Waypoint dots at each grid cell along path */}
              {worldPoints.slice(0, -1).map((point, i) => (
                <circle
                  key={i}
                  cx={point.x}
                  cy={point.y}
                  r={i === 0 ? 8 : 5}
                  fill={i === 0 ? "rgba(34, 197, 94, 0.9)" : "rgba(59, 130, 246, 0.7)"}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
              
              {/* End point indicator */}
              <circle
                cx={worldPoints[worldPoints.length - 1].x}
                cy={worldPoints[worldPoints.length - 1].y}
                r={10}
                fill="none"
                stroke="rgba(59, 130, 246, 1)"
                strokeWidth={3}
              />
              
              {/* Distance label with background */}
              <rect
                x={labelX - 30}
                y={labelY - 12}
                width={60}
                height={24}
                rx={4}
                fill="rgba(0, 0, 0, 0.85)"
                stroke="rgba(59, 130, 246, 0.8)"
                strokeWidth={1}
              />
              <text
                x={labelX}
                y={labelY + 5}
                textAnchor="middle"
                fill="white"
                fontSize="14"
                fontWeight="bold"
              >
                {totalDistance} ft
              </text>
            </svg>
          );
        })()}

        {/* AoE Targeting Overlay - Inside motion.div so it transforms with the map */}
        {aoeTargetState?.active && aoeTargetState.spell && (() => {
          const spell = aoeTargetState.spell;
          const aoeField = spell.aoe || '';
          const [parsedShape, parsedRadius] = aoeField.split(':');
          const aoeShape = (parsedShape || 'circle').toLowerCase();
          const aoeRangeFeet = parseInt(parsedRadius, 10) || 15;
          // aoeRangeFeet is the radius in feet (5ft = 1 grid cell)
          const radiusPixels = (aoeRangeFeet / 5) * (scene?.gridSize || gridSize);
          const { center, locked } = aoeTargetState;
          
          const casterToken = tokens.find(t => t.id === aoeTargetState.casterTokenId);
          const spellRangeFeet = spell.rangeNum || 30;
          const spellRangePixels = (spellRangeFeet / 5) * (scene?.gridSize || gridSize);
          
          // Check if in range
          let isInRange = true;
          if (casterToken) {
            const casterCenterX = casterToken.x + (scene?.gridSize || gridSize) / 2;
            const casterCenterY = casterToken.y + (scene?.gridSize || gridSize) / 2;
            const distance = Math.sqrt(
              Math.pow(center.x - casterCenterX, 2) + Math.pow(center.y - casterCenterY, 2)
            );
            isInRange = distance <= spellRangePixels;
          }
          
          const fillColor = isInRange 
            ? (locked ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.3)')
            : 'rgba(239, 68, 68, 0.3)';
          const strokeColor = isInRange 
            ? (locked ? 'rgba(139, 92, 246, 1)' : 'rgba(139, 92, 246, 0.8)')
            : 'rgba(239, 68, 68, 0.8)';
          
          // Position relative to the 9000,9000 offset (same as tokens)
          const worldX = center.x + 9000;
          const worldY = center.y + 9000;
          
          return (
            <svg
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: '20000px',
                height: '20000px',
                overflow: 'visible',
                zIndex: 25,
              }}
            >
              {aoeShape === 'circle' && (
                <circle
                  cx={worldX}
                  cy={worldY}
                  r={radiusPixels}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={2}
                  strokeDasharray={locked ? 'none' : '8 4'}
                />
              )}
              {aoeShape === 'square' && (
                <rect
                  x={worldX - radiusPixels}
                  y={worldY - radiusPixels}
                  width={radiusPixels * 2}
                  height={radiusPixels * 2}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={2}
                  strokeDasharray={locked ? 'none' : '8 4'}
                />
              )}
              {aoeShape === 'cone' && casterToken && (() => {
                const casterCenterX = casterToken.x + (scene?.gridSize || gridSize) / 2 + 9000;
                const casterCenterY = casterToken.y + (scene?.gridSize || gridSize) / 2 + 9000;
                const angleRad = Math.atan2(worldY - casterCenterY, worldX - casterCenterX);
                const halfConeAngle = (90 / 2) * (Math.PI / 180);
                const leftAngle = angleRad - halfConeAngle;
                const rightAngle = angleRad + halfConeAngle;
                const leftX = casterCenterX + Math.cos(leftAngle) * radiusPixels;
                const leftY = casterCenterY + Math.sin(leftAngle) * radiusPixels;
                const rightX = casterCenterX + Math.cos(rightAngle) * radiusPixels;
                const rightY = casterCenterY + Math.sin(rightAngle) * radiusPixels;
                return (
                  <path
                    d={`M ${casterCenterX} ${casterCenterY} L ${leftX} ${leftY} A ${radiusPixels} ${radiusPixels} 0 0 1 ${rightX} ${rightY} Z`}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2}
                    strokeDasharray={locked ? 'none' : '8 4'}
                  />
                );
              })()}
              {aoeShape === 'line' && casterToken && (() => {
                const casterCenterX = casterToken.x + (scene?.gridSize || gridSize) / 2 + 9000;
                const casterCenterY = casterToken.y + (scene?.gridSize || gridSize) / 2 + 9000;
                const lineWidth = (scene?.gridSize || gridSize);
                const dirX = worldX - casterCenterX;
                const dirY = worldY - casterCenterY;
                const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
                if (dirLen === 0) return null;
                const normX = dirX / dirLen;
                const normY = dirY / dirLen;
                const perpX = -normY * (lineWidth / 2);
                const perpY = normX * (lineWidth / 2);
                const endX = casterCenterX + normX * radiusPixels;
                const endY = casterCenterY + normY * radiusPixels;
                return (
                  <polygon
                    points={`${casterCenterX + perpX},${casterCenterY + perpY} ${endX + perpX},${endY + perpY} ${endX - perpX},${endY - perpY} ${casterCenterX - perpX},${casterCenterY - perpY}`}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2}
                    strokeDasharray={locked ? 'none' : '8 4'}
                  />
                );
              })()}
              {/* Center dot when not locked */}
              {!locked && (
                <circle
                  cx={worldX}
                  cy={worldY}
                  r={6}
                  fill="rgba(255, 255, 255, 0.8)"
                  stroke={strokeColor}
                  strokeWidth={2}
                />
              )}
            </svg>
          );
        })()}
        
        {/* Throwable Item AoE Targeting Overlay */}
        {aoeTargetState?.active && aoeTargetState.throwableItem && !aoeTargetState.spell && (() => {
          const item = aoeTargetState.throwableItem;
          const aoeShape = (item.throwableAoeShape || 'circle').toLowerCase();
          const aoeRangeFeet = item.throwableAoeRange || 10;
          // aoeRangeFeet is the radius in feet (5ft = 1 grid cell)
          const radiusPixels = (aoeRangeFeet / 5) * (scene?.gridSize || gridSize);
          const { center, locked } = aoeTargetState;
          
          const casterToken = tokens.find(t => t.id === aoeTargetState.casterTokenId);
          const throwRangeFeet = item.range || 30;
          const throwRangePixels = (throwRangeFeet / 5) * (scene?.gridSize || gridSize);
          
          // Check if in range
          let isInRange = true;
          if (casterToken) {
            const casterCenterX = casterToken.x + (scene?.gridSize || gridSize) / 2;
            const casterCenterY = casterToken.y + (scene?.gridSize || gridSize) / 2;
            const distance = Math.sqrt(
              Math.pow(center.x - casterCenterX, 2) + Math.pow(center.y - casterCenterY, 2)
            );
            isInRange = distance <= throwRangePixels;
          }
          
          // Orange colors for throwables
          const fillColor = isInRange 
            ? (locked ? 'rgba(251, 146, 60, 0.5)' : 'rgba(251, 146, 60, 0.3)')
            : 'rgba(239, 68, 68, 0.3)';
          const strokeColor = isInRange 
            ? (locked ? 'rgba(251, 146, 60, 1)' : 'rgba(251, 146, 60, 0.8)')
            : 'rgba(239, 68, 68, 0.8)';
          
          // Position relative to the 9000,9000 offset (same as tokens)
          const worldX = center.x + 9000;
          const worldY = center.y + 9000;
          
          return (
            <svg
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: '20000px',
                height: '20000px',
                overflow: 'visible',
                zIndex: 25,
              }}
            >
              {aoeShape === 'circle' && (
                <circle
                  cx={worldX}
                  cy={worldY}
                  r={radiusPixels}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={2}
                  strokeDasharray={locked ? 'none' : '8 4'}
                />
              )}
              {aoeShape === 'square' && (
                <rect
                  x={worldX - radiusPixels}
                  y={worldY - radiusPixels}
                  width={radiusPixels * 2}
                  height={radiusPixels * 2}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={2}
                  strokeDasharray={locked ? 'none' : '8 4'}
                />
              )}
              {/* Center dot when not locked */}
              {!locked && (
                <circle
                  cx={worldX}
                  cy={worldY}
                  r={6}
                  fill="rgba(255, 255, 255, 0.8)"
                  stroke={strokeColor}
                  strokeWidth={2}
                />
              )}
              {/* Placement indicator when locked */}
              {locked && (
                <text
                  x={worldX}
                  y={worldY - radiusPixels - 10}
                  textAnchor="middle"
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                  style={{ textShadow: '0 0 4px black' }}
                >
                  Click hotbar to throw here
                </text>
              )}
            </svg>
          );
        })()}
        
        {/* Other Players' AoE Overlays - Show all other players' targeting */}
        {otherPlayersAoe && Array.from(otherPlayersAoe.values()).map((playerAoe) => {
          if (!playerAoe.active || !playerAoe.spellAoe) return null;
          
          const aoeField = playerAoe.spellAoe || '';
          const [parsedShape, parsedRadius] = aoeField.split(':');
          const aoeShape = (parsedShape || 'circle').toLowerCase();
          const aoeRangeFeet = parseInt(parsedRadius, 10) || 15;
          // aoeRangeFeet is the radius in feet (5ft = 1 grid cell)
          const radiusPixels = (aoeRangeFeet / 5) * (scene?.gridSize || gridSize);
          const { center, locked: playerLocked } = playerAoe;
          
          // Different colors for other players - use orange/amber theme
          const playerFillColor = playerLocked 
            ? 'rgba(251, 146, 60, 0.4)' // orange-400 at 40%
            : 'rgba(251, 146, 60, 0.25)'; // orange-400 at 25%
          const playerStrokeColor = playerLocked 
            ? 'rgba(251, 146, 60, 1)' // orange-400
            : 'rgba(251, 146, 60, 0.7)';
          
          const worldX = center.x + 9000;
          const worldY = center.y + 9000;
          
          return (
            <svg
              key={playerAoe.userId}
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: '20000px',
                height: '20000px',
                overflow: 'visible',
                zIndex: 24, // Slightly below current user's AoE
              }}
            >
              {aoeShape === 'circle' && (
                <circle
                  cx={worldX}
                  cy={worldY}
                  r={radiusPixels}
                  fill={playerFillColor}
                  stroke={playerStrokeColor}
                  strokeWidth={2}
                  strokeDasharray={playerLocked ? 'none' : '8 4'}
                />
              )}
              {aoeShape === 'square' && (
                <rect
                  x={worldX - radiusPixels}
                  y={worldY - radiusPixels}
                  width={radiusPixels * 2}
                  height={radiusPixels * 2}
                  fill={playerFillColor}
                  stroke={playerStrokeColor}
                  strokeWidth={2}
                  strokeDasharray={playerLocked ? 'none' : '8 4'}
                />
              )}
              {aoeShape === 'cone' && (() => {
                const playerCasterToken = playerAoe.casterTokenId ? tokens.find(t => t.id === playerAoe.casterTokenId) : null;
                if (!playerCasterToken) return null;
                const casterCenterX = playerCasterToken.x + (scene?.gridSize || gridSize) / 2 + 9000;
                const casterCenterY = playerCasterToken.y + (scene?.gridSize || gridSize) / 2 + 9000;
                const angleRad = Math.atan2(worldY - casterCenterY, worldX - casterCenterX);
                const halfConeAngle = (90 / 2) * (Math.PI / 180);
                const leftAngle = angleRad - halfConeAngle;
                const rightAngle = angleRad + halfConeAngle;
                const leftX = casterCenterX + Math.cos(leftAngle) * radiusPixels;
                const leftY = casterCenterY + Math.sin(leftAngle) * radiusPixels;
                const rightX = casterCenterX + Math.cos(rightAngle) * radiusPixels;
                const rightY = casterCenterY + Math.sin(rightAngle) * radiusPixels;
                return (
                  <path
                    d={`M ${casterCenterX} ${casterCenterY} L ${leftX} ${leftY} A ${radiusPixels} ${radiusPixels} 0 0 1 ${rightX} ${rightY} Z`}
                    fill={playerFillColor}
                    stroke={playerStrokeColor}
                    strokeWidth={2}
                    strokeDasharray={playerLocked ? 'none' : '8 4'}
                  />
                );
              })()}
              {aoeShape === 'line' && (() => {
                const playerCasterToken = playerAoe.casterTokenId ? tokens.find(t => t.id === playerAoe.casterTokenId) : null;
                if (!playerCasterToken) return null;
                const casterCenterX = playerCasterToken.x + (scene?.gridSize || gridSize) / 2 + 9000;
                const casterCenterY = playerCasterToken.y + (scene?.gridSize || gridSize) / 2 + 9000;
                const lineWidth = (scene?.gridSize || gridSize);
                const dirX = worldX - casterCenterX;
                const dirY = worldY - casterCenterY;
                const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
                if (dirLen === 0) return null;
                const normX = dirX / dirLen;
                const normY = dirY / dirLen;
                const perpX = -normY * (lineWidth / 2);
                const perpY = normX * (lineWidth / 2);
                const endX = casterCenterX + normX * radiusPixels;
                const endY = casterCenterY + normY * radiusPixels;
                return (
                  <polygon
                    points={`${casterCenterX + perpX},${casterCenterY + perpY} ${endX + perpX},${endY + perpY} ${endX - perpX},${endY - perpY} ${casterCenterX - perpX},${casterCenterY - perpY}`}
                    fill={playerFillColor}
                    stroke={playerStrokeColor}
                    strokeWidth={2}
                    strokeDasharray={playerLocked ? 'none' : '8 4'}
                  />
                );
              })()}
              {/* Player name label */}
              <text
                x={worldX}
                y={worldY - radiusPixels - 8}
                textAnchor="middle"
                fill="white"
                fontSize="12"
                fontWeight="bold"
                style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}
              >
                {playerAoe.casterName || playerAoe.username} - {playerAoe.spellName}
              </text>
              {/* Center dot when not locked */}
              {!playerLocked && (
                <circle
                  cx={worldX}
                  cy={worldY}
                  r={5}
                  fill="rgba(255, 255, 255, 0.7)"
                  stroke={playerStrokeColor}
                  strokeWidth={2}
                />
              )}
            </svg>
          );
        })}
        
        {/* Other Players' Token Targeting Lines - GM visibility only */}
        {role === 'gm' && otherPlayersTargeting && otherPlayersTargeting.size > 0 && (() => {
          const targetingLines: JSX.Element[] = [];
          
          otherPlayersTargeting.forEach((targeting, userId) => {
            if (!targeting.targetTokenId) return;
            
            // Find the source token (the player's character) and target token
            const targetToken = tokens.find(t => t.id === targeting.targetTokenId);
            // Find the source token by characterId if available
            const sourceToken = targeting.characterId 
              ? tokens.find(t => t.characterId === targeting.characterId)
              : null;
            
            if (!targetToken) return;
            
            // Get target token center in world coordinates
            const targetCenterX = targetToken.x + (scene?.gridSize || gridSize) / 2 + 9000;
            const targetCenterY = targetToken.y + (scene?.gridSize || gridSize) / 2 + 9000;
            
            // If we have a source token, draw a line from source to target
            // Otherwise, just show a targeting indicator on the target
            if (sourceToken) {
              const sourceCenterX = sourceToken.x + (scene?.gridSize || gridSize) / 2 + 9000;
              const sourceCenterY = sourceToken.y + (scene?.gridSize || gridSize) / 2 + 9000;
              
              targetingLines.push(
                <g key={`targeting-${userId}`}>
                  {/* Targeting line with gradient */}
                  <line
                    x1={sourceCenterX}
                    y1={sourceCenterY}
                    x2={targetCenterX}
                    y2={targetCenterY}
                    stroke="rgba(239, 68, 68, 0.8)"
                    strokeWidth={3}
                    strokeDasharray="12 6"
                    markerEnd="url(#targeting-arrow)"
                  />
                  {/* Source indicator */}
                  <circle
                    cx={sourceCenterX}
                    cy={sourceCenterY}
                    r={8}
                    fill="rgba(34, 197, 94, 0.6)"
                    stroke="rgba(34, 197, 94, 1)"
                    strokeWidth={2}
                  />
                  {/* Target indicator */}
                  <circle
                    cx={targetCenterX}
                    cy={targetCenterY}
                    r={12}
                    fill="none"
                    stroke="rgba(239, 68, 68, 1)"
                    strokeWidth={3}
                  />
                  {/* Targeting label */}
                  <text
                    x={(sourceCenterX + targetCenterX) / 2}
                    y={(sourceCenterY + targetCenterY) / 2 - 10}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="bold"
                    style={{ textShadow: '0 0 4px rgba(0,0,0,0.9)' }}
                  >
                    {targeting.characterName || targeting.username}
                  </text>
                </g>
              );
            } else {
              // No source token - just show targeting indicator on target
              targetingLines.push(
                <g key={`targeting-${userId}`}>
                  <circle
                    cx={targetCenterX}
                    cy={targetCenterY}
                    r={15}
                    fill="none"
                    stroke="rgba(239, 68, 68, 1)"
                    strokeWidth={3}
                    strokeDasharray="8 4"
                  />
                  <text
                    x={targetCenterX}
                    y={targetCenterY - 20}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="bold"
                    style={{ textShadow: '0 0 4px rgba(0,0,0,0.9)' }}
                  >
                    {targeting.characterName || targeting.username} →
                  </text>
                </g>
              );
            }
          });
          
          if (targetingLines.length === 0) return null;
          
          return (
            <svg
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: '20000px',
                height: '20000px',
                overflow: 'visible',
                zIndex: 23, // Below AoE overlays
              }}
            >
              <defs>
                <marker
                  id="targeting-arrow"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill="rgba(239, 68, 68, 0.9)" />
                </marker>
              </defs>
              {targetingLines}
            </svg>
          );
        })()}
        
        {/* Other Players' Viewport Rectangles - GM visibility only */}
        {role === 'gm' && showPlayerViewports && otherPlayersViewports && otherPlayersViewports.size > 0 && (
          <svg
            className="absolute pointer-events-none"
            style={{
              left: 0,
              top: 0,
              width: '20000px',
              height: '20000px',
              overflow: 'visible',
              zIndex: 22,
            }}
          >
            {Array.from(otherPlayersViewports.values()).map((viewport, index) => {
              const MAP_OFFSET = 9000;
              const worldX = viewport.viewportX + MAP_OFFSET;
              const worldY = viewport.viewportY + MAP_OFFSET;
              const halfWidth = viewport.viewportWidth / 2;
              const halfHeight = viewport.viewportHeight / 2;
              
              const colors = [
                { stroke: 'rgba(34, 211, 238, 0.9)', fill: 'rgba(34, 211, 238, 0.1)' },
                { stroke: 'rgba(251, 146, 60, 0.9)', fill: 'rgba(251, 146, 60, 0.1)' },
                { stroke: 'rgba(168, 85, 247, 0.9)', fill: 'rgba(168, 85, 247, 0.1)' },
                { stroke: 'rgba(74, 222, 128, 0.9)', fill: 'rgba(74, 222, 128, 0.1)' },
                { stroke: 'rgba(251, 191, 36, 0.9)', fill: 'rgba(251, 191, 36, 0.1)' },
                { stroke: 'rgba(248, 113, 113, 0.9)', fill: 'rgba(248, 113, 113, 0.1)' },
              ];
              const color = colors[index % colors.length];
              
              return (
                <g key={viewport.userId}>
                  <rect
                    x={worldX - halfWidth}
                    y={worldY - halfHeight}
                    width={viewport.viewportWidth}
                    height={viewport.viewportHeight}
                    fill={color.fill}
                    stroke={color.stroke}
                    strokeWidth={3}
                    strokeDasharray="12 6"
                  />
                  <text
                    x={worldX - halfWidth + 8}
                    y={worldY - halfHeight + 18}
                    fill={color.stroke}
                    fontSize="14"
                    fontWeight="bold"
                    style={{ textShadow: '0 0 4px rgba(0,0,0,0.9)' }}
                  >
                    {viewport.username}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </motion.div>

      {/* Token Delete Confirmation Dialog */}
      <AlertDialog open={!!tokenToDelete} onOpenChange={(open) => !open && setTokenToDelete(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-200">Delete Token</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              Are you sure you want to delete this token? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-stone-600">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (tokenToDelete && onDeleteToken) {
                  onDeleteToken(tokenToDelete);
                }
                setTokenToDelete(null);
                setShowDeleteButton(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Token Effects Dialog - Apply or remove effects */}
      <Dialog open={!!effectsDialogToken} onOpenChange={(open) => !open && setEffectsDialogToken(null)}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-stone-200 flex items-center gap-2">
              <Flame className="w-5 h-5 text-violet-400" />
              Token Effects
            </DialogTitle>
            <DialogDescription className="text-stone-400">
              Click to apply or remove effects
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allTokenEffects?.map(effect => {
              const activeEffect = effectsDialogToken && tokenActiveEffects?.[effectsDialogToken]?.find(
                ae => ae.effectId === effect.id
              );
              const isActive = !!activeEffect;
              
              return (
                <button
                  key={effect.id}
                  onClick={() => {
                    if (!effectsDialogToken) return;
                    if (isActive && activeEffect) {
                      onRemoveEffect?.(activeEffect.id);
                    } else {
                      onApplyEffect?.(effectsDialogToken, effect.id);
                    }
                  }}
                  className={`w-full flex items-center gap-3 p-2 rounded border transition-colors ${
                    isActive 
                      ? 'bg-violet-600/20 border-violet-500 hover:bg-violet-600/30' 
                      : 'bg-stone-800 border-stone-700 hover:bg-stone-700'
                  }`}
                >
                  <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                    {effect.imageUrl ? (
                      <img src={effect.imageUrl} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-violet-600 flex items-center justify-center">
                        <Flame className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm text-stone-200">{effect.name}</div>
                    {effect.description && (
                      <div className="text-xs text-stone-400 line-clamp-1">{effect.description}</div>
                    )}
                  </div>
                  {isActive && (
                    <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEffectsDialogToken(null)}
              className="w-full border-stone-600"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// 3. HUD (Player)
interface HUDProps {
  character: Character;
  onOpenChat?: () => void;
}

export function HUD({ character, onOpenChat }: HUDProps) {
  return (
    <>
      {/* Inventory Button - Middle right */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-auto z-20">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" className="h-12 w-12 md:h-14 md:w-14 rounded-full bg-amber-900 border-2 border-amber-700 hover:bg-amber-800 shadow-lg">
              <Backpack className="h-6 w-6 text-amber-100" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-stone-900 border-l-stone-800 text-stone-200 sm:max-w-sm w-full">
            <div className="h-full flex flex-col">
              <h2 className="font-display text-2xl mb-4 text-amber-500">Inventory</h2>
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-2">
                  {character.inventory.map((item, i) => (
                    <div key={i} className="p-3 bg-stone-800 rounded border border-stone-700 flex items-center gap-3">
                      <div className="w-10 h-10 bg-black/50 rounded flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-purple-400" />
                      </div>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

// BattleMap Hotbars - Compact display for battlemap overlay
interface BattleMapHotbarsProps {
  character: any;
  tokens?: any[];
  targetedTokenId?: string | null;
  characters?: any[];
  gridSize?: number;
  onEnterAoeMode?: (spell: any, casterTokenId: string) => void;
  aoeTargetState?: AoeTargetState;
  onAoeDamageRoll?: (tokensInAoe: any[], spell: any) => void;
  sceneId?: string;
  thrownItems?: ThrownItem[];
  onRefetchThrownItems?: () => void;
  onEnterThrowableAoeMode?: (item: any, casterToken: any) => void;
  throwableGridTarget?: { x: number; y: number } | null;
  onClearThrowableGridTarget?: () => void;
}

// Sub-component for individual hotbar slot
interface BattleMapHotbarSlotProps {
  hotbar?: Hotbar;
  slotIndex: number;
  type: string;
  color: string;
  character: any;
  allHotbars?: Hotbar[];
  allItems?: any[];
  tokens?: any[];
  targetedTokenId?: string | null;
  allCharacters?: any[];
  gridSize?: number;
  onEnterAoeMode?: (spell: any, casterTokenId: string) => void;
  aoeTargetState?: AoeTargetState;
  onAoeDamageRoll?: (tokensInAoe: any[], spell: any) => void;
  sceneId?: string;
  thrownItems?: ThrownItem[];
  onRefetchThrownItems?: () => void;
  onEnterThrowableAoeMode?: (item: any, casterToken: any) => void;
  throwableGridTarget?: { x: number; y: number } | null;
  onClearThrowableGridTarget?: () => void;
}

// Ranged weapon categories that use ammunition
const RANGED_WEAPON_CATEGORIES = ['bow', 'crossbow', 'sling', 'firearm'];

function BattleMapHotbarSlot({ hotbar, slotIndex, type, color, character, allHotbars, allItems, tokens, targetedTokenId, allCharacters, gridSize = 50, onEnterAoeMode, aoeTargetState, onAoeDamageRoll, sceneId, thrownItems, onRefetchThrownItems, onEnterThrowableAoeMode, throwableGridTarget, onClearThrowableGridTarget }: BattleMapHotbarSlotProps) {
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);
  const queryClient = useQueryClient();
  
  // Long-press modifier popup state
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showModifierPopup, setShowModifierPopup] = useState(false);
  const [extraModifier, setExtraModifier] = useState(0);
  const [hasAdvantage, setHasAdvantage] = useState(false);
  const [hasDisadvantage, setHasDisadvantage] = useState(false);
  
  // Fetch item data if itemId exists (same pattern as HotbarSlot)
  const { data: itemData } = useQuery({
    queryKey: ['item', hotbar?.itemId],
    queryFn: () => api.getItems(character.id).then(items => items.find((i: any) => i.id === hotbar?.itemId)),
    enabled: !!hotbar?.itemId
  });

  // Fetch spell data if spellId exists (same pattern as HotbarSlot)
  const { data: spellData } = useQuery({
    queryKey: ['spell', hotbar?.spellId],
    queryFn: () => api.getSpells(character.id).then(spells => spells.find((s: any) => s.id === hotbar?.spellId)),
    enabled: !!hotbar?.spellId
  });

  // Fetch trait data if traitId exists
  const { data: traitData } = useQuery({
    queryKey: ['trait', hotbar?.traitId],
    queryFn: () => api.getCharacterTraits(character.id).then(traits => traits.find((t: any) => t.id === hotbar?.traitId)),
    enabled: !!hotbar?.traitId
  });

  // Fetch custom skills for skill roll support
  const { data: customSkills = [] } = useQuery({
    queryKey: ['character-custom-skills', character.id],
    queryFn: () => api.getCharacterCustomSkills(character.id),
    enabled: !!character.id && !!hotbar?.skillName
  });

  // Function to check if ammunition breaks (configurable chance) and update quantity
  const checkAmmunitionBreak = async (ammo: any) => {
    const breakChance = (ammo.breakChance ?? 10) / 100; // Convert percentage to probability
    const breakRoll = Math.random();
    if (breakRoll < breakChance) {
      const newQuantity = (ammo.quantity || 1) - 1;
      
      // Calculate total remaining across all matching ammo (before this break)
      const totalRemaining = getTotalAmmunitionQuantity(ammo) - 1;
      
      if (newQuantity <= 0) {
        // Current stack is empty - delete this item
        await api.deleteItem(ammo.id);
        
        // Find another matching ammunition item to equip
        const nextAmmo = allItems?.find((item: any) => 
          item.id !== ammo.id &&
          item.itemType === 'ammunition' && 
          item.name === ammo.name &&
          item.ammunitionType === ammo.ammunitionType &&
          (item.quantity || 1) > 0
        );
        
        if (nextAmmo) {
          // Update hotbar to point to next matching ammunition
          const ammoHotbar = allHotbars?.find((h: Hotbar) => h.hotbarType === 'weapons' && h.slotNumber === 2);
          if (ammoHotbar) {
            await api.upsertHotbar(character.id, { 
              hotbarType: 'weapons', 
              slotNumber: 2, 
              itemId: nextAmmo.id 
            });
          }
          
          triggerRollNotification({
            type: 'system',
            label: `${ammo.name} Broke!`,
            result: 0,
            total: 0,
            username: character.name || 'Unknown',
            characterName: character.name,
            calculationBreakdown: `Stack depleted! ${totalRemaining} ${ammo.name} remaining`,
          });
          
          if (character.campaignId) {
            gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', `An arrow broke! ${totalRemaining} ${ammo.name} remaining.`, 'system');
          }
        } else {
          // No more matching ammunition
          triggerRollNotification({
            type: 'system',
            label: `${ammo.name} Broke!`,
            result: 0,
            total: 0,
            username: character.name || 'Unknown',
            characterName: character.name,
            calculationBreakdown: 'Last arrow used and broke!',
          });
          
          if (character.campaignId) {
            gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', `${ammo.name} broke! No ammunition remaining.`, 'system');
          }
        }
        
        queryClient.invalidateQueries({ queryKey: ['items', character.id] });
        queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
      } else {
        triggerRollNotification({
          type: 'system',
          label: `${ammo.name} Broke!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Arrow broke! ${totalRemaining} remaining`,
        });
        
        if (character.campaignId) {
          gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', `An arrow broke! ${totalRemaining} ${ammo.name} remaining.`, 'system');
        }
        
        await api.updateItem(ammo.id, { quantity: newQuantity });
        queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      }
    }
  };

  // Function to check if a thrown item breaks (for throwables without pickup mode)
  // Returns true if item broke and was deleted, false if it survived
  const checkThrowableBreak = async (thrownItemId: string, item: any): Promise<boolean> => {
    // Only check break chance if pickup mode is disabled
    if (item.throwablePickup) return false;
    
    const breakChance = (item.breakChance ?? 10) / 100; // Convert percentage to probability
    const breakRoll = Math.random();
    
    if (breakRoll < breakChance) {
      // Item broke - delete the thrown item from the map
      try {
        await api.deleteThrownItem(thrownItemId);
        onRefetchThrownItems?.();
        
        triggerRollNotification({
          type: 'system',
          label: `${item.name} Broke!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `The ${item.name} shattered on impact and cannot be recovered.`,
        });
        
        if (character.campaignId) {
          gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', 
            `${item.name} broke on impact!`, 'system');
        }
        
        return true;
      } catch (err) {
        console.error('Failed to delete broken thrown item:', err);
        return false;
      }
    }
    
    return false;
  };

  const getSpellLevelColor = (level: number) => {
    if (level === 0) return 'text-gray-400';
    if (level <= 3) return 'text-blue-400';
    if (level <= 6) return 'text-purple-400';
    return 'text-amber-400';
  };

  // Parse dice notation like "1d8" or "2d6" and roll it
  const rollDice = (notation: string): { result: number; dieType: string } => {
    const match = notation.match(/(\d+)d(\d+)/i);
    if (!match) return { result: 0, dieType: 'd20' };
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return { result: total, dieType: `d${sides}` };
  };

  // Get attribute modifier from character
  const getAttributeModifier = (attrName: string): number => {
    if (!attrName || !character) return 0;
    const attrKey = attrName.toLowerCase() as keyof typeof character;
    return typeof character[attrKey] === 'number' ? character[attrKey] : 0;
  };

  // Check if weapon is a ranged weapon that uses ammunition
  const isRangedWeapon = (weapon: any): boolean => {
    return weapon?.weaponCategory && RANGED_WEAPON_CATEGORIES.includes(weapon.weaponCategory.toLowerCase());
  };

  // Get equipped ammunition from slot 2 of weapons hotbar
  const getEquippedAmmunition = (): any | null => {
    if (!allHotbars || !allItems) return null;
    const ammoHotbar = allHotbars.find((h: Hotbar) => h.hotbarType === 'weapons' && h.slotNumber === 2);
    if (!ammoHotbar?.itemId) return null;
    return allItems.find((i: any) => i.id === ammoHotbar.itemId);
  };

  // Get total quantity of all matching ammunition items (by name and type)
  const getTotalAmmunitionQuantity = (ammoItem: any): number => {
    if (!allItems || !ammoItem) return ammoItem?.quantity || 1;
    
    // Find all ammunition items that match by name and ammunition type
    const matchingAmmo = allItems.filter((item: any) => 
      item.itemType === 'ammunition' && 
      item.name === ammoItem.name &&
      item.ammunitionType === ammoItem.ammunitionType
    );
    
    // Sum up all quantities
    return matchingAmmo.reduce((total: number, item: any) => total + (item.quantity || 1), 0);
  };

  // Get total quantity of all matching stackable items (by name and key properties)
  const getTotalStackedQuantity = (item: any): number => {
    if (!allItems || !item) return item?.quantity || 1;
    // Match items by name and type (same logic as inventory stacking)
    const matchingItems = allItems.filter((i: any) => 
      i.name === item.name &&
      i.itemType === item.itemType &&
      i.damage === item.damage &&
      i.damageType === item.damageType &&
      i.rarity === item.rarity
    );
    return matchingItems.reduce((total: number, i: any) => total + (i.quantity || 1), 0);
  };

  // Check if weapon requires ammunition to attack
  const requiresAmmunitionForRoll = (weaponCategory: string): boolean => {
    return ['bow', 'crossbow', 'sling', 'firearm'].includes(weaponCategory?.toLowerCase() || '');
  };

  // Calculate distance between two points in feet (each grid = 5ft)
  // Uses Chebyshev distance (grid-based) for TTRPG-style range - diagonal adjacent = 1 grid = 5ft
  const calculateDistanceInFeet = (x1: number, y1: number, x2: number, y2: number): number => {
    // Calculate grid distance using Chebyshev distance (max of x and y grid difference)
    // This treats diagonal movement as 1 grid, matching most TTRPG rules
    // Use floor to be lenient with positioning (tokens may not be perfectly grid-aligned)
    const gridDiffX = Math.abs(x2 - x1) / gridSize;
    const gridDiffY = Math.abs(y2 - y1) / gridSize;
    const gridDistance = Math.max(gridDiffX, gridDiffY);
    // Floor the result to be forgiving with token positioning - slightly off grid shouldn't break attacks
    return Math.floor(gridDistance) * 5; // Each grid = 5ft
  };

  // Get attacker's token (the token linked to the character making the attack)
  const getAttackerToken = () => {
    if (!tokens || !character?.id) return null;
    return tokens.find((t: any) => t.characterId === character.id);
  };

  // Get target token and its character data
  // Returns characterId from token even if full character data isn't available (for enemies)
  const getTargetData = () => {
    if (!tokens || !targetedTokenId) return null;
    const targetToken = tokens.find((t: any) => t.id === targetedTokenId);
    if (!targetToken) return null;
    const targetCharacter = targetToken.characterId && allCharacters
      ? allCharacters.find((c: any) => c.id === targetToken.characterId)
      : null;
    // Return characterId from token for damage application even without full character data
    return { 
      token: targetToken, 
      character: targetCharacter,
      characterId: targetToken.characterId || null  // Always include token's characterId
    };
  };

  // Handle attack roll (1d20 + attribute modifier)
  // Options allow for extra modifiers and advantage/disadvantage from the popup
  const handleAttackRoll = async (options?: { extraMod?: number; advantage?: boolean; disadvantage?: boolean }) => {
    // Allow weapons and damaging consumables
    const isDamagingConsumable = itemData && itemData.itemType === 'consumable' && itemData.isDamaging;
    if (!itemData || (itemData.itemType !== 'weapon' && !isDamagingConsumable)) return;
    
    // Guard: prevent using exhausted damaging consumables
    if (isDamagingConsumable && (itemData.quantity || 1) <= 0) {
      triggerRollNotification({
        type: 'system',
        label: `${itemData.name} - Exhausted!`,
        result: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown: 'No consumables remaining',
      });
      return;
    }
    
    // Check if ranged weapon requires ammunition (skip for damaging consumables)
    const ammo = !isDamagingConsumable && isRangedWeapon(itemData) && itemData.weaponCategory && requiresAmmunitionForRoll(itemData.weaponCategory) 
      ? getEquippedAmmunition() 
      : null;
    
    if (!isDamagingConsumable && isRangedWeapon(itemData) && itemData.weaponCategory && requiresAmmunitionForRoll(itemData.weaponCategory) && !ammo) {
      triggerRollNotification({
        type: 'attack',
        dieType: 'd20',
        label: `${itemData.name} - No Ammo!`,
        result: 0,
        modifier: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
      });
      return;
    }
    
    // Get targeting data for range check and hit detection
    const attackerToken = getAttackerToken();
    const targetData = getTargetData();
    
    // If targeting a token, check range (skip range check if attacker or target data is missing)
    if (targetedTokenId && targetData?.token && attackerToken) {
      const distance = calculateDistanceInFeet(
        attackerToken.x, attackerToken.y,
        targetData.token.x, targetData.token.y
      );
      
      // Determine range:
      // - Damaging consumables: always 5ft
      // - Ranged weapons: explicit range or 120ft default
      // - Melee weapons: explicit range or 5ft default
      let itemRange: number;
      if (isDamagingConsumable) {
        itemRange = 5; // Damaging consumables always use 5ft range
      } else if (isRangedWeapon(itemData)) {
        itemRange = itemData.range || 120;
      } else {
        itemRange = itemData.range || 5;
      }
      const weaponRange = itemRange;
      
      console.log('[Range Check]', {
        attacker: { x: attackerToken.x, y: attackerToken.y },
        target: { x: targetData.token.x, y: targetData.token.y },
        gridSize,
        distance,
        weaponRange,
        isRanged: isRangedWeapon(itemData),
        itemRange: itemData.range
      });
      
      if (distance > weaponRange) {
        triggerRollNotification({
          type: 'system',
          label: `${itemData.name} - Out of Range!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Target not within range (${distance}ft > ${weaponRange}ft)`,
        });
        return;
      }
    }
    
    const attrName = itemData.attribute || 'might';
    const attrMod = getAttributeModifier(attrName);
    const extraMod = options?.extraMod || 0;
    const totalMod = attrMod + extraMod;
    
    // Determine advantage type (if both, they cancel out)
    const hasAdv = options?.advantage && !options?.disadvantage;
    const hasDis = options?.disadvantage && !options?.advantage;
    
    // Roll dice - with advantage/disadvantage, roll 2d20 and take highest/lowest
    let roll: number;
    let roll1: number;
    let roll2: number | undefined;
    let rollText: string;
    
    if (hasAdv || hasDis) {
      roll1 = Math.floor(Math.random() * 20) + 1;
      roll2 = Math.floor(Math.random() * 20) + 1;
      roll = hasAdv ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
      const keptLabel = hasAdv ? 'ADV' : 'DIS';
      rollText = `2d20${keptLabel === 'ADV' ? 'kh' : 'kl'} [${roll1}, ${roll2}] = ${roll}`;
    } else {
      roll1 = Math.floor(Math.random() * 20) + 1;
      roll = roll1;
      rollText = `1d20 = ${roll}`;
    }
    
    const total = roll + totalMod;
    
    // Build calculation breakdown
    const attrDisplayName = attrName.charAt(0).toUpperCase() + attrName.slice(1);
    const modParts: string[] = [];
    if (attrMod !== 0) modParts.push(`${attrDisplayName} (${attrMod >= 0 ? '+' : ''}${attrMod})`);
    if (extraMod !== 0) modParts.push(`Extra (${extraMod >= 0 ? '+' : ''}${extraMod})`);
    
    const calculationBreakdown = modParts.length > 0 
      ? `${rollText} + ${modParts.join(' + ')}`
      : rollText;
    
    // Determine hit/miss status if targeting
    const isCritSuccess = roll === 20; // Natural 20
    const isCritFailure = roll === 1;  // Natural 1
    let hitStatus = '';
    let hitLabel = '';
    
    // Check for hit/miss when targeting a token with a linked character
    // Use character data if available, otherwise use defaults for enemy tokens
    if (targetedTokenId && targetData?.characterId) {
      const targetDC = targetData.character?.naturalArmor || 10; // Default DC is 10 if no naturalArmor or no character data
      const targetName = targetData.character?.name || targetData.token?.name || 'Target';
      
      if (isCritSuccess) {
        hitStatus = ' - Crit Success!';
        hitLabel = `vs ${targetName} (DC ${targetDC}) - Crit Success!`;
      } else if (isCritFailure) {
        hitStatus = ' - Crit Failure!';
        hitLabel = `vs ${targetName} (DC ${targetDC}) - Crit Failure!`;
      } else if (total >= targetDC) {
        hitStatus = ' - HIT!';
        hitLabel = `vs ${targetName} (DC ${targetDC}) - HIT!`;
      } else {
        hitStatus = ' - MISS!';
        hitLabel = `vs ${targetName} (DC ${targetDC}) - MISS!`;
      }
    }
    
    triggerRollNotification({
      type: 'attack',
      dieType: 'd20',
      label: `${itemData.name} Attack${hasAdv ? ' (ADV)' : hasDis ? ' (DIS)' : ''}${hitStatus}`,
      result: roll,
      modifier: totalMod,
      total,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown: hitLabel ? `${calculationBreakdown} ${hitLabel}` : calculationBreakdown,
    });
    
    // Send roll to chat
    if (character.campaignId) {
      const chatText = `${itemData.name} Attack${hasAdv ? ' (ADV)' : hasDis ? ' (DIS)' : ''}: ${calculationBreakdown} = ${total}${hitStatus}`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
    
    // Check for ammunition break for ranged weapons
    if (ammo) {
      await checkAmmunitionBreak(ammo);
    }
    
    // On critical failure, weapon loses 1 durability
    if (isCritFailure && itemData.durability !== undefined) {
      const newDurability = Math.max(0, (itemData.durability || 0) - 1);
      try {
        await api.updateItem(itemData.id, { durability: newDurability });
        queryClient.invalidateQueries({ queryKey: ['item', hotbar?.itemId] });
        queryClient.invalidateQueries({ queryKey: ['character-items', character.id] });
        
        if (newDurability === 0) {
          triggerRollNotification({
            type: 'system',
            label: `${itemData.name} Broke!`,
            result: 0,
            total: 0,
            username: character.name || 'Unknown',
            characterName: character.name,
            calculationBreakdown: `Critical failure! ${itemData.name} has lost all durability and is now broken.`,
          });
          if (character.campaignId) {
            gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', 
              `${itemData.name} broke from a critical failure!`, 'system');
          }
        } else {
          triggerRollNotification({
            type: 'system',
            label: `${itemData.name} Damaged!`,
            result: 0,
            total: 0,
            username: character.name || 'Unknown',
            characterName: character.name,
            calculationBreakdown: `Critical failure! ${itemData.name} durability: ${newDurability}/${10}`,
          });
        }
      } catch (err) {
        console.error('Failed to update weapon durability:', err);
      }
    }
  };

  // Apply damage to target character with armor damage reduction
  // If damageType is "Health", this heals instead of damaging
  // If damageType is "Energy", this affects energy instead of HP (gainEnergy determines add vs subtract)
  // Uses WebSocket combat damage which bypasses edit permission checks
  // targetCharacterId allows damage application even when full character data isn't available (for enemy targets)
  const applyDamageToTarget = async (damageAmount: number, damageType: string | null, targetCharacter: any, gainEnergy?: boolean, targetCharacterId?: string | null): Promise<{ finalDamage: number; reduction: number; armorName: string | null; isHealing: boolean; isEnergy?: boolean; targetName?: string }> => {
    // Use targetCharacter.id if available, otherwise fall back to explicit targetCharacterId
    const charId = targetCharacter?.id || targetCharacterId;
    const targetName = targetCharacter?.name || 'Target';
    
    if (!charId) return { finalDamage: damageAmount, reduction: 0, armorName: null, isHealing: false };
    
    // Check if this is healing (Health damage type)
    const isHealing = damageType === 'Health';
    
    // Check if this is energy effect
    const isEnergy = damageType === 'Energy';
    
    // For healing, no armor reduction applies
    if (isHealing) {
      console.log('[Healing] Applying', damageAmount, 'healing to', targetName);
      // Use WebSocket combat damage which bypasses edit permissions
      gameWs.sendCombatDamage(
        charId,
        damageAmount,
        damageType || undefined,
        character?.name || 'Unknown',
        true // isHealing
      );
      return { finalDamage: damageAmount, reduction: 0, armorName: null, isHealing: true, targetName };
    }
    
    // For energy effects, no armor reduction applies
    if (isEnergy) {
      console.log('[Energy] Applying', damageAmount, 'energy', gainEnergy ? 'gain' : 'drain', 'to', targetName);
      // Use WebSocket combat energy which bypasses edit permissions
      gameWs.sendCombatEnergy(
        charId,
        damageAmount,
        character?.name || 'Unknown',
        gainEnergy || false // isGain
      );
      return { finalDamage: damageAmount, reduction: 0, armorName: null, isHealing: false, isEnergy: true, targetName };
    }
    
    // Fetch target's items and traits to check for damage reduction
    // Note: This may fail for enemy characters the player doesn't have access to - that's OK, we'll apply full damage
    let reduction = 0;
    let armorName: string | null = null;
    let traitReduction = 0;
    let traitResistance = false;
    let traitImmune = false;
    let traitName: string | null = null;
    
    try {
      const targetItems = await api.getItems(charId);
      const targetHotbars = await api.getHotbars(charId);
      const targetTraits = await api.getCharacterTraits(charId);
      
      // Find equipped armor items (from armor hotbar slots 0-4: helm, chest, arm, legs, boots)
      const equippedArmorIds = targetHotbars
        .filter((h: any) => h.hotbarType === 'armor' && h.slotNumber >= 0 && h.slotNumber <= 4 && h.itemId)
        .map((h: any) => h.itemId);
      
      const equippedArmor = targetItems.filter((item: any) => 
        item.itemType === 'armor' && equippedArmorIds.includes(item.id)
      );
      
      // Calculate total damage reduction from armor matching the damage type
      for (const armor of equippedArmor) {
        if (damageType && armor.damageReductionType === damageType && (armor.damageReduction || 0) > 0) {
          reduction += armor.damageReduction || 0;
          armorName = armor.name; // Track the last armor that provided reduction
        }
      }
      
      // Check traits for damage reduction/resistance/immunity
      for (const trait of targetTraits) {
        if (damageType && trait.damageModifierType && trait.damageModifierType !== 'none' && trait.damageModifierDamageType === damageType) {
          if (trait.damageModifierType === 'immune') {
            traitImmune = true;
            traitName = trait.name;
            break; // Immunity takes precedence
          } else if (trait.damageModifierType === 'resistance') {
            traitResistance = true;
            traitName = trait.name;
          } else if (trait.damageModifierType === 'reduce') {
            traitReduction += trait.damageModifierValue || 0;
            traitName = trait.name;
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch target armor/traits for damage reduction:', error);
    }
    
    // Calculate final damage
    let finalDamage = damageAmount;
    
    // Apply immunity first (takes precedence)
    if (traitImmune) {
      console.log('[Damage] Target is immune to', damageType, 'via', traitName);
      finalDamage = 0;
    } else {
      // Apply armor reduction
      finalDamage = Math.max(0, finalDamage - reduction);
      
      // Apply trait flat reduction
      finalDamage = Math.max(0, finalDamage - traitReduction);
      
      // Apply resistance (half damage) after reductions
      if (traitResistance && finalDamage > 0) {
        console.log('[Damage] Target has resistance to', damageType, 'via', traitName);
        finalDamage = Math.floor(finalDamage / 2);
      }
    }
    
    // Apply damage using WebSocket - bypasses edit permission checks
    // Anyone in the campaign can apply combat damage (send single message only)
    console.log('[Damage] Applying', finalDamage, 'damage to', targetName, traitImmune ? '(IMMUNE)' : '');
    gameWs.sendCombatDamage(
      charId,
      finalDamage,
      damageType || undefined,
      character?.name || 'Unknown',
      false // isHealing
    );
    
    return { finalDamage, reduction: reduction + traitReduction, armorName: armorName || traitName, isHealing: false, targetName };
  };

  // Handle damage roll (weapon damage dice + mod, or ammunition damage for ranged weapons)
  const handleDamageRoll = async (options?: { extraMod?: number }) => {
    if (!itemData) return;
    
    // Guard: prevent using exhausted damaging consumables
    const isDamagingConsumable = itemData.itemType === 'consumable' && itemData.isDamaging;
    if (isDamagingConsumable && (itemData.quantity || 1) <= 0) {
      triggerRollNotification({
        type: 'system',
        label: `${itemData.name} - Exhausted!`,
        result: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown: 'No consumables remaining',
      });
      return;
    }
    
    const extraMod = options?.extraMod || 0;
    const targetData = getTargetData();
    
    // For ranged weapons, use ammunition damage + both weapon mod and ammo mod
    if (isRangedWeapon(itemData)) {
      const ammo = getEquippedAmmunition();
      if (!ammo || !ammo.damage) {
        triggerRollNotification({
          type: 'attack',
          dieType: 'd20',
          label: 'No Ammunition!',
          result: 0,
          modifier: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
        });
        return;
      }
      
      const { result, dieType } = rollDice(ammo.damage);
      const weaponMod = itemData.mod || 0;
      const ammoMod = ammo.mod || 0;
      const totalMod = weaponMod + ammoMod + extraMod;
      const total = result + totalMod;
      const damageType = ammo.damageType || itemData.damageType || null;
      
      // Build calculation breakdown
      const modParts: string[] = [];
      if (weaponMod !== 0) modParts.push(`${itemData.name} (${weaponMod >= 0 ? '+' : ''}${weaponMod})`);
      if (ammoMod !== 0) modParts.push(`${ammo.name} (${ammoMod >= 0 ? '+' : ''}${ammoMod})`);
      if (extraMod !== 0) modParts.push(`Extra (${extraMod >= 0 ? '+' : ''}${extraMod})`);
      let calculationBreakdown = modParts.length > 0
        ? `${ammo.damage} = ${result} + ${modParts.join(' + ')}`
        : `${ammo.damage} = ${result}`;
      
      // Apply damage to target if one is selected (characterId allows damage to enemies without full character data)
      let damageLabel = `${itemData.name} Damage`;
      let finalTotal = total;
      
      if (targetedTokenId && targetData?.characterId) {
        const { finalDamage, reduction, armorName, isHealing, targetName } = await applyDamageToTarget(total, damageType, targetData.character, undefined, targetData.characterId);
        finalTotal = finalDamage;
        const displayName = targetData.character?.name || targetData.token?.name || targetName || 'Target';
        
        if (isHealing) {
          damageLabel = `${itemData.name} Healing → ${displayName} (+${finalDamage} HP)`;
        } else if (reduction > 0) {
          calculationBreakdown += ` - ${reduction} (${armorName || 'Armor'})`;
          damageLabel = `${itemData.name} Damage → ${displayName} (-${finalDamage} HP)`;
        } else {
          damageLabel = `${itemData.name} Damage → ${displayName} (-${finalDamage} HP)`;
        }
      }
      
      triggerRollNotification({
        type: 'attack',
        dieType: dieType as any,
        label: damageLabel,
        result,
        modifier: totalMod,
        total: finalTotal,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown,
      });
      
      // Send roll to chat
      if (character.campaignId) {
        const isHealing = damageType === 'Health';
        const displayName = targetData?.character?.name || targetData?.token?.name || 'Target';
        const chatText = targetedTokenId && targetData?.characterId
          ? `${itemData.name} ${isHealing ? 'Healing' : 'Damage'} → ${displayName}: ${calculationBreakdown} = ${finalTotal} HP`
          : `${itemData.name} ${isHealing ? 'Healing' : 'Damage'}: ${calculationBreakdown} = ${total}`;
        gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
      }
      return;
    }
    
    // For melee/thrown weapons, use weapon damage
    if (!itemData.damage) return;
    
    const { result, dieType } = rollDice(itemData.damage);
    const mod = (itemData.mod || 0) + extraMod;
    const total = result + mod;
    const damageType = itemData.damageType || null;
    
    // Build calculation breakdown
    const modParts: string[] = [];
    if (itemData.mod) modParts.push(`Mod (${itemData.mod >= 0 ? '+' : ''}${itemData.mod})`);
    if (extraMod !== 0) modParts.push(`Extra (${extraMod >= 0 ? '+' : ''}${extraMod})`);
    let calculationBreakdown = modParts.length > 0
      ? `${itemData.damage} = ${result} + ${modParts.join(' + ')}`
      : `${itemData.damage} = ${result}`;
    
    // Apply damage to target if one is selected (characterId allows damage to enemies without full character data)
    let damageLabel = `${itemData.name} Damage`;
    let finalTotal = total;
    
    if (targetedTokenId && targetData?.characterId) {
      const { finalDamage, reduction, armorName, isHealing, targetName } = await applyDamageToTarget(total, damageType, targetData.character, undefined, targetData.characterId);
      finalTotal = finalDamage;
      const displayName = targetData.character?.name || targetData.token?.name || targetName || 'Target';
      
      if (isHealing) {
        damageLabel = `${itemData.name} Healing → ${displayName} (+${finalDamage} HP)`;
      } else if (reduction > 0) {
        calculationBreakdown += ` - ${reduction} (${armorName || 'Armor'})`;
        damageLabel = `${itemData.name} Damage → ${displayName} (-${finalDamage} HP)`;
      } else {
        damageLabel = `${itemData.name} Damage → ${displayName} (-${finalDamage} HP)`;
      }
    }
    
    triggerRollNotification({
      type: 'attack',
      dieType: dieType as any,
      label: damageLabel,
      result,
      modifier: mod,
      total: finalTotal,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    // Send roll to chat
    if (character.campaignId) {
      const isHealing = damageType === 'Health';
      const displayName = targetData?.character?.name || targetData?.token?.name || 'Target';
      const chatText = targetedTokenId && targetData?.characterId
        ? `${itemData.name} ${isHealing ? 'Healing' : 'Damage'} → ${displayName}: ${calculationBreakdown} = ${finalTotal} HP`
        : `${itemData.name} ${isHealing ? 'Healing' : 'Damage'}: ${calculationBreakdown} = ${total}`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
    
    // Consume the damaging consumable after damage is applied
    // (isDamagingConsumable already declared at function start)
    if (itemData.itemType === 'consumable' && itemData.isDamaging) {
      try {
        const currentQty = itemData.quantity || 1;
        if (currentQty <= 1) {
          // Delete the item if quantity reaches 0
          await api.deleteItem(itemData.id);
          // Clear the hotbar slot
          if (hotbar) {
            await api.deleteHotbar(hotbar.id);
          }
        } else {
          // Decrement quantity
          await api.updateItem(itemData.id, { quantity: currentQty - 1 });
        }
        // Invalidate queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ['item', hotbar?.itemId] });
        queryClient.invalidateQueries({ queryKey: ['items', character.id] });
        queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
      } catch (err) {
        console.error('Failed to consume damaging consumable:', err);
      }
    }
  };

  // Long-press handlers for opening modifier popup
  const handlePointerDown = () => {
    if (!isClickable) return;
    longPressTimerRef.current = setTimeout(() => {
      setShowModifierPopup(true);
    }, 500); // 500ms hold to open popup
  };
  
  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  
  const handlePointerLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  
  // Execute roll from modifier popup
  const handleModifiedAttackRoll = async () => {
    await handleAttackRoll({ 
      extraMod: extraModifier, 
      advantage: hasAdvantage, 
      disadvantage: hasDisadvantage 
    });
    // Reset and close popup
    setShowModifierPopup(false);
    setExtraModifier(0);
    setHasAdvantage(false);
    setHasDisadvantage(false);
  };
  
  const handleModifiedDamageRoll = async () => {
    await handleDamageRoll({ extraMod: extraModifier });
    // Reset and close popup
    setShowModifierPopup(false);
    setExtraModifier(0);
    setHasAdvantage(false);
    setHasDisadvantage(false);
  };

  // Skill to Attribute mapping
  const SKILL_ATTRIBUTE_MAP: Record<string, keyof typeof character> = {
    // Might (mig)
    'Strength': 'might',
    // Finesse (fin)
    'Agility': 'finesse',
    'Sleight of Hand': 'finesse',
    'Stealth': 'finesse',
    // Wit (wit)
    'Arcana': 'wit',
    'History': 'wit',
    'Investigation': 'wit',
    'Perception': 'wit',
    'Wisdom': 'wit',
    'Culture': 'wit',
    // Presence (pre)
    'Charisma': 'presence',
    'Deception': 'presence',
    'Intimidation': 'presence',
    // Craft (cra)
    'Medicine': 'craft',
    // Will (wil)
    'Concentration': 'will',
    'Survival': 'will',
    'Beast Handling': 'will',
  };

  // Handle skill roll (1d20/1d30 + skill modifier + attribute modifier)
  const handleSkillRoll = (options?: { extraMod?: number; advantage?: boolean; disadvantage?: boolean }) => {
    if (!hotbar?.skillName) return;
    
    const skillName = hotbar.skillName;
    
    // Check if this is a custom skill first (case-insensitive match)
    const customSkill = customSkills.find((cs: any) => cs.name?.toLowerCase() === skillName.toLowerCase());
    
    let skillModifier: number;
    let attributeKey: keyof typeof character | undefined;
    let attributeValue: number;
    
    if (customSkill) {
      // Custom skill: use its value and parentAttribute
      skillModifier = customSkill.value || 0;
      // Map parentAttribute to character attribute key
      const attrMapping: Record<string, keyof typeof character> = {
        'might': 'might', 'mig': 'might',
        'finesse': 'finesse', 'fin': 'finesse',
        'wit': 'wit',
        'presence': 'presence', 'pre': 'presence',
        'will': 'will', 'wil': 'will',
        'craft': 'craft', 'cra': 'craft',
      };
      attributeKey = attrMapping[customSkill.parentAttribute?.toLowerCase() || 'wit'];
      attributeValue = attributeKey && typeof character[attributeKey] === 'number' ? character[attributeKey] as number : 0;
    } else {
      // Standard skill: use character's skill value and SKILL_ATTRIBUTE_MAP
      const skillKey = `skill${skillName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('')}` as keyof typeof character;
      skillModifier = typeof character[skillKey] === 'number' ? character[skillKey] : 0;
      
      attributeKey = SKILL_ATTRIBUTE_MAP[skillName];
      if (!attributeKey) {
        console.warn(`[SkillRoll] Unknown skill "${skillName}" - no attribute mapping found, using 0 modifier`);
      }
      attributeValue = attributeKey && typeof character[attributeKey] === 'number' ? character[attributeKey] as number : 0;
    }
    
    // DEBUG: Log all values
    console.log('[SkillRoll DEBUG]', {
      skillName,
      isCustomSkill: !!customSkill,
      skillModifier,
      attributeKey,
      attributeValue,
      characterId: character?.id,
    });
    
    // Determine die type: d30 if attribute >= 5, otherwise d20
    const dieMax = attributeValue >= 5 ? 30 : 20;
    const dieType = attributeValue >= 5 ? 'd30' : 'd20';
    
    const extraMod = options?.extraMod || 0;
    const hasAdv = options?.advantage || false;
    const hasDisadv = options?.disadvantage || false;
    
    // Roll dice (or 2 dice for advantage/disadvantage)
    let roll1 = Math.floor(Math.random() * dieMax) + 1;
    let roll2 = Math.floor(Math.random() * dieMax) + 1;
    let baseRoll = roll1;
    let advLabel = '';
    
    if (hasAdv && !hasDisadv) {
      baseRoll = Math.max(roll1, roll2);
      advLabel = ` (Adv: ${roll1}, ${roll2})`;
    } else if (hasDisadv && !hasAdv) {
      baseRoll = Math.min(roll1, roll2);
      advLabel = ` (Disadv: ${roll1}, ${roll2})`;
    }
    
    // Total = base roll + skill modifier + attribute modifier + extra mod
    const totalModifier = skillModifier + attributeValue + extraMod;
    const total = baseRoll + totalModifier;
    
    // Build calculation breakdown
    let calculationBreakdown = `1${dieType} = ${baseRoll}`;
    if (skillModifier !== 0) calculationBreakdown += ` + ${skillName} (+${skillModifier})`;
    if (attributeValue !== 0 && attributeKey) {
      const attrName = String(attributeKey).charAt(0).toUpperCase() + String(attributeKey).slice(1);
      calculationBreakdown += ` + ${attrName} (+${attributeValue})`;
    }
    if (extraMod !== 0) calculationBreakdown += ` + Mod (+${extraMod})`;
    calculationBreakdown += advLabel;
    
    // Check for crit success/failure (nat 20 on d20, nat 30 on d30)
    const critMax = dieMax;
    let resultLabel = `${skillName} Check`;
    if (baseRoll === critMax) {
      resultLabel = `${skillName} Check - Crit Success!`;
    } else if (baseRoll === 1) {
      resultLabel = `${skillName} Check - Crit Failure!`;
    }
    
    triggerRollNotification({
      type: 'dice',
      dieType: dieType as any,
      label: resultLabel,
      result: baseRoll,
      modifier: totalModifier,
      total,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    // Send roll to chat
    if (character.campaignId) {
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', `${skillName} Check: ${calculationBreakdown} = ${total}`, 'roll');
    }
  };
  
  const handleModifiedSkillRoll = () => {
    handleSkillRoll({ 
      extraMod: extraModifier, 
      advantage: hasAdvantage, 
      disadvantage: hasDisadvantage 
    });
    // Reset and close popup
    setShowModifierPopup(false);
    setExtraModifier(0);
    setHasAdvantage(false);
    setHasDisadvantage(false);
  };

  // Handle trait roll (1d20 + attribute modifier) - uses one of the trait's uses
  const handleTraitRoll = async (options?: { extraMod?: number; advantage?: boolean; disadvantage?: boolean }) => {
    if (!traitData) return;
    
    // Check if trait has uses remaining
    if (traitData.currentUses >= traitData.usesPerLongRest) {
      triggerRollNotification({
        type: 'system',
        label: `${traitData.name} - No Uses!`,
        result: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown: `No uses remaining (${traitData.currentUses}/${traitData.usesPerLongRest})`,
      });
      return;
    }
    
    // Get attribute modifier for the trait
    const attrName = traitData.parentAttribute || 'will';
    const attrMod = getAttributeModifier(attrName);
    const extraMod = options?.extraMod || 0;
    const totalMod = attrMod + extraMod;
    
    // Determine advantage/disadvantage
    const hasAdv = options?.advantage && !options?.disadvantage;
    const hasDis = options?.disadvantage && !options?.advantage;
    
    // Roll dice
    let roll1 = Math.floor(Math.random() * 20) + 1;
    let roll2 = Math.floor(Math.random() * 20) + 1;
    let roll = roll1;
    let advLabel = '';
    
    if (hasAdv) {
      roll = Math.max(roll1, roll2);
      advLabel = ` (Adv: ${roll1}, ${roll2})`;
    } else if (hasDis) {
      roll = Math.min(roll1, roll2);
      advLabel = ` (Disadv: ${roll1}, ${roll2})`;
    }
    
    const total = roll + totalMod;
    
    // Build calculation breakdown
    const attrDisplayName = attrName.charAt(0).toUpperCase() + attrName.slice(1);
    let calculationBreakdown = `1d20 = ${roll}`;
    if (attrMod !== 0) calculationBreakdown += ` + ${attrDisplayName} (${attrMod >= 0 ? '+' : ''}${attrMod})`;
    if (extraMod !== 0) calculationBreakdown += ` + Mod (${extraMod >= 0 ? '+' : ''}${extraMod})`;
    calculationBreakdown += advLabel;
    
    triggerRollNotification({
      type: 'dice',
      dieType: 'd20',
      label: `${traitData.name}`,
      result: roll,
      modifier: totalMod,
      total,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    // Use the trait (increment currentUses)
    try {
      await api.useCharacterTrait(character.id, traitData.id);
      queryClient.invalidateQueries({ queryKey: ['trait', hotbar?.traitId] });
      queryClient.invalidateQueries({ queryKey: ['character-traits', character.id] });
    } catch (err) {
      console.error('Failed to use trait:', err);
    }
    
    // Send roll to chat
    if (character.campaignId) {
      const usesAfter = traitData.currentUses + 1;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', 
        `${traitData.name}: ${calculationBreakdown} = ${total} (${usesAfter}/${traitData.usesPerLongRest} uses)`, 'roll');
    }
  };

  const handleModifiedTraitRoll = () => {
    handleTraitRoll({ 
      extraMod: extraModifier, 
      advantage: hasAdvantage, 
      disadvantage: hasDisadvantage 
    });
    // Reset and close popup
    setShowModifierPopup(false);
    setExtraModifier(0);
    setHasAdvantage(false);
    setHasDisadvantage(false);
  };
  
  const isWeaponClickable = itemData && itemData.itemType === 'weapon';
  const isDamagingConsumableClickable = itemData && itemData.itemType === 'consumable' && itemData.isDamaging;
  const isThrowableClickable = itemData && itemData.isThrowable;
  const isSkillClickable = !!hotbar?.skillName;
  const isSpellClickable = !!spellData;
  const isTraitClickable = !!traitData;
  const isClickable = isWeaponClickable || isDamagingConsumableClickable || isThrowableClickable || isSkillClickable || isSpellClickable || isTraitClickable;

  // Handle throwing an item (place at AOE target location or throw to targeted token)
  const handleThrowItem = async () => {
    if (!itemData || !itemData.isThrowable || !sceneId) return;
    
    // Get weapon range - use range field or default to 30ft for throwables
    const weaponRange = itemData.range || itemData.rangeNum || 30;
    
    // Get attacker token for range calculation
    const attackerToken = getAttackerToken();
    
    // Priority 1: If a token is targeted, throw item attached to that token
    if (targetedTokenId) {
      // Range check - validate target is within weapon range
      const targetToken = tokens?.find((t: any) => t.id === targetedTokenId);
      if (attackerToken && targetToken) {
        const distanceFt = calculateDistanceInFeet(attackerToken.x, attackerToken.y, targetToken.x, targetToken.y);
        if (distanceFt > weaponRange) {
          triggerRollNotification({
            type: 'system',
            label: `${itemData.name} - Out of Range!`,
            result: 0,
            total: 0,
            username: character.name || 'Unknown',
            characterName: character.name,
            calculationBreakdown: `Target is ${distanceFt}ft away. ${itemData.name} has a range of ${weaponRange}ft.`,
          });
          return;
        }
      }
      
      // Check quantity
      if ((itemData.quantity || 0) < 1) {
        triggerRollNotification({
          type: 'system',
          label: `No ${itemData.name} left!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `You have no ${itemData.name} remaining to throw.`,
        });
        return;
      }
      
      // Get target token for position and name (reuse from range check if available)
      const throwTargetToken = tokens?.find((t: any) => t.id === targetedTokenId);
      const targetCharacter = throwTargetToken?.characterId 
        ? allCharacters?.find((c: any) => c.id === throwTargetToken.characterId)
        : null;
      const targetName = targetCharacter?.name || 'target';
      
      try {
        const thrownItem = await api.createThrownItem(sceneId, {
          itemId: itemData.id,
          characterId: character.id,
          x: throwTargetToken?.x ?? 0,
          y: throwTargetToken?.y ?? 0,
          attachedToTokenId: targetedTokenId,
        });
        
        // Decrement item quantity
        await api.updateItem(itemData.id, { quantity: (itemData.quantity || 1) - 1 });
        queryClient.invalidateQueries({ queryKey: ['item', hotbar?.itemId] });
        queryClient.invalidateQueries({ queryKey: ['character-items', character.id] });
        
        // Broadcast via WebSocket
        gameWs.sendThrownItemPlaced(thrownItem, sceneId);
        
        // Refetch thrown items
        onRefetchThrownItems?.();
        
        // Notify
        triggerRollNotification({
          type: 'system',
          label: `${itemData.name} Thrown!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Attached to ${targetName}`,
        });
        
        if (character.campaignId) {
          gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', 
            `Threw ${itemData.name} at ${targetName}`, 'action');
        }
        
        // Check if throwable breaks on impact (for items without pickup mode)
        await checkThrowableBreak(thrownItem.id, itemData);
      } catch (err) {
        console.error('Failed to throw item at target:', err);
      }
      return;
    }
    
    // Priority 2: Grid target selected in Target mode - throw to that location
    if (throwableGridTarget) {
      // Range check - validate grid target is within weapon range
      if (attackerToken) {
        const effectiveGridSize = gridSize || 50;
        // Convert grid coordinates to pixel coordinates for distance calculation
        const gridCenterX = (throwableGridTarget.x + 0.5) * effectiveGridSize;
        const gridCenterY = (throwableGridTarget.y + 0.5) * effectiveGridSize;
        const attackerCenterX = attackerToken.x + effectiveGridSize / 2;
        const attackerCenterY = attackerToken.y + effectiveGridSize / 2;
        const distanceFt = calculateDistanceInFeet(attackerCenterX, attackerCenterY, gridCenterX, gridCenterY);
        if (distanceFt > weaponRange) {
          triggerRollNotification({
            type: 'system',
            label: `${itemData.name} - Out of Range!`,
            result: 0,
            total: 0,
            username: character.name || 'Unknown',
            characterName: character.name,
            calculationBreakdown: `Target is ${distanceFt}ft away. ${itemData.name} has a range of ${weaponRange}ft.`,
          });
          return;
        }
      }
      
      // Check quantity
      if ((itemData.quantity || 0) < 1) {
        triggerRollNotification({
          type: 'system',
          label: `No ${itemData.name} left!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `You have no ${itemData.name} remaining to throw.`,
        });
        return;
      }
      
      try {
        const thrownItem = await api.createThrownItem(sceneId, {
          itemId: itemData.id,
          characterId: character.id,
          x: throwableGridTarget.x,
          y: throwableGridTarget.y,
        });
        
        // Decrement item quantity
        await api.updateItem(itemData.id, { quantity: (itemData.quantity || 1) - 1 });
        queryClient.invalidateQueries({ queryKey: ['item', hotbar?.itemId] });
        queryClient.invalidateQueries({ queryKey: ['character-items', character.id] });
        
        // Broadcast via WebSocket
        gameWs.sendThrownItemPlaced(thrownItem, sceneId);
        
        // Refetch thrown items
        onRefetchThrownItems?.();
        
        // Clear the grid target after throwing
        onClearThrowableGridTarget?.();
        
        // Notify
        triggerRollNotification({
          type: 'system',
          label: `${itemData.name} Thrown!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Placed at grid position (${throwableGridTarget.x}, ${throwableGridTarget.y})`,
        });
        
        if (character.campaignId) {
          gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', 
            `Threw ${itemData.name} at grid (${throwableGridTarget.x}, ${throwableGridTarget.y})`, 'action');
        }
        
        // Check if throwable breaks on impact (for items without pickup mode)
        await checkThrowableBreak(thrownItem.id, itemData);
      } catch (err) {
        console.error('Failed to throw item at grid target:', err);
      }
      return;
    }
    
    // Priority 3: Check if there's an AOE marker locked for this throwable
    if (aoeTargetState?.active && aoeTargetState?.locked && aoeTargetState?.throwableItem) {
      // Verify it's the same throwable item
      if (aoeTargetState.throwableItem.id !== itemData.id) {
        triggerRollNotification({
          type: 'system',
          label: `Item Mismatch!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Cannot throw "${itemData.name}" - AOE marker is set for "${aoeTargetState.throwableItem?.name}". Cancel the AOE or use the correct item.`,
        });
        return;
      }
      
      // Range check - validate AOE target is within weapon range
      if (attackerToken && aoeTargetState.center) {
        const effectiveGridSize = gridSize || 50;
        const attackerCenterX = attackerToken.x + effectiveGridSize / 2;
        const attackerCenterY = attackerToken.y + effectiveGridSize / 2;
        const distanceFt = calculateDistanceInFeet(attackerCenterX, attackerCenterY, aoeTargetState.center.x, aoeTargetState.center.y);
        if (distanceFt > weaponRange) {
          triggerRollNotification({
            type: 'system',
            label: `${itemData.name} - Out of Range!`,
            result: 0,
            total: 0,
            username: character.name || 'Unknown',
            characterName: character.name,
            calculationBreakdown: `Target is ${distanceFt}ft away. ${itemData.name} has a range of ${weaponRange}ft.`,
          });
          return;
        }
      }
      
      // Check quantity
      if ((itemData.quantity || 0) < 1) {
        triggerRollNotification({
          type: 'system',
          label: `No ${itemData.name} left!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `You have no ${itemData.name} remaining to throw.`,
        });
        return;
      }
      
      // Create thrown item at AOE target location
      // Convert from world pixel coordinates to grid cell coordinates
      const effectiveGridSize = gridSize || 50;
      const gridX = Math.floor(aoeTargetState.center.x / effectiveGridSize);
      const gridY = Math.floor(aoeTargetState.center.y / effectiveGridSize);
      
      try {
        const thrownItem = await api.createThrownItem(sceneId, {
          itemId: itemData.id,
          characterId: character.id,
          x: gridX,
          y: gridY,
        });
        
        // Decrement item quantity
        await api.updateItem(itemData.id, { quantity: (itemData.quantity || 1) - 1 });
        queryClient.invalidateQueries({ queryKey: ['item', hotbar?.itemId] });
        queryClient.invalidateQueries({ queryKey: ['character-items', character.id] });
        
        // Broadcast via WebSocket
        gameWs.sendThrownItemPlaced(thrownItem, sceneId);
        
        // Refetch thrown items
        onRefetchThrownItems?.();
        
        // Notify
        triggerRollNotification({
          type: 'system',
          label: `${itemData.name} Thrown!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Placed at grid position (${gridX}, ${gridY})`,
        });
        
        if (character.campaignId) {
          gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', 
            `Threw ${itemData.name} at grid (${gridX}, ${gridY})`, 'action');
        }
        
        // Check if throwable breaks on impact (for items without pickup mode)
        await checkThrowableBreak(thrownItem.id, itemData);
      } catch (err) {
        console.error('Failed to throw item:', err);
      }
      return;
    }
    
    // No target selected - notify user to select a target first using the Target button
    triggerRollNotification({
      type: 'system',
      label: `${itemData.name} - No Target!`,
      result: 0,
      total: 0,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown: 'Use the Target button to select a grid location, or target a token first.',
    });
  };
  
  // Handle detonating all thrown items from this item type
  const handleDetonateThrowables = async () => {
    if (!itemData || !itemData.isThrowable || !sceneId || !thrownItems) return;
    
    // Find all thrown items from this item
    const itemThrownItems = thrownItems.filter(ti => ti.itemId === itemData.id);
    
    if (itemThrownItems.length === 0) {
      triggerRollNotification({
        type: 'system',
        label: `No ${itemData.name} to Detonate!`,
        result: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown: `There are no thrown ${itemData.name} on the battlefield.`,
      });
      return;
    }
    
    // Get the full item data from the first thrown item (includes DB fields like throwableAoeDamage)
    // Fall back to itemData from hotbar if thrown item doesn't have full item data
    const sourceItem = itemThrownItems[0]?.item || itemData;
    
    // Get AOE damage dice from item (detonation uses throwableAoeDamage)
    const diceNotation = sourceItem.throwableAoeDamage || itemData.throwableAoeDamage;
    if (!diceNotation) {
      triggerRollNotification({
        type: 'system',
        label: `${itemData.name} - No Detonation Damage!`,
        result: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown: `No detonation damage configured for ${itemData.name}. Set "Throwable AOE Damage" in item settings.`,
      });
      return;
    }
    
    // Roll damage once for all detonations
    const { result: damageResult, dieType } = rollDice(diceNotation);
    const mod = sourceItem.mod || itemData.mod || 0;
    const totalDamage = (damageResult || 0) + mod;
    
    // Get AOE range for each thrown item
    const aoeRange = sourceItem.throwableAoeRange || itemData.throwableAoeRange || 15;
    const aoeShape = (sourceItem.throwableAoeShape || itemData.throwableAoeShape || 'circle').toLowerCase();
    
    // Collect all affected tokens and apply damage
    const affectedTokenIds: string[] = [];
    const affectedNames: string[] = [];
    
    const effectiveGridSize = gridSize || 50;
    
    for (const thrownItem of itemThrownItems) {
      // Get tokens within AOE range of this thrown item
      if (tokens) {
        // Determine the center position of the thrown item in pixels
        let thrownCenterX: number;
        let thrownCenterY: number;
        
        if (thrownItem.attachedToTokenId) {
          // Attached items: x/y are stored as the token's pixel coordinates
          // Find the attached token to get its current position (in case it moved)
          const attachedToken = tokens.find((t: any) => t.id === thrownItem.attachedToTokenId);
          if (attachedToken) {
            thrownCenterX = attachedToken.x + effectiveGridSize / 2;
            thrownCenterY = attachedToken.y + effectiveGridSize / 2;
          } else {
            // Fallback to stored coordinates if token not found
            thrownCenterX = thrownItem.x + effectiveGridSize / 2;
            thrownCenterY = thrownItem.y + effectiveGridSize / 2;
          }
        } else {
          // Grid-placed items: x/y are grid cell indices, convert to pixel center
          thrownCenterX = (thrownItem.x + 0.5) * effectiveGridSize;
          thrownCenterY = (thrownItem.y + 0.5) * effectiveGridSize;
        }
        
        for (const token of tokens) {
          // Token center in pixels
          const tokenCenterX = token.x + effectiveGridSize / 2;
          const tokenCenterY = token.y + effectiveGridSize / 2;
          
          // Calculate pixel distance
          const dx = tokenCenterX - thrownCenterX;
          const dy = tokenCenterY - thrownCenterY;
          const pixelDistance = Math.sqrt(dx * dx + dy * dy);
          
          // Each grid square = 5ft, so convert pixel distance to feet
          const distanceFt = (pixelDistance / effectiveGridSize) * 5;
          
          if (distanceFt <= aoeRange && !affectedTokenIds.includes(token.id)) {
            affectedTokenIds.push(token.id);
            
            // Find character for this token and apply damage
            const targetChar = allCharacters?.find((c: any) => c.id === token.characterId);
            if (targetChar) {
              affectedNames.push(targetChar.name);
              
              // Send combat damage via WebSocket - this handles BOTH the DB update AND broadcasting
              // Do NOT call api.updateCharacter separately as that would cause double damage
              const aoeDamageType = sourceItem.throwableAoeDamageType || itemData.throwableAoeDamageType || 'Fire';
              gameWs.sendCombatDamage(targetChar.id, totalDamage, aoeDamageType, character.name);
              queryClient.invalidateQueries({ queryKey: ['character', targetChar.id] });
            } else if (token.name) {
              affectedNames.push(token.name);
            }
          }
        }
      }
    }
    
    // Delete all thrown items (detonate them)
    try {
      await api.detonateThrownItems(itemData.id);
      onRefetchThrownItems?.();
    } catch (err) {
      console.error('Failed to detonate thrown items:', err);
    }
    
    // Calculate breakdown
    let calculationBreakdown = mod !== 0 
      ? `${diceNotation} = ${damageResult} + Mod (${mod >= 0 ? '+' : ''}${mod})`
      : `${diceNotation} = ${damageResult}`;
    
    const aoeDamageType = sourceItem.throwableAoeDamageType || itemData.throwableAoeDamageType || '';
    const damageTypeDisplay = aoeDamageType ? ` (${aoeDamageType})` : '';
    
    // Notify with detonation results
    const label = affectedNames.length > 0 
      ? `${itemData.name} Detonation → ${affectedNames.join(', ')}`
      : `${itemData.name} Detonation - No targets hit!`;
    
    triggerRollNotification({
      type: 'attack',
      dieType: dieType as any,
      label,
      result: damageResult || 0,
      modifier: mod,
      total: totalDamage,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    // Send chat message
    if (character.campaignId) {
      const chatText = affectedNames.length > 0
        ? `${itemData.name} Detonation: ${calculationBreakdown} = ${totalDamage}${damageTypeDisplay} → ${affectedNames.join(', ')}`
        : `${itemData.name} Detonation: ${calculationBreakdown} = ${totalDamage}${damageTypeDisplay} (no targets hit)`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
    
    // Broadcast detonation via WebSocket (use AOE damage type)
    const broadcastDamageType = sourceItem.throwableAoeDamageType || itemData.throwableAoeDamageType || 'Fire';
    gameWs.sendThrownItemsDetonated(itemData.id, sceneId, {
      itemName: itemData.name,
      damageRoll: totalDamage,
      damageType: broadcastDamageType,
      affectedTokenIds,
      affectedNames,
      characterName: character.name || 'Unknown',
    });
  };

  // Handle spell attack roll (1d20 + attribute modifier)
  const handleSpellAttackRoll = async () => {
    if (!spellData) return;
    
    // Check if there's a locked AoE marker on the map - validate spell matches
    if (aoeTargetState?.active && aoeTargetState?.locked && aoeTargetState?.spell) {
      // Check if this is the same spell as the locked marker
      if (spellData.id !== aoeTargetState.spell?.id) {
        triggerRollNotification({
          type: 'system',
          label: `Spell Mismatch!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Cannot use "${spellData.name}" - AoE marker is set for "${aoeTargetState.spell?.name}". Cancel the AoE or use the correct spell.`,
        });
        return;
      }
    }
    
    // Check if this is an AoE spell - enter AoE targeting mode instead of rolling
    // Energy is NOT checked here - users can position AoE freely, energy checked on attack roll only
    if (spellData.isAoe && onEnterAoeMode) {
      const casterToken = tokens?.find((t: any) => t.characterId === character.id);
      if (casterToken) {
        onEnterAoeMode(spellData, casterToken.id);
        return;
      } else {
        triggerRollNotification({
          type: 'system',
          label: `${spellData.name} - No Token!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: 'You need a token on the map to cast AoE spells',
        });
        return;
      }
    }
    
    // Check energy cost - validate and deduct before casting (only for non-AoE attack rolls)
    const energyCost = spellData.energyCost || 0;
    const currentEnergy = character.energy || 0;
    
    if (energyCost > 0 && currentEnergy < energyCost) {
      triggerRollNotification({
        type: 'system',
        label: `Not Enough Energy!`,
        result: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown: `${spellData.name} requires ${energyCost} energy but you only have ${currentEnergy}.`,
      });
      return;
    }
    
    // Deduct energy cost
    if (energyCost > 0) {
      try {
        await api.updateCharacter(character.id, { energy: currentEnergy - energyCost });
        queryClient.invalidateQueries({ queryKey: ['character', character.id] });
      } catch (err) {
        console.error('Failed to deduct energy:', err);
      }
    }
    
    const attrName = spellData.attribute || 'wit';
    const attrMod = getAttributeModifier(attrName);
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + attrMod;
    
    const attrDisplayName = attrName.charAt(0).toUpperCase() + attrName.slice(1);
    const calculationBreakdown = attrMod !== 0 
      ? `1d20 = ${roll} + ${attrDisplayName} (${attrMod >= 0 ? '+' : ''}${attrMod})`
      : `1d20 = ${roll}`;
    
    const rollLabel = spellData.isAttack !== false ? 'Attack' : 'Use';
    triggerRollNotification({
      type: 'attack',
      dieType: 'd20',
      label: `${spellData.name} ${rollLabel}`,
      result: roll,
      modifier: attrMod,
      total,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    if (character.campaignId) {
      const chatText = `${spellData.name} ${rollLabel}: ${calculationBreakdown} = ${total}`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
  };

  // Helper to normalize spell AoE properties for comparison
  const getSpellAoeInfo = (spell: any) => {
    if (!spell) return null;
    let shape = 'circle';
    let aoeRange = 15;
    let spellRange = spell.rangeNum || 30;
    
    const aoeField = spell.aoe || '';
    if (aoeField && typeof aoeField === 'string' && aoeField.includes(':')) {
      const [parsedShape, parsedRadius] = aoeField.split(':');
      shape = (parsedShape || 'circle').toLowerCase();
      aoeRange = parseInt(parsedRadius, 10) || 15;
    } else if (spell.aoeShape || spell.aoeRange) {
      shape = (spell.aoeShape || 'circle').toLowerCase();
      aoeRange = spell.aoeRange || 15;
    }
    
    return { shape, aoeRange, spellRange, name: spell.name, id: spell.id };
  };

  // Handle spell damage roll (damage dice + mod) - with target application
  const handleSpellDamageRoll = async () => {
    if (!spellData) return;
    
    // Check if there's a locked AoE marker on the map - validate spell matches
    if (aoeTargetState?.active && aoeTargetState?.locked && aoeTargetState?.spell) {
      const markerInfo = getSpellAoeInfo(aoeTargetState.spell);
      const currentSpellInfo = getSpellAoeInfo(spellData);
      
      // Check if this is the same spell as the locked marker
      if (markerInfo && currentSpellInfo && spellData.id !== aoeTargetState.spell?.id) {
        triggerRollNotification({
          type: 'system',
          label: `Spell Mismatch!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Cannot use "${spellData.name}" - AoE marker is set for "${aoeTargetState.spell?.name}". Cancel the AoE or use the correct spell.`,
        });
        return;
      }
    }
    
    const isHealing = spellData.damageType === 'Health';
    // Check both damageDice and damage fields for backwards compatibility
    const diceNotation = isHealing ? (spellData.healingDice || spellData.damageDice || spellData.damage) : (spellData.damageDice || spellData.damage);
    
    if (!diceNotation) {
      triggerRollNotification({
        type: 'attack',
        dieType: 'd20',
        label: `${spellData.name} - No damage dice!`,
        result: 0,
        modifier: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
      });
      return;
    }
    
    // Handle AoE damage when AoE is locked
    // Check for aoe field (format "shape:radius" like "circle:15") OR legacy isAoe boolean
    // Also check aoeTargetState.spell.aoe since the spell data there should have it
    const hasAoe = (spellData.aoe && typeof spellData.aoe === 'string' && spellData.aoe.includes(':')) || 
                   (aoeTargetState?.spell?.aoe && typeof aoeTargetState.spell.aoe === 'string' && aoeTargetState.spell.aoe.includes(':')) ||
                   spellData.isAoe;
    console.log('[SpellDamage] AoE check:', { 
      hasAoe, 
      spellDataAoe: spellData.aoe,
      aoeStateSpellAoe: aoeTargetState?.spell?.aoe,
      aoeActive: aoeTargetState?.active, 
      aoeLocked: aoeTargetState?.locked, 
      tokensCount: tokens?.length 
    });
    if (hasAoe && aoeTargetState?.active && aoeTargetState?.locked && tokens) {
      const casterToken = tokens.find((t: any) => t.id === aoeTargetState.casterTokenId);
      const tokensInAoe = getTokensInAoe(tokens, aoeTargetState, gridSize, casterToken, aoeTargetState.width);
      console.log('[SpellDamage] Tokens in AoE:', tokensInAoe.length, 'Center:', aoeTargetState.center);
      
      if (tokensInAoe.length === 0) {
        triggerRollNotification({
          type: 'system',
          label: `${spellData.name} - No targets in AoE!`,
          result: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: 'No tokens are within the area of effect',
        });
        return;
      }
      
      const { result, dieType } = rollDice(diceNotation);
      const mod = typeof spellData.mod === 'number' ? spellData.mod : (parseInt(spellData.mod) || 0);
      const total = (result || 0) + mod;
      
      let calculationBreakdown = mod !== 0 
        ? `${diceNotation} = ${result} + Mod (${mod >= 0 ? '+' : ''}${mod})`
        : `${diceNotation} = ${result}`;
      const damageTypeDisplay = spellData.damageType ? ` (${spellData.damageType})` : '';
      
      const affectedNames: string[] = [];
      const isEnergyEffect = spellData.damageType === 'Energy';
      for (const token of tokensInAoe) {
        const targetChar = allCharacters?.find((c: any) => c.id === token.characterId);
        if (targetChar) {
          await applyDamageToTarget(total, spellData.damageType || null, targetChar, isEnergyEffect ? spellData.gainEnergy : undefined);
          affectedNames.push(targetChar.name);
        }
      }
      
      const aoeEffectLabel = spellData.isAttack !== false ? 'Damage' : 'Effect';
      const label = isHealing 
        ? `${spellData.name} AoE Healing → ${affectedNames.join(', ')}`
        : `${spellData.name} AoE ${aoeEffectLabel} → ${affectedNames.join(', ')}`;
      
      triggerRollNotification({
        type: 'attack',
        dieType: dieType as any,
        label,
        result,
        modifier: mod,
        total,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown,
      });
      
      if (character.campaignId) {
        const chatText = `${label}: ${calculationBreakdown} = ${total}${damageTypeDisplay}`;
        gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
      }
      return;
    }
    
    const targetData = getTargetData();
    
    const { result, dieType } = rollDice(diceNotation);
    const mod = typeof spellData.mod === 'number' ? spellData.mod : (parseInt(spellData.mod) || 0);
    const total = (result || 0) + mod;
    
    let calculationBreakdown = mod !== 0 
      ? `${diceNotation} = ${result} + Mod (${mod >= 0 ? '+' : ''}${mod})`
      : `${diceNotation} = ${result}`;
    
    const effectLabel = spellData.isAttack !== false ? 'Damage' : 'Effect';
    let label = isHealing ? `${spellData.name} Healing` : `${spellData.name} ${effectLabel}`;
    const damageTypeDisplay = spellData.damageType ? ` (${spellData.damageType})` : '';
    let finalTotal = total;
    
    // Apply damage/healing/energy to target if one is selected (characterId allows damage to enemies without full character data)
    const isEnergyEffect = spellData.damageType === 'Energy';
    if (targetedTokenId && targetData?.characterId) {
      const { finalDamage, reduction, armorName, isHealing: wasHealing, isEnergy, targetName } = await applyDamageToTarget(total, spellData.damageType || null, targetData.character, isEnergyEffect ? spellData.gainEnergy : undefined, targetData.characterId);
      finalTotal = finalDamage;
      const displayName = targetData.character?.name || targetData.token?.name || targetName || 'Target';
      
      if (isEnergy) {
        const energyAction = spellData.gainEnergy ? '+' : '-';
        label = `${spellData.name} Energy → ${displayName} (${energyAction}${finalDamage} Energy)`;
      } else if (wasHealing) {
        label = `${spellData.name} Healing → ${displayName} (+${finalDamage} HP)`;
      } else if (reduction > 0) {
        calculationBreakdown += ` - ${reduction} (${armorName || 'Armor'})`;
        label = `${spellData.name} ${effectLabel} → ${displayName} (-${finalDamage} HP)`;
      } else {
        label = `${spellData.name} ${effectLabel} → ${displayName} (-${finalDamage} HP)`;
      }
    }
    
    triggerRollNotification({
      type: 'attack',
      dieType: dieType as any,
      label,
      result,
      modifier: mod,
      total: finalTotal,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    if (character.campaignId) {
      const chatEffectLabel = spellData.isAttack !== false ? 'Damage' : 'Effect';
      const displayName = targetData?.character?.name || targetData?.token?.name || 'Target';
      const chatText = targetedTokenId && targetData?.characterId
        ? `${label}: ${calculationBreakdown} = ${finalTotal}${damageTypeDisplay}`
        : `${isHealing ? `${spellData.name} Healing` : `${spellData.name} ${chatEffectLabel}`}: ${calculationBreakdown} = ${total}${damageTypeDisplay}`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
  };

  // Handle click with single/double/triple click detection
  const handleClick = () => {
    // Handle trait clicks
    if (isTraitClickable) {
      handleTraitRoll();
      return;
    }

    // Handle skill clicks
    if (isSkillClickable) {
      handleSkillRoll();
      return;
    }
    
    // Handle spell clicks (single = attack, double = damage)
    if (isSpellClickable) {
      clickCountRef.current += 1;
      
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
      
      clickTimerRef.current = setTimeout(() => {
        if (clickCountRef.current === 1) {
          handleSpellAttackRoll();
        } else if (clickCountRef.current >= 2) {
          handleSpellDamageRoll();
        }
        clickCountRef.current = 0;
      }, 250);
      return;
    }
    
    // Handle throwable items (single = throw, double = normal damage, triple = detonate with AOE damage)
    if (isThrowableClickable) {
      clickCountRef.current += 1;
      
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
      
      // Use longer timeout (500ms) for triple-click detection
      clickTimerRef.current = setTimeout(() => {
        if (clickCountRef.current === 1) {
          // Single-click: Throw item to targeted token or grid space
          handleThrowItem();
        } else if (clickCountRef.current === 2) {
          // Double-click: Roll normal damage (like regular weapons)
          handleDamageRoll();
        } else if (clickCountRef.current >= 3) {
          // Triple-click: Detonate all thrown items with AOE damage
          handleDetonateThrowables();
        }
        clickCountRef.current = 0;
      }, 500);
      return;
    }
    
    // Handle weapons and damaging consumables
    const isWeaponOrDamagingConsumable = itemData && (itemData.itemType === 'weapon' || (itemData.itemType === 'consumable' && itemData.isDamaging));
    if (!isWeaponOrDamagingConsumable) return;
    
    clickCountRef.current += 1;
    
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    
    clickTimerRef.current = setTimeout(() => {
      if (clickCountRef.current === 1) {
        handleAttackRoll();
      } else if (clickCountRef.current >= 2) {
        handleDamageRoll();
      }
      clickCountRef.current = 0;
    }, 250);
  };

  // Determine what to display
  let content = null;
  let tooltipContent = null;

  if (hotbar?.spellId && spellData) {
    const energyCost = spellData.energyCost || 0;
    content = spellData.image ? (
      <div className="relative w-full h-full flex items-center justify-center">
        <img 
          src={spellData.image} 
          alt={spellData.name}
          className="w-9 h-9 md:w-14 md:h-14 object-cover rounded"
        />
        {energyCost > 0 && (
          <div className="absolute top-0 right-0 bg-cyan-600 text-white text-[6px] px-0.5 rounded-bl font-bold">
            {energyCost}E
          </div>
        )}
      </div>
    ) : (
      <>
        <div className="font-bold truncate text-purple-400">
          {spellData.name.substring(0, 3)}
        </div>
        {energyCost > 0 && (
          <div className="text-[7px] text-cyan-400">
            {energyCost}E
          </div>
        )}
      </>
    );
    tooltipContent = (
      <>
        <p className="font-bold">{spellData.name}</p>
        {(spellData.damageDice || spellData.damage) && <p className="text-sm">Damage: {spellData.damageDice || spellData.damage}{spellData.mod ? ` +${spellData.mod}` : ''} {spellData.damageType || ''}</p>}
        {spellData.attribute && <p className="text-sm">{spellData.isAttack !== false ? 'Attack' : 'Attribute'}: {spellData.attribute}</p>}
        {spellData.rangeNum && <p className="text-sm">Range: {spellData.rangeNum}ft</p>}
        <p className="text-sm text-cyan-400">Energy: {energyCost}</p>
        <p className="text-xs text-stone-400 mt-1">{spellData.isAttack !== false ? 'Click: Attack | Double-click: Damage' : 'Click: Use | Double-click: Effect'}</p>
      </>
    );
  } else if (hotbar?.itemId && itemData) {
    // For ammunition, consumables, and throwables, show grouped total quantity
    const displayQuantity = itemData.itemType === 'ammunition' 
      ? getTotalAmmunitionQuantity(itemData) 
      : (itemData.isThrowable || itemData.itemType === 'consumable')
        ? getTotalStackedQuantity(itemData) 
        : null;
      
    content = itemData.image ? (
      <div className="relative w-full h-full flex items-center justify-center">
        <img 
          src={itemData.image} 
          alt={itemData.name}
          className="w-9 h-9 md:w-14 md:h-14 object-cover rounded"
        />
        {displayQuantity !== null && (
          <div className="absolute top-0 right-0 bg-stone-900/90 text-amber-400 text-[6px] px-0.5 rounded-bl font-bold">
            x{displayQuantity}
          </div>
        )}
      </div>
    ) : (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <div className="text-amber-400 font-bold truncate">
          {itemData.name.substring(0, 4)}
        </div>
        {itemData.damage && (
          <div className="text-red-400 text-[7px]">{itemData.damage}</div>
        )}
        {displayQuantity !== null && (
          <div className="absolute top-0 right-0 bg-stone-900/90 text-amber-400 text-[6px] px-0.5 rounded-bl font-bold">
            x{displayQuantity}
          </div>
        )}
      </div>
    );
    tooltipContent = (
      <>
        <p className="font-bold">{itemData.name}</p>
        {itemData.damage && <p className="text-sm">Damage: {itemData.damage}{itemData.mod ? ` +${itemData.mod}` : ''}</p>}
        {itemData.attribute && <p className="text-sm">Attack: {itemData.attribute}</p>}
        {displayQuantity !== null && <p className="text-sm text-amber-400">Total Quantity: x{displayQuantity}</p>}
        {itemData.durability !== undefined && <p className="text-sm">Durability: {itemData.durability}/10</p>}
        {itemData.isThrowable && itemData.throwableAoeRange && (
          <p className="text-sm text-orange-400">AOE Range: {itemData.throwableAoeRange}ft ({itemData.throwableAoeShape || 'circle'})</p>
        )}
        {isThrowableClickable ? (
          <p className="text-xs text-stone-400 mt-1">Click: Throw | 2x: Damage | 3x: Detonate AOE</p>
        ) : isClickable && (
          <p className="text-xs text-stone-400 mt-1">Click: Attack | Double-click: Damage</p>
        )}
      </>
    );
  } else if (hotbar?.skillName) {
    // Get skill modifier for display - convert to camelCase key
    const skillKey = `skill${hotbar.skillName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('')}` as keyof typeof character;
    const skillMod = typeof character[skillKey] === 'number' ? character[skillKey] : 0;
    
    content = (
      <div className="text-blue-400 font-bold truncate">
        {hotbar.skillName.substring(0, 4)}
      </div>
    );
    tooltipContent = (
      <>
        <p className="font-bold">{hotbar.skillName}</p>
        <p className="text-sm">Modifier: +{skillMod}</p>
        <p className="text-xs text-stone-400 mt-1">Click to roll | Hold for modifiers</p>
      </>
    );
  } else if (hotbar?.traitId && traitData) {
    // Display trait with uses remaining
    const usesRemaining = traitData.usesPerLongRest - traitData.currentUses;
    const isExhausted = usesRemaining <= 0;
    
    content = (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <div className={`font-bold truncate ${isExhausted ? 'text-stone-500' : 'text-cyan-400'}`}>
          {traitData.name.substring(0, 4)}
        </div>
        <div className={`absolute top-0 right-0 text-[6px] px-0.5 rounded-bl font-bold ${isExhausted ? 'bg-red-900 text-red-400' : 'bg-cyan-900 text-cyan-400'}`}>
          {usesRemaining}/{traitData.usesPerLongRest}
        </div>
      </div>
    );
    tooltipContent = (
      <>
        <p className="font-bold">{traitData.name}</p>
        {traitData.description && <p className="text-xs text-stone-400">{traitData.description}</p>}
        <p className="text-sm">Attribute: {traitData.parentAttribute}</p>
        <p className={`text-sm ${isExhausted ? 'text-red-400' : 'text-cyan-400'}`}>
          Uses: {usesRemaining}/{traitData.usesPerLongRest} per long rest
        </p>
        {isExhausted 
          ? <p className="text-xs text-red-400 mt-1">No uses remaining - take a long rest</p>
          : <p className="text-xs text-stone-400 mt-1">Click to roll | Hold for modifiers</p>
        }
      </>
    );
  }

  // Determine action type border color for spells
  const getActionBorderClass = () => {
    if (hotbar?.spellId && spellData?.castingTime) {
      const isBonusAction = spellData.castingTime.toLowerCase().includes('bonus');
      return isBonusAction ? 'ring-2 ring-blue-500' : 'ring-2 ring-red-500';
    }
    return '';
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={isClickable ? handleClick : undefined}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              onContextMenu={(e) => { e.preventDefault(); if (isClickable) setShowModifierPopup(true); }}
              className={`
                w-11 h-11 md:w-16 md:h-16 rounded border flex items-center justify-center text-[9px] md:text-[12px]
                ${content 
                  ? `bg-stone-800 border-${color}-600/50 hover:border-${color}-500` 
                  : 'bg-stone-900/50 border-stone-700 border-dashed'
                }
                ${isClickable ? 'cursor-pointer hover:bg-stone-700/50 active:bg-stone-600/50' : ''}
                ${getActionBorderClass()}
              `}
              data-testid={`battlemap-hotbar-${type}-${slotIndex}`}
            >
              {content ? (
                <div className="text-center w-full h-full flex items-center justify-center">{content}</div>
              ) : (
                <span className="text-[6px] text-stone-600">{slotIndex + 1}</span>
              )}
            </div>
          </TooltipTrigger>
          {tooltipContent && (
            <TooltipContent>
              {tooltipContent}
              {isClickable && <p className="text-xs text-stone-400 mt-1">Hold for modifiers</p>}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      
      {/* Modifier Popup Dialog */}
      <Dialog open={showModifierPopup} onOpenChange={setShowModifierPopup}>
        <DialogContent className="w-72 bg-stone-900 border-stone-700 text-stone-200 p-4">
          <DialogHeader>
            <DialogTitle className="text-amber-500 text-lg">{isTraitClickable ? traitData?.name : isSkillClickable ? hotbar?.skillName : itemData?.name || 'Roll'} Modifiers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Extra Modifier Input */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-stone-300 w-24">Extra Mod:</label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 border-stone-600"
                  onClick={() => setExtraModifier(prev => prev - 1)}
                  data-testid="button-modifier-decrease"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={extraModifier}
                  onChange={(e) => setExtraModifier(parseInt(e.target.value) || 0)}
                  className="w-16 h-8 text-center bg-stone-800 border-stone-600"
                  data-testid="input-extra-modifier"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 border-stone-600"
                  onClick={() => setExtraModifier(prev => prev + 1)}
                  data-testid="button-modifier-increase"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* ADV/DIS Checkboxes */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={hasAdvantage}
                  onCheckedChange={(checked) => setHasAdvantage(checked === true)}
                  className="border-green-600 data-[state=checked]:bg-green-600"
                  data-testid="checkbox-advantage"
                />
                <span className="text-sm text-green-400 font-medium">ADV</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={hasDisadvantage}
                  onCheckedChange={(checked) => setHasDisadvantage(checked === true)}
                  className="border-red-600 data-[state=checked]:bg-red-600"
                  data-testid="checkbox-disadvantage"
                />
                <span className="text-sm text-red-400 font-medium">DIS</span>
              </label>
            </div>
            
            {/* Note when both are checked */}
            {hasAdvantage && hasDisadvantage && (
              <p className="text-xs text-stone-400 italic">Both ADV and DIS cancel out - normal roll</p>
            )}
            
            {/* Roll Buttons - different for skills, traits, vs weapons */}
            {isTraitClickable ? (
              <div className="pt-2">
                <Button
                  onClick={handleModifiedTraitRoll}
                  className="w-full bg-cyan-600 hover:bg-cyan-500"
                  data-testid="button-modified-trait"
                >
                  <Star className="h-4 w-4 mr-1" />
                  Use {traitData?.name}
                </Button>
              </div>
            ) : isSkillClickable ? (
              <div className="pt-2">
                <Button
                  onClick={handleModifiedSkillRoll}
                  className="w-full bg-blue-600 hover:bg-blue-500"
                  data-testid="button-modified-skill"
                >
                  <Dice5 className="h-4 w-4 mr-1" />
                  Roll {hotbar?.skillName}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleModifiedAttackRoll}
                  className="flex-1 bg-amber-600 hover:bg-amber-500"
                  data-testid="button-modified-attack"
                >
                  <Sword className="h-4 w-4 mr-1" />
                  Attack
                </Button>
                <Button
                  onClick={handleModifiedDamageRoll}
                  className="flex-1 bg-red-600 hover:bg-red-500"
                  data-testid="button-modified-damage"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Damage
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BattleMapHotbars({ character, tokens, targetedTokenId, characters, gridSize, onEnterAoeMode, aoeTargetState, onAoeDamageRoll, sceneId, thrownItems, onRefetchThrownItems, onEnterThrowableAoeMode, throwableGridTarget, onClearThrowableGridTarget }: BattleMapHotbarsProps) {
  const [activeHotbar, setActiveHotbar] = useState<string>('weapons');
  
  const { data: hotbars = [], isLoading: hotbarsLoading } = useQuery({
    queryKey: ['hotbars', character?.id],
    queryFn: () => api.getHotbars(character.id),
    enabled: !!character?.id
  });

  const { data: items = [] } = useQuery({
    queryKey: ['items', character?.id],
    queryFn: () => api.getItems(character.id),
    enabled: !!character?.id
  });

  // Fetch feat tree and character feats for bonus calculation
  const { data: featTreeData } = useQuery({
    queryKey: ['feat-tree', character?.featTree],
    queryFn: () => character?.featTree ? api.getFeatTree(character.featTree) : Promise.resolve(null),
    enabled: !!character?.featTree,
  });

  const { data: characterFeats = [] } = useQuery({
    queryKey: ['character-feats', character?.id],
    queryFn: () => character?.id ? api.getCharacterFeats(character.id) : Promise.resolve([]),
    enabled: !!character?.id,
  });

  // Calculate feat bonuses for HP/Energy/DC
  const featBonuses = useMemo(() => {
    const bonuses = { hp: 0, energy: 0, dc: 0 };
    if (!featTreeData?.feats || !characterFeats.length) return bonuses;
    
    const unlockedFeatIds = new Set(characterFeats.map((cf: CharacterFeat) => cf.featId));
    const unlockedFeats = featTreeData.feats.filter((f: Feat) => unlockedFeatIds.has(f.id));
    const charLevel = Math.max(1, character?.level || 1);
    
    for (const feat of unlockedFeats) {
      if (!feat.effects || !Array.isArray(feat.effects)) continue;
      for (const effect of feat.effects as any[]) {
        if (effect.type === 'hp_bonus') {
          bonuses.hp += effect.subtype === 'per_level' ? (effect.value || 0) * charLevel : (effect.value || 0);
        } else if (effect.type === 'energy_bonus') {
          bonuses.energy += effect.subtype === 'per_level' ? (effect.value || 0) * charLevel : (effect.value || 0);
        } else if (effect.type === 'dc_bonus') {
          bonuses.dc += effect.value || 0;
        }
      }
    }
    return bonuses;
  }, [featTreeData?.feats, characterFeats, character?.level]);

  // Calculate effective max HP/Energy including feat bonuses
  const effectiveMaxHp = (character?.maxHp || 10) + featBonuses.hp;
  const effectiveMaxEnergy = (character?.maxEnergy || 10) + featBonuses.energy;

  // Calculate total DC from equipped armor (same logic as character sheet)
  const calculateArmorBonus = () => {
    const armorHotbars = hotbars.filter((h: any) => h.hotbarType === 'armor' && h.itemId);
    let totalArmorBonus = 0;
    armorHotbars.forEach((hotbar: any) => {
      const armorItem = items.find((item: any) => item.id === hotbar.itemId);
      if (armorItem?.armorBonus) {
        totalArmorBonus += armorItem.armorBonus;
      }
    });
    return totalArmorBonus;
  };

  const equippedArmorBonus = calculateArmorBonus();
  const totalDC = (character?.sizeBonus || 0) + (character?.naturalArmor || 5) + equippedArmorBonus + featBonuses.dc;

  // Don't render if no character selected
  if (!character) return null;

  const hotbarTypes = [
    { type: 'weapons', icon: Sword, color: 'amber', maxSlots: 3 },
    { type: 'armor', icon: Shield, color: 'cyan', maxSlots: 5 },
    { type: 'magic', icon: Sparkles, color: 'purple', maxSlots: 5 },
    { type: 'skills', icon: Dice5, color: 'blue', maxSlots: 5 },
    { type: 'consumables', icon: Heart, color: 'green', maxSlots: 5 },
    { type: 'utility', icon: Package, color: 'stone', maxSlots: 5 }
  ];

  const activeHotbarConfig = hotbarTypes.find(h => h.type === activeHotbar);
  const activeTypeHotbars = hotbars.filter((h: Hotbar) => h.hotbarType === activeHotbar);

  return (
    <>
      {/* DC, HP and Energy Bars - Bottom LEFT, stacked vertically */}
      <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 pointer-events-auto z-30">
        <div className="flex flex-col gap-1">
          {/* DC Display */}
          <div className="glass-panel p-1.5 md:p-2 rounded border-l-4 border-purple-600 relative overflow-hidden w-32 md:w-44">
            <div className="flex justify-between text-[9px] md:text-xs uppercase tracking-wider font-bold text-purple-200">
              <span>DC</span>
              <span>{totalDC}</span>
            </div>
          </div>

          {/* Health Bar */}
          <div className="glass-panel p-1.5 md:p-2 rounded border-l-4 border-red-600 relative overflow-hidden w-32 md:w-44">
            <div className="flex justify-between text-[9px] md:text-xs uppercase tracking-wider mb-1 font-bold text-red-200">
              <span>HP</span>
              <span>{Math.min(character.hp ?? 10, effectiveMaxHp)}/{effectiveMaxHp}</span>
            </div>
            <div className="h-1.5 md:h-2 bg-black/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-red-700 to-red-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, ((character.hp ?? 10) / effectiveMaxHp) * 100)}%` }}
              />
            </div>
          </div>

          {/* Energy Bar */}
          <div className="glass-panel p-1.5 md:p-2 rounded border-l-4 border-blue-600 relative overflow-hidden w-32 md:w-44">
            <div className="flex justify-between text-[9px] md:text-xs uppercase tracking-wider mb-1 font-bold text-blue-200">
              <span>Energy</span>
              <span>{Math.min(character.energy ?? 10, effectiveMaxEnergy)}/{effectiveMaxEnergy}</span>
            </div>
            <div className="h-1.5 md:h-2 bg-black/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-blue-700 to-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, ((character.energy ?? 10) / effectiveMaxEnergy) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hotbar Display - Bottom CENTER/RIGHT with type buttons above */}
      <div className="absolute bottom-2 md:bottom-4 right-2 md:right-4 pointer-events-auto z-30">
        <div className="glass-panel rounded p-1 md:p-2 border border-stone-700">
          {/* Hotbar Type Switcher Buttons - Horizontal above slots */}
          <div className="flex gap-1 justify-center mb-1 md:mb-2">
            {hotbarTypes.map(({ type, icon: Icon, color }) => {
              const isActive = activeHotbar === type;
              const colorClasses: Record<string, string> = {
                amber: isActive ? 'bg-amber-600 border-amber-400 text-amber-100' : 'bg-stone-800/80 border-stone-600 text-amber-400 hover:bg-amber-900/50',
                cyan: isActive ? 'bg-cyan-600 border-cyan-400 text-cyan-100' : 'bg-stone-800/80 border-stone-600 text-cyan-400 hover:bg-cyan-900/50',
                purple: isActive ? 'bg-purple-600 border-purple-400 text-purple-100' : 'bg-stone-800/80 border-stone-600 text-purple-400 hover:bg-purple-900/50',
                blue: isActive ? 'bg-blue-600 border-blue-400 text-blue-100' : 'bg-stone-800/80 border-stone-600 text-blue-400 hover:bg-blue-900/50',
                green: isActive ? 'bg-green-600 border-green-400 text-green-100' : 'bg-stone-800/80 border-stone-600 text-green-400 hover:bg-green-900/50',
                stone: isActive ? 'bg-stone-600 border-stone-400 text-stone-100' : 'bg-stone-800/80 border-stone-600 text-stone-400 hover:bg-stone-700/50',
              };
              
              return (
                <TooltipProvider key={type}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveHotbar(type)}
                        className={`
                          w-7 h-7 md:w-8 md:h-8 rounded border-2 flex items-center justify-center
                          transition-all duration-200
                          ${colorClasses[color]}
                          ${isActive ? 'ring-1 ring-white/20' : 'hover:scale-105'}
                        `}
                        data-testid={`hotbar-switch-${type}`}
                      >
                        <Icon className="h-3 w-3 md:h-4 md:w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="capitalize font-bold">{type}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
          
          {activeHotbarConfig && (
            <div className="flex flex-col gap-1">
              {/* Hotbar Slots */}
              <div className="flex gap-1 justify-center">
                {Array.from({ length: activeHotbarConfig.maxSlots }).map((_, slotIndex) => {
                  const hotbar = activeTypeHotbars.find((h: Hotbar) => h.slotNumber === slotIndex);
                  
                  return (
                    <BattleMapHotbarSlot
                      key={slotIndex}
                      hotbar={hotbar}
                      slotIndex={slotIndex}
                      type={activeHotbarConfig.type}
                      color={activeHotbarConfig.color}
                      character={character}
                      allHotbars={hotbars}
                      allItems={items}
                      tokens={tokens}
                      targetedTokenId={targetedTokenId}
                      allCharacters={characters}
                      gridSize={gridSize}
                      onEnterAoeMode={onEnterAoeMode}
                      aoeTargetState={aoeTargetState}
                      onAoeDamageRoll={onAoeDamageRoll}
                      sceneId={sceneId}
                      thrownItems={thrownItems}
                      onRefetchThrownItems={onRefetchThrownItems}
                      onEnterThrowableAoeMode={onEnterThrowableAoeMode}
                      throwableGridTarget={throwableGridTarget}
                      onClearThrowableGridTarget={onClearThrowableGridTarget}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Selection Mode Buttons Component - Select and Target buttons stacked vertically
interface SelectionModeButtonsProps {
  selectionMode: SelectionMode;
  onModeChange: (mode: SelectionMode) => void;
  character?: any;
  tokens?: any[];
  onEnterSpellTargeting?: (spell: any, casterTokenId: string) => void;
  onClearSpellTargeting?: () => void;
  isSpellTargetingActive?: boolean;
}

export function SelectionModeButtons({ 
  selectionMode, 
  onModeChange, 
  character, 
  tokens, 
  onEnterSpellTargeting,
  onClearSpellTargeting,
  isSpellTargetingActive 
}: SelectionModeButtonsProps) {
  const [showSpellPicker, setShowSpellPicker] = useState(false);
  
  const getColorClasses = (color: string, isActive: boolean) => {
    const colorClasses: Record<string, string> = {
      stone: isActive ? 'bg-stone-600 border-stone-400 text-stone-100' : 'bg-stone-800/80 border-stone-600 text-stone-400 hover:bg-stone-700/50',
      red: isActive ? 'bg-red-600 border-red-400 text-red-100' : 'bg-stone-800/80 border-stone-600 text-red-400 hover:bg-red-900/50',
      purple: isActive ? 'bg-purple-600 border-purple-400 text-purple-100' : 'bg-stone-800/80 border-stone-600 text-purple-400 hover:bg-purple-900/50',
      amber: isActive ? 'bg-amber-600 border-amber-400 text-amber-100' : 'bg-stone-800/80 border-stone-600 text-amber-400 hover:bg-amber-900/50',
    };
    return colorClasses[color] || colorClasses.stone;
  };

  // Handle spell selection from picker - allow AoE placement without energy check
  // Energy is only checked/deducted on attack roll, not when entering targeting mode
  const handleSpellSelect = (spell: any) => {
    console.log('[SpellPicker] handleSpellSelect called with spell:', spell);
    console.log('[SpellPicker] character:', character);
    console.log('[SpellPicker] tokens:', tokens);
    console.log('[SpellPicker] onEnterSpellTargeting:', !!onEnterSpellTargeting);
    
    if (!character || !tokens || !onEnterSpellTargeting) {
      console.log('[SpellPicker] Missing required props, returning');
      return;
    }
    
    const casterToken = tokens.find((t: any) => t.characterId === character.id);
    console.log('[SpellPicker] casterToken:', casterToken);
    if (casterToken) {
      console.log('[SpellPicker] Calling onEnterSpellTargeting with tokenId:', casterToken.id);
      onEnterSpellTargeting(spell, casterToken.id);
      setShowSpellPicker(false);
    } else {
      console.log('[SpellPicker] No caster token found for character:', character.id);
    }
  };

  return (
    <>
      <div className="absolute left-2 md:left-4 top-44 z-30 pointer-events-auto">
        <div className="flex flex-col gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onModeChange('select')}
                  className={`
                    w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                    transition-all duration-200 shadow-lg backdrop-blur-sm
                    ${getColorClasses('stone', selectionMode === 'select')}
                    ${selectionMode === 'select' ? 'scale-110 ring-2 ring-white/20' : 'hover:scale-105'}
                  `}
                  aria-label="Select mode"
                  data-testid="selection-mode-select"
                >
                  <MousePointer className="h-4 w-4 md:h-5 md:w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-bold">Select</p>
                <p className="text-xs text-stone-400">Double-click token to assign character</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onModeChange('target')}
                  className={`
                    w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                    transition-all duration-200 shadow-lg backdrop-blur-sm
                    ${getColorClasses('red', selectionMode === 'target')}
                    ${selectionMode === 'target' ? 'scale-110 ring-2 ring-white/20' : 'hover:scale-105'}
                  `}
                  aria-label="Target mode"
                  data-testid="selection-mode-target"
                >
                  <Target className="h-4 w-4 md:h-5 md:w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-bold">Target</p>
                <p className="text-xs text-stone-400">Mark a token for attacks</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Grid Highlight Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onModeChange('highlight')}
                  className={`
                    w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                    transition-all duration-200 shadow-lg backdrop-blur-sm
                    ${getColorClasses('amber', selectionMode === 'highlight')}
                    ${selectionMode === 'highlight' ? 'scale-110 ring-2 ring-white/20' : 'hover:scale-105'}
                  `}
                  aria-label="Highlight mode"
                  data-testid="selection-mode-highlight"
                >
                  <Highlighter className="h-4 w-4 md:h-5 md:w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-bold">Beacon</p>
                <p className="text-xs text-stone-400">Click grid to ping a location</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Spell Target Button */}
          {character && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowSpellPicker(true)}
                    className={`
                      w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                      transition-all duration-200 shadow-lg backdrop-blur-sm
                      ${getColorClasses('purple', isSpellTargetingActive || false)}
                      ${isSpellTargetingActive ? 'scale-110 ring-2 ring-white/20' : 'hover:scale-105'}
                    `}
                    aria-label="Spell Target mode"
                    data-testid="selection-mode-spell-target"
                  >
                    <Sparkles className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-bold">Spell Target</p>
                  <p className="text-xs text-stone-400">Target area with a spell</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Clear Spell Target Button - Only show when spell targeting is active */}
          {isSpellTargetingActive && onClearSpellTargeting && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onClearSpellTargeting}
                    className={`
                      w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                      transition-all duration-200 shadow-lg backdrop-blur-sm
                      ${getColorClasses('amber', false)}
                      hover:scale-105
                    `}
                    aria-label="Clear spell targeting"
                    data-testid="button-clear-spell-target"
                  >
                    <X className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-bold">Clear</p>
                  <p className="text-xs text-stone-400">Cancel spell targeting</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      
      {/* Spell Picker Dialog */}
      {character && (
        <SpellPickerDialog
          open={showSpellPicker}
          onOpenChange={setShowSpellPicker}
          character={character}
          onSelectSpell={handleSpellSelect}
        />
      )}
    </>
  );
}

// Spell Picker Dialog for spell targeting
interface SpellPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: any;
  onSelectSpell: (spell: any) => void;
}

function SpellPickerDialog({ open, onOpenChange, character, onSelectSpell }: SpellPickerDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Fetch character's spells
  const { data: spells = [] } = useQuery({
    queryKey: ['spells', character?.id],
    queryFn: () => character?.id ? api.getSpells(character.id) : Promise.resolve([]),
    enabled: open && !!character?.id,
  });
  
  // Fetch character's hotbars to know which spells are equipped
  const { data: hotbars = [] } = useQuery({
    queryKey: ['hotbars', character?.id],
    queryFn: () => character?.id ? api.getHotbars(character.id) : Promise.resolve([]),
    enabled: open && !!character?.id,
  });
  
  // Get equipped spell IDs from magic hotbar
  const equippedSpellIds = new Set(
    hotbars
      .filter((h: Hotbar) => h.hotbarType === 'magic' && h.spellId)
      .map((h: Hotbar) => h.spellId)
  );
  
  // Sort spells: hotbar spells first, then by name
  const sortedSpells = [...spells].sort((a: any, b: any) => {
    const aEquipped = equippedSpellIds.has(a.id);
    const bEquipped = equippedSpellIds.has(b.id);
    if (aEquipped && !bEquipped) return -1;
    if (!aEquipped && bEquipped) return 1;
    return a.name.localeCompare(b.name);
  });
  
  // Filter by search
  const filteredSpells = sortedSpells.filter((spell: any) =>
    spell.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-stone-900 border-stone-700 max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-purple-400 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Select Spell to Target
          </DialogTitle>
        </DialogHeader>
        
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
          <Input
            placeholder="Search spells..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-stone-800 border-stone-700"
            data-testid="input-spell-picker-search"
          />
        </div>
        
        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="space-y-2 pr-2">
            {filteredSpells.length === 0 ? (
              <div className="text-center py-8 text-stone-400">
                <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No spells found</p>
                <p className="text-xs mt-1">Add spells in your character sheet</p>
              </div>
            ) : (
              filteredSpells.map((spell: any) => {
                const isEquipped = equippedSpellIds.has(spell.id);
                const rangeDisplay = spell.rangeNum ? `${spell.rangeNum}ft` : (spell.range || 'Self');
                const hasAoe = spell.isAoe && spell.aoeShape;
                
                return (
                  <div
                    key={spell.id}
                    onClick={() => onSelectSpell(spell)}
                    className={`
                      p-3 rounded-lg border cursor-pointer transition-all
                      ${isEquipped 
                        ? 'bg-purple-900/30 border-purple-600 hover:border-purple-400' 
                        : 'bg-stone-800 border-stone-700 hover:border-purple-500'}
                    `}
                    data-testid={`spell-picker-item-${spell.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-stone-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {spell.image ? (
                          <img src={spell.image} alt={spell.name} className="w-full h-full object-cover" />
                        ) : (
                          <Sparkles className="h-5 w-5 text-purple-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-stone-100 truncate">{spell.name}</span>
                          {isEquipped && (
                            <Badge className="bg-purple-600/50 text-purple-200 text-[10px] px-1">Hotbar</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-stone-400 mt-0.5">
                          <span>Range: {rangeDisplay}</span>
                          {hasAoe && (
                            <span className="text-purple-400">
                              AoE: {spell.aoeShape} {spell.aoeRange}ft
                            </span>
                          )}
                          {(spell.damageDice || spell.damage) && (
                            <span className="text-orange-400">
                              {spell.damageDice || spell.damage} {spell.damageType || ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        
        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-stone-600">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 4. Add Character Dialog - Name and Race selection, all other stats editable in character sheet
interface AddCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCharacter: (characterData: any) => void;
  campaignId?: string;
}

function AddCharacterDialog({ open, onOpenChange, onAddCharacter, campaignId }: AddCharacterDialogProps) {
  const [name, setName] = useState("");
  const [selectedRace, setSelectedRace] = useState("Human");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch system species from database
  const { data: systemSpeciesList = [] } = useQuery({
    queryKey: ['species'],
    queryFn: () => api.getSpecies('Arcana Adventure'),
    enabled: open,
  });

  // Fetch campaign species if campaignId is provided
  const { data: campaignSpeciesList = [] } = useQuery({
    queryKey: ['campaignSpecies', campaignId],
    queryFn: () => api.getCampaignSpecies(campaignId!),
    enabled: open && !!campaignId,
  });

  // Combine system and campaign species
  const speciesList = [
    ...systemSpeciesList.map((s: any) => ({ ...s, source: 'system' })),
    ...campaignSpeciesList.map((s: any) => ({ ...s, source: 'campaign' })),
  ];

  // Get the selected species data
  const selectedSpecies = speciesList.find((s: any) => s.name === selectedRace) || {
    name: "Human",
    size: "Medium",
    naturalArmor: 5,
    sizeBonus: 0,
    speed: 30,
    flySpeed: 0,
    startingHp: 10,
    startingMaxHp: 10,
    startingEnergy: 10,
    startingMaxEnergy: 10,
    featTree: ""
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    
    // Create character with name and selected race stats
    onAddCharacter({
      name: name.trim(),
      level: 1,
      class: "", // Required field, kept for backwards compatibility
      race: selectedSpecies.name,
      size: selectedSpecies.size || "Medium",
      naturalArmor: selectedSpecies.naturalArmor || 5,
      sizeBonus: selectedSpecies.sizeBonus || 0,
      speed: selectedSpecies.speed || 30,
      flySpeed: selectedSpecies.flySpeed || 0,
      featTree: selectedSpecies.featTree || "",
      // HP/Energy from selected species
      hp: selectedSpecies.startingHp || 10,
      maxHp: selectedSpecies.startingMaxHp || 10,
      energy: selectedSpecies.startingEnergy || 10,
      maxEnergy: selectedSpecies.startingMaxEnergy || 10,
      // Bonus HP tracking for level-up system
      bonusHpFromLevelUps: 0,
      lastLevelUpRolled: 1,
      // Default attributes (range -2 to 5, default 0)
      might: 0,
      finesse: 0,
      wit: 0,
      presence: 0,
      will: 0,
      craft: 0,
      // Default skills
      skillAgility: 0,
      skillArcana: 0,
      skillCharisma: 0,
      skillConcentration: 0,
      skillDeception: 0,
      skillHistory: 0,
      skillIntimidation: 0,
      skillInvestigation: 0,
      skillMedicine: 0,
      skillPerception: 0,
      skillSleightOfHand: 0,
      skillStealth: 0,
      skillStrength: 0,
      skillWisdom: 0,
      skillCulture: 0,
      inventory: []
    });
    
    setName("");
    setSelectedRace("Human");
    setIsSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        setName("");
        setSelectedRace("Human");
      }
      onOpenChange(open);
    }}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-amber-500 font-display text-2xl">Create Character</DialogTitle>
          <DialogDescription className="text-stone-400">
            Enter a name and select a race. You can customize everything else in the character sheet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="char-name" className="text-stone-300">Character Name</Label>
            <Input
              id="char-name"
              data-testid="input-character-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-stone-800 border-stone-700 text-stone-200"
              placeholder="Enter character name..."
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="char-race" className="text-stone-300">Race</Label>
            <Select value={selectedRace} onValueChange={setSelectedRace}>
              <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200" data-testid="select-character-race">
                <SelectValue placeholder="Select a race" />
              </SelectTrigger>
              <SelectContent className="bg-stone-800 border-stone-700">
                {speciesList.length > 0 ? (
                  <>
                    {systemSpeciesList.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-stone-500 font-bold border-b border-stone-700">System Species</div>
                        {systemSpeciesList.map((species: any) => (
                          <SelectItem key={species.id} value={species.name} className="text-stone-200">
                            {species.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {campaignSpeciesList.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs text-amber-500 font-bold border-b border-stone-700 mt-1">Campaign Species</div>
                        {campaignSpeciesList.map((species: any) => (
                          <SelectItem key={species.id} value={species.name} className="text-amber-300">
                            {species.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <SelectItem value="Human" className="text-stone-200">Human</SelectItem>
                )}
              </SelectContent>
            </Select>
            {selectedSpecies && (
              <p className="text-xs text-stone-500">
                HP: {selectedSpecies.startingMaxHp || 10} | Energy: {selectedSpecies.startingMaxEnergy || 10} | Speed: {selectedSpecies.speed || 30}ft
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 bg-stone-800 border-stone-700 hover:bg-stone-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="button-submit-character"
              disabled={!name.trim() || isSubmitting}
              className="flex-1 bg-amber-700 hover:bg-amber-600 text-white"
            >
              {isSubmitting ? "Creating..." : "Create Character"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Scene Settings Dialog
interface SceneSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene?: Scene;
  onUpdateScene: (settings: Partial<Scene>) => void;
}

function SceneSettingsDialog({ open, onOpenChange, scene, onUpdateScene }: SceneSettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState({
    gridEnabled: scene?.gridEnabled ?? true,
    gridType: scene?.gridType ?? 'square',
    gridSize: scene?.gridSize ?? 50,
    gridThickness: scene?.gridThickness ?? 1,
    gridOpacity: scene?.gridOpacity ?? 0.4,
    backgroundImage: scene?.backgroundImage ?? '',
  });
  const [showImageBrowser, setShowImageBrowser] = useState(false);

  // Reset local settings when scene changes or dialog opens
  useEffect(() => {
    if (scene) {
      setLocalSettings({
        gridEnabled: scene.gridEnabled,
        gridType: scene.gridType,
        gridSize: scene.gridSize,
        gridThickness: scene.gridThickness ?? 1,
        gridOpacity: scene.gridOpacity ?? 0.4,
        backgroundImage: scene.backgroundImage || '',
      });
    }
  }, [scene, open]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLocalSettings(prev => ({ ...prev, backgroundImage: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = () => {
    onUpdateScene(localSettings);
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (scene) {
      setLocalSettings({
        gridEnabled: scene.gridEnabled,
        gridType: scene.gridType,
        gridSize: scene.gridSize,
        gridThickness: scene.gridThickness ?? 1,
        gridOpacity: scene.gridOpacity ?? 0.4,
        backgroundImage: scene.backgroundImage || '',
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-amber-500 font-display text-2xl">Scene Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Grid Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="grid-toggle" className="text-stone-300">Enable Grid</Label>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="grid-toggle"
                checked={localSettings.gridEnabled}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, gridEnabled: e.target.checked }))}
                className="h-4 w-4"
                data-testid="toggle-grid"
              />
            </div>
          </div>

          {/* Grid Type */}
          {localSettings.gridEnabled && (
            <div className="space-y-2">
              <Label htmlFor="grid-type" className="text-stone-300">Grid Type</Label>
              <select
                id="grid-type"
                value={localSettings.gridType}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, gridType: e.target.value }))}
                className="w-full bg-stone-800 border-stone-700 text-stone-200 rounded px-3 py-2"
                data-testid="select-grid-type"
              >
                <option value="square">Square</option>
                <option value="hex">Hexagon</option>
              </select>
            </div>
          )}

          {/* Grid Size */}
          {localSettings.gridEnabled && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="grid-size" className="text-stone-300">Grid Size</Label>
                <span className="text-xs text-amber-500">{localSettings.gridSize}px</span>
              </div>
              <input
                type="range"
                id="grid-size"
                min="30"
                max="100"
                value={localSettings.gridSize}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, gridSize: parseInt(e.target.value) }))}
                className="w-full accent-amber-600"
                data-testid="slider-grid-size"
              />
            </div>
          )}

          {/* Grid Thickness */}
          {localSettings.gridEnabled && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="grid-thickness" className="text-stone-300">Grid Thickness</Label>
                <span className="text-xs text-amber-500">{localSettings.gridThickness}px</span>
              </div>
              <input
                type="range"
                id="grid-thickness"
                min="1"
                max="5"
                step="0.5"
                value={localSettings.gridThickness}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, gridThickness: parseFloat(e.target.value) }))}
                className="w-full accent-amber-600"
                data-testid="slider-grid-thickness"
              />
            </div>
          )}

          {/* Grid Opacity */}
          {localSettings.gridEnabled && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="grid-opacity" className="text-stone-300">Grid Opacity</Label>
                <span className="text-xs text-amber-500">{Math.round(localSettings.gridOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                id="grid-opacity"
                min="0.1"
                max="1"
                step="0.05"
                value={localSettings.gridOpacity}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, gridOpacity: parseFloat(e.target.value) }))}
                className="w-full accent-amber-600"
                data-testid="slider-grid-opacity"
              />
            </div>
          )}

          {/* Background Image Upload */}
          <div className="space-y-2">
            <Label htmlFor="bg-image" className="text-stone-300">Background Image</Label>
            <div className="flex gap-2">
              <input
                type="file"
                id="bg-image"
                accept="image/*"
                onChange={handleImageUpload}
                className="flex-1 bg-stone-800 border border-stone-700 text-stone-200 rounded px-3 py-2 text-sm"
                data-testid="input-background-image"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowImageBrowser(true)}
                className="border-stone-700 hover:bg-stone-800 text-amber-500"
                data-testid="button-browse-bg-library"
              >
                <Folder className="h-4 w-4 mr-1" />
                Library
              </Button>
            </div>
            {localSettings.backgroundImage && (
              <div className="mt-2 text-xs text-stone-400">
                Image loaded (preview on battlemap)
              </div>
            )}
          </div>

          {/* Image Browser Dialog */}
          <ImageBrowser
            open={showImageBrowser}
            onOpenChange={setShowImageBrowser}
            onSelect={(imageBase64) => {
              setLocalSettings(prev => ({ ...prev, backgroundImage: imageBase64 }));
            }}
            title="Select Background Image"
          />

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="flex-1 bg-stone-800 border-stone-700 hover:bg-stone-700"
              data-testid="button-cancel-scene-settings"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              className="flex-1 bg-amber-700 hover:bg-amber-600 text-white"
              data-testid="button-confirm-scene-settings"
            >
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Initiative Tracker Component
interface InitiativeTrackerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sceneId?: string;
  campaignId?: string;
  isGM: boolean;
  characters?: any[];
  userId?: string;
}

export function InitiativeTracker({ open, onOpenChange, sceneId, campaignId, isGM, characters = [], userId }: InitiativeTrackerProps) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [inactiveCollapsed, setInactiveCollapsed] = useState(true);

  const { data: initiativeData, isLoading } = useQuery({
    queryKey: [`/api/scenes/${sceneId}/initiative`],
    queryFn: () => api.getSceneInitiative(sceneId!),
    enabled: !!sceneId && open,
    refetchInterval: open ? 3000 : false,
  });

  const entries = initiativeData?.entries || [];
  const inCombat = initiativeData?.inCombat || false;
  const currentTurnCharacterId = initiativeData?.currentTurnCharacterId;

  // Sort by initiative value descending, then by id for stable ordering when values are equal
  const sortedEntries = [...entries].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.id.localeCompare(b.id);
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { value?: number; isHidden?: boolean } }) => 
      api.updateInitiativeEntry(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${sceneId}/initiative`] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteInitiativeEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${sceneId}/initiative`] });
    },
  });

  const combatMutation = useMutation({
    mutationFn: ({ inCombat, currentTurnCharacterId }: { inCombat: boolean; currentTurnCharacterId?: string }) => 
      api.updateCombatState(sceneId!, inCombat, currentTurnCharacterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${sceneId}/initiative`] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearSceneInitiative(sceneId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${sceneId}/initiative`] });
    },
  });

  const getCharacterName = (characterId: string) => {
    const char = characters.find(c => c.id === characterId);
    return char?.name || 'Unknown';
  };

  const getCharacterPortrait = (characterId: string) => {
    const char = characters.find(c => c.id === characterId);
    return char?.portrait;
  };

  const handleStartCombat = async () => {
    if (sortedEntries.length > 0) {
      const firstCharacterId = sortedEntries[0].characterId;
      
      combatMutation.mutate({ 
        inCombat: true, 
        currentTurnCharacterId: firstCharacterId 
      });
      toast({
        title: "Combat Started",
        description: `${getCharacterName(firstCharacterId)}'s turn!`,
      });
      
      // Process effect triggers for the first character (start of round + start of turn)
      // Visual notifications are handled via WebSocket broadcast in Campaign.tsx
      if (sceneId && firstCharacterId) {
        try {
          await api.processEffectTriggers(sceneId, firstCharacterId, 'start_of_turn', true);
        } catch (err) {
          console.error('Failed to process effect triggers:', err);
        }
      }
    }
  };

  const handleEndCombat = () => {
    combatMutation.mutate({ inCombat: false, currentTurnCharacterId: undefined });
    toast({
      title: "Combat Ended",
      description: "Initiative tracking paused",
    });
  };

  const handleNextTurn = async () => {
    const currentIndex = sortedEntries.findIndex(e => e.characterId === currentTurnCharacterId);
    const nextIndex = (currentIndex + 1) % sortedEntries.length;
    const nextCharacterId = sortedEntries[nextIndex].characterId;
    const isNewRound = nextIndex === 0;
    
    // Update combat state first
    combatMutation.mutate({ inCombat: true, currentTurnCharacterId: nextCharacterId });
    
    toast({
      title: isNewRound ? "New Round" : "Next Turn",
      description: `${getCharacterName(nextCharacterId)}'s turn!`,
    });
    
    // Process effect triggers for the character whose turn is starting
    // Visual notifications are handled via WebSocket broadcast in Campaign.tsx
    if (sceneId && nextCharacterId) {
      try {
        await api.processEffectTriggers(sceneId, nextCharacterId, 'start_of_turn', isNewRound);
      } catch (err) {
        console.error('Failed to process effect triggers:', err);
      }
    }
  };

  const handleSaveEdit = (id: string) => {
    updateMutation.mutate({ id, data: { value: editValue } });
    setEditingId(null);
  };

  const handleToggleHidden = (entry: any) => {
    updateMutation.mutate({ id: entry.id, data: { isHidden: !entry.isHidden } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-amber-500 font-display text-2xl flex items-center gap-2">
            <Zap className="w-6 h-6" />
            Initiative Tracker
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Combat Status */}
          {inCombat && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-center">
              <span className="text-red-300 font-semibold">Combat Active</span>
            </div>
          )}

          {/* Initiative List */}
          {isLoading ? (
            <div className="text-center py-4 text-stone-400">Loading...</div>
          ) : sortedEntries.length === 0 ? (
            <div className="text-center py-8 text-stone-400">
              <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No initiative rolls yet</p>
              <p className="text-xs mt-1">Characters can roll initiative from their character sheet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {sortedEntries.map((entry, index) => {
                const isCurrentTurn = inCombat && entry.characterId === currentTurnCharacterId;
                const portrait = getCharacterPortrait(entry.characterId);
                
                return (
                  <div
                    key={entry.id}
                    className={`
                      flex items-center gap-3 p-2 rounded-lg border transition-all
                      ${isCurrentTurn 
                        ? 'bg-amber-900/50 border-amber-600' 
                        : 'bg-stone-800 border-stone-700'
                      }
                      ${entry.isHidden && isGM ? 'opacity-60' : ''}
                    `}
                    data-testid={`initiative-entry-${entry.characterId}`}
                  >
                    {/* Turn Indicator */}
                    <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </div>
                    
                    {/* Portrait */}
                    {portrait ? (
                      <img 
                        src={portrait} 
                        alt="" 
                        className="w-8 h-8 rounded-full object-cover border border-stone-600"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center">
                        <User className="w-4 h-4 text-stone-400" />
                      </div>
                    )}
                    
                    {/* Character Name */}
                    <div className="flex-1 min-w-0">
                      <span className={`truncate block ${isCurrentTurn ? 'text-amber-300 font-semibold' : 'text-stone-200'}`}>
                        {getCharacterName(entry.characterId)}
                      </span>
                      {entry.isHidden && isGM && (
                        <span className="text-xs text-stone-500">(Hidden)</span>
                      )}
                    </div>
                    
                    {/* Initiative Value */}
                    {editingId === entry.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={editValue === 0 ? '' : editValue}
                          onChange={(e) => setEditValue(e.target.value === '' ? 0 : parseInt(e.target.value))}
                          className="w-16 h-8 bg-stone-700 border-stone-600 text-center"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(entry.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleSaveEdit(entry.id)}>
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <span 
                        className={`text-lg font-bold ${isCurrentTurn ? 'text-amber-400' : 'text-amber-500'} ${isGM ? 'cursor-pointer hover:text-amber-300' : ''}`}
                        onClick={() => {
                          if (isGM) {
                            setEditingId(entry.id);
                            setEditValue(entry.value);
                          }
                        }}
                      >
                        {entry.value}
                      </span>
                    )}
                    
                    {/* GM Controls */}
                    {isGM && !editingId && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleHidden(entry)}
                          className="h-8 w-8 p-0"
                          title={entry.isHidden ? "Show to players" : "Hide from players"}
                        >
                          {entry.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(entry.id)}
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/50"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Roll Initiative Section - Characters that haven't rolled yet (Collapsible) */}
          {sceneId && (() => {
            const charactersWithInitiative = new Set(entries.map((e: any) => e.characterId));
            const charactersNeedingRoll = characters.filter((c: any) => {
              if (charactersWithInitiative.has(c.id)) return false;
              // Players can only roll for their own characters, GMs can roll for any
              if (isGM) return true;
              return c.userId === userId;
            });
            
            if (charactersNeedingRoll.length === 0) return null;
            
            return (
              <div className="pt-4 border-t border-stone-700">
                <button
                  onClick={() => setInactiveCollapsed(!inactiveCollapsed)}
                  className="flex items-center justify-between w-full text-left mb-2 hover:bg-stone-800/50 rounded p-1 -m-1"
                  data-testid="button-toggle-inactive-characters"
                >
                  <h4 className="text-sm font-semibold text-stone-400">
                    Not in Initiative ({charactersNeedingRoll.length})
                  </h4>
                  {inactiveCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-stone-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-400" />
                  )}
                </button>
                {!inactiveCollapsed && (
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {charactersNeedingRoll.map((char: any) => (
                      <div 
                        key={char.id}
                        className="flex items-center gap-3 p-2 bg-stone-800 border border-stone-700 rounded-lg"
                      >
                        {char.portrait ? (
                          <img 
                            src={char.portrait} 
                            alt="" 
                            className="w-8 h-8 rounded-full object-cover border border-stone-600"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center">
                            <User className="w-4 h-4 text-stone-400" />
                          </div>
                        )}
                        <span className="flex-1 text-stone-200 truncate">{char.name}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-600 text-amber-500 hover:bg-amber-600/20"
                          onClick={() => {
                            gameWs.sendInitiativeRoll(sceneId, char.id);
                          }}
                          data-testid={`button-roll-initiative-${char.id}`}
                        >
                          <Dice5 className="w-3 h-3 mr-1" />
                          Roll
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          
          {/* GM Actions */}
          {isGM && sortedEntries.length > 0 && (
            <div className="flex flex-col gap-2 pt-4 border-t border-stone-700">
              {!inCombat ? (
                <Button
                  onClick={handleStartCombat}
                  className="w-full bg-red-700 hover:bg-red-600 text-white"
                  data-testid="button-start-combat"
                >
                  <Swords className="w-4 h-4 mr-2" />
                  Start Combat
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={handleNextTurn}
                    className="flex-1 bg-amber-700 hover:bg-amber-600 text-white"
                    data-testid="button-next-turn"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Next Turn
                  </Button>
                  <Button
                    onClick={handleEndCombat}
                    variant="outline"
                    className="border-stone-600 hover:bg-stone-800"
                    data-testid="button-end-combat"
                  >
                    End
                  </Button>
                </div>
              )}
              <Button
                onClick={() => clearMutation.mutate()}
                variant="outline"
                className="w-full border-stone-600 hover:bg-stone-800 text-stone-400"
                data-testid="button-clear-initiative"
              >
                Clear All Initiative
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 5. Campaign Menu & Chat
interface CampaignMenuProps {
  campaignId?: string;
  role: Role;
  inviteCode?: string;
  inspectedChar?: Character;
  onInspectChar?: (char: Character | null) => void;
  onAddCharacterToken?: (character: any) => void;
  onChangeMap?: () => void;
  characters?: any[];
  members?: any[];
  onAddCharacter?: (characterData: any) => void;
  onViewCharacter?: (char: any) => void;
  onLevelUpAll?: (mode: 'set' | 'add', targetLevel?: number) => void;
  chatOpen?: boolean;
  onChatOpenChange?: (open: boolean) => void;
  onAssignCharacter?: (char: any) => void;
  myPermissions?: { permissions: Record<string, string> };
  onOpenCampaignSpecies?: () => void;
  isOwner?: boolean;
  gmUserId?: string;
}

export function CampaignMenu({ campaignId, role, inviteCode, inspectedChar, onInspectChar, onAddCharacterToken, onChangeMap, characters, members, onAddCharacter, onViewCharacter, onLevelUpAll, chatOpen = false, onChatOpenChange, onAssignCharacter, myPermissions, onOpenCampaignSpecies, isOwner = false, gmUserId }: CampaignMenuProps) {
  const { user } = useAuth();
  const setChatOpen = onChatOpenChange || (() => {});
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [showLevelUpDialog, setShowLevelUpDialog] = useState(false);
  const [levelUpMode, setLevelUpMode] = useState<'set' | 'add'>('add');
  const [targetLevel, setTargetLevel] = useState(1);
  const [addTokenDialogOpen, setAddTokenDialogOpen] = useState(false);
  const [messages, setMessages] = useState<{ sender: string; userId: string | null; text: string; type: string }[]>([
    { sender: "System", userId: null, text: "Welcome to Arcana Adventure!", type: "system" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [selectedCharForAccess, setSelectedCharForAccess] = useState<any>(null);
  const [accessLevels, setAccessLevels] = useState<Record<string, string>>({});
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [pendingDeleteChar, setPendingDeleteChar] = useState<any>(null);
  const [clearingChat, setClearingChat] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  
  // Folder state
  const [draggingCharacterId, setDraggingCharacterId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  const queryClient = useQueryClient();
  
  // Helper function to get display name (just returns username since nicknames were removed)
  const getDisplayName = (userId: string | null, fallbackUsername: string): string => {
    return fallbackUsername;
  };
  
  // Folder query
  const { data: folders = [] } = useQuery({
    queryKey: ['campaign-folders', campaignId],
    queryFn: () => api.getCampaignFolders(campaignId!),
    enabled: !!campaignId,
  });

  // Folder mutations
  const createFolderMutation = useMutation({
    mutationFn: (name: string) => api.createCharacterFolder(campaignId!, { name, sortOrder: folders.length }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign-folders', campaignId] }),
  });

  const updateFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateCharacterFolder(campaignId!, id, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaign-folders', campaignId] }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.deleteCharacterFolder(campaignId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-folders', campaignId] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
    },
  });

  const moveCharacterMutation = useMutation({
    mutationFn: ({ characterId, folderId }: { characterId: string; folderId: string | null }) => 
      api.moveCharacterToFolder(characterId, folderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] }),
  });

  // Character template library query
  const { data: characterTemplates = [] } = useQuery({
    queryKey: ['character-templates'],
    queryFn: () => api.getPublicCharacterTemplates(),
    enabled: showTemplateLibrary,
  });

  // Importable characters query (for importing from other campaigns)
  const { data: importableData = [], isLoading: loadingImportable } = useQuery({
    queryKey: ['importable-characters', campaignId],
    queryFn: () => api.getImportableCharacters(campaignId!),
    enabled: showImportDialog && !!campaignId,
  });

  // Mutation to copy template to campaign
  const copyTemplateMutation = useMutation({
    mutationFn: (templateId: string) => api.copyTemplateToCompany(campaignId!, templateId),
    onSuccess: (character) => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
      setShowTemplateLibrary(false);
      setTemplateSearchQuery('');
      toast({ title: 'Character Added', description: `${character.name} has been added to the campaign` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add character from template', variant: 'destructive' });
    },
  });

  // Mutation to import character from another campaign
  const importCharacterMutation = useMutation({
    mutationFn: (sourceCharacterId: string) => api.importCharacter(campaignId!, sourceCharacterId),
    onSuccess: (character) => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
      setShowImportDialog(false);
      toast({ title: 'Character Imported', description: `${character.name} has been imported to the campaign` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to import character', variant: 'destructive' });
    },
  });
  
  // Folder helper functions
  const getCharactersInFolder = (folderId: string | null) => {
    return characters?.filter((c: any) => c.folderId === folderId) || [];
  };
  const unfiledCharacters = characters?.filter((c: any) => !c.folderId) || [];
  
  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Fetch existing chat messages from API
  const { data: chatMessagesData } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/chat`],
    queryFn: () => api.getChatMessages(campaignId!),
    enabled: !!campaignId,
  });
  
  // Update messages when chat data is loaded
  useEffect(() => {
    if (chatMessagesData && Array.isArray(chatMessagesData)) {
      const loadedMessages = chatMessagesData.map((msg: any) => ({
        sender: msg.sender,
        userId: msg.userId,
        text: msg.text,
        type: msg.type || 'chat',
      }));
      setMessages([
        { sender: "System", userId: null, text: "Welcome to Arcana Adventure!", type: "system" },
        ...loadedMessages,
      ]);
    }
  }, [chatMessagesData]);
  
  // Listen for new chat messages via WebSocket
  useEffect(() => {
    if (!campaignId) return;
    
    const unsubscribe = gameWs.onMessage((data) => {
      if (data.type === 'chat_message' && data.message) {
        setMessages(prev => [...prev, {
          sender: data.message.sender,
          userId: data.message.userId,
          text: data.message.text,
          type: data.message.type || 'chat',
        }]);
      }
    });
    
    return () => { unsubscribe(); };
  }, [campaignId]);
  
  // Listen for all entity updates via WebSocket and invalidate queries for live updates
  useEffect(() => {
    if (!campaignId) return;
    
    const unsubscribe = gameWs.onMessage((data) => {
      // Character operations
      if (data.type === 'character_created' || data.type === 'character_updated' || data.type === 'character_deleted') {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
        if (data.characterId) {
          queryClient.invalidateQueries({ queryKey: [`/api/characters/${data.characterId}`] });
        }
      }
      
      // Item operations
      if (data.type === 'item_created' || data.type === 'item_updated' || data.type === 'item_deleted') {
        if (data.characterId) {
          queryClient.invalidateQueries({ queryKey: ['items', data.characterId] });
          queryClient.invalidateQueries({ queryKey: ['hotbars', data.characterId] });
        }
      }
      
      // Spell operations
      if (data.type === 'spell_created' || data.type === 'spell_updated' || data.type === 'spell_deleted') {
        if (data.characterId) {
          queryClient.invalidateQueries({ queryKey: ['spells', data.characterId] });
          queryClient.invalidateQueries({ queryKey: ['hotbars', data.characterId] });
        }
      }
      
      // Scene operations
      if (data.type === 'scene_created') {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/scenes`] });
      }
      
      // Token operations
      if (data.type === 'token_created' || data.type === 'token_updated' || data.type === 'token_deleted') {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/tokens`] });
      }
      
      // Hotbar operations
      if (data.type === 'hotbar_updated') {
        if (data.characterId) {
          queryClient.invalidateQueries({ queryKey: ['hotbars', data.characterId] });
        }
      }
      
      // Feat operations - feats can grant spells, traits, and skills
      if (data.type === 'feat_unlocked' || data.type === 'feat_removed') {
        if (data.characterId) {
          queryClient.invalidateQueries({ queryKey: ['character-feats', data.characterId] });
          queryClient.invalidateQueries({ queryKey: [`/api/characters/${data.characterId}`] });
          queryClient.invalidateQueries({ queryKey: ['spells', data.characterId] });
          queryClient.invalidateQueries({ queryKey: ['character-traits', data.characterId] });
          queryClient.invalidateQueries({ queryKey: ['character-custom-skills', data.characterId] });
        }
      }
      
      // Custom skill operations
      if (data.type === 'custom_skill_added' || data.type === 'custom_skill_updated' || data.type === 'custom_skill_removed') {
        if (data.characterId) {
          queryClient.invalidateQueries({ queryKey: ['character-custom-skills', data.characterId] });
        }
      }
      
      // Trait operations
      if (data.type === 'trait_added' || data.type === 'trait_updated' || data.type === 'trait_removed' || data.type === 'trait_used') {
        if (data.characterId) {
          queryClient.invalidateQueries({ queryKey: ['character-traits', data.characterId] });
        }
      }
      
      // Traits reset on rest (short rest or long rest)
      if (data.type === 'traits_reset') {
        if (data.characterId) {
          queryClient.invalidateQueries({ queryKey: ['character-traits', data.characterId] });
        }
      }
    });
    
    return () => { unsubscribe(); };
  }, [campaignId, queryClient]);
  
  // Auto-scroll to bottom when new messages arrive or when chat opens
  useEffect(() => {
    if (chatOpen) {
      // Use setTimeout to ensure DOM is rendered before scrolling
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
    }
  }, [chatOpen, messages]);

  // Fetch banned players (only for GMs)
  const { data: bannedPlayers = [] } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/bans`],
    queryFn: () => api.getCampaignBans(campaignId!),
    enabled: !!campaignId && role === 'gm',
  });

  // Kick mutation
  const kickMutation = useMutation({
    mutationFn: (userId: string) => api.kickMember(campaignId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/members`] });
      toast({
        title: "Member Kicked",
        description: "The player has been removed from the campaign",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to kick member",
        variant: "destructive",
      });
    },
  });

  // Ban mutation
  const banMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) => 
      api.banMember(campaignId!, userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/members`] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/bans`] });
      toast({
        title: "Member Banned",
        description: "The player has been banned from the campaign",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to ban member",
        variant: "destructive",
      });
    },
  });

  // Unban mutation
  const unbanMutation = useMutation({
    mutationFn: (userId: string) => api.unbanMember(campaignId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/members`] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/bans`] });
      toast({
        title: "Member Unbanned",
        description: "The player can now rejoin the campaign",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unban member",
        variant: "destructive",
      });
    },
  });

  const handleKick = (member: any) => {
    if (confirm(`Are you sure you want to kick ${member.username || 'this player'}?`)) {
      kickMutation.mutate(member.userId);
    }
  };

  const handleBan = (member: any) => {
    const reason = prompt(`Enter a reason for banning ${member.username || 'this player'} (optional):`);
    if (reason !== null) {
      banMutation.mutate({ userId: member.userId, reason: reason || undefined });
    }
  };

  const handleUnban = (ban: any) => {
    if (confirm(`Are you sure you want to unban ${ban.username || 'this player'}?`)) {
      unbanMutation.mutate(ban.userId);
    }
  };

  // Role change mutation (owner only)
  const setMemberRoleMutation = useMutation({
    mutationFn: ({ memberId, newRole }: { memberId: string; newRole: 'player' | 'assistant_gm' }) => 
      api.setMemberRole(campaignId!, memberId, newRole),
    onSuccess: (_, { newRole }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/members`] });
      toast({
        title: "Role Updated",
        description: newRole === 'assistant_gm' ? "Player promoted to Assistant GM" : "Demoted to Player",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change role",
        variant: "destructive",
      });
    },
  });

  const handleRoleChange = (member: any, newRole: 'player' | 'assistant_gm') => {
    setMemberRoleMutation.mutate({ memberId: member.id, newRole });
  };

  // Delete character mutation
  const deleteCharacterMutation = useMutation({
    mutationFn: (characterId: string) => api.deleteCharacter(characterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/tokens`] });
      setPendingDeleteChar(null);
      toast({
        title: "Character Deleted",
        description: "The character and all associated tokens have been removed",
      });
    },
    onError: (error: Error) => {
      console.error("Delete character error:", error);
      setPendingDeleteChar(null);
      toast({
        title: "Error",
        description: error.message || "Failed to delete character",
        variant: "destructive",
      });
    },
  });

  const handleDeleteCharacter = (char: any) => {
    setPendingDeleteChar(char);
  };
  
  const confirmDeleteCharacter = () => {
    if (pendingDeleteChar) {
      deleteCharacterMutation.mutate(pendingDeleteChar.id);
    }
  };

  useEffect(() => {
    if (showAccessDialog && selectedCharForAccess) {
      setLoadingAccess(true);
      // Invalidate members query to get fresh data when dialog opens
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/members`] });
      
      api.getCharacterPermissions(selectedCharForAccess.id)
        .then((permissions) => {
          const levels: Record<string, string> = {};
          permissions.forEach((p: any) => {
            levels[p.userId] = p.accessLevel;
          });
          setAccessLevels(levels);
        })
        .catch((err) => {
          console.error("Failed to load permissions:", err);
          toast({
            title: "Error",
            description: "Failed to load character permissions",
            variant: "destructive"
          });
        })
        .finally(() => setLoadingAccess(false));
    }
  }, [showAccessDialog, selectedCharForAccess, queryClient, campaignId]);

  const handleSetAccess = async (userId: string, accessLevel: string) => {
    if (!selectedCharForAccess) return;
    try {
      await api.setCharacterPermission(selectedCharForAccess.id, userId, accessLevel);
      setAccessLevels(prev => ({ ...prev, [userId]: accessLevel }));
      toast({
        title: "Access Updated",
        description: `Permission set to ${accessLevel}`,
      });
    } catch (err) {
      console.error("Failed to set permission:", err);
      toast({
        title: "Error",
        description: "Failed to update access level",
        variant: "destructive"
      });
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if(!chatInput.trim()) return;
    
    // Check for /roll command
    const rollMatch = chatInput.trim().match(/^\/roll\s+(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
    if (rollMatch && campaignId) {
      const count = parseInt(rollMatch[1], 10);
      const sides = parseInt(rollMatch[2], 10);
      const modSign = rollMatch[3] || '+';
      const modValue = rollMatch[4] ? parseInt(rollMatch[4], 10) : 0;
      const modifier = modSign === '-' ? -modValue : modValue;
      
      // Validate dice parameters
      if (count < 1 || count > 100 || sides < 2 || sides > 100) {
        setMessages([...messages, { 
          sender: "System", 
          userId: null, 
          text: "Invalid dice format. Use /roll XdY or /roll XdY+Z (e.g., /roll 3d6 or /roll 2d10+5)", 
          type: "system" 
        }]);
        setChatInput("");
        return;
      }
      
      // Roll the dice
      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(Math.random() * sides) + 1);
      }
      const total = rolls.reduce((a, b) => a + b, 0) + modifier;
      const diceNotation = `${count}d${sides}`;
      const modifierStr = modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : '';
      const rollDisplay = `${diceNotation}${modifierStr}: [${rolls.join(', ')}]${modifierStr} = ${total}`;
      
      // Send roll to chat via WebSocket
      gameWs.sendChatMessage(user?.id || '', user?.username || 'Player', `/roll ${rollDisplay}`, 'roll');
      setChatInput("");
      return;
    }
    
    // Regular chat message - only send via WebSocket, listener will add to messages
    if (campaignId) {
      gameWs.sendChatMessage(user?.id || '', user?.username || 'Player', chatInput, 'chat');
    }
    setChatInput("");
  };

  const handleClearChat = async () => {
    if (!campaignId) return;
    setClearingChat(true);
    try {
      await api.clearChatMessages(campaignId);
      setMessages([{ sender: "System", userId: null, text: "Chat cleared.", type: "system" }]);
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/chat`] });
      toast({ title: "Chat Cleared", description: "All chat messages have been deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to clear chat", variant: "destructive" });
    } finally {
      setClearingChat(false);
    }
  };

  return (
    <>
      {/* Floating Chat Button if closed (handled by parent HUD usually, but here for fallback) */}
      
      {/* Chat Sheet (Left side usually or overlay) */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetTrigger asChild>
          <div className="hidden"></div>
        </SheetTrigger>
        <SheetContent side="left" className="bg-stone-950 border-r-stone-800 text-stone-200 w-[90vw] sm:max-w-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl text-amber-500">Adventure Log</h2>
            <div className="flex items-center gap-2">
              {role === 'gm' && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleClearChat}
                  disabled={clearingChat}
                  className="border-red-700/50 hover:bg-red-900/30 text-red-400 hover:text-red-300"
                  data-testid="button-clear-chat"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1 pr-4 mb-4 border border-stone-800 rounded bg-black/30 p-2">
            <div className="space-y-3">
              {messages.map((msg, i) => {
                // Parse roll message to extract total for notification-style display
                // Match the LAST "= number" in the string (the final calculated total)
                const parseRollTotal = (text: string) => {
                  // Find ALL "= number" patterns and take the last one
                  const allMatches = text.matchAll(/=\s*(-?\d+)/g);
                  const matches = Array.from(allMatches);
                  if (matches.length > 0) {
                    const lastMatch = matches[matches.length - 1];
                    return parseInt(lastMatch[1]);
                  }
                  return null;
                };
                const parseRollLabel = (text: string) => {
                  const colonIndex = text.indexOf(':');
                  return colonIndex > 0 ? text.substring(0, colonIndex) : text;
                };
                const parseRollBreakdown = (text: string) => {
                  const colonIndex = text.indexOf(':');
                  if (colonIndex > 0) {
                    const afterColon = text.substring(colonIndex + 1);
                    const equalsIndex = afterColon.lastIndexOf('=');
                    if (equalsIndex > 0) {
                      return afterColon.substring(0, equalsIndex).trim();
                    }
                    return afterColon.trim();
                  }
                  return text;
                };
                const isCritSuccess = msg.text.includes('Crit Success');
                const isCritFail = msg.text.includes('Crit Failure');
                
                return (
                  <div 
                    key={i} 
                    className={`text-sm ${
                      msg.type === 'system' 
                        ? 'text-amber-400 italic' 
                        : msg.type === 'roll'
                          ? ''
                          : 'text-stone-300'
                    }`}
                  >
                    {msg.type === 'roll' ? (
                      <div className={`
                        relative rounded-lg shadow-lg
                        bg-gradient-to-r ${isCritSuccess ? 'from-yellow-500 to-amber-600' : isCritFail ? 'from-red-800 to-red-900' : 'from-cyan-600 to-blue-700'}
                        border ${isCritSuccess ? 'border-yellow-400/50' : isCritFail ? 'border-red-600/50' : 'border-white/20'}
                        ${isCritSuccess ? 'ring-2 ring-yellow-400/50' : ''}
                        ${isCritFail ? 'ring-2 ring-red-500/50' : ''}
                      `}>
                        <div className="absolute inset-0 bg-black/20 rounded-lg" />
                        <div className="relative px-2 py-2">
                          {/* Header row with name and roll type */}
                          <div className="flex items-center gap-1.5 text-white/80 text-xs">
                            <Dice5 className="w-4 h-4 text-white flex-shrink-0" />
                            <span className="font-medium truncate">{getDisplayName(msg.userId, msg.sender)}</span>
                            <span className="text-white/50">•</span>
                            <span className="text-white/70 truncate">{parseRollLabel(msg.text)}</span>
                          </div>
                          {/* Total - prominent display */}
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className={`text-2xl font-bold text-white drop-shadow-lg ${isCritSuccess ? 'text-yellow-100' : ''} ${isCritFail ? 'text-red-200' : ''}`}>
                              {parseRollTotal(msg.text) || '?'}
                            </span>
                            {isCritSuccess && <span className="text-yellow-200 text-xs font-bold">CRIT!</span>}
                            {isCritFail && <span className="text-red-200 text-xs font-bold">FAIL!</span>}
                          </div>
                          {/* Breakdown */}
                          <div className="text-white/60 text-xs mt-0.5 break-words">
                            {parseRollBreakdown(msg.text)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="font-bold text-stone-500 mr-2">{getDisplayName(msg.userId, msg.sender)}:</span>
                        {msg.text}
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <form onSubmit={handleSend} className="flex gap-2">
            <Input 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)} 
              className="bg-stone-900 border-stone-700"
              placeholder="Say something..."
            />
            <Button type="submit" size="icon" className="bg-amber-700 hover:bg-amber-600">
              <ChevronRight />
            </Button>
          </form>
        </SheetContent>
      </Sheet>


      {/* Main Menu Sheet */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-white/50 hover:text-white hover:bg-white/10">
            <Settings className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
          </Button>
        </SheetTrigger>
        <SheetContent className="bg-stone-950 border-l-stone-800 text-stone-200 w-full sm:max-w-md overflow-y-auto">
          <div className="mb-6">
            <h2 className="font-display text-2xl text-amber-500 mb-1">Campaign Settings</h2>
            <p className="text-xs text-stone-500">Manage adventure details</p>
          </div>
          
          {/* Invite Code Section */}
          <div className="mb-8 p-4 bg-stone-900/50 border border-stone-800 rounded-lg">
            <h3 className="text-xs font-bold text-stone-400 uppercase mb-2 flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-amber-500" /> Invite Code
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-xl text-amber-100 tracking-widest bg-black/30 p-2 rounded text-center border border-dashed border-stone-700 select-all">
                {inviteCode || "LOADING..."}
              </div>
            </div>
          </div>

          {/* Campaign Species Button (GM Only) */}
          {role === 'gm' && onOpenCampaignSpecies && (
            <Button
              variant="secondary"
              className="w-full mb-4 bg-purple-900/50 hover:bg-purple-800/50 border border-purple-700"
              onClick={onOpenCampaignSpecies}
              data-testid="button-campaign-species-settings"
            >
              <Dna className="mr-2 h-4 w-4" /> Campaign Species
            </Button>
          )}

          {/* Campaign Notes Button */}
          <a href={`/notes?campaign=${campaignId}`} className="block">
            <Button
              variant="secondary"
              className="w-full mb-4 bg-indigo-900/50 hover:bg-indigo-800/50 border border-indigo-700"
              data-testid="button-campaign-notes"
            >
              <BookOpen className="mr-2 h-4 w-4" /> Campaign Notes
            </Button>
          </a>

          {/* Display Settings */}
          <div className="mb-6 p-4 bg-stone-900/50 border border-stone-800 rounded-lg">
            <h3 className="text-xs font-bold text-stone-400 uppercase mb-3 flex items-center gap-2">
              <Bell className="h-3 w-3 text-blue-400" /> Display Settings
            </h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="notification-style-menu" className="text-stone-300">Compact Notifications</Label>
              <input
                type="checkbox"
                id="notification-style-menu"
                checked={getNotificationStyle() === 'compact'}
                onChange={(e) => {
                  const newStyle = e.target.checked ? 'compact' : 'full';
                  setNotificationStyle(newStyle);
                  toast({
                    title: newStyle === 'compact' ? "Compact notifications" : "Full notifications",
                    description: newStyle === 'compact' ? "Roll notifications will appear small on the left" : "Roll notifications will appear large at the top",
                    duration: 2000,
                  });
                }}
                className="h-5 w-5"
                data-testid="toggle-notification-style"
              />
            </div>
          </div>

          <Tabs defaultValue="players" className="w-full">
            <TabsList className="w-full grid grid-cols-2 bg-stone-900">
              <TabsTrigger value="players">Players</TabsTrigger>
              <TabsTrigger value="characters">Characters</TabsTrigger>
            </TabsList>
            
            <TabsContent value="players" className="mt-4 space-y-4">
               {/* Campaign Members List */}
               <div className="space-y-2">
                  {members && members.length > 0 ? (
                    members.map((member: any) => (
                      <div 
                        key={member.id} 
                        className="p-3 bg-stone-800/50 rounded-lg flex justify-between items-center"
                        data-testid={`member-item-${member.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8 border border-stone-700">
                            <AvatarImage src={member.avatarUrl} alt={member.username || 'User'} />
                            <AvatarFallback className="bg-stone-700 text-stone-300 text-xs">
                              {(member.username || 'U').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div data-testid={`text-username-${member.id}`}>
                              <span className="text-amber-500 font-medium">@{member.username || 'Unknown'}</span>
                            </div>
                            {/* Role display - Owner can change non-owner roles */}
                            {isOwner && member.userId !== gmUserId ? (
                              <Select
                                value={member.role === 'assistant_gm' ? 'assistant_gm' : 'player'}
                                onValueChange={(value: 'player' | 'assistant_gm') => handleRoleChange(member, value)}
                                disabled={setMemberRoleMutation.isPending}
                              >
                                <SelectTrigger className="h-6 w-[120px] text-xs bg-stone-900 border-stone-700 px-2" data-testid={`select-role-${member.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-stone-900 border-stone-700">
                                  <SelectItem value="player" className="text-xs">Player</SelectItem>
                                  <SelectItem value="assistant_gm" className="text-xs">Assistant GM</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="text-xs text-stone-500">
                                {member.role === 'gm' ? 'GM' : member.role === 'assistant_gm' ? 'Assistant GM' : 'Player'}
                              </div>
                            )}
                          </div>
                        </div>
                        {role === 'gm' && member.userId !== gmUserId && campaignId && (
                          <div className="flex items-center gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleKick(member)}
                                    disabled={kickMutation.isPending}
                                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                                    data-testid={`button-kick-${member.userId}`}
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-stone-800 border-stone-700">
                                  <p>Kick Player</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleBan(member)}
                                    disabled={banMutation.isPending}
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-400 hover:bg-red-900/30"
                                    data-testid={`button-ban-${member.userId}`}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-stone-800 border-stone-700">
                                  <p>Ban Player</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-stone-500 text-sm">
                      No members yet
                    </div>
                  )}
               </div>
            </TabsContent>
            
            <TabsContent value="characters" className="mt-4 space-y-4">
               {/* Add Character Button (GM only) */}
               {role === 'gm' && onAddCharacter && (
                 <Button 
                   variant="secondary" 
                   className="w-full bg-stone-800 hover:bg-stone-700" 
                   onClick={() => setAddCharacterOpen(true)}
                   data-testid="button-add-character"
                 >
                   <Plus className="mr-2 h-4 w-4" /> Add Character
                 </Button>
               )}

               {/* Add from Library Button (GM only) */}
               {role === 'gm' && (
                 <Button 
                   variant="outline" 
                   className="w-full border-teal-700 text-teal-400 hover:bg-teal-900/30" 
                   onClick={() => setShowTemplateLibrary(true)}
                   data-testid="button-add-from-library"
                 >
                   <Library className="mr-2 h-4 w-4" /> Add from Library
                 </Button>
               )}

               {/* Import from Campaign Button (GM only) */}
               {role === 'gm' && (
                 <Button
                   variant="secondary"
                   className="w-full bg-stone-800/80 border-stone-700 hover:bg-stone-700"
                   onClick={() => setShowImportDialog(true)}
                   data-testid="button-import-character"
                 >
                   <Download className="mr-2 h-4 w-4" /> Import from Campaign
                 </Button>
               )}
               
               {/* Create Folder Input (GM only) */}
               {role === 'gm' && (
                 <div className="flex gap-2">
                   <Input
                     placeholder="New folder name..."
                     value={newFolderName}
                     onChange={(e) => setNewFolderName(e.target.value)}
                     className="flex-1 bg-stone-900 border-stone-700 text-stone-200"
                     data-testid="input-new-folder-name"
                   />
                   <Button
                     variant="secondary"
                     size="sm"
                     onClick={() => {
                       if (newFolderName.trim()) {
                         createFolderMutation.mutate(newFolderName.trim());
                         setNewFolderName('');
                       }
                     }}
                     disabled={!newFolderName.trim() || createFolderMutation.isPending}
                     className="bg-stone-800 hover:bg-stone-700"
                     data-testid="button-create-folder"
                   >
                     <FolderPlus className="h-4 w-4" />
                   </Button>
                 </div>
               )}
               
               {/* Folder Sections */}
               <div className="space-y-3">
                 {folders.map((folder: any) => {
                   const folderCharacters = getCharactersInFolder(folder.id);
                   const isExpanded = expandedFolders.has(folder.id);
                   
                   return (
                     <div
                       key={folder.id}
                       className={`bg-stone-850 rounded-lg border border-stone-700 p-2 transition-colors ${draggingCharacterId ? 'border-dashed' : ''}`}
                       onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-amber-500'); }}
                       onDragLeave={(e) => { e.currentTarget.classList.remove('border-amber-500'); }}
                       onDrop={(e) => {
                         e.preventDefault();
                         e.currentTarget.classList.remove('border-amber-500');
                         const charId = e.dataTransfer.getData('text/plain');
                         if (charId) {
                           moveCharacterMutation.mutate({ characterId: charId, folderId: folder.id });
                           setDraggingCharacterId(null);
                         }
                       }}
                       data-testid={`folder-section-${folder.id}`}
                     >
                       {/* Folder Header */}
                       <div
                         className="flex items-center justify-between p-2 cursor-pointer hover:bg-stone-800/50 rounded"
                         onClick={() => toggleFolder(folder.id)}
                       >
                         <div className="flex items-center gap-2 flex-1 min-w-0">
                           {isExpanded ? (
                             <ChevronDown className="h-4 w-4 text-stone-400 shrink-0" />
                           ) : (
                             <ChevronRight className="h-4 w-4 text-stone-400 shrink-0" />
                           )}
                           <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                           {editingFolderId === folder.id ? (
                             <Input
                               value={editingFolderName}
                               onChange={(e) => setEditingFolderName(e.target.value)}
                               onClick={(e) => e.stopPropagation()}
                               onKeyDown={(e) => {
                                 if (e.key === 'Enter') {
                                   updateFolderMutation.mutate({ id: folder.id, name: editingFolderName });
                                   setEditingFolderId(null);
                                 } else if (e.key === 'Escape') {
                                   setEditingFolderId(null);
                                 }
                               }}
                               onBlur={() => {
                                 if (editingFolderName.trim() && editingFolderName !== folder.name) {
                                   updateFolderMutation.mutate({ id: folder.id, name: editingFolderName });
                                 }
                                 setEditingFolderId(null);
                               }}
                               className="h-6 py-0 px-1 text-sm bg-stone-900 border-stone-600"
                               autoFocus
                               data-testid={`input-edit-folder-${folder.id}`}
                             />
                           ) : (
                             <span className="font-medium text-stone-200 truncate">{folder.name}</span>
                           )}
                           <Badge variant="secondary" className="bg-stone-700 text-stone-300 text-xs shrink-0">
                             {folderCharacters.length}
                           </Badge>
                         </div>
                         {role === 'gm' && editingFolderId !== folder.id && (
                           <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                             <Button
                               size="sm"
                               variant="ghost"
                               onClick={() => {
                                 setEditingFolderId(folder.id);
                                 setEditingFolderName(folder.name);
                               }}
                               className="h-6 w-6 p-0 text-stone-400 hover:text-stone-200"
                               data-testid={`button-edit-folder-${folder.id}`}
                             >
                               <Pencil className="h-3 w-3" />
                             </Button>
                             <Button
                               size="sm"
                               variant="ghost"
                               onClick={() => deleteFolderMutation.mutate(folder.id)}
                               disabled={deleteFolderMutation.isPending}
                               className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                               data-testid={`button-delete-folder-${folder.id}`}
                             >
                               <Trash2 className="h-3 w-3" />
                             </Button>
                           </div>
                         )}
                       </div>
                       
                       {/* Folder Characters */}
                       {isExpanded && (
                         <div className="mt-2 space-y-2 pl-6">
                           {folderCharacters.length > 0 ? (
                             folderCharacters.map((char: any) => (
                               <div 
                                 key={char.id} 
                                 className="p-2 bg-stone-900 rounded border border-stone-800 flex justify-between items-center gap-2"
                                 draggable={role === 'gm'}
                                 onDragStart={(e) => {
                                   e.dataTransfer.setData('text/plain', char.id.toString());
                                   setDraggingCharacterId(char.id);
                                 }}
                                 onDragEnd={() => setDraggingCharacterId(null)}
                                 data-testid={`character-item-${char.id}`}
                               >
                                 <div className="flex items-center gap-2 flex-1 min-w-0">
                                   {role === 'gm' && (
                                     <GripVertical className="h-4 w-4 text-stone-500 cursor-grab shrink-0" />
                                   )}
                                   <div className="min-w-0 flex-1">
                                     <div className="font-medium text-stone-200 truncate text-sm">{char.name}</div>
                                   </div>
                                 </div>
                                 <DropdownMenu>
                                   <DropdownMenuTrigger asChild>
                                     <Button
                                       size="sm"
                                       variant="ghost"
                                       className="h-7 w-7 p-0 text-stone-400 hover:text-stone-200"
                                       data-testid={`button-character-menu-${char.id}`}
                                     >
                                       <MoreVertical className="h-4 w-4" />
                                     </Button>
                                   </DropdownMenuTrigger>
                                   <DropdownMenuContent align="end" className="bg-stone-900 border-stone-700">
                                     {onViewCharacter && (
                                       <DropdownMenuItem
                                         onClick={() => onViewCharacter(char)}
                                         className="text-amber-200 focus:bg-amber-900/30 focus:text-amber-200"
                                         data-testid={`button-view-character-${char.id}`}
                                       >
                                         <User className="h-4 w-4 mr-2" />
                                         View Sheet
                                       </DropdownMenuItem>
                                     )}
                                     {onAssignCharacter && (role === 'gm' || myPermissions?.permissions?.[char.id] === 'edit' || myPermissions?.permissions?.[char.id] === 'owner') && (
                                       <DropdownMenuItem
                                         onClick={() => onAssignCharacter(char)}
                                         className="text-green-200 focus:bg-green-900/30 focus:text-green-200"
                                         data-testid={`button-assign-character-${char.id}`}
                                       >
                                         <UserCheck className="h-4 w-4 mr-2" />
                                         Assign Character
                                       </DropdownMenuItem>
                                     )}
                                     {role === 'gm' && (
                                       <DropdownMenuItem
                                         onClick={() => {
                                           setSelectedCharForAccess(char);
                                           setShowAccessDialog(true);
                                         }}
                                         className="text-purple-200 focus:bg-purple-900/30 focus:text-purple-200"
                                         data-testid={`button-manage-access-${char.id}`}
                                       >
                                         <Shield className="h-4 w-4 mr-2" />
                                         Manage Access
                                       </DropdownMenuItem>
                                     )}
                                     {role === 'gm' && (
                                       <>
                                         <DropdownMenuSeparator className="bg-stone-700" />
                                         <DropdownMenuItem
                                           onClick={() => handleDeleteCharacter(char)}
                                           disabled={deleteCharacterMutation.isPending}
                                           className="text-red-400 focus:bg-red-900/30 focus:text-red-400"
                                           data-testid={`button-delete-character-${char.id}`}
                                         >
                                           <Trash2 className="h-4 w-4 mr-2" />
                                           Delete
                                         </DropdownMenuItem>
                                       </>
                                     )}
                                   </DropdownMenuContent>
                                 </DropdownMenu>
                               </div>
                             ))
                           ) : (
                             <div className="p-3 text-center text-stone-500 text-sm border border-dashed border-stone-700 rounded">
                               Drag characters here
                             </div>
                           )}
                         </div>
                       )}
                     </div>
                   );
                 })}
                 
                 {/* Unfiled Characters Section */}
                 <div
                   className={`bg-stone-850 rounded-lg border border-stone-700 p-2 transition-colors ${draggingCharacterId ? 'border-dashed' : ''}`}
                   onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-amber-500'); }}
                   onDragLeave={(e) => { e.currentTarget.classList.remove('border-amber-500'); }}
                   onDrop={(e) => {
                     e.preventDefault();
                     e.currentTarget.classList.remove('border-amber-500');
                     const charId = e.dataTransfer.getData('text/plain');
                     if (charId) {
                       moveCharacterMutation.mutate({ characterId: charId, folderId: null });
                       setDraggingCharacterId(null);
                     }
                   }}
                   data-testid="unfiled-characters-section"
                 >
                   <div className="flex items-center gap-2 p-2 text-stone-400">
                     <FolderOpen className="h-4 w-4" />
                     <span className="font-medium">Unfiled</span>
                     <Badge variant="secondary" className="bg-stone-700 text-stone-300 text-xs">
                       {unfiledCharacters.length}
                     </Badge>
                   </div>
                   <div className="mt-2 space-y-2">
                     {unfiledCharacters.length > 0 ? (
                       unfiledCharacters.map((char: any) => (
                         <div 
                           key={char.id} 
                           className="p-2 bg-stone-900 rounded border border-stone-800 flex justify-between items-center gap-2"
                           draggable={role === 'gm'}
                           onDragStart={(e) => {
                             e.dataTransfer.setData('text/plain', char.id.toString());
                             setDraggingCharacterId(char.id);
                           }}
                           onDragEnd={() => setDraggingCharacterId(null)}
                           data-testid={`character-item-${char.id}`}
                         >
                           <div className="flex items-center gap-2 flex-1 min-w-0">
                             {role === 'gm' && (
                               <GripVertical className="h-4 w-4 text-stone-500 cursor-grab shrink-0" />
                             )}
                             <div className="min-w-0 flex-1">
                               <div className="font-medium text-stone-200 truncate text-sm">{char.name}</div>
                             </div>
                           </div>
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button
                                 size="sm"
                                 variant="ghost"
                                 className="h-7 w-7 p-0 text-stone-400 hover:text-stone-200"
                                 data-testid={`button-character-menu-${char.id}`}
                               >
                                 <MoreVertical className="h-4 w-4" />
                               </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end" className="bg-stone-900 border-stone-700">
                               {onViewCharacter && (
                                 <DropdownMenuItem
                                   onClick={() => onViewCharacter(char)}
                                   className="text-amber-200 focus:bg-amber-900/30 focus:text-amber-200"
                                   data-testid={`button-view-character-${char.id}`}
                                 >
                                   <User className="h-4 w-4 mr-2" />
                                   View Sheet
                                 </DropdownMenuItem>
                               )}
                               {onAssignCharacter && (role === 'gm' || myPermissions?.permissions?.[char.id] === 'edit' || myPermissions?.permissions?.[char.id] === 'owner') && (
                                 <DropdownMenuItem
                                   onClick={() => onAssignCharacter(char)}
                                   className="text-green-200 focus:bg-green-900/30 focus:text-green-200"
                                   data-testid={`button-assign-character-${char.id}`}
                                 >
                                   <UserCheck className="h-4 w-4 mr-2" />
                                   Assign Character
                                 </DropdownMenuItem>
                               )}
                               {role === 'gm' && (
                                 <DropdownMenuItem
                                   onClick={() => {
                                     setSelectedCharForAccess(char);
                                     setShowAccessDialog(true);
                                   }}
                                   className="text-purple-200 focus:bg-purple-900/30 focus:text-purple-200"
                                   data-testid={`button-manage-access-${char.id}`}
                                 >
                                   <Shield className="h-4 w-4 mr-2" />
                                   Manage Access
                                 </DropdownMenuItem>
                               )}
                               {role === 'gm' && (
                                 <>
                                   <DropdownMenuSeparator className="bg-stone-700" />
                                   <DropdownMenuItem
                                     onClick={() => handleDeleteCharacter(char)}
                                     disabled={deleteCharacterMutation.isPending}
                                     className="text-red-400 focus:bg-red-900/30 focus:text-red-400"
                                     data-testid={`button-delete-character-${char.id}`}
                                   >
                                     <Trash2 className="h-4 w-4 mr-2" />
                                     Delete
                                   </DropdownMenuItem>
                                 </>
                               )}
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </div>
                       ))
                     ) : (
                       <div className="p-4 text-center text-stone-500 text-sm">
                         {characters && characters.length > 0 ? 'All characters are in folders' : 'No characters yet'}
                       </div>
                     )}
                   </div>
                 </div>
               </div>
            </TabsContent>
          </Tabs>

          {/* GM Only Section */}
          {role === 'gm' && (
            <div className="mt-8 border-t border-stone-800 pt-6">
              <h3 className="text-sm font-bold text-purple-400 uppercase mb-4">GM Tools</h3>
              
              {inspectedChar && (
                <div className="mb-4 p-3 bg-purple-900/10 border border-purple-900/30 rounded">
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-sm font-bold text-purple-200">Inspecting: {inspectedChar.name}</span>
                     <Button size="sm" variant="ghost" onClick={() => onInspectChar && onInspectChar(null)} className="h-6 w-6 p-0 hover:bg-purple-900/50">
                       <LogOut className="h-3 w-3" />
                     </Button>
                   </div>
                   <div className="text-xs text-stone-400">
                     Inventory: {inspectedChar.inventory.join(", ") || "Empty"}
                   </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                <Button 
                  variant="secondary" 
                  className="bg-amber-800 hover:bg-amber-700" 
                  onClick={() => setShowLevelUpDialog(true)}
                  data-testid="button-level-up-all"
                >
                  <TrendingUp className="mr-2 h-4 w-4" /> Level Up All
                </Button>
              </div>

              {/* Banned Players Section */}
              {bannedPlayers && bannedPlayers.length > 0 && (
                <div className="mt-6 p-4 bg-red-950/20 border border-red-900/30 rounded-lg">
                  <h4 className="text-sm font-bold text-red-400 uppercase mb-3 flex items-center gap-2">
                    <Ban className="h-4 w-4" /> Banned Players
                  </h4>
                  <div className="space-y-2">
                    {bannedPlayers.map((ban: any) => (
                      <div 
                        key={ban.id}
                        className="flex items-center justify-between p-2 bg-stone-900/50 rounded border border-stone-800"
                        data-testid={`banned-player-${ban.userId}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-stone-200 truncate">{ban.username}</div>
                          {ban.reason && (
                            <div className="text-xs text-stone-500 truncate">Reason: {ban.reason}</div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnban(ban)}
                          disabled={unbanMutation.isPending}
                          className="bg-green-900/30 hover:bg-green-800/50 border-green-700 text-green-200 text-xs ml-2"
                          data-testid={`button-unban-${ban.userId}`}
                        >
                          Unban
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-stone-800">
            <Button variant="destructive" className="w-full bg-red-950/30 text-red-400 hover:bg-red-900/50 border border-red-900/50">
              <LogOut className="mr-2 h-4 w-4" /> Leave Campaign
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Add Character Dialog */}
      {onAddCharacter && (
        <AddCharacterDialog 
          open={addCharacterOpen}
          onOpenChange={setAddCharacterOpen}
          onAddCharacter={onAddCharacter}
          campaignId={campaignId}
        />
      )}

      {/* Add Token Dialog - Character Selection for GM */}
      <Dialog open={addTokenDialogOpen} onOpenChange={setAddTokenDialogOpen}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-200 max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-500 font-display text-xl">Add Token to Battlemap</DialogTitle>
            <DialogDescription className="text-stone-400">
              Select a character to place on the battlemap
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            {characters && characters.length > 0 ? (
              <>
                {/* Folder Sections */}
                {folders.map((folder: any) => {
                  const folderCharacters = getCharactersInFolder(folder.id);
                  const isExpanded = expandedFolders.has(folder.id);
                  
                  if (folderCharacters.length === 0) return null;
                  
                  return (
                    <div
                      key={folder.id}
                      className="bg-stone-900 rounded-lg border border-stone-800"
                      data-testid={`token-folder-section-${folder.id}`}
                    >
                      {/* Folder Header */}
                      <div
                        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-stone-800/50 rounded-t-lg"
                        onClick={() => toggleFolder(folder.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-stone-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-stone-400 shrink-0" />
                        )}
                        <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="font-medium text-stone-200 truncate flex-1">{folder.name}</span>
                        <Badge variant="secondary" className="bg-stone-700 text-stone-300 text-xs shrink-0">
                          {folderCharacters.length}
                        </Badge>
                      </div>
                      
                      {/* Folder Characters */}
                      {isExpanded && (
                        <div className="border-t border-stone-800">
                          {folderCharacters.map((char: any) => (
                            <div
                              key={char.id}
                              className="flex items-center gap-3 p-3 hover:bg-stone-800/50 cursor-pointer transition-colors border-b border-stone-800 last:border-b-0"
                              onClick={() => {
                                if (onAddCharacterToken) {
                                  onAddCharacterToken(char);
                                }
                                setAddTokenDialogOpen(false);
                              }}
                              data-testid={`select-character-token-${char.id}`}
                            >
                              {/* Character Portrait */}
                              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-stone-700 flex-shrink-0">
                                {char.portrait ? (
                                  <img src={char.portrait} alt={char.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-stone-800 flex items-center justify-center">
                                    <Users className="h-5 w-5 text-stone-600" />
                                  </div>
                                )}
                              </div>
                              
                              {/* Character Info */}
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-stone-100 truncate">{char.name}</div>
                                <div className="text-xs text-stone-400">
                                  {char.race} {char.class} • Level {char.level || 1}
                                </div>
                              </div>
                              
                              {/* HP Display */}
                              <div className="text-right flex-shrink-0">
                                <div className="text-sm font-bold text-red-400">
                                  {char.currentHp ?? char.hp ?? char.maxHp ?? 10}/{char.maxHp ?? 10}
                                </div>
                                <div className="text-xs text-stone-500">HP</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Unfiled Characters Section */}
                {unfiledCharacters.length > 0 && (
                  <div
                    className="bg-stone-900 rounded-lg border border-stone-800"
                    data-testid="token-unfiled-characters-section"
                  >
                    {/* Only show header if there are folders */}
                    {folders.length > 0 && (
                      <div className="flex items-center gap-2 p-3 text-stone-400 border-b border-stone-800">
                        <FolderOpen className="h-4 w-4" />
                        <span className="font-medium">Unfiled</span>
                        <Badge variant="secondary" className="bg-stone-700 text-stone-300 text-xs">
                          {unfiledCharacters.length}
                        </Badge>
                      </div>
                    )}
                    
                    {unfiledCharacters.map((char: any) => (
                      <div
                        key={char.id}
                        className="flex items-center gap-3 p-3 hover:bg-stone-800/50 cursor-pointer transition-colors border-b border-stone-800 last:border-b-0"
                        onClick={() => {
                          if (onAddCharacterToken) {
                            onAddCharacterToken(char);
                          }
                          setAddTokenDialogOpen(false);
                        }}
                        data-testid={`select-character-token-${char.id}`}
                      >
                        {/* Character Portrait */}
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-stone-700 flex-shrink-0">
                          {char.portrait ? (
                            <img src={char.portrait} alt={char.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-stone-800 flex items-center justify-center">
                              <Users className="h-5 w-5 text-stone-600" />
                            </div>
                          )}
                        </div>
                        
                        {/* Character Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-stone-100 truncate">{char.name}</div>
                          <div className="text-xs text-stone-400">
                            {char.race} {char.class} • Level {char.level || 1}
                          </div>
                        </div>
                        
                        {/* HP Display */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-bold text-red-400">
                            {char.currentHp ?? char.hp ?? char.maxHp ?? 10}/{char.maxHp ?? 10}
                          </div>
                          <div className="text-xs text-stone-500">HP</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-stone-500">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No characters in this campaign</p>
                <p className="text-xs mt-1">Create characters first to add them as tokens</p>
              </div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-stone-800">
            <Button
              variant="outline"
              className="w-full bg-stone-800 border-stone-700 hover:bg-stone-700"
              onClick={() => setAddTokenDialogOpen(false)}
              data-testid="button-cancel-add-token"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Level Up All Dialog */}
      <Dialog open={showLevelUpDialog} onOpenChange={setShowLevelUpDialog}>
        <DialogContent className="bg-stone-900 border-stone-700">
          <DialogHeader>
            <DialogTitle className="text-amber-500">Level Up All Characters</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button 
                variant={levelUpMode === 'add' ? 'default' : 'outline'}
                onClick={() => setLevelUpMode('add')}
                className="flex-1"
                data-testid="button-level-mode-add"
              >
                Add +1 Level
              </Button>
              <Button 
                variant={levelUpMode === 'set' ? 'default' : 'outline'}
                onClick={() => setLevelUpMode('set')}
                className="flex-1"
                data-testid="button-level-mode-set"
              >
                Set Level
              </Button>
            </div>
            {levelUpMode === 'set' && (
              <Select value={targetLevel.toString()} onValueChange={(v) => setTargetLevel(parseInt(v))}>
                <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-target-level">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(level => (
                    <SelectItem key={level} value={level.toString()}>Level {level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLevelUpDialog(false)} data-testid="button-cancel-level-up">Cancel</Button>
            <Button onClick={() => {
              onLevelUpAll?.(levelUpMode, levelUpMode === 'set' ? targetLevel : undefined);
              setShowLevelUpDialog(false);
            }} data-testid="button-apply-level-up">
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Access Management Dialog */}
      <Dialog open={showAccessDialog} onOpenChange={setShowAccessDialog}>
        <DialogContent className="bg-stone-900 border-stone-700">
          <DialogHeader>
            <DialogTitle className="text-amber-500">
              Manage Access: {selectedCharForAccess?.name}
            </DialogTitle>
          </DialogHeader>
          
          {/* Quick Actions - All Players */}
          <div className="flex items-center justify-between p-3 bg-stone-800/50 rounded-lg border border-stone-700 mt-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-amber-400" />
              <span className="text-stone-200 font-medium">All Players</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-stone-700 border-stone-600 hover:bg-stone-600" data-testid="button-all-players-access">
                  Set Access <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-stone-800 border-stone-700">
                <DropdownMenuItem 
                  onClick={async () => {
                    if (!selectedCharForAccess) return;
                    try {
                      const result = await api.setCharacterPermissionForAllPlayers(selectedCharForAccess.id, 'none');
                      toast({ title: "Access Updated", description: `Removed access for ${result.updated} players` });
                      const permissions = await api.getCharacterPermissions(selectedCharForAccess.id);
                      const levels: Record<string, string> = {};
                      permissions.forEach((p: any) => { levels[p.userId] = p.accessLevel; });
                      setAccessLevels(levels);
                    } catch (err) {
                      toast({ title: "Error", description: "Failed to update permissions", variant: "destructive" });
                    }
                  }}
                  className="text-stone-200 focus:bg-stone-700"
                  data-testid="button-all-players-none"
                >
                  None (No access)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={async () => {
                    if (!selectedCharForAccess) return;
                    try {
                      const result = await api.setCharacterPermissionForAllPlayers(selectedCharForAccess.id, 'name');
                      toast({ title: "Access Updated", description: `Set Name (token name only) for ${result.updated} players` });
                      const permissions = await api.getCharacterPermissions(selectedCharForAccess.id);
                      const levels: Record<string, string> = {};
                      permissions.forEach((p: any) => { levels[p.userId] = p.accessLevel; });
                      setAccessLevels(levels);
                    } catch (err) {
                      toast({ title: "Error", description: "Failed to update permissions", variant: "destructive" });
                    }
                  }}
                  className="text-stone-200 focus:bg-stone-700"
                  data-testid="button-all-players-name"
                >
                  Name (Token name only)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={async () => {
                    if (!selectedCharForAccess) return;
                    try {
                      const result = await api.setCharacterPermissionForAllPlayers(selectedCharForAccess.id, 'view');
                      toast({ title: "Access Updated", description: `Set View (full stats) for ${result.updated} players` });
                      const permissions = await api.getCharacterPermissions(selectedCharForAccess.id);
                      const levels: Record<string, string> = {};
                      permissions.forEach((p: any) => { levels[p.userId] = p.accessLevel; });
                      setAccessLevels(levels);
                    } catch (err) {
                      toast({ title: "Error", description: "Failed to update permissions", variant: "destructive" });
                    }
                  }}
                  className="text-stone-200 focus:bg-stone-700"
                  data-testid="button-all-players-view"
                >
                  View (Full stats)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={async () => {
                    if (!selectedCharForAccess) return;
                    try {
                      const result = await api.setCharacterPermissionForAllPlayers(selectedCharForAccess.id, 'edit');
                      toast({ title: "Access Updated", description: `Set Edit (can edit) for ${result.updated} players` });
                      const permissions = await api.getCharacterPermissions(selectedCharForAccess.id);
                      const levels: Record<string, string> = {};
                      permissions.forEach((p: any) => { levels[p.userId] = p.accessLevel; });
                      setAccessLevels(levels);
                    } catch (err) {
                      toast({ title: "Error", description: "Failed to update permissions", variant: "destructive" });
                    }
                  }}
                  className="text-stone-200 focus:bg-stone-700"
                  data-testid="button-all-players-edit"
                >
                  Edit (Can edit)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Access level legend */}
          <div className="text-xs text-stone-500 px-1 mt-1">
            <span className="font-medium">Levels:</span> None → Name (token name only) → View (full stats) → Edit (can edit)
          </div>
          
          {/* Individual Player Access */}
          <div className="space-y-3 mt-2">
            {loadingAccess ? (
              <div className="text-center py-4 text-stone-400">Loading...</div>
            ) : members?.filter((m: any) => m.role !== 'gm').length === 0 ? (
              <div className="text-center py-4 text-stone-400">No players in this campaign</div>
            ) : (
              members?.filter((m: any) => m.role !== 'gm').map((member: any) => {
                const isOwner = member.userId === selectedCharForAccess?.userId;
                return (
                  <div key={member.id} className="flex items-center justify-between p-2 bg-stone-800 rounded" data-testid={`access-row-${member.userId}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-stone-200">@{member.username}</span>
                      {isOwner && <Badge className="bg-amber-600 text-xs">Owner</Badge>}
                    </div>
                    <Select
                      value={isOwner ? "edit" : (accessLevels[member.userId] || "none")}
                      onValueChange={(val) => handleSetAccess(member.userId, val)}
                      disabled={isOwner}
                    >
                      <SelectTrigger className="w-24 bg-stone-700 border-stone-600" data-testid={`select-access-${member.userId}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="view">View</SelectItem>
                        <SelectItem value="edit">Edit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Character Confirmation Dialog */}
      <AlertDialog open={!!pendingDeleteChar} onOpenChange={(open) => !open && setPendingDeleteChar(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Character
            </AlertDialogTitle>
            <AlertDialogDescription className="text-stone-300">
              Are you sure you want to delete <span className="font-bold text-amber-400">"{pendingDeleteChar?.name}"</span>? 
              This will permanently remove the character along with all their items, spells, hotbars, and tokens from the battlemap.
              <span className="block mt-2 text-red-400 font-medium">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="bg-stone-800 border-stone-700 hover:bg-stone-700"
              data-testid="button-cancel-delete-character"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmDeleteCharacter}
              disabled={deleteCharacterMutation.isPending}
              data-testid="button-confirm-delete-character"
            >
              {deleteCharacterMutation.isPending ? "Deleting..." : "Delete Character"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Character Template Library Dialog */}
      <Dialog open={showTemplateLibrary} onOpenChange={(open) => {
        setShowTemplateLibrary(open);
        if (!open) setTemplateSearchQuery('');
      }}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-teal-400 flex items-center gap-2">
              <Library className="h-5 w-5" />
              Character Template Library
            </DialogTitle>
            <DialogDescription className="text-stone-400">
              Select a character template to add to your campaign
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-stone-500" />
              <Input
                placeholder="Search templates..."
                value={templateSearchQuery}
                onChange={(e) => setTemplateSearchQuery(e.target.value)}
                className="pl-10 bg-stone-800 border-stone-700 text-stone-200"
                data-testid="input-template-search"
              />
            </div>
            
            <ScrollArea className="h-[400px] pr-4">
              {characterTemplates.length === 0 ? (
                <div className="text-center py-8 text-stone-500">
                  No character templates available
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {characterTemplates
                    .filter((template: any) => 
                      !templateSearchQuery || 
                      template.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                      template.race?.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                      template.class?.toLowerCase().includes(templateSearchQuery.toLowerCase())
                    )
                    .map((template: any) => (
                      <div
                        key={template.id}
                        onClick={() => copyTemplateMutation.mutate(template.id)}
                        className="relative bg-stone-800 border border-stone-700 rounded-lg p-3 cursor-pointer hover:border-teal-500 hover:bg-stone-750 transition-colors group"
                        data-testid={`template-card-${template.id}`}
                      >
                        <div className="flex flex-col items-center text-center space-y-2">
                          <div className="w-16 h-16 rounded-full overflow-hidden bg-stone-700 border-2 border-stone-600 group-hover:border-teal-500">
                            {template.portrait ? (
                              <img 
                                src={template.portrait} 
                                alt={template.name} 
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <User className="h-8 w-8 text-stone-500" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-stone-200 text-sm truncate max-w-[120px]">
                              {template.name}
                            </div>
                            <div className="text-xs text-stone-400">
                              Level {template.level || 1} {template.race || 'Unknown'}
                            </div>
                            {template.class && (
                              <div className="text-xs text-teal-400">{template.class}</div>
                            )}
                          </div>
                        </div>
                        {copyTemplateMutation.isPending && copyTemplateMutation.variables === template.id && (
                          <div className="absolute inset-0 bg-stone-900/80 rounded-lg flex items-center justify-center">
                            <div className="text-teal-400 text-sm">Adding...</div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </ScrollArea>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTemplateLibrary(false)}
              className="border-stone-600 text-stone-300 hover:bg-stone-800"
              data-testid="button-close-template-library"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Character from Campaign Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-stone-950 border-stone-800 text-stone-200 max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-500 font-display text-xl">Import from Campaign</DialogTitle>
            <DialogDescription className="text-stone-400">
              Import a character from another campaign you manage
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {loadingImportable ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
              </div>
            ) : importableData.length === 0 ? (
              <div className="text-center py-8 text-stone-500">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No characters available to import</p>
                <p className="text-xs mt-1">You need to be a GM in other campaigns with characters</p>
              </div>
            ) : (
              importableData.map((group: { campaign: any; characters: any[] }) => (
                <div key={group.campaign.id} className="border border-stone-800 rounded-lg overflow-hidden">
                  <div className="bg-stone-900 px-3 py-2 font-semibold text-stone-300 text-sm">
                    {group.campaign.name}
                  </div>
                  <div className="divide-y divide-stone-800">
                    {group.characters.map((char: any) => (
                      <div
                        key={char.id}
                        className="flex items-center gap-3 p-3 hover:bg-stone-900/50 cursor-pointer transition-colors"
                        onClick={() => importCharacterMutation.mutate(char.id)}
                        data-testid={`import-character-${char.id}`}
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-stone-700 flex-shrink-0">
                          {char.portrait ? (
                            <img src={char.portrait} alt={char.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-stone-800 flex items-center justify-center">
                              <User className="h-5 w-5 text-stone-600" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-stone-100 truncate">{char.name}</div>
                          <div className="text-xs text-stone-400">{char.race} • Lv {char.level || 1}</div>
                        </div>
                        {importCharacterMutation.isPending && importCharacterMutation.variables === char.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 6a. Hotbars Tab Content Component
interface HotbarsTabContentProps {
  character: any;
  isGM: boolean;
  isOwner: boolean;
}

// Type guard for items with weapon fields
interface ItemWithWeaponFields {
  id: string;
  name: string;
  itemType: string;
  weight?: string;
  damage?: string;
  quantity?: number;
  ammunitionType?: string;
  weaponCategory?: string;
  imageData?: string;
}

function HotbarsTabContent({ character, isGM, isOwner }: HotbarsTabContentProps) {
  const queryClient = useQueryClient();
  const canEdit = isOwner || isGM;
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearHotbarType, setClearHotbarType] = useState<string>('');
  const [pendingHeavyWeaponEquip, setPendingHeavyWeaponEquip] = useState(false);
  
  // Mobile tap-to-equip state
  const [equipPickerOpen, setEquipPickerOpen] = useState(false);
  const [equipPickerData, setEquipPickerData] = useState<{
    hotbarType: 'weapons' | 'magic' | 'skills' | 'consumables' | 'utility' | 'armor';
    payload: any;
    itemName: string;
  } | null>(null);

  const { data: hotbars = [], isLoading } = useQuery({
    queryKey: ['hotbars', character.id],
    queryFn: () => api.getHotbars(character.id),
    enabled: !!character.id
  });

  const { data: items = [] } = useQuery({
    queryKey: ['items', character.id],
    queryFn: () => api.getItems(character.id),
    enabled: !!character.id
  });

  const { data: spells = [] } = useQuery({
    queryKey: ['spells', character.id],
    queryFn: () => api.getSpells(character.id),
    enabled: !!character.id
  });

  const { data: characterTraits = [] } = useQuery({
    queryKey: ['character-traits', character.id],
    queryFn: () => api.getCharacterTraits(character.id),
    enabled: !!character.id
  });

  const { data: characterCustomSkills = [] } = useQuery({
    queryKey: ['character-custom-skills', character.id],
    queryFn: () => api.getCharacterCustomSkills(character.id),
    enabled: !!character.id
  });

  const weaponItems = items.filter((item: any) => item.itemType === 'weapon');
  const ammunitionItems = items.filter((item: any) => item.itemType === 'ammunition');
  const consumableItems = items.filter((item: any) => item.itemType === 'consumable');
  const utilityItems = items.filter((item: any) => item.itemType === 'utility' || item.itemType === 'container');
  const armorItems = items.filter((item: any) => item.itemType === 'armor');

  // Helper: Map weapon category to compatible ammunition type
  // Thrown and melee weapons don't use ammunition from the ammo slot
  const getCompatibleAmmoType = (weaponCategory: string): string | null => {
    const mapping: Record<string, string> = {
      bow: 'arrow',
      crossbow: 'bolt',
      sling: 'stone',
      firearm: 'bullet',
    };
    return mapping[weaponCategory] || null;
  };

  // Check if weapon category requires ammunition
  const requiresAmmunition = (weaponCategory: string): boolean => {
    return ['bow', 'crossbow', 'sling', 'firearm'].includes(weaponCategory);
  };

  // Get weapon in slot 0 to check for heavy weapon blocking
  const getWeaponSlot0 = () => {
    const slot0Hotbar = hotbars.find((h: any) => h.hotbarType === 'weapons' && h.slotNumber === 0);
    if (!slot0Hotbar?.itemId) return null;
    return items.find((i: any) => i.id === slot0Hotbar.itemId);
  };

  // Get primary ranged weapon (prefer slot 0, else slot 1)
  const getPrimaryRangedWeapon = () => {
    const slot0 = getWeaponSlot0();
    if (slot0?.weaponCategory && slot0.weaponCategory !== 'melee') return slot0;
    
    const slot1Hotbar = hotbars.find((h: any) => h.hotbarType === 'weapons' && h.slotNumber === 1);
    if (!slot1Hotbar?.itemId) return null;
    const slot1Weapon = items.find((i: any) => i.id === slot1Hotbar.itemId);
    if (slot1Weapon?.weaponCategory && slot1Weapon.weaponCategory !== 'melee') return slot1Weapon;
    
    return null;
  };

  // Check if a heavy weapon is equipped (item in slot 0 that is marked as heavy)
  const isHeavyWeaponEquipped = () => {
    const slot0Hotbar = hotbars.find((h: any) => h.hotbarType === 'weapons' && h.slotNumber === 0);
    if (!slot0Hotbar?.itemId) return false;
    const slot0Item = items.find((i: any) => i.id === slot0Hotbar.itemId);
    return slot0Item?.isHeavy || slot0Item?.weight === 'heavy';
  };

  // Include pendingHeavyWeaponEquip to block slot 1 during mutation
  const heavyEquipped = isHeavyWeaponEquipped() || pendingHeavyWeaponEquip;
  const primaryRangedWeapon = getPrimaryRangedWeapon();
  const compatibleAmmoType = primaryRangedWeapon?.weaponCategory ? getCompatibleAmmoType(primaryRangedWeapon.weaponCategory) : null;

  const upsertMutation = useMutation({
    mutationFn: (data: { hotbarType: string; slotNumber: number; itemId?: string; spellId?: string; skillName?: string; traitId?: string }) =>
      api.upsertHotbar(character.id, data),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ['hotbars', character.id] });
      const previousHotbars = queryClient.getQueryData(['hotbars', character.id]);
      
      queryClient.setQueryData(['hotbars', character.id], (old: any[] = []) => {
        const existing = old.findIndex((h: any) => 
          h.hotbarType === newData.hotbarType && h.slotNumber === newData.slotNumber
        );
        if (existing >= 0) {
          const updated = [...old];
          updated[existing] = { ...updated[existing], ...newData, id: updated[existing].id };
          return updated;
        }
        return [...old, { ...newData, id: `temp-${Date.now()}`, characterId: character.id }];
      });
      
      return { previousHotbars };
    },
    onError: (error: any, _newData, context) => {
      if (context?.previousHotbars) {
        queryClient.setQueryData(['hotbars', character.id], context.previousHotbars);
      }
      console.error('Hotbar upsert failed:', error);
      toast({
        title: "Equip Failed",
        description: error?.message || "Failed to save hotbar",
        variant: "destructive"
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteHotbar(id),
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['hotbars', character.id] });
      const previousHotbars = queryClient.getQueryData(['hotbars', character.id]);
      
      queryClient.setQueryData(['hotbars', character.id], (old: any[] = []) => 
        old.filter((h: any) => h.id !== deletedId)
      );
      
      return { previousHotbars };
    },
    onError: (error: any, _deletedId, context) => {
      if (context?.previousHotbars) {
        queryClient.setQueryData(['hotbars', character.id], context.previousHotbars);
      }
      console.error('Hotbar delete failed:', error);
      toast({
        title: "Remove Failed",
        description: error?.message || "Failed to remove from hotbar",
        variant: "destructive"
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
    }
  });

  const handleDrop = async (hotbarType: string, slotNumber: number, data: any) => {
    if (!canEdit) return;

    // Handle spell drops
    if (data.type === 'spell') {
      try {
        // Add spell to hotbar first
        await upsertMutation.mutateAsync({
          hotbarType,
          slotNumber,
          spellId: data.id
        });

        // Update spell's isEquipped flag (non-blocking - flag is for UI only)
        try {
          await api.updateSpell(data.id, { isEquipped: true });
        } catch (flagErr) {
          // Silently ignore - the spell is already equipped in the hotbar
          console.log('isEquipped flag update skipped:', flagErr);
        }
        queryClient.invalidateQueries({ queryKey: ['spells', character.id] });

        toast({
          title: "Spell Equipped",
          description: `${data.name} equipped to magic hotbar`,
        });
      } catch (err) {
        toast({
          title: "Equip Failed",
          description: "Failed to equip spell",
          variant: "destructive"
        });
      }
      return;
    }

    // Handle skill drops
    if (data.type === 'skill') {
      upsertMutation.mutate({
        hotbarType,
        slotNumber,
        skillName: data.skillName
      });
      return;
    }

    // Handle trait drops
    if (data.type === 'trait') {
      upsertMutation.mutate({
        hotbarType,
        slotNumber,
        traitId: data.traitId
      });
      return;
    }

    // Handle item drops
    if (data.type === 'item') {
      const item = data.item;
      
      // Validate item type matches hotbar type (allow ammunition as weapon type)
      const validTypeMapping: Record<string, string[]> = {
        weapons: ['weapon'],
        consumables: ['consumable'],
        utility: ['utility', 'container'],
        armor: ['armor']
      };
      
      // Special handling for armor hotbar - enforce matching slot
      if (hotbarType === 'armor') {
        if (item.itemType !== 'armor') {
          toast({
            title: "Invalid Item Type",
            description: "Only armor can be equipped in armor slots",
            variant: "destructive"
          });
          return;
        }
        
        // Map slot numbers to armor slot names
        const slotToArmorType: Record<number, string> = {
          0: 'helm',
          1: 'chest',
          2: 'arm',
          3: 'legs',
          4: 'boots'
        };
        
        const requiredSlot = slotToArmorType[slotNumber];
        if (item.armorSlot !== requiredSlot) {
          const slotLabels: Record<string, string> = { helm: 'Helm', chest: 'Chest', arm: 'Arm', legs: 'Legs', boots: 'Boots' };
          toast({
            title: "Wrong Armor Slot",
            description: `${item.name} is ${slotLabels[item.armorSlot] || 'Unknown'} armor - it can only go in the ${slotLabels[requiredSlot]} slot`,
            variant: "destructive"
          });
          return;
        }
      }
      
      // Special handling for weapons hotbar
      if (hotbarType === 'weapons') {
        // Slot 2 is reserved for ammunition only
        if (slotNumber === 2) {
          if (item.itemType !== 'ammunition') {
            toast({
              title: "Ammunition Only",
              description: "The ammo slot only accepts ammunition items",
              variant: "destructive"
            });
            return;
          }
          // Check compatibility with equipped ranged weapon (only if weapon requires ammo)
          const rangedWeapon = getPrimaryRangedWeapon();
          if (rangedWeapon?.weaponCategory && requiresAmmunition(rangedWeapon.weaponCategory)) {
            const requiredAmmoType = getCompatibleAmmoType(rangedWeapon.weaponCategory);
            if (requiredAmmoType && item.ammunitionType !== requiredAmmoType) {
              toast({
                title: "Incompatible Ammunition",
                description: `Your ${rangedWeapon.name} requires ${requiredAmmoType}s, but this is ${item.ammunitionType || 'unknown type'}`,
                variant: "destructive"
              });
              return;
            }
          }
          // If no ranged weapon or weapon doesn't require ammo, allow any ammunition type
        } else {
          // Slots 0 and 1 are for weapons, not ammunition
          if (item.itemType === 'ammunition') {
            toast({
              title: "Wrong Slot",
              description: "Ammunition goes in the Ammo slot (far-right)",
              variant: "destructive"
            });
            return;
          }
          // Check if it's a valid weapon
          if (item.itemType !== 'weapon') {
            toast({
              title: "Invalid Item Type",
              description: `Only weapons can be equipped in weapon slots`,
              variant: "destructive"
            });
            return;
          }
        }
      } else if (hotbarType in validTypeMapping && !validTypeMapping[hotbarType].includes(item.itemType)) {
        toast({
          title: "Invalid Item Type",
          description: `${item.itemType} items cannot be equipped to ${hotbarType} hotbar`,
          variant: "destructive"
        });
        return;
      }

      // Block slot 1 (Right hand) if heavy weapon is equipped or being equipped
      if (hotbarType === 'weapons' && slotNumber === 1 && heavyEquipped) {
        toast({
          title: "Slot Blocked",
          description: "Two-handed weapon is equipped - this slot is blocked",
          variant: "destructive"
        });
        return;
      }

      // For weapons hotbar slots 0 and 1, check if heavy weapon is already equipped
      if (hotbarType === 'weapons' && (slotNumber === 0 || slotNumber === 1)) {
        // Check if the item in slot 0 is a heavy weapon
        if (heavyEquipped) {
          toast({
            title: "Heavy Weapon Equipped",
            description: "Remove the heavy weapon first before equipping another weapon",
            variant: "destructive"
          });
          return;
        }
      }

      // Two-handed weapon logic - occupy slot 0 only, slot 1 becomes blocked
      // Check both isHeavy (new) and weight === 'heavy' (legacy) for backward compatibility
      if (hotbarType === 'weapons' && (item.isHeavy || item.weight === 'heavy')) {
        // Heavy weapons can only go in slot 0 (left hand), blocks slot 1
        if (slotNumber === 2) {
          toast({
            title: "Invalid Slot",
            description: "Heavy weapons cannot be equipped in the ammunition slot",
            variant: "destructive"
          });
          return;
        }
        
        if (slotNumber === 1) {
          toast({
            title: "Invalid Slot",
            description: "Heavy weapons can only be equipped in the left hand slot",
            variant: "destructive"
          });
          return;
        }

        // Set pending state immediately to block slots during mutation
        setPendingHeavyWeaponEquip(true);

        // Execute heavy weapon equip with proper cleanup
        const executeHeavyEquip = async () => {
          try {
            // Clear any existing weapons in slots 0 and 1 only (preserve slot 2 for ammunition)
            const existingSlot0 = hotbars.find(h => h.hotbarType === 'weapons' && h.slotNumber === 0);
            const existingSlot1 = hotbars.find(h => h.hotbarType === 'weapons' && h.slotNumber === 1);
            
            if (existingSlot0) await deleteMutation.mutateAsync(existingSlot0.id);
            if (existingSlot1) await deleteMutation.mutateAsync(existingSlot1.id);

            // Equip heavy weapon to slot 0 only (slot 1 will be blocked visually)
            await upsertMutation.mutateAsync({
              hotbarType: 'weapons',
              slotNumber: 0,
              itemId: item.id
            });
            
            toast({
              title: "Heavy Weapon Equipped",
              description: `${item.name} equipped (two-handed)`,
            });
          } catch (err) {
            toast({
              title: "Equip Failed",
              description: "Failed to equip heavy weapon",
              variant: "destructive"
            });
          } finally {
            // Always clear pending state
            setPendingHeavyWeaponEquip(false);
          }
        };

        executeHeavyEquip();
        return;
      }

      // Slot 2 in weapons hotbar is for ammunition only
      if (hotbarType === 'weapons' && slotNumber === 2 && item.itemType !== 'ammunition') {
        toast({
          title: "Invalid Slot",
          description: "Only ammunition can be equipped in the third slot",
          variant: "destructive"
        });
        return;
      }

      // Standard item equip
      try {
        await upsertMutation.mutateAsync({
          hotbarType,
          slotNumber,
          itemId: item.id
        });
        
        toast({
          title: "Item Equipped",
          description: `${item.name} equipped to hotbar`,
        });
      } catch (err) {
        toast({
          title: "Equip Failed",
          description: "Failed to equip item",
          variant: "destructive"
        });
      }
    }
  };

  const handleRemove = async (hotbarId: string) => {
    if (!canEdit) return;
    
    // Find the hotbar to get spell/item info before deleting
    const hotbar = hotbars.find(h => h.id === hotbarId);
    
    // If it's a spell, clear the isEquipped flag
    if (hotbar?.spellId) {
      try {
        await api.updateSpell(hotbar.spellId, { isEquipped: false });
        queryClient.invalidateQueries({ queryKey: ['spells', character.id] });
      } catch (err) {
        console.error('Failed to update spell isEquipped flag:', err);
      }
    }
    
    deleteMutation.mutate(hotbarId);
  };

  const handleClearAll = async (hotbarType: string) => {
    if (!canEdit) return;
    const hotbarsToDelete = hotbars.filter(h => h.hotbarType === hotbarType);
    await Promise.all(hotbarsToDelete.map(h => deleteMutation.mutateAsync(h.id)));
    setClearDialogOpen(false);
  };

  const getHotbarsByType = (type: string) => {
    return hotbars.filter(h => h.hotbarType === type);
  };

  const getHotbarForSlot = (type: string, slotNumber: number) => {
    return hotbars.find(h => h.hotbarType === type && h.slotNumber === slotNumber);
  };

  const handleDragStart = (e: React.DragEvent, data: any) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Handler for tap-to-equip on mobile/touch devices
  const openEquipPicker = (
    hotbarType: 'weapons' | 'magic' | 'skills' | 'consumables' | 'utility' | 'armor',
    payload: any,
    itemName: string
  ) => {
    if (!canEdit) return;
    setEquipPickerData({ hotbarType, payload, itemName });
    setEquipPickerOpen(true);
  };

  // Helper to get slot display name
  const getSlotLabel = (hotbarType: string, slotNum: number): string => {
    if (hotbarType === 'weapons') {
      return slotNum === 0 ? 'Left Hand' : slotNum === 1 ? 'Right Hand' : 'Ammunition';
    }
    if (hotbarType === 'armor') {
      const armorSlotLabels = ['Helm', 'Chest', 'Arm', 'Legs', 'Boots'];
      return armorSlotLabels[slotNum] || `Slot ${slotNum + 1}`;
    }
    return `Slot ${slotNum + 1}`;
  };

  // Helper to get max slots for hotbar type
  const getMaxSlots = (hotbarType: string): number => {
    if (hotbarType === 'weapons') return 3;
    if (hotbarType === 'armor') return 5;
    return 5;
  };

  // Equip to selected slot from picker dialog
  const handlePickerEquip = (slotNumber: number) => {
    if (!equipPickerData) return;
    handleDrop(equipPickerData.hotbarType, slotNumber, equipPickerData.payload);
    setEquipPickerOpen(false);
    setEquipPickerData(null);
  };

  const skillsList = [
    { key: 'skillAgility', name: 'Agility', category: 'Physical', attr: 'FIN' },
    { key: 'skillStrength', name: 'Strength', category: 'Physical', attr: 'MIG' },
    { key: 'skillStealth', name: 'Stealth', category: 'Physical', attr: 'FIN' },
    { key: 'skillSleightOfHand', name: 'Sleight of Hand', category: 'Physical', attr: 'FIN' },
    { key: 'skillArcana', name: 'Arcana', category: 'Mental', attr: 'WIT' },
    { key: 'skillConcentration', name: 'Concentration', category: 'Mental', attr: 'WIL' },
    { key: 'skillWisdom', name: 'Wisdom', category: 'Mental', attr: 'WIT' },
    { key: 'skillInvestigation', name: 'Investigation', category: 'Mental', attr: 'WIT' },
    { key: 'skillPerception', name: 'Perception', category: 'Mental', attr: 'WIT' },
    { key: 'skillMedicine', name: 'Medicine', category: 'Mental', attr: 'CRA' },
    { key: 'skillHistory', name: 'History', category: 'Mental', attr: 'WIT' },
    { key: 'skillCharisma', name: 'Charisma', category: 'Social', attr: 'PRE' },
    { key: 'skillDeception', name: 'Deception', category: 'Social', attr: 'PRE' },
    { key: 'skillIntimidation', name: 'Intimidation', category: 'Social', attr: 'PRE' },
    { key: 'skillCulture', name: 'Culture', category: 'Social', attr: 'WIT' },
  ];

  if (isLoading) {
    return (
      <Card className="bg-stone-800 border-stone-700">
        <CardContent className="py-8">
          <div className="text-center text-stone-400">Loading hotbars...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Weapons Hotbar */}
      <Card className="bg-stone-800 border-stone-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-amber-500 flex items-center gap-2">
              <Sword className="h-5 w-5" />
              Weapons Hotbar (3 slots)
            </CardTitle>
            {canEdit && getHotbarsByType('weapons').length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setClearHotbarType('weapons');
                  setClearDialogOpen(true);
                }}
                data-testid="button-clear-weapons"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {[0, 1, 2].map(slotNum => {
              // Slot 1 is blocked when a heavy (2-handed) weapon is equipped
              const isSlot1Blocked = slotNum === 1 && heavyEquipped;
              
              return (
                <div key={slotNum} className="flex flex-col items-center gap-1">
                  <Label className="text-xs text-stone-400">
                    {slotNum === 0 ? 'Left' : slotNum === 1 ? 'Right' : 'Ammo'}
                  </Label>
                  <HotbarSlot
                    type="weapons"
                    slotNumber={slotNum}
                    hotbar={getHotbarForSlot('weapons', slotNum)}
                    character={character}
                    canEdit={canEdit}
                    allHotbars={hotbars}
                    allItems={items}
                    onDrop={(slot, data) => handleDrop('weapons', slot, data)}
                    onRemove={handleRemove}
                    isBlocked={isSlot1Blocked}
                    blockReason="Two-handed weapon equipped - this slot is blocked"
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Left/Right for weapons, Far-right for ammunition. Heavy (two-handed) weapons use the left slot and block the right.
          </p>
          
          {/* Draggable Weapons */}
          {canEdit && weaponItems.length > 0 && (
            <div className="pt-4 border-t border-stone-700 mt-4">
              <Label className="text-xs text-stone-400 mb-2 block">Tap or drag weapons to equip:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {weaponItems.map((item: any) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, { type: 'item', item, itemId: item.id })}
                    onClick={() => openEquipPicker('weapons', { type: 'item', item, itemId: item.id }, item.name)}
                    className="px-2 py-1 bg-stone-900 rounded border border-stone-700 cursor-pointer hover:border-amber-500 hover:bg-stone-800 active:bg-amber-900/30 transition-all text-xs touch-target"
                    data-testid={`drag-weapon-${item.id}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-amber-400 truncate">{item.name}</span>
                      {item.damage && <span className="text-red-400 text-xs">{item.damage}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Draggable Ammunition for slot 2 */}
          {canEdit && ammunitionItems.length > 0 && (
            <div className="pt-4 border-t border-stone-700 mt-4">
              <Label className="text-xs text-stone-400 mb-2 block">
                Tap or drag ammunition to equip:
                {compatibleAmmoType && (
                  <span className="text-amber-400 ml-1">(Compatible: {compatibleAmmoType}s)</span>
                )}
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                {ammunitionItems.map((item: any) => {
                  const isCompatible = !compatibleAmmoType || item.ammunitionType === compatibleAmmoType;
                  return (
                    <div
                      key={item.id}
                      draggable={isCompatible}
                      onDragStart={(e) => isCompatible && handleDragStart(e, { type: 'item', item, itemId: item.id })}
                      onClick={() => isCompatible && openEquipPicker('weapons', { type: 'item', item, itemId: item.id }, item.name)}
                      className={`px-2 py-1 bg-stone-900 rounded border text-xs ${
                        isCompatible 
                          ? 'border-stone-700 cursor-pointer hover:border-amber-500 hover:bg-stone-800 active:bg-amber-900/30' 
                          : 'border-stone-800 opacity-50 cursor-not-allowed'
                      } transition-all touch-target`}
                      data-testid={`drag-ammo-${item.id}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className={`font-medium truncate ${isCompatible ? 'text-amber-400' : 'text-stone-500'}`}>
                          {item.name}
                        </span>
                        <span className="text-stone-400 text-xs">x{item.quantity}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Magic Hotbar */}
      <Card className="bg-stone-800 border-stone-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-purple-500 flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Magic Hotbar (5 slots)
            </CardTitle>
            {canEdit && getHotbarsByType('magic').length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setClearHotbarType('magic');
                  setClearDialogOpen(true);
                }}
                data-testid="button-clear-magic"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {[0, 1, 2, 3, 4].map(slotNum => (
              <HotbarSlot
                key={slotNum}
                type="magic"
                slotNumber={slotNum}
                hotbar={getHotbarForSlot('magic', slotNum)}
                character={character}
                allHotbars={hotbars}
                allItems={items}
                canEdit={canEdit}
                onDrop={(slot, data) => handleDrop('magic', slot, data)}
                onRemove={handleRemove}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Tap or drag spells to equip them.
          </p>
          
          {canEdit && spells.length > 0 && (
            <div className="pt-4 border-t border-stone-700 mt-4">
              <Label className="text-xs text-stone-400 mb-2 block">Tap or drag spells to equip:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {spells.map((spell: any) => (
                  <div
                    key={spell.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, { type: 'spell', id: spell.id, name: spell.name })}
                    onClick={() => openEquipPicker('magic', { type: 'spell', id: spell.id, name: spell.name }, spell.name)}
                    className={`px-2 py-1 bg-stone-900 rounded border cursor-pointer hover:border-purple-500 hover:bg-stone-800 active:bg-purple-900/30 transition-all text-xs touch-target ${spell.isEquipped ? 'border-purple-500 opacity-60' : 'border-stone-700'}`}
                    data-testid={`drag-spell-${spell.id}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-purple-400 truncate">{spell.name}</span>
                      <span className="text-cyan-400 text-[10px]">{spell.energyCost || 0}E</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skills Hotbar */}
      <Card className="bg-stone-800 border-stone-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-blue-500 flex items-center gap-2">
              <Dice5 className="h-5 w-5" />
              Skills Hotbar (5 slots)
            </CardTitle>
            {canEdit && getHotbarsByType('skills').length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setClearHotbarType('skills');
                  setClearDialogOpen(true);
                }}
                data-testid="button-clear-skills"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap mb-4">
            {[0, 1, 2, 3, 4].map(slotNum => (
              <HotbarSlot
                key={slotNum}
                type="skills"
                slotNumber={slotNum}
                hotbar={getHotbarForSlot('skills', slotNum)}
                character={character}
                allHotbars={hotbars}
                allItems={items}
                canEdit={canEdit}
                onDrop={(slot, data) => handleDrop('skills', slot, data)}
                onRemove={handleRemove}
              />
            ))}
          </div>
          
          {canEdit && (
            <div className="pt-4 border-t border-stone-700">
              <Label className="text-xs text-stone-400 mb-2 block">Tap or drag skills to equip:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {skillsList.map(skill => {
                  const skillValue = character[skill.key as keyof typeof character] || 0;
                  const modifier = skillValue >= 0 ? `+${skillValue}` : `${skillValue}`;
                  return (
                    <div
                      key={skill.key}
                      draggable
                      onDragStart={(e) => handleDragStart(e, { type: 'skill', skillName: skill.name })}
                      onClick={() => openEquipPicker('skills', { type: 'skill', skillName: skill.name }, skill.name)}
                      className="px-2 py-1 bg-stone-900 rounded border border-stone-700 cursor-pointer hover:border-blue-500 hover:bg-stone-800 active:bg-blue-900/30 transition-all text-xs touch-target"
                      data-testid={`drag-skill-${skill.name.toLowerCase().replace(/ /g, '-')}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-stone-300">{skill.name} <span className="text-stone-500">({skill.attr})</span></span>
                        <span className="text-stone-500">{modifier}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Custom Skills Section */}
              {characterCustomSkills.length > 0 && (
                <div className="mt-4 pt-4 border-t border-stone-700">
                  <Label className="text-xs text-stone-400 mb-2 block">Tap or drag custom skills to equip:</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {characterCustomSkills.map((customSkill: any) => {
                      const modifier = (customSkill.value || 0) >= 0 ? `+${customSkill.value || 0}` : `${customSkill.value || 0}`;
                      return (
                        <div
                          key={customSkill.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, { type: 'skill', skillName: customSkill.name })}
                          onClick={() => openEquipPicker('skills', { type: 'skill', skillName: customSkill.name }, customSkill.name)}
                          className="px-2 py-1 bg-stone-900 rounded border border-stone-700 cursor-pointer hover:border-blue-500 hover:bg-stone-800 active:bg-blue-900/30 transition-all text-xs touch-target"
                          data-testid={`drag-custom-skill-${customSkill.id}`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-violet-400 truncate">{customSkill.name}</span>
                            <span className="text-stone-500">{modifier}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Traits Section */}
              {characterTraits.length > 0 && (
                <div className="mt-4 pt-4 border-t border-stone-700">
                  <Label className="text-xs text-stone-400 mb-2 block">Tap or drag traits to equip:</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {characterTraits.map((trait: any) => {
                      const usesRemaining = trait.usesPerLongRest - trait.currentUses;
                      const isExhausted = usesRemaining <= 0;
                      return (
                        <div
                          key={trait.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, { type: 'trait', traitId: trait.id, traitName: trait.name })}
                          onClick={() => openEquipPicker('skills', { type: 'trait', traitId: trait.id, traitName: trait.name }, trait.name)}
                          className={`px-2 py-1 bg-stone-900 rounded border cursor-pointer transition-all text-xs touch-target ${
                            isExhausted 
                              ? 'border-stone-600 opacity-60' 
                              : 'border-stone-700 hover:border-cyan-500 hover:bg-stone-800 active:bg-cyan-900/30'
                          }`}
                          data-testid={`drag-trait-${trait.id}`}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`font-medium truncate ${isExhausted ? 'text-stone-500' : 'text-cyan-400'}`}>{trait.name}</span>
                            <span className={`text-xs ${isExhausted ? 'text-red-400' : 'text-cyan-600'}`}>
                              {usesRemaining}/{trait.usesPerLongRest}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consumables Hotbar */}
      <Card className="bg-stone-800 border-stone-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-green-500 flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Consumables Hotbar (2 slots)
            </CardTitle>
            {canEdit && getHotbarsByType('consumables').length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setClearHotbarType('consumables');
                  setClearDialogOpen(true);
                }}
                data-testid="button-clear-consumables"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {[0, 1].map(slotNum => (
              <HotbarSlot
                key={slotNum}
                type="consumables"
                slotNumber={slotNum}
                hotbar={getHotbarForSlot('consumables', slotNum)}
                character={character}
                allHotbars={hotbars}
                allItems={items}
                canEdit={canEdit}
                onDrop={(slot, data) => handleDrop('consumables', slot, data)}
                onRemove={handleRemove}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Tap or drag consumable items to equip them.
          </p>
          
          {canEdit && consumableItems.length > 0 && (
            <div className="pt-4 border-t border-stone-700 mt-4">
              <Label className="text-xs text-stone-400 mb-2 block">Tap or drag consumables to equip:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {consumableItems.map((item: any) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, { type: 'item', item, itemId: item.id })}
                    onClick={() => openEquipPicker('consumables', { type: 'item', item, itemId: item.id }, item.name)}
                    className="px-2 py-1 bg-stone-900 rounded border border-stone-700 cursor-pointer hover:border-green-500 hover:bg-stone-800 active:bg-green-900/30 transition-all text-xs touch-target"
                    data-testid={`drag-consumable-${item.id}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-green-400 truncate">{item.name}</span>
                      <span className="text-stone-500 text-xs">x{item.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Utility Hotbar */}
      <Card className="bg-stone-800 border-stone-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-orange-500 flex items-center gap-2">
              <Backpack className="h-5 w-5" />
              Utility Hotbar (5 slots)
            </CardTitle>
            {canEdit && getHotbarsByType('utility').length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setClearHotbarType('utility');
                  setClearDialogOpen(true);
                }}
                data-testid="button-clear-utility"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {[0, 1, 2, 3, 4].map(slotNum => (
              <HotbarSlot
                key={slotNum}
                type="utility"
                slotNumber={slotNum}
                hotbar={getHotbarForSlot('utility', slotNum)}
                character={character}
                allHotbars={hotbars}
                allItems={items}
                canEdit={canEdit}
                onDrop={(slot, data) => handleDrop('utility', slot, data)}
                onRemove={handleRemove}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Tap or drag utility items to equip them. Containers grant carry capacity bonus when equipped.
          </p>
          
          {canEdit && utilityItems.length > 0 && (
            <div className="pt-4 border-t border-stone-700 mt-4">
              <Label className="text-xs text-stone-400 mb-2 block">Tap or drag utility items to equip:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {utilityItems.map((item: any) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, { type: 'item', item, itemId: item.id })}
                    onClick={() => openEquipPicker('utility', { type: 'item', item, itemId: item.id }, item.name)}
                    className="px-2 py-1 bg-stone-900 rounded border border-stone-700 cursor-pointer hover:border-orange-500 hover:bg-stone-800 active:bg-orange-900/30 transition-all text-xs touch-target"
                    data-testid={`drag-utility-${item.id}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-orange-400 truncate">{item.name}</span>
                      {item.isContainer && <span className="text-stone-500 text-xs">+{item.carryCapacity}lb</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Armor Hotbar */}
      <Card className="bg-stone-800 border-stone-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-blue-500 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Armor Hotbar (5 slots)
            </CardTitle>
            {canEdit && getHotbarsByType('armor').length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setClearHotbarType('armor');
                  setClearDialogOpen(true);
                }}
                data-testid="button-clear-armor"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {[0, 1, 2, 3, 4].map(slotNum => (
              <div key={slotNum} className="flex flex-col items-center gap-1">
                <Label className="text-xs text-stone-400">
                  {['Helm', 'Chest', 'Arm', 'Legs', 'Boots'][slotNum]}
                </Label>
                <HotbarSlot
                  type="armor"
                  slotNumber={slotNum}
                  hotbar={getHotbarForSlot('armor', slotNum)}
                  character={character}
                  allHotbars={hotbars}
                  allItems={items}
                  canEdit={canEdit}
                  onDrop={(slot, data) => handleDrop('armor', slot, data)}
                  onRemove={handleRemove}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Equip armor to increase your DC. Each slot corresponds to a body part.
          </p>
          
          {canEdit && armorItems.length > 0 && (
            <div className="pt-4 border-t border-stone-700 mt-4">
              <Label className="text-xs text-stone-400 mb-2 block">Tap or drag armor to equip:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {armorItems.map((item: any) => {
                  const slotName = item.armorSlot ? item.armorSlot.charAt(0).toUpperCase() + item.armorSlot.slice(1) : 'Unknown';
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, { type: 'item', item, itemId: item.id })}
                      onClick={() => openEquipPicker('armor', { type: 'item', item, itemId: item.id }, item.name)}
                      className="px-2 py-1 bg-stone-900 rounded border border-stone-700 cursor-pointer hover:border-blue-500 hover:bg-stone-800 active:bg-blue-900/30 transition-all text-xs touch-target"
                      data-testid={`drag-armor-${item.id}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-blue-400 truncate">{item.name}</span>
                        <span className="text-stone-500 text-xs">{slotName}</span>
                      </div>
                      {(item.armorBonus || item.damageReduction) && (
                        <div className="flex justify-between text-xs mt-1">
                          {item.armorBonus > 0 && <span className="text-cyan-400">+{item.armorBonus} DC</span>}
                          {item.damageReduction > 0 && <span className="text-green-400">-{item.damageReduction} {item.damageReductionType}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear All Confirmation Dialog */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all {clearHotbarType} slots?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all items from the {clearHotbarType} hotbar. You can add them back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleClearAll(clearHotbarType)}>
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Equip Slot Picker Dialog - for mobile/touch devices */}
      <Dialog open={equipPickerOpen} onOpenChange={(open) => {
        setEquipPickerOpen(open);
        if (!open) setEquipPickerData(null);
      }}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-amber-500">
              Equip {equipPickerData?.itemName}
            </DialogTitle>
            <DialogDescription className="text-stone-400">
              Select a slot to equip this item
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 py-4">
            {equipPickerData && Array.from({ length: getMaxSlots(equipPickerData.hotbarType) }).map((_, slotNum) => {
              const existingHotbar = getHotbarForSlot(equipPickerData.hotbarType, slotNum);
              const isSlot1Blocked = equipPickerData.hotbarType === 'weapons' && slotNum === 1 && heavyEquipped;
              const isSlot2AmmoOnly = equipPickerData.hotbarType === 'weapons' && slotNum === 2 && equipPickerData.payload?.item?.itemType !== 'ammunition';
              
              // For armor hotbar, only allow armor to go in its matching slot
              const armorSlotMapping: Record<string, number> = { helm: 0, chest: 1, arm: 2, legs: 3, boots: 4 };
              const isArmorSlotMismatch = equipPickerData.hotbarType === 'armor' && 
                equipPickerData.payload?.item?.armorSlot && 
                armorSlotMapping[equipPickerData.payload.item.armorSlot] !== slotNum;
              
              const isBlocked = isSlot1Blocked || isSlot2AmmoOnly || isArmorSlotMismatch;
              
              return (
                <Button
                  key={slotNum}
                  variant={existingHotbar ? "secondary" : "outline"}
                  className={`h-16 flex flex-col items-center justify-center gap-1 ${
                    isBlocked ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  onClick={() => !isBlocked && handlePickerEquip(slotNum)}
                  disabled={isBlocked}
                  data-testid={`equip-picker-slot-${slotNum}`}
                >
                  <span className="text-xs text-stone-400">
                    {getSlotLabel(equipPickerData.hotbarType, slotNum)}
                  </span>
                  {existingHotbar ? (
                    <span className="text-xs text-amber-400 truncate max-w-full">
                      (Replace)
                    </span>
                  ) : (
                    <span className="text-xs text-stone-500">Empty</span>
                  )}
                </Button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setEquipPickerOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 6b. Hotbar Slot Component
interface HotbarSlotProps {
  type: string;
  slotNumber: number;
  hotbar?: Hotbar;
  character: any;
  canEdit: boolean;
  onDrop: (slotNumber: number, data: any) => void;
  onRemove: (hotbarId: string) => void;
  isBlocked?: boolean;
  blockReason?: string;
  allHotbars?: Hotbar[];
  allItems?: any[];
}

function HotbarSlot({ type, slotNumber, hotbar, character, canEdit, onDrop, onRemove, isBlocked, blockReason, allHotbars, allItems }: HotbarSlotProps) {
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);

  // Fetch item data if itemId exists
  const { data: itemData, isLoading: itemLoading } = useQuery({
    queryKey: ['item', hotbar?.itemId],
    queryFn: () => api.getItems(character.id).then(items => items.find((i: any) => i.id === hotbar?.itemId)),
    enabled: !!hotbar?.itemId
  });

  // Fetch spell data if spellId exists
  const { data: spellData, isLoading: spellLoading } = useQuery({
    queryKey: ['spell', hotbar?.spellId],
    queryFn: () => api.getSpells(character.id).then(spells => spells.find((s: any) => s.id === hotbar?.spellId)),
    enabled: !!hotbar?.spellId
  });

  // Fetch trait data if traitId exists
  const { data: traitData, isLoading: traitLoading } = useQuery({
    queryKey: ['trait', hotbar?.traitId],
    queryFn: () => api.getCharacterTraits(character.id).then(traits => traits.find((t: any) => t.id === hotbar?.traitId)),
    enabled: !!hotbar?.traitId
  });

  // Parse dice notation like "1d8" or "2d6" and roll it
  const rollDice = (notation: string): { result: number; dieType: string } => {
    const match = notation.match(/(\d+)d(\d+)/i);
    if (!match) return { result: 0, dieType: 'd20' };
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * sides) + 1;
    }
    return { result: total, dieType: `d${sides}` };
  };

  // Get attribute modifier from character
  const getAttributeModifier = (attrName: string): number => {
    if (!attrName || !character) return 0;
    const attrKey = attrName.toLowerCase() as keyof typeof character;
    return typeof character[attrKey] === 'number' ? character[attrKey] : 0;
  };

  // Check if weapon is a ranged weapon that uses ammunition
  const isRangedWeapon = (weapon: any): boolean => {
    return weapon?.weaponCategory && RANGED_WEAPON_CATEGORIES.includes(weapon.weaponCategory.toLowerCase());
  };

  // Get equipped ammunition from slot 2 of weapons hotbar
  const getEquippedAmmunition = (): any | null => {
    if (!allHotbars || !allItems) return null;
    const ammoHotbar = allHotbars.find((h: Hotbar) => h.hotbarType === 'weapons' && h.slotNumber === 2);
    if (!ammoHotbar?.itemId) return null;
    return allItems.find((i: any) => i.id === ammoHotbar.itemId);
  };

  // Check if weapon requires ammunition to attack
  const requiresAmmunitionForRoll = (weaponCategory: string): boolean => {
    return ['bow', 'crossbow', 'sling', 'firearm'].includes(weaponCategory?.toLowerCase() || '');
  };

  // Get total quantity of all matching ammunition items (by name and type)
  const getTotalAmmunitionQuantity = (ammoItem: any): number => {
    if (!allItems || !ammoItem) return ammoItem?.quantity || 1;
    const matchingAmmo = allItems.filter((item: any) => 
      item.itemType === 'ammunition' && 
      item.name === ammoItem.name &&
      item.ammunitionType === ammoItem.ammunitionType
    );
    return matchingAmmo.reduce((total: number, item: any) => total + (item.quantity || 1), 0);
  };

  // Get total quantity of all matching stackable items (by name and key properties)
  const getTotalStackedQuantity = (item: any): number => {
    if (!allItems || !item) return item?.quantity || 1;
    // Match items by name and type (same logic as inventory stacking)
    const matchingItems = allItems.filter((i: any) => 
      i.name === item.name &&
      i.itemType === item.itemType &&
      i.damage === item.damage &&
      i.damageType === item.damageType &&
      i.rarity === item.rarity
    );
    return matchingItems.reduce((total: number, i: any) => total + (i.quantity || 1), 0);
  };

  // Check ammunition break chance and handle quantity reduction
  const checkAmmunitionBreak = async (ammo: any) => {
    const breakChance = (ammo.breakChance ?? 10) / 100;
    const breakRoll = Math.random();
    if (breakRoll < breakChance) {
      const newQuantity = (ammo.quantity || 1) - 1;
      const totalRemaining = getTotalAmmunitionQuantity(ammo) - 1;
      
      if (newQuantity <= 0) {
        await api.deleteItem(ammo.id);
        
        const nextAmmo = allItems?.find((item: any) => 
          item.id !== ammo.id &&
          item.itemType === 'ammunition' && 
          item.name === ammo.name &&
          item.ammunitionType === ammo.ammunitionType &&
          (item.quantity || 1) > 0
        );
        
        if (nextAmmo) {
          await api.upsertHotbar(character.id, { 
            hotbarType: 'weapons', 
            slotNumber: 2, 
            itemId: nextAmmo.id 
          });
        }
        
        triggerRollNotification({
          type: 'system',
          label: `${ammo.name} Broke!`,
          result: totalRemaining,
          modifier: 0,
          total: totalRemaining,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: nextAmmo 
            ? `Stack depleted! ${totalRemaining} ${ammo.name} remaining`
            : 'Last arrow used and broke!',
        });
        
        if (character.campaignId) {
          gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', 
            nextAmmo 
              ? `An arrow broke! ${totalRemaining} ${ammo.name} remaining.`
              : `${ammo.name} broke! No ammunition remaining.`, 
            'system');
        }
      } else {
        await api.updateItem(ammo.id, { quantity: newQuantity });
        
        triggerRollNotification({
          type: 'system',
          label: `${ammo.name} Broke!`,
          result: totalRemaining,
          modifier: 0,
          total: totalRemaining,
          username: character.name || 'Unknown',
          characterName: character.name,
          calculationBreakdown: `Arrow broke! ${totalRemaining} remaining`,
        });
        
        if (character.campaignId) {
          gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', 
            `An arrow broke! ${totalRemaining} ${ammo.name} remaining.`, 'system');
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
    }
  };

  // Handle attack roll (1d20 + attribute modifier)
  const handleAttackRoll = async () => {
    if (!itemData || itemData.itemType !== 'weapon') return;
    
    // Check if ranged weapon requires ammunition
    if (isRangedWeapon(itemData) && itemData.weaponCategory && requiresAmmunitionForRoll(itemData.weaponCategory)) {
      const ammo = getEquippedAmmunition();
      if (!ammo) {
        triggerRollNotification({
          type: 'attack',
          dieType: 'd20',
          label: `${itemData.name} - No Ammo!`,
          result: 0,
          modifier: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
        });
        return;
      }
    }
    
    const attrName = itemData.attribute || 'might';
    const attrMod = getAttributeModifier(attrName);
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + attrMod;
    
    // Build calculation breakdown like "1d20 = 11 + Might (2)"
    const attrDisplayName = attrName.charAt(0).toUpperCase() + attrName.slice(1);
    const calculationBreakdown = attrMod !== 0 
      ? `1d20 = ${roll} + ${attrDisplayName} (${attrMod >= 0 ? '+' : ''}${attrMod})`
      : `1d20 = ${roll}`;
    
    triggerRollNotification({
      type: 'attack',
      dieType: 'd20',
      label: `${itemData.name} Attack`,
      result: roll,
      modifier: attrMod,
      total,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    // Send roll to chat
    if (character.campaignId) {
      const chatText = `${itemData.name} Attack: ${calculationBreakdown} = ${total}`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
    
    // Check ammunition break for ranged weapons
    if (isRangedWeapon(itemData) && itemData.weaponCategory && requiresAmmunitionForRoll(itemData.weaponCategory)) {
      const ammo = getEquippedAmmunition();
      if (ammo) {
        await checkAmmunitionBreak(ammo);
      }
    }
  };

  // Handle damage roll (weapon damage dice + mod, or ammunition damage for ranged weapons)
  const handleDamageRoll = () => {
    if (!itemData) return;
    
    // For ranged weapons, use ammunition damage + both weapon mod and ammo mod
    if (isRangedWeapon(itemData)) {
      const ammo = getEquippedAmmunition();
      if (!ammo || !ammo.damage) {
        triggerRollNotification({
          type: 'attack',
          dieType: 'd20',
          label: 'No Ammunition!',
          result: 0,
          modifier: 0,
          total: 0,
          username: character.name || 'Unknown',
          characterName: character.name,
        });
        return;
      }
      
      const { result, dieType } = rollDice(ammo.damage);
      const weaponMod = itemData.mod || 0;
      const ammoMod = ammo.mod || 0;
      const totalMod = weaponMod + ammoMod;
      const total = result + totalMod;
      
      // Build calculation breakdown
      const modParts: string[] = [];
      if (weaponMod !== 0) modParts.push(`${itemData.name} (${weaponMod >= 0 ? '+' : ''}${weaponMod})`);
      if (ammoMod !== 0) modParts.push(`${ammo.name} (${ammoMod >= 0 ? '+' : ''}${ammoMod})`);
      const calculationBreakdown = modParts.length > 0
        ? `${ammo.damage} = ${result} + ${modParts.join(' + ')}`
        : `${ammo.damage} = ${result}`;
      
      triggerRollNotification({
        type: 'attack',
        dieType: dieType as any,
        label: `${itemData.name} Damage`,
        result,
        modifier: totalMod,
        total,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown,
      });
      
      // Send roll to chat
      if (character.campaignId) {
        const chatText = `${itemData.name} Damage: ${calculationBreakdown} = ${total}`;
        gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
      }
      return;
    }
    
    // For melee/thrown weapons, use weapon damage
    if (!itemData.damage) return;
    
    const { result, dieType } = rollDice(itemData.damage);
    const mod = itemData.mod || 0;
    const total = result + mod;
    
    // Build calculation breakdown
    const calculationBreakdown = mod !== 0 
      ? `${itemData.damage} = ${result} + Mod (${mod >= 0 ? '+' : ''}${mod})`
      : `${itemData.damage} = ${result}`;
    
    triggerRollNotification({
      type: 'attack',
      dieType: dieType as any,
      label: `${itemData.name} Damage`,
      result,
      modifier: mod,
      total,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    // Send roll to chat
    if (character.campaignId) {
      const chatText = `${itemData.name} Damage: ${calculationBreakdown} = ${total}`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
  };

  // Handle spell attack roll (1d20 + attribute modifier)
  const handleSpellAttackRoll = async () => {
    if (!spellData) return;
    
    // Check and deduct energy cost
    const energyCost = spellData.energyCost || 0;
    const currentEnergy = character.energy || 0;
    
    if (energyCost > 0 && currentEnergy < energyCost) {
      triggerRollNotification({
        type: 'system',
        label: `Not Enough Energy!`,
        result: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
        calculationBreakdown: `${spellData.name} requires ${energyCost} energy but you only have ${currentEnergy}.`,
      });
      return;
    }
    
    // Deduct energy cost
    if (energyCost > 0) {
      try {
        await api.updateCharacter(character.id, { energy: currentEnergy - energyCost });
        queryClient.invalidateQueries({ queryKey: ['character', character.id] });
      } catch (err) {
        console.error('Failed to deduct energy:', err);
      }
    }
    
    const attrName = spellData.attribute || 'wit';
    const attrMod = getAttributeModifier(attrName);
    const roll = Math.floor(Math.random() * 20) + 1;
    const total = roll + attrMod;
    
    const attrDisplayName = attrName.charAt(0).toUpperCase() + attrName.slice(1);
    const calculationBreakdown = attrMod !== 0 
      ? `1d20 = ${roll} + ${attrDisplayName} (${attrMod >= 0 ? '+' : ''}${attrMod})`
      : `1d20 = ${roll}`;
    
    const rollLabel = spellData.isAttack !== false ? 'Attack' : 'Use';
    triggerRollNotification({
      type: 'attack',
      dieType: 'd20',
      label: `${spellData.name} ${rollLabel}`,
      result: roll,
      modifier: attrMod,
      total,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    if (character.campaignId) {
      const chatText = `${spellData.name} ${rollLabel}: ${calculationBreakdown} = ${total}`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
  };

  // Handle spell damage roll (damage dice + mod)
  const handleSpellDamageRoll = async () => {
    if (!spellData) return;
    
    // Check if spell has healing (Health damage type heals instead of damages)
    const isHealing = spellData.damageType === 'Health';
    // Check both damageDice and damage fields for backwards compatibility
    const diceNotation = isHealing ? (spellData.healingDice || spellData.damageDice || spellData.damage) : (spellData.damageDice || spellData.damage);
    
    if (!diceNotation) {
      triggerRollNotification({
        type: 'attack',
        dieType: 'd20',
        label: `${spellData.name} - No damage/effect dice!`,
        result: 0,
        modifier: 0,
        total: 0,
        username: character.name || 'Unknown',
        characterName: character.name,
      });
      return;
    }
    
    const { result, dieType } = rollDice(diceNotation);
    const mod = typeof spellData.mod === 'number' ? spellData.mod : (parseInt(spellData.mod) || 0);
    const total = (result || 0) + mod;
    
    const calculationBreakdown = mod !== 0 
      ? `${diceNotation} = ${result} + Mod (${mod >= 0 ? '+' : ''}${mod})`
      : `${diceNotation} = ${result}`;
    
    const effectLabel = spellData.isAttack !== false ? 'Damage' : 'Effect';
    const label = isHealing ? `${spellData.name} Healing` : `${spellData.name} ${effectLabel}`;
    const damageTypeDisplay = spellData.damageType ? ` (${spellData.damageType})` : '';
    
    triggerRollNotification({
      type: 'attack',
      dieType: dieType as any,
      label,
      result,
      modifier: mod,
      total,
      username: character.name || 'Unknown',
      characterName: character.name,
      calculationBreakdown,
    });
    
    if (character.campaignId) {
      const chatText = `${label}: ${calculationBreakdown} = ${total}${damageTypeDisplay}`;
      gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
    }
  };

  // Handle click with single/double click detection for spells
  const handleSpellClick = (e: React.MouseEvent) => {
    if (!spellData) return;
    e.stopPropagation();
    
    clickCountRef.current += 1;
    
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    
    clickTimerRef.current = setTimeout(() => {
      if (clickCountRef.current === 1) {
        handleSpellAttackRoll();
      } else if (clickCountRef.current >= 2) {
        handleSpellDamageRoll();
      }
      clickCountRef.current = 0;
    }, 250);
  };

  // Handle click with single/double click detection for weapons
  const handleWeaponClick = (e: React.MouseEvent) => {
    if (!itemData || itemData.itemType !== 'weapon') return;
    e.stopPropagation();
    
    clickCountRef.current += 1;
    
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    
    clickTimerRef.current = setTimeout(() => {
      if (clickCountRef.current === 1) {
        handleAttackRoll();
      } else if (clickCountRef.current >= 2) {
        handleDamageRoll();
      }
      clickCountRef.current = 0;
    }, 250);
  };

  const isWeaponClickable = itemData && itemData.itemType === 'weapon';
  const isSpellClickable = !!spellData;

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit || isBlocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setIsDragOver(false);
    
    // Block drops on blocked slots
    if (isBlocked) {
      toast({
        title: "Slot Blocked",
        description: blockReason || "This slot is currently blocked",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Try spell data first for magic hotbar
      const spellData = e.dataTransfer.getData('spell');
      if (spellData) {
        const data = JSON.parse(spellData);
        onDrop(slotNumber, { type: 'spell', ...data });
        return;
      }

      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        const data = JSON.parse(jsonData);
        onDrop(slotNumber, data);
      } else {
        // Fallback to text/plain
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        onDrop(slotNumber, data);
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  const getSlotContent = () => {
    if (!hotbar) return null;

    // Display spell if equipped
    if (hotbar.spellId && spellData) {
      const energyCost = spellData.energyCost || 0;
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className="w-full h-full flex flex-col items-center justify-center p-0.5 rounded"
              >
                {spellData.image ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img 
                      src={spellData.image} 
                      alt={spellData.name}
                      className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 object-cover rounded"
                    />
                    {/* Energy badge */}
                    {energyCost > 0 && (
                      <div className="absolute top-0 right-0 bg-cyan-600 text-white text-[8px] px-1 rounded-bl font-bold">
                        {energyCost}E
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Spell placeholder icon */}
                    <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded bg-purple-900/30 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-purple-400" />
                    </div>
                    {/* Energy badge */}
                    {energyCost > 0 && (
                      <div className="absolute top-0 right-0 bg-cyan-600 text-white text-[8px] px-1 rounded-bl font-bold">
                        {energyCost}E
                      </div>
                    )}
                    {/* Damage badge if spell has damage */}
                    {(spellData.damageDice || spellData.damage) && (
                      <div className="absolute bottom-0 left-0 bg-red-900/90 text-red-300 text-[7px] px-0.5 rounded-tr font-bold">
                        {spellData.damageDice || spellData.damage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-bold">{spellData.name}</p>
              {(spellData.damageDice || spellData.damage) && <p className="text-sm">Damage: {spellData.damageDice || spellData.damage}{spellData.mod ? ` +${spellData.mod}` : ''} {spellData.damageType || ''}</p>}
              {spellData.attribute && <p className="text-sm">{spellData.isAttack !== false ? 'Attack' : 'Attribute'}: {spellData.attribute}</p>}
              {spellData.rangeNum && <p className="text-sm">Range: {spellData.rangeNum}ft</p>}
              <p className="text-sm text-cyan-400">Energy: {energyCost}</p>
              {spellData.castingTime && <p className="text-sm">Casting: {spellData.castingTime}</p>}
              <p className="text-xs text-stone-400 mt-1">Use from battlemap hotbar to cast</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // Display item if equipped
    if (hotbar.itemId && itemData) {
      const durabilityColor = itemData.durability >= 8 ? 'bg-green-500' : itemData.durability >= 4 ? 'bg-yellow-500' : 'bg-red-500';
      const durabilityWidth = (itemData.durability / 10) * 100;
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className="w-full h-full flex flex-col items-center justify-center p-0.5"
              >
                {itemData.image ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img 
                      src={itemData.image} 
                      alt={itemData.name}
                      className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 object-cover rounded"
                    />
                    {/* Durability bar overlay at bottom */}
                    <div className="absolute bottom-0.5 left-0.5 right-0.5 h-1 bg-stone-900/80 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${durabilityColor} transition-all`} 
                        style={{ width: `${durabilityWidth}%` }}
                      />
                    </div>
                    {/* Quantity badge for ammunition - shows total of all matching ammo */}
                    {itemData.itemType === 'ammunition' && (
                      <div className="absolute top-0 right-0 bg-stone-900/90 text-amber-400 text-[8px] px-1 rounded-bl font-bold">
                        x{getTotalAmmunitionQuantity(itemData)}
                      </div>
                    )}
                    {/* Quantity badge for consumables and throwables - shows total of all matching items */}
                    {(itemData.itemType === 'consumable' || itemData.isThrowable) && itemData.itemType !== 'ammunition' && (
                      <div className="absolute top-0 right-0 bg-stone-900/90 text-green-400 text-[8px] px-1 rounded-bl font-bold">
                        x{getTotalStackedQuantity(itemData)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Type-based placeholder icon */}
                    <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded bg-stone-700/50 flex items-center justify-center">
                      {itemData.itemType === 'weapon' && (
                        <Sword className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-amber-500" />
                      )}
                      {itemData.itemType === 'ammunition' && (
                        <Target className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-amber-500" />
                      )}
                      {itemData.itemType === 'consumable' && (
                        <Heart className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-green-500" />
                      )}
                      {itemData.itemType === 'utility' && (
                        <Backpack className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-orange-500" />
                      )}
                      {!['weapon', 'consumable', 'utility', 'ammunition'].includes(itemData.itemType) && (
                        <Package className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-stone-400" />
                      )}
                    </div>
                    {/* Durability bar overlay at bottom */}
                    <div className="absolute bottom-0.5 left-0.5 right-0.5 h-1 bg-stone-900/80 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${durabilityColor} transition-all`} 
                        style={{ width: `${durabilityWidth}%` }}
                      />
                    </div>
                    {/* Quantity badge for ammunition - shows total of all matching ammo */}
                    {itemData.itemType === 'ammunition' && (
                      <div className="absolute top-0 right-0 bg-stone-900/90 text-amber-400 text-[8px] px-1 rounded-bl font-bold">
                        x{getTotalAmmunitionQuantity(itemData)}
                      </div>
                    )}
                    {/* Quantity badge for consumables and throwables - shows total of all matching items */}
                    {(itemData.itemType === 'consumable' || itemData.isThrowable) && itemData.itemType !== 'ammunition' && (
                      <div className="absolute top-0 right-0 bg-stone-900/90 text-green-400 text-[8px] px-1 rounded-bl font-bold">
                        x{getTotalStackedQuantity(itemData)}
                      </div>
                    )}
                    {/* Damage badge for weapons */}
                    {itemData.damage && itemData.itemType !== 'ammunition' && (
                      <div className="absolute top-0 left-0 bg-red-900/90 text-red-300 text-[7px] px-0.5 rounded-br font-bold">
                        {itemData.damage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-bold">{itemData.name}</p>
              {itemData.damage && <p className="text-sm">Damage: {itemData.damage}{itemData.mod ? ` +${itemData.mod}` : ''}</p>}
              {itemData.damageType && <p className="text-sm">Type: {itemData.damageType}</p>}
              {itemData.attribute && <p className="text-sm">Attack: {itemData.attribute}</p>}
              {itemData.itemType === 'ammunition' && <p className="text-sm text-amber-400">Ammunition ({itemData.quantity})</p>}
              <p className={`text-sm ${itemData.durability <= 3 ? 'text-red-400 font-bold' : ''}`}>
                Durability: {itemData.durability}/10
                {itemData.durability <= 3 && ' ⚠️'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // Display skill if equipped
    if (hotbar.skillName) {
      const skillKey = `skill${hotbar.skillName.charAt(0).toUpperCase()}${hotbar.skillName.slice(1)}` as keyof typeof character;
      const skillValue = character[skillKey] || 0;
      const modifier = skillValue >= 0 ? `+${skillValue}` : `${skillValue}`;
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Skill icon */}
                <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded bg-blue-900/30 flex items-center justify-center">
                  <Dice5 className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-400" />
                </div>
                {/* Modifier badge */}
                <div className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] px-1 rounded-bl font-bold">
                  {modifier}
                </div>
                {/* Skill name at bottom */}
                <div className="absolute bottom-0 left-0 right-0 bg-stone-900/80 text-blue-300 text-[7px] text-center px-0.5 rounded-t truncate font-medium">
                  {hotbar.skillName}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-bold">{hotbar.skillName}</p>
              <p className="text-sm">Modifier: {modifier}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // Display trait if equipped
    if (hotbar.traitId && traitData) {
      const usesRemaining = traitData.usesPerLongRest - traitData.currentUses;
      const isExhausted = usesRemaining <= 0;
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Trait icon */}
                <div className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded flex items-center justify-center ${isExhausted ? 'bg-stone-700/30' : 'bg-cyan-900/30'}`}>
                  <Star className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 ${isExhausted ? 'text-stone-500' : 'text-cyan-400'}`} />
                </div>
                {/* Uses remaining badge */}
                <div className={`absolute top-0 right-0 text-white text-[8px] px-1 rounded-bl font-bold ${isExhausted ? 'bg-red-900' : 'bg-cyan-600'}`}>
                  {usesRemaining}/{traitData.usesPerLongRest}
                </div>
                {/* Trait name at bottom */}
                <div className={`absolute bottom-0 left-0 right-0 bg-stone-900/80 text-[7px] text-center px-0.5 rounded-t truncate font-medium ${isExhausted ? 'text-stone-500' : 'text-cyan-300'}`}>
                  {traitData.name}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-bold">{traitData.name}</p>
              {traitData.description && <p className="text-xs text-stone-400">{traitData.description}</p>}
              <p className="text-sm">Attribute: {traitData.parentAttribute}</p>
              <p className={`text-sm ${isExhausted ? 'text-red-400' : 'text-cyan-400'}`}>
                Uses: {usesRemaining}/{traitData.usesPerLongRest} per long rest
              </p>
              {isExhausted && <p className="text-xs text-red-400">No uses remaining</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // Show loading state if item/spell/trait is being fetched
    if ((hotbar.itemId && itemLoading) || (hotbar.spellId && spellLoading) || (hotbar.traitId && traitLoading)) {
      return (
        <div className="text-xs text-center text-stone-400 animate-pulse">
          <div className="text-[10px]">Loading...</div>
        </div>
      );
    }

    // Show orphaned state if item/spell/trait was deleted but hotbar entry remains
    if ((hotbar.itemId && !itemData) || (hotbar.spellId && !spellData) || (hotbar.traitId && !traitData)) {
      return (
        <div className="text-xs text-center text-stone-500 italic">
          <div className="text-[10px]">(Removed)</div>
        </div>
      );
    }

    return (
      <div className="text-xs text-center text-stone-400">
        <div className="text-[10px]">Empty</div>
      </div>
    );
  };

  const slotContent = getSlotContent();

  // Determine action type border color for spells
  const getSpellActionRing = () => {
    if (hotbar?.spellId && spellData?.castingTime) {
      const isBonusAction = spellData.castingTime.toLowerCase().includes('bonus');
      return isBonusAction ? 'ring-2 ring-blue-500' : 'ring-2 ring-red-500';
    }
    return '';
  };

  return (
    <div className="relative group">
      <div
        className={`
          w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded border-2 flex items-center justify-center
          transition-all duration-200 hover-scale touch-target
          ${hotbar 
            ? 'bg-stone-800 border-amber-600/50 hover:border-amber-500 glow-amber-subtle' 
            : 'bg-stone-900 border-dashed border-stone-700 hover:border-stone-600'
          }
          ${isDragOver ? 'border-amber-500 bg-amber-900/20 scale-105 glow-amber' : ''}
          ${canEdit && !hotbar && !isBlocked ? 'cursor-pointer' : ''}
          ${isBlocked ? 'opacity-60 cursor-not-allowed' : ''}
          ${getSpellActionRing()}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={`hotbar-slot-${type}-${slotNumber}`}
        aria-label={`${type} slot ${slotNumber}${isBlocked ? ' (blocked)' : ''}`}
        role={canEdit && !isBlocked ? "button" : "presentation"}
        tabIndex={canEdit && !isBlocked ? 0 : -1}
      >
        {/* Blocked slot overlay with X */}
        {isBlocked && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="absolute inset-0 bg-stone-900/70 rounded" />
            <X className="w-8 h-8 text-red-500 relative z-20" />
          </div>
        )}
        {hotbar && !isBlocked ? (
          <div className="relative w-full h-full flex items-center justify-center p-1">
            {slotContent}
            {canEdit && (
              <button
                onClick={() => setShowRemoveDialog(true)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-remove-${type}-${slotNumber}`}
              >
                <X className="w-3 h-3 text-white" />
              </button>
            )}
          </div>
        ) : !isBlocked ? (
          <span className="text-stone-600 text-xs font-medium">{slotNumber}</span>
        ) : null}
      </div>

      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from hotbar?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the item from this hotbar slot. You can add it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (hotbar) onRemove(hotbar.id);
              setShowRemoveDialog(false);
            }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Shared state for drag and drop (works on mobile unlike dataTransfer)
let globalDraggedItem: { id: string; item: any } | null = null;

// QuantityAdjustDialog - for setting item quantity to an absolute value
interface QuantityAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: any;
  onSave: (quantityChange: number) => void;
}

function QuantityAdjustDialog({ open, onOpenChange, item, onSave }: QuantityAdjustDialogProps) {
  const currentQuantity = item?.totalQuantity || item?.quantity || 1;
  const [targetQuantity, setTargetQuantity] = useState<string>(String(currentQuantity));
  
  useEffect(() => {
    if (open && item) {
      const qty = item?.totalQuantity || item?.quantity || 1;
      setTargetQuantity(String(qty));
    }
  }, [open, item]);
  
  const targetNum = targetQuantity === '' ? 0 : parseInt(targetQuantity) || 0;
  const quantityChange = targetNum - currentQuantity;
  
  const handleSave = () => {
    if (quantityChange !== 0 && targetNum >= 1) {
      onSave(quantityChange);
      onOpenChange(false);
    }
  };
  
  if (!item) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-amber-500">Set Quantity</DialogTitle>
          <DialogDescription className="text-stone-400">
            Set quantity for {item.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTargetQuantity(String(Math.max(1, targetNum - 1)))}
              disabled={targetNum <= 1}
              className="h-12 w-12 text-xl"
              data-testid="button-quantity-minus"
            >
              -
            </Button>
            <Input
              type="text"
              value={targetQuantity}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d+$/.test(val)) {
                  setTargetQuantity(val);
                }
              }}
              className="w-20 text-center bg-stone-800 border-stone-700 text-lg"
              data-testid="input-quantity-adjust"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTargetQuantity(String(targetNum + 1))}
              className="h-12 w-12 text-xl"
              data-testid="button-quantity-plus"
            >
              +
            </Button>
          </div>
          {targetNum < 1 && (
            <p className="text-red-400 text-xs text-center">Quantity must be at least 1</p>
          )}
          {quantityChange !== 0 && targetNum >= 1 && (
            <p className="text-stone-400 text-xs text-center">
              {quantityChange > 0 ? `Adding ${quantityChange}` : `Removing ${Math.abs(quantityChange)}`} (was {currentQuantity})
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-quantity-cancel">
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={quantityChange === 0 || targetNum < 1}
            data-testid="button-quantity-save"
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// DeleteQuantityDialog - for deleting specific number of stacked items
interface DeleteQuantityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: any;
  onDelete: (count: number) => void;
}

function DeleteQuantityDialog({ open, onOpenChange, item, onDelete }: DeleteQuantityDialogProps) {
  const totalQuantity = item?.totalQuantity || item?.quantity || 1;
  const [deleteCount, setDeleteCount] = useState(1);
  
  useEffect(() => {
    if (open) {
      setDeleteCount(1);
    }
  }, [open]);
  
  if (!item) return null;
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-stone-900 border-stone-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-400">Delete Items</AlertDialogTitle>
          <AlertDialogDescription className="text-stone-400">
            How many {item.name} do you want to delete? (Total: {totalQuantity})
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-stone-400 text-sm w-16">Delete:</span>
            <Slider
              value={[deleteCount]}
              onValueChange={(val) => setDeleteCount(val[0])}
              min={1}
              max={totalQuantity}
              step={1}
              className="flex-1"
            />
            <span className="text-red-400 font-bold w-12 text-right">{deleteCount}</span>
          </div>
          <div className="text-center text-stone-400 text-sm">
            {deleteCount === totalQuantity ? (
              <span className="text-red-400">This will delete all items</span>
            ) : (
              <span>Remaining after deletion: {totalQuantity - deleteCount}</span>
            )}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onDelete(deleteCount)}
            className="bg-red-600 hover:bg-red-700"
            data-testid="button-delete-confirm"
          >
            Delete {deleteCount} item{deleteCount > 1 ? 's' : ''}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Recursive inventory item row component with drag & drop support
interface InventoryItemRowProps {
  item: any;
  depth: number;
  expandedContainers: Set<string>;
  toggleContainer: (id: string) => void;
  setSelectedItem: (item: any) => void;
  setShowItemDetail: (show: boolean) => void;
  canEdit: boolean;
  moveItemToContainer: (itemId: string, containerId: string | null) => void;
  onDeleteItem?: (itemId: string) => void;
  onUpdateQuantity?: (itemId: string, quantityChange: number) => void;
  onDeleteMultiple?: (itemIds: string[]) => void;
}

function InventoryItemRow({ item, depth, expandedContainers, toggleContainer, setSelectedItem, setShowItemDetail, canEdit, moveItemToContainer, onDeleteItem, onUpdateQuantity, onDeleteMultiple }: InventoryItemRowProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showQuantityDialog, setShowQuantityDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStackedItems, setShowStackedItems] = useState(false);
  const [showSingleDeleteConfirm, setShowSingleDeleteConfirm] = useState(false);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null);
  const [pendingDeleteItemName, setPendingDeleteItemName] = useState<string>("");
  
  const rarityColors: Record<string, string> = {
    common: 'text-stone-400 border-stone-600',
    uncommon: 'text-green-400 border-green-600',
    rare: 'text-blue-400 border-blue-600',
    epic: 'text-purple-400 border-purple-600',
    legendary: 'text-orange-400 border-orange-600'
  };
  
  const durabilityColor = item.durability >= 7 ? 'bg-green-500' : item.durability >= 4 ? 'bg-yellow-500' : 'bg-red-500';
  const isExpanded = expandedContainers.has(item.id);
  const childCount = item.children?.length || 0;
  const totalQuantity = item.totalQuantity || item.quantity || 1;
  const stackedItems = item.items || [item];
  
  const handleDragOver = (e: React.DragEvent) => {
    if (!item.isContainer || !canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    if (!item.isContainer || !canEdit) return;
    
    // Try dataTransfer first, fall back to global state (works on mobile)
    let draggedItemId: string | null = null;
    
    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        const data = JSON.parse(jsonData);
        if (data.type === 'item' && data.itemId) {
          draggedItemId = data.itemId;
        }
      }
    } catch (err) {
      // dataTransfer failed, try global state
    }
    
    // Fall back to global state if dataTransfer didn't work
    if (!draggedItemId && globalDraggedItem) {
      draggedItemId = globalDraggedItem.id;
    }
    
    if (draggedItemId && draggedItemId !== item.id) {
      console.log('Moving item', draggedItemId, 'to container', item.id);
      moveItemToContainer(draggedItemId, item.id);
    }
    
    // Clear global state
    globalDraggedItem = null;
  };
  
  return (
    <div>
      {/* Main Item */}
      <div
        className={`p-3 bg-stone-900 rounded border transition-colors ${rarityColors[item.rarity] || rarityColors.common} ${isDragOver ? 'bg-amber-900/30 border-amber-500' : 'hover:bg-stone-800'}`}
        style={{ marginLeft: depth > 0 ? `${depth * 24}px` : 0 }}
        data-testid={`item-${item.id}`}
        draggable={canEdit && !item.isContainer}
        onDragStart={(e) => {
          if (!canEdit || item.isContainer) {
            e.preventDefault();
            return;
          }
          // Set global state for mobile fallback
          globalDraggedItem = { id: item.id, item: item };
          // Also set dataTransfer for desktop
          e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'item',
            itemId: item.id,
            itemType: item.itemType,
            weight: item.weight,
            item: item
          }));
          e.dataTransfer.effectAllowed = 'move';
          e.currentTarget.style.opacity = '0.5';
        }}
        onDragEnd={(e) => {
          e.currentTarget.style.opacity = '1';
          // Clear global state
          globalDraggedItem = null;
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-3">
          {/* Container Expand/Collapse Icon */}
          {item.isContainer && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleContainer(item.id);
              }}
              className="shrink-0 p-1 hover:bg-stone-700 rounded"
              data-testid={`button-toggle-container-${item.id}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-amber-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-amber-500" />
              )}
            </button>
          )}
          
          <div 
            className="flex items-center gap-3 flex-1 cursor-pointer"
            onClick={() => { setSelectedItem(item); setShowItemDetail(true); }}
          >
            <div className="w-12 h-12 bg-black/50 rounded flex items-center justify-center shrink-0 border border-stone-700">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded" />
              ) : item.isContainer ? (
                isExpanded ? <FolderOpen className="w-6 h-6 text-amber-500" /> : <Package className="w-6 h-6 text-amber-500" />
              ) : (
                <span className="text-xl font-bold text-stone-500">{item.name[0]}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-stone-100">{item.name}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0">{item.itemType}</Badge>
                <Badge variant="outline" className={`text-[10px] px-1 py-0 ${rarityColors[item.rarity]}`}>{item.rarity}</Badge>
                {totalQuantity > 1 && (
                  <Badge 
                    className={`bg-amber-600 text-xs ${canEdit && onUpdateQuantity ? 'cursor-pointer hover:bg-amber-500' : ''}`}
                    onClick={(e) => {
                      if (canEdit && onUpdateQuantity) {
                        e.stopPropagation();
                        setShowQuantityDialog(true);
                      }
                    }}
                    data-testid={`badge-quantity-${item.id}`}
                  >
                    x{totalQuantity}
                  </Badge>
                )}
                {item.isContainer && (
                  <Badge className="bg-purple-600 text-xs">{childCount} items | {item.carryCapacity || 0}lb cap</Badge>
                )}
                {item.containerId && depth === 0 && (
                  <Badge className="bg-stone-600 text-xs">In Container</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-stone-400">
                <span>{item.itemWeight}lbs</span>
                <div className="flex items-center gap-1">
                  <span>Dur:</span>
                  <div className="w-16 h-2 bg-stone-700 rounded overflow-hidden">
                    <div className={`h-full ${durabilityColor}`} style={{ width: `${(item.durability / 10) * 100}%` }} />
                  </div>
                  <span className="text-[10px]">{item.durability}/10</span>
                </div>
                {(item.priceGold > 0 || item.priceSilver > 0 || item.priceCopper > 0 || item.pricePlatinum > 0) && (
                  <span className="flex gap-1">
                    {item.pricePlatinum > 0 && <span className="text-purple-400">{item.pricePlatinum}p</span>}
                    {item.priceGold > 0 && <span className="text-yellow-500">{item.priceGold}g</span>}
                    {item.priceSilver > 0 && <span className="text-gray-400">{item.priceSilver}s</span>}
                    {item.priceCopper > 0 && <span className="text-orange-600">{item.priceCopper}c</span>}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Remove from container button */}
          {item.containerId && canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveItemToContainer(item.id, null);
              }}
              className="shrink-0 p-1.5 hover:bg-stone-700 rounded text-stone-400 hover:text-amber-400"
              title="Remove from container"
              data-testid={`button-remove-from-container-${item.id}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          
          {/* Delete item button */}
          {canEdit && onDeleteItem && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (totalQuantity > 1 && onDeleteMultiple) {
                  setShowDeleteDialog(true);
                } else {
                  setPendingDeleteItemId(item.id);
                  setPendingDeleteItemName(item.name);
                  setShowSingleDeleteConfirm(true);
                }
              }}
              className="shrink-0 p-1.5 hover:bg-red-900/50 rounded text-stone-400 hover:text-red-400"
              title="Delete item"
              data-testid={`button-delete-item-${item.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          
          {/* Stacked items expand button */}
          {totalQuantity > 1 && stackedItems.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowStackedItems(!showStackedItems);
              }}
              className="shrink-0 p-1.5 hover:bg-stone-700 rounded text-stone-400 hover:text-amber-400"
              title="View individual items"
              data-testid={`button-expand-stack-${item.id}`}
            >
              {showStackedItems ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Stacked Items Dropdown */}
      {showStackedItems && totalQuantity > 1 && stackedItems.length > 1 && (
        <div className="ml-4 mt-2 space-y-1 border-l-2 border-stone-700 pl-3">
          <div className="text-xs text-stone-500 mb-1 flex items-center gap-2">
            <span>Individual items in stack</span>
            <span className="text-stone-600">• Double-click to view details</span>
          </div>
          {stackedItems.map((stackedItem: any, idx: number) => {
            const stackedItemRarityClass = rarityColors[stackedItem.rarity] || 'border-stone-600';
            return (
              <div 
                key={stackedItem.id}
                className={`p-2 bg-stone-800 border ${stackedItemRarityClass} rounded cursor-pointer hover:bg-stone-750 transition-colors`}
                onDoubleClick={() => {
                  setSelectedItem(stackedItem);
                  setShowItemDetail(true);
                }}
                data-testid={`stacked-item-${stackedItem.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Item image if exists */}
                    {stackedItem.image && (
                      <img 
                        src={stackedItem.image} 
                        alt={stackedItem.name}
                        className="h-8 w-8 rounded object-cover border border-stone-600"
                      />
                    )}
                    {!stackedItem.image && (
                      <div className="h-8 w-8 bg-black/50 rounded flex items-center justify-center border border-stone-700">
                        <span className="text-sm font-bold text-stone-500">{stackedItem.name?.[0] || '?'}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-sm text-stone-200">{stackedItem.name}</span>
                      <div className="flex items-center gap-2 text-xs text-stone-400">
                        <span>{stackedItem.itemWeight}lbs</span>
                        <span>Qty: {stackedItem.quantity || 1}</span>
                        <Badge variant="outline" className={`text-[10px] px-1 py-0 ${stackedItemRarityClass}`}>{stackedItem.rarity}</Badge>
                      </div>
                    </div>
                  </div>
                  {/* Durability bar and delete button */}
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-stone-900 rounded overflow-hidden">
                      <div 
                        className={`h-full ${stackedItem.durability >= 7 ? 'bg-green-500' : stackedItem.durability >= 4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${(stackedItem.durability / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-stone-400">{stackedItem.durability}/10</span>
                    {canEdit && onDeleteItem && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteItemId(stackedItem.id);
                          setPendingDeleteItemName(stackedItem.name || "this item");
                          setShowSingleDeleteConfirm(true);
                        }}
                        className="p-1 hover:bg-red-900/50 rounded text-stone-500 hover:text-red-400"
                        title="Delete this item"
                        data-testid={`button-delete-stacked-item-${stackedItem.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nested Items (recursive) */}
      {item.isContainer && isExpanded && item.children && item.children.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-stone-700 ml-4">
          {item.children.map((child: any) => (
            <InventoryItemRow
              key={child.id}
              item={child}
              depth={depth + 1}
              expandedContainers={expandedContainers}
              toggleContainer={toggleContainer}
              setSelectedItem={setSelectedItem}
              setShowItemDetail={setShowItemDetail}
              canEdit={canEdit}
              moveItemToContainer={moveItemToContainer}
              onDeleteItem={onDeleteItem}
              onUpdateQuantity={onUpdateQuantity}
              onDeleteMultiple={onDeleteMultiple}
            />
          ))}
        </div>
      )}
      
      {/* Empty container drop zone */}
      {item.isContainer && isExpanded && (!item.children || item.children.length === 0) && (
        <div 
          className="mt-2 ml-4 p-4 border-2 border-dashed border-stone-700 rounded text-center text-stone-500 text-sm"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          Drop items here
        </div>
      )}

      {/* Quantity Adjust Dialog */}
      <QuantityAdjustDialog
        open={showQuantityDialog}
        onOpenChange={setShowQuantityDialog}
        item={item}
        onSave={(quantityChange) => {
          if (onUpdateQuantity) {
            onUpdateQuantity(item.id, quantityChange);
          }
        }}
      />

      {/* Delete Quantity Dialog */}
      <DeleteQuantityDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        item={item}
        onDelete={(count) => {
          // Use same logic as onUpdateQuantity for decreasing - properly handle quantity
          if (onUpdateQuantity && stackedItems.length > 0) {
            // Call onUpdateQuantity with negative change to properly reduce/delete items
            onUpdateQuantity(item.id, -count);
          }
          setShowDeleteDialog(false);
        }}
      />

      {/* Single Item Delete Confirmation Dialog */}
      <AlertDialog open={showSingleDeleteConfirm} onOpenChange={setShowSingleDeleteConfirm}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-stone-200">Delete Item</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              Are you sure you want to delete "{pendingDeleteItemName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (pendingDeleteItemId && onDeleteItem) {
                  onDeleteItem(pendingDeleteItemId);
                }
                setPendingDeleteItemId(null);
                setPendingDeleteItemName("");
              }}
              data-testid="button-confirm-delete-item"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// 6. Character Sheet Component
// Access level hierarchy:
// - 'name': Token name only (minimal access - can only see name)
// - 'view': Full stats visible (can see all stats, inventory, abilities)
// - 'edit': Can edit the character
// - 'owner': Character owner (same as edit but also shown as owner)
interface CharacterSheetProps {
  character: any;
  isGM: boolean;
  isOwner: boolean;
  isAdmin?: boolean;
  accessLevel?: 'name' | 'view' | 'edit' | 'owner';
  onUpdate?: (updates: any) => void;
  onClose?: () => void;
  defaultTab?: string;
  campaignId?: string;
  sceneId?: string;
  isTemplate?: boolean;
}

// Custom Skill Form for adding new skills to a character
const PARENT_ATTRIBUTE_OPTIONS = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];

function CustomSkillForm({ 
  systemSkills, 
  existingSkillIds, 
  onSave, 
  isLoading 
}: { 
  systemSkills: SystemSkill[]; 
  existingSkillIds: (string | undefined)[];
  onSave: (data: Partial<CharacterCustomSkill>) => void; 
  isLoading?: boolean;
}) {
  const [mode, setMode] = useState<'library' | 'custom'>('library');
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customAttribute, setCustomAttribute] = useState('wit');
  const [skillValue, setSkillValue] = useState(0);
  const [librarySearch, setLibrarySearch] = useState('');
  const [pendingSkill, setPendingSkill] = useState<SystemSkill | null>(null);
  const [pendingSkillValue, setPendingSkillValue] = useState(0);
  const [attributeFilter, setAttributeFilter] = useState('all');

  const hasActiveFilters = attributeFilter !== 'all';

  const availableSkills = systemSkills.filter(s => !existingSkillIds.includes(s.id));
  const filteredSkills = availableSkills.filter(skill => {
    const matchesSearch = skill.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
      skill.description?.toLowerCase().includes(librarySearch.toLowerCase());
    const matchesAttribute = attributeFilter === 'all' || skill.parentAttribute === attributeFilter;
    return matchesSearch && matchesAttribute;
  });

  const handleSaveCustom = () => {
    if (!customName.trim()) {
      toast({ title: 'Error', description: 'Please enter a skill name', variant: 'destructive' });
      return;
    }
    onSave({
      name: customName.trim(),
      description: customDescription.trim() || undefined,
      parentAttribute: customAttribute,
      value: skillValue
    });
    setCustomName('');
    setCustomDescription('');
    setCustomAttribute('wit');
    setSkillValue(0);
  };

  const handleAddFromLibrary = () => {
    if (!pendingSkill) return;
    onSave({
      systemSkillId: pendingSkill.id,
      name: pendingSkill.name,
      description: pendingSkill.description,
      parentAttribute: pendingSkill.parentAttribute,
      value: pendingSkillValue
    });
    setPendingSkill(null);
    setPendingSkillValue(0);
  };

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'library' | 'custom')}>
        <TabsList className="w-full bg-stone-800">
          <TabsTrigger value="library" className="flex-1">From Library</TabsTrigger>
          <TabsTrigger value="custom" className="flex-1">Custom</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-4">
          {availableSkills.length === 0 ? (
            <div className="text-center py-4 text-stone-500">
              No skills available in library
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="Search skills..."
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  className="bg-stone-800 border-stone-700 flex-1"
                  data-testid="input-skill-library-search"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className={`bg-stone-800 border-stone-700 ${hasActiveFilters ? 'border-cyan-500 text-cyan-400' : ''}`}
                      data-testid="button-skill-filter"
                    >
                      <Filter className="h-4 w-4" />
                      {hasActiveFilters && <span className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-500 rounded-full" />}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-stone-900 border-stone-700 p-4">
                    <div className="space-y-4">
                      <div className="font-medium text-stone-200">Filter Skills</div>
                      <div>
                        <Label className="text-stone-400 text-xs">Parent Attribute</Label>
                        <Select value={attributeFilter} onValueChange={setAttributeFilter}>
                          <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-skill-attribute-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {PARENT_ATTRIBUTE_OPTIONS.map(attr => (
                              <SelectItem key={attr} value={attr}>
                                {attr.charAt(0).toUpperCase() + attr.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAttributeFilter('all')}
                        className="w-full bg-stone-800 border-stone-600 hover:bg-stone-700"
                        data-testid="button-clear-skill-filters"
                      >
                        Clear Filters
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredSkills.map(skill => (
                    <div
                      key={skill.id}
                      className="p-3 bg-stone-800 rounded-lg border border-stone-700 hover:border-cyan-500 cursor-pointer transition-colors"
                      onClick={() => {
                        setPendingSkill(skill);
                        setPendingSkillValue(0);
                      }}
                      data-testid={`skill-library-item-${skill.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-700 rounded flex items-center justify-center">
                          <Sparkles className="h-5 w-5 text-cyan-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-stone-100">{skill.name}</span>
                            <Badge className="bg-cyan-600/30 text-cyan-300 text-xs capitalize">
                              {skill.parentAttribute}
                            </Badge>
                          </div>
                          {skill.description && (
                            <p className="text-xs text-stone-500 mt-1 line-clamp-2">{skill.description}</p>
                          )}
                        </div>
                        <Plus className="h-5 w-5 text-cyan-400 flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                  {filteredSkills.length === 0 && (
                    <div className="text-center py-8 text-stone-400">
                      <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>No skills found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <div>
            <Label className="text-stone-300">Skill Name</Label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Alchemy"
              className="bg-stone-800 border-stone-700 mt-1"
              data-testid="input-custom-skill-name"
            />
          </div>
          <div>
            <Label className="text-stone-300">Description (optional)</Label>
            <Textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Describe what this skill represents..."
              className="bg-stone-800 border-stone-700 mt-1"
              rows={2}
              data-testid="input-custom-skill-description"
            />
          </div>
          <div>
            <Label className="text-stone-300">Parent Attribute</Label>
            <Select value={customAttribute} onValueChange={setCustomAttribute}>
              <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-custom-skill-attribute">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARENT_ATTRIBUTE_OPTIONS.map(attr => (
                  <SelectItem key={attr} value={attr}>
                    {attr.charAt(0).toUpperCase() + attr.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-stone-300">Skill Value (-2 to 5)</Label>
            <Input
              type="number"
              min={-2}
              max={5}
              value={skillValue}
              onChange={(e) => setSkillValue(Math.max(-2, Math.min(5, parseInt(e.target.value) || 0)))}
              className="bg-stone-800 border-stone-700 mt-1"
              data-testid="input-skill-value"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={handleSaveCustom}
              disabled={isLoading}
              className="bg-cyan-700 hover:bg-cyan-600"
              data-testid="button-add-custom-skill-confirm"
            >
              {isLoading ? 'Adding...' : 'Add Skill'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!pendingSkill} onOpenChange={(open) => !open && setPendingSkill(null)}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-cyan-500">Set Skill Value</DialogTitle>
          </DialogHeader>
          {pendingSkill && (
            <div className="space-y-4">
              <div className="p-3 bg-stone-800 rounded-lg border border-stone-700">
                <div className="font-medium text-cyan-400">{pendingSkill.name}</div>
                <div className="text-xs text-stone-500 capitalize">Parent: {pendingSkill.parentAttribute}</div>
                {pendingSkill.description && (
                  <p className="text-xs text-stone-400 mt-1">{pendingSkill.description}</p>
                )}
              </div>
              <div>
                <Label className="text-stone-300">Skill Value (-2 to 5)</Label>
                <Input
                  type="number"
                  min={-2}
                  max={5}
                  value={pendingSkillValue}
                  onChange={(e) => setPendingSkillValue(Math.max(-2, Math.min(5, parseInt(e.target.value) || 0)))}
                  className="bg-stone-800 border-stone-700 mt-1"
                  data-testid="input-pending-skill-value"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPendingSkill(null)}
                  className="bg-stone-800 border-stone-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddFromLibrary}
                  disabled={isLoading}
                  className="bg-cyan-700 hover:bg-cyan-600"
                  data-testid="button-confirm-library-skill"
                >
                  {isLoading ? 'Adding...' : 'Add Skill'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Custom Skill Edit Form
function CustomSkillEditForm({ 
  skill, 
  onSave, 
  onDelete,
  isLoading 
}: { 
  skill: CharacterCustomSkill; 
  onSave: (data: Partial<CharacterCustomSkill>) => void;
  onDelete: () => void;
  isLoading?: boolean;
}) {
  const [skillValue, setSkillValue] = useState(skill.value);
  const [description, setDescription] = useState(skill.description || '');

  const handleSave = () => {
    onSave({
      value: skillValue,
      description: description.trim() || undefined
    });
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-stone-800 rounded-lg border border-stone-700">
        <div className="font-medium text-cyan-400">{skill.name}</div>
        <div className="text-xs text-stone-500 capitalize">Parent: {skill.parentAttribute}</div>
      </div>

      <div>
        <Label className="text-stone-300">Skill Value (-2 to 5)</Label>
        <Input
          type="number"
          min={-2}
          max={5}
          value={skillValue}
          onChange={(e) => setSkillValue(Math.max(-2, Math.min(5, parseInt(e.target.value) || 0)))}
          className="bg-stone-800 border-stone-700 mt-1"
          data-testid="input-edit-skill-value"
        />
      </div>

      <div>
        <Label className="text-stone-300">Description (optional)</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add notes about this skill..."
          className="bg-stone-800 border-stone-700 mt-1"
          rows={2}
          data-testid="input-edit-skill-description"
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button
          variant="destructive"
          onClick={onDelete}
          className="bg-red-700 hover:bg-red-600"
          data-testid="button-remove-custom-skill"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Remove
        </Button>
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="bg-cyan-700 hover:bg-cyan-600"
          data-testid="button-save-custom-skill"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// Trait Form for adding traits from library or custom
function TraitForm({ 
  systemTraits, 
  existingTraitIds, 
  onSave, 
  isLoading 
}: { 
  systemTraits: SystemTrait[]; 
  existingTraitIds: (string | undefined)[];
  onSave: (data: Partial<CharacterTrait>) => void; 
  isLoading?: boolean;
}) {
  const [mode, setMode] = useState<'library' | 'custom'>('library');
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customAttribute, setCustomAttribute] = useState('wit');
  const [usesPerLongRest, setUsesPerLongRest] = useState(1);
  const [librarySearch, setLibrarySearch] = useState('');
  const [attributeFilter, setAttributeFilter] = useState('all');
  const [damageModifierFilter, setDamageModifierFilter] = useState('all');

  const hasActiveFilters = attributeFilter !== 'all' || damageModifierFilter !== 'all';

  const clearFilters = () => {
    setAttributeFilter('all');
    setDamageModifierFilter('all');
  };

  const availableTraits = systemTraits.filter(t => !existingTraitIds.includes(t.id));
  const filteredTraits = availableTraits.filter(trait => {
    const matchesSearch = trait.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
      trait.description?.toLowerCase().includes(librarySearch.toLowerCase());
    const matchesAttribute = attributeFilter === 'all' || trait.parentAttribute === attributeFilter;
    const matchesDamageModifier = damageModifierFilter === 'all' || 
      (trait as any).damageModifierType === damageModifierFilter;
    return matchesSearch && matchesAttribute && matchesDamageModifier;
  });

  const handleAddFromLibrary = (trait: SystemTrait) => {
    onSave({
      systemTraitId: trait.id,
      name: trait.name,
      description: trait.description,
      parentAttribute: trait.parentAttribute,
      usesPerLongRest: trait.usesPerLongRest,
      currentUses: 0
    });
  };

  const handleSaveCustom = () => {
    if (!customName.trim()) {
      toast({ title: 'Error', description: 'Please enter a trait name', variant: 'destructive' });
      return;
    }
    onSave({
      name: customName.trim(),
      description: customDescription.trim() || undefined,
      parentAttribute: customAttribute,
      usesPerLongRest: usesPerLongRest,
      currentUses: 0
    });
    setCustomName('');
    setCustomDescription('');
    setCustomAttribute('wit');
    setUsesPerLongRest(1);
  };

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'library' | 'custom')}>
        <TabsList className="w-full bg-stone-800">
          <TabsTrigger value="library" className="flex-1">From Library</TabsTrigger>
          <TabsTrigger value="custom" className="flex-1">Custom</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-4">
          {availableTraits.length === 0 ? (
            <div className="text-center py-4 text-stone-500">
              No traits available in library
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="Search traits..."
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  className="bg-stone-800 border-stone-700 flex-1"
                  data-testid="input-trait-library-search"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className={`bg-stone-800 border-stone-700 ${hasActiveFilters ? 'border-rose-500 text-rose-400' : ''}`}
                      data-testid="button-trait-filter"
                    >
                      <Filter className="h-4 w-4" />
                      {hasActiveFilters && <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-stone-900 border-stone-700 p-4">
                    <div className="space-y-4">
                      <div className="font-medium text-stone-200">Filter Traits</div>
                      <div>
                        <Label className="text-stone-400 text-xs">Parent Attribute</Label>
                        <Select value={attributeFilter} onValueChange={setAttributeFilter}>
                          <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-trait-attribute-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {PARENT_ATTRIBUTE_OPTIONS.map(attr => (
                              <SelectItem key={attr} value={attr}>
                                {attr.charAt(0).toUpperCase() + attr.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-stone-400 text-xs">Damage Modifier</Label>
                        <Select value={damageModifierFilter} onValueChange={setDamageModifierFilter}>
                          <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-trait-damage-modifier-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="reduce">Reduce</SelectItem>
                            <SelectItem value="resistance">Resistance</SelectItem>
                            <SelectItem value="immune">Immune</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                        className="w-full bg-stone-800 border-stone-600 hover:bg-stone-700"
                        data-testid="button-clear-trait-filters"
                      >
                        Clear Filters
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredTraits.map(trait => (
                    <div
                      key={trait.id}
                      className="p-3 bg-stone-800 rounded-lg border border-stone-700 hover:border-rose-500 cursor-pointer transition-colors"
                      onClick={() => handleAddFromLibrary(trait)}
                      data-testid={`trait-library-item-${trait.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-700 rounded flex items-center justify-center">
                          <Star className="h-5 w-5 text-rose-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-stone-100">{trait.name}</span>
                            <Badge className="bg-rose-600/30 text-rose-300 text-xs capitalize">
                              {trait.parentAttribute}
                            </Badge>
                            <Badge className="bg-amber-600/30 text-amber-300 text-xs">
                              {trait.usesPerLongRest}/rest
                            </Badge>
                          </div>
                          {trait.description && (
                            <p className="text-xs text-stone-500 mt-1 line-clamp-2">{trait.description}</p>
                          )}
                        </div>
                        <Plus className="h-5 w-5 text-rose-400 flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                  {filteredTraits.length === 0 && (
                    <div className="text-center py-8 text-stone-400">
                      <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>No traits found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <div>
            <Label className="text-stone-300">Trait Name</Label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Enter trait name..."
              className="bg-stone-800 border-stone-700 mt-1"
              data-testid="input-custom-trait-name"
            />
          </div>

          <div>
            <Label className="text-stone-300">Description</Label>
            <Textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Describe the trait..."
              className="bg-stone-800 border-stone-700 mt-1"
              rows={2}
              data-testid="input-custom-trait-description"
            />
          </div>

          <div>
            <Label className="text-stone-300">Parent Attribute</Label>
            <Select value={customAttribute} onValueChange={setCustomAttribute}>
              <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-custom-trait-attribute">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARENT_ATTRIBUTE_OPTIONS.map((attr) => (
                  <SelectItem key={attr} value={attr}>
                    {attr.charAt(0).toUpperCase() + attr.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-stone-300">Uses Per Long Rest</Label>
            <Input
              type="number"
              min={1}
              value={usesPerLongRest}
              onChange={(e) => setUsesPerLongRest(Math.max(1, parseInt(e.target.value) || 1))}
              className="bg-stone-800 border-stone-700 mt-1"
              data-testid="input-custom-trait-uses"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={handleSaveCustom}
              disabled={isLoading}
              className="bg-rose-700 hover:bg-rose-600"
              data-testid="button-add-trait-confirm"
            >
              {isLoading ? 'Adding...' : 'Add Trait'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Trait Edit Form
function TraitEditForm({ 
  trait, 
  onSave, 
  onDelete,
  isLoading 
}: { 
  trait: CharacterTrait; 
  onSave: (data: Partial<CharacterTrait>) => void;
  onDelete: () => void;
  isLoading?: boolean;
}) {
  const [description, setDescription] = useState(trait.description || '');
  const [usesPerLongRest, setUsesPerLongRest] = useState(trait.usesPerLongRest);
  const [usesPerShortRest, setUsesPerShortRest] = useState(trait.usesPerShortRest || 0);
  const [currentUses, setCurrentUses] = useState(trait.currentUses);

  // Calculate max uses (sum of long rest + short rest uses)
  const maxUses = usesPerLongRest + usesPerShortRest;

  const handleSave = () => {
    onSave({
      description: description.trim() || undefined,
      usesPerLongRest: usesPerLongRest,
      usesPerShortRest: usesPerShortRest,
      currentUses: currentUses
    });
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-stone-800 rounded-lg border border-stone-700">
        <div className="font-medium text-rose-400">{trait.name}</div>
        <div className="text-xs text-stone-500 capitalize">Parent: {trait.parentAttribute}</div>
        {trait.damageModifierType && trait.damageModifierType !== 'none' && (
          <div className="text-xs text-amber-400 mt-1">
            {trait.damageModifierType === 'reduce' && `Reduces ${trait.damageModifierDamageType} damage by ${trait.damageModifierValue}`}
            {trait.damageModifierType === 'resistance' && `Resistance to ${trait.damageModifierDamageType} (half damage)`}
            {trait.damageModifierType === 'immune' && `Immune to ${trait.damageModifierDamageType} damage`}
          </div>
        )}
      </div>

      <div>
        <Label className="text-stone-300">Description (optional)</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add notes about this trait..."
          className="bg-stone-800 border-stone-700 mt-1"
          rows={2}
          data-testid="input-edit-trait-description"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-stone-300 text-xs">Long Rest Uses</Label>
          <Input
            type="number"
            min={0}
            value={usesPerLongRest}
            onChange={(e) => setUsesPerLongRest(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-stone-800 border-stone-700 mt-1"
            data-testid="input-edit-trait-uses-long"
          />
        </div>
        <div>
          <Label className="text-stone-300 text-xs">Short Rest Uses</Label>
          <Input
            type="number"
            min={0}
            value={usesPerShortRest}
            onChange={(e) => setUsesPerShortRest(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-stone-800 border-stone-700 mt-1"
            data-testid="input-edit-trait-uses-short"
          />
        </div>
        <div>
          <Label className="text-stone-300 text-xs">Current Uses</Label>
          <Input
            type="number"
            min={0}
            max={maxUses}
            value={currentUses}
            onChange={(e) => setCurrentUses(Math.max(0, Math.min(maxUses, parseInt(e.target.value) || 0)))}
            className="bg-stone-800 border-stone-700 mt-1"
            data-testid="input-edit-trait-uses-current"
          />
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button
          variant="destructive"
          onClick={onDelete}
          className="bg-red-700 hover:bg-red-600"
          data-testid="button-remove-trait"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Remove
        </Button>
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="bg-rose-700 hover:bg-rose-600"
          data-testid="button-save-trait"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function CharacterSheet({ character, isGM, isOwner, isAdmin = false, accessLevel = 'view', onUpdate, onClose, defaultTab = "overview", campaignId, sceneId, isTemplate = false }: CharacterSheetProps) {
  // Name-only mode: user only has 'name' access (token name only, no stats)
  // They can see name and portrait but not stats, inventory, or abilities
  const isViewOnly = accessLevel === 'name' && !isGM && !isOwner;
  const [biography, setBiography] = useState(character?.biography || "");
  const [gmNotes, setGmNotes] = useState(character?.gmNotes || "");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isEditingGmNotes, setIsEditingGmNotes] = useState(false);
  
  // Portrait cropping state
  const [showPortraitCrop, setShowPortraitCrop] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0, size: 200 });
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  
  // Image browser state
  const [showImageBrowser, setShowImageBrowser] = useState(false);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isLongPressRef = useRef(false);
  const lastClickTimeRef = useRef(0);
  const lastClickedCardRef = useRef<string | null>(null);
  const doubleClickDetectedRef = useRef(false);

  // Edit mode states
  const [editingOverview, setEditingOverview] = useState(false);
  const [editingAttributes, setEditingAttributes] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  
  // Live character data state (for real-time updates)
  const [liveCharacter, setLiveCharacter] = useState(character);
  
  // Update live character when prop changes
  useEffect(() => {
    setLiveCharacter(character);
  }, [character]);
  
  // Edit data states - includes race stats
  // HP/Energy/Level fields allow string | number to support empty input during editing
  const [overviewData, setOverviewData] = useState<{
    name: string;
    level: number | string;
    hp: number | string;
    maxHp: number | string;
    energy: number | string;
    maxEnergy: number | string;
    race: string;
    size: string;
    naturalArmor: number;
    sizeBonus: number;
    featTree: string;
    speed: number;
    flySpeed: number;
  }>({
    name: character?.name || "",
    level: character?.level || 1,
    hp: character?.hp || 0,
    maxHp: character?.maxHp || 0,
    energy: character?.energy || 0,
    maxEnergy: character?.maxEnergy || 0,
    race: character?.race || "Human",
    size: character?.size || "Medium",
    naturalArmor: character?.naturalArmor || 5,
    sizeBonus: character?.sizeBonus || 0,
    featTree: character?.featTree || "",
    speed: character?.speed || 30,
    flySpeed: character?.flySpeed || 0
  });
  
  // New attributes: Might, Finesse, Wit, Presence, Will, Craft (range -2 to 5)
  // Allow string | number to support empty input during editing
  const [attributesData, setAttributesData] = useState<{
    might: number | string;
    finesse: number | string;
    wit: number | string;
    presence: number | string;
    will: number | string;
    craft: number | string;
  }>({
    might: character?.might || 0,
    finesse: character?.finesse || 0,
    wit: character?.wit || 0,
    presence: character?.presence || 0,
    will: character?.will || 0,
    craft: character?.craft || 0
  });
  
  // Skills data (all skills, range -2 to 5)
  // Allow string | number to support empty input during editing
  const [skillsData, setSkillsData] = useState<{
    skillAgility: number | string;
    skillArcana: number | string;
    skillCharisma: number | string;
    skillConcentration: number | string;
    skillCulture: number | string;
    skillDeception: number | string;
    skillHistory: number | string;
    skillIntimidation: number | string;
    skillInvestigation: number | string;
    skillMedicine: number | string;
    skillPerception: number | string;
    skillSleightOfHand: number | string;
    skillStealth: number | string;
    skillStrength: number | string;
    skillWisdom: number | string;
  }>({
    skillAgility: character?.skillAgility || 0,
    skillArcana: character?.skillArcana || 0,
    skillCharisma: character?.skillCharisma || 0,
    skillConcentration: character?.skillConcentration || 0,
    skillCulture: character?.skillCulture || 0,
    skillDeception: character?.skillDeception || 0,
    skillHistory: character?.skillHistory || 0,
    skillIntimidation: character?.skillIntimidation || 0,
    skillInvestigation: character?.skillInvestigation || 0,
    skillMedicine: character?.skillMedicine || 0,
    skillPerception: character?.skillPerception || 0,
    skillSleightOfHand: character?.skillSleightOfHand || 0,
    skillStealth: character?.skillStealth || 0,
    skillStrength: character?.skillStrength || 0,
    skillWisdom: character?.skillWisdom || 0
  });
  
  // Fetch species from database
  const { data: systemSpecies = [] } = useQuery({
    queryKey: ['species'],
    queryFn: () => api.getSpecies('Arcana Adventure'),
  });

  // Get feat tree ID from the character's species (race), not from the character directly
  const characterSpecies = systemSpecies.find((s: SystemSpecies) => s.name === character?.race);
  const featTreeId = characterSpecies?.featTree || character?.featTree || '';
  
  const { data: featTreeData } = useQuery({
    queryKey: ['feat-tree', featTreeId],
    queryFn: () => api.getFeatTree(featTreeId),
    enabled: !!featTreeId,
  });

  // Fetch character's unlocked feats
  const { data: characterFeats = [] } = useQuery({
    queryKey: ['character-feats', character?.id],
    queryFn: () => character?.id ? api.getCharacterFeats(character.id) : Promise.resolve([]),
    enabled: !!character?.id,
  });

  // Fetch system skills (admin-defined custom skills) - cached for 5 minutes
  const { data: systemSkills = [] } = useQuery({
    queryKey: ['public-skills'],
    queryFn: () => api.getPublicSkills(),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch character's custom skills
  const { data: characterCustomSkills = [], refetch: refetchCustomSkills } = useQuery({
    queryKey: ['character-custom-skills', character?.id],
    queryFn: () => character?.id ? api.getCharacterCustomSkills(character.id) : Promise.resolve([]),
    enabled: !!character?.id,
  });

  // Fetch system traits (admin-defined traits) - cached for 5 minutes
  const { data: systemTraits = [] } = useQuery({
    queryKey: ['public-traits'],
    queryFn: () => api.getPublicTraits(),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch character's traits
  const { data: characterTraits = [], refetch: refetchCharacterTraits } = useQuery({
    queryKey: ['character-traits', character?.id],
    queryFn: () => character?.id ? api.getCharacterTraits(character.id) : Promise.resolve([]),
    enabled: !!character?.id,
  });

  // State for custom skill management
  const [showAddCustomSkill, setShowAddCustomSkill] = useState(false);
  const [editingCustomSkill, setEditingCustomSkill] = useState<CharacterCustomSkill | null>(null);
  
  // State for editing custom skill values inline (during Edit Skills mode)
  const [customSkillsEditData, setCustomSkillsEditData] = useState<Record<string, number | string>>({});
  
  // State for trait management
  const [showAddTrait, setShowAddTrait] = useState(false);
  const [editingTrait, setEditingTrait] = useState<CharacterTrait | null>(null);

  // Calculate bonuses from unlocked feats
  const featBonuses = useMemo(() => {
    const bonuses = {
      hp: 0,
      energy: 0,
      dc: 0,
      attributes: {} as Record<string, number>,
      skills: {} as Record<string, number>,
    };
    
    if (!featTreeData?.feats || !characterFeats.length) return bonuses;
    
    const unlockedFeatIds = new Set(characterFeats.map((cf: CharacterFeat) => cf.featId));
    const unlockedFeats = featTreeData.feats.filter((f: Feat) => unlockedFeatIds.has(f.id));
    const charLevel = Math.max(1, liveCharacter?.level || 1);
    
    for (const feat of unlockedFeats) {
      if (!feat.effects || !Array.isArray(feat.effects)) continue;
      
      for (const effect of feat.effects as any[]) {
        switch (effect.type) {
          case 'hp_bonus':
            // Support per-level scaling: if subtype is 'per_level', multiply by character level
            if (effect.subtype === 'per_level') {
              bonuses.hp += (effect.value || 0) * charLevel;
            } else {
              bonuses.hp += effect.value || 0;
            }
            break;
          case 'energy_bonus':
            // Support per-level scaling for energy as well
            if (effect.subtype === 'per_level') {
              bonuses.energy += (effect.value || 0) * charLevel;
            } else {
              bonuses.energy += effect.value || 0;
            }
            break;
          case 'dc_bonus':
            bonuses.dc += effect.value || 0;
            break;
          case 'attribute_bonus':
            if (effect.target) {
              bonuses.attributes[effect.target] = (bonuses.attributes[effect.target] || 0) + (effect.value || 0);
            }
            break;
          case 'skill_bonus':
            if (effect.target) {
              bonuses.skills[effect.target] = (bonuses.skills[effect.target] || 0) + (effect.value || 0);
            }
            break;
        }
      }
    }
    
    return bonuses;
  }, [featTreeData?.feats, characterFeats, liveCharacter?.level]);

  // Calculate effective max HP/Energy including feat bonuses
  const effectiveMaxHp = (liveCharacter.maxHp || 0) + featBonuses.hp;
  const effectiveMaxEnergy = (liveCharacter.maxEnergy || 0) + featBonuses.energy;

  // Handle race selection - auto-fill race stats and recalculate HP based on new species
  const handleRaceChange = (raceName: string) => {
    const raceData = systemSpecies.find((r: SystemSpecies) => r.name === raceName);
    if (raceData) {
      // Calculate new max HP = new species base HP + existing bonus HP from level ups
      const bonusHp = liveCharacter.bonusHpFromLevelUps || 0;
      const newMaxHp = (raceData.startingMaxHp || 10) + bonusHp;
      const newHp = (raceData.startingHp || 10) + bonusHp;
      
      // Calculate new max/current energy from species
      const newMaxEnergy = raceData.startingMaxEnergy || 10;
      const newEnergy = raceData.startingEnergy || 10;
      
      setOverviewData(prev => ({
        ...prev,
        race: raceName,
        size: raceData.size,
        naturalArmor: raceData.naturalArmor,
        sizeBonus: raceData.sizeBonus,
        featTree: raceData.featTree || '',
        speed: raceData.speed,
        flySpeed: raceData.flySpeed,
        hp: newHp,
        maxHp: newMaxHp,
        energy: newEnergy,
        maxEnergy: newMaxEnergy
      }));
    }
  };

  // Inventory state
  const queryClient = useQueryClient();
  const [itemSearch, setItemSearch] = useState("");
  const [itemSort, setItemSort] = useState("name-asc");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showManageTemplates, setShowManageTemplates] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showItemDetail, setShowItemDetail] = useState(false);
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());
  const [isEditingItem, setIsEditingItem] = useState(false);
  const [editItemData, setEditItemData] = useState<any>(null);
  
  // Magic/Spell state
  const [spellSearch, setSpellSearch] = useState("");
  const [spellEnergyFilter, setSpellEnergyFilter] = useState("all");
  const [spellActionTypeFilter, setSpellActionTypeFilter] = useState("all");
  const [spellSort, setSpellSort] = useState("name-asc");
  const [showAddSpell, setShowAddSpell] = useState(false);
  const [spellDialogTab, setSpellDialogTab] = useState<'library' | 'create'>('library');
  const [selectedSpell, setSelectedSpell] = useState<any>(null);
  const [showSpellDetail, setShowSpellDetail] = useState(false);
  const [isEditingSpell, setIsEditingSpell] = useState(false);
  const [editSpellData, setEditSpellData] = useState<any>(null);
  const [showSpellDeleteConfirm, setShowSpellDeleteConfirm] = useState(false);
  const [showSpellLibrary, setShowSpellLibrary] = useState(false);
  const [spellLibrarySearch, setSpellLibrarySearch] = useState('');
  const [showSpellImageBrowser, setShowSpellImageBrowser] = useState(false);
  const [spellActionTypeLibraryFilter, setSpellActionTypeLibraryFilter] = useState('all');
  const [spellEnergyLibraryFilter, setSpellEnergyLibraryFilter] = useState('all');
  const [spellDamageTypeLibraryFilter, setSpellDamageTypeLibraryFilter] = useState('all');
  const [spellAttributeLibraryFilter, setSpellAttributeLibraryFilter] = useState('all');
  const [spellAoeLibraryFilter, setSpellAoeLibraryFilter] = useState('all');
  const [spellDurationLibraryFilter, setSpellDurationLibraryFilter] = useState('all');

  const hasActiveSpellLibraryFilters = spellActionTypeLibraryFilter !== 'all' || 
    spellEnergyLibraryFilter !== 'all' || 
    spellDamageTypeLibraryFilter !== 'all' || 
    spellAttributeLibraryFilter !== 'all' || 
    spellAoeLibraryFilter !== 'all' || 
    spellDurationLibraryFilter !== 'all';

  const clearSpellLibraryFilters = () => {
    setSpellActionTypeLibraryFilter('all');
    setSpellEnergyLibraryFilter('all');
    setSpellDamageTypeLibraryFilter('all');
    setSpellAttributeLibraryFilter('all');
    setSpellAoeLibraryFilter('all');
    setSpellDurationLibraryFilter('all');
  };

  const spellDurationOptions = ['Instant', '1 round', '1 minute', '10 minutes', '1 hour', '8 hours', '24 hours', 'Until dispelled'];
  const [spellFormData, setSpellFormData] = useState<{
    name: string;
    description: string;
    image: string;
    castingTime: string;
    range: number | string;
    duration: string;
    damageType: string;
    damageDice: string;
    attribute: string;
    energyCost: number | string;
    isAoe: boolean;
    aoeRange: number | string;
    aoeShape: string;
    isAttack: boolean;
    gainEnergy: boolean;
  }>({
    name: '',
    description: '',
    image: '',
    castingTime: 'action',
    range: 30,
    duration: 'Instant',
    damageType: '',
    damageDice: '',
    attribute: '',
    energyCost: 1,
    isAoe: false,
    aoeRange: '',
    aoeShape: '',
    isAttack: true,
    gainEnergy: false,
  });
  
  const spellDamageTypes = ['Sharp', 'Blunt', 'Piercing', 'Flame', 'Frost', 'Storm', 'Tide', 'Stone', 'Flux', 'Light', 'Dark', 'Sound', 'Health', 'Energy'];
  const spellAttributes = ['might', 'finesse', 'wit', 'presence', 'will', 'craft'];
  
  const normalizeCastingTime = (ct: string | undefined | null): string => {
    if (!ct) return 'action';
    const lower = ct.toLowerCase();
    if (lower.includes('bonus')) return 'bonus action';
    return 'action';
  };

  const normalizeDuration = (d: string | undefined | null): string => {
    if (!d) return 'Instant';
    if (d.toLowerCase() === 'instantaneous' || d.toLowerCase() === 'instant') return 'Instant';
    return d;
  };
  
  useEffect(() => {
    if (editSpellData) {
      setSpellFormData({
        name: editSpellData.name || '',
        description: editSpellData.description || '',
        image: editSpellData.image || '',
        castingTime: normalizeCastingTime(editSpellData.castingTime),
        range: editSpellData.range ?? 30,
        duration: normalizeDuration(editSpellData.duration),
        damageType: editSpellData.damageType || '',
        damageDice: editSpellData.damage || editSpellData.damageDice || '',
        attribute: editSpellData.attribute || '',
        energyCost: editSpellData.energyCost ?? 1,
        isAoe: editSpellData.isAoe || false,
        aoeRange: editSpellData.aoeRange ?? '',
        aoeShape: editSpellData.aoeShape || '',
        isAttack: editSpellData.isAttack !== false,
        gainEnergy: editSpellData.gainEnergy || false,
      });
    } else if (showAddSpell && spellDialogTab === 'create') {
      setSpellFormData({
        name: '',
        description: '',
        image: '',
        castingTime: 'action',
        range: 30,
        duration: 'Instant',
        damageType: '',
        damageDice: '',
        attribute: '',
        energyCost: 1,
        isAoe: false,
        aoeRange: '',
        aoeShape: '',
        isAttack: true,
        gainEnergy: false,
      });
    }
  }, [editSpellData, showAddSpell, spellDialogTab]);
  
  const handleSpellNumericChange = (field: string, value: string) => {
    setSpellFormData({ ...spellFormData, [field]: value === '' ? '' : parseInt(value) });
  };
  
  const handleSpellFormSubmit = () => {
    if (!spellFormData.name.trim()) {
      toast({ title: 'Error', description: 'Spell name is required', variant: 'destructive' });
      return;
    }
    if (spellFormData.isAoe && !spellFormData.aoeShape) {
      toast({ title: 'Error', description: 'Please select an AoE shape', variant: 'destructive' });
      return;
    }
    const normalizeNone = (val: string) => val === '_none' ? '' : val;
    const optionalNum = (val: string | number): number | undefined => {
      if (val === '' || val === undefined || val === null) return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };
    
    const spellData = {
      name: spellFormData.name,
      description: spellFormData.description,
      image: spellFormData.image || undefined,
      castingTime: spellFormData.castingTime,
      range: Number(spellFormData.range) || 30,
      duration: spellFormData.duration,
      damageType: normalizeNone(spellFormData.damageType),
      damage: spellFormData.damageDice,
      damageDice: spellFormData.damageDice,
      attribute: normalizeNone(spellFormData.attribute),
      energyCost: Number(spellFormData.energyCost) || 1,
      isAoe: spellFormData.isAoe,
      aoeRange: spellFormData.isAoe ? optionalNum(spellFormData.aoeRange) : undefined,
      aoeShape: spellFormData.isAoe ? spellFormData.aoeShape : undefined,
      isAttack: spellFormData.isAttack,
      gainEnergy: spellFormData.damageType === 'Energy' ? spellFormData.gainEnergy : false,
    };

    if (editSpellData) {
      updateSpellMutation.mutate({ id: editSpellData.id, data: spellData });
    } else {
      createSpellMutation.mutate(spellData);
    }
  };
  
  const [rollPanelOpen, setRollPanelOpen] = useState(false);
  const [rollPanelData, setRollPanelData] = useState<{name: string, modifier: number, type: 'skill' | 'attribute'} | null>(null);
  const [extraModifier, setExtraModifier] = useState(0);
  const [hasAdvantage, setHasAdvantage] = useState(false);
  const [hasDisadvantage, setHasDisadvantage] = useState(false);
  const rollDataRef = useRef<{name: string, modifier: number} | null>(null);
  
  // Level-up HP state
  const [showLevelUpHpDialog, setShowLevelUpHpDialog] = useState(false);
  const [levelUpHpResult, setLevelUpHpResult] = useState<{diceRolls: number[], total: number, diceCount: number, dieSize: number, forLevel: number} | null>(null);
  const [rollingHpLevel, setRollingHpLevel] = useState(2);
  const [targetHpLevel, setTargetHpLevel] = useState(2); // Track target level at dialog open
  
  // Level-up Energy state
  const [showLevelUpEnergyDialog, setShowLevelUpEnergyDialog] = useState(false);
  const [levelUpEnergyResult, setLevelUpEnergyResult] = useState<{diceRolls: number[], total: number, diceCount: number, dieSize: number, forLevel: number} | null>(null);
  const [rollingEnergyLevel, setRollingEnergyLevel] = useState(2);
  const [targetEnergyLevel, setTargetEnergyLevel] = useState(2); // Track target level at dialog open
  
  // Feat tree viewer state
  const [showFeatTreeViewer, setShowFeatTreeViewer] = useState(false);
  
  // Calculate if character can level up HP (level > lastLevelUpRolled)
  const canLevelUpHp = (liveCharacter.level || 1) > (liveCharacter.lastLevelUpRolled || 1);
  const missedHpLevels = Math.max(0, (liveCharacter.level || 1) - (liveCharacter.lastLevelUpRolled || 1));
  
  // Calculate if character can level up Energy (level > lastEnergyLevelUpRolled)
  const canLevelUpEnergy = (liveCharacter.level || 1) > (liveCharacter.lastEnergyLevelUpRolled || 1);
  const missedEnergyLevels = Math.max(0, (liveCharacter.level || 1) - (liveCharacter.lastEnergyLevelUpRolled || 1));
  
  // Get current species for HP and Energy per level calculation
  const currentSpecies = systemSpecies.find((s: SystemSpecies) => s.name === liveCharacter.race);
  const hpPerLevel = currentSpecies?.hpPerLevel || 5; // Default to d5 if no species found
  const energyPerLevel = (currentSpecies as any)?.energyPerLevel || 6; // Default to d6 if no species found
  
  // Auto-correct character stats when species data loads and there's a mismatch
  // This fixes characters created before species data was properly configured
  // IMPORTANT: Must account for both HP and Energy level-up bonuses
  const hasAutoCorrectRef = useRef(false);
  useEffect(() => {
    if (hasAutoCorrectRef.current || !currentSpecies || !liveCharacter.id) return;
    
    const bonusHp = liveCharacter.bonusHpFromLevelUps || 0;
    const bonusEnergy = liveCharacter.bonusEnergyFromLevelUps || 0;
    const expectedMaxHp = currentSpecies.startingMaxHp + bonusHp;
    const expectedMaxEnergy = currentSpecies.startingMaxEnergy + bonusEnergy;
    
    // Check if there's a mismatch that needs correction
    const hpMismatch = liveCharacter.maxHp !== expectedMaxHp;
    const energyMismatch = liveCharacter.maxEnergy !== expectedMaxEnergy;
    
    if (hpMismatch || energyMismatch) {
      hasAutoCorrectRef.current = true;
      
      // Calculate corrected values
      const correctedMaxHp = expectedMaxHp;
      const correctedHp = Math.min(liveCharacter.hp || currentSpecies.startingHp, correctedMaxHp);
      const correctedMaxEnergy = expectedMaxEnergy;
      const correctedEnergy = Math.min(liveCharacter.energy || currentSpecies.startingEnergy, correctedMaxEnergy);
      
      // Update local state
      setOverviewData(prev => ({
        ...prev,
        hp: correctedHp,
        maxHp: correctedMaxHp,
        energy: correctedEnergy,
        maxEnergy: correctedMaxEnergy
      }));
      
      // Also update liveCharacter
      setLiveCharacter((prev: any) => ({
        ...prev,
        hp: correctedHp,
        maxHp: correctedMaxHp,
        energy: correctedEnergy,
        maxEnergy: correctedMaxEnergy
      }));
      
      // Save the corrected values to the database
      api.updateCharacter(liveCharacter.id, {
        hp: correctedHp,
        maxHp: correctedMaxHp,
        energy: correctedEnergy,
        maxEnergy: correctedMaxEnergy
      }).then(() => {
        if (campaignId) {
          queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
        }
      });
    }
  }, [currentSpecies, liveCharacter.id, liveCharacter.maxHp, liveCharacter.maxEnergy, liveCharacter.bonusHpFromLevelUps, liveCharacter.bonusEnergyFromLevelUps]);
  
  // Calculate dice count for HP: 1 base + 1 extra every 3 levels
  const calculateDiceCount = (level: number) => {
    return 1 + Math.floor((level - 1) / 3);
  };
  
  // Calculate dice count for Energy: 2d6 when level is divisible by 3, otherwise 1d6
  const calculateEnergyDiceCount = (level: number) => {
    return level % 3 === 0 ? 2 : 1;
  };
  
  // Handle level-up HP roll - auto-confirms immediately
  const handleLevelUpHpRoll = () => {
    // Roll for the current rolling level (not character's current level)
    const diceCount = calculateDiceCount(rollingHpLevel);
    
    // Roll the dice
    const diceRolls: number[] = [];
    for (let i = 0; i < diceCount; i++) {
      diceRolls.push(Math.floor(Math.random() * hpPerLevel) + 1);
    }
    const total = diceRolls.reduce((sum, roll) => sum + roll, 0);
    
    // Set result for display
    const result = {
      diceRolls,
      total,
      diceCount,
      dieSize: hpPerLevel,
      forLevel: rollingHpLevel
    };
    setLevelUpHpResult(result);
    
    // Auto-confirm: immediately save to database
    const newBonusHp = (liveCharacter.bonusHpFromLevelUps || 0) + total;
    const newMaxHp = (currentSpecies?.startingMaxHp || 10) + newBonusHp;
    
    updateCharacterMutation.mutate({
      bonusHpFromLevelUps: newBonusHp,
      lastLevelUpRolled: rollingHpLevel,
      maxHp: newMaxHp,
      hp: Math.min(liveCharacter.hp + total, newMaxHp)
    });
    
    // Send to chat as a dice roll notification
    gameWs.sendDiceRoll(`d${hpPerLevel}`, total, `Level ${rollingHpLevel} HP Roll`, liveCharacter.id);
    
    // Advance to next level for next roll
    setRollingHpLevel(prev => prev + 1);
  };
  
  // Handle level-up Energy roll - auto-confirms immediately
  const handleLevelUpEnergyRoll = () => {
    // Roll for the current rolling level (not character's current level)
    const diceCount = calculateEnergyDiceCount(rollingEnergyLevel);
    
    // Roll the dice using species-specific energy die size
    const diceRolls: number[] = [];
    for (let i = 0; i < diceCount; i++) {
      diceRolls.push(Math.floor(Math.random() * energyPerLevel) + 1);
    }
    const total = diceRolls.reduce((sum, roll) => sum + roll, 0);
    
    // Set result for display
    const result = {
      diceRolls,
      total,
      diceCount,
      dieSize: energyPerLevel,
      forLevel: rollingEnergyLevel
    };
    setLevelUpEnergyResult(result);
    
    // Auto-confirm: immediately save to database
    const newBonusEnergy = (liveCharacter.bonusEnergyFromLevelUps || 0) + total;
    const newMaxEnergy = (currentSpecies?.startingMaxEnergy || 10) + newBonusEnergy;
    
    updateCharacterMutation.mutate({
      bonusEnergyFromLevelUps: newBonusEnergy,
      lastEnergyLevelUpRolled: rollingEnergyLevel,
      maxEnergy: newMaxEnergy,
      energy: Math.min(liveCharacter.energy + total, newMaxEnergy)
    });
    
    // Send to chat as a dice roll notification
    gameWs.sendDiceRoll(`d${energyPerLevel}`, total, `Level ${rollingEnergyLevel} Energy Roll`, liveCharacter.id);
    
    // Advance to next level for next roll
    setRollingEnergyLevel(prev => prev + 1);
  };
  
  // Permission flags:
  // - canEditSheet: Can modify existing character data (attributes, skills, biography, etc.)
  // - canAddContent: Can add new items, spells, custom skills, traits (owner/GM only)
  const canEditSheet = isOwner || isGM || accessLevel === 'edit';
  const canAddContent = isOwner || isGM;
  
  // Legacy alias for backwards compatibility with hotbar components
  const canEdit = canEditSheet;
  
  // Skill to Attribute mapping for CharacterSheet
  const SKILL_ATTRIBUTE_MAP: Record<string, keyof typeof liveCharacter> = {
    // Might (mig)
    'Strength': 'might',
    // Finesse (fin)
    'Agility': 'finesse',
    'Sleight of Hand': 'finesse',
    'Stealth': 'finesse',
    // Wit (wit)
    'Arcana': 'wit',
    'History': 'wit',
    'Investigation': 'wit',
    'Perception': 'wit',
    'Wisdom': 'wit',
    'Culture': 'wit',
    // Presence (pre)
    'Charisma': 'presence',
    'Deception': 'presence',
    'Intimidation': 'presence',
    // Craft (cra)
    'Medicine': 'craft',
    // Will (wil)
    'Concentration': 'will',
    'Survival': 'will',
    'Beast Handling': 'will',
  };
  
  // Calculate advantage type: if both ADV and DIS are checked, they cancel out
  const getAdvantageType = (): 'none' | 'advantage' | 'disadvantage' => {
    if (hasAdvantage && hasDisadvantage) return 'none'; // Cancel out
    if (hasAdvantage) return 'advantage';
    if (hasDisadvantage) return 'disadvantage';
    return 'none';
  };
  
  const handleRoll = (name: string, modifier: number, extraMod: number = 0, advantage: 'none' | 'advantage' | 'disadvantage' = 'none', isSkill: boolean = false) => {
    // For skills, add the parent attribute modifier
    let totalMod = modifier + extraMod;
    let attributeValue = 0;
    
    if (isSkill) {
      const attributeKey = SKILL_ATTRIBUTE_MAP[name];
      if (!attributeKey) {
        console.warn(`[CharacterSheet] Unknown skill "${name}" - no attribute mapping found, using 0 modifier`);
      }
      if (attributeKey && typeof liveCharacter[attributeKey] === 'number') {
        attributeValue = liveCharacter[attributeKey] as number;
        totalMod += attributeValue;
      }
    }
    
    // Use d30 if attribute >= 5 (for skills, use the parent attribute; for attributes, use the value itself)
    const checkValue = isSkill ? attributeValue : modifier;
    const dieType = checkValue >= 5 ? 'd30' : 'd20';
    
    gameWs.sendDiceRoll(dieType, totalMod, name, liveCharacter.id, advantage);
    setRollPanelOpen(false);
    setExtraModifier(0);
    setHasAdvantage(false);
    setHasDisadvantage(false);
  };
  
  const confirmRollFromPanel = () => {
    if (rollDataRef.current && rollPanelData) {
      const { name, modifier } = rollDataRef.current;
      const isSkill = rollPanelData.type === 'skill';
      handleRoll(name, modifier, extraModifier, getAdvantageType(), isSkill);
    }
  };
  
  const openRollPanel = (name: string, modifier: number, type: 'skill' | 'attribute') => {
    rollDataRef.current = { name, modifier };
    setRollPanelData({ name, modifier, type });
    setExtraModifier(0);
    setHasAdvantage(false);
    setHasDisadvantage(false);
    setRollPanelOpen(true);
  };

  // Fetch items
  const { data: items = [] } = useQuery({
    queryKey: ['items', character.id],
    queryFn: () => api.getItems(character.id),
    enabled: !!character.id
  });

  // Fetch hotbars for weight calculation (container bonus when equipped in utility)
  const { data: hotbars = [] } = useQuery({
    queryKey: ['hotbars', character.id],
    queryFn: () => api.getHotbars(character.id),
    enabled: !!character.id
  });

  // Calculate total DC from equipped armor
  const calculateArmorBonus = () => {
    const armorHotbars = hotbars.filter((h: any) => h.hotbarType === 'armor' && h.itemId);
    let totalArmorBonus = 0;
    armorHotbars.forEach((hotbar: any) => {
      const armorItem = items.find((item: any) => item.id === hotbar.itemId);
      if (armorItem?.armorBonus) {
        totalArmorBonus += armorItem.armorBonus;
      }
    });
    return totalArmorBonus;
  };

  const equippedArmorBonus = calculateArmorBonus();
  const totalDC = (liveCharacter.sizeBonus || 0) + (liveCharacter.naturalArmor || 5) + equippedArmorBonus + featBonuses.dc;

  // Custom skill mutations
  const addCustomSkillMutation = useMutation({
    mutationFn: (skillData: Partial<CharacterCustomSkill>) => api.addCharacterCustomSkill(character.id, skillData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-custom-skills', character.id] });
      toast({
        title: "Skill Added",
        description: "Custom skill has been added to character",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add custom skill",
        variant: "destructive",
      });
    }
  });

  const updateCustomSkillMutation = useMutation({
    mutationFn: ({ skillId, data }: { skillId: string; data: Partial<CharacterCustomSkill> }) => 
      api.updateCharacterCustomSkill(character.id, skillId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-custom-skills', character.id] });
      setEditingCustomSkill(null);
      toast({
        title: "Skill Updated",
        description: "Custom skill has been updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update custom skill",
        variant: "destructive",
      });
    }
  });

  const removeCustomSkillMutation = useMutation({
    mutationFn: (skillId: string) => api.removeCharacterCustomSkill(character.id, skillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-custom-skills', character.id] });
      toast({
        title: "Skill Removed",
        description: "Custom skill has been removed from character",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove custom skill",
        variant: "destructive",
      });
    }
  });

  // Trait mutations
  const addTraitMutation = useMutation({
    mutationFn: (traitData: Partial<CharacterTrait>) => api.addCharacterTrait(character.id, traitData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-traits', character.id] });
      toast({
        title: "Trait Added",
        description: "Trait has been added to character",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add trait",
        variant: "destructive",
      });
    }
  });

  const updateTraitMutation = useMutation({
    mutationFn: ({ traitId, data }: { traitId: string; data: Partial<CharacterTrait> }) => 
      api.updateCharacterTrait(character.id, traitId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-traits', character.id] });
      setEditingTrait(null);
      toast({
        title: "Trait Updated",
        description: "Trait has been updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update trait",
        variant: "destructive",
      });
    }
  });

  const removeTraitMutation = useMutation({
    mutationFn: (traitId: string) => api.removeCharacterTrait(character.id, traitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-traits', character.id] });
      toast({
        title: "Trait Removed",
        description: "Trait has been removed from character",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove trait",
        variant: "destructive",
      });
    }
  });

  const useTraitMutation = useMutation({
    mutationFn: (traitId: string) => api.useCharacterTrait(character.id, traitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character-traits', character.id] });
      toast({
        title: "Trait Used",
        description: "Trait use recorded",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to use trait",
        variant: "destructive",
      });
    }
  });

  // Save to admin library mutation (admin only)
  const [showSaveToLibrary, setShowSaveToLibrary] = useState(false);
  const saveToLibraryMutation = useMutation({
    mutationFn: (folderId: string | null) => 
      fetch(`/api/admin/character-templates/from-character/${character.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ folderId }),
      }).then(res => {
        if (!res.ok) throw new Error('Failed to save to library');
        return res.json();
      }),
    onSuccess: () => {
      setShowSaveToLibrary(false);
      toast({
        title: "Saved to Library",
        description: "Character has been copied to the admin template library",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save character to library",
        variant: "destructive",
      });
    }
  });

  // Item mutations
  const createItemMutation = useMutation({
    mutationFn: (itemData: any) => api.createItem(character.id, itemData),
    onMutate: async (newItemData: any) => {
      await queryClient.cancelQueries({ queryKey: ['items', character.id] });
      const previousItems = queryClient.getQueryData(['items', character.id]);
      
      const tempId = `temp-${Date.now()}`;
      const optimisticItem = {
        ...newItemData,
        id: tempId,
        characterId: character.id,
      };
      
      queryClient.setQueryData(['items', character.id], (old: any[] = []) => [...old, optimisticItem]);
      
      return { previousItems, tempId };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(['items', character.id], context.previousItems);
      }
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      toast({
        title: "Item Added",
        description: "Item has been added to inventory",
      });
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateItem(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['items', character.id] });
      const previousItems = queryClient.getQueryData(['items', character.id]);
      
      queryClient.setQueryData(['items', character.id], (old: any[] = []) => 
        old.map((item: any) => item.id === id ? { ...item, ...data } : item)
      );
      
      return { previousItems };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(['items', character.id], context.previousItems);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      setShowItemDetail(false);
      setSelectedItem(null);
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onMutate: async (deletedId: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['items', character.id] });
      
      // Snapshot the previous value
      const previousItems = queryClient.getQueryData(['items', character.id]);
      
      // Optimistically remove the item and any children (for containers)
      queryClient.setQueryData(['items', character.id], (old: any[]) => {
        if (!old) return [];
        // Get all IDs to remove (the item itself + any items inside if it's a container)
        const idsToRemove = new Set<string>();
        idsToRemove.add(deletedId);
        
        // Find all nested children recursively
        const findChildren = (parentId: string) => {
          old.forEach((item: any) => {
            if (item.containerId === parentId) {
              idsToRemove.add(item.id);
              findChildren(item.id);
            }
          });
        };
        findChildren(deletedId);
        
        return old.filter((item: any) => !idsToRemove.has(item.id));
      });
      
      return { previousItems };
    },
    onError: (err, deletedId, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData(['items', character.id], context.previousItems);
      }
    },
    onSettled: () => {
      // Refetch to ensure sync with server
      queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      setShowItemDetail(false);
      setSelectedItem(null);
    }
  });

  // Fetch spells
  const { data: spells = [] } = useQuery({
    queryKey: ['spells', character.id],
    queryFn: () => api.getSpells(character.id),
    enabled: !!character.id
  });

  // Fetch system spell library for adding from library - cached for 5 minutes
  const { data: systemSpells = [] } = useQuery({
    queryKey: ['system-spells'],
    queryFn: () => api.getSystemSpells(),
    staleTime: 5 * 60 * 1000,
  });

  // Spell mutations
  const createSpellMutation = useMutation({
    mutationFn: (spellData: any) => api.createSpell(character.id, spellData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spells', character.id] });
      setShowAddSpell(false);
      setEditSpellData(null);
      toast({ title: "Spell added successfully" });
    }
  });

  const updateSpellMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateSpell(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spells', character.id] });
      queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
      setShowSpellDetail(false);
      setSelectedSpell(null);
      setIsEditingSpell(false);
      setEditSpellData(null);
      toast({ title: "Spell updated successfully" });
    }
  });

  const deleteSpellMutation = useMutation({
    mutationFn: (id: string) => api.deleteSpell(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spells', character.id] });
      queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
      setShowSpellDetail(false);
      setSelectedSpell(null);
      toast({ title: "Spell deleted successfully" });
    }
  });

  // Character update mutation with immediate UI update
  const updateCharacterMutation = useMutation({
    mutationFn: (data: any) => api.updateCharacter(character.id, data),
    onMutate: (data: any) => {
      // Immediately update live character data for real-time display
      setLiveCharacter((prev: any) => ({ ...prev, ...data }));
    },
    onSuccess: (updatedChar: any) => {
      // Update with server response
      if (updatedChar) {
        setLiveCharacter(updatedChar);
      }
      // Invalidate the correct query key that Campaign.tsx uses
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
      }
      // Also invalidate individual character query if it exists
      queryClient.invalidateQueries({ queryKey: [`/api/characters/${character.id}`] });
      toast({ title: "Character updated successfully", duration: 1000 });
    },
    onError: (error: any) => {
      // Revert to original character on error
      setLiveCharacter(character);
      toast({ 
        title: "Update failed", 
        description: error.message || "Failed to update character",
        variant: "destructive" 
      });
    }
  });

  // Short Rest mutation
  const shortRestMutation = useMutation({
    mutationFn: () => api.shortRest(character.id),
    onSuccess: (result) => {
      if (result.character) {
        setLiveCharacter(result.character);
      }
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
        queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      }
      // Restore short rest trait uses
      queryClient.invalidateQueries({ queryKey: ['character-traits', character.id] });
      const dieInfo = result.dieType ? ` (rolled ${result.hpRoll} on ${result.dieType})` : '';
      const energyInfo = result.energyRestored ? `, ${result.energyRestored} Energy` : '';
      toast({ 
        title: "Short Rest Complete", 
        description: `Restored ${result.hpRestored} HP${energyInfo}${dieInfo}. Consumed ${result.rationsConsumed} rations.` 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Short Rest Failed", 
        description: error.message || "Failed to perform short rest",
        variant: "destructive" 
      });
    }
  });

  // Long Rest mutation
  const longRestMutation = useMutation({
    mutationFn: () => api.longRest(character.id),
    onSuccess: (result) => {
      if (result.character) {
        setLiveCharacter(result.character);
      }
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/characters`] });
        queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      }
      // Reset trait uses after long rest
      queryClient.invalidateQueries({ queryKey: ['character-traits', character.id] });
      const exhaustionMsg = result.exhaustionRecovered > 0 ? ` Exhaustion reduced by ${result.exhaustionRecovered}.` : '';
      toast({ 
        title: "Long Rest Complete", 
        description: `Fully restored HP and Energy.${exhaustionMsg} Consumed ${result.rationsConsumed} rations.` 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Long Rest Failed", 
        description: error.message || "Failed to perform long rest",
        variant: "destructive" 
      });
    }
  });

  // Spell helper functions
  const getSpellLevelColor = (level: number): string => {
    if (level === 0) return 'text-gray-400';
    if (level <= 3) return 'text-blue-400';
    if (level <= 6) return 'text-purple-400';
    return 'text-amber-400';
  };

  const getSpellLevelBgColor = (level: number): string => {
    if (level === 0) return 'bg-gray-700';
    if (level <= 3) return 'bg-blue-700';
    if (level <= 6) return 'bg-purple-700';
    return 'bg-amber-700';
  };

  const getSchoolBadgeColor = (school?: string): string => {
    switch (school?.toLowerCase()) {
      case 'evocation': return 'bg-red-700 text-red-100';
      case 'abjuration': return 'bg-blue-700 text-blue-100';
      case 'conjuration': return 'bg-green-700 text-green-100';
      case 'divination': return 'bg-purple-700 text-purple-100';
      case 'enchantment': return 'bg-pink-700 text-pink-100';
      case 'illusion': return 'bg-cyan-700 text-cyan-100';
      case 'necromancy': return 'bg-stone-900 text-stone-100';
      case 'transmutation': return 'bg-orange-700 text-orange-100';
      default: return 'bg-stone-700 text-stone-100';
    }
  };

  // Calculate attribute modifiers
  const getAttributeModifier = (value: number) => {
    return Math.floor((value - 10) / 2);
  };

  // Format modifier with sign
  const formatModifier = (value: number) => {
    return value >= 0 ? `+${value}` : `${value}`;
  };

  // Helper functions for inventory
  const convertCurrency = (copper: number, silver: number, gold: number, platinum: number) => {
    let total = copper + (silver * 10) + (gold * 100) + (platinum * 1000);
    const p = Math.floor(total / 1000);
    total %= 1000;
    const g = Math.floor(total / 100);
    total %= 100;
    const s = Math.floor(total / 10);
    const c = total % 10;
    return { platinum: p, gold: g, silver: s, copper: c };
  };

  const stackItems = (items: any[]) => {
    const stacks = new Map<string, any>();
    for (const item of items) {
      const key = JSON.stringify({
        name: item.name,
        damage: item.damage,
        damageType: item.damageType,
        mod: item.mod,
        range: item.range,
        aoe: item.aoe,
        attribute: item.attribute,
        size: item.size,
        weight: item.weight,
        itemWeight: item.itemWeight,
        priceCopper: item.priceCopper,
        priceSilver: item.priceSilver,
        priceGold: item.priceGold,
        pricePlatinum: item.pricePlatinum,
        durability: item.durability,
        itemType: item.itemType,
        rarity: item.rarity,
        isContainer: item.isContainer,
        carryCapacity: item.carryCapacity,
        isEquipped: item.isEquipped,
      });
      if (stacks.has(key)) {
        const stack = stacks.get(key)!;
        stack.items.push(item);
        stack.totalQuantity += item.quantity;
      } else {
        stacks.set(key, {
          ...item,
          items: [item],
          totalQuantity: item.quantity,
        });
      }
    }
    return Array.from(stacks.values());
  };

  // Calculate total weight and currency
  // Total weight = sum of all items weight (including items in containers)
  const totalWeight = items.reduce((sum: number, item: any) => sum + (item.itemWeight * item.quantity), 0);
  
  // Container bonus only applies when container is equipped in utility hotbar
  const utilityHotbars = hotbars.filter((h: any) => h.hotbarType === 'utility' && h.itemId);
  const equippedContainerIds = new Set(utilityHotbars.map((h: any) => h.itemId));
  const equippedContainerBonus = items
    .filter((item: any) => item.isContainer && equippedContainerIds.has(item.id))
    .reduce((sum: number, item: any) => sum + (item.carryCapacity || 0), 0);
  
  const mightMod = character.might || 0; // Use new attribute system
  const baseCarryWeight = currentSpecies?.carryWeight || 50; // Get from species or default to 50
  const carryCapacity = baseCarryWeight + (mightMod * 10) + equippedContainerBonus;
  const weightPercentage = (totalWeight / carryCapacity) * 100;

  const totalCurrency = items.reduce((acc: any, item: any) => {
    return {
      copper: acc.copper + (item.priceCopper * item.quantity),
      silver: acc.silver + (item.priceSilver * item.quantity),
      gold: acc.gold + (item.priceGold * item.quantity),
      platinum: acc.platinum + (item.pricePlatinum * item.quantity),
    };
  }, { copper: 0, silver: 0, gold: 0, platinum: 0 });

  const displayCurrency = convertCurrency(
    totalCurrency.copper,
    totalCurrency.silver,
    totalCurrency.gold,
    totalCurrency.platinum
  );

  // Filter, search, and sort items
  let filteredItems = items;
  if (itemSearch) {
    filteredItems = filteredItems.filter((item: any) =>
      item.name.toLowerCase().includes(itemSearch.toLowerCase())
    );
  }
  if (itemTypeFilter !== "all") {
    filteredItems = filteredItems.filter((item: any) => item.itemType === itemTypeFilter);
  }

  // Sort items
  filteredItems = [...filteredItems].sort((a: any, b: any) => {
    switch (itemSort) {
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "weight-low":
        return a.itemWeight - b.itemWeight;
      case "weight-high":
        return b.itemWeight - a.itemWeight;
      case "price-low":
        return (a.priceCopper + a.priceSilver*10 + a.priceGold*100 + a.pricePlatinum*1000) -
               (b.priceCopper + b.priceSilver*10 + b.priceGold*100 + b.pricePlatinum*1000);
      case "price-high":
        return (b.priceCopper + b.priceSilver*10 + b.priceGold*100 + b.pricePlatinum*1000) -
               (a.priceCopper + a.priceSilver*10 + a.priceGold*100 + a.pricePlatinum*1000);
      case "rarity":
        const rarityOrder: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
        return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
      default:
        return 0;
    }
  });

  const stackedItems = stackItems(filteredItems);

  // Container hierarchy builder with recursive nesting support
  const buildContainerHierarchy = (stackedItems: any[]) => {
    const itemMap = new Map<string, any>();
    const containerMap = new Map<string, any[]>();

    // First pass: create item map and identify children
    stackedItems.forEach((item: any) => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Second pass: organize by parent
    stackedItems.forEach((item: any) => {
      if (item.containerId && itemMap.has(item.containerId)) {
        if (!containerMap.has(item.containerId)) {
          containerMap.set(item.containerId, []);
        }
        containerMap.get(item.containerId)!.push(itemMap.get(item.id));
      }
    });

    // Third pass: attach children to containers recursively
    const attachChildren = (item: any): any => {
      if (item.isContainer) {
        item.children = (containerMap.get(item.id) || []).map(attachChildren);
      }
      return item;
    };

    // Get root items (no parent) and build hierarchy
    const rootItems = stackedItems
      .filter((item: any) => !item.containerId || !itemMap.has(item.containerId))
      .map((item: any) => attachChildren(itemMap.get(item.id)));

    return rootItems;
  };

  // Handle moving item to container via API
  const moveItemToContainer = async (itemId: string, containerId: string | null) => {
    try {
      await api.updateItem(itemId, { containerId });
      queryClient.invalidateQueries({ queryKey: ['items', character.id] });
    } catch (error: any) {
      console.error('Failed to move item:', error);
    }
  };

  const toggleContainer = (containerId: string) => {
    setExpandedContainers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(containerId)) {
        newSet.delete(containerId);
      } else {
        newSet.add(containerId);
      }
      return newSet;
    });
  };

  const hierarchicalItems = buildContainerHierarchy(stackedItems);

  // Calculate HP/Energy percentages
  const hpPercentage = (character.hp / character.maxHp) * 100;
  const energyPercentage = (character.energy / character.maxEnergy) * 100;

  const handleSaveBiography = () => {
    if (onUpdate) {
      onUpdate({ biography });
    }
    setIsEditingBio(false);
  };

  const handleSaveGmNotes = () => {
    if (onUpdate) {
      onUpdate({ gmNotes });
    }
    setIsEditingGmNotes(false);
  };

  // Portrait upload and cropping handlers
  const handlePortraitUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
        setShowPortraitCrop(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageLoad = () => {
    if (cropImageRef.current) {
      const img = cropImageRef.current;
      const imgWidth = img.width;
      const imgHeight = img.height;
      setImageDimensions({ width: imgWidth, height: imgHeight });
      const minDim = Math.min(imgWidth, imgHeight);
      const initialSize = Math.min(minDim, 200);
      const centerX = Math.max(0, (imgWidth - initialSize) / 2);
      const centerY = Math.max(0, (imgHeight - initialSize) / 2);
      setCropPosition({ x: centerX, y: centerY, size: initialSize });
    }
  };

  const handleCropConfirm = () => {
    if (!uploadedImage || !cropImageRef.current) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = cropImageRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    
    const outputSize = 256;
    canvas.width = outputSize;
    canvas.height = outputSize;
    
    ctx.drawImage(
      img,
      cropPosition.x * scaleX,
      cropPosition.y * scaleY,
      cropPosition.size * scaleX,
      cropPosition.size * scaleY,
      0, 0, outputSize, outputSize
    );
    
    const croppedImage = canvas.toDataURL('image/jpeg', 0.9);
    if (onUpdate) {
      onUpdate({ portrait: croppedImage });
    }
    setShowPortraitCrop(false);
    setUploadedImage(null);
    if (portraitInputRef.current) {
      portraitInputRef.current.value = '';
    }
  };

  const handleCropCancel = () => {
    setShowPortraitCrop(false);
    setUploadedImage(null);
    if (portraitInputRef.current) {
      portraitInputRef.current.value = '';
    }
  };

  // Tab configuration matching battlemap sidebar icons and colors
  const tabConfig = [
    { value: 'overview', icon: User, color: 'stone', label: 'Overview' },
    { value: 'attributes', icon: BarChart3, color: 'blue', label: 'Attributes' },
    { value: 'skills', icon: Zap, color: 'green', label: 'Skills' },
    { value: 'inventory', icon: Backpack, color: 'amber', label: 'Inventory' },
    { value: 'magic', icon: Sparkles, color: 'purple', label: 'Magic' },
    { value: 'hotbars', icon: Grid3X3, color: 'red', label: 'Hotbars' },
    { value: 'background', icon: ScrollText, color: 'cyan', label: 'Background' },
  ];

  const getTabColorClasses = (color: string) => {
    const colors: Record<string, { base: string; active: string }> = {
      stone: { 
        base: 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50',
        active: 'data-[state=active]:bg-stone-700 data-[state=active]:text-stone-100 data-[state=active]:border-stone-500'
      },
      blue: { 
        base: 'text-blue-400/70 hover:text-blue-300 hover:bg-blue-900/30',
        active: 'data-[state=active]:bg-blue-900/80 data-[state=active]:text-blue-200 data-[state=active]:border-blue-500'
      },
      green: { 
        base: 'text-green-400/70 hover:text-green-300 hover:bg-green-900/30',
        active: 'data-[state=active]:bg-green-900/80 data-[state=active]:text-green-200 data-[state=active]:border-green-500'
      },
      amber: { 
        base: 'text-amber-400/70 hover:text-amber-300 hover:bg-amber-900/30',
        active: 'data-[state=active]:bg-amber-900/80 data-[state=active]:text-amber-200 data-[state=active]:border-amber-500'
      },
      purple: { 
        base: 'text-purple-400/70 hover:text-purple-300 hover:bg-purple-900/30',
        active: 'data-[state=active]:bg-purple-900/80 data-[state=active]:text-purple-200 data-[state=active]:border-purple-500'
      },
      red: { 
        base: 'text-red-400/70 hover:text-red-300 hover:bg-red-900/30',
        active: 'data-[state=active]:bg-red-900/80 data-[state=active]:text-red-200 data-[state=active]:border-red-500'
      },
      cyan: { 
        base: 'text-cyan-400/70 hover:text-cyan-300 hover:bg-cyan-900/30',
        active: 'data-[state=active]:bg-cyan-900/80 data-[state=active]:text-cyan-200 data-[state=active]:border-cyan-500'
      },
    };
    return `${colors[color]?.base || ''} ${colors[color]?.active || ''}`;
  };

  // View-only mode: Show simplified character card with just name and portrait
  if (isViewOnly) {
    return (
      <div className="w-full flex-1 min-h-0 bg-stone-900 text-stone-200 flex flex-col overflow-hidden p-6">
        <Card className="bg-stone-800 border-stone-700 max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              {liveCharacter.portrait ? (
                <Avatar className="h-32 w-32 rounded-lg border-2 border-amber-500">
                  <AvatarImage src={liveCharacter.portrait} alt={liveCharacter.name} className="object-cover" />
                  <AvatarFallback className="text-2xl bg-stone-700 text-amber-500 rounded-lg">
                    {liveCharacter.name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="h-32 w-32 rounded-lg border-2 border-stone-600 bg-stone-700">
                  <AvatarFallback className="text-2xl text-amber-500 rounded-lg">
                    {liveCharacter.name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            <CardTitle className="text-amber-500 text-2xl" data-testid="text-character-name-viewonly">
              {liveCharacter.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-stone-400 text-sm space-y-2">
              <p className="flex items-center justify-center gap-2">
                <Eye className="h-4 w-4" />
                <span>View Access Only</span>
              </p>
              <p className="text-xs text-stone-500 mt-4">
                You can see this character's name but cannot view their stats, inventory, or other details.
                <br />
                Ask the GM for Ally or Control access to see more.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 min-h-0 bg-stone-900 text-stone-200 flex flex-col overflow-hidden">
      {/* Back button header for template/admin view */}
      {isTemplate && onClose && (
        <div className="flex items-center gap-3 px-4 py-3 bg-stone-950 border-b border-stone-700 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 hover:bg-stone-800"
            data-testid="button-back-to-templates"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Button>
          <span className="text-amber-500 font-medium">{liveCharacter.name}</span>
          {isTemplate && (
            <Badge className="bg-purple-600/30 text-purple-300 text-xs">Template</Badge>
          )}
        </div>
      )}
      <Tabs defaultValue={defaultTab} className="w-full flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Icon-based tabs matching battlemap sidebar - icons on mobile, icons+text on desktop */}
        <TabsList className="grid grid-cols-7 w-full bg-stone-950 border-b border-stone-700 shrink-0 h-auto p-1 gap-0.5 sm:gap-1">
          {tabConfig.map(({ value, icon: Icon, color, label }) => (
            <TabsTrigger 
              key={value}
              value={value} 
              data-testid={`tab-${value}`}
              aria-label={label}
              className={`
                w-full flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-lg border border-transparent
                transition-all duration-200 min-h-[44px] sm:min-h-[56px]
                data-[state=active]:shadow-md
                ${getTabColorClasses(color)}
              `}
            >
              <Icon className="h-5 w-5 sm:h-4 sm:w-4 shrink-0" />
              <span className="text-[9px] sm:text-xs mt-0.5 leading-tight font-medium truncate max-w-full">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Scrollable content area - entire sheet scrolls as one unit */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 custom-scrollbar">
          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4 mt-0" data-testid="content-overview">
            <Card className="bg-stone-800 border-stone-700">
              <CardHeader>
                <CardTitle className="text-amber-500 flex items-center justify-between">
                  {editingOverview ? (
                    <div className="flex-1 mr-4">
                      <Label className="text-xs text-stone-400 mb-1 block">Name</Label>
                      <Input
                        value={overviewData.name}
                        onChange={(e) => setOverviewData({ ...overviewData, name: e.target.value })}
                        className="bg-stone-900 border-stone-700 text-amber-500"
                        data-testid="input-edit-name"
                      />
                    </div>
                  ) : (
                    <span data-testid="text-character-name">{liveCharacter.name}</span>
                  )}
                  {!editingOverview ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {(isOwner || isGM) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-cyan-600 text-cyan-400 hover:bg-cyan-600/20"
                                onClick={() => shortRestMutation.mutate()}
                                disabled={shortRestMutation.isPending}
                                data-testid="button-short-rest"
                              >
                                <Coffee className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>Short Rest (2 rations, roll HP/Energy die)</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {(isOwner || isGM) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-indigo-600 text-indigo-400 hover:bg-indigo-600/20"
                                onClick={() => longRestMutation.mutate()}
                                disabled={longRestMutation.isPending}
                                data-testid="button-long-rest"
                              >
                                <Moon className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>Long Rest (4 rations, full HP/Energy, -1 exhaustion)</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {sceneId && (isOwner || isGM) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-amber-600 text-amber-500 hover:bg-amber-600/20"
                          onClick={() => {
                            gameWs.sendInitiativeRoll(sceneId, liveCharacter.id);
                          }}
                          data-testid="button-roll-initiative"
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Initiative
                        </Button>
                      )}
                      {(isOwner || isGM) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2"
                          onClick={() => {
                            setOverviewData({
                              name: liveCharacter.name,
                              level: liveCharacter.level,
                              hp: liveCharacter.hp,
                              maxHp: liveCharacter.maxHp,
                              energy: liveCharacter.energy,
                              maxEnergy: liveCharacter.maxEnergy,
                              race: liveCharacter.race || "Human",
                              size: liveCharacter.size || "Medium",
                              naturalArmor: liveCharacter.naturalArmor || 5,
                              sizeBonus: liveCharacter.sizeBonus || 0,
                              featTree: liveCharacter.featTree || "",
                              speed: liveCharacter.speed || 30,
                              flySpeed: liveCharacter.flySpeed || 0
                            });
                            setEditingOverview(true);
                          }}
                          data-testid="button-edit-overview"
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Portrait */}
                  {liveCharacter.portrait && (
                    <div className="w-32 h-32 rounded-lg overflow-hidden border-2 border-stone-700 shrink-0">
                      <img src={liveCharacter.portrait} alt={liveCharacter.name} className="w-full h-full object-cover" data-testid="img-portrait" />
                    </div>
                  )}
                  
                  {/* Basic Info */}
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Race Dropdown */}
                      <div>
                        <Label className="text-xs text-stone-400">Race</Label>
                        {editingOverview ? (
                          <Select value={overviewData.race} onValueChange={handleRaceChange}>
                            <SelectTrigger className="bg-stone-900 border-stone-700">
                              <SelectValue placeholder="Select race" />
                            </SelectTrigger>
                            <SelectContent>
                              {systemSpecies.map((species: SystemSpecies) => (
                                <SelectItem key={species.name} value={species.name}>{species.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-stone-200" data-testid="text-race">{liveCharacter.race}</p>
                        )}
                      </div>
                      {/* Level */}
                      <div>
                        <Label className="text-xs text-stone-400">Level</Label>
                        {editingOverview ? (
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={overviewData.level}
                            onChange={(e) => setOverviewData({ ...overviewData, level: e.target.value === '' ? '' : parseInt(e.target.value) })}
                            className="bg-stone-900 border-stone-700 text-stone-200"
                            data-testid="input-edit-level"
                          />
                        ) : (
                          <p className="text-stone-200">{liveCharacter.level}</p>
                        )}
                      </div>
                      {/* Size (auto-filled from race) */}
                      <div>
                        <Label className="text-xs text-stone-400">Size</Label>
                        <p className="text-stone-200" data-testid="text-size">
                          {editingOverview ? overviewData.size : liveCharacter.size}
                        </p>
                      </div>
                      {/* Natural Armor (auto-filled from race) */}
                      <div>
                        <Label className="text-xs text-stone-400">Natural Armor</Label>
                        <p className="text-stone-200" data-testid="text-natural-armor">
                          {editingOverview ? overviewData.naturalArmor : liveCharacter.naturalArmor}
                        </p>
                      </div>
                      {/* Size Bonus (auto-filled from race) */}
                      <div>
                        <Label className="text-xs text-stone-400">Size Bonus</Label>
                        <p className="text-stone-200" data-testid="text-size-bonus">
                          {editingOverview ? (overviewData.sizeBonus >= 0 ? `+${overviewData.sizeBonus}` : overviewData.sizeBonus) : (liveCharacter.sizeBonus >= 0 ? `+${liveCharacter.sizeBonus}` : liveCharacter.sizeBonus)}
                        </p>
                      </div>
                      {/* Speed (auto-filled from race) */}
                      <div>
                        <Label className="text-xs text-stone-400">Speed</Label>
                        <p className="text-stone-200" data-testid="text-speed">
                          {editingOverview ? overviewData.speed : liveCharacter.speed} ft
                        </p>
                      </div>
                      {/* Fly Speed (auto-filled from race) */}
                      <div>
                        <Label className="text-xs text-stone-400">Fly Speed</Label>
                        <p className="text-stone-200" data-testid="text-fly-speed">
                          {editingOverview ? overviewData.flySpeed : liveCharacter.flySpeed} ft
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Feat Tree Section - Full width below overview grid */}
                {featTreeId && (
                  <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 rounded-lg p-3 border border-purple-700/50">
                    <div className="flex justify-between items-center mb-2">
                      <Label className="text-sm text-purple-300 flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-purple-400" />
                        Feat Tree
                      </Label>
                      {(() => {
                        // Calculate feat points: 2 base + level + 2 * floor(level / 3)
                        // Level 1: 3, Level 2: 4, Level 3: 7, Level 4: 8, Level 5: 9, Level 6: 12, etc.
                        const level = liveCharacter.level || 1;
                        const totalPoints = 2 + level + (2 * Math.floor(level / 3));
                        // Calculate spent points from unlocked feats
                        const spentPoints = characterFeats.reduce((sum, cf) => {
                          const feat = featTreeData?.feats?.find((f: Feat) => f.id === cf.featId);
                          return sum + (feat?.cost || 0);
                        }, 0);
                        const remainingPoints = totalPoints - spentPoints;
                        
                        return (
                          <span className={`text-sm font-medium ${remainingPoints > 0 ? 'text-green-400' : 'text-stone-400'}`} data-testid="text-feat-points">
                            {remainingPoints} / {totalPoints} points
                          </span>
                        );
                      })()}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-purple-400 border-purple-600 hover:bg-purple-900/30"
                      onClick={() => setShowFeatTreeViewer(true)}
                      data-testid="button-view-feat-tree"
                    >
                      <GitBranch className="h-4 w-4 mr-2" />
                      View {featTreeData?.tree?.name || 'Feat Tree'}
                    </Button>
                  </div>
                )}

                {/* Defense Class (DC) Display */}
                <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 rounded-lg p-3 border border-cyan-700/50">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm text-cyan-300 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-cyan-400" />
                      Defense Class (DC)
                    </Label>
                    <span className="text-2xl font-bold text-cyan-400" data-testid="text-total-dc">
                      {totalDC}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-2 text-xs text-stone-400 flex-wrap">
                    <span>Size: {liveCharacter.sizeBonus >= 0 ? `+${liveCharacter.sizeBonus}` : liveCharacter.sizeBonus}</span>
                    <span>Natural: +{liveCharacter.naturalArmor || 5}</span>
                    <span>Armor: +{equippedArmorBonus}</span>
                    {featBonuses.dc > 0 && <span className="text-purple-400">Feats: +{featBonuses.dc}</span>}
                  </div>
                </div>

                {/* Exhaustion Display */}
                {(() => {
                  const exhaustion = liveCharacter.exhaustion || 0;
                  const exhaustionEffects: Record<number, string> = {
                    0: 'No effect',
                    1: '-10ft movement speed',
                    2: '-20ft movement speed, Disadvantage on skill checks',
                    3: '-30ft movement speed, Disadvantage on skill & attack rolls',
                    4: '-40ft movement speed, Disadvantage on all rolls, HP halved',
                    5: 'Death'
                  };
                  const exhaustionColors = [
                    'bg-stone-700', 'bg-yellow-800', 'bg-orange-700', 'bg-red-700',
                    'bg-red-800', 'bg-black'
                  ];
                  
                  return (
                    <div className={`rounded-lg p-3 border ${exhaustion > 0 ? 'border-red-700/50 bg-gradient-to-r from-red-900/30 to-orange-900/30' : 'border-stone-700/50 bg-stone-900/30'}`}>
                      <div className="flex justify-between items-center">
                        <Label className="text-sm text-stone-300 flex items-center gap-2">
                          <AlertTriangle className={`h-4 w-4 ${exhaustion > 0 ? 'text-red-500' : 'text-stone-500'}`} />
                          Exhaustion
                        </Label>
                        <div className="flex items-center gap-2">
                          {(isOwner || isGM) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                if (exhaustion > 0) {
                                  updateCharacterMutation.mutate({ exhaustion: exhaustion - 1 });
                                }
                              }}
                              disabled={exhaustion === 0}
                              data-testid="button-decrease-exhaustion"
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                          )}
                          <span className={`text-xl font-bold ${exhaustion > 0 ? 'text-red-400' : 'text-stone-400'}`} data-testid="text-exhaustion">
                            {exhaustion}
                          </span>
                          {(isOwner || isGM) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                if (exhaustion < 5) {
                                  updateCharacterMutation.mutate({ exhaustion: exhaustion + 1 });
                                }
                              }}
                              disabled={exhaustion === 5}
                              data-testid="button-increase-exhaustion"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {[0, 1, 2, 3, 4, 5].map(level => (
                          <div
                            key={level}
                            className={`flex-1 h-2 rounded ${level <= exhaustion ? exhaustionColors[level] : 'bg-stone-800'}`}
                            data-testid={`exhaustion-level-${level}`}
                          />
                        ))}
                      </div>
                      {exhaustion > 0 && (
                        <p className="text-xs text-red-400/80 mt-2" data-testid="text-exhaustion-effect">
                          {exhaustionEffects[exhaustion]}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* HP Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm text-stone-300 flex items-center gap-2">
                      <Heart className="h-4 w-4 text-red-500" />
                      Health Points
                    </Label>
                    {editingOverview ? (
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          min="0"
                          value={overviewData.hp}
                          onChange={(e) => setOverviewData({ ...overviewData, hp: e.target.value === '' ? '' : parseInt(e.target.value) })}
                          className="w-20 bg-stone-900 border-stone-700 text-stone-200"
                          data-testid="input-edit-hp"
                        />
                        <span className="text-sm">/</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="1"
                            value={overviewData.maxHp}
                            onChange={(e) => setOverviewData({ ...overviewData, maxHp: e.target.value === '' ? '' : parseInt(e.target.value) })}
                            className={`w-20 bg-stone-900 text-stone-200 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                            disabled={!isGM}
                            data-testid="input-edit-max-hp"
                          />
                          {!isGM && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Lock className="h-3 w-3 text-amber-600" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Only GMs can edit Max HP</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm font-bold" data-testid="text-hp">
                        {Math.min(liveCharacter.hp, effectiveMaxHp)} / {effectiveMaxHp}
                      </span>
                    )}
                  </div>
                  {!editingOverview && <Progress value={Math.min(100, Math.round((liveCharacter.hp / effectiveMaxHp) * 100))} className="h-3" data-testid="progress-hp" />}
                  
                  {/* HP Breakdown and Level-Up Button */}
                  {!editingOverview && (
                    <div className="mt-2 space-y-2">
                      {/* HP Breakdown */}
                      <div className="text-xs text-stone-500 flex items-center justify-between" data-testid="text-hp-breakdown">
                        <span>
                          Base: {currentSpecies?.startingMaxHp || 10} | Bonus: +{liveCharacter.bonusHpFromLevelUps || 0}
                          {featBonuses.hp > 0 && <span className="text-purple-400"> | Feats: +{featBonuses.hp}</span>}
                        </span>
                        <span className="text-stone-400">
                          ({calculateDiceCount(liveCharacter.level || 1)}d{hpPerLevel} at level {liveCharacter.level || 1})
                        </span>
                      </div>
                      
                      {/* Level Up HP Button - shows when level > lastLevelUpRolled */}
                      {canLevelUpHp && canEdit && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setLevelUpHpResult(null);
                            setRollingHpLevel((liveCharacter.lastLevelUpRolled || 1) + 1);
                            setTargetHpLevel(liveCharacter.level || 1); // Capture target at dialog open
                            setShowLevelUpHpDialog(true);
                          }}
                          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white"
                          data-testid="button-level-up-hp"
                        >
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Roll HP{missedHpLevels > 1 ? ` (${missedHpLevels} levels)` : ` - Level ${(liveCharacter.lastLevelUpRolled || 1) + 1}`}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Energy Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm text-stone-300 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-500" />
                      Energy
                    </Label>
                    {editingOverview ? (
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          min="0"
                          value={overviewData.energy}
                          onChange={(e) => setOverviewData({ ...overviewData, energy: e.target.value === '' ? '' : parseInt(e.target.value) })}
                          className="w-20 bg-stone-900 border-stone-700 text-stone-200"
                          data-testid="input-edit-energy"
                        />
                        <span className="text-sm">/</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            value={overviewData.maxEnergy}
                            onChange={(e) => setOverviewData({ ...overviewData, maxEnergy: e.target.value === '' ? '' : parseInt(e.target.value) })}
                            className={`w-20 bg-stone-900 text-stone-200 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                            disabled={!isGM}
                            data-testid="input-edit-max-energy"
                          />
                          {!isGM && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Lock className="h-3 w-3 text-amber-600" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Only GMs can edit Max Energy</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm font-bold" data-testid="text-energy">
                        {Math.min(liveCharacter.energy, effectiveMaxEnergy)} / {effectiveMaxEnergy}
                      </span>
                    )}
                  </div>
                  {!editingOverview && <Progress value={Math.min(100, Math.round((liveCharacter.energy / effectiveMaxEnergy) * 100))} className="h-3" data-testid="progress-energy" />}
                  
                  {/* Energy Breakdown and Level-Up Button */}
                  {!editingOverview && (
                    <div className="mt-2 space-y-2">
                      {/* Energy Breakdown */}
                      <div className="text-xs text-stone-500 flex items-center justify-between" data-testid="text-energy-breakdown">
                        <span>
                          Base: {currentSpecies?.startingMaxEnergy || 10} | Bonus: +{liveCharacter.bonusEnergyFromLevelUps || 0}
                          {featBonuses.energy > 0 && <span className="text-purple-400"> | Feats: +{featBonuses.energy}</span>}
                        </span>
                        <span className="text-stone-400">
                          ({calculateEnergyDiceCount(liveCharacter.level || 1)}d6 at level {liveCharacter.level || 1})
                        </span>
                      </div>
                      
                      {/* Level Up Energy Button - shows when level > lastEnergyLevelUpRolled */}
                      {canLevelUpEnergy && canEdit && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setLevelUpEnergyResult(null);
                            setRollingEnergyLevel((liveCharacter.lastEnergyLevelUpRolled || 1) + 1);
                            setTargetEnergyLevel(liveCharacter.level || 1); // Capture target at dialog open
                            setShowLevelUpEnergyDialog(true);
                          }}
                          className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white"
                          data-testid="button-level-up-energy"
                        >
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Roll Energy{missedEnergyLevels > 1 ? ` (${missedEnergyLevels} levels)` : ` - Level ${(liveCharacter.lastEnergyLevelUpRolled || 1) + 1}`}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit Mode Buttons */}
                {editingOverview && (
                  <div className="flex gap-2 pt-4 border-t border-stone-700">
                    <Button
                      size="sm"
                      onClick={() => {
                        const dataToSave = {
                          ...overviewData,
                          level: overviewData.level === '' ? 1 : Number(overviewData.level),
                          hp: overviewData.hp === '' ? 0 : Number(overviewData.hp),
                          maxHp: overviewData.maxHp === '' ? 1 : Number(overviewData.maxHp),
                          energy: overviewData.energy === '' ? 0 : Number(overviewData.energy),
                          maxEnergy: overviewData.maxEnergy === '' ? 0 : Number(overviewData.maxEnergy)
                        };
                        updateCharacterMutation.mutate(dataToSave);
                        setEditingOverview(false);
                      }}
                      data-testid="button-save-overview"
                    >
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingOverview(false)}
                      data-testid="button-cancel-overview"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ATTRIBUTES TAB */}
          <TabsContent value="attributes" className="space-y-4 mt-0" data-testid="content-attributes">
            <Card className="bg-stone-800 border-stone-700">
              <CardContent className="pt-4">
                {(isOwner || isGM) && !editingAttributes && (
                  <div className="flex justify-end mb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAttributesData({
                          might: liveCharacter.might || 0,
                          finesse: liveCharacter.finesse || 0,
                          wit: liveCharacter.wit || 0,
                          presence: liveCharacter.presence || 0,
                          will: liveCharacter.will || 0,
                          craft: liveCharacter.craft || 0
                        });
                        setEditingAttributes(true);
                      }}
                      data-testid="button-edit-attributes"
                    >
                      Edit Attributes
                    </Button>
                  </div>
                )}
                <p className="text-xs text-stone-500 mb-4">Attributes range from -2 to 5. The modifier equals the value.</p>
                {(() => {
                  const level = liveCharacter.level || 1;
                  const maxPositiveAttrPoints = 6 + Math.floor(level / 3);
                  const maxNegativeAttrPoints = 4;
                  
                  const attrValues = editingAttributes 
                    ? [
                        attributesData.might === '' ? 0 : Number(attributesData.might),
                        attributesData.finesse === '' ? 0 : Number(attributesData.finesse),
                        attributesData.wit === '' ? 0 : Number(attributesData.wit),
                        attributesData.presence === '' ? 0 : Number(attributesData.presence),
                        attributesData.will === '' ? 0 : Number(attributesData.will),
                        attributesData.craft === '' ? 0 : Number(attributesData.craft)
                      ]
                    : [
                        liveCharacter.might || 0,
                        liveCharacter.finesse || 0,
                        liveCharacter.wit || 0,
                        liveCharacter.presence || 0,
                        liveCharacter.will || 0,
                        liveCharacter.craft || 0
                      ];
                  
                  const positiveAttrUsed = attrValues.filter(v => v > 0).reduce((sum, v) => sum + v, 0);
                  const negativeAttrUsed = Math.abs(attrValues.filter(v => v < 0).reduce((sum, v) => sum + v, 0));
                  
                  return (
                    <div className="mb-4 p-3 bg-stone-900 rounded border border-stone-700" data-testid="validation-attributes">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-stone-400">Positive Points:</span>
                        <span className={positiveAttrUsed === maxPositiveAttrPoints ? 'text-green-400' : 'text-amber-400'} data-testid="text-positive-attr-points">
                          {positiveAttrUsed} / {maxPositiveAttrPoints} {positiveAttrUsed !== maxPositiveAttrPoints && (positiveAttrUsed < maxPositiveAttrPoints ? '(need more)' : '(too many)')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm mt-1">
                        <span className="text-stone-400">Negative Points:</span>
                        <span className={negativeAttrUsed === maxNegativeAttrPoints ? 'text-green-400' : 'text-amber-400'} data-testid="text-negative-attr-points">
                          {negativeAttrUsed} / {maxNegativeAttrPoints} {negativeAttrUsed !== maxNegativeAttrPoints && (negativeAttrUsed < maxNegativeAttrPoints ? '(need more)' : '(too many)')}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { key: 'might', name: 'Might', description: 'Physical power and endurance' },
                    { key: 'finesse', name: 'Finesse', description: 'Agility and precision' },
                    { key: 'wit', name: 'Wit', description: 'Intelligence and perception' },
                    { key: 'presence', name: 'Presence', description: 'Charisma and influence' },
                    { key: 'will', name: 'Will', description: 'Mental fortitude and magic' },
                    { key: 'craft', name: 'Craft', description: 'Technical skill and creativity' },
                  ].map(attr => {
                    const value = editingAttributes ? attributesData[attr.key as keyof typeof attributesData] : (liveCharacter[attr.key] || 0);
                    const baseNumericValue = typeof value === 'string' ? (parseInt(value) || 0) : value;
                    const featBonus = featBonuses.attributes[attr.key] || 0;
                    const numericValue = baseNumericValue + featBonus;
                    return (
                      <Card 
                        key={attr.key} 
                        className={`bg-stone-900 ${editingAttributes ? 'border-amber-700' : 'border-stone-600 cursor-pointer hover:bg-stone-800 transition-colors'}`}
                        onPointerDown={!editingAttributes ? () => {
                          isLongPressRef.current = false;
                          longPressTimerRef.current = setTimeout(() => {
                            isLongPressRef.current = true;
                            openRollPanel(attr.name, numericValue, 'attribute');
                          }, 500);
                        } : undefined}
                        onPointerUp={!editingAttributes ? () => {
                          clearTimeout(longPressTimerRef.current);
                        } : undefined}
                        onPointerLeave={!editingAttributes ? () => {
                          clearTimeout(longPressTimerRef.current);
                        } : undefined}
                        onClick={!editingAttributes ? () => {
                          const cardKey = `attr-${attr.key}`;
                          const now = Date.now();
                          const timeSinceLastClick = now - lastClickTimeRef.current;
                          const sameCard = lastClickedCardRef.current === cardKey;
                          
                          if (timeSinceLastClick < 400 && timeSinceLastClick > 0 && sameCard) {
                            const existingTimer = clickTimersRef.current.get(cardKey);
                            if (existingTimer) clearTimeout(existingTimer);
                            clickTimersRef.current.delete(cardKey);
                            lastClickTimeRef.current = 0;
                            lastClickedCardRef.current = null;
                            doubleClickDetectedRef.current = true;
                            openRollPanel(attr.name, numericValue, 'attribute');
                            setTimeout(() => { doubleClickDetectedRef.current = false; }, 100);
                          } else {
                            lastClickTimeRef.current = now;
                            lastClickedCardRef.current = cardKey;
                            doubleClickDetectedRef.current = false;
                            const existingTimer = clickTimersRef.current.get(cardKey);
                            if (existingTimer) clearTimeout(existingTimer);
                            const timer = setTimeout(() => {
                              if (!isLongPressRef.current && !doubleClickDetectedRef.current) {
                                handleRoll(attr.name, numericValue);
                              }
                              clickTimersRef.current.delete(cardKey);
                            }, 400);
                            clickTimersRef.current.set(cardKey, timer);
                          }
                        } : undefined}
                        data-testid={`card-attribute-${attr.key}`}
                      >
                        <CardContent className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Label className="text-xs text-stone-400">{attr.name}</Label>
                          </div>
                          {editingAttributes ? (
                            <Input
                              type="number"
                              min="-2"
                              max="5"
                              value={value}
                              onChange={(e) => {
                                if (e.target.value === '') {
                                  setAttributesData({
                                    ...attributesData,
                                    [attr.key]: ''
                                  });
                                } else {
                                  const parsed = parseInt(e.target.value);
                                  const newVal = Math.max(-2, Math.min(5, parsed));
                                  setAttributesData({
                                    ...attributesData,
                                    [attr.key]: newVal
                                  });
                                }
                              }}
                              className="text-2xl font-bold text-amber-500 mt-1 text-center bg-stone-800 border-amber-700"
                              data-testid={`input-attribute-${attr.key}`}
                            />
                          ) : (
                            <div className="mt-1" data-testid={`text-attribute-${attr.key}`}>
                              <span className="text-2xl font-bold text-amber-500">
                                {numericValue >= 0 ? `+${numericValue}` : numericValue}
                              </span>
                              {featBonus > 0 && (
                                <span className="text-xs text-purple-400 ml-1">(+{featBonus})</span>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] text-stone-500 mt-1">{attr.description}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Edit Mode Buttons */}
                {editingAttributes && (
                  <div className="flex gap-2 pt-4 mt-4 border-t border-stone-700">
                    <Button
                      size="sm"
                      onClick={() => {
                        const dataToSave = Object.fromEntries(
                          Object.entries(attributesData).map(([key, val]) => [key, val === '' ? 0 : Number(val)])
                        );
                        updateCharacterMutation.mutate(dataToSave);
                        setEditingAttributes(false);
                      }}
                      data-testid="button-save-attributes"
                    >
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingAttributes(false)}
                      data-testid="button-cancel-attributes"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SKILLS TAB */}
          <TabsContent value="skills" className="space-y-4 mt-0" data-testid="content-skills">
            <Card className="bg-stone-800 border-stone-700">
              <CardContent className="pt-4">
                {canEditSheet && !editingSkills && (
                  <div className="flex justify-end mb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSkillsData({
                          skillAgility: liveCharacter.skillAgility || 0,
                          skillArcana: liveCharacter.skillArcana || 0,
                          skillCharisma: liveCharacter.skillCharisma || 0,
                          skillConcentration: liveCharacter.skillConcentration || 0,
                          skillCulture: liveCharacter.skillCulture || 0,
                          skillDeception: liveCharacter.skillDeception || 0,
                          skillHistory: liveCharacter.skillHistory || 0,
                          skillIntimidation: liveCharacter.skillIntimidation || 0,
                          skillInvestigation: liveCharacter.skillInvestigation || 0,
                          skillMedicine: liveCharacter.skillMedicine || 0,
                          skillPerception: liveCharacter.skillPerception || 0,
                          skillSleightOfHand: liveCharacter.skillSleightOfHand || 0,
                          skillStealth: liveCharacter.skillStealth || 0,
                          skillStrength: liveCharacter.skillStrength || 0,
                          skillWisdom: liveCharacter.skillWisdom || 0
                        });
                        // Initialize custom skills edit data
                        const customSkillsInit: Record<string, number | string> = {};
                        characterCustomSkills.forEach((cs: CharacterCustomSkill) => {
                          customSkillsInit[cs.id] = cs.value || 0;
                        });
                        setCustomSkillsEditData(customSkillsInit);
                        setEditingSkills(true);
                      }}
                      data-testid="button-edit-skills"
                    >
                      Edit Skills
                    </Button>
                  </div>
                )}
                <p className="text-xs text-stone-500 mb-4">Skills range from -2 to 5. The modifier equals the value.</p>
                {(() => {
                  const level = liveCharacter.level || 1;
                  const maxPositiveSkillPoints = 12 + ((level - 1) * 2);
                  const maxNegativeSkillPoints = 6;
                  
                  // Standard skill values
                  const standardSkillValues = editingSkills 
                    ? [
                        skillsData.skillAgility === '' ? 0 : Number(skillsData.skillAgility),
                        skillsData.skillArcana === '' ? 0 : Number(skillsData.skillArcana),
                        skillsData.skillCharisma === '' ? 0 : Number(skillsData.skillCharisma),
                        skillsData.skillConcentration === '' ? 0 : Number(skillsData.skillConcentration),
                        skillsData.skillCulture === '' ? 0 : Number(skillsData.skillCulture),
                        skillsData.skillDeception === '' ? 0 : Number(skillsData.skillDeception),
                        skillsData.skillHistory === '' ? 0 : Number(skillsData.skillHistory),
                        skillsData.skillIntimidation === '' ? 0 : Number(skillsData.skillIntimidation),
                        skillsData.skillInvestigation === '' ? 0 : Number(skillsData.skillInvestigation),
                        skillsData.skillMedicine === '' ? 0 : Number(skillsData.skillMedicine),
                        skillsData.skillPerception === '' ? 0 : Number(skillsData.skillPerception),
                        skillsData.skillSleightOfHand === '' ? 0 : Number(skillsData.skillSleightOfHand),
                        skillsData.skillStealth === '' ? 0 : Number(skillsData.skillStealth),
                        skillsData.skillStrength === '' ? 0 : Number(skillsData.skillStrength),
                        skillsData.skillWisdom === '' ? 0 : Number(skillsData.skillWisdom)
                      ]
                    : [
                        liveCharacter.skillAgility || 0,
                        liveCharacter.skillArcana || 0,
                        liveCharacter.skillCharisma || 0,
                        liveCharacter.skillConcentration || 0,
                        liveCharacter.skillCulture || 0,
                        liveCharacter.skillDeception || 0,
                        liveCharacter.skillHistory || 0,
                        liveCharacter.skillIntimidation || 0,
                        liveCharacter.skillInvestigation || 0,
                        liveCharacter.skillMedicine || 0,
                        liveCharacter.skillPerception || 0,
                        liveCharacter.skillSleightOfHand || 0,
                        liveCharacter.skillStealth || 0,
                        liveCharacter.skillStrength || 0,
                        liveCharacter.skillWisdom || 0
                      ];
                  
                  // Custom skill values (add to totals) - use RAW skill value only, not combined with attribute
                  const customSkillValues = editingSkills
                    ? characterCustomSkills.map((cs: CharacterCustomSkill) => {
                        const val = customSkillsEditData[cs.id];
                        // Use edit state value, or fall back to raw skill value from database
                        if (val !== undefined) {
                          return val === '' ? 0 : Number(val);
                        }
                        return cs.value ?? 0;
                      })
                    : characterCustomSkills.map((cs: CharacterCustomSkill) => cs.value ?? 0);
                  
                  // Combine all skill values for point calculation
                  const skillValues = [...standardSkillValues, ...customSkillValues];
                  
                  const positiveSkillUsed = skillValues.filter(v => v > 0).reduce((sum, v) => sum + v, 0);
                  const negativeSkillUsed = Math.abs(skillValues.filter(v => v < 0).reduce((sum, v) => sum + v, 0));
                  
                  return (
                    <div className="mb-4 p-3 bg-stone-900 rounded border border-stone-700" data-testid="validation-skills">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-stone-400">Positive Points:</span>
                        <span className={positiveSkillUsed === maxPositiveSkillPoints ? 'text-green-400' : 'text-amber-400'} data-testid="text-positive-skill-points">
                          {positiveSkillUsed} / {maxPositiveSkillPoints} {positiveSkillUsed !== maxPositiveSkillPoints && (positiveSkillUsed < maxPositiveSkillPoints ? '(need more)' : '(too many)')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm mt-1">
                        <span className="text-stone-400">Negative Points:</span>
                        <span className={negativeSkillUsed === maxNegativeSkillPoints ? 'text-green-400' : 'text-amber-400'} data-testid="text-negative-skill-points">
                          {negativeSkillUsed} / {maxNegativeSkillPoints} {negativeSkillUsed !== maxNegativeSkillPoints && (negativeSkillUsed < maxNegativeSkillPoints ? '(need more)' : '(too many)')}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                {/* All Skills - Alphabetical Order */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { key: 'skillAgility', name: 'Agility', attr: 'FIN' },
                    { key: 'skillArcana', name: 'Arcana', attr: 'WIT' },
                    { key: 'skillCharisma', name: 'Charisma', attr: 'PRE' },
                    { key: 'skillConcentration', name: 'Concentration', attr: 'WIL' },
                    { key: 'skillCulture', name: 'Culture', attr: 'WIT' },
                    { key: 'skillDeception', name: 'Deception', attr: 'PRE' },
                    { key: 'skillHistory', name: 'History', attr: 'WIT' },
                    { key: 'skillIntimidation', name: 'Intimidation', attr: 'PRE' },
                    { key: 'skillInvestigation', name: 'Investigation', attr: 'WIT' },
                    { key: 'skillMedicine', name: 'Medicine', attr: 'CRA' },
                    { key: 'skillPerception', name: 'Perception', attr: 'WIT' },
                    { key: 'skillSleightOfHand', name: 'Sleight of Hand', attr: 'FIN' },
                    { key: 'skillStealth', name: 'Stealth', attr: 'FIN' },
                    { key: 'skillStrength', name: 'Strength', attr: 'MIG' },
                    { key: 'skillWisdom', name: 'Wisdom', attr: 'WIT' },
                  ].map(skill => {
                    const value = editingSkills ? skillsData[skill.key as keyof typeof skillsData] : (liveCharacter[skill.key] || 0);
                    return editingSkills ? (
                      <div key={skill.key} className="flex flex-col gap-1 p-3 bg-stone-900 border border-amber-700 rounded-md">
                        <Label className="text-xs text-stone-400">{skill.name} <span className="text-stone-500">({skill.attr})</span></Label>
                        <Input
                          type="number"
                          min="-2"
                          max="5"
                          value={value}
                          onChange={(e) => {
                            if (e.target.value === '') {
                              setSkillsData({
                                ...skillsData,
                                [skill.key]: ''
                              });
                            } else {
                              const parsed = parseInt(e.target.value);
                              const newVal = Math.max(-2, Math.min(5, parsed));
                              setSkillsData({
                                ...skillsData,
                                [skill.key]: newVal
                              });
                            }
                          }}
                          className="bg-stone-800 border-amber-700 text-center font-bold"
                          data-testid={`input-skill-${skill.key}`}
                        />
                      </div>
                    ) : (
                      (() => {
                        const baseNumericValue = typeof value === 'string' ? (parseInt(value) || 0) : value;
                        const skillFeatBonus = featBonuses.skills[skill.key] || 0;
                        const numericValue = baseNumericValue + skillFeatBonus;
                        return (
                          <Badge 
                            key={skill.key} 
                            variant="outline" 
                            className="justify-between p-3 bg-stone-900 border-stone-600 cursor-pointer hover:bg-stone-800 transition-colors"
                            onPointerDown={() => {
                              isLongPressRef.current = false;
                              longPressTimerRef.current = setTimeout(() => {
                                isLongPressRef.current = true;
                                openRollPanel(skill.name, numericValue, 'skill');
                              }, 500);
                            }}
                            onPointerUp={() => {
                              clearTimeout(longPressTimerRef.current);
                            }}
                            onPointerLeave={() => {
                              clearTimeout(longPressTimerRef.current);
                            }}
                            onClick={() => {
                              const cardKey = `skill-${skill.key}`;
                              const now = Date.now();
                              const timeSinceLastClick = now - lastClickTimeRef.current;
                              const sameCard = lastClickedCardRef.current === cardKey;
                              
                              if (timeSinceLastClick < 400 && timeSinceLastClick > 0 && sameCard) {
                                const existingTimer = clickTimersRef.current.get(cardKey);
                                if (existingTimer) clearTimeout(existingTimer);
                                clickTimersRef.current.delete(cardKey);
                                lastClickTimeRef.current = 0;
                                lastClickedCardRef.current = null;
                                doubleClickDetectedRef.current = true;
                                openRollPanel(skill.name, numericValue, 'skill');
                                setTimeout(() => { doubleClickDetectedRef.current = false; }, 100);
                              } else {
                                lastClickTimeRef.current = now;
                                lastClickedCardRef.current = cardKey;
                                doubleClickDetectedRef.current = false;
                                const existingTimer = clickTimersRef.current.get(cardKey);
                                if (existingTimer) clearTimeout(existingTimer);
                                const timer = setTimeout(() => {
                                  if (!isLongPressRef.current && !doubleClickDetectedRef.current) {
                                    handleRoll(skill.name, numericValue, 0, 'none', true);
                                  }
                                  clickTimersRef.current.delete(cardKey);
                                }, 400);
                                clickTimersRef.current.set(cardKey, timer);
                              }
                            }}
                            data-testid={`badge-skill-${skill.key}`}
                          >
                            <span className="text-xs">{skill.name} <span className="text-stone-500">({skill.attr})</span></span>
                            <span className="font-bold ml-2">
                              {numericValue >= 0 ? `+${numericValue}` : numericValue}
                              {skillFeatBonus > 0 && <span className="text-purple-400 text-[10px]"> (+{skillFeatBonus})</span>}
                            </span>
                          </Badge>
                        );
                      })()
                    );
                  })}
                </div>

                {/* Edit Mode Buttons */}
                {editingSkills && (
                  <div className="flex gap-2 pt-4 mt-4 border-t border-stone-700">
                    <Button
                      size="sm"
                      onClick={async () => {
                        // Save standard skills
                        const dataToSave = Object.fromEntries(
                          Object.entries(skillsData).map(([key, val]) => [key, val === '' ? 0 : Number(val)])
                        );
                        updateCharacterMutation.mutate(dataToSave);
                        
                        // Save custom skill changes
                        for (const [skillId, value] of Object.entries(customSkillsEditData)) {
                          const numValue = value === '' ? 0 : Number(value);
                          const originalSkill = characterCustomSkills.find((cs: CharacterCustomSkill) => cs.id === skillId);
                          if (originalSkill && originalSkill.value !== numValue) {
                            await api.updateCharacterCustomSkill(character.id, skillId, { value: numValue });
                          }
                        }
                        
                        // Refetch custom skills to get updated values
                        refetchCustomSkills();
                        setEditingSkills(false);
                      }}
                      data-testid="button-save-skills"
                    >
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingSkills(false)}
                      data-testid="button-cancel-skills"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Custom Skills Section */}
            <Card className="bg-stone-800 border-stone-700 mt-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-cyan-500 text-sm font-medium flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Custom Skills
                  </CardTitle>
                  {canAddContent && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddCustomSkill(true)}
                      className="h-7 text-xs"
                      data-testid="button-add-custom-skill"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Skill
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {characterCustomSkills.length === 0 ? (
                  <div className="text-center py-4 text-stone-500 text-sm">
                    No custom skills added yet
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {characterCustomSkills.map((customSkill: CharacterCustomSkill) => {
                      const parentAttr = customSkill.parentAttribute || 'wit';
                      const attrValue = typeof liveCharacter[parentAttr as keyof typeof liveCharacter] === 'number' 
                        ? (liveCharacter[parentAttr as keyof typeof liveCharacter] as number) 
                        : 0;
                      const editValue = customSkillsEditData[customSkill.id];
                      const skillValue = editingSkills 
                        ? (editValue === '' ? 0 : Number(editValue ?? customSkill.value ?? 0))
                        : (customSkill.value || 0);
                      const totalMod = skillValue + attrValue;
                      
                      // In edit mode, show editable input with RAW skill value (not combined with attribute)
                      if (editingSkills) {
                        // Use only the raw skill value from edit state, not the combined totalMod
                        const rawSkillValue = customSkillsEditData[customSkill.id] !== undefined 
                          ? customSkillsEditData[customSkill.id] 
                          : (customSkill.value ?? 0);
                        return (
                          <div key={customSkill.id} className="flex flex-col gap-1 p-3 bg-stone-900 border border-cyan-700 rounded-md">
                            <Label className="text-xs text-cyan-300">{customSkill.name} <span className="text-stone-500 capitalize">({parentAttr})</span></Label>
                            <Input
                              type="number"
                              min="-2"
                              max="5"
                              value={rawSkillValue}
                              onChange={(e) => {
                                if (e.target.value === '') {
                                  setCustomSkillsEditData({
                                    ...customSkillsEditData,
                                    [customSkill.id]: ''
                                  });
                                } else {
                                  const parsed = parseInt(e.target.value);
                                  const newVal = Math.max(-2, Math.min(5, parsed));
                                  setCustomSkillsEditData({
                                    ...customSkillsEditData,
                                    [customSkill.id]: newVal
                                  });
                                }
                              }}
                              className="bg-stone-800 border-cyan-700 text-center font-bold"
                              data-testid={`input-custom-skill-${customSkill.id}`}
                            />
                          </div>
                        );
                      }
                      
                      return (
                        <Badge 
                          key={customSkill.id}
                          variant="outline" 
                          className="justify-between p-3 bg-stone-900 border-cyan-700 cursor-pointer hover:bg-stone-800 transition-colors group relative"
                          onPointerDown={() => {
                            isLongPressRef.current = false;
                            longPressTimerRef.current = setTimeout(() => {
                              isLongPressRef.current = true;
                              openRollPanel(customSkill.name, totalMod, 'skill');
                            }, 500);
                          }}
                          onPointerUp={() => {
                            clearTimeout(longPressTimerRef.current);
                          }}
                          onPointerLeave={() => {
                            clearTimeout(longPressTimerRef.current);
                          }}
                          onClick={() => {
                            const cardKey = `custom-skill-${customSkill.id}`;
                            const now = Date.now();
                            const timeSinceLastClick = now - lastClickTimeRef.current;
                            const sameCard = lastClickedCardRef.current === cardKey;
                            
                            if (timeSinceLastClick < 400 && timeSinceLastClick > 0 && sameCard) {
                              const existingTimer = clickTimersRef.current.get(cardKey);
                              if (existingTimer) clearTimeout(existingTimer);
                              clickTimersRef.current.delete(cardKey);
                              lastClickTimeRef.current = 0;
                              lastClickedCardRef.current = null;
                              doubleClickDetectedRef.current = true;
                              openRollPanel(customSkill.name, totalMod, 'skill');
                              setTimeout(() => { doubleClickDetectedRef.current = false; }, 100);
                            } else {
                              lastClickTimeRef.current = now;
                              lastClickedCardRef.current = cardKey;
                              doubleClickDetectedRef.current = false;
                              const existingTimer = clickTimersRef.current.get(cardKey);
                              if (existingTimer) clearTimeout(existingTimer);
                              const timer = setTimeout(() => {
                                if (!isLongPressRef.current && !doubleClickDetectedRef.current) {
                                  handleRoll(customSkill.name, totalMod, 0, 'none', true);
                                }
                                clickTimersRef.current.delete(cardKey);
                              }, 400);
                              clickTimersRef.current.set(cardKey, timer);
                            }
                          }}
                          data-testid={`badge-custom-skill-${customSkill.id}`}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs text-cyan-300">{customSkill.name}</span>
                            <span className="text-[10px] text-stone-500 capitalize">{parentAttr}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold">
                              {skillValue >= 0 ? `+${skillValue}` : skillValue}
                            </span>
                            {(isOwner || isGM) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCustomSkill(customSkill);
                                }}
                                data-testid={`button-edit-custom-skill-${customSkill.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Custom Skill Dialog */}
            <Dialog open={showAddCustomSkill} onOpenChange={setShowAddCustomSkill}>
              <DialogContent className="bg-stone-900 border-stone-700 max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-cyan-500">Add Custom Skill</DialogTitle>
                </DialogHeader>
                <CustomSkillForm
                  systemSkills={systemSkills}
                  existingSkillIds={characterCustomSkills.map((cs: CharacterCustomSkill) => cs.systemSkillId).filter(Boolean)}
                  onSave={(data) => addCustomSkillMutation.mutate(data)}
                  isLoading={addCustomSkillMutation.isPending}
                />
              </DialogContent>
            </Dialog>

            {/* Edit Custom Skill Dialog */}
            {editingCustomSkill && (
              <Dialog open={!!editingCustomSkill} onOpenChange={() => setEditingCustomSkill(null)}>
                <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-cyan-500">Edit Custom Skill</DialogTitle>
                  </DialogHeader>
                  <CustomSkillEditForm
                    skill={editingCustomSkill}
                    onSave={(data) => updateCustomSkillMutation.mutate({ skillId: editingCustomSkill.id, data })}
                    onDelete={() => {
                      if (confirm('Are you sure you want to remove this skill?')) {
                        removeCustomSkillMutation.mutate(editingCustomSkill.id);
                      }
                    }}
                    isLoading={updateCustomSkillMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            )}

            {/* Traits Section */}
            <Card className="bg-stone-800 border-stone-700 mt-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-rose-500 text-sm font-medium flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Traits
                  </CardTitle>
                  {canAddContent && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddTrait(true)}
                      className="h-7 text-xs"
                      data-testid="button-add-trait"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Trait
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {characterTraits.length === 0 ? (
                  <div className="text-center py-4 text-stone-500 text-sm">
                    No traits added yet
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {characterTraits.map((trait: CharacterTrait) => {
                      const parentAttr = trait.parentAttribute || 'wit';
                      const attrValue = typeof liveCharacter[parentAttr as keyof typeof liveCharacter] === 'number' 
                        ? (liveCharacter[parentAttr as keyof typeof liveCharacter] as number) 
                        : 0;
                      const totalMod = attrValue;
                      const usesRemaining = trait.usesPerLongRest - trait.currentUses;
                      const canUse = trait.currentUses < trait.usesPerLongRest;
                      
                      return (
                        <Badge 
                          key={trait.id}
                          variant="outline" 
                          className="justify-between p-3 bg-stone-900 border-rose-700 cursor-pointer hover:bg-stone-800 transition-colors group relative"
                          onPointerDown={() => {
                            isLongPressRef.current = false;
                            longPressTimerRef.current = setTimeout(() => {
                              isLongPressRef.current = true;
                              openRollPanel(trait.name, totalMod, 'skill');
                            }, 500);
                          }}
                          onPointerUp={() => {
                            clearTimeout(longPressTimerRef.current);
                          }}
                          onPointerLeave={() => {
                            clearTimeout(longPressTimerRef.current);
                          }}
                          onClick={() => {
                            const cardKey = `trait-${trait.id}`;
                            const now = Date.now();
                            const timeSinceLastClick = now - lastClickTimeRef.current;
                            const sameCard = lastClickedCardRef.current === cardKey;
                            
                            if (timeSinceLastClick < 400 && timeSinceLastClick > 0 && sameCard) {
                              const existingTimer = clickTimersRef.current.get(cardKey);
                              if (existingTimer) clearTimeout(existingTimer);
                              clickTimersRef.current.delete(cardKey);
                              lastClickTimeRef.current = 0;
                              lastClickedCardRef.current = null;
                              doubleClickDetectedRef.current = true;
                              openRollPanel(trait.name, totalMod, 'skill');
                              setTimeout(() => { doubleClickDetectedRef.current = false; }, 100);
                            } else {
                              lastClickTimeRef.current = now;
                              lastClickedCardRef.current = cardKey;
                              doubleClickDetectedRef.current = false;
                              const existingTimer = clickTimersRef.current.get(cardKey);
                              if (existingTimer) clearTimeout(existingTimer);
                              const timer = setTimeout(() => {
                                if (!isLongPressRef.current && !doubleClickDetectedRef.current) {
                                  handleRoll(trait.name, totalMod, 0, 'none', true);
                                }
                                clickTimersRef.current.delete(cardKey);
                              }, 400);
                              clickTimersRef.current.set(cardKey, timer);
                            }
                          }}
                          data-testid={`badge-trait-${trait.id}`}
                        >
                          <div className="flex flex-col flex-1">
                            <span className="text-xs text-rose-300">{trait.name}</span>
                            <div className="flex items-center gap-1 text-[10px] text-stone-500">
                              <span className="capitalize">{parentAttr}</span>
                              <span>•</span>
                              <span className={canUse ? 'text-green-400' : 'text-red-400'}>
                                {usesRemaining}/{trait.usesPerLongRest} uses
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {(isOwner || isGM) && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  disabled={!canUse || useTraitMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    useTraitMutation.mutate(trait.id);
                                  }}
                                  data-testid={`button-use-trait-${trait.id}`}
                                >
                                  <Zap className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTrait(trait);
                                  }}
                                  data-testid={`button-edit-trait-${trait.id}`}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Trait Dialog */}
            <Dialog open={showAddTrait} onOpenChange={setShowAddTrait}>
              <DialogContent className="bg-stone-900 border-stone-700 max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-rose-500">Add Trait</DialogTitle>
                </DialogHeader>
                <TraitForm
                  systemTraits={systemTraits}
                  existingTraitIds={characterTraits.map((ct: CharacterTrait) => ct.systemTraitId).filter(Boolean)}
                  onSave={(data) => addTraitMutation.mutate(data)}
                  isLoading={addTraitMutation.isPending}
                />
              </DialogContent>
            </Dialog>

            {/* Edit Trait Dialog */}
            {editingTrait && (
              <Dialog open={!!editingTrait} onOpenChange={() => setEditingTrait(null)}>
                <DialogContent className="bg-stone-900 border-stone-700 max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-rose-500">Edit Trait</DialogTitle>
                  </DialogHeader>
                  <TraitEditForm
                    trait={editingTrait}
                    onSave={(data) => updateTraitMutation.mutate({ traitId: editingTrait.id, data })}
                    onDelete={() => {
                      if (confirm('Are you sure you want to remove this trait?')) {
                        removeTraitMutation.mutate(editingTrait.id);
                      }
                    }}
                    isLoading={updateTraitMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>

          {/* INVENTORY TAB */}
          <TabsContent value="inventory" className="space-y-4 mt-0" data-testid="content-inventory">
            <Card className="bg-stone-800 border-stone-700">
              <CardContent className="space-y-4 pt-4">
                <div className="flex justify-end gap-2">
                  {isGM && (
                    <Button size="sm" variant="outline" onClick={() => setShowManageTemplates(true)} data-testid="button-manage-templates" className="bg-stone-700 border-stone-600 hover:bg-stone-600">
                      <Layers className="h-4 w-4 mr-1" /> Templates
                    </Button>
                  )}
                  {isGM && (
                    <Button size="sm" onClick={() => setShowAddItem(true)} data-testid="button-add-item">
                      <Plus className="h-4 w-4 mr-1" /> Add Item
                    </Button>
                  )}
                </div>
                {/* Currency & Weight Display */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-stone-900 rounded-lg border border-stone-700">
                  <div>
                    <Label className="text-xs text-stone-400">Weight Carried</Label>
                    <p className={`text-lg font-bold ${weightPercentage > 100 ? 'text-red-500' : weightPercentage > 75 ? 'text-yellow-500' : 'text-green-500'}`} data-testid="text-weight">
                      {totalWeight.toFixed(2)} / {carryCapacity} lbs
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-stone-400">Currency</Label>
                    <div className="text-sm text-stone-200 flex gap-2" data-testid="text-currency">
                      {displayCurrency.platinum > 0 && <span className="text-purple-400">{displayCurrency.platinum}p</span>}
                      {displayCurrency.gold > 0 && <span className="text-yellow-500">{displayCurrency.gold}g</span>}
                      {displayCurrency.silver > 0 && <span className="text-gray-400">{displayCurrency.silver}s</span>}
                      {displayCurrency.copper > 0 && <span className="text-orange-600">{displayCurrency.copper}c</span>}
                      {displayCurrency.platinum === 0 && displayCurrency.gold === 0 && displayCurrency.silver === 0 && displayCurrency.copper === 0 && <span className="text-stone-500">No currency</span>}
                    </div>
                  </div>
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Search items..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="flex-1 min-w-[200px] bg-stone-900 border-stone-700"
                    data-testid="input-item-search"
                  />
                  <Select value={itemSort} onValueChange={setItemSort}>
                    <SelectTrigger className="w-[180px] bg-stone-900 border-stone-700" data-testid="select-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                      <SelectItem value="weight-low">Weight (Low-High)</SelectItem>
                      <SelectItem value="weight-high">Weight (High-Low)</SelectItem>
                      <SelectItem value="price-low">Price (Low-High)</SelectItem>
                      <SelectItem value="price-high">Price (High-Low)</SelectItem>
                      <SelectItem value="rarity">Rarity</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
                    <SelectTrigger className="w-[150px] bg-stone-900 border-stone-700" data-testid="select-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="weapon">Weapons</SelectItem>
                      <SelectItem value="ammunition">Ammunition</SelectItem>
                      <SelectItem value="armor">Armor</SelectItem>
                      <SelectItem value="consumable">Consumables</SelectItem>
                      <SelectItem value="utility">Utilities</SelectItem>
                      <SelectItem value="container">Containers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Item List */}
                <div 
                  className="space-y-2"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!canEdit) return;
                    
                    // Try dataTransfer first, fall back to global state (works on mobile)
                    let draggedItemId: string | null = null;
                    
                    try {
                      const jsonData = e.dataTransfer.getData('application/json');
                      if (jsonData) {
                        const data = JSON.parse(jsonData);
                        if (data.type === 'item' && data.itemId) {
                          draggedItemId = data.itemId;
                        }
                      }
                    } catch (err) {}
                    
                    // Fall back to global state if dataTransfer didn't work
                    if (!draggedItemId && globalDraggedItem) {
                      draggedItemId = globalDraggedItem.id;
                    }
                    
                    if (draggedItemId) {
                      moveItemToContainer(draggedItemId, null);
                    }
                    
                    // Clear global state
                    globalDraggedItem = null;
                  }}
                >
                  {hierarchicalItems.length === 0 ? (
                    <div className="text-center py-12 text-stone-400">
                      <Backpack className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-bold">No items found</p>
                      <p className="text-sm mt-2">Add items to your inventory</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {hierarchicalItems.map((stack: any) => (
                        <InventoryItemRow
                          key={stack.id}
                          item={stack}
                          depth={0}
                          expandedContainers={expandedContainers}
                          toggleContainer={toggleContainer}
                          setSelectedItem={setSelectedItem}
                          setShowItemDetail={setShowItemDetail}
                          canEdit={canEdit}
                          moveItemToContainer={moveItemToContainer}
                          onDeleteItem={(id) => deleteItemMutation.mutate(id)}
                          onUpdateQuantity={(itemId, quantityChange) => {
                            if (!stack.items || stack.items.length === 0) return;
                            
                            if (quantityChange > 0) {
                              // INCREASING: Add to first item's quantity
                              const firstItem = stack.items[0];
                              updateItemMutation.mutate({ 
                                id: firstItem.id, 
                                data: { quantity: firstItem.quantity + quantityChange } 
                              });
                            } else if (quantityChange < 0) {
                              // DECREASING: Delete items from the stack until reaching target
                              let remaining = Math.abs(quantityChange);
                              const idsToDelete: string[] = [];
                              
                              // Go through items from the end and mark for deletion or reduce quantity
                              for (let i = stack.items.length - 1; i >= 0 && remaining > 0; i--) {
                                const item = stack.items[i];
                                if (item.quantity <= remaining) {
                                  // Delete entire item
                                  idsToDelete.push(item.id);
                                  remaining -= item.quantity;
                                } else {
                                  // Reduce this item's quantity (partial deletion)
                                  updateItemMutation.mutate({ 
                                    id: item.id, 
                                    data: { quantity: item.quantity - remaining } 
                                  });
                                  remaining = 0;
                                }
                              }
                              
                              // Delete marked items
                              if (idsToDelete.length > 0) {
                                Promise.all(idsToDelete.map(id => deleteItemMutation.mutateAsync(id)));
                              }
                            }
                          }}
                          onDeleteMultiple={(itemIds) => {
                            Promise.all(itemIds.map(id => deleteItemMutation.mutateAsync(id)));
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MAGIC TAB */}
          <TabsContent value="magic" className="space-y-4 mt-0" data-testid="content-magic">
            <Card className="bg-stone-800 border-stone-700">
              <CardContent className="space-y-4 pt-4">
                {isGM && (
                  <div className="flex justify-end gap-2">
                    <Button 
                      size="sm"
                      onClick={() => {
                        setEditSpellData(null);
                        setShowAddSpell(true);
                      }}
                      data-testid="button-add-spell"
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Magic
                    </Button>
                  </div>
                )}
                {/* Spell Stats - Simplified */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-stone-900 p-3 rounded">
                    <Label className="text-xs text-stone-400">Total Spells</Label>
                    <p className="text-2xl font-bold text-purple-400" data-testid="text-spells-known">{spells.length}</p>
                  </div>
                  <div className="bg-stone-900 p-3 rounded">
                    <Label className="text-xs text-stone-400">Equipped</Label>
                    <p className="text-2xl font-bold text-amber-400">{spells.filter((s: any) => s.isEquipped).length}</p>
                  </div>
                </div>

                {/* Filters and Search - Simplified */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Search spells..."
                    value={spellSearch}
                    onChange={(e) => setSpellSearch(e.target.value)}
                    className="bg-stone-900 border-stone-700 flex-1"
                    data-testid="input-spell-search"
                  />
                  <Select value={spellSort} onValueChange={setSpellSort}>
                    <SelectTrigger className="bg-stone-900 border-stone-700 w-36" data-testid="select-spell-sort">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Spell List */}
                <div>
                  {(() => {
                    let filteredSpells = [...spells];

                    if (spellSearch) {
                      filteredSpells = filteredSpells.filter((s: any) =>
                        s.name.toLowerCase().includes(spellSearch.toLowerCase())
                      );
                    }

                    if (spellSort === "name-asc") {
                      filteredSpells.sort((a: any, b: any) => a.name.localeCompare(b.name));
                    } else if (spellSort === "name-desc") {
                      filteredSpells.sort((a: any, b: any) => b.name.localeCompare(a.name));
                    }

                    if (filteredSpells.length === 0) {
                      return (
                        <div className="text-center py-12 text-stone-400">
                          <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">No spells found</p>
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => {
                                setEditSpellData(null);
                                setShowAddSpell(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add Your First Spell
                            </Button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 gap-2">
                        {filteredSpells.map((spell: any) => (
                          <div
                            key={spell.id}
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('spell', JSON.stringify({
                                id: spell.id,
                                name: spell.name,
                                level: spell.level,
                                school: spell.school,
                                damage: spell.damage
                              }));
                            }}
                            className="bg-stone-900 rounded-lg p-3 border border-stone-700 hover:border-purple-500 cursor-pointer transition-all"
                            onClick={() => {
                              setSelectedSpell(spell);
                              setShowSpellDetail(true);
                            }}
                            data-testid={`spell-card-${spell.id}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-12 h-12 bg-stone-800 rounded flex items-center justify-center flex-shrink-0">
                                {spell.image ? (
                                  <img src={spell.image} alt={spell.name} className="w-full h-full object-cover rounded" />
                                ) : (
                                  <Sparkles className={`h-6 w-6 ${getSpellLevelColor(spell.level)}`} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="font-semibold text-stone-100 truncate">{spell.name}</h4>
                                  {spell.isEquipped && (
                                    <Badge variant="outline" className="bg-amber-900 text-amber-100 border-amber-700 flex-shrink-0">
                                      Equipped
                                    </Badge>
                                  )}
                                </div>
                                {/* Simplified display: action type, damage, and energy cost */}
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                                  <span className={spell.castingTime?.toLowerCase().includes('bonus') ? 'text-blue-400 font-medium' : 'text-red-400 font-medium'}>
                                    {spell.castingTime?.toLowerCase().includes('bonus') ? 'Bonus Action' : 'Action'}
                                  </span>
                                  {(spell.damage || spell.damageDice) && (
                                    <>
                                      <span className="text-stone-500">|</span>
                                      <span className="text-orange-400 font-medium">
                                        {spell.damage || spell.damageDice}{spell.damageType ? ` ${spell.damageType}` : ''}
                                      </span>
                                    </>
                                  )}
                                  <span className="text-stone-500">|</span>
                                  <span className="text-cyan-400 font-medium">
                                    {spell.energyCost || 0} Energy
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Add/Edit Spell Dialog */}
            <Dialog open={showAddSpell} onOpenChange={(open) => {
              setShowAddSpell(open);
              if (!open) {
                setSpellDialogTab('library');
              }
            }}>
              <DialogContent key={editSpellData?.id || 'new'} className="max-w-2xl bg-stone-900 border-stone-700 max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-purple-400">
                    {editSpellData ? 'Edit Spell' : 'Add Magic'}
                  </DialogTitle>
                </DialogHeader>
                
                {/* Show tabs only when creating, not editing */}
                {!editSpellData && (
                  <div className="flex border-b border-stone-700 mb-4">
                    <button
                      type="button"
                      onClick={() => setSpellDialogTab('library')}
                      className={`px-4 py-2 font-medium transition-colors ${
                        spellDialogTab === 'library' 
                          ? 'text-purple-500 border-b-2 border-purple-500' 
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                      data-testid="tab-spell-library"
                    >
                      From Library
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpellDialogTab('create')}
                      className={`px-4 py-2 font-medium transition-colors ${
                        spellDialogTab === 'create' 
                          ? 'text-purple-500 border-b-2 border-purple-500' 
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                      data-testid="tab-spell-create"
                    >
                      Create New
                    </button>
                  </div>
                )}
                
                <ScrollArea className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                  {/* Library Tab - only show when not editing */}
                  {!editSpellData && spellDialogTab === 'library' && (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                          <Input
                            placeholder="Search spells..."
                            value={spellLibrarySearch}
                            onChange={(e) => setSpellLibrarySearch(e.target.value)}
                            className="pl-9 bg-stone-800 border-stone-700"
                            data-testid="input-spell-library-search"
                          />
                        </div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className={`bg-stone-800 border-stone-700 ${hasActiveSpellLibraryFilters ? 'border-purple-500 text-purple-400' : ''}`}
                              data-testid="button-spell-library-filter"
                            >
                              <Filter className="h-4 w-4" />
                              {hasActiveSpellLibraryFilters && <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full" />}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 bg-stone-900 border-stone-700 p-4" align="end">
                            <div className="space-y-3">
                              <div className="font-medium text-stone-200">Filter Spells</div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-stone-400 text-xs">Action Type</Label>
                                  <Select value={spellActionTypeLibraryFilter} onValueChange={setSpellActionTypeLibraryFilter}>
                                    <SelectTrigger className="bg-stone-800 border-stone-700 mt-1 text-xs h-8" data-testid="select-spell-action-type-filter">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All</SelectItem>
                                      <SelectItem value="action">Action</SelectItem>
                                      <SelectItem value="bonus action">Bonus Action</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-stone-400 text-xs">Energy</Label>
                                  <Select value={spellEnergyLibraryFilter} onValueChange={setSpellEnergyLibraryFilter}>
                                    <SelectTrigger className="bg-stone-800 border-stone-700 mt-1 text-xs h-8" data-testid="select-spell-energy-filter">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All</SelectItem>
                                      <SelectItem value="0">0</SelectItem>
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(energy => (
                                        <SelectItem key={energy} value={String(energy)}>{energy}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-stone-400 text-xs">Damage Type</Label>
                                  <Select value={spellDamageTypeLibraryFilter} onValueChange={setSpellDamageTypeLibraryFilter}>
                                    <SelectTrigger className="bg-stone-800 border-stone-700 mt-1 text-xs h-8" data-testid="select-spell-damage-type-filter">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All</SelectItem>
                                      {spellDamageTypes.map(type => (
                                        <SelectItem key={type} value={type}>{type}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-stone-400 text-xs">Attribute</Label>
                                  <Select value={spellAttributeLibraryFilter} onValueChange={setSpellAttributeLibraryFilter}>
                                    <SelectTrigger className="bg-stone-800 border-stone-700 mt-1 text-xs h-8" data-testid="select-spell-attribute-filter">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All</SelectItem>
                                      {spellAttributes.map(attr => (
                                        <SelectItem key={attr} value={attr}>{attr.charAt(0).toUpperCase() + attr.slice(1)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-stone-400 text-xs">Is AoE</Label>
                                  <Select value={spellAoeLibraryFilter} onValueChange={setSpellAoeLibraryFilter}>
                                    <SelectTrigger className="bg-stone-800 border-stone-700 mt-1 text-xs h-8" data-testid="select-spell-aoe-filter">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All</SelectItem>
                                      <SelectItem value="yes">Yes</SelectItem>
                                      <SelectItem value="no">No</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-stone-400 text-xs">Duration</Label>
                                  <Select value={spellDurationLibraryFilter} onValueChange={setSpellDurationLibraryFilter}>
                                    <SelectTrigger className="bg-stone-800 border-stone-700 mt-1 text-xs h-8" data-testid="select-spell-duration-filter">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="all">All</SelectItem>
                                      {spellDurationOptions.map(duration => (
                                        <SelectItem key={duration} value={duration}>{duration}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={clearSpellLibraryFilters}
                                className="w-full bg-stone-800 border-stone-600 hover:bg-stone-700"
                                data-testid="button-clear-spell-library-filters"
                              >
                                Clear Filters
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        {systemSpells
                          .filter((spell: any) => {
                            const matchesSearch = spell.name.toLowerCase().includes(spellLibrarySearch.toLowerCase()) ||
                              spell.description?.toLowerCase().includes(spellLibrarySearch.toLowerCase());
                            const matchesActionType = spellActionTypeLibraryFilter === 'all' || 
                              spell.castingTime?.toLowerCase() === spellActionTypeLibraryFilter;
                            const matchesEnergy = spellEnergyLibraryFilter === 'all' || String(spell.energyCost) === spellEnergyLibraryFilter;
                            const matchesDamageType = spellDamageTypeLibraryFilter === 'all' || spell.damageType === spellDamageTypeLibraryFilter;
                            const matchesAttribute = spellAttributeLibraryFilter === 'all' || spell.attribute === spellAttributeLibraryFilter;
                            const matchesAoe = spellAoeLibraryFilter === 'all' || 
                              (spellAoeLibraryFilter === 'yes' && spell.isAoe) || 
                              (spellAoeLibraryFilter === 'no' && !spell.isAoe);
                            const matchesDuration = spellDurationLibraryFilter === 'all' || spell.duration === spellDurationLibraryFilter;
                            return matchesSearch && matchesActionType && matchesEnergy && matchesDamageType && matchesAttribute && matchesAoe && matchesDuration;
                          })
                          .map((spell: any) => (
                            <div
                              key={spell.id}
                              className="p-3 bg-stone-800 rounded-lg border border-stone-700 hover:border-purple-500 cursor-pointer"
                              onClick={() => {
                                // Generate the aoe field from aoeShape:aoeRange if isAoe is true
                                // This is needed because spells table only has "aoe" field, not separate isAoe/aoeShape/aoeRange
                                let aoeValue = spell.aoe;
                                if (spell.isAoe && spell.aoeShape && spell.aoeRange) {
                                  aoeValue = `${spell.aoeShape}:${spell.aoeRange}`;
                                }
                                createSpellMutation.mutate({
                                  name: spell.name,
                                  description: spell.description,
                                  image: spell.icon || undefined,
                                  level: spell.level || 0,
                                  school: spell.school,
                                  damage: spell.damageDice,
                                  damageDice: spell.damageDice,
                                  damageType: spell.damageType,
                                  range: spell.rangeNum,
                                  aoe: aoeValue,
                                  castingTime: spell.castingTime,
                                  duration: spell.duration,
                                  attribute: spell.attribute,
                                  energyCost: spell.energyCost,
                                });
                                setShowAddSpell(false);
                                setSpellLibrarySearch('');
                              }}
                              data-testid={`spell-library-item-${spell.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-stone-700 rounded flex items-center justify-center overflow-hidden">
                                  {spell.icon ? (
                                    <img src={spell.icon} alt={spell.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Sparkles className="h-5 w-5 text-purple-400" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-stone-100">{spell.name}</span>
                                    <Badge className="bg-cyan-600/30 text-cyan-300 text-xs">
                                      {spell.energyCost !== undefined ? `${spell.energyCost} Energy` : '0 Energy'}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-stone-400">
                                    <span className={spell.castingTime?.toLowerCase().includes('bonus') ? 'text-blue-400' : 'text-red-400'}>
                                      {spell.castingTime?.toLowerCase().includes('bonus') ? 'Bonus Action' : 'Action'}
                                    </span>
                                    {spell.rangeNum && <span>| {spell.rangeNum}ft</span>}
                                    {spell.damageDice && <span>| {spell.damageDice} {spell.damageType}</span>}
                                    {spell.duration && <span>| {spell.duration}</span>}
                                  </div>
                                  {spell.description && (
                                    <p className="text-xs text-stone-500 mt-1 line-clamp-1">{spell.description}</p>
                                  )}
                                </div>
                                <Plus className="h-5 w-5 text-purple-400" />
                              </div>
                            </div>
                          ))}
                        {systemSpells.filter((spell: any) => {
                          const matchesSearch = spell.name.toLowerCase().includes(spellLibrarySearch.toLowerCase()) ||
                            spell.description?.toLowerCase().includes(spellLibrarySearch.toLowerCase());
                          const matchesActionType = spellActionTypeLibraryFilter === 'all' || 
                            spell.castingTime?.toLowerCase() === spellActionTypeLibraryFilter;
                          const matchesEnergy = spellEnergyLibraryFilter === 'all' || String(spell.energyCost) === spellEnergyLibraryFilter;
                          const matchesDamageType = spellDamageTypeLibraryFilter === 'all' || spell.damageType === spellDamageTypeLibraryFilter;
                          const matchesAttribute = spellAttributeLibraryFilter === 'all' || spell.attribute === spellAttributeLibraryFilter;
                          const matchesAoe = spellAoeLibraryFilter === 'all' || 
                            (spellAoeLibraryFilter === 'yes' && spell.isAoe) || 
                            (spellAoeLibraryFilter === 'no' && !spell.isAoe);
                          const matchesDuration = spellDurationLibraryFilter === 'all' || spell.duration === spellDurationLibraryFilter;
                          return matchesSearch && matchesActionType && matchesEnergy && matchesDamageType && matchesAttribute && matchesAoe && matchesDuration;
                        }).length === 0 && (
                          <div className="text-center py-8 text-stone-400">
                            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p>No spells found{hasActiveSpellLibraryFilters ? ' matching filters' : ' in the library'}</p>
                            <p className="text-xs mt-1">Ask your GM to add spells in Admin Settings</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Create Tab or Edit Mode */}
                  {(editSpellData || spellDialogTab === 'create') && (
                    <div className="space-y-4 py-2">
                      <div className="space-y-3">
                        <div>
                          <Label>Spell Name *</Label>
                          <Input
                            value={spellFormData.name}
                            onChange={(e) => setSpellFormData({ ...spellFormData, name: e.target.value })}
                            className="bg-stone-800 border-stone-700"
                            data-testid="input-spell-name"
                          />
                        </div>

                        <div>
                          <Label>Spell Image</Label>
                          <div className="flex items-center gap-2 mt-1">
                            {spellFormData.image ? (
                              <div className="relative">
                                <img src={spellFormData.image} alt="Spell" className="h-12 w-12 rounded object-cover border border-stone-600" />
                                <button 
                                  type="button"
                                  onClick={() => setSpellFormData({...spellFormData, image: ''})}
                                  className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full h-4 w-4 text-xs flex items-center justify-center hover:bg-red-500"
                                >×</button>
                              </div>
                            ) : (
                              <div className="h-12 w-12 rounded bg-stone-800 border border-stone-600 flex items-center justify-center text-stone-500">
                                <ImageIcon className="h-6 w-6" />
                              </div>
                            )}
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setShowSpellImageBrowser(true)}
                              className="bg-stone-800 border-stone-600 hover:bg-stone-700"
                              data-testid="button-browse-spell-image"
                            >
                              <FolderOpen className="h-4 w-4 mr-1" /> Choose Image
                            </Button>
                          </div>
                          
                          <ImageBrowser
                            open={showSpellImageBrowser}
                            onOpenChange={setShowSpellImageBrowser}
                            onSelect={(imageBase64) => {
                              setSpellFormData({...spellFormData, image: imageBase64});
                            }}
                            title="Select Spell Image"
                          />
                        </div>

                        <div>
                          <Label>Description</Label>
                          <Textarea
                            value={spellFormData.description}
                            onChange={(e) => setSpellFormData({ ...spellFormData, description: e.target.value })}
                            className="bg-stone-800 border-stone-700 min-h-[60px]"
                            placeholder="Describe what the spell does..."
                            data-testid="textarea-spell-description"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Label>Damage Dice</Label>
                              {!isGM && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Lock className="h-3 w-3 text-amber-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Only GMs can edit this field</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <Input
                              value={spellFormData.damageDice}
                              onChange={(e) => setSpellFormData({ ...spellFormData, damageDice: e.target.value })}
                              placeholder="2d6"
                              className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                              disabled={!isGM}
                              data-testid="input-spell-damage-dice"
                            />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <Label>Damage Type</Label>
                              {!isGM && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Lock className="h-3 w-3 text-amber-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Only GMs can edit this field</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <Select 
                              value={spellFormData.damageType || '_none'} 
                              onValueChange={(v) => setSpellFormData({ ...spellFormData, damageType: v === '_none' ? '' : v })}
                              disabled={!isGM}
                            >
                              <SelectTrigger className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`} data-testid="select-spell-damage-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">None</SelectItem>
                                {spellDamageTypes.map((type) => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {spellFormData.damageType === 'Energy' && (
                          <div className="flex items-center gap-2 p-2 bg-stone-800/50 rounded border border-cyan-800/50">
                            <Checkbox
                              id="spellGainEnergy"
                              checked={spellFormData.gainEnergy}
                              onCheckedChange={(checked) => setSpellFormData({ ...spellFormData, gainEnergy: checked === true })}
                              disabled={!isGM}
                              data-testid="checkbox-spell-gain-energy"
                            />
                            <Label htmlFor="spellGainEnergy" className="text-sm text-cyan-300 cursor-pointer">
                              Gain Energy? (If checked, roll adds energy instead of subtracting)
                            </Label>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Label>Range (feet)</Label>
                              {!isGM && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Lock className="h-3 w-3 text-amber-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Only GMs can edit this field</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <Input
                              type="number"
                              min="0"
                              value={spellFormData.range}
                              onChange={(e) => handleSpellNumericChange('range', e.target.value)}
                              placeholder="30"
                              className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                              disabled={!isGM}
                              data-testid="input-spell-range"
                            />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <Label>Energy Cost</Label>
                              {!isGM && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Lock className="h-3 w-3 text-amber-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Only GMs can edit this field</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <Input
                              type="number"
                              min="0"
                              value={spellFormData.energyCost}
                              onChange={(e) => handleSpellNumericChange('energyCost', e.target.value)}
                              className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                              disabled={!isGM}
                              data-testid="input-spell-energy-cost"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Action Type</Label>
                            <Select 
                              value={spellFormData.castingTime} 
                              onValueChange={(v) => setSpellFormData({ ...spellFormData, castingTime: v })}
                            >
                              <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-action-type">
                                <SelectValue placeholder="Select action type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="action">Action</SelectItem>
                                <SelectItem value="bonus action">Bonus Action</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Duration</Label>
                            <Select 
                              value={spellFormData.duration} 
                              onValueChange={(v) => setSpellFormData({ ...spellFormData, duration: v })}
                            >
                              <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-spell-duration">
                                <SelectValue placeholder="Select duration" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Instant">Instant</SelectItem>
                                <SelectItem value="1 Round">1 Round</SelectItem>
                                <SelectItem value="1 Minute">1 Minute</SelectItem>
                                <SelectItem value="10 Minutes">10 Minutes</SelectItem>
                                <SelectItem value="30 Minutes">30 Minutes</SelectItem>
                                <SelectItem value="1 Hour">1 Hour</SelectItem>
                                <SelectItem value="6 Hours">6 Hours</SelectItem>
                                <SelectItem value="12 Hours">12 Hours</SelectItem>
                                <SelectItem value="1 Day">1 Day</SelectItem>
                                <SelectItem value="1 Week">1 Week</SelectItem>
                                <SelectItem value="1 Month">1 Month</SelectItem>
                                <SelectItem value="1 Year">1 Year</SelectItem>
                                <SelectItem value="Permanent">Permanent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <Label>Attribute (for rolls)</Label>
                            {!isGM && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Lock className="h-3 w-3 text-amber-600" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Only GMs can edit this field</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <Select 
                            value={spellFormData.attribute || '_none'} 
                            onValueChange={(v) => setSpellFormData({ ...spellFormData, attribute: v === '_none' ? '' : v })}
                            disabled={!isGM}
                          >
                            <SelectTrigger className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`} data-testid="select-spell-attribute">
                              <SelectValue placeholder="Select attribute" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">None</SelectItem>
                              {spellAttributes.map((attr) => (
                                <SelectItem key={attr} value={attr}>{attr.charAt(0).toUpperCase() + attr.slice(1)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id="spell-isattack"
                              checked={spellFormData.isAttack}
                              onCheckedChange={(checked) => setSpellFormData({ ...spellFormData, isAttack: checked === true })}
                              className="border-stone-600"
                              data-testid="checkbox-spell-isattack"
                            />
                            <Label htmlFor="spell-isattack" className="cursor-pointer">Attack?</Label>
                            <span className="text-xs text-stone-500">(If checked: Attack/Damage rolls. If not: Use/Effect rolls)</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {!isGM && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Lock className="h-3 w-3 text-amber-600" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Only GMs can edit this field</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <Checkbox
                              id="spell-aoe"
                              checked={spellFormData.isAoe}
                              onCheckedChange={(checked) => setSpellFormData({ ...spellFormData, isAoe: checked === true })}
                              className="border-stone-600"
                              disabled={!isGM}
                              data-testid="checkbox-spell-aoe"
                            />
                            <Label htmlFor="spell-aoe" className="cursor-pointer">Area of Effect (AoE)</Label>
                          </div>
                          {spellFormData.isAoe && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>AoE Shape</Label>
                                <Select 
                                  value={spellFormData.aoeShape || '_none'} 
                                  onValueChange={(v) => setSpellFormData({ ...spellFormData, aoeShape: v === '_none' ? '' : v })}
                                  disabled={!isGM}
                                >
                                  <SelectTrigger className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`} data-testid="select-spell-aoe-shape">
                                    <SelectValue placeholder="Select shape" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_none">None</SelectItem>
                                    <SelectItem value="circle">Circle</SelectItem>
                                    <SelectItem value="square">Square</SelectItem>
                                    <SelectItem value="cone">Cone</SelectItem>
                                    <SelectItem value="line">Line</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>AoE Range (feet)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={spellFormData.aoeRange}
                                  onChange={(e) => handleSpellNumericChange('aoeRange', e.target.value)}
                                  placeholder="e.g. 15"
                                  className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                                  disabled={!isGM}
                                  data-testid="input-spell-aoe-range"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setShowAddSpell(false)}>
                          Cancel
                        </Button>
                        <Button 
                          type="button" 
                          onClick={handleSpellFormSubmit}
                          className="bg-purple-600 hover:bg-purple-700"
                          data-testid="button-save-spell"
                        >
                          {editSpellData ? 'Update Spell' : 'Add Spell'}
                        </Button>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>

            {/* Spell Library Dialog - REMOVED - Now integrated into Add Magic dialog */}
            {/* Keeping showSpellLibrary for backward compat but it's no longer used */}
            <Dialog open={false} onOpenChange={setShowSpellLibrary}>
              <DialogContent className="max-w-2xl bg-stone-900 border-stone-700 max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-purple-400 flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Spell Library
                  </DialogTitle>
                </DialogHeader>
                <div className="mb-4">
                  <Input
                    placeholder="Search spells..."
                    value={spellLibrarySearch}
                    onChange={(e) => setSpellLibrarySearch(e.target.value)}
                    className="bg-stone-800 border-stone-700"
                    data-testid="input-spell-library-search"
                  />
                </div>
                <ScrollArea className="flex-1 max-h-[50vh]">
                  <div className="space-y-2">
                    {systemSpells
                      .filter((spell: any) =>
                        spell.name.toLowerCase().includes(spellLibrarySearch.toLowerCase()) ||
                        spell.description?.toLowerCase().includes(spellLibrarySearch.toLowerCase())
                      )
                      .map((spell: any) => (
                        <div
                          key={spell.id}
                          className="p-3 bg-stone-800 rounded-lg border border-stone-700 hover:border-purple-500 cursor-pointer"
                          onClick={() => {
                            // Generate the aoe field from aoeShape:aoeRange if isAoe is true
                            let aoeValue = spell.aoe;
                            if (spell.isAoe && spell.aoeShape && spell.aoeRange) {
                              aoeValue = `${spell.aoeShape}:${spell.aoeRange}`;
                            }
                            createSpellMutation.mutate({
                              name: spell.name,
                              description: spell.description,
                              image: spell.icon || undefined,
                              level: spell.level || 0,
                              school: spell.school,
                              damage: spell.damageDice,
                              damageDice: spell.damageDice,
                              healingDice: spell.healingDice,
                              damageType: spell.damageType,
                              range: spell.range,
                              rangeNum: spell.rangeNum,
                              aoe: aoeValue,
                              castingTime: spell.castingTime,
                              duration: spell.duration,
                              attribute: spell.attribute,
                              energyCost: spell.energyCost,
                              mod: spell.mod || 0,
                              isAoe: spell.isAoe || false,
                              aoeRange: spell.aoeRange,
                              aoeShape: spell.aoeShape,
                              isAttack: spell.isAttack ?? true,
                              gainEnergy: spell.gainEnergy || false,
                            });
                            setSpellLibrarySearch('');
                          }}
                          data-testid={`spell-library-item-${spell.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-stone-700 rounded flex items-center justify-center overflow-hidden">
                              {spell.icon ? (
                                <img src={spell.icon} alt={spell.name} className="w-full h-full object-cover" />
                              ) : (
                                <Sparkles className="h-5 w-5 text-purple-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-stone-100">{spell.name}</span>
                                <Badge className="bg-cyan-600/30 text-cyan-300 text-xs">
                                  {spell.energyCost !== undefined ? `${spell.energyCost} Energy` : '0 Energy'}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-1 text-xs text-stone-400">
                                <span className={spell.castingTime?.toLowerCase().includes('bonus') ? 'text-blue-400' : 'text-red-400'}>
                                  {spell.castingTime?.toLowerCase().includes('bonus') ? 'Bonus Action' : 'Action'}
                                </span>
                                {spell.rangeNum && <span>| {spell.rangeNum}ft</span>}
                                {spell.damageDice && <span>| {spell.damageDice} {spell.damageType}</span>}
                                {spell.duration && <span>| {spell.duration}</span>}
                              </div>
                              {spell.description && (
                                <p className="text-xs text-stone-500 mt-1 line-clamp-1">{spell.description}</p>
                              )}
                            </div>
                            <Plus className="h-5 w-5 text-purple-400" />
                          </div>
                        </div>
                      ))}
                    {systemSpells.filter((spell: any) =>
                      spell.name.toLowerCase().includes(spellLibrarySearch.toLowerCase())
                    ).length === 0 && (
                      <div className="text-center py-8 text-stone-400">
                        <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>No spells found in the library</p>
                        <p className="text-xs mt-1">Ask your GM to add spells in Admin Settings</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>

            {/* Spell Detail Dialog */}
            <Dialog open={showSpellDetail} onOpenChange={setShowSpellDetail}>
              <DialogContent className="max-w-2xl bg-stone-900 border-stone-700">
                {selectedSpell && (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-purple-400 flex items-center gap-2">
                        {selectedSpell.image ? (
                          <img src={selectedSpell.image} alt={selectedSpell.name} className="w-8 h-8 rounded" />
                        ) : (
                          <Sparkles className={`h-6 w-6 ${getSpellLevelColor(selectedSpell.level)}`} />
                        )}
                        {selectedSpell.name}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Badge className="bg-cyan-600/30 text-cyan-300">
                          {selectedSpell.energyCost !== undefined ? `${selectedSpell.energyCost} Energy` : '0 Energy'}
                        </Badge>
                        <Badge className={selectedSpell.castingTime?.toLowerCase().includes('bonus') ? 'bg-blue-600/30 text-blue-300' : 'bg-red-600/30 text-red-300'}>
                          {selectedSpell.castingTime?.toLowerCase().includes('bonus') ? 'Bonus Action' : 'Action'}
                        </Badge>
                        {selectedSpell.isEquipped && (
                          <Badge variant="outline" className="bg-amber-900 text-amber-100 border-amber-700">
                            Equipped
                          </Badge>
                        )}
                      </div>

                      {selectedSpell.description && (
                        <div>
                          <Label className="text-xs text-stone-400">Description</Label>
                          <p className="text-sm text-stone-300 mt-1">{selectedSpell.description}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        {selectedSpell.castingTime && (
                          <div>
                            <Label className="text-xs text-stone-400">Casting Time</Label>
                            <p className="text-sm text-stone-100">{selectedSpell.castingTime}</p>
                          </div>
                        )}
                        {selectedSpell.duration && (
                          <div>
                            <Label className="text-xs text-stone-400">Duration</Label>
                            <p className="text-sm text-stone-100">{selectedSpell.duration}</p>
                          </div>
                        )}
                        {selectedSpell.range && (
                          <div>
                            <Label className="text-xs text-stone-400">Range</Label>
                            <p className="text-sm text-stone-100">{selectedSpell.range} feet</p>
                          </div>
                        )}
                        {selectedSpell.aoe && (
                          <div>
                            <Label className="text-xs text-stone-400">Area of Effect</Label>
                            <p className="text-sm text-stone-100">{selectedSpell.aoe}</p>
                          </div>
                        )}
                        {selectedSpell.damage && (
                          <div>
                            <Label className="text-xs text-stone-400">Damage</Label>
                            <p className="text-sm text-stone-100">
                              {selectedSpell.damage} {selectedSpell.damageType || ''}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Roll Buttons */}
                      <div className="flex gap-2 pt-4 border-t border-stone-700">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-purple-900/50 hover:bg-purple-800/50 border-purple-700 text-purple-300"
                          onClick={async () => {
                            // Check and deduct energy cost
                            const energyCost = selectedSpell.energyCost || 0;
                            const currentEnergy = character.energy || 0;
                            
                            if (energyCost > 0 && currentEnergy < energyCost) {
                              triggerRollNotification({
                                type: 'system',
                                label: `Not Enough Energy!`,
                                result: 0,
                                total: 0,
                                username: character.name || 'Unknown',
                                characterName: character.name,
                                calculationBreakdown: `${selectedSpell.name} requires ${energyCost} energy but you only have ${currentEnergy}.`,
                              });
                              return;
                            }
                            
                            // Deduct energy cost
                            if (energyCost > 0) {
                              try {
                                await api.updateCharacter(character.id, { energy: currentEnergy - energyCost });
                                queryClient.invalidateQueries({ queryKey: ['character', character.id] });
                              } catch (err) {
                                console.error('Failed to deduct energy:', err);
                              }
                            }
                            
                            const attrName = selectedSpell.attribute || 'wit';
                            const attrKey = attrName.toLowerCase() as keyof typeof character;
                            const attrMod = typeof character[attrKey] === 'number' ? (character[attrKey] as number) : 0;
                            const roll = Math.floor(Math.random() * 20) + 1;
                            const total = roll + attrMod;
                            
                            const attrDisplayName = attrName.charAt(0).toUpperCase() + attrName.slice(1);
                            const calculationBreakdown = attrMod !== 0 
                              ? `1d20 = ${roll} + ${attrDisplayName} (${attrMod >= 0 ? '+' : ''}${attrMod})`
                              : `1d20 = ${roll}`;
                            
                            triggerRollNotification({
                              type: 'attack',
                              dieType: 'd20',
                              label: `${selectedSpell.name} Attack`,
                              result: roll,
                              modifier: attrMod,
                              total,
                              username: character.name || 'Unknown',
                              characterName: character.name,
                              calculationBreakdown,
                            });
                            
                            if (character.campaignId) {
                              const chatText = `${selectedSpell.name} Attack: ${calculationBreakdown} = ${total}`;
                              gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
                            }
                          }}
                          data-testid="button-spell-attack-roll"
                        >
                          <Dice5 className="h-4 w-4 mr-1" />
                          Attack
                        </Button>
                        {(selectedSpell.damageDice || selectedSpell.damage) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-red-900/50 hover:bg-red-800/50 border-red-700 text-red-300"
                            onClick={() => {
                              const isHealing = selectedSpell.damageType === 'Health';
                              const diceNotation = isHealing ? (selectedSpell.healingDice || selectedSpell.damageDice || selectedSpell.damage) : (selectedSpell.damageDice || selectedSpell.damage);
                              
                              if (!diceNotation) return;
                              
                              const match = diceNotation.match(/(\d+)d(\d+)/i);
                              let result = 0;
                              let dieType = 'd20';
                              if (match) {
                                const count = parseInt(match[1]);
                                const sides = parseInt(match[2]);
                                for (let i = 0; i < count; i++) {
                                  result += Math.floor(Math.random() * sides) + 1;
                                }
                                dieType = `d${sides}`;
                              }
                              
                              const mod = typeof selectedSpell.mod === 'number' ? selectedSpell.mod : (parseInt(selectedSpell.mod) || 0);
                              const total = (result || 0) + mod;
                              
                              const calculationBreakdown = mod !== 0 
                                ? `${diceNotation} = ${result} + Mod (${mod >= 0 ? '+' : ''}${mod})`
                                : `${diceNotation} = ${result}`;
                              
                              const label = isHealing ? `${selectedSpell.name} Healing` : `${selectedSpell.name} Damage`;
                              const damageTypeDisplay = selectedSpell.damageType ? ` (${selectedSpell.damageType})` : '';
                              
                              triggerRollNotification({
                                type: 'attack',
                                dieType: dieType as any,
                                label,
                                result,
                                modifier: mod,
                                total,
                                username: character.name || 'Unknown',
                                characterName: character.name,
                                calculationBreakdown,
                              });
                              
                              if (character.campaignId) {
                                const chatText = `${label}: ${calculationBreakdown} = ${total}${damageTypeDisplay}`;
                                gameWs.sendChatMessage(character.userId || '', character.name || 'Unknown', chatText, 'roll');
                              }
                            }}
                            data-testid="button-spell-damage-roll"
                          >
                            <Zap className="h-4 w-4 mr-1" />
                            {selectedSpell.damageType === 'Health' ? 'Heal' : 'Damage'}
                          </Button>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        {isGM && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditSpellData(selectedSpell);
                                setShowSpellDetail(false);
                                setShowAddSpell(true);
                              }}
                              data-testid="button-edit-spell"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => setShowSpellDeleteConfirm(true)}
                              data-testid="button-delete-spell"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSpellDetail(false)}
                          className="ml-auto"
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>

            {/* Spell Delete Confirmation Dialog */}
            <AlertDialog open={showSpellDeleteConfirm} onOpenChange={setShowSpellDeleteConfirm}>
              <AlertDialogContent className="bg-stone-900 border-stone-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-stone-200">Delete Spell</AlertDialogTitle>
                  <AlertDialogDescription className="text-stone-400">
                    Are you sure you want to delete "{selectedSpell?.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-600">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => {
                      if (selectedSpell) {
                        deleteSpellMutation.mutate(selectedSpell.id);
                      }
                    }}
                    data-testid="button-confirm-delete-spell"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* HOTBARS TAB */}
          <TabsContent value="hotbars" className="space-y-4 mt-0" data-testid="content-hotbars">
            <HotbarsTabContent character={character} isGM={isGM} isOwner={isOwner} />
          </TabsContent>

          {/* BACKGROUND TAB */}
          <TabsContent value="background" className="space-y-4 mt-0" data-testid="content-background">
            <Card className="bg-stone-800 border-stone-700">
              <CardContent className="space-y-4 pt-4">
                {/* Portrait Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label className="text-sm text-stone-300">Character Portrait</Label>
                    {canEdit && onUpdate && (
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setShowImageBrowser(true)}
                          data-testid="button-browse-library"
                        >
                          <FolderOpen className="h-4 w-4 mr-1" />
                          Library
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => portraitInputRef.current?.click()}
                          data-testid="button-upload-portrait"
                        >
                          <Camera className="h-4 w-4 mr-1" />
                          Upload
                        </Button>
                      </div>
                    )}
                  </div>
                  <input
                    ref={portraitInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePortraitUpload}
                    data-testid="input-portrait-file"
                  />
                  <div className="flex justify-center">
                    {character.portrait ? (
                      <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-amber-600/50 shadow-lg">
                        <img 
                          src={character.portrait} 
                          alt={character.name} 
                          className="w-full h-full object-cover"
                          data-testid="img-character-portrait"
                        />
                      </div>
                    ) : (
                      <div className="w-32 h-32 rounded-full bg-stone-700 border-4 border-stone-600 flex items-center justify-center">
                        <User className="h-12 w-12 text-stone-500" />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Image Browser Dialog */}
                <ImageBrowser
                  open={showImageBrowser}
                  onOpenChange={setShowImageBrowser}
                  onSelect={(imageBase64) => {
                    if (onUpdate) {
                      onUpdate({ portrait: imageBase64 });
                    }
                  }}
                  title="Select Character Portrait"
                />

                {/* Portrait Cropping Dialog */}
                <Dialog open={showPortraitCrop} onOpenChange={setShowPortraitCrop}>
                  <DialogContent className="bg-stone-900 border-stone-700 max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-amber-500">Crop Portrait</DialogTitle>
                      <DialogDescription className="text-stone-400">
                        Drag to position the crop area. The portrait will be cropped as a square for circular token display.
                      </DialogDescription>
                    </DialogHeader>
                    {uploadedImage && (
                      <div className="relative">
                        <div className="relative overflow-hidden bg-stone-800 rounded-lg" style={{ maxHeight: '400px' }}>
                          <img 
                            ref={cropImageRef}
                            src={uploadedImage} 
                            alt="Crop preview"
                            onLoad={handleImageLoad}
                            className="max-w-full"
                            style={{ display: 'block' }}
                          />
                          {/* Crop Overlay */}
                          <div 
                            className="absolute border-4 border-amber-500 bg-amber-500/10 cursor-move touch-none"
                            style={{
                              left: cropPosition.x,
                              top: cropPosition.y,
                              width: cropPosition.size,
                              height: cropPosition.size,
                              boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)'
                            }}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              (e.target as HTMLElement).setPointerCapture(e.pointerId);
                              
                              const initialPointerX = e.clientX;
                              const initialPointerY = e.clientY;
                              const initialCropX = cropPosition.x;
                              const initialCropY = cropPosition.y;
                              const currentSize = cropPosition.size;
                              
                              const handleMove = (moveEvent: PointerEvent) => {
                                const deltaX = moveEvent.clientX - initialPointerX;
                                const deltaY = moveEvent.clientY - initialPointerY;
                                
                                const maxX = imageDimensions.width - currentSize;
                                const maxY = imageDimensions.height - currentSize;
                                
                                const newX = Math.max(0, Math.min(maxX, initialCropX + deltaX));
                                const newY = Math.max(0, Math.min(maxY, initialCropY + deltaY));
                                setCropPosition(prev => ({ ...prev, x: newX, y: newY }));
                              };
                              
                              const handleUp = (upEvent: PointerEvent) => {
                                (upEvent.target as HTMLElement).releasePointerCapture(upEvent.pointerId);
                                document.removeEventListener('pointermove', handleMove);
                                document.removeEventListener('pointerup', handleUp);
                              };
                              
                              document.addEventListener('pointermove', handleMove);
                              document.addEventListener('pointerup', handleUp);
                            }}
                          />
                        </div>
                        {/* Size Slider */}
                        <div className="mt-4 space-y-2">
                          <Label className="text-stone-300">Crop Size</Label>
                          <input
                            type="range"
                            min="50"
                            max={Math.min(imageDimensions.width || 300, imageDimensions.height || 300)}
                            value={cropPosition.size}
                            onChange={(e) => {
                              const newSize = parseInt(e.target.value);
                              const maxX = Math.max(0, (imageDimensions.width || 300) - newSize);
                              const maxY = Math.max(0, (imageDimensions.height || 300) - newSize);
                              setCropPosition(prev => ({
                                x: Math.min(prev.x, maxX),
                                y: Math.min(prev.y, maxY),
                                size: newSize
                              }));
                            }}
                            className="w-full accent-amber-600"
                            data-testid="slider-crop-size"
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={handleCropCancel} data-testid="button-cancel-crop">
                        Cancel
                      </Button>
                      <Button onClick={handleCropConfirm} className="bg-amber-600 hover:bg-amber-700" data-testid="button-confirm-crop">
                        Save Portrait
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Biography Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label className="text-sm text-stone-300">Biography</Label>
                    {isOwner && !isEditingBio && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setIsEditingBio(true)}
                        data-testid="button-edit-biography"
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                  {isEditingBio ? (
                    <div className="space-y-2">
                      <Textarea
                        value={biography}
                        onChange={(e) => setBiography(e.target.value)}
                        className="min-h-[150px] bg-stone-900 border-stone-700"
                        placeholder="Write your character's biography..."
                        data-testid="textarea-biography"
                      />
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          onClick={handleSaveBiography}
                          data-testid="button-save-biography"
                        >
                          Save
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setBiography(character.biography || "");
                            setIsEditingBio(false);
                          }}
                          data-testid="button-cancel-biography"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="p-3 bg-stone-900 rounded border border-stone-700 min-h-[100px] text-stone-300"
                      data-testid="text-biography"
                    >
                      {character.biography || "No biography written yet."}
                    </div>
                  )}
                </div>

                {/* GM Notes Section (GM Only) */}
                {isGM && (
                  <div className="pt-4 border-t border-stone-700">
                    <div className="flex justify-between items-center mb-2">
                      <Label className="text-sm text-purple-400">GM Notes</Label>
                      {!isEditingGmNotes && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setIsEditingGmNotes(true)}
                          data-testid="button-edit-gm-notes"
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                    {isEditingGmNotes ? (
                      <div className="space-y-2">
                        <Textarea
                          value={gmNotes}
                          onChange={(e) => setGmNotes(e.target.value)}
                          className="min-h-[150px] bg-purple-950/20 border-purple-900/50"
                          placeholder="Private notes about this character (only visible to GM)..."
                          data-testid="textarea-gm-notes"
                        />
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={handleSaveGmNotes}
                            data-testid="button-save-gm-notes"
                          >
                            Save
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setGmNotes(character.gmNotes || "");
                              setIsEditingGmNotes(false);
                            }}
                            data-testid="button-cancel-gm-notes"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="p-3 bg-purple-950/20 rounded border border-purple-900/50 min-h-[100px] text-purple-200"
                        data-testid="text-gm-notes"
                      >
                        {character.gmNotes || "No GM notes yet."}
                      </div>
                    )}
                  </div>
                )}

                {/* Character Creation Date */}
                <div className="pt-4 border-t border-stone-700">
                  <Label className="text-xs text-stone-400">Created</Label>
                  <p className="text-sm text-stone-300" data-testid="text-created-date">
                    {character.createdAt ? new Date(character.createdAt).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>

                {/* Save to Admin Library (Admin Only, Campaign Characters Only) */}
                {isAdmin && !isTemplate && character.campaignId && (
                  <div className="pt-4 border-t border-stone-700">
                    <div className="flex justify-between items-center">
                      <div>
                        <Label className="text-sm text-amber-400">Admin Tools</Label>
                        <p className="text-xs text-stone-400">Save a copy of this character to the admin template library</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="border-amber-600 text-amber-400 hover:bg-amber-600/20"
                        onClick={() => setShowSaveToLibrary(true)}
                        data-testid="button-save-to-library"
                      >
                        <FolderOpen className="h-4 w-4 mr-1" />
                        Save to Library
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Save to Admin Library Confirmation Dialog */}
            <AlertDialog open={showSaveToLibrary} onOpenChange={setShowSaveToLibrary}>
              <AlertDialogContent className="bg-stone-900 border-stone-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-stone-200">Save to Admin Library</AlertDialogTitle>
                  <AlertDialogDescription className="text-stone-400">
                    This will create a copy of "{character.name}" in the admin character template library, including all items, spells, hotbars, custom skills, and traits.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-600">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => saveToLibraryMutation.mutate(null)}
                    disabled={saveToLibraryMutation.isPending}
                    data-testid="button-confirm-save-to-library"
                  >
                    {saveToLibraryMutation.isPending ? "Saving..." : "Save to Library"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>
        </div>
      </Tabs>

      {/* Item Detail Dialog */}
      <ItemDetailDialog
        item={selectedItem}
        open={showItemDetail}
        onOpenChange={(open) => {
          setShowItemDetail(open);
          if (!open) {
            setIsEditingItem(false);
            setEditItemData(null);
          }
        }}
        isGM={isGM}
        isOwner={isOwner}
        character={character}
        items={items}
        onUpdate={(data) => updateItemMutation.mutate({ id: selectedItem.id, data })}
        onDelete={() => deleteItemMutation.mutate(selectedItem.id)}
      />

      {/* Add/Edit Item Dialog */}
      <AddItemDialog 
        open={showAddItem}
        onOpenChange={setShowAddItem}
        onSave={(itemData) => createItemMutation.mutate(itemData)}
        isGM={isGM}
        campaignId={campaignId}
      />

      {/* Manage Templates Dialog (GM Only) */}
      {isGM && (
        <ManageTemplatesDialog
          open={showManageTemplates}
          onOpenChange={setShowManageTemplates}
          campaignId={campaignId}
        />
      )}

      {/* Roll Modifier Panel */}
      <Dialog open={rollPanelOpen} onOpenChange={(open) => {
        if (!open) {
          setRollPanelOpen(false);
          setHasAdvantage(false);
          setHasDisadvantage(false);
        }
      }}>
        <DialogContent className="sm:max-w-[300px] bg-stone-900 border-stone-700">
          <DialogHeader>
            <DialogTitle className="text-amber-500">{rollPanelData?.name} Roll</DialogTitle>
            <DialogDescription>
              Base modifier: {(rollPanelData?.modifier ?? 0) >= 0 ? '+' : ''}{rollPanelData?.modifier ?? 0}
              {rollPanelData?.modifier === 5 ? ' (d30)' : ' (d20)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-3">
              <Label className="text-stone-400">Extra Modifier:</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 w-10 p-0 border-stone-600 hover:bg-stone-700"
                  onClick={() => setExtraModifier(prev => prev - 1)}
                  data-testid="button-decrease-modifier"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div 
                  className="w-14 h-10 flex items-center justify-center text-xl font-bold text-amber-500 bg-stone-800 border border-stone-600 rounded-md"
                  data-testid="text-extra-modifier"
                >
                  {extraModifier >= 0 ? `+${extraModifier}` : extraModifier}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 w-10 p-0 border-stone-600 hover:bg-stone-700"
                  onClick={() => setExtraModifier(prev => prev + 1)}
                  data-testid="button-increase-modifier"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Advantage/Disadvantage Checkboxes */}
            <div className="flex items-center justify-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAdvantage}
                  onChange={(e) => setHasAdvantage(e.target.checked)}
                  className="w-5 h-5 rounded border-stone-600 bg-stone-800 text-green-500 focus:ring-green-500 focus:ring-offset-stone-900"
                  data-testid="checkbox-advantage"
                />
                <span className={`text-sm font-medium ${hasAdvantage ? 'text-green-400' : 'text-stone-400'}`}>
                  ADV
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasDisadvantage}
                  onChange={(e) => setHasDisadvantage(e.target.checked)}
                  className="w-5 h-5 rounded border-stone-600 bg-stone-800 text-red-500 focus:ring-red-500 focus:ring-offset-stone-900"
                  data-testid="checkbox-disadvantage"
                />
                <span className={`text-sm font-medium ${hasDisadvantage ? 'text-red-400' : 'text-stone-400'}`}>
                  DIS
                </span>
              </label>
            </div>
            
            {/* Info text when both are checked */}
            {hasAdvantage && hasDisadvantage && (
              <div className="text-center text-xs text-stone-500">
                ADV and DIS cancel out - rolling normally
              </div>
            )}
            
            <div className="text-center text-sm text-stone-400">
              Total: <span className="text-amber-500 font-semibold">{(rollPanelData?.modifier || 0) + extraModifier >= 0 ? '+' : ''}{(rollPanelData?.modifier || 0) + extraModifier}</span>
              {hasAdvantage && !hasDisadvantage && <span className="text-green-400 ml-2">[ADV]</span>}
              {hasDisadvantage && !hasAdvantage && <span className="text-red-400 ml-2">[DIS]</span>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollPanelOpen(false)} data-testid="button-cancel-roll">Cancel</Button>
            <Button 
              onClick={confirmRollFromPanel} 
              data-testid="button-confirm-roll"
            >
              Roll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Level-Up HP Dialog */}
      <Dialog open={showLevelUpHpDialog} onOpenChange={(open) => {
        if (!open) {
          setShowLevelUpHpDialog(false);
          setLevelUpHpResult(null);
        }
      }}>
        <DialogContent className="sm:max-w-[400px] bg-stone-900 border-stone-700">
          <DialogHeader>
            <DialogTitle className="text-green-400 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Level Up HP - Level {levelUpHpResult?.forLevel || rollingHpLevel}
              {targetHpLevel - (levelUpHpResult?.forLevel || rollingHpLevel) + 1 > 1 && (
                <span className="text-sm text-stone-400 font-normal">
                  ({targetHpLevel - (levelUpHpResult?.forLevel || rollingHpLevel) + 1} remaining)
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Roll {calculateDiceCount(rollingHpLevel)}d{hpPerLevel} to increase your maximum HP.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Current HP Info */}
            <div className="bg-stone-800 rounded-lg p-3 border border-stone-700">
              <div className="text-sm text-stone-400 space-y-1">
                <div className="flex justify-between">
                  <span>Base HP ({liveCharacter.race}):</span>
                  <span className="text-stone-200">{currentSpecies?.startingMaxHp || 10}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Bonus HP:</span>
                  <span className="text-green-400">+{liveCharacter.bonusHpFromLevelUps || 0}</span>
                </div>
                <div className="flex justify-between border-t border-stone-700 pt-1">
                  <span>Current Max HP:</span>
                  <span className="text-amber-400 font-bold">{liveCharacter.maxHp}</span>
                </div>
              </div>
            </div>
            
            {/* Roll Button or Result */}
            {!levelUpHpResult ? (
              <Button
                onClick={handleLevelUpHpRoll}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white h-14 text-lg"
                data-testid="button-roll-hp"
              >
                <Dice5 className="h-6 w-6 mr-2" />
                Roll {calculateDiceCount(rollingHpLevel)}d{hpPerLevel} for Level {rollingHpLevel}
              </Button>
            ) : (
              <div className="space-y-3">
                {/* Dice Roll Results */}
                <div className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 rounded-lg p-4 border border-green-700/50">
                  <div className="text-center">
                    <div className="text-sm text-stone-400 mb-2">
                      Level {levelUpHpResult.forLevel}: Rolled {levelUpHpResult.diceCount}d{levelUpHpResult.dieSize}
                    </div>
                    <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
                      {levelUpHpResult.diceRolls.map((roll, index) => (
                        <div 
                          key={index} 
                          className="w-10 h-10 bg-stone-800 rounded-lg border-2 border-green-500 flex items-center justify-center text-lg font-bold text-green-400"
                        >
                          {roll}
                        </div>
                      ))}
                    </div>
                    <div className="text-3xl font-bold text-green-400">
                      +{levelUpHpResult.total} HP
                    </div>
                  </div>
                </div>
                
                {/* Roll Next Level button if more levels remain */}
                {rollingHpLevel <= targetHpLevel && (
                  <Button
                    onClick={() => {
                      setLevelUpHpResult(null);
                      handleLevelUpHpRoll();
                    }}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white h-12"
                    data-testid="button-roll-hp-next"
                  >
                    <Dice5 className="h-5 w-5 mr-2" />
                    Roll Level {rollingHpLevel} ({calculateDiceCount(rollingHpLevel)}d{hpPerLevel})
                  </Button>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              onClick={() => {
                setShowLevelUpHpDialog(false);
                setLevelUpHpResult(null);
              }} 
              data-testid="button-close-level-up"
              className={levelUpHpResult && rollingHpLevel > targetHpLevel ? "bg-green-600 hover:bg-green-500" : ""}
            >
              {levelUpHpResult && rollingHpLevel > targetHpLevel ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Done
                </>
              ) : levelUpHpResult ? 'Close' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Level-Up Energy Dialog */}
      <Dialog open={showLevelUpEnergyDialog} onOpenChange={(open) => {
        if (!open) {
          setShowLevelUpEnergyDialog(false);
          setLevelUpEnergyResult(null);
        }
      }}>
        <DialogContent className="sm:max-w-[400px] bg-stone-900 border-stone-700">
          <DialogHeader>
            <DialogTitle className="text-blue-400 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Level Up Energy - Level {levelUpEnergyResult?.forLevel || rollingEnergyLevel}
              {targetEnergyLevel - (levelUpEnergyResult?.forLevel || rollingEnergyLevel) + 1 > 1 && (
                <span className="text-sm text-stone-400 font-normal">
                  ({targetEnergyLevel - (levelUpEnergyResult?.forLevel || rollingEnergyLevel) + 1} remaining)
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Roll {calculateEnergyDiceCount(rollingEnergyLevel)}d6 to increase your maximum Energy.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Current Energy Info */}
            <div className="bg-stone-800 rounded-lg p-3 border border-stone-700">
              <div className="text-sm text-stone-400 space-y-1">
                <div className="flex justify-between">
                  <span>Base Energy ({liveCharacter.race}):</span>
                  <span className="text-stone-200">{currentSpecies?.startingMaxEnergy || 10}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Bonus Energy:</span>
                  <span className="text-blue-400">+{liveCharacter.bonusEnergyFromLevelUps || 0}</span>
                </div>
                <div className="flex justify-between border-t border-stone-700 pt-1">
                  <span>Current Max Energy:</span>
                  <span className="text-amber-400 font-bold">{liveCharacter.maxEnergy}</span>
                </div>
              </div>
            </div>
            
            {/* Roll Button or Result */}
            {!levelUpEnergyResult ? (
              <Button
                onClick={handleLevelUpEnergyRoll}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white h-14 text-lg"
                data-testid="button-roll-energy"
              >
                <Dice5 className="h-6 w-6 mr-2" />
                Roll {calculateEnergyDiceCount(rollingEnergyLevel)}d6 for Level {rollingEnergyLevel}
              </Button>
            ) : (
              <div className="space-y-3">
                {/* Dice Roll Results */}
                <div className="bg-gradient-to-r from-blue-900/50 to-cyan-900/50 rounded-lg p-4 border border-blue-700/50">
                  <div className="text-center">
                    <div className="text-sm text-stone-400 mb-2">
                      Level {levelUpEnergyResult.forLevel}: Rolled {levelUpEnergyResult.diceCount}d{levelUpEnergyResult.dieSize}
                    </div>
                    <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
                      {levelUpEnergyResult.diceRolls.map((roll, index) => (
                        <div 
                          key={index} 
                          className="w-10 h-10 bg-stone-800 rounded-lg border-2 border-blue-500 flex items-center justify-center text-lg font-bold text-blue-400"
                        >
                          {roll}
                        </div>
                      ))}
                    </div>
                    <div className="text-3xl font-bold text-blue-400">
                      +{levelUpEnergyResult.total} Energy
                    </div>
                  </div>
                </div>
                
                {/* Roll Next Level button if more levels remain */}
                {rollingEnergyLevel <= targetEnergyLevel && (
                  <Button
                    onClick={() => {
                      setLevelUpEnergyResult(null);
                      handleLevelUpEnergyRoll();
                    }}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white h-12"
                    data-testid="button-roll-energy-next"
                  >
                    <Dice5 className="h-5 w-5 mr-2" />
                    Roll Level {rollingEnergyLevel} ({calculateEnergyDiceCount(rollingEnergyLevel)}d6)
                  </Button>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              onClick={() => {
                setShowLevelUpEnergyDialog(false);
                setLevelUpEnergyResult(null);
              }} 
              data-testid="button-close-energy-level-up"
              className={levelUpEnergyResult && rollingEnergyLevel > targetEnergyLevel ? "bg-blue-600 hover:bg-blue-500" : ""}
            >
              {levelUpEnergyResult && rollingEnergyLevel > targetEnergyLevel ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Done
                </>
              ) : levelUpEnergyResult ? 'Close' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feat Tree Viewer Dialog */}
      <Dialog open={showFeatTreeViewer} onOpenChange={setShowFeatTreeViewer}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[90vh] max-h-[90vh] sm:w-[90vw] sm:max-w-[90vw] bg-stone-900 border-stone-700 overflow-hidden flex flex-col p-3 sm:p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-purple-400 flex items-center gap-2 text-base sm:text-lg">
              <GitBranch className="h-4 w-4 sm:h-5 sm:w-5" />
              {featTreeData?.tree?.name || 'Feat Tree'}
            </DialogTitle>
            {featTreeData?.tree?.description && (
              <DialogDescription className="text-xs sm:text-sm">{featTreeData.tree.description}</DialogDescription>
            )}
          </DialogHeader>
          
          <div className="flex-1 min-h-0 overflow-hidden">
            {!featTreeData ? (
              <div className="text-center py-12 text-stone-400">
                <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No feat tree data available</p>
                <p className="text-sm mt-1">Ask your GM to set up feat trees</p>
              </div>
            ) : featTreeData.feats.length === 0 ? (
              <div className="text-center py-12 text-stone-400">
                <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>This feat tree has no feats yet</p>
                <p className="text-sm mt-1">Ask your GM to add feats in Admin Settings</p>
              </div>
            ) : (
              <FeatTreeViewerGrid 
                treeData={featTreeData}
                characterFeats={characterFeats}
                characterId={liveCharacter.id}
                canEdit={canEditSheet}
                characterLevel={liveCharacter.level}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Feat Tree Viewer Grid Component - Pan/zoom navigation
function FeatTreeViewerGrid({ 
  treeData, 
  characterFeats, 
  characterId,
  canEdit,
  characterLevel = 1
}: { 
  treeData: FeatTreeWithData;
  characterFeats: CharacterFeat[];
  characterId: string;
  canEdit: boolean;
  characterLevel?: number;
}) {
  const queryClient = useQueryClient();
  const [selectedFeat, setSelectedFeat] = useState<Feat | null>(null);
  
  const NODE_WIDTH = 160;
  const NODE_HEIGHT = 100;
  const CELL_SIZE = 100;
  const WORLD_SIZE = 20000;
  const WORLD_OFFSET = WORLD_SIZE / 2;
  
  const unlockedFeatIds = new Set(characterFeats.map(cf => cf.featId));
  const { feats, connections, tree } = treeData;
  
  // Calculate feat points: 2 base + level + (2 × floor(level/3)) = 3 points at level 1
  const totalFeatPoints = 2 + characterLevel + (2 * Math.floor(characterLevel / 3));
  const spentPoints = feats
    .filter((f: Feat) => unlockedFeatIds.has(f.id))
    .reduce((sum: number, f: Feat) => sum + (f.cost ?? 0), 0);
  const availablePoints = totalFeatPoints - spentPoints;
  
  // Pan/zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [, forceUpdate] = useState(0);
  const motionX = useMotionValue(0);
  const motionY = useMotionValue(0);
  const motionZoom = useMotionValue(1);
  
  // Gesture state
  type GestureMode = 'idle' | 'panning' | 'pinching';
  const gestureModeRef = useRef<GestureMode>('idle');
  const panStartRef = useRef({ x: 0, y: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const lastTouchDistanceRef = useRef<number | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  
  // Double-click tracking for feat nodes
  const lastClickTimeRef = useRef(0);
  const lastClickedFeatRef = useRef<string | null>(null);
  
  const unlockFeatMutation = useMutation({
    mutationFn: (featId: string) => api.unlockCharacterFeat(characterId, featId),
    onSuccess: (_, featId) => {
      queryClient.invalidateQueries({ queryKey: ['character-feats', characterId] });
      const feat = featById.get(featId);
      toast({ title: 'Feat Unlocked!', description: `You've unlocked ${feat?.name || selectedFeat?.name}` });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
  
  const canUnlockFeat = (feat: Feat) => {
    if (unlockedFeatIds.has(feat.id)) return false;
    if (availablePoints < (feat.cost || 1)) return false;
    const prereqConnections = connections.filter((c: FeatConnection) => c.toFeatId === feat.id);
    if (prereqConnections.length === 0) return true;
    return prereqConnections.some((conn: FeatConnection) => unlockedFeatIds.has(conn.fromFeatId));
  };
  
  const featById = new Map<string, Feat>();
  feats.forEach((f: Feat) => featById.set(f.id, f));
  
  // Initialize view on mount
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setViewportSize((prev) => {
            if (prev.width !== width || prev.height !== height) {
              return { width, height };
            }
            return prev;
          });
        }
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  // Reset view when viewport or tree changes - use default view if set (world-space coordinates)
  useEffect(() => {
    if (viewportSize.width > 0) {
      // Use default view if set (stored as world-space center coordinates)
      if (tree?.defaultViewX != null && tree?.defaultViewY != null) {
        const worldCenterX = tree.defaultViewX;
        const worldCenterY = tree.defaultViewY;
        const defaultZoom = tree.defaultViewZoom || 1;
        
        // Convert world-space center to viewport-relative pan
        const panX = viewportSize.width / 2 - worldCenterX * defaultZoom;
        const panY = viewportSize.height / 2 - worldCenterY * defaultZoom;
        
        panRef.current = { x: panX, y: panY };
        zoomRef.current = defaultZoom;
        motionX.set(panX);
        motionY.set(panY);
        motionZoom.set(defaultZoom);
        forceUpdate(n => n + 1);
        return;
      }
      
      // Fallback: Center on origin (0,0) in world space
      const centerX = viewportSize.width / 2;
      const centerY = viewportSize.height / 2;
      panRef.current = { x: centerX, y: centerY };
      zoomRef.current = 1;
      motionX.set(centerX);
      motionY.set(centerY);
      motionZoom.set(1);
      forceUpdate(n => n + 1);
    }
  }, [viewportSize.width, tree?.defaultViewX, tree?.defaultViewY]);
  
  // Wheel zoom handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const delta = -e.deltaY * 0.002;
      const newZoom = Math.max(0.3, Math.min(2, currentZoom + delta));
      
      if (Math.abs(newZoom - currentZoom) > 0.001) {
        // Zoom towards cursor
        const worldX = ((mouseX + WORLD_OFFSET - currentPan.x) / currentZoom) - WORLD_OFFSET;
        const worldY = ((mouseY + WORLD_OFFSET - currentPan.y) / currentZoom) - WORLD_OFFSET;
        
        const newPan = {
          x: mouseX + WORLD_OFFSET - (worldX + WORLD_OFFSET) * newZoom,
          y: mouseY + WORLD_OFFSET - (worldY + WORLD_OFFSET) * newZoom
        };
        
        panRef.current = newPan;
        zoomRef.current = newZoom;
        motionX.set(newPan.x);
        motionY.set(newPan.y);
        motionZoom.set(newZoom);
        forceUpdate(n => n + 1);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [motionX, motionY, motionZoom]);
  
  // Touch pinch-to-zoom handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        if (gestureModeRef.current === 'panning') {
          gestureModeRef.current = 'idle';
        }
        gestureModeRef.current = 'pinching';
        setIsPinching(true);
      } else if (e.touches.length === 1) {
        setIsPinching(false);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        gestureModeRef.current = 'pinching';
        setIsPinching(true);
        
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );

        if (lastTouchDistanceRef.current !== null) {
          const delta = (distance - lastTouchDistanceRef.current) * 0.005;
          const newZoom = Math.max(0.3, Math.min(2, currentZoom + delta));

          if (Math.abs(newZoom - currentZoom) > 0.001) {
            const rect = container.getBoundingClientRect();
            const centerX = ((touch1.clientX + touch2.clientX) / 2) - rect.left;
            const centerY = ((touch1.clientY + touch2.clientY) / 2) - rect.top;

            const worldX = ((centerX + WORLD_OFFSET - currentPan.x) / currentZoom) - WORLD_OFFSET;
            const worldY = ((centerY + WORLD_OFFSET - currentPan.y) / currentZoom) - WORLD_OFFSET;

            const newPan = {
              x: centerX + WORLD_OFFSET - (worldX + WORLD_OFFSET) * newZoom,
              y: centerY + WORLD_OFFSET - (worldY + WORLD_OFFSET) * newZoom
            };

            panRef.current = newPan;
            zoomRef.current = newZoom;
            motionX.set(newPan.x);
            motionY.set(newPan.y);
            motionZoom.set(newZoom);
            forceUpdate(n => n + 1);
          }
        }
        lastTouchDistanceRef.current = distance;
      }
    };

    const handleTouchEnd = () => {
      lastTouchDistanceRef.current = null;
      if (gestureModeRef.current === 'pinching') {
        gestureModeRef.current = 'idle';
        setIsPinching(false);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);
  
  // Pan handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPinching) return;
    if (e.button !== 0) return; // Only left click
    
    // Don't start panning if clicking on a feat node
    const target = e.target as HTMLElement;
    if (target.closest('[data-feat-node]')) return;
    
    e.currentTarget.setPointerCapture(e.pointerId);
    
    gestureModeRef.current = 'panning';
    panStartRef.current = { ...panRef.current };
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
    if (gestureModeRef.current !== 'panning') return;
    
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    
    const newPan = {
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    };
    
    panRef.current = newPan;
    motionX.set(newPan.x);
    motionY.set(newPan.y);
    forceUpdate(n => n + 1);
  };
  
  const handlePointerUp = (e: React.PointerEvent) => {
    gestureModeRef.current = 'idle';
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };
  
  // Generate bezier curve path with minimum curvature
  const generateCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const minCurve = 40;
    
    let horizontalOffset = dx * 0.4;
    if (Math.abs(horizontalOffset) < minCurve) {
      horizontalOffset = dx >= 0 ? minCurve : -minCurve;
    }
    
    let verticalOffset = dy * 0.3;
    if (Math.abs(verticalOffset) < minCurve * 0.75) {
      verticalOffset = dy >= 0 ? minCurve * 0.75 : -minCurve * 0.75;
    }
    
    const cx1 = x1 + horizontalOffset;
    const cy1 = y1 + verticalOffset;
    const cx2 = x2 - horizontalOffset;
    const cy2 = y2 - verticalOffset;
    
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  };

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Points display */}
      <div className="flex items-center justify-between mb-2 p-2 bg-purple-900/30 rounded-lg border border-purple-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-purple-400" />
          <span className="text-sm text-purple-300">Feat Points</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-purple-600">{availablePoints} available</Badge>
          <span className="text-xs text-stone-400">({spentPoints} / {totalFeatPoints} spent)</span>
        </div>
      </div>
      
      {/* Pan/zoom canvas - fills available space */}
      <div 
        ref={containerRef}
        className="relative overflow-hidden bg-gradient-to-br from-stone-900 via-purple-950/20 to-stone-900 rounded-lg border border-stone-700 cursor-grab active:cursor-grabbing flex-1 min-h-0"
        style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Infinite canvas world */}
        <motion.div
          className="absolute"
          style={{
            x: motionX,
            y: motionY,
            scale: motionZoom,
            width: WORLD_SIZE,
            height: WORLD_SIZE,
            left: -WORLD_OFFSET,
            top: -WORLD_OFFSET,
            transformOrigin: '0 0'
          }}
        >
          {/* Connection lines */}
          <svg 
            className="absolute pointer-events-none"
            style={{ width: WORLD_SIZE, height: WORLD_SIZE }}
          >
            {connections.map((conn: FeatConnection) => {
              const from = featById.get(conn.fromFeatId);
              const to = featById.get(conn.toFeatId);
              if (!from || !to) return null;
              
              const x1 = WORLD_OFFSET + from.gridX * CELL_SIZE + NODE_WIDTH / 2;
              const y1 = WORLD_OFFSET + from.gridY * CELL_SIZE + NODE_HEIGHT / 2;
              const x2 = WORLD_OFFSET + to.gridX * CELL_SIZE + NODE_WIDTH / 2;
              const y2 = WORLD_OFFSET + to.gridY * CELL_SIZE + NODE_HEIGHT / 2;
              
              const fromUnlocked = unlockedFeatIds.has(conn.fromFeatId);
              const toUnlocked = unlockedFeatIds.has(conn.toFeatId);
              
              let strokeColor = '#57534e';
              if (fromUnlocked && toUnlocked) {
                strokeColor = '#22c55e';
              } else if (fromUnlocked) {
                strokeColor = '#eab308';
              }
              
              const pathD = generateCurvePath(x1, y1, x2, y2);
              
              return (
                <path
                  key={conn.id}
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={3}
                />
              );
            })}
          </svg>
          
          {/* Feat nodes */}
          {feats.map((feat: Feat) => {
            const isUnlocked = unlockedFeatIds.has(feat.id);
            const canUnlock = canUnlockFeat(feat);
            
            let nodeStyle = '';
            if (isUnlocked) {
              nodeStyle = 'border-green-500 bg-gradient-to-br from-green-900/90 to-emerald-800/80 ring-2 ring-green-400/50';
            } else if (canUnlock) {
              nodeStyle = 'border-purple-500 bg-gradient-to-br from-purple-900/80 to-violet-800/70 hover:ring-2 hover:ring-amber-400';
            } else {
              nodeStyle = 'border-stone-600 bg-gradient-to-br from-stone-800/60 to-stone-900/80 opacity-60';
            }
            
            return (
              <div
                key={feat.id}
                className={`absolute rounded-xl border-2 cursor-pointer transition-all ${nodeStyle}`}
                style={{
                  left: WORLD_OFFSET + feat.gridX * CELL_SIZE,
                  top: WORLD_OFFSET + feat.gridY * CELL_SIZE,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  
                  const now = Date.now();
                  const isDoubleClick = lastClickedFeatRef.current === feat.id && now - lastClickTimeRef.current < 400;
                  
                  lastClickTimeRef.current = now;
                  lastClickedFeatRef.current = feat.id;
                  
                  // Always show the feat details
                  setSelectedFeat(feat);
                  
                  // On double-click, auto-unlock if possible
                  if (isDoubleClick && canEdit && canUnlock && !unlockFeatMutation.isPending) {
                    unlockFeatMutation.mutate(feat.id);
                  }
                }}
                data-testid={`feat-node-${feat.id}`}
                data-feat-node
              >
                <div className="h-full flex flex-col items-center justify-center p-2 text-center overflow-hidden">
                  {isUnlocked && (
                    <Check className="absolute top-1 right-1 h-4 w-4 text-green-400" />
                  )}
                  <div className="text-sm font-bold text-white truncate w-full">{feat.name}</div>
                  <Badge variant="secondary" className="text-[9px] mt-1 h-4 px-1.5 bg-stone-700/80">
                    Cost: {feat.cost}
                  </Badge>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
      
      {/* Feat Detail Panel - Overlay at bottom */}
      {selectedFeat && (
        <div className="absolute bottom-2 left-2 right-2 bg-gradient-to-br from-stone-800/95 to-stone-900/95 backdrop-blur-sm rounded-lg p-3 border border-stone-700 shadow-xl max-h-[40%] overflow-y-auto">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-bold text-lg text-amber-500">{selectedFeat.name}</h3>
              <Badge variant="secondary" className="mt-1">
                Cost: {selectedFeat.cost} point{selectedFeat.cost !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {unlockedFeatIds.has(selectedFeat.id) && (
                <Badge className="bg-green-600">Unlocked</Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedFeat(null)} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {selectedFeat.description && (
            <p className="text-sm text-stone-300 mb-3">{selectedFeat.description}</p>
          )}
          
          {selectedFeat.effects && (selectedFeat.effects as any[]).length > 0 && (
            <div className="mb-3">
              <Label className="text-xs text-stone-400">Effects:</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {(selectedFeat.effects as any[]).map((effect, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs border-purple-500/50 text-purple-300">
                    <Star className="h-3 w-3 mr-1 text-purple-400" />
                    {effect.type}: +{effect.value}{effect.target ? ` ${effect.target}` : ''}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {canEdit && !unlockedFeatIds.has(selectedFeat.id) && (
            <Button
              onClick={() => unlockFeatMutation.mutate(selectedFeat.id)}
              disabled={!canUnlockFeat(selectedFeat) || unlockFeatMutation.isPending}
              className={canUnlockFeat(selectedFeat) ? "w-full bg-purple-600 hover:bg-purple-500" : "w-full bg-stone-700"}
              data-testid="button-unlock-feat"
            >
              {unlockFeatMutation.isPending ? 'Unlocking...' : 
               canUnlockFeat(selectedFeat) 
                 ? `Unlock Feat (${selectedFeat.cost} point${selectedFeat.cost !== 1 ? 's' : ''})` 
                 : availablePoints < (selectedFeat.cost || 1) 
                   ? `Not Enough Points (need ${selectedFeat.cost})` 
                   : 'Prerequisites Not Met'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Add Item Dialog Component
function AddItemDialog({ open, onOpenChange, onSave, isGM, campaignId }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (data: any) => void; isGM: boolean; campaignId?: string }) {
  const [activeTab, setActiveTab] = useState<'templates' | 'create'>('templates');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateTypeFilter, setTemplateTypeFilter] = useState('all');
  const [templateRarityFilter, setTemplateRarityFilter] = useState('all');
  const [quantityPickerTemplate, setQuantityPickerTemplate] = useState<any>(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasActiveItemFilters = templateTypeFilter !== 'all' || templateRarityFilter !== 'all';

  const clearItemFilters = () => {
    setTemplateTypeFilter('all');
    setTemplateRarityFilter('all');
  };

  const itemTypeOptions = ['weapon', 'armor', 'consumable', 'utility', 'container', 'currency'];
  const rarityOptions = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  
  // For character templates (no campaignId), fetch system items directly
  const { data: systemItemsOnly } = useQuery({
    queryKey: ['system-items'],
    queryFn: () => api.getSystemItems(),
    enabled: !campaignId && open,
  });

  const { data: templateData } = useQuery({
    queryKey: ['template-items', campaignId],
    queryFn: () => api.getTemplateItems(campaignId!),
    enabled: !!campaignId && open,
  });

  // Combine items from either source - campaign templates or system items only
  const allTemplates = campaignId 
    ? [...(templateData?.systemItems || []), ...(templateData?.campaignItems || [])]
    : (systemItemsOnly || []);
  const filteredTemplates = allTemplates.filter((item: any) => {
    const matchesSearch = item.name.toLowerCase().includes(templateSearch.toLowerCase());
    const matchesType = templateTypeFilter === 'all' || item.itemType === templateTypeFilter;
    const matchesRarity = templateRarityFilter === 'all' || item.rarity === templateRarityFilter;
    return matchesSearch && matchesType && matchesRarity;
  });

  const handleTemplatePointerDown = (template: any) => {
    holdTimerRef.current = setTimeout(() => {
      setQuantityPickerTemplate(template);
      setAddQuantity(1);
    }, 400);
  };

  const handleTemplatePointerUp = (template: any) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      if (!quantityPickerTemplate) {
        handleAddFromTemplate(template, 1);
      }
    }
  };

  const handleTemplatePointerLeave = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleConfirmQuantity = () => {
    if (quantityPickerTemplate && addQuantity > 0) {
      handleAddFromTemplate(quantityPickerTemplate, addQuantity);
      setQuantityPickerTemplate(null);
      setAddQuantity(1);
    }
  };

  const [formData, setFormData] = useState<{
    name: string;
    image: string;
    description: string;
    itemType: string;
    rarity: string;
    quantity: number | string;
    damage: string;
    damageType: string;
    mod: number | string;
    range: number | string;
    aoe: string;
    attribute: string;
    size: string;
    weight: string;
    itemWeight: number | string;
    priceCopper: number | string;
    priceSilver: number | string;
    priceGold: number | string;
    pricePlatinum: number | string;
    durability: number;
    isContainer: boolean;
    carryCapacity: number | string;
    ammunitionType: string;
    weaponCategory: string;
    isHeavy: boolean;
    armorSlot: string;
    armorBonus: number | string;
    damageReduction: number | string;
    damageReductionType: string;
    rationServings: number | string;
    breakChance: number | string;
    isDamaging: boolean;
    isThrowable: boolean;
    throwableAoe: boolean;
    throwableAoeShape: string;
    throwableAoeRange: number | string;
    throwableAoeDamage: string;
    throwableAoeDamageType: string;
    throwablePickup: boolean;
    throwableBreakChance: number | string;
    canApplyEffects: boolean;
  }>({
    name: '',
    image: '',
    description: '',
    itemType: 'utility',
    rarity: 'common',
    quantity: 1,
    damage: '',
    damageType: '',
    mod: '',
    range: '',
    aoe: '',
    attribute: '',
    size: '',
    weight: 'light',
    itemWeight: '',
    priceCopper: '',
    priceSilver: '',
    priceGold: '',
    pricePlatinum: '',
    durability: 10,
    isContainer: false,
    carryCapacity: '',
    ammunitionType: '',
    weaponCategory: '',
    isHeavy: false,
    armorSlot: '',
    armorBonus: '',
    damageReduction: '',
    damageReductionType: '',
    rationServings: '',
    breakChance: 10,
    isDamaging: false,
    isThrowable: false,
    throwableAoe: false,
    throwableAoeShape: '',
    throwableAoeRange: 10,
    throwableAoeDamage: '',
    throwableAoeDamageType: '',
    throwablePickup: false,
    throwableBreakChance: 10,
    canApplyEffects: false,
  });

  const [showImageCrop, setShowImageCrop] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0, size: 150 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  
  // Image browser state for item images
  const [showItemImageBrowser, setShowItemImageBrowser] = useState(false);

  const handleAddFromTemplate = (template: any, quantity: number = 1) => {
    const itemData = {
      name: template.name,
      image: template.image || '',
      description: template.description || '',
      itemType: template.itemType,
      rarity: template.rarity,
      quantity: quantity,
      damage: template.damage || '',
      damageType: template.damageType || '',
      mod: template.mod || 0,
      range: template.range || 0,
      aoe: template.aoe || '',
      attribute: template.attribute || '',
      size: template.size || '',
      weight: template.weight || 'light',
      itemWeight: template.itemWeight || 0,
      priceCopper: template.priceCopper || 0,
      priceSilver: template.priceSilver || 0,
      priceGold: template.priceGold || 0,
      pricePlatinum: template.pricePlatinum || 0,
      durability: template.durability || 10,
      isContainer: template.isContainer || false,
      carryCapacity: template.carryCapacity || 0,
      ammunitionType: template.ammunitionType || '',
      weaponCategory: template.weaponCategory || '',
      isHeavy: template.isHeavy || false,
      armorSlot: template.armorSlot || '',
      armorBonus: template.armorBonus || 0,
      damageReduction: template.damageReduction || 0,
      damageReductionType: template.damageReductionType || '',
      breakChance: template.breakChance ?? 10,
      rationServings: template.rationServings || 0,
      isDamaging: template.isDamaging || false,
      isThrowable: template.isThrowable || false,
      throwableAoe: template.throwableAoe || false,
      throwableAoeShape: template.throwableAoeShape || '',
      throwableAoeRange: template.throwableAoeRange || 10,
      throwableAoeDamage: template.throwableAoeDamage || '',
      throwableAoeDamageType: template.throwableAoeDamageType || '',
      throwablePickup: template.throwablePickup || false,
      throwableBreakChance: template.throwableBreakChance ?? 10,
      canApplyEffects: template.canApplyEffects || false,
    };
    onSave(itemData);
  };

  const rarityColors: Record<string, string> = {
    common: 'bg-stone-600',
    uncommon: 'bg-green-600',
    rare: 'bg-blue-600',
    epic: 'bg-purple-600',
    legendary: 'bg-amber-600',
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
        setShowImageCrop(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageLoad = () => {
    if (cropImageRef.current) {
      const img = cropImageRef.current;
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const initialSize = Math.min(150, minDim);
      setCropPosition({
        x: (img.naturalWidth - initialSize) / 2,
        y: (img.naturalHeight - initialSize) / 2,
        size: initialSize
      });
    }
  };

  const handleCropDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropImageRef.current) return;
    const container = e.currentTarget.parentElement;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const img = cropImageRef.current;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    
    const handleMove = (moveEvent: PointerEvent) => {
      const relX = (moveEvent.clientX - rect.left) * scaleX;
      const relY = (moveEvent.clientY - rect.top) * scaleY;
      
      const newX = Math.max(0, Math.min(relX - cropPosition.size / 2, img.naturalWidth - cropPosition.size));
      const newY = Math.max(0, Math.min(relY - cropPosition.size / 2, img.naturalHeight - cropPosition.size));
      
      setCropPosition(prev => ({ ...prev, x: newX, y: newY }));
    };
    
    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
    
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  };

  const handleCropConfirm = () => {
    if (!uploadedImage || !cropImageRef.current) return;
    
    const canvas = document.createElement('canvas');
    const outputSize = 128;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(
        img,
        cropPosition.x, cropPosition.y, cropPosition.size, cropPosition.size,
        0, 0, outputSize, outputSize
      );
      const croppedImage = canvas.toDataURL('image/jpeg', 0.9);
      setFormData(prev => ({ ...prev, image: croppedImage }));
      setShowImageCrop(false);
      setUploadedImage(null);
      if (imageInputRef.current) imageInputRef.current.value = '';
    };
    img.src = uploadedImage;
  };

  const handleCropCancel = () => {
    setShowImageCrop(false);
    setUploadedImage(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleSubmit = () => {
    if (!formData.name) return;
    // Helper to convert empty strings to undefined for optional numeric fields
    const optionalNum = (val: string | number): number | undefined => {
      if (val === '' || val === undefined || val === null) return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };
    const cleanedData = {
      ...formData,
      mod: optionalNum(formData.mod),
      range: optionalNum(formData.range),
      itemWeight: optionalNum(formData.itemWeight),
      priceCopper: optionalNum(formData.priceCopper),
      priceSilver: optionalNum(formData.priceSilver),
      priceGold: optionalNum(formData.priceGold),
      pricePlatinum: optionalNum(formData.pricePlatinum),
      quantity: Number(formData.quantity) || 1,
      carryCapacity: optionalNum(formData.carryCapacity),
      armorBonus: optionalNum(formData.armorBonus),
      damageReduction: optionalNum(formData.damageReduction),
      rationServings: optionalNum(formData.rationServings),
      breakChance: Number(formData.breakChance) || 10,
      isDamaging: formData.isDamaging,
      isThrowable: formData.isThrowable,
      throwableAoe: formData.throwableAoe,
      throwableAoeShape: formData.throwableAoeShape || undefined,
      throwableAoeRange: optionalNum(formData.throwableAoeRange),
      throwableAoeDamage: formData.throwableAoeDamage || undefined,
      throwableAoeDamageType: formData.throwableAoeDamageType || undefined,
      throwablePickup: formData.throwablePickup,
      throwableBreakChance: formData.isThrowable ? (formData.throwableBreakChance === '' ? 10 : Number(formData.throwableBreakChance)) : 10,
      canApplyEffects: formData.itemType === 'weapon' ? formData.canApplyEffects : false,
    };
    onSave(cleanedData);
    setFormData({
      name: '',
      image: '',
      description: '',
      itemType: 'utility',
      rarity: 'common',
      quantity: 1,
      damage: '',
      damageType: '',
      mod: '',
      range: '',
      aoe: '',
      attribute: '',
      size: '',
      weight: 'light',
      itemWeight: '',
      priceCopper: '',
      priceSilver: '',
      priceGold: '',
      pricePlatinum: '',
      durability: 10,
      isContainer: false,
      carryCapacity: '',
      ammunitionType: '',
      weaponCategory: '',
      isHeavy: false,
      armorSlot: '',
      armorBonus: '',
      damageReduction: '',
      damageReductionType: '',
      rationServings: '',
      breakChance: 10,
      isDamaging: false,
      isThrowable: false,
      throwableAoe: false,
      throwableAoeShape: '',
      throwableAoeRange: 10,
      throwableAoeDamage: '',
      throwableAoeDamageType: '',
      throwablePickup: false,
      throwableBreakChance: 10,
      canApplyEffects: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-amber-500">Add Item</DialogTitle>
        </DialogHeader>
        
        {/* Tabs */}
        <div className="flex border-b border-stone-700 mb-4">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'templates' 
                ? 'text-amber-500 border-b-2 border-amber-500' 
                : 'text-stone-400 hover:text-stone-200'
            }`}
            data-testid="tab-templates"
          >
            From Library
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'create' 
                ? 'text-amber-500 border-b-2 border-amber-500' 
                : 'text-stone-400 hover:text-stone-200'
            }`}
            data-testid="tab-create"
          >
            Create New
          </button>
        </div>

        <ScrollArea className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {activeTab === 'templates' ? (
            <div className="space-y-4">
              {/* Search and Filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                  <Input
                    placeholder="Search items..."
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="pl-9 bg-stone-800 border-stone-700"
                    data-testid="input-template-search"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className={`bg-stone-800 border-stone-700 ${hasActiveItemFilters ? 'border-amber-500 text-amber-400' : ''}`}
                      data-testid="button-item-library-filter"
                    >
                      <Filter className="h-4 w-4" />
                      {hasActiveItemFilters && <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-stone-900 border-stone-700 p-4" align="end">
                    <div className="space-y-4">
                      <div className="font-medium text-stone-200">Filter Items</div>
                      <div>
                        <Label className="text-stone-400 text-xs">Item Type</Label>
                        <Select value={templateTypeFilter} onValueChange={setTemplateTypeFilter}>
                          <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-item-type-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {itemTypeOptions.map(type => (
                              <SelectItem key={type} value={type}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-stone-400 text-xs">Rarity</Label>
                        <Select value={templateRarityFilter} onValueChange={setTemplateRarityFilter}>
                          <SelectTrigger className="bg-stone-800 border-stone-700 mt-1" data-testid="select-item-rarity-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {rarityOptions.map(rarity => (
                              <SelectItem key={rarity} value={rarity}>
                                {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearItemFilters}
                        className="w-full bg-stone-800 border-stone-600 hover:bg-stone-700"
                        data-testid="button-clear-item-filters"
                      >
                        Clear Filters
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Template Items List */}
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-12 text-stone-400">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-bold">No items in library</p>
                  <p className="text-sm mt-2">Create custom items using the "Create New" tab</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-stone-500">Tap to add 1. Hold to add multiple.</p>
                  {filteredTemplates.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-stone-800 border border-stone-700 hover:border-amber-700 transition-colors cursor-pointer select-none"
                      onPointerDown={() => handleTemplatePointerDown(item)}
                      onPointerUp={() => handleTemplatePointerUp(item)}
                      onPointerLeave={handleTemplatePointerLeave}
                      onPointerCancel={handleTemplatePointerLeave}
                      data-testid={`template-item-${item.id}`}
                    >
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="h-10 w-10 rounded object-cover pointer-events-none" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-stone-700 flex items-center justify-center pointer-events-none">
                          <Package className="h-5 w-5 text-stone-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 pointer-events-none">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{item.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${rarityColors[item.rarity]}`}>
                            {item.rarity}
                          </span>
                        </div>
                        <div className="text-xs text-stone-400 flex items-center gap-2">
                          <span className="capitalize">{item.itemType}</span>
                          {item.damage && <span>| {item.damage}</span>}
                        </div>
                      </div>
                      <Plus className="h-5 w-5 text-amber-500 pointer-events-none" />
                    </div>
                  ))}
                </div>
              )}
              
              {/* Quantity Picker Dialog */}
              {quantityPickerTemplate && (
                <Dialog open={!!quantityPickerTemplate} onOpenChange={() => setQuantityPickerTemplate(null)}>
                  <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-amber-500">Add {quantityPickerTemplate.name}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <Label>Quantity</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))}
                          className="border-stone-600"
                          data-testid="button-decrease-quantity"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          min="1"
                          value={addQuantity === 0 ? '' : addQuantity}
                          onChange={(e) => setAddQuantity(e.target.value === '' ? 0 : Math.max(1, parseInt(e.target.value) || 1))}
                          className="bg-stone-800 border-stone-700 text-center w-20"
                          data-testid="input-add-quantity"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setAddQuantity(addQuantity + 1)}
                          className="border-stone-600"
                          data-testid="button-increase-quantity"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setQuantityPickerTemplate(null)}>Cancel</Button>
                      <Button onClick={handleConfirmQuantity} disabled={addQuantity < 1}>
                        Add {addQuantity} Item{addQuantity !== 1 ? 's' : ''}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-stone-800 border-stone-700" />
              </div>
              <div>
                <Label>Item Image</Label>
                <div className="flex items-center gap-2">
                  {formData.image ? (
                    <div className="relative">
                      <img src={formData.image} alt="Item" className="h-12 w-12 rounded object-cover border border-stone-600" />
                      <button 
                        type="button"
                        onClick={() => setFormData({...formData, image: ''})}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full h-4 w-4 text-xs flex items-center justify-center hover:bg-red-500"
                      >×</button>
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded bg-stone-800 border border-stone-600 flex items-center justify-center text-stone-500">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                  <input 
                    ref={imageInputRef}
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                    className="hidden"
                    data-testid="input-item-image"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowItemImageBrowser(true)}
                    className="bg-stone-800 border-stone-600 hover:bg-stone-700"
                    data-testid="button-browse-item-library"
                  >
                    <FolderOpen className="h-4 w-4 mr-1" /> Library
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                    className="bg-stone-800 border-stone-600 hover:bg-stone-700"
                    data-testid="button-upload-item-image"
                  >
                    <Upload className="h-4 w-4 mr-1" /> Upload
                  </Button>
                </div>
                
                {/* Image Browser Dialog for Item Images */}
                <ImageBrowser
                  open={showItemImageBrowser}
                  onOpenChange={setShowItemImageBrowser}
                  onSelect={(imageBase64) => {
                    setFormData({...formData, image: imageBase64});
                  }}
                  title="Select Item Image"
                />
              </div>
              <div>
                <Label>Item Type</Label>
                <Select value={formData.itemType} onValueChange={(v) => setFormData({...formData, itemType: v})}>
                  <SelectTrigger className="bg-stone-800 border-stone-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weapon">Weapon</SelectItem>
                    <SelectItem value="ammunition">Ammunition</SelectItem>
                    <SelectItem value="armor">Armor</SelectItem>
                    <SelectItem value="consumable">Consumable</SelectItem>
                    <SelectItem value="utility">Utility</SelectItem>
                    <SelectItem value="container">Container</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rarity</Label>
                <Select value={formData.rarity} onValueChange={(v) => setFormData({...formData, rarity: v})}>
                  <SelectTrigger className="bg-stone-800 border-stone-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="common">Common</SelectItem>
                    <SelectItem value="uncommon">Uncommon</SelectItem>
                    <SelectItem value="rare">Rare</SelectItem>
                    <SelectItem value="epic">Epic</SelectItem>
                    <SelectItem value="legendary">Legendary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity</Label>
                <Input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} className="bg-stone-800 border-stone-700" />
              </div>
              <div>
                <Label>Weight (lbs)</Label>
                <Input type="number" min="0" step="0.01" value={formData.itemWeight} onChange={(e) => setFormData({...formData, itemWeight: e.target.value === '' ? '' : parseFloat(e.target.value)})} className="bg-stone-800 border-stone-700" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="bg-stone-800 border-stone-700 min-h-[80px]" />
            </div>
            <div className="border-t border-stone-700 pt-4">
              <h3 className="text-sm font-bold text-stone-300 mb-3">Combat Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Damage (dice notation)</Label>
                  <Input value={formData.damage} onChange={(e) => setFormData({...formData, damage: e.target.value})} placeholder="1d6" className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Damage Type</Label>
                  <Select value={formData.damageType} onValueChange={(v) => setFormData({...formData, damageType: v})}>
                    <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-damage-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sharp">Sharp</SelectItem>
                      <SelectItem value="Blunt">Blunt</SelectItem>
                      <SelectItem value="Piercing">Piercing</SelectItem>
                      <SelectItem value="Flame">Flame</SelectItem>
                      <SelectItem value="Frost">Frost</SelectItem>
                      <SelectItem value="Storm">Storm</SelectItem>
                      <SelectItem value="Tide">Tide</SelectItem>
                      <SelectItem value="Stone">Stone</SelectItem>
                      <SelectItem value="Flux">Flux</SelectItem>
                      <SelectItem value="Light">Light</SelectItem>
                      <SelectItem value="Dark">Dark</SelectItem>
                      <SelectItem value="Sound">Sound</SelectItem>
                      <SelectItem value="Health">Health</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Modifier</Label>
                  <Input type="number" value={formData.mod} onChange={(e) => setFormData({...formData, mod: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Range (feet)</Label>
                  <Input type="number" min="0" value={formData.range} onChange={(e) => setFormData({...formData, range: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
              </div>
            </div>
            <div className="border-t border-stone-700 pt-4">
              <h3 className="text-sm font-bold text-stone-300 mb-3">Price</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Platinum</Label>
                  <Input type="number" min="0" value={formData.pricePlatinum} onChange={(e) => setFormData({...formData, pricePlatinum: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Gold</Label>
                  <Input type="number" min="0" value={formData.priceGold} onChange={(e) => setFormData({...formData, priceGold: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Silver</Label>
                  <Input type="number" min="0" value={formData.priceSilver} onChange={(e) => setFormData({...formData, priceSilver: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Copper</Label>
                  <Input type="number" min="0" value={formData.priceCopper} onChange={(e) => setFormData({...formData, priceCopper: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
              </div>
            </div>
            <div className="border-t border-stone-700 pt-4">
              <Label>Durability: {formData.durability}/10</Label>
              <Slider value={[formData.durability]} onValueChange={(v) => setFormData({...formData, durability: v[0]})} min={0} max={10} step={1} className="mt-2" />
            </div>
            {formData.itemType === 'consumable' && (
              <div className="border-t border-stone-700 pt-4">
                <h3 className="text-sm font-bold text-stone-300 mb-3">Consumable Settings</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="isRation" 
                        checked={(formData.rationServings !== '' && Number(formData.rationServings) > 0)}
                        onCheckedChange={(checked) => setFormData({...formData, rationServings: checked ? 1 : ''})}
                        data-testid="checkbox-is-ration"
                      />
                      <Label htmlFor="isRation" className="cursor-pointer">
                        This item is a ration (consumable for resting)
                      </Label>
                    </div>
                    {(formData.rationServings !== '' && Number(formData.rationServings) > 0) && (
                      <div className="mt-3">
                        <Label>Ration Servings</Label>
                        <Input 
                          type="number" 
                          min="1" 
                          step="1"
                          value={formData.rationServings} 
                          onChange={(e) => setFormData({...formData, rationServings: e.target.value === '' ? '' : parseInt(e.target.value)})} 
                          className="bg-stone-800 border-stone-700 w-32"
                          data-testid="input-ration-servings"
                        />
                        <p className="text-xs text-stone-500 mt-1">
                          How many rations this item provides when consumed
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-stone-500 mt-2">
                      Ration items are consumed during rests. Short rest requires 2, long rest requires 4.
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="isDamaging" 
                        checked={formData.isDamaging}
                        onCheckedChange={(checked) => setFormData({...formData, isDamaging: !!checked})}
                        data-testid="checkbox-is-damaging"
                      />
                      <Label htmlFor="isDamaging" className="cursor-pointer">
                        Damaging Consumable
                      </Label>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      When enabled, can be rolled from hotbar like weapons (click: attack, double-click: damage). Uses 5ft range.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {formData.itemType === 'ammunition' && (
              <div className="border-t border-stone-700 pt-4">
                <h3 className="text-sm font-bold text-stone-300 mb-3">Ammunition Settings</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Ammunition Type</Label>
                    <Select value={formData.ammunitionType} onValueChange={(v) => setFormData({...formData, ammunitionType: v})}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-ammunition-type">
                        <SelectValue placeholder="Select ammunition type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="arrow">Arrow</SelectItem>
                        <SelectItem value="bolt">Bolt</SelectItem>
                        <SelectItem value="bullet">Bullet</SelectItem>
                        <SelectItem value="dart">Dart</SelectItem>
                        <SelectItem value="stone">Stone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Break Chance: {formData.breakChance ?? 10}%</Label>
                    <Slider 
                      value={[formData.breakChance ?? 10]} 
                      onValueChange={(v) => setFormData({...formData, breakChance: v[0]})} 
                      min={0} 
                      max={100} 
                      step={1} 
                      className="mt-2"
                      data-testid="slider-break-chance"
                    />
                    <p className="text-xs text-stone-500 mt-1">Chance of ammunition breaking on each attack roll</p>
                  </div>
                </div>
              </div>
            )}
            {formData.itemType === 'weapon' && (
              <div className="border-t border-stone-700 pt-4">
                <h3 className="text-sm font-bold text-stone-300 mb-3">Weapon Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Weapon Category</Label>
                    <Select value={formData.weaponCategory} onValueChange={(v) => setFormData({...formData, weaponCategory: v})}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-weapon-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="melee">Melee</SelectItem>
                        <SelectItem value="ranged">Ranged</SelectItem>
                        <SelectItem value="thrown">Thrown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ammunition Required</Label>
                    <Select value={formData.ammunitionType || '_none'} onValueChange={(v) => setFormData({...formData, ammunitionType: v === '_none' ? '' : v})}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-weapon-ammo">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        <SelectItem value="arrow">Arrow</SelectItem>
                        <SelectItem value="bolt">Bolt</SelectItem>
                        <SelectItem value="bullet">Bullet</SelectItem>
                        <SelectItem value="dart">Dart</SelectItem>
                        <SelectItem value="stone">Stone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Checkbox 
                      id="isHeavy" 
                      checked={formData.isHeavy || false} 
                      onCheckedChange={(checked) => setFormData({...formData, isHeavy: !!checked})}
                      data-testid="checkbox-is-heavy"
                    />
                    <Label htmlFor="isHeavy" className="cursor-pointer">Two-Handed / Heavy Weapon (requires both hands)</Label>
                  </div>
                  <div className="col-span-2 border-t border-stone-600 pt-3 mt-2 space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="isThrowable" 
                        checked={formData.isThrowable || false} 
                        onCheckedChange={(checked) => setFormData({...formData, isThrowable: !!checked, throwableAoe: checked ? formData.throwableAoe : false})}
                        data-testid="checkbox-is-throwable"
                      />
                      <Label htmlFor="isThrowable" className="cursor-pointer">Is Throwable</Label>
                    </div>
                    {formData.isThrowable && (
                      <div className="pl-6 space-y-3">
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            id="throwableAoe" 
                            checked={formData.throwableAoe || false} 
                            onCheckedChange={(checked) => setFormData({...formData, throwableAoe: !!checked})}
                            data-testid="checkbox-throwable-aoe"
                          />
                          <Label htmlFor="throwableAoe" className="cursor-pointer">Enable AOE</Label>
                        </div>
                        {formData.throwableAoe && (
                          <div className="pl-6 space-y-3">
                            <div>
                              <Label>AOE Shape</Label>
                              <Select value={formData.throwableAoeShape || ''} onValueChange={(v) => setFormData({...formData, throwableAoeShape: v})}>
                                <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-throwable-aoe-shape">
                                  <SelectValue placeholder="Select shape..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="circle">Circle</SelectItem>
                                  <SelectItem value="cone">Cone</SelectItem>
                                  <SelectItem value="line">Line</SelectItem>
                                  <SelectItem value="cube">Cube</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>AOE Range (feet)</Label>
                              <Input 
                                type="number" 
                                min="5" 
                                step="5"
                                value={formData.throwableAoeRange} 
                                onChange={(e) => setFormData({...formData, throwableAoeRange: e.target.value === '' ? '' : parseInt(e.target.value)})} 
                                className="bg-stone-800 border-stone-700"
                                placeholder="10"
                                data-testid="input-throwable-aoe-range"
                              />
                            </div>
                            <div>
                              <Label>Detonation Damage (e.g. 2d6)</Label>
                              <Input 
                                value={formData.throwableAoeDamage} 
                                onChange={(e) => setFormData({...formData, throwableAoeDamage: e.target.value})} 
                                className="bg-stone-800 border-stone-700"
                                placeholder="2d6"
                                data-testid="input-throwable-aoe-damage"
                              />
                            </div>
                            <div>
                              <Label>Detonation Damage Type</Label>
                              <Select value={formData.throwableAoeDamageType || ''} onValueChange={(v) => setFormData({...formData, throwableAoeDamageType: v})}>
                                <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-throwable-aoe-damage-type">
                                  <SelectValue placeholder="Select damage type..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Sharp">Sharp</SelectItem>
                                  <SelectItem value="Blunt">Blunt</SelectItem>
                                  <SelectItem value="Piercing">Piercing</SelectItem>
                                  <SelectItem value="Flame">Flame</SelectItem>
                                  <SelectItem value="Frost">Frost</SelectItem>
                                  <SelectItem value="Storm">Storm</SelectItem>
                                  <SelectItem value="Tide">Tide</SelectItem>
                                  <SelectItem value="Stone">Stone</SelectItem>
                                  <SelectItem value="Flux">Flux</SelectItem>
                                  <SelectItem value="Light">Light</SelectItem>
                                  <SelectItem value="Dark">Dark</SelectItem>
                                  <SelectItem value="Sound">Sound</SelectItem>
                                  <SelectItem value="Health">Health</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2">
                                <Checkbox 
                                  id="throwablePickup" 
                                  checked={formData.throwablePickup || false} 
                                  onCheckedChange={(checked) => setFormData({...formData, throwablePickup: !!checked})}
                                  data-testid="checkbox-throwable-pickup"
                                />
                                <Label htmlFor="throwablePickup" className="cursor-pointer">Pickup Mode</Label>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <p>When enabled, thrown items attach to tokens or grid spaces and can be picked up by other characters.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="mt-3">
                          <Label>Throwable Break Chance: {formData.throwableBreakChance === '' ? 10 : Number(formData.throwableBreakChance)}%</Label>
                          <Slider 
                            value={[formData.throwableBreakChance === '' ? 10 : Number(formData.throwableBreakChance)]} 
                            onValueChange={(v) => setFormData({...formData, throwableBreakChance: v[0]})} 
                            min={0} 
                            max={100} 
                            step={1} 
                            className="mt-2"
                            data-testid="slider-throwable-break-chance"
                          />
                          <p className="text-xs text-stone-500 mt-1">Chance of throwable item breaking when thrown</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="border-t border-stone-600 pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                      id="canApplyEffects"
                      checked={formData.canApplyEffects || false}
                      onCheckedChange={(checked) => setFormData({...formData, canApplyEffects: !!checked})}
                      data-testid="checkbox-can-apply-effects"
                    />
                    <Label htmlFor="canApplyEffects" className="cursor-pointer flex items-center gap-2">
                      <Flame className="h-4 w-4 text-violet-400" />
                      Can Apply Effects on Hit
                    </Label>
                  </div>
                  <p className="text-xs text-stone-500">Enable this to apply token effects when the weapon lands an attack</p>
                </div>
              </div>
            )}
            {formData.itemType === 'armor' && (
              <div className="border-t border-stone-700 pt-4">
                <h3 className="text-sm font-bold text-stone-300 mb-3">Armor Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Body Part *</Label>
                    <Select value={formData.armorSlot || ''} onValueChange={(v) => setFormData({...formData, armorSlot: v})}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-armor-slot">
                        <SelectValue placeholder="Select body part..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="helm">Helm</SelectItem>
                        <SelectItem value="chest">Chest</SelectItem>
                        <SelectItem value="arm">Arm</SelectItem>
                        <SelectItem value="legs">Legs</SelectItem>
                        <SelectItem value="boots">Boots</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Armor Bonus (DC)</Label>
                    <Input 
                      type="number" 
                      min="0" 
                      value={formData.armorBonus} 
                      onChange={(e) => setFormData({...formData, armorBonus: e.target.value === '' ? '' : parseInt(e.target.value)})} 
                      className="bg-stone-800 border-stone-700"
                      placeholder="0"
                      data-testid="input-armor-bonus"
                    />
                  </div>
                  <div>
                    <Label>Damage Reduction Type</Label>
                    <Select value={formData.damageReductionType || ''} onValueChange={(v) => setFormData({...formData, damageReductionType: v})}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-damage-reduction-type">
                        <SelectValue placeholder="Select damage type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Sharp">Sharp</SelectItem>
                        <SelectItem value="Blunt">Blunt</SelectItem>
                        <SelectItem value="Piercing">Piercing</SelectItem>
                        <SelectItem value="Flame">Flame</SelectItem>
                        <SelectItem value="Frost">Frost</SelectItem>
                        <SelectItem value="Storm">Storm</SelectItem>
                        <SelectItem value="Tide">Tide</SelectItem>
                        <SelectItem value="Stone">Stone</SelectItem>
                        <SelectItem value="Flux">Flux</SelectItem>
                        <SelectItem value="Light">Light</SelectItem>
                        <SelectItem value="Dark">Dark</SelectItem>
                        <SelectItem value="Sound">Sound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Damage Reduction Amount</Label>
                    <Input 
                      type="number" 
                      min="0" 
                      value={formData.damageReduction} 
                      onChange={(e) => setFormData({...formData, damageReduction: e.target.value === '' ? '' : parseInt(e.target.value)})} 
                      className="bg-stone-800 border-stone-700"
                      placeholder="0"
                      data-testid="input-damage-reduction"
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="border-t border-stone-700 pt-4">
              <h3 className="text-sm font-bold text-stone-300 mb-3">Container Settings</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="isContainer" 
                    checked={formData.isContainer} 
                    onCheckedChange={(checked) => setFormData({...formData, isContainer: !!checked})}
                    data-testid="checkbox-is-container"
                  />
                  <Label htmlFor="isContainer" className="cursor-pointer">This is a container</Label>
                </div>
                {formData.isContainer && (
                  <div className="flex items-center gap-2">
                    <Label>Carry Capacity Bonus:</Label>
                    <Input 
                      type="number" 
                      min="0" 
                      value={formData.carryCapacity} 
                      onChange={(e) => setFormData({...formData, carryCapacity: e.target.value === '' ? '' : parseInt(e.target.value)})} 
                      className="w-20 bg-stone-800 border-stone-700"
                      data-testid="input-carry-capacity"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-4 pb-4">
              <Button onClick={handleSubmit} disabled={!formData.name} data-testid="button-create-item">Add Item</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            </div>
          </div>
        )}
        </ScrollArea>
      </DialogContent>

      {/* Image Cropping Dialog */}
      <Dialog open={showImageCrop} onOpenChange={setShowImageCrop}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-500">Crop Item Image</DialogTitle>
            <DialogDescription className="text-stone-400">
              Drag to position the crop area. The image will be cropped as a square.
            </DialogDescription>
          </DialogHeader>
          {uploadedImage && (
            <div className="relative">
              <div className="relative overflow-hidden bg-stone-800 rounded-lg" style={{ maxHeight: '400px' }}>
                <img 
                  ref={cropImageRef}
                  src={uploadedImage} 
                  alt="Crop preview"
                  className="max-w-full h-auto"
                  onLoad={handleImageLoad}
                  draggable={false}
                />
                {imageDimensions.width > 0 && cropImageRef.current && (
                  <div
                    className="absolute border-2 border-amber-500 bg-amber-500/20 cursor-move"
                    style={{
                      left: `${(cropPosition.x / imageDimensions.width) * 100}%`,
                      top: `${(cropPosition.y / imageDimensions.height) * 100}%`,
                      width: `${(cropPosition.size / imageDimensions.width) * 100}%`,
                      height: `${(cropPosition.size / imageDimensions.height) * 100}%`,
                    }}
                    onPointerDown={handleCropDrag}
                  />
                )}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-stone-300">Crop Size</Label>
                  <span className="text-xs text-amber-500">{Math.round(cropPosition.size)}px</span>
                </div>
                <Slider
                  value={[cropPosition.size]}
                  onValueChange={(v) => {
                    const newSize = v[0];
                    const maxSize = Math.min(imageDimensions.width, imageDimensions.height);
                    setCropPosition(prev => ({
                      ...prev,
                      size: Math.min(newSize, maxSize),
                      x: Math.min(prev.x, imageDimensions.width - newSize),
                      y: Math.min(prev.y, imageDimensions.height - newSize)
                    }));
                  }}
                  min={50}
                  max={Math.min(imageDimensions.width, imageDimensions.height) || 300}
                  step={10}
                  className="accent-amber-600"
                />
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleCropConfirm} className="flex-1 bg-amber-700 hover:bg-amber-600">
                  Crop & Save
                </Button>
                <Button variant="outline" onClick={handleCropCancel} className="flex-1 bg-stone-800 border-stone-600">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// Manage Campaign Templates Dialog (GM Only)
function ManageTemplatesDialog({ open, onOpenChange, campaignId }: { open: boolean; onOpenChange: (open: boolean) => void; campaignId?: string }) {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newItem, setNewItem] = useState<{
    name: string;
    description: string;
    itemType: string;
    rarity: string;
    damage: string;
    damageType: string;
    mod: number | string;
    range: number | string;
    weight: string;
    itemWeight: number | string;
    priceCopper: number | string;
    priceSilver: number | string;
    priceGold: number | string;
    pricePlatinum: number | string;
    durability: number;
    ammunitionType: string;
    weaponCategory: string;
    breakChance: number;
  }>({
    name: '',
    description: '',
    itemType: 'utility',
    rarity: 'common',
    damage: '',
    damageType: '',
    mod: '',
    range: '',
    weight: 'light',
    itemWeight: '',
    priceCopper: '',
    priceSilver: '',
    priceGold: '',
    pricePlatinum: '',
    durability: 10,
    ammunitionType: '',
    weaponCategory: '',
    breakChance: 10,
  });

  const { data: templateData, refetch } = useQuery({
    queryKey: ['campaign-templates', campaignId],
    queryFn: async () => {
      if (!campaignId) return [];
      const data = await api.getTemplateItems(campaignId);
      return data.campaignItems || [];
    },
    enabled: !!campaignId && open,
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => {
      // Helper to convert empty strings to undefined for optional numeric fields
      const optionalNum = (val: string | number): number | undefined => {
        if (val === '' || val === undefined || val === null) return undefined;
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      };
      const cleanedData = {
        ...data,
        mod: optionalNum(data.mod),
        range: optionalNum(data.range),
        itemWeight: optionalNum(data.itemWeight),
        priceCopper: optionalNum(data.priceCopper),
        priceSilver: optionalNum(data.priceSilver),
        priceGold: optionalNum(data.priceGold),
        pricePlatinum: optionalNum(data.pricePlatinum),
      };
      return api.createCampaignTemplateItem(campaignId!, cleanedData);
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['template-items', campaignId] });
      setShowCreateForm(false);
      setNewItem({
        name: '', description: '', itemType: 'utility', rarity: 'common',
        damage: '', damageType: '', mod: '', range: '', weight: 'light',
        itemWeight: '', priceCopper: '', priceSilver: '', priceGold: '', pricePlatinum: '', durability: 10,
        ammunitionType: '', weaponCategory: '', breakChance: 10,
      });
      toast({ title: "Template Created", description: "Campaign item template created successfully" });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) => api.deleteCampaignTemplateItem(campaignId!, templateId),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['template-items', campaignId] });
      toast({ title: "Template Deleted", description: "Campaign item template deleted" });
    }
  });

  const rarityColors: Record<string, string> = {
    common: 'bg-stone-600',
    uncommon: 'bg-green-600',
    rare: 'bg-blue-600',
    epic: 'bg-purple-600',
    legendary: 'bg-amber-600',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-amber-500 flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Campaign Item Templates
          </DialogTitle>
          <DialogDescription className="text-stone-400">
            Create item templates that players can add to their inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {!showCreateForm ? (
            <>
              <div className="mb-4">
                <Button onClick={() => setShowCreateForm(true)} data-testid="button-create-template">
                  <Plus className="h-4 w-4 mr-1" /> Create Template
                </Button>
              </div>

              <ScrollArea className="flex-1">
                {!templateData || templateData.length === 0 ? (
                  <div className="text-center py-12 text-stone-400">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-bold">No templates yet</p>
                    <p className="text-sm mt-2">Create item templates for your campaign</p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-4">
                    {templateData.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-stone-800 border border-stone-700"
                        data-testid={`template-${item.id}`}
                      >
                        <div className="h-10 w-10 rounded bg-stone-700 flex items-center justify-center">
                          <Package className="h-5 w-5 text-stone-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{item.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${rarityColors[item.rarity]}`}>
                              {item.rarity}
                            </span>
                          </div>
                          <div className="text-xs text-stone-400 capitalize">{item.itemType}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteTemplateMutation.mutate(item.id)}
                          className="text-red-500 hover:text-red-400 hover:bg-red-900/30"
                          data-testid={`button-delete-template-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          ) : (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Name *</Label>
                    <Input value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} className="bg-stone-800 border-stone-700" />
                  </div>
                  <div>
                    <Label>Item Type</Label>
                    <Select value={newItem.itemType} onValueChange={(v) => setNewItem({...newItem, itemType: v})}>
                      <SelectTrigger className="bg-stone-800 border-stone-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weapon">Weapon</SelectItem>
                        <SelectItem value="ammunition">Ammunition</SelectItem>
                        <SelectItem value="armor">Armor</SelectItem>
                        <SelectItem value="consumable">Consumable</SelectItem>
                        <SelectItem value="utility">Utility</SelectItem>
                        <SelectItem value="container">Container</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Rarity</Label>
                    <Select value={newItem.rarity} onValueChange={(v) => setNewItem({...newItem, rarity: v})}>
                      <SelectTrigger className="bg-stone-800 border-stone-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="common">Common</SelectItem>
                        <SelectItem value="uncommon">Uncommon</SelectItem>
                        <SelectItem value="rare">Rare</SelectItem>
                        <SelectItem value="epic">Epic</SelectItem>
                        <SelectItem value="legendary">Legendary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Weight (lbs)</Label>
                    <Input type="number" min="0" step="0.01" value={newItem.itemWeight} onChange={(e) => setNewItem({...newItem, itemWeight: e.target.value === '' ? '' : parseFloat(e.target.value)})} className="bg-stone-800 border-stone-700" />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={newItem.description} onChange={(e) => setNewItem({...newItem, description: e.target.value})} className="bg-stone-800 border-stone-700 min-h-[60px]" />
                </div>
                <div className="border-t border-stone-700 pt-4">
                  <h3 className="text-sm font-bold text-stone-300 mb-3">Combat Stats</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Damage</Label>
                      <Input value={newItem.damage} onChange={(e) => setNewItem({...newItem, damage: e.target.value})} placeholder="1d6" className="bg-stone-800 border-stone-700" />
                    </div>
                    <div>
                      <Label>Damage Type</Label>
                      <Input value={newItem.damageType} onChange={(e) => setNewItem({...newItem, damageType: e.target.value})} placeholder="slashing" className="bg-stone-800 border-stone-700" />
                    </div>
                  </div>
                </div>
                {newItem.itemType === 'ammunition' && (
                  <div className="border-t border-stone-700 pt-4">
                    <h3 className="text-sm font-bold text-stone-300 mb-3">Ammunition Settings</h3>
                    <div className="space-y-4">
                      <div>
                        <Label>Ammunition Type</Label>
                        <Select value={newItem.ammunitionType} onValueChange={(v) => setNewItem({...newItem, ammunitionType: v})}>
                          <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-template-ammunition-type">
                            <SelectValue placeholder="Select ammunition type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="arrow">Arrow</SelectItem>
                            <SelectItem value="bolt">Bolt</SelectItem>
                            <SelectItem value="bullet">Bullet</SelectItem>
                            <SelectItem value="dart">Dart</SelectItem>
                            <SelectItem value="stone">Stone</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Break Chance: {newItem.breakChance ?? 10}%</Label>
                        <Slider 
                          value={[newItem.breakChance ?? 10]} 
                          onValueChange={(v) => setNewItem({...newItem, breakChance: v[0]})} 
                          min={0} 
                          max={100} 
                          step={1} 
                          className="mt-2"
                          data-testid="slider-template-break-chance"
                        />
                        <p className="text-xs text-stone-500 mt-1">Chance of ammunition breaking on each attack roll</p>
                      </div>
                    </div>
                  </div>
                )}
                {newItem.itemType === 'weapon' && (
                  <div className="border-t border-stone-700 pt-4">
                    <h3 className="text-sm font-bold text-stone-300 mb-3">Weapon Settings</h3>
                    <div>
                      <Label>Weapon Category</Label>
                      <Select value={newItem.weaponCategory} onValueChange={(v) => setNewItem({...newItem, weaponCategory: v})}>
                        <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-template-weapon-category">
                          <SelectValue placeholder="Select weapon category..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="melee">Melee</SelectItem>
                          <SelectItem value="bow">Bow (uses Arrows)</SelectItem>
                          <SelectItem value="crossbow">Crossbow (uses Bolts)</SelectItem>
                          <SelectItem value="sling">Sling (uses Stones)</SelectItem>
                          <SelectItem value="firearm">Firearm (uses Bullets)</SelectItem>
                          <SelectItem value="thrown">Thrown (uses Darts)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <div className="border-t border-stone-700 pt-4">
                  <h3 className="text-sm font-bold text-stone-300 mb-3">Price</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label>Platinum</Label>
                      <Input type="number" min="0" value={newItem.pricePlatinum} onChange={(e) => setNewItem({...newItem, pricePlatinum: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                    </div>
                    <div>
                      <Label>Gold</Label>
                      <Input type="number" min="0" value={newItem.priceGold} onChange={(e) => setNewItem({...newItem, priceGold: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                    </div>
                    <div>
                      <Label>Silver</Label>
                      <Input type="number" min="0" value={newItem.priceSilver} onChange={(e) => setNewItem({...newItem, priceSilver: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                    </div>
                    <div>
                      <Label>Copper</Label>
                      <Input type="number" min="0" value={newItem.priceCopper} onChange={(e) => setNewItem({...newItem, priceCopper: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={() => createTemplateMutation.mutate(newItem)} disabled={!newItem.name}>
                    Create Template
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Container Contents Manager - Allows GMs to add items to containers
interface ContainerContentsManagerProps {
  containerId: string;
  containerName: string;
  items: any[];
  onAddItem: (itemId: string) => void;
}

function ContainerContentsManager({ containerId, containerName, items, onAddItem }: ContainerContentsManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get items that are NOT in this container and are NOT containers themselves
  const availableItems = items.filter((item: any) => 
    item.containerId !== containerId && 
    !item.isContainer && 
    item.id !== containerId
  );
  
  const filteredItems = availableItems.filter((item: any) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get items currently in this container
  const containedItems = items.filter((item: any) => item.containerId === containerId);

  return (
    <div className="pt-4 border-t border-stone-700">
      <h3 className="text-sm font-bold text-amber-500 mb-2 flex items-center gap-2">
        <Package className="h-4 w-4" />
        Container Contents ({containedItems.length} items)
      </h3>
      
      {/* Current contents */}
      {containedItems.length > 0 && (
        <div className="mb-3 space-y-1">
          {containedItems.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between p-2 bg-stone-800 rounded text-sm">
              <span className="text-stone-200">{item.name}</span>
              <Badge variant="outline" className="text-[10px]">{item.itemType}</Badge>
            </div>
          ))}
        </div>
      )}
      
      {/* Search and add items */}
      <div className="space-y-2">
        <Label className="text-xs text-stone-400">Add Item to {containerName}</Label>
        <Input
          placeholder="Search items to add..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-stone-900 border-stone-700"
          data-testid="input-container-search"
        />
        
        {searchQuery && filteredItems.length > 0 && (
          <div className="max-h-32 overflow-y-auto space-y-1 bg-stone-900 border border-stone-700 rounded p-1">
            {filteredItems.slice(0, 10).map((item: any) => (
              <button
                key={item.id}
                onClick={() => {
                  onAddItem(item.id);
                  setSearchQuery('');
                }}
                className="w-full flex items-center justify-between p-2 hover:bg-stone-800 rounded text-sm text-left"
                data-testid={`button-add-item-${item.id}`}
              >
                <span className="text-stone-200">{item.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{item.itemType}</Badge>
                  <Plus className="h-4 w-4 text-green-500" />
                </div>
              </button>
            ))}
          </div>
        )}
        
        {searchQuery && filteredItems.length === 0 && (
          <p className="text-xs text-stone-500 p-2">No items found matching "{searchQuery}"</p>
        )}
        
        {!searchQuery && availableItems.length === 0 && (
          <p className="text-xs text-stone-500">No items available to add</p>
        )}
      </div>
    </div>
  );
}

// Item Detail Dialog Component with Edit Mode and Equip to Hotbar
interface ItemDetailDialogProps {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isGM: boolean;
  isOwner: boolean;
  character: any;
  items: any[];
  onUpdate: (data: any) => void;
  onDelete: () => void;
}

function ItemDetailDialog({ item, open, onOpenChange, isGM, isOwner, character, items, onUpdate, onDelete }: ItemDetailDialogProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [showEquipMenu, setShowEquipMenu] = useState(false);

  const { data: hotbars = [] } = useQuery({
    queryKey: ['hotbars', character.id],
    queryFn: () => api.getHotbars(character.id),
    enabled: !!character.id
  });

  const upsertHotbarMutation = useMutation({
    mutationFn: (data: any) => api.upsertHotbar(character.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
      toast({ title: "Item Equipped", description: "Item equipped to hotbar successfully" });
      setShowEquipMenu(false);
    }
  });

  const handleEditToggle = () => {
    if (!isEditing) {
      // Use totalQuantity for stacked items, otherwise use quantity
      setEditData({ ...item, quantity: item.totalQuantity || item.quantity });
    }
    setIsEditing(!isEditing);
  };

  const handleSave = () => {
    if (editData) {
      // Helper to convert empty strings to undefined for optional numeric fields
      const optionalNum = (val: string | number): number | undefined => {
        if (val === '' || val === undefined || val === null) return undefined;
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      };
      const cleanedData = {
        ...editData,
        mod: optionalNum(editData.mod),
        range: optionalNum(editData.range),
        itemWeight: optionalNum(editData.itemWeight),
        priceCopper: optionalNum(editData.priceCopper),
        priceSilver: optionalNum(editData.priceSilver),
        priceGold: optionalNum(editData.priceGold),
        pricePlatinum: optionalNum(editData.pricePlatinum),
        quantity: Number(editData.quantity) || 1,
        carryCapacity: optionalNum(editData.carryCapacity),
      };
      onUpdate(cleanedData);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditData(null);
    setIsEditing(false);
  };

  const handleEquipToSlot = (hotbarType: string, slotNumber: number) => {
    if (!item) return;

    if (hotbarType === 'weapons' && (item.isHeavy || item.weight === 'heavy')) {
      upsertHotbarMutation.mutate({ hotbarType, slotNumber: 0, itemId: item.id });
      upsertHotbarMutation.mutate({ hotbarType, slotNumber: 2, itemId: item.id });
    } else {
      upsertHotbarMutation.mutate({ hotbarType, slotNumber, itemId: item.id });
    }
  };

  const getAvailableSlots = () => {
    if (!item) return [];
    
    const slots: { label: string; hotbarType: string; slotNumber: number }[] = [];
    
    if (item.itemType === 'weapon') {
      if (item.isHeavy || item.weight === 'heavy') {
        slots.push({ label: 'Weapons (Both Hands)', hotbarType: 'weapons', slotNumber: 0 });
      } else {
        slots.push({ label: 'Weapons - Left Hand', hotbarType: 'weapons', slotNumber: 0 });
        slots.push({ label: 'Weapons - Ammo', hotbarType: 'weapons', slotNumber: 1 });
        slots.push({ label: 'Weapons - Right Hand', hotbarType: 'weapons', slotNumber: 2 });
      }
    } else if (item.itemType === 'consumable') {
      slots.push({ label: 'Consumables - Slot 1', hotbarType: 'consumables', slotNumber: 0 });
      slots.push({ label: 'Consumables - Slot 2', hotbarType: 'consumables', slotNumber: 1 });
    } else if (item.itemType === 'utility') {
      for (let i = 0; i < 5; i++) {
        slots.push({ label: `Utility - Slot ${i + 1}`, hotbarType: 'utility', slotNumber: i });
      }
    }
    
    return slots;
  };

  if (!item) return null;

  const currentData = isEditing ? editData : item;
  const canEditItem = isOwner || isGM;
  const canEditAllFields = isGM;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-amber-500">Item Details</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[500px] pr-4">
          <div className="space-y-4">
            {canEditItem && !isEditing && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={handleEditToggle} data-testid="button-edit-item">
                  Edit
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-stone-400">Name</Label>
                {isEditing ? (
                  <Input 
                    value={currentData.name} 
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="bg-stone-800 border-stone-700"
                    data-testid="input-edit-name"
                  />
                ) : (
                  <p className="text-stone-200 font-bold">{currentData.name}</p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-stone-400">Type</Label>
                  {!canEditAllFields && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Lock className="h-3 w-3 text-amber-600" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Only GMs can edit this field</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {isEditing && canEditAllFields ? (
                  <Select value={currentData.itemType} onValueChange={(v) => setEditData({ ...editData, itemType: v })}>
                    <SelectTrigger className="bg-stone-800 border-amber-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weapon">Weapon</SelectItem>
                      <SelectItem value="ammunition">Ammunition</SelectItem>
                      <SelectItem value="armor">Armor</SelectItem>
                      <SelectItem value="consumable">Consumable</SelectItem>
                      <SelectItem value="utility">Utility</SelectItem>
                      <SelectItem value="container">Container</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-stone-200 capitalize">{currentData.itemType}</p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-stone-400">Rarity</Label>
                  {!canEditAllFields && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Lock className="h-3 w-3 text-amber-600" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Only GMs can edit this field</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {isEditing && canEditAllFields ? (
                  <Select value={currentData.rarity} onValueChange={(v) => setEditData({ ...editData, rarity: v })}>
                    <SelectTrigger className="bg-stone-800 border-amber-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="common">Common</SelectItem>
                      <SelectItem value="uncommon">Uncommon</SelectItem>
                      <SelectItem value="rare">Rare</SelectItem>
                      <SelectItem value="epic">Epic</SelectItem>
                      <SelectItem value="legendary">Legendary</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-stone-200 capitalize">{currentData.rarity}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-stone-400">Quantity</Label>
                <p className="text-stone-200">{currentData.totalQuantity || currentData.quantity}</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs text-stone-400">Description</Label>
              {isEditing ? (
                <Textarea 
                  value={currentData.description || ''} 
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  className="bg-stone-800 border-stone-700 min-h-[60px]"
                  placeholder="Item description..."
                  data-testid="textarea-edit-description"
                />
              ) : (
                <p className="text-stone-200 text-sm">{currentData.description || 'No description'}</p>
              )}
            </div>

            {/* Item Image */}
            {(currentData.image || isEditing) && (
              <div>
                <Label className="text-xs text-stone-400">Image</Label>
                {currentData.image ? (
                  <div className="mt-1">
                    <img 
                      src={currentData.image} 
                      alt={currentData.name} 
                      className="h-20 w-20 rounded object-cover border border-stone-600" 
                    />
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded bg-stone-700 flex items-center justify-center border border-stone-600 mt-1">
                    <Package className="h-8 w-8 text-stone-500" />
                  </div>
                )}
              </div>
            )}

            {(currentData.damage || currentData.damageType || currentData.mod !== undefined || currentData.range || currentData.attribute || currentData.aoe || isEditing) && (
              <div className="pt-4 border-t border-stone-700">
                <h3 className="text-sm font-bold text-stone-300 mb-2">Combat Stats</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Damage</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Input 
                        value={currentData.damage || ''} 
                        onChange={(e) => setEditData({ ...editData, damage: e.target.value })}
                        className="bg-stone-800 border-amber-700"
                        placeholder="e.g., 1d8"
                      />
                    ) : (
                      <p className="text-stone-200">{currentData.damage || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Damage Type</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Input 
                        value={currentData.damageType || ''} 
                        onChange={(e) => setEditData({ ...editData, damageType: e.target.value })}
                        className="bg-stone-800 border-amber-700"
                        placeholder="e.g., slashing"
                      />
                    ) : (
                      <p className="text-stone-200">{currentData.damageType || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Modifier</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Input 
                        type="number"
                        value={currentData.mod ?? ''} 
                        onChange={(e) => setEditData({ ...editData, mod: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="bg-stone-800 border-amber-700"
                      />
                    ) : (
                      <p className="text-stone-200">{currentData.mod >= 0 ? `+${currentData.mod}` : currentData.mod}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Range (ft)</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Input 
                        type="number"
                        value={currentData.range ?? ''} 
                        onChange={(e) => setEditData({ ...editData, range: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="bg-stone-800 border-amber-700"
                        placeholder="Range in feet"
                      />
                    ) : (
                      <p className="text-stone-200">{currentData.range ? `${currentData.range} ft` : 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Attribute</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Select value={currentData.attribute || ''} onValueChange={(v) => setEditData({ ...editData, attribute: v })}>
                        <SelectTrigger className="bg-stone-800 border-amber-700" data-testid="select-edit-attribute">
                          <SelectValue placeholder="Select attribute..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="might">Might</SelectItem>
                          <SelectItem value="finesse">Finesse</SelectItem>
                          <SelectItem value="wit">Wit</SelectItem>
                          <SelectItem value="presence">Presence</SelectItem>
                          <SelectItem value="will">Will</SelectItem>
                          <SelectItem value="craft">Craft</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-stone-200 capitalize">{currentData.attribute || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Area of Effect</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Select value={currentData.aoe || 'none'} onValueChange={(v) => setEditData({ ...editData, aoe: v })}>
                        <SelectTrigger className="bg-stone-800 border-amber-700" data-testid="select-edit-aoe">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="cone">Cone</SelectItem>
                          <SelectItem value="sphere">Sphere</SelectItem>
                          <SelectItem value="line">Line</SelectItem>
                          <SelectItem value="cube">Cube</SelectItem>
                          <SelectItem value="cylinder">Cylinder</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-stone-200 capitalize">{currentData.aoe && currentData.aoe !== 'none' ? currentData.aoe : 'N/A'}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentData.itemType === 'ammunition' && (
              <div className="pt-4 border-t border-stone-700">
                <h3 className="text-sm font-bold text-stone-300 mb-2">Ammunition Settings</h3>
                <div className="space-y-4">
                  {isEditing && canEditAllFields ? (
                    <>
                      <div>
                        <Label>Ammunition Type</Label>
                        <Select value={currentData.ammunitionType || ''} onValueChange={(v) => setEditData({ ...editData, ammunitionType: v })}>
                          <SelectTrigger className="bg-stone-800 border-amber-700" data-testid="select-edit-ammunition-type">
                            <SelectValue placeholder="Select ammunition type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="arrow">Arrow</SelectItem>
                            <SelectItem value="bolt">Bolt</SelectItem>
                            <SelectItem value="bullet">Bullet</SelectItem>
                            <SelectItem value="dart">Dart</SelectItem>
                            <SelectItem value="stone">Stone</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Break Chance: {currentData.breakChance ?? 10}%</Label>
                        <Slider 
                          value={[currentData.breakChance ?? 10]} 
                          onValueChange={(v) => setEditData({ ...editData, breakChance: v[0] })} 
                          min={0} 
                          max={100} 
                          step={1} 
                          className="mt-2"
                          data-testid="slider-edit-break-chance"
                        />
                        <p className="text-xs text-stone-500 mt-1">Chance of ammunition breaking on each attack roll</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs text-stone-400">Ammunition Type</Label>
                        <p className="text-stone-200 capitalize">{currentData.ammunitionType || 'Not specified'}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-stone-400">Break Chance</Label>
                        <p className="text-stone-200">{currentData.breakChance ?? 10}%</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {currentData.itemType === 'weapon' && (
              <div className="pt-4 border-t border-stone-700">
                <h3 className="text-sm font-bold text-stone-300 mb-2">Weapon Settings</h3>
                <div className="space-y-4">
                  {isEditing && canEditAllFields ? (
                    <>
                      <div>
                        <Label>Weapon Category</Label>
                        <Select value={currentData.weaponCategory || ''} onValueChange={(v) => setEditData({ ...editData, weaponCategory: v })}>
                          <SelectTrigger className="bg-stone-800 border-amber-700" data-testid="select-edit-weapon-category">
                            <SelectValue placeholder="Select weapon category..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="melee">Melee</SelectItem>
                            <SelectItem value="bow">Bow (uses Arrows)</SelectItem>
                            <SelectItem value="crossbow">Crossbow (uses Bolts)</SelectItem>
                            <SelectItem value="sling">Sling (uses Stones)</SelectItem>
                            <SelectItem value="firearm">Firearm (uses Bullets)</SelectItem>
                            <SelectItem value="thrown">Thrown (uses Darts)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="editIsHeavy" 
                          checked={currentData.isHeavy || false} 
                          onCheckedChange={(checked) => setEditData({ ...editData, isHeavy: !!checked })}
                          data-testid="checkbox-edit-is-heavy"
                        />
                        <Label htmlFor="editIsHeavy" className="cursor-pointer">Two-Handed Weapon (blocks right hand slot)</Label>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {currentData.weaponCategory && (
                        <div>
                          <Label className="text-xs text-stone-400">Weapon Category</Label>
                          <p className="text-stone-200 capitalize">{currentData.weaponCategory}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs text-stone-400">Two-Handed</Label>
                        <p className="text-stone-200">{currentData.isHeavy ? 'Yes' : 'No'}</p>
                      </div>
                      {currentData.isThrowable && (
                        <>
                          <div>
                            <Label className="text-xs text-stone-400">Throwable</Label>
                            <p className="text-stone-200">Yes</p>
                          </div>
                          <div>
                            <Label className="text-xs text-stone-400">Break Chance</Label>
                            <p className={`${(currentData.throwableBreakChance ?? 10) > 0 ? 'text-red-400' : 'text-stone-200'}`}>
                              {currentData.throwableBreakChance ?? 10}%
                            </p>
                          </div>
                          {currentData.throwablePickup && (
                            <div>
                              <Label className="text-xs text-stone-400">Pickup Mode</Label>
                              <p className="text-stone-200">Enabled</p>
                            </div>
                          )}
                          {currentData.throwableAoe && currentData.throwableAoeRange && (
                            <>
                              <div>
                                <Label className="text-xs text-stone-400">AOE Range</Label>
                                <p className="text-stone-200">{currentData.throwableAoeRange}ft</p>
                              </div>
                              {currentData.throwableAoeShape && (
                                <div>
                                  <Label className="text-xs text-stone-400">AOE Shape</Label>
                                  <p className="text-stone-200 capitalize">{currentData.throwableAoeShape}</p>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentData.itemType === 'armor' && (
              <div className="pt-4 border-t border-stone-700">
                <h3 className="text-sm font-bold text-stone-300 mb-2">Armor Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Armor Slot</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Select value={currentData.armorSlot || ''} onValueChange={(v) => setEditData({ ...editData, armorSlot: v })}>
                        <SelectTrigger className="bg-stone-800 border-amber-700" data-testid="select-armor-slot">
                          <SelectValue placeholder="Select slot..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="helm">Helm</SelectItem>
                          <SelectItem value="chest">Chest</SelectItem>
                          <SelectItem value="arm">Arm</SelectItem>
                          <SelectItem value="legs">Legs</SelectItem>
                          <SelectItem value="boots">Boots</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-stone-200 capitalize">{currentData.armorSlot || 'Not specified'}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Armor Bonus</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Input 
                        type="number"
                        value={currentData.armorBonus ?? ''} 
                        onChange={(e) => setEditData({ ...editData, armorBonus: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="bg-stone-800 border-amber-700"
                        data-testid="input-armor-bonus"
                      />
                    ) : (
                      <p className="text-stone-200">{currentData.armorBonus >= 0 ? `+${currentData.armorBonus || 0}` : currentData.armorBonus}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Damage Reduction</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Input 
                        type="number"
                        value={currentData.damageReduction ?? ''} 
                        onChange={(e) => setEditData({ ...editData, damageReduction: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="bg-stone-800 border-amber-700"
                        data-testid="input-damage-reduction"
                      />
                    ) : (
                      <p className="text-stone-200">{currentData.damageReduction || 0}</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-stone-400">Reduction Type</Label>
                      {isEditing && !canEditAllFields && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Lock className="h-3 w-3 text-amber-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Only GMs can edit this field</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {isEditing && canEditAllFields ? (
                      <Select value={currentData.damageReductionType || ''} onValueChange={(v) => setEditData({ ...editData, damageReductionType: v })}>
                        <SelectTrigger className="bg-stone-800 border-amber-700" data-testid="select-damage-reduction-type">
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sharp">Sharp</SelectItem>
                          <SelectItem value="Blunt">Blunt</SelectItem>
                          <SelectItem value="Piercing">Piercing</SelectItem>
                          <SelectItem value="Flame">Flame</SelectItem>
                          <SelectItem value="Frost">Frost</SelectItem>
                          <SelectItem value="Storm">Storm</SelectItem>
                          <SelectItem value="Tide">Tide</SelectItem>
                          <SelectItem value="Stone">Stone</SelectItem>
                          <SelectItem value="Flux">Flux</SelectItem>
                          <SelectItem value="Light">Light</SelectItem>
                          <SelectItem value="Dark">Dark</SelectItem>
                          <SelectItem value="Sound">Sound</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-stone-200">{currentData.damageReductionType || 'None'}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-stone-700">
              <h3 className="text-sm font-bold text-stone-300 mb-2">Physical</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-stone-400">Weight (per unit)</Label>
                    {isEditing && !canEditAllFields && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Lock className="h-3 w-3 text-amber-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Only GMs can edit this field</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {isEditing && canEditAllFields ? (
                    <Input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={currentData.itemWeight ?? ''} 
                      onChange={(e) => setEditData({ ...editData, itemWeight: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                      className="bg-stone-800 border-amber-700"
                    />
                  ) : (
                    <p className="text-stone-200">{currentData.itemWeight} lbs</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-stone-400">Total Weight</Label>
                  <p className="text-stone-200">
                    {(currentData.itemWeight * (currentData.totalQuantity || currentData.quantity)).toFixed(2)} lbs
                  </p>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-xs text-stone-400">Durability</Label>
                    {isEditing && !canEditAllFields && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Lock className="h-3 w-3 text-amber-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Only GMs can edit this field</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {isEditing && canEditItem ? (
                    <div className="space-y-2">
                      <Slider 
                        value={[currentData.durability]} 
                        onValueChange={(v) => setEditData({ ...editData, durability: v[0] })}
                        min={0}
                        max={10}
                        step={1}
                        className="mt-2"
                        data-testid="slider-durability"
                      />
                      <div className="text-sm text-stone-400">
                        {currentData.durability}/10
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 bg-stone-700 rounded overflow-hidden">
                        <div 
                          className={`h-full ${currentData.durability >= 8 ? 'bg-green-500' : currentData.durability >= 4 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                          style={{ width: `${(currentData.durability / 10) * 100}%` }} 
                        />
                      </div>
                      <span className="text-sm text-stone-200">{currentData.durability}/10</span>
                    </div>
                  )}
                </div>
                {/* Price Display */}
                <div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-stone-400">Price</Label>
                    {isEditing && !canEditAllFields && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Lock className="h-3 w-3 text-amber-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Only GMs can edit this field</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {isEditing && canEditAllFields ? (
                    <Input 
                      type="number"
                      min="0"
                      value={currentData.price ?? ''} 
                      onChange={(e) => setEditData({ ...editData, price: e.target.value === '' ? '' : parseInt(e.target.value) })}
                      className="bg-stone-800 border-amber-700"
                      data-testid="input-price"
                    />
                  ) : (
                    <p className="text-stone-200">{currentData.price || 0}</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-stone-400">Currency</Label>
                    {isEditing && !canEditAllFields && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Lock className="h-3 w-3 text-amber-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Only GMs can edit this field</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {isEditing && canEditAllFields ? (
                    <Select value={currentData.currency || 'copper'} onValueChange={(v) => setEditData({ ...editData, currency: v })}>
                      <SelectTrigger className="bg-stone-800 border-amber-700" data-testid="select-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="copper">Copper</SelectItem>
                        <SelectItem value="silver">Silver</SelectItem>
                        <SelectItem value="gold">Gold</SelectItem>
                        <SelectItem value="platinum">Platinum</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className={`text-sm capitalize ${
                      currentData.currency === 'platinum' ? 'text-cyan-400' :
                      currentData.currency === 'gold' ? 'text-amber-400' :
                      currentData.currency === 'silver' ? 'text-stone-300' :
                      'text-orange-400'
                    }`}>{currentData.currency || 'copper'}</p>
                  )}
                </div>
              </div>
            </div>

            {(isOwner || isGM) && !currentData.isContainer && !isEditing && (
              <div className="pt-4 border-t border-stone-700">
                <h3 className="text-sm font-bold text-stone-300 mb-2">Container Management</h3>
                <div className="space-y-2">
                  {currentData.containerId ? (
                    <div>
                      <Label className="text-xs text-stone-400 mb-2 block">Currently in container</Label>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onUpdate({ containerId: null })}
                        data-testid="button-remove-from-container"
                      >
                        Remove from Container
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs text-stone-400 mb-2 block">Move to Container</Label>
                      <Select 
                        onValueChange={(containerId) => onUpdate({ containerId })}
                      >
                        <SelectTrigger className="bg-stone-900 border-stone-700" data-testid="select-move-to-container">
                          <SelectValue placeholder="Select container..." />
                        </SelectTrigger>
                        <SelectContent>
                          {items.filter((i: any) => i.isContainer && i.id !== currentData.id).map((container: any) => (
                            <SelectItem key={container.id} value={container.id}>
                              {container.name} ({(container.children?.length || 0)} / {container.carryCapacity || 0})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Container Contents Management - GM Only */}
            {isGM && currentData.isContainer && !isEditing && (
              <ContainerContentsManager 
                containerId={currentData.id}
                containerName={currentData.name}
                items={items}
                onAddItem={(itemId) => {
                  const updateItemMutation = async () => {
                    try {
                      await api.updateItem(itemId, { containerId: currentData.id });
                      queryClient.invalidateQueries({ queryKey: ['items', character.id] });
                      toast({ title: "Item Added", description: "Item added to container" });
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message || "Failed to add item", variant: "destructive" });
                    }
                  };
                  updateItemMutation();
                }}
              />
            )}

            {!isEditing && (isOwner || isGM) && ['weapon', 'consumable', 'utility'].includes(currentData.itemType) && (
              <div className="pt-4 border-t border-stone-700">
                <h3 className="text-sm font-bold text-stone-300 mb-2">Quick Actions</h3>
                <div className="space-y-2">
                  <Label className="text-xs text-stone-400 mb-2 block">Equip to Hotbar</Label>
                  <Select onValueChange={(value) => {
                    const [hotbarType, slotNumber] = value.split('-');
                    handleEquipToSlot(hotbarType, parseInt(slotNumber));
                  }}>
                    <SelectTrigger className="bg-stone-900 border-stone-700" data-testid="select-equip-slot">
                      <SelectValue placeholder="Select slot..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableSlots().map((slot) => (
                        <SelectItem key={`${slot.hotbarType}-${slot.slotNumber}`} value={`${slot.hotbarType}-${slot.slotNumber}`}>
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              {isEditing ? (
                <>
                  <Button size="sm" onClick={handleSave} data-testid="button-save-item">
                    Save Changes
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancel} data-testid="button-cancel-edit">
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {(isOwner || isGM) && (
                    <Button size="sm" variant="outline" onClick={onDelete} data-testid="button-delete-item">
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  )}
                  <Button size="sm" onClick={() => onOpenChange(false)} data-testid="button-close-item-detail">
                    Close
                  </Button>
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// 5. GM Tools (Deprecated wrapper)
interface GMToolsProps {
  inviteCode?: string;
  inspectedChar?: Character;
}
export function GMTools({ inviteCode, inspectedChar }: GMToolsProps) {
  return null; 
}