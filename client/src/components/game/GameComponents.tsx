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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { 
  Sword, Shield, Scroll, Map as MapIcon, Settings, 
  Users, Plus, LogOut, Menu, ChevronRight, ChevronLeft, ChevronDown,
  Heart, Zap, Backpack, Sparkles, Dice5, MessageSquare, RefreshCw, X, Trash2, Package, FolderOpen
} from "lucide-react";
import { useForm } from "react-hook-form";
import { type Scene, type Hotbar, api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import parchmentTexture from "@assets/generated_images/aged_parchment_paper_texture.png";
import battleMapImage1 from "@assets/generated_images/top_down_dungeon_battlemap.png";
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
                <TabsList className="grid w-full grid-cols-4 bg-stone-200">
                  <TabsTrigger value="basic" data-testid="tab-basic">Basic</TabsTrigger>
                  <TabsTrigger value="attributes" data-testid="tab-attributes">Attributes</TabsTrigger>
                  <TabsTrigger value="skills" data-testid="tab-skills">Skills</TabsTrigger>
                  <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
                </TabsList>

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
                    <div className="grid grid-cols-3 gap-2">
                      {['warrior', 'mage', 'rogue'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCharClass(c)}
                          className={`rounded border p-2 capitalize transition-all ${
                            charClass === c 
                              ? 'border-stone-900 bg-stone-800 text-white shadow-md' 
                              : 'border-stone-300 bg-white/30 text-stone-700 hover:bg-white/50'
                          }`}
                          data-testid={`button-class-${c}`}
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
                      <div key={attr} className="flex items-center gap-3 bg-white/50 rounded p-3 border border-stone-300">
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
                            className="h-8 w-8 p-0"
                            data-testid={`button-attribute-${attr}-decrease`}
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
                            className="h-8 w-8 p-0"
                            data-testid={`button-attribute-${attr}-increase`}
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

                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(skills).map(([skill, value]) => {
                      const displayName = skill.replace('skill', '').replace(/([A-Z])/g, ' $1').trim();
                      return (
                        <div key={skill} className="flex items-center gap-2 bg-white/50 rounded p-2 border border-stone-300">
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
                              className="h-7 w-7 p-0 text-xs"
                              data-testid={`button-skill-${skill}-decrease`}
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
                              className="h-7 w-7 p-0 text-xs"
                              data-testid={`button-skill-${skill}-increase`}
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
  role: Role;
  gridSize: number;
  backgroundImage?: string;
  scene?: Scene;
  onViewChange?: (viewState: { x: number; y: number; zoom: number }) => void;
}

export function BattleMap({ tokens, onMoveToken, onTokenClick, role, gridSize, backgroundImage, scene, onViewChange }: BattleMapProps) {
  // Pan and zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  
  // Notify parent of view changes
  useEffect(() => {
    if (onViewChange) {
      onViewChange({ x: pan.x, y: pan.y, zoom });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan.x, pan.y, zoom]);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);
  
  // Motion values for smooth dragging without re-renders
  const motionX = useMotionValue(0);
  const motionY = useMotionValue(0);
  
  // Use refs to avoid stale closures in event listeners
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  
  useEffect(() => {
    panRef.current = pan;
    zoomRef.current = zoom;
  }, [pan, zoom]);

  // Sync motion values when pan state changes (from wheel zoom, pinch zoom, or reset)
  useEffect(() => {
    motionX.set(pan.x);
    motionY.set(pan.y);
  }, [pan.x, pan.y, motionX, motionY]);

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

  // Handle wheel zoom (desktop) - zoom toward cursor position
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
      
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(0.2, Math.min(3, currentZoom + delta));
      
      if (newZoom !== currentZoom) {
        // Account for the 9000px world offset when calculating world position
        // world = ((screen + 9000 - pan) / zoom) - 9000
        const worldX = ((mouseX + 9000 - currentPan.x) / currentZoom) - 9000;
        const worldY = ((mouseY + 9000 - currentPan.y) / currentZoom) - 9000;
        
        // Adjust pan to keep the world position under the cursor
        // pan = screen + 9000 - (world + 9000) * zoom
        const newPan = {
          x: mouseX + 9000 - (worldX + 9000) * newZoom,
          y: mouseY + 9000 - (worldY + 9000) * newZoom
        };
        
        setPan(newPan);
        setZoom(newZoom);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Handle pinch zoom (mobile) - zoom toward pinch center
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
          
          if (newZoom !== currentZoom) {
            // Account for the 9000px world offset when calculating world position
            // world = ((screen + 9000 - pan) / zoom) - 9000
            const worldX = ((centerX + 9000 - currentPan.x) / currentZoom) - 9000;
            const worldY = ((centerY + 9000 - currentPan.y) / currentZoom) - 9000;
            
            // Adjust pan to keep the world position under the pinch center
            // pan = screen + 9000 - (world + 9000) * zoom
            const newPan = {
              x: centerX + 9000 - (worldX + 9000) * newZoom,
              y: centerY + 9000 - (worldY + 9000) * newZoom
            };
            
            setPan(newPan);
            setZoom(newZoom);
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
           setPan({ x: defaultX, y: defaultY }); 
           setZoom(defaultZoom); 
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
          left: '-9000px',
          top: '-9000px',
          transformOrigin: "0 0"
        }}
        drag={!isPinching}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={() => {
          // Sync motion values back to state after drag
          setPan({ x: motionX.get(), y: motionY.get() });
        }}
        animate={{ scale: zoom }}
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
        {tokens.map((token) => (
          <motion.div
            key={token.id}
            drag={role === 'gm' || token.type === 'player'} 
            dragMomentum={false}
            dragElastic={0}
            onPointerDown={(e) => e.stopPropagation()}
            onDragEnd={(e, info) => handleDragEnd(e, info, token)}
            onClick={(e) => { e.stopPropagation(); onTokenClick && onTokenClick(token); }}
            whileHover={{ scale: 1.1, zIndex: 10 }}
            whileDrag={{ scale: 1.2, zIndex: 20 }}
            animate={{ x: token.x + 9000, y: token.y + 9000, width: gridSize, height: gridSize }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute top-0 left-0 rounded-full shadow-xl ring-2 ring-white/20 overflow-hidden bg-black"
            style={{ width: gridSize, height: gridSize }}
          >
            <img src={token.image} alt="token" className="w-full h-full object-cover pointer-events-none" />
            <div className={`absolute inset-0 border-2 rounded-full ${token.type === 'player' ? 'border-blue-400' : 'border-red-500'}`} />
          </motion.div>
        ))}
      </motion.div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur px-2 py-1 rounded text-[10px] text-stone-400 pointer-events-none border border-white/10">
         {role === 'gm' ? 'GM Mode' : 'Player Mode'} • Pan: Drag • Zoom: Scroll/Pinch • 1 Sq = 5ft
      </div>
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
    <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none flex flex-col md:flex-row justify-end md:justify-between items-center md:items-end z-20 gap-4">
      {/* Left: Vitals (Stacked on mobile) */}
      <div className="flex flex-row md:flex-col gap-2 w-full md:w-64 pointer-events-auto order-2 md:order-1">
        <div className="glass-panel p-2 md:p-3 rounded-lg border-l-4 border-red-600 relative overflow-hidden flex-1">
          <div className="flex justify-between text-xs uppercase tracking-wider mb-1 font-bold text-red-200">
            <span>Health</span>
            <span>{character.hp}/{character.maxHp}</span>
          </div>
          <div className="h-2 md:h-3 bg-black/50 rounded-full overflow-hidden">
            <motion.div 
              className="h-full health-gradient"
              initial={{ width: 0 }}
              animate={{ width: `${(character.hp / character.maxHp) * 100}%` }}
            />
          </div>
        </div>

        <div className="glass-panel p-2 md:p-3 rounded-lg border-l-4 border-blue-600 relative overflow-hidden flex-1">
          <div className="flex justify-between text-xs uppercase tracking-wider mb-1 font-bold text-blue-200">
            <span>Energy</span>
            <span>{character.energy}/{character.maxEnergy}</span>
          </div>
          <div className="h-2 md:h-3 bg-black/50 rounded-full overflow-hidden">
            <motion.div 
              className="h-full energy-gradient"
              initial={{ width: 0 }}
              animate={{ width: `${(character.energy / character.maxEnergy) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Center: Action Bar (Mock) - Bottom on mobile */}
      <div className="flex gap-2 pointer-events-auto order-3 md:order-2 w-full md:w-auto justify-center overflow-x-auto pb-1">
        {[1, 2, 3, 4, 5].map((slot) => (
          <button key={slot} className="w-12 h-12 md:w-14 md:h-14 glass-panel rounded border border-white/20 hover:border-white/60 flex items-center justify-center text-white/50 hover:text-white hover:scale-105 transition-all shrink-0">
            <span className="font-display font-bold text-lg">{slot}</span>
          </button>
        ))}
      </div>

      {/* Right: Menu & Inventory - Top right floating usually, but here integrated */}
      <div className="flex gap-2 pointer-events-auto order-1 md:order-3 absolute top-[-60px] right-0 md:static">
        {/* Chat Toggle */}
        <Button 
          size="icon" 
          className="h-12 w-12 md:h-14 md:w-14 rounded-full bg-stone-800 border-2 border-stone-600 hover:bg-stone-700 shadow-lg"
          onClick={onOpenChat}
        >
           <MessageSquare className="h-6 w-6 text-stone-300" />
        </Button>

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
  onAddToken?: () => void;
  onChangeMap?: () => void;
  characters?: any[];
  members?: any[];
  onAddCharacter?: (characterData: any) => void;
  onViewCharacter?: (char: any) => void;
}

export function CampaignMenu({ role, inviteCode, inspectedChar, onInspectChar, gridSize, setGridSize, onAddToken, onChangeMap, characters, members, onAddCharacter, onViewCharacter }: CampaignMenuProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
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
                <Button variant="secondary" className="bg-stone-800 hover:bg-stone-700" onClick={onAddToken}>
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

  const handleDrop = (hotbarType: string, slotNumber: number, data: any) => {
    if (!canEdit) return;

    if (data.type === 'skill') {
      upsertMutation.mutate({
        hotbarType,
        slotNumber,
        skillName: data.skillName
      });
    }
  };

  const handleRemove = (hotbarId: string) => {
    if (!canEdit) return;
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
                  {slotNum === 0 ? 'Left' : slotNum === 1 ? 'Ammo' : 'Right'}
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
            Left/Right for weapons, Middle for ammunition. Heavy weapons occupy both side slots.
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
            Equipped spells will appear here when the magic system is implemented (Phase 7).
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

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
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
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      onDrop(slotNumber, data);
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  const getSlotContent = () => {
    if (!hotbar) return null;

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
          w-14 h-14 rounded border-2 flex items-center justify-center
          transition-all duration-200
          ${hotbar 
            ? 'bg-stone-800 border-amber-600/50 hover:border-amber-500' 
            : 'bg-stone-900 border-dashed border-stone-700 hover:border-stone-600'
          }
          ${isDragOver ? 'border-amber-500 bg-amber-900/20 scale-105' : ''}
          ${canEdit && !hotbar ? 'cursor-pointer' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={`hotbar-slot-${type}-${slotNumber}`}
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

// 6. Character Sheet Component
interface CharacterSheetProps {
  character: any;
  isGM: boolean;
  isOwner: boolean;
  onUpdate?: (updates: any) => void;
  onClose?: () => void;
}

export function CharacterSheet({ character, isGM, isOwner, onUpdate, onClose }: CharacterSheetProps) {
  const [biography, setBiography] = useState(character?.biography || "");
  const [gmNotes, setGmNotes] = useState(character?.gmNotes || "");
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isEditingGmNotes, setIsEditingGmNotes] = useState(false);

  // Inventory state
  const queryClient = useQueryClient();
  const [itemSearch, setItemSearch] = useState("");
  const [itemSort, setItemSort] = useState("name-asc");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showItemDetail, setShowItemDetail] = useState(false);
  const [expandedContainers, setExpandedContainers] = useState<Set<string>>(new Set());

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
      <Tabs defaultValue="overview" className="w-full h-full flex flex-col">
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
                  <span data-testid="text-character-name">{character.name}</span>
                  <Badge variant="outline" className="text-stone-300 border-stone-600" data-testid="badge-level">
                    Level {character.level}
                  </Badge>
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
                        <Label className="text-xs text-stone-400">Class</Label>
                        <p className="text-stone-200 capitalize" data-testid="text-class">{character.class}</p>
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
                    <span className="text-sm font-bold" data-testid="text-hp">
                      {character.hp} / {character.maxHp}
                    </span>
                  </div>
                  <Progress value={hpPercentage} className="h-3" data-testid="progress-hp" />
                </div>

                {/* Energy Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm text-stone-300 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-500" />
                      Energy
                    </Label>
                    <span className="text-sm font-bold" data-testid="text-energy">
                      {character.energy} / {character.maxEnergy}
                    </span>
                  </div>
                  <Progress value={energyPercentage} className="h-3" data-testid="progress-energy" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ATTRIBUTES TAB */}
          <TabsContent value="attributes" className="space-y-4 mt-0" data-testid="content-attributes">
            <Card className="bg-stone-800 border-stone-700">
              <CardHeader>
                <CardTitle className="text-amber-500">Attributes</CardTitle>
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
                    const value = character[attr.key] || 10;
                    const modifier = getAttributeModifier(value);
                    return (
                      <Card key={attr.key} className="bg-stone-900 border-stone-600">
                        <CardContent className="p-4 text-center">
                          <Label className="text-xs text-stone-400">{attr.name}</Label>
                          <div className="text-2xl font-bold text-amber-500 mt-1" data-testid={`text-attribute-${attr.key}`}>
                            {value}
                          </div>
                          <Badge variant="secondary" className="mt-2" data-testid={`badge-modifier-${attr.key}`}>
                            {formatModifier(modifier)}
                          </Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SKILLS TAB */}
          <TabsContent value="skills" className="space-y-4 mt-0" data-testid="content-skills">
            <Card className="bg-stone-800 border-stone-700">
              <CardHeader>
                <CardTitle className="text-amber-500">Skills</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Physical Skills */}
                <div>
                  <h3 className="text-sm font-bold text-stone-400 mb-3 uppercase">Physical</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {physicalSkills.map(skill => {
                      const value = character[skill.key] || 0;
                      return (
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
                      const value = character[skill.key] || 0;
                      return (
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
                      const value = character[skill.key] || 0;
                      return (
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
                <CardTitle className="text-amber-500 flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Magic & Spells
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-stone-400" data-testid="text-magic-placeholder">
                  <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-bold">Magic system coming in Phase 7</p>
                  <p className="text-sm mt-2">Your spells will appear here</p>
                </div>

                <div className="pt-4 border-t border-stone-700">
                  <Label className="text-xs text-stone-400">Total Spells Known</Label>
                  <p className="text-2xl font-bold text-amber-500" data-testid="text-spells-known">0</p>
                </div>
              </CardContent>
            </Card>
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
      <Dialog open={showItemDetail} onOpenChange={setShowItemDetail}>
        <DialogContent className="bg-stone-900 border-stone-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-amber-500">Item Details</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <ScrollArea className="max-h-[500px] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-stone-400">Name</Label>
                    <p className="text-stone-200 font-bold">{selectedItem.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-stone-400">Type</Label>
                    <p className="text-stone-200 capitalize">{selectedItem.itemType}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-stone-400">Rarity</Label>
                    <p className="text-stone-200 capitalize">{selectedItem.rarity}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-stone-400">Quantity</Label>
                    <p className="text-stone-200">{selectedItem.totalQuantity || selectedItem.quantity}</p>
                  </div>
                </div>
                {(selectedItem.damage || selectedItem.damageType || selectedItem.mod) && (
                  <div className="pt-4 border-t border-stone-700">
                    <h3 className="text-sm font-bold text-stone-300 mb-2">Combat Stats</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedItem.damage && (
                        <div>
                          <Label className="text-xs text-stone-400">Damage</Label>
                          <p className="text-stone-200">{selectedItem.damage}</p>
                        </div>
                      )}
                      {selectedItem.damageType && (
                        <div>
                          <Label className="text-xs text-stone-400">Damage Type</Label>
                          <p className="text-stone-200">{selectedItem.damageType}</p>
                        </div>
                      )}
                      {selectedItem.mod !== undefined && (
                        <div>
                          <Label className="text-xs text-stone-400">Modifier</Label>
                          <p className="text-stone-200">{selectedItem.mod >= 0 ? `+${selectedItem.mod}` : selectedItem.mod}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="pt-4 border-t border-stone-700">
                  <h3 className="text-sm font-bold text-stone-300 mb-2">Physical</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-stone-400">Weight (per unit)</Label>
                      <p className="text-stone-200">{selectedItem.itemWeight} lbs</p>
                    </div>
                    <div>
                      <Label className="text-xs text-stone-400">Total Weight</Label>
                      <p className="text-stone-200">{(selectedItem.itemWeight * (selectedItem.totalQuantity || selectedItem.quantity)).toFixed(1)} lbs</p>
                    </div>
                    <div>
                      <Label className="text-xs text-stone-400">Durability</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-stone-700 rounded overflow-hidden">
                          <div 
                            className={`h-full ${selectedItem.durability >= 7 ? 'bg-green-500' : selectedItem.durability >= 4 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                            style={{ width: `${(selectedItem.durability / 10) * 100}%` }} 
                          />
                        </div>
                        <span className="text-sm text-stone-200">{selectedItem.durability}/10</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Container Management */}
                {(isOwner || isGM) && !selectedItem.isContainer && (
                  <div className="pt-4 border-t border-stone-700">
                    <h3 className="text-sm font-bold text-stone-300 mb-2">Container Management</h3>
                    <div className="space-y-2">
                      {selectedItem.containerId ? (
                        <div>
                          <Label className="text-xs text-stone-400 mb-2 block">Currently in container</Label>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              updateItemMutation.mutate({ 
                                id: selectedItem.id, 
                                data: { containerId: null } 
                              });
                            }}
                            data-testid="button-remove-from-container"
                          >
                            Remove from Container
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs text-stone-400 mb-2 block">Move to Container</Label>
                          <Select 
                            onValueChange={(containerId) => {
                              updateItemMutation.mutate({ 
                                id: selectedItem.id, 
                                data: { containerId } 
                              });
                            }}
                          >
                            <SelectTrigger className="bg-stone-900 border-stone-700" data-testid="select-move-to-container">
                              <SelectValue placeholder="Select container..." />
                            </SelectTrigger>
                            <SelectContent>
                              {items.filter((item: any) => item.isContainer && item.id !== selectedItem.id).map((container: any) => (
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

                <div className="flex gap-2">
                  {(isOwner || isGM) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => deleteItemMutation.mutate(selectedItem.id)} data-testid="button-delete-item">
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                      <Button size="sm" onClick={() => { setShowItemDetail(false); }} data-testid="button-close-item-detail">
                        Close
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

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

// 5. GM Tools (Deprecated wrapper)
interface GMToolsProps {
  inviteCode?: string;
  inspectedChar?: Character;
}
export function GMTools({ inviteCode, inspectedChar }: GMToolsProps) {
  return null; 
}