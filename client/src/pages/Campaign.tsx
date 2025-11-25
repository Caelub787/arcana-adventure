import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { motion } from "framer-motion";
import { CharacterCreation, BattleMap, HUD, CampaignMenu } from "@/components/game/GameComponents";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Settings, Map as MapIcon, Layers, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import battleMapImage1 from "@assets/generated_images/top_down_dungeon_battlemap.png";
import battleMapImage2 from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import warriorToken from "@assets/generated_images/top_down_warrior_token.png";
import goblinToken from "@assets/generated_images/top_down_goblin_token.png";
import { useAuth } from "@/lib/AuthContext";
import { api, gameWs, type Scene } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Scene Settings Form Component
function SceneSettingsForm({ scene, onUpdateScene, onClose }: { scene: Scene; onUpdateScene: (settings: Partial<Scene>) => void; onClose: () => void }) {
  // Store original scene values for cancel functionality
  const originalSettingsRef = useRef({
    gridEnabled: scene.gridEnabled,
    gridType: scene.gridType,
    gridSize: scene.gridSize,
    backgroundImage: scene.backgroundImage || '',
  });

  const [localSettings, setLocalSettings] = useState({
    gridEnabled: scene.gridEnabled,
    gridType: scene.gridType,
    gridSize: scene.gridSize,
    backgroundImage: scene.backgroundImage || '',
  });

  // Update scene settings immediately when they change
  const updateSetting = (key: keyof typeof localSettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    // Apply changes immediately (optimistic update)
    onUpdateScene({ [key]: value });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        updateSetting('backgroundImage', base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = () => {
    // Settings are already applied, just close
    onClose();
  };

  const handleCancel = () => {
    // Revert to original values
    onUpdateScene(originalSettingsRef.current);
    onClose();
  };

  return (
    <div className="space-y-6">
      {/* Grid Toggle */}
      <div className="flex items-center justify-between">
        <Label htmlFor="grid-toggle" className="text-stone-300">Enable Grid</Label>
        <input
          type="checkbox"
          id="grid-toggle"
          checked={localSettings.gridEnabled}
          onChange={(e) => updateSetting('gridEnabled', e.target.checked)}
          className="h-4 w-4"
          data-testid="toggle-grid"
        />
      </div>

      {/* Grid Type */}
      {localSettings.gridEnabled && (
        <div className="space-y-2">
          <Label htmlFor="grid-type" className="text-stone-300">Grid Type</Label>
          <select
            id="grid-type"
            value={localSettings.gridType}
            onChange={(e) => updateSetting('gridType', e.target.value)}
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
            onChange={(e) => updateSetting('gridSize', parseInt(e.target.value))}
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
  );
}

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
  const [currentView, setCurrentView] = useState({ x: 0, y: 0, zoom: 1 });
  const [sceneSettingsOpen, setSceneSettingsOpen] = useState(false);
  const [scenesManagementOpen, setScenesManagementOpen] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");

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

  // Load campaign members
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/members`],
    enabled: !!effectiveCampaignId && !isNew,
  });

  // Load active scene for the campaign
  const activeSceneId = campaign && typeof campaign === 'object' && 'activeSceneId' in campaign ? campaign.activeSceneId : null;
  const { data: activeScene, isLoading: sceneLoading } = useQuery({
    queryKey: [`/api/scenes/${activeSceneId}`],
    queryFn: () => api.getScene(activeSceneId as string),
    enabled: !!activeSceneId,
  });

  // Load all scenes for the campaign
  const { data: allScenes } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`],
    queryFn: () => api.getScenes(effectiveCampaignId!),
    enabled: !!effectiveCampaignId,
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
    mutationFn: (characterData: any) => api.createCharacter(effectiveCampaignId!, characterData),
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
    mutationFn: (tokenData: any) => api.createToken(effectiveCampaignId!, tokenData),
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

  // Update scene mutation
  const updateSceneMutation = useMutation({
    mutationFn: (data: Partial<Scene>) => api.updateScene(activeScene!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/scenes/${activeScene?.id}`] });
      toast({ title: "Success", description: "Scene updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update scene", variant: "destructive" });
    },
  });

  // Create scene mutation
  const createSceneMutation = useMutation({
    mutationFn: (name: string) => api.createScene(effectiveCampaignId!, { name, campaignId: effectiveCampaignId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`] });
      toast({ title: "Success", description: "Scene created successfully" });
      setNewSceneName("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create scene", variant: "destructive" });
    },
  });

  // Delete scene mutation
  const deleteSceneMutation = useMutation({
    mutationFn: (sceneId: string) => api.deleteScene(sceneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`] });
      toast({ title: "Success", description: "Scene deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete scene", variant: "destructive" });
    },
  });

  // Set active scene mutation
  const setActiveSceneMutation = useMutation({
    mutationFn: (sceneId: string) => api.setActiveScene(effectiveCampaignId!, sceneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}`] });
      toast({ title: "Success", description: "Active scene changed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to change active scene", variant: "destructive" });
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

  const handleAddCharacter = (characterData: any) => {
    createCharacterMutation.mutate(characterData);
    toast({ title: "Success", description: "Character created successfully" });
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

  const handleUpdateScene = (settings: Partial<Scene>) => {
    if (activeScene) {
      updateSceneMutation.mutate(settings);
    }
  };

  const handleSetDefaultView = () => {
    if (activeScene) {
      updateSceneMutation.mutate({
        defaultViewX: Math.round(currentView.x),
        defaultViewY: Math.round(currentView.y),
        defaultViewZoom: currentView.zoom,
      });
      toast({ title: "Success", description: "Default view saved" });
    }
  };

  const handleCreateScene = () => {
    if (newSceneName.trim()) {
      createSceneMutation.mutate(newSceneName.trim());
    }
  };

  const handleDeleteScene = (sceneId: string) => {
    if (allScenes && allScenes.length <= 1) {
      toast({ title: "Error", description: "Cannot delete the last scene", variant: "destructive" });
      return;
    }
    if (window.confirm("Are you sure you want to delete this scene?")) {
      deleteSceneMutation.mutate(sceneId);
    }
  };

  const handleSwitchScene = (sceneId: string) => {
    setActiveSceneMutation.mutate(sceneId);
    setScenesManagementOpen(false);
  };

  // Show loading state
  if (campaignLoading || tokensLoading || charactersLoading || membersLoading || sceneLoading || createCampaignMutation.isPending) {
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
            characters={characters as any[]}
            members={members as any[]}
            onAddCharacter={handleAddCharacter}
          />
        </div>
      </div>

      {/* Character Creation Modal */}
      {!character && role === 'player' && (
        <CharacterCreation onComplete={handleCharacterCreated} />
      )}

      {/* Scene Settings Dialog (GM Only) */}
      {role === 'gm' && activeScene && (
        <Dialog open={sceneSettingsOpen} onOpenChange={setSceneSettingsOpen}>
          <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-amber-500 font-display text-2xl">Scene Settings</DialogTitle>
            </DialogHeader>
            <SceneSettingsForm scene={activeScene} onUpdateScene={handleUpdateScene} onClose={() => setSceneSettingsOpen(false)} />
          </DialogContent>
        </Dialog>
      )}

      {/* Scenes Management Sheet (GM Only) */}
      {role === 'gm' && (
        <Sheet open={scenesManagementOpen} onOpenChange={setScenesManagementOpen}>
          <SheetContent className="bg-stone-900 border-stone-700 text-stone-200 w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="text-amber-500 font-display text-2xl">Manage Scenes</SheetTitle>
            </SheetHeader>
            
            <div className="mt-6 space-y-6">
              {/* Create New Scene */}
              <div className="space-y-3">
                <Label htmlFor="new-scene-name" className="text-stone-300 font-bold">Create New Scene</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-scene-name"
                    value={newSceneName}
                    onChange={(e) => setNewSceneName(e.target.value)}
                    placeholder="Enter scene name"
                    className="bg-stone-800 border-stone-700 text-stone-200"
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateScene()}
                    data-testid="input-new-scene-name"
                  />
                  <Button
                    onClick={handleCreateScene}
                    disabled={!newSceneName.trim() || createSceneMutation.isPending}
                    className="bg-amber-700 hover:bg-amber-600"
                    data-testid="button-create-scene"
                  >
                    Create
                  </Button>
                </div>
              </div>

              {/* Scenes List */}
              <div className="space-y-3">
                <Label className="text-stone-300 font-bold">All Scenes</Label>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {allScenes && allScenes.length > 0 ? (
                      allScenes.map((scene: Scene) => (
                        <div
                          key={scene.id}
                          className={`p-3 rounded border transition-all ${
                            scene.id === activeScene?.id
                              ? 'bg-amber-900/30 border-amber-700'
                              : 'bg-stone-800 border-stone-700 hover:bg-stone-750'
                          }`}
                          data-testid={`scene-item-${scene.id}`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="font-bold text-stone-200">{scene.name}</div>
                              <div className="text-xs text-stone-400 mt-1">
                                {scene.gridEnabled ? `${scene.gridType} grid (${scene.gridSize}px)` : 'Grid disabled'}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {scene.id !== activeScene?.id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSwitchScene(scene.id)}
                                  className="bg-stone-700 border-stone-600 hover:bg-stone-600"
                                  data-testid={`button-switch-scene-${scene.id}`}
                                >
                                  Switch
                                </Button>
                              )}
                              {scene.id === activeScene?.id && (
                                <span className="text-xs text-amber-500 font-bold px-2 py-1 bg-amber-900/20 rounded">
                                  Active
                                </span>
                              )}
                              {allScenes.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeleteScene(scene.id)}
                                  disabled={deleteSceneMutation.isPending}
                                  className="bg-red-900/30 hover:bg-red-800/50"
                                  data-testid={`button-delete-scene-${scene.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-stone-500 text-sm">
                        No scenes yet
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </SheetContent>
        </Sheet>
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
               scene={activeScene}
               onViewChange={setCurrentView}
             />
             
             {/* GM-Only Scene Controls */}
             {role === 'gm' && activeScene && (
               <div className="absolute top-20 left-4 z-30 flex flex-col gap-2">
                 <Button
                   size="sm"
                   variant="secondary"
                   onClick={() => setSceneSettingsOpen(true)}
                   className="bg-purple-900/80 hover:bg-purple-800 text-white border border-purple-700"
                   data-testid="button-scene-settings"
                 >
                   <Settings className="h-4 w-4 mr-2" />
                   Scene Settings
                 </Button>
                 <Button
                   size="sm"
                   variant="secondary"
                   onClick={handleSetDefaultView}
                   className="bg-blue-900/80 hover:bg-blue-800 text-white border border-blue-700"
                   data-testid="button-set-default-view"
                 >
                   <MapIcon className="h-4 w-4 mr-2" />
                   Set Default View
                 </Button>
                 <Button
                   size="sm"
                   variant="secondary"
                   onClick={() => setScenesManagementOpen(true)}
                   className="bg-amber-900/80 hover:bg-amber-800 text-white border border-amber-700"
                   data-testid="button-scenes-management"
                 >
                   <Layers className="h-4 w-4 mr-2" />
                   Scenes
                 </Button>
               </div>
             )}
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