import React, { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { CharacterCreation, BattleMap, HUD, GMTools } from "@/components/game/GameComponents";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import warriorToken from "@assets/generated_images/top_down_warrior_token.png";
import goblinToken from "@assets/generated_images/top_down_goblin_token.png";

// --- Mock State ---
// In a real app, this would be in a Context or Store (Zustand/Redux)
const INITIAL_TOKENS = [
  { id: 'p1', x: 100, y: 100, type: 'player' as const, image: warriorToken },
  { id: 'e1', x: 300, y: 200, type: 'enemy' as const, image: goblinToken },
  { id: 'e2', x: 350, y: 250, type: 'enemy' as const, image: goblinToken },
];

export default function Campaign() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const role = (params.get("role") as "gm" | "player") || "player";
  const isNew = params.get("new") === "true";

  const [character, setCharacter] = useState<any>(null);
  const [tokens, setTokens] = useState(INITIAL_TOKENS);
  const [inspectedChar, setInspectedChar] = useState<any>(null); // For GM

  // Mock Character Registry
  const CHARACTERS_DB: Record<string, any> = {
    'p1': { name: 'Valerius', class: 'warrior', hp: 80, maxHp: 100, energy: 30, maxEnergy: 50, inventory: ['Rusty Sword', 'Health Potion'] },
  };

  // If GM, no character creation needed
  useEffect(() => {
    if (role === 'gm') {
      setCharacter({ name: 'GM', class: 'admin' }); // Dummy character for logic
    }
  }, [role]);

  const handleCharacterCreated = (char: any) => {
    setCharacter(char);
    const newId = `p-${Date.now()}`;
    // Add new player token to map
    setTokens(prev => [...prev, { 
      id: newId, 
      x: 150, 
      y: 150, 
      type: 'player', 
      image: warriorToken 
    }]);
    // Register in DB (mock)
    CHARACTERS_DB[newId] = char;
  };

  const handleMoveToken = (id: string, x: number, y: number) => {
    setTokens(prev => prev.map(t => t.id === id ? { ...t, x, y } : t));
  };

  const handleTokenClick = (token: any) => {
    if (role === 'gm' && token.type === 'player') {
      // Look up character data
      const charData = CHARACTERS_DB[token.id];
      if (charData) {
        setInspectedChar(charData);
      }
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white select-none">
      
      {/* Back Button (Temporary for Nav) */}
      <div className="absolute top-4 left-4 z-50">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-white/50 hover:text-white hover:bg-white/10">
          <ArrowLeft />
        </Button>
      </div>

      {/* Invite Code Overlay (If New) - Removed, now in Sidebar */}
      {/* 
      {isNew && role === 'gm' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-amber-900/80 text-amber-100 px-4 py-1 rounded-full border border-amber-500/50 text-sm font-mono animate-pulse">
          Invite Code: ARCANA-7729
        </div>
      )} 
      */}

      {/* Character Creation Modal */}
      {!character && role === 'player' && (
        <CharacterCreation onComplete={handleCharacterCreated} />
      )}

      {/* Game View - Only visible after char creation or if GM */}
      {character && (
        <div className="relative h-full w-full">
          
          {/* Main Game Area (Map) */}
          <div className="absolute inset-0 z-0 p-0 md:p-4 md:pb-24">
             <div className="w-full h-full relative">
                <BattleMap 
                  tokens={tokens} 
                  onMoveToken={handleMoveToken} 
                  onTokenClick={handleTokenClick}
                  role={role} 
                />
             </div>
          </div>

          {/* UI Overlays */}
          {role === 'player' && <HUD character={character} />}
          
          {role === 'gm' && (
            <>
              <GMTools 
                inviteCode={isNew ? "ARCANA-7729" : undefined} 
                inspectedChar={inspectedChar}
              />
              {/* GM Inspector HUD */}
              {inspectedChar && (
                <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
                  <div className="absolute bottom-full mb-2 left-4 bg-black/80 text-amber-400 px-2 py-1 rounded text-xs border border-amber-900/50">
                    Inspecting: {inspectedChar.name}
                  </div>
                  <HUD character={inspectedChar} />
                  {/* Close Inspector Button */}
                  <div className="absolute bottom-24 left-4 pointer-events-auto">
                     <Button size="sm" variant="destructive" onClick={() => setInspectedChar(null)}>
                       Stop Inspecting
                     </Button>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      )}
    </div>
  );
}
