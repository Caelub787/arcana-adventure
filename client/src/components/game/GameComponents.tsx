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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { 
  Sword, Shield, Scroll, Map as MapIcon, Settings, 
  Users, Plus, LogOut, Menu, ChevronRight, ChevronLeft, ChevronDown,
  Heart, Zap, Backpack, Sparkles, Dice5, MessageSquare, RefreshCw, X, Trash2, Package, FolderOpen, Lock
} from "lucide-react";
import { useForm } from "react-hook-form";
import { type Scene, type Hotbar, api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import parchmentTexture from "@assets/generated_images/aged_parchment_paper_texture.png";
import battleMapImage1 from "@/assets/rocky_coast_battlemap.jpg";
import warriorToken from "@assets/generated_images/top_down_warrior_token.png";
import goblinToken from "@assets/generated_images/top_down_goblin_token.png";

// --- Types & Mock Data ---

type Role = "gm" | "player";

interface Character {
  name: string;
  class: string;
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
  const [charClass, setCharClass] = useState("warrior");
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
      class: charClass,
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
                    <Label className="text-stone-800 font-bold">Class *</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {['warrior', 'mage', 'rogue'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCharClass(c)}
                          className={`rounded border p-3 sm:p-2 capitalize transition-all touch-target hover-scale focus-ring-amber ${
                            charClass === c 
                              ? 'border-stone-900 bg-stone-800 text-white shadow-md glow-amber' 
                              : 'border-stone-300 bg-white/30 text-stone-700 hover:bg-white/50'
                          }`}
                          data-testid={`button-class-${c}`}
                          aria-label={`Select ${c} class`}
                        >
                          {c}
                        </button>
                      ))}
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
                        value={energy} 
                        onChange={(e) => setEnergy(parseInt(e.target.value) || 0)} 
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
                        value={maxEnergy} 
                        onChange={(e) => setMaxEnergy(parseInt(e.target.value) || 0)} 
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
}

export function BattleMap({ tokens, onMoveToken, onTokenClick, onDeleteToken, role, gridSize, backgroundImage, scene, onViewChange, characters = [] }: BattleMapProps) {
  // Use refs for pan/zoom to avoid re-renders during interaction
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [isPinching, setIsPinching] = useState(false);
  const [, forceUpdate] = useState(0); // Only for zoom display updates
  const initializedSceneRef = useRef<string | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState<string | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  
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
   * handleDragEnd - Processes token drag completion
   * Implements grid snapping when enabled, or free placement when disabled.
   * Rounds token position to nearest grid cell for alignment.
   */
  const handleDragEnd = (e: any, info: any, token: Token) => {
    // Use scene settings if available, otherwise fall back to legacy gridSize prop
    const effectiveGridSize = scene?.gridSize || gridSize;
    const gridEnabled = scene?.gridEnabled !== undefined ? scene.gridEnabled : true;
    
    if (gridEnabled) {
      const newX = Math.round((token.x + info.offset.x) / effectiveGridSize) * effectiveGridSize;
      const newY = Math.round((token.y + info.offset.y) / effectiveGridSize) * effectiveGridSize;
      onMoveToken(token.id, newX, newY);
    } else {
      // Free placement when grid is disabled
      const newX = token.x + info.offset.x;
      const newY = token.y + info.offset.y;
      onMoveToken(token.id, newX, newY);
    }
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
        setIsPinching(true);
      } else if (e.touches.length === 1) {
        setIsPinching(false);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        setIsPinching(true);
        
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
      
      {/* Reset View Button (Top Center) */}
      <Button 
         size="sm" 
         variant="secondary" 
         className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-black/50 hover:bg-black/80 text-xs border border-white/10 backdrop-blur-sm"
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

      {/* Draggable World Container - Large scrollable space beyond image bounds */}
      <motion.div 
        className="absolute cursor-grab active:cursor-grabbing"
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
        drag={!isPinching}
        dragElastic={0}
        dragMomentum={false}
        onClick={() => setShowDeleteButton(null)}
        onDragEnd={() => {
          // Sync motion values back to refs after drag
          panRef.current = { x: motionX.get(), y: motionY.get() };
          notifyViewChange();
        }}
      >
        {/* Conditional Grid Overlay - Extends infinitely across the large space */}
        {(scene?.gridEnabled !== undefined ? scene.gridEnabled : true) && (
          <>
            {(scene?.gridType || 'square') === 'square' ? (
              /* Square Grid - Infinite repeating pattern */
              <div className="absolute inset-0 opacity-20 pointer-events-none" 
                   style={{ 
                     backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                     backgroundSize: `${scene?.gridSize || gridSize}px ${scene?.gridSize || gridSize}px`
                   }} 
              />
            ) : (
              /* Hex Grid - Infinite repeating pattern */
              <svg className="absolute inset-0 opacity-20 pointer-events-none" width="100%" height="100%">
                <defs>
                  <pattern id="hexgrid" patternUnits="userSpaceOnUse" width={scene?.gridSize || gridSize} height={(scene?.gridSize || gridSize) * 0.866}>
                    <polygon 
                      points={`${((scene?.gridSize || gridSize) / 4)},0 ${((scene?.gridSize || gridSize) * 3 / 4)},0 ${(scene?.gridSize || gridSize)},${((scene?.gridSize || gridSize) * 0.433)} ${((scene?.gridSize || gridSize) * 3 / 4)},${((scene?.gridSize || gridSize) * 0.866)} ${((scene?.gridSize || gridSize) / 4)},${((scene?.gridSize || gridSize) * 0.866)} 0,${((scene?.gridSize || gridSize) * 0.433)}`}
                      fill="none" 
                      stroke="#fff" 
                      strokeWidth="1"
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
          
          const handleTokenPointerDown = (e: React.PointerEvent) => {
            e.stopPropagation();
            if (role === 'gm') {
              holdTimerRef.current = setTimeout(() => {
                setShowDeleteButton(token.id);
              }, 500);
            }
          };
          
          const handleTokenPointerUp = () => {
            if (holdTimerRef.current) {
              clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
          };
          
          const handleTokenPointerLeave = () => {
            if (holdTimerRef.current) {
              clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
          };
          
          const handleTokenDragStart = () => {
            if (holdTimerRef.current) {
              clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
            setShowDeleteButton(null);
          };
          
          return (
            <motion.div
              key={token.id}
              drag={role === 'gm' || token.type === 'player'} 
              dragMomentum={false}
              dragElastic={0}
              onPointerDown={handleTokenPointerDown}
              onPointerUp={handleTokenPointerUp}
              onPointerLeave={handleTokenPointerLeave}
              onDragStart={handleTokenDragStart}
              onDragEnd={(e, info) => handleDragEnd(e, info, token)}
              onClick={(e) => { 
                e.stopPropagation(); 
                if (showDeleteButton !== token.id) {
                  onTokenClick && onTokenClick(token);
                }
              }}
              whileHover={{ scale: 1.1 }}
              whileDrag={{ scale: 1.15, zIndex: 20 }}
              className="absolute top-0 left-0 rounded-full shadow-xl ring-2 ring-white/20 overflow-visible bg-black token-shadow cursor-pointer"
              style={{ 
                width: scene?.gridSize || gridSize, 
                height: scene?.gridSize || gridSize,
                left: token.x + 9000,
                top: token.y + 9000
              }}
              aria-label={`${token.type} token`}
              role="button"
              tabIndex={0}
            >
              <img src={tokenImage} alt="token" className="w-full h-full object-cover pointer-events-none rounded-full" />
              <div className={`absolute inset-0 border-2 rounded-full ${token.type === 'player' ? 'border-blue-400 glow-amber' : 'border-red-500 glow-red'}`} />
              
              {/* Delete Button - Show when holding click (GM only) */}
              {showDeleteButton === token.id && role === 'gm' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteToken && onDeleteToken(token.id);
                  }}
                  className="absolute -top-3 -right-3 w-7 h-7 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center shadow-lg border-2 border-red-400 z-30"
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
              
              {/* HP Text - Show on hover */}
              {character && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap pointer-events-none">
                  {character.hp}/{character.maxHp} HP
                </div>
              )}
            </motion.div>
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
}

function BattleMapHotbarSlot({ hotbar, slotIndex, type, color, character }: BattleMapHotbarSlotProps) {
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

  const getSpellLevelColor = (level: number) => {
    if (level === 0) return 'text-gray-400';
    if (level <= 3) return 'text-blue-400';
    if (level <= 6) return 'text-purple-400';
    return 'text-amber-400';
  };

  // Determine what to display
  let content = null;
  let tooltipContent = null;

  if (hotbar?.spellId && spellData) {
    content = (
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
    content = (
      <>
        <div className="text-amber-400 font-bold truncate">
          {itemData.name.substring(0, 4)}
        </div>
        {itemData.damage && (
          <div className="text-red-400 text-[7px]">{itemData.damage}</div>
        )}
      </>
    );
    tooltipContent = (
      <>
        <p className="font-bold">{itemData.name}</p>
        {itemData.damage && <p className="text-sm">Damage: {itemData.damage}</p>}
        {itemData.durability !== undefined && <p className="text-sm">Durability: {itemData.durability}/10</p>}
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
            className={`
              w-11 h-11 md:w-16 md:h-16 rounded border flex items-center justify-center text-[9px] md:text-[12px]
              ${content 
                ? `bg-stone-800 border-${color}-600/50 hover:border-${color}-500` 
                : 'bg-stone-900/50 border-stone-700 border-dashed'
              }
            `}
            data-testid={`battlemap-hotbar-${type}-${slotIndex}`}
          >
            {content ? (
              <div className="text-center w-full px-1">{content}</div>
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

  if (hotbarsLoading || !character) return null;

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
      {/* Hotbar Switcher Buttons - Left side of screen, positioned higher */}
      <div className="absolute left-2 md:left-4 top-1/4 flex flex-col gap-2 z-30 pointer-events-auto">
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
                      w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                      transition-all duration-200 shadow-lg backdrop-blur-sm
                      ${colorClasses[color]}
                      ${isActive ? 'scale-110 ring-2 ring-white/20' : 'hover:scale-105'}
                    `}
                    data-testid={`hotbar-switch-${type}`}
                  >
                    <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="capitalize font-bold">{type} Hotbar</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>

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

      {/* Hotbar Display - Bottom RIGHT */}
      <div className="absolute bottom-2 md:bottom-4 right-2 md:right-4 pointer-events-auto z-30">
        <div className="glass-panel rounded p-1 md:p-2 border border-stone-700">
          {activeHotbarConfig && (
            <div className="flex flex-col gap-1">
              {/* Hotbar Type Label */}
              <div className={`text-[9px] md:text-sm text-center text-${activeHotbarConfig.color}-400 uppercase font-bold flex items-center justify-center gap-1`}>
                <activeHotbarConfig.icon className="h-3 w-3 md:h-4 md:w-4" />
                <span>{activeHotbarConfig.type}</span>
              </div>
              
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
      class: "warrior",
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

          <div className="space-y-2">
            <Label htmlFor="class" className="text-stone-300">Class</Label>
            <Input
              id="class"
              data-testid="input-character-class"
              {...register("class", { required: true })}
              className="bg-stone-800 border-stone-700 text-stone-200"
              placeholder="e.g., Warrior, Mage, Rogue"
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
    backgroundImage: scene?.backgroundImage ?? '',
  });

  // Reset local settings when scene changes or dialog opens
  useEffect(() => {
    if (scene) {
      setLocalSettings({
        gridEnabled: scene.gridEnabled,
        gridType: scene.gridType,
        gridSize: scene.gridSize,
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

// 5. Campaign Menu & Chat
interface CampaignMenuProps {
  role: Role;
  inviteCode?: string;
  inspectedChar?: Character;
  onInspectChar?: (char: Character | null) => void;
  gridSize: number;
  setGridSize: (size: number) => void;
  onAddCharacterToken?: (character: any) => void;
  onChangeMap?: () => void;
  characters?: any[];
  members?: any[];
  onAddCharacter?: (characterData: any) => void;
  onViewCharacter?: (char: any) => void;
}

export function CampaignMenu({ role, inviteCode, inspectedChar, onInspectChar, gridSize, setGridSize, onAddCharacterToken, onChangeMap, characters, members, onAddCharacter, onViewCharacter }: CampaignMenuProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [addTokenDialogOpen, setAddTokenDialogOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: "System", text: "Welcome to Arcana Adventure!", type: "system" },
    { sender: "GM", text: "Roll for initiative!", type: "chat" }
  ]);
  const [chatInput, setChatInput] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if(!chatInput.trim()) return;
    setMessages([...messages, { sender: "You", text: chatInput, type: "chat" }]);
    setChatInput("");
  };

  const handleRoll = () => {
    const roll = Math.floor(Math.random() * 20) + 1;
    setMessages([...messages, { sender: "System", text: `Rolled a d20: ${roll}`, type: "system" }]);
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
                <div key={i} className={`text-sm ${msg.type === 'system' ? 'text-amber-400 italic' : 'text-stone-300'}`}>
                  <span className="font-bold text-stone-500 mr-2">{msg.sender}:</span>
                  {msg.text}
                </div>
              ))}
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

          <div className="flex gap-2 mb-6">
             <Button className="flex-1 bg-stone-800 hover:bg-stone-700" onClick={() => setChatOpen(true)}>
               <MessageSquare className="mr-2 h-4 w-4" /> Open Chat
             </Button>
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
              
              {/* Grid Settings */}
              <div className="mb-4 p-3 bg-stone-900 border border-stone-800 rounded">
                 <div className="flex justify-between mb-2">
                   <Label className="text-xs font-bold text-stone-400">Grid Size (1 Sq = 5ft)</Label>
                   <span className="text-xs text-amber-500">{gridSize}px</span>
                 </div>
                 <input 
                   type="range" 
                   min="30" 
                   max="100" 
                   value={gridSize} 
                   onChange={(e) => setGridSize(parseInt(e.target.value))}
                   className="w-full accent-amber-600"
                 />
              </div>
              
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
              </div>
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
    </>
  );
}

// 6a. Hotbars Tab Content Component
interface HotbarsTabContentProps {
  character: any;
  isGM: boolean;
  isOwner: boolean;
}

function HotbarsTabContent({ character, isGM, isOwner }: HotbarsTabContentProps) {
  const queryClient = useQueryClient();
  const canEdit = isOwner || isGM;
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearHotbarType, setClearHotbarType] = useState<string>('');

  const { data: hotbars = [], isLoading } = useQuery({
    queryKey: ['hotbars', character.id],
    queryFn: () => api.getHotbars(character.id),
    enabled: !!character.id
  });

  const upsertMutation = useMutation({
    mutationFn: (data: { hotbarType: string; slotNumber: number; itemId?: string; spellId?: string; skillName?: string }) =>
      api.upsertHotbar(character.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotbars', character.id] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteHotbar(id),
    onSuccess: () => {
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
      
      // Validate item type matches hotbar type
      const validTypeMapping: Record<string, string[]> = {
        weapons: ['weapon'],
        consumables: ['consumable'],
        utility: ['utility']
      };
      
      if (hotbarType in validTypeMapping && !validTypeMapping[hotbarType].includes(item.itemType)) {
        toast({
          title: "Invalid Item Type",
          description: `${item.itemType} items cannot be equipped to ${hotbarType} hotbar`,
          variant: "destructive"
        });
        return;
      }

      // Heavy weapon logic - occupy both slots 0 and 2
      if (hotbarType === 'weapons' && item.weight === 'heavy') {
        // Check if trying to drop on middle slot
        if (slotNumber === 1) {
          toast({
            title: "Invalid Slot",
            description: "Heavy weapons cannot be equipped in the ammunition slot",
            variant: "destructive"
          });
          return;
        }

        // Clear any existing weapons in slots 0 and 2
        const existingSlot0 = hotbars.find(h => h.hotbarType === 'weapons' && h.slotNumber === 0);
        const existingSlot2 = hotbars.find(h => h.hotbarType === 'weapons' && h.slotNumber === 2);
        
        if (existingSlot0) {
          await deleteMutation.mutateAsync(existingSlot0.id);
        }
        if (existingSlot2) {
          await deleteMutation.mutateAsync(existingSlot2.id);
        }

        // Equip heavy weapon to both slots
        try {
          await upsertMutation.mutateAsync({
            hotbarType: 'weapons',
            slotNumber: 0,
            itemId: item.id
          });
          await upsertMutation.mutateAsync({
            hotbarType: 'weapons',
            slotNumber: 2,
            itemId: item.id
          });
          
          toast({
            title: "Heavy Weapon Equipped",
            description: `${item.name} equipped to both hands`,
          });
        } catch (err) {
          toast({
            title: "Equip Failed",
            description: "Failed to equip heavy weapon",
            variant: "destructive"
          });
        }
        return;
      }

      // For weapons hotbar, check if heavy weapon is equipped
      if (hotbarType === 'weapons' && slotNumber !== 1) {
        const existingHeavy = hotbars.find(h => 
          h.hotbarType === 'weapons' && 
          (h.slotNumber === 0 || h.slotNumber === 2) &&
          h.itemId
        );
        
        // Check if the existing weapon is heavy by checking if it appears in both slots
        if (existingHeavy) {
          const bothSlots = hotbars.filter(h => h.itemId === existingHeavy.itemId && h.hotbarType === 'weapons');
          if (bothSlots.length === 2) {
            toast({
              title: "Heavy Weapon Equipped",
              description: "Remove the heavy weapon first before equipping another weapon",
              variant: "destructive"
            });
            return;
          }
        }
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
            {[0, 1, 2].map(slotNum => (
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
                  onDrop={(slot, data) => handleDrop('weapons', slot, data)}
                  onRemove={handleRemove}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Left/Right for weapons, Far-right for ammunition. Heavy weapons occupy both side slots.
          </p>
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
                canEdit={canEdit}
                onDrop={(slot, data) => handleDrop('magic', slot, data)}
                onRemove={handleRemove}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Drag spells from your spell list to equip them.
          </p>
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
                canEdit={canEdit}
                onDrop={(slot, data) => handleDrop('skills', slot, data)}
                onRemove={handleRemove}
              />
            ))}
          </div>
          
          {canEdit && (
            <div className="pt-4 border-t border-stone-700">
              <Label className="text-xs text-stone-400 mb-2 block">Drag skills to hotbar slots:</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {skillsList.map(skill => {
                  const skillValue = character[skill.key as keyof typeof character] || 0;
                  const modifier = skillValue >= 0 ? `+${skillValue}` : `${skillValue}`;
                  return (
                    <div
                      key={skill.key}
                      draggable
                      onDragStart={(e) => handleDragStart(e, { type: 'skill', skillName: skill.name })}
                      className="px-2 py-1 bg-stone-900 rounded border border-stone-700 cursor-move hover:border-blue-500 hover:bg-stone-800 transition-all text-xs"
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
                canEdit={canEdit}
                onDrop={(slot, data) => handleDrop('consumables', slot, data)}
                onRemove={handleRemove}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Consumable items will appear here when the inventory system is implemented (Phase 5).
          </p>
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
                canEdit={canEdit}
                onDrop={(slot, data) => handleDrop('utility', slot, data)}
                onRemove={handleRemove}
              />
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Utility items will appear here when the inventory system is implemented (Phase 5).
          </p>
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
}

function HotbarSlot({ type, slotNumber, hotbar, character, canEdit, onDrop, onRemove }: HotbarSlotProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  // Fetch item data if itemId exists
  const { data: itemData } = useQuery({
    queryKey: ['item', hotbar?.itemId],
    queryFn: () => api.getItems(character.id).then(items => items.find((i: any) => i.id === hotbar?.itemId)),
    enabled: !!hotbar?.itemId
  });

  // Fetch spell data if spellId exists
  const { data: spellData } = useQuery({
    queryKey: ['spell', hotbar?.spellId],
    queryFn: () => api.getSpells(character.id).then(spells => spells.find((s: any) => s.id === hotbar?.spellId)),
    enabled: !!hotbar?.spellId
  });

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;
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
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs font-bold text-center w-full">
                <div className="text-purple-400 truncate text-[10px]">{spellData.name}</div>
                <div className={`text-[9px] ${getLevelColor(spellData.level)}`}>
                  {spellData.level === 0 ? 'Cantrip' : `Lvl ${spellData.level}`}
                </div>
                {spellData.damage && (
                  <div className="text-red-400 text-[8px]">{spellData.damage}</div>
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
              <div className="text-xs font-bold text-center w-full">
                <div className="text-amber-400 truncate text-[10px]">{itemData.name}</div>
                {itemData.damage && (
                  <div className="text-stone-400 text-[9px]">{itemData.damage}</div>
                )}
                {/* Durability bar */}
                <div className="w-full h-1 bg-stone-700 rounded-full overflow-hidden mt-1">
                  <div 
                    className={`h-full ${durabilityColor} transition-all`} 
                    style={{ width: `${durabilityWidth}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-bold">{itemData.name}</p>
              {itemData.damage && <p className="text-sm">Damage: {itemData.damage}</p>}
              {itemData.damageType && <p className="text-sm">Type: {itemData.damageType}</p>}
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
              <div className="text-xs font-bold text-center">
                <div className="text-amber-400 truncate">{hotbar.skillName}</div>
                <div className="text-stone-400 text-[10px]">{modifier}</div>
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
          ${canEdit && !hotbar ? 'cursor-pointer' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={`hotbar-slot-${type}-${slotNumber}`}
        aria-label={`${type} slot ${slotNumber}`}
        role={canEdit ? "button" : "presentation"}
        tabIndex={canEdit ? 0 : -1}
      >
        {hotbar ? (
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
        ) : (
          <span className="text-stone-600 text-xs font-medium">{slotNumber}</span>
        )}
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

// GM Only Badge Component
const GMOnlyBadge = () => (
  <Badge variant="destructive" className="text-xs ml-2">
    GM Only
  </Badge>
);

// 6. Character Sheet Component
interface CharacterSheetProps {
  character: any;
  isGM: boolean;
  isOwner: boolean;
  onUpdate?: (updates: any) => void;
  onClose?: () => void;
  defaultTab?: string;
}

export function CharacterSheet({ character, isGM, isOwner, onUpdate, onClose, defaultTab = "overview" }: CharacterSheetProps) {
  const [biography, setBiography] = useState(character?.biography || "");
  const [gmNotes, setGmNotes] = useState(character?.gmNotes || "");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isEditingGmNotes, setIsEditingGmNotes] = useState(false);

  // Edit mode states
  const [editingOverview, setEditingOverview] = useState(false);
  const [editingAttributes, setEditingAttributes] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  
  // Edit data states
  const [overviewData, setOverviewData] = useState({
    name: character?.name || "",
    class: character?.class || "",
    level: character?.level || 1,
    hp: character?.hp || 0,
    maxHp: character?.maxHp || 0,
    energy: character?.energy || 0,
    maxEnergy: character?.maxEnergy || 0
  });
  
  const [attributesData, setAttributesData] = useState({
    agility: character?.agility || 10,
    charisma: character?.charisma || 10,
    strength: character?.strength || 10,
    wisdom: character?.wisdom || 10,
    arcana: character?.arcana || 10,
    concentration: character?.concentration || 10
  });
  
  const [skillsData, setSkillsData] = useState({
    skillAgility: character?.skillAgility || 0,
    skillArcana: character?.skillArcana || 0,
    skillCharisma: character?.skillCharisma || 0,
    skillConcentration: character?.skillConcentration || 0,
    skillDeception: character?.skillDeception || 0,
    skillHistory: character?.skillHistory || 0,
    skillIntimidation: character?.skillIntimidation || 0,
    skillInvestigation: character?.skillInvestigation || 0,
    skillMedicine: character?.skillMedicine || 0,
    skillPerception: character?.skillPerception || 0,
    skillSleightOfHand: character?.skillSleightOfHand || 0,
    skillStealth: character?.skillStealth || 0,
    skillStrength: character?.skillStrength || 0,
    skillWisdom: character?.skillWisdom || 0,
    skillCulture: character?.skillCulture || 0
  });

  // Inventory state
  const queryClient = useQueryClient();
  const [itemSearch, setItemSearch] = useState("");
  const [itemSort, setItemSort] = useState("name-asc");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [showAddItem, setShowAddItem] = useState(false);
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
  
  const canEdit = isOwner || isGM;

  // Fetch items
  const { data: items = [] } = useQuery({
    queryKey: ['items', character.id],
    queryFn: () => api.getItems(character.id),
    enabled: !!character.id
  });

  // Item mutations
  const createItemMutation = useMutation({
    mutationFn: (itemData: any) => api.createItem(character.id, itemData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      setShowAddItem(false);
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items', character.id] });
      setShowItemDetail(false);
      setSelectedItem(null);
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onSuccess: () => {
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

  // Character update mutation
  const updateCharacterMutation = useMutation({
    mutationFn: (data: any) => api.updateCharacter(character.id, data),
    onSuccess: () => {
      if (onUpdate) {
        // Notify parent component
        queryClient.invalidateQueries({ queryKey: ['characters'] });
      }
      toast({ title: "Character updated successfully" });
    },
    onError: (error: any) => {
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
  const totalWeight = items.reduce((sum: number, item: any) => sum + (item.itemWeight * item.quantity), 0);
  const strengthMod = getAttributeModifier(character.strength);
  const carryCapacity = 150 + (strengthMod * 10);
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

  // Container hierarchy builder
  const buildContainerHierarchy = (stackedItems: any[]) => {
    const rootItems: any[] = [];
    const containerMap = new Map<string, any[]>();

    // First pass: separate root items and build container map
    stackedItems.forEach((item: any) => {
      if (item.containerId === null || item.containerId === undefined) {
        rootItems.push(item);
      } else {
        if (!containerMap.has(item.containerId)) {
          containerMap.set(item.containerId, []);
        }
        containerMap.get(item.containerId)!.push(item);
      }
    });

    // Attach children to containers
    rootItems.forEach((item: any) => {
      if (item.isContainer) {
        item.children = containerMap.get(item.id) || [];
      }
    });

    return rootItems;
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

  // Skill categories for organization
  const physicalSkills = [
    { key: 'skillAgility', name: 'Agility' },
    { key: 'skillStrength', name: 'Strength' },
    { key: 'skillStealth', name: 'Stealth' },
    { key: 'skillSleightOfHand', name: 'Sleight of Hand' },
  ];

  const mentalSkills = [
    { key: 'skillArcana', name: 'Arcana' },
    { key: 'skillConcentration', name: 'Concentration' },
    { key: 'skillWisdom', name: 'Wisdom' },
    { key: 'skillInvestigation', name: 'Investigation' },
    { key: 'skillPerception', name: 'Perception' },
    { key: 'skillMedicine', name: 'Medicine' },
    { key: 'skillHistory', name: 'History' },
  ];

  const socialSkills = [
    { key: 'skillCharisma', name: 'Charisma' },
    { key: 'skillDeception', name: 'Deception' },
    { key: 'skillIntimidation', name: 'Intimidation' },
    { key: 'skillCulture', name: 'Culture' },
  ];

  return (
    <div className="w-full h-full bg-stone-900 text-stone-200">
      <Tabs defaultValue={defaultTab} className="w-full h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-7 bg-stone-800 shrink-0">
          <TabsTrigger value="overview" data-testid="tab-overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="attributes" data-testid="tab-attributes" className="text-xs sm:text-sm">Attributes</TabsTrigger>
          <TabsTrigger value="skills" data-testid="tab-skills" className="text-xs sm:text-sm">Skills</TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory" className="text-xs sm:text-sm">Inventory</TabsTrigger>
          <TabsTrigger value="magic" data-testid="tab-magic" className="text-xs sm:text-sm">Magic</TabsTrigger>
          <TabsTrigger value="hotbars" data-testid="tab-hotbars" className="text-xs sm:text-sm">Hotbars</TabsTrigger>
          <TabsTrigger value="background" data-testid="tab-background" className="text-xs sm:text-sm">Background</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 p-4">
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
                    <span data-testid="text-character-name">{character.name}</span>
                  )}
                  {!editingOverview ? (
                    <>
                      <Badge variant="outline" className="text-stone-300 border-stone-600" data-testid="badge-level">
                        Level {character.level}
                      </Badge>
                      {(isOwner || isGM) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2"
                          onClick={() => {
                            setOverviewData({
                              name: character.name,
                              class: character.class,
                              level: character.level,
                              hp: character.hp,
                              maxHp: character.maxHp,
                              energy: character.energy,
                              maxEnergy: character.maxEnergy
                            });
                            setEditingOverview(true);
                          }}
                          data-testid="button-edit-overview"
                        >
                          Edit
                        </Button>
                      )}
                    </>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Portrait */}
                  {character.portrait && (
                    <div className="w-32 h-32 rounded-lg overflow-hidden border-2 border-stone-700 shrink-0">
                      <img src={character.portrait} alt={character.name} className="w-full h-full object-cover" data-testid="img-portrait" />
                    </div>
                  )}
                  
                  {/* Basic Info */}
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-stone-400">Race</Label>
                        <p className="text-stone-200" data-testid="text-race">{character.race}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-stone-400">Class</Label>
                          {editingOverview && !isGM && (
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
                        {editingOverview && isGM ? (
                          <Input
                            value={overviewData.class}
                            onChange={(e) => setOverviewData({ ...overviewData, class: e.target.value })}
                            className="bg-stone-900 border-amber-700 text-stone-200"
                            data-testid="input-edit-class"
                          />
                        ) : (
                          <p className="text-stone-200 capitalize" data-testid="text-class">{character.class}</p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-stone-400">Level</Label>
                          {editingOverview && !isGM && (
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
                        {editingOverview && isGM ? (
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={overviewData.level}
                            onChange={(e) => setOverviewData({ ...overviewData, level: parseInt(e.target.value) || 1 })}
                            className="bg-stone-900 border-amber-700 text-stone-200"
                            data-testid="input-edit-level"
                          />
                        ) : (
                          <p className="text-stone-200">{character.level}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-stone-400">Size</Label>
                        <p className="text-stone-200" data-testid="text-size">{character.size}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-stone-400">Natural Armor</Label>
                        <p className="text-stone-200" data-testid="text-natural-armor">{character.naturalArmor}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-stone-400">Speed</Label>
                        <p className="text-stone-200" data-testid="text-speed">{character.speed} ft</p>
                      </div>
                      <div>
                        <Label className="text-xs text-stone-400">Fly Speed</Label>
                        <p className="text-stone-200" data-testid="text-fly-speed">{character.flySpeed} ft</p>
                      </div>
                    </div>
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
                          onChange={(e) => setOverviewData({ ...overviewData, hp: parseInt(e.target.value) || 0 })}
                          className="w-20 bg-stone-900 border-stone-700 text-stone-200"
                          data-testid="input-edit-hp"
                        />
                        <span className="text-sm">/</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="1"
                            value={overviewData.maxHp}
                            onChange={(e) => setOverviewData({ ...overviewData, maxHp: parseInt(e.target.value) || 1 })}
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
                        {character.hp} / {character.maxHp}
                      </span>
                    )}
                  </div>
                  {!editingOverview && <Progress value={hpPercentage} className="h-3" data-testid="progress-hp" />}
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
                          onChange={(e) => setOverviewData({ ...overviewData, energy: parseInt(e.target.value) || 0 })}
                          className="w-20 bg-stone-900 border-stone-700 text-stone-200"
                          data-testid="input-edit-energy"
                        />
                        <span className="text-sm">/</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            value={overviewData.maxEnergy}
                            onChange={(e) => setOverviewData({ ...overviewData, maxEnergy: parseInt(e.target.value) || 0 })}
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
                        {character.energy} / {character.maxEnergy}
                      </span>
                    )}
                  </div>
                  {!editingOverview && <Progress value={energyPercentage} className="h-3" data-testid="progress-energy" />}
                </div>

                {/* Edit Mode Buttons */}
                {editingOverview && (
                  <div className="flex gap-2 pt-4 border-t border-stone-700">
                    <Button
                      size="sm"
                      onClick={() => {
                        updateCharacterMutation.mutate(overviewData);
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
              <CardHeader>
                <CardTitle className="text-amber-500 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>Attributes</span>
                    {isGM && !editingAttributes && <GMOnlyBadge />}
                  </div>
                  {isGM && !editingAttributes && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAttributesData({
                          agility: character.agility || 10,
                          charisma: character.charisma || 10,
                          strength: character.strength || 10,
                          wisdom: character.wisdom || 10,
                          arcana: character.arcana || 10,
                          concentration: character.concentration || 10
                        });
                        setEditingAttributes(true);
                      }}
                      data-testid="button-edit-attributes"
                    >
                      Edit Attributes
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { key: 'agility', name: 'Agility' },
                    { key: 'charisma', name: 'Charisma' },
                    { key: 'strength', name: 'Strength' },
                    { key: 'wisdom', name: 'Wisdom' },
                    { key: 'arcana', name: 'Arcana' },
                    { key: 'concentration', name: 'Concentration' },
                  ].map(attr => {
                    const value = editingAttributes ? attributesData[attr.key as keyof typeof attributesData] : (character[attr.key] || 10);
                    const modifier = getAttributeModifier(value);
                    return (
                      <Card key={attr.key} className={`bg-stone-900 ${editingAttributes ? 'border-amber-700' : 'border-stone-600'}`}>
                        <CardContent className="p-4 text-center">
                          <Label className="text-xs text-stone-400">{attr.name}</Label>
                          {editingAttributes ? (
                            <>
                              <Input
                                type="number"
                                min="1"
                                max="30"
                                value={value}
                                onChange={(e) => setAttributesData({
                                  ...attributesData,
                                  [attr.key]: parseInt(e.target.value) || 1
                                })}
                                className="text-2xl font-bold text-amber-500 mt-1 mb-2 text-center bg-stone-800 border-amber-700"
                                data-testid={`input-attribute-${attr.key}`}
                              />
                              <Badge variant="secondary" className="mt-2" data-testid={`badge-modifier-${attr.key}`}>
                                {formatModifier(modifier)}
                              </Badge>
                            </>
                          ) : (
                            <>
                              <div className="text-2xl font-bold text-amber-500 mt-1" data-testid={`text-attribute-${attr.key}`}>
                                {value}
                              </div>
                              <Badge variant="secondary" className="mt-2" data-testid={`badge-modifier-${attr.key}`}>
                                {formatModifier(modifier)}
                              </Badge>
                            </>
                          )}
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
                        updateCharacterMutation.mutate(attributesData);
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
              <CardHeader>
                <CardTitle className="text-amber-500 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>Skills</span>
                    {isGM && !editingSkills && <GMOnlyBadge />}
                  </div>
                  {isGM && !editingSkills && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSkillsData({
                          skillAgility: character.skillAgility || 0,
                          skillArcana: character.skillArcana || 0,
                          skillCharisma: character.skillCharisma || 0,
                          skillConcentration: character.skillConcentration || 0,
                          skillDeception: character.skillDeception || 0,
                          skillHistory: character.skillHistory || 0,
                          skillIntimidation: character.skillIntimidation || 0,
                          skillInvestigation: character.skillInvestigation || 0,
                          skillMedicine: character.skillMedicine || 0,
                          skillPerception: character.skillPerception || 0,
                          skillSleightOfHand: character.skillSleightOfHand || 0,
                          skillStealth: character.skillStealth || 0,
                          skillStrength: character.skillStrength || 0,
                          skillWisdom: character.skillWisdom || 0,
                          skillCulture: character.skillCulture || 0
                        });
                        setEditingSkills(true);
                      }}
                      data-testid="button-edit-skills"
                    >
                      Edit Skills
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Physical Skills */}
                <div>
                  <h3 className="text-sm font-bold text-stone-400 mb-3 uppercase">Physical</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {physicalSkills.map(skill => {
                      const value = editingSkills ? skillsData[skill.key as keyof typeof skillsData] : (character[skill.key] || 0);
                      return editingSkills ? (
                        <div key={skill.key} className="flex flex-col gap-1 p-3 bg-stone-900 border border-amber-700 rounded-md">
                          <Label className="text-xs text-stone-400">{skill.name}</Label>
                          <Input
                            type="number"
                            value={value}
                            onChange={(e) => setSkillsData({
                              ...skillsData,
                              [skill.key]: parseInt(e.target.value) || 0
                            })}
                            className="bg-stone-800 border-amber-700 text-center font-bold"
                            data-testid={`input-skill-${skill.key}`}
                          />
                        </div>
                      ) : (
                        <Badge 
                          key={skill.key} 
                          variant="outline" 
                          className="justify-between p-3 bg-stone-900 border-stone-600"
                          data-testid={`badge-skill-${skill.key}`}
                        >
                          <span className="text-xs">{skill.name}</span>
                          <span className="font-bold ml-2">{formatModifier(value)}</span>
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Mental Skills */}
                <div>
                  <h3 className="text-sm font-bold text-stone-400 mb-3 uppercase">Mental</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {mentalSkills.map(skill => {
                      const value = editingSkills ? skillsData[skill.key as keyof typeof skillsData] : (character[skill.key] || 0);
                      return editingSkills ? (
                        <div key={skill.key} className="flex flex-col gap-1 p-3 bg-stone-900 border border-amber-700 rounded-md">
                          <Label className="text-xs text-stone-400">{skill.name}</Label>
                          <Input
                            type="number"
                            value={value}
                            onChange={(e) => setSkillsData({
                              ...skillsData,
                              [skill.key]: parseInt(e.target.value) || 0
                            })}
                            className="bg-stone-800 border-amber-700 text-center font-bold"
                            data-testid={`input-skill-${skill.key}`}
                          />
                        </div>
                      ) : (
                        <Badge 
                          key={skill.key} 
                          variant="outline" 
                          className="justify-between p-3 bg-stone-900 border-stone-600"
                          data-testid={`badge-skill-${skill.key}`}
                        >
                          <span className="text-xs">{skill.name}</span>
                          <span className="font-bold ml-2">{formatModifier(value)}</span>
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Social Skills */}
                <div>
                  <h3 className="text-sm font-bold text-stone-400 mb-3 uppercase">Social</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {socialSkills.map(skill => {
                      const value = editingSkills ? skillsData[skill.key as keyof typeof skillsData] : (character[skill.key] || 0);
                      return editingSkills ? (
                        <div key={skill.key} className="flex flex-col gap-1 p-3 bg-stone-900 border border-amber-700 rounded-md">
                          <Label className="text-xs text-stone-400">{skill.name}</Label>
                          <Input
                            type="number"
                            value={value}
                            onChange={(e) => setSkillsData({
                              ...skillsData,
                              [skill.key]: parseInt(e.target.value) || 0
                            })}
                            className="bg-stone-800 border-amber-700 text-center font-bold"
                            data-testid={`input-skill-${skill.key}`}
                          />
                        </div>
                      ) : (
                        <Badge 
                          key={skill.key} 
                          variant="outline" 
                          className="justify-between p-3 bg-stone-900 border-stone-600"
                          data-testid={`badge-skill-${skill.key}`}
                        >
                          <span className="text-xs">{skill.name}</span>
                          <span className="font-bold ml-2">{formatModifier(value)}</span>
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Edit Mode Buttons */}
                {editingSkills && (
                  <div className="flex gap-2 pt-4 mt-4 border-t border-stone-700">
                    <Button
                      size="sm"
                      onClick={() => {
                        updateCharacterMutation.mutate(skillsData);
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
              <CardHeader>
                <CardTitle className="text-amber-500 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Backpack className="h-5 w-5" />
                    Inventory
                  </div>
                  {(isOwner || isGM) && (
                    <Button size="sm" onClick={() => setShowAddItem(true)} data-testid="button-add-item">
                      <Plus className="h-4 w-4 mr-1" /> Add Item
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                      <SelectItem value="armor">Armor</SelectItem>
                      <SelectItem value="consumable">Consumables</SelectItem>
                      <SelectItem value="utility">Utilities</SelectItem>
                      <SelectItem value="container">Containers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Item List */}
                <ScrollArea className="h-[400px] pr-4">
                  {hierarchicalItems.length === 0 ? (
                    <div className="text-center py-12 text-stone-400">
                      <Backpack className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-bold">No items found</p>
                      <p className="text-sm mt-2">Add items to your inventory</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {hierarchicalItems.map((stack: any) => {
                        const rarityColors: Record<string, string> = {
                          common: 'text-stone-400 border-stone-600',
                          uncommon: 'text-green-400 border-green-600',
                          rare: 'text-blue-400 border-blue-600',
                          epic: 'text-purple-400 border-purple-600',
                          legendary: 'text-orange-400 border-orange-600'
                        };
                        const durabilityColor = stack.durability >= 7 ? 'bg-green-500' : stack.durability >= 4 ? 'bg-yellow-500' : 'bg-red-500';
                        const isExpanded = expandedContainers.has(stack.id);
                        const childCount = stack.children?.length || 0;
                        
                        return (
                          <div key={stack.id}>
                            {/* Main Item */}
                            <div
                              className={`p-3 bg-stone-900 rounded border ${rarityColors[stack.rarity] || rarityColors.common} hover:bg-stone-800 transition-colors`}
                              data-testid={`item-${stack.id}`}
                              draggable={canEdit && !stack.isContainer}
                              onDragStart={(e) => {
                                if (!canEdit || stack.isContainer) {
                                  e.preventDefault();
                                  return;
                                }
                                e.dataTransfer.setData('application/json', JSON.stringify({
                                  type: 'item',
                                  itemId: stack.id,
                                  itemType: stack.itemType,
                                  weight: stack.weight,
                                  item: stack
                                }));
                                e.dataTransfer.effectAllowed = 'move';
                                e.currentTarget.style.opacity = '0.5';
                              }}
                              onDragEnd={(e) => {
                                e.currentTarget.style.opacity = '1';
                              }}
                            >
                              <div className="flex items-center gap-3">
                                {/* Container Expand/Collapse Icon */}
                                {stack.isContainer && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleContainer(stack.id);
                                    }}
                                    className="shrink-0 p-1 hover:bg-stone-700 rounded"
                                    data-testid={`button-toggle-container-${stack.id}`}
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
                                  onClick={() => { setSelectedItem(stack); setShowItemDetail(true); }}
                                  onDoubleClick={() => { setSelectedItem(stack); setShowItemDetail(true); }}
                                >
                                  <div className="w-12 h-12 bg-black/50 rounded flex items-center justify-center shrink-0 border border-stone-700">
                                    {stack.isContainer ? (
                                      isExpanded ? <FolderOpen className="w-6 h-6 text-amber-500" /> : <Package className="w-6 h-6 text-amber-500" />
                                    ) : stack.image ? (
                                      <img src={stack.image} alt={stack.name} className="w-full h-full object-cover rounded" />
                                    ) : (
                                      <span className="text-xl font-bold text-stone-500">{stack.name[0]}</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-stone-100">{stack.name}</span>
                                      <Badge variant="outline" className="text-[10px] px-1 py-0">{stack.itemType}</Badge>
                                      <Badge variant="outline" className={`text-[10px] px-1 py-0 ${rarityColors[stack.rarity]}`}>{stack.rarity}</Badge>
                                      {stack.totalQuantity > 1 && (
                                        <Badge className="bg-amber-600 text-xs">x{stack.totalQuantity}</Badge>
                                      )}
                                      {stack.isContainer && (
                                        <Badge className="bg-purple-600 text-xs">{childCount} / {stack.carryCapacity || 0}</Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-stone-400">
                                      <span>{stack.itemWeight}lbs</span>
                                      <div className="flex items-center gap-1">
                                        <span>Dur:</span>
                                        <div className="w-16 h-2 bg-stone-700 rounded overflow-hidden">
                                          <div className={`h-full ${durabilityColor}`} style={{ width: `${(stack.durability / 10) * 100}%` }} />
                                        </div>
                                        <span className="text-[10px]">{stack.durability}/10</span>
                                      </div>
                                      {(stack.priceGold > 0 || stack.priceSilver > 0 || stack.priceCopper > 0 || stack.pricePlatinum > 0) && (
                                        <span className="flex gap-1">
                                          {stack.pricePlatinum > 0 && <span className="text-purple-400">{stack.pricePlatinum}p</span>}
                                          {stack.priceGold > 0 && <span className="text-yellow-500">{stack.priceGold}g</span>}
                                          {stack.priceSilver > 0 && <span className="text-gray-400">{stack.priceSilver}s</span>}
                                          {stack.priceCopper > 0 && <span className="text-orange-600">{stack.priceCopper}c</span>}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Nested Items */}
                            {stack.isContainer && isExpanded && stack.children && stack.children.length > 0 && (
                              <div className="ml-8 mt-2 space-y-2 border-l-2 border-stone-700 pl-4">
                                {stack.children.map((child: any) => {
                                  const childDurabilityColor = child.durability >= 7 ? 'bg-green-500' : child.durability >= 4 ? 'bg-yellow-500' : 'bg-red-500';
                                  return (
                                    <div
                                      key={child.id}
                                      className={`p-2 bg-stone-900/50 rounded border ${rarityColors[child.rarity] || rarityColors.common} hover:bg-stone-800 cursor-pointer transition-colors`}
                                      onClick={() => { setSelectedItem(child); setShowItemDetail(true); }}
                                      data-testid={`item-${child.id}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-black/50 rounded flex items-center justify-center shrink-0 border border-stone-700">
                                          {child.image ? (
                                            <img src={child.image} alt={child.name} className="w-full h-full object-cover rounded" />
                                          ) : (
                                            <span className="text-sm font-bold text-stone-500">{child.name[0]}</span>
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1 flex-wrap">
                                            <span className="text-sm font-bold text-stone-100">{child.name}</span>
                                            {child.totalQuantity > 1 && (
                                              <Badge className="bg-amber-600 text-[10px]">x{child.totalQuantity}</Badge>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 mt-1 text-[10px] text-stone-400">
                                            <span>{child.itemWeight}lbs</span>
                                            <div className="flex items-center gap-1">
                                              <div className="w-12 h-1.5 bg-stone-700 rounded overflow-hidden">
                                                <div className={`h-full ${childDurabilityColor}`} style={{ width: `${(child.durability / 10) * 100}%` }} />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MAGIC TAB */}
          <TabsContent value="magic" className="space-y-4 mt-0" data-testid="content-magic">
            <Card className="bg-stone-800 border-stone-700">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-purple-400 flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Spells & Magic
                  </CardTitle>
                  {canEdit && (
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
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
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
                <ScrollArea className="h-[400px]">
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
                </ScrollArea>
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
                    school: formData.get('school') || undefined,
                    damage: formData.get('damage') || undefined,
                    damageType: formData.get('damageType') || undefined,
                    range: formData.get('range') ? parseInt(formData.get('range') as string) : undefined,
                    aoe: formData.get('aoe') || undefined,
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
                      <Select name="school" defaultValue={editSpellData?.school || ""} disabled={!isGM}>
                        <SelectTrigger className={`bg-stone-800 ${isGM ? 'border-amber-700' : 'border-stone-700'}`}>
                          <SelectValue placeholder="Select school" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
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
                              onClick={() => {
                                if (confirm(`Delete ${selectedSpell.name}?`)) {
                                  deleteSpellMutation.mutate(selectedSpell.id);
                                }
                              }}
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
          </TabsContent>

          {/* HOTBARS TAB */}
          <TabsContent value="hotbars" className="space-y-4 mt-0" data-testid="content-hotbars">
            <HotbarsTabContent character={character} isGM={isGM} isOwner={isOwner} />
          </TabsContent>

          {/* BACKGROUND TAB */}
          <TabsContent value="background" className="space-y-4 mt-0" data-testid="content-background">
            <Card className="bg-stone-800 border-stone-700">
              <CardHeader>
                <CardTitle className="text-amber-500">Character Background</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
        </ScrollArea>
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
      />
    </div>
  );
}

// Add Item Dialog Component
function AddItemDialog({ open, onOpenChange, onSave, isGM }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (data: any) => void; isGM: boolean }) {
  const [formData, setFormData] = useState({
    name: '',
    image: '',
    description: '',
    itemType: 'utility',
    rarity: 'common',
    quantity: 1,
    damage: '',
    damageType: '',
    mod: 0,
    range: 0,
    aoe: '',
    attribute: '',
    size: '',
    weight: 'light',
    itemWeight: 0,
    priceCopper: 0,
    priceSilver: 0,
    priceGold: 0,
    pricePlatinum: 0,
    durability: 10,
    isContainer: false,
    carryCapacity: 0,
  });

  const handleSubmit = () => {
    if (!formData.name) return;
    onSave(formData);
    setFormData({
      name: '',
      image: '',
      description: '',
      itemType: 'utility',
      rarity: 'common',
      quantity: 1,
      damage: '',
      damageType: '',
      mod: 0,
      range: 0,
      aoe: '',
      attribute: '',
      size: '',
      weight: 'light',
      itemWeight: 0,
      priceCopper: 0,
      priceSilver: 0,
      priceGold: 0,
      pricePlatinum: 0,
      durability: 10,
      isContainer: false,
      carryCapacity: 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-amber-500">Add New Item</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[600px] pr-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-stone-800 border-stone-700" />
              </div>
              <div>
                <Label>Image URL</Label>
                <Input value={formData.image} onChange={(e) => setFormData({...formData, image: e.target.value})} className="bg-stone-800 border-stone-700" />
              </div>
              <div>
                <Label>Item Type</Label>
                <Select value={formData.itemType} onValueChange={(v) => setFormData({...formData, itemType: v})}>
                  <SelectTrigger className="bg-stone-800 border-stone-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weapon">Weapon</SelectItem>
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
                <Input type="number" min="0" step="0.1" value={formData.itemWeight} onChange={(e) => setFormData({...formData, itemWeight: parseFloat(e.target.value) || 0})} className="bg-stone-800 border-stone-700" />
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
                  <Input type="number" value={formData.mod} onChange={(e) => setFormData({...formData, mod: parseInt(e.target.value) || 0})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Range (feet)</Label>
                  <Input type="number" min="0" value={formData.range} onChange={(e) => setFormData({...formData, range: parseInt(e.target.value) || 0})} className="bg-stone-800 border-stone-700" />
                </div>
              </div>
            </div>
            <div className="border-t border-stone-700 pt-4">
              <h3 className="text-sm font-bold text-stone-300 mb-3">Price</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Platinum</Label>
                  <Input type="number" min="0" value={formData.pricePlatinum} onChange={(e) => setFormData({...formData, pricePlatinum: parseInt(e.target.value) || 0})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Gold</Label>
                  <Input type="number" min="0" value={formData.priceGold} onChange={(e) => setFormData({...formData, priceGold: parseInt(e.target.value) || 0})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Silver</Label>
                  <Input type="number" min="0" value={formData.priceSilver} onChange={(e) => setFormData({...formData, priceSilver: parseInt(e.target.value) || 0})} className="bg-stone-800 border-stone-700" />
                </div>
                <div>
                  <Label>Copper</Label>
                  <Input type="number" min="0" value={formData.priceCopper} onChange={(e) => setFormData({...formData, priceCopper: parseInt(e.target.value) || 0})} className="bg-stone-800 border-stone-700" />
                </div>
              </div>
            </div>
            <div className="border-t border-stone-700 pt-4">
              <Label>Durability: {formData.durability}/10</Label>
              <Slider value={[formData.durability]} onValueChange={(v) => setFormData({...formData, durability: v[0]})} min={0} max={10} step={1} className="mt-2" />
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleSubmit} disabled={!formData.name}>Add Item</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
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
      setEditData({ ...item });
    }
    setIsEditing(!isEditing);
  };

  const handleSave = () => {
    if (editData) {
      onUpdate(editData);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditData(null);
    setIsEditing(false);
  };

  const handleEquipToSlot = (hotbarType: string, slotNumber: number) => {
    if (!item) return;

    if (hotbarType === 'weapons' && item.weight === 'heavy') {
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
      if (item.weight === 'heavy') {
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
          <div className="flex justify-between items-center">
            <DialogTitle className="text-amber-500">Item Details</DialogTitle>
            {canEditItem && !isEditing && (
              <Button size="sm" variant="outline" onClick={handleEditToggle} data-testid="button-edit-item">
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[500px] pr-4">
          <div className="space-y-4">
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
                {isEditing ? (
                  <Input 
                    type="number"
                    min="1"
                    value={currentData.quantity} 
                    onChange={(e) => setEditData({ ...editData, quantity: parseInt(e.target.value) || 1 })}
                    className="bg-stone-800 border-stone-700"
                  />
                ) : (
                  <p className="text-stone-200">{currentData.totalQuantity || currentData.quantity}</p>
                )}
              </div>
            </div>

            {(currentData.damage || currentData.damageType || currentData.mod !== undefined || isEditing) && (
              <div className="pt-4 border-t border-stone-700">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-bold text-stone-300">Combat Stats</h3>
                  {!canEditAllFields && <GMOnlyBadge />}
                </div>
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
                        value={currentData.mod !== undefined ? currentData.mod : 0} 
                        onChange={(e) => setEditData({ ...editData, mod: parseInt(e.target.value) || 0 })}
                        className="bg-stone-800 border-amber-700"
                      />
                    ) : (
                      <p className="text-stone-200">{currentData.mod >= 0 ? `+${currentData.mod}` : currentData.mod}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-stone-700">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-bold text-stone-300">Physical</h3>
                {!canEditAllFields && <GMOnlyBadge />}
              </div>
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
                      value={currentData.itemWeight} 
                      onChange={(e) => setEditData({ ...editData, itemWeight: parseFloat(e.target.value) || 0 })}
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