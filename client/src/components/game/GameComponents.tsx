import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
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
import { 
  Sword, Shield, Scroll, Map as MapIcon, Settings, 
  Users, User, Plus, Minus, LogOut, Menu, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  Heart, Zap, Backpack, Sparkles, Dice5, MessageSquare, RefreshCw, X, Trash2, Package, FolderOpen, Lock, Unlock, Camera,
  BarChart3, Grid3X3, ScrollText, Upload, Image as ImageIcon, Layers, Search, TrendingUp, UserMinus, Ban,
  MousePointer, Target, UserCheck, Swords, ArrowRight, Eye, EyeOff, Check
} from "lucide-react";
import { useForm } from "react-hook-form";
import { type Scene, type Hotbar, api, gameWs } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import parchmentTexture from "@assets/generated_images/aged_parchment_paper_texture.png";
import battleMapImage1 from "@/assets/rocky_coast_battlemap.jpg";
import warriorToken from "@assets/generated_images/top_down_warrior_token.png";
import goblinToken from "@assets/generated_images/top_down_goblin_token.png";
import { triggerSkillRollNotification, triggerRollNotification } from './RollNotification';


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

// 1. Enhanced Character Creation Modal
interface CharacterCreationProps {
  onComplete: (char: any) => void;
  onCancel?: () => void;
}

export function CharacterCreation({ onComplete, onCancel }: CharacterCreationProps) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState(1);
  const [race, setRace] = useState("Human");
  const [portrait, setPortrait] = useState("");
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [energy, setEnergy] = useState(50);
  const [maxEnergy, setMaxEnergy] = useState(50);
  const [biography, setBiography] = useState("");

  const ATTRIBUTE_BASE = 10;
  const ATTRIBUTE_POINTS_POOL = 6;
  const ATTRIBUTE_MIN_MODIFIER = -4;
  const ATTRIBUTE_MAX_MODIFIER = 6;

  const [attributes, setAttributes] = useState({
    agility: 0,
    charisma: 0,
    strength: 0,
    wisdom: 0,
    arcana: 0,
    concentration: 0
  });

  const SKILL_BASE = 0;
  const SKILL_POINTS_POOL = 12;
  const SKILL_MIN_VALUE = -6;
  const SKILL_MAX_VALUE = 12;

  const [skills, setSkills] = useState({
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
    skillCulture: 0
  });

  const [validationError, setValidationError] = useState("");

  const attributePointsUsed = Object.values(attributes).reduce((sum, val) => sum + val, 0);
  const attributePointsRemaining = ATTRIBUTE_POINTS_POOL - attributePointsUsed;

  const skillPointsUsed = Object.values(skills).reduce((sum, val) => sum + val, 0);
  const skillPointsRemaining = SKILL_POINTS_POOL - skillPointsUsed;

  const updateAttribute = (attr: keyof typeof attributes, delta: number) => {
    const current = attributes[attr];
    const newValue = current + delta;
    
    if (newValue < ATTRIBUTE_MIN_MODIFIER || newValue > ATTRIBUTE_MAX_MODIFIER) return;
    if (delta > 0 && attributePointsRemaining < delta) return;
    
    setAttributes({ ...attributes, [attr]: newValue });
  };

  const updateSkill = (skill: keyof typeof skills, delta: number) => {
    const current = skills[skill];
    const newValue = current + delta;
    
    if (newValue < SKILL_MIN_VALUE || newValue > SKILL_MAX_VALUE) return;
    if (delta > 0 && skillPointsRemaining < delta) return;
    
    setSkills({ ...skills, [skill]: newValue });
  };

  const getRaceStats = (raceName: string) => {
    if (raceName === "Human") {
      return {
        size: "Medium",
        sizeBonus: 0,
        naturalArmor: 5,
        speed: 30,
        flySpeed: 0,
        lifespan: 100
      };
    }
    return {
      size: "Medium",
      sizeBonus: 0,
      naturalArmor: 5,
      speed: 30,
      flySpeed: 0,
      lifespan: 100
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (attributePointsUsed > ATTRIBUTE_POINTS_POOL || attributePointsUsed < -4) {
      setValidationError(`Invalid attribute allocation. You have ${attributePointsRemaining} points remaining.`);
      return;
    }

    if (skillPointsUsed > SKILL_POINTS_POOL || skillPointsUsed < -6) {
      setValidationError(`Invalid skill allocation. You have ${skillPointsRemaining} points remaining.`);
      return;
    }

    const raceStats = getRaceStats(race);

    onComplete({
      name,
      level,
      race,
      ...raceStats,
      portrait: portrait || undefined,
      hp,
      maxHp,
      energy,
      maxEnergy,
      agility: ATTRIBUTE_BASE + attributes.agility,
      charisma: ATTRIBUTE_BASE + attributes.charisma,
      strength: ATTRIBUTE_BASE + attributes.strength,
      wisdom: ATTRIBUTE_BASE + attributes.wisdom,
      arcana: ATTRIBUTE_BASE + attributes.arcana,
      concentration: ATTRIBUTE_BASE + attributes.concentration,
      ...skills,
      biography: biography || undefined,
      inventory: []
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-lg border border-white/20 shadow-2xl"
      >
        {/* Background Texture */}
        <div className="absolute inset-0 z-0 opacity-90">
          <img src={parchmentTexture} className="h-full w-full object-cover" alt="" />
        </div>

        <ScrollArea className="relative z-10 h-[90vh]">
          <div className="p-6 text-stone-900">
            <div className="mb-4 text-center">
              <h2 className="font-display text-3xl font-bold text-stone-900">Create Legend</h2>
              <p className="text-stone-600 font-medieval">Forge your destiny, adventurer.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Tabs defaultValue="basic" className="w-full">
                <div className="overflow-x-auto custom-scrollbar">
                  <TabsList className="grid w-full grid-cols-4 bg-stone-200 min-w-max">
                    <TabsTrigger value="basic" data-testid="tab-basic" className="text-xs sm:text-sm">Basic</TabsTrigger>
                    <TabsTrigger value="attributes" data-testid="tab-attributes" className="text-xs sm:text-sm">Attributes</TabsTrigger>
                    <TabsTrigger value="skills" data-testid="tab-skills" className="text-xs sm:text-sm">Skills</TabsTrigger>
                    <TabsTrigger value="details" data-testid="tab-details" className="text-xs sm:text-sm">Details</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="charName" className="text-stone-800 font-bold">Character Name *</Label>
                      <Input 
                        id="charName" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        className="border-stone-400 bg-white/50 text-stone-900"
                        placeholder="E.g. Valerius the Brave"
                        required
                        data-testid="input-character-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="level" className="text-stone-800 font-bold">Level *</Label>
                      <Input 
                        id="level" 
                        type="number"
                        min="1"
                        max="20"
                        value={level} 
                        onChange={(e) => setLevel(parseInt(e.target.value) || 1)} 
                        className="border-stone-400 bg-white/50 text-stone-900"
                        required
                        data-testid="input-level"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="race" className="text-stone-800 font-bold">Race *</Label>
                    <select
                      id="race"
                      value={race}
                      onChange={(e) => setRace(e.target.value)}
                      className="w-full rounded border border-stone-400 bg-white/50 px-3 py-2 text-stone-900"
                      required
                      data-testid="select-race"
                    >
                      <option value="Human">Human</option>
                    </select>
                    <p className="text-xs text-stone-600">
                      Human: Medium, Speed 30ft, Natural Armor 5, Lifespan 100 years
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hp" className="text-stone-800 font-bold">HP *</Label>
                      <Input 
                        id="hp" 
                        type="number"
                        min="1"
                        value={hp} 
                        onChange={(e) => setHp(parseInt(e.target.value) || 1)} 
                        className="border-stone-400 bg-white/50 text-stone-900"
                        required
                        data-testid="input-hp"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxHp" className="text-stone-800 font-bold">Max HP *</Label>
                      <Input 
                        id="maxHp" 
                        type="number"
                        min="1"
                        value={maxHp} 
                        onChange={(e) => setMaxHp(parseInt(e.target.value) || 1)} 
                        className="border-stone-400 bg-white/50 text-stone-900"
                        required
                        data-testid="input-max-hp"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="energy" className="text-stone-800 font-bold">Energy *</Label>
                      <Input 
                        id="energy" 
                        type="number"
                        min="0"
                        value={energy === 0 ? '' : energy} 
                        onChange={(e) => setEnergy(e.target.value === '' ? 0 : parseInt(e.target.value))} 
                        className="border-stone-400 bg-white/50 text-stone-900"
                        required
                        data-testid="input-energy"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxEnergy" className="text-stone-800 font-bold">Max Energy *</Label>
                      <Input 
                        id="maxEnergy" 
                        type="number"
                        min="0"
                        value={maxEnergy === 0 ? '' : maxEnergy} 
                        onChange={(e) => setMaxEnergy(e.target.value === '' ? 0 : parseInt(e.target.value))} 
                        className="border-stone-400 bg-white/50 text-stone-900"
                        required
                        data-testid="input-max-energy"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="attributes" className="space-y-4 mt-4">
                  <div className="bg-amber-100 border border-amber-400 rounded p-3 mb-4">
                    <p className="text-sm font-bold text-amber-900">
                      Points Remaining: <span className={attributePointsRemaining < 0 ? "text-red-600" : "text-green-600"} data-testid="text-attribute-points-remaining">{attributePointsRemaining}</span> / {ATTRIBUTE_POINTS_POOL}
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      Each attribute starts at 10. Allocate up to +6 or -4 points per attribute.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(attributes).map(([attr, value]) => (
                      <div key={attr} className="flex items-center gap-3 bg-white/50 rounded p-3 border border-stone-300 hover-scale">
                        <div className="flex-1">
                          <Label className="text-stone-800 font-bold capitalize">{attr}</Label>
                          <p className="text-xs text-stone-600">Base: {ATTRIBUTE_BASE} | Final: {ATTRIBUTE_BASE + value}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateAttribute(attr as keyof typeof attributes, -1)}
                            disabled={value <= ATTRIBUTE_MIN_MODIFIER}
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0 touch-target focus-ring-amber"
                            data-testid={`button-attribute-${attr}-decrease`}
                            aria-label={`Decrease ${attr}`}
                          >
                            -
                          </Button>
                          <span className="w-12 text-center font-bold text-stone-900" data-testid={`text-attribute-${attr}`}>
                            {value >= 0 ? '+' : ''}{value}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => updateAttribute(attr as keyof typeof attributes, 1)}
                            disabled={value >= ATTRIBUTE_MAX_MODIFIER || attributePointsRemaining <= 0}
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0 touch-target focus-ring-amber"
                            data-testid={`button-attribute-${attr}-increase`}
                            aria-label={`Increase ${attr}`}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="skills" className="space-y-4 mt-4">
                  <div className="bg-blue-100 border border-blue-400 rounded p-3 mb-4">
                    <p className="text-sm font-bold text-blue-900">
                      Points Remaining: <span className={skillPointsRemaining < 0 ? "text-red-600" : "text-green-600"} data-testid="text-skill-points-remaining">{skillPointsRemaining}</span> / {SKILL_POINTS_POOL}
                    </p>
                    <p className="text-xs text-blue-800 mt-1">
                      Each skill starts at 0. Allocate between -6 and +12 points per skill.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(skills).map(([skill, value]) => {
                      const displayName = skill.replace('skill', '').replace(/([A-Z])/g, ' $1').trim();
                      return (
                        <div key={skill} className="flex items-center gap-2 bg-white/50 rounded p-2 border border-stone-300 hover-scale">
                          <div className="flex-1 min-w-0">
                            <Label className="text-xs font-bold text-stone-800">{displayName}</Label>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => updateSkill(skill as keyof typeof skills, -1)}
                              disabled={value <= SKILL_MIN_VALUE}
                              className="h-9 w-9 sm:h-7 sm:w-7 p-0 text-xs touch-target focus-ring-amber"
                              data-testid={`button-skill-${skill}-decrease`}
                              aria-label={`Decrease ${displayName}`}
                            >
                              -
                            </Button>
                            <span className="w-10 text-center text-sm font-bold text-stone-900" data-testid={`text-skill-${skill}`}>
                              {value >= 0 ? '+' : ''}{value}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => updateSkill(skill as keyof typeof skills, 1)}
                              disabled={value >= SKILL_MAX_VALUE || skillPointsRemaining <= 0}
                              className="h-9 w-9 sm:h-7 sm:w-7 p-0 text-xs touch-target focus-ring-amber"
                              data-testid={`button-skill-${skill}-increase`}
                              aria-label={`Increase ${displayName}`}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="details" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="portrait" className="text-stone-800 font-bold">Portrait URL (optional)</Label>
                    <Input 
                      id="portrait" 
                      value={portrait} 
                      onChange={(e) => setPortrait(e.target.value)} 
                      className="border-stone-400 bg-white/50 text-stone-900"
                      placeholder="https://example.com/portrait.jpg"
                      data-testid="input-portrait"
                    />
                    {portrait && (
                      <div className="mt-2">
                        <img src={portrait} alt="Portrait preview" className="w-24 h-24 rounded object-cover border-2 border-stone-400" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="biography" className="text-stone-800 font-bold">Biography (optional)</Label>
                    <textarea
                      id="biography"
                      value={biography}
                      onChange={(e) => setBiography(e.target.value)}
                      className="w-full min-h-[150px] rounded border border-stone-400 bg-white/50 px-3 py-2 text-stone-900"
                      placeholder="Tell your character's story..."
                      data-testid="textarea-biography"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {validationError && (
                <div className="bg-red-100 border border-red-400 rounded p-3" data-testid="error-validation">
                  <p className="text-sm text-red-700">{validationError}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
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
                  className="flex-1 bg-stone-900 text-stone-100 hover:bg-stone-800 font-display text-lg"
                  data-testid="button-create-character"
                >
                  Create Character
                </Button>
              </div>
            </form>
          </div>
        </ScrollArea>
      </motion.div>
    </div>
  );
}

// Selection mode types
export type SelectionMode = 'select' | 'target' | 'assign';

// 2. BattleMap
interface BattleMapProps {
  tokens: Token[];
  onMoveToken: (id: string, x: number, y: number) => void;
  onTokenClick?: (token: Token) => void;
  onDeleteToken?: (tokenId: string) => void;
  role: Role;
  gridSize: number;
  backgroundImage?: string;
  scene?: Scene;
  onViewChange?: (viewState: { x: number; y: number; zoom: number }) => void;
  characters?: any[];
  selectionMode?: SelectionMode;
  targetedTokenId?: string | null;
  selectedTokenId?: string | null;
}

export function BattleMap({ tokens, onMoveToken, onTokenClick, onDeleteToken, role, gridSize, backgroundImage, scene, onViewChange, characters = [], selectionMode = 'select', targetedTokenId, selectedTokenId }: BattleMapProps) {
  // Use refs for pan/zoom to avoid re-renders during interaction
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [isPinching, setIsPinching] = useState(false);
  const [, forceUpdate] = useState(0); // Only for zoom display updates
  const initializedSceneRef = useRef<string | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState<string | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  
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
  
  // Lock state for preventing map movement
  const [isMapLocked, setIsMapLocked] = useState(false);
  const isMapLockedRef = useRef(false);
  
  // Gesture state machine to prevent conflicts between pan/zoom/token drag
  type GestureMode = 'idle' | 'panning' | 'pinching' | 'draggingToken';
  const gestureModeRef = useRef<GestureMode>('idle');
  
  // Custom pan state for pointer-based panning (replaces Framer Motion drag)
  const panStartRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const panPointerIdRef = useRef<number | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  
  // Motion values for smooth dragging without re-renders
  const motionX = useMotionValue(0);
  const motionY = useMotionValue(0);
  const motionZoom = useMotionValue(1);
  
  // Initialize view from scene's default values when scene changes
  useEffect(() => {
    if (scene && scene.id !== initializedSceneRef.current) {
      const defaultX = scene.defaultViewX ?? 0;
      const defaultY = scene.defaultViewY ?? 0;
      const defaultZoom = scene.defaultViewZoom ?? 1;
      
      panRef.current = { x: defaultX, y: defaultY };
      zoomRef.current = defaultZoom;
      motionX.set(defaultX);
      motionY.set(defaultY);
      motionZoom.set(defaultZoom);
      
      initializedSceneRef.current = scene.id;
      forceUpdate(n => n + 1);
      
      // Notify parent of initial view
      if (onViewChange) {
        onViewChange({ x: defaultX, y: defaultY, zoom: defaultZoom });
      }
    }
  }, [scene, motionX, motionY, motionZoom, onViewChange]);

  // Clear delete button if token no longer exists (after successful deletion)
  useEffect(() => {
    if (showDeleteButton && !tokens.find(t => t.id === showDeleteButton)) {
      setShowDeleteButton(null);
    }
  }, [tokens, showDeleteButton]);
  
  // Throttled view change notification - only on significant changes
  const notifyViewChangeRef = useRef<NodeJS.Timeout | null>(null);
  const notifyViewChange = () => {
    if (notifyViewChangeRef.current) clearTimeout(notifyViewChangeRef.current);
    notifyViewChangeRef.current = setTimeout(() => {
      if (onViewChange) {
        onViewChange({ x: panRef.current.x, y: panRef.current.y, zoom: zoomRef.current });
      }
    }, 100);
  };

  /**
   * startTokenDrag - Initiates custom pointer-based token dragging
   * Captures pointer and sets up drag state for precise grid snapping
   */
  const startTokenDrag = (e: React.PointerEvent, token: Token) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Set gesture mode to prevent map panning
    gestureModeRef.current = 'draggingToken';
    
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    
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
      startPointerX: e.clientX,
      startPointerY: e.clientY
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

  /**
   * Custom pointer-based map panning (replaces Framer Motion drag)
   * This gives us full control over when panning is allowed and prevents teleportation bugs.
   */
  const handleMapPointerDown = (e: React.PointerEvent) => {
    // Don't start panning if locked, pinching, or dragging a token
    if (isMapLockedRef.current) return;
    if (gestureModeRef.current !== 'idle') return;
    
    // Only pan with primary button (left click / single touch)
    if (e.button !== 0) return;
    
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
    // Only handle if we're panning with this pointer
    if (gestureModeRef.current !== 'panning') return;
    if (panPointerIdRef.current !== e.pointerId) return;
    if (!panStartRef.current) return;
    
    const deltaX = e.clientX - panStartRef.current.pointerX;
    const deltaY = e.clientY - panStartRef.current.pointerY;
    
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
             const defaultX = scene?.defaultViewX ?? 0;
             const defaultY = scene?.defaultViewY ?? 0;
             const defaultZoom = scene?.defaultViewZoom ?? 1;
             panRef.current = { x: defaultX, y: defaultY };
             zoomRef.current = defaultZoom;
             motionX.set(defaultX);
             motionY.set(defaultY);
             motionZoom.set(defaultZoom);
             notifyViewChange();
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
      </div>

      {/* Draggable World Container - Large scrollable space beyond image bounds */}
      {/* Using custom pointer handlers instead of Framer Motion drag for stability */}
      <motion.div 
        className={`absolute ${isMapLocked || draggingToken ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} touch-none`}
        style={{ 
          width: '20000px', 
          height: '20000px', 
          x: motionX, 
          y: motionY, 
          scale: motionZoom,
          left: '-9000px',
          top: '-9000px',
          transformOrigin: "0 0"
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
            {(scene?.gridType || 'square') === 'square' ? (
              /* Square Grid - Infinite repeating pattern */
              <div className="absolute inset-0 pointer-events-none" 
                   style={{ 
                     opacity: scene?.gridOpacity ?? 0.4,
                     backgroundImage: `linear-gradient(${scene?.gridColor || '#ffffff'} ${scene?.gridThickness ?? 1}px, transparent ${scene?.gridThickness ?? 1}px), linear-gradient(90deg, ${scene?.gridColor || '#ffffff'} ${scene?.gridThickness ?? 1}px, transparent ${scene?.gridThickness ?? 1}px)`,
                     backgroundSize: `${scene?.gridSize || gridSize}px ${scene?.gridSize || gridSize}px`
                   }} 
              />
            ) : (
              /* Hex Grid - Infinite repeating pattern */
              <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" style={{ opacity: scene?.gridOpacity ?? 0.4 }}>
                <defs>
                  <pattern id="hexgrid" patternUnits="userSpaceOnUse" width={scene?.gridSize || gridSize} height={(scene?.gridSize || gridSize) * 0.866}>
                    <polygon 
                      points={`${((scene?.gridSize || gridSize) / 4)},0 ${((scene?.gridSize || gridSize) * 3 / 4)},0 ${(scene?.gridSize || gridSize)},${((scene?.gridSize || gridSize) * 0.433)} ${((scene?.gridSize || gridSize) * 3 / 4)},${((scene?.gridSize || gridSize) * 0.866)} ${((scene?.gridSize || gridSize) / 4)},${((scene?.gridSize || gridSize) * 0.866)} 0,${((scene?.gridSize || gridSize) * 0.433)}`}
                      fill="none" 
                      stroke={scene?.gridColor || '#ffffff'} 
                      strokeWidth={scene?.gridThickness ?? 1}
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hexgrid)" />
              </svg>
            )}
          </>
        )}

        {/* Map Background - Positioned in the space, can scroll beyond it */}
        <div 
          className="absolute bg-cover bg-center opacity-80 transition-all duration-500"
          style={{ 
            backgroundImage: `url(${scene?.backgroundImage || backgroundImage || battleMapImage1})`,
            width: '2000px',
            height: '2000px',
            left: '9000px',
            top: '9000px'
          }}
        />

        {/* Tokens - Keep original coordinate system */}
        {tokens.map((token) => {
          const character = getCharacterForToken(token);
          const tokenImage = character?.portrait || token.image;
          const hpPercent = character ? (character.hp / character.maxHp) * 100 : null;
          const effectiveGridSize = scene?.gridSize || gridSize;
          const canDrag = role === 'gm' || token.type === 'player';
          
          const isDragging = draggingToken?.id === token.id;
          const displayX = isDragging ? draggingToken.visualX : token.x;
          const displayY = isDragging ? draggingToken.visualY : token.y;
          
          // Token size is 90% of grid to fit within cells with some padding
          const tokenSize = effectiveGridSize * 0.9;
          // Center the token in the visible cell area (accounting for grid line thickness)
          // The grid line takes up gridThickness pixels at the left/top edge of each cell
          // So the usable cell area is (gridSize - gridThickness) pixels, starting at gridThickness
          const gridThickness = scene?.gridThickness ?? 1;
          const usableCellSize = effectiveGridSize - gridThickness;
          const tokenOffset = gridThickness + (usableCellSize - tokenSize) / 2;
          
          const handleTokenPointerDown = (e: React.PointerEvent) => {
            e.stopPropagation();
            
            if (canDrag) {
              startTokenDrag(e, token);
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
            if (isDragging) {
              endTokenDrag(e, token);
            }
          };
          
          const handleTokenPointerMove = (e: React.PointerEvent) => {
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
            if (isDragging) {
              setDraggingToken(null);
            }
          };
          
          return (
            <div
              key={token.id}
              onPointerDown={handleTokenPointerDown}
              onPointerUp={handleTokenPointerUp}
              onPointerMove={handleTokenPointerMove}
              onPointerCancel={handleTokenPointerCancel}
              onClick={(e) => { 
                e.stopPropagation(); 
                if (showDeleteButton !== token.id && !isDragging) {
                  onTokenClick && onTokenClick(token);
                }
              }}
              className={`absolute top-0 left-0 rounded-full shadow-xl ring-2 ring-white/20 overflow-visible bg-black token-shadow cursor-pointer touch-none select-none ${isDragging ? 'z-20 scale-110' : 'hover:scale-105'} transition-transform`}
              style={{ 
                width: tokenSize, 
                height: tokenSize,
                left: displayX + 9000 + tokenOffset,
                top: displayY + 9000 + tokenOffset
              }}
              aria-label={`${token.type} token`}
              role="button"
              tabIndex={0}
            >
              <img src={tokenImage} alt="token" className="w-full h-full object-cover pointer-events-none rounded-full" />
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
                    if (onDeleteToken) {
                      onDeleteToken(token.id);
                      setShowDeleteButton(null);
                    }
                  }}
                  className="absolute -top-3 -right-3 w-7 h-7 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg border-2 border-red-400 z-30 pointer-events-auto touch-auto"
                  data-testid={`button-delete-token-${token.id}`}
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              )}
              
              {/* HP Bar - Only show if token is linked to a character */}
              {character && hpPercent !== null && (
                <div className="absolute -bottom-1 left-0 right-0 h-1.5 bg-black/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      hpPercent > 60 ? 'bg-green-500' : hpPercent > 30 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, hpPercent))}%` }}
                  />
                </div>
              )}
              
            </div>
          );
        })}
      </motion.div>

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
}

// Ranged weapon categories that use ammunition
const RANGED_WEAPON_CATEGORIES = ['bow', 'crossbow', 'sling', 'firearm'];

function BattleMapHotbarSlot({ hotbar, slotIndex, type, color, character, allHotbars, allItems }: BattleMapHotbarSlotProps) {
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);
  const queryClient = useQueryClient();
  
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
            type: 'attack',
            dieType: 'd20',
            label: `${ammo.name} Broke!`,
            result: totalRemaining,
            modifier: 0,
            total: totalRemaining,
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
            type: 'attack',
            dieType: 'd20',
            label: `${ammo.name} Broke!`,
            result: 0,
            modifier: 0,
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
          type: 'attack',
          dieType: 'd20',
          label: `${ammo.name} Broke!`,
          result: totalRemaining,
          modifier: 0,
          total: totalRemaining,
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

  // Check if weapon requires ammunition to attack
  const requiresAmmunitionForRoll = (weaponCategory: string): boolean => {
    return ['bow', 'crossbow', 'sling', 'firearm'].includes(weaponCategory?.toLowerCase() || '');
  };

  // Handle attack roll (1d20 + attribute modifier)
  const handleAttackRoll = async () => {
    if (!itemData || itemData.itemType !== 'weapon') return;
    
    // Check if ranged weapon requires ammunition
    const ammo = isRangedWeapon(itemData) && requiresAmmunitionForRoll(itemData.weaponCategory) 
      ? getEquippedAmmunition() 
      : null;
    
    if (isRangedWeapon(itemData) && requiresAmmunitionForRoll(itemData.weaponCategory) && !ammo) {
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
    
    // Check for ammunition break (10% chance) for ranged weapons
    if (ammo) {
      await checkAmmunitionBreak(ammo);
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

  // Handle click with single/double click detection
  const handleClick = () => {
    if (!itemData || itemData.itemType !== 'weapon') return;
    
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
  const isClickable = itemData && itemData.itemType === 'weapon';

  if (hotbar?.spellId && spellData) {
    content = spellData.image ? (
      <div className="relative w-full h-full flex items-center justify-center">
        <img 
          src={spellData.image} 
          alt={spellData.name}
          className="w-9 h-9 md:w-14 md:h-14 object-cover rounded"
        />
        <div className={`absolute top-0 right-0 ${spellData.level === 0 ? 'bg-gray-600' : spellData.level <= 3 ? 'bg-blue-600' : spellData.level <= 6 ? 'bg-purple-600' : 'bg-amber-600'} text-white text-[6px] px-0.5 rounded-bl font-bold`}>
          {spellData.level === 0 ? 'C' : spellData.level}
        </div>
      </div>
    ) : (
      <>
        <div className={`font-bold truncate ${getSpellLevelColor(spellData.level)}`}>
          {spellData.name.substring(0, 3)}
        </div>
        <div className="text-[7px] text-stone-400">
          {spellData.level === 0 ? 'C' : `L${spellData.level}`}
        </div>
      </>
    );
    tooltipContent = (
      <>
        <p className="font-bold">{spellData.name}</p>
        <p className="text-sm">Level: {spellData.level === 0 ? 'Cantrip' : spellData.level}</p>
        {spellData.school && <p className="text-sm">School: {spellData.school}</p>}
        {spellData.damage && <p className="text-sm">Damage: {spellData.damage} {spellData.damageType || ''}</p>}
      </>
    );
  } else if (hotbar?.itemId && itemData) {
    // For ammunition, show grouped total quantity
    const displayQuantity = itemData.itemType === 'ammunition' 
      ? getTotalAmmunitionQuantity(itemData) 
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
        {isClickable && <p className="text-xs text-stone-400 mt-1">Click: Attack | Double-click: Damage</p>}
      </>
    );
  } else if (hotbar?.skillName) {
    content = (
      <div className="text-blue-400 font-bold truncate">
        {hotbar.skillName.substring(0, 4)}
      </div>
    );
    tooltipContent = <p className="font-bold">{hotbar.skillName}</p>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={isClickable ? handleClick : undefined}
            className={`
              w-11 h-11 md:w-16 md:h-16 rounded border flex items-center justify-center text-[9px] md:text-[12px]
              ${content 
                ? `bg-stone-800 border-${color}-600/50 hover:border-${color}-500` 
                : 'bg-stone-900/50 border-stone-700 border-dashed'
              }
              ${isClickable ? 'cursor-pointer hover:bg-stone-700/50 active:bg-stone-600/50' : ''}
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
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export function BattleMapHotbars({ character }: BattleMapHotbarsProps) {
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

  // Don't render if no character selected
  if (!character) return null;

  const hotbarTypes = [
    { type: 'weapons', icon: Sword, color: 'amber', maxSlots: 3 },
    { type: 'magic', icon: Sparkles, color: 'purple', maxSlots: 5 },
    { type: 'skills', icon: Dice5, color: 'blue', maxSlots: 5 },
    { type: 'consumables', icon: Heart, color: 'green', maxSlots: 5 },
    { type: 'utility', icon: Package, color: 'stone', maxSlots: 5 }
  ];

  const activeHotbarConfig = hotbarTypes.find(h => h.type === activeHotbar);
  const activeTypeHotbars = hotbars.filter((h: Hotbar) => h.hotbarType === activeHotbar);

  return (
    <>
      {/* HP and Energy Bars - Bottom LEFT, stacked vertically */}
      <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 pointer-events-auto z-30">
        <div className="flex flex-col gap-1">
          {/* Health Bar */}
          <div className="glass-panel p-1.5 md:p-2 rounded border-l-4 border-red-600 relative overflow-hidden w-32 md:w-44">
            <div className="flex justify-between text-[9px] md:text-xs uppercase tracking-wider mb-1 font-bold text-red-200">
              <span>HP</span>
              <span>{character.hp ?? character.currentHp ?? 10}/{character.maxHp ?? 10}</span>
            </div>
            <div className="h-1.5 md:h-2 bg-black/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-red-700 to-red-500"
                initial={{ width: 0 }}
                animate={{ width: `${((character.hp ?? character.currentHp ?? 10) / (character.maxHp ?? 10)) * 100}%` }}
              />
            </div>
          </div>

          {/* Energy Bar */}
          <div className="glass-panel p-1.5 md:p-2 rounded border-l-4 border-blue-600 relative overflow-hidden w-32 md:w-44">
            <div className="flex justify-between text-[9px] md:text-xs uppercase tracking-wider mb-1 font-bold text-blue-200">
              <span>Energy</span>
              <span>{character.energy ?? character.currentEnergy ?? 10}/{character.maxEnergy ?? 10}</span>
            </div>
            <div className="h-1.5 md:h-2 bg-black/50 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-blue-700 to-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${((character.energy ?? character.currentEnergy ?? 10) / (character.maxEnergy ?? 10)) * 100}%` }}
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

// Selection Mode Buttons Component with hold-to-reveal behavior
interface SelectionModeButtonsProps {
  selectionMode: SelectionMode;
  onModeChange: (mode: SelectionMode) => void;
}

export function SelectionModeButtons({ selectionMode, onModeChange }: SelectionModeButtonsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const modes = [
    { mode: 'select' as SelectionMode, icon: MousePointer, label: 'Select', color: 'stone' },
    { mode: 'target' as SelectionMode, icon: Target, label: 'Target', color: 'red' },
    { mode: 'assign' as SelectionMode, icon: UserCheck, label: 'Assign', color: 'green' },
  ];
  
  const currentModeData = modes.find(m => m.mode === selectionMode) || modes[0];
  const CurrentIcon = currentModeData.icon;
  const altModes = modes.filter(m => m.mode !== selectionMode);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    longPressTimerRef.current = setTimeout(() => {
      setIsExpanded(true);
    }, 300);
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
  
  const handleModeSelect = (mode: SelectionMode) => {
    onModeChange(mode);
    setIsExpanded(false);
  };
  
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    
    if (isExpanded) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [isExpanded]);
  
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);
  
  const getColorClasses = (color: string, isActive: boolean) => {
    const colorClasses: Record<string, string> = {
      stone: isActive ? 'bg-stone-600 border-stone-400 text-stone-100' : 'bg-stone-800/80 border-stone-600 text-stone-400 hover:bg-stone-700/50',
      red: isActive ? 'bg-red-600 border-red-400 text-red-100' : 'bg-stone-800/80 border-stone-600 text-red-400 hover:bg-red-900/50',
      green: isActive ? 'bg-green-600 border-green-400 text-green-100' : 'bg-stone-800/80 border-stone-600 text-green-400 hover:bg-green-900/50',
    };
    return colorClasses[color] || colorClasses.stone;
  };

  return (
    <div 
      ref={containerRef}
      className="absolute left-2 md:left-4 top-44 z-30 pointer-events-auto"
    >
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onPointerCancel={handlePointerUp}
                onClick={() => !isExpanded && onModeChange('select')}
                className={`
                  w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                  transition-all duration-200 shadow-lg backdrop-blur-sm touch-none
                  ${getColorClasses(currentModeData.color, true)}
                  scale-110 ring-2 ring-white/20
                `}
                aria-expanded={isExpanded}
                aria-label={`Current mode: ${currentModeData.label}. Hold to reveal other modes.`}
                data-testid={`selection-mode-${selectionMode}`}
              >
                <CurrentIcon className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="font-bold">{currentModeData.label}</p>
              <p className="text-xs text-stone-400">Hold to change mode</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, x: -10, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 'auto' }}
              exit={{ opacity: 0, x: -10, width: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 overflow-hidden"
            >
              {altModes.map(({ mode, icon: Icon, label, color }) => (
                <TooltipProvider key={mode}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.1 }}
                        onClick={() => handleModeSelect(mode)}
                        className={`
                          w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                          transition-all duration-200 shadow-lg backdrop-blur-sm
                          ${getColorClasses(color, false)}
                          hover:scale-105
                        `}
                        data-testid={`selection-mode-${mode}`}
                      >
                        <Icon className="h-4 w-4 md:h-5 md:w-5" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="font-bold">{label}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// 4. Add Character Dialog
interface AddCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCharacter: (characterData: any) => void;
}

function AddCharacterDialog({ open, onOpenChange, onAddCharacter }: AddCharacterDialogProps) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      name: "",
      level: 1,
      hp: 100,
      maxHp: 100,
      energy: 50,
      maxEnergy: 50,
    }
  });

  const onSubmit = (data: any) => {
    onAddCharacter(data);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-amber-500 font-display text-2xl">Add Character</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-stone-300">Character Name</Label>
            <Input
              id="name"
              data-testid="input-character-name"
              {...register("name", { required: true })}
              className="bg-stone-800 border-stone-700 text-stone-200"
              placeholder="Enter character name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="level" className="text-stone-300">Level</Label>
              <Input
                id="level"
                data-testid="input-character-level"
                type="number"
                {...register("level", { required: true, valueAsNumber: true, min: 1 })}
                className="bg-stone-800 border-stone-700 text-stone-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hp" className="text-stone-300">HP</Label>
              <Input
                id="hp"
                data-testid="input-character-hp"
                type="number"
                {...register("hp", { required: true, valueAsNumber: true, min: 1 })}
                className="bg-stone-800 border-stone-700 text-stone-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxHp" className="text-stone-300">Max HP</Label>
              <Input
                id="maxHp"
                data-testid="input-character-maxhp"
                type="number"
                {...register("maxHp", { required: true, valueAsNumber: true, min: 1 })}
                className="bg-stone-800 border-stone-700 text-stone-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="energy" className="text-stone-300">Energy</Label>
              <Input
                id="energy"
                data-testid="input-character-energy"
                type="number"
                {...register("energy", { required: true, valueAsNumber: true, min: 0 })}
                className="bg-stone-800 border-stone-700 text-stone-200"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxEnergy" className="text-stone-300">Max Energy</Label>
            <Input
              id="maxEnergy"
              data-testid="input-character-maxenergy"
              type="number"
              {...register("maxEnergy", { required: true, valueAsNumber: true, min: 0 })}
              className="bg-stone-800 border-stone-700 text-stone-200"
            />
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
              className="flex-1 bg-amber-700 hover:bg-amber-600 text-white"
            >
              Create Character
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
            <input
              type="file"
              id="bg-image"
              accept="image/*"
              onChange={handleImageUpload}
              className="w-full bg-stone-800 border border-stone-700 text-stone-200 rounded px-3 py-2 text-sm"
              data-testid="input-background-image"
            />
            {localSettings.backgroundImage && (
              <div className="mt-2 text-xs text-stone-400">
                Image loaded (preview on battlemap)
              </div>
            )}
          </div>

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
}

export function InitiativeTracker({ open, onOpenChange, sceneId, campaignId, isGM, characters = [] }: InitiativeTrackerProps) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  const { data: initiativeData, isLoading } = useQuery({
    queryKey: [`/api/scenes/${sceneId}/initiative`],
    queryFn: () => api.getSceneInitiative(sceneId!),
    enabled: !!sceneId && open,
    refetchInterval: open ? 3000 : false,
  });

  const entries = initiativeData?.entries || [];
  const inCombat = initiativeData?.inCombat || false;
  const currentTurnCharacterId = initiativeData?.currentTurnCharacterId;

  // Sort entries by value (highest first)
  const sortedEntries = [...entries].sort((a, b) => b.value - a.value);

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

  const handleStartCombat = () => {
    if (sortedEntries.length > 0) {
      combatMutation.mutate({ 
        inCombat: true, 
        currentTurnCharacterId: sortedEntries[0].characterId 
      });
      toast({
        title: "Combat Started",
        description: `${getCharacterName(sortedEntries[0].characterId)}'s turn!`,
      });
    }
  };

  const handleEndCombat = () => {
    combatMutation.mutate({ inCombat: false, currentTurnCharacterId: undefined });
    toast({
      title: "Combat Ended",
      description: "Initiative tracking paused",
    });
  };

  const handleNextTurn = () => {
    const currentIndex = sortedEntries.findIndex(e => e.characterId === currentTurnCharacterId);
    const nextIndex = (currentIndex + 1) % sortedEntries.length;
    const nextCharacterId = sortedEntries[nextIndex].characterId;
    combatMutation.mutate({ inCombat: true, currentTurnCharacterId: nextCharacterId });
    toast({
      title: "Next Turn",
      description: `${getCharacterName(nextCharacterId)}'s turn!`,
    });
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
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 sm:max-w-md">
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
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
}

export function CampaignMenu({ campaignId, role, inviteCode, inspectedChar, onInspectChar, onAddCharacterToken, onChangeMap, characters, members, onAddCharacter, onViewCharacter, onLevelUpAll, chatOpen = false, onChatOpenChange, onAssignCharacter, myPermissions }: CampaignMenuProps) {
  const setChatOpen = onChatOpenChange || (() => {});
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [showLevelUpDialog, setShowLevelUpDialog] = useState(false);
  const [levelUpMode, setLevelUpMode] = useState<'set' | 'add'>('add');
  const [targetLevel, setTargetLevel] = useState(1);
  const [addTokenDialogOpen, setAddTokenDialogOpen] = useState(false);
  const [messages, setMessages] = useState<{ sender: string; text: string; type: string }[]>([
    { sender: "System", text: "Welcome to Arcana Adventure!", type: "system" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [selectedCharForAccess, setSelectedCharForAccess] = useState<any>(null);
  const [accessLevels, setAccessLevels] = useState<Record<string, string>>({});
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [pendingDeleteChar, setPendingDeleteChar] = useState<any>(null);
  const queryClient = useQueryClient();
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
        text: msg.text,
        type: msg.type || 'chat',
      }));
      setMessages([
        { sender: "System", text: "Welcome to Arcana Adventure!", type: "system" },
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
          text: data.message.text,
          type: data.message.type || 'chat',
        }]);
      }
    });
    
    return () => { unsubscribe(); };
  }, [campaignId]);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    setMessages([...messages, { sender: "You", text: chatInput, type: "chat" }]);
    setChatInput("");
  };

  const handleRoll = () => {
    if (campaignId) {
      gameWs.sendDiceRoll('d20', 0, undefined, undefined);
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
            <Button size="sm" variant="outline" onClick={handleRoll} className="border-stone-700 hover:bg-stone-800">
              <Dice5 className="mr-2 h-4 w-4" /> Roll d20
            </Button>
          </div>

          <ScrollArea className="flex-1 pr-4 mb-4 border border-stone-800 rounded bg-black/30 p-2">
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`text-sm ${
                    msg.type === 'system' 
                      ? 'text-amber-400 italic' 
                      : msg.type === 'roll'
                        ? 'bg-gradient-to-r from-cyan-900/40 to-purple-900/40 border border-cyan-700/50 rounded-lg px-3 py-2'
                        : 'text-stone-300'
                  }`}
                >
                  {msg.type === 'roll' ? (
                    <div className="flex items-center gap-2">
                      <Dice5 className="h-4 w-4 text-cyan-400 shrink-0" />
                      <div>
                        <span className="font-bold text-cyan-300">{msg.sender}</span>
                        <span className="text-stone-400 mx-1">rolled</span>
                        <span className="font-mono text-purple-300">{msg.text}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="font-bold text-stone-500 mr-2">{msg.sender}:</span>
                      {msg.text}
                    </>
                  )}
                </div>
              ))}
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
            <Settings className="h-5 w-5" />
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
                        className="p-3 bg-stone-900 rounded border border-stone-800 flex justify-between items-center"
                        data-testid={`member-item-${member.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{member.role === 'gm' ? '🧙‍♂️' : '🛡️'}</span>
                          <div>
                            <div className="font-bold text-stone-200">{member.username || 'Unknown'}</div>
                            <div className="text-xs text-stone-500">{member.role === 'gm' ? 'GM' : 'Player'}</div>
                          </div>
                        </div>
                        {role === 'gm' && member.role !== 'gm' && campaignId && (
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
               
               {/* Characters List */}
               <div className="space-y-2">
                  {characters && characters.length > 0 ? (
                    characters.map((char: any) => (
                      <div 
                        key={char.id} 
                        className="p-3 bg-stone-900 rounded border border-stone-800 flex justify-between items-center gap-2"
                        data-testid={`character-item-${char.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="h-10 w-10 bg-stone-800 rounded flex items-center justify-center border border-stone-700 shrink-0">
                            <Sword className="h-5 w-5 text-stone-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-stone-200 truncate">{char.name}</div>
                            <div className="text-xs text-stone-500">
                              Lvl {char.level} {char.class}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-xs text-stone-400 hidden sm:block">
                            HP: {char.hp}/{char.maxHp}
                          </div>
                          {onViewCharacter && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onViewCharacter(char)}
                              className="bg-amber-900/30 hover:bg-amber-800/50 border-amber-700 text-amber-200 text-xs"
                              data-testid={`button-view-character-${char.id}`}
                            >
                              View Sheet
                            </Button>
                          )}
                          {onAssignCharacter && (role === 'gm' || myPermissions?.permissions?.[char.id] === 'edit' || myPermissions?.permissions?.[char.id] === 'owner') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onAssignCharacter(char)}
                              className="bg-green-900/30 hover:bg-green-800/50 border-green-700 text-green-200 text-xs"
                              data-testid={`button-assign-character-${char.id}`}
                            >
                              Assign
                            </Button>
                          )}
                          {role === 'gm' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedCharForAccess(char);
                                setShowAccessDialog(true);
                              }}
                              className="bg-purple-900/30 hover:bg-purple-800/50 border-purple-700 text-purple-200 text-xs"
                              data-testid={`button-manage-access-${char.id}`}
                            >
                              Access
                            </Button>
                          )}
                          {role === 'gm' && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteCharacter(char)}
                                    disabled={deleteCharacterMutation.isPending}
                                    className="h-8 w-8 p-0 text-red-500 hover:text-red-400 hover:bg-red-900/30"
                                    data-testid={`button-delete-character-${char.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-stone-800 border-stone-700">
                                  <p>Delete Character</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-stone-500 text-sm">
                      No characters yet
                    </div>
                  )}
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

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="bg-stone-800 hover:bg-stone-700" onClick={() => setAddTokenDialogOpen(true)} data-testid="button-add-token">
                  <Plus className="mr-2 h-4 w-4" /> Add Token
                </Button>
                <Button variant="secondary" className="bg-stone-800 hover:bg-stone-700" onClick={onChangeMap}>
                  <MapIcon className="mr-2 h-4 w-4" /> Change Map
                </Button>
                <Button 
                  variant="secondary" 
                  className="bg-amber-800 hover:bg-amber-700 col-span-2" 
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
          
          <div className="space-y-2 mt-4">
            {characters && characters.length > 0 ? (
              characters.map((char: any) => (
                <div
                  key={char.id}
                  className="flex items-center gap-3 p-3 bg-stone-900 border border-stone-800 rounded-lg hover:border-amber-600/50 cursor-pointer transition-colors"
                  onClick={() => {
                    if (onAddCharacterToken) {
                      onAddCharacterToken(char);
                    }
                    setAddTokenDialogOpen(false);
                  }}
                  data-testid={`select-character-token-${char.id}`}
                >
                  {/* Character Portrait */}
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-stone-700 flex-shrink-0">
                    {char.portrait ? (
                      <img src={char.portrait} alt={char.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-stone-800 flex items-center justify-center">
                        <Users className="h-6 w-6 text-stone-600" />
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
                      {char.currentHp ?? char.maxHp ?? 10}/{char.maxHp ?? 10}
                    </div>
                    <div className="text-xs text-stone-500">HP</div>
                  </div>
                </div>
              ))
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
          <div className="space-y-3 mt-4">
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
                      <span className="text-stone-200">{member.username}</span>
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
    mutationFn: (data: { hotbarType: string; slotNumber: number; itemId?: string; spellId?: string; skillName?: string }) =>
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
        // Add spell to hotbar
        await upsertMutation.mutateAsync({
          hotbarType,
          slotNumber,
          spellId: data.id
        });

        // Update spell's isEquipped flag
        await api.updateSpell(data.id, { isEquipped: true });
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
    { key: 'skillAgility', name: 'Agility', category: 'Physical' },
    { key: 'skillStrength', name: 'Strength', category: 'Physical' },
    { key: 'skillStealth', name: 'Stealth', category: 'Physical' },
    { key: 'skillSleightOfHand', name: 'Sleight of Hand', category: 'Physical' },
    { key: 'skillArcana', name: 'Arcana', category: 'Mental' },
    { key: 'skillConcentration', name: 'Concentration', category: 'Mental' },
    { key: 'skillWisdom', name: 'Wisdom', category: 'Mental' },
    { key: 'skillInvestigation', name: 'Investigation', category: 'Mental' },
    { key: 'skillPerception', name: 'Perception', category: 'Mental' },
    { key: 'skillMedicine', name: 'Medicine', category: 'Mental' },
    { key: 'skillHistory', name: 'History', category: 'Mental' },
    { key: 'skillCharisma', name: 'Charisma', category: 'Social' },
    { key: 'skillDeception', name: 'Deception', category: 'Social' },
    { key: 'skillIntimidation', name: 'Intimidation', category: 'Social' },
    { key: 'skillCulture', name: 'Culture', category: 'Social' },
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
                      <span className="text-stone-500 text-xs">{spell.level === 0 ? 'C' : `L${spell.level}`}</span>
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
                        <span className="font-medium text-stone-300">{skill.name}</span>
                        <span className="text-stone-500">{modifier}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
    if (isRangedWeapon(itemData) && requiresAmmunitionForRoll(itemData.weaponCategory)) {
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
    if (isRangedWeapon(itemData) && requiresAmmunitionForRoll(itemData.weaponCategory)) {
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
      const getLevelColor = (level: number) => {
        if (level === 0) return 'text-gray-400';
        if (level <= 3) return 'text-blue-400';
        if (level <= 6) return 'text-purple-400';
        return 'text-amber-400';
      };

      const getLevelBgColor = (level: number) => {
        if (level === 0) return 'bg-gray-600';
        if (level <= 3) return 'bg-blue-600';
        if (level <= 6) return 'bg-purple-600';
        return 'bg-amber-600';
      };
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full h-full flex flex-col items-center justify-center p-0.5">
                {spellData.image ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img 
                      src={spellData.image} 
                      alt={spellData.name}
                      className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 object-cover rounded"
                    />
                    {/* Level badge */}
                    <div className={`absolute top-0 right-0 ${getLevelBgColor(spellData.level)} text-white text-[8px] px-1 rounded-bl font-bold`}>
                      {spellData.level === 0 ? 'C' : spellData.level}
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Spell placeholder icon */}
                    <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded bg-purple-900/30 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-purple-400" />
                    </div>
                    {/* Level badge */}
                    <div className={`absolute top-0 right-0 ${getLevelBgColor(spellData.level)} text-white text-[8px] px-1 rounded-bl font-bold`}>
                      {spellData.level === 0 ? 'C' : spellData.level}
                    </div>
                    {/* Damage badge if spell has damage */}
                    {spellData.damage && (
                      <div className="absolute bottom-0 left-0 bg-red-900/90 text-red-300 text-[7px] px-0.5 rounded-tr font-bold">
                        {spellData.damage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-bold">{spellData.name}</p>
              <p className="text-sm">Level: {spellData.level === 0 ? 'Cantrip' : spellData.level}</p>
              {spellData.school && <p className="text-sm">School: {spellData.school}</p>}
              {spellData.damage && <p className="text-sm">Damage: {spellData.damage} {spellData.damageType || ''}</p>}
              {spellData.range && <p className="text-sm">Range: {spellData.range}ft</p>}
              {spellData.castingTime && <p className="text-sm">Casting: {spellData.castingTime}</p>}
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

    // Show loading state if item/spell is being fetched
    if ((hotbar.itemId && itemLoading) || (hotbar.spellId && spellLoading)) {
      return (
        <div className="text-xs text-center text-stone-400 animate-pulse">
          <div className="text-[10px]">Loading...</div>
        </div>
      );
    }

    // Show orphaned state if item/spell was deleted but hotbar entry remains
    if ((hotbar.itemId && !itemData) || (hotbar.spellId && !spellData)) {
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


// Race data with stats for Arcana Adventure
const ARCANA_RACES = [
  { name: 'Human', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Versatile', speed: 30, flySpeed: 0 },
  { name: 'Elf', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Elven Heritage', speed: 35, flySpeed: 0 },
  { name: 'Dwarf', size: 'Medium', naturalArmor: 6, sizeBonus: 0, featTree: 'Dwarven Resilience', speed: 25, flySpeed: 0 },
  { name: 'Halfling', size: 'Small', naturalArmor: 5, sizeBonus: 1, featTree: 'Lucky', speed: 25, flySpeed: 0 },
  { name: 'Orc', size: 'Medium', naturalArmor: 6, sizeBonus: 0, featTree: 'Savage Attacks', speed: 30, flySpeed: 0 },
  { name: 'Tiefling', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Infernal Legacy', speed: 30, flySpeed: 0 },
  { name: 'Dragonborn', size: 'Medium', naturalArmor: 6, sizeBonus: 0, featTree: 'Draconic Ancestry', speed: 30, flySpeed: 0 },
  { name: 'Gnome', size: 'Small', naturalArmor: 5, sizeBonus: 1, featTree: 'Gnome Cunning', speed: 25, flySpeed: 0 },
  { name: 'Half-Elf', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Dual Heritage', speed: 30, flySpeed: 0 },
  { name: 'Half-Orc', size: 'Medium', naturalArmor: 6, sizeBonus: 0, featTree: 'Relentless Endurance', speed: 30, flySpeed: 0 },
  { name: 'Aasimar', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Celestial Legacy', speed: 30, flySpeed: 0 },
  { name: 'Goliath', size: 'Large', naturalArmor: 7, sizeBonus: -1, featTree: "Stone's Endurance", speed: 30, flySpeed: 0 },
  { name: 'Tabaxi', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Feline Agility', speed: 35, flySpeed: 0 },
  { name: 'Kenku', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Mimicry', speed: 30, flySpeed: 0 },
  { name: 'Aarakocra', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Flight', speed: 25, flySpeed: 50 },
  { name: 'Firbolg', size: 'Large', naturalArmor: 6, sizeBonus: -1, featTree: 'Hidden Step', speed: 30, flySpeed: 0 },
  { name: 'Kobold', size: 'Small', naturalArmor: 4, sizeBonus: 1, featTree: 'Pack Tactics', speed: 30, flySpeed: 0 },
  { name: 'Lizardfolk', size: 'Medium', naturalArmor: 7, sizeBonus: 0, featTree: 'Natural Armor', speed: 30, flySpeed: 0 },
  { name: 'Changeling', size: 'Medium', naturalArmor: 5, sizeBonus: 0, featTree: 'Shapechanger', speed: 30, flySpeed: 0 },
  { name: 'Warforged', size: 'Medium', naturalArmor: 8, sizeBonus: 0, featTree: 'Constructed Resilience', speed: 30, flySpeed: 0 },
];

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
          if (onDeleteMultiple && stackedItems.length > 0) {
            const itemsToDelete = stackedItems.slice(0, count).map((i: any) => i.id);
            onDeleteMultiple(itemsToDelete);
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
interface CharacterSheetProps {
  character: any;
  isGM: boolean;
  isOwner: boolean;
  onUpdate?: (updates: any) => void;
  onClose?: () => void;
  defaultTab?: string;
  campaignId?: string;
  sceneId?: string;
}

export function CharacterSheet({ character, isGM, isOwner, onUpdate, onClose, defaultTab = "overview", campaignId, sceneId }: CharacterSheetProps) {
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

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>();
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
  // HP/Energy fields allow string | number to support empty input during editing
  const [overviewData, setOverviewData] = useState<{
    name: string;
    level: number;
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
  
  // Handle race selection - auto-fill race stats
  const handleRaceChange = (raceName: string) => {
    const raceData = ARCANA_RACES.find(r => r.name === raceName);
    if (raceData) {
      setOverviewData(prev => ({
        ...prev,
        race: raceName,
        size: raceData.size,
        naturalArmor: raceData.naturalArmor,
        sizeBonus: raceData.sizeBonus,
        featTree: raceData.featTree,
        speed: raceData.speed,
        flySpeed: raceData.flySpeed
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
  const [spellLevelFilter, setSpellLevelFilter] = useState("all");
  const [spellSchoolFilter, setSpellSchoolFilter] = useState("all");
  const [spellSort, setSpellSort] = useState("name-asc");
  const [showAddSpell, setShowAddSpell] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState<any>(null);
  const [showSpellDetail, setShowSpellDetail] = useState(false);
  const [isEditingSpell, setIsEditingSpell] = useState(false);
  const [editSpellData, setEditSpellData] = useState<any>(null);
  const [showSpellDeleteConfirm, setShowSpellDeleteConfirm] = useState(false);
  
  const [rollPanelOpen, setRollPanelOpen] = useState(false);
  const [rollPanelData, setRollPanelData] = useState<{name: string, modifier: number, type: 'skill' | 'attribute'} | null>(null);
  const [extraModifier, setExtraModifier] = useState(0);
  const rollDataRef = useRef<{name: string, modifier: number} | null>(null);
  
  const canEdit = isOwner || isGM;
  
  const handleRoll = (name: string, modifier: number, extraMod: number = 0) => {
    const dieType = modifier === 5 ? 'd30' : 'd20';
    const totalMod = modifier + extraMod;
    gameWs.sendDiceRoll(dieType, totalMod, name, liveCharacter.id);
    setRollPanelOpen(false);
    setExtraModifier(0);
  };
  
  const confirmRollFromPanel = () => {
    if (rollDataRef.current) {
      const { name, modifier } = rollDataRef.current;
      handleRoll(name, modifier, extraModifier);
    }
  };
  
  const openRollPanel = (name: string, modifier: number, type: 'skill' | 'attribute') => {
    rollDataRef.current = { name, modifier };
    setRollPanelData({ name, modifier, type });
    setExtraModifier(0);
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
  const totalDC = (liveCharacter.sizeBonus || 0) + (liveCharacter.naturalArmor || 5) + equippedArmorBonus;

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
      if (onUpdate) {
        // Notify parent component
        queryClient.invalidateQueries({ queryKey: ['characters'] });
      }
      toast({ title: "Character updated successfully" });
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
  const carryCapacity = 50 + (mightMod * 10) + equippedContainerBonus;
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

  return (
    <div className="w-full h-full bg-stone-900 text-stone-200 flex flex-col overflow-hidden">
      <Tabs defaultValue={defaultTab} className="w-full h-full flex flex-col overflow-hidden">
        {/* Icon-based tabs matching battlemap sidebar - icons on mobile, icons+text on desktop */}
        <TabsList className="grid w-full grid-cols-7 bg-stone-950 border-b border-stone-700 shrink-0 h-auto p-1 gap-0.5 sm:gap-1">
          {tabConfig.map(({ value, icon: Icon, color, label }) => (
            <TooltipProvider key={value}>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value={value} 
                    data-testid={`tab-${value}`}
                    aria-label={label}
                    className={`
                      flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-lg border border-transparent
                      transition-all duration-200 min-h-[44px] sm:min-h-[56px]
                      data-[state=active]:shadow-md
                      ${getTabColorClasses(color)}
                    `}
                  >
                    <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
                    <span className="text-[9px] sm:text-xs mt-0.5 leading-tight font-medium">{label}</span>
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-stone-800 border-stone-700 text-stone-200">
                  <p>{label}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
                      <Badge variant="outline" className="text-stone-300 border-stone-600" data-testid="badge-level">
                        Level {liveCharacter.level}
                      </Badge>
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
                              {ARCANA_RACES.map(race => (
                                <SelectItem key={race.name} value={race.name}>{race.name}</SelectItem>
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
                            onChange={(e) => setOverviewData({ ...overviewData, level: parseInt(e.target.value) || 1 })}
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
                      {/* Feat Tree (auto-filled from race) */}
                      <div>
                        <Label className="text-xs text-stone-400">Feat Tree</Label>
                        <p className="text-stone-200" data-testid="text-feat-tree">
                          {editingOverview ? overviewData.featTree : liveCharacter.featTree || "None"}
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
                  <div className="flex gap-3 mt-2 text-xs text-stone-400">
                    <span>Size: {liveCharacter.sizeBonus >= 0 ? `+${liveCharacter.sizeBonus}` : liveCharacter.sizeBonus}</span>
                    <span>Natural: +{liveCharacter.naturalArmor || 5}</span>
                    <span>Armor: +{equippedArmorBonus}</span>
                  </div>
                </div>

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
                        {liveCharacter.hp} / {liveCharacter.maxHp}
                      </span>
                    )}
                  </div>
                  {!editingOverview && <Progress value={Math.round((liveCharacter.hp / liveCharacter.maxHp) * 100)} className="h-3" data-testid="progress-hp" />}
                  
                  {/* Level Progression Info */}
                  {!editingOverview && (
                    <div className="text-xs text-stone-500 mt-2" data-testid="text-level-progression">
                      Level {liveCharacter.level || 1} provides {(liveCharacter.level || 1) + Math.floor((liveCharacter.level || 1) / 3)}d12 base HP ({liveCharacter.level || 1}d12 + {Math.floor((liveCharacter.level || 1) / 3)}d12 bonus at levels 3,6,9...)
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
                        {liveCharacter.energy} / {liveCharacter.maxEnergy}
                      </span>
                    )}
                  </div>
                  {!editingOverview && <Progress value={Math.round((liveCharacter.energy / liveCharacter.maxEnergy) * 100)} className="h-3" data-testid="progress-energy" />}
                </div>

                {/* Edit Mode Buttons */}
                {editingOverview && (
                  <div className="flex gap-2 pt-4 border-t border-stone-700">
                    <Button
                      size="sm"
                      onClick={() => {
                        const dataToSave = {
                          ...overviewData,
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
                    const numericValue = typeof value === 'string' ? (parseInt(value) || 0) : value;
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
                            <div className="text-2xl font-bold text-amber-500 mt-1" data-testid={`text-attribute-${attr.key}`}>
                              {numericValue >= 0 ? `+${numericValue}` : numericValue}
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
                {(isOwner || isGM) && !editingSkills && (
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
                  
                  const skillValues = editingSkills 
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
                    { key: 'skillAgility', name: 'Agility' },
                    { key: 'skillArcana', name: 'Arcana' },
                    { key: 'skillCharisma', name: 'Charisma' },
                    { key: 'skillConcentration', name: 'Concentration' },
                    { key: 'skillCulture', name: 'Culture' },
                    { key: 'skillDeception', name: 'Deception' },
                    { key: 'skillHistory', name: 'History' },
                    { key: 'skillIntimidation', name: 'Intimidation' },
                    { key: 'skillInvestigation', name: 'Investigation' },
                    { key: 'skillMedicine', name: 'Medicine' },
                    { key: 'skillPerception', name: 'Perception' },
                    { key: 'skillSleightOfHand', name: 'Sleight of Hand' },
                    { key: 'skillStealth', name: 'Stealth' },
                    { key: 'skillStrength', name: 'Strength' },
                    { key: 'skillWisdom', name: 'Wisdom' },
                  ].map(skill => {
                    const value = editingSkills ? skillsData[skill.key as keyof typeof skillsData] : (liveCharacter[skill.key] || 0);
                    return editingSkills ? (
                      <div key={skill.key} className="flex flex-col gap-1 p-3 bg-stone-900 border border-amber-700 rounded-md">
                        <Label className="text-xs text-stone-400">{skill.name}</Label>
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
                        const numericValue = typeof value === 'string' ? (parseInt(value) || 0) : value;
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
                                    handleRoll(skill.name, numericValue);
                                  }
                                  clickTimersRef.current.delete(cardKey);
                                }, 400);
                                clickTimersRef.current.set(cardKey, timer);
                              }
                            }}
                            data-testid={`badge-skill-${skill.key}`}
                          >
                            <span className="text-xs">{skill.name}</span>
                            <span className="font-bold ml-2">{numericValue >= 0 ? `+${numericValue}` : numericValue}</span>
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
                      onClick={() => {
                        const dataToSave = Object.fromEntries(
                          Object.entries(skillsData).map(([key, val]) => [key, val === '' ? 0 : Number(val)])
                        );
                        updateCharacterMutation.mutate(dataToSave);
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
                  {(isOwner || isGM) && (
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
                      {totalWeight.toFixed(1)} / {carryCapacity} lbs
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
                {canEdit && (
                  <div className="flex justify-end">
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
                      Add Spell
                    </Button>
                  </div>
                )}
                {/* Spell Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-stone-900 p-3 rounded">
                    <Label className="text-xs text-stone-400">Total Spells</Label>
                    <p className="text-2xl font-bold text-purple-400" data-testid="text-spells-known">{spells.length}</p>
                  </div>
                  <div className="bg-stone-900 p-3 rounded">
                    <Label className="text-xs text-stone-400">Cantrips</Label>
                    <p className="text-2xl font-bold text-gray-400">{spells.filter((s: any) => s.level === 0).length}</p>
                  </div>
                  <div className="bg-stone-900 p-3 rounded">
                    <Label className="text-xs text-stone-400">Equipped</Label>
                    <p className="text-2xl font-bold text-amber-400">{spells.filter((s: any) => s.isEquipped).length}</p>
                  </div>
                </div>

                {/* Filters and Search */}
                <div className="space-y-2">
                  <Input
                    placeholder="Search spells..."
                    value={spellSearch}
                    onChange={(e) => setSpellSearch(e.target.value)}
                    className="bg-stone-900 border-stone-700"
                    data-testid="input-spell-search"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={spellLevelFilter} onValueChange={setSpellLevelFilter}>
                      <SelectTrigger className="bg-stone-900 border-stone-700" data-testid="select-spell-level-filter">
                        <SelectValue placeholder="Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Levels</SelectItem>
                        <SelectItem value="0">Cantrips</SelectItem>
                        {[1,2,3,4,5,6,7,8,9].map(l => (
                          <SelectItem key={l} value={l.toString()}>Level {l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={spellSchoolFilter} onValueChange={setSpellSchoolFilter}>
                      <SelectTrigger className="bg-stone-900 border-stone-700" data-testid="select-spell-school-filter">
                        <SelectValue placeholder="School" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Schools</SelectItem>
                        <SelectItem value="evocation">Evocation</SelectItem>
                        <SelectItem value="abjuration">Abjuration</SelectItem>
                        <SelectItem value="conjuration">Conjuration</SelectItem>
                        <SelectItem value="divination">Divination</SelectItem>
                        <SelectItem value="enchantment">Enchantment</SelectItem>
                        <SelectItem value="illusion">Illusion</SelectItem>
                        <SelectItem value="necromancy">Necromancy</SelectItem>
                        <SelectItem value="transmutation">Transmutation</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={spellSort} onValueChange={setSpellSort}>
                      <SelectTrigger className="bg-stone-900 border-stone-700" data-testid="select-spell-sort">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                        <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                        <SelectItem value="level-asc">Level (Low-High)</SelectItem>
                        <SelectItem value="level-desc">Level (High-Low)</SelectItem>
                        <SelectItem value="school-asc">School (A-Z)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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

                    if (spellLevelFilter !== "all") {
                      filteredSpells = filteredSpells.filter((s: any) =>
                        s.level === parseInt(spellLevelFilter)
                      );
                    }

                    if (spellSchoolFilter !== "all") {
                      filteredSpells = filteredSpells.filter((s: any) =>
                        s.school?.toLowerCase() === spellSchoolFilter.toLowerCase()
                      );
                    }

                    if (spellSort === "name-asc") {
                      filteredSpells.sort((a: any, b: any) => a.name.localeCompare(b.name));
                    } else if (spellSort === "name-desc") {
                      filteredSpells.sort((a: any, b: any) => b.name.localeCompare(a.name));
                    } else if (spellSort === "level-asc") {
                      filteredSpells.sort((a: any, b: any) => a.level - b.level);
                    } else if (spellSort === "level-desc") {
                      filteredSpells.sort((a: any, b: any) => b.level - a.level);
                    } else if (spellSort === "school-asc") {
                      filteredSpells.sort((a: any, b: any) => (a.school || "").localeCompare(b.school || ""));
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
                                <div className="flex flex-wrap gap-2 mt-1">
                                  <Badge className={`${getSpellLevelBgColor(spell.level)} text-xs`}>
                                    {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}
                                  </Badge>
                                  {spell.school && (
                                    <Badge className={`${getSchoolBadgeColor(spell.school)} text-xs`}>
                                      {spell.school}
                                    </Badge>
                                  )}
                                  {spell.damage && (
                                    <Badge variant="outline" className="bg-red-900/30 text-red-300 border-red-700 text-xs">
                                      {spell.damage} {spell.damageType || ''}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-3 mt-2 text-xs text-stone-400">
                                  {spell.castingTime && <span>⏱ {spell.castingTime}</span>}
                                  {spell.range && <span>📏 {spell.range}ft</span>}
                                  {spell.aoe && <span>💥 {spell.aoe}</span>}
                                  {spell.duration && <span>⏳ {spell.duration}</span>}
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
            <Dialog open={showAddSpell} onOpenChange={setShowAddSpell}>
              <DialogContent key={editSpellData?.id || 'new'} className="max-w-2xl bg-stone-900 border-stone-700 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-purple-400">
                    {editSpellData ? 'Edit Spell' : 'Add New Spell'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const spellData = {
                    name: formData.get('name'),
                    image: formData.get('image') || undefined,
                    description: formData.get('description') || undefined,
                    level: parseInt(formData.get('level') as string),
                    school: formData.get('school') === 'none' ? undefined : (formData.get('school') || undefined),
                    damage: formData.get('damage') || undefined,
                    damageType: formData.get('damageType') || undefined,
                    range: formData.get('range') ? parseInt(formData.get('range') as string) : undefined,
                    aoe: formData.get('aoe') === 'none' ? undefined : (formData.get('aoe') || undefined),
                    castingTime: formData.get('castingTime') || undefined,
                    duration: formData.get('duration') || undefined,
                  };

                  if (editSpellData) {
                    updateSpellMutation.mutate({ id: editSpellData.id, data: spellData });
                  } else {
                    createSpellMutation.mutate(spellData);
                  }
                }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Spell Name *</Label>
                      <Input
                        name="name"
                        required
                        defaultValue={editSpellData?.name}
                        className="bg-stone-800 border-stone-700"
                        data-testid="input-spell-name"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>Level *</Label>
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
                      <Select name="level" defaultValue={editSpellData?.level?.toString() || "0"} required disabled={!isGM}>
                        <SelectTrigger className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Cantrip</SelectItem>
                          {[1,2,3,4,5,6,7,8,9].map(l => (
                            <SelectItem key={l} value={l.toString()}>Level {l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>School</Label>
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
                      <Select name="school" defaultValue={editSpellData?.school || "none"} disabled={!isGM}>
                        <SelectTrigger className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}>
                          <SelectValue placeholder="Select school" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="evocation">Evocation</SelectItem>
                          <SelectItem value="abjuration">Abjuration</SelectItem>
                          <SelectItem value="conjuration">Conjuration</SelectItem>
                          <SelectItem value="divination">Divination</SelectItem>
                          <SelectItem value="enchantment">Enchantment</SelectItem>
                          <SelectItem value="illusion">Illusion</SelectItem>
                          <SelectItem value="necromancy">Necromancy</SelectItem>
                          <SelectItem value="transmutation">Transmutation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label>Image URL</Label>
                      <Input
                        name="image"
                        type="url"
                        defaultValue={editSpellData?.image}
                        className="bg-stone-800 border-stone-700"
                        placeholder="https://example.com/spell-icon.png"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        name="description"
                        defaultValue={editSpellData?.description}
                        className="bg-stone-800 border-stone-700 min-h-[80px]"
                        placeholder="Describe what the spell does..."
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>Damage (dice notation)</Label>
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
                        name="damage"
                        defaultValue={editSpellData?.damage}
                        className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                        placeholder="2d6"
                        disabled={!isGM}
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
                      <Input
                        name="damageType"
                        defaultValue={editSpellData?.damageType}
                        className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                        placeholder="fire, cold, lightning..."
                        disabled={!isGM}
                      />
                    </div>
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
                        name="range"
                        type="number"
                        defaultValue={editSpellData?.range}
                        className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                        placeholder="60"
                        disabled={!isGM}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>Area of Effect</Label>
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
                        name="aoe"
                        defaultValue={editSpellData?.aoe}
                        className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                        placeholder="15-foot cone"
                        disabled={!isGM}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>Casting Time</Label>
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
                        name="castingTime"
                        defaultValue={editSpellData?.castingTime}
                        className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                        placeholder="1 action"
                        disabled={!isGM}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>Duration</Label>
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
                        name="duration"
                        defaultValue={editSpellData?.duration}
                        className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}
                        placeholder="Instantaneous"
                        disabled={!isGM}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setShowAddSpell(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
                      {editSpellData ? 'Update Spell' : 'Add Spell'}
                    </Button>
                  </div>
                </form>
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
                        <Badge className={`${getSpellLevelBgColor(selectedSpell.level)}`}>
                          {selectedSpell.level === 0 ? 'Cantrip' : `Level ${selectedSpell.level}`}
                        </Badge>
                        {selectedSpell.school && (
                          <Badge className={getSchoolBadgeColor(selectedSpell.school)}>
                            {selectedSpell.school}
                          </Badge>
                        )}
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

                      <div className="flex gap-2 pt-4 border-t border-stone-700">
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
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => portraitInputRef.current?.click()}
                        data-testid="button-upload-portrait"
                      >
                        <Camera className="h-4 w-4 mr-1" />
                        Upload
                      </Button>
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
              </CardContent>
            </Card>
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
            <div className="text-center text-sm text-stone-400">
              Total: <span className="text-amber-500 font-semibold">{(rollPanelData?.modifier || 0) + extraModifier >= 0 ? '+' : ''}{(rollPanelData?.modifier || 0) + extraModifier}</span>
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
    </div>
  );
}

// Add Item Dialog Component
function AddItemDialog({ open, onOpenChange, onSave, isGM, campaignId }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (data: any) => void; isGM: boolean; campaignId?: string }) {
  const [activeTab, setActiveTab] = useState<'templates' | 'create'>('templates');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateTypeFilter, setTemplateTypeFilter] = useState('all');
  const [quantityPickerTemplate, setQuantityPickerTemplate] = useState<any>(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { data: templateData } = useQuery({
    queryKey: ['template-items', campaignId],
    queryFn: () => campaignId ? api.getTemplateItems(campaignId) : Promise.resolve({ campaignItems: [], systemItems: [] }),
    enabled: !!campaignId && open,
  });

  const allTemplates = [...(templateData?.systemItems || []), ...(templateData?.campaignItems || [])];
  const filteredTemplates = allTemplates.filter((item: any) => {
    const matchesSearch = item.name.toLowerCase().includes(templateSearch.toLowerCase());
    const matchesType = templateTypeFilter === 'all' || item.itemType === templateTypeFilter;
    return matchesSearch && matchesType;
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
  });

  const [showImageCrop, setShowImageCrop] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0, size: 150 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);

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
    // Convert empty/NaN values to 0 on submit
    const cleanedData = {
      ...formData,
      mod: Number(formData.mod) || 0,
      range: Number(formData.range) || 0,
      itemWeight: Number(formData.itemWeight) || 0,
      priceCopper: Number(formData.priceCopper) || 0,
      priceSilver: Number(formData.priceSilver) || 0,
      priceGold: Number(formData.priceGold) || 0,
      pricePlatinum: Number(formData.pricePlatinum) || 0,
      quantity: Number(formData.quantity) || 1,
      carryCapacity: Number(formData.carryCapacity) || 0,
      armorBonus: Number(formData.armorBonus) || 0,
      damageReduction: Number(formData.damageReduction) || 0,
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
                <Select value={templateTypeFilter} onValueChange={setTemplateTypeFilter}>
                  <SelectTrigger className="w-[150px] bg-stone-800 border-stone-700">
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
                    onClick={() => imageInputRef.current?.click()}
                    className="bg-stone-800 border-stone-600 hover:bg-stone-700"
                    data-testid="button-upload-item-image"
                  >
                    <Upload className="h-4 w-4 mr-1" /> Upload
                  </Button>
                </div>
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
                <Input type="number" min="0" step="0.1" value={formData.itemWeight || ''} onChange={(e) => setFormData({...formData, itemWeight: e.target.value === '' ? '' : parseFloat(e.target.value)})} className="bg-stone-800 border-stone-700" />
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
                  <Input value={formData.damageType} onChange={(e) => setFormData({...formData, damageType: e.target.value})} placeholder="slashing" className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Modifier</Label>
                  <Input type="number" value={formData.mod || ''} onChange={(e) => setFormData({...formData, mod: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Range (feet)</Label>
                  <Input type="number" min="0" value={formData.range || ''} onChange={(e) => setFormData({...formData, range: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
              </div>
            </div>
            <div className="border-t border-stone-700 pt-4">
              <h3 className="text-sm font-bold text-stone-300 mb-3">Price</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Platinum</Label>
                  <Input type="number" min="0" value={formData.pricePlatinum || ''} onChange={(e) => setFormData({...formData, pricePlatinum: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Gold</Label>
                  <Input type="number" min="0" value={formData.priceGold || ''} onChange={(e) => setFormData({...formData, priceGold: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Silver</Label>
                  <Input type="number" min="0" value={formData.priceSilver || ''} onChange={(e) => setFormData({...formData, priceSilver: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Copper</Label>
                  <Input type="number" min="0" value={formData.priceCopper || ''} onChange={(e) => setFormData({...formData, priceCopper: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                </div>
              </div>
            </div>
            <div className="border-t border-stone-700 pt-4">
              <Label>Durability: {formData.durability}/10</Label>
              <Slider value={[formData.durability]} onValueChange={(v) => setFormData({...formData, durability: v[0]})} min={0} max={10} step={1} className="mt-2" />
            </div>
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
                <div className="space-y-4">
                  <div>
                    <Label>Weapon Category</Label>
                    <Select value={formData.weaponCategory} onValueChange={(v) => setFormData({...formData, weaponCategory: v})}>
                      <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-weapon-category">
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
                      id="isHeavy" 
                      checked={formData.isHeavy || false} 
                      onCheckedChange={(checked) => setFormData({...formData, isHeavy: !!checked})}
                      data-testid="checkbox-is-heavy"
                    />
                    <Label htmlFor="isHeavy" className="cursor-pointer">Two-Handed Weapon (blocks right hand slot)</Label>
                  </div>
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
                      value={formData.armorBonus || ''} 
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
                      value={formData.damageReduction || ''} 
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
                      value={formData.carryCapacity || ''} 
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
      // Convert empty/NaN values to 0 before saving
      const cleanedData = {
        ...data,
        mod: Number(data.mod) || 0,
        range: Number(data.range) || 0,
        itemWeight: Number(data.itemWeight) || 0,
        priceCopper: Number(data.priceCopper) || 0,
        priceSilver: Number(data.priceSilver) || 0,
        priceGold: Number(data.priceGold) || 0,
        pricePlatinum: Number(data.pricePlatinum) || 0,
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
        ammunitionType: '', weaponCategory: '',
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
                    <Input type="number" min="0" step="0.1" value={newItem.itemWeight || ''} onChange={(e) => setNewItem({...newItem, itemWeight: e.target.value === '' ? '' : parseFloat(e.target.value)})} className="bg-stone-800 border-stone-700" />
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
                      <Input type="number" min="0" value={newItem.pricePlatinum || ''} onChange={(e) => setNewItem({...newItem, pricePlatinum: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                    </div>
                    <div>
                      <Label>Gold</Label>
                      <Input type="number" min="0" value={newItem.priceGold || ''} onChange={(e) => setNewItem({...newItem, priceGold: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                    </div>
                    <div>
                      <Label>Silver</Label>
                      <Input type="number" min="0" value={newItem.priceSilver || ''} onChange={(e) => setNewItem({...newItem, priceSilver: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
                    </div>
                    <div>
                      <Label>Copper</Label>
                      <Input type="number" min="0" value={newItem.priceCopper || ''} onChange={(e) => setNewItem({...newItem, priceCopper: e.target.value === '' ? '' : parseInt(e.target.value)})} className="bg-stone-800 border-stone-700" />
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
      // Convert empty/NaN values to 0 before saving
      const cleanedData = {
        ...editData,
        mod: Number(editData.mod) || 0,
        range: Number(editData.range) || 0,
        itemWeight: Number(editData.itemWeight) || 0,
        priceCopper: Number(editData.priceCopper) || 0,
        priceSilver: Number(editData.priceSilver) || 0,
        priceGold: Number(editData.priceGold) || 0,
        pricePlatinum: Number(editData.pricePlatinum) || 0,
        quantity: Number(editData.quantity) || 1,
        carryCapacity: Number(editData.carryCapacity) || 0,
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
                        value={currentData.mod || ''} 
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
                        value={currentData.range || ''} 
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
                        value={currentData.armorBonus || ''} 
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
                        value={currentData.damageReduction || ''} 
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
                      step="0.1"
                      min="0"
                      value={currentData.itemWeight || ''} 
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
                    {(currentData.itemWeight * (currentData.totalQuantity || currentData.quantity)).toFixed(1)} lbs
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
                      value={currentData.price || ''} 
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