import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { motion } from "framer-motion";
import { CharacterCreation, BattleMap, HUD, CampaignMenu } from "@/components/game/GameComponents";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import battleMapImage1 from "@assets/generated_images/top_down_dungeon_battlemap.png";
import battleMapImage2 from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import warriorToken from "@assets/generated_images/top_down_warrior_token.png";
import goblinToken from "@assets/generated_images/top_down_goblin_token.png";
import { useAuth } from "@/lib/AuthContext";
import { api, gameWs } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Campaign() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const [match, params] = useRoute("/campaign/:id");
  const queryParams = new URLSearchParams(search);
  const role = (queryParams.get("role") as "gm" | "player") || "player";
  const isNew = queryParams.get("new") === "true";
  const campaignId = params?.id;

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasCreatedRef = useRef(false);
  const wsConnectedRef = useRef(false);

  const [character, setCharacter] = useState<any>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [inspectedChar, setInspectedChar] = useState<any>(null);
  const [currentMap, setCurrentMap] = useState(battleMapImage1);
  const [gridSize, setGridSize] = useState(50);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);

  // Determine effective campaign ID (from URL or newly created)
  const effectiveCampaignId = campaignId || createdCampaignId;

  // Load campaign data from API
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}`],
    enabled: !!effectiveCampaignId && !isNew,
  });

  // Load tokens for the campaign
  const { data: tokensData, isLoading: tokensLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`],
    enabled: !!effectiveCampaignId && !isNew,
  });

  // Load characters for the campaign
  const { data: characters, isLoading: charactersLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`],
    enabled: !!effectiveCampaignId && !isNew,
  });

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: (name: string) => api.createCampaign(name, gridSize, currentMap),
    onSuccess: (newCampaign) => {
      setCreatedCampaignId(newCampaign.id);
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      setLocation(`/campaign/${newCampaign.id}?role=gm`);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create campaign", variant: "destructive" });
    },
  });

  // Create character mutation
  const createCharacterMutation = useMutation({
    mutationFn: (characterData: any) => api.createCharacter({
      ...characterData,
      campaignId: effectiveCampaignId!,
    }),
    onSuccess: (newCharacter) => {
      setCharacter(newCharacter);
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create character", variant: "destructive" });
    },
  });

  // Update token mutation
  const updateTokenMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: string; x: number; y: number }) => 
      api.updateToken(id, { x, y }),
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update token", variant: "destructive" });
    },
  });

  // Create token mutation
  const createTokenMutation = useMutation({
    mutationFn: (tokenData: any) => api.createToken({
      ...tokenData,
      campaignId: effectiveCampaignId!,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create token", variant: "destructive" });
    },
  });

  // Update campaign mutation
  const updateCampaignMutation = useMutation({
    mutationFn: (data: any) => api.updateCampaign(effectiveCampaignId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}`] });
    },
  });

  // Handle New Campaign Creation
  useEffect(() => {
    if (role === 'gm' && isNew && !hasCreatedRef.current && user) {
      const campaignName = `Campaign ${new Date().toLocaleDateString()}`;
      createCampaignMutation.mutate(campaignName);
      hasCreatedRef.current = true;
    }
  }, [role, isNew, user]);

  // Load tokens from API
  useEffect(() => {
    if (tokensData && Array.isArray(tokensData)) {
      setTokens(tokensData);
    }
  }, [tokensData]);

  // Load grid size from campaign
  useEffect(() => {
    if (campaign && typeof campaign === 'object') {
      if ('gridSize' in campaign && typeof campaign.gridSize === 'number') {
        setGridSize(campaign.gridSize);
      }
      if ('currentMap' in campaign && typeof campaign.currentMap === 'string') {
        setCurrentMap(campaign.currentMap);
      }
    }
  }, [campaign]);

  // If GM, no character creation needed
  useEffect(() => {
    if (role === 'gm') {
      setCharacter({ name: 'GM', class: 'admin' });
    } else if (characters && Array.isArray(characters) && characters.length > 0) {
      // Find player's character
      const playerChar = characters.find((c: any) => c.userId === user?.id);
      if (playerChar) {
        setCharacter(playerChar);
      }
    }
  }, [role, characters, user]);

  // WebSocket connection
  useEffect(() => {
    if (effectiveCampaignId && !wsConnectedRef.current) {
      gameWs.connect(effectiveCampaignId);
      wsConnectedRef.current = true;

      const unsubscribe = gameWs.onMessage((data) => {
        if (data.type === 'token_move') {
          setTokens(prev => prev.map(t => 
            t.id === data.tokenId ? { ...t, x: data.x, y: data.y } : t
          ));
        }
      });

      return () => {
        unsubscribe();
        gameWs.disconnect();
        wsConnectedRef.current = false;
      };
    }
  }, [effectiveCampaignId]);

  const handleCharacterCreated = (char: any) => {
    createCharacterMutation.mutate(char);
  };

  const handleMoveToken = (id: string, x: number, y: number) => {
    // Update locally first for immediate feedback
    setTokens(prev => prev.map(t => t.id === id ? { ...t, x, y } : t));
    
    // Send to API
    updateTokenMutation.mutate({ id, x, y });
    
    // Send to WebSocket for real-time updates
    gameWs.sendTokenMove(id, x, y);
  };

  const handleTokenClick = (token: any) => {
    if (role === 'gm' && token.type === 'player') {
      if (characters && Array.isArray(characters)) {
        const charData = characters.find((c: any) => c.id === token.characterId);
        if (charData) {
          setInspectedChar(charData);
        }
      }
    }
  };

  // GM Actions
  const handleAddToken = () => {
    const newToken = {
      type: 'enemy',
      x: 200 + Math.floor(Math.random() * 200),
      y: 200 + Math.floor(Math.random() * 200),
      image: goblinToken,
    };
    createTokenMutation.mutate(newToken);
  };

  const handleChangeMap = () => {
    const newMap = currentMap === battleMapImage1 ? battleMapImage2 : battleMapImage1;
    setCurrentMap(newMap);
    updateCampaignMutation.mutate({ currentMap: newMap });
  };

  const handleGridSizeChange = (newSize: number) => {
    setGridSize(newSize);
    updateCampaignMutation.mutate({ gridSize: newSize });
  };

  // Show loading state
  if (campaignLoading || tokensLoading || charactersLoading || createCampaignMutation.isPending) {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-stone-400">Loading campaign...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white select-none flex flex-col">
      
      {/* Top Bar: Nav & Settings */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 flex justify-between items-start pointer-events-none">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setLocation("/")} 
          className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto"
          data-testid="button-back-home"
        >
          <ArrowLeft />
        </Button>
        
        {/* Settings / Menu Button for ALL Roles */}
        <div className="pointer-events-auto">
          <CampaignMenu 
            role={role} 
            inviteCode={(campaign && typeof campaign === 'object' && 'inviteCode' in campaign ? campaign.inviteCode as string : "") || ""}
            inspectedChar={inspectedChar}
            onInspectChar={setInspectedChar}
            gridSize={gridSize}
            setGridSize={handleGridSizeChange}
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