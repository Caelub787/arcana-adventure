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
import { 
  Sword, Shield, Scroll, Map as MapIcon, Settings, 
  Users, Plus, LogOut, Menu, ChevronRight, ChevronLeft,
  Heart, Zap, Backpack, Sparkles, Dice5, MessageSquare, RefreshCw
} from "lucide-react";
import { useForm } from "react-hook-form";
import { type Scene } from "@/lib/api";
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

// 1. Character Creation Modal
interface CharacterCreationProps {
  onComplete: (char: Character) => void;
}

export function CharacterCreation({ onComplete }: CharacterCreationProps) {
  const [name, setName] = useState("");
  const [charClass, setCharClass] = useState("warrior");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      name,
      class: charClass,
      hp: 100,
      maxHp: 100,
      energy: 50,
      maxEnergy: 50,
      inventory: ["Rusty Sword", "Health Potion"]
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
            <h2 className="font-display text-3xl font-bold text-stone-900">Create Legend</h2>
            <p className="text-stone-600 font-medieval">Forge your destiny, adventurer.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="charName" className="text-stone-800 font-bold">Character Name</Label>
              <Input 
                id="charName" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="border-stone-400 bg-white/50 text-stone-900 placeholder:text-stone-400 focus:border-stone-600 focus:ring-stone-600"
                placeholder="E.g. Valerius the Brave"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-stone-800 font-bold">Class</Label>
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
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-stone-900 text-stone-100 hover:bg-stone-800 font-display text-lg"
            >
              Begin Adventure
            </Button>
          </form>
        </div>
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
      const newZoom = Math.max(0.5, Math.min(3, currentZoom + delta));
      
      if (newZoom !== currentZoom) {
        // Calculate the world position under the cursor
        const worldX = (mouseX - currentPan.x) / currentZoom;
        const worldY = (mouseY - currentPan.y) / currentZoom;
        
        // Adjust pan to keep the world position under the cursor
        const newPan = {
          x: mouseX - worldX * newZoom,
          y: mouseY - worldY * newZoom
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
          const newZoom = Math.max(0.5, Math.min(3, currentZoom + delta));
          
          if (newZoom !== currentZoom) {
            // Use the current touch center for consistent zoom point
            const worldX = (centerX - currentPan.x) / currentZoom;
            const worldY = (centerY - currentPan.y) / currentZoom;
            
            // Adjust pan to keep the world position under the pinch center
            const newPan = {
              x: centerX - worldX * newZoom,
              y: centerY - worldY * newZoom
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

      {/* Draggable World Container - This pans the whole map */}
      <motion.div 
        className="absolute w-[2000px] h-[2000px] cursor-grab active:cursor-grabbing"
        drag={!isPinching}
        dragConstraints={containerRef}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={() => {
          // Sync motion values back to state after drag
          setPan({ x: motionX.get(), y: motionY.get() });
        }}
        style={{ x: motionX, y: motionY, top: 0, left: 0, transformOrigin: "0 0" }}
        animate={{ scale: zoom }}
      >
        {/* Map Background */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-80 transition-all duration-500"
          style={{ backgroundImage: `url(${scene?.backgroundImage || backgroundImage || battleMapImage1})` }}
        />
        
        {/* Conditional Grid Overlay */}
        {(scene?.gridEnabled !== undefined ? scene.gridEnabled : true) && (
          <>
            {(scene?.gridType || 'square') === 'square' ? (
              /* Square Grid */
              <div className="absolute inset-0 opacity-20 pointer-events-none" 
                   style={{ 
                     backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                     backgroundSize: `${scene?.gridSize || gridSize}px ${scene?.gridSize || gridSize}px`
                   }} 
              />
            ) : (
              /* Hex Grid */
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

        {/* Tokens */}
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
            animate={{ x: token.x, y: token.y, width: gridSize, height: gridSize }}
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
}

export function CampaignMenu({ role, inviteCode, inspectedChar, onInspectChar, gridSize, setGridSize, onAddToken, onChangeMap, characters, members, onAddCharacter }: CampaignMenuProps) {
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
          <Button variant="outline" size="icon" className="bg-stone-900/80 border-stone-500/50 text-stone-100 hover:bg-stone-800 fixed top-4 right-4 z-50">
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
                        className="p-3 bg-stone-900 rounded border border-stone-800 flex justify-between items-center"
                        data-testid={`character-item-${char.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-stone-800 rounded flex items-center justify-center border border-stone-700">
                            <Sword className="h-5 w-5 text-stone-500" />
                          </div>
                          <div>
                            <div className="font-bold text-stone-200">{char.name}</div>
                            <div className="text-xs text-stone-500">
                              Lvl {char.level} {char.class}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-stone-400">
                          HP: {char.hp}/{char.maxHp}
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

// 5. GM Tools (Deprecated wrapper)
interface GMToolsProps {
  inviteCode?: string;
  inspectedChar?: Character;
}
export function GMTools({ inviteCode, inspectedChar }: GMToolsProps) {
  return null; 
}