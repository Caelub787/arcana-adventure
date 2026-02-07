import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useSearch, useRoute } from "wouter";
import { motion } from "framer-motion";
import { CharacterCreation, BattleMap, CampaignMenu, CharacterSheet, BattleMapHotbars, SelectionModeButtons, InitiativeTracker, type SelectionMode } from "@/components/game/GameComponents";
import { BattlemapDiceOverlay, triggerBattlemapDiceRoll } from "@/components/game/BattlemapDiceOverlay";
import { type AoeTargetState, createInitialAoeState } from "@/lib/aoeHelpers";
import { RollNotificationContainer, triggerInitiativeNotification, triggerEffectRollNotification, getNotificationStyle, setNotificationStyle, type NotificationStyle } from "@/components/game/RollNotification";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Settings, Map as MapIcon, Layers, Trash2, MessageSquare, User, BarChart3, Zap, Backpack, Sparkles, Grid3X3, ScrollText, Swords, Dices, Users, Dna, Edit2, Bell, FileText, X, ChevronLeft, Network, List, BookOpen, Send, Pin } from "lucide-react";
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
import { api, gameWs, type Scene, type CampaignSpecies, type FeatTree, type CharacterFolder, type SceneFolder, type TokenEffect, type TokenActiveEffect, type ThrownItem, type Note } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsMobile } from "@/hooks/use-mobile";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ImageBrowser } from "@/components/ImageBrowser";
import { CampaignNotesPanel } from "@/components/notes/CampaignNotesPanel";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { Folder, FolderOpen, FolderPlus, Plus, GripVertical, Eye, Radio, ChevronDown, ChevronRight, Pencil, Minus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
  const [showImageBrowser, setShowImageBrowser] = useState(false);

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
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label 
              htmlFor="bg-image" 
              className="flex-1 bg-stone-800 border border-stone-700 text-stone-200 rounded px-3 py-2 text-sm cursor-pointer hover:bg-stone-700 transition-colors text-center"
            >
              Change Background
            </label>
            <input
              type="file"
              id="bg-image"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              data-testid="input-background-image"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowImageBrowser(true)}
              className="border-stone-700 hover:bg-stone-800 text-amber-500 shrink-0"
              data-testid="button-browse-bg-library"
            >
              <Folder className="h-4 w-4 mr-1" />
              Library
            </Button>
          </div>
        </div>
        {localSettings.backgroundImage && (
          <div className="mt-2 text-xs text-stone-400">
            Image loaded (preview on battlemap)
          </div>
        )}
      </div>

      {/* Image Browser Dialog */}
      <ImageBrowser
        open={showImageBrowser}
        onOpenChange={setShowImageBrowser}
        onSelect={(imageBase64) => {
          updateSetting('backgroundImage', imageBase64);
        }}
        title="Select Background Image"
      />
    </div>
  );
}

const sizeOptions = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

const getSizeBonusFromSize = (size: string): number => {
  const sizeBonusMap: Record<string, number> = {
    'Tiny': -2,
    'Small': -1,
    'Medium': 0,
    'Large': 1,
    'Huge': 2,
    'Gargantuan': 3,
  };
  return sizeBonusMap[size] ?? 0;
};

interface CampaignSpeciesFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<CampaignSpecies>) => void;
  initialData?: CampaignSpecies | null;
  isLoading?: boolean;
  featTrees?: FeatTree[];
}

function CampaignSpeciesFormDialog({ open, onOpenChange, onSave, initialData, isLoading, featTrees = [] }: CampaignSpeciesFormDialogProps) {
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    defaultImage: string;
    lifespan: number | string;
    speed: number | string;
    flySpeed: number | string;
    size: string;
    naturalArmor: number | string;
    sizeBonus: number;
    startingHp: number | string;
    startingMaxHp: number | string;
    hpPerLevel: number | string;
    startingEnergy: number | string;
    startingMaxEnergy: number | string;
    energyPerLevel: number | string;
    carryWeight: number | string;
    featTree: string;
  }>({
    name: '',
    description: '',
    defaultImage: '',
    lifespan: '',
    speed: '',
    flySpeed: '',
    size: 'Medium',
    naturalArmor: '',
    sizeBonus: 0,
    startingHp: '',
    startingMaxHp: '',
    hpPerLevel: '',
    startingEnergy: '',
    startingMaxEnergy: '',
    energyPerLevel: '',
    carryWeight: '',
    featTree: '',
  });
  
  const { toast } = useToast();
  const speciesImageInputRef = useRef<HTMLInputElement>(null);
  const [showSpeciesImageBrowser, setShowSpeciesImageBrowser] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData({
        name: initialData?.name || '',
        description: initialData?.description || '',
        defaultImage: initialData?.defaultImage || '',
        lifespan: initialData?.lifespan ?? '',
        speed: initialData?.speed ?? '',
        flySpeed: initialData?.flySpeed ?? '',
        size: initialData?.size || 'Medium',
        naturalArmor: initialData?.naturalArmor ?? '',
        sizeBonus: initialData?.sizeBonus ?? getSizeBonusFromSize(initialData?.size || 'Medium'),
        startingHp: initialData?.startingHp ?? '',
        startingMaxHp: initialData?.startingMaxHp ?? '',
        hpPerLevel: initialData?.hpPerLevel ?? '',
        startingEnergy: initialData?.startingEnergy ?? '',
        startingMaxEnergy: initialData?.startingMaxEnergy ?? '',
        energyPerLevel: (initialData as any)?.energyPerLevel ?? '',
        carryWeight: initialData?.carryWeight ?? '',
        featTree: initialData?.featTree || '',
      });
    }
  }, [open, initialData]);

  const handleSpeciesImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData({ ...formData, defaultImage: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNumericChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value === '' ? '' : parseInt(value) });
  };

  const handleSizeChange = (newSize: string) => {
    setFormData({ 
      ...formData, 
      size: newSize, 
      sizeBonus: getSizeBonusFromSize(newSize) 
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Species name is required', variant: 'destructive' });
      return;
    }
    onSave({
      ...formData,
      defaultImage: formData.defaultImage || undefined,
      lifespan: Number(formData.lifespan) || 100,
      speed: Number(formData.speed) || 30,
      flySpeed: Number(formData.flySpeed) || 0,
      naturalArmor: Number(formData.naturalArmor) || 5,
      startingHp: Number(formData.startingHp) || 10,
      startingMaxHp: Number(formData.startingMaxHp) || 10,
      hpPerLevel: Number(formData.hpPerLevel) || 5,
      startingEnergy: Number(formData.startingEnergy) || 10,
      startingMaxEnergy: Number(formData.startingMaxEnergy) || 10,
      energyPerLevel: Number(formData.energyPerLevel) || 6,
      carryWeight: Number(formData.carryWeight) || 50,
    } as any);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-amber-500">
            {initialData ? 'Edit Campaign Species' : 'Create Campaign Species'}
          </DialogTitle>
          <DialogDescription className="text-stone-400">
            Define a custom species for this campaign
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-4 min-h-0">
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-stone-800 border-stone-700"
                  data-testid="input-species-name"
                />
              </div>

              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-stone-800 border-stone-700 min-h-[80px]"
                  data-testid="textarea-species-description"
                />
              </div>

              <div className="col-span-2">
                <Label>Default Token Image</Label>
                <div className="flex items-center gap-4">
                  {formData.defaultImage ? (
                    <div className="relative">
                      <img src={formData.defaultImage} alt="Species" className="h-16 w-16 rounded-full object-cover border border-stone-600" />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, defaultImage: '' })}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full h-5 w-5 text-xs flex items-center justify-center hover:bg-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-stone-700 flex items-center justify-center border border-stone-600">
                      <User className="h-8 w-8 text-stone-500" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={speciesImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSpeciesImageUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => speciesImageInputRef.current?.click()}
                      className="bg-stone-800 border-stone-700 hover:bg-stone-700"
                    >
                      Upload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowSpeciesImageBrowser(true)}
                      className="bg-stone-800 border-stone-700 hover:bg-stone-700"
                    >
                      <Folder className="h-4 w-4 mr-2" />
                      Browse
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label>Lifespan (years)</Label>
                <Input
                  type="number"
                  value={formData.lifespan}
                  onChange={(e) => handleNumericChange('lifespan', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="100"
                />
              </div>

              <div>
                <Label>Size</Label>
                <Select value={formData.size} onValueChange={handleSizeChange}>
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-species-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sizeOptions.map((size) => (
                      <SelectItem key={size} value={size}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Speed (ft)</Label>
                <Input
                  type="number"
                  value={formData.speed}
                  onChange={(e) => handleNumericChange('speed', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="30"
                />
              </div>

              <div>
                <Label>Fly Speed (ft)</Label>
                <Input
                  type="number"
                  value={formData.flySpeed}
                  onChange={(e) => handleNumericChange('flySpeed', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="0"
                />
              </div>

              <div>
                <Label>Natural Armor</Label>
                <Input
                  type="number"
                  value={formData.naturalArmor}
                  onChange={(e) => handleNumericChange('naturalArmor', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="5"
                />
              </div>

              <div>
                <Label>Size Bonus</Label>
                <Input
                  type="number"
                  value={formData.sizeBonus}
                  disabled
                  className="bg-stone-800 border-stone-700 opacity-50"
                />
              </div>

              <div>
                <Label>Starting HP</Label>
                <Input
                  type="number"
                  value={formData.startingHp}
                  onChange={(e) => handleNumericChange('startingHp', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="10"
                />
              </div>

              <div>
                <Label>Max HP</Label>
                <Input
                  type="number"
                  value={formData.startingMaxHp}
                  onChange={(e) => handleNumericChange('startingMaxHp', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="10"
                />
              </div>

              <div>
                <Label>HP Per Level</Label>
                <Input
                  type="number"
                  value={formData.hpPerLevel}
                  onChange={(e) => handleNumericChange('hpPerLevel', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="5"
                />
              </div>

              <div>
                <Label>Starting Energy</Label>
                <Input
                  type="number"
                  value={formData.startingEnergy}
                  onChange={(e) => handleNumericChange('startingEnergy', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="10"
                />
              </div>

              <div>
                <Label>Max Energy</Label>
                <Input
                  type="number"
                  value={formData.startingMaxEnergy}
                  onChange={(e) => handleNumericChange('startingMaxEnergy', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="10"
                />
              </div>

              <div>
                <Label>Energy Per Level</Label>
                <Input
                  type="number"
                  value={formData.energyPerLevel}
                  onChange={(e) => handleNumericChange('energyPerLevel', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="6"
                />
              </div>

              <div>
                <Label>Carry Weight</Label>
                <Input
                  type="number"
                  value={formData.carryWeight}
                  onChange={(e) => handleNumericChange('carryWeight', e.target.value)}
                  className="bg-stone-800 border-stone-700"
                  placeholder="50"
                />
              </div>

              <div className="col-span-2">
                <Label>Feat Tree</Label>
                <Select 
                  value={formData.featTree || "_none"} 
                  onValueChange={(value) => setFormData({ ...formData, featTree: value === "_none" ? "" : value })}
                >
                  <SelectTrigger className="bg-stone-800 border-stone-700" data-testid="select-species-feattree">
                    <SelectValue placeholder="Select a feat tree..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {featTrees.map((tree) => (
                      <SelectItem key={tree.id} value={tree.id}>
                        {tree.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 shrink-0 border-t border-stone-700">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-stone-800 border-stone-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !formData.name.trim()}
            className="bg-amber-700 hover:bg-amber-600"
            data-testid="button-save-species"
          >
            {isLoading ? 'Saving...' : (initialData ? 'Update Species' : 'Create Species')}
          </Button>
        </div>
      </DialogContent>

      <ImageBrowser
        open={showSpeciesImageBrowser}
        onOpenChange={setShowSpeciesImageBrowser}
        onSelect={(imageBase64) => {
          setFormData({ ...formData, defaultImage: imageBase64 });
        }}
        title="Select Species Image"
      />
    </Dialog>
  );
}

function SidePanelChat({ campaignId, role }: { campaignId: string; role: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ id: string; userId?: string; sender: string; text: string; createdAt: string; type?: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!campaignId) return;
    const fetchMessages = async () => {
      try {
        const data = await api.getChatMessages(campaignId);
        setMessages(data);
      } catch (err) {
        console.error('Failed to fetch chat messages:', err);
      }
    };
    fetchMessages();
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    const unsubscribe = gameWs.onMessage((data: any) => {
      if (data.type === 'chat_message' && data.message) {
        setMessages(prev => [...prev, data.message]);
      }
      if (data.type === 'chat_cleared') {
        setMessages([]);
      }
    });
    return () => { unsubscribe(); };
  }, [campaignId]);

  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, 100);
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    gameWs.sendChatMessage(user?.id || '', user?.username || '', message.trim(), 'chat');
    setMessage('');
  };

  const handleClearChat = async () => {
    try {
      await api.clearChatMessages(campaignId);
      setMessages([]);
      toast({ title: "Chat cleared" });
    } catch (err) {
      toast({ title: "Failed to clear chat", variant: "destructive" });
    }
  };

  const parseRollTotal = (text: string) => {
    const allMatches = text.matchAll(/=\s*(-?\d+)/g);
    const matches = Array.from(allMatches);
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return parseInt(lastMatch[1]);
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-xs text-stone-500">{messages.length} messages</span>
        {role === 'gm' && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearChat}
            className="border-red-700/50 hover:bg-red-900/30 text-red-400 hover:text-red-300 h-7 text-xs"
            data-testid="button-clear-chat"
          >
            <Trash2 className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1 px-4 mb-2" ref={scrollAreaRef}>
        <div className="space-y-2 py-2">
          {messages.map((msg, i) => {
            const isRoll = msg.type === 'roll' || msg.text?.includes('rolled');
            const rollTotal = isRoll ? parseRollTotal(msg.text) : null;
            const isMe = msg.userId === user?.id;
            return (
              <div key={msg.id || i} className={`${isRoll ? 'bg-amber-900/20 border border-amber-800/30 rounded-lg p-2' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className={`text-xs font-bold shrink-0 ${isMe ? 'text-amber-400' : 'text-stone-400'}`}>
                    {msg.sender}
                  </span>
                  <span className="text-xs text-stone-500 shrink-0">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className={`text-sm mt-0.5 ${isRoll ? 'text-amber-200 font-mono text-xs' : 'text-stone-300'}`}>
                  {msg.text}
                  {rollTotal !== null && (
                    <span className="ml-2 text-amber-400 font-bold">({rollTotal})</span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <div className="px-4 pb-3 pt-1 border-t border-stone-800">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="bg-stone-800 border-stone-700 text-stone-200 h-9 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            data-testid="input-chat-message"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!message.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white h-9"
            data-testid="button-send-chat"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SandboxSheetEditor({ 
  item, 
  campaignId,
  onClose, 
  isMobile,
  templates,
  role
}: { 
  item: { id: string; name: string; type: 'actor' | 'template'; templateId?: string | null; data?: string };
  campaignId: string;
  onClose: () => void;
  isMobile: boolean;
  templates: any[];
  role: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: 100 + Math.random() * 200, y: 80 + Math.random() * 100 });

  const templateData = useMemo(() => {
    try {
      if (item.type === 'template') {
        const liveTemplate = templates.find((t: any) => t.id === item.id);
        return JSON.parse((liveTemplate?.data || item.data) || '{}');
      }
      const linkedTemplate = templates.find((t: any) => t.id === item.templateId);
      return linkedTemplate ? JSON.parse(linkedTemplate.data || '{}') : {};
    } catch { return {}; }
  }, [item, templates]);

  const settings = templateData.settings || {};
  const [size, setSize] = useState({ 
    width: settings.defaultWidth || 400, 
    height: settings.defaultHeight || 450 
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(item.templateId || null);

  const [addingProperty, setAddingProperty] = useState(false);
  const [newPropKey, setNewPropKey] = useState('');
  const [newPropLabel, setNewPropLabel] = useState('');
  const [newPropType, setNewPropType] = useState<'text' | 'number' | 'checkbox' | 'textarea' | 'select'>('text');
  const [newPropOptions, setNewPropOptions] = useState('');
  const [newPropDefault, setNewPropDefault] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [draggingPropertyId, setDraggingPropertyId] = useState<string | null>(null);
  const [resizingPropertyId, setResizingPropertyId] = useState<string | null>(null);
  const [dragOverrides, setDragOverrides] = useState<Record<string, { x?: number; y?: number; width?: number; height?: number }>>({});
  const propDragStartRef = useRef({ x: 0, y: 0, propX: 0, propY: 0 });
  const propResizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const layoutSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [actorValues, setActorValues] = useState<Record<string, string>>(() => {
    try {
      const d = JSON.parse(item.data || '{}');
      return d.values || {};
    } catch { return {}; }
  });
  const actorSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateTemplateMutationSheet = useMutation({
    mutationFn: (data: any) => api.updateSandboxTemplate(campaignId, item.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-templates', campaignId] });
    },
  });

  const MIN_WIDTH = 280;
  const MIN_HEIGHT = 200;
  const MAX_WIDTH = 900;
  const MAX_HEIGHT = 800;

  const updateActorMutation = useMutation({
    mutationFn: (data: any) => api.updateSandboxActor(campaignId, item.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-actors', campaignId] });
    },
  });

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId || null);
    updateActorMutation.mutate({ templateId: templateId || null });
    toast({ title: templateId ? "Template assigned" : "Template removed" });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isMobile) return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent, direction: string) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setIsResizing(direction);
    resizeStartRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height, posX: position.x, posY: position.y };
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing) return;
    const dx = e.clientX - resizeStartRef.current.x;
    const dy = e.clientY - resizeStartRef.current.y;
    const s = resizeStartRef.current;
    let newW = s.width, newH = s.height, newX = s.posX, newY = s.posY;

    if (isResizing.includes('e')) newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, s.width + dx));
    if (isResizing.includes('s')) newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, s.height + dy));
    if (isResizing.includes('w')) {
      const dw = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, s.width - dx));
      newX = s.posX + (s.width - dw);
      newW = dw;
    }
    if (isResizing.includes('n')) {
      const dh = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, s.height - dy));
      newY = s.posY + (s.height - dh);
      newH = dh;
    }

    setSize({ width: newW, height: newH });
    setPosition({ x: newX, y: newY });
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    setIsResizing(null);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  };

  const properties: any[] = (templateData.properties || []).map((p: any, i: number) => ({
    x: 10,
    y: 10 + i * 50,
    width: 200,
    height: 40,
    labelFontSize: 11,
    valueFontSize: 13,
    labelPosition: 'top',
    ...p,
  }));

  const handleAddProperty = () => {
    if (!newPropKey.trim() || !newPropLabel.trim()) return;
    if (!/^[a-zA-Z0-9]+$/.test(newPropKey)) {
      toast({ title: "Invalid key", description: "Key must be alphanumeric only (no spaces or special characters)", variant: "destructive" });
      return;
    }
    if (properties.some((p: any) => p.key === newPropKey)) {
      toast({ title: "Duplicate key", description: "A property with this key already exists", variant: "destructive" });
      return;
    }
    const maxY = properties.length > 0
      ? Math.max(...properties.map((p: any) => (p.y ?? 0) + (p.height ?? 40)))
      : 0;
    const newProp = {
      id: crypto.randomUUID(),
      key: newPropKey.trim(),
      label: newPropLabel.trim(),
      type: newPropType,
      ...(newPropType === 'select' ? { options: newPropOptions.split(',').map(o => o.trim()).filter(Boolean) } : {}),
      defaultValue: newPropDefault,
      x: 10,
      y: maxY + 10,
      width: 200,
      height: 40,
      labelFontSize: 11,
      valueFontSize: 13,
      labelPosition: 'top' as const,
    };
    const newData = { ...templateData, properties: [...properties, newProp] };
    updateTemplateMutationSheet.mutate({ data: JSON.stringify(newData) });
    setAddingProperty(false);
    setNewPropKey('');
    setNewPropLabel('');
    setNewPropType('text');
    setNewPropOptions('');
    setNewPropDefault('');
    toast({ title: "Property added" });
  };

  const handleDeleteProperty = (propId: string) => {
    const newData = { ...templateData, properties: properties.filter((p: any) => p.id !== propId) };
    updateTemplateMutationSheet.mutate({ data: JSON.stringify(newData) });
    toast({ title: "Property deleted" });
  };

  const handleActorValueChange = (key: string, value: string) => {
    const newValues = { ...actorValues, [key]: value };
    setActorValues(newValues);
    if (actorSaveTimeoutRef.current) clearTimeout(actorSaveTimeoutRef.current);
    actorSaveTimeoutRef.current = setTimeout(() => {
      updateActorMutation.mutate({ data: JSON.stringify({ values: newValues }) });
    }, 500);
  };

  const saveLayoutDebounced = (updatedProperties: any[]) => {
    if (layoutSaveTimeoutRef.current) clearTimeout(layoutSaveTimeoutRef.current);
    layoutSaveTimeoutRef.current = setTimeout(() => {
      const newData = { ...templateData, properties: updatedProperties };
      updateTemplateMutationSheet.mutate({ data: JSON.stringify(newData) });
    }, 300);
  };

  const updatePropertyLayout = (propId: string, updates: Record<string, any>) => {
    const updatedProperties = properties.map((p: any) =>
      p.id === propId ? { ...p, ...updates } : p
    );
    saveLayoutDebounced(updatedProperties);
  };

  const handlePropPointerDown = (e: React.PointerEvent, prop: any) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDraggingPropertyId(prop.id);
    setSelectedPropertyId(prop.id);
    propDragStartRef.current = { x: e.clientX, y: e.clientY, propX: prop.x ?? 10, propY: prop.y ?? 10 };
  };

  const handlePropPointerMove = (e: React.PointerEvent, prop: any) => {
    if (draggingPropertyId === prop.id) {
      e.stopPropagation();
      const dx = e.clientX - propDragStartRef.current.x;
      const dy = e.clientY - propDragStartRef.current.y;
      const newX = Math.max(0, Math.round((propDragStartRef.current.propX + dx) / 10) * 10);
      const newY = Math.max(0, Math.round((propDragStartRef.current.propY + dy) / 10) * 10);
      setDragOverrides(prev => ({ ...prev, [prop.id]: { ...prev[prop.id], x: newX, y: newY } }));
    }
    if (resizingPropertyId === prop.id) {
      e.stopPropagation();
      const dx = e.clientX - propResizeStartRef.current.x;
      const dy = e.clientY - propResizeStartRef.current.y;
      const newW = Math.max(60, propResizeStartRef.current.w + dx);
      const newH = Math.max(20, propResizeStartRef.current.h + dy);
      setDragOverrides(prev => ({ ...prev, [prop.id]: { ...prev[prop.id], width: newW, height: newH } }));
    }
  };

  const handlePropPointerUp = (e: React.PointerEvent, prop: any) => {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    if (draggingPropertyId === prop.id) {
      const overrides = dragOverrides[prop.id];
      setDraggingPropertyId(null);
      setDragOverrides(prev => { const n = { ...prev }; delete n[prop.id]; return n; });
      if (overrides) updatePropertyLayout(prop.id, { x: overrides.x, y: overrides.y });
    }
    if (resizingPropertyId === prop.id) {
      const overrides = dragOverrides[prop.id];
      setResizingPropertyId(null);
      setDragOverrides(prev => { const n = { ...prev }; delete n[prop.id]; return n; });
      if (overrides) updatePropertyLayout(prop.id, { width: overrides.width, height: overrides.height });
    }
  };

  const handlePropResizeDown = (e: React.PointerEvent, prop: any) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget.parentElement as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setResizingPropertyId(prop.id);
    setSelectedPropertyId(prop.id);
    propResizeStartRef.current = { x: e.clientX, y: e.clientY, w: prop.width ?? 200, h: prop.height ?? 40 };
  };

  const selectedProperty = properties.find((p: any) => p.id === selectedPropertyId);

  const renderFieldPreview = (prop: any) => {
    const labelPos = prop.labelPosition || 'top';
    const lfs = prop.labelFontSize || 11;
    const vfs = prop.valueFontSize || 13;
    const isLeft = labelPos === 'left';
    const isHidden = labelPos === 'hidden';

    return (
      <div className={`flex ${isLeft ? 'flex-row items-center gap-2' : 'flex-col'} w-full h-full overflow-hidden p-1`}>
        {!isHidden && (
          <span className="text-purple-300 truncate shrink-0" style={{ fontSize: `${lfs}px` }}>{prop.label}</span>
        )}
        <div className="flex-1 min-w-0">
          {prop.type === 'checkbox' ? (
            <div className="flex items-center"><input type="checkbox" disabled className="h-4 w-4 accent-purple-600" /></div>
          ) : prop.type === 'select' ? (
            <div className="bg-stone-700/50 border border-stone-600/50 rounded px-1.5 truncate text-stone-400" style={{ fontSize: `${vfs}px` }}>Select ▾</div>
          ) : prop.type === 'textarea' ? (
            <div className="bg-stone-700/50 border border-stone-600/50 rounded px-1.5 text-stone-400 h-full min-h-[20px]" style={{ fontSize: `${vfs}px` }}>Text area</div>
          ) : (
            <div className="bg-stone-700/50 border border-stone-600/50 rounded px-1.5 truncate text-stone-400" style={{ fontSize: `${vfs}px` }}>
              {prop.type === 'number' ? '0' : 'abc'}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSheetBody = () => {
    if (item.type === 'template') {
      const canvasHeight = properties.length > 0
        ? Math.max(300, Math.max(...properties.map((p: any) => (p.y ?? 0) + (p.height ?? 40))) + 60)
        : 300;

      return (
        <div className="space-y-3" data-testid="template-properties-editor">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-purple-300">Properties</h3>
            {!addingProperty && (
              <Button
                size="sm"
                onClick={() => setAddingProperty(true)}
                className="h-7 bg-purple-700 hover:bg-purple-600 text-white text-xs"
                data-testid="button-add-property"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Property
              </Button>
            )}
          </div>

          {addingProperty && (
            <div className="bg-stone-800/50 border border-purple-800/40 rounded-lg p-3 space-y-3" data-testid="add-property-form">
              <div className="space-y-1.5">
                <Label className="text-stone-400 text-xs">Key (alphanumeric, no spaces)</Label>
                <Input
                  value={newPropKey}
                  onChange={(e) => setNewPropKey(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  placeholder="e.g. hitPoints"
                  className="bg-stone-900 border-stone-600 text-stone-200 h-8 text-sm"
                  data-testid="input-property-key"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-stone-400 text-xs">Label (display name)</Label>
                <Input
                  value={newPropLabel}
                  onChange={(e) => setNewPropLabel(e.target.value)}
                  placeholder="e.g. Hit Points"
                  className="bg-stone-900 border-stone-600 text-stone-200 h-8 text-sm"
                  data-testid="input-property-label"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-stone-400 text-xs">Type</Label>
                <Select value={newPropType} onValueChange={(v: any) => setNewPropType(v)}>
                  <SelectTrigger className="bg-stone-900 border-stone-600 text-stone-200 h-8 text-sm" data-testid="select-property-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="text" className="text-stone-200">Text</SelectItem>
                    <SelectItem value="number" className="text-stone-200">Number</SelectItem>
                    <SelectItem value="checkbox" className="text-stone-200">Checkbox</SelectItem>
                    <SelectItem value="textarea" className="text-stone-200">Textarea</SelectItem>
                    <SelectItem value="select" className="text-stone-200">Select</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newPropType === 'select' && (
                <div className="space-y-1.5">
                  <Label className="text-stone-400 text-xs">Options (comma-separated)</Label>
                  <Input
                    value={newPropOptions}
                    onChange={(e) => setNewPropOptions(e.target.value)}
                    placeholder="e.g. Option 1, Option 2, Option 3"
                    className="bg-stone-900 border-stone-600 text-stone-200 h-8 text-sm"
                    data-testid="input-property-options"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-stone-400 text-xs">Default Value</Label>
                <Input
                  value={newPropDefault}
                  onChange={(e) => setNewPropDefault(e.target.value)}
                  placeholder="Default value..."
                  className="bg-stone-900 border-stone-600 text-stone-200 h-8 text-sm"
                  data-testid="input-property-default"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setAddingProperty(false); setNewPropKey(''); setNewPropLabel(''); setNewPropType('text'); setNewPropOptions(''); setNewPropDefault(''); }} className="flex-1 border-stone-600 text-stone-400 h-7 text-xs" data-testid="button-cancel-property">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddProperty} disabled={!newPropKey.trim() || !newPropLabel.trim()} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs" data-testid="button-save-property">
                  Save
                </Button>
              </div>
            </div>
          )}

          {properties.length === 0 && !addingProperty && (
            <div className="text-stone-500 text-center italic border border-dashed border-stone-700 rounded-lg p-6 text-sm">
              No properties defined. Add properties to customize actor sheets.
            </div>
          )}

          {properties.length > 0 && (
            <div
              className="relative rounded-lg border border-stone-700/50 overflow-auto"
              style={{
                minHeight: `${canvasHeight}px`,
                backgroundImage: 'linear-gradient(to right, rgba(120,113,108,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,113,108,0.15) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                backgroundColor: 'rgba(28, 25, 23, 0.6)',
              }}
              data-testid="template-canvas"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedPropertyId(null);
              }}
            >
              {properties.map((prop: any) => {
                const overrides = dragOverrides[prop.id] || {};
                const px = overrides.x ?? prop.x ?? 10;
                const py = overrides.y ?? prop.y ?? 10;
                const pw = overrides.width ?? prop.width ?? 200;
                const ph = overrides.height ?? prop.height ?? 40;
                const isSelected = selectedPropertyId === prop.id;
                const isDraggingThis = draggingPropertyId === prop.id;
                const isResizingThis = resizingPropertyId === prop.id;

                return (
                  <div
                    key={prop.id}
                    className={`absolute select-none ${isDraggingThis || isResizingThis ? 'z-20' : 'z-10'}`}
                    style={{
                      left: `${px}px`,
                      top: `${py}px`,
                      width: `${pw}px`,
                      height: `${ph}px`,
                    }}
                    data-testid={`canvas-property-${prop.key}`}
                    onPointerDown={(e) => handlePropPointerDown(e, prop)}
                    onPointerMove={(e) => handlePropPointerMove(e, prop)}
                    onPointerUp={(e) => handlePropPointerUp(e, prop)}
                  >
                    <div
                      className={`w-full h-full rounded border cursor-grab active:cursor-grabbing transition-colors ${
                        isSelected
                          ? 'border-purple-400 bg-purple-900/20 shadow-lg shadow-purple-900/20'
                          : 'border-stone-600/50 bg-stone-800/60 hover:border-stone-500/70'
                      }`}
                      data-testid={`button-select-property-${prop.key}`}
                    >
                      {renderFieldPreview(prop)}
                    </div>
                    <div
                      className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-purple-500/40 hover:bg-purple-400/60 rounded-tl-sm"
                      onPointerDown={(e) => handlePropResizeDown(e, prop)}
                      data-testid={`resize-property-${prop.key}`}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {selectedProperty && (
            <div className="bg-stone-800/80 border border-purple-800/40 rounded-lg p-3 space-y-3" data-testid="property-settings-panel">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-purple-300">
                  Settings: <span className="font-mono text-purple-400">{selectedProperty.key}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedPropertyId(null)}
                  className="h-5 w-5 text-stone-500 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">X</Label>
                  <Input
                    type="number"
                    value={selectedProperty.x ?? 10}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { x: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid={`input-prop-x-${selectedProperty.key}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">Y</Label>
                  <Input
                    type="number"
                    value={selectedProperty.y ?? 10}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { y: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid={`input-prop-y-${selectedProperty.key}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">Width</Label>
                  <Input
                    type="number"
                    value={selectedProperty.width ?? 200}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { width: Math.max(60, parseInt(e.target.value) || 60) })}
                    className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid={`input-prop-width-${selectedProperty.key}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">Height</Label>
                  <Input
                    type="number"
                    value={selectedProperty.height ?? 40}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { height: Math.max(20, parseInt(e.target.value) || 20) })}
                    className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid={`input-prop-height-${selectedProperty.key}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">Label Font</Label>
                  <Input
                    type="number"
                    min={8}
                    max={24}
                    value={selectedProperty.labelFontSize ?? 11}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { labelFontSize: Math.min(24, Math.max(8, parseInt(e.target.value) || 11)) })}
                    className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid={`input-prop-labelfont-${selectedProperty.key}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-stone-500 text-[10px]">Value Font</Label>
                  <Input
                    type="number"
                    min={8}
                    max={24}
                    value={selectedProperty.valueFontSize ?? 13}
                    onChange={(e) => updatePropertyLayout(selectedProperty.id, { valueFontSize: Math.min(24, Math.max(8, parseInt(e.target.value) || 13)) })}
                    className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
                    data-testid={`input-prop-valuefont-${selectedProperty.key}`}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-stone-500 text-[10px]">Label Position</Label>
                <Select
                  value={selectedProperty.labelPosition || 'top'}
                  onValueChange={(v) => updatePropertyLayout(selectedProperty.id, { labelPosition: v })}
                >
                  <SelectTrigger className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs" data-testid={`select-prop-labelpos-${selectedProperty.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="top" className="text-stone-200">Top</SelectItem>
                    <SelectItem value="left" className="text-stone-200">Left</SelectItem>
                    <SelectItem value="hidden" className="text-stone-200">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { handleDeleteProperty(selectedProperty.id); setSelectedPropertyId(null); }}
                className="w-full border-red-800/50 text-red-400 hover:bg-red-900/20 hover:text-red-300 h-7 text-xs"
                data-testid={`button-delete-property-${selectedProperty.id}`}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Delete Property
              </Button>
            </div>
          )}
        </div>
      );
    }

    const linkedTemplate = templates.find((t: any) => t.id === selectedTemplateId);
    let actorProperties: any[] = [];
    if (linkedTemplate) {
      try {
        const td = JSON.parse(linkedTemplate.data || '{}');
        actorProperties = (td.properties || []).map((p: any, i: number) => ({
          x: 10, y: 10 + i * 50, width: 200, height: 40,
          labelFontSize: 11, valueFontSize: 13, labelPosition: 'top',
          ...p,
        }));
      } catch {}
    }

    if (actorProperties.length === 0) {
      return (
        <div className="text-stone-500 text-center italic border border-dashed border-stone-700 rounded-lg p-8 text-sm" data-testid="actor-no-properties">
          {selectedTemplateId ? 'No properties defined in template' : 'Assign a template to see properties'}
        </div>
      );
    }

    const containerHeight = Math.max(200, Math.max(...actorProperties.map((p: any) => (p.y ?? 0) + (p.height ?? 40))) + 20);

    return (
      <div className="relative" style={{ minHeight: `${containerHeight}px` }} data-testid="actor-properties-display">
        {actorProperties.map((prop: any) => {
          const val = actorValues[prop.key] ?? prop.defaultValue ?? '';
          const px = prop.x ?? 10;
          const py = prop.y ?? 0;
          const pw = prop.width ?? 200;
          const ph = prop.height ?? 40;
          const lfs = prop.labelFontSize ?? 11;
          const vfs = prop.valueFontSize ?? 13;
          const labelPos = prop.labelPosition || 'top';
          const isLeft = labelPos === 'left';
          const isHidden = labelPos === 'hidden';

          return (
            <div
              key={prop.id}
              className="absolute"
              style={{ left: `${px}px`, top: `${py}px`, width: `${pw}px`, height: `${ph}px` }}
              data-testid={`actor-property-${prop.key}`}
            >
              <div className={`flex ${isLeft ? 'flex-row items-center gap-2' : 'flex-col'} w-full h-full`}>
                {!isHidden && (
                  <Label className="text-stone-400 truncate shrink-0" style={{ fontSize: `${lfs}px` }}>{prop.label}</Label>
                )}
                <div className="flex-1 min-w-0">
                  {prop.type === 'text' && (
                    <Input
                      value={val}
                      onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                      className="bg-stone-800 border-stone-700 text-stone-200 h-full w-full"
                      style={{ fontSize: `${vfs}px` }}
                      data-testid={`input-actor-${prop.key}`}
                    />
                  )}
                  {prop.type === 'number' && (
                    <Input
                      type="number"
                      value={val}
                      onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                      className="bg-stone-800 border-stone-700 text-stone-200 h-full w-full"
                      style={{ fontSize: `${vfs}px` }}
                      data-testid={`input-actor-${prop.key}`}
                    />
                  )}
                  {prop.type === 'checkbox' && (
                    <div className="flex items-center h-full">
                      <input
                        type="checkbox"
                        checked={val === 'true'}
                        onChange={(e) => handleActorValueChange(prop.key, e.target.checked ? 'true' : 'false')}
                        className="h-4 w-4 accent-amber-600"
                        data-testid={`checkbox-actor-${prop.key}`}
                      />
                    </div>
                  )}
                  {prop.type === 'textarea' && (
                    <Textarea
                      value={val}
                      onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                      className="bg-stone-800 border-stone-700 text-stone-200 h-full w-full resize-none"
                      style={{ fontSize: `${vfs}px` }}
                      data-testid={`textarea-actor-${prop.key}`}
                    />
                  )}
                  {prop.type === 'select' && (
                    <Select value={val || '__empty__'} onValueChange={(v) => handleActorValueChange(prop.key, v === '__empty__' ? '' : v)}>
                      <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 h-full w-full" style={{ fontSize: `${vfs}px` }} data-testid={`select-actor-${prop.key}`}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent className="bg-stone-800 border-stone-700">
                        <SelectItem value="__empty__" className="text-stone-400">None</SelectItem>
                        {(prop.options || []).map((opt: string) => (
                          <SelectItem key={opt} value={opt} className="text-stone-200">{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMobileActorBody = () => {
    const linkedTemplate = templates.find((t: any) => t.id === selectedTemplateId);
    let actorProperties: any[] = [];
    if (linkedTemplate) {
      try {
        const td = JSON.parse(linkedTemplate.data || '{}');
        actorProperties = (td.properties || []).map((p: any, i: number) => ({
          x: 10, y: 10 + i * 50, width: 200, height: 40,
          labelFontSize: 11, valueFontSize: 13, labelPosition: 'top',
          ...p,
        }));
      } catch {}
    }

    if (actorProperties.length === 0) {
      return (
        <div className="text-stone-500 text-center italic border border-dashed border-stone-700 rounded-lg p-8 text-sm" data-testid="actor-no-properties-mobile">
          {selectedTemplateId ? 'No properties defined in template' : 'Assign a template to see properties'}
        </div>
      );
    }

    return (
      <div className="space-y-3" data-testid="actor-properties-display-mobile">
        {actorProperties.map((prop: any) => {
          const val = actorValues[prop.key] ?? prop.defaultValue ?? '';
          const lfs = prop.labelFontSize ?? 11;
          const vfs = prop.valueFontSize ?? 13;

          return (
            <div key={prop.id} className="space-y-1" data-testid={`actor-property-mobile-${prop.key}`}>
              <Label className="text-stone-400" style={{ fontSize: `${lfs}px` }}>{prop.label}</Label>
              {prop.type === 'text' && (
                <Input
                  value={val}
                  onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                  className="bg-stone-800 border-stone-700 text-stone-200 h-8"
                  style={{ fontSize: `${vfs}px` }}
                  data-testid={`input-actor-${prop.key}`}
                />
              )}
              {prop.type === 'number' && (
                <Input
                  type="number"
                  value={val}
                  onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                  className="bg-stone-800 border-stone-700 text-stone-200 h-8"
                  style={{ fontSize: `${vfs}px` }}
                  data-testid={`input-actor-${prop.key}`}
                />
              )}
              {prop.type === 'checkbox' && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={val === 'true'}
                    onChange={(e) => handleActorValueChange(prop.key, e.target.checked ? 'true' : 'false')}
                    className="h-4 w-4 accent-amber-600"
                    data-testid={`checkbox-actor-${prop.key}`}
                  />
                </div>
              )}
              {prop.type === 'textarea' && (
                <Textarea
                  value={val}
                  onChange={(e) => handleActorValueChange(prop.key, e.target.value)}
                  className="bg-stone-800 border-stone-700 text-stone-200 min-h-[60px]"
                  style={{ fontSize: `${vfs}px` }}
                  data-testid={`textarea-actor-${prop.key}`}
                />
              )}
              {prop.type === 'select' && (
                <Select value={val || '__empty__'} onValueChange={(v) => handleActorValueChange(prop.key, v === '__empty__' ? '' : v)}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 h-8" style={{ fontSize: `${vfs}px` }} data-testid={`select-actor-${prop.key}`}>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="__empty__" className="text-stone-400">None</SelectItem>
                    {(prop.options || []).map((opt: string) => (
                      <SelectItem key={opt} value={opt} className="text-stone-200">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-stone-900 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-stone-700">
          <div className="flex items-center gap-2">
            {item.type === 'actor' ? (
              <User className="h-5 w-5 text-amber-500" />
            ) : (
              <ScrollText className="h-5 w-5 text-purple-400" />
            )}
            <h2 className={`font-bold text-lg ${item.type === 'actor' ? 'text-amber-400' : 'text-purple-400'}`}>
              {item.name}
            </h2>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.type === 'actor' ? 'text-amber-500/60 bg-amber-900/20' : 'text-purple-400/60 bg-purple-900/20'}`}>
              {item.type === 'actor' ? 'Actor' : 'Actor Template'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="text-stone-400 hover:text-white" data-testid="button-collapse-sheet-mobile">
              {collapsed ? <ChevronRight className="h-5 w-5 rotate-90" /> : <Minus className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-stone-400 hover:text-white" data-testid="button-close-sheet-mobile">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {!collapsed && <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {item.type === 'actor' && role === 'gm' && (
            <div className="mb-4 space-y-2">
              <Label className="text-stone-400 text-sm">Template</Label>
              <Select value={selectedTemplateId || '__none__'} onValueChange={(v) => handleTemplateChange(v === '__none__' ? '' : v)}>
                <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent className="bg-stone-800 border-stone-700">
                  <SelectItem value="__none__" className="text-stone-400">No template</SelectItem>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id} className="text-stone-200">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {item.type === 'actor' ? renderMobileActorBody() : renderSheetBody()}
        </div>}
      </div>
    );
  }

  const resizeHandleProps = (direction: string) => ({
    onPointerDown: (e: React.PointerEvent) => handleResizePointerDown(e, direction),
    onPointerMove: handleResizePointerMove,
    onPointerUp: handleResizePointerUp,
  });

  const edgeCls = "absolute bg-transparent hover:bg-amber-500/20 transition-colors z-10";

  return (
    <div
      className="fixed z-[45] pointer-events-auto"
      style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${size.width}px`, height: collapsed ? 'auto' : `${size.height}px` }}
    >
      <div className={`bg-stone-900/95 border rounded-xl shadow-2xl backdrop-blur-sm overflow-hidden flex flex-col h-full ${item.type === 'actor' ? 'border-amber-800/50' : 'border-purple-800/50'}`}>
        <div 
          className={`flex items-center justify-between px-3 py-2 cursor-move select-none shrink-0 ${item.type === 'actor' ? 'bg-amber-900/30 border-b border-amber-800/30' : 'bg-purple-900/30 border-b border-purple-800/30'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={() => setCollapsed(!collapsed)}
        >
          <div className="flex items-center gap-2 min-w-0">
            {item.type === 'actor' ? (
              <User className="h-4 w-4 text-amber-500 shrink-0" />
            ) : (
              <ScrollText className="h-4 w-4 text-purple-400 shrink-0" />
            )}
            <span className={`font-medium text-sm truncate ${item.type === 'actor' ? 'text-amber-300' : 'text-purple-300'}`}>
              {item.name}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${item.type === 'actor' ? 'text-amber-500/60 bg-amber-900/20' : 'text-purple-400/60 bg-purple-900/20'}`}>
              {item.type === 'actor' ? 'Actor' : 'Actor Template'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setCollapsed(!collapsed)} 
              className="h-6 w-6 text-stone-400 hover:text-white"
              data-testid="button-collapse-sheet"
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5 rotate-90" /> : <Minus className="h-3.5 w-3.5" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose} 
              className="h-6 w-6 text-stone-400 hover:text-white"
              data-testid="button-close-sheet"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        
        {!collapsed && (
          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            {item.type === 'actor' && role === 'gm' && (
              <div className="mb-4 space-y-2">
                <Label className="text-stone-400 text-sm">Template</Label>
                <Select value={selectedTemplateId || '__none__'} onValueChange={(v) => handleTemplateChange(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="bg-stone-800 border-stone-700 text-stone-200 h-9">
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent className="bg-stone-800 border-stone-700">
                    <SelectItem value="__none__" className="text-stone-400">No template</SelectItem>
                    {templates.map((t: any) => (
                      <SelectItem key={t.id} value={t.id} className="text-stone-200">
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {renderSheetBody()}
          </div>
        )}
      </div>

      {!collapsed && settings.allowResize !== false && (
        <>
          <div className={`${edgeCls} top-0 left-2 right-2 h-1 cursor-n-resize`} {...resizeHandleProps('n')} />
          <div className={`${edgeCls} bottom-0 left-2 right-2 h-1 cursor-s-resize`} {...resizeHandleProps('s')} />
          <div className={`${edgeCls} left-0 top-2 bottom-2 w-1 cursor-w-resize`} {...resizeHandleProps('w')} />
          <div className={`${edgeCls} right-0 top-2 bottom-2 w-1 cursor-e-resize`} {...resizeHandleProps('e')} />
          <div className={`${edgeCls} top-0 left-0 w-3 h-3 cursor-nw-resize`} {...resizeHandleProps('nw')} />
          <div className={`${edgeCls} top-0 right-0 w-3 h-3 cursor-ne-resize`} {...resizeHandleProps('ne')} />
          <div className={`${edgeCls} bottom-0 left-0 w-3 h-3 cursor-sw-resize`} {...resizeHandleProps('sw')} />
          <div className={`${edgeCls} bottom-0 right-0 w-3 h-3 cursor-se-resize`} {...resizeHandleProps('se')} data-testid="resize-handle-se" />
        </>
      )}
    </div>
  );
}

function SandboxCharactersContent({ 
  campaignId, 
  onOpenActor, 
  onOpenTemplate 
}: { 
  campaignId: string; 
  onOpenActor: (actor: any) => void; 
  onOpenTemplate: (template: any) => void; 
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'actor' | 'template'>('actor');
  const [newFolderName, setNewFolderName] = useState('');
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [templateSettingsOpen, setTemplateSettingsOpen] = useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['sandbox-templates', campaignId],
    queryFn: () => api.getSandboxTemplates(campaignId),
  });

  const { data: actors = [] } = useQuery({
    queryKey: ['sandbox-actors', campaignId],
    queryFn: () => api.getSandboxActors(campaignId),
  });

  const { data: folders = [] } = useQuery({
    queryKey: ['sandbox-folders', campaignId],
    queryFn: () => api.getSandboxFolders(campaignId),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: { name: string; folderId?: string }) => api.createSandboxTemplate(campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-templates', campaignId] });
      setCreateOpen(false);
      setNewName('');
      toast({ title: "Template created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create template", description: error?.message || "Unknown error", variant: "destructive" });
    },
  });

  const createActorMutation = useMutation({
    mutationFn: (data: { name: string; folderId?: string }) => api.createSandboxActor(campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-actors', campaignId] });
      setCreateOpen(false);
      setNewName('');
      toast({ title: "Actor created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create actor", description: error?.message || "Unknown error", variant: "destructive" });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => api.createSandboxFolder(campaignId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-folders', campaignId] });
      setCreateFolderOpen(false);
      setNewFolderName('');
      toast({ title: "Folder created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create folder", description: error?.message || "Unknown error", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.deleteSandboxTemplate(campaignId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-templates', campaignId] });
      toast({ title: "Template deleted" });
    },
  });

  const deleteActorMutation = useMutation({
    mutationFn: (id: string) => api.deleteSandboxActor(campaignId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-actors', campaignId] });
      toast({ title: "Actor deleted" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.deleteSandboxFolder(campaignId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-folders', campaignId] });
      toast({ title: "Folder deleted" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateSandboxTemplate(campaignId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-templates', campaignId] });
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    if (newType === 'template') {
      createTemplateMutation.mutate({ name: newName.trim() });
    } else {
      createActorMutation.mutate({ name: newName.trim() });
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const rootFolders = folders.filter((f: any) => !f.parentId);
  const rootActors = actors.filter((a: any) => !a.folderId);
  const rootTemplates = templates.filter((t: any) => !t.folderId);

  const renderTemplateSettings = (template: any) => {
    let currentData: any = {};
    try { currentData = JSON.parse(template.data || '{}'); } catch {}
    const currentSettings = currentData.settings || {};
    const defaultWidth = currentSettings.defaultWidth || 400;
    const defaultHeight = currentSettings.defaultHeight || 450;
    const allowResize = currentSettings.allowResize !== false;

    const saveSettings = (newSettings: any) => {
      const newData = { ...currentData, settings: newSettings, properties: currentData.properties || [] };
      updateTemplateMutation.mutate({ id: template.id, data: { data: JSON.stringify(newData) } });
      toast({ title: "Template settings saved" });
    };

    return (
      <div className="bg-stone-800/80 border border-purple-800/40 rounded-lg p-3 space-y-3 mt-1 mb-1" data-testid={`template-settings-${template.id}`}>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-purple-300">Template Settings</h4>
          <Button variant="ghost" size="icon" onClick={() => setTemplateSettingsOpen(null)} className="h-5 w-5 text-stone-400 hover:text-white" data-testid="button-close-template-settings">
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label className="text-stone-400 text-xs">Default Width ({MIN_SHEET_WIDTH}-{MAX_SHEET_WIDTH})</Label>
          <Input
            type="number"
            min={MIN_SHEET_WIDTH}
            max={MAX_SHEET_WIDTH}
            defaultValue={defaultWidth}
            onBlur={(e) => {
              const v = Math.min(MAX_SHEET_WIDTH, Math.max(MIN_SHEET_WIDTH, parseInt(e.target.value) || 400));
              saveSettings({ ...currentSettings, defaultWidth: v, defaultHeight: currentSettings.defaultHeight || 450, allowResize: currentSettings.allowResize !== false });
            }}
            className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
            data-testid="input-template-default-width"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-stone-400 text-xs">Default Height ({MIN_SHEET_HEIGHT}-{MAX_SHEET_HEIGHT})</Label>
          <Input
            type="number"
            min={MIN_SHEET_HEIGHT}
            max={MAX_SHEET_HEIGHT}
            defaultValue={defaultHeight}
            onBlur={(e) => {
              const v = Math.min(MAX_SHEET_HEIGHT, Math.max(MIN_SHEET_HEIGHT, parseInt(e.target.value) || 450));
              saveSettings({ ...currentSettings, defaultWidth: currentSettings.defaultWidth || 400, defaultHeight: v, allowResize: currentSettings.allowResize !== false });
            }}
            className="bg-stone-900 border-stone-600 text-stone-200 h-7 text-xs"
            data-testid="input-template-default-height"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            defaultChecked={allowResize}
            onChange={(e) => {
              saveSettings({ ...currentSettings, defaultWidth: currentSettings.defaultWidth || 400, defaultHeight: currentSettings.defaultHeight || 450, allowResize: e.target.checked });
            }}
            className="h-4 w-4 accent-purple-600"
            data-testid="checkbox-template-allow-resize"
          />
          <Label className="text-stone-400 text-xs">Allow resize</Label>
        </div>
      </div>
    );
  };

  const MIN_SHEET_WIDTH = 280;
  const MAX_SHEET_WIDTH = 900;
  const MIN_SHEET_HEIGHT = 200;
  const MAX_SHEET_HEIGHT = 800;

  const renderItem = (item: any, type: 'actor' | 'template') => (
    <div key={item.id}>
      <div
        className="flex items-center justify-between py-2 px-3 bg-stone-800/30 border border-stone-700/50 rounded-lg hover:bg-stone-800/60 transition-colors cursor-pointer group"
        onClick={() => type === 'actor' ? onOpenActor(item) : onOpenTemplate(item)}
        draggable={type === 'actor'}
        onDragStart={(e) => {
          if (type === 'actor') {
            e.dataTransfer.setData('application/sandbox-actor', JSON.stringify({ id: item.id, name: item.name }));
            e.dataTransfer.effectAllowed = 'copy';
          }
        }}
        data-testid={`sandbox-${type}-${item.id}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {type === 'actor' ? (
            <User className="h-4 w-4 text-amber-500 shrink-0" />
          ) : (
            <ScrollText className="h-4 w-4 text-purple-400 shrink-0" />
          )}
          <span className="text-stone-200 text-sm font-medium truncate">{item.name}</span>
          {type === 'actor' && item.templateId && (
            <span className="text-[10px] text-stone-500 bg-stone-700/50 px-1.5 py-0.5 rounded shrink-0">
              {templates.find((t: any) => t.id === item.templateId)?.name || 'Template'}
            </span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${type === 'actor' ? 'text-amber-500/60 bg-amber-900/20' : 'text-purple-400/60 bg-purple-900/20'}`}>
            {type === 'actor' ? 'Actor' : 'Actor Template'}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {type === 'template' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); setTemplateSettingsOpen(templateSettingsOpen === item.id ? null : item.id); }}
              className="h-7 w-7 text-stone-600 hover:text-purple-400 hover:bg-purple-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid={`button-settings-template-${item.id}`}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); type === 'actor' ? deleteActorMutation.mutate(item.id) : deleteTemplateMutation.mutate(item.id); }}
            className="h-7 w-7 text-stone-600 hover:text-red-400 hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`button-delete-${type}-${item.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {type === 'template' && templateSettingsOpen === item.id && renderTemplateSettings(item)}
    </div>
  );

  const renderFolder = (folder: any, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = folders.filter((f: any) => f.parentId === folder.id);
    const folderActors = actors.filter((a: any) => a.folderId === folder.id);
    const folderTemplates = templates.filter((t: any) => t.folderId === folder.id);
    
    return (
      <div key={folder.id} data-testid={`sandbox-folder-${folder.id}`}>
        <div 
          className="flex items-center justify-between py-2 px-3 hover:bg-stone-800/40 rounded-lg cursor-pointer group transition-colors"
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => toggleFolder(folder.id)}
        >
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-3.5 w-3.5 text-stone-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            <FolderOpen className="h-4 w-4 text-amber-600" />
            <span className="text-stone-300 text-sm font-medium">{folder.name}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); deleteFolderMutation.mutate(folder.id); }}
            className="h-7 w-7 text-stone-600 hover:text-red-400 hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`button-delete-folder-${folder.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {isExpanded && (
          <div className="ml-4 space-y-1 mt-1">
            {childFolders.map((f: any) => renderFolder(f, depth + 1))}
            {folderActors.map((a: any) => renderItem(a, 'actor'))}
            {folderTemplates.map((t: any) => renderItem(t, 'template'))}
            {childFolders.length === 0 && folderActors.length === 0 && folderTemplates.length === 0 && (
              <div className="text-center py-3 text-stone-600 text-xs italic">Empty folder</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-2 mb-3">
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => { setCreateOpen(!createOpen); setNewName(''); }}
            className="flex-1 bg-amber-700 hover:bg-amber-600 text-white"
            data-testid="button-create-character"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Create
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setCreateFolderOpen(!createFolderOpen); setNewFolderName(''); }}
            className="border-stone-600 text-stone-300 hover:bg-stone-800"
            data-testid="button-create-folder"
          >
            <FolderOpen className="h-4 w-4 mr-1.5" /> Folder
          </Button>
        </div>

        {createOpen && (
          <div className="bg-stone-800/50 border border-stone-700 rounded-lg p-3 space-y-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name..."
              className="bg-stone-900 border-stone-600 text-stone-200 h-9 text-sm"
              data-testid="input-sandbox-name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setNewType('actor')}
                className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                  newType === 'actor' 
                    ? 'bg-amber-700 text-white' 
                    : 'bg-stone-700 text-stone-400 hover:text-stone-200'
                }`}
                data-testid="toggle-type-actor"
              >
                Actor
              </button>
              <button
                onClick={() => setNewType('template')}
                className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                  newType === 'template' 
                    ? 'bg-purple-700 text-white' 
                    : 'bg-stone-700 text-stone-400 hover:text-stone-200'
                }`}
                data-testid="toggle-type-template"
              >
                Actor Template
              </button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} className="flex-1 border-stone-600 text-stone-400 h-8">
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white h-8" data-testid="button-confirm-create">
                Create
              </Button>
            </div>
          </div>
        )}

        {createFolderOpen && (
          <div className="bg-stone-800/50 border border-stone-700 rounded-lg p-3 space-y-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              className="bg-stone-900 border-stone-600 text-stone-200 h-9 text-sm"
              data-testid="input-folder-name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && newFolderName.trim() && createFolderMutation.mutate(newFolderName.trim())}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreateFolderOpen(false)} className="flex-1 border-stone-600 text-stone-400 h-8">
                Cancel
              </Button>
              <Button size="sm" onClick={() => newFolderName.trim() && createFolderMutation.mutate(newFolderName.trim())} disabled={!newFolderName.trim()} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white h-8" data-testid="button-confirm-folder">
                Create
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
        {rootFolders.map((f: any) => renderFolder(f))}
        {rootActors.map((a: any) => renderItem(a, 'actor'))}
        {rootTemplates.map((t: any) => renderItem(t, 'template'))}
        {rootFolders.length === 0 && rootActors.length === 0 && rootTemplates.length === 0 && (
          <div className="text-center py-12 text-stone-600 italic text-sm">
            No characters yet. Click Create to add one.
          </div>
        )}
      </div>
    </div>
  );
}

function NotesFolderBrowser({ campaignId, onSelectNote }: { campaignId: string; onSelectNote: (noteId: string) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const { data: folders = [] } = useQuery({
    queryKey: ['note-folders', campaignId],
    queryFn: () => api.getNoteFolders(campaignId),
  });

  const { data: allNotes = [] } = useQuery({
    queryKey: ['notes', campaignId],
    queryFn: () => api.getNotes(undefined, campaignId),
  });

  const createNoteMutation = useMutation({
    mutationFn: (folderId?: string) => api.createNote({ title: 'Untitled', content: '', campaignId, folderId: folderId || undefined }),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['notes', campaignId] });
      onSelectNote(note.id);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => api.createNoteFolder({ name, campaignId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note-folders', campaignId] });
      setNewFolderMode(false);
      setNewFolderName('');
      toast({ title: 'Folder created' });
    },
  });

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const rootFolders = folders.filter((f: any) => !f.parentId).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const unfiledNotes = allNotes.filter((n: any) => !n.folderId);

  const renderFolder = (folder: any, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = folders.filter((f: any) => f.parentId === folder.id).sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const folderNotes = allNotes.filter((n: any) => n.folderId === folder.id);
    const hasContent = childFolders.length > 0 || folderNotes.length > 0;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer hover:bg-stone-800/60 text-stone-300 text-sm transition-colors`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => toggleFolder(folder.id)}
          data-testid={`notes-browser-folder-${folder.id}`}
        >
          {hasContent ? (
            isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-stone-500 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-stone-500 shrink-0" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className={`h-4 w-4 shrink-0 ${folder.color ? `text-${folder.color}-500` : 'text-amber-500/70'}`} />
          ) : (
            <Folder className={`h-4 w-4 shrink-0 ${folder.color ? `text-${folder.color}-500` : 'text-stone-500'}`} />
          )}
          <span className="truncate">{folder.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); createNoteMutation.mutate(folder.id); }}
            className="ml-auto p-0.5 rounded hover:bg-stone-700 text-stone-500 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`notes-browser-new-note-in-folder-${folder.id}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {isExpanded && (
          <div>
            {childFolders.map((cf: any) => renderFolder(cf, level + 1))}
            {folderNotes.map((note: any) => (
              <div
                key={note.id}
                className="flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer hover:bg-stone-800/60 text-stone-300 text-sm transition-colors"
                style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                onClick={() => onSelectNote(note.id)}
                data-testid={`notes-browser-note-${note.id}`}
              >
                <FileText className="h-3.5 w-3.5 text-stone-500 shrink-0" />
                <span className="truncate">{note.title || 'Untitled'}</span>
                {note.isPinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2" data-testid="notes-folder-browser">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => createNoteMutation.mutate(undefined)}
          className="flex-1 bg-amber-700/80 hover:bg-amber-600 text-white h-7 text-xs"
          data-testid="notes-browser-new-note"
        >
          <Plus className="h-3 w-3 mr-1" /> New Note
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setNewFolderMode(true)}
          className="border-stone-700 hover:bg-stone-800 text-stone-300 h-7 text-xs"
          data-testid="notes-browser-new-folder"
        >
          <FolderPlus className="h-3 w-3 mr-1" /> Folder
        </Button>
      </div>

      {newFolderMode && (
        <div className="flex items-center gap-1.5">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name..."
            className="h-7 text-xs bg-stone-800 border-stone-700 text-stone-200"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim());
              if (e.key === 'Escape') { setNewFolderMode(false); setNewFolderName(''); }
            }}
            data-testid="notes-browser-folder-name-input"
          />
          <Button size="sm" onClick={() => newFolderName.trim() && createFolderMutation.mutate(newFolderName.trim())} className="h-7 text-xs bg-amber-600 hover:bg-amber-700" data-testid="notes-browser-confirm-folder">
            OK
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setNewFolderMode(false); setNewFolderName(''); }} className="h-7 text-xs text-stone-400" data-testid="notes-browser-cancel-folder">
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="space-y-0.5">
        {rootFolders.map((f: any) => renderFolder(f))}

        {unfiledNotes.length > 0 && (
          <div className="mt-2 pt-2 border-t border-stone-800/50">
            <div className="text-[10px] uppercase tracking-wider text-stone-600 px-2 mb-1">Unfiled</div>
            {unfiledNotes.map((note: any) => (
              <div
                key={note.id}
                className="flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer hover:bg-stone-800/60 text-stone-300 text-sm transition-colors"
                onClick={() => onSelectNote(note.id)}
                data-testid={`notes-browser-note-${note.id}`}
              >
                <FileText className="h-3.5 w-3.5 text-stone-500 shrink-0" />
                <span className="truncate">{note.title || 'Untitled'}</span>
                {note.isPinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {rootFolders.length === 0 && allNotes.length === 0 && (
          <div className="text-center py-8 text-stone-600 italic text-xs">
            No notes yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
}

function FloatingNotesEditor({
  campaignId,
  initialNoteId,
  position,
  size,
  collapsed,
  onPositionChange,
  onSizeChange,
  onCollapsedChange,
  onClose,
  campaignMembers,
  onViewCharacter,
}: {
  campaignId: string;
  initialNoteId: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  collapsed: boolean;
  onPositionChange: (pos: { x: number; y: number }) => void;
  onSizeChange: (size: { width: number; height: number }) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onClose: () => void;
  campaignMembers?: Array<{ id: string; userId: string; username: string }>;
  onViewCharacter?: (character: any) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    onPositionChange({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      className="fixed z-[45] pointer-events-auto"
      style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${size.width}px`, height: collapsed ? 'auto' : `${size.height}px` }}
      data-testid="floating-notes-editor"
    >
      <div className="bg-stone-900/95 border border-amber-800/50 rounded-xl shadow-2xl backdrop-blur-sm overflow-hidden h-full flex flex-col">
        <div
          className="flex items-center justify-between px-3 py-2 cursor-move select-none bg-amber-900/30 border-b border-amber-800/30 shrink-0"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-amber-400 font-bold text-sm truncate">Notes</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onCollapsedChange(!collapsed)}
              className="p-1 rounded hover:bg-stone-700 text-stone-400 hover:text-white transition-colors"
              data-testid="floating-notes-collapse"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-stone-700 text-stone-400 hover:text-white transition-colors"
              data-testid="floating-notes-close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!collapsed && (
          <div className="flex-1 overflow-hidden">
            <CampaignNotesPanel
              campaignId={campaignId}
              onClose={onClose}
              isOpen={true}
              campaignMembers={campaignMembers}
              onViewCharacter={onViewCharacter}
              initialNoteId={initialNoteId}
            />
          </div>
        )}
      </div>
      {!collapsed && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-50"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resizeStartRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height };
            const onMove = (e2: PointerEvent) => {
              if (!resizeStartRef.current) return;
              const dx = e2.clientX - resizeStartRef.current.x;
              const dy = e2.clientY - resizeStartRef.current.y;
              onSizeChange({
                width: Math.max(400, resizeStartRef.current.width + dx),
                height: Math.max(300, resizeStartRef.current.height + dy),
              });
            };
            const onUp = () => {
              resizeStartRef.current = null;
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        >
          <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-stone-500" />
        </div>
      )}
    </div>
  );
}

export default function Campaign() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const [match, params] = useRoute("/campaign/:id");
  const queryParams = new URLSearchParams(search);
  const isNew = queryParams.get("new") === "true";
  const isIncognitoMode = queryParams.get("incognito") === "true";
  const campaignId = params?.id;

  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasCreatedRef = useRef(false);
  const wsConnectedRef = useRef(false);
  const isMobile = useIsMobile();

  const [character, setCharacter] = useState<any>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [inspectedChar, setInspectedChar] = useState<any>(null);
  // Note: Player character display is now handled solely by 'character' state (set via Assign button)
  const [currentMap, setCurrentMap] = useState(battleMapImage1);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState({ x: 0, y: 0, zoom: 1 });
  const [scenesManagementOpen, setScenesManagementOpen] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [campaignSpeciesOpen, setCampaignSpeciesOpen] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<CampaignSpecies | null>(null);
  const [speciesFormOpen, setSpeciesFormOpen] = useState(false);
  const [deletingSpecies, setDeletingSpecies] = useState<CampaignSpecies | null>(null);
  const [openCharacterSheets, setOpenCharacterSheets] = useState<any[]>([]);
  const [characterSheetDefaultTab, setCharacterSheetDefaultTab] = useState("overview");
  
  // Helper functions for managing multiple open character sheets
  const openCharacterSheet = (char: any) => {
    setOpenCharacterSheets(prev => {
      if (prev.some(c => c.id === char.id)) return prev;
      return [...prev, char];
    });
  };
  
  const closeCharacterSheet = (charId: string) => {
    setOpenCharacterSheets(prev => prev.filter(c => c.id !== charId));
  };
  
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignSystem, setNewCampaignSystem] = useState("arcana-adventure");
  
  // Selection mode state for battlemap interactions
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('select');
  const [targetedTokenId, setTargetedTokenId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [throwableGridTarget, setThrowableGridTarget] = useState<{ x: number; y: number } | null>(null);
  
  // Active beacons state - temporary pulsating rings on grid cells
  const [activeBeacons, setActiveBeacons] = useState<Array<{
    id: string;
    gridX: number;
    gridY: number;
    username: string;
    beaconColor?: string;
  }>>([]);
  
  // Beacon color picker dialog state
  const [beaconColorDialogOpen, setBeaconColorDialogOpen] = useState(false);
  const [pendingBeaconColor, setPendingBeaconColor] = useState('#FBB524');
  
  // Initiative tracker state
  const [initiativeTrackerOpen, setInitiativeTrackerOpen] = useState(false);
  
  // Dice roller state
  const [diceMenuOpen, setDiceMenuOpen] = useState(false);
  const battlemapContainerRef = useRef<HTMLDivElement>(null);
  
  // Add Token dialog state
  const [addTokenDialogOpen, setAddTokenDialogOpen] = useState(false);
  
  // GM viewing scene state (separate from active scene for players)
  const [gmViewingSceneId, setGmViewingSceneId] = useState<string | null>(null);
  
  // Scene folder state
  const [expandedSceneFolders, setExpandedSceneFolders] = useState<Set<string>>(new Set());
  const [newSceneFolderName, setNewSceneFolderName] = useState('');
  const [editingSceneFolderId, setEditingSceneFolderId] = useState<string | null>(null);
  const [editingSceneFolderName, setEditingSceneFolderName] = useState('');
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  
  // GM Character Hotbar state (5 slots for quick character access)
  const [gmCharacterHotbar, setGmCharacterHotbar] = useState<(string | null)[]>([null, null, null, null, null]);
  const [hotbarSelectorOpen, setHotbarSelectorOpen] = useState<number | null>(null);
  const gmHotbarRef = useRef<HTMLDivElement>(null);
  const [gmHotbarHidden, setGmHotbarHidden] = useState(false);
  
  // Sandbox panel state
  const [sandboxSceneSettingsOpen, setSandboxSceneSettingsOpen] = useState(false);
  const [openSandboxSheets, setOpenSandboxSheets] = useState<Array<{ id: string; name: string; type: 'actor' | 'template'; templateId?: string | null; data?: string }>>([]);

  // Floating notes panel state
  const [floatingNotesOpen, setFloatingNotesOpen] = useState(false);
  const [floatingNotesInitialNoteId, setFloatingNotesInitialNoteId] = useState<string | null>(null);
  const [floatingNotesPosition, setFloatingNotesPosition] = useState({ x: 100, y: 80 });
  const [floatingNotesSize, setFloatingNotesSize] = useState({ width: 700, height: 500 });
  const [floatingNotesCollapsed, setFloatingNotesCollapsed] = useState(false);

  // Unified side panel state (campaignDefaultPanel and useEffect moved after campaign query declaration)
  type SidePanelTab = 'characters' | 'chat' | 'notes' | 'settings' | 'scene' | 'initiative' | null;
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanelTab>('characters');
  const [sidePanelMinimized, setSidePanelMinimized] = useState(false);
  const defaultPanelAppliedRef = useRef(false);
  const sidePanelOpen = activeSidePanel !== null && !sidePanelMinimized;
  const chatOpen = activeSidePanel === 'chat' && !sidePanelMinimized;
  
  const [notesPanelWidth, setNotesPanelWidth] = useState(() => {
    const defaultWidth = typeof window !== 'undefined' ? window.innerWidth * 0.28 : 320;
    return Math.max(280, Math.min(600, defaultWidth));
  });
  
  const handleToggleNotesPanel = useCallback(() => {
    if (activeSidePanel === 'notes' && !sidePanelMinimized) {
      setSidePanelMinimized(true);
    } else {
      setActiveSidePanel('notes');
      setSidePanelMinimized(false);
    }
  }, [activeSidePanel, sidePanelMinimized]);

  const checkGmHotbarFit = useCallback(() => {
    if (isMobile) {
      setGmHotbarHidden(false);
      return;
    }
    const hotbarEl = gmHotbarRef.current;
    if (!hotbarEl) return;
    const hotbarRect = hotbarEl.getBoundingClientRect();
    const collisionEls = document.querySelectorAll('[data-collision-id]');
    let overlaps = false;
    collisionEls.forEach(el => {
      const elRect = el.getBoundingClientRect();
      if (
        hotbarRect.left < elRect.right &&
        hotbarRect.right > elRect.left &&
        hotbarRect.top < elRect.bottom &&
        hotbarRect.bottom > elRect.top
      ) {
        overlaps = true;
      }
    });
    if (sidePanelOpen) {
      const panelLeft = window.innerWidth - notesPanelWidth;
      if (hotbarRect.right > panelLeft) {
        overlaps = true;
      }
    }
    setGmHotbarHidden(overlaps);
  }, [isMobile, sidePanelOpen, notesPanelWidth]);

  useEffect(() => {
    requestAnimationFrame(checkGmHotbarFit);
    window.addEventListener('resize', checkGmHotbarFit);
    return () => window.removeEventListener('resize', checkGmHotbarFit);
  }, [checkGmHotbarFit, inspectedChar]);
  
  // State for notes panel resize dragging
  const [isResizingNotes, setIsResizingNotes] = useState(false);
  const notesResizeStartRef = useRef({ x: 0, width: 0 });
  
  // Handlers for notes panel resize (only on desktop)
  const handleNotesResizeStart = useCallback((e: React.PointerEvent) => {
    if (isMobile) return;
    e.preventDefault();
    setIsResizingNotes(true);
    notesResizeStartRef.current = { x: e.clientX, width: notesPanelWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [isMobile, notesPanelWidth]);
  
  const handleNotesResizeMove = useCallback((e: React.PointerEvent) => {
    if (!isResizingNotes || isMobile) return;
    const dx = e.clientX - notesResizeStartRef.current.x;
    const newWidth = Math.max(300, Math.min(window.innerWidth * 0.8, notesResizeStartRef.current.width - dx));
    setNotesPanelWidth(newWidth);
  }, [isResizingNotes, isMobile]);
  
  const handleNotesResizeEnd = useCallback((e: React.PointerEvent) => {
    if (!isResizingNotes) return;
    setIsResizingNotes(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, [isResizingNotes]);
  
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
  
  // Other players' token targeting states (keyed by userId) - for GM visibility
  const [otherPlayersTargeting, setOtherPlayersTargeting] = useState<Map<string, {
    userId: string;
    username: string;
    targetTokenId: string | null;
    characterId?: string;
    characterName?: string;
  }>>(new Map());
  
  // Other players' viewport states (keyed by userId) - for GM visibility
  const [otherPlayersViewports, setOtherPlayersViewports] = useState<Map<string, {
    userId: string;
    username: string;
    viewportX: number;
    viewportY: number;
    viewportWidth: number;
    viewportHeight: number;
    zoom: number;
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
      // Use spell range for spells, or item range for throwables (default 30ft for throwables)
      const rangeVal = aoeTargetState.spell?.rangeNum || aoeTargetState.throwableItem?.range || 30;
      const gridSizeVal = activeScene?.gridSize || 50;
      
      const dx = x - casterCenterX;
      const dy = y - casterCenterY;
      const distancePixels = Math.sqrt(dx * dx + dy * dy);
      const distanceFeet = (distancePixels / gridSizeVal) * 5;
      
      // If out of range, unlock so user can reposition
      if (distanceFeet > rangeVal) {
        isLocked = false;
      }
    }
    
    // Update position
    setAoeTargetState(prev => ({
      ...prev,
      center: { x, y },
      locked: isLocked,
    }));
    
    // Broadcast the locked position to other players (only for spells, not throwables)
    if (aoeTargetState.spell) {
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
    }
  };
  
  // Throttle ref for AoE updates to avoid rate limiting
  const lastAoeBroadcastRef = useRef<number>(0);
  
  // Helper function to update AoE center position (when hovering)
  const updateAoeCenter = (x: number, y: number) => {
    if (!aoeTargetState.locked) {
      setAoeTargetState(prev => ({ ...prev, center: { x, y } }));
      
      // Throttle broadcasts to ~20 updates per second to avoid rate limiting
      const now = Date.now();
      if (now - lastAoeBroadcastRef.current >= 50) {
        lastAoeBroadcastRef.current = now;
        
        // Broadcast the moving position to other players
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
  
  // Debounced viewport broadcasting - send viewport updates to other players every 200ms
  const lastViewportBroadcastRef = useRef<number>(0);
  const viewportSizeRef = useRef({ width: 0, height: 0 });
  
  useEffect(() => {
    // Update viewport size from battlemapContainerRef
    if (battlemapContainerRef.current) {
      viewportSizeRef.current = {
        width: battlemapContainerRef.current.clientWidth,
        height: battlemapContainerRef.current.clientHeight,
      };
    }
    
    // Debounce viewport broadcasts to every 500ms for better performance
    const now = Date.now();
    if (now - lastViewportBroadcastRef.current >= 500) {
      lastViewportBroadcastRef.current = now;
      
      // Calculate viewport size in world units (accounting for zoom)
      const vpWidth = viewportSizeRef.current.width / currentView.zoom;
      const vpHeight = viewportSizeRef.current.height / currentView.zoom;
      
      gameWs.sendViewport({
        viewportX: currentView.x,
        viewportY: currentView.y,
        viewportWidth: vpWidth,
        viewportHeight: vpHeight,
        zoom: currentView.zoom,
      });
    }
  }, [currentView]);

  // Determine effective campaign ID (from URL or newly created)
  const effectiveCampaignId = campaignId || createdCampaignId;

  // Load campaign data from API (with incognito support for admins)
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}`, isIncognitoMode && isAdmin],
    queryFn: async () => {
      const url = isIncognitoMode && isAdmin 
        ? `/api/campaigns/${effectiveCampaignId}?incognito=true`
        : `/api/campaigns/${effectiveCampaignId}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load campaign');
      return res.json();
    },
    enabled: !!effectiveCampaignId && !isNew,
  });

  // Derive user's role from the campaign data returned by the server
  // This is more secure than relying on URL query params
  // For new campaigns being created, the creator is always GM
  const role: 'gm' | 'player' = isNew 
    ? 'gm' 
    : (campaign && typeof campaign === 'object' && 'userRole' in campaign 
        ? ((campaign as any).userRole as 'gm' | 'player') 
        : 'player');

  // Get campaign's active scene ID (what players see)
  const campaignActiveSceneId = campaign && typeof campaign === 'object' && 'activeSceneId' in campaign ? (campaign as any).activeSceneId as string | null : null;
  const isSandbox = campaign && typeof campaign === 'object' && 'system' in campaign && (campaign as any).system === 'sandbox';

  const campaignDefaultPanel = campaign && typeof campaign === 'object' && 'defaultPanel' in campaign ? (campaign as any).defaultPanel : 'characters';
  useEffect(() => {
    if (campaign && !defaultPanelAppliedRef.current) {
      defaultPanelAppliedRef.current = true;
      if (isMobile) {
        setActiveSidePanel(null);
        setSidePanelMinimized(true);
      } else {
        const dp = campaignDefaultPanel || 'characters';
        if (dp === 'none') {
          setActiveSidePanel(null);
          setSidePanelMinimized(true);
        } else if (['characters', 'chat', 'notes', 'settings', 'scene', 'initiative'].includes(dp)) {
          setActiveSidePanel(dp as SidePanelTab);
          setSidePanelMinimized(false);
        }
      }
    }
  }, [campaign, campaignDefaultPanel, isMobile]);

  const { data: sandboxTemplatesList = [] } = useQuery({
    queryKey: ['sandbox-templates', effectiveCampaignId],
    queryFn: () => api.getSandboxTemplates(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && !!isSandbox,
  });

  // Determine which scene ID to use for tokens
  // For GM: use gmViewingSceneId if set, otherwise use activeSceneId
  // For Players: always use activeSceneId
  const sceneIdForTokens = role === 'gm' && gmViewingSceneId ? gmViewingSceneId : campaignActiveSceneId;
  
  // Load tokens for the current scene
  // Use staleTime to prevent refetch flicker - WebSocket handles real-time sync
  const { data: tokensData, isLoading: tokensLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`, sceneIdForTokens],
    queryFn: () => api.getCampaignTokens(effectiveCampaignId!, sceneIdForTokens || undefined),
    enabled: !!effectiveCampaignId && !isNew && !!sceneIdForTokens,
    staleTime: 5000, // Cache for 5s - WebSocket updates positions in real-time
  });

  // Load characters for the campaign
  const { data: characters, isLoading: charactersLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`],
    enabled: !!effectiveCampaignId && !isNew,
  });

  // Sync openCharacterSheets with the latest data from the characters query
  useEffect(() => {
    if (openCharacterSheets.length > 0 && characters) {
      setOpenCharacterSheets(prev => prev.map(sheet => {
        const updatedChar = (characters as any[]).find((c: any) => c.id === sheet.id);
        if (updatedChar && JSON.stringify(updatedChar) !== JSON.stringify(sheet)) {
          return updatedChar;
        }
        return sheet;
      }));
    }
  }, [characters]);

  // Load campaign members
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/members`],
    queryFn: () => api.getCampaignMembers(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && !isNew,
    staleTime: 0, // Always refetch to get latest members
  });

  // Current user's membership (for beacon color)
  const myMembership = (members as any[] | undefined)?.find((m: any) => m.userId === user?.id);

  // Mutation to update beacon color
  const updateBeaconColorMutation = useMutation({
    mutationFn: (beaconColor: string) => api.updateBeaconColor(effectiveCampaignId!, beaconColor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/members`] });
      setBeaconColorDialogOpen(false);
      toast({ title: "Beacon Color Updated", description: "Your beacon color has been saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update beacon color", variant: "destructive" });
    },
  });

  // Show beacon color dialog when user joins and hasn't set a color yet (only once per session per campaign)
  useEffect(() => {
    if (!effectiveCampaignId || !myMembership || isNew || beaconColorDialogOpen) return;
    
    // Check if beacon color is already set
    if (myMembership.beaconColor) return;
    
    // Check if we've already shown the prompt for this campaign this session
    const sessionKey = `beaconColorPrompt_${effectiveCampaignId}`;
    if (sessionStorage.getItem(sessionKey)) return;
    
    // Show the dialog and mark as shown
    const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0').toUpperCase();
    setPendingBeaconColor(randomColor);
    setBeaconColorDialogOpen(true);
    sessionStorage.setItem(sessionKey, 'shown');
  }, [effectiveCampaignId, myMembership, beaconColorDialogOpen, isNew]);

  // Load current user's permissions for all characters in the campaign
  const { data: myPermissions } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/my-permissions`],
    queryFn: () => api.getMyPermissions(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && !isNew && role === 'player',
  });

  // Load active scene for the campaign
  // For GM: use gmViewingSceneId if set, otherwise fall back to activeSceneId
  // For Players: always use activeSceneId (they only see the activated scene)
  const effectiveSceneId = role === 'gm' && gmViewingSceneId ? gmViewingSceneId : campaignActiveSceneId;
  const { data: activeScene, isLoading: sceneLoading } = useQuery({
    queryKey: [`/api/scenes/${effectiveSceneId}`],
    queryFn: () => api.getScene(effectiveSceneId as string),
    enabled: !!effectiveSceneId,
  });

  // Load all scenes for the campaign
  const { data: allScenes } = useQuery({
    queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`],
    queryFn: () => api.getScenes(effectiveCampaignId!),
    enabled: !!effectiveCampaignId,
  });

  // Load scene folders for the campaign
  const { data: sceneFolders = [] } = useQuery({
    queryKey: ['scene-folders', effectiveCampaignId],
    queryFn: () => api.getSceneFolders(effectiveCampaignId!),
    enabled: !!effectiveCampaignId,
  });

  // Load character folders for the campaign (used for GM hotbar character picker)
  const { data: characterFolders = [] } = useQuery<CharacterFolder[]>({
    queryKey: ['character-folders', effectiveCampaignId],
    queryFn: () => api.getCampaignFolders(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && role === 'gm',
  });

  // Load system species for default token images and character stats (only needed when campaign is loaded)
  // Use public /api/species endpoint that all authenticated users can access
  const { data: systemSpecies } = useQuery({
    queryKey: ['/api/species'],
    queryFn: () => api.getSpecies(),
    enabled: !!effectiveCampaignId && !isNew,
    staleTime: 5 * 60 * 1000, // Species data doesn't change often, cache for 5 minutes
  });

  // Load campaign species for the campaign (GM-created species)
  const { data: campaignSpeciesList = [] } = useQuery({
    queryKey: ['campaignSpecies', effectiveCampaignId],
    queryFn: () => api.getCampaignSpecies(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && !isNew,
  });

  // Load feat trees for species form (to assign racial feat trees)
  // Use public endpoint so GMs can access feat trees without admin requirement
  const { data: featTrees = [] } = useQuery<FeatTree[]>({
    queryKey: ['/api/feat-trees'],
    queryFn: () => api.getPublicFeatTrees(),
    enabled: role === 'gm' && speciesFormOpen,
  });

  // Token effects queries
  const tokenEffectsQuery = useQuery({
    queryKey: ['token-effects'],
    queryFn: () => api.getTokenEffects(),
  });

  const tokenActiveEffectsQuery = useQuery({
    queryKey: ['token-active-effects', activeScene?.id, tokens.map(t => t.id).join(',')],
    queryFn: async () => {
      if (!tokens.length) return {};
      const results: Record<string, TokenActiveEffect[]> = {};
      await Promise.all(
        tokens.map(async (token) => {
          try {
            const effects = await api.getTokenActiveEffects(token.id);
            if (effects.length > 0) {
              results[token.id] = effects;
            }
          } catch (e) {
            // Token might not have any effects, ignore errors
          }
        })
      );
      return results;
    },
    enabled: tokens.length > 0,
  });

  // Initiative data query for current turn tracking
  const { data: initiativeData } = useQuery({
    queryKey: [`/api/scenes/${activeScene?.id}/initiative`],
    queryFn: () => api.getSceneInitiative(activeScene!.id),
    enabled: !!activeScene?.id,
  });
  const currentTurnCharacterId = initiativeData?.inCombat ? initiativeData?.currentTurnCharacterId : undefined;

  // Thrown items query for the active scene
  const { data: thrownItems = [] } = useQuery<ThrownItem[]>({
    queryKey: ['thrown-items', activeScene?.id],
    queryFn: () => api.getThrownItems(activeScene!.id),
    enabled: !!activeScene?.id,
  });

  // GM Hotbar query - fetch persisted hotbar from database
  const { data: gmHotbarData } = useQuery({
    queryKey: ['gm-hotbar', effectiveCampaignId],
    queryFn: () => api.getGmHotbar(effectiveCampaignId!),
    enabled: !!effectiveCampaignId && role === 'gm',
  });

  // Get hotbar slots count from campaign settings
  const hotbarSlotsCount = (campaign && typeof campaign === 'object' && 'hotbarSlots' in campaign 
    ? (campaign as any).hotbarSlots as number 
    : 5) || 5;

  // Update local state when server data loads or hotbar slots count changes
  useEffect(() => {
    if (role === 'gm') {
      // If we have server data, use it and resize to match current slot count
      if (gmHotbarData) {
        const resizedHotbar = Array.from({ length: hotbarSlotsCount }, (_, i) => 
          i < gmHotbarData.length ? gmHotbarData[i] : null
        );
        setGmCharacterHotbar(resizedHotbar);
      } else {
        // Initialize with nulls if no server data
        setGmCharacterHotbar(Array.from({ length: hotbarSlotsCount }, () => null));
      }
    }
  }, [gmHotbarData, role, hotbarSlotsCount]);

  // GM Hotbar mutation - persist changes to database
  const updateGmHotbarMutation = useMutation({
    mutationFn: (hotbar: (string | null)[]) => api.updateGmHotbar(effectiveCampaignId!, hotbar),
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save hotbar", variant: "destructive" });
    },
  });

  // Campaign species mutations
  const createCampaignSpeciesMutation = useMutation({
    mutationFn: (data: Partial<CampaignSpecies>) => api.createCampaignSpecies(effectiveCampaignId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaignSpecies', effectiveCampaignId] });
      setSpeciesFormOpen(false);
      setEditingSpecies(null);
      toast({ title: "Success", description: "Campaign species created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create species", variant: "destructive" });
    },
  });

  const updateCampaignSpeciesMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CampaignSpecies> }) => 
      api.updateCampaignSpecies(effectiveCampaignId!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaignSpecies', effectiveCampaignId] });
      setSpeciesFormOpen(false);
      setEditingSpecies(null);
      toast({ title: "Success", description: "Campaign species updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update species", variant: "destructive" });
    },
  });

  const deleteCampaignSpeciesMutation = useMutation({
    mutationFn: (id: string) => api.deleteCampaignSpecies(effectiveCampaignId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaignSpecies', effectiveCampaignId] });
      setDeletingSpecies(null);
      toast({ title: "Success", description: "Campaign species deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete species", variant: "destructive" });
    },
  });

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: ({ name, system }: { name: string; system: string }) => api.createCampaign(name, system),
    onSuccess: (newCampaign) => {
      setCreatedCampaignId(newCampaign.id);
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      setLocation(`/campaign/${newCampaign.id}`);
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

  // Update token mutation with optimistic updates to prevent position glitching
  const updateTokenMutation = useMutation({
    mutationFn: ({ id, x, y }: { id: string; x: number; y: number }) => 
      api.updateToken(id, { x, y }),
    onMutate: async ({ id, x, y }) => {
      // Guard: skip optimistic update if campaign ID is not available
      if (!effectiveCampaignId || !sceneIdForTokens) return { previousTokens: undefined, previousLocalTokens: undefined };
      
      const queryKey = [`/api/campaigns/${effectiveCampaignId}/tokens`, sceneIdForTokens];
      
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey });
      
      // Snapshot previous values (both query cache and local state)
      const previousTokens = queryClient.getQueryData(queryKey);
      const previousLocalTokens = [...tokens];
      
      // Optimistically update the token position immediately
      queryClient.setQueryData(queryKey, (old: any[]) => 
        old?.map(token => token.id === id ? { ...token, x, y } : token) || []
      );
      
      // Also update local state for immediate visual feedback
      setTokens(prev => prev.map(token => token.id === id ? { ...token, x, y } : token));
      
      return { previousTokens, previousLocalTokens, queryKey };
    },
    onError: (error: any, _, context) => {
      // Rollback both query cache and local state on error
      if (context?.previousTokens && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousTokens);
      }
      if (context?.previousLocalTokens) {
        setTokens(context.previousLocalTokens);
      }
      toast({ title: "Error", description: error.message || "Failed to update token", variant: "destructive" });
    },
    onSettled: (_, error, ___, context) => {
      // Only invalidate on error to ensure consistency
      // On success, trust the optimistic update and WebSocket sync
      if (error && context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
    }
  });

  // Delete token mutation
  const deleteTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.deleteToken(tokenId),
    onSuccess: (_, tokenId) => {
      setTokens(prev => prev.filter(t => t.id !== tokenId));
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`, sceneIdForTokens] });
      toast({ title: "Success", description: "Token removed from battlemap" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete token", variant: "destructive" });
    },
  });

  // Create token mutation - includes sceneId for per-scene tokens
  const createTokenMutation = useMutation({
    mutationFn: (tokenData: any) => api.createToken(effectiveCampaignId!, { ...tokenData, sceneId: sceneIdForTokens }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`, sceneIdForTokens] });
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

  // Token effect mutations
  const applyEffectMutation = useMutation({
    mutationFn: ({ tokenId, effectId }: { tokenId: string; effectId: string }) => 
      api.applyTokenEffect(tokenId, effectId, 'manual'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-active-effects'] });
      toast({ title: 'Effect applied' });
    },
    onError: () => {
      toast({ title: 'Failed to apply effect', variant: 'destructive' });
    }
  });

  const removeEffectMutation = useMutation({
    mutationFn: (activeEffectId: string) => api.removeTokenActiveEffect(activeEffectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-active-effects'] });
      toast({ title: 'Effect removed' });
    },
    onError: () => {
      toast({ title: 'Failed to remove effect', variant: 'destructive' });
    }
  });

  // Toggle token invisibility mutation with optimistic updates for instant feedback
  const toggleInvisibilityMutation = useMutation({
    mutationFn: ({ tokenId, isInvisible }: { tokenId: string; isInvisible: boolean }) => 
      api.updateToken(tokenId, { isInvisible } as any),
    onMutate: async ({ tokenId, isInvisible }) => {
      // Guard: skip optimistic update if campaign ID is not available
      if (!effectiveCampaignId) return { previousTokens: undefined };
      
      const queryKey = [`/api/campaigns/${effectiveCampaignId}/tokens`];
      
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey });
      
      // Snapshot previous value
      const previousTokens = queryClient.getQueryData(queryKey);
      
      // Optimistically update the token
      queryClient.setQueryData(queryKey, (old: any[]) => 
        old?.map(token => token.id === tokenId ? { ...token, isInvisible } : token) || []
      );
      
      return { previousTokens, queryKey };
    },
    onSuccess: (_, { isInvisible }) => {
      toast({ title: isInvisible ? 'Token hidden from players' : 'Token visible to players' });
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousTokens && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousTokens);
      }
      toast({ title: 'Failed to toggle invisibility', variant: 'destructive' });
    },
    onSettled: (_, __, ___, context) => {
      // Refetch to ensure consistency
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      } else if (effectiveCampaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`] });
      }
    }
  });

  // Create scene mutation
  const createSceneMutation = useMutation({
    mutationFn: (name: string) => api.createScene(effectiveCampaignId!, { name, campaignId: effectiveCampaignId!, backgroundImage: "/attached_assets/default_battlemap.webp" }),
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

  // Set active scene mutation (for players)
  const setActiveSceneMutation = useMutation({
    mutationFn: (sceneId: string) => api.setActiveScene(effectiveCampaignId!, sceneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}`] });
      toast({ title: "Scene Activated", description: "Players can now see this scene" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to change active scene", variant: "destructive" });
    },
  });

  // Scene folder mutations
  const createSceneFolderMutation = useMutation({
    mutationFn: (name: string) => api.createSceneFolder(effectiveCampaignId!, { name, sortOrder: sceneFolders.length }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-folders', effectiveCampaignId] });
      setNewSceneFolderName('');
      toast({ title: "Success", description: "Folder created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create folder", variant: "destructive" });
    },
  });

  const updateSceneFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateSceneFolder(effectiveCampaignId!, id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-folders', effectiveCampaignId] });
      setEditingSceneFolderId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update folder", variant: "destructive" });
    },
  });

  const deleteSceneFolderMutation = useMutation({
    mutationFn: (id: string) => api.deleteSceneFolder(effectiveCampaignId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scene-folders', effectiveCampaignId] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`] });
      toast({ title: "Success", description: "Folder deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete folder", variant: "destructive" });
    },
  });

  const moveSceneToFolderMutation = useMutation({
    mutationFn: ({ sceneId, folderId }: { sceneId: string; folderId: string | null }) => 
      api.moveSceneToFolder(sceneId, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to move scene", variant: "destructive" });
    },
  });

  // Helper functions for scene folders
  const getScenesInFolder = (folderId: string | null) => {
    return allScenes?.filter((s: Scene) => s.folderId === folderId) || [];
  };
  const unfiledScenes = allScenes?.filter((s: Scene) => !s.folderId) || [];

  const toggleSceneFolder = (folderId: string) => {
    setExpandedSceneFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // GM Character Hotbar helper functions
  const getCharactersInFolder = (folderId: string | null) => {
    return (characters as any[] || []).filter((c: any) => c.folderId === folderId);
  };
  const unfiledCharacters = (characters as any[] || []).filter((c: any) => !c.folderId);
  
  // Long-press state for hotbar removal
  const hotbarLongPressRef = useRef<{ timer: NodeJS.Timeout | null; slotIndex: number | null }>({ timer: null, slotIndex: null });
  const [hotbarLongPressSlot, setHotbarLongPressSlot] = useState<number | null>(null);
  
  const addCharacterToHotbar = (slotIndex: number, characterId: string) => {
    const newHotbar = [...gmCharacterHotbar];
    newHotbar[slotIndex] = characterId;
    setGmCharacterHotbar(newHotbar);
    setHotbarSelectorOpen(null);
    updateGmHotbarMutation.mutate(newHotbar);
  };
  
  const removeCharacterFromHotbar = (slotIndex: number) => {
    const newHotbar = [...gmCharacterHotbar];
    newHotbar[slotIndex] = null;
    setGmCharacterHotbar(newHotbar);
    updateGmHotbarMutation.mutate(newHotbar);
  };
  
  const handleHotbarPointerDown = (slotIndex: number) => {
    const characterId = gmCharacterHotbar[slotIndex];
    if (characterId) {
      hotbarLongPressRef.current.slotIndex = slotIndex;
      hotbarLongPressRef.current.timer = setTimeout(() => {
        setHotbarLongPressSlot(slotIndex);
      }, 600); // 600ms for long press
    }
  };
  
  const handleHotbarPointerUp = (slotIndex: number) => {
    if (hotbarLongPressRef.current.timer) {
      clearTimeout(hotbarLongPressRef.current.timer);
      hotbarLongPressRef.current.timer = null;
    }
    // If long press was triggered, the dialog is open - don't open character sheet
    if (hotbarLongPressSlot !== null) return;
    
    // Normal click - open character sheet or selector
    const characterId = gmCharacterHotbar[slotIndex];
    if (characterId) {
      const char = (characters as any[] || []).find((c: any) => c.id === characterId);
      if (char) {
        openCharacterSheet(char);
      }
    } else {
      setHotbarSelectorOpen(slotIndex);
    }
  };
  
  const handleHotbarPointerLeave = () => {
    if (hotbarLongPressRef.current.timer) {
      clearTimeout(hotbarLongPressRef.current.timer);
      hotbarLongPressRef.current.timer = null;
    }
  };
  
  const handleHotbarSlotClick = (slotIndex: number) => {
    const characterId = gmCharacterHotbar[slotIndex];
    if (characterId) {
      const char = (characters as any[] || []).find((c: any) => c.id === characterId);
      if (char) {
        openCharacterSheet(char);
      }
    } else {
      setHotbarSelectorOpen(slotIndex);
    }
  };
  
  const getHotbarCharacter = (slotIndex: number) => {
    const characterId = gmCharacterHotbar[slotIndex];
    if (!characterId) return null;
    return (characters as any[] || []).find((c: any) => c.id === characterId) || null;
  };

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
    createCampaignMutation.mutate({ name: newCampaignName.trim(), system: newCampaignSystem });
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
  const sceneIdForTokensRef = useRef(sceneIdForTokens);
  const effectiveCampaignIdRef = useRef(effectiveCampaignId);
  const membersRef = useRef(members);
  useEffect(() => {
    queryClientRef.current = queryClient;
    toastRef.current = toast;
    sceneIdForTokensRef.current = sceneIdForTokens;
    effectiveCampaignIdRef.current = effectiveCampaignId;
    membersRef.current = members;
  }, [queryClient, toast, sceneIdForTokens, effectiveCampaignId, members]);

  // Helper function to get display name (username)
  const getDisplayName = (userId: string, fallbackUsername: string): string => {
    return fallbackUsername;
  };

  // WebSocket connection (with incognito support for admins)
  useEffect(() => {
    if (effectiveCampaignId && !wsConnectedRef.current) {
      const shouldUseIncognito = isIncognitoMode && isAdmin;
      gameWs.connect(effectiveCampaignId, shouldUseIncognito);
      wsConnectedRef.current = true;

      const unsubscribe = gameWs.onMessage((data) => {
        console.log('WebSocket message received:', data.type, data);
        if (data.type === 'token_move') {
          // Update local state for immediate visual feedback
          setTokens(prev => prev.map(t => 
            t.id === data.tokenId ? { ...t, x: data.x, y: data.y } : t
          ));
          // Also update the React Query cache to keep it in sync with WebSocket updates
          // This ensures positions persist when switching scenes
          const currentCampaignId = effectiveCampaignIdRef.current;
          const currentSceneId = sceneIdForTokensRef.current;
          if (currentCampaignId && currentSceneId) {
            queryClientRef.current.setQueryData(
              [`/api/campaigns/${currentCampaignId}/tokens`, currentSceneId],
              (oldData: any[] | undefined) => {
                if (!oldData) return oldData;
                return oldData.map((t: any) => t.id === data.tokenId ? { ...t, x: data.x, y: data.y } : t);
              }
            );
          }
        }
        if (data.type === 'token_move_rollback') {
          // Server rejected the move - revert token to original position
          if (data.x !== undefined && data.y !== undefined) {
            setTokens(prev => prev.map(t => 
              t.id === data.tokenId ? { ...t, x: data.x, y: data.y } : t
            ));
            // Also update the React Query cache
            const currentCampaignId = effectiveCampaignIdRef.current;
            const currentSceneId = sceneIdForTokensRef.current;
            if (currentCampaignId && currentSceneId) {
              queryClientRef.current.setQueryData(
                [`/api/campaigns/${currentCampaignId}/tokens`, currentSceneId],
                (oldData: any[] | undefined) => {
                  if (!oldData) return oldData;
                  return oldData.map((t: any) => t.id === data.tokenId ? { ...t, x: data.x, y: data.y } : t);
                }
              );
            }
          }
        }
        if (data.type === 'character_changed') {
          // Force immediate refetch for character changes
          queryClientRef.current.refetchQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`] });
          if (data.characterId) {
            queryClientRef.current.refetchQueries({ queryKey: [`/api/characters/${data.characterId}`] });
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
          // Update openCharacterSheets if any match (for character sheet panels)
          setOpenCharacterSheets((prev: any[]) => 
            prev.map((sheet: any) => sheet.id === updatedChar.id ? updatedChar : sheet)
          );
          // Immediately update the characters query cache for instant UI updates
          queryClientRef.current.setQueryData(
            [`/api/campaigns/${effectiveCampaignId}/characters`],
            (oldData: any[] | undefined) => {
              if (!oldData) return oldData;
              return oldData.map((c: any) => c.id === updatedChar.id ? updatedChar : c);
            }
          );
          // Also update individual character cache
          queryClientRef.current.setQueryData(
            [`/api/characters/${updatedChar.id}`],
            updatedChar
          );
        }
        if (data.type === 'permission_update') {
          console.log('Permission update received:', data);
          // Force immediate refetch for permission changes and character list
          // Characters list may change since visibility depends on permissions
          queryClientRef.current.refetchQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/my-permissions`] });
          queryClientRef.current.refetchQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/characters`] });
          
          // Show toast only for the affected user (don't spam other users)
          if (data.targetUserId === user?.id) {
            const accessDesc = data.accessLevel === 'edit' ? 'edit (can edit)' : 
                               data.accessLevel === 'view' ? 'view (full stats)' :
                               data.accessLevel === 'name' ? 'name (token only)' : 'none';
            toastRef.current({ 
              title: "Access Changed", 
              description: `Access to ${data.characterName || 'a character'} is now ${accessDesc}`,
              variant: data.accessLevel === 'none' ? 'destructive' : 'default'
            });
          }
        }
        if (data.type === 'initiative_update' || data.type === 'combat_update') {
          // Force immediate refetch for initiative/combat updates
          if (data.sceneId) {
            queryClientRef.current.refetchQueries({ queryKey: [`/api/scenes/${data.sceneId}/initiative`] });
          }
        }
        if (data.type === 'dice_roll' && data.roll) {
          // Trigger battlemap dice notification - use nickname if available
          const rollWithNickname = {
            ...data.roll,
            username: data.roll.userId ? getDisplayName(data.roll.userId, data.roll.username) : data.roll.username
          };
          triggerBattlemapDiceRoll(rollWithNickname);
        }
        if (data.type === 'initiative_roll') {
          // Trigger initiative roll notification - use nickname if available
          // Don't broadcast - server already sent to all clients
          const displayName = data.userId ? getDisplayName(data.userId, data.username) : data.username;
          triggerInitiativeNotification(
            data.result,
            data.modifier,
            data.total,
            displayName,
            data.characterName,
            false // broadcast = false, server already sent to all clients
          );
        }
        
        // Handle effect roll notifications - token effects triggering damage/healing
        // Don't broadcast - server already sent to all clients
        if (data.type === 'effect_roll') {
          triggerEffectRollNotification(
            data.effectName,
            data.rolls,
            data.bonus,
            data.total,
            data.damageType,
            data.isHealing,
            data.characterName,
            false // broadcast = false, server already sent to all clients
          );
        }
        
        // Handle effect expiration - remove expired effects from tokens
        if (data.type === 'effect_expired') {
          const { tokenId, effectId, effectName, characterName } = data;
          // Invalidate token active effects to refresh the UI
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/tokens/${tokenId}/active-effects`] });
          // Show toast notification for effect expiration
          toast({
            title: "Effect Expired",
            description: `${effectName} on ${characterName} has worn off.`,
          });
        }
        
        // Handle effect duration updates - update remaining duration on effects
        if (data.type === 'effect_duration_update') {
          const { tokenId, activeEffectId, remainingDuration } = data;
          // Invalidate token active effects to refresh the UI with new duration
          queryClientRef.current.invalidateQueries({ queryKey: [`/api/tokens/${tokenId}/active-effects`] });
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
          // Immediately update the characters query cache for instant HP bar updates on tokens
          queryClientRef.current.setQueryData(
            [`/api/campaigns/${effectiveCampaignId}/characters`],
            (oldData: any[] | undefined) => {
              if (!oldData) return oldData;
              return oldData.map((c: any) => c.id === characterId ? { ...c, hp } : c);
            }
          );
          // Also update individual character cache
          queryClientRef.current.setQueryData(
            [`/api/characters/${characterId}`],
            (oldData: any | undefined) => {
              if (!oldData) return oldData;
              return { ...oldData, hp };
            }
          );
        }
        
        // Handle combat Energy updates - real-time energy gain/drain
        if (data.type === 'character_energy_update') {
          const { characterId, energy } = data;
          // Update local character state if it matches
          setCharacter((prev: any) => {
            if (prev && prev.id === characterId) {
              return { ...prev, energy };
            }
            return prev;
          });
          // Update inspected character if it matches
          setInspectedChar((prev: any) => {
            if (prev && prev.id === characterId) {
              return { ...prev, energy };
            }
            return prev;
          });
          // Immediately update the characters query cache
          queryClientRef.current.setQueryData(
            [`/api/campaigns/${effectiveCampaignId}/characters`],
            (oldData: any[] | undefined) => {
              if (!oldData) return oldData;
              return oldData.map((c: any) => c.id === characterId ? { ...c, energy } : c);
            }
          );
          // Also update individual character cache
          queryClientRef.current.setQueryData(
            [`/api/characters/${characterId}`],
            (oldData: any | undefined) => {
              if (!oldData) return oldData;
              return { ...oldData, energy };
            }
          );
        }
        
        // Handle token CRUD - real-time token updates
        // Only apply updates if the token belongs to the current scene (or is legacy with null sceneId)
        const currentSceneId = role === 'gm' && gmViewingSceneId ? gmViewingSceneId : campaignActiveSceneId;
        if (data.type === 'token_created' && data.token) {
          // Only add if token belongs to current scene or is legacy (null sceneId)
          if (data.token.sceneId === currentSceneId || !data.token.sceneId) {
            setTokens(prev => {
              // Avoid duplicates
              if (prev.some(t => t.id === data.token.id)) return prev;
              return [...prev, data.token];
            });
          }
        }
        if (data.type === 'token_updated' && data.token) {
          // Only update if token belongs to current scene or is legacy (null sceneId)
          if (data.token.sceneId === currentSceneId || !data.token.sceneId) {
            setTokens(prev => prev.map(t => 
              t.id === data.token.id ? data.token : t
            ));
          }
        }
        if (data.type === 'token_deleted' && data.tokenId) {
          setTokens(prev => prev.filter(t => t.id !== data.tokenId));
        }
        
        // Handle scene updates - real-time scene changes
        if (data.type === 'scene_updated' && data.scene) {
          // Immediately update the scene cache
          queryClientRef.current.setQueryData(
            [`/api/scenes/${data.scene.id}`],
            data.scene
          );
          queryClientRef.current.setQueryData(
            [`/api/campaigns/${effectiveCampaignId}/scenes`],
            (oldData: any[] | undefined) => {
              if (!oldData) return oldData;
              return oldData.map((s: any) => s.id === data.scene.id ? data.scene : s);
            }
          );
        }
        if (data.type === 'scene_deleted' && data.sceneId) {
          queryClientRef.current.setQueryData(
            [`/api/campaigns/${effectiveCampaignId}/scenes`],
            (oldData: any[] | undefined) => {
              if (!oldData) return oldData;
              return oldData.filter((s: any) => s.id !== data.sceneId);
            }
          );
        }
        if (data.type === 'active_scene_changed') {
          // Immediately update campaign cache with new active scene ID
          queryClientRef.current.setQueryData(
            [`/api/campaigns/${effectiveCampaignId}`],
            (oldData: any) => {
              if (!oldData) return oldData;
              return { ...oldData, activeSceneId: data.sceneId };
            }
          );
          
          // Update scene data if included
          if (data.scene) {
            queryClientRef.current.setQueryData(
              [`/api/scenes/${data.sceneId}`],
              data.scene
            );
          }
          
          // Refetch tokens for the new active scene
          if (data.sceneId) {
            queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/tokens`] });
            queryClientRef.current.refetchQueries({ queryKey: [`/api/scenes/${data.sceneId}`] });
          }
          
          // Refetch scenes list to update UI
          queryClientRef.current.refetchQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}/scenes`] });
        }
        
        // Handle chat messages - real-time chat
        if (data.type === 'chat_message' && data.message) {
          // Immediately add the new message to the cache
          queryClientRef.current.setQueryData(
            [`/api/campaigns/${effectiveCampaignId}/messages`],
            (oldData: any[] | undefined) => {
              if (!oldData) return [data.message];
              // Avoid duplicates
              if (oldData.some((m: any) => m.id === data.message.id)) return oldData;
              return [...oldData, data.message];
            }
          );
        }
        
        // Handle other players' AoE targeting updates
        if (data.type === 'aoe_targeting') {
          const { userId, username, active, spellName, spellAoe, casterTokenId, casterName, center, locked } = data;
          
          console.log('[AoE] Received aoe_targeting:', { userId, username, active, spellName, spellAoe, center, locked });
          
          // Skip our own broadcasts - we already display our AoE via aoeTargetState
          if (userId === user?.id) {
            console.log('[AoE] Skipping our own broadcast');
            return;
          }
          
          console.log('[AoE] Updating otherPlayersAoe state');
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
        
        // Handle other players' token targeting updates (for GM visibility)
        if (data.type === 'token_targeting') {
          const { userId, username, targetTokenId, characterId, characterName } = data;
          
          // Skip our own broadcasts
          if (userId === user?.id) return;
          
          setOtherPlayersTargeting(prev => {
            const updated = new Map(prev);
            if (targetTokenId) {
              updated.set(userId, {
                userId,
                username,
                targetTokenId,
                characterId,
                characterName,
              });
            } else {
              // Player stopped targeting
              updated.delete(userId);
            }
            return updated;
          });
        }
        
        // Handle other players' viewport updates (for GM visibility)
        if (data.type === 'viewport_update') {
          const { userId, username, viewportX, viewportY, viewportWidth, viewportHeight, zoom } = data;
          
          // Skip our own broadcasts
          if (userId === user?.id) return;
          
          setOtherPlayersViewports(prev => {
            const updated = new Map(prev);
            updated.set(userId, {
              userId,
              username,
              viewportX,
              viewportY,
              viewportWidth,
              viewportHeight,
              zoom,
            });
            return updated;
          });
        }
        
        // Handle member list updates (join/leave/kick/role changes)
        if (data.type === 'members_updated' && data.members) {
          // Update the members cache with the new list
          queryClientRef.current.setQueryData(
            [`/api/campaigns/${effectiveCampaignId}/members`],
            data.members
          );
        }
        
        // Handle beacon messages from all players (including self for consistency)
        if (data.type === 'beacon') {
          const { id, gridX, gridY, username, beaconColor } = data;
          
          // Add the new beacon with its color
          setActiveBeacons(prev => [...prev, { id, gridX, gridY, username, beaconColor }]);
          
          // Remove beacon after animation completes (~1.5 seconds)
          setTimeout(() => {
            setActiveBeacons(prev => prev.filter(b => b.id !== id));
          }, 1500);
        }
        
        // Handle thrown item created - refetch thrown items for the active scene
        if (data.type === 'thrown_item_created' || data.type === 'thrown_item_placed') {
          const currentSceneId = sceneIdForTokensRef.current;
          if (data.sceneId === currentSceneId) {
            queryClientRef.current.invalidateQueries({ queryKey: ['thrown-items', currentSceneId] });
          }
        }
        
        // Handle thrown items detonated - refetch thrown items and invalidate affected characters
        if (data.type === 'thrown_items_detonated') {
          const currentSceneId = sceneIdForTokensRef.current;
          if (data.sceneId === currentSceneId) {
            queryClientRef.current.invalidateQueries({ queryKey: ['thrown-items', currentSceneId] });
          }
          // Also refresh characters since they may have taken damage
          if (data.affectedTokenIds && data.affectedTokenIds.length > 0) {
            queryClientRef.current.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignIdRef.current}/characters`] });
          }
        }
        
        // Handle thrown items cleared by GM - refetch thrown items for all players
        if (data.type === 'thrown_items_cleared') {
          const currentSceneId = sceneIdForTokensRef.current;
          if (data.sceneId === currentSceneId) {
            queryClientRef.current.invalidateQueries({ queryKey: ['thrown-items', currentSceneId] });
          }
        }
        
        // Handle admin notification - show toast to all users
        if (data.type === 'admin_notification') {
          const description = data.patchNotes 
            ? `${data.message}\n\nPatch Notes:\n${data.patchNotes}`
            : data.message;
          toastRef.current({
            title: data.title || 'Site Announcement',
            description,
            duration: 10000,
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
    
    // Send to WebSocket only - it handles both DB save and broadcast to all clients
    // This is faster than using REST API which adds network round-trip delay
    gameWs.sendTokenMove(id, x, y);
  };

  const handleApplyEffect = (tokenId: string, effectId: string) => {
    applyEffectMutation.mutate({ tokenId, effectId });
  };

  const handleRemoveEffect = (activeEffectId: string) => {
    removeEffectMutation.mutate(activeEffectId);
  };

  const handleToggleInvisibility = (tokenId: string, isInvisible: boolean) => {
    toggleInvisibilityMutation.mutate({ tokenId, isInvisible });
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
        // Clear grid target when clicking a token (mutually exclusive)
        setThrowableGridTarget(null);
        setTargetedTokenId(token.id);
        setSelectedTokenId(token.id);
        // Broadcast targeting to other players so GM can see who is targeting what
        if (effectiveCampaignId) {
          const myCharacter = character;
          gameWs.sendTokenTargeting({
            targetTokenId: token.id,
            characterId: myCharacter?.id,
            characterName: myCharacter?.name || user?.username || 'Unknown'
          });
        }
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

  // Handler for triple-clicking a token - opens character sheet WITHOUT assigning
  const handleTokenTripleClick = (token: any) => {
    if (selectionMode !== 'select') return;
    
    console.log('[TokenTripleClick] Opening character sheet without assigning:', token.id, token.characterId);
    if (token.characterId && characters && Array.isArray(characters)) {
      const charData = characters.find((c: any) => c.id === token.characterId);
      if (charData) {
        // Check permissions
        if (role === 'gm') {
          // GMs can view any character
          setCharacterSheetDefaultTab("overview");
          openCharacterSheet(charData);
        } else if (role === 'player') {
          // Players need at least view access to open character sheet
          const permission = myPermissions?.permissions?.[charData.id];
          if (permission === 'owner' || permission === 'edit' || permission === 'view') {
            setCharacterSheetDefaultTab("overview");
            openCharacterSheet(charData);
          } else {
            toast({ title: "No Access", description: "You don't have view access to this character", variant: "destructive" });
          }
        }
      }
    }
  };

  // Handler for mode changes - clear targeting and selection when switching modes
  const handleModeChange = (mode: SelectionMode) => {
    // Clear targeted token when switching away from Target mode
    if (selectionMode === 'target' && mode !== 'target') {
      setTargetedTokenId(null);
      setThrowableGridTarget(null);
      // Broadcast that we're no longer targeting
      if (effectiveCampaignId) {
        gameWs.clearTokenTargeting();
      }
    }
    // Clear selected token when switching modes for a clean slate
    setSelectedTokenId(null);
    setSelectionMode(mode);
  };
  
  // Handler for grid target click in target mode (for throwable items)
  const handleGridTargetClick = (gridX: number, gridY: number) => {
    // Clear token target when clicking grid (mutually exclusive - only one target at a time)
    setTargetedTokenId(null);
    setThrowableGridTarget({ x: gridX, y: gridY });
    // Clear WebSocket targeting since we're targeting a grid space, not a token
    if (effectiveCampaignId) {
      gameWs.clearTokenTargeting();
    }
  };
  
  // Throttle beacon sending to prevent spam
  const lastBeaconRef = useRef<number>(0);
  
  // Handler for creating a beacon at a grid cell
  const handleBeacon = (cellKey: string) => {
    // Throttle beacons to max 1 per 300ms
    const now = Date.now();
    if (now - lastBeaconRef.current < 300) return;
    lastBeaconRef.current = now;
    
    const [gridX, gridY] = cellKey.split(',').map(Number);
    // Send beacon via WebSocket - the server will broadcast to all players including self
    gameWs.sendBeacon({ gridX, gridY });
  };

  // GM Actions
  const handleAddCharacterToken = (character: any) => {
    // Determine the token image:
    // 1. Use character's portrait if available
    // 2. Fall back to species default image if available
    // 3. Fall back to goblinToken as the last resort
    let tokenImage = character.portrait;
    if (!tokenImage && character.race && systemSpecies) {
      const species = (systemSpecies as any[]).find((s: any) => s.name === character.race);
      if (species?.defaultImage) {
        tokenImage = species.defaultImage;
      }
    }
    if (!tokenImage) {
      tokenImage = goblinToken;
    }
    
    const newToken = {
      type: 'player',
      characterId: character.id,
      x: 200 + Math.floor(Math.random() * 200),
      y: 200 + Math.floor(Math.random() * 200),
      image: tokenImage,
    };
    createTokenMutation.mutate(newToken);
  };

  const handleChangeMap = () => {
    const newMap = currentMap === battleMapImage1 ? battleMapImage2 : battleMapImage1;
    setCurrentMap(newMap);
    updateCampaignMutation.mutate({ currentMap: newMap });
  };

  const handleUpdateScene = async (settings: Partial<Scene>) => {
    if (activeScene) {
      // If grid size is changing, re-snap all tokens to the new grid
      if (settings.gridSize && settings.gridSize !== activeScene.gridSize) {
        const newGridSize = settings.gridSize;
        // Re-snap each token to the new grid (using same Math.round as drag snapping)
        for (const token of tokens) {
          const snappedX = Math.round(token.x / newGridSize) * newGridSize;
          const snappedY = Math.round(token.y / newGridSize) * newGridSize;
          if (snappedX !== token.x || snappedY !== token.y) {
            updateTokenMutation.mutate({ id: token.id, x: snappedX, y: snappedY });
          }
        }
      }
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

  // View scene (GM only - changes what GM is editing, doesn't affect players)
  const handleViewScene = (sceneId: string) => {
    setGmViewingSceneId(sceneId);
    setScenesManagementOpen(false);
  };

  // Activate scene (sets what players see)
  const handleActivateScene = (sceneId: string) => {
    setActiveSceneMutation.mutate(sceneId);
  };

  // Legacy switch function (for backward compat) - activates and views
  const handleSwitchScene = (sceneId: string) => {
    setActiveSceneMutation.mutate(sceneId);
    setGmViewingSceneId(sceneId);
    setScenesManagementOpen(false);
  };

  const handleUpdateCharacterById = (charId: string, updates: any) => {
    updateCharacterMutation.mutate({ id: charId, data: updates });
    // Optimistically update the local state in openCharacterSheets
    setOpenCharacterSheets(prev => prev.map(sheet => 
      sheet.id === charId ? { ...sheet, ...updates } : sheet
    ));
  };

  const handleViewCharacter = (char: any) => {
    setCharacterSheetDefaultTab("overview");
    openCharacterSheet(char);
  };

  // Open character sheet to a specific tab
  const openCharacterSheetToTab = (tab: string) => {
    // For players: use ONLY their assigned character (not changed by token clicks)
    // For GMs: use inspectedChar (clicked token)
    const charToView = role === 'player' ? character : inspectedChar;
    if (charToView) {
      setCharacterSheetDefaultTab(tab);
      openCharacterSheet(charToView);
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
                    <SelectItem value="sandbox" className="text-stone-200">Sandbox</SelectItem>
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
      
      {/* Incognito Mode Indicator Badge */}
      {isIncognitoMode && isAdmin && (
        <div 
          className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] pointer-events-none"
          data-testid="incognito-badge"
        >
          <div className="bg-purple-900/80 border border-purple-500/50 rounded-full px-3 py-1 flex items-center gap-2 shadow-lg backdrop-blur-sm">
            <Eye className="h-3.5 w-3.5 text-purple-300" />
            <span className="text-xs font-medium text-purple-200">Incognito Mode</span>
          </div>
        </div>
      )}
      
      {/* Top Bar: Nav & Settings */}
      <div className={`absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none ${sidePanelOpen ? 'z-30' : 'z-50'}`}>
        {/* Left Side - Back button and dice roller only */}
        <div className="pointer-events-auto flex flex-col gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/")} 
            className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto"
            data-testid="button-back-home"
          >
            <ArrowLeft style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
          </Button>

          {!isSandbox && (
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
                      <Dices className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-stone-800 border-stone-700 text-stone-200">
                    <p>Roll Dice</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
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
          )}
        </div>
        
        {/* Right Side - Settings menu at top, then panel tab icons */}
        <div className="pointer-events-auto flex flex-col gap-2"
          style={{ 
            marginRight: (sidePanelOpen && !isMobile) ? `${notesPanelWidth + 8}px` : '0px',
            transition: 'margin-right 0.3s ease'
          }}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (activeSidePanel === 'chat' && !sidePanelMinimized) {
                      setSidePanelMinimized(true);
                    } else {
                      setActiveSidePanel('chat');
                      setSidePanelMinimized(false);
                    }
                  }}
                  className={`text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto ${activeSidePanel === 'chat' && !sidePanelMinimized ? 'text-amber-400 bg-white/10' : ''}`}
                  data-testid="button-panel-chat"
                >
                  <MessageSquare className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                <p>Chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (activeSidePanel === 'characters' && !sidePanelMinimized) {
                      setSidePanelMinimized(true);
                    } else {
                      setActiveSidePanel('characters');
                      setSidePanelMinimized(false);
                    }
                  }}
                  className={`text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto ${activeSidePanel === 'characters' && !sidePanelMinimized ? 'text-amber-400 bg-white/10' : ''}`}
                  data-testid="button-panel-characters"
                >
                  <Users className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                <p>Characters</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (activeSidePanel === 'initiative' && !sidePanelMinimized) {
                      setSidePanelMinimized(true);
                    } else {
                      setActiveSidePanel('initiative');
                      setSidePanelMinimized(false);
                    }
                  }}
                  className={`text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto ${activeSidePanel === 'initiative' && !sidePanelMinimized ? 'text-amber-400 bg-white/10' : ''}`}
                  data-testid="button-panel-initiative"
                >
                  <Swords className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                <p>Initiative</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (activeSidePanel === 'notes' && !sidePanelMinimized) {
                      setSidePanelMinimized(true);
                    } else {
                      setActiveSidePanel('notes');
                      setSidePanelMinimized(false);
                    }
                  }}
                  className={`text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto ${activeSidePanel === 'notes' && !sidePanelMinimized ? 'text-amber-400 bg-white/10' : ''}`}
                  data-testid="button-panel-notes"
                >
                  <BookOpen className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                <p>Notes</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {role === 'gm' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (activeSidePanel === 'scene' && !sidePanelMinimized) {
                        setSidePanelMinimized(true);
                      } else {
                        setActiveSidePanel('scene');
                        setSidePanelMinimized(false);
                      }
                    }}
                    className={`text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto ${activeSidePanel === 'scene' && !sidePanelMinimized ? 'text-amber-400 bg-white/10' : ''}`}
                    data-testid="button-panel-scene"
                  >
                    <Grid3X3 className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                  <p>Scene Settings</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (activeSidePanel === 'settings' && !sidePanelMinimized) {
                      setSidePanelMinimized(true);
                    } else {
                      setActiveSidePanel('settings');
                      setSidePanelMinimized(false);
                    }
                  }}
                  className={`text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto ${activeSidePanel === 'settings' && !sidePanelMinimized ? 'text-amber-400 bg-white/10' : ''}`}
                  data-testid="button-panel-settings"
                >
                  <Settings className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {role === 'gm' && !isSandbox && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setScenesManagementOpen(true)}
                    className="text-white/50 hover:text-white hover:bg-white/10 pointer-events-auto"
                    data-testid="button-scenes"
                  >
                    <Layers className="h-5 w-5" style={{ filter: 'drop-shadow(0 0 2px black) drop-shadow(0 0 2px black) drop-shadow(0 0 1px black)' }} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="bg-stone-800 border-stone-700 text-stone-200">
                  <p>Scenes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Show message when player has no character assigned */}
      {!isSandbox && !character && role === 'player' && (
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

                {/* Add Token Button */}
                <div className="pb-2 border-b border-stone-700">
                  <Button 
                    variant="secondary" 
                    className="w-full bg-purple-900/50 hover:bg-purple-800/50 border border-purple-700" 
                    onClick={() => setAddTokenDialogOpen(true)} 
                    data-testid="button-add-token-scenes"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Token
                  </Button>
                </div>

                {/* Create Folder Input */}
                <div className="space-y-3">
                  <Label className="text-stone-300 font-bold">Create Folder</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="New folder name..."
                      value={newSceneFolderName}
                      onChange={(e) => setNewSceneFolderName(e.target.value)}
                      className="flex-1 bg-stone-800 border-stone-700 text-stone-200"
                      onKeyPress={(e) => e.key === 'Enter' && newSceneFolderName.trim() && createSceneFolderMutation.mutate(newSceneFolderName.trim())}
                      data-testid="input-new-scene-folder-name"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (newSceneFolderName.trim()) {
                          createSceneFolderMutation.mutate(newSceneFolderName.trim());
                        }
                      }}
                      disabled={!newSceneFolderName.trim() || createSceneFolderMutation.isPending}
                      className="bg-stone-800 hover:bg-stone-700"
                      data-testid="button-create-scene-folder"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Scenes List with Folders */}
                <div className="space-y-3">
                  <Label className="text-stone-300 font-bold">All Scenes</Label>
                  
                  {/* Scene Folders */}
                  {sceneFolders.map((folder: SceneFolder) => {
                    const folderScenes = getScenesInFolder(folder.id);
                    const isExpanded = expandedSceneFolders.has(folder.id);
                    
                    return (
                      <div
                        key={folder.id}
                        className={`bg-stone-850 rounded-lg border border-stone-700 p-2 transition-colors ${draggingSceneId ? 'border-dashed' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-amber-500'); }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove('border-amber-500'); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove('border-amber-500');
                          const sceneId = e.dataTransfer.getData('text/plain');
                          if (sceneId) {
                            moveSceneToFolderMutation.mutate({ sceneId, folderId: folder.id });
                            setDraggingSceneId(null);
                          }
                        }}
                        data-testid={`scene-folder-${folder.id}`}
                      >
                        {/* Folder Header */}
                        <div
                          className="flex items-center justify-between p-2 cursor-pointer hover:bg-stone-800/50 rounded"
                          onClick={() => toggleSceneFolder(folder.id)}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-stone-400 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-stone-400 shrink-0" />
                            )}
                            <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                            {editingSceneFolderId === folder.id ? (
                              <Input
                                value={editingSceneFolderName}
                                onChange={(e) => setEditingSceneFolderName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    updateSceneFolderMutation.mutate({ id: folder.id, name: editingSceneFolderName });
                                  } else if (e.key === 'Escape') {
                                    setEditingSceneFolderId(null);
                                  }
                                }}
                                onBlur={() => {
                                  if (editingSceneFolderName.trim() && editingSceneFolderName !== folder.name) {
                                    updateSceneFolderMutation.mutate({ id: folder.id, name: editingSceneFolderName });
                                  }
                                  setEditingSceneFolderId(null);
                                }}
                                className="h-6 py-0 px-1 text-sm bg-stone-900 border-stone-600"
                                autoFocus
                                data-testid={`input-edit-scene-folder-${folder.id}`}
                              />
                            ) : (
                              <span className="font-medium text-stone-200 truncate">{folder.name}</span>
                            )}
                            <span className="text-xs text-stone-500 shrink-0">({folderScenes.length})</span>
                          </div>
                          {editingSceneFolderId !== folder.id && (
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingSceneFolderId(folder.id);
                                  setEditingSceneFolderName(folder.name);
                                }}
                                className="h-6 w-6 p-0 text-stone-400 hover:text-stone-200"
                                data-testid={`button-edit-scene-folder-${folder.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteSceneFolderMutation.mutate(folder.id)}
                                disabled={deleteSceneFolderMutation.isPending}
                                className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                data-testid={`button-delete-scene-folder-${folder.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        
                        {/* Folder Scenes */}
                        {isExpanded && (
                          <div className="mt-2 space-y-2 pl-6">
                            {folderScenes.length > 0 ? (
                              folderScenes.map((scene: Scene) => {
                                const isViewing = gmViewingSceneId === scene.id || (!gmViewingSceneId && scene.id === campaignActiveSceneId);
                                const isActive = scene.id === campaignActiveSceneId;
                                
                                return (
                                  <div
                                    key={scene.id}
                                    className={`p-3 rounded border transition-all ${
                                      isViewing ? 'bg-blue-900/30 border-blue-700' : 'bg-stone-800 border-stone-700'
                                    }`}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', scene.id);
                                      setDraggingSceneId(scene.id);
                                    }}
                                    onDragEnd={() => setDraggingSceneId(null)}
                                    data-testid={`scene-item-${scene.id}`}
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <GripVertical className="h-4 w-4 text-stone-500 cursor-grab shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-bold text-stone-200 truncate">{scene.name}</div>
                                        <div className="text-xs text-stone-400">
                                          {scene.gridEnabled ? `${scene.gridType} grid` : 'Grid disabled'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {isViewing && (
                                        <span className="text-xs text-blue-400 font-bold px-2 py-0.5 bg-blue-900/30 rounded flex items-center gap-1">
                                          <Eye className="h-3 w-3" /> Viewing
                                        </span>
                                      )}
                                      {isActive && (
                                        <span className="text-xs text-amber-400 font-bold px-2 py-0.5 bg-amber-900/30 rounded flex items-center gap-1">
                                          <Radio className="h-3 w-3" /> Active
                                        </span>
                                      )}
                                      <div className="flex-1" />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleViewScene(scene.id)}
                                        className="h-7 px-2 bg-blue-900/30 border-blue-700 hover:bg-blue-800/50 text-blue-200"
                                        data-testid={`button-view-scene-${scene.id}`}
                                      >
                                        <Eye className="h-3 w-3 mr-1" /> View
                                      </Button>
                                      {!isActive && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleActivateScene(scene.id)}
                                          disabled={setActiveSceneMutation.isPending}
                                          className="h-7 px-2 bg-amber-900/30 border-amber-700 hover:bg-amber-800/50 text-amber-200"
                                          data-testid={`button-activate-scene-${scene.id}`}
                                        >
                                          <Radio className="h-3 w-3 mr-1" /> Activate
                                        </Button>
                                      )}
                                      {allScenes && allScenes.length > 1 && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleDeleteScene(scene.id)}
                                          disabled={deleteSceneMutation.isPending}
                                          className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                                          data-testid={`button-delete-scene-${scene.id}`}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="p-3 text-center text-stone-500 text-sm border border-dashed border-stone-700 rounded">
                                Drag scenes here
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Unfiled Scenes */}
                  <div
                    className={`bg-stone-850 rounded-lg border border-stone-700 p-2 transition-colors ${draggingSceneId ? 'border-dashed' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-amber-500'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-amber-500'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-amber-500');
                      const sceneId = e.dataTransfer.getData('text/plain');
                      if (sceneId) {
                        moveSceneToFolderMutation.mutate({ sceneId, folderId: null });
                        setDraggingSceneId(null);
                      }
                    }}
                    data-testid="scene-folder-unfiled"
                  >
                    <div className="flex items-center gap-2 p-2 text-stone-400">
                      <Layers className="h-4 w-4" />
                      <span className="font-medium">Unfiled Scenes</span>
                      <span className="text-xs text-stone-500">({unfiledScenes.length})</span>
                    </div>
                    <div className="space-y-2 mt-2">
                      {unfiledScenes.length > 0 ? (
                        unfiledScenes.map((scene: Scene) => {
                          const isViewing = gmViewingSceneId === scene.id || (!gmViewingSceneId && scene.id === campaignActiveSceneId);
                          const isActive = scene.id === campaignActiveSceneId;
                          
                          return (
                            <div
                              key={scene.id}
                              className={`p-3 rounded border transition-all ${
                                isViewing ? 'bg-blue-900/30 border-blue-700' : 'bg-stone-800 border-stone-700'
                              }`}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', scene.id);
                                setDraggingSceneId(scene.id);
                              }}
                              onDragEnd={() => setDraggingSceneId(null)}
                              data-testid={`scene-item-${scene.id}`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <GripVertical className="h-4 w-4 text-stone-500 cursor-grab shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-stone-200 truncate">{scene.name}</div>
                                  <div className="text-xs text-stone-400">
                                    {scene.gridEnabled ? `${scene.gridType} grid` : 'Grid disabled'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {isViewing && (
                                  <span className="text-xs text-blue-400 font-bold px-2 py-0.5 bg-blue-900/30 rounded flex items-center gap-1">
                                    <Eye className="h-3 w-3" /> Viewing
                                  </span>
                                )}
                                {isActive && (
                                  <span className="text-xs text-amber-400 font-bold px-2 py-0.5 bg-amber-900/30 rounded flex items-center gap-1">
                                    <Radio className="h-3 w-3" /> Active
                                  </span>
                                )}
                                <div className="flex-1" />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewScene(scene.id)}
                                  className="h-7 px-2 bg-blue-900/30 border-blue-700 hover:bg-blue-800/50 text-blue-200"
                                  data-testid={`button-view-scene-${scene.id}`}
                                >
                                  <Eye className="h-3 w-3 mr-1" /> View
                                </Button>
                                {!isActive && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleActivateScene(scene.id)}
                                    disabled={setActiveSceneMutation.isPending}
                                    className="h-7 px-2 bg-amber-900/30 border-amber-700 hover:bg-amber-800/50 text-amber-200"
                                    data-testid={`button-activate-scene-${scene.id}`}
                                  >
                                    <Radio className="h-3 w-3 mr-1" /> Activate
                                  </Button>
                                )}
                                {allScenes && allScenes.length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteScene(scene.id)}
                                    disabled={deleteSceneMutation.isPending}
                                    className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                                    data-testid={`button-delete-scene-${scene.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 text-center text-stone-500 text-sm">
                          {allScenes && allScenes.length > 0 ? 'All scenes are in folders' : 'No scenes yet'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scene Settings Section */}
                <div className="space-y-4 pt-4 border-t border-stone-700">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-stone-300 font-bold text-lg">Scene Settings</Label>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-blue-400 flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Viewing: {activeScene.name}
                      </span>
                      {campaignActiveSceneId && (
                        <span className="text-xs text-stone-500">
                          Active for Players: {allScenes?.find((s: Scene) => s.id === campaignActiveSceneId)?.name || 'None'}
                        </span>
                      )}
                    </div>
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

      {/* Sandbox Floating Sheet Editors */}
      {isSandbox && openSandboxSheets.map((sheet) => (
        <SandboxSheetEditor
          key={sheet.id}
          item={sheet}
          campaignId={effectiveCampaignId!}
          onClose={() => setOpenSandboxSheets(prev => prev.filter(s => s.id !== sheet.id))}
          isMobile={isMobile}
          templates={sandboxTemplatesList as any[]}
          role={role}
        />
      ))}

      {/* Floating Notes Editor */}
      {floatingNotesOpen && effectiveCampaignId && (
        <FloatingNotesEditor
          campaignId={effectiveCampaignId}
          initialNoteId={floatingNotesInitialNoteId}
          position={floatingNotesPosition}
          size={floatingNotesSize}
          collapsed={floatingNotesCollapsed}
          onPositionChange={setFloatingNotesPosition}
          onSizeChange={setFloatingNotesSize}
          onCollapsedChange={setFloatingNotesCollapsed}
          onClose={() => setFloatingNotesOpen(false)}
          campaignMembers={(members as any[] || [])
            .filter((m: any) => m.userId !== user?.id)
            .map((m: any) => ({ id: m.id, userId: m.userId, username: m.username }))}
          onViewCharacter={(character) => {
            if (character) {
              setCharacterSheetDefaultTab("overview");
              openCharacterSheet(character);
            }
          }}
        />
      )}

      {/* Campaign Species Sheet (GM Only) */}
      {role === 'gm' && (
        <Sheet open={campaignSpeciesOpen} onOpenChange={setCampaignSpeciesOpen}>
          <SheetContent className="bg-stone-900 border-stone-700 text-stone-200 w-full sm:max-w-md overflow-y-auto custom-scrollbar">
            <SheetHeader>
              <SheetTitle className="text-amber-500 font-display text-xl sm:text-2xl">Campaign Species</SheetTitle>
            </SheetHeader>
            
            <ScrollArea className="h-[calc(100vh-100px)] pr-4">
              <div className="mt-6 space-y-6">
                <p className="text-stone-400 text-sm">
                  Create custom species for this campaign. Players can select these species when creating characters.
                </p>

                <Button
                  onClick={() => {
                    setEditingSpecies(null);
                    setSpeciesFormOpen(true);
                  }}
                  className="w-full bg-amber-700 hover:bg-amber-600"
                  data-testid="button-create-species"
                >
                  <Plus className="mr-2 h-4 w-4" /> Create Species
                </Button>

                <div className="space-y-3">
                  {campaignSpeciesList.length > 0 ? (
                    campaignSpeciesList.map((species: CampaignSpecies) => (
                      <div
                        key={species.id}
                        className="p-4 bg-stone-800 rounded-lg border border-stone-700"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {species.defaultImage ? (
                              <img 
                                src={species.defaultImage} 
                                alt={species.name} 
                                className="w-10 h-10 rounded-full object-cover border border-stone-600"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-stone-700 flex items-center justify-center">
                                <Dna className="h-5 w-5 text-stone-500" />
                              </div>
                            )}
                            <div>
                              <h3 className="font-bold text-stone-100">{species.name}</h3>
                              <p className="text-xs text-stone-400">
                                HP: {species.startingMaxHp} | Speed: {species.speed}ft | {species.size}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingSpecies(species);
                                setSpeciesFormOpen(true);
                              }}
                              className="h-8 w-8 text-stone-400 hover:text-white"
                              data-testid={`button-edit-species-${species.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingSpecies(species)}
                              className="h-8 w-8 text-red-400 hover:text-red-300"
                              data-testid={`button-delete-species-${species.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {species.description && (
                          <p className="mt-2 text-sm text-stone-400 line-clamp-2">
                            {species.description}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-stone-500">
                      <Dna className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No campaign species yet</p>
                      <p className="text-xs mt-1">Create species unique to your campaign</p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )}

      {/* Campaign Species Form Dialog */}
      {role === 'gm' && (
        <CampaignSpeciesFormDialog
          open={speciesFormOpen}
          onOpenChange={setSpeciesFormOpen}
          onSave={(data) => {
            if (editingSpecies) {
              updateCampaignSpeciesMutation.mutate({ id: editingSpecies.id, data });
            } else {
              createCampaignSpeciesMutation.mutate(data);
            }
          }}
          initialData={editingSpecies}
          isLoading={createCampaignSpeciesMutation.isPending || updateCampaignSpeciesMutation.isPending}
          featTrees={featTrees}
        />
      )}

      {/* Delete Species Confirmation */}
      <AlertDialog open={!!deletingSpecies} onOpenChange={(open) => !open && setDeletingSpecies(null)}>
        <AlertDialogContent className="bg-stone-900 border-stone-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">Delete Species</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              Are you sure you want to delete "{deletingSpecies?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingSpecies && deleteCampaignSpeciesMutation.mutate(deletingSpecies.id)}
              className="bg-red-900 hover:bg-red-800 text-white"
              disabled={deleteCampaignSpeciesMutation.isPending}
            >
              {deleteCampaignSpeciesMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Token Dialog */}
      {role === 'gm' && (
        <Dialog open={addTokenDialogOpen} onOpenChange={setAddTokenDialogOpen}>
          <DialogContent className="bg-stone-950 border-stone-800 text-stone-200 max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-amber-500 font-display text-xl">Add Token to Battlemap</DialogTitle>
              <DialogDescription className="text-stone-400">
                Select a character to place on the battlemap
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-2 mt-4">
              {characters && (characters as any[]).length > 0 ? (
                (characters as any[]).map((char: any) => (
                  <div
                    key={char.id}
                    className="flex items-center gap-3 p-3 bg-stone-900 border border-stone-800 rounded-lg hover:border-amber-600/50 cursor-pointer transition-colors"
                    onClick={() => {
                      handleAddCharacterToken(char);
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
      )}

      {/* Game View - Always visible for all campaign members */}
      <div 
        className="flex flex-col h-full w-full"
      >
        
        {/* Map Area - Takes full space, but HUD overlays it */}
        <div ref={battlemapContainerRef} className="relative flex-grow w-full bg-stone-900 z-0 overflow-hidden"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/sandbox-actor')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            const actorData = e.dataTransfer.getData('application/sandbox-actor');
            if (actorData && isSandbox) {
              e.preventDefault();
              try {
                const actor = JSON.parse(actorData);
                const rect = e.currentTarget.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const worldX = currentView.x + (screenX - rect.width / 2) / currentView.zoom;
                const worldY = currentView.y + (screenY - rect.height / 2) / currentView.zoom;
                createTokenMutation.mutate({
                  type: 'npc',
                  x: Math.round(worldX),
                  y: Math.round(worldY),
                  image: goblinToken,
                  label: actor.name,
                });
              } catch (err) {
                console.error('Failed to handle actor drop:', err);
              }
            }
          }}
        >
           <BattleMap 
             tokens={tokens} 
             onMoveToken={handleMoveToken} 
             onTokenClick={handleTokenClick}
             onTokenDoubleClick={handleTokenDoubleClick}
             onTokenTripleClick={handleTokenTripleClick}
             onDeleteToken={handleDeleteToken}
             role={role} 
             gridSize={activeScene?.gridSize || 50}
             backgroundImage={currentMap}
             scene={activeScene}
             onViewChange={setCurrentView}
             characters={characters as any[]}
             allSpecies={[...(systemSpecies || []), ...campaignSpeciesList].map(s => ({ name: s.name, size: s.size }))}
             selectionMode={selectionMode}
             targetedTokenId={targetedTokenId}
             selectedTokenId={selectedTokenId}
             aoeTargetState={aoeTargetState}
             onAoeMouseMove={updateAoeCenter}
             onAoeClick={handleAoeClick}
             otherPlayersAoe={otherPlayersAoe}
             myPermissions={myPermissions}
             tokenActiveEffects={tokenActiveEffectsQuery.data}
             allTokenEffects={tokenEffectsQuery.data}
             onApplyEffect={handleApplyEffect}
             onRemoveEffect={handleRemoveEffect}
             onToggleInvisibility={handleToggleInvisibility}
             currentTurnCharacterId={currentTurnCharacterId}
             otherPlayersTargeting={otherPlayersTargeting}
             activeBeacons={activeBeacons}
             onBeacon={handleBeacon}
             otherPlayersViewports={otherPlayersViewports}
             thrownItems={thrownItems}
             onRefetchThrownItems={() => queryClient.invalidateQueries({ queryKey: ['thrown-items', activeScene?.id] })}
             onDeleteThrownItem={async (thrownItemId) => {
               try {
                 await api.deleteThrownItem(thrownItemId);
                 queryClient.invalidateQueries({ queryKey: ['thrown-items', activeScene?.id] });
               } catch (err) {
                 console.error('Failed to delete thrown item:', err);
               }
             }}
             throwableGridTarget={throwableGridTarget}
             onGridTargetClick={handleGridTargetClick}
             notesPanelOpen={sidePanelOpen}
             notesPanelWidth={notesPanelWidth}
             
             inCombat={initiativeData?.inCombat ?? false}
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
             notesPanelOpen={sidePanelOpen}
             notesPanelWidth={notesPanelWidth}
           />
           
           {/* AOE Width Control Panel - Shows when line or cone AOE is active */}
           {aoeTargetState.active && aoeTargetState.spell && (() => {
             const aoeField = aoeTargetState.spell.aoe || '';
             let aoeShape = 'circle';
             if (aoeField && typeof aoeField === 'string' && aoeField.includes(':')) {
               const [parsedShape] = aoeField.split(':');
               aoeShape = (parsedShape || 'circle').toLowerCase();
             } else if (aoeTargetState.spell.aoeShape) {
               aoeShape = (aoeTargetState.spell.aoeShape || 'circle').toLowerCase();
             }
             
             if (aoeShape === 'line' || aoeShape === 'cone') {
               return (
                 <div 
                   className="absolute top-72 z-30 pointer-events-auto bg-stone-900/95 border border-stone-700 rounded-lg p-3 shadow-xl w-48 transition-all duration-300 ease-in-out"
                   style={{ left: '8px' }}
                 >
                   <div className="flex items-center justify-between mb-2">
                     <span className="text-xs text-amber-400 font-medium">{aoeTargetState.spell.name}</span>
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={exitAoeMode}
                       className="h-6 w-6 p-0 text-stone-400 hover:text-white hover:bg-stone-700"
                       data-testid="button-cancel-aoe"
                     >
                       ×
                     </Button>
                   </div>
                   <Label className="text-xs text-stone-400 mb-1 block">Width (ft)</Label>
                   <div className="flex items-center gap-2">
                     <Input
                       type="number"
                       min={5}
                       max={30}
                       step={5}
                       value={aoeTargetState.width || 5}
                       onChange={(e) => {
                         const newWidth = Math.max(5, Math.min(30, parseInt(e.target.value) || 5));
                         setAoeTargetState(prev => ({ ...prev, width: newWidth }));
                       }}
                       className="h-8 text-sm bg-stone-800 border-stone-600"
                       data-testid="input-aoe-width"
                     />
                     <span className="text-xs text-stone-500">ft</span>
                   </div>
                   <p className="text-xs text-stone-500 mt-1">
                     {aoeShape === 'line' ? 'Line width' : 'Cone base width'}
                   </p>
                   {aoeTargetState.locked && (
                     <p className="text-xs text-green-400 mt-2">✓ Position locked - cast spell to damage</p>
                   )}
                 </div>
               );
             }
             return null;
           })()}
           
           {/* Hotbars Display - only show when there's a character to display */}
           {/* For players: show ONLY their assigned character (not changed by token clicks) */}
           {/* For GMs: show inspectedChar (clicked token) */}
           {!isSandbox && (role === 'gm' ? inspectedChar : character) && (
             <BattleMapHotbars 
               character={role === 'gm' ? inspectedChar : character}
               tokens={tokens}
               targetedTokenId={targetedTokenId}
               characters={characters as any[]}
               gridSize={activeScene?.gridSize || 50}
               onEnterAoeMode={enterAoeMode}
               aoeTargetState={aoeTargetState}
               sceneId={activeScene?.id}
               thrownItems={thrownItems}
               onRefetchThrownItems={() => queryClient.invalidateQueries({ queryKey: ['thrown-items', activeScene?.id] })}
               onEnterThrowableAoeMode={(item, casterToken) => {
                 const aoeRange = item.throwableAoeRange || 15;
                 const aoeShape = (item.throwableAoeShape || 'circle').toLowerCase();
                 setAoeTargetState({
                   active: true,
                   spell: null,
                   throwableItem: item,
                   casterTokenId: casterToken?.id || casterToken,
                   center: { x: casterToken?.x || 0, y: casterToken?.y || 0 },
                   locked: false,
                 });
               }}
               throwableGridTarget={throwableGridTarget}
               onClearThrowableGridTarget={() => setThrowableGridTarget(null)}
               notesPanelOpen={sidePanelOpen}
               notesPanelWidth={notesPanelWidth}
             />
           )}
          
          {/* Character Sheet Tab Buttons - Right side, aligned with hotbar buttons (visible when character/inspectedChar exists) */}
          {/* For players: show ONLY when they have an assigned character */}
          {!isSandbox && ((role === 'player' && character) || (role === 'gm' && inspectedChar)) && (
            <div 
              className="absolute top-44 z-20 flex flex-col gap-2 transition-all duration-300 ease-in-out"
              style={{ right: sidePanelOpen && !isMobile ? `${notesPanelWidth + 16}px` : '12px' }}
            >
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

      {/* Character Sheet - Dialog on mobile (single), FloatingPanel on desktop (multiple) */}
      {!isSandbox && (isMobile ? (
        <Dialog open={openCharacterSheets.length > 0} onOpenChange={(open) => !open && setOpenCharacterSheets([])}>
          <DialogContent className="w-full h-full max-w-full max-h-full bg-stone-900 border-stone-700 text-stone-200 p-0 rounded-none flex flex-col">
            <DialogHeader className="p-4 pb-0 shrink-0">
              <DialogTitle className="text-lg text-amber-500 font-display truncate pr-8">
                {openCharacterSheets[0]?.name}
              </DialogTitle>
            </DialogHeader>
            {openCharacterSheets[0] && (
              <CharacterSheet
                character={openCharacterSheets[0]}
                isGM={role === 'gm'}
                isOwner={
                  openCharacterSheets[0].userId === user?.id || 
                  myPermissions?.permissions?.[openCharacterSheets[0].id] === 'edit'
                }
                isAdmin={isAdmin}
                accessLevel={
                  openCharacterSheets[0].userId === user?.id ? 'owner' :
                  (myPermissions?.permissions?.[openCharacterSheets[0].id] as 'name' | 'view' | 'edit' | undefined) || 'view'
                }
                onUpdate={(updates) => handleUpdateCharacterById(openCharacterSheets[0].id, updates)}
                onClose={() => setOpenCharacterSheets([])}
                defaultTab={characterSheetDefaultTab}
                campaignId={effectiveCampaignId || undefined}
                sceneId={activeScene?.id}
                allSpecies={[...(systemSpecies || []), ...campaignSpeciesList]}
              />
            )}
          </DialogContent>
        </Dialog>
      ) : (
        openCharacterSheets.map((sheet, index) => (
          <FloatingPanel
            key={sheet.id}
            open={true}
            onClose={() => closeCharacterSheet(sheet.id)}
            title={sheet.name}
            defaultSize={{ width: 720, height: window.innerHeight * 0.8 }}
            defaultPosition={{ x: 100 + (index * 30), y: 50 + (index * 30) }}
            minWidth={400}
            minHeight={400}
            zIndex={40 + index}
          >
            <CharacterSheet
              character={sheet}
              isGM={role === 'gm'}
              isOwner={
                sheet.userId === user?.id || 
                myPermissions?.permissions?.[sheet.id] === 'edit'
              }
              isAdmin={isAdmin}
              accessLevel={
                sheet.userId === user?.id ? 'owner' :
                (myPermissions?.permissions?.[sheet.id] as 'name' | 'view' | 'edit' | undefined) || 'view'
              }
              onUpdate={(updates) => handleUpdateCharacterById(sheet.id, updates)}
              onClose={() => closeCharacterSheet(sheet.id)}
              defaultTab={characterSheetDefaultTab}
              campaignId={effectiveCampaignId || undefined}
              sceneId={activeScene?.id}
              allSpecies={[...(systemSpecies || []), ...campaignSpeciesList]}
            />
          </FloatingPanel>
        ))
      ))}
      
      {/* Initiative Tracker Dialog */}
      <InitiativeTracker
        open={initiativeTrackerOpen}
        onOpenChange={setInitiativeTrackerOpen}
        sceneId={activeScene?.id}
        campaignId={effectiveCampaignId || undefined}
        isGM={role === 'gm'}
        characters={characters as any[]}
        userId={user?.id}
      />
      
      {/* Unified Side Panel */}
      {activeSidePanel && !sidePanelMinimized && (
        <div 
          className={`fixed top-0 right-0 z-40 pointer-events-auto flex flex-row-reverse ${isMobile ? 'inset-0' : 'h-full'}`}
          style={{ 
            width: isMobile ? '100vw' : `${notesPanelWidth}px`,
            maxWidth: isMobile ? '100vw' : '90vw' 
          }}
        >
          <div className="flex-1 h-full bg-stone-900/95 border-l border-stone-700 backdrop-blur-sm flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-stone-800 shrink-0">
              <h2 className="text-amber-500 font-display text-lg font-bold">
                {activeSidePanel === 'chat' && 'Adventure Log'}
                {activeSidePanel === 'characters' && 'Characters'}
                {activeSidePanel === 'notes' && 'Notes'}
                {activeSidePanel === 'settings' && 'Settings'}
                {activeSidePanel === 'scene' && 'Scenes'}
                {activeSidePanel === 'initiative' && 'Initiative'}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidePanelMinimized(true)}
                className="h-8 w-8 text-stone-400 hover:text-white"
                data-testid="button-minimize-panel"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              {activeSidePanel === 'chat' && effectiveCampaignId && (
                <SidePanelChat 
                  campaignId={effectiveCampaignId} 
                  role={role}
                />
              )}
              {activeSidePanel === 'characters' && effectiveCampaignId && (
                <div className="h-full p-4 pt-3 overflow-hidden">
                  {isSandbox ? (
                    <SandboxCharactersContent 
                      campaignId={effectiveCampaignId} 
                      onOpenActor={(actor) => {
                        setOpenSandboxSheets(prev => {
                          if (prev.find(s => s.id === actor.id)) return prev;
                          return [...prev, { ...actor, type: 'actor' as const }];
                        });
                      }}
                      onOpenTemplate={(template) => {
                        setOpenSandboxSheets(prev => {
                          if (prev.find(s => s.id === template.id)) return prev;
                          return [...prev, { ...template, type: 'template' as const }];
                        });
                      }}
                    />
                  ) : (
                    <div className="text-stone-500 text-center italic text-sm pt-8">
                      Character management panel
                    </div>
                  )}
                </div>
              )}
              {activeSidePanel === 'notes' && effectiveCampaignId && (
                <div className="h-full overflow-y-auto p-3">
                  <NotesFolderBrowser
                    campaignId={effectiveCampaignId}
                    onSelectNote={(noteId) => {
                      setFloatingNotesInitialNoteId(noteId);
                      setFloatingNotesOpen(true);
                    }}
                  />
                </div>
              )}
              {activeSidePanel === 'settings' && effectiveCampaignId && (
                <div className="h-full overflow-y-auto p-3">
                  <CampaignMenu 
                    campaignId={effectiveCampaignId}
                    role={role} 
                    inviteCode={(campaign && typeof campaign === 'object' && 'inviteCode' in campaign ? campaign.inviteCode as string : "") || ""}
                    hotbarSlots={(campaign && typeof campaign === 'object' && 'hotbarSlots' in campaign ? (campaign as any).hotbarSlots as number : 5) || 5}
                    inspectedChar={inspectedChar}
                    onInspectChar={setInspectedChar}
                    onAddCharacterToken={handleAddCharacterToken}
                    onChangeMap={handleChangeMap}
                    characters={characters as any[]}
                    members={members as any[]}
                    onAddCharacter={handleAddCharacter}
                    onViewCharacter={handleViewCharacter}
                    onLevelUpAll={handleLevelUpAll}
                    chatOpen={false}
                    onChatOpenChange={() => {}}
                    onAssignCharacter={handleAssignCharacter}
                    myPermissions={myPermissions}
                    onOpenCampaignSpecies={() => setCampaignSpeciesOpen(true)}
                    isOwner={!!(campaign && typeof campaign === 'object' && 'gmUserId' in campaign && (campaign as any).gmUserId === user?.id)}
                    gmUserId={(campaign && typeof campaign === 'object' && 'gmUserId' in campaign ? (campaign as any).gmUserId as string : undefined)}
                    beaconColor={myMembership?.beaconColor || '#FBB524'}
                    onChangeBeaconColor={() => {
                      setPendingBeaconColor(myMembership?.beaconColor || '#FBB524');
                      setBeaconColorDialogOpen(true);
                    }}
                    system={isSandbox ? 'sandbox' : 'arcana-adventure'}
                    defaultPanel={(campaign && typeof campaign === 'object' && 'defaultPanel' in campaign ? (campaign as any).defaultPanel as string : 'characters') || 'characters'}
                    onDefaultPanelChange={(panel: string) => {
                      if (effectiveCampaignId) {
                        api.updateCampaign(effectiveCampaignId, { defaultPanel: panel } as any);
                        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${effectiveCampaignId}`] });
                      }
                    }}
                    inline={true}
                  />
                </div>
              )}
              {activeSidePanel === 'initiative' && (
                <div className="h-full overflow-y-auto p-3">
                  <InitiativeTracker
                    open={true}
                    onOpenChange={() => {}}
                    sceneId={activeScene?.id}
                    campaignId={effectiveCampaignId || undefined}
                    isGM={role === 'gm'}
                    characters={characters as any[]}
                    userId={user?.id}
                    inline={true}
                  />
                </div>
              )}
              {activeSidePanel === 'scene' && role === 'gm' && (
                <div className="h-full overflow-y-auto p-3 space-y-3">
                  <div className="space-y-2">
                    <Label className="text-stone-300 text-xs font-bold">New Scene</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newSceneName}
                        onChange={(e) => setNewSceneName(e.target.value)}
                        placeholder="Scene name..."
                        className="flex-1 bg-stone-800 border-stone-700 text-stone-200 h-8 text-sm"
                        onKeyPress={(e) => e.key === 'Enter' && handleCreateScene()}
                        data-testid="input-side-new-scene-name"
                      />
                      <Button
                        size="sm"
                        onClick={handleCreateScene}
                        disabled={!newSceneName.trim() || createSceneMutation.isPending}
                        className="bg-amber-700 hover:bg-amber-600 h-8 px-2"
                        data-testid="button-side-create-scene"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-stone-300 text-xs font-bold">New Folder</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newSceneFolderName}
                        onChange={(e) => setNewSceneFolderName(e.target.value)}
                        placeholder="Folder name..."
                        className="flex-1 bg-stone-800 border-stone-700 text-stone-200 h-8 text-sm"
                        onKeyPress={(e) => e.key === 'Enter' && newSceneFolderName.trim() && createSceneFolderMutation.mutate(newSceneFolderName.trim())}
                        data-testid="input-side-new-scene-folder"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { if (newSceneFolderName.trim()) createSceneFolderMutation.mutate(newSceneFolderName.trim()); }}
                        disabled={!newSceneFolderName.trim() || createSceneFolderMutation.isPending}
                        className="bg-stone-800 hover:bg-stone-700 h-8 px-2"
                        data-testid="button-side-create-scene-folder"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-stone-300 text-xs font-bold">Scenes</Label>

                    {sceneFolders.map((folder: SceneFolder) => {
                      const folderScenes = getScenesInFolder(folder.id);
                      const isExpanded = expandedSceneFolders.has(folder.id);

                      return (
                        <div
                          key={folder.id}
                          className={`rounded-lg border border-stone-700 p-1.5 transition-colors ${draggingSceneId ? 'border-dashed' : ''}`}
                          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-amber-500'); }}
                          onDragLeave={(e) => { e.currentTarget.classList.remove('border-amber-500'); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('border-amber-500');
                            const sceneId = e.dataTransfer.getData('text/plain');
                            if (sceneId) {
                              moveSceneToFolderMutation.mutate({ sceneId, folderId: folder.id });
                              setDraggingSceneId(null);
                            }
                          }}
                          data-testid={`side-scene-folder-${folder.id}`}
                        >
                          <div
                            className="flex items-center justify-between p-1.5 cursor-pointer hover:bg-stone-800/50 rounded"
                            onClick={() => toggleSceneFolder(folder.id)}
                          >
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-stone-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-stone-400 shrink-0" />}
                              <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              {editingSceneFolderId === folder.id ? (
                                <Input
                                  value={editingSceneFolderName}
                                  onChange={(e) => setEditingSceneFolderName(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') updateSceneFolderMutation.mutate({ id: folder.id, name: editingSceneFolderName });
                                    else if (e.key === 'Escape') setEditingSceneFolderId(null);
                                  }}
                                  onBlur={() => {
                                    if (editingSceneFolderName.trim() && editingSceneFolderName !== folder.name) updateSceneFolderMutation.mutate({ id: folder.id, name: editingSceneFolderName });
                                    setEditingSceneFolderId(null);
                                  }}
                                  className="h-5 py-0 px-1 text-xs bg-stone-900 border-stone-600"
                                  autoFocus
                                />
                              ) : (
                                <span className="text-xs font-medium text-stone-200 truncate">{folder.name}</span>
                              )}
                              <span className="text-[10px] text-stone-500 shrink-0">({folderScenes.length})</span>
                            </div>
                            {editingSceneFolderId !== folder.id && (
                              <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingSceneFolderId(folder.id); setEditingSceneFolderName(folder.name); }} className="h-5 w-5 p-0 text-stone-400 hover:text-stone-200">
                                  <Pencil className="h-2.5 w-2.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteSceneFolderMutation.mutate(folder.id)} disabled={deleteSceneFolderMutation.isPending} className="h-5 w-5 p-0 text-red-400 hover:text-red-300">
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="mt-1 space-y-1 pl-4">
                              {folderScenes.length > 0 ? folderScenes.map((scene: Scene) => {
                                const isViewing = gmViewingSceneId === scene.id || (!gmViewingSceneId && scene.id === campaignActiveSceneId);
                                const isActive = scene.id === campaignActiveSceneId;
                                return (
                                  <div
                                    key={scene.id}
                                    className={`p-2 rounded border transition-all ${isViewing ? 'bg-blue-900/30 border-blue-700' : 'bg-stone-800 border-stone-700'}`}
                                    draggable
                                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', scene.id); setDraggingSceneId(scene.id); }}
                                    onDragEnd={() => setDraggingSceneId(null)}
                                    data-testid={`side-scene-item-${scene.id}`}
                                  >
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <GripVertical className="h-3 w-3 text-stone-500 cursor-grab shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-stone-200 truncate">{scene.name}</div>
                                        <div className="text-[10px] text-stone-400">{scene.gridEnabled ? `${scene.gridType} grid` : 'No grid'}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {isViewing && <span className="text-[10px] text-blue-400 font-bold px-1.5 py-0.5 bg-blue-900/30 rounded flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /> Viewing</span>}
                                      {isActive && <span className="text-[10px] text-amber-400 font-bold px-1.5 py-0.5 bg-amber-900/30 rounded flex items-center gap-0.5"><Radio className="h-2.5 w-2.5" /> Active</span>}
                                      <div className="flex-1" />
                                      <Button size="sm" variant="outline" onClick={() => handleViewScene(scene.id)} className="h-6 px-1.5 text-[10px] bg-blue-900/30 border-blue-700 hover:bg-blue-800/50 text-blue-200"><Eye className="h-2.5 w-2.5 mr-0.5" /> View</Button>
                                      {!isActive && <Button size="sm" variant="outline" onClick={() => handleActivateScene(scene.id)} disabled={setActiveSceneMutation.isPending} className="h-6 px-1.5 text-[10px] bg-amber-900/30 border-amber-700 hover:bg-amber-800/50 text-amber-200"><Radio className="h-2.5 w-2.5 mr-0.5" /> Set</Button>}
                                      {allScenes && allScenes.length > 1 && <Button size="sm" variant="ghost" onClick={() => handleDeleteScene(scene.id)} disabled={deleteSceneMutation.isPending} className="h-6 w-6 p-0 text-red-400 hover:text-red-300"><Trash2 className="h-2.5 w-2.5" /></Button>}
                                    </div>
                                  </div>
                                );
                              }) : (
                                <div className="p-2 text-center text-stone-500 text-[10px] border border-dashed border-stone-700 rounded">Drag scenes here</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div
                      className={`rounded-lg border border-stone-700 p-1.5 transition-colors ${draggingSceneId ? 'border-dashed' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-amber-500'); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove('border-amber-500'); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-amber-500');
                        const sceneId = e.dataTransfer.getData('text/plain');
                        if (sceneId) {
                          moveSceneToFolderMutation.mutate({ sceneId, folderId: null });
                          setDraggingSceneId(null);
                        }
                      }}
                      data-testid="side-scene-folder-unfiled"
                    >
                      <div className="flex items-center gap-1.5 p-1.5 text-stone-400">
                        <Layers className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Unfiled</span>
                        <span className="text-[10px] text-stone-500">({unfiledScenes.length})</span>
                      </div>
                      <div className="space-y-1 mt-1">
                        {unfiledScenes.length > 0 ? unfiledScenes.map((scene: Scene) => {
                          const isViewing = gmViewingSceneId === scene.id || (!gmViewingSceneId && scene.id === campaignActiveSceneId);
                          const isActive = scene.id === campaignActiveSceneId;
                          return (
                            <div
                              key={scene.id}
                              className={`p-2 rounded border transition-all ${isViewing ? 'bg-blue-900/30 border-blue-700' : 'bg-stone-800 border-stone-700'}`}
                              draggable
                              onDragStart={(e) => { e.dataTransfer.setData('text/plain', scene.id); setDraggingSceneId(scene.id); }}
                              onDragEnd={() => setDraggingSceneId(null)}
                              data-testid={`side-scene-item-${scene.id}`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <GripVertical className="h-3 w-3 text-stone-500 cursor-grab shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold text-stone-200 truncate">{scene.name}</div>
                                  <div className="text-[10px] text-stone-400">{scene.gridEnabled ? `${scene.gridType} grid` : 'No grid'}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-wrap">
                                {isViewing && <span className="text-[10px] text-blue-400 font-bold px-1.5 py-0.5 bg-blue-900/30 rounded flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" /> Viewing</span>}
                                {isActive && <span className="text-[10px] text-amber-400 font-bold px-1.5 py-0.5 bg-amber-900/30 rounded flex items-center gap-0.5"><Radio className="h-2.5 w-2.5" /> Active</span>}
                                <div className="flex-1" />
                                <Button size="sm" variant="outline" onClick={() => handleViewScene(scene.id)} className="h-6 px-1.5 text-[10px] bg-blue-900/30 border-blue-700 hover:bg-blue-800/50 text-blue-200"><Eye className="h-2.5 w-2.5 mr-0.5" /> View</Button>
                                {!isActive && <Button size="sm" variant="outline" onClick={() => handleActivateScene(scene.id)} disabled={setActiveSceneMutation.isPending} className="h-6 px-1.5 text-[10px] bg-amber-900/30 border-amber-700 hover:bg-amber-800/50 text-amber-200"><Radio className="h-2.5 w-2.5 mr-0.5" /> Set</Button>}
                                {allScenes && allScenes.length > 1 && <Button size="sm" variant="ghost" onClick={() => handleDeleteScene(scene.id)} disabled={deleteSceneMutation.isPending} className="h-6 w-6 p-0 text-red-400 hover:text-red-300"><Trash2 className="h-2.5 w-2.5" /></Button>}
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="p-2 text-center text-stone-500 text-[10px] border border-dashed border-stone-700 rounded">No unfiled scenes</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-stone-700 pt-3">
                    <Label className="text-stone-300 text-xs font-bold mb-2 block">Scene Settings</Label>
                    {activeScene ? (
                      <SceneSettingsForm
                        scene={activeScene}
                        onUpdateScene={handleUpdateScene}
                      />
                    ) : (
                      <div className="text-stone-500 text-center italic text-xs pt-4">
                        No scene selected
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {!isMobile && (
            <div
              className={`w-2 h-full cursor-ew-resize flex items-center justify-center bg-stone-700 hover:bg-amber-600 transition-colors ${isResizingNotes ? 'bg-amber-600' : ''}`}
              onPointerDown={handleNotesResizeStart}
              onPointerMove={handleNotesResizeMove}
              onPointerUp={handleNotesResizeEnd}
              onPointerCancel={handleNotesResizeEnd}
            >
              <div className="w-1 h-8 bg-stone-500 rounded-full" />
            </div>
          )}
        </div>
      )}
      
      {/* GM Character Hotbar - Bottom center of screen, desktop/tablet only */}
      {!isSandbox && role === 'gm' && !isMobile && (
        <div 
          ref={gmHotbarRef}
          className={`fixed bottom-4 z-30 pointer-events-auto transition-all duration-300 ease-in-out ${gmHotbarHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{ 
            left: sidePanelOpen ? `calc(50% - ${notesPanelWidth / 2}px)` : '50%',
            transform: 'translateX(-50%)'
          }}
          data-testid="gm-character-hotbar"
        >
          <div className="flex items-center gap-2 bg-stone-900/95 border border-stone-700 rounded-xl p-2 shadow-xl backdrop-blur-sm">
            {/* Unassign button - only visible when a character is inspected */}
            {inspectedChar && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setInspectedChar(null)}
                      className="w-10 h-10 rounded-lg border border-stone-600 bg-stone-800/50 hover:bg-red-900/50 hover:border-red-600 text-stone-400 hover:text-red-400 mr-2"
                      data-testid="button-unassign-character"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-stone-800 border-stone-700 text-stone-200">
                    <p>Unassign {inspectedChar.name}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {gmCharacterHotbar.map((characterId, index) => {
              const hotbarChar = getHotbarCharacter(index);
              const hpPercent = hotbarChar ? Math.max(0, Math.min(100, (hotbarChar.hp / hotbarChar.maxHp) * 100)) : 0;
              const energyPercent = hotbarChar ? Math.max(0, Math.min(100, (hotbarChar.energy / hotbarChar.maxEnergy) * 100)) : 0;
              return (
                <div key={index} className="relative group flex flex-col items-center">
                  <button
                    onPointerDown={() => handleHotbarPointerDown(index)}
                    onPointerUp={() => handleHotbarPointerUp(index)}
                    onPointerLeave={handleHotbarPointerLeave}
                    onPointerCancel={handleHotbarPointerLeave}
                    className={`
                      w-14 h-14 rounded-lg border-2 flex items-center justify-center
                      transition-all duration-200 hover:scale-105 select-none
                      ${hotbarChar 
                        ? 'border-amber-600 bg-stone-800 hover:border-amber-500' 
                        : 'border-stone-600 bg-stone-800/50 hover:border-stone-500 hover:bg-stone-700/50'
                      }
                    `}
                    data-testid={`gm-hotbar-slot-${index}`}
                  >
                    {hotbarChar ? (
                      hotbarChar.portrait ? (
                        <img 
                          src={hotbarChar.portrait} 
                          alt={hotbarChar.name} 
                          className="w-12 h-12 rounded-md object-cover pointer-events-none"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-amber-900/50 flex items-center justify-center">
                          <User className="h-6 w-6 text-amber-500" />
                        </div>
                      )
                    ) : (
                      <Plus className="h-6 w-6 text-stone-500" />
                    )}
                  </button>
                  {hotbarChar && (
                    <>
                      {/* HP/Energy bars under portrait */}
                      <div className="w-14 mt-1 space-y-0.5">
                        <div className="h-1.5 bg-stone-700 rounded-full overflow-hidden" title={`HP: ${hotbarChar.hp}/${hotbarChar.maxHp}`}>
                          <div 
                            className="h-full bg-red-500 transition-all duration-300"
                            style={{ width: `${hpPercent}%` }}
                          />
                        </div>
                        <div className="h-1.5 bg-stone-700 rounded-full overflow-hidden" title={`Energy: ${hotbarChar.energy}/${hotbarChar.maxEnergy}`}>
                          <div 
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${energyPercent}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-stone-400 truncate max-w-[56px] text-center mt-0.5">
                        {hotbarChar.name}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-center text-[10px] text-stone-500 mt-1">Hold to remove</div>
        </div>
      )}
      
      {/* GM Hotbar Remove Confirmation Dialog */}
      {!isSandbox && (<Dialog open={hotbarLongPressSlot !== null} onOpenChange={(open) => !open && setHotbarLongPressSlot(null)}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-amber-500">Remove from Hotbar</DialogTitle>
            <DialogDescription className="text-stone-400">
              Remove {hotbarLongPressSlot !== null ? getHotbarCharacter(hotbarLongPressSlot)?.name : ''} from the hotbar?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="ghost"
              onClick={() => setHotbarLongPressSlot(null)}
              className="text-stone-400 hover:text-stone-200"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (hotbarLongPressSlot !== null) {
                  removeCharacterFromHotbar(hotbarLongPressSlot);
                  setHotbarLongPressSlot(null);
                }
              }}
              data-testid="confirm-remove-from-hotbar"
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>)}
      
      {/* GM Character Hotbar Selector Dialog */}
      {!isSandbox && (<Dialog open={hotbarSelectorOpen !== null} onOpenChange={(open) => !open && setHotbarSelectorOpen(null)}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-md max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-amber-500">Select Character</DialogTitle>
            <DialogDescription className="text-stone-400">
              Choose a character to add to the hotbar slot
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-3 py-2">
              {characterFolders.map((folder) => {
                const folderChars = getCharactersInFolder(folder.id);
                if (folderChars.length === 0) return null;
                return (
                  <div key={folder.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-stone-400 font-medium px-1">
                      <Folder className="h-4 w-4" />
                      {folder.name}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-6">
                      {folderChars.map((char: any) => (
                        <button
                          key={char.id}
                          onClick={() => hotbarSelectorOpen !== null && addCharacterToHotbar(hotbarSelectorOpen, char.id)}
                          className="flex items-center gap-2 p-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition-colors"
                          data-testid={`hotbar-select-char-${char.id}`}
                        >
                          {char.portrait ? (
                            <img src={char.portrait} alt={char.name} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center">
                              <User className="h-4 w-4 text-stone-500" />
                            </div>
                          )}
                          <span className="text-sm text-stone-200 truncate">{char.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              
              {unfiledCharacters.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-stone-400 font-medium px-1">
                    <Users className="h-4 w-4" />
                    Unfiled Characters
                  </div>
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    {unfiledCharacters.map((char: any) => (
                      <button
                        key={char.id}
                        onClick={() => hotbarSelectorOpen !== null && addCharacterToHotbar(hotbarSelectorOpen, char.id)}
                        className="flex items-center gap-2 p-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition-colors"
                        data-testid={`hotbar-select-char-${char.id}`}
                      >
                        {char.portrait ? (
                          <img src={char.portrait} alt={char.name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center">
                            <User className="h-4 w-4 text-stone-500" />
                          </div>
                        )}
                        <span className="text-sm text-stone-200 truncate">{char.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {(!characters || (characters as any[]).length === 0) && (
                <div className="text-center py-8 text-stone-500">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No characters in this campaign</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>)}
      
      {/* Beacon Color Picker Dialog */}
      <Dialog open={beaconColorDialogOpen} onOpenChange={setBeaconColorDialogOpen}>
        <DialogContent className="bg-stone-900 border-stone-700 text-stone-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-amber-500 font-display text-xl">Choose Your Beacon Color</DialogTitle>
            <DialogDescription className="text-stone-400">
              Select a color for your beacon clicks on the battle map. Other players will see your beacons in this color.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-4">
              <div 
                className="w-16 h-16 rounded-full border-2 border-stone-600"
                style={{ backgroundColor: pendingBeaconColor }}
              />
              <div className="flex-1 space-y-2">
                <Label htmlFor="beacon-color" className="text-stone-300">Pick a color</Label>
                <Input
                  id="beacon-color"
                  type="color"
                  value={pendingBeaconColor}
                  onChange={(e) => setPendingBeaconColor(e.target.value.toUpperCase())}
                  className="h-10 p-1 bg-stone-800 border-stone-700 cursor-pointer"
                  data-testid="input-beacon-color"
                />
              </div>
            </div>
            <div className="grid grid-cols-8 gap-2">
              {['#FF5500', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FBB524',
                '#E11D48', '#7C3AED', '#2563EB', '#059669', '#D97706', '#EC4899', '#8B5CF6', '#FFFFFF'].map((color) => (
                <button
                  key={color}
                  onClick={() => setPendingBeaconColor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${pendingBeaconColor === color ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-stone-600'}`}
                  style={{ backgroundColor: color }}
                  data-testid={`preset-color-${color.replace('#', '')}`}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-6">
            <Button
              variant="ghost"
              onClick={() => setBeaconColorDialogOpen(false)}
              className="text-stone-400 hover:text-stone-200"
              data-testid="button-cancel-beacon-color"
            >
              Cancel
            </Button>
            <Button
              onClick={() => updateBeaconColorMutation.mutate(pendingBeaconColor)}
              disabled={updateBeaconColorMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-save-beacon-color"
            >
              {updateBeaconColorMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Color
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}