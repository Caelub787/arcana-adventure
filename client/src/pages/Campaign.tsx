import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { CharacterCreation, BattleMap, HUD, CampaignMenu } from "@/components/game/GameComponents";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import battleMapImage1 from "@assets/generated_images/top_down_dungeon_battlemap.png";
import battleMapImage2 from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png"; // Use this as alt map
import warriorToken from "@assets/generated_images/top_down_warrior_token.png";
import goblinToken from "@assets/generated_images/top_down_goblin_token.png";
import { storage } from "@/lib/storage";

// --- Mock State ---
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

  const user = JSON.parse(localStorage.getItem("arcana_user") || "{}");
  const hasCreatedRef = useRef(false);

  const [character, setCharacter] = useState<any>(null);
  const [tokens, setTokens] = useState(INITIAL_TOKENS);
  const [inspectedChar, setInspectedChar] = useState<any>(null); // For GM
  const [currentMap, setCurrentMap] = useState(battleMapImage1);

  // Mock Character Registry
  const CHARACTERS_DB: Record<string, any> = {
    'p1': { name: 'Valerius', class: 'warrior', hp: 80, maxHp: 100, energy: 30, maxEnergy: 50, inventory: ['Rusty Sword', 'Health Potion'] },
  };

  const [gridSize, setGridSize] = useState(50); // Default 50px

  // Handle New Campaign Creation
  useEffect(() => {
    if (role === 'gm' && isNew && !hasCreatedRef.current && user.email) {
      const newCampaignId = `c-${Date.now()}`;
      // Generate unique code
      const uniqueCode = "ARCANA-" + Math.floor(1000 + Math.random() * 9000);
      
      const newCampaign = {
        id: newCampaignId,
        name: `Campaign ${new Date().toLocaleDateString()}`,
        players: 0,
        lastPlayed: "Just now",
        favorite: false,
        type: 'created' as const,
        inviteCode: uniqueCode,
        gridSize: 50
      };
      
      storage.addCreatedCampaign(user.email, newCampaign);
      hasCreatedRef.current = true;
    }
  }, [role, isNew, user.email]);
  
  // Retrieve the current campaign's invite code (simulated lookup)
  // In a real app, we'd fetch the campaign details by ID from URL
  // Here we'll just use the one we just created or a mock one
  const currentCampaignCode = role === 'gm' && isNew 
    ? (storage.getCampaigns(user.email).created.slice(-1)[0]?.inviteCode || "ARCANA-XXXX")
    : "ARCANA-LINK"; // Fallback/Mock for joined/existing

  // If GM, no character creation needed
  useEffect(() => {
    if (role === 'gm') {
      setCharacter({ name: 'GM', class: 'admin' }); // Dummy character for logic
    }
  }, [role]);

  const handleCharacterCreated = (char: any) => {
    setCharacter(char);
    const newId = `p-${Date.now()}`;
    setTokens(prev => [...prev, { 
      id: newId, 
      x: 150, 
      y: 150, 
      type: 'player', 
      image: warriorToken 
    }]);
    CHARACTERS_DB[newId] = char;
  };

  const handleMoveToken = (id: string, x: number, y: number) => {
    setTokens(prev => prev.map(t => t.id === id ? { ...t, x, y } : t));
  };

  const handleTokenClick = (token: any) => {
    if (role === 'gm' && token.type === 'player') {
      const charData = CHARACTERS_DB[token.id];
      if (charData) {
        setInspectedChar(charData);
      }
    }
  };

  // GM Actions
  const handleAddToken = () => {
    const newTokenId = `e-${Date.now()}`;
    const newToken = {
      id: newTokenId,
      x: 200 + Math.floor(Math.random() * 200),
      y: 200 + Math.floor(Math.random() * 200),
      type: 'enemy' as const,
      image: goblinToken // Defaulting to goblin for now
    };
    setTokens(prev => [...prev, newToken]);
  };

  const handleChangeMap = () => {
    setCurrentMap(prev => prev === battleMapImage1 ? battleMapImage2 : battleMapImage1);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white select-none flex flex-col">
      
      {/* Top Bar: Nav & Settings */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 flex justify-between items-start pointer-events-none">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto">
          <ArrowLeft />
        </Button>
        
        {/* Settings / Menu Button for ALL Roles */}
        <div className="pointer-events-auto">
          <CampaignMenu 
            role={role} 
            inviteCode={currentCampaignCode}
            inspectedChar={inspectedChar}
            onInspectChar={setInspectedChar}
            gridSize={gridSize}
            setGridSize={setGridSize}
            onAddToken={handleAddToken}
            onChangeMap={handleChangeMap}
          />
        </div>
      </div>

      {/* Character Creation Modal */}
      {!character && role === 'player' && (
        <CharacterCreation onComplete={handleCharacterCreated} />
      )}

      {/* Game View */}
      {character && (
        <div className="flex flex-col h-full w-full">
          
          {/* Map Area - Takes full space, but HUD overlays it */}
          <div className="relative flex-grow w-full bg-stone-900 z-0 overflow-hidden">
             <BattleMap 
               tokens={tokens} 
               onMoveToken={handleMoveToken} 
               onTokenClick={handleTokenClick}
               role={role} 
               gridSize={gridSize}
               backgroundImage={currentMap}
             />
          </div>
          
          {/* UI Overlays */}
          {role === 'player' && <HUD character={character} />}
          
          {/* GM Inspector HUD */}
          {role === 'gm' && inspectedChar && (
            <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
              <div className="absolute bottom-full mb-2 left-4 bg-black/80 text-amber-400 px-2 py-1 rounded text-xs border border-amber-900/50">
                Inspecting: {inspectedChar.name}
              </div>
              <HUD character={inspectedChar} />
            </div>
          )}

        </div>
      )}
    </div>
  );
}