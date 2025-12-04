import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { motion } from "framer-motion";
import { CharacterCreation, BattleMap, CampaignMenu, CharacterSheet, BattleMapHotbars, SelectionModeButtons, InitiativeTracker, type SelectionMode } from "@/components/game/GameComponents";
import { BattlemapDiceOverlay, triggerBattlemapDiceRoll } from "@/components/game/BattlemapDiceOverlay";
import { type AoeTargetState, createInitialAoeState } from "@/lib/aoeHelpers";
import { RollNotificationContainer, triggerInitiativeNotification } from "@/components/game/RollNotification";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Settings, Map as MapIcon, Layers, Trash2, MessageSquare, User, BarChart3, Zap, Backpack, Sparkles, Grid3X3, ScrollText, Swords, Dices } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import battleMapImage1 from "@/assets/rocky_coast_battlemap.jpg";
import battleMapImage2 from "@assets/generated_images/dark_fantasy_landscape_with_arcane_ruins.png";
import warriorToken from "@assets/generated_images/top_down_warrior_token.png";
import goblinToken from "@assets/generated_images/top_down_goblin_token.png";
import { useAuth } from "@/lib/AuthContext";
import { api, gameWs, type Scene } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Scene Settings Form Component
function SceneSettingsForm({ scene, onUpdateScene }: { scene: Scene; onUpdateScene: (settings: Partial<Scene>) => void }) {
  const [localSettings, setLocalSettings] = useState({
    gridEnabled: scene.gridEnabled,
    gridType: scene.gridType,
    gridSize: scene.gridSize,
    gridColor: scene.gridColor || '#ffffff',
    gridThickness: scene.gridThickness ?? 1,
    gridOpacity: scene.gridOpacity ?? 0.4,
    backgroundImage: scene.backgroundImage || '',
  });

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Update scene settings immediately when they change (with debouncing for sliders)
  const updateSetting = (key: keyof typeof localSettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    
    // Debounce slider updates to avoid spamming the server during slider drag
    if (key === 'gridSize' || key === 'gridThickness' || key === 'gridOpacity') {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        onUpdateScene({ [key]: value });
      }, 300);
    } else {
      // Apply other changes immediately (optimistic update)
      onUpdateScene({ [key]: value });
    }
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

  return (
    <div className="space-y-4">
      {/* Grid Toggle */}
      <div className="flex items-center justify-between touch-target">
        <Label htmlFor="grid-toggle" className="text-stone-300 text-responsive">Enable Grid</Label>
        <input
          type="checkbox"
          id="grid-toggle"
          checked={localSettings.gridEnabled}
          onChange={(e) => updateSetting('gridEnabled', e.target.checked)}
          className="h-5 w-5 sm:h-4 sm:w-4 focus-ring-amber"
          data-testid="toggle-grid"
          aria-label="Toggle grid visibility"
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
            onChange={(e) => updateSetting('gridThickness', parseFloat(e.target.value))}
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
            min="0"
            max="1"
            step="0.05"
            value={localSettings.gridOpacity}
            onChange={(e) => updateSetting('gridOpacity', parseFloat(e.target.value))}
            className="w-full accent-amber-600"
            data-testid="slider-grid-opacity"
          />
        </div>
      )}

      {/* Grid Color */}
      {localSettings.gridEnabled && (
        <div className="space-y-2">
          <Label htmlFor="grid-color" className="text-stone-300">Grid Color</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              id="grid-color"
              value={localSettings.gridColor}
              onChange={(e) => updateSetting('gridColor', e.target.value)}
              className="w-12 h-10 rounded border border-stone-700 bg-stone-800 cursor-pointer"
              data-testid="input-grid-color"
            />
            <div className="flex gap-1.5 flex-wrap">
              {['#ffffff', '#ff0000', '#00ff00', '#0088ff', '#ffff00', '#ff00ff', '#000000'].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateSetting('gridColor', color)}
                  className={`w-7 h-7 rounded border-2 transition-all ${
                    localSettings.gridColor === color 
                      ? 'border-amber-500 ring-2 ring-amber-500/50' 
                      : 'border-stone-600 hover:border-stone-400'
                  }`}
                  style={{ backgroundColor: color }}
                  data-testid={`button-grid-color-${color.replace('#', '')}`}
                  aria-label={`Set grid color to ${color}`}
                />
              ))}
            </div>
          </div>
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
  // Note: Player character display is now handled solely by 'character' state (set via Assign button)
  const [currentMap, setCurrentMap] = useState(battleMapImage1);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState({ x: 0, y: 0, zoom: 1 });
  const [scenesManagementOpen, setScenesManagementOpen] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [viewingCharacterSheet, setViewingCharacterSheet] = useState<any>(null);
  const [characterSheetDefaultTab, setCharacterSheetDefaultTab] = useState("overview");
  
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignSystem, setNewCampaignSystem] = useState("arcana-adventure");
  
  // Selection mode state for battlemap interactions
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('select');
  const [targetedTokenId, setTargetedTokenId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  
  // Initiative tracker state
  const [initiativeTrackerOpen, setInitiativeTrackerOpen] = useState(false);
  
  // Dice roller state
  const [diceMenuOpen, setDiceMenuOpen] = useState(false);
  const battlemapContainerRef = useRef<HTMLDivElement>(null);
  
  // AoE targeting state
  const [aoeTargetState, setAoeTargetState] = useState<AoeTargetState>(createInitialAoeState());
  
  // Other players' AoE targeting states (keyed by userId)
  const [otherPlayersAoe, setOtherPlayersAoe] = useState<Map<string, {
    userId: string;
    username: string;
    active: boolean;
    spellName?: string;
    spellAoe?: string;
    casterTokenId?: string;
    casterName?: string;
    center: { x: number; y: number };
    locked: boolean;
  }>>(new Map());
  
  // Helper function to enter AoE targeting mode
  const enterAoeMode = (spell: any, casterTokenId: string) => {
    const casterToken = tokens.find((t: any) => t.id === casterTokenId);
    const casterChar = characters ? (characters as any[]).find((c: any) => c.id === casterToken?.characterId) : null;
    
    setAoeTargetState({
      active: true,
      spell,
      casterTokenId,
      center: { x: 0, y: 0 },
      locked: false,
    });
    
    // Broadcast to other players
    gameWs.sendAoeTargeting({
      active: true,
      spellName: spell.name,
      spellAoe: spell.aoe,
      casterTokenId,
      casterName: casterChar?.name || 'Unknown',
      center: { x: 0, y: 0 },
      locked: false,
    });
  };
  
  // Helper function to exit AoE mode
  const exitAoeMode = () => {
    setAoeTargetState(createInitialAoeState());
    gameWs.clearAoeTargeting();
  };
  
  // Helper function to handle AoE click - updates position and validates range
  const handleAoeClick = (x: number, y: number) => {
    let isLocked = true;
    
    // Then check range if we have caster token info
    const casterToken = tokens.find((t: any) => t.id === aoeTargetState.casterTokenId);
    if (casterToken) {
      const casterCenterX = casterToken.x + (activeScene?.gridSize || 50) / 2;
      const casterCenterY = casterToken.y + (activeScene?.gridSize || 50) / 2;
      const spellRange = aoeTargetState.spell?.rangeNum || 30;
      const gridSizeVal = activeScene?.gridSize || 50;
      
      const dx = x - casterCenterX;
      const dy = y - casterCenterY;
      const distancePixels = Math.sqrt(dx * dx + dy * dy);
      const distanceFeet = (distancePixels / gridSizeVal) * 5;
      
      // If out of range, unlock so user can reposition
      if (distanceFeet > spellRange) {
        isLocked = false;
      }
    }
    
    // Update position
    setAoeTargetState(prev => ({
      ...prev,
      center: { x, y },
      locked: isLocked,
    }));
    
    // Broadcast the locked position to other players
    const casterChar = characters && casterToken ? (characters as any[]).find((c: any) => c.id === casterToken.characterId) : null;
    gameWs.sendAoeTargeting({
      active: true,
      spellName: aoeTargetState.spell?.name,
      spellAoe: aoeTargetState.spell?.aoe,
      casterTokenId: aoeTargetState.casterTokenId,
      casterName: casterChar?.name || 'Unknown',
      center: { x, y },
      locked: isLocked,
    });
  };
  
  // Helper function to update AoE center position (when hovering)
  const updateAoeCenter = (x: number, y: number) => {
    if (!aoeTargetState.locked) {
      setAoeTargetState(prev => ({ ...prev, center: { x, y } }));
      
      // Broadcast the moving position to other players (throttled by sending every update)
      const casterToken = tokens.find((t: any) => t.id === aoeTargetState.casterTokenId);
      const casterChar = characters && casterToken ? (characters as any[]).find((c: any) => c.id === casterToken.characterId) : null;
      gameWs.sendAoeTargeting({
        active: true,
        spellName: aoeTargetState.spell?.name,
        spellAoe: aoeTargetState.spell?.aoe,
        casterTokenId: aoeTargetState.casterTokenId,
        casterName: casterChar?.name || 'Unknown',
        center: { x, y },
        locked: false,
      });
    }
  };
  
  // Escape key handler to cancel AoE mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && aoeTargetState.active) {
        exitAoeMode();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aoeTargetState.active]);

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

  // Sync viewingCharacterSheet with the latest data from the characters query
  useEffect(() => {
    if (viewingCharacterSheet && characters) {
      const updatedChar = (characters as any[]).find((c: any) => c.id === viewingCharacterSheet.id);
      if (updatedChar && JSON.stringify(updatedChar) !== JSON.stringify(viewingCharacterSheet)) {
        setViewingCharacterSheet(updatedChar);
      }
    }
  }, [characters, viewingCharacterSheet]);

  // Load campaign members
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/members`],
    queryFn: () => api.getCampaignMembers(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && !isNew,
    staleTime: 0, // Always refetch to get latest members
  });

  // Load current user's permissions for all characters in the campaign
  const { data: myPermissions } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/my-permissions`],
    queryFn: () => api.getMyPermissions(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && !isNew && role === 'player',
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
    mutationFn: (name: string) => api.createCampaign(name),
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
      toast({ title: "Success", description: "Character created successfully" });
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

  // Delete token mutation
  const deleteTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.deleteToken(tokenId),
    onSuccess: (_, tokenId) => {
      setTokens(prev => prev.filter(t => t.id !== tokenId));
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`] });
      toast({ title: "Success", description: "Token removed from battlemap" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete token", variant: "destructive" });
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

  // Update character mutation
  const updateCharacterMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateCharacter(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`] });
      toast({ title: "Success", description: "Character updated successfully", duration: 1000 });
      gameWs.sendCharacterUpdate(variables.id);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update character", variant: "destructive" });
    },
  });

  // Handle New Campaign Creation - Show dialog instead of auto-creating
  useEffect(() => {
    if (role === 'gm' && isNew && !hasCreatedRef.current && user) {
      setShowCampaignDialog(true);
      hasCreatedRef.current = true;
    }
  }, [role, isNew, user]);

  const handleCreateCampaign = () => {
    if (!newCampaignName.trim()) {
      toast({ title: "Error", description: "Please enter a campaign name", variant: "destructive" });
      return;
    }
    createCampaignMutation.mutate(newCampaignName.trim());
    setShowCampaignDialog(false);
  };

  const handleDeleteToken = (tokenId: string) => {
    deleteTokenMutation.mutate(tokenId);
  };

  // Load tokens from API
  useEffect(() => {
    if (tokensData && Array.isArray(tokensData)) {
      setTokens(tokensData);
    }
  }, [tokensData]);

  // Load current map from campaign
  useEffect(() => {
    if (campaign && typeof campaign === 'object') {
      if ('currentMap' in campaign && typeof campaign.currentMap === 'string') {
        setCurrentMap(campaign.currentMap);
      }
    }
  }, [campaign]);

  // Store characters ref for stable closure access in async callbacks
  const charactersRef = useRef<any[]>([]);
  useEffect(() => {
    if (characters && Array.isArray(characters)) {
      charactersRef.current = characters;
    }
  }, [characters]);

  // Load assigned character from persistence for both GMs and players
  useEffect(() => {
    // Wait for characters to be loaded AND populated
    if (!effectiveCampaignId || charactersLoading) return;
    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      // For GMs with no characters yet, still set GM mode
      if (role === 'gm') {
        setCharacter({ name: 'GM', class: 'admin' });
      }
      return;
    }
    
    // Capture characters at effect run time (stable for async callback)
    const currentCharacters = characters as any[];
    
    // Try to load persisted assigned character first
    api.getAssignedCharacter(effectiveCampaignId).then(({ characterId }) => {
      if (characterId) {
        const assignedChar = currentCharacters.find((c: any) => c.id === characterId);
        if (assignedChar) {
          setCharacter(assignedChar);
          // For GMs, also set inspectedChar so the UI shows (hotbars, tabs, etc.)
          if (role === 'gm') {
            setInspectedChar(assignedChar);
          }
          return;
        }
      }
      // No persisted assignment found - use role-based fallback
      if (role === 'gm') {
        // GMs default to GM view mode if no character assigned
        setCharacter({ name: 'GM', class: 'admin' });
      } else if (role === 'player' && currentCharacters.length > 0) {
        // Players fall back to finding their own character
        const playerChar = currentCharacters.find((c: any) => c.userId === user?.id);
        if (playerChar) {
          setCharacter(playerChar);
        }
      }
    }).catch(() => {
      // On error, use role-based fallback
      if (role === 'gm') {
        setCharacter({ name: 'GM', class: 'admin' });
      } else if (role === 'player' && currentCharacters.length > 0) {
        const playerChar = currentCharacters.find((c: any) => c.userId === user?.id);
        if (playerChar) {
          setCharacter(playerChar);
        }
      }
    });
  }, [role, characters, charactersLoading, user, effectiveCampaignId]);

  // Store refs for stable closures in WebSocket handler
  const queryClientRef = useRef(queryClient);
  const toastRef = useRef(toast);
  useEffect(() => {
    queryClientRef.current = queryClient;
    toastRef.current = toast;
  }, [queryClient, toast]);

  // WebSocket connection
  useEffect(() => {
    if (effectiveCampaignId && !wsConnectedRef.current) {
      gameWs.connect(effectiveCampaignId);
      wsConnectedRef.current = true;

      const unsubscribe = gameWs.onMessage((data) => {
        console.log('WebSocket message received:', data.type, data);
        if (data.type === 'token_move') {
          setTokens(prev => prev.map(t => 
            t.id === data.tokenId ? { ...t, x: data.x, y: data.y } : t
          ));
        }
        if (data.type === 'character_changed') {
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`] });
          if (data.characterId) {
            queryClientRef.current.invalidateQueries({ queryKey: [`/api/characters/${data.characterId}`] });
          }
        }
        // Handle real-time character updates - update local state if it matches current character
        if (data.type === 'character_updated' && data.character) {
          const updatedChar = data.character;
          // Update the character state if it matches the currently active character
          setCharacter((prev: any) => {
            if (prev && prev.id === updatedChar.id) {
              return updatedChar;
            }
            return prev;
          });
          // Update inspectedChar state if it matches
          setInspectedChar((prev: any) => {
            if (prev && prev.id === updatedChar.id) {
              return updatedChar;
            }
            return prev;
          });
          // Also invalidate queries to keep cache in sync
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`] });
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/characters/${updatedChar.id}`] });
        }
        if (data.type === 'permission_update') {
          console.log('Permission update received:', data);
          // Invalidate permissions cache so UI updates immediately
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/my-permissions`] });
          
          // Show toast for the affected user
          const accessDesc = data.accessLevel === 'edit' ? 'edit' : 
                             data.accessLevel === 'view' ? 'view only' : 'no';
          toastRef.current({ 
            title: "Access Changed", 
            description: `Access to ${data.characterName || 'a character'} is now ${accessDesc}`,
            variant: data.accessLevel === 'none' ? 'destructive' : 'default'
          });
        }
        if (data.type === 'initiative_update' || data.type === 'combat_update') {
          // Invalidate initiative queries for real-time sync
          if (data.sceneId) {
            queryClientRef.current.invalidateQueries({ queryKey: [`/api/scenes/${data.sceneId}/initiative`] });
          }
        }
        if (data.type === 'dice_roll' && data.roll) {
          // Trigger battlemap dice notification
          triggerBattlemapDiceRoll(data.roll);
        }
        if (data.type === 'initiative_roll') {
          // Trigger initiative roll notification
          triggerInitiativeNotification(
            data.result,
            data.modifier,
            data.total,
            data.username,
            data.characterName
          );
        }
        
        // Handle combat HP updates - real-time damage/healing
        if (data.type === 'character_hp_update') {
          const { characterId, hp, previousHp, damage, isHealing, attackerName } = data;
          // Update local character state if it matches
          setCharacter((prev: any) => {
            if (prev && prev.id === characterId) {
              return { ...prev, hp };
            }
            return prev;
          });
          // Update inspected character if it matches
          setInspectedChar((prev: any) => {
            if (prev && prev.id === characterId) {
              return { ...prev, hp };
            }
            return prev;
          });
          // Update tokens to reflect HP changes
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`] });
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/characters/${characterId}`] });
        }
        
        // Handle token CRUD - real-time token updates
        if (data.type === 'token_created' && data.token) {
          setTokens(prev => {
            // Avoid duplicates
            if (prev.some(t => t.id === data.token.id)) return prev;
            return [...prev, data.token];
          });
        }
        if (data.type === 'token_updated' && data.token) {
          setTokens(prev => prev.map(t => 
            t.id === data.token.id ? data.token : t
          ));
        }
        if (data.type === 'token_deleted' && data.tokenId) {
          setTokens(prev => prev.filter(t => t.id !== data.tokenId));
        }
        
        // Handle scene updates - real-time scene changes
        if (data.type === 'scene_updated' && data.scene) {
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`] });
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/scenes/${data.scene.id}`] });
        }
        if (data.type === 'scene_deleted' && data.sceneId) {
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`] });
        }
        if (data.type === 'active_scene_changed') {
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}`] });
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`] });
          if (data.sceneId) {
            queryClientRef.current.invalidateQueries({ queryKey: [`/api/scenes/${data.sceneId}`] });
          }
        }
        
        // Handle chat messages - real-time chat
        if (data.type === 'chat_message' && data.message) {
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/messages`] });
        }
        
        // Handle other players' AoE targeting updates
        if (data.type === 'aoe_targeting') {
          const { userId, username, active, spellName, spellAoe, casterTokenId, casterName, center, locked } = data;
          
          // Skip our own broadcasts - we already display our AoE via aoeTargetState
          if (userId === user?.id) {
            return;
          }
          
          setOtherPlayersAoe(prev => {
            const updated = new Map(prev);
            if (active) {
              updated.set(userId, {
                userId,
                username,
                active,
                spellName,
                spellAoe,
                casterTokenId,
                casterName,
                center,
                locked,
              });
            } else {
              // Player exited AoE mode
              updated.delete(userId);
            }
            return updated;
          });
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
  };

  const handleAssignCharacter = (char: any) => {
    setCharacter(char);
    // For GMs, also update the inspected character so the UI shows the right character
    if (role === 'gm') {
      setInspectedChar(char);
    }
    // Persist the assignment to the backend so it survives page reload
    if (effectiveCampaignId) {
      api.setAssignedCharacter(effectiveCampaignId, char.id).catch(() => {
        // Silently fail - assignment will still work for this session
      });
    }
    toast({ title: "Character Assigned", description: `${char.name} is now your active character` });
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
    console.log('[TokenClick] Mode:', selectionMode, 'Token:', token.id, token.characterId);
    // Handle based on current selection mode
    switch (selectionMode) {
      case 'select':
        // Select mode: mark the token as selected with white border only
        // Do NOT change inspectedChar - the hotbar should stay on the user's assigned character
        console.log('[TokenClick] Select mode - only selecting token, NOT changing hotbar');
        setSelectedTokenId(token.id);
        break;
        
      case 'target':
        // Target mode: add red outline to selected token (only one at a time)
        setTargetedTokenId(token.id);
        setSelectedTokenId(token.id);
        break;
    }
  };

  // Handler for double-clicking a token - triggers character assignment in select mode
  const handleTokenDoubleClick = (token: any) => {
    // Only assign in select mode - double-click assigns the character
    if (selectionMode !== 'select') return;
    
    console.log('[TokenDoubleClick] Assigning character from token:', token.id, token.characterId);
    if (token.type === 'player' && characters && Array.isArray(characters)) {
      const charData = characters.find((c: any) => c.id === token.characterId);
      if (charData) {
        if (role === 'gm') {
          // GMs can assign any character
          console.log('[TokenDoubleClick] ASSIGNING character (persisting):', charData.name);
          setCharacter(charData);
          setInspectedChar(charData);
          // Persist the assignment so it survives page reload
          if (effectiveCampaignId) {
            api.setAssignedCharacter(effectiveCampaignId, charData.id).catch(() => {
              // Silently fail - assignment will still work for this session
            });
          }
          toast({ title: "Character Assigned", description: `${charData.name} is now your active character` });
        } else if (role === 'player') {
          // Players can only assign characters they have edit access to
          const permission = myPermissions?.permissions?.[charData.id];
          if (permission === 'owner' || permission === 'edit') {
            setCharacter(charData);
            // Persist the assignment
            if (effectiveCampaignId) {
              api.setAssignedCharacter(effectiveCampaignId, charData.id).catch(() => {
                // Silently fail - assignment will still work for this session
              });
            }
            toast({ title: "Character Assigned", description: `${charData.name} is now your active character` });
          } else {
            toast({ title: "No Access", description: "You don't have edit access to this character", variant: "destructive" });
          }
        }
      }
    }
    setSelectedTokenId(token.id);
  };

  // Handler for mode changes - clear targeting and selection when switching modes
  const handleModeChange = (mode: SelectionMode) => {
    // Clear targeted token when switching away from Target mode
    if (selectionMode === 'target' && mode !== 'target') {
      setTargetedTokenId(null);
    }
    // Clear selected token when switching modes for a clean slate
    setSelectedTokenId(null);
    setSelectionMode(mode);
  };

  // GM Actions
  const handleAddCharacterToken = (character: any) => {
    const newToken = {
      type: 'player',
      characterId: character.id,
      x: 200 + Math.floor(Math.random() * 200),
      y: 200 + Math.floor(Math.random() * 200),
      image: character.portrait || goblinToken,
    };
    createTokenMutation.mutate(newToken);
  };

  const handleChangeMap = () => {
    const newMap = currentMap === battleMapImage1 ? battleMapImage2 : battleMapImage1;
    setCurrentMap(newMap);
    updateCampaignMutation.mutate({ currentMap: newMap });
  };

  const handleUpdateScene = (settings: Partial<Scene>) => {
    if (activeScene) {
      updateSceneMutation.mutate(settings);
    }
  };

  const handleLevelUpAll = async (mode: 'set' | 'add', targetLevel?: number) => {
    if (!effectiveCampaignId) {
      toast({ title: "Error", description: "No campaign ID", variant: "destructive" });
      return;
    }

    try {
      const response = await fetch(`/api/campaigns/${effectiveCampaignId}/level-up-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode, targetLevel })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to level up characters');
      }

      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`] });
      
      toast({ 
        title: "Success", 
        description: mode === 'set' 
          ? `All characters set to level ${targetLevel}` 
          : `${result.updates?.length || 0} characters leveled up by 1` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to level up characters", variant: "destructive" });
    }
  };

  const handleSetDefaultView = () => {
    if (activeScene) {
      // Save view as world center coordinates (version 1)
      // currentView.x/y are already world coordinates from BattleMap's notifyViewChange
      updateSceneMutation.mutate({
        defaultViewX: Math.round(currentView.x),
        defaultViewY: Math.round(currentView.y),
        defaultViewZoom: currentView.zoom,
        defaultViewVersion: 1, // Version 1 = world center coordinates
      } as any);
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

  const handleUpdateCharacter = (updates: any) => {
    if (viewingCharacterSheet) {
      updateCharacterMutation.mutate({ id: viewingCharacterSheet.id, data: updates });
      // Optimistically update the local state
      setViewingCharacterSheet({ ...viewingCharacterSheet, ...updates });
    }
  };

  const handleViewCharacter = (char: any) => {
    setCharacterSheetDefaultTab("overview");
    setViewingCharacterSheet(char);
  };

  // Open character sheet to a specific tab
  const openCharacterSheetToTab = (tab: string) => {
    // For players: use ONLY their assigned character (not changed by token clicks)
    // For GMs: use inspectedChar (clicked token)
    const charToView = role === 'player' ? character : inspectedChar;
    if (charToView) {
      setCharacterSheetDefaultTab(tab);
      setViewingCharacterSheet(charToView);
    }
  };

  // Show loading state
  if (campaignLoading || tokensLoading || charactersLoading || membersLoading || sceneLoading || createCampaignMutation.isPending) {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 shimmer p-8 rounded-lg">
          <Loader2 className="h-12 w-12 sm:h-8 sm:w-8 animate-spin text-amber-500 glow-amber" aria-label="Loading" />
          <p className="text-stone-400 text-responsive-lg">Loading campaign...</p>
        </div>
      </div>
    );
  }

  // Show campaign creation dialog
  if (showCampaignDialog) {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-black text-white flex items-center justify-center">
        <Dialog open={showCampaignDialog} onOpenChange={(open) => !open && setLocation('/')}>
          <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-amber-500 font-display text-2xl">Create New Campaign</DialogTitle>
              <DialogDescription className="text-stone-400">
                Set up your new adventure with a name and game system.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-name" className="text-stone-300">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="Enter campaign name..."
                  className="bg-stone-800 border-stone-700 text-stone-200"
                  data-testid="input-campaign-name"
                  autoFocus
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="campaign-system" className="text-stone-300">Game System</Label>
                <Select value={newCampaignSystem} onValueChange={setNewCampaignSystem}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200" data-testid="select-game-system">
                    <SelectValue placeholder="Select a system" />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="arcana-adventure" className="text-stone-200">Arcana Adventure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setLocation('/')}
                  className="flex-1 border-stone-600 text-stone-300 hover:bg-stone-800"
                  data-testid="button-cancel-campaign"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateCampaign}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={!newCampaignName.trim()}
                  data-testid="button-create-campaign"
                >
                  Create Campaign
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white select-none flex flex-col">
      
      {/* Roll Notification Container */}
      <RollNotificationContainer />
      
      {/* Top Bar: Nav & Settings */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 flex justify-between items-start pointer-events-none">
        {/* Left Side: Back button and Chat */}
        <div className="pointer-events-auto flex flex-col gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/")} 
            className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto"
            data-testid="button-back-home"
          >
            <ArrowLeft />
          </Button>
          
          {/* Chat Button - Left side, mirrored to settings */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setChatOpen(true)}
                  className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto"
                  data-testid="button-chat"
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-stone-800 border-stone-700 text-stone-200">
                <p>Chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Dice Roller Button with Menu - Left side under chat */}
          <div className="relative">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDiceMenuOpen(!diceMenuOpen)}
                    className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto"
                    data-testid="button-dice-roller"
                  >
                    <Dices className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-stone-800 border-stone-700 text-stone-200">
                  <p>Roll Dice</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {/* Dice Quick Menu */}
            {diceMenuOpen && (
              <div className="absolute left-full ml-2 top-0 bg-stone-900/95 border border-stone-700 rounded-lg p-2 pointer-events-auto shadow-xl z-50">
                <div className="flex flex-col gap-1 min-w-[80px]">
                  {['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].map((die) => (
                    <Button
                      key={die}
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        gameWs.sendDiceRoll(die, 0, undefined, character?.id);
                        setDiceMenuOpen(false);
                      }}
                      className="text-white/80 hover:text-white hover:bg-white/10 justify-start font-mono"
                      data-testid={`button-roll-${die}`}
                    >
                      {die.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Right Side: Settings / Menu Button for ALL Roles */}
        <div className="pointer-events-auto flex flex-col gap-2">
          <CampaignMenu 
            campaignId={effectiveCampaignId || undefined}
            role={role} 
            inviteCode={(campaign && typeof campaign === 'object' && 'inviteCode' in campaign ? campaign.inviteCode as string : "") || ""}
            inspectedChar={inspectedChar}
            onInspectChar={setInspectedChar}
            onAddCharacterToken={handleAddCharacterToken}
            onChangeMap={handleChangeMap}
            characters={characters as any[]}
            members={members as any[]}
            onAddCharacter={handleAddCharacter}
            onViewCharacter={handleViewCharacter}
            onLevelUpAll={handleLevelUpAll}
            chatOpen={chatOpen}
            onChatOpenChange={setChatOpen}
            onAssignCharacter={handleAssignCharacter}
            myPermissions={myPermissions}
          />
          
          {/* Scenes Button (GM Only) - Icon only, directly under Settings */}
          {role === 'gm' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setScenesManagementOpen(true)}
                    className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto relative z-[60]"
                    data-testid="button-scenes"
                  >
                    <Layers className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                  <p>Scenes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Initiative Button - Under scenes/settings */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setInitiativeTrackerOpen(true)}
                  className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto"
                  data-testid="button-initiative"
                >
                  <Swords className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                <p>Initiative</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Show message when player has no character assigned */}
      {!character && role === 'player' && (
        <div className="fixed bottom-4 left-4 z-40 bg-stone-900/90 border border-stone-700 rounded-lg p-3 text-stone-300 text-sm">
          No character assigned
        </div>
      )}

      {/* Scenes Management Sheet (GM Only) */}
      {role === 'gm' && activeScene && (
        <Sheet open={scenesManagementOpen} onOpenChange={setScenesManagementOpen}>
          <SheetContent className="bg-stone-900 border-stone-700 text-stone-200 w-full sm:max-w-md overflow-y-auto custom-scrollbar">
            <SheetHeader>
              <SheetTitle className="text-amber-500 font-display text-xl sm:text-2xl">Scenes</SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="h-[calc(100vh-100px)] pr-4">
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
                </div>

                {/* Scene Settings Section */}
                <div className="space-y-4 pt-4 border-t border-stone-700">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-stone-300 font-bold text-lg">Scene Settings</Label>
                    <span className="text-xs text-stone-500">Active: {activeScene.name}</span>
                  </div>

                  <SceneSettingsForm 
                    scene={activeScene} 
                    onUpdateScene={handleUpdateScene} 
                  />

                  {/* Set Default View Button */}
                  <div className="pt-4">
                    <Button
                      onClick={handleSetDefaultView}
                      className="w-full bg-blue-900/80 hover:bg-blue-800 text-white border border-blue-700"
                      data-testid="button-set-default-view"
                    >
                      <MapIcon className="h-4 w-4 mr-2" />
                      Set Default View
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}

      {/* Game View - Always visible for all campaign members */}
      <div className="flex flex-col h-full w-full">
        
        {/* Map Area - Takes full space, but HUD overlays it */}
        <div ref={battlemapContainerRef} className="relative flex-grow w-full bg-stone-900 z-0 overflow-hidden">
           <BattleMap 
             tokens={tokens} 
             onMoveToken={handleMoveToken} 
             onTokenClick={handleTokenClick}
             onTokenDoubleClick={handleTokenDoubleClick}
             onDeleteToken={handleDeleteToken}
             role={role} 
             gridSize={activeScene?.gridSize || 50}
             backgroundImage={currentMap}
             scene={activeScene}
             onViewChange={setCurrentView}
             characters={characters as any[]}
             selectionMode={selectionMode}
             targetedTokenId={targetedTokenId}
             selectedTokenId={selectedTokenId}
             aoeTargetState={aoeTargetState}
             onAoeMouseMove={updateAoeCenter}
             onAoeClick={handleAoeClick}
             otherPlayersAoe={otherPlayersAoe}
           />
           
           {/* Battlemap Dice Overlay for 3D dice rolling */}
           <BattlemapDiceOverlay />
           
           {/* Selection Mode Buttons - Left side of screen */}
           {/* For GMs: use inspectedChar if clicked, otherwise fall back to assigned character */}
           {/* For players: always use their assigned character */}
           <SelectionModeButtons 
             selectionMode={selectionMode}
             onModeChange={handleModeChange}
             character={role === 'gm' ? (inspectedChar ?? character) : character}
             tokens={tokens}
             onEnterSpellTargeting={enterAoeMode}
             onClearSpellTargeting={exitAoeMode}
             isSpellTargetingActive={aoeTargetState.active}
           />
           
           {/* Hotbars Display - only show when there's a character to display */}
           {/* For players: show ONLY their assigned character (not changed by token clicks) */}
           {/* For GMs: show inspectedChar (clicked token) */}
           {(role === 'gm' ? inspectedChar : character) && (
             <BattleMapHotbars 
               character={role === 'gm' ? inspectedChar : character}
               tokens={tokens}
               targetedTokenId={targetedTokenId}
               characters={characters as any[]}
               gridSize={activeScene?.gridSize || 50}
               onEnterAoeMode={enterAoeMode}
               aoeTargetState={aoeTargetState}
             />
           )}
          
          {/* Character Sheet Tab Buttons - Right side, aligned with hotbar buttons (visible when character/inspectedChar exists) */}
          {/* For players: show ONLY when they have an assigned character */}
          {((role === 'player' && character) || (role === 'gm' && inspectedChar)) && (
            <div className="absolute right-3 top-44 z-20 flex flex-col gap-2">
              {[
                { tab: 'overview', icon: User, color: 'stone' },
                { tab: 'attributes', icon: BarChart3, color: 'blue' },
                { tab: 'skills', icon: Zap, color: 'green' },
                { tab: 'inventory', icon: Backpack, color: 'amber' },
                { tab: 'magic', icon: Sparkles, color: 'purple' },
                { tab: 'hotbars', icon: Grid3X3, color: 'red' },
                { tab: 'background', icon: ScrollText, color: 'cyan' },
              ].map(({ tab, icon: Icon, color }) => {
                const colorClasses: Record<string, string> = {
                  stone: 'bg-stone-900/90 border-stone-600 text-stone-300 hover:bg-stone-800 hover:border-stone-500',
                  blue: 'bg-blue-900/90 border-blue-600 text-blue-300 hover:bg-blue-800 hover:border-blue-500',
                  green: 'bg-green-900/90 border-green-600 text-green-300 hover:bg-green-800 hover:border-green-500',
                  amber: 'bg-amber-900/90 border-amber-600 text-amber-300 hover:bg-amber-800 hover:border-amber-500',
                  purple: 'bg-purple-900/90 border-purple-600 text-purple-300 hover:bg-purple-800 hover:border-purple-500',
                  red: 'bg-red-900/90 border-red-600 text-red-300 hover:bg-red-800 hover:border-red-500',
                  cyan: 'bg-cyan-900/90 border-cyan-600 text-cyan-300 hover:bg-cyan-800 hover:border-cyan-500',
                };
                return (
                  <button
                    key={tab}
                    onClick={() => openCharacterSheetToTab(tab)}
                    className={`
                      w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center
                      transition-all duration-200 shadow-lg backdrop-blur-sm hover:scale-105
                      ${colorClasses[color]}
                    `}
                    data-testid={`button-sheet-${tab}`}
                  >
                    <Icon className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* Character Sheet Dialog - Full screen on mobile */}
      <Dialog open={!!viewingCharacterSheet} onOpenChange={(open) => !open && setViewingCharacterSheet(null)}>
        <DialogContent className="w-full h-full max-w-full max-h-full sm:max-w-4xl sm:h-[90vh] sm:max-h-[90vh] bg-stone-900 border-stone-700 text-stone-200 p-0 rounded-none sm:rounded-lg">
          <DialogHeader className="p-4 pb-0 sm:p-6 sm:pb-0 shrink-0">
            <DialogTitle className="text-lg sm:text-2xl text-amber-500 font-display truncate pr-8">
              {viewingCharacterSheet?.name}
            </DialogTitle>
          </DialogHeader>
          {viewingCharacterSheet && (
            <CharacterSheet
              character={viewingCharacterSheet}
              isGM={role === 'gm'}
              isOwner={
                viewingCharacterSheet.userId === user?.id || 
                myPermissions?.permissions?.[viewingCharacterSheet.id] === 'edit'
              }
              onUpdate={handleUpdateCharacter}
              onClose={() => setViewingCharacterSheet(null)}
              defaultTab={characterSheetDefaultTab}
              campaignId={effectiveCampaignId || undefined}
              sceneId={activeScene?.id}
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Initiative Tracker Dialog */}
      <InitiativeTracker
        open={initiativeTrackerOpen}
        onOpenChange={setInitiativeTrackerOpen}
        sceneId={activeScene?.id}
        campaignId={effectiveCampaignId || undefined}
        isGM={role === 'gm'}
        characters={characters as any[]}
      />
    </div>
  );
}