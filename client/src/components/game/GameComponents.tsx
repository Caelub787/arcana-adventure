import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  Sword, Shield, Scroll, Map as MapIcon, Settings, 
  Users, Plus, LogOut, Menu, ChevronRight, ChevronLeft,
  Heart, Zap, Backpack, Sparkles
} from "lucide-react";
import bgImage from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import parchmentTexture from "@assets/generated_images/aged_parchment_paper_texture.png";
import battleMapImage from "@assets/generated_images/top_down_dungeon_battlemap.png";
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

// 2. Battle Map
interface BattleMapProps {
  tokens: Token[];
  onMoveToken: (id: string, x: number, y: number) => void;
  onTokenClick?: (token: Token) => void;
  role: Role;
}

export function BattleMap({ tokens, onMoveToken, onTokenClick, role }: BattleMapProps) {
  // Grid size
  const GRID_SIZE = 50;

  const handleDragEnd = (e: any, info: any, token: Token) => {
    // Snap to grid
    const x = Math.round(info.point.x / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(info.point.y / GRID_SIZE) * GRID_SIZE;
    
    // We need relative position, not absolute screen position.
    // Framer motion's drag behavior with absolute positioning can be tricky.
    // For this prototype, let's trust the visual snap logic on the parent update
    // But framer's 'onDragEnd' gives us viewport coordinates usually unless configured.
    // A simpler way for prototype:
    // Just use the offset from the drag. 
    
    // Actually, let's use a simple snap calculation based on the final position
    // We'll assume the parent handles the actual state update which re-renders the token
    // But we need to give the parent the new coordinates.
    
    // For this mockup, let's just pass the raw coordinates and let parent snap them?
    // Or snap here. Let's snap here visually.
    
    // Since we are using absolute positioning in parent state, we need to calculate 
    // the new position based on the drag delta or final position.
    // The easiest way with Framer Motion drag is to rely on `onDragEnd` updating state.
    // However, `info.point` is absolute. `info.offset` is relative to start.
    
    const newX = Math.round((token.x + info.offset.x) / GRID_SIZE) * GRID_SIZE;
    const newY = Math.round((token.y + info.offset.y) / GRID_SIZE) * GRID_SIZE;
    
    onMoveToken(token.id, newX, newY);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black rounded-lg border border-white/10 shadow-inner group cursor-grab active:cursor-grabbing">
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-80"
        style={{ backgroundImage: `url(${battleMapImage})` }}
      />
      
      {/* Grid Overlay */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{ 
             backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
             backgroundSize: '50px 50px'
           }} 
      />

      {/* Tokens */}
      {tokens.map((token) => (
        <motion.div
          key={token.id}
          drag={role === 'gm' || token.type === 'player'} // Only GM moves enemies, players move themselves
          dragMomentum={false}
          dragElastic={0} // No elasticity for grid feel
          onDragEnd={(e, info) => handleDragEnd(e, info, token)}
          onClick={() => onTokenClick && onTokenClick(token)}
          whileHover={{ scale: 1.1, zIndex: 10 }}
          whileDrag={{ scale: 1.2, zIndex: 20 }}
          // Use animate to force position updates from state
          animate={{ x: token.x, y: token.y }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute top-0 left-0 w-[50px] h-[50px] rounded-full shadow-xl ring-2 ring-white/20 overflow-hidden bg-black"
        >
          <img src={token.image} alt="token" className="w-full h-full object-cover pointer-events-none" />
          {/* Selection Ring */}
          <div className={`absolute inset-0 border-2 rounded-full ${token.type === 'player' ? 'border-blue-400' : 'border-red-500'}`} />
        </motion.div>
      ))}

      {role === 'gm' && (
        <div className="absolute bottom-4 right-4 bg-black/70 text-white p-2 rounded text-xs pointer-events-none">
          GM Mode: Drag any token
        </div>
      )}
    </div>
  );
}

// 3. HUD (Player)
interface HUDProps {
  character: Character;
}

export function HUD({ character }: HUDProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none flex justify-between items-end z-20">
      {/* Left: Vitals */}
      <div className="flex flex-col gap-2 w-64 pointer-events-auto">
        <div className="glass-panel p-3 rounded-lg border-l-4 border-red-600 relative overflow-hidden">
          <div className="flex justify-between text-xs uppercase tracking-wider mb-1 font-bold text-red-200">
            <span>Health</span>
            <span>{character.hp}/{character.maxHp}</span>
          </div>
          <div className="h-3 bg-black/50 rounded-full overflow-hidden">
            <motion.div 
              className="h-full health-gradient"
              initial={{ width: 0 }}
              animate={{ width: `${(character.hp / character.maxHp) * 100}%` }}
            />
          </div>
          <Heart className="absolute -right-2 -bottom-2 w-12 h-12 text-red-900/20" />
        </div>

        <div className="glass-panel p-3 rounded-lg border-l-4 border-blue-600 relative overflow-hidden">
          <div className="flex justify-between text-xs uppercase tracking-wider mb-1 font-bold text-blue-200">
            <span>Energy</span>
            <span>{character.energy}/{character.maxEnergy}</span>
          </div>
          <div className="h-3 bg-black/50 rounded-full overflow-hidden">
            <motion.div 
              className="h-full energy-gradient"
              initial={{ width: 0 }}
              animate={{ width: `${(character.energy / character.maxEnergy) * 100}%` }}
            />
          </div>
          <Zap className="absolute -right-2 -bottom-2 w-12 h-12 text-blue-900/20" />
        </div>
      </div>

      {/* Center: Action Bar (Mock) */}
      <div className="flex gap-2 pointer-events-auto mb-2">
        {[1, 2, 3, 4, 5].map((slot) => (
          <button key={slot} className="w-12 h-12 glass-panel rounded border border-white/20 hover:border-white/60 flex items-center justify-center text-white/50 hover:text-white hover:scale-105 transition-all">
            <span className="font-display font-bold">{slot}</span>
          </button>
        ))}
      </div>

      {/* Right: Menu & Inventory */}
      <div className="flex gap-2 pointer-events-auto">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" className="h-14 w-14 rounded-full bg-amber-900 border-2 border-amber-700 hover:bg-amber-800 shadow-lg">
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

// 4. GM Tools
export function GMTools() {
  return (
    <div className="absolute top-0 right-0 p-2 z-30 flex flex-col gap-2 pointer-events-auto">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="bg-purple-950/80 border-purple-500/50 text-purple-100 hover:bg-purple-900">
            <Settings className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="bg-stone-900 border-l-purple-900/50 text-stone-200">
          <div className="mb-6">
            <h2 className="font-display text-2xl text-purple-400 mb-1">Game Master</h2>
            <p className="text-xs text-stone-500">Campaign Control</p>
          </div>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-stone-400 uppercase mb-2">Encounters</h3>
              <div className="space-y-2">
                <Button variant="secondary" className="w-full justify-start bg-stone-800 text-stone-300 hover:bg-stone-700">
                  <Plus className="mr-2 h-4 w-4" /> Add Enemy Token
                </Button>
                <Button variant="secondary" className="w-full justify-start bg-stone-800 text-stone-300 hover:bg-stone-700">
                  <MapIcon className="mr-2 h-4 w-4" /> Change Map
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-stone-400 uppercase mb-2">Players</h3>
              <div className="p-3 bg-stone-800 rounded text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span>Valerius</span>
                  <span className="text-green-400 text-xs">Online</span>
                </div>
                <div className="flex items-center justify-between text-stone-500">
                  <span>Aeliana</span>
                  <span className="text-xs">Offline</span>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
